#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/elCUCO/futurefunded"
LOG_DIR="$ROOT/.logs"
LOG_FILE="$LOG_DIR/prod-app.log"
APP_MATCH='python run.py --env production --async-mode eventlet'
APP_CMD=".venv/bin/python run.py --env production --async-mode eventlet"

mkdir -p "$LOG_DIR"
cd "$ROOT"

OLD_PIDS="$(pgrep -f "$APP_MATCH" || true)"
if [ -n "$OLD_PIDS" ]; then
  echo "Stopping existing app PID(s): $OLD_PIDS"
  kill $OLD_PIDS || true
  sleep 2
fi

REMAINING="$(pgrep -f "$APP_MATCH" || true)"
if [ -n "$REMAINING" ]; then
  echo "Force-killing stubborn PID(s): $REMAINING"
  kill -9 $REMAINING || true
  sleep 1
fi

echo "Starting app..."
nohup $APP_CMD >> "$LOG_FILE" 2>&1 &
sleep 3

NEW_PIDS="$(pgrep -f "$APP_MATCH" || true)"
if [ -z "$NEW_PIDS" ]; then
  echo "ERROR: app did not stay running"
  echo
  echo "Last 80 log lines:"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

echo "App PID(s):"
pgrep -af "$APP_MATCH" || true

echo
echo "Listening processes:"
ss -ltnp | grep ':5000' || true

echo
echo "Recent log tail:"
tail -n 20 "$LOG_FILE" || true
