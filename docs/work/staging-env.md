# staging-env — permanent staging (staging.rivalmonday.app / .com) from a cs_dev copy

**Kind:** implementation (ops)   **Worktree:** ../CompetitorSpy-wt/staging-env   **Base:** main @ 6717c03b
**Runbook:** [docs/STAGING.md](../STAGING.md). Owner skipped brainstorming ("go ahead"); the defaults below are agent calls, listed for review.

## Status (overwrite)
Code + docs done, not yet committed or merged: CI `deploy-staging` / `deploy-staging-site` (gate `STAGING_DEPLOY_ENABLED`; prod waits for them when on), `staging-refresh.yml` (manual reset of the Neon `staging` branch from cs_dev), `infra/db/staging/after-refresh.sql`, `pnpm staging:evidence` (dev evidence dir → `*-staging` R2 bucket; 6 unit tests), `scripts/staging-target-check.sh` (both staging jobs refuse any DB but the staging branch). Independent review: 0 critical; 3 important + 5 minor all fixed. Nothing is provisioned yet; workflows not yet exercised on GitHub.

## Next (overwrite)
Owner: review, then `/rm-merge staging-env`; then STAGING.md § 1 setup (Neon branch, R2, Postmark, Railway env, Vercel custom envs x2, DNS, Stripe/Turnstile, GitHub `staging` env) and the first `staging-refresh` run.

## Agent calls (owner may overturn)
1. DB = Neon branch `staging` in the dev project (child of the branch holding cs_dev), not a separate project: instant copy, refresh = reset from parent. Cost: us-east-2 vs Vercel iad1 latency.
2. Vercel **custom environments** (Pro) in the existing web/site projects; Railway **environment** `staging` on the same service.
3. Staging worker: `VENDOR_FAKE_MODE=fixtures` (no vendor spend, no duplicate pulls), AI live with its own capped OpenRouter key, `WEB_MONITORING_ENABLED` unset.
4. Email delivered via a separate Postmark server; refresh neutralises dev outbox/webhooks/jobs/sessions.
5. `REVIEWER_HASH_SALT` on staging = dev's (copied hashes).
6. SQL roles carry dev's passwords after a reset, so the refresh re-applies staging passwords from GitHub secrets (`STAGING_PW_*`).
7. Refresh is manual (data on staging is lost on refresh); deploys automatic on every main push.

## Interfaces this branch adds or changes
- Env/vars: repo var `STAGING_DEPLOY_ENABLED`; GitHub env `staging` (secrets `MIGRATION_DATABASE_URL`, `NEON_API_KEY`, `STAGING_PW_APP_USER|APP_SERVICE|CS_WORKER|CS_WEB`, `RAILWAY_TOKEN` + the Vercel/Sentry ones; vars `NEON_PROJECT_ID`, `NEON_STAGING_BRANCH_ID`, optional `STAGING_APP_URL`/`STAGING_SITE_URL`). No app env var added.
- CI: prod `deploy`/`deploy-site` now `needs` the staging jobs (`!cancelled()` + explicit result checks).
- DEPLOY.md "§ Staging" renamed "§ Rehearsal stack" (OPS link updated). **At merge:** STATE.md line 33 and BACKLOG lines 247/275 still say "DEPLOY.md § Staging": point them at § Rehearsal stack; add STAGING.md to ARCHITECTURE/STATE ops links.

## Assumes from other branches
None.
