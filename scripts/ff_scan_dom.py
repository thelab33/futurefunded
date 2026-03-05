#!/usr/bin/env python3
"""
FutureFunded DOM Scanner (v2.2 — contract-aware, modifier-aware strict)

Reports:
• ff-* classes
• data-ff-* hooks
• section IDs
• overlay/modal IDs (contract + semantic + class markers)
• missing CSS selectors for ff-* classes
• hooks not referenced by JS (informational)

STRICT MODE (sane):
- Requires "base" classes to exist in CSS.
- Modifier classes (ff-x--y) do NOT need their own selector if base (ff-x) exists.
- Element classes (ff-x__y) do NOT need their own selector if base (ff-x) exists (configurable).

Outputs:
- artifacts/ff_dom_report.txt
- artifacts/ff_dom_report.json

Exit codes:
- 0: ok
- 2: strict mode violations
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Set, Tuple, Any

from bs4 import BeautifulSoup

ROOT = Path(".")
DEFAULT_HTML = ROOT / "app/templates/index.html"
DEFAULT_CSS = ROOT / "app/static/css/ff.css"
DEFAULT_JS = ROOT / "app/static/js/ff-app.js"
DEFAULT_CONTRACT = ROOT / "artifacts/ff_contract.json"

ARTIFACT_TXT = ROOT / "artifacts/ff_dom_report.txt"
ARTIFACT_JSON = ROOT / "artifacts/ff_dom_report.json"


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def strip_jinja(text: str) -> str:
    text = re.sub(r"\{\{.*?\}\}", "", text, flags=re.S)
    text = re.sub(r"\{%.*?%\}", "", text, flags=re.S)
    return text


def load_contract(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(read_text(path).strip() or "{}")
    except Exception:
        return {}


def extract_from_html(html: str) -> Tuple[Set[str], Set[str], Set[str], Set[str]]:
    soup = BeautifulSoup(strip_jinja(html), "html.parser")

    classes: Set[str] = set()
    ids: Set[str] = set()
    data_hooks: Set[str] = set()
    sections: Set[str] = set()

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

        if el.name == "section" and el.get("id"):
            sections.add(str(el["id"]))

    return classes, ids, data_hooks, sections


def extract_overlays(soup: BeautifulSoup, contract: Dict[str, Any]) -> Set[str]:
    overlay_ids: Set[str] = set()

    contract_overlay_ids = set(contract.get("overlays", []) or [])
    contract_modal_selectors = contract.get(
        "modal_markers",
        [".ff-modal", ".ff-sheet", ".ff-drawer", "[role='dialog']", "[aria-modal='true']"],
    )

    for oid in contract_overlay_ids:
        if not isinstance(oid, str) or not oid:
            continue
        if soup.find(id=oid) is not None:
            overlay_ids.add(oid)

    for el in soup.select("[role='dialog'], [aria-modal='true']"):
        if el.get("id"):
            overlay_ids.add(str(el["id"]))

    for el in soup.select(".ff-modal, .ff-sheet, .ff-drawer"):
        if el.get("id"):
            overlay_ids.add(str(el["id"]))

    for sel in contract_modal_selectors:
        if not isinstance(sel, str) or not sel.strip():
            continue
        try:
            for el in soup.select(sel):
                if el.get("id"):
                    overlay_ids.add(str(el["id"]))
        except Exception:
            continue

    return overlay_ids


def extract_ff_classes(all_classes: Set[str]) -> Set[str]:
    return {c for c in all_classes if isinstance(c, str) and c.startswith("ff-")}


def css_has_class(css: str, class_name: str) -> bool:
    if not class_name:
        return False
    pat = rf"(?<![a-zA-Z0-9_-])\.{re.escape(class_name)}(?![a-zA-Z0-9_-])"
    return re.search(pat, css) is not None


def js_references_hook(js: str, hook: str) -> bool:
    return bool(hook) and hook in js


def base_of_ff_class(c: str) -> str:
    """
    BEM-ish reduction:
    ff-thing--mod -> ff-thing
    ff-thing__part -> ff-thing
    otherwise returns itself.
    """
    if "--" in c:
        return c.split("--", 1)[0]
    if "__" in c:
        return c.split("__", 1)[0]
    return c


@dataclass
class ScanResult:
    ff_classes_count: int
    data_hooks_count: int
    sections_count: int
    overlays_count: int

    ff_classes: List[str]
    data_hooks: List[str]
    sections: List[str]
    overlays: List[str]

    missing_css_classes_raw: List[str]
    missing_css_classes_strict: List[str]
    hooks_not_referenced_by_js: List[str]

    html_file: str
    css_file: str
    js_file: str
    contract_file: str
    strict: bool


def write_reports(result: ScanResult) -> None:
    ARTIFACT_TXT.parent.mkdir(exist_ok=True)

    with ARTIFACT_TXT.open("w", encoding="utf-8") as f:
        f.write("==== FUTUREFUNDED DOM REPORT (v2.2) ====\n\n")

        f.write("CLASSES (ff-*)\n")
        for c in result.ff_classes:
            f.write(c + "\n")

        f.write("\nDATA HOOKS (data-ff-*)\n")
        for h in result.data_hooks:
            f.write(h + "\n")

        f.write("\nSECTIONS\n")
        for s in result.sections:
            f.write(s + "\n")

        f.write("\nOVERLAYS / MODALS\n")
        for m in result.overlays:
            f.write(m + "\n")

        f.write("\nMISSING CSS (RAW — every ff-* class without exact selector)\n")
        for m in result.missing_css_classes_raw:
            f.write(m + "\n")

        f.write("\nMISSING CSS (STRICT — base/modifier-aware)\n")
        for m in result.missing_css_classes_strict:
            f.write(m + "\n")

        f.write("\nHOOKS NOT REFERENCED BY JS (informational)\n")
        for j in result.hooks_not_referenced_by_js:
            f.write(j + "\n")

    ARTIFACT_JSON.write_text(json.dumps(asdict(result), indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded DOM Scanner (v2.2)")
    ap.add_argument("--html", default=str(DEFAULT_HTML), help="Path to index.html (Flask/Jinja)")
    ap.add_argument("--css", default=str(DEFAULT_CSS), help="Path to ff.css")
    ap.add_argument("--js", default=str(DEFAULT_JS), help="Path to ff-app.js")
    ap.add_argument("--contract", default=str(DEFAULT_CONTRACT), help="Path to ff_contract.json")
    ap.add_argument("--strict", action="store_true", help="Exit non-zero if strict missing CSS classes detected")
    args = ap.parse_args()

    html_path = Path(args.html)
    css_path = Path(args.css)
    js_path = Path(args.js)
    contract_path = Path(args.contract)

    html = read_text(html_path)
    css = read_text(css_path)
    js = read_text(js_path)

    contract = load_contract(contract_path)

    print("\n🔎 Scanning FutureFunded DOM (v2.2)\n")

    all_classes, _all_ids, hooks, sections = extract_from_html(html)
    ff_classes = sorted(extract_ff_classes(all_classes))
    hooks_sorted = sorted(hooks)
    sections_sorted = sorted(sections)

    soup = BeautifulSoup(strip_jinja(html), "html.parser")
    overlays = sorted(extract_overlays(soup, contract))

    print(f"Found {len(ff_classes)} ff-* classes\n")
    print(f"Found {len(hooks_sorted)} data hooks\n")
    print(f"Found {len(sections_sorted)} sections\n")
    print(f"Found {len(overlays)} overlays/modals\n")

    # RAW missing: exact selector not found
    missing_css_raw = [c for c in ff_classes if not css_has_class(css, c)]
    print(f"\n⚠️ {len(missing_css_raw)} ff-* classes missing CSS (raw)\n")

    # STRICT missing:
    # - allow modifiers/elements to be satisfied by base selector, unless configured otherwise
    allow_element_via_base = bool(contract.get("allow_element_via_base", True))
    allow_modifier_via_base = bool(contract.get("allow_modifier_via_base", True))
    ignore_classes = set(contract.get("ignore_css_classes", []) or [])

    strict_missing: List[str] = []
    for c in ff_classes:
        if c in ignore_classes:
            continue
        if css_has_class(css, c):
            continue

        base = base_of_ff_class(c)
        is_mod = ("--" in c)
        is_el = ("__" in c)

        if base != c:
            if is_mod and allow_modifier_via_base and css_has_class(css, base):
                continue
            if is_el and allow_element_via_base and css_has_class(css, base):
                continue

        strict_missing.append(c)

    hooks_not_in_js = [h for h in hooks_sorted if not js_references_hook(js, h)]
    print(f"ℹ️ {len(hooks_not_in_js)} hooks not referenced by JS (informational)\n")

    result = ScanResult(
        ff_classes_count=len(ff_classes),
        data_hooks_count=len(hooks_sorted),
        sections_count=len(sections_sorted),
        overlays_count=len(overlays),
        ff_classes=ff_classes,
        data_hooks=hooks_sorted,
        sections=sections_sorted,
        overlays=overlays,
        missing_css_classes_raw=missing_css_raw,
        missing_css_classes_strict=sorted(strict_missing),
        hooks_not_referenced_by_js=hooks_not_in_js,
        html_file=str(html_path),
        css_file=str(css_path),
        js_file=str(js_path),
        contract_file=str(contract_path),
        strict=bool(args.strict),
    )

    write_reports(result)

    print(f"📄 Reports written:\n- {ARTIFACT_TXT}\n- {ARTIFACT_JSON}\n")

    if args.strict and strict_missing:
        print(f"❌ STRICT MODE FAIL: {len(strict_missing)} missing CSS classes (strict)")
        return 2

    print("✅ Scan complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
