#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FutureFunded selector-map audit + autopatch
-------------------------------------------
Purpose:
- Parse selector hooks from index.html, ff.css, ff-app.js
- Parse ffSelectors payload from HTML when available
- Generate / refresh a selector contract block inside ff-app.js
- Report missing hook coverage and JS hardcoded selector drift

Safe behavior:
- Creates timestamped backups before mutating ff-app.js
- Only rewrites a generated block between sentinels
- If sentinels do not exist, inserts a block near the top of ff-app.js

Usage:
  python tools/ff_selector_contract_audit_autopatch.py
  python tools/ff_selector_contract_audit_autopatch.py --write
  python tools/ff_selector_contract_audit_autopatch.py --html app/templates/index.html --css app/static/css/ff.css --js app/static/js/ff-app.js --write
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

GENERATED_START = "/* FF_SELECTOR_CONTRACT_AUTOGEN_START */"
GENERATED_END = "/* FF_SELECTOR_CONTRACT_AUTOGEN_END */"


# -----------------------------
# Utilities
# -----------------------------

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def backup_file(path: Path) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = path.with_name(f"{path.name}.bak-selector-contract-{stamp}")
    write_text(bak, read_text(path))
    return bak


def uniq_sorted(items: Set[str]) -> List[str]:
    return sorted(x for x in items if x)


