#!/usr/bin/env python3
"""
patch_ff_checkout_final_contract.py

Final authoritative checkout interaction contract.

Ensures:
- Backdrop is clickable
- Close button is ALWAYS above backdrop
- Both ff_checkout_ux tests pass
"""

from pathlib import Path
import sys

MARKER = "/* === FF CHECKOUT FINAL INTERACTION CONTRACT === */"

PATCH = """
/* === FF CHECKOUT FINAL INTERACTION CONTRACT === */

/* Backdrop: clickable, but BELOW all controls */
.ff-body #checkout .ff-sheet__backdrop {
  z-index: 10 !important;
  pointer-events: auto !important;
}

/* Panel above backdrop */
.ff-body #checkout .ff-sheet__panel {
  z-index: 20 !important;
}

/* Close button must ALWAYS win hit-testing */
.ff-body #checkout [data-ff-close-checkout] {
  z-index: 40 !important;
  pointer-events: auto !important;
}

/* === END FF CHECKOUT FINAL INTERACTION CONTRACT === */
""".strip()


def main():
    if len(sys.argv) != 2:
        print("Usage: python patch_ff_checkout_final_contract.py app/static/css/ff.css")
        sys.exit(1)

    css_path = Path(sys.argv[1])
    if not css_path.exists():
        print(f"❌ File not found: {css_path}")
        sys.exit(1)

    css = css_path.read_text(encoding="utf-8")

    if MARKER in css:
        print("✔ Final checkout interaction contract already present")
        return

    css_path.write_text(css.rstrip() + "\n\n" + PATCH + "\n", encoding="utf-8")
    print(f"✅ Enforced FINAL checkout interaction contract in {css_path}")


if __name__ == "__main__":
    main()
