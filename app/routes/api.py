# app/routes/api.py
from __future__ import annotations

"""
FutureFunded API Blueprint (Flagship)
────────────────────────────────────────────────────────────
• Mounted at /api via app factory (bp or api_bp)
• RESTX docs at /api/docs (Bearer auth supported)
• Status + stats + donors feed + impact buckets
• Stripe public config/readiness (public-safe)
• Tolerates missing tables/models in dev/offline
• Consistent caching + ETag + 304 behavior

Env knobs:
  API_TOKENS=tok1,tok2          (optional raw bearer tokens)
  JWT_SECRET=... or JWT_PUBLIC_KEY=...  (optional JWT verification)
  JWT_ALG=HS256                 (default)
  API_AUDIENCE=...              (optional)
  API_ISSUER=...                (optional)
"""

import json
import os
from functools import wraps
from hashlib import sha1
from typing import Any, Dict, List, Optional, Set, Tuple

from flask import Blueprint, Response, current_app, jsonify, make_response, request
from flask_restx import Api, Resource, fields
from sqlalchemy import desc, func
from sqlalchemy import inspect as sa_inspect
from werkzeug.exceptions import BadRequest, Unauthorized

from app.extensions import db

# ─────────────────────────────────────────────────────────────
# Optional models (fail gracefully if missing)
# ─────────────────────────────────────────────────────────────
try:
    from app.models.campaign_goal import CampaignGoal  # type: ignore
except Exception:  # pragma: no cover
    CampaignGoal = None  # type: ignore

try:
    from app.models.donation import Donation  # type: ignore
except Exception:  # pragma: no cover
    Donation = None  # type: ignore

try:
    from app.models.sponsor import Sponsor  # type: ignore
except Exception:  # pragma: no cover
    Sponsor = None  # type: ignore

# Optional “impact buckets” table (rename whenever you create a real model)
try:
    from app.models.example import Example  # type: ignore
except Exception:  # pragma: no cover
    Example = None  # type: ignore

# ─────────────────────────────────────────────────────────────
# Blueprint + RESTX API
# ─────────────────────────────────────────────────────────────
api_bp = Blueprint("api", __name__)
bp = api_bp  # backwards-compat alias

authorizations = {
    "Bearer": {
        "type": "apiKey",
        "in": "header",
        "name": "Authorization",
        "description": "Use: Bearer <token>",
    }
}

api = Api(
    api_bp,
    version="1.0",
    title="FutureFunded API",
    description="Public read-only API for the FutureFunded platform.",
    doc="/docs",
    authorizations=authorizations,
    security="Bearer",
    validate=True,
)

# CSRF-exempt for JSON API
try:
    from app.extensions import csrf  # type: ignore

    if csrf:
        csrf.exempt(api_bp)  # type: ignore[arg-type]
except Exception:
    pass

# ─────────────────────────────────────────────────────────────
# Config helpers
# ─────────────────────────────────────────────────────────────
def _cfg(name: str, default: Any = None) -> Any:
    try:
        v = current_app.config.get(name)
        if v is not None:
            return v
    except Exception:
        pass
    return os.getenv(name, default)


def _stripe_secret() -> str:
    return str(_cfg("STRIPE_SECRET_KEY", "") or "")


def _stripe_public() -> str:
    return str(_cfg("STRIPE_PUBLISHABLE_KEY", "") or _cfg("STRIPE_PUBLIC_KEY", "") or "")


def _team_cfg() -> Dict[str, Any]:
    # Keep this light: main blueprint has richer config shaping.
    try:
        return dict(current_app.config.get("TEAM_CONFIG") or {})
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────
# Small DB utilities (schema-tolerant)
# ─────────────────────────────────────────────────────────────
def _table_exists(model: Any) -> bool:
    try:
        if not db or not getattr(db, "engine", None):
            return False
        name = getattr(model, "__tablename__", None)
        if not name:
            return False
        return bool(sa_inspect(db.engine).has_table(name))
    except Exception:
        return False


