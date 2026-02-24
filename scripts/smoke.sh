#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
TMP_HTML="/tmp/ff_page.html"

echo "==[1] HTTP"
for p in "/" "/api/status" "/payments/health" "/payments/config" "/static/css/ff.css" "/static/js/ff-app.js"; do
  code="$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$p")"
  printf "%-28s %s\n" "$p" "$code"
  [[ "$code" == "200" ]] || { echo "❌ $p returned $code"; exit 1; }
done

echo "==[2] HTML contracts"
curl -fsS "$BASE_URL/" > "$TMP_HTML"

ffConfigCount="$(grep -o 'id="ffConfig"' "$TMP_HTML" | wc -l | tr -d ' ')"
ffSelectorsCount="$(grep -o 'id="ffSelectors"' "$TMP_HTML" | wc -l | tr -d ' ')"
[[ "$ffConfigCount" == "1" ]] || { echo "❌ ffConfig count=$ffConfigCount"; exit 1; }
[[ "$ffSelectorsCount" == "1" ]] || { echo "❌ ffSelectors count=$ffSelectorsCount"; exit 1; }

if grep -Eq 'on(click|load|error|submit|input|change|focus|blur|keydown|keyup|keypress)=' "$TMP_HTML"; then
  echo "❌ inline event handlers found"
  exit 1
fi

SEL_JSON="$(awk 'BEGIN{RS="</script>"} /id="ffSelectors"/ {print $0}' "$TMP_HTML")"
echo "$SEL_JSON" | grep -Eq '{{|{%' && { echo "❌ template markers inside ffSelectors"; exit 1; }

echo "==[3] Required hooks"
REQ=(
  "data-ff-open-checkout"
  "data-ff-close-checkout"
  "data-ff-checkout-sheet"
  "data-ff-checkout-viewport"
  "data-ff-checkout-content"
  "data-ff-open-sponsor"
  "data-ff-close-sponsor"
  "data-ff-sponsor-modal"
  "data-ff-open-drawer"
  "data-ff-close-drawer"
  "data-ff-drawer"
  "data-ff-share"
  "data-ff-theme-toggle"
  "data-ff-toasts"
  "data-ff-live"
)
for h in "${REQ[@]}"; do
  grep -q "$h" "$TMP_HTML" || { echo "❌ missing hook: $h"; exit 1; }
done

echo "==[PASS] Smoke OK ✅"
