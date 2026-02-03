from __future__ import annotations

# -----------------------------------------------------------------------------
# SponsorClick — click beacons from sponsor surfaces (wall/spotlight/drawer).
# - Soft deletes + timestamps
# - IPv6-safe addresses
# - Minimal useful indexes
# -----------------------------------------------------------------------------
from typing import Any, Dict

from sqlalchemy import Index

from app.extensions import db

from .mixins import SoftDeleteMixin, TimestampMixin


class SponsorClick(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sponsor_clicks"
    __table_args__ = (
        Index("ix_clicks_created", "created_at"),
        Index("ix_clicks_tenant_surface", "tenant", "surface"),
        Index("ix_clicks_name", "name"),
    )
    id = db.Column(db.Integer, primary_key=True)
    # tenancy + display context
    tenant = db.Column(
        db.String(120), nullable=True, index=True, doc="Team/tenant slug"
    )
    name = db.Column(
        db.String(255), nullable=True, index=True, doc="Sponsor display name"
    )
    surface = db.Column(
        db.String(64),
        nullable=True,
        index=True,
        doc="spotlight | wall | drawer | hero | meter",
    )
    # destination + client data
    url = db.Column(db.Text, nullable=True, doc="Target URL (may include UTM params)")
    ua = db.Column(db.Text, nullable=True, doc="User-Agent string")
    ip = db.Column(db.String(45), nullable=True, doc="Client IP (IPv4/IPv6)")
    referrer = db.Column(db.Text, nullable=True, doc="HTTP Referer seen by server")
    # Optional loose bag for future fields (campaign, experiment, etc.)
    meta = db.Column(db.JSON, nullable=True)

    # ---- Convenience ----
    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "tenant": self.tenant,
            "name": self.name,
            "surface": self.surface,
            "url": self.url,
            "ua": self.ua,
            "ip": self.ip,
            "referrer": self.referrer,
            "meta": self.meta or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }

    def __repr__(self) -> str:  # pragma: no cover
        surface = self.surface or "?"
        return f"<SponsorClick {self.tenant or '-'}:{surface}:{self.name or '-'}>"
