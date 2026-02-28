#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re, shutil, sys
from datetime import datetime

p = Path("app/static/js/ff-app.js")
if not p.exists():
    print("[cleanup] ❌ missing ff-app.js", file=sys.stderr)
    raise SystemExit(2)

src = p.read_text(encoding="utf-8", errors="replace")
orig = src

# Remove the [ff-ver] block if present (keep your ENSURE_WINDOW_FF_EARLY v1 as canonical)
src = re.sub(
    r"\n*/\*\s*\[ff-ver\][\s\S]*?\*/\s*\ntry\s*\{[\s\S]*?\}\s*catch\s*\([\s\S]*?\)\s*\{\s*\}\s*\n",
    "\n",
    src,
    flags=re.I,
)

# Also remove any extra "if (!window.ff.version) window.ff.version = "0.0.0";" lines you saw earlier (best effort)
src = re.sub(r"\n\s*if\s*\(\s*!window\.ff\.version\s*\)\s*window\.ff\.version\s*=\s*\"0\.0\.0\";\s*", "\n", src)

# Collapse accidental triple newlines (keep it tidy)
src = re.sub(r"\n{3,}", "\n\n", src)

if src != orig:
    bak = p.with_suffix(f".js.bak_cleanup_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    shutil.copyfile(p, bak)
    p.write_text(src, encoding="utf-8")
    print(f"[cleanup] ✅ patched {p} (backup -> {bak})")
else:
    print("[cleanup] ✅ no changes needed")

