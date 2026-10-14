# phase-12 — Competitor discovery & rating (12a) + starting-point brief (12b)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-12   **Base:** main @ c84ca97
**Plan/spec:** spec pending: docs/superpowers/specs/2026-10-14-phase-12-discovery-and-starting-point-design.md

## Status (overwrite)
Kickoff 2026-10-14. Design owner-approved in brainstorming (Brief §1). No spec/plan/code yet. Roadmap row 12 added at merge.

## Next (overwrite)
Agent writes the spec, then the lean plan (12a, 12b); owner approves.

## Interfaces this branch adds or changes
(planned, not built)
- Tables: `discovery_run`, `competitor_signal`. `competitor_suggestion` + `category`, `distance_km`, `overlap`, `activity`, `tier`, `signals` jsonb, `ad_matches` jsonb, `run_id`, `last_seen_at`. `brief.kind` + `'starting_point'` (extend CHECK `brief_kind_check`; one per client), `brief.scorecard` jsonb; `brief_item.competitor_id` nullable + `subject` `'self'|'competitor'`.
- Vertical packs: `discovery.categories` allowlist, discovery seed keywords (≤ 5), self-rules for the starting point.
- Migrations: **next free at execution time** (main ends at 0051; see Brief §5).

## Assumes from other branches
- **phase-9 (9a executing):** migrations **0052–0053**; new `db/src/filters.ts`; `agencyServiceable` filter on every scheduler (incl. `ensureSelfCompetitors`, `listBriefDueClients`) — our new jobs apply it too. 9a e7: ≤ 3 active clients in pilot/trial.
- **phase-10 (planned):** migrations **≥ 0054**; edits `create_client` (`first_client_at`).
- **phase-7-planning (parked):** no overlap.
- **Phase 11 (client onboarding wizard, unplanned; roadmap row 11):** owns GBP/DataForSEO prefill + competitor-review emails; **overlaps** our auto-run trigger and starting-point readiness/48 h fallback. We build both as reusable entry points; Phase 11 calls them.

## Decisions (owner-approved)
Brainstorm decisions in Brief §1; promoted to the spec with ids.

## New backlog (target → item)
- Phase 12 merge → add roadmap row 12; amend core spec §9.1 item 5 (quiet week carries a "Where you stand" scorecard) and §4.1 item 2.

## Owner verification steps
TBD (plan).

## Brief

### 1. Scope
**12a Competitor discovery & rating** (core spec **§4.1 item 2** discovery; **§4.2** collectors; **§6.3** relevance = service × territory overlap)
- Stage 1: DataForSEO Maps search over client keywords + pack seed keywords (≤ 5), 7×7 grid. Hard filters: pack `discovery.categories` allowlist, service area, self exclusion, closed. **Overlap** = rank-weighted presence × category/service match × distance.
- Stage 2, top ~20: Google `ads_advertisers` name+location → `ads_search`; Meta Ad Library name search (ScrapeCreators/Apify) matched on name+city/website; 20-review sample; claimed/chain. **Activity** score.
- Tiers Top rival / Worth watching / Minor (score internal), shown to agency + client users.
- Auto-run when client has keywords + service area + place id; top rivals pre-ticked up to `competitor_limit`; AM confirms. Strong ad matches auto-attach on accept, weak = confirm.
- Weekly re-rating from existing data. Signal `null` = not checked, `0` = checked-none (needs the "No Search Results" fix). Cap $3/run, 5 runs/day.

**12b Starting-point brief** (**§8.5** recommendations; **§9.1** weekly brief; **§9.1 item 5 quiet week needs an amendment**)
- `brief.kind = 'starting_point'`, one per client; generated when onboarding data is ready (self GBP, review backfill, first rank scan, discovery) or after 48 h.
- Deterministic self-rules in the pack: `review_velocity_gap`, `reply_rate_gap`, `rating_gap`, `rival_only_advertiser`, `theme_strength`/`theme_weakness`, `map_visibility_gap`, `profile_gap` → 3–5 items + recommendations.
- Layout: 4 tiles + scorecard + finding cards. Quiet weeks also carry "Where you stand" (deltas since starting point + open first moves). Client-home progress card.

