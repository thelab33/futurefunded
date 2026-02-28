#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from datetime import datetime
import re, shutil, sys

p = Path("tests/ff_uiux_pro_gate.spec.ts")
if not p.exists():
    print("[pw-async] ❌ missing tests/ff_uiux_pro_gate.spec.ts", file=sys.stderr)
    raise SystemExit(2)

src = p.read_text(encoding="utf-8", errors="replace")
orig = src

# Normalize accidental "async async function"
src = re.sub(r"\basync\s+async\s+function\b", "async function", src)

needle = "await page.request.get"
if needle not in src:
    print("[pw-async] ✅ no await page.request.get found (nothing to patch)")
    if src != orig:
        bak = p.with_suffix(f".ts.bak_async_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
        shutil.copyfile(p, bak)
        p.write_text(src, encoding="utf-8")
        print(f"[pw-async] ✅ normalized double-async (backup -> {bak})")
    raise SystemExit(0)

# Patch ONLY "function name(...)" not already async, within a window before the await
pat = r"(?s)(^|\n)(\s*)(function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{.{0,1200}?)(\bawait\s+page\.request\.get\b)"
def repl(m: re.Match) -> str:
    prefix_nl = m.group(1)
    indent = m.group(2)
    head = m.group(3)
    await_tok = m.group(4)

    # If the function is already async, do nothing
    if head.lstrip().startswith("async function"):
        return m.group(0)

    # Replace only the first "function" token in that head (after indentation/newline)
    head2 = re.sub(r"\bfunction\b", "async function", head, count=1)
    return prefix_nl + indent + head2 + await_tok

src2 = re.sub(pat, repl, src)
src2 = re.sub(r"\basync\s+async\s+function\b", "async function", src2)

if src2 != orig:
    bak = p.with_suffix(f".ts.bak_async_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    shutil.copyfile(p, bak)
    p.write_text(src2, encoding="utf-8")
    print(f"[pw-async] ✅ patched {p} (backup -> {bak})")
else:
    print("[pw-async] ✅ no changes needed")

