from __future__ import annotations

"""
Main web blueprint (FutureFunded)

This blueprint is designed for a setup with:
  - templates/index.html
  - static/js/ff-app.js
  - static/css/ff.css

Key guarantees:
- Teams + team photos are ALWAYS sourced from TEAM_CONFIG (or g.team override), and injected into:
  - template context: context["teams"], context["gallery_items"]
  - frontend JSON: context["ff_config"]["teams"], context["ff_config"]["galleryItems"]
- Logo URL is ALWAYS normalized into cfg["logo_url"] and exposed as:
  - template context: org_logo / TEAM_LOGO
  - ff_config: brand.logoUrl and org.logo
- Asset URLs under /static are cache-busted via ?v=<asset_version> to mitigate stale CDN/Cloudflare cache.
- ETag changes when:
  - raised/goal/percent changes
  - sponsors count changes
  - ff_config hash changes (includes teams/gallery/build_id)
  - template file mtime changes (index.html)
"""

import hashlib
import os
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

# Optional models/imports (graceful fallback in non-prod / test)
try:
    from app.models.campaign_goal import CampaignGoal  # type: ignore
except Exception:  # pragma: no cover
    CampaignGoal = None  # type: ignore

try:
    from app.models.sponsor import Sponsor  # type: ignore
except Exception:  # pragma: no cover
    Sponsor = None  # type: ignore

# Local team config (single-source for team photos)
try:
    from app.config.team_config import TEAM_CONFIG  # type: ignore
