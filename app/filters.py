from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any


def commafy(
    value: Any,
    *,
    min_decimals: int = 0,
    max_decimals: int = 2,
    blank_for_none: bool = False,
) -> str:
    """
    Format numbers with thousands separators.
    - Accepts: int/float/Decimal or strings like "$1,234.50", "1_234", "(123.4)"
    - Decimals:
        • uses decimals from the input up to max_decimals
        • enforces at least min_decimals
    - `blank_for_none=True` returns "" for None/""; otherwise returns 0 or 0.00 per min_decimals
    """
    # Handle null-ish early
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if blank_for_none:
            return ""
        return f"{0:,.{max(min_decimals, 0)}f}" if min_decimals > 0 else "0"

    # Normalize to string for cleaning, but keep the original for fallbacks
    s = str(value).strip()

    # Accounting negative e.g. "(123.45)"
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1].strip()

    # Strip common noise: currency, commas, underscores, spaces
    cleaned = (
        s.replace(",", "")
        .replace("_", "")
        .replace("$", "")
        .replace("USD", "")
        .replace("usd", "")
        .strip()
    )

    # Try to parse as Decimal (safer than float for money)
    try:
        d = Decimal(cleaned)
    except InvalidOperation:
        # Last-chance float parse; if still bad, just return the original string
        try:
            d = Decimal(str(float(cleaned)))
        except Exception:
            return str(value)

    if neg:
        d = -abs(d)

    # Decide how many decimals to show
    # If the input had a decimal part, respect its length up to max_decimals
    input_decimals = 0
    if "." in cleaned:
        input_decimals = len(cleaned.split(".", 1)[1])
    scale = max(min_decimals, min(max_decimals, input_decimals))

    # Round (HALF_UP) and format with grouping
    if scale > 0:
        quant = Decimal(1).scaleb(-scale)  # 10^-scale
        d = d.quantize(quant, rounding=ROUND_HALF_UP)
        out = f"{d:,.{scale}f}"
    else:
        d = d.to_integral_value(rounding=ROUND_HALF_UP)
        out = f"{int(d):,}"

    # Clean up negative zero
    if out in ("-0", "-0.0", "-0.00"):
        out = out.replace("-", "")
    return out
