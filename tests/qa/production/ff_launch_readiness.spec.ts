import { test, expect, Page } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  "https://getfuturefunded.com";

const ALLOWED_OPTIONAL_404_PATTERNS = [
  /\/api\/activity-feed(?:\?|$)/i
];

function isAllowedOptional404(url: string, status: number): boolean {
  return status === 404 && ALLOWED_OPTIONAL_404_PATTERNS.some((rx) => rx.test(url));
}

async function openCheckout(page: Page) {
  const directTrigger = page.locator('[data-ff-open-checkout]').first();

  if (await directTrigger.count()) {
    await directTrigger.scrollIntoViewIfNeeded().catch(() => {});
    await directTrigger.click({ force: true });
    await page.waitForTimeout(400);
    return;
  }

  const hashLinks = page.locator('a[href="#checkout"]');
  const count = await hashLinks.count();

  for (let i = 0; i < count; i += 1) {
    const candidate = hashLinks.nth(i);
    const klass = (await candidate.getAttribute("class")) || "";
    const isSkip = /\bff-skip(link)?\b/i.test(klass);
    const isVisible = await candidate.isVisible().catch(() => false);

    if (!isSkip && isVisible) {
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true });
      await page.waitForTimeout(400);
      return;
    }
  }

  await page.evaluate(() => {
    location.hash = "#checkout";
  });
  await page.waitForTimeout(400);
}

test.describe("FutureFunded — production launch readiness", () => {
  test("homepage boots cleanly and core assets load", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const badResponses: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(String((err as Error)?.message || err));
    });

    page.on("response", (res) => {
      const url = res.url();
      const status = res.status();

      if (status >= 400 && !isAllowedOptional404(url, status)) {
        badResponses.push(`${status} ${url}`);
      }
    });

    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp, "No initial response received").toBeTruthy();
    expect(resp!.status(), "Homepage did not return HTTP 200").toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    const title = await page.title();
    expect(title, "Document title should exist").toBeTruthy();

    const ffVersion = await page.evaluate(() => {
      return (window as any)?.ff?.version ?? null;
    });
    expect(ffVersion, "window.ff.version should exist in production").toBeTruthy();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length, "Body content should not be empty").toBeGreaterThan(100);

    await openCheckout(page);

    const checkout = page.locator("#checkout");
    await expect(checkout, "Checkout container should exist").toBeVisible();

    const unexpectedConsoleErrors = consoleErrors.filter((text) => {
      if (!/Failed to load resource/i.test(text)) return true;
      return badResponses.length > 0;
    });

    test.info().attach("production-launch-readiness.json", {
      body: JSON.stringify(
        {
          base: BASE,
          ffVersion,
          badResponses,
          consoleErrors,
          unexpectedConsoleErrors,
          pageErrors
        },
        null,
        2
      ),
      contentType: "application/json"
    });

    expect(unexpectedConsoleErrors, "Unexpected console errors detected").toEqual([]);
    expect(pageErrors, "Unexpected page errors detected").toEqual([]);
    expect(badResponses, "Unexpected bad responses detected").toEqual([]);
  });
});
