from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
TENANTS_JSON = BASE_DIR / "app" / "data" / "tenants.json"

@lru_cache(maxsize=1)
def _load_raw() -> Dict[str, Any]:
    if not TENANTS_JSON.is_file():
        return {}
    try:
        return json.loads(TENANTS_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {}

def get_tenant(slug: str) -> Optional[Dict[str, Any]]:
    slug = (slug or "").strip().lower()
    data = _load_raw()
    t = data.get(slug)
    if isinstance(t, dict):
        t = dict(t)
        t.setdefault("slug", slug)
        return t
    return None
