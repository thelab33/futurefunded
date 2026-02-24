#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
FutureFunded Flagship — CSS Coverage Audit (v2)
----------------------------------------------
Purpose:
- Tell you what *CSS-relevant* selectors used in HTML/Jinja are not defined in ff.css.
- Default focus: class selectors (ff-* and is-*) because IDs + data-* are usually behavior/anchor hooks.

Key behaviors:
- Filters out template artifacts / invalid tokens (e.g., "COLORS.get(...)", "'Gold'", "100", etc.)
- Treats BEM-ish variants (foo--bar) as "covered-by-base" when foo exists in CSS.
- Optional: generate CSS stub selectors for missing classes so you can fill them fast.

Usage examples:
  python3 tools/audit_css_coverage_v2.py --html app/templates/index.html --css app/static/css/ff.css

  # Scan all templates, but only care about ff-* and is-* classnames:
  python3 tools/audit_css_coverage_v2.py --html app/templates --css app/static/css/ff.css --prefix ff- --prefix is-

  # Emit JSON + CSS stubs:
  python3 tools/audit_css_coverage_v2.py --html app/templates/index.html --css app/static/css/ff.css \
    --json out/ff_coverage.json --stubs out/missing_ff_stubs.css

Notes:
- If you want rg to search for tokens that begin with '--', you must use '--' to end flags:
  rg -n -- "--ff-grad-accent" app/static/css/ff.css
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, List, Dict, Set, Tuple


VALID_TOKEN_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*$")

# Pull class="..." and class='...' (supports newlines)
CLASS_ATTR_RE = re.compile(r"""\bclass\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)
ID_ATTR_RE = re.compile(r"""\bid\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)
DATA_ATTR_RE = re.compile(r"""\b(data-[A-Za-z0-9_-]+)\s*=""", re.IGNORECASE)
ARIA_ATTR_RE = re.compile(r"""\b(aria-[A-Za-z0-9_-]+)\s*=""", re.IGNORECASE)

CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
CSS_SELECTOR_BLOCK_RE = re.compile(r"([^{}]+)\{")  # naive but effective for extracting selector prelude

CSS_CLASS_IN_SELECTOR_RE = re.compile(r"\.([A-Za-z_][A-Za-z0-9_-]*)")
CSS_ID_IN_SELECTOR_RE = re.compile(r"#([A-Za-z_][A-Za-z0-9_-]*)")
CSS_ATTR_IN_SELECTOR_RE = re.compile(r"\[([A-Za-z_][A-Za-z0-9_-]*)")


LAYER_LINE_EXACT = "@layer ff.tokens, ff.base, ff.type, ff.layout, ff.surfaces, ff.controls, ff.pages, ff.utilities;"


@dataclass
class CoverageReport:
    templates_scanned: int
    html_files: List[str]
    css_file: str

    layer_line_count: int

    # Raw
    classes_total: int
    ids_total: int
    data_attrs_total: int
    aria_attrs_total: int

    # Focused (after prefix filtering)
    focused_prefixes: List[str]
    focused_classes_total: int

    # Coverage
    missing_classes: List[str]
    missing_variants_covered_by_base: List[str]
    missing_data_attrs: List[str]
    missing_aria_attrs: List[str]

    # Optional diagnostics
    css_classes_total: int
    css_ids_total: int
    css_attrs_total: int

    # “Nice to know”
    dead_css_classes: List[str]  # in CSS but not in focused HTML set (best-effort)


def _iter_html_files(path: Path) -> List[Path]:
    if path.is_file():
        return [path]
    out: List[Path] = []
    for ext in ("*.html", "*.jinja", "*.j2", "*.htm"):
        out.extend(path.rglob(ext))
    # stable output
    return sorted(set(out))


def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")


