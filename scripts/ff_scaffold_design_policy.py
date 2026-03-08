#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

TOKENS = {
    "spacing": {
        "ff-0": "0px",
        "ff-1": "4px",
        "ff-2": "8px",
        "ff-3": "12px",
        "ff-4": "16px",
        "ff-5": "20px",
        "ff-6": "24px",
        "ff-7": "32px",
        "ff-8": "40px",
        "ff-9": "48px",
        "ff-10": "64px",
    },
    "radii": {
        "ff-r-1": "10px",
        "ff-r-2": "14px",
        "ff-r-3": "18px",
        "ff-r-4": "22px",
        "ff-r-5": "28px",
        "ff-r-pill": "999px",
    },
    "motion": {
        "duration-fast": "140ms",
        "duration-base": "180ms",
        "duration-overlay": "240ms",
        "ease-standard": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "ease-decelerate": "cubic-bezier(0.05, 0.7, 0.1, 1)",
    },
    "elevation": {
        "surface-1": {
            "border": "1px solid var(--ff-line)",
            "shadow": "0 1px 2px rgba(0,0,0,0.08)",
        },
        "surface-2": {
            "border": "1px solid var(--ff-line-strong)",
            "shadow": "0 8px 24px rgba(0,0,0,0.12)",
        },
        "surface-overlay": {
            "border": "1px solid var(--ff-line-strong)",
            "shadow": "0 18px 48px rgba(0,0,0,0.20)",
        },
    },
    "backdrop": {
        "light": {
            "background": "rgba(255,255,255,0.56)",
            "backdrop-filter": "blur(10px)",
        },
        "dark": {
            "background": "rgba(8,10,14,0.72)",
            "backdrop-filter": "blur(12px)",
        },
    },
}

MOTION_POLICY_MD = """# FutureFunded Motion Policy

## Goals
- Calm, credible, fast
- Motion explains state
- No decorative loops
- Respect reduced motion

## Allowed
- opacity
- transform
- subtle shadow/border emphasis
- disclosure expand/collapse
- overlay enter/exit
- toast enter/exit
- progress/value settle

## Avoid
- animated gradients
- infinite floating ornaments
- giant blur transitions
- repeated shadow pulses
- layout-thrashing transitions

## Timings
- hover/focus/press: 120–160ms
- micro reveal / disclosure: 180–220ms
- overlays / drawers / sheets: 220–260ms

## Reduced Motion
- remove transforms
- keep state changes immediate and clear
- no motion-only meaning
"""

SURFACE_POLICY_MD = """# FutureFunded Surface & Elevation Policy

## Surface Language
- One page background language
- One card language
- One overlay language
- One input language
- One button hierarchy

## Principles
- Premium restraint over decoration
- Clear borders beat muddy blur
- Shadows support depth, not spectacle
- Text contrast wins over aesthetic flex

## Use
- surface-1: default cards, pills, chips
- surface-2: elevated cards, sponsor tiers, hero panels
- surface-overlay: checkout, modals, drawers

## Never
- stack multiple huge shadows
- put heavy blur behind long-form reading
- give every component a unique elevation dialect
"""

def main() -> int:
    artifacts = Path("artifacts")
    artifacts.mkdir(parents=True, exist_ok=True)

    (artifacts / "ff_design_tokens.json").write_text(
        json.dumps(TOKENS, indent=2),
        encoding="utf-8",
    )
    (artifacts / "ff_motion_policy.md").write_text(
        MOTION_POLICY_MD,
        encoding="utf-8",
    )
    (artifacts / "ff_surface_policy.md").write_text(
        SURFACE_POLICY_MD,
        encoding="utf-8",
    )

    print("[ok] wrote artifacts/ff_design_tokens.json")
    print("[ok] wrote artifacts/ff_motion_policy.md")
    print("[ok] wrote artifacts/ff_surface_policy.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
