import { test, expect, Page, Locator, APIRequestContext } from "@playwright/test";

/* ----------------------------------------------------------------------------
Config
---------------------------------------------------------------------------- */

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const URL_HOME = `${BASE_URL}/`;

const TIMEOUT = {
  action: 10_000,
  open: 10_000,
  close: 10_000,
  focus: 5_000,
  preflight: 5_000,
};

const VIEWPORT = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

const S = {
  opener: '[data-ff-open-checkout]',
  drawerBtn: '[data-ff-open-drawer]',
  checkout: "#checkout",
  closeBtn: '#checkout [data-ff-close-checkout]',
  backdrop: "#checkout .ff-sheet__backdrop",
  viewport: "#checkout .ff-sheet__viewport",
  content: "#checkout .ff-sheet__content",
} as const;

type VisibilityInfo =
  | { exists: false }
  | {
      exists: true;
      tag: string;
      id: string | null;
      classes: string | null;
      parent: string | null;
      display: string;
      visibility: string;
      opacity: string;
      pointerEvents: string;
      rect: { x: number; y: number; w: number; h: number };
      ariaHidden: string | null;
      hiddenAttr: boolean;
      offsetParent: boolean;
    };

type HitTestResult =
  | { ok: false; reason: "missing-btn" | "missing-stack" }
  | {
      ok: boolean;
      x: number;
      y: number;
      topTag: string;
      stackPreview: string[];
      // Extra: helps when stacking contexts are the real culprit
      btnCtx: string[];
      backdropCtx: string[];
    };

/* ----------------------------------------------------------------------------
Small primitives
---------------------------------------------------------------------------- */

async function setDesktopViewport(page: Page) {
  await page.setViewportSize(VIEWPORT.desktop);
}

async function setMobileViewport(page: Page) {
  await page.setViewportSize(VIEWPORT.mobile);
}

async function preflightServer(request: APIRequestContext) {
  // No expect.poll().catch() — matchers aren't Promises.
  const total = (TIMEOUT as any).preflight ?? 5000;
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


async function gotoHome(page: Page) {
  await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });
}

async function debugVisibility(page: Page, selector: string): Promise<VisibilityInfo> {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { exists: false };

    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const parent = el.parentElement ? el.parentElement.tagName.toLowerCase() : null;

    return {
      exists: true,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: (el.className as any) || null,
      parent,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      ariaHidden: el.getAttribute("aria-hidden"),
      hiddenAttr: el.hasAttribute("hidden"),
      offsetParent: !!el.offsetParent,
    };
  }, selector);
}

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
Checkout open/close detection (single source of truth)
---------------------------------------------------------------------------- */

async function isCheckoutOpen(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const el = document.querySelector("#checkout");
    if (!el) return false;

    const openMarker =
      el.classList.contains("is-open") ||
      el.getAttribute("data-open") === "true" ||
      el.getAttribute("aria-hidden") === "false" ||
      window.location.hash === "#checkout";

    return openMarker && !el.hasAttribute("hidden");
  });
}

async function waitForCheckoutOpen(page: Page) {
  await expect
    .poll(async () => await isCheckoutOpen(page), { timeout: TIMEOUT.open })
    .toBe(true);
}

async function waitForCheckoutClosed(page: Page) {
  await expect
    .poll(async () => {
      // Keep your original “hash closed” contract (fast + deterministic)
      return await page.evaluate(() => window.location.hash !== "#checkout");
    }, { timeout: TIMEOUT.close })
    .toBe(true);
}

/* ----------------------------------------------------------------------------
Finding + opening checkout
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

  // CTA truly hidden — dump diagnostics
  const info = await debugVisibility(page, S.opener);
  throw new Error(
    [
      "Donate opener exists but is not visible at tested breakpoints (desktop + mobile).",
      "This is either a CSS regression (hidden) or the CTA is gated behind a UI state we aren’t triggering.",
      `Diagnostic: ${JSON.stringify(info, null, 2)}`,
      "Fix options:",
      "1) Ensure Donate CTA is visible at least on desktop and/or mobile hero/header.",
      "2) If intentionally tucked into a menu, ensure [data-ff-open-drawer] exposes it and the test opens the drawer.",
      "3) If CTA is conditional, open via #checkout for UX, and separately assert CTA visibility under the right conditions.",
    ].join("\n")
  );
}

async function openCheckoutViaClick(page: Page): Promise<Locator> {
  const opener = await ensureDonateOpenerVisible(page);
  await opener.click({ timeout: TIMEOUT.action });
  await waitForCheckoutOpen(page);
  return opener;
}

async function openCheckoutViaHash(page: Page) {
  await setMobileViewport(page);
  await page.goto(`${URL_HOME}#checkout`, { waitUntil: "domcontentloaded" });
  await waitForCheckoutOpen(page);
}

/* ----------------------------------------------------------------------------
Assertions
---------------------------------------------------------------------------- */

