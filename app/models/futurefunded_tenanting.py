from __future__ import annotations

from datetime import datetime

try:
    from app.extensions import db
except Exception:  # pragma: no cover
    from app import db  # type: ignore


def utcnow() -> datetime:
    return datetime.utcnow()


class Tenant(db.Model):
    __tablename__ = "ff_tenants"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(160), nullable=False, unique=True, index=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    org_type = db.Column(db.String(64), nullable=False, default="Youth team")
    owner_email = db.Column(db.String(255), nullable=False, index=True)

    public_slug = db.Column(db.String(160), unique=True, index=True, nullable=True)
    status = db.Column(db.String(32), nullable=False, default="draft", index=True)

    brand_primary = db.Column(db.String(7), nullable=False, default="#0ea5e9")
    brand_accent = db.Column(db.String(7), nullable=False, default="#f97316")
    logo_url = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True)
    published_at = db.Column(db.DateTime, nullable=True)
    archived_at = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)

    users = db.relationship(
        "TenantUser",
        back_populates="tenant",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )
    drafts = db.relationship(
        "OnboardingDraft",
        back_populates="tenant",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    __table_args__ = (
        db.Index("ix_ff_tenants_owner_status", "owner_email", "status"),
    )


class TenantUser(db.Model):
    __tablename__ = "ff_tenant_users"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("ff_tenants.id"), nullable=False, index=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    role = db.Column(db.String(32), nullable=False, default="owner", index=True)
    is_owner = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    tenant = db.relationship("Tenant", back_populates="users")

    __table_args__ = (
        db.UniqueConstraint("tenant_id", "email", name="uq_ff_tenant_users_tenant_email"),
        db.Index("ix_ff_tenant_users_email_role", "email", "role"),
    )


class OnboardingDraft(db.Model):
    __tablename__ = "ff_onboarding_drafts"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("ff_tenants.id"), nullable=False, index=True)

    slug = db.Column(db.String(160), nullable=False, unique=True, index=True)
    owner_email = db.Column(db.String(255), nullable=False, index=True)

    source = db.Column(db.String(128), nullable=False, default="futurefunded_onboarding_wizard")
    version = db.Column(db.Integer, nullable=False, default=4)

    status = db.Column(db.String(32), nullable=False, default="draft", index=True)
    public_slug = db.Column(db.String(160), unique=True, index=True, nullable=True)

    org_name = db.Column(db.String(255), nullable=False, index=True)
    org_type = db.Column(db.String(64), nullable=False, default="Youth team")
    contact_name = db.Column(db.String(255), nullable=False)
    contact_email = db.Column(db.String(255), nullable=False)

    headline = db.Column(db.String(255), nullable=False)
    goal = db.Column(db.Integer, nullable=False, default=12000)
    deadline = db.Column(db.String(32), nullable=False)
    checkout = db.Column(db.String(64), nullable=False, default="Stripe + PayPal")

    brand_primary = db.Column(db.String(7), nullable=False, default="#0ea5e9")
    brand_accent = db.Column(db.String(7), nullable=False, default="#f97316")
    logo_url = db.Column(db.Text, nullable=True)

    payload_json = db.Column(db.JSON, nullable=False, default=dict)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True)
    published_at = db.Column(db.DateTime, nullable=True)
    archived_at = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)

    tenant = db.relationship("Tenant", back_populates="drafts")

    __table_args__ = (
        db.Index("ix_ff_onboarding_drafts_owner_status", "owner_email", "status"),
        db.Index("ix_ff_onboarding_drafts_tenant_status", "tenant_id", "status"),
    )
