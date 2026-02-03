# app/cli/starforge_seed.py
# =============================================================================
# Starforge Seeder CLI
# Elite-grade demo data generator for FundChamps SaaS / PaaS.
# Creates Users, Teams, Players, Sponsors, and CampaignGoals.
# Stripe/PayPal–friendly (cents-based), safe defaults, and easy clear/reset.
# =============================================================================

import click
from faker import Faker
from flask.cli import AppGroup
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import CampaignGoal, Player, Sponsor, Team, User

# 🎯 CLI Group
starforge = AppGroup("starforge")
fake = Faker()


@starforge.command("seed-demo")
@click.option(
    "--users", default=5, show_default=True, help="Number of demo users to create."
)
@click.option(
    "--sponsors",
    default=8,
    show_default=True,
    help="Number of demo sponsors to create.",
)
@click.option(
    "--players", default=10, show_default=True, help="Number of demo players to create."
)
@click.option(
    "--teams", default=1, show_default=True, help="Number of demo teams to create."
)
@click.option("--clear", is_flag=True, help="Clear existing demo data before seeding.")
def seed_demo_cmd(
    users: int, sponsors: int, players: int, teams: int, clear: bool
) -> None:
    """
    🌱 Seed demo data for FundChamps PaaS.
    Generates realistic Users, Players, Sponsors, and CampaignGoals — ready for live demos.
    """
    from app import create_app

    app = create_app()
    with app.app_context():
        # db.create_all()  # DISABLED by starforge: use Alembic

        if clear:
            _clear_demo_data()

        try:
            with db.session.begin():
                team_objs = _seed_teams(teams)
                _seed_users(users, team_objs)
                _seed_players(players, team_objs)
                _seed_sponsors(sponsors, team_objs)
                _ensure_campaign_goals(team_objs)

            click.secho(
                "✅ Demo data seeded successfully!", fg="bright_green", bold=True
            )
            click.echo("🔐 Demo password for all users: demo123")
        except SQLAlchemyError as e:
            db.session.rollback()
            click.secho(f"❌ Seeding failed: {e}", fg="red", bold=True)


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------


def _clear_demo_data() -> None:
    click.secho("🧹 Clearing existing data…", fg="yellow")
    for model in (Sponsor, User, Player, Team, CampaignGoal):
        deleted = model.query.delete()
        click.secho(f"  ↳ Cleared {deleted} {model.__name__}(s)", fg="yellow")
    db.session.commit()


def _seed_teams(count: int) -> list[Team]:
    click.secho(f"🏀 Seeding {count} team(s)…", fg="green")
    teams: list[Team] = []
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


def _seed_users(count: int, teams: list[Team]) -> None:
    click.secho(f"👤 Seeding {count} user(s)…", fg="green")
    demo_password_hash = generate_password_hash("demo123")
    for _ in range(count):
        db.session.add(
            User(
                email=fake.unique.email(),
                password_hash=demo_password_hash,
                is_admin=fake.boolean(chance_of_getting_true=20),
                team_id=fake.random_element(teams).id if teams else None,
            )
        )


def _seed_players(count: int, teams: list[Team]) -> None:
    click.secho(f"🏅 Seeding {count} player(s)…", fg="green")
    roles = ["Guard", "Forward", "Center"]
    for _ in range(count):
        db.session.add(
            Player(
                name=fake.name(),
                role=fake.random_element(roles),
                photo_url=f"https://i.pravatar.cc/200?img={fake.random_int(1, 70)}",
                team_id=fake.random_element(teams).id if teams else None,
            )
        )


def _seed_sponsors(count: int, teams: list[Team]) -> None:
    click.secho(f"💸 Seeding {count} sponsor(s)…", fg="green")
    for _ in range(count):
        # Sponsor model: amount is *cents*, status must be valid
        amount_cents = fake.random_int(min=1000, max=20000)  # $10–$200
        sponsor = Sponsor(
            name=fake.company(),
            amount=amount_cents,
            status=fake.random_element(["pending", "paid", "completed", "success"]),
            notes=fake.catch_phrase(),
            team_id=fake.random_element(teams).id if teams else None,
        )
        sponsor.auto_assign_tier()
        db.session.add(sponsor)


def _ensure_campaign_goals(teams: list[Team]) -> None:
    click.secho("🎯 Ensuring campaign goals per team…", fg="green")
    for team in teams:
        if not CampaignGoal.query.filter_by(team_id=team.id, active=True).first():
            db.session.add(
                CampaignGoal(
                    goal_amount=500000, active=True, team_id=team.id
                )  # $5,000 goal
            )
