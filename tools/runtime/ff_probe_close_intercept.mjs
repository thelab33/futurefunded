import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";

async function run(theme) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // If your app uses query params/cookies for theme, adapt here.
  // This assumes theme toggling happens via data attr on .ff-root from server or runtime.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // Try to open checkout overlay deterministically:
  // - Prefer a known opener (data-ff-open/ href="#checkout") if present.
  // - Otherwise just try to click likely CTA.
  await page.evaluate(() => {
    const a =
      document.querySelector('a[href="#checkout"]') ||
      document.querySelector('[data-ff-open="checkout"]') ||
      document.querySelector('[data-ff-open][href*="checkout"]') ||
      Array.from(document.querySelectorAll("a,button")).find(el =>
        /donate|open checkout|checkout/i.test((el.textContent || "").trim())
      );
    if (a) a.click();
  });

  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const close =
      document.querySelector('#checkout [data-ff-close]') ||
      document.querySelector('#checkout .ff-close') ||
      document.querySelector('#checkout .ff-overlay__close') ||
      document.querySelector('#checkout button[aria-label="Close"], #checkout a[aria-label="Close"]') ||
      document.querySelector('[data-ff-overlay] [data-ff-close]') ||
      document.querySelector('.ff-overlay [data-ff-close]') ||
      null;

    if (!close) return { ok: false, why: "close-not-found" };

    const r = close.getBoundingClientRect();
    const cx = Math.floor(r.left + r.width / 2);
    const cy = Math.floor(r.top + r.height / 2);

    const top = document.elementFromPoint(cx, cy);
    const same = top === close;

    const toSel = (el) => {
      if (!el) return "";
      const id = el.id ? `#${el.id}` : "";
      const cls = (el.className && typeof el.className === "string")
        ? "." + el.className.trim().split(/\s+/).slice(0, 6).join(".")
        : "";
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    const path = (el) => {
      const out = [];
      let cur = el;
      for (let i = 0; i < 6 && cur; i++) {
        out.push(toSel(cur));
        cur = cur.parentElement;
      }
      return out;
    };

    return {
      ok: true,
      same,
      cx, cy,
      close: toSel(close),
      top: toSel(top),
      topPath: path(top),
      closePath: path(close),
      closeZ: getComputedStyle(close).zIndex,
      topZ: top ? getComputedStyle(top).zIndex : null,
      closePE: getComputedStyle(close).pointerEvents,
      topPE: top ? getComputedStyle(top).pointerEvents : null
    };
  });

  console.log(`\n=== CLOSE INTERCEPT PROBE (${theme}) ===`);
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
}

await run("default");
