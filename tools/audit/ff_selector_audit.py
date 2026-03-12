

#!/usr/bin/env python3
from __future__ import annotations



RETIRED_ID_ALLOWLIST = {
    "terms",
    "privacy",
}

RETIRED_DATA_ALLOWLIST = {
    "data-ff-close-onboard",
    "data-ff-close-privacy",
    "data-ff-close-terms",
    "data-ff-onboard-copy",
    "data-ff-onboard-email",
    "data-ff-onboard-email-target",
    "data-ff-onboard-endpoint",
    "data-ff-onboard-finish",
    "data-ff-onboard-form",
    "data-ff-onboard-modal",
    "data-ff-onboard-next",
    "data-ff-onboard-panel",
    "data-ff-onboard-prev",
    "data-ff-onboard-ready",
    "data-ff-onboard-result",
    "data-ff-onboard-status",
    "data-ff-onboard-summary",
    "data-ff-onboard-swatch",
    "data-ff-open-onboard",
    "data-ff-privacy-modal",
    "data-ff-privacy-panel",
    "data-ff-step",
    "data-ff-step-pill",
    "data-ff-terms-modal",
    "data-ff-terms-panel",
}

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

DEFAULT_HTML = "app/templates/index.html"
DEFAULT_CSS = "app/static/css/ff.css"
DEFAULT_JS = "app/static/js/ff-app.js"

HEX_LIKE = re.compile(r"^[0-9a-fA-F]{3,8}$")

RUNTIME_ID_ALLOWLIST = {
    "ffDonationSchema",
}

RUNTIME_DATA_ALLOWLIST = {
    "data-ff-backdrop",
    "data-ff-boot",
    "data-ff-close",
    "data-ff-cred-v3",
    "data-ff-dyn",
    "data-ff-focus-probe",
    "data-ff-input-mode",
    "data-ff-loaded",
    "data-ff-onboard-archive",
    "data-ff-onboard-draft-slug",
    "data-ff-onboard-publish",
    "data-ff-onboard-ready",
    "data-ff-onboard-unpublish",
    "data-ff-overlay-open",
    "data-ff-preboot",
    "data-ff-qr-src",
    "data-ff-runtime-probe",
    "data-ff-sponsor-cred-ready",
    "data-ff-sponsor-initials",
    "data-ff-ticker-track",
    "data-ff-trust-strip",
    "data-ff-vip-spotlight",
    "data-ff-webdriver",
}

# --------------------------------------------------
# regexes
# --------------------------------------------------
RE_ID_ATTR = re.compile(r'\bid\s*=\s*["\']([^"\']+)["\']', re.I)
RE_CLASS_ATTR = re.compile(r'\bclass\s*=\s*["\']([^"\']+)["\']', re.I)
RE_DATA_ATTR = re.compile(r'\b(data-ff-[a-z0-9_-]+)\s*=\s*["\'][^"\']*["\']', re.I)
RE_DATA_BOOL = re.compile(r'\b(data-ff-[a-z0-9_-]+)\b', re.I)

RE_ARIA_REFS = {
    "aria-labelledby": re.compile(r'\baria-labelledby\s*=\s*["\']([^"\']+)["\']', re.I),
    "aria-describedby": re.compile(r'\baria-describedby\s*=\s*["\']([^"\']+)["\']', re.I),
    "aria-controls": re.compile(r'\baria-controls\s*=\s*["\']([^"\']+)["\']', re.I),
    "for": re.compile(r'\bfor\s*=\s*["\']([^"\']+)["\']', re.I),
    "href_hash": re.compile(r'\bhref\s*=\s*["\']#([^"\']+)["\']', re.I),
}

RE_CSS_BLOCK_COMMENTS = re.compile(r"/\*.*?\*/", re.S)
RE_CSS_ID = re.compile(r'(?<![A-Za-z0-9_-])#([A-Za-z][A-Za-z0-9_-]*)')
RE_CSS_CLASS = re.compile(r'(?<![A-Za-z0-9_-])\.([A-Za-z][A-Za-z0-9_-]*)')
RE_CSS_ATTR = re.compile(r'\[(data-ff-[a-z0-9_-]+)(?:[~|^$*]?=\s*(?:"[^"]*"|\'[^\']*\'|[^\]]+))?\]', re.I)

