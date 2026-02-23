# app/routes/main.py
from __future__ import annotations

"""
Main web blueprint (FutureFunded • Flagship)

Contracts:
- Root route endpoint remains: main.home
- Teams + team photos come from TEAM_CONFIG (or g.team override),
  but if DB teams exist they win (optional DB-first layer).
- Template context always includes:
    teams, gallery_items, org_logo, TEAM_LOGO, TEAM_NAME
    ff_config (dict), ff_cfg_hash (stable hash), build_id, asset_version
- Frontend config always includes:
    ff_config["teams"], ff_config["galleryItems"]
    brand.logoUrl + org.logo
- HTML responses are no-store, but support ETag/304.
"""

import hashlib
import json
import os
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from hashlib import sha1
from threading import Thread
from types import SimpleNamespace
from typing import Any, Dict, List, Mapping, Optional, Set, Tuple, Union, cast
from uuid import UUID

from flask import (
    Blueprint,
    Response,
    current_app,
    flash,
    g,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    url_for,
)
from flask_mail import Message
from jinja2 import TemplateNotFound
from sqlalchemy import desc, func
from sqlalchemy import inspect as sa_inspect

from app.extensions import db, mail
from app.models import Org

# Optional: Stripe checkout (only used if installed + configured)
try:  # pragma: no cover
    import stripe  # type: ignore
except Exception:  # pragma: no cover
    stripe = None  # type: ignore

# Optional models/imports (graceful fallback)
try:
    from app.models.campaign_goal import CampaignGoal  # type: ignore
except Exception:  # pragma: no cover
    CampaignGoal = None  # type: ignore

try:
    from app.models.sponsor import Sponsor  # type: ignore
except Exception:  # pragma: no cover
    Sponsor = None  # type: ignore

# Local team config (single-source fallback)
try:
    from app.config.team_config import TEAM_CONFIG  # type: ignore
except Exception:  # pragma: no cover
    TEAM_CONFIG = {
        "team_name": "Connect ATX Elite",
        "fundraising_goal": 10_000,
        "theme_color": "#f59e0b",
        "teams": [],
    }

# Optional local helpers (graceful fallback)
try:
    from app.helpers import (  # type: ignore
        _generate_about_section,
        _generate_challenge_section,
        _generate_impact_stats,
        _generate_mission_section,
        _prepare_stats,
        to_cents as _to_cents_lib,  # prefer shared helpers if present
    )
except Exception:  # pragma: no cover

    def _generate_about_section(cfg: Mapping[str, Any]) -> Dict[str, Any]:
        return {}

    def _generate_impact_stats(cfg: Mapping[str, Any]) -> Dict[str, Any]:
        return {}

    def _generate_challenge_section(cfg: Mapping[str, Any], *_) -> Dict[str, Any]:
        return {}

    def _generate_mission_section(cfg: Mapping[str, Any], *_) -> Dict[str, Any]:
        return {}

    def _prepare_stats(cfg: Mapping[str, Any], raised: float, goal: float, pct: float) -> Dict[str, Any]:
        return {"raised": raised, "goal": goal, "percent": pct}

    _to_cents_lib = None  # type: ignore

# Forms fallback
try:
    from app.forms.sponsor_form import SponsorForm  # type: ignore
except Exception:
    try:
        from app.forms.donation_form import DonationForm as SponsorForm  # type: ignore
    except Exception:  # pragma: no cover
        SponsorForm = None  # type: ignore


bp = Blueprint("main", __name__)
main_bp = bp
__all__ = ["bp", "main_bp"]


# ----------------------
# Constants
# ----------------------
DEFAULT_FUNDRAISING_GOAL = 10_000
SPONSORS_PER_PAGE = 20
PERSONAS_DEFAULT = ["Sponsor", "Parent", "Coach"]

MIN_DONATION_CENTS = 100  # $1.00
DEFAULT_CURRENCY = "usd"

DEFAULT_BUILD_ID = "flagship-v16.3"

DEFAULT_TIERS: List[Dict[str, Any]] = [
    {
        "title": "Bronze",
        "amount": "500",
        "benefits": ["Public thank-you", "Board listing"],
        "emoji": "🥉",
        "fomo": "Perfect for first-timers.",
        "slots_left": 12,
        "price_id": None,
    },
    {
        "title": "Silver",
        "amount": "1000",
        "benefits": ["Social shoutout", "Board listing", "Logo on site"],
        "emoji": "🥈",
        "fomo": "A fan favorite.",
        "slots_left": 8,
        "price_id": None,
    },
    {
        "title": "Gold",
        "amount": "2500",
        "benefits": ["Top sponsor shoutout", "Logo + link", "VIP updates"],
        "emoji": "🥇",
        "fomo": "Big impact, big love.",
        "slots_left": 4,
        "price_id": None,
    },
]

# ----------------------
# Types
# ----------------------
JSONPrimitive = Union[str, int, float, bool, None]
JSONValue = Union[JSONPrimitive, List["JSONValue"], Dict[str, "JSONValue"]]


@dataclass(frozen=True)
class FundraisingStats:
    raised: float
    goal: Optional[float]
    percent_raised: float


# ----------------------
# Core helpers
# ----------------------
def _cfg_str(*vals: Any, default: str = "") -> str:
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return default


