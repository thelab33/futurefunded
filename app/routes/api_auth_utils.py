# app/routes/api_auth_utils.py
# ─────────────────────────────────────────────────────────────────────────────
# 🔐 Auth + JSON + Stats helpers (Production-Grade)
# ─────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import wraps
from typing import Any, Dict, List, Optional, Set, Tuple

from flask import current_app, jsonify, make_response, request
from sqlalchemy import desc, func
from werkzeug.exceptions import BadRequest, Unauthorized

try:
    import jwt  # PyJWT
except ImportError:  # pragma: no cover
    jwt = None  # type: ignore

log = logging.getLogger(__name__)

# =============================================================================
# Token Helpers
# =============================================================================


def _api_tokens() -> Set[str]:
    """Return static API tokens from config (CSV)."""
    raw = str(_cfg("API_TOKENS", "") or "")
    return {t.strip() for t in raw.split(",") if t.strip()}


def _normalize_pem(s: str) -> str:
    """Normalize PEM strings that may contain escaped newlines."""
    return s.replace("\\n", "\n") if "BEGIN" in s and "\\n" in s else s


def _bearer_token() -> Optional[str]:
    """Extract bearer token from request headers."""
    h = request.headers.get("Authorization", "")
    return h.split(" ", 1)[1].strip() if h.lower().startswith("bearer ") else None


def _token_scopes_from_claims(claims: Dict[str, Any]) -> Set[str]:
    """Extract scopes from common JWT claim fields."""
    if isinstance(claims.get("scope"), str):
        return set(claims["scope"].split())
    if isinstance(claims.get("scopes"), (list, tuple)):
        return set(map(str, claims["scopes"]))
    if isinstance(claims.get("permissions"), (list, tuple)):
        return set(map(str, claims["permissions"]))
    return set()


def _verify_bearer_token(tok: str) -> Tuple[str, Set[str]]:
    """
    Verify bearer token as either:
    1. Static API token (full scope).
    2. JWT (validated if configured).
    """
    # Static API token
    if tok in _api_tokens():
        return f"apikey:{tok[-4:]}", {"*"}  # tweak: restrict if needed

    # JWT path
    jwt_secret = str(_cfg("JWT_SECRET", "") or "")
    jwt_pub = str(_cfg("JWT_PUBLIC_KEY", "") or "")
    jwt_alg = str(_cfg("JWT_ALG", "HS256") or "HS256")
    api_aud = _cfg("API_AUDIENCE") or None
    api_iss = _cfg("API_ISSUER") or None

    if jwt and (jwt_secret or jwt_pub):
        key = jwt_secret or _normalize_pem(jwt_pub)
        claims = jwt.decode(
            tok,
            key=key,
            algorithms=[jwt_alg],
            audience=api_aud,
            issuer=api_iss,
            options={"verify_aud": bool(api_aud), "verify_iss": bool(api_iss)},
        )
        return str(claims.get("sub", "jwt")), _token_scopes_from_claims(claims)

    raise Unauthorized("Invalid or unsupported bearer token.")


def require_bearer(optional: bool = True, scopes: Optional[List[str]] = None):
    """
    Decorator to enforce bearer authentication + scope checking.
    Example:
        @api.route("/secure")
        @require_bearer(optional=False, scopes=["donations:write"])
        def secure_ep(): ...
    """
    needed = set(scopes or [])

    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            tok = _bearer_token()
            if not tok:
                if optional:
                    return fn(*args, **kwargs)
                raise Unauthorized("Missing bearer token.")

            subject, granted = _verify_bearer_token(tok)
            request.api_subject = subject  # type: ignore[attr-defined]
            request.api_scopes = granted  # type: ignore[attr-defined]

            if needed and not (needed.issubset(granted) or "*" in granted):
                raise Unauthorized("Insufficient scope.")

            return fn(*args, **kwargs)

        return wrapped

    return decorator


# =============================================================================
# JSON + Validation Helpers
# =============================================================================


def _json(
    data: Dict[str, Any],
    status: int = 200,
    etag: Optional[str] = None,
    max_age: int = 15,
):
    """Return JSON with optional cache + ETag headers."""
    resp = make_response(jsonify(data), status)
    if request.method == "GET":
        resp.headers.setdefault("Cache-Control", f"public, max-age={max_age}")
        if etag:
            resp.set_etag(etag)
    return resp


def _safe_int(name: str, default: int, minimum: int = 1, maximum: int = 100) -> int:
    """Extract integer query param safely with bounds."""
    try:
        val = int(request.args.get(name, default))
    except (TypeError, ValueError):
        raise BadRequest(f"Invalid integer for '{name}'")
    return max(minimum, min(maximum, val))


# =============================================================================
# Data Classes
# =============================================================================


@dataclass(frozen=True)
class Stats:
    raised: float
    goal: float
    leaderboard: List[Dict[str, Any]]


# =============================================================================
# Stats Helpers (DB queries tolerant of schema variance)
# =============================================================================


