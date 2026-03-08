from __future__ import annotations

from flask import Blueprint, abort, render_template, request, make_response

from app.tenants import get_tenant

bp = Blueprint("teams", __name__, url_prefix="")

# FF_VANITY_SLUG_V1
# Protect platform routes from being claimed as tenant slugs.
_RESERVED_SLUGS = {
    "",
    "static",
    "api",
    "payments",
    "admin",
    "metrics",
    "newsletter",
    "sms",
    "legal",
    "healthz",
    "version",
    "_diag",
    "csp-report",
    "team",
    "ops",
    "draft",
    "p",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
}

def _is_reserved(slug: str) -> bool:
    s = (slug or "").strip().lower()
    return (s in _RESERVED_SLUGS) or s.startswith(".")

@bp.get("/team/<slug>")
def team(slug: str):
    t = get_tenant(slug)
    if not t:
        abort(404)

    # Safe defaults so index.html can render even if some keys are missing
    ff_cfg = {
        "brand_name": t.get("brand_name", slug),
        "city": t.get("city", ""),
        "state": t.get("state", ""),
        "theme_color": t.get("theme_color", "#0ea5e9"),
        "goal_amount": t.get("goal_amount", 0),
        "paypal_me": t.get("paypal_me", ""),
        "contact_email": t.get("contact_email", ""),
        "tenant_slug": t.get("slug", slug),
    }

    # Many sections iterate teams; provide at least one
    teams = t.get("teams") or [{"name": ff_cfg["brand_name"], "slug": slug}]

    # IMPORTANT: keep template contracts happy; your context processor covers FF_CFG/_v/_app too
    html = render_template("index.html",
        FF_CFG=ff_cfg,
        teams=teams,
        ff_data_mode=(request.args.get("mode") or "live"),
        _totals_verified=False,
    )
    resp = make_response(html)
    resp.headers["X-FF-Tenant"] = ff_cfg.get("tenant_slug", slug)
    return resp
@bp.get("/<slug>")
def vanity(slug: str):
    # Only treat as tenant if it exists and it's not reserved.
    if _is_reserved(slug):
        abort(404)
    t = get_tenant(slug)
    if not t:
        abort(404)
    return team(slug)
