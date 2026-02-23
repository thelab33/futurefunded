# app/blueprint_loader.py
from __future__ import annotations

"""
FutureFunded — Blueprint Loader (Flagship hardened + repo-drift tolerant)

Core goals:
- Register blueprints reliably even if module paths move over time
- Prefer deterministic explicit blueprint modules in production
- Allow safe auto-discovery for development or when paths vary

Env knobs:
  DISABLE_BPS=api,sms,fallback              # disable by alias OR blueprint.name
  BP_PREFIX__API=/v2                       # override url_prefix per alias
  ROUTE_SUMMARY=1                          # print route summary (also true when app.debug)
  BP_MODULES=app.routes.main,app.routes.api,app.blueprints.payments   # deterministic list (recommended prod)
  BP_DISCOVER=1                             # enable discovery fallback (default on in dev, off in prod)
  BP_DISCOVER_PREFIXES=app.routes,app.blueprints,app.admin
  BP_DISCOVER_EXCLUDE=tests,migrations,seed,fixtures
"""

import logging
import os
import pkgutil
from dataclasses import dataclass
from importlib import import_module
from typing import Iterable, Optional, Sequence

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


# ─── Env/Parse Helpers ──────────────────────────────────────────────────────
_TRUTHY = {"1", "true", "yes", "y", "on"}
_FALSY = {"0", "false", "no", "n", "off"}


def _env_bool(name: str) -> Optional[bool]:
    v = os.getenv(name)
    if v is None:
        return None
    vv = str(v).strip().lower()
    if vv in _TRUTHY:
        return True
    if vv in _FALSY:
        return False
    return None


def _parse_csv(env_value: Optional[str]) -> list[str]:
    return [p.strip() for p in (env_value or "").split(",") if p.strip()]


def _parse_disabled_env(env_value: Optional[str]) -> set[str]:
    # disable by alias OR blueprint.name
    return {p.strip().lower() for p in (env_value or "").split(",") if p.strip()}


def _env_prefix_override(alias: str, default: Optional[str]) -> Optional[str]:
    return os.getenv(f"BP_PREFIX__{alias.upper()}", default)


def _sanitize_prefix(prefix: Optional[str]) -> Optional[str]:
    """
    Normalize prefixes:
    - None / "" / "/" => None (register at root)
    - ensure leading slash
    - collapse //, strip trailing slash
    """
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


# ─── Import/Discovery ───────────────────────────────────────────────────────
def _import_blueprints_from_module(module: str, attrs: Iterable[str]) -> list[Blueprint]:
    """
    Returns *all* Blueprint objects we can find in a module:
      1) Named attributes (bp, api_bp, main_bp, etc.)
      2) Fallback scan of module globals for Blueprint instances
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
            if isinstance(cand, Blueprint) and cand not in found:
                found.append(cand)
        except Exception:
            continue

    # 2) Scan everything (covers odd naming)
    try:
        for _, cand in vars(mod).items():
            if isinstance(cand, Blueprint) and cand not in found:
                found.append(cand)
    except Exception:
        pass

    return found


def _discover_blueprints(prefixes: list[str], exclude_substrings: list[str]) -> list[tuple[str, Blueprint]]:
    """
    Walk packages under given prefixes and return (alias, blueprint).
    Alias is derived from blueprint.name (preferred) or module leaf.
    Discovery is DEV-ONLY by default; see BP_DISCOVER.
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
                alias = (bp.name or modname.rsplit(".", 1)[-1]).strip() or modname.rsplit(".", 1)[-1]
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
    return env_lc not in {"production", "prod"}


def _ordered_alias_weight(alias: str) -> int:
    """
    Ensures sensible registration order. Lower is earlier.
    """
    a = (alias or "").lower()
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


# ─── Registration ───────────────────────────────────────────────────────────
def _safe_register(app: Flask, *, alias: str, bp: Blueprint, prefix: Optional[str]) -> bool:
    """
    Register blueprint safely with:
    - disable by alias or blueprint.name via DISABLE_BPS
    - no duplicates
    - BP_PREFIX__ override support
    """
    alias_lc = (alias or "").lower()
    bpname_lc = (bp.name or "").lower()

    disabled = app.extensions.get("ff_disabled_bps", set())
    if alias_lc in disabled or bpname_lc in disabled:
        app.logger.info("⏭️ Disabled via env: %s (bp=%s)", alias_lc, bp.name)
        return False

    if bp.name in app.blueprints:
        app.logger.info("⏭️ Already registered: %s", bp.name)
        return False

    final_prefix = _sanitize_prefix(_env_prefix_override(alias_lc, prefix))

    try:
        app.register_blueprint(bp, url_prefix=final_prefix)
        app.logger.info("🧩 Registered blueprint: %-14s bp=%-18s prefix=%s", alias_lc, bp.name, final_prefix or "/")
        return True
    except Exception as exc:  # pragma: no cover
        app.logger.error("❌ Failed to register '%s' (bp=%s): %s", alias_lc, bp.name, exc, exc_info=True)
        return False


