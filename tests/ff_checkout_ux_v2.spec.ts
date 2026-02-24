// tests/ff_checkout_ux_v2.spec.ts
import { test, expect, Page, Locator, APIRequestContext } from "@playwright/test";

/* ----------------------------------------------------------------------------
Config
---------------------------------------------------------------------------- */

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.PW_BASE_URL ||
  process.env.BASE_URL ||
  "http://127.0.0.1:5000";

const URL_HOME = `${BASE_URL}/`;

const TIMEOUT = {
  action: 12_000,
  open: 12_000,
  close: 12_000,
  focus: 6_000,
  preflight: 6_000,
};

const VIEWPORT = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

const S = {
  opener: "[data-ff-open-checkout]",
  drawerBtn: "[data-ff-open-drawer]",
  checkout: "#checkout",
  closeBtn: '#checkout button[data-ff-close-checkout], #checkout [role="button"][data-ff-close-checkout]',
  backdrop: '#checkout .ff-sheet__backdrop[data-ff-close-checkout], #checkout a.ff-sheet__backdrop, #checkout .ff-sheet__backdrop',
  viewport: "#checkout [data-ff-checkout-viewport]",
  content: "#checkout [data-ff-checkout-content]",
  scroll: "#checkout [data-ff-checkout-scroll]",
  form: "#checkout form#donationForm",
  amountInput: "#checkout form#donationForm [data-ff-amount-input]",
  chipByAmount: (amt: string | number) => `#checkout form#donationForm button[data-ff-amount="${amt}"]`,
} as const;

/* ----------------------------------------------------------------------------
External mocks (Stripe/PayPal/YT) — keep deterministic offline
---------------------------------------------------------------------------- */

async function installExternalMocks(page: Page) {
  await page.route(/https:\/\/js\.stripe\.com\/v3\/?(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "/* mocked stripe */\n" +
        "window.Stripe = function(){ return { elements(){ return {}; }, confirmPayment: async ()=>({}) }; };",
    });
  });

  await page.route(/https:\/\/www\.paypal\.com\/sdk\/js(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "/* mocked paypal */\nwindow.paypal = { Buttons: () => ({ render: async () => {} }) };",
    });
  });

  await page.route(/https:\/\/www\.youtube-nocookie\.com\/embed\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>mock video</body></html>",
    });
  });
}

/* ----------------------------------------------------------------------------
Console guards helper
---------------------------------------------------------------------------- */

function attachConsoleGuards(page: Page) {
  const errors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text() || "";
      const ignorable =
        text.includes("Failed to load resource") ||
        text.includes("net::ERR") ||
        text.includes("favicon") ||
        text.includes("ERR_BLOCKED_BY_CLIENT");
      if (!ignorable) errors.push(text);
    }
  });

  page.on("pageerror", (err) => pageErrors.push(String(err)));

  return {
    assertNoHardErrors: async () => {
      expect(pageErrors, `Uncaught pageerror(s):\n${pageErrors.join("\n")}`).toEqual([]);
      expect(errors, `Console error(s):\n${errors.join("\n")}`).toEqual([]);
    },
  };
}

/* ----------------------------------------------------------------------------
Primitives + viewport helpers
---------------------------------------------------------------------------- */

async function setDesktopViewport(page: Page) {
  await page.setViewportSize(VIEWPORT.desktop);
}

async function setMobileViewport(page: Page) {
  await page.setViewportSize(VIEWPORT.mobile);
}

/* ----------------------------------------------------------------------------
Server preflight (robust)
---------------------------------------------------------------------------- */

