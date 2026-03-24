#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any, Optional

import requests

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5000").rstrip("/")
INTENT_ENDPOINT = os.getenv("STRIPE_INTENT_ENDPOINT", "/payments/stripe/intent").strip()
STATUS_ENDPOINT = os.getenv("STATUS_ENDPOINT", "/api/status").strip()
CONFIG_ENDPOINT = os.getenv("PAYMENTS_CONFIG_ENDPOINT", "/payments/config").strip()
HEALTH_ENDPOINT = os.getenv("PAYMENTS_HEALTH_ENDPOINT", "/payments/health").strip()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
AMOUNT_DOLLARS = int(os.getenv("SMOKE_AMOUNT_DOLLARS", "17"))
CURRENCY = os.getenv("SMOKE_CURRENCY", "usd").strip().lower()
TEAM_ID = os.getenv("SMOKE_TEAM_ID", "default").strip()
NAME = os.getenv("SMOKE_DONOR_NAME", "FutureFunded Stripe Smoke").strip()
EMAIL = os.getenv("SMOKE_DONOR_EMAIL", "stripe-smoke@example.com").strip()
MESSAGE = os.getenv("SMOKE_DONOR_MESSAGE", "Stripe smoke test").strip()
RETURN_URL = os.getenv("SMOKE_RETURN_URL", f"{BASE_URL}/?checkout=success").strip()
TIMEOUT = int(os.getenv("SMOKE_TIMEOUT_SECONDS", "25"))

def fail(msg: str, details: Any = None, code: int = 1) -> None:
    print(f"❌ {msg}")
    if details is not None:
        if isinstance(details, (dict, list)):
            print(json.dumps(details, indent=2, sort_keys=True))
        else:
            print(details)
    sys.exit(code)

def ok(msg: str) -> None:
    print(f"✅ {msg}")

def info(msg: str) -> None:
    print(f"ℹ️ {msg}")

def try_json(resp: requests.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return {"raw_text": resp.text[:1200]}

def extract_csrf(html: str) -> Optional[str]:
    pats = [
        r'<meta[^>]+name=["\\\']csrf-token["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']',
        r'name=["\\\']csrf_token["\\\']\\s+value=["\\\']([^"\\\']+)["\\\']',
    ]
    for pat in pats:
        m = re.search(pat, html, re.I)
        if m:
            return m.group(1).strip()
    return None

def first_nonempty(*vals: Any) -> Optional[str]:
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return None

def nested_get(data: Any, *path: str) -> Any:
    cur = data
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur

def stripe_get(path: str) -> dict:
    resp = requests.get(
        f"https://api.stripe.com{path}",
        headers={"Authorization": f"Bearer {STRIPE_SECRET_KEY}"},
        timeout=TIMEOUT,
    )
    payload = try_json(resp)
    if resp.status_code >= 400:
        fail(f"Stripe GET failed: {path}", payload)
    return payload

