#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional

INDEX_PATH = Path("app/templates/index.html")

REQUIRED_IDS = {
    "ffConfig",
    "ffSelectors",
    "ffLive",
    "content",
    "home",
    "faq",
    "progress",
    "checkout",
    "sponsor-interest",
    "press-video",
    "terms",
    "privacy",
    "drawer",
    "ffDrawerPanel",
}

JINJA_PATTERNS = [
    re.compile(r"{#.*?#}", re.DOTALL),
    re.compile(r"{%.*?%}", re.DOTALL),
    re.compile(r"{{.*?}}", re.DOTALL),
]


def strip_jinja(text: str) -> str:
    out = text
    for pat in JINJA_PATTERNS:
        out = pat.sub("", out)
    return out


def find_ids(text: str) -> List[str]:
    return re.findall(r'(?<![\w:-])id="([^"]+)"', text)


def parse_attrs(attr_text: str) -> Dict[str, str]:
    attrs: Dict[str, str] = {}
    for m in re.finditer(
        r'([:@A-Za-z0-9_-]+)(?:\s*=\s*"([^"]*)")?',
        attr_text,
        re.DOTALL,
    ):
        key = m.group(1)
        val = m.group(2) if m.group(2) is not None else ""
        attrs[key] = val
    return attrs


def iter_tags(text: str):
    for m in re.finditer(r"<([A-Za-z0-9:-]+)([^>]*)>", text, re.DOTALL):
        tag = m.group(1).lower()
        attrs = parse_attrs(m.group(2))
        yield tag, attrs


def selector_exists(selector: str, text: str) -> bool:
    selector = selector.strip()

    if selector.startswith("#"):
        target = selector[1:]
        return re.search(rf'\bid="{re.escape(target)}"', text) is not None

    # Supports simple selectors like:
    # [data-ff-open-checkout]
    # [data-ff-close-checkout]
    # input[data-ff-team-id][name="team_id"]
    tag_name: Optional[str] = None
    tag_match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*)", selector)
    if tag_match:
        tag_name = tag_match.group(1).lower()

    attr_conditions: List[Tuple[str, Optional[str]]] = []
    for m in re.finditer(r'\[([A-Za-z0-9:_-]+)(?:="([^"]*)")?\]', selector):
        attr_conditions.append((m.group(1), m.group(2)))

    if not attr_conditions and not tag_name:
        return False

    for tag, attrs in iter_tags(text):
        if tag_name and tag != tag_name:
            continue

        ok = True
        for attr, expected in attr_conditions:
            if attr not in attrs:
                ok = False
                break
            if expected is not None and attrs.get(attr) != expected:
                ok = False
                break

        if ok:
            return True

    return False


def extract_ffselectors_json(raw_text: str) -> Dict[str, object]:
    m = re.search(
        r'<script[^>]+id="ffSelectors"[^>]*>(.*?)</script>',
        raw_text,
        re.DOTALL | re.IGNORECASE,
    )
    if not m:
        raise RuntimeError("Could not find #ffSelectors script block.")
    body = m.group(1).strip()
    return json.loads(body)


def main() -> int:
    if not INDEX_PATH.exists():
        print(f"[fail] Missing file: {INDEX_PATH}")
        return 2

    raw = INDEX_PATH.read_text(encoding="utf-8")
    text = strip_jinja(raw)

    ids = find_ids(text)
    duplicate_ids = sorted({x for x in ids if ids.count(x) > 1})
    missing_required_ids = sorted(REQUIRED_IDS - set(ids))

    aria_controls = re.findall(r'\baria-controls="([^"]+)"', text)
    missing_aria_targets = sorted({x for x in aria_controls if x not in set(ids)})

    anchor_targets = re.findall(r'\bhref="#([^"]+)"', text)
    ignore_anchor_targets = {"", "top"}
    missing_anchor_targets = sorted({
        x for x in anchor_targets
        if x not in set(ids) and x not in ignore_anchor_targets
    })

    ffselectors = extract_ffselectors_json(raw)
    hooks = ffselectors.get("hooks", {})
    missing_hook_selectors: Dict[str, str] = {}
    for hook_name, selector in hooks.items():
        if not isinstance(selector, str):
            missing_hook_selectors[hook_name] = f"non-string selector: {selector!r}"
            continue
        if not selector_exists(selector, text):
            missing_hook_selectors[hook_name] = selector

    result = {
        "file": str(INDEX_PATH),
        "id_count": len(ids),
        "unique_id_count": len(set(ids)),
        "duplicate_ids": duplicate_ids,
        "missing_required_ids": missing_required_ids,
        "missing_aria_controls_targets": missing_aria_targets,
        "missing_anchor_targets": missing_anchor_targets,
        "missing_hook_selectors": missing_hook_selectors,
        "ok": not any([
            duplicate_ids,
            missing_required_ids,
            missing_aria_targets,
            missing_anchor_targets,
            missing_hook_selectors,
        ]),
    }

    out_path = Path("artifacts/ff_index_contract_audit.json")
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(json.dumps(result, indent=2))

    if result["ok"]:
      print("\n[pass] index.html contract audit passed")
      return 0

    print(f"\n[fail] contract issues found. See {out_path}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
