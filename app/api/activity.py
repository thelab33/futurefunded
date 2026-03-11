
from flask import Blueprint, jsonify

bp = Blueprint("activity", __name__, url_prefix="/api")

@bp.get("/activity-feed")
def activity_feed():
    return jsonify({"events": []})
