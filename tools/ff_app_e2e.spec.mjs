// tools/ff_app_e2e.spec.mjs
// FutureFunded • ff-app.js Production Gate (E2E + deterministic mocks)
//
// Key upgrades:
// - Hook checks allow multiple checkout triggers (expects >= 1)
// - Overlay focus asserts focus lands INSIDE #checkout
// - Payments are CONFIG-AWARE (skip when disabled unless STRICT_PAYMENTS=1)
// - Payments try to CLICK a payment method toggle to trigger init
// - Payments attach debug JSON to the HTML report on failure
//
// Usage:
//   BASE_URL=http://127.0.0.1:5000 npx playwright test tools/ff_app_e2e.spec.mjs
//   STRICT_PAYMENTS=1 BASE_URL=http://127.0.0.1:5000 npx playwright test tools/ff_app_e2e.spec.mjs

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const URL_HOME = `${BASE_URL.replace(/\/$/, "")}/`;
const STRICT_PAYMENTS = process.env.STRICT_PAYMENTS === "1";

const REQUIRED_UNIQUE_HOOKS = ["#ffConfig", ".ff-root", "#checkout"];
const REQUIRED_ANY_HOOKS = ["[data-ff-open-checkout]"];

function isIgnorableConsole(msg) {
  const t = msg.text() || "";
  if (/favicon\.ico.*404/i.test(t)) return true;
  return false;
}

async function readJsonScript(page, selector) {
  const loc = page.locator(selector);
  if (!(await loc.count())) return null;
  const txt = (await loc.first().textContent()) || "";
  const trimmed = txt.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return { __parse_error: true, __raw: trimmed.slice(0, 1000) };
  }
}

function collectStringValues(node, out = []) {
  if (!node) return out;
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node))
    node.forEach((v) => collectStringValues(v, out));
  else if (typeof node === "object")
    Object.values(node).forEach((v) => collectStringValues(v, out));
  return out;
}

function pickSelectorHints(selectorsObj, regex) {
  const strings = collectStringValues(selectorsObj, []);
  const filtered = strings.filter(
    (s) => typeof s === "string" && s.length < 200 && /[#.\[]/.test(s),
  );
  return filtered.filter((s) => regex.test(s));
}

async function countMatches(page, selector) {
  try {
    return await page.locator(selector).count();
  } catch {
    return 0;
  }
}

async function hasAnySelector(page, selectors) {
  for (const sel of selectors) {
    if (await countMatches(page, sel)) return true;
  }
  return false;
}

// Tri-state inference: true / false / null (unknown)
function inferEnabled(cfg, kind) {
  if (!cfg || typeof cfg !== "object") return null;

  const keyMatchers =
    kind === "stripe"
      ? [/stripe/i, /card/i, /payment[-_ ]?element/i]
      : [/paypal/i, /\bpp\b/i];

  const enabledMatchers = [
    /enabled/i,
    /enable/i,
    /active/i,
    /on/i,
    /available/i,
  ];

  let foundTrue = false;
  let foundFalse = false;

  const visit = (node, path = []) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const kp = [...path, k];
      const kStr = kp.join(".");

      const matchesKind = keyMatchers.some((re) => re.test(kStr));
      const matchesEnabled = enabledMatchers.some((re) => re.test(kStr));

      if (matchesKind && matchesEnabled && typeof v === "boolean") {
        if (v) foundTrue = true;
        else foundFalse = true;
      }

      if (v && typeof v === "object") visit(v, kp);
    }
  };

  visit(cfg);
  if (foundTrue) return true;
  if (foundFalse) return false;
  return null;
}

