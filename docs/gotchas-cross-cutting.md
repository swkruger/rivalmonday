# Cross-cutting gotchas

Package-specific notes live in each package's `CLAUDE.md` (`apps/*/CLAUDE.md`, `packages/*/CLAUDE.md`).

## Environment
- Windows 11, Git Bash + PowerShell. Node 24.19, pnpm 10.34. No Docker (use Neon). The local PostgreSQL 17 service is **not used**.
- Neon: Postgres 18.6 (CI/compose run 16 — carry-over to align). The owner role is **not superuser but has BYPASSRLS** (the test harness relies on it). Databases: `cs_dev` (dev), `cs_test` (tests/E2E), `cs_demo` (demo).
- **Repo-root `.env` is gitignored — never print or commit it; ask the owner before adding vars.** Holds: `NEON_OWNER_URL`; `DATABASE_URL` (owner → `cs_dev`), `APP_DATABASE_URL` (`app_user`), `SERVICE_DATABASE_URL` (`app_service`, BYPASSRLS) and the three `TEST_*_DATABASE_URL` equivalents for `cs_test`; `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`; `APP_URL` (`http://localhost:3000`; `https://rm.nofingers.ai` when deployed); `LINK_SIGNING_SECRET`, `BETTER_AUTH_SECRET`; `EMAIL_FROM` (`swkruger@nofingers.ai`); `POSTMARK_SERVER_TOKEN` (a **test-server** key: accepted, never delivered); `EVIDENCE_FS_DIR=./.evidence`; `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`; `REVIEWER_HASH_SALT` (**never change it**).
- Not set: `AI_SHADOW_RATE` (costs money), `LINK_SIGNING_SECRET_PREVIOUS` (rotation), R2 vars (production), `GOOGLE_CLIENT_ID`/`_SECRET`, `DEFAULT_AGENCY_ID`, `WEB_MONITORING_ENABLED` (keep unset until `https://rivalmonday.com/bot` exists). Needed for owner verification only: `PLATFORM_ADMIN_EMAILS` (comma-separated, case-insensitive; unlocks `/platform/reviews`, `/platform/themes`) and `POSTMARK_TEST_SERVER=true`. `DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com/v3` switches to the free sandbox.
- Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` (43 chars).
- **`.env` loading:** each package's `vitest.config.ts`/entry point calls `process.loadEnvFile(<repo-root>/.env)` in try/catch — count directory levels carefully; a wrong depth silently loads nothing.
- **Turborepo strict env mode:** env vars reach tasks only if listed in `turbo.json` `globalPassThroughEnv` (currently `TEST_*`, `DATABASE_URL`, `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`, the DataForSEO/Apify/ScrapeCreators keys, `REVIEWER_HASH_SALT`, `ANTHROPIC_API_KEY`, `PG_BIN`). Add new ones there.
- **Git Bash:** don't `source .env` (values contain `&`); read one value with `grep '^KEY=' .env | cut -d= -f2-`. `timeout` + pnpm exiting 143 on SIGTERM is cosmetic.
- **Windows native crash `3221226505` / `0xC0000409`** (or "JavaScript heap out of memory" at ~190 MB) from `tsc -p .` in `apps/web` or `next build` means the machine is short of **commit** memory, not a code bug. Check `Get-CimInstance Win32_OperatingSystem` (`FreeVirtualMemory`); ~12 GB free is enough. `NODE_OPTIONS=--max-old-space-size=8192` helps `tsc` but not a commit shortage.
- `cs_dev` fixture: `CS Dev Verification Agency` (`aaf5e009-974b-4ce8-b7ec-b722c5c66b1c`) / `CS Dev Verification Client` (`25f99947-4559-4150-ab5d-dd432540aca0`, vertical `hvac_plumbing`, no `place_id`) tracks `aireserv.com` (`e9f9cbd3-8834-43a4-a1af-a31224ca43d3`). Not yet live-verified: the self-business benchmark (needs a `place_id`) and `price_point`/pricing tracker (needs a real `web` capture — banned until the bot page exists).
- **Support Exit checks `Origin` against `APP_URL`** (`app/support/exit/route.ts`, Phase 8b): browsing via `127.0.0.1` or a preview alias (any host other than `APP_URL`) gets 403 on Exit, which ends nothing and leaves `rm_support` set — the session lasts until its 60-min expiry or sign-out.
- Brainstorm mockups: ephemeral server at `http://localhost:59017` from `.superpowers/brainstorm/`; keepers go in `docs/brand/mockups/`.

## Commands
- `pnpm install` · `pnpm typecheck` · `pnpm test` (turbo, `--concurrency=1`) · `pnpm db:migrate` (applies to `cs_dev`) · `pnpm --filter <pkg> test` · `pnpm --filter @cs/web e2e` · `pnpm dev:web` · `pnpm demo:reset` / `pnpm demo:links` · `db:snapshot` / `db:restore`.

## Git & commits
- Trailer on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagent commits may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- **LF only** (`.gitattributes` `* text=auto eol=lf`). `git ls-files --eol | grep crlf` must print nothing. Python edits on Windows leave `w/crlf` working copies even when the index is LF — re-checkout those files.
- **E2E sign-ins:** magic links are rate-limited to 5 per IP per minute; a new spec that signs in a new user can push the run over it — reuse a shared session (`ensureAdminState`) where possible.
- A gitignore entry meant for one root folder needs a leading slash: a bare `App/` matched `apps/web/src/app` case-insensitively on Windows (now `/App/`).

