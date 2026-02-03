from __future__ import annotations

"""
User model — FundChamps SaaS authentication & role management.
"""
import uuid

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db

from .mixins import SoftDeleteMixin, TimestampMixin


class User(db.Model, UserMixin, TimestampMixin, SoftDeleteMixin):
    """
    FundChamps SaaS User:
      • Secure auth (Flask-Login compatible)
      • Admin flag + soft ban via is_active
      • Timestamps + soft delete for audits
      • Optional multi-tenant Team association
    """

    __tablename__ = "users"
    # ── Identity ────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(
        db.String(36),
        unique=True,
        nullable=False,
        default=lambda: str(uuid.uuid4()),
        index=True,
        doc="Publicly-safe unique identifier",
    )
    # ── Auth ────────────────────────────────────────────────────
    email = db.Column(
        db.String(255),
        unique=True,
        nullable=False,
        index=True,
        doc="User's email address",
    )
    password_hash = db.Column(
        db.String(255),
        nullable=False,
        doc="Hashed password (never store plaintext)",
    )
    # ── Roles/Status ────────────────────────────────────────────
    is_admin = db.Column(
        db.Boolean,
        default=False,
        nullable=False,
        doc="Admin user flag",
    )
    is_active = db.Column(
        db.Boolean,
        default=True,
        nullable=False,
        doc="Account enabled/disabled (soft ban)",
    )
    name = db.Column(
        db.String(120),
        nullable=True,
        doc="Display name (for dashboard/UI); optional",
    )
    # ── Multi-tenant link ───────────────────────────────────────
    team_id = db.Column(
        db.Integer,
        db.ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Related team/org if using multi-tenancy",
    )
    team = db.relationship("Team", backref="users", lazy="select")

    # ── Auth helpers ────────────────────────────────────────────
    def set_password(self, password: str) -> None:
        """Hash & store the given plaintext password securely."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """Verify a plaintext password against the stored hash."""
        return check_password_hash(self.password_hash, password)

    # Flask-Login expects this; using the DB PK is fine here.
    def get_id(self) -> str:  # type: ignore[override]
        return str(self.id)

    # ── Display helpers ─────────────────────────────────────────
    @property
    def display_role(self) -> str:
        return "Admin" if self.is_admin else "Sponsor"

    @property
    def display_name(self) -> str:
        return self.name or (
            self.email.split("@")[0] if self.email else f"User-{self.id}"
        )

    # ── Repr ────────────────────────────────────────────────────
    def __repr__(self) -> str:  # pragma: no cover
        role = "Admin" if self.is_admin else "Sponsor"
        return f"<User {self.email} ({role})>"
