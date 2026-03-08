#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://getfuturefunded.com}"
EXPECTED_VERSION="${2:-15.0.0}"

echo "== FutureFunded Live Site Check =="
echo "Base URL:          $BASE_URL"
echo "Expected version:  $EXPECTED_VERSION"
echo

tmp_html="$(mktemp)"
trap 'rm -f "$tmp_html"' EXIT

echo "-- Fetching homepage HTML --"
curl -fsSL "$BASE_URL" -o "$tmp_html"

echo
echo "-- Asset references found in live HTML --"
rg 'ff\.css|ff-app\.js|stylesheet|preload' "$tmp_html" || true

echo
echo "-- Version checks --"
if rg -q "/static/css/ff\.css\?v=$EXPECTED_VERSION" "$tmp_html"; then
  echo "✅ CSS version matches expected: $EXPECTED_VERSION"
else
  echo "❌ CSS version does not match expected: $EXPECTED_VERSION"
  exit 1
fi

if rg -q "/static/js/ff-app\.js\?v=$EXPECTED_VERSION" "$tmp_html"; then
  echo "✅ JS version matches expected: $EXPECTED_VERSION"
else
  echo "❌ JS version does not match expected: $EXPECTED_VERSION"
  exit 1
fi

if rg -q "/static/css/ff\.css\?v=dev" "$tmp_html"; then
  echo "❌ Live HTML still references CSS v=dev"
  exit 1
fi

if rg -q "/static/js/ff-app\.js\?v=dev" "$tmp_html"; then
  echo "❌ Live HTML still references JS v=dev"
  exit 1
fi

echo
echo "-- HTTP headers: CSS --"
curl -IfsS "$BASE_URL/static/css/ff.css?v=$EXPECTED_VERSION" | sed 's/\r$//'

echo
echo "-- HTTP headers: JS --"
curl -IfsS "$BASE_URL/static/js/ff-app.js?v=$EXPECTED_VERSION" | sed 's/\r$//'

echo
echo "-- Status probe --"
if curl -fsS "$BASE_URL/api/status" >/dev/null 2>&1; then
  echo "✅ /api/status reachable"
else
  echo "⚠️  /api/status not reachable via public URL"
fi

echo
echo "PASS — live site is serving the expected asset version."
