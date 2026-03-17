# app/blueprints/team_api.py
from flask import Blueprint, request, jsonify, current_app, abort
from flask_login import login_required, current_user
from app.extensions import db
from app.models import Team

bp = Blueprint("team_api", __name__, url_prefix="/api")

@bp.route("/team/<int:team_id>/theme", methods=["POST"])
@login_required
def set_team_theme(team_id):
    team = Team.query.get_or_404(team_id)
    if not hasattr(current_user, "can_manage_team") or not current_user.can_manage_team(team):
        abort(403)
    data = request.get_json(force=True)
    theme = data.get("theme")
    brand = data.get("brand")
    allowed = current_app.config.get("FF_ALLOWED_THEMES", ["core", "signal-glass", "school-spirit"])
    if theme not in allowed:
        return jsonify({"ok": False, "error": "invalid_theme"}), 400
    team.theme = theme
    team.brand = brand
    db.session.add(team)
    db.session.commit()
    return jsonify({"ok": True, "theme": team.theme, "brand": team.brand})
