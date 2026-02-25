import { test, expect } from "@playwright/test";

test.describe("FutureFunded smoke gate", () => {
  test("home loads and required hooks exist", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const missing404: string[] = [];

    page.on("pageerror", (e) => pageErrors.push(String(e)));

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const t = msg.text() || "";
      // We'll report real 404 URLs via response handler instead.
      if (t.toLowerCase().includes("failed to load resource")) return;
      consoleErrors.push(t);
    });

    page.on("response", (resp) => {
      if (resp.status() === 404) missing404.push(resp.url());
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("html.ff-root")).toHaveCount(1);
    await expect(page.locator("body.ff-body[data-ff-body]")).toHaveCount(1);

    // Config + selectors JSON scripts must exist
    await expect(page.locator("#ffConfig[data-ff-config][type='application/json']")).toHaveCount(1);
    await expect(page.locator("#ffSelectors[type='application/json']")).toHaveCount(1);

    // Core hooks used by ff-app.js / tests
    const openCount = await page.locator("[data-ff-open-checkout]").count();
    expect(openCount).toBeGreaterThan(0);

    await expect(page.locator("[data-ff-checkout-sheet]")).toHaveCount(1);
    await expect(page.locator("#checkout")).toHaveCount(1);

    await expect(page.locator("[data-ff-toasts]")).toHaveCount(1);
    await expect(page.locator("[data-ff-live]")).toHaveCount(1);

    // Fail with actionable details
    expect(pageErrors, `Page errors:\n${pageErrors.join("\n")}`).toEqual([]);
    expect(consoleErrors, `Console errors:\n${consoleErrors.join("\n")}`).toEqual([]);

    // Dedupe 404s, keep deterministic output
    const unique404 = Array.from(new Set(missing404)).sort();
    expect(unique404, `404 resources:\n${unique404.join("\n")}`).toEqual([]);
  });

  test("static assets are reachable", async ({ request }) => {
    const css = await request.get("/static/css/ff.css");
    expect(css.ok()).toBeTruthy();

    const js = await request.get("/static/js/ff-app.js");
    expect(js.ok()).toBeTruthy();
  });
});
