class _Stub: ...


# Added by aftercare_fixups.py
from datetime import datetime

try:
    from app.extensions import db
except Exception:  # minimal stub if db not ready
    db = None


class TimestampMixin:
    """Shared created/updated columns for models that want them."""

    if db:
        created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
        updated_at = db.Column(
            db.DateTime,
            default=datetime.utcnow,
            onupdate=datetime.utcnow,
            nullable=False,
        )
