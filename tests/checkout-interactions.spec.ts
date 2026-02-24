import { test, expect } from '@playwright/test';
import { attachConsoleFailFast, gotoHome, openCheckout, setAmountViaChip } from './helpers/ff';

test('Checkout: chips + close button are clickable (hit-testing) @smoke', async ({ page }) => {
  const c = attachConsoleFailFast(page);

  await gotoHome(page);
  await openCheckout(page);

  // This is the exact historical failure mode: backdrop intercepts clicks
  await setAmountViaChip(page, 50);
  await setAmountViaChip(page, 100);

  // ESC closes top overlay
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#home/);
  await expect(page.locator('#checkout')).toBeHidden();

  await c.assertNoErrors();
});

test('Checkout: focus stays inside modal when tabbing @prod', async ({ page }) => {
  // This is safe to run in prod too (no payments required)
  await gotoHome(page);
  await openCheckout(page);

  // Tab repeatedly; activeElement must remain inside #checkout
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && !!a.closest('#checkout');
    });
    expect(inside).toBeTruthy();
  }

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#home/);
});
