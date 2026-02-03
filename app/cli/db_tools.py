# app/cli/db_tools.py
from flask.cli import AppGroup

from app.extensions import db
from app.models import CampaignGoal, Team

dbcli = AppGroup("dbtools")


@dbcli.command("init-local")
def init_local():
    """Create all tables & a default team + active goal."""
    from app import create_app

    app = create_app()
    with app.app_context():
        # db.create_all()  # DISABLED by starforge: use Alembic
        team = Team.get_or_create_default()
        if not CampaignGoal.query.filter_by(team_id=team.id, active=True).first():
            db.session.add(
                CampaignGoal(goal_amount=1000000, active=True, team_id=team.id)
            )  # $10,000 in cents
            db.session.commit()
        print("✅ DB initialized; default team + active goal ensured.")
