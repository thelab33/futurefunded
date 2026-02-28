# app/__init__.py
# FutureFunded — production-grade Flask app factory
# Goals:
# - deterministic blueprint registration (Stripe-safe)
# - proxy-correct (Cloudflare Tunnel / reverse proxy)
# - static asset reliability for ff-app.js + ff.css even if not in app/static
# - JSON error shape for API/payments, HTML for web

from __future__ import annotations

import importlib.util
import logging
import os
import secrets
import time
from importlib import import_module
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Type, Union
from uuid import uuid4

from dotenv import load_dotenv
from flask import Blueprint, Flask, abort, g, jsonify, render_template, request, send_file, url_for
from markupsafe import Markup, escape
from werkzeug.exceptions import HTTPException, InternalServerError
from werkzeug.middleware.proxy_fix import ProxyFix

# IMPORTANT: never override real env vars in prod
load_dotenv(override=False)

BASE_DIR = Path(__file__).resolve().parent.parent
ConfigLike = Union[str, Type[Any]]

# -----------------------------------------------------------------------------
# Core extensions (must exist in app/extensions.py)
# -----------------------------------------------------------------------------
from app.extensions import babel, cors, csrf, db, login_manager, mail, migrate, socketio  # noqa: E402

# -----------------------------------------------------------------------------
# Optional extras (graceful)
# -----------------------------------------------------------------------------
try:
    from flask_compress import Compress  # type: ignore
except Exception:  # pragma: no cover
    Compress = None  # type: ignore

try:
    from flask_talisman import Talisman  # type: ignore
except Exception:  # pragma: no cover
    Talisman = None  # type: ignore

try:
    from flask_wtf.csrf import generate_csrf  # type: ignore
except Exception:  # pragma: no cover
    generate_csrf = None  # type: ignore

# Optional Sentry
try:
    import sentry_sdk  # type: ignore
    from sentry_sdk.integrations.flask import FlaskIntegration  # type: ignore
    from sentry_sdk.integrations.logging import LoggingIntegration  # type: ignore
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration  # type: ignore
except Exception:  # pragma: no cover
    sentry_sdk = None  # type: ignore

try:
    from jinja2 import Undefined  # type: ignore
except Exception:  # pragma: no cover
    Undefined = type("Undefined", (), {})  # type: ignore


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _env_bool(name: str) -> Optional[bool]:
    v = os.getenv(name)
    if v is None:
        return None
    s = str(v).strip().lower()
    if s in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if s in {"0", "false", "f", "no", "n", "off"}:
        return False
    return None


def _env_bool_or(name: str, default: bool) -> bool:
    v = _env_bool(name)
    return default if v is None else bool(v)


def _env_mode(app: Optional[Flask] = None) -> str:
    """
    Determine environment mode deterministically.
    Priority:
      1) app.config["ENV"] (if present and meaningful)
      2) FF_ENV / ENV / FLASK_ENV env vars
      3) default "development"
    """
    try:
        if app is not None:
            v = app.config.get("ENV")
            if v and str(v).strip() and str(v).strip() != "?":
                return str(v).strip().lower()
    except Exception:
        pass

    for key in ("FF_ENV", "ENV", "FLASK_ENV"):
        val = (os.getenv(key) or "").strip().lower()
        if val:
            # normalize common aliases
            if val in {"prod"}:
                return "production"
            if val in {"dev"}:
                return "development"
            return val

    return "development"


def _resolve_config(target: Optional[ConfigLike]) -> ConfigLike:
    """
    Choose config class/module path.
    - If explicitly provided, respect it.
    - Else if FLASK_CONFIG is set, use it.
    - Else choose ProductionConfig when env indicates production; otherwise DevelopmentConfig.
    """
    if target is not None:
        # legacy typo normalization
        if isinstance(target, str) and target == "app.config.config.DevelopmentConfig":
            return "app.config.DevelopmentConfig"
        return target

    explicit = (os.getenv("FLASK_CONFIG") or "").strip()
    if explicit:
        if explicit == "app.config.config.DevelopmentConfig":
            return "app.config.DevelopmentConfig"
        return explicit

    env = _env_mode(None)
    return "app.config.ProductionConfig" if env == "production" else "app.config.DevelopmentConfig"


