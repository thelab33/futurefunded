from __future__ import annotations

from datetime import datetime
import json

from app.extensions import db


class SponsorLead(db.Model):
    __tablename__ = "sponsor_leads"

    id = db.Column(db.Integer, primary_key=True)

    status = db.Column(db.String(32), nullable=False, default="new", index=True)
    source = db.Column(db.String(64), nullable=False, default="launch-page", index=True)

    organization_name = db.Column(db.String(160), nullable=False, default="")
    campaign_name = db.Column(db.String(160), nullable=False, default="")

    sponsor_name = db.Column(db.String(160), nullable=False)
    business_name = db.Column(db.String(160), nullable=False, default="")
    email = db.Column(db.String(255), nullable=False, index=True)
    phone = db.Column(db.String(64), nullable=False, default="")
    website = db.Column(db.String(255), nullable=False, default="")

    tier_interest = db.Column(db.String(64), nullable=False, default="")
    budget = db.Column(db.String(64), nullable=False, default="")
    message = db.Column(db.Text, nullable=False, default="")

    page_url = db.Column(db.String(500), nullable=False, default="")
    referrer = db.Column(db.String(500), nullable=False, default="")
    notes_json = db.Column(db.Text, nullable=False, default="{}")

    contacted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    def set_notes(self, payload: dict) -> None:
        self.notes_json = json.dumps(payload or {}, ensure_ascii=False)

    def get_notes(self) -> dict:
        try:
            return json.loads(self.notes_json or "{}")
        except Exception:
            return {}

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status,
            "source": self.source,
            "organization_name": self.organization_name,
            "campaign_name": self.campaign_name,
            "sponsor_name": self.sponsor_name,
            "business_name": self.business_name,
            "email": self.email,
            "phone": self.phone,
            "website": self.website,
            "tier_interest": self.tier_interest,
            "budget": self.budget,
            "message": self.message,
            "page_url": self.page_url,
            "referrer": self.referrer,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<SponsorLead id={self.id} email={self.email!r} tier={self.tier_interest!r}>"
