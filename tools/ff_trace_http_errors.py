#!/usr/bin/env python3
"""
FutureFunded — Playwright Trace HTTP Error Extractor (glob + dir safe)
File: tools/ff_trace_http_errors.py

Purpose
- Given one or more Playwright trace.zip files (or glob patterns or directories),
  extract any HTTP responses with status >= N and print URLs.

Usage
  python3 tools/ff_trace_http_errors.py 'test-results/**/trace.zip'
  python3 tools/ff_trace_http_errors.py test-results --min-status 400
  python3 tools/ff_trace_http_errors.py test-results --min-status 404 --show-samples 200
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

RE_URL_STATUS = re.compile(r'"url"\s*:\s*"([^"]+)"[^{}]{0,600}?"status"\s*:\s*(\d{3})', re.IGNORECASE)
TEXT_EXTS = (".trace", ".json", ".txt", ".ndjson", ".log")

@dataclass(frozen=True)
class Hit:
    status: int
    url: str
    source: str

def _iter_text_entries(zf: zipfile.ZipFile) -> Iterable[Tuple[str, str]]:
    for name in zf.namelist():
        ln = name.lower()
        if ln.endswith(TEXT_EXTS) or "trace" in ln or "network" in ln:
            try:
                b = zf.read(name)
            except KeyError:
                continue
            s = b.decode("utf-8", errors="replace")
            if s.strip():
                yield name, s

def _extract_hits_from_text(source_name: str, text: str, min_status: int) -> List[Hit]:
    hits: List[Hit] = []
    for m in RE_URL_STATUS.finditer(text):
        url = m.group(1)
        try:
            status = int(m.group(2))
        except Exception:
            continue
        if status >= min_status:
            hits.append(Hit(status=status, url=url, source=source_name))
    if hits:
        return hits

    # NDJSON fallback
    for line in text.splitlines():
        line = line.strip()
        if not line or (line[0] not in "{["):
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue

        url = None
        status = None
        if isinstance(obj, dict):
            if "url" in obj and "status" in obj:
                url = obj.get("url")
                status = obj.get("status")
            elif "response" in obj and isinstance(obj["response"], dict):
                url = obj["response"].get("url") or obj.get("url")
                status = obj["response"].get("status")
        if url and isinstance(status, int) and status >= min_status:
            hits.append(Hit(status=status, url=str(url), source=source_name))
    return hits

def _expand_inputs(items: List[str]) -> List[Path]:
    out: List[Path] = []

    def add_trace(p: Path):
        if p.is_file() and p.name == "trace.zip":
            out.append(p)

    for raw in items:
        raw = raw.strip()
        if not raw:
            continue

        p = Path(raw)

        # Directory: find trace.zip recursively
        if p.exists() and p.is_dir():
            for z in p.rglob("trace.zip"):
                add_trace(z)
            continue

        # File path
        if p.exists() and p.is_file():
            add_trace(p)
            continue

        # Glob pattern (including quoted patterns from zsh)
        matches = glob.glob(raw, recursive=True)
        for m in matches:
            mp = Path(m)
            if mp.exists() and mp.is_dir():
                for z in mp.rglob("trace.zip"):
                    add_trace(z)
            else:
                add_trace(mp)

    # De-dupe while preserving order
    seen = set()
    uniq: List[Path] = []
    for p in out:
        rp = str(p.resolve())
        if rp not in seen:
            seen.add(rp)
            uniq.append(p)
    return uniq

def _extract_from_trace_zip(trace_zip: Path, min_status: int) -> List[Hit]:
    hits: List[Hit] = []
    with zipfile.ZipFile(trace_zip, "r") as zf:
        for name, txt in _iter_text_entries(zf):
            hits.extend(_extract_hits_from_text(name, txt, min_status))
    return hits

def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", help="trace.zip path(s), glob pattern(s), or directories")
    ap.add_argument("--min-status", type=int, default=400, help="Only show responses with status >= this. Default 400.")
    ap.add_argument("--show-samples", type=int, default=120, help="Max lines to print per trace. Default 120.")
    args = ap.parse_args(argv)

    traces = _expand_inputs(args.inputs)
    if not traces:
        print("[ff-trace] ❌ No trace.zip files found from inputs.", file=sys.stderr)
        return 2

    overall_hits: List[Tuple[Path, List[Hit]]] = []

    for t in traces:
        try:
            hits = _extract_from_trace_zip(t, args.min_status)
            overall_hits.append((t, hits))
        except zipfile.BadZipFile:
            print(f"[ff-trace] ❌ not a zip file: {t}", file=sys.stderr)

    any_printed = False
    for trace_path, hits in overall_hits:
        print(f"\n[ff-trace] trace: {trace_path}")
        if not hits:
            print("[ff-trace] ⚠️  No >=min-status responses detected in trace text entries.")
            continue

        uniq: Dict[Tuple[int, str], Hit] = {}
        for h in hits:
            uniq[(h.status, h.url)] = h

        ordered = sorted(uniq.values(), key=lambda h: (h.status, h.url))
        print(f"[ff-trace] found {len(ordered)} unique HTTP errors (status >= {args.min_status})")

        n = min(len(ordered), max(1, args.show_samples))
        for h in ordered[:n]:
            print(f"{h.status}  {h.url}")
        if len(ordered) > n:
            print(f"... (+{len(ordered)-n} more)")

        bad404 = [h for h in ordered if h.status == 404]
        if bad404:
            print("\n[ff-trace] 404 summary:")
            for h in bad404[:min(30, len(bad404))]:
                print(f"404  {h.url}")
            if len(bad404) > 30:
                print(f"... (+{len(bad404)-30} more)")
        any_printed = True

    return 0 if any_printed else 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
