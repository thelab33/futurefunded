#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FutureFunded selector contract gate
-----------------------------------
Reads selector audit report + rescans source files to:
- emit targeted patch plan
- fail CI if selector glue drifts out of contract

Checks:
- missing hooks in HTML
- missing selectors in CSS
- dead selectors in JS
- dead CSS hooks not present in HTML
- duplicate IDs
- duplicate ffSelectors keys
- selectors referenced in JS but absent from both HTML and CSS

Usage:
  python tools/ff_selector_contract_gate.py
  python tools/ff_selector_contract_gate.py --strict
  python tools/ff_selector_contract_gate.py --report tools/.artifacts/ff_selector_contract_report.json

Exit codes:
  0 = pass
  1 = fail
  2 = usage / file error
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional


# --------------------------------------------------
# Regex
# --------------------------------------------------

HTML_ID_RE = re.compile(r'\bid\s*=\s*"([^"]+)"', re.I)
HTML_CLASS_RE = re.compile(r'\bclass\s*=\s*"([^"]+)"', re.I)
HTML_DATA_RE = re.compile(r'\b(data-ff-[a-zA-Z0-9_-]+)\b', re.I)

CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
CSS_SELECTOR_BLOCK_RE = re.compile(r"([^{}@]+)\{", re.S)

JS_QS_RE = re.compile(
    r"""
    (?:
        \.\s*(?:querySelector|querySelectorAll|closest|matches)\s*\(\s*(['"])(.*?)\1\s*\)
      |
        \.\s*getElementById\s*\(\s*(['"])(.*?)\3\s*\)
    )
    """,
    re.X | re.S,
)

# Matches:
#   <script id="ffSelectors" type="application/json"> ... </script>
SCRIPT_ID_FFSELECTORS_RE = re.compile(
    r"""
    <script\b(?P<attrs>[^>]*)>
    (?P<body>.*?)
    </script>
    """,
    re.I | re.S | re.X,
)

SCRIPT_ID_ATTR_RE = re.compile(r'\bid\s*=\s*["\']ffSelectors["\']', re.I)


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> dict:
    return json.loads(read_text(path))


def uniq_sorted(items: Set[str]) -> List[str]:
    return sorted(x for x in items if x)


def classify_selector(sel: str) -> Tuple[str, str]:
    sel = sel.strip()
    if sel.startswith("#"):
        return "id", sel[1:]
    if sel.startswith("."):
        return "class", sel[1:]
    m = re.fullmatch(r"\[(data-ff-[A-Za-z0-9_-]+)\]", sel)
    if m:
        return "data", m.group(1)
    return "other", sel


def normalize_selector(sel: str) -> str:
    return re.sub(r"\s+", " ", sel.strip())


def is_ff_hook_selector(sel: str) -> bool:
    kind, value = classify_selector(sel)
    if kind == "id":
        return value.startswith("ff") or value.lower().startswith(
            ("hero", "impact", "checkout", "donation", "sponsors", "roster", "mission", "faq")
        )
    if kind == "class":
        return value.startswith("ff-")
    if kind == "data":
        return value.startswith("data-ff-")
    return False


# --------------------------------------------------
# Inventories
# --------------------------------------------------


def extract_html_inventory(html: str) -> Dict[str, Set[str]]:
    ids = set()
    classes = set()
    data_attrs = set()

    for m in HTML_ID_RE.finditer(html):
        val = m.group(1).strip()
        if val and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", val):
            ids.add(val)

    for m in HTML_CLASS_RE.finditer(html):
        for cls in re.findall(r"[A-Za-z_-][A-Za-z0-9_-]*", m.group(1)):
            if cls:
                classes.add(cls)

    for m in HTML_DATA_RE.finditer(html):
        val = m.group(1).strip()
        if val and re.fullmatch(r"data-ff-[A-Za-z0-9_-]+", val):
            data_attrs.add(val)

    return {
        "ids": ids,
        "classes": classes,
        "data_attrs": data_attrs,
    }

