#!/usr/bin/env python3
# tools/ff_patch_contrast_fix_v5.py
"""
PLAYWRIGHT CONTRAST FIX v5
- Sets both canonical tokens (--ff-text, --ff-muted, --ff-link, --ff-surface)
  AND the earlier used contrast tokens (--ff-contrast-text, --ff-contrast-muted).
- Forces micro-copy and overlays to accessible colors and adds image overlay backings.
- Idempotent: removes prior v1-v4 named override blocks then injects v5 before EOF marker.
- Creates timestamped backup.
"""
from pathlib import Path
from datetime import datetime
import re, sys

CSS_PATH = Path("app/static/css/ff.css")
MARKER = "/* EOF: app/static/css/ff.css */"
IDENT = "/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v5 ==="

V5_CSS = r'''
/* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v5 ===
   Test-only, surgical:
   - Populate canonical tokens + legacy contrast tokens (both light & dark)
   - Force micro-copy, captions, badges, chips, legend, and overlays to accessible colors
   - Add backing pseudo-elements for common image-overlay containers
   Remove when tokens & surfaces are permanently fixed.
==================================================== */

/* Canonical tokens (light) and legacy contrast tokens */
.ff-root {
  --ff-text: #0b1220 !important;
  --ff-muted: #55606a !important;
  --ff-link: #0b61ff !important;
  --ff-surface: #ffffff !important;

  --ff-contrast-text: #0b1220 !important;
  --ff-contrast-muted: #55606a !important;
  --ff-contrast-accent: #0b61ff !important;
  --ff-contrast-bg: #fff !important;
}

/* Dark theme tokens */
.ff-root[data-theme="dark"] {
  --ff-text: #e6eef6 !important;
  --ff-muted: #aab7c6 !important;
  --ff-link: #7fb1ff !important;
  --ff-surface: #071018 !important;

  --ff-contrast-text: #e6eef6 !important;
  --ff-contrast-muted: #aab7c6 !important;
  --ff-contrast-accent: #7fb1ff !important;
  --ff-contrast-bg: #071018 !important;
}

/* Ground the body and root so many selectors inherit correct color */
.ff-body, .ff-root, body, .ff-page, .ff-container {
  color: var(--ff-text) !important;
  background-color: var(--ff-surface) !important;
}

/* Micro copy / captions / help text — explicit, heavy weight */
.ff-help, .ff-muted, .ff-kicker, .ff-caption, .ff-footnote,
small, .small, .ff-stat small, .ff-stat .label, .ff-legal, .ff-hint,
footer .small, .ff-footer .small {
  color: var(--ff-text) !important;
  opacity: 1 !important;
  font-weight: 600 !important;
  text-shadow: none !important;
}

/* Links & interactive */
a, a:link, a:visited, .ff-link {
  color: var(--ff-link) !important;
  text-decoration: underline !important;
  text-underline-offset: 3px;
}

/* Buttons / chips / badges */
.ff-btn, .ff-button, .btn, button, .ff-button--primary,
.ff-chip, .ff-badge, .ff-pill, .chip, .badge {
  color: #fff !important;
  background-color: var(--ff-link) !important;
  border-color: rgba(8,75,214,0.92) !important;
  box-shadow: none !important;
}

/* Inputs, labels, placeholders */
label, .ff-label, .form-label { color: var(--ff-text) !important; font-weight:600 !important; }
input, textarea, select, .ff-input, .form-control {
  color: var(--ff-text) !important;
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
::placeholder { color: var(--ff-muted) !important; opacity: 1 !important; }

/* Overlays / modals: opaque surfaces */
.ff-overlay, .ff-modal, .ff-drawer, .ff-dialog, .ff-checkout, .ff-backdrop {
  background-color: var(--ff-surface) !important;
  color: var(--ff-text) !important;
}

/* Text-on-image / hero / card overlays: add strong backing if needed */
.ff-hero .ff-hero-body,
.ff-hero__overlay,
.card--image .ff-card-body,
.ff-card--on-image .ff-card-body,
.ff-team__overlay,
.ff-sponsor-card__overlay,
.ff-player__overlay,
.ff-story .ff-overlay,
.ff-media-wrap .caption,
.ff-jumbotron .overlay,
.ff-hero__content {
  position: relative !important;
  z-index: 1 !important;
  color: #fff !important;
}

/* Backing pseudo for all above (near-opaque black on top of images) */
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
.ff-hero .ff-hero-body > *, .ff-hero__overlay > *, .card--image .ff-card-body > *, .ff-card--on-image .ff-card-body > * {
  position: relative !important;
  z-index: 2 !important;
}

/* Very visible focus rings for keyboard & tests */
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]) :focus-visible,
:where(a, button, input, textarea, select, summary, [role="button"], [tabindex]):focus-visible {
  outline: 3px solid rgba(11,97,255,0.95) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(11,97,255,0.18) !important;
  border-radius: 8px !important;
}

/* === END CONTRAST OVERRIDE v5 === */
'''

def remove_old_overrides(txt: str) -> str:
    # remove any earlier override v1-v4 by searching for the standard header lines
    txt = re.sub(r'/\* === CONTRAST OVERRIDE: PLAYWRIGHT FIX [\sv0-9a-zA-Z-]* ===[\s\S]*?=== END CONTRAST OVERRIDE === \*/', '', txt)
    txt = re.sub(r'/\* === CONTRAST OVERRIDE: PLAYWRIGHT FIX v[0-9] ===[\s\S]*?=== END CONTRAST OVERRIDE === \*/', '', txt)
    # also strip our grep-friendly END marker if present
    txt = txt.replace('/* === END CONTRAST OVERRIDE === */','')
    return txt

def backup(path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_contrast_fix_v5_{ts}")
    bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return bak

def main():
    if not CSS_PATH.exists():
        print("❌ ff.css not found")
        sys.exit(1)
    s = CSS_PATH.read_text(encoding="utf-8")
    s_clean = remove_old_overrides(s)
    if IDENT in s_clean:
        print("✅ v5 already present. Exiting.")
        return
    if MARKER not in s_clean:
        print("❌ EOF marker not found. Aborting.")
        sys.exit(1)
    bak = backup(CSS_PATH)
    new = s_clean.replace(MARKER, V5_CSS + "\n\n" + MARKER)
    CSS_PATH.write_text(new, encoding="utf-8")
    print("✅ Injected PLAYWRIGHT FIX v5 override into app/static/css/ff.css")
    print("🗄 Backup created at:", str(bak))

if __name__ == '__main__':
    main()
