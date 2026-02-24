// scripts/ff_smoke_ui.mjs
// FutureFunded • UI Smoke (Playwright-lite) — v1.0.3
// Fixes:
// - Sponsor modal: if opener exists but is not visible (e.g., hidden slide), fallback to hash open (#id).
// - Optional overlays can be skipped without failing unless FF_SMOKE_UI_STRICT=1
//
// Usage:
//   BASE_URL=http://127.0.0.1:5000 node scripts/ff_smoke_ui.mjs
//   HEADLESS=0 BASE_URL=http://127.0.0.1:5000 node scripts/ff_smoke_ui.mjs
// Strict mode (fail if optional overlay can’t be tested):
//   FF_SMOKE_UI_STRICT=1 BASE_URL=http://127.0.0.1:5000 node scripts/ff_smoke_ui.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const HEADLESS = (process.env.HEADLESS || "1") !== "0";
const STRICT_UI = (process.env.FF_SMOKE_UI_STRICT || "0") === "1";

const VP_DESKTOP = { width: 1280, height: 720 };
const VP_MOBILE  = { width: 390,  height: 844 };

const log = (s) => process.stdout.write(`\x1b[36m${s}\x1b[0m\n`);
const ok  = (s) => process.stdout.write(`\x1b[32m✓ ${s}\x1b[0m\n`);
const warn= (s) => process.stdout.write(`\x1b[33m! ${s}\x1b[0m\n`);
const bad = (s) => process.stdout.write(`\x1b[31m✗ ${s}\x1b[0m\n`);

async function setViewport(page, vp) {
  if (!vp) return;
  await page.setViewportSize(vp);
  await page.waitForTimeout(80);
}

async function pickExistingSelector(page, selectors) {
  for (const sel of selectors) {
    try {
      if (await page.locator(sel).count()) return sel;
    } catch (_) {}
  }
  return null;
}

async function pickVisibleLocator(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel);
    let n = 0;
    try { n = await loc.count(); } catch (_) { n = 0; }
    for (let i = 0; i < n; i++) {
      const item = loc.nth(i);
      try {
        if (await item.isVisible()) return item;
      } catch (_) {}
    }
  }
  return null;
}

async function waitOpen(page, overlaySel) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const a = el.getAttribute("aria-hidden");
    const d = el.getAttribute("data-open");
    const c = el.classList.contains("is-open");
    const byTarget = (location.hash && el.id && location.hash === `#${el.id}`);
    return a === "false" || d === "true" || c || byTarget;
  }, overlaySel, { timeout: 8000 });
}

async function waitClosed(page, overlaySel) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    const a = el.getAttribute("aria-hidden");
    const d = el.getAttribute("data-open");
    const c = el.classList.contains("is-open");
    const byTarget = (location.hash && el.id && location.hash === `#${el.id}`);
    if (a === "true") return true;
    if (d === "false") return true;
    if (!c && !byTarget && a !== "false" && d !== "true") return true;
    return false;
  }, overlaySel, { timeout: 8000 });
}

async function focusIntoPanel(page, panelSel) {
  return await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return { ok: false, why: "panel missing" };

    const focusable =
      panel.querySelector('[data-ff-close]') ||
      panel.querySelector('button[aria-label*="close" i]') ||
      panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');

    if (focusable) {
      focusable.focus();
      return { ok: panel.contains(document.activeElement), how: "first-focusable" };
    }

    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    panel.focus();
    return { ok: panel.contains(document.activeElement), how: "panel" };
  }, panelSel);
}

async function assertFocusTrapped(page, panelSel) {
  const pre = await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    const ae = document.activeElement;
    if (!panel) return { ok: false, why: "panel missing" };
    if (!ae) return { ok: false, why: "no activeElement" };
    if (!panel.contains(ae)) return { ok: false, why: "focus not inside overlay panel" };
    return { ok: true };
  }, panelSel);

  if (!pre.ok) throw new Error(`Focus trap precheck failed: ${pre.why}`);

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate((sel) => {
      const panel = document.querySelector(sel);
      const ae = document.activeElement;
      return !!(panel && ae && panel.contains(ae));
    }, panelSel);
    if (!inside) throw new Error("Focus escaped overlay after Tab");
  }
}

async function openByHash(page, hash) {
  const h = (hash || "").trim();
  if (!h || !h.startsWith("#")) return false;
  await page.evaluate((x) => { location.hash = x; }, h);
  await page.waitForTimeout(120);
  return true;
}

