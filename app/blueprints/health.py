from __future__ import annotations

import os
import socket
import time
from datetime import datetime, timezone
from typing import Any, Dict

from flask import Blueprint, current_app, jsonify

# Optional deps
try:
    from redis import Redis  # type: ignore
except Exception:
    Redis = None  # type: ignore

try:
    import stripe  # type: ignore
except Exception:
    stripe = None  # type: ignore

bp = Blueprint("health", __name__)

APP_STARTED_AT = time.time()
HOSTNAME = socket.gethostname()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
STRICT_HEALTH = os.getenv("STRICT_HEALTH", "0").lower() in {"1", "true", "yes", "on"}
DEEP_CHECKS = os.getenv("HEALTH_DEEP_CHECKS", "0").lower() in {"1", "true", "yes", "on"}

BUILD_VERSION = (
    os.getenv("BUILD_VERSION") or os.getenv("RELEASE") or os.getenv("VERSION") or "dev"
)
GIT_SHA = os.getenv("GIT_SHA", "")[:12]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _overall_status(parts: Dict[str, Dict[str, Any]]) -> str:
    states = [p.get("status", "ok") for p in parts.values()]
    if any(s == "fail" for s in states):
        return "fail"
    if any(s == "degraded" for s in states):
        return "degraded"
    return "ok"


def _redis_check() -> Dict[str, Any]:
    if not Redis:
        return {"status": "degraded", "ok": False, "reason": "redis-lib-missing"}
    try:
        r = Redis.from_url(REDIS_URL)  # type: ignore
        r.ping()
        return {"status": "ok", "ok": True, "url": REDIS_URL}
    except Exception as e:
        return {
            "status": "degraded" if not STRICT_HEALTH else "fail",
            "ok": False,
            "url": REDIS_URL,
            "error": str(e),
        }


def _stripe_check() -> Dict[str, Any]:
    key = os.getenv("STRIPE_SECRET_KEY", "") or current_app.config.get(
        "STRIPE_SECRET_KEY", ""
    )
    if not key:
        return {"status": "degraded", "ok": False, "reason": "no-secret-key"}
    if not stripe:
        return {
            "status": "fail" if STRICT_HEALTH else "degraded",
            "ok": False,
            "reason": "stripe-lib-missing",
        }
    status = {
        "status": "ok",
        "ok": True,
        "mode": "live" if ("_live_" in key or key.startswith("sk_live_")) else "test",
    }
    if DEEP_CHECKS:
        try:
            stripe.api_key = key  # type: ignore
            acct = stripe.Account.retrieve()  # type: ignore
            status["account"] = {
                "id": getattr(acct, "id", None),
                "charges_enabled": getattr(acct, "charges_enabled", None),
            }
        except Exception as e:
            status = {
                "status": "degraded" if not STRICT_HEALTH else "fail",
                "ok": False,
                "error": str(e),
            }
    return status


def _summary_payload() -> Dict[str, Any]:
    parts = {
        "redis": _redis_check(),
        "stripe": _stripe_check(),
    }
    overall = _overall_status(parts)
    return {
        "status": overall,
        "version": BUILD_VERSION,
        "git": GIT_SHA,
        "hostname": HOSTNAME,
        "started_at": datetime.fromtimestamp(APP_STARTED_AT, tz=timezone.utc).isoformat(
            timespec="seconds"
        ),
        "uptime_s": int(time.time() - APP_STARTED_AT),
        "now": _now_iso(),
        "parts": parts,
        "flags": {"strict": STRICT_HEALTH, "deep_checks": DEEP_CHECKS},
    }


@bp.get("/health")
def health():
    return jsonify(_summary_payload())


@bp.get("/status")
def status():
    p = _summary_payload()
    return jsonify({"status": p["status"], "version": p["version"], "now": p["now"]})


@bp.get("/ready")
def ready():
    p = _summary_payload()
    code = 200 if p["status"] != "fail" else 503
    return jsonify(p), code


@bp.get("/live")
def live():
    return jsonify(
        {
            "status": "ok",
            "now": _now_iso(),
            "uptime_s": int(time.time() - APP_STARTED_AT),
        }
    )
