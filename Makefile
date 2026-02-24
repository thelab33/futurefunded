# -----------------------------------------------------------------------------
# FutureFunded • Dev/QA targets (canonical)
# -----------------------------------------------------------------------------

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

PY            ?= python3
FF_URL        ?= http://localhost:5000/
FF_BROWSER    ?= chrome
TIMEOUT_MS    ?= 15000

# 0 = warn/skip payments checks, 1 = enforce Stripe+PayPal markers
QA_REQUIRE_PAYMENTS ?= 0

# Optional toggles (set to 1):
#   HEADED=1      -> headed browser (debug)
#   STATIC=1      -> static HTML checks only (no Playwright)
#   QA_DEBUG=1    -> JS QA debug (prints tmp paths, etc.)
#   QA_KEEP_TMP=1 -> keep JS QA temp files
#   SMOKE_DEBUG=1 -> overlay smoke debug verbosity (if supported by script)
#   ALLOW_FORCE=1 -> overlay smoke allow force-clicks (diagnostic)
HEADED      ?=
STATIC      ?=
QA_DEBUG    ?=
QA_KEEP_TMP ?=
SMOKE_DEBUG ?=
ALLOW_FORCE ?=

# Retries for headed runs (prevents flaky “TargetClosedError” from ruining your day)
#   RETRIES=1 make smoke-overlays HEADED=1
RETRIES ?= 0

# -----------------------------------------------------------------------------
# Args builders (predictable + safe)
# -----------------------------------------------------------------------------
SMOKE_ARGS := --url "$(FF_URL)" --timeout-ms "$(TIMEOUT_MS)" --browser "$(FF_BROWSER)"

ifdef HEADED
SMOKE_ARGS += --headed
endif
ifdef STATIC
SMOKE_ARGS += --static
endif

ifneq ($(strip $(RETRIES)),0)
SMOKE_ARGS += --retries "$(RETRIES)"
endif

ifdef SMOKE_DEBUG
SMOKE_ARGS += --debug
endif
ifdef ALLOW_FORCE
SMOKE_ARGS += --allow-force
endif

QA_JS_ENV := REQUIRE_PAYMENTS=$(QA_REQUIRE_PAYMENTS)
ifdef QA_DEBUG
QA_JS_ENV += QA_DEBUG=1
endif
ifdef QA_KEEP_TMP
QA_JS_ENV += QA_KEEP_TMP=1
endif

# -----------------------------------------------------------------------------
# Targets
# -----------------------------------------------------------------------------
.PHONY: help print-vars \
        css-refresh css-superpatch preflight-css \
        qa-js smoke-overlays \
        preflight qa qa-strict qa-ci \
        qa-prod qa-prod-headed \
        qa-fast qa-headed qa-strict-headed qa-prod-strict qa-all

help:
	@printf "%s\n" \
	"FutureFunded Make Targets" \
	"-------------------------" \
	"make preflight            JS QA + overlay smoke (fast local gate)" \
	"make qa                   Alias of preflight" \
	"make qa-strict            Enforce payment markers in JS QA + overlay smoke" \
	"make qa-ci                CI-friendly strict gate (headless, retries=0 by default)" \
	"make smoke-overlays       Overlay smoke only" \
	"make qa-fast              Fastest: smoke-overlays only" \
	"make qa-headed            Preflight but headed + retries=1" \
	"make qa-strict-headed     Strict + headed + retries=1" \
	"make qa-all               CSS refresh + strict (ship gate)" \
	"make preflight-css        CSS refresh + preflight (when you changed templates/hooks)" \
	"make qa-prod              Overlay smoke against production (getfuturefunded.com)" \
	"make qa-prod-headed       Same as qa-prod but headed + retries=1" \
	"make qa-prod-strict       Strict gate against production URL" \
	"" \
	"Common vars:" \
	"  FF_URL=http://localhost:5000/   FF_BROWSER=chrome   TIMEOUT_MS=15000" \
	"" \
	"Toggles:" \
	"  HEADED=1 STATIC=1 QA_DEBUG=1 QA_KEEP_TMP=1 SMOKE_DEBUG=1 ALLOW_FORCE=1 RETRIES=1" \
	"" \
	"Examples:" \
	"  make preflight" \
	"  make qa-strict" \
	"  make qa-fast" \
	"  HEADED=1 RETRIES=1 make smoke-overlays" \
	"  make qa-headed" \
	"  make qa-strict-headed" \
	"  FF_URL=https://getfuturefunded.com/ make smoke-overlays" \
	"  make preflight-css" \
	"  make qa QA_DEBUG=1 QA_KEEP_TMP=1" \
	"  make qa-prod-headed" \
	"  make qa-prod-strict"

