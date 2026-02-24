#!/usr/bin/env python3
"""
FutureFunded • Axe A11y Auto-Patch (index.html)
- Hook-safe
- Jinja-safe (no HTML parser; regex with guarded transforms)
- Dry-run by default (writes diff + report)
- --write applies with timestamped backup

Fixes (Axe serious+critical):
1) aria-allowed-attr (critical): aria-pressed not allowed on <a> implicit role=link
   - Adds role="button" to <a> elements that behave like amount buttons (class contains ff-btn + data-ff-amount)
2) aria-prohibited-attr (serious): aria-label on div with no valid role (.ff-sponsorWall)
   - Adds role="list" to sponsor wall container and role="listitem" to items
3) aria-required-children (critical): role=list requires listitem children (.ff-gap-0)
   - Adds role="listitem" to each FAQ <details.ff-faqItem>
4) definition-list (serious): <dl> must only contain dt/dd groups
   - Moves "Set by organizer" helper into the <dd> as a <span>, removing the <p> inside <dl>

Usage:
  # Dry run (default)
  python3 tools/patch_axe_a11y.py app/templates/index.html

  # Apply changes
  python3 tools/patch_axe_a11y.py app/templates/index.html --write
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Tuple


ARTIFACTS_DIR = Path("artifacts/a11y")


@dataclass
class Change:
    name: str
    applied: int
    notes: str


def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def _write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def _timestamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def _unified_diff(a: str, b: str, fromfile: str, tofile: str) -> str:
    a_lines = a.splitlines(keepends=True)
    b_lines = b.splitlines(keepends=True)
    diff = difflib.unified_diff(a_lines, b_lines, fromfile=fromfile, tofile=tofile)
    return "".join(diff)


def _safe_sub(
    text: str,
    pattern: str,
    repl: str | Callable[[re.Match[str]], str],
    flags: int = 0,
    count: int = 0,
) -> Tuple[str, int]:
    rgx = re.compile(pattern, flags)
    out, n = rgx.subn(repl, text, count=count)
    return out, n


def _inject_attr_into_tag(tag: str, attr: str) -> str:
    """
    Insert an attribute string (e.g., ' role="button"') into an opening tag,
    unless an attribute with the same name already exists.
    """
    # attr should be like: ' role="button"' (leading space expected)
    m = re.match(r"\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)=", attr)
    if not m:
        return tag
    attr_name = m.group(1)

    # already present?
    if re.search(rf"\s{re.escape(attr_name)}\s*=", tag):
        return tag

    # inject before closing '>' (or '/>')
    if tag.endswith("/>"):
        return tag[:-2] + attr + " />"
    if tag.endswith(">"):
        return tag[:-1] + attr + ">"
    return tag


def fix_role_button_on_amount_anchors(html: str) -> Tuple[str, int]:
    """
    Add role="button" ONLY to anchors that:
      - are <a ...>
      - class includes 'ff-btn' (CTA-style)
      - have data-ff-amount="..."
    This targets Sponsor-a-player CTAs (where JS may set aria-pressed).
    Avoids rail cards / listitems / nav links.
    """
    pattern = r"<a\b[^>]*\bdata-ff-amount\s*=\s*\"[^\"]+\"[^>]*>"
    rgx = re.compile(pattern, re.IGNORECASE)

    def _repl(m: re.Match[str]) -> str:
        tag = m.group(0)
        # only if it's a button-styled anchor
        if not re.search(r'\bclass\s*=\s*"[^\"]*\bff-btn\b[^\"]*"', tag):
            return tag
        # don't interfere with anchors already carrying a non-button role
        if re.search(r"\srole\s*=\s*\"(listitem|link|navigation|tab)\"", tag, re.IGNORECASE):
            return tag
        return _inject_attr_into_tag(tag, ' role="button"')

    out, n = rgx.subn(_repl, html)
    return out, n


def fix_sponsor_wall_roles(html: str) -> Tuple[str, int]:
    """
    Fix aria-prohibited-attr on .ff-sponsorWall by giving it a valid role.
    Also mark wall items as listitems.
    """
    total = 0

    # Add role="list" to sponsor wall container (preserve other attrs)
    html, n1 = _safe_sub(
        html,
        r'(<div\b[^>]*\bclass\s*=\s*"[^"]*\bff-sponsorWall\b[^"]*"[^>]*\bdata-ff-sponsor-wall\b[^>]*)(>)',
        lambda m: _inject_attr_into_tag(m.group(1) + m.group(2), ' role="list"'),
        flags=re.IGNORECASE,
    )
    total += n1

    # Add role="listitem" to sponsor wall item placeholders
    html, n2 = _safe_sub(
        html,
        r'(<div\b[^>]*\bclass\s*=\s*"[^"]*\bff-sponsorWall__item\b[^"]*"[^>]*)(>)',
        lambda m: _inject_attr_into_tag(m.group(1) + m.group(2), ' role="listitem"'),
        flags=re.IGNORECASE,
    )
    total += n2

    return html, total


def fix_faq_listitems(html: str) -> Tuple[str, int]:
    """
    Fix aria-required-children: role=list should have listitem children.
    Add role="listitem" to each <details ... ff-faqItem ...>.
    """
    pattern = r"(<details\b[^>]*\bclass\s*=\s*\"[^\"]*\bff-faqItem\b[^\"]*\"[^>]*)(>)"

    def _repl(m: re.Match[str]) -> str:
        tag = m.group(1) + m.group(2)
        return _inject_attr_into_tag(tag, ' role="listitem"')

    out, n = re.subn(pattern, _repl, html, flags=re.IGNORECASE)
    return out, n


def fix_hero_kpis_definition_list(html: str) -> Tuple[str, int]:
    """
    Fix definition-list violation in .ff-hero__kpis:
    Move the helper 'Set by organizer' into the <dd> as a <span>.
    We target your exact class string to avoid accidental changes elsewhere.
    """
    pattern = (
        r'(<dd\b[^>]*\bclass\s*=\s*"ff-big ff-num"[^>]*\bdata-ff-goal\s*=\s*""[^>]*>'
        r"\s*\{\{\s*money\(_goal_effective\)\s*\}\}\s*)</dd>\s*"
        r'(<p\b[^>]*\bclass\s*=\s*"ff-help ff-muted ff-mt-1 ff-mb-0"[^>]*>\s*Set by organizer\s*</p>)'
    )

    def _repl(m: re.Match[str]) -> str:
        dd_open_and_value = m.group(1)
        # Replace the <p> with a <span> inside dd, then close dd once.
        return (
            dd_open_and_value
            + '<span class="ff-help ff-muted ff-mt-1 ff-mb-0">Set by organizer</span>'
            + "</dd>"
        )

    out, n = re.subn(pattern, _repl, html, flags=re.IGNORECASE)
    return out, n


def apply_patches(original: str) -> Tuple[str, List[Change]]:
    html = original
    changes: List[Change] = []

    html, n = fix_role_button_on_amount_anchors(html)
    changes.append(Change(
        name='Add role="button" to amount <a.ff-btn data-ff-amount=...>',
        applied=n,
        notes="Targets Sponsor-a-player CTAs to make aria-pressed legal if/when JS sets it."
    ))

    html, n = fix_sponsor_wall_roles(html)
    changes.append(Change(
        name='Sponsor wall roles (container=list, items=listitem)',
        applied=n,
        notes='Adds role="list" to .ff-sponsorWall and role="listitem" to .ff-sponsorWall__item.'
    ))

    html, n = fix_faq_listitems(html)
    changes.append(Change(
        name='FAQ <details.ff-faqItem> role=listitem',
        applied=n,
        notes='Fixes list semantics inside the FAQ list container.'
    ))

    html, n = fix_hero_kpis_definition_list(html)
    changes.append(Change(
        name='Hero KPI <dl> fix: move helper into <dd>',
        applied=n,
        notes='Removes <p> from inside <dl> by converting to <span> inside the dd.'
    ))

    return html, changes


def render_report(path_in: Path, changes: List[Change], wrote: bool, diff_path: Path, backup_path: Path | None) -> str:
    lines: List[str] = []
    lines.append("# Axe A11y Auto-Patch Report\n")
    lines.append(f"- Target file: `{path_in}`\n")
    lines.append(f"- Mode: `{'WRITE' if wrote else 'DRY-RUN'}`\n")
    if backup_path:
        lines.append(f"- Backup: `{backup_path}`\n")
    lines.append(f"- Diff: `{diff_path}`\n")
    lines.append("\n## Applied transforms\n")
    lines.append("| Change | Applied | Notes |\n")
    lines.append("|---|---:|---|\n")
    for c in changes:
        lines.append(f"| {c.name} | {c.applied} | {c.notes} |\n")

    lines.append("\n## Next\n")
    lines.append("Run:\n")
    lines.append("```bash\n")
    lines.append("python3 -m py_compile app/templates/index.html  # optional sanity\n")
    lines.append("xvfb-run -a node tools/axe_gate.mjs https://getfuturefunded.com/ --out artifacts/a11y --fail-under serious --screenshot\n")
    lines.append("```\n")

    return "".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("index_html", help="Path to app/templates/index.html (or equivalent)")
    ap.add_argument("--write", action="store_true", help="Apply changes (otherwise dry-run)")
    args = ap.parse_args()

    path_in = Path(args.index_html)
    if not path_in.exists():
        print(f"❌ File not found: {path_in}", file=sys.stderr)
        return 2

    original = _read_text(path_in)
    patched, changes = apply_patches(original)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = _timestamp()
    diff_path = ARTIFACTS_DIR / "axe_autopatch_index.diff"
    report_path = ARTIFACTS_DIR / "axe_autopatch_report.md"

    diff_text = _unified_diff(
        original,
        patched,
        fromfile=str(path_in),
        tofile=str(path_in) + " (patched)",
    )
    _write_text(diff_path, diff_text)

    backup_path = None
    if args.write:
        backup_path = path_in.with_suffix(path_in.suffix + f".bak.{ts}")
        _write_text(backup_path, original)
        _write_text(path_in, patched)

    report = render_report(path_in, changes, args.write, diff_path, backup_path)
    _write_text(report_path, report)

    if args.write:
        print("✅ Patched index.html successfully.")
        print(f"   - backup: {backup_path}")
        print(f"   - diff:   {diff_path}")
        print(f"   - report: {report_path}")
        print("\nNext:")
        print("  python3 -m py_compile app/templates/index.html  # (optional sanity)")
        print("  xvfb-run -a node tools/axe_gate.mjs https://getfuturefunded.com/ --out artifacts/a11y --fail-under serious")
    else:
        print("ℹ️ Dry-run complete (no files written).")
        print(f"   - diff:   {diff_path}")
        print(f"   - report: {report_path}")
        print("   Re-run with --write to apply.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
