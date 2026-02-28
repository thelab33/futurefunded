/* ============================================================================
FutureFunded • UI/UX Pro Gate (CSS + A11y + Overlay + Smoke)
File: tests/ff_uiux_pro_gate.spec.ts
DROP-IN REFACTOR • Deterministic • CI-friendly

What’s improved:
- Deduped theme tests via runGate()
- Centralized env parsing + budgets
- Clean report write-to-disk (per-test + repo-level)
- Clear sections + smaller helpers
- No behavior changes (same assertions/contracts)
============================================================================ */

import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/* =============================================================================
   Types
============================================================================= */

type CssSymbolSets = { classes: Set<string>; ids: Set<string>; dataAttrs: Set<string> };
type DomSymbolSets = { classes: Set<string>; ids: Set<string>; dataAttrs: Set<string> };

type ContrastFail = {
  selector: string;
  text: string;
  ratio: number;
  fg: string;
  bg: string;
  fontSize: string;
  fontWeight: string;
  tag: string;
};

/* =============================================================================
   Env + Budgets
============================================================================= */

function envBool(name: string, fallback: boolean): boolean {
  const v = String(process.env[name] ?? "").trim();
  if (!v) return fallback;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function envNum(name: string, fallback: number): number {
  const v = String(process.env[name] ?? "").trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const FLAGS = {
  strictMissingSelectors: envBool("FF_STRICT_MISSING", true),
  strictContrast: envBool("FF_STRICT_CONTRAST", true),
  snapshots: envBool("FF_SNAPSHOTS", false),
  strictPerf: envBool("FF_STRICT_PERF", false),
};

const BUDGET = {
  clsMax: envNum("FF_BUDGET_CLS", 0.15),
  lcpMaxMs: envNum("FF_BUDGET_LCP_MS", 3800),
};

const IMPORTANT_ID_RE = /^(ff|hero|progress|trust|tier|sponsor|checkout|drawer)/i;

// Classes that can exist purely as logic/state hooks (we won’t fail if missing in CSS)
const CLASS_ALLOWLIST = new Set<string>([
  "is-open",
  "is-ready",
  "is-loading",
  "is-error",
  "is-selected",
  "is-featured",
  "is-active",
  "is-disabled",
  "is-vip",
  "is-live",
  "is-hidden",
  "is-visible",
]);

// data attributes allowed as logic-only hooks (we won’t hard-fail if missing in CSS)
const DATAFF_ALLOWLIST = new Set<string>([
  "data-ff-id",
  "data-ff-open-checkout",
  "data-ff-close-checkout",
  "data-ff-open-drawer",
  "data-ff-open-sponsor",
  "data-ff-checkout-scroll",
  "data-ff-checkout-content",
  "data-ff-checkout-viewport",
  "data-ff-checkout-status",
  "data-ff-toasts",
]);

/* =============================================================================
   Test Suite
============================================================================= */

test.describe("FutureFunded • UI/UX Pro Gate (CSS + A11y + Overlay + Smoke)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Gate: DARK theme (home + checkout)", async ({ page, baseURL }) => {
    await runGate(page, baseURL ?? "/", "dark");
  });

  test("Gate: LIGHT theme (home + checkout)", async ({ page, baseURL }) => {
    await runGate(page, baseURL ?? "/", "light");
  });
});

/* =============================================================================
   Gate Runner
============================================================================= */

async function runGate(page: Page, url: string, theme: "light" | "dark" | "system_dark") {
  await installPerfObservers(page);
  const guard = installConsoleAndNetworkGuards(page);

  await page.goto(url, { waitUntil: "networkidle" });
  await setTheme(page, theme);

  await expectNoHorizontalScroll(page);
  await expectFocusVisibleBasics(page);

  // NOTE: this is the line that produced your failure:
  // expect(report.missingClasses...).toEqual([])
  await expectCssCoverage(page, theme);

  await expectContrastAudit(page, { scopeSelector: ".ff-body", label: `${theme}-home` });

  await expectCheckoutOverlayUX(page);
  await expectContrastAudit(page, { scopeSelector: "#checkout", label: `${theme}-checkout`, onlyIfVisible: true });

  if (FLAGS.snapshots) {
    await takeSnapshots(page, theme);
  }

  await expectPerfBudgets(page);
  await guard.assertClean();
}

