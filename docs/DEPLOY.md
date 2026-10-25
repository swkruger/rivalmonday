# Deploy runbook (production)

`rivalmonday.app`: web on **Vercel** (`iad1`), worker on **Railway** (one container), Postgres on **Neon** (PG18, `us-east-1`), evidence in **R2**, mail via **Postmark**, errors in **Sentry**.

**Pipeline** (`.github/workflows/ci.yml`): a push to `main` runs `test` + `image` (worker image build + offline `smoke:image`), then `deploy` (environment `production`, one at a time, never cancelled): `predeploy-check` → `migrate` (owner URL) → `vercel pull/build/deploy --prebuilt --prod` (uploads web source maps) → `railway up` (worker, release = commit SHA) → Sentry worker release. A failed step stops every later one. Vercel and Railway auto-deploys stay **off**: this job is the only deploy path.

## 1. First-time setup (in order)
1. **Neon:** prod project (PG18, `us-east-1`) and its database (migration `0014` creates the `vector` extension as the owner). Create the roles — § Roles.
2. **R2:** bucket + an API token limited to object read/write on it.
3. **Railway:** service `rivalmonday-worker`, source = CLI upload (no repo link), root directory unset, config-as-code path `/apps/worker/railway.json` (Dockerfile build, `/healthz` 300 s, 1 replica, restart on failure, 40 s drain). Env — § Env. Project token → `RAILWAY_TOKEN`.
4. **Vercel:** project root `apps/web`, function region `iad1`, **Fluid compute on** (default `maxDuration` 300 s for server actions such as `vertical_draft`/`runbook_retailor`; the Ask route sets 300 s), Git auto-deploy off, env — § Env, domain `rivalmonday.app`. Token + org/project ids → secrets.
5. **Namecheap DNS:** Vercel A/CNAME; Postmark DKIM + Return-Path for `mail.rivalmonday.app`; SPF; DMARC `p=none`, then `p=quarantine` after 2 clean weeks.
6. **Postmark:** account approval, live server token, sender `briefs@mail.rivalmonday.app`. Webhook (Bounce + Spam complaint, on the server): `https://postmark:<POSTMARK_WEBHOOK_SECRET>@rivalmonday.app/api/postmark/webhook` (basic auth; unset secret = 404; after auth it always answers 200).
7. **Sentry:** projects for web and worker, alert rules (new issue, regression, cron check-in missed); an org auth token with release + source-map scope.
8. **GitHub** environment `production` with the secrets below.
9. **First deploy:** repo variable `DEPLOY_ENABLED=true` (else skipped), push to `main`, watch `test` → `image` → `deploy`.
10. **Bootstrap** (owner, from a shell with the prod env loaded, never committed): `pnpm --filter @cs/worker platform-admin add <email> --role owner` (uses `SERVICE_DATABASE_URL`); `pnpm --filter @cs/web admin create-agency --name <name>` then `admin invite --agency <id> --email <email> --role agency_admin`; then `pnpm kb:seed` against prod (prod `SERVICE_DATABASE_URL`) — re-run it whenever `docs/help` changes; embeddings fill on the hourly `kb-embed` sweep.
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
| `SERVICE_DATABASE_URL` | `app_service`, direct | `app_service` |
| `SERVICE_DATABASE_POOLED_URL` | `app_service`, **pooled** (Neon `-pooler` host; **worker: required in production**) | — |

The owner URL lives **only** in the GitHub secret `MIGRATION_DATABASE_URL` (direct URL), never on a running service.

