import { test, expect } from "@playwright/test";

test.describe("FutureFunded smoke", () => {
  test("homepage loads and core UI is present", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("html")).toBeVisible();
    await expect(page.locator("body")).toBeVisible();

    await expect(page.locator("#checkout")).toHaveCount(1);
    await expect(page.locator('[data-ff-open-checkout], a[href="#checkout"]').first()).toBeVisible();
    await expect(page.locator("#donationForm")).toHaveCount(1);

    await expect(page.locator('[data-ff-live], [data-ff-live-feed], [data-ff-sponsor-wall], [data-ff-toasts]').first()).toBeAttached();
  });

  test("page has no obvious fatal shell breakage", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    page.on("pageerror", err => {
      pageErrors.push(String(err));
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    const title = await page.title();
    expect(title).not.toBeNull();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(50);

    const fatalConsole = consoleErrors.filter(msg =>
      !/favicon|Failed to load resource: the server responded with a status of 404/i.test(msg)
    );

    expect(pageErrors, "Page errors detected").toEqual([]);
    expect(fatalConsole, "Console errors detected").toEqual([]);
  });
});
