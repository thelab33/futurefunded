#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
FutureFunded Flagship Launcher — ROBUST
(env-safe • deterministic reload • turnkey overlay • secrets-safe • routes export)

Canonical:
  ./run.py --env development --open-browser
  ./run.py --env development --no-reload
  TRUST_PROXY=1 PUBLIC_BASE_URL=https://getfuturefunded.com ./run.py --env production --no-reload --debug=false --force
  gunicorn "run:app"

Guarantees:
- OS env always wins over dotenv (dotenv fills missing keys only)
- CLI env/config exported BEFORE importing app package
- Adds diag headers: X-FutureFunded-Env / X-FutureFunded-Config / X-FutureFunded-Turnkey-Version
- Optional CSP nonce autopatch for templates
- Never logs secrets (Stripe keys/webhook secret redacted)
- Can write routes to a file: --routes-out /tmp/routes.txt
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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, FrozenSet, Iterable, Optional, Tuple

# -----------------------------------------------------------------------------
# Optional deps
# -----------------------------------------------------------------------------
try:
    from dotenv import dotenv_values  # type: ignore
except Exception:  # pragma: no cover
    dotenv_values = None  # type: ignore

# -----------------------------------------------------------------------------
# Env utils
# -----------------------------------------------------------------------------
_TRUTHY = {"1", "true", "yes", "y", "on"}
_FALSY = {"0", "false", "no", "n", "off"}

_OS_ENV_KEYS: FrozenSet[str] = frozenset(os.environ.keys())

SENSITIVE_KEYS = {
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SECRET_KEY",
    "DATABASE_URL",
    "SQLALCHEMY_DATABASE_URI",
    "MAIL_PASSWORD",
    "TWILIO_AUTH_TOKEN",
    "SENTRY_DSN",
}

SKIP_DIR_NAMES = {"node_modules", ".git", ".venv", "venv", "__pycache__", ".pytest_cache"}
_DEFAULT_WATCH_DIRS = (Path("templates"), Path("static"), Path("app/templates"), Path("app/static"))
_WATCH_EXTS = {".py", ".html", ".jinja", ".jinja2", ".css", ".js", ".mjs", ".json", ".svg"}


def _redact(name: str, value: str) -> str:
    if not value:
        return ""
    if name in SENSITIVE_KEYS:
        v = value.strip()
        if len(v) <= 10:
            return "***"
        return v[:8] + "…" + v[-4:]
    return value


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


def _normalize_env_name(v: str) -> str:
    r = (v or "").strip().lower()
    if r in {"dev", "development", "local", "stage", "staging"}:
        return "development"
    if r in {"test", "testing"}:
        return "testing"
    if r in {"prod", "production", "live"}:
        return "production"
    return r or "development"


def detect_env() -> str:
    raw = (os.getenv("APP_ENV") or os.getenv("ENV") or os.getenv("FLASK_ENV") or "").strip().lower()
    cfg = (os.getenv("FLASK_CONFIG") or "").strip().lower()

    if "productionconfig" in cfg:
        raw = "production"
    elif "testingconfig" in cfg:
        raw = "testing"
    elif "developmentconfig" in cfg and not raw:
        raw = "development"

    return _normalize_env_name(raw or "development")


def normalize_config_path(value: Optional[str], *, env_hint: Optional[str] = None) -> str:
    if value and str(value).strip():
        v = value.strip()
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

    env = _normalize_env_name(env_hint or detect_env())
    return {
        "development": "app.config.DevelopmentConfig",
        "testing": "app.config.TestingConfig",
        "production": "app.config.ProductionConfig",
    }.get(env, "app.config.DevelopmentConfig")


def _normalize_base_url(u: str) -> str:
    return (u or "").strip().rstrip("/")


def _is_https(url: str) -> bool:
    return (url or "").strip().lower().startswith("https://")


