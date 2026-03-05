#!/usr/bin/env python3
"""
FutureFunded UI Contract Auditor (v2.2 — normalized hooks, modifier-aware strict, deterministic)

Maps relationships between:
- HTML classes/ids/data hooks
- CSS selectors (classes/ids/data hooks)
- JS querySelector targets (classes/ids/data hooks)

Fixes:
- missing_css_data_hooks spam (now uses full attr names: data-ff-*)
- contract-aware overlay expectations (optional)
- strict mode uses "base satisfaction" (BEM-ish):
  - ff-x--y is satisfied if ff-x exists in CSS (unless disabled)
  - ff-x__y is satisfied if ff-x exists in CSS (unless disabled)
- strict does NOT fail on missing CSS IDs by default (IDs are informational)

Outputs:
- artifacts/ui_contract_report.json

Exit codes:
- 0: ok
- 2: strict mode violations
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, Set, Tuple, List, Any

from bs4 import BeautifulSoup

ROOT = Path(".")
HTML_FILE = ROOT / "app/templates/index.html"
CSS_FILE = ROOT / "app/static/css/ff.css"
JS_FILE = ROOT / "app/static/js/ff-app.js"
CONTRACT_FILE = ROOT / "artifacts/ff_contract.json"

ARTIFACT = ROOT / "artifacts/ui_contract_report.json"


def read_text(p: Path) -> str:
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8", errors="ignore")


def strip_jinja(text: str) -> str:
    text = re.sub(r"\{\{.*?\}\}", "", text, flags=re.S)
    text = re.sub(r"\{%.*?%\}", "", text, flags=re.S)
    return text


def strip_css_values(css: str) -> str:
    css = re.sub(r"#([0-9a-fA-F]{3,6})", "", css)   # hex colors
    css = re.sub(r"\d+(\.\d+)?(px|em|rem|%)", "", css)
    return css


def load_contract(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(read_text(path).strip() or "{}")
    except Exception:
        return {}


def uniq_sorted(xs: Set[str]) -> List[str]:
    return sorted({x for x in xs if isinstance(x, str) and x})


def base_of(c: str) -> str:
    if "--" in c:
        return c.split("--", 1)[0]
    if "__" in c:
        return c.split("__", 1)[0]
    return c


def parse_html(path: Path) -> Tuple[Set[str], Set[str], Set[str]]:
    txt = strip_jinja(read_text(path))
    soup = BeautifulSoup(txt, "html.parser")

    classes: Set[str] = set()
    ids: Set[str] = set()
    data_hooks: Set[str] = set()

    for el in soup.find_all(True):
        if el.get("class"):
            for c in el.get("class") or []:
                if isinstance(c, str) and c:
                    classes.add(c)

        if el.get("id"):
            ids.add(str(el["id"]))

        for attr in el.attrs.keys():
            if isinstance(attr, str) and attr.startswith("data-ff-"):
                data_hooks.add(attr)

    return classes, ids, data_hooks


def parse_css(path: Path) -> Tuple[Set[str], Set[str], Set[str]]:
    css = strip_css_values(read_text(path))
    classes = set(re.findall(r"\.([a-zA-Z_-][a-zA-Z0-9_-]*)", css))
    ids = set(re.findall(r"#([a-zA-Z_-][a-zA-Z0-9_-]*)", css))
    data = set(re.findall(r"\[(data-ff-[a-zA-Z0-9_-]+)", css))
    return classes, ids, data


def parse_js(path: Path) -> Tuple[Set[str], Set[str], Set[str]]:
    js = read_text(path)

    classes: Set[str] = set()
    ids: Set[str] = set()
    data: Set[str] = set()

    qs = re.findall(r'querySelector(All)?\(\s*["\']([^"\']+)["\']\s*\)', js)

    for _, sel in qs:
        classes.update(re.findall(r"\.([a-zA-Z_-][a-zA-Z0-9_-]*)", sel))
        ids.update(re.findall(r"#([a-zA-Z_-][a-zA-Z0-9_-]*)", sel))
        data.update(re.findall(r"\[(data-ff-[a-zA-Z0-9_-]+)", sel))

    return classes, ids, data


def compute_missing_css_classes_strict(
    html_classes: Set[str],
    css_classes: Set[str],
    contract: Dict[str, Any],
) -> List[str]:
    allow_modifier_via_base = bool(contract.get("allow_modifier_via_base", True))
    allow_element_via_base = bool(contract.get("allow_element_via_base", True))
    ignore = set(contract.get("ignore_css_classes", []) or [])

    missing: List[str] = []
    for c in sorted(html_classes):
        if not isinstance(c, str) or not c:
            continue
        if c in ignore:
            continue
        if c in css_classes:
            continue

        base = base_of(c)
        if base != c:
            if ("--" in c) and allow_modifier_via_base and (base in css_classes):
                continue
            if ("__" in c) and allow_element_via_base and (base in css_classes):
                continue

        missing.append(c)

    return missing


def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded UI Contract Auditor (v2.2)")
    ap.add_argument("--html", default=str(HTML_FILE))
    ap.add_argument("--css", default=str(CSS_FILE))
    ap.add_argument("--js", default=str(JS_FILE))
    ap.add_argument("--contract", default=str(CONTRACT_FILE))
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--strict-ids", action="store_true", help="STRICT: also fail on missing CSS IDs")
    ap.add_argument("--strict-hooks-css", action="store_true", help="STRICT: also fail on missing CSS data hooks")
    args = ap.parse_args()

    html_path = Path(args.html)
    css_path = Path(args.css)
    js_path = Path(args.js)
    contract_path = Path(args.contract)

    contract = load_contract(contract_path)

    html_classes, html_ids, html_data = parse_html(html_path)
    css_classes, css_ids, css_data = parse_css(css_path)
    js_classes, js_ids, js_data = parse_js(js_path)

    required_ids: Set[str] = set()
    overlays = contract.get("overlays", [])
    if isinstance(overlays, list):
        required_ids.update({x for x in overlays if isinstance(x, str) and x})

    missing_required_ids = uniq_sorted(required_ids - html_ids) if required_ids else []

    missing_css_classes_raw = uniq_sorted(html_classes - css_classes)
    missing_css_classes_strict = compute_missing_css_classes_strict(html_classes, css_classes, contract)

    report = {
        "meta": {
            "version": "v2.2",
            "html_file": str(html_path),
            "css_file": str(css_path),
            "js_file": str(js_path),
            "contract_file": str(contract_path),
            "contract_overlays_count": len(required_ids),
            "strict": bool(args.strict),
            "strict_ids": bool(args.strict_ids),
            "strict_hooks_css": bool(args.strict_hooks_css),
        },

        "missing_css_classes": missing_css_classes_raw,
        "missing_css_classes_strict": missing_css_classes_strict,

        "missing_css_ids": uniq_sorted(html_ids - css_ids),

        "hooks_present_in_html": uniq_sorted(html_data),
        "hooks_styled_in_css": uniq_sorted(html_data & css_data),
        "missing_css_data_hooks": uniq_sorted(html_data - css_data),

        "unused_css_classes": uniq_sorted(css_classes - html_classes),
        "unused_css_ids": uniq_sorted(css_ids - html_ids),
        "unused_css_data_hooks": uniq_sorted(css_data - html_data),

        "js_targets_missing_from_html": uniq_sorted((js_classes - html_classes) | (js_ids - html_ids)),
        "js_data_hooks_missing_from_html": uniq_sorted(js_data - html_data),

        "missing_required_ids_from_contract": missing_required_ids,
    }

    ARTIFACT.parent.mkdir(exist_ok=True)
    ARTIFACT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("✔ FutureFunded UI contract audit complete")
    print("Report:", ARTIFACT)

    def show(k: str, items: List[str], limit: int = 15) -> None:
        print(f"\n{k} ({len(items)})")
        for i in items[:limit]:
            print("  ", i)

    show("missing_css_classes", report["missing_css_classes"])
    show("missing_css_classes_strict", report["missing_css_classes_strict"])
    show("missing_css_ids", report["missing_css_ids"])
    show("missing_required_ids_from_contract", report["missing_required_ids_from_contract"])
    show("js_targets_missing_from_html", report["js_targets_missing_from_html"])
    show("js_data_hooks_missing_from_html", report["js_data_hooks_missing_from_html"])

    strict_fail = False
    reasons: List[str] = []

    if args.strict:
        if report["missing_css_classes_strict"]:
            strict_fail = True
            reasons.append("missing_css_classes_strict")

        if args.strict_ids and report["missing_css_ids"]:
            strict_fail = True
            reasons.append("missing_css_ids")

        if args.strict_hooks_css and report["missing_css_data_hooks"]:
            strict_fail = True
            reasons.append("missing_css_data_hooks")

        if report["missing_required_ids_from_contract"]:
            strict_fail = True
            reasons.append("missing_required_ids_from_contract")

        if report["js_targets_missing_from_html"]:
            strict_fail = True
            reasons.append("js_targets_missing_from_html")

        if report["js_data_hooks_missing_from_html"]:
            strict_fail = True
            reasons.append("js_data_hooks_missing_from_html")

    if strict_fail:
        print("\n❌ STRICT MODE FAIL")
        if reasons:
            print("Reasons:", ", ".join(reasons))
        return 2

    print("\n✅ Audit OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
