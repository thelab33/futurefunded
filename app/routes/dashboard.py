
from flask import Blueprint, render_template
from sqlalchemy import func

from app.extensions import db
from app.models.donation import Donation
from app.models.futurefunded_tenanting import Tenant

bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

@bp.route("/<slug>")
def dashboard_home(slug):

    tenant = Tenant.query.filter_by(slug=slug).first_or_404()

    total = db.session.query(func.sum(Donation.amount_cents)).filter(
        Donation.org_id == tenant.id
    ).scalar() or 0

    donations = Donation.query.filter_by(org_id=tenant.id).order_by(
        Donation.created_at.desc()
    ).limit(10)

    return render_template(
        "dashboard.html",
        tenant=tenant,
        total=round(total / 100, 2),
        donations=donations
    )