async function takeSnapshots(page: Page, theme: string) {
  await expect(page).toHaveScreenshot(`ff-home-${theme}.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.012,
  });

  await openCheckout(page);

  await expect(page).toHaveScreenshot(`ff-checkout-${theme}.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.015,
  });
}

/* =============================================================================
   Guards: console + network
============================================================================= */

function installConsoleAndNetworkGuards(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("pageerror", (err) => pageErrors.push(String((err as any)?.message ?? err)));

  page.on("requestfailed", (req) => {
    const failure = req.failure();
    failedRequests.push(`${req.method()} ${req.url()} :: ${failure?.errorText ?? "requestfailed"}`);
  });

  page.on("response", (res) => {
    const url = res.url();
    const status = res.status();
    const isLocal =
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("http://localhost") ||
      url.startsWith("https://127.0.0.1") ||
      url.startsWith("https://localhost");
    if (isLocal && status >= 400) badResponses.push(`${status} ${url}`);
  });

  return {
    async assertClean() {
      attachTextIfAny("console-errors.txt", consoleErrors);
      attachTextIfAny("page-errors.txt", pageErrors);
      attachTextIfAny("requestfailed.txt", failedRequests);
      attachTextIfAny("bad-responses.txt", badResponses);

      expect(consoleErrors, "Console errors detected").toEqual([]);
      expect(pageErrors, "Page errors detected").toEqual([]);
      expect(failedRequests, "Failed network requests detected").toEqual([]);
      expect(badResponses, "Bad HTTP responses for local assets detected").toEqual([]);
    },
  };
}

function attachTextIfAny(name: string, lines: string[]) {
  if (!lines.length) return;
  test.info().attach(name, { body: lines.join("\n"), contentType: "text/plain" });
}

/* =============================================================================
   Perf observers (CLS/LCP) — no Lighthouse needed, still catches real issues
============================================================================= */

async function installPerfObservers(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__ffPerf = { cls: 0, lcp: 0 };

    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (entry && entry.hadRecentInput) continue;
          w.__ffPerf.cls += entry.value || 0;
        }
      });
      clsObs.observe({ type: "layout-shift", buffered: true });
    } catch {}

    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries() as any[];
        const last = entries[entries.length - 1];
        if (last && typeof last.startTime === "number") {
          w.__ffPerf.lcp = Math.max(w.__ffPerf.lcp || 0, last.startTime);
        }
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
  });
}

async function expectPerfBudgets(page: Page) {
  const perf = await page.evaluate(() => (window as any).__ffPerf || { cls: 0, lcp: 0 });
  const cls = Number(perf.cls || 0);
  const lcp = Number(perf.lcp || 0);

  test.info().attach("perf.json", {
    body: JSON.stringify({ cls, lcp }, null, 2),
    contentType: "application/json",
  });

  expect(cls, `CLS too high (budget ${BUDGET.clsMax})`).toBeLessThanOrEqual(BUDGET.clsMax);

  if (FLAGS.strictPerf) {
    expect(lcp, `LCP too high (budget ${BUDGET.lcpMaxMs}ms)`).toBeLessThanOrEqual(BUDGET.lcpMaxMs);
  }
}

/* =============================================================================
   Theme control
============================================================================= */

async function setTheme(page: Page, theme: "light" | "dark" | "system_dark") {
  await page.evaluate((t) => {
    const root = (document.querySelector(".ff-root") as HTMLElement) || (document.documentElement as HTMLElement);
    root.setAttribute("data-theme", t);
  }, theme);
  await page.waitForTimeout(50);
}

/* =============================================================================
   Layout / Focus sanity
============================================================================= */

async function expectNoHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const a = de.scrollWidth <= de.clientWidth + 1;
    const b = body ? body.scrollWidth <= body.clientWidth + 1 : true;
    return a && b;
  });
  expect(ok, "Horizontal scroll trap detected").toBeTruthy();
}

