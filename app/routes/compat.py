from flask import Blueprint, current_app

bp = Blueprint("compat", __name__)


@bp.route("/webhooks/stripe", methods=["POST"])
def stripe_webhook_compat():
    handler = current_app.view_functions.get("fc_payments.stripe_webhook")
    if handler:
        return handler()
    return ("Stripe webhook not configured", 501)
