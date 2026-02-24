#!/usr/bin/env python3
"""
audit_css_coverage.py — FutureFunded Flagship CSS coverage auditor (HTML/Jinja → ff.css) v2

Key upgrades vs v1:
- Filters junk tokens (Tailwind-like, quoted strings, Jinja fragments)
- Focuses on prefixes you care about (default: ff-, is-)
- Does NOT fail on IDs / data-* by default (optional flags)
- Treats BEM modifiers (e.g. ff-foo--flagship) as "covered by base" by default
- Can restrict scanned templates by substring (e.g. --require data-ff-)

Usage (recommended):
  python3 tools/audit_css_coverage.py --html app/templates --css app/static/css/ff.css --require data-ff-

Index-only (tight):
  python3 tools/audit_css_coverage.py --html app/templates/index.html --css app/static/css/ff.css

If you *really* want to check data-ff coverage:
  python3 tools/audit_css_coverage.py --html app/templates/index.html --css app/static/css/ff.css --check-data --data-prefix data-ff-

If you want strict modifier coverage (ff-foo--flagship must exist explicitly in CSS):
  python3 tools/audit_css_coverage.py --html app/templates/index.html --css app/static/css/ff.css --strict-modifiers
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, List, Set, Tuple


JINJA_MARKERS = ("{{", "}}", "{%", "%}", "{#", "#}")


def looks_dynamic(token: str) -> bool:
    t = (token or "").strip()
    if not t:
        return True
    return any(m in t for m in JINJA_MARKERS)


# Strict CSS identifier-ish token: allow letters/underscore start; then letters/digits/_/-
CSS_IDENT_RX = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*$")


def is_css_ident(token: str) -> bool:
    if not token:
        return False
    if not CSS_IDENT_RX.match(token):
        return False
    # reject tokens that are clearly not “component classes”
    if token in ("and", "or", "not", "true", "false", "none"):
        return False
    return True


def parse_prefixes(raw: str) -> Tuple[str, ...]:
    # "ff-,is-" -> ("ff-","is-")
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    return tuple(parts) if parts else tuple()


def matches_prefix(token: str, prefixes: Tuple[str, ...]) -> bool:
    if not prefixes:
        return True
    return any(token.startswith(p) for p in prefixes)


def split_classes(value: str, prefixes: Tuple[str, ...]) -> List[str]:
    out: List[str] = []
    for tok in (value or "").replace("\n", " ").replace("\t", " ").split(" "):
        tok = tok.strip()
        if not tok:
            continue
        if looks_dynamic(tok):
            continue
        # Strip punctuation that sometimes wraps tokens in templates
        tok = tok.strip('"\',')
        if not is_css_ident(tok):
            continue
        if not matches_prefix(tok, prefixes):
            continue
        out.append(tok)
    return out


class TemplateSelectorParser(HTMLParser):
    def __init__(self, class_prefixes: Tuple[str, ...]) -> None:
        super().__init__(convert_charrefs=True)
        self.class_prefixes = class_prefixes
        self.classes: Set[str] = set()
        self.ids: Set[str] = set()
        self.data_attrs: Set[str] = set()
        self.aria_attrs: Set[str] = set()

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, str | None]]) -> None:
        for k, v in attrs:
            if not k:
                continue
            key = k.strip()

            if key == "class":
                for c in split_classes(v or "", self.class_prefixes):
                    self.classes.add(c)
                continue

            if key == "id":
                if v and not looks_dynamic(v):
                    vv = v.strip().strip('"\',')
                    if is_css_ident(vv):
                        self.ids.add(vv)
                continue

            if key.startswith("data-"):
                if not looks_dynamic(key):
                    self.data_attrs.add(key)
                continue

            if key.startswith("aria-"):
                if not looks_dynamic(key):
                    self.aria_attrs.add(key)
                continue


@dataclass
class AuditResult:
    html_files_scanned: int
    html_files_parsed: int
    css_file: str
    class_prefixes: List[str]
    require_filter: str
    strict_modifiers: bool
    counts: dict
    missing_classes_strict: List[str]
    missing_classes_modifiers_only: List[str]
    missing_ids: List[str]
    missing_data_attrs: List[str]
    layer_line_count: int
    notes: List[str]


def iter_html_files(inputs: List[str]) -> List[Path]:
    files: List[Path] = []
    for raw in inputs:
        p = Path(raw)
        if p.is_dir():
            files.extend(sorted(p.rglob("*.html")))
            continue
        if any(ch in raw for ch in ["*", "?", "["]):
            files.extend(sorted(Path().glob(raw)))
            continue
        files.append(p)

    seen = set()
    out: List[Path] = []
    for f in files:
        try:
            rf = f.resolve()
        except Exception:
            rf = f
        if rf in seen:
            continue
        seen.add(rf)
        out.append(f)
    return out


def load_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        raise RuntimeError(f"Failed to read {path}: {e}") from e


def count_layer_line(css: str) -> int:
    line = r"@layer ff\.tokens, ff\.base, ff\.type, ff\.layout, ff\.surfaces, ff\.controls, ff\.pages, ff\.utilities;"
    return len(re.findall(line, css))


def extract_css_sets(css: str) -> tuple[Set[str], Set[str], Set[str]]:
    # NOTE: This is heuristic but fast + good enough for coverage auditing.
    class_rx = re.compile(r"\.([A-Za-z_][A-Za-z0-9_-]*)")
    id_rx = re.compile(r"#([A-Za-z_][A-Za-z0-9_-]*)")
    data_rx = re.compile(r"\[(data-[A-Za-z0-9_-]+)(?=[\]=\s])")

    css_classes = {m.group(1) for m in class_rx.finditer(css) if is_css_ident(m.group(1))}
    css_ids = {m.group(1) for m in id_rx.finditer(css) if is_css_ident(m.group(1))}
    css_data = {m.group(1) for m in data_rx.finditer(css)}
    return css_classes, css_ids, css_data


def base_of_modifier(cls: str) -> str | None:
    # Treat ff-foo--flagship as covered if ff-foo exists
    if "--" in cls:
        return cls.split("--", 1)[0]
    return None


def print_section(title: str, items: List[str], limit: int) -> None:
    print(f"\n== {title} ({len(items)}) ==")
    if not items:
        print("  (none)")
        return
    show = items[:limit]
    for x in show:
        print(f"  - {x}")
    if len(items) > limit:
        print(f"  … +{len(items) - limit} more (use --limit to change)")


def audit(
    html_paths: List[Path],
    css_path: Path,
    class_prefixes: Tuple[str, ...],
    require_filter: str,
    check_ids: bool,
    id_prefix: str,
    check_data: bool,
    data_prefix: str,
    strict_modifiers: bool,
    include_aria: bool,
) -> AuditResult:
    css = load_text(css_path)
    css_classes, css_ids, css_data = extract_css_sets(css)

    parser = TemplateSelectorParser(class_prefixes=class_prefixes)

    scanned = 0
    parsed = 0

    for hp in html_paths:
        if not hp.exists():
            continue
        scanned += 1
        content = load_text(hp)

        if require_filter and require_filter not in content:
            continue

        parsed += 1
        try:
            parser.feed(content)
        except Exception:
            continue

    # Classes
    missing_strict: List[str] = []
    missing_mod_only: List[str] = []

    for c in sorted(parser.classes):
        if c in css_classes:
            continue
        base = base_of_modifier(c)
        if (not strict_modifiers) and base and (base in css_classes):
            missing_mod_only.append(c)
            continue
        missing_strict.append(c)

    # IDs (optional, usually not required)
    missing_ids: List[str] = []
    if check_ids:
        for i in sorted(parser.ids):
            if id_prefix and not i.startswith(id_prefix):
                continue
            if i not in css_ids:
                missing_ids.append(i)

    # data-* attrs (optional, usually JS hooks)
    missing_data: List[str] = []
    if check_data:
        for a in sorted(parser.data_attrs):
            if data_prefix and not a.startswith(data_prefix):
                continue
            if a not in css_data:
                missing_data.append(a)

    layer_count = count_layer_line(css)

    notes: List[str] = []
    if layer_count != 1:
        notes.append(f"Layer line count is {layer_count} (expected exactly 1).")
    if require_filter:
        notes.append(f"Only parsed templates containing: {require_filter!r}")
    if include_aria and parser.aria_attrs:
        notes.append(f"Found {len(parser.aria_attrs)} aria-* attributes (usually not styled).")
    if not check_ids:
        notes.append("IDs are NOT checked by default (CSS rarely styles IDs). Use --check-ids if needed.")
    if not check_data:
        notes.append("data-* attrs are NOT checked by default (usually JS hooks). Use --check-data if needed.")
    if not strict_modifiers:
        notes.append("Modifier classes (--flagship, etc.) are treated as covered when base class exists. Use --strict-modifiers to require explicit CSS.")

    counts = {
        "classes_total_filtered": len(parser.classes),
        "ids_total_filtered": len(parser.ids),
        "data_attrs_total": len(parser.data_attrs),
        "aria_attrs_total": len(parser.aria_attrs),
        "missing_classes_strict": len(missing_strict),
        "missing_classes_modifiers_only": len(missing_mod_only),
        "missing_ids": len(missing_ids),
        "missing_data_attrs": len(missing_data),
    }

    return AuditResult(
        html_files_scanned=scanned,
        html_files_parsed=parsed,
        css_file=str(css_path),
        class_prefixes=list(class_prefixes),
        require_filter=require_filter,
        strict_modifiers=strict_modifiers,
        counts=counts,
        missing_classes_strict=missing_strict,
        missing_classes_modifiers_only=missing_mod_only,
        missing_ids=missing_ids,
        missing_data_attrs=missing_data,
        layer_line_count=layer_count,
        notes=notes,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", nargs="+", required=True, help="HTML/Jinja file(s), directory, or glob(s)")
    ap.add_argument("--css", required=True, help="Path to ff.css")

    ap.add_argument("--prefixes", default="ff-,is-", help="Comma-separated class prefixes to audit (default: ff-,is-)")
    ap.add_argument("--require", default="",
                    help="Only parse templates whose content contains this substring (e.g. data-ff-)")

    ap.add_argument("--strict-modifiers", action="store_true",
                    help="Require explicit CSS for modifier classes (e.g. ff-foo--flagship)")

    ap.add_argument("--check-ids", action="store_true", help="Also audit IDs (#id) against CSS (off by default)")
    ap.add_argument("--id-prefix", default="ff", help="If --check-ids, only consider IDs starting with this prefix (default: ff)")

    ap.add_argument("--check-data", action="store_true", help="Also audit data-* attrs against CSS (off by default)")
    ap.add_argument("--data-prefix", default="data-ff-", help="If --check-data, only consider data-* attrs with this prefix (default: data-ff-)")

    ap.add_argument("--include-aria", action="store_true", help="Include aria-* counts/notes")

    ap.add_argument("--limit", type=int, default=120, help="Max items to print per section")
    ap.add_argument("--json", default="", help="Write JSON report to this path (optional)")

    args = ap.parse_args()

    html_files = iter_html_files(args.html)
    css_path = Path(args.css)

    if not html_files:
        print("No HTML files found from --html inputs.", file=sys.stderr)
        return 1
    if not css_path.exists():
        print(f"CSS file not found: {css_path}", file=sys.stderr)
        return 1

    prefixes = parse_prefixes(args.prefixes)

    res = audit(
        html_paths=html_files,
        css_path=css_path,
        class_prefixes=prefixes,
        require_filter=args.require,
        check_ids=args.check_ids,
        id_prefix=args.id_prefix,
        check_data=args.check_data,
        data_prefix=args.data_prefix,
        strict_modifiers=args.strict_modifiers,
        include_aria=args.include_aria,
    )

    print("\nFutureFunded Flagship — CSS Coverage Audit (v2)")
    print("----------------------------------------------")
    print(f"Templates scanned: {res.html_files_scanned}")
    print(f"Templates parsed : {res.html_files_parsed}")
    print(f"CSS: {res.css_file}")
    print(f"Class prefixes: {', '.join(res.class_prefixes) if res.class_prefixes else '(none)'}")
    print(f"Require filter: {res.require_filter!r}" if res.require_filter else "Require filter: (none)")
    print(f"Layer line count: {res.layer_line_count} (expected 1)")

    print("\nCounts:")
    for k, v in res.counts.items():
        print(f"  - {k}: {v}")

    if res.notes:
        print("\nNotes:")
        for n in res.notes:
            print(f"  - {n}")

    print_section("Missing classes (STRICT: no match in CSS and not covered by base)", res.missing_classes_strict, args.limit)
    print_section("Missing modifier classes ONLY (base exists; add only if you want explicit variants)", res.missing_classes_modifiers_only, args.limit)

    if args.check_ids:
        print_section("Missing IDs (optional)", res.missing_ids, args.limit)
    if args.check_data:
        print_section("Missing data-* attrs (optional)", res.missing_data_attrs, args.limit)

    if args.json:
        outp = Path(args.json)
        outp.parent.mkdir(parents=True, exist_ok=True)
        outp.write_text(json.dumps(asdict(res), indent=2, sort_keys=True), encoding="utf-8")
        print(f"\nWrote JSON report: {outp}")

    missing_any = bool(res.missing_classes_strict or (args.strict_modifiers and res.missing_classes_modifiers_only))
    if args.check_ids and res.missing_ids:
        missing_any = True
    if args.check_data and res.missing_data_attrs:
        missing_any = True

    return 2 if missing_any else 0


if __name__ == "__main__":
    raise SystemExit(main())
