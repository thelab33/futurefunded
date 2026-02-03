from __future__ import annotations

"""
Admin & API blueprints (production-ready, schema-tolerant)

Refactor goals:
- Multi-tenant ready: optional org scoping via ?org_id= (when columns exist)
- CampaignGoal: org_id-first, team_id nullable (no hard assumptions)
- Avoid name collisions with the separate RESTX API blueprint (keep this one as "admin_api")
- Fix sponsor soft-delete semantics (deleted vs deleted_at)
- Make CSV export + dashboard stats resilient and predictable
- Keep auto-registration exports: bp/admin_bp/api_bp
"""

import csv
import io
import threading
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

from flask import (
    Blueprint,
    Response,
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)
from sqlalchemy import desc, func
from sqlalchemy import inspect as sa_inspect

from app.extensions import db

# ── Optional admin auth (flask_login) ────────────────────────────────────────
try:
    from flask_login import current_user, login_required  # type: ignore
except Exception:  # pragma: no cover
    current_user = None  # type: ignore

    def login_required(fn):  # type: ignore
        return fn


def _require_admin_guard() -> bool:
    """
    Returns True if current request passes admin guard.
    If flask_login present and User has is_admin flag, require it.
    Otherwise, allow through (dev/offline safe).
    """
    try:
        if current_user is None:
            return True
        if getattr(current_user, "is_authenticated", False) is False:
            return False
        # If the model exposes is_admin (bool), require it; else allow
        is_admin = getattr(current_user, "is_admin", True)
        return bool(is_admin)
    except Exception:
        return True


# ── Models (tolerant imports; continue gracefully if missing) ────────────────
try:
    # Prefer explicit imports if you have them; this keeps schema-tolerance intact.
    from app.models import CampaignGoal, Example, Sponsor, Transaction  # type: ignore
except Exception:  # pragma: no cover
    Sponsor = Transaction = CampaignGoal = Example = None  # type: ignore


# ── Blueprints ───────────────────────────────────────────────────────────────
admin = Blueprint("admin", __name__, url_prefix="/admin")

# IMPORTANT: avoid colliding with the RESTX blueprint that is also named "api".
# Mount this at /api only if you really want it; otherwise consider /internal-api.
api = Blueprint("admin_api", __name__, url_prefix="/api")

# Export aliases for auto-registrar
bp = admin
admin_bp = admin
api_bp = api
__all__ = ["bp", "admin_bp", "api_bp", "admin", "api"]


# ── Helpers ─────────────────────────────────────────────────────────────────
def _table_exists(name_or_model: Any) -> bool:
    """Safe table existence check (won’t raise in dev)."""
    try:
        if not db or not db.engine:
            return False
        name = getattr(name_or_model, "__tablename__", None) or str(name_or_model)
        return bool(name and sa_inspect(db.engine).has_table(name))
    except Exception:
        return False


def _first_attr(obj: Any, candidates: Iterable[str]) -> Any:
    """Return first present attribute from candidates, else None."""
    for c in candidates:
        if hasattr(obj, c):
            return getattr(obj, c)
    return None


def _get_org_id() -> Optional[int]:
    """
    Optional org scoping for multi-tenant dashboards.
    Use querystring ?org_id=123 (or later, derive from subdomain/session).
    """
    try:
        return request.args.get("org_id", type=int)
    except Exception:
        return None


def _apply_org_filter(q, model: Any, org_id: Optional[int]):
    if org_id is None:
        return q
    try:
        if hasattr(model, "org_id"):
            return q.filter(model.org_id == org_id)  # type: ignore[attr-defined]
    except Exception:
        pass
    return q


def _not_deleted_filter(q, model: Any):
    """
    Normalize soft-delete patterns:
      - deleted (bool)
      - deleted_at (timestamp null means active)
    """
    try:
        if hasattr(model, "deleted_at"):
            return q.filter(model.deleted_at.is_(None))  # type: ignore[attr-defined]
        if hasattr(model, "deleted"):
            return q.filter(model.deleted.is_(False))  # type: ignore[attr-defined]
    except Exception:
        pass
    return q


def _approved_filter(q, model: Any):
    try:
        if hasattr(model, "status"):
            return q.filter(model.status == "approved")  # type: ignore[attr-defined]
    except Exception:
        pass
    return q


def _order_by_recent(q, model: Any):
    order_col = _first_attr(model, ("created_at", "updated_at", "id"))
    if order_col is not None:
        try:
            q = q.order_by(desc(order_col))
        except Exception:
            pass
    return q


