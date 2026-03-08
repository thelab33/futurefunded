const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();

  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 400) console.log(`[HTTP ${s}]`, resp.url());
  });

  page.on('requestfailed', (req) => {
    console.log('[REQFAIL]', req.url(), req.failure());
  });

  const url = 'https://getfuturefunded.com/';
  console.log('Visiting:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  await browser.close();
})();