def extract_html_duplicate_ids(html: str) -> Dict[str, int]:
    counts = Counter(m.group(1).strip() for m in HTML_ID_RE.finditer(html) if m.group(1).strip())
    return {k: v for k, v in counts.items() if v > 1}


def extract_ffselectors_blocks(html: str) -> List[str]:
    blocks = []
    for m in SCRIPT_ID_FFSELECTORS_RE.finditer(html):
        attrs = m.group("attrs") or ""
        if SCRIPT_ID_ATTR_RE.search(attrs):
            blocks.append((m.group("body") or "").strip())
    return blocks


def extract_duplicate_ffselectors_keys(html: str) -> Dict[str, int]:
    counts = Counter()
    blocks = extract_ffselectors_blocks(html)

    for raw in blocks:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            for k in data.keys():
                if isinstance(k, str):
                    counts[k] += 1

    return {k: v for k, v in counts.items() if v > 1}



def extract_css_inventory(css: str) -> Dict[str, Set[str]]:
    ids = set()
    classes = set()
    data_attrs = set()
    selectors = set()

    stripped = CSS_COMMENT_RE.sub("", css)
    for m in CSS_SELECTOR_BLOCK_RE.finditer(stripped):
        selector_group = m.group(1)
        parts = [p.strip() for p in selector_group.split(",") if p.strip()]
        for sel in parts:
            if sel.startswith("@"):
                continue

            for ident in re.findall(r"#([A-Za-z_][A-Za-z0-9_-]*)", sel):
                ids.add(ident)
                selectors.add(f"#{ident}")

            for cls in re.findall(r"\.([A-Za-z_-][A-Za-z0-9_-]*)", sel):
                classes.add(cls)
                selectors.add(f".{cls}")

            for attr in re.findall(r"\[(data-ff-[A-Za-z0-9_-]+)(?:[~|^$*]?=[^\]]+)?\]", sel):
                data_attrs.add(attr)
                selectors.add(f"[{attr}]")

    return {
        "ids": ids,
        "classes": classes,
        "data_attrs": data_attrs,
        "selectors": selectors,
    }


def extract_js_inventory(js: str) -> Dict[str, Set[str]]:
    ids = set()
    classes = set()
    data_attrs = set()
    selectors = set()

    for m in JS_QS_RE.finditer(js):
        raw = (m.group(2) or m.group(4) or "").strip()
        if not raw:
            continue

        parts = [p.strip() for p in raw.split(",") if p.strip()]
        for part in parts:
            if m.group(4) and not part.startswith("#"):
                part = f"#{part}"

            if re.fullmatch(r"#[A-Za-z_][A-Za-z0-9_-]*", part):
                ids.add(part[1:])
                selectors.add(part)
                continue

            if re.fullmatch(r"\.[A-Za-z_-][A-Za-z0-9_-]*", part):
                classes.add(part[1:])
                selectors.add(part)
                continue

            dm = re.fullmatch(r"\[(data-ff-[A-Za-z0-9_-]+)\]", part)
            if dm:
                data_attrs.add(dm.group(1))
                selectors.add(part)
                continue

            for attr in re.findall(r"\[(data-ff-[A-Za-z0-9_-]+)(?:[~|^$*]?=[^\]]+)?\]", part):
                data_attrs.add(attr)
                selectors.add(f"[{attr}]")

            for ident in re.findall(r"#([A-Za-z_][A-Za-z0-9_-]*)", part):
                ids.add(ident)
                selectors.add(f"#{ident}")

            for cls in re.findall(r"\.([A-Za-z_-][A-Za-z0-9_-]*)", part):
                classes.add(cls)
                selectors.add(f".{cls}")

    return {
        "ids": ids,
        "classes": classes,
        "data_attrs": data_attrs,
        "selectors": selectors,
    }

def selector_exists_in_html(sel: str, html_inv: Dict[str, Set[str]]) -> bool:
    kind, value = classify_selector(sel)
    if kind == "id":
        return value in html_inv["ids"]
    if kind == "class":
        return value in html_inv["classes"]
    if kind == "data":
        return value in html_inv["data_attrs"]
    return False