RE_JS_QS = re.compile(
    r'''(?:
        querySelector(?:All)?|
        qs(?:All)?|
        getElementById|
        matches|
        closest
    )\s*\(\s*(['"`])(.+?)\1\s*\)''',
    re.X | re.S
)

RE_JS_STRING_ID = re.compile(r'(["\'`])#([A-Za-z][A-Za-z0-9_-]*)\1')
RE_JS_STRING_CLASS = re.compile(r'(["\'`])\.([A-Za-z][A-Za-z0-9_-]*)\1')
RE_JS_STRING_DATA = re.compile(r'(["\'`])(data-ff-[a-z0-9_-]+)\1', re.I)

RE_SELECTOR_SPLIT = re.compile(r'\s*,\s*')
RE_SELECTOR_ID = re.compile(r'#([A-Za-z][A-Za-z0-9_-]*)')
RE_SELECTOR_CLASS = re.compile(r'\.([A-Za-z][A-Za-z0-9_-]*)')
RE_SELECTOR_ATTR = re.compile(r'\[(data-ff-[a-z0-9_-]+)(?:[~|^$*]?=\s*(?:"[^"]*"|\'[^\']*\'|[^\]]+))?\]', re.I)

# --------------------------------------------------
# helpers
# --------------------------------------------------
def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text()

def strip_jinja(text: str) -> str:
    text = re.sub(r"\{#.*?#\}", "", text, flags=re.S)
    text = re.sub(r"\{%.*?%\}", "", text, flags=re.S)
    text = re.sub(r"\{\{.*?\}\}", '""', text, flags=re.S)
    return text

def strip_css_comments(text: str) -> str:
    return RE_CSS_BLOCK_COMMENTS.sub("", text)

def normalize_token(s: str) -> str:
    return s.strip()

def selector_is_dynamic(selector: str) -> bool:
    dynamic_markers = (
        "{", "}", "$", "${", " + ", "' +", '"+', '`', ":", "::", "*", ">", "~", "+", "(",
    )
    return any(m in selector for m in dynamic_markers)

def clean_contract_tokens(values: Iterable[str]) -> set[str]:
    out: set[str] = set()
    for v in values:
        if not v:
            continue
        v = v.strip()
        if not v:
            continue
        if "{{" in v or "}}" in v or "{%" in v or "%}" in v:
            continue
        if HEX_LIKE.fullmatch(v):
            continue
        out.add(v)
    return out

def flatten(iterables: Iterable[Iterable[str]]) -> set[str]:
    out: set[str] = set()
    for group in iterables:
        out.update(group)
    return out

# --------------------------------------------------
# models
# --------------------------------------------------
@dataclass
class HtmlContract:
    ids: set[str] = field(default_factory=set)
    id_counts: Counter = field(default_factory=Counter)
    classes: set[str] = field(default_factory=set)
    data_attrs: set[str] = field(default_factory=set)
    aria_refs: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))

@dataclass
class CssContract:
    ids: set[str] = field(default_factory=set)
    classes: set[str] = field(default_factory=set)
    data_attrs: set[str] = field(default_factory=set)

@dataclass
class JsContract:
    ids: set[str] = field(default_factory=set)
    classes: set[str] = field(default_factory=set)
    data_attrs: set[str] = field(default_factory=set)
    raw_selectors: list[str] = field(default_factory=list)

# --------------------------------------------------
# extraction
# --------------------------------------------------
def extract_html_contract(text: str) -> HtmlContract:
    raw = strip_jinja(text)
    result = HtmlContract()

    ids = RE_ID_ATTR.findall(raw)
    result.id_counts.update(ids)
    result.ids = set(ids)

    for cls_blob in RE_CLASS_ATTR.findall(raw):
        for cls in cls_blob.split():
            cls = normalize_token(cls)
            if cls:
                result.classes.add(cls)

    data_attrs = set(m.lower() for m in RE_DATA_ATTR.findall(raw))
    for m in RE_DATA_BOOL.findall(raw):
        if m.lower().startswith("data-ff-"):
            data_attrs.add(m.lower())
    result.ids = clean_contract_tokens(result.ids)
    result.classes = clean_contract_tokens(result.classes)
    result.data_attrs = clean_contract_tokens(data_attrs)

    for ref_name, pattern in RE_ARIA_REFS.items():
        for group in pattern.findall(raw):
            vals = [v.strip() for v in group.split() if v.strip()]
            result.aria_refs[ref_name].extend(vals)

    return result

