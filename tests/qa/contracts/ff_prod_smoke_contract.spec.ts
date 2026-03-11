import { test, expect } from "@playwright/test";

test.describe("FutureFunded — boot contract", () => {
  test("ff-app.js executes and exposes window.ff.version", async ({ page }) => {
    const consoleErrors: string[] = [];
    const fatalPageErrors: string[] = [];
    const httpFailures: Array<{ url: string; status: number }> = [];

    /**
     * Endpoints that are allowed to 404 during local boot without failing
     * the ff-app smoke contract.
     *
     * Keep this list very small and intentional.
     */
    const ALLOWED_OPTIONAL_404_PATTERNS = [
      /\/api\/activity-feed(?:\?|$)/i,
    ];

    const isAllowedOptional404 = (url: string, status: number): boolean => {
      return status === 404 && ALLOWED_OPTIONAL_404_PATTERNS.some((rx) => rx.test(url));
    };

    page.on("pageerror", (err) => {
      fatalPageErrors.push(String(err));
    });

    page.on("response", (resp) => {
      const status = resp.status();
      const url = resp.url();

      if (status >= 400) {
        httpFailures.push({ url, status });
      }
    });

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;

      const text = msg.text();

      /**
       * Browser console collapses network failures into generic
       * "Failed to load resource" messages, which are too vague on their own.
       * We collect them, but later filter them against the actual response list.
       */
      consoleErrors.push(text);
    });

    await page.goto("http://127.0.0.1:5000", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    const ffVersion = await page.evaluate(() => {
      return (window as any)?.ff?.version ?? null;
    });

    expect(ffVersion, "window.ff.version should be exposed after boot").toBeTruthy();

    const unexpectedHttpFailures = httpFailures.filter(
      ({ url, status }) => !isAllowedOptional404(url, status)
    );

    /**
     * Only keep console errors that are not explained by an allowed optional 404.
     * Generic resource-load console noise is tolerated only when it maps to a
     * specifically allowlisted optional endpoint.
     */
    const unexpectedConsoleErrors = consoleErrors.filter((text) => {
      if (!/Failed to load resource/i.test(text)) return true;

      const matchedAllowed404 = httpFailures.some(
        ({ url, status }) => isAllowedOptional404(url, status)
      );

      return !matchedAllowed404;
    });

    expect(
      unexpectedHttpFailures,
      [
        "Unexpected HTTP failures detected during boot.",
        ...unexpectedHttpFailures.map((x) => `- [HTTP ${x.status}] ${x.url}`),
      ].join("\n")
    ).toEqual([]);

    expect(
      unexpectedConsoleErrors,
      [
        "Unexpected console errors detected during boot.",
        ...unexpectedConsoleErrors.map((x) => `- ${x}`),
      ].join("\n")
    ).toEqual([]);

    expect(
      fatalPageErrors,
      [
        "Unexpected page errors detected during boot.",
        ...fatalPageErrors.map((x) => `- ${x}`),
      ].join("\n")
    ).toEqual([]);
  });
});
