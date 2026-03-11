import { test, expect, devices, Page } from "@playwright/test";

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
  const directTriggers = page.locator('[data-ff-open-checkout]');
  const directCount = await directTriggers.count();

  for (let i = 0; i < directCount; i += 1) {
    const candidate = directTriggers.nth(i);
    const isVisible = await candidate.isVisible().catch(() => false);
    if (isVisible) {
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true });
      await page.waitForTimeout(400);
      return;
    }
  }

  const hashLinks = page.locator('a[href="#checkout"]');
  const hashCount = await hashLinks.count();

  for (let i = 0; i < hashCount; i += 1) {
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

test.use({
  ...devices["iPhone 13"],
});

test.describe("FutureFunded — mobile launch sanity", () => {
  test("homepage and checkout are usable on mobile", async ({ page }) => {
    const badResponses: string[] = [];
    const consoleErrors: string[] = [];

    page.on("response", (res) => {
      const url = res.url();
      const status = res.status();
      if (status >= 400 && !isAllowedOptional404(url, status)) {
        badResponses.push(`${status} ${url}`);
      }
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    const noHorizontalScroll = await page.evaluate(() => {
      const de = document.documentElement;
      const body = document.body;
      return de.scrollWidth <= de.clientWidth + 1 && body.scrollWidth <= body.clientWidth + 1;
    });
    expect(noHorizontalScroll, "Horizontal scroll detected on mobile").toBeTruthy();

    await openCheckout(page);

    const checkout = page.locator("#checkout");
    await expect(checkout).toBeVisible();

    const viewportOk = await page.evaluate(() => {
      const el = document.querySelector("#checkout") as HTMLElement | null;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    expect(viewportOk, "Checkout did not render correctly on mobile").toBeTruthy();

    test.info().attach("mobile-launch-sanity.json", {
      body: JSON.stringify({ base: BASE, badResponses, consoleErrors }, null, 2),
      contentType: "application/json"
    });

    expect(badResponses, "Unexpected mobile same-origin 4xx/5xx responses").toEqual([]);
  });
});
