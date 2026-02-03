import atexit
import logging
import os
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from email import encoders
from email.mime.base import MIMEBase
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Union

import stripe  # Stripe integration
from flask_mail import Mail, Message
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy

log = logging.getLogger(__name__)


# ── Optional deps (import-if-present) ─────────────────────────
def _try_import(module: str, attr: str) -> Any:
    try:
        mod = __import__(module, fromlist=[attr])
        return getattr(mod, attr)
    except Exception:
        return None


LoginManagerCls = _try_import("flask_login", "LoginManager")
BabelCls = _try_import("flask_babel", "Babel")
CSRFProtectCls = _try_import("flask_wtf.csrf", "CSRFProtect")
CORSCls = _try_import("flask_cors", "CORS")
SignalNSCls = _try_import("blinker", "Namespace")
JinjaEnvCls = _try_import("jinja2", "Environment")
FSLoaderCls = _try_import("jinja2", "FileSystemLoader")
AutoEscapeFn = _try_import("jinja2", "select_autoescape")


# ─────────────────────────────────────────────────────────────
# Core singletons
# ─────────────────────────────────────────────────────────────
db = SQLAlchemy()
migrate = Migrate()
mail = Mail()
socketio = SocketIO(async_mode=os.getenv("SOCKET_ASYNC_MODE", "threading"))

login_manager = LoginManagerCls() if LoginManagerCls else None
babel = BabelCls() if BabelCls else None
csrf = CSRFProtectCls() if CSRFProtectCls else None
cors = CORSCls() if CORSCls else None


# ─────────────────────────────────────────────────────────────
# Background tasks + clean shutdown
# ─────────────────────────────────────────────────────────────
_BG_MAX_WORKERS = int(os.getenv("BG_MAX_WORKERS", "8"))
_EXECUTOR = ThreadPoolExecutor(max_workers=_BG_MAX_WORKERS)


def run_bg(func: Callable[..., Any], *args: Any, **kwargs: Any) -> Future:
    return _EXECUTOR.submit(func, *args, **kwargs)


def run_later(delay_sec: float, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Future:
    def _wrapper():
        time.sleep(max(0.0, float(delay_sec or 0.0)))
        return func(*args, **kwargs)

    return run_bg(_wrapper)


@atexit.register
def _shutdown_executor() -> None:
    try:
        # cancel_futures only exists py3.9+, so be defensive
        try:
            _EXECUTOR.shutdown(wait=False, cancel_futures=True)  # type: ignore[call-arg]
        except TypeError:
            _EXECUTOR.shutdown(wait=False)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────
# Safe DB helpers
# ─────────────────────────────────────────────────────────────
def safe_commit() -> bool:
    try:
        db.session.commit()
        return True
    except Exception as e:
        log.error("DB commit failed: %s", e, exc_info=True)
        db.session.rollback()
        return False


def with_db_retry(retries: int = 2, backoff: float = 0.2):
    def _wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
        def _inner(*args: Any, **kwargs: Any):
            attempt = 0
            while True:
                try:
                    return fn(*args, **kwargs)
                except Exception:
                    db.session.rollback()
                    attempt += 1
                    if attempt > retries:
                        raise
                    time.sleep(float(backoff) * attempt)

        return _inner

    return _wrap


# ─────────────────────────────────────────────────────────────
# Email helper
# ─────────────────────────────────────────────────────────────
@dataclass
class EmailAttachment:
    filename: str
    content: bytes
    mimetype: str = "application/octet-stream"


def _attach(msg: Message, attachments: Optional[Iterable[EmailAttachment]]) -> None:
    if not attachments:
        return
    for a in attachments:
        maintype, _, subtype = (a.mimetype or "application/octet-stream").partition("/")
        part = MIMEBase(maintype or "application", subtype or "octet-stream")
        part.set_payload(a.content)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=a.filename)
        msg.attach(part)


def _render_template(env: Any, tpl: str, **ctx: Any) -> str:
    """
    tpl can be either:
      - a literal string (no env)
      - a template filename if env is provided
    """
    if env is None:
        return tpl.format(**ctx) if ctx else tpl
    return env.get_template(tpl).render(**ctx)


def get_mail_env(templates_dir: Optional[str] = None) -> Any:
    """
    Loads Jinja environment for email templates.
    Default path: app/templates/emails (relative to repo root).
    """
    if not JinjaEnvCls or not FSLoaderCls:
        return None

    if not templates_dir:
        # Most consistent with your repo: BASE_DIR/app/templates/emails
        # If running from package, cwd may differ — we normalize.
        templates_dir = str(Path(__file__).resolve().parent / "templates" / "emails")

    loader = FSLoaderCls(templates_dir)
    autoescape = AutoEscapeFn(["html", "xml"]) if AutoEscapeFn else None
    return JinjaEnvCls(loader=loader, autoescape=autoescape)


