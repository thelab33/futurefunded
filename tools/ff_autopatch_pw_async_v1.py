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

# If already fixed, exit
if "await page.request.get" not in src:
    print("[pw-async] ✅ no await page.request.get found (nothing to patch)")
    raise SystemExit(0)

# Make any `function name(` that contains `await page.request.get` become `async function name(`
def patch_function_block(s: str) -> str:
    # Find a function declaration that precedes the await in the next ~600 chars
    pat = r"(function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{[\s\S]{0,800}?)(\bawait\s+page\.request\.get\b)"
    def repl(m: re.Match) -> str:
        head = m.group(1)
        if head.startswith("async function"):
            return m.group(0)
        # replace first "function" with "async function" inside head
        head2 = re.sub(r"^function", "async function", head, count=1)
        return head2 + m.group(2)
    return re.sub(pat, repl, s)

src = patch_function_block(src)

if src != orig:
    bak = p.with_suffix(f".ts.bak_async_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    shutil.copyfile(p, bak)
    p.write_text(src, encoding="utf-8")
    print(f"[pw-async] ✅ patched {p} (backup -> {bak})")
else:
    print("[pw-async] ⚠️ no changes applied (may be arrow function case)")

