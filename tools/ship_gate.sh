#!/usr/bin/env bash
set -euo pipefail

echo "== Ship Gate: FutureFunded =="
echo "BASE_URL=${BASE_URL:-http://127.0.0.1:5000}"

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"

# Contrast gate
python3 tools/ff_contrast_audit.py app/static/css/ff.css --objective aa --modes light,dark

# UX checkout gate
BASE_URL="$BASE_URL" npx playwright test tests/ff_checkout_ux.spec.ts

# App E2E gate
BASE_URL="$BASE_URL" npx playwright test tools/ff_app_e2e.spec.mjs

echo "✅ SHIP GATE PASSED"
