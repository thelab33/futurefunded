import { test, expect } from '@playwright/test';
import { attachConsoleFailFast, gotoHome, openCheckout, closeCheckoutViaX } from './helpers/ff';

test('Smoke: page renders + checkout opens/closes @smoke', async ({ page }) => {
  const c = attachConsoleFailFast(page);

  await gotoHome(page);

  // Core UI exists
  await expect(page.locator('header.ff-chrome')).toBeVisible();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('[data-ff-open-checkout]').first()).toBeVisible();

  // Checkout flow (hash overlay)
  await openCheckout(page);
  await closeCheckoutViaX(page);

  await c.assertNoErrors();
});
