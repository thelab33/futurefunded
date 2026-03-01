"""
Donation routes
---------------
Handles unified donation flow per organization.
Supports Stripe + PayPal + live donor JSON feed.
"""

from __future__ import annotations

import os

import stripe
from flask import Blueprint, current_app, jsonify, render_template, request
from werkzeug.exceptions import BadRequest

from app.extensions import db
from app.models import Donation, Org
from app.models.mixins import SoftDeleteMixin, TimestampMixin

bp = Blueprint("donations", __name__, url_prefix="")

# --- Stripe setup ---------------------------------------------------------------
stripe_secret_key = os.getenv("STRIPE_SECRET_KEY") or os.getenv("STRIPE_API_KEY")
stripe_publishable_key = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
stripe.api_key = stripe_secret_key

# --- Optional CSRF disable for JSON POSTs ---------------------------------------
try:
    from flask_wtf.csrf import csrf_exempt  # type: ignore
except ImportError:

    def csrf_exempt(f):  # fallback noop
        return f


@bp.route("/<org_slug>/donate", methods=["GET", "POST"])
@csrf_exempt
def donate_for_org(org_slug: str):
    """Unified Stripe + PayPal donation endpoint."""
    org = Org.query.filter_by(slug=org_slug).first_or_404()

    # --- STEP 1: Render donation form -------------------------------------------
    if request.method == "GET":
        return render_template("index.html", org=org)

    # --- STEP 2: Handle donation POST (AJAX) ------------------------------------
    try:
        data = request.get_json(force=True)
    except BadRequest:
        return jsonify({"ok": False, "error": "Invalid JSON body"}), 400

    try:
        amount = int(float(data.get("amount", 0)) * 100)  # convert to cents
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid amount"}), 400

    donor_name = (data.get("name") or "Anonymous").strip()
    method = (data.get("method") or "stripe").lower().strip()

    if amount < 50:
        return jsonify({"ok": False, "error": "Minimum donation is $0.50"}), 400

    # --- STRIPE flow ------------------------------------------------------------
    if method == "stripe":
        if not stripe_secret_key or not stripe_secret_key.startswith("sk_"):
            return jsonify({"ok": False, "error": "Stripe secret key missing"}), 500

        try:
            intent = stripe.PaymentIntent.create(
                amount=amount,
                currency="usd",
                description=f"Donation to {org.team_name or org.slug}",
                metadata={
                    "org_id": org.id,
                    "org_slug": org.slug,
                    "donor": donor_name,
                    "source": "donate_form",
                },
                automatic_payment_methods={"enabled": True},
            )
            current_app.logger.info(
                "✅ Created Stripe PaymentIntent %s for org=%s donor=%s ($%.2f)",
                intent.id,
                org.slug,
                donor_name,
                amount / 100.0,
            )
            return jsonify(
                {
                    "ok": True,
                    "client_secret": intent.client_secret,
                    "publishable_key": stripe_publishable_key,
                }
            )
        except stripe.error.StripeError as e:
            err = getattr(e, "error", None)
            msg = getattr(err, "message", str(e))
            current_app.logger.warning("⚠️ Stripe error: %s", msg)
            return jsonify({"ok": False, "error": msg}), 400
        except Exception as e:
            current_app.logger.exception("Stripe PaymentIntent creation failed")
            return jsonify({"ok": False, "error": "Internal server error"}), 500

    # --- PAYPAL flow ------------------------------------------------------------
    elif method == "paypal":
        client_id = os.getenv("PAYPAL_CLIENT_ID")
        if not client_id:
            return jsonify({"ok": False, "error": "PayPal client ID missing"}), 500

        current_app.logger.info("🟢 PayPal donation init for org=%s", org.slug)
        return jsonify(
            {
                "ok": True,
                "paypalClientId": client_id,
                "status": "ready",
            }
        )

    # --- Unsupported method -----------------------------------------------------
    return jsonify({"ok": False, "error": f"Unsupported payment method: {method}"}), 400


@bp.route("/<org_slug>/donors.json")
def donors_json(org_slug: str):
    """Return recent donors for an org (for live widget refresh)."""
    org = Org.query.filter_by(slug=org_slug).first_or_404()
    donors = (
        Donation.query.filter_by(org_id=org.id)
        .order_by(Donation.created_at.desc())
        .limit(10)
        .all()
    )

    return jsonify(
        [
            {
                "name": d.name or "Anonymous",
                "amount": float(d.amount or 0),
                "time": d.created_at.strftime("%b %d, %I:%M %p"),
            }
            for d in donors
        ]
    )


class Donation(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "donations"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("orgs.id"), nullable=False)
    name = db.Column(db.String(120))
    email = db.Column(db.String(255))
    amount = db.Column(db.Integer, default=0)
    message = db.Column(db.Text, nullable=True)

    org = db.relationship("Org", back_populates="donations")

    def __repr__(self) -> str:
        return f"<Donation {self.name or 'Anonymous'} ${self.amount/100:.2f}>"
