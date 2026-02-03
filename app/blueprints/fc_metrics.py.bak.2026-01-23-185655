# app/blueprints/fc_metrics.py
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from flask import Blueprint, current_app, jsonify, request

# ──────────────────────────────────────────────────────────────────────────────
# Optional Redis client (degrades gracefully if not installed/unavailable)
try:
    from redis import Redis  # type: ignore
except Exception:  # pragma: no cover
    Redis = None  # type: ignore

bp = Blueprint("fc_metrics", __name__, url_prefix="/api/metrics")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
R: Optional["Redis"] = None
if "redis" in REDIS_URL and "://" in REDIS_URL and Redis:
    try:
        R = Redis.from_url(REDIS_URL)  # type: ignore
    except Exception:
        R = None  # degrade gracefully


# ──────────────────────────────────────────────────────────────────────────────
# Time helpers
def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _week_key(dt: Optional[datetime] = None) -> str:
    dt = dt or _now_utc()
    year, week, _ = dt.isocalendar()
    return f"{int(year)}-W{int(week):02d}"


# ──────────────────────────────────────────────────────────────────────────────
# Safe Redis ops
def _h_incrby(key: str, field: str, amount: int = 1) -> None:
    if not R:
        return
    try:
        R.hincrby(key, field, amount)
    except Exception:
        pass


def _h_incrbyfloat(key: str, field: str, amount: float = 1.0) -> None:
    if not R:
        return
    try:
        R.hincrbyfloat(key, field, float(amount))
    except Exception:
        pass


def _hgetall_safe(key: str) -> Dict[str, str]:
    if not R:
        return {}
    try:
        raw = R.hgetall(key)
        out: Dict[str, str] = {}
        for k, v in raw.items():
            ks = k.decode() if isinstance(k, (bytes, bytearray)) else str(k)
            vs = v.decode() if isinstance(v, (bytes, bytearray)) else str(v)
            out[ks] = vs
        return out
    except Exception:
        return {}


def _lrange_json(key: str, start: int, stop: int) -> list:
    if not R:
        return []
    try:
        vals = R.lrange(key, start, stop)
        out = []
        for z in vals:
            s = z.decode() if isinstance(z, (bytes, bytearray)) else str(z)
            try:
                out.append(json.loads(s))
            except Exception:
                out.append({"raw": s})
        return out
    except Exception:
        return []


# ──────────────────────────────────────────────────────────────────────────────
# Event helpers
def _coerce_str(v: Any, maxlen: int = 160) -> str:
    if v is None:
        return ""
    s = str(v)
    return s[:maxlen]


