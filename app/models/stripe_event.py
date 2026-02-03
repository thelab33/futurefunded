from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models.mixins import TimestampMixin


class StripeEvent(db.Model, TimestampMixin):
    __tablename__ = "stripe_events"
    __table_args__ = (
        Index("ix_stripe_events_type_created", "type", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    event_id: Mapped[str] = mapped_column(
        db.String(120),
        unique=True,
        index=True,
        nullable=False,
        doc="Stripe event id (evt_...)",
    )

    type: Mapped[str] = mapped_column(
        db.String(120),
        index=True,
        nullable=False,
        doc="Stripe event type (payment_intent.succeeded, etc)",
    )

    livemode: Mapped[bool] = mapped_column(
        db.Boolean,
        nullable=False,
        default=False,
    )

    object_id: Mapped[Optional[str]] = mapped_column(
        db.String(120),
        nullable=True,
        index=True,
        doc="Commonly PI id (pi_...) or session id (cs_...) if available",
    )

