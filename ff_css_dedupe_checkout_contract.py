#!/usr/bin/env python3
"""
ff_css_dedupe_checkout_contract.py

Surgical CSS dedupe for FutureFunded:
- Fix invalid ID registry selector (#**ff_focus_probe** -> #__ff_focus_probe__)
- Remove duplicate rule blocks for checkout sheet layout selectors
  (keeps first occurrence, removes later duplicates)
- Optionally strips legacy appended "scroll fix" sections by markers if present

Usage:
  python ff_css_dedupe_checkout_contract.py app/static/css/ff.css
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from datetime import datetime


# Core selectors that commonly cause checkout clipping when duplicated.
TARGET_SELECTORS = [
    r"\.ff-sheet__panel",
    r"\.ff-sheet__viewport",
    r"\.ff-sheet__content",
    r"\.ff-sheet__scroll",
    r"\.ff-sheet__header",
    r"\.ff-sheet__footer--sticky",
    r"\.ff-checkoutShell",
    r"\.ff-checkoutShell--flagship",
]

# Optional legacy marker blocks you may have appended previously.
# If any are found, we remove from marker start to next obvious section boundary or EOF.
LEGACY_MARKERS = [
    "CHECKOUT SHEET SCROLL FIX",
    "CHECKOUT MODAL POLISH",
    "FF_SHEET_SCROLL_FIX",
    "FF_SHEET_SCROLL_FIX_V1",
    "FF_SHEET_SCROLL_FIX_V2",
    "FF_CHECKOUT_SCROLL_FIX",
]


def backup_path(p: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return p.with_suffix(p.suffix + f".bak_dedupe_checkout_{ts}")


def fix_invalid_probe_selector(css: str) -> tuple[str, int]:
    # Replace the invalid #**ff_focus_probe** with #__ff_focus_probe__
    before = css
    css = css.replace("#**ff_focus_probe**", "#__ff_focus_probe__")
    return css, (0 if css == before else 1)


def strip_legacy_blocks(css: str) -> tuple[str, list[str]]:
    removed = []
    out = css

    for marker in LEGACY_MARKERS:
        # Match marker either as /* ... */ or plain text; remove from marker to the next "/* ===" or "@layer" or EOF.
        # This is conservative: we only strip when the marker text is present in a comment block.
        pat = re.compile(
            rf"(?is)/\*[^*]*{re.escape(marker)}[\s\S]*?\*/[\s\S]*?(?=(/\*\s*={10,}|\@layer\b)|\Z)"
        )
        m = pat.search(out)
        if m:
            removed.append(marker)
            out = out[: m.start()] + out[m.end() :]

    return out, removed


def find_rule_blocks(css: str, selector_regex: str) -> list[tuple[int, int]]:
    """
    Return list of (start, end) spans for rule blocks like:
      <selector> { ... }
    We handle simple CSS blocks, not nested @media blocks perfectly.
    But for these selectors, your rules are typically top-level blocks.
    """
    spans: list[tuple[int, int]] = []
    # We search for occurrences of the selector followed by optional whitespace and "{"
    # Then we scan braces to find matching "}".
    pat = re.compile(rf"(?m)(^|\n)\s*({selector_regex})\s*\{{")
    for m in pat.finditer(css):
        start = m.start(2)
        brace_start = css.find("{", m.end(2) - 1)
        if brace_start == -1:
            continue

        depth = 0
        i = brace_start
        end = None
        while i < len(css):
            ch = css[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
            i += 1

        if end is None:
            continue

        spans.append((start, end))

    return spans


def dedupe_blocks(css: str) -> tuple[str, dict[str, int]]:
    """
    For each target selector, keep first rule block and remove later duplicates.
    Returns (new_css, stats)
    """
    to_remove: list[tuple[int, int, str]] = []
    stats: dict[str, int] = {}

    for sel in TARGET_SELECTORS:
        spans = find_rule_blocks(css, sel)
        if len(spans) <= 1:
            stats[sel] = 0
            continue

        # Keep the first occurrence, remove the rest.
        stats[sel] = len(spans) - 1
        for s, e in spans[1:]:
            to_remove.append((s, e, sel))

    # Remove from end to start so offsets don't shift
    to_remove.sort(key=lambda x: x[0], reverse=True)

    out = css
    for s, e, _sel in to_remove:
        out = out[:s] + out[e:]

    return out, stats


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python ff_css_dedupe_checkout_contract.py app/static/css/ff.css")
        return 2

    p = Path(sys.argv[1])
    if not p.exists():
        print(f"❌ File not found: {p}")
        return 2

    css = p.read_text(encoding="utf-8")

    bak = backup_path(p)
    bak.write_text(css, encoding="utf-8")

    css, probe_fixed = fix_invalid_probe_selector(css)

    css, removed_markers = strip_legacy_blocks(css)

    css2, stats = dedupe_blocks(css)

    p.write_text(css2, encoding="utf-8")

    print("✅ Checkout CSS dedupe complete")
    print("🗄 Backup:", bak)
    if probe_fixed:
        print("✔ Fixed invalid probe selector: #__ff_focus_probe__")
    if removed_markers:
        print("✔ Removed legacy blocks:", ", ".join(removed_markers))

    removed_total = sum(stats.values())
    if removed_total:
        print(f"✔ Removed duplicate rule blocks: {removed_total}")
        for k, v in stats.items():
            if v:
                print(f"   - {k}  x{v}")
    else:
        print("ℹ No duplicate checkout rule blocks detected for the target selectors.")

    print("➡ Next:")
    print("   npx stylelint app/static/css/ff.css --fix")
    print("   python ff_ui_contract_audit.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
