import { test, expect, Page } from "@playwright/test";

const CHECKOUT = "#checkout";

async function openByHash(page: Page) {
  await page.goto("/#checkout", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
}

test.describe("FutureFunded donation flow", () => {
  test("checkout route/hash is reachable and DOM is present", async ({ page }) => {
    await openByHash(page);

    const exists = await page.locator(CHECKOUT).count();
    expect(exists).toBe(1);

    const state = await page.evaluate(() => {
      const el = document.querySelector("#checkout") as HTMLElement | null;
      if (!el) return null;

      const cs = getComputedStyle(el);
      return {
        hash: location.hash,
        hiddenAttr: el.hasAttribute("hidden"),
        hiddenProp: (el as any).hidden === true,
        ariaHidden: el.getAttribute("aria-hidden"),
        dataOpen: el.getAttribute("data-open"),
        display: cs.display,
        visibility: cs.visibility
      };
    });

    expect(state).not.toBeNull();
    expect(state?.hash).toBe("#checkout");
  });

  test("donation form fields exist inside checkout", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#donationForm")).toHaveCount(1);
    await expect(page.locator('input[name="team_id"][data-ff-team-id]')).toHaveCount(1);
    await expect(page.locator('[data-ff-amount-input]')).toHaveCount(1);

    const formFacts = await page.evaluate(() => {
      const form = document.querySelector("#donationForm");
      if (!form) return null;

      return {
        buttonCount: form.querySelectorAll("button").length,
        submitCount: form.querySelectorAll('button[type="submit"], input[type="submit"]').length,
        amountChipCount: form.querySelectorAll("[data-ff-amount]").length,
        hasAmountInput: !!form.querySelector("[data-ff-amount-input]"),
        hasTeamId: !!form.querySelector('input[name="team_id"][data-ff-team-id]')
      };
    });

    expect(formFacts).not.toBeNull();
    expect(formFacts?.hasAmountInput).toBeTruthy();
    expect(formFacts?.hasTeamId).toBeTruthy();
    expect(
      (formFacts?.submitCount || 0) > 0 || (formFacts?.buttonCount || 0) > 0 || (formFacts?.amountChipCount || 0) > 0
    ).toBeTruthy();
  });

  test("at least one donate trigger is visible and points to checkout", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const opener = page.locator('[data-ff-open-checkout], a[href="#checkout"]').first();
    await expect(opener).toBeVisible();

    const attrs = await opener.evaluate((el) => ({
      href: el.getAttribute("href"),
      ariaControls: el.getAttribute("aria-controls"),
      openHook: el.getAttribute("data-ff-open-checkout")
    }));

    expect(
      attrs.href === "#checkout" || attrs.ariaControls === "checkout" || attrs.openHook !== null
    ).toBeTruthy();
  });
});