def extract_css_contract(text: str) -> CssContract:
    raw = strip_css_comments(text)
    return CssContract(
        ids=clean_contract_tokens(RE_CSS_ID.findall(raw)),
        classes=clean_contract_tokens(RE_CSS_CLASS.findall(raw)),
        data_attrs=set(m.lower() for m in RE_CSS_ATTR.findall(raw)),
    )

def extract_js_contract(text: str) -> JsContract:
    result = JsContract()

    for _, selector in RE_JS_QS.findall(text):
        selector = selector.strip()
        if not selector or selector_is_dynamic(selector):
            continue
        result.raw_selectors.append(selector)
        result.ids.update(RE_SELECTOR_ID.findall(selector))
        result.classes.update(RE_SELECTOR_CLASS.findall(selector))
        result.data_attrs.update(m.lower() for m in RE_SELECTOR_ATTR.findall(selector))

    result.ids.update(m[1] for m in RE_JS_STRING_ID.findall(text))
    result.classes.update(m[1] for m in RE_JS_STRING_CLASS.findall(text))
    result.data_attrs.update(m[1].lower() for m in RE_JS_STRING_DATA.findall(text))

    result.ids = clean_contract_tokens(result.ids)
    result.classes = clean_contract_tokens(result.classes)
    result.data_attrs = {x for x in result.data_attrs if x not in (RUNTIME_DATA_ALLOWLIST | RETIRED_DATA_ALLOWLIST)}
    result.ids = {x for x in result.ids if x not in (RUNTIME_ID_ALLOWLIST | RETIRED_ID_ALLOWLIST)}

    return result

# --------------------------------------------------
# audit logic
# --------------------------------------------------
def audit(
    html_path: Path,
    css_path: Path,
    js_path: Path,
) -> dict:
    html_text = read_text(html_path)
    css_text = read_text(css_path)
    js_text = read_text(js_path)

    html = extract_html_contract(html_text)
    css = extract_css_contract(css_text)
    js = extract_js_contract(js_text)

    duplicate_ids = sorted([k for k, v in html.id_counts.items() if v > 1])

    broken_aria = []
    valid_id_targets = html.ids

    for kind, refs in html.aria_refs.items():
        if kind == "href_hash":
            refs = [r for r in refs if r not in ("", "#")]
        for ref in refs:
            if ref not in valid_id_targets:
                broken_aria.append({"type": kind, "target": ref})

    html_contract = {
        "ids": html.ids,
        "classes": html.classes,
        "data_attrs": html.data_attrs,
    }
    css_contract = {
        "ids": css.ids,
        "classes": css.classes,
        "data_attrs": css.data_attrs,
    }
    js_contract = {
        "ids": js.ids,
        "classes": js.classes,
        "data_attrs": js.data_attrs,
    }

    html_all = flatten(html_contract.values())
    css_all = flatten(css_contract.values())
    js_all = flatten(js_contract.values())

    missing_css = {
        "ids": sorted(html.ids - css.ids),
        "classes": sorted(html.classes - css.classes),
        "data_attrs": sorted(html.data_attrs - css.data_attrs),
    }

    js_missing_in_html = {
        "ids": sorted(js.ids - html.ids),
        "classes": sorted(js.classes - html.classes),
        "data_attrs": sorted(js.data_attrs - html.data_attrs),
    }

    css_missing_in_html = {
        "ids": sorted(css.ids - html.ids),
        "classes": sorted(css.classes - html.classes),
        "data_attrs": sorted(css.data_attrs - html.data_attrs),
    }

    orphaned_html = {
        "ids": sorted([x for x in html.ids if x not in css.ids and x not in js.ids]),
        "classes": sorted([x for x in html.classes if x not in css.classes and x not in js.classes]),
        "data_attrs": sorted([x for x in html.data_attrs if x not in css.data_attrs and x not in js.data_attrs]),
    }

    summary = {
        "files": {
            "html": str(html_path),
            "css": str(css_path),
            "js": str(js_path),
        },
        "counts": {
            "html_ids": len(html.ids),
            "html_classes": len(html.classes),
            "html_data_attrs": len(html.data_attrs),
            "css_ids": len(css.ids),
            "css_classes": len(css.classes),
            "css_data_attrs": len(css.data_attrs),
            "js_ids": len(js.ids),
            "js_classes": len(js.classes),
            "js_data_attrs": len(js.data_attrs),
            "duplicate_ids": len(duplicate_ids),
            "broken_aria_refs": len(broken_aria),
        },
        "duplicate_ids": duplicate_ids,
        "broken_aria_refs": broken_aria,
        "missing_css_coverage": missing_css,
        "js_hooks_missing_in_html": js_missing_in_html,
        "css_selectors_missing_in_html": css_missing_in_html,
        "orphaned_html_contract": orphaned_html,
        "js_selectors_sample": js.raw_selectors[:80],
        "health": {
            "ok": not duplicate_ids
            and not broken_aria
            and not js_missing_in_html["ids"]
            and not js_missing_in_html["data_attrs"],
            "score_hint": score_hint(
                duplicate_ids=duplicate_ids,
                broken_aria=broken_aria,
                missing_css=missing_css,
                js_missing=js_missing_in_html,
            ),
        },
    }

    return summary

