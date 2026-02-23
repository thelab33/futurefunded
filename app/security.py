# app/security.py
# FutureFunded — Flagship Security Middleware (CSP nonce + headers)
# Drop-in new file. Works with your existing g.csp_nonce lifecycle hook.
# - Production: sets Content-Security-Policy (enforced)
# - Dev/Testing: skips CSP by default (can enable report-only via env)
#
# Integration options:
# 1) Preferred: in app/security_headers.py, call: from app.security import install_security_middleware
# 2) Or: in app/__init__.py _install_security(), fall back to: from app.security import install_security_middleware

from __future__ import annotations

import os
import secrets
from typing import Iterable, List, Optional

from flask import Flask, Response, current_app, g, request

_TRUTHY = {"1", "true", "yes", "y", "on"}


def _truthy(v: str) -> bool:
    return (v or "").strip().lower() in _TRUTHY


def _get_nonce() -> str:
    """
    Reuse nonce generated in request lifecycle if present; otherwise create one.
    """
    n = getattr(g, "csp_nonce", "") or ""
    if not n:
        n = secrets.token_urlsafe(16)
        g.csp_nonce = n
    return n


def _is_prod(app: Flask) -> bool:
    env = (app.config.get("ENV") or app.config.get("APP_ENV") or os.getenv("APP_ENV") or "").strip().lower()
    if env in {"prod", "production", "live"}:
        return True
    # If ENV isn't set reliably, fall back to Flask flags (debug/test off => treat as prod-ish)
    return (not app.debug) and (not app.testing)


def _csv_env(name: str) -> List[str]:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def _uniq(parts: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for p in parts:
        p = (p or "").strip()
        if not p or p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def _build_csp(app: Flask, nonce: str) -> str:
    """
    Pragmatic, Stripe/PayPal-safe CSP that still stays strict:
    - nonce required for inline <script nonce="..."> and <style nonce="...">
    - no eval
    - blocks object/embed
    - locks down base-uri + frame-ancestors
    """
    # Toggle: allow inline style attributes (style="...") for backwards compat.
    # Set FF_CSP_ALLOW_UNSAFE_INLINE_STYLE=0 once you confirm there are no style="" attributes.
    allow_unsafe_inline_style = not _truthy(os.getenv("FF_CSP_ALLOW_UNSAFE_INLINE_STYLE", "1") or "1")

    # Optional extra domains (comma-separated)
    extra_script = _csv_env("FF_CSP_EXTRA_SCRIPT_SRC")
    extra_style = _csv_env("FF_CSP_EXTRA_STYLE_SRC")
    extra_connect = _csv_env("FF_CSP_EXTRA_CONNECT_SRC")
    extra_img = _csv_env("FF_CSP_EXTRA_IMG_SRC")
    extra_frame = _csv_env("FF_CSP_EXTRA_FRAME_SRC")
    extra_font = _csv_env("FF_CSP_EXTRA_FONT_SRC")
    extra_form = _csv_env("FF_CSP_EXTRA_FORM_ACTION")

    # Core allowlists
    script_src = _uniq(
        [
            "'self'",
            f"'nonce-{nonce}'",
            # Stripe
            "https://js.stripe.com",
            "https://m.stripe.network",
            # PayPal (SDK)
            "https://www.paypal.com",
            "https://paypal.com",
            "https://www.paypalobjects.com",
            *extra_script,
        ]
    )

    # NOTE: style-src nonce works for <style nonce=""> blocks,
    # but NOT for style="..." attributes. That's why the compat toggle exists.
    style_src = _uniq(
        [
            "'self'",
            f"'nonce-{nonce}'",
            # If you do use Google Fonts CSS, keep this:
            "https://fonts.googleapis.com",
            # Compat fallback if needed:
            *([] if allow_unsafe_inline_style else ["'unsafe-inline'"]),
            *extra_style,
        ]
    )

    # Add wss: to support Socket.IO / WebSockets when served over HTTPS.
    connect_src = _uniq(
        [
            "'self'",
            "https:",
            "wss:",
            # Stripe APIs
            "https://api.stripe.com",
            "https://hooks.stripe.com",
            "https://events.stripe.com",
            "https://m.stripe.network",
            # PayPal APIs
            "https://www.paypal.com",
            "https://paypal.com",
            "https://api.paypal.com",
            "https://www.paypalobjects.com",
            *extra_connect,
        ]
    )

    img_src = _uniq(["'self'", "data:", "blob:", "https:", *extra_img])

    font_src = _uniq(["'self'", "data:", "https://fonts.gstatic.com", *extra_font])

    frame_src = _uniq(
        [
            # Stripe embeds
            "https://js.stripe.com",
            "https://hooks.stripe.com",
            "https://checkout.stripe.com",
            # PayPal embeds
            "https://www.paypal.com",
            "https://paypal.com",
            *extra_frame,
        ]
    )

    form_action = _uniq(
        [
            "'self'",
            # Stripe-hosted flows (if any)
            "https://checkout.stripe.com",
            *extra_form,
        ]
    )

    # Keep default-src tight; allow https: broadly for images/connect already.
    # If you host user-provided assets elsewhere, add explicit sources via FF_CSP_EXTRA_*.
    directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        f"script-src {' '.join(script_src)}",
        f"style-src {' '.join(style_src)}",
        f"connect-src {' '.join(connect_src)}",
        f"img-src {' '.join(img_src)}",
        f"font-src {' '.join(font_src)}",
        f"frame-src {' '.join(frame_src)}",
        f"form-action {' '.join(form_action)}",
    ]

    # In production, this is a nice hardening win (prevents mixed content).
    if _is_prod(app):
        directives.append("upgrade-insecure-requests")

    return "; ".join(directives) + ";"


