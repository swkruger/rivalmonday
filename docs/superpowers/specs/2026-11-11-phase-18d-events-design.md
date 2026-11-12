# Phase 18d — Events & venues (design)

**Date:** 2026-11-11 · **Branch:** `phase-18d` · **Brief:** `docs/work/phase-18d.md` · **Probe:** `docs/research/2026-11-11-phase-18d-events-probe.md`
Core spec §1.5, §2.2, §4.2–4.4, §6.1–6.3, §6.5, §10.5. New decisions and interfaces only (precedent: 18a–18c). **One phase** (owner: probe first, then one phase).

## Goal
Tell an owner when a rival **lists** an event (and, from website markup, cancels / sells out / postpones one); add a **venues & attractions**
vertical with Tripadvisor ratings. **Non-goals:** FB Events, Nextdoor, ticket sites, Yelp, Trustpilot/Q&A/News, Tripadvisor review texts,
date clashes, new paid vendors, event alerts, "removed an event" claims.

## Owner decisions
Q2 A venues & attractions · Q3 A `listed_event` · Q5 A Tripadvisor ratings (probe 9/10) + directory · Q6 A one `event_listed`, brief-only ·
Q7 C page only when relevant · Q8 A lines + scorecard + self rule · Q9 C vertical + runbook + event plays · Q10 A `events_venues` · one phase.

## Code / probe vs brief
- Staging: 0/530 ads with `event`, 0/313 Google posts dated events; web dark ⇒ live source = Google's **venue panel** (D2).
- Google Events SERP returns 50304 ⇒ out (backlog). **GBP-post text rule dropped**: 5 regex hits, none dated; false positives for no gain.
- `engine/src/events/` exists (retractions) ⇒ code in `engine/src/listed-events/`. Scorecard rows are businesses ⇒ new metrics are **columns**.
- `assemblePack`'s `deepMerge` replaces arrays: the venues pack lists playbooks and self_rules in full.

