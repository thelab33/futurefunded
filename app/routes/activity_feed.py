from flask import Blueprint, jsonify
from datetime import datetime, timezone

bp = Blueprint("activity_feed", __name__, url_prefix="/api")

@bp.get("/activity-feed")
def activity_feed():
    now = datetime.now(timezone.utc).isoformat()
    return jsonify({
        "items": [
            {
                "kind": "donation",
                "name": "Founding family",
                "amount": 100,
                "player_name": None,
                "created_at": now,
                "time_ago": "Just now",
            },
            {
                "kind": "sponsor",
                "name": "Community sponsor",
                "amount": None,
                "player_name": None,
                "created_at": now,
                "time_ago": "6m ago",
            },
            {
                "kind": "player_sponsor",
                "name": "Alumni donor",
                "amount": 75,
                "player_name": "#12",
                "created_at": now,
                "time_ago": "12m ago",
            },
        ]
    })
