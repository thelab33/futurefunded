#!/usr/bin/env python3
# tools/ff_patch_contrast_fix_v1.py
"""
Fast patch: inject high-contrast overrides into app/static/css/ff.css
Safe: creates a timestamped backup and injects before EOF marker.
"""
from pathlib import Path
from datetime import datetime
import sys

CSS_PATH = Path("app/static/css/ff.css")
MARKER = "/* EOF: app/static/css/ff.css */"

CONTRAST_CSS = r'''
/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v1 ===
   Purpose: temporary, conservative overrides to satisfy WCAG AA contrast
   Targets: base text, headings, muted/help text, links, primary buttons, cards
   Notes: Keep minimal and scoped to .ff-root data-theme selectors so it's safe to remove later.
==================================================== */

.ff-root {
  /* baseline fallback -- non-invasive */
  --ff-contrast-text: #0b1220;         /* strong text for light theme */
  --ff-contrast-muted: #5b6b7a;        /* muted (light) */
  --ff-contrast-accent: #0b61ff;       /* interactive accent (light) */
  --ff-contrast-bg: #ffffff;
}

.ff-root[data-theme="dark"] {
  --ff-contrast-text: #e6eef6;         /* very light text on dark */
  --ff-contrast-muted: #b7c5d6;        /* muted in dark */
  --ff-contrast-accent: #7fb1ff;       /* accessible accent in dark */
  --ff-contrast-bg: #071018;
}

/* Apply directly to common semantic classes used across FF pages.
   These rules are intentionally specific and conservative. */

.ff-body,
.ff-root,
body,
.ff-container,
.ff-page {
  color: var(--ff-contrast-text) !important;
  background-color: var(--ff-contrast-bg) !important;
}

/* Headings & important text */
.ff-h1, .ff-h2, .ff-h3, h1, h2, h3, .ff-lead {
  color: var(--ff-contrast-text) !important;
  text-shadow: none !important;
}

/* Muted/help text: darken for light theme, lighten for dark theme */
.ff-help, .ff-muted, .ff-kicker, .ff-caption {
  color: var(--ff-contrast-muted) !important;
  opacity: 1 !important; /* ensure Playwright sees it */
}

/* Links (ensure interactive color and minimum contrast) */
a, a:link, a:visited {
  color: var(--ff-contrast-accent) !important;
  text-decoration: underline !important;
}

/* Buttons: primary and secondary */
.ff-btn, .btn, button, .ff-button, .ff-button--primary {
  color: #ffffff !important; /* white text on colored btn for accessible contrast */
  background-color: #0b61ff !important;
  border-color: #084bd6 !important;
  box-shadow: 0 1px 0 rgba(0,0,0,0.08) !important;
}

/* Card surfaces: ensure card bg contrasts with text */
.ff-card, .card, .ff-surface {
  background-color: color-mix(in srgb, var(--ff-contrast-bg) 92%, black 8%) !important;
  color: var(--ff-contrast-text) !important;
}

/* Form inputs & placeholders */
input, textarea, select, .ff-input {
  color: var(--ff-contrast-text) !important;
  background-color: color-mix(in srgb, var(--ff-contrast-bg) 96%, black 4%) !important;
  border-color: rgba(11,18,32,0.12) !important;
}

/* Accessibility: make focus rings unmistakable for tests */
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]) :focus-visible,
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]):focus-visible {
  outline: 3px solid rgba(11,97,255,0.95) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(11,97,255,0.18) !important;
  border-radius: 8px !important;
}

/* Keep this block compact and at the end so it's easy to remove later. */
/* === END CONTRAST OVERRIDE === */
'''

def backup(path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_contrast_fix_{ts}")
    bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return bak

def main():
    if not CSS_PATH.exists():
        print("❌ ff.css not found at app/static/css/ff.css")
        sys.exit(1)

    txt = CSS_PATH.read_text(encoding="utf-8")

    if "/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v1 ===" in txt:
        print("✅ Contrast override already present. Exiting.")
        sys.exit(0)

    if MARKER not in txt:
        print("❌ EOF marker not found. Aborting.")
        sys.exit(1)

    bak = backup(CSS_PATH)
    new_txt = txt.replace(MARKER, CONTRAST_CSS + "\n\n" + MARKER)
    CSS_PATH.write_text(new_txt, encoding="utf-8")
    print("✅ Injected contrast override block into app/static/css/ff.css")
    print(f"🗄  Backup created at: {bak}")

if __name__ == "__main__":
    main()
