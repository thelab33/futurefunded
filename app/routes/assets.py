# app/routes/assets.py
# FutureFunded — Root asset reliability blueprint (favicon/manifest/robots)
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from flask import Blueprint, abort, current_app, make_response, send_file

bp = Blueprint("assets", __name__)


def _is_prod() -> bool:
    env = (current_app.config.get("ENV") or os.getenv("ENV") or "development").strip().lower()
    return env == "production"


def _cache_seconds(kind: str) -> int:
    # In dev you already add no-store headers; still keep this conservative.
    if not _is_prod():
        return 0
    # Icons can be cached hard (they rarely change). Manifest/robots should be shorter.
    if kind == "icon":
        return 60 * 60 * 24 * 30  # 30 days
    if kind == "manifest":
        return 60 * 60 * 6        # 6 hours
    if kind == "robots":
        return 60 * 10            # 10 minutes
    return 60 * 5                # 5 minutes


def _iter_static_roots() -> list[Path]:
    roots = []
    # Prefer the computed static roots from your app factory (if present)
    cfg_roots = current_app.config.get("FF_STATIC_ROOTS") or []
    for r in cfg_roots:
        try:
            p = Path(str(r)).resolve()
            if p.is_dir():
                roots.append(p)
        except Exception:
            continue

    # Fallbacks (repo-typical)
    base_dir = Path(current_app.root_path).resolve().parent
    for p in (
        base_dir / "app" / "static",
        base_dir / "static",
        Path(current_app.root_path).resolve() / "static",
    ):
        try:
            pp = p.resolve()
            if pp.is_dir() and pp not in roots:
                roots.append(pp)
        except Exception:
            pass

    # De-dupe
    out = []
    seen = set()
    for r in roots:
        k = str(r)
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def _find_static_file(relpath: str) -> Optional[Path]:
    rel = Path(relpath.lstrip("/"))
    for root in _iter_static_roots():
        candidate = (root / rel).resolve()
        try:
            candidate.relative_to(root.resolve())
        except Exception:
            continue
        if candidate.is_file():
            return candidate
    return None


def _serve(relpath: str, *, mimetype: Optional[str] = None, cache_kind: str = "default"):
    f = _find_static_file(relpath)
    if not f:
        abort(404)
    resp = send_file(
        f,
        conditional=True,
        mimetype=mimetype,
        max_age=_cache_seconds(cache_kind),
    )
    return resp


@bp.get("/favicon.ico")
def favicon():
    # Your repo currently has app/static/images/favicon.ico
    return _serve("images/favicon.ico", mimetype="image/x-icon", cache_kind="icon")


@bp.get("/apple-touch-icon.png")
def apple_touch_icon():
    return _serve("images/apple-touch-icon.png", mimetype="image/png", cache_kind="icon")


@bp.get("/manifest.webmanifest")
def webmanifest():
    # Your repo currently has app/static/manifest.webmanifest
    return _serve("manifest.webmanifest", mimetype="application/manifest+json", cache_kind="manifest")


@bp.get("/site.webmanifest")
def webmanifest_alias():
    return webmanifest()


@bp.get("/browserconfig.xml")
def browserconfig():
    # Optional: you already have app/static/browserconfig.xml
    return _serve("browserconfig.xml", mimetype="application/xml", cache_kind="manifest")


@bp.get("/robots.txt")
def robots():
    # If you have a real robots.txt in static, serve it.
    f = _find_static_file("robots.txt")
    if f:
        return _serve("robots.txt", mimetype="text/plain; charset=utf-8", cache_kind="robots")

    # Otherwise return a safe default.
    body = "User-agent: *\nAllow: /\n"
    resp = make_response(body, 200)
    resp.headers["Content-Type"] = "text/plain; charset=utf-8"
    resp.headers["Cache-Control"] = "no-store" if not _is_prod() else "public, max-age=600"
    return resp