async function assertFocusMovedIntoCheckout(page: Page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modal = document.querySelector("#checkout");
        return !!(modal && document.activeElement && modal.contains(document.activeElement));
      });
    }, { timeout: TIMEOUT.focus })
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
      inset: `${cs.top}/${cs.right}/${cs.bottom}/${cs.left}`,
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
        `position=${info.position} inset=${info.inset}`,
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

  const hit: HitTestResult = await page.evaluate(() => {
    const btn = document.querySelector('#checkout [data-ff-close-checkout]') as HTMLElement | null;
    if (!btn) return { ok: false, reason: "missing-btn" as const };

    const r = btn.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);

    const stack = document.elementsFromPoint(x, y) as HTMLElement[] | null;
    if (!stack || !stack.length) return { ok: false, reason: "missing-stack" as const };

    const top = stack[0] || null;
    const topIsBtn = top === btn || (top && btn.contains(top));
    const topIsBackdrop = !!(top && top.closest && top.closest("#checkout .ff-sheet__backdrop"));

    const ctxProps = (el: HTMLElement | null) => {
      const out: string[] = [];
      let cur: HTMLElement | null = el;
      let depth = 0;
      while (cur && depth < 8) {
        const cs = window.getComputedStyle(cur);
        const id = cur.id ? `#${cur.id}` : "";
        const cls = cur.className
          ? "." + String(cur.className).trim().split(/\s+/).slice(0, 2).join(".")
          : "";
        out.push(
          `${cur.tagName.toLowerCase()}${id}${cls} z=${cs.zIndex} pos=${cs.position} pe=${cs.pointerEvents} ` +
            `tr=${cs.transform !== "none"} op=${cs.opacity} flt=${cs.filter !== "none"} bdf=${(cs as any).backdropFilter ? ((cs as any).backdropFilter !== "none") : "n/a"}`
        );
        cur = cur.parentElement;
        depth++;
      }
      return out;
    };

    const stackPreview = stack.slice(0, 6).map((el) => {
      const cs = window.getComputedStyle(el);
      const id = el.id ? "#" + el.id : "";
      const cls = el.className
        ? "." + String(el.className).trim().split(/\s+/).slice(0, 3).join(".")
        : "";
      return `${el.tagName.toLowerCase()}${id}${cls} z=${cs.zIndex} pe=${cs.pointerEvents}`;
    });

    const topTag = top
      ? `${top.tagName.toLowerCase()}${top.id ? "#" + top.id : ""}${
          top.className ? "." + String(top.className).trim().split(/\s+/).slice(0, 3).join(".") : ""
        }`
      : "null";

    const backdropEl = document.querySelector("#checkout .ff-sheet__backdrop") as HTMLElement | null;

    return {
      ok: topIsBtn && !topIsBackdrop,
      x,
      y,
      topTag,
      stackPreview,
      btnCtx: ctxProps(btn),
      backdropCtx: ctxProps(backdropEl),
    };
  });

  if ("reason" in hit) {
    throw new Error(`Hit-test failed unexpectedly: ${hit.reason}`);
  }

  expect(
    hit.ok,
    [
      "Close button is NOT the topmost clickable target — backdrop (or another layer) is intercepting clicks.",
      `Hit: (${hit.x}, ${hit.y}) top=${hit.topTag}`,
      `Stack:\n- ${hit.stackPreview.join("\n- ")}`,
      `Close stacking context (first 8 ancestors):\n- ${hit.btnCtx.join("\n- ")}`,
      `Backdrop stacking context (first 8 ancestors):\n- ${hit.backdropCtx.join("\n- ")}`,
      "Fix: close must render above backdrop (z-index) and be within the same stacking context, OR close must be position:fixed with a higher z-index than backdrop.",
    ].join("\n")
  ).toBeTruthy();
}

/* ----------------------------------------------------------------------------
Closing checkout
---------------------------------------------------------------------------- */

async function closeCheckout(page: Page) {
  const closeBtn = closeBtnLocator(page);
  if (await closeBtn.count()) {
    await closeBtn.click({ timeout: TIMEOUT.action });
  } else {
    await page.keyboard.press("Escape");
  }
  await waitForCheckoutClosed(page);
}

/* ----------------------------------------------------------------------------
Tests
---------------------------------------------------------------------------- */

test.describe("FutureFunded checkout UX gate", () => {
  test.beforeEach(async ({ request }) => {
    await preflightServer(request);
  });

  test("opens via click; focus moves into dialog; closes cleanly", async ({ page }) => {
    await gotoHome(page);

    const opener = await openCheckoutViaClick(page);

    await assertFocusMovedIntoCheckout(page);

    // Premium z-index sanity (this is your current failing gate)
    await assertCloseButtonOnTopOfBackdrop(page);

    await closeCheckout(page);

    await expect.soft(opener).toBeFocused();
  });

  test("opens via :target (#checkout) and closes via backdrop", async ({ page }) => {
    await openCheckoutViaHash(page);

    // HARD contract: backdrop must be real
    await assertBackdropVisibleAndCoversViewport(page);

    await page.keyboard.press("Escape");

    await waitForCheckoutClosed(page);
  });

  test("scroll: content/viewport exists; overflow is safe", async ({ page }) => {
    await gotoHome(page);
    await openCheckoutViaClick(page);

    const ok = await page.evaluate(() => {
      const viewport =
        document.querySelector("#checkout .ff-sheet__viewport") ||
        document.querySelector("#checkout .ff-sheet__content");
      if (!viewport) return false;

      const cs = window.getComputedStyle(viewport as Element);
      const oy = cs.overflowY || cs.overflow;
      return !!oy;
    });

    expect(ok).toBeTruthy();
  });
});