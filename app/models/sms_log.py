from __future__ import annotations

# -----------------------------------------------------------------------------
# SMSLog — records inbound/outbound SMS interactions for auditing & analytics.
# - Uses cents-safe patterns elsewhere (not needed here)
# - Soft deletes + timestamps via mixins
# - Direction + status fields for analytics
# - Provider metadata hooks
# -----------------------------------------------------------------------------
from typing import Any, Dict

from sqlalchemy import CheckConstraint

from app.extensions import db

from .mixins import SoftDeleteMixin, TimestampMixin


class SMSLog(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sms_logs"
    __table_args__ = (
        CheckConstraint("length(from_number) <= 32", name="ck_sms_from_len"),
        CheckConstraint("length(to_number)   <= 32", name="ck_sms_to_len"),
        # REMOVED duplicate:         Index("ix_sms_logs_created", "created_at"),
        # REMOVED duplicate:         Index("ix_sms_logs_direction", "direction"),
        # REMOVED duplicate:         Index("ix_sms_logs_status", "status"),
        # REMOVED duplicate:         Index("ix_sms_logs_to", "to_number"),
        # REMOVED duplicate:         Index("ix_sms_logs_from", "from_number"),
    )
    id = db.Column(db.Integer, primary_key=True)
    # Core parties
    from_number = db.Column(
        db.String(32), nullable=True, index=True, doc="Sender phone"
    )
    to_number = db.Column(
        db.String(32), nullable=False, index=True, doc="Recipient phone"
    )
    # Message content
    message_body = db.Column(
        db.Text, nullable=True, doc="Inbound or outbound message body"
    )
    response_body = db.Column(db.Text, nullable=True, doc="AI/system reply (if any)")
    # Flow meta
    direction = db.Column(  # inbound | outbound
        db.String(16),
        nullable=False,
        default="inbound",
        index=True,
        doc="Message direction: inbound | outbound",
    )
    status = db.Column(  # queued|sent|delivered|failed
        db.String(24),
        nullable=False,
        default="queued",
        index=True,
        doc="Delivery status: queued|sent|delivered|failed",
    )
    ai_used = db.Column(
        db.Boolean, nullable=False, default=False, doc="Was AI used to generate reply?"
    )
    error = db.Column(
        db.Text, nullable=True, doc="Error details if AI or delivery failed"
    )
    # Provider correlation (Twilio/others)
    provider = db.Column(db.String(32), nullable=True, index=True)
    provider_message_id = db.Column(db.String(80), nullable=True, index=True)
    provider_error_code = db.Column(db.String(32), nullable=True)
    # Optional free-form metadata (JSON)
    meta = db.Column(db.JSON, nullable=True, doc="Provider payload / extra diagnostics")

    # ---- Convenience ----
    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "from": self.from_number,
            "to": self.to_number,
            "direction": self.direction,
            "status": self.status,
            "message_body": self.message_body,
            "response_body": self.response_body,
            "ai_used": bool(self.ai_used),
            "error": self.error,
            "provider": self.provider,
            "provider_message_id": self.provider_message_id,
            "provider_error_code": self.provider_error_code,
            "meta": self.meta or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<SMSLog {self.direction} {self.from_number or 'N/A'}→{self.to_number} status={self.status} ai={self.ai_used}>"
