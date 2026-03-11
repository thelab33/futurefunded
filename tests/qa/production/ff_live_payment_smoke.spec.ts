// tests/qa/production/ff_live_payment_smoke.spec.ts
import { test, expect } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  "https://getfuturefunded.com";

const ENABLE_LIVE_PAYMENT = process.env.FF_ENABLE_LIVE_PAYMENT === "true";
const LIVE_AMOUNT = process.env.FF_LIVE_DONATION_AMOUNT ?? "5";

test.describe("FutureFunded — live payment smoke", () => {
  test.skip(!ENABLE_LIVE_PAYMENT, "Set FF_ENABLE_LIVE_PAYMENT=true to run live payment smoke");

  test("checkout reaches payment step with intended amount", async ({ page }) => {
    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const trigger = page.locator('[data-ff-open-checkout]').first();
    await expect(trigger).toBeVisible();
    await trigger.click({ force: true });

    const checkout = page.locator("#checkout");
    await expect(checkout).toBeVisible();

    const amountInput = page.locator('[data-ff-amount-input], input[name="amount"]').first();
    await expect(amountInput).toBeVisible();
    await amountInput.fill(LIVE_AMOUNT);

    const teamIdInput = page.locator('input[name="team_id"]').first();
    await expect(teamIdInput, "team_id hidden input should exist").toHaveValue(/.+/);

    test.info().attach("live-payment-smoke.json", {
      body: JSON.stringify(
        {
          base: BASE,
          liveAmount: LIVE_AMOUNT,
          note: "This test intentionally stops short of forcing a real irreversible charge unless you extend it with your exact provider flow."
        },
        null,
        2
      ),
      contentType: "application/json"
    });
  });
});
