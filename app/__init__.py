# app/__init__.py
# FutureFunded — production-grade Flask app factory
# Deterministic config • env-correct • proxy-correct • CSP-ready • hook-safe
# Fixes: Undefined is not JSON serializable + blank FF_VERSION/_v in templates (hard-enforced)
#
# FLAGSHIP: canonical request lifecycle + response finalizer (csrf + cache policy) — no duplicate decorators.

from __future__ import annotations

# Canonical application version
APP_VERSION = "flagship-v16.3"

import importlib.util
import logging
import os
import secrets
import sys
import time
from importlib import import_module
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Type, Union
from urllib.parse import urlencode
from uuid import uuid4

from dotenv import load_dotenv
from flask import (
    Blueprint,
    Flask,
    abort,
    current_app,
    g,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)
from flask.json.provider import DefaultJSONProvider
from werkzeug.exceptions import HTTPException, InternalServerError
from werkzeug.middleware.proxy_fix import ProxyFix

# IMPORTANT: never override real env vars in prod
load_dotenv(override=False)

BASE_DIR = Path(__file__).resolve().parent.parent  # repo root
ConfigLike = Union[str, Type[Any], Any]

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
    from flask_wtf.csrf import generate_csrf  # type: ignore
except Exception:  # pragma: no cover
    generate_csrf = None  # type: ignore

# -----------------------------------------------------------------------------
# Env helpers
# -----------------------------------------------------------------------------
_TRUTHY = {"1", "true", "yes", "y", "on"}
_FALSY = {"0", "false", "no", "n", "off"}


def _env_str(name: str, default: str = "") -> str:
    v = os.getenv(name)
    if v is None:
        return default
    s = str(v).strip()
    return s if s else default


def _env_bool(name: str) -> Optional[bool]:
    v = os.getenv(name)
    if v is None:
        return None
    s = str(v).strip().lower()
    if s in _TRUTHY:
        return True
    if s in _FALSY:
        return False
    return None


