from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Sequence

# Repo root: app/config/config.py → parents[2]
BASE_DIR = Path(__file__).resolve().parents[2]

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _bool(val: Optional[str | bool], default: bool = False) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return default
    return str(val).strip().lower() in {"1", "true", "yes", "on"}

def _csv(val: str | Sequence[str] | None) -> list[str]:
    if not val:
        return []
    if isinstance(val, str):
        return [p.strip() for p in val.split(",") if p.strip()]
    return [str(x).strip() for x in val if str(x).strip()]

def _normalize_db(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url

def _sqlite_default() -> str:
    data = (BASE_DIR / "app" / "data").resolve()
    data.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{(data / 'app.db').as_posix()}"

def database_url() -> str:
    raw = (os.getenv("DATABASE_URL") or "").strip()
    if not raw:
        return _sqlite_default()
    raw = _normalize_db(raw)
    if raw.startswith("sqlite:///"):
        p = Path(raw.split("sqlite:///")[1])
        if not p.is_absolute():
            p = (BASE_DIR / p).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{p.as_posix()}"
    return raw

# ─────────────────────────────────────────────────────────────
# Base config (NO ENV HERE — Flask owns env)
# ─────────────────────────────────────────────────────────────

class BaseConfig:
    # Core Flask
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")

    JSON_SORT_KEYS = False
    JSON_AS_ASCII = False
    PROPAGATE_EXCEPTIONS = False

    # URLs / scheme
    PREFERRED_URL_SCHEME = os.getenv("PREFERRED_URL_SCHEME", "http")

    # Database
    SQLALCHEMY_DATABASE_URI = database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # Stripe (legacy-safe)
    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY") or os.getenv("STRIPE_API_KEY") or ""
    STRIPE_PUBLISHABLE_KEY = (
        os.getenv("STRIPE_PUBLISHABLE_KEY")
        or os.getenv("STRIPE_PUBLIC_KEY")
        or ""
    )
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET") or ""

    # Sessions / cookies
    SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "futurefunded")
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = False
    REMEMBER_COOKIE_SECURE = False

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS") or "*"

    # Realtime
    SOCKETIO_ASYNC_MODE = os.getenv("SOCKETIO_ASYNC_MODE", "threading")

    # CSP / security (safe defaults)
    CSP_PRESET = "dev"
    CSP_EXTRA_SCRIPT_SRC_LIST = _csv(os.getenv("CSP_EXTRA_SCRIPT_SRC_LIST")) or [
        "https://js.stripe.com",
        "https://www.paypal.com",
    ]
    CSP_STYLE_ALLOW_UNSAFE_INLINE = True

    # Misc
    AUTO_CREATE_SQLITE = True

# ─────────────────────────────────────────────────────────────
# Environment variants (behavior only)
# ─────────────────────────────────────────────────────────────

class DevelopmentConfig(BaseConfig):
    DEBUG = True
    TEMPLATES_AUTO_RELOAD = True

class TestingConfig(BaseConfig):
    TESTING = True
    DEBUG = False
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class ProductionConfig(BaseConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
    CSP_PRESET = "prod"
    CSP_STYLE_ALLOW_UNSAFE_INLINE = False

# Optional helper map
config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}

