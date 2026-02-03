# app/models/campaign.py
from datetime import datetime
from app.extensions import db

class CampaignGoal(db.Model):
    __tablename__ = "campaign_goals"
    __table_args__ = {"extend_existing": True}  # ✅ prevent duplicate mapping

    id = db.Column(db.Integer, primary_key=True)
    goal_amount = db.Column(db.Float, nullable=False, default=10000.0)
    description = db.Column(db.String(255), nullable=True)

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )

    def __repr__(self):
        return f"<CampaignGoal ${self.goal_amount:.2f} created={self.created_at.date()}>"

