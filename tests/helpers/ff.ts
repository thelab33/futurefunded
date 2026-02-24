import { expect, Page } from '@playwright/test';

export function attachConsoleFailFast(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  return {
    assertNoErrors: async () => {
      // Let late errors land (tiny grace)
      await page.waitForTimeout(150);
      expect(errors, `Console/page errors detected:\n${errors.join('\n')}`).toEqual([]);
    }
  };
}

export async function gotoHome(page: Page) {
  // smoke=1 enables your SMOKE block (non-prod) without changing behavior
  await page.goto('/?smoke=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body.ff-body')).toBeVisible();
}

export async function openCheckout(page: Page) {
  await page.click('[data-ff-open-checkout]', { timeout: 10_000 });
  await expect(page).toHaveURL(/#checkout/);
  await expect(page.locator('#checkout')).toBeVisible();
  await expect(page.locator('#checkout [data-ff-checkout-viewport]')).toBeVisible();
}

export async function closeCheckoutViaX(page: Page) {
  await page.click('#checkout button[data-ff-close-checkout]');
  await expect(page).toHaveURL(/#home/);
  await expect(page.locator('#checkout')).toBeHidden();
}

export async function setAmountViaChip(page: Page, amount: number) {
  // Works for BOTH page chips and checkout chips since you delegated [data-ff-amount]
  await page.click(`[data-ff-amount="${amount}"]`);
  await expect(page.locator('#donationAmount')).toHaveValue(String(amount));
  await expect(page.locator(`[data-ff-amount="${amount}"]`).first()).toHaveAttribute('aria-pressed', 'true');
}
