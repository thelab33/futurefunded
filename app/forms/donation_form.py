"""
Donation form for sponsor tiers or custom contributions.
Supports optional logo upload for sponsor branding.
"""

from flask_wtf import FlaskForm
from wtforms import DecimalField, FileField, SelectField, StringField
from wtforms.validators import DataRequired, Email, NumberRange, Optional


class DonationForm(FlaskForm):
    name = StringField(
        "Name",
        validators=[DataRequired(message="Please enter your name.")],
        render_kw={"placeholder": "Full Name"},
    )
    email = StringField(
        "Email",
        validators=[DataRequired(message="Please enter your email."), Email()],
        render_kw={"placeholder": "name@example.com"},
    )
    amount = DecimalField(
        "Amount (USD)",
        places=2,
        validators=[
            DataRequired(message="Please enter an amount."),
            NumberRange(min=5, message="Minimum donation is $5."),
        ],
        render_kw={"placeholder": "50.00"},
    )
    tier = SelectField(
        "Tier",
        choices=[
            ("Bronze", "Bronze"),
            ("Silver", "Silver"),
            ("Gold", "Gold"),
            ("Platinum", "Platinum"),
            ("Custom", "Custom"),
        ],
        validators=[DataRequired()],
    )
    logo = FileField(
        "Logo (optional)",
        validators=[Optional()],
        render_kw={"accept": "image/*"},
    )
