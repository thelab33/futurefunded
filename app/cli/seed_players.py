import click
from faker import Faker

from app.extensions import db
from app.models.player import Player
from app.models.team import Team

fake = Faker()


@click.command("seed-players")
@click.option(
    "--count", default=10, show_default=True, help="Number of players to seed."
)
@click.option("--clear", is_flag=True, help="Clear existing players first.")
def seed_players(count, clear):
    """Seed demo players."""
    if clear:
        deleted = Player.query.delete()
        db.session.commit()
        click.secho(f"🧹 Cleared {deleted} players", fg="yellow")

    teams = Team.query.all()
    if not teams:
        click.secho("⚠️ No teams found — seed teams first!", fg="red")
        return

    roles = ["Guard", "Forward", "Center"]
    for _ in range(count):
        db.session.add(
            Player(
                name=fake.name(),
                role=fake.random_element(roles),
                photo_url=f"https://i.pravatar.cc/200?img={fake.random_int(1, 70)}",
                team_id=fake.random_element(teams).id,
            )
        )
    db.session.commit()
    click.secho(f"✅ Seeded {count} players", fg="green")
