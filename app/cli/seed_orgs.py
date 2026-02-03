import click
from flask.cli import with_appcontext

from app.extensions import db


@click.command("seed-orgs")
@with_appcontext
def seed_orgs():
    # lazy import to prevent circular imports
    from app.models import Org
    from app.models.campaign_goal import CampaignGoal

    click.echo("🌱 Seeding demo orgs...")

    demo_orgs = [
        {
            "slug": "connect-atx-elite",
            "team_name": "Connect ATX Elite",
            "league_name": "12U AAU Basketball",
            "mission_statement": "Empowering youth through teamwork and community.",
            "brand_color": "#fbbf24",
            "goal_cents": 1_000_000,  # $10,000
        },
        {
            "slug": "eastside-hustle",
            "team_name": "Eastside Hustle",
            "league_name": "14U Select Baseball",
            "mission_statement": "Building discipline, respect, and love for the game.",
            "brand_color": "#22c55e",
            "goal_cents": 500_000,  # $5,000
        },
        {
            "slug": "lady-longhorns",
            "team_name": "Lady Longhorns",
            "league_name": "Girls Volleyball",
            "mission_statement": "Developing leaders on and off the court.",
            "brand_color": "#ef4444",
            "goal_cents": 750_000,  # $7,500
        },
    ]

    with db.session.begin():
        for data in demo_orgs:
            slug = data["slug"]

            org = Org.query.filter_by(slug=slug).first()
            if org:
                click.echo(f"🔁 Updating existing org: {org.slug}")
                # Update fields you care about (avoid overwriting unknown columns)
                for k in ("team_name", "league_name", "mission_statement", "brand_color", "goal_cents"):
                    if hasattr(org, k) and k in data:
                        setattr(org, k, data[k])
            else:
                org_kwargs = {k: v for k, v in data.items() if hasattr(Org, k)}
                org = Org(**org_kwargs)
                db.session.add(org)
                db.session.flush()
                click.echo(f"✨ Created new org: {org.slug}")

            # Ensure exactly one active goal per org
            existing_goal = (
                CampaignGoal.query.filter_by(org_id=org.id, active=True)
                .order_by(CampaignGoal.created_at.desc())
                .first()
            )

            if not existing_goal:
                goal = CampaignGoal(
                    org_id=org.id,
                    team_id=None,  # intentionally ignored
                    goal_amount=int(data["goal_cents"]),
                    total=0,
                    active=True,
                )
                db.session.add(goal)
                click.echo(f"   → Added CampaignGoal ${goal.goal_amount / 100:.0f} for {org.slug}")
            else:
                existing_goal.goal_amount = int(data["goal_cents"])
                click.echo(f"   → Updated active CampaignGoal to ${existing_goal.goal_amount / 100:.0f} for {org.slug}")

    click.echo("✅ Seeded demo orgs successfully.")