except Exception:  # pragma: no cover
    TEAM_CONFIG = {
        "team_name": "Connect ATX Elite",
        "fundraising_goal": 10_000,
        "theme_color": "#f59e0b",
        # Put photos in /static/images/teams/... and reference "images/teams/<file>"
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

# Bump this any time you change index.html structure or ff-app contract expectations.
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
def _build_id() -> str:
    return (
        os.getenv("FF_BUILD_ID")
        or os.getenv("ASSET_VERSION")
        or os.getenv("GIT_COMMIT")
        or DEFAULT_BUILD_ID
    ).strip() or DEFAULT_BUILD_ID


def _asset_version() -> str:
    return (os.getenv("ASSET_VERSION") or os.getenv("GIT_COMMIT") or _build_id()).strip()


def _env_publishable_key() -> str:
    return os.getenv("STRIPE_PUBLISHABLE_KEY") or os.getenv("STRIPE_PUBLIC_KEY") or ""


def safe_url(endpoint: str, default: str) -> str:
    try:
        return url_for(endpoint)
    except Exception:
        return default


def _nocache_html(resp: Response) -> Response:
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


def _short_etag(seed: str) -> str:
    return sha1(seed.encode("utf-8")).hexdigest()[:12]


def _stable_json_hash(obj: Any) -> str:
    try:
        import json

        s = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return hashlib.sha1(s).hexdigest()[:12]
    except Exception:
        return _short_etag(str(obj))


def _template_mtime(name: str) -> int:
    try:
        loader = current_app.jinja_loader
        if not loader:
            return 0
        source, filename, uptodate = loader.get_source(current_app.jinja_env, name)
        if filename and os.path.exists(filename):
            return int(os.path.getmtime(filename))
    except Exception:
        pass
    return 0


def _ctx_etag(seed_dict: Mapping[str, Any]) -> str:
    sponsors_len = 0
    try:
        sponsors_len = len(seed_dict.get("sponsors_sorted") or [])
    except Exception:
        sponsors_len = 0

    seed = "|".join(
        [
            str(int(seed_dict.get("raised", 0) or 0)),
            str(int(seed_dict.get("goal", 0) or 0)),
            str(int(float(seed_dict.get("percent", 0) or 0))),
            str(int(sponsors_len)),
            str(seed_dict.get("build_id") or ""),
            str(seed_dict.get("ff_cfg_hash") or ""),
            str(int(seed_dict.get("tpl_mtime") or 0)),
        ]
    )
    return _short_etag(seed)


def _to_cents(amount: Any) -> int:
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
        return render_template("index.html", message=message), status
    except Exception:
        return message, status
        

def _ff_json_dumps(obj) -> str:
    """Stable JSON for embedding inside <script type=application/json>."""
    import json
    from decimal import Decimal
    from datetime import datetime

    def _clean(v):
        if isinstance(v, Decimal):
            return float(v)
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, dict):
            return {k: _clean(x) for k, x in v.items() if x is not None}
        if isinstance(v, (list, tuple)):
            return [_clean(x) for x in v if x is not None]
        return v

    return json.dumps(_clean(obj), ensure_ascii=False, separators=(",", ":"))

    def _clean(v):
        if isinstance(v, Decimal):
            return float(v)
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, dict):
            return {k: _clean(x) for k, x in v.items() if x is not None}
        if isinstance(v, (list, tuple)):
            return [_clean(x) for x in v if x is not None]
        return v

    return json.dumps(_clean(obj), ensure_ascii=False, separators=(",", ":"))


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
    Normalize asset URLs. Supports:
      - absolute https://...
      - absolute /static/...
      - relative "images/teams/x.jpg" (resolved via url_for('static', filename=...))
    Adds cache-bust query (?v=...) to mitigate CDN staleness for /static/.
    """
    s = (raw or "").strip()
    if not s:
        return ""

    # absolute URL
    if "://" in s or s.startswith("//"):
        return s

    # absolute path
    if s.startswith("/"):
        out = s
    else:
        try:
            out = url_for("static", filename=s.lstrip("/"))
        except Exception:
            out = f"/static/{s.lstrip('/')}"

    v = _asset_version()
    if v and out.startswith("/static/"):
        joiner = "&" if "?" in out else "?"
        out = f"{out}{joiner}v={v}"
    return out


def _normalize_team_config(cfg: Mapping[str, Any]) -> Dict[str, Any]:
    """
    Ensures expected keys exist and normalizes teams/photos/logo.
    """
    team_name = str(cfg.get("team_name") or cfg.get("teamName") or "Our Team").strip()
    theme_color = str(cfg.get("theme_color") or cfg.get("themeColor") or "#0ea5e9").strip()
    fundraising_goal = cfg.get("fundraising_goal") or cfg.get("goal") or DEFAULT_FUNDRAISING_GOAL

    try:
        fundraising_goal = float(fundraising_goal)
    except Exception:
        fundraising_goal = float(DEFAULT_FUNDRAISING_GOAL)

    # ✅ Normalize org logo into a single canonical key: logo_url
    logo_raw = (
        cfg.get("logo_url")
        or cfg.get("logoUrl")
        or cfg.get("team_logo")
        or cfg.get("teamLogo")
        or cfg.get("logo")
        or ""
    )
    logo_url = _asset_url(str(logo_raw)) or _asset_url("images/logo.webp")

    teams_in = cfg.get("teams") if isinstance(cfg.get("teams"), list) else []
    teams_out: List[Dict[str, Any]] = []

    for i, t in enumerate(teams_in):
        if not isinstance(t, dict):
            continue
        tid = str(t.get("id") or f"t{i+1}").strip()
        name = str(t.get("name") or t.get("team_name") or "Team").strip()
        photo = _asset_url(str(t.get("photo") or t.get("image") or t.get("src") or "").strip())
        featured = bool(t.get("featured") or False)
        tags = t.get("tags") if isinstance(t.get("tags"), list) else []
        teams_out.append(
            {
                "id": tid,
                "name": name,
                "photo": photo,
                "featured": featured,
                "tags": tags,
            }
        )

    # Normalize gallery items if provided; else derive from teams.
    gallery_in = cfg.get("gallery_items") if isinstance(cfg.get("gallery_items"), list) else []
    gallery_out: List[Dict[str, Any]] = []

    if gallery_in:
        for i, gi in enumerate(gallery_in):
            if not isinstance(gi, dict):
                continue
            src = _asset_url(str(gi.get("src") or gi.get("photo") or "").strip())
            if not src:
                continue
            gid = str(gi.get("id") or f"g{i+1}").strip()
            caption = str(gi.get("caption") or "").strip()
            alt = str(gi.get("alt") or caption or "Team photo").strip()
            tag = str(gi.get("tag") or "teams").strip()
            featured = bool(gi.get("featured") or False)
            gallery_out.append(
                {
                    "id": gid,
                    "src": src,
                    "thumb": _asset_url(str(gi.get("thumb") or src).strip()) or src,
                    "alt": alt,
                    "caption": caption,
                    "tag": tag,
                    "featured": featured,
                }
            )
    else:
        seen: Set[str] = set()
        for t in teams_out:
            src = str(t.get("photo") or "").strip()
            if not src or src in seen:
                continue
            seen.add(src)
            name = str(t.get("name") or "Team").strip()
            tid = str(t.get("id") or "").strip() or f"t{len(gallery_out)+1}"
            first = name.split()[0].lower() if name.split() else "teams"
            tag = first if first.endswith(("st", "nd", "rd", "th")) else "teams"
            gallery_out.append(
                {
                    "id": f"team-{tid}",
                    "src": src,
                    "thumb": src,
                    "alt": f"{name} photo",
                    "caption": name,
                    "tag": tag,
                    "featured": bool(t.get("featured")),
                }
            )

    out = dict(cfg)
    out.setdefault("team_name", team_name)
    out.setdefault("theme_color", theme_color)
    out["fundraising_goal"] = fundraising_goal

    # ✅ Canonicalized logo fields (template + JS compatibility)
    out["logo_url"] = logo_url
    out["team_logo"] = logo_url
    out["logo"] = logo_url
    out["logoUrl"] = logo_url

    out["teams"] = teams_out
    out["gallery_items"] = gallery_out
    return out


def _team_cfg() -> Mapping[str, Any]:
    """
    Single source of truth for "current team config".
    Supports g.team overrides (multi-tenant / per-org overrides later).
    """
    base = getattr(g, "team", None) or TEAM_CONFIG or {}
    if not isinstance(base, Mapping):
        base = {}
    return cast(Mapping[str, Any], _normalize_team_config(cast(Mapping[str, Any], base)))


# ----------------------
# Async email
# ----------------------
def _send_email_in_app(app, msg: Message) -> None:
    with app.app_context():
        try:
            mail.send(msg)
            current_app.logger.info("Email sent", extra={"recipients": msg.recipients})
        except Exception:
            current_app.logger.exception("Email send failed", extra={"recipients": getattr(msg, "recipients", None)})


def _queue_email(msg: Message) -> None:
    try:
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
# DB helpers
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
            "initials": cfg.get("initials") or "FC",
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
        "checkout": {
            "endpoint": "/api/checkout/session",
            "method": "POST",
        },
        "ui": {
            "personas": PERSONAS_DEFAULT,
            "assetVersion": _asset_version(),
            "buildId": _build_id(),
        },
        # ✅ Teams + gallery for frontend
        "teams": teams,
        "galleryItems": gallery_items,
        # ✅ Back-compat keys (harmless if unused)
        "gallery_items": gallery_items,
        "theme_color": cfg.get("theme_color") or "#0ea5e9",
        "org": {
            "name": cfg.get("team_name") or team_name,
            "location": cfg.get("location") or "",
            "logo": cfg.get("logo_url") or "",
        },
    }


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

    org_name = str(cfg.get("team_name", "Our Team"))
    org_location = str(cfg.get("location") or "")
    org_logo = str(cfg.get("logo_url") or "") or _asset_url("images/logo.webp")
    theme_color = str(cfg.get("theme_color") or "#f97316")

    ctx: Dict[str, Any] = dict(
        team=cfg,

        # ✅ direct template consumption (index.html)
        org_name=org_name,
        org_location=org_location,
        org_logo=org_logo,
        theme_color=theme_color,

        # ✅ Make teams and gallery available to template
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

        BRAND_NAME=cfg.get("brand_name", "FundChamps"),
        BRAND_TAG=cfg.get("brand_tag", "White-Label"),

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
    )

    ctx["build_id"] = _build_id()
    ctx["ff_config"] = json_sanitize(_build_ff_config(ctx))
    ctx["ff_cfg_hash"] = _stable_json_hash(ctx["ff_config"])
    ctx["tpl_mtime"] = _template_mtime("index.html")
    return ctx


def _etag_seed_for_home(ctx: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "raised": ctx.get("raised", 0),
        "goal": ctx.get("goal", 0),
        "percent": ctx.get("percent", 0),
        "sponsors_sorted": ctx.get("sponsors_sorted", []),
        "build_id": ctx.get("build_id", ""),
        "ff_cfg_hash": ctx.get("ff_cfg_hash", ""),
        "tpl_mtime": ctx.get("tpl_mtime", 0),
    }
def _ensure_jsonld_json(context: dict) -> None:
    """
    Ensure context["jsonld_json"] is always a JSON string (never Undefined).
    Keeps templates stable when jsonld_obj contains Jinja Undefined values.
    """
    if "jsonld_json" in context:
        return

    context["jsonld_json"] = "{}"
    try:
        import json as _json
        try:
            from jinja2.runtime import Undefined as _JinjaUndefined  # type: ignore
        except Exception:
            _JinjaUndefined = ()  # type: ignore

        def _clean(v):
            if _JinjaUndefined and isinstance(v, _JinjaUndefined):  # type: ignore[arg-type]
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
            context["jsonld_json"] = _json.dumps(_clean(obj) or {}, ensure_ascii=False)
    except Exception:
        pass


def _normalize_teams(cfg: dict) -> tuple[list, list, str]:
    """
    Normalize cfg into (teams:list, gallery_items:list, logo_url:str).
    Handles teams being a dict wrapper like {"enabled":..., "items":[...]}.
    """
    teams = cfg.get("teams") or []
    gallery_items = cfg.get("gallery_items") or []
    logo_url = cfg.get("logo_url") or ""

    # teams could be {"enabled": True, "items": [...]}
    if isinstance(teams, dict):
        teams = teams.get("items") or teams.get("teams") or []

    if isinstance(gallery_items, dict):
        gallery_items = gallery_items.get("items") or []

    if not isinstance(teams, list):
        teams = []
    if not isinstance(gallery_items, list):
        gallery_items = []
    if not isinstance(logo_url, str):
        logo_url = str(logo_url or "")

    return teams, gallery_items, logo_url


def _make_gallery_from_teams(teams: list) -> list:
    """
    If gallery_items isn't configured, derive it from teams (best-effort).
    """
    out = []
    for i, t in enumerate(teams or []):
        if not isinstance(t, dict):
            continue
        tid = str(t.get("id") or t.get("slug") or f"team-{i}")
        name = str(t.get("name") or t.get("title") or tid)
        src = str(t.get("src") or t.get("image") or t.get("thumb") or "/static/images/teams/default.webp")
        featured = bool(t.get("featured", i < 3))
        tag = str(t.get("tag") or (tid.split("-")[0] if "-" in tid else tid)).lower()

        out.append(
            {
                "id": f"team-{tid}",
                "caption": name,
                "alt": f"{name} photo",
                "featured": featured,
                "src": src,
                "thumb": src,
                "tag": tag,
            }
        )
    return out

# ----------------------
# DB-first Teams Helpers (TURNKEY)
# ----------------------
def _db_path_appdb():
    from pathlib import Path
    from flask import current_app
    return Path(current_app.root_path) / "data" / "app.db"


def _load_db_teams():
    """
    Returns (teams, gallery_items) if DB has non-deleted teams, else (None, None).
    Safe if DB/table missing.
    """
    try:
        import sqlite3, json
        from flask import current_app

        db_path = _db_path_appdb()
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

        if not rows:
            return None, None

        teams = []
        gallery_items = []

        for i, r in enumerate(rows):
            slug = (r["slug"] or "").strip()
            name = (r["team_name"] or slug or "Team").strip()

            img = (r["hero_image"] or r["og_image"] or "").strip()
            if not img:
                img = "/static/images/teams/default.webp"

            rec = {}
            raw = r["record"]
            if raw:
                try:
                    rec = json.loads(raw) if isinstance(raw, str) else (raw or {})
                except Exception:
                    rec = {}

            featured = bool(rec.get("featured", i < 3))
            tag = (rec.get("tag") or slug.split("-")[0]).lower()

            # Keep compatibility with your existing front-end shape
            team_obj = {
                "id": slug,            # IMPORTANT: use DB slug as canonical id
                "name": name,
                "featured": featured,
                "photo": img,
                "src": img,            # extra compatibility if UI uses src/thumb
                "thumb": img,
                "tag": tag,
                "tags": rec.get("tags", []) if isinstance(rec.get("tags", []), list) else [],
            }
            teams.append(team_obj)

            gallery_items.append(
                {
                    "id": f"team-{slug}",
                    "caption": name,
                    "alt": f"{name} photo",
                    "featured": featured,
                    "src": img,
                    "thumb": img,
                    "tag": tag,
                }
            )

        try:
            current_app.logger.info("[teams] DB-first active: %s", [t["id"] for t in teams])
        except Exception:
            pass

        return teams, gallery_items

    except Exception as e:
        try:
            from flask import current_app
            current_app.logger.warning("[teams] DB-first failed: %s", e)
        except Exception:
            pass
        return None, None


def _apply_db_teams_override(cfg: dict, context: dict | None = None):
    """
    Mutates cfg and/or context in-place if DB teams exist.
    - cfg['teams'], cfg['gallery_items']
    - context['teams'], context['gallery_items']
    """
    teams, gallery_items = _load_db_teams()
    if not teams:
        return

    cfg["teams"] = teams
    cfg["gallery_items"] = gallery_items

    if context is not None:
        context["teams"] = teams
        context["gallery_items"] = gallery_items


# ----------------------
# Routes (TURNKEY DROP-IN)
# ----------------------
@bp.get("/")
def home():
    try:
        faqs = [
            {"q": "Is my gift tax-deductible?", "a": "Yes. We’ll email a receipt right away."},
            {"q": "Can I sponsor anonymously?", "a": "Yes—toggle anonymous at checkout."},
            {"q": "Corporate matching?", "a": "Yes. We’ll include the info HR portals need."},
            {"q": "Refunds/cancellations?", "a": "Email support and we’ll help."},
            {"q": "Where does it go?", "a": "Program costs, travel, uniforms—updated live."},
        ]

        context = _home_context()
        context["faqs"] = faqs

        # ✅ DB-first teams: pull from /teams.json logic by calling _team_cfg() + DB override once
        # If you prefer, you can call teams_debug() internals; here we inline minimal approach:
        try:
            # Reuse the same DB override behavior as /teams.json by simply calling it and reading cfg again
            # (lowest risk: single source)
            cfg = _team_cfg()
            context["team"] = cfg  # if templates use it

            # Option A: if your _home_context already sets teams/gallery_items, keep them
            # Option B (safer): fetch DB-first from local endpoint logic (no HTTP):
            # We'll copy the same DB-first block used above:
            import sqlite3, json
            from pathlib import Path

            db_path = Path(current_app.root_path) / "data" / "app.db"
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
                gallery_items = []
                for i, r in enumerate(rows):
                    slug = r["slug"]
                    name = r["team_name"]
                    img = r["hero_image"] or r["og_image"] or "/static/images/teams/default.webp"

                    rec = {}
                    if r["record"]:
                        try:
                            rec = json.loads(r["record"]) if isinstance(r["record"], str) else (r["record"] or {})
                        except Exception:
                            rec = {}

                    featured = bool(rec.get("featured", i < 3))
                    tag = (rec.get("tag") or slug.split("-")[0]).lower()

                    teams.append(
                        {
                            "id": slug,
                            "name": name,
                            "featured": featured,
                            "photo": img,
                            "src": img,
                            "thumb": img,
                            "tag": tag,
                            "tags": rec.get("tags") or ([] if not tag else [tag]),
                            "sort": rec.get("sort", (i + 1) * 10),
                            "meta": rec.get("meta", ""),
                            "goal": rec.get("goal"),
                            "raised": rec.get("raised"),
                            "ask": rec.get("ask"),
                        }
                    )

                    gallery_items.append(
                        {
                            "id": f"team-{slug}",
                            "caption": name,
                            "alt": f"{name} photo",
                            "featured": featured,
                            "src": img,
                            "thumb": img,
                            "tag": tag,
                        }
                    )

                context["teams"] = teams
                context["gallery_items"] = gallery_items

        except Exception as e:
            current_app.logger.warning("[home] DB teams override failed: %s", e)

        # ✅ Build ffConfig ONCE, from context
        ff_config = {
            "org": {
                "name": (context.get("team_name") or context.get("org_name") or ""),
                "meta": (context.get("org_meta") or ""),
                "heroAccentLine": (context.get("hero_accent_line") or ""),
                "footerTagline": (context.get("footer_tagline") or ""),
            },
            "fundraiser": {
                "goalAmount": context.get("fundraising_goal"),
                "raisedAmount": context.get("raised_amount"),
                "deadlineISO": context.get("deadline_iso"),
            },
            "teams": context.get("teams") or [],
            "gallery": {
                "enabled": True,
                "items": context.get("gallery_items") or [],
            },
            "sponsors": context.get("sponsors") or {},
            "flagship": {
                "version": str(context.get("turnkey_version") or context.get("TURNKEY") or "15.0.0"),
                "build": str(context.get("build_id") or _build_id()),
            },
        }
        context["ff_config_json"] = _ff_json_dumps(ff_config)

        # ✅ Now compute ETag AFTER we’ve finalized the context
        etag = _ctx_etag(_etag_seed_for_home(context))

        if request.if_none_match and etag in request.if_none_match:
            resp = make_response("", 304)
            resp.set_etag(etag)
            _nocache_html(resp)
            return resp

        # JSON-LD stabilization (keep your existing logic)
        if "jsonld_json" not in context:
            context["jsonld_json"] = "{}"
            try:
                import json as _json
                from jinja2.runtime import Undefined as _JinjaUndefined

                def _ff__clean(v):
                    if isinstance(v, _JinjaUndefined):
                        return None
                    if isinstance(v, dict):
                        return {k: _ff__clean(x) for k, x in v.items() if _ff__clean(x) is not None}
                    if isinstance(v, (list, tuple)):
                        return [x for x in (_ff__clean(i) for i in v) if x is not None]
                    return v

                _obj = context.get("jsonld_obj")
                if isinstance(_obj, dict):
                    context["jsonld_json"] = _json.dumps(_ff__clean(_obj) or {}, ensure_ascii=False)
            except Exception:
                pass

        resp = make_response(render_template("index.html", **context))
        resp.set_etag(etag)

        resp.headers["X-FF-Build"] = str(context.get("build_id") or "")
        resp.headers["X-FF-Cfg"] = str(context.get("ff_cfg_hash") or "")
        resp.headers["X-FF-Teams"] = str(len(context.get("teams") or []))
        resp.headers["X-FF-Gallery"] = str(len(context.get("gallery_items") or []))

        _nocache_html(resp)
        return resp

    except Exception:
        current_app.logger.exception("Error rendering homepage")
        return _render_error("Homepage temporarily unavailable.", 500)


@bp.get("/teams.json")
def teams_debug():
    """
    Contract used by ff-app.js and debug tooling.
    DB-first teams override fallback cfg teams.
    """
    cfg = _team_cfg()

    teams = list(cfg.get("teams") or [])
    gallery_items = list(cfg.get("gallery_items") or [])
    logo_url = cfg.get("logo_url") or ""

    # --- DB-first teams (override fallback) -----------------------
    try:
        import sqlite3, json
        from pathlib import Path

        db_path = Path(current_app.root_path) / "data" / "app.db"
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
            gallery_items = []

            for i, r in enumerate(rows):
                slug = r["slug"]
                name = r["team_name"]
                img = r["hero_image"] or r["og_image"] or "/static/images/teams/default.webp"

                rec = {}
                if r["record"]:
                    try:
                        rec = json.loads(r["record"]) if isinstance(r["record"], str) else (r["record"] or {})
                    except Exception:
                        rec = {}

                featured = bool(rec.get("featured", i < 3))
                tag = (rec.get("tag") or slug.split("-")[0]).lower()

                # ✅ include BOTH shapes (photo + src/thumb) for compatibility
                teams.append(
                    {
                        "id": slug,
                        "name": name,
                        "featured": featured,
                        "photo": img,
                        "src": img,
                        "thumb": img,
                        "tag": tag,
                        "tags": rec.get("tags") or ([] if not tag else [tag]),
                        "sort": rec.get("sort", (i + 1) * 10),
                    }
                )

                gallery_items.append(
                    {
                        "id": f"team-{slug}",
                        "caption": name,
                        "alt": f"{name} photo",
                        "featured": featured,
                        "src": img,
                        "thumb": img,
                        "tag": tag,
                    }
                )

            current_app.logger.info("[teams.json] Using DB teams: %s", [t["id"] for t in teams])

    except Exception as e:
        current_app.logger.warning("[teams.json] DB teams override failed: %s", e)
    # --------------------------------------------------------------

    return jsonify(
        {
            "ok": True,
            "build_id": _build_id(),
            "asset_version": _asset_version(),
            "teams_count": len(teams or []),
            "gallery_count": len(gallery_items or []),
            "logo_url": logo_url,
            "teams": teams or [],
            "gallery_items": gallery_items or [],
        }
    )


@bp.route("/become-sponsor", methods=["GET", "POST"])
def become_sponsor():
    form = SponsorForm() if SponsorForm else None
    if not form:
        flash("Sponsorship form is temporarily unavailable.", "danger")
        return redirect(url_for("main.home"))

    if form.validate_on_submit():
        name = (getattr(form, "name", None) and form.name.data or "").strip() or None
        email = ((getattr(form, "email", None) and (form.email.data or "")) or "").lower().strip() or None

        try:
            amt = Decimal(str(getattr(form, "amount", None) and form.amount.data or "0"))
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
            return render_template("index.html", form=form), 500

    if request.method == "POST":
        flash("Please correct the errors in the form.", "warning")
        return render_template("index.html", form=form), 400

    return render_template("index.html", form=form)


@bp.get("/about")
def about():
    try:
        cfg = _team_cfg()
        context: Dict[str, Any] = dict(
            team=cfg,
            about=_generate_about_section(cfg),
            mission=_generate_mission_section(cfg, _generate_impact_stats(cfg)),
        )
        resp = make_response(render_template("index.html", **context))
        resp.set_etag(_short_etag(str(sorted(context.keys()))))
        _nocache_html(resp)
        return resp
    except Exception:
        current_app.logger.exception("Error rendering About page")
        return _render_error("About page temporarily unavailable.", 500)


@bp.get("/sponsors")
def sponsor_list():
    page = request.args.get("page", 1, type=int)
    sponsors: List[Any] = []
    pagination = None

    q = _sponsor_query()
    if q is None:
        return render_template("index.html", sponsors=sponsors, pagination=pagination)

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

    return render_template("index.html", sponsors=sponsors, pagination=pagination)


@bp.route("/donate", methods=["GET", "POST"])
def donate():
    if SponsorForm is None:
        current_app.logger.error("SponsorForm is not available; /donate is disabled.")
        flash("Donation form is temporarily unavailable. Please try again later.", "danger")
        return redirect(url_for("main.home"))

    form = SponsorForm()
    prefill = {
        "name": (request.args.get("prefill_name") or "").strip(),
        "email": (request.args.get("prefill_email") or "").strip(),
        "amount": (request.args.get("prefill_amount") or "").strip(),
        "frequency": ((request.args.get("prefill_frequency") or "once").strip() or "once"),
        "source": (request.args.get("source") or "").strip(),
    }

    if request.method == "GET":
        if prefill["name"] and hasattr(form, "name"):
            form.name.data = prefill["name"]
        if prefill["email"] and hasattr(form, "email"):
            form.email.data = prefill["email"]
        if prefill["amount"] and hasattr(form, "amount"):
            try:
                form.amount.data = Decimal(prefill["amount"])
            except Exception:
                current_app.logger.debug("Ignoring invalid prefill_amount=%r", prefill["amount"])
        if hasattr(form, "frequency"):
            form.frequency.data = prefill["frequency"]
        if hasattr(form, "source"):
            form.source.data = prefill["source"]

        return render_template("index.html", form=form, prefill=prefill)

    if not form.validate_on_submit():
        flash("Please fix the highlighted errors and try again.", "warning")
        return render_template("index.html", form=form, prefill=prefill), 400

    def _field_value(obj: Any, name: str, default: str = "") -> Any:
        return getattr(obj, name).data if hasattr(obj, name) else default

    name = (_field_value(form, "name", "Friend") or "Friend").strip()
    email = (_field_value(form, "email", "") or "").strip().lower()

    raw_amount = _field_value(form, "amount", "0")
    try:
        amount = float(Decimal(str(raw_amount)))
    except Exception:
        amount = 0.0

    frequency = (request.form.get("frequency") or prefill["frequency"] or "once").strip()
    source = (request.form.get("source") or prefill["source"]).strip()

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
    org_slug = (request.args.get("org") or request.args.get("org_slug") or "default").strip()

    raw_amount = request.args.get("amount", "0")
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
        org = SimpleNamespace(
            slug=org_slug or "default",
            name=(cfg.get("team_name", "Our Team") if hasattr(cfg, "get") else "Our Team"),
        )

    try:
        return render_template("index.html", org=org, amount=amount, return_url=return_url)
    except Exception:
        current_app.logger.exception("thank-you template render failed; using fallback")
        html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Thank you</title>
</head>
<body style="font-family:system-ui; padding:24px;">
  <h1>Thank you</h1>
  <p>We appreciate your support{" of $" + format(amount, ",.2f") if amount else ""}.</p>
  <p><a href="{return_url}">Back to fundraiser</a></p>
</body>
</html>"""
        return Response(html, mimetype="text/html", status=200)


