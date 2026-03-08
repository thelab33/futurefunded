#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import traceback
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(dotenv_path=Path(".env"), override=False)
except Exception:
    pass

RESULTS: list[tuple[str, str, str]] = []
FAILURES = 0
WARNINGS = 0


def ok(name: str, detail: str = "") -> None:
    RESULTS.append(("PASS", name, detail))


def warn(name: str, detail: str = "") -> None:
    global WARNINGS
    WARNINGS += 1
    RESULTS.append(("WARN", name, detail))


def fail(name: str, detail: str = "") -> None:
    global FAILURES
    FAILURES += 1
    RESULTS.append(("FAIL", name, detail))


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def short(s: str, n: int = 160) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def mask_secret(value: str, keep: int = 6) -> str:
    if not value:
        return "(missing)"
    if len(value) <= keep:
        return "*" * len(value)
    return value[:keep] + "…" + "*" * 6


def extract_asset_version(url: str) -> str:
    m = re.search(r"[?&]v=([^&]+)", url)
    return m.group(1) if m else ""


def is_placeholder(value: str) -> bool:
    v = (value or "").strip().lower()
    if not v:
        return True
    bad_markers = {
        "replace",
        "replace_me",
        "replace-with-secret",
        "changeme",
        "change_me",
        "change-me",
        "placeholder",
        "dummy",
        "example",
        "testtest",
        "__change_me__",
    }
    if any(marker in v for marker in bad_markers):
        return True
    if v in {"dev", "development", "secret", "password", "admin", "null", "none"}:
        return True
    return False


def is_valid_secret_key(value: str) -> bool:
    v = (value or "").strip()
    if len(v) < 32:
        return False
    if is_placeholder(v):
        return False
    return True


