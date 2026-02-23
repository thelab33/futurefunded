from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, TypedDict

from flask import Blueprint, current_app, g, make_response, render_template, request, url_for

# ────────────────────────────────────────────────────────────────────────────────
# Blueprint
# ────────────────────────────────────────────────────────────────────────────────
embed_bp = Blueprint("embed", __name__, url_prefix="/embed")


# ────────────────────────────────────────────────────────────────────────────────
# Types
# ────────────────────────────────────────────────────────────────────────────────
class TierDict(TypedDict, total=False):
    slug: str
    icon: str
    name: str
    price: int
    desc: str
    perks: List[str]
    featured: bool
    availability: int
    cta: str


@dataclass(frozen=True, slots=True)
class TeamStub:
    id: str = ""
    theme_hex: str = "#facc15"
    name: str = "Your Team"
    logo: str = "/static/images/default_team_logo.png"
    brand_url: str = "https://fundchamps.com"


# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────
def _get_nonce() -> str:
    """
    Best-effort CSP nonce.
    Supports g.csp_nonce being either a string or a callable returning a string.
    Never raises.
    """
    nonce = getattr(g, "csp_nonce", None)
    try:
        val = nonce() if callable(nonce) else nonce
        return str(val or "")
    except Exception:
        return ""


def current_team() -> TeamStub:
    # g.team may be a rich object; keep minimal stub fallback.
    t = getattr(g, "team", None)
    if t is None:
        return TeamStub()
    # If upstream set a TeamStub already, return it.
    if isinstance(t, TeamStub):
        return t
    # Otherwise, best-effort map fields.
    return TeamStub(
        id=str(getattr(t, "id", "") or ""),
        theme_hex=str(getattr(t, "theme_hex", "#facc15") or "#facc15"),
        name=str(getattr(t, "name", "Your Team") or "Your Team"),
        logo=str(getattr(t, "logo", "/static/images/default_team_logo.png") or "/static/images/default_team_logo.png"),
        brand_url=str(getattr(t, "brand_url", "https://fundchamps.com") or "https://fundchamps.com"),
    )


def _safe_int(val: Any, default: int) -> int:
    try:
        return int(val)
    except Exception:
        return default


def _wants_json() -> bool:
    # Explicit query param wins.
    if (request.args.get("format") or "").lower() == "json":
        return True
    accept = request.headers.get("Accept", "") or ""
    # If client prefers JSON and does not explicitly prefer HTML.
    return "application/json" in accept and "text/html" not in accept


def _is_partial_request() -> bool:
    """
    True when a fragment/sheet/partial is requested (HTMX/XHR/CSP-safe includes).
    Keep this strictly opt-in so normal page requests never get treated as partials.
    """
    return (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        or request.headers.get("X-Partial") == "1"
        or (request.args.get("mode") or "").lower() == "sheet"
    )


