# Phase 18e — Social (Facebook + Instagram) and Jev-only decisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (implementer + reviewer per task, final review on the top model, one fix wave). Steps use `- [ ]`.

**Goal:** (A) Track confirmed public Facebook pages and Instagram accounts of each rival and the client's own business — follower growth, offer posts, started-posting / went-quiet — as brief-only lines, a scorecard row, a self rule, a competitor-page block and one tool. (B) Run AI decisions on Jev only by default, with a staff switch back to the cascade and a 7-day "re-evaluate with all models" window that measures Jev against the LLM.
**Architecture:** (A) A once-per-competitor discovery job searches the vendor's company index, reads the FB profile and auto-confirms on a website-host match, else stores a suggestion the agency confirms. A weekly `social` source pulls FB profile + new posts and the IG profile into vendor_json captures, `social_post` rows and `social_profile` observations; `diffSocial` (structured vendor diff) emits `audience_growth`, `promo` and cadence `content` changes. (B) A `platform_setting` row `ai_decision_mode` read through a 30-s cached reader changes `Ai.decide`: Jev-only drops escalation and shadow; a re-eval window forces shadow on every Jev decision up to a daily cap.
**Tech stack:** TypeScript, Drizzle + Postgres RLS, Vitest, pg-boss worker, Next.js App Router, `@cs/ui`.
**Spec (binding):** `docs/superpowers/specs/2026-11-13-phase-18e-social-jev-design.md` (A1–A10, B1–B6, Interfaces). Probe: `docs/research/2026-11-13-phase-18e-social-probe.md`. Owner decisions: `docs/work/phase-18e.md`.

## Global constraints
- **Wrong business is the main risk.** Only `social_account.status = 'confirmed'` rows are pulled, diffed, counted, shown or cited. Auto-confirm only when FB `website` host or IG `external_url` host (lower-case, `www.` stripped, path ignored) equals the competitor's domain host; hosts `linktr.ee`, `linkin.bio`, `beacons.ai`, `app.trackable.io`, `facebook.com`, `instagram.com` never confirm. Rejected candidates are never re-suggested.
- **Vendor:** ScrapeCreators only (`x-api-key`, base `https://api.scrapecreators.com`), through `vendors/scrapecreators.ts` + limiter + `vendor_call` ledger (`units` = credits, `costUsd` null). Endpoints: `/v1/facebook/adLibrary/search/companies?query=`, `/v1/facebook/profile?url=` (+`include_gated_profile=true` retry when the response says "Profile is private"), `/v1/facebook/profile/posts?pageId=` (3/page, `cursor`), `/v1/instagram/profile?handle=&trim=true`. Client text says "Facebook"/"Instagram", never the vendor.
- **Budget:** FB posts: stop at the first post with `post_id` already stored or `publishTime` older than the account's newest stored post, or after **3** pages. Discovery ≤ 2 credits per competitor; `find_social_accounts` ≤ 1 per competitor per 7 days. Schedulers use `clientWorkAllowed` ∧ `agencyServiceable`; pack flag `social` off ⇒ no calls.
- **Changes:** all social changes are **brief-only** and whole-business (`WHOLE_BUSINESS_TYPES`/`BRIEF_ONLY_TYPES` handling via `details.surface = 'social'`); first processed pull per account = silent baseline; posts older than 21 days at first sight never become changes.
- **Jev-only (B):** default row `{ mode: 'jev_only', reevalUntil: null }`; missing row or read error ⇒ `cascade`. `ask_guard_decisions` always cascades. Jev error/timeout ⇒ LLM fallback as today, ledger operation suffixed `:jev_down`. Re-eval: shadow on every Jev-primary decision while `now < reevalUntil`, sample reason `'reeval'`, ≤ **2,000** shadow LLM calls per UTC day (count from ledger rows `operation like '%:reeval'` today).
- RLS: `social_account`, `social_post` = `global_public` (service-role writes; SELECT via `app_competitor_visible(competitor_id)`). Agency confirm/reject = registered write tool, audited, competitor must be visible to the caller (else `not_found`).
- Web reads only via registered tools; writes via `runTool`; page refusals 404; out-of-scope ⇒ `not_found`. Competitor page keeps ≤ 8 app DB stages (`profile-gate.sh`); design system v1 (sections, 36 px controls, 390 px phone).
- New tools ⇒ `ISOLATION_FIXTURES`, `channels.test.ts`, MCP lists, `access-marks` snapshot + 8b doc, Ask label, demo coverage. New tables ⇒ `TABLE_CLASS` + world rows. `eval:replay` miss ⇒ re-record in this branch (≤ $5; owner rule: cheapest route, stop on 402).
- Copy marked "(draft → copy review)"; agents never sign `signoff.json`. Never edit applied migrations; migration = next free number (**0110** today) via `pnpm --filter @cs/db generate --name=social_jev`, then hand-append RLS/backfill SQL (db `CLAUDE.md`).
- Commits end `Co-Authored-By: <your model> <noreply@anthropic.com>`; LF only. Read `docs/gotchas-cross-cutting.md` + each touched package's `CLAUDE.md` first. Implementers run **focused** tests in the foreground only; `test:affected` + `e2e:affected` once, in the final task.