def _first_attr(obj: Any, candidates: Tuple[str, ...]) -> Any:
    for c in candidates:
        if hasattr(obj, c):
            return getattr(obj, c)
    return None


# ─────────────────────────────────────────────────────────────
# Bearer auth (API token or JWT)
# ─────────────────────────────────────────────────────────────
try:
    import jwt  # type: ignore
except Exception:  # pragma: no cover
    jwt = None  # type: ignore


def _api_tokens() -> Set[str]:
    raw = str(_cfg("API_TOKENS", "") or "")
    return {t.strip() for t in raw.split(",") if t.strip()}


def _normalize_pem(s: str) -> str:
    return s.replace("\\n", "\n") if "BEGIN" in s and "\\n" in s else s


def _bearer_token() -> Optional[str]:
    h = request.headers.get("Authorization", "")
    if h.lower().startswith("bearer "):
        tok = h.split(" ", 1)[1].strip()
        return tok or None
    return None


def _token_scopes_from_claims(claims: Dict[str, Any]) -> Set[str]:
    if isinstance(claims.get("scope"), str):
        return set(claims["scope"].split())
    if isinstance(claims.get("scopes"), (list, tuple)):
        return set(map(str, claims["scopes"]))
    if isinstance(claims.get("permissions"), (list, tuple)):
        return set(map(str, claims["permissions"]))
    return set()


def _verify_bearer_token(tok: str) -> Tuple[str, Set[str]]:
    # 1) Raw API key
    if tok in _api_tokens():
        return f"apikey:{tok[-4:]}", {"*"}

    # 2) JWT (optional)
    jwt_secret = str(_cfg("JWT_SECRET", "") or "")
    jwt_pub = str(_cfg("JWT_PUBLIC_KEY", "") or "")
    jwt_alg = str(_cfg("JWT_ALG", "HS256") or "HS256")
    api_aud = _cfg("API_AUDIENCE") or None
    api_iss = _cfg("API_ISSUER") or None

    if jwt and (jwt_secret or jwt_pub):
        key = jwt_secret or _normalize_pem(jwt_pub)
        options = {"verify_aud": bool(api_aud), "verify_iss": bool(api_iss)}
        claims = jwt.decode(
            tok,
            key=key,
            algorithms=[jwt_alg],
            audience=api_aud,
            issuer=api_iss,
            options=options,
        )
        return str(claims.get("sub", "jwt")), _token_scopes_from_claims(claims)

    raise Unauthorized("Invalid or unsupported bearer token.")


def require_bearer(optional: bool = True, scopes: Optional[List[str]] = None):
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
            # attach for downstream logging/analytics
            setattr(request, "api_subject", subject)
            setattr(request, "api_scopes", granted)
            if needed and not (needed.issubset(granted) or "*" in granted):
                raise Unauthorized("Insufficient scope.")
            return fn(*args, **kwargs)

        return wrapped

    return decorator


# ─────────────────────────────────────────────────────────────
# JSON + caching helpers (ETag + 304)
# ─────────────────────────────────────────────────────────────
def _etag(s: str) -> str:
    return sha1(s.encode("utf-8")).hexdigest()[:12]


def _etag_matches(etag_value: str) -> bool:
    try:
        inm = request.if_none_match
        return bool(inm and inm.contains(etag_value))
    except Exception:
        inm2 = request.headers.get("If-None-Match", "")
        return bool(inm2 and etag_value in inm2)


def _json_response(
    data: Any,
    *,
    status: int = 200,
    etag_value: Optional[str] = None,
    max_age: int = 15,
    cache_public: bool = True,
) -> Response:
    if request.method == "GET" and etag_value and _etag_matches(etag_value):
        resp = make_response("", 304)
        resp.set_etag(etag_value)
        resp.headers.setdefault("Cache-Control", f"public, max-age={max_age}" if cache_public else "no-store")
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        return resp

    resp = make_response(jsonify(data), status)
    if request.method == "GET":
        if etag_value:
            resp.set_etag(etag_value)
        resp.headers.setdefault("Cache-Control", f"public, max-age={max_age}" if cache_public else "no-store")
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    else:
        resp.headers.setdefault("Cache-Control", "no-store")
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    return resp


