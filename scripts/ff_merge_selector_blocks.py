#!/usr/bin/env python3
r"""
Merge duplicate CSS selector blocks into ONE block (hook-safe, style-preserving).

Strategy:
- Find all blocks that start with: ^\s*<selector>\s*\{
- Extract each block body (brace-matched, comment/string aware)
- Merge bodies by concatenation in-order (later declarations stay later => same computed result)
- Replace the FIRST block body with merged body
- Remove all subsequent duplicate blocks entirely
- Write back (with a .bak backup)

Usage:
  python scripts/ff_merge_selector_blocks.py app/static/css/ff.css ".ff-modal__panel"
  python scripts/ff_merge_selector_blocks.py app/static/css/ff.css ".ff-modal__panel" ".ff-modal__backdrop"

Tip:
  After running, verify:
    rg -n "^\s*\.ff-modal__panel\s*\{" app/static/css/ff.css | wc -l
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import List


class Block:
    def __init__(self, start: int, end: int, open_brace: int, close_brace: int):
        self.start = start
        self.end = end
        self.open_brace = open_brace
        self.close_brace = close_brace

    def body(self, s: str) -> str:
        return s[self.open_brace + 1 : self.close_brace]


def find_matching_brace(css: str, open_brace_idx: int) -> int:
    """Return the index of the matching '}' for the '{' at open_brace_idx."""
    depth = 1
    i = open_brace_idx + 1

    in_block_comment = False
    in_single = False
    in_double = False

    while i < len(css):
        ch = css[i]
        nxt = css[i + 1] if i + 1 < len(css) else ""

        # End block comment
        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        # Strings (conservative)
        if in_single:
            if ch == "\\" and nxt:
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            if ch == "\\" and nxt:
                i += 2
                continue
            if ch == '"':
                in_double = False
            i += 1
            continue

        # Start block comment
        if ch == "/" and nxt == "*":
            in_block_comment = True
            i += 2
            continue

        # (Optional) line comment support (non-standard, but harmless)
        if ch == "/" and nxt == "/":
            j = css.find("\n", i)
            if j == -1:
                return len(css) - 1
            i = j + 1
            continue

        # Start strings
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == '"':
            in_double = True
            i += 1
            continue

        # Brace tracking
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i

        i += 1

    raise ValueError("Unbalanced braces: could not find matching '}'.")


def find_selector_blocks(css: str, selector: str) -> List[Block]:
    sel_re = re.escape(selector)
    pattern = re.compile(rf"^\s*{sel_re}\s*\{{", re.MULTILINE)

    blocks: List[Block] = []
    for m in pattern.finditer(css):
        start = m.start()
        open_brace = css.find("{", m.start(), m.end())
        if open_brace == -1:
            continue
        close_brace = find_matching_brace(css, open_brace)
        end = close_brace + 1
        blocks.append(Block(start=start, end=end, open_brace=open_brace, close_brace=close_brace))
    return blocks


def merge_blocks(css: str, blocks: List[Block]) -> str:
    if len(blocks) < 2:
        return css

    first = blocks[0]

    # Merge bodies by concatenation (preserves cascade semantics)
    merged_body_parts = []
    for b in blocks:
        body = b.body(css).strip("\n")
        if body.strip():
            merged_body_parts.append(body)

    merged_body = "\n\n".join(merged_body_parts).rstrip() + "\n"

    out_parts = []
    out_parts.append(css[: first.open_brace + 1])
    out_parts.append(merged_body)
    out_parts.append("}")  # single closing brace

    cursor = first.end
    for b in blocks[1:]:
        out_parts.append(css[cursor : b.start])  # keep in-between content
        cursor = b.end  # skip duplicate block
    out_parts.append(css[cursor:])

    return "".join(out_parts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="Path to CSS file (e.g., app/static/css/ff.css)")
    ap.add_argument("selectors", nargs="+", help='One or more exact selectors (e.g., ".ff-modal__panel")')
    ap.add_argument("--no-backup", action="store_true", help="Do not create a .bak backup")
    args = ap.parse_args()

    path = Path(args.path)
    css = path.read_text(encoding="utf-8")

    changed = False
    backup_written = False

    for selector in args.selectors:
        blocks = find_selector_blocks(css, selector)
        if len(blocks) < 2:
            print(f"[ok] {selector}: found {len(blocks)} block(s). No changes.")
            continue

        if not args.no_backup and not backup_written:
            bak = path.with_suffix(path.suffix + ".bak")
            bak.write_text(css, encoding="utf-8")
            backup_written = True
            print(f"[backup] wrote {bak}")

        css = merge_blocks(css, blocks)
        changed = True
        print(f"[fixed] {selector}: merged {len(blocks)} blocks into 1")

    if changed:
        path.write_text(css, encoding="utf-8")
        print(f"[write] updated {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