def _build_id() -> str:
    # Prefer app/__init__.py aliases if present
    return _cfg_str(
        os.getenv("FF_BUILD_ID"),
        os.getenv("BUILD_ID"),
        os.getenv("ASSET_VERSION"),
        os.getenv("GIT_COMMIT"),
        current_app.config.get("FF_BUILD_ID") if current_app else "",
        current_app.config.get("BUILD_ID") if current_app else "",
        current_app.config.get("ASSET_VERSION") if current_app else "",
        DEFAULT_BUILD_ID,
    )


def _asset_version() -> str:
    return _cfg_str(
        os.getenv("FF_ASSET_V"),
        os.getenv("FF_ASSET_VERSION"),
        os.getenv("ASSET_VERSION"),
        current_app.config.get("FF_ASSET_V") if current_app else "",
        current_app.config.get("FF_ASSET_VERSION") if current_app else "",
        current_app.config.get("ASSET_VERSION") if current_app else "",
        _build_id(),
    )


def _env_publishable_key() -> str:
    return _cfg_str(os.getenv("STRIPE_PUBLISHABLE_KEY"), os.getenv("STRIPE_PUBLIC_KEY"), default="")


def safe_url(endpoint: str, default: str) -> str:
    try:
        return url_for(endpoint)
    except Exception:
        return default


def _is_html_response(resp: Response) -> bool:
    try:
        mt = (resp.mimetype or "").lower()
    except Exception:
        mt = ""
    return mt.startswith("text/html")


def _nocache_html(resp: Response) -> Response:
    """
    HTML is no-store (but we still support ETag/304).
    Note: app/__init__.py applies authoritative static caching separately.
    """
    if _is_html_response(resp):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


def _short_etag(seed: str) -> str:
    return sha1(seed.encode("utf-8")).hexdigest()[:12]


def _stable_json_hash(obj: Any) -> str:
    try:
        s = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return hashlib.sha1(s).hexdigest()[:12]
    except Exception:
        return _short_etag(str(obj))


def _template_mtime(name: str) -> int:
    try:
        loader = current_app.jinja_loader
        if not loader:
            return 0
        _src, filename, _uptodate = loader.get_source(current_app.jinja_env, name)
        if filename and os.path.exists(filename):
            return int(os.path.getmtime(filename))
    except Exception:
        pass
    return 0


def _to_cents(amount: Any) -> int:
    """
    Prefer app.helpers.to_cents if available; otherwise a local safe conversion.
    """
    if callable(_to_cents_lib):
        try:
            return int(_to_cents_lib(amount))
        except Exception:
            pass
    try:
        if isinstance(amount, Decimal):
            return int((amount * 100).to_integral_value())
        return int(round(float(amount) * 100))
    except Exception:
        return 0