# -----------------------------------------------------------------------------
# Dotenv (precedence-safe)
# -----------------------------------------------------------------------------
def _dotenv_candidates(env: str, *, include_base: bool = True) -> list[Path]:
    env = _normalize_env_name(env)
    files: list[Path] = []
    if include_base:
        files.append(Path(".env"))
    files.append(Path(f".env.{env}"))
    if env in {"development", "testing"}:
        files.append(Path(".env.local"))
    return files


def _apply_dotenv_file(p: Path) -> bool:
    if dotenv_values is None:
        return False
    if not p.exists() or not p.is_file():
        return False

    vals = dotenv_values(p) or {}
    wrote = False
    for k, v in vals.items():
        if v is None:
            continue
        if k in _OS_ENV_KEYS:
            continue
        os.environ[k] = str(v)
        wrote = True
    return wrote


def load_env_stack(*, env: Optional[str] = None, include_base: bool = True) -> list[Path]:
    loaded: list[Path] = []
    if dotenv_values is None:
        return loaded

    explicit = (os.getenv("DOTENV_PATH") or "").strip()
    if explicit:
        p = Path(explicit)
        if _apply_dotenv_file(p):
            loaded.append(p)
        return loaded

    env_eff = _normalize_env_name(env or detect_env())
    for p in _dotenv_candidates(env_eff, include_base=include_base):
        if _apply_dotenv_file(p):
            loaded.append(p)
    return loaded


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
        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        obj = {"ts": ts, "level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        if record.exc_info:
            obj["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(obj)


def setup_logging(debug: bool, style: str) -> None:
    style = (os.getenv("LOG_STYLE") or style).strip().lower()
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
# Autopatch: inject CSP nonce into <script>/<style> tags (templates)
# -----------------------------------------------------------------------------
_SCRIPT_TAG = re.compile(
    r"<script\b(?![^>]*\bnonce=)(?![^>]*\{\{[^}]*nonce_attr\(\)[^}]*\}\})([^>]*)>",
    re.IGNORECASE,
)
_STYLE_TAG = re.compile(
    r"<style\b(?![^>]*\bnonce=)(?![^>]*\{\{[^}]*nonce_attr\(\)[^}]*\}\})([^>]*)>",
    re.IGNORECASE,
)


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
        return _STYLE_TAG.sub(r"<style {{ nonce_attr()|safe }}\1>", html2)

    changed = 0
    for base in dirs:
        for f in base.rglob("*.html"):
            if should_skip(f):
                continue
            try:
                raw = f.read_text(encoding="utf-8")
                patched = inject(raw)
                if patched != raw:
                    changed += 1
                    if dry_run:
                        print(f"  🧪 Would patch → {f}")
                    else:
                        f.write_text(patched, encoding="utf-8")
                        print(f"  ✅ Patched → {f}")
            except Exception as e:
                print(f"  ⚠️  Skip {f}: {e}")

    print(f"\033[1;32m✨ Autopatch complete. Files changed: {changed}\033[0m")
    return changed


# -----------------------------------------------------------------------------
# Watch files (dev reload)
# -----------------------------------------------------------------------------
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
# Turnkey version overlay
# -----------------------------------------------------------------------------
def _detect_turnkey_version_from_json() -> Optional[str]:
    candidates = [Path("data/turnkey.json"), Path("app/data/turnkey.json"), Path("turnkey.json")]
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
    v = (os.getenv("FF_TURNKEY_VERSION") or os.getenv("TURNKEY_VERSION") or "").strip()
    if v:
        return v
    v2 = _detect_turnkey_version_from_json()
    if v2:
        return v2
    return "15.0.0" if _normalize_env_name(env_name) == "production" else "15.0.0-dev"


def install_turnkey_version_overlay(flask_app, version: str) -> None:
    from flask import request

    if flask_app.extensions.get("ff_turnkey_overlay_installed") is True:
        return
    flask_app.extensions["ff_turnkey_overlay_installed"] = True

    version = (version or "").strip()
    if not version:
        return

    flask_app.config["FF_TURNKEY_VERSION"] = version
    flask_app.config["TURNKEY_VERSION"] = version

    @flask_app.after_request
    def _turnkey_overlay(resp):
        resp.headers["X-FutureFunded-Turnkey-Version"] = version
        try:
            expose = resp.headers.get("Access-Control-Expose-Headers", "")
            expose_set = {h.strip() for h in expose.split(",") if h.strip()}
            expose_set.update({"X-Request-ID", "X-FutureFunded-Turnkey-Version", "X-FutureFunded-Env", "X-FutureFunded-Config"})
            resp.headers["Access-Control-Expose-Headers"] = ", ".join(sorted(expose_set))
        except Exception:
            pass

        if request.path != "/api/turnkey/config" or resp.status_code != 200:
            return resp

        obj = None
        try:
            obj = resp.get_json(silent=True)
        except Exception:
            obj = None

        if obj is None:
            try:
                obj = json.loads(resp.get_data(as_text=True))
            except Exception:
                return resp

        if not isinstance(obj, dict):
            return resp

        flagship = obj.get("flagship")
        if not isinstance(flagship, dict):
            flagship = {}

        obj["flagship"] = {"version": version, **flagship}

        try:
            resp.set_data(json.dumps(obj, ensure_ascii=False))
            resp.headers.pop("Content-Length", None)
            resp.mimetype = "application/json"
        except Exception:
            pass
        return resp


# -----------------------------------------------------------------------------
# Runner config + CLI
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
    reloader_type: str  # "stat" or "watchdog"


def _sanitize_bool_equals(argv: list[str]) -> list[str]:
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
    p = argparse.ArgumentParser(description="Run the FutureFunded Flask app (Flagship runner).")
    p.add_argument("--host", default=os.getenv("HOST", "0.0.0.0"))
    p.add_argument("--port", type=int, default=int(os.getenv("PORT", "5000")))
    p.add_argument("--log-style", choices=["color", "json", "plain"], default=os.getenv("LOG_STYLE", "color"))
    p.add_argument("--open-browser", action="store_true")
    p.add_argument("--pidfile", type=Path)
    p.add_argument("--routes-out", type=Path)
    p.add_argument("--force", dest="force_run", action="store_true")

    p.add_argument("--env", choices=["development", "testing", "production"], help="Runtime environment")
    p.add_argument("--config", help="Explicit dotted config path or alias (dev/prod/test)")
    p.add_argument("--public-base-url", default=None, help="Public base URL (e.g. https://getfuturefunded.com).")
    p.add_argument("--turnkey-version", default=None, help="Override Turnkey flagship.version for /api/turnkey/config.")
    p.add_argument("--autopatch", action="store_true")
    p.add_argument("--autopatch-dry-run", action="store_true")
    p.add_argument("--autopatch-dirs", nargs="*", default=None)

    p.add_argument("--watch-dirs", nargs="*", default=None, help="Extra directories to watch for reload")
    p.add_argument("--no-reload", action="store_true", help="Disable Werkzeug reloader (default: enabled in dev/test).")
    p.add_argument("--reloader-type", choices=["stat", "watchdog"], default=os.getenv("FF_RELOADER_TYPE", "stat"))

    try:
        BoolOpt = argparse.BooleanOptionalAction
        p.add_argument("--debug", action=BoolOpt, default=None)
        p.add_argument("--trust-proxy", action=BoolOpt, default=None)
    except Exception:
        p.add_argument("--debug", action="store_true", default=None)
        p.add_argument("--trust-proxy", action="store_true", default=None)

    p.add_argument("--async-mode", default=os.getenv("SOCKETIO_ASYNC_MODE", "threading"), choices=["threading", "eventlet", "gevent", "gevent_uwsgi"])
    return p.parse_args(_sanitize_bool_equals(sys.argv[1:]))


def _default_trust_proxy(env: str) -> bool:
    env = _normalize_env_name(env)
    cf = (os.getenv("CF_TUNNEL") or os.getenv("CLOUDFLARE_TUNNEL") or "").strip().lower()
    if cf in _TRUTHY:
        return True
    return env == "production"


def _choose_public_base(env: str, cli_value: Optional[str]) -> Optional[str]:
    env = _normalize_env_name(env)
    base_env = (os.getenv("FF_PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "").strip()
    base = _normalize_base_url(cli_value or base_env)
    if env == "production":
        if not base:
            base = _normalize_base_url(os.getenv("FF_DEFAULT_PUBLIC_BASE_URL", "https://getfuturefunded.com"))
        if base and base.startswith("http://"):
            base = "https://" + base[len("http://") :]
    return base or None


def _stripe_key_mode(sk: str, pk: str) -> str:
    sk = (sk or "").strip()
    pk = (pk or "").strip()
    if sk.startswith("sk_live_") or pk.startswith("pk_live_"):
        return "live"
    if sk.startswith("sk_test_") or pk.startswith("pk_test_"):
        return "test"
    return "unknown"


def make_runner_config() -> RunnerConfig:
    a = parse_args()
    env = _normalize_env_name(a.env or detect_env())

    # Load dotenv AFTER env is known (OS env still wins)
    load_env_stack(env=env, include_base=True)

    # Canonical env exports (CLI env wins)
    os.environ["ENV"] = env
    os.environ["APP_ENV"] = env
    os.environ["FLASK_ENV"] = env

    cfg_path = normalize_config_path(a.config or os.getenv("FLASK_CONFIG"), env_hint=env)
    os.environ["FLASK_CONFIG"] = cfg_path

    debug_env = _env_bool("FLASK_DEBUG")
    if a.debug is not None:
        debug = bool(a.debug)
    elif debug_env is not None:
        debug = bool(debug_env)
    else:
        debug = env in {"development", "testing"}

    use_reloader = bool((env in {"development", "testing"}) and debug and (not a.no_reload) and (not a.force_run))

    async_mode = str(a.async_mode)
    if use_reloader and env != "production" and async_mode != "threading":
        async_mode = "threading"

    trust_env = _env_bool("TRUST_PROXY")
    if a.trust_proxy is not None:
        trust_proxy = bool(a.trust_proxy)
    elif trust_env is not None:
        trust_proxy = bool(trust_env)
    else:
        trust_proxy = _default_trust_proxy(env)

    public_base = _choose_public_base(env, a.public_base_url)
    if public_base:
        os.environ["FF_PUBLIC_BASE_URL"] = public_base
        os.environ["PUBLIC_BASE_URL"] = public_base

    tv = (a.turnkey_version or "").strip() or resolve_turnkey_version(env)
    os.environ["FF_TURNKEY_VERSION"] = tv
    os.environ["TURNKEY_VERSION"] = tv

    ap_dirs = tuple(Path(d) for d in (a.autopatch_dirs or ["templates", "app/templates"]))
    watch_dirs = tuple(Path(d) for d in (a.watch_dirs or _DEFAULT_WATCH_DIRS))

    os.environ["SOCKETIO_ASYNC_MODE"] = async_mode
    os.environ["FLASK_DEBUG"] = "1" if debug else "0"
    os.environ["TRUST_PROXY"] = "1" if trust_proxy else "0"

    reloader_type = str(a.reloader_type or "stat").strip().lower()
    if reloader_type not in {"stat", "watchdog"}:
        reloader_type = "stat"

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
        do_autopatch=bool(a.autopatch or (os.getenv("FC_AUTOPATCH", "0").strip().lower() in _TRUTHY)),
        autopatch_dry_run=bool(a.autopatch_dry_run),
        autopatch_dirs=ap_dirs,
        watch_dirs=watch_dirs,
        trust_proxy=trust_proxy,
        public_base_url=public_base,
        turnkey_version=tv,
        reloader_type=reloader_type,
    )


# -----------------------------------------------------------------------------
# Runtime helpers
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
    sk = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    pk = (os.getenv("STRIPE_PUBLISHABLE_KEY") or os.getenv("STRIPE_PUBLISHABLE") or "").strip()
    mode = _stripe_key_mode(sk, pk)

    print(
        "\n\033[1;34m╭────────────────────────────────────────────────────────────╮\n"
        "│           🚀  FutureFunded Flask SaaS Launcher  ✨            │\n"
        "╰────────────────────────────────────────────────────────────╯\033[0m"
    )
    print(f"\033[1;33m✨ {datetime.now():%Y-%m-%d %H:%M:%S}: Bootstrapping FutureFunded...\033[0m")
    print(f"🔎 ENV:          {cfg.env}")
    print(f"⚙️  FLASK_CONFIG: {cfg.config_path}")
    print(f"🐞 DEBUG:        {cfg.debug}")
    print(f"♻️  RELOAD:       {cfg.use_reloader} (type={cfg.reloader_type})")
    print(f"🛡️  TRUST_PROXY:  {cfg.trust_proxy}")
    print(f"🏷️  TURNKEY:      {cfg.turnkey_version}")
    print(f"💳 STRIPE:       {mode} (sk={_redact('STRIPE_SECRET_KEY', sk)} pk={_redact('STRIPE_PUBLISHABLE_KEY', pk)})")
    if cfg.public_base_url:
        print(f"🌐 PUBLIC URL:   {cfg.public_base_url}")
    print(f"🌎 Host:Port:    {cfg.host}:{cfg.port}")
    print(f"🐍 Python:       {sys.version.split()[0]}")
    print(f"🧵 SocketIO:     {cfg.async_mode}")
    print(f"💻 Local:        http://127.0.0.1:{cfg.port}")


def install_diag_headers(flask_app, *, env: str, config_path: str) -> None:
    if flask_app.extensions.get("ff_diag_headers_installed") is True:
        return
    flask_app.extensions["ff_diag_headers_installed"] = True

    env = (env or "").strip() or "unknown"
    config_path = (config_path or "").strip() or "unknown"

    @flask_app.after_request
    def _diag(resp):
        resp.headers["X-FutureFunded-Env"] = env
        resp.headers["X-FutureFunded-Config"] = config_path
        return resp


def install_dev_no_cache(flask_app) -> None:
    if flask_app.extensions.get("ff_dev_no_cache_installed") is True:
        return
    flask_app.extensions["ff_dev_no_cache_installed"] = True

    try:
        flask_app.config["TEMPLATES_AUTO_RELOAD"] = True
        flask_app.jinja_env.auto_reload = True
        flask_app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    except Exception:
        pass

    @flask_app.after_request
    def _no_cache(resp):
        ct = (resp.headers.get("Content-Type") or "").lower()
        if any(x in ct for x in ("text/html", "text/css", "javascript", "application/json", "image/svg+xml")):
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
        return resp


def write_routes(flask_app, out_path: Path) -> None:
    try:
        lines = []
        for rule in sorted(flask_app.url_map.iter_rules(), key=lambda r: (r.rule, r.endpoint)):
            methods = ",".join(sorted(m for m in (rule.methods or set()) if m not in {"HEAD", "OPTIONS"}))
            lines.append(f"{rule.rule:<40} {methods:<18} {rule.endpoint}")
        out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        logging.info("Routes written → %s", out_path)
    except Exception as e:
        logging.warning("Routes write failed: %s", e)


# -----------------------------------------------------------------------------
# App build
# -----------------------------------------------------------------------------
def build_app(cfg: RunnerConfig):
    os.environ["ENV"] = cfg.env
    os.environ["APP_ENV"] = cfg.env
    os.environ["FLASK_ENV"] = cfg.env
    os.environ["FLASK_CONFIG"] = cfg.config_path

    if cfg.public_base_url:
        os.environ["FF_PUBLIC_BASE_URL"] = cfg.public_base_url
        os.environ["PUBLIC_BASE_URL"] = cfg.public_base_url

    from app import create_app

    flask_app = create_app(cfg.config_path)

    install_diag_headers(flask_app, env=cfg.env, config_path=cfg.config_path)
    install_turnkey_version_overlay(flask_app, cfg.turnkey_version)

    if cfg.debug:
        install_dev_no_cache(flask_app)

    return flask_app


# -----------------------------------------------------------------------------
# Main entry
# -----------------------------------------------------------------------------
def main() -> None:
    cfg = make_runner_config()
    setup_logging(cfg.debug, cfg.log_style)
    _install_signal_handlers()

    if cfg.pidfile:
        _write_pidfile(cfg.pidfile)

    if not cfg.force_run and _port_in_use(cfg.host, cfg.port):
        logging.error("Port %s already in use (host=%s). Stop the other process or use --force.", cfg.port, cfg.host)
        raise SystemExit(2)

    banner(cfg)

    if cfg.do_autopatch:
        autopatch(scan_dirs=cfg.autopatch_dirs, dry_run=cfg.autopatch_dry_run)

    flask_app = build_app(cfg)

    if cfg.routes_out:
        write_routes(flask_app, cfg.routes_out)

    if cfg.open_browser:
        ssl_ctx = _ssl_ctx_from_env()
        if ssl_ctx or (cfg.public_base_url and cfg.public_base_url.startswith("https://")):
            _open_browser_later(f"https://127.0.0.1:{cfg.port}")
        else:
            _open_browser_later(f"http://127.0.0.1:{cfg.port}")

    # SocketIO if present
    try:
        from app.extensions import socketio as _socketio  # type: ignore
    except Exception:
        _socketio = None

    ssl_ctx = _ssl_ctx_from_env()
    extra_files = collect_watch_files(cfg.watch_dirs) if cfg.use_reloader else None

    run_kwargs: Dict[str, Any] = {"host": cfg.host, "port": cfg.port, "debug": cfg.debug, "ssl_context": ssl_ctx}

    if cfg.use_reloader:
        run_kwargs["use_reloader"] = True
        run_kwargs["reloader_type"] = cfg.reloader_type
        if extra_files:
            run_kwargs["extra_files"] = extra_files

    if _socketio and hasattr(_socketio, "run"):
        logging.info("Socket.IO run (async_mode=%s)", getattr(_socketio, "async_mode", cfg.async_mode))
        _socketio.run(flask_app, allow_unsafe_werkzeug=cfg.debug, **run_kwargs)
    else:
        logging.info("Flask.run()")
        flask_app.run(**run_kwargs)


# -----------------------------------------------------------------------------
# Gunicorn export
# -----------------------------------------------------------------------------
app = None
if __name__ != "__main__":
    env = detect_env()
    load_env_stack(env=env, include_base=True)

    cfg = RunnerConfig(
        host=str(os.getenv("HOST", "0.0.0.0")),
        port=int(os.getenv("PORT", "5000")),
        debug=bool(_env_bool("FLASK_DEBUG") or (env in {"development", "testing"})),
        use_reloader=False,
        open_browser=False,
        log_style=str(os.getenv("LOG_STYLE", "plain")),
        pidfile=None,
        routes_out=None,
        force_run=False,
        async_mode=str(os.getenv("SOCKETIO_ASYNC_MODE", "threading")),
        env=env,
        config_path=normalize_config_path(os.getenv("FLASK_CONFIG"), env_hint=env),
        do_autopatch=False,
        autopatch_dry_run=False,
        autopatch_dirs=(Path("templates"), Path("app/templates")),
        watch_dirs=_DEFAULT_WATCH_DIRS,
        trust_proxy=bool(_env_bool("TRUST_PROXY") if _env_bool("TRUST_PROXY") is not None else (env == "production")),
        public_base_url=_choose_public_base(env, None),
        turnkey_version=resolve_turnkey_version(env),
        reloader_type="stat",
    )

    setup_logging(cfg.debug, cfg.log_style)
    app = build_app(cfg)

if __name__ == "__main__":
    main()
