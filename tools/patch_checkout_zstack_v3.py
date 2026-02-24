#!/usr/bin/env python3
"""
FutureFunded — LOCKED-IN checkout z-stack patch (v3)

Fixes Playwright gate:
  "Close button is NOT the topmost clickable target — backdrop intercepting clicks."

Strategy:
- Remove any prior FF_PATCH blocks for this fix (v1/v2).
- Insert a new patch into @layer ff.utilities (last layer -> wins).
- Enforce strict non-tie z-index ladder:
    backdrop: 10
    panel/card: 200
    header: 210
    close: 220
- Ensure z-index actually applies by adding position: relative where needed.
"""

from __future__ import annotations
import argparse, datetime as _dt, re, shutil
from pathlib import Path

PATCH_BEGIN = "/* FF_PATCH_BEGIN: checkout_zstack_lock_v3 */"
PATCH_END   = "/* FF_PATCH_END: checkout_zstack_lock_v3 */"

# Remove older patch tags too (v1/v2)
OLD_TAGS = [
    ("/* FF_PATCH_BEGIN: checkout_close_above_backdrop */", "/* FF_PATCH_END: checkout_close_above_backdrop */"),
    (PATCH_BEGIN, PATCH_END),
]

PATCH_CSS_V3 = f"""
  {PATCH_BEGIN}
  /* LOCKED-IN checkout z-stack: ensure close is ALWAYS above backdrop (Playwright gate).
     We enforce a strict ladder (no ties) and make z-index effective via position. */

  .ff-body #checkout {{
    isolation: isolate;
  }}

  /* Backdrop must be behind interactive surfaces */
  .ff-body #checkout .ff-sheet__backdrop {{
    z-index: 10 !important;
    pointer-events: auto;
  }}

  /* Lift the sheet surface(s) above backdrop */
  .ff-body #checkout .ff-sheet__panel,
  .ff-body #checkout .ff-checkoutShell,
  .ff-body #checkout .ff-card,
  .ff-body #checkout .ff-glass,
  .ff-body #checkout .ff-pad {{
    position: relative;
    z-index: 200 !important;
    pointer-events: auto;
  }}

  /* Header above the surface stack (prevents header/close being "under" anything) */
  .ff-body #checkout .ff-sheet__header {{
    position: relative;
    z-index: 210 !important;
    pointer-events: auto;
  }}

  /* Close button must be the topmost clickable target */
  .ff-body #checkout [data-ff-close-checkout],
  .ff-body #checkout .ff-iconbtn--flagship,
  .ff-body #checkout .ff-sheet__close {{
    position: relative;
    z-index: 220 !important;
    pointer-events: auto;
  }}
  {PATCH_END}
"""

def _find_layer_block(text: str, layer_name: str) -> tuple[int, int] | None:
    m = re.search(rf"@layer\s+{re.escape(layer_name)}\s*\{{", text)
    if not m:
        return None
    start = m.start()
    i = m.end() - 1

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

def _remove_patch_blocks(text: str) -> str:
    out = text
    for b, e in OLD_TAGS:
        out = re.sub(re.escape(b) + r".*?" + re.escape(e), "", out, flags=re.DOTALL)
    return out

def patch(css_path: Path, dry_run: bool = False) -> int:
    if not css_path.exists():
        raise FileNotFoundError(str(css_path))

    original = css_path.read_text(encoding="utf-8")
    cleaned = _remove_patch_blocks(original)

    blk = _find_layer_block(cleaned, "ff.utilities")
    if not blk:
        # Fall back safely without adding new @layer blocks
        for name in ("ff.pages", "ff.controls"):
            blk = _find_layer_block(cleaned, name)
            if blk:
                break
    if not blk:
        print("[ff-patch] ❌ No @layer ff.utilities/pages/controls block found. Not patching.")
        return 2

    layer_end = blk[1]
    patched = cleaned[:layer_end] + PATCH_CSS_V3 + cleaned[layer_end:]

    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = css_path.with_suffix(css_path.suffix + f".bak.{stamp}")

    if dry_run:
        print(f"[ff-patch] (dry-run) Would patch: {css_path}")
        print(f"[ff-patch] (dry-run) Would back up to: {backup.name}")
        return 0

    shutil.copy2(css_path, backup)
    css_path.write_text(patched, encoding="utf-8")
    print(f"[ff-patch] ✅ Patched: {css_path}")
    print(f"[ff-patch] 🧷 Backup: {backup.name}")
    return 0

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("css", nargs="?", default="app/static/css/ff.css")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    raise SystemExit(patch(Path(args.css), dry_run=args.dry_run))

if __name__ == "__main__":
    main()
