from __future__ import annotations

"""
FundChamps — SMS Bot (Twilio + OpenAI)
────────────────────────────────────────────────────────────────────────────
• /sms/webhook  → Twilio webhook (TwiML response)
• /sms/health   → Lightweight health/readiness JSON
• Schema/dep tolerant: works even if SmsLog table or openai client is absent
• Guards: CSRF-exempt (if flask-wtf installed), robust Twilio signature check,
  sender rate-limiting, duplicate suppression via MessageSid
"""

import base64
import hashlib
import hmac
import os
import re
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from flask import Blueprint, Response, abort, current_app, jsonify, request

from app.extensions import db

# Optional CSRF exemption (Twilio posts are third-party)
try:
    from app.extensions import csrf  # type: ignore
except Exception:  # pragma: no cover
    csrf = None  # type: ignore

# Optional model (schema tolerant)
try:
    from app.models import SmsLog  # type: ignore
except Exception:  # pragma: no cover
    SmsLog = None  # type: ignore


# ─────────────────────────────────────────────────────────────
# 📞 Blueprint setup
# (No url_prefix; your loader mounts this at /sms)
# ─────────────────────────────────────────────────────────────
sms_bp = Blueprint("sms", __name__)
if csrf:
    try:
        csrf.exempt(sms_bp)  # type: ignore
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────
# ⚙️ Configuration
# ─────────────────────────────────────────────────────────────
# Feature flags
SMS_AI_ENABLED = os.getenv("SMS_AI_ENABLED", "1").lower() in {"1", "true", "yes"}

# OpenAI
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_MAX_TOKENS = int(os.getenv("OPENAI_MAX_TOKENS", "120"))
OPENAI_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.6"))
OPENAI_TIMEOUT_SECS = float(os.getenv("OPENAI_TIMEOUT_SECS", "8"))
OPENAI_MAX_RETRIES = int(os.getenv("OPENAI_MAX_RETRIES", "2"))

# Twilio
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")  # if set + REQUIRE=1 → enforce
REQUIRE_TWILIO_SIGNATURE = os.getenv("REQUIRE_TWILIO_SIGNATURE", "0").lower() in {
    "1",
    "true",
    "yes",
}

# Message limits (keep SMS-friendly)
MAX_INBOUND_LEN = int(os.getenv("SMS_MAX_INBOUND_LEN", "800"))
MAX_OUTBOUND_LEN = int(os.getenv("SMS_MAX_OUTBOUND_LEN", "320"))

# URLs
SITE_URL = os.getenv("SITE_URL", "https://connectatxelite.com")
DONATE_URL = os.getenv("DONATE_URL", f"{SITE_URL}/donate")
SPONSOR_URL = os.getenv("SPONSOR_URL", f"{SITE_URL}#sponsorships")
TRYOUTS_URL = os.getenv("TRYOUTS_URL", f"{SITE_URL}/calendar")

# Prompt
SYSTEM_PROMPT = os.getenv(
    "SMS_SYSTEM_PROMPT",
    (
        "You are the friendly digital assistant for Connect ATX Elite youth basketball fundraising. "
        "Answer concisely, be kind, and when it helps, point people to sponsor or learn more. "
        "If someone asks how to help, suggest sponsoring, donating, or sharing the program with a friend."
    ),
)

# Rate limiting
RATE_LIMIT_WINDOW_SECS = int(os.getenv("SMS_RATE_WINDOW", "60"))
RATE_LIMIT_MAX_MSGS = int(os.getenv("SMS_RATE_MAX", "6"))
_rate_window: Dict[str, Deque[float]] = defaultdict(deque)


# ─────────────────────────────────────────────────────────────
# 🤖 OpenAI Client (new or legacy)
# ─────────────────────────────────────────────────────────────
_OPENAI_CLIENT = None
_OPENAI_LEGACY = False
try:
    from openai import OpenAI  # type: ignore

    _OPENAI_CLIENT = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
except Exception:
    try:
        import openai  # type: ignore

        openai.api_key = os.getenv("OPENAI_API_KEY")
        _OPENAI_LEGACY = True
        _OPENAI_CLIENT = openai
    except Exception:
        _OPENAI_CLIENT = None


# ─────────────────────────────────────────────────────────────
# 🧩 Utility Functions
# ─────────────────────────────────────────────────────────────
_E164 = re.compile(r"^\+?[0-9]{6,20}$")


