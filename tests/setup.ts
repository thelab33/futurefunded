import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://js.stripe.com/**', route =>
      route.fulfill({ status: 200, body: '' })
    );

    await page.route('https://www.paypal.com/**', route =>
      route.fulfill({ status: 200, body: '' })
    );

    await use(page);
  }
});