def _route_summary(app: Flask) -> None:
    want = bool(app.debug) or (os.getenv("ROUTE_SUMMARY", "0").strip().lower() in _TRUTHY)
    if not want:
        return

    try:
        bps = ", ".join(sorted(app.blueprints.keys())) or "—"
        app.logger.info("📦 Blueprints: %s", bps)

        lines: list[str] = []
        for rule in sorted(app.url_map.iter_rules(), key=lambda r: (str(r.rule), r.endpoint)):
            methods = ",".join(sorted(m for m in (rule.methods or set()) if m in {"GET", "POST", "PUT", "PATCH", "DELETE"}))
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


# ─── Public API ─────────────────────────────────────────────────────────────
def register_blueprints(app: Flask) -> None:
    """
    Register CLI commands & blueprints with env overrides.

    Flagship production recommendation:
      - Set BP_MODULES explicitly (deterministic)
      - Keep discovery off unless you truly want auto behavior

    Common:
      DISABLE_BPS=api,sms,fallback
      BP_PREFIX__API=/v2
      ROUTE_SUMMARY=1
    """
    # Cache disabled aliases on the app (extensions is safer than attribute)
    app.extensions["ff_disabled_bps"] = _parse_disabled_env(os.getenv("DISABLE_BPS"))

    # Optional CLI group
    if starforge:
        try:
            app.cli.add_command(starforge)
            app.logger.info("🛠️ Registered CLI group: starforge")
        except Exception as exc:  # pragma: no cover
            app.logger.warning("⚠️ Could not register CLI group 'starforge': %s", exc)

    env = (os.getenv("ENV") or os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "development").strip().lower()

    # 1) Deterministic specs (explicit modules) — recommended for production
    specs: list[BlueprintSpec] = []
    for mod in _parse_csv(os.getenv("BP_MODULES")):
        alias = mod.rsplit(".", 1)[-1]
        specs.append(
            BlueprintSpec(
                alias=alias,
                module=mod,
                attrs=("bp", "main_bp", "api_bp", "admin_bp", "payments_bp", "sms_bp"),
            )
        )

    # 2) Conservative compatibility specs (only used when BP_MODULES is not set)
    #    Keep aligned with your known endpoints; harmless if modules missing.
    if not specs:
        specs = [
            BlueprintSpec("diag", "app.diag", ("bp",), "/_diag"),
            BlueprintSpec("api", "app.routes.api", ("bp", "api_bp"), "/api"),
            BlueprintSpec("admin", "app.admin.routes", ("bp", "admin_bp"), "/admin"),
            BlueprintSpec("metrics", "app.blueprints.fc_metrics", ("bp",), "/metrics"),
            BlueprintSpec("newsletter", "app.routes.newsletter", ("bp",), "/newsletter"),
            BlueprintSpec("sms", "app.routes.sms", ("sms_bp", "bp"), "/sms"),
            BlueprintSpec("legal", "app.routes.legal", ("bp",), "/legal"),
            # payments (prefer app.blueprints.payments)
            BlueprintSpec("payments", "app.blueprints.payments", ("bp", "payments_bp"), "/payments"),
            # main
            BlueprintSpec("main", "app.routes.main", ("main_bp", "bp"), "/"),
        ]

    found_main = False

    # Spec-driven registration
    for spec in specs:
        bps = _import_blueprints_from_module(spec.module, spec.attrs)
        if not bps:
            continue

        for bp in bps:
            bp_alias = (bp.name or spec.alias).strip().lower()
            ok = _safe_register(app, alias=bp_alias, bp=bp, prefix=spec.prefix)
            if ok and bp_alias == "main":
                found_main = True

    # Discovery fallback (optional)
    discover_env = _env_bool("BP_DISCOVER")
    discover_enabled = bool(discover_env) if discover_env is not None else _default_discover_enabled(env)

    if discover_enabled:
        prefixes = _parse_csv(os.getenv("BP_DISCOVER_PREFIXES")) or ["app.routes", "app.blueprints", "app.admin"]
        exclude = _parse_csv(os.getenv("BP_DISCOVER_EXCLUDE")) or ["tests", "migrations", "seed", "fixtures"]

        discovered = _discover_blueprints(prefixes=prefixes, exclude_substrings=exclude)
        discovered.sort(key=lambda t: _ordered_alias_weight(t[0]))

        for alias, bp in discovered:
            if bp.name in app.blueprints:
                continue
            _safe_register(app, alias=alias, bp=bp, prefix=None)
            if (alias or "").lower() == "main":
                found_main = True

    # Fallback if 'main' not present (unless explicitly disabled)
    disabled = app.extensions.get("ff_disabled_bps", set())
    if not found_main and "fallback" not in disabled:
        _safe_register(app, alias="fallback", bp=fallback_bp, prefix="/")

    _route_summary(app)
    app.logger.info("✅ Blueprint registration complete. (%d total)", len(app.blueprints))


__all__ = ["register_blueprints", "BlueprintSpec", "fallback_bp"]