def _module_exists(dotted: str) -> bool:
    try:
        return importlib.util.find_spec(dotted) is not None
    except Exception:
        return False


def _is_prod(app: Flask) -> bool:
    return _env_mode(app) == "production"


def _iter_candidates(x: Union[str, Iterable[str]]) -> List[str]:
    if isinstance(x, str) and "|" in x:
        return [p.strip() for p in x.split("|") if p.strip()]
    if isinstance(x, str):
        return [x]
    return list(x)


def _json_error(message: str, status: int, **extra: Any):
    payload: Dict[str, Any] = {"ok": False, "error": {"code": int(status), "message": str(message)}}
    rid = extra.pop("request_id", None)
    if rid:
        payload["error"]["request_id"] = rid
    if extra:
        payload["error"].update(extra)

    resp = jsonify(payload)
    resp.status_code = int(status)
    return resp


def _wants_json_response() -> bool:
    path = request.path or ""
    if path.startswith(("/api/", "/payments/", "/metrics/", "/_diag")):
        return True
    accept = (request.headers.get("Accept") or "").lower()
    return ("application/json" in accept) or bool(request.is_json)


def _parse_cors_origins(env: str) -> Union[str, List[str]]:
    default_prod = os.getenv("PRIMARY_ORIGIN", "https://getfuturefunded.com").strip()
    raw = (os.getenv("CORS_ORIGINS") or ("*" if env != "production" else default_prod)).strip()
    if raw in {"", "*"}:
        return raw
    if "," in raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return raw


