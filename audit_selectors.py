#!/usr/bin/env python3
"""
audit_selectors.py (robust)
Usage:
  python audit_selectors.py path/to/index.html
Outputs:
  - index_selectors.json
  - style-audit.css (skeleton)
"""
import sys, json, re
from collections import defaultdict
from bs4 import BeautifulSoup

def load_html(path):
    raw = open(path, "r", encoding="utf-8", errors="replace").read()
    # Try lxml (fast/featureful) and fall back to html.parser if it errors
    try:
        soup = BeautifulSoup(raw, "lxml")
        parser = "lxml"
    except Exception as e:
        print("warning: lxml parser failed:", e, file=sys.stderr)
        print("fallback: using Python's built-in html.parser (more tolerant).", file=sys.stderr)
        soup = BeautifulSoup(raw, "html.parser")
        parser = "html.parser"
    return soup, parser

def extract(html_path):
    soup, parser = load_html(html_path)

    ids = set()
    classes = set()
    data_attrs = defaultdict(set)
    aria_attrs = defaultdict(set)
    roles = set()
    tags = defaultdict(int)
    inline_style_nodes = []
    inline_event_nodes = []
    selector_examples = set()

    for el in soup.find_all(True):
        tag = el.name
        tags[tag] += 1

        if el.has_attr("id"):
            ids.add(el["id"].strip())

        if el.has_attr("class"):
            for c in el["class"]:
                if c and c.strip():
                    classes.add(c.strip())

        for (k, v) in el.attrs.items():
            if k.startswith("data-"):
                # Some attributes are boolean or lists; coerce to string
                data_attrs[k].add(" ".join(v) if isinstance(v, (list, tuple)) else (v if v is not None else ""))
            if k.startswith("aria-"):
                aria_attrs[k].add(" ".join(v) if isinstance(v, (list, tuple)) else (v if v is not None else ""))

        if el.has_attr("role"):
            roles.add(el["role"])

        if el.has_attr("style"):
            inline_style_nodes.append({
                "tag": tag,
                "id": el.get("id"),
                "classes": el.get("class"),
                "style": el.get("style")
            })

        for ev in ("onclick","onchange","oninput","onsubmit","onmouseover","onfocus","onblur"):
            if el.has_attr(ev):
                inline_event_nodes.append({
                    "tag": tag,
                    "id": el.get("id"),
                    "classes": el.get("class"),
                    "event": ev,
                    "code": el.get(ev)
                })

        if el.has_attr("id"):
            selector_examples.add(f"#{el['id'].strip()}")
        if el.has_attr("class"):
            selector_examples.update([f".{c.strip()}" for c in el.get("class",[]) if c.strip()])
            if el.get("class"):
                selector_examples.add(f"{tag}.{el.get('class')[0].strip()}")

    result = {
        "parser_used": parser,
        "ids": sorted(ids),
        "classes": sorted(classes),
        "data_attributes": {k: sorted(list(v)) for k, v in data_attrs.items()},
        "aria_attributes": {k: sorted(list(v)) for k, v in aria_attrs.items()},
        "roles": sorted(list(roles)),
        "tags": dict(sorted(tags.items(), key=lambda x: -x[1])),
        "inline_styles_count": len(inline_style_nodes),
        "inline_events_count": len(inline_event_nodes),
        "inline_styles_examples": inline_style_nodes[:10],
        "inline_event_examples": inline_event_nodes[:10],
        "selector_examples": sorted(selector_examples)[:400]
    }
    return result

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def write_css_skeleton(path, data):
    lines = []
    lines.append("/* style-audit.css — auto-generated skeleton from audit_selectors.py */")
    lines.append("/* Fill these rules in or import into your ff.css */")
    lines.append("\n/* ---- IDs ---- */")
    for idv in data["ids"]:
        lines.append(f"#{idv} {{ /* TODO: style #{idv} */ }}")

    lines.append("\n/* ---- Classes ---- */")
    for cl in data["classes"]:
        lines.append(f".{cl} {{ /* TODO: style .{cl} */ }}")

    lines.append("\n/* ---- Data attributes ---- */")
    for k, vals in data["data_attributes"].items():
        lines.append(f"[{k}] {{ /* TODO: style [{k}] */ }}")
        if len(vals) <= 6 and any(vals):
            for v in vals:
                if v:
                    safe_v = v.replace('"', '\\"')
                    lines.append(f'[{k}="{safe_v}"] {{ /* TODO: style [{k}=\"{safe_v}\"] */ }}')

    lines.append("\n/* ---- ARIA / ROLE helpers ---- */")
    for k in data["aria_attributes"].keys():
        lines.append(f'[{k}] {{ /* maybe for screen readers: {k} */ }}')
    for r in data["roles"]:
        lines.append(f'[role="{r}"] {{ /* role="{r}" */ }}')

    lines.append("\n/* ---- Tag + example selectors ---- */")
    for s in data["selector_examples"][:150]:
        lines.append(f"{s} {{ /* example */ }}")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def main():
    if len(sys.argv) < 2:
        print("Usage: python audit_selectors.py path/to/index.html")
        sys.exit(2)
    html_path = sys.argv[1]
    data = extract(html_path)
    write_json("index_selectors.json", data)
    write_css_skeleton("style-audit.css", data)
    print("Wrote index_selectors.json and style-audit.css")
    print("Parser used:", data.get("parser_used"))
    print("Summary:")
    print(f"  ids: {len(data['ids'])}")
    print(f"  classes: {len(data['classes'])}")
    print(f"  data-attributes: {len(data['data_attributes'])}")
    print(f"  aria attributes: {len(data['aria_attributes'])}")
    print(f"  inline styles: {data['inline_styles_count']}")
    print(f"  inline event handlers: {data['inline_events_count']}")
    print("\nTop tags (by usage):")
    for tag, count in list(data["tags"].items())[:10]:
        print(f"  {tag}: {count}")

if __name__ == "__main__":
    main()

