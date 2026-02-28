import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000/";

test.describe("FutureFunded — boot contract", () => {
  test("ff-app.js executes (BOOT_KEY) and exposes window.ff.version", async ({ page }) => {
    const consoleMsgs: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);

    // 1) Script tag exists
    const scriptSrc = await page.locator('script[src*="ff-app.js"]').first().getAttribute("src");
    if (!scriptSrc) throw new Error("Missing <script src*=ff-app.js> in rendered HTML");

    // 2) Prove the script actually EXECUTED (BOOT_KEY is set at top of file)
    const boot = await page.waitForFunction(() => {
      return !!(window as any)["__FF_APP_BOOT__"];
    }, null, { timeout: 10000 }).then(() => true).catch(() => false);

    const state = await page.evaluate(() => {
      const boot = (window as any)["__FF_APP_BOOT__"];
      const ff = (window as any).ff;
      return {
        readyState: document.readyState,
        bootPresent: !!boot,
        bootValue: boot || null,
        ffPresent: !!ff,
        ffVersion: ff && ff.version,
        ffKeys: ff ? Object.keys(ff).slice(0, 30) : []
      };
    });

    if (!boot) {
      throw new Error(
        [
          "ff-app.js did not execute (BOOT_KEY missing).",
          `readyState: ${state.readyState}`,
          `scriptSrc: ${scriptSrc}`,
          consoleMsgs.length ? `console:\n- ${consoleMsgs.join("\n- ")}` : "console: (none)",
          pageErrors.length ? `page errors:\n- ${pageErrors.join("\n- ")}` : "page errors: (none)"
        ].join("\n")
      );
    }

    if (!state.ffPresent || !state.ffVersion) {
      throw new Error(
        [
          "ff-app.js executed (BOOT_KEY present) BUT window.ff.version is missing.",
          `bootValue: ${JSON.stringify(state.bootValue)}`,
          state.ffPresent ? `ffKeys: ${state.ffKeys.join(", ")}` : "ffKeys: (ff missing)",
          consoleMsgs.length ? `console:\n- ${consoleMsgs.join("\n- ")}` : "console: (none)",
          pageErrors.length ? `page errors:\n- ${pageErrors.join("\n- ")}` : "page errors: (none)"
        ].join("\n")
      );
    }

    expect(state.ffVersion).toBeTruthy();
  });
});
