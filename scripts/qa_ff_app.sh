#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# FutureFunded • QA: ff-app.js
# - CSP hygiene: eval/new Function/insertAdjacentHTML/document.write (code-only scan)
# - Architecture sanity markers (strings preserved scan)
# - Optional strict payments markers (Stripe + PayPal)
#
# Usage:
#   ./scripts/qa_ff_app.sh app/static/js/ff-app.js
#   REQUIRE_PAYMENTS=1 ./scripts/qa_ff_app.sh app/static/js/ff-app.js
#   ./scripts/qa_ff_app.sh --payments app/static/js/ff-app.js
#   ./scripts/qa_ff_app.sh --debug --keep-tmp app/static/js/ff-app.js
# -----------------------------------------------------------------------------

PASS=0
FAIL=0

ok()   { echo "✅ $*"; PASS=$((PASS+1)); }
fail() { echo "❌ $*"; FAIL=$((FAIL+1)); }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 2
  }
}

usage() {
  cat <<'USAGE' >&2
Usage:
  qa_ff_app.sh [--payments] [--debug] [--keep-tmp] path/to/ff-app.js

Flags:
  --payments    Enforce Stripe + PayPal markers (same as REQUIRE_PAYMENTS=1)
  --debug       Print temp file paths
  --keep-tmp    Do not delete temp files (useful for debugging matches)

Env:
  REQUIRE_PAYMENTS=1  Enforce payments markers
USAGE
}

DEBUG=0
KEEP_TMP=0
REQUIRE_PAYMENTS="${REQUIRE_PAYMENTS:-0}"

# Parse flags (flags can appear before the file arg)
JS_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --payments) REQUIRE_PAYMENTS=1; shift ;;
    --debug) DEBUG=1; shift ;;
    --keep-tmp) KEEP_TMP=1; shift ;;
    --help|-h) usage; exit 0 ;;
    -*)
      echo "Unknown flag: $1" >&2
      usage
      exit 2
      ;;
    *)
      JS_FILE="$1"
      shift
      break
      ;;
  esac
done

