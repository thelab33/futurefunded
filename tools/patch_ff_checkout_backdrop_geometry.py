#!/usr/bin/env python3
"""
patch_ff_checkout_backdrop_geometry.py

Final authoritative fix for checkout hit-testing.

Ensures the backdrop does NOT cover the header area
(where the close button lives), preventing elementFromPoint
from ever resolving to the backdrop over the close button.

CSS-only. Idempotent. Production-safe.
"""

from pathlib import Path
import sys

MARKER = "/* === FF CHECKOUT BACKDROP GEOMETRY FIX === */"

PATCH = """
/* === FF CHECKOUT BACKDROP GEOMETRY FIX === */

/*
  Backdrop must start BELOW the header.
  This prevents it from covering the close button hit area.
*/

.ff-body #checkout {
  --ff-checkout-header-h: 72px; /* safe default, matches visual header */
}

/* Backdrop covers only content area, not header */
.ff-body #checkout .ff-sheet__backdrop {
  top: var(--ff-checkout-header-h) !important;
  height: calc(100dvh - var(--ff-checkout-header-h)) !important;
}

/* Header remains above backdrop, no overlap */
.ff-body #checkout .ff-sheet__header {
  position: relative;
  z-index: 50;
}

/* Close button safely above everything */
.ff-body #checkout [data-ff-close-checkout] {
  position: relative;
  z-index: 60;
}

/* === END FF CHECKOUT BACKDROP GEOMETRY FIX === */
""".strip()


def main():
    if len(sys.argv) != 2:
        print("Usage: python patch_ff_checkout_backdrop_geometry.py app/static/css/ff.css")
        sys.exit(1)

    css_path = Path(sys.argv[1])
    if not css_path.exists():
        print(f"❌ File not found: {css_path}")
        sys.exit(1)

    css = css_path.read_text(encoding="utf-8")

    if MARKER in css:
        print("✔ Backdrop geometry fix already present")
        return

    css_path.write_text(css.rstrip() + "\n\n" + PATCH + "\n", encoding="utf-8")
    print(f"✅ Enforced backdrop geometry fix in {css_path}")


if __name__ == "__main__":
    main()
