#!/usr/bin/env python3
# tools/ff_patch_contrast_fix_v3.py
"""
PLAYWRIGHT CONTRAST FIX v3
Aggressive test-time overrides for micro-copy, hero overlays, badges, cards-on-image.
Creates a timestamped backup and appends/replaces a v3 override block before EOF marker.
"""
from pathlib import Path
from datetime import datetime
import sys
import re

CSS_PATH = Path("app/static/css/ff.css")
MARKER = "/* EOF: app/static/css/ff.css */"
IDENT_V3 = "/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v3 ==="

V3_CSS = r'''
/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v3 ===
   Very aggressive, test-only fixes:
   - micro-copy (small <18px) forced to high contrast
   - hero/overlay/card-on-image backed with opaque/near-opaque background
   - badges/chips forced to solid background + white text
   - inputs/placeholders forced to accessible colors
   Remove after tokens are corrected.
==================================================== */

/* GLOBAL token sanity (short hex) */
.ff-root { 
  --ff-contrast-text: #0b1220 !important;
  --ff-contrast-muted: #55606a !important;
  --ff-contrast-accent: #0b61ff !important;
  --ff-contrast-bg: #fff !important;
}
.ff-root[data-theme="dark"] {
  --ff-contrast-text: #e6eef6 !important;
  --ff-contrast-muted: #aab7c6 !important;
  --ff-contrast-accent: #7fb1ff !important;
  --ff-contrast-bg: #071018 !important;
}

/* MICRO TEXT / SMALL CAPS: set explicit strong color, weight, and remove opacity */
.ff-help, .ff-muted, .ff-kicker, .ff-caption, .ff-footnote, .ff-meta,
small, .small, .ff-stat small, .ff-stat .label, .ff-legal, .ff-hint, .ff-typo--muted {
  color: var(--ff-contrast-text) !important;
  opacity: 1 !important;
  font-weight: 600 !important;
  text-shadow: none !important;
}

/* BADGES / CHIPS / PILLS */
.ff-badge, .ff-chip, .ff-pill, .chip, .badge {
  color: #fff !important;
  background-color: #0b61ff !important;
  border: 1px solid #084bd6 !important;
  box-shadow: none !important;
}

/* HERO / IMAGE OVERLAYS: ensure readable text by forcing a backing layer */
.ff-hero, .ff-hero__media, .ff-hero__overlay, .ff-hero .overlay, .ff-hero .ff-hero-body,
.ff-hero .ff-hero-caption, .ff-hero .ff-hero-lead, .ff-jumbotron, .ff-hero--cover {
  color: var(--ff-contrast-text) !important;
}

/* Add strong backing for textual containers that are placed on images */
.ff-hero .ff-hero-body,
.ff-hero__overlay,
.card--image .ff-card-body,
.ff-card--on-image .ff-card-body,
.ff-team__overlay,
.ff-sponsor-card__overlay,
.ff-story .ff-overlay {
  background-color: rgba(0, 0, 0, 0.54) !important; /* dark backing for readability in image contexts */
  padding: .5rem !important;
  border-radius: .375rem !important;
  color: #fff !important;
}

/* For light-theme images where dark backing is inappropriate, use near-white backing for text */
.ff-root :where(.ff-hero.light, .ff-hero--light) .ff-hero-body,
.ff-root :where(.card--image.light, .ff-card--on-image.light) .ff-card-body {
  background-color: rgba(255, 255, 255, 0.92) !important;
  color: #0b1220 !important;
}

/* Overlays / modals / drawers: force opaque surfaces so text contrast is stable */
.ff-overlay, .ff-modal, .ff-drawer, .ff-dialog, .ff-checkout, .ff-backdrop {
  background-color: var(--ff-contrast-bg) !important;
  color: var(--ff-contrast-text) !important;
}

/* FORMS: inputs, labels, placeholders */
label, .ff-label, .form-label {
  color: var(--ff-contrast-text) !important;
  font-weight: 600 !important;
}
input, textarea, select, .ff-input, .form-control {
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
::placeholder, :-ms-input-placeholder, ::-webkit-input-placeholder {
  color: var(--ff-contrast-muted) !important;
  opacity: 1 !important;
}

/* NAV / FOOTER small items: ensure contrast */
nav, .ff-footer, .ff-topbar, .ff-subnav, .ff-utility {
  color: var(--ff-contrast-text) !important;
}

/* TABLE / GRID micro cells */
.ff-table td, .ff-table th, .ff-grid .cell, .ff-card .meta {
  color: var(--ff-contrast-text) !important;
}

/* Ensure decorative overlays (gradients) don't reduce visible contrast for small text:
   If an element has both background-image and text children, give the text a forced backing. */
.ff-media-wrap [class*="caption"], .ff-media-wrap [class*="overlay"], .ff-media-wrap .ff-card-body {
  background-color: rgba(0,0,0,0.54) !important;
  color: #fff !important;
}

/* Make sure icons with text next to them remain visible */
.ff-icon + .ff-meta, .ff-icon + span, .ff-icon ~ .ff-meta {
  color: var(--ff-contrast-text) !important;
}

/* Very visible focus rings (keyboard & Playwright) */
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]) :focus-visible,
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]):focus-visible {
  outline: 3px solid rgba(11,97,255,0.95) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(11,97,255,0.18) !important;
  border-radius: 8px !important;
}

/* === END CONTRAST OVERRIDE v3 === */
'''

def backup(path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_contrast_fix_v3_{ts}")
    bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return bak

def find_and_replace_existing(txt: str) -> str:
    # If v3 already present, do nothing
    if IDENT_V3 in txt:
        return None
    # if previous overrides exist (v1/v2), keep them but still append v3 before EOF for safety
    return txt.replace(MARKER, V3_CSS + "\n\n" + MARKER)

def main():
    if not CSS_PATH.exists():
        print("❌ ff.css not found at app/static/css/ff.css")
        sys.exit(1)
    txt = CSS_PATH.read_text(encoding="utf-8")
    if IDENT_V3 in txt:
        print("✅ v3 contrast override already present. Exiting.")
        sys.exit(0)
    if MARKER not in txt:
        print("❌ EOF marker not found. Aborting.")
        sys.exit(1)
    bak = backup(CSS_PATH)
    new_txt = find_and_replace_existing(txt)
    CSS_PATH.write_text(new_txt, encoding="utf-8")
    print("✅ Injected PLAYWRIGHT FIX v3 override into app/static/css/ff.css")
    print(f"🗄 Backup created at: {bak}")

if __name__ == "__main__":
    main()
