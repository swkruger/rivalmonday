#!/usr/bin/env bash
# docs/STAGING.md: refuses unless DATABASE_URL is the direct (non-pooled) endpoint of the Neon branch named `staging`,
# and that branch has a parent. Used by ci.yml `deploy-staging` and staging-refresh.yml before anything touches the DB.
# Needs NEON_API (…/api/v2/projects/<id>), NEON_API_KEY, STAGING_BRANCH_ID, DATABASE_URL.
# Appends PARENT_BRANCH_ID=<id> to $GITHUB_ENV when it is set.
set -euo pipefail
for v in NEON_API NEON_API_KEY STAGING_BRANCH_ID DATABASE_URL; do
  [ -n "${!v:-}" ] || { echo "::error::$v is not set (staging environment secrets/variables)"; exit 1; }
done
api() { curl -fsS -H "Authorization: Bearer $NEON_API_KEY" -H 'Accept: application/json' "$@"; }
branch=$(api "$NEON_API/branches/$STAGING_BRANCH_ID")
name=$(jq -r .branch.name <<<"$branch")
parent=$(jq -r '.branch.parent_id // empty' <<<"$branch")
[ "$name" = staging ] || { echo "::error::branch $STAGING_BRANCH_ID is named '$name', not 'staging'"; exit 1; }
[ -n "$parent" ] || { echo "::error::the staging branch has no parent to reset from"; exit 1; }
host=$(api "$NEON_API/branches/$STAGING_BRANCH_ID/endpoints" | jq -r '[.endpoints[] | select(.type == "read_write")][0].host // empty')
[ -n "$host" ] || { echo "::error::the staging branch has no read-write compute"; exit 1; }
case "$DATABASE_URL" in
  *"@$host/"*|*"@$host:"*) ;;
  *) echo "::error::MIGRATION_DATABASE_URL is not the staging branch's direct (non-pooled) URL"; exit 1 ;;
esac
if [ -n "${GITHUB_ENV:-}" ]; then echo "PARENT_BRANCH_ID=$parent" >> "$GITHUB_ENV"; fi
echo "staging target ok"
