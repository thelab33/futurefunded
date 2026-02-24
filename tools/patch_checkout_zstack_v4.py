#!/usr/bin/env python3
"""
FutureFunded — LOCKED-IN checkout close-vs-backdrop fix (v4)

Goal: Make the close button ALWAYS be the topmost clickable target.
We do this by:
- Removing any prior FF_PATCH blocks (any name).
- Inserting a new patch into @layer ff.utilities (last layer).
- For open-state only: force close button to position:fixed and z-index max.
- Force backdrop z-index below close (still clickable elsewhere).
"""

from __future__ import annotations
import argparse, datetime as _dt, re, shutil
from pathlib import Path

PATCH_BEGIN = "/* FF_PATCH_BEGIN: checkout_zstack_lock_v4 */"
PATCH_END   = "/* FF_PATCH_END: checkout_zstack_lock_v4 */"

PATCH_CSS_V4 = f"""
  {PATCH_BEGIN}
  /* LOCKED-IN: close button must always win hit-testing vs backdrop (Playwright gate).
     Fix: break stacking-context ambiguity by making close fixed + max z-index when open.
     Keep backdrop clickable for dismiss, but below close. */

  /* Open-state selectors (no :is needed for compatibility) */
  .ff-body #checkout.is-open,
  .ff-body #checkout[data-open="true"],
  .ff-body #checkout[aria-hidden="false"],
  .ff-body #checkout:target {{
    isolation: isolate;
  }}

  /* Backdrop stays below close (still clickable elsewhere) */
  .ff-body #checkout.is-open .ff-sheet__backdrop,
  .ff-body #checkout[data-open="true"] .ff-sheet__backdrop,
  .ff-body #checkout[aria-hidden="false"] .ff-sheet__backdrop,
  .ff-body #checkout:target .ff-sheet__backdrop {{
    z-index: 2147483000 !important;
    pointer-events: auto;
  }}

  /* Lift the checkout surface above backdrop (nice to have) */
  .ff-body #checkout.is-open .ff-sheet__panel,
  .ff-body #checkout[data-open="true"] .ff-sheet__panel,
  .ff-body #checkout[aria-hidden="false"] .ff-sheet__panel,
  .ff-body #checkout:target .ff-sheet__panel,
  .ff-body #checkout.is-open .ff-card,
  .ff-body #checkout[data-open="true"] .ff-card,
  .ff-body #checkout[aria-hidden="false"] .ff-card,
  .ff-body #checkout:target .ff-card {{
    position: relative;
    z-index: 2147483200 !important;
  }}

  /* Nuclear: close is fixed to viewport and highest z-index possible */
  .ff-body #checkout.is-open [data-ff-close-checkout],
  .ff-body #checkout[data-open="true"] [data-ff-close-checkout],
  .ff-body #checkout[aria-hidden="false"] [data-ff-close-checkout],
  .ff-body #checkout:target [data-ff-close-checkout],
  .ff-body #checkout.is-open .ff-iconbtn--flagship,
  .ff-body #checkout[data-open="true"] .ff-iconbtn--flagship,
  .ff-body #checkout[aria-hidden="false"] .ff-iconbtn--flagship,
  .ff-body #checkout:target .ff-iconbtn--flagship {{
    position: fixed !important;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    right: calc(env(safe-area-inset-right, 0px) + 12px);
    z-index: 2147483647 !important;
    pointer-events: auto;
  }}
  {PATCH_END}
"""

def find_layer_block(text: str, layer_name: str) -> tuple[int, int] | None:
    m = re.search(rf"@layer\s+{re.escape(layer_name)}\s*\{{", text)
    if not m:
        return None
    i = m.end() - 1  # at '{'
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
                return (m.start(), j)
    return None

def strip_any_ff_patch_blocks(text: str) -> str:
    # Remove ANY block that starts with /* FF_PATCH_BEGIN: ... */ and ends with /* FF_PATCH_END: ... */
    pat = re.compile(r"/\*\s*FF_PATCH_BEGIN:.*?\*/.*?/\*\s*FF_PATCH_END:.*?\*/", re.DOTALL)
    return re.sub(pat, "", text)

def patch_file(css_path: Path, dry_run: bool = False) -> int:
    if not css_path.exists():
        raise FileNotFoundError(str(css_path))

    original = css_path.read_text(encoding="utf-8")
    cleaned = strip_any_ff_patch_blocks(original)

    blk = find_layer_block(cleaned, "ff.utilities") or find_layer_block(cleaned, "ff.pages") or find_layer_block(cleaned, "ff.controls")
    if not blk:
        print("[ff-patch] ❌ No @layer ff.utilities/pages/controls block found. Not patching.")
        return 2

    layer_end = blk[1]
    patched = cleaned[:layer_end] + PATCH_CSS_V4 + cleaned[layer_end:]

    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = css_path.with_suffix(css_path.suffix + f".bak.{stamp}")

    if dry_run:
        print(f"[ff-patch] (dry-run) Would patch: {css_path}")
        print(f"[ff-patch] (dry-run) Would back up: {backup.name}")
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
    raise SystemExit(patch_file(Path(args.css), dry_run=args.dry_run))

if __name__ == "__main__":
    main()
