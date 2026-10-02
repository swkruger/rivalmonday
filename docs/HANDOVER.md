# Rival Monday — Session Handover

*Written 2026-09-30; last updated 2026-10-02 after Phase 3b's implementation (16 tasks) and live verification completed on branch `phase-3b-structured`. Start any new session by reading this file, then the documents it links. Keep it updated at the end of each session.*

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
| [docs/superpowers/plans/2026-10-01-phase-3a-web-changes-to-scored-events.md](superpowers/plans/2026-10-01-phase-3a-web-changes-to-scored-events.md) | Done (merged). Its "Phase 3 overview" table defines the scope of **3b** and **3c** |
| [docs/superpowers/plans/2026-10-01-phase-3b-structured-sources-merge-moves.md](superpowers/plans/2026-10-01-phase-3b-structured-sources-merge-moves.md) | Implementation done (16 tasks), live-verified 2026-10-02; branch `phase-3b-structured` awaiting its final whole-branch review and merge |

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

## 3. Current state (2026-10-02)

**Git:** `main` holds Phases 0–2 and **3a**, pushed to `https://github.com/swkruger/rivalmonday` (private). Phase 3b's implementation and live verification are complete on branch `phase-3b-structured` (16 commits on top of `main`'s `4608168`); it has **not** been merged yet — the final whole-branch review is next. Work happens on feature branches, merged locally, then pushed.

**Phase 0 — Branding: DONE.** Validation items (GHL/Vendasta marketplace check, agency LOIs, counsel review) still open.

**Phase 1 — Foundations: DONE.** `@cs/core` (access context, tool registry), `@cs/db` (Drizzle + RLS tenancy), `@cs/ai` (OpenRouter, Jev — score maps to the argmax level), `@cs/verticals`, `@cs/worker` (pg-boss jobs).

**Phase 2a — Evidence & web: DONE (merged).** `@cs/storage` (memory / fs / R2 object store) and `@cs/collectors` (honest UA, RFC 9309 robots, per-host rate limit, Playwright renderer with block detection, hash-first immutable evidence recorder, page discovery from nav + sitemaps, exactly-once due-page claiming). Tables `tracked_page`, `capture`, `evidence` (migrations 0007–0008). Worker jobs `web-schedule`, `web-capture-page`, `discover-pages`; `collect-once` CLI.