def json_sanitize(obj: Any) -> JSONValue:
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, timedelta):
        return int(obj.total_seconds())
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {str(k): json_sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [json_sanitize(v) for v in obj]
    return str(obj)


def _render_error(message: str, status: int = 500):
    try:
        return render_template("error.html", message=message), status
    except Exception:
        return message, status


def _template_exists(name: str) -> bool:
    try:
        current_app.jinja_env.get_template(name)
        return True
    except TemplateNotFound:
        return False
    except Exception:
        return False


def _wrap_document(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title}</title>
</head>
<body>
{body_html}
</body>
</html>"""


def _asset_url(raw: str) -> str:
    """
    Normalize asset URLs and add ?v= to /static/* (only if not already present).
    """
    s = (raw or "").strip()
    if not s:
        return ""

    if "://" in s or s.startswith("//"):
        return s

    if s.startswith("/"):
        out = s
    else:
        try:
            out = url_for("static", filename=s.lstrip("/"))
        except Exception:
            out = f"/static/{s.lstrip('/')}"

    v = _asset_version()
    if v and out.startswith("/static/") and ("v=" not in out):
        joiner = "&" if "?" in out else "?"
        out = f"{out}{joiner}v={v}"
    return out


# ----------------------
# DB-first Teams (optional)
# ----------------------
_DB_TEAMS_CACHE: Dict[str, Any] = {"ts": 0.0, "teams": None, "gallery": None}


def _db_path_appdb() -> str:
    return os.path.join(current_app.root_path, "data", "app.db")


def _db_teams_enabled() -> bool:
    """
    DB-first teams can be disabled if you want a pure-config deployment:
      FF_DB_TEAMS=0
    """
    v = (os.getenv("FF_DB_TEAMS") or "").strip().lower()
    if v in {"0", "false", "no", "off"}:
        return False
    return True


def _load_db_teams_cached(ttl_seconds: int = 10) -> Tuple[Optional[List[Dict[str, Any]]], Optional[List[Dict[str, Any]]]]:
    if not _db_teams_enabled():
        return None, None

    now = time.time()
    ts = float(_DB_TEAMS_CACHE.get("ts") or 0.0)
    if (now - ts) < ttl_seconds:
        return _DB_TEAMS_CACHE.get("teams"), _DB_TEAMS_CACHE.get("gallery")

    teams: Optional[List[Dict[str, Any]]] = None
    gallery: Optional[List[Dict[str, Any]]] = None

    try:
        import sqlite3

        db_path = _db_path_appdb()
        if not os.path.exists(db_path):
            raise FileNotFoundError(db_path)

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT slug, team_name, hero_image, og_image, record
            FROM teams
            WHERE deleted = 0
            ORDER BY id ASC
            """
        ).fetchall()
        conn.close()

        if rows:
            teams = []
            gallery = []
            for i, r in enumerate(rows):
                slug = (r["slug"] or "").strip()
                name = (r["team_name"] or slug or "Team").strip()

                img = (r["hero_image"] or r["og_image"] or "").strip()
                img = img or "/static/images/teams/default.webp"
                img = _asset_url(img)

                rec: Dict[str, Any] = {}
                raw = r["record"]
                if raw:
                    try:
                        rec = json.loads(raw) if isinstance(raw, str) else (raw or {})
                    except Exception:
                        rec = {}

                featured = bool(rec.get("featured", i < 3))
                tag = (rec.get("tag") or (slug.split("-")[0] if slug else "teams")).lower()

                team_obj = {
                    "id": slug or f"t{i+1}",
                    "name": name,
                    "featured": featured,
                    "photo": img,
                    # compatibility keys
                    "src": img,
                    "thumb": img,
                    "tag": tag,
                    "tags": rec.get("tags", []) if isinstance(rec.get("tags", []), list) else [],
                    "sort": rec.get("sort", (i + 1) * 10),
                    "meta": rec.get("meta", ""),
                }
                teams.append(team_obj)

                gallery.append(
                    {
                        "id": f"team-{team_obj['id']}",
                        "caption": name,
                        "alt": f"{name} photo",
                        "featured": featured,
                        "src": img,
                        "thumb": img,
                        "tag": tag,
                    }
                )

    except Exception as e:
        try:
            current_app.logger.debug("[teams] DB-first not available: %s", e)
        except Exception:
            pass
        teams, gallery = None, None

    _DB_TEAMS_CACHE["ts"] = now
    _DB_TEAMS_CACHE["teams"] = teams
    _DB_TEAMS_CACHE["gallery"] = gallery
    return teams, gallery


def _normalize_team_config(cfg: Mapping[str, Any]) -> Dict[str, Any]:
    team_name = _cfg_str(cfg.get("team_name"), cfg.get("teamName"), default="Our Team")
    theme_color = _cfg_str(cfg.get("theme_color"), cfg.get("themeColor"), default="#0ea5e9")
    fundraising_goal = cfg.get("fundraising_goal") or cfg.get("goal") or DEFAULT_FUNDRAISING_GOAL
    try:
        fundraising_goal = float(fundraising_goal)
    except Exception:
        fundraising_goal = float(DEFAULT_FUNDRAISING_GOAL)

    logo_raw = (
        cfg.get("logo_url")
        or cfg.get("logoUrl")
        or cfg.get("team_logo")
        or cfg.get("teamLogo")
        or cfg.get("logo")
        or ""
    )
    logo_url = _asset_url(_cfg_str(logo_raw)) or _asset_url("images/logo.webp")

    teams_in = cfg.get("teams") if isinstance(cfg.get("teams"), list) else []
    teams_out: List[Dict[str, Any]] = []
    for i, t in enumerate(teams_in):
        if not isinstance(t, dict):
            continue
        tid = _cfg_str(t.get("id"), default=f"t{i+1}")
        name = _cfg_str(t.get("name"), t.get("team_name"), default="Team")
        photo = _asset_url(_cfg_str(t.get("photo"), t.get("image"), t.get("src"), default=""))
        featured = bool(t.get("featured") or False)
        tags = t.get("tags") if isinstance(t.get("tags"), list) else []
        teams_out.append({"id": tid, "name": name, "photo": photo, "featured": featured, "tags": tags})

    gallery_in = cfg.get("gallery_items") if isinstance(cfg.get("gallery_items"), list) else []
    gallery_out: List[Dict[str, Any]] = []
    if gallery_in:
        for i, gi in enumerate(gallery_in):
            if not isinstance(gi, dict):
                continue
            src = _asset_url(_cfg_str(gi.get("src"), gi.get("photo"), default=""))
            if not src:
                continue
            gid = _cfg_str(gi.get("id"), default=f"g{i+1}")
            caption = _cfg_str(gi.get("caption"), default="")
            alt = _cfg_str(gi.get("alt"), default=(caption or "Team photo"))
            tag = _cfg_str(gi.get("tag"), default="teams")
            featured = bool(gi.get("featured") or False)
            thumb = _asset_url(_cfg_str(gi.get("thumb"), default=src)) or src
            gallery_out.append({"id": gid, "src": src, "thumb": thumb, "alt": alt, "caption": caption, "tag": tag, "featured": featured})
    else:
        seen: Set[str] = set()
        for t in teams_out:
            src = _cfg_str(t.get("photo"), default="")
            if not src or src in seen:
                continue
            seen.add(src)
            name = _cfg_str(t.get("name"), default="Team")
            tid = _cfg_str(t.get("id"), default=f"t{len(gallery_out)+1}")
            gallery_out.append({"id": f"team-{tid}", "src": src, "thumb": src, "alt": f"{name} photo", "caption": name, "tag": "teams", "featured": bool(t.get("featured"))})

    out = dict(cfg)
    out["team_name"] = team_name
    out["theme_color"] = theme_color
    out["fundraising_goal"] = fundraising_goal
    out["logo_url"] = logo_url
    # back-compat keys
    out["team_logo"] = logo_url
    out["logo"] = logo_url
    out["logoUrl"] = logo_url
    out["teams"] = teams_out
    out["gallery_items"] = gallery_out
    return out


def _team_cfg() -> Dict[str, Any]:
    """
    Single source of truth for team config:
    - base from g.team override OR TEAM_CONFIG
    - normalized
    - DB-first teams override (if present)
    """
    base = getattr(g, "team", None) or TEAM_CONFIG or {}
    if not isinstance(base, Mapping):
        base = {}
    cfg = _normalize_team_config(cast(Mapping[str, Any], base))

    db_teams, db_gallery = _load_db_teams_cached()
    if db_teams:
        cfg["teams"] = db_teams
        cfg["gallery_items"] = db_gallery or []

    return cfg


# ----------------------
# Email helpers
# ----------------------
def _send_email_in_app(app, msg: Message) -> None:
    with app.app_context():
        try:
            if mail:
                mail.send(msg)
        except Exception:
            current_app.logger.exception("Email send failed", extra={"recipients": getattr(msg, "recipients", None)})


def _queue_email(msg: Message) -> None:
    try:
        if not mail:
            return
        app = current_app._get_current_object()
        Thread(target=_send_email_in_app, args=(app, msg), daemon=True).start()
    except Exception:
        current_app.logger.exception("Failed to queue email")


def _create_thank_you_msg(name: str, email: str) -> Message:
    cfg = _team_cfg()
    team_name = cfg.get("team_name", "Our Team")
    return Message(
        subject=f"Thank you for supporting {team_name}!",
        recipients=[email],
        body=(
            f"Hi {name},\n\n"
            f"Thank you for your generous support of {team_name}!\n"
            "We appreciate your contribution and will keep you updated on our progress.\n\n"
            f"Best regards,\n{team_name} Team"
        ),
    )


# ----------------------
# DB helpers (sponsors / goal)
# ----------------------
@lru_cache(maxsize=64)
def _has_table_cached(table_name: str) -> bool:
    try:
        return bool(sa_inspect(db.engine).has_table(table_name))
    except Exception:
        return False


def _table_exists(model_or_name: Any) -> bool:
    try:
        name = getattr(model_or_name, "__tablename__", None) or str(model_or_name)
        return _has_table_cached(str(name))
    except Exception:
        return False


def _sponsor_query():
    if not Sponsor:
        return None
    if not _table_exists(getattr(Sponsor, "__tablename__", "sponsors")):
        return None

    q = db.session.query(Sponsor)
    if hasattr(Sponsor, "deleted_at"):
        q = q.filter(Sponsor.deleted_at.is_(None))
    if hasattr(Sponsor, "status"):
        q = q.filter(Sponsor.status == "approved")

    order_col = getattr(Sponsor, "amount", None) or getattr(Sponsor, "id", None)
    if order_col is not None:
        q = q.order_by(desc(order_col))
    return q


def _get_sponsors() -> Tuple[List[Any], float, Optional[Any]]:
    try:
        q = _sponsor_query()
        if q is None:
            return [], 0.0, None
        sponsors: List[Any] = q.all()
        total = float(sum((getattr(s, "amount", 0) or 0) for s in sponsors))
        top = sponsors[0] if sponsors else None
        return sponsors, total, top
    except Exception:
        current_app.logger.exception("Error loading sponsors")
        return [], 0.0, None


def _active_goal_amount() -> float:
    try:
        if CampaignGoal and _table_exists(getattr(CampaignGoal, "__tablename__", "campaign_goals")):
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
        current_app.logger.exception("Goal lookup failed; using fallback")

    cfg = _team_cfg()
    try:
        return float(cfg.get("fundraising_goal", DEFAULT_FUNDRAISING_GOAL))
    except Exception:
        return float(DEFAULT_FUNDRAISING_GOAL)


def _get_fundraising_stats() -> FundraisingStats:
    raised = 0.0
    try:
        if Sponsor and _table_exists(getattr(Sponsor, "__tablename__", "sponsors")) and hasattr(Sponsor, "amount"):
            q = db.session.query(func.coalesce(func.sum(Sponsor.amount), 0.0))
            if hasattr(Sponsor, "deleted_at"):
                q = q.filter(Sponsor.deleted_at.is_(None))
            if hasattr(Sponsor, "status"):
                q = q.filter(Sponsor.status == "approved")
            raised = float(q.scalar() or 0.0)
        else:
            sponsors, _, _ = _get_sponsors()
            raised = float(sum((getattr(s, "amount", 0) or 0) for s in sponsors))
    except Exception:
        current_app.logger.exception("Failed fetching total raised")
        raised = 0.0

    goal = _active_goal_amount() or 0.0
    percent = (raised / goal * 100.0) if goal else 0.0
    return FundraisingStats(raised=raised, goal=goal or None, percent_raised=percent)


# ----------------------
# Frontend config for homepage JS
# ----------------------
def _build_ff_config(context: Mapping[str, Any]) -> Dict[str, Any]:
    cfg = _team_cfg()
    team_name = cfg.get("team_name", "Our Team")

    goal_dollars = float(context.get("GOAL") or context.get("goal") or 0.0)
    raised_dollars = float(context.get("RAISED") or context.get("raised") or 0.0)

    sponsors_sorted = context.get("sponsors_sorted") or []
    donors_count = len(sponsors_sorted) if isinstance(sponsors_sorted, list) else int(context.get("donors") or 0)
    avg_gift = (raised_dollars / donors_count) if donors_count else 0.0

    teams = cfg.get("teams") if isinstance(cfg.get("teams"), list) else []
    gallery_items = cfg.get("gallery_items") if isinstance(cfg.get("gallery_items"), list) else []

    return {
        "brand": {
            "programName": cfg.get("program_name") or f"{team_name} Fundraiser",
            "programNameShort": cfg.get("program_short") or team_name,
            "programMeta": cfg.get("program_meta") or "Youth Program • Community Fundraiser",
            "seasonLabel": cfg.get("season_label") or "",
            "logoUrl": cfg.get("logo_url") or "",
            "initials": cfg.get("initials") or "FF",
            "themeColor": cfg.get("theme_color") or "#0ea5e9",
        },
        "campaign": {
            "currency": (cfg.get("currency") or DEFAULT_CURRENCY).lower(),
            "goalCents": _to_cents(goal_dollars),
            "raisedCents": _to_cents(raised_dollars),
            "donors": int(donors_count),
            "avgGiftCents": _to_cents(avg_gift),
            "endsAtISO": cfg.get("ends_at") or cfg.get("endsAt") or "",
            "countdownFallbackText": cfg.get("countdown_text") or "Campaign live",
        },
        "payments": {
            "stripePublishableKey": _env_publishable_key(),
            "paypalClientId": os.getenv("PAYPAL_CLIENT_ID", ""),
        },
        "ui": {
            "personas": PERSONAS_DEFAULT,
            "assetVersion": _asset_version(),
            "buildId": _build_id(),
        },
        "teams": teams,
        "galleryItems": gallery_items,
        # back-compat keys
        "gallery_items": gallery_items,
        "theme_color": cfg.get("theme_color") or "#0ea5e9",
        "org": {
            "name": cfg.get("team_name") or team_name,
            "location": cfg.get("location") or "",
            "logo": cfg.get("logo_url") or "",
        },
    }


def _ctx_etag(seed: Mapping[str, Any]) -> str:
    sponsors_len = 0
    try:
        sponsors_len = int(seed.get("sponsors_count") or 0)
    except Exception:
        sponsors_len = 0

    payload = "|".join(
        [
            str(int(float(seed.get("raised") or 0))),
            str(int(float(seed.get("goal") or 0))),
            str(int(float(seed.get("percent") or 0))),
            str(int(sponsors_len)),
            str(seed.get("build_id") or ""),
            str(seed.get("ff_cfg_hash") or ""),
            str(int(seed.get("tpl_mtime") or 0)),
            str(seed.get("ff_data_mode") or ""),
            str(bool(seed.get("smoke") or False)),
        ]
    )
    return _short_etag(payload)


def _ensure_jsonld_json(context: Dict[str, Any]) -> None:
    """
    Ensure context["jsonld_json"] is always a JSON string.
    """
    if "jsonld_json" in context:
        return
    context["jsonld_json"] = "{}"

    try:
        from jinja2.runtime import Undefined as _JinjaUndefined  # type: ignore

        def _clean(v):
            if isinstance(v, _JinjaUndefined):
                return None
            if isinstance(v, dict):
                out = {}
                for k, vv in v.items():
                    cv = _clean(vv)
                    if cv is not None:
                        out[k] = cv
                return out
            if isinstance(v, (list, tuple)):
                out = []
                for vv in v:
                    cv = _clean(vv)
                    if cv is not None:
                        out.append(cv)
                return out
            return v

        obj = context.get("jsonld_obj")
        if isinstance(obj, dict):
            context["jsonld_json"] = json.dumps(_clean(obj) or {}, ensure_ascii=False)
    except Exception:
        pass


# ----------------------
# Template context builder
# ----------------------
def _home_context() -> Dict[str, Any]:
    cfg = _team_cfg()

    sponsors_sorted, sponsors_total, top_sponsor = _get_sponsors()
    stats = _get_fundraising_stats()
    impact = _generate_impact_stats(cfg)

    sponsor_list_href = safe_url("main.sponsor_list", "/sponsors")
    become_sponsor_href = safe_url("main.become_sponsor", "/become-sponsor")
    donate_href = safe_url("main.donate", "/donate")
    stats_api_href = safe_url("main.stats_json", "/stats")

    goal_val = float(stats.goal or 0.0)
    raised_val = float(stats.raised or 0.0)
    pct_val = float(stats.percent_raised or 0.0)
    pct_int = int(round(pct_val)) if pct_val >= 0 else 0

    org_name = _cfg_str(cfg.get("team_name"), default="Our Team")
    org_location = _cfg_str(cfg.get("location"), default="")
    org_logo = _cfg_str(cfg.get("logo_url"), default="") or _asset_url("images/logo.webp")
    theme_color = _cfg_str(cfg.get("theme_color"), default="#f97316")

    # mode/smoke are injected by app/__init__.py (context_processor), but for ETag stability in dev
    ff_data_mode = _cfg_str(request.args.get("mode"), default="")
    smoke = (request.args.get("smoke") or "").strip().lower() in {"1", "true", "yes", "y", "on"}

    ctx: Dict[str, Any] = dict(
        team=cfg,
        org_name=org_name,
        org_location=org_location,
        org_logo=org_logo,
        theme_color=theme_color,
        teams=cfg.get("teams", []),
        gallery_items=cfg.get("gallery_items", []),
        about=_generate_about_section(cfg),
        challenge=_generate_challenge_section(cfg, impact),
        mission=_generate_mission_section(cfg, impact),
        stats=_prepare_stats(cfg, stats.raised, stats.goal or 0.0, stats.percent_raised),
        raised=raised_val,
        goal=goal_val,
        percent=pct_val,
        sponsors_total=sponsors_total,
        sponsors_sorted=sponsors_sorted,
        sponsor=top_sponsor,
        form=SponsorForm() if SponsorForm else None,
        stripe_pk=_env_publishable_key(),
        paypal_client_id=os.getenv("PAYPAL_CLIENT_ID", ""),
        sponsor_list_href=sponsor_list_href,
        become_sponsor_href=become_sponsor_href,
        donate_href=donate_href,
        stats_url=stats_api_href,
        BRAND_NAME=_cfg_str(cfg.get("brand_name"), default="FutureFunded"),
        BRAND_TAG=_cfg_str(cfg.get("brand_tag"), default="Flagship"),
        TEAM_NAME=org_name,
        TEAM_LOGO=org_logo,
        PLATFORM_LOGO=cfg.get("platform_logo") or url_for("static", filename="images/fundchamps-logo.svg"),
        RAISED=raised_val,
        GOAL=goal_val,
        PCT=pct_int,
        DONATE_URL=donate_href,
        SPONSOR_URL=become_sponsor_href,
        features={"digital_hub_enabled": True},
        personas=PERSONAS_DEFAULT,
        ff_data_mode=ff_data_mode,
        smoke=bool(smoke),
    )

    ctx["build_id"] = _build_id()
    ctx["asset_version"] = _asset_version()
    ctx["tpl_mtime"] = _template_mtime("index.html")

    # Build ff_config as dict; template should tojson it exactly once.
    ctx["ff_config"] = json_sanitize(_build_ff_config(ctx))
    ctx["ff_cfg_hash"] = _stable_json_hash(ctx["ff_config"])

    try:
        ctx["teams_count"] = len(ctx.get("teams") or [])
        ctx["gallery_count"] = len(ctx.get("gallery_items") or [])
    except Exception:
        ctx["teams_count"] = 0
        ctx["gallery_count"] = 0

    _ensure_jsonld_json(ctx)
    return ctx


# ----------------------
# Routes
# ----------------------
@bp.get("/")
def home():
    try:
        context = _home_context()

        etag = _ctx_etag(
            {
                "raised": context.get("raised", 0),
                "goal": context.get("goal", 0),
                "percent": context.get("percent", 0),
                "sponsors_count": len(context.get("sponsors_sorted") or []),
                "build_id": context.get("build_id", ""),
                "ff_cfg_hash": context.get("ff_cfg_hash", ""),
                "tpl_mtime": context.get("tpl_mtime", 0),
                "ff_data_mode": context.get("ff_data_mode", ""),
                "smoke": context.get("smoke", False),
            }
        )

        # Robust ETag check
        try:
            if request.if_none_match and request.if_none_match.contains(etag):
                resp = make_response("", 304)
                resp.set_etag(etag)
                return _nocache_html(resp)
        except Exception:
            if request.if_none_match and etag in request.if_none_match:
                resp = make_response("", 304)
                resp.set_etag(etag)
                return _nocache_html(resp)

        resp = make_response(render_template("index.html", **context))
        resp.set_etag(etag)
        resp.headers["X-FF-Build"] = str(context.get("build_id") or "")
        resp.headers["X-FF-Cfg"] = str(context.get("ff_cfg_hash") or "")
        resp.headers["X-FF-Teams"] = str(context.get("teams_count") or 0)
        resp.headers["X-FF-Gallery"] = str(context.get("gallery_count") or 0)
        return _nocache_html(resp)

    except Exception:
        current_app.logger.exception("Error rendering homepage")
        return _render_error("Homepage temporarily unavailable.", 500)


@bp.get("/teams.json")
def teams_debug():
    cfg = _team_cfg()
    teams = list(cfg.get("teams") or [])
    gallery_items = list(cfg.get("gallery_items") or [])
    logo_url = cfg.get("logo_url") or ""
    resp = jsonify(
        {
            "ok": True,
            "build_id": _build_id(),
            "asset_version": _asset_version(),
            "teams_count": len(teams),
            "gallery_count": len(gallery_items),
            "logo_url": logo_url,
            "teams": teams,
            "gallery_items": gallery_items,
        }
    )
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@bp.get("/stats")
def stats_json():
    try:
        cfg = _team_cfg()
        s = _get_fundraising_stats()
        sponsors_sorted, sponsors_total, _ = _get_sponsors()

        payload = {
            "team": cfg.get("team_name", "Our Team"),
            "raised": int(s.raised),
            "goal": int(s.goal or 0),
            "percent": round(s.percent_raised, 1),
            "sponsors_total": int(sponsors_total),
            "sponsors_count": len(sponsors_sorted),
            "raised_cents": _to_cents(s.raised),
            "goal_cents": _to_cents(s.goal or 0),
            "as_of": datetime.utcnow().isoformat() + "Z",
        }

        etag = _short_etag(json.dumps(payload, sort_keys=True, separators=(",", ":")))
        try:
            if request.if_none_match and request.if_none_match.contains(etag):
                resp = make_response("", 304)
                resp.set_etag(etag)
                resp.cache_control.public = True
                resp.cache_control.max_age = 30
                return resp
        except Exception:
            if request.if_none_match and etag in request.if_none_match:
                resp = make_response("", 304)
                resp.set_etag(etag)
                resp.cache_control.public = True
                resp.cache_control.max_age = 30
                return resp

        resp = make_response(jsonify(payload))
        resp.set_etag(etag)
        resp.cache_control.public = True
        resp.cache_control.max_age = 30
        return resp

    except Exception:
        current_app.logger.exception("Stats endpoint failed")
        cfg = _team_cfg()
        fallback = {
            "team": cfg.get("team_name", "Our Team"),
            "raised": 0,
            "goal": int(cfg.get("fundraising_goal", DEFAULT_FUNDRAISING_GOAL)),
            "percent": 0.0,
            "sponsors_total": 0,
            "sponsors_count": 0,
            "raised_cents": 0,
            "goal_cents": _to_cents(cfg.get("fundraising_goal", DEFAULT_FUNDRAISING_GOAL)),
            "as_of": datetime.utcnow().isoformat() + "Z",
        }
        resp = make_response(jsonify(fallback), 200)
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp


@bp.get("/sponsors")
def sponsor_list():
    page = request.args.get("page", 1, type=int)
    sponsors: List[Any] = []
    pagination = None

    q = _sponsor_query()
    if q is None:
        return render_template("sponsor_list.html", sponsors=sponsors, pagination=pagination)

    try:
        try:
            pagination = q.paginate(page=page, per_page=SPONSORS_PER_PAGE, error_out=False)  # type: ignore[attr-defined]
            sponsors = list(pagination.items)  # type: ignore[assignment]
        except Exception:
            sponsors = q.limit(SPONSORS_PER_PAGE).offset((page - 1) * SPONSORS_PER_PAGE).all()
            pagination = None
    except Exception:
        current_app.logger.exception("Error fetching sponsors list")
        sponsors, pagination = [], None

    return render_template("sponsor_list.html", sponsors=sponsors, pagination=pagination)


@bp.route("/become-sponsor", methods=["GET", "POST"])
def become_sponsor():
    form = SponsorForm() if SponsorForm else None
    if not form:
        flash("Sponsorship form is temporarily unavailable.", "danger")
        return redirect(url_for("main.home"))

    if form.validate_on_submit():
        name = (_cfg_str(getattr(form, "name", None).data) if hasattr(form, "name") else "").strip() or None  # type: ignore[attr-defined]
        email = (_cfg_str(getattr(form, "email", None).data) if hasattr(form, "email") else "").lower().strip() or None  # type: ignore[attr-defined]

        try:
            amt = Decimal(str(getattr(form, "amount", None).data if hasattr(form, "amount") else "0"))  # type: ignore[attr-defined]
        except Exception:
            amt = Decimal("0")

        if not Sponsor or not _table_exists(getattr(Sponsor, "__tablename__", "sponsors")):
            if email:
                _queue_email(_create_thank_you_msg(name or "Friend", email))
            flash("Thank you for your sponsorship!", "success")
            return redirect(url_for("main.home"))

        try:
            sponsor = Sponsor(name=name, email=email, amount=float(amt), status="pending")
            with db.session.begin():
                db.session.add(sponsor)

            if sponsor.email:
                _queue_email(_create_thank_you_msg(sponsor.name or "Friend", sponsor.email))

            flash("Thank you for your sponsorship!", "success")
            return redirect(url_for("main.home"))
        except Exception:
            current_app.logger.exception("Sponsor submission error", extra={"name": name, "amount": float(amt)})
            flash("Unable to process sponsorship right now.", "danger")
            return render_template("become_sponsor.html", form=form), 500

    if request.method == "POST":
        flash("Please correct the errors in the form.", "warning")
        return render_template("become_sponsor.html", form=form), 400

    return render_template("become_sponsor.html", form=form)


@bp.route("/donate", methods=["GET", "POST"])
def donate():
    if SponsorForm is None:
        current_app.logger.error("SponsorForm is not available; /donate is disabled.")
        flash("Donation form is temporarily unavailable. Please try again later.", "danger")
        return redirect(url_for("main.home"))

    form = SponsorForm()
    prefill = {
        "name": _cfg_str(request.args.get("prefill_name"), default=""),
        "email": _cfg_str(request.args.get("prefill_email"), default=""),
        "amount": _cfg_str(request.args.get("prefill_amount"), default=""),
        "frequency": _cfg_str(request.args.get("prefill_frequency"), default="once") or "once",
        "source": _cfg_str(request.args.get("source"), default=""),
    }

    if request.method == "GET":
        if prefill["name"] and hasattr(form, "name"):
            form.name.data = prefill["name"]  # type: ignore[attr-defined]
        if prefill["email"] and hasattr(form, "email"):
            form.email.data = prefill["email"]  # type: ignore[attr-defined]
        if prefill["amount"] and hasattr(form, "amount"):
            try:
                form.amount.data = Decimal(prefill["amount"])  # type: ignore[attr-defined]
            except Exception:
                current_app.logger.debug("Ignoring invalid prefill_amount=%r", prefill["amount"])
        if hasattr(form, "frequency"):
            form.frequency.data = prefill["frequency"]  # type: ignore[attr-defined]
        if hasattr(form, "source"):
            form.source.data = prefill["source"]  # type: ignore[attr-defined]

        return render_template("donate.html", form=form, prefill=prefill)

    if not form.validate_on_submit():
        flash("Please fix the highlighted errors and try again.", "warning")
        return render_template("donate.html", form=form, prefill=prefill), 400

    def _field_value(obj: Any, name: str, default: str = "") -> Any:
        return getattr(obj, name).data if hasattr(obj, name) else default

    name = (_cfg_str(_field_value(form, "name", "Friend")) or "Friend").strip()
    email = (_cfg_str(_field_value(form, "email", "")) or "").strip().lower()

    raw_amount = _field_value(form, "amount", "0")
    try:
        amount = float(Decimal(str(raw_amount)))
    except Exception:
        amount = 0.0

    frequency = _cfg_str(request.form.get("frequency"), prefill["frequency"], default="once")
    source = _cfg_str(request.form.get("source"), prefill["source"], default="")

    current_app.logger.info(
        "Donation submitted",
        extra={"email": email, "amount": amount, "frequency": frequency, "source": source},
    )

    if email:
        try:
            cfg = _team_cfg()
            _queue_email(
                Message(
                    subject="Thank you for your donation!",
                    recipients=[email],
                    body=(
                        f"Hi {name},\n\n"
                        f"Thank you for your generous donation of ${amount:,.2f}.\n\n"
                        f"Best,\n{cfg.get('team_name', 'Our Team')} Team"
                    ),
                )
            )
        except Exception:
            current_app.logger.exception("Donation thank-you email failed", extra={"email": email, "amount": amount})
            flash("Donation received but email failed to send. We’ll still put it to work!", "info")

    flash("Thank you for your donation!", "success")
    return redirect(url_for("main.home"))


@bp.get("/thank-you")
def thank_you():
    org_slug = _cfg_str(request.args.get("org"), request.args.get("org_slug"), default="default")

    raw_amount = _cfg_str(request.args.get("amount"), default="0")
    try:
        amount = float(Decimal(str(raw_amount)))
    except Exception:
        amount = 0.0

    return_url = url_for("main.home")

    org = None
    try:
        if org_slug:
            org = Org.query.filter_by(slug=org_slug).first()
        if org is None:
            org = Org.query.first()
    except Exception:
        current_app.logger.exception("thank-you org lookup failed")
        org = None

    if org is None:
        cfg = _team_cfg()
        org = SimpleNamespace(slug=org_slug or "default", name=(cfg.get("team_name", "Our Team")))

    try:
        return render_template("thank_you.html", org=org, amount=amount, return_url=return_url)
    except Exception:
        current_app.logger.exception("thank-you template render failed; using fallback")
        html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thank you</title></head>
<body style="font-family:system-ui; padding:24px;">
<h1>Thank you</h1>
<p>We appreciate your support{" of $" + format(amount, ",.2f") if amount else ""}.</p>
<p><a href="{return_url}">Back to fundraiser</a></p>
</body></html>"""
        return Response(html, mimetype="text/html", status=200)


@bp.get("/tiers")
def tiers():
    cfg = _team_cfg()
    tiers_list = list(cast(List[Dict[str, Any]], cfg.get("tiers") or [])) if hasattr(cfg, "get") else []
    if not tiers_list:
        tiers_list = DEFAULT_TIERS

    mode = _cfg_str(request.args.get("mode"), default="").lower()
    fragment_tpl = "embed/tiers_inline.html" if mode == "inline" else "embed/tiers_sheet.html"
    wants_fragment = (request.args.get("embed") in ("1", "true", "yes") or bool(request.headers.get("X-Partial")))

    if wants_fragment:
        if not _template_exists(fragment_tpl):
            return make_response("Not Found", 404)
        html = render_template(fragment_tpl, tiers=tiers_list, team=cfg)
        return Response(html, mimetype="text/html", status=200)

    if _template_exists("tiers.html"):
        return render_template("tiers.html", tiers=tiers_list, team=cfg)

    if _template_exists(fragment_tpl):
        fragment = render_template(fragment_tpl, tiers=tiers_list, team=cfg)
    else:
        fragment = "<main style='font-family:system-ui; padding:24px;'><h1>Tiers</h1></main>"

    if "</head" in fragment.lower():
        return Response(fragment, mimetype="text/html", status=200)

    return Response(_wrap_document("Sponsorship Tiers", fragment), mimetype="text/html", status=200)


@bp.post("/api/checkout/session")
def api_checkout_session():
    data = request.get_json(silent=True) or {}

    amount_cents = int(data.get("amount_cents") or 0)
    currency = _cfg_str(data.get("currency"), default=DEFAULT_CURRENCY).lower()
    frequency = _cfg_str(data.get("frequency"), default="once").lower()

    if amount_cents < MIN_DONATION_CENTS:
        return jsonify({"error": "amount_too_small"}), 400

    secret = current_app.config.get("STRIPE_SECRET_KEY") or os.getenv("STRIPE_SECRET_KEY", "")
    if not secret or stripe is None:
        return jsonify({"error": "checkout_not_configured"}), 501

    stripe.api_key = secret

    donor = data.get("donor") or {}
    donor_email = _cfg_str(donor.get("email"), default="") or None
    donor_name = _cfg_str(donor.get("name"), default="")

    mode = "subscription" if frequency == "monthly" else "payment"

    if mode == "subscription":
        line_items = [
            {
                "price_data": {
                    "currency": currency,
                    "unit_amount": amount_cents,
                    "recurring": {"interval": "month"},
                    "product_data": {"name": "Monthly donation"},
                },
                "quantity": 1,
            }
        ]
    else:
        line_items = [
            {
                "price_data": {
                    "currency": currency,
                    "unit_amount": amount_cents,
                    "product_data": {"name": "Donation"},
                },
                "quantity": 1,
            }
        ]

    success_url = url_for("main.thank_you", _external=True) + "?amount=" + str(round(amount_cents / 100, 2))
    cancel_url = url_for("main.home", _external=True) + "#donate"

    session = stripe.checkout.Session.create(
        mode=mode,
        line_items=line_items,
        customer_email=donor_email,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "donor_name": donor_name,
            "team": str((_team_cfg().get("team_name") or "team")),
            **{str(k): str(v) for k, v in (data.get("meta") or {}).items()},
        },
    )

    return jsonify({"url": session.url})


@bp.post("/checkout")
def checkout_fallback():
    flash("Checkout is loading—please try again.", "info")
    return redirect(url_for("main.home") + "#donate")