async function expectFocusVisibleBasics(page: Page) {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const focusOk = await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (!ae) return false;
    if (ae === document.body || ae === document.documentElement) return false;

    const cs = getComputedStyle(ae);
    const hasOutline = cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth || "0") > 0;
    const hasShadow = (cs.boxShadow || "").trim() !== "none" && (cs.boxShadow || "").trim() !== "";
    return hasOutline || hasShadow;
  });

  expect(focusOk, "Focus-visible styling not detected on tab navigation").toBeTruthy();
}

/* =============================================================================
   CSS coverage audit (DOM symbols that should exist in ff.css)
============================================================================= */

async function expectCssCoverage(page: Page, label = "run") {
  const cssText = await fetchPrimaryStylesheetText(page);

  const cssSymbols = parseCssSymbols(cssText);
  const domSymbols = await collectDomSymbols(page);

  const missingClasses = diffSets(domSymbols.classes, cssSymbols.classes, (c) => {
    if (CLASS_ALLOWLIST.has(c)) return false;
    return c.startsWith("ff-") || c.startsWith("is-");
  });

  const missingIds = diffSets(domSymbols.ids, cssSymbols.ids, (id) => IMPORTANT_ID_RE.test(id));

  const missingDataAttrs = diffSets(domSymbols.dataAttrs, cssSymbols.dataAttrs, (a) => {
    if (DATAFF_ALLOWLIST.has(a)) return false;
    return a.startsWith("data-ff-");
  });

  const report = {
    missingClasses: Array.from(missingClasses).sort(),
    missingIds: Array.from(missingIds).sort(),
    missingDataAttrs: Array.from(missingDataAttrs).sort(),
    totals: {
      domClasses: domSymbols.classes.size,
      domIds: domSymbols.ids.size,
      domDataAttrs: domSymbols.dataAttrs.size,
      cssClasses: cssSymbols.classes.size,
      cssIds: cssSymbols.ids.size,
      cssDataAttrs: cssSymbols.dataAttrs.size,
    },
    // Helpful for debugging “where is this coming from?”
    debug: {
      pageUrl: page.url(),
      cssLooksEmpty: cssSymbols.classes.size + cssSymbols.ids.size + cssSymbols.dataAttrs.size === 0,
    },
  };

  test.info().attach(`css-coverage.${label}.json`, {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });

  writeJsonArtifacts(report, label);

  if (FLAGS.strictMissingSelectors) {
    expect(report.missingClasses, "Missing CSS class selectors detected").toEqual([]);
    expect(report.missingIds, "Missing CSS id selectors detected").toEqual([]);
    expect(report.missingDataAttrs, "Missing CSS [data-ff-*] selectors detected").toEqual([]);
  } else {
    expect(report.missingClasses.length, "Too many missing class selectors").toBeLessThanOrEqual(10);
  }
}

function writeJsonArtifacts(report: any, label: string) {
  const json = JSON.stringify(report, null, 2);

  const perTestPath = test.info().outputPath(`css-coverage.${label}.json`);
  fs.writeFileSync(perTestPath, json, "utf8");

  const rootOutDir = path.resolve(process.cwd(), "test-results");
  fs.mkdirSync(rootOutDir, { recursive: true });
  const rootPath = path.join(rootOutDir, `css-coverage.${label}.json`);
  fs.writeFileSync(rootPath, json, "utf8");
}

/**
 * Fetch the “primary” CSS text deterministically.
 * - Prefers link[href*="ff.css"]
 * - Falls back to first stylesheet link
 * - Rejects obviously-wrong payloads (empty, HTML error pages) to avoid false “missing selectors”
 */
async function fetchPrimaryStylesheetText(page: Page) {
  const href = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    const hrefs = links
  .map(l => l.getAttribute("href"))
  .filter(Boolean)
  .filter(h =>
    /ff\.css|ff\.(pages|components|flagship)|bundle|app\.css/i.test(h!)
  );

  expect(href, "No stylesheet link found in DOM").not.toBe("");

  const abs = new URL(href, page.url()).toString();
  const res = await page.request.get(abs);

  // If ff.css is 404/500, this should fail loudly here (not later as “missing selectors”).
  expect(res.ok(), `Failed to fetch stylesheet: ${abs}`).toBeTruthy();

  const text = await res.text();
  const ct = (res.headers()["content-type"] || "").toLowerCase();

  // Guardrail: prevent “HTML error page parsed as CSS” causing huge missing lists.
  const looksLikeHtml = /^\s*<!doctype html>|^\s*<html\b/i.test(text);
  const tooSmall = text.trim().length < 200;

  expect(!looksLikeHtml, `Stylesheet fetch returned HTML (likely an error page): ${abs}`).toBeTruthy();
  // content-type can be absent in dev; we don’t hard fail on ct mismatch, only on obvious junk.
  expect(!tooSmall, `Stylesheet content too small/suspicious (possibly empty): ${abs} (ct=${ct})`).toBeTruthy();

  return text;
}

