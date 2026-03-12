#!/usr/bin/env bash
set -euo pipefail

cd /home/elCUCO/futurefunded

APP_MATCH='python run.py --env production --async-mode threading'
APP_CMD='.venv/bin/python run.py --env production --async-mode threading'

pkill -f "$APP_MATCH" || true
sleep 2

set -a
source .env
export ENV=production
export APP_ENV=production
export FLASK_ENV=production
export FLASK_CONFIG=app.config.ProductionConfig
set +a

nohup $APP_CMD > /tmp/futurefunded.log 2>&1 &
sleep 4

echo "--- listening ---"
ss -ltnp | grep ':5000 ' || true

echo "--- log tail ---"
tail -n 80 /tmp/futurefunded.log || true
