from __future__ import annotations
import argparse
from pathlib import Path

TEMPLATES_DIR = Path("app/templates")

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow", nargs="*", default=["index.html"])
    args = ap.parse_args()

    allow = {a.strip().lstrip("/") for a in args.allow}
    found = []
    for p in TEMPLATES_DIR.rglob("*"):
        if p.is_dir():
            continue
        if p.suffix.lower() not in {".html", ".jinja", ".j2"}:
            continue
        rel = str(p.relative_to(TEMPLATES_DIR)).replace("\\", "/")
        if rel not in allow:
            found.append(rel)

    if found:
        print("[ff-tpl-allow] FAIL: unexpected templates present:")
        for x in found[:200]:
            print(" -", x)
        return 2

    print("[ff-tpl-allow] ✅ template allowlist satisfied")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
