# phase-18d — Wider sources, part 4: events & entertainment vertical

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18d   **Base:** main @ 4985fbb0
**Plan/spec:** `docs/superpowers/plans/2026-11-11-phase-18d-events-venues.md` / `docs/superpowers/specs/2026-11-11-phase-18d-events-design.md`

## Status (overwrite)
Plan owner-approved 2026-11-12; execution started (SDD).

## Next (overwrite)
Task 0 done → Task 1 → … → 16 → final review → owner copy review + merge.

## Interfaces this branch adds or changes
TBD. Migration: main ends **0108** (`packages/db/migrations`), next free **0109**; re-check before execution.

## Assumes from other branches
None (no other branch in flight).

## Decisions (owner-approved)
- 2026-11-11: owner skipped the questions and accepted every brief recommendation (Q1 A, Q2 A, Q3 A, Q4 B after probe, Q5 B now / A after probe, Q6 A, Q7 C, Q8 A, Q9 C, Q10 A). 18d-1 = events as a source (all verticals); 18d-2 = events & entertainment pack (venues & attractions) + Google Events / Tripadvisor after a coverage probe.
- 2026-11-11 (overrides the Q1 split): staging holds almost no event data (0/530 Meta ads with `event`, 0/313 Google posts are dated events; web dark) ⇒ **probe first, then one phase**: a few-dollar DataForSEO probe (Google Events search, Tripadvisor) on ~10 real venues, then build table + change type + Events page + venues pack + the sources the probe proves, as one branch.

## Pre-flight (Task 0)
- Fixtures from hand-built DataForSEO shapes (sandbox is synthetic: no Events panel); sandbox accepts Tripadvisor `location_name`.
- `add_listing_url` (bot-blocked 403; UNVERIFIED, owner to spot-check): tripadvisor.com/GetListedNew; theknot.com/vendors; eventbrite.com/organizer/overview/ (200); peerspace.com/host; weddingwire.com/vendors.

## New backlog (target → item)
- none yet

## Brief

### 1. Scope
**Defining line** (18a kickoff, owner-approved 2026-11-08, `git show 2910b3ea`): *"**18d** events & entertainment vertical"* — between 18c citations and 18e social. So 18d is **a new vertical** (businesses that sell events/entertainment: venues, attractions, party/event services), not only "events as a source". Items deferred to 18d:
- Event lifecycle as its own change type: *"Event lifecycle (announced/cancelled/sold out — 18d)"* (18a-1 spec non-goals); *"O5 Event ads: … no own change type until 18d"*.
- Event JSON-LD from rival sites: *"Event JSON-LD (18d)"* (18a-2 spec; 18a brief Q7 "Event waits for 18d").
- Tripadvisor (+ Trustpilot, Google Q&A, News) revisited here: *"revisit with 18d (events vertical, where Tripadvisor fits)"* (18b brief Q7).

Core spec: §1.1–1.2 (local-service SMBs; 18d widens), §1.5, §2.2 (more verticals; never Yelp), §4.2–4.4 (collectors, global vs tenant tables, evidence), §6.1–6.3 (set diffs per capture, type list, score 70/40, pack weights), §6.6, §9.1, §10.5 (packs).

Must build (per Q answers): an events & entertainment seed pack; event change type(s) + a home for listed events; Event JSON-LD in the web markup path; Meta ad events into it; optionally Google events / Tripadvisor via DataForSEO; UI and brief surfaces.

### 2. Already built — reuse, don't rebuild
- **Verticals:** DB catalogue `vertical`/`business_area`/`vertical_category`/`vertical_draft` (14a, `@cs/verticals` `catalog.ts` `createCatalog`/`assemblePack`, schema `src/schema.ts`); seed packs `packages/verticals/packs/{generic,hvac_plumbing,dental}.yaml` (scoring v8; new types ⇒ pack bump + migration, cf. 0100/0101/0107/0108); `/platform/verticals` review/merge. Runbooks 14b `engine/src/runbook/`.
- **Change types / scoring:** `CHANGE_TYPES`, `CHANNELS` `packages/core/src/domain.ts`; `WHOLE_BUSINESS_TYPES` + `serviceOverlap` (brief-signal); `SourceDiffer` `engine/src/structured/vendor-diff.ts`; labels `brief-report.ts` `topicOf` + `@cs/email` `GROUP_PHRASE`.
- **Event data already collected:** `ad.event jsonb {name,startsAt}` (0100, Meta `ads/meta.ts`; Google `null`); `gbp_post` + `structured/gbp-posts.ts` (event posts → `promo`/`content`).
- **Web markup:** `collectors/src/web/markup.ts` `jsonLdOffers`, `siteFeatures` (dark until `WEB_MONITORING_ENABLED`).
- **Vendor paths:** `SOURCE_KINDS` `collectors/src/sources/kinds.ts`, `sources/due.ts`, worker `jobs/vendor.ts`; SERP `rankings/serp.ts`, `citations/` `parseSerp`.
- **Listings pattern (18c):** `citationCatalogue` groups, `citation_listing`, `/c/<id>/listings`.
- **Briefs/UI:** `engine/src/briefs/` scorecard, `self-rules`, graded report (0103); Changes + competitor pages.

