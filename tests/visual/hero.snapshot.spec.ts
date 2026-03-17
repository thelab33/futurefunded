import { test, expect } from '@playwright/test';

test('hero visual snapshot', async ({ page }) => {
  await page.goto('/');
  // wait for hero to render fully (images, fonts)
  await page.locator('.ff-hero').waitFor({ state: 'visible', timeout: 10000 });

  // optional: shrink viewport to typical mobile + desktop
  await page.setViewportSize({ width: 1200, height: 1000 });
  const hero = page.locator('.ff-hero');
  await expect(hero).toHaveScreenshot('hero-desktop-tight.png', { fullPage: false });

  await page.setViewportSize({ width: 412, height: 915 });
  await expect(hero).toHaveScreenshot('hero-mobile-tight.png', { fullPage: false });
});
