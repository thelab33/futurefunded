from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, TypedDict

from flask import (Blueprint, abort, current_app, g, make_response,
                   render_template, request, url_for)

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


@dataclass
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
    """Best-effort CSP nonce (supports g.csp_nonce or callable)."""
    nonce = getattr(g, "csp_nonce", None)
    try:
        return nonce() if callable(nonce) else (nonce or "")
    except Exception:
        return ""


def current_team() -> TeamStub:
    return getattr(g, "team", None) or TeamStub()


def _safe_int(val: Any, default: int) -> int:
    try:
        return int(val)
    except Exception:
        return default


def _wants_json() -> bool:
    if request.args.get("format", "").lower() == "json":
        return True
    accept = request.headers.get("Accept", "")
    return "application/json" in accept and "text/html" not in accept


def _partial_mode() -> bool:
    """True when a sheet/partial is requested (HTMX/XHR/CSP-safe includes)."""
    return (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        or request.headers.get("X-Partial") == "1"
        or request.args.get("mode") == "sheet"
    )


def _hash_etag(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sheet_response(body: str, max_age: int = 120):
    """Uniform headers + ETag + 304 handling for sheet partials."""
    data = body.encode("utf-8")
    etag = _hash_etag(data)
    if request.headers.get("If-None-Match") == etag:
        resp = make_response("", 304)
    else:
        resp = make_response(data, 200)
        resp.headers["ETag"] = etag
        resp.headers["Content-Type"] = "text/html; charset=utf-8"

    resp.headers.update(
        {
            "Cache-Control": f"public, max-age={max_age}",
            "Vary": "Accept",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "SAMEORIGIN",
        }
    )
    return resp


def _json_response(payload: Dict[str, Any], max_age: int = 60):
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    etag = _hash_etag(data)
    if request.headers.get("If-None-Match") == etag:
        resp = make_response("", 304)
    else:
        resp = make_response(data, 200)
        resp.headers["Content-Type"] = "application/json; charset=utf-8"
        resp.headers["ETag"] = etag
    resp.headers["Cache-Control"] = f"public, max-age={max_age}"
    resp.headers["Vary"] = "Accept"
    return resp


# ────────────────────────────────────────────────────────────────────────────────
# Scoped template selection + CSS injection
# ────────────────────────────────────────────────────────────────────────────────
_SCOPED_CSS_BY_TEMPLATE = {
    "embed/impact_sheet.scoped.html": "css/impact_sheet.scoped.css",
    "embed/tiers_sheet.scoped.html":  "css/tiers_sheet.scoped.css",
    "embed/about_sheet.scoped.html":  "css/about_sheet.scoped.css",
}

def _select_template(base_template: str, prefer_scoped: bool) -> str:
    """
    Choose the best template available:
    - if prefer_scoped: try *.scoped.html first, else the base
    - else pick base first, scoped second (in case only scoped exists)
    """
    stem = base_template.rsplit(".", 1)[0]  # e.g. embed/impact_sheet
    scoped = f"{stem}.scoped.html"
    candidates = [scoped, base_template] if prefer_scoped else [base_template, scoped]
    # Let Jinja choose the first that exists
    tmpl = current_app.jinja_env.select_template(candidates)
    return tmpl.name  # resolved name


def _prepend_scoped_css_if_needed(rendered_html: str, template_name: str) -> str:
    """
    If we're returning a partial built from a scoped template, prepend its CSS link.
    This ensures the fragment styles load when injected into a sheet container.
    """
    if not template_name.endswith(".scoped.html"):
        return rendered_html

    css_rel = _SCOPED_CSS_BY_TEMPLATE.get(template_name)
    if not css_rel:
        # Derive css path from template name as a fallback
        # embed/foo_bar.scoped.html -> css/foo_bar.scoped.css
        css_rel = "css/" + template_name.split("/")[-1].replace(".html", ".css")

    try:
        href = url_for("static", filename=css_rel)
    except Exception:
        # If url_for isn't available here for some reason, fall back to a plain path
        href = f"/static/{css_rel}"

    # NOTE: nonce on <link> is harmless (ignored by CSP), but we can add it to be consistent.
    nonce = _get_nonce()
    link = f'<link rel="stylesheet" href="{href}"{(" nonce=\"" + nonce + "\"") if nonce else ""} />\n'
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
            "perks": [
                "Shoutout on sponsor ticker",
                "Logo on team page",
                "Social thank-you",
            ],
            "availability": 10,
        },
        {
            "slug": "silver",
            "icon": "🥈",
            "name": "Silver",
            "price": 1500,
            "desc": "Amplify brand presence.",
            "perks": [
                "Everything in Bronze",
                "Logo on jersey banner (digital)",
                "2 VIP game passes",
            ],
            "availability": 5,
        },
        {
            "slug": "gold",
            "icon": "🥇",
            "name": "Gold",
            "price": 5000,
            "desc": "Premium visibility for serious backers.",
            "perks": [
                "Everything in Silver",
                "Feature in highlight reel",
                "Sponsor spotlight post",
            ],
            "featured": True,
            "availability": 2,
        },
        {
            "slug": "platinum",
            "icon": "💎",
            "name": "Platinum",
            "price": 10000,
            "desc": "Season presenting partner.",
            "perks": [
                "Everything in Gold",
                "Sideline signage (hero area)",
                "‘Presented by’ tag on events",
                "1:1 VIP Strategy Call",
            ],
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
        "kpis": [
            {"label": "Athletes", "value": 20},
            {"label": "Seasons", "value": 3},
        ],
    }


