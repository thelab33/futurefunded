#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path.cwd()
HTML_FILE = ROOT / "app/templates/index.html"
CSS_FILES = [
    ROOT / "app/static/css/ff.css",
    ROOT / "app/static/css/ff-above-main-premium.css",
]
JS_FILES = [
    ROOT / "app/static/js/ff-app.js",
]

OUT_JSON = ROOT / "tmp/ff_dom_contract_report.json"
OUT_MD = ROOT / "tmp/ff_dom_contract_report.md"

CRITICAL_SELECTORS = [
    "body[data-ff-page='fundraiser']",
    "body[data-ff-template='index']",
    "#content",
    "#checkout",
    "#faq",
    "#impact",
    "#teams",
    "#story",
    "#sponsors",
    "#trust-faq",
    "#footer",
    "#home",
    "#press-video",
    "#ff-onboarding",
    "#sponsor-interest",
    "[data-ff-body]",
    "[data-ff-page]",
    "[data-ff-template]",
    "[data-ff-open-checkout]",
    "[data-ff-close-checkout]",
    "[data-ff-checkout-sheet]",
    "[data-ff-checkout-shell]",
    "[data-ff-open-video]",
    "[data-ff-video-modal]",
    "[data-ff-video-panel]",
    "[data-ff-sponsor-modal]",
    "[data-ff-sponsor-tier]",
    "[data-ff-sponsor-tier-selected]",
    "[data-ff-theme-toggle]",
    "[data-ff-share]",
    "[data-ff-stripe-mount]",
    "[data-ff-paypal-mount]",
]

ARIA_REF_ATTRS = {"aria-labelledby", "aria-describedby", "aria-controls", "for", "list"}

ID_RE = re.compile(r"#([A-Za-z_][\w\-:]*)")
CLASS_RE = re.compile(r"\.([A-Za-z_][\w\-:]*)")
ATTR_RE = re.compile(r"\[\s*([A-Za-z_:\-][A-Za-z0-9_:\-]*)")
DATA_ATTR_RE = re.compile(r"\[\s*(data-[A-Za-z0-9_:\-]+)")
TAG_TOKEN_RE = re.compile(r"(^|[\s>+~,(])([a-zA-Z][a-zA-Z0-9_-]*)")

JS_CALL_PATTERNS = [
    ("selector", re.compile(r"""querySelector\(\s*(['"`])(.+?)\1\s*\)""", re.S)),
    ("selector", re.compile(r"""querySelectorAll\(\s*(['"`])(.+?)\1\s*\)""", re.S)),
    ("selector", re.compile(r"""closest\(\s*(['"`])(.+?)\1\s*\)""", re.S)),
    ("selector", re.compile(r"""matches\(\s*(['"`])(.+?)\1\s*\)""", re.S)),
    ("id", re.compile(r"""getElementById\(\s*(['"`])(.+?)\1\s*\)""", re.S)),
]

IGNORE_SELECTOR_PREFIXES = (":root", "from", "to")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def strip_css_comments(s: str) -> str:
    return re.sub(r"/\*.*?\*/", "", s, flags=re.S)


def strip_js_comments(s: str) -> str:
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"(^|[^:])//.*?$", r"\1", s, flags=re.M)
    return s


def normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


class DOMCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags = set()
        self.ids = set()
        self.classes = set()
        self.attrs = set()
        self.data_attrs = set()
        self.attr_values = defaultdict(set)
        self.aria_refs = defaultdict(set)

    def handle_starttag(self, tag, attrs):
        self._consume(tag, attrs)

    def handle_startendtag(self, tag, attrs):
        self._consume(tag, attrs)

    def _consume(self, tag, attrs):
        self.tags.add(tag.lower())
        for name, value in attrs:
            if not name:
                continue
            name = name.lower()
            value = "" if value is None else str(value)

            self.attrs.add(name)
            self.attr_values[name].add(value)

            if name == "id" and value.strip():
                self.ids.add(value.strip())

            if name == "class" and value.strip():
                for c in value.split():
                    if c.strip():
                        self.classes.add(c.strip())

            if name.startswith("data-"):
                self.data_attrs.add(name)

            if name in ARIA_REF_ATTRS and value.strip():
                for ref in re.split(r"\s+", value.strip()):
                    if ref:
                        self.aria_refs[name].add(ref)