## Decisions (ours unless marked)
| # | Decision |
|---|---|
| D1 | **Feeders:** venue panel (D2, live); Event JSON-LD (dark until `WEB_MONITORING_ENABLED`; sole source of cancelled/sold_out/postponed); Meta `ad.event` (rows with `last_capture_id = cap.id` and `event->>'startsAt'`; free, mostly empty). |
| D2 | **Venue panel:** in the Sunday rank scan (`rankings/scan.ts` `scanRankings`, after `searchKeywords`), one `serpSearch` (`/serp/google/organic/live/advanced`, depth 10, client centre) per self + tracked rival, keyword `"<name> <city>"`, only when the pack has `events.panel` (**opt-in**: venues on; generic/HVAC/dental off ⇒ $0 for existing clients). `parseSerp` adds the `knowledge_graph` title and its `knowledge_graph_list_item` "Events" (rows in its `items`, ≤ 3 `{title, subtitle, url}`; client-centre `location_coordinate` verified in the probe). Used only when the panel title name-matches the business (`citations/match.ts` `normaliseName` containment, 18c C6). An ok panel capture < 6 days old (any client) is reused. A failure skips that business, never the scan. |
| D3 | **Capture** (18b-1 D6 precedent): `recordVendorCapture` under the business, `source 'google_business_profile'`, `url GBP_EVENTS_URL = 'gbp:events'`; channel stays "Google Business Profile"; `vendor-diff.ts` `diffGbpCapture` returns `[]` for it. Event `url` = the goto link's `url` param when http(s), else null (goto links expire). |
| D4 | **Date:** `"Fri, Nov 13, 8:00 PM"` → year = first of {capture year, +1} with date ≥ capture date **and** matching weekday, in the triggering client's `client.timezone`; none ⇒ dropped. JSON-LD: date as written; UTC-only (Meta) → `America/Chicago`. |
| D5 | **Key** `(competitor_id, name_norm, start_date)`; `name_norm` = NFKD, lower-case, no punctuation/years/times/weekday/month/stop words. Cross-source: date ±1 day and one name's tokens ⊆ the other's ⇒ one row, sources appended. |
| D6 | **Stage `listed_events` v1** (subject = capture), like `web/site-feature-stage.ts`: compute candidates; commit upserts `listed_event` + `detected_change` in one tx. Ok `web`, `meta_ads`, `gbp:events` captures; `sweep.ts` list `listedEvents`, run in `drain.ts`. No model calls. |
| D7 | **Lifecycle (§6.1):** *announced* = new key, `start_date` in [capture date, +365 d], competitor×source had an earlier processed capture (first = silent baseline). Panel/Meta: **announced only**; vanishing never means cancelled. *cancelled/postponed/sold_out* = JSON-LD flip from `scheduled`, `start_date` ≥ today, once per key×lifecycle. Past events expire silently. Self-only competitors: rows, no changes. |
| D8 | **Series:** same `name_norm` starting in the previous 35 days ⇒ `series = true`, no change. ≤ 5 single announcements per capture + one aggregate (`event:more`, `count`). |
| D9 | **Grading:** `event_listed` in `WHOLE_BUSINESS_TYPES` + `BRIEF_ONLY_TYPES`. Size: announced ∧ `ticketed` → 1; aggregate `curve(count, size.events_for_full = 5)`; else default. Weights generic 0.5, hvac_plumbing/dental 0.35, venues **0.8**. Signature `event_listed\|<eventKey>\|<lifecycle>`. Topic `offers`. |
| D10 | **Menu (Q7 C):** pack `events.menu` (venues) **or** a self/rival row with `start_date ≥ today − 30`. Page always renders. |
| D11 | **Measured** (scorecard, self rule) = done `listed_events` run on an ok `gbp:events` or `web` capture of the business (never Meta). |
| D12 | **Tripadvisor** (pack `tripadvisor: true`, venues only): `SOURCE_KINDS` += `'tripadvisor'`, weekly per rival + self (`SELF_SOURCES` when opted in); `business_data/tripadvisor/search` task_post/task_get via `reviews/collect.ts` `collectReadyTasks` (kind += `'tripadvisor'`), worker `jobs/vendor.ts` like `gbp_posts`. Keyword `"<name> <city>"`; exactly one name (+ city) match ⇒ store `competitor.tripadvisor_id/url`, later pulls pick that id; no match ⇒ no observation (never 0). Capture `source 'tripadvisor'`; `CHANNELS` += `'tripadvisor'`. Source rows only for competitors an opted-in client tracks. |
| D13 | `diffTripadvisor` in `DIFFERS` → existing `rating_change` (≥ `RATING_CHANGE_MIN`), `details.platform 'tripadvisor'`, `blockKey 'tripadvisor:rating'`, signature `rating\|tripadvisor\|…`. `moves/rules.ts` reputation slump keeps Google ratings only. No `review_spike` (needs texts). |
| D14 | `markupSha` adds event tuples; one extra `ok` capture per page after deploy. |

## Interfaces (binding)

### Migration `0109_events_venues` (next free number at execution time)
```sql
CREATE TABLE listed_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES competitor(id) ON DELETE CASCADE,
  event_key text NOT NULL, name text NOT NULL, name_norm text NOT NULL,
  start_date date NOT NULL, starts_at timestamptz, ends_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CONSTRAINT listed_event_status_check CHECK (status IN ('scheduled','cancelled','postponed','sold_out')),
  sources text[] NOT NULL CONSTRAINT listed_event_sources_check CHECK (sources <@ ARRAY['web','meta_ads','google_panel']::text[] AND cardinality(sources) > 0),
  url text, venue text, ticketed boolean NOT NULL DEFAULT false, series boolean NOT NULL DEFAULT false,
  first_capture_id uuid NOT NULL REFERENCES capture(id), last_capture_id uuid NOT NULL REFERENCES capture(id),
  status_capture_id uuid REFERENCES capture(id),
  first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, status_changed_at timestamptz,
  CONSTRAINT listed_event_key_unique UNIQUE (competitor_id, event_key)
);
CREATE INDEX listed_event_upcoming_idx ON listed_event (competitor_id, start_date);
REVOKE INSERT, UPDATE, DELETE ON listed_event FROM app_user;
ALTER TABLE listed_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE listed_event FORCE ROW LEVEL SECURITY;
CREATE POLICY listed_event_visible ON listed_event FOR SELECT USING (app_competitor_visible(competitor_id));
ALTER TABLE competitor ADD COLUMN tripadvisor_id text, ADD COLUMN tripadvisor_url text;
-- grants as gbp_post (0105). Seed vertical venues_attractions + vertical_category (0077 form, ON CONFLICT DO NOTHING).
-- Backfill (0107/0108 pattern, idempotent): generic gets the events_venues group; shipped packs get event_listed weight,
-- size.events_for_full, events, event_gap + list_your_events (appended when absent), scoring.version 9.
```
`TABLE_CLASS` `listed_event: 'global_public'` + world rows. Regenerate `catalog-seed.sql.ts`.