def _sponsor_query(org_id: Optional[int] = None):
    """Base Sponsor query with common filters, schema-tolerant."""
    if not Sponsor or not _table_exists(Sponsor):
        return None
    q = db.session.query(Sponsor)
    q = _not_deleted_filter(q, Sponsor)
    q = _approved_filter(q, Sponsor)
    q = _apply_org_filter(q, Sponsor, org_id)
    q = _order_by_recent(q, Sponsor)
    return q


def _sum_sponsor_amounts(org_id: Optional[int] = None) -> float:
    """Sum sponsor amounts safely even if schema varies."""
    if not Sponsor or not _table_exists(Sponsor):
        return 0.0
    try:
        if hasattr(Sponsor, "amount"):
            q = db.session.query(func.coalesce(func.sum(Sponsor.amount), 0.0))  # type: ignore[attr-defined]
            q = _not_deleted_filter(q, Sponsor)
            q = _approved_filter(q, Sponsor)
            q = _apply_org_filter(q, Sponsor, org_id)
            return float(q.scalar() or 0.0)

        # Fallback: iterate
        items = (_sponsor_query(org_id=org_id) or db.session.query(Sponsor)).all()
        return float(sum((getattr(s, "amount", 0) or 0) for s in items))
    except Exception:
        current_app.logger.exception("Failed to compute total_raised")
        return 0.0


def _count(model: Any, org_id: Optional[int] = None, **filters) -> int:
    """Count records if model/table exists; otherwise 0 (schema-tolerant)."""
    if not model or not _table_exists(model):
        return 0
    try:
        q = db.session.query(model)
        q = _apply_org_filter(q, model, org_id)
        for k, v in filters.items():
            if hasattr(model, k):
                q = q.filter(getattr(model, k) == v)
        return int(q.count())
    except Exception:
        current_app.logger.exception("Count failed for %s", getattr(model, "__name__", "Model"))
        return 0


def _active_goal(org_id: Optional[int] = None) -> Optional[Any]:
    """
    Return most recent active goal, preferring org-scoped goals when possible.
    Works with new CampaignGoal shape (org_id primary; team_id nullable).
    """
    if not CampaignGoal or not _table_exists(CampaignGoal):
        return None
    try:
        q = db.session.query(CampaignGoal)

        # org-first if possible
        if org_id is not None and hasattr(CampaignGoal, "org_id"):
            q = q.filter(CampaignGoal.org_id == org_id)  # type: ignore[attr-defined]

        active_col = _first_attr(CampaignGoal, ("active", "is_active"))
        if active_col is not None:
            q = q.filter(active_col.is_(True))  # type: ignore[attr-defined]

        q = _order_by_recent(q, CampaignGoal)
        return q.first()
    except Exception:
        current_app.logger.exception("Active goal lookup failed")
        return None


def _goal_amount_dollars(goal: Any) -> float:
    """
    Normalize goal amount across schemas:
      - goal_amount (cents)
      - amount/value (dollars)
    """
    if not goal:
        return 0.0
    try:
        if hasattr(goal, "goal_amount"):
            return float(getattr(goal, "goal_amount", 0) or 0) / 100.0
        if hasattr(goal, "amount"):
            return float(getattr(goal, "amount", 0) or 0)
        if hasattr(goal, "value"):
            return float(getattr(goal, "value", 0) or 0)
    except Exception:
        pass
    return 0.0


def _as_dict_sponsor(s: Any) -> Dict[str, Any]:
    """Serialize sponsor with graceful fallbacks."""
    if hasattr(s, "as_dict"):
        try:
            return s.as_dict()  # type: ignore[attr-defined]
        except Exception:
            pass

    created = _first_attr(s, ("created_at", "updated_at"))
    return {
        "id": getattr(s, "id", None),
        "org_id": getattr(s, "org_id", None),
        "name": getattr(s, "name", None),
        "email": getattr(s, "email", None),
        "amount": float(getattr(s, "amount", 0) or 0),
        "status": getattr(s, "status", None),
        "created_at": (created.isoformat() if getattr(created, "isoformat", None) else None),
    }