def split_css_selectors(prelude: str):
    out = []
    buf = []
    paren = 0
    bracket = 0
    sq = False
    dq = False
    esc = False

    for ch in prelude:
        if esc:
            buf.append(ch)
            esc = False
            continue
        if ch == "\\":
            buf.append(ch)
            esc = True
            continue
        if ch == "'" and not dq:
            sq = not sq
            buf.append(ch)
            continue
        if ch == '"' and not sq:
            dq = not dq
            buf.append(ch)
            continue
        if sq or dq:
            buf.append(ch)
            continue

        if ch == "(":
            paren += 1
        elif ch == ")":
            paren = max(0, paren - 1)
        elif ch == "[":
            bracket += 1
        elif ch == "]":
            bracket = max(0, bracket - 1)

        if ch == "," and paren == 0 and bracket == 0:
            part = "".join(buf).strip()
            if part:
                out.append(part)
            buf = []
        else:
            buf.append(ch)

    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def extract_css_selectors(css_text: str):
    css = strip_css_comments(css_text)
    selectors = set()
    depth = 0
    buf = []

    for ch in css:
        if ch == "{":
            prelude = "".join(buf).strip()
            if depth == 0 and prelude:
                for sel in split_css_selectors(prelude):
                    sel = normalize_ws(sel)
                    if sel and not sel.startswith(IGNORE_SELECTOR_PREFIXES):
                        selectors.add(sel)
            depth += 1
            buf = []
        elif ch == "}":
            depth = max(0, depth - 1)
            buf = []
        else:
            if depth == 0:
                buf.append(ch)

    return selectors


def extract_js_selectors(js_text: str):
    js = strip_js_comments(js_text)
    found = set()

    for kind, pattern in JS_CALL_PATTERNS:
        for m in pattern.finditer(js):
            raw = normalize_ws(m.group(2))
            if not raw:
                continue
            if kind == "id":
                found.add("#" + raw)
            else:
                found.add(raw)

    return found


def selector_atoms(selector: str):
    ids = set(ID_RE.findall(selector))
    classes = set(CLASS_RE.findall(selector))
    attrs = set(ATTR_RE.findall(selector))
    data_attrs = set(DATA_ATTR_RE.findall(selector))
    tags = set()

    for m in TAG_TOKEN_RE.finditer(selector):
        tag = m.group(2)
        if tag not in {"not", "is", "where", "has"} and not tag.startswith(("data-", "aria-")):
            tags.add(tag)

    return {
        "ids": ids,
        "classes": classes,
        "attrs": attrs,
        "data_attrs": data_attrs,
        "tags": tags,
    }


def dom_supports_selector(selector: str, dom: DOMCollector):
    atoms = selector_atoms(selector)
    reasons = []

    for item in atoms["ids"]:
        if item not in dom.ids:
            reasons.append(f"missing id #{item}")

    for item in atoms["classes"]:
        if item not in dom.classes:
            reasons.append(f"missing class .{item}")

    for item in atoms["data_attrs"]:
        if item not in dom.data_attrs:
            reasons.append(f"missing attr [{item}]")

    for item in atoms["attrs"]:
        if item not in dom.attrs:
            reasons.append(f"missing attr [{item}]")

    for item in atoms["tags"]:
        if item not in dom.tags:
            reasons.append(f"missing tag {item}")

    return len(reasons) == 0, reasons


def selector_risks(selector: str):
    risks = []
    if ">" in selector:
        risks.append("child combinator")
    if "+" in selector:
        risks.append("adjacent sibling combinator")
    if "~" in selector:
        risks.append("general sibling combinator")
    if ":has(" in selector:
        risks.append(":has pseudo")
    if ":nth-" in selector:
        risks.append("nth pseudo")
    if selector.count(" ") >= 4:
        risks.append("deep descendant chain")
    if len(selector) > 120:
        risks.append("very long selector")
    return risks


def validate_aria_refs(dom: DOMCollector):
    out = {}
    for attr, refs in dom.aria_refs.items():
        missing = sorted(ref for ref in refs if ref not in dom.ids)
        if missing:
            out[attr] = missing
    return out


