#!/usr/bin/env python3
"""
FutureFunded — Hook/ID/Style/Inline-Event Manifest Generator

Generates a manifest for app/templates/index.html including:
- IDs (#id)
- Classes (.class)
- data-ff-* hooks ([data-ff-...])
- aria-* and role attributes
- href hash targets (#checkout, #sponsor-interest, etc.)
- inline styles (style="")
- inline event handlers (onclick="", onload="", on*="")  <-- these should be 0 in CSP-safe builds

Outputs:
- manifest.json (machine-friendly)
- manifest.md   (human-friendly summary + checklists)

Usage:
  python3 tools/ff_manifest_index.py \
    --input app/templates/index.html \
    --outdir artifacts/manifest

Exit codes:
  0 = success
  2 = input file missing
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple


DATA_FF_RE = re.compile(r"^data-ff-[a-z0-9][a-z0-9\-]*$", re.IGNORECASE)
ARIA_RE = re.compile(r"^aria-[a-z0-9_\-]+$", re.IGNORECASE)
ON_EVENT_RE = re.compile(r"^on[a-z0-9]+$", re.IGNORECASE)


def sha256_bytes(b: bytes) -> str:
    h = hashlib.sha256()
    h.update(b)
    return h.hexdigest()


def read_text(path: str) -> Tuple[str, bytes]:
    with open(path, "rb") as f:
        raw = f.read()
    # tolerate weird encodings; force decode
    txt = raw.decode("utf-8", errors="replace")
    return txt, raw


def line_excerpt(text: str, lineno_1based: int, max_len: int = 220) -> str:
    lines = text.splitlines()
    if 1 <= lineno_1based <= len(lines):
        s = lines[lineno_1based - 1].rstrip("\n")
        if len(s) > max_len:
            return s[: max_len - 1] + "…"
        return s
    return ""


@dataclass
class Finding:
    kind: str                     # e.g., "id", "class", "data-ff", "aria", "role", "href-hash", "inline-style", "inline-event"
    value: str                    # e.g., "checkout", "ff-btn", "data-ff-open-checkout", "aria-controls=checkout"
    tag: str                      # element tag
    lineno: int                   # 1-based
    col: int                      # 0-based
    attrs: Dict[str, str]         # raw attrs (stringified)
    excerpt: str                  # source line excerpt


class ManifestHTMLParser(HTMLParser):
    def __init__(self, source_text: str):
        super().__init__(convert_charrefs=False)
        self.source_text = source_text
        self.findings: List[Finding] = []
        self._script_stack: List[Tuple[int, int]] = []  # (lineno, col)
        self.inline_script_blocks: List[Dict[str, Any]] = []
        self.inline_style_blocks: List[Dict[str, Any]] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        lineno, col = self.getpos()
        attr_map: Dict[str, str] = {}
        for k, v in attrs:
            if k is None:
                continue
            attr_map[str(k)] = "" if v is None else str(v)

        excerpt = line_excerpt(self.source_text, lineno)

        # id
        if "id" in attr_map and attr_map["id"].strip():
            self.findings.append(Finding(
                kind="id",
                value=attr_map["id"].strip(),
                tag=tag,
                lineno=lineno,
                col=col,
                attrs=attr_map,
                excerpt=excerpt,
            ))

        # classes
        if "class" in attr_map and attr_map["class"].strip():
            classes = [c for c in re.split(r"\s+", attr_map["class"].strip()) if c]
            for c in classes:
                self.findings.append(Finding(
                    kind="class",
                    value=c,
                    tag=tag,
                    lineno=lineno,
                    col=col,
                    attrs=attr_map,
                    excerpt=excerpt,
                ))

        # data-ff-*
        for k, v in attr_map.items():
            if DATA_FF_RE.match(k):
                self.findings.append(Finding(
                    kind="data-ff",
                    value=k,  # include key; value is often empty
                    tag=tag,
                    lineno=lineno,
                    col=col,
                    attrs=attr_map,
                    excerpt=excerpt,
                ))

        # aria-* + role
        if "role" in attr_map and attr_map["role"].strip():
            self.findings.append(Finding(
                kind="role",
                value=attr_map["role"].strip(),
                tag=tag,
                lineno=lineno,
                col=col,
                attrs=attr_map,
                excerpt=excerpt,
            ))
        for k, v in attr_map.items():
            if ARIA_RE.match(k):
                val = "" if v is None else str(v)
                self.findings.append(Finding(
                    kind="aria",
                    value=f"{k}={val}",
                    tag=tag,
                    lineno=lineno,
                    col=col,
                    attrs=attr_map,
                    excerpt=excerpt,
                ))

        # href hash targets
        href = attr_map.get("href", "")
        if href.startswith("#") and len(href) > 1:
            self.findings.append(Finding(
                kind="href-hash",
                value=href,
                tag=tag,
                lineno=lineno,
                col=col,
                attrs=attr_map,
                excerpt=excerpt,
            ))

        # inline style attribute
        if "style" in attr_map and attr_map["style"].strip():
            self.findings.append(Finding(
                kind="inline-style",
                value=attr_map["style"].strip(),
                tag=tag,
                lineno=lineno,
                col=col,
                attrs=attr_map,
                excerpt=excerpt,
            ))

        # inline event handlers: onclick + any on*
        for k, v in attr_map.items():
            if ON_EVENT_RE.match(k) and k.lower() != "on":  # guard weird attr
                # typical CSP rule: these must be 0
                self.findings.append(Finding(
                    kind="inline-event",
                    value=f"{k}={'' if v is None else v}",
                    tag=tag,
                    lineno=lineno,
                    col=col,
                    attrs=attr_map,
                    excerpt=excerpt,
                ))

        # track inline <script> blocks (no src)
        if tag.lower() == "script":
            # if no src attribute, it's an inline script block
            if not attr_map.get("src"):
                self._script_stack.append((lineno, col))

        # track inline <style> blocks
        if tag.lower() == "style":
            self.inline_style_blocks.append({
                "start": {"lineno": lineno, "col": col},
                "attrs": attr_map,
                "excerpt": excerpt,
            })

    def handle_endtag(self, tag: str) -> None:
        # close inline script stack on </script>
        if tag.lower() == "script" and self._script_stack:
            start = self._script_stack.pop()
            end = self.getpos()
            self.inline_script_blocks.append({
                "start": {"lineno": start[0], "col": start[1]},
                "end": {"lineno": end[0], "col": end[1]},
            })


def build_manifest(source_path: str, source_text: str, source_bytes: bytes, findings: List[Finding], inline_scripts: List[Dict[str, Any]], inline_styles: List[Dict[str, Any]]) -> Dict[str, Any]:
    ids = sorted({f.value for f in findings if f.kind == "id"})
    classes = sorted({f.value for f in findings if f.kind == "class"})
    data_ff = sorted({f.value for f in findings if f.kind == "data-ff"})
    href_hashes = sorted({f.value for f in findings if f.kind == "href-hash"})
    roles = sorted({f.value for f in findings if f.kind == "role"})

    # aria keys + values breakdown
    aria = [f.value for f in findings if f.kind == "aria"]
    aria_keys = sorted({a.split("=", 1)[0] for a in aria})

    # counts
    counts = Counter(f.kind for f in findings)
    event_counts = Counter()
    for f in findings:
        if f.kind == "inline-event":
            ev = f.value.split("=", 1)[0].lower()
            event_counts[ev] += 1

    # selectors you can grep for in CSS/JS
    selector_inventory = {
        "id_selectors": [f"#{i}" for i in ids],
        "class_selectors": [f".{c}" for c in classes],
        "data_ff_selectors": [f"[{k}]" for k in data_ff],
        "hash_targets": href_hashes,
    }

    # group findings by kind for easier review
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for f in findings:
        grouped[f.kind].append(asdict(f))

    # also group data-ff by prefix for sanity (data-ff-open-*, data-ff-close-*, etc.)
    data_ff_groups: Dict[str, List[str]] = defaultdict(list)
    for k in data_ff:
        # prefix = first 3 segments, e.g., data-ff-open, data-ff-close, data-ff-checkout
        parts = k.lower().split("-")
        prefix = "-".join(parts[:3]) if len(parts) >= 3 else k.lower()
        data_ff_groups[prefix].append(k)
    data_ff_groups = {p: sorted(v) for p, v in sorted(data_ff_groups.items(), key=lambda x: x[0])}

    now = datetime.now(timezone.utc).isoformat()

    return {
        "meta": {
            "generated_at_utc": now,
            "source_path": source_path,
            "sha256": sha256_bytes(source_bytes),
            "bytes": len(source_bytes),
        },
        "summary": {
            "counts": dict(counts),
            "inline_event_counts": dict(event_counts),
            "unique": {
                "ids": len(ids),
                "classes": len(classes),
                "data_ff": len(data_ff),
                "aria_keys": len(aria_keys),
                "href_hashes": len(href_hashes),
                "roles": len(roles),
            },
            "csp_red_flags": {
                "inline_event_handlers": counts.get("inline-event", 0),
                "inline_style_attributes": counts.get("inline-style", 0),
                "inline_script_blocks": len(inline_scripts),
                "inline_style_blocks": len(inline_styles),
            },
        },
        "inventory": {
            "ids": ids,
            "classes": classes,
            "data_ff": data_ff,
            "data_ff_grouped": data_ff_groups,
            "aria_keys": aria_keys,
            "roles": roles,
            "href_hashes": href_hashes,
        },
        "selectors": selector_inventory,
        "findings": grouped,
        "inline": {
            "script_blocks": inline_scripts,
            "style_blocks": inline_styles,
        },
    }


def write_json(path: str, obj: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False, sort_keys=False)


def write_md(path: str, manifest: Dict[str, Any]) -> None:
    meta = manifest["meta"]
    summ = manifest["summary"]
    inv = manifest["inventory"]

    def bullet_list(items: List[str], limit: int = 60) -> str:
        if not items:
            return "_(none)_"
        shown = items[:limit]
        s = "\n".join([f"- `{x}`" for x in shown])
        if len(items) > limit:
            s += f"\n- …and {len(items) - limit} more"
        return s

    md = []
    md.append(f"# FutureFunded Manifest — index.html\n")
    md.append(f"- **Source:** `{meta['source_path']}`")
    md.append(f"- **SHA256:** `{meta['sha256']}`")
    md.append(f"- **Bytes:** `{meta['bytes']}`")
    md.append(f"- **Generated (UTC):** `{meta['generated_at_utc']}`\n")

    md.append("## Summary\n")
    md.append("### Counts\n")
    md.append("```json\n" + json.dumps(summ["counts"], indent=2) + "\n```\n")

    md.append("### CSP / Inline Red Flags\n")
    md.append("```json\n" + json.dumps(summ["csp_red_flags"], indent=2) + "\n```\n")
    if summ["csp_red_flags"]["inline_event_handlers"] > 0:
        md.append("> ⚠️ Inline event handlers found. For CSP-safe builds, these should typically be **0**.\n")

    md.append("## Inventory\n")
    md.append("### IDs\n")
    md.append(bullet_list(inv["ids"]) + "\n")

    md.append("### data-ff-* hooks\n")
    # show grouped first for readability
    for prefix, keys in inv["data_ff_grouped"].items():
        md.append(f"**{prefix}** ({len(keys)})\n")
        md.append(bullet_list(keys, limit=30) + "\n")

    md.append("### Classes (sample)\n")
    md.append(bullet_list(inv["classes"], limit=80) + "\n")

    md.append("### Href hash targets\n")
    md.append(bullet_list(inv["href_hashes"]) + "\n")

    md.append("### ARIA keys\n")
    md.append(bullet_list(inv["aria_keys"]) + "\n")

    md.append("## Actionable checks\n")
    md.append("- **Inline events** should be 0 in CSP-safe markup.\n"
              "- **Inline style attributes** should be 0 (prefer CSS classes).\n"
              "- **Hash targets** should resolve to existing IDs.\n")
    md.append("\n## Quick grep helpers\n")
    md.append("```bash\n"
              "# Find inline event handlers\n"
              "rg -n \"\\son[a-zA-Z0-9]+\\s*=\\s*\\\"\" app/templates/index.html\n\n"
              "# Find inline style attributes\n"
              "rg -n \"\\sstyle=\\\"\" app/templates/index.html\n\n"
              "# List data-ff hooks\n"
              "rg -no \"data-ff-[a-z0-9-]+\" app/templates/index.html | sort -u\n"
              "```\n")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate hook/ID/style/onclick manifest for index.html")
    ap.add_argument("--input", default="app/templates/index.html", help="Path to index.html (default: app/templates/index.html)")
    ap.add_argument("--outdir", default="artifacts/manifest", help="Output directory (default: artifacts/manifest)")
    args = ap.parse_args()

    in_path = args.input
    outdir = args.outdir

    if not os.path.isfile(in_path):
        print(f"ERROR: input file not found: {in_path}", file=sys.stderr)
        return 2

    text, raw = read_text(in_path)

    parser = ManifestHTMLParser(text)
    parser.feed(text)
    parser.close()

    manifest = build_manifest(
        source_path=in_path,
        source_text=text,
        source_bytes=raw,
        findings=parser.findings,
        inline_scripts=parser.inline_script_blocks,
        inline_styles=parser.inline_style_blocks,
    )

    os.makedirs(outdir, exist_ok=True)
    json_path = os.path.join(outdir, "manifest.json")
    md_path = os.path.join(outdir, "manifest.md")

    write_json(json_path, manifest)
    write_md(md_path, manifest)

    # Console summary
    red = manifest["summary"]["csp_red_flags"]
    print(f"✅ Wrote: {json_path}")
    print(f"✅ Wrote: {md_path}")
    print("—")
    print(f"IDs: {manifest['summary']['unique']['ids']} | "
          f"Classes: {manifest['summary']['unique']['classes']} | "
          f"data-ff: {manifest['summary']['unique']['data_ff']} | "
          f"Hash targets: {manifest['summary']['unique']['href_hashes']}")
    print(f"Inline events: {red['inline_event_handlers']} | "
          f"Inline styles: {red['inline_style_attributes']} | "
          f"Inline <script>: {red['inline_script_blocks']} | "
          f"Inline <style>: {red['inline_style_blocks']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
