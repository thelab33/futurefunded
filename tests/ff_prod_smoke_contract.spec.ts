import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";

test.describe("FutureFunded — boot contract", () => {
  test("ff-app.js executes and exposes window.ff.version", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    page.on("pageerror", (err) => {
      pageErrors.push(String((err as Error)?.message || err));
    });

    const resp = await page.goto(BASE, { waitUntil: "load" });
    expect(resp?.status(), "Home page did not return 200").toBe(200);

    await page.waitForFunction(() => {
      const w = window as any;
      return Boolean(
        w.ff?.version ||
        w.FF_APP?.version ||
        (typeof w.FF_APP?.api?.contractSnapshot === "function")
      );
    }, null, { timeout: 10000 });

    const state = await page.evaluate(() => {
      const w = window as any;
      const root = (document.querySelector(".ff-root") as HTMLElement | null) || document.documentElement;
      const script = document.querySelector('script[src*="ff-app.js"]') as HTMLScriptElement | null;

      return {
        readyState: document.readyState,
        scriptSrc: script?.getAttribute("src") || "",
        version:
          w.ff?.version ||
          w.FF_APP?.version ||
          root?.getAttribute("data-ff-version") ||
          root?.getAttribute("data-ff-build") ||
          "",
        hasWindowFF: !!w.ff,
        hasFFApp: !!w.FF_APP,
        hasContractSnapshot: typeof w.FF_APP?.api?.contractSnapshot === "function"
      };
    });

    expect(state.readyState).toBe("complete");
    expect(state.scriptSrc, "ff-app.js script tag missing").toContain("/static/js/ff-app.js");
    expect(state.version, "No runtime version detected").toBeTruthy();
    expect(
      state.hasWindowFF || state.hasContractSnapshot || state.hasFFApp,
      "No usable public runtime found"
    ).toBeTruthy();

    const ignoredPageErrors = pageErrors.filter((msg) =>
      /Cannot set properties of undefined \(setting 'webdriver'\)/.test(msg)
    );
    const fatalPageErrors = pageErrors.filter((msg) =>
      !/Cannot set properties of undefined \(setting 'webdriver'\)/.test(msg)
    );

    if (ignoredPageErrors.length) {
      test.info().attach("ignored-page-errors.txt", {
        body: ignoredPageErrors.join("\n"),
        contentType: "text/plain"
      });
    }

    expect(consoleErrors, "Console errors detected").toEqual([]);
    expect(fatalPageErrors, "Page errors detected").toEqual([]);
  });
});
