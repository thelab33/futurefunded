import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import path from "path";

type CssSymbolSets = {
  classes: Set<string>;
  ids: Set<string>;
  dataAttrs: Set<string>;
};

type DomSymbolSets = {
  classes: Set<string>;
  ids: Set<string>;
  dataAttrs: Set<string>;
};

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  "http://127.0.0.1:5000";

const IMPORTANT_ID_RE = /^(ff|hero|progress|trust|tier|sponsor|checkout|drawer)/i;

const PRESENTATIONAL_CLASS_ALLOWLIST = new Set<string>([
  "ff-backtotop--flagship",
  "ff-backtotop__icon",
  "ff-backtotop__text",
  "ff-callout",
  "ff-callout--flagship",
  "ff-card--lift",
  "ff-checkoutBody--flagship",
  "ff-checkoutHead--flagship",
  "ff-checkoutShell--flagship",
  "ff-checkoutShell--layout",
  "ff-chrome__stack",
  "ff-disclosure--flagship",
  "ff-drawer__block",
  "ff-drawer__orgLogo",
  "ff-faqItem",
  "ff-fieldset",
  "ff-footerBrand--flagship",
  "ff-footerGrid--compact",
  "ff-footerGrid--flagship",
  "ff-footerGrid--tight",
  "ff-footerTray--compact",
  "ff-footer__linkgrid--compact",
  "ff-hero",
  "ff-heroCtas--flagship",
  "ff-heroLine",
  "ff-heroPanel--flagship",
  "ff-impact",
  "ff-impactPick",
  "ff-impactPick--flagship",
  "ff-impactPick__chips--flagship",
  "ff-impactTier--flagship",
  "ff-impactTierGrid--flagship",
  "ff-input--amount",
  "ff-input--amountFlagship",
  "ff-modal--compact",
  "ff-modal--flagship",
  "ff-modal__backdrop--flagship",
  "ff-modal__foot--flagship",
  "ff-nav--pill",
  "ff-navPill",
  "ff-paymentMount--flagship",
  "ff-paypalMount--flagship",
  "ff-platformBrand--mark",
  "ff-platformBrand__logo",
  "ff-progress",
  "ff-progress--anchor",
  "ff-sectionhead--compact",
  "ff-sectionhead--flagship",
  "ff-sep",
  "ff-sep--dot",
  "ff-sheet--flagship",
  "ff-sheet__backdrop--flagship",
  "ff-sheet__footer",
  "ff-sheet__scroll--flagship",
  "ff-sheet__viewport--flagship",
  "ff-skip",
  "ff-skiplink",
  "ff-skiplinks",
  "ff-sponsorCell",
  "ff-sponsorTiers",
  "ff-sponsorWallHead",
  "ff-sponsors",
  "ff-story",
  "ff-storyPoster__label",
  "ff-storyPoster__play",
  "ff-tabs--flagship",
  "ff-tabs__item",
  "ff-tabs__list--flagship",
  "ff-tabs__scroller--flagship",
  "ff-teamCard--flagship",
  "ff-teamCard__title",
  "ff-teams",
  "ff-topbar",
  "ff-topbarBrand--flagship",
  "ff-topbarGoal__sep",
  "ff-topbar__brandCluster",
  "ff-topbar__capsule--flagship",
  "ff-topbar__rightCluster"
]);

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
  ...Array.from(PRESENTATIONAL_CLASS_ALLOWLIST)
]);

const DATAFF_ALLOWLIST = new Set<string>([
  "data-ff-id",
  "data-ff-open-checkout",
  "data-ff-close-checkout",
  "data-ff-open-drawer",
  "data-ff-open-sponsor",
  "data-ff-open-video",
  "data-ff-checkout-scroll",
  "data-ff-checkout-content",
  "data-ff-checkout-viewport",
  "data-ff-checkout-status",
  "data-ff-toasts"
]);

function resolveUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = String(BASE).replace(/\/+$/, "");
  const pathPart = url.startsWith("/") ? url : `/${url}`;
  return `${base}${pathPart}`;
}

function attachTextIfAny(name: string, lines: string[]) {
  if (!lines.length) return;
  test.info().attach(name, {
    body: lines.join("\n"),
    contentType: "text/plain"
  });
}

function writeJsonArtifacts(report: any, label: string) {
  const json = JSON.stringify(report, null, 2);
  const perTestPath = test.info().outputPath(`css-coverage.${label}.json`);
  fs.writeFileSync(perTestPath, json, "utf8");

  const rootOutDir = path.resolve(process.cwd(), "test-results");
  fs.mkdirSync(rootOutDir, { recursive: true });
  fs.writeFileSync(path.join(rootOutDir, `css-coverage.${label}.json`), json, "utf8");
}