def maybe_fail(strict: bool, name: str, detail: str) -> None:
    if strict:
        fail(name, detail)
    else:
        warn(name, detail)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="FutureFunded deployment sanity checks")
    p.add_argument("--strict-payments", action="store_true", help="Fail on placeholder/missing PayPal config")
    p.add_argument("--strict-mail", action="store_true", help="Fail on placeholder/missing mail config")
    p.add_argument("--strict-admin", action="store_true", help="Fail on missing/placeholder admin config")
    p.add_argument("--json", action="store_true", help="Emit machine-readable JSON summary")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    try:
        from app import create_app  # type: ignore
        ok("import:create_app", "Imported from app")
    except Exception as e:
        fail("import:create_app", f"Could not import app.create_app: {e}")
        return finish(args)

    try:
        app = create_app()
        ok("create_app()", "Flask app created successfully")
    except Exception as e:
        fail("create_app()", f"App factory failed: {e}")
        traceback.print_exc()
        return finish(args)

    app_env = str(app.config.get("ENV") or env("ENV") or env("FLASK_ENV") or "unknown").strip().lower()
    ff_env = str(app.config.get("FF_ENV") or env("FF_ENV") or app_env).strip().lower()
    in_prod = app_env == "production" or ff_env == "production"

    # ------------------------------------------------------------------
    # Environment sanity
    # ------------------------------------------------------------------
    public_base_url = str(app.config.get("PUBLIC_BASE_URL") or env("PUBLIC_BASE_URL"))
    preferred_scheme = str(app.config.get("PREFERRED_URL_SCHEME") or env("PREFERRED_URL_SCHEME"))
    secret_key = str(app.config.get("SECRET_KEY") or env("SECRET_KEY"))
    database_url = str(app.config.get("SQLALCHEMY_DATABASE_URI") or app.config.get("DATABASE_URL") or env("DATABASE_URL"))

    if in_prod:
        ok("env:mode", f"ENV={app_env} FF_ENV={ff_env}")
    else:
        warn("env:mode", f"Non-production mode detected: ENV={app_env} FF_ENV={ff_env}")

    if public_base_url.startswith("https://"):
        ok("env:PUBLIC_BASE_URL", public_base_url)
    elif public_base_url:
        warn("env:PUBLIC_BASE_URL", f"Present but not https: {public_base_url}")
    else:
        fail("env:PUBLIC_BASE_URL", "Missing PUBLIC_BASE_URL")

    if preferred_scheme == "https":
        ok("env:PREFERRED_URL_SCHEME", preferred_scheme)
    else:
        warn("env:PREFERRED_URL_SCHEME", f"Expected https, got {preferred_scheme or '(missing)'}")

    if is_valid_secret_key(secret_key):
        ok("env:SECRET_KEY", f"Looks present ({len(secret_key)} chars)")
    else:
        fail("env:SECRET_KEY", "Missing, weak, or placeholder SECRET_KEY")

    if database_url:
        ok("env:DATABASE_URL", short(database_url))
    else:
        fail("env:DATABASE_URL", "Missing database URL")

    # Versioning
    ff_asset_v = str(app.config.get("FF_ASSET_V") or env("FF_ASSET_V"))
    ff_build_id = str(app.config.get("FF_BUILD_ID") or env("FF_BUILD_ID"))
    ff_version = str(app.config.get("FF_VERSION") or env("FF_VERSION"))

    for key_name, value in [
        ("env:FF_ASSET_V", ff_asset_v),
        ("env:FF_BUILD_ID", ff_build_id),
        ("env:FF_VERSION", ff_version),
    ]:
        if not value:
            fail(key_name, "Missing")
        elif in_prod and value.strip().lower() == "dev":
            fail(key_name, "Production value must not be 'dev'")
        else:
            ok(key_name, value)

    # ------------------------------------------------------------------
    # Stripe / PayPal sanity
    # ------------------------------------------------------------------
    stripe_mode = (str(app.config.get("STRIPE_MODE") or env("STRIPE_MODE") or "")).lower()
    stripe_secret = str(app.config.get("STRIPE_SECRET_KEY") or env("STRIPE_SECRET_KEY"))
    stripe_publishable = str(app.config.get("STRIPE_PUBLISHABLE_KEY") or env("STRIPE_PUBLISHABLE_KEY"))
    stripe_webhook = str(
        app.config.get("STRIPE_WEBHOOK_SECRET")
        or app.config.get("FF_STRIPE_WEBHOOK_SECRET")
        or env("STRIPE_WEBHOOK_SECRET")
        or env("FF_STRIPE_WEBHOOK_SECRET")
    )

    if stripe_mode in {"live", "test"}:
        ok("stripe:mode", stripe_mode)
    else:
        warn("stripe:mode", f"Unexpected STRIPE_MODE={stripe_mode or '(missing)'}")

    if stripe_secret.startswith("sk_live_") and stripe_publishable.startswith("pk_live_") and stripe_mode == "live":
        ok("stripe:keys", f"Live keys present ({mask_secret(stripe_secret)}, {mask_secret(stripe_publishable)})")
    elif stripe_secret.startswith("sk_test_") and stripe_publishable.startswith("pk_test_") and stripe_mode == "test":
        ok("stripe:keys", f"Test keys present ({mask_secret(stripe_secret)}, {mask_secret(stripe_publishable)})")
    elif stripe_secret or stripe_publishable:
        fail(
            "stripe:keys",
            f"Inconsistent Stripe config: mode={stripe_mode}, sk={mask_secret(stripe_secret)}, pk={mask_secret(stripe_publishable)}",
        )
    else:
        maybe_fail(args.strict_payments, "stripe:keys", "Stripe keys not configured")

    if stripe_webhook.startswith("whsec_") and not is_placeholder(stripe_webhook):
        ok("stripe:webhook_secret", mask_secret(stripe_webhook))
    elif stripe_webhook:
        maybe_fail(args.strict_payments, "stripe:webhook_secret", f"Present but suspicious: {mask_secret(stripe_webhook)}")
    else:
        maybe_fail(args.strict_payments, "stripe:webhook_secret", "Missing webhook signing secret")

    paypal_mode = (str(app.config.get("PAYPAL_MODE") or env("PAYPAL_MODE") or "")).lower()
    paypal_client_id = str(app.config.get("PAYPAL_CLIENT_ID") or env("PAYPAL_CLIENT_ID"))
    paypal_client_secret = str(app.config.get("PAYPAL_CLIENT_SECRET") or env("PAYPAL_CLIENT_SECRET"))

    if paypal_mode in {"live", "sandbox", "test"}:
        ok("paypal:mode", paypal_mode)
    elif paypal_mode:
        warn("paypal:mode", f"Unexpected PAYPAL_MODE={paypal_mode}")
    else:
        maybe_fail(args.strict_payments, "paypal:mode", "PAYPAL_MODE missing")

    if paypal_client_id and paypal_client_secret and not is_placeholder(paypal_client_id) and not is_placeholder(paypal_client_secret):
        ok("paypal:keys", f"Present ({mask_secret(paypal_client_id)}, {mask_secret(paypal_client_secret)})")
    elif paypal_client_id or paypal_client_secret:
        maybe_fail(args.strict_payments, "paypal:keys", "PayPal credentials present but look placeholder/partial")
    else:
        maybe_fail(args.strict_payments, "paypal:keys", "PayPal credentials missing")

    # ------------------------------------------------------------------
    # Mail / admin / ops sanity
    # ------------------------------------------------------------------
    mail_server = str(app.config.get("MAIL_SERVER") or env("MAIL_SERVER"))
    mail_username = str(app.config.get("MAIL_USERNAME") or env("MAIL_USERNAME"))
    mail_password = str(app.config.get("MAIL_PASSWORD") or env("MAIL_PASSWORD"))
    mail_sender = str(app.config.get("MAIL_DEFAULT_SENDER") or env("MAIL_DEFAULT_SENDER"))
    slack_webhook = str(env("SLACK_WEBHOOK_URL"))
    turnkey_admin_pin = str(app.config.get("TURNKEY_ADMIN_PIN") or env("TURNKEY_ADMIN_PIN"))

    if mail_server and mail_username and mail_password and mail_sender and not any(
        is_placeholder(v) for v in [mail_server, mail_username, mail_password, mail_sender]
    ):
        ok("mail:config", f"{mail_server} / {mail_sender}")
    elif any([mail_server, mail_username, mail_password, mail_sender]):
        maybe_fail(args.strict_mail, "mail:config", "Mail config present but partial or placeholder-like")
    else:
        maybe_fail(args.strict_mail, "mail:config", "Mail config missing")

    if slack_webhook and slack_webhook.startswith("https://") and not is_placeholder(slack_webhook):
        ok("ops:SLACK_WEBHOOK_URL", "Present")
    elif slack_webhook:
        warn("ops:SLACK_WEBHOOK_URL", "Present but suspicious")
    else:
        warn("ops:SLACK_WEBHOOK_URL", "Missing (optional)")

    if turnkey_admin_pin and len(turnkey_admin_pin) >= 6 and not is_placeholder(turnkey_admin_pin):
        ok("admin:TURNKEY_ADMIN_PIN", "Present")
    elif turnkey_admin_pin:
        maybe_fail(args.strict_admin, "admin:TURNKEY_ADMIN_PIN", "Present but placeholder/weak")
    else:
        maybe_fail(args.strict_admin, "admin:TURNKEY_ADMIN_PIN", "Missing")

    # ------------------------------------------------------------------
    # Database connection
    # ------------------------------------------------------------------
    try:
        from sqlalchemy import create_engine, text  # type: ignore

        engine = create_engine(database_url, future=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        ok("db:connect", "SELECT 1 succeeded")
    except Exception as e:
        fail("db:connect", f"Database connection failed: {e}")

    # ------------------------------------------------------------------
    # Render homepage via Flask test client
    # ------------------------------------------------------------------
    try:
        with app.test_client() as client:
            home = client.get("/", follow_redirects=True)
            if 200 <= home.status_code < 400:
                ok("http:/", f"Homepage responded {home.status_code}")
            else:
                fail("http:/", f"Homepage responded {home.status_code}")

            html = home.get_data(as_text=True)

            css_match = re.search(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]*ff\.css[^"]*)"', html)
            js_preload = re.search(r'<link[^>]+rel="preload"[^>]+as="script"[^>]+href="([^"]*ff-app\.js[^"]*)"', html)
            js_script = re.search(r'<script[^>]+src="([^"]*ff-app\.js[^"]*)"', html)

            if css_match:
                css_url = css_match.group(1)
                css_v = extract_asset_version(css_url)
                if css_v:
                    ok("assets:ff.css:url", css_url)
                    if in_prod and css_v == "dev":
                        fail("assets:ff.css:version", f"Production CSS still uses v=dev ({css_url})")
                    else:
                        ok("assets:ff.css:version", css_v)
                else:
                    fail("assets:ff.css:url", f"Missing ?v= token in {css_url}")
            else:
                fail("assets:ff.css:url", "Could not find stylesheet link for ff.css in rendered HTML")

            if js_preload:
                js_url = js_preload.group(1)
                js_v = extract_asset_version(js_url)
                if js_v:
                    ok("assets:ff-app.js:preload", js_url)
                else:
                    fail("assets:ff-app.js:preload", f"Missing ?v= token in {js_url}")
            else:
                warn("assets:ff-app.js:preload", "Could not find preload link for ff-app.js")

            if js_script:
                js_url = js_script.group(1)
                js_v = extract_asset_version(js_url)
                if js_v:
                    ok("assets:ff-app.js:url", js_url)
                    if in_prod and js_v == "dev":
                        fail("assets:ff-app.js:version", f"Production JS still uses v=dev ({js_url})")
                    else:
                        ok("assets:ff-app.js:version", js_v)
                else:
                    fail("assets:ff-app.js:url", f"Missing ?v= token in {js_url}")
            else:
                fail("assets:ff-app.js:url", "Could not find script tag for ff-app.js in rendered HTML")

            if "<!DOCTYPE html>" in html[:200]:
                ok("template:doctype", "DOCTYPE present near top of response")
            else:
                warn("template:doctype", "DOCTYPE not detected near top of response")

            if "ffConfig" in html:
                ok("template:ffConfig", "ffConfig payload present")
            else:
                warn("template:ffConfig", "ffConfig payload not found in homepage HTML")

            if "ffSelectors" in html:
                ok("template:ffSelectors", "ffSelectors payload present")
            else:
                warn("template:ffSelectors", "ffSelectors payload not found in homepage HTML")

            # Status probes
            status_candidates = ["/status", "/api/status", "/health", "/healthz"]
            found_status = False
            for path in status_candidates:
                resp = client.get(path)
                if resp.status_code != 404:
                    found_status = True
                    if 200 <= resp.status_code < 500:
                        ok(f"http:{path}", f"Route exists ({resp.status_code})")
                    else:
                        warn(f"http:{path}", f"Unexpected status {resp.status_code}")
                    break
            if not found_status:
                warn("http:status", "No status/health route found among common candidates")

            # Webhook route discovery from url_map
            webhook_rules = []
            for rule in app.url_map.iter_rules():
                rule_str = str(rule)
                rule_lower = rule_str.lower()
                if any(k in rule_lower for k in ("webhook", "stripe", "paypal")):
                    webhook_rules.append(rule_str)

            webhook_rules = sorted(set(webhook_rules))
            if webhook_rules:
                ok("routes:webhook_candidates", ", ".join(webhook_rules[:8]))
                for path in webhook_rules[:8]:
                    resp = client.open(path, method="OPTIONS")
                    if resp.status_code == 404:
                        fail(f"webhook:{path}", "Route discovered in url_map but OPTIONS returned 404")
                    else:
                        ok(f"webhook:{path}", f"OPTIONS responded {resp.status_code}")
            else:
                warn("routes:webhook_candidates", "No webhook-like routes found in url_map")

    except Exception as e:
        fail("render:test_client", f"Rendering/probe failed: {e}")
        traceback.print_exc()

    return finish(args)


def finish(args: argparse.Namespace) -> int:
    if args.json:
        payload = {
            "failures": FAILURES,
            "warnings": WARNINGS,
            "results": [{"status": s, "name": n, "detail": d} for s, n, d in RESULTS],
        }
        print(json.dumps(payload, indent=2))
    else:
        print_report()
    return 1 if FAILURES else 0


def print_report() -> None:
    print("\n" + "=" * 88)
    print("FutureFunded Deploy Sanity Report")
    print("=" * 88)

    width = max((len(name) for _, name, _ in RESULTS), default=10)
    for status, name, detail in RESULTS:
        icon = {"PASS": "✅", "WARN": "⚠️ ", "FAIL": "❌"}[status]
        print(f"{icon}  {name.ljust(width)}  {detail}")

    print("-" * 88)
    print(f"Failures: {FAILURES}")
    print(f"Warnings: {WARNINGS}")
    print("=" * 88)

    if FAILURES:
        print("Result: FAIL — do not ship yet.")
    elif WARNINGS:
        print("Result: PASS WITH WARNINGS — inspect the yellow bits.")
    else:
        print("Result: PASS — launch gremlins denied entry.")


if __name__ == "__main__":
    raise SystemExit(main())