def _tokenize_class_value(value: str) -> List[str]:
    # Split on whitespace; keep only valid CSS identifiers
    tokens = re.split(r"\s+", value.strip())
    cleaned: List[str] = []
    for t in tokens:
        t = t.strip()
        if not t:
            continue
        # Strip common junk wrappers
        t = t.strip('"\',')
        # Reject template-y tokens quickly
        if any(x in t for x in ("{", "}", "%", "(", ")", "[", "]", "=", ":", ";", ",")):
            continue
        if not VALID_TOKEN_RE.match(t):
            continue
        cleaned.append(t)
    return cleaned


def _extract_from_html(text: str) -> Tuple[Set[str], Set[str], Set[str], Set[str]]:
    classes: Set[str] = set()
    ids: Set[str] = set()
    data_attrs: Set[str] = set()
    aria_attrs: Set[str] = set()

    for _, raw in CLASS_ATTR_RE.findall(text):
        for tok in _tokenize_class_value(raw):
            classes.add(tok)

    for _, raw in ID_ATTR_RE.findall(text):
        raw = raw.strip()
        raw = raw.strip('"\',')
        if VALID_TOKEN_RE.match(raw):
            ids.add(raw)

    for attr in DATA_ATTR_RE.findall(text):
        data_attrs.add(attr.lower())

    for attr in ARIA_ATTR_RE.findall(text):
        aria_attrs.add(attr.lower())

    return classes, ids, data_attrs, aria_attrs


def _extract_from_css(css_text: str) -> Tuple[Set[str], Set[str], Set[str]]:
    # Remove comments
    css = CSS_COMMENT_RE.sub("", css_text)

    css_classes: Set[str] = set()
    css_ids: Set[str] = set()
    css_attrs: Set[str] = set()

    for m in CSS_SELECTOR_BLOCK_RE.finditer(css):
        prelude = m.group(1).strip()
        # Skip @-rule preludes like "@media ..." and "@keyframes ..."
        # But allow selectors inside @media (they'll be captured by later blocks anyway)
        if not prelude or prelude.startswith("@"):
            continue

        # Collect from selector text only (prelude)
        for c in CSS_CLASS_IN_SELECTOR_RE.findall(prelude):
            css_classes.add(c)
        for i in CSS_ID_IN_SELECTOR_RE.findall(prelude):
            css_ids.add(i)
        for a in CSS_ATTR_IN_SELECTOR_RE.findall(prelude):
            css_attrs.add(a.lower())

    return css_classes, css_ids, css_attrs


def _apply_prefix_filter(items: Set[str], prefixes: List[str]) -> Set[str]:
    if not prefixes:
        return set(items)
    out: Set[str] = set()
    for x in items:
        for p in prefixes:
            if x.startswith(p):
                out.add(x)
                break
    return out


def _split_variant(cls: str) -> Tuple[str, str]:
    # foo--bar => base foo, variant foo--bar
    if "--" in cls:
        return cls.split("--", 1)[0], cls
    return cls, ""


