#!/usr/bin/env python3
"""
FutureFunded — Contract Snapshot
- Extracts IDs, data-ff-* attributes, href hash targets, aria-controls targets
- Extracts ffSelectors JSON hooks map (script#ffSelectors)
- Designed to work on Jinja templates by stripping template syntax first.
"""

from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from typing import Dict, Any, List, Set, Tuple

JINJA_BLOCK_RE = re.compile(r"{%.*?%}", re.DOTALL)
JINJA_VAR_RE   = re.compile(r"{{.*?}}", re.DOTALL)
JINJA_CMT_RE   = re.compile(r"{#.*?#}", re.DOTALL)

ID_RE          = re.compile(r'\bid\s*=\s*"([^"]+)"')
CLASS_RE       = re.compile(r'\bclass\s*=\s*"([^"]+)"')
DATA_FF_RE     = re.compile(r'\b(data-ff-[a-z0-9\-_]+)\b', re.IGNORECASE)
HREF_HASH_RE   = re.compile(r'\bhref\s*=\s*"#([^"]+)"')
ARIA_CTRL_RE   = re.compile(r'\baria-controls\s*=\s*"([^"]+)"')

SCRIPT_FFSELECTORS_RE = re.compile(
    r'<script[^>]*\bid\s*=\s*"ffSelectors"[^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)

def strip_jinja(text: str) -> str:
    text = JINJA_CMT_RE.sub("", text)
    text = JINJA_BLOCK_RE.sub("", text)
    # Replace vars with safe placeholder (preserves attribute structure)
    text = JINJA_VAR_RE.sub("X", text)
    return text

def parse_ffselectors(raw_html: str) -> Dict[str, Any]:
    m = SCRIPT_FFSELECTORS_RE.search(raw_html)
    if not m:
        return {"present": False, "hooks": {}}
    body = m.group(1).strip()
    try:
        data = json.loads(body)
        hooks = (data.get("hooks") or data.get("hooks", {}))
        # Your structure is {"hooks": {"openCheckout": "...", ...}}
        hooks_map = data.get("hooks", {}) if isinstance(data.get("hooks"), dict) else {}
        # But you currently have {"hooks": {"openCheckout": ...}} nested under root "hooks"
        if "hooks" in data and isinstance(data["hooks"], dict) and "hooks" in data["hooks"]:
            inner = data["hooks"].get("hooks")
            if isinstance(inner, dict):
                hooks_map = inner
        return {"present": True, "raw": data, "hooks": hooks_map}
    except Exception as e:
        return {"present": True, "error": f"Failed to parse JSON: {e}", "hooks": {}}

def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: ff_contract_snapshot.py <input_template.html> <output_contract.json>")
        return 2

    src = Path(sys.argv[1])
    out = Path(sys.argv[2])

    raw = src.read_text(encoding="utf-8", errors="replace")
    cleaned = strip_jinja(raw)

    ids: Set[str] = set(ID_RE.findall(cleaned))
    data_ff: Set[str] = set(m.group(1).lower() for m in DATA_FF_RE.finditer(cleaned))

    href_hash: Set[str] = set(HREF_HASH_RE.findall(cleaned))
    aria_ctrl: Set[str] = set(ARIA_CTRL_RE.findall(cleaned))

    # Helpful: count must-have singleton nodes
    singleton_counts = {
        "ffConfig_count": cleaned.count('id="ffConfig"'),
        "ffSelectors_count": cleaned.count('id="ffSelectors"'),
    }

    ffselectors = parse_ffselectors(raw)  # parse from RAW (keeps JSON intact)

    contract: Dict[str, Any] = {
        "source": str(src),
        "singletons": singleton_counts,
        "ids": sorted(ids),
        "data_ff_attrs": sorted(data_ff),
        "href_hash_targets": sorted(href_hash),
        "aria_controls_targets": sorted(aria_ctrl),
        "ffSelectors": {
            "present": ffselectors.get("present", False),
            "error": ffselectors.get("error"),
            "hooks": ffselectors.get("hooks", {}),
        },
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(contract, indent=2, sort_keys=True), encoding="utf-8")
    print(f"✅ Wrote contract snapshot: {out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
