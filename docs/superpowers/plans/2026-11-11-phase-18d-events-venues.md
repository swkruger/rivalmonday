# Phase 18d — Events & venues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (implementer + reviewer per task, final review on the top model, one fix wave). Steps use `- [ ]`.

**Goal:** Tell an owner when a rival **lists** an event (Google's venue panel now; website Event markup once web monitoring is on, which also gives cancelled / postponed / sold out; Meta ad events when present), as Minor-to-Notable brief lines, a scorecard column, an `event_gap` starting-point finding and a client **Events** page that appears only when relevant. Add a **venues & attractions** seed vertical with Tripadvisor ratings and an `events_venues` directory group.
**Architecture:** The Sunday rank scan runs one organic search per business (`"<name> <city>"`) only for packs with `events.panel`, and stores the knowledge-panel "Events" list as a `gbp:events` capture + `venue_panel` observation. A rules-only `listed_events` stage (subject = capture) turns panel / JSON-LD / Meta candidates into global `listed_event` rows and `event_listed` changes. A weekly Tripadvisor search task (venues only) stores a rating observation; `diffTripadvisor` emits the existing `rating_change`. Two tools feed web/MCP/Friday and the nav flag.
**Tech stack:** TypeScript, Drizzle + Postgres RLS, Vitest, pg-boss worker, Next.js App Router, `@cs/ui`.
**Spec (binding):** `docs/superpowers/specs/2026-11-11-phase-18d-events-design.md` (D1–D14, Interfaces, Copy). Probe: `docs/research/2026-11-11-phase-18d-events-probe.md`. Owner decisions: `docs/work/phase-18d.md`.

## Global constraints
- **No evidence, no claim; never "removed an event"; vanishing never means cancelled.** Panel and Meta give *announced* only; cancelled / postponed / sold_out only from an Event JSON-LD flip from `scheduled` with `start_date ≥ today`, once per key × lifecycle (D7). Past events expire silently. Self-only competitors get rows, never changes. First processed capture per competitor × source = silent baseline.
- **Panel (D2/D3):** `/serp/google/organic/live/advanced`, depth 10, client-centre `location_coordinate`, keyword `"<name> <city>"`, one per self + tracked rival, only when the pack has `events.panel` (venues on; generic/HVAC/dental off ⇒ $0). ≤ 3 rows from `knowledge_graph_list_item` "Events" `.items`. Used only when the panel title name-matches the business. An ok panel capture < 6 days old (any client) is reused. A failure skips that business, never the scan. Capture `source 'google_business_profile'`, `url GBP_EVENTS_URL = 'gbp:events'`; event `url` = goto link's `url` param when http(s), else null.
- **Dates (D4):** panel `"Fri, Nov 13, 8:00 PM"` → year = first of {capture year, +1} with date ≥ capture date **and** matching weekday, in the triggering client's timezone; none ⇒ dropped. JSON-LD date as written; UTC-only (Meta) → `America/Chicago`. Announced only when `start_date` ∈ [capture date, +365 d].
- **Dedupe (D5/D8):** key `(competitor_id, name_norm, start_date)`; cross-source: date ±1 day and one name's tokens ⊆ the other's ⇒ one row, sources appended. Same `name_norm` starting in the previous 35 days ⇒ `series = true`, no change. ≤ 5 single announcements per capture + one aggregate (`event:more`, `count`).
- **Grading (D9):** `event_listed` ∈ `WHOLE_BUSINESS_TYPES` + `BRIEF_ONLY_TYPES` (never an alert). Size: announced ∧ ticketed → 1; aggregate `curve(count, size.events_for_full = 5)`; else default. Weights generic 0.5, hvac_plumbing/dental 0.35, venues 0.8 (venues `rating_change` 0.8). Topic `offers`.
- **Tripadvisor (D12/D13):** venues only (`tripadvisor: true`); weekly per rival + self; `business_data/tripadvisor/search` task_post/task_get ≈ $0.00075/task. Exactly one name (+ city) match ⇒ store `competitor.tripadvisor_id/url`; ambiguous or no match ⇒ **no observation (never 0)**. `rating_change` with `details.platform 'tripadvisor'` (≥ `RATING_CHANGE_MIN`); reputation slump keeps Google ratings only; no `review_spike`.
- **Cost:** panel ≈ $0.012/client/week, Tripadvisor ≈ $0.005/client/week; existing clients $0. Panel inside `checkRankScanBudget`; all calls via `DataForSeoClient` (limiter + ledger); schedulers `clientWorkAllowed` ∧ `agencyServiceable`. No new vendor, no model calls in any 18d stage. Client text never names DataForSEO ("Google", "Tripadvisor", "Meta" are platform names already used in client copy).
- RLS: `listed_event` = `global_public` (service-role writes, SELECT via `app_competitor_visible`). New `competitor` columns are service-role written.
- Web reads only via registered tools; refusals 404; out-of-scope client ⇒ `not_found`. Page: `PageHeader` + help key + two guides, `Suspense` (no `loading.tsx`), ≤ 8 app DB stages, design system v1 (one sheet, sections, 36 px controls, 390 px phone).
- New tools ⇒ `ISOLATION_FIXTURES`, `channels.test.ts`, MCP lists, `access-marks` snapshot + 8b doc, Ask label, demo coverage. New table ⇒ `TABLE_CLASS` + world rows. `eval:replay` miss ⇒ re-record in this branch (≤ $5).
- Copy exactly as spec § Copy; drafts marked "(draft → copy review)"; agents never sign `signoff.json`. Never edit applied migrations; migration = next free number (**0109** today).
- Commits end `Co-Authored-By: <your model> <noreply@anthropic.com>`; LF only (`git ls-files --eol | grep crlf` empty). Read `docs/gotchas-cross-cutting.md` + each touched package's `CLAUDE.md` first.
- Tests: implementers run **focused** tests in the foreground only; reviewers run none; `test:affected` + `e2e:affected` once, in the final task.

## Decisions (plan-level, ours; spec D1–D14 stand)
- **P1 Menu tool is client-list shaped.** The shell reads nav data in the layout, but the client is URL-derived on the client side, so a `{ clientId } → { show }` read cannot follow client switches. `get_client_events_menu { clientId?: uuid } → { clientIds: uuid[] }`: no id = every visible client with the menu; with an id = that client or `[]` (out of scope ⇒ `not_found`). The shell reads it in the same `Promise.all` as `navCounts`; `NavRoleFlags.eventsClientIds?: string[]`; `clientNav` shows "Events" when its client id is in it.
- **P2 Panel timezone in an observation.** The stage's subject is a global capture, so the scan writes observation `kind 'venue_panel'`, `key 'events'`, `data { timeZone, title, events: { title, subtitle, url }[] }` beside the capture (`timeZone` = the scanning client's `client.timezone`). `panelDate` reads it.
- **P3 Panel name match** = `nameHit(kg.title, business.name, city)` (`citations/match.ts`, 18c C6 containment with the generic-name guard). `GENERIC_NAME_TOKENS` += `venue, venues, events, event, hall, bar, brewery, winery, distillery, lounge, club, room, music, live, center` (stricter only).
- **P4 Merge guard:** fuzzy merge needs the smaller token set to be ≥ 50 % of the larger (so "Trivia" ≈ "Trivia Night", "Party" ≠ "Halloween Costume Party").
- **P5 Measured & counted:** `eventsListed30d` = the business's `listed_event` rows with `series = false` and `first_seen_at ≥ now − 30 d`; null unless a done `listed_events` run exists on an ok `gbp:events` or `web` capture of it (D11). `tripadvisorRating` = latest `tripadvisor` observation `rating`, else null.
- **P6 Drop-empty columns** apply only to the two new scorecard columns (existing columns keep rendering as today). Raise `PDF_LAYOUT_VERSION`.
- **P7 Supersede guard:** `supersedePriorChanges` (capture scope) also skips `details.changeType = 'event_listed'` (like `site_feature`), so a later web/vendor diff version bump never supersedes stage rows.
- **P8 Tripadvisor sources:** `SOURCE_KINDS` += `'tripadvisor'` but `ensureCompetitorSources`' default becomes `DEFAULT_SOURCE_KINDS` (all except `tripadvisor`). `syncTripadvisorSources(db)` (each `vendor-schedule` tick) inserts/activates rows for competitors an opted-in active client tracks or owns as self, and deactivates the rest.
- **P9 Plays:** `PLAYBOOK_VARS` += `date` (fallback "that date"), `event` (fallback "their event"); `playbookVars` fills them from `details.startDate` (`Mon D`) / `details.eventName`. Venue play triggers: `counter_programme` → `event_listed`, `early_bird` → `promo`, `sold_out_waitlist` → `event_listed`; `playbookFor` picks `sold_out_waitlist` for an `event_listed` candidate whose lifecycle is `sold_out`, else the first other `event_listed` play. `list_your_events` effort L, impact M; venue plays effort L/M, impact M.
- **P10 Runbooks unchanged:** the venues pack lists its own plays, so `packUsesGenericPlays` is false and venues clients use the legacy pack path / `legacyClientItems` tailoring base. The platform runbook (seeded once from generic) does not gain `event_gap` (backlog: runbook sync).
- **P11 Rank scan deps** gain `packs?: PackLoader`; `estimateRankScanUsd(c, { search?, panelBusinesses? })`. The manual "Scan now" estimate in `tools/rank-scan.ts` stays maps + search (panel ≤ $0.008; `scanRankings` re-checks the full estimate).
- **P12 Migration tooling:** table/columns via plain `pnpm --filter @cs/db generate --name=events_venues` (db `CLAUDE.md`: `--custom` leaves the snapshot stale), then hand-append RLS, backfill and seed SQL to the same file.

