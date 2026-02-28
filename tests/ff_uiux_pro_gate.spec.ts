import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/* ============================================================================
FutureFunded • UI/UX Pro Gate (CSS + A11y + Overlay + Smoke)
File: tests/ff_uiux_pro_gate.spec.ts
DROP-IN • Deterministic • CI-friendly

Contracts:
- Theme set on .ff-root[data-theme]
- CSS coverage: ff-* / is-* / data-ff-* hooks used in DOM must exist as selectors in CSS (allowlists supported)
- Overlay open:  :target OR .is-open OR [data-open="true"] OR [aria-hidden="false"]
- Overlay close: [hidden] OR [data-open="false"] OR [aria-hidden="true"]
============================================================================ */

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
function envList(name: string): string[] {
  const v = String(process.env[name] ?? "").trim();
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

const FLAGS = {
  strictMissingSelectors: envBool("FF_STRICT_MISSING", true),
  strictContrast: envBool("FF_STRICT_CONTRAST", true),
  strictPerf: envBool("FF_STRICT_PERF", false),
  snapshots: envBool("FF_SNAPSHOTS", false),
};

const BUDGET = {
  clsMax: envNum("FF_BUDGET_CLS", 0.15),
  lcpMaxMs: envNum("FF_BUDGET_LCP_MS", 3800),
};

const CONTRAST_MAX_FAILS = envNum("FF_CONTRAST_MAX_FAILS", 0);
const CONTRAST_IGNORE_SELECTORS = envList("FF_CONTRAST_IGNORE_SELECTORS");

const IMPORTANT_ID_RE = /^(ff|hero|progress|trust|tier|sponsor|checkout|drawer)/i;

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

test.describe("FutureFunded • UI/UX Pro Gate (CSS + A11y + Overlay + Smoke)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Gate: DARK theme (home + checkout)", async ({ page, baseURL }) => {
    await runGate(page, baseURL ?? "/", "dark");
  });

  test("Gate: LIGHT theme (home + checkout)", async ({ page, baseURL }) => {
    await runGate(page, baseURL ?? "/", "light");
  });
});

async function runGate(page: Page, url: string, theme: "light" | "dark" | "system_dark") {
  await installPerfObservers(page);
  const guard = installConsoleAndNetworkGuards(page);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await setTheme(page, theme);

  await expectNoHorizontalScroll(page);
  await expectFocusVisibleBasics(page);

  await expectCssCoverage(page, theme);

  await expectContrastAudit(page, { scopeSelector: ".ff-body", label: `${theme}-home` });

  await expectCheckoutOverlayUX(page);
  await expectContrastAudit(page, { scopeSelector: "#checkout", label: `${theme}-checkout`, onlyIfVisible: true });

  if (FLAGS.snapshots) await takeSnapshots(page, theme);

  await expectPerfBudgets(page);
  await guard.assertClean();
}

/* ----------------- snapshots ----------------- */

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