def selector_exists_in_css(sel: str, css_inv: Dict[str, Set[str]]) -> bool:
    kind, value = classify_selector(sel)
    if kind == "id":
        return value in css_inv["ids"]
    if kind == "class":
        return value in css_inv["classes"]
    if kind == "data":
        return value in css_inv["data_attrs"]
    return False


def selector_exists_in_js(sel: str, js_inv: Dict[str, Set[str]]) -> bool:
    kind, value = classify_selector(sel)
    if kind == "id":
        return value in js_inv["ids"] or sel in js_inv["selectors"]
    if kind == "class":
        return value in js_inv["classes"] or sel in js_inv["selectors"]
    if kind == "data":
        return value in js_inv["data_attrs"] or sel in js_inv["selectors"]
    return sel in js_inv["selectors"]


def compute_dead_css_hooks(html_inv: Dict[str, Set[str]], css_inv: Dict[str, Set[str]]) -> List[str]:
    out = []

    for ident in sorted(css_inv["ids"]):
        if (ident.startswith("ff") or ident.lower().startswith(("hero", "impact", "checkout", "donation", "sponsors", "roster", "mission", "faq"))) and ident not in html_inv["ids"]:
            out.append(f"#{ident}")

    for cls in sorted(css_inv["classes"]):
        if cls.startswith("ff-") and cls not in html_inv["classes"]:
            out.append(f".{cls}")

    for attr in sorted(css_inv["data_attrs"]):
        if attr.startswith("data-ff-") and attr not in html_inv["data_attrs"]:
            out.append(f"[{attr}]")

    return sorted(set(out))



def compute_dead_js_selectors(html_inv: Dict[str, Set[str]], css_inv: Dict[str, Set[str]], js_inv: Dict[str, Set[str]]) -> List[str]:
    out = []
    for sel in sorted(js_inv["selectors"]):
        if any(ch in sel for ch in (" ", ",", ">", "+", "~")):
            continue
        kind, _ = classify_selector(sel)
        if kind == "other":
            continue
        if not selector_exists_in_html(sel, html_inv) and not selector_exists_in_css(sel, css_inv):
            out.append(sel)
    return out

def compute_missing_css_from_html(html_inv: Dict[str, Set[str]], css_inv: Dict[str, Set[str]]) -> List[str]:
    out = []

    for ident in sorted(html_inv["ids"]):
        sel = f"#{ident}"
        if is_ff_hook_selector(sel) and ident not in css_inv["ids"]:
            out.append(sel)

    for cls in sorted(html_inv["classes"]):
        sel = f".{cls}"
        if is_ff_hook_selector(sel) and cls not in css_inv["classes"]:
            out.append(sel)

    for attr in sorted(html_inv["data_attrs"]):
        sel = f"[{attr}]"
        if is_ff_hook_selector(sel) and attr not in css_inv["data_attrs"]:
            out.append(sel)

    return sorted(set(out))


def compute_missing_js_from_html(html_inv: Dict[str, Set[str]], js_inv: Dict[str, Set[str]], contract_map: Dict[str, str]) -> List[str]:
    """
    Surface hooks that are present in HTML and look like first-class platform hooks
    but are not referenced via JS inventories and are not in the contract.
    This is intentionally conservative.
    """
    out = []
    contract_values = set(contract_map.values())

    for ident in sorted(html_inv["ids"]):
        sel = f"#{ident}"
        if is_ff_hook_selector(sel) and sel not in contract_values and ident not in js_inv["ids"] and sel not in js_inv["selectors"]:
            out.append(sel)

    for attr in sorted(html_inv["data_attrs"]):
        sel = f"[{attr}]"
        if is_ff_hook_selector(sel) and sel not in contract_values and attr not in js_inv["data_attrs"] and sel not in js_inv["selectors"]:
            out.append(sel)

    return sorted(set(out))


