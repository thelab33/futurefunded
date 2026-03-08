#!/usr/bin/env python3
"""
FutureFunded UI Contract Mapper

Scans:
- app/templates/index.html
- app/static/css/ff.css
- app/static/js/ff-app.js

Produces a report showing:
• HTML hooks/classes/IDs
• CSS selectors
• JS selectors
• Missing CSS
• Missing JS targets
• Unused CSS

Usage:
    python ff_map_ui_contracts.py
"""

import re
import json
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(".")
HTML_FILE = ROOT / "app/templates/index.html"
CSS_FILE = ROOT / "app/static/css/ff.css"
JS_FILE = ROOT / "app/static/js/ff-app.js"


def load_html():
    txt = HTML_FILE.read_text(encoding="utf-8")
    soup = BeautifulSoup(txt, "html.parser")

    classes = set()
    ids = set()
    data_hooks = set()

    for tag in soup.find_all(True):
        if tag.get("class"):
            for c in tag.get("class"):
                classes.add(c)

        if tag.get("id"):
            ids.add(tag.get("id"))

        for attr in tag.attrs:
            if attr.startswith("data-ff"):
                data_hooks.add(attr)

    return classes, ids, data_hooks


def load_css():
    css = CSS_FILE.read_text(encoding="utf-8")

    class_sel = set(re.findall(r"\.([a-zA-Z0-9_-]+)", css))
    id_sel = set(re.findall(r"#([a-zA-Z0-9_-]+)", css))
    data_sel = set(re.findall(r"\[data-(ff[^\]]+)\]", css))

    return class_sel, id_sel, data_sel


def load_js():
    js = JS_FILE.read_text(encoding="utf-8")

    classes = set(re.findall(r"\.([a-zA-Z0-9_-]+)", js))
    ids = set(re.findall(r"#([a-zA-Z0-9_-]+)", js))
    data = set(re.findall(r"\[data-(ff[^\]]+)\]", js))

    return classes, ids, data


def main():
    html_classes, html_ids, html_data = load_html()
    css_classes, css_ids, css_data = load_css()
    js_classes, js_ids, js_data = load_js()

    report = {
        "missing_css_classes": sorted(html_classes - css_classes),
        "missing_css_ids": sorted(html_ids - css_ids),
        "missing_css_data_hooks": sorted(html_data - css_data),

        "unused_css_classes": sorted(css_classes - html_classes),
        "unused_css_ids": sorted(css_ids - html_ids),

        "js_selectors_not_in_html": sorted(
            (js_classes - html_classes) | (js_ids - html_ids)
        ),
    }

    out = Path("artifacts/ui_contract_report.json")
    out.parent.mkdir(exist_ok=True)

    out.write_text(json.dumps(report, indent=2))

    print("✔ UI contract scan complete")
    print("Report written to:", out)

    for k, v in report.items():
        print(f"\n{k} ({len(v)}):")
        for i in v[:20]:
            print("  ", i)


if __name__ == "__main__":
    main()