def slug_key(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"[^A-Za-z0-9]+", " ", raw)
    parts = [p for p in raw.split() if p]
    if not parts:
        return ""
    return parts[0].lower() + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def js_string(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def trim_lines(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.rstrip().splitlines()) + "\n"


# -----------------------------
# Data models
# -----------------------------

@dataclass
class HookInventory:
    ids: Set[str] = field(default_factory=set)
    classes: Set[str] = field(default_factory=set)
    data_attrs: Set[str] = field(default_factory=set)
    selectors: Set[str] = field(default_factory=set)

    def to_dict(self) -> Dict[str, List[str]]:
        return {
            "ids": uniq_sorted(self.ids),
            "classes": uniq_sorted(self.classes),
            "data_attrs": uniq_sorted(self.data_attrs),
            "selectors": uniq_sorted(self.selectors),
        }


@dataclass
class SelectorContract:
    mapping: Dict[str, str] = field(default_factory=dict)
    source: str = "derived"

    def to_dict(self) -> Dict[str, object]:
        return {
            "source": self.source,
            "mapping": dict(sorted(self.mapping.items())),
        }


# -----------------------------
# Extractors
# -----------------------------

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

WINDOW_FFSELECTORS_JSON_RE = re.compile(
    r"""
    (?:window\.)?ffSelectors\s*=\s*
    (?P<json>\{.*?\})
    \s*;
    """,
    re.X | re.S,
)

SCRIPT_ID_FFSELECTORS_RE = re.compile(
    r"""
    <script\b[^>]*\bid\s*=\s*["']ffSelectors["'][^>]*>
    (?P<json>.*?)
    </script>
    """,
    re.X | re.S | re.I,
)

JS_SELECTOR_MAP_LIKE_RE = re.compile(
    r"""
    (?P<lhs>\b(?:SELECTORS|selectors|selectorMap|ffSelectorMap)\b\s*=\s*)
    (?P<obj>\{.*?\})
    \s*;
    """,
    re.X | re.S,
)



def extract_html_hooks(html: str) -> HookInventory:
    inv = HookInventory()

    for match in HTML_ID_RE.finditer(html):
        ident = match.group(1).strip()
        if ident and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", ident):
            inv.ids.add(ident)
            inv.selectors.add(f"#{ident}")

    for match in HTML_CLASS_RE.finditer(html):
        raw = match.group(1)
        for cls in re.findall(r"[A-Za-z_-][A-Za-z0-9_-]*", raw):
            if cls:
                inv.classes.add(cls)
                inv.selectors.add(f".{cls}")

    for match in HTML_DATA_RE.finditer(html):
        attr = match.group(1).strip()
        if attr and re.fullmatch(r"data-ff-[A-Za-z0-9_-]+", attr):
            inv.data_attrs.add(attr)
            inv.selectors.add(f"[{attr}]")

    return inv


def extract_css_hooks(css: str) -> HookInventory:
    inv = HookInventory()
    stripped = CSS_COMMENT_RE.sub("", css)

    for m in CSS_SELECTOR_BLOCK_RE.finditer(stripped):
        selector_group = m.group(1)
        parts = [p.strip() for p in selector_group.split(",") if p.strip()]
        for sel in parts:
            if sel.startswith("@"):
                continue

            for ident in re.findall(r"#([A-Za-z_][A-Za-z0-9_-]*)", sel):
                inv.ids.add(ident)
                inv.selectors.add(f"#{ident}")

            for cls in re.findall(r"\.([A-Za-z_-][A-Za-z0-9_-]*)", sel):
                inv.classes.add(cls)
                inv.selectors.add(f".{cls}")

            for attr in re.findall(r"\[(data-ff-[A-Za-z0-9_-]+)(?:[~|^$*]?=[^\]]+)?\]", sel):
                inv.data_attrs.add(attr)
                inv.selectors.add(f"[{attr}]")

    return inv


def extract_js_hooks(js: str) -> HookInventory:
    inv = HookInventory()

    for m in JS_QS_RE.finditer(js):
        raw = (m.group(2) or m.group(4) or "").strip()
        if not raw:
            continue

        parts = [p.strip() for p in raw.split(",") if p.strip()]
        for part in parts:
            if m.group(4) and not part.startswith("#"):
                part = f"#{part}"

            if re.fullmatch(r"#[A-Za-z_][A-Za-z0-9_-]*", part):
                inv.ids.add(part[1:])
                inv.selectors.add(part)
                continue

            if re.fullmatch(r"\.[A-Za-z_-][A-Za-z0-9_-]*", part):
                inv.classes.add(part[1:])
                inv.selectors.add(part)
                continue

            dm = re.fullmatch(r"\[(data-ff-[A-Za-z0-9_-]+)\]", part)
            if dm:
                inv.data_attrs.add(dm.group(1))
                inv.selectors.add(part)
                continue

            for attr in re.findall(r"\[(data-ff-[A-Za-z0-9_-]+)(?:[~|^$*]?=[^\]]+)?\]", part):
                inv.data_attrs.add(attr)
                inv.selectors.add(f"[{attr}]")

            for ident in re.findall(r"#([A-Za-z_][A-Za-z0-9_-]*)", part):
                inv.ids.add(ident)
                inv.selectors.add(f"#{ident}")

            for cls in re.findall(r"\.([A-Za-z_-][A-Za-z0-9_-]*)", part):
                inv.classes.add(cls)
                inv.selectors.add(f".{cls}")

    return inv

def parse_ffselectors_from_html(html: str) -> Optional[SelectorContract]:
    candidates = []

    for rx in (SCRIPT_ID_FFSELECTORS_RE, WINDOW_FFSELECTORS_JSON_RE):
        for match in rx.finditer(html):
            raw = match.group("json").strip()
            candidates.append(raw)

    for raw in candidates:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                mapping = {}
                for k, v in data.items():
                    if isinstance(k, str) and isinstance(v, str) and v.strip():
                        mapping[k.strip()] = v.strip()
                if mapping:
                    return SelectorContract(mapping=mapping, source="html.ffSelectors")
        except json.JSONDecodeError:
            continue

    return None


def extract_js_hardcoded_selectors(js: str) -> List[str]:
    out = []
    for m in JS_QS_RE.finditer(js):
        sel = m.group(2) or m.group(4)
        if sel:
            out.append(sel.strip())
    return out


# -----------------------------
# Contract derivation
# -----------------------------


def derive_contract_from_html(html_inv: HookInventory) -> SelectorContract:
    """
    Conservative fallback only.
    This should NOT promote every HTML hook into the behavioral contract.
    """
    mapping: Dict[str, str] = {}

    behavioral_id_prefixes = (
        "ff", "checkout", "donation", "hero", "impact", "sponsors", "faq",
        "drawer", "video", "privacy", "terms", "topbar"
    )
    behavioral_data_prefixes = (
        "data-ff-open-", "data-ff-close-", "data-ff-checkout-", "data-ff-donate",
        "data-ff-drawer", "data-ff-video-", "data-ff-onboard-", "data-ff-sponsor-",
        "data-ff-paypal-", "data-ff-stripe-", "data-ff-floating-", "data-ff-tabs",
        "data-ff-tier", "data-ff-team-", "data-ff-player-", "data-ff-goal",
        "data-ff-meter", "data-ff-live", "data-ff-topbar", "data-ff-footer",
        "data-ff-toasts", "data-ff-main", "data-ff-home", "data-ff-shell"
    )
    behavioral_class_prefixes = (
        "ff-sheet", "ff-modal", "ff-drawer", "ff-onboard", "ff-floatingDonate",
        "ff-activityFeed", "ff-sponsorWall", "ff-teamCard", "ff-checkout",
        "ff-topbar", "ff-video", "ff-tabs"
    )

    for ident in sorted(html_inv.ids):
        if ident.startswith(behavioral_id_prefixes):
            key = slug_key(ident)
            if key and key not in mapping:
                mapping[key] = f"#{ident}"

    for attr in sorted(html_inv.data_attrs):
        if attr.startswith(behavioral_data_prefixes):
            raw_key = attr.replace("data-ff-", "")
            key = slug_key(raw_key)
            if key and key not in mapping:
                mapping[key] = f"[{attr}]"

    for cls in sorted(html_inv.classes):
        if cls.startswith(behavioral_class_prefixes):
            key = slug_key(cls.replace("ff-", ""))
            if key and key not in mapping:
                mapping[key] = f".{cls}"

    return SelectorContract(mapping=mapping, source="derived")

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


# -----------------------------
# Reporting
# -----------------------------


def compute_audit(
    html_inv: HookInventory,
    css_inv: HookInventory,
    js_inv: HookInventory,
    contract: SelectorContract,
    js_text: str,
) -> Dict[str, object]:
    missing_in_html = []
    missing_in_css = []
    missing_in_js = []

    derived_contract = contract.source == "derived"
    css_behavior_only_prefixes = (
        "data-ff-open-", "data-ff-close-", "data-ff-config", "data-ff-id",
        "data-ff-build", "data-ff-version", "data-ff-body", "data-ff-data-mode"
    )

    for key, sel in sorted(contract.mapping.items()):
        kind, value = classify_selector(sel)

        if kind == "id":
            if value not in html_inv.ids:
                missing_in_html.append({"key": key, "selector": sel, "reason": "contract selector id not found in HTML"})
            if not derived_contract and value not in js_inv.ids and sel not in js_inv.selectors:
                missing_in_js.append({"key": key, "selector": sel, "reason": "contract selector id not referenced in JS"})

        elif kind == "class":
            if value not in html_inv.classes:
                missing_in_html.append({"key": key, "selector": sel, "reason": "contract selector class not found in HTML"})
            if not derived_contract and value not in css_inv.classes:
                missing_in_css.append({"key": key, "selector": sel, "reason": "contract selector class not referenced in CSS"})
            if not derived_contract and value not in js_inv.classes and sel not in js_inv.selectors:
                missing_in_js.append({"key": key, "selector": sel, "reason": "contract selector class not referenced in JS"})

        elif kind == "data":
            if value not in html_inv.data_attrs:
                missing_in_html.append({"key": key, "selector": sel, "reason": "contract data hook not found in HTML"})
            if not derived_contract and not value.startswith(css_behavior_only_prefixes) and value not in css_inv.data_attrs:
                missing_in_css.append({"key": key, "selector": sel, "reason": "contract data hook not referenced in CSS"})
            if not derived_contract and value not in js_inv.data_attrs and sel not in js_inv.selectors:
                missing_in_js.append({"key": key, "selector": sel, "reason": "contract data hook not referenced in JS"})

    html_ff_namespace_unstyled = []
    for ident in sorted(i for i in html_inv.ids if i.startswith("ff")):
        if ident not in css_inv.ids:
            html_ff_namespace_unstyled.append(f"#{ident}")
    for cls in sorted(c for c in html_inv.classes if c.startswith("ff-")):
        if cls not in css_inv.classes:
            html_ff_namespace_unstyled.append(f".{cls}")
    for attr in sorted(a for a in html_inv.data_attrs if a.startswith("data-ff-")):
        if not attr.startswith(css_behavior_only_prefixes) and attr not in css_inv.data_attrs:
            html_ff_namespace_unstyled.append(f"[{attr}]")

    js_hardcoded = extract_js_hardcoded_selectors(js_text)
    contract_values = set(contract.mapping.values())
    hardcoded_candidates = []
    for sel in js_hardcoded:
        if sel in contract_values:
            continue
        kind, value = classify_selector(sel)
        if kind == "other":
            continue
        exists_in_html = (
            (kind == "id" and value in html_inv.ids)
            or (kind == "class" and value in html_inv.classes)
            or (kind == "data" and value in html_inv.data_attrs)
        )
        if exists_in_html:
            hardcoded_candidates.append(sel)

    return {
        "summary": {
            "contract_source": contract.source,
            "html_ids": len(html_inv.ids),
            "html_classes": len(html_inv.classes),
            "html_data_attrs": len(html_inv.data_attrs),
            "css_selectors": len(css_inv.selectors),
            "js_selectors": len(js_inv.selectors),
            "contract_keys": len(contract.mapping),
            "missing_in_html": len(missing_in_html),
            "missing_in_css": len(missing_in_css),
            "missing_in_js": len(missing_in_js),
            "html_ff_namespace_unstyled": len(html_ff_namespace_unstyled),
            "js_hardcoded_candidates": len(hardcoded_candidates),
        },
        "contract": contract.to_dict(),
        "missing_in_html": missing_in_html,
        "missing_in_css": missing_in_css,
        "missing_in_js": missing_in_js,
        "html_ff_namespace_unstyled": html_ff_namespace_unstyled,
        "js_hardcoded_candidates": sorted(set(hardcoded_candidates)),
        "inventories": {
            "html": html_inv.to_dict(),
            "css": css_inv.to_dict(),
            "js": js_inv.to_dict(),
        },
    }

def report_to_text(report: Dict[str, object], html_path: Path, css_path: Path, js_path: Path) -> str:
    s = report["summary"]
    lines = []
    lines.append("FutureFunded selector contract audit")
    lines.append("=" * 44)
    lines.append(f"HTML: {html_path}")
    lines.append(f"CSS : {css_path}")
    lines.append(f"JS  : {js_path}")
    lines.append("")

    lines.append("Summary")
    lines.append("-" * 44)
    for k, v in s.items():
        lines.append(f"{k:28} {v}")
    lines.append("")

    def section(title: str, items: List[object], limit: int = 100) -> None:
        lines.append(title)
        lines.append("-" * 44)
        if not items:
            lines.append("  none")
        else:
            for item in items[:limit]:
                if isinstance(item, dict):
                    lines.append(f"  - {item['key']}: {item['selector']}  ({item['reason']})")
                else:
                    lines.append(f"  - {item}")
            if len(items) > limit:
                lines.append(f"  ... +{len(items) - limit} more")
        lines.append("")

    section("Contract hooks missing in HTML", report["missing_in_html"])
    section("Contract hooks missing in CSS", report["missing_in_css"])
    section("Contract hooks missing in JS", report["missing_in_js"])
    section("HTML ff-* / data-ff-* hooks not referenced in CSS", report["html_ff_namespace_unstyled"])
    section("JS hardcoded selectors that should probably resolve via contract", report["js_hardcoded_candidates"])

    return "\n".join(lines).rstrip() + "\n"


# -----------------------------
# JS block generation
# -----------------------------

def build_generated_js_block(contract: SelectorContract) -> str:
    mapping_lines = []
    for key, selector in sorted(contract.mapping.items()):
        mapping_lines.append(f"    {js_string(key)}: {js_string(selector)},")

    block = f"""{GENERATED_START}
(function initFFSelectorContract(global) {{
  "use strict";

  const CONTRACT = Object.freeze({{
{chr(10).join(mapping_lines)}
  }});

  function getHTMLSelectors() {{
    try {{
      if (global.ffSelectors && typeof global.ffSelectors === "object") return global.ffSelectors;
      const tag = global.document && global.document.getElementById("ffSelectors");
      if (tag && tag.textContent) {{
        return JSON.parse(tag.textContent);
      }}
    }} catch (_err) {{
      /* no-op */
    }}
    return null;
  }}

  function resolveSelector(key, fallback) {{
    const live = getHTMLSelectors();
    if (live && typeof live[key] === "string" && live[key].trim()) {{
      return live[key].trim();
    }}
    if (typeof CONTRACT[key] === "string" && CONTRACT[key].trim()) {{
      return CONTRACT[key].trim();
    }}
    return typeof fallback === "string" ? fallback : "";
  }}

  function makeSelectorMap() {{
    const out = Object.create(null);
    for (const key of Object.keys(CONTRACT)) {{
      out[key] = resolveSelector(key, CONTRACT[key]);
    }}
    return Object.freeze(out);
  }}

  global.__FF_SELECTOR_CONTRACT__ = Object.freeze({{
    contract: CONTRACT,
    resolveSelector,
    makeSelectorMap
  }});

  global.FF_SELECTORS = makeSelectorMap();
}})(window);
{GENERATED_END}"""
    return trim_lines(block)


def patch_js_file(js_path: Path, contract: SelectorContract, write: bool) -> Tuple[bool, Optional[Path], str]:
    original = read_text(js_path)
    generated = build_generated_js_block(contract)

    if GENERATED_START in original and GENERATED_END in original:
        patched = re.sub(
            re.escape(GENERATED_START) + r".*?" + re.escape(GENERATED_END),
            generated.strip(),
            original,
            flags=re.S,
        )
    else:
        insertion = generated + "\n\n"
        patched = insertion + original

    changed = patched != original
    bak = None

    if changed and write:
        bak = backup_file(js_path)
        write_text(js_path, patched)

    return changed, bak, patched


# -----------------------------
# Main
# -----------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Audit + autopatch FutureFunded selector contract")
    parser.add_argument("--html", default="app/templates/index.html", help="Path to index.html")
    parser.add_argument("--css", default="app/static/css/ff.css", help="Path to ff.css")
    parser.add_argument("--js", default="app/static/js/ff-app.js", help="Path to ff-app.js")
    parser.add_argument("--write", action="store_true", help="Actually write autopatch to ff-app.js")
    parser.add_argument("--report-json", default="tools/.artifacts/ff_selector_contract_report.json", help="JSON report output")
    parser.add_argument("--report-txt", default="tools/.artifacts/ff_selector_contract_report.txt", help="Text report output")
    args = parser.parse_args()

    html_path = Path(args.html)
    css_path = Path(args.css)
    js_path = Path(args.js)
    report_json_path = Path(args.report_json)
    report_txt_path = Path(args.report_txt)

    for p in (html_path, css_path, js_path):
        if not p.exists():
            print(f"[ff-selector-contract] missing file: {p}", file=sys.stderr)
            return 2

    html = read_text(html_path)
    css = read_text(css_path)
    js = read_text(js_path)

    html_inv = extract_html_hooks(html)
    css_inv = extract_css_hooks(css)
    js_inv = extract_js_hooks(js)

    contract = parse_ffselectors_from_html(html)
    if contract is None:
        contract = derive_contract_from_html(html_inv)

    report = compute_audit(html_inv, css_inv, js_inv, contract, js)
    report_txt = report_to_text(report, html_path, css_path, js_path)

    ensure_parent(report_json_path)
    ensure_parent(report_txt_path)
    write_text(report_json_path, json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    write_text(report_txt_path, report_txt)

    changed, bak, _patched = patch_js_file(js_path, contract, write=args.write)

    print(report_txt.rstrip())
    print("")
    print("[ff-selector-contract] artifacts")
    print(f"  json report : {report_json_path}")
    print(f"  text report : {report_txt_path}")

    if args.write:
        if changed:
            print(f"  js patched  : {js_path}")
            if bak:
                print(f"  backup      : {bak}")
        else:
            print("  js patched  : no changes needed")
    else:
        print("  js patched  : dry run (use --write to apply)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
