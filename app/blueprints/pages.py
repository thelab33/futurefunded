from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage

from flask import Blueprint, current_app, flash, redirect, render_template, request, url_for

pages_bp = Blueprint("pages", __name__)

# --- Legal pages ---
@pages_bp.get("/privacy")
def privacy():
    return render_template("legal/privacy.html")

@pages_bp.get("/terms")
def terms():
    return render_template("legal/terms.html")

@pages_bp.get("/refunds")
def refunds():
    return render_template("legal/refunds.html")

# --- Support (GET shows form, POST submits) ---
@pages_bp.route("/support", methods=["GET", "POST"])
def support():
    if request.method == "GET":
        return render_template("support/support.html")

    name = (request.form.get("name") or "").strip()
    email = (request.form.get("email") or "").strip()
    message = (request.form.get("message") or "").strip()

    if not name or not email or not message:
        flash("Please fill out name, email, and message.", "error")
        return render_template("support/support.html", name=name, email=email, message=message), 400

    # In dev, you can log instead of sending email
    if current_app.config.get("SUPPORT_EMAIL_MODE", "smtp") == "log":
        current_app.logger.info("Support message: name=%s email=%s message=%s", name, email, message)
        return render_template("support/support_success.html", name=name)

    try:
        _send_support_email(name, email, message)
    except Exception as e:
        current_app.logger.exception("Support email failed")
        flash("Message saved, but email delivery failed. Please email support@getfuturefunded.com.", "error")
        return render_template("support/support.html", name=name, email=email, message=message), 500

    return render_template("support/support_success.html", name=name)


def _send_support_email(name: str, email: str, message: str) -> None:
    """
    SMTP sender. For production deliverability, SendGrid/Mailgun/SES is better,
    but this is solid and simple.
    """
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")

    support_to = os.environ.get("SUPPORT_TO", "support@getfuturefunded.com")

    if not all([smtp_host, smtp_user, smtp_pass]):
        raise RuntimeError("Missing SMTP env vars (SMTP_HOST/SMTP_USER/SMTP_PASS).")

    msg = EmailMessage()
    msg["Subject"] = f"[FutureFunded Support] {name}"
    msg["From"] = smtp_user
    msg["To"] = support_to
    msg["Reply-To"] = email
    msg.set_content(f"Name: {name}\nEmail: {email}\n\nMessage:\n{message}\n")

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
