import click
from faker import Faker
from werkzeug.security import generate_password_hash

from app.extensions import db

fake = Faker()


@click.group()
def starforge():
    """Starforge CLI tools."""
    pass


@starforge.command("seed-demo")
@click.option("--users", default=5, show_default=True)
@click.option("--sponsors", default=8, show_default=True)
@click.option("--players", default=10, show_default=True)
@click.option("--teams", default=1, show_default=True)
@click.option("--clear", is_flag=True)
def seed_demo(users, sponsors, players, teams, clear):
    """Seed demo data."""
    from app import create_app
    from app.models import (CampaignGoal, Player, Sponsor, Team,  # lazy import
                            User)

    app = create_app()
    with app.app_context():
        if clear:
            _clear_data()
        team_objs = _seed_teams(teams, Team)
        _seed_users(users, team_objs, User)
        _seed_players(players, team_objs, Player)
        _seed_sponsors(sponsors, team_objs, Sponsor)
        _ensure_campaign_goals(team_objs, CampaignGoal)
        db.session.commit()
        click.secho("✅ Demo data seeded!", fg="bright_green", bold=True)


@starforge.command("seed-players")
@click.option("--count", default=5, show_default=True)
@click.option("--clear", is_flag=True)
def seed_players_cmd(count, clear):
    """Seed demo players only."""
    from app import create_app
    from app.models import Player, Team  # lazy import

    app = create_app()
    with app.app_context():
        if clear:
            deleted = Player.query.delete()
            click.secho(f"🧹 Cleared {deleted} players", fg="yellow")
        team_objs = Team.query.all()
        _seed_players(count, team_objs, Player)
        db.session.commit()
        click.secho(f"✅ Seeded {count} players!", fg="bright_green", bold=True)


# ---------- Helpers ----------
def _clear_data():
    """Clear demo data across core models."""
    click.secho("🧹 Clearing demo data…", fg="yellow")
    from app.models import (CampaignGoal, Player, Sponsor,  # local import
                            Team, User)

    for model in (Sponsor, User, Player, Team, CampaignGoal):
        deleted = model.query.delete()
        click.secho(f"  ↳ {deleted} {model.__name__} removed", fg="yellow")
    db.session.commit()


def _seed_teams(count, Team):
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


def _seed_users(count, teams, User):
    pwd_hash = generate_password_hash("demo123")
    for _ in range(count):
        db.session.add(
            User(
                email=fake.unique.email(),
                password_hash=pwd_hash,
                is_admin=fake.boolean(20),
                team_id=fake.random_element(teams).id if teams else None,
            )
        )


def _seed_players(count, teams, Player):
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


def _seed_sponsors(count, teams, Sponsor):
    tiers = ["Bronze", "Silver", "Gold", "Platinum", "VIP"]
    for _ in range(count):
        db.session.add(
            Sponsor(
                name=fake.company(),
                amount=fake.random_int(min=100, max=5000),
                status="approved",
                deleted=False,
                tier=fake.random_element(tiers) if hasattr(Sponsor, "tier") else None,
                team_id=fake.random_element(teams).id if teams else None,
            )
        )


def _ensure_campaign_goals(teams, CampaignGoal):
    for team in teams:
        if not CampaignGoal.query.filter_by(team_id=team.id, active=True).first():
            db.session.add(
                CampaignGoal(goal_amount=10000, active=True, team_id=team.id)
            )


__all__ = ["starforge"]
