import random

import click
from faker import Faker
from sqlalchemy.inspection import inspect
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models.campaign_goal import CampaignGoal
from app.models.player import Player
from app.models.sponsor import Sponsor
from app.models.team import Team
from app.models.user import User

fake = Faker()


@click.group()
def starforge():
    """Starforge CLI tools."""
    pass


@starforge.command("seed-demo")
@click.option("--users", default=5, show_default=True, help="Number of demo users.")
@click.option(
    "--sponsors", default=8, show_default=True, help="Number of demo sponsors."
)
@click.option(
    "--players", default=10, show_default=True, help="Number of demo players."
)
@click.option("--teams", default=1, show_default=True, help="Number of demo teams.")
@click.option("--clear", is_flag=True, help="Clear existing demo data first.")
def seed_demo(users, sponsors, players, teams, clear):
    """🌱 Seed demo data for FundChamps."""
    from app import create_app

    app = create_app()
    with app.app_context():
        # db.create_all()  # DISABLED by starforge: use Alembic
        if clear:
            _clear_data()

        with db.session.begin():
            team_objs = _seed_teams(teams)
            _seed_users(users, team_objs)
            _seed_players(players, team_objs)
            _seed_sponsors(sponsors, team_objs)
            _ensure_campaign_goals(team_objs)

        click.secho("✅ Demo data seeded!", fg="bright_green", bold=True)


def _clear_data():
    click.secho("🧹 Clearing demo data…", fg="yellow")
    for model in (Sponsor, User, Player, Team, CampaignGoal):
        deleted = model.query.delete()
        click.secho(f"  ↳ {deleted} {model.__name__} removed", fg="yellow")
    db.session.commit()


def _seed_teams(count):
    teams = []
    for _ in range(count):
        team = Team(
            slug=fake.unique.slug(),
            team_name=f"{fake.city()} {fake.word().capitalize()}",
            meta_description=fake.sentence(nb_words=10),
            theme_color=fake.hex_color(),
        )
        db.session.add(team)
        teams.append(team)
    return teams


def _seed_users(count, teams):
    pwd_hash = generate_password_hash("demo123")
    valid_cols = {c.key for c in inspect(User).mapper.column_attrs}
    for _ in range(count):
        data = {
            "email": fake.unique.email(),
            "password_hash": pwd_hash,
            "is_admin": fake.boolean(20),
        }
        if "team_id" in valid_cols and teams:
            data["team_id"] = random.choice(teams).id
        db.session.add(User(**data))


def _seed_players(count, teams):
    roles = ["Guard", "Forward", "Center"]
    valid_cols = {c.key for c in inspect(Player).mapper.column_attrs}
    for _ in range(count):
        data = {
            "name": fake.name(),
            "role": fake.random_element(roles),
            "photo_url": f"https://i.pravatar.cc/200?img={fake.random_int(1, 70)}",
        }
        if "team_id" in valid_cols and teams:
            data["team_id"] = random.choice(teams).id
        db.session.add(Player(**data))


def _seed_sponsors(count, teams):
    valid_cols = {c.key for c in inspect(Sponsor).mapper.column_attrs}
    for _ in range(count):
        data = {
            "name": fake.company(),
            "amount": fake.random_int(min=100, max=5000),
            "status": "approved",
            "deleted": False,
        }
        if "team_id" in valid_cols and teams:
            data["team_id"] = random.choice(teams).id
        db.session.add(Sponsor(**data))


def _ensure_campaign_goals(teams):
    """Ensure each team has an active campaign goal, if model supports team_id."""
    valid_cols = {c.key for c in inspect(CampaignGoal).mapper.column_attrs}

    for idx, team in enumerate(teams):
        filters = {}
        if "team_id" in valid_cols:
            filters["team_id"] = team.id
        if "active" in valid_cols:
            filters["active"] = True

        exists = CampaignGoal.query.filter_by(**filters).first()
        if not exists:
            data = {}
            if "goal_amount" in valid_cols:
                data["goal_amount"] = 10000
            if "active" in valid_cols:
                data["active"] = True
            if "team_id" in valid_cols:
                data["team_id"] = team.id

            # Fallback: if no team_id column, only seed once
            if "team_id" not in valid_cols and idx > 0:
                continue

            db.session.add(CampaignGoal(**data))