def _apply_security_headers(app: Flask, resp: Response) -> Response:
    """
    Baseline headers. Keep conservative and compatible.
    If you already set these elsewhere, these use setdefault to avoid fighting.
    """
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")

    # Permissions-Policy: keep minimal; expand only when needed.
    resp.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    )

    # HSTS only when you're truly HTTPS in production
    if _is_prod(app):
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")

    return resp


def attach_csp(app: Flask) -> None:
    """
    Backwards-compatible entry point if you want to call attach_csp(app).
    """
    install_security_middleware(app)


def install_security_middleware(app: Flask) -> None:
    """
    Canonical installer:
    - context processor provides csp_nonce() helper
    - after_request sets CSP + baseline headers (prod enforced)
    """
    if app.extensions.get("ff_security_installed") is True:
        return
    app.extensions["ff_security_installed"] = True

    @app.context_processor
    def _provide_nonce():
        # templates can call: {{ csp_nonce() }}
        return {"csp_nonce": _get_nonce}

    @app.after_request
    def _security_after(resp: Response):
        # Always apply baseline headers
        resp = _apply_security_headers(app, resp)

        # CSP policy control:
        # - Default: enforce only in prod
        # - Optional: FF_CSP_REPORT_ONLY=1 to set report-only even in prod
        # - Optional: FF_CSP_ENABLE_IN_DEV=1 to test CSP in dev
        enable_in_dev = _truthy(os.getenv("FF_CSP_ENABLE_IN_DEV", "0") or "0")
        report_only = _truthy(os.getenv("FF_CSP_REPORT_ONLY", "0") or "0")

        if _is_prod(app) or enable_in_dev:
            nonce = getattr(g, "csp_nonce", "") or ""
            if nonce:
                # Ensure nonce exists for templates that rely on it
                nonce = _get_nonce()

            csp = _build_csp(app, nonce)

            header = "Content-Security-Policy-Report-Only" if report_only else "Content-Security-Policy"
            resp.headers[header] = csp

        return resp
