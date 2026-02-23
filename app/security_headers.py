# app/security_headers.py
# FutureFunded — Flagship Nonce-aware CSP + Security Headers (v4)
# Marker: FF_SECURITY_HEADERS_V4_FLAGSHIP
#
# Goals:
# - Hook-safe with your app factory (works with g.csp_nonce set in app/__init__.py request lifecycle)
# - Stripe + PayPal compatible CSP (nonce-based, no eval)
# - Deterministic “prod vs dev” behavior (host + env aware)
# - Avoid leaking internal diag headers on production hostnames
# - Safe defaults, but fully tunable via env vars

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable, Sequence

from flask import Flask, g, request

_TRUE = {"1", "true", "yes", "y", "on"}


def _truthy(val: object, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in _TRUE


def _csv(val: object) -> list[str]:
    if not val:
        return []
    if isinstance(val, (list, tuple, set)):
        return [str(x).strip() for x in val if str(x).strip()]
    return [p.strip() for p in str(val).split(",") if p.strip()]


def _lower_set(items: Iterable[str]) -> set[str]:
    return {str(x).strip().lower() for x in items if str(x).strip()}


def _dedupe(xs: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in xs:
        sx = str(x).strip()
        if sx and sx not in seen:
            seen.add(sx)
            out.append(sx)
    return out


def _host_from_request() -> str:
    """
    ProxyFix-corrected when ProxyFix is outermost (your factory does that).
    Falls back to forwarded host defensively.
    """
    try:
        h = (request.headers.get("X-Forwarded-Host") or request.host or "").lower()
    except Exception:
        return ""
    h = h.split(",")[0].split(":")[0].strip()
    return h


def _is_secure_request() -> bool:
    try:
        if request.is_secure:
            return True
    except Exception:
        pass

    try:
        xfp = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].lower()
        if xfp:
            return xfp == "https"
    except Exception:
        pass

    try:
        return (request.scheme or "").lower() == "https"
    except Exception:
        return False


def _env_is_prod(flask_env: str | None) -> bool:
    fe = (flask_env or "").strip().lower()
    env = (
        os.getenv("FF_ENV")
        or os.getenv("APP_ENV")
        or os.getenv("FUTUREFUNDED_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("ENV")
        or os.getenv("FLASK_ENV")
        or ""
    ).strip().lower()

    if fe == "production":
        return True
    return env in {"prod", "production", "live"}


# -----------------------------------------------------------------------------
# CSP
# -----------------------------------------------------------------------------

@dataclass(frozen=True)
class CSPConfig:
    preset: str = "prod"  # "dev" | "prod"
    report_only: bool = False
    report_uri: str = ""
    # NOTE: this only helps legacy inline *style attributes*; keep False if you can.
    style_unsafe_inline: bool = False

    extra_script_src: tuple[str, ...] = ()
    extra_connect_src: tuple[str, ...] = ()
    extra_frame_src: tuple[str, ...] = ()
    extra_img_src: tuple[str, ...] = ()
    extra_style_src: tuple[str, ...] = ()
    extra_font_src: tuple[str, ...] = ()

    # Choose "'none'" if you never want this site framed.
    # Default "'self'" keeps same-origin embedding possible.
    frame_ancestors: tuple[str, ...] = ("'self'",)


def build_csp(nonce: str, cfg: CSPConfig) -> str:
    preset = "dev" if cfg.preset == "dev" else "prod"
    host = _host_from_request()

    nonce_part = f"'nonce-{nonce}'" if nonce else ""

    # Script sources: nonce + vendors (no eval)
    script_src = _dedupe(
        [
            "'self'",
            nonce_part,
            # Stripe
            "https://js.stripe.com",
            "https://m.stripe.network",
            # PayPal SDK
            "https://www.paypal.com",
            "https://paypal.com",
            "https://www.paypalobjects.com",
            *cfg.extra_script_src,
        ]
    )

    # Connect sources: include wss for sockets, add ws in dev if needed
    connect_src = [
        "'self'",
        "https:",
        "wss:",
        # Stripe APIs
        "https://api.stripe.com",
        "https://hooks.stripe.com",
        "https://events.stripe.com",
        "https://m.stripe.network",
        "https://q.stripe.com",
        "https://r.stripe.com",
        # PayPal APIs
        "https://www.paypal.com",
        "https://paypal.com",
        "https://api.paypal.com",
        "https://www.paypalobjects.com",
        *cfg.extra_connect_src,
    ]
    if host:
        connect_src.append(f"wss://{host}")
        if preset == "dev":
            connect_src.append(f"ws://{host}")
    connect_src = _dedupe(connect_src)

    # Frames (Stripe Elements + PayPal)
    frame_src = _dedupe(
        [
            "'self'",
            # Stripe embedded elements/checkout
            "https://js.stripe.com",
            "https://m.stripe.network",
            "https://hooks.stripe.com",
            "https://checkout.stripe.com",
            # PayPal frames
            "https://www.paypal.com",
            "https://paypal.com",
            # Optional media providers
            "https://player.vimeo.com",
            "https://www.youtube.com",
            "https://www.youtube-nocookie.com",
            *cfg.extra_frame_src,
        ]
    )

    # Styles: allow nonce for <style nonce=""> blocks; unsafe-inline only if you must
    style_src = ["'self'", "https:", nonce_part, *cfg.extra_style_src]
    if cfg.style_unsafe_inline:
        style_src.append("'unsafe-inline'")
    style_src = _dedupe(style_src)

    # Images/fonts/media
    img_src = _dedupe(["'self'", "data:", "blob:", "https:", *cfg.extra_img_src])
    font_src = _dedupe(["'self'", "data:", "https:", *cfg.extra_font_src])

    # Frame ancestors: allow embedding? default is same-origin only.
    frame_ancestors = _dedupe(list(cfg.frame_ancestors or ("'self'",)))

    # Forms: keep tight; add PayPal because some flows post there.
    form_action = _dedupe(
        [
            "'self'",
            "https://checkout.stripe.com",
            "https://www.paypal.com",
            "https://paypal.com",
        ]
    )

    directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        f"frame-ancestors {' '.join(frame_ancestors)}",
        f"form-action {' '.join(form_action)}",
        f"script-src {' '.join(script_src)}",
        f"connect-src {' '.join(connect_src)}",
        f"frame-src {' '.join(frame_src)}",
        f"style-src {' '.join(style_src)}",
        f"img-src {' '.join(img_src)}",
        f"font-src {' '.join(font_src)}",
        "media-src 'self' https: data:",
        "manifest-src 'self'",
        "worker-src 'self' blob:",
    ]

    if preset == "prod":
        directives.append("upgrade-insecure-requests")
        directives.append("block-all-mixed-content")

    if cfg.report_uri:
        directives.append(f"report-uri {cfg.report_uri}")

    return "; ".join(directives) + ";"


# -----------------------------------------------------------------------------
# Baseline security headers
# -----------------------------------------------------------------------------

LEAK_HEADERS = {
    # Keep your internal debug headers off prod responses:
    "x-futurefunded-env",
    "x-futurefunded-config",
}

# NOTE: COOP/COEP/CORP can break Stripe/PayPal embeds. Do not enable by default.


def _base_headers() -> dict[str, str]:
    return {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": os.getenv("FF_REFERRER_POLICY", "strict-origin-when-cross-origin"),
        "Permissions-Policy": os.getenv(
            "FF_PERMISSIONS_POLICY",
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), usb=()",
        ),
        # X-Frame-Options only controls *our page* being framed. SAMEORIGIN is safe default.
        "X-Frame-Options": os.getenv("FF_X_FRAME_OPTIONS", "SAMEORIGIN"),
        "X-Permitted-Cross-Domain-Policies": "none",
    }


