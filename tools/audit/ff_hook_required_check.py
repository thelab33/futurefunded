#!/usr/bin/env python3
"""
ff_hook_required_check.py — deterministic hook presence checker

Usage:
  python tools/ff_hook_required_check.py --required <path> --js <path>

- Reads required hooks from a text file (one per line).
- Ignores blank lines and lines starting with '#'.
- Verifies each hook string is present in the JS file content.
- Exit 0 if all present, else exit 2.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def read_required(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"Required hooks file not found: {path}")
    items: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        items.append(s)
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--required", required=True, help="Path to required hooks list (txt)")
    ap.add_argument("--js", required=True, help="Path to JS file to scan")
    args = ap.parse_args()

    req_path = Path(args.required)
    js_path = Path(args.js)

    try:
        required = read_required(req_path)
    except Exception as e:
        print(f"[ff-required] ❌ {e}", file=sys.stderr)
        return 2

    if not js_path.exists():
        print(f"[ff-required] ❌ JS file not found: {js_path}", file=sys.stderr)
        return 2

    hay = js_path.read_text(encoding="utf-8", errors="replace")

    missing = [h for h in required if h not in hay]

    if missing:
        print(f"[ff-required] ❌ Missing {len(missing)} required hook(s) in {js_path}:", file=sys.stderr)
        for h in missing[:100]:
            print(f"  - {h}", file=sys.stderr)
        if len(missing) > 100:
            print(f"  ...and {len(missing) - 100} more", file=sys.stderr)
        return 2

    print("[ff-required] ✅ Required hooks present in JS.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