# ────────────────────────────────────────────────────────────────────────────────
# Rendering helpers (HTML sheet vs JSON) — now scoped-aware
# ────────────────────────────────────────────────────────────────────────────────
def render_embed(base_template: str, **ctx: Any):
    """
    Enterprise-friendly renderer:
    - JSON if asked
    - 'sheet'/partial mode when X-Partial or ?mode=sheet
    - Prefers *.scoped.html for partials (or when ?scoped=1), with fallback to base
    - Auto-injects <link rel=stylesheet> for scoped fragments
    """
    team = ctx.setdefault("team", current_team())
    ctx.setdefault("NONCE", _get_nonce())
    ctx.setdefault("agency_widget", True)

    if _wants_json():
        payload = {
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

    prefer_scoped = _partial_mode() or request.args.get("scoped", "").lower() in ("1", "true", "yes")
    tmpl_name = _select_template(base_template, prefer_scoped)
    html = render_template(tmpl_name, **ctx)

    if _partial_mode():
        html = _prepend_scoped_css_if_needed(html, tmpl_name)
        return _sheet_response(html, max_age=120)

    # Inline (full page include)—still set sane cache headers
    resp = make_response(html, 200)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# ────────────────────────────────────────────────────────────────────────────────
# Routes
# ────────────────────────────────────────────────────────────────────────────────
@embed_bp.get("/tiers")
def embed_tiers():
    team = current_team()
    tiers = tiers_for_team(team)

    # Query knobs (enterprise consumers love these)
    highlight_slug = request.args.get("highlight", "gold").lower()
    brand_src = request.args.get("brand") or getattr(team, "logo", "")
    limit = _safe_int(request.args.get("limit", 0), 0)
    sort = (request.args.get("sort") or "").lower()  # "price", "-price", "featured"

    data = tiers[:]
    if sort:
        reverse = sort.startswith("-")
        key = sort.lstrip("-")
        if key == "price":
            data = sorted(data, key=lambda t: t.get("price", 0), reverse=reverse)
        elif key == "featured":
            data = sorted(data, key=lambda t: not bool(t.get("featured")), reverse=False)

    if limit > 0:
        data = data[:limit]

    ctx = {
        "team": team,
        "tiers": data,
        "sponsor_logos": sponsor_logos_for(team),
        "sheet_branding": brand_src,
        "highlight_slug": highlight_slug if any(t["slug"] == highlight_slug for t in data) else "gold",
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
# Optional: uniform hardening for all responses from this blueprint
# ────────────────────────────────────────────────────────────────────────────────
@embed_bp.after_request
def _security_headers(resp):
    """
    Enterprise defaults without being heavy-handed.
    (Leave CSP to app-wide policy so nonces line up.)
    """
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return resp

