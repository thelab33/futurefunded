#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(".")
PATTERNS = {
    "python_config": re.compile(r"(APP_VERSION|VERSION|BUILD|ASSET|flagship-v)", re.I),
    "jinja_meta": re.compile(r"(ff-version|ff:version|version\"|buildId\"|assetV\")"),
    "ffconfig": re.compile(r"id=\"ffConfig\""),
    "asset_cache": re.compile(r"\?v=|flagship-v"),
}

def scan(path: Path):
    try:
        text = path.read_text(errors="ignore")
    except Exception:
        return []

    hits = []
    for name, pattern in PATTERNS.items():
        for m in pattern.finditer(text):
            hits.append((name, m.group(0)))
    return hits

results = {}

for file in ROOT.rglob("*"):
    if file.is_file() and file.suffix in {".py", ".html", ".jinja", ".js", ".css"}:
        hits = scan(file)
        if hits:
            results[file] = hits

print("\n============================================================")
print(" FutureFunded — Version Audit Report")
print("============================================================\n")

for file, hits in results.items():
    print(f"{file}")
    for kind, value in hits:
        print(f"  - [{kind}] {value}")
    print()

if not results:
    print("✓ No version-related references found.")
