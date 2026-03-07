import { test, expect } from "@playwright/test";

test.describe("FutureFunded DOM contract", () => {
  test("critical IDs and hooks exist exactly once where required", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#checkout")).toHaveCount(1);
    await expect(page.locator("#donationForm")).toHaveCount(1);
    await expect(page.locator('script#ffConfig, #ffConfig')).toHaveCount(1);

    expect(await page.locator('[data-ff-open-checkout], a[href="#checkout"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-ff-close-checkout]').count()).toBeGreaterThan(0);

    await expect(page.locator('[data-ff-checkout-sheet]')).toHaveCount(1);
    await expect(page.locator('[data-ff-checkout-viewport]')).toHaveCount(1);
    await expect(page.locator('[data-ff-checkout-content]')).toHaveCount(1);

    await expect(page.locator('input[data-ff-team-id][name="team_id"]')).toHaveCount(1);
    await expect(page.locator('[data-ff-amount-input]')).toHaveCount(1);
  });

  test("checkout starts in a closed but present state", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const state = await page.evaluate(() => {
      const el = document.querySelector("#checkout") as HTMLElement | null;
      if (!el) return null;

      return {
        hiddenAttr: el.hasAttribute("hidden"),
        hiddenProp: (el as any).hidden === true,
        ariaHidden: el.getAttribute("aria-hidden"),
        dataOpen: el.getAttribute("data-open")
      };
    });

    expect(state).not.toBeNull();
    expect(state?.ariaHidden).toBe("true");
    expect(state?.dataOpen).toBe("false");
  });
});