def send_slack_alert_async(message: str) -> None:
    """Fire-and-forget Slack webhook with short timeout (non-blocking)."""
    webhook = current_app.config.get("SLACK_WEBHOOK_URL") or os.getenv("SLACK_WEBHOOK_URL")
    if not webhook:
        return

    def _post():
        try:
            import requests  # local import to avoid hard dep in some envs

            requests.post(webhook, json={"text": message}, timeout=5)
        except Exception as exc:
            current_app.logger.warning("Slack alert failed: %s", exc)

    threading.Thread(target=_post, daemon=True).start()


# ── Admin: before_request guard (optional) ───────────────────────────────────
@admin.before_request
def _admin_guard():
    if request.endpoint and request.endpoint.startswith("admin."):
        if current_user is not None and not _require_admin_guard():
            flash("Please sign in with an admin account.", "warning")
            return redirect(url_for("main.home"))


# ───────────────────────────────
# 🧭 ADMIN DASHBOARD
# ───────────────────────────────
@admin.route("/")
@login_required
def dashboard():
    org_id = _get_org_id()
    sponsors: List[Any] = []
    transactions: List[Any] = []

    # Recent sponsors
    if Sponsor and _table_exists(Sponsor):
        try:
            q = db.session.query(Sponsor)
            q = _not_deleted_filter(q, Sponsor)
            q = _apply_org_filter(q, Sponsor, org_id)
            q = _order_by_recent(q, Sponsor)
            sponsors = q.limit(10).all()
        except Exception:
            current_app.logger.exception("Failed loading recent sponsors")

    # Recent transactions
    if Transaction and _table_exists(Transaction):
        try:
            q = db.session.query(Transaction)
            q = _apply_org_filter(q, Transaction, org_id)
            q = _order_by_recent(q, Transaction)
            transactions = q.limit(10).all()
        except Exception:
            current_app.logger.exception("Failed loading recent transactions")

    goal = _active_goal(org_id=org_id)

    pending = _count(Sponsor, org_id=org_id, status="pending") if Sponsor else 0
    approved = _count(Sponsor, org_id=org_id, status="approved") if Sponsor else 0

    stats = {
        "org_id": org_id,
        "total_raised": _sum_sponsor_amounts(org_id=org_id),
        "sponsor_count": _count(Sponsor, org_id=org_id) if Sponsor else 0,
        "pending_sponsors": pending,
        "approved_sponsors": approved,
        "goal_amount": _goal_amount_dollars(goal),
    }

    return render_template(
        "admin/dashboard.html",
        sponsors=sponsors,
        transactions=transactions,
        goal=goal,
        stats=stats,
    )


# ───────────────────────────────
# 👥 SPONSOR MANAGEMENT
# ───────────────────────────────
@admin.route("/sponsors")
@login_required
def sponsors_list():
    org_id = _get_org_id()
    sponsors: List[Any] = []
    q_text = (request.args.get("q") or "").strip()

    if not Sponsor or not _table_exists(Sponsor):
        return render_template("admin/sponsors.html", sponsors=sponsors)

    try:
        q = db.session.query(Sponsor)
        q = _not_deleted_filter(q, Sponsor)
        q = _apply_org_filter(q, Sponsor, org_id)
        if q_text and hasattr(Sponsor, "name"):
            q = q.filter(getattr(Sponsor, "name").ilike(f"%{q_text}%"))
        q = _order_by_recent(q, Sponsor)
        sponsors = q.all()
    except Exception:
        current_app.logger.exception("Failed loading sponsors list")
        sponsors = []

    return render_template("admin/sponsors.html", sponsors=sponsors)


@admin.route("/sponsors/approve/<int:sponsor_id>", methods=["POST"])
@login_required
def approve_sponsor(sponsor_id: int):
    if not Sponsor or not _table_exists(Sponsor):
        flash("Sponsors table is unavailable.", "warning")
        return redirect(url_for("admin.sponsors_list"))

    sponsor = db.session.get(Sponsor, sponsor_id)  # SA 2.x style
    if not sponsor:
        flash("Sponsor not found.", "warning")
        return redirect(url_for("admin.sponsors_list"))

    if hasattr(sponsor, "status"):
        sponsor.status = "approved"
    try:
        db.session.commit()
        flash(f"Sponsor '{getattr(sponsor, 'name', 'Unknown')}' approved!", "success")
        amount_val = float(getattr(sponsor, "amount", 0) or 0)
        send_slack_alert_async(
            f"🎉 New Sponsor Approved: *{getattr(sponsor, 'name', 'Anonymous')}* (${amount_val:,.2f})"
        )
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Approve sponsor failed")
        flash("Could not approve sponsor.", "danger")

    return redirect(url_for("admin.sponsors_list"))


