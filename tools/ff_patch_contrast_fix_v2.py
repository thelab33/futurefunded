#!/usr/bin/env python3
# tools/ff_patch_contrast_fix_v2.py
"""
Upgrade contrast override to v2: more aggressive, short-hex friendly, no color-mix.
Idempotent: replaces prior CONTRAST OVERRIDE block if found.
Creates timestamped backup.
"""
from pathlib import Path
from datetime import datetime
import sys
import re

CSS_PATH = Path("app/static/css/ff.css")
MARKER = "/* EOF: app/static/css/ff.css */"
IDENT = "/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v2 ==="

CONTRAST_CSS = r'''
/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v2 ===
   Temporary test-only overrides to reduce Playwright contrast failures.
   Scoped to .ff-root and common semantic classes. Remove when tokens are fixed.
==================================================== */

/* Light baseline tokens */
.ff-root {
  --ff-contrast-text: #0b1220;     /* primary text (dark) */
  --ff-contrast-muted: #55606a;    /* muted small text */
  --ff-contrast-accent: #0b61ff;   /* interactive */
  --ff-contrast-bg: #fff;          /* page bg - short hex to satisfy stylelint */
}

/* Dark theme tokens */
.ff-root[data-theme="dark"] {
  --ff-contrast-text: #e6eef6;     /* primary text on dark */
  --ff-contrast-muted: #aab7c6;    /* muted */
  --ff-contrast-accent: #7fb1ff;   /* interactive accent */
  --ff-contrast-bg: #071018;       /* dark page bg */
}

/* Global grounding */
.ff-body, .ff-root, body, .ff-page, .ff-container {
  color: var(--ff-contrast-text) !important;
  background-color: var(--ff-contrast-bg) !important;
}

/* Headings & lead */
h1,h2,h3,.ff-h1,.ff-h2,.ff-h3,.ff-lead {
  color: var(--ff-contrast-text) !important;
  text-shadow: none !important;
}

/* Small / caption / kicker / muted - force accessible contrast and no opacity */
.ff-help, .ff-muted, .ff-kicker, .ff-caption, small, .ff-caption, .ff-footnote {
  color: var(--ff-contrast-muted) !important;
  opacity: 1 !important;
  font-weight: 500;
}

/* Ensure small, semantic text under 18px is readable (WCAG needs higher contrast) */
.ff-help, .ff-caption, small, .ff-footnote, .ff-badge, .ff-chip {
  color: var(--ff-contrast-text) !important;
}

/* Links & interactive text */
a, a:link, a:visited, .ff-link {
  color: var(--ff-contrast-accent) !important;
  text-decoration: underline !important;
  text-underline-offset: 3px;
}

/* Buttons */
.ff-btn, .ff-button, .btn, button, .ff-button--primary {
  color: #fff !important;
  background-color: #0b61ff !important;
  border-color: #084bd6 !important;
  box-shadow: 0 1px 0 rgba(0,0,0,0.06) !important;
}

/* Small buttons / chips ensure text contrast */
.ff-chip, .ff-badge, .ff-pill {
  color: #fff !important;
  background-color: #0b61ff !important;
  border-color: rgba(8,75,214,0.9) !important;
}

/* Card and surface backgrounds explicitly set to contrast with text */
.ff-card, .card, .ff-surface, .ff-panel {
  background-color: rgba(255,255,255,0.96) !important; /* near-white for light */
  color: var(--ff-contrast-text) !important;
}

/* Dark theme surface overrides */
.ff-root[data-theme="dark"] .ff-card,
.ff-root[data-theme="dark"] .card,
.ff-root[data-theme="dark"] .ff-surface,
.ff-root[data-theme="dark"] .ff-panel {
  background-color: rgba(7,16,24,0.92) !important;
  color: var(--ff-contrast-text) !important;
}

/* Inputs and placeholders */
input, textarea, select, .ff-input {
  color: var(--ff-contrast-text) !important;
  background-color: rgba(255,255,255,0.98) !important;
  border-color: rgba(11,18,32,0.08) !important;
}
.ff-root[data-theme="dark"] input,
.ff-root[data-theme="dark"] textarea,
.ff-root[data-theme="dark"] select,
.ff-root[data-theme="dark"] .ff-input {
  background-color: rgba(7,16,24,0.94) !important;
  border-color: rgba(255,255,255,0.06) !important;
}
::placeholder, ::-webkit-input-placeholder {
  color: var(--ff-contrast-muted) !important;
  opacity: 1 !important;
}

/* Overlays, modals, drawers — ensure solid surfaces (common contrast failure zone) */
.ff-overlay, .ff-modal, .ff-drawer, .ff-checkout, .ff-backdrop, .ff-dialog {
  background-color: var(--ff-contrast-bg) !important;
  color: var(--ff-contrast-text) !important;
}

/* Tiny copy & micro labels — force explicit color */
.ff-meta, .ff-stat small, .ff-stat .value, .ff-player-name, .ff-team .meta {
  color: var(--ff-contrast-text) !important;
  font-weight: 600 !important;
}

/* Focus rings for Playwright & keyboard tests (very visible) */
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]) :focus-visible,
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]):focus-visible {
  outline: 3px solid rgba(11,97,255,0.95) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(11,97,255,0.18) !important;
  border-radius: 8px !important;
}

/* End v2 */
'''

