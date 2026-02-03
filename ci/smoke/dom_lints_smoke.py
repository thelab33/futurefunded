#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Dict, List, Tuple

import requests


HEAD_CLOSE_RE = re.compile(r"</head>", re.I)
HEAD_OPEN_RE = re.compile(r"<head\b", re.I)
ID_ATTR_RE = re.compile(r'\bid="([^"]+)"', re.I)


@dataclass
class LintResult:
    path: str
    ok: bool
    head_closings: int
    requires_full_doc: bool
    duplicate_ids: Dict[str, int]
    notes: List[str]


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def fail(msg: str, code: int = 1) -> "NoReturn":
    eprint(f"❌ {msg}")
    raise SystemExit(code)


def ok(msg: str) -> None:
    print(f"✅ {msg}")


def normalize_base(base: str) -> str:
    base = (base or "").strip()
    if not base:
        return "http://localhost:5000"
    return base.rstrip("/")


def fetch_html(base: str, path: str, timeout: float) -> str:
    url = f"{base}{path}"
    try:
        r = requests.get(url, timeout=timeout)
    except requests.RequestException as ex:
        fail(f"{path} → request error: {ex}")

    if r.status_code != 200:
        fail(f"{path} → HTTP {r.status_code}")

    # Keep it simple: treat as text
    return r.text or ""


def head_closings(html: str) -> int:
    return len(HEAD_CLOSE_RE.findall(html))


def looks_like_full_document(html: str) -> bool:
    # Only enforce head rules if a head exists (fragments like /tiers won't)
    return bool(HEAD_OPEN_RE.search(html))


def find_duplicate_ids(html: str) -> Dict[str, int]:
    ids = ID_ATTR_RE.findall(html)
    counts = Counter(ids)
    return {k: v for k, v in counts.items() if v > 1}


def lint_dom(path: str, html: str, strict: bool) -> LintResult:
    notes: List[str] = []

    full_doc = looks_like_full_document(html)
    hc = head_closings(html)

    dup = find_duplicate_ids(html)

    ok_head = True
    if full_doc:
        ok_head = (hc == 1)
        if not ok_head:
            notes.append(f"expected 1 </head>, found {hc}")
    else:
        # Fragment route: we expect 0 head closings typically; don't enforce.
        if strict and hc != 0:
            ok_head = False
            notes.append(f"fragment had </head> count {hc} (strict mode)")

    ok_ids = (len(dup) == 0)
    if dup:
        notes.append(f"duplicate IDs: {len(dup)}")

    ok_all = ok_head and ok_ids
    return LintResult(
        path=path,
        ok=ok_all,
        head_closings=hc,
        requires_full_doc=full_doc,
        duplicate_ids=dup,
        notes=notes,
    )


def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="DOM lint smoke: </head> + duplicate id checks.")
    p.add_argument(
        "paths",
        nargs="*",
        default=[],
        help='Paths to check (default: "/", "/donate", "/tiers")',
    )
    p.add_argument(
        "--base",
        default=os.getenv("BASE", "http://localhost:5000"),
        help="Base URL (env: BASE). Default: http://localhost:5000",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=float(os.getenv("SMOKE_TIMEOUT", "10")),
        help="HTTP timeout seconds (env: SMOKE_TIMEOUT). Default: 10",
    )
    p.add_argument(
        "--strict",
        action="store_true",
        help="Strict mode: fragments must not contain </head> either.",
    )
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    base = normalize_base(args.base)
    paths = args.paths or ["/", "/donate", "/tiers"]

    print(f"↪ Base: {base}")
    print(f"↪ Paths: {', '.join(paths)}")

    results: List[LintResult] = []
    any_bad = False

    for path in paths:
        html = fetch_html(base, path, args.timeout)
        res = lint_dom(path, html, strict=args.strict)
        results.append(res)

        if res.ok:
            ok(f"{path}: DOM OK")
            continue

        any_bad = True
        eprint(f"❌ {path}: DOM lint failed")
        for note in res.notes:
            eprint(f"   - {note}")

        if res.requires_full_doc:
            eprint("   - route looks like a full HTML document (<head> found)")
        else:
            eprint("   - route looks like a fragment (no <head> found)")

        if res.duplicate_ids:
            eprint("   - duplicate IDs detected:")
            for k, v in sorted(res.duplicate_ids.items(), key=lambda kv: (-kv[1], kv[0])):
                eprint(f"     • {k} × {v}")

    if any_bad:
        fail("DOM lint smoke failed. Fix duplicates / head structure in the rendered output.", code=1)

    ok("DOM lint smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

