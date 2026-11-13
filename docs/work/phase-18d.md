# phase-18d — Wider sources, part 4: events & entertainment vertical

**Kind:** execution   **Worktree:** ../CompetitorSpy-wt/phase-18d   **Base:** main @ 4985fbb0
**Plan/spec:** `docs/superpowers/plans/2026-11-11-phase-18d-events-venues.md` / `docs/superpowers/specs/2026-11-11-phase-18d-events-design.md`

## Status (overwrite)
All 16 tasks done (SDD, every task reviewed clean); final review (opus): ready to merge with fixes; final fix wave done (failing `test:affected` expectations, spec/plan synced with the execution rulings, review minors). Suites re-run by the controller. CI `eval:replay` (ask) stays red until the Ask cassette is re-recorded.

## Next (overwrite) — owner steps
1. Re-record the Ask cassette (blocked on OpenRouter 402; top up first): `pnpm --filter @cs/evals eval record --suite ask --max-usd 5`, then `pnpm eval:replay`, commit.
2. `pnpm copy:review` (new event/Tripadvisor strings, `event_gap` fact, Events page, help copy).
3. Merge (`/rm-merge`): migrate **0109** → deploy worker, then web; `pnpm kb:seed` (Events guides).
4. Staging: assign one client to `venues_attractions`, run its rank scan, check `gbp:events` captures, `/c/<id>/events`, the vendor ledger (panel ≤ $0.012/client/week) and one Tripadvisor observation after the next vendor-poll.
5. Spot-check the UNVERIFIED `events_venues` add-listing URLs (below).

## Interfaces this branch adds or changes
- DB: migration **0109** `events_venues`; table `listed_event` (`global_public`, RLS `app_competitor_visible`); `competitor.tripadvisor_id/url`; seed vertical `venues_attractions`; packs v9 backfill.
- Domain: change type `event_listed` (brief-only); channel/source kind `tripadvisor` (not in `DEFAULT_SOURCE_KINDS`/`SELF_SOURCES`); self rule `event_gap` + play `list_your_events`.
- Pack: `venues_attractions`; flags `events.menu`/`events.panel`, `tripadvisor`; `scoring.size.events_for_full`; citation group `events_venues`.
- Briefs: scorecard metrics `upcomingEvents` ("Upcoming events", email "Events"), `tripadvisorRating`.
- Tools: `list_listed_events` (web/mcp/ask), `get_client_events_menu { clientId? } → { clientIds }` (web, `skip-web` audit).
- Web: route `/c/<id>/events` (menu "Events" after Listings), help `page:client.events`.
- Worker: job `engine-listed-events` (stage `listed_events` v1); Tripadvisor post/poll in the vendor jobs.

## Assumes from other branches
None (no other branch in flight).

## Decisions (owner-approved)
- 2026-11-11: owner skipped the questions and accepted every brief recommendation (Q1 A, Q2 A, Q3 A, Q4 B after probe, Q5 B now / A after probe, Q6 A, Q7 C, Q8 A, Q9 C, Q10 A). 18d-1 = events as a source (all verticals); 18d-2 = events & entertainment pack (venues & attractions) + Google Events / Tripadvisor after a coverage probe.
- 2026-11-11 (overrides the Q1 split): staging holds almost no event data (0/530 Meta ads with `event`, 0/313 Google posts are dated events; web dark) ⇒ **probe first, then one phase**: a few-dollar DataForSEO probe (Google Events search, Tripadvisor) on ~10 real venues, then build table + change type + Events page + venues pack + the sources the probe proves, as one branch.

## Pre-flight (Task 0)
- Fixtures from hand-built DataForSEO shapes (sandbox is synthetic: no Events panel); sandbox accepts Tripadvisor `location_name`.
- `add_listing_url` (bot-blocked 403; UNVERIFIED, owner to spot-check): tripadvisor.com/GetListedNew; theknot.com/vendors; eventbrite.com/organizer/overview/ (200); peerspace.com/host; weddingwire.com/vendors.

## New backlog (target → item)
- 18e/later: Google Events SERP re-probe (coverage on real venues).
- Later: Tripadvisor review texts (ratings only today).
- Later: add `events` to `PAGE_TYPES` (tracked-page type for event pages).
- Later: runbook sync for `event_gap` (platform runbook play for the new fact).
- Later: "Scan now" cost estimate should include the venue panel.
- Later: JSON-LD status never restores after `EventScheduled` again (a re-opened event stays cancelled).
- Later: copy tool (`pnpm copy:review`) does not scan `tag/structured.ts` summaries.
- Later: menu tool active-only wording (menu lists active items only; copy says so loosely).
- Carried: `ad.event` keeps only the latest pull's value (from 18a-1 review).

## Brief
Distilled brief folded into the spec and plan. Defining line: 18a kickoff, "18d events & entertainment vertical"; deferred items: event lifecycle change type, Event JSON-LD, Tripadvisor revisit. Owner answers are under Decisions.