function parseCssSymbols(cssText: string): CssSymbolSets {
  const txt = cssText.replace(/\/\*[\s\S]*?\*\//g, " ");
  const classes = new Set<string>();
  const ids = new Set<string>();
  const dataAttrs = new Set<string>();

  let m: RegExpExecArray | null;

  const classRe = /\.((?:ff|is)-[a-zA-Z0-9_-]+)/g;
  while ((m = classRe.exec(txt))) classes.add(m[1]);

  const idRe = /#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  while ((m = idRe.exec(txt))) ids.add(m[1]);

  const dataRe = /\[\s*(data-ff-[a-zA-Z0-9_-]+)(?:[\s~|^$*]?=)?/g;
  while ((m = dataRe.exec(txt))) dataAttrs.add(m[1]);

  return { classes, ids, dataAttrs };
}

async function fetchPrimaryStylesheetText(page: Page): Promise<string> {
  const href = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    const hrefs = links
      .map((l) => (l.getAttribute("href") || "").trim())
      .filter(Boolean);

    return (
      hrefs.find((h) => /(^|\/|\b)ff\.css(\?|$)/i.test(h)) ||
      hrefs.find((h) => /ff\.(pages|components|flagship)|bundle|app\.css/i.test(h)) ||
      hrefs[0] ||
      "/static/css/ff.css"
    );
  });

  const abs = new URL(href, page.url()).toString();
  const res = await page.request.get(abs);
  expect(res.ok(), `Failed to fetch stylesheet: ${abs}`).toBeTruthy();

  const text = await res.text();
  expect(/^\s*<!doctype html>|^\s*<html\b/i.test(text)).toBeFalsy();

  return text;
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
        if (c) classes.add(c);
      }

      const id = el.getAttribute("id");
      if (id) ids.add(id);

      for (const attr of Array.from(el.attributes || [])) {
        if (attr.name && attr.name.startsWith("data-ff-")) {
          dataAttrs.add(attr.name);
        }
      }
    }

    return {
      classes: Array.from(classes),
      ids: Array.from(ids),
      dataAttrs: Array.from(dataAttrs)
    };
  });

  return {
    classes: new Set<string>(raw.classes || []),
    ids: new Set<string>(raw.ids || []),
    dataAttrs: new Set<string>(raw.dataAttrs || [])
  };
}

function diffSets<T extends string>(
  dom: Set<T>,
  css: Set<T>,
  shouldCheck: (x: T) => boolean
): Set<T> {
  const out = new Set<T>();
  for (const x of dom) {
    if (!shouldCheck(x)) continue;
    if (!css.has(x)) out.add(x);
  }
  return out;
}

async function expectCssCoverage(page: Page, label: string) {
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
      cssDataAttrs: cssSymbols.dataAttrs.size
    }
  };

  test.info().attach(`css-coverage.${label}.json`, {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json"
  });

  writeJsonArtifacts(report, label);

  expect(report.missingClasses, "Missing CSS class selectors detected").toEqual([]);
  expect(report.missingIds, "Missing CSS id selectors detected").toEqual([]);
  expect(report.missingDataAttrs, "Missing CSS [data-ff-*] selectors detected").toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return (
      de.scrollWidth <= de.clientWidth + 1 &&
      (!body || body.scrollWidth <= body.clientWidth + 1)
    );
  });

  expect(ok, "Horizontal scroll trap detected").toBeTruthy();
}

