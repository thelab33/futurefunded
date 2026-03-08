#!/usr/bin/env bash
set -euo pipefail

SCRIPTDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="${SCRIPTDIR}/.logs"

FLASK_PORT="${FLASK_PORT:-5000}"
FLASK_HOST="${FLASK_HOST:-127.0.0.1}"
FLASK_CMD="${FLASK_CMD:-${SCRIPTDIR}/run.py --env development --no-reload}"

CLOUDFLARED_TUNNEL_NAME="${CLOUDFLARED_TUNNEL_NAME:-futurefunded-prod}"

mkdir -p "$LOGDIR"

echo "🚀 Starting FutureFunded dev environment"
echo "Logs → $LOGDIR"
echo

############################################
# Helper functions
############################################

port_owner() {
  lsof -nP -iTCP:${FLASK_PORT} -sTCP:LISTEN -t 2>/dev/null || true
}

wait_for_flask() {
  echo "⏳ Waiting for Flask to become ready..."

  for i in {1..30}; do
    if curl -s "http://${FLASK_HOST}:${FLASK_PORT}" >/dev/null 2>&1; then
      echo "✅ Flask is responding on ${FLASK_HOST}:${FLASK_PORT}"
      return
    fi
    sleep 0.3
  done

  echo "❌ Flask did not start within expected time"
  exit 1
}

############################################
# Kill anything already on the port
############################################

if pids="$(port_owner)"; then
  if [ -n "$pids" ]; then
    echo "⚠️ Port ${FLASK_PORT} in use by: $pids"

    for pid in $pids; do
      kill "$pid" 2>/dev/null || true
    done

    sleep 1

    if pids="$(port_owner)"; then
      echo "⚠️ Forcing shutdown..."
      for pid in $pids; do
        kill -9 "$pid" 2>/dev/null || true
      done
    fi
  fi
fi

############################################
# Cleanup handler
############################################

pids_to_kill=()

cleanup() {
  echo
  echo "🧹 Cleaning up..."

  for pid in "${pids_to_kill[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping process $pid"
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

############################################
# Start Flask
############################################

echo "🟢 Starting Flask → $LOGDIR/flask.log"

python3 $FLASK_CMD > "$LOGDIR/flask.log" 2>&1 &
FLASK_PID=$!

pids_to_kill+=($FLASK_PID)

wait_for_flask

############################################
# Start cloudflared
############################################

if pgrep -f "cloudflared tunnel run ${CLOUDFLARED_TUNNEL_NAME}" >/dev/null; then
  echo "☁️ cloudflared tunnel '${CLOUDFLARED_TUNNEL_NAME}' already running"
else
  echo "☁️ Starting cloudflared tunnel '${CLOUDFLARED_TUNNEL_NAME}'"
  echo "Logs → $LOGDIR/cloudflared.log"

  cloudflared tunnel run "${CLOUDFLARED_TUNNEL_NAME}" \
    > "$LOGDIR/cloudflared.log" 2>&1 &

  TUNNEL_PID=$!
  pids_to_kill+=($TUNNEL_PID)
fi

############################################
# Environment summary
############################################

echo
echo "✅ FutureFunded environment ready"
echo
echo "Local:"
echo "  http://${FLASK_HOST}:${FLASK_PORT}"
echo
echo "Public:"
echo "  https://getfuturefunded.com"
echo
echo "Logs:"
echo "  tail -f $LOGDIR/flask.log $LOGDIR/cloudflared.log"
echo

wait