def _ensure_parent_dir(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded CSS Coverage Audit (v2)")
    ap.add_argument("--html", required=True, help="HTML/Jinja file or directory to scan")
    ap.add_argument("--css", required=True, help="CSS file to check (ff.css)")
    ap.add_argument("--prefix", action="append", default=[], help="Class prefix to include (repeatable). Default: ff-, is-")
    ap.add_argument("--include-ids", action="store_true", help="Also report missing IDs (off by default; IDs are usually anchors/JS)")
    ap.add_argument("--include-data", action="store_true", help="Also report missing data-* attrs used in CSS selectors (limited utility)")
    ap.add_argument("--include-aria", action="store_true", help="Also report missing aria-* attrs used in CSS selectors (limited utility)")
    ap.add_argument("--json", default="", help="Write full report JSON to this path")
    ap.add_argument("--stubs", default="", help="Write CSS stub selectors for missing classes to this path")
    ap.add_argument("--limit", type=int, default=200, help="Max items to print per section (default 200)")
    args = ap.parse_args()

    prefixes = args.prefix[:] if args.prefix else ["ff-", "is-"]

    html_path = Path(args.html)
    css_path = Path(args.css)

    html_files = _iter_html_files(html_path)
    if not html_files:
        raise SystemExit(f"No templates found at: {html_path}")

    html_classes: Set[str] = set()
    html_ids: Set[str] = set()
    html_data: Set[str] = set()
    html_aria: Set[str] = set()

    for f in html_files:
        text = _read_text(f)
        c, i, d, a = _extract_from_html(text)
        html_classes |= c
        html_ids |= i
        html_data |= d
        html_aria |= a

    css_text = _read_text(css_path)
    layer_line_count = css_text.count(LAYER_LINE_EXACT)

    css_classes, css_ids, css_attrs = _extract_from_css(css_text)

    # Focus on likely styling hooks
    focused_html_classes = _apply_prefix_filter(html_classes, prefixes)

    # Compare classes
    missing_classes_all = sorted(focused_html_classes - css_classes)

    missing_variants: List[str] = []
    truly_missing: List[str] = []

    for cls in missing_classes_all:
        base, variant = _split_variant(cls)
        if variant and base in css_classes:
            missing_variants.append(cls)
        else:
            truly_missing.append(cls)

    # data/aria: only meaningful if CSS uses attribute selectors like [data-ff-*] etc.
    # We'll compare HTML attributes to attributes referenced in CSS selectors.
    # For CSS attrs, we store only the attribute key (without "data-" wrapper if inside [data-...]) — so normalize.
    # Example: CSS selector [data-ff-theme-toggle] => attr "data-ff-theme-toggle"
    css_attr_keys = set(css_attrs)

    missing_data: List[str] = []
    missing_aria: List[str] = []

    if args.include_data:
        # Only data-* attrs that appear in CSS selectors matter.
        for da in sorted(html_data):
            if da.lower() in css_attr_keys:
                continue
            # If CSS never references it, don't call it "missing" — it's a JS hook, not a CSS hook.
        # Instead: show which HTML data-* attrs are referenced nowhere in CSS (informational).
        missing_data = sorted({d for d in html_data if d.lower() in {d.lower() for d in html_data} and d.lower() not in css_attr_keys})

    if args.include_aria:
        missing_aria = sorted({a for a in html_aria if a.lower() not in css_attr_keys})

    dead_css_classes = sorted(css_classes - focused_html_classes)

    report = CoverageReport(
        templates_scanned=len(html_files),
        html_files=[str(p) for p in html_files],
        css_file=str(css_path),

        layer_line_count=layer_line_count,

        classes_total=len(html_classes),
        ids_total=len(html_ids),
        data_attrs_total=len(html_data),
        aria_attrs_total=len(html_aria),

        focused_prefixes=prefixes,
        focused_classes_total=len(focused_html_classes),

        missing_classes=truly_missing,
        missing_variants_covered_by_base=missing_variants,
        missing_data_attrs=missing_data if args.include_data else [],
        missing_aria_attrs=missing_aria if args.include_aria else [],

        css_classes_total=len(css_classes),
        css_ids_total=len(css_ids),
        css_attrs_total=len(css_attrs),

        dead_css_classes=dead_css_classes[: max(0, min(len(dead_css_classes), 500))],
    )

    # Console report
    print("\nFutureFunded Flagship — CSS Coverage Audit (v2)")
    print("------------------------------------------------")
    print(f"Templates scanned: {report.templates_scanned}")
    print(f"CSS: {report.css_file}")
    print(f"Layer line count: {report.layer_line_count} (expected 1)\n")

    print("HTML counts (raw):")
    print(f"  - classes_total: {report.classes_total}")
    print(f"  - ids_total: {report.ids_total}")
    print(f"  - data_attrs_total: {report.data_attrs_total}")
    print(f"  - aria_attrs_total: {report.aria_attrs_total}\n")

    print("Focused class filter:")
    print(f"  - prefixes: {', '.join(prefixes)}")
    print(f"  - focused_classes_total: {report.focused_classes_total}\n")

    print("CSS selector inventory (best-effort):")
    print(f"  - css_classes_total: {report.css_classes_total}")
    print(f"  - css_ids_total: {report.css_ids_total}")
    print(f"  - css_attrs_total: {report.css_attrs_total}\n")

    if report.missing_classes:
        print(f"== Missing classes (needs CSS) ({len(report.missing_classes)}) ==")
        for x in report.missing_classes[: args.limit]:
            print(f"  - {x}")
        if len(report.missing_classes) > args.limit:
            print(f"  … +{len(report.missing_classes) - args.limit} more (use --limit)")
        print()
    else:
        print("== Missing classes (needs CSS) (0) ==\n")

    if report.missing_variants_covered_by_base:
        print(f"== Missing variants (covered-by-base, optional polish) ({len(report.missing_variants_covered_by_base)}) ==")
        for x in report.missing_variants_covered_by_base[: args.limit]:
            print(f"  - {x}")
        if len(report.missing_variants_covered_by_base) > args.limit:
            print(f"  … +{len(report.missing_variants_covered_by_base) - args.limit} more (use --limit)")
        print()

    if args.include_ids:
        # IDs are rarely styled; report is informational
        missing_ids = sorted(html_ids - css_ids)
        print(f"== IDs not referenced in CSS selectors (informational) ({len(missing_ids)}) ==")
        for x in missing_ids[: args.limit]:
            print(f"  - {x}")
        if len(missing_ids) > args.limit:
            print(f"  … +{len(missing_ids) - args.limit} more (use --limit)")
        print()

    if args.include_data:
        print(f"== data-* attrs not referenced in CSS selectors (informational) ({len(report.missing_data_attrs)}) ==")
        for x in report.missing_data_attrs[: args.limit]:
            print(f"  - {x}")
        if len(report.missing_data_attrs) > args.limit:
            print(f"  … +{len(report.missing_data_attrs) - args.limit} more (use --limit)")
        print()

    if args.include_aria:
        print(f"== aria-* attrs not referenced in CSS selectors (informational) ({len(report.missing_aria_attrs)}) ==")
        for x in report.missing_aria_attrs[: args.limit]:
            print(f"  - {x}")
        if len(report.missing_aria_attrs) > args.limit:
            print(f"  … +{len(report.missing_aria_attrs) - args.limit} more (use --limit)")
        print()

    # Output JSON
    if args.json:
        outp = Path(args.json)
        _ensure_parent_dir(outp)
        outp.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")
        print(f"Wrote JSON report: {outp}")

    # Output CSS stubs
    if args.stubs:
        outp = Path(args.stubs)
        _ensure_parent_dir(outp)

        lines: List[str] = []
        lines.append("/* Auto-generated CSS stubs — fill these in or merge into ff.css */")
        lines.append("/* Generated by tools/audit_css_coverage_v2.py */\n")

        # Suggest grouping by likely component
        def group_key(c: str) -> str:
            for k in ("ff-theme", "ff-tabs", "ff-topbar", "ff-sheet", "ff-modal", "ff-drawer", "ff-hero", "ff-impact", "ff-sponsor", "ff-footer", "ff-faq"):
                if c.startswith(k):
                    return k
            return "misc"

        missing_for_stubs = report.missing_classes + report.missing_variants_covered_by_base
        grouped: Dict[str, List[str]] = {}
        for c in missing_for_stubs:
            grouped.setdefault(group_key(c), []).append(c)

        for g in sorted(grouped.keys()):
            lines.append(f"/* === {g} === */")
            for c in sorted(grouped[g]):
                lines.append(f".{c} {{}}")
            lines.append("")

        outp.write_text("\n".join(lines), encoding="utf-8")
        print(f"Wrote CSS stubs: {outp}")

    # A couple of “trap” reminders for your current logs
    print("\nTips:")
    print('  - If rg complains about "--ff-grad-accent", use: rg -n -- "--ff-grad-accent" app/static/css/ff.css')
    print("  - Scan app/templates/index.html first; scanning the whole templates dir pulls in admin/old Tailwind classes.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