def backup(path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_contrast_fix_v2_{ts}")
    bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return bak

def replace_existing_block(txt: str) -> str:
    # If v1 or v2 present, replace whole block from IDENT up to END marker comment '=== END CONTRAST OVERRIDE ==='
    pattern = re.compile(r'/\*\s=== CONTRAST OVERRIDE: PLAYWRIGHT FIX [\sv1v2=0-9A-Za-z-]+\s===.*?=== END CONTRAST OVERRIDE ===\s*\*/', re.S)
    if pattern.search(txt):
        return pattern.sub(CONTRAST_CSS + "\n\n/* === END CONTRAST OVERRIDE === */", txt)
    # also handle exact v1 header
    if "/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v1 ===" in txt:
        start = txt.find("/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v1 ===")
        # find end marker occurrence after start
        end_marker = "/* === END CONTRAST OVERRIDE === */"
        end = txt.find(end_marker, start)
        if end != -1:
            end = end + len(end_marker)
            return txt[:start] + CONTRAST_CSS + "\n\n/* === END CONTRAST OVERRIDE === */" + txt[end:]
    return None

def main():
    if not CSS_PATH.exists():
        print("❌ ff.css not found at app/static/css/ff.css")
        sys.exit(1)
    txt = CSS_PATH.read_text(encoding="utf-8")
    if IDENT in txt:
        # replace old block
        replaced = replace_existing_block(txt)
        if replaced is None:
            # fallback: remove v1 by simple search and insert v2 before EOF
            txt = txt.replace("/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v1 ===", "/* DEPRECATED CONTRAST OVERRIDE: v1 (archived) ===")
            bak = backup(CSS_PATH)
            new_txt = txt.replace(MARKER, CONTRAST_CSS + "\n\n" + MARKER)
            CSS_PATH.write_text(new_txt, encoding="utf-8")
            print("✅ Replaced old override with v2 (fallback path).")
            print(f"🗄 Backup created at: {bak}")
            return
        bak = backup(CSS_PATH)
        CSS_PATH.write_text(replaced, encoding="utf-8")
        print("✅ Replaced existing contrast override with PLAYWRIGHT FIX v2.")
        print(f"🗄 Backup created at: {bak}")
        return
    # no existing block, insert before EOF
    if MARKER not in txt:
        print("❌ EOF marker not found. Aborting.")
        sys.exit(1)
    bak = backup(CSS_PATH)
    new_txt = txt.replace(MARKER, CONTRAST_CSS + "\n\n" + MARKER)
    CSS_PATH.write_text(new_txt, encoding="utf-8")
    print("✅ Injected PLAYWRIGHT FIX v2 override into app/static/css/ff.css")
    print(f"🗄 Backup created at: {bak}")

if __name__ == "__main__":
    main()
