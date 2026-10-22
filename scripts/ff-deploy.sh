#!/usr/bin/env bash
set -Eeuo pipefail

FF_MODE="${1:-preview}"
case "$FF_MODE" in
  preview) FF_TARGET=(--target=preview) ;;
  production) FF_TARGET=(--prod --skip-domain) ;;
  *) printf 'Usage: bash scripts/ff-deploy.sh [preview|production]\n' >&2; exit 2 ;;
esac

FF_ROOT="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$FF_ROOT"
FF_COMMIT="$(git rev-parse HEAD)"
git diff --quiet
git diff --cached --quiet
git cat-file -e "$FF_COMMIT:vercel.json"
git cat-file -e "$FF_COMMIT:scripts/ff-deploy.sh"

# Fail before any upload if this working script/config differs from the commit.
python3 - "$FF_ROOT" "$FF_COMMIT" <<'PY'
from pathlib import Path
import json, subprocess, sys
root=Path(sys.argv[1]); commit=sys.argv[2]
for name in ('vercel.json','scripts/ff-deploy.sh'):
    recorded=subprocess.check_output(['git','show',f'{commit}:{name}'],cwd=root)
    if (root/name).read_bytes()!=recorded:
        raise SystemExit('STOP: Commit the release files before deploying.')
config=json.loads((root/'vercel.json').read_text())
if config.get('framework')!='nextjs' or config.get('buildCommand')!='npm run build' or config.get('outputDirectory','missing') is not None:
    raise SystemExit('STOP: Unexpected Next.js deployment configuration.')
tracked=subprocess.check_output(['git','ls-tree','-r','--name-only','-z',commit],cwd=root).decode().split('\0')
for name in tracked:
    if Path(name).name in {'.env','.env.local','.env.production','.env.production.local','.env.development.local'}:
        raise SystemExit('STOP: Runtime environment file is tracked; remove it from the deployment commit.')
PY

FF_UPLOAD="$(mktemp -d /tmp/ff-release-XXXXXXXX)"
FF_APP="$FF_UPLOAD/futurefunded-campaign-os-v1"
# Remove only the temporary directory created by this invocation.
trap 'rm -rf -- "$FF_UPLOAD"' EXIT
mkdir -p "$FF_APP"
git archive "$FF_COMMIT" | tar -x -C "$FF_APP"

printf 'SOURCE COMMIT: %s\nTARGET: %s\n' "$FF_COMMIT" "$FF_MODE"
cd "$FF_UPLOAD"
npx --yes vercel@59.10.0 link \
  --yes --project prj_TLNTE33jMJymvyl6lVR6mJQWeOjP \
  --scope thelab33s-projects

python3 - "$FF_UPLOAD/.vercel/project.json" <<'PY'
import json,sys
if json.load(open(sys.argv[1])).get('projectId')!='prj_TLNTE33jMJymvyl6lVR6mJQWeOjP':
    raise SystemExit('STOP: Vercel linked a different project.')
PY

npx --yes vercel@59.10.0 deploy \
  --yes "${FF_TARGET[@]}" \
  --scope thelab33s-projects \
  --local-config "$FF_APP/vercel.json" \
  --meta "ffCommitSha=$FF_COMMIT" \
  --build-env NEXT_PUBLIC_SITE_URL=https://getfuturefunded.com \
  --env NEXT_PUBLIC_SITE_URL=https://getfuturefunded.com

if [[ "$FF_MODE" == production ]]; then
  printf 'STAGED PRODUCTION: verify the deployment URL, then promote it separately.\n'
fi
