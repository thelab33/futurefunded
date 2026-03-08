from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from uuid import uuid4
from urllib.parse import urlparse

from flask import Blueprint, current_app, request

bp = Blueprint("csp_report", __name__, url_prefix="")

# Persist reports as JSONL (best-effort)
_CSP_JSONL = Path("artifacts") / "csp_reports.jsonl"
_CSP_JSONL.parent.mkdir(parents=True, exist_ok=True)

# -----------------------------------------------------------------------------
# Rate limiting (memory-only, best-effort for multi-worker)
# Default: 30 reports/min per (ip + directive)
# -----------------------------------------------------------------------------
_LIMIT_PER_MIN = 30
_WINDOW_S = 60.0

# key -> (window_start_epoch, count)
_RL: Dict[str, Tuple[float, int]] = {}


def _now() -> float:
    return time.time()


def _first_str(v: Any, max_len: int) -> str:
    s = ""
    try:
        s = str(v or "")
    except Exception:
        s = ""
    s = s.strip()
    if len(s) > max_len:
        s = s[:max_len]
    return s


def _ip() -> str:
    return (
        request.headers.get("CF-Connecting-IP")
        or (request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or "")
        or (request.remote_addr or "")
        or "-"
    )


def _rl_key(ip: str, violated: str) -> str:
    v = (violated or "unknown").strip().lower()
    if len(v) > 120:
        v = v[:120]
    return f"{ip}|{v}"


def _allow_rate(key: str) -> bool:
    """
    Sliding-ish fixed window per key.
    Best-effort only (per-process). Enough to prevent log/file spam.
    """
    try:
        t = _now()
        start, cnt = _RL.get(key, (t, 0))
        if (t - start) >= _WINDOW_S:
            _RL[key] = (t, 1)
            return True
        if cnt >= _LIMIT_PER_MIN:
            # still return 204, but skip writing/logging
            return False
        _RL[key] = (start, cnt + 1)

        # opportunistic cleanup to keep dict small
        if len(_RL) > 5000:
            cutoff = t - (_WINDOW_S * 3)
            for k, (s, _) in list(_RL.items()):
                if s < cutoff:
                    _RL.pop(k, None)
        return True
    except Exception:
        # fail open (never block telemetry path)
        return True


def _append_jsonl(payload: Dict[str, Any]) -> None:
    try:
        _CSP_JSONL.parent.mkdir(parents=True, exist_ok=True)
        with _CSP_JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        # Never fail reporting path
        pass


def _extract_from_report(data: Any) -> Tuple[str, str, str]:
    """
    Returns: (document_url, violated_directive, blocked_url)
    Handles:
      - legacy: {"csp-report": {...}}
      - Reporting API: {"type": "csp-violation", "url": "...", "body": {...}}
      - list[report]
    """
    doc_url = ""
    violated = ""
    blocked = ""

    try:
        # Reporting API can send an array
        if isinstance(data, list) and data:
            # find first CSP-ish object
            for item in data:
                if isinstance(item, dict):
                    data = item
                    break

        if not isinstance(data, dict):
            return ("", "", "")

        # Reporting API style
        if "body" in data and isinstance(data.get("body"), dict):
            body = data.get("body") or {}
            doc_url = _first_str(body.get("documentURL") or data.get("url") or "", 2048)
            violated = _first_str(body.get("effectiveDirective") or body.get("violatedDirective") or "", 200)
            blocked = _first_str(body.get("blockedURL") or body.get("blocked-uri") or "", 2048)
            return (doc_url, violated, blocked)

        # Legacy report-uri style
        rep = data.get("csp-report") if isinstance(data.get("csp-report"), dict) else data
        if isinstance(rep, dict):
            doc_url = _first_str(rep.get("document-uri") or rep.get("documentURL") or "", 2048)
            violated = _first_str(rep.get("violated-directive") or rep.get("effectiveDirective") or "", 200)
            blocked = _first_str(rep.get("blocked-uri") or rep.get("blockedURL") or "", 2048)

        return (doc_url, violated, blocked)
    except Exception:
        return ("", "", "")


def _infer_tenant_from_url(doc_url: str) -> Optional[str]:
    """
    Infer tenant slug from:
      - /team/<slug>
      - /<slug>  (your vanity route)
    Only returns known tenants (if tenants module exists), else returns the parsed slug.
    """
    try:
        u = urlparse(doc_url or "")
        path = (u.path or "").strip("/")
        if not path:
            return None
        parts = [p for p in path.split("/") if p]
        if not parts:
            return None

        slug = None
        if parts[0] == "team" and len(parts) >= 2:
            slug = parts[1]
        else:
            slug = parts[0]

        slug = (slug or "").strip().lower()
        if not slug:
            return None

        # Prefer validated tenant list if available
        try:
            from app.tenants import get_tenant  # type: ignore
            if get_tenant(slug):
                return slug
            return None
        except Exception:
            # If tenants system isn't available, still return slug (best-effort)
            return slug
    except Exception:
        return None


@bp.post("/csp-report")
def csp_report():
    """
    Accept:
      - application/csp-report (legacy report-uri)
      - application/reports+json (Reporting API / report-to)
    Returns 204 always (telemetry endpoint must never fail).
    """
    data: Any = None
    try:
        data = request.get_json(silent=True)
        if data is None:
            raw = request.get_data(cache=False, as_text=True) or ""
            raw_s = raw.strip()
            if raw_s.startswith("{") or raw_s.startswith("["):
                data = json.loads(raw_s)
            else:
                data = {"raw": raw[:4000]}
    except Exception:
        data = {"raw": (request.get_data(cache=False, as_text=True) or "")[:4000]}

    doc_url, violated, blocked = _extract_from_report(data)

    ip = _ip()
    key = _rl_key(ip, violated)
    if not _allow_rate(key):
        return ("", 204)

    # Tenant context:
    # 1) explicit header (best)
    # 2) infer from report doc URL path
    tenant = _first_str(request.headers.get("X-FF-Tenant") or "", 120).lower() or None
    if not tenant:
        tenant = _infer_tenant_from_url(doc_url)

    rid = request.headers.get("X-Request-ID") or uuid4().hex

    payload: Dict[str, Any] = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "rid": rid,
        "ip": ip,
        "ua": _first_str(request.headers.get("User-Agent") or "", 400),
        "content_type": _first_str(request.headers.get("Content-Type") or "", 120),
        "document_url": doc_url,
        "violated_directive": violated,
        "blocked_url": blocked,
        "tenant_slug": tenant,
        "report": data,
    }

    _append_jsonl(payload)
    current_app.logger.warning("CSP_REPORT %s", json.dumps(payload, ensure_ascii=False)[:8000])
    return ("", 204)


@bp.get("/csp-report/recent")
def csp_recent():
    # Optional: set FF_CSP_VIEWER=true to allow inspection in production.
    if (current_app.config.get("ENV") == "production") and (
        str(current_app.config.get("FF_CSP_VIEWER", "")).lower() not in ("1", "true", "yes", "on")
    ):
        return ("Not Found", 404)

    try:
        if not _CSP_JSONL.exists():
            return (json.dumps([]), 200, {"Content-Type": "application/json"})
        lines = _CSP_JSONL.read_text(encoding="utf-8", errors="replace").splitlines()[-50:]
        items = [json.loads(x) for x in lines if x.strip()]
        return (json.dumps(items, ensure_ascii=False), 200, {"Content-Type": "application/json"})
    except Exception:
        return (json.dumps([]), 200, {"Content-Type": "application/json"})
