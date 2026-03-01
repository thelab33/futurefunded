import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

type ReqRow = {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
};

async function waitCheckoutOpen(page: any) {
  await page.waitForFunction(() => {
    const el = document.getElementById("checkout");
    if (!el) return false;
    const ds = (el as HTMLElement).dataset || {};
    const aria = (el as HTMLElement).getAttribute("aria-hidden");
    const hiddenAttr = (el as HTMLElement).hasAttribute("hidden");
    return ds.open === "true" || aria === "false" || hiddenAttr === false;
  }, null, { timeout: 10000 });
}

async function waitCheckoutClosed(page: any) {
  await page.waitForFunction(() => {
    const el = document.getElementById("checkout");
    if (!el) return true;
    const ds = (el as HTMLElement).dataset || {};
    const aria = (el as HTMLElement).getAttribute("aria-hidden");
    const hiddenAttr = (el as HTMLElement).hasAttribute("hidden");
    return ds.open === "false" || aria === "true" || hiddenAttr === true;
  }, null, { timeout: 10000 });
}

async function openCheckoutIfPresent(page: any) {
  const open = page.locator('[data-ff-open-checkout]').first();
  if (!(await open.count())) return false;

  await open.click({ timeout: 8000 });
  await waitCheckoutOpen(page);

  // Give Stripe/PayPal lazy-load a moment to fire requests.
  await page.waitForTimeout(1200);
  return true;
}

async function closeCheckoutDeterministic(page: any) {
  // Primary: ESC (most deterministic)
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);

  // If still open, click the visible close button if present.
  const closeBtn = page.locator('button[data-ff-close-checkout]').first();
  if (await closeBtn.count()) {
    await closeBtn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
  }

  await waitCheckoutClosed(page);
}

async function openVideoIfPresent(page: any) {
  const video = page.locator("[data-ff-open-video]").first();
  if (!(await video.count())) return false;

  await video.click({ timeout: 8000 });
  await page.waitForTimeout(900);
  return true;
}

async function closeVideoDeterministic(page: any) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);

  const closeBtn = page.locator('button[data-ff-close-video]').first();
  if (await closeBtn.count()) {
    await closeBtn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

test("asset trace — capture runtime network requests", async ({ page }) => {
  test.setTimeout(60_000);

  const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000"\;
  const outPath = path.resolve("tools/.artifacts/ff_asset_trace_report_v1.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const requests: ReqRow[] = [];

  page.on("response", (res) => {
    try {
      const req = res.request();
      requests.push({
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
        status: res.status(),
      });
    } catch {
      // ignore
    }
  });

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const openedCheckout = await openCheckoutIfPresent(page);
  if (openedCheckout) await closeCheckoutDeterministic(page);

  const openedVideo = await openVideoIfPresent(page);
  if (openedVideo) await closeVideoDeterministic(page);

  const origins = new Set<string>();
  const internal: string[] = [];
  const baseOrigin = new URL(baseURL).origin;

  for (const r of requests) {
    try {
      const u = new URL(r.url);
      origins.add(`${u.protocol}//${u.host}`);
      if (u.origin === baseOrigin) internal.push(u.pathname);
    } catch {
      // ignore
    }
  }

  const report = {
    baseURL,
    captured_total: requests.length,
    origins: Array.from(origins).sort(),
    internal_paths: Array.from(new Set(internal)).sort(),
    requests,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[ff-asset-trace] wrote: ${outPath}  total=${requests.length}`);
});