function parseCssSymbols(cssText: string): CssSymbolSets {
  const txt = cssText.replace(/\/\*[\s\S]*?\*\//g, " ");

  const classes = new Set<string>();
  const ids = new Set<string>();
  const dataAttrs = new Set<string>();

  // Match `.ff-foo`, `.is-open`, and also `.ff-foo\:` (escaped tailwind-ish) — keep the core.
  const classRe = /\.((?:ff|is)-[a-zA-Z0-9_-]+)/g;
  const idRe = /#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  const dataRe = /\[\s*(data-ff-[a-zA-Z0-9_-]+)(?:[\s~|^$*]?=)?/g;

  let m: RegExpExecArray | null;
  while ((m = classRe.exec(txt))) classes.add(m[1]);
  while ((m = idRe.exec(txt))) ids.add(m[1]);
  while ((m = dataRe.exec(txt))) dataAttrs.add(m[1]);

  return { classes, ids, dataAttrs };
}

async function collectDomSymbols(page: Page): Promise<DomSymbolSets> {
  const raw = await page.evaluate(() => {
    const classes = new Set<string>();
    const ids = new Set<string>();
    const dataAttrs = new Set<string>();

    const root = document.querySelector(".ff-body") || document.body;
    const all = Array.from(root.querySelectorAll("*")) as HTMLElement[];

    for (const el of all) {
      for (const c of Array.from(el.classList || [])) {
        if (!c) continue;
        classes.add(c);
      }
      const id = el.getAttribute("id");
      if (id) ids.add(id);

      for (const attr of Array.from(el.attributes || [])) {
        const n = attr.name;
        if (n && n.startsWith("data-ff-")) dataAttrs.add(n);
      }
    }

    return {
      classes: Array.from(classes),
      ids: Array.from(ids),
      dataAttrs: Array.from(dataAttrs),
    };
  });

  return {
    classes: new Set<string>(raw.classes || []),
    ids: new Set<string>(raw.ids || []),
    dataAttrs: new Set<string>(raw.dataAttrs || []),
  };
}

function diffSets<T extends string>(dom: Set<T>, css: Set<T>, shouldCheck: (x: T) => boolean): Set<T> {
  const out = new Set<T>();
  for (const x of dom) {
    if (!shouldCheck(x)) continue;
    if (!css.has(x)) out.add(x);
  }
  return out;
}

/* =============================================================================
   Contrast audit (in-browser, deterministic, no external deps)
============================================================================= */

async function expectContrastAudit(
  page: Page,
  opts: { scopeSelector: string; label: string; onlyIfVisible?: boolean }
) {
  const fails = await page.evaluate((o) => {
    const scope = document.querySelector(o.scopeSelector) as HTMLElement | null;
    if (!scope) return { skipped: true, reason: `scope not found: ${o.scopeSelector}`, fails: [] as any[] };

    if (o.onlyIfVisible) {
      const cs = getComputedStyle(scope);
      const hidden = cs.display === "none" || cs.visibility === "hidden";
      const ariaHidden = scope.getAttribute("aria-hidden") === "true";
      const domHidden = (scope as any).hidden === true;
      if (hidden || ariaHidden || domHidden) {
        return { skipped: true, reason: `scope not visible: ${o.scopeSelector}`, fails: [] as any[] };
      }
    }

    function parseRGBA(s: string) {
      const m = s.match(
        /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/i
      );
      if (!m) return null;
      return {
        r: Math.max(0, Math.min(255, Number(m[1]))),
        g: Math.max(0, Math.min(255, Number(m[2]))),
        b: Math.max(0, Math.min(255, Number(m[3]))),
        a: m[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(m[4]))),
      };
    }

    function srgbToLin(c: number) {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }

    function luminance(rgb: { r: number; g: number; b: number }) {
      const R = srgbToLin(rgb.r);
      const G = srgbToLin(rgb.g);
      const B = srgbToLin(rgb.b);
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    }

    function contrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }) {
      const L1 = luminance(fg);
      const L2 = luminance(bg);
      const lighter = Math.max(L1, L2);
      const darker = Math.min(L1, L2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function blend(src: any, dst: any) {
      const a = src.a + dst.a * (1 - src.a);
      if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
      const r = (src.r * src.a + dst.r * dst.a * (1 - src.a)) / a;
      const g = (src.g * src.a + dst.g * dst.a * (1 - src.a)) / a;
      const b = (src.b * src.a + dst.b * dst.a * (1 - src.a)) / a;
      return { r, g, b, a };
    }

    function findEffectiveBg(el: Element) {
      let node: Element | null = el;
      let bg: any = null;

      const body = document.querySelector(".ff-body") as HTMLElement | null;
      const bodyBg = body ? parseRGBA(getComputedStyle(body).backgroundColor) : null;

      while (node) {
        const cs = getComputedStyle(node as HTMLElement);
        const c = parseRGBA(cs.backgroundColor);
        if (c && c.a > 0.01) {
          bg = bg ? blend(c, bg) : c;
          if (bg.a >= 0.98) return bg;
        }
        node = (node as HTMLElement).parentElement;
      }

      if (bg && bodyBg) return blend(bg, bodyBg);
      if (bg) return bg;
      if (bodyBg) return bodyBg;
      return { r: 255, g: 255, b: 255, a: 1 };
    }

    function cssPath(el: Element) {
      const parts: string[] = [];
      let node: Element | null = el;
      for (let i = 0; node && i < 5; i++) {
        const id = (node as HTMLElement).id ? `#${(node as HTMLElement).id}` : "";
        const cls =
          (node as HTMLElement).classList && (node as HTMLElement).classList.length
            ? "." + Array.from((node as HTMLElement).classList).slice(0, 3).join(".")
            : "";
        parts.unshift(`${node.tagName.toLowerCase()}${id}${cls}`);
        node = (node as HTMLElement).parentElement;
      }
      return parts.join(" > ");
    }

    function isVisible(el: HTMLElement) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (Number(cs.opacity || "1") < 0.02) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (el.closest("[hidden], [aria-hidden='true']")) return false;
      return true;
    }

    function isLargeText(cs: CSSStyleDeclaration) {
      const fs = Number.parseFloat(cs.fontSize || "0");
      const fw = Number.parseInt(cs.fontWeight || "400", 10) || 400;
      if (fs >= 24) return true;
      if (fs >= 18.66 && fw >= 700) return true;
      return false;
    }

    const candidates = Array.from(
      scope.querySelectorAll(":is(h1,h2,h3,h4,h5,h6,p,li,a,button,label,summary,span,small,strong,em,code)")
    ) as HTMLElement[];

    const out: any[] = [];

    for (const el of candidates) {
      if (!isVisible(el)) continue;

      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (el.children && el.children.length > 6 && text.length > 140) continue;

      const cs = getComputedStyle(el);
      const fg = parseRGBA(cs.color);
      if (!fg || fg.a < 0.02) continue;

      const bg = findEffectiveBg(el);
      const fgOverBg = fg.a < 1 ? blend(fg, bg) : fg;

      const ratio = contrastRatio(
        { r: fgOverBg.r, g: fgOverBg.g, b: fgOverBg.b },
        { r: bg.r, g: bg.g, b: bg.b }
      );

      const minRatio = isLargeText(cs) ? 3.0 : 4.5;

      if (ratio + 1e-6 < minRatio) {
        out.push({
          selector: cssPath(el),
          text: text.slice(0, 120),
          ratio,
          fg: cs.color,
          bg: `rgba(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}, ${Number(bg.a).toFixed(3)})`,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          tag: el.tagName.toLowerCase(),
        } satisfies ContrastFail);
      }
    }

    out.sort((a, b) => a.ratio - b.ratio);
    return { skipped: false, reason: "", fails: out.slice(0, 80) };
  }, opts);

  if (fails?.skipped) {
    test.info().attach(`contrast-${opts.label}-skipped.txt`, {
      body: String(fails.reason || "skipped"),
      contentType: "text/plain",
    });
    return;
  }

  test.info().attach(`contrast-${opts.label}.json`, {
    body: JSON.stringify(fails, null, 2),
    contentType: "application/json",
  });

  if (FLAGS.strictContrast) {
    expect(fails.fails, `Contrast failures detected in ${opts.label}`).toEqual([]);
  } else {
    expect(fails.fails.length, `Too many contrast failures in ${opts.label}`).toBeLessThanOrEqual(5);
  }
}

