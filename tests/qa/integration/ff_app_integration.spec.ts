import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000/";

test.describe("ff-app.js — integration smoke + behavior checks", () => {
  test("boot guard + public API present", async ({ page }) => {
    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);

    await page.waitForFunction(() => !!(window as any).ff && !!(window as any).ff.version, null, { timeout: 10000 });

    const api = await page.evaluate(() => {
      const ff: any = (window as any).ff || {};
      return {
        version: ff.version,
        hasInject: typeof ff.injectScript === "function",
        hasCloseAll: typeof ff.closeAllOverlays === "function"
      };
    });

    expect(api.version).toBeTruthy();
    expect(api.hasInject).toBeTruthy();
    expect(api.hasCloseAll).toBeTruthy();
  });

  test("injectScript supports blob: URL execution (CSP-safe)", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!(window as any).ff && typeof (window as any).ff.injectScript === "function");

    const ok = await page.evaluate(async () => {
      const ff: any = (window as any).ff;
      (window as any).__ff_blob_ok__ = 0;

      const code = "window.__ff_blob_ok__ = (window.__ff_blob_ok__ || 0) + 1;";
      const blob = new Blob([code], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);

      try {
        // injectScript signature may vary; simplest call first
        const r = ff.injectScript(url);
        if (r && typeof r.then === "function") await r;
        // give it a microtask + tick
        await new Promise((res) => setTimeout(res, 25));
        return (window as any).__ff_blob_ok__ >= 1;
      } catch (e) {
        return false;
      } finally {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }
    });

    expect(ok).toBeTruthy();
  });

  test("closeAllOverlays leaves no visible overlays (contract)", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!(window as any).ff && typeof (window as any).ff.closeAllOverlays === "function");

    // open checkout via delegated opener (if present in runtime)
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.setAttribute("data-ff-open-checkout", "");
      a.textContent = "Dynamic Donate";
      a.style.position = "fixed";
      a.style.left = "10px";
      a.style.top = "10px";
      a.style.zIndex = "99999";
      document.body.appendChild(a);
    });

    await page.click('a[data-ff-open-checkout]');

    // Now force close all overlays
    await page.evaluate(() => (window as any).ff.closeAllOverlays());

    // Ensure there are no open overlays by contract
    await page.waitForFunction(() => {
      const open = document.querySelectorAll(
        ':target, .is-open, [data-open="true"], [aria-hidden="false"]'
      );
      // Allow :target only if it's not an overlay-ish element; simplest is "none"
      return open.length === 0;
    }, null, { timeout: 5000 });
  });
});
