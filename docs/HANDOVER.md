# Rival Monday — Session Handover

*Written 2026-09-30; updated 2026-10-01 after Phase 2 (2a + 2b). Start any new session by reading this file, then the documents it links. Keep it updated at the end of each session.*

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
| [docs/research/2026-09-30-phase-2-vendor-apis.md](research/2026-09-30-phase-2-vendor-apis.md) | Vendor API contracts (DataForSEO, Apify, ScrapeCreators, Meta, R2, Playwright…); the **"Verified 2026-10-01"** section holds live-checked shapes, costs and quirks |
| [docs/superpowers/plans/2026-09-30-phase-2a-evidence-and-web.md](superpowers/plans/2026-09-30-phase-2a-evidence-and-web.md) | Done (merged) |
| [docs/superpowers/plans/2026-09-30-phase-2b-vendor-sources.md](superpowers/plans/2026-09-30-phase-2b-vendor-sources.md) | Done (merged) |

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

## 3. Current state (2026-10-01)

**Git:** `main` at `7c36943` holds Phases 0–2 (2a + 2b merged), pushed to `https://github.com/swkruger/rivalmonday` (private). Working tree clean, no open feature branches. Work happens on feature branches, merged locally, then pushed.

**Phase 0 — Branding: DONE.** Validation items (GHL/Vendasta marketplace check, agency LOIs, counsel review) still open.

**Phase 1 — Foundations: DONE.** `@cs/core` (access context, tool registry), `@cs/db` (Drizzle + RLS tenancy), `@cs/ai` (OpenRouter, Jev — score maps to the argmax level), `@cs/verticals`, `@cs/worker` (pg-boss jobs).

**Phase 2a — Evidence & web: DONE (merged).** `@cs/storage` (memory / fs / R2 object store) and `@cs/collectors` (honest UA, RFC 9309 robots, per-host rate limit, Playwright renderer with block detection, hash-first immutable evidence recorder, page discovery from nav + sitemaps, exactly-once due-page claiming). Tables `tracked_page`, `capture`, `evidence` (migrations 0007–0008). Worker jobs `web-schedule`, `web-capture-page`, `discover-pages`; `collect-once` CLI.

