#!/usr/bin/env bash
set -euo pipefail

# FutureFunded • Smoke Test Runner (curl + Playwright-lite)
# Usage:
#   ./scripts/ff_smoke.sh
#   BASE_URL=http://127.0.0.1:5000 ./scripts/ff_smoke.sh
#   BASE_URL=https://getfuturefunded.com FF_SMOKE_ALLOW_LIVE=1 ./scripts/ff_smoke.sh
#
# Notes:
# - Refuses to run "write" calls (Stripe intent / PayPal order) against non-localhost unless FF_SMOKE_ALLOW_LIVE=1
# - Attempts to read #ffConfig from the homepage to discover endpoints. Falls back to common defaults.

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
ALLOW_LIVE="${FF_SMOKE_ALLOW_LIVE:-0}"
HEADLESS="${HEADLESS:-1}" # forwarded to UI runner if present

say() { printf "\033[1;36m%s\033[0m\n" "$*"; }
ok()  { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn(){ printf "\033[1;33m! %s\033[0m\n" "$*"; }
bad() { printf "\033[1;31m✗ %s\033[0m\n" "$*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { bad "Missing required dependency: $1"; exit 1; }
}

need curl
need python3

# --- Live safety guard ---
python3 - "$BASE_URL" "$ALLOW_LIVE" <<'PY'
import sys, urllib.parse
base = sys.argv[1].strip()
allow = sys.argv[2].strip() == "1"
u = urllib.parse.urlparse(base if "://" in base else "http://" + base)
host = (u.hostname or "").lower()
is_local = host in ("localhost","127.0.0.1","0.0.0.0") or host.endswith(".local")
if not is_local and not allow:
  print(f"\nRefusing to run against non-local host ({host}).")
  print("Set FF_SMOKE_ALLOW_LIVE=1 if you REALLY mean it.\n")
  sys.exit(2)
PY

# --- helpers ---
tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

abs_url() {
  local path="$1"
  if [[ "$path" =~ ^https?:// ]]; then
    echo "$path"
  elif [[ "$path" == /* ]]; then
    echo "${BASE_URL%/}$path"
  else
    echo "${BASE_URL%/}/$path"
  fi
}

curl_code() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local out="$4"
  local code

  if [[ "$method" == "GET" ]]; then
    code="$(curl -sS -o "$out" -w "%{http_code}" "$url")"
  else
    code="$(curl -sS -o "$out" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -X "$method" \
      --data "$data" \
      "$url")"
  fi

  echo "$code"
}

json_has_any_key() {
  local file="$1"
  shift
  python3 - "$file" "$@" <<'PY'
import json, sys
p = sys.argv[1]
keys = sys.argv[2:]
try:
  obj = json.loads(open(p,"r",encoding="utf-8").read() or "{}")
except Exception:
  sys.exit(1)

def has_key(o, k):
  if isinstance(o, dict):
    return k in o
  return False

# shallow + common nesting scan
def scan(o, k):
  if isinstance(o, dict):
    if k in o: return True
    for v in o.values():
      if scan(v, k): return True
  elif isinstance(o, list):
    for v in o:
      if scan(v, k): return True
  return False

for k in keys:
  if scan(obj, k):
    sys.exit(0)
sys.exit(2)
PY
}

extract_ffconfig() {
  local html="$1"
  local outf="$2"
  python3 - "$html" "$outf" <<'PY'
import re, json, sys
html_path, out_path = sys.argv[1], sys.argv[2]
s = open(html_path,"r",encoding="utf-8").read()

m = re.search(r'<script[^>]*\bid=["\']ffConfig["\'][^>]*>(.*?)</script>', s, re.I|re.S)
cfg = {}
if m:
  raw = m.group(1).strip()
  try:
    cfg = json.loads(raw)
  except Exception:
    cfg = {}
open(out_path,"w",encoding="utf-8").write(json.dumps(cfg, ensure_ascii=False, indent=2))
PY
}

pick_endpoint() {
  # print best guess endpoint from ffConfig JSON (or empty)
  local cfg="$1"
  local keypath="$2"
  python3 - "$cfg" "$keypath" <<'PY'
import json, sys
cfgp, keypath = sys.argv[1], sys.argv[2]
try:
  cfg = json.loads(open(cfgp,"r",encoding="utf-8").read() or "{}")
except Exception:
  cfg = {}

cur = cfg
for part in keypath.split("."):
  if isinstance(cur, dict) and part in cur:
    cur = cur[part]
  else:
    cur = None
    break

if isinstance(cur, str) and cur.strip():
  print(cur.strip())
PY
}

# --- Step 1: Fetch homepage + parse ffConfig if present ---
say "SMOKE: Fetching homepage…"
home_html="$tmpdir/home.html"
code="$(curl_code GET "$(abs_url "/")" "" "$home_html")"
if [[ "$code" != "200" ]]; then
  bad "Homepage GET / returned HTTP $code"
  exit 1
fi
ok "Homepage reachable (HTTP 200)"

cfg_json="$tmpdir/ffconfig.json"
extract_ffconfig "$home_html" "$cfg_json"

# Discover endpoints from ffConfig (best effort)
stripe_intent="$(pick_endpoint "$cfg_json" "payments.stripeIntentEndpoint")"
paypal_create="$(pick_endpoint "$cfg_json" "payments.paypalCreateOrderEndpoint")"
paypal_capture="$(pick_endpoint "$cfg_json" "payments.paypalCaptureEndpoint")"

# Fallbacks if config doesn't include them
: "${stripe_intent:=/payments/stripe/intent}"
# common alternates you might have used
stripe_alts=( "$stripe_intent" "/payments/stripe/intent" "/payments/stripe/payment-intent" "/stripe/intent" )

: "${paypal_create:=/payments/paypal/order}"
: "${paypal_capture:=/payments/paypal/capture}"
paypal_create_alts=( "$paypal_create" "/payments/paypal/order" "/payments/paypal/create-order" "/paypal/order" )
paypal_capture_alts=( "$paypal_capture" "/payments/paypal/capture" "/payments/paypal/capture-order" "/paypal/capture" )

say "SMOKE: Endpoint discovery"
ok  "Stripe intent candidate: $stripe_intent"
ok  "PayPal create candidate: $paypal_create"
ok  "PayPal capture candidate: $paypal_capture"

# --- Step 2: Optional health/status checks (non-fatal) ---
say "SMOKE: Health checks (best effort)…"
for path in "/status" "/payments/health" "/payments/status" "/api/status"; do
  out="$tmpdir/health.json"
  c="$(curl -sS -o "$out" -w "%{http_code}" "$(abs_url "$path")" || true)"
  if [[ "$c" == "200" ]]; then
    ok "GET $path → 200"
  else
    warn "GET $path → $c (skipping)"
  fi
done

# --- Step 3: Stripe intent test (find a working endpoint) ---
say "SMOKE: Stripe intent POST (non-charging; creates intent server-side)…"

stripe_body="$tmpdir/stripe.json"
stripe_ok=0
stripe_url=""

stripe_payload='{"amount":100,"amount_cents":100,"currency":"USD","name":"Smoke Test","email":"smoke@test.local","note":"FF smoke test (no charge)"}'

for ep in "${stripe_alts[@]}"; do
  url="$(abs_url "$ep")"
  out="$tmpdir/stripe_resp.json"
  c="$(curl_code POST "$url" "$stripe_payload" "$out" || true)"
  if [[ "$c" == "200" ]]; then
    # accept if response contains client_secret OR payment_intent-ish keys
    if json_has_any_key "$out" "client_secret" "clientSecret" "payment_intent" "paymentIntent" "id" ; then
      ok "Stripe intent OK at $ep (HTTP 200 + expected keys)"
      stripe_ok=1
      stripe_url="$url"
      cp "$out" "$stripe_body"
      break
    else
      warn "Stripe intent at $ep returned 200 but missing expected keys (inspect $out)"
    fi
  else
    warn "Stripe intent at $ep → HTTP $c"
  fi
done

if [[ "$stripe_ok" != "1" ]]; then
  bad "Stripe intent smoke failed (no endpoint returned expected success payload)"
  exit 1
fi

# --- Step 4: PayPal create + capture “alive” test ---
say "SMOKE: PayPal order create/capture (alive checks)…"

paypal_payload='{"amount":"1.00","currency":"USD","note":"FF smoke test"}'
pp_create_ok=0
pp_capture_ok=0
pp_order_id=""

for ep in "${paypal_create_alts[@]}"; do
  url="$(abs_url "$ep")"
  out="$tmpdir/pp_create.json"
  c="$(curl_code POST "$url" "$paypal_payload" "$out" || true)"
  if [[ "$c" == "200" ]]; then
    # try to extract order id from common shapes: {id}, {orderID}, {order_id}
    pp_order_id="$(python3 - "$out" <<'PY'
import json,sys
p=sys.argv[1]
try: o=json.loads(open(p,"r",encoding="utf-8").read() or "{}")
except Exception: o={}
for k in ("id","orderID","order_id"):
  if isinstance(o,dict) and isinstance(o.get(k),str) and o.get(k):
    print(o.get(k)); raise SystemExit(0)
# sometimes nested
def scan(x):
  if isinstance(x,dict):
    for k,v in x.items():
      if k in ("id","orderID","order_id") and isinstance(v,str) and v:
        return v
      r=scan(v)
      if r: return r
  if isinstance(x,list):
    for v in x:
      r=scan(v)
      if r: return r
  return ""
r=scan(o)
if r: print(r)
PY
)"
    if [[ -n "$pp_order_id" ]]; then
      ok "PayPal create OK at $ep (HTTP 200, order id: ${pp_order_id:0:10}…)"
      pp_create_ok=1
      pp_create_ep="$ep"
      break
    else
      warn "PayPal create at $ep returned 200 but no order id found"
    fi
  else
    warn "PayPal create at $ep → HTTP $c"
  fi
done

if [[ "$pp_create_ok" != "1" ]]; then
  warn "PayPal create-order smoke could not confirm a valid order id (continuing, but investigate endpoints)."
else
  # Capture behavior: without buyer approval, capture may return 4xx with "not approved" — that's still "alive".
  for ep in "${paypal_capture_alts[@]}"; do
    url="$(abs_url "$ep")"
    out="$tmpdir/pp_capture.json"
    cap_payload="{\"orderID\":\"$pp_order_id\"}"
    c="$(curl_code POST "$url" "$cap_payload" "$out" || true)"

    if [[ "$c" == "200" ]]; then
      ok "PayPal capture OK at $ep (HTTP 200)"
      pp_capture_ok=1
      break
    fi

    # treat 400/409/422 as "alive" if response includes common error keys
    if [[ "$c" == "400" || "$c" == "409" || "$c" == "422" ]]; then
      if json_has_any_key "$out" "error" "details" "name" "message" "debug_id" ; then
        ok "PayPal capture endpoint alive at $ep (HTTP $c with structured error — often expected without approval)"
        pp_capture_ok=1
        break
      fi
    fi

    warn "PayPal capture at $ep → HTTP $c"
  done

  if [[ "$pp_capture_ok" != "1" ]]; then
    warn "PayPal capture endpoint did not confirm alive (you may need different capture endpoint wiring)."
  fi
fi

# --- Step 5: UI overlay checks (Playwright-lite) ---
say "SMOKE: UI overlay checks (Playwright-lite)…"

if command -v node >/dev/null 2>&1; then
  # Check if playwright is installed
  if node -e "require('playwright');" >/dev/null 2>&1; then
    BASE_URL="$BASE_URL" HEADLESS="$HEADLESS" node "$(dirname "$0")/ff_smoke_ui.mjs"
    ok "UI smoke completed"
  else
    warn "Playwright not installed. To enable UI checks:"
    warn "  npm i -D playwright && npx playwright install chromium"
  fi
else
  warn "Node not found. Skipping UI checks."
fi

say "SMOKE: Done ✅"
ok "Stripe intent: PASS"
if [[ "$pp_create_ok" == "1" ]]; then ok "PayPal create: PASS"; else warn "PayPal create: UNKNOWN"; fi
if [[ "$pp_capture_ok" == "1" ]]; then ok "PayPal capture: ALIVE"; else warn "PayPal capture: UNKNOWN"; fi

exit 0

