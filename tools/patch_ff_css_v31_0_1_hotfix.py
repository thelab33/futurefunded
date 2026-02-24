#!/usr/bin/env python3
"""
FutureFunded — ff.css hotfix patch (v31.0.1 -> v31.0.1+hotfix)
File: tools/patch_ff_css_v31_0_1_hotfix.py

Fixes silent token typos that invalidate declarations:
- --ff-r-999  -> --ff-r-pill
- --ff-s-2    -> --ff-2
- --ff-r-12   -> --ff-r-2
- --ff-r-16   -> --ff-r-3
"""

from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path

REPL = [
    ("var(--ff-r-999)", "var(--ff-r-pill)"),
    ("var(--ff-s-2)", "var(--ff-2)"),
    ("var(--ff-r-12)", "var(--ff-r-2)"),
    ("var(--ff-r-16)", "var(--ff-r-3)"),
]

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default="app/static/css/ff.css")
    args = ap.parse_args()

    p = Path(args.path)
    if not p.exists():
        raise SystemExit(f"[ff-css-hotfix] ❌ file not found: {p}")

    s = p.read_text(encoding="utf-8", errors="replace")
    orig = s

    for a, b in REPL:
        s = s.replace(a, b)

    if s == orig:
        print("[ff-css-hotfix] ✅ No changes needed.")
        return 0

    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = p.with_suffix(p.suffix + f".bak.{ts}")
    bak.write_text(orig, encoding="utf-8")
    p.write_text(s, encoding="utf-8")

    print(f"[ff-css-hotfix] 🧯 patched: {p}")
    print(f"[ff-css-hotfix] 🗄️  backup:  {bak}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
