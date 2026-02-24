#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# FutureFunded • Preflight
# Single Source of Truth: delegates to Makefile targets (qa / qa-strict)
#
# Usage:
#   ./tools/preflight.sh                 # make qa
#   STRICT=1 ./tools/preflight.sh        # make qa-strict
#
# Optional knobs (only passed if set):
#   FF_URL=http://localhost:5000/
#   FF_BROWSER=chrome
#   TIMEOUT_MS=15000
#   HEADED=1
#   STATIC=1
#   QA_DEBUG=1
#   QA_KEEP_TMP=1
# -----------------------------------------------------------------------------

echo "== FutureFunded Preflight =="

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 2
  }
}

need_cmd make

TARGET="qa"
[[ "${STRICT:-0}" == "1" ]] && TARGET="qa-strict"

# Build make VAR=... args, but ONLY when non-empty so we don't override Makefile defaults.
MAKE_VARS=()

[[ -n "${FF_URL:-}" ]]      && MAKE_VARS+=(FF_URL="${FF_URL}")
[[ -n "${FF_BROWSER:-}" ]]  && MAKE_VARS+=(FF_BROWSER="${FF_BROWSER}")
[[ -n "${TIMEOUT_MS:-}" ]]  && MAKE_VARS+=(TIMEOUT_MS="${TIMEOUT_MS}")

[[ -n "${HEADED:-}" ]]      && MAKE_VARS+=(HEADED=1)
[[ -n "${STATIC:-}" ]]      && MAKE_VARS+=(STATIC=1)

[[ -n "${QA_DEBUG:-}" ]]    && MAKE_VARS+=(QA_DEBUG=1)
[[ -n "${QA_KEEP_TMP:-}" ]] && MAKE_VARS+=(QA_KEEP_TMP=1)

echo "== Running: make ${TARGET} =="
if [[ "${#MAKE_VARS[@]}" -gt 0 ]]; then
  printf "   with vars: %s\n" "${MAKE_VARS[*]}"
else
  echo "   with vars: (none; using Makefile defaults)"
fi
echo ""

exec make "${MAKE_VARS[@]}" "${TARGET}"