/* ----------------- guards ----------------- */

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
    const f = req.failure();
    failedRequests.push(`${req.method()} ${req.url()} :: ${f?.errorText ?? "requestfailed"}`);
  });
  page.on("response", (res) => {
    const u = res.url();
    const status = res.status();
    const isLocal =
      u.startsWith("http://127.0.0.1") ||
      u.startsWith("http://localhost") ||
      u.startsWith("https://127.0.0.1") ||
      u.startsWith("https://localhost");
    if (isLocal && status >= 400) badResponses.push(`${status} ${u}`);
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

/* ----------------- perf ----------------- */

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

/* ----------------- theme ----------------- */

async function setTheme(page: Page, theme: "light" | "dark" | "system_dark") {
  await page.evaluate((t) => {
    const root = (document.querySelector(".ff-root") as HTMLElement) || (document.documentElement as HTMLElement);
    root.setAttribute("data-theme", t);
  }, theme);
  await page.waitForTimeout(50);
}

/* ----------------- layout + focus ----------------- */

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
  const id = "__ff_focus_probe__";

  await page.evaluate((probeId) => {
    const existing = document.getElementById(probeId);
    if (existing) existing.remove();

    const btn = document.createElement("button");
    btn.id = probeId;
    btn.type = "button";
    btn.textContent = "focus-probe";
    btn.setAttribute("aria-label", "Focus Visible Probe");

    btn.style.position = "fixed";
    btn.style.left = "-9999px";
    btn.style.top = "8px";
    btn.style.opacity = "0";
    btn.style.pointerEvents = "none";

    document.body.prepend(btn);
  }, id);

  await page.mouse.click(2, 2).catch(() => {});
  await page.keyboard.press("Tab");

  const res = await page.evaluate((probeId) => {
    const el = document.getElementById(probeId) as HTMLElement | null;
    if (!el) return { ok: false, why: "probe-missing" };

    const active = document.activeElement === el;
    const cs = window.getComputedStyle(el);

    const outlineW = parseFloat(cs.outlineWidth || "0") || 0;
    const hasOutline = cs.outlineStyle !== "none" && outlineW > 0;

    const bs = (cs.boxShadow || "").trim();
    const hasBoxShadow = bs && bs !== "none";

    el.remove();

    return { ok: true, active, hasOutline, hasBoxShadow, outline: cs.outline, boxShadow: cs.boxShadow };
  }, id);

  if (!res || !res.ok) throw new Error("focus-visible probe failed: " + JSON.stringify(res));
  if (!res.active) throw new Error("focus-visible probe did not receive focus via Tab");
  if (!(res.hasOutline || res.hasBoxShadow)) {
    throw new Error("No focus ring detected (expected outline or box-shadow).");
  }
}

/* ----------------- CSS coverage ----------------- */

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

async function fetchPrimaryStylesheetText(page: Page): Promise<string> {
  const href = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    const hrefs = links.map((l) => (l.getAttribute("href") || "").trim()).filter(Boolean);

    const preferred =
      hrefs.find((h) => /(^|\/|\b)ff\.css(\?|$)/i.test(h)) ||
      hrefs.find((h) => /ff\.(pages|components|flagship)|bundle|app\.css/i.test(h)) ||
      hrefs[0] ||
      "";

    return preferred;
  });

  const pick = href && href.trim() ? href.trim() : "/static/css/ff.css";
  const abs = new URL(pick, page.url()).toString();

  const res = await page.request.get(abs);
  expect(res.ok(), `Failed to fetch stylesheet: ${abs} (status ${res.status()})`).toBeTruthy();

  const text = await res.text();
  const headers = (res.headers && res.headers()) || {};
  const ct = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();

  const looksLikeHtml = /^\s*<!doctype html>|^\s*<html\b/i.test(text);
  const tooSmall = text.trim().length < 200;

  expect(!looksLikeHtml, `Stylesheet fetch returned HTML (likely error page): ${abs}`).toBeTruthy();
  expect(!tooSmall, `Stylesheet content too small/suspicious: ${abs} (ct=${ct})`).toBeTruthy();

  return text;
}

