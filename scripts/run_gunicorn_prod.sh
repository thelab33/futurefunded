#!/usr/bin/env bash
set -euo pipefail

cd /home/elCUCO/futurefunded

pkill -f 'gunicorn.*run:app' || true
sleep 2

set -a

# FF_SERVER_CLEANUP_V1
echo "--- cleanup old app servers ---"
pkill -f 'gunicorn.*run:app' 2>/dev/null || true
pkill -f 'python.*run.py' 2>/dev/null || true
pkill -f 'flask run' 2>/dev/null || true

# kill any leftover listener on 5000 as final fallback
if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -ti tcp:5000 2>/dev/null || true)"
  if [ -n "${pids}" ]; then
    echo "Killing leftover port 5000 PID(s): ${pids}"
    kill ${pids} 2>/dev/null || true
    sleep 1
  fi
fi

source .env
export ENV=production
export APP_ENV=production
export FLASK_ENV=production
export FLASK_CONFIG=app.config.ProductionConfig
export SOCKETIO_ASYNC_MODE=threading
set +a

nohup .venv/bin/gunicorn \
  --bind 0.0.0.0:5000 \
  --workers 2 \
  --threads 8 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile - \
  'run:app' > /tmp/futurefunded-gunicorn.log 2>&1 &

sleep 4

# FF_POSTSTART_HEALTHCHECK_V1
sleep 2
if ! ss -ltnp | grep -q ':5000 '; then
  echo "ERROR: Gunicorn did not bind to port 5000"
  echo "--- recent log tail ---"
  tail -n 120 /tmp/futurefunded-gunicorn.log || true
  exit 1
fi

echo "--- listening ---"
ss -ltnp | grep ':5000 ' || true

echo "--- log tail ---"
tail -n 80 /tmp/futurefunded-gunicorn.log || true
