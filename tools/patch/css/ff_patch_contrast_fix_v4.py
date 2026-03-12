#!/usr/bin/env python3
# tools/ff_patch_contrast_fix_v4.py
"""
PLAYWRIGHT CONTRAST FIX v4
Surgical test-time overrides:
 - adds readable backing for text-on-image (hero, cards-on-image, sponsor/player overlays)
 - forces high-contrast color for micro-copy, badges, chips, footer/nav small text
 - idempotent, creates timestamped backup, appends before EOF marker
"""
from pathlib import Path
from datetime import datetime
import sys

CSS_PATH = Path("app/static/css/ff.css")
MARKER = "/* EOF: app/static/css/ff.css */"
IDENT = "/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v4 ==="

V4_CSS = r'''
/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v4 ===
   Test-only: aggressive but scoped fixes for text-on-image and micro-copy.
   Remove this block after tokens and surfaces are fixed.
==================================================== */

/* Ensure design token fallbacks exist (short hex) */
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

/* 1) Micro-copy / small text: force readable color & weight */
.ff-help, .ff-muted, .ff-kicker, .ff-caption, .ff-footnote,
.small, small, .ff-stat small, .ff-stat .label, .ff-legal, .ff-hint,
footer .small, .ff-footer .small, .ff-topbar .small, nav .small {
  color: var(--ff-contrast-text) !important;
  opacity: 1 !important;
  font-weight: 600 !important;
  text-shadow: none !important;
}

/* 2) Badges / chips: solid background + white copy */
.ff-badge, .ff-chip, .ff-pill, .chip, .badge, .ff-sponsor-badge {
  color: #fff !important;
  background-color: #0b61ff !important;
  border-color: #084bd6 !important;
  box-shadow: none !important;
}

/* 3) Text-on-image containers: add an anchored overlay backing for readability */
.ff-hero .ff-hero-body,
.ff-hero__overlay,
.card--image .ff-card-body,
.ff-card--on-image .ff-card-body,
.ff-team__overlay,
.ff-sponsor-card__overlay,
.ff-player__overlay,
.ff-story .ff-overlay,
.ff-media-wrap .caption,
.ff-hero .overlay,
.ff-hero__content,
.ff-jumbotron .overlay,
.ff-hero--cover .ff-hero-body {
  position: relative !important;
  z-index: 1 !important;
  color: #fff !important;
}

/* Insert pseudo-element backing for those containers (near-opaque black by default) */
.ff-hero .ff-hero-body::before,
.ff-hero__overlay::before,
.card--image .ff-card-body::before,
.ff-card--on-image .ff-card-body::before,
.ff-team__overlay::before,
.ff-sponsor-card__overlay::before,
.ff-player__overlay::before,
.ff-story .ff-overlay::before,
.ff-media-wrap .caption::before,
.ff-jumbotron .overlay::before,
.ff-hero__content::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  background-color: rgba(0,0,0,0.56) !important;
  z-index: 0 !important;
  border-radius: inherit !important;
  pointer-events: none !important;
}

/* Make sure children (the text) sit above the backing */
.ff-hero .ff-hero-body > * ,
.ff-hero__overlay > * ,
.card--image .ff-card-body > * ,
.ff-card--on-image .ff-card-body > * ,
.ff-team__overlay > * ,
.ff-sponsor-card__overlay > * ,
.ff-player__overlay > * ,
.ff-story .ff-overlay > * ,
.ff-media-wrap .caption > * ,
.ff-jumbotron .overlay > * ,
.ff-hero__content > * {
  position: relative !important;
  z-index: 2 !important;
}

/* 4) Overlays, modals and drawers: ensure opaque surfaces */
.ff-overlay, .ff-modal, .ff-drawer, .ff-dialog, .ff-checkout, .ff-backdrop {
  background-color: var(--ff-contrast-bg) !important;
  color: var(--ff-contrast-text) !important;
}

/* 5) Inputs and placeholders */
label, .ff-label, .form-label { color: var(--ff-contrast-text) !important; font-weight: 600 !important; }
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
::placeholder { color: var(--ff-contrast-muted) !important; opacity: 1 !important; }

/* 6) Links & interactive text */
a, a:link, a:visited, .ff-link { color: var(--ff-contrast-accent) !important; text-decoration: underline !important; }

/* 7) tiny / meta table cells */
.ff-table td, .ff-table th, .ff-grid .cell, .ff-card .meta { color: var(--ff-contrast-text) !important; }

/* 8) Very visible focus rings for tests */
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]) :focus-visible,
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]):focus-visible {
  outline: 3px solid rgba(11,97,255,0.95) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(11,97,255,0.18) !important;
  border-radius: 8px !important;
}

/* === END CONTRAST OVERRIDE v4 === */
'''

def backup(path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_contrast_fix_v4_{ts}")
    bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return bak

def main():
    if not CSS_PATH.exists():
        print("❌ ff.css not found at app/static/css/ff.css")
        sys.exit(1)
    txt = CSS_PATH.read_text(encoding="utf-8")
    if IDENT in txt:
        print("✅ v4 override already present. Exiting.")
        sys.exit(0)
    if MARKER not in txt:
        print("❌ EOF marker not found. Aborting.")
        sys.exit(1)
    bak = backup(CSS_PATH)
    new_txt = txt.replace(MARKER, V4_CSS + "\n\n" + MARKER)
    CSS_PATH.write_text(new_txt, encoding="utf-8")
    print("✅ Injected PLAYWRIGHT FIX v4 override into app/static/css/ff.css")
    print(f"🗄 Backup created at: {bak}")

if __name__ == "__main__":
    main()
