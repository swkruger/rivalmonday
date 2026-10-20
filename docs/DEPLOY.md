# Deploy runbook (production)

`rivalmonday.app`: web on **Vercel** (`iad1`), worker on **Railway** (one container), Postgres on **Neon** (PG18, `us-east-1`), evidence in **R2**, mail via **Postmark**, errors in **Sentry**. Names only here — never paste a secret into this file.

**Pipeline** (`.github/workflows/ci.yml`): a push to `main` runs `test` + `image` (worker image build + offline `smoke:image`), then `deploy` (environment `production`, one at a time, never cancelled): `predeploy-check` → `migrate` (owner URL) → `vercel pull/build/deploy --prebuilt --prod` (uploads web source maps) → `railway up` (worker, release = commit SHA) → Sentry worker release. A failed step stops every later one. Vercel and Railway auto-deploys stay **off**: this job is the only deploy path.

## 1. First-time setup (in order)
1. **Neon:** prod project (PG18, `us-east-1`) and its database (migration `0014` creates the `vector` extension as the owner). Create the roles — § Roles.
2. **R2:** bucket + an API token limited to object read/write on it.
3. **Railway:** service `rivalmonday-worker`, source = CLI upload (no repo link), root directory unset, config-as-code path `/apps/worker/railway.json` (Dockerfile build, `/healthz` 300 s, 1 replica, restart on failure, 40 s drain). Env — § Env. Project token → `RAILWAY_TOKEN`.
4. **Vercel:** project root `apps/web`, function region `iad1`, Git auto-deploy off, env — § Env, domain `rivalmonday.app`. Token + org/project ids → secrets.
5. **Namecheap DNS:** Vercel A/CNAME; Postmark DKIM + Return-Path for `mail.rivalmonday.app`; SPF; DMARC `p=none`, then `p=quarantine` after 2 clean weeks.
6. **Postmark:** account approval, live server token, sender `briefs@mail.rivalmonday.app`.
7. **Sentry:** projects for web and worker, alert rules (new issue, regression, cron check-in missed); an org auth token with release + source-map scope.
8. **GitHub** environment `production` (required reviewer optional) with the secrets below.
9. **First deploy:** push to `main`, watch `test` → `image` → `deploy`.
10. **Bootstrap** (owner, from a shell with the prod env loaded, never committed): `pnpm --filter @cs/worker platform-admin add <email> --role owner` (uses `SERVICE_DATABASE_URL`); `pnpm --filter @cs/web admin create-agency --name <name>` then `admin invite --agency <id> --email <email> --role agency_admin`; then `pnpm kb:seed` against prod (prod `SERVICE_DATABASE_URL`) — re-run it whenever `docs/help` changes.
11. Run the § Checklist.