def _safe_int(name: str, default: int, minimum: int = 1, maximum: int = 100) -> int:
    raw = request.args.get(name, default)
    try:
        val = int(raw)
    except (TypeError, ValueError):
        raise BadRequest(f"Invalid integer for '{name}'")
    return max(minimum, min(maximum, val))


# ─────────────────────────────────────────────────────────────
# Swagger models
# ─────────────────────────────────────────────────────────────
leaderboard_model = api.model(
    "LeaderboardItem",
    {
        "name": fields.String(required=True, example="Gold's Gym"),
        "amount": fields.Float(required=True, example=2500.0),
    },
)

donor_model = api.model(
    "Donor",
    {
        "name": fields.String(required=True, example="Anonymous"),
        "amount": fields.Float(required=True, example=50.0),
        "created_at": fields.String(required=False, example="2025-08-15T21:30:00Z"),
    },
)

bucket_model = api.model(
    "ImpactBucket",
    {
        "id": fields.Integer(required=True, example=1),
        "slug": fields.String(required=True, example="gear"),
        "label": fields.String(required=True, example="Team Gear"),
        "amount": fields.Float(required=True, example=50.0),
        "description": fields.String(required=False, example="Covers a player’s practice kit."),
        "icon": fields.String(required=False, example="shirt"),
    },
)

stats_model = api.model(
    "Stats",
    {
        "raised": fields.Float(required=True, example=5000.0),
        "goal": fields.Float(required=True, example=10000.0),
        "percent": fields.Float(required=True, example=50.0),
        "leaderboard": fields.List(fields.Nested(leaderboard_model)),
    },
)

status_model = api.model(
    "Status",
    {
        "status": fields.String(required=True, example="ok"),
        "message": fields.String(required=True, example="API live"),
        "version": fields.String(required=True, example="1.0.0"),
        "docs": fields.String(required=True, example="/api/docs"),
    },
)

readiness_model = api.model(
    "PaymentsReadiness",
    {
        "stripe_ready": fields.Boolean(required=True),
        "stripe_public_key": fields.String(required=False),
    },
)

payments_cfg_model = api.model("PaymentsConfig", {"stripe_public_key": fields.String(required=True)})

# ─────────────────────────────────────────────────────────────
# Data helpers (schema-tolerant)
# ─────────────────────────────────────────────────────────────
def _active_goal_amount(org_id: Optional[int] = None) -> float:
    """
    Goal lookup rules:
    1) If CampaignGoal exists, prefer active row filtered by org_id when possible.
    2) Fall back to TEAM_CONFIG fundraising_goal.
    3) Final fallback 10,000.
    """
    try:
        if CampaignGoal and _table_exists(CampaignGoal):
            q = db.session.query(CampaignGoal)

            if org_id is not None and hasattr(CampaignGoal, "org_id"):
                q = q.filter(CampaignGoal.org_id == org_id)  # type: ignore[attr-defined]

            active_col = _first_attr(CampaignGoal, ("active", "is_active"))
            if active_col is not None:
                q = q.filter(active_col.is_(True))  # type: ignore[attr-defined]

            order_col = _first_attr(CampaignGoal, ("updated_at", "created_at", "id"))
            if order_col is not None:
                q = q.order_by(desc(order_col))

            row = q.first()
            if row:
                val = _first_attr(row, ("goal_amount", "amount", "value"))
                if val is not None:
                    return float(val or 0.0)
    except Exception:
        current_app.logger.exception("Goal lookup failed; using fallback")

    cfg = _team_cfg()
    try:
        return float(cfg.get("fundraising_goal") or 10_000)
    except Exception:
        return 10_000.0