async function clickIfExists(loc) {
  if (await loc.count()) {
    const el = loc.first();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 2000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function tryActivateStripeUI(page) {
  const scope = page.locator("#checkout");
  // Try common hooks first (if your app uses them, this nails it)
  const hookCandidates = [
    '[data-ff-pay-method="stripe"]',
    '[data-ff-method="stripe"]',
    "[data-ff-stripe]",
    "[data-ff-open-stripe]",
    'input[value="stripe"]',
    'button[data-method="stripe"]',
  ];
  for (const sel of hookCandidates) {
    if (await clickIfExists(scope.locator(sel))) return true;
  }
  // Then try text-based toggles (Stripe often labeled "Card" or "Credit/Debit")
  const textCandidates = [
    scope.getByRole("button", { name: /card|credit|debit/i }),
    scope.getByRole("tab", { name: /card|credit|debit/i }),
    scope.getByText(/pay with card|credit\/debit|card/i, { exact: false }),
    scope.getByLabel(/card|credit|debit/i),
  ];
  for (const loc of textCandidates) {
    if (await clickIfExists(loc)) return true;
  }
  return false;
}

async function tryActivatePayPalUI(page) {
  const scope = page.locator("#checkout");
  const hookCandidates = [
    '[data-ff-pay-method="paypal"]',
    '[data-ff-method="paypal"]',
    "[data-ff-paypal]",
    "[data-ff-open-paypal]",
    'input[value="paypal"]',
    'button[data-method="paypal"]',
  ];
  for (const sel of hookCandidates) {
    if (await clickIfExists(scope.locator(sel))) return true;
  }
  const textCandidates = [
    scope.getByRole("button", { name: /paypal/i }),
    scope.getByRole("tab", { name: /paypal/i }),
    scope.getByText(/paypal/i, { exact: false }),
    scope.getByLabel(/paypal/i),
  ];
  for (const loc of textCandidates) {
    if (await clickIfExists(loc)) return true;
  }
  return false;
}

test.describe("FutureFunded ff-app.js gate", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // @ts-ignore
    testInfo._ffConsoleErrors = [];
    // @ts-ignore
    testInfo._ffPageErrors = [];

    page.on("pageerror", (err) => {
      // @ts-ignore
      testInfo._ffPageErrors.push(String(err?.message || err));
    });

    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnorableConsole(msg)) {
        // @ts-ignore
        testInfo._ffConsoleErrors.push(msg.text());
      }
    });
  });

  test.afterEach(async ({}, testInfo) => {
    // @ts-ignore
    const pageErrors = testInfo._ffPageErrors || [];
    // @ts-ignore
    const consoleErrors = testInfo._ffConsoleErrors || [];

    if (pageErrors.length)
      throw new Error(`Page errors:\n- ${pageErrors.join("\n- ")}`);
    if (consoleErrors.length)
      throw new Error(`Console errors:\n- ${consoleErrors.join("\n- ")}`);
  });

  test("home loads and required hooks exist", async ({ page }) => {
    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });

    for (const sel of REQUIRED_UNIQUE_HOOKS) {
      await expect(
        page.locator(sel),
        `Missing unique hook: ${sel}`,
      ).toHaveCount(1);
    }

    for (const sel of REQUIRED_ANY_HOOKS) {
      const c = await page.locator(sel).count();
      expect(
        c,
        `Expected at least 1 match for: ${sel} (got ${c})`,
      ).toBeGreaterThan(0);
      expect(c, `Suspiciously high count for: ${sel} (got ${c})`).toBeLessThan(
        250,
      );
    }

    const cfgText = await page.locator("#ffConfig").textContent();
    expect(cfgText && cfgText.trim().length > 0).toBeTruthy();
    expect(() => JSON.parse(cfgText)).not.toThrow();
  });

  test("overlay contract: clicking Donate opens checkout and updates a11y state", async ({
    page,
  }) => {
    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });

    const checkout = page.locator("#checkout");
    await expect(checkout).toHaveCount(1);

    await page.locator("[data-ff-open-checkout]").first().click();

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const el = document.querySelector("#checkout");
          if (!el) return false;
          const aria = el.getAttribute("aria-hidden");
          const dataOpen = el.getAttribute("data-open");
          const isOpenClass = el.classList.contains("is-open");
          const hidden = el.hasAttribute("hidden");
          const hashTarget = window.location.hash === "#checkout";
          const openMarker =
            aria === "false" ||
            dataOpen === "true" ||
            isOpenClass ||
            hashTarget;
          return openMarker && !hidden;
        });
      })
      .toBe(true);

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const modal = document.querySelector("#checkout");
          if (!modal) return false;
          const ae = document.activeElement;
          return !!(ae && modal.contains(ae));
        });
      })
      .toBe(true);
  });

  test("checkout prefill: clicking an amount chip sets preset amount (data-ff-amount)", async ({
    page,
  }) => {
    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });

    const chip = page
      .locator("[data-ff-amount][data-ff-open-checkout]")
      .first();
    await expect(chip).toHaveCount(1);

    const amount = await chip.getAttribute("data-ff-amount");
    expect(amount).toBeTruthy();

    await chip.click();

    const amountFieldCandidates = [
      "[data-ff-amount-input]",
      'input[name="amount"]',
      "input[data-ff-amount]",
      "#donationAmount",
    ];

    let found = false;
    for (const sel of amountFieldCandidates) {
      const loc = page.locator(sel);
      if (await loc.count()) {
        const val = await loc
          .first()
          .inputValue()
          .catch(() => "");
        if (
          val &&
          val.replace(/[^\d]/g, "") === String(amount).replace(/[^\d]/g, "")
        ) {
          found = true;
          break;
        }
      }
    }

    if (!found) {
      const needle = String(amount).replace(/[^\d]/g, "");
      const visible = await page.evaluate((n) => {
        const el = document.querySelector("#checkout");
        if (!el) return false;
        const t = (el.innerText || "").replace(/[^\d]/g, "");
        return t.includes(n);
      }, needle);
      found = !!visible;
    }

    expect(found).toBeTruthy();
  });

  test("share button does not throw and produces a usable share payload", async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      // @ts-ignore
      navigator.share =
        navigator.share ||
        (async (payload) => {
          if (!payload || !payload.url)
            throw new Error("Invalid share payload");
        });
      // @ts-ignore
      navigator.clipboard = navigator.clipboard || {};
      // @ts-ignore
      navigator.clipboard.writeText =
        navigator.clipboard.writeText ||
        (async (txt) => {
          if (!txt || typeof txt !== "string")
            throw new Error("Invalid clipboard text");
        });
    });

    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });

    const shareBtn = page.locator("[data-ff-share]").first();
    await expect(shareBtn).toHaveCount(1);

    await shareBtn.click();

    const toastCandidates = ["#ffLive", "[data-ff-live]", '[role="status"]'];
    let toastFound = false;
    for (const sel of toastCandidates) {
      if (await page.locator(sel).count()) {
        toastFound = true;
        break;
      }
    }
    expect(toastFound).toBeTruthy();
  });

  test("payments: stripe is deterministic when enabled (route hit OR mount visible)", async ({
    page,
  }, testInfo) => {
    let stripeIntentHit = false;

    await page.route(
      /\/payments\/stripe\/intent\b|\/stripe\/intent\b/i,
      async (route) => {
        stripeIntentHit = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            client_secret: "pi_test_secret_123",
            publishable_key: "pk_test_123",
          }),
        });
      },
    );

    await page.route(/https:\/\/js\.stripe\.com\/v3\/?/i, async (route) => {
      const stub = `
        window.Stripe = function(){
          return {
            elements: function(){
              return { create: function(){ return { mount(){}, unmount(){} }; } };
            },
            confirmPayment: async function(){ return { paymentIntent: { status: 'succeeded' } }; }
          };
        };
      `;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: stub,
      });
    });

    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });

    const cfg = await readJsonScript(page, "#ffConfig");
    const selectors = await readJsonScript(page, "#ffSelectors");

    const stripeFlag = inferEnabled(cfg, "stripe"); // true/false/null
    if (!STRICT_PAYMENTS && stripeFlag === false)
      test.skip(true, "Stripe disabled by ffConfig");
    if (STRICT_PAYMENTS && stripeFlag === false)
      throw new Error(
        "STRICT_PAYMENTS=1 but ffConfig indicates Stripe is disabled.",
      );

    await page.locator("[data-ff-open-checkout]").first().click();
    await page.waitForTimeout(250);

    // Try to activate Stripe UI (tabs/buttons/radios)
    const clicked = await tryActivateStripeUI(page);

    const stripeHints =
      selectors && !selectors.__parse_error
        ? pickSelectorHints(selectors, /(stripe|payment-element|card)/i)
        : [];

    const fallback = [
      "#payment-element",
      "#ffStripe",
      "[data-ff-stripe]",
      '[data-ff-payment="stripe"]',
    ];
    const candidates = [...new Set([...stripeHints, ...fallback])];

    // Attach debug info for the HTML report
    await testInfo.attach("stripe-debug.json", {
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify(
          {
            STRICT_PAYMENTS,
            stripeFlag,
            clickedPaymentToggle: clicked,
            candidates,
            stripeIntentHitAtStart: stripeIntentHit,
          },
          null,
          2,
        ),
      ),
    });

    // Decide if Stripe is expected:
    // - STRICT_PAYMENTS forces it
    // - stripeFlag true indicates it
    // - OR if a mount container is present already
    let mountVisible = await hasAnySelector(page, candidates);
    const stripeExpected =
      STRICT_PAYMENTS || stripeFlag === true || mountVisible;

    if (!stripeExpected)
      test.skip(
        true,
        "Stripe not enabled/visible in this environment (no config flag + no mount).",
      );

    // Wait for either route hit OR mount to appear
    await expect
      .poll(
        async () => {
          mountVisible = await hasAnySelector(page, candidates);
          return stripeIntentHit || mountVisible;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test("payments: paypal is deterministic when enabled (sdk stub OR mount visible)", async ({
    page,
  }, testInfo) => {
    let paypalOrderHit = false;
    let paypalCaptureHit = false;

    await page.route(
      /\/payments\/paypal\/order\b|\/paypal\/order\b/i,
      async (route) => {
        paypalOrderHit = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "ORDER_TEST_123" }),
        });
      },
    );

    await page.route(
      /\/payments\/paypal\/capture\b|\/paypal\/capture\b/i,
      async (route) => {
        paypalCaptureHit = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "COMPLETED", id: "CAPTURE_TEST_123" }),
        });
      },
    );

    // Broader PayPal SDK intercept (paypal.com or any /sdk/js)
    await page.route(/paypal\.com\/sdk\/js|\/sdk\/js/i, async (route) => {
      const stub = `
        window.paypal = {
          Buttons: function(opts){
            return {
              render: async function(sel){
                const el = document.querySelector(sel);
                if (el) el.setAttribute('data-pp-rendered', 'true');
                if (opts && opts.createOrder) await opts.createOrder();
                if (opts && opts.onApprove) await opts.onApprove({ orderID: 'ORDER_TEST_123' });
              }
            };
          }
        };
      `;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: stub,
      });
    });

    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });

    const cfg = await readJsonScript(page, "#ffConfig");
    const selectors = await readJsonScript(page, "#ffSelectors");

    const paypalFlag = inferEnabled(cfg, "paypal"); // true/false/null
    if (!STRICT_PAYMENTS && paypalFlag === false)
      test.skip(true, "PayPal disabled by ffConfig");
    if (STRICT_PAYMENTS && paypalFlag === false)
      throw new Error(
        "STRICT_PAYMENTS=1 but ffConfig indicates PayPal is disabled.",
      );

    await page.locator("[data-ff-open-checkout]").first().click();
    await page.waitForTimeout(250);

    const clicked = await tryActivatePayPalUI(page);

    const ppHints =
      selectors && !selectors.__parse_error
        ? pickSelectorHints(selectors, /(paypal|pp|paypal-button)/i)
        : [];

    const fallback = [
      "#ffPayPal",
      "[data-ff-paypal]",
      "#paypal-button-container",
      "[data-pp-rendered]",
    ];
    const candidates = [...new Set([...ppHints, ...fallback])];

    await testInfo.attach("paypal-debug.json", {
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify(
          {
            STRICT_PAYMENTS,
            paypalFlag,
            clickedPaymentToggle: clicked,
            candidates,
            paypalOrderHitAtStart: paypalOrderHit,
            paypalCaptureHitAtStart: paypalCaptureHit,
          },
          null,
          2,
        ),
      ),
    });

    let mountVisible = await hasAnySelector(page, candidates);
    const paypalExpected =
      STRICT_PAYMENTS || paypalFlag === true || mountVisible;

    if (!paypalExpected)
      test.skip(
        true,
        "PayPal not enabled/visible in this environment (no config flag + no mount).",
      );

    await expect
      .poll(
        async () => {
          mountVisible = await hasAnySelector(page, candidates);
          return mountVisible || paypalOrderHit || paypalCaptureHit;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });
});