@admin.route("/sponsors/delete/<int:sponsor_id>", methods=["POST"])
@login_required
def delete_sponsor(sponsor_id: int):
    if not Sponsor or not _table_exists(Sponsor):
        flash("Sponsors table is unavailable.", "warning")
        return redirect(url_for("admin.sponsors_list"))

    sponsor = db.session.get(Sponsor, sponsor_id)
    if not sponsor:
        flash("Sponsor not found.", "warning")
        return redirect(url_for("admin.sponsors_list"))

    # Support both schemas
    try:
        if hasattr(sponsor, "deleted_at"):
            sponsor.deleted_at = func.now()  # type: ignore[attr-defined]
        elif hasattr(sponsor, "deleted"):
            sponsor.deleted = True  # type: ignore[attr-defined]
    except Exception:
        pass

    try:
        db.session.commit()
        flash(f"Sponsor '{getattr(sponsor, 'name', 'Unknown')}' deleted.", "warning")
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Delete sponsor failed")
        flash("Could not delete sponsor.", "danger")

    return redirect(url_for("admin.sponsors_list"))


# ───────────────────────────────
# 💸 EXPORT PAYOUTS CSV
# ───────────────────────────────
@admin.route("/payouts/export")
@login_required
def export_payouts():
    """
    CSV of approved sponsors (Name, Email, Amount, Approved Date).
    Tolerant to missing columns; never 500s.
    """
    org_id = _get_org_id()

    if not Sponsor or not _table_exists(Sponsor):
        return Response("Name,Email,Amount,Approved Date\n", mimetype="text/csv")

    try:
        q = db.session.query(Sponsor)
        q = _approved_filter(q, Sponsor)
        q = _not_deleted_filter(q, Sponsor)
        q = _apply_org_filter(q, Sponsor, org_id)
        items = q.all()
    except Exception:
        current_app.logger.exception("Export CSV query failed")
        items = []

    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["Name", "Email", "Amount", "Approved Date"])

    for s in items:
        name = getattr(s, "name", "") or ""
        email = getattr(s, "email", "") or ""
        amount = float(getattr(s, "amount", 0) or 0)
        approved_at = _first_attr(s, ("approved_at", "updated_at", "created_at"))
        try:
            approved_str = approved_at.strftime("%Y-%m-%d") if approved_at else ""
        except Exception:
            approved_str = str(approved_at or "")
        writer.writerow([name, email, f"{amount:.2f}", approved_str])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=approved_sponsor_payouts.csv"},
    )


# ───────────────────────────────
# 🎯 CAMPAIGN GOAL MANAGEMENT
# ───────────────────────────────
@admin.route("/goals", methods=["GET", "POST"])
@login_required
def goals():
    org_id = _get_org_id()

    if not CampaignGoal or not _table_exists(CampaignGoal):
        flash("Goals are unavailable in this environment.", "warning")
        return render_template("admin/goals.html", goal=None)

    goal = _active_goal(org_id=org_id)

    if request.method == "POST":
        raw = (request.form.get("amount") or "").strip()
        try:
            amount_dollars = float(Decimal(raw))
            if amount_dollars < 0:
                raise ValueError("negative")
        except Exception:
            flash("Invalid amount.", "danger")
            return redirect(url_for("admin.goals", org_id=org_id) if org_id else url_for("admin.goals"))

        goal_cents = int(round(amount_dollars * 100))

        try:
            # Deactivate others if supported (org-scoped if possible)
            q = db.session.query(CampaignGoal)
            if org_id is not None and hasattr(CampaignGoal, "org_id"):
                q = q.filter(CampaignGoal.org_id == org_id)  # type: ignore[attr-defined]

            if hasattr(CampaignGoal, "active"):
                q.update({CampaignGoal.active: False})  # type: ignore[arg-type]
            elif hasattr(CampaignGoal, "is_active"):
                q.update({CampaignGoal.is_active: False})  # type: ignore[arg-type]

            if goal:
                # cents-first
                if hasattr(goal, "goal_amount"):
                    goal.goal_amount = goal_cents
                elif hasattr(goal, "amount"):
                    goal.amount = amount_dollars
                if hasattr(goal, "active"):
                    goal.active = True
                elif hasattr(goal, "is_active"):
                    goal.is_active = True
            else:
                fields: Dict[str, Any] = {}
                if hasattr(CampaignGoal, "org_id") and org_id is not None:
                    fields["org_id"] = org_id
                # team_id intentionally NOT required anymore (nullable in your new model)
                if hasattr(CampaignGoal, "goal_amount"):
                    fields["goal_amount"] = goal_cents
                    fields.setdefault("total", 0)
                elif hasattr(CampaignGoal, "amount"):
                    fields["amount"] = amount_dollars
                if hasattr(CampaignGoal, "active"):
                    fields["active"] = True
                elif hasattr(CampaignGoal, "is_active"):
                    fields["is_active"] = True

                goal = CampaignGoal(**fields)  # type: ignore[arg-type]
                db.session.add(goal)

            db.session.commit()
            flash("Campaign goal updated!", "success")
        except Exception:
            db.session.rollback()
            current_app.logger.exception("Updating goal failed")
            flash("Failed to update goal.", "danger")

        return redirect(url_for("admin.goals", org_id=org_id) if org_id else url_for("admin.goals"))

    return render_template("admin/goals.html", goal=goal)