### Pack (`verticals/src/schema.ts`, `packs/*.yaml`)
- `events: { menu: boolean = false, panel: boolean = false }`; `tripadvisor: boolean = false`; `scoring.size.events_for_full` (5).
- Citation group enum += `'events_venues'`: tripadvisor.com, theknot.com, eventbrite.com, peerspace.com, weddingwire.com (`add_listing_url` hand-checked); 18c path, $0.20/run cap.
- **`packs/venues_attractions.yaml`** — a shipped seed pack (versioned config + pack tests); legacy plays stay HVAC/dental only, so venues clients start on 14b runbooks built
  from these plays. "Venues & attractions", audience "guests"; categories Event venue, Live music venue, Escape room center, Amusement center, Bowling alley, Wedding venue,
  Concert hall, Comedy club (related Bar, Brewery, Distillery, Winery); `events {menu, panel}: true`, `tripadvisor: true`, `citations.groups [general, events_venues]`;
  weights = generic with `event_listed` 0.8, `rating_change` 0.8; themes atmosphere, staff, value, sound & comfort, cleanliness, booking ease;
  playbooks = generic's + `counter_programme` (trigger `event_listed`), `early_bird`, `sold_out_waitlist`; self_rules = generic's + `event_gap`.

### Collectors
- `rankings/serp.ts` `SerpResult` += `knowledge: { title: string | null; events: { title: string; subtitle: string | null; url: string | null }[] } | null`.
- `rankings/scan.ts` `searchVenuePanels(deps, c, businesses, scope)`; `budget.ts` `estimateRankScanUsd` adds `(rivals + 1) × SERP_CALL_USD` when `events.panel`.
- `web/markup.ts` `jsonLdEvents(html): StructuredEvent[]` (`@type` ending `Event`, or `Festival`; max 50): `{ name; startDate; endDate; status; soldOut; ticketed; url; venue }`.
- `tripadvisor/search.ts` (new): `postTripadvisorTasks`, `collectReadyTripadvisor`, pure `parseTripadvisorItem(raw): { id; url; title; rating; reviews; city } | null` (fields confirmed on the first live task).

### Engine (`engine/src/listed-events/`)
`normaliseEventName`, `eventKey`, `panelDate(subtitle, captureDate, tz)`, `extractCandidates`, `detectListedEvents(deps, captureId)`, `eventCounts30d` + `eventsEvidenceIds` (as `postCounts30d`).
`detected_change`: `source = cap.source`, `kind 'added'`/`'modified'`, `blockKey 'event:<eventKey>:<lifecycle>'`, `afterText` = name,
`details { changeType: 'event_listed', lifecycle, eventKey, eventName, startDate, ticketed, listedEventId, source, url, count? }` (+ `platform`, D13).

### Core / labels
- `core/domain.ts`: `CHANGE_TYPES` += `'event_listed'`, `SELF_RULE_IDS` += `'event_gap'`, `CHANNELS` += `'tripadvisor'`; `topicOf` `event_listed` → `'offers'`.
- `@cs/email` `CHANGE_LABELS.event_listed = 'event update'`, `GROUP_PHRASE` `'event updates'`; channel labels (`engine/briefs/evidence.ts`, `tools/workspace/labels.ts`) `tripadvisor: 'Tripadvisor'`.
- `lib/labels.ts`: `LISTED_EVENT_STATUS` Scheduled neutral · Cancelled danger · Postponed warning · Sold out info; `EVENT_SOURCE` Website · Meta ad · Google.

