import os

import stripe
from flask import Blueprint, current_app, g, jsonify, request

from app.extensions import db
from app.models import Donation, Org

stripe_donations_bp = Blueprint("stripe_donations", __name__, url_prefix="/stripe")


# ─────────────────────────────────────────────────────────────
# Create a PaymentIntent — called by frontend JS
# ─────────────────────────────────────────────────────────────
@stripe_donations_bp.route("/create-payment-intent", methods=["POST"])
def create_payment_intent():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    amount = float(data.get("amount", 0) or 0)
    logo = data.get("logo_path", "")
    org_slug = data.get("org_slug")

    if not name or not email or amount <= 0:
        return jsonify({"error": "Missing required fields"}), 400

    org = Org.query.filter_by(slug=org_slug).first() if org_slug else None

    # Create Donation record (pending)
    donation = Donation(name=name, email=email, logo_path=logo)
    donation.set_amount_dollars(amount)
    if org:
        donation.org_id = org.id
    db.session.add(donation)
    db.session.commit()

    # Create Stripe PaymentIntent
    intent = stripe.PaymentIntent.create(
        amount=donation.amount_cents,
        currency="usd",
        automatic_payment_methods={"enabled": True},
        metadata={
            "donation_id": donation.id,
            "org_id": org.id if org else None,
            "donor_email": donation.email,
        },
    )

    return jsonify(
        {
            "clientSecret": intent["client_secret"],
            "publishableKey": current_app.config.get("STRIPE_PUBLISHABLE_KEY"),
        }
    )


# ─────────────────────────────────────────────────────────────
# Stripe Webhook — verify payment success
# ─────────────────────────────────────────────────────────────
@stripe_donations_bp.route("/webhook", methods=["POST"])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature")
    endpoint_secret = current_app.config.get("STRIPE_WEBHOOK_SECRET")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except stripe.error.SignatureVerificationError:
        return jsonify(success=False), 400

    if event["type"] == "payment_intent.succeeded":
        intent = event["data"]["object"]
        metadata = intent.get("metadata", {})
        donation_id = metadata.get("donation_id")
        if donation_id:
            donation = Donation.query.get(int(donation_id))
            if donation:
                donation.auto_assign_tier()
                db.session.add(donation)
                db.session.commit()
    return jsonify(success=True)
