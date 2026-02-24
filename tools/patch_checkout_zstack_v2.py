#!/usr/bin/env python3
"""
Patch ff.css so the checkout close button is always above the backdrop.

v2 approach:
- Remove prior patch block (if present).
- Insert override into @layer ff.utilities (last layer => wins).
- Also ensure the visible checkout card/header are in a higher z stack than backdrop.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import re
import shutil
from pathlib import Path


PATCH_BEGIN = "/* FF_PATCH_BEGIN: checkout_close_above_backdrop */"
PATCH_END = "/* FF_PATCH_END: checkout_close_above_backdrop */"

PATCH_CSS_V2 = f"""
  {PATCH_BEGIN}
  /* Checkout z-stack fix (v2): backdrop must NEVER intercept close clicks.
     We override in ff.utilities to beat earlier layers and most component rules.
  */

  /* Keep the overlay isolated as a stacking context */
  .ff-body #checkout {{
    isolation: isolate;
  }}

  /* Backdrop stays below everything interactive */
  .ff-body #checkout .ff-sheet__backdrop {{
    z-index: 40 !important;
  }}

  /* Lift the visible checkout surface(s) above the backdrop.
     Your stack shows .ff-card is in the click path with z=auto, so we lift it. */
  .ff-body #checkout .ff-card,
  .ff-body #checkout .ff-glass,
  .ff-body #checkout .ff-pad,
  .ff-body #checkout .ff-checkoutHead,
  .ff-body #checkout .ff-sheet__header {{
    position: relative;
    z-index: 60 !important;
    pointer-events: auto;
  }}

  /* Close button must be topmost clickable target */
  .ff-body #checkout [data-ff-close-checkout],
  .ff-body #checkout .ff-iconbtn--flagship {{
    position: relative;
    z-index: 80 !important;
    pointer-events: auto;
  }}
  {PATCH_END}
"""


def _already_patched(text: str) -> bool:
    return PATCH_BEGIN in text and PATCH_END in text


def _remove_old_patch(text: str) -> str:
    # Remove any previous patch block completely (even if multiple).
    pattern = re.compile(re.escape(PATCH_BEGIN) + r".*?" + re.escape(PATCH_END), re.DOTALL)
    return re.sub(pattern, "", text)


def _find_layer_block(text: str, layer_name: str) -> tuple[int, int] | None:
    """
    Return (start_idx_of_@layer, end_idx_of_matching_closing_brace) for:
      @layer <layer_name> { ... }
    """
    m = re.search(rf"@layer\s+{re.escape(layer_name)}\s*\{{", text)
    if not m:
        return None

    start = m.start()
    i = m.end() - 1  # points at '{'

    depth = 0
    in_block_comment = False
    in_string = None
    esc = False

    for j in range(i, len(text)):
        ch = text[j]

        if in_block_comment:
            if ch == "*" and j + 1 < len(text) and text[j + 1] == "/":
                in_block_comment = False
            continue
        else:
            if ch == "/" and j + 1 < len(text) and text[j + 1] == "*":
                in_block_comment = True
                continue

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

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return (start, j)

    return None


def patch_css(css_path: Path, dry_run: bool = False) -> int:
    if not css_path.exists():
        raise FileNotFoundError(str(css_path))

    original = css_path.read_text(encoding="utf-8")

    cleaned = _remove_old_patch(original)

    # Prefer utilities because it is the last layer in your declared order.
    layer_targets = ["ff.utilities", "ff.pages", "ff.controls"]
    chosen = None
    for layer in layer_targets:
        blk = _find_layer_block(cleaned, layer)
        if blk:
            chosen = (layer, blk)
            break

    if not chosen:
        print("[ff-patch] ❌ No target @layer block found (ff.utilities/pages/controls). Not patching.")
        return 2

    layer_name, (_, layer_end) = chosen
    insert_at = layer_end  # before closing brace

    patched = cleaned[:insert_at] + PATCH_CSS_V2 + cleaned[insert_at:]

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
    ap.add_argument("css", nargs="?", default="app/static/css/ff.css")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    raise SystemExit(patch_css(Path(args.css), dry_run=args.dry_run))


if __name__ == "__main__":
    main()