## Testing
- **Use the local test cluster, not Neon, for tests:** `bash scripts/local-test-db.sh setup` once (PG18 + pgvector v0.8.1 built with VS 2022 Build Tools, under `D:\rm-pg`, port 5444, superuser like CI), `start` after a reboot, `env` prints the three `TEST_*` lines. Neon costs ~50 ms per query and ~1.7 s per connection.
- **Measured (2026-10-17, 5,160 tests, every package): local cluster ~29 min** for the full unit suite; full E2E (91) ~6 min. After a rebase the `next build` can exceed Playwright's 300 s webServer timeout under `pnpm --filter @cs/web e2e` — use `e2e:affected --full` (builds first, then `E2E_SKIP_BUILD=1`).
- **Run the full suite with `run_in_background`** (longer than the Bash tool's 10-min cap). **Never run two test runs against the same database** (incl. E2E): they collide (FK/duplicate-key errors, deadlocks). Parallel worktrees get their own `cs_<branch>_test` (see `/rm-kickoff`). The DB name **must end in `_test`** (the harness refuses others). **Parallel worktrees also need their own E2E port:** the server defaults to 3100; set `E2E_PORT=3101` (etc.) for `e2e`/`e2e:affected` when another worktree holds it.
- **Global setup resets once:** it wipes + migrates only when the migration files' fingerprint changed (stored in schema `cs_test_meta`); otherwise it empties the tables. Force a rebuild with `TEST_DB_FULL_RESET=1`.
- **`truncateAll` is a DELETE** with `session_replication_role = replica` when the owner is a superuser (local, CI); on Neon it falls back to one `TRUNCATE` statement. Don't reintroduce per-table TRUNCATE loops (slow on Windows).
- **Focused runs:** `pnpm --filter <pkg> exec vitest run <pattern>`. `pnpm --filter <pkg> test -- <pattern>` does *not* narrow.
- **Keep going past failures:** `npx turbo run test --concurrency=1 --continue` (`pnpm test -- --continue` passes it to vitest, which rejects it).
- **Flakes:** only `ETIMEDOUT`/`ECONNRESET`/timeouts (Neon) → re-run that package once; web `page-controls` PinPageSwitch and collectors `renderer` "reports timeouts" flake under load → re-run focused.
- **Subagents:** tell implementers to run focused tests in the foreground (`timeout: 600000`), poll any background whole-package run with short foreground checks, and **never hand back while a test run they started is still running**. If the API times out during long phases, resume subagents rather than restarting, and keep each write small.

## Database & migrations
- **Never edit applied migrations**; add new ones. Custom SQL: `pnpm --filter @cs/db generate --custom --name=<x>`, statements separated by `--> statement-breakpoint`. RLS/grant rules: `packages/db/CLAUDE.md`.

## Data & privacy invariants
- **`redactForModel`** (`@cs/collectors`), never a bare `redactContactInfo`, on every text entering a decision state, chat message or embedding input, with the business's own name(s) as `businessNames` where known (adds `compromise` NER person-name and serious-health-condition redaction). A lone `redactContactInfo` at a new model-input site is a privacy regression.
- **`upsell_tag` is agency-only (spec §8.5)** and RLS can't hide a column: every read path over `brief_item`/`recommendation` (`getBrief`, UI, MCP) and every client-facing email, digest, PDF and webhook payload must strip it; agency-facing notices may include it.
- **Events are soft-retracted, never deleted** (`event.retracted_at`/`retraction_reason`): every event reader must filter `retracted_at IS NULL`.
- **Prospects, paused clients and unpaid agencies get no recurring work:** every scheduler/list that picks clients or their tracked competitors filters `clientServiceable(client)` (= `status = 'active' AND paused_at IS NULL`; also takes a raw alias for hand-written SQL) **and** `agencyServiceable(agencyId)` (not read_only/suspended), both in `@cs/db` `filters.ts` — incl. Phase 12's `listStartingPointDue`, `listSignalClients`, `listMonthlyRivalClients`, `startCompetitorSearch`, and the billing seat count `countActiveClients`. Also `claimDueSources`, `claimDuePages`, `ensureSelfCompetitors`, `listRankClients`, the sweep's score/`rankDiff` branches, `scoreEvent`, `listMoveClients`, `listBriefDueClients`, `runQuarterlyReports`; the sweep's review-analysis and price branches are deliberately unfiltered (F24). A new one without the filters leaks prospects or paused clients into paid or client-facing work.

## Conduct & operations
- **Crawler conduct is non-negotiable:** honest UA `RivalMondayBot`, RFC 9309 robots (5xx/unreachable ⇒ disallow), ≥3 s per host, blocked ⇒ record, never evade. No real competitor site is crawled until `WEB_MONITORING_ENABLED='true'`.
- **Worker = one replica** (in-process per-host limits); no `collect-once --poll` while it runs.
- **A fresh per-worktree test DB has no `pgboss` schema** (E2E: `relation "pgboss.job" does not exist`): run `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once (`/rm-kickoff` does).
- **Stacked branches merge once, from the tip:** rebase the base on `main`, then each child with `git rebase --onto <base> <old-base-sha>`; fold every work file on the tip and `merge --ff-only` it. On Windows `git worktree remove --force` can leave the folder (locked files, over-long `node_modules` paths) — delete it with `cmd /c rd /s /q "\\?\<abs path>"`, then `git worktree prune`.
- **After merging a branch that adds a workspace package, run `pnpm install` in the main checkout** (else `ERR_MODULE_NOT_FOUND @cs/<pkg>`).
- **Scripted edits must read/write UTF-8 explicitly** (Python on Windows defaults to cp1252 and corrupts `—`/`…`): check a branch with `iconv -f utf-8 -t utf-8` over `git diff --name-only main...HEAD`.
