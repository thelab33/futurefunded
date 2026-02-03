from __future__ import annotations

import uuid
from typing import Any, Dict

from app.extensions import db

from .mixins import SoftDeleteMixin, TimestampMixin


class Player(db.Model, TimestampMixin, SoftDeleteMixin):
    """An AAU player on the roster."""

    __tablename__ = "players"

    # ── Identity ────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(
        db.String(36),
        unique=True,
        nullable=False,
        default=lambda: str(uuid.uuid4()),
        index=True,
    )
    name = db.Column(db.String(120), nullable=False, index=True)
    role = db.Column(db.String(64))
    photo_url = db.Column(db.String(255))

    # ── FK ──────────────────────────────────────────────────────
    team_id = db.Column(
        db.Integer,
        db.ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Symmetric with Team.players (back_populates) to avoid backref collisions
    team = db.relationship(
        "Team",
        back_populates="players",
        lazy="joined",
    )

    # ── Repr / Serialize ────────────────────────────────────────
    def __repr__(self) -> str:  # pragma: no cover
        return f"<Player {self.name} ({self.role or 'N/A'})>"

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "uuid": self.uuid,
            "name": self.name,
            "role": self.role,
            "photo_url": self.photo_url,
            "team_id": self.team_id,
            "team_name": getattr(self.team, "team_name", None) if self.team else None,
            "created_at": (
                self.created_at.isoformat()
                if getattr(self, "created_at", None)
                else None
            ),
            "updated_at": (
                self.updated_at.isoformat()
                if getattr(self, "updated_at", None)
                else None
            ),
            "deleted": bool(getattr(self, "deleted", False)),
            "deleted_at": (
                self.deleted_at.isoformat()
                if getattr(self, "deleted_at", None)
                else None
            ),
        }
