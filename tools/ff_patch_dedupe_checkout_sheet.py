#!/usr/bin/env python3
# tools/ff_patch_dedupe_checkout_sheet.py
"""
FutureFunded — Auto-patch: dedupe checkout sheet hook (REAL DOM ATTR ONLY)

Fixes:
- Multiple elements matching [data-ff-checkout-sheet]
- Stray data-ff-checkout-sheet attributes on non-#checkout tags
- Duplicate attribute repeated on the #checkout start tag itself

Important:
- Ignores occurrences inside <script>, <style>, and HTML comments
  (so the selectors JSON string won't create false positives)

Usage:
  # Report only (recommended)
  python3 tools/ff_patch_dedupe_checkout_sheet.py --file app/templates/index.html

  # Apply patch (writes backup + patched file)
  python3 tools/ff_patch_dedupe_checkout_sheet.py --file app/templates/index.html --apply
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
from dataclasses import dataclass
from typing import List, Tuple


# --- Ranges to ignore (scripts/styles/comments) -------------------------------

RE_SCRIPT_BLOCK = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.IGNORECASE | re.DOTALL)
RE_STYLE_BLOCK  = re.compile(r"<style\b[^>]*>.*?</style\s*>", re.IGNORECASE | re.DOTALL)
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)

def build_exclusions(src: str) -> List[Tuple[int, int]]:
    ranges: List[Tuple[int, int]] = []
    for rx in (RE_SCRIPT_BLOCK, RE_STYLE_BLOCK, RE_HTML_COMMENT):
        for m in rx.finditer(src):
            ranges.append((m.start(), m.end()))
    ranges.sort()
    # merge overlaps
    merged: List[Tuple[int, int]] = []
    for a, b in ranges:
        if not merged or a > merged[-1][1]:
            merged.append((a, b))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
    return merged

def in_exclusions(pos: int, exclusions: List[Tuple[int, int]]) -> bool:
    # small linear scan is fine; file sizes are manageable
    for a, b in exclusions:
        if a <= pos < b:
            return True
    return False

def line_no(src: str, pos: int) -> int:
    return src.count("\n", 0, pos) + 1


# --- Attribute scanning & patching -------------------------------------------

# Match ONLY start-tags containing the attribute (real DOM attribute)
RE_TAG_WITH_ATTR = re.compile(
    r"<(?P<tag>[A-Za-z][\w:-]*)\b(?P<attrs>[^>]*?)\bdata-ff-checkout-sheet\b(?P<tail>[^>]*)>",
    re.IGNORECASE | re.DOTALL,
)

RE_ID_CHECKOUT = re.compile(r'\bid\s*=\s*([\'"])checkout\1', re.IGNORECASE)

# Strip the attribute (with or without value)
RE_STRIP_ATTR = re.compile(
    r"\s+data-ff-checkout-sheet(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?",
    re.IGNORECASE,
)

def dedupe_attr_on_tag(tag_text: str, keep: bool) -> str:
    """
    Remove ALL occurrences of the attribute from this tag,
    and if keep=True, add it back exactly once as data-ff-checkout-sheet="".
    """
    stripped = RE_STRIP_ATTR.sub("", tag_text)

    if not keep:
        return stripped

    # Add attribute once, before the closing '>'
    if stripped.endswith("/>"):
        return stripped[:-2] + ' data-ff-checkout-sheet=""/>'  # unlikely for section but safe
    if stripped.endswith(">"):
        return stripped[:-1] + ' data-ff-checkout-sheet="">'   # standard
    return stripped


@dataclass
class Hit:
    start: int
    end: int
    tag_preview: str
    is_checkout_id: bool


def find_real_attr_hits(src: str) -> List[Hit]:
    exclusions = build_exclusions(src)
    hits: List[Hit] = []

    for m in RE_TAG_WITH_ATTR.finditer(src):
        if in_exclusions(m.start(), exclusions):
            continue

        tag_text = m.group(0)
        # ignore end-tags like </section ...> (our regex won't match those, but belt+suspenders)
        if tag_text.startswith("</"):
            continue

        is_checkout = bool(RE_ID_CHECKOUT.search(tag_text))
        preview = " ".join(tag_text.strip().split())
        if len(preview) > 160:
            preview = preview[:160] + "…"

        hits.append(Hit(start=m.start(), end=m.end(), tag_preview=preview, is_checkout_id=is_checkout))

    return hits


def backup_path(path: str) -> str:
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{path}.bak.{ts}"


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def patch_file(path: str, apply: bool) -> int:
    src = read_text(path)
    hits = find_real_attr_hits(src)

    print(f"\n[ff-patch] file: {path}")
    print(f"[ff-patch] REAL DOM attribute hits for data-ff-checkout-sheet: {len(hits)}")

    if hits:
        print("[ff-patch] locations:")
        for h in hits:
            ln = line_no(src, h.start)
            mark = "KEEP?" if h.is_checkout_id else "STRIP"
            print(f"  - line {ln:<6} {mark:<6} {h.tag_preview}")

    # If already exactly one and it's on #checkout, we’re done
    if len(hits) == 1 and hits[0].is_checkout_id:
        print("[ff-patch] ✅ already correct: exactly one attribute and it's on #checkout.")
        return 0

    # Decide which hit to keep:
    # Prefer the tag with id="checkout". If multiple, keep the first checkout id tag.
    keep_index = None
    for i, h in enumerate(hits):
        if h.is_checkout_id:
            keep_index = i
            break
    if keep_index is None and hits:
        # No id="checkout" tag has it — keep the first hit but warn
        keep_index = 0
        print("[ff-patch] ⚠ WARNING: no tag with id='checkout' had the attribute. Keeping first hit, stripping others.")

    # Patch tags bottom-up to preserve indices
    new_src = src
    for i in range(len(hits) - 1, -1, -1):
        h = hits[i]
        tag_text = new_src[h.start:h.end]
        keep = (i == keep_index)
        new_tag = dedupe_attr_on_tag(tag_text, keep=keep)
        new_src = new_src[:h.start] + new_tag + new_src[h.end:]

    # Re-scan after patch
    hits2 = find_real_attr_hits(new_src)
    print(f"[ff-patch] REAL DOM attribute hits after patch: {len(hits2)}")
    if hits2:
        kept_ok = any(h.is_checkout_id for h in hits2) and len(hits2) == 1
        if kept_ok:
            print("[ff-patch] ✅ patched to exactly one attribute on #checkout.")
        else:
            print("[ff-patch] ⚠ still not perfect. Remaining hits:")
            for h in hits2:
                ln = line_no(new_src, h.start)
                print(f"  - line {ln:<6} {h.tag_preview}")

    if not apply:
        print("[ff-patch] DRY RUN only. Re-run with --apply to write + create backup.")
        return 0

    bak = backup_path(path)
    write_text(bak, src)
    write_text(path, new_src)
    print(f"[ff-patch] ✅ wrote patch + backup created: {bak}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="app/templates/index.html", help="Template file to patch")
    ap.add_argument("--apply", action="store_true", help="Write changes (default is dry-run)")
    args = ap.parse_args()
    return patch_file(args.file, apply=args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
