# app/models/mixins.py
"""Shared SQLAlchemy mixins for timestamps and soft deletes."""

from datetime import datetime

from sqlalchemy import event

from app.extensions import db


class TimestampMixin:
    """Adds created_at and updated_at columns with auto-refresh behavior."""

    created_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False, index=True
    )
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        index=True,
    )

    @staticmethod
    def _set_updated_at(mapper, connection, target):
        """Ensure updated_at is always refreshed before update."""
        target.updated_at = datetime.utcnow()

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, "before_update", cls._set_updated_at)


class SoftDeleteMixin:
    """Adds soft-delete support with deleted flag and deleted_at timestamp."""

    deleted = db.Column(db.Boolean, default=False, nullable=False, index=True)
    deleted_at = db.Column(db.DateTime, nullable=True, index=True)

    def soft_delete(self, commit: bool = True) -> None:
        """Mark the record as deleted without removing it from DB."""
        self.deleted = True
        self.deleted_at = datetime.utcnow()
        if commit:
            db.session.commit()

    def restore(self, commit: bool = True) -> None:
        """Restore a previously soft-deleted record."""
        self.deleted = False
        self.deleted_at = None
        if commit:
            db.session.commit()

    @classmethod
    def active(cls):
        """Return only non-deleted records."""
        return cls.query.filter_by(deleted=False)

    @classmethod
    def trashed(cls):
        """Return only soft-deleted records."""
        return cls.query.filter_by(deleted=True)