def _hsts_value() -> str:
    max_age = int(os.getenv("FF_HSTS_MAX_AGE", "31536000"))
    include_sub = _truthy(os.getenv("FF_HSTS_INCLUDE_SUBDOMAINS"), True)
    preload = _truthy(os.getenv("FF_HSTS_PRELOAD"), False)

    v = f"max-age={max_age}"
    if include_sub:
        v += "; includeSubDomains"
    if preload:
        v += "; preload"
    return v


def _is_prod_request(prod_hosts: Sequence[str], flask_env: str | None) -> bool:
    host = _host_from_request()
    prod_hosts_set = _lower_set(prod_hosts)

    if host and prod_hosts_set:
        if host in prod_hosts_set or any(host.endswith("." + h) for h in prod_hosts_set):
            return True

    return _env_is_prod(flask_env)


def _strip_leaks(resp) -> None:
    for k in list(resp.headers.keys()):
        if k.lower() in LEAK_HEADERS:
            resp.headers.pop(k, None)


# -----------------------------------------------------------------------------
# WSGI safety wrapper (kept lightweight; CSP is set in after_request)
# -----------------------------------------------------------------------------

class SecurityHeadersMiddleware:
    """
    Adds baseline headers even if something returns very early in the stack.
    CSP is intentionally handled in Flask after_request because it needs nonce + request context.
    """

    def __init__(self, app, prod_hosts: Iterable[str]):
        self.app = app
        self.prod_hosts = _lower_set(prod_hosts)

    def __call__(self, environ, start_response):
        def _start(status, headers, exc_info=None):
            hdrs = [(k, v) for k, v in headers if k]
            existing = {k.lower() for k, _ in hdrs}

            # Baseline defaults (do not override)
            for k, v in _base_headers().items():
                if k.lower() not in existing:
                    hdrs.append((k, v))

            # Prod decision based on host header
            host = (environ.get("HTTP_X_FORWARDED_HOST") or environ.get("HTTP_HOST") or "").split(",")[0]
            host = host.split(":")[0].lower().strip()
            is_prod_host = bool(host) and (host in self.prod_hosts or any(host.endswith("." + h) for h in self.prod_hosts))

            if is_prod_host:
                # Strip internal leak headers
                hdrs = [(k, v) for k, v in hdrs if k.lower() not in LEAK_HEADERS]

                # HSTS only when secure
                scheme = (environ.get("wsgi.url_scheme") or "").lower()
                xfp = (environ.get("HTTP_X_FORWARDED_PROTO") or "").split(",")[0].lower()
                secure = scheme == "https" or xfp == "https"
                if secure and not any(k.lower() == "strict-transport-security" for k, _ in hdrs):
                    hdrs.append(("Strict-Transport-Security", _hsts_value()))

            return start_response(status, hdrs, exc_info)

        return self.app(environ, _start)