def _ctx_from_request(data: Dict[str, Any]) -> Dict[str, str]:
    """Extract optional context fields for better attribution."""
    return {
        "key": _coerce_str(data.get("key", "hub"), 80),
        "route": _coerce_str(data.get("route", "")),
        "peer": _coerce_str(data.get("peer", "")),
        "campaign": _coerce_str(data.get("campaign", "")),
        "source": _coerce_str(data.get("source", "web")),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Metrics routes
@bp.post("/impression")
def impression():
    """
    Body (JSON, optional): {"key":"tiers","route":"/tiers","peer":"jordan-t","campaign":"fall-24","source":"hero"}
    """
    data = request.get_json(silent=True) or {}
    wk = _week_key()
    rk = f"fc:roi:{wk}"

    ctx = _ctx_from_request(data)
    stamp = _now_utc().isoformat(timespec="seconds")

    _h_incrby(rk, "impressions", 1)
    _h_incrby(rk, f"imp:{ctx['key']}", 1)
    if ctx["route"]:
        _h_incrby(rk, f"imp:route:{ctx['route']}", 1)
    if ctx["peer"]:
        _h_incrby(rk, f"imp:peer:{ctx['peer']}", 1)
    if ctx["campaign"]:
        _h_incrby(rk, f"imp:campaign:{ctx['campaign']}", 1)

    _h_incrbyfloat(rk, "imp_last_ts", 1.0)  # keeps field hot (not a true timestamp)

    return jsonify({"ok": True, "week": wk, "ts": stamp})


@bp.post("/click")
def click():
    """
    Body (JSON, optional): {"key":"sponsor-cta","route":"/tiers","peer":"jordan-t","campaign":"fall-24","source":"button"}
    """
    data = request.get_json(silent=True) or {}
    wk = _week_key()
    rk = f"fc:roi:{wk}"

    ctx = _ctx_from_request(data)
    stamp = _now_utc().isoformat(timespec="seconds")

    _h_incrby(rk, "clicks", 1)
    _h_incrby(rk, f"click:{ctx['key']}", 1)
    if ctx["route"]:
        _h_incrby(rk, f"click:route:{ctx['route']}", 1)
    if ctx["peer"]:
        _h_incrby(rk, f"click:peer:{ctx['peer']}", 1)
    if ctx["campaign"]:
        _h_incrby(rk, f"click:campaign:{ctx['campaign']}", 1)

    return jsonify({"ok": True, "week": wk, "ts": stamp})


@bp.get("/roi/weekly")
def weekly():
    """Optional query param: week=YYYY-Www (defaults to current ISO week)."""
    week = request.args.get("week") or _week_key()
    rk = f"fc:roi:{week}"
    metrics = _hgetall_safe(rk)
    recent = _lrange_json("fc:recent_donations", 0, 24)

    return jsonify(
        {
            "ok": True,
            "week": week,
            "metrics": metrics,
            "recent": recent,
            "notes": {"redis": bool(R)},
            "ts": _now_utc().isoformat(timespec="seconds"),
        }
    )


@bp.get("/health")
def health():
    notes = {"redis": False}
    try:
        if R:
            R.ping()
            notes["redis"] = True
    except Exception:
        notes["redis"] = False
    return jsonify(
        {"ok": True, "notes": notes, "ts": _now_utc().isoformat(timespec="seconds")}
    )


# ──────────────────────────────────────────────────────────────────────────────
# Stripe PaymentIntent (guarded; handy for E2E without the full payments bp)
# This lives under /api/metrics so you can test quickly even if the main
# /api/payments blueprint is unavailable. Call: POST /api/metrics/stripe/intent
try:
    import stripe  # type: ignore
except Exception:  # pragma: no cover
    stripe = None  # type: ignore

FAKE_PAYMENTS = os.getenv("FAKE_PAYMENTS", "").lower() in {"1", "true", "yes", "on"}
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")

if stripe:
    try:
        stripe.api_key = STRIPE_SECRET_KEY
    except Exception:
        # if the lib is present but key is malformed, we'll handle in the route
        pass


@bp.post("/stripe/intent")
def metrics_stripe_intent():
    """
    Minimal PaymentIntent creator for local E2E testing.
    Body JSON: {"amount": 50, "name": "...", "email": "...", "frequency":"once","sponsor_url":"/#tiers"}
    Returns: {"client_secret":"..."} or a fake secret if FAKE_PAYMENTS=1 and no Stripe key set.
    """
    data = request.get_json(silent=True) or {}
    try:
        amount = int(round(float(data.get("amount", 0)) * 100))
    except Exception:
        return jsonify({"error": "Invalid amount"}), 400
    if amount <= 0:
        return jsonify({"error": "Invalid amount"}), 400

    # Guard: Stripe available?
    if not stripe or not STRIPE_SECRET_KEY:
        if FAKE_PAYMENTS:
            return jsonify({"client_secret": "pi_fake_secret_for_local_testing"}), 200
        return (
            jsonify({"error": "Stripe is not configured (missing STRIPE_SECRET_KEY)."}),
            503,
        )

    metadata = {
        k: str(v)
        for k, v in {
            "name": data.get("name") or "Supporter",
            "email": data.get("email") or "",
            "frequency": data.get("frequency", "once"),
            "sponsor_url": data.get("sponsor_url") or "",
        }.items()
        if v
    }

    try:
        pi = stripe.PaymentIntent.create(
            amount=amount,
            currency="usd",
            automatic_payment_methods={"enabled": True},
            metadata=metadata,
            description=f"{os.getenv('BRAND_NAME','FundChamps')} Sponsorship/Donation",
        )
        return jsonify({"client_secret": pi.client_secret})
    except Exception as e:
        # StripeError → 400 with user-facing message, others → 500
        try:
            from stripe.error import StripeError  # type: ignore

            if isinstance(e, StripeError):
                current_app.logger.exception("Stripe error creating PaymentIntent")
                msg = getattr(e, "user_message", None) or str(e)
                return jsonify({"error": f"Stripe error: {msg}"}), 400
        except Exception:
            pass
        current_app.logger.exception("Unexpected error creating PaymentIntent")
        return jsonify({"error": "Internal error creating intent"}), 500
