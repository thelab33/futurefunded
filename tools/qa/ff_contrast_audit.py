#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FutureFunded — ff_contrast_audit.py
-----------------------------------
WCAG contrast audit using Playwright (Node) so it matches real computed styles.

Why Node Playwright?
- You already run Playwright via `npx playwright test`
- This avoids needing Python Playwright installed
- Works even if your repo is `type: module` (we generate a .cjs runner)

What it checks:
- Themes: light, dark, system_dark (prefers-color-scheme: dark with NO data-theme attr)
- Scenes: base page + key overlays by :target (checkout, sponsor, video, terms, privacy)
- Visible text nodes only
- Background inferred via nearest non-transparent background-color (with page-bg fallback)
- AA thresholds: 4.5:1 normal, 3:1 large/bold

Exit codes:
- 0: pass
- 1: failures
- 2: runtime error / missing deps
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Optional


JS_RUNNER_CJS = r"""
/* eslint-disable no-console */
'use strict';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    out[k] = v;
  }
  return out;
}

function toInt(v, d) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : d;
}

function toFloat(v, d) {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
}

function normalizeBaseUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s.replace(/\/+$/, '');
}

function splitList(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function joinScene(baseUrl, scene) {
  const base = new URL(baseUrl);
  const s = String(scene || '').trim();
  if (!s) return base.toString();

  if (s.startsWith('#')) {
    base.hash = s;
    return base.toString();
  }
  if (s.startsWith('/')) {
    base.pathname = s;
    base.hash = '';
    return base.toString();
  }

  // allow "path#hash"
  if (s.includes('#')) {
    const [p, h] = s.split('#');
    base.pathname = p.startsWith('/') ? p : '/' + p;
    base.hash = '#' + h;
    return base.toString();
  }

  base.pathname = '/' + s;
  base.hash = '';
  return base.toString();
}

function formatColor(c) {
  if (!c) return 'unknown';
  return c;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.url || args['base-url']);
  const timeoutMs = toInt(args.timeout, 30000);
  const maxNodes = toInt(args['max-nodes'], 6500);
  const maxFails = toInt(args['max-fails'], 120);
  const outJson = args.json ? String(args.json) : '';

  if (!baseUrl) {
    console.error('ff_contrast_audit: missing --url');
    process.exit(2);
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('ff_contrast_audit: Node dependency missing: require("playwright") failed.');
    console.error('Fix: npm i -D playwright && npx playwright install --with-deps');
    process.exit(2);
  }

  const scenes = splitList(args.scenes);
  const defaultScenes = ['/', '/#checkout', '/#sponsor-interest', '/#press-video', '/#terms', '/#privacy'];
  const runScenes = scenes.length ? scenes : defaultScenes;

  const themes = ['light', 'dark', 'system_dark'];

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1100, height: 850 },
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  async function gotoAndStabilize(url) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs }).catch(async () => {
      // fallback if networkidle is too strict
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    });

    // Wait for primary shell markers if present (don’t hard fail if missing)
    await page.waitForTimeout(120);
    await page.waitForSelector('.ff-body', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('[data-ff-shell]', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(80);
  }

  async function applyTheme(theme) {
    if (theme === 'light') {
      await page.emulateMedia({ colorScheme: 'light' }).catch(() => {});
      await page.evaluate(() => {
        const root = document.querySelector('.ff-root') || document.documentElement;
        root.setAttribute('data-theme', 'light');
      });
      return;
    }
    if (theme === 'dark') {
      await page.emulateMedia({ colorScheme: 'dark' }).catch(() => {});
      await page.evaluate(() => {
        const root = document.querySelector('.ff-root') || document.documentElement;
        root.setAttribute('data-theme', 'dark');
      });
      return;
    }
    if (theme === 'system_dark') {
      await page.emulateMedia({ colorScheme: 'dark' }).catch(() => {});
      await page.evaluate(() => {
        const root = document.querySelector('.ff-root') || document.documentElement;
        root.removeAttribute('data-theme');
      });
      return;
    }
  }

  const results = {
    baseUrl,
    scenes: runScenes,
    themes,
    checked_nodes: 0,
    failures: []
  };

  function printHeader(title) {
    console.log('\n' + '='.repeat(78));
    console.log(title);
    console.log('='.repeat(78));
  }

  async function auditScene(theme, sceneLabel, url) {
    await gotoAndStabilize(url);
    await applyTheme(theme);
    await page.waitForTimeout(60);

    const payload = await page.evaluate((opts) => {
      function clamp01(x) { return Math.min(1, Math.max(0, x)); }

      function parseColor(str) {
        if (!str) return null;
        const s = String(str).trim().toLowerCase();
        if (!s || s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
        // rgb/rgba
        const m = s.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+)\s*)?\)$/);
        if (m) {
          return {
            r: Math.round(parseFloat(m[1])),
            g: Math.round(parseFloat(m[2])),
            b: Math.round(parseFloat(m[3])),
            a: m[4] == null ? 1 : clamp01(parseFloat(m[4]))
          };
        }
        // hex
        const hx = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
        if (hx) {
          const h = hx[1];
          if (h.length === 3) {
            const r = parseInt(h[0] + h[0], 16);
            const g = parseInt(h[1] + h[1], 16);
            const b = parseInt(h[2] + h[2], 16);
            return { r, g, b, a: 1 };
          }
          if (h.length === 6) {
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            return { r, g, b, a: 1 };
          }
          if (h.length === 8) {
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            const a = clamp01(parseInt(h.slice(6, 8), 16) / 255);
            return { r, g, b, a };
          }
        }
        return null;
      }

      function blend(top, bottom) {
        // top over bottom
        const a = clamp01(top.a + bottom.a * (1 - top.a));
        if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
        const r = Math.round((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a);
        const g = Math.round((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a);
        const b = Math.round((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a);
        return { r, g, b, a };
      }

      function srgbToLin(v) {
        const x = v / 255;
        return (x <= 0.03928) ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      }

      function luminance(c) {
        const R = srgbToLin(c.r);
        const G = srgbToLin(c.g);
        const B = srgbToLin(c.b);
        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
      }

      function contrastRatio(fg, bg) {
        const L1 = luminance(fg);
        const L2 = luminance(bg);
        const hi = Math.max(L1, L2);
        const lo = Math.min(L1, L2);
        return (hi + 0.05) / (lo + 0.05);
      }

      function cssPath(el) {
        if (!el || el.nodeType !== 1) return '';
        if (el.id) return `#${el.id}`;
        const parts = [];
        let cur = el;
        for (let i = 0; i < 4 && cur && cur.nodeType === 1; i++) {
          let seg = cur.tagName.toLowerCase();
          const cls = (cur.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2);
          if (cls.length) seg += '.' + cls.join('.');
          parts.unshift(seg);
          cur = cur.parentElement;
          if (!cur || cur.tagName.toLowerCase() === 'body') break;
        }
        return parts.join(' > ');
      }

      function isVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.closest('[hidden]')) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const op = parseFloat(cs.opacity || '1');
        if (op <= 0.02) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        // Skip screen-reader-only patterns by geometry
        if (rect.width <= 2 && rect.height <= 2) return false;
        return true;
      }

      function pageBgFallback() {
        const root = document.querySelector('.ff-root') || document.documentElement;
        const cs = getComputedStyle(root);
        const bg = cs.getPropertyValue('--ff-page-bg').trim();
        const bg2 = cs.getPropertyValue('--ff-page-bg2').trim();
        // Prefer page-bg; bg2 as backup.
        return parseColor(bg) || parseColor(bg2) || { r: 255, g: 255, b: 255, a: 1 };
      }

      function nearestBgColor(el, pageBg) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          const cs = getComputedStyle(cur);
          const bgc = parseColor(cs.backgroundColor);
          if (bgc && bgc.a > 0.05) {
            if (bgc.a < 1) return blend(bgc, pageBg);
            return bgc;
          }
          cur = cur.parentElement;
          if (!cur || cur.tagName.toLowerCase() === 'html') break;
        }
        return pageBg;
      }

      function requiredRatio(fontPx, weight) {
        // WCAG large-text thresholds (approx):
        // - 18pt normal ~= 24px
        // - 14pt bold ~= 18.67px, weight >= 700
        const isBold = (parseInt(weight, 10) || 400) >= 700;
        if (fontPx >= 24) return 3.0;
        if (isBold && fontPx >= 18.67) return 3.0;
        return 4.5;
      }

      const pageBg = pageBgFallback();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (!t) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (!isVisible(p)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const fails = [];
      let checked = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
        const el = node.parentElement;
        if (!el) continue;

        checked++;
        if (checked > opts.maxNodes) break;

        const cs = getComputedStyle(el);
        const fontPx = parseFloat(cs.fontSize || '0') || 0;

        // Skip ultra-tiny helper text (still keep >= 10px for safety)
        if (fontPx > 0 && fontPx < 10) continue;

        const fgRaw = parseColor(cs.color);
        if (!fgRaw || fgRaw.a <= 0.05) continue;

        const bg = nearestBgColor(el, pageBg);
        const fg = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;

        const ratio = contrastRatio(fg, bg);
        const req = requiredRatio(fontPx, cs.fontWeight);

        if (ratio + 1e-6 < req) {
          fails.push({
            selector: cssPath(el),
            text: text.slice(0, 90),
            fontPx: fontPx,
            weight: cs.fontWeight,
            fg: cs.color,
            bg: formatRgb(bg),
            ratio: Number(ratio.toFixed(2)),
            required: req
          });
        }
      }

      function formatRgb(c) {
        const a = (c.a == null) ? 1 : c.a;
        return `rgba(${c.r}, ${c.g}, ${c.b}, ${a.toFixed(2)})`;
      }

      return { checked, fails };
    }, { maxNodes });

    const checked = payload.checked || 0;
    const fails = (payload.fails || []).slice(0, maxFails);

    return { theme, scene: sceneLabel, url, checked, fails };
  }

  let totalChecked = 0;
  let totalFails = 0;

  printHeader('FutureFunded • Contrast Audit (AA/AA+)');

  for (const theme of themes) {
    printHeader(`Theme: ${theme}`);

    for (const scene of runScenes) {
      const url = joinScene(baseUrl, scene);
      const sceneLabel = scene;

      const out = await auditScene(theme, sceneLabel, url);
      totalChecked += out.checked;
      totalFails += out.fails.length;

      console.log(`Scene: ${sceneLabel}  →  checked=${out.checked}  fails=${out.fails.length}`);
      if (out.fails.length) {
        for (const f of out.fails.slice(0, Math.min(out.fails.length, 12))) {
          console.log(`  ✖ ${f.ratio} < ${f.required}  | ${f.selector} | ${f.fontPx}px w${f.weight}`);
          console.log(`    fg=${f.fg}  bg=${f.bg}`);
          console.log(`    "${f.text}"`);
        }
        if (out.fails.length > 12) {
          console.log(`  … ${out.fails.length - 12} more fails (see JSON or raise --max-fails)`);
        }
      }

      results.checked_nodes += out.checked;
      for (const f of out.fails) {
        results.failures.push({
          theme,
          scene: sceneLabel,
          url,
          ...f
        });
      }
    }
  }

  await context.close();
  await browser.close();

  printHeader('Summary');
  console.log(`Total checked text nodes: ${totalChecked}`);
  console.log(`Total failures (capped per scene): ${totalFails}`);
  console.log(`Unique failure entries stored: ${results.failures.length}`);

  if (outJson) {
    const fs = require('fs');
    try {
      fs.writeFileSync(outJson, JSON.stringify(results, null, 2), 'utf8');
      console.log(`Wrote JSON report: ${outJson}`);
    } catch (e) {
      console.error(`Failed writing JSON report to ${outJson}:`, e && e.message ? e.message : e);
    }
  }

  process.exit(results.failures.length ? 1 : 0);
})().catch((err) => {
  console.error('ff_contrast_audit: fatal error:', err && err.stack ? err.stack : err);
  process.exit(2);
});
"""