### 2. Already built — reuse
- `packages/collectors/src/local/{suggest,maps,grid}.ts` — current suggestions, DataForSEO Maps SERP, service-area grid.
- `packages/collectors/src/local/accept.ts` — `acceptSuggestion`, `findExistingCompetitor`, `patchReusedCompetitor`.
- `packages/collectors/src/local/self.ts` — `ensureSelfCompetitor(s)` (self link from `client.place_id`).
- `packages/collectors/src/ads/google.ts` — Google Ads Transparency (advertisers, pinned/domain modes).
- `packages/collectors/src/ads/meta.ts` — Meta ads by page id, Apify → ScrapeCreators fallback (no name search yet).
- `packages/collectors/src/prospect/{snapshot,report}.ts` — one-shot multi-vendor run (pattern).
- `packages/tools/src/tools/competitors.ts` — suggestion/accept/add tools (limit check lives here).
- `packages/tools/src/tools/{reputation,rankings,overview}.ts` — read tools behind scorecard tiles.
- `packages/engine/src/briefs/*` — brief pipeline (`kind` `standard|quiet`).
- `packages/engine/src/reviews/benchmark.ts` — review benchmark vs rivals.
- `packages/engine/src/structured/rank.ts` — rank-scan diffs (map-visibility inputs).
- `packages/verticals/packs/{dental,hvac_plumbing}.yaml` — gain `discovery.*` + self-rules.
- `apps/web/src/app/(app)/c/[clientId]/competitors/*` — list, `actions.ts`, controls, detail.
- `apps/web/src/components/views/brief-view.tsx`, `packages/email/src/templates/brief.tsx` — brief web/email render.

### 3. Binding decisions (do not re-open)
- Crawler conduct; `WEB_MONITORING_ENABLED` stays unset; public information only.
- Web reads = registered `@cs/tools` tools; writes via `runTool`; page refusals → 404.
- `upsell_tag` never client-facing; event readers filter `retracted_at IS NULL`; schedulers/lists filter `client.status = 'active'`.
- Model input via `redactForModel`. Charts = hand-written inline SVG.
- Review decisions on Jev; τ 0.85 unchanged. No evidence, no claim. Never edit applied migrations; one worker replica.

### 4. Backlog to fold in (verbatim)
- [ ] DataForSEO "No Search Results." is treated as a failure: `jobs` tasks end `failed`, `ads_google` ends `vendor_error` (2026-10-14: ads for Victory, Affordable Dentures, Jay Thomas, Purczinsky; jobs for Victory, Affordable Dentures). Should record an empty, successful observation so "no ads / no jobs" is a real state and the next diff has a baseline — *from 2026-10-14 re-pull*
- [ ] Franchise brands: choose the local franchisee's ad accounts, not the brand's; jobs too (Aire Serv's 2026-10-14 postings are brand-wide "United States") — *from phase5-polish*
- [ ] Franchise local relevance: choose the franchisee's advertisers/pages, not the brand's (e.g. Iowa City `AR16031097081657556993` on Aire Serv) — *from end-of-Phase-5 verification*
- [ ] Unpinning Google advertisers (pinned → domain) can ~21 days later report mass "ads stopped" — retire silently on a mode switch before any unpin UI — *from 3b*
- [ ] `ensureSelfCompetitor` read-then-write race on a place-id change; competitor-limit check not atomic with `acceptSuggestion`/`add_competitor` (can exceed by one) — *from 5b-1, 5b-2 Task 3*
- [ ] Before switching on `WEB_MONITORING_ENABLED`: `accept_competitor_suggestion`/`add_competitor` (`packages/tools/src/tools/competitors.ts`) return `'disabled'` for a prospect; start discovery in `convert_prospect` — *from 5b-2 final review Minor 1*
- (No item on quiet-week/brief empty states.)

### 5. In-flight workstreams
See **Assumes from other branches**. Hot spots: schedulers, client lifecycle (`create_client`/`convert_prospect`), `tools/all.ts`, email `render/types`, `coverage.ts`, migration numbers (this phase: next free at execution time).

### 6. Open questions
Resolved 2026-10-14: daily cap **per agency**; Phase 12 adds the **auto-run now** (Phase 11 reuses the entry point); discovery runs **for prospects too** (owner overrode the recommendation).
