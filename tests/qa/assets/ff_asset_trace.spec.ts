import { test, expect, Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";

async function resetOverlayState(page: Page) {
  await page.evaluate(() => {
    const w = window as any;

    try {
      w.ff?.closeAllOverlays?.();
    } catch {}

    try {
      if (location.hash && ["#checkout", "#press-video", "#sponsor-interest", "#terms", "#privacy", "#drawer"].includes(location.hash)) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch {}

    const body = document.body;
    if (body) {
      body.setAttribute("data-ff-overlay-open", "false");
      body.classList.remove("is-overlay-open");
    }
  });

  await page.waitForTimeout(120);
}

async function openVideoIfPresent(page: Page): Promise<boolean> {
  const video = page.locator("[data-ff-open-video]").first();
  if (!(await video.count())) return false;

  await resetOverlayState(page);
  await video.scrollIntoViewIfNeeded();
  await video.click({ force: true, timeout: 8000 });
  await page.waitForTimeout(900);
  return true;
}

test("asset trace — capture runtime network requests", async ({ page }) => {
  const requests: string[] = [];
  const badLocalResponses: string[] = [];

  page.on("requestfinished", async (req) => {
    requests.push(`${req.method()} ${req.url()}`);
  });

  page.on("response", (res) => {
    const url = res.url();
    const isLocal =
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("http://localhost") ||
      url.startsWith("https://127.0.0.1") ||
      url.startsWith("https://localhost");

    if (isLocal && res.status() >= 400) {
      badLocalResponses.push(`${res.status()} ${url}`);
    }
  });

  const resp = await page.goto(BASE, { waitUntil: "load" });
  expect(resp?.status()).toBe(200);

  await page.waitForTimeout(700);
  await resetOverlayState(page);

  const hasVideo = await openVideoIfPresent(page);
  if (hasVideo) {
    await resetOverlayState(page);
  }

  const filtered = requests.filter((x) =>
    /ff-app\.js|ff\.css|stripe|paypal|youtube|socket|static/i.test(x)
  );

  test.info().attach("asset-trace.json", {
    body: JSON.stringify(
      {
        captured: filtered,
        badLocalResponses
      },
      null,
      2
    ),
    contentType: "application/json"
  });

  expect(filtered.length, "No meaningful runtime asset requests captured").toBeGreaterThan(0);
  expect(badLocalResponses, "Local asset/network failures detected").toEqual([]);
});