def _active_goal_amount() -> float:
    """Pick active fundraising goal or fallback to config/10k."""
    try:
        if CampaignGoal:
            q = db.session.query(CampaignGoal)
            if hasattr(CampaignGoal, "active"):
                q = q.filter(CampaignGoal.active.is_(True))
            elif hasattr(CampaignGoal, "is_active"):
                q = q.filter(CampaignGoal.is_active.is_(True))
            order_col = (
                getattr(CampaignGoal, "updated_at", None)
                or getattr(CampaignGoal, "created_at", None)
                or getattr(CampaignGoal, "id", None)
            )
            if order_col is not None:
                q = q.order_by(desc(order_col))
            row = q.first()
            if row:
                for col in ("goal_amount", "amount", "value"):
                    if hasattr(row, col):
                        return float(getattr(row, col) or 0.0)
    except Exception:
        log.exception("Goal lookup failed; using fallback")

    cfg = current_app.config.get("TEAM_CONFIG", {}) or {}
    for k in ("fundraising_goal", "FUNDRAISING_GOAL"):
        if k in cfg:
            return float(cfg[k])
    return 10000.0


def _sum_sponsor_approved() -> float:
    """Sum approved sponsor amounts."""
    if not Sponsor:
        return 0.0
    try:
        q = db.session.query(func.coalesce(func.sum(Sponsor.amount), 0.0))
        if hasattr(Sponsor, "deleted"):
            q = q.filter(Sponsor.deleted.is_(False))
        if hasattr(Sponsor, "status"):
            q = q.filter(Sponsor.status == "approved")
        return float(q.scalar() or 0.0)
    except Exception:
        log.exception("Sponsor sum failed")
        return 0.0


def _sum_donations() -> float:
    """Sum donation amounts."""
    if not Donation:
        return 0.0
    try:
        return float(
            db.session.query(func.coalesce(func.sum(Donation.amount), 0.0)).scalar()
            or 0.0
        )
    except Exception:
        log.exception("Donation sum failed")
        return 0.0


def _recent_donations(limit: int) -> List[Dict[str, Any]]:
    """Recent donations (schema-tolerant)."""
    out: List[Dict[str, Any]] = []
    if not Donation:
        # fallback to Sponsors
        if Sponsor:
            try:
                q = db.session.query(Sponsor)
                col = getattr(Sponsor, "created_at", None) or getattr(
                    Sponsor, "id", None
                )
                if hasattr(Sponsor, "deleted"):
                    q = q.filter(Sponsor.deleted.is_(False))
                if hasattr(Sponsor, "status"):
                    q = q.filter(Sponsor.status == "approved")
                if col:
                    q = q.order_by(desc(col))
                for s in q.limit(limit).all():
                    out.append(
                        {
                            "name": getattr(s, "name", "Sponsor"),
                            "amount": float(getattr(s, "amount", 0.0) or 0.0),
                            "created_at": str(getattr(s, "created_at", "") or ""),
                        }
                    )
            except Exception:
                log.exception("Fallback sponsor donations failed")
        return out

    try:
        q = db.session.query(Donation)
        order_col = (
            getattr(Donation, "created_at", None)
            or getattr(Donation, "created", None)
            or getattr(Donation, "timestamp", None)
            or getattr(Donation, "id", None)
        )
        if order_col:
            q = q.order_by(desc(order_col))
        for d in q.limit(limit).all():
            name = next(
                (
                    getattr(d, k)
                    for k in ("display_name", "donor_name", "name")
                    if hasattr(d, k) and getattr(d, k)
                ),
                "Anonymous",
            )
            amount = next(
                (
                    float(getattr(d, k) or 0.0)
                    for k in ("amount", "total", "value")
                    if hasattr(d, k)
                ),
                0.0,
            )
            created_at = next(
                (
                    str(getattr(d, k) or "")
                    for k in ("created_at", "created", "timestamp")
                    if hasattr(d, k)
                ),
                "",
            )
            out.append({"name": name, "amount": amount, "created_at": created_at})
    except Exception:
        log.exception("Recent donations query failed")
    return out


def _leaderboard(top_n: int) -> List[Dict[str, Any]]:
    """Leaderboard from Sponsors (preferred) or Donations."""
    if Sponsor:
        try:
            q = db.session.query(Sponsor)
            if hasattr(Sponsor, "deleted"):
                q = q.filter(Sponsor.deleted.is_(False))
            if hasattr(Sponsor, "status"):
                q = q.filter(Sponsor.status == "approved")
            q = q.order_by(desc(getattr(Sponsor, "amount", 0)))
            return [
                {
                    "name": getattr(s, "name", "Sponsor"),
                    "amount": float(getattr(s, "amount", 0.0) or 0.0),
                }
                for s in q.limit(top_n).all()
            ]
        except Exception:
            log.exception("Sponsor leaderboard failed")

    if Donation:
        try:
            name_col = (
                getattr(Donation, "display_name", None)
                or getattr(Donation, "donor_name", None)
                or getattr(Donation, "name", None)
            )
            amt_col = getattr(Donation, "amount", None)
            if name_col and amt_col:
                rows = (
                    db.session.query(
                        name_col.label("name"),
                        func.coalesce(func.sum(amt_col), 0.0).label("amount"),
                    )
                    .group_by(name_col)
                    .order_by(desc("amount"))
                    .limit(top_n)
                    .all()
                )
                return [
                    {"name": r.name or "Anonymous", "amount": float(r.amount or 0.0)}
                    for r in rows
                ]
        except Exception:
            log.exception("Donation leaderboard failed")

    return []
