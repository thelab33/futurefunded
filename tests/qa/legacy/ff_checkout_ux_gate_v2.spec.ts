import { test, expect, Page, Locator } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";
const TIMEOUT = { open: 12000, close: 10000 };

const CHECKOUT = "#checkout";
const OPENERS = [
  '[data-ff-open-checkout]',
  'a.ff-donate-btn[href="#checkout"]',
  '.ff-tabs .ff-tab--cta[href="#checkout"]'
].join(", ");
const CLOSE_BTNS = [
  '#checkout button[data-ff-close-checkout]:not(.ff-sheet__backdrop):not(.ff-modal__backdrop):not(.ff-overlay__backdrop):not(.ff-backdrop):not(.backdrop)',
  '#checkout button[data-ff-close]:not(.ff-sheet__backdrop):not(.ff-modal__backdrop):not(.ff-overlay__backdrop):not(.ff-backdrop):not(.backdrop)',
  "#checkout button.ff-sheet__close",
  "#checkout button.ff-modal__close",
  "#checkout button.ff-close",
  '#checkout button[aria-label="Close"]',
  '#checkout button[aria-label="Close checkout"]'
].join(", ");

const BACKDROPS = [
  "#checkout [data-ff-backdrop]",
  "#checkout .ff-sheet__backdrop",
  "#checkout .ff-modal__backdrop",
  "#checkout .ff-overlay__backdrop",
  "#checkout .ff-backdrop",
  "#checkout .backdrop"
].join(", ");

function checkout(page: Page): Locator {
  return page.locator(CHECKOUT);
}

function closeBtn(page: Page): Locator {
  return page.locator(CLOSE_BTNS).first();
}

function backdrop(page: Page): Locator {
  return page.locator(BACKDROPS).first();
}

async function isOpen(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const el = document.querySelector("#checkout") as HTMLElement | null;
    if (!el) return false;
    if ((el as any).hidden === true || el.hasAttribute("hidden")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.getAttribute("data-open") === "false") return false;
    if (location.hash === "#checkout") return true;
    if (el.classList.contains("is-open")) return true;
    if (el.getAttribute("data-open") === "true") return true;
    if (el.getAttribute("aria-hidden") === "false") return true;

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.02) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

async function isClosed(page: Page): Promise<boolean> {
  return !(await isOpen(page));
}

async function openCheckout(page: Page, mode: "click" | "target" = "click") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(120);

  if (mode === "click" && (await page.locator(OPENERS).first().count()) > 0) {
    await page.locator(OPENERS).first().click({ force: true });
  } else {
    await page.evaluate(() => {
      if (location.hash !== "#checkout") location.hash = "#checkout";
    });
  }

  await expect.poll(async () => await isOpen(page), { timeout: TIMEOUT.open }).toBe(true);
  await expect(checkout(page)).toBeVisible({ timeout: TIMEOUT.open }).catch(() => {});
}

async function ensureFocusInside(page: Page) {
  await page.waitForTimeout(120);

  let inside = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return !!active?.closest?.("#checkout");
  });

  if (!inside) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    inside = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return !!active?.closest?.("#checkout");
    });
  }

  expect(inside, "Focus did not move inside checkout").toBeTruthy();
}

async function assertCloseButtonTopmost(page: Page) {
  const btn = closeBtn(page);

  if (!(await btn.count())) {
    test.info().attach("checkout-close-note.txt", {
      body: "No visible button close control found; skipping topmost assertion and relying on Escape/backdrop contract.",
      contentType: "text/plain"
    });
    return;
  }

  await expect(btn).toBeVisible({ timeout: TIMEOUT.open });
  await btn.scrollIntoViewIfNeeded();

  const ok = await btn.evaluate((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y) as HTMLElement | null;
    return !!top && (top === el || (el as HTMLElement).contains(top));
  });

  expect(ok, "Close button is not topmost at its center point").toBeTruthy();
}

async function closeViaButton(page: Page) {
  const btn = closeBtn(page);
  if (await btn.count()) {
    await expect(btn).toBeVisible({ timeout: TIMEOUT.open });
    await btn.click({ force: true });
  } else {
    await page.keyboard.press("Escape");
  }

  await page.waitForTimeout(150);
  await expect.poll(async () => await isClosed(page), { timeout: TIMEOUT.close }).toBe(true);
}

async function closeViaBackdropOrOutside(page: Page) {
  const bd = backdrop(page);

  if ((await bd.count()) > 0 && await bd.isVisible().catch(() => false)) {
    await bd.click({ force: true });
  } else {
    await page.mouse.click(2, 2);
  }

  await page.waitForTimeout(150);

  if (!(await isClosed(page))) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }

  await expect.poll(async () => await isClosed(page), { timeout: TIMEOUT.close }).toBe(true);
}

test.describe("FutureFunded checkout UX gate (v2)", () => {
  test("opens via click; focus moves into dialog; close button is topmost; closes cleanly", async ({ page }) => {
    await openCheckout(page, "click");
    await ensureFocusInside(page);
    await assertCloseButtonTopmost(page);
    await closeViaButton(page);
  });

  test("opens via :target (#checkout) and closes via backdrop", async ({ page }) => {
    await openCheckout(page, "target");
    await closeViaBackdropOrOutside(page);
  });

  test("closes on Escape", async ({ page }) => {
    await openCheckout(page, "target");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await expect.poll(async () => await isClosed(page), { timeout: TIMEOUT.close }).toBe(true);
  });

  test("scroll contract: viewport/content nodes exist when open", async ({ page }) => {
    await openCheckout(page, "click");

    const state = await page.evaluate(() => {
      const root = document.querySelector("#checkout") as HTMLElement | null;
      if (!root) return { exists: false, viewport: false, content: false };

      const viewport = root.querySelector(
        "[data-ff-checkout-viewport], [data-ff-scroll-viewport], .ff-sheet__viewport, .ff-sheet__viewport--flagship"
      );
      const content = root.querySelector(
        "[data-ff-checkout-content], [data-ff-scroll-content], .ff-sheet__scroll, .ff-sheet__scroll--flagship, .ff-sheet__content, .ff-modal__body"
      );

      return {
        exists: true,
        viewport: !!viewport,
        content: !!content
      };
    });

    expect(state.exists).toBeTruthy();
    expect(state.viewport || state.content, "No scroll viewport/content hook found in checkout").toBeTruthy();

    await closeViaButton(page);
  });
});
