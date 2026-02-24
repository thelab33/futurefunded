import { Page, Route } from '@playwright/test';

function stripeStubJs() {
  // Minimal Stripe.js shim that satisfies your ff-app.js contract
  return `
    (function(){
      window.Stripe = function(pk){
        return {
          elements: function(opts){
            return {
              create: function(type){
                return {
                  mount: function(el){
                    try { el.setAttribute('data-ff-mounted', type); } catch(e){}
                  },
                  unmount: function(){}
                }
              }
            }
          },
          confirmPayment: async function(){
            return { paymentIntent: { status: 'succeeded' } };
          }
        };
      };
    })();
  `;
}

function paypalStubJs() {
  // Minimal PayPal SDK shim that renders a deterministic button
  return `
    (function(){
      window.paypal = {
        Buttons: function(opts){
          return {
            render: async function(el){
              var btn = document.createElement('button');
              btn.id = 'paypal-stub';
              btn.type = 'button';
              btn.textContent = 'PayPal';
              btn.addEventListener('click', async function(){
                try {
                  var orderID = await opts.createOrder();
                  await opts.onApprove({ orderID: orderID });
                } catch (e) {
                  if (opts.onError) opts.onError(e);
                }
              });
              el.appendChild(btn);
            }
          };
        }
      };
    })();
  `;
}

export async function mockPayments(page: Page) {
  // Block random external noise (fonts/trackers/etc) but keep your static assets
  await page.route('**/*', async (route: Route) => {
    const url = route.request().url();

    // Allow same-origin + data/blob
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return route.continue();

    // Stripe script
    if (url.includes('js.stripe.com/v3')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: stripeStubJs()
      });
    }

    // PayPal SDK
    if (url.includes('www.paypal.com/sdk/js')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: paypalStubJs()
      });
    }

    // Allow OG images etc if they’re same-origin; otherwise block to prevent flake
    return route.fulfill({ status: 204, body: '' });
  });

  // Mock your backend payment endpoints
  await page.route('**/payments/stripe/intent', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clientSecret: 'cs_test_mock_123' })
    });
  });

  await page.route('**/payments/paypal/order', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'ORDER_MOCK_123' })
    });
  });

  await page.route('**/payments/paypal/capture', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'COMPLETED' })
    });
  });
}