**GitHub secrets (`production`):** `MIGRATION_DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `RAILWAY_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_WORKER`.

## Roles
Run as the **Neon owner role** in the SQL editor — not the console's "add role": the creator gets ADMIN on the role, which migration `0081_runtime_roles` needs (it runs `GRANT cs_worker TO CURRENT_USER`, then gives `cs_worker` the `pgboss` schema and `CREATE` on the database, and `cs_web` enqueue/read on `pgboss` only). Generate each password with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
```sql
CREATE ROLE app_user LOGIN PASSWORD '…';
CREATE ROLE app_service LOGIN PASSWORD '…' BYPASSRLS;
CREATE ROLE cs_worker LOGIN PASSWORD '…';
CREATE ROLE cs_web LOGIN PASSWORD '…';
```
Run this before the first deploy (`0081` aborts while `cs_worker`/`cs_web` are missing). Then point each service at its own role:

| Variable | Railway (worker) | Vercel (web) |
|---|---|---|
| `DATABASE_URL` | `cs_worker`, **direct** (non-pooled) URL | `cs_web` |
| `APP_DATABASE_URL` | — (not read) | `app_user` |
| `SERVICE_DATABASE_URL` | `app_service` | `app_service` |

The owner URL lives **only** in the GitHub secret `MIGRATION_DATABASE_URL` (direct URL), never on a running service.

## Env
- **Both:** `APP_URL=https://rivalmonday.app`, `LINK_SIGNING_SECRET` (same value on both), `EMAIL_FROM`, `POSTMARK_SERVER_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `REVIEWER_HASH_SALT` (generate once, never change), `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SERVICE_DATABASE_URL` and `DATABASE_URL` per the table above.
- **Worker:** the vendor keys (`DATAFORSEO_*`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`, `STADIA_API_KEY`), `POSTMARK_MESSAGE_STREAM`/`POSTMARK_BROADCAST_STREAM` if not default. It refuses to start in production without `REQUIRED_PROD_ENV` (`apps/worker/src/env.ts`). `NODE_ENV`/`PORT` come from the image.
- **Web:** `APP_DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ISSUES_URL`, `PLATFORM_ADMIN_EMAILS`, `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_CONNECT_WEBHOOK_SECRET`, optional `GOOGLE_CLIENT_ID`/`_SECRET`, `SUPPORT_REPLY_TO`. Never set `ASK_FAKE_AI`, `SETUP_FAKE_LOOKUP`, `BILLING_FAKE_GATEWAY` (refused in production).
- **`WEB_MONITORING_ENABLED`:** leave unset until `https://rivalmonday.app/bot` and `/robots.txt` are live and checked signed-out; then set `true` on Railway (and Vercel) — the last step of go-live.
- New env vars also go in `turbo.json` `globalPassThroughEnv`, or builds under turbo never see them.

## Checklist (after each first-of-its-kind deploy)
- TLS on `rivalmonday.app`; magic-link sign-in arrives from `briefs@mail.rivalmonday.app`; mail-tester ≥ 9/10.
- Sentry test event from web and worker (worker release = commit SHA, not `dev`).
- Railway marks the new deployment **Active** (`railway up --ci` may only wait for the build); `/healthz` 200; `/platform/health` all green after one hour.
- `/bot` and `/robots.txt` load signed-out.
- Latency: `pnpm --filter @cs/web profile:pages --base https://rivalmonday.app --cookie FILE` (a signed-in storage state or Cookie header): agency/workspace pages p75 ≤ 1.5 s, every page ≤ 3 s; misses → backlog. Per-tool timings need `PROFILE_TOOLS=1` on the server. The shell's sequential DB stages are a known backlog item, so this p75 is a measurement, not proof of spec D7 (backlog gate before the first deploy).

## Notes
- **0025 pre-check:** runs every deploy; on the fresh prod DB it passes trivially. If it fails it prints `client` ids — fix those rows, re-run the job.
- **Magic-link cutover (spec D3):** prod starts fresh, so nothing to do. If a database from before hashed magic-link tokens (5b-2) is ever promoted, links issued before that deploy fail as "expired or already used" for their 15-minute window — expected, not a bug.
- **Worker Sentry release reads `dev`:** fallback is `railway variables --set SENTRY_RELEASE=<sha> --skip-deploys` before `railway up`.
- **One worker replica only** (in-process per-host crawl limits). Railway briefly runs old and new containers together until the new one passes `/healthz`; never raise `numReplicas`.

## Rollback
- **Web:** Vercel → Deployments → previous production deployment → *Instant Rollback* (or `vercel rollback`). The next push to `main` deploys again.
- **Worker:** Railway → service → Deployments → previous deployment → *Redeploy*.
- **Both at once:** GitHub → Actions → the last good `ci` run → *Re-run all jobs* (it re-deploys that commit; `migrate` is a no-op).
- **Database:** migrations are forward-only — fix with a new migration. For data loss use Neon point-in-time restore to a new branch, verify, then switch the URLs. Code rolled back must still work on the migrated schema; keep migrations additive.
- **Stop deploys:** require a reviewer on the `production` environment, or disable the workflow.
