#!/usr/bin/env python3
"""
FutureFunded — FF Layer Hygiene Rescue (Overrides) v1

Fixes:
- Ensures exactly ONE @layer order statement, and appends ff.overrides as LAST layer.
- Wraps any top-level (unlayered) CSS chunks into: @layer ff.overrides { ... } (in-place).
- Normalizes accidental '{{' / '}}' from templated patches into '{' / '}'.
- Removes stray lines that are exactly '})' (common copy/paste artifact).

Usage:
  python tools/ff_layer_rescue_overrides_v1.py app/static/css/ff.css

Creates a timestamped .bak-YYYYMMDD-HHMMSS backup next to the file.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Tuple


LAYER_ORDER_CANON = [
    "ff.tokens",
    "ff.base",
    "ff.type",
    "ff.layout",
    "ff.surfaces",
    "ff.controls",
    "ff.pages",
    "ff.utilities",
    "ff.overrides",
]


ORDER_RE = re.compile(r"(?m)^[ \t]*@layer[ \t]+([^;{]+);[ \t]*$")


def strip_comments_and_strings(s: str) -> str:
    """Cheap stripper for detecting blocks; not used for reconstructing output."""
    out = []
    i = 0
    n = len(s)
    in_block_comment = False
    in_str = None  # "'" or '"'
    while i < n:
        c = s[i]
        if in_block_comment:
            if c == "*" and i + 1 < n and s[i + 1] == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue
        if in_str:
            if c == "\\" and i + 1 < n:
                i += 2
                continue
            if c == in_str:
                in_str = None
            i += 1
            continue
        # normal
        if c == "/" and i + 1 < n and s[i + 1] == "*":
            in_block_comment = True
            i += 2
            continue
        if c in ("'", '"'):
            in_str = c
            i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


@dataclass
class LayerFrame:
    start: int
    depth_before: int


def find_first_layer_order_span(text: str) -> Tuple[int, int] | None:
    m = ORDER_RE.search(text)
    if not m:
        return None
    return (m.start(), m.end())


def normalize_layer_order_line(text: str) -> str:
    # Replace first @layer ...; with canonical order.
    m = ORDER_RE.search(text)
    if not m:
        # If missing, insert at top after any BOM/comments.
        insert_at = 0
        return f"@layer {', '.join(LAYER_ORDER_CANON)};\n\n" + text

    new_line = f"@layer {', '.join(LAYER_ORDER_CANON)};"
    text = text[: m.start()] + new_line + text[m.end() :]

    # Remove any additional @layer order statements beyond the first.
    # (Keep determinism: exactly one order statement.)
    all_matches = list(ORDER_RE.finditer(text))
    if len(all_matches) > 1:
        # Keep the first occurrence only.
        first = all_matches[0]
        parts = []
        last = 0
        kept = False
        for mm in all_matches:
            if not kept:
                kept = True
                continue
            parts.append(text[last:mm.start()])
            # Replace duplicate with a blank line (preserve line count-ish).
            parts.append("\n")
            last = mm.end()
        parts.append(text[last:])
        # Rebuild with the first intact already
        # (since we skipped removal for it).
        text = "".join(parts)
        # But we removed everything, including the kept first. Reinsert it:
        # Safer: run a final pass that forces the first order line canonical and removes others.
        # We'll do that by keeping only the first match in a fresh sweep.
        ms = list(ORDER_RE.finditer(text))
        if ms:
            # Keep ms[0], drop ms[1:]
            keep0 = ms[0]
            rebuilt = []
            rebuilt.append(text[: keep0.start()])
            rebuilt.append(f"@layer {', '.join(LAYER_ORDER_CANON)};")
            tail = text[keep0.end() :]
            tail = ORDER_RE.sub("", tail)
            rebuilt.append(tail)
            text = "".join(rebuilt)

    return text


def find_layer_block_spans(text: str) -> List[Tuple[int, int]]:
    """
    Finds spans for @layer name { ... } blocks by tracking brace depth,
    ignoring braces inside comments/strings.
    """
    spans: List[Tuple[int, int]] = []

    i = 0
    n = len(text)

    brace_depth = 0
    in_block_comment = False
    in_str = None  # "'" or '"'

    pending_layer = False
    pending_layer_start = -1

    stack: List[LayerFrame] = []

    def is_boundary(idx: int) -> bool:
        if idx <= 0:
            return True
        return not (text[idx - 1].isalnum() or text[idx - 1] in ("_", "-"))

    while i < n:
        c = text[i]

        # comment / string handling
        if in_block_comment:
            if c == "*" and i + 1 < n and text[i + 1] == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_str:
            if c == "\\" and i + 1 < n:
                i += 2
                continue
            if c == in_str:
                in_str = None
            i += 1
            continue

        # enter comment
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            in_block_comment = True
            i += 2
            continue

        # enter string
        if c in ("'", '"'):
            in_str = c
            i += 1
            continue

        # detect @layer blocks
        if c == "@" and text.startswith("@layer", i) and is_boundary(i):
            # look ahead to see if this @layer uses a block ("{") vs order (";")
            j = i + len("@layer")
            while j < n and text[j].isspace():
                j += 1
            k = j
            while k < n and text[k] not in ("{", ";"):
                k += 1
            if k < n and text[k] == "{":
                pending_layer = True
                pending_layer_start = i
            # if ';' => order statement; ignore
            # continue scanning normally
            i += 1
            continue

        # braces
        if c == "{":
            if pending_layer:
                stack.append(LayerFrame(start=pending_layer_start, depth_before=brace_depth))
                pending_layer = False
                pending_layer_start = -1
            brace_depth += 1
            i += 1
            continue

        if c == "}":
            brace_depth -= 1
            if brace_depth < 0:
                brace_depth = 0
            if stack and brace_depth == stack[-1].depth_before:
                frame = stack.pop()
                spans.append((frame.start, i + 1))
            i += 1
            continue

        i += 1

    spans.sort()
    # merge overlaps
    merged: List[Tuple[int, int]] = []
    for a, b in spans:
        if not merged or a > merged[-1][1]:
            merged.append((a, b))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
    return merged


def complement_spans(n: int, spans: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    out: List[Tuple[int, int]] = []
    cur = 0
    for a, b in spans:
        if cur < a:
            out.append((cur, a))
        cur = max(cur, b)
    if cur < n:
        out.append((cur, n))
    return out


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "app/static/css/ff.css")
    if not path.exists():
        print("❌ Missing file:", path)
        return 2

    raw = path.read_text(encoding="utf-8")

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak-{ts}")
    bak.write_text(raw, encoding="utf-8")
    print(f"🧷 Backup: {bak}")

    # 1) Normalize obvious templating artifacts
    s = raw
    s = re.sub(r"(?m)^[ \t]*\}\)[ \t]*$", "", s)  # drop lines that are exactly "})"
    s = s.replace("{{", "{").replace("}}", "}")   # normalize accidental double braces

    # 2) Force one canonical layer order statement
    s = normalize_layer_order_line(s)

    # 3) Find all @layer block spans, then wrap any "outside" chunk that contains rule blocks
    order_span = find_first_layer_order_span(s)
    layer_spans = find_layer_block_spans(s)
    outside = complement_spans(len(s), layer_spans)

    wrapped = 0
    inserts: List[Tuple[int, int]] = []

    for a, b in outside:
        # Never wrap the (single) layer order statement line
        if order_span and not (b <= order_span[0] or a >= order_span[1]):
            continue

        chunk = s[a:b]
        if not chunk.strip():
            continue

        chk = strip_comments_and_strings(chunk)
        # Only wrap if it looks like it contains rule blocks / at-rule blocks.
        if "{" not in chk:
            continue

        inserts.append((a, b))

    # Apply from end to start so indices don't shift
    out = s
    for a, b in reversed(inserts):
        chunk = out[a:b]
        wrapper = "\n@layer ff.overrides {\n" + chunk.rstrip() + "\n}\n"
        out = out[:a] + wrapper + out[b:]
        wrapped += 1

    path.write_text(out, encoding="utf-8")
    print(f"✅ Wrapped {wrapped} unlayered chunk(s) into @layer ff.overrides {{ ... }}")
    print("✅ Updated @layer order (canonical) and removed duplicate order statements.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
