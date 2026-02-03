# app/patches/runtime_fixes.py
from __future__ import annotations

import os
import secrets
from pathlib import Path

from flask import g

try:
    # SQLAlchemy 2.x
    from sqlalchemy.engine import make_url
except Exception:  # pragma: no cover
    make_url = None  # type: ignore


def apply_runtime_fixes(app) -> None:
    """
    Safe to call during app factory after config is loaded but before db.init_app(app).
    """
    _ensure_sqlite_writable(app)
    _register_csp_nonce(app)
    _install_lazy_csrf_exemptions(app)


def _ensure_sqlite_writable(app) -> None:
    uri = app.config.get("SQLALCHEMY_DATABASE_URI") or ""
    if not uri.startswith("sqlite"):
        return
    if uri in ("sqlite://", "sqlite:///:memory:", "sqlite:///:memory"):
        return

    if make_url is None:
        return

    url = make_url(uri)
    db_path = url.database  # for sqlite this is the file path (may be relative)
    if not db_path:
        return

    # If relative path, anchor it to the repo root (parent of app.root_path)
    repo_root = Path(app.root_path).resolve().parent
    p = Path(db_path)
    if not p.is_absolute():
        p = (repo_root / p).resolve()

    # Ensure parent directory exists
    try:
        p.parent.mkdir(parents=True, exist_ok=True)

        # Test writability (touch file)
        if not p.exists():
            p.touch()

        # Update config to an absolute sqlite path so CWD no longer matters
        app.config["SQLALCHEMY_DATABASE_URI"] = str(url.set(database=str(p)))

    except Exception:
        # Last-resort fallback for environments where repo is read-only (common in prod containers)
        fallback = Path("/tmp/futurefunded.db")
        try:
            fallback.parent.mkdir(parents=True, exist_ok=True)
            if not fallback.exists():
                fallback.touch()
            app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{fallback}"
        except Exception:
            # If even /tmp fails, do nothing; db init will log a clear error anyway.
            pass


def _register_csp_nonce(app) -> None:
    @app.before_request
    def _ff_set_nonce():
        # URL-safe, good entropy, short enough for headers
        g.csp_nonce = secrets.token_urlsafe(16)

    @app.context_processor
    def _ff_nonce_helpers():
        def nonce_attr():
            n = getattr(g, "csp_nonce", "")
            return f'nonce="{n}"' if n else ""
        return {
            "nonce_attr": nonce_attr,
            "csp_nonce": getattr(g, "csp_nonce", ""),
        }


def _install_lazy_csrf_exemptions(app) -> None:
    """
    CSRFProtect may be initialized after apply_runtime_fixes() depending on your factory order.
    So we apply exemptions lazily on first request when the extension exists.
    """
    EXEMPT_PREFIXES = (
        "/payments/stripe/webhook",
        "/sms/webhook",
        "/metrics/",
    )

    @app.before_request
    def _ff_lazy_exempt():
        if app.config.get("_FF_CSRF_EXEMPT_DONE"):
            return

        csrf = app.extensions.get("csrf")
        if not csrf or not hasattr(csrf, "exempt"):
            return

        try:
            for rule in app.url_map.iter_rules():
                path = rule.rule or ""
                if any(path == p or path.startswith(p) for p in EXEMPT_PREFIXES):
                    view = app.view_functions.get(rule.endpoint)
                    if view:
                        csrf.exempt(view)
            app.config["_FF_CSRF_EXEMPT_DONE"] = True
        except Exception:
            # Don’t block requests if something weird happens
            app.config["_FF_CSRF_EXEMPT_DONE"] = True