def _xml_escape(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _trim(s: str, limit: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= limit else s[: max(0, limit - 1)] + "…"


def _norm_sender(x: str) -> str:
    """Best-effort to normalize to +digits; fallback to raw if unsure."""
    x = (x or "").strip()
    if not x:
        return x
    # Keep leading + if present; drop all non-digits
    if x.startswith("+"):
        digits = "+" + re.sub(r"\D", "", x[1:])
    else:
        digits = re.sub(r"\D", "", x)
        if digits and not digits.startswith("0"):  # don't guess country code
            digits = "+" + digits
    return digits if _E164.match(digits or "") else x


def _verify_twilio_signature() -> None:
    """
    Strict Twilio signature verification (if enabled).
    See https://www.twilio.com/docs/usage/security#validating-requests
    """
    if not REQUIRE_TWILIO_SIGNATURE or not TWILIO_AUTH_TOKEN:
        return

    sig = request.headers.get("X-Twilio-Signature", "")
    if not sig:
        abort(403)

    # Build the signature base: URL + concatenated sorted form params
    url = request.url  # includes query string if present
    params = request.form or {}
    pieces = [url] + [f"{k}{params[k]}" for k in sorted(params.keys())]
    body = "".join(pieces).encode("utf-8")

    digest = hmac.new(TWILIO_AUTH_TOKEN.encode("utf-8"), body, hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("ascii")

    if not hmac.compare_digest(sig, expected):
        current_app.logger.warning("Twilio signature verification failed")
        abort(403)


def _rate_limited(sender: str) -> bool:
    if not sender:
        return False
    now = time.time()
    q = _rate_window[sender]
    # Evict outside window
    while q and now - q[0] > RATE_LIMIT_WINDOW_SECS:
        q.popleft()
    if len(q) >= RATE_LIMIT_MAX_MSGS:
        return True
    q.append(now)
    return False


def _twiml(msg: str) -> Response:
    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{_xml_escape(msg)}</Message></Response>'
    return Response(xml, mimetype="application/xml")


def _db_table_exists(model) -> bool:
    """Lightweight introspection to avoid dev/offline crashes."""
    try:
        from sqlalchemy import inspect as sa_inspect

        name = getattr(model, "__tablename__", None)
        return bool(name and sa_inspect(db.engine).has_table(name))
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────
# 💬 AI Chat with OpenAI
# ─────────────────────────────────────────────────────────────
def _openai_chat(user_text: str) -> Tuple[str, Optional[str]]:
    if not SMS_AI_ENABLED:
        return (f"Thanks for your message! Learn more at {SITE_URL}.", "ai_disabled")
    if _OPENAI_CLIENT is None:
        return (
            f"Sorry, our AI is busy. You can sponsor or donate at {SITE_URL}.",
            "openai_unavailable",
        )

    last_err: Optional[str] = None
    for attempt in range(1, OPENAI_MAX_RETRIES + 2):
        try:
            if _OPENAI_LEGACY:
                resp = _OPENAI_CLIENT.ChatCompletion.create(  # type: ignore[attr-defined]
                    model=OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_text},
                    ],
                    max_tokens=OPENAI_MAX_TOKENS,
                    temperature=OPENAI_TEMPERATURE,
                    request_timeout=OPENAI_TIMEOUT_SECS,
                )
                text = (resp.choices[0].message.content or "").strip()
            else:
                resp = _OPENAI_CLIENT.chat.completions.create(  # type: ignore[attr-defined]
                    model=OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_text},
                    ],
                    max_tokens=OPENAI_MAX_TOKENS,
                    temperature=OPENAI_TEMPERATURE,
                    timeout=OPENAI_TIMEOUT_SECS,
                )
                text = (resp.choices[0].message.content or "").strip()

            trimmed = _trim(text, MAX_OUTBOUND_LEN)
            return (trimmed, None if trimmed else "empty_openai_response")
        except Exception as e:
            last_err = str(e)
            current_app.logger.warning(
                "OpenAI attempt %s failed: %s",
                attempt,
                last_err,
                exc_info=(attempt == OPENAI_MAX_RETRIES + 1),
            )

    return (
        f"Thanks for reaching out! Learn more at {SITE_URL}.",
        last_err or "unknown_error",
    )


# ─────────────────────────────────────────────────────────────
# 📝 SMS Logging (schema tolerant)
# ─────────────────────────────────────────────────────────────
def _log_sms(
    message_sid: Optional[str],
    from_num: str,
    to_num: str,
    inbound: str,
    reply: str,
    ai_used: bool,
    err: Optional[str],
) -> None:
    if not SmsLog or not _db_table_exists(SmsLog):
        return
    try:
        entry = {
            "from_number": from_num,
            "to_number": to_num,
            "message_body": inbound,
            "response_body": reply,
            "ai_used": ai_used,
            "error": err,
        }
        if message_sid and hasattr(SmsLog, "message_sid"):
            entry["message_sid"] = message_sid  # type: ignore[assignment]
        db.session.add(SmsLog(**entry))
        db.session.commit()
    except Exception as e:
        current_app.logger.error("Failed to log SMS: %s", e, exc_info=True)
        db.session.rollback()


