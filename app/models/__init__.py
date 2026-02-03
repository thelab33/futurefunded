from __future__ import annotations

import importlib
from typing import Any, Dict, Optional  # ✅ REQUIRED

from app.models.campaign_goal import CampaignGoal
from app.models.donation import Donation
# --- Core model imports ---------------------------------------------------------
from app.models.org import Org
from app.models.sponsor import Sponsor
from app.models.team import Team

# --- DB: import safely (works even if extensions aren't fully initialized) ------
try:
    from app.extensions import db  # type: ignore
except Exception:  # pragma: no cover
    db = None  # type: ignore

# --- Optionally re-export shared mixins -----------------------------------------
try:
    from .mixins import *  # noqa: F401,F403
except Exception:  # pragma: no cover
    pass


# --- Safe importer --------------------------------------------------------------
def _safe_import(module_name: str, attr: str) -> Optional[Any]:
    """
    Attempt to import attr from app.models.<module_name>.
    Returns None if the module or attribute is absent or raises.
    """
    try:
        mod = importlib.import_module(f"app.models.{module_name}")
        return getattr(mod, attr, None)
    except Exception:
        return None


# --- Register models here -------------------------------------------------------
_MODEL_MAP: Dict[str, tuple[str, str]] = {
    "Example": ("example", "Example"),
    "Org": ("org", "Org"),
    "Team": ("team", "Team"),
    "Campaign": ("campaign", "Campaign"),
    "CampaignGoal": ("campaign_goal", "CampaignGoal"),
    "Sponsor": ("sponsor", "Sponsor"),
    "Donation": ("donation", "Donation"),
    "Transaction": ("transaction", "Transaction"),
    "User": ("user", "User"),
    "Newsletter": ("newsletter", "Newsletter"),
    "Player": ("player", "Player"),
    "SponsorClick": ("sponsor_click", "SponsorClick"),
    "Shoutout": ("shoutout", "Shoutout"),
    "SMSLog": ("sms_log", "SMSLog"),
}

# Dynamically populate globals
for export_name, (module_name, class_name) in _MODEL_MAP.items():
    globals()[export_name] = _safe_import(module_name, class_name)

# Public API
__all__ = ["db", *list(_MODEL_MAP.keys())]


# --- Utility: list available models --------------------------------------------
def available_models() -> Dict[str, Any]:
    """Return a dict of {name: model_class} for models that imported successfully."""
    return {
        name: globals()[name]
        for name in _MODEL_MAP.keys()
        if globals().get(name) is not None
    }
