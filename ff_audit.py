
# FutureFunded Dev Audit CLI
# Usage: python ff_audit.py

import re
from pathlib import Path
from collections import Counter

ROOT = Path(".")
HTML = ROOT / "app/templates/index.html"
CSS = ROOT / "app/static/css/ff.css"
JS = ROOT / "app/static/js/ff-app.js"

print("\n🔎 FutureFunded Platform Audit\n")

# -------------------------------------------------
# HTML Audit
# -------------------------------------------------
print("HTML audit")

if not HTML.exists():
    print("❌ index.html missing")
else:
    html = HTML.read_text()

    ids = re.findall(r'id="([^"]+)"', html)
    dupes = [k for k,v in Counter(ids).items() if v>1]

    if dupes:
        print("⚠ duplicate ids:", dupes)
    else:
        print("✓ id uniqueness ok")

    required_hooks = [
        "data-ff-open-checkout",
        "data-ff-close-checkout",
        "data-ff-share",
        "data-ff-theme-toggle"
    ]

    missing = [h for h in required_hooks if h not in html]

    if missing:
        print("⚠ missing hooks:", missing)
    else:
        print("✓ hooks detected")

# -------------------------------------------------
# CSS Audit
# -------------------------------------------------
print("\nCSS audit")

if not CSS.exists():
    print("❌ ff.css missing")
else:
    css = CSS.read_text()

    layers = re.findall(r'@layer', css)
    if len(layers) < 1:
        print("⚠ layer system missing")
    else:
        print("✓ layer system detected")

    if "ff.tokens" in css:
        print("✓ token layer present")
    else:
        print("⚠ token layer missing")

# -------------------------------------------------
# JS Runtime Audit
# -------------------------------------------------
print("\nRuntime audit")

if not JS.exists():
    print("❌ ff-app.js missing")
else:
    js = JS.read_text()

    if "window.FF_APP" in js:
        print("✓ runtime bootstrap detected")
    else:
        print("⚠ FF_APP bootstrap missing")

    if "contractSnapshot" in js:
        print("✓ runtime contract snapshot present")
    else:
        print("⚠ contract snapshot missing")

# -------------------------------------------------
# Accessibility checks
# -------------------------------------------------
print("\nAccessibility audit")

if CSS.exists():
    css = CSS.read_text()

    if ":focus-visible" in css:
        print("✓ focus-visible style present")
    else:
        print("⚠ focus-visible missing")

    if "prefers-reduced-motion" in css:
        print("✓ reduced motion rule present")
    else:
        print("⚠ reduced motion rule missing")

print("\nAudit finished\n")