print-vars:
	@printf "%s\n" \
	"FF_URL=$(FF_URL)" \
	"FF_BROWSER=$(FF_BROWSER)" \
	"TIMEOUT_MS=$(TIMEOUT_MS)" \
	"QA_REQUIRE_PAYMENTS=$(QA_REQUIRE_PAYMENTS)" \
	"HEADED=$(HEADED) STATIC=$(STATIC) RETRIES=$(RETRIES)" \
	"QA_DEBUG=$(QA_DEBUG) QA_KEEP_TMP=$(QA_KEEP_TMP)" \
	"SMOKE_DEBUG=$(SMOKE_DEBUG) ALLOW_FORCE=$(ALLOW_FORCE)"

css-refresh:
	$(PY) tools/ff_css_refresh.py --html app/templates/index.html --css app/static/css/ff.css --canon tools/ff_css_core.css --write

css-superpatch:
	$(PY) tools/ff_css_refresh.py --html app/templates/index.html --css app/static/css/ff.css --write

qa-js:
	@$(QA_JS_ENV) scripts/qa_ff_app.sh app/static/js/ff-app.js

smoke-overlays:
	@$(PY) tools/ff_smoke_overlays.py $(SMOKE_ARGS)

# Full local gate (fast + confidence)
preflight: qa-js smoke-overlays
	@echo "✅ Preflight PASS"

qa: preflight

qa-strict:
	@$(MAKE) preflight QA_REQUIRE_PAYMENTS=1

# CI gate: strict JS markers + smoke (keep it deterministic; override vars in CI env if needed)
qa-ci:
	@$(MAKE) qa-strict FF_BROWSER="$(FF_BROWSER)" TIMEOUT_MS="$(TIMEOUT_MS)"

# When you changed markup/hooks and want to guarantee CSS parity before testing
preflight-css: css-refresh preflight

# Production gate (overlay smoke only; non-invasive)
qa-prod:
	@$(MAKE) smoke-overlays FF_URL="https://getfuturefunded.com/" FF_BROWSER="chrome" TIMEOUT_MS="20000"

qa-prod-headed:
	@$(MAKE) smoke-overlays FF_URL="https://getfuturefunded.com/" FF_BROWSER="chrome" TIMEOUT_MS="25000" HEADED=1 RETRIES=1

# -----------------------------------------------------------------------------
# Added: Fast/Headed/Strict/All convenience gates
# -----------------------------------------------------------------------------

# Smoke only (fastest)
qa-fast: smoke-overlays
	@echo "✅ QA FAST PASS"

# Headed debug run (local)
qa-headed:
	@$(MAKE) preflight HEADED=1 RETRIES=1

# Strict + headed debug (local)
qa-strict-headed:
	@$(MAKE) qa-strict HEADED=1 RETRIES=1

# Production strict (still non-invasive; runs strict flow against prod URL)
qa-prod-strict:
	@$(MAKE) qa-strict FF_URL="https://getfuturefunded.com/" FF_BROWSER="chrome" TIMEOUT_MS="25000"

# Everything gate (when you’re about to ship)
qa-all: css-refresh qa-strict
	@echo "✅ QA ALL PASS"

.PHONY: qa-fast qa-headed qa-strict-headed qa-prod-strict qa-all

# Smoke only (fastest)
qa-fast: smoke-overlays
	@echo "✅ QA FAST PASS"

# Headed debug run (local)
qa-headed:
	@$(MAKE) preflight HEADED=1 RETRIES=1

# Strict + headed debug (local)
qa-strict-headed:
	@$(MAKE) qa-strict HEADED=1 RETRIES=1

# Production strict (non-invasive; validates overlays + strict JS markers locally)
qa-prod-strict:
	@$(MAKE) qa-strict FF_URL="https://getfuturefunded.com/" FF_BROWSER="chrome" TIMEOUT_MS="25000"

# Everything gate (when you’re about to ship)
qa-all: css-refresh qa-strict
	@echo "✅ QA ALL PASS"
