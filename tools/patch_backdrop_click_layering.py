#!/usr/bin/env python3
"""
Patch FutureFunded ff.css so the checkout close button is always above the backdrop.

Goal:
- Fix Playwright failure: backdrop intercepting clicks on the close button.
- Keep it deterministic and hook-safe (no selector renames).
- Inject into an EXISTING @layer block (ff.controls preferred).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import shutil
from pathlib import Path
import re


PATCH_TAG_BEGIN = "/* FF_PATCH_BEGIN: checkout_close_above_backdrop */"
PATCH_TAG_END = "/* FF_PATCH_END: checkout_close_above_backdrop */"


PATCH_CSS = f"""
  {PATCH_TAG_BEGIN}
  /* Ensures close button is topmost clickable target (Playwright gate).
     Root cause: backdrop and close were equal z-index / competing stacking contexts.
     Fix: isolate sheet stacking + enforce strict z order: backdrop < panel < header < close.
  */
  .ff-body .ff-sheet {{
    isolation: isolate;
  }}
  .ff-body .ff-sheet__backdrop {{
    z-index: 40;
  }}
  .ff-body .ff-sheet__panel {{
    z-index: 50;
  }}
  .ff-body .ff-sheet__header {{
    z-index: 60;
  }}
  .ff-body .ff-sheet__header .ff-iconbtn,
  .ff-body .ff-sheet__header .ff-iconbtn--flagship,
  .ff-body .ff-sheet__close,
  .ff-body .ff-sheet [data-ff="close"] {{
    z-index: 70;
  }}
  {PATCH_TAG_END}
"""


def _find_layer_block(text: str, layer_name: str) -> tuple[int, int] | None:
    """
    Return (layer_start_index, layer_end_index_inclusive_of_matching_brace) for:
      @layer <layer_name> { ... }
    Uses a brace counter and ignores braces inside block comments and strings.
    """
    m = re.search(rf"@layer\s+{re.escape(layer_name)}\s*\{{", text)
    if not m:
        return None

    start = m.start()
    i = m.end() - 1  # index of the '{' that opens the layer block

    depth = 0
    in_block_comment = False
    in_string = None  # "'" or '"'
    esc = False

    for j in range(i, len(text)):
        ch = text[j]

        # Handle block comments /* ... */
        if in_block_comment:
            if ch == "*" and j + 1 < len(text) and text[j + 1] == "/":
                in_block_comment = False
            continue
        else:
            if ch == "/" and j + 1 < len(text) and text[j + 1] == "*":
                in_block_comment = True
                continue

        # Handle strings "..." or '...'
        if in_string:
            if esc:
                esc = False
                continue
            if ch == "\\":
                esc = True
                continue
            if ch == in_string:
                in_string = None
            continue
        else:
            if ch in ("'", '"'):
                in_string = ch
                continue

        # Count braces outside comments/strings
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return (start, j)

    return None


def _already_patched(text: str) -> bool:
    return PATCH_TAG_BEGIN in text and PATCH_TAG_END in text


def _insert_before(text: str, idx: int, insertion: str) -> str:
    return text[:idx] + insertion + text[idx:]


def patch_css(css_path: Path, dry_run: bool = False) -> int:
    if not css_path.exists():
        raise FileNotFoundError(str(css_path))

    original = css_path.read_text(encoding="utf-8")

    if _already_patched(original):
        print(f"[ff-patch] ✅ Already patched: {css_path}")
        return 0

    layer_targets = ["ff.controls", "ff.utilities", "ff.pages"]
    target = None
    for layer in layer_targets:
        blk = _find_layer_block(original, layer)
        if blk:
            target = (layer, blk)
            break

    if not target:
        print("[ff-patch] ❌ Could not find an existing @layer ff.controls/ff.utilities/ff.pages block.")
        print("[ff-patch]    Not patching to avoid violating your 'each @layer exactly once' contract.")
        return 2

    layer_name, (layer_start, layer_end) = target
    insert_at = layer_end  # insert just before the layer's closing brace

    patched = _insert_before(original, insert_at, PATCH_CSS)

    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = css_path.with_suffix(css_path.suffix + f".bak.{stamp}")

    if dry_run:
        print(f"[ff-patch] (dry-run) Would patch: {css_path}")
        print(f"[ff-patch] (dry-run) Would back up to: {backup.name}")
        print(f"[ff-patch] (dry-run) Target layer: {layer_name}")
        return 0

    shutil.copy2(css_path, backup)
    css_path.write_text(patched, encoding="utf-8")

    print(f"[ff-patch] ✅ Patched: {css_path}")
    print(f"[ff-patch] 🧷 Backup: {backup.name}")
    print(f"[ff-patch] 🎯 Inserted into @layer {layer_name}")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "css",
        nargs="?",
        default="app/static/css/ff.css",
        help="Path to ff.css (default: app/static/css/ff.css)",
    )
    ap.add_argument("--dry-run", action="store_true", help="Don't write changes; just report.")
    args = ap.parse_args()

    code = patch_css(Path(args.css), dry_run=args.dry_run)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
