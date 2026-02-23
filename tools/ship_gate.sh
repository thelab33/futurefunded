#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"

echo "== Ship Gate: FutureFunded =="
echo "BASE_URL=$BASE_URL"

python3 tools/ff_contrast_audit.py app/static/css/ff.css --objective aa --modes light,dark
BASE_URL="$BASE_URL" npx playwright test tests/ff_checkout_ux.spec.ts
BASE_URL="$BASE_URL" npx playwright test tests/ff_app_e2e.spec.mjs

echo "✅ Ship gate passed."
