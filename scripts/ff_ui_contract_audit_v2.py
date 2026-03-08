#!/usr/bin/env python3
"""
FutureFunded UI Contract Auditor v2 (flagship)

Fixes:
- Normalizes data hooks consistently (stores as "data-ff-...")
- CSS data hook extraction matches "[data-ff-...]" correctly
- Adds flagship checks (modals, checkout, sections)
- Keeps IDs/hooks reporting, but you can treat them as INFO not FAIL

Outputs:
  artifacts/ui_contract_report_v2.json
"""

from __future__ import annotations

import re
import json
from pathlib import Path
from bs4 import BeautifulSoup
from datetime import datetime

ROOT = Path(".")
HTML_FILE = ROOT / "app/templates/index.html"
CSS_FILE = ROOT / "app/static/css/ff.css"
JS_FILE = ROOT / "app/static/js/ff-app.js"

ARTIFACT = ROOT / "artifacts/ui_contract_report_v2.json"

# ---------- Cleaners ----------
def strip_jinja(text: str) -> str:
    text = re.sub(r"\{\{.*?\}\}", "", text, flags=re.S)
    text = re.sub(r"\{%.*?%\}", "", text, flags=re.S)
    return text

def strip_css_values(css: str) -> str:
    css = re.sub(r"#([0-9a-fA-F]{3,8})", "", css)   # hex colors
    css = re.sub(r"\b\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms)\b", "", css)
    return css

def norm_data_hook(name: str) -> str:
    """
    Normalize to full attribute name "data-ff-..." (not just "ff-...").
    """
    name = (name or "").strip()
    if not name:
        return name
    if name.startswith("data-ff-"):
        return name
    if name.startswith("ff-"):
        return "data-" + name
    if name.startswith("data-"):
        return name
    return name

# ---------- HTML ----------
def parse_html():
    txt = strip_jinja(HTML_FILE.read_text(encoding="utf-8", errors="replace"))
    soup = BeautifulSoup(txt, "html.parser")

    classes, ids, data_hooks = set(), set(), set()

    for el in soup.find_all(True):
        if el.get("class"):
            classes.update(el.get("class"))
        if el.get("id"):
            ids.add(el["id"])
        for attr in el.attrs:
            if attr.startswith("data-ff-"):
                data_hooks.add(norm_data_hook(attr))

    # Flagship overlay detection (HTML-only)
    modals = soup.select(".ff-modal, [data-ff-video-modal], [data-ff-sponsor-modal], #press-video, #sponsor-interest, #terms, #privacy")
    checkout = soup.select("#checkout.ff-sheet, [data-ff-checkout-sheet], #checkout[role='dialog']")

    sections = []
    for el in soup.select("[data-ff-section]"):
        sid = el.get("id") or ""
        sections.append(sid)

    return classes, ids, data_hooks, {
        "modals_count": len(modals),
        "checkout_count": len(checkout),
        "sections": sorted(set(sections)),
    }

# ---------- CSS ----------
def parse_css():
    css = CSS_FILE.read_text(encoding="utf-8", errors="replace")
    css = strip_css_values(css)

    classes = set(re.findall(r"\.([a-zA-Z_-][a-zA-Z0-9_-]*)", css))
    ids = set(re.findall(r"#([a-zA-Z_-][a-zA-Z0-9_-]*)", css))

    # Extract full data-ff-* attribute names from CSS selectors like:
    # [data-ff-open-checkout], [data-ff-open-checkout=""]
    data_hooks = set()
    for m in re.findall(r"\[([a-zA-Z0-9_-]*data-ff-[a-zA-Z0-9_-]+)(?:[\]=\s]|$)", css):
        # Sometimes engines capture "data-ff-..." already; normalize anyway
        # Also handle if stray prefix appears (rare)
        n = m.strip()
        # Ensure it contains data-ff-
        idx = n.find("data-ff-")
        if idx != -1:
            n = n[idx:]
        data_hooks.add(norm_data_hook(n))

    return classes, ids, data_hooks

# ---------- JS ----------
def parse_js():
    js = JS_FILE.read_text(encoding="utf-8", errors="replace")

    classes, ids, data_hooks = set(), set(), set()

    # querySelector / querySelectorAll / closest / matches
    qs = re.findall(r'\b(querySelectorAll|querySelector|closest|matches)\(\s*["\']([^"\']+)["\']\s*\)', js)
    for _, sel in qs:
        classes.update(re.findall(r"\.([a-zA-Z_-][a-zA-Z0-9_-]*)", sel))
        ids.update(re.findall(r"#([a-zA-Z_-][a-zA-Z0-9_-]*)", sel))
        for m in re.findall(r"\[(data-ff-[a-zA-Z0-9_-]+)", sel):
            data_hooks.add(norm_data_hook(m))

    # getElementById("id")
    for mid in re.findall(r'\bgetElementById\(\s*["\']([^"\']+)["\']\s*\)', js):
        ids.add(mid.strip())

    return classes, ids, data_hooks

def main():
    html_classes, html_ids, html_data, html_meta = parse_html()
    css_classes, css_ids, css_data = parse_css()
    js_classes, js_ids, js_data = parse_js()

    report = {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "html_modals_count": html_meta["modals_count"],
            "html_checkout_count": html_meta["checkout_count"],
            "sections": html_meta["sections"],
        },

        # These are the real CSS obligations
        "missing_css_classes": sorted(html_classes - css_classes),

        # IDs/hooks are informational (you rarely want to style every ID/hook)
        "missing_css_ids_info": sorted(html_ids - css_ids),
        "missing_css_data_hooks_info": sorted(html_data - css_data),

        "unused_css_classes": sorted(css_classes - html_classes),
        "unused_css_ids_info": sorted(css_ids - html_ids),

        # JS selector sanity
        "hooks_unused_in_js_info": sorted(html_data - js_data),

        "js_targets_missing_from_html": sorted((js_classes - html_classes) | (js_ids - html_ids)),
    }

    ARTIFACT.parent.mkdir(exist_ok=True)
    ARTIFACT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("✔ FutureFunded UI contract audit v2 complete")
    print("Report:", ARTIFACT)
    print("HTML modals detected:", report["meta"]["html_modals_count"])
    print("HTML checkout detected:", report["meta"]["html_checkout_count"])
    print("Missing CSS classes:", len(report["missing_css_classes"]))

if __name__ == "__main__":
    main()