## File structure
- **Create:** `packages/db/migrations/0109_events_venues.sql` (+ meta); `packages/db/src/schema/listed-events.ts`; `packages/db/src/events-backfill.test.ts`; `packages/verticals/packs/venues_attractions.yaml`; `packages/collectors/src/tripadvisor/{parse,search}.ts` (+ tests, `__fixtures__/tripadvisor-search.json`); `packages/collectors/src/rankings/__fixtures__/serp-venue-panel.json`; `packages/collectors/src/web/__fixtures__/event-jsonld.html`; `packages/engine/src/listed-events/{normalise,candidates,merge,stage,counts}.ts` (+ tests); `packages/engine/src/structured/tripadvisor.ts` (+ test); `packages/tools/src/tools/listed-events.ts` (+ test); `apps/web/src/app/(app)/c/[clientId]/events/{page.tsx,page.test.tsx,events-view.tsx}`; `docs/help/pages/client.events.{client,agency}.md`; `packages/demo/src/listed-events.ts`.
- **Modify:** `packages/core/src/{domain.ts,brief-report.ts}`; `packages/verticals/src/{schema.ts,citations.ts,packs.test.ts,citations.test.ts}`, `packs/{generic,hvac_plumbing,dental}.yaml`; `packages/db/src/{schema/index.ts,schema/tenancy.ts,schema/engine.ts,catalog-seed.sql.ts}`, `packages/db/test/{table-classes,isolation-world}.ts`; `packages/collectors/src/{rankings/{serp,scan,budget}.ts,web/markup.ts,citations/match.ts,sources/{kinds,ensure,due}.ts,local/self.ts,reviews/collect.ts,vendors/fixture-fetch.ts,index.ts}`; `packages/engine/src/{sweep.ts,drain.ts,index.ts,events/retract.ts,structured/vendor-diff.ts,score/{score,score-stage}.ts,tag/structured.ts,moves/rules.ts,briefs/{scorecard,scorecard-model,self-rules,starting-point,evidence,playbooks}.ts}`; `packages/email/src/{labels.ts,templates/scorecard.tsx,previews.ts}`, `packages/core/src/pdf-layout.ts`; `packages/tools/src/{tools/{all,schemas,channels.test}.ts,workspace/labels.ts,isolation/fixtures.ts}`, `access-marks` snapshot, `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; `packages/mcp/src/{server,integration}.test.ts`; `packages/ask/src/labels.ts`; `packages/demo/src/{seed,coverage}.ts`; `apps/worker/src/{deps.ts,job-list.ts,jobs/engine.ts,jobs/vendor.ts}`; web `components/shell/{nav-items.ts,nav-link.tsx,app-shell.tsx}`, `server/nav.ts`, `help/copy/client.ts`, `lib/labels.ts`, `(platform)/platform/verticals/catalog-queue.tsx`; `packages/evals/{cassettes,baselines}/ask.json`; `docs/OPS.md`; package `CLAUDE.md`s (collectors, engine, verticals); `docs/work/phase-18d.md`.

## Dependencies on in-flight work (re-check at Task 0)
- None: no other branch is in flight (`git branch -a --no-merged main` = two stale research-doc remotes). Migration = next free number at execution time, currently **0109** (main ends `0108_listing_fixes`).

## Review focus (each pinned by a test in the named task)
1. **A panel that belongs to a different business** (query hits a neighbour, a hotel panel, a chain, a generic name like "The Event Center") is stored as the rival's events. Task 5: `panel of another business is ignored`, `generic venue name needs exact title`; Task 4: `no knowledge_graph → knowledge null`.
2. **Year inference around Dec/Jan, weekday mismatch, client timezone.** Task 7: `Dec 28 capture, "Sat, Jan 2" → next year`, `weekday mismatch → null`, `Dec 31 23:30 Chicago keeps local date`, `Feb 29 non-leap → next valid year or null`.
3. **Duplicate events across sources, series, retries and a second client's reused capture.** Task 8: `panel + JSON-LD ±1 day = one row, sources merged`, `"Party" ≠ "Halloween Costume Party"`; Task 9: `weekly residency is series, no change`, `rerun idempotent`, `reused panel capture no second change`, `6 announcements = 5 singles + 1 aggregate`.
4. **Tripadvisor ambiguous / no match / stored id missing becomes 0 or another venue's rating.** Task 10a: `two name+city matches → null`, `name match in another city → null`; Task 10b: `no match → no observation, no id`, `stored id absent → no observation`; Task 12: `tripadvisorRating null when unmatched, column dropped`.
5. **HVAC/dental regressions: extra page stage, empty columns, $0 guarantee.** Task 5: `pack without events.panel makes no extra call, estimate unchanged`; Task 12: `hvac scorecard has no events/tripadvisor column`; Task 13: `menu off for hvac without events`; Task 14: nav hidden without flag + profile gate on 3 pages.

---

### Task 0: Pre-flight (controller; STOP point)
**Goal:** Re-check every name in this plan against `main`, set the migration number, capture fixtures at $0, run the baseline.
- [x] `git fetch && git rebase origin/main`; `git branch -a --no-merged main`; `ls packages/db/migrations | tail -2` → rename `0109_events_venues` everywhere if the number moved.
- [ ] Grep-confirm (fix this plan inline if drifted): `CHANGE_TYPES`/`CHANNELS`/`SELF_RULE_IDS` (`core/domain.ts`); `topicOf` default `'offers'` (`core/brief-report.ts`); `SOURCE_KINDS` (`collectors/sources/kinds.ts`); `ensureCompetitorSources` default; `claimDueSources` self literal = `SELF_SOURCES`; `collectReadyTasks` kind union (`reviews/collect.ts`); `parseSerp`/`serpSearch`/`SERP_CALL_USD` (`rankings/serp.ts`); `scanRankings`/`searchKeywords` (`rankings/scan.ts`); `estimateRankScanUsd(c, opts)`/`checkRankScanBudget`; `recordVendorCapture` (url param); `GBP_POSTS_URL`, `diffGbpCapture`, `DIFFERS`, `VENDOR_SETTLE_MINUTES` (`engine/structured/vendor-diff.ts`); `nameHit`/`normaliseName`/`cityFromAddress`/`GENERIC_NAME_TOKENS` (`citations/match.ts`); `jsonLdOffers`/`markupSha` (`web/markup.ts`); `runStage`, `supersedePriorChanges` scope; `detected_change_unique (after_capture_id, kind, block_key, stage_version)`; `WHOLE_BUSINESS_TYPES`/`BRIEF_ONLY_TYPES`/`sizeFactor` (`score/score.ts`); `detailsSignature` (`score/score-stage.ts`); `RATING_CHANGE_MIN`/`implausibleVotesDrop` (`structured/gbp.ts`); reputation slump in `moves/rules.ts`; `postCounts30d`/`postsEvidenceIds`; `ScorecardMetric` + `scorecard-model.ts` `HEADERS/COLUMNS`; email `templates/scorecard.tsx` short-label map; `PLAYBOOK_VARS`/`playbookFor`; `SELF_WHY_IT_MATTERS`; `navCounts`/`startShellReads`/`NavRoleFlags`/`clientNav`; `CITATION_STATUS` in `lib/labels.ts`; `GROUP_LABELS` (`catalog-queue.tsx`); an existing "local date in a time zone" helper (grep `timeZone:` in `@cs/core`, `engine/briefs`) for Task 6.
- [ ] **Fixtures at $0** (sandbox `sandbox.dataforseo.com`): one organic advanced call and one `tripadvisor/search` task_post → task_get; confirm the Tripadvisor task params (`location_code` vs `location_name`). Where the sandbox lacks a knowledge panel or real rows, hand-build the fixtures from the probe's field lists (public venue data only): `serp-venue-panel.json` (KG title "Mohawk", Events list of 3 with goto urls), `tripadvisor-search.json` (Treaty Oak Distilling 4.4/113 with the probe `url_path`, a second same-name item in another city, Emo's absent).
- [ ] **Hand-check** the five `events_venues` `add_listing_url`s in a browser; record them in the work file.
- [ ] Baseline: `pnpm --filter @cs/verticals exec vitest run`; `pnpm --filter @cs/collectors exec vitest run src/rankings src/citations/match.test.ts`; `npx vitest run src/structured src/briefs/self-rules` (engine dir).
**Done when:** plan names confirmed or fixed, fixtures saved, baseline green, controller has a go for Task 1.

### Task 1: Domain, pack schema, YAML packs (v9 + venues)
**Goal:** New enums, pack fields, citation group and play vars exist; four shipped packs parse.
**Files:** `packages/core/src/{domain.ts,brief-report.ts}`; `packages/verticals/src/{schema.ts,citations.ts,citations.test.ts,packs.test.ts}`; `packs/{generic,hvac_plumbing,dental}.yaml`; create `packs/venues_attractions.yaml`; `packages/engine/src/briefs/{playbooks.ts,starting-point.ts}` (+ tests); web `catalog-queue.tsx` (`GROUP_LABELS.events_venues = 'Events and venues'`, draft → copy review).
**Interfaces:**
```ts
CHANGE_TYPES += 'event_listed'; SELF_RULE_IDS += 'event_gap'; CHANNELS += 'tripadvisor';
// topicOf: explicit `case 'event_listed': return 'offers';`
CITATION_GROUPS = ['general', 'home_services', 'dental_health', 'events_venues'];
// schema: events: z.strictObject({ menu: z.boolean().default(false), panel: z.boolean().default(false) }).prefault({});
//         tripadvisor: z.boolean().default(false); scoring.size.events_for_full: z.number().positive().default(5)
PLAYBOOK_VARS += 'date', 'event'; // P9 fallbacks
export const EVENT_LIFECYCLES = ['announced', 'cancelled', 'postponed', 'sold_out'] as const; // @cs/core
```
**Behaviour:**
- All three shipped YAMLs: `type_weights.event_listed` (0.5 generic, 0.35 hvac/dental), `scoring.version: 9`, self rule `{ id: event_gap, weight: 0.4, playbook: list_your_events, params: { min_rival_events: 2 } }`, play `list_your_events` (trigger `event_gap`, L/M, copy verbatim). `generic.yaml` `citations.directory_groups.events_venues` = tripadvisor.com, theknot.com, eventbrite.com, peerspace.com, weddingwire.com (labels Tripadvisor, The Knot, Eventbrite, Peerspace, WeddingWire; `add_listing_url` = https://www.tripadvisor.com/GetListedNew, https://www.theknot.com/vendors, https://www.eventbrite.com/organizer/overview/, https://www.peerspace.com/host, https://www.weddingwire.com/vendors; see work file Pre-flight).
- `venues_attractions.yaml`: a full standalone pack per spec § Pack (name "Venues & attractions", `audience_noun: guests`, version 1, the 8 categories + 4 related, `events {menu: true, panel: true}`, `tripadvisor: true`, `citations.groups [general, events_venues]`, generic weights with `event_listed 0.8`, `rating_change 0.8`; topics atmosphere, staff, value, sound_comfort "Sound & comfort", cleanliness, booking_ease "Booking ease" with one-line descriptions; services private_events, live_music, weddings, corporate_events, tickets_admission, group_packages, food_drink, tours_tastings (names + aliases, draft → copy review); discovery seed keywords `event venue, live music, wedding venue, escape room, things to do`, generic grid/tiers/cap; playbooks = generic's + `counter_programme`, `early_bird`, `sold_out_waitlist` (P9, copy verbatim); self_rules = generic's + `event_gap`).
- `SELF_WHY_IT_MATTERS.event_gap = 'People look on Google for something to do, so events your rivals list can win the night out you could have hosted.'` (draft → copy review). `playbookVars`/`playbookFor` per P9.
**Tests (first):** each of the four packs parses standalone and via `assemblePack(generic ⊕ pack)`; v9, weights as above, `event_gap` + `list_your_events` (effort/impact set); venues `events`, `tripadvisor` true, others false; `citationCatalogue(venues ⊕ generic)` = 11 hosts incl. `tripadvisor.com`; `unknownPlaybookVars` of every new template = `[]`; `renderPlaybook(counter_programme, {competitor:'Mohawk', date:'Nov 13'})` verbatim; `playbookFor` sold_out → `sold_out_waitlist`, announced → `counter_programme`; `topicOf` covers every `CHANGE_TYPES` entry.
**Done when:** `pnpm --filter @cs/verticals exec vitest run`; `pnpm --filter @cs/core exec vitest run`; `npx vitest run src/briefs/playbooks src/briefs/starting-point` (engine dir); `npx turbo run typecheck --concurrency=1 --filter=@cs/core --filter=@cs/verticals --filter=@cs/engine --filter=@cs/web`.

### Task 2: Migration, Drizzle schema, isolation
**Goal:** `listed_event` with RLS, `competitor` Tripadvisor columns, isolation coverage.
**Files:** `packages/db/migrations/0109_events_venues.sql` (+ `meta/`), create `packages/db/src/schema/listed-events.ts` (export in `schema/index.ts`), `schema/tenancy.ts` (`competitor.tripadvisorId/tripadvisorUrl`), `schema/engine.ts` (`ChangeDetails` += `lifecycle?, eventKey?, eventName?, startDate?, ticketed?, listedEventId?, source?, platform?: 'google' | 'tripadvisor'`), `packages/db/test/{table-classes,isolation-world}.ts`.
**Interfaces:** Drizzle `listedEvent` (camelCase of the columns); `type ListedEventStatus = 'scheduled' | 'cancelled' | 'postponed' | 'sold_out'`; `type ListedEventSource = 'web' | 'meta_ads' | 'google_panel'`.
**Migration (P12: generate, then hand-append):**
```sql
-- generated: CREATE TABLE listed_event (... exactly spec § Migration columns, checks and listed_event_key_unique ...),
--            CREATE INDEX listed_event_upcoming_idx ON listed_event (competitor_id, start_date),
--            ALTER TABLE competitor ADD COLUMN tripadvisor_id text, ADD COLUMN tripadvisor_url text; FKs as drizzle emits them.
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON listed_event FROM app_user;
--> statement-breakpoint
ALTER TABLE listed_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listed_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY listed_event_visible ON listed_event FOR SELECT USING (app_competitor_visible(competitor_id));
-- (no grants to cs_worker/cs_web: 0081 "no grants on schema public for either role"; same as gbp_post 0105)
-- backfill + seed follow in Task 3 after `-- backfill:start`
```
**Behaviour:** `TABLE_CLASS.listed_event = 'global_public'`. World rows: one `listed_event` per world competitor (a self business included) with valid captures. The privilege guard test needs no change (no app_user writes).
**Tests (first):** `rls-sweep` + `isolation-world` pass; as `app_user` client B: zero rows for a competitor only A tracks, sees its own self row; INSERT → "permission denied"; `sources` `{}` or `{'yelp'}` → check violation; duplicate `(competitor_id, event_key)` → unique violation.
**Done when:** `pnpm --filter @cs/db exec vitest run src/rls-sweep.test.ts src/isolation-world.test.ts`; `pnpm --filter @cs/db generate` says "No schema changes"; `npx turbo run typecheck --concurrency=1 --filter=@cs/db`.

### Task 3: Pack v9 backfill + venues seed
**Goal:** Shipped DB verticals get the v9 data idempotently; `venues_attractions` lands in the catalogue (`vertical.updated_at` untouched).
**Files:** `0109_events_venues.sql` (after `-- backfill:start`), create `packages/db/src/events-backfill.test.ts`, `packages/db/src/catalog-seed.sql.ts` (`pnpm --filter @cs/verticals seed-sql`).
**SQL (binding; JSON literals = the Task 1 YAML, sorted keys):**
```sql
-- backfill:start
UPDATE vertical SET config = jsonb_set(config, '{type_weights,event_listed}', CASE id WHEN 'generic' THEN '0.5' ELSE '0.35' END::jsonb, true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'type_weights') = 'object' AND NOT (config->'type_weights') ? 'event_listed';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{scoring,size,events_for_full}', '5', true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config #> '{scoring,size}') = 'object' AND NOT (config #> '{scoring,size}') ? 'events_for_full';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{events}', '{"menu":false,"panel":false}', true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND NOT config ? 'events';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{citations,directory_groups,events_venues}', $json$[...5 directories...]$json$::jsonb, true)
 WHERE id = 'generic' AND jsonb_typeof(config #> '{citations,directory_groups}') = 'object' AND NOT (config #> '{citations,directory_groups}') ? 'events_venues';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{self_rules}', (config->'self_rules') || $json$[{"id":"event_gap","params":{"min_rival_events":2},"playbook":"list_your_events","weight":0.4}]$json$::jsonb)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'self_rules') = 'array'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config->'self_rules') r WHERE r->>'id' = 'event_gap');
--> statement-breakpoint
-- same NOT EXISTS shape appends the list_your_events play (id, trigger, effort, impact, title, template verbatim) to config->'playbooks'
UPDATE vertical SET config = jsonb_set(config, '{scoring,version}', '9', true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'scoring') = 'object' AND coalesce((config #>> '{scoring,version}')::int, 0) < 9;
--> statement-breakpoint
-- seed: the venues_attractions lines of `seed-sql` stdout (INSERT vertical / business_area / vertical_category … ON CONFLICT DO NOTHING)
```
**Behaviour:** a `vertical_category` already claimed by a DB-created vertical keeps its owner (`ON CONFLICT DO NOTHING`); note it in OPS (Task 15).
**Tests (first):** pattern `wider-sources-backfill.test.ts` (re-run from the marker): a v8-shaped row → v9 with weight, size, events, group, rule and play appended once; re-run changes nothing; `updated_at` unchanged; `assemblePack` of each shipped row equals the YAML pack's `type_weights.event_listed`/`events`/`self_rules`/`playbooks`/`citations`; `venues_attractions` row parses, `version 1`, categories `event venue` (primary) and `bar` (related) map to it.
**Done when:** `pnpm --filter @cs/db exec vitest run src/events-backfill.test.ts src/wider-sources-backfill.test.ts src/citations-backfill.test.ts`; `seed-sql` output committed (no diff on re-run).

### Task 4: Knowledge-panel parse (pure)
**Goal:** `parseSerp` returns the knowledge-graph title and its "Events" rows.
**Files:** `packages/collectors/src/rankings/serp.ts` (+ `serp.test.ts`), `rankings/__fixtures__/serp-venue-panel.json`; `packages/collectors/src/citations/match.ts` (+ test, P3 tokens).
**Interfaces:**
```ts
export interface SerpKnowledge { title: string | null; events: { title: string; subtitle: string | null; url: string | null }[] }
export interface SerpResult { organic: SerpOrganicItem[]; localServices: SerpLocalServices | null; knowledge: SerpKnowledge | null }
export const PANEL_EVENTS_MAX = 3;
export function gotoTarget(url: string | null | undefined): string | null; // google.com/goto?url=… → the http(s) `url` param, else null
```
**Behaviour:**
- First item `type 'knowledge_graph'` → `title`; within its `items`, the first `knowledge_graph_list_item` whose `title` is "Events" (case-insensitive) → its `items` (rows `{ title, subtitle, url }`; not `.data`, probe follow-up), ≤ 3, rows without a title dropped. No KG → `knowledge: null`; KG without an Events list → `{ title, events: [] }`.
- Row `url` = `gotoTarget(url)`; a non-goto http(s) url is kept; anything else null. All schemas `looseObject`, every field nullish (Risk 3: parse defensively). Existing organic/local-services output unchanged; callers that build `SerpResult` literals add `knowledge: null` (tsc names them).
**Tests (first):** fixture → title "Mohawk", 3 events, `subtitle 'Fri, Nov 13, 8:00 PM'`, url = the decoded target; **RF1** `no knowledge_graph → knowledge null`; KG with list titled "Menu" only → `events []`; a 4th row ignored; `gotoTarget('https://www.google.com/goto?url=https%3A%2F%2Fmohawkaustin.com%2Fe%2F1')` = `'https://mohawkaustin.com/e/1'`, a `javascript:` target → null; existing `serp.test.ts` cases unchanged. `match.test.ts`: existing cases pass; `nameHit('The Event Center', 'Event Center Austin', 'Austin')` follows the generic rule (exact head only).
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/rankings/serp.test.ts src/citations/match.test.ts`; tsc `@cs/collectors`.

### Task 5: Venue panel in the rank scan + budget
**Goal:** The Sunday scan stores one panel capture per business for `events.panel` packs, within budget, never failing the scan.
**Files:** `packages/collectors/src/rankings/{scan.ts,budget.ts}` (+ tests), `vendors/fixture-fetch.ts` (canned panel answer), `index.ts` (export `GBP_EVENTS_URL`, `VENUE_PANEL_KIND`); `apps/worker/src/deps.ts` (`scanRankings` gets `packs`).
**Interfaces:**
```ts
export const GBP_EVENTS_URL = 'gbp:events'; export const VENUE_PANEL_KIND = 'venue_panel'; export const PANEL_REUSE_DAYS = 6;
export function estimateRankScanUsd(c: RankClient, opts?: { search?: boolean; panelBusinesses?: number }): { calls: number; usd: number }; // + panelBusinesses × SERP_CALL_USD
async function searchVenuePanels(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; now?: () => Date },
  c: { id: string; agencyId: string; timezone: string; serviceArea: ServiceArea; address: ClientAddress | null },
  businesses: { competitorId: string; name: string; city: string | null }[], scope: CallScope): Promise<{ searched: number; reused: number; stored: number }>;
// scanRankings deps += packs?: (verticalId: string) => Promise<VerticalPack>
```
**Behaviour:**
- `scanRankings`: non-prospect, `pack.events.panel` (pack via `deps.packs`; missing loader ⇒ off) → businesses = self (`selfCompetitorId`) + tracked rivals; the budget estimate passes `panelBusinesses`. Runs after `searchKeywords`, only when the grid stored something.
- City: self → `client.address.city`, else `cityFromAddress(latest gbp_profile address)`; rival → `cityFromAddress(gbp address)`, else the client's city (18c P5). Keyword `"<name> <city>"` (quotes stripped from the name; no city → name only).
- Reuse: an ok capture with `url = 'gbp:events'` for the competitor newer than 6 days ⇒ no call. Else `serpSearch` at the service-area centre (depth 10, existing path). Keep the panel only if `knowledge` and `nameHit(knowledge.title, name, city)`; otherwise record nothing (no capture). Kept → `recordVendorCapture({ competitorId, source: 'google_business_profile', url: GBP_EVENTS_URL, status: 'ok', payload: raw })` then observation `{ kind: VENUE_PANEL_KIND, key: 'events', data: { timeZone: client.timezone, title, events } }` (P2; a KG with 0 events still stores, so "measured, none").
- Any error for one business is caught and logged with the competitor id; the scan's status/counters never change.
**Tests (first):** fake dfs + fixture: venues client with self + 2 rivals → 3 calls, 3 captures + observations with `timeZone`; **RF5** `pack without events.panel makes no extra call, estimate unchanged`; estimate with `panelBusinesses: 3` = old + 0.006; **RF1** `panel of another business is ignored` (title "Austin City Limits Live" for "Scoot Inn") → no capture; `generic venue name needs exact title`; reused capture 5 days old → no call, 7 days → call; vendor error on one rival → others stored, scan `done`; prospect scan → no panel; cap reached with panel cost → scan `skipped`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/rankings`; `pnpm --filter @cs/worker exec vitest run src/deps.test.ts` (if present); tsc `@cs/collectors`, `@cs/worker`, `@cs/tools`.

### Task 6: Event JSON-LD in markup + `markupSha`
**Goal:** Event nodes from web pages (dark until `WEB_MONITORING_ENABLED`), and a markup hash that changes when they do.
**Files:** `packages/collectors/src/web/markup.ts` (+ test), `web/__fixtures__/event-jsonld.html`.
**Interfaces:**
```ts
export interface StructuredEvent { name: string; startDate: string; endDate: string | null; status: string | null; soldOut: boolean; ticketed: boolean; url: string | null; venue: string | null }
export const MAX_EVENTS = 50;
export function jsonLdEvents(html: string): StructuredEvent[];
```
**Behaviour:** same `ld+json` scan as `jsonLdOffers` (broken JSON skipped, depth ≤ 24, `@graph` and arrays walked). A node is an event when any `@type` ends with `Event` or equals `Festival`; needs `name` and `startDate` strings. `status` = `eventStatus` string (URL or bare); `soldOut` = any `offers[].availability` ending `SoldOut`; `ticketed` = any offer with numeric `price > 0` or an http(s) `url`; `url` = node `url` when http(s); `venue` = `location.name` (string) when present. Nested events are not double counted. `markupSha` appends event tuples `name|startDate|status|soldOut` after the offers (D14: one extra `ok` capture per page after deploy, accepted).
**Tests (first):** fixture with `MusicEvent` (cancelled), `Festival`, `Event` in `@graph`, a `Product` with an offer → 3 events, exact fields; `EventScheduled` + `SoldOut` offer → `soldOut true`; 60 events → 50; broken JSON block skipped; `markupSha` changes when only an event status changes and is unchanged for a page without events (existing `markupSha` tests pass).
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/web/markup.test.ts src/evidence/recorder.test.ts`.

### Task 7: Event names, keys and panel dates (pure)
**Goal:** Deterministic normalisation and the D4 year inference.
**Files:** create `packages/engine/src/listed-events/normalise.ts` (+ test).
**Code (binding):**
```ts
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_WORDS = new Set([...MONTHS, 'january','february','march','april','june','july','august','sept','september','october','november','december']);
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_WORDS = new Set([...DAYS, 'tues','thur','thurs','sunday','monday','tuesday','wednesday','thursday','friday','saturday']);
const STOP = new Set(['the','a','an','and','of','at','with','in','on','for','to','by','presents','featuring','feat','ft','w','live','night','show','tickets']);
export function normaliseEventName(s: string): string {
  const base = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '');
  const cleaned = base.replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ').replace(/[^a-z0-9]+/g, ' ');
  const kept = cleaned.split(' ').filter((w) => w && !STOP.has(w) && !MONTH_WORDS.has(w) && !DAY_WORDS.has(w) && !/^\d{1,2}(st|nd|rd|th)?$/.test(w));
  return (kept.length ? kept : base.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)).join(' ');
}
export const nameTokens = (norm: string): string[] => [...new Set(norm.split(' ').filter(Boolean))];
export const eventKey = (nameNorm: string, startDate: string): string => `${startDate}:${nameNorm.slice(0, 120)}`;
/** 'YYYY-MM-DD' of `at` in `tz` (reuse the Task 0 helper if one exists). */
export const localDate = (at: Date, tz: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const PANEL_RE = /^\s*(?:([a-z]{3})[a-z]*\.?,?\s+)?([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?)?/i;
export function panelDate(subtitle: string | null, capturedAt: Date, tz: string): { startDate: string; startsAt: string | null } | null {
  const m = PANEL_RE.exec(subtitle ?? ''); if (!m) return null;
  const wd = m[1] ? DAYS.indexOf(m[1].toLowerCase()) : -1, mon = MONTHS.indexOf(m[2]!.toLowerCase()), day = Number(m[3]);
  if (mon < 0 || (m[1] && wd < 0)) return null;
  const today = localDate(capturedAt, tz), y0 = Number(today.slice(0, 4));
  for (const y of [y0, y0 + 1]) {
    const d = new Date(Date.UTC(y, mon, day));
    if (d.getUTCMonth() !== mon) continue;                        // Feb 29 in a non-leap year
    const iso = d.toISOString().slice(0, 10);
    if (iso < today || (wd >= 0 && d.getUTCDay() !== wd)) continue;
    let startsAt: string | null = null;
    if (m[4]) { const h = (Number(m[4]) % 12) + (m[6]!.toLowerCase() === 'p' ? 12 : 0); startsAt = zonedIso(iso, h, Number(m[5] ?? 0), tz); }
    return { startDate: iso, startsAt };
  }
  return null;
}
// zonedIso(date, h, min, tz): the UTC instant of that wall time in tz (offset from Intl `timeZoneName: 'longOffset'`, applied twice for DST edges).
```
**Tests (first):** `normaliseEventName('Jason Isbell & The 400 Unit — Fri Nov 13, 2026 8:00 PM')` = `'jason isbell 400 unit'`; `'LIVE: Trivia Night!'` = `'trivia'`; all-stop-word name falls back to the alnum original; `eventKey` stable. **RF2** capture 2026-11-11 (Chicago) `'Fri, Nov 13, 8:00 PM'` → `2026-11-13`, `startsAt 2026-11-14T02:00:00.000Z`; `Dec 28 capture, "Sat, Jan 2" → next year` (`2027-01-02`); `weekday mismatch → null` (`'Fri, Jan 2'`); `Dec 31 23:30 Chicago keeps local date` (`2027-01-01T05:30Z`, `'Thu, Dec 31'` → `2026-12-31`); `Feb 29 non-leap → next valid year or null` (2027-03 capture: `'Tue, Feb 29'` → `2028-02-29`); no time → `startsAt null`; garbage → null.
**Done when:** `npx vitest run src/listed-events/normalise` (engine dir).

### Task 8: Candidates and cross-source merge (pure + loaders)
**Goal:** One candidate shape from three feeders and the D5/P4 merge.
**Files:** create `packages/engine/src/listed-events/{candidates,merge}.ts` (+ tests).
**Interfaces:**
```ts
export interface EventCandidate { source: ListedEventSource; name: string; nameNorm: string; startDate: string; startsAt: string | null; endsAt: string | null;
  status: ListedEventStatus; url: string | null; venue: string | null; ticketed: boolean }
export function panelCandidates(obs: { timeZone: string; events: SerpKnowledge['events'] }, capturedAt: Date): EventCandidate[];
export function jsonLdCandidates(events: StructuredEvent[]): EventCandidate[];
export function metaCandidates(ads: { event: { name: string; startsAt: string | null } | null }[]): EventCandidate[];
export async function extractCandidates(deps: { db: Db; store: ObjectStore }, cap: CaptureRow): Promise<EventCandidate[]>; // loads the feeder for this capture (spec name)
export interface ExistingEvent { id: string; eventKey: string; nameNorm: string; startDate: string; status: ListedEventStatus; sources: ListedEventSource[] }
export type MergeOp = { op: 'insert'; key: string; cand: EventCandidate } | { op: 'update'; existing: ExistingEvent; cand: EventCandidate; statusFlip: boolean };
export function mergeCandidates(existing: ExistingEvent[], cands: EventCandidate[]): MergeOp[];
```
**Algorithm (binding):**
```ts
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
export function sameEvent(a: { nameNorm: string; startDate: string }, b: { nameNorm: string; startDate: string }): boolean {
  if (dayDiff(a.startDate, b.startDate) > 1) return false;
  const [s, l] = [nameTokens(a.nameNorm), nameTokens(b.nameNorm)].sort((x, y) => x.length - y.length) as [string[], string[]];
  return s.length > 0 && s.length * 2 >= l.length && s.every((t) => l.includes(t));          // P4
}
export function mergeCandidates(existing: ExistingEvent[], cands: EventCandidate[]): MergeOp[] {
  const ops: MergeOp[] = []; const pool = [...existing]; const fresh: { key: string; cand: EventCandidate }[] = [];
  for (const c of cands) {
    const key = eventKey(c.nameNorm, c.startDate);
    const hit = pool.find((e) => e.eventKey === key) ?? pool.filter((e) => sameEvent(e, c)).sort((x, y) => dayDiff(x.startDate, c.startDate) - dayDiff(y.startDate, c.startDate))[0];
    if (hit) { ops.push({ op: 'update', existing: hit, cand: c, statusFlip: c.source === 'web' && hit.status === 'scheduled' && c.status !== 'scheduled' }); continue; }
    const dup = fresh.find((f) => sameEvent({ nameNorm: f.cand.nameNorm, startDate: f.cand.startDate }, c));
    if (dup) { dup.cand = { ...dup.cand, ticketed: dup.cand.ticketed || c.ticketed, url: dup.cand.url ?? c.url }; continue; }
    fresh.push({ key, cand: c });
  }
  return [...ops, ...fresh.map((f) => ({ op: 'insert' as const, key: f.key, cand: f.cand }))];
}
```
**Behaviour:** JSON-LD status: `EventCancelled` → cancelled, `EventPostponed` → postponed, else scheduled; `soldOut` → sold_out unless cancelled/postponed. `startDate` as written (`YYYY-MM-DD` prefix; `startsAt` only with time + offset; unparseable → dropped). Panel/Meta: `scheduled`, not ticketed. Meta date = `localDate(startsAt, 'America/Chicago')`.
**Tests (first):** **RF3** `panel + JSON-LD ±1 day = one row, sources merged` (panel `'Jason Isbell'` Nov 13 row vs web `'Jason Isbell and the 400 Unit'` Nov 14 → one `update`); `"Party" ≠ "Halloween Costume Party"`; same key twice in one capture → one insert; web flip scheduled → cancelled → `statusFlip true`; panel never flips; Meta `2026-11-14T02:00:00Z` → `2026-11-13`; JSON-LD `EventCancelled` + soldOut → cancelled.
**Done when:** `npx vitest run src/listed-events/candidates src/listed-events/merge` (engine dir).

### Task 9: `listed_events` stage, sweep, worker job
**Goal:** Rows and `event_listed` changes per capture, retry-safe (D6–D8).
**Files:** create `packages/engine/src/listed-events/stage.ts` (+ test); `engine/src/{sweep.ts,drain.ts,index.ts,events/retract.ts}` (P7); `engine/src/structured/vendor-diff.ts` (`diffGbpCapture`: `gbp:events` → `[]`); `apps/worker/src/{job-list.ts,jobs/engine.ts}` (+ tests).
**Interfaces:** `LISTED_EVENTS_STAGE = 'listed_events'`, `LISTED_EVENTS_VERSION = 1`, `EVENT_SINGLES_MAX = 5`, `SERIES_DAYS = 35`, `ANNOUNCE_HORIZON_DAYS = 365`; `detectListedEvents(deps: { db; store }, captureId): Promise<StageOutcome<{ rows: number; changes: string[]; baseline: boolean }>>`; `EngineWork.listedEvents: string[]`; worker job `engine-listed-events { captureId }` (`singletonKey 'listed-events:<id>'`).
**Algorithm (binding):**
```ts
// accept ok captures: 'web' (tracked page) | 'meta_ads' | 'google_business_profile' with url 'gbp:events'; else throw.
// sourceKey web|meta_ads|google_panel; tz = panel obs timeZone, else 'America/Chicago'; today = localDate(cap.capturedAt, tz)
// cands: panel obs | jsonLdEvents(html evidence) | ad rows (cap.competitor, platform 'meta', last_capture_id = cap.id, event->>'startsAt' set)
// runStage(compute):
//   baseline = no earlier capture of the competitor with the same sourceKey and a done listed_events run
//   tracked  = EXISTS client_competitor row      // self-only: rows, no changes
//   existing = the competitor's rows with start_date in [today − 36 d, today + 366 d]
//   ops = mergeCandidates(existing, dedupe(cands))
//   announce = inserts with startDate in [today, today + 365] ∧ ¬baseline ∧ tracked ∧ ¬series
//     series = a row (or earlier insert) with the same nameNorm starting in [startDate − 35 d, startDate)
//   flips = updates with statusFlip ∧ existing.startDate ≥ today ∧ tracked
//           ∧ no live detected_change of the competitor with block_key 'event:<key>:<lifecycle>'
//   announce by startDate; first 5 singles, rest → one aggregate (blockKey 'event:more', count = rest.length, startDate = earliest)
// commit(tx): upsert rows ON CONFLICT (competitor_id, event_key) DO UPDATE: sources = union, last_capture_id/last_seen_at = cap,
//   url/venue/starts_at/ends_at coalesce(old, new), ticketed OR; flips set status, status_capture_id, status_changed_at. Then changes (onConflictDoNothing):
//   { competitorId, source: cap.source, kind: lifecycle === 'announced' ? 'added' : 'modified', afterCaptureId: cap.id, beforeCaptureId: null,
//     blockKey: `event:${key}:${lifecycle}`, beforeText: null, afterText: name, stageVersion: 1,
//     details: { changeType: 'event_listed', lifecycle, eventKey, eventName, startDate, ticketed, listedEventId, source: sourceKey, url, count? } }
```
**Behaviour:** sweep list `listedEvents`: accepted captures, settled (`VENDOR_SETTLE_MINUTES`), competitor tracked by a `clientWorkAllowed` client or a self business, not finished, oldest first. `drain.ts` runs it after site features (`r.changes +=`). P7 in `supersedePriorChanges`.
**Tests (first):** first panel capture → rows, `baseline true`, 0 changes; next capture with a new event → one `added` change, exact `details`/blockKey; self-only competitor → rows, 0 changes; event 400 days out → row, no change; **RF3** `weekly residency is series, no change`; `rerun idempotent` (`ran: false`); `reused panel capture no second change` (stage runs once per capture); `6 announcements = 5 singles + 1 aggregate`; JSON-LD flip → one `modified` cancelled change, a later flip capture → none; past event flip → none; panel event gone next week → no change, row kept; P7 `supersedePriorChanges(..., 2)` leaves it live; `diffVendorCapture` on `gbp:events` → 0 changes; the sweep enqueues the job.
**Done when:** `npx vitest run src/listed-events src/sweep src/drain src/events/retract src/structured/vendor-diff` (engine dir); `pnpm --filter @cs/worker exec vitest run src/jobs/engine.test.ts src/job-list.test.ts`.

### Task 10a: Tripadvisor parse + match (pure)
**Goal:** Defensive parse of one search item and the exactly-one-match rule.
**Files:** create `packages/collectors/src/tripadvisor/parse.ts` (+ test), `__fixtures__/tripadvisor-search.json`.
**Code (binding):**
```ts
export interface TripadvisorItem { id: string; url: string; title: string; rating: number | null; reviews: number | null; city: string | null }
const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District_of_Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New_Hampshire','New_Jersey','New_Mexico','New_York','North_Carolina','North_Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode_Island','South_Carolina','South_Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West_Virginia','Wisconsin','Wyoming']
  .sort((a, b) => b.length - a.length);
/** "/Attraction_Review-g55765-d11750497-Reviews-Treaty_Oak_Distilling-Dripping_Springs_Texas.html" → { id: 'd11750497', city: 'Dripping Springs' } */
export function parseUrlPath(p: string | null | undefined): { id: string; city: string | null } | null {
  const m = /^\/[A-Za-z_]+_Review-g\d+-(d\d+)-(?:Reviews-)?(?:.*-)?([A-Za-z0-9_]+)\.html$/.exec((p ?? '').trim());
  if (!m) return null;
  const slug = m[2]!; const st = US_STATES.find((s) => slug === s || slug.endsWith(`_${s}`));
  const city = st ? slug.slice(0, slug.length - st.length).replace(/_$/, '') : null;
  return { id: m[1]!, city: city ? city.replace(/_/g, ' ') : null };
}
export function parseTripadvisorItem(raw: unknown): TripadvisorItem | null; // looseObject { title, url_path, rating: { value }, reviews_count }; needs title + parseUrlPath; url = 'https://www.tripadvisor.com' + url_path
export function matchTripadvisor(items: TripadvisorItem[], biz: { name: string; city: string | null }): TripadvisorItem | null {
  const named = items.filter((i) => nameHit(i.title, biz.name, biz.city));
  const local = biz.city ? named.filter((i) => i.city !== null && i.city.toLowerCase() === biz.city!.toLowerCase()) : named;
  return local.length === 1 ? local[0]! : null;
}
```
**Behaviour:** `rating` only when 0 < value ≤ 5; `reviews` only a non-negative integer. Sponsored items (`is_sponsored true`) are skipped. Items without a parseable `url_path` are dropped.
**Tests (first):** probe path → `d11750497`, `Dripping Springs`; `…-Austin_Texas.html` → `Austin`; `New_York_City_New_York` → `New York City`; non-review path → null. **RF4** `two name+city matches → null`; `name match in another city → null`; one match → item; city unknown and one name match → item; rating 0 or 6 → `rating null`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/tripadvisor/parse.test.ts`.

### Task 10b: Tripadvisor collection, sources, worker
**Goal:** Weekly task_post/task_get for opted-in competitors; one observation per matched business.
**Files:** create `packages/collectors/src/tripadvisor/search.ts` (+ test); `sources/{kinds,ensure,due}.ts`, `local/self.ts`, `reviews/collect.ts` (kind union += `'tripadvisor'`), `vendors/fixture-fetch.ts`, `index.ts`; `apps/worker/src/{deps.ts,jobs/vendor.ts}` (+ tests); `packages/tools/src/workspace/labels.ts` (`SOURCE_LABELS.tripadvisor = 'Tripadvisor'`).
**Interfaces:**
```ts
SOURCE_KINDS += 'tripadvisor'; export const DEFAULT_SOURCE_KINDS = SOURCE_KINDS.filter((k) => k !== 'tripadvisor'); // ensure default (P8)
export const TRIPADVISOR_KIND = 'tripadvisor';   // vendor_task.kind, observation.kind, capture.source
export async function syncTripadvisorSources(db: Db, packs: PackLoader): Promise<{ active: number; inactive: number }>;
export async function postTripadvisorTasks(deps: { db: Db; dfs: DataForSeoClient }, competitorIds: string[]): Promise<{ posted: number; postedIds: string[]; failedIds: string[] }>;
export async function collectReadyTripadvisor(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }): Promise<{ collected: number; failed: number; matched: number }>;
```
**Behaviour:**
- Sync: opted-in = active client (`clientWorkAllowed` ∧ `agencyServiceable`) whose assembled pack has `tripadvisor` (one `packs` call per distinct vertical); competitors = their `client_competitor` rows + `self_competitor_id`. Insert missing rows, `active = true` for those, `active = false` for other `tripadvisor` rows. `claimDueSources`' self literal and `SELF_SOURCES` both add `'tripadvisor'` (comment kept in sync); `vendor-schedule` runs the sync before claiming and adds `tripadvisor` to `BATCH`.
- Post: per competitor keyword `"<name> <city>"` (city as Task 5), `/business_data/tripadvisor/search/task_post` in chunks of 100, `tag` = competitor id, params per Task 0, scope `{ competitorIds }`; `vendor_task` kind `tripadvisor`.
- Collect (`collectReadyTasks` kind `tripadvisor`): `recordVendorCapture({ source: 'tripadvisor', status: 'ok', payload })`; items → `parseTripadvisorItem`. Stored `tripadvisor_id` → that item, else nothing (`stored id absent → no observation`, id kept). No stored id → `matchTripadvisor`; a match stores `tripadvisor_id/url` (service role). Match → observation `{ kind: 'tripadvisor', key: 'rating', data: { id, url, title, rating, reviews } }`; none → no observation.
- Worker `postBatchTasks`/`pollVendorTasks` gain the tripadvisor branch exactly like `gbp_posts` (release on VendorError, `markSourceResult`).
**Tests (first):** sync: venues client's rival + self → active rows, hvac-only competitor → none, rival dropped by the venues client → `active false`; `ensureCompetitorSources(db, id)` adds no tripadvisor row; post: keyword/tag/chunking, vendor error → `failedIds`; collect with fixture: one match → id/url stored + observation 4.4/113; **RF4** `no match → no observation, no id`, `stored id absent → no observation`; worker schedule posts tripadvisor batch items; claim skips a tripadvisor row for a competitor only an hvac client tracks once synced inactive.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/tripadvisor src/sources src/local/self.test.ts`; `pnpm --filter @cs/worker exec vitest run src/jobs/vendor.test.ts`; tsc `@cs/collectors`, `@cs/worker`, `@cs/tools`.

### Task 11: `diffTripadvisor`, platform-aware rating changes
**Goal:** Tripadvisor rating moves become `rating_change` lines labelled as Tripadvisor; Google-only rules stay Google-only.
**Files:** create `packages/engine/src/structured/tripadvisor.ts` (+ test); `structured/vendor-diff.ts` (`DIFFERS.tripadvisor`); `score/score-stage.ts`; `tag/structured.ts`; `moves/rules.ts`; `briefs/evidence.ts`; `packages/tools/src/workspace/labels.ts` (`CHANNEL_LABELS.tripadvisor`); `packages/core` channel label maps tsc names.
**Interfaces:** `export const diffTripadvisor: SourceDiffer;` change `{ kind: 'modified', blockKey: 'tripadvisor:rating', beforeText: 'rating <a> (<n> reviews)', afterText: 'rating <b> (<m> reviews)', details: { changeType: 'rating_change', platform: 'tripadvisor', field: 'rating', ratingBefore, ratingAfter, votesBefore, votesAfter } }`.
**Behaviour:**
- Reads the `tripadvisor` observation of `cap` and of `prev` (vendor-diff passes captures of the same source); missing on either → `[]`; different `id` (re-match) → `[]`. `|b − a| ≥ RATING_CHANGE_MIN` and not `implausibleVotesDrop` (votes as `reviews`) → one change; an implausible drop counts `implausible`.
- `detailsSignature`: `rating_change` with `platform 'tripadvisor'` → `` `rating|tripadvisor|${before}|${after}` ``; Google unchanged.
- Summary: platform tripadvisor → `Tripadvisor rating <a> → <b> (<n> reviews)` (spec copy); Google text unchanged.
- `moves/rules.ts` reputation slump: ratings filter adds `(e.details.platform ?? 'google') === 'google'`.
- Channel labels `tripadvisor: 'Tripadvisor'` (`EVIDENCE_CHANNEL_LABEL`, `CHANNEL_LABELS`).
**Tests (first):** 4.3/88 → 4.5/95 → one change, exact details/texts; 4.40 → 4.45 → none; votes 113 → 40 → none, `implausible 1`; no prev observation → none; signature differs from a Google change with equal values; summary string verbatim; a Tripadvisor drop of 0.5 does not create `reputation_slump`, a Google one still does; score uses `rating_delta_for_full` (unchanged path).
**Done when:** `npx vitest run src/structured/tripadvisor src/structured/vendor-diff src/score src/tag src/moves/rules` (engine dir).

### Task 12: Grading, labels and brief surfaces
**Goal:** `event_listed` scores, groups, reads and appears in briefs; scorecard columns and `event_gap` work.
**Files:** `packages/engine/src/{score/score.ts,score/score-stage.ts,tag/structured.ts,listed-events/counts.ts,briefs/{scorecard,scorecard-model,self-rules,starting-point}.ts}` (+ tests); `packages/email/src/{labels.ts,templates/scorecard.tsx,previews.ts}`; `packages/core/src/pdf-layout.ts` (+1).
**Interfaces:**
```ts
ScorecardMetric += 'eventsListed30d', 'tripadvisorRating'; // values: z.number().nullable().default(null)
export async function eventCounts30d(db: Db, competitorIds: string[], now: Date): Promise<Map<string, number | null>>; // P5
export async function eventsEvidenceIds(db: Db, competitorIds: string[]): Promise<string[]>;                      // newest measured capture per business
SelfRuleInput.events: { selfCount: number | null; rivals: { competitorId: string; name: string; count: number }[]; evidenceIds: string[] } | null;
```
**Behaviour:**
- Score: `WHOLE_BUSINESS_TYPES` and `BRIEF_ONLY_TYPES` += `event_listed`; `sizeFactor` case per D9. Signature `` `event_listed|${d.eventKey ?? `more|${d.count}|${d.startDate}`}|${d.lifecycle ?? 'announced'}` ``. Tag: no `ai.decide` (follow `citation_added`).
- Summary (spec copy, names ≤ 80 via `trunc`, `<Mon D>` from `startDate` in UTC): panel announced `Google shows an upcoming event: "<name>" on <Mon D>`; other announced `Listed an event: "<name>" on <Mon D>`; cancelled/postponed/sold_out lines; aggregate `Listed <n> more events`.
- Email `CHANGE_LABELS.event_listed = 'event update'`, `GROUP_PHRASE.event_listed = () => 'event updates'`.
- Scorecard: headers "Events listed (30 days)", "Tripadvisor rating" (KIND count / rating); P6 drop when every row is null (events: null or 0); email short labels `Events` / `Tripadvisor` with keys; preview with both columns.
- `event_gap` (score `weight × min(1, total / 6)`): fires when `selfCount === 0` and rival non-series total ≥ `param(rule, 'min_rival_events', 2)`; fact `<names> listed <n> events in the last 30 days; Google shows none for you.` (`joinNames` of rivals with count > 0, top 3 by count); evidence = `evidenceIds` (none → dropped). `scorecardEvidenceText` appends `Events check: rivals listed <n> events in the last 30 days; none found for you.` so `checkSentence` passes. Starting point passes `events`.
**Tests (first):** venue weight 0.8, ticketed announced → size 1, aggregate count 3 → 0.6, route alert capped to brief; summaries verbatim; `groupChanges` 2 events same rival → `<name>: 2 event updates`; **RF5** `hvac scorecard has no events/tripadvisor column` (all null) and `tripadvisorRating null when unmatched, column dropped`; venues row values shown; old stored scorecard parses (defaults null); `event_gap`: self 0, rivals 2 + 1 → fact verbatim, score `0.4 × 0.5 = 0.2`; self null → skipped; series excluded; fact passes `checkSentence`.
**Done when:** `npx vitest run src/score src/tag src/listed-events/counts src/briefs` (engine dir); `pnpm --filter @cs/email exec vitest run src/labels src/templates src/previews`; `pnpm --filter @cs/core exec vitest run`.

### Task 13: Tools `list_listed_events`, `get_client_events_menu`
**Goal:** Tenant-checked reads for the page, MCP, Friday and the nav flag.
**Files:** create `packages/tools/src/tools/listed-events.ts` (+ test); `tools/{all,schemas}.ts`; `isolation/fixtures.ts`; `tools/channels.test.ts`; `access-marks` snapshot + `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; `packages/mcp/src/{server,integration}.test.ts`; `packages/ask/src/labels.ts` (`list_listed_events: 'Checking listed events…'`).
**Interfaces:**
```ts
defineTool({ name: 'list_listed_events', access: 'read', permission: 'read', channels: ['web', 'mcp', 'ask'], feature: 'dashboard',
  input: z.object({ clientId: z.uuid(), days: z.number().int().min(1).max(90).default(60) }), output: ListedEventsView });
// ListedEventsView = spec output exactly: events { id, competitorId, businessName, self, name, startDate, startsAt, status, sources, url, ticketed, firstSeenAt, evidenceId }[], windowStart, windowEnd
defineTool({ name: 'get_client_events_menu', access: 'read', permission: 'read', feature: 'dashboard',
  input: z.object({ clientId: z.uuid().optional() }), output: z.object({ clientIds: z.array(z.uuid()) }) }); // web only (P1)
```
**Behaviour:**
- List: `requireVisibleClient`; businesses = self + currently tracked rivals; rows `start_date ∈ [today, today + days]` (today = `localDate(now, client.timezone)`), `ORDER BY start_date, self DESC, business name, name, id` (stable for cassettes). `evidenceId` = evidence of `last_capture_id` filtered by `citableEvidenceKinds(meta)`. Names via `forChannel` off-web. No dollars or vendor; description names "events listed on Google, websites and ads", says evidence ids are what to cite.
- Menu: visible active clients (one id or all); `clientIds` = those whose pack has `events.menu` **or** with a self/tracked `listed_event` `start_date ≥ current_date − 30` (one SQL, packs via `packsOf`). Out-of-scope id → `not_found`.
**Tests (first):** seeded rows → exact shape, self first on a shared date, past and 61-day rows excluded, `days: 90` includes the latter; **RF5** `menu off for hvac without events`, on with a rival row 20 days old, on for a venues client with no rows; agency call without id returns only its own clients; out-of-scope client → `not_found` (both tools); isolation completeness with `list_listed_events: client()`, `get_client_events_menu: client()`; channels/MCP lists updated; `no usd keys or dollar text`.
**Done when:** `pnpm --filter @cs/tools exec vitest run src/tools/listed-events src/isolation src/tools/channels src/tools/access-marks`; `pnpm --filter @cs/mcp exec vitest run src/server.test.ts src/integration.test.ts`; tsc `@cs/tools`.

### Task 14: Events page, nav flag, help, demo, gate
**Goal:** `/c/<id>/events` with the decided copy, shown in the menu only when relevant.
**Files:** create `apps/web/src/app/(app)/c/[clientId]/events/{page.tsx,page.test.tsx,events-view.tsx}`; `components/shell/{nav-items.ts,nav-link.tsx,app-shell.tsx}` (+ nav test), `server/nav.ts`; `lib/labels.ts`; `help/copy/client.ts` (`'client.events'`); `docs/help/pages/client.events.{client,agency}.md`; `packages/demo/src/{listed-events.ts,seed.ts,coverage.ts}`.
**Interfaces:** nav `add(\`${base}/events\`, 'Events', 'events')` right after Listings when `flags.eventsClientIds?.includes(clientId)`; `IconKey` += `'events'` (lucide `CalendarDays`); `HELP_KEY = 'page:client.events'`; `metadata.title = 'Events'`; `LISTED_EVENT_STATUS` (Scheduled neutral · Cancelled danger · Postponed warning · Sold out info), `EVENT_SOURCE` (`web` Website · `meta_ads` Meta ad · `google_panel` Google).
**Behaviour:**
- Shell: `startShellReads` adds `callTool(ctx, 'get_client_events_menu', {})` (not in the platform zone; failure ⇒ `[]`) to its existing `Promise.all`; `flags.eventsClientIds` from it.
- Page: `requireContext`; `hasFeature(ctx, 'dashboard')` else `notFound()`; the page always renders (D10); `PageHeader` (title "Events", `clientCrumbs`, sub-line verbatim); `<Suspense fallback={<PageSkeleton/>}>`; one `Promise.all` of `list_listed_events` and `helpGuides`.
- One sheet, a `Section` per date (viewer tz `formatDate`, e.g. "Friday, November 13"): rows business (you first), name (external link when `url`, `rel="noopener noreferrer"`), time (`startsAt` in viewer tz, else "Time not listed" (draft → copy review)), source tags, status chip. Empty: "No upcoming events found for you or your rivals yet." Phone 390 px: rows wrap, no page scroll.
- Help: description + tips (`google`, `cancelled`, `series`), each with `// source:`; guides (client + agency): what it shows, sources, weekly cadence, "Google shows up to three upcoming events", cancelled/sold out only from websites, no vendor. Owner runs `pnpm kb:seed`.
- Demo: one demo client's rival gets 3 upcoming events (one cancelled, one ticketed) + a panel capture; coverage `{ route: 'c/[clientId]/events', calls: [{ tool: 'list_listed_events', path: 'events' }] }`; `coverage:readme`.
**Tests (first):** page: date sections, chip labels, source tags, empty copy verbatim, no `dashboard` → 404; nav: "Events" after "Listings" only when the client id is in `eventsClientIds`; app-shell test: the menu read joins the batch; `help/coverage.test.ts`, `copy-bundle.test.ts`, `client-boundary.test.ts` pass.
**Done when:** `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/events" src/components/shell src/server src/help src/client-boundary.test.ts`; `pnpm --filter @cs/web exec tsc --noEmit`; `pnpm design:lint`; `pnpm --filter @cs/demo exec vitest run src/coverage.test.ts`; `bash apps/web/scripts/profile-gate.sh --seed` (events, overview and listings ≤ 8 DB stages; never alongside E2E).

### Task 15: Evals, copy, docs
**Goal:** Replay green, copy queued, runbook and gotchas written.
- [ ] `pnpm eval:replay`. Expected miss: `ask` (new Ask tool + world rows change every request key). **State the cost first** (full ask ≈ $1.6–2). Per `packages/evals/CLAUDE.md`, a tool-list change makes `--fill` go live on every call, so run **`record` (full) `--max-usd 5`** first, then `record --fill` only for turns that failed on invalid JSON. Never run another test on the worktree DB meanwhile; stop on a 402 or a repeated failure and report. Commit cassette + baseline.
- [ ] `pnpm copy:status` lists the new strings (page, help, plays, why-it-matters, summaries, group label, services) as unsigned; add nothing to `signoff.json`.
- [ ] `docs/OPS.md` § "Events & venues (18d)": venues pack opt-in, panel cost ≈ $0.012/client/week and Tripadvisor ≈ $0.005/client/week, how to read panel captures (`url = 'gbp:events'`, `venue_panel` observation), re-running a capture (delete its `listed_events` `stage_run`), clearing a wrong `competitor.tripadvisor_id` (service role, next pull re-matches), claimed `vertical_category` conflicts, and the SQL for upcoming events per client.
- [ ] Gotchas: collectors `CLAUDE.md` (panel only with `events.panel`, nameHit gate, reuse 6 d, goto urls expire; Tripadvisor exactly-one match, never 0, `DEFAULT_SOURCE_KINDS`); engine (`listed_events` stage rules, P7 supersede guard, series/aggregate, platform-aware `rating_change`); verticals (`events`/`tripadvisor` flags, venues pack lists plays in full because `deepMerge` replaces arrays).
- [ ] Work file § New backlog: Google Events SERP re-probe; Tripadvisor review texts; `PAGE_TYPES` `events`; runbook sync for `event_gap`; "Scan now" estimate incl. panel.
**Done when:** `pnpm eval:replay` exits 0; `pnpm copy:status` runs; `git ls-files --eol | grep crlf` empty.

### Task 16: Final review (controller, top model)
- [ ] Whole-branch review on the top model against the spec (D1–D14), P1–P12 and the Review focus list; re-run each RF pinning test by name.
- [ ] `pnpm test:affected` then `pnpm e2e:affected --full` (once each, background, own test DB). One fix wave, focused re-runs only.
- [ ] Work file § Status/Next/Interfaces: owner steps = migrate 0109 → deploy worker, then web; `pnpm kb:seed`; `pnpm copy:review`; on staging, assign one client to `venues_attractions`, run `rank-scan` for it, check `gbp:events` captures, `/c/<id>/events`, the vendor ledger (panel ≤ $0.012) and, after the next `vendor-poll`, one Tripadvisor observation.
**Done when:** both suites green, review clean after the fix wave, work file updated.
