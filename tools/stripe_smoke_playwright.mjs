// tools/stripe_smoke_playwright.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.FF_BASE_URL || "http://127.0.0.1:5000/?smoke=1&v=dev";
const TIMEOUT = Number(process.env.FF_TIMEOUT_MS || 45000);
const HEADLESS = (process.env.FF_HEADLESS || "1") !== "0";
const AMOUNT = String(process.env.FF_AMOUNT || "5");
const EMAIL = String(
  process.env.FF_EMAIL || "smoke+stripe@getfuturefunded.com",
);
const NAME = String(process.env.FF_NAME || "Stripe Smoke");
const ARTIFACT_DIR = process.env.FF_ARTIFACT_DIR || "tools/.artifacts";
const TRACE = (process.env.FF_TRACE || "0") === "1";
const DEBUG =
  (process.env.FF_DEBUG || process.env.FF_DEBUG_STRIPE || "0") === "1";
const ACCEPT_SUBMITTED = (process.env.FF_ACCEPT_SUBMITTED || "0") === "1";

let ABORTED = false;

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}
function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
function log(msg) {
  process.stdout.write(`${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`⚠️ ${msg}\n`);
}
function dbg(msg) {
  if (DEBUG) process.stdout.write(`🧪 ${msg}\n`);
}

async function safe(page, fn, fallback = null) {
  try {
    return await page.evaluate(fn);
  } catch {
    return fallback;
  }
}

async function dumpStripeFrames(page) {
  const frames = page
    .frames()
    .map((f) => f.url())
    .filter(Boolean);
  return frames
    .filter((u) => /stripe|js\.stripe\.com|hooks\.stripe\.com/i.test(u))
    .slice(0, 25);
}

/**
 * Prefer Stripe "Secure … input frame" titles. This is the most stable
 * way to automate Payment Element card entry.
 */
async function fillStripePaymentElement(page) {
  log("⏳ Locating Stripe Payment Element frames…");

  // Give Stripe a moment to fully initialize its nested iframes
  await page.waitForTimeout(350);

  const byTitle = {
    number: [
      'iframe[title="Secure card number input frame"]',
      'iframe[title="Secure card number input frame (optional)"]',
    ],
    exp: [
      'iframe[title="Secure expiration date input frame"]',
      'iframe[title="Secure expiration date input frame (optional)"]',
    ],
    cvc: [
      'iframe[title="Secure CVC input frame"]',
      'iframe[title="Secure CVC input frame (optional)"]',
    ],
    postal: [
      'iframe[title="Secure postal code input frame"]',
      'iframe[title="Secure postal code input frame (optional)"]',
    ],
  };

  const tryFill = async (frameSelList, value, label) => {
    for (const frameSel of frameSelList) {
      const fl = page.frameLocator(frameSel);
      // Stripe frames usually contain a single input
      const input = fl.locator("input");
      const count = await input.count().catch(() => 0);
      if (count > 0) {
        dbg(`Found ${label} via ${frameSel}`);
        await input.first().click({ timeout: 5000 });
        // Type is often more reliable than fill for masked fields
        await input.first().pressSequentially(value, { delay: 15 });
        return true;
      }
    }
    return false;
  };

  // Try title-based first (best)
  const okNum = await tryFill(
    byTitle.number,
    "4242424242424242",
    "card number",
  );
  const okExp = await tryFill(byTitle.exp, "1234", "expiry"); // MMYY works well in automation
  const okCvc = await tryFill(byTitle.cvc, "123", "cvc");
  const okPostal = await tryFill(byTitle.postal, "78754", "postal").catch(
    () => false,
  );

  if (okNum && okExp && okCvc) {
    log("✅ Stripe fields filled (4242 / 12-34 / 123)");
    return;
  }

  // Fallback: scan stripe frames for common selectors (older integrations)
  warn("Title-based Stripe frames not found; falling back to scanning frames…");

  const cardNumberSelectors = [
    'input[name="cardnumber"]',
    'input[name="cardNumber"]',
    'input[autocomplete="cc-number"]',
  ];
  const expSelectors = [
    'input[name="exp-date"]',
    'input[name="expDate"]',
    'input[autocomplete="cc-exp"]',
  ];
  const cvcSelectors = [
    'input[name="cvc"]',
    'input[name="cardCvc"]',
    'input[autocomplete="cc-csc"]',
  ];
  const postalSelectors = [
    'input[name="postal"]',
    'input[name="postalCode"]',
    'input[autocomplete="postal-code"]',
  ];

  async function findFrameWithSelector(selectors) {
    const deadline = Date.now() + TIMEOUT;
    while (Date.now() < deadline) {
      if (ABORTED) return null;
      const frames = page
        .frames()
        .filter((f) =>
          /stripe|js\.stripe\.com|hooks\.stripe\.com/i.test(
            (f.url() || "").toLowerCase(),
          ),
        );
      for (const f of frames) {
        for (const sel of selectors) {
          try {
            const h = await f.$(sel);
            if (h) return { frame: f, selector: sel, frameUrl: f.url() };
          } catch {}
        }
      }
      await page.waitForTimeout(150);
    }
    return null;
  }

  const card = await findFrameWithSelector(cardNumberSelectors);
  if (!card) {
    const frames = await dumpStripeFrames(page);
    throw new Error(
      `Could not find card number input in Stripe frames. Stripe frames seen:\n${frames.join("\n")}`,
    );
  }
  dbg(`Card frame: ${card.frameUrl}`);
  await card.frame.fill(card.selector, "4242 4242 4242 4242");

  const exp = await findFrameWithSelector(expSelectors);
  if (!exp) throw new Error("Could not find expiry input in any Stripe frame");
  await exp.frame.fill(exp.selector, "12 / 34");

  const cvc = await findFrameWithSelector(cvcSelectors);
  if (!cvc) throw new Error("Could not find CVC input in any Stripe frame");
  await cvc.frame.fill(cvc.selector, "123");

  const postal = await findFrameWithSelector(postalSelectors);
  if (postal) await postal.frame.fill(postal.selector, "78754");

  log("✅ Stripe fields filled (4242 / 12-34 / 123)");
}

async function waitForStripeConfirmResponse(page) {
  try {
    const res = await page.waitForResponse(
      (r) => {
        const u = r.url();
        const m = r.request().method();
        return (
          m === "POST" &&
          u.includes("api.stripe.com") &&
          u.includes("/v1/payment_intents")
        );
      },
      { timeout: 20000 },
    );
    return res;
  } catch {
    return null;
  }
}

async function waitForDeterministicSuccess(page) {
  const successUI = ".ff-checkoutSuccess:not([hidden])";
  const receiptSignal = "[data-ff-checkout-receipt]:not([hidden])";

  const start = Date.now();
  while (Date.now() - start < TIMEOUT) {
    if (ABORTED) throw new Error("Aborted by SIGINT");
    if (page.isClosed())
      throw new Error("Page closed unexpectedly during success wait");

    // Strongest: JS marker
    const jsOk = await safe(
      page,
      () => window.__ffSmokeSuccess === true,
      false,
    );
    if (jsOk) return { kind: "js_marker" };

    // Dataset marker + PI attribute (strong)
    const dsOk = await safe(
      page,
      () => {
        const root = document.documentElement;
        const paid = root.getAttribute("data-ff-paid") === "true";
        const provider =
          root.getAttribute("data-ff-paid-provider") ||
          root.getAttribute("data-ff-provider") ||
          "";
        const pi = root.getAttribute("data-ff-payment-intent") || "";
        return paid && (!provider || provider === "stripe") && /^pi_/.test(pi);
      },
      false,
    );
    if (dsOk) return { kind: "dataset_pi" };

    // Visible success UI
    if (
      await page
        .locator(successUI)
        .count()
        .then((n) => n > 0)
        .catch(() => false)
    )
      return { kind: "success_ui" };

    // Optional receipts
    if (
      await page
        .locator(receiptSignal)
        .count()
        .then((n) => n > 0)
        .catch(() => false)
    )
      return { kind: "receipt" };

    // Explicit error region
    const errTxt = await page
      .locator("[data-ff-checkout-error]:not([hidden])")
      .first()
      .textContent()
      .catch(() => "");
    if ((errTxt || "").trim())
      throw new Error(`Explicit checkout error: ${(errTxt || "").trim()}`);

    await page.waitForTimeout(250);
  }

  // Evidence on failure
  const closed = await safe(
    page,
    () => {
      const el = document.querySelector("#checkout");
      if (!el) return null;
      return {
        dataOpen: el.getAttribute("data-open"),
        ariaHidden: el.getAttribute("aria-hidden"),
        hidden: el.hasAttribute("hidden"),
      };
    },
    null,
  );

  const toasts = await page
    .$$eval(".ff-toasts .ff-toast", (els) =>
      els.map((el) => ({
        cls: el.getAttribute("class") || "",
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 240),
      })),
    )
    .catch(() => []);

  const hasSubmittedToast = (toasts || []).some(
    (t) =>
      /payment submitted|donation confirmed|thank you/i.test(t.text || "") &&
      /success/i.test(t.cls || ""),
  );
  const hasErrorToast = (toasts || []).some((t) => /error/i.test(t.cls || ""));

  if (
    ACCEPT_SUBMITTED &&
    closed?.hidden === true &&
    hasSubmittedToast &&
    !hasErrorToast
  ) {
    return { kind: "submitted_fallback", closed, toasts };
  }

  const e = new Error(
    "No deterministic success signal detected (js_marker/dataset_pi/success_ui/receipt).",
  );
  e.meta = { closed, toasts };
  throw e;
}

(async () => {
  ensureDir(ARTIFACT_DIR);
  const stamp = ts();

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  const ORIGIN = new URL(BASE).origin;
  const seen404 = [];

  const shutdown = async (code = 130) => {
    if (ABORTED) return;
    ABORTED = true;
    try {
      const shot = path.join(ARTIFACT_DIR, `stripe_smoke_abort_${stamp}.png`);
      if (!page.isClosed())
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      log(`📸 Abort screenshot: ${shot}`);
    } catch {}
    try {
      if (TRACE) {
        const tracePath = path.join(
          ARTIFACT_DIR,
          `stripe_smoke_trace_${stamp}.zip`,
        );
        await context.tracing.stop({ path: tracePath }).catch(() => {});
        log(`🧾 Trace saved: ${tracePath}`);
      }
    } catch {}
    try {
      await browser.close();
    } catch {}
    process.exit(code);
  };

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  if (TRACE)
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });

  page.on("console", (m) => {
    const t = m.type();
    const txt = m.text();
    if (t === "error") process.stderr.write(`[console:error] ${txt}\n`);
    if (DEBUG && (t === "warning" || t === "log"))
      process.stdout.write(`[console:${t}] ${txt}\n`);
  });

  page.on("response", async (res) => {
    const url = res.url();
    const st = res.status();
    if (url.includes("/payments/stripe/intent"))
      log(`↩️  /payments/stripe/intent -> ${st}`);
    if (st === 404 && url.startsWith(ORIGIN)) {
      const req = res.request();
      const rt = req.resourceType ? req.resourceType() : "unknown";
      seen404.push({ url, method: req.method(), type: rt });
    }
  });

  try {
    log(`🌐 Navigating: ${BASE}`);
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

    await page.waitForFunction(
      () => !!window.__FF_APP__ && window.__FF_APP__.initialized === true,
      null,
      { timeout: TIMEOUT },
    );
    log("✅ ff-app.js initialized");

    const cfgTxt = await page
      .locator("#ffConfig")
      .first()
      .textContent()
      .catch(() => "");
    if (cfgTxt) {
      try {
        const cfg = JSON.parse(cfgTxt);
        const pk = (
          cfg?.stripePk ||
          cfg?.payments?.stripePk ||
          cfg?.payments?.stripePublishableKey ||
          ""
        )
          .toString()
          .trim();
        if (pk) {
          if (!pk.startsWith("pk_test_"))
            throw new Error(
              `Publishable key not test-mode: ${pk.slice(0, 16)}…`,
            );
          log("✅ Stripe test publishable key detected (from ffConfig)");
        }
      } catch {}
    }

    await page.waitForSelector("#ffStripeJs", {
      state: "attached",
      timeout: TIMEOUT,
    });
    await page.waitForFunction(
      () => typeof window.Stripe === "function",
      null,
      { timeout: TIMEOUT },
    );
    log("✅ Stripe.js loaded (script attached + window.Stripe)");

    // Open checkout
    await page.evaluate(() => {
      try {
        if (location.hash !== "#checkout") location.hash = "checkout";
      } catch {}
    });
    await page.waitForSelector(
      '#checkout[data-open="true"], #checkout[aria-hidden="false"], #checkout.is-open',
      { timeout: TIMEOUT },
    );
    log("✅ Checkout opened");

    await page.fill("[data-ff-email]", EMAIL);
    await page.fill("[data-ff-donor-name]", NAME);
    await page.fill("[data-ff-amount-input], #donationAmount", AMOUNT);
    log("✅ Donor fields filled");

    await page.waitForSelector(
      "#paymentElement iframe, [data-ff-payment-element] iframe, #paymentElement, [data-ff-payment-element]",
      { timeout: TIMEOUT },
    );
    log(
      "✅ Stripe Payment Element mounted (iframe detected / container present)",
    );

    await fillStripePaymentElement(page);

    const payBtn = page.locator("#payBtn, [data-ff-pay-btn]").first();
    await payBtn.waitFor({ state: "visible", timeout: TIMEOUT });

    const confirmResPromise = waitForStripeConfirmResponse(page);

    await payBtn.click();
    log("🧾 Pay clicked, waiting for success signal…");

    const confirmRes = await confirmResPromise;
    if (confirmRes)
      log(`↩️  Stripe confirm request seen -> ${confirmRes.status()}`);
    else
      warn(
        "No Stripe confirm request observed (api.stripe.com/v1/payment_intents). This usually means confirmPayment never fired.",
      );

    const success = await waitForDeterministicSuccess(page);

    // Fail if ANY same-origin 404 happened
    if (seen404.length) {
      const e = new Error(
        `Detected same-origin 404(s) during run:\n${seen404.map((x) => `- ${x.method} ${x.url} (${x.type})`).join("\n")}`,
      );
      e.meta = { seen404 };
      throw e;
    }

    const status = await page
      .getAttribute("html", "data-ff-paid-status")
      .catch(() => null);
    const pi = await page
      .getAttribute("html", "data-ff-payment-intent")
      .catch(() => null);
    log(
      `✅ Success signal detected (${success.kind})${status ? ` status=${status}` : ""}${pi ? ` pi=${pi}` : ""}`,
    );

    if (TRACE) {
      const tracePath = path.join(
        ARTIFACT_DIR,
        `stripe_smoke_trace_${stamp}.zip`,
      );
      await context.tracing.stop({ path: tracePath });
      log(`🧾 Trace saved: ${tracePath}`);
    }

    await browser.close();
    log("🎉 Stripe smoke test PASSED");
  } catch (err) {
    const shot = path.join(ARTIFACT_DIR, `stripe_smoke_fail_${stamp}.png`);
    try {
      if (!page.isClosed())
        await page.screenshot({ path: shot, fullPage: true });
    } catch {}
    process.stderr.write(
      `\n❌ Stripe smoke test FAILED: ${err && err.stack ? err.stack : err}\n`,
    );
    process.stderr.write(`📸 Screenshot: ${shot}\n`);
    if (err?.meta)
      process.stderr.write(
        `🧪 Evidence: ${JSON.stringify(err.meta, null, 2)}\n`,
      );

    try {
      if (TRACE) {
        const tracePath = path.join(
          ARTIFACT_DIR,
          `stripe_smoke_trace_${stamp}.zip`,
        );
        await context.tracing.stop({ path: tracePath }).catch(() => {});
        process.stderr.write(`🧾 Trace saved: ${tracePath}\n`);
      }
    } catch {}

    try {
      await browser.close();
    } catch {}
    process.exit(1);
  }
})();