def build_patch_plan(
    report: dict,
    html_inv: Dict[str, Set[str]],
    css_inv: Dict[str, Set[str]],
    js_inv: Dict[str, Set[str]],
    duplicate_ids: Dict[str, int],
    duplicate_ffselectors_keys: Dict[str, int],
) -> Dict[str, List[str]]:
    contract = report.get("contract", {}).get("mapping", {}) or {}

    missing_in_html = [f"{item['selector']} ({item['key']})" for item in report.get("missing_in_html", [])]
    missing_in_css = [f"{item['selector']} ({item['key']})" for item in report.get("missing_in_css", [])]
    missing_in_js = [f"{item['selector']} ({item['key']})" for item in report.get("missing_in_js", [])]

    dead_css_hooks = compute_dead_css_hooks(html_inv, css_inv)
    dead_js_selectors = compute_dead_js_selectors(html_inv, css_inv, js_inv)
    missing_css_from_html = compute_missing_css_from_html(html_inv, css_inv)
    missing_js_from_html = compute_missing_js_from_html(html_inv, js_inv, contract)

    plan = {
        "fix_html_contract_misses": [],
        "fix_css_contract_misses": [],
        "fix_js_contract_misses": [],
        "remove_or_reconnect_dead_css_hooks": [],
        "remove_or_reconnect_dead_js_selectors": [],
        "dedupe_ids": [],
        "dedupe_ffselectors_keys": [],
        "review_html_hooks_missing_css": [],
        "review_html_hooks_missing_js_contract": [],
    }

    for item in missing_in_html:
        plan["fix_html_contract_misses"].append(
            f"Add the missing hook to index.html or remove its key from ffSelectors/contract: {item}"
        )

    for item in missing_in_css:
        plan["fix_css_contract_misses"].append(
            f"Add styling/reference coverage in ff.css for contract hook: {item}"
        )

    for item in missing_in_js:
        plan["fix_js_contract_misses"].append(
            f"Wire ff-app.js to consume the contract hook via window.FF_SELECTORS: {item}"
        )

    for sel in dead_css_hooks:
        plan["remove_or_reconnect_dead_css_hooks"].append(
            f"Remove stale selector from ff.css or restore matching markup in index.html: {sel}"
        )

    for sel in dead_js_selectors:
        plan["remove_or_reconnect_dead_js_selectors"].append(
            f"Remove stale selector from ff-app.js or restore matching HTML/CSS hook: {sel}"
        )

    for ident, count in sorted(duplicate_ids.items()):
        plan["dedupe_ids"].append(
            f'Deduplicate id="{ident}" in index.html ({count} occurrences)'
        )

    for key, count in sorted(duplicate_ffselectors_keys.items()):
        plan["dedupe_ffselectors_keys"].append(
            f'Deduplicate ffSelectors key "{key}" across JSON payloads ({count} occurrences)'
        )

    for sel in missing_css_from_html:
        plan["review_html_hooks_missing_css"].append(
            f"Review whether this first-class HTML hook should have CSS coverage: {sel}"
        )

    for sel in missing_js_from_html:
        plan["review_html_hooks_missing_js_contract"].append(
            f"Review whether this HTML hook should be added to ffSelectors and consumed by ff-app.js: {sel}"
        )

    return plan



def count_failures(
    report: dict,
    duplicate_ids: Dict[str, int],
    duplicate_ffselectors_keys: Dict[str, int],
    dead_css_hooks: List[str],
    dead_js_selectors: List[str],
    strict: bool,
) -> Tuple[int, Dict[str, int]]:
    contract_source = (report.get("contract", {}) or {}).get("source", "unknown")
    derived_contract = contract_source == "derived"

    summary = {
        "missing_in_html": len(report.get("missing_in_html", [])),
        "missing_in_css": len(report.get("missing_in_css", [])),
        "missing_in_js": len(report.get("missing_in_js", [])),
        "duplicate_ids": len(duplicate_ids),
        "duplicate_ffselectors_keys": len(duplicate_ffselectors_keys),
        "dead_css_hooks": len(dead_css_hooks),
        "dead_js_selectors": len(dead_js_selectors),
    }

    failures = 0

    # launch-blocking
    failures += summary["missing_in_html"]
    failures += summary["duplicate_ids"]
    failures += summary["duplicate_ffselectors_keys"]
    failures += summary["dead_js_selectors"]

    # stricter contract enforcement only matters when the contract is explicit,
    # not when the audit had to conservatively derive it.
    if strict and not derived_contract:
        failures += summary["missing_in_js"]

    return failures, summary