def _hash_etag(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _match_etag(etag: str) -> bool:
    inm = request.headers.get("If-None-Match", "") or ""
    # Very small, robust match (supports `W/` or quoted values)
    return etag in inm or f'"{etag}"' in inm or f'W/"{etag}"' in inm or f"W/{etag}" in inm


def _set_vary(resp, value: str) -> None:
    # Merge Vary safely
    existing = resp.headers.get("Vary", "")
    parts = [p.strip() for p in existing.split(",") if p.strip()] if existing else []
    if value not in parts:
        parts.append(value)
    resp.headers["Vary"] = ", ".join(parts) if parts else value


def _sheet_response(body: str, max_age: int = 120):
    """
    Uniform headers + ETag + 304 handling for sheet partials.
    IMPORTANT: Never returns an empty body on 200.
    """
    data = body.encode("utf-8")
    etag = _hash_etag(data)

    if _match_etag(etag):
        resp = make_response("", 304)
    else:
        resp = make_response(data, 200)
        resp.headers["Content-Type"] = "text/html; charset=utf-8"
        resp.headers["ETag"] = etag

    resp.headers["Cache-Control"] = f"public, max-age={max_age}"
    _set_vary(resp, "Accept")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return resp


def _json_response(payload: Dict[str, Any], max_age: int = 60):
    data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    etag = _hash_etag(data)

    if _match_etag(etag):
        resp = make_response("", 304)
    else:
        resp = make_response(data, 200)
        resp.headers["Content-Type"] = "application/json; charset=utf-8"
        resp.headers["ETag"] = etag

    resp.headers["Cache-Control"] = f"public, max-age={max_age}"
    _set_vary(resp, "Accept")
    return resp


# ────────────────────────────────────────────────────────────────────────────────
# Scoped template selection + CSS injection
# ────────────────────────────────────────────────────────────────────────────────
_SCOPED_CSS_BY_TEMPLATE: Dict[str, str] = {
    "embed/impact_sheet.scoped.html": "css/impact_sheet.scoped.css",
    "embed/tiers_sheet.scoped.html": "css/tiers_sheet.scoped.css",
    "embed/about_sheet.scoped.html": "css/about_sheet.scoped.css",
}


def _select_template(base_template: str, prefer_scoped: bool) -> str:
    """
    Choose the best template available:
    - if prefer_scoped: try *.scoped.html first, else base
    - else: base first, scoped second (in case only scoped exists)
    """
    stem = base_template.rsplit(".", 1)[0]  # e.g. embed/impact_sheet
    scoped = f"{stem}.scoped.html"
    candidates = [scoped, base_template] if prefer_scoped else [base_template, scoped]
    tmpl = current_app.jinja_env.select_template(candidates)
    return tmpl.name


def _scoped_css_href_for(template_name: str) -> Optional[str]:
    if not template_name.endswith(".scoped.html"):
        return None
    css_rel = _SCOPED_CSS_BY_TEMPLATE.get(template_name)
    if not css_rel:
        # embed/foo_bar.scoped.html -> css/foo_bar.scoped.css
        css_rel = "css/" + template_name.split("/")[-1].replace(".html", ".css")
    try:
        return url_for("static", filename=css_rel)
    except Exception:
        return f"/static/{css_rel}"


def _prepend_scoped_css_if_needed(rendered_html: str, template_name: str) -> str:
    """
    If returning a partial from a scoped template, prepend its CSS <link>.
    This ensures the fragment styles load when injected into a sheet container.
    """
    href = _scoped_css_href_for(template_name)
    if not href:
        return rendered_html

    nonce = _get_nonce()
    nonce_attr = f' nonce="{nonce}"' if nonce else ""
    link = f'<link rel="stylesheet" href="{href}"{nonce_attr} />\n'
    return link + rendered_html


# ────────────────────────────────────────────────────────────────────────────────
# Domain data providers (override via g.* upstream as needed)
# ────────────────────────────────────────────────────────────────────────────────
def tiers_for_team(team: TeamStub) -> List[TierDict]:
    base: List[TierDict] = [
        {
            "slug": "bronze",
            "icon": "🥉",
            "name": "Bronze",
            "price": 500,
            "desc": "Great entry for local partners.",
            "perks": ["Shoutout on sponsor ticker", "Logo on team page", "Social thank-you"],
            "availability": 10,
        },
        {
            "slug": "silver",
            "icon": "🥈",
            "name": "Silver",
            "price": 1500,
            "desc": "Amplify brand presence.",
            "perks": ["Everything in Bronze", "Logo on jersey banner (digital)", "2 VIP game passes"],
            "availability": 5,
        },
        {
            "slug": "gold",
            "icon": "🥇",
            "name": "Gold",
            "price": 5000,
            "desc": "Premium visibility for serious backers.",
            "perks": ["Everything in Silver", "Feature in highlight reel", "Sponsor spotlight post"],
            "featured": True,
            "availability": 2,
        },
        {
            "slug": "platinum",
            "icon": "💎",
            "name": "Platinum",
            "price": 10000,
            "desc": "Season presenting partner.",
            "perks": ["Everything in Gold", "Sideline signage (hero area)", "‘Presented by’ tag on events", "1:1 VIP Strategy Call"],
            "cta": "Schedule a call",
            "availability": 1,
        },
    ]
    return getattr(g, "tiers", None) or base


@lru_cache(maxsize=64)
def sponsor_logos_default() -> List[Dict[str, str]]:
    return [
        {"img": "/static/images/sponsors/sponsor1.png", "alt": "Brand A"},
        {"img": "/static/images/sponsors/sponsor2.png", "alt": "Brand B"},
    ]


def sponsor_logos_for(team: TeamStub) -> List[Dict[str, str]]:
    return getattr(g, "sponsor_logos", None) or sponsor_logos_default()


def impact_context(team: TeamStub) -> Dict[str, Any]:
    stats = getattr(g, "stats", {}) or {}
    return {
        "raised": _safe_int(stats.get("raised", 0), 0),
        "goal": _safe_int(stats.get("goal", 50_000), 50_000),
        "kpis": getattr(g, "impact_kpis", None)
        or [
            {"label": "Athletes", "value": 20},
            {"label": "Games", "value": 12},
            {"label": "Miles", "value": 600},
            {"label": "Scholarships", "value": 3},
        ],
    }


def about_context(team: TeamStub) -> Dict[str, Any]:
    return {
        "brand": getattr(team, "name", "Your Club/Org"),
        "about_img": "/static/images/team.jpg",
        "about_text": "We build champions on and off the court.",
        "kpis": [{"label": "Athletes", "value": 20}, {"label": "Seasons", "value": 3}],
    }


# ────────────────────────────────────────────────────────────────────────────────
# Rendering helpers (HTML sheet vs JSON) — scoped-aware, safe-by-default
# ────────────────────────────────────────────────────────────────────────────────
def render_embed(base_template: str, **ctx: Any):
    """
    Renderer for /embed routes:
    - JSON if requested (Accept or ?format=json)
    - Sheet/partial mode when explicitly requested (XHR/HTMX headers or ?mode=sheet)
    - Prefers *.scoped.html for partials (or when ?scoped=1), with fallback to base
    - Auto-injects <link rel=stylesheet> for scoped fragments
    """
    team = ctx.setdefault("team", current_team())
    ctx.setdefault("NONCE", _get_nonce())
    ctx.setdefault("agency_widget", True)

    if _wants_json():
        payload: Dict[str, Any] = {
            "team": {
                "id": getattr(team, "id", ""),
                "name": getattr(team, "name", "Team"),
                "theme_hex": getattr(team, "theme_hex", "#facc15"),
                "logo": getattr(team, "logo", ""),
                "brand_url": getattr(team, "brand_url", ""),
            },
            **{k: v for k, v in ctx.items() if k != "team"},
            "links": {"self": request.base_url, "html": request.base_url + "?mode=sheet"},
        }
        return _json_response(payload, max_age=60)

    prefer_scoped = _is_partial_request() or (request.args.get("scoped", "").lower() in ("1", "true", "yes"))
    tmpl_name = _select_template(base_template, prefer_scoped)

    html = render_template(tmpl_name, **ctx)

    if _is_partial_request():
        html = _prepend_scoped_css_if_needed(html, tmpl_name)
        return _sheet_response(html, max_age=120)

    # Full HTML response for direct navigation to /embed/*
    # (Keep cache conservative so teams can iterate quickly.)
    resp = make_response(html, 200)
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    resp.headers["Cache-Control"] = "no-cache"
    _set_vary(resp, "Accept")
    return resp


# ────────────────────────────────────────────────────────────────────────────────
# Routes
# ────────────────────────────────────────────────────────────────────────────────
@embed_bp.get("/tiers")
def embed_tiers():
    team = current_team()
    tiers = tiers_for_team(team)

    highlight_slug = (request.args.get("highlight") or "gold").lower()
    brand_src = request.args.get("brand") or getattr(team, "logo", "")
    limit = _safe_int(request.args.get("limit", 0), 0)
    sort = (request.args.get("sort") or "").lower()  # "price", "-price", "featured"

    data = tiers[:]
    if sort:
        reverse = sort.startswith("-")
        key = sort.lstrip("-")
        if key == "price":
            data = sorted(data, key=lambda t: int(t.get("price", 0) or 0), reverse=reverse)
        elif key == "featured":
            # featured first
            data = sorted(data, key=lambda t: not bool(t.get("featured")), reverse=False)

    if limit > 0:
        data = data[:limit]

    ctx = {
        "team": team,
        "tiers": data,
        "sponsor_logos": sponsor_logos_for(team),
        "sheet_branding": brand_src,
        "highlight_slug": highlight_slug if any((t.get("slug") or "").lower() == highlight_slug for t in data) else "gold",
    }
    return render_embed("embed/tiers_sheet.html", **ctx)


@embed_bp.get("/impact")
def embed_impact():
    team = current_team()
    ctx = impact_context(team)
    ctx["team"] = team
    return render_embed("embed/impact_sheet.html", **ctx)


@embed_bp.get("/about")
def embed_about():
    team = current_team()
    ctx = about_context(team)
    ctx["team"] = team
    return render_embed("embed/about_sheet.html", **ctx)


# ────────────────────────────────────────────────────────────────────────────────
# Uniform hardening for responses from this blueprint (NO body mutation)
# ────────────────────────────────────────────────────────────────────────────────
@embed_bp.after_request
def _security_headers(resp):
    """
    Lightweight defaults:
    - Never mutate/strip response body
    - Leave CSP to app-wide policy (so nonces line up)
    - Keep embed endpoints safe by default
    """
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return resp
