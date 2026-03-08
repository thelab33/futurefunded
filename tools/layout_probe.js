import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("http://127.0.0.1:5000");

const result = await page.evaluate(() => {
  const bodyScroll = document.body.scrollHeight > window.innerHeight;
  const checkout = document.querySelector("#checkout");

  return {
    bodyScroll,
    checkoutHeight: checkout?.scrollHeight,
    viewport: window.innerHeight
  };
});

console.log(result);

await browser.close();
