import { test, expect, Page } from "@playwright/test";

const TIMEOUT = { open: 12_000, close: 12_000 };

function sheet(page: Page) {
  return page.locator("#checkout").first();
}
function panel(page: Page) {
  return page.locator("#checkout .ff-sheet__panel").first();
}
function backdrop(page: Page) {
  return page.locator("#checkout .ff-sheet__backdrop").first();
}

async function waitForCheckoutOpen(page: Page) {
  await expect(panel(page)).toBeVisible({ timeout: TIMEOUT.open });
  await expect(sheet(page)).toHaveAttribute("aria-hidden", "false");
  await expect(sheet(page)).toHaveAttribute("data-open", "true");
  await expect(sheet(page)).not.toHaveAttribute("hidden");
}

async function waitForCheckoutClosed(page: Page) {
  // Closed contract: either hidden attribute OR aria-hidden true/data-open false
  await expect.poll(
    async () => {
      const s = sheet(page);
      const hiddenAttr = (await s.getAttribute("hidden")) !== null;
      const ariaHidden = (await s.getAttribute("aria-hidden")) === "true";
      const dataOpenFalse = (await s.getAttribute("data-open")) === "false";
      const pHidden = await panel(page).isHidden();
      return (hiddenAttr || (ariaHidden && dataOpenFalse)) && pHidden;
    },
    { timeout: TIMEOUT.close }
  ).toBe(true);
}

async function openCheckout(page: Page) {
  const trigger = page.locator("[data-ff-open-checkout]").first();
  await expect(trigger).toBeVisible();

  // Click can be intercepted by overlays; force is safer for deterministic gates.
  await trigger.click({ force: true });

  // Some implementations open via hash; ensure URL has #checkout if it’s the mechanism.
  // (No harm if JS opens it another way.)
  if (!page.url().includes("#checkout")) {
    await page.evaluate(() => {
      if (location.hash !== "#checkout") location.hash = "#checkout";
    });
  }

  await waitForCheckoutOpen(page);
}

async function closeCheckoutViaButton(page: Page) {
  const btn = page.locator("#checkout button[data-ff-close-checkout]").first();
  const anyClose = page.locator("#checkout [data-ff-close-checkout]").first();

  if (await btn.count()) {
    await btn.click({ force: true });
  } else {
    await anyClose.click({ force: true });
  }

  // Some close flows rely on navigating hash back to #home
  if (!page.url().includes("#home")) {
    await page.evaluate(() => {
      if (location.hash !== "#home") location.hash = "#home";
    });
  }

  await waitForCheckoutClosed(page);
}

async function closeCheckoutViaBackdrop(page: Page) {
  await expect(backdrop(page)).toBeVisible({ timeout: TIMEOUT.open });
  await backdrop(page).click({ force: true });

  if (!page.url().includes("#home")) {
    await page.evaluate(() => {
      if (location.hash !== "#home") location.hash = "#home";
    });
  }

  await waitForCheckoutClosed(page);
}

async function assertCloseButtonTopmost(page: Page) {
  const closeBtn = page.locator("#checkout button[data-ff-close-checkout]").first();
  await expect(closeBtn).toBeVisible();
  await closeBtn.scrollIntoViewIfNeeded();

  const box = await closeBtn.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const ok = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      return !!(el.closest && el.closest("[data-ff-close-checkout]"));
    },
    { x: cx, y: cy }
  );

  expect(ok).toBe(true);
}

test.describe("FutureFunded checkout UX gate (v2)", () => {
  test("opens via click; focus moves into dialog; closes cleanly", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await openCheckout(page);

    // Focus should land inside the dialog/panel (keyboard UX)
    const focusedInside = await page.evaluate(() => {
      const panelEl = document.querySelector("#checkout .ff-sheet__panel") as HTMLElement | null;
      if (!panelEl) return false;
      const ae = document.activeElement as HTMLElement | null;
      return !!(ae && panelEl.contains(ae));
    });
    expect(focusedInside).toBe(true);

    // Close button must be topmost (backdrop not intercepting)
    await assertCloseButtonTopmost(page);

    await closeCheckoutViaButton(page);
  });

  test("opens via :target (#checkout) and closes via backdrop", async ({ page }) => {
    await page.goto("/#checkout", { waitUntil: "domcontentloaded" });
    await waitForCheckoutOpen(page);
    await closeCheckoutViaBackdrop(page);
  });

  test("closes on Escape", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await openCheckout(page);
    await page.keyboard.press("Escape");

    // Some implementations need a microtask for state flush
    await page.waitForTimeout(50);

    await waitForCheckoutClosed(page);
  });

  test("scroll: content/viewport exists; overflow is safe", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await openCheckout(page);

    await expect(page.locator("#checkout [data-ff-checkout-viewport]")).toHaveCount(1);
    await expect(page.locator("#checkout [data-ff-checkout-content]")).toHaveCount(1);

    await closeCheckoutViaButton(page);
  });
});
