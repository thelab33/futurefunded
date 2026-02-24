#!/usr/bin/env python3
"""
FutureFunded — Contract Diff
- Compares two contract snapshots
- Fails if IDs/data-ff/selector hooks disappear
"""

from __future__ import annotations
import json
import sys
from pathlib import Path
from typing import Dict, Any, Set

def load(p: Path) -> Dict[str, Any]:
    return json.loads(p.read_text(encoding="utf-8"))

def as_set(x) -> Set[str]:
    return set(x or [])

def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: ff_contract_diff.py <baseline.json> <candidate.json>")
        return 2

    base_path = Path(sys.argv[1])
    cand_path = Path(sys.argv[2])

    if not base_path.exists():
        print(f"❌ Baseline not found: {base_path}")
        return 2
    if not cand_path.exists():
        print(f"❌ Candidate not found: {cand_path}")
        return 2

    base = load(base_path)
    cand = load(cand_path)

    base_ids = as_set(base.get("ids"))
    cand_ids = as_set(cand.get("ids"))

    base_ff = as_set(base.get("data_ff_attrs"))
    cand_ff = as_set(cand.get("data_ff_attrs"))

    base_hooks = (base.get("ffSelectors", {}) or {}).get("hooks", {}) or {}
    cand_hooks = (cand.get("ffSelectors", {}) or {}).get("hooks", {}) or {}

    missing_ids = sorted(base_ids - cand_ids)
    missing_ff  = sorted(base_ff - cand_ff)
    missing_hook_keys = sorted(set(base_hooks.keys()) - set(cand_hooks.keys()))

    singleton_problems = []
    for k in ("ffConfig_count", "ffSelectors_count"):
        got = (cand.get("singletons", {}) or {}).get(k)
        if got != 1:
            singleton_problems.append((k, got))

    ok = True

    if singleton_problems:
        ok = False
        print("❌ Singleton violations:")
        for k, v in singleton_problems:
            print(f"  - {k} should be 1, got {v}")

    if missing_ids:
        ok = False
        print(f"❌ Missing IDs ({len(missing_ids)}):")
        for x in missing_ids[:120]:
            print(f"  - {x}")
        if len(missing_ids) > 120:
            print("  ...")

    if missing_ff:
        ok = False
        print(f"❌ Missing data-ff-* attributes ({len(missing_ff)}):")
        for x in missing_ff[:160]:
            print(f"  - {x}")
        if len(missing_ff) > 160:
            print("  ...")

    if missing_hook_keys:
        ok = False
        print(f"❌ Missing ffSelectors hook keys ({len(missing_hook_keys)}):")
        for k in missing_hook_keys:
            print(f"  - {k}")

    if ok:
        print("✅ Contract diff PASSED. Candidate preserves baseline hooks.")
        return 0

    print("\nFix by re-adding the missing hook/ID/attr (or adding a compat alias).")
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
