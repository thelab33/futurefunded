#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""FutureFunded app.py (shim)

Your real Flask app lives in the `app/` package and is launched consistently via `run.py`.
This shim keeps `python3 app.py` working WITHOUT diverging from Turnkey / proxy / env behavior.

Canonical:
  python3 run.py --env development --open-browser
  python3 -m flask --app run:app routes
"""

def main() -> None:
    # Delegate to the canonical launcher so behavior stays identical everywhere.
    from run import main as run_main
    run_main()

if __name__ == "__main__":
    main()