# If there are extra args after JS_FILE, that’s an error.
if [[ $# -gt 0 ]]; then
  echo "Unexpected extra arguments: $*" >&2
  usage
  exit 2
fi

if [[ -z "${JS_FILE}" || ! -f "${JS_FILE}" ]]; then
  echo "Usage: $0 [--payments] [--debug] [--keep-tmp] path/to/ff-app.js" >&2
  exit 2
fi

need_cmd python3
need_cmd rg
need_cmd mktemp
need_cmd wc
need_cmd tr

echo "🧪 FutureFunded QA: ff-app.js"
echo "File: ${JS_FILE}"
echo "Payments required: ${REQUIRE_PAYMENTS}"
echo "------------------------------------------------------------"

TMP_CODE="$(mktemp -t ffappqa.code.XXXXXX.js)"
TMP_NOCOMMENT="$(mktemp -t ffappqa.nocomment.XXXXXX.js)"

cleanup() {
  if [[ "${KEEP_TMP}" == "1" ]]; then
    echo "DEBUG: keeping temp files:"
    echo "DEBUG: TMP_CODE=${TMP_CODE}"
    echo "DEBUG: TMP_NOCOMMENT=${TMP_NOCOMMENT}"
  else
    rm -f "${TMP_CODE}" "${TMP_NOCOMMENT}"
  fi
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Build two sanitized views:
#  - TMP_CODE: remove comments + strings (keeps template-literal ${...} expressions as code)
#  - TMP_NOCOMMENT: remove comments only (keeps strings, so markers like "data-open" remain)
# No PCRE2 required.
# -----------------------------------------------------------------------------
python3 - "$JS_FILE" "$TMP_CODE" "$TMP_NOCOMMENT" <<'PY'
import sys

src_path = sys.argv[1]
out_code_path = sys.argv[2]
out_nc_path = sys.argv[3]

s = open(src_path, "r", encoding="utf-8", errors="replace").read()
n = len(s)

code_out = list(s)  # blank comments + strings (keep newlines)
nc_out = list(s)    # blank comments only (keep strings)

CODE, LINEC, BLOCKC, SQ, DQ, TPL = range(6)
state = CODE
i = 0
escape = False

# Template literal handling:
# - In TMP_CODE, we blank literal text but keep ${ ... } expressions as code.
in_tpl_expr = False
tpl_depth = 0

def blank(arr, j):
  if arr[j] != "\n":
    arr[j] = " "

def blank_both(j):
  blank(code_out, j)
  blank(nc_out, j)

def blank_code(j):
  blank(code_out, j)

while i < n:
  c = s[i]
  nxt = s[i+1] if i+1 < n else ""

  if state == CODE:
    # line comment //
    if c == "/" and nxt == "/":
      blank_both(i); blank_both(i+1)
      i += 2
      state = LINEC
      continue

    # block comment /* */
    if c == "/" and nxt == "*":
      blank_both(i); blank_both(i+1)
      i += 2
      state = BLOCKC
      continue

    # strings
    if c == "'":
      blank_code(i); i += 1
      state = SQ; escape = False
      continue
    if c == '"':
      blank_code(i); i += 1
      state = DQ; escape = False
      continue
    if c == "`":
      blank_code(i); i += 1
      state = TPL; escape = False
      continue

    # track tpl expr braces
    if in_tpl_expr:
      if c == "{":
        tpl_depth += 1
      elif c == "}":
        tpl_depth -= 1
        if tpl_depth <= 0:
          in_tpl_expr = False
          state = TPL
          i += 1
          continue

    i += 1
    continue

  if state == LINEC:
    blank_both(i)
    if c == "\n":
      state = CODE
    i += 1
    continue

  if state == BLOCKC:
    blank_both(i)
    if c == "*" and nxt == "/":
      blank_both(i+1)
      i += 2
      state = CODE
      continue
    i += 1
    continue

  if state == SQ:
    blank_code(i)
    if escape:
      escape = False; i += 1; continue
    if c == "\\":
      escape = True; i += 1; continue
    if c == "'":
      state = CODE
    i += 1
    continue

  if state == DQ:
    blank_code(i)
    if escape:
      escape = False; i += 1; continue
    if c == "\\":
      escape = True; i += 1; continue
    if c == '"':
      state = CODE
    i += 1
    continue

  if state == TPL:
    # ${ starts a code expression inside template literal
    if c == "$" and nxt == "{":
      blank_code(i); blank_code(i+1)
      i += 2
      in_tpl_expr = True
      tpl_depth = 1
      state = CODE
      continue

    blank_code(i)
    if escape:
      escape = False; i += 1; continue
    if c == "\\":
      escape = True; i += 1; continue
    if c == "`":
      state = CODE
    i += 1
    continue

open(out_code_path, "w", encoding="utf-8").write("".join(code_out))
open(out_nc_path, "w", encoding="utf-8").write("".join(nc_out))
PY

if [[ "${DEBUG}" == "1" ]]; then
  echo "DEBUG: TMP_CODE=${TMP_CODE}"
  echo "DEBUG: TMP_NOCOMMENT=${TMP_NOCOMMENT}"
fi

# -----------------------------------------------------------------------------
# rg helpers (pipefail-safe)
# -----------------------------------------------------------------------------
rg_has_code()      { rg -q -- "$1" "$TMP_CODE" 2>/dev/null; }
rg_has_nocomment() { rg -q -- "$1" "$TMP_NOCOMMENT" 2>/dev/null; }

rg_count_lines_nocomment() {
  ( rg -n -- "$1" "$TMP_NOCOMMENT" 2>/dev/null || true ) | wc -l | tr -d ' '
}

# -----------------------------------------------------------------------------
# CSP / security hygiene (scan CODE view = executable code only)
# -----------------------------------------------------------------------------
if rg_has_code '\beval\s*\('; then
  fail "CSP unsafe: eval() found in executable code"
else
  ok "No eval() in executable code"
fi

if rg_has_code '\bnew\s+Function\b'; then
  fail "CSP unsafe: new Function() found in executable code"
else
  ok "No new Function() in executable code"
fi

if rg_has_code '\binsertAdjacentHTML\b'; then
  fail "Unsafe HTML injection: insertAdjacentHTML() found"
else
  ok "No insertAdjacentHTML()"
fi

if rg_has_code '\bdocument\.write\s*\('; then
  fail "Unsafe document.write(): found"
else
  ok "No document.write()"
fi

# -----------------------------------------------------------------------------
# Runtime sanity (scan NOCOMMENT view = strings kept)
# -----------------------------------------------------------------------------
c_sf="$(rg_count_lines_nocomment '\bloadScriptSingleFlight\b')"
if [[ "$c_sf" -ge 1 ]]; then
  ok "Single-flight loader exists (loadScriptSingleFlight) (got=$c_sf)"
else
  fail "Single-flight loader missing (loadScriptSingleFlight)"
fi

if rg_has_nocomment 'data-open' || rg_has_nocomment 'aria-hidden' || rg_has_nocomment '\bsetOpenState\b'; then
  ok "Overlay state toggles present (data-open / aria-hidden / setOpenState)"
else
  fail "Overlay state toggles missing (expected data-open/aria-hidden/setOpenState)"
fi

# Boot guard: warn-only
if rg_has_nocomment '\bBOOT_KEY\b' || rg_has_nocomment '__ffBoot' || rg_has_nocomment '__ffBooted' || rg_has_nocomment 'already boot'; then
  ok "Boot guard marker present (BOOT_KEY / __ffBoot*)"
else
  ok "Boot guard marker not detected (warn-only)"
fi

# -----------------------------------------------------------------------------
# Payments strict checks (scan NOCOMMENT view)
# -----------------------------------------------------------------------------
if [[ "${REQUIRE_PAYMENTS}" == "1" ]]; then
  if rg_has_nocomment '\bconfirmPayment\b' || rg_has_nocomment '\bconfirmCardPayment\b' || rg_has_nocomment '\bStripe\s*\(' || rg_has_nocomment '\bensureStripe\b'; then
    ok "Stripe flow markers present"
  else
    fail "Stripe flow markers missing (confirmPayment/Stripe()/ensureStripe)"
  fi

  if rg_has_nocomment 'paypal\.Buttons' && rg_has_nocomment '\bcreateOrder\b' && rg_has_nocomment '\bonApprove\b'; then
    ok "PayPal flow markers present (Buttons/createOrder/onApprove)"
  else
    fail "PayPal flow markers missing (paypal.Buttons/createOrder/onApprove)"
  fi

  # Optional: capture marker (warn-only)
  if rg_has_nocomment 'actions\.order\.capture' || rg_has_nocomment '\border\.capture\b'; then
    ok "PayPal capture marker detected"
  else
    ok "PayPal capture marker not detected (warn-only)"
  fi
else
  ok "Payments strict checks skipped (use REQUIRE_PAYMENTS=1 or --payments)"
fi

echo "------------------------------------------------------------"
echo "✅ PASS: ${PASS}"
echo "❌ FAIL: ${FAIL}"
echo "------------------------------------------------------------"

if [[ "${FAIL}" -gt 0 ]]; then
  echo "🚨 ff-app.js QA FAILED"
  exit 1
fi

echo "🎉 ff-app.js QA PASSED"
exit 0

