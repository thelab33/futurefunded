// tools/ff_perf_budget.spec.mjs
// FutureFunded — Perf Budget Gate (Playwright)
// - Deterministic-ish Web Vitals (LCP/CLS) + longtask proxy
// - Network budgets + “lazy-only” third-party enforcement
// - Prints LCP element details on failure for fast diagnosis

import { test, expect } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

// Tune budgets via env so CI can be stricter than local
const BUDGET = Object.freeze({
  LCP_MS: Number(process.env.PERF_LCP_MS || 2500),
  CLS_MAX: Number(process.env.PERF_CLS_MAX || 0.05),
  LONGTASKS_MAX: Number(process.env.PERF_LONGTASKS_MAX || 6),

  // Network budgets (best-effort; content-length may be missing)
  REQ_MAX: Number(process.env.PERF_REQ_MAX || 110),
  XHR_MAX: Number(process.env.PERF_XHR_MAX || 25),
  THIRD_PARTY_MAX: Number(process.env.PERF_3P_MAX || 10),
  BYTES_MAX: Number(process.env.PERF_BYTES_MAX || 2_500_000), // 2.5MB best-effort

  // How long to wait after navigation to let observers settle
  SETTLE_MS: Number(process.env.PERF_SETTLE_MS || 1200),
});

// Domains that must NOT load on initial page render (lazy-load only)
const LAZY_ONLY_DOMAINS = Object.freeze([
  "js.stripe.com",
  "m.stripe.network",
  "paypal.com",
  "www.paypal.com",
]);

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function isLocalHost(host) {
  return (
    host.includes("127.0.0.1") ||
    host.includes("localhost") ||
    host.startsWith("[::1]")
  );
}

function isLazyOnlyHost(host) {
  return LAZY_ONLY_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

function initNetStats() {
  return {
    req: 0,
    xhr: 0,
    thirdParty: 0,
    thirdPartyHosts: new Set(),
    lazyHits: new Set(),
    bytes: 0,
  };
}

async function attachNetStats(page, stats) {
  page.on("response", async (res) => {
    const req = res.request();
    const url = req.url();
    const host = safeHost(url);
    const type = req.resourceType();

    stats.req += 1;
    if (type === "xhr" || type === "fetch") stats.xhr += 1;

    const isThirdParty = !!host && !isLocalHost(host);
    if (isThirdParty) {
      stats.thirdParty += 1;
      stats.thirdPartyHosts.add(host);
    }

    if (host && isLazyOnlyHost(host)) stats.lazyHits.add(host);

    // Best-effort bytes (Content-Length may be absent)
    const h = await res.allHeaders().catch(() => ({}));
    const cl = Number(h["content-length"] || h["Content-Length"] || 0);
    if (Number.isFinite(cl) && cl > 0) stats.bytes += cl;
  });
}

async function installPerfObservers(page) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__ffPerf = {
      lcp: 0,
      cls: 0,
      longTasks: 0,
      lcpTag: "",
      lcpText: "",
      lcpUrl: "",
      lcpId: "",
      lcpClass: "",
    };

    // LCP (plus element details)
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          // @ts-ignore
          window.__ffPerf.lcp = Math.max(window.__ffPerf.lcp, e.startTime || 0);

          // @ts-ignore
          const el = e.element;
          if (el) {
            // @ts-ignore
            window.__ffPerf.lcpTag = (el.tagName || "").toLowerCase();
            // @ts-ignore
            window.__ffPerf.lcpText = (el.textContent || "").trim().slice(0, 140);
            // @ts-ignore
            window.__ffPerf.lcpUrl = el.currentSrc || el.src || "";
            // @ts-ignore
            window.__ffPerf.lcpId = el.id || "";
            // @ts-ignore
            window.__ffPerf.lcpClass = (el.className || "").toString().slice(0, 160);
          }
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    // CLS
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          // @ts-ignore
          if (!e.hadRecentInput) window.__ffPerf.cls += e.value || 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}

    // Long tasks (TBT-ish proxy)
    try {
      new PerformanceObserver((list) => {
        // @ts-ignore
        window.__ffPerf.longTasks += list.getEntries().length;
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
}

async function readPerf(page) {
  return page.evaluate(() => {
    // @ts-ignore
    return window.__ffPerf || { lcp: 0, cls: 0, longTasks: 0 };
  });
}

function printableNetStats(stats) {
  return {
    req: stats.req,
    xhr: stats.xhr,
    thirdParty: stats.thirdParty,
    thirdPartyHosts: Array.from(stats.thirdPartyHosts).sort(),
    lazyHits: Array.from(stats.lazyHits).sort(),
    bytes: stats.bytes,
  };
}

test.describe("FutureFunded perf budget gate (Playwright)", () => {
  test("home: Web Vitals budgets + no heavy third-party on initial load", async ({ page }) => {
    const stats = initNetStats();
    await attachNetStats(page, stats);
    await installPerfObservers(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(BUDGET.SETTLE_MS);

    const perf = await readPerf(page);

    // Helpful diagnostics in CI logs
    // (kept concise; full detail only printed when something fails)
    const diag = () => ({
      perf,
      net: printableNetStats(stats),
      budget: BUDGET,
    });

    // 1) Budgets
    try {
      expect(perf.cls).toBeLessThan(BUDGET.CLS_MAX);
      expect(perf.lcp).toBeLessThan(BUDGET.LCP_MS);
      expect(perf.longTasks).toBeLessThan(BUDGET.LONGTASKS_MAX);

      // 2) Network budgets (best-effort)
      expect(stats.req).toBeLessThan(BUDGET.REQ_MAX);
      expect(stats.xhr).toBeLessThan(BUDGET.XHR_MAX);
      expect(stats.thirdParty).toBeLessThan(BUDGET.THIRD_PARTY_MAX);
      if (stats.bytes > 0) expect(stats.bytes).toBeLessThan(BUDGET.BYTES_MAX);

      // 3) No Stripe/PayPal domains on initial load (lazy-only rule)
      expect(Array.from(stats.lazyHits)).toEqual([]);
    } catch (e) {
      // Print a compact “why” payload for fast iteration
      // eslint-disable-next-line no-console
      console.log("FF_PERF_DIAG", JSON.stringify(diag(), null, 2));
      throw e;
    }
  });

  test("checkout: opening checkout may load payments (but should still be stable)", async ({ page }) => {
    await installPerfObservers(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

    await page.locator('[data-ff-open-checkout]').first().click();
    await expect(page.locator("#checkout")).toHaveCount(1);

    const perf = await readPerf(page);

    // Soft-ish budget: opening checkout should not explode CLS
    expect(perf.cls).toBeLessThan(0.12);
  });
});
