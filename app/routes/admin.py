from __future__ import annotations

"""
FundChamps — Admin Dashboard & Tools
────────────────────────────────────────────────────────────
• /admin/                 → Overview dashboard (sponsors, txns, goal)
• /admin/sponsors[...]    → List / approve / delete sponsors
• /admin/payouts/export   → CSV export for approved sponsors
• /admin/goals            → Manage active campaign goal
• /admin/transactions     → View transactions
• /admin/example/...      → Demo soft delete / restore helpers

Schema-tolerant:
    - All model imports are optional.
    - Routes degrade gracefully if tables/models are missing.
"""

import csv
import io
import logging

import requests
from flask import (Blueprint, Response, current_app, flash, jsonify, redirect,
                   render_template, request, url_for)

from app.extensions import db

log = logging.getLogger(__name__)

# ───────────────────────────────
# Optional model imports
# ───────────────────────────────
try:
    from app.models.sponsor import Sponsor  # type: ignore
except Exception:  # pragma: no cover
    Sponsor = None  # type: ignore

try:
    from app.models.transaction import Transaction  # type: ignore
except Exception:  # pragma: no cover
    Transaction = None  # type: ignore

try:
    from app.models.campaign_goal import CampaignGoal  # type: ignore
except Exception:  # pragma: no cover
    CampaignGoal = None  # type: ignore

try:
    from app.models.example import Example  # type: ignore
except Exception:  # pragma: no cover
    Example = None  # type: ignore

bp = Blueprint("admin", __name__, url_prefix="/admin")
admin_bp = bp  # backwards-compat alias


# ───────────────────────────────
# Helpers
# ───────────────────────────────
def send_slack_alert(message: str) -> None:
    """Fire-and-forget Slack webhook alert (best-effort)."""
    webhook = current_app.config.get("SLACK_WEBHOOK_URL")
    if not webhook:
        return
    try:
        requests.post(webhook, json={"text": message}, timeout=5)
    except Exception as exc:  # pragma: no cover
        current_app.logger.warning("Slack alert failed: %s", exc)


# ───────────────────────────────
# Admin Dashboard
# ───────────────────────────────
@bp.get("/")
def dashboard():
    """High-level overview: recent sponsors/transactions + goal stats."""
    if not Sponsor or not Transaction:
        flash("Models unavailable; dashboard is in read-only demo mode.", "warning")

    sponsors = []
    transactions = []
    goal = None
    stats = {
        "total_raised": 0.0,
        "sponsor_count": 0,
        "pending_sponsors": 0,
        "approved_sponsors": 0,
        "goal_amount": 0.0,
    }

    try:
        if Sponsor:
            sponsors = (
                Sponsor.query.order_by(
                    getattr(Sponsor, "created_at", Sponsor.id).desc()
                )
                .limit(10)
                .all()
            )
            stats["sponsor_count"] = Sponsor.query.count()

            if hasattr(Sponsor, "status"):
                stats["pending_sponsors"] = Sponsor.query.filter_by(
                    status="pending"
                ).count()
                stats["approved_sponsors"] = Sponsor.query.filter_by(
                    status="approved"
                ).count()

            if hasattr(Sponsor, "amount"):
                from sqlalchemy import func

                stats["total_raised"] = float(
                    db.session.query(
                        func.coalesce(func.sum(Sponsor.amount), 0)
                    ).scalar()
                    or 0
                )

        if Transaction:
            transactions = (
                Transaction.query.order_by(
                    getattr(Transaction, "created_at", Transaction.id).desc()
                )
                .limit(10)
                .all()
            )

        if CampaignGoal:
            goal = CampaignGoal.query.filter_by(active=True).first()
            if goal:
                for c in ("goal_amount", "amount", "value"):
                    if hasattr(goal, c):
                        stats["goal_amount"] = float(getattr(goal, c) or 0)
                        break
    except Exception:  # pragma: no cover
        current_app.logger.exception("Admin dashboard query failed")

    return render_template(
        "admin/dashboard.html",
        sponsors=sponsors,
        transactions=transactions,
        goal=goal,
        stats=stats,
    )


# ───────────────────────────────
# Sponsor Management
# ───────────────────────────────
@bp.get("/sponsors")
def sponsors_list():
    """List sponsors with optional name search."""
    if not Sponsor:
        flash("Sponsor model unavailable.", "warning")
        return render_template("admin/sponsors.html", sponsors=[])

    q = request.args.get("q", "").strip()
    query = Sponsor.query

    if hasattr(Sponsor, "deleted"):
        query = query.filter(Sponsor.deleted.is_(False))

    if q and hasattr(Sponsor, "name"):
        query = query.filter(Sponsor.name.ilike(f"%{q}%"))

    try:
        sponsors = query.order_by(
            getattr(Sponsor, "created_at", Sponsor.id).desc()
        ).all()
    except Exception:  # pragma: no cover
        current_app.logger.exception("Sponsor list query failed")
        sponsors = []

    return render_template("admin/sponsors.html", sponsors=sponsors)


@bp.post("/sponsors/approve/<int:sponsor_id>")
def approve_sponsor(sponsor_id: int):
    """Mark sponsor as approved + optional Slack alert."""
    if not Sponsor:
        flash("Sponsor model unavailable.", "warning")
        return redirect(url_for("admin.sponsors_list"))

    try:
        sponsor = Sponsor.query.get_or_404(sponsor_id)
        if hasattr(sponsor, "status"):
            sponsor.status = "approved"

        db.session.commit()
        flash(f"Sponsor '{getattr(sponsor, 'name', 'Sponsor')}' approved!", "success")

        if current_app.config.get("SLACK_WEBHOOK_URL"):
            amt = float(getattr(sponsor, "amount", 0) or 0)
            send_slack_alert(
                f"New Sponsor Approved: {getattr(sponsor, 'name', 'Sponsor')} (${amt:,.2f})"
            )
    except Exception:  # pragma: no cover
        db.session.rollback()
        current_app.logger.exception("Approve sponsor failed")
        flash("Could not approve sponsor.", "danger")

    return redirect(url_for("admin.sponsors_list"))


