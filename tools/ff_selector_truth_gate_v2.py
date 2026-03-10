#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path.cwd()
DEFAULT_HTML = Path("app/templates/index.html")
DEFAULT_CSS = Path("app/static/css/ff.css")
DEFAULT_JS = Path("app/static/js/ff-app.js")
ARTIFACT_DIR = Path("tools/.artifacts")

IGNORE_HTML_IDS_FOR_CSS = {
    "ffConfig", "ffSelectors", "checkoutTitle", "checkoutDesc", "checkoutErrorText",
    "faqTitle", "heroActivityTitle", "impactTitle", "impactLead", "impactHint",
    "impactPickTitle", "impactPickDesc", "impactPlayerTitle", "impactPlayerHint",
    "impactProofTitle", "impactProofDesc", "ffOnboardTitle", "ffOnboardDesc",
    "ffOnboardStep1Title", "ffOnboardStep2Title", "ffOnboardStep3Title", "ffOnboardStep4Title",
}
IGNORE_HTML_DATA_FOR_CSS = {
    "data-ff-config", "data-ff-body", "data-ff-brand", "data-ff-build",
    "data-ff-version", "data-ff-data-mode", "data-ff-totals-verified", "data-ff-id",
    "data-ff-open-checkout", "data-ff-close-checkout", "data-ff-open-sponsor",
    "data-ff-close-sponsor", "data-ff-open-video", "data-ff-close-video",
    "data-ff-open-drawer", "data-ff-close-drawer", "data-ff-open-terms", "data-ff-close-terms",
    "data-ff-open-privacy", "data-ff-close-privacy", "data-ff-open-onboard", "data-ff-close-onboard",
}
IGNORE_HTML_CLASSES_FOR_CSS = set()
IGNORE_JS_KEYS = set()

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise SystemExit(f"Missing file: {path}")

def sanitize_jinja(text: str) -> str:
    text = re.sub(r"{#.*?#}", " ", text, flags=re.S)
    text = re.sub(r"{%.*?%}", " ", text, flags=re.S)
    text = re.sub(r"{{.*?}}", " ", text, flags=re.S)
    return text

def extract_ffselectors_hooks(html: str) -> dict[str, str]:
    m = re.search(
        r"<script\b[^>]*\bid=[\"']ffSelectors[\"'][^>]*>(.*?)</script>",
        html,
        flags=re.I | re.S,
    )
    if not m:
        return {}
    body = m.group(1).strip()
    if not body:
        return {}
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Could not parse #ffSelectors JSON: {exc}")
    if isinstance(data, dict) and isinstance(data.get("hooks"), dict):
        src = data["hooks"]
    elif isinstance(data, dict):
        src = data
    else:
        return {}
    hooks: dict[str, str] = {}
    for key, value in src.items():
        if isinstance(value, str) and value.strip():
            hooks[str(key)] = value.strip()
    return hooks

def parse_html(html: str) -> dict[str, object]:
    ids = re.findall(r"id=[\"\']([^\"\']+)[\"\']", html, flags=re.I)
    duplicate_ids = sorted([k for k, v in Counter(ids).items() if v > 1])

    classes: set[str] = set()
    malformed_class_tokens: set[str] = set()
    for raw in re.findall(r"\\bclass=[\"']([^\"']+)[\"']", html, flags=re.I | re.S):
        cleaned = sanitize_jinja(raw)
        for token in cleaned.split():
            token = token.strip()
            if not token:
                continue
            if any(ch in token for ch in "{}%"):
                malformed_class_tokens.add(token)
                continue
            classes.add(token)

    data_attrs = {m.lower() for m in re.findall(r'\\b(data-ff-[a-z0-9_-]+)\\b', html, flags=re.I)}
    return {
        "ids": set(ids),
        "classes": classes,
        "data_attrs": data_attrs,
        "duplicate_ids": duplicate_ids,
        "malformed_class_tokens": sorted(malformed_class_tokens),
    }

def strip_css_comments(css: str) -> str:
    return re.sub(r"/\\*.*?\\*/", "", css, flags=re.S)

def parse_css(css: str) -> dict[str, set[str]]:
    css = strip_css_comments(css)
    ids = set(re.findall(r"#([A-Za-z_][\\w:-]*)", css))
    classes = set(re.findall(r"\\.([A-Za-z_][\\w-]*)", css))
    data_attrs = {m.lower() for m in re.findall(r"\\[(data-ff-[a-z0-9_-]+)(?:[~|^$*]?=[^\\]]+)?\\]", css, flags=re.I)}
    return {"ids": ids, "classes": classes, "data_attrs": data_attrs}

def strip_js_comments(js: str) -> str:
    js = re.sub(r"/\\*.*?\\*/", "", js, flags=re.S)
    js = re.sub(r"(^|[^:])//.*?$", r"\\1", js, flags=re.M)
    return js

