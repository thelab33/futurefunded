# app/config/config.py
# Canonical FutureFunded configuration (env-first, production-safe)

from __future__ import annotations

import os
from datetime import timedelta
from typing import Any, Optional


# ----------------------------
# Env helpers
# ----------------------------
_TRUTHY = {"1", "true", "yes", "on", "y"}
_FALSY = {"0", "false", "no", "off", "n"}


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return default
    s = str(v).strip()
    return s if s else default


def _bool(name: str, default: bool = False) -> bool:
    v = _env(name)
    if v is None:
        return default
    s = v.strip().lower()
    if s in _TRUTHY:
        return True
    if s in _FALSY:
        return False
    return default


def _int(name: str, default: int) -> int:
    v = _env(name)
    if v is None:
        return default
    try:
        return int(str(v).strip())
    except Exception:
        return default


def _clean_base_url(v: Optional[str]) -> str:
    s = (v or "").strip().rstrip("/")
    return s


# ----------------------------
# Config classes
# ----------------------------
class BaseConfig:
    """
    Env-first config:
    - all important settings can be overridden via environment variables
    - safe defaults for local dev
    """

    # Environment naming (your code reads APP_ENV/ENV/FLASK_ENV in places)
    ENV = (_env("APP_ENV") or _env("ENV") or _env("FLASK_ENV") or "base").strip().lower()

    DEBUG = _bool("FLASK_DEBUG", False)
    TESTING = _bool("TESTING", False)

    # Security
    SECRET_KEY = _env("SECRET_KEY", "dev-change-me")

    # URLs / scheme
    PUBLIC_BASE_URL = _clean_base_url(_env("PUBLIC_BASE_URL", _env("FF_PUBLIC_BASE_URL", "")))
    FF_PUBLIC_BASE_URL = _clean_base_url(_env("FF_PUBLIC_BASE_URL", PUBLIC_BASE_URL))
    PREFERRED_URL_SCHEME = _env("PREFERRED_URL_SCHEME", "https")

    # Proxy trust (Cloudflare / reverse proxy)
    TRUST_PROXY = _bool("TRUST_PROXY", False)

    # Cookies
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = _env("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_SECURE = True

    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = _env("REMEMBER_COOKIE_SAMESITE", "Lax")
    REMEMBER_COOKIE_SECURE = True

    PERMANENT_SESSION_LIFETIME = timedelta(days=_int("SESSION_DAYS", 31))

    # SQLAlchemy
    SQLALCHEMY_DATABASE_URI = _env("SQLALCHEMY_DATABASE_URI", "sqlite:///futurefunded-dev.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    @classmethod
    def init_app(cls, app) -> None:
        """
        Optional hook for factory boot hardening.
        Call this from create_app() after app.config.from_object(...)
        """
        uri = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "")

        # SQLite tuning (better concurrency behavior than default)
        if uri.startswith("sqlite:"):
            opts = dict(app.config.get("SQLALCHEMY_ENGINE_OPTIONS") or {})
            connect_args = dict(opts.get("connect_args") or {})
            connect_args.setdefault("check_same_thread", False)
            opts["connect_args"] = connect_args
            opts.setdefault("pool_pre_ping", True)
            app.config["SQLALCHEMY_ENGINE_OPTIONS"] = opts


class DevelopmentConfig(BaseConfig):
    ENV = "development"
    DEBUG = True

    # local defaults (still overrideable via env)
    SQLALCHEMY_DATABASE_URI = _env("SQLALCHEMY_DATABASE_URI", "sqlite:///futurefunded-dev.db")

    SESSION_COOKIE_SECURE = False
    REMEMBER_COOKIE_SECURE = False
    PREFERRED_URL_SCHEME = _env("PREFERRED_URL_SCHEME", "http")
    TRUST_PROXY = _bool("TRUST_PROXY", False)


class ProductionConfig(BaseConfig):
    ENV = "production"
    DEBUG = False

    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
    PREFERRED_URL_SCHEME = _env("PREFERRED_URL_SCHEME", "https")
    TRUST_PROXY = _bool("TRUST_PROXY", True)

    @classmethod
    def init_app(cls, app) -> None:
        super().init_app(app)

        # ---- Production guardrails (fail fast; avoid "haunted dev in prod") ----
        sk = app.config.get("SECRET_KEY")
        if not sk or sk == "dev-change-me":
            raise RuntimeError("SECRET_KEY must be set to a strong random value in production.")

        base = (app.config.get("FF_PUBLIC_BASE_URL") or app.config.get("PUBLIC_BASE_URL") or "").strip()
        if base and base.startswith("http://"):
            raise RuntimeError("PUBLIC_BASE_URL / FF_PUBLIC_BASE_URL must be https:// in production.")

        if _bool("FLASK_DEBUG", False):
            raise RuntimeError("FLASK_DEBUG must be 0 in production.")
