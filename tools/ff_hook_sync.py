#!/usr/bin/env python3
"""
FutureFunded — Hook Sync + Registry Patch (hook-safe, audit-only)

Reads hook_audit.v2.json and emits:
- ff_css_candidates.txt  (.class/#id, non-templated)
- ff_data_hooks.txt      ([data-ff-*])
- ff_templated_hooks.txt (templated {{...}} / {%...%})
- ff_other_hooks.txt     (everything else)

Optionally:
- emits a no-op Hook Registry CSS file (via --emit-registry)
- patches registry into a target CSS file between markers (via --patch-css)
- computes simple coverage vs CSS file (via --css)

NEW:
- --real-css : compute coverage *excluding* the registry block, so you can see
  what selectors are only present because of the autogen registry.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable, List, Tuple


START_MARK = "/* FF HOOK REGISTRY: START (AUTOGEN) */"
END_MARK   = "/* FF HOOK REGISTRY: END (AUTOGEN) */"


def load_audit(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def split_hooks(hooks: Iterable[str]) -> Tuple[List[str], List[str], List[str], List[str]]:
    css_candidates: List[str] = []
    data_hooks: List[str] = []
    templated: List[str] = []
    other: List[str] = []

    for s in hooks:
        s = (s or "").strip()
        if not s:
            continue

        if "{{" in s or "{%" in s:
            templated.append(s)
            continue

        if s.startswith("[data-ff-"):
            data_hooks.append(s)
            continue

        if s.startswith(".") or s.startswith("#"):
            css_candidates.append(s)
            continue

        other.append(s)

    # Stable output
    css_candidates = sorted(set(css_candidates))
    data_hooks = sorted(set(data_hooks))
    templated = sorted(set(templated))
    other = sorted(set(other))
    return css_candidates, data_hooks, templated, other


def write_list(path: Path, items: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(items) + ("\n" if items else ""), encoding="utf-8")


def make_registry_css(css_candidates: List[str], data_hooks: List[str]) -> str:
    lines = [START_MARK, "@layer ff.utilities {"]

    # Include BOTH classes/ids and data hooks in registry (audit-only).
    for sel in sorted(set(css_candidates + data_hooks)):
        # :where() keeps specificity at 0. Empty rule = no visual change.
        lines.append(f"  :where({sel}){{}}")

    lines.append("}")
    lines.append(END_MARK)
    lines.append("")  # trailing newline
    return "\n".join(lines)


def patch_registry_into_css(target_css_path: Path, registry_block: str) -> None:
    css = target_css_path.read_text(encoding="utf-8", errors="replace")

    if START_MARK in css and END_MARK in css:
        pre = css.split(START_MARK, 1)[0]
        post = css.split(END_MARK, 1)[1]
        new_css = pre.rstrip() + "\n\n" + registry_block + post.lstrip()
    else:
        # Append at end if markers don't exist yet
        new_css = css.rstrip() + "\n\n" + registry_block

    target_css_path.write_text(new_css, encoding="utf-8")


def strip_registry_block(css_text: str) -> str:
    if START_MARK in css_text and END_MARK in css_text:
        pre = css_text.split(START_MARK, 1)[0]
        post = css_text.split(END_MARK, 1)[1]
        return pre + "\n" + post
    return css_text


def coverage_against_css(css_path: Path, selectors: List[str], exclude_registry: bool = False) -> Tuple[List[str], List[str]]:
    css_text = css_path.read_text(encoding="utf-8", errors="replace")
    if exclude_registry:
        css_text = strip_registry_block(css_text)

    found: List[str] = []
    missing: List[str] = []
    for s in selectors:
        if s in css_text:
            found.append(s)
        else:
            missing.append(s)
    return found, missing


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", required=True, help="Path to hook_audit.v2.json")
    ap.add_argument("--outdir", required=True, help="Output directory for lists")
    ap.add_argument("--emit-registry", default="", help="Write registry CSS to this path (optional)")
    ap.add_argument("--patch-css", default="", help="Patch registry into this CSS file (optional)")
    ap.add_argument("--css", default="", help="CSS file to compute coverage against (optional)")
    ap.add_argument("--real-css", action="store_true", help="Compute coverage excluding registry block (only with --css)")
    args = ap.parse_args()

    audit_path = Path(args.audit)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    d = load_audit(audit_path)

    # Expect: d["unused"]["html_not_in_css"] (matches your jq usage)
    if not (isinstance(d.get("unused"), dict) and isinstance(d["unused"].get("html_not_in_css"), list)):
        raise SystemExit("Audit JSON missing unused.html_not_in_css")

    hooks = d["unused"]["html_not_in_css"]

    css_candidates, data_hooks, templated, other = split_hooks(hooks)

    p_candidates = outdir / "ff_css_candidates.txt"
    p_datahooks  = outdir / "ff_data_hooks.txt"
    p_templated  = outdir / "ff_templated_hooks.txt"
    p_other      = outdir / "ff_other_hooks.txt"

    write_list(p_candidates, css_candidates)
    write_list(p_datahooks, data_hooks)
    write_list(p_templated, templated)
    write_list(p_other, other)

    print("✅ Wrote:")
    print(f"  - {p_candidates}  ({len(css_candidates)} .class/#id)")
    print(f"  - {p_datahooks}      ({len(data_hooks)} [data-ff-*])")
    print(f"  - {p_templated} ({len(templated)} templated)")
    print(f"  - {p_other}     ({len(other)} other)")

    registry = make_registry_css(css_candidates, data_hooks)

    if args.emit_registry:
        reg_path = Path(args.emit_registry)
        reg_path.parent.mkdir(parents=True, exist_ok=True)
        reg_path.write_text(registry, encoding="utf-8")
        print(f"✨ Wrote Hook Registry CSS: {reg_path}")

    if args.patch_css:
        target = Path(args.patch_css)
        patch_registry_into_css(target, registry)
        print(f"🩹 Patched registry into: {target}")

    if args.css:
        css_path = Path(args.css)
        if not css_path.exists():
            raise SystemExit(f"--css file not found: {css_path}")

        found_c, missing_c = coverage_against_css(
            css_path, css_candidates, exclude_registry=args.real_css
        )
        found_d, missing_d = coverage_against_css(
            css_path, data_hooks, exclude_registry=args.real_css
        )

        write_list(outdir / "ff_css_candidates.missing.txt", missing_c)
        write_list(outdir / "ff_data_hooks.missing.txt", missing_d)

        mode = "REAL (excluding registry)" if args.real_css else "FULL (including registry)"
        print(f"📏 Coverage vs CSS [{mode}]:")
        print(f"  - candidates found: {len(found_c)} / {len(css_candidates)}")
        print(f"  - data hooks found: {len(found_d)} / {len(data_hooks)}")
        print(f"  - missing candidates: {outdir / 'ff_css_candidates.missing.txt'}")
        print(f"  - missing data hooks: {outdir / 'ff_data_hooks.missing.txt'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