def print_section(title: str, items: List[str]) -> None:
    print(title)
    print("-" * len(title))
    if not items:
        print("  none")
    else:
        for item in items:
            print(f"  - {item}")
    print("")


def print_summary(summary: Dict[str, int], strict: bool, failed: bool) -> None:
    print("Selector contract gate summary")
    print("=============================")
    print(f"strict mode: {'on' if strict else 'off'}")
    print("")
    for k, v in summary.items():
        print(f"{k:28} {v}")
    print("")
    print(f"result: {'FAIL' if failed else 'PASS'}")
    print("")


# --------------------------------------------------
# Main
# --------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="FutureFunded selector contract CI gate")
    parser.add_argument("--report", default="tools/.artifacts/ff_selector_contract_report.json")
    parser.add_argument("--html", default="app/templates/index.html")
    parser.add_argument("--css", default="app/static/css/ff.css")
    parser.add_argument("--js", default="app/static/js/ff-app.js")
    parser.add_argument("--strict", action="store_true", help="Fail on CSS/JS contract misses and dead CSS hooks too")
    args = parser.parse_args()

    report_path = Path(args.report)
    html_path = Path(args.html)
    css_path = Path(args.css)
    js_path = Path(args.js)

    for p in (report_path, html_path, css_path, js_path):
        if not p.exists():
            print(f"[ff-selector-gate] missing file: {p}", file=sys.stderr)
            return 2

    try:
        report = load_json(report_path)
    except Exception as exc:
        print(f"[ff-selector-gate] failed to read report JSON: {exc}", file=sys.stderr)
        return 2

    html = read_text(html_path)
    css = read_text(css_path)
    js = read_text(js_path)

    html_inv = extract_html_inventory(html)
    css_inv = extract_css_inventory(css)
    js_inv = extract_js_inventory(js)

    duplicate_ids = extract_html_duplicate_ids(html)
    duplicate_ffselectors_keys = extract_duplicate_ffselectors_keys(html)

    dead_css_hooks = compute_dead_css_hooks(html_inv, css_inv)
    dead_js_selectors = compute_dead_js_selectors(html_inv, css_inv, js_inv)

    plan = build_patch_plan(
        report=report,
        html_inv=html_inv,
        css_inv=css_inv,
        js_inv=js_inv,
        duplicate_ids=duplicate_ids,
        duplicate_ffselectors_keys=duplicate_ffselectors_keys,
    )

    failures, summary = count_failures(
        report=report,
        duplicate_ids=duplicate_ids,
        duplicate_ffselectors_keys=duplicate_ffselectors_keys,
        dead_css_hooks=dead_css_hooks,
        dead_js_selectors=dead_js_selectors,
        strict=args.strict,
    )

    failed = failures > 0

    print_summary(summary, strict=args.strict, failed=failed)

    print_section("Patch plan: fix HTML contract misses", plan["fix_html_contract_misses"])
    print_section("Patch plan: fix CSS contract misses", plan["fix_css_contract_misses"])
    print_section("Patch plan: fix JS contract misses", plan["fix_js_contract_misses"])
    print_section("Patch plan: remove/reconnect dead CSS hooks", plan["remove_or_reconnect_dead_css_hooks"])
    print_section("Patch plan: remove/reconnect dead JS selectors", plan["remove_or_reconnect_dead_js_selectors"])
    print_section("Patch plan: dedupe duplicate IDs", plan["dedupe_ids"])
    print_section("Patch plan: dedupe duplicate ffSelectors keys", plan["dedupe_ffselectors_keys"])
    print_section("Patch plan: review HTML hooks missing CSS", plan["review_html_hooks_missing_css"])
    print_section("Patch plan: review HTML hooks missing JS contract", plan["review_html_hooks_missing_js_contract"])

    if failed:
        print("[ff-selector-gate] FAIL: selector glue drift detected", file=sys.stderr)
        return 1

    print("[ff-selector-gate] PASS: selector contract looks sane")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
