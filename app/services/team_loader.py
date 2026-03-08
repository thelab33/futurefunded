from typing import List, Dict

def normalize_teams(cfg: Dict, fallback: List[Dict]) -> List[Dict]:
    """
    Returns a clean list of team dictionaries for the template.

    Priority:
    1) FF_CFG["teams"]
    2) fallback FF_TEAMS
    """

    raw = []

    if isinstance(cfg, dict) and cfg.get("teams"):
        raw = cfg["teams"]
    else:
        raw = fallback or []

    teams = []

    for t in raw:
        teams.append({
            "id": str(t.get("id", "default")).strip(),
            "name": t.get("name", "Team"),
            "meta": t.get("meta", ""),
            "photo": t.get("photo", "")
        })

    return teams
