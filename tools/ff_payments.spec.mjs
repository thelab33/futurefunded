// tools/ff_payments.spec.mjs
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const URL_HOME = `${BASE_URL.replace(/\/$/, "")}/`;
const STRICT_PAYMENTS = process.env.STRICT_PAYMENTS === "1";

function isIgnorableConsole(msg) {
  const t = msg.text() || "";
  // Stripe privacy/storage partitioning noise
  if (/Partitioned cookie|storage access|third-party context|partitioning/i.test(t)) return true;
  return false;
}

async function openCheckout(page) {
  await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });
  await page.locator('[data-ff-open-checkout]').first().click();
  await expect(page.locator("#checkout")).toHaveCount(1);
}

test.describe("FutureFunded payments gate", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnorableConsole(msg)) {
        throw new Error(`Console error: ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      throw new Error(`Page error: ${err?.message || err}`);
    });
  });

  test("stripe: container exists; intent endpoint can be hit when enabled", async ({ page }) => {
    let intentHit = false;

    await page.route(/\/payments\/stripe\/intent\b|\/stripe\/intent\b/i, async (route) => {
      intentHit = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          client_secret: "pi_test_secret_123",
          publishable_key: "pk_test_123"
        })
      });
    });

    await page.route(/https:\/\/js\.stripe\.com\/v3\/?/i, async (route) => {
      const stub = `
        window.Stripe = function(){
          return {
            elements: function(){
              return { create: function(){ return { mount(){}, unmount(){} }; } };
            },
            confirmPayment: async function(){ return { paymentIntent: { status: 'succeeded' } }; }
          };
        };
      `;
      await route.fulfill({ status: 200, contentType: "application/javascript", body: stub });
    });

    await openCheckout(page);

    const mount = page.locator("#paymentElement, [data-ff-payment-element]");
    await expect(mount).toHaveCount(1);

    // Try to trigger init: submit/continue button
    const continueBtn = page.locator('button[form="donationForm"][type="submit"]').first();
    if (await continueBtn.count()) await continueBtn.click().catch(() => {});

    if (STRICT_PAYMENTS) {
      await expect.poll(async () => intentHit || (await mount.first().isVisible().catch(() => false)), { timeout: 20_000 }).toBe(true);
    }
  });

  test("paypal: container exists; sdk stub can render when enabled", async ({ page }) => {
    let sdkHit = false;

    await page.route(/paypal\.com\/sdk\/js|\/sdk\/js/i, async (route) => {
      sdkHit = true;
      const stub = `
        window.paypal = {
          Buttons: function(opts){
            return {
              render: async function(sel){
                const el = document.querySelector(sel);
                if (el) el.setAttribute('data-pp-rendered','true');
                if (opts && opts.createOrder) await opts.createOrder();
                if (opts && opts.onApprove) await opts.onApprove({ orderID: 'ORDER_TEST_123' });
              }
            };
          }
        };
      `;
      await route.fulfill({ status: 200, contentType: "application/javascript", body: stub });
    });

    await openCheckout(page);

    const mount = page.locator("#paypalButtons, [data-ff-paypal-mount]");
    await expect(mount).toHaveCount(1);

    if (STRICT_PAYMENTS) {
      await expect.poll(async () => sdkHit || (await page.locator('[data-pp-rendered="true"]').count().catch(() => 0)) > 0, { timeout: 20_000 }).toBe(true);
    }
  });
});