def stripe_post(path: str, data: dict) -> dict:
    resp = requests.post(
        f"https://api.stripe.com{path}",
        headers={
            "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data=data,
        timeout=TIMEOUT,
    )
    payload = try_json(resp)
    if resp.status_code >= 400:
        fail(f"Stripe POST failed: {path}", payload)
    return payload

def main() -> None:
    print("\\n🚀 FutureFunded Stripe intent smoke\\n")

    if not STRIPE_SECRET_KEY:
        fail("Missing STRIPE_SECRET_KEY")
    if not STRIPE_SECRET_KEY.startswith("sk_test_"):
        fail("Refusing to run with a non-test Stripe secret key")

    session = requests.Session()
    session.headers.update({
        "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
        "User-Agent": "FutureFundedStripeSmoke/1.0",
    })

    # Warm app + cookies
    home = session.get(f"{BASE_URL}/", timeout=TIMEOUT)
    if home.status_code >= 400:
        fail("Could not load homepage", f"{home.status_code} {home.text[:500]}")
    ok("Homepage loaded")

    csrf = extract_csrf(home.text)
    if csrf:
        session.headers["X-CSRFToken"] = csrf
        session.headers["X-CSRF-Token"] = csrf
        ok("CSRF token found")
    else:
        info("No CSRF token found in homepage markup")

    for label, endpoint in [
        ("status", STATUS_ENDPOINT),
        ("payments config", CONFIG_ENDPOINT),
        ("payments health", HEALTH_ENDPOINT),
    ]:
        try:
            resp = session.get(f"{BASE_URL}{endpoint}", timeout=TIMEOUT)
            if resp.status_code < 400:
                ok(f"{label} endpoint responded")
                print(json.dumps(try_json(resp), indent=2, sort_keys=True)[:700])
            else:
                info(f"{label} endpoint returned {resp.status_code}")
        except Exception as exc:
            info(f"{label} endpoint check skipped: {exc}")

    payload = {
        "amount_cents": AMOUNT_DOLLARS * 100,

        "amount": AMOUNT_DOLLARS,
        "currency": CURRENCY,
        "name": NAME,
        "email": EMAIL,
        "message": MESSAGE,
        "team_id": TEAM_ID,
        "player_id": "",
        "sponsor_amount": "",
        "return_url": RETURN_URL,
        "source": "python-stripe-smoke",
    }
    if csrf:
        payload["csrf_token"] = csrf

    intent_resp = None
    used_mode = None

    for mode in ("json", "form"):
        if mode == "json":
            resp = session.post(f"{BASE_URL}{INTENT_ENDPOINT}", json=payload, timeout=TIMEOUT)
        else:
            resp = session.post(f"{BASE_URL}{INTENT_ENDPOINT}", data=payload, timeout=TIMEOUT)

        body = try_json(resp)
        if resp.status_code < 400:
            intent_resp = body
            used_mode = mode
            ok(f"Intent endpoint accepted {mode.upper()} payload")
            print(json.dumps(body, indent=2, sort_keys=True)[:1200])
            break

    if intent_resp is None:
        fail("Could not create a PaymentIntent through your app", {
            "payload_sent": payload,
            "last_response": body if "body" in locals() else None,
            "status_code": resp.status_code if "resp" in locals() else None,
        })

    client_secret = first_nonempty(
        intent_resp.get("client_secret"),
        intent_resp.get("clientSecret"),
        nested_get(intent_resp, "data", "client_secret"),
        nested_get(intent_resp, "payment_intent", "client_secret"),
    )
    intent_id = first_nonempty(
        intent_resp.get("payment_intent_id"),
        intent_resp.get("paymentIntentId"),
        intent_resp.get("intent_id"),
        intent_resp.get("id") if str(intent_resp.get("id", "")).startswith("pi_") else None,
        nested_get(intent_resp, "data", "payment_intent_id"),
        nested_get(intent_resp, "payment_intent", "id"),
    )

    if not intent_id and client_secret and "_secret_" in client_secret:
        intent_id = client_secret.split("_secret_", 1)[0]

    if not intent_id:
        fail("Could not discover PaymentIntent id from app response", intent_resp)

    ok(f"Discovered PaymentIntent: {intent_id}")

    pi = stripe_get(f"/v1/payment_intents/{intent_id}")
    ok(f"Stripe retrieve succeeded: {pi.get('status')}")

    if pi.get("livemode") is True:
        fail("Intent is LIVE mode, aborting")
    ok("Intent is in TEST mode")

    expected_cents = AMOUNT_DOLLARS * 100
    actual_cents = pi.get("amount")
    if actual_cents != expected_cents:
        fail("Amount mismatch", {
            "expected_cents": expected_cents,
            "actual_cents": actual_cents,
            "used_payload_mode": used_mode,
        })
    ok(f"Amount is correct: {actual_cents} cents")

    if str(pi.get("currency", "")).lower() != CURRENCY:
        fail("Currency mismatch", {"expected": CURRENCY, "actual": pi.get("currency")})
    ok(f"Currency is correct: {CURRENCY.upper()}")

    status = str(pi.get("status", "")).lower().strip()
    if status in {"requires_payment_method", "requires_confirmation"}:
        ok("Confirming with Stripe test payment method pm_card_visa")
        stripe_post(
            f"/v1/payment_intents/{intent_id}/confirm",
            {"payment_method": "pm_card_visa", "return_url": RETURN_URL},
        )
        pi = stripe_get(f"/v1/payment_intents/{intent_id}")
        status = str(pi.get("status", "")).lower().strip()

    if status not in {"succeeded", "processing", "requires_capture"}:
        fail("Final PaymentIntent status is not passing", {
            "status": status,
            "last_payment_error": pi.get("last_payment_error"),
        })

    ok(f"Final Stripe status is passing: {status}")

    print("\\n🎉 STRIPE APP SMOKE PASSED")
    print(json.dumps({
        "base_url": BASE_URL,
        "intent_endpoint": INTENT_ENDPOINT,
        "payment_intent_id": intent_id,
        "status": status,
        "amount_cents": actual_cents,
        "currency": pi.get("currency"),
        "livemode": pi.get("livemode"),
        "used_payload_mode": used_mode,
    }, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