# ─────────────────────────────────────────────────────────────
# 🔑 Keyword Shortcuts (Twilio compliance + friendly helpers)
# ─────────────────────────────────────────────────────────────
def _handle_keywords(text: str) -> Optional[str]:
    t = (text or "").strip().upper()

    # Twilio standard keywords
    if t in {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"}:
        return (
            "You will no longer receive messages from us. Reply START to re-subscribe."
        )
    if t in {"START", "YES", "UNSTOP"}:
        return "You have been re-subscribed. Text HELP for help."
    if t == "HELP":
        return f"Connect ATX Elite: Reply STOP to unsubscribe. Donate: {DONATE_URL} Sponsor: {SPONSOR_URL}"

    # Friendly helpers
    if t in {"DONATE", "DONATION"}:
        return f"Thanks for supporting! Donate here: {DONATE_URL}"
    if t in {"SPONSOR", "SPONSORSHIP"}:
        return f"We’d love to partner! Become a sponsor: {SPONSOR_URL}"
    if t in {"TRYOUT", "TRYOUTS", "SCHEDULE", "CALENDAR"}:
        return f"Tryouts & events: {TRYOUTS_URL}"

    return None


# ─────────────────────────────────────────────────────────────
# 🌡️ Health Route
# ─────────────────────────────────────────────────────────────
@sms_bp.route("/health", methods=["GET"])
def health() -> Response:
    payload = {
        "status": "ok",
        "ai_enabled": SMS_AI_ENABLED,
        "openai": bool(_OPENAI_CLIENT),
        "model": OPENAI_MODEL if _OPENAI_CLIENT else None,
        "twilio_sig_required": REQUIRE_TWILIO_SIGNATURE and bool(TWILIO_AUTH_TOKEN),
        "rate_limit": {
            "window_secs": RATE_LIMIT_WINDOW_SECS,
            "max_msgs": RATE_LIMIT_MAX_MSGS,
        },
    }
    return Response(response=jsonify(payload).get_data(), mimetype="application/json")


# ─────────────────────────────────────────────────────────────
# 📬 SMS Webhook (POST)
# ─────────────────────────────────────────────────────────────
@sms_bp.route("/webhook", methods=["POST"])
def sms_webhook() -> Response:
    # Signature guard (aborts 403 if invalid)
    try:
        _verify_twilio_signature()
    except Exception:
        # _verify_twilio_signature already aborts with 403; swallow here
        pass

    raw_msg = request.form.get("Body", "") or ""
    msg = _trim(raw_msg, MAX_INBOUND_LEN)

    from_num = _norm_sender(request.form.get("From", "") or "")
    to_num = _norm_sender(request.form.get("To", "") or "")
    message_sid = (request.form.get("MessageSid", "") or "").strip()

    # Duplicate suppression via MessageSid (if schema supports)
    if (
        SmsLog
        and _db_table_exists(SmsLog)
        and message_sid
        and hasattr(SmsLog, "message_sid")
    ):
        try:
            existing = (
                db.session.query(SmsLog).filter_by(message_sid=message_sid).first()
            )
            if existing:
                # Idempotent TwiML echo of prior response
                prior = getattr(existing, "response_body", "") or ""
                return _twiml(_xml_escape(_trim(prior, MAX_OUTBOUND_LEN)))
        except Exception:
            db.session.rollback()

    # Rate limiting (per normalized sender)
    if _rate_limited(from_num):
        reply = "You’re sending messages quickly. Please wait a moment and try again."
        _log_sms(
            message_sid, from_num, to_num, msg, reply, ai_used=False, err="rate_limited"
        )
        return _twiml(reply)

    # Empty message
    if not msg:
        reply = f"Hi! Say DONATE, SPONSOR, or TRYOUTS. More: {SITE_URL}"
        _log_sms(message_sid, from_num, to_num, msg, reply, ai_used=False, err=None)
        return _twiml(reply)

    # Keywords first
    keyword_reply = _handle_keywords(msg)
    if keyword_reply:
        _log_sms(
            message_sid, from_num, to_num, msg, keyword_reply, ai_used=False, err=None
        )
        return _twiml(keyword_reply)

    # AI fallback
    ai_reply, ai_error = _openai_chat(msg)
    final_reply = ai_reply or f"Thanks for your message! Learn more at {SITE_URL}."
    _log_sms(
        message_sid,
        from_num,
        to_num,
        msg,
        final_reply,
        ai_used=(ai_error is None),
        err=ai_error,
    )
    return _twiml(final_reply)
