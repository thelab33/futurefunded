#!/usr/bin/env python3
"""
FutureFunded — Fix config import/export drift (v2)

Fixes:
- ImportError: cannot import name 'BaseConfig' from 'app.config.config'
- ImportError: cannot import name 'Config' from 'app.config.config'
- app.config package failing to import -> breaks app.config.ProductionConfig import_string()

What it does:
1) app/config/config.py
   - Appends a safe compatibility export block:
       - guarantees BaseConfig exists (infers from DevelopmentConfig/ProductionConfig MRO)
       - guarantees Config exists (aliases to BaseConfig)
   - Idempotent via marker

2) app/config/__init__.py
   - Makes exports resilient (try BaseConfig, else Config)

Usage:
  python3 tools/ff_fix_config_imports.py --dry-run
  python3 tools/ff_fix_config_imports.py --write --backup

Verify:
  python3 -c "from app.config import BaseConfig, DevelopmentConfig, ProductionConfig; print('OK', BaseConfig, DevelopmentConfig, ProductionConfig)"
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple


MARKER_CFG = "FF_PROD_PATCH_V2: export BaseConfig + Config compatibility"
MARKER_INIT = "FF_PROD_PATCH_V2: resilient exports"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def find_repo_root(start: Path) -> Optional[Path]:
    cur = start.resolve()
    for _ in range(12):
        if (cur / "app" / "__init__.py").exists():
            return cur
        cur = cur.parent
    return None


def backup_file(p: Path, backup_dir: Path) -> None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    dst = backup_dir / f"{p.name}.{utc_stamp()}.bak"
    shutil.copy2(p, dst)


def patch_config_py(s: str) -> Tuple[str, bool, str]:
    """
    Always append a compatibility export block (idempotent via marker).
    This block is runtime-safe:
      - If BaseConfig exists, it won't override.
      - If not, it tries to infer base from DevelopmentConfig/ProductionConfig MRO.
      - Also guarantees Config exists as alias.
    """
    if MARKER_CFG in s:
        return s, False, "app/config/config.py already patched"

    compat = f"""
# {MARKER_CFG}
# Some parts of FutureFunded (and import paths like app.config.BaseConfig)
# expect BaseConfig (and sometimes Config) to exist in this module.
# This block guarantees those names are exported without changing your class design.
try:
    BaseConfig  # type: ignore[name-defined]
except NameError:
    _base = None

    # Prefer any obvious base class names if present
    for _n in ("Config", "ConfigBase", "Base", "AppConfig", "Settings"):
        _v = globals().get(_n)
        if isinstance(_v, type):
            _base = _v
            break

    # Infer from env configs if possible
    if _base is None:
        _dev = globals().get("DevelopmentConfig")
        if isinstance(_dev, type) and getattr(_dev, "__mro__", None) and len(_dev.__mro__) > 1:
            _base = _dev.__mro__[1]

    if _base is None:
        _prod = globals().get("ProductionConfig")
        if isinstance(_prod, type) and getattr(_prod, "__mro__", None) and len(_prod.__mro__) > 1:
            _base = _prod.__mro__[1]

    if _base is None:
        _base = object

    BaseConfig = _base  # type: ignore[assignment]

try:
    Config  # type: ignore[name-defined]
except NameError:
    Config = BaseConfig  # type: ignore[assignment]
"""

    return s.rstrip() + compat + "\n", True, "Appended BaseConfig/Config compatibility export block"


def patch_config_init_py(s: str) -> Tuple[str, bool, str]:
    """
    Ensure app/config/__init__.py can always export BaseConfig:
      try: from .config import BaseConfig
      except: from .config import Config as BaseConfig
    Then import the rest.
    """
    if MARKER_INIT in s:
        return s, False, "app/config/__init__.py already patched"

    # Find tuple import from .config import ( ... )
    m = re.search(r"(?ms)^\s*from\s+\.config\s+import\s*\(\s*(.*?)\s*\)\s*", s)
    if not m:
        # If it’s not tuple style, patch only if it imports BaseConfig directly.
        if "from .config import BaseConfig" in s:
            repl = (
                f"# {MARKER_INIT}\n"
                "try:\n"
                "    from .config import BaseConfig\n"
                "except ImportError:\n"
                "    from .config import Config as BaseConfig  # type: ignore\n"
            )
            s2 = s.replace("from .config import BaseConfig", repl)
            return s2, True, "Wrapped BaseConfig import in try/except"
        return s, False, "No tuple import found; no change"

    inner = m.group(1)
    names = []
    for part in inner.split(","):
        nm = part.strip()
        if not nm:
            continue
        if "#" in nm:
            nm = nm.split("#", 1)[0].strip()
        if nm:
            names.append(nm)

    others = [n for n in names if n != "BaseConfig"]
    if not others:
        return s, False, "WARN: could not parse other config exports"

    block = (
        f"# {MARKER_INIT}\n"
        "try:\n"
        "    from .config import BaseConfig\n"
        "except ImportError:\n"
        "    from .config import Config as BaseConfig  # type: ignore\n"
        f"from .config import {', '.join(others)}\n"
    )

    start, end = m.span()
    return s[:start] + block + s[end:], True, "Rewrote tuple import block to be resilient"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="", help="Repo root (auto-detect if omitted)")
    ap.add_argument("--dry-run", action="store_true", help="Show what would change (default if --write not set)")
    ap.add_argument("--write", action="store_true", help="Write changes")
    ap.add_argument("--backup", action="store_true", help="Backup modified files to tools/.artifacts/backups/")
    args = ap.parse_args()

    here = Path(__file__).resolve()
    root = Path(args.root).resolve() if args.root else find_repo_root(here.parent)
    if not root:
        print("FAIL: Could not detect repo root. Pass --root /path/to/repo", file=sys.stderr)
        return 2

    dry = bool(args.dry_run or (not args.write))
    backup = bool(args.backup)
    backup_dir = root / "tools" / ".artifacts" / "backups"

    cfg_py = root / "app" / "config" / "config.py"
    init_py = root / "app" / "config" / "__init__.py"

    print(f"OK: Root: {root}")
    print(f"OK: Mode: {'DRY-RUN' if dry else 'WRITE'}")
    print(f"OK: Backups: {'ON' if backup else 'OFF'}\n")

    changed = []

    if cfg_py.exists():
        before = read_text(cfg_py)
        after, did, msg = patch_config_py(before)
        print(f"config.py: {msg}")
        if did:
            changed.append("app/config/config.py")
            if not dry:
                if backup:
                    backup_file(cfg_py, backup_dir)
                write_text(cfg_py, after)
    else:
        print("WARN: app/config/config.py missing")

    if init_py.exists():
        before = read_text(init_py)
        after, did, msg = patch_config_init_py(before)
        print(f"__init__.py: {msg}")
        if did:
            changed.append("app/config/__init__.py")
            if not dry:
                if backup:
                    backup_file(init_py, backup_dir)
                write_text(init_py, after)
    else:
        print("WARN: app/config/__init__.py missing")

    print("\n== Summary ==")
    print(f"Changed: {len(changed)}")
    for p in changed:
        print(f"  ✅ {p}")

    print("\n== Verify ==")
    print("python3 -c \"from app.config import BaseConfig, DevelopmentConfig, ProductionConfig; print('OK', BaseConfig, DevelopmentConfig, ProductionConfig)\"")
    print("")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

