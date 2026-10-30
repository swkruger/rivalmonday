# Staging runbook

A permanent staging copy of everything: app + MCP at **https://staging.rivalmonday.app**, marketing site at **https://staging.rivalmonday.com**. The data is a copy of `cs_dev`. Local dev keeps using `cs_dev` unchanged, because staging is a separate Neon branch and nothing on staging writes to `cs_dev`. Production setup: [DEPLOY.md](DEPLOY.md). The 7c2 load rehearsal is a different, temporary stack ([DEPLOY.md](DEPLOY.md) § Rehearsal stack), because its seed refuses a database that holds real agencies.

| Part | Production | Staging |
|---|---|---|
| Web + API + MCP | Vercel web project, env *Production*, `rivalmonday.app` | same project, **custom environment `staging`**, `staging.rivalmonday.app` |
| Marketing site | Vercel site project, *Production*, `rivalmonday.com` | same project, custom environment `staging`, `staging.rivalmonday.com` (always noindex) |
| Worker | Railway service `rivalmonday-worker`, env `production` | same service, **Railway environment `staging`** |
| Database | Neon prod project | dev Neon project `frosty-leaf-56905668`: branch **`staging`**, child of the branch `production` (it holds `cs_dev`, despite its name); database `cs_dev` |
| Evidence | R2 bucket (prod) | R2 bucket `rivalmonday-staging` |
| Email | Postmark prod server | Postmark server "Rival Monday staging" |
| Payments | Stripe live | Stripe **test mode**, the same Stripe account as dev (cs_dev holds its test ids) |
| Errors | Sentry, `SENTRY_ENVIRONMENT=production` | same Sentry projects, `SENTRY_ENVIRONMENT=staging` |

**How staging behaves (decided defaults):**
- **Deploys are automatic.** Every push to `main` runs CI `deploy-staging` → `deploy-staging-site`. With staging switched on, production (`deploy`, `deploy-site`) runs only after staging succeeded for the same commit.
- **Data refresh is manual.** Run the `staging-refresh` workflow. It replaces all staging data with a fresh copy of `cs_dev`: § Refresh.
- **No vendor spend, no crawling.** The staging worker runs `VENDOR_FAKE_MODE=fixtures`, so every DataForSEO/Apify/ScrapeCreators/Stadia call is answered from templates at $0, and `cs_dev`'s real weekly pulls are not paid for twice. `WEB_MONITORING_ENABLED` stays unset, so no competitor sites are fetched. New collector data on staging is therefore fixture-shaped; the copied `cs_dev` history is real.
- **AI is live** (OpenRouter + Jev), under the normal cost guards. Give staging its own OpenRouter key with a monthly limit (suggested $10).
- **Email is delivered** (so magic-link sign-in works). Dev's unsent outbox, webhooks and queued jobs are switched off on every refresh.
- **Region note:** this Neon branch is in `us-east-2` and Vercel runs in `iad1`, so pages are a little slower than in prod. Never use staging timings for the latency gates.

## 1. One-time setup (in order)

Generate every new secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never reuse a production secret. The one exception is `REVIEWER_HASH_SALT` (§ 2).

1. **Check who staging could email.** The copy keeps every contact and user in `cs_dev`. Run this against `cs_dev` and make sure every domain is yours or a test domain (`example.com`); change or remove anything else in `cs_dev` first:
   ```sql
   SELECT split_part(email, '@', 2) AS domain, count(*) FROM contact GROUP BY 1
   UNION ALL SELECT split_part(email, '@', 2), count(*) FROM auth."user" GROUP BY 1 ORDER BY 1;
   ```
2. **Neon branch.** Console → project `frosty-leaf-56905668` → *Branches* → *New branch*: name `staging`, parent `production`, *Current point in time*. Compute: autoscaling 0.25–1 CU, scale to zero after 5 min. Note the branch id (`br-…`). From *Connect* (branch `staging`, database `cs_dev`), copy:
   - the **owner** URL (`rivalmonday_test_owner`), **direct** (no `-pooler` in the host) — it goes only into the GitHub secret `MIGRATION_DATABASE_URL`;
   - the host names, direct and pooled, for building the four runtime URLs in § 2 (`postgresql://<role>:<staging password>@<host>/cs_dev?sslmode=require`).
   The roles `app_user`, `app_service`, `cs_worker` and `cs_web` exist on the copy with **dev's passwords**. Generate four new passwords now: the refresh workflow sets them on every run (step 11), so never change them in the Neon console.
