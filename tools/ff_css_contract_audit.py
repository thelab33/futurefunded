
#!/usr/bin/env python3
"""
FutureFunded CSS Contract Auditor — Production Version

Scans:
  index.html
  ff.css
  ff-app.js

Detects:
  unused CSS selectors
  HTML selectors missing CSS
  JS selectors missing CSS
  duplicate selectors
"""

import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(".")
HTML = ROOT / "app/templates/index.html"
CSS = ROOT / "app/static/css/ff.css"
JS = ROOT / "app/static/js/ff-app.js"

def read(p):
    return p.read_text(encoding="utf-8",errors="ignore") if p.exists() else ""

html = read(HTML)
css = read(CSS)
js = read(JS)

print("\nFutureFunded CSS Contract Auditor\n")

# -----------------------------
# Extract CSS selectors safely
# -----------------------------

selector_regex = re.compile(r'(^|})\s*([^{@}]+)\{',re.MULTILINE)

selectors=set()

for match in selector_regex.findall(css):
    block=match[1]
    parts=[p.strip() for p in block.split(",")]

    for p in parts:
        if p.startswith(".") or p.startswith("#") or p.startswith("[") or p.startswith("body") or p.startswith(":"):
            selectors.add(p.split(":")[0])

selector_counts=defaultdict(int)

for s in selectors:
    selector_counts[s]+=1

duplicates=[s for s,c in selector_counts.items() if c>1]

# -----------------------------
# HTML selectors
# -----------------------------

html_classes=set(re.findall(r'class="([^"]+)"',html))
html_ids=set(re.findall(r'id="([^"]+)"',html))

html_class_tokens=set()

for c in html_classes:
    html_class_tokens.update(c.split())

html_selectors={f".{c}" for c in html_class_tokens}
html_selectors.update({f"#{i}" for i in html_ids})

# -----------------------------
# JS selectors
# -----------------------------

js_selectors=set()

js_selectors.update(re.findall(r'querySelector\(["\']([^"\']+)',js))
js_selectors.update(re.findall(r'querySelectorAll\(["\']([^"\']+)',js))

clean_js=set()

for s in js_selectors:
    if s.startswith(".") or s.startswith("#"):
        clean_js.add(s.split(" ")[0])

# -----------------------------
# Contract comparison
# -----------------------------

unused_css=[
s for s in selectors
if s not in html_selectors
and s not in clean_js
]

missing_css_html=[
s for s in html_selectors
if s not in selectors
]

missing_css_js=[
s for s in clean_js
if s not in selectors
]

# -----------------------------
# Report
# -----------------------------

print("Unused CSS selectors")
print("---------------------")

for s in sorted(unused_css)[:40]:
    print(" ",s)

print("\nHTML selectors missing CSS")
print("--------------------------")

for s in sorted(missing_css_html)[:40]:
    print(" ",s)

print("\nJS selectors missing CSS")
print("------------------------")

for s in sorted(missing_css_js)[:40]:
    print(" ",s)

print("\nDuplicate selectors")
print("-------------------")

for s in duplicates[:40]:
    print(" ",s)

print("\nAudit complete.\n")
