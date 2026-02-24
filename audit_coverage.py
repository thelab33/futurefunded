#!/usr/bin/env python3
"""
audit_coverage.py

Usage:
  python audit_coverage.py \
    --selectors index_selectors.json \
    --css app/static/css/ff.css

Outputs:
  - style-coverage.json
  - missing-selectors.css
"""
import re, json, sys, argparse
from pathlib import Path
from collections import defaultdict

def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def load_css(path):
    return Path(path).read_text(encoding="utf-8")

def extract_css_symbols(css_text):
    # best-effort extraction
    # classes
    class_matches = set(re.findall(r'\.([A-Za-z0-9_-]+)', css_text))
    # ids - filter out color hex matches (#fff or #ffffff)
    raw_ids = re.findall(r'#([A-Za-z0-9_-]+)', css_text)
    ids = set([i for i in raw_ids if not re.fullmatch(r'[0-9a-fA-F]{3,6}', i)])
    # data-attributes (simple)
    data_attrs = set(re.findall(r'data-[a-zA-Z0-9_-]+', css_text))
    # attributes selectors like [data-foo="bar"] will also be matched by above
    return {
        "classes": class_matches,
        "ids": ids,
        "data_attrs": data_attrs
    }

def normalize_html_selectors(index_json):
    ids = set(index_json.get("ids", []))
    classes = set(index_json.get("classes", []))
    data_attrs = set(index_json.get("data_attributes", {}).keys())
    # aria & roles not used for styling but keep for info
    aria = set(index_json.get("aria_attributes", {}).keys())
    roles = set(index_json.get("roles", []))
    return {"ids": ids, "classes": classes, "data_attrs": data_attrs, "aria": aria, "roles": roles}

def diff_sets(html_set, css_set):
    present = sorted(list(html_set & css_set))
    missing = sorted(list(html_set - css_set))
    return {"present": present, "missing": missing, "count_html": len(html_set), "count_css": len(css_set)}

def make_css_skeleton(missing):
    # Group into @layer placeholders (user will paste into the correct layer)
    sections = [
        ("/* ---------------- @layer ff.pages (page-level selectors) ---------------- */", missing["classes"] + missing["ids"] + missing["data_attrs"]),
    ]
    lines = []
    lines.append("/* missing-selectors.css — auto-generated skeleton */")
    lines.append("/* Paste these into the appropriate @layer ff.pages / ff.layout / ff.surfaces in app/static/css/ff.css */")
    lines.append("")
    # classes
    if missing["classes"]:
        lines.append("/* ---- Missing classes (HTML -> no CSS) ---- */")
        for c in missing["classes"]:
            lines.append(f".{c} {{ /* TODO: style .{c} */ }}")
        lines.append("")
    # ids
    if missing["ids"]:
        lines.append("/* ---- Missing IDs (HTML -> no CSS) ---- */")
        for i in missing["ids"]:
            lines.append(f"#{i} {{ /* TODO: style #{i} */ }}")
        lines.append("")
    # data attrs
    if missing["data_attrs"]:
        lines.append("/* ---- Missing data-* attributes (HTML -> no CSS) ---- */")
        for d in missing["data_attrs"]:
            lines.append(f'[{d}] {{ /* TODO: style [{d}] */ }}')
        lines.append("")
    # small helper block to avoid accidental duplication
    lines.append("/* End of skeleton */")
    return "\n".join(lines)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selectors", required=True, help="index_selectors.json")
    ap.add_argument("--css", required=True, help="path to ff.css")
    args = ap.parse_args()

    idx = load_json(args.selectors)
    css_text = load_css(args.css)

    css_symbols = extract_css_symbols(css_text)
    html = normalize_html_selectors(idx)

    classes_diff = diff_sets(html["classes"], css_symbols["classes"])
    ids_diff = diff_sets(html["ids"], css_symbols["ids"])
    data_attrs_diff = diff_sets(html["data_attrs"], css_symbols["data_attrs"])

    out = {
        "summary": {
            "html_classes": classes_diff["count_html"],
            "css_classes_found": classes_diff["count_css"],
            "missing_classes": len(classes_diff["missing"]),
            "html_ids": ids_diff["count_html"],
            "css_ids_found": ids_diff["count_css"],
            "missing_ids": len(ids_diff["missing"]),
            "html_data_attrs": data_attrs_diff["count_html"],
            "css_data_attrs_found": data_attrs_diff["count_css"],
            "missing_data_attrs": len(data_attrs_diff["missing"])
        },
        "classes": classes_diff,
        "ids": ids_diff,
        "data_attributes": data_attrs_diff,
        "notes": {
            "extraction_method": "regex best-effort; may miss complex selectors or nested combinators (e.g. .a .b > .c) and attribute value selectors"
        }
    }

    Path("style-coverage.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("WROTE style-coverage.json")

    missing = {"classes": classes_diff["missing"], "ids": ids_diff["missing"], "data_attrs": data_attrs_diff["missing"]}
    skeleton = make_css_skeleton(missing)
    Path("missing-selectors.css").write_text(skeleton, encoding="utf-8")
    print("WROTE missing-selectors.css (skeleton)")

    # Print quick verification commands (ripgrep)
    print("\nQuick verification commands (run in repo root):\n")
    print("  # show missing classes occurrences in HTML")
    print("  rg --no-ignore -n \"class=\\\"[^\\\"]*(" + (")|(".join(missing['classes'][:10]) if missing['classes'] else "NONE") + ")\" app/templates || true\n")
    print("  # show missing ids occurrences in HTML")
    if missing["ids"]:
        print("  rg --no-ignore -n \"id=\\\"(" + "|".join(missing['ids'][:20]) + ")\\\"\" app/templates || true\n")
    print("\nDone.")

if __name__ == "__main__":
    main()

