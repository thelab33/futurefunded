#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt
from pathlib import Path
import shutil
import sys

TARGET = Path("tests/ff_checkout_ux_v2.spec.ts")

CONTENT = r"""<PASTE THE TS FILE CONTENT FROM ABOVE HERE EXACTLY>"""

def main() -> int:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists():
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = TARGET.with_suffix(TARGET.suffix + f".bak.{stamp}")
        shutil.copy2(TARGET, backup)
        print(f"[install] 🧷 Backup: {backup}")
    TARGET.write_text(CONTENT, encoding="utf-8")
    print(f"[install] ✅ Wrote: {TARGET}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