/* =============================================================================
   Checkout overlay UX gate (hit-testing + open/close)
============================================================================= */

async function openCheckout(page: Page) {
  const openHook = page.locator('[data-ff-open-checkout]').first();
  if (await openHook.count()) {
    await openHook.click({ timeout: 5000 });
  } else {
    await page.evaluate(() => {
      const a = document.querySelector('a[href="#checkout"]') as HTMLAnchorElement | null;
      if (a) a.click();
      else location.hash = "#checkout";
    });
  }

  await page.waitForTimeout(100);
  await expect(page.locator("#checkout")).toBeVisible({ timeout: 8000 });
}

async function closeCheckoutViaBackdrop(page: Page) {
  const backdrop = page.locator("#checkout .ff-sheet__backdrop, #checkout a.ff-sheet__backdrop").first();
  await expect(backdrop).toBeVisible({ timeout: 8000 });
  await backdrop.click({ timeout: 8000 });
  await page.waitForTimeout(120);

  await expect.poll(async () => await isCheckoutClosed(page), { timeout: 8000 }).toBe(true);
}

async function closeCheckoutViaCloseButton(page: Page) {
  const closeBtn = page.locator("#checkout [data-ff-close-checkout]").first();
  await expect(closeBtn).toBeVisible({ timeout: 8000 });
  await closeBtn.click({ timeout: 8000 });

  // If your JS clears hash on close, great. If not, we still allow “closed” by style/attrs.
  await page.waitForTimeout(120);
  await expect.poll(async () => await isCheckoutClosed(page), { timeout: 8000 }).toBe(true);
}

