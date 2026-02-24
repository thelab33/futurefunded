#!/usr/bin/env python3
"""
Generate a stub CSS file for hooks present in HTML but missing in ff.css.
This is ideal for draining "Polish targets (HTML not in CSS)" iteratively.

Usage:
  python3 tools/ff_css_stubgen.py \
    --html app/templates/index.html \
    --css app/static/css/ff.css \
    --out artifacts/css_backlog/ff_missing_hooks_stubs.css
"""
from __future__ import annotations
import argparse
import re
from pathlib import Path

RE_CLASS_ATTR = re.compile(r'\bclass="([^"]+)"')
RE_CSS_CLASS = re.compile(r'\.([A-Za-z0-9_-]+)\b')

def read_text(p: Path) -> str:
    if not p.exists():
        raise SystemExit(f"Missing file: {p}")
    return p.read_text(encoding="utf-8", errors="replace")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", required=True)
    ap.add_argument("--css", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prefix", default="ff-",
                    help="Only stub classes starting with this prefix (default: ff-).")
    args = ap.parse_args()

    html = read_text(Path(args.html))
    css = read_text(Path(args.css))

    html_classes = set()
    for chunk in RE_CLASS_ATTR.findall(html):
        for c in chunk.split():
            if c.startswith(args.prefix):
                html_classes.add(c)

    css_classes = set(RE_CSS_CLASS.findall(css))
    missing = sorted([c for c in html_classes if c not in css_classes])

    out_p = Path(args.out)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    lines = []
    lines.append("/* ============================================================================\n"
                 "   FutureFunded — AUTOGEN STUBS\n"
                 "   Hooks present in HTML but NOT found in ff.css.\n"
                 "   Safe: empty rules; won’t change visuals until you add properties.\n"
                 "============================================================================ */\n")
    lines.append("@layer ff.utilities {\n")
    for c in missing:
        lines.append(f"  :where(.ff-body) .{c} {{\n"
                     f"    /* TODO: style hook */\n"
                     f"  }}\n")
    lines.append("}\n")

    out_p.write_text("".join(lines), encoding="utf-8")
    print(f"Wrote: {out_p}  (missing stubs: {len(missing)})")

if __name__ == "__main__":
    main()

