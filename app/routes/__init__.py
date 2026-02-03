from __future__ import annotations

"""
FutureFunded — Blueprint Loader (hardened + repo-drift tolerant)

Core goals:
- Register blueprints reliably even if module paths move over time
- Prefer deterministic explicit blueprint modules in production
- Allow safe auto-discovery for development or when paths vary

Env knobs:
  # Disable aliases by name (alias or blueprint.name)
  DISABLE_BPS=api,sms,fallback

  # Override prefix per alias (sanitized). Examples:
  BP_PREFIX__API=/v2
  BP_PREFIX__PAYMENTS=/payments

  # Print route summary (also true when app.debug)
  ROUTE_SUMMARY=1

  # Explicit modules to import (comma-separated) — recommended for production:
  BP_MODULES=app.routes.main,app.routes.api,app.blueprints.payments

  # Enable/disable discovery fallback (default: on in dev, off in prod unless explicitly enabled)
  BP_DISCOVER=1

  # Where discovery looks (comma-separated package prefixes)
  BP_DISCOVER_PREFIXES=app.routes,app.blueprints,app.admin

  # Exclude modules containing these substrings (comma-separated)
  BP_DISCOVER_EXCLUDE=tests,migrations,seed,fixtures

Notes:
- No reliance on bp.url_prefix (Flask doesn’t guarantee it exists).
- Prefix comes from: BP_PREFIX__ALIAS > spec/default > None.
"""

import logging
import os
import pkgutil
from dataclasses import dataclass
from importlib import import_module
from typing import Iterable, Optional

from flask import Blueprint, Flask

log = logging.getLogger(__name__)

# ─── Optional CLI Group ──────────────────────────────────────────────────────
try:
    from app.cli import starforge  # type: ignore
except Exception:  # pragma: no cover
    starforge = None  # type: ignore


# ─── Blueprint Spec Definition ──────────────────────────────────────────────
@dataclass(frozen=True)
class BlueprintSpec:
    alias: str
    module: str
    attrs: tuple[str, ...] = ("bp", "blueprint")
    prefix: Optional[str] = None


# ─── Helpers ────────────────────────────────────────────────────────────────
def _env_bool(name: str) -> Optional[bool]:
    v = os.getenv(name)
    if v is None:
        return None
    vv = str(v).strip().lower()
    if vv in {"1", "true", "yes", "y", "on"}:
        return True
    if vv in {"0", "false", "no", "n", "off"}:
        return False
    return None


def _parse_csv(env_value: Optional[str]) -> list[str]:
    return [p.strip() for p in (env_value or "").split(",") if p.strip()]


def _parse_disabled_env(env_value: Optional[str]) -> set[str]:
    # Allow disable by alias *or* blueprint.name
    return {p.strip().lower() for p in (env_value or "").split(",") if p.strip()}


def _env_prefix_override(alias: str, default: Optional[str]) -> Optional[str]:
    return os.getenv(f"BP_PREFIX__{alias.upper()}", default)


def _sanitize_prefix(prefix: Optional[str]) -> Optional[str]:
    if prefix is None:
        return None
    p = str(prefix).strip()
    if not p or p == "/":
        return None
    if not p.startswith("/"):
        p = "/" + p
    while "//" in p:
        p = p.replace("//", "/")
    p = p.rstrip("/")
    return p or None


def _iter_candidates(attrs: Iterable[str] | str) -> list[str]:
    if isinstance(attrs, str):
        return [a.strip() for a in attrs.split("|") if a.strip()]
    return [a for a in attrs if a]


def _import_blueprints_from_module(module: str, attrs: Iterable[str]) -> list[Blueprint]:
    """
    Returns *all* Blueprint objects we can find in a module.
    - First checks common attribute names (bp, api_bp, main_bp, etc.)
    - Then scans module globals for Blueprint instances
    """
    try:
        mod = import_module(module)
    except Exception as exc:
        log.debug("Import failed: %s (%s)", module, exc)
        return []

    found: list[Blueprint] = []

    # 1) Named attrs
    for name in _iter_candidates(attrs):
        try:
            cand = getattr(mod, name, None)
            if isinstance(cand, Blueprint):
                found.append(cand)
        except Exception:
            continue

    # 2) Scan everything (covers weird naming)
    try:
        for _, cand in vars(mod).items():
            if isinstance(cand, Blueprint) and cand not in found:
                found.append(cand)
    except Exception:
        pass

    return found


