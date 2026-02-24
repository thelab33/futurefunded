// tests/smoke_ff_v1.spec.ts
import { test, expect, Page } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.PW_BASE_URL ||
  process.env.BASE_URL ||
  "http://127.0.0.1:5000";

type FFSelectors = {
  hooks?: Record<string, string>;
};

async function installExternalMocks(page: Page) {
  // Prevent flaky third-party network behavior (offline/blocked)
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

function attachConsoleGuards(page: Page) {
  const errors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text() || "";
      // Ignore common noise that doesn't indicate app breakage
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

async function readJsonScript<T>(page: Page, selector: string): Promise<T> {
  const handle = page.locator(selector);
  await expect(handle).toHaveCount(1);
  const raw = (await handle.textContent()) || "";
  // Some templates indent JSON; trim is safe.
  const txt = raw.trim();
  return JSON.parse(txt) as T;
}

test.describe("FutureFunded — smoke_ff_v1", () => {
  test("home loads, config + selectors bootstrap, and required hooks exist", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    const resp = await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    expect(resp?.ok()).toBeTruthy();

    // Root contracts
    const root = page.locator("html.ff-root");
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute("data-ff-brand", /.+/);
    await expect(root).toHaveAttribute("data-theme", /^(light|dark|system|auto)?/);

    const body = page.locator("body.ff-body[data-ff-body]");
    await expect(body).toHaveCount(1);
    await expect(body).toHaveAttribute("data-ff-data-mode", /^(live|demo|preview)$/);

    // CSS + JS presence
    await expect(page.locator('link[rel="stylesheet"][href*="css/ff.css"]')).toHaveCount(1);
    await expect(page.locator('script[defer][src*="js/ff-app.js"]')).toHaveCount(1);

    // JSON bootstrap contracts
    await expect(page.locator("#ffConfig[data-ff-config][type='application/json']")).toHaveCount(1);
    await expect(page.locator("#ffSelectors[type='application/json']")).toHaveCount(1);

    const ffSelectors = await readJsonScript<FFSelectors>(page, "#ffSelectors");
    expect(ffSelectors?.hooks, "ffSelectors.hooks missing").toBeTruthy();

    // Assert that each hook selector resolves to at least one node in the DOM.
    // (Hidden overlays still exist in DOM; querySelector should find them.)
    const missing: string[] = [];
    for (const [hookName, sel] of Object.entries(ffSelectors.hooks || {})) {
      if (!sel || typeof sel !== "string") continue;
      const count = await page.locator(sel).count();
      if (count < 1) missing.push(`${hookName} -> ${sel}`);
    }
    expect(missing, `Missing selectors from #ffSelectors:\n${missing.join("\n")}`).toEqual([]);

    // Key landmark + regions that should always exist
    await expect(page.locator("#ffLive[data-ff-live]")).toHaveCount(1);
    await expect(page.locator("[data-ff-toasts]")).toHaveCount(1);
    await expect(page.locator("[data-ff-shell]")).toHaveCount(1);
    await expect(page.locator("[data-ff-topbar]")).toHaveCount(1);

    // Overlays exist
    await expect(page.locator("#drawer[data-ff-drawer]")).toHaveCount(1);
    await expect(page.locator("#checkout[data-ff-checkout-sheet]")).toHaveCount(1);
    await expect(page.locator("#sponsor-interest[data-ff-sponsor-modal]")).toHaveCount(1);
    await expect(page.locator("#press-video[data-ff-video-modal]")).toHaveCount(1);

    // Back-to-top + tabs exist (these were missing-selector offenders before)
    await expect(page.locator("[data-ff-backtotop]")).toHaveCount(1);
    await expect(page.locator("[data-ff-tabs]")).toHaveCount(1);

    // Optional: backend endpoints (soft checks: won’t fail the suite, but surfaces regressions)
    const status = await page.request.get(`${BASE_URL}/api/status`);
    expect.soft(status.ok(), "GET /api/status should be 2xx").toBeTruthy();

    const health = await page.request.get(`${BASE_URL}/payments/health`);
    expect.soft(health.ok(), "GET /payments/health should be 2xx").toBeTruthy();

    await guard.assertNoHardErrors();
  });

  test("smoke flag (?smoke=1) renders smoke alert in non-prod", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    const resp = await page.goto(`${BASE_URL}/?smoke=1`, { waitUntil: "domcontentloaded" });
    expect(resp?.ok()).toBeTruthy();

    // In your template, SMOKE renders only when request args smoke is truthy.
    // If prod mode disables it, this will show up as a clear failure in local dev (which is what we want).
    await expect(page.locator("text=SMOKE:")).toHaveCount(1);

    await guard.assertNoHardErrors();
  });
});
