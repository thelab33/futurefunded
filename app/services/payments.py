# app/services/payments.py
import os
import random
import time

import requests
import stripe
from flask import current_app


class PaymentService:
    """Unified Stripe + PayPal service with demo mode toggle."""

    @staticmethod
    def _demo_mode() -> bool:
        return str(
            os.getenv("DEMO_MODE", current_app.config.get("DEMO_MODE", "0"))
        ).lower() in ("1", "true", "yes")

    # ---------------- STRIPE ----------------
    @staticmethod
    def create_stripe_intent(data: dict) -> dict:
        amount = float(data.get("amount", 0))
        if amount < 1:
            raise ValueError("Minimum amount is $1.00")

        if PaymentService._demo_mode():
            # fake client_secret for demo
            return {
                "id": f"pi_demo_{int(time.time())}",
                "client_secret": f"demo_secret_{random.randint(1000,9999)}",
                "amount": amount,
                "currency": "usd",
                "demo": True,
            }

        # real call
        stripe.api_key = current_app.config.get("STRIPE_SECRET_KEY")
        intent = stripe.PaymentIntent.create(
            amount=int(amount * 100),
            currency="usd",
            payment_method_types=["card"],
        )
        return {"client_secret": intent.client_secret, "id": intent.id}

    # ---------------- PAYPAL ----------------
    @staticmethod
    def create_paypal_order(data: dict) -> dict:
        amount = float(data.get("amount", 0))
        if amount < 1:
            raise ValueError("Minimum amount is $1.00")

        if PaymentService._demo_mode():
            return {
                "id": f"ORDER_DEMO_{int(time.time())}",
                "status": "CREATED",
                "amount": amount,
                "currency": "USD",
                "demo": True,
            }

        # real request
        url = f"{PaymentService._paypal_base()}/v2/checkout/orders"
        client_id, secret = PaymentService._paypal_creds()
        auth = (client_id, secret)
        resp = requests.post(
            url,
            auth=auth,
            json={
                "intent": "CAPTURE",
                "purchase_units": [
                    {"amount": {"currency_code": "USD", "value": str(amount)}}
                ],
            },
            timeout=PaymentService._paypal_timeout(),
        )
        resp.raise_for_status()
        data = resp.json()
        # Normalize for tests
        return {"order_id": data.get("id") or data.get("order_id") or ""}

    @staticmethod
    def capture_paypal_order(order_id: str) -> dict:
        if not order_id:
            raise ValueError("Missing order_id")

        if PaymentService._demo_mode():
            return {
                "id": order_id,
                "status": "COMPLETED",
                "amount": 25.00,
                "currency": "USD",
                "captured_at": time.time(),
                "demo": True,
            }

        # real capture
        url = f"{PaymentService._paypal_base()}/v2/checkout/orders/{order_id}/capture"
        client_id, secret = PaymentService._paypal_creds()
        resp = requests.post(
            url, auth=(client_id, secret), timeout=PaymentService._paypal_timeout()
        )
        resp.raise_for_status()
        data = resp.json()
        amt = None
        try:
            cap = (
                (data.get("purchase_units") or [{}])[0]
                .get("payments", {})
                .get("captures", [{}])[0]
            )
            amt = float(cap.get("amount", {}).get("value"))
        except Exception:
            pass
        out = {"status": data.get("status"), "amount": amt}
        return out

    # ---------------- Helpers ----------------
    @staticmethod
    def _paypal_base() -> str:
        return (
            "https://api-m.paypal.com"
            if PaymentService._paypal_env() == "live"
            else "https://api-m.sandbox.paypal.com"
        )

    @staticmethod
    def _paypal_env() -> str:
        return str(current_app.config.get("PAYPAL_ENV", "sandbox")).lower()

    @staticmethod
    def _paypal_creds() -> tuple[str, str]:
        return (
            str(current_app.config.get("PAYPAL_CLIENT_ID", "")),
            str(current_app.config.get("PAYPAL_SECRET", "")),
        )

    @staticmethod
    def _paypal_timeout() -> int:
        return int(current_app.config.get("PAYPAL_TIMEOUT", 15))
