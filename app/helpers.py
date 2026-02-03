"""
app.helpers — compact utility helpers used across the app and tests.

This module provides:
- parse_money: tolerant money/number parser ("$1,234", "2k", "10K", 1500)
- to_cents: convert money-like inputs to integer cents
- pct: safe percent helper
- _calc_next_milestone_gap: next cumulative milestone gap; labels last segment as "Goal"
- emit_funds_update: socketio broadcast payload (with fallback)
"""

from __future__ import annotations

import math
import re
import time
from typing import Any, Dict, Iterable, Optional, Tuple

_NUM_RE = re.compile(
    r"[-+]?\$?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(?:\.[0-9]+)?\s*([KkMm])?$"
)


def parse_money(val: Any) -> float:
    """
    Convert various inputs into a numeric float.
    Accepts numbers, strings with commas, '$', and shorthand like '2k', '1.5M'.
    """
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s:
        return 0.0
    # Remove currency symbol and commas
    s2 = s.replace("$", "").replace(",", "").strip()
    # Handle shorthand suffixes explicitly if regex fails
    m = _NUM_RE.match(s.replace(" ", "").replace("$", ""))
    if m:
        num_part, suffix = m.groups()
        try:
            base = float(num_part.replace(",", ""))
        except Exception:
            try:
                base = float(s2)
            except Exception:
                return 0.0
        if suffix:
            if suffix.lower() == "k":
                base *= 1_000.0
            elif suffix.lower() == "m":
                base *= 1_000_000.0
        return float(base)
    try:
        return float(s2)
    except Exception:
        return 0.0


def to_cents(val: Any) -> int:
    """Return integer cents from a money-like value."""
    return int(round(parse_money(val) * 100.0))


def pct(n: Any, d: Any) -> float:
    """Safe percent n/d * 100.0"""
    n = parse_money(n)
    d = parse_money(d)
    if d <= 0:
        return 0.0
    return (n / d) * 100.0


def _calc_next_milestone_gap(
    total: Any, allocated: Any, milestones: Iterable[Dict[str, Any]]
) -> Tuple[float, str]:
    """
    Given a total goal, current allocated amount, and a list of milestone dicts:
      [{"label": "A", "cost": 200}, ...]
    compute the gap to the next CUMULATIVE milestone threshold.

    IMPORTANT: If the "next" milestone is the final one in the list (i.e., the threshold equals the total goal),
    we label that segment as "Goal" to match UX expectations and tests.
    If we've passed all milestones, we return the remaining gap to goal and label "Goal".
    """
    t = float(parse_money(total))
    a = float(parse_money(allocated))
    # constrain a within [0, t]
    a = max(0.0, min(a, t))
    remaining = max(0.0, t - a)

    # Normalize milestones into cumulative thresholds
    norm = []
    cum = 0.0
    for m in milestones or []:
        cost = float(parse_money(m.get("cost", 0)))
        label = m.get("label") or ""
        cum += cost
        norm.append((cum, label))

    if not norm:
        return (remaining, "Goal")

    # Find next cumulative threshold
    for idx, (cum_cost, label) in enumerate(norm):
        if a < cum_cost - 1e-9:
            gap = max(0.0, cum_cost - a)
            # If this is the last milestone, surface "Goal" as the label
            if idx == len(norm) - 1:
                return (gap, "Goal")
            return (gap, label or "Goal")

    # Past all milestones → whatever remains is toward the Goal
    return (remaining, "Goal")


def emit_funds_update(
    raised: Any,
    goal: Any,
    sponsor_name: Optional[str] = None,
    seq: Optional[int] = None,
    socketio: Any = None,
    channel: str = "funds:update",
    fallback: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Broadcast a simple funds update payload over Socket.IO (if provided),
    using broadcast=True (as expected by tests). Falls back to callback.
    Returns the payload.
    """
    r = parse_money(raised)
    g = parse_money(goal)
    p = 0.0 if g <= 0 else round((r / g) * 100.0, 2)
    if seq is None:
        try:
            seq = int(time.time() * 1000)
        except Exception:
            seq = 0

    payload = {
        "raised": r,
        "goal": g,
        "percent": p,
        "seq": seq,
    }
    if sponsor_name:
        payload["sponsor"] = sponsor_name

    if socketio is not None:
        try:
            # Tests expect broadcast=True in kwargs
            socketio.emit(channel, payload, broadcast=True)
            return payload
        except Exception:
            pass

    if callable(fallback):
        try:
            fallback(r, g, sponsor_name, seq)
        except Exception:
            pass

    return payload
