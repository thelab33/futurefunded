#!/usr/bin/env python3
"""
patch_ff_checkout_close_fixed.py

FINAL authoritative fix for checkout close button hit-testing.

Moves close button into viewport coordinate space using position:fixed
to prevent negative elementFromPoint() results in Playwright.

CSS-only, idempotent, production-safe.
"""

from pathlib import Path
import sys

MARKER_START = "/* === FF CHECKOUT CLOSE FIXED POSITION (AUTO-PATCH) === */"
MARKER_END = "/* === END FF CHECKOUT CLOSE FIXED POSITION === */"

PATCH = """
/* === FF CHECKOUT CLOSE FIXED POSITION (AUTO-PATCH) === */

/*
  The checkout close button MUST live in viewport space.
  This prevents negative hit-test coordinates caused by
  scroll / transform / translate animations.
*/

.ff-body .ff-sheet--checkout [data-ff-close-checkout] {
  position: fixed !important;
  top: max(14px, env(safe-area-inset-top));
  right: 14px;
  z-index: 1005;
  transform: none !important;
  pointer-events: auto;
}

/* Ensure backdrop never intercepts the fixed close button */
.ff-body .ff-sheet--checkout .ff-sheet__backdrop {
  z-index: 1000;
}

/* Panel remains below the close button */
.ff-body .ff-sheet--checkout .ff-sheet__panel {
  z-index: 1001;
}

/* === END FF CHECKOUT CLOSE FIXED POSITION === */
""".strip()


def patch_css(path: Path):
    css = path.read_text(encoding="utf-8")

    if MARKER_START in css:
        print("✔ Fixed-position close patch already present")
        return

    patched = css.rstrip() + "\n\n" + PATCH + "\n"
    path.write_text(patched, encoding="utf-8")
    print(f"✅ Patched fixed-position checkout close into {path}")


def main():
    if len(sys.argv) != 2:
        print("Usage: python patch_ff_checkout_close_fixed.py app/static/css/ff.css")
        sys.exit(1)

    css_path = Path(sys.argv[1])
    if not css_path.exists():
        print(f"❌ File not found: {css_path}")
        sys.exit(1)

    patch_css(css_path)


if __name__ == "__main__":
    main()
