#!/usr/bin/env python3
"""
FutureFunded — Checkout Header Stack Fix

Fixes stacking-context violation where the checkout header (and close button)
renders below the backdrop in hit-testing, even when z-index matches.

This patch:
- Elevates the checkout header stacking context ABOVE the backdrop
- Keeps backdrop clickable outside the sheet
- Preserves existing contracts (no selector renames)

Idempotent. Safe to re-run.
"""

import sys
from pathlib import Path

INSERT = """
/* === FF PATCH: checkout header stacking fix === */
#checkout .ff-sheet__header {
  position: relative;
  z-index: 60;
}

#checkout .ff-iconbtn,
#checkout [data-ff-close-checkout] {
  position: relative;
  z-index: 61;
}

/* backdrop remains below interactive chrome */
#checkout .ff-sheet__backdrop {
  z-index: 40;
}
/* === END FF PATCH === */
""".strip()


def patch_css(path: Path) -> bool:
    css = path.read_text(encoding="utf-8")

    if "checkout header stacking fix" in css:
        return False  # already patched

    css = css.rstrip() + "\n\n" + INSERT + "\n"
    path.write_text(css, encoding="utf-8")
    return True


def main():
    if len(sys.argv) != 2:
        print("Usage: patch_ff_checkout_header_stack.py app/static/css/ff.css")
        sys.exit(1)

    css_path = Path(sys.argv[1])
    if not css_path.exists():
        print(f"❌ File not found: {css_path}")
        sys.exit(1)

    changed = patch_css(css_path)
    if changed:
        print(f"✅ Checkout header stacking fixed in {css_path}")
    else:
        print(f"ℹ️  Patch already present in {css_path}")


if __name__ == "__main__":
    main()