def parse_js_raw_selectors(js: str) -> set[str]:
    js = strip_js_comments(js)
    found: set[str] = set()

    selector_call_patterns = [
        r"(?:querySelectorAll|querySelector|matches|closest)\\(\\s*([\\\"\\'])(.*?)\\1\\s*\\)",
        r"(?:qs|qsa)\\(\\s*([\\\"\\'])([.#\\[].*?)\\1\\s*(?:,|\\))",
    ]
    for pattern in selector_call_patterns:
        for _, value in re.findall(pattern, js, flags=re.S):
            value = value.strip()
            if value:
                found.add(value)

    for _, value in re.findall(r"getElementById\\(\\s*([\\\"\\'])(.*?)\\1\\s*\\)", js, flags=re.S):
        value = value.strip()
        if value:
            found.add(f"#{value}")
    return found

def selector_tokens(selector: str) -> dict[str, set[str]]:
    ids = set(re.findall(r"#([A-Za-z_][\\w:-]*)", selector))
    classes = set(re.findall(r"\\.([A-Za-z_][\\w-]*)", selector))
    data_attrs = {m.lower() for m in re.findall(r"\\[(data-ff-[a-z0-9_-]+)(?:[~|^$*]?=[^\\]]+)?\\]", selector, flags=re.I)}
    return {"ids": ids, "classes": classes, "data_attrs": data_attrs}

def selector_exists_in_html(selector: str, html_map: dict[str, object]) -> bool:
    selector = selector.strip()
    if not selector:
        return False
    tokens = selector_tokens(selector)
    if not any(tokens.values()):
        return False
    html_ids = html_map["ids"]
    html_classes = html_map["classes"]
    html_data = html_map["data_attrs"]
    return (
        tokens["ids"].issubset(html_ids)
        and tokens["classes"].issubset(html_classes)
        and tokens["data_attrs"].issubset(html_data)
    )

def js_uses_contract_key(js: str, key: str) -> bool:
    key_esc = re.escape(key)
    patterns = [
        rf"\\brefs\\.{key_esc}\\b",
        rf"\\bqs\\(\\s*[\\\"\\']{key_esc}[\\\"\\']\\s*\\)",
        rf"\\bqsa\\(\\s*[\\\"\\']{key_esc}[\\\"\\']\\s*\\)",
        rf"\\bexists\\(\\s*[\\\"\\']{key_esc}[\\\"\\']\\s*\\)",
        rf"\\bclosestMatch\\([^)]*[\\\"\\']{key_esc}[\\\"\\']",
        rf"\\[\\s*[\\\"\\']{key_esc}[\\\"\\']\\s*\\]",
    ]
    return any(re.search(p, js) for p in patterns)

def build_report(html_path: Path, css_path: Path, js_path: Path) -> dict[str, object]:
    html = read_text(html_path)
    css = read_text(css_path)
    js = read_text(js_path)

    hooks = extract_ffselectors_hooks(html)
    html_map = parse_html(html)
    css_map = parse_css(css)
    js_raw_selectors = parse_js_raw_selectors(js)

    missing_contract_in_html = []
    contract_used_via_key = []
    contract_used_raw = []
    contract_unused = []

    for key, selector in sorted(hooks.items()):
        exists = selector_exists_in_html(selector, html_map)
        if not exists:
            missing_contract_in_html.append({"key": key, "selector": selector})
            continue
        via_key = js_uses_contract_key(js, key)
        via_raw = selector in js_raw_selectors
        if via_key:
            contract_used_via_key.append({"key": key, "selector": selector})
        elif via_raw:
            contract_used_raw.append({"key": key, "selector": selector})
        elif key not in IGNORE_JS_KEYS:
            contract_unused.append({"key": key, "selector": selector})

    raw_js_should_contract = []
    dead_js_raw_selectors = []
    contract_selector_to_key = {v: k for k, v in hooks.items()}
    for selector in sorted(js_raw_selectors):
        if selector in contract_selector_to_key:
            raw_js_should_contract.append(
                {"selector": selector, "key": contract_selector_to_key[selector]}
            )
            continue
        if not selector_exists_in_html(selector, html_map):
            dead_js_raw_selectors.append(selector)

    html_ff_classes = sorted(c for c in html_map["classes"] if c.startswith("ff-"))
    missing_html_classes_in_css = sorted(
        c for c in html_ff_classes
        if c not in css_map["classes"] and c not in IGNORE_HTML_CLASSES_FOR_CSS
    )
    missing_html_ids_in_css = sorted(
        i for i in html_map["ids"]
        if i not in css_map["ids"] and i not in IGNORE_HTML_IDS_FOR_CSS and i.startswith("ff")
    )
    missing_html_data_in_css = sorted(
        d for d in html_map["data_attrs"]
        if d not in css_map["data_attrs"] and d not in IGNORE_HTML_DATA_FOR_CSS
    )

    css_ff_classes = sorted(c for c in css_map["classes"] if c.startswith("ff-"))
    dead_css_ff_classes = sorted(c for c in css_ff_classes if c not in html_map["classes"])

    report = {
        "paths": {
            "html": str(html_path),
            "css": str(css_path),
            "js": str(js_path),
        },
        "summary": {
            "contract_hooks": len(hooks),
            "missing_contract_in_html": len(missing_contract_in_html),
            "contract_used_via_key": len(contract_used_via_key),
            "contract_used_raw": len(contract_used_raw),
            "contract_unused": len(contract_unused),
            "raw_js_should_contract": len(raw_js_should_contract),
            "dead_js_raw_selectors": len(dead_js_raw_selectors),
            "duplicate_ids": len(html_map["duplicate_ids"]),
            "malformed_class_tokens": len(html_map["malformed_class_tokens"]),
            "missing_html_classes_in_css": len(missing_html_classes_in_css),
            "missing_html_ids_in_css": len(missing_html_ids_in_css),
            "missing_html_data_in_css": len(missing_html_data_in_css),
            "dead_css_ff_classes": len(dead_css_ff_classes),
        },
        "contract_hooks": hooks,
        "missing_contract_in_html": missing_contract_in_html,
        "contract_used_via_key": contract_used_via_key,
        "contract_used_raw": contract_used_raw,
        "contract_unused": contract_unused,
        "raw_js_should_contract": raw_js_should_contract,
        "dead_js_raw_selectors": dead_js_raw_selectors,
        "duplicate_ids": html_map["duplicate_ids"],
        "malformed_class_tokens": html_map["malformed_class_tokens"],
        "missing_html_classes_in_css": missing_html_classes_in_css,
        "missing_html_ids_in_css": missing_html_ids_in_css,
        "missing_html_data_in_css": missing_html_data_in_css,
        "dead_css_ff_classes": dead_css_ff_classes,
    }
    return report