def _ff_is_https_request(req) -> bool:
    """
    True if the *client* connection is HTTPS (even if origin is HTTP behind CF Tunnel).
    Uses:
      - req.is_secure (ProxyFix-aware)
      - X-Forwarded-Proto
      - Cloudflare CF-Visitor hint
    """
    try:
        if getattr(req, "is_secure", False):
            return True
    except Exception:
        pass

    try:
        xfproto = (req.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
        if xfproto == "https":
            return True
    except Exception:
        pass

    try:
        cfv = req.headers.get("CF-Visitor") or ""
        if '"scheme":"https"' in cfv:
            return True
    except Exception:
        pass

    return False


def json_sanitize(x: Any) -> Any:
    """
    Recursively convert common non-JSON types into JSON-safe equivalents.
    This prevents `|tojson` from crashing on Undefined / Decimal / datetime, etc.
    """
    from datetime import date, datetime
    from decimal import Decimal

    if isinstance(x, Undefined):
        return None
    if x is None or isinstance(x, (str, int, float, bool)):
        return x
    if isinstance(x, Decimal):
        return float(x)
    if isinstance(x, (datetime, date)):
        return x.isoformat()
    if isinstance(x, dict):
        return {str(k): json_sanitize(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [json_sanitize(v) for v in x]
    return str(x)


# -----------------------------------------------------------------------------
# Logging with request_id
# -----------------------------------------------------------------------------
class _RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # type: ignore[override]
        try:
            record.request_id = getattr(g, "request_id", "-")
        except Exception:
            record.request_id = "-"
        return True


def _configure_logging(app: Flask) -> None:
    fmt = "%(asctime)s [%(levelname)s] %(name)s [rid=%(request_id)s]: %(message)s"
    root = logging.getLogger()

    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(fmt))
        handler.addFilter(_RequestIDFilter())
        root.addHandler(handler)
    else:
        for h in root.handlers:
            h.addFilter(_RequestIDFilter())
            if not getattr(h, "formatter", None) or "%(request_id)s" not in getattr(h.formatter, "_fmt", ""):
                h.setFormatter(logging.Formatter(fmt))

    root.setLevel(str(app.config.get("LOG_LEVEL", "INFO")).upper())
    logging.getLogger("werkzeug").setLevel(str(app.config.get("WERKZEUG_LOG_LEVEL", "WARNING")).upper())
    app.logger.info("Loaded config: ENV=%s DEBUG=%s", app.config.get("ENV", "?"), app.debug)


# -----------------------------------------------------------------------------
# Jinja helpers: static_url + CSP nonce attr + json_sanitize
# -----------------------------------------------------------------------------
def static_url(path: str) -> str:
    if not path:
        return "/static/"
    if "://" in path or path.startswith("//"):
        return path
    try:
        return url_for("static", filename=path.lstrip("/"))
    except Exception:
        return f"/static/{path.lstrip('/')}"


def _register_jinja_helpers(app: Flask) -> None:
    def money(v: Any) -> str:
        try:
            return "${:,.0f}".format(float(v))
        except Exception:
            return "$0"

    def nonce_attr() -> Markup:
        n = getattr(g, "csp_nonce", "") or ""
        if not n:
            return Markup("")
        return Markup(f' nonce="{escape(n)}"')

    app.jinja_env.filters["usd"] = money
    app.jinja_env.filters["json_sanitize"] = json_sanitize

    app.jinja_env.globals.setdefault("money", money)
    app.jinja_env.globals.setdefault("static_url", static_url)
    app.jinja_env.globals.setdefault("nonce_attr", nonce_attr)


def _register_default_template_context(app: Flask) -> None:
    """
    Ensure templates never see missing FF_CFG (prevents Undefined -> tojson crashes).
    Explicit render_template(..., FF_CFG=...) still overrides this default.
    """

    @app.context_processor
    def _defaults():
        return {
            "FF_CFG": {},
        }


# -----------------------------------------------------------------------------
# ProxyFix (Cloudflare Tunnel / reverse proxy)
# -----------------------------------------------------------------------------
def _apply_proxyfix(app: Flask) -> None:
    trust = _env_bool("TRUST_PROXY")
    if trust is None:
        trust = _is_prod(app)

    if not trust:
        return

    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)
    app.logger.info("ProxyFix enabled (trusting X-Forwarded-* headers).")
    # Hint for url_for outside request context (actual scheme comes from ProxyFix inside requests)
    app.config["PREFERRED_URL_SCHEME"] = "https"


# -----------------------------------------------------------------------------
# Static assets: make /static/<file> always resolvable
# -----------------------------------------------------------------------------
def _discover_static_roots() -> List[Path]:
    """
    Ordered search roots for /static/<file>.
    Includes common build output folders + app/static. Keeps it deterministic.
    """
    candidates = [
        BASE_DIR / "app" / "static",
        BASE_DIR / "static",
        BASE_DIR / "public",
        BASE_DIR / "dist",
        BASE_DIR / "build",
        BASE_DIR / "frontend" / "static",
    ]

    roots: List[Path] = []
    for p in candidates:
        if p.is_dir():
            roots.append(p)

    # Optional extra roots from env (pipe or comma separated)
    extra = (os.getenv("FF_STATIC_ROOTS") or "").strip()
    if extra:
        for chunk in extra.replace(",", "|").split("|"):
            c = chunk.strip()
            if not c:
                continue
            pp = Path(c).expanduser()
            if pp.is_dir():
                roots.append(pp)

    # If ff assets exist elsewhere, add their parent dirs as last-resort roots (bounded)
    # NOTE: bounded and deterministic: only checks a small set of known filenames.
    for name in ("ff-app.js", "ff.css"):
        try:
            for guess in (
                BASE_DIR / "app" / "static",
                BASE_DIR / "static",
                BASE_DIR / "dist",
                BASE_DIR / "build",
                BASE_DIR / "public",
            ):
                hit = guess / name
                if hit.is_file():
                    if hit.parent not in roots:
                        roots.append(hit.parent)
        except Exception:
            pass

    # Unique, order-preserving
    seen: set[str] = set()
    out: List[Path] = []
    for r in roots:
        try:
            rp = r.resolve()
        except Exception:
            continue
        key = str(rp)
        if key not in seen:
            seen.add(key)
            out.append(rp)
    return out


def _static_max_age(app: Flask, filename: str) -> int:
    """
    Conservative caching:
    - Dev: no cache
    - Prod: long cache only for obviously versioned files; else small cache
    """
    if not _is_prod(app):
        return 0
    fn = (filename or "").lower()
    if any(tok in fn for tok in (".min.", "-v", "_v", ".hash.", ".chunk.")) or (
        len(fn) >= 16 and any(c in "abcdef0123456789" for c in fn[-16:])
    ):
        return 31536000
    return 300


def _register_static_routes(app: Flask) -> None:
    roots = _discover_static_roots()
    app.config["FF_STATIC_ROOTS"] = [str(r) for r in roots]
    app.logger.info("Static roots: %s", ", ".join(app.config["FF_STATIC_ROOTS"]) or "(none)")

    @app.get("/static/<path:filename>", endpoint="static")
    def _static(filename: str):
        if not filename:
            abort(404)

        parts = Path(filename).parts
        if ".." in parts:
            abort(404)

        for root_s in app.config.get("FF_STATIC_ROOTS", []):
            root = Path(root_s)
            try:
                base = root.resolve()
            except Exception:
                continue

            full = (base / filename).resolve()
            try:
                full.relative_to(base)
            except Exception:
                continue

            if full.is_file():
                return send_file(full, conditional=True, max_age=_static_max_age(app, filename))

        abort(404)


# -----------------------------------------------------------------------------
# Blueprint registration (deterministic + strict payments)
# -----------------------------------------------------------------------------
def _safe_register(app: Flask, dotted: str, attr: Union[str, Iterable[str]], url_prefix: Optional[str]) -> bool:
    disabled = {p.strip().lower() for p in (os.getenv("DISABLE_BPS", "")).split(",") if p.strip()}
    mod_key = dotted.split(".")[-1].lower()
    if mod_key in disabled:
        app.logger.info("Disabled module: %s", dotted)
        return False

    try:
        mod = import_module(dotted)
    except Exception as e:
        app.logger.warning("Import failed: %s → %s", dotted, e)
        return False

    candidates = _iter_candidates(attr) + ["bp", "api_bp", "main_bp", "admin_bp", "sms_bp"]
    blueprint: Optional[Blueprint] = None
    for name in candidates:
        cand = getattr(mod, name, None)
        if isinstance(cand, Blueprint):
            blueprint = cand
            break

    if not blueprint:
        app.logger.warning("No blueprint found in %s (tried %s)", dotted, ", ".join(candidates))
        return False

    if blueprint.name in app.blueprints:
        return False

    try:
        app.register_blueprint(blueprint, url_prefix=url_prefix or getattr(blueprint, "url_prefix", None))
        app.logger.info("Registered blueprint: %-18s → %s", blueprint.name, url_prefix or "/")
        return True
    except Exception as exc:
        app.logger.error("Failed to register %s:%s: %s", dotted, blueprint.name, exc, exc_info=True)
        return False


def _register_blueprints(app: Flask) -> None:
    core: List[Tuple[str, str, Optional[str]]] = [
        ("app.diag", "bp", "/_diag"),
        ("app.routes.api", "bp|api_bp", "/api"),
        ("app.admin.routes", "bp|admin_bp", "/admin"),
        ("app.blueprints.fc_metrics", "bp", "/metrics"),
        ("app.routes.newsletter", "bp", "/newsletter"),
        ("app.routes.sms", "sms_bp|bp", "/sms"),
        ("app.routes.legal", "bp", "/legal"),
    ]
    for dotted, attr, prefix in core:
        if _module_exists(dotted):
            _safe_register(app, dotted, attr, prefix)

    payments_module = "app.blueprints.payments"
    legacy = ["app.routes.payments", "app.blueprints.fc_payments"]
    legacy_found = [m for m in legacy if _module_exists(m)]
    if legacy_found:
        raise RuntimeError(
            "❌ Duplicate/legacy payments modules detected:\n"
            + "\n".join(f"  - {m}" for m in legacy_found)
            + "\n\nDelete/rename duplicates so ONLY this exists:\n  app/blueprints/payments.py\n"
        )

    if not _safe_register(app, payments_module, "bp", "/payments"):
        raise RuntimeError(
            "❌ Payments blueprint failed to register.\n"
            "Ensure app/blueprints/payments.py exists and defines:\n"
            "  bp = Blueprint('payments', __name__)\n"
        )

    if _module_exists("app.routes.main"):
        _safe_register(app, "app.routes.main", "main_bp|bp", "/")

    root_owners = [rule.endpoint for rule in app.url_map.iter_rules() if rule.rule == "/"]
    if len(root_owners) > 1:
        raise RuntimeError("Multiple endpoints are registered at '/':\n" + "\n".join(f"  - {ep}" for ep in root_owners))


# -----------------------------------------------------------------------------
# Integrations
# -----------------------------------------------------------------------------
def _init_sentry(app: Flask) -> None:
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn or not sentry_sdk:
        return
    try:
        sentry_sdk.init(
            dsn=dsn,
            integrations=[
                FlaskIntegration(),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
                SqlalchemyIntegration(),
            ],
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
            send_default_pii=False,
            environment=app.config.get("ENV", "development"),
            release=os.getenv("GIT_COMMIT"),
        )
        app.logger.info("Sentry initialized")
    except Exception as e:
        app.logger.warning("Sentry init failed: %s", e)


def _init_talisman(app: Flask) -> None:
    if not _is_prod(app) or not Talisman:
        return
    Talisman(app, content_security_policy=None)


def _init_cors(app: Flask, cors_origins: Union[str, List[str]]) -> None:
    if cors is None:
        return
    supports_credentials = (os.getenv("CORS_SUPPORTS_CREDENTIALS", "")).strip().lower() in {"1", "true", "yes", "on"}
    if cors_origins == "*":
        supports_credentials = False

    cors.init_app(
        app,
        supports_credentials=supports_credentials,
        resources={
            r"/api/*": {"origins": cors_origins},
            r"/payments/*": {"origins": cors_origins},
            r"/sms/*": {"origins": cors_origins},
        },
        expose_headers=["X-Request-ID"],
        allow_headers=["Content-Type", "Authorization", "Stripe-Signature", "Idempotency-Key", "X-Request-ID"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )


def _init_socketio(app: Flask, cors_origins: Union[str, List[str]]) -> None:
    if socketio is None:
        return
    app.socketio = socketio  # type: ignore[attr-defined]
    socketio.init_app(app, cors_allowed_origins=cors_origins if cors_origins else "*")


def _maybe_create_sqlite_tables(app: Flask) -> None:
    uri = (app.config.get("SQLALCHEMY_DATABASE_URI") or "").strip()
    if not uri.startswith("sqlite"):
        return
    if app.config.get("AUTO_CREATE_SQLITE", True) is not True:
        return
    try:
        with app.app_context():
            db.create_all()
    except Exception:
        app.logger.exception("SQLite create_all failed (continuing)")


# -----------------------------------------------------------------------------
# Request lifecycle + errors + CSRF cookie
# -----------------------------------------------------------------------------
def _register_request_lifecycle(app: Flask) -> None:
    @app.before_request
    def _bootstrap_request():
        g.request_id = request.headers.get("X-Request-ID") or uuid4().hex
        g._start_ts = time.perf_counter()
        g.csp_nonce = secrets.token_urlsafe(16)

    @app.after_request
    def _attach_request_headers(resp):
        resp.headers["X-Request-ID"] = getattr(g, "request_id", "-")
        start = getattr(g, "_start_ts", None)
        if start:
            resp.headers["X-Response-Time-ms"] = str(int((time.perf_counter() - start) * 1000))
        return resp


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(HTTPException)
    def _http_err(err: HTTPException):
        if _wants_json_response():
            return _json_error(err.description or err.name, err.code or 500, request_id=getattr(g, "request_id", "-"))
        return err

    @app.errorhandler(Exception)
    def _uncaught(err: Exception):
        app.logger.exception("Unhandled error")

        if (request.path or "").startswith("/payments/stripe/webhook"):
            return ("", 500)

        if _wants_json_response():
            return _json_error("Internal Server Error", 500, request_id=getattr(g, "request_id", "-"))
        return InternalServerError()


def _register_csrf_cookie(app: Flask) -> None:
    if csrf is None or generate_csrf is None:
        return

    skip_prefixes = ("/payments/", "/api/", "/metrics/", "/healthz", "/version")

    @app.after_request
    def _inject_csrf_cookie(resp):
        try:
            path = request.path or ""
            if request.method == "GET" and not path.startswith(skip_prefixes):
                want_secure = bool(app.config.get("SESSION_COOKIE_SECURE", False))
                secure_cookie = True if (want_secure and _ff_is_https_request(request)) else False
                resp.set_cookie(
                    "csrf_token",
                    generate_csrf(),
                    samesite=str(app.config.get("SESSION_COOKIE_SAMESITE", "Lax")),
                    secure=secure_cookie,
                    httponly=False,
                )
        except Exception:
            app.logger.exception("CSRF cookie injection failed")
        return resp


# -----------------------------------------------------------------------------
# Health endpoints
# -----------------------------------------------------------------------------
def _register_health_endpoints(app: Flask) -> None:
    @app.get("/healthz")
    def _healthz():
        return {
            "status": "ok",
            "brand": app.config.get("BRAND_NAME", "FutureFunded"),
            "env": app.config.get("ENV", "unknown"),
            "request_id": getattr(g, "request_id", "-"),
        }

    @app.get("/version")
    def _version():
        return {
            "version": os.getenv("GIT_COMMIT", "dev"),
            "env": app.config.get("ENV"),
            "brand": app.config.get("BRAND_NAME", "FutureFunded"),
            "public_base_url": app.config.get("PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "",
            "static_roots": app.config.get("FF_STATIC_ROOTS", []),
        }


# -----------------------------------------------------------------------------
# Production guardrails (Stripe live key enforcement can be toggled)
# -----------------------------------------------------------------------------
def _enforce_stripe_live_keys_if_required(app: Flask) -> None:
    """
    Enforce LIVE keys only when explicitly requested.
    This avoids bricking prod while you’re still wiring live-mode.

    Enable enforcement by setting either:
      - STRIPE_MODE=live
      - FF_STRIPE_ENFORCE_LIVE_KEYS=true
    """
    if not _is_prod(app):
        return

    enforce = _env_bool_or("FF_STRIPE_ENFORCE_LIVE_KEYS", False)
    mode = (os.getenv("STRIPE_MODE") or "").strip().lower()
    if not enforce and mode != "live":
        return

    allow_test = _env_bool("FF_STRIPE_ALLOW_TEST_KEYS")
    if allow_test is True:
        return

    sk = (os.getenv("STRIPE_SECRET_KEY") or app.config.get("STRIPE_SECRET_KEY") or "").strip()
    pk = (os.getenv("STRIPE_PUBLISHABLE_KEY") or app.config.get("STRIPE_PUBLISHABLE_KEY") or "").strip()

    if not sk.startswith("sk_live_"):
        raise RuntimeError("Production requires LIVE Stripe secret key (sk_live_...)")
    if not pk.startswith("pk_live_"):
        raise RuntimeError("Production requires LIVE Stripe publishable key (pk_live_...)")


# -----------------------------------------------------------------------------
# App Factory
# -----------------------------------------------------------------------------
def create_app(config_class: Optional[ConfigLike] = None) -> Flask:
    template_root = BASE_DIR / "app" / "templates"

    app = Flask(
        __name__,
        static_folder=None,
        template_folder=str(template_root),
    )

    # ---- Config loading
    cfg = _resolve_config(config_class)
    try:
        app.config.from_object(cfg)
    except Exception as exc:
        fallback = "app.config.DevelopmentConfig"
        if isinstance(cfg, str) and cfg != fallback:
            app.config.from_object(fallback)
        else:
            raise RuntimeError(f"Invalid FLASK_CONFIG '{cfg}': {exc}")

    # ---- Normalize environment (do NOT leave ENV=?)
    env = _env_mode(app)
    if not app.config.get("ENV") or str(app.config.get("ENV")).strip() in {"", "?"}:
        app.config["ENV"] = env

    # If env indicates prod but config accidentally left DEBUG on, force-off unless allowed.
    if env == "production" and bool(app.config.get("DEBUG", False)) is True and not _env_bool_or("FF_ALLOW_DEBUG_IN_PROD", False):
        app.config["DEBUG"] = False

    app.url_map.strict_slashes = False

    # ---- Canonical public base URL
    public_base = (os.getenv("FF_PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if public_base:
        app.config["PUBLIC_BASE_URL"] = public_base

    # ---- Cookie + JSON defaults (ENV-aware, do not break existing config)
    app.config.setdefault("JSON_SORT_KEYS", False)
    app.config.setdefault("JSON_AS_ASCII", False)
    app.config.setdefault("PROPAGATE_EXCEPTIONS", False)

    app.config.setdefault("SECRET_KEY", os.getenv("SECRET_KEY") or secrets.token_urlsafe(32))
    app.config.setdefault("SESSION_COOKIE_NAME", os.getenv("SESSION_COOKIE_NAME", "futurefunded"))
    app.config.setdefault("SESSION_COOKIE_SAMESITE", os.getenv("SESSION_COOKIE_SAMESITE", "Lax"))
    app.config.setdefault("SESSION_COOKIE_HTTPONLY", _env_bool_or("SESSION_COOKIE_HTTPONLY", True))

    # IMPORTANT: secure cookies should be ON in production, but still env-overridable.
    app.config.setdefault("SESSION_COOKIE_SECURE", _env_bool_or("SESSION_COOKIE_SECURE", env == "production"))

    app.config.setdefault("PREFERRED_URL_SCHEME", "https" if env == "production" else "http")
    app.config.setdefault("AUTO_CREATE_SQLITE", True)

    # ---- Brand defaults
    app.config.setdefault("BRAND_NAME", os.getenv("BRAND_NAME", "FutureFunded"))
    app.config.setdefault("PRIMARY_ORIGIN", os.getenv("PRIMARY_ORIGIN", "https://getfuturefunded.com"))

    # ---- Proxy handling first
    _apply_proxyfix(app)

    # ---- Logging / Jinja helpers / Static routes
    _configure_logging(app)
    _register_jinja_helpers(app)
    _register_default_template_context(app)
    _register_static_routes(app)

    # ---- Optional integrations
    _init_sentry(app)
    _init_talisman(app)
    _init_cors(app, _parse_cors_origins(env))

    # ---- Core extensions
    if csrf is not None:
        csrf.init_app(app)

    db.init_app(app)
    _maybe_create_sqlite_tables(app)

    migrate.init_app(app, db, compare_type=True, render_as_batch=True)
    mail.init_app(app)

    if Compress:
        Compress(app)

    _init_socketio(app, _parse_cors_origins(env))

    # ---- Request lifecycle / errors / CSRF cookie
    _register_request_lifecycle(app)
    _register_error_handlers(app)
    _register_csrf_cookie(app)

    # ---- Auth + i18n (graceful)
    if login_manager is not None:
        login_manager.init_app(app)
        login_manager.login_view = "main.home"

        try:
            from app.models.user import User  # type: ignore
        except Exception:
            User = None  # type: ignore

        @login_manager.user_loader
        def load_user(uid: str):
            return User.query.get(int(uid)) if User else None

    if babel is not None:
        babel.init_app(app)

    # ---- Blueprints + health
    _register_blueprints(app)
    _register_health_endpoints(app)

    # ---- If nobody registered "/", render templates/index.html deterministically
    if not any(rule.rule == "/" for rule in app.url_map.iter_rules()):

        @app.get("/")
        def _index():
            return render_template("index.html", FF_CFG={})

    # ---- Scanner mitigation
    @app.get("/.git/<path:_any>")
    def _block_git(_any: str):
        return ("Not Found", 404)

    # ---- Stripe guardrails (after config/env is finalized)
    _enforce_stripe_live_keys_if_required(app)

    # ---- Optional CLI commands (graceful)
    try:
        from app.cli.seed_orgs import seed_orgs  # type: ignore

        app.cli.add_command(seed_orgs)
    except Exception:
        pass

    try:
        from turnkey import init_turnkey  # type: ignore
    except Exception as e:
        app.logger.warning("Turnkey import unavailable: %s", e)
    else:
        try:
            init_turnkey(app)
        except Exception as e:
            app.logger.warning("Turnkey init failed: %s", e)

    return app


