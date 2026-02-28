#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from datetime import datetime
import shutil, sys

p = Path("tests/ff_uiux_pro_gate.spec.ts")
if not p.exists():
    print("[uiux-async] ❌ missing tests/ff_uiux_pro_gate.spec.ts", file=sys.stderr)
    raise SystemExit(2)

lines = p.read_text(encoding="utf-8", errors="replace").splitlines(True)
orig = "".join(lines)

# Find the function start
start = None
for i, ln in enumerate(lines):
    if "function expectFocusVisibleBasics" in ln:
        start = i
        break

if start is None:
    print("[uiux-async] ❌ could not find expectFocusVisibleBasics()", file=sys.stderr)
    raise SystemExit(2)

# Find first page.evaluate(() => { within ~250 lines
eval_line = None
for j in range(start, min(len(lines), start + 260)):
    if "page.evaluate(() =>" in lines[j] and "{" in lines[j]:
        eval_line = j
        break

if eval_line is None:
    print("[uiux-async] ❌ could not find page.evaluate(() => { inside expectFocusVisibleBasics()", file=sys.stderr)
    raise SystemExit(2)

MARK = "/* [ff-uiux] define async identifier */"
# If already inserted, no-op
window = "".join(lines[eval_line: min(len(lines), eval_line + 8)])
if MARK in window or "const async =" in window:
    print("[uiux-async] ✅ already patched (marker/const present)")
    raise SystemExit(0)

indent = ""
# reuse indentation from next line if possible
if eval_line + 1 < len(lines):
    nxt = lines[eval_line + 1]
    indent = nxt[:len(nxt) - len(nxt.lstrip(" "))]

insert = f"{indent}const async = false; {MARK}\n"
lines.insert(eval_line + 1, insert)

out = "".join(lines)
if out != orig:
    bak = p.with_suffix(f".spec.ts.bak_asyncident_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    shutil.copyfile(p, bak)
    p.write_text(out, encoding="utf-8")
    print(f"[uiux-async] ✅ patched {p}")
    print(f"[uiux-async] 🧷 backup -> {bak}")
else:
    print("[uiux-async] ✅ no changes needed")