@bp.get("/tiers")
def tiers():
    cfg = _team_cfg()
    tiers_list = list(cast(List[Dict[str, Any]], cfg.get("tiers") or [])) if hasattr(cfg, "get") else []
    if not tiers_list:
        tiers_list = DEFAULT_TIERS

    mode = (request.args.get("mode") or "").strip().lower()
    fragment_tpl = "embed/tiers_inline.html" if mode == "inline" else "embed/tiers_sheet.html"

    wants_fragment = (request.args.get("embed") in ("1", "true", "yes") or bool(request.headers.get("X-Partial")))

    if wants_fragment:
        if not _template_exists(fragment_tpl):
            return make_response("Not Found", 404)
        html = render_template(fragment_tpl, tiers=tiers_list, team=cfg)
        return Response(html, mimetype="text/html", status=200)

    if _template_exists("tiers.html"):
        return render_template("index.html", tiers=tiers_list, team=cfg)

    if _template_exists(fragment_tpl):
        fragment = render_template(fragment_tpl, tiers=tiers_list, team=cfg)
    else:
        fragment = "<main style='font-family:system-ui; padding:24px;'><h1>Tiers</h1></main>"

    if "</head" in fragment.lower():
        return Response(fragment, mimetype="text/html", status=200)

    return Response(_wrap_document("Sponsorship Tiers", fragment), mimetype="text/html", status=200)


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

        etag = _ctx_etag(
            {
                "raised": payload["raised"],
                "goal": payload["goal"],
                "percent": payload["percent"],
                "sponsors_sorted": sponsors_sorted,
                "build_id": _build_id(),
                "ff_cfg_hash": "",
                "tpl_mtime": 0,
            }
        )

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
        resp.cache_control.no_store = True
        return resp


@bp.post("/api/checkout/session")
def api_checkout_session():
    data = request.get_json(silent=True) or {}

    amount_cents = int(data.get("amount_cents") or 0)
    currency = str((data.get("currency") or DEFAULT_CURRENCY)).lower()
    frequency = str((data.get("frequency") or "once")).strip().lower()

    if amount_cents < MIN_DONATION_CENTS:
        return jsonify({"error": "amount_too_small"}), 400

    secret = current_app.config.get("STRIPE_SECRET_KEY") or os.getenv("STRIPE_SECRET_KEY", "")
    if not secret or stripe is None:
        return jsonify({"error": "checkout_not_configured"}), 501

    stripe.api_key = secret

    donor = data.get("donor") or {}
    donor_email = (donor.get("email") or "").strip() or None
    donor_name = (donor.get("name") or "").strip()

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

