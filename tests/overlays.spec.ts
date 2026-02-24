import { test, expect } from '@playwright/test';
import { attachConsoleFailFast, gotoHome, openCheckout, closeCheckoutViaX } from './helpers/ff';

test('Overlays: drawer open/close works on mobile @smoke', async ({ page }) => {
  const c = attachConsoleFailFast(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHome(page);

  // Open drawer (mobile button exists but only visible on small viewports)
  await page.click('button[data-ff-open-drawer]');
  await expect(page).toHaveURL(/#drawer/);
  await expect(page.locator('#drawer')).toBeVisible();
  await expect(page.locator('#ffDrawerPanel')).toBeVisible();

  // Close drawer via backdrop
  await page.click('#drawer .ff-drawer__backdrop');
  await expect(page).toHaveURL(/#home/);
  await expect(page.locator('#drawer')).toBeHidden();

  await c.assertNoErrors();
});

test('Overlays: sponsor + video + terms/privacy open/close @smoke', async ({ page }) => {
  const c = attachConsoleFailFast(page);

  await gotoHome(page);

  // Sponsor modal
  await page.click('[data-ff-open-sponsor]');
  await expect(page).toHaveURL(/#sponsor-interest/);
  await expect(page.locator('#sponsor-interest')).toBeVisible();
  await page.click('#sponsor-interest button[data-ff-close-sponsor]');
  await expect(page).toHaveURL(/#home/);
  await expect(page.locator('#sponsor-interest')).toBeHidden();

  // Video modal (must not auto-load video on home)
  await expect(page.locator('#press-video iframe')).toHaveCount(0);
  await page.click('[data-ff-open-video]');
  await expect(page).toHaveURL(/#press-video/);
  await expect(page.locator('#press-video')).toBeVisible();
  await page.click('#press-video button[data-ff-close-video]');
  await expect(page).toHaveURL(/#home/);
  await expect(page.locator('#press-video')).toBeHidden();

  // Terms / Privacy (hash modals)
  await page.click('a[href="#terms"]');
  await expect(page).toHaveURL(/#terms/);
  await expect(page.locator('#terms')).toBeVisible();
  await page.click('#terms a[href="#home"]');
  await expect(page).toHaveURL(/#home/);

  await page.click('a[href="#privacy"]');
  await expect(page).toHaveURL(/#privacy/);
  await expect(page.locator('#privacy')).toBeVisible();
  await page.click('#privacy a[href="#home"]');
  await expect(page).toHaveURL(/#home/);

  // Sanity: checkout still works after all overlay ops
  await openCheckout(page);
  await closeCheckoutViaX(page);

  await c.assertNoErrors();
});
