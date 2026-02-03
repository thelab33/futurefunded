# -----------------------------------------------------------------------------
# CampaignGoal Model
# Fundraising target for a team/season; stores cents (Stripe-friendly).
# SQLAlchemy 2.0 typing; non-negative guards; joined relationship to Team.
# -----------------------------------------------------------------------------

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Tuple

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    event,
    select,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, object_session

from app.extensions import db
from .mixins import TimestampMixin, SoftDeleteMixin

class CampaignGoal(db.Model):
    __tablename__ = "campaign_goals"
    __table_args__ = {"extend_existing": True}  # ✅ prevent duplicate mapping

    id = db.Column(db.Integer, primary_key=True)
    goal_amount = db.Column(db.Float, nullable=False, default=10000.0)
    description = db.Column(db.String(255), nullable=True)

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )

    # ── Keys ────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[str] = mapped_column(
        String(36),
        unique=True,
        nullable=False,
        default=lambda: str(uuid.uuid4()),
        index=True,
    )

    # ── Foreign key ─────────────────────────────────────────────
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Make sure Team.campaign_goals uses back_populates="campaign_goals"
    team: Mapped["Team"] = relationship(
        "Team",
        back_populates="campaign_goals",
        lazy="joined",
        passive_deletes=True,
    )

    # ── Money (cents) ───────────────────────────────────────────
    goal_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0, doc="cents")
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, doc="cents")

    # ── Status ──────────────────────────────────────────────────
    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
    )

    # ── Computed ────────────────────────────────────────────────
    @property
    def goal_dollars(self) -> float:
        return round((self.goal_amount or 0) / 100.0, 2)

    @property
    def raised_dollars(self) -> float:
        return round((self.total or 0) / 100.0, 2)

    @property
    def remaining_cents(self) -> int:
        return max(0, int(self.goal_amount or 0) - int(self.total or 0))

    @property
    def remaining_dollars(self) -> float:
        return round(self.remaining_cents / 100.0, 2)

    @property
    def percent_raised(self) -> float:
        g = int(self.goal_amount or 0)
        if g <= 0:
            return 0.0
        return round((int(self.total or 0) / g) * 100.0, 1)

    def percent_complete(self) -> int:
        return int(self.percent_raised)

    @property
    def is_complete(self) -> bool:
        g = int(self.goal_amount or 0)
        t = int(self.total or 0)
        return g > 0 and t >= g

    def progress_tuple(self) -> Tuple[float, float, float]:
        return (self.raised_dollars, self.goal_dollars, self.percent_raised)

    # ── Mutators ────────────────────────────────────────────────
    def add_amount(self, amount_cents: int) -> None:
        if isinstance(amount_cents, int) and amount_cents > 0:
            self.total = int(self.total or 0) + amount_cents

    def reset_progress(self) -> None:
        self.total = 0

    def update_progress_from_donations(self, commit: bool = True) -> None:
        """
        Sum eligible incoming funds for this team (in cents). Supports both
        Donation and Sponsor models if present; ignores soft-deleted rows.
        """
        sess = object_session(self) or db.session

        total_cents = 0

        # ---- Donations -------------------------------------------------------
        try:
            from .donation import Donation  # type: ignore

            deleted_col = getattr(Donation, "deleted", None)
            deleted_at_col = getattr(Donation, "deleted_at", None)

            # Adjust status list to match your domain
            valid_donation_statuses = ("paid", "succeeded", "completed", "success")

            stmt = select(func.coalesce(func.sum(Donation.amount), 0)).where(
                Donation.team_id == self.team_id,
                Donation.status.in_(valid_donation_statuses),
            )
            if deleted_col is not None:
                stmt = stmt.where(deleted_col.is_(False))
            elif deleted_at_col is not None:
                stmt = stmt.where(deleted_at_col.is_(None))

            total_cents += int(sess.execute(stmt).scalar_one() or 0)
        except Exception:
            # Donation model may not exist in some deployments
            pass

        # ---- Sponsors --------------------------------------------------------
        try:
            from .sponsor import Sponsor  # type: ignore

            deleted_col = getattr(Sponsor, "deleted", None)
            deleted_at_col = getattr(Sponsor, "deleted_at", None)

            valid_sponsor_statuses = ("paid", "completed", "success")

            stmt = select(func.coalesce(func.sum(Sponsor.amount), 0)).where(
                Sponsor.team_id == self.team_id,
                Sponsor.status.in_(valid_sponsor_statuses),
            )
            if deleted_col is not None:
                stmt = stmt.where(deleted_col.is_(False))
            elif deleted_at_col is not None:
                stmt = stmt.where(deleted_at_col.is_(None))

            total_cents += int(sess.execute(stmt).scalar_one() or 0)
        except Exception:
            # Sponsor model may not exist in some deployments
            pass

        self.total = max(0, int(total_cents))

        if commit:
            sess.commit()

    # ── Helpers / Queries ───────────────────────────────────────
    @classmethod
    def get_active_for_team(cls, team_id: int) -> "CampaignGoal | None":
        return db.session.execute(
            select(cls).where(cls.team_id == team_id, cls.active.is_(True)).limit(1)
        ).scalars().first()

    @classmethod
    def set_active_goal(cls, team_id: int, goal_amount_cents: int) -> "CampaignGoal":
        """
        Deactivate any existing active goal for the team and create a new one.
        """
        sess = db.session
        sess.execute(
            db.update(cls)
            .where(cls.team_id == team_id, cls.active.is_(True))
            .values(active=False)
        )
        goal = cls(team_id=team_id, goal_amount=max(0, int(goal_amount_cents)), total=0, active=True)
        sess.add(goal)
        sess.commit()
        return goal

    # ── Serialization ───────────────────────────────────────────
    def as_dict(self, include_team: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "uuid": self.uuid,
            "team_id": self.team_id,
            "goal_amount_cents": int(self.goal_amount or 0),
            "total_raised_cents": int(self.total or 0),
            "remaining_cents": self.remaining_cents,
            "goal_dollars": self.goal_dollars,
            "raised_dollars": self.raised_dollars,
            "remaining_dollars": self.remaining_dollars,
            "percent_raised": self.percent_raised,
            "percent_complete": self.percent_complete(),
            "is_complete": self.is_complete,
            "active": bool(self.active),
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else None,
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else None,
        }
        if include_team and self.team:
            data["team"] = {
                "id": self.team.id,
                "name": getattr(self.team, "team_name", None),
                "slug": getattr(self.team, "slug", None),
            }
        return data

    def __repr__(self) -> str:  # pragma: no cover
        status = "ACTIVE" if self.active else "INACTIVE"
        return (
            f"<CampaignGoal {self.uuid} Team={self.team_id} "
            f"Goal=${self.goal_dollars:,.2f} Raised=${self.raised_dollars:,.2f} "
            f"({self.percent_raised}% – {status})>"
        )


# ── Guards to keep values non-negative ─────────────────────────
@event.listens_for(CampaignGoal, "before_insert")
def _cg_before_insert(mapper, connection, target: CampaignGoal):
    target.goal_amount = max(0, int(target.goal_amount or 0))
    target.total = max(0, int(target.total or 0))


@event.listens_for(CampaignGoal, "before_update")
def _cg_before_update(mapper, connection, target: CampaignGoal):
    target.goal_amount = max(0, int(target.goal_amount or 0))
    target.total = max(0, int(target.total or 0))