def write_artifacts(report: dict[str, object]) -> tuple[Path, Path]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = ARTIFACT_DIR / "ff_selector_truth_report.json"
    txt_path = ARTIFACT_DIR / "ff_selector_truth_report.txt"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    s = report["summary"]
    lines = [
        "FutureFunded selector truth gate v2",
        "============================================",
        f"HTML: {report['paths']['html']}",
        f"CSS : {report['paths']['css']}",
        f"JS  : {report['paths']['js']}",
        "",
        "Summary",
        "--------------------------------------------",
    ]
    for key, value in s.items():
        lines.append(f"{key:<30} {value}")
    sections = [
        ("Missing contract hooks in HTML", "missing_contract_in_html"),
        ("Contract hooks used via key", "contract_used_via_key"),
        ("Contract hooks still used raw", "contract_used_raw"),
        ("Contract hooks not used in JS", "contract_unused"),
        ("Raw JS selectors that should use contract", "raw_js_should_contract"),
        ("Dead raw JS selectors", "dead_js_raw_selectors"),
        ("Duplicate IDs", "duplicate_ids"),
        ("Malformed class tokens", "malformed_class_tokens"),
        ("HTML ff-* classes missing in CSS", "missing_html_classes_in_css"),
        ("HTML ff-* ids missing in CSS", "missing_html_ids_in_css"),
        ("HTML data-ff-* hooks missing in CSS", "missing_html_data_in_css"),
        ("CSS ff-* classes not seen in HTML", "dead_css_ff_classes"),
    ]
    for title, key in sections:
        lines += ["", title, "--------------------------------------------"]
        items = report[key]
        if not items:
            lines.append("  none")
            continue
        for item in items[:250]:
            if isinstance(item, dict):
                pretty = ", ".join(f"{k}={v}" for k, v in item.items())
                lines.append(f"  - {pretty}")
            else:
                lines.append(f"  - {item}")
        if len(items) > 250:
            lines.append(f"  ... +{len(items)-250} more")
    txt_path.write_text("\\n".join(lines) + "\\n", encoding="utf-8")
    return json_path, txt_path

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", default=str(DEFAULT_HTML))
    ap.add_argument("--css", default=str(DEFAULT_CSS))
    ap.add_argument("--js", default=str(DEFAULT_JS))
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--write", action="store_true", help="Write artifacts (default behavior).")
    args = ap.parse_args()

    report = build_report(Path(args.html), Path(args.css), Path(args.js))
    json_path, txt_path = write_artifacts(report)
    s = report["summary"]

    print("Selector truth gate v2")
    print("======================")
    for k, v in s.items():
        print(f"{k:<30} {v}")
    print("")
    print(f"[ff-selector-truth] json report : {json_path}")
    print(f"[ff-selector-truth] text report : {txt_path}")

    fail = False
    reasons = []

    if s["missing_contract_in_html"]:
        fail = True
        reasons.append("contract hook missing in HTML")
    if s["duplicate_ids"]:
        fail = True
        reasons.append("duplicate IDs detected")
    if s["malformed_class_tokens"]:
        fail = True
        reasons.append("malformed class tokens detected")

    if args.strict:
        if s["raw_js_should_contract"]:
            fail = True
            reasons.append("raw JS selectors should resolve via contract")
        if s["dead_js_raw_selectors"]:
            fail = True
            reasons.append("dead raw JS selectors detected")
        if s["missing_html_classes_in_css"]:
            fail = True
            reasons.append("HTML ff-* classes missing in CSS")

    if fail:
        print("")
        print("[ff-selector-truth] FAIL:", "; ".join(reasons))
        return 1

    print("")
    print("[ff-selector-truth] PASS")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