def score_hint(*, duplicate_ids, broken_aria, missing_css, js_missing) -> int:
    score = 100
    score -= min(len(duplicate_ids) * 10, 30)
    score -= min(len(broken_aria) * 5, 25)
    score -= min(len(missing_css["ids"]) * 2 + len(missing_css["data_attrs"]) * 2, 20)
    score -= min(len(js_missing["ids"]) * 4 + len(js_missing["data_attrs"]) * 4, 25)
    return max(score, 0)

def print_section(title: str, items: list[str] | list[dict], limit: int) -> None:
    print(f"\n=== {title} ===")
    if not items:
        print("none")
        return
    for item in items[:limit]:
        print(item)
    if len(items) > limit:
        print(f"... and {len(items) - limit} more")

def print_grouped(title: str, group: dict[str, list[str]], limit_each: int) -> None:
    print(f"\n=== {title} ===")
    empty = True
    for key in ("ids", "classes", "data_attrs"):
        vals = group.get(key, [])
        if vals:
            empty = False
            print(f"{key}:")
            for v in vals[:limit_each]:
                print(f"  - {v}")
            if len(vals) > limit_each:
                print(f"  ... and {len(vals) - limit_each} more")
    if empty:
        print("none")

def main() -> int:
    ap = argparse.ArgumentParser(description="Audit HTML/CSS/JS selector contracts.")
    ap.add_argument("--html", default=DEFAULT_HTML)
    ap.add_argument("--css", default=DEFAULT_CSS)
    ap.add_argument("--js", default=DEFAULT_JS)
    ap.add_argument("--json", action="store_true", help="Output JSON")
    ap.add_argument("--strict", action="store_true", help="Exit nonzero on findings")
    ap.add_argument("--limit", type=int, default=25, help="Print limit per section")
    args = ap.parse_args()

    html_path = Path(args.html)
    css_path = Path(args.css)
    js_path = Path(args.js)

    missing_files = [str(p) for p in (html_path, css_path, js_path) if not p.exists()]
    if missing_files:
        print("Missing file(s):", ", ".join(missing_files), file=sys.stderr)
        return 2

    result = audit(html_path, css_path, js_path)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("FutureFunded Selector Audit")
        print("=" * 32)
        print("HTML:", result["files"]["html"])
        print("CSS :", result["files"]["css"])
        print("JS  :", result["files"]["js"])
        print("\nCounts:")
        for k, v in result["counts"].items():
            print(f"  {k}: {v}")
        print(f"\nHealth OK: {result['health']['ok']}")
        print(f"Score hint: {result['health']['score_hint']}/100")

        print_section("Duplicate IDs", result["duplicate_ids"], args.limit)
        print_section("Broken ARIA refs", result["broken_aria_refs"], args.limit)
        print_grouped("Missing CSS coverage", result["missing_css_coverage"], args.limit)
        print_grouped("JS hooks missing in HTML", result["js_hooks_missing_in_html"], args.limit)
        print_grouped("CSS selectors missing in HTML", result["css_selectors_missing_in_html"], args.limit)
        print_grouped("Orphaned HTML contract", result["orphaned_html_contract"], args.limit)

    strict_fail = False
    if args.strict:
        if result["duplicate_ids"]:
            strict_fail = True
        if result["broken_aria_refs"]:
            strict_fail = True
        if result["js_hooks_missing_in_html"]["ids"] or result["js_hooks_missing_in_html"]["data_attrs"]:
            strict_fail = True

    return 1 if strict_fail else 0

if __name__ == "__main__":
    raise SystemExit(main())
