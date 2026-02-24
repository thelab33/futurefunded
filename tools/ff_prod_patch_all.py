#!/usr/bin/env python3
"""
FutureFunded — Production Patch-All Tool (v2.1)
- Hook-safe
- CSP nonce-ready templates
- Nonce-aware CSP + security headers
- Strips prod header leaks (X-FutureFunded-Env/Config)
- Adds HSTS/nosniff/referrer/permissions-policy
- Patches app factory to install middleware safely (no indentation traps)
- Repairs known indentation bug in app/__init__.py (if/return block)

Usage:
  python3 tools/ff_prod_patch_all.py --dry-run
  python3 tools/ff_prod_patch_all.py --write --backup

Verify:
  python3 -m py_compile app/security_headers.py app/__init__.py app/config/config.py
  curl -I https://getfuturefunded.com/ | rg -i 'content-security-policy|strict-transport|nosniff|referrer-policy|permissions-policy|x-futurefunded|access-control-expose|set-cookie'
"""

from __future__ import annotations

import argparse
import dataclasses
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Optional, Tuple


# ─────────────────────────────────────────────────────────────
# Core helpers
# ─────────────────────────────────────────────────────────────

def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def backup_file(p: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    dst = backup_dir / f"{p.name}.{utc_stamp()}.bak"
    shutil.copy2(p, dst)
    return dst


def find_repo_root(start: Path) -> Optional[Path]:
    cur = start.resolve()
    for _ in range(10):
        if (cur / "app" / "__init__.py").exists() and (cur / "app").is_dir():
            return cur
        cur = cur.parent
    return None


@dataclasses.dataclass
class PatchResult:
    changed: bool
    notes: list[str]


@dataclasses.dataclass
class Runner:
    root: Path
    dry_run: bool
    write: bool
    backup: bool
    backup_dir: Path
    changed: list[str] = dataclasses.field(default_factory=list)
    unchanged: list[str] = dataclasses.field(default_factory=list)
    warnings: list[str] = dataclasses.field(default_factory=list)

    def apply_file_patch(
        self,
        rel_path: str,
        patch_fn: Callable[[str], Tuple[str, PatchResult]],
    ) -> None:
        p = self.root / rel_path
        if not p.exists():
            self.warnings.append(f"SKIP (missing): {rel_path}")
            return

        before = read_text(p)
        after, _res = patch_fn(before)

        if after == before:
            self.unchanged.append(rel_path)
            return

        self.changed.append(rel_path)
        if self.dry_run and not self.write:
            return

        if self.backup:
            try:
                backup_file(p, self.backup_dir)
            except Exception as e:
                self.warnings.append(f"WARN: backup failed for {rel_path}: {e}")

        write_text(p, after)

    def create_or_replace(
        self,
        rel_path: str,
        content: str,
        require_marker: Optional[str] = None,
    ) -> None:
        p = self.root / rel_path
        existing = p.exists()
        before = read_text(p) if existing else ""

        if require_marker and existing and require_marker in before:
            self.unchanged.append(rel_path)
            return

        if existing and before == content:
            self.unchanged.append(rel_path)
            return

        self.changed.append(rel_path)

        if self.dry_run and not self.write:
            return

        if existing and self.backup:
            try:
                backup_file(p, self.backup_dir)
            except Exception as e:
                self.warnings.append(f"WARN: backup failed for {rel_path}: {e}")

        write_text(p, content)


# ─────────────────────────────────────────────────────────────
# Patch: templates/index.html nonce readiness
# ─────────────────────────────────────────────────────────────

NONCE_MACRO_BLOCK = r"""{# ----------------------------
  CSP nonce helper (safe)
---------------------------- #}
{% macro nonce_attr() -%}
  {%- if csp_nonce|default('') -%}nonce="{{ csp_nonce|e }}"{%- endif -%}
{%- endmacro %}
"""

SCRIPT_OPEN_RE = re.compile(r"<script\b([^>]*)>", re.IGNORECASE)


def patch_template_nonce(content: str) -> Tuple[str, PatchResult]:
    notes: list[str] = []

    if "macro nonce_attr" not in content:
        m = re.search(r"(?is)<!doctype[^>]*>\s*", content)
        if m:
            insert_at = m.end()
            content = content[:insert_at] + "\n" + NONCE_MACRO_BLOCK + "\n" + content[insert_at:]
        else:
            content = NONCE_MACRO_BLOCK + "\n" + content
        notes.append("Injected nonce_attr macro")

    def repl(match: re.Match) -> str:
        attrs = match.group(1) or ""
        low = attrs.lower()
        if "nonce=" in low or "nonce_attr" in low:
            return match.group(0)
        attrs2 = attrs.rstrip()
        spacer = "" if attrs2.endswith((" ", "\t", "\n")) or attrs2 == "" else " "
        return f"<script{attrs2}{spacer}{{{{ nonce_attr() }}}}>"

    new = SCRIPT_OPEN_RE.sub(repl, content)

    if new != content:
        notes.append("Added nonce_attr() to <script> tags missing a nonce")
        return new, PatchResult(True, notes)

    return content, PatchResult(bool(notes), notes)


# ─────────────────────────────────────────────────────────────
# Create/Replace: app/security_headers.py (nonce-aware CSP)
# ─────────────────────────────────────────────────────────────

SECURITY_HEADERS_V2_MARKER = "FF_SECURITY_HEADERS_V2"

SECURITY_HEADERS_V2_TEMPLATE = r'''# app/security_headers.py
# FutureFunded — Nonce-aware CSP + Security Headers (v2)
# Marker: __FF_SECURITY_MARKER__

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from typing import Iterable

from flask import g, request


def _bool(val: object, default: bool = False) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return default
    s = str(val).strip().lower()
    return s in {"1", "true", "yes", "on"}


def _csv(val: object) -> list[str]:
    if not val:
        return []
    if isinstance(val, (list, tuple, set)):
        out: list[str] = []
        for x in val:
            sx = str(x).strip()
            if sx:
                out.append(sx)
        return out
    s = str(val)
    return [p.strip() for p in s.split(",") if p.strip()]


def _is_secure_request() -> bool:
    try:
        if request.is_secure:
            return True
    except Exception:
        pass

    xf = (request.headers.get("X-Forwarded-Proto", "") or "").split(",")[0].strip().lower()
    if xf == "https":
        return True

    try:
        return request.scheme == "https"
    except Exception:
        return False


def _host() -> str:
    h = (request.headers.get("X-Forwarded-Host") or request.host or "").strip().lower()
    return h.split(":")[0] if h else ""


@dataclass(frozen=True)
class CSPConfig:
    preset: str = "prod"  # "dev" or "prod"
    report_only: bool = False
    report_uri: str = ""
    style_unsafe_inline: bool = False
    extra_script_src: tuple[str, ...] = ()
    extra_connect_src: tuple[str, ...] = ()
    extra_frame_src: tuple[str, ...] = ()
    extra_img_src: tuple[str, ...] = ()


def build_csp(nonce: str, cfg: CSPConfig) -> str:
    n = nonce.strip()
    nonce_part = f"'nonce-{n}'" if n else ""

    # Stripe + PayPal + video embeds
    script_src = [
        "'self'",
        nonce_part,
        "https://js.stripe.com",
        "https://www.paypal.com",
        "https://www.paypalobjects.com",
    ]
    connect_src = [
        "'self'",
        "https://api.stripe.com",
        "https://checkout.stripe.com",
        "https://m.stripe.network",
        "https://www.paypal.com",
        "https://www.paypalobjects.com",
    ]
    frame_src = [
        "'self'",
        "https://js.stripe.com",
        "https://hooks.stripe.com",
        "https://checkout.stripe.com",
        "https://www.paypal.com",
        "https://player.vimeo.com",
        "https://www.youtube.com",
    ]
    img_src = ["'self'", "data:", "https:"]
    font_src = ["'self'", "data:", "https:"]

    style_src = ["'self'", "https:"]
    if cfg.style_unsafe_inline:
        style_src.append("'unsafe-inline'")

    script_src += list(cfg.extra_script_src)
    connect_src += list(cfg.extra_connect_src)
    frame_src += list(cfg.extra_frame_src)
    img_src += list(cfg.extra_img_src)

    def _clean(xs: Iterable[str]) -> list[str]:
        out: list[str] = []
        for x in xs:
            sx = str(x).strip()
            if sx:
                out.append(sx)
        return out

    directives: dict[str, list[str]] = {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'self'"],
        "form-action": ["'self'", "https://checkout.stripe.com", "https://www.paypal.com"],
        "script-src": _clean(script_src),
        "connect-src": _clean(connect_src),
        "frame-src": _clean(frame_src),
        "img-src": _clean(img_src),
        "font-src": _clean(font_src),
        "style-src": _clean(style_src),
    }

    parts: list[str] = []
    for k, v in directives.items():
        parts.append(f"{k} {' '.join(v)}")

    if cfg.preset == "prod":
        parts.append("upgrade-insecure-requests")
        parts.append("block-all-mixed-content")

    if cfg.report_uri:
        parts.append(f"report-uri {cfg.report_uri}")

    return "; ".join(parts)


def _security_headers_base() -> dict[str, str]:
    return {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": os.getenv("FF_REFERRER_POLICY", "strict-origin-when-cross-origin"),
        "Permissions-Policy": os.getenv(
            "FF_PERMISSIONS_POLICY",
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
        ),
    }


def _hsts_value() -> str:
    preload = _bool(os.getenv("FF_HSTS_PRELOAD"), False)
    include_sub = _bool(os.getenv("FF_HSTS_INCLUDE_SUBDOMAINS"), True)
    max_age = int(os.getenv("FF_HSTS_MAX_AGE", "31536000"))
    v = f"max-age={max_age}"
    if include_sub:
        v += "; includeSubDomains"
    if preload:
        v += "; preload"
    return v


def _strip_prod_leaks(resp) -> None:
    leak_keys = {"X-FutureFunded-Env", "X-FutureFunded-Config"}

    for k in list(resp.headers.keys()):
        if k in leak_keys:
            try:
                resp.headers.pop(k, None)
            except Exception:
                pass

    aceh = resp.headers.get("Access-Control-Expose-Headers", "")
    if aceh:
        toks = [t.strip() for t in aceh.split(",") if t.strip()]
        toks2 = [t for t in toks if t not in leak_keys]
        if toks2:
            resp.headers["Access-Control-Expose-Headers"] = ", ".join(toks2)
        else:
            try:
                resp.headers.pop("Access-Control-Expose-Headers", None)
            except Exception:
                pass


class SecurityHeadersMiddleware:
    """
    WSGI wrapper:
    - strips prod leaks even if Flask hooks don't run
    - can set baseline headers (no CSP nonce at this layer)
    """

    def __init__(self, app, prod_hosts: Iterable[str] = ()):
        self.app = app
        self.prod_hosts = {h.strip().lower() for h in prod_hosts if str(h).strip()}

    def __call__(self, environ, start_response):
        def _start(status, headers, exc_info=None):
            hdrs = [(k, v) for (k, v) in headers]

            host = (environ.get("HTTP_X_FORWARDED_HOST") or environ.get("HTTP_HOST") or "").split(":")[0].strip().lower()
            is_prod_host = host in self.prod_hosts if self.prod_hosts else False
            ff_env = (os.getenv("FF_ENV") or os.getenv("FLASK_ENV") or os.getenv("ENV") or "").strip().lower()
            is_prod_env = ff_env in {"prod", "production"}

            if is_prod_host or is_prod_env:
                leak = {"X-FutureFunded-Env", "X-FutureFunded-Config"}
                hdrs = [(k, v) for (k, v) in hdrs if k not in leak]

                # strip from expose list too
                for i, (k, v) in enumerate(list(hdrs)):
                    if k.lower() == "access-control-expose-headers":
                        toks = [t.strip() for t in v.split(",") if t.strip()]
                        toks2 = [t for t in toks if t not in leak]
                        if toks2:
                            hdrs[i] = (k, ", ".join(toks2))
                        else:
                            hdrs.pop(i)
                        break

                base = _security_headers_base()
                for k, v in base.items():
                    if not any(hk.lower() == k.lower() for hk, _ in hdrs):
                        hdrs.append((k, v))

                xfp = (environ.get("HTTP_X_FORWARDED_PROTO") or "").split(",")[0].strip().lower()
                scheme = (environ.get("wsgi.url_scheme") or "").strip().lower()
                is_https = (xfp == "https") or (scheme == "https")
                if is_https and not any(hk.lower() == "strict-transport-security" for hk, _ in hdrs):
                    hdrs.append(("Strict-Transport-Security", _hsts_value()))

            return start_response(status, hdrs, exc_info)

        return self.app(environ, _start)


def install_security_middleware(flask_app) -> None:
    prod_hosts = _csv(os.getenv("FF_PROD_HOSTS") or "getfuturefunded.com")

    # WSGI wrapper
    try:
        flask_app.wsgi_app = SecurityHeadersMiddleware(flask_app.wsgi_app, prod_hosts=prod_hosts)
    except Exception:
        pass

    @flask_app.before_request
    def _ff_nonce():
        g.csp_nonce = secrets.token_urlsafe(16)

    @flask_app.context_processor
    def _ff_ctx():
        return {"csp_nonce": getattr(g, "csp_nonce", "")}

    @flask_app.after_request
    def _ff_headers(resp):
        host = _host()
        ff_env = (os.getenv("FF_ENV") or os.getenv("FLASK_ENV") or os.getenv("ENV") or "").strip().lower()
        is_prod = (host in {h.lower() for h in prod_hosts}) or (ff_env in {"prod", "production"})

        # baseline
        base = _security_headers_base()
        for k, v in base.items():
            resp.headers[k] = v

        if is_prod:
            _strip_prod_leaks(resp)

            if _is_secure_request():
                resp.headers["Strict-Transport-Security"] = _hsts_value()

            report_only = _bool(os.getenv("FF_CSP_REPORT_ONLY"), False)
            preset = (os.getenv("FF_CSP_PRESET", "prod").strip().lower() or "prod")
            style_unsafe = _bool(os.getenv("FF_CSP_STYLE_UNSAFE_INLINE"), False)

            cfg = CSPConfig(
                preset="prod" if preset != "dev" else "dev",
                report_only=report_only,
                report_uri=(os.getenv("FF_CSP_REPORT_URI") or "").strip(),
                style_unsafe_inline=style_unsafe,
                extra_script_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_SCRIPT_SRC"))),
                extra_connect_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_CONNECT_SRC"))),
                extra_frame_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_FRAME_SRC"))),
                extra_img_src=tuple(_csv(os.getenv("FF_CSP_EXTRA_IMG_SRC"))),
            )
            nonce = getattr(g, "csp_nonce", "") or ""
            csp_val = build_csp(nonce, cfg)
            hdr = "Content-Security-Policy-Report-Only" if cfg.report_only else "Content-Security-Policy"
            resp.headers[hdr] = csp_val

        return resp
'''


def security_headers_v2() -> str:
    return SECURITY_HEADERS_V2_TEMPLATE.replace("__FF_SECURITY_MARKER__", SECURITY_HEADERS_V2_MARKER)


# ─────────────────────────────────────────────────────────────
# Patch: app/__init__.py safe injection + known indentation repair
# ─────────────────────────────────────────────────────────────

def _repair_known_indent_bug(s: str) -> Tuple[str, bool]:
    """
    Fixes this common bad patch outcome:

      if isinstance(target, str) and target == "app.config.config.DevelopmentConfig":
      return "app.config.DevelopmentConfig"

    -> ensure return line is indented, or insert it if missing.
    """
    changed = False

    pat = re.compile(
        r'(?m)^(?P<indent>[ \t]*)if\s+isinstance\(target,\s*str\)\s+and\s+target\s*==\s*"app\.config\.config\.DevelopmentConfig"\s*:\s*$'
    )
    m = pat.search(s)
    if not m:
        return s, changed

    indent = m.group("indent")
    after = s[m.end():]

    # Look at the next 1-3 lines
    lines = after.splitlines(True)
    if not lines:
        # insert return
        insert = f"{indent}    return \"app.config.DevelopmentConfig\"\n"
        s = s[:m.end()] + "\n" + insert
        return s, True

    # Find first non-empty line
    idx = None
    for i, ln in enumerate(lines[:6]):
        if ln.strip():
            idx = i
            break

    if idx is None:
        # insert return
        insert = f"{indent}    return \"app.config.DevelopmentConfig\"\n"
        s = s[:m.end()] + "\n" + insert + after
        return s, True

    ln = lines[idx]
    # If it's a return but not indented enough, fix it.
    if re.match(rf'^{re.escape(indent)}return\s+"app\.config\.DevelopmentConfig"\s*$', ln.rstrip("\n")):
        lines[idx] = f"{indent}    return \"app.config.DevelopmentConfig\"\n"
        new_after = "".join(lines)
        s = s[:m.end()] + new_after
        return s, True

    # If the next logical line isn't a return, add a return line immediately after the if.
    if "return" not in ln:
        insert = f"\n{indent}    return \"app.config.DevelopmentConfig\"\n"
        s = s[:m.end()] + insert + after
        return s, True

    return s, changed


def patch_app_init(content: str) -> Tuple[str, PatchResult]:
    notes: list[str] = []
    marker = "FF_PROD_PATCH_V2: install_security_middleware"

    # repair known indentation bug first
    fixed, did = _repair_known_indent_bug(content)
    if did:
        content = fixed
        notes.append("Repaired known indentation bug for target DevelopmentConfig mapping")

    if marker in content:
        return content, PatchResult(bool(notes), notes)

    # Remove old patch block if present (legacy)
    content2 = re.sub(
        r"(?ms)^[ \t]*#\s*FF_PROD_PATCH: install_security_middleware.*?\n(?=^[ \t]*\S|\Z)",
        "",
        content,
    )
    if content2 != content:
        content = content2
        notes.append("Removed old FF_PROD_PATCH block (cleanup)")

    # Find last "return app"
    m = None
    for m in re.finditer(r"(?m)^(?P<indent>[ \t]*)return\s+app\s*$", content):
        pass
    if not m:
        return content, PatchResult(bool(notes), notes + ["WARN: could not find 'return app' to inject middleware"])

    indent = m.group("indent")
    inject = (
        f"{indent}# {marker}\n"
        f"{indent}try:\n"
        f"{indent}    from .security_headers import install_security_middleware\n"
        f"{indent}    install_security_middleware(app)\n"
        f"{indent}except Exception as _e:\n"
        f"{indent}    try:\n"
        f"{indent}        app.logger.warning('Security middleware not installed: %s', _e)\n"
        f"{indent}    except Exception:\n"
        f"{indent}        pass\n\n"
    )

    pos = m.start()
    new = content[:pos] + inject + content[pos:]
    notes.append("Injected install_security_middleware(app) before return app")
    return new, PatchResult(True, notes)


# ─────────────────────────────────────────────────────────────
# Patch: app/config/config.py harden ProductionConfig (idempotent)
# ─────────────────────────────────────────────────────────────

def patch_config_prod(content: str) -> Tuple[str, PatchResult]:
    notes: list[str] = []
    marker = "FF_PROD_PATCH_V2: hardened production defaults"

    if "class ProductionConfig" not in content:
        return content, PatchResult(False, ["SKIP: ProductionConfig not found"])

    if marker in content:
        return content, PatchResult(False, notes)

    m = re.search(r"(?m)^class\s+ProductionConfig\b.*:\s*$", content)
    if not m:
        return content, PatchResult(False, ["WARN: couldn't locate ProductionConfig block"])

    insert_at = m.end()
    block = (
        "\n"
        f"    # {marker}\n"
        "    DEBUG = False\n"
        "    TESTING = False\n"
        "    PREFERRED_URL_SCHEME = 'https'\n"
        "\n"
        "    SESSION_COOKIE_SECURE = True\n"
        "    SESSION_COOKIE_HTTPONLY = True\n"
        "    SESSION_COOKIE_SAMESITE = 'Lax'\n"
        "    REMEMBER_COOKIE_SECURE = True\n"
        "    REMEMBER_COOKIE_HTTPONLY = True\n"
        "    REMEMBER_COOKIE_SAMESITE = 'Lax'\n"
        "\n"
        "    # CSP defaults (prod)\n"
        "    CSP_PRESET = 'prod'\n"
        "    CSP_STYLE_ALLOW_UNSAFE_INLINE = False\n"
        "\n"
    )

    new = content[:insert_at] + block + content[insert_at:]
    notes.append("Injected hardened ProductionConfig defaults")
    return new, PatchResult(True, notes)


# ─────────────────────────────────────────────────────────────
# Patch: Makefile targets (optional)
# ─────────────────────────────────────────────────────────────

def patch_makefile(content: str) -> Tuple[str, PatchResult]:
    notes: list[str] = []
    phony_needed = ".PHONY: qa-fast qa-headed qa-strict-headed qa-prod-strict qa-all"

    if phony_needed in content and "qa-fast:" in content and "qa-all:" in content:
        return content, PatchResult(False, notes)

    insert = (
        "\n"
        + phony_needed + "\n\n"
        "# Smoke only (fastest)\n"
        "qa-fast: smoke-overlays\n"
        "\t@echo \"✅ QA FAST PASS\"\n\n"
        "# Headed debug run (local)\n"
        "qa-headed:\n"
        "\t@$(MAKE) preflight HEADED=1 RETRIES=1\n\n"
        "# Strict + headed debug (local)\n"
        "qa-strict-headed:\n"
        "\t@$(MAKE) qa-strict HEADED=1 RETRIES=1\n\n"
        "# Production strict (non-invasive; validates overlays + strict JS markers locally)\n"
        "qa-prod-strict:\n"
        "\t@$(MAKE) qa-strict FF_URL=\"https://getfuturefunded.com/\" FF_BROWSER=\"chrome\" TIMEOUT_MS=\"25000\"\n\n"
        "# Everything gate (when you’re about to ship)\n"
        "qa-all: css-refresh qa-strict\n"
        "\t@echo \"✅ QA ALL PASS\"\n"
    )

    new = content.rstrip() + "\n" + insert
    notes.append("Appended qa-fast/qa-all family targets")
    return new, PatchResult(True, notes)


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="", help="Repo root (auto-detect if omitted)")
    ap.add_argument("--dry-run", action="store_true", help="Show what would change (default mode if --write not set)")
    ap.add_argument("--write", action="store_true", help="Write changes")
    ap.add_argument("--backup", action="store_true", help="Write backups to tools/.artifacts/backups/")
    args = ap.parse_args()

    here = Path(__file__).resolve()
    root = Path(args.root).resolve() if args.root else find_repo_root(here.parent)
    if not root:
        print("FAIL: Could not detect repo root. Pass --root /path/to/repo", file=sys.stderr)
        return 2

    dry = bool(args.dry_run or (not args.write))
    write = bool(args.write)
    backup = bool(args.backup)
    backup_dir = root / "tools" / ".artifacts" / "backups"

    r = Runner(root=root, dry_run=dry, write=write, backup=backup, backup_dir=backup_dir)

    print(f"OK: Root: {root}")
    print(f"OK: Mode: {'DRY-RUN' if dry and not write else 'WRITE'}")
    print(f"OK: Backups: {'ON' if backup else 'OFF'}")
    print("")

    # 1) security_headers.py (create/replace)
    r.create_or_replace("app/security_headers.py", security_headers_v2(), require_marker=SECURITY_HEADERS_V2_MARKER)

    # 2) app/__init__.py injection + repair
    r.apply_file_patch("app/__init__.py", patch_app_init)

    # 3) Production config hardening
    r.apply_file_patch("app/config/config.py", patch_config_prod)

    # 4) Template nonce readiness
    r.apply_file_patch("app/templates/index.html", patch_template_nonce)

    # 5) Makefile (optional)
    if (root / "Makefile").exists():
        r.apply_file_patch("Makefile", patch_makefile)

    print("== Summary ==")
    print(f"Changed: {len(r.changed)}")
    for p in r.changed:
        print(f"  ✅ {p}")
    print(f"Unchanged: {len(r.unchanged)}")
    for p in r.unchanged:
        print(f"  • {p}")
    if r.warnings:
        print("")
        print("== Warnings ==")
        for w in r.warnings:
            print(f"  ⚠️ {w}")

    print("")
    print("== Verify ==")
    print("python3 -m py_compile app/security_headers.py app/__init__.py app/config/config.py")
    print("")
    print("curl -I https://getfuturefunded.com/ | rg -i 'content-security-policy|strict-transport|nosniff|referrer-policy|permissions-policy|x-futurefunded|access-control-expose|set-cookie'")
    print("")
    print("Expect in PROD:")
    print("  - Content-Security-Policy (or Report-Only if FF_CSP_REPORT_ONLY=1)")
    print("  - Strict-Transport-Security present (when HTTPS is detected)")
    print("  - X-Content-Type-Options: nosniff")
    print("  - Referrer-Policy + Permissions-Policy")
    print("  - NO X-FutureFunded-Env / X-FutureFunded-Config leak in response headers")
    print("")
    print("Env knobs (optional):")
    print("  FF_ENV=production")
    print("  FF_PROD_HOSTS=getfuturefunded.com")
    print("  FF_CSP_REPORT_ONLY=0")
    print("  FF_CSP_STYLE_UNSAFE_INLINE=0")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

