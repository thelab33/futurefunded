from __future__ import annotations

"""
FundChamps — Newsletter Signup API
────────────────────────────────────────────────────────────
• POST /newsletter/signup → JSON or form signup
• GET  /newsletter/health → lightweight readiness probe
• Tolerant of missing NewsletterSignup model / table
• Basic email validation + duplicate detection
"""

import re
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request

from app.extensions import db

# Optional CSRF exemption (for embeds / third-party forms)
try:
    from app.extensions import csrf  # type: ignore
except Exception:  # pragma: no cover
    csrf = None  # type: ignore

# Optional model (avoid hard crash in dev / migrations)
try:
    from app.models.newsletter import NewsletterSignup  # type: ignore
except Exception:  # pragma: no cover
    NewsletterSignup = None  # type: ignore


bp = Blueprint("newsletter", __name__, url_prefix="/newsletter")
if csrf:
    try:
        csrf.exempt(bp)  # type: ignore[arg-type]
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(raw: str | None) -> str:
    return (raw or "").strip().lower()


def _client_ip() -> Optional[str]:
    # Prefer access_route (proxied deployments), fall back to remote_addr
    if request.access_route:
        return request.access_route[0]
    return request.remote_addr


def _user_agent() -> Optional[str]:
    ua = request.user_agent
    return ua.string if ua else None


def _get_payload() -> Dict[str, Any]:
    """Merge JSON body, form data, and query params with JSON taking precedence."""
    data: Dict[str, Any] = {}
    if request.is_json:
        data.update(request.get_json(silent=True) or {})
    # Form + query as gentle fallback
    for src in (request.form, request.args):
        for k in src:
            data.setdefault(k, src.get(k))
    return data


def _validate_email(email: str) -> Tuple[bool, Optional[str]]:
    if not email:
        return False, "Email required."
    if not EMAIL_RE.match(email):
        return False, "Email looks invalid."
    return True, None


def _get_or_create_signup(email: str, invite: Optional[str]) -> Tuple[Any, bool]:
    """
    Returns (row, created).
    Uses NewsletterSignup.get_or_create if present; otherwise minimal manual upsert.
    """
    if NewsletterSignup is None:
        raise RuntimeError("NewsletterSignup model is not available")

    # Prefer model helper if it exists
    if hasattr(NewsletterSignup, "get_or_create"):
        row = NewsletterSignup.get_or_create(  # type: ignore[attr-defined]
            email=email,
            invite=invite,
            ip=_client_ip(),
            ua=_user_agent(),
            commit=True,
        )
        created = getattr(row, "_created", None)
        # If helper doesn't tag created state, assume not and let caller treat as idempotent
        return row, bool(created) if created is not None else False

    # Manual “get or create”
    row = (
        db.session.query(NewsletterSignup)
        .filter(NewsletterSignup.email == email)  # type: ignore[attr-defined]
        .first()
    )
    if row:
        return row, False

    row = NewsletterSignup(  # type: ignore[call-arg]
        email=email,
        invite=invite,
        ip=_client_ip(),
        ua=_user_agent(),
    )
    db.session.add(row)
    db.session.commit()
    return row, True


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────


@bp.get("/health")
def health():
    """
    Lightweight readiness / diagnostics for newsletter capture.
    Safe for uptime checks and dashboards.
    """
    ready = bool(NewsletterSignup)
    return (
        jsonify(
            {
                "status": "ok" if ready else "degraded",
                "model_present": bool(NewsletterSignup),
            }
        ),
        200 if ready else 503,
    )


@bp.post("/signup")
def signup():
    """
    Newsletter signup endpoint.

    Accepts:
    • JSON: { "email": "...", "invite": "optional-code" }
    • or x-www-form-urlencoded / querystring equivalents.

    Returns JSON:
    { "ok": true, "id": 123, "email": "a@example.com", "existing": false }
    """
    if NewsletterSignup is None:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "Newsletter storage is not available.",
                }
            ),
            503,
        )

    payload = _get_payload()
    email = _normalize_email(payload.get("email"))
    invite = payload.get("invite") or request.args.get("invite")

    valid, err = _validate_email(email)
    if not valid:
        return jsonify({"ok": False, "error": err}), 400

    try:
        row, created = _get_or_create_signup(email=email, invite=invite)
    except Exception as exc:  # pragma: no cover
        # Fail soft but loudly in logs; caller gets 500
        from flask import current_app

        current_app.logger.error("Newsletter signup failed: %s", exc, exc_info=True)
        db.session.rollback()
        return (
            jsonify({"ok": False, "error": "Unable to save signup. Please try again."}),
            500,
        )

    return (
        jsonify(
            {
                "ok": True,
                "id": getattr(row, "id", None),
                "email": getattr(row, "email", email),
                "existing": not created,
            }
        ),
        200,
    )
