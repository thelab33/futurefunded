#!/usr/bin/env python3
"""
patch_ff_checkout_stacking.py

Deterministic CSS patch for FutureFunded checkout stacking context.
Fixes Playwright failure where backdrop intercepts close button clicks.

- Idempotent (safe to re-run)
- CSS-only
- Hook-safe
"""

from pathlib import Path
import sys

CSS_MARKER_START = "/* === FF CHECKOUT STACKING FIX (AUTO-PATCH) === */"
CSS_MARKER_END = "/* === END FF CHECKOUT STACKING FIX === */"

PATCH_BLOCK = f"""
{CSS_MARKER_START}
.ff-body .ff-sheet {{
  position: fixed;
  inset: 0;
  z-index: 1000;
  isolation: isolate;
}}

.ff-body .ff-sheet__backdrop {{
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: auto;
}}

.ff-body .ff-sheet__panel {{
  position: relative;
  z-index: 2;
  pointer-events: auto;
}}

.ff-body .ff-sheet__panel [data-ff-close-checkout] {{
  position: relative;
  z-index: 3;
  pointer-events: auto;
}}
{CSS_MARKER_END}
""".strip()


FC_IMPACT_GUARD = """
/* === FF STACK GUARD: DEMOTE FC-IMPACT OVERLAYS === */
.fc-impact {
  z-index: 10;
}

.fc-impact .fc-sheet {
  z-index: 20;
}
/* === END FF STACK GUARD === */
""".strip()


def patch_css(css_path: Path, include_fc_guard: bool = True) -> None:
    original = css_path.read_text(encoding="utf-8")

    if CSS_MARKER_START in original:
        print(f"✔ Checkout stacking patch already present in {css_path}")
        return

    patched = original.rstrip() + "\n\n" + PATCH_BLOCK

    if include_fc_guard and "fc-impact" in original and "FF STACK GUARD" not in original:
        patched += "\n\n" + FC_IMPACT_GUARD

    css_path.write_text(patched + "\n", encoding="utf-8")
    print(f"✅ Patched checkout stacking into {css_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python patch_ff_checkout_stacking.py app/static/css/ff.css")
        sys.exit(1)

    css_file = Path(sys.argv[1]).resolve()
    if not css_file.exists():
        print(f"❌ File not found: {css_file}")
        sys.exit(1)

    patch_css(css_file)


if __name__ == "__main__":
    main()
