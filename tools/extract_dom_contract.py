#!/usr/bin/env python3
"""
FutureFunded – DOM Contract Extractor
------------------------------------
Extracts every selector / id / class / attribute
that JavaScript reads, toggles, or expects.

Author: FundChamps / FutureFunded
"""

import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup
from collections import defaultdict

# ---------- CONFIG ----------
HTML_FILE = "app/templates/index.html"
JS_DIRS = [
    "app/static/js",
]

# ---------- REGEXES ----------
JS_PATTERNS = {
    "id": re.compile(r'getElementById\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
    "selector": re.compile(r'querySelector(All)?\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
    "class_add": re.compile(r'classList\.(add|remove|toggle)\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
    "dataset": re.compile(r'dataset\.([a-zA-Z0-9_]+)'),
    "attribute": re.compile(r'(getAttribute|setAttribute|hasAttribute)\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
}

# ---------- HELPERS ----------
def read_js_files():
    files = []
    for d in JS_DIRS:
        p = Path(d)
        if not p.exists():
            continue
        files.extend(p.rglob("*.js"))
    return files

def extract_from_js():
    found = defaultdict(set)

    for js_file in read_js_files():
        text = js_file.read_text(errors="ignore")

        for kind, rx in JS_PATTERNS.items():
            for match in rx.findall(text):
                if isinstance(match, tuple):
                    value = match[-1]
                else:
                    value = match
                found[kind].add(value)

    return found

def extract_from_html():
    html = Path(HTML_FILE).read_text(errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    ids = set()
    classes = set()
    attributes = set()

    for el in soup.find_all(True):
        if el.get("id"):
            ids.add(el["id"])

        for cls in el.get("class", []):
            classes.add(cls)

        for attr in el.attrs:
            if attr.startswith("data-") or attr.startswith("aria-") or attr in (
                "role",
                "hidden",
                "open",
            ):
                attributes.add(attr)

    return ids, classes, attributes

# ---------- MAIN ----------
def main():
    js = extract_from_js()
    html_ids, html_classes, html_attrs = extract_from_html()

    print("\n# ===============================")
    print("# FutureFunded DOM CONTRACT")
    print("# ===============================\n")

    print("# IDs")
    for i in sorted(set(js["id"]) | html_ids):
        print(f"#{i}")

    print("\n# Classes")
    for c in sorted(set(js["class_add"]) | html_classes):
        print(f".{c}")

    print("\n# Selectors (raw)")
    for s in sorted(js["selector"]):
        print(s)

    print("\n# Data attributes")
    for d in sorted(js["dataset"]):
        print(f"[data-{d.replace('_','-')}]")

    print("\n# Attributes / ARIA")
    for a in sorted(set(js["attribute"]) | html_attrs):
        print(f"[{a}]")

    print("\n# ===============================")
    print("# END CONTRACT")
    print("# ===============================\n")

if __name__ == "__main__":
    main()

