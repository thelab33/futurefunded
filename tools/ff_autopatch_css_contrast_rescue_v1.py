#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from datetime import datetime

CSS_PATH = Path("app/static/css/ff.css")

# Keep these single-line (Python string literals can't contain raw newlines)
MARK_START = "FF CONTRAST RESCUE (v1)"
MARK_END = "EOF: FF CONTRAST RESCUE"

PATCH = """/* ============================================================================
  FF CONTRAST RESCUE (v1)
  - Fix primary button + rail chip contrast in light/dark.
  - Hook-safe: no renames, only overrides.
============================================================================ */

@layer ff.controls {
  /* ---- PRIMARY BUTTONS: force correct bg/fg pairing ---- */
  .ff-body :where(a.ff-btn.ff-btn--primary, button.ff-btn.ff-btn--primary) {
    background: var(--ff-accent, #2563eb) !important;
    border-color: rgba(255, 255, 255, 0.18) !important;
    color: var(--ff-on-accent, #ffffff) !important;
  }

  .ff-body :where(a.ff-btn.ff-btn--primary, button.ff-btn.ff-btn--primary) :where(.ff-btn__label, .ff-btn__meta, .ff-btn__sub, span) {
    color: inherit !important;
  }

  .ff-body :where(a.ff-btn.ff-btn--primary, button.ff-btn.ff-btn--primary):where(:hover, :focus-visible) {
    filter: brightness(1.05) saturate(1.02);
  }

  /* ---- HERO RAIL CHIP: fix white-on-white / black-on-black ---- */
  .ff-body .ff-railcard__chip {
    background: rgba(10, 13, 20, 0.08) !important;
    color: rgba(10, 13, 20, 0.92) !important;
    border: 1px solid rgba(10, 13, 20, 0.12) !important;
  }

  /* Dark theme chip overrides (supports multiple theme conventions) */
  .ff-root[data-ff-theme="dark"] .ff-body .ff-railcard__chip,
  .ff-root[data-theme="dark"] .ff-body .ff-railcard__chip,
  .ff-root.dark .ff-body .ff-railcard__chip {
    background: rgba(255, 255, 255, 0.10) !important;
    color: rgba(255, 255, 255, 0.92) !important;
    border-color: rgba(255, 255, 255, 0.14) !important;
  }
}

/* EOF: FF CONTRAST RESCUE */
"""

def upsert(css: str) -> str:
    # If already present, replace the whole block (from start marker line to end marker line).
    if MARK_START in css and MARK_END in css:
        start_idx = css.find(MARK_START)
        # Walk back to the beginning of the comment block line
        start_line_idx = css.rfind("\n", 0, start_idx)
        if start_line_idx == -1:
            start_line_idx = 0

        end_idx = css.find(MARK_END, start_idx)
        end_line_end = css.find("\n", end_idx)
        if end_line_end == -1:
            end_line_end = len(css)

        before = css[:start_line_idx].rstrip()
        after = css[end_line_end:].lstrip()
        return before + "\n\n" + PATCH.strip() + "\n\n" + after

    # Otherwise append at end (late wins, safest)
    return css.rstrip() + "\n\n" + PATCH.strip() + "\n"

def main() -> int:
    if not CSS_PATH.exists():
        print(f"[ff-contrast] ❌ missing {CSS_PATH}")
        return 2

    css = CSS_PATH.read_text(encoding="utf-8", errors="replace")
    out = upsert(css)

    if out == css:
        print("[ff-contrast] ✅ already present (no changes)")
        return 0

    bak = CSS_PATH.with_suffix(f".css.bak_contrast_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    bak.write_text(css, encoding="utf-8")
    CSS_PATH.write_text(out, encoding="utf-8")

    print("[ff-contrast] ✅ patched ff.css")
    print(f"[ff-contrast] 🧷 backup -> {bak}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
