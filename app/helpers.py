# app/helpers.py
"""
app.helpers — compact utility helpers used across the app and tests.

This module provides:
- parse_money: tolerant money/number parser ("$1,234", "2k", "10K", "1.5M", 1500)
- to_cents: convert money-like inputs to integer cents
- pct: safe percent helper
- calc_next_milestone_gap: next cumulative milestone gap; labels last segment as "Goal"
- emit_funds_update: socketio broadcast payload (with fallback)
"""

from __future__ import annotations

import re
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, Iterable, Optional, Tuple

# Accepts:
#  - "$1,234" / "1234" / "1234.56"
#  - "2k" / "1.5K" / "2m" / "1.25M"
#  - leading/trailing whitespace
# Rejects obvious non-numeric junk safely (returns 0.0)
_MONEY_RE = re.compile(
    r"""
    ^\s*
    (?P<sign>[-+])?
    \s*\$?\s*
    (?P<num>
        (?:
            \d{1,3}(?:,\d{3})*   # 1,234,567
            |
            \d+                 # 1234567
        )
        (?:\.\d+)?              # .99
        |
        (?:\.\d+)               # .99
    )
    \s*(?P<suffix>[KkMm])?
    \s*$
    """,
    re.VERBOSE,
)

_SUFFIX_MULT = {"k": Decimal("1000"), "m": Decimal("1000000")}


def _to_decimal(val: Any) -> Decimal:
    """
    Best-effort conversion to Decimal for stable rounding.
    Returns Decimal(0) for anything unparsable.
    """
    if val is None:
        return Decimal("0")
    if isinstance(val, Decimal):
        return val
    if isinstance(val, bool):
        # avoid True->1 surprises in money paths
        return Decimal("0")
    if isinstance(val, (int, float)):
        # float -> Decimal via string to reduce binary wobble
        try:
            return Decimal(str(val))
        except Exception:
            return Decimal("0")

    s = str(val).strip()
    if not s:
        return Decimal("0")

    # Normalize: keep original for regex (commas), but strip spaces
    m = _MONEY_RE.match(s)
    if not m:
        # last-chance: remove $ and commas and try Decimal
        s2 = s.replace("$", "").replace(",", "").strip()
        try:
            return Decimal(s2)
        except Exception:
            return Decimal("0")

    sign = "-" if (m.group("sign") == "-") else ""
    num = (m.group("num") or "0").replace(",", "")
    suffix = (m.group("suffix") or "").lower()

    try:
        d = Decimal(sign + num)
    except (InvalidOperation, ValueError):
        return Decimal("0")

    if suffix:
        d *= _SUFFIX_MULT.get(suffix, Decimal("1"))

    return d


def parse_money(val: Any) -> float:
    """
    Convert various inputs into a numeric float.
    Accepts numbers, strings with commas, '$', and shorthand like '2k', '1.5M'.
    """
    d = _to_decimal(val)
    try:
        return float(d)
    except Exception:
        return 0.0


def to_cents(val: Any) -> int:
    """
    Return integer cents from a money-like value.

    Uses bank-safe rounding (HALF_UP) so:
      10.005 -> 1001 cents (not 1000)
    """
    d = _to_decimal(val) * Decimal("100")
    try:
        cents = int(d.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except Exception:
        cents = 0
    return cents


def pct(n: Any, d: Any) -> float:
    """Safe percent n/d * 100.0"""
    nn = _to_decimal(n)
    dd = _to_decimal(d)
    if dd <= 0:
        return 0.0
    try:
        return float((nn / dd) * Decimal("100"))
    except Exception:
        return 0.0


def calc_next_milestone_gap(total: Any, allocated: Any, milestones: Iterable[Dict[str, Any]]) -> Tuple[float, str]:
    """
    Given a total goal, current allocated amount, and a list of milestone dicts:
      [{"label": "A", "cost": 200}, ...]
    compute the gap to the next CUMULATIVE milestone threshold.

    IMPORTANT:
    - If the "next" milestone is the final one in the list (i.e., last segment),
      we label that segment as "Goal" to match UX expectations/tests.
    - If we've passed all milestones, we return remaining gap to goal and label "Goal".
    """
    t = _to_decimal(total)
    a = _to_decimal(allocated)

    if t < 0:
        t = Decimal("0")
    # constrain a within [0, t]
    if a < 0:
        a = Decimal("0")
    if a > t:
        a = t

    remaining = t - a
    if remaining < 0:
        remaining = Decimal("0")

    # Normalize milestones into cumulative thresholds
    norm: list[tuple[Decimal, str]] = []
    cum = Decimal("0")
    for m in milestones or []:
        try:
            cost = _to_decimal(m.get("cost", 0))
        except Exception:
            cost = Decimal("0")
        if cost < 0:
            cost = Decimal("0")
        label = str(m.get("label") or "").strip()
        cum += cost
        norm.append((cum, label))

    if not norm:
        return (float(remaining), "Goal")

    # Find next cumulative threshold
    # epsilon is unnecessary with Decimal; treat strict <
    for idx, (cum_cost, label) in enumerate(norm):
        if a < cum_cost:
            gap = cum_cost - a
            if gap < 0:
                gap = Decimal("0")
            if idx == len(norm) - 1:
                return (float(gap), "Goal")
            return (float(gap), label or "Goal")

    # Past all milestones → whatever remains is toward the Goal
    return (float(remaining), "Goal")


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
    r = _to_decimal(raised)
    g = _to_decimal(goal)

    if g <= 0:
        p = Decimal("0")
    else:
        try:
            p = (r / g) * Decimal("100")
        except Exception:
            p = Decimal("0")

    # percent with two decimals for UI stability
    try:
        p2 = float(p.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except Exception:
        p2 = 0.0

    if seq is None:
        try:
            seq = int(time.time() * 1000)
        except Exception:
            seq = 0

    payload: Dict[str, Any] = {
        "raised": float(r),
        "goal": float(g),
        "percent": p2,
        "seq": int(seq) if seq is not None else 0,
    }
    if sponsor_name:
        payload["sponsor"] = sponsor_name

    if socketio is not None:
        try:
            socketio.emit(channel, payload, broadcast=True)
            return payload
        except Exception:
            pass

    if callable(fallback):
        try:
            fallback(float(r), float(g), sponsor_name, seq)
        except Exception:
            pass

    return payload
