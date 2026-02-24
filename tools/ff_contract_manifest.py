#!/usr/bin/env python3
"""
FutureFunded — Contract Manifest Generator (hook-safe)
- Scans templates for:
  - ids
  - data-ff-* hooks
  - ff-* classes (optional signal)
  - inline style="..." and onclick= (policy checks)
- Outputs JSON report + optional nonzero exit for CI.

Usage:
  python tools/ff_contract_manifest.py app/templates --out app/static/contracts/ff_manifest.json
  python tools/ff_contract_manifest.py app/templates --fail-on-inline
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

RE_ID = re.compile(r'\bid\s*=\s*"([^"]+)"')
RE_DATA_FF = re.compile(r'\b(data-ff-[a-z0-9\-_]+)\b', re.IGNORECASE)
RE_CLASS = re.compile(r'\bclass\s*=\s*"([^"]+)"')
RE_INLINE_STYLE = re.compile(r'\bstyle\s*=\s*"[^"]*"', re.IGNORECASE)
RE_ONCLICK = re.compile(r'\bonclick\s*=', re.IGNORECASE)

def scan_file(path: Path) -> Dict:
    text = path.read_text(encoding="utf-8", errors="replace")

    ids = RE_ID.findall(text)
    data_ff = RE_DATA_FF.findall(text)

    ff_classes: List[str] = []
    for m in RE_CLASS.finditer(text):
        classes = m.group(1).split()
        ff_classes.extend([c for c in classes if c.startswith("ff-")])

    inline_style_hits = len(RE_INLINE_STYLE.findall(text))
    onclick_hits = len(RE_ONCLICK.findall(text))

    return {
        "file": str(path),
        "counts": {
            "ids": len(ids),
            "data_ff": len(data_ff),
            "ff_classes": len(ff_classes),
            "inline_style": inline_style_hits,
            "onclick": onclick_hits,
        },
        "ids": ids,
        "data_ff": data_ff,
        "ff_classes": sorted(set(ff_classes)),
    }

def aggregate(reports: List[Dict]) -> Dict:
    id_index: Dict[str, List[str]] = {}
    hook_index: Dict[str, List[str]] = {}

    total_inline = 0
    total_onclick = 0

    for r in reports:
        f = r["file"]
        total_inline += r["counts"]["inline_style"]
        total_onclick += r["counts"]["onclick"]

        for _id in r["ids"]:
            id_index.setdefault(_id, []).append(f)

        for h in r["data_ff"]:
            hook_index.setdefault(h, []).append(f)

    def dupes(index: Dict[str, List[str]]) -> Dict[str, List[str]]:
        return {k: v for k, v in index.items() if len(set(v)) > 1}

    return {
        "summary": {
            "files_scanned": len(reports),
            "unique_ids": len(id_index),
            "unique_data_ff": len(hook_index),
            "total_inline_style_hits": total_inline,
            "total_onclick_hits": total_onclick,
        },
        "dupes": {
            # Note: duplicates across files are fine; this flags “defined in multiple templates”
            # You can tighten this later to only validate the active index include tree.
            "ids_in_multiple_files": dupes(id_index),
            "hooks_in_multiple_files": dupes(hook_index),
        },
        "index": {
            "ids": {k: sorted(set(v)) for k, v in id_index.items()},
            "data_ff": {k: sorted(set(v)) for k, v in hook_index.items()},
        },
        "files": reports,
    }

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", help="Template root, e.g. app/templates")
    ap.add_argument("--out", default="", help="Write JSON report to this file")
    ap.add_argument("--fail-on-inline", action="store_true", help="Exit nonzero if any style/onclick found")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        raise SystemExit(f"Root not found: {root}")

    exts = {".html", ".jinja", ".j2"}
    files = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in exts]

    reports = [scan_file(p) for p in sorted(files)]
    out = aggregate(reports)

    payload = json.dumps(out, indent=2, sort_keys=True)
    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload, encoding="utf-8")
        print(f"✅ Wrote manifest: {out_path}")
    else:
        print(payload)

    if args.fail_on_inline:
        if out["summary"]["total_inline_style_hits"] > 0 or out["summary"]["total_onclick_hits"] > 0:
            print("❌ Inline style/onclick detected (fail-on-inline enabled).")
            return 2

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