### Briefs & scorecard
- `ScorecardMetric` += `'eventsListed30d'`, `'tripadvisorRating'` (`.default(null)`); headers **"Events listed (30 days)"**, **"Tripadvisor rating"** (email "Events", "Tripadvisor"); a column is **dropped when all values are null** (events: or 0).
- `event_gap` (`briefs/self-rules.ts`), input `events: { selfCount: number | null; rivals: { competitorId; name; count }[]; evidenceIds: string[] } | null`: fires when `selfCount === 0`
  and rival non-series events (30 d) ≥ 2; score `weight × min(1, total / 6)`; pack `{ id: event_gap, weight: 0.4, playbook: list_your_events, params: { min_rival_events: 2 } }`.

### Tools & page
- `list_listed_events` (`tools/src/tools/listed-events.ts`) `{ clientId, days?: 1–90 = 60 }` → `{ events: { id; competitorId; businessName; self; name; startDate; startsAt; status; sources; url; ticketed; firstSeenAt; evidenceId }[]; windowStart; windowEnd }`; web/mcp/ask, feature `dashboard`, `forChannel`.
- `get_client_events_menu` `{ clientId } → { show }` (D10), web only, in `server/nav.ts` `navCounts`' `Promise.all` (no extra stage); `NavRoleFlags.events?`.
- Both: `ISOLATION_FIXTURES` `client()`, out of scope ⇒ `not_found`; Ask label "Checking listed events…"; `demo/src/coverage.ts`.
- `/c/[clientId]/events`: `clientNav` "Events" after Listings when `flags.events`; `PageHeader`, help `page:client.events` + guides `client.events.{client,agency}.md`; `Suspense`; ≤ 8 stages; one sheet, a section per date: business (you first), name (link), time, source tag, status chip.

### Copy (decided; to `pnpm copy:review`)
- **Events**; sub-line "Upcoming events you and your rivals list, from Google and websites, for the next 60 days." Empty: "No upcoming events found for you or your rivals yet."
- Summaries: panel `Google shows an upcoming event: "<name ≤ 80>" on <Mon D>` · `Listed an event: "<name>" on <Mon D>` · `Cancelled its event "<name>" (<Mon D>)` ·
  `Postponed its event "<name>" (was <Mon D>)` · `Sold out its event "<name>" (<Mon D>)` · `Listed <n> more events` · `Tripadvisor rating <a> → <b> (<n> reviews)`.
- `event_gap`: `<names> listed <n> events in the last 30 days; Google shows none for you.` Play `list_your_events` "Put your events where customers look": "Post each event on your Google profile with its date, and list it on your website's events page."
- `counter_programme` "Counter-programme their event": "{{competitor}} has an event on {{date}}. Plan your own draw for that week and post it on your Google profile now."
  `early_bird` "Sell early with an early-bird price": "Open bookings for your next event with a limited early-bird price and announce it on Google." `sold_out_waitlist` "Catch the sold-out crowd": "{{competitor}} sold out {{event}}. Offer a similar night soon and promote it in posts and ads."

## Rollout & cost
Pack opt-in: only `venues_attractions` clients pay. Panel $0.002 × (rivals + 1) ≈ **$0.012/client/week**; Tripadvisor $0.00075 × 6 ≈ **$0.005/client/week**; citations unchanged.
All inside the client cap (`checkRankScanBudget`, ledger credits), vendor limiter, `clientWorkAllowed`. Existing clients $0, menu hidden unless events exist. Migration = next free number.

## Risks / backlog
1. Panel shows ≤ 3 nearest events: later ones appear as earlier pass ("Google shows" wording). 2. Panel coverage 6/9; no panel = not measured.
3. Tripadvisor fields from one probe: parse defensively. 4. Backlog: Google Events SERP re-probe, Tripadvisor review texts, `PAGE_TYPES` `events`.
