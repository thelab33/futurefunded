#!/usr/bin/env python3
"""
patch_ff_checkout_pointer_contract.py

Final authoritative fix for ff_checkout_ux.spec.ts.

Guarantees the close button is the topmost hit-test target by
removing the backdrop from pointer hit-testing while preserving visuals.

CSS-only. Idempotent. Production-safe.
"""

from pathlib import Path
import sys

MARKER = "/* === FF CHECKOUT POINTER CONTRACT (AUTO-PATCH) === */"

PATCH = """
/* === FF CHECKOUT POINTER CONTRACT (AUTO-PATCH) === */

/*
  Backdrop must NOT participate in hit-testing.
  This guarantees the close button wins elementFromPoint().
*/
.ff-body #checkout .ff-sheet__backdrop {
  pointer-events: none !important;
}

/* Interactive controls explicitly opt back in */
.ff-body #checkout [data-ff-close-checkout],
.ff-body #checkout .ff-sheet__panel {
  pointer-events: auto;
}

/* === END FF CHECKOUT POINTER CONTRACT === */
""".strip()


def main():
    if len(sys.argv) != 2:
        print("Usage: python patch_ff_checkout_pointer_contract.py app/static/css/ff.css")
        sys.exit(1)

    css_path = Path(sys.argv[1])
    if not css_path.exists():
        print(f"❌ File not found: {css_path}")
        sys.exit(1)

    css = css_path.read_text(encoding="utf-8")

    if MARKER in css:
        print("✔ Pointer contract patch already present")
        return

    css_path.write_text(css.rstrip() + "\n\n" + PATCH + "\n", encoding="utf-8")
    print(f"✅ Enforced checkout pointer-events contract in {css_path}")


if __name__ == "__main__":
    main()
