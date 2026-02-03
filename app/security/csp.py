# app/security/csp.py
from __future__ import annotations

import os
import secrets
from typing import Iterable

from flask import current_app, g
from markupsafe import Markup

# Toggle report-only via env: CSP_REPORT_ONLY=1
REPORT_ONLY = os.getenv("CSP_REPORT_ONLY", "0").lower() in {"1", "true", "yes"}


def new_nonce() -> str:
    # 128-bit urlsafe token is plenty
    return secrets.token_urlsafe(16)


def nonce() -> str:
    # Access the per-request nonce; set in before_request
    return getattr(g, "csp_nonce", "")


def nonce_attr() -> Markup:
    # Handy for templates: <script {{ nonce_attr() }}>
    n = nonce()
    return Markup(f'nonce="{n}"') if n else Markup("")


def _join(*vals: Iterable[str]) -> str:
    return " ".join(v for v in vals if v)


def build_csp() -> str:
    """
    Strict but practical CSP for your stack (Stripe, GA/GTM optional, Socket.IO).
    Adjust domains as needed; we keep it minimal and safe.
    """
    n = nonce()

    # External services you actually use
    stripe_js = "https://js.stripe.com"
    stripe_api = "https://api.stripe.com"
    stripe_hook = "https://hooks.stripe.com"

    cdn1 = "https://cdn.jsdelivr.net"
    cdn2 = "https://unpkg.com"

    # Analytics (optional—only included if IDs present)
    gtm = "https://www.googletagmanager.com"
    ga = "https://www.google-analytics.com"
    dbl = "https://stats.g.doubleclick.net"  # GA sends to this too

    # Fonts (optional; remove if not used)
    fonts_css = "https://fonts.googleapis.com"
    fonts_bin = "https://fonts.gstatic.com"

    # Socket.IO / websockets
    primary_origin = current_app.config.get("PRIMARY_ORIGIN", "http://127.0.0.1:5000")
    # Allow ws/wss back to ourselves (and same host/port)
    ws_self = primary_origin.replace("http", "ws", 1)

    # Core policies
    default_src = _join("'self'")
    # Allow inline scripts via nonce only; allow our CDNs + Stripe + (optional GA/GTM)
    script_src = [
        "'self'",
        f"'nonce-{n}'",
        stripe_js,
        cdn1,
        cdn2,
    ]
    if current_app.config.get("GA_ID"):
        script_src += [gtm, ga, dbl]

    # Styles: your app uses external CSS (e.g., fonts) + Tailwind. Prefer nonced <style> blocks.
    # If you have inline styles that are hard to nonce, you may temporarily add 'unsafe-inline'.
    style_src = ["'self'", fonts_css, f"'nonce-{n}'"]

    connect_src = [
        "'self'",
        stripe_api,
        primary_origin,  # fetch/XHR to self
        ws_self,  # websocket (dev)
        "wss://*",  # if you deploy behind TLS and need wss (Socket.IO, Stripe, etc.)
    ]
    if current_app.config.get("GA_ID"):
        connect_src += [gtm, ga]

    img_src = ["'self'", "data:", "blob:"]
    font_src = ["'self'", fonts_bin, "data:"]
    frame_src = ["'self'", stripe_js, stripe_hook]  # Stripe embeds its own frames
    frame_ancestors = ["'self'"]

    base_uri = ["'self'"]
    object_src = ["'none'"]
    form_action = ["'self'"]

    # Build final string
    directives = [
        ("default-src", default_src),
        ("script-src", _join(*script_src)),
        ("style-src", _join(*style_src)),
        ("img-src", _join(*img_src)),
        ("font-src", _join(*font_src)),
        ("connect-src", _join(*connect_src)),
        ("frame-src", _join(*frame_src)),
        ("frame-ancestors", _join(*frame_ancestors)),
        ("base-uri", _join(*base_uri)),
        ("object-src", _join(*object_src)),
        ("form-action", _join(*form_action)),
        # Optionals you can uncomment:
        # ("upgrade-insecure-requests", ""),
        # ("block-all-mixed-content", ""),
    ]
    return "; ".join(
        f"{name} {value}".rstrip() if value else name for name, value in directives
    )


def apply_csp_headers(response):
    # Attach either CSP or Report-Only header
    header = (
        "Content-Security-Policy-Report-Only"
        if REPORT_ONLY
        else "Content-Security-Policy"
    )
    response.headers[header] = build_csp()
    return response
