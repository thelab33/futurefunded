#!/usr/bin/env python3
import re
import sys
from pathlib import Path

REPO = Path(".").resolve()

tpl_candidates = [
    REPO / "app" / "templates" / "index.html",
    REPO / "templates" / "index.html",
    REPO / "index.html",
]

tpl = next((p for p in tpl_candidates if p.exists()), None)
if not tpl:
    raise SystemExit("Could not find index.html template in app/templates/, templates/, or repo root.")

text = tpl.read_text(encoding="utf-8", errors="ignore")

pat = re.compile(r"url_for\(\s*['\"]static['\"]\s*,\s*filename\s*=\s*['\"]([^'\"]+)['\"]", re.I)
paths = sorted(set(pat.findall(text)))

static_root = REPO / "app" / "static"
missing, present = [], []

for rel in paths:
    f = static_root / rel
    (present if f.exists() else missing).append((rel, str(f)))

print("\n=== Static references found in template ===")
print(f"Template: {tpl}")
print(f"Count: {len(paths)}")

print("\n=== MISSING files (these cause 404) ===")
if not missing:
    print("  (none)")
else:
    for rel, full in missing:
        print(f"  - {rel}  (expected at {full})")

print("\n=== PRESENT files ===")
for rel, full in present:
    print(f"  - {rel}")

sys.exit(1 if missing else 0)