def _truthy(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    return str(v).strip().lower() in _TRUTHY


def _current_env_hint() -> str:
    """
    Normalize env hint from multiple knobs.
    Priority: APP_ENV / FF_ENV / FUTUREFUNDED_ENV / ENVIRONMENT / FLASK_ENV / ENV
    """
    raw = (
        os.getenv("APP_ENV")
        or os.getenv("FF_ENV")
        or os.getenv("FUTUREFUNDED_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("FLASK_ENV")
        or os.getenv("ENV")
        or ""
    ).strip().lower()

    if raw in {"prod", "production", "live"}:
        return "production"
    if raw in {"test", "testing"}:
        return "testing"
    if raw in {"dev", "development", "local", "staging", "stage"} or raw == "":
        return "development"
    return raw


def _normalize_env_label(raw: str, debug: bool, testing: bool) -> str:
    r = (raw or "").strip().lower()
    if r in {"production", "prod", "live"}:
        return "production"
    if r in {"testing", "test"}:
        return "testing"
    if r in {"development", "dev", "local", "staging", "stage"}:
        return "development"
    # No reliable label: decide from flags
    return "production" if (not debug and not testing) else "development"


def _module_exists(dotted: str) -> bool:
    try:
        return importlib.util.find_spec(dotted) is not None
    except Exception:
        return False


def _iter_candidates(x: Union[str, Iterable[str]]) -> List[str]:
    if isinstance(x, str) and "|" in x:
        return [p.strip() for p in x.split("|") if p.strip()]
    if isinstance(x, str):
        return [x]
    return list(x)


def _import_dotted(path: str) -> Any:
    """
    Import "pkg.mod:Obj" or "pkg.mod.Obj" styles.
    """
    p = (path or "").strip()
    if not p:
        raise ImportError("empty dotted path")
    if ":" in p:
        mod_name, attr = p.split(":", 1)
    else:
        mod_name, attr = p.rsplit(".", 1)
    mod = import_module(mod_name)
    return getattr(mod, attr)


def _resolve_config_target(target: Optional[ConfigLike]) -> ConfigLike:
    """
    Deterministic config selection.
    - Caller override wins
    - Else env hint controls default Production/Development
    - FLASK_CONFIG honored, but cannot pin Development when env hint=production
    """
    if target is not None:
        return target

    env_hint = _current_env_hint()
    flask_config = _env_str("FLASK_CONFIG", "").strip()

    # Legacy typo normalization
    if flask_config == "app.config.config.DevelopmentConfig":
        flask_config = "app.config.DevelopmentConfig"
    if flask_config == "app.config.config.ProductionConfig":
        flask_config = "app.config.ProductionConfig"

    default_cfg = "app.config.ProductionConfig" if env_hint == "production" else "app.config.DevelopmentConfig"

    if env_hint == "production":
        if "DevelopmentConfig" in flask_config:
            return "app.config.ProductionConfig"
        return flask_config or default_cfg

    return flask_config or default_cfg


def _normalized_env_from_app(app: Flask) -> str:
    raw = (
        app.config.get("APP_ENV")
        or app.config.get("ENVIRONMENT")
        or app.config.get("ENV")
        or app.config.get("FLASK_ENV")
        or _current_env_hint()
        or "development"
    )
    debug = bool(app.config.get("DEBUG", False) or app.debug)
    testing = bool(app.config.get("TESTING", False) or app.testing)
    return _normalize_env_label(str(raw), debug=debug, testing=testing)


def _is_prod(app: Flask) -> bool:
    return _normalized_env_from_app(app) == "production"


# -----------------------------------------------------------------------------
# Public base URL helpers (bank-grade: tenant/domain safe)
# -----------------------------------------------------------------------------
def _sanitize_public_base(url: str, is_prod: bool, fallback: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if u.endswith("/"):
        u = u[:-1]
    if is_prod and u.startswith("http://"):
        u = "https://" + u[len("http://") :]
    if is_prod:
        low = u.lower()
        if ("localhost" in low) or ("127.0.0.1" in low) or ("[::1]" in low):
            return (fallback or "https://getfuturefunded.com").rstrip("/")
    return u


def _derive_public_base_from_request(is_prod: bool, fallback: str) -> str:
    """
    Uses ProxyFix-corrected request.url_root when available.
    Falls back to X-Forwarded-* if a proxy terminates TLS.
    """
    try:
        root = (request.url_root or "").strip()
    except Exception:
        root = ""

    if root:
        base = root.rstrip("/")
    else:
        proto = (request.headers.get("X-Forwarded-Proto") or request.scheme or "http").strip()
        host = (request.headers.get("X-Forwarded-Host") or request.host or "").strip()
        base = f"{proto}://{host}".rstrip("/")

    if is_prod and base.startswith("http://"):
        base = "https://" + base[len("http://") :]

    if is_prod:
        low = base.lower()
        if ("localhost" in low) or ("127.0.0.1" in low) or ("[::1]" in low):
            base = (fallback or "https://getfuturefunded.com").rstrip("/")

    return base


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
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter(fmt))
        h.addFilter(_RequestIDFilter())
        root.addHandler(h)
    else:
        for h in root.handlers:
            h.addFilter(_RequestIDFilter())
            if not getattr(h, "formatter", None) or "%(request_id)s" not in getattr(h.formatter, "_fmt", ""):
                h.setFormatter(logging.Formatter(fmt))

    root.setLevel(app.config.get("LOG_LEVEL", "INFO"))
    logging.getLogger("werkzeug").setLevel(app.config.get("WERKZEUG_LOG_LEVEL", "WARNING"))

    app.logger.info(
        "FutureFunded factory booted (ENV=%s DEBUG=%s CFG=%s)",
        app.config.get("ENV", "?"),
        bool(app.debug),
        app.config.get("FF_LOADED_CONFIG", "?"),
    )


# -----------------------------------------------------------------------------
# JSON helpers
# -----------------------------------------------------------------------------
def _json_error(message: str, status: int, **extra: Any):
    payload: Dict[str, Any] = {"ok": False, "error": {"code": status, "message": message}}
    rid = extra.pop("request_id", None)
    if rid:
        payload["error"]["request_id"] = rid
    if extra:
        payload["error"].update(extra)
    resp = jsonify(payload)
    resp.status_code = status
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def _wants_json_response() -> bool:
    path = request.path or ""
    if path.startswith(("/api/", "/payments/", "/metrics/", "/_diag", "/__diag")):
        return True
    accept = (request.headers.get("Accept") or "").lower()
    return "application/json" in accept or request.is_json


# -----------------------------------------------------------------------------
# Jinja helpers
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

    def nonce_attr() -> str:
        n = getattr(g, "csp_nonce", "") or ""
        return f' nonce="{n}"' if n else ""

    app.jinja_env.filters["usd"] = money
    app.jinja_env.globals.setdefault("money", money)
    app.jinja_env.globals.setdefault("static_url", static_url)
    app.jinja_env.globals.setdefault("nonce_attr", nonce_attr)


# -----------------------------------------------------------------------------
# Static assets resolver + root asset routes
# -----------------------------------------------------------------------------
def _discover_static_roots() -> List[Path]:
    candidates = [
        BASE_DIR / "app" / "static",
        BASE_DIR / "static",
        BASE_DIR / "public",
        BASE_DIR / "dist",
        BASE_DIR / "build",
    ]
    roots: List[Path] = [p.resolve() for p in candidates if p.is_dir()]

    seen = set()
    out: List[Path] = []
    for r in roots:
        k = str(r)
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def _static_max_age(app: Flask, filename: str) -> int:
    # send_file(max_age=) only sets defaults; FLAGSHIP cache policy will enforce final headers.
    if not _is_prod(app):
        return 0
    fn = (filename or "").lower()
    if any(tok in fn for tok in (".min.", "-v", "_v", ".hash.", ".chunk.")):
        return 31536000
    return 300


def _find_static(app: Flask, filename: str) -> Optional[Path]:
    if not filename:
        return None
    if ".." in Path(filename).parts:
        return None

    for root_s in app.config.get("FF_STATIC_ROOTS", []):
        root = Path(root_s)
        full = (root / filename).resolve()
        try:
            full.relative_to(root.resolve())
        except Exception:
            continue
        if full.is_file():
            return full
    return None


def _register_static_routes(app: Flask) -> None:
    roots = _discover_static_roots()
    app.config["FF_STATIC_ROOTS"] = [str(r) for r in roots]

    @app.get("/static/<path:filename>", endpoint="static")
    def _static(filename: str):
        full = _find_static(app, filename)
        if not full:
            abort(404)
        return send_file(full, conditional=True, max_age=_static_max_age(app, filename))

    @app.get("/favicon.ico")
    def _favicon():
        full = _find_static(app, "images/favicon.ico")
        if not full:
            abort(404)
        return send_file(full, conditional=True, mimetype="image/x-icon", max_age=_static_max_age(app, "images/favicon.ico"))

    @app.get("/apple-touch-icon.png")
    def _apple_touch():
        full = _find_static(app, "images/apple-touch-icon.png")
        if not full:
            abort(404)
        return send_file(full, conditional=True, mimetype="image/png", max_age=_static_max_age(app, "images/apple-touch-icon.png"))

    @app.get("/manifest.webmanifest")
    def _manifest():
        full = _find_static(app, "manifest.webmanifest")
        if not full:
            abort(404)
        return send_file(full, conditional=True, mimetype="application/manifest+json", max_age=_static_max_age(app, "manifest.webmanifest"))

    @app.get("/site.webmanifest")
    def _manifest_alias():
        return _manifest()

    @app.get("/browserconfig.xml")
    def _browserconfig():
        full = _find_static(app, "browserconfig.xml")
        if not full:
            abort(404)
        return send_file(full, conditional=True, mimetype="application/xml", max_age=_static_max_age(app, "browserconfig.xml"))

    @app.get("/robots.txt")
    def _robots():
        full = _find_static(app, "robots.txt")
        if full:
            return send_file(full, conditional=True, mimetype="text/plain; charset=utf-8", max_age=_static_max_age(app, "robots.txt"))
        body = "User-agent: *\nAllow: /\n"
        resp = make_response(body, 200)
        resp.headers["Content-Type"] = "text/plain; charset=utf-8"
        resp.headers["Cache-Control"] = "no-store" if not _is_prod(app) else "public, max-age=600"
        return resp


# -----------------------------------------------------------------------------
# ProxyFix (reverse proxy)
# IMPORTANT: call AFTER security middleware so ProxyFix becomes outermost (runs first)
# -----------------------------------------------------------------------------
def _apply_proxyfix(app: Flask) -> None:
    trust = _env_bool("TRUST_PROXY")
    if trust is None:
        trust = _is_prod(app)
    if not trust:
        return

    x_for = int(_env_str("PROXYFIX_X_FOR", "1") or "1")
    x_proto = int(_env_str("PROXYFIX_X_PROTO", "1") or "1")
    x_host = int(_env_str("PROXYFIX_X_HOST", "1") or "1")
    x_port = int(_env_str("PROXYFIX_X_PORT", "1") or "1")
    x_prefix = int(_env_str("PROXYFIX_X_PREFIX", "1") or "1")

    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=x_for,
        x_proto=x_proto,
        x_host=x_host,
        x_port=x_port,
        x_prefix=x_prefix,
    )

    if _is_prod(app) and not app.config.get("PREFERRED_URL_SCHEME"):
        app.config["PREFERRED_URL_SCHEME"] = "https"

    app.logger.info("ProxyFix enabled (x_for=%s x_proto=%s x_host=%s x_prefix=%s).", x_for, x_proto, x_host, x_prefix)

# -----------------------------------------------------------------------------
# Blueprint registration (deterministic, observable, strict where required)
# -----------------------------------------------------------------------------
from importlib import import_module
from typing import Iterable, List, Optional, Tuple, Union
import os

from flask import Blueprint, Flask


# -----------------------------------------------------------------------------
# Internal helpers
# -----------------------------------------------------------------------------
def _iter_candidates(attr: Union[str, Iterable[str]]) -> List[str]:
    if isinstance(attr, str):
        return [a.strip() for a in attr.split("|") if a.strip()]
    return list(attr)


def _safe_register(
    app: Flask,
    dotted: str,
    attr: Union[str, Iterable[str]],
    url_prefix: Optional[str],
) -> bool:
    """
    Import a module, locate a Blueprint, and register it safely.

    Rules:
    - Honors DISABLE_BPS env var
    - Never double-registers a blueprint
    - Logs clearly on success/failure
    - Never raises (caller decides strictness)
    """
    disabled = {
        p.strip().lower()
        for p in os.getenv("DISABLE_BPS", "").split(",")
        if p.strip()
    }

    mod_key = dotted.rsplit(".", 1)[-1].lower()
    if mod_key in disabled:
        app.logger.info("Blueprint disabled via DISABLE_BPS: %s", dotted)
        return False

    try:
        module = import_module(dotted)
    except Exception as exc:
        app.logger.warning("Blueprint import failed: %s → %s", dotted, exc)
        return False

    candidates = _iter_candidates(attr) + [
        "bp",
        "api_bp",
        "main_bp",
        "admin_bp",
        "sms_bp",
    ]

    blueprint: Optional[Blueprint] = None
    for name in candidates:
        candidate = getattr(module, name, None)
        if isinstance(candidate, Blueprint):
            blueprint = candidate
            break

    if blueprint is None:
        app.logger.warning(
            "No Blueprint found in %s (tried: %s)",
            dotted,
            ", ".join(candidates),
        )
        return False

    if blueprint.name in app.blueprints:
        app.logger.debug("Blueprint already registered: %s", blueprint.name)
        return False

    try:
        app.register_blueprint(
            blueprint,
            url_prefix=url_prefix or getattr(blueprint, "url_prefix", None),
        )
        app.logger.info(
            "Registered blueprint: %-18s → %s",
            blueprint.name,
            url_prefix or "/",
        )
        return True
    except Exception as exc:
        app.logger.error(
            "Failed to register blueprint %s (%s): %s",
            dotted,
            blueprint.name,
            exc,
            exc_info=True,
        )
        return False


# -----------------------------------------------------------------------------
# Public registration entrypoint
# -----------------------------------------------------------------------------
def _register_blueprints(app: Flask) -> None:
    """
    Register all application blueprints in a deterministic order.

    Guarantees:
    - Payments is strict (must exist, must be unique)
    - Root (/) has exactly one owner
    - Fail-fast on structural violations
    """

    # ---- Core, optional blueprints -----------------------------------------
    core: List[Tuple[str, str, Optional[str]]] = [
        ("app.diag", "bp", "/_diag"),
        ("app.routes.api", "bp|api_bp", "/api"),
        ("app.admin.routes", "bp|admin_bp", "/admin"),
        ("app.blueprints.fc_metrics", "bp", "/metrics"),
        ("app.routes.newsletter", "bp", "/newsletter"),
        ("app.routes.sms", "sms_bp|bp", "/sms"),
        ("app.routes.legal", "bp", "/legal"),
        ("app.blueprints.embed", "embed_bp|bp", "/embed"),  # 👈 embed now wired
    ]

    for dotted, attr, prefix in core:
        if _module_exists(dotted):
            _safe_register(app, dotted, attr, prefix)

    # ---- Payments (STRICT) --------------------------------------------------
    payments_module = "app.blueprints.payments"
    legacy_modules = [
        "app.routes.payments",
        "app.blueprints.fc_payments",
    ]

    legacy_found = [m for m in legacy_modules if _module_exists(m)]
    if legacy_found:
        raise RuntimeError(
            "❌ Duplicate / legacy payments modules detected:\n"
            + "\n".join(f"  - {m}" for m in legacy_found)
            + "\n\nExpected ONE canonical module:\n"
            "  app/blueprints/payments.py\n"
        )

    if not _safe_register(app, payments_module, "bp", "/payments"):
        raise RuntimeError(
            "❌ Payments blueprint failed to register.\n"
            "Ensure app/blueprints/payments.py exists and defines:\n"
            "  bp = Blueprint('payments', __name__)\n"
        )

    # ---- Root (/) owner -----------------------------------------------------
    if _module_exists("app.routes.main"):
        _safe_register(app, "app.routes.main", "main_bp|bp", "/")

    root_endpoints = [
        rule.endpoint for rule in app.url_map.iter_rules() if rule.rule == "/"
    ]
    if len(root_endpoints) > 1:
        raise RuntimeError(
            "❌ Multiple endpoints registered at '/':\n"
            + "\n".join(f"  - {ep}" for ep in root_endpoints)
        )

# -----------------------------------------------------------------------------
# Integrations
# -----------------------------------------------------------------------------
def _parse_cors_origins(env: str) -> Union[str, List[str]]:
    default_prod = os.getenv("PRIMARY_ORIGIN", "https://getfuturefunded.com").strip()
    raw = (os.getenv("CORS_ORIGINS") or ("*" if env != "production" else default_prod)).strip()
    if raw in {"", "*"}:
        return raw
    if "," in raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return raw


def _init_cors(app: Flask, cors_origins: Union[str, List[str]]) -> None:
    if not cors:
        return
    supports_credentials = _truthy(os.getenv("CORS_SUPPORTS_CREDENTIALS", ""))
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
        expose_headers=["X-Request-ID", "X-Response-Time-ms", "X-FutureFunded-Turnkey-Version"],
        allow_headers=["Content-Type", "Authorization", "Stripe-Signature", "Idempotency-Key", "X-Request-ID"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )


def _init_socketio(app: Flask, cors_origins: Union[str, List[str]]) -> None:
    if not socketio:
        return
    app.socketio = socketio  # type: ignore[attr-defined]
    socketio.init_app(app, cors_allowed_origins=cors_origins if cors_origins else "*")


def _maybe_create_sqlite_tables(app: Flask) -> None:
    if _is_prod(app):
        return
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
# Request lifecycle + errors + CSRF cookie + FLAGSHIP cache policy
# -----------------------------------------------------------------------------
_CSRF_SKIP_PREFIXES = (
    "/payments/",
    "/api/",
    "/metrics/",
    "/healthz",
    "/version",
    "/_diag",
    "/__diag",
    "/static/",
)

_ASSET_PATH_PREFIXES = ("/static/",)
_ASSET_EXACT_PATHS = (
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/manifest.webmanifest",
    "/site.webmanifest",
    "/browserconfig.xml",
)


def _register_request_lifecycle(app: Flask) -> None:
    """
    Canonical before_request + canonical after_request finalizer.
    IMPORTANT: register this EARLY so it runs LAST (after_request order is reversed).
    """

    @app.before_request
    def _bootstrap_request() -> None:
        g.request_id = request.headers.get("X-Request-ID") or uuid4().hex
        g._start_ts = time.perf_counter()
        g.csp_nonce = secrets.token_urlsafe(16)

    @app.after_request
    def _finalize_response(resp):
        # 1) Request tracing headers
        resp.headers["X-Request-ID"] = getattr(g, "request_id", "-")
        start = getattr(g, "_start_ts", None)
        if isinstance(start, (int, float)):
            try:
                resp.headers["X-Response-Time-ms"] = str(int((time.perf_counter() - start) * 1000))
            except Exception:
                pass

        # 2) Optional Turnkey version header (if present)
        try:
            tv = (app.extensions.get("ff_turnkey_version") or "").strip()
            if tv:
                resp.headers.setdefault("X-FutureFunded-Turnkey-Version", tv)
        except Exception:
            pass

        # 3) CSRF cookie injection (GET + allowed paths)
        _maybe_set_csrf_cookie(app, resp)

        # 4) FLAGSHIP cache policy — must run last
        return _apply_flagship_cache_policy(app, resp)


def _maybe_set_csrf_cookie(app: Flask, resp) -> None:
    """
    Inject CSRF cookie for GET document loads.
    Skips static assets and API/payment/diag endpoints.
    """
    if not csrf or not generate_csrf:
        return

    try:
        path = request.path or ""
        if request.method != "GET":
            return
        if path.startswith(_CSRF_SKIP_PREFIXES):
            return

        resp.set_cookie(
            "csrf_token",
            generate_csrf(),
            samesite="Lax",
            secure=_is_prod(app),
            httponly=False,
            path="/",
        )
    except Exception:
        app.logger.exception("CSRF cookie injection failed")


def _apply_flagship_cache_policy(app: Flask, resp):
    """
    FLAGSHIP CACHE POLICY (authoritative; runs last)
    - Static: immutable caching in PRODUCTION (safe because assets are versioned via ?v=)
    - Dev: keep no-store to avoid confusing caching during iteration
    - Never allow global no-store to leak into /static/*
    """
    path = request.path or ""

    is_asset = path.startswith(_ASSET_PATH_PREFIXES) or path in _ASSET_EXACT_PATHS
    if is_asset:
        if _is_prod(app):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            # dev: keep fast iteration predictable
            resp.headers["Cache-Control"] = "no-store"

        resp.headers.pop("Pragma", None)
        return resp

    # HTML: keep existing route-level policy. (Routes already set no-store.)
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


# -----------------------------------------------------------------------------
# Version helpers (public-safe + gated diag)
# -----------------------------------------------------------------------------
def _app_identity(app: Flask) -> Dict[str, str]:
    name = _env_str("APP_NAME") or app.config.get("BRAND_NAME", "FutureFunded")
    version = _env_str("APP_VERSION") or app.config.get("APP_VERSION", "") or "dev"
    commit = _env_str("APP_COMMIT") or _env_str("GIT_COMMIT") or "unknown"
    return {"name": str(name), "version": str(version), "commit": str(commit)}


def _db_sanitized(app: Flask) -> Dict[str, str]:
    uri = (app.config.get("SQLALCHEMY_DATABASE_URI") or "").strip()
    if not uri:
        return {"engine": "unknown", "display": "unset"}
    engine = uri.split(":", 1)[0].lower()
    if engine.startswith("sqlite"):
        return {"engine": "sqlite", "display": "sqlite (file)"}
    if engine in {"postgres", "postgresql"}:
        return {"engine": "postgres", "display": "postgres"}
    if engine in {"mysql", "mariadb"}:
        return {"engine": "mysql", "display": "mysql"}
    return {"engine": engine, "display": engine}


def _diag_authorized() -> bool:
    token = _env_str("DIAG_TOKEN", "").strip()
    if not token:
        return False
    supplied = (request.headers.get("X-Diag-Token") or "").strip()
    try:
        return secrets.compare_digest(supplied, token)
    except Exception:
        return False


def _register_health_endpoints(app: Flask) -> None:
    @app.get("/healthz")
    def _healthz():
        return {
            "status": "ok",
            "brand": app.config.get("BRAND_NAME", "FutureFunded"),
            "env": _normalized_env_from_app(app),
            "request_id": getattr(g, "request_id", "-"),
        }

    @app.get("/version")
    def _version():
        payload = {
            "ok": True,
            "platform": "FutureFunded",
            "brand": app.config.get("BRAND_NAME", "FutureFunded"),
            "env": _normalized_env_from_app(app),
            "public_base_url": app.config.get("FF_PUBLIC_BASE_URL") or app.config.get("PUBLIC_BASE_URL") or "",
            "app": _app_identity(app),
        }
        resp = jsonify(payload)
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    @app.get("/__diag/version")
    def _diag_version_fallback():
        if not _diag_authorized():
            return ("Not Found", 404)

        payload = {
            "ok": True,
            "platform": "FutureFunded",
            "brand": app.config.get("BRAND_NAME", "FutureFunded"),
            "env": _normalized_env_from_app(app),
            "public_base_url": app.config.get("FF_PUBLIC_BASE_URL") or app.config.get("PUBLIC_BASE_URL") or "",
            "app": _app_identity(app),
            "diag": {
                "pid": os.getpid(),
                "python": {"version": (sys.version.split()[0] if sys.version else "")},
                "loaded_config": app.config.get("FF_LOADED_CONFIG", ""),
                "static_roots": app.config.get("FF_STATIC_ROOTS", []),
                "db": _db_sanitized(app),
            },
        }
        resp = jsonify(payload)
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp


# -----------------------------------------------------------------------------
# Security middleware installer (single canonical call site)
# -----------------------------------------------------------------------------
def _install_security(app: Flask) -> None:
    try:
        from app.security_headers import install_security_middleware  # type: ignore

        install_security_middleware(app)
        app.logger.info("Security middleware installed (app.security_headers).")
    except Exception as e:
        try:
            app.logger.warning("Security middleware NOT installed: %s", e)
        except Exception:
            pass


# -----------------------------------------------------------------------------
# Turnkey hook (optional) — SINGLE INIT ONLY (safe in prod)
# -----------------------------------------------------------------------------
def _maybe_init_turnkey(app: Flask) -> None:
    if app.extensions.get("ff_turnkey_inited") is True:
        return
    app.extensions["ff_turnkey_inited"] = True

    enabled = _env_bool("FF_TURNKEY_ENABLED")
    if enabled is False:
        app.extensions["ff_turnkey_version"] = ""
        app.logger.info("Turnkey disabled via FF_TURNKEY_ENABLED=0")
        return

    try:
        import turnkey  # type: ignore

        app.extensions["ff_turnkey_version"] = getattr(turnkey, "__version__", "") or ""
    except Exception:
        app.extensions["ff_turnkey_version"] = ""

    try:
        from turnkey import init_turnkey  # type: ignore
    except Exception as e:
        app.logger.debug("Turnkey import unavailable: %s", e)
        return

    try:
        init_turnkey(app)
        app.logger.info("turnkey.init_turnkey: enabled")
    except Exception as e:
        app.logger.warning("Turnkey init failed: %s", e)


# -----------------------------------------------------------------------------
# Production guardrails
# -----------------------------------------------------------------------------
def _enforce_production_guardrails(app: Flask) -> None:
    if not _is_prod(app):
        return

    if bool(app.debug) or _truthy(os.getenv("FLASK_DEBUG", "")):
        raise RuntimeError("FLASK_DEBUG / DEBUG must be off in production.")

    sk = app.config.get("SECRET_KEY")
    if not sk or str(sk).strip() in {"", "dev-change-me", "CHANGE_ME_GENERATE_64B"}:
        raise RuntimeError("SECRET_KEY must be set to a strong random value in production.")

    base = (app.config.get("FF_PUBLIC_BASE_URL") or app.config.get("PUBLIC_BASE_URL") or "").strip()
    if base and base.startswith("http://"):
        raise RuntimeError("PUBLIC_BASE_URL / FF_PUBLIC_BASE_URL must be https:// in production.")


# -----------------------------------------------------------------------------
# Mode/Smoke resolution (query-param overrides are non-prod only)
# -----------------------------------------------------------------------------
_ALLOWED_MODES = {"demo", "preview", "live"}


def _resolve_mode_and_smoke(app: Flask) -> Tuple[str, bool]:
    if _is_prod(app):
        return ("live", False)

    requested_mode = (request.args.get("mode") or "").strip().lower()
    cfg_default = (app.config.get("FF_DEFAULT_MODE") or "demo").strip().lower()
    default_mode = cfg_default if cfg_default in _ALLOWED_MODES else "demo"
    ff_data_mode = requested_mode if requested_mode in _ALLOWED_MODES else default_mode

    v = (request.args.get("smoke") or "").strip().lower()
    smoke = v in {"1", "true", "yes", "y", "on"}
    return (ff_data_mode, smoke)


def _redirect_strip_params(param_names: Tuple[str, ...] = ("mode", "smoke")):
    kept = []
    for k, vals in request.args.lists():
        if k in param_names:
            continue
        for v in vals:
            kept.append((k, v))

    target = request.path
    if kept:
        target = f"{target}?{urlencode(kept, doseq=True)}"
    return redirect(target, code=302)


# -----------------------------------------------------------------------------
# Public bootstrap injector (ff_env + ff_public_base_url + canonical + stripe return)
# -----------------------------------------------------------------------------
def _init_public_bootstrap(app: Flask) -> None:
    debug = bool(app.config.get("DEBUG", False) or app.debug)
    testing = bool(app.config.get("TESTING", False) or app.testing)

    raw_env = (
        app.config.get("APP_ENV")
        or app.config.get("ENV")
        or app.config.get("FLASK_ENV")
        or os.getenv("APP_ENV")
        or os.getenv("ENV")
        or os.getenv("FLASK_ENV")
        or ""
    )
    ff_env = _normalize_env_label(str(raw_env), debug=debug, testing=testing)
    app.config["FF_ENV"] = ff_env

    fallback = (app.config.get("FF_PUBLIC_BASE_FALLBACK") or "https://getfuturefunded.com").rstrip("/")

    raw_base = (
        app.config.get("FF_PUBLIC_BASE_URL")
        or os.getenv("FF_PUBLIC_BASE_URL")
        or app.config.get("PUBLIC_BASE_URL")
        or os.getenv("PUBLIC_BASE_URL")
        or ""
    )
    configured = _sanitize_public_base(str(raw_base), is_prod=(ff_env == "production"), fallback=fallback)
    if configured:
        app.config["FF_PUBLIC_BASE_URL"] = configured
        app.config["PUBLIC_BASE_URL"] = configured

    @app.context_processor
    def _inject_ff_public_context():
        env_label = app.config.get("FF_ENV", "development")
        is_prod = env_label == "production"

        base = (app.config.get("FF_PUBLIC_BASE_URL") or "").strip()
        if base:
            base = _sanitize_public_base(base, is_prod=is_prod, fallback=fallback)
        else:
            base = _derive_public_base_from_request(is_prod=is_prod, fallback=fallback)

        script_root = (request.script_root or "").rstrip("/")
        canonical_url = f"{base}{script_root}{request.path}"
        stripe_return_url = f"{base}{script_root}/"

        return {
            "ff_env": env_label,
            "ff_public_base_url": base,
            "canonical_url": canonical_url,
            "stripe_return_url": stripe_return_url,
        }


# -----------------------------------------------------------------------------
# JSON Provider Hardening + Build Meta Injection (HARD ENFORCED)
# -----------------------------------------------------------------------------
class _FFJSONProvider(DefaultJSONProvider):
    def default(self, o):  # type: ignore[override]
        try:
            from jinja2.runtime import Undefined  # type: ignore

            if isinstance(o, Undefined):
                return None
        except Exception:
            pass

        try:
            if isinstance(o, Path):
                return str(o)
        except Exception:
            pass

        try:
            from uuid import UUID

            if isinstance(o, UUID):
                return str(o)
        except Exception:
            pass

        return super().default(o)


def _coalesce(*vals: object) -> str:
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def _compute_build_meta(app: Flask) -> Dict[str, str]:
    turnkey_v = _coalesce(
        os.getenv("FF_TURNKEY_VERSION"),
        os.getenv("TURNKEY_VERSION"),
        app.extensions.get("ff_turnkey_version", ""),
        app.config.get("FF_TURNKEY_VERSION"),
        app.config.get("TURNKEY_VERSION"),
    )

    ff_version = _coalesce(
        os.getenv("APP_VERSION"),
        os.getenv("FF_VERSION"),
        os.getenv("VERSION"),
        app.config.get("APP_VERSION"),
        app.config.get("FF_VERSION"),
        app.config.get("VERSION"),
        turnkey_v,
        "dev",
    )

    ff_asset_v = _coalesce(
        os.getenv("FF_ASSET_VERSION"),
        os.getenv("FF_ASSET_V"),
        os.getenv("ASSET_VERSION"),
        os.getenv("ASSET_V"),
        app.config.get("FF_ASSET_VERSION"),
        app.config.get("FF_ASSET_V"),
        app.config.get("ASSET_VERSION"),
        app.config.get("ASSET_V"),
        ff_version,
    )

    ff_build_id = _coalesce(
        os.getenv("FF_BUILD_ID"),
        os.getenv("BUILD_ID"),
        os.getenv("FF_BUILD"),
        app.config.get("FF_BUILD_ID"),
        app.config.get("BUILD_ID"),
        app.config.get("FF_BUILD"),
        ff_version,
    )

    ff_commit = _coalesce(
        os.getenv("APP_COMMIT"),
        os.getenv("GIT_COMMIT"),
        os.getenv("COMMIT_SHA"),
        app.config.get("APP_COMMIT"),
        app.config.get("GIT_COMMIT"),
        "",
    )

    return {
        "ff_version": ff_version,
        "ff_asset_v": ff_asset_v,
        "ff_build_id": ff_build_id,
        "ff_commit": ff_commit,
        "turnkey_version": turnkey_v,
    }


def _patch_update_template_context(app: Flask) -> None:
    if app.extensions.get("ff_update_template_context_patched") is True:
        return

    original = app.update_template_context

    def _blank(x: Any) -> bool:
        if x is None:
            return True
        if isinstance(x, str) and not x.strip():
            return True
        return False

    def patched(context: Dict[str, Any]) -> None:
        original(context)
        meta = app.extensions.get("ff_build_meta") or _compute_build_meta(app)

        ff_version = str(app.config.get("FF_VERSION") or app.config.get("APP_VERSION") or meta.get("ff_version") or "dev").strip()
        ff_asset_v = str(app.config.get("FF_ASSET_V") or app.config.get("FF_ASSET_VERSION") or meta.get("ff_asset_v") or ff_version).strip()
        ff_build_id = str(app.config.get("FF_BUILD_ID") or app.config.get("BUILD_ID") or meta.get("ff_build_id") or ff_version).strip()
        ff_commit = str(app.config.get("APP_COMMIT") or app.config.get("GIT_COMMIT") or meta.get("ff_commit") or "").strip()

        if _blank(context.get("FF_VERSION")):
            context["FF_VERSION"] = ff_version
        if _blank(context.get("FF_BUILD_ID")):
            context["FF_BUILD_ID"] = ff_build_id
        if _blank(context.get("FF_ASSET_V")):
            context["FF_ASSET_V"] = ff_asset_v
        if _blank(context.get("_v")):
            context["_v"] = ff_asset_v

        if _blank(context.get("ff_version")):
            context["ff_version"] = ff_version
        if _blank(context.get("ff_build_id")):
            context["ff_build_id"] = ff_build_id
        if _blank(context.get("ff_asset_v")):
            context["ff_asset_v"] = ff_asset_v
        if _blank(context.get("ff_commit")) and ff_commit:
            context["ff_commit"] = ff_commit

        if _blank(context.get("flagship_version")):
            context["flagship_version"] = ff_version

    app.update_template_context = patched  # type: ignore[assignment]
    app.extensions["ff_update_template_context_patched"] = True


def _install_build_meta(app: Flask, *, force: bool = False) -> None:
    if force or not isinstance(getattr(app, "json", None), _FFJSONProvider):
        app.json = _FFJSONProvider(app)

    meta = _compute_build_meta(app)
    app.extensions["ff_build_meta"] = meta

    ff_version = meta["ff_version"]
    ff_asset_v = meta["ff_asset_v"]
    ff_build_id = meta["ff_build_id"]
    ff_commit = meta["ff_commit"]
    turnkey_v = meta["turnkey_version"]

    app.config.update(
        {
            "APP_VERSION": ff_version,
            "FF_VERSION": ff_version,
            "VERSION": ff_version,
            "FF_ASSET_VERSION": ff_asset_v,
            "FF_ASSET_V": ff_asset_v,
            "ASSET_VERSION": ff_asset_v,
            "ASSET_V": ff_asset_v,
            "FF_BUILD_ID": ff_build_id,
            "BUILD_ID": ff_build_id,
            "FF_BUILD": ff_build_id,
        }
    )
    if ff_commit:
        app.config["APP_COMMIT"] = ff_commit
        app.config["GIT_COMMIT"] = ff_commit
    if turnkey_v:
        app.config.setdefault("FF_TURNKEY_VERSION", turnkey_v)
        app.config.setdefault("TURNKEY_VERSION", turnkey_v)

    app.jinja_env.globals.update(
        {
            "ff_version": ff_version,
            "ff_asset_v": ff_asset_v,
            "ff_build_id": ff_build_id,
            "ff_commit": ff_commit,
            "FF_VERSION": ff_version,
            "FF_BUILD_ID": ff_build_id,
            "FF_ASSET_V": ff_asset_v,
            "_v": ff_asset_v,
            "flagship_version": ff_version,
        }
    )

    _patch_update_template_context(app)


# -----------------------------------------------------------------------------
# App Factory
# -----------------------------------------------------------------------------
def create_app(config_class: Optional[ConfigLike] = None) -> Flask:
    template_root = BASE_DIR / "app" / "templates"

    # Disable Flask’s built-in static so we control /static resolution
    app = Flask(__name__, static_folder=None, template_folder=str(template_root))
    app.config["APP_VERSION"] = APP_VERSION
    app.config["ASSET_VERSION"] = APP_VERSION
    app.url_map.strict_slashes = False

    # ---- Config loading (deterministic + env-correct)
    cfg_target = _resolve_config_target(config_class)
    cfg_obj: Any = cfg_target

    try:
        if isinstance(cfg_target, str):
            cfg_obj = _import_dotted(cfg_target)
            app.config["FF_LOADED_CONFIG"] = cfg_target
        else:
            app.config["FF_LOADED_CONFIG"] = getattr(cfg_target, "__name__", str(cfg_target))

        app.config.from_object(cfg_obj)

        if hasattr(cfg_obj, "init_app") and callable(getattr(cfg_obj, "init_app")):
            cfg_obj.init_app(app)

    except Exception as exc:
        if _current_env_hint() == "production":
            raise RuntimeError(f"Failed to load production config ({cfg_target}): {exc}") from exc

        try:
            cfg_obj = _import_dotted("app.config.DevelopmentConfig")
            app.config["FF_LOADED_CONFIG"] = "app.config.DevelopmentConfig"
            app.config.from_object(cfg_obj)
            if hasattr(cfg_obj, "init_app") and callable(getattr(cfg_obj, "init_app")):
                cfg_obj.init_app(app)
        except Exception as exc2:
            raise RuntimeError(f"Failed to load any config: {exc2}") from exc2

    # Normalize ENV into app.config (single source of truth)
    env_norm = _normalized_env_from_app(app)
    app.config["ENV"] = env_norm

    # Honor PUBLIC_BASE_URL / FF_PUBLIC_BASE_URL if provided (sanitized later)
    public_base = (_env_str("FF_PUBLIC_BASE_URL") or _env_str("PUBLIC_BASE_URL")).strip().rstrip("/")
    if public_base:
        app.config["PUBLIC_BASE_URL"] = public_base
        app.config["FF_PUBLIC_BASE_URL"] = public_base

    # Safer JSON defaults
    app.config.setdefault("JSON_SORT_KEYS", False)
    app.config.setdefault("JSON_AS_ASCII", False)
    app.config.setdefault("PROPAGATE_EXCEPTIONS", False)

    # Brand defaults
    app.config.setdefault("BRAND_NAME", _env_str("BRAND_NAME", "FutureFunded"))
    app.config.setdefault("PRIMARY_ORIGIN", _env_str("PRIMARY_ORIGIN", "https://getfuturefunded.com"))
    app.config.setdefault("FF_PUBLIC_BASE_FALLBACK", "https://getfuturefunded.com")

    # Dev convenience
    app.config.setdefault("AUTO_CREATE_SQLITE", env_norm != "production")

    # ---- Build meta first pass (before turnkey)
    _install_build_meta(app, force=True)

    # ---- Register lifecycle EARLY so it runs LAST (authoritative cache policy)
    _register_request_lifecycle(app)

    # ---- Logging early
    _configure_logging(app)

    # ---- Security middleware
    _install_security(app)

    # ---- ProxyFix should be outermost
    _apply_proxyfix(app)

    # ---- Public bootstrap injection
    _init_public_bootstrap(app)

    # ---- Jinja + Static routes
    _register_jinja_helpers(app)
    _register_static_routes(app)

    # ---- Core extensions
    if csrf:
        csrf.init_app(app)

    db.init_app(app)
    _maybe_create_sqlite_tables(app)

    if migrate:
        migrate.init_app(app, db, compare_type=True, render_as_batch=True)

    if mail:
        mail.init_app(app)

    if Compress:
        Compress(app)

    cors_origins = _parse_cors_origins(env_norm)
    _init_cors(app, cors_origins)
    _init_socketio(app, cors_origins)

    # ---- Errors
    _register_error_handlers(app)

    # ---- Global template defaults (prevents “route forgot to pass ff_data_mode” landmines)
    @app.context_processor
    def _ff_mode_defaults():
        ff_data_mode, smoke = _resolve_mode_and_smoke(current_app)
        return {"ff_data_mode": ff_data_mode, "smoke": smoke}

    # ---- Production: refuse ?mode/?smoke on "/" even if blueprint owns "/"
    @app.before_request
    def _prod_strip_mode_smoke_on_root():
        if _is_prod(app) and request.path == "/" and ("mode" in request.args or "smoke" in request.args):
            return _redirect_strip_params(("mode", "smoke"))
        return None

    # ---- Auth + i18n (graceful)
    if login_manager:
        login_manager.init_app(app)
        login_manager.login_view = "main.home"

        try:
            from app.models.user import User  # type: ignore
        except Exception:
            User = None  # type: ignore

        @login_manager.user_loader
        def load_user(uid: str):
            try:
                return User.query.get(int(uid)) if User else None
            except Exception:
                return None

    if babel:
        babel.init_app(app)

    # ---- Blueprints + health
    _register_blueprints(app)
    _register_health_endpoints(app)

    # ---- If nobody registered "/", render templates/index.html deterministically
    if not any(rule.rule == "/" for rule in app.url_map.iter_rules()):

        @app.get("/")
        def _index_fallback():
            if _is_prod(app) and ("mode" in request.args or "smoke" in request.args):
                return _redirect_strip_params(("mode", "smoke"))
            return render_template("index.html")

    # ---- Scanner mitigation
    @app.get("/.git/<path:_any>")
    def _block_git(_any: str):
        return ("Not Found", 404)

    # ---- Turnkey hook (optional)
    _maybe_init_turnkey(app)

    # ---- Build meta FINAL pass (after turnkey), and re-patch context enforcement
    _install_build_meta(app, force=True)

    # ---- Final production guardrails
    _enforce_production_guardrails(app)

    return app


__all__ = ["create_app"]