def _safe_register(app: Flask, *, alias: str, bp: Blueprint, prefix: Optional[str]) -> bool:
    alias_lc = alias.lower()
    bpname_lc = (bp.name or "").lower()

    disabled = getattr(app, "_ff_disabled_bps", set())
    if alias_lc in disabled or bpname_lc in disabled:
        app.logger.info("⏭️ Disabled via env: %s (bp=%s)", alias_lc, bp.name)
        return False

    if bp.name in app.blueprints:
        app.logger.info("⏭️ Already registered: %s", bp.name)
        return False

    final_prefix = _sanitize_prefix(_env_prefix_override(alias_lc, prefix))

    try:
        app.register_blueprint(bp, url_prefix=final_prefix)
        app.logger.info("🧩 Registered blueprint: %-14s bp=%-18s prefix=%s", alias, bp.name, final_prefix or "/")
        return True
    except Exception as exc:  # pragma: no cover
        app.logger.error("❌ Failed to register '%s' (bp=%s): %s", alias, bp.name, exc, exc_info=True)
        return False


def _route_summary(app: Flask) -> None:
    want = bool(app.debug) or os.getenv("ROUTE_SUMMARY", "0").strip().lower() in {"1", "true", "yes", "on"}
    if not want:
        return

    try:
        bps = ", ".join(sorted(app.blueprints.keys())) or "—"
        app.logger.info("📦 Blueprints: %s", bps)

        lines: list[str] = []
        for rule in sorted(app.url_map.iter_rules(), key=lambda r: (str(r.rule), r.endpoint)):
            methods = ",".join(
                sorted(m for m in (rule.methods or set()) if m in {"GET", "POST", "PUT", "PATCH", "DELETE"})
            )
            lines.append(f"{rule.rule:<44} {methods:<16} → {rule.endpoint}")

        if lines:
            app.logger.info("🔗 Routes:\n%s", "\n".join(lines))
    except Exception:  # pragma: no cover
        app.logger.debug("Could not render route summary", exc_info=True)


# ─── Fallback Blueprint ─────────────────────────────────────────────────────
fallback_bp = Blueprint("fallback", __name__)


@fallback_bp.get("/")
def _default_root() -> str:
    return "✅ FutureFunded backend is running.<br><strong>Main homepage not registered.</strong>"


# ─── Discovery (repo-drift tolerant) ─────────────────────────────────────────
def _discover_blueprints(prefixes: list[str], exclude_substrings: list[str]) -> list[tuple[str, Blueprint]]:
    """
    Walks packages under given prefixes and returns (alias, blueprint).
    Alias is derived from blueprint.name (preferred) or module leaf.
    """
    results: list[tuple[str, Blueprint]] = []

    for pkg_prefix in prefixes:
        try:
            pkg = import_module(pkg_prefix)
        except Exception as exc:
            log.debug("Discovery skip (cannot import prefix): %s (%s)", pkg_prefix, exc)
            continue

        pkg_path = getattr(pkg, "__path__", None)
        if not pkg_path:
            continue

        for modinfo in pkgutil.walk_packages(pkg_path, prefix=pkg_prefix + "."):
            modname = modinfo.name
            if any(s in modname for s in exclude_substrings):
                continue

            bps = _import_blueprints_from_module(modname, attrs=())
            for bp in bps:
                alias = (bp.name or modname.rsplit(".", 1)[-1]).strip()
                if not alias:
                    alias = modname.rsplit(".", 1)[-1]
                results.append((alias, bp))

    # De-dupe by blueprint.name
    seen: set[str] = set()
    out: list[tuple[str, Blueprint]] = []
    for alias, bp in results:
        if bp.name in seen:
            continue
        seen.add(bp.name)
        out.append((alias, bp))
    return out


def _default_discover_enabled(env: str) -> bool:
    # default: on in dev/test, off in prod unless explicitly enabled
    env_lc = (env or "").strip().lower()
    if env_lc in {"production", "prod"}:
        return False
    return True


def _ordered_alias_weight(alias: str) -> int:
    """
    Ensures sensible registration order. Lower is earlier.
    Adjust as your platform grows.
    """
    a = alias.lower()
    if "diag" in a or "health" in a:
        return 10
    if a in {"main", "site", "web"}:
        return 20
    if "payments" in a or "donat" in a:
        return 30
    if "api" in a:
        return 40
    if "webhook" in a or "stripe" in a:
        return 50
    if "admin" in a:
        return 60
    if "metric" in a:
        return 70
    return 100


