#!/usr/bin/env bash
# Deploys the worker to Railway from this checkout and waits until the new deployment is live (docs/STAGING.md § 4,
# docs/DEPLOY.md). Usage: bash scripts/railway-deploy-worker.sh <service>
# Project and environment come from RAILWAY_TOKEN (a project token: CI) or the folder's `railway link` (owner).
# `railway up --ci` returns when the build ends, not when the deployment is live, so this polls the deployment list for
# the deployment the upload created. Railway only marks it SUCCESS once /healthz answers (queueGrants ok).
# JSON is read with node (no jq on the owner's Windows machine).
set -euo pipefail

service="${1:?usage: railway-deploy-worker.sh <service>}"
railway() { npx --yes @railway/cli@5.63.1 "$@"; }
sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
list() { railway deployment list --service "$service" --limit 20 --json; }

before=$(list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).map(d=>d.id).join(",")))')

# `railway up` skips git-ignored files, so the Sentry release goes in as a variable, not as apps/worker/.release.
railway variable set "SENTRY_RELEASE=$sha" --service "$service" --skip-deploys >/dev/null
railway up --ci --service "$service"

status=""
for _ in $(seq 1 60); do
  # "<id> <status>" of the newest deployment that wasn't there before the upload, or nothing yet.
  read -r id status < <(list | BEFORE="$before" node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      const old=new Set(process.env.BEFORE.split(",")); const d=JSON.parse(s).find(x=>!old.has(x.id));
      console.log(d ? `${d.id} ${d.status}` : "");
    })') || true
  case "${status:-}" in
    SUCCESS) echo "worker $service live: deployment $id ($sha)"; exit 0 ;;
    FAILED|CRASHED|REMOVED|SKIPPED)
      echo "::error::Railway deployment $id ended $status. Read its Deploy Logs (docs/STAGING.md § 7)."
      exit 1 ;;
  esac
  sleep 10
done
echo "::error::Railway deployment for $sha is not live after 10 minutes (last status: ${status:-not found})."
exit 1