function parseCssSymbols(cssText: string): CssSymbolSets {
  const txt = cssText.replace(/\/\*[\s\S]*?\*\//g, " ");

  const classes = new Set<string>();
  const ids = new Set<string>();
  const dataAttrs = new Set<string>();

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
      for (const c of Array.from(el.classList || [])) if (c) classes.add(c);

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

/* ----------------- contrast ----------------- */

async function expectContrastAudit(page: Page, opts: { scopeSelector: string; label: string; onlyIfVisible?: boolean }) {
  const fails = await page.evaluate(
    (o) => {
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

      const ignore = (o.ignoreSelectors || []) as string[];

      function matchesIgnore(el: Element) {
        for (const sel of ignore) {
          try {
            if (sel && el.matches(sel)) return true;
            if (sel && (el as HTMLElement).closest && (el as HTMLElement).closest(sel)) return true;
          } catch {}
        }
        return false;
      }

      function parseRGBA(s: string) {
        const m = s.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/i);
        if (!m) return null;
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      }

      function srgbToLin(c: number) {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }

      function luminance(rgb: { r: number; g: number; b: number }) {
        return 0.2126 * srgbToLin(rgb.r) + 0.7152 * srgbToLin(rgb.g) + 0.0722 * srgbToLin(rgb.b);
      }

      function contrastRatio(fg: any, bg: any) {
        const L1 = luminance(fg);
        const L2 = luminance(bg);
        const lighter = Math.max(L1, L2);
        const darker = Math.min(L1, L2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function blend(src: any, dst: any) {
        const a = src.a + dst.a * (1 - src.a);
        if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
        return {
          r: (src.r * src.a + dst.r * dst.a * (1 - src.a)) / a,
          g: (src.g * src.a + dst.g * dst.a * (1 - src.a)) / a,
          b: (src.b * src.a + dst.b * dst.a * (1 - src.a)) / a,
          a,
        };
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
        return fs >= 24 || (fs >= 18.66 && fw >= 700);
      }

      const candidates = Array.from(scope.querySelectorAll(":is(h1,h2,h3,h4,h5,h6,p,li,a,button,label,summary,span,small,strong,em,code)")) as HTMLElement[];
      const out: any[] = [];

      for (const el of candidates) {
        if (!isVisible(el)) continue;
        if (matchesIgnore(el)) continue;

        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;

        const cs = getComputedStyle(el);
        const fg = parseRGBA(cs.color);
        if (!fg || fg.a < 0.02) continue;

        const bg = findEffectiveBg(el);
        const fgOverBg = fg.a < 1 ? blend(fg, bg) : fg;

        const ratio = contrastRatio({ r: fgOverBg.r, g: fgOverBg.g, b: fgOverBg.b }, { r: bg.r, g: bg.g, b: bg.b });
        const minRatio = isLargeText(cs) ? 3.0 : 4.5;

        if (ratio + 1e-6 < minRatio) {
          out.push({
            selector: cssPath(el),
            text: text.slice(0, 120),
            ratio,
            fg: cs.color,
            bg: cs.backgroundColor,
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            tag: el.tagName.toLowerCase(),
          } satisfies ContrastFail);
        }
      }

      out.sort((a, b) => a.ratio - b.ratio);
      return { skipped: false, reason: "", fails: out.slice(0, 120) };
    },
    { ...opts, ignoreSelectors: CONTRAST_IGNORE_SELECTORS }
  );

  if ((fails as any)?.skipped) {
    test.info().attach(`contrast-${opts.label}-skipped.txt`, {
      body: String((fails as any).reason || "skipped"),
      contentType: "text/plain",
    });
    return;
  }

  test.info().attach(`contrast-${opts.label}.json`, {
    body: JSON.stringify(fails, null, 2),
    contentType: "application/json",
  });

  const n = Array.isArray((fails as any).fails) ? (fails as any).fails.length : 0;

  if (FLAGS.strictContrast) {
    expect(n, `Contrast failures detected in ${opts.label}`).toBeLessThanOrEqual(CONTRAST_MAX_FAILS);
  } else {
    expect(n, `Too many contrast failures in ${opts.label}`).toBeLessThanOrEqual(5);
  }
}

/* ----------------- checkout overlay UX ----------------- */

async function openCheckout(page: Page) {
  const hook = page.locator("[data-ff-open-checkout]").first();
  if (await hook.count()) {
    await hook.click({ force: true }).catch(() => {});
  } else {
    await page.evaluate(() => {
      const a = document.querySelector('a[href="#checkout"]') as HTMLAnchorElement | null;
      if (a) a.click();
      else location.hash = "#checkout";
    });
  }

  await page.waitForTimeout(50);
  if (!page.url().includes("#checkout")) {
    await page.evaluate(() => {
      if (location.hash !== "#checkout") location.hash = "#checkout";
    });
  }

  await expect(page.locator("#checkout")).toBeVisible({ timeout: 12_000 }).catch(() => {});
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

    const isOpen = el.classList?.contains("is-open") || el.getAttribute("data-open") === "true" || el.getAttribute("aria-hidden") === "false" || location.hash === "#checkout";
    return !isOpen;
  });
}

async function closeCheckoutViaBackdrop(page: Page) {
  const clicked = await page.evaluate(() => {
    const sels = ["#checkout [data-ff-backdrop]", "#checkout .ff-sheet__backdrop", "#checkout .ff-backdrop", "#checkout .backdrop"];
    for (const sel of sels) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      const cs = getComputedStyle(el);
      const hidden =
        (el as any).hidden === true ||
        el.hasAttribute("hidden") ||
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        Number(cs.opacity || "1") < 0.02;
      if (!hidden) {
        el.click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) await page.mouse.click(2, 2);

  await page.waitForTimeout(120);
  await expect.poll(async () => await isCheckoutClosed(page), { timeout: 10_000 }).toBe(true);
}

async function closeCheckoutViaCloseButton(page: Page) {
  const btn = page.locator("#checkout [data-ff-close-checkout]:not(.ff-sheet__backdrop):not(.ff-backdrop):not(.backdrop), #checkout .ff-sheet__close").first();
  if (await btn.count()) {
    await expect(btn).toBeVisible({ timeout: 8000 });
    await btn.click({ force: true });
  } else {
    await page.keyboard.press("Escape");
  }

  await page.waitForTimeout(120);
  await expect.poll(async () => await isCheckoutClosed(page), { timeout: 10_000 }).toBe(true);
}

async function expectCheckoutOverlayUX(page: Page) {
  await test.step("open checkout", async () => {
    await openCheckout(page);
  });

  await test.step("close via backdrop", async () => {
    await closeCheckoutViaBackdrop(page);
  });

  await test.step("open via :target and close via close action", async () => {
    await page.evaluate(() => {
      location.hash = "#checkout";
    });
    await expect(page.locator("#checkout")).toBeVisible({ timeout: 8000 }).catch(() => {});
    await closeCheckoutViaCloseButton(page);
  });
}