def _sum_sponsor_approved(org_id: Optional[int] = None) -> float:
    if not Sponsor or not _table_exists(Sponsor):
        return 0.0
    try:
        amt_col = getattr(Sponsor, "amount", None)
        if amt_col is None:
            return 0.0
        q = db.session.query(func.coalesce(func.sum(amt_col), 0.0))
        if hasattr(Sponsor, "deleted_at"):
            q = q.filter(Sponsor.deleted_at.is_(None))
        if hasattr(Sponsor, "status"):
            q = q.filter(Sponsor.status == "approved")
        if org_id is not None and hasattr(Sponsor, "org_id"):
            q = q.filter(Sponsor.org_id == org_id)
        return float(q.scalar() or 0.0)
    except Exception:
        return 0.0


def _sum_donations(org_id: Optional[int] = None) -> float:
    if not Donation or not _table_exists(Donation):
        return 0.0
    try:
        amt_col = getattr(Donation, "amount", None)
        if amt_col is None:
            return 0.0
        q = db.session.query(func.coalesce(func.sum(amt_col), 0.0))
        if org_id is not None and hasattr(Donation, "org_id"):
            q = q.filter(Donation.org_id == org_id)
        return float(q.scalar() or 0.0)
    except Exception:
        return 0.0


def _recent_donations(limit: int, org_id: Optional[int] = None) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    if Donation and _table_exists(Donation):
        try:
            q = db.session.query(Donation)
            if org_id is not None and hasattr(Donation, "org_id"):
                q = q.filter(Donation.org_id == org_id)

            order_col = _first_attr(Donation, ("created_at", "created", "timestamp", "id"))
            if order_col is not None:
                q = q.order_by(desc(order_col))

            for d in q.limit(limit).all():
                name = _first_attr(d, ("display_name", "donor_name", "name")) or "Anonymous"
                amt_val = _first_attr(d, ("amount", "total", "value"))
                try:
                    amount = float(amt_val or 0.0)
                except Exception:
                    amount = 0.0
                created = _first_attr(d, ("created_at", "created", "timestamp")) or ""
                out.append({"name": str(name), "amount": amount, "created_at": str(created)})
            return out
        except Exception:
            current_app.logger.exception("Recent donations query failed")

    if Sponsor and _table_exists(Sponsor):
        try:
            q = db.session.query(Sponsor)
            if hasattr(Sponsor, "deleted_at"):
                q = q.filter(Sponsor.deleted_at.is_(None))
            if hasattr(Sponsor, "status"):
                q = q.filter(Sponsor.status == "approved")
            if org_id is not None and hasattr(Sponsor, "org_id"):
                q = q.filter(Sponsor.org_id == org_id)

            order_col = _first_attr(Sponsor, ("created_at", "id"))
            if order_col is not None:
                q = q.order_by(desc(order_col))

            for s in q.limit(limit).all():
                out.append(
                    {
                        "name": getattr(s, "name", None) or "Sponsor",
                        "amount": float(getattr(s, "amount", 0.0) or 0.0),
                        "created_at": str(getattr(s, "created_at", "") or ""),
                    }
                )
        except Exception:
            pass

    return out


def _leaderboard(top_n: int, org_id: Optional[int] = None) -> List[Dict[str, Any]]:
    if Sponsor and _table_exists(Sponsor):
        try:
            q = db.session.query(Sponsor)
            if hasattr(Sponsor, "deleted_at"):
                q = q.filter(Sponsor.deleted_at.is_(None))
            if hasattr(Sponsor, "status"):
                q = q.filter(Sponsor.status == "approved")
            if org_id is not None and hasattr(Sponsor, "org_id"):
                q = q.filter(Sponsor.org_id == org_id)

            amt_col = getattr(Sponsor, "amount", None)
            if amt_col is not None:
                q = q.order_by(desc(amt_col))

            items = q.limit(top_n).all()
            return [
                {"name": getattr(s, "name", None) or "Sponsor", "amount": float(getattr(s, "amount", 0.0) or 0.0)}
                for s in items
            ]
        except Exception:
            pass

    if Donation and _table_exists(Donation):
        try:
            name_col = _first_attr(Donation, ("display_name", "donor_name", "name"))
            amt_col = getattr(Donation, "amount", None)
            if name_col is not None and amt_col is not None:
                q = db.session.query(
                    name_col.label("name"),
                    func.coalesce(func.sum(amt_col), 0.0).label("amount"),
                )
                if org_id is not None and hasattr(Donation, "org_id"):
                    q = q.filter(Donation.org_id == org_id)
                rows = q.group_by(name_col).order_by(desc("amount")).limit(top_n).all()
                return [{"name": r.name or "Anonymous", "amount": float(r.amount or 0.0)} for r in rows]
        except Exception:
            pass

    return []