## Env
- **Both:** `APP_URL=https://rivalmonday.app`, `LINK_SIGNING_SECRET` (same value on both), `EMAIL_FROM`, `POSTMARK_SERVER_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `REVIEWER_HASH_SALT` (generate once, never change), `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SERVICE_DATABASE_URL` and `DATABASE_URL` per the table above.
- **Worker pools (7c2):** with several pollers per queue the worker's own app queries (`SERVICE_DATABASE_POOLED_URL`, pooled `app_service`) go through the Neon pooler with prepared statements off; pg-boss and migrations stay on the direct `DATABASE_URL`. Required in production (the worker exits 1 without it, `REQUIRED_PROD_ENV`); unset (dev) = the direct URL is used (start-up warning), the pool still sized from the concurrency table. Optional `WORKER_QUEUE_CONCURRENCY` (`<queue>=<1-8>,…`; OPS § Queue concurrency); unset = shipped defaults.
- **Never set the rehearsal switches in production:** `AI_PROVIDER_MODE`, `REHEARSAL_LIVE_CLIENT_IDS`, `VENDOR_FAKE_MODE`, `CRAWL_HOST_ALLOWLIST`. The worker refuses to start with any of them unless `SENTRY_ENVIRONMENT=staging` or `NODE_ENV` is set and not `production` (fail closed: an unset `NODE_ENV` counts as refused, also in `createWorkerDeps` for the CLIs).
- **Worker:** the vendor keys (`DATAFORSEO_*`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`, `STADIA_API_KEY`), `POSTMARK_MESSAGE_STREAM`/`POSTMARK_BROADCAST_STREAM` if not default. It refuses to start in production without `REQUIRED_PROD_ENV` (`apps/worker/src/env.ts`). `NODE_ENV`/`PORT` come from the image.
- **Web:** `APP_DATABASE_URL`, `BETTER_AUTH_SECRET`, `POSTMARK_WEBHOOK_SECRET`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ISSUES_URL`, `PLATFORM_ADMIN_EMAILS`, `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_CONNECT_WEBHOOK_SECRET`, optional `GOOGLE_CLIENT_ID`/`_SECRET`, `SUPPORT_REPLY_TO`. Never set `ASK_FAKE_AI`, `SETUP_FAKE_LOOKUP`, `BILLING_FAKE_GATEWAY` (refused in production).
- **`WEB_MONITORING_ENABLED`:** leave unset until `https://rivalmonday.app/bot` and `/robots.txt` are live and checked signed-out; then set `true` on Railway (and Vercel) — the last step of go-live.
- New env vars also go in `turbo.json` `globalPassThroughEnv`, or builds under turbo never see them.

## Checklist (after each first-of-its-kind deploy)
- TLS on `rivalmonday.app`; magic-link sign-in arrives from `briefs@mail.rivalmonday.app`; mail-tester ≥ 9/10.
- Sentry test event from web and worker (worker release = commit SHA, not `dev`).
- Railway marks the new deployment **Active** (`railway up --ci` may only wait for the build); `/healthz` 200 and its body shows `queueGrants: ok` (the `cs_web` enqueue grants; `failed` makes it 503 and web enqueues are refused); `/platform/health` all green after one hour.
- `/bot` and `/robots.txt` load signed-out.
- Latency: `pnpm --filter @cs/web profile:pages --base https://rivalmonday.app --cookie FILE` (a signed-in storage state or Cookie header): agency/workspace pages p75 ≤ 1.5 s, every page ≤ 3 s; misses → backlog. Per-tool timings: `PROFILE_TOOLS=1` is **local-only** — never set it on Vercel. The shell's sequential DB stages are a backlog gate, so this p75 is a measurement only.

## Notes
- **0025 pre-check:** runs every deploy; on the fresh prod DB it passes trivially. If it fails it prints `client` ids — fix those rows, re-run the job.
- **Worker Sentry release reads `dev`:** fallback is `railway variables --set SENTRY_RELEASE=<sha> --skip-deploys` before `railway up`.
- **Health checks gate deploys only:** Railway's `/healthz` decides whether a new deployment goes live. A job loop that dies after go-live is caught by the Sentry `system-heartbeat` cron monitor (missed check-in alert), not by a restart.
- **One worker replica only** (in-process per-host crawl limits). Never raise `numReplicas`.

