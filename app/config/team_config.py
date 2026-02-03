from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

# ────────────────────────────────────────────────────────────
# Paths & logging
# ────────────────────────────────────────────────────────────
# File lives at: app/config/team_config.py
BASE_DIR = Path(__file__).resolve().parents[2]  # repo root
APP_DIR = BASE_DIR / "app"
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

log = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────
# Env helpers (tolerant & typed)
# ────────────────────────────────────────────────────────────
def _getenv(key: str, default: Optional[str] = None) -> str:
    v = os.getenv(key)
    if v is None:
        return "" if default is None else default
    return v


def env(key: str, default: Optional[str] = None) -> str:
    return _getenv(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    v = os.getenv(key)
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


def env_int(key: str, default: int) -> int:
    try:
        return int(_getenv(key, str(default)))
    except Exception:
        return default


def env_float(key: str, default: float) -> float:
    try:
        return float(_getenv(key, str(default)))
    except Exception:
        return default


def env_list(key: str, default: Optional[Iterable[str]] = None, sep: str = ",") -> List[str]:
    raw = os.getenv(key)
    if not raw:
        return list(default or [])
    return [p.strip() for p in raw.split(sep) if p.strip()]


def env_json(key: str, default: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    raw = os.getenv(key)
    if not raw:
        return default or {}
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else (default or {})
    except Exception:
        return default or {}


def env_json_list(key: str, default: Optional[List[Any]] = None) -> List[Any]:
    raw = os.getenv(key)
    if not raw:
        return list(default or [])
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else list(default or [])
    except Exception:
        return list(default or [])


# ────────────────────────────────────────────────────────────
# Database URI (DATABASE_URL → fallback to local SQLite)
# ────────────────────────────────────────────────────────────
def _sqlite_uri() -> str:
    db_path = DATA_DIR / "app.db"
    log.info("[team_config] Using SQLite DB at: %s", db_path)
    return f"sqlite:///{db_path}"


SQLALCHEMY_DATABASE_URI_DEFAULT = os.getenv("DATABASE_URL") or _sqlite_uri()

# ────────────────────────────────────────────────────────────
# Flask config classes
# ────────────────────────────────────────────────────────────
class Config:
    """Base configuration with sensible defaults."""

    SECRET_KEY = env("SECRET_KEY", "dev_only_CHANGE_ME")

    SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI_DEFAULT
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = env_bool("SQLALCHEMY_ECHO", False)

    # CORS: accept either CORS_ORIGINS (preferred) or legacy CORS_ALLOW_ORIGINS
    _cors = env("CORS_ORIGINS") or env("CORS_ALLOW_ORIGINS", "*")
    CORS_ORIGINS = _cors

    # Rate limiting / logging
    LIMITER_REDIS_URL = env("LIMITER_REDIS_URL", "memory://")
    LOG_LEVEL = env("LOG_LEVEL", "INFO")
    LOG_FILE = env("LOG_FILE") or None

    # App identity (useful in templates / URLs)
    BASE_URL = env("BASE_URL", "http://127.0.0.1:5000")
    DEFAULT_CURRENCY = env("DEFAULT_CURRENCY", "USD")


class DevelopmentConfig(Config):
    DEBUG = True
    LOG_LEVEL = "DEBUG"
    LOG_FILE = env("LOG_FILE", "development.log")
    CORS_ORIGINS = "*"  # keep dev friction low
    LIMITER_REDIS_URL = "memory://"


class ProductionConfig(Config):
    DEBUG = False
    LOG_LEVEL = env("LOG_LEVEL", "INFO")
    LOG_FILE = env("LOG_FILE", "/var/log/connect_atx_elite/app.log")
    # prefer explicit CORS list in prod; fallback to single origin
    CORS_ORIGINS = env("CORS_ORIGINS", env("PRIMARY_ORIGIN", "")) or ""
    LIMITER_REDIS_URL = env("LIMITER_REDIS_URL", "redis://localhost:6379/0")


def get_flask_config():
    """
    Pick config class by ENV/FLASK_ENV (dev by default).
    Kept to match existing imports.
    """
    mode = (os.getenv("ENV") or os.getenv("FLASK_ENV") or "development").lower()
    return ProductionConfig if mode in {"prod", "production"} else DevelopmentConfig


# ────────────────────────────────────────────────────────────
# Defaults (overridable via file/env JSON)
# ────────────────────────────────────────────────────────────
# Notes:
# - "theme_color" is intended to be a hex string (used by your flagship UI).
# - "brand_color" is allowed to remain a Tailwind token if you still use it anywhere.
# - "logo_url" / "team_logo" are aliases to keep templates/front-end happy.
TEAM_CONFIG_DEFAULT: Dict[str, Any] = {
    # Identity
    "team_name": env("TEAM_NAME", "Connect ATX Elite"),
    "location": env("TEAM_LOCATION", "Austin, TX"),

    # Logos / brand
    "logo": env("TEAM_LOGO", "images/logo.webp"),            # legacy key
    "logo_url": env("TEAM_LOGO_URL", env("TEAM_LOGO", "images/logo.webp")),
    "team_logo": env("TEAM_TEAM_LOGO", env("TEAM_LOGO", "images/logo.webp")),
    "platform_logo": env("PLATFORM_LOGO", "images/fundchamps-logo.svg"),
    "initials": env("TEAM_INITIALS", "CA"),

    # Brand color(s)
    "theme_color": env("TEAM_THEME_COLOR", "#f59e0b"),        # hex preferred
    "brand_color": env("TEAM_BRAND_COLOR", "amber-400"),      # optional tailwind token

    # Contact
    "contact_email": env("TEAM_CONTACT_EMAIL", "info@connectatxelite.org"),
    "instagram": env("TEAM_INSTAGRAM", "https://instagram.com/connectatxelite"),
    "custom_domain": env("TEAM_DOMAIN", ""),  # vanity domain (optional)

    # Campaign
    "currency": env("TEAM_CURRENCY", env("DEFAULT_CURRENCY", "usd")).lower(),
    "fundraising_goal": env_int("TEAM_GOAL", 10_000),
    "amount_raised": env_int("TEAM_RAISED", 0),
    "ends_at": env("TEAM_ENDS_AT", ""),  # ISO string if you have it

    # Program metadata (flagship header/subheader)
    "program_name": env("PROGRAM_NAME", ""),  # if blank, main.py will derive
    "program_short": env("PROGRAM_SHORT", ""),
    "program_meta": env("PROGRAM_META", "Youth Program • Community Fundraiser"),
    "season_label": env("SEASON_LABEL", "Season Fund"),
    "countdown_text": env("COUNTDOWN_TEXT", "Campaign live"),

    # Trial/plan flags
    "is_trial": env_bool("TEAM_IS_TRIAL", True),

    # Story bits
    "about": [
        "Connect ATX Elite is a community-powered, non-profit 12U AAU basketball program based in Austin, TX.",
        "We develop skilled athletes, but also confident, disciplined, and academically driven young leaders.",
    ],

    # Display stats
    "players": [
        {"name": "Andre", "role": "Guard"},
        {"name": "Jordan", "role": "Forward"},
        {"name": "Malik", "role": "Center"},
        {"name": "CJ", "role": "Guard"},
        {"name": "Terrance", "role": "Forward"},
    ],
    "impact_stats": [
        {"label": "Players Enrolled", "value": 16},
        {"label": "Honor Roll Scholars", "value": 11},
        {"label": "Tournaments Played", "value": 12},
        {"label": "Years Running", "value": 3},
    ],

    # Impact buckets
    "impact_costs": {
        "gym_month": {
            "label": "Lock the Next Month of Gym",
            "total_cost": 1800,
            "milestones": [
                {"label": "1 practice locked", "cost": 150},
                {"label": "3 practices locked", "cost": 450},
                {"label": "Full week locked", "cost": 600},
            ],
            "details": "Covers ~12 practices at ~$150/practice.",
        },
        "tournament_travel": {
            "label": "Next Travel Tournament",
            "total_cost": 3200,
            "milestones": [
                {"label": "Tournament fee", "cost": 600},
                {"label": "2 hotel rooms/night", "cost": 300},
                {"label": "Fuel & meals", "cost": 250},
            ],
            "details": "Fees, hotel, fuel, and meals for the team.",
        },
        "uniforms": {
            "label": "Uniforms & Gear",
            "total_cost": 2400,  # 16 × $150
            "milestones": [
                {"label": "Outfit 1 player", "cost": 150},
                {"label": "Outfit 4 players", "cost": 600},
            ],
            "details": "Jersey set, shorts, shooter shirt.",
        },
        "unity_day": {
            "label": "Unity Day (Bonding)",
            "total_cost": 600,
            "milestones": [
                {"label": "Lane rental", "cost": 200},
                {"label": "Team pizza", "cost": 150},
                {"label": "Transport", "cost": 250},
            ],
            "details": "Bowling + pizza + transport for the team.",
        },
    },

    # ✅ Teams (photos should live under app/static/images/teams/* by default)
    # Use relative paths like: "images/teams/6th.webp"
    "teams": [
        {"id": "6th", "name": "6th Grade", "photo": "images/teams/6th.webp", "featured": True},
        {"id": "7th", "name": "7th Grade", "photo": "images/teams/7th.webp"},
        {"id": "8th", "name": "8th Grade", "photo": "images/teams/8th.webp"},
    ],

    # Optional: you can provide gallery_items explicitly. If empty/missing, it will be derived from teams.
    # "gallery_items": [],
}


# ────────────────────────────────────────────────────────────
# Merge & validation
# ────────────────────────────────────────────────────────────
def _deep_merge(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(a)
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(cast(Dict[str, Any], out[k]), cast(Dict[str, Any], v))
        else:
            out[k] = v
    return out


def _load_file_override() -> Dict[str, Any]:
    """
    TEAM_CONFIG_FILE supports .json files.
    """
    path = env("TEAM_CONFIG_FILE", "")
    if not path:
        return {}
    try:
        p = Path(path)
        if p.suffix.lower() == ".json" and p.exists():
            v = json.loads(p.read_text(encoding="utf-8"))
            return v if isinstance(v, dict) else {}
        log.warning("TEAM_CONFIG_FILE has unsupported extension: %s", p.suffix)
    except Exception as exc:
        log.warning("TEAM_CONFIG_FILE load failed: %s", exc)
    return {}


def _as_list(v: Any) -> List[Any]:
    return v if isinstance(v, list) else []


def _as_dict(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _normalize_teams(cfg: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Normalizes:
      - cfg["teams"] (list of dicts)
      - cfg["gallery_items"] (list of dicts) OR derived from teams if absent
    """
    teams_in = _as_list(cfg.get("teams"))
    teams_out: List[Dict[str, Any]] = []

    for i, t in enumerate(teams_in):
        if not isinstance(t, dict):
            continue
        tid = str(t.get("id") or f"t{i+1}").strip()
        name = str(t.get("name") or t.get("team_name") or "Team").strip()
        photo = str(t.get("photo") or t.get("image") or t.get("src") or "").strip()
        featured = bool(t.get("featured") or False)
        tags = t.get("tags") if isinstance(t.get("tags"), list) else []
        teams_out.append({"id": tid, "name": name, "photo": photo, "featured": featured, "tags": tags})

    gallery_in = _as_list(cfg.get("gallery_items"))
    gallery_out: List[Dict[str, Any]] = []

    if gallery_in:
        for i, gi in enumerate(gallery_in):
            if not isinstance(gi, dict):
                continue
            src = str(gi.get("src") or gi.get("photo") or "").strip()
            if not src:
                continue
            gid = str(gi.get("id") or f"g{i+1}").strip()
            caption = str(gi.get("caption") or "").strip()
            alt = str(gi.get("alt") or caption or "Team photo").strip()
            tag = str(gi.get("tag") or "teams").strip()
            featured = bool(gi.get("featured") or False)
            thumb = str(gi.get("thumb") or src).strip()
            gallery_out.append(
                {"id": gid, "src": src, "thumb": thumb, "alt": alt, "caption": caption, "tag": tag, "featured": featured}
            )
    else:
        # derive gallery_items from teams
        seen: set[str] = set()
        for t in teams_out:
            src = str(t.get("photo") or "").strip()
            if not src or src in seen:
                continue
            seen.add(src)
            name = str(t.get("name") or "Team").strip()
            tid = str(t.get("id") or f"t{len(gallery_out)+1}").strip()
            first = name.split()[0].lower() if name.split() else "teams"
            tag = first if first.endswith(("st", "nd", "rd", "th")) else "teams"
            gallery_out.append(
                {"id": f"team-{tid}", "src": src, "thumb": src, "alt": f"{name} photo", "caption": name, "tag": tag, "featured": bool(t.get("featured"))}
            )

    return teams_out, gallery_out


def _validate_team_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    # Clamp numerics
    goal = max(0, int(cfg.get("fundraising_goal") or 0))
    raised = max(0, int(cfg.get("amount_raised") or 0))
    if goal and raised > goal:
        raised = goal
    cfg["fundraising_goal"] = goal
    cfg["amount_raised"] = raised
    cfg["percent_to_goal"] = round(raised / goal * 100.0, 1) if goal else 0.0

    # Normalize brand keys (aliases)
    cfg.setdefault("theme_color", cfg.get("themeColor") or cfg.get("theme_color") or "#0ea5e9")
    cfg.setdefault("logo_url", cfg.get("logo_url") or cfg.get("logo") or "")
    cfg.setdefault("team_logo", cfg.get("team_logo") or cfg.get("logo_url") or cfg.get("logo") or "")
    cfg.setdefault("currency", str(cfg.get("currency") or env("DEFAULT_CURRENCY", "usd")).lower())

    # Normalize impact buckets
    costs = _as_dict(cfg.get("impact_costs"))
    for key, bucket in list(costs.items()):
        if not isinstance(bucket, dict):
            continue
        bucket.setdefault("label", key)
        bucket["total_cost"] = float(bucket.get("total_cost") or 0.0)
        bucket["details"] = bucket.get("details") or ""
        ms = _as_list(bucket.get("milestones"))
        bucket["milestones"] = [
            {"label": str(m.get("label", "")), "cost": float(m.get("cost", 0.0))}
            for m in ms
            if isinstance(m, dict)
        ]
        costs[key] = bucket
    cfg["impact_costs"] = costs

    # Teams + gallery items
    teams_out, gallery_out = _normalize_teams(cfg)
    cfg["teams"] = teams_out
    cfg["gallery_items"] = gallery_out

    return cfg


# ────────────────────────────────────────────────────────────
# Public API
# ────────────────────────────────────────────────────────────
def _load_env_overrides() -> Dict[str, Any]:
    """
    Supports:
      - TEAM_CONFIG_JSON (dict override)
      - TEAM_TEAMS_JSON (list override for teams)
      - TEAM_GALLERY_JSON (list override for gallery_items)
    """
    out: Dict[str, Any] = {}

    cfg_json = env_json("TEAM_CONFIG_JSON", {})
    if cfg_json:
        out = _deep_merge(out, cfg_json)

    teams_json = env_json_list("TEAM_TEAMS_JSON", [])
    if teams_json:
        out["teams"] = teams_json

    gallery_json = env_json_list("TEAM_GALLERY_JSON", [])
    if gallery_json:
        out["gallery_items"] = gallery_json

    return out


def _cache_enabled() -> bool:
    # Set TEAM_CONFIG_NO_CACHE=1 to disable memoization in dev/debug
    return not env_bool("TEAM_CONFIG_NO_CACHE", False)


def _build_team_config() -> Dict[str, Any]:
    file_override = _load_file_override()
    env_override = _load_env_overrides()

    cfg = TEAM_CONFIG_DEFAULT
    cfg = _deep_merge(cfg, file_override)
    cfg = _deep_merge(cfg, env_override)
    cfg = _validate_team_config(cfg)
    return cfg


@lru_cache(maxsize=1)
def _get_team_config_cached() -> Dict[str, Any]:
    return _build_team_config()


def get_team_config() -> Dict[str, Any]:
    """
    Final TEAM_CONFIG after env/file merges + validation.
    If TEAM_CONFIG_NO_CACHE=1, returns fresh config each call.
    """
    if _cache_enabled():
        return _get_team_config_cached()
    return _build_team_config()


# Eager export for convenience in templates/imports
TEAM_CONFIG: Dict[str, Any] = get_team_config()