async function isCheckoutClosed(page: Page) {
  return await page.evaluate(() => {
    const el = document.querySelector("#checkout") as any;
    if (!el) return true;
    if (el.hidden === true) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    if (el.getAttribute("data-open") === "false") return true;

    const cs = getComputedStyle(el as HTMLElement);
    if (cs.display === "none" || cs.visibility === "hidden") return true;

    // If the hash is not #checkout and the overlay is not rendered as grid/block, treat as closed.
    if (location.hash !== "#checkout" && cs.display !== "grid" && cs.display !== "block") return true;

    return false;
  });
}

async function expectCheckoutOverlayUX(page: Page) {
  await test.step("open checkout", async () => {
    await openCheckout(page);
  });

  await test.step("close button is topmost clickable target", async () => {
    const closeBtn = page.locator("#checkout [data-ff-close-checkout]").first();
    await expect(closeBtn).toBeVisible({ timeout: 8000 });

    const box = await closeBtn.boundingBox();
    expect(box, "Close button has no bounding box (not rendered?)").toBeTruthy();

    const cx = Math.floor(box!.x + box!.width / 2);
    const cy = Math.floor(box!.y + box!.height / 2);

    const isTopmost = await page.evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      const btn = document.querySelector("#checkout [data-ff-close-checkout]");
      if (!top || !btn) return false;
      return top === btn || (btn as HTMLElement).contains(top);
    }, { x: cx, y: cy });

    expect(isTopmost, "Close button is NOT the topmost clickable target (layer intercept)").toBeTruthy();
  });

  await test.step("close via backdrop (click outside)", async () => {
    await closeCheckoutViaBackdrop(page);
  });

  await test.step("open via :target and close via close button", async () => {
    await page.evaluate(() => {
      location.hash = "#checkout";
    });
    await expect(page.locator("#checkout")).toBeVisible({ timeout: 8000 });

    await closeCheckoutViaCloseButton(page);
  });
}

/* =============================================================================
   EOF
============================================================================= */