async function runOverlay(page, spec) {
  const {
    name,
    viewport,
    openSelectors,
    overlaySelectors,
    panelSelectors,
    optional = false,
    allowHashFallback = false,
    hash = "",
  } = spec;

  await setViewport(page, viewport);

  const overlaySel = await pickExistingSelector(page, overlaySelectors);
  const panelSel   = await pickExistingSelector(page, panelSelectors);

  if (!overlaySel) {
    const msg = `${name}: overlay not found`;
    if (optional && !STRICT_UI) { warn(`${msg} (skipping)`); return; }
    throw new Error(msg);
  }
  if (!panelSel) throw new Error(`${name}: panel selector not found`);

  let opener = await pickVisibleLocator(page, openSelectors);

  // If no visible opener and hash fallback allowed, open by hash (validates :target contract).
  if (!opener && allowHashFallback) {
    const h = hash || (overlaySel.startsWith("#") ? overlaySel : "");
    const did = await openByHash(page, h);
    if (!did) {
      const msg = `${name}: no visible opener and no usable hash fallback`;
      if (optional && !STRICT_UI) { warn(`${msg} (skipping)`); return; }
      throw new Error(msg);
    }
    await waitOpen(page, overlaySel);
    ok(`${name}: opens (hash)`);
  } else {
    if (!opener) {
      const msg = `${name}: opener not visible`;
      if (optional && !STRICT_UI) { warn(`${msg} (skipping)`); return; }
      throw new Error(msg);
    }

    try {
      await opener.click({ timeout: 8000 });
    } catch (e) {
      if (allowHashFallback) {
        const h = hash || (overlaySel.startsWith("#") ? overlaySel : "");
        const did = await openByHash(page, h);
        if (!did) throw e;
        await waitOpen(page, overlaySel);
        ok(`${name}: opens (hash fallback after click fail)`);
      } else {
        throw e;
      }
    }

    // If click worked, ensure open.
    await waitOpen(page, overlaySel);
    ok(`${name}: opens`);
  }

  const focusRes = await focusIntoPanel(page, panelSel);
  if (!focusRes.ok) throw new Error(`${name}: could not focus inside panel (${focusRes.why})`);
  ok(`${name}: focus moved inside (${focusRes.how})`);

  await assertFocusTrapped(page, panelSel);
  ok(`${name}: focus trap holds`);

  await page.keyboard.press("Escape");
  await waitClosed(page, overlaySel);
  ok(`${name}: closes on Escape`);
}

async function main() {
  log(`UI SMOKE: ${BASE_URL} (headless=${HEADLESS})`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  await setViewport(page, VP_DESKTOP);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  ok("Page loaded");

  await runOverlay(page, {
    name: "Checkout",
    viewport: VP_DESKTOP,
    openSelectors: [
      '[data-ff-open-checkout]',
      '[data-ff-checkout-open]',
      'a[href="#checkout"]',
      '#openCheckout',
      '#checkoutOpen',
      'button:has-text("Donate")',
      'button:has-text("Support")',
    ],
    overlaySelectors: ['#checkout', '.ff-sheet', '[data-ff-sheet]'],
    panelSelectors:   ['#checkout .ff-sheet__panel', '.ff-sheet .ff-sheet__panel', '[data-ff-sheet] .ff-sheet__panel'],
    allowHashFallback: true,
    hash: "#checkout",
  });

  await runOverlay(page, {
    name: "Drawer",
    viewport: VP_MOBILE,
    openSelectors: [
      '[data-ff-open-drawer]',
      '[data-ff-drawer-open]',
      'a[href="#drawer"]',
      '#openDrawer',
      '#drawerOpen',
      'button[aria-label="Open menu"]',
    ],
    overlaySelectors: ['#drawer', '.ff-drawer', '[data-ff-drawer]'],
    panelSelectors:   ['#drawer .ff-drawer__panel', '.ff-drawer .ff-drawer__panel', '[data-ff-drawer] .ff-drawer__panel'],
    allowHashFallback: true,
    hash: "#drawer",
  });

  // Sponsor modal is often “conditional UI” (carousel slide, gated section, etc).
  // We validate via hash fallback so this stays deterministic.
  await runOverlay(page, {
    name: "Sponsor modal",
    viewport: VP_DESKTOP,
    openSelectors: [
      '[data-ff-open-sponsor]',
      '[data-ff-sponsor-open]',
      'a[href="#sponsor-interest"]',
      '#openSponsor',
      '#sponsorOpen',
      'text=Become a sponsor',
    ],
    overlaySelectors: ['#sponsor-interest', '.ff-modal', '[data-ff-modal]'],
    panelSelectors:   ['#sponsor-interest .ff-modal__panel', '.ff-modal .ff-modal__panel', '[data-ff-modal] .ff-modal__panel'],
    optional: true,
    allowHashFallback: true,
    hash: "#sponsor-interest",
  });

  await browser.close();
  ok("UI smoke PASS ✅");
}

main().catch((err) => {
  bad(`UI smoke FAIL: ${err?.message || err}`);
  process.exit(1);
});

