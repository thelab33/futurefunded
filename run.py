#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
FutureFunded Flagship Launcher — dev reload + cache-bust + Cloudflare Tunnel hardening.

This is the single, complete "run.py/launcher.py" entrypoint you can use for:
- Local dev:             ./run.py --env development --open-browser
- Local dev (no reload): ./run.py --env development --no-reload
- Production (Tunnel):   ENV=production TRUST_PROXY=1 PUBLIC_BASE_URL=https://getfuturefunded.com ./run.py --env production --no-reload --debug=false
- Gunicorn export:       gunicorn "run:app"  (exports `app` when imported)

Adds:
- ProxyFix controls for Cloudflare Tunnel / reverse proxy correctness (X-Forwarded-Proto/Host)
- PUBLIC_BASE_URL / FF_PUBLIC_BASE_URL wiring so templates + Stripe return_url can be https
- Production preflight warnings (Stripe test keys, HTTP base URL, debug/reloader on in prod)
- Optional HTML nonce autopatcher for templates (script/style nonce_attr injection)
- Dev no-cache headers to stop stale CSS/JS/HTML while iterating
- Turnkey version overlay: forces /api/turnkey/config flagship.version to a canonical FutureFunded Turnkey version

Notes:
- Enforce HTTP->HTTPS at Cloudflare edge (Always Use HTTPS / Redirect Rule).
- This file assumes a Flask app factory at `app.create_app(config_path)`.
- If you use Flask-SocketIO, it will run via `app.extensions.socketio` if present; otherwise falls back to Flask.run().
"""

import argparse
import atexit
import json
import logging
import os
import re
import signal
import socket
import sys
import threading
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional, Tuple

# -----------------------------------------------------------------------------
# dotenv (optional)
# -----------------------------------------------------------------------------
try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover
    load_dotenv = None  # type: ignore

# -----------------------------------------------------------------------------
# Optional middleware
# -----------------------------------------------------------------------------
try:
    from werkzeug.middleware.proxy_fix import ProxyFix  # type: ignore
except Exception:  # pragma: no cover
    ProxyFix = None  # type: ignore

# -----------------------------------------------------------------------------
# Optional Sentry
# -----------------------------------------------------------------------------
try:
    import sentry_sdk  # type: ignore
    from sentry_sdk.integrations.flask import FlaskIntegration  # type: ignore
except Exception:  # pragma: no cover
    sentry_sdk = None  # type: ignore
    FlaskIntegration = None  # type: ignore


# -----------------------------------------------------------------------------
# Env + dotenv helpers
# -----------------------------------------------------------------------------
def _env_bool(name: str) -> Optional[bool]:
    """Return bool for env var if set, otherwise None."""
    v = os.getenv(name)
    if v is None:
        return None
    vv = str(v).strip().lower()
    if vv in {"1", "true", "yes", "y", "on"}:
        return True
    if vv in {"0", "false", "no", "n", "off"}:
        return False
    return None


def _normalize_env_name(v: str) -> str:
    r = (v or "").strip().lower()
    if r in {"dev", "development", "local"}:
        return "development"
    if r in {"test", "testing"}:
        return "testing"
    if r in {"prod", "production"}:
        return "production"
    return r or "development"


def _dotenv_candidates(env: str) -> list[Path]:
    """
    Order matters. We use override=False so OS env vars always win (prod-safe).
    """
    env = _normalize_env_name(env)

    aliases: list[str] = []
    if env in {"development", "testing"}:
        aliases.append("local")

    files: list[Path] = []
    files.append(Path(".env"))
    files.append(Path(f".env.{env}"))
    for a in aliases:
        files.append(Path(f".env.{a}"))

    out: list[Path] = []
    seen: set[str] = set()
    for p in files:
        k = str(p)
        if k not in seen:
            seen.add(k)
            out.append(p)
    return out


def load_env_stack(*, env: Optional[str] = None, override: bool = False) -> list[Path]:
    """
    Loads dotenv files in a predictable order. Returns the files that were loaded.

    Priority:
      1) DOTENV_PATH (single file, if exists)
      2) .env, then .env.<env>, then optional alias like .env.local

    override=False is recommended so server-provided env vars win.
    """
    loaded: list[Path] = []
    if load_dotenv is None:
        return loaded

    explicit = (os.getenv("DOTENV_PATH") or "").strip()
    if explicit:
        p = Path(explicit)
        if p.exists() and p.is_file():
            load_dotenv(p, override=override)
            loaded.append(p)
        return loaded

    env_eff = _normalize_env_name(env or os.getenv("ENV") or os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "development")
    for p in _dotenv_candidates(env_eff):
        if p.exists() and p.is_file():
            load_dotenv(p, override=override)
            loaded.append(p)

    return loaded


def normalize_config_path(value: Optional[str], *, env_hint: Optional[str] = None) -> str:
    """
    Returns a dotted path like "app.config.DevelopmentConfig".
    Priority:
      1) explicit value (e.g. --config)
      2) env_hint (e.g. --env)
      3) FLASK_ENV / ENV
    """
    if value and str(value).strip():
        v = value.strip()
        # backwards-compat normalization if someone used app.config.config.X
        if v.startswith("app.config.config."):
            v = v.replace("app.config.config.", "app.config.", 1)

        alias = {
            "dev": "app.config.DevelopmentConfig",
            "development": "app.config.DevelopmentConfig",
            "test": "app.config.TestingConfig",
            "testing": "app.config.TestingConfig",
            "prod": "app.config.ProductionConfig",
            "production": "app.config.ProductionConfig",
        }
        return alias.get(v.lower(), v)

    env = _normalize_env_name(env_hint or os.getenv("FLASK_ENV") or os.getenv("ENV") or os.getenv("APP_ENV") or "development")
    return {
        "development": "app.config.DevelopmentConfig",
        "testing": "app.config.TestingConfig",
        "production": "app.config.ProductionConfig",
    }.get(env, "app.config.DevelopmentConfig")


# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
class ColorFormatter(logging.Formatter):
    COLORS = {
        "DEBUG": "\033[36m",
        "INFO": "\033[32m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[1;41m",
        "RESET": "\033[0m",
    }

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        c = self.COLORS.get(record.levelname, "")
        return f"{c}{base}{self.COLORS['RESET']}"


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        obj = {
            "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            obj["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(obj)


def setup_logging(debug: bool, style: str) -> None:
    style = (os.getenv("LOG_STYLE") or style).lower()
    handler = logging.StreamHandler(sys.stdout)

    if style == "json":
        handler.setFormatter(JsonFormatter())
    elif style == "plain" or not sys.stdout.isatty():
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    else:
        handler.setFormatter(ColorFormatter("%(asctime)s %(levelname)s %(message)s"))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if debug else logging.INFO)


# -----------------------------------------------------------------------------
# Autopatch: inject CSP nonce attr into <script> and <style> tags (templates)
# -----------------------------------------------------------------------------
_SCRIPT_TAG = re.compile(
    r"<script\b(?![^>]*\bnonce=)(?![^>]*\{\{[^}]*nonce_attr\(\)[^}]*\}\})([^>]*)>",
    re.IGNORECASE,
)
_STYLE_TAG = re.compile(
    r"<style\b(?![^>]*\bnonce=)(?![^>]*\{\{[^}]*nonce_attr\(\)[^}]*\}\})([^>]*)>",
    re.IGNORECASE,
)

SKIP_DIR_NAMES = {"node_modules", ".git", ".venv", "venv", "__pycache__", ".pytest_cache"}


def autopatch(scan_dirs: Iterable[Path] | None = None, dry_run: bool = False) -> int:
    print("\033[1;36m🔧 FutureFunded Preflight Autopatcher...\033[0m")

    dirs = [Path(p) for p in (scan_dirs or [Path("templates"), Path("app/templates")]) if Path(p).exists()]
    if not dirs:
        print("  ⚠️  No template dirs found to patch.")
        return 0

    def should_skip(path: Path) -> bool:
        return any(part in SKIP_DIR_NAMES for part in path.parts)

    def inject(html: str) -> str:
        html2 = _SCRIPT_TAG.sub(r"<script {{ nonce_attr()|safe }}\1>", html)
        html3 = _STYLE_TAG.sub(r"<style {{ nonce_attr()|safe }}\1>", html2)
        return html3

    changed_files = 0
    for base in dirs:
        for f in base.rglob("*.html"):
            if should_skip(f):
                continue
            try:
                raw = f.read_text(encoding="utf-8")
                patched = inject(raw)
                if patched != raw:
                    changed_files += 1
                    if dry_run:
                        print(f"  🧪 Would patch → {f}")
                    else:
                        f.write_text(patched, encoding="utf-8")
                        print(f"  ✅ Patched → {f}")
            except Exception as e:
                print(f"  ⚠️  Skip {f}: {e}")

    print(f"\033[1;32m✨ Autopatch complete (templates/ + static/). Files changed: {changed_files}\033[0m")
    return changed_files


# -----------------------------------------------------------------------------
# Watch files (dev reload)
# -----------------------------------------------------------------------------
_DEFAULT_WATCH_DIRS = (Path("templates"), Path("static"), Path("app/templates"), Path("app/static"))
_WATCH_EXTS = {".py", ".html", ".jinja", ".jinja2", ".css", ".js", ".mjs", ".json", ".svg"}


def collect_watch_files(dirs: Iterable[Path]) -> list[str]:
    files: list[str] = []
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*"):
            if not p.is_file():
                continue
            if any(part in SKIP_DIR_NAMES for part in p.parts):
                continue
            if p.suffix.lower() in _WATCH_EXTS:
                files.append(str(p))

    for p in Path(".").glob(".env*"):
        if p.is_file():
            files.append(str(p))

    seen: set[str] = set()
    out: list[str] = []
    for f in files:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out


# -----------------------------------------------------------------------------
# Turnkey version detection + overlay
# -----------------------------------------------------------------------------
def _detect_turnkey_version_from_json() -> Optional[str]:
    """
    Best-effort: read flagship.version from a Turnkey config JSON file.
    Common paths in this repo:
      - data/turnkey.json
      - app/data/turnkey.json
    """
    candidates = [
        Path("data/turnkey.json"),
        Path("app/data/turnkey.json"),
        Path("turnkey.json"),
    ]
    for p in candidates:
        try:
            if not p.exists() or not p.is_file():
                continue
            obj = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(obj, dict):
                flagship = obj.get("flagship")
                if isinstance(flagship, dict):
                    v = flagship.get("version")
                    if isinstance(v, str) and v.strip():
                        return v.strip()
        except Exception:
            continue
    return None


def resolve_turnkey_version(env_name: str) -> str:
    """
    Canonical version used for Turnkey responses and headers.

    Priority:
      1) FF_TURNKEY_VERSION / TURNKEY_VERSION env
      2) flagship.version inside data/turnkey.json
      3) sensible default by env
    """
    v = (os.getenv("FF_TURNKEY_VERSION") or os.getenv("TURNKEY_VERSION") or "").strip()
    if v:
        return v
    v2 = _detect_turnkey_version_from_json()
    if v2:
        return v2
    # default fallback
    return "15.0.0" if _normalize_env_name(env_name) == "production" else "15.0.0-dev"


def install_turnkey_version_overlay(flask_app, version: str) -> None:
    """
    Forces /api/turnkey/config to return flagship.version=<version>
    and emits X-FutureFunded-Turnkey-Version on every response.

    Safe under Cloudflare/Tunnel and avoids Content-Length mismatches.
    """
    from flask import request

    if not version or not str(version).strip():
        return

    version = str(version).strip()
    flask_app.config["FF_TURNKEY_VERSION"] = version
    flask_app.config["TURNKEY_VERSION"] = version

    @flask_app.after_request
    def _turnkey_version_overlay(resp):
        # Always stamp the header (useful for debugging + client introspection)
        resp.headers["X-FutureFunded-Turnkey-Version"] = version

        # If you ever fetch this from a different origin, let JS read it:
        # (You currently expose X-Request-ID; add this too.)
        try:
            expose = resp.headers.get("Access-Control-Expose-Headers", "")
            expose_set = {h.strip() for h in expose.split(",") if h.strip()}
            expose_set.add("X-Request-ID")
            expose_set.add("X-FutureFunded-Turnkey-Version")
            resp.headers["Access-Control-Expose-Headers"] = ", ".join(sorted(expose_set))
        except Exception:
            pass

        # Only mutate the turnkey config endpoint body
        if request.path != "/api/turnkey/config":
            return resp
        if resp.status_code != 200:
            return resp

        # Prefer Flask’s JSON helpers
        try:
            obj = resp.get_json(silent=True)
        except Exception:
            obj = None

        # Fallback: parse manually if needed
        if obj is None:
            try:
                raw = resp.get_data(as_text=True)
                obj = json.loads(raw)
            except Exception:
                return resp

        if not isinstance(obj, dict):
            return resp

        flagship = obj.get("flagship")
        if not isinstance(flagship, dict):
            flagship = {}

        # Put version first for visibility
        obj["flagship"] = {"version": version, **flagship}

        try:
            new_raw = json.dumps(obj, ensure_ascii=False)
            resp.set_data(new_raw)
            # Do NOT force a Content-Length; let the server handle it safely
            resp.headers.pop("Content-Length", None)
            resp.mimetype = "application/json"
        except Exception:
            return resp

        return resp



# -----------------------------------------------------------------------------
# CLI model
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class RunnerConfig:
    host: str
    port: int
    debug: bool
    use_reloader: bool
    open_browser: bool
    log_style: str
    pidfile: Optional[Path]
    routes_out: Optional[Path]
    force_run: bool
    async_mode: str
    env: str
    config_path: str
    do_autopatch: bool
    autopatch_dry_run: bool
    autopatch_dirs: tuple[Path, ...]
    watch_dirs: tuple[Path, ...]
    trust_proxy: bool
    public_base_url: Optional[str]
    turnkey_version: str
    
    # -----------------------------------------------------------------------------
# CLI parsing helpers
# -----------------------------------------------------------------------------
_TRUTHY = {"1", "true", "yes", "y", "on"}
_FALSY  = {"0", "false", "no", "n", "off"}

def _sanitize_bool_equals(argv: list[str]) -> list[str]:
    """
    Converts:
      --debug=false      -> --no-debug
      --debug=true       -> --debug
      --trust-proxy=0    -> --no-trust-proxy
      --trust-proxy=1    -> --trust-proxy
    so systemd-style flags won't crash argparse.
    """
    out: list[str] = []
    for a in argv:
        if a.startswith("--debug="):
            v = a.split("=", 1)[1].strip().lower()
            out.append("--debug" if v in _TRUTHY else "--no-debug" if v in _FALSY else a)
            continue
        if a.startswith("--trust-proxy="):
            v = a.split("=", 1)[1].strip().lower()
            out.append("--trust-proxy" if v in _TRUTHY else "--no-trust-proxy" if v in _FALSY else a)
            continue
        out.append(a)
    return out


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run the FutureFunded Flask app.")
    ...
    return p.parse_args(_sanitize_bool_equals(sys.argv[1:]))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run the FutureFunded Flask app.")
    p.add_argument("--host", default=os.getenv("HOST", "0.0.0.0"))
    p.add_argument("--port", type=int, default=int(os.getenv("PORT", "5000")))
    p.add_argument("--log-style", choices=["color", "json", "plain"], default=os.getenv("LOG_STYLE", "color"))
    p.add_argument("--open-browser", action="store_true")
    p.add_argument("--pidfile", type=Path)
    p.add_argument("--routes-out", type=Path)
    p.add_argument("--force", dest="force_run", action="store_true")

    p.add_argument("--env", choices=["development", "testing", "production"], help="Runtime environment")
    p.add_argument("--config", help="Explicit dotted config path or alias (dev/prod/test)")

    p.add_argument("--autopatch", action="store_true")
    p.add_argument("--autopatch-dry-run", action="store_true")
    p.add_argument("--autopatch-dirs", nargs="*", default=None)

    p.add_argument("--watch-dirs", nargs="*", default=None, help="Extra directories to watch for reload (templates/static)")

    # Debug/reload
    try:
        BoolOpt = argparse.BooleanOptionalAction
        p.add_argument("--debug", action=BoolOpt, default=None, help="Force debug on/off (default: on in dev/test).")
        p.add_argument("--trust-proxy", action=BoolOpt, default=None, help="Trust X-Forwarded-* headers (recommended for CF Tunnel).")
    except Exception:
        p.add_argument("--debug", action="store_true", default=None)
        p.add_argument("--trust-proxy", action="store_true", default=None)

    p.add_argument("--no-reload", action="store_true", help="Disable Werkzeug reloader (default: enabled in dev/test).")

    p.add_argument(
        "--async-mode",
        default=os.getenv("SOCKETIO_ASYNC_MODE", "threading"),
        choices=["threading", "eventlet", "gevent", "gevent_uwsgi"],
    )

    # Helps pin canonical/return URLs; app/templates can read env var(s).
    p.add_argument("--public-base-url", default=None, help="Public base URL (e.g. https://getfuturefunded.com).")

    # Turnkey version override (optional)
    p.add_argument("--turnkey-version", default=None, help="Override Turnkey flagship.version served by /api/turnkey/config.")
    return p.parse_args(_sanitize_bool_equals(sys.argv[1:]))


def _normalize_base_url(u: str) -> str:
    uu = (u or "").strip()
    if not uu:
        return ""
    uu = uu.rstrip("/")
    return uu


def _default_trust_proxy(env: str) -> bool:
    """
    Safe default:
      - ON in production, because you are behind Cloudflare edge (Tunnel)
      - Also ON if CF_TUNNEL=1 (explicit signal)
    """
    env = _normalize_env_name(env)
    cf_tunnel = (os.getenv("CF_TUNNEL") or os.getenv("CLOUDFLARE_TUNNEL") or "").strip().lower()
    if cf_tunnel in {"1", "true", "yes", "on"}:
        return True
    return env == "production"


def make_runner_config() -> RunnerConfig:
    a = parse_args()

    env = _normalize_env_name(a.env or os.getenv("ENV") or os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "development")

    # Standardize env names everywhere
    os.environ["ENV"] = env
    os.environ["APP_ENV"] = env
    os.environ["FLASK_ENV"] = env

    cfg_path = normalize_config_path(a.config or os.getenv("FLASK_CONFIG"), env_hint=env)

    # DEBUG precedence
    debug_env = _env_bool("FLASK_DEBUG")
    if a.debug is not None:
        debug = bool(a.debug)
    elif debug_env is not None:
        debug = bool(debug_env)
    else:
        debug = env in {"development", "testing"}

    # Force mode should not run the reloader (prevents double banners/route spam + occasional kills)
    use_reloader = bool((env in {"development", "testing"}) and debug and not a.no_reload and not a.force_run)

    async_mode = str(a.async_mode)
    # Werkzeug reloader + eventlet/gevent combos are often painful; keep it sane for dev.
    if use_reloader and env != "production" and async_mode != "threading":
        async_mode = "threading"

    ap_dirs = tuple(Path(d) for d in (a.autopatch_dirs or ["templates", "app/templates"]))
    watch_dirs = tuple(Path(d) for d in (a.watch_dirs or _DEFAULT_WATCH_DIRS))

    os.environ["FLASK_DEBUG"] = "1" if debug else "0"

    # Trust proxy: CLI > env TRUST_PROXY > smart default
    trust_env = _env_bool("TRUST_PROXY")
    if a.trust_proxy is not None:
        trust_proxy = bool(a.trust_proxy)
    elif trust_env is not None:
        trust_proxy = bool(trust_env)
    else:
        trust_proxy = _default_trust_proxy(env)

    # Public base URL: CLI > env (FF_PUBLIC_BASE_URL/PUBLIC_BASE_URL) > prod default > None
    base_env = (os.getenv("FF_PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "").strip()
    public_base = _normalize_base_url(a.public_base_url or base_env)

    if env == "production" and not public_base:
        # enterprise-safe default domain if you forgot to export it
        public_base = _normalize_base_url(os.getenv("FF_DEFAULT_PUBLIC_BASE_URL", "https://getfuturefunded.com"))

    # Turnkey version overlay resolution
    tv = (a.turnkey_version or "").strip() or resolve_turnkey_version(env)

    return RunnerConfig(
        host=str(a.host),
        port=int(a.port),
        debug=debug,
        use_reloader=use_reloader,
        open_browser=bool(a.open_browser),
        log_style=str(a.log_style),
        pidfile=a.pidfile,
        routes_out=a.routes_out,
        force_run=bool(a.force_run),
        async_mode=async_mode,
        env=env,
        config_path=cfg_path,
        do_autopatch=bool(a.autopatch or os.getenv("FC_AUTOPATCH", "0").lower() in {"1", "true", "yes", "on"}),
        autopatch_dry_run=bool(a.autopatch_dry_run),
        autopatch_dirs=ap_dirs,
        watch_dirs=watch_dirs,
        trust_proxy=trust_proxy,
        public_base_url=public_base or None,
        turnkey_version=tv,
    )


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _ssl_ctx_from_env() -> Optional[Tuple[str, str]]:
    cert, key = os.getenv("SSL_CERTFILE"), os.getenv("SSL_KEYFILE")
    return (cert, key) if cert and key else None


def _port_in_use(host: str, port: int) -> bool:
    probe_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.35)
            return s.connect_ex((probe_host, port)) == 0
    except Exception:
        return False


def _write_pidfile(pidfile: Path) -> None:
    try:
        pidfile.write_text(str(os.getpid()), encoding="utf-8")
    except Exception as e:
        logging.warning("Writing pidfile failed: %s", e)

    def cleanup():
        try:
            if pidfile.exists():
                pidfile.unlink()
        except Exception:
            pass

    atexit.register(cleanup)


def _open_browser_later(url: str) -> None:
    threading.Timer(0.6, lambda: webbrowser.open_new_tab(url)).start()


def _install_signal_handlers() -> None:
    def _exit(_signum=None, _frame=None):
        raise SystemExit(0)

    for sig in ("SIGINT", "SIGTERM"):
        if hasattr(signal, sig):
            signal.signal(getattr(signal, sig), _exit)


def banner(cfg: RunnerConfig) -> None:
    print(
        "\n\033[1;34m╭────────────────────────────────────────────────────────────╮\n"
        "│           🚀  FutureFunded Flask SaaS Launcher  ✨            │\n"
        "╰────────────────────────────────────────────────────────────╯\033[0m"
    )
    print(f"\033[1;33m✨ {datetime.now():%Y-%m-%d %H:%M:%S}: Bootstrapping FutureFunded...\033[0m")
    print(f"🔎 ENV:        {cfg.env}")
    print(f"⚙️  CONFIG:     {cfg.config_path}")
    print(f"🐞 DEBUG:      {cfg.debug}")
    print(f"♻️  RELOAD:     {cfg.use_reloader}")
    print(f"🛡️  PROXYFIX:   {cfg.trust_proxy}")
    print(f"🏷️  TURNKEY:    {cfg.turnkey_version}")
    if cfg.public_base_url:
        print(f"🌐 PUBLIC URL: {cfg.public_base_url}")
    print(f"🌎 Host:Port:  {cfg.host}:{cfg.port}")
    print(f"🐍 Python:     {sys.version.split()[0]}")
    print(f"🧵 SocketIO:   {cfg.async_mode}")
    if cfg.host in {"0.0.0.0", "127.0.0.1", "localhost"}:
        print(f"💻 Local:      http://127.0.0.1:{cfg.port}")


def print_routes(app, debug: bool, out_path: Optional[Path]) -> None:
    rows = []
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: str(r)):
        rows.append(
            {
                "rule": str(rule),
                "endpoint": rule.endpoint,
                "methods": sorted((rule.methods or set()) - {"HEAD", "OPTIONS"}),
            }
        )

    if out_path:
        try:
            out_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
            print(f"\n📝 Routes written to: {out_path}")
        except Exception as e:
            logging.warning("Failed to write routes file: %s", e)

    if debug:
        print("\n🔗 Routes:")
        for r in rows:
            print(f"  {r['rule']} → {r['endpoint']} ({','.join(r['methods'])})")


def init_sentry_if_configured() -> None:
    dsn = os.getenv("SENTRY_DSN")
    if not (dsn and sentry_sdk and FlaskIntegration):
        return
    try:
        sentry_sdk.init(dsn=dsn, integrations=[FlaskIntegration()])
        logging.info("Sentry initialized")
    except Exception as e:
        logging.warning("Sentry init failed: %s", e)


def install_dev_no_cache(flask_app) -> None:
    """
    Fix: browser refresh still showing old CSS/JS/HTML due to caching.
    Only applied in debug.
    """
    try:
        flask_app.config["TEMPLATES_AUTO_RELOAD"] = True
        flask_app.jinja_env.auto_reload = True
        flask_app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    except Exception:
        pass

    @flask_app.after_request
    def _no_cache(resp):
        ct = (resp.headers.get("Content-Type") or "").lower()
        if (
            "text/html" in ct
            or "text/css" in ct
            or "javascript" in ct
            or "application/json" in ct
            or "image/svg+xml" in ct
        ):
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
        return resp


def apply_proxyfix_if_enabled(flask_app, trust_proxy: bool) -> None:
    """
    Trust Cloudflare/edge forwarding headers so Flask sees https host/scheme.
    For Tunnel deployments, this is typically required to stop leaking http:// URLs.
    """
    if not trust_proxy:
        return
    if not ProxyFix:
        logging.warning("TRUST_PROXY enabled but werkzeug ProxyFix is unavailable.")
        return
    flask_app.wsgi_app = ProxyFix(
        flask_app.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
        x_port=1,
        x_prefix=1,
    )
    try:
        flask_app.config["PREFERRED_URL_SCHEME"] = "https"
    except Exception:
        pass
    logging.info("ProxyFix enabled (trusting X-Forwarded-* headers).")


def preflight_prod_warnings(cfg: RunnerConfig) -> None:
    if cfg.env != "production":
        return

    # Warnings (not exits) to keep ops flexible.
    if cfg.debug or cfg.use_reloader:
        logging.warning("Production is running with debug/reloader enabled. Recommended: --debug=false --no-reload")

    sk = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    pk = (os.getenv("STRIPE_PUBLISHABLE_KEY") or os.getenv("STRIPE_PUBLISHABLE") or "").strip()

    if sk.startswith("sk_test_") or pk.startswith("pk_test_"):
        logging.warning(
            "Stripe keys look like TEST keys in production. sk=%s pk=%s",
            (sk[:10] + "...") if sk else "",
            (pk[:10] + "...") if pk else "",
        )

    base = cfg.public_base_url or (os.getenv("FF_PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "").strip()
    if base.startswith("http://"):
        logging.warning("PUBLIC_BASE_URL is http:// in production. Set https://... to avoid insecure share/return URLs.")

    if not cfg.trust_proxy:
        logging.warning("TRUST_PROXY is off in production. Behind Cloudflare Tunnel you likely want TRUST_PROXY=1.")

    # Security sanity warnings
    secret = (os.getenv("SECRET_KEY") or "").strip()
    if not secret or secret.lower().startswith("change-me"):
        logging.warning("SECRET_KEY is missing/placeholder in production. Set a strong SECRET_KEY in .env.production")
    pin = (os.getenv("TURNKEY_ADMIN_PIN") or "").strip()
    if not pin or pin.lower().startswith("change-me"):
        logging.warning("TURNKEY_ADMIN_PIN is missing/placeholder in production. Set TURNKEY_ADMIN_PIN in .env.production")


# -----------------------------------------------------------------------------
# Flask app builder (for gunicorn/flask CLI parity)
# -----------------------------------------------------------------------------
# -----------------------------------------------------------------------------
# dotenv (optional) — precedence-safe loader
# -----------------------------------------------------------------------------
try:
    from dotenv import dotenv_values  # type: ignore
except Exception:  # pragma: no cover
    dotenv_values = None  # type: ignore


def _dotenv_candidates(env: str) -> list[Path]:
    """
    Precedence order (low -> high), later files override earlier dotenv values:
      1) .env
      2) .env.<env>
      3) .env.local   (only for dev/test)
    """
    env = _normalize_env_name(env)

    files: list[Path] = [Path(".env"), Path(f".env.{env}")]

    if env in {"development", "testing"}:
        files.append(Path(".env.local"))

    # de-dupe while preserving order
    out: list[Path] = []
    seen: set[str] = set()
    for p in files:
        k = str(p)
        if k not in seen:
            seen.add(k)
            out.append(p)
    return out


def load_env_stack(*, env: Optional[str] = None, override: bool = False) -> list[Path]:
    """
    Load dotenv files with correct precedence:
      - dotenv files can override earlier dotenv files
      - but dotenv files DO NOT override real OS env vars (the "original snapshot")
    """
    loaded: list[Path] = []
    if dotenv_values is None:
        return loaded

    # Snapshot BEFORE dotenv so OS env always wins (unless override=True)
    original = dict(os.environ) if not override else {}

    # DOTENV_PATH (single file) bypasses stack logic
    explicit = (os.getenv("DOTENV_PATH") or "").strip()
    if explicit:
        p = Path(explicit)
        if p.exists() and p.is_file():
            vals = dotenv_values(p) or {}
            for k, v in vals.items():
                if v is None:
                    continue
                if (not override) and (k in original):
                    continue
                os.environ[k] = str(v)
            loaded.append(p)
        return loaded

    env_eff = _normalize_env_name(
        env or os.getenv("ENV") or os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "development"
    )

    for p in _dotenv_candidates(env_eff):
        if not p.exists() or not p.is_file():
            continue
        vals = dotenv_values(p) or {}
        # apply with precedence: override earlier dotenv, but not original OS env
        for k, v in vals.items():
            if v is None:
                continue
            if (not override) and (k in original):
                continue
            os.environ[k] = str(v)
        loaded.append(p)

    return loaded

# -----------------------------------------------------------------------------
# Main entry
# -----------------------------------------------------------------------------
def main() -> None:
    load_env_stack(override=False)

    cfg = make_runner_config()
    load_env_stack(env=cfg.env, override=False)

    # Standardize env names everywhere
    os.environ["ENV"] = cfg.env
    os.environ["APP_ENV"] = cfg.env
    os.environ["FLASK_ENV"] = cfg.env
    os.environ["SOCKETIO_ASYNC_MODE"] = cfg.async_mode

    # Make public base URL available to app/templates if they read env
    if cfg.public_base_url:
        os.environ["FF_PUBLIC_BASE_URL"] = cfg.public_base_url
        os.environ["PUBLIC_BASE_URL"] = cfg.public_base_url

    # Also expose canonical turnkey version
    os.environ["FF_TURNKEY_VERSION"] = cfg.turnkey_version
    os.environ["TURNKEY_VERSION"] = cfg.turnkey_version

    setup_logging(cfg.debug, cfg.log_style)
    _install_signal_handlers()

    if cfg.do_autopatch:
        autopatch(scan_dirs=cfg.autopatch_dirs, dry_run=cfg.autopatch_dry_run)

    init_sentry_if_configured()

    if cfg.pidfile:
        _write_pidfile(cfg.pidfile)

    if not cfg.force_run and _port_in_use(cfg.host, cfg.port):
        logging.error("Port %s already in use (host=%s). Stop the other process or use --force.", cfg.port, cfg.host)
        raise SystemExit(2)

    # Only print banner/routes once when using the reloader
    is_reloader_main = (not cfg.use_reloader) or (os.environ.get("WERKZEUG_RUN_MAIN") == "true")
    if is_reloader_main:
        banner(cfg)
    preflight_prod_warnings(cfg)

    try:
        from app import create_app

        flask_app = create_app(cfg.config_path)

        # Install overlay so /api/turnkey/config always returns canonical flagship.version
        install_turnkey_version_overlay(flask_app, cfg.turnkey_version)

        if cfg.debug:
            install_dev_no_cache(flask_app)

        apply_proxyfix_if_enabled(flask_app, cfg.trust_proxy)

        # If you're pinning public base URL, strongly prefer https scheme for URL generation
        if cfg.public_base_url and cfg.public_base_url.startswith("https://"):
            try:
                flask_app.config["PREFERRED_URL_SCHEME"] = "https"
            except Exception:
                pass

        if cfg.open_browser and is_reloader_main:
            ssl_ctx = _ssl_ctx_from_env()
            if ssl_ctx or (cfg.public_base_url and cfg.public_base_url.startswith("https://")):
                _open_browser_later(f"https://127.0.0.1:{cfg.port}")
            else:
                _open_browser_later(f"http://127.0.0.1:{cfg.port}")

        if is_reloader_main:
            print_routes(flask_app, cfg.debug, cfg.routes_out)

        # Optional Flask-SocketIO
        try:
            from app.extensions import socketio as _socketio  # type: ignore
        except Exception:
            _socketio = None

        ssl_ctx = _ssl_ctx_from_env()
        extra_files = collect_watch_files(cfg.watch_dirs) if cfg.use_reloader else None

        run_kwargs = dict(
            host=cfg.host,
            port=cfg.port,
            debug=cfg.debug,
            use_reloader=cfg.use_reloader,
            ssl_context=ssl_ctx,
        )
        if extra_files:
            run_kwargs["extra_files"] = extra_files

        if _socketio and hasattr(_socketio, "run"):
            logging.info("Socket.IO async mode: %s", getattr(_socketio, "async_mode", cfg.async_mode))
            _socketio.run(flask_app, allow_unsafe_werkzeug=cfg.debug, **run_kwargs)
        else:
            logging.info("Socket.IO not available; falling back to Flask.run()")
            flask_app.run(**run_kwargs)

    except SystemExit:
        raise
    except Exception as exc:
        logging.error("❌ Failed to launch FutureFunded app: %s", exc, exc_info=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()


