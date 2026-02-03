from datetime import datetime

from app.extensions import db


class Example(db.Model):
    __tablename__ = "example"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    deleted = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __init__(self, name: str, description: str | None = None):
        self.name = name
        self.description = description

    def soft_delete(self):
        self.deleted = True

    def restore(self):
        self.deleted = False

    def __repr__(self):
        return f"<Example id={self.id} name={self.name!r} deleted={self.deleted}>"