3. **Neon API key:** Console → *Account/Organization settings → API keys* → a key for this project (project-scoped if offered) → GitHub secret `NEON_API_KEY`.
4. **R2:** bucket `rivalmonday-staging` (the evidence tool refuses any bucket not ending in `-staging`) + an API token with object read/write on that bucket only.
5. **Postmark:** new server "Rival Monday staging" (live, not a test server, so sign-in mail arrives). Sender `staging@mail.rivalmonday.app` (the `mail.rivalmonday.app` domain needs DKIM + Return-Path verified, as in [DEPLOY.md](DEPLOY.md) step 5–6). While the Postmark account still awaits approval it delivers only to addresses on your verified domains: sign in with one of those. Webhook (Bounce + Spam complaint): `https://postmark:<staging POSTMARK_WEBHOOK_SECRET>@staging.rivalmonday.app/api/postmark/webhook`.
6. **Railway:** in the project that holds `rivalmonday-worker` (create it per [DEPLOY.md](DEPLOY.md) step 3 if it doesn't exist yet), *Settings → Environments → New environment* `staging`. If you duplicate `production`, **replace every variable** with the § 2 values before the first deploy. Service settings as prod (config-as-code `/apps/worker/railway.json`, 1 replica); size 2 GB RAM is enough. Create a **project token for the `staging` environment** → GitHub secret `RAILWAY_TOKEN` (staging environment).
7. **Vercel, web project** (Pro plan: custom environments): *Settings → Environments → Create environment* `staging` (no branch tracking: CI deploys with `--target=staging`). *Domains*: add `staging.rivalmonday.app` and assign it to the `staging` environment. Add the § 2 web variables scoped to `staging`. *Deployment Protection*: the staging domain must answer signed-out (Stripe and Postmark webhooks, the site's waitlist POST); CI's smoke step fails on a 401.
8. **Vercel, site project:** same steps. Environment `staging`, domain `staging.rivalmonday.com`, variables in § 2. Staging builds get `VERCEL_ENV=preview`, so `robots.txt` disallows everything; CI checks this on every deploy.
9. **DNS (Namecheap):** `rivalmonday.app`: CNAME `staging` → the target Vercel shows (usually `cname.vercel-dns.com`). `rivalmonday.com`: CNAME `staging` → same. Add any TXT verification record Vercel asks for.
10. **Third parties:**
   - **Stripe (test mode):** two webhook endpoints, `https://staging.rivalmonday.app/api/stripe/webhook` (account events) and `…/api/stripe/connect-webhook` (*Events on connected accounts*). Subscribe to the same events as the dev listener. Their signing secrets go into the web variables.
   - **Turnstile:** add hostnames `staging.rivalmonday.app` and `staging.rivalmonday.com` to the widget.
   - **Sentry:** no new projects. Limit paging alert rules to `environment:production` so staging noise doesn't page.
   - **Google sign-in (optional):** add the redirect URI `https://staging.rivalmonday.app/api/auth/callback/google`.
11. **GitHub:** *Settings → Environments → New* `staging` (no required reviewers).
   - Secrets: `MIGRATION_DATABASE_URL` (staging owner, direct; CI refuses any other URL), `NEON_API_KEY` (also used by every staging deploy), `STAGING_PW_APP_USER`, `STAGING_PW_APP_SERVICE`, `STAGING_PW_CS_WORKER`, `STAGING_PW_CS_WEB` (the four passwords from step 2), `RAILWAY_TOKEN` (staging token), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_SITE_PROJECT_ID`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_WORKER`, `SENTRY_PROJECT_SITE`.
   - Variables (environment `staging`): `NEON_PROJECT_ID=frosty-leaf-56905668`, `NEON_STAGING_BRANCH_ID=<br-… from step 2>`; optional `STAGING_APP_URL` / `STAGING_SITE_URL` (defaults are the two staging domains).
12. **First refresh** (sets the role passwords, cleans the copy, migrates to `main`, starts the worker): *Actions → staging-refresh → Run workflow* on `main`, type `refresh staging` and tick **first_run** (nothing is deployed yet, so it skips stopping the worker and the web smoke test). Never tick it later.
13. **Evidence:** § Evidence.
14. **Switch on deploys:** repo variable `STAGING_DEPLOY_ENABLED=true`, then *Actions → ci →* the latest `main` run → *Re-run all jobs* (or push to `main`).
15. **Recommended:** add yourself as a required reviewer on the GitHub `production` environment. Production then waits for your click after staging is green, so you can look at staging first.
16. Run the § Checklist.

## 2. Environment variables

Values are staging's own unless noted. DB URLs use the staging branch hosts and the staging role passwords. The role table matches [DEPLOY.md](DEPLOY.md) § Roles: worker `DATABASE_URL` = `cs_worker` direct; web `DATABASE_URL` = `cs_web`; `APP_DATABASE_URL` = `app_user` (web); `SERVICE_DATABASE_URL` = `app_service` direct (both); `SERVICE_DATABASE_POOLED_URL` = `app_service` pooled (worker, required).

- **Both (Railway `staging` + Vercel web `staging`):** `APP_URL=https://staging.rivalmonday.app`, `LINK_SIGNING_SECRET` (new; same value on both), `EMAIL_FROM` (e.g. `Rival Monday Staging <staging@mail.rivalmonday.app>`), `POSTMARK_SERVER_TOKEN` (staging server), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=rivalmonday-staging`, `OPENROUTER_API_KEY` (staging key with a limit), **`REVIEWER_HASH_SALT` = dev's value** (the copied reviews were hashed with it; a different salt splits reviewer identities; never change it later), `SENTRY_DSN`, `SENTRY_ENVIRONMENT=staging`, DB URLs per the table above.
- **Worker only:** `SERVICE_DATABASE_POOLED_URL`, **`VENDOR_FAKE_MODE=fixtures`** (allowed only because `SENTRY_ENVIRONMENT=staging`), no vendor keys (`DATAFORSEO_*`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`, `STADIA_API_KEY` unset: fixtures fill dummies). Optional `WORKER_QUEUE_CONCURRENCY`. Never set `WEB_MONITORING_ENABLED`, `AI_PROVIDER_MODE`, `REHEARSAL_LIVE_CLIENT_IDS` or `CRAWL_HOST_ALLOWLIST` on this staging.
- **Web only:** `APP_DATABASE_URL`, `BETTER_AUTH_SECRET` (new), `POSTMARK_WEBHOOK_SECRET` (new), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ISSUES_URL`, `PLATFORM_ADMIN_EMAILS` (your address), `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`, `STRIPE_SECRET_KEY` (dev's **test** key), `STRIPE_WEBHOOK_SECRET`/`STRIPE_CONNECT_WEBHOOK_SECRET` (staging endpoints), `STRIPE_TAX_ENABLED` as dev, `SITE_ORIGIN=https://staging.rivalmonday.com`, `SUPPORT_REPLY_TO`, optional `GOOGLE_CLIENT_ID`/`_SECRET`. Leave `DATAFORSEO_*` unset (the setup wizard's business lookup then says it is unavailable). Set them only to test client setup; each lookup is a real, cheap vendor call. Never `ASK_FAKE_AI`, `SETUP_FAKE_LOOKUP`, `BILLING_FAKE_GATEWAY`, `PROFILE_TOOLS`.
- **Site (Vercel site `staging`):** `NEXT_PUBLIC_APP_URL=https://staging.rivalmonday.app`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_CLIENT_PRICE_USD`, `NEXT_PUBLIC_COMPARE_PAGES` (may list pages that are still off in prod, to review them), optional `NEXT_PUBLIC_SOCIAL_*`.
- A new env var in code also needs `turbo.json` `globalPassThroughEnv` (as in prod).

## 3. Evidence

`cs_dev` evidence lives on your disk (`EVIDENCE_FS_DIR`, about 12 MB), but the copied rows point at it by key. Copy it into the staging bucket from the repo root. The R2 values go in the shell only, never in `.env`:
```powershell
$env:R2_ACCOUNT_ID='…'; $env:R2_ACCESS_KEY_ID='…'; $env:R2_SECRET_ACCESS_KEY='…'; $env:R2_BUCKET='rivalmonday-staging'
pnpm staging:evidence
Remove-Item Env:R2_*
```
Keys already in the bucket are skipped, never overwritten. Re-run it after every refresh: only new dev files upload.

## 4. Routine

- **Deploy:** automatic on every push to `main` (§ How staging behaves). Order in the `ci` run: `test`/`image`/`site` → `deploy-staging` (predeploy check, migrate, web, worker, smoke `/health`) → `deploy-staging-site` (smoke + noindex check) → `deploy` → `deploy-site`. A red staging job stops production for that commit. Deploys and refreshes share one queue (GitHub concurrency group `staging`): a run waits for the one in progress, and a newer push replaces an older *waiting* deploy. That commit then skips production too, and the newer one carries the change.
- **Refresh** (*Actions → staging-refresh*, type `refresh staging`). It:
  1. checks the branch is named `staging` and the owner URL is its direct endpoint;
  2. stops the staging worker;
  3. resets the branch from its parent;
  4. re-sets the four role passwords;
  5. runs `infra/db/staging/after-refresh.sql`, which deletes sessions and magic links, revokes dev MCP tokens (OAuth tokens, personal access tokens), deactivates dev webhooks, marks dev's unsent outbox and billing notices skipped/sent, and deletes queued pg-boss jobs;
  6. refuses if `cs_dev` has any applied migration that `main`'s journal lacks;
  7. runs the predeploy check and migrates;
  8. redeploys the worker and smoke-tests.

  Everything done on staging since the last refresh is lost (sign-ups, settings, test agencies). Refresh after branch work is merged: if `cs_dev` carries a migration `main` lacks, step 6 fails and the worker stays stopped; merge, then refresh again. If stopping the worker fails (step 2), nothing else runs: fix the Railway token or service and re-run. Afterwards run § Evidence.
- **Sign in:** your `cs_dev` user exists on staging; request a magic link at `https://staging.rivalmonday.app/sign-in`. Platform admin comes from `PLATFORM_ADMIN_EMAILS`.
- **Rollback:** Vercel → web or site project → *Deployments*, filter environment `staging` → *Instant Rollback*; Railway → `staging` → previous deployment → *Redeploy*. Database: forward-only. Fix with a new migration, or refresh.
- **Cost (rough, monthly):** Neon staging compute with scale-to-zero a few $, Railway worker about $5–10, Vercel custom environments included in Pro, R2 and Postmark about $0, AI up to the staging OpenRouter limit. Vendors $0 (fixtures).

## 5. Checklist (first deploy, then after changing infra)
- Both domains serve TLS; `https://staging.rivalmonday.app/health` returns 200 signed-out; `https://staging.rivalmonday.com/robots.txt` shows `Disallow: /`.
- Magic link arrives from the staging sender, and sign-in works; a brief PDF and an evidence screenshot open (R2 sync worked).
- Sentry shows a test event from web and worker under environment `staging`; worker release = commit SHA.
- Railway `staging` deployment is **Active**; `/healthz` body shows `queueGrants: ok`; `/platform/health` is green after an hour.
- The site's waitlist form posts to staging (Turnstile passes on `staging.rivalmonday.com`).
- `SELECT count(*) FROM agency_webhook WHERE active` returns 0 on staging, unless you added a staging webhook yourself.

## 6. Troubleshooting
- **`deploy-staging` fails at "Check the target":** `MIGRATION_DATABASE_URL` in the `staging` environment is not the staging branch's direct owner URL (or `NEON_*` are wrong). This guard stops CI migrating any other database from the staging job.
- **Smoke step 401:** Vercel Deployment Protection covers the staging domain (§ 1 step 7).
- **`permission denied to alter role`:** the owner must hold ADMIN on the four roles (true on `cs_dev` today: `rivalmonday_test_owner` created them). Recreate the role as the owner or `GRANT <role> TO rivalmonday_test_owner WITH ADMIN OPTION` on `cs_dev`.
- **Reset refused:** Neon cannot reset a branch that has children (delete them), and blocks resets for up to 24 h after the parent was restored from a snapshot.
- **Worker exits `refusing rehearsal settings`:** `SENTRY_ENVIRONMENT` must be exactly `staging` on the Railway `staging` environment.
- **Evidence 404 on old briefs:** run § Evidence; a key missing from your local folder is missing in dev too.

## 7. Teardown
Set `STAGING_DEPLOY_ENABLED` to anything but `true` (production then deploys without waiting). Delete the Neon `staging` branch, the Railway `staging` environment, both Vercel `staging` environments and their domains, the two `staging` CNAMEs, the R2 bucket and token, the Postmark staging server, the Stripe test webhook endpoints, the staging OpenRouter key, and the GitHub `staging` environment.
