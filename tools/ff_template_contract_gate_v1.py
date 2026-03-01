from __future__ import annotations

import argparse
import re
from pathlib import Path

APP_DIR = Path("app")
TEMPLATES_DIR = APP_DIR / "templates"

RENDER_RE = re.compile(r'render_template\(\s*([\'"])(?P<tpl>[^\'"]+)\1', re.M)

def main() -> int:
    ap = argparse.ArgumentParser(description="Fail if Python references missing templates (v1)")
    ap.add_argument("--allow", nargs="*", default=[], help="Template names allowed to be missing")
    args = ap.parse_args()

    if not TEMPLATES_DIR.exists():
        raise SystemExit(f"[ff-tpl-gate] missing templates dir: {TEMPLATES_DIR}")

    allow = {a.strip().lstrip("/") for a in args.allow if a.strip()}
    missing = []

    for py in APP_DIR.rglob("*.py"):
        try:
            s = py.read_text(encoding="utf-8")
        except Exception:
            continue
        for m in RENDER_RE.finditer(s):
            tpl = (m.group("tpl") or "").strip().lstrip("/")
            if not tpl or tpl in allow:
                continue
            p = TEMPLATES_DIR / tpl
            if not p.exists():
                missing.append((str(py), tpl))

    if missing:
        print("[ff-tpl-gate] FAIL: missing templates referenced by Python:")
        for f, tpl in missing[:200]:
            print(f" - {tpl}  (referenced in {f})")
        if len(missing) > 200:
            print(f" ... {len(missing)-200} more")
        return 2

    print("[ff-tpl-gate] ✅ all render_template() targets exist")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
