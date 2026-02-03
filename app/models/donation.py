from __future__ import annotations
from datetime import datetime  # already present

# -----------------------------------------------------------------------------
# Donation Model — Prestige Tier
# Cents-based, tier auto-derivation, optional team/goal/org links,
# and CampaignGoal sync on insert/update/delete.
# -----------------------------------------------------------------------------
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from flask import g
from sqlalchemy import CheckConstraint, Index, event, select
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.org import Org

from .mixins import SoftDeleteMixin, TimestampMixin

DONATION_TIERS = ("Platinum", "Gold", "Silver", "Bronze", "Supporter")


class Donation(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "donations"
    __table_args__ = (
        CheckConstraint("amount_cents >= 0", name="ck_donations_amount_nonneg"),
        Index("ix_donations_team_status", "team_id", "deleted_at"),
        Index("ix_donations_goal", "campaign_goal_id"),
        Index("ix_donations_org", "org_id"),  # ⚡ speeds up multi-tenant filtering
    )
    # ---- Identifiers ----
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(db.String(160), nullable=False)
    email: Mapped[str] = mapped_column(db.String(160), nullable=False, index=True)
    # ---- Sponsorship Tier ----
    tier: Mapped[Optional[str]] = mapped_column(
        db.String(40),
        nullable=True,
        index=True,
        doc="Platinum / Gold / Silver / Bronze / Supporter (auto-derived if not set)",
    )
    # ---- Financials (cents) ----
    amount_cents: Mapped[int] = mapped_column(
        db.Integer,
        default=0,
        nullable=False,
        doc="Donation amount in cents (Stripe/PayPal safe)",
    )
    # ---- Media ----
    logo_path: Mapped[Optional[str]] = mapped_column(
        db.String(255),
        nullable=True,
        doc="Optional donor logo path or URL for ticker display",
    )
    # ---- Relationships ----
    org_id: Mapped[Optional[int]] = mapped_column(
        db.ForeignKey("orgs.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
        doc="Owning Org (tenant)",
    )
    org: Mapped[Optional["Org"]] = relationship(
        "Org", back_populates="donations", lazy="joined"
    )
    team_id: Mapped[Optional[int]] = mapped_column(
        db.ForeignKey("teams.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    team: Mapped[Optional["Team"]] = relationship(
        "Team", back_populates="donations", lazy="joined"
    )
    campaign_goal_id: Mapped[Optional[int]] = mapped_column(
        db.ForeignKey("campaign_goals.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    campaign_goal: Mapped[Optional["CampaignGoal"]] = relationship(
        "CampaignGoal", back_populates="donations", lazy="joined"
    )
        # ---- Payment tracking (Stripe) ----
    currency: Mapped[str] = mapped_column(
        db.String(3),
        nullable=False,
        default="usd",
        doc="ISO currency (usd, cad, etc).",
    )

    provider: Mapped[str] = mapped_column(
        db.String(20),
        nullable=False,
        default="stripe",
        index=True,
        doc="Payment provider (stripe/paypal/etc).",
    )

    provider_intent_id: Mapped[Optional[str]] = mapped_column(
        db.String(120),
        nullable=True,
        unique=True,
        index=True,
        doc="Stripe PaymentIntent ID (pi_...).",
    )

    provider_status: Mapped[Optional[str]] = mapped_column(
        db.String(60),
        nullable=True,
        index=True,
        doc="Stripe status: requires_payment_method/succeeded/etc (or internal status).",
    )

    paid_at: Mapped[Optional[datetime]] = mapped_column(
        db.DateTime,
        nullable=True,
        doc="When we marked the donation as paid (webhook).",
    )

    note: Mapped[Optional[str]] = mapped_column(
        db.String(500),
        nullable=True,
        doc="Optional donor note/message.",
    )

    source: Mapped[Optional[str]] = mapped_column(
        db.String(60),
        nullable=True,
        doc="web, sms, admin, import, etc.",
    )


    # ==========================================================
    # Computed Properties
    # ==========================================================
    @property
    def amount_dollars(self) -> float:
        return round((self.amount_cents or 0) / 100.0, 2)

    @property
    def computed_tier(self) -> str:
        if self.tier:
            return self.tier
        amt = self.amount_dollars
        if amt >= 5000:
            return "Platinum"
        if amt >= 2500:
            return "Gold"
        if amt >= 1000:
            return "Silver"
        if amt >= 500:
            return "Bronze"
        return "Supporter"

    @property
    def short_name(self) -> str:
        parts = (self.name or "").split()
        if not parts:
            return "Anonymous"
        return f"{parts[0]} {parts[1][0]}." if len(parts) > 1 and parts[1] else parts[0]

    @property
    def milestone_badge(self) -> Optional[str]:
        amt = self.amount_dollars
        if amt >= 10000:
            return "💎 Mega Donor"
        if amt >= 5000:
            return "🏆 VIP"
        if amt >= 1000:
            return "🥇 Champion"
        return None

    @property
    def ui_theme_meta(self) -> Dict[str, Any]:
        tier_color_map = {
            "Platinum": "#e5e4e2",
            "Gold": "#ffd700",
            "Silver": "#c0c0c0",
            "Bronze": "#cd7f32",
            "Supporter": "#a3a3a3",
        }
        return {
            "color": tier_color_map.get(self.computed_tier, "#ffffff"),
            "glow": True,
            "pulse": self.computed_tier in ("Platinum", "Gold"),
        }

    # ==========================================================
    # Mutators / Validators
    # ==========================================================
    def set_amount_dollars(self, dollars: float) -> None:
        self.amount_cents = int(round((dollars or 0) * 100))

    def auto_assign_tier(self) -> None:
        if not self.tier:
            self.tier = self.computed_tier

    @staticmethod
    def _sanitize_logo_url(raw: Optional[str]) -> Optional[str]:
        if not raw:
            return None
        raw = raw.strip()
        if raw.startswith("/"):
            return raw
        p = urlparse(raw)
        if p.scheme in {"http", "https"} and p.netloc:
            return raw
        return f"/{raw}" if not raw.startswith("/") else raw

    # ==========================================================
    # Serialization
    # ==========================================================
    def as_dict(
        self, include_team: bool = False, include_org: bool = False
    ) -> Dict[str, Any]:
        data = {
            "id": self.id,
            "name": self.name,
            "short_name": self.short_name,
            "email": self.email,
            "tier": self.computed_tier,
            "amount_cents": int(self.amount_cents or 0),
            "amount_dollars": self.amount_dollars,
            "logo_path": self._sanitize_logo_url(self.logo_path),
            "milestone_badge": self.milestone_badge,
            "ui_theme": self.ui_theme_meta,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
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
            }
        return data

    # ==========================================================
    # Representation
    # ==========================================================
    def __repr__(self) -> str:  # pragma: no cover
        return f"<Donation {self.name} ${self.amount_dollars:,.2f} Tier={self.computed_tier}>"


# ──────────────────────────────────────────────────────────────────────────────
# Event Hooks: auto-org assignment + normalization + goal sync
# ──────────────────────────────────────────────────────────────────────────────
@event.listens_for(Donation, "before_insert")
@event.listens_for(Donation, "before_update")
def _donation_before_save(mapper, connection, target: Donation) -> None:
    # Auto-assign org_id if current Flask route has g.org
    if getattr(g, "org", None) and not target.org_id:
        target.org_id = g.org.id
    target.auto_assign_tier()
    target.logo_path = Donation._sanitize_logo_url(target.logo_path)


@event.listens_for(Donation, "after_insert")
@event.listens_for(Donation, "after_update")
@event.listens_for(Donation, "after_delete")
def _donation_after_change(mapper, connection, target: Donation) -> None:
    """Recalculate campaign goal progress whenever donations change."""
    if not target.campaign_goal_id:
        return
    try:
        from .campaign_goal import CampaignGoal  # avoid circular import

        sess = db.session.object_session(target)
        if sess:
            goal = sess.execute(
                select(CampaignGoal).where(CampaignGoal.id == target.campaign_goal_id)
            ).scalar_one_or_none()
            if goal:
                goal.update_progress_from_donations(commit=False)
    except Exception:
        pass
