#!/usr/bin/env bash
set -euo pipefail

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; NC=$'\033[0m'
CSS_OUT="./static/css/fundchamps.css"

pass(){ echo "${GREEN}✔${NC} $*"; }
warn(){ echo "${YELLOW}⚠${NC} $*"; }
fail(){ echo "${RED}✖${NC} $*"; exit 1; }

# 1) Exists + non-empty
[[ -s "$CSS_OUT" ]] || fail "Bundle not found or empty: $CSS_OUT"

# 2) Size floor (catches accidental purges to near-zero)
BYTES=$(wc -c < "$CSS_OUT" | tr -d ' ')
MIN=1024
(( BYTES >= MIN )) || fail "Bundle too small (${BYTES} bytes) — purge or build issue?"

# 3) Contains our custom classes (from your layered CSS)
grep -qE '\.fc-btn\b' "$CSS_OUT"   || fail "Missing .fc-btn"
grep -qE '\.fc-card\b' "$CSS_OUT"  || fail "Missing .fc-card"
grep -qE '\.hero-shell\b' "$CSS_OUT" || fail "Missing .hero-shell"

# 4) No unresolved @apply left (means Tailwind expansion worked)
if grep -q '@apply' "$CSS_OUT"; then
  fail "Found unresolved @apply in output — Tailwind not expanding layer utilities"
fi

# 5) Sanity: common Tailwind utilities present (container or bg-yellow-400)
if ! grep -qE '\.container\b|\b.bg-yellow-400\b' "$CSS_OUT"; then
  warn "Could not find common Tailwind utilities; verify content globs in tailwind.config.mjs"
fi

pass "fundchamps.css looks legit (${BYTES} bytes)"

