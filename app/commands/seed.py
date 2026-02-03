"""
Seed commands for FundChamps.
Usage:
    flask seed orgs
"""

import click
from flask import current_app
from flask.cli import with_appcontext

from app.extensions import db
from app.models import Org


@click.group("seed")
def seed_cli():
    """Seed sample data (teams, orgs, etc.)"""
    pass


@seed_cli.command("orgs")
@with_appcontext
def seed_orgs():
    """Insert demo organizations for testing"""
    click.echo("🌱 Seeding demo orgs...")

    demo_orgs = [
        {
            "team_name": "Austin Mustangs",
            "slug": "mustangs",
            "league_name": "Texas Youth League",
            "brand_color": "#f59e0b",
            "logo_url": "/static/img/mustangs-logo.png",
            "goal_cents": 5000000,
        },
        {
            "team_name": "Denver Eagles",
            "slug": "eagles",
            "league_name": "Mountain Conference",
            "brand_color": "#1d4ed8",
            "logo_url": "/static/img/eagles-logo.png",
            "goal_cents": 7500000,
        },
        {
            "team_name": "Orlando Falcons",
            "slug": "falcons",
            "league_name": "Sunshine League",
            "brand_color": "#dc2626",
            "logo_url": "/static/img/falcons-logo.png",
            "goal_cents": 6000000,
        },
    ]

    for data in demo_orgs:
        existing = Org.query.filter_by(slug=data["slug"]).first()
        if existing:
            click.echo(f"⚠️  Skipping {data['team_name']} (already exists)")
            continue

        org = Org(**data)
        db.session.add(org)

    db.session.commit()
    click.echo("✅ Seeded demo orgs successfully.")