def _impact_buckets() -> List[Dict[str, Any]]:
    if Example and _table_exists(Example):
        try:
            q = db.session.query(Example)
            order_col = _first_attr(Example, ("position", "sort", "id"))
            if order_col is not None:
                q = q.order_by(order_col)
            rows = q.all()
            out: List[Dict[str, Any]] = []
            for i, r in enumerate(rows, 1):
                out.append(
                    {
                        "id": getattr(r, "id", i),
                        "slug": getattr(r, "slug", f"bucket-{i}") or f"bucket-{i}",
                        "label": getattr(r, "label", "Impact Item") or "Impact Item",
                        "amount": float(getattr(r, "amount", 0.0) or 0.0),
                        "description": getattr(r, "description", "") or "",
                        "icon": getattr(r, "icon", "") or "",
                    }
                )
            if out:
                return out
        except Exception:
            current_app.logger.exception("Impact buckets query failed")

    return [
        {"id": 1, "slug": "gear", "label": "Team Gear", "amount": 50.0, "description": "Covers a player’s practice kit.", "icon": "shirt"},
        {"id": 2, "slug": "travel", "label": "Tournament Travel", "amount": 150.0, "description": "Helps fund a weekend tournament trip.", "icon": "bus"},
        {"id": 3, "slug": "academics", "label": "Tutoring Session", "amount": 75.0, "description": "Funds one academic tutoring session.", "icon": "book"},
    ]


# ─────────────────────────────────────────────────────────────
# RESTX routes
# ─────────────────────────────────────────────────────────────
@api.route("/status")
class Status(Resource):
    @api.doc(description="API health check", tags=["Status"])
    @api.marshal_with(status_model)
    @require_bearer(optional=True)
    def get(self):
        version = str(current_app.config.get("API_VERSION") or _cfg("GIT_COMMIT", "1.0.0"))
        payload = {"status": "ok", "message": "API live", "version": version, "docs": "/api/docs"}
        et = _etag(f"status-{payload['version']}")
        return _json_response(payload, etag_value=et, max_age=60)


@api.route("/stats")
class StatsResource(Resource):
    @api.doc(
        description="Fundraiser totals + leaderboard",
        params={"top": "Top-N for leaderboard (1–50, default 10)", "org_id": "Optional org_id for multi-tenant totals"},
        tags=["Stats"],
    )
    @api.marshal_with(stats_model)
    @require_bearer(optional=True)
    def get(self):
        try:
            top = _safe_int("top", default=10, minimum=1, maximum=50)
            org_id = request.args.get("org_id", type=int)

            raised = _sum_donations(org_id=org_id) + _sum_sponsor_approved(org_id=org_id)
            goal = _active_goal_amount(org_id=org_id)
            percent = (raised / goal * 100.0) if goal else 0.0
            lb = _leaderboard(top, org_id=org_id)

            payload = {"raised": float(raised), "goal": float(goal), "percent": round(percent, 2), "leaderboard": lb}
            et = _etag(f"{int(raised)}-{int(goal)}-{len(lb)}-{org_id or 0}-{top}")
            return _json_response(payload, etag_value=et, max_age=10)
        except BadRequest as e:
            api.abort(400, str(e))
        except Exception:
            current_app.logger.error("📊 error fetching stats", exc_info=True)
            api.abort(500, "Database error")


