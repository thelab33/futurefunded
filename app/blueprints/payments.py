#!/usr/bin/env python3
"""
FutureFunded Payments Blueprint (Stripe + PayPal) — drop-in, contract-tight

Mount: /payments  (register blueprint with url_prefix="/payments")

Endpoints (kept + additive):
  GET  /payments/health
  GET  /payments/config
  GET  /payments/donations/<int:donation_id>

  POST /payments/stripe/intent
  POST /payments/stripe/webhook

  GET  /payments/paypal/health
  POST /payments/paypal/create-order   (alias: /payments/paypal/order)
  POST /payments/paypal/capture        (alias: /payments/paypal/capture-order)

Health behavior:
- default: always 200 (never throws), returns status: ok|degraded|error
- strict=1 (or uptime=1/monitor=1): 200 only if ok; else 503

Contracts:
- Stripe flow is unchanged and remains primary.
- PayPal is optional; missing PayPal config does NOT degrade /payments/health.
- API-style JSON: never caches; consistent ok/message/error shape.

Patches included (2026-02-18):
- Back-compat payload: accept amount_cents OR amountCents OR legacy amount (dollars) for Stripe + PayPal.
- Clearer DB-not-initialized errors (no-such-table) for intent routes + webhook storm guard.
- PayPal config 'enabled' reflects both client id + secret (so UI doesn't show half-configured PayPal).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional, Tuple, cast
from urllib.error import HTTPError, URLError

import stripe
from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import text, update as sa_update
from sqlalchemy.exc import IntegrityError, OperationalError

from app.extensions import db
from app.models import Donation, Org
from app.models.stripe_event import StripeEvent

bp = Blueprint("payments", __name__)
_PROCESS_START = time.time()

# ----------------------------
# CSRF exempt (API-style JSON)
# ----------------------------
try:
    from app.extensions import csrf  # type: ignore

    if csrf:
        csrf.exempt(bp)  # type: ignore[attr-defined]
except Exception:
    pass


# ----------------------------
# Env detection (MUST exist before Settings.load)
# ----------------------------
def _detect_env() -> str:
    raw = (os.getenv("APP_ENV") or os.getenv("ENV") or os.getenv("FLASK_ENV") or "").strip().lower()

    # If FLASK_CONFIG is a dotted path to a Config class, infer env
    cfg = (os.getenv("FLASK_CONFIG") or "").strip().lower()
    if "productionconfig" in cfg:
        raw = "production"
    elif "testingconfig" in cfg:
        raw = "testing"
    elif "developmentconfig" in cfg and not raw:
        raw = "development"

    if raw in {"prod", "production"}:
        return "production"
    if raw in {"test", "testing"}:
        return "testing"

    # staging/stage/local -> treat as development
    if raw in {"dev", "development", "local", "staging", "stage"}:
        return "development"

    return raw or "development"


# ----------------------------
# Small utilities
# ----------------------------
_TRUTHY = {"1", "true", "yes", "on", "y"}
_FALSY = {"0", "false", "no", "off", "n"}


def _truthy(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in _TRUTHY


def _cfg(key: str, default: str = "") -> str:
    v = current_app.config.get(key)
    if isinstance(v, str) and v.strip():
        return v.strip()
    return (os.getenv(key, default) or "").strip()


def _cfg_bool(key: str, default: bool = False) -> bool:
    v = current_app.config.get(key)
    if isinstance(v, bool):
        return v
    raw = (os.getenv(key, "") or "").strip().lower()
    if not raw:
        return default
    if raw in _TRUTHY:
        return True
    if raw in _FALSY:
        return False
    return default


def _safe_currency(raw: Any, default: str = "usd") -> str:
    c = str(raw or "").lower().strip()
    if len(c) == 3 and c.isalpha():
        return c
    return default


def _is_email(s: str) -> bool:
    s = (s or "").strip()
    return ("@" in s) and ("." in s.split("@")[-1])


def _request_payload() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    if isinstance(data, dict) and data:
        return cast(Dict[str, Any], data)
    if request.form:
        return cast(Dict[str, Any], request.form.to_dict(flat=True))
    return {}


def _safe_int_opt(v: Any) -> Optional[int]:
    if v is None:
        return None
    try:
        s = str(v).strip()
        if not s:
            return None
        return int(s)
    except Exception:
        return None


def _json_response(payload: Dict[str, Any], status: int = 200):
    resp = jsonify(payload)
    resp.status_code = int(status)
    resp.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    resp.headers.setdefault("Pragma", "no-cache")
    resp.headers.setdefault("Expires", "0")
    return resp


def _json_ok(payload: Dict[str, Any], status: int = 200):
    payload.setdefault("ok", True)
    return _json_response(payload, status)


def _json_error(message: str, status: int, extra: Optional[Dict[str, Any]] = None):
    body: Dict[str, Any] = {"ok": False, "message": message, "error": {"message": message}}
    if extra:
        body["error"].update(extra)
        for k, v in extra.items():
            if k not in body:
                body[k] = v
    return _json_response(body, status)


def _tx_commit() -> None:
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise


def _base_url_from_request() -> str:
    base = (os.getenv("FF_PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if base:
        return base
    try:
        return (request.host_url or "").rstrip("/")
    except Exception:
        return "http://127.0.0.1:5000"


def _is_no_such_table(err: Exception) -> bool:
    msg = str(err).lower()
    return ("no such table" in msg) or ("undefined table" in msg) or ("does not exist" in msg and "table" in msg)


# ----------------------------
# Fee + rounding math
# ----------------------------
def _round_up_add_cents(base_cents: int, step_dollars: int = 5) -> int:
    if base_cents <= 0:
        return 0
    step_cents = max(100, step_dollars * 100)
    next_cents = ((base_cents + step_cents - 1) // step_cents) * step_cents
    return max(0, next_cents - base_cents)


def _gross_up_cover_fees(base_cents: int, fee_pct: Decimal, fee_flat: Decimal) -> Tuple[int, int]:
    if base_cents <= 0:
        return base_cents, 0

    base = (Decimal(base_cents) / Decimal("100"))
    total = (base + fee_flat) / (Decimal("1") - fee_pct)
    total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    fee = (total - base).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    total_cents = int((total * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    fee_cents = int((fee * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return total_cents, fee_cents


# ----------------------------
# Settings (Stripe + Fees)
# ----------------------------
@dataclass(frozen=True)
class Settings:
    env: str
    platform: str
    currency: str
    min_amount_cents: int
    max_amount_cents: int

    fees_enabled: bool
    fee_pct: Decimal
    fee_flat: Decimal

    stripe_sk: str
    stripe_pk: str
    stripe_whsec: str
    stripe_force_card: bool
    stripe_allow_redirects: bool
    stripe_max_network_retries: int

    @property
    def stripe_mode(self) -> str:
        k = (self.stripe_sk or self.stripe_pk or "").strip()
        if k.startswith(("sk_live_", "pk_live_")):
            return "live"
        if k.startswith(("sk_test_", "pk_test_")):
            return "test"
        return "unknown"

    @property
    def stripe_keys_present(self) -> bool:
        return bool(self.stripe_sk and self.stripe_pk)

    @property
    def stripe_keys_look_valid(self) -> bool:
        return bool(self.stripe_sk.startswith("sk_") and self.stripe_pk.startswith("pk_"))

    @classmethod
    def load(cls) -> "Settings":
        env = _detect_env()

        def _int_cfg(key: str, default: str) -> int:
            try:
                return int(_cfg(key, default) or default)
            except Exception:
                return int(default)

        platform = (_cfg("PLATFORM_NAME") or _cfg("BRAND_NAME") or "FutureFunded").strip()
        currency = _safe_currency(_cfg("DEFAULT_CURRENCY") or _cfg("CURRENCY") or "usd", "usd")

        return cls(
            env=env,
            platform=platform,
            currency=currency,
            min_amount_cents=_int_cfg("MIN_DONATION_CENTS", "50"),
            max_amount_cents=_int_cfg("MAX_DONATION_CENTS", str(50_000 * 100)),
            fees_enabled=_cfg_bool("FF_FEES_ENABLED", True),
            fee_pct=Decimal(str(current_app.config.get("FF_FEES_PCT", "0.029"))),
            fee_flat=Decimal(str(current_app.config.get("FF_FEES_FLAT", "0.30"))),
            stripe_sk=_cfg("STRIPE_SECRET_KEY") or _cfg("STRIPE_API_KEY") or _cfg("FF_STRIPE_SECRET_KEY"),
            stripe_pk=_cfg("STRIPE_PUBLISHABLE_KEY") or _cfg("STRIPE_PUBLIC_KEY") or _cfg("FF_STRIPE_PUBLISHABLE_KEY"),
            stripe_whsec=_cfg("STRIPE_WEBHOOK_SECRET") or _cfg("FF_STRIPE_WEBHOOK_SECRET"),
            stripe_force_card=_cfg_bool("FF_STRIPE_FORCE_CARD", False),
            stripe_allow_redirects=_cfg_bool("FF_STRIPE_ALLOW_REDIRECTS", False),
            stripe_max_network_retries=_int_cfg("STRIPE_MAX_NETWORK_RETRIES", "2"),
        )

    def init_stripe(self) -> None:
        if not (self.stripe_sk.startswith("sk_") and self.stripe_pk.startswith("pk_")):
            raise RuntimeError("Stripe keys missing or malformed (expected sk_ / pk_)")
        stripe.api_key = self.stripe_sk
        stripe.max_network_retries = int(self.stripe_max_network_retries or 2)
        try:
            stripe.set_app_info(self.platform, version=_cfg("APP_VERSION", "dev"))
        except Exception:
            pass


# ----------------------------
# Normalized request model (Stripe)
# ----------------------------
@dataclass(frozen=True)
class Donor:
    name: str
    email: str


@dataclass(frozen=True)
class IntentRequest:
    amount_any_raw: Any
    currency: str
    donor: Donor
    cover_fees: bool
    round_up: bool
    anonymous: bool
    note: Optional[str]
    description: str
    org_id: Optional[int]
    org_slug: str

    @classmethod
    def from_payload(cls, s: Settings, data: Dict[str, Any]) -> "IntentRequest":
        donor_obj = data.get("donor") if isinstance(data.get("donor"), dict) else {}
        donor_name = str(donor_obj.get("name") or data.get("name") or "").strip()
        donor_email = str(donor_obj.get("email") or data.get("email") or "").strip().lower()

        note = str(data.get("note") or data.get("message") or "").strip()
        note = note[:500] if note else ""
        note_out = note or None

        # Back-compat: amount_cents / amountCents preferred; legacy amount treated as dollars.
        amount_raw = (
            data.get("amount_cents")
            if data.get("amount_cents") is not None
            else data.get("amountCents")
            if data.get("amountCents") is not None
            else data.get("amount")  # legacy dollars
            if data.get("amount") is not None
            else data.get("amount_dollars")
            if data.get("amount_dollars") is not None
            else data.get("amountDollars")
        )

        return cls(
            amount_any_raw=amount_raw,
            currency=_safe_currency(data.get("currency") or s.currency, s.currency),
            donor=Donor(name=donor_name[:160], email=donor_email[:160]),
            cover_fees=_truthy(data.get("cover_fees") or data.get("coverFees") or False),
            round_up=_truthy(data.get("round_up") or data.get("roundUp") or False),
            anonymous=_truthy(data.get("anonymous") or data.get("is_anonymous") or False),
            note=note_out,
            description=str(data.get("description") or f"Donation via {s.platform}").strip()[:250],
            org_id=_safe_int_opt(data.get("org_id")),
            org_slug=str(data.get("org_slug") or "").strip(),
        )


def _parse_amount_cents_compat(s: Settings, raw: Any, *, assumes_dollars: bool = False) -> Tuple[Optional[int], Optional[str], str]:
    """
    Returns: (amount_cents, error, source)
      - If raw came from amount_cents/amountCents -> cents expected.
      - If raw came from legacy amount/amountDollars -> dollars expected.
    """
    if raw is None:
        return None, "amount_cents required", "missing"

    # If explicitly marked as dollars, parse decimal dollars -> cents.
    if assumes_dollars:
        try:
            dollars = Decimal(str(raw).strip() or "0")
        except Exception:
            return None, "amount must be a number (dollars)", "dollars"
        cents = int((dollars * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if cents <= 0:
            return None, "amount must be > 0", "dollars"
        return cents, None, "dollars"

    # Otherwise parse as integer cents.
    try:
        sraw = str(raw).strip()
        if not sraw:
            return None, "amount_cents required", "cents"
        cents = int(sraw)
    except Exception:
        return None, "amount_cents must be an integer", "cents"

    if cents <= 0:
        return None, "amount_cents must be > 0", "cents"

    return cents, None, "cents"


@dataclass(frozen=True)
class AmountBreakdown:
    base_cents: int
    round_up_add_cents: int
    fee_cents: int
    total_cents: int


def _compute_amounts(s: Settings, base_cents: int, cover_fees: bool, round_up: bool) -> AmountBreakdown:
    round_add = _round_up_add_cents(base_cents, step_dollars=5) if round_up else 0
    base_plus_round = base_cents + round_add

    fee_cents = 0
    total_cents = base_plus_round
    if cover_fees and s.fees_enabled:
        total_cents, fee_cents = _gross_up_cover_fees(base_plus_round, s.fee_pct, s.fee_flat)

    total_cents = min(int(total_cents), int(s.max_amount_cents))
    return AmountBreakdown(
        base_cents=int(base_cents),
        round_up_add_cents=int(round_add),
        fee_cents=int(fee_cents),
        total_cents=int(total_cents),
    )


# ----------------------------
# Idempotency (Stripe PI create)
# ----------------------------
def _server_idempotency_key(*, donation_id: int, amount_cents: int, currency: str, cover_fees: bool, round_up: bool) -> str:
    raw = f"ff|don:{donation_id}|amt:{amount_cents}|cur:{currency}|cf:{int(cover_fees)}|ru:{int(round_up)}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:48]
    return f"ff_pi_{digest}"


# ----------------------------
# Donation helpers
# ----------------------------
def _resolve_org(org_id: Optional[int], org_slug: str) -> Optional[Org]:
    if org_id:
        try:
            return db.session.get(Org, int(org_id))
        except Exception:
            return None
    slug = (org_slug or "").strip()
    if slug:
        try:
            return db.session.query(Org).filter(Org.slug == slug).first()
        except Exception:
            return None
    return None


def _create_donation(*, req: IntentRequest, amount_cents: int, currency: str) -> int:
    name = (req.donor.name or "").strip()
    email = (req.donor.email or "").strip().lower()
    anonymous = bool(req.anonymous)

    if email and not _is_email(email):
        raise ValueError("valid email required")

    if not name:
        name = "Anonymous"
    if anonymous:
        name = "Anonymous"

    org = _resolve_org(req.org_id, req.org_slug)

    d = Donation(
        name=name[:160],
        email=email[:160] if email else "",
        amount_cents=int(amount_cents),
        currency=currency,
        provider="stripe",
        provider_status="pending_intent",
        note=req.note,
        org_id=(org.id if org else None),
    )
    db.session.add(d)
    db.session.flush()
    if not getattr(d, "id", None):
        raise RuntimeError("Donation id missing after insert")
    return int(d.id)


# ----------------------------
# SQLite lock mitigation (webhook-heavy)
# ----------------------------
def _maybe_set_sqlite_busy_timeout(ms: int = 5000) -> None:
    try:
        db.session.execute(text(f"PRAGMA busy_timeout={int(ms)}"))
    except Exception:
        pass


def _retry_on_db_lock(fn, *, attempts: int = 6) -> Any:
    last_err: Optional[Exception] = None
    for i in range(attempts):
        try:
            return fn()
        except OperationalError as e:
            last_err = e
            msg = str(e).lower()
            try:
                db.session.rollback()
            except Exception:
                pass
            if ("database is locked" in msg) or ("sqlite_busy" in msg) or ("locked" in msg):
                time.sleep(0.05 * (i + 1))
                continue
            raise
        except Exception as e:
            last_err = e
            try:
                db.session.rollback()
            except Exception:
                pass
            raise
    if last_err:
        raise last_err
    raise OperationalError("DB locked after retries", params=None, orig=None)  # type: ignore[arg-type]


# ----------------------------
# StripeEvent persistence (idempotent)
# ----------------------------
def _create_stripe_event_row(*, event_id: str, etype: str, livemode: bool, object_id: str, payload_dict: Dict[str, Any]) -> StripeEvent:
    ev = StripeEvent(
        event_id=event_id,
        type=etype[:120],
        livemode=bool(livemode),
        object_id=(object_id[:255] if object_id else None),
    )
    for attr in ("payload", "data", "raw", "event_json"):
        if hasattr(ev, attr):
            try:
                setattr(ev, attr, payload_dict)
            except Exception:
                pass
            break
    return ev


# ----------------------------
# Health checks (enterprise monitoring)
# ----------------------------
def _db_check() -> Dict[str, Any]:
    t0 = time.perf_counter()
    out: Dict[str, Any] = {"ok": True, "latencyMs": 0, "checks": {}}

    def _fail(name: str, e: Exception) -> None:
        out["ok"] = False
        out["checks"][name] = {"ok": False, "error": f"{type(e).__name__}: {str(e)}"}
        if _is_no_such_table(e):
            out["checks"][name]["hint"] = "missing_db_tables"
            out["checks"][name]["fix"] = "Run migrations (flask db upgrade) or create schema in the production database."

    try:
        db.session.execute(text("SELECT 1"))
        out["checks"]["ping"] = {"ok": True}
    except Exception as e:
        _fail("ping", e)
        try:
            db.session.rollback()
        except Exception:
            pass
        out["latencyMs"] = int((time.perf_counter() - t0) * 1000)
        out["error"] = out["checks"]["ping"]["error"]
        return out

    try:
        db.session.query(Donation.id).limit(1).all()
        out["checks"]["donation"] = {"ok": True}
    except Exception as e:
        _fail("donation", e)
        try:
            db.session.rollback()
        except Exception:
            pass

    try:
        db.session.query(StripeEvent.id).limit(1).all()
        out["checks"]["stripeEvent"] = {"ok": True}
    except Exception as e:
        _fail("stripeEvent", e)
        try:
            db.session.rollback()
        except Exception:
            pass

    out["latencyMs"] = int((time.perf_counter() - t0) * 1000)

    if not out["ok"]:
        for _, chk in (out.get("checks") or {}).items():
            if not chk.get("ok"):
                out["error"] = chk.get("error")
                break

    return out


def _stripe_check(s: Settings) -> Dict[str, Any]:
    keys_present = bool(s.stripe_keys_present)
    keys_valid = bool(s.stripe_keys_look_valid)
    wh_present = bool((s.stripe_whsec or "").strip())

    warnings: list[str] = []
    if not keys_present:
        warnings.append("missing_keys")
    elif not keys_valid:
        warnings.append("malformed_keys")
    if s.env == "production" and not wh_present:
        warnings.append("missing_webhook_secret")

    ok = bool(keys_present and keys_valid)

    out: Dict[str, Any] = {"ok": ok, "mode": s.stripe_mode, "webhookSecretPresent": wh_present}
    if warnings:
        out["warning"] = ",".join(warnings)
    return out


def _health_status_from_components(components: Dict[str, Any]) -> str:
    if not bool((components.get("db") or {}).get("ok", False)):
        return "error"

    stripe_comp = components.get("stripe") or {}
    if not bool(stripe_comp.get("ok", False)):
        return "degraded"

    warn = str(stripe_comp.get("warning") or "")
    if "missing_webhook_secret" in warn:
        return "degraded"

    return "ok"


def _strict_mode_requested() -> bool:
    return _truthy(request.args.get("strict") or request.args.get("uptime") or request.args.get("monitor"))


def _health_http_code(status: str, strict: bool) -> int:
    if not strict:
        return 200
    return 200 if status == "ok" else 503


# ----------------------------
# PayPal (Orders v2) — optional, safe-by-default
# ----------------------------
_PP_TOKEN_CACHE: Dict[str, Any] = {"access_token": "", "expires_at": 0.0}


def _paypal_client_id() -> str:
    return (os.getenv("PAYPAL_CLIENT_ID") or os.getenv("FF_PAYPAL_CLIENT_ID") or "").strip()


def _paypal_client_secret() -> str:
    return (os.getenv("PAYPAL_CLIENT_SECRET") or os.getenv("PAYPAL_SECRET") or os.getenv("FF_PAYPAL_SECRET") or "").strip()


def _paypal_enabled() -> bool:
    return bool(_paypal_client_id() and _paypal_client_secret())


def _paypal_mode() -> str:
    raw = (os.getenv("PAYPAL_ENV") or os.getenv("FF_PAYPAL_ENV") or "").strip().lower()
    if raw in {"live", "production", "prod"}:
        return "live"
    if raw in {"sandbox", "test", "testing"}:
        return "sandbox"
    return "live" if _detect_env() == "production" else "sandbox"


def _paypal_base() -> str:
    return "https://api-m.paypal.com" if _paypal_mode() == "live" else "https://api-m.sandbox.paypal.com"


def _paypal_cfg_public() -> Dict[str, Any]:
    cid = _paypal_client_id()
    return {"enabled": bool(_paypal_enabled()), "mode": _paypal_mode(), "clientId": cid}


def _paypal_access_token() -> Tuple[Optional[str], Optional[str]]:
    cid = _paypal_client_id()
    sec = _paypal_client_secret()
    if not (cid and sec):
        return None, "PayPal not configured (missing client id/secret)"

    now = time.time()
    if _PP_TOKEN_CACHE.get("access_token") and float(_PP_TOKEN_CACHE.get("expires_at") or 0) > (now + 30):
        return str(_PP_TOKEN_CACHE["access_token"]), None

    url = f"{_paypal_base()}/v1/oauth2/token"
    basic = base64.b64encode(f"{cid}:{sec}".encode("utf-8")).decode("ascii")
    body = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            obj = json.loads(raw)
            token = str(obj.get("access_token") or "")
            expires_in = int(obj.get("expires_in") or 0)
            if not token:
                return None, "PayPal token missing in response"
            _PP_TOKEN_CACHE["access_token"] = token
            _PP_TOKEN_CACHE["expires_at"] = now + max(60, expires_in)
            return token, None
    except HTTPError as e:
        try:
            msg = e.read().decode("utf-8", errors="replace")
        except Exception:
            msg = str(e)
        return None, f"PayPal token HTTPError {getattr(e, 'code', '?')}: {msg[:300]}"
    except URLError as e:
        return None, f"PayPal token URLError: {str(e)[:300]}"
    except Exception as e:
        return None, f"PayPal token error: {type(e).__name__}: {str(e)[:300]}"


def _paypal_json_request(
    path: str,
    *,
    method: str = "POST",
    payload: Optional[Dict[str, Any]] = None,
    request_id: str = "",
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    token, err = _paypal_access_token()
    if err or not token:
        return None, err or "PayPal token unavailable", 503

    url = f"{_paypal_base()}{path}"
    data = None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if request_id:
        headers["PayPal-Request-Id"] = request_id[:128]

    req = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            obj = json.loads(raw) if raw else {}
            return (obj if isinstance(obj, dict) else {"raw": obj}), None, int(getattr(resp, "status", 200) or 200)
    except HTTPError as e:
        code = int(getattr(e, "code", 400) or 400)
        try:
            msg = e.read().decode("utf-8", errors="replace")
            j = json.loads(msg) if msg else {}
        except Exception:
            j = {}
            msg = str(e)
        out: Dict[str, Any] = {"paypalError": j or msg}
        return out, f"PayPal HTTPError {code}", code
    except URLError as e:
        return None, f"PayPal URLError: {str(e)[:300]}", 503
    except Exception as e:
        return None, f"PayPal error: {type(e).__name__}: {str(e)[:300]}", 500


# ----------------------------
# Routes
# ----------------------------
@bp.get("/health")
def payments_health():
    strict = _strict_mode_requested()

    try:
        s = Settings.load()
    except Exception as e:
        current_app.logger.exception("payments.health: Settings.load failed")
        return _json_response(
            {
                "ok": False,
                "status": "error",
                "strict": bool(strict),
                "healthVersion": "payments.health.v4",
                "error": {"type": type(e).__name__, "message": str(e)[:400]},
            },
            503 if strict else 200,
        )

    components: Dict[str, Any] = {}

    try:
        components["db"] = _db_check()
    except Exception as e:
        current_app.logger.exception("payments.health: db check failed")
        components["db"] = {"ok": False, "error": f"{type(e).__name__}: {str(e)}"}

    try:
        components["stripe"] = _stripe_check(s)
    except Exception as e:
        current_app.logger.exception("payments.health: stripe check failed")
        components["stripe"] = {"ok": False, "error": f"{type(e).__name__}: {str(e)}"}

    # PayPal is optional: include visibility, but do NOT affect status computation.
    try:
        components["paypal"] = {"ok": True, **_paypal_cfg_public()}
    except Exception as e:
        components["paypal"] = {"ok": False, "error": f"{type(e).__name__}: {str(e)}"}

    try:
        status = _health_status_from_components(components)
    except Exception as e:
        current_app.logger.exception("payments.health: status computation failed")
        status = "error"
        components["statusError"] = f"{type(e).__name__}: {str(e)}"

    code = _health_http_code(status, strict)

    return _json_response(
        {
            "ok": True,
            "status": status,
            "strict": bool(strict),
            "healthVersion": "payments.health.v4",
            "env": s.env,
            "platform": s.platform,
            "uptimeS": int(time.time() - _PROCESS_START),
            "components": components,
        },
        code,
    )


@bp.get("/config")
def payments_config():
    s = Settings.load()
    pp = _paypal_cfg_public()
    return _json_ok(
        {
            "platform": s.platform,
            "publishableKey": s.stripe_pk,
            "mode": s.stripe_mode,
            "currency": s.currency,
            # additive (safe)
            "paypal": pp,
            # convenient flat aliases (safe)
            "paypalClientId": pp.get("clientId"),
            "paypalMode": pp.get("mode"),
            "paypalEnabled": bool(pp.get("enabled")),
        }
    )


@bp.get("/donations/<int:donation_id>")
def get_donation(donation_id: int):
    try:
        d = db.session.get(Donation, int(donation_id))
    except Exception:
        d = None
    if not d:
        return _json_error("Donation not found", 404)

    def _get(attr: str, default=None):
        return getattr(d, attr, default)

    return _json_ok(
        {
            "donationId": int(donation_id),
            "id": int(donation_id),
            "name": _get("name", "") or "",
            "email": _get("email", "") or "",
            "amountCents": int(_get("amount_cents", 0) or 0),
            "currency": _get("currency", "") or "usd",
            "provider": _get("provider", "") or "stripe",
            "status": _get("provider_status", "") or "",
            "providerIntentId": _get("provider_intent_id", "") or "",
            "paidAt": str(_get("paid_at", "") or "") or None,
        }
    )


# ----------------------------
# Stripe
# ----------------------------
@bp.post("/stripe/intent")
def stripe_intent():
    s = Settings.load()
    data = _request_payload()
    req = IntentRequest.from_payload(s, data)

    # Determine whether the raw amount was dollars (legacy) or cents (canonical).
    assumes_dollars = ("amount_cents" not in data) and ("amountCents" not in data) and (
        "amount" in data or "amount_dollars" in data or "amountDollars" in data
    )

    amount_cents, err, source = _parse_amount_cents_compat(s, req.amount_any_raw, assumes_dollars=assumes_dollars)
    if err:
        return _json_error(err, 400, extra={"amountSource": source})

    assert amount_cents is not None
    if amount_cents < s.min_amount_cents:
        return _json_error(f"Amount too small (min {s.min_amount_cents} cents)", 400)

    breakdown = _compute_amounts(s, base_cents=int(amount_cents), cover_fees=bool(req.cover_fees), round_up=bool(req.round_up))

    try:
        donation_id = _create_donation(req=req, amount_cents=breakdown.total_cents, currency=req.currency)
        _tx_commit()
    except OperationalError as oe:
        db.session.rollback()
        if _is_no_such_table(oe):
            return _json_error(
                "Database not initialized (missing tables). Run migrations (flask db upgrade) on the production database.",
                503,
                extra={"errorType": type(oe).__name__},
            )
        current_app.logger.exception("payments: DB error initializing donation")
        return _json_error("Database error initializing donation", 500)
    except ValueError as ve:
        db.session.rollback()
        return _json_error(str(ve), 400)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("payments: failed to initialize donation")
        return _json_error("Failed to initialize donation", 500)

    try:
        s.init_stripe()
    except Exception as e:
        current_app.logger.error("payments: Stripe misconfigured: %s", str(e))
        return _json_error(
            f"Server misconfigured: {str(e)}",
            500,
            extra={"publishableKey": getattr(s, "stripe_pk", None), "mode": getattr(s, "stripe_mode", None)},
        )

    receipt_email = req.donor.email if (req.donor.email and _is_email(req.donor.email)) else ""

    params: Dict[str, Any] = {
        "amount": int(breakdown.total_cents),
        "currency": req.currency,
        "description": req.description,
        "metadata": {
            "donation_id": str(donation_id),
            "base_amount_cents": str(int(breakdown.base_cents)),
            "round_up_add_cents": str(int(breakdown.round_up_add_cents)),
            "fee_cents": str(int(breakdown.fee_cents)),
            "cover_fees": "1" if req.cover_fees else "0",
            "round_up": "1" if req.round_up else "0",
        },
    }
    if receipt_email:
        params["receipt_email"] = receipt_email

    if s.stripe_force_card:
        params["payment_method_types"] = ["card"]
    else:
        params["automatic_payment_methods"] = {
            "enabled": True,
            "allow_redirects": "always" if s.stripe_allow_redirects else "never",
        }

    idem_key = _server_idempotency_key(
        donation_id=donation_id,
        amount_cents=int(breakdown.total_cents),
        currency=req.currency,
        cover_fees=bool(req.cover_fees),
        round_up=bool(req.round_up),
    )

    try:
        pi = stripe.PaymentIntent.create(**params, idempotency_key=idem_key)

        try:
            d = db.session.get(Donation, donation_id)
            if d:
                if hasattr(d, "provider_intent_id"):
                    d.provider_intent_id = str(getattr(pi, "id", "") or "")[:255]
                if hasattr(d, "provider_status"):
                    d.provider_status = str(getattr(pi, "status", "created") or "created")[:60]
            _tx_commit()
        except Exception:
            db.session.rollback()
            current_app.logger.exception("payments: failed updating donation with PI id/status")

        client_secret = getattr(pi, "client_secret", None)
        if not client_secret:
            return _json_error("Stripe did not return client_secret", 500, extra={"id": getattr(pi, "id", None)})

        return _json_ok(
            {
                "donationId": int(donation_id),
                "id": pi.id,
                "status": pi.status,
                "clientSecret": client_secret,
                "publishableKey": s.stripe_pk,
                "mode": s.stripe_mode,
                "amountCents": int(breakdown.total_cents),
                "feeCents": int(breakdown.fee_cents),
                "roundUpAddCents": int(breakdown.round_up_add_cents),
                "amountSource": source,
                # legacy aliases
                "donation_id": int(donation_id),
                "client_secret": client_secret,
                "publishable_key": s.stripe_pk,
                "amount_cents": int(breakdown.total_cents),
                "fee_cents": int(breakdown.fee_cents),
                "round_up_add_cents": int(breakdown.round_up_add_cents),
            }
        )
    except stripe.error.StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        current_app.logger.error("payments: Stripe error creating intent: %s", msg, exc_info=True)
        try:
            d = db.session.get(Donation, donation_id)
            if d and hasattr(d, "provider_status"):
                d.provider_status = "intent_failed"
            _tx_commit()
        except Exception:
            db.session.rollback()
        return _json_error(msg, 400, extra={"publishableKey": s.stripe_pk, "mode": s.stripe_mode})
    except Exception as e:
        current_app.logger.exception("payments: unexpected error creating Stripe intent")
        try:
            d = db.session.get(Donation, donation_id)
            if d and hasattr(d, "provider_status"):
                d.provider_status = "intent_failed"
            _tx_commit()
        except Exception:
            db.session.rollback()
        return _json_error("Failed to create payment intent", 500, extra={"exception": str(e), "mode": s.stripe_mode})


@bp.route("/stripe/webhook", methods=["POST", "OPTIONS"])
def stripe_webhook():
    if request.method == "OPTIONS":
        return ("", 200)

    s = Settings.load()

    # In local/dev where Stripe isn't configured, don't create retry storms.
    try:
        s.init_stripe()
    except Exception:
        return ("", 200)

    payload = request.get_data(cache=False, as_text=False)
    sig = (request.headers.get("Stripe-Signature") or "").strip()
    endpoint_secret = (s.stripe_whsec or os.getenv("STRIPE_WEBHOOK_SECRET") or os.getenv("STRIPE_WHSEC") or "").strip()

    try:
        if not endpoint_secret:
            if s.env == "production":
                return ("", 400)
            ev = json.loads(payload.decode("utf-8"))
        else:
            event = stripe.Webhook.construct_event(payload, sig, endpoint_secret)
            ev = event.to_dict_recursive()  # type: ignore[attr-defined]
    except Exception:
        return ("", 400)

    event_id = str(ev.get("id") or "")
    etype = str(ev.get("type") or "").lower()
    livemode = bool(ev.get("livemode") or False)
    obj = ((ev.get("data") or {}).get("object")) or {}
    obj_id = str(obj.get("id") or "")[:120] if isinstance(obj, dict) else ""

    _maybe_set_sqlite_busy_timeout(5000)

    def _store_event():
        db.session.add(
            _create_stripe_event_row(
                event_id=event_id,
                etype=etype,
                livemode=livemode,
                object_id=obj_id,
                payload_dict=ev,
            )
        )
        _tx_commit()

    try:
        _retry_on_db_lock(_store_event, attempts=6)
    except IntegrityError:
        db.session.rollback()
        return ("", 200)
    except OperationalError as oe:
        db.session.rollback()
        # Missing tables in prod can cause Stripe to retry endlessly; acknowledge to stop the storm.
        if _is_no_such_table(oe):
            current_app.logger.error(
                "payments: webhook received but DB schema missing; acknowledge to prevent retries: %s", str(oe)[:300]
            )
            return ("", 200)
        current_app.logger.exception("payments: failed to store StripeEvent (will retry)")
        return ("", 500)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("payments: failed to store StripeEvent (will retry)")
        return ("", 500)

    def _update_donation(where_clause, *, status: str, pi_id: str = "", paid: bool = False) -> bool:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        vals: Dict[str, Any] = {"provider_status": status[:60], "updated_at": now}
        if pi_id:
            vals["provider_intent_id"] = pi_id[:255]
        if paid:
            vals["paid_at"] = now

        def _do():
            res = db.session.execute(sa_update(Donation).where(where_clause).values(**vals))
            if getattr(res, "rowcount", 0):
                _tx_commit()
                return True
            db.session.rollback()
            return False

        return bool(_retry_on_db_lock(_do, attempts=6))

    try:
        if isinstance(obj, dict) and etype.startswith("payment_intent."):
            pi_id = str(obj.get("id") or "")
            status = str(obj.get("status") or "")[:60]
            md = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
            donation_id_raw = str((md or {}).get("donation_id") or "").strip()

            if donation_id_raw.isdigit():
                _update_donation(Donation.id == int(donation_id_raw), status=status, pi_id=pi_id, paid=(status == "succeeded"))
            elif pi_id:
                _update_donation(Donation.provider_intent_id == pi_id, status=status, pi_id=pi_id, paid=(status == "succeeded"))

            return ("", 200)

        if isinstance(obj, dict) and etype in ("charge.succeeded", "charge.updated"):
            ch_status = str(obj.get("status") or "").lower()
            ch_paid = bool(obj.get("paid") or False)
            if ch_status and ch_status != "succeeded" and not ch_paid:
                return ("", 200)

            pi_id = str(obj.get("payment_intent") or "")
            if pi_id:
                _update_donation(Donation.provider_intent_id == pi_id, status="succeeded", pi_id=pi_id, paid=True)

        return ("", 200)
    except OperationalError as oe:
        db.session.rollback()
        if _is_no_such_table(oe):
            current_app.logger.error(
                "payments: webhook update skipped (DB schema missing); ack to prevent retries: %s", str(oe)[:300]
            )
            return ("", 200)
        current_app.logger.exception("payments: webhook processing failed (will retry)")
        return ("", 500)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("payments: webhook processing failed (will retry)")
        return ("", 500)


# ----------------------------
# PayPal routes
# ----------------------------
@bp.get("/paypal/health")
def paypal_health():
    enabled = _paypal_enabled()
    return _json_response(
        {
            "ok": True,
            "status": "ok" if enabled else "degraded",
            "enabled": bool(enabled),
            "paypal": _paypal_cfg_public(),
        },
        200,
    )


@bp.post("/paypal/create-order")
@bp.post("/paypal/order")  # alias (matches your smoke candidates)
def paypal_create_order():
    if not _paypal_enabled():
        return _json_error("PayPal not configured", 503, extra={"paypal": _paypal_cfg_public()})

    s = Settings.load()
    data = _request_payload()

    # Back-compat: accept cents OR legacy amount (dollars)
    raw = (
        data.get("amount_cents")
        if data.get("amount_cents") is not None
        else data.get("amountCents")
        if data.get("amountCents") is not None
        else data.get("amount")
        if data.get("amount") is not None
        else data.get("amount_dollars")
        if data.get("amount_dollars") is not None
        else data.get("amountDollars")
    )

    assumes_dollars = ("amount_cents" not in data) and ("amountCents" not in data) and (
        "amount" in data or "amount_dollars" in data or "amountDollars" in data
    )
    currency = _safe_currency(data.get("currency") or s.currency, s.currency)

    amount_cents, err, source = _parse_amount_cents_compat(s, raw, assumes_dollars=assumes_dollars)
    if err:
        return _json_error(err, 400, extra={"amountSource": source})

    assert amount_cents is not None
    if amount_cents < s.min_amount_cents:
        return _json_error(f"Amount too small (min {s.min_amount_cents} cents)", 400)

    cover_fees = _truthy(data.get("cover_fees") or data.get("coverFees") or False)
    round_up = _truthy(data.get("round_up") or data.get("roundUp") or False)

    breakdown = _compute_amounts(s, base_cents=int(amount_cents), cover_fees=bool(cover_fees), round_up=bool(round_up))
    value = (Decimal(breakdown.total_cents) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    value_str = f"{value:.2f}"

    desc = str(data.get("description") or f"Donation via {s.platform}").strip()[:127]
    base_url = _base_url_from_request()
    return_url = str(data.get("returnUrl") or data.get("return_url") or f"{base_url}/#checkout").strip()
    cancel_url = str(data.get("cancelUrl") or data.get("cancel_url") or f"{base_url}/").strip()

    donation_id: Optional[int] = None
    try:
        d = Donation(
            name="PayPal Donor",
            email="",
            amount_cents=int(breakdown.total_cents),
            currency=currency,
            provider="paypal",
            provider_status="order_creating",
            note=None,
            org_id=None,
        )
        db.session.add(d)
        db.session.flush()
        donation_id = int(getattr(d, "id", 0) or 0) or None
        _tx_commit()
    except OperationalError as oe:
        db.session.rollback()
        if _is_no_such_table(oe):
            return _json_error(
                "Database not initialized (missing tables). Run migrations (flask db upgrade) on the production database.",
                503,
                extra={"errorType": type(oe).__name__},
            )
        donation_id = None  # allow order creation even if DB write failed
    except Exception:
        db.session.rollback()
        donation_id = None  # allow order creation even if DB write failed

    payload: Dict[str, Any] = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "amount": {"currency_code": currency.upper(), "value": value_str},
                "description": desc,
            }
        ],
        "application_context": {
            "brand_name": s.platform[:127],
            "landing_page": "BILLING",
            "user_action": "PAY_NOW",
            "return_url": return_url,
            "cancel_url": cancel_url,
        },
    }
    if donation_id:
        payload["purchase_units"][0]["custom_id"] = str(donation_id)

    req_id = ""
    if donation_id:
        req_id = f"ff_pp_create_{donation_id}_{breakdown.total_cents}_{currency}".replace(" ", "_")

    obj, perr, code = _paypal_json_request("/v2/checkout/orders", payload=payload, request_id=req_id)
    if perr:
        return _json_error("PayPal create-order failed", int(code or 400), extra={"paypal": obj or {"error": perr}})

    order_id = str((obj or {}).get("id") or "")
    links = (obj or {}).get("links") if isinstance((obj or {}).get("links"), list) else []
    approve_url = ""
    try:
        for l in links:
            if isinstance(l, dict) and str(l.get("rel") or "").lower() in {"approve", "payer-action"}:
                approve_url = str(l.get("href") or "")
                break
    except Exception:
        approve_url = ""

    if donation_id and order_id:
        try:
            d2 = db.session.get(Donation, donation_id)
            if d2:
                if hasattr(d2, "provider_intent_id"):
                    d2.provider_intent_id = order_id[:255]
                if hasattr(d2, "provider_status"):
                    d2.provider_status = "order_created"
            _tx_commit()
        except Exception:
            db.session.rollback()

    return _json_ok(
        {
            "orderId": order_id,
            "approveUrl": approve_url or None,
            "status": (obj or {}).get("status") or "CREATED",
            "amountCents": int(breakdown.total_cents),
            "currency": currency,
            "donationId": donation_id,
            "amountSource": source,
            # legacy-ish aliases
            "order_id": order_id,
            "approve_url": approve_url or None,
            "donation_id": donation_id,
        }
    )


@bp.post("/paypal/capture")
@bp.post("/paypal/capture-order")  # alias (matches your smoke candidates)
def paypal_capture():
    if not _paypal_enabled():
        return _json_error("PayPal not configured", 503, extra={"paypal": _paypal_cfg_public()})

    data = _request_payload()
    order_id = str(data.get("orderId") or data.get("order_id") or "").strip()
    donation_id_raw = data.get("donationId") or data.get("donation_id")

    # SAFE: smoke can validate route exists without capturing.
    if not order_id:
        return _json_error("orderId required", 400)

    req_id = f"ff_pp_cap_{order_id}".replace(" ", "_")[:120]
    obj, perr, code = _paypal_json_request(f"/v2/checkout/orders/{order_id}/capture", payload={}, request_id=req_id)
    if perr:
        return _json_error("PayPal capture failed", int(code or 400), extra={"paypal": obj or {"error": perr}})

    donation_id: Optional[int] = None
    try:
        if donation_id_raw is not None and str(donation_id_raw).strip().isdigit():
            donation_id = int(str(donation_id_raw).strip())
    except Exception:
        donation_id = None

    if donation_id:
        try:
            d = db.session.get(Donation, donation_id)
            if d and hasattr(d, "provider_status"):
                d.provider_status = "captured"
            if d and hasattr(d, "provider_intent_id") and not (getattr(d, "provider_intent_id", "") or ""):
                d.provider_intent_id = order_id[:255]
            if d and hasattr(d, "paid_at"):
                d.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
            _tx_commit()
        except Exception:
            db.session.rollback()

    return _json_ok(
        {
            "orderId": order_id,
            "status": (obj or {}).get("status") or "COMPLETED",
            "capture": obj,
            "donationId": donation_id,
        }
    )
