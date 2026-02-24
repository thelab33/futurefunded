#!/usr/bin/env python3
"""
Stripe Backend Smoke Test — /payments/stripe/intent contract

Validates:
- endpoint responds 200
- PaymentIntent created (pi_)
- client secret present
- status present
- publishable key present

Does NOT charge a card.
"""

import os
import sys
import json
import requests

BASE = os.getenv("FF_BASE_URL", "http://127.0.0.1:5000").rstrip("/")
URL = f"{BASE}/payments/stripe/intent"

payload = {
    "amount_cents": int(os.getenv("FF_AMOUNT_CENTS", "2500")),
    "currency": os.getenv("FF_CURRENCY", "usd"),
    "email": os.getenv("FF_EMAIL", "smoke-test@example.com"),
}

def pick(d, *keys, default=None):
    for k in keys:
        if k in d:
            return d[k]
    return default

print("🔍 Stripe Backend Smoke")
print("POST", URL)
print("Payload:", json.dumps(payload, indent=2))

try:
    r = requests.post(URL, json=payload, timeout=20)
except Exception as e:
    print("❌ Request failed:", e)
    sys.exit(1)

print("\nHTTP", r.status_code)
print(r.text)

if r.status_code != 200:
    print("❌ Non-200 response")
    sys.exit(1)

try:
    data = r.json()
except Exception:
    print("❌ Response is not JSON")
    sys.exit(1)

pi_id = pick(data, "id", "paymentIntentId")
status = pick(data, "status")
client_secret = pick(data, "clientSecret", "client_secret")
pk = pick(data, "publishableKey", "stripePk", "stripe_publishable_key")

missing = [k for k, v in {
    "id": pi_id,
    "status": status,
    "clientSecret": client_secret,
    "publishableKey": pk,
}.items() if not v]

if missing:
    print("❌ Missing required fields:", missing)
    sys.exit(1)

if not str(pi_id).startswith("pi_"):
    print("❌ Invalid PaymentIntent id:", pi_id)
    sys.exit(1)

if "_secret_" not in str(client_secret):
    print("❌ Invalid client secret")
    sys.exit(1)

if not str(pk).startswith("pk_"):
    print("❌ Invalid publishable key")
    sys.exit(1)

print("\n✅ BACKEND STRIPE SMOKE PASSED")
print("PaymentIntent:", pi_id)
print("Status:", status)
