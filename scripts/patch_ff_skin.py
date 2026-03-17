#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
from textwrap import dedent

p = Path("app/static/css/ff.css")
if not p.exists():
    raise SystemExit(f"Error: {p} not found. Run this from the repo root or correct the path.")

src = p.read_text(encoding="utf-8")
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = p.with_name(f"{p.name}.bak-{stamp}")
backup.write_text(src, encoding="utf-8")

marker = "/* FF_SKIN_THEME_SIGNAL_GLASS_V1 */"
# (Paste the same 'patch' CSS body here — identical to the one you used)
patch = dedent("""\
/* FF_SKIN_THEME_SIGNAL_GLASS_V1 */
...your css...
""").strip()

if marker not in src:
    src = src.rstrip() + "\n\n" + patch + "\n"
    p.write_text(src, encoding="utf-8")
    print(f"Patched: {p}")
    print(f"Backup : {backup}")
    print("Changes: appended FF_SKIN_THEME_SIGNAL_GLASS_V1")
else:
    print("Marker already present. No changes made.")
    print(f"Backup : {backup}")
