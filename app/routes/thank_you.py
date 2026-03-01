from flask import Blueprint, request, render_template, Response, current_app
from markupsafe import escape

bp = Blueprint("thank_you", __name__)

@bp.get("/thank-you")
def thank_you():
    """
    Must always return 200.
    Stripe may redirect here with:
      - payment_intent
      - redirect_status
    We also support:
      - org
      - amount
    """
    try:
        org = request.args.get("org", "default")
        redirect_status = request.args.get("redirect_status") or "ok"
        payment_intent = request.args.get("payment_intent") or "n/a"

        amount_raw = request.args.get("amount")
        amount_val = None
        if amount_raw is not None:
            try:
                amount_val = float(amount_raw)
            except Exception:
                amount_val = None

        # Prefer template (brandable)
        return render_template("index.html",
            org=org,
            amount=amount_val,
            redirect_status=redirect_status,
            payment_intent=payment_intent,
        )
    except Exception:
        current_app.logger.exception("thank-you route failed")
        # absolute last-resort: still return 200
        safe_org = escape(request.args.get("org", "default"))
        return Response(f"Thank you! (org={safe_org})", mimetype="text/plain", status=200)
