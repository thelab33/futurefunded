from __future__ import annotations

import re
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from app.extensions import db
from app.models.sponsor_lead import SponsorLead

bp = Blueprint("sponsor_interest_api", __name__, url_prefix="/api")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean(value: Any, max_len: int = 255) -> str:
    text = " ".join(str(value or "").strip().split())
    return text[:max_len]


def _payload() -> dict[str, Any]:
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict(flat=True)


def _mail_sender() -> str:
    return (
        current_app.config.get("MAIL_DEFAULT_SENDER")
        or current_app.config.get("DEFAULT_MAIL_SENDER")
        or current_app.config.get("SUPPORT_EMAIL")
        or current_app.config.get("ORGANIZER_EMAIL")
        or ""
    )


def _notify_recipient() -> str:
    return (
        current_app.config.get("SPONSOR_LEADS_NOTIFY_TO")
        or current_app.config.get("ORGANIZER_EMAIL")
        or current_app.config.get("SUPPORT_EMAIL")
        or ""
    )


def _send_email(subject: str, recipients: list[str], body: str) -> bool:
    recipients = [r for r in recipients if r]
    if not recipients:
        return False

    mail_ext = current_app.extensions.get("mail")
    sender = _mail_sender()

    if not mail_ext or not sender:
        current_app.logger.warning(
            "Sponsor lead email skipped. mail_ext=%s sender=%r recipients=%r",
            bool(mail_ext),
            sender,
            recipients,
        )
        return False

    try:
        from flask_mail import Message

        msg = Message(
            subject=subject,
            sender=sender,
            recipients=recipients,
            body=body,
        )
        mail_ext.send(msg)
        return True
    except Exception:
        current_app.logger.exception("Failed sending sponsor lead email")
        return False


@bp.post("/sponsor-interest")
def sponsor_interest_submit():
    payload = _payload()

    sponsor_name = _clean(payload.get("sponsor_name") or payload.get("name"), 160)
    business_name = _clean(payload.get("business_name") or payload.get("company"), 160)
    email = _clean(payload.get("email"), 255).lower()
    phone = _clean(payload.get("phone"), 64)
    website = _clean(payload.get("website"), 255)
    tier_interest = _clean(payload.get("tier_interest") or payload.get("tier"), 64)
    budget = _clean(payload.get("budget"), 64)
    message = str(payload.get("message") or "").strip()[:5000]

    organization_name = _clean(
        payload.get("organization_name")
        or current_app.config.get("ORG_NAME")
        or "Connect ATX Elite",
        160,
    )
    campaign_name = _clean(
        payload.get("campaign_name")
        or current_app.config.get("CAMPAIGN_NAME")
        or organization_name,
        160,
    )

    page_url = _clean(payload.get("page_url") or request.referrer or "", 500)
    referrer = _clean(payload.get("referrer") or request.referrer or "", 500)

    errors: dict[str, str] = {}

    if not sponsor_name:
        errors["sponsor_name"] = "Please add a contact name."

    if not email:
        errors["email"] = "Please add an email address."
    elif not EMAIL_RE.match(email):
        errors["email"] = "Please enter a valid email address."

    if message and len(message) < 8:
        errors["message"] = "Please add a little more detail so we can follow up well."

    if errors:
        return (
            jsonify(
                {
                    "ok": False,
                    "message": "Please fix the highlighted fields and try again.",
                    "errors": errors,
                }
            ),
            400,
        )

    lead = SponsorLead(
        status="new",
        source="launch-page",
        organization_name=organization_name,
        campaign_name=campaign_name,
        sponsor_name=sponsor_name,
        business_name=business_name,
        email=email,
        phone=phone,
        website=website,
        tier_interest=tier_interest,
        budget=budget,
        message=message,
        page_url=page_url,
        referrer=referrer,
    )

    lead.set_notes(
        {
            "user_agent": request.headers.get("User-Agent", ""),
            "remote_addr": request.headers.get("X-Forwarded-For", request.remote_addr or ""),
            "origin": request.headers.get("Origin", ""),
        }
    )

    try:
        db.session.add(lead)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed saving sponsor lead")
        return (
            jsonify(
                {
                    "ok": False,
                    "message": "We could not save your sponsor request right now. Please try again.",
                }
            ),
            500,
        )

    notify_to = _notify_recipient()
    subject_base = f"New sponsor lead • {campaign_name}"

    internal_body = f"""New sponsor lead received

Organization: {organization_name}
Campaign: {campaign_name}

Contact: {sponsor_name}
Business: {business_name or "-"}
Email: {email}
Phone: {phone or "-"}
Website: {website or "-"}
Tier interest: {tier_interest or "-"}
Budget: {budget or "-"}
Page URL: {page_url or "-"}
Referrer: {referrer or "-"}

Message:
{message or "-"}
"""

    sponsor_body = f"""Thanks for your interest in supporting {campaign_name}.

We received your sponsor inquiry and will follow up soon.

Summary
- Contact: {sponsor_name}
- Business: {business_name or "-"}
- Tier interest: {tier_interest or "-"}
- Budget: {budget or "-"}

If you need to add anything else, reply to this email.

Thanks again,
{organization_name}
"""

    _send_email(subject_base, [_notify_recipient()], internal_body)
    _send_email(f"Thanks for your sponsor interest • {campaign_name}", [email], sponsor_body)

    return (
        jsonify(
            {
                "ok": True,
                "message": "Thanks — your sponsor inquiry was received.",
                "lead_id": lead.id,
                "status": lead.status,
            }
        ),
        201,
    )