## Decisions (plan-level, ours; spec stands)
- **P1 Candidate pick:** results in vendor order; prefer `page_id ∈ competitor.meta_page_ids`; else first with `!page_is_deleted` and `normaliseName(result.name).startsWith(normaliseName(competitor.name).slice(0, 10))` (`citations/match.ts` `normaliseName`). IG handle comes from the search row's `ig_username` (or FB `links[]` `instagram.com/<h>`), confirmed by its own `external_url` or by the FB page's confirmation (same search row ⇒ same owner) — *IG inherits FB confirmation when both come from one search row*.
- **P2 Self:** the self competitor is discovered and pulled like a rival (in `SELF_SOURCES`); the agency confirms self accounts on the client's profile settings competitor page (same block).
- **P3 Stored Meta page check:** when the chosen candidate's `page_id` is in `meta_page_ids` but the website host mismatches, the account is `suggested` (not confirmed) and an `ops_alert`-free log line `social: meta page website mismatch` is written (backlog: Meta matching check). No change to `meta_page_ids`.
- **P4 Cadence windows** (per account, from `social_post.posted_at`): `started` = ≥ 3 posts in last 14 d ∧ no post in the 30 d before those 14 d; `quiet` = 0 posts in last 30 d ∧ ≥ 4 posts in the 30 d before. Emitted once per state flip, confirmed on two consecutive pulls, 30-day cooldown per account × kind (via `details.cadence`).
- **P5 Offer test:** reuse the 18b Google-post offer rule (`isOfferText` or its equivalent exported from `engine/structured/gbp-posts.ts`; export it if private). Promo summary: `Posted an offer on Facebook: "<first 120 chars>"` (draft → copy review).
- **P6 audience_growth:** same thresholds/cooldown as 18a-1 `meta-page.ts` (`diffMetaPage`), keyed per competitor × network; `details { network, followers, previous, window }`. Summary `Facebook followers 1,200 → 1,450 (+21%)` (draft).
- **P7 Scorecard `socialPosts30d`:** count of `social_post` rows with `posted_at ≥ now − 30 d` across the business's confirmed accounts; null when it has no confirmed account. Header "Social posts (30 days)", email short "Social". Drop-empty like 18d's new columns. Raise `PDF_LAYOUT_VERSION`.
- **P8 Re-eval result read:** `get_ai_decision_mode` returns, for the last/current window, per task: `samples` (decision_sample reason `reeval` in window), `agreement` (share of keys where primary and fallback answers' `value` equal), `jevBelowTau` (share of keys Jev was below τ), `llmUsd` (ledger sum `…:reeval` in window).
- **P9 Mode wiring:** `createAiFromEnv(env, config, ledger, samples, guard?, http?, decisionMode?)` — optional last param; evals pass nothing ⇒ cascade ⇒ cassettes unchanged for every existing suite.

- **Pre-flight rulings (Task 0, binding over task text below):**
  - `SOURCE_KINDS`/`DEFAULT_SOURCE_KINDS` live in `collectors/src/sources/kinds.ts`: add `'social'` to `SOURCE_KINDS`, keep it **out** of `DEFAULT_SOURCE_KINDS` (like `tripadvisor`); add `'social'` to `SELF_SOURCES` (`local/self.ts`) **and** to the hard-coded self SQL literal in `sources/due.ts` (keep in sync). `SELF_RULE_IDS` stays in `core/domain.ts` (Task 1); `SELF_WHY_IT_MATTERS` (`briefs/starting-point.ts`) gets `social_gap` in Task 1 so typecheck holds (draft text from Task 8's fact).
  - Migration: `platform_setting` needs `updated_by` (NOT NULL) → `INSERT … (key, value, updated_at, updated_by) VALUES ('ai_decision_mode', …, now(), 'migration')`. `DecisionSampleReason` is TS-only: add `'reeval'` in `db/src/schema/model-ops.ts:8` **and** `core/src/ledger.ts:42`; no SQL. `capture.source` is free text: `'social'` needs no migration.
  - ScrapeCreators has no shared request helper: Task 3 extracts `scRequest(opts, path, query, operation, scope)` from `fetchMetaAdsScrapeCreators` (same timeout 60 s, `VendorError`, `safeRecordVendorCall`, `cursor || null`) and makes the Meta fetch use it (behaviour unchanged, its tests stay green). Fixture-fetch: add routes for the 4 new paths in the `api.scrapecreators.com` branch, serving the sanitised raw fixtures.
  - **FB posts take the profile `id`** (e.g. `100064175676130`), not the ad-library `page_id`: store profile `id` in `social_account.external_id`; `scFacebookPosts(profileId, cursor?)`.
  - Differ: `DIFFERS` (private literal in `structured/vendor-diff.ts`) gets key `'social'`; one capture per account, `url = 'social:facebook:<external_id or handle>'` / `'social:instagram:<handle>'` (prev/older are matched by source+url, so per-account urls keep histories apart). Follower growth reuses `diffAudience`'s constants (`structured/meta-page.ts`: 15 % / +50 / 100 % cap / window 21–35 d, target 28, cooldown 28 d) — export them or a shared helper; blockKey `social:<network>:followers:<accountId>`. Offer rule = exported `isOfferPost` (`gbp-posts.ts`); max age `POST_MAX_AGE_DAYS` (21); ≤ `POST_MAX_SINGLE` (5) promo singles per capture.
  - Brief-only/whole-business are keyed by change type today (`score.ts:150`): extend both checks with `|| details.surface === 'social'` (Task 7), with tests.
  - Scorecard names: `ScorecardMetric` enum + the `values` object (`.default(null)`) in `scorecard.ts`; `KIND`, `HEADER`, `COLUMNS`, `DROP_WHEN_EMPTY` in `scorecard-model.ts`. `PDF_LAYOUT_VERSION` 7 → 8.
  - Worker: social is its own job, not `vendor-collect`: in `jobs/vendor.ts` schedule, a claimed `social` source enqueues `social-pull { competitorId }`; register `social-discover`/`social-pull` in `job-list.ts`; deps in `deps.ts` (`syncSocialSources`, `discoverSocial`, `pullSocial`, mirroring `syncTripadvisorSources` at `jobs/vendor.ts:41`).
  - `Ai`: no `packages/ai/src/types.ts` — types live in `ai.ts`; `keepSample` (private closure, `ai.ts:60`) gains a `reason` param (`'shadow' | 'review' | 'reeval'`).
  - `normaliseName` = `collectors/src/rivals/names.ts` `(name, city?) → string` (re-exported from rivals).
  - Access marks: no snapshot file — add new write tools to the inline list in `packages/tools/src/tools/access-marks.test.ts:15`.
  - Site: `apps/site/content/compare.ts:153` RM cell `{ mark: 'no', ledger: 'cap-social' }` → yes, plus a `cap-social` row in `docs/research/2026-10-29-phase-17c-claim-check.md`; tests `compare.test.ts`, `sources.test.ts` (Task 10).

## File structure
- **Create:** `packages/db/migrations/0110_social_jev.sql` (+ meta); `packages/db/src/schema/social.ts`; `packages/db/src/ai-decision-mode.ts` (+ test); `packages/collectors/src/social/{search,facebook,instagram,host}.ts` (+ tests, `__fixtures__/{search-companies,fb-profile,fb-posts,ig-profile}.json` from the probe shapes); `packages/engine/src/structured/social.ts` (+ test); `packages/tools/src/tools/social.ts` (+ test); `packages/tools/src/tools/platform-ai-mode.ts` (+ test); `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/social-accounts.tsx` (+ test); `apps/web/src/app/(platform)/platform/costs/_components/ai-decision-mode.tsx` (+ test); `apps/worker/src/jobs/social.ts` (+ test); `packages/demo/src/social.ts`.
- **Modify:** `packages/core/src/{domain.ts,spend.ts?}`; `packages/ai/src/{ai.ts,env.ts,decisions/cascade.ts,types.ts}`; `packages/db/src/{schema/index.ts,schema/model-ops.ts,catalog-seed.sql.ts,ledger.ts}`, `packages/db/test/{table-classes,isolation-world}.ts`; `packages/verticals/src/schema.ts`, `packs/*.yaml` (v10); `packages/collectors/src/{sources/{kinds,ensure,due}.ts,local/self.ts,vendors/scrapecreators.ts,vendors/fixture-fetch.ts,index.ts}`; `packages/engine/src/{structured/vendor-diff.ts,structured/gbp-posts.ts,score/score.ts,tag/structured.ts,briefs/{scorecard,scorecard-model,self-rules,starting-point,evidence}.ts}`; `packages/email/src/{labels.ts,templates/scorecard.tsx,previews.ts}`, `packages/core/src/pdf-layout.ts`; `packages/tools/src/{tools/{all,schemas,channels.test}.ts,workspace/labels.ts,isolation/fixtures.ts}`, access-marks snapshot, 8b doc; `packages/mcp/src/{server,integration}.test.ts`; `packages/ask/src/labels.ts`; `packages/demo/src/{seed,coverage}.ts`; `apps/worker/src/{deps.ts,job-list.ts,jobs/vendor.ts}`; `apps/web/src/server/ask.ts`; competitor page `page.tsx`; `(platform)/platform/costs/{page.tsx,actions.ts}`; `apps/site` compare row; `packages/evals/{cassettes,baselines}/ask.json`; `docs/OPS.md`; package `CLAUDE.md`s (ai, collectors, engine); `docs/work/phase-18e.md`.

## Dependencies on in-flight work (re-check at Task 0)
- None (no branch in flight). Migration **0110** (main ends `0109_events_venues`).

## Review focus (each pinned by a test in the named task)
1. **Wrong-business account reaches a client.** Task 4: `website host mismatch → suggested`, `linktr.ee never confirms`, `meta page with mismatching website → suggested`; Task 9: `suggested/rejected accounts excluded from get_social_activity`; Task 8: `suggested account never counted in socialPosts30d`.
2. **FB pagination burns credits or misses posts.** Task 5: `stops at first stored post_id`, `stops after 3 pages`, `deleted newest post → stops by publishTime`.
3. **Baseline / old posts announced as new.** Task 7: `first pull silent`, `post older than 21 d at first sight → no change`, `re-pull same posts → no new rows/changes`.
4. **Jev-only breaks a request path or the injection gate.** Task 11: `jev_only: verifier below τ → needsReview, no LLM call`, `ask_guard_decisions still escalates`, `Jev throws → LLM fallback, operation :jev_down`.
5. **Re-eval runs forever or past the cap after a restart.** Task 11: `window over → no shadow`, `2,000 reeval rows today → no shadow`; Task 12: `stop clears reevalUntil`.

---

### Task 0: Pre-flight (controller; STOP point)
**Goal:** Re-check names against `main`, fixtures at $0, baseline.
- [ ] `git fetch && git rebase origin/main`; `ls packages/db/migrations | tail -2` (rename `0110` if moved).
- [ ] Grep-confirm, fix this plan inline if drifted: `SOURCE_KINDS`/`DEFAULT_SOURCE_KINDS`/`SELF_SOURCES`; `ensureCompetitorSources`; `claimDueSources`; vendor jobs in `apps/worker/src/jobs/vendor.ts`; ScrapeCreators client exports (`vendors/scrapecreators.ts`) and fixture-fetch host map; `recordVendorCapture`; `DIFFERS`/`VENDOR_SETTLE_MINUTES` (`structured/vendor-diff.ts`); `diffMetaPage` thresholds (`structured/meta-page.ts`); offer rule in `structured/gbp-posts.ts`; `WHOLE_BUSINESS_TYPES`/`BRIEF_ONLY_TYPES`; `ScorecardMetric`/`HEADERS`/`COLUMNS`; `SELF_RULE_IDS`/`SELF_WHY_IT_MATTERS`; `PDF_LAYOUT_VERSION`; `Ai.decide` (`packages/ai/src/ai.ts:152-184`), `CascadingDecisionProvider` (`decisions/cascade.ts`), `keepSample`, `DecisionSampleReason` (`db/schema/model-ops.ts`), `createAiFromEnv` (`ai/src/env.ts`), `createAiGuard` + `platform_setting` readers (`db/src/spend-guard.ts`), spend-guard card (`(platform)/platform/costs/_components/spend-guard-settings.tsx`, `costs/actions.ts`); competitor page path; site compare row (grep `social` in `apps/site`).
- [ ] Fixtures from the probe output (public business pages only; strip `topComments` authors and profile photos): Glow Dental (FB + IG confirmed by website), Comfort Masters (Lubbock: website mismatch), Granbury Park (IG linktree), Treaty Oak (FB "Profile is private"), one FB posts page with `cursor`.
- [ ] Baseline: `pnpm typecheck`. Ledger: create `.superpowers/sdd/<plan>/progress.md`.

### Task 1: Domain, pack schema, packs v10
**Goal:** Names every later task uses.
**Files:** modify `packages/core/src/domain.ts`, `packages/verticals/src/schema.ts`, `packs/{generic,hvac_plumbing,dental,venues_attractions}.yaml`, `packages/verticals/src/packs.test.ts`, `packages/db/src/catalog-seed.sql.ts` (regenerate via `pnpm --filter @cs/verticals seed-sql`).
**Interfaces:** `SOURCE_KINDS` += `'social'`; `SELF_RULE_IDS` += `'social_gap'`; `SOCIAL_NETWORKS = ['facebook','instagram'] as const`, `SocialNetwork`; pack schema `social: z.boolean().default(false)`; all 4 packs `social: true`, `scoring.version: 10`, self rule `{ id: social_gap, params: { min_rival_posts: 4, min_rivals: 2 }, playbook: post_weekly, strength: false, weight: 0.4 }`, play `{ id: post_weekly, trigger: social_gap, effort: L, impact: M, title: "Post every week where customers scroll", template: "Post on Facebook and Instagram every week: a recent job, a team photo or an offer." }` (draft → copy review).
**Tests first:** `packs.test.ts`: every shipped pack `social: true`, version 10, `social_gap` ↔ `post_weekly`; a pack without `social` parses `false`.
**Done when:** `pnpm --filter @cs/verticals test`, `pnpm --filter @cs/core test`.

### Task 2: Migration 0110, Drizzle schema, isolation
**Goal:** Tables, RLS, packs v10 backfill, `ai_decision_mode` row.
**Files:** create `packages/db/src/schema/social.ts`, migration `0110_social_jev.sql`; modify `schema/index.ts`, `schema/model-ops.ts` (`DecisionSampleReason` += `'reeval'` if it is an enum/check), `test/table-classes.ts`, `test/isolation-world.ts`.
**Interfaces:** tables exactly as spec § Interfaces (`social_account`, `social_post`); Drizzle exports `socialAccount`, `socialPost`.
**SQL (append after generated DDL):**
```sql
ALTER TABLE social_account ENABLE ROW LEVEL SECURITY; ALTER TABLE social_account FORCE ROW LEVEL SECURITY;
CREATE POLICY social_account_select ON social_account FOR SELECT TO app_user USING (app_competitor_visible(competitor_id));
GRANT SELECT ON social_account TO app_user; GRANT SELECT, INSERT, UPDATE, DELETE ON social_account TO app_service;
-- same four statements for social_post
CREATE UNIQUE INDEX social_account_one_confirmed ON social_account (competitor_id, network) WHERE status = 'confirmed';
INSERT INTO platform_setting (key, value, updated_at) VALUES ('ai_decision_mode', '{"mode":"jev_only","reevalUntil":null}'::jsonb, now()) ON CONFLICT (key) DO NOTHING;
-- packs v10 backfill: mirror 0109's v9 backfill (jsonb_set social=true, scoring.version=10, append social_gap rule + post_weekly play) for generic, hvac_plumbing, dental, venues_attractions
```
Follow pattern: `0109_events_venues.sql` (RLS block, backfill); check the real `platform_setting` column names and the `cs_worker`/`cs_web` grants used by 0107–0109.
**Tests first:** isolation suite world rows for both tables (one per tenant's competitor + one invisible); `social backfill` test (mirror `events-backfill.test.ts`): packs at v10 with `social: true`; `ai_decision_mode` row present.
**Done when:** `pnpm --filter @cs/db test -- social isolation`.

### Task 3: Host match + vendor calls (pure + client)
**Goal:** Typed ScrapeCreators calls and the confirmation rule.
**Files:** create `packages/collectors/src/social/host.ts`, extend `vendors/scrapecreators.ts` (or `social/client.ts` using its request helper), fixture-fetch routes.
**Interfaces:**
- `siteHost(url: string | null | undefined): string | null` (lower-case, strip `www.`, null on parse fail).
- `confirmsDomain(url, competitorDomain): boolean` — false for the no-confirm hosts (Global constraints).
- `scSearchCompanies(q): Promise<ScCompany[]>`; `scFacebookProfile(url, { gated? }): Promise<ScFbProfile | { private: true }>`; `scFacebookPosts(pageId, cursor?): Promise<{ posts: ScFbPost[]; cursor: string | null }>`; `scInstagramProfile(handle): Promise<ScIgProfile | null>` (404/403 ⇒ null). Each ledgers `operation` = path tail, `units` = `credits_charged ?? 1`.
**Tests first:** `confirmsDomain('https://www.aireserv.com/granbury/?cid=x','aireserv.com') true`; `('http://www.comfortmasters.net/','comfortmastersdfw.com') false`; `('https://linktr.ee/x','linktr.ee') false`; fixture-backed parse of each endpoint; private profile → `{ private: true }`; ledger row per call with units.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/social`.

### Task 4: Discovery
**Goal:** `findSocialAccounts` + persistence.
**Files:** create `packages/collectors/src/social/search.ts` (+ test).
**Interfaces:** `discoverSocialAccounts(db, sc, competitor: { id, name, domain, metaPageIds }): Promise<{ facebook?: AccountRow; instagram?: AccountRow; credits: number }>` — search (1) → P1 pick → FB profile (1; gated retry only if private) → upsert `social_account` rows (`confirmed` + `confirmed_by 'website'` when `confirmsDomain(fb.website)`, else `suggested`); IG handle from `ig_username` or FB `links`; IG status = FB status when from the same row (P1), else `suggested`. Skip candidates whose `(network, handle)` is `rejected` for this competitor. No candidate ⇒ no rows.
**Tests first:** `website match → facebook + instagram confirmed`; `website host mismatch → suggested`; `linktr.ee never confirms`; `meta page with mismatching website → suggested` (P3); `rejected handle not re-suggested`; `no search result → nothing, 1 credit`; `private FB → gated retry, followers only`.
**Done when:** `vitest run src/social/search`.

### Task 5: Weekly pull
**Goal:** Captures, posts, follower observations per confirmed account.
**Files:** create `packages/collectors/src/social/{facebook,instagram}.ts` (+ tests).
**Interfaces:** `pullSocial(db, sc, competitorId): Promise<{ captures: string[]; credits: number }>` — per confirmed account: FB: profile → posts loop (stop rules, Global constraints) → one vendor_json capture (`source 'social'`, `url 'social:facebook'`, body = profile + new posts) → insert `social_post` (`ON CONFLICT (network, post_id) DO NOTHING`) → observation `social_profile` `{ network, followers, likes, posts? }` keyed `network`; IG: profile → capture `social:instagram` → posts from the 12 recent → observation. Updates `last_pulled_at`. Gated accounts: followers only, no posts.
**Tests first:** `stops at first stored post_id`; `stops after 3 pages`; `deleted newest post → stops by publishTime`; `ig 12 posts inserted once on re-pull`; `suggested account not pulled`; `gated → observation only`; capture per account with evidence.
**Done when:** `vitest run src/social`.

### Task 6: Sources, scheduling, worker jobs
**Goal:** Wire discovery and weekly pull into the worker.
**Files:** modify `sources/{kinds,ensure,due}.ts`, `local/self.ts`, `apps/worker/src/{job-list.ts,deps.ts,jobs/vendor.ts}`; create `apps/worker/src/jobs/social.ts` (+ test).
**Behaviour:** `social` ∈ `SELF_SOURCES`; `ensureCompetitorSources` adds `social` only when a tracking active client's pack has `social: true` (mirror 18d `syncTripadvisorSources` style: `syncSocialSources(db)` each `vendor-schedule` tick activates/deactivates). Job `social-discover { competitorId }` enqueued when a competitor without accounts first gets a `social` source and by the tool (Task 9); job `social-pull` runs from the due `social` source weekly. Both check `clientWorkAllowed` for at least one tracking client.
**Tests first:** `pack without social → no source`; `paused client only → no pull`; `discover enqueued once per competitor`; job handlers call Task 4/5 with deps.
**Done when:** `pnpm --filter @cs/worker exec vitest run src/jobs/social`, collectors sources tests.

### Task 7: `diffSocial` and change wiring
**Goal:** Social captures → brief-only changes.
**Files:** create `packages/engine/src/structured/social.ts` (+ test); modify `structured/vendor-diff.ts` (`DIFFERS['social']`), `structured/gbp-posts.ts` (export offer test), `score/score.ts`, `tag/structured.ts`.
**Interfaces:** `diffSocial(ctx: { competitorId, network, capture, prevCapture | null, posts: SocialPostRow[], followersHistory: { at, followers }[], priorChanges }): ChangeDraft[]`; `socialCadence(posts, now): 'started' | 'quiet' | null` (P4).
**Behaviour:** baseline silent; new offer posts → `promo` (`details { surface: 'social', network, postId, url }`, evidence = capture); follower growth → `audience_growth` per P6; cadence per P4 → `content` (`details { surface: 'social', network, cadence }`). Score: `details.surface === 'social'` ⇒ whole-business and brief-only (never alert). Tagging rules-only (no `ai.decide`), like 18d `event_listed`.
**Tests first:** `first pull silent`; `post older than 21 d at first sight → no change`; `re-pull same posts → no change`; `offer post → promo with evidence`; `non-offer post → nothing`; `quiet after 4 posts → content once, confirmed on 2nd pull, cooldown 30 d`; `followers +21% → audience_growth facebook`; `social change never routes to alert`.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/structured/social src/score`.

### Task 8: Scorecard, self rule, brief surfaces
**Goal:** `socialPosts30d`, `social_gap`, labels.
**Files:** modify `briefs/{scorecard,scorecard-model,self-rules,starting-point,evidence}.ts`, `packages/email/src/{labels.ts,templates/scorecard.tsx,previews.ts}`, `packages/core/src/pdf-layout.ts`.
**Behaviour:** P7 metric; `social_gap` fires when self has a confirmed account, 0 posts in 30 d, and ≥ `min_rivals` rivals with ≥ `min_rival_posts` posts in 30 d; fact text `"<n> rivals post weekly on Facebook or Instagram; you haven't posted in 30 days."` (draft → copy review); evidence = rivals' latest social captures.
**Tests first:** `suggested account never counted in socialPosts30d`; `no confirmed account → null, column dropped`; `social_gap fires / doesn't with 1 rival`; email preview renders "Social".
**Done when:** engine briefs + email tests.

### Task 9: Tools
**Goal:** Read + agency writes.
**Files:** create `packages/tools/src/tools/social.ts` (+ test); register in `all.ts`, `schemas.ts`, isolation fixtures, channels test, MCP tests, access-marks, 8b doc, Ask labels.
**Interfaces:** `get_social_activity { clientId } → { businesses: { competitorId, name, self, accounts: { network, handle, url, followers, followers90dChange, posts30d, lastPostAt, evidenceId }[], offers: { network, postedAt, text, url, evidenceId }[] }[] }` (web/mcp/ask, confirmed only, `forChannel` names); `list_social_accounts { competitorId } → accounts incl. suggested/rejected` (web, agency roles); `confirm_social_account { competitorId, accountId?, url?, decision: 'confirm'|'reject' }` (web write; `url` ⇒ parse facebook.com/<x> or instagram.com/<x>, store confirmed `confirmed_by 'agency'`; confirming demotes another confirmed row of that network to `rejected`); `find_social_accounts { competitorId }` (web write; `rate_limited` within 7 d; enqueues `social-discover`).
**Tests first:** `suggested/rejected accounts excluded from get_social_activity`; `out-of-scope client → not_found`; `confirm via pasted url`; `confirm demotes previous`; `find twice in 7 d → rate_limited`; isolation fixture passes.
**Done when:** `pnpm --filter @cs/tools exec vitest run src/tools/social src/isolation src/tools/channels`.

### Task 10: Competitor page block, demo, site row
**Goal:** "Social accounts" block on the competitor page.
**Files:** create `social-accounts.tsx` (+ test); modify competitor `page.tsx`, `actions.ts`; `packages/demo/src/{social,seed,coverage}.ts`; `apps/site` compare row "social" → yes (with its claims ledger entry if `check:facts` requires).
**Behaviour:** per network row: handle link, followers, last post date (viewer tz), status chip (Confirmed / Suggested / —); Suggested ⇒ "Confirm" + "Not them"; none ⇒ "Find accounts" + "Add link" input. Reads in the page's existing `Promise.all`. Copy (draft → copy review): section "Social accounts", empty "No Facebook or Instagram account found yet."
**Tests first:** page test renders confirmed + suggested rows; action calls `runTool('confirm_social_account')`; profile gate ≤ 8 stages on the competitor page.
**Done when:** web focused tests + `bash apps/web/scripts/profile-gate.sh --seed` for the competitor page.

### Task 11: Jev-only in `@cs/ai`
**Goal:** Mode-aware `Ai.decide`.
**Files:** modify `packages/ai/src/{ai.ts,env.ts,decisions/cascade.ts}`; create `packages/db/src/ai-decision-mode.ts` (+ test).
**Interfaces:** `AiDecisionMode = { mode: 'jev_only' | 'cascade'; reevalUntil: string | null }`; `readAiDecisionMode(db): Promise<AiDecisionMode>` (zod, default cascade); `createDecisionModeReader(db, ttlMs = 30_000): () => Promise<AiDecisionMode>` (fails to cascade); `writeAiDecisionMode(db, value, userId)`; `createAiFromEnv(..., decisionMode?)` (P9); `REEVAL_DAILY_CALL_CAP = 2000`.
**Behaviour (Jev-primary tasks only):** `cascade` ⇒ today; `jev_only` ⇒ `CascadingDecisionProvider(jev, fallback only for errors, τ)` — below-τ keys → `needsReview`, no shadow; `ask_guard_decisions` ⇒ today; Jev throw/timeout ⇒ LLM, ledger op `<task>:jev_down`; re-eval window active and today's `:reeval` count < cap ⇒ `decideShadow`, sample reason `'reeval'`, ledger op `llm_decisions:reeval`.
**Tests first:** `jev_only: verifier below τ → needsReview, no LLM call`; `ask_guard_decisions still escalates`; `Jev throws → LLM fallback, operation :jev_down`; `reeval active → both answer, sample reason reeval`; `window over → no shadow`; `2,000 reeval rows today → no shadow`; `no reader → cascade (unchanged)`; reader cache 30 s + fail-to-cascade.
**Done when:** `pnpm --filter @cs/ai test`, `pnpm --filter @cs/db exec vitest run src/ai-decision-mode`.

### Task 12: Mode tools, staff card, wiring
**Goal:** Staff control + results.
**Files:** create `packages/tools/src/tools/platform-ai-mode.ts` (+ test), `costs/_components/ai-decision-mode.tsx` (+ test); modify `costs/page.tsx`, `costs/actions.ts`, `apps/worker/src/deps.ts`, `apps/web/src/server/ask.ts`.
**Interfaces:** `get_ai_decision_mode {} → { mode, reevalUntil, window: { from, to, tasks: { task, samples, agreement, jevBelowTau, llmUsd }[] } | null }` (P8); `set_ai_decision_mode { mode?: 'jev_only'|'cascade', reeval?: 'start'|'stop' }` (start ⇒ `reevalUntil = now + 7 d`; stop ⇒ null). Platform owner/operator only (as spend-guard tools); audited; both registered with isolation fixtures.
**Card copy (draft → copy review):** title "AI decisions"; options "Jev only" / "Jev with LLM backup"; button "Re-evaluate with all models for 7 days" / "Stop re-evaluation"; table headers "Task, Samples, Agreement, Jev unsure, LLM cost".
**Tests first:** `stop clears reevalUntil`; `start sets +7 d`; agreement computed from fixture samples; non-staff → `not_found`; card renders mode + results; worker and web deps pass the reader.
**Done when:** tools + web focused tests.

### Task 13: Evals, copy, docs
**Goal:** Replay green, docs current.
- [ ] `pnpm eval:replay`; a miss (new `get_social_activity` in the Ask tool list) ⇒ `pnpm --filter @cs/evals eval record --suite ask --max-usd 5` (state cost first; stop on 402), then baseline per `packages/evals/CLAUDE.md`.
- [ ] `docs/OPS.md` § "Social (18e)" (discovery, confirm, costs, runbook SQL for suggested accounts) and § "AI decision mode" (switch, re-eval window, reading results); package `CLAUDE.md` gotchas (ai, collectors, engine); `docs/work/phase-18e.md` interfaces/status; help copy for the competitor block if `help/copy` covers that page.
**Done when:** `pnpm eval:replay` passes; `pnpm copy:status` lists the new drafts.

### Task 14: Final review (controller, top model)
- [ ] `pnpm typecheck`; `pnpm test:affected --base main`; `pnpm --filter @cs/web e2e:affected --full` (one at a time). Whole-branch review on the most capable model, one fix wave, then wrap-up; merge only on the owner's go-ahead.