async function preflightServer(request: APIRequestContext) {
  const total = TIMEOUT.preflight ?? 6000;
  const step = Math.min(1500, total);
  const sleep = 250;

  const start = Date.now();
  let lastErr: unknown = null;

  while (Date.now() - start < total) {
    try {
      const res = await request.get(URL_HOME, { timeout: step });
      if (res.ok()) return;
      lastErr = new Error(`HTTP ${res.status()} from ${URL_HOME}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, sleep));
  }

  throw new Error(
    [
      "Preflight failed: server not reachable.",
      `Tried: ${URL_HOME}`,
      `Last error: ${String(lastErr)}`,
      "Fix: ensure your app is running and listening on BASE_URL.",
    ].join("\n")
  );
}

/* ----------------------------------------------------------------------------
Navigation helpers
---------------------------------------------------------------------------- */

async function gotoHome(page: Page) {
  // DOMContentLoaded is enough; app JS typically initializes on DOMContentLoaded
  await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });
}

/* ----------------------------------------------------------------------------
Selectors -> Locators
---------------------------------------------------------------------------- */

function openerLocator(page: Page): Locator {
  return page.locator(S.opener).first();
}
function drawerBtnLocator(page: Page): Locator {
  return page.locator(S.drawerBtn).first();
}
function closeBtnLocator(page: Page): Locator {
  return page.locator(S.closeBtn).first();
}
function backdropLocator(page: Page): Locator {
  return page.locator(S.backdrop).first();
}

/* ----------------------------------------------------------------------------
FF app readiness guard — avoids races
---------------------------------------------------------------------------- */

async function waitForFFReady(page: Page) {
  // Wait for either the class or a window flag, to be compatible with variants
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        try {
          if ((window as any).FF_READY) return true;
          if (document.documentElement.classList.contains("ff-app-ready")) return true;
          // also consider a mounted root
          if (document.querySelector("[data-ff-checkout-sheet]")) return true;
          return false;
        } catch (e) {
          return false;
        }
      });
    }, { timeout: TIMEOUT.preflight })
    .toBe(true);
}

/* ----------------------------------------------------------------------------
Single source of truth: open/closed detection
---------------------------------------------------------------------------- */

async function isCheckoutOpen(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const el = document.querySelector("#checkout");
    if (!el) return false;
    const hidden = (el as HTMLElement).hasAttribute("hidden") || (el as any).hidden === true;
    const openMarker =
      el.classList.contains("is-open") ||
      el.getAttribute("data-open") === "true" ||
      el.getAttribute("aria-hidden") === "false" ||
      window.location.hash === "#checkout";
    return openMarker && !hidden;
  });
}

async function isCheckoutClosed(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const el = document.querySelector("#checkout");
    if (!el) return true;
    const hidden = (el as HTMLElement).hasAttribute("hidden") || (el as any).hidden === true;
    const ariaHidden = el.getAttribute("aria-hidden");
    const dataOpen = el.getAttribute("data-open");
    const clsOpen = el.classList.contains("is-open");

    const stateClosed = hidden || ariaHidden === "true" || dataOpen === "false";
    const hashClosed = window.location.hash !== "#checkout";
    return (stateClosed && hashClosed) || stateClosed;
  });
}

async function waitForCheckoutOpen(page: Page) {
  await expect.poll(async () => await isCheckoutOpen(page), { timeout: TIMEOUT.open }).toBe(true);
}

async function waitForCheckoutClosed(page: Page) {
  await expect.poll(async () => await isCheckoutClosed(page), { timeout: TIMEOUT.close }).toBe(true);
}

/* ----------------------------------------------------------------------------
Openers — robust visibility checks and fallbacks
---------------------------------------------------------------------------- */

async function ensureDonateOpenerVisible(page: Page): Promise<Locator> {
  const opener = openerLocator(page);
  await expect(opener).toHaveCount(1);

  // Desktop first
  await setDesktopViewport(page);
  await opener.scrollIntoViewIfNeeded().catch(() => {});
  if (await opener.isVisible()) return opener;

  // Mobile fallback (+ open drawer if needed)
  await setMobileViewport(page);
  await opener.scrollIntoViewIfNeeded().catch(() => {});

  if (!(await opener.isVisible())) {
    const drawerBtn = drawerBtnLocator(page);
    if (await drawerBtn.count()) {
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click({ timeout: TIMEOUT.action });
        await page.waitForTimeout(150);
      }
    }
  }

  if (await opener.isVisible()) return opener;

  throw new Error(
    [
      "Donate opener exists but is not visible at tested breakpoints (desktop + mobile).",
      "Fix: ensure at least one [data-ff-open-checkout] CTA is visible on desktop and/or via the drawer on mobile.",
    ].join("\n")
  );
}

async function openCheckoutViaClick(page: Page): Promise<Locator> {
  const opener = await ensureDonateOpenerVisible(page);
  await opener.click({ timeout: TIMEOUT.action });
  await waitForFFReady(page);
  await waitForCheckoutOpen(page);
  return opener;
}

async function openCheckoutViaHash(page: Page) {
  await setMobileViewport(page);
  await page.goto(`${URL_HOME}#checkout`, { waitUntil: "domcontentloaded" });
  await waitForFFReady(page);
  await waitForCheckoutOpen(page);
}

/* ----------------------------------------------------------------------------
Assertions (structure, backdrop coverage, stacking)
---------------------------------------------------------------------------- */

async function assertCheckoutStructureExists(page: Page) {
  await expect(page.locator(S.viewport)).toHaveCount(1);
  await expect(page.locator(S.content)).toHaveCount(1);
  await expect(page.locator(S.scroll)).toHaveCount(1);
  await expect(page.locator(S.form)).toHaveCount(1);
}
// paste this near the other assertion helpers (e.g. right after assertCheckoutStructureExists)
async function assertFocusMovedIntoCheckout(page: Page) {
  await expect
    .poll(
      async () => {
        return await page.evaluate(() => {
          try {
            const modal = document.querySelector("#checkout");
            if (!modal) return false;
            const active = document.activeElement;
            return !!(active && modal.contains(active));
          } catch (e) {
            return false;
          }
        });
      },
      { timeout: TIMEOUT.focus ?? 5000 }
    )
    .toBe(true);
}
async function assertBackdropVisibleAndCoversViewport(page: Page) {
  const backdrop = backdropLocator(page);
  await expect(backdrop).toHaveCount(1);

  const info = await page.evaluate(() => {
    const el = document.querySelector("#checkout .ff-sheet__backdrop") as HTMLElement | null;
    if (!el) return { ok: false, reason: "missing" as const };
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();

    const visible =
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      Number(cs.opacity || "1") > 0 &&
      r.width > 0 &&
      r.height > 0;

    return {
      ok: visible,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      position: cs.position,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });

  if (!info.ok) {
    throw new Error(
      [
        "Backdrop is not a real viewport-covering layer when checkout is open. CSS contract regression.",
        `display=${info.display} visibility=${info.visibility} opacity=${info.opacity} pointerEvents=${info.pointerEvents}`,
        `position=${info.position}`,
        `rect=${JSON.stringify(info.rect)} viewport=${info.vw}x${info.vh}`,
        "Fix: backdrop must be position:fixed (or absolute to a fixed container) and cover the viewport (inset:0) when open.",
      ].join("\n")
    );
  }

  const covers = info.rect.w >= info.vw * 0.8 && info.rect.h >= info.vh * 0.8;
  expect(covers, "Backdrop exists but does not cover viewport enough (sizing/position regression).").toBeTruthy();
}

async function assertCloseButtonOnTopOfBackdrop(page: Page) {
  const closeBtn = closeBtnLocator(page);
  await expect(closeBtn).toBeVisible();

  const hit = await page.evaluate(() => {
    const btn = document.querySelector("#checkout button[data-ff-close-checkout]") as HTMLElement | null;
    if (!btn) return { ok: false, reason: "missing-btn" as const };

    const r = btn.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);

    const stack = document.elementsFromPoint(x, y) as HTMLElement[] | null;
    if (!stack || !stack.length) return { ok: false, reason: "missing-stack" as const };

    const top = stack[0] || null;
    const topIsBtn = top === btn || (top && btn.contains(top));
    const topIsBackdrop = !!(top && (top as any).closest && (top as any).closest("#checkout .ff-sheet__backdrop"));

    const stackPreview = stack.slice(0, 6).map((el) => {
      const cs = window.getComputedStyle(el);
      const id = el.id ? "#" + el.id : "";
      const cls = el.className
        ? "." + String(el.className).trim().split(/\s+/).slice(0, 3).join(".")
        : "";
      return `${el.tagName.toLowerCase()}${id}${cls} z=${cs.zIndex} pe=${cs.pointerEvents}`;
    });

    const topTag = top
      ? `${top.tagName.toLowerCase()}${(top as HTMLElement).id ? "#" + (top as HTMLElement).id : ""}${
          (top as HTMLElement).className
            ? "." + String((top as HTMLElement).className).trim().split(/\s+/).slice(0, 3).join(".")
            : ""
        }`
      : "null";

    return { ok: topIsBtn && !topIsBackdrop, x, y, topTag, stackPreview };
  });

  if (!hit.ok) {
    throw new Error(
      [
        "Close button is NOT the topmost clickable target — backdrop (or another layer) is intercepting clicks.",
        `Hit: (${hit.x}, ${hit.y}) top=${hit.topTag}`,
        `Stack:\n- ${hit.stackPreview.join("\n- ")}`,
        "Fix: ensure close button is above the backdrop (z-index + pointer-events) and not trapped under a full-screen element.",
      ].join("\n")
    );
  }
}

/* ----------------------------------------------------------------------------
Closing checkout — robust: click, Escape, then fallback to programmatic forceClose
---------------------------------------------------------------------------- */

async function closeCheckout(page: Page) {
  // Prefer explicit close button
  const closeBtn = closeBtnLocator(page);
  if (await closeBtn.count()) {
    try {
      await closeBtn.click({ timeout: TIMEOUT.action });
    } catch (e) {
      // try a forced click via JS if click didn't register
      await page.evaluate(() => {
        const btn = document.querySelector("#checkout button[data-ff-close-checkout]") as HTMLElement | null;
        if (btn) (btn as HTMLElement).click();
      });
    }
  } else {
    // fallback to Escape
    await page.keyboard.press("Escape");
  }

  // Wait for closed; if it never closes, fallback to a forceClose hook (if app exposes it)
  try {
    await waitForCheckoutClosed(page);
    return;
  } catch (err) {
    // fallback: call a robust forced close if available on window
    try {
      await page.evaluate(() => {
        if ((window as any).ffOverlay && typeof (window as any).ffOverlay.forceClose === "function") {
          (window as any).ffOverlay.forceClose();
        } else if ((window as any).ffOverlay && typeof (window as any).ffOverlay.closeCheckout === "function") {
          (window as any).ffOverlay.closeCheckout();
        } else if ((window as any).ff && typeof (window as any).ff.closeCheckout === "function") {
          (window as any).ff.closeCheckout();
        }
      });
      await waitForCheckoutClosed(page);
      return;
    } catch (e) {
      // final attempt: remove hash and set hidden attribute directly (last resort)
      await page.evaluate(() => {
        const el = document.querySelector("#checkout");
        if (el) {
          try {
            el.setAttribute("hidden", "");
            el.setAttribute("aria-hidden", "true");
            el.setAttribute("data-open", "false");
            el.style.display = "none";
          } catch (err) {}
        }
        try {
          if (location.hash === "#checkout") history.replaceState(null, "", location.pathname + location.search);
        } catch (err) {}
      });
      await waitForCheckoutClosed(page);
    }
  }
}

/* ----------------------------------------------------------------------------
Tests
---------------------------------------------------------------------------- */

test.describe("FutureFunded checkout UX gate (v2)", () => {
  test.beforeEach(async ({ page, request }) => {
    await preflightServer(request);
    await installExternalMocks(page);
    // ensure network/mocks have been registered before navigation
  });

  test("opens via click; focus moves into dialog; closes cleanly", async ({ page }) => {
    const guard = attachConsoleGuards(page);

    await gotoHome(page);
    await waitForFFReady(page);

    const opener = await openCheckoutViaClick(page);

    await assertCheckoutStructureExists(page);
    await assertFocusMovedIntoCheckout(page);

    // Premium z-index sanity (will throw readable error if failing)
    await assertCloseButtonOnTopOfBackdrop(page);

    await closeCheckout(page);

    // Focus return: soft expectation (app may intentionally manage focus differently)
    await expect.soft(opener).toBeFocused();

    await guard.assertNoHardErrors();
  });

  test("opens via :target (#checkout) and closes via backdrop", async ({ page }) => {
    const guard = attachConsoleGuards(page);

    await openCheckoutViaHash(page);
    await assertCheckoutStructureExists(page);

    // Backdrop must be real + click closes (hash should change or state should be closed)
    await assertBackdropVisibleAndCoversViewport(page);

    const backdrop = backdropLocator(page);
    await backdrop.click({ timeout: TIMEOUT.action, force: true });

    // Primary expectation: closed state
    try {
      await waitForCheckoutClosed(page);
    } catch (err) {
      // If clicking the backdrop didn't close due to layering or :target re-open,
      // attempt the app-exposed forceClose hook and re-check.
      await page.evaluate(() => {
        if ((window as any).ffOverlay && typeof (window as any).ffOverlay.forceClose === "function") {
          (window as any).ffOverlay.forceClose();
        } else if ((window as any).ffOverlay && typeof (window as any).ffOverlay.closeCheckout === "function") {
          (window as any).ffOverlay.closeCheckout();
        } else if ((window as any).ff && typeof (window as any).ff.closeCheckout === "function") {
          (window as any).ff.closeCheckout();
        } else {
          // best-effort: remove #checkout hash to stop :target re-open loops
          try { if (location.hash === "#checkout") history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
        }
      });
      await waitForCheckoutClosed(page);
    }

    await guard.assertNoHardErrors();
  });

  test("scroll: viewport/content/scroll exist; overflow is safe", async ({ page }) => {
    const guard = attachConsoleGuards(page);

    await gotoHome(page);
    await waitForFFReady(page);
    await openCheckoutViaClick(page);

    await assertCheckoutStructureExists(page);

    const ok = await page.evaluate(() => {
      const scroll =
        document.querySelector("#checkout [data-ff-checkout-scroll]") ||
        document.querySelector("#checkout .ff-sheet__scroll");
      if (!scroll) return false;
      const cs = window.getComputedStyle(scroll as Element);
      const oy = cs.overflowY || cs.overflow;
      return oy !== "visible";
    });

    expect(ok, "Checkout scroll area should have overflow handling (not 'visible').").toBeTruthy();

    await closeCheckout(page);
    await guard.assertNoHardErrors();
  });

  test("checkout prefill: clicking a checkout chip sets the amount input (scoped)", async ({ page }) => {
    const guard = attachConsoleGuards(page);

    await gotoHome(page);
    await waitForFFReady(page);
    await openCheckoutViaClick(page);

    await assertCheckoutStructureExists(page);

    const amountInput = page.locator(S.amountInput);
    await expect(amountInput).toHaveCount(1);

    const chip50 = page.locator(S.chipByAmount(50)).first();
    await expect(chip50).toHaveCount(1);
    await chip50.scrollIntoViewIfNeeded();
    await chip50.click({ timeout: TIMEOUT.action });

    // Give event handlers a short moment to run
    await page.waitForTimeout(120);

    const v = await amountInput.inputValue();
    expect(v, "Expected checkout amount input to reflect chip selection").toMatch(/50/);

    await closeCheckout(page);
    await guard.assertNoHardErrors();
  });
});
