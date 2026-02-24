// tools/ff_payments.spec.mjs
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const URL_HOME = `${BASE_URL.replace(/\/$/, "")}/`;
const STRICT_PAYMENTS = process.env.STRICT_PAYMENTS === "1";

function isIgnorableConsole(msg) {
  const t = msg.text() || "";
  // Stripe privacy/storage partitioning noise in modern Chrome
  if (
    /Partitioned cookie|storage access|third-party context|dynamic state partitioning/i.test(
      t,
    )
  )
    return true;
  if (/stripe\.network|js\.stripe\.com/i.test(t) && msg.type() !== "error")
    return true;
  return false;
}

async function openCheckout(page) {
  await page.locator("[data-ff-open-checkout]").first().click();
  await expect(page.locator("#checkout")).toHaveCount(1);
}

test.describe("FutureFunded payments gate", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      // Fail only on real errors (allowlist Stripe noise)
      if (msg.type() === "error" && !isIgnorableConsole(msg)) {
        throw new Error(`Console error: ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      throw new Error(`Page error: ${err?.message || err}`);
    });
  });

  test("stripe: mount exists and (optionally) intent endpoint is hit", async ({
    page,
  }) => {
    let intentHit = false;

    // Mock intent endpoint (match variations)
    await page.route(
      /\/payments\/stripe\/intent\b|\/stripe\/intent\b/i,
      async (route) => {
        intentHit = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            client_secret: "pi_test_secret_123",
            publishable_key: "pk_test_123",
          }),
        });
      },
    );

    // Stub Stripe JS (no network)
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
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: stub,
      });
    });

    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });
    await openCheckout(page);

    // Your REAL mount (per your markup)
    const mount = page.locator("#paymentElement, [data-ff-payment-element]");
    if (!STRICT_PAYMENTS) {
      // If payments are disabled locally, don’t hard-fail; just ensure the container exists
      await expect(mount).toHaveCount(1);
      return;
    }

    await expect(mount).toHaveCount(1);

    // In strict mode we require: either mount is visible/ready OR intent endpoint is hit
    await expect
      .poll(
        async () =>
          intentHit ||
          (await mount
            .first()
            .isVisible()
            .catch(() => false)),
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test("paypal: mount exists and sdk stub can render", async ({ page }) => {
    let orderHit = false;
    let captureHit = false;

    await page.route(
      /\/payments\/paypal\/order\b|\/paypal\/order\b/i,
      async (route) => {
        orderHit = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "ORDER_TEST_123" }),
        });
      },
    );

    await page.route(
      /\/payments\/paypal\/capture\b|\/paypal\/capture\b/i,
      async (route) => {
        captureHit = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "COMPLETED", id: "CAPTURE_TEST_123" }),
        });
      },
    );

    await page.route(/paypal\.com\/sdk\/js|\/sdk\/js/i, async (route) => {
      const stub = `
        window.paypal = {
          Buttons: function(opts){
            return {
              render: async function(sel){
                const el = document.querySelector(sel);
                if (el) el.setAttribute('data-pp-rendered', 'true');
                if (opts && opts.createOrder) await opts.createOrder();
                if (opts && opts.onApprove) await opts.onApprove({ orderID: 'ORDER_TEST_123' });
              }
            };
          }
        };
      `;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: stub,
      });
    });

    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });
    await openCheckout(page);

    const mount = page.locator("#paypalButtons, [data-ff-paypal-mount]");
    if (!STRICT_PAYMENTS) {
      await expect(mount).toHaveCount(1);
      return;
    }

    await expect(mount).toHaveCount(1);

    await expect
      .poll(
        async () => {
          const rendered = await page
            .locator('[data-pp-rendered="true"]')
            .count()
            .catch(() => 0);
          return rendered > 0 || orderHit || captureHit;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });
});
