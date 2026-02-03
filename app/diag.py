# app/diag.py
import os

import stripe
from flask import Blueprint, abort, current_app, jsonify

bp = Blueprint("diag", __name__)  # name must match what you register


@bp.get("/_diag/stripe")
def diag_stripe():
    # Hide in production unless explicitly allowed
    if current_app.config.get("ENV") == "production" and not os.getenv(
        "ALLOW_PUBLIC_DIAG"
    ):
        abort(404)

    key = os.getenv("STRIPE_SECRET_KEY", "") or ""
    has_key = key.startswith("sk_")
    masked = f"{key[:10]}…{key[-4:]}" if has_key else ""

    ok = False
    api_status = None
    try:
        if has_key:
            stripe.api_key = key
            bal = stripe.Balance.retrieve()  # lightweight ping
            api_status = bal.get("object")  # usually "balance"
            ok = True
    except Exception as e:
        # Keep it short to avoid leaking details
        api_status = f"error:{getattr(e, 'user_message', str(e))[:140]}"

    return jsonify(
        {"ok": ok, "has_key": has_key, "key_masked": masked, "api_status": api_status}
    )
