from __future__ import annotations

# app/models/shoutout.py
from datetime import datetime
from decimal import Decimal

from app.extensions import db

from .mixins import TimestampMixin


class Shoutout(TimestampMixin, db.Model):
    __tablename__ = "shoutouts"
    id = db.Column(db.Integer, primary_key=True)
    sponsor_name = db.Column(db.String(255), nullable=False)
    message = db.Column(db.String(512))
    amount = db.Column(db.Numeric(10, 2), default=Decimal(0))
    tier = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Shoutout {self.sponsor_name} ${self.amount}>"
