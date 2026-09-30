# Rival Monday — Session Handover

*Written 2026-09-30 at the end of the first working session. Start any new session by reading this file, then the documents it links. Keep it updated at the end of each session.*

---

## 1. What we are building

**Rival Monday** (internal codename *CompetitorSpy*; repo `swkruger/rivalmonday`) is an agency-owned, white-labelable SaaS that monitors the competitors of **local-service small businesses** (pilot verticals: HVAC/plumbing and dental) using **public information only**. It turns raw changes (competitor websites, Google Business Profile, reviews, Google/Meta ads, hiring, local rankings) into:

- a **full dashboard** for agencies and their clients,
- a **remote MCP server** so every data point is queryable from Claude/ChatGPT,
- an in-app **Ask assistant** ("Friday") that answers questions and recommends next steps,
- a weekly **evidence-backed brief** (every sentence links to a stored snapshot — *no evidence, no claim*) plus instant alerts.

Business model: first sold to the owning agency's own clients, then **wholesale white-label to other local-service agencies** (feasibility study verdict: conditional go; direct-to-SMB parked).

### Key documents (read in this order)

| Doc | Why |
|---|---|
| [docs/research/2026-09-29-competitor-intel-feasibility-study.md](research/2026-09-29-competitor-intel-feasibility-study.md) | Market, competitors, data-source legality, unit economics, recommendation (+ addendum with later scope changes) |
| [docs/superpowers/specs/2026-09-29-core-platform-design.md](superpowers/specs/2026-09-29-core-platform-design.md) | **Binding design spec** (architecture, tenancy, engine, AI layer, MCP, Ask, briefs, stack) |
| [docs/superpowers/plans/2026-09-29-roadmap.md](superpowers/plans/2026-09-29-roadmap.md) | 7 phases + Phase 0, status, and all carry-over items |
| [docs/brand/brand.md](brand/brand.md) + [docs/brand/mockups/](brand/mockups/) | Brand decisions, colour tokens, 5 example pages (design reference for Phase 5) |
| [docs/research/2026-09-30-phase-2-vendor-apis.md](research/2026-09-30-phase-2-vendor-apis.md) | Researched vendor API contracts (DataForSEO, Apify, ScrapeCreators, Meta, R2, Playwright…) with UNVERIFIED flags |
| [docs/superpowers/plans/2026-09-30-phase-2a-evidence-and-web.md](superpowers/plans/2026-09-30-phase-2a-evidence-and-web.md) | **Next to execute** (9 tasks) |
| [docs/superpowers/plans/2026-09-30-phase-2b-vendor-sources.md](superpowers/plans/2026-09-30-phase-2b-vendor-sources.md) | After 2a (12 tasks) |

---

## 2. Decisions made with the user (do not re-litigate)

**Product & business**
- Agency-owned product; local-service SMB clients; channel = own clients first → wholesale white-label to agencies (Phase 2 of the business, ~months 6–9).
- **Full-stack MVP**: dashboard (agency + client), MCP server, Ask assistant, briefs — not an email-only product.
- Pilot verticals: HVAC/plumbing and dental. US-first.

