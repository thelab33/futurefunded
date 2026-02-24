#!/usr/bin/env python3
import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

DEFAULT_TEMPLATE_ROOT = Path("app/templates")
DEFAULT_CSS_FILES = [Path("app/static/css/ff.css"), Path("app/static/css/ff-compat-overrides.css")]

LAYER_ORDER_LINE = "@layer ff.tokens, ff.base, ff.type, ff.layout, ff.surfaces, ff.controls, ff.pages, ff.utilities;"

# ----------------------------
# Utilities
# ----------------------------
def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")

def _run(cmd: List[str]) -> Tuple[int, str]:
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        return 0, out.strip()
    except subprocess.CalledProcessError as e:
        return e.returncode, (e.output or "").strip()
    except Exception as e:
        return 1, str(e)

def _git_branch() -> str:
    rc, out = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    return out if rc == 0 and out else "(unknown)"

def _git_dirty() -> bool:
    rc, out = _run(["git", "status", "--porcelain"])
    return (rc == 0) and bool(out.strip())

def _iter_template_files(template_roots: List[Path], only_templates: List[Path]) -> List[Path]:
    files: List[Path] = []
    if only_templates:
        for p in only_templates:
            if p.exists() and p.is_file():
                files.append(p)
        return sorted(set(files))
    for root in template_roots:
        if root.exists():
            files.extend(root.rglob("*.html"))
            files.extend(root.rglob("*.jinja"))
            files.extend(root.rglob("*.j2"))
    return sorted(set([p for p in files if p.is_file()]))

def _iter_css_files(css_files: List[Path]) -> List[Path]:
    out: List[Path] = []
    for p in css_files:
        if p.exists() and p.is_file():
            out.append(p)
    return out

# ----------------------------
# Extraction: templates
# ----------------------------
CLASS_ATTR_RE = re.compile(r'\bclass\s*=\s*"([^"]+)"', re.IGNORECASE)
DATA_FF_RE = re.compile(r"\b(data-ff-[a-z0-9_-]+)\b", re.IGNORECASE)
INLINE_STYLE_ATTR_RE = re.compile(r'\bstyle\s*=\s*"[^"]*"', re.IGNORECASE)
STYLE_TAG_RE = re.compile(r"<style\b", re.IGNORECASE)

def extract_classes_from_html(html: str) -> List[str]:
    classes: List[str] = []
    for m in CLASS_ATTR_RE.finditer(html):
        raw = m.group(1).strip()
        if not raw:
            continue
        classes.extend([c for c in raw.split() if c])
    return classes

def extract_data_ff_attrs(html: str) -> Set[str]:
    return set(m.group(1).lower() for m in DATA_FF_RE.finditer(html))

def count_inline_style_attrs(html: str) -> int:
    return len(INLINE_STYLE_ATTR_RE.findall(html))

def has_style_tag(html: str) -> bool:
    return STYLE_TAG_RE.search(html) is not None

# ----------------------------
# Extraction: CSS selectors
# ----------------------------
def css_extract_all_class_selectors(css_text: str) -> Set[str]:
    """
    Capture .class selectors including escaped Tailwind-ish ones:
    .focus\:outline-none   .border-yellow-400\/20
    """
    raw = re.findall(r"\.((?:\\.|[A-Za-z0-9_-])+)", css_text)
    out: Set[str] = set()
    for s in raw:
        out.add(
            s.replace("\\:", ":")
             .replace("\\/", "/")
             .replace("\\.", ".")
        )
    return out

def count_selector_blocks(css_text: str, selector: str) -> int:
    # simple "hotspot" counter: .selector {  (not perfect CSS parsing, but useful)
    pat = re.compile(rf"(?m)^\s*{re.escape(selector)}\s*\{{")
    return len(pat.findall(css_text))

# ----------------------------
# Tailwind-ish detection heuristics
# ----------------------------
TAILWINDISH_PATTERNS = [
    re.compile(r"^(p|m)([trblxy])?-\d+$"),                  # px-3, py-2, mt-4
    re.compile(r"^gap-\d+$"),                               # gap-2
    re.compile(r"^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$"),    # text-sm
    re.compile(r"^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$"),
    re.compile(r"^rounded(-[a-z]+)?$"),                     # rounded-lg, rounded-full (also matches rounded)
    re.compile(r"^w-(full|screen)$"),                       # w-full
    re.compile(r"^(items|justify)-(start|center|end|between|around|evenly)$"),
    re.compile(r"^mx-auto$"),
    re.compile(r"^focus:outline-none$"),
    re.compile(r"^border-[a-z]+-\d+(\/\d+)?$"),             # border-yellow-400/20-ish
]

def is_tailwindish_class(c: str) -> bool:
    for rx in TAILWINDISH_PATTERNS:
        if rx.match(c):
            return True
    # Also flag common variant prefixes if present (sm:, md:, hover:, etc.)
    if ":" in c and not c.startswith("ff-"):
        # e.g. hover:bg..., focus:outline-none
        return True
    if "/" in c and not c.startswith("ff-"):
        # e.g. border-yellow-400/20
        return True
    return False

