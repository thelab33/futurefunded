import uuid as _uuid
from datetime import datetime
from typing import Any, Dict, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, ForeignKey, Integer, String, Index, event
from sqlalchemy.orm import Mapped, mapped_column, object_session, relationship

from app.extensions import db


class CampaignGoal(db.Model):
    __tablename__ = "campaign_goals"
    __table_args__ = (
        # Fast lookup for "active goal for org"
        Index("ix_campaign_goals_org_active", "org_id", "active"),
        # Guardrails
        sa.CheckConstraint("goal_amount >= 0", name="ck_campaign_goals_goal_amount_nonneg"),
        sa.CheckConstraint("total >= 0", name="ck_campaign_goals_total_nonneg"),
    )

    # ── Keys ────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    uuid: Mapped[str] = mapped_column(
        String(36),
        unique=True,
        nullable=False,
        default=lambda: str(_uuid.uuid4()),
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        db.DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    # ── Tenant / scope ──────────────────────────────────────────
    org_id: Mapped[int] = mapped_column(
        ForeignKey("orgs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Tenant scope (required)",
    )

    # Optional: org-level goals are allowed (team_id NULL)
    team_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Optional legacy team scope",
    )

    # ── Money (cents) ───────────────────────────────────────────
    goal_amount: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, doc="Fundraising goal in cents"
    )

    total: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, doc="Cached total raised in cents"
    )

    # ── Status ──────────────────────────────────────────────────
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    # ── Relationships ───────────────────────────────────────────
    org = relationship(
        "Org",
        back_populates="campaign_goals",
        lazy="joined",
        passive_deletes=True,
    )

    team = relationship(
        "Team",
        back_populates="campaign_goals",
        lazy="joined",
        passive_deletes=True,
    )

    # IMPORTANT:
    # If Donation.campaign_goal_id uses ondelete="SET NULL", do NOT use delete-orphan.
    donations = relationship(
        "Donation",
        back_populates="campaign_goal",
        lazy="selectin",
        passive_deletes=True,
    )

    # ── Computed helpers ────────────────────────────────────────
    @property
    def goal_dollars(self) -> float:
        return round(int(self.goal_amount or 0) / 100.0, 2)

    @property
    def raised_dollars(self) -> float:
        return round(int(self.total or 0) / 100.0, 2)

    @property
    def remaining_cents(self) -> int:
        return max(0, int(self.goal_amount or 0) - int(self.total or 0))

    @property
    def remaining_dollars(self) -> float:
        return round(self.remaining_cents / 100.0, 2)

    @property
    def percent_raised(self) -> float:
        g = int(self.goal_amount or 0)
        return 0.0 if g <= 0 else round((int(self.total or 0) / g) * 100.0, 1)

    def percent_complete(self) -> int:
        return int(self.percent_raised)

    @property
    def is_complete(self) -> bool:
        g = int(self.goal_amount or 0)
        return g > 0 and int(self.total or 0) >= g

    # ── Mutators ────────────────────────────────────────────────
    def add_amount(self, amount_cents: int) -> None:
        if isinstance(amount_cents, int) and amount_cents > 0:
            self.total = int(self.total or 0) + amount_cents

    def reset_progress(self) -> None:
        self.total = 0

    # ── Recompute cached total from donations ───────────────────
    def update_progress_from_donations(self, commit: bool = False) -> int:
        """
        Recompute cached total from paid/succeeded donations for this goal.
        Returns the new total (cents).
        """
        sess = object_session(self) or db.session

        try:
            from .donation import Donation  # local import to avoid circulars

            amount_col = getattr(Donation, "amount_cents", None) or getattr(Donation, "amount", None)
            if amount_col is None:
                raise RuntimeError("Donation amount column not found (expected amount_cents or amount)")

            status_col = getattr(Donation, "provider_status", None) or getattr(Donation, "status", None)
            paid_at_col = getattr(Donation, "paid_at", None)

            stmt = sa.select(sa.func.coalesce(sa.func.sum(amount_col), 0)).where(
                Donation.campaign_goal_id == self.id
            )

            # Prefer status filtering if available; otherwise fall back to paid_at
            if status_col is not None:
                stmt = stmt.where(status_col.in_(("paid", "succeeded", "success", "completed")))
            elif paid_at_col is not None:
                stmt = stmt.where(paid_at_col.is_not(None))

            total_cents = int(sess.execute(stmt).scalar_one() or 0)

        except Exception:
            # Safe fallback: keep current cached total if Donation isn't available/matching
            total_cents = int(self.total or 0)

        self.total = max(0, total_cents)

        if commit:
            sess.commit()

        return self.total

    # ── Serialization ───────────────────────────────────────────
    def as_dict(self, include_team: bool = False, include_org: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "uuid": self.uuid,
            "org_id": self.org_id,
            "team_id": self.team_id,
            "goal_amount_cents": int(self.goal_amount or 0),
            "total_raised_cents": int(self.total or 0),
            "goal_dollars": self.goal_dollars,
            "raised_dollars": self.raised_dollars,
            "remaining_dollars": self.remaining_dollars,
            "percent_raised": self.percent_raised,
            "is_complete": self.is_complete,
            "active": bool(self.active),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

        if include_org and getattr(self, "org", None):
            data["org"] = {
                "id": self.org.id,
                "slug": getattr(self.org, "slug", None),
                "name": getattr(self.org, "team_name", None) or getattr(self.org, "name", None),
            }

        if include_team and getattr(self, "team", None):
            data["team"] = {
                "id": self.team.id,
                "slug": getattr(self.team, "slug", None),
                "name": getattr(self.team, "team_name", None) or getattr(self.team, "name", None),
            }

        return data

    def __repr__(self) -> str:
        return (
            f"<CampaignGoal {self.uuid} org={self.org_id} team={self.team_id} "
            f"goal=${self.goal_dollars:,.2f} raised=${self.raised_dollars:,.2f} "
            f"{'ACTIVE' if self.active else 'INACTIVE'}>"
        )


@event.listens_for(CampaignGoal, "before_insert")
def _cg_before_insert(mapper, connection, target) -> None:
    target.goal_amount = max(0, int(target.goal_amount or 0))
    target.total = max(0, int(target.total or 0))


@event.listens_for(CampaignGoal, "before_update")
def _cg_before_update(mapper, connection, target) -> None:
    target.goal_amount = max(0, int(target.goal_amount or 0))
    target.total = max(0, int(target.total or 0))