# Legacy lightweight totals endpoint (non-RESTX) for older JS
@api_bp.get("/totals")
@require_bearer(optional=True)
def totals():
    org_id = request.args.get("org_id", type=int)
    raised = _sum_donations(org_id=org_id) + _sum_sponsor_approved(org_id=org_id)
    goal = _active_goal_amount(org_id=org_id)
    percent = (raised / goal * 100.0) if goal else 0.0
    payload = {"raised": float(raised), "goal": float(goal), "percent": round(percent, 2)}
    et = _etag(f"totals-{int(raised)}-{int(goal)}-{org_id or 0}")
    return _json_response(payload, etag_value=et, max_age=10)


@api.route("/donors")
class DonorsResource(Resource):
    @api.doc(
        description="Recent donors (ticker / supporter wall)",
        params={"limit": "Max items (1–100, default 12)", "org_id": "Optional org_id for multi-tenant feeds"},
        tags=["Stats"],
    )
    @api.marshal_list_with(donor_model)
    @require_bearer(optional=True)
    def get(self):
        try:
            limit = _safe_int("limit", default=12, minimum=1, maximum=100)
            org_id = request.args.get("org_id", type=int)
            donors = _recent_donations(limit, org_id=org_id)

            first_ts = donors[0]["created_at"] if donors else "0"
            et = _etag(f"d-{len(donors)}-{first_ts}-{org_id or 0}-{limit}")
            return _json_response(donors, etag_value=et, max_age=15)
        except BadRequest as e:
            api.abort(400, str(e))
        except Exception:
            current_app.logger.error("🧾 donors feed error", exc_info=True)
            api.abort(500, "Database error")


@api.route("/impact")
class ImpactResource(Resource):
    @api.doc(description="Impact buckets (DB-backed with static fallback)", tags=["Stats"])
    @api.marshal_list_with(bucket_model)
    @require_bearer(optional=True)
    def get(self):
        data = _impact_buckets()
        et = _etag(f"impact-{len(data)}-{data[0]['slug'] if data else '0'}")
        return _json_response(data, etag_value=et, max_age=60)


@api.route("/payments/config")
class PaymentsConfig(Resource):
    @api.doc(description="Public Stripe config for front-end boot.", tags=["Payments"])
    @api.marshal_with(payments_cfg_model)
    def get(self):
        payload = {"stripe_public_key": _stripe_public() or ""}
        # public key changes rarely; safe longer cache
        et = _etag(f"pk-{payload['stripe_public_key'][-8:] if payload['stripe_public_key'] else 'none'}")
        return _json_response(payload, etag_value=et, max_age=300)


@api.route("/payments/readiness")
class PaymentsReadiness(Resource):
    @api.doc(description="Server-side payment readiness flags.", tags=["Payments"])
    @api.marshal_with(readiness_model)
    def get(self):
        pk = _stripe_public() or ""
        payload = {"stripe_ready": bool(_stripe_secret()), "stripe_public_key": pk}
        et = _etag(f"ready-{1 if payload['stripe_ready'] else 0}-{pk[-8:] if pk else 'none'}")
        return _json_response(payload, etag_value=et, max_age=60)


# ─────────────────────────────────────────────────────────────
# Blueprint-scoped error handlers (optional)
# NOTE: app/__init__.py already provides unified JSON errors for /api/*
# so we keep this minimal and non-invasive.
# ─────────────────────────────────────────────────────────────
@api_bp.app_errorhandler(400)
def _handle_400(e):
    return _json_response({"ok": False, "error": {"code": 400, "message": str(e)}}, status=400, etag_value=None, max_age=0, cache_public=False)


@api_bp.app_errorhandler(401)
def _handle_401(e):
    return _json_response({"ok": False, "error": {"code": 401, "message": str(e)}}, status=401, etag_value=None, max_age=0, cache_public=False)


@api_bp.app_errorhandler(404)
def _handle_404(e):
    return _json_response({"ok": False, "error": {"code": 404, "message": "Not Found"}}, status=404, etag_value=None, max_age=0, cache_public=False)
