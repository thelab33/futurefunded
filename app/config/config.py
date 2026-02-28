from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Sequence, Union

# Repo root: app/config/config.py → parents[2]
BASE_DIR = Path(__file__).resolve().parents[2]

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

BoolLike = Union[str, bool, None]


def _bool(val: BoolLike, default: bool = False) -> bool:
    """
    Robust env bool parsing.
    Accepts: 1/0, true/false, yes/no, on/off (case-insensitive).
    """
    if isinstance(val, bool):
        return val
    if val is None:
        return default
    s = str(val).strip().lower()
    if s in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if s in {"0", "false", "f", "no", "n", "off"}:
        return False
    return default


def _csv(val: Union[str, Sequence[str], None]) -> list[str]:
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

    # NOTE: dev fallback is okay for local; production should always set SECRET_KEY.
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
    STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY") or os.getenv("STRIPE_PUBLIC_KEY") or ""
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET") or ""

    # Sessions / cookies (ENV-aware + deterministic)
    SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "futurefunded")
    SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_HTTPONLY = _bool(os.getenv("SESSION_COOKIE_HTTPONLY"), True)
    SESSION_COOKIE_SECURE = _bool(os.getenv("SESSION_COOKIE_SECURE"), False)

    REMEMBER_COOKIE_SECURE = _bool(os.getenv("REMEMBER_COOKIE_SECURE"), False)
    REMEMBER_COOKIE_HTTPONLY = _bool(os.getenv("REMEMBER_COOKIE_HTTPONLY"), True)
    REMEMBER_COOKIE_SAMESITE = os.getenv("REMEMBER_COOKIE_SAMESITE", SESSION_COOKIE_SAMESITE)

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS") or "*"

    # Realtime
    SOCKETIO_ASYNC_MODE = os.getenv("SOCKETIO_ASYNC_MODE", "threading")

    # CSP / security (safe defaults)
    CSP_PRESET = os.getenv("CSP_PRESET", "dev")
    CSP_EXTRA_SCRIPT_SRC_LIST = _csv(os.getenv("CSP_EXTRA_SCRIPT_SRC_LIST")) or [
        "https://js.stripe.com",
        "https://www.paypal.com",
    ]
    CSP_STYLE_ALLOW_UNSAFE_INLINE = _bool(os.getenv("CSP_STYLE_ALLOW_UNSAFE_INLINE"), True)

    # Misc
    AUTO_CREATE_SQLITE = _bool(os.getenv("AUTO_CREATE_SQLITE"), True)


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
    SESSION_COOKIE_SECURE = False
    REMEMBER_COOKIE_SECURE = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    CSP_PRESET = "prod"

    # Production should default-secure, but still allow env override if needed.
    SESSION_COOKIE_SECURE = _bool(os.getenv("SESSION_COOKIE_SECURE"), True)
    REMEMBER_COOKIE_SECURE = _bool(os.getenv("REMEMBER_COOKIE_SECURE"), True)

    # Prefer no unsafe-inline in prod; allow explicit env override.
    CSP_STYLE_ALLOW_UNSAFE_INLINE = _bool(os.getenv("CSP_STYLE_ALLOW_UNSAFE_INLINE"), False)


# Optional helper map
config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}
