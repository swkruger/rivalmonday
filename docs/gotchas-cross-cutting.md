# Cross-cutting gotchas

Package-specific notes live in each package's `CLAUDE.md` (`apps/*/CLAUDE.md`, `packages/*/CLAUDE.md`).

## Environment
- Windows 11, Git Bash + PowerShell. Node 24.19, pnpm 10.34. No Docker. The local PostgreSQL 17 service is **not used**.
- Neon: Postgres 18.6 (CI/compose 16). The owner role is **not superuser but has BYPASSRLS** (the test harness relies on it). Databases: `cs_dev` (dev), `cs_test` (tests/E2E), `cs_demo` (demo).
- **Repo-root `.env` is gitignored — never print or commit it; ask the owner before adding vars.** Holds: `NEON_OWNER_URL`; `DATABASE_URL` (owner → `cs_dev`), `APP_DATABASE_URL` (`app_user`), `SERVICE_DATABASE_URL` (`app_service`, BYPASSRLS) and the three `TEST_*_DATABASE_URL` equivalents for `cs_test`; `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`; `APP_URL` (`http://localhost:3000`); `LINK_SIGNING_SECRET`, `BETTER_AUTH_SECRET`; `EMAIL_FROM`; `POSTMARK_SERVER_TOKEN` (**test-server** key: never delivered); `EVIDENCE_FS_DIR=./.evidence`; `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`; `REVIEWER_HASH_SALT` (**never change it**).
- Not set: `AI_SHADOW_RATE` (costs money), `LINK_SIGNING_SECRET_PREVIOUS` (rotation), R2 vars (production), `GOOGLE_CLIENT_ID`/`_SECRET`, `DEFAULT_AGENCY_ID`, `WEB_MONITORING_ENABLED` (keep unset until `https://rivalmonday.app/bot` exists). Owner verification only: `PLATFORM_ADMIN_EMAILS` (comma-separated; unlocks `/platform/*`) and `POSTMARK_TEST_SERVER=true`; `POSTMARK_WEBHOOK_SECRET` (7a2, unset = webhook 404). `DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com/v3` switches to the free sandbox.
- **`.env` loading:** each package's `vitest.config.ts`/entry point calls `process.loadEnvFile(<repo-root>/.env)` in try/catch — count directory levels carefully; a wrong depth silently loads nothing.
- **Turborepo strict env mode:** env vars reach tasks only if listed in `turbo.json` `globalPassThroughEnv` (currently `TEST_*`, `DATABASE_URL`, `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`, the DataForSEO/Apify/ScrapeCreators keys, `REVIEWER_HASH_SALT`, `ANTHROPIC_API_KEY`, `PG_BIN`). Add new ones there.
- **Git Bash:** don't `source .env` (values contain `&`); read one value with `grep '^KEY=' .env | cut -d= -f2-`. `timeout` + pnpm exiting 143 on SIGTERM is cosmetic.
- **Windows native crash `3221226505` / `0xC0000409`** (or heap OOM at ~190 MB) from `tsc`/`next build` in `apps/web` means the machine is short of **commit** memory, not a code bug (`FreeVirtualMemory` ≥ ~12 GB is enough); `--max-old-space-size=8192` doesn't help.
- `cs_dev` fixture: `CS Dev Verification Agency` (`aaf5e009-974b-4ce8-b7ec-b722c5c66b1c`) / `CS Dev Verification Client` (`25f99947-4559-4150-ab5d-dd432540aca0`, vertical `hvac_plumbing`, no `place_id`) tracks `aireserv.com` (`e9f9cbd3-8834-43a4-a1af-a31224ca43d3`). Not live-verified: self-business benchmark (needs `place_id`), pricing tracker (needs a real `web` capture).
- **Support Exit checks `Origin` against `APP_URL`**: any other host (`127.0.0.1`, a preview alias) gets 403 and `rm_support` stays until its 60-min expiry or sign-out.
- Mockups: `.superpowers/brainstorm/` (gitignored), keepers in `docs/brand/mockups/`; companion `EACCES` → `BRAINSTORM_PORT=47321`.

## Commands
- `pnpm install` · `pnpm typecheck` · `pnpm test` (turbo, `--concurrency=1`) · `pnpm db:migrate` (applies to `cs_dev`) · `pnpm --filter <pkg> test` · `pnpm --filter @cs/web e2e` · `pnpm dev:web` · `pnpm demo:reset` / `pnpm demo:links` · `db:snapshot` / `db:restore`.

## Git & commits
- Trailer on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagent commits may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- **LF only** (`.gitattributes` `* text=auto eol=lf`). `git ls-files --eol | grep crlf` must print nothing. Python edits on Windows leave `w/crlf` working copies even when the index is LF — re-checkout those files.
- A gitignore entry meant for one root folder needs a leading slash: a bare `App/` matched `apps/web/src/app` case-insensitively on Windows (now `/App/`).
- **Root `.pnpmfile.cjs` ships with every install** (CI, Docker, Vercel; lockfile checksums it): drops drizzle-orm's `@opentelemetry/api` peer so `@sentry/nextjs` doesn't fork drizzle-orm.