**Phase 2b — Vendor sources: DONE (merged).** DataForSEO client (typed errors, retries, one `vendor_call` ledger row per call), vendor evidence capture, reviewer privacy (HMAC pseudonym; names, profile links, photos, activity counts and first-name greetings stripped from rows **and** stored evidence; e-mails/phones redacted), local-search competitor suggestions + acceptance, Google Business Profile, Google reviews (async), Google ads (filtered to the competitor's advertiser name), Meta ads (Apify primary, ScrapeCreators fallback — both live-verified, identical results), Google Jobs, monthly geo-grid rank scans, `competitor_source` scheduling and six worker jobs (`vendor-schedule`, `vendor-collect`, `vendor-poll`, `rank-schedule`, `rank-scan`, `suggest-competitors`). Migrations 0009–0011 (app_user may update only `competitor_suggestion.status`). Live-verified 2026-10-01 against Aire Serv (place `ChIJ6VlKPHqPT4YR479jLd01gZY`; Meta page Aire Serv of Granbury `1825453601028298`; spend ≈ $0.095 + 1 ScrapeCreators credit); sanitised fixtures in `packages/collectors/test/fixtures/vendors/`.

**Phase 3a — Web changes → scored events: DONE.** New package `@cs/engine` (main-content extraction + volatile-region masking, embeddings + cosine semantic diff, numeric rule layer with LLM fallback, tagging via `DecisionProvider` with the confidence cascade and a `decision_review` queue, per-client scoring with stored factor breakdown, idempotent versioned stages via `stage_run`). Migrations `0012`–`0016` (`0012_evidence_legal_hold`, `0013_evidence_immutable`, `0014_pgvector`, `0015_engine`, `0016_engine_rls`). Worker jobs `engine-sweep`/`engine-diff`/`engine-tag`/`engine-score` and the `engine-once` CLI (drains the engine inline against a real database for manual/smoke verification). Live-verified 2026-10-01 against real OpenRouter embeddings (`openai/text-embedding-3-small` @ 512) and Jev/LLM decisions — see the vendor-APIs doc's "Verified 2026-10-01 — engine models" section and `packages/engine/src/engine.live.test.ts`. Final whole-branch review done; its fix wave hardened the consent-banner filter (whole class/id segments, never removes `html/body/main/article`), set the retry backoff to 30 min × 2^(attempts−1) with a warning on exhaustion, limited the territory factor to `service_area_change`/`new_location`, added a whole-page churn guard (heavy add/remove churn keeps only money changes), made `value_extract` failures fail the stage, and built event summaries from redacted text.

Decisions taken during 3a (all recorded in the plan/roadmap; don't re-litigate without reason): only price/percent changes force "meaningful" (dates/durations are detected but dismissable); low-confidence dismissals also go to `decision_review`; novelty discounts only repeats of the *same numeric change* (`factsSignature`), so successive price cuts are never archived as duplicates; engine queues use `retryLimit: 0` — the sweep is the only retry path.

**Phase 3b — Structured sources, merge & moves: implementation + live verification DONE 2026-10-02 (branch `phase-3b-structured`, not yet merged).** Extends `@cs/engine` with: structured-source differs for ads (Google + Meta), GBP fields, Google reviews (velocity/rating), Google jobs and local rank scans, each grouped per capture and diffed only after a 10-minute settle delay; structured tagging (fixed type, service mapping, ad offer extraction); cross-channel merge (identical numeric facts merge without a model call; otherwise a Noul "same offer?" call at 0.8 confidence, within ±14 days, same tenant scope); the seven spec move rules (territory expansion, price war, new service line, hiring push, promo blitz, reputation slump, ad surge) as pure functions feeding a nightly `emerging → active → fading → closed` lifecycle with an evidence chain; size curves for the new structured types and an `alert_max_age_days` cap so old backlog events can no longer route to `alert`. Migrations `0017`–`0021`: `0017_vendor_history`/`0018_vendor_history_rls` (`ad.ended_capture_id`, `review_revision`, `rank_scan`/`rank_snapshot.scan_id`), `0019_engine_structured`/`0020_engine_structured_rls` (`detected_change`/`event` gain tenant columns + `channels`/`details`, new `move`/`move_event` tables), `0021_drop_meta_page_id` (drops the now-unused singular column after code moved to `meta_page_ids`). New worker jobs `engine-rank-diff` (diffs one rank scan), `moves-nightly` (cron `30 4 * * *`, enqueues one `moves-client` job per client that tracks at least one competitor) and `moves-client` (`policy: 'short'` + per-client `singletonKey`, runs the move rules over that client's last 90 days of scored events); `engine-once` gained a `--moves` flag, argument validation, and a non-zero exit code when `errors > 0`. Also closed from the 2b/3a carry-over: Google advertiser-id pinning (`competitor.google_advertiser_ids`, ≤ 25, `ads_search` at `depth: 120`) with "started/stopped" judged by our own `last_seen_at`; several Meta pages per competitor (`meta_page_ids`); edited reviews kept as `review_revision` history; same price in two blocks now merges to one event; routing now caps alert age; sweep re-enqueues dedupe via `singletonKey`. Live-verified 2026-10-02 against Aire Serv — see the vendor-APIs doc's "Verified 2026-10-02 — Phase 3b" section and §6 below for the gotchas. Deferred items (3c or later) are listed in the roadmap's new "Phase 3b carry-over" section; a final whole-branch review is next, then the 3c plan.

Tests: `pnpm typecheck && pnpm test` green (8 packages, 578 tests: collectors 212, engine 169, ai 58, db 54, worker 35, core 20, storage 15 + 3 skipped, verticals 12). Neon occasionally times out (`ETIMEDOUT`) — re-run once. The engine live test calls real OpenRouter/Jev (≈ $0.001 per run) whenever `OPENROUTER_API_KEY` is set.

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

1. Read this file and the roadmap carry-over sections. Check `git log --oneline -5` and `git status`; `main` is still at Phase 3a — the 16 Phase 3b commits are on `phase-3b-structured` (not yet merged).
2. **Finish and merge Phase 3b:** a final whole-branch review of `phase-3b-structured` is in progress (the Task 16 live-verification pass and this handover update are done; §3 above and the roadmap's "Phase 3b carry-over" section list what it found so far). Run it to completion, address or knowingly defer its findings, then `superpowers:finishing-a-development-branch` to merge locally and push — the user's chosen method.
3. **Then write the Phase 3c plan** (reviews, prices & model ops) with `superpowers:writing-plans` against the merged code: review themes & benchmark (spec §6.5), price normalisation (§6.6), the NER/PII pass beyond contact details, Jev shadow evaluation, Anthropic-direct batch provider. Fold in the roadmap's "Phase 3b carry-over" deferred items (volatile learning on alignment, churn-guard gaps, camelCase consent tokens, `extractZips` accuracy, score-sweep backoff, stage-version retraction) and anything the whole-branch review adds.
4. On or after **2026-10-08**: re-pull the Aire Serv reviews and ads (`pnpm --filter @cs/worker collect-once --domain aireserv.com --place-id ChIJ6VlKPHqPT4YR479jLd01gZY --meta-page-id 1825453601028298 --google-advertiser-id <id1> --google-advertiser-id <id2> --google-advertiser-id <id3> --vendors`, then `--poll`; budget ~45 minutes but the 2026-10-02 run was ready in ~12) and compare `review_id`s for stability (roadmap carry-over); this also gives the structured engine a second real capture to diff against the 2026-10-02 baseline.
5. Execute the 3c plan with `superpowers:subagent-driven-development` (ledger in `.superpowers/sdd/<plan>/progress.md`, final whole-branch review on the most capable model, then `superpowers:finishing-a-development-branch`).
6. Never point the web crawler (`collect-once` without `--vendors`, or with `--web`) at real competitors until `https://rivalmonday.com/bot` exists. `--vendors` alone only calls vendor APIs.

---

## 6. Hard-won gotchas (read before writing code)

- **Drizzle `sql` + JS arrays:** a bare array inside `sql\`...\`` expands to a parameter *list*, not an array. Build arrays with ``sql`ARRAY[${sql.join(items.map((x) => sql`${x}`), sql`, `)}]::uuid[]` ``.
- **Drizzle 0.44 wraps driver errors** (`DrizzleQueryError`); the Postgres message is on `err.cause.message` — use `errorText()` from `@cs/db/test-helpers`.
- **drizzle-kit may order a composite FK before the unique constraint it needs** — reorder generated SQL by hand when tests fail on migrate (happened in `0002`).
- **Never edit applied migrations** (`cs_dev` is now at `0016`); add new ones. Custom SQL via `pnpm --filter @cs/db generate --custom --name=<x>` with `--> statement-breakpoint` separators.
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
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagent-authored commits may name their own model, e.g. Sonnet 5 — accepted). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- **Engine needs `OPENROUTER_API_KEY`** (embeddings + LLM fallback); without it `engine-sweep` skips and captures don't enqueue diffs. `TYPESAFE_API_KEY` is optional (decisions fall back to the LLM).
- **Engine retries:** a failed stage is re-offered by the 5-minute `engine-sweep` only after 30 × 2^(attempts−1) minutes; after 5 attempts (~7.5 h) it is exhausted and logs `[engine] stage … exhausted`. To re-run an exhausted subject, delete its `stage_run` row (service role) or bump the stage version.
- **Run the full test suite in the foreground** (it takes ~7 minutes). A backgrounded `pnpm test` left running collides with the next run on the shared `cs_test` database.
- **Captures and evidence are immutable at the DB level** (triggers block UPDATE/DELETE for every role; only `capture.legal_hold` may change). Competitors/tracked pages with captures can't be deleted (FK RESTRICT). Retention deletion is a Phase 7 feature.
- **Naming (Phase 3a):** `EMBEDDING_DIMENSIONS` (`@cs/db`, = 512) is the single source of truth for embedding width — matches `vector(512)` columns and `dimensions: 512` in `ai.yaml`'s `embeddings` task. The engine's output row is `changeEvent` (table) / `ScoreFactors` (stored on `event_score`) — not "eventChange".
- **Money changes are never masked:** per spec §6.1, any detected price/percent change always forces a web diff to be flagged and a tag result to be `meaningful`, regardless of volatile-block masking, model confidence, or what the LLM/Jev decision actually answered — see `gateChange` in `packages/engine/src/web/diff-stage.ts` and the `forced`/`money` logic in `resolveTag` (`packages/engine/src/tag/questions.ts`). Date- or duration-only changes are still detected but can be dismissed as cosmetic by the model; a low-confidence dismissal also writes a `decision_review` row.
- **Vendor captures diff only after a 10-minute settle delay (Phase 3b):** collectors write ad/review/job/GBP rows *after* the `capture` row, so a structured diff run too soon would see nothing — the stage refuses to claim a capture younger than that, and the sweep simply skips it until next time. A capture posted this minute will not have a structured diff for at least 10 minutes.
- **Rank changes/events are tenant-private (Phase 3b):** `rank_change` is the one `ChangeType` that is never global — rank scans come from one client's tracked keywords, so `detected_change`/`event` rows for it always carry `agency_id` **and** `client_id` (CHECK-constraint enforced), are scored only for that client, are hidden from every other tenant by RLS, and are never cross-channel merged with another event.
- **Engine queues use the `short` pg-boss policy with a per-subject `singletonKey` (Phase 3b):** at most one *queued* job per subject (capture/change/event/client) — a subject still queued from the previous sweep is not enqueued again. This closed the Phase 3a "sweep re-enqueues have no dedupe" carry-over.
- **`competitor.meta_page_id` is gone (Phase 3b, migration `0021`):** use `competitor.meta_page_ids` (plural, up to several Meta pages per franchise competitor) — the old singular column and any code reading it will not compile/run.

---

## 7. Open items owned by the user

- Register **rivalmonday.com** / **.ai**; trademark knockout search; publish the bot page `https://rivalmonday.com/bot`.
- Create an **R2** bucket + token before production (development stores evidence on local disk).
- Phase 0 validation: GoHighLevel/Vendasta marketplace check, 5 agency letters of intent, US counsel review (crawling, reviews privacy, AI claims about named competitors) before the pilot.
- Confirm Jev pricing (0.042 $/M input is a placeholder).

## 8. Carry-over backlog

All deferred review findings are listed, per phase, at the bottom of the [roadmap](superpowers/plans/2026-09-29-roadmap.md) ("Phase 1 carry-over", "Phase 2 carry-over", "Phase 2a carry-over", the Phase 2b lines, "Phase 3a carry-over" and "Phase 3b carry-over"). Fold each into the matching phase plan when it is written.
