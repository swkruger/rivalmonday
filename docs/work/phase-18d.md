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
