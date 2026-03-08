#!/usr/bin/env python3
"""
scripts/auto_patch_init.py

Auto-patch app/__init__.py to:
 - add a robust flask_talisman initialization with a sane CSP
 - add fallback security headers when Talisman absent
 - ensure template defaults include _v and _app
 - create a timestamped backup of the original file

Safe: creates a .bak_<ts>.py backup before writing.
"""
from pathlib import Path
import datetime
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "app" / "__init__.py"

if not TARGET.exists():
    print("ERROR: cannot find", TARGET)
    sys.exit(2)

txt = TARGET.read_text(encoding="utf-8")

bak_name = TARGET.with_suffix(f".bak_{datetime.datetime.now():%Y%m%d_%H%M%S}.py")
bak_name.write_text(txt, encoding="utf-8")
print("Backup created:", bak_name)

# --- 1) Replace _init_talisman function block ---
# Find the function def and replace until the next function def ("def _init_cors")
talisman_pattern = re.compile(
    r"(def\s+_init_talisman\s*\(app:\s*Flask\)\s*->\s*None:\s*\n)([\s\S]*?)(\n\s*def\s+_init_cors\s*\()",
    re.M,
)

if not talisman_pattern.search(txt):
    print("WARN: _init_talisman pattern not found — aborting talisman patch.")
else:
    replacement_block = r"""\1
    # Initialize CSP + security headers.
    # Uses flask_talisman when available in production, otherwise injects a minimal set of security headers.
    try:
        # if flask_talisman is available and we're in production, configure a strict CSP
        if Talisman and _is_prod(app):
            # Default CSP - can be augmented via FF_CSP_EXTRA env (comma-separated additional sources)
            csp = {
                "default-src": ["'self'"],
                "script-src": ["'self'", "https://js.stripe.com", "https://checkout.stripe.com", "https://www.paypal.com"],
                "style-src": ["'self'", "'unsafe-inline'"],
                "img-src": ["'self'", "data:", "https:"],
                "connect-src": ["'self'", "https://api.stripe.com", "https://events.stripe.com", "https://www.paypal.com"],
                "frame-src": ["https://js.stripe.com", "https://www.paypal.com"],
            }

            # Allow adding extra domains via FF_CSP_EXTRA env var (comma-separated)
            extra = (os.getenv("FF_CSP_EXTRA") or "").strip()
            if extra:
                for part in [p.strip() for p in extra.split(",") if p.strip()]:
                    # append to connect-src and script-src conservatively
                    csp.get("connect-src", []).append(part)
                    csp.get("script-src", []).append(part)

            report_only = _env_bool_or("FF_CSP_REPORT_ONLY", False)

            # Initialize Talisman with explicit options
            Talisman(
                app,
                content_security_policy=csp,
                content_security_policy_report_only=report_only,
                force_https=_env_bool_or("FF_FORCE_HTTPS", _is_prod(app)),
                strict_transport_security=_env_bool_or("FF_STRICT_TRANSPORT", True),
                frame_options="DENY",
                session_cookie_secure=bool(app.config.get("SESSION_COOKIE_SECURE", False)),
                referrer_policy="no-referrer-when-downgrade",
            )
            app.logger.info("Talisman initialized (CSP enforced%s).", " (report-only)" if report_only else "")
            return
    except Exception as e:
        # If talisman fails to init, log and continue to fallback header injection
        app.logger.warning("Talisman init failed: %s", e)

    # If Talisman unavailable or not initialized, inject fallback security headers.
    @app.after_request
    def _ff_fallback_security_headers(resp):
        # Only set defaults if the header is not already present (allow overrides)
        resp.headers.setdefault("Content-Security-Policy", \"\"\"default-src 'self'; script-src 'self' https://js.stripe.com https://checkout.stripe.com https://www.paypal.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https://js.stripe.com https://www.paypal.com;\"\"\")
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer-when-downgrade")
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
        resp.headers.setdefault("Permissions-Policy", "geolocation=()")
        return resp
\3
"""
    txt = talisman_pattern.sub(replacement_block, txt)
    print("Patched _init_talisman (or added fallback headers).")

# --- 2) Enhance _register_default_template_context to include _v and _app ---
# Locate the context processor return dict inside _register_default_template_context
context_pattern = re.compile(
    r"(def\s+_register_default_template_context\s*\(app:\s*Flask\)\s*->\s*None:\s*\n\s*\"\"\"[\s\S]*?\"\"\"\s*\n\s*@app\.context_processor\s*\n\s*def\s+_defaults\s*\(\)\s*:\s*\n\s*return\s*)(\{[\s\S]*?\})",
    re.M,
)

if not context_pattern.search(txt):
    # Fallback: find simpler pattern that returns {"FF_CFG": {}}
    simple_pat = re.compile(r"@app\.context_processor\s*\n\s*def\s+_defaults\s*\(\)\s*:\s*\n\s*return\s*\{([^\}]*)\}", re.M)
    m2 = simple_pat.search(txt)
    if m2:
        old_inner = m2.group(1)
        new_inner = '"FF_CFG": {}, "_v": app.config.get("FF_BUILD_ID", app.config.get("FF_VERSION", \"dev\")), "_app": app.config.get("BRAND_NAME", \"FutureFunded\")'
        txt = simple_pat.sub(lambda mm: "@app.context_processor\n    def _defaults():\n        return {" + new_inner + "}", txt, count=1)
        print("Patched simplified _defaults context")
    else:
        print("WARN: could not find _register_default_template_context pattern — skipping template defaults patch.")
else:
    def repl(m):
        pre = m.group(1)
        # keep docstring, then return dict with extra keys using app.config
        newdict = (
            "{\n"
            "            \"FF_CFG\": {},\n"
            "            \"_v\": app.config.get(\"FF_BUILD_ID\", app.config.get(\"FF_VERSION\", \"dev\")),\n"
            "            \"_app\": app.config.get(\"BRAND_NAME\", \"FutureFunded\"),\n"
            "        }"
        )
        return pre + newdict
    txt = context_pattern.sub(repl, txt, count=1)
    print("Patched _register_default_template_context to include _v and _app.")

# Write back
TARGET.write_text(txt, encoding="utf-8")
print("Wrote patched file:", TARGET)
print("Done. Review the backup and patched file. Run your tests / smoke script next.")
