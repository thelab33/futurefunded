# FutureFunded Launch Runbook

## Canonical prod restart
./scripts/run_gunicorn_prod.sh

## Prod smoke
./scripts/smoke_prod.sh

## Deploy sanity
python tools/ff_deploy_sanity.py

## Live site check
bash tools/check_live_site.sh https://getfuturefunded.com 15.0.0

## Key endpoints
- /stats
- /api/stats
- /api/status
- /payments/stripe/webhook

## Current launch posture
- Stripe: enabled (test mode)
- PayPal: disabled
- Mail: not configured
- Canonical site: https://getfuturefunded.com

## Known non-blockers
- CSS contract audit includes Jinja false positives
- Stats rounding differs slightly between /stats and /api/stats
- Restart script duplication still being consolidated