**Phase 2b — Vendor sources: DONE (merged).** DataForSEO client (typed errors, retries, one `vendor_call` ledger row per call), vendor evidence capture, reviewer privacy (HMAC pseudonym; names, profile links, photos, activity counts and first-name greetings stripped from rows **and** stored evidence; e-mails/phones redacted), local-search competitor suggestions + acceptance, Google Business Profile, Google reviews (async), Google ads (filtered to the competitor's advertiser name), Meta ads (Apify primary, ScrapeCreators fallback — both live-verified, identical results), Google Jobs, monthly geo-grid rank scans, `competitor_source` scheduling and six worker jobs (`vendor-schedule`, `vendor-collect`, `vendor-poll`, `rank-schedule`, `rank-scan`, `suggest-competitors`). Migrations 0009–0011 (app_user may update only `competitor_suggestion.status`). Live-verified 2026-10-01 against Aire Serv (place `ChIJ6VlKPHqPT4YR479jLd01gZY`; Meta page Aire Serv of Granbury `1825453601028298`; spend ≈ $0.095 + 1 ScrapeCreators credit); sanitised fixtures in `packages/collectors/test/fixtures/vendors/`.

Tests: `pnpm typecheck && pnpm test` green (7 packages; collectors 197, worker 21). Neon occasionally times out (`ETIMEDOUT`) — re-run once.

---

## 4. Environment & setup (Windows 11, Git Bash + PowerShell)

- Node 24.19 (winget), pnpm 10.34. Docker is **not** installed (use Neon).
- Local PostgreSQL 17 service exists on the machine but is **not used** by this project.
- Repo-root `.env` (gitignored, **never print or commit it**) currently contains: `NEON_OWNER_URL`, `DATABASE_URL` (owner → `cs_dev`), `APP_DATABASE_URL` (`app_user`), `SERVICE_DATABASE_URL` (`app_service`, BYPASSRLS), the three `TEST_*_DATABASE_URL` equivalents for `cs_test`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `APP_URL`.
- Also set: `EVIDENCE_FS_DIR=./.evidence` (evidence lands in `apps/worker/.evidence/` when run via `pnpm --filter`), `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` (account verified and funded), `APIFY_TOKEN`, `REVIEWER_HASH_SALT` (never change it). `SCRAPECREATORS_API_KEY` is set too. Not set: R2 vars (production). Setting `DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com/v3` switches to the free sandbox.
- Commands: `pnpm install` · `pnpm typecheck` · `pnpm test` (turbo, `--concurrency=1` because DB tests share `cs_test`) · `pnpm db:migrate` (applies to `cs_dev`) · `pnpm --filter <pkg> test`.
- Neon facts: owner role is **not superuser but has BYPASSRLS** (test harness relies on it); Postgres 18.6 on Neon vs 16 in CI/compose (carry-over to align).
- Visual companion (brainstorming mockups) ran at `http://localhost:59017` from `.superpowers/brainstorm/` — ephemeral; mockups that matter are saved in `docs/brand/mockups/`.

---

## 5. How to continue (next session checklist)

1. Read this file and the roadmap carry-over sections. Check `git log --oneline -5` (expect `7c36943` on `main`) and `git status` (clean).
2. On or after **2026-10-08**: re-pull the Aire Serv reviews (`pnpm --filter @cs/worker collect-once --domain <aire serv domain> --place-id ChIJ6VlKPHqPT4YR479jLd01gZY --vendors`, then `--poll`) and compare `review_id`s for stability (roadmap carry-over).
3. Write the **Phase 3 (intelligence engine)** plan with `superpowers:writing-plans` against the merged code, folding in the Phase 2 carry-over items (persist discovery homepage status; DB-level evidence immutability + `legal_hold`; Google-ad activity from `last_seen_at` and advertiser-id pinning; several Meta pages per franchise competitor; metaPageId/placeId discovery for accepted competitors; role checks on accept; edited reviews).
4. Execute it with `superpowers:subagent-driven-development` (the user's chosen method: ledger in `.superpowers/sdd/<plan>/progress.md`, final whole-branch review on the most capable model, then `superpowers:finishing-a-development-branch` — the user chooses merge locally + push).
5. Never point the web crawler (`collect-once` without `--vendors`, or with `--web`) at real competitors until `https://rivalmonday.com/bot` exists. `--vendors` alone only calls vendor APIs.

---

## 6. Hard-won gotchas (read before writing code)

- **Drizzle `sql` + JS arrays:** a bare array inside `sql\`...\`` expands to a parameter *list*, not an array. Build arrays with ``sql`ARRAY[${sql.join(items.map((x) => sql`${x}`), sql`, `)}]::uuid[]` ``.
- **Drizzle 0.44 wraps driver errors** (`DrizzleQueryError`); the Postgres message is on `err.cause.message` — use `errorText()` from `@cs/db/test-helpers`.
- **drizzle-kit may order a composite FK before the unique constraint it needs** — reorder generated SQL by hand when tests fail on migrate (happened in `0002`).
- **Never edit applied migrations** (`cs_dev` has `0000`–`0011`); add new ones. Custom SQL via `pnpm --filter @cs/db generate --custom --name=<x>` with `--> statement-breakpoint` separators.
- **RLS patterns:** tenant tables use `agency_id = app_agency_id() AND app_client_visible(client_id)`; global public-data tables use `app_competitor_visible(competitor_id)` (Phase 2a) and are **written only by the service role** (REVOKE INSERT/UPDATE/DELETE from `app_user`). Revoking changes error text from "row-level security" to "permission denied" — update tests accordingly. The guard test fails if a new public table lacks forced RLS.
- **Turborepo strict env mode:** env vars reach tasks only if listed in `turbo.json` `globalPassThroughEnv` (already: `TEST_*`, `DATABASE_URL`, `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`, the DataForSEO/Apify/ScrapeCreators keys and `REVIEWER_HASH_SALT`).
- **`.env` loading:** each package's `vitest.config.ts` / entry point calls `process.loadEnvFile(<repo-root>/.env)` in try/catch — count directory levels carefully (a wrong depth silently loads nothing; it bit us once).
- **Git Bash on Windows:** don't `source .env` (values contain `&`); parse with `grep '^KEY=' .env | cut -d= -f2-`. `timeout` + pnpm exits 143 on SIGTERM — cosmetic.
- **pg-boss 10:** queue names with hyphens; `work()` handlers receive arrays; worker uses the owner `DATABASE_URL` for now (least-privilege role is a Phase 7 item).
- **Jev API:** `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` (returns `jev-1.13.0`); noul has no confidence field (derived); score = average, level = argmax.
- **Crawler conduct is non-negotiable:** honest UA `RivalMondayBot`, RFC 9309 robots (5xx/unreachable ⇒ disallow), ≥3 s per host, blocked ⇒ record, never evade.
- **Worker = one replica.** Per-host rate limiting is in-process; don't run `collect-once --poll` (or a web crawl of the same domain) while the worker runs.
- **app_user privileges:** the privilege guard test enumerates every public table and asserts an exact allow-list (`client`, `client_competitor`, `competitor_suggestion` UPDATE(status) only). A new tenant table that app_user writes must be added there.
- **Vendor quirks (live-verified):** DataForSEO can answer 200 with an OK envelope but a task-level error (check `isDfsOk` per task); `task_get` repeats the cost but isn't billed (ledgered at $0); `data.tag` echoes our competitor id (tasks are mapped by tag); Apify returns an error *item* for pages with no ads; `ads_search` by domain returns other advertisers' creatives (filtered by name); owner replies greet reviewers by first name (redacted).
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.

---

## 7. Open items owned by the user

- Register **rivalmonday.com** / **.ai**; trademark knockout search; publish the bot page `https://rivalmonday.com/bot`.
- Create an **R2** bucket + token before production (development stores evidence on local disk).
- Phase 0 validation: GoHighLevel/Vendasta marketplace check, 5 agency letters of intent, US counsel review (crawling, reviews privacy, AI claims about named competitors) before the pilot.
- Confirm Jev pricing (0.042 $/M input is a placeholder).

## 8. Carry-over backlog

All deferred review findings are listed, per phase, at the bottom of the [roadmap](superpowers/plans/2026-09-29-roadmap.md) ("Phase 1 carry-over", "Phase 2 carry-over", "Phase 2a carry-over" and the Phase 2b lines). Fold each into the matching phase plan when it is written.
