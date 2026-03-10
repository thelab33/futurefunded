
#!/usr/bin/env python3
"""
FutureFunded Launch QA Gate
Runs a final structural audit before production launch.
"""

import re
from pathlib import Path

ROOT = Path("app")
HTML = list(ROOT.rglob("*.html"))
CSS = list(ROOT.rglob("*.css"))
JS = list(ROOT.rglob("*.js"))

def read_all(paths):
    out = ""
    for p in paths:
        try:
            out += p.read_text(encoding="utf-8") + "\n"
        except:
            pass
    return out

html = read_all(HTML)
css = read_all(CSS)
js = read_all(JS)

print("\n🚀 FutureFunded Launch QA Gate\n")

# -------------------------
# Duplicate ID audit
# -------------------------
ids = re.findall(r'id="([^"]+)"', html)
dupes = {i for i in ids if ids.count(i) > 1}

if dupes:
    print("❌ Duplicate IDs detected:")
    for d in sorted(dupes):
        print("   ", d)
else:
    print("✅ No duplicate IDs")

# -------------------------
# Skip link check
# -------------------------
skip_links = re.findall(r'href="#([^"]+)"', html)
missing_targets = []

for link in skip_links:
    if f'id="{link}"' not in html:
        missing_targets.append(link)

if missing_targets:
    print("❌ Skip links without targets:")
    for m in missing_targets:
        print("   ", m)
else:
    print("✅ Skip link targets OK")

# -------------------------
# Overlay hooks
# -------------------------
overlay_hooks = [
    "data-open",
    "aria-hidden",
    "ff-sheet",
    "ff-modal",
]

missing = [h for h in overlay_hooks if h not in html]

if missing:
    print("⚠️ Possible overlay hook gaps:", missing)
else:
    print("✅ Overlay hook structure OK")

# -------------------------
# Selector sanity check
# -------------------------
selectors = re.findall(r'\.([a-zA-Z0-9_-]+)', css)
unused = []

for s in selectors:
    if s not in html and s not in js:
        unused.append(s)

unused = sorted(set(unused))

if len(unused) > 30:
    print("⚠️ Large number of unused CSS selectors")
else:
    print("✅ CSS selector usage looks sane")

# -------------------------
# Checkout contract
# -------------------------
checkout_hooks = [
    "donationForm",
    "ff-checkout",
    "data-ff-amount",
]

missing_checkout = [c for c in checkout_hooks if c not in html]

if missing_checkout:
    print("❌ Checkout hooks missing:", missing_checkout)
else:
    print("✅ Checkout contract OK")

# -------------------------
# Credibility layer check
# -------------------------
cred = [
    "ff-trustStrip",
    "ff-deadlinePill",
    "ffDonationSchema",
]

missing_cred = [c for c in cred if c not in html and c not in js]

if missing_cred:
    print("⚠️ Credibility elements missing:", missing_cred)
else:
    print("✅ Credibility layer present")

print("\n🏁 QA Gate complete\n")