# ───────────────────────────────
# 💳 TRANSACTIONS
# ───────────────────────────────
@admin.route("/transactions")
@login_required
def transactions_list():
    org_id = _get_org_id()
    txs: List[Any] = []

    if Transaction and _table_exists(Transaction):
        try:
            q = db.session.query(Transaction)
            q = _apply_org_filter(q, Transaction, org_id)
            q = _order_by_recent(q, Transaction)
            txs = q.all()
        except Exception:
            current_app.logger.exception("Failed loading transactions")

    return render_template("admin/transactions.html", transactions=txs)


# ───────────────────────────────
# 🧪 EXAMPLE SOFT DELETE / RESTORE API
# ───────────────────────────────
def _example_by_uuid(uuid: str):
    if not Example or not _table_exists(Example):
        return None
    try:
        if hasattr(Example, "by_uuid"):
            return Example.by_uuid(uuid)  # type: ignore[attr-defined]
        if hasattr(Example, "uuid"):
            return db.session.query(Example).filter(Example.uuid == uuid).first()
    except Exception:
        current_app.logger.exception("Example lookup failed")
    return None


@api.route("/example/<uuid>/delete", methods=["POST"])
def example_soft_delete(uuid: str):
    ex = _example_by_uuid(uuid)
    if not ex:
        return jsonify({"error": "Not found"}), 404
    try:
        if hasattr(ex, "soft_delete"):
            ex.soft_delete()  # type: ignore[attr-defined]
        elif hasattr(ex, "deleted_at"):
            ex.deleted_at = func.now()  # type: ignore[attr-defined]
        elif hasattr(ex, "deleted"):
            ex.deleted = True  # type: ignore[attr-defined]
        db.session.commit()
        return jsonify({"message": f"{getattr(ex, 'name', 'Example')} soft-deleted."})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Soft delete failed")
        return jsonify({"error": "Delete failed"}), 500


@api.route("/example/<uuid>/restore", methods=["POST"])
def example_restore(uuid: str):
    ex = _example_by_uuid(uuid)
    if not ex:
        return jsonify({"error": "Not found"}), 404
    try:
        if hasattr(ex, "restore"):
            ex.restore()  # type: ignore[attr-defined]
        elif hasattr(ex, "deleted_at"):
            ex.deleted_at = None  # type: ignore[attr-defined]
        elif hasattr(ex, "deleted"):
            ex.deleted = False  # type: ignore[attr-defined]
        db.session.commit()
        return jsonify({"message": f"{getattr(ex, 'name', 'Example')} restored."})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Restore failed")
        return jsonify({"error": "Restore failed"}), 500


# ───────────────────────────────
# 🌐 PUBLIC/INTERNAL APIs (JSON)
# ───────────────────────────────
@api.route("/sponsors/approved")
def api_approved_sponsors():
    org_id = _get_org_id()
    items: List[Any] = []

    if Sponsor and _table_exists(Sponsor):
        try:
            q = db.session.query(Sponsor)
            q = _approved_filter(q, Sponsor)
            q = _not_deleted_filter(q, Sponsor)
            q = _apply_org_filter(q, Sponsor, org_id)
            items = q.all()
        except Exception:
            current_app.logger.exception("Approved sponsors API failed")
            items = []

    return jsonify([_as_dict_sponsor(s) for s in items])

