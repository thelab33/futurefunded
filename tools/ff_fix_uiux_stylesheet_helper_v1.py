#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from datetime import datetime
import shutil
import sys

p = Path("tests/ff_uiux_pro_gate.spec.ts")
if not p.exists():
    print("[uiux-fix] ❌ missing tests/ff_uiux_pro_gate.spec.ts", file=sys.stderr)
    raise SystemExit(2)

lines = p.read_text(encoding="utf-8", errors="replace").splitlines(True)

start = None
end = None

for i, ln in enumerate(lines):
    if start is None and "function fetchPrimaryStylesheetText" in ln:
        start = i
    if "function parseCssSymbols" in ln:
        end = i
        break

if start is None or end is None or not (start < end):
    print(f"[uiux-fix] ❌ could not locate block safely (start={start}, end={end})", file=sys.stderr)
    print("[uiux-fix] 👉 print around lines 360-430 to inspect", file=sys.stderr)
    raise SystemExit(2)

new_block = r'''  /**
   * Fetch the “primary” CSS text deterministically.
   * - Prefers link[href*="ff.css"]
   * - Falls back to first stylesheet link
   * - Rejects obviously-wrong payloads (empty, HTML error pages)
   */
  async function fetchPrimaryStylesheetText(page: Page): Promise<string> {
    const href = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
      const hrefs = links.map(l => (l.getAttribute("href") || "").trim()).filter(Boolean);

      const preferred =
        hrefs.find(h => /(^|\/|\b)ff\.css(\?|$)/i.test(h)) ||
        hrefs.find(h => /ff\.(pages|components|flagship)|bundle|app\.css/i.test(h)) ||
        hrefs[0] ||
        "";

      return preferred;
    });

    expect(href, "No stylesheet link found in DOM").not.toBe("");

    const abs = new URL(href, page.url()).toString();
    const res = await page.request.get(abs);

    // If ff.css is 404/500, this should fail loudly here (not later as “missing selectors”).
    expect(res.ok(), `Failed to fetch stylesheet: ${abs}`).toBeTruthy();

    const text = await res.text();
    const headers = (res.headers && res.headers()) || {};
    const ct = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();

    // Guardrail: prevent “HTML error page parsed as CSS” causing huge missing lists.
    const looksLikeHtml = /^\s*<!doctype html>|^\s*<html\b/i.test(text);
    const tooSmall = text.trim().length < 200;

    expect(!looksLikeHtml, `Stylesheet fetch returned HTML (likely an error page): ${abs}`).toBeTruthy();
    // content-type can be absent in dev; we don’t hard fail on ct mismatch, only on obvious junk.
    expect(!tooSmall, `Stylesheet content too small/suspicious (possibly empty): ${abs} (ct=${ct})`).toBeTruthy();

    return text;
  }

'''

bak = p.with_suffix(f".spec.ts.bak_uiuxfix_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
shutil.copyfile(p, bak)

out = "".join(lines[:start]) + new_block + "".join(lines[end:])
p.write_text(out, encoding="utf-8")

print(f"[uiux-fix] ✅ patched {p}")
print(f"[uiux-fix] 🧷 backup -> {bak}")
print(f"[uiux-fix] replaced lines {start+1}..{end} (exclusive of parseCssSymbols header)")
