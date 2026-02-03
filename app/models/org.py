from __future__ import annotations

from typing import Optional

from app.extensions import db
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Org(db.Model, TimestampMixin, SoftDeleteMixin):
    """Represents an organization, team, or club within the fundraiser platform."""

    __tablename__ = "orgs"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(80), unique=True, nullable=False, index=True)
    team_name = db.Column(db.String(120), nullable=True)
    league_name = db.Column(db.String(120), nullable=True)
    mission_statement = db.Column(db.Text, nullable=True)
    brand_color = db.Column(db.String(20), nullable=True)
    goal_cents = db.Column(db.Integer, default=0)

    donations = db.relationship(
        "Donation", back_populates="org", lazy="dynamic", cascade="all, delete-orphan"
    )
    sponsors = db.relationship(
        "Sponsor", back_populates="org", lazy="dynamic", cascade="all, delete-orphan"
    )
    campaign_goals = db.relationship(
        "CampaignGoal",
        back_populates="org",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Org slug={self.slug!r} team={self.team_name!r}>"

    def to_dict(self) -> dict[str, str | int | None]:
        """Serialize org to a JSON-safe dict for APIs or seed previews."""
        return {
            "id": self.id,
            "slug": self.slug,
            "team_name": self.team_name,
            "league_name": self.league_name,
            "mission_statement": self.mission_statement,
            "brand_color": self.brand_color,
            "goal_cents": self.goal_cents,
        }

    @classmethod
    def get_by_slug(cls, slug: str) -> Optional[Org]:
        """Retrieve an organization by its unique slug."""
        return cls.query.filter_by(slug=slug).first()

    @classmethod
    def create_default(cls) -> Org:
        """Create and commit a demo organization if none exist."""
        if cls.query.count() == 0:
            demo = cls(
                slug="demo-org",
                team_name="Demo Team",
                league_name="Demo League",
                mission_statement="Helping youth programs reach their goals.",
                brand_color="#3366ff",
                goal_cents=500_000,  # $5,000
            )
            db.session.add(demo)
            db.session.commit()
            return demo
        return cls.query.first()
