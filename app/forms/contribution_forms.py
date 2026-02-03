# app/forms/contribution_forms.py
from __future__ import annotations

from flask_wtf import FlaskForm
from wtforms import DecimalField, FileField, SelectField, StringField
from wtforms.validators import (DataRequired, Email, Length, NumberRange,
                                Optional, Regexp)

# Centralized tier options — keeps SponsorForm & DonationForm consistent
TIER_CHOICES = [
    ("Bronze", "🥉 Bronze"),
    ("Silver", "🥈 Silver"),
    ("Gold", "🥇 Gold"),
    ("Platinum", "🏆 Platinum"),
    ("Custom", "✨ Custom"),
]


class BaseContributionForm(FlaskForm):
    """
    Shared fields for both sponsorships and donations.
    Enforces consistent validation, placeholders, and styling.
    """

    name = StringField(
        "Name / Company",
        validators=[
            DataRequired(message="Name is required."),
            Length(max=80, message="Name must be under 80 characters."),
        ],
        render_kw={"placeholder": "Jane Doe or Acme Inc."},
    )

    email = StringField(
        "Email",
        validators=[
            DataRequired(message="Email is required."),
            Email(message="Please enter a valid email."),
            Length(max=255, message="Email must be under 255 characters."),
        ],
        render_kw={"placeholder": "you@example.com"},
    )

    amount = DecimalField(
        "Amount (USD)",
        places=2,
        validators=[
            DataRequired(message="Please enter an amount."),
            NumberRange(min=1, message="Minimum amount is $1."),
        ],
        render_kw={"placeholder": "100.00"},
    )


class SponsorForm(BaseContributionForm):
    """
    Sponsorship form — includes optional logo upload for branding.
    """

    tier = SelectField(
        "Sponsorship Tier",
        choices=TIER_CHOICES,
        validators=[DataRequired(message="Please select a tier.")],
    )

    logo = FileField(
        "Logo (optional)",
        validators=[
            Optional(),
            # Optional: limit filenames to safe patterns
            Regexp(
                r".*\.(jpg|jpeg|png|gif|webp)$",
                flags=0,
                message="Logo must be JPG, PNG, GIF, or WEBP.",
            ),
        ],
        render_kw={"accept": "image/*"},
    )


class DonationForm(BaseContributionForm):
    """
    Donation form for tiers or custom contributions.
    """

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
        "Donation Tier",
        choices=TIER_CHOICES,
        validators=[DataRequired(message="Please select a tier.")],
    )

    logo = FileField(
        "Logo (optional)",
        validators=[Optional()],
        render_kw={"accept": "image/*"},
    )
