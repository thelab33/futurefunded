// tests/ff_smoke.spec.mjs
import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.PW_BASE_URL ||
  process.env.BASE_URL ||
  "http://127.0.0.1:5000";

async function installExternalMocks(page) {
  await page.route(/https:\/\/js\.stripe\.com\/v3\/?(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "/* mocked stripe */\n" +
        "window.Stripe = function(){ return { elements(){ return {}; }, confirmPayment: async ()=>({}) }; };",
    });
  });

  await page.route(/https:\/\/www\.paypal\.com\/sdk\/js(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "/* mocked paypal */\n" +
        "window.paypal = { Buttons: () => ({ render: async () => {} }) };",
    });
  });

  await page.route(/https:\/\/www\.youtube-nocookie\.com\/embed\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>mock video</body></html>",
    });
  });
}

function attachConsoleGuards(page) {
  const errors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text() || "";
      const ignorable =
        text.includes("Failed to load resource") ||
        text.includes("net::ERR") ||
        text.includes("favicon") ||
        text.includes("ERR_BLOCKED_BY_CLIENT");
      if (!ignorable) errors.push(text);
    }
  });

  page.on("pageerror", (err) => pageErrors.push(String(err)));

  return {
    assertNoHardErrors: async () => {
      expect(pageErrors, `Uncaught pageerror(s):\n${pageErrors.join("\n")}`).toEqual([]);
      expect(errors, `Console error(s):\n${errors.join("\n")}`).toEqual([]);
    },
  };
}

async function readJsonScript(page, selector) {
  const loc = page.locator(selector);
  await expect(loc).toHaveCount(1);
  const raw = (await loc.textContent()) || "";
  return JSON.parse(raw.trim());
}

test.describe("FutureFunded — ff_smoke (selector-driven gate)", () => {
  test("index bootstraps: ffConfig + ffSelectors + required hooks", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    const resp = await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    expect(resp?.ok()).toBeTruthy();

    await expect(page.locator("html.ff-root")).toHaveCount(1);
    await expect(page.locator("body.ff-body[data-ff-body]")).toHaveCount(1);

    await expect(page.locator("#ffConfig[data-ff-config][type='application/json']")).toHaveCount(1);
    await expect(page.locator("#ffSelectors[type='application/json']")).toHaveCount(1);

    const selJson = await readJsonScript(page, "#ffSelectors");
    const hooks = selJson?.hooks || {};
    expect(Object.keys(hooks).length, "ffSelectors.hooks is empty").toBeGreaterThan(5);

    // Gate: every declared hook must resolve to at least one DOM node
    const missing = [];
    for (const [name, css] of Object.entries(hooks)) {
      if (!css || typeof css !== "string") continue;
      const count = await page.locator(css).count();
      if (count < 1) missing.push(`${name} -> ${css}`);
    }
    expect(missing, `Missing selectors from #ffSelectors:\n${missing.join("\n")}`).toEqual([]);

    // Key overlay roots exist
    await expect(page.locator("#checkout[data-ff-checkout-sheet]")).toHaveCount(1);
    await expect(page.locator("#drawer[data-ff-drawer]")).toHaveCount(1);
    await expect(page.locator("#sponsor-interest[data-ff-sponsor-modal]")).toHaveCount(1);
    await expect(page.locator("#press-video[data-ff-video-modal]")).toHaveCount(1);

    // CSS/JS references
    await expect(page.locator('link[rel="stylesheet"][href*="css/ff.css"]')).toHaveCount(1);
    await expect(page.locator('script[defer][src*="js/ff-app.js"]')).toHaveCount(1);

    await guard.assertNoHardErrors();
  });
});
