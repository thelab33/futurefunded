#!/usr/bin/env python3
"""
FutureFunded — Hook Coverage Audit
Find HTML/Jinja classes, ids, and data-ff-* attributes NOT referenced in ff.css.

Usage:
  python tools/ff_audit_hooks.py \
    --templates app/templates \
    --css app/static/css/ff.css

Optional:
  --write tools/ff_audit_report.json
"""

from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple

CLASS_ATTR_RE = re.compile(r'class\s*=\s*["\']([^"\']+)["\']', re.I)
ID_ATTR_RE    = re.compile(r'\bid\s*=\s*["\']([^"\']+)["\']', re.I)
DATAFF_RE     = re.compile(r'\b(data-ff-[a-z0-9_-]+)\b', re.I)

# CSS mentions (rough but effective)
CSS_CLASS_RE  = re.compile(r'(?<![a-zA-Z0-9_-])\.([a-zA-Z_][\w-]*)')
CSS_ID_RE     = re.compile(r'(?<![a-zA-Z0-9_-])#([a-zA-Z_][\w-]*)')
CSS_DATAFF_RE = re.compile(r'\[([dD]ata-ff-[a-z0-9_-]+)\b')

VALID_TOKEN_RE = re.compile(r'^[a-zA-Z_][\w-]*$')

TEMPLATE_EXTS = {".html", ".jinja", ".jinja2", ".j2"}

def iter_template_files(root: Path) -> List[Path]:
  files: List[Path] = []
  for p in root.rglob("*"):
    if p.is_file() and p.suffix.lower() in TEMPLATE_EXTS:
      files.append(p)
  return sorted(files)

def clean_class_tokens(raw: str) -> List[str]:
  # Split on whitespace; discard obvious Jinja fragments
  toks = []
  for t in raw.split():
    t = t.strip()
    if not t:
      continue
    if "{{" in t or "}}" in t or "{%" in t or "%}" in t:
      continue
    if t.startswith(("(", ")", "{", "}", "[", "]")):
      continue
    # Strip trailing punctuation from templated concatenations
    t = t.strip('",\'')
    if VALID_TOKEN_RE.match(t):
      toks.append(t)
  return toks

def extract_from_file(path: Path) -> Tuple[Set[str], Set[str], Set[str], Dict[str, List[int]]]:
  txt = path.read_text(encoding="utf-8", errors="ignore")
  classes: Set[str] = set()
  ids: Set[str] = set()
  dataffs: Set[str] = set()
  # Simple occurrence index (token -> line numbers)
  occ: Dict[str, List[int]] = {}

  lines = txt.splitlines()
  for i, line in enumerate(lines, start=1):
    # data-ff-* attribute names
    for m in DATAFF_RE.finditer(line):
      name = m.group(1).lower()
      dataffs.add(name)
      occ.setdefault(name, []).append(i)

    # ids
    for m in ID_ATTR_RE.finditer(line):
      val = m.group(1).strip()
      if val and VALID_TOKEN_RE.match(val):
        ids.add(val)
        occ.setdefault(f"#{val}", []).append(i)

    # classes
    for m in CLASS_ATTR_RE.finditer(line):
      raw = m.group(1)
      for c in clean_class_tokens(raw):
        classes.add(c)
        occ.setdefault(f".{c}", []).append(i)

  return classes, ids, dataffs, occ

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--templates", default="app/templates", help="Template root folder")
  ap.add_argument("--css", default="app/static/css/ff.css", help="CSS file path")
  ap.add_argument("--write", default="", help="Write JSON report to this path (optional)")
  args = ap.parse_args()

  tmpl_root = Path(args.templates)
  css_path  = Path(args.css)

  if not tmpl_root.exists():
    raise SystemExit(f"Template root not found: {tmpl_root}")
  if not css_path.exists():
    raise SystemExit(f"CSS file not found: {css_path}")

  css_txt = css_path.read_text(encoding="utf-8", errors="ignore")

  css_classes = set(CSS_CLASS_RE.findall(css_txt))
  css_ids     = set(CSS_ID_RE.findall(css_txt))
  css_dataffs = set(n.lower() for n in CSS_DATAFF_RE.findall(css_txt))

  all_classes: Set[str] = set()
  all_ids: Set[str] = set()
  all_dataffs: Set[str] = set()
  occurrences: Dict[str, List[Tuple[str, List[int]]]] = {}

  for f in iter_template_files(tmpl_root):
    classes, ids, dataffs, occ = extract_from_file(f)
    all_classes |= classes
    all_ids |= ids
    all_dataffs |= dataffs
    # Merge occurrence map
    for token, lines in occ.items():
      occurrences.setdefault(token, []).append((str(f), lines))

  missing_classes = sorted([c for c in all_classes if c not in css_classes])
  missing_ids     = sorted([i for i in all_ids if i not in css_ids])
  missing_dataffs = sorted([d for d in all_dataffs if d not in css_dataffs])

  report = {
    "inputs": {
      "templates_root": str(tmpl_root),
      "css": str(css_path),
      "template_files": len(iter_template_files(tmpl_root)),
    },
    "counts": {
      "html_classes": len(all_classes),
      "css_class_mentions": len(css_classes),
      "missing_classes": len(missing_classes),

      "html_ids": len(all_ids),
      "css_id_mentions": len(css_ids),
      "missing_ids": len(missing_ids),

      "html_dataff_attrs": len(all_dataffs),
      "css_dataff_mentions": len(css_dataffs),
      "missing_dataff": len(missing_dataffs),
    },
    "missing": {
      "classes": missing_classes,
      "ids": missing_ids,
      "data_ff_attrs": missing_dataffs,
    },
    # Include a compact pointer map for missing items
    "where": {
      "classes": {c: occurrences.get(f".{c}", []) for c in missing_classes[:120]},
      "ids": {i: occurrences.get(f"#{i}", []) for i in missing_ids[:120]},
      "data_ff_attrs": {d: occurrences.get(d, []) for d in missing_dataffs[:120]},
    }
  }

  print("\n=== FutureFunded Hook Audit ===")
  for k, v in report["counts"].items():
    print(f"{k:>22}: {v}")

  def print_sample(title: str, items: List[str], prefix: str = ""):
    print(f"\n--- {title} (first 80) ---")
    for x in items[:80]:
      print(prefix + x)

  print_sample("Missing classes", missing_classes, ".")
  print_sample("Missing ids", missing_ids, "#")
  print_sample("Missing data-ff-* attrs", missing_dataffs, "")

  if args.write:
    out = Path(args.write)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote JSON report → {out}")

if __name__ == "__main__":
  main()

