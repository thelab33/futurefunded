#!/usr/bin/env bash
set -euo pipefail

cd /home/elCUCO/futurefunded
exec ./scripts/run_gunicorn_prod.sh
