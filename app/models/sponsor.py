# ──────────────────────────────────────────────────────────────────────────────
# Sponsor model — represents a sponsor/donor for campaigns or teams. Features - Stripe/PayPal–friendly cents-based amounts (integer, non-negative)- Tier classification (Platinum, Gold, Silver, Bronze, Supporter)- Soft deletes + timestamps (via your mixins)- Automatic CampaignGoal sync on insert/update- SQLAlchemy 2.0 typing (Mapped / mapped_column)
# ──────────────────────────────────────────────────────────────────────────────
from datetime import datetime
from typing import Any, Dict, Final, Optional

from flask import g
from sqlalchemy import (CheckConstraint, ForeignKey, Index, Integer, String,
                        Text, event, select)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.org import Org

from .mixins import SoftDeleteMixin, TimestampMixin

# ──────────────────────────────────────────────────────────────────────────────
# Constants / Config
# ──────────────────────────────────────────────────────────────────────────────

SPONSOR_STATUSES: Final[tuple[str, ...]] = (
    "pending",
    "paid",
    "completed",
    "success",
    "refunded",
    "failed",
)

SPONSOR_TIERS: Final[tuple[str, ...]] = (
    "Platinum",
    "Gold",
    "Silver",
    "Bronze",
    "Supporter",
)

TIER_THRESHOLDS: Final[tuple[tuple[int, str], ...]] = (
    (5000, "Platinum"),
    (2500, "Gold"),
    (1000, "Silver"),
    (500, "Bronze"),
)

# ──────────────────────────────────────────────────────────────────────────────
# Model
# ──────────────────────────────────────────────────────────────────────────────


class Sponsor(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sponsors"

    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_sponsors_amount_nonneg"),
        Index("ix_sponsors_status_amount", "status", "amount"),
        Index("ix_sponsors_org", "org_id"),
    )

    # ── Identifiers ────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # ── Relationships ───────────────────────────────────────────────
    org_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("orgs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        doc="Owning Org (tenant/team/school)",
    )
    org: Mapped[Optional["Org"]] = relationship(
        "Org", back_populates="sponsors", lazy="joined"
    )

    team_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Optional: Team this sponsor is supporting",
    )
    team: Mapped[Optional["Team"]] = relationship(
        "Team",
        back_populates="sponsors",
        lazy="joined",
    )

    # ── Financials ────────────────────────────────────────────────
    amount: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        doc="Donation amount in cents (int)",
    )

    status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
        index=True,
        doc=f"Payment status: {', '.join(SPONSOR_STATUSES)}",
    )

    tier: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
        doc="Platinum / Gold / Silver / Bronze / Supporter (auto-derived if not set)",
    )

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ───────────────────────────────────────────────────────────────
    # Helpers / Properties
    # ───────────────────────────────────────────────────────────────

    def __repr__(self) -> str:
        return (
            f"<Sponsor id={self.id} name={self.name!r} "
            f"amount=${self.amount_dollars:.2f} status={self.status} "
            f"tier={self.tier or self.computed_tier}>"
        )

    @property
    def amount_dollars(self) -> float:
        return (self.amount or 0) / 100.0

    def set_amount_dollars(self, dollars: float) -> None:
        self.amount = max(0, int(round(float(dollars) * 100)))

    @property
    def computed_tier(self) -> str:
        """Derive tier from amount_dollars if `tier` is not explicitly set."""
        if self.tier:
            return self.tier
        amt = self.amount_dollars
        for threshold, label in TIER_THRESHOLDS:
            if amt >= threshold:
                return label
        return "Supporter"

    def auto_assign_tier(self) -> None:
        if not self.tier:
            self.tier = self.computed_tier

    def normalize(self) -> None:
        """Clamp, sanitize, and validate fields before persistence."""
        if self.amount is None or self.amount < 0:
            self.amount = 0
        if not self.status or self.status not in SPONSOR_STATUSES:
            self.status = "pending"
        if self.name:
            self.name = self.name.strip()

    def as_dict(
        self, include_team: bool = False, include_org: bool = False
    ) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "team_id": self.team_id,
            "org_id": self.org_id,
            "amount_cents": self.amount,
            "amount_dollars": self.amount_dollars,
            "status": self.status,
            "tier": self.computed_tier,
            "notes": self.notes,
            "created_at": (
                self.created_at.isoformat()
                if isinstance(self.created_at, datetime)
                else None
            ),
            "updated_at": (
                self.updated_at.isoformat()
                if isinstance(self.updated_at, datetime)
                else None
            ),
        }

        if include_team and self.team:
            data["team"] = {
                "id": self.team.id,
                "name": getattr(self.team, "team_name", None),
                "slug": getattr(self.team, "slug", None),
            }

        if include_org and self.org:
            data["org"] = {
                "id": self.org.id,
                "slug": self.org.slug,
                "team_name": self.org.team_name,
                "brand_color": self.org.brand_color,
            }

        return data


# ──────────────────────────────────────────────────────────────────────────────
# Event Listeners
# ──────────────────────────────────────────────────────────────────────────────


@event.listens_for(Sponsor, "before_insert")
@event.listens_for(Sponsor, "before_update")
def _sponsor_before_save(mapper, connection, target: Sponsor) -> None:
    """Normalize, auto-tier, and auto-assign org context before save."""
    if getattr(g, "org", None) and not target.org_id:
        target.org_id = g.org.id
    target.normalize()
    target.auto_assign_tier()


@event.listens_for(Sponsor, "after_insert")
@event.listens_for(Sponsor, "after_update")
def _sponsor_after_save(mapper, connection, target: Sponsor) -> None:
    """Auto-sync CampaignGoal progress if applicable."""
    if not target.team_id:
        return

    try:
        from .campaign_goal import CampaignGoal  # local import avoids cycles
    except Exception:
        return

    sess = db.session.object_session(target)
    if not sess:
        return

    active_goal = sess.execute(
        select(CampaignGoal)
        .where(CampaignGoal.team_id == target.team_id, CampaignGoal.active.is_(True))
        .order_by(CampaignGoal.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    if active_goal:
        try:
            active_goal.update_progress_from_donations(commit=False)
        except Exception:
            # Never break persistence flow
            pass
