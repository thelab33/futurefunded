import { test, expect } from "@playwright/test";

// Assumes dev server running at http://127.0.0.1:5000
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000/";

test("checkout sheet opens and closes", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  const open = page.locator("[data-ff-open-checkout]").first();
  await expect(open).toBeVisible();
  await open.click();

  await expect(page).toHaveURL(/#checkout\b/);

  const panel = page.locator("#checkout [role='dialog']").first();
  await expect(panel).toBeVisible();

  // Prefer the explicit close button inside the panel (more deterministic than the backdrop)
  const closeBtn = page.locator("#checkout button[data-ff-close-checkout]").first();
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();

  await expect(page).not.toHaveURL(/#checkout\b/);
});

test("checkout closes when clicking outside panel (backdrop area)", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  await page.locator("[data-ff-open-checkout]").first().click();
  await expect(page).toHaveURL(/#checkout\b/);

  // Target the ACTUAL backdrop element and click a safe spot (top-left)
  // This avoids Playwright clicking the center (which can be under the panel/input).
  const backdrop = page
    .locator("#checkout .ff-sheet__backdrop[data-ff-close-checkout]")
    .first();

  await expect(backdrop).toBeVisible();
  await backdrop.click({ position: { x: 5, y: 5 } });

  await expect(page).not.toHaveURL(/#checkout\b/);
});
test("checkout closes on Escape", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator("[data-ff-open-checkout]").first().click();
  await expect(page).toHaveURL(/#checkout\b/);

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/#checkout\b/);
});