### 3. Binding decisions (never re-open)
- Phase 18 order and out-of-scope: public records, newsletters, **FB Events/Nextdoor**, ad image/video analysis (except 18a-3 Google ad images), bought citation data, **Yelp**; health review platforms. Social (follower counts, IG/TikTok) = **18e** (ScrapeCreators), not here.
- **No new paid vendors** in Phase 18 (18a; 18b brief: DataForSEO only). Client text names the category, never the vendor. Nothing usage-billed; paid schedulers use `clientWorkAllowed`; vendor calls through the limiter; cost caps per run.
- Crawler rules; web dark until `rivalmonday.app/bot` is live.
- No evidence, no claim; Ask drops uncited figures; `redactForModel`; event readers `retracted_at IS NULL`; prices rules-only, a discount never becomes a price.
- New tool ⇒ `ISOLATION_FIXTURES`; new table ⇒ `TABLE_CLASS` + world rows.
- Verticals = global DB catalogue; HVAC/dental keep legacy plays; runbooks copy platform → agency → client. Grades Major/Notable/Minor vs T; real-history traces only.

### 4. Backlog to fold in (verbatim)
- [ ] Later → Google Q&A, News, Tripadvisor/Trustpilot (out of 18b; revisit with 18d events vertical) — *18b brief*
- Related (tagged 18e, touches event ads): [ ] 18e → `ad.event` keeps only the latest pull's value (event field never populated live yet) — *from 18a-1 final review*

### 5. In-flight workstreams
Only two stale research-doc remotes; no other branch in flight.

### 6. Open questions for the owner
1. **Split?** (A) 18d-1 "events as a source" for every vertical (event change types, Event JSON-LD, Meta ad events, GBP event posts) then 18d-2 the events & entertainment pack + its sources/UI; (B) one phase, pack + sources together; (C) pack only (seed vertical, weights, plays, citation groups), events-as-source later. **Rec: A** — 18d-1 is free data already collected and helps HVAC/dental too; 18d-2 needs a source probe first.
2. **Who is the vertical?** (A) venues & attractions (event spaces, escape rooms, live music); (B) event services (DJs, caterers, rentals); (C) both as two catalogue entries sharing one change model. **Rec: A** first — fixed location, GBP + rankings fit; (B) can follow as a catalogue draft.
3. **Data model / naming.** "event" already means a scored change (`event` table). (A) new global table `listed_event` (competitor, name, starts_at, status, source, url) with lifecycle diffs; (B) reuse `detected_change.details` only, no table; (C) extend `ad`/`gbp_post` rows. **Rec: A** — lifecycle diffs across sources; avoids the name clash.
4. **Event sources (no new vendor).** (A) Event JSON-LD on rival sites + Meta ad events + GBP event posts (all existing); (B) A + DataForSEO Google Events SERP for the client's area (≈ $0.002/query, cap e.g. $0.10/client/week, Sunday scan); (C) B + ticket-platform pages via Apify (Eventbrite etc.). **Rec: B** after a Task 0 coverage probe on 10 real venues; (C) risks ToS/bot walls.
5. **Tripadvisor / Trustpilot / Q&A / News.** (A) Tripadvisor reviews + rating for the events pack only (DataForSEO business_data, weekly, same review pipeline); (B) Tripadvisor as a Listings directory only (presence, 18c path); (C) all stay backlog. **Rec: B now, A after a coverage probe**; Trustpilot/Q&A/News stay backlog.
6. **Change types & grading.** (A) one `event_listed` type with `details.lifecycle` announced/cancelled/sold_out (brief-only; "sold out" Notable, never alert); (B) separate `event_announced`, `event_cancelled`, `event_sold_out`; (C) map into existing `promo`/`content`. **Rec: A** — small packs/labels; size curve grades (ticketed/large higher).
7. **Client UI.** (A) new client menu page "Events" (calendar list of rival events, next 60 days, source tag); (B) a section on Changes/competitor pages + brief lines only; (C) A, shown only when the vertical (or a rival) has events. **Rec: C** — no empty page for HVAC/dental; menu label per vertical.
8. **Briefs & scorecard.** (A) brief lines + scorecard row "Events listed (30 days)" + self rule "rivals list events, you don't"; (B) brief lines only; (C) A + date-clash note vs your own events. **Rec: A**; (C) needs own events data.
9. **Vertical pack depth.** (A) full seed pack with legacy plays; (B) catalogue vertical, AI-tailored runbook only; (C) B plus hand-written event plays (counter-programme, early-bird, sold-out waitlist). **Rec: C**.
10. **Citation groups for the pack.** (A) new `events_venues` group (Tripadvisor, The Knot, Eventbrite, Peerspace) from Google results; (B) `general` only; (C) defer. **Rec: A**, same $0.20/run cap.
