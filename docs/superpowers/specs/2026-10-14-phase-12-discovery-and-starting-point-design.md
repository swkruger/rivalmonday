# Phase 12 — Competitor discovery & rating (12a) + starting-point brief (12b)

**Status:** owner-approved design (brainstorm 2026-10-14). New decisions and interfaces only; the core spec (`2026-09-29-core-platform-design.md`) is cited by §.
**Build order:** 12a, then 12b (12b reads 12a's signals). Migrations: next free number at execution time (main ends at 0051; phase-9 claims 0052–0053, phase-10 ≥ 0054).

## Why
Live data (cs_dev, 2026-10-14): suggestions include Dollar General, equine hospitals and the client itself; every candidate scores 0.25 or 0.13; Meta ads are off for every UI-added competitor (page ids only via CLI); a new client sees "No briefs yet" then one-sentence quiet weeks for about a month because first captures are silent baselines (§6) and moves need history.

## Decisions
- **D1** Discovery is a two-stage job: wide Maps search → hard filters → Overlap → signal checks on the top N → Activity → Tier. Vendor APIs only; never fetches competitor websites.
- **D2** Tier labels **Top rival / Worth watching / Minor** are what users see; Overlap and Activity (0–1) are internal, used to sort and to derive the tier.
- **D3** Tier + signal icons show on suggestion cards (agency), and on the tracked-competitors list and competitor profile for agency **and client** users.
- **D4** Discovery auto-runs once a client (active **or prospect**) has `keywords`, `service_area` and `place_id`, and from the "Find competitors" button. Converting a prospect reuses its last run if ≤ 30 days old. Phase 11 calls the same entry point (`startDiscovery`).
- **D5** Top rivals are pre-ticked up to `competitor_limit`; the AM confirms (§4.1 item 2 unchanged: AM confirms).
- **D6** Ad accounts: strong matches auto-attach on accept and show "Matched automatically · Remove"; weak matches show as "Possible … · Confirm". Removing a Google account retires its ads silently (no "ads stopped" event).
- **D7** Cost guard: hard cap **$3 per run** (pack-configurable), estimated before each stage; over the cap the grid shrinks 7×7 → 5×5, then keywords drop. **Max 5 runs per agency per UTC day**; existing 10-minute per-client cooldown and one run per client at a time stay.
- **D8** Signals are tri-state: `null` = not checked / unavailable, `0`/`false` = checked, none found. DataForSEO "No Search Results." (40102) is a successful empty result everywhere (discovery, `ads_google`, `jobs`) — folds in the BACKLOG item.
- **D9** Tracked competitors are re-rated weekly from stored data (no vendor calls) into `competitor_signal`.
- **D10** New brief kind `starting_point`, one per client, generated when onboarding data is ready or 48 h after activation, through the normal AM approval; sent on approval, not held for Monday. Prospects get none.
- **D11** Starting-point content is deterministic: a scorecard plus 3–5 findings from pack **self-rules**; at most one strength finding. Optional writer pass only for "why it matters" / action wording, verified by the existing two-layer verifier (§9.1 item 4). This satisfies "never pad".
- **D12** Quiet weeks carry a **"Where you stand"** scorecard (deltas since the starting point) plus open first moves. Core spec §9.1 item 5 is amended at merge to: *"…plus a trend snapshot and the where-you-stand scorecard. Never pad."*
- **D13** Layout (both web and email/PDF): 4 headline tiles (you vs rival median) → compact scorecard → finding cards (fact · why it matters · action, evidence chips). One shared `Scorecard` renderer for web and email.

## 12a — Discovery & rating

### Vertical pack additions (`packages/verticals/packs/*.yaml`, pack `version` +1; zod in `verticals/src/schema.ts`)
```yaml
discovery:
  seed_keywords: [dentist, dental implants, emergency dentist]     # merged with client.keywords, ≤ 5 total, client first
  categories: [Dentist, Cosmetic dentist, Dental clinic, Denture care center, Emergency dental service, Pediatric dentist, Prosthodontist]
  related_categories: [Orthodontist, Oral surgeon, Periodontist, Endodontist]   # kept, service match 0.5
  grid: { size: 7, fallback_size: 5 }
  shortlist: 20
  cost_cap_usd: 3
  tiers: { top: { overlap: 0.55, activity: 0.25 }, watch: { overlap: 0.35, activity: 0.6 } }
```
HVAC pack: `HVAC contractor, Air conditioning contractor, Heating contractor, Furnace repair service, Plumber, Air conditioning repair service, Water heater installation service, Electrician`; related `[Appliance repair service, Mechanical contractor]` (category strings are verified against live Maps `category` values in the plan's Task 0).

### Algorithm (`packages/collectors/src/discovery/`)
- **Stage 1** `mapsSearch` per (keyword × grid point), depth 20. Keep per candidate: `placeId, cid, name, category, additionalCategories, address, lat, lng, rating, votes, domain, phone, isClaimed, workStatus`, plus per-search `rank`.
- **Filters** (each drop counted by reason in `discovery_run.hidden`): `wrong_category` (category ∉ categories ∪ related, and no additional category in them); `outside_area` (distance from service-area centre > radius × 1.25); `self` (same placeId, cid, domain or phone as the client); `closed` (`workStatus` closed); `thin` (no votes and no domain). Dedupe by placeId → cid → domain.
- **Overlap** = `presence × serviceMatch × distanceFactor`, where `presence = Σ_searches w(rank) / searches`, `w(r) = 1 / (1 + (r−1)/3)` (r1 = 1, r4 = 0.5, r10 = 0.25), `serviceMatch = 1` main category in `categories` (0.5 if only related), `distanceFactor = 1 − 0.5 × min(1, d / radius)`. Normalised to 0–1 by the run's max presence.
- **Stage 2** on the top `shortlist` by Overlap:
  - Google: `ads_advertisers` (keyword = name, `location_coordinate` = candidate lat,lng) → pick account (match rules below) → `ads_search` with `advertiser_ids`, depth 40 → `adsActive`, `adsNew30d`. No account → `ads_search` `target: domain` filtered by name (today's fallback).
  - Meta: Ad Library keyword search by name, country US, status ACTIVE (ScrapeCreators `adLibrary/search/ads`; Apify fallback) → group by page → match → `metaAdsActive`. Page id from the result (verified live in Task 0; if the endpoint returns no page id, use the page search variant).
  - Reviews: `reviews` task_post depth 20, tag `discovery:<runId>:<placeId>` → `reviews30d`, `reviews90d`, `replyRate`. Results via the existing vendor-poll; a run waits ≤ 30 min, then finalises with these signals `null` and patches them when they land.
  - Chain: name (normalised, brand token) appears ≥ 3 times in the run's raw results with different placeIds → `chain: true`.
- **Ad-account match** (`matchAdAccount(candidate, account) → 'strong' | 'weak' | 'none'`): strong = normalised names equal, or account name contains the candidate's name plus its city/locality, or the account's domain equals the candidate's domain; weak = name token overlap ≥ 0.6; else none. For chains, strong additionally requires the city/locality or the domain (franchise rule — folds in both franchise BACKLOG items).
- **Activity** = `0.35·ads + 0.25·meta + 0.3·reviewVelocity + 0.1·profile`, where `ads = min(1, (adsActive + adsNew30d) / 5)`, `meta = min(1, metaAdsActive / 3)`, `reviewVelocity = min(1, reviews30d / max(3, run median reviews30d × 2))`, `profile = claimed ? 1 : 0`; `null` terms are dropped and the weights renormalised.
- **Tier**: Top rival if `overlap ≥ tiers.top.overlap && activity ≥ tiers.top.activity`; Worth watching if `overlap ≥ tiers.watch.overlap || activity ≥ tiers.watch.activity`; else Minor. Candidates outside the shortlist are Minor with `signals` partly `null`.

### Data (migration, next free number)
```sql
CREATE TABLE discovery_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL, client_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','searching','checking','finalising','done','failed')),
  trigger text NOT NULL CHECK (trigger IN ('auto','manual','convert')),
  keywords jsonb NOT NULL DEFAULT '[]', grid_size int,
  progress jsonb NOT NULL DEFAULT '{}',          -- {searchesDone, searchesTotal, checksDone, checksTotal}
  kept int, hidden jsonb NOT NULL DEFAULT '{}',  -- {wrong_category: n, outside_area: n, self: n, closed: n, thin: n}
  cost_usd double precision NOT NULL DEFAULT 0, error text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE
);
CREATE INDEX discovery_run_agency_day_idx ON discovery_run (agency_id, started_at);
CREATE UNIQUE INDEX discovery_run_one_live ON discovery_run (client_id) WHERE status IN ('queued','searching','checking','finalising');

ALTER TABLE competitor_suggestion
  ADD COLUMN run_id uuid REFERENCES discovery_run(id) ON DELETE SET NULL,
  ADD COLUMN category text, ADD COLUMN distance_km double precision,
  ADD COLUMN overlap double precision, ADD COLUMN activity double precision,
  ADD COLUMN tier text CHECK (tier IN ('top','watch','minor')),
  ADD COLUMN signals jsonb NOT NULL DEFAULT '{}', ADD COLUMN ad_matches jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE client_competitor ADD COLUMN pending_ad_matches jsonb NOT NULL DEFAULT '[]';  -- weak AdMatch[] awaiting confirm

CREATE TABLE competitor_signal (
  agency_id uuid NOT NULL, client_id uuid NOT NULL,
  competitor_id uuid NOT NULL REFERENCES competitor(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('top','watch','minor')),
  overlap double precision, activity double precision, signals jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, competitor_id),
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE
);
```
RLS (follow `0010_sources_rls.sql`): `discovery_run` and `competitor_signal` FORCE RLS, SELECT `agency_id = app_agency_id() AND app_client_visible(client_id)`; writes by the service role only. `competitor_suggestion` column grants unchanged (app_user still updates only `status`). Listing hides suggestions whose `run_id` ≠ the client's latest done run.

```ts
// packages/collectors/src/discovery/signals.ts (re-exported by @cs/tools schemas)
export const Signals = z.object({
  rating: z.number().nullable(), votes: z.number().int().nullable(),
  reviews30d: z.number().int().nullable(), reviews90d: z.number().int().nullable(), replyRate: z.number().min(0).max(1).nullable(),
  googleAdsActive: z.number().int().nullable(), googleAdsNew30d: z.number().int().nullable(), googleAccount: z.enum(['matched','possible','none']).nullable(),
  metaPage: z.enum(['matched','possible','none']).nullable(), metaAdsActive: z.number().int().nullable(),
  claimed: z.boolean().nullable(), chain: z.boolean().nullable(),
  categoryMatch: z.enum(['main','related']).nullable(), distanceKm: z.number().nullable(),
  presence: z.object({ searches: z.number().int(), appeared: z.number().int(), bestRank: z.number().int().nullable() }).nullable(),
});
export const AdMatch = z.object({ platform: z.enum(['google','meta']), accountId: z.string(), name: z.string(), strength: z.enum(['strong','weak']) });
```

### Jobs (`apps/worker/src/jobs/discovery.ts`)
- `discovery-run` (`{ runId }`, single-shot, expiry 2 h): stage 1 → filters → stage 2 → `finalising` → `done`. Every vendor call is ledgered in `vendor_call` with agency and client ids.
- `discovery-finalise` (from vendor-poll when a `discovery:` review task lands, and a 30-min timer): patches review signals, recomputes Activity/Tier.
- `signals-weekly` (cron Monday 09:00 UTC, after the vendor pull): for each active client × tracked competitor, recompute Signals from `ad`, `review`, `observation` (gbp_profile), `rank_snapshot` → upsert `competitor_signal`. A tier change emits a `tier_change` event candidate: new change type added to `CHANGE_TYPES` (engine + `verticals/src/schema.ts`), pack `type_weights.tier_change: 0.4`, channel `signals`, evidence = the competitor's latest observation.
- All schedulers apply phase-9's `agencyServiceable` filter. Discovery may target `status IN ('active','prospect')`; `signals-weekly` targets active clients only.

### Tools (`packages/tools/src/tools/competitors.ts`; reads registered, writes via `runTool`)
- `request_competitor_suggestions` → creates a `discovery_run` (trigger `manual`); refuses with "Daily search limit reached. Try again tomorrow." when the agency has 5 runs today.
- `get_competitor_search_status` → `{ status, progress, hidden, kept, finishedAt }` from the latest run.
- `list_competitor_suggestions` → `SuggestionView` + `tier, category, distanceKm, signals, adMatches, preselected: boolean`, grouped order Top → Watch → Minor, then Overlap; plus `hidden` counts and `hiddenList` (name + reason, max 50).
- `get_competitor_signals({ clientId })` → per tracked competitor `{ competitorId, tier, signals, computedAt }`; agency and client roles; exposed on MCP.
- `accept_competitor_suggestion` → as today plus: attach `strong` matches to `competitor.google_advertiser_ids` / `meta_page_ids` (append, no duplicates), store `weak` ones in `client_competitor.pending_ad_matches`.
- `accept_competitor_suggestions({ ids })` (bulk "Track selected"): one transaction; the limit check is atomic (`SELECT … FOR UPDATE` on the client row) — folds in the limit-race BACKLOG item for both bulk and single accept.
- `confirm_ad_match({ competitorId, platform, accountId })`, `remove_ad_match(…)`; removing a Google id silently retires those ads (`is_active=false, ended_at=last_seen_at`, no ended capture; no `ad_stopped` change) — folds in the unpin BACKLOG item.
- `upsell_tag` is never in these payloads.

### UI (`apps/web/src/app/(app)/c/[clientId]/competitors/*`)
- Suggestions panel: tier groups with headings, cards with name, category · distance · domain, tier chip, icon pills (★ rating · votes; reviews 30 d; Google Ads n; Meta page/ads; in N of M searches; chain; different specialty), tooltip per pill. States per pill: active (blue), hot (accent), checked-none (grey + strike), not checked (dotted outline).
- Pre-ticked checkboxes on Top rivals up to the limit; sticky "Track selected (n)" button; "Show n hidden" disclosure with reason labels.
- Progress: "Searching your area… 140 of 245 searches", then "Checking ads and reviews for 20 businesses…".
- Tracked table + competitor profile: tier chip, icon row, "Rated Mon 20 Oct"; ad-match chips "Meta page: <name> · Matched automatically · Remove" / "Possible Google account: <name> · Confirm".
- Icons: hand-written inline SVG in brand tokens; tier chip colours `top` ink #0B2540/white, `watch` primary #47A8E7/white, `minor` panel #EEF2F6/#4A5D73.

**Copy (decided):** tiers "Top rival", "Worth watching", "Minor"; hidden reasons "Different kind of business", "Outside your service area", "This is your business", "Permanently closed", "Too little information"; empty "No competitors found yet. Add keywords and a service area, then search."; failure "The search didn't finish. Your earlier suggestions are still here. Try again later."

## 12b — Starting-point brief

### Data (migration)
```sql
ALTER TABLE brief DROP CONSTRAINT brief_kind_check;
ALTER TABLE brief ADD CONSTRAINT brief_kind_check CHECK (kind IN ('standard','quiet','starting_point'));
ALTER TABLE brief ADD COLUMN scorecard jsonb;
CREATE UNIQUE INDEX brief_one_starting_point ON brief (client_id) WHERE kind = 'starting_point';
ALTER TABLE brief_item ALTER COLUMN competitor_id DROP NOT NULL;
ALTER TABLE brief_item ADD COLUMN subject text NOT NULL DEFAULT 'competitor' CHECK (subject IN ('self','competitor'));
ALTER TABLE brief_item ADD CONSTRAINT brief_item_subject_check CHECK (subject = 'self' OR competitor_id IS NOT NULL);
```
`starting_point` briefs use `delivery_date` = generation date (the existing unique `(client_id, delivery_date)` holds: a weekly brief on the same date is skipped that week).

```ts
// packages/engine/src/briefs/scorecard.ts
export const ScorecardMetric = z.enum(['rating','reviews90d','replyRate','mapTop3Share','adsActive','metaAdsActive']);
export const Scorecard = z.object({
  asOf: z.string(), baselineBriefId: z.uuid().nullable(),             // null on the starting point itself
  tiles: z.array(z.object({ metric: ScorecardMetric, you: z.number().nullable(), rivalMedian: z.number().nullable(), deltaSinceStart: z.number().nullable() })).length(4),
  rows: z.array(z.object({ competitorId: z.uuid().nullable(), name: z.string(), self: z.boolean(), tier: z.enum(['top','watch','minor']).nullable(),
    values: z.record(ScorecardMetric, z.number().nullable()) })),
  evidenceIds: z.array(z.uuid()),
  openFirstMoves: z.array(z.object({ recommendationId: z.uuid(), title: z.string() })).default([]),
});
```
Tiles are fixed: rating, reviews90d, replyRate, mapTop3Share. Sources: `get_rating_trend` logic (rating, replyRate), `ratingTrend` (reviews90d), `reviewBenchmark` (themes), `rankMetrics` (mapTop3Share over the latest scan), `competitor_signal` (ads, tier). Evidence ids are the evidence rows those values came from (review/observation/rank-scan evidence).

### Self-rules (pack `self_rules:`; engine `packages/engine/src/briefs/self-rules.ts`)
```yaml
self_rules:
  - { id: review_velocity_gap, when: "you.reviews90d < 0.5 * rivals.median.reviews90d", weight: 1.0, playbook: ask_for_reviews }
  - { id: reply_rate_gap,      when: "you.replyRate < rivals.median.replyRate - 0.25", weight: 0.8, playbook: reply_to_reviews }
  - { id: rating_gap,          when: "you.rating < rivals.median.rating - 0.2", weight: 0.9, playbook: fix_top_complaint }
  - { id: rival_only_advertiser, when: "you.adsActive == 0 && rivals.anyAds", weight: 0.6, playbook: consider_search_ads }
  - { id: theme_weakness,      when: "theme.shareGap <= -0.10 && theme.negative", weight: 0.7, playbook: fix_theme }
  - { id: theme_strength,      when: "theme.shareGap >= 0.10 && theme.positive", weight: 0.5, playbook: promote_strength, strength: true }
  - { id: map_visibility_gap,  when: "you.mapTop3Share < rivals.median.mapTop3Share - 0.10", weight: 0.8, playbook: improve_map_rank }
  - { id: profile_gap,         when: "!you.claimed || !you.hasHours || you.categoryCount < 2", weight: 0.7, playbook: complete_profile }
```
Conditions are a closed set of named predicates implemented in TypeScript (the YAML names the predicate and its thresholds; no expression evaluator). Ranking = `weight × normalised gap size`; take the top 5, at most one `strength`, minimum 1 item. Rules needing rivals are skipped when there are none (a self-only scorecard still ships). Every item has `subject: 'self'`, a fixed fact template filled from computed values (e.g. "You got {you} new reviews in 90 days; {topRival} got {theirs}."), `evidence_ids`, and the playbook's action/effort/impact. The playbook trigger enum gains these rule ids (§8.5 playbooks, agency-overridable as today).

### Generation (`apps/worker/src/jobs/briefs.ts` + `packages/engine/src/briefs/starting-point.ts`)
- `starting-point-schedule` (hourly): active, serviceable clients with no `starting_point` brief whose readiness is met: self GBP observation exists **and** review backfill done for self **and** (first rank scan finished or no keywords) **and** (latest discovery run done or none possible) — or `client.activated_at + 48 h` passed. `activated_at` = `created_at`, or the conversion time for converted prospects (new column `client.activated_at timestamptz`, backfilled from `created_at`).
- Pipeline: scorecard → self-rules → optional writer pass for `why_it_matters`/`recommended_action` (task `brief_writer`, `redactForModel`) → two-layer verifier → `status = ready` → AM notice "Your starting point brief for {client} is ready to review." → on approval, send immediately (email subject "Your starting point with {agencyProduct}").
- Each approved item's action becomes a `recommendation` (existing `recommendationFromItem`, `source = 'brief'`).

### Quiet weeks
`generateBrief` computes `scorecard` for `quiet` briefs too, with `deltaSinceStart` against the starting point's scorecard and `openFirstMoves` = starting-point recommendations not `done`/`dismissed` (max 3). Standard briefs keep no scorecard (unchanged).

### Rendering
- `apps/web/src/components/views/scorecard.tsx` (web) and `packages/email/src/templates/scorecard.tsx` (email/PDF) share one `scorecardModel(scorecard)` view-model function in `@cs/engine`; ▲/▼ with green/red only alongside text (accessible).
- `brief-view.tsx`: starting point = title "Your starting point", chip "Starting point · {date}", tiles → scorecard → cards; quiet = summary → "Where you stand" (tiles + scorecard with deltas) → "First moves still open". The web view now also renders `trend`.
- Client home: before the starting point, "No briefs yet" becomes a progress card "Preparing your starting point" with checks "Your Google profile", "Your reviews", "Map rankings", "Competitors" (✓ / in progress), then links to the brief.

## Error handling
- Stage 1 succeeds if ≥ 50 % of searches succeed; otherwise the run fails and earlier suggestions stay visible.
- A failed signal check leaves that signal `null`; the card shows "Some signals unavailable".
- A starting point with < 1 qualifying finding still ships the scorecard with the item "Your baseline is set" (fixed copy, no claims) — the only item allowed without a rule.
- Generation failure follows the existing brief retry (3 attempts) and AM failure notice.

## Testing
- Unit: each filter (Dollar General / vet / self / closed fixtures from the 2026-10-14 McCoy run), Overlap weights, Activity renormalisation with `null`s, tier thresholds, cost-guard shrink, chain detection, `matchAdAccount` (Aire Serv franchise fixture), 40102 → empty success in discovery/ads/jobs; each self-rule incl. no-rivals and null inputs; scorecard medians; one-starting-point index; quiet scorecard deltas.
- DB/RLS: tenant isolation for `discovery_run`, `competitor_signal`; `brief_item_subject_check`; atomic limit under two concurrent accepts.
- Tools: payloads carry no `upsell_tag`; client role sees `get_competitor_signals` but not suggestions; daily-cap refusal copy.
- E2E (fake vendors, `ASK_FAKE_AI`-style switch `DISCOVERY_FAKE_VENDORS`, E2E only): run → tier groups, pre-ticked, Track selected, hidden list; client user sees tiers on tracked list; new client progress card → AM approves starting point → client sees tiles/scorecard/cards; quiet week shows Where you stand.
- Live (cs_dev, owner): both clients — no wrong-category or self suggestions; Granbury Dental Center and Archstone are Top rival or Worth watching; starting points generated for both.

## Out of scope
Website crawling for discovery; prospect starting-point briefs; client self-authored competitors; agency-editable tier thresholds in the UI (pack only); Phase 11 wizard screens.