## Staging
For the 7c2 rehearsal (120 clients, one week; run it with `docs/OPS.md` § Rehearsal). Nothing here touches production data or real competitor sites; vendor APIs are answered by fixtures, so the only paid calls are the live-AI slice (≤ $5). Use fresh secrets; never reuse production tokens.
1. **Neon:** in the prod project, create a **schema-only** branch `staging` from the production branch; compute = the planned prod size. Roles (`app_user`, `app_service`, `cs_worker`, `cs_web`) are inherited; reset their passwords on the branch. Migrate with the branch's owner URL: `DATABASE_URL=<staging owner URL> pnpm --filter @cs/db migrate`.
2. **R2:** bucket `rivalmonday-staging` + a token limited to it.
3. **Postmark:** use a **test-server** token (accepted, never delivered).
4. **Vercel:** Preview environment env = § Env with staging values: staging DB URLs, `APP_URL` = the preview URL, `R2_BUCKET=rivalmonday-staging`, the Postmark test token, `SENTRY_ENVIRONMENT=staging`. Scope these Preview vars to a dedicated git branch (e.g. `staging`) so other PR previews never point at the staging DB. Don't set `DATAFORSEO_*` there (the setup-wizard lookup is unavailable on staging).
5. **Railway:** project `rivalmonday-staging`, two services from the worker image (CLI upload: `railway up --service <name>` from the repo root; config-as-code `/apps/worker/railway.json`):
   - **worker:** 1 replica, size = planned prod. Env = § Env (staging values) plus `SENTRY_ENVIRONMENT=staging`, `SERVICE_DATABASE_POOLED_URL` (pooled `app_service`), and the rehearsal switches `VENDOR_FAKE_MODE=fixtures`, `AI_PROVIDER_MODE=rehearsal`, `REHEARSAL_LIVE_CLIENT_IDS` (after the seed), `CRAWL_HOST_ALLOWLIST=fx1.rehearsal.rivalmonday.app,…,fx5.rehearsal.rivalmonday.app`, `WEB_MONITORING_ENABLED=true`. Vendor keys may be dummies (`fixture`) or left unset: fixtures answer every vendor call at $0 (and in this mode the platform cost snapshot ignores them). `AI_PROVIDER_MODE=rehearsal` always needs a real `OPENROUTER_API_KEY`: the live Ai is always built alongside the rehearsal one (at first AI use), even with `REHEARSAL_LIVE_CLIENT_IDS` empty.
   - **fixture-hosts:** start command `node --import tsx src/cli/fixture-hosts.ts`; env `SENTRY_ENVIRONMENT=staging` (the image sets `NODE_ENV=production`, so without it the service exits), `FIXTURE_HOSTS` = the five hosts, `FIXTURE_LOG_TOKEN` (random, for the rehearsal report). Add the custom domains `fx1…fx5.rehearsal.rivalmonday.app`.
6. **Namecheap DNS:** one CNAME per fixture host (`fx1.rehearsal` … `fx5.rehearsal`) to the target Railway shows, plus any verification record it asks for. Check `https://fx5.rehearsal.rivalmonday.app/robots.txt` shows `Crawl-delay: 30`.
7. **Cost:** about $20 for the rehearsal week (Neon staging compute, the two Railway services; R2 and Postmark test ≈ $0), plus ≤ $5 live AI for the 10-client slice.
8. **Order matters:** deploy and migrate staging first, then seed (OPS § Rehearsal), then set `REHEARSAL_LIVE_CLIENT_IDS` and redeploy the staging worker once; do not redeploy it again mid-week. Seed, fault and approve must use the same `SERVICE_DATABASE_URL` host form. The worker never crawls hosts outside `CRAWL_HOST_ALLOWLIST` on staging (empty allowlist with `WEB_MONITORING_ENABLED=true` refuses to start).
9. **Teardown:** after the report, delete the Railway project, the Neon `staging` branch, the R2 bucket and token, the five CNAMEs and the Vercel Preview staging env values.

## Archive and purge
Offboarding a tenant (commands: `docs/OPS.md` § Archive and purge): cancel its Stripe subscription, `archive <agency|client> <id>` (undoable), after the grace period `purge-archived --older-than 90d --dry-run`, then without `--dry-run`. Run with the prod `SERVICE_DATABASE_URL`; purge is irreversible.

## Rollback
- **Web:** Vercel → Deployments → previous production deployment → *Instant Rollback* (or `vercel rollback`). The next push to `main` deploys again.
- **Worker:** Railway → service → Deployments → previous deployment → *Redeploy*.
- **Both at once:** GitHub → Actions → the last good `ci` run → *Re-run all jobs* (it re-deploys that commit; `migrate` is a no-op).
- **Database:** migrations are forward-only — fix with a new migration. For data loss use Neon point-in-time restore to a new branch, verify, then switch the URLs. Code rolled back must still work on the migrated schema; keep migrations additive.
- **Stop deploys:** require a reviewer on `production`, or disable the workflow.
