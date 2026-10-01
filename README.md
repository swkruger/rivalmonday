# Rival Monday (codename: CompetitorSpy)

Evidence-backed competitor intelligence for local-service businesses, delivered by agencies.

Docs: [feasibility study](docs/research/2026-09-29-competitor-intel-feasibility-study.md) ·
[core platform spec](docs/superpowers/specs/2026-09-29-core-platform-design.md) ·
[roadmap](docs/superpowers/plans/2026-09-29-roadmap.md) ·
[brand](docs/brand/brand.md)

## Prerequisites
- Node 24 (>=22), pnpm 10 (`corepack enable`)
- A Postgres database — either a [Neon](https://neon.tech) project (what we use) or Docker

## Database setup

### Option A: Neon (what we use)

1. Create a Neon project and copy its connection string (the owner role) into `NEON_OWNER_URL` in the gitignored root `.env`. The owner/migration role must have `BYPASSRLS` — Neon's default owner role already does.
2. Using `NEON_OWNER_URL` (e.g. via `psql` or Neon's SQL editor), create the app roles and databases:
   ```sql
   CREATE ROLE app_user LOGIN PASSWORD '<strong password>';
   CREATE ROLE app_service LOGIN BYPASSRLS PASSWORD '<strong password>';
   CREATE DATABASE cs_dev;
   CREATE DATABASE cs_test;
   ```
3. Set the rest of `.env` from `.env.example`, pointing each variable at the matching role/database (never commit real values):
   - `DATABASE_URL` — owner role, `cs_dev` (migrations only)
   - `APP_DATABASE_URL` — `app_user`, `cs_dev` (application runtime, RLS enforced)
   - `SERVICE_DATABASE_URL` — `app_service`, `cs_dev` (system jobs, ledger/audit writes)
   - `TEST_DATABASE_URL` — owner role, `cs_test`
   - `TEST_APP_DATABASE_URL` — `app_user`, `cs_test`
   - `TEST_SERVICE_DATABASE_URL` — `app_service`, `cs_test`

Packages that touch the database (`@cs/db` and its consumers) load the root `.env` automatically via `process.loadEnvFile`, so nothing further needs to be sourced into your shell.

### Option B: Docker alternative

```bash
pnpm db:up   # Postgres 16 + pgvector; infra/db/init/01-roles.sql creates app_user, app_service, and cs_test
```
Then point `.env` at `localhost:5432` per `.env.example`. If the database volume existed before `infra/db/init` was added, recreate it: `docker compose down -v && pnpm db:up`.

## Setup

```bash
pnpm install
pnpm db:migrate
pnpm typecheck
pnpm test
```

## Packages
| Package | Purpose |
|---|---|
| `@cs/core` | Access context, permissions, domain constants, ledger contract, tool registry |
| `@cs/db` | Drizzle schema, migrations, RLS, `withTenant`, audit + ledger sinks |
| `@cs/ai` | OpenRouter chat, Jev decisions, LLM decisions, confidence cascade, `Ai` facade (config: `packages/ai/config/ai.yaml`) |
| `@cs/verticals` | Vertical packs (service catalogs, themes, weights, move thresholds, playbooks) |
| `@cs/storage` | Evidence object store (R2 in production, local filesystem in development) |
| `@cs/collectors` | Robots-aware politeness/rate limiting, Playwright rendering, page discovery, change detection and capture recording |
| `@cs/worker` | pg-boss job runner |

The Jev live contract test (`packages/ai/src/decisions/jev.live.test.ts`) only runs when `TYPESAFE_API_KEY` is set; otherwise it's skipped.

## Collection (Phase 2a)

The worker crawls and captures competitor web pages as immutable evidence.

- **One-time setup:** `pnpm --filter @cs/collectors browsers` downloads the Playwright chromium binary used for rendering pages (CI installs it automatically — see below).
- **Evidence store env vars:** set `EVIDENCE_FS_DIR=./.evidence` for a local filesystem store, or the four `R2_*` vars (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) to use Cloudflare R2 in production. See `.env.example`. `.evidence/` is gitignored.
- **Worker jobs:** `web-schedule` runs on a cron (`*/15 * * * *`) and claims up to 200 due tracked pages; `web-capture-page` renders one page, detects blocks/unchanged/errors, and writes evidence; `discover-pages` finds a competitor's trackable pages (sitemap + nav, AI-classified with a URL-keyword fallback).
- **Manual one-off collection:** `pnpm --filter @cs/worker collect-once --domain <domain> [--name "<name>"]` upserts a competitor (service role), runs discovery, captures every tracked page once, and prints a summary table of `url`, `type`, `status`. Do not run `collect-once` against a domain while the worker is running and crawling it — it is a separate process with its own rate limiter, so it would break the per-host spacing.
- **The worker must run as a single replica.** Per-host rate limiting (≥ 3 s between requests to the same host) is held in-process; running two worker replicas would let two requests race past the limiter at once. Scaling out would need a shared (DB- or Redis-backed) limiter instead.
- **The bot information page `https://rivalmonday.com/bot` must exist before crawling real competitors.** Until then, only run `collect-once` against safe, non-competitor domains such as `example.com`.
- **Crawler conduct (spec §4.2, non-negotiable):** User-Agent `Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.com/bot)`, robots token `RivalMondayBot`; honours robots.txt per RFC 9309 (2xx → obey rules; 4xx → allow all; 5xx/unreachable → disallow all); at least 3 s between requests to the same host (or robots `Crawl-delay` if larger, capped at 60 s); no logins, no proxies, no anti-bot evasion; a challenge or 401/403/429 response is recorded as `blocked` and is never retried with different tactics.

## Vendor sources (Phase 2b)

The worker also pulls paid-vendor data (Google Business Profile, Google/Meta ads, Google reviews and job postings) and runs tenant-scoped local-rank scans, all via [DataForSEO](https://dataforseo.com) plus Apify/ScrapeCreators for Meta ads.

- **Enrolling a competitor:** `ensureCompetitorSources` inserts one `competitor_source` row per `SOURCE_KINDS` (`gbp`, `reviews`, `ads_google`, `ads_meta`, `jobs`), due immediately. Set `competitor.placeId`/`cid` (Google Business Profile) and `competitor.metaPageId` (Meta Ad Library) so GBP, reviews and Meta ads collectors have something to query — `collect-once --vendors` does this for you (see below).
- **Cadence:** every source is **weekly**. `vendor-schedule` (cron `*/30 * * * *`) claims due `competitor_source` rows with `FOR UPDATE SKIP LOCKED` (exactly-once across workers) and advances `next_due_at` by 7 days. `gbp`, `ads_google` and `ads_meta` are synchronous — each claimed row is enqueued as a `vendor-collect` job. `reviews` and `jobs` are asynchronous DataForSEO tasks — claimed rows are posted in a batch (`task_post`) and the results are picked up later by `vendor-poll` (cron `*/10 * * * *`, `tasks_ready` → `task_get`, expiring anything not ready after 48h).
- **Rankings:** `rank-schedule` (cron `0 6 1 * *`, monthly) enqueues a `rank-scan` job per client with keywords + a service area; it scans a 7×7 grid of map points × up to 5 keywords (clamped) and stores one tenant-scoped `rank_snapshot` per keyword × grid point. `suggest-competitors` runs the same grid search to populate `competitor_suggestion` candidates for a client (not on a schedule — triggered from the app).
- **No vendor credentials, no claiming:** `vendor-schedule`, `vendor-poll` and `rank-schedule` each check `WorkerDeps.vendorsConfigured()` (`DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` both set) and return immediately (logging once per job) when it's false, so nothing is claimed, polled or fanned out until DataForSEO is configured.
- **A failed batch post doesn't lose a week:** `vendor-schedule` enqueues the synchronous `gbp`/`ads_google`/`ads_meta` collects *before* posting the `reviews`/`jobs` batch; if that `task_post` call throws, the already-claimed batch sources are released back to due-now (`last_status = 'post_failed'`) instead of silently waiting out the 7-day advance `claimDueSources` already applied. Missing competitors and unexpected collector errors are recorded on the source too (`last_status` `'missing'`/`'error'`), and reviews/jobs sources a competitor was ineligible for (no `placeId`/`cid`, or a blank name) are marked `'skipped'` rather than `'posted'`.
- **A missing/short `REVIEWER_HASH_SALT` only skips reviews, not jobs:** `vendor-poll` collects jobs independently of reviews — if the salt isn't usable yet, reviews are skipped (logged once) and job postings still collect normally.
- **Env vars** (see `.env.example`): `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` (required for all vendor jobs); `DATAFORSEO_BASE_URL` (optional — point at `https://sandbox.dataforseo.com/v3` for free mock data in real response shapes); `APIFY_TOKEN` and/or `SCRAPECREATORS_API_KEY` (Meta ads — Apify tried first, ScrapeCreators as fallback); `REVIEWER_HASH_SALT` (required before any review is ever collected — at least 32 random characters, **never change once reviews are stored**, or every reviewer hash changes and dedupe breaks).

### Cost estimates

- **DataForSEO, per competitor per month** ≈ **$0.07–0.09**: GBP profile $0.0054/profile (weekly), reviews $0.00075 per 10 reviews (weekly), Google ads $0.0006–0.002/request (weekly), job postings $0.0006/page (weekly).
- **Geo-grid rank scans, per client per month** ≈ **$0.10–0.49**: a 7×7 grid × up to 5 keywords is at most 245 live searches at $0.002/search, run once a month.
- DataForSEO requires a **$50 minimum deposit** on the account before any of the above runs.
- **Meta ads (Apify `curious_coder~facebook-ads-library-scraper`)** ≈ **$0.75 per 1,000 ads**. Apify's Free plan includes $5/month of platform credit; the Starter plan is $29/month. ScrapeCreators is the fallback vendor when Apify fails or isn't configured.

### Privacy

- **Reviewer identity is never stored.** `upsertReviews`/`collectReadyReviews` compute `reviewerHash` as an HMAC-SHA256 of the reviewer's display name with `REVIEWER_HASH_SALT` (spec §4.5) — the name, profile URL and photo are discarded, not just omitted from the parsed row.
- **The raw vendor evidence is scrubbed too**, not just the parsed `review` row: `scrubReviewerIdentity` strips reviewer identity from the gzipped `vendor_json` capture before it's written, so there is no evidence path that leaks a reviewer's name.
- **E-mail addresses and phone numbers found in review text are redacted** before storage (`redactContactInfo`).
- **US-first scope:** every DataForSEO call uses `location_code: 2840` (United States) / `language_code: 'en'`; Meta Ad Library queries use `country=US`.
- **Honest scope on Meta:** Meta does not disclose ad targeting for US commercial ads, so none is ever stored or inferred.
- **Rank snapshots are tenant-scoped** (not global like other vendor tables) — which keywords a client tracks, and where they rank, is itself sensitive to that client.

### `collect-once --vendors` / `--web` / `--poll`

```bash
# Web-only (Phase 2a, unchanged) — requires https://rivalmonday.com/bot to exist first:
pnpm --filter @cs/worker collect-once --domain example.com --name "Example Co"

# Vendor sources only (safe before the bot page exists — no crawling): enrolls the competitor
# (ensureCompetitorSources), runs gbp/ads_google/ads_meta synchronously, and posts reviews/jobs tasks.
pnpm --filter @cs/worker collect-once --domain example.com --place-id ChIJ... --cid 1234567890 --meta-page-id 987654321 --vendors

# Both web discovery/capture AND vendor sources in one run:
pnpm --filter @cs/worker collect-once --domain example.com --vendors --web

# Poll once for results of previously-posted reviews/jobs tasks (no --domain needed) — this is the
# same work vendor-poll does on its cron; run it manually to see review/job results sooner:
pnpm --filter @cs/worker collect-once --poll
```

`--vendors` without `--web` deliberately skips Phase 2a web discovery/capture so `collect-once --vendors` never crawls a real site. Reviews and job postings never appear immediately — they are posted as DataForSEO tasks and only land in the database once `vendor-poll` (or `collect-once --poll`) picks up the finished task.

## Database roles
- `postgres` / Neon owner (owner) — migrations only. Must have `BYPASSRLS`.
- `app_user` — application runtime; RLS always applies. Use `withTenant(db, ctx, fn)` for every tenant query. The `agency` table is read-only for `app_user` — agency writes go via the service role. `audit_log`, `llm_call`, and `vendor_call` are also read-only for `app_user` (SELECT-only policies) — only `app_service` may insert/update/delete them.
- `app_service` — `BYPASSRLS`; system jobs and ledger/audit writes only.

Every table in the `public` schema must have row-level security enabled and forced; a guard test enforces this.

Note that `app_user` can call `set_config` itself (it is a normal, unprivileged SQL function call, not a superuser-only operation), so RLS — not the inability to set tenant context — is the actual second barrier against cross-tenant access. Every tenant query must go through `withTenant`, which scopes `set_config` to the transaction, but a policy gap (like the one fixed for the ledger tables above) is what would actually let a forged `app.agency_id`/`app.client_scope` value read or write data it shouldn't; there is no lower layer beneath RLS to catch that.

`apps/worker` currently connects with `DATABASE_URL` (the owner role) rather than a dedicated worker role, because pg-boss needs to create and migrate its own schema (`pgboss`) on startup, which requires DDL privileges that a least-privilege runtime role wouldn't have. A dedicated, least-privilege worker role (DDL only against the `pgboss` schema, RLS-scoped like `app_user` against `public`) is planned for Phase 7.
