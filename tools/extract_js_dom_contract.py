#!/usr/bin/env python3
"""
FutureFunded – JS DOM Dependency Contract (Clean)
-------------------------------------------------
Only selectors that JavaScript reads, toggles, or expects.
Template placeholders are normalized.
"""

import re
from pathlib import Path
from collections import defaultdict

JS_DIRS = ["app/static/js"]

PATTERNS = {
    "ids": re.compile(r'getElementById\(\s*[\'"]([^\'"]+)[\'"]'),
    "selectors": re.compile(r'querySelector(All)?\(\s*[\'"]([^\'"]+)[\'"]'),
    "classes": re.compile(r'classList\.(add|remove|toggle)\(\s*[\'"]([^\'"]+)[\'"]'),
    "attrs": re.compile(r'(getAttribute|setAttribute|hasAttribute)\(\s*[\'"]([^\'"]+)[\'"]'),
    "dataset": re.compile(r'dataset\.([a-zA-Z0-9_]+)'),
}

JINJA_RX = re.compile(r"\{\{.*?\}\}")

def normalize(val: str) -> str:
    val = JINJA_RX.sub("<TEMPLATE_VAR>", val)
    return val.strip()

def main():
    out = defaultdict(set)

    for d in JS_DIRS:
        for js in Path(d).rglob("*.js"):
            text = js.read_text(errors="ignore")
            for key, rx in PATTERNS.items():
                for m in rx.findall(text):
                    value = m[-1] if isinstance(m, tuple) else m
                    out[key].add(normalize(value))

    print("# ===============================")
    print("# FutureFunded JS DOM CONTRACT")
    print("# ===============================\n")

    if out["ids"]:
        print("# IDs")
        for v in sorted(out["ids"]):
            print(f"#{v}")

    if out["classes"]:
        print("\n# Classes")
        for v in sorted(out["classes"]):
            print(f".{v}")

    if out["selectors"]:
        print("\n# Raw selectors")
        for v in sorted(out["selectors"]):
            print(v)

    if out["dataset"]:
        print("\n# Data attributes")
        for v in sorted(out["dataset"]):
            print(f"[data-{v.replace('_','-')}]")

    if out["attrs"]:
        print("\n# Attributes")
        for v in sorted(out["attrs"]):
            print(f"[{v}]")

    print("\n# ===============================")
    print("# END JS CONTRACT")
    print("# ===============================")

if __name__ == "__main__":
    main()