**Brand (Phase 0, done)**
- Product name **Rival Monday**; wordmark `rivalmonday` (one word, lowercase) — `rival` in **#2A6BAC**, `monday` in accent **#F5A524**.
- Default AI assistant **Friday** (agencies can rename), shown as an orange pill badge (#F5A524 bg, #3B2300 text).
- Direction "A2 · sky blue leads": primary **#47A8E7**, secondary **#2A6BAC**, accent **#F5A524**, ink #0B2540, canvas #F6F9FC, **dark text on grey** panels (#EEF2F6). **White text on #47A8E7 is accepted** by the owner despite 2.6:1 contrast (recorded decision).
- Inter typeface. Content centred with **max-width 1560px** on wide screens.
- UI inspiration: Paige by Merchynt (card KPIs, highlighted CTA panel, per-tier *Manual / AI approval required / AI fully automated* switches, white-label settings page).
- Pending: register rivalmonday.com + .ai; trademark attorney knockout search (watch monday.com marks).

**Stack & infrastructure**
- TypeScript monorepo (pnpm 10 + Turborepo), **Node 24** locally.
- Frontend (Phase 5): **React + Next.js App Router + Tailwind CSS + shadcn/ui**, brand tokens as CSS variables overridden per agency.
- **Vercel** for web/API/MCP/cron (hybrid): one always-on **worker container** (Railway/Fly) for pg-boss jobs + Playwright crawling.
- **Neon Postgres** (dev + tests; project has DBs `cs_dev` and `cs_test`); Postgres RLS for tenant isolation.
- Evidence storage: Cloudflare **R2** (filesystem store for local dev).
- Models: **OpenRouter** for generative tasks (config in `packages/ai/config/ai.yaml`); **Jev (TypeSafe System One)** for typed decisions behind a `DecisionProvider` with confidence cascade Jev → LLM → human review.
- Auth (Phase 5): Better Auth (magic link, Google, orgs, OAuth 2.1 provider for MCP).

**Process preference:** the user chose **subagent-driven development** (fresh implementer per task + reviewer per task + final whole-branch review) and wants plans in **phases with small tasks**.

---

## 3. Current state (2026-09-30)

**Git:** `main` at the Phase 1 merge + docs, pushed to `https://github.com/swkruger/rivalmonday` (private). Work happens on feature branches, merged locally, then pushed.

**Phase 1 — Foundations: DONE** (merged). 97 tests passing (1 skipped until Phase 2a Task 1). Packages:

| Package | Contents |
|---|---|
| `@cs/core` | `AccessContext`/roles/permissions/features, domain constants (`CHANGE_TYPES`, `MOVE_TYPES`), ledger contract, **tool registry** (`toolkit().defineTool`, `ToolRegistry` with permission/feature gating, Zod validation, typed `ToolError`, audit on every call incl. unhashable input and audit failures) |
| `@cs/db` | Drizzle schema (agency, client, competitor, client_competitor, audit_log, llm_call, vendor_call), migrations `0000`–`0006`, **RLS** (`withTenant(db, ctx, fn)` with transaction-local `app.agency_id` / `app.client_scope`), audit + ledger sinks, test helpers (`@cs/db/test-helpers`) |
| `@cs/ai` | `postJson` with retries, YAML task config, OpenRouter chat provider (privacy routing `data_collection: deny`, `zdr`), Jev provider, LLM decision provider (prompt-injection hardened), `CascadingDecisionProvider`, `createAi`/`createAiFromEnv` facade with guarded cost ledger |
| `@cs/verticals` | Vertical-pack schema/loader + `hvac_plumbing` and `dental` packs (services, review themes, weights, move thresholds, playbooks) |
| `@cs/worker` | pg-boss typed jobs (`defineJob`, `registerJobs`, `enqueue`), heartbeat job |

Security properties proven by tests: fail-closed tenant context, agency/client scoping, composite FK `client_competitor(client_id, agency_id)`, agency table SELECT-only for `app_user`, audit/ledger tables read-only for `app_user` with client-scoped reads, guard test that every public table has RLS enabled + forced.

**Phase 0 — Branding: DONE.** Validation items (GHL/Vendasta marketplace check, agency LOIs, counsel review) still open.

**Phase 2 — planned, not started.** 2a (evidence & web, 9 tasks) then 2b (vendor sources, 12 tasks).

**Live finding (important):** the Jev live contract test showed Jev's `score` is a probability-weighted **average**; the discrete level is the argmax of `probabilities` (0-based keys). Current code rejects it (safely). **Phase 2a Task 1 fixes this** — do it first.

---

## 4. Environment & setup (Windows 11, Git Bash + PowerShell)

- Node 24.19 (winget), pnpm 10.34. Docker is **not** installed (use Neon).
- Local PostgreSQL 17 service exists on the machine but is **not used** by this project.
- Repo-root `.env` (gitignored, **never print or commit it**) currently contains: `NEON_OWNER_URL`, `DATABASE_URL` (owner → `cs_dev`), `APP_DATABASE_URL` (`app_user`), `SERVICE_DATABASE_URL` (`app_service`, BYPASSRLS), the three `TEST_*_DATABASE_URL` equivalents for `cs_test`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `APP_URL`.
- Needed later: `EVIDENCE_FS_DIR=./.evidence` (Phase 2a), R2 vars (production), `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY` (optional), `REVIEWER_HASH_SALT` (≥32 random chars, never change once set) — Phase 2b.
- `.superpowers/env.backup` contains a copy of `.env` with credentials — **ask the user to delete it** if it still exists.
- Commands: `pnpm install` · `pnpm typecheck` · `pnpm test` (turbo, `--concurrency=1` because DB tests share `cs_test`) · `pnpm db:migrate` (applies to `cs_dev`) · `pnpm --filter <pkg> test`.
- Neon facts: owner role is **not superuser but has BYPASSRLS** (test harness relies on it); Postgres 18.6 on Neon vs 16 in CI/compose (carry-over to align).
- Visual companion (brainstorming mockups) ran at `http://localhost:59017` from `.superpowers/brainstorm/` — ephemeral; mockups that matter are saved in `docs/brand/mockups/`.

---

## 5. How to continue (next session checklist)

1. Read this file, the roadmap, and the Phase 2a plan. Check `git log --oneline -5` and `git status` (clean `main` expected).
2. Create a branch: `git checkout -b phase-2a-evidence-web`.
3. Add `EVIDENCE_FS_DIR=./.evidence` to `.env` (and `.evidence/` to `.gitignore` — Task 9 also does this).
4. Execute **Phase 2a** with `superpowers:subagent-driven-development` (the user's chosen method): ledger in `.superpowers/sdd/<plan>/progress.md`, per-task brief/report/review files, reviewers get the diff via the skill's `review-package` script, final whole-branch review on the most capable model, then `superpowers:finishing-a-development-branch` (user so far chose: merge locally to `main`, then push).
5. Before Phase 2a Task 9's manual run on real competitors: the bot information page `https://rivalmonday.com/bot` should exist (domain not registered yet — only run `collect-once` against `example.com` until then).
6. Then Phase 2b (needs the vendor keys above). Its Task 12 verifies UNVERIFIED vendor shapes live.
7. After Phase 2: write the Phase 3 (intelligence engine) plan with `superpowers:writing-plans`, against the merged code.

---

## 6. Hard-won gotchas (read before writing code)

- **Drizzle `sql` + JS arrays:** a bare array inside `sql\`...\`` expands to a parameter *list*, not an array. Build arrays with ``sql`ARRAY[${sql.join(items.map((x) => sql`${x}`), sql`, `)}]::uuid[]` ``.
- **Drizzle 0.44 wraps driver errors** (`DrizzleQueryError`); the Postgres message is on `err.cause.message` — use `errorText()` from `@cs/db/test-helpers`.
- **drizzle-kit may order a composite FK before the unique constraint it needs** — reorder generated SQL by hand when tests fail on migrate (happened in `0002`).
- **Never edit applied migrations** (`cs_dev` has `0000`–`0006`); add new ones. Custom SQL via `pnpm --filter @cs/db generate --custom --name=<x>` with `--> statement-breakpoint` separators.
- **RLS patterns:** tenant tables use `agency_id = app_agency_id() AND app_client_visible(client_id)`; global public-data tables use `app_competitor_visible(competitor_id)` (Phase 2a) and are **written only by the service role** (REVOKE INSERT/UPDATE/DELETE from `app_user`). Revoking changes error text from "row-level security" to "permission denied" — update tests accordingly. The guard test fails if a new public table lacks forced RLS.
- **Turborepo strict env mode:** env vars reach tasks only if listed in `turbo.json` `globalPassThroughEnv` (already: `TEST_*`, `DATABASE_URL`, `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`). Add new vendor keys there if tests need them.
- **`.env` loading:** each package's `vitest.config.ts` / entry point calls `process.loadEnvFile(<repo-root>/.env)` in try/catch — count directory levels carefully (a wrong depth silently loads nothing; it bit us once).
- **Git Bash on Windows:** don't `source .env` (values contain `&`); parse with `grep '^KEY=' .env | cut -d= -f2-`. `timeout` + pnpm exits 143 on SIGTERM — cosmetic.
- **pg-boss 10:** queue names with hyphens; `work()` handlers receive arrays; worker uses the owner `DATABASE_URL` for now (least-privilege role is a Phase 7 item).
- **Jev API:** `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` (returns `jev-1.13.0`); noul has no confidence field (derived); score = average, level = argmax.
- **Crawler conduct is non-negotiable:** honest UA `RivalMondayBot`, RFC 9309 robots (5xx/unreachable ⇒ disallow), ≥3 s per host, blocked ⇒ record, never evade.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.

---

## 7. Open items owned by the user

- Register **rivalmonday.com** / **.ai**; trademark knockout search.
- Delete `.superpowers/env.backup`.
- Obtain **DataForSEO** (login/password), **Apify** token, optionally **ScrapeCreators** key; create an **R2** bucket + token before production.
- Phase 0 validation: GoHighLevel/Vendasta marketplace check, 5 agency letters of intent, US counsel review (crawling, reviews privacy, AI claims about named competitors) before the pilot.
- Confirm Jev pricing (0.042 $/M input is a placeholder).

## 8. Carry-over backlog

All deferred review findings are listed, per phase, at the bottom of the [roadmap](superpowers/plans/2026-09-29-roadmap.md) ("Phase 1 carry-over" and "Phase 2 carry-over"). Fold each into the matching phase plan when it is written.