# ─── Public API ─────────────────────────────────────────────────────────────
def register_blueprints(app: Flask) -> None:
    """
    Register CLI commands & blueprints with env overrides.

    Recommended production approach:
      - Set BP_MODULES explicitly (deterministic)
      - Keep discovery off unless you want auto behavior

    Common:
      DISABLE_BPS=api,sms,fallback
      BP_PREFIX__API=/v2
      ROUTE_SUMMARY=1
    """
    # Cache disabled aliases on the app
    app._ff_disabled_bps = _parse_disabled_env(os.getenv("DISABLE_BPS"))

    # Optional CLI group
    if starforge:
        try:
            app.cli.add_command(starforge)
            app.logger.info("🛠️ Registered CLI group: starforge")
        except Exception as exc:  # pragma: no cover
            app.logger.warning("⚠️ Could not register CLI group 'starforge': %s", exc)

    env = (os.getenv("ENV") or os.getenv("FLASK_ENV") or "development").strip().lower()

    # 1) Deterministic specs (explicit modules) — recommended for production
    specs: list[BlueprintSpec] = []
    for mod in _parse_csv(os.getenv("BP_MODULES")):
        # Alias default is module leaf; prefix can be overridden via BP_PREFIX__ALIAS
        alias = mod.rsplit(".", 1)[-1]
        specs.append(BlueprintSpec(alias=alias, module=mod, attrs=("bp", "main_bp", "api_bp", "admin_bp", "payments_bp")))

    # 2) “Best guess” compatibility specs (safe to leave; they no-op if missing)
    #    Keep these conservative and aligned to your known endpoints:
    #    - payments should provide /payments/config and /payments/stripe/intent
    if not specs:
        specs = [
            BlueprintSpec("main", "app.routes.main", ("main_bp", "bp"), "/"),
            BlueprintSpec("payments", "app.routes.payments", ("payments_bp", "bp"), "/payments"),
            BlueprintSpec("payments", "app.blueprints.payments", ("payments_bp", "bp"), "/payments"),
            BlueprintSpec("payments", "app.blueprints.fc_payments", ("bp", "payments_bp"), "/payments"),
            BlueprintSpec("api", "app.routes.api", ("api_bp", "bp"), "/api"),
            BlueprintSpec("admin", "app.admin.routes", ("admin_bp", "bp"), "/admin"),
            BlueprintSpec("webhooks", "app.routes.webhooks", ("webhook_bp", "bp"), "/webhooks"),
            BlueprintSpec("stripe", "app.routes.stripe", ("stripe_bp", "bp"), "/stripe"),
            BlueprintSpec("metrics", "app.routes.metrics", ("metrics_bp", "bp"), "/metrics"),
        ]

    registered_aliases: set[str] = set()
    found_main = False

    # Register explicit/spec-driven
    for spec in specs:
        if spec.alias.lower() in registered_aliases:
            continue

        bps = _import_blueprints_from_module(spec.module, spec.attrs)
        if not bps:
            continue

        # If a module contains multiple BPs, register them all; use spec.alias as “group alias”
        for bp in bps:
            # alias per BP helps BP_PREFIX__ overrides be precise
            bp_alias = (bp.name or spec.alias).lower()
            ok = _safe_register(app, alias=bp_alias, bp=bp, prefix=spec.prefix)
            if ok:
                registered_aliases.add(bp_alias)
                if bp_alias == "main":
                    found_main = True

    # Register discovery fallback (optional)
    discover_env = _env_bool("BP_DISCOVER")
    discover_enabled = discover_env if discover_env is not None else _default_discover_enabled(env)

    if discover_enabled:
        prefixes = _parse_csv(os.getenv("BP_DISCOVER_PREFIXES")) or ["app.routes", "app.blueprints", "app.admin"]
        exclude = _parse_csv(os.getenv("BP_DISCOVER_EXCLUDE")) or ["tests", "migrations", "seed", "fixtures"]

        discovered = _discover_blueprints(prefixes=prefixes, exclude_substrings=exclude)
        discovered.sort(key=lambda t: _ordered_alias_weight(t[0]))

        for alias, bp in discovered:
            # Don’t stomp something already registered
            if bp.name in app.blueprints:
                continue
            _safe_register(app, alias=alias, bp=bp, prefix=None)
            if alias.lower() == "main":
                found_main = True

    # Fallback if 'main' not present (unless explicitly disabled)
    if not found_main and "fallback" not in getattr(app, "_ff_disabled_bps", set()):
        _safe_register(app, alias="fallback", bp=fallback_bp, prefix="/")

    _route_summary(app)
    app.logger.info("✅ Blueprint registration complete. (%d total)", len(app.blueprints))
