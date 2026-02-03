# app/helpers/donations_helpers.py
from typing import Optional
from sqlalchemy.exc import SQLAlchemyError
import logging
from app.extensions import db
from app.models.donation import Donation

logger = logging.getLogger(__name__)

def _safe_create_donation_row(
    *,
    meta,
    amount_cents: int,
    currency: str = "usd",
    org: Optional[object] = None,
    logo_path: Optional[str] = None,
    provider: str = "stripe",
) -> int:
    donor_name = getattr(meta, "donor_name", None) or ""
    donor_email = getattr(meta, "donor_email", None) or ""
    note = getattr(meta, "note", None)
    source = getattr(meta, "source", None) or "web"

    if not donor_name:
        if donor_email and "@" in donor_email:
            donor_name = donor_email.split("@", 1)[0]
        else:
            donor_name = "Anonymous"

    donor_name = donor_name[:160]
    donor_email = donor_email[:160]
    logo_path = (logo_path[:255] if logo_path else None)
    note = (note[:500] if note else None)
    currency = (currency or "usd")[:3].lower()
    provider_status = "pending_intent" if provider == "stripe" else "pending_order"

    try:
        with db.session.begin():
            donation = Donation(
                name=donor_name,
                email=donor_email,
                logo_path=logo_path,
                amount_cents=int(amount_cents),
                currency=currency,
                provider=provider,
                provider_status=provider_status,
                note=note,
                source=source,
                org_id=(org.id if org else None),
            )
            db.session.add(donation)
            db.session.flush()
            donation_id = int(donation.id)
        return donation_id
    except SQLAlchemyError as exc:
        logger.exception("Failed to create donation row: %s", exc)
        raise

