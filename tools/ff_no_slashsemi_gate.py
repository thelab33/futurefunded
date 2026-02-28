#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import sys

EXTS = {".js", ".ts", ".mjs", ".cjs"}

bad = []
for p in Path(".").rglob("*"):
    if p.suffix not in EXTS:
        continue
    if any(part in {".venv", "node_modules", ".git", "dist", "build"} for part in p.parts):
        continue
    try:
        s = p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        continue
    if "\\;" in s:
        bad.append(p)

if bad:
    print("[no-slashsemi] ❌ Found \\; in files:", file=sys.stderr)
    for f in bad[:200]:
        print(f"  - {f}", file=sys.stderr)
    if len(bad) > 200:
        print(f"  ...and {len(bad) - 200} more", file=sys.stderr)
    raise SystemExit(2)

print("[no-slashsemi] ✅ clean")