# ----------------------------
# Location sampling
# ----------------------------
def find_class_locations(file_path: Path, target_class: str, max_hits: int) -> List[str]:
    hits: List[str] = []
    try:
        lines = _read_text(file_path).splitlines()
    except Exception:
        return hits
    needle = target_class
    for i, line in enumerate(lines, start=1):
        if needle in line:
            hits.append(f"{file_path}:{i}: {line.strip()[:200]}")
            if len(hits) >= max_hits:
                break
    return hits

def find_inline_style_locations(file_path: Path, max_hits: int) -> List[str]:
    hits: List[str] = []
    try:
        lines = _read_text(file_path).splitlines()
    except Exception:
        return hits
    for i, line in enumerate(lines, start=1):
        if 'style="' in line.lower():
            hits.append(f"{file_path}:{i}: {line.strip()[:200]}")
            if len(hits) >= max_hits:
                break
    return hits

# ----------------------------
# Utility shims generator (NO Tailwind framework)
# ----------------------------
UTILITY_SHIMS: Dict[str, str] = {
    "items-center": "align-items: center;",
    "justify-center": "justify-content: center;",
    "w-full": "width: 100%;",
    "mx-auto": "margin-left: auto; margin-right: auto;",
    "gap-2": "gap: 0.5rem;",
    "px-3": "padding-left: 0.75rem; padding-right: 0.75rem;",
    "px-4": "padding-left: 1rem; padding-right: 1rem;",
    "py-2": "padding-top: 0.5rem; padding-bottom: 0.5rem;",
    "text-sm": "font-size: 0.875rem; line-height: 1.25rem;",
    "text-xs": "font-size: 0.75rem; line-height: 1rem;",
    "font-semibold": "font-weight: 600;",
    "font-bold": "font-weight: 700;",
    "font-extrabold": "font-weight: 800;",
    "rounded-lg": "border-radius: 0.5rem;",
    "rounded-xl": "border-radius: 0.75rem;",
    "rounded-full": "border-radius: 9999px;",
    # escaped-style utility names still compile as class selectors when escaped in CSS
    "focus:outline-none": "outline: none; box-shadow: none;",
    "border-yellow-400/20": "border-color: rgba(250, 204, 21, 0.20);",
}

def generate_shims_css(classes: List[str]) -> str:
    # Generate only for known utilities (keeps it tight)
    uniq = []
    seen = set()
    for c in classes:
        if c in UTILITY_SHIMS and c not in seen:
            uniq.append(c)
            seen.add(c)

    lines = []
    lines.append("@layer ff.utilities {")
    lines.append("  /* Legacy utility shims (NO Tailwind framework). Remove after template cleanup. */")
    for c in uniq:
        decl = UTILITY_SHIMS[c]
        if ":" in c or "/" in c:
            # escape for valid CSS selector
            sel = "." + c.replace(":", "\\:").replace("/", "\\/")
        else:
            sel = "." + c
        lines.append(f"  {sel} {{ {decl} }}")
    lines.append("}")
    return "\n".join(lines)

