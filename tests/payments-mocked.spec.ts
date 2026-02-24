import { test, expect } from '@playwright/test';
import { attachConsoleFailFast, gotoHome, openCheckout, setAmountViaChip } from './helpers/ff';
import { mockPayments } from './helpers/mock-payments';

test('Payments: Stripe + PayPal load only after checkout open + amount > 0 @payments', async ({ page }) => {
  const c = attachConsoleFailFast(page);
  await mockPayments(page);

  const requested: string[] = [];
  page.on('request', (req) => requested.push(req.url()));

  await gotoHome(page);

  // Confirm no Stripe/PayPal scripts loaded on home
  expect(requested.some((u) => u.includes('js.stripe.com/v3'))).toBeFalsy();
  expect(requested.some((u) => u.includes('www.paypal.com/sdk/js'))).toBeFalsy();

  await openCheckout(page);

  // Still should not load until amount > 0
  await page.waitForTimeout(100);
  expect(requested.some((u) => u.includes('js.stripe.com/v3'))).toBeFalsy();
  expect(requested.some((u) => u.includes('www.paypal.com/sdk/js'))).toBeFalsy();

  // Set amount -> should trigger Stripe intent + PayPal render
  await setAmountViaChip(page, 25);

  await expect(page.locator('script#ff-stripe-js')).toHaveCount(1);
  await expect(page.locator('[data-ff-inner-mount="stripe"][data-ff-mounted="payment"]')).toHaveCount(1);

  await expect(page.locator('script#ff-paypal-js')).toHaveCount(1);
  await expect(page.locator('#paypal-stub')).toBeVisible();

  await c.assertNoErrors();
});

test('Payments: Stripe confirm closes checkout + shows toast @payments', async ({ page }) => {
  await mockPayments(page);
  await gotoHome(page);
  await openCheckout(page);
  await setAmountViaChip(page, 50);

  // Submit your form (“Continue to payment”) triggers confirmPayment in ff-app.js
  await page.click('#checkout button[type="submit"]');

  await expect(page).toHaveURL(/#home/);
  await expect(page.locator('.ff-toast')).toBeVisible();
});

test('Payments: PayPal approve closes checkout @payments', async ({ page }) => {
  await mockPayments(page);
  await gotoHome(page);
  await openCheckout(page);
  await setAmountViaChip(page, 75);

  await expect(page.locator('#paypal-stub')).toBeVisible();
  await page.click('#paypal-stub');

  await expect(page).toHaveURL(/#home/);
});