def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)


def _repo_root() -> Path:
    # tools/ff_contrast_audit.py -> tools -> repo root
    return Path(__file__).resolve().parent.parent


def _write_runner(tmpdir: Path) -> Path:
    runner = tmpdir / "ff_contrast_audit_runner.cjs"
    runner.write_text(JS_RUNNER_CJS, encoding="utf-8")
    return runner


def _run_node(runner: Path, args: List[str]) -> int:
    node = _which("node")
    if not node:
        print("ff_contrast_audit.py: 'node' not found on PATH.", file=sys.stderr)
        print("Fix: install Node.js 18+ (you already use Node 20).", file=sys.stderr)
        return 2

    cmd = [node, str(runner)] + args
    try:
        proc = subprocess.run(cmd, check=False)
        return int(proc.returncode)
    except FileNotFoundError:
        return 2


def main() -> int:
    p = argparse.ArgumentParser(
        prog="ff_contrast_audit.py",
        description="FutureFunded contrast audit (Playwright-powered).",
    )
    p.add_argument(
        "--url",
        default=os.environ.get("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:5000"),
        help="Base URL to audit (default: $PLAYWRIGHT_BASE_URL or http://127.0.0.1:5000)",
    )
    p.add_argument(
        "--scenes",
        default="",
        help="Comma-separated scenes (paths or hashes). Example: '/,/#checkout,/#sponsors'. Defaults include key overlays.",
    )
    p.add_argument("--timeout", type=int, default=30000, help="Navigation timeout ms (default: 30000).")
    p.add_argument("--max-nodes", type=int, default=6500, help="Max text nodes per scene (default: 6500).")
    p.add_argument("--max-fails", type=int, default=120, help="Max failures recorded per scene (default: 120).")
    p.add_argument("--json", default="", help="Write JSON report to this path (optional).")

    ns = p.parse_args()

    repo = _repo_root()
    os.chdir(repo)

    tmp = Path(tempfile.mkdtemp(prefix="ff-contrast-audit-"))
    try:
        runner = _write_runner(tmp)

        node_args: List[str] = [
            "--url",
            ns.url,
            "--timeout",
            str(ns.timeout),
            "--max-nodes",
            str(ns.max_nodes),
            "--max-fails",
            str(ns.max_fails),
        ]
        if ns.scenes.strip():
            node_args += ["--scenes", ns.scenes.strip()]
        if ns.json.strip():
            node_args += ["--json", ns.json.strip()]

        rc = _run_node(runner, node_args)
        return rc
    finally:
        # best-effort cleanup; leave on failure for debugging
        try:
            shutil.rmtree(tmp, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