# ----------------------------
# Main
# ----------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded Go-Live Preflight — audit selectors, duplicates, and Tailwind-ish residue.")
    ap.add_argument("--templates", action="append", default=[], help="Template root(s) to scan (default: app/templates).")
    ap.add_argument("--only-template", action="append", default=[], help="Scan only this template file (repeatable).")
    ap.add_argument("--css", action="append", default=[], help="CSS file(s) to scan (repeatable).")
    ap.add_argument("--show-tailwind-locs", action="store_true", help="Print file:line samples for top Tailwind-ish offenders.")
    ap.add_argument("--show-inline-style-locs", action="store_true", help="Print file:line samples where style=\"...\" occurs.")
    ap.add_argument("--max-samples", type=int, default=6, help="Max file:line samples per offender.")
    ap.add_argument("--generate-utility-shims", action="store_true", help="Print a CSS shim block for common utilities detected.")
    args = ap.parse_args()

    template_roots = [Path(p) for p in args.templates] if args.templates else [DEFAULT_TEMPLATE_ROOT]
    only_templates = [Path(p) for p in args.only_template] if args.only_template else []
    css_files = [Path(p) for p in args.css] if args.css else DEFAULT_CSS_FILES

    tpl_files = _iter_template_files(template_roots, only_templates)
    css_paths = _iter_css_files(css_files)

    info: List[str] = []
    warns: List[str] = []
    errs: List[str] = []

    info.append(f"Git branch: {_git_branch()}")
    if _git_dirty():
        warns.append("Working tree is DIRTY (uncommitted changes). This can confuse deploys.")

    # Read templates
    all_classes: List[str] = []
    all_data_ff: Set[str] = set()
    inline_style_count = 0
    style_tag_found = False

    for f in tpl_files:
        html = _read_text(f)
        all_classes.extend(extract_classes_from_html(html))
        all_data_ff |= extract_data_ff_attrs(html)
        inline_style_count += count_inline_style_attrs(html)
        if has_style_tag(html):
            style_tag_found = True

    # Read CSS
    css_all = ""
    for p in css_paths:
        css_all += "\n" + _read_text(p)

    defined_css_classes = css_extract_all_class_selectors(css_all) if css_all else set()

    # Layer order sanity
    layer_count = css_all.count(LAYER_ORDER_LINE)
    if layer_count == 1:
        info.append("Layer order line present exactly once.")
    else:
        errs.append(f"Layer order line count is {layer_count} (expected exactly 1).")

    # Duplicate hotspots
    sheet_panels = count_selector_blocks(css_all, ".ff-sheet__panel")
    drawer_panels = count_selector_blocks(css_all, ".ff-drawer__panel")
    if sheet_panels > 1:
        warns.append(f"Duplicate hotspot: .ff-sheet__panel blocks appears {sheet_panels} times (risk of conflicts).")
    if drawer_panels > 1:
        warns.append(f"Duplicate hotspot: .ff-drawer__panel blocks appears {drawer_panels} times (risk of conflicts).")

    # Inline styles warnings
    if inline_style_count > 0:
        warns.append(f"Inline style= attributes found in templates (count={inline_style_count}). CSP style-src-attr could block later.")
    if style_tag_found:
        warns.append("Inline <style> tag detected in templates. CSP may block later without nonces/hashes.")

    # Tailwind-ish residue detection
    tw_counts: Dict[str, int] = {}
    for c in all_classes:
        if is_tailwindish_class(c):
            tw_counts[c] = tw_counts.get(c, 0) + 1

    tw_sorted = sorted(tw_counts.items(), key=lambda x: x[1], reverse=True)
    if tw_sorted:
        # Undefined = likely layout break
        undefined = [(c, n) for (c, n) in tw_sorted if c not in defined_css_classes]
        if undefined:
            top = ", ".join([f"{c}×{n}" for (c, n) in undefined[:18]])
            errs.append(f"Tailwind-ish classes found in templates AND NOT defined in scanned CSS (likely layout breaks): {top}")

        top_any = ", ".join([f"{c}×{n}" for (c, n) in tw_sorted[:18]])
        info.append(f"Tailwind-ish classes detected (top hits): {top_any}")

        if args.show_tailwind_locs and tw_sorted:
            print("\n------------------------------------------------------------------------")
            print("Tailwind-ish class locations (samples)")
            print("------------------------------------------------------------------------")
            # Show locations for top offenders (whether defined or not)
            for cls, cnt in tw_sorted[:10]:
                print(f"\n• {cls} (count={cnt})")
                shown = 0
                for f in tpl_files:
                    locs = find_class_locations(f, cls, max_hits=max(1, args.max_samples - shown))
                    for line in locs:
                        print("  " + line)
                        shown += 1
                        if shown >= args.max_samples:
                            break
                    if shown >= args.max_samples:
                        break

    # Optional: print inline style locations
    if args.show_inline_style_locs and inline_style_count > 0:
        print("\n------------------------------------------------------------------------")
        print("Inline style= locations (samples)")
        print("------------------------------------------------------------------------")
        shown = 0
        for f in tpl_files:
            for line in find_inline_style_locations(f, max_hits=max(1, args.max_samples - shown)):
                print("  " + line)
                shown += 1
                if shown >= args.max_samples:
                    break
            if shown >= args.max_samples:
                break

    # Optional: generate utility shims
    if args.generate_utility_shims and tw_sorted:
        # Use the undefined ones first
        undefined_classes = [c for (c, _) in sorted([(c, n) for (c, n) in tw_sorted if c not in defined_css_classes], key=lambda x: x[1], reverse=True)]
        css_snip = generate_shims_css(undefined_classes)
        if css_snip.strip() != "@layer ff.utilities {\n  /* Legacy utility shims (NO Tailwind framework). Remove after template cleanup. */\n}":
            print("\n------------------------------------------------------------------------")
            print("Suggested CSS shims (paste into ff-compat-overrides.css)")
            print("------------------------------------------------------------------------")
            print(css_snip)
        else:
            info.append("No known utility shims to generate from detected classes.")

    # Report
    print("\n" + "=" * 72)
    print("FutureFunded Go-Live Preflight — RESULTS")
    print("=" * 72)
    for s in info:
        print("ℹ️  " + s)
    for s in warns:
        print("⚠️  " + s)
    for s in errs:
        print("🛑 " + s)
    print("-" * 72)
    print(f"Summary: {len(errs)} errors, {len(warns)} warnings, {len(info)} info")
    print("=" * 72 + "\n")

    # Exit code contract:
    # 0 = clean, 1 = warnings only, 2 = errors
    if errs:
        return 2
    if warns:
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())

