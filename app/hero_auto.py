# FUNDCHAMPS-HERO-AUTO (refactored for app factory / run.py)
from __future__ import annotations

from flask import Blueprint, render_template

try:
    from babel.numbers import format_currency

    HAVE_BABEL = True
except Exception:  # pragma: no cover - optional dependency
    HAVE_BABEL = False


#: Public blueprint for the hero / home page
bp = Blueprint(
    "hero",
    __name__,
    template_folder="templates",  # relative to `app/`
    static_folder=None,
)


# ───────────────────────── Template filters ─────────────────────────
@bp.app_template_filter("roll_money")
def roll_money(amount, currency: str = "USD") -> str:
    """
    Format a number as currency.
    - Uses Babel if installed
    - Falls back to simple "$1,234" formatting
    """
    try:
        if amount is None:
            amount = 0
        if HAVE_BABEL:
            return format_currency(amount, currency, locale="en_US")
        return f"${int(float(amount)):,}"
    except Exception:
        try:
            return f"${int(amount):,}"
        except Exception:
            return "$0"


@bp.app_template_filter("roll_pct")
def roll_pct(pct) -> int:
    """
    Round a percentage-like value to an int.
    """
    try:
        return int(round(float(pct)))
    except Exception:
        return 0


@bp.app_template_filter("clamp_pct")
def clamp_pct(value) -> int:
    """
    Clamp a number between 0 and 100 and round to int.
    """
    try:
        v = float(value)
        if v < 0:
            return 0
        if v > 100:
            return 100
        return int(round(v))
    except Exception:
        return 0


# ───────────────────────── Routes ─────────────────────────
@bp.route("/")
def home():
    """
    Hero landing page for FundChamps.

    You can later wire this up to real org/team data
    instead of hard-coded defaults.
    """
    data = dict(
        theme_hex="#fbbf24",
        team_name="Connect ATX Elite",
        title="Fuel the Season.",
        title_2="Fund the Future.",
        subtitle="Every dollar powers our journey: gear, travel, coaching, and tutoring.",
        panel_title="Live",
        panel_title_2="Scoreboard",
        href_donate="https://example.com/donate",
        href_impact="/impact",
        href_sponsor="/sponsor",
        text_keyword="ELITE",
        text_short="444321",
        raised=0,
        goal=50000,
        deadline="",
        currency="USD",
    )
    return render_template("pages/home.html", **data)


# ───────────────────────── Optional CSP / Talisman hook ─────────────────────────
def setup_hero_csp(app) -> None:
    """
    Optional: apply a simple default Content-Security-Policy using flask-talisman.

    Call this from your create_app() *after* the app is created,
    if you want this strict CSP. If flask-talisman isn't installed,
    this is a no-op.
    """
    try:
        from flask_talisman import Talisman
    except Exception:
        # Talisman not available; skip CSP
        return

    csp = {
        "default-src": "'self'",
        "img-src": "'self' data:",
        "style-src": "'self'",
        "script-src": "'self'",
        "connect-src": "'self'",
    }

    # You can override via config later if you want
    force_https = app.config.get("TALISMAN_FORCE_HTTPS", True)

    Talisman(app, content_security_policy=csp, force_https=force_https)