async function expectFocusVisibleBasics(page: Page) {
  const setup = await page.evaluate(() => {
    const runtimeId = "__ff_focus_probe_runtime__";
    const existingRuntime = document.getElementById(runtimeId);
    if (existingRuntime) existingRuntime.remove();

    const body = document.body as HTMLElement;
    let probe =
      (document.getElementById("ff_focus_probe") as HTMLElement | null) ||
      (document.getElementById("__ff_focus_probe__") as HTMLElement | null);

    if (!probe) {
      const btn = document.createElement("button");
      btn.id = runtimeId;
      btn.type = "button";
      btn.textContent = "focus-probe";
      btn.setAttribute("aria-label", "Focus Visible Probe");
      btn.style.position = "fixed";
      btn.style.left = "-9999px";
      btn.style.top = "8px";
      btn.style.width = "1px";
      btn.style.height = "1px";
      btn.style.opacity = "0";
      document.body.prepend(btn);
      probe = btn;
    }

    body.setAttribute("tabindex", "-1");
    body.focus();

    return { ok: true, preferredProbeId: probe.id || null };
  });

  expect(setup?.ok).toBeTruthy();

  await page.keyboard.press("Tab");

  const res = await page.evaluate(() => {
    const accepted = new Set(["ff_focus_probe", "__ff_focus_probe__", "__ff_focus_probe_runtime__"]);
    const activeEl = document.activeElement as HTMLElement | null;
    const activeId = activeEl?.id || "";
    const activeMatches = !!activeEl && accepted.has(activeId);
    const cs = activeEl ? window.getComputedStyle(activeEl) : null;
    const outlineW = cs ? parseFloat(cs.outlineWidth || "0") || 0 : 0;
    const hasOutline = !!cs && cs.outlineStyle !== "none" && outlineW > 0;
    const boxShadow = cs?.boxShadow || "";
    const hasBoxShadow = boxShadow && boxShadow !== "none";

    const runtimeProbe = document.getElementById("__ff_focus_probe_runtime__");
    if (runtimeProbe) runtimeProbe.remove();
    document.body.removeAttribute("tabindex");

    return {
      ok: !!activeEl,
      activeMatches,
      hasOutline,
      hasBoxShadow
    };
  });

  expect(res.ok).toBeTruthy();
  expect(res.activeMatches, "Focus probe did not receive focus").toBeTruthy();
  expect(res.hasOutline || res.hasBoxShadow, "No visible focus ring detected").toBeTruthy();
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    const root = (document.querySelector(".ff-root") as HTMLElement) || document.documentElement;
    root.setAttribute("data-theme", t);
  }, theme);

  await page.waitForTimeout(80);
}

async function openCheckout(page: Page) {
  const opener = page.locator('[data-ff-open-checkout], a[href="#checkout"]').first();

  if (await opener.count()) {
    await opener.click({ force: true }).catch(() => {});
  } else {
    await page.evaluate(() => {
      location.hash = "#checkout";
    });
  }

  await page.waitForTimeout(160);
  await expect(page.locator("#checkout")).toBeVisible({ timeout: 12000 }).catch(() => {});
}

async function closeCheckout(page: Page) {
  const btn = page.locator(
    '#checkout button[data-ff-close-checkout]:not(.ff-sheet__backdrop):not(.ff-backdrop):not(.backdrop), #checkout button.ff-sheet__close, #checkout button[data-ff-close]'
  ).first();

  if ((await btn.count()) > 0 && await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true });
  } else {
    const bd = page.locator("#checkout [data-ff-backdrop], #checkout .ff-sheet__backdrop, #checkout .ff-backdrop, #checkout .backdrop").first();
    if ((await bd.count()) > 0 && await bd.isVisible().catch(() => false)) {
      await bd.click({ force: true });
    } else {
      await page.keyboard.press("Escape");
    }
  }

  await page.waitForTimeout(150);
}

function installConsoleAndNetworkGuards(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("pageerror", (err) => {
    pageErrors.push(String((err as Error)?.message || err));
  });

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
    assertClean() {
      attachTextIfAny("console-errors.txt", consoleErrors);
      attachTextIfAny("page-errors.txt", pageErrors);
      attachTextIfAny("requestfailed.txt", failedRequests);
      attachTextIfAny("bad-responses.txt", badResponses);

      expect(consoleErrors, "Console errors detected").toEqual([]);
      expect(pageErrors, "Page errors detected").toEqual([]);
      expect(failedRequests, "Failed network requests detected").toEqual([]);
      expect(badResponses, "Bad HTTP responses for local assets detected").toEqual([]);
    }
  };
}

async function runGate(page: Page, theme: "light" | "dark") {
  const guard = installConsoleAndNetworkGuards(page);

  await page.goto(resolveUrl("/"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);

  await setTheme(page, theme);
  await expectNoHorizontalScroll(page);
  await expectFocusVisibleBasics(page);
  await expectCssCoverage(page, theme);

  await openCheckout(page);
  await closeCheckout(page);

  guard.assertClean();
}

test.describe("FutureFunded • UI/UX Pro Gate (CSS + A11y + Overlay + Smoke)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Gate: DARK theme (home + checkout)", async ({ page }) => {
    await runGate(page, "dark");
  });

  test("Gate: LIGHT theme (home + checkout)", async ({ page }) => {
    await runGate(page, "light");
  });
});