# -----------------------------------------------------------------------------
# Flask installer (single canonical entrypoint)
# -----------------------------------------------------------------------------

def install_security_middleware(app: Flask) -> None:
    """
    Called by app/__init__.py _install_security().
    Safe to call multiple times (idempotent).
    """
    if app.extensions.get("ff_security_headers_installed") is True:
        return
    app.extensions["ff_security_headers_installed"] = True

    prod_hosts = _csv(os.getenv("FF_PROD_HOSTS") or "getfuturefunded.com")

    # Install WSGI wrapper first; your factory then wraps ProxyFix outermost (good).
    try:
        app.wsgi_app = SecurityHeadersMiddleware(app.wsgi_app, prod_hosts)  # type: ignore[assignment]
    except Exception:
        # Never crash app boot for headers
        pass

    # Provide nonce as a string for templates that reference {{ csp_nonce }}
    # (Your app already provides nonce_attr() helper; we do not override it.)
    @app.context_processor
    def _inject_nonce():
        return {"csp_nonce": getattr(g, "csp_nonce", "")}

    @app.after_request
    def _apply(resp):
        # Baseline security headers
        for k, v in _base_headers().items():
            resp.headers.setdefault(k, v)

        flask_env = app.config.get("ENV")
        is_prod = _is_prod_request(prod_hosts, flask_env)

        # HSTS only on HTTPS in prod
        if is_prod and _is_secure_request():
            resp.headers.setdefault("Strict-Transport-Security", _hsts_value())

        # Strip internal header leaks in prod
        if is_prod:
            _strip_leaks(resp)

        # CSP toggles
        csp_enabled = _truthy(os.getenv("FF_CSP_ENABLED"), True)
        allow_dev = _truthy(os.getenv("FF_CSP_IN_DEV"), False)

        if csp_enabled and (is_prod or allow_dev):
            cfg = CSPConfig(
                preset="prod" if is_prod else "dev",
                report_only=_truthy(os.getenv("FF_CSP_REPORT_ONLY"), False),
                report_uri=(os.getenv("FF_CSP_REPORT_URI") or "").strip(),
                style_unsafe_inline=_truthy(os.getenv("FF_CSP_STYLE_UNSAFE_INLINE"), False),
                extra_script_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_SCRIPT_SRC"))),
                extra_connect_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_CONNECT_SRC"))),
                extra_frame_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_FRAME_SRC"))),
                extra_img_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_IMG_SRC"))),
                extra_style_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_STYLE_SRC"))),
                extra_font_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_FONT_SRC"))),
                frame_ancestors=tuple(_csv(os.getenv("FF_CSP_FRAME_ANCESTORS")) or ["'self'"]),
            )

            hdr = "Content-Security-Policy-Report-Only" if cfg.report_only else "Content-Security-Policy"

            # Respect an upstream CSP if you set one elsewhere (authoritative wins upstream).
            if hdr not in resp.headers:
                nonce = getattr(g, "csp_nonce", "") or ""
                resp.headers[hdr] = build_csp(nonce, cfg)

        return resp