def send_email_async(
    app: Any,
    subject: str,
    recipients: List[str],
    *,
    html_template: Optional[str] = None,
    text_template: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    attachments: Optional[Iterable[EmailAttachment]] = None,
    sender: Optional[str] = None,
    max_retries: int = 2,
    retry_backoff: float = 0.5,
) -> Future:
    ctx = context or {}
    env = get_mail_env()

    def _job() -> bool:
        # Always run inside an app context
        with app.app_context():
            logger = getattr(app, "logger", log)

            try:
                html = _render_template(env, html_template, **ctx) if html_template else None
                body = _render_template(env, text_template, **ctx) if text_template else None

                msg = Message(
                    subject=subject,
                    recipients=recipients,
                    sender=sender or app.config.get("DEFAULT_MAIL_SENDER"),
                    html=html,
                    body=body,
                )
                _attach(msg, attachments)

                attempts = 0
                while True:
                    try:
                        mail.send(msg)
                        return True
                    except Exception as e:
                        attempts += 1
                        if attempts > max_retries:
                            raise
                        logger.warning(
                            "Mail send failed (attempt %s/%s): %s",
                            attempts,
                            max_retries,
                            e,
                        )
                        time.sleep(float(retry_backoff) * attempts)

            except Exception as e:
                logger.error("Email send permanently failed: %s", e, exc_info=True)
                return False

    return run_bg(_job)


# ─────────────────────────────────────────────────────────────
# Lightweight signals + safe socket emit
# ─────────────────────────────────────────────────────────────
if SignalNSCls:
    _signals = SignalNSCls()
    app_event = _signals.signal("app-event")
else:
    app_event = None  # type: ignore


def emit_socket(event: str, data: Optional[Dict[str, Any]] = None, room: Optional[str] = None) -> bool:
    try:
        socketio.emit(event, data or {}, to=room)
        return True
    except Exception as e:
        log.warning("socket emit failed: %s", e)
        return False


# ─────────────────────────────────────────────────────────────
# Stripe initialization
# ─────────────────────────────────────────────────────────────
def _guess_stripe_mode(api_key: Optional[str]) -> str:
    if not api_key:
        return "disabled"
    if api_key.startswith(("sk_live_", "rk_live_")):
        return "live"
    if api_key.startswith(("sk_test_", "rk_test_")):
        return "test"
    return "unknown"


def _resolve_stripe_secret(app: Any) -> str:
    """
    Supports both config keys + legacy env keys.
    Your app factory already normalizes these, but this keeps extensions robust
    if init_stripe is called independently.
    """
    return (
        app.config.get("STRIPE_API_KEY")
        or app.config.get("STRIPE_SECRET_KEY")
        or os.getenv("STRIPE_API_KEY")
        or os.getenv("STRIPE_SECRET_KEY")
        or os.getenv("FF_STRIPE_SECRET_KEY")
        or ""
    )


def init_stripe(app: Any) -> None:
    api_key = _resolve_stripe_secret(app)

    if not api_key:
        app.logger.warning("Stripe NOT initialized: missing STRIPE_API_KEY / STRIPE_SECRET_KEY")
        app.stripe = None  # type: ignore[attr-defined]
        return

    stripe.api_key = api_key
    app.stripe = stripe  # type: ignore[attr-defined]

    mode = _guess_stripe_mode(api_key)
    app.logger.info("✅ Stripe initialized (%s mode)", mode)


# ─────────────────────────────────────────────────────────────
# Init all extensions
# ─────────────────────────────────────────────────────────────
def init_all_extensions(app: Any, *, cors_origins: Any = "*", init_cors_here: bool = False) -> None:
    """
    Most consistent pattern for your platform:
      - create_app() does CORS itself (with per-route resources)
      - extensions init should NOT double-init CORS unless explicitly requested

    So:
      init_cors_here=False by default.
    """
    db.init_app(app)
    migrate.init_app(app, db)
    mail.init_app(app)

    init_stripe(app)

    if csrf:
        csrf.init_app(app)

    if init_cors_here and cors and cors_origins is not None:
        # Browser rule: cannot use credentials with wildcard origin
        supports_credentials = True
        if cors_origins == "*":
            supports_credentials = False

        cors.init_app(
            app,
            resources={r"/*": {"origins": cors_origins}},
            supports_credentials=supports_credentials,
        )

    if login_manager:
        login_manager.init_app(app)

    if babel:
        babel.init_app(app)

    socketio.init_app(app, cors_allowed_origins=cors_origins)


__all__ = [
    "db",
    "migrate",
    "mail",
    "socketio",
    "login_manager",
    "babel",
    "csrf",
    "cors",
    "run_bg",
    "run_later",
    "safe_commit",
    "with_db_retry",
    "EmailAttachment",
    "send_email_async",
    "emit_socket",
    "init_all_extensions",
    "init_stripe",
    "app_event",
]

