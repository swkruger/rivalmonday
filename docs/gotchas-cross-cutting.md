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
- Brainstorm mockups: ephemeral server at `http://localhost:59017` from `.superpowers/brainstorm/`; keepers go in `docs/brand/mockups/`.

## Commands
- `pnpm install` · `pnpm typecheck` · `pnpm test` (turbo, `--concurrency=1`) · `pnpm db:migrate` (applies to `cs_dev`) · `pnpm --filter <pkg> test` · `pnpm --filter @cs/web e2e` · `pnpm dev:web` · `pnpm demo:reset` / `pnpm demo:links` · `db:snapshot` / `db:restore`.

## Git & commits
- Trailer on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagent commits may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- **LF only** (`.gitattributes` `* text=auto eol=lf`). `git ls-files --eol | grep crlf` must print nothing.
- A gitignore entry meant for one root folder needs a leading slash: a bare `App/` matched `apps/web/src/app` case-insensitively on Windows (now `/App/`).

## Testing
- **Full suite takes ~18–20 min** against Neon — longer than the Bash tool's 10-min cap: run it with `run_in_background` and wait for the completion notice. **Never run two test runs at once** (incl. E2E): they collide on the shared `cs_test` (FK/duplicate-key errors, TRUNCATE deadlocks).
- **Focused runs:** `pnpm --filter <pkg> exec vitest run <pattern>`. `pnpm --filter <pkg> test -- <pattern>` does *not* narrow.
- **Keep going past failures:** `npx turbo run test --concurrency=1 --continue` (`pnpm test -- --continue` passes it to vitest, which rejects it).
- **Neon flakes:** DB tests near vitest's 30 s timeout, or a whole package failing with only `connect ETIMEDOUT`/`ECONNRESET` and zero assertion failures — re-run that package once before investigating.
- **Subagents:** tell implementers to run focused tests in the foreground (`timeout: 600000`), poll any background whole-package run with short foreground checks, and **never hand back while a test run they started is still running**. If the API times out during long phases, resume subagents rather than restarting, and keep each write small.

## Database & migrations
- **Never edit applied migrations** (`cs_dev` is at `0030`+); add new ones. Custom SQL: `pnpm --filter @cs/db generate --custom --name=<x>`, statements separated by `--> statement-breakpoint`. RLS/grant rules: `packages/db/CLAUDE.md`.

## Data & privacy invariants
- **`redactForModel`** (`@cs/collectors`), never a bare `redactContactInfo`, on every text entering a decision state, chat message or embedding input, with the business's own name(s) as `businessNames` where known (adds `compromise` NER person-name and serious-health-condition redaction). A lone `redactContactInfo` at a new model-input site is a privacy regression.
- **`upsell_tag` is agency-only (spec §8.5)** and RLS can't hide a column: every read path over `brief_item`/`recommendation` (`getBrief`, UI, MCP) and every client-facing email, digest, PDF and webhook payload must strip it; agency-facing notices may include it.
- **Events are soft-retracted, never deleted** (`event.retracted_at`/`retraction_reason`): every event reader must filter `retracted_at IS NULL`.
- **Prospects get no recurring work:** every scheduler/list that picks clients or their tracked competitors filters `client.status = 'active'` (`claimDueSources` both branches, `claimDuePages`, `ensureSelfCompetitors`, `listRankClients`, the engine sweep's score and `rankDiff` branches, `scoreEvent`, `listMoveClients`, `listBriefDueClients`, `runQuarterlyReports`, `get_portfolio`). The sweep's review-analysis and price branches are deliberately not filtered (amendment F24). A new one without the filter leaks prospects into paid/client-facing work.

## Conduct & operations
- **Crawler conduct is non-negotiable:** honest UA `RivalMondayBot`, RFC 9309 robots (5xx/unreachable ⇒ disallow), ≥3 s per host, blocked ⇒ record, never evade. No real competitor site is crawled until `WEB_MONITORING_ENABLED='true'`.
- **Worker = one replica.** Per-host rate limiting is in-process; don't run `collect-once --poll` (or a web crawl of the same domain) while the worker runs.