@bp.post("/sponsors/delete/<int:sponsor_id>")
def delete_sponsor(sponsor_id: int):
    """Soft-delete sponsor (if supported) or hard delete."""
    if not Sponsor:
        flash("Sponsor model unavailable.", "warning")
        return redirect(url_for("admin.sponsors_list"))

    try:
        sponsor = Sponsor.query.get_or_404(sponsor_id)
        if hasattr(sponsor, "deleted"):
            sponsor.deleted = True
        else:
            db.session.delete(sponsor)

        db.session.commit()
        flash(f"Sponsor '{getattr(sponsor, 'name', 'Sponsor')}' deleted.", "warning")
    except Exception:  # pragma: no cover
        db.session.rollback()
        current_app.logger.exception("Delete sponsor failed")
        flash("Could not delete sponsor.", "danger")

    return redirect(url_for("admin.sponsors_list"))


# ───────────────────────────────
# Export Payouts CSV
# ───────────────────────────────
@bp.get("/payouts/export")
def export_payouts() -> Response:
    """Export approved sponsors for payouts as a CSV download."""
    if not Sponsor:
        return Response("Sponsor model unavailable", status=503)

    try:
        query = Sponsor.query
        if hasattr(Sponsor, "status"):
            query = query.filter_by(status="approved")
        if hasattr(Sponsor, "deleted"):
            query = query.filter_by(deleted=False)
        sponsors = query.all()
    except Exception:  # pragma: no cover
        current_app.logger.exception("Export payouts query failed")
        sponsors = []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Email", "Amount", "Approved Date"])

    for s in sponsors:
        name = getattr(s, "name", "") or ""
        email = getattr(s, "email", "") or ""
        amount = float(getattr(s, "amount", 0) or 0)
        updated = getattr(s, "updated_at", None)
        ts = updated.strftime("%Y-%m-%d") if updated else ""
        writer.writerow([name, email, f"{amount:.2f}", ts])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=approved_sponsor_payouts.csv"
        },
    )


# ───────────────────────────────
# Campaign Goal Management
# ───────────────────────────────
@bp.route("/goals", methods=["GET", "POST"])
def goals():
    """View/update the active campaign goal (schema tolerant)."""
    if not CampaignGoal:
        flash("CampaignGoal model unavailable.", "warning")
        return render_template("admin/goals.html", goal=None)

    goal = None
    try:
        goal = CampaignGoal.query.filter_by(active=True).first()

        if request.method == "POST":
            amount = float(request.form.get("amount", "0") or 0)

            if goal:
                # Prefer goal_amount column name when present
                if hasattr(goal, "goal_amount"):
                    goal.goal_amount = amount
                elif hasattr(goal, "amount"):
                    goal.amount = amount
                else:
                    setattr(goal, "amount", amount)
            else:
                data = {"active": True}
                cols = getattr(CampaignGoal, "__table__", None)
                if cols is not None and hasattr(cols, "columns") and "goal_amount" in cols.columns:  # type: ignore[attr-defined]
                    data["goal_amount"] = amount
                else:
                    data["amount"] = amount

                goal = CampaignGoal(**data)  # type: ignore[arg-type]
                db.session.add(goal)

            db.session.commit()
            flash("Campaign goal updated!", "success")
            return redirect(url_for("admin.goals"))
    except Exception:  # pragma: no cover
        db.session.rollback()
        current_app.logger.exception("Update goal failed")
        flash("Could not update goal.", "danger")

    return render_template("admin/goals.html", goal=goal)


# ───────────────────────────────
# Transactions
# ───────────────────────────────
@bp.get("/transactions")
def transactions_list():
    """List all transactions (most recent first)."""
    if not Transaction:
        flash("Transaction model unavailable.", "warning")
        return render_template("admin/transactions.html", transactions=[])

    try:
        txs = Transaction.query.order_by(
            getattr(Transaction, "created_at", Transaction.id).desc()
        ).all()
    except Exception:  # pragma: no cover
        current_app.logger.exception("Transactions query failed")
        txs = []

    return render_template("admin/transactions.html", transactions=txs)


# ───────────────────────────────
# Example demo: soft delete / restore via JSON
# ───────────────────────────────
@bp.post("/example/<uuid>/delete")
def example_soft_delete(uuid: str):
    if not Example:
        return jsonify({"error": "Model unavailable"}), 503

    ex = Example.by_uuid(uuid)
    if not ex:
        return jsonify({"error": "Not found"}), 404

    try:
        ex.soft_delete()
        db.session.commit()
        return jsonify({"message": f"{getattr(ex, 'name', 'Example')} soft-deleted."})
    except Exception:  # pragma: no cover
        db.session.rollback()
        current_app.logger.exception("Example soft delete failed")
        return jsonify({"error": "Delete failed"}), 500


@bp.post("/example/<uuid>/restore")
def example_restore(uuid: str):
    if not Example:
        return jsonify({"error": "Model unavailable"}), 503

    ex = Example.by_uuid(uuid)
    if not ex:
        return jsonify({"error": "Not found"}), 404

    try:
        ex.restore()
        db.session.commit()
        return jsonify({"message": f"{getattr(ex, 'name', 'Example')} restored."})
    except Exception:  # pragma: no cover
        db.session.rollback()
        current_app.logger.exception("Example restore failed")
        return jsonify({"error": "Restore failed"}), 500
