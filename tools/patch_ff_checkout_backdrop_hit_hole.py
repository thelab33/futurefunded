#!/usr/bin/env python3
"""
FutureFunded — Checkout Backdrop Hit-Test Hole
Ensures close button is the topmost clickable target by
removing backdrop hit-testing in the close-button zone.

CSS-only. Deterministic. Playwright-safe.
"""

import sys
from pathlib import Path

MARKER = "/* ff:checkout-backdrop-hit-hole */"

PATCH = f"""
{MARKER}

/* Define close-button safe zone */
#checkout {{
  --ff-close-safe-size: 72px;
}}

/* Backdrop is NOT hit-testable in close zone */
#checkout .ff-sheet__backdrop {{
  pointer-events: auto;
  clip-path: inset(
    var(--ff-close-safe-size) 0 0 0
  );
}}

/* Close button lives above everything */
#checkout [data-ff-close-checkout] {{
  position: fixed;
  top: max(env(safe-area-inset-top, 0px), 12px);
  right: max(env(safe-area-inset-right, 0px), 12px);
  z-index: 1000;
  pointer-events: auto;
}}
"""

def main():
    if len(sys.argv) != 2:
        print("Usage: patch_ff_checkout_backdrop_hit_hole.py <ff.css>")
        sys.exit(1)

    css_path = Path(sys.argv[1])
    css = css_path.read_text(encoding="utf-8")

    if MARKER in css:
        print("ℹ️ Backdrop hit-hole patch already applied")
        return

    css += "\n" + PATCH + "\n"
    css_path.write_text(css, encoding="utf-8")
    print(f"✅ Backdrop hit-test hole applied in {css_path}")

if __name__ == "__main__":
    main()
