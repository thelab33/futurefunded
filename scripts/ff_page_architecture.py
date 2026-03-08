#!/usr/bin/env python3
"""
FutureFunded Page Architecture Generator

Scans index.html and outputs:

• Section map
• Modal map
• Hook inventory
• Architecture tree
"""

import re
from pathlib import Path

INDEX = Path("app/templates/index.html")

html = INDEX.read_text()

print("\n🚀 FUTUREFUNDED PAGE ARCHITECTURE\n")

# -------------------------
# Sections
# -------------------------

sections = re.findall(
    r'<section[^>]*id="([^"]+)"[^>]*data-ff-section',
    html
)

print("📦 SECTIONS\n")

for s in sections:
    print(f" • {s}")

# -------------------------
# Modals
# -------------------------

modals = re.findall(
    r'<section[^>]*class="[^"]*ff-modal[^"]*"[^>]*id="([^"]+)"',
    html
)

print("\n🪟 MODALS\n")

for m in modals:
    print(f" • {m}")

# -------------------------
# Hooks
# -------------------------

hooks = re.findall(r'data-ff-[a-zA-Z0-9\-]+', html)
hooks = sorted(set(hooks))

print("\n🔗 JS HOOKS\n")

for h in hooks:
    print(f" • {h}")

print("\n✅ Architecture scan complete\n")