## Testing
- **Use the local test cluster, not Neon, for tests:** `bash scripts/local-test-db.sh setup` once (PG18 + pgvector v0.8.1 built with VS 2022 Build Tools, under `D:\rm-pg`, port 5444, superuser like CI), `start` after a reboot (also creates runtime roles `cs_worker`/`cs_web`, needed by migration `0081`; Neon: `docs/DEPLOY.md` § Roles), `env` prints the three `TEST_*` lines. Neon costs ~50 ms per query and ~1.7 s per connection.
- **Timing (local cluster):** full unit suite ~45-60 min, full E2E ~7-9 min. After a rebase `next build` can exceed Playwright's 300 s webServer timeout — use `e2e:affected --full` (builds first, then `E2E_SKIP_BUILD=1`).
- **Run the full suite with `run_in_background`** (exceeds the 10-min cap). **Never run two test runs against the same database** (incl. E2E): they collide (FK/duplicate-key errors, deadlocks). Wait for the completion notice, not turbo's first "Tasks: N successful". Each worktree gets its own `cs_<branch>_test` (name **must end in `_test`**) and E2E port (`E2E_PORT=3101`; default 3100).
- **Global setup resets once:** it wipes + migrates only when the migration files' fingerprint changed (stored in schema `cs_test_meta`); otherwise it empties the tables. Force a rebuild with `TEST_DB_FULL_RESET=1`.
- **`truncateAll` is a DELETE** with `session_replication_role = replica` when the owner is a superuser (local, CI); on Neon it falls back to one `TRUNCATE` statement. Don't reintroduce per-table TRUNCATE loops (slow on Windows).
- **Focused runs:** `pnpm --filter <pkg> exec vitest run <pattern>`. `pnpm --filter <pkg> test -- <pattern>` does *not* narrow. `pnpm test:affected --base <sha>` selects no tests — use the default merge-base.
- **Keep going past failures:** `npx turbo run test --concurrency=1 --continue` (not `pnpm test -- --continue`).
- **Flakes:** only `ETIMEDOUT`/`ECONNRESET`/timeouts (Neon) → re-run that package once; web `page-controls` PinPageSwitch and collectors `renderer` "reports timeouts" flake under load → re-run focused.
- **Subagents:** run focused tests in the foreground (`timeout: 600000`); **never hand back while a test run is still running**. On API timeouts, resume rather than restart.

## Database & migrations
- **Never edit applied migrations**; add new ones. Custom SQL: `pnpm --filter @cs/db generate --custom --name=<x>`, statements separated by `--> statement-breakpoint`. RLS/grant rules: `packages/db/CLAUDE.md`.

## Data & privacy invariants
- **`redactForModel`** (`@cs/collectors`), never a bare `redactContactInfo`, on every text entering a decision state, chat message or embedding input, with the business's own name(s) as `businessNames` where known (adds `compromise` NER person-name and serious-health-condition redaction). A lone `redactContactInfo` at a new model-input site is a privacy regression.
- **`upsell_tag` is agency-only (spec §8.5)** and RLS can't hide a column: every read path over `brief_item`/`recommendation` (`getBrief`, UI, MCP) and every client-facing email, digest, PDF and webhook payload must strip it; agency-facing notices may include it.
- **Events are soft-retracted, never deleted** (`event.retracted_at`/`retraction_reason`): every event reader must filter `retracted_at IS NULL`.
- **Prospects, paused clients and unpaid agencies get no recurring work:** every scheduler/list that picks clients or their tracked competitors filters `clientServiceable(client)` (= `status = 'active' AND paused_at IS NULL`; also takes a raw alias for hand-written SQL) **and** `agencyServiceable(agencyId)` (not read_only/suspended), both in `@cs/db` `filters.ts` (grep `clientServiceable` for the users). The sweep's review-analysis and price branches are deliberately unfiltered (F24). A new one without them leaks prospects or paused clients into paid work.

## Security & lifecycle (7a2)
- **One URL fetch path:** every user- or page-supplied URL goes through the SSRF guard (`@cs/collectors` `net/guard.ts`); never `fetch` one directly. Only a non-public address/URL is `ssrf_blocked`; DNS failures stay ordinary fetch errors.
- **Archived = deleted:** `client`/`agency.archived_at` hides the row everywhere (filters, memberships, guests, outbox, kb-sync; RLS via `app_client_visible()`, 0083). A new reader without it leaks a deleted tenant. Purge (`purge-archived`) keeps ledger/audit rows detached.
- **`notification.status = 'skipped'`** (pending > 7 d overdue) reads like `failed` wherever status is shown or counted.
- **`ObjectStore.put` refuses to overwrite** unless `{ overwrite: true }` (seeds, deterministic keys); capture/evidence keys must be unique per call.

## Conduct & operations
- **Crawler conduct is non-negotiable:** honest UA `RivalMondayBot`, RFC 9309 robots (5xx/unreachable ⇒ disallow), ≥3 s per host, blocked ⇒ record, never evade. No real competitor site is crawled until `WEB_MONITORING_ENABLED='true'`.
- **Worker = one replica** (in-process per-host limits); no `collect-once --poll` while it runs.
- **A fresh per-worktree test DB has no `pgboss` schema** (E2E: `relation "pgboss.job" does not exist`): run `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once (`/rm-kickoff` does).
- **Stacked branches merge once, from the tip:** rebase the base on `main`, then each child with `git rebase --onto <base> <old-base-sha>`; fold every work file on the tip and `merge --ff-only` it. A folder left by `git worktree remove --force` on Windows: `cmd /c rd /s /q "\\?\<abs path>"`, then `git worktree prune`.
- **After merging a branch that adds a workspace package, run `pnpm install` in the main checkout** (else `ERR_MODULE_NOT_FOUND @cs/<pkg>`).
- **Scripted edits must read/write UTF-8 explicitly** (Python on Windows defaults to cp1252 and corrupts `—`/`…`): check a branch with `iconv -f utf-8 -t utf-8` over `git diff --name-only main...HEAD`.