def build_markdown(report):
    lines = []
    lines.append("# FutureFunded DOM Contract Report")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    for k, v in report["summary"].items():
        lines.append(f"- **{k}**: {v}")
    lines.append("")

    lines.append("## Critical selector check")
    lines.append("")
    for item in report["critical_checks"]:
        icon = "✅" if item["ok"] else "❌"
        lines.append(f"- {icon} `{item['selector']}`")
        for reason in item["reasons"]:
            lines.append(f"  - {reason}")
    lines.append("")

    lines.append("## CSS selectors missing from DOM")
    lines.append("")
    if report["css_missing"]:
        for item in report["css_missing"][:200]:
            lines.append(f"- `{item['selector']}`")
            for reason in item["reasons"]:
                lines.append(f"  - {reason}")
    else:
        lines.append("- None 🎉")
    lines.append("")

    lines.append("## JS selectors missing from DOM")
    lines.append("")
    if report["js_missing"]:
        for item in report["js_missing"][:200]:
            lines.append(f"- `{item['selector']}`")
            for reason in item["reasons"]:
                lines.append(f"  - {reason}")
    else:
        lines.append("- None 🎉")
    lines.append("")

    lines.append("## Risky selectors")
    lines.append("")
    if report["risky_selectors"]:
        for item in report["risky_selectors"][:150]:
            lines.append(f"- `{item['selector']}`")
            for reason in item["risks"]:
                lines.append(f"  - {reason}")
    else:
        lines.append("- None")
    lines.append("")

    lines.append("## ARIA / reference issues")
    lines.append("")
    if report["aria_missing_refs"]:
        for attr, refs in report["aria_missing_refs"].items():
            lines.append(f"- `{attr}` -> missing ids:")
            for ref in refs:
                lines.append(f"  - `{ref}`")
    else:
        lines.append("- None ✅")
    lines.append("")
    return "\n".join(lines) + "\n"


def main():
    missing = [str(p) for p in [HTML_FILE, *CSS_FILES, *JS_FILES] if not p.exists()]
    if missing:
        print("❌ Missing required files:")
        for item in missing:
            print(f"  - {item}")
        return 1

    dom = DOMCollector()
    dom.feed(read_text(HTML_FILE))

    css_selectors = set()
    for f in CSS_FILES:
        css_selectors |= extract_css_selectors(read_text(f))

    js_selectors = set()
    for f in JS_FILES:
        js_selectors |= extract_js_selectors(read_text(f))

    css_missing = []
    for sel in sorted(css_selectors):
        ok, reasons = dom_supports_selector(sel, dom)
        if not ok:
            css_missing.append({"selector": sel, "reasons": reasons})

    js_missing = []
    for sel in sorted(js_selectors):
        ok, reasons = dom_supports_selector(sel, dom)
        if not ok:
            js_missing.append({"selector": sel, "reasons": reasons})

    critical_checks = []
    for sel in CRITICAL_SELECTORS:
        ok, reasons = dom_supports_selector(sel, dom)
        critical_checks.append({"selector": sel, "ok": ok, "reasons": reasons})

    risky_selectors = []
    for sel in sorted(css_selectors | js_selectors):
        risks = selector_risks(sel)
        if risks:
            risky_selectors.append({"selector": sel, "risks": risks})

    report = {
        "files": {
            "html": str(HTML_FILE),
            "css": [str(x) for x in CSS_FILES],
            "js": [str(x) for x in JS_FILES],
        },
        "summary": {
            "dom_ids": len(dom.ids),
            "dom_classes": len(dom.classes),
            "dom_data_attrs": len(dom.data_attrs),
            "css_selectors": len(css_selectors),
            "js_selectors": len(js_selectors),
            "css_missing_count": len(css_missing),
            "js_missing_count": len(js_missing),
            "critical_fail_count": sum(0 if x["ok"] else 1 for x in critical_checks),
            "risky_selector_count": len(risky_selectors),
        },
        "critical_checks": critical_checks,
        "css_missing": css_missing,
        "js_missing": js_missing,
        "risky_selectors": risky_selectors,
        "aria_missing_refs": validate_aria_refs(dom),
        "dom_inventory": {
            "ids": sorted(dom.ids),
            "classes": sorted(dom.classes),
            "data_attrs": sorted(dom.data_attrs),
            "attrs": sorted(dom.attrs),
            "tags": sorted(dom.tags),
        },
        "selector_inventory": {
            "css": sorted(css_selectors),
            "js": sorted(js_selectors),
        },
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")
    OUT_MD.write_text(build_markdown(report), encoding="utf-8")

    print("✅ DOM contract map complete")
    print(f"📄 {OUT_MD}")
    print(f"🧠 {OUT_JSON}")
    print("")
    print("Summary:")
    for k, v in report["summary"].items():
        print(f"  • {k}: {v}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
