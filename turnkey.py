from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Optional, Dict, Any

from flask import request, g, current_app


@dataclass(frozen=True)
class Tenant:
    slug: str
    name: str
    theme: Dict[str, Any]


def _default_theme() -> Dict[str, Any]:
    return {
        "brand_name": "FutureFunded",
        "primary": "#0ea5e9",
        "secondary": "#111827",
        "accent": "#22c55e",
        "logo_url": None,
        "announcement": None,      # e.g. {"text": "...", "href": "..."}
        "countdown": None,         # e.g. {"label":"Gala starts in", "to":"2026-02-15T18:00:00-06:00"}
    }


@lru_cache(maxsize=1024)
def _load_tenant_from_db(slug: str) -> Optional[Tenant]:
    """
    Hook this into your team_config DB layer.

    For now, we use defaults + slug. Replace with:
      - call into app.config.team_config / models
      - fetch name, theme colors, logo, goal, etc.
    """
    if not slug:
        return None

    # Example: hardcode one tenant for testing.
    # Replace this with real DB lookup.
    theme = _default_theme()
    theme["brand_name"] = slug.replace("-", " ").title()
    return Tenant(slug=slug, name=theme["brand_name"], theme=theme)


def _infer_tenant_slug() -> Optional[str]:
    """
    Resolve tenant by:
      1) /t/<slug> path prefix
      2) subdomain (slug.yourdomain.com)
      3) X-Tenant header (useful for previews / internal tools)
    """
    # 1) path prefix
    path = request.path or ""
    if path.startswith("/t/"):
        parts = path.split("/", 3)  # ["", "t", "<slug>", ...]
        if len(parts) >= 3 and parts[2]:
            return parts[2]

    # 2) subdomain
    host = (request.host or "").split(":")[0]
    base = current_app.config.get("BASE_DOMAIN")  # e.g. "futurefunded.com"
    if base and host.endswith(base) and host != base:
        sub = host[: -(len(base) + 1)]  # remove ".base"
        # If multiple levels like a.b.base, take first segment or full—your call.
        slug = sub.split(".")[0]
        if slug and slug not in ("www", "app"):
            return slug

    # 3) header override
    hdr = request.headers.get("X-Tenant")
    if hdr:
        return hdr.strip()

    return None


def init_turnkey(app):
    """
    Turnkey multi-tenant bootstrap:
      - Resolve tenant per request
      - Inject tenant + theme into template context
    """
    app.logger.info("turnkey.init_turnkey: enabled")

    @app.before_request
    def _turnkey_resolve_tenant():
        slug = _infer_tenant_slug()
        tenant = _load_tenant_from_db(slug) if slug else None

        # Store on flask.g for easy access
        g.tenant = tenant
        g.theme = tenant.theme if tenant else _default_theme()
        g.tenant_slug = tenant.slug if tenant else None

    @app.context_processor
    def _turnkey_template_context():
        return {
            "tenant": getattr(g, "tenant", None),
            "theme": getattr(g, "theme", _default_theme()),
        }
