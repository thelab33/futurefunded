#!/usr/bin/env python3
"""
patch_ff_checkout_zindex_contract.py

Enforces a strict z-index ordering so the checkout close button
is always above the backdrop in the same stacking context.

This directly satisfies ff_checkout_ux.spec.ts.
"""

from pathlib import Path
import sys

MARKER = "/* === FF CHECKOUT Z-INDEX CONTRACT (AUTO-PATCH) === */"

PATCH = """
/* === FF CHECKOUT Z-INDEX CONTRACT (AUTO-PATCH) === */

/* Backdrop must be below interactive controls */
.ff-body #checkout .ff-sheet__backdrop {
  z-index: 10 !important;
}

/* Panel sits above backdrop */
.ff-body #checkout .ff-sheet__panel {
  z-index: 20 !important;
}

/* Close button must be the topmost clickable target */
.ff-body #checkout [data-ff-close-checkout] {
  z-index: 30 !important;
  pointer-events: auto;
}

/* === END FF CHECKOUT Z-INDEX CONTRACT === */
""".strip()


def main():
    if len(sys.argv) != 2:
        print("Usage: python patch_ff_checkout_zindex_contract.py app/static/css/ff.css")
        sys.exit(1)

    css_path = Path(sys.argv[1])
    if not css_path.exists():
        print(f"❌ File not found: {css_path}")
        sys.exit(1)

    css = css_path.read_text(encoding="utf-8")

    if MARKER in css:
        print("✔ Z-index contract patch already present")
        return

    css_path.write_text(css.rstrip() + "\n\n" + PATCH + "\n", encoding="utf-8")
    print(f"✅ Enforced checkout z-index contract in {css_path}")


if __name__ == "__main__":
    main()
