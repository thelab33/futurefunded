#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://getfuturefunded.com"
FILES=(
  "${BASE_URL}/static/css/ff.css?v=694e753"
  "${BASE_URL}/static/js/ff-app.js?v=dev"
)

if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "ERROR: Set CF_API_TOKEN in env"; exit 2
fi

# Get zone
ZONE=$(curl -sS -X GET "https://api.cloudflare.com/client/v4/zones?name=getfuturefunded.com" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" | jq -r '.result[0].id')

if [ -z "$ZONE" ] || [ "$ZONE" = "null" ]; then
  echo "ERROR: couldn't find zone id — check token and account"; exit 3
fi

echo "Using CF_ZONE_ID=$ZONE"

payload=$(jq -n --argjson files "$(printf '%s\n' "${FILES[@]}" | jq -R -s -c 'split("\n")[:-1]')" '{files: $files}')

echo "Purging files:"
printf '%s\n' "${FILES[@]}"

resp=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
  --data "$payload")

echo "$resp" | jq
