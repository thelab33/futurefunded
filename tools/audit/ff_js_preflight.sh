#!/usr/bin/env bash
set -euo pipefail

JS="app/static/js/ff-app.js"
HTML="app/templates/index.html"

if [ ! -f "$JS" ]; then
  ALT="$(find app -type f -name 'ff-app.js' | head -n 1 || true)"
  if [ -n "$ALT" ]; then
    JS="$ALT"
  else
    echo "❌ Could not find ff-app.js under ./app"
    exit 1
  fi
fi

echo "==> ff-app.js contract gate"
python tools/audit/ff_js_contract_gate.py "$JS" "$HTML"

echo
if [ -f .eslint.config.js ] || [ -f .eslintrc ] || [ -f .eslintrc.json ] || [ -f .eslintrc.js ]; then
  echo "==> eslint"
  npx eslint "$JS"
else
  echo "==> eslint"
  echo "• No ESLint config found; skipping"
fi

echo
echo "✅ ff-app.js preflight complete"
