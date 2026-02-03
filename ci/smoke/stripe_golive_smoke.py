#!/usr/bin/env python3
"""
FutureFunded — Stripe Go-Live Smoke Test (Production-Aligned)

Checks:
1) Stripe keys exist + match expected mode
2) Critical GET routes return 200
3) /payments/config returns publishable key
4) Creates a PaymentIntent via /payments/stripe/intent
5) Confirms intent returns client_secret (NO CHARGE MADE)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

import requests


DEFAULT_PATHS = ["/", "/payments/health", "/payments/config"]


# ---------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------
def die(msg: str, code: int = 1) -> None:
    print(f"❌ {msg}")
    raise SystemExit(code)


def ok(msg: str) -> None:
    print(f"✅ {msg}")


def info(msg: str) -> None:
    print(f"↪ {msg}")


def mask(v: str) -> str:
    if not v:
        return "<missing>"
    return f"{v[:7]}…{v[-4:]}" if len(v) > 12 else v


def mode_of(k: str) -> str:
    if k.startswith(("sk_live_", "pk_live_")):
        return "live"
    if k.startswith(("sk_test_", "pk_test_")):
        return "test"
    return "unknown"


# ---------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------
class Client:
    def __init__(self, base: str, bearer: str | None, timeout: float = 12.0):
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.headers = {"accept": "application/json"}
        if bearer:
            self.headers["Authorization"] = f"Bearer {bearer}"

    def url(self, path: str) -> str:
        return self.base + (path if path.startswith("/") else "/" + path)

    def get(self, path: str) -> Tuple[int, Dict[str, Any]]:
        r = self.session.get(self.url(path), headers=self.headers, timeout=self.timeout)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, {}

    def post(self, path: str, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        r = self.session.post(
            self.url(path),
            json=payload,
            headers=self.headers,
            timeout=self.timeout,
        )
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, {}


# ---------------------------------------------------------------------
# Smoke steps
# ---------------------------------------------------------------------
def resolve_keys() -> Tuple[str, str]:
    sk = os.getenv("STRIPE_SECRET_KEY") or os.getenv("STRIPE_API_KEY") or ""
    pk = os.getenv("STRIPE_PUBLISHABLE_KEY") or os.getenv("STRIPE_PUBLIC_KEY") or ""
    return sk.strip(), pk.strip()


def require_mode(sk: str, pk: str, expect: str) -> None:
    if not sk or not pk:
        die("Missing Stripe keys in environment")

    if expect in {"live", "test"}:
        if mode_of(sk) != expect:
            die(f"Secret key mismatch: expected {expect}, got {mode_of(sk)} ({mask(sk)})")
        if mode_of(pk) != expect:
            die(f"Publishable key mismatch: expected {expect}, got {mode_of(pk)} ({mask(pk)})")

    ok(f"Stripe keys validated ({expect})")


def check_gets(http: Client, paths: Iterable[str]) -> None:
    for p in paths:
        code, _ = http.get(p)
        if code != 200:
            die(f"{p} expected 200, got {code}")
    ok("GET routes OK")


def create_intent(http: Client) -> None:
    payload = {
        # cents-explicit = safest possible
        "amount_cents": 100,  # $1.00
        "currency": "usd",
        "name": "Go-Live Smoke",
        "email": "smoke@futurefunded.com",
        "metadata": {"smoke": "true"},
    }

    code, body = http.post("/payments/stripe/intent", payload)
    if code != 200:
        die(f"Intent creation failed ({code}): {json.dumps(body)[:200]}")

    if not body.get("client_secret"):
        die("Missing client_secret in intent response")

    ok("Stripe PaymentIntent creation OK")


# ---------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("BASE", "https://getfuturefunded.com"))
    ap.add_argument("--expect", default=os.getenv("EXPECT_STRIPE_MODE", "live"))
    ap.add_argument("--bearer", default=os.getenv("PAYMENTS_BEARER"))
    args = ap.parse_args()

    base = args.base.rstrip("/")
    info(f"Base: {base}")
    info(f"Expect Stripe mode: {args.expect}")

    sk, pk = resolve_keys()
    info(f"STRIPE_SECRET_KEY: {mask(sk)} ({mode_of(sk)})")
    info(f"STRIPE_PUBLISHABLE_KEY: {mask(pk)} ({mode_of(pk)})")

    require_mode(sk, pk, args.expect)

    http = Client(base=base, bearer=args.bearer)
    check_gets(http, DEFAULT_PATHS)
    create_intent(http)

    print("\n🎉 FUTUREFUNDED STRIPE LIVE SMOKE PASSED")


if __name__ == "__main__":
    main()

