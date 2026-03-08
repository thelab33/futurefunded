#!/usr/bin/env python3
"""
FutureFunded CSS Coverage Scanner

Finds all .ff-* classes in index.html
and checks if they exist in ff.css
"""

import re
from pathlib import Path

HTML = Path("app/templates/index.html").read_text()
CSS = Path("app/static/css/ff.css").read_text()

classes = re.findall(r'class="([^"]+)"', HTML)

found = set()
missing = set()

for c in classes:
    for name in c.split():
        if name.startswith("ff-"):
            if name in CSS:
                found.add(name)
            else:
                missing.add(name)

print("\n🎨 CSS COVERAGE REPORT\n")

print("Styled:", len(found))
print("Missing:", len(missing))

print("\n❌ Missing CSS\n")

for m in sorted(missing):
    print(m)
