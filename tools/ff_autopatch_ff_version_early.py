#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re, shutil, sys

p = Path("app/static/js/ff-app.js")
if not p.exists():
  print("[ff-ver] ❌ missing app/static/js/ff-app.js", file=sys.stderr)
  raise SystemExit(2)

src = p.read_text(encoding="utf-8", errors="replace")

# Extract VERSION string if present
m = re.search(r'\bVERSION\b\s*=\s*["\']([^"\']+)["\']', src)
ver = m.group(1) if m else "0.0.0"

# If we already set FF.version very early, skip
head = src[:2500]
if re.search(r'\bFF\.version\s*=', head) or re.search(r'\bwindow\.ff\.version\s*=', head):
  print("[ff-ver] ok ✅ (already early)")
  raise SystemExit(0)

snippet = f'''
/* [ff-ver] early version guard (autopatch) */
try {{
  if (!window.ff || typeof window.ff !== "object") window.ff = {{}};
  if (!window.ff.version) window.ff.version = "{ver}";
}} catch (_) {{}}
'''

# Insert after the first IIFE "use strict" if possible, else prepend
out = src
pos = out.find('"use strict"')
if pos == -1:
  pos = out.find("'use strict'")
if pos != -1:
  # insert after the strict line end
  nl = out.find("\n", pos)
  if nl != -1:
    out = out[:nl+1] + snippet + out[nl+1:]
  else:
    out = snippet + out
else:
  out = snippet + out

if out != src:
  bak = p.with_suffix(".js.bak_ffver")
  shutil.copyfile(p, bak)
  p.write_text(out, encoding="utf-8")
  print(f"[ff-ver] patched ✅ backup -> {bak}")
else:
  print("[ff-ver] no changes ✅")
