from flask_wtf import FlaskForm
from wtforms import DecimalField, StringField
from wtforms.validators import (DataRequired, Email, Length, NumberRange,
                                ValidationError)


class SponsorForm(FlaskForm):
    """Sponsor/Donor form with name, email, and amount fields."""

    name = StringField(
        "Your Name or Company",
        validators=[
            DataRequired(message="Name is required."),
            Length(max=80, message="Name must be under 80 characters."),
        ],
        filters=[lambda x: x.strip() if isinstance(x, str) else x],
        render_kw={"placeholder": "Jane Doe or Acme Inc."},
    )

    email = StringField(
        "Email",
        validators=[
            DataRequired(message="Email is required."),
            Email(message="Please enter a valid email address."),
        ],
        filters=[lambda x: x.strip().lower() if isinstance(x, str) else x],
        render_kw={"placeholder": "you@example.com"},
    )

    amount = DecimalField(
        "Amount (USD)",
        validators=[
            DataRequired(message="Donation amount is required."),
            NumberRange(min=1, message="Minimum amount is $1."),
        ],
        places=2,
        render_kw={"placeholder": "100.00"},
    )

    def validate_amount(self, field):
        """Ensure amount is a positive currency value."""
        if field.data and field.data <= 0:
            raise ValidationError("Amount must be greater than zero.")
        # Normalize to 2 decimal places
        if field.data:
            field.data = round(field.data, 2)
