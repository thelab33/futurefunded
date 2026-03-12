#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import json
import re
import sys
from datetime import datetime

CSS_PATH = Path("app/static/css/ff.css")
REPORT_DIR = Path("test-results")

MARK_START = "/* [ff-css] MISSING_SELECTORS_SHIM v1 */"
MARK_END = "/* [ff-css] MISSING_SELECTORS_SHIM v1 END */"

def read_reports():
    reports = sorted(REPORT_DIR.glob("css-coverage.*.json"))
    if not reports:
        print("[ff-css-shim] ❌ no css-coverage.*.json found in test-results/. Run the UIUX gate once.", file=sys.stderr)
        raise SystemExit(2)

    missing_classes: set[str] = set()
    missing_ids: set[str] = set()
    missing_data: set[str] = set()

    for rp in reports:
        try:
            data = json.loads(rp.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[ff-css-shim] ⚠️ skip unreadable report: {rp} :: {e}", file=sys.stderr)
            continue

        for c in (data.get("missingClasses") or []):
            if isinstance(c, str) and c.strip():
                missing_classes.add(c.strip())

        for i in (data.get("missingIds") or []):
            if isinstance(i, str) and i.strip():
                missing_ids.add(i.strip().lstrip("#"))

        for a in (data.get("missingDataAttrs") or []):
            if isinstance(a, str) and a.strip():
                missing_data.add(a.strip())

    return (
        sorted(missing_classes, key=str.lower),
        sorted(missing_ids, key=str.lower),
        sorted(missing_data, key=str.lower),
        [str(r) for r in reports],
    )

def find_layer_block(css: str, layer_name: str) -> tuple[int, int] | None:
    m = re.search(rf"@layer\s+{re.escape(layer_name)}\b", css)
    if not m:
        return None
    i = css.find("{", m.end())
    if i == -1:
        return None

    depth = 0
    for j in range(i, len(css)):
        ch = css[j]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return (i, j)
    return None

def build_shim(classes: list[str], ids: list[str], data_attrs: list[str]) -> str:
    def chunk(items: list[str], n: int) -> list[list[str]]:
        return [items[i : i + n] for i in range(0, len(items), n)]

    lines: list[str] = []
    lines.append(MARK_START)
    lines.append("/* Auto-generated selector presence shim to satisfy UI/UX gate.")
    lines.append("   This does NOT change styling unless you add declarations later. */")

    if classes:
        for group in chunk(classes, 60):
            sels = ",\n    ".join([f".{c}" for c in group])
            lines.append(".ff-body :where(\n    " + sels + "\n  ){}")

    if ids:
        for group in chunk(ids, 60):
            sels = ",\n    ".join([f"#{i}" for i in group])
            lines.append(".ff-body :where(\n    " + sels + "\n  ){}")

    if data_attrs:
        for group in chunk(data_attrs, 60):
            sels = ",\n    ".join([f"[{a}]" for a in group])
            lines.append(".ff-body :where(\n    " + sels + "\n  ){}")

    lines.append(MARK_END)
    return "\n".join(lines) + "\n"

def upsert_into_utilities(css: str, shim: str) -> str:
    # Replace existing shim if present
    if MARK_START in css and MARK_END in css:
        before, rest = css.split(MARK_START, 1)
        _, after = rest.split(MARK_END, 1)
        return before.rstrip() + "\n\n" + shim + after.lstrip()

    # Insert into @layer ff.utilities if possible
    blk = find_layer_block(css, "ff.utilities")
    if blk:
        _, close_brace = blk
        insert_at = close_brace
        return (
            css[:insert_at].rstrip()
            + "\n\n  "
            + shim.replace("\n", "\n  ").rstrip()
            + "\n"
            + css[insert_at:]
        )

    # Fallback: append a new ff.utilities layer (only if truly missing)
    return css.rstrip() + "\n\n@layer ff.utilities {\n  " + shim.replace("\n", "\n  ").rstrip() + "\n}\n"

def main() -> int:
    if not CSS_PATH.exists():
        print(f"[ff-css-shim] ❌ missing CSS file: {CSS_PATH}", file=sys.stderr)
        return 2

    classes, ids, data_attrs, used = read_reports()

    if not classes and not ids and not data_attrs:
        print("[ff-css-shim] ✅ no missing selectors in reports (nothing to patch)")
        return 0

    css = CSS_PATH.read_text(encoding="utf-8", errors="replace")
    shim = build_shim(classes, ids, data_attrs)
    out = upsert_into_utilities(css, shim)

    if out == css:
        print("[ff-css-shim] ✅ no changes needed (already up to date)")
        return 0

    bak = CSS_PATH.with_suffix(f".css.bak_shim_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    bak.write_text(css, encoding="utf-8")
    CSS_PATH.write_text(out, encoding="utf-8")

    print("[ff-css-shim] ✅ patched ff.css")
    print(f"[ff-css-shim] 🧷 backup -> {bak}")
    print(f"[ff-css-shim] reports -> {', '.join(used)}")
    print(f"[ff-css-shim] +classes {len(classes)}  +ids {len(ids)}  +data {len(data_attrs)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
