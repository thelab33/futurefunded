from flask import Blueprint, jsonify
from sqlalchemy.exc import OperationalError

from app.models.shoutout import Shoutout

bp = Blueprint("shoutouts", __name__)


@bp.get("/api/shoutouts")
def shoutouts():
    try:
        rows = Shoutout.query.order_by(Shoutout.created_at.desc()).limit(20).all()
    except OperationalError:
        rows = []
    return jsonify(
        [{"sponsor": r.sponsor_name, "msg": r.message, "tier": r.tier} for r in rows]
    )
