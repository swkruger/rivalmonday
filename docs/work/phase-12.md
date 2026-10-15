# phase-12 — Competitor discovery & rating (12a) + starting-point brief (12b)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-12   **Base:** main @ c84ca97
**Plan/spec:** spec `docs/superpowers/specs/2026-10-14-phase-12-discovery-and-starting-point-design.md` (owner-approved 2026-10-14) · plans `docs/superpowers/plans/2026-10-14-phase-12a-competitor-discovery.md`, `…-12b-starting-point-brief.md` (owner-approved 2026-10-14, subagent-driven)

## Status (overwrite)
Plans 12a + 12b owner-approved 2026-10-14 (subagent-driven); owner chose to build Phase 12 **before** 9, 10, 11 (9a runs in parallel in its own worktree). Test DB `cs_phase_12_test`. 12a Tasks 0–11 built (migrations 0052 `discovery_rating`, 0053 `discovery_rating_rls`); final whole-branch review + owner verification next.

## Next (overwrite)
12a final whole-branch review, then 12b.

## Interfaces this branch adds or changes
(12a built; 12b planned)
- Tables (built): `discovery_run`, `competitor_signal`. `competitor_suggestion` + `category`, `distance_km`, `overlap`, `activity`, `tier`, `signals` jsonb, `ad_matches` jsonb, `run_id`, `last_seen_at`. `brief.kind` + `'starting_point'` (extend CHECK `brief_kind_check`; one per client), `brief.scorecard` jsonb; `brief_item.competitor_id` nullable + `subject` `'self'|'competitor'`.
- Vertical packs: `discovery.categories` allowlist, discovery seed keywords (≤ 5), self-rules for the starting point.
- Migrations: 12a = 0052 + 0053 (renumber to >= 0055 if phase-9 merges first, see Pre-flight).

### Pre-flight 2026-10-14 (12a Task 0)
- **Migrations:** main ends 0051; unmerged phase-9 holds 0052-0054 (renumber 12a to >= 0055 if it merges first); phase-10 >= 0054. **P6:** `agencyServiceable` not on main; BACKLOG at merge: "apply agencyServiceable to rival-search and signals-weekly".
- **Pack category lists (Task 2):** dental primary Dentist, Dental clinic, Oral and maxillofacial surgeon; additional Cosmetic dentist, Orthodontist, Pediatric dentist, Periodontist, Endodontist, Emergency dental service, Dental implants provider, Teeth whitening service, Dental hygienist. HVAC primary HVAC contractor, Air conditioning contractor, Plumber; additional A/C repair service, Heating contractor, Furnace repair service, Air duct cleaning service, Electrician, Insulation contractor; noise: Service establishment, Training center, Plumbing supply store, Pump supplier.
- **Maps item:** `category` always string; `additional_categories`/`address` can be null; `work_hours.current_status` absent on ~15% (tri-state).
- **ads_advertisers** (keyword + `location_coordinate` "lat,lng", $0.002): `result[0].items[]` mixes `ads_advertiser` {title, advertiser_id 'AR...', verified, approx_ads_count} with `ads_domain` rows, so filter on type; "Aire Serv" returns brand + franchisees (chain guard essential).
- **Meta search:** ScrapeCreators `GET /v1/facebook/adLibrary/search/ads?query=&status=ACTIVE&country=US` -> `searchResults[]` (not `results`) with `page_id`, `page_name`, `is_active`, `ad_archive_id`; 1 credit; group by `page_id` (count = lower bound). No page-search fallback needed.
- Fixtures: `packages/collectors/test/fixtures/vendors/` dfs-maps-live-{dental,hvac}, dfs-ads-advertisers-live, scrapecreators-adlibrary-search.

## Assumes from other branches
- **phase-9 (9a executing):** migrations **0052–0053**; new `db/src/filters.ts`; `agencyServiceable` filter on every scheduler (incl. `ensureSelfCompetitors`, `listBriefDueClients`) — our new jobs apply it too. 9a e7: ≤ 3 active clients in pilot/trial.
- **phase-10 (planned):** migrations **≥ 0054**; edits `create_client` (`first_client_at`).
- **phase-7-planning (parked):** no overlap.
- **Phase 11 (client onboarding wizard, unplanned; roadmap row 11):** owns GBP/DataForSEO prefill + competitor-review emails; **overlaps** our auto-run trigger and starting-point readiness/48 h fallback. We build both as reusable entry points; Phase 11 calls them.

## Decisions (owner-approved)
Brainstorm decisions in Brief §1; promoted to the spec with ids. Rulings 1–10 from 12a execution live in the SDD ledger; notable: R3 no agencyServiceable (phase-9 merge adds it), R7 ad-account removal only by sole tracker (agency-only tools).

## New backlog (target → item)
- Unscheduled → `tier_change` event when a tracked competitor's tier changes (deferred by plan 12a P4: `detected_change_subject_check` needs a capture or rank scan)
- Phase 12 merge → STATE "Next up" order 12 → 9 → 10 → 11 (owner 2026-10-14)
- Phase 12 merge → add roadmap row 12; amend core spec §9.1 item 5 (quiet week carries a "Where you stand" scorecard) and §4.1 item 2.

## Owner verification steps
On `cs_dev` with the worker running:
1. Run "Find competitors" for both clients: no wrong-category or self suggestions.
2. Granbury Dental Center and Archstone are rated Top rival or Worth watching.
3. Run cost <= $3 on `/platform/costs`.
4. Accept one suggestion: Meta/Google ad-account chips appear on its profile.
5. Next Monday `signals-weekly` fills the tracked competitors' tiers.

## Brief (condensed)
**12a** (core spec §4.1 item 2, §4.2, §6.3): Maps search over client + pack seed keywords (≤ 5, 7x7 grid); hard filters (category allowlist, area, self, closed); overlap = rank-weighted presence x category/service match x distance; stage 2 on the top ~20 (Google `ads_advertisers`, Meta name search, 20-review sample, claimed/chain) gives activity; tiers Top rival / Worth watching / Minor (scores internal); auto-run with keywords + area + place id; top rivals pre-ticked up to `competitor_limit`; strong ad matches auto-attach, weak need confirm; weekly re-rating; null = not checked, 0 = checked-none; $3/run, 5 runs/agency/day.
**12b** (§8.5, §9.1; amend §9.1 item 5): `brief.kind='starting_point'`, one per client, generated when onboarding data is ready or after 48 h; deterministic pack self-rules (`review_velocity_gap`, `reply_rate_gap`, `rating_gap`, `rival_only_advertiser`, `theme_strength`/`theme_weakness`, `map_visibility_gap`, `profile_gap`) give 3-5 items; 4 tiles + scorecard + finding cards; quiet weeks carry "Where you stand"; client-home progress card.
**Binding:** crawler conduct; `WEB_MONITORING_ENABLED` unset; reads = `@cs/tools`, writes via `runTool`, refusals 404; `upsell_tag` never client-facing; `retracted_at IS NULL`; `redactForModel`; inline SVG charts; Jev review decisions, tau 0.85; never edit applied migrations.
**Backlog folded in:** DataForSEO "No Search Results." must record an empty successful observation (jobs `failed`, `ads_google` `vendor_error` today); franchise brands: pick the franchisee's ad accounts and jobs, not the brand's; unpinning Google advertisers can report mass "ads stopped" ~21 d later (retire silently before any unpin UI); `ensureSelfCompetitor` race and non-atomic competitor-limit check; before `WEB_MONITORING_ENABLED`: prospect `'disabled'` in accept/add tools and discovery in `convert_prospect`.
**Resolved:** daily cap per agency; auto-run now (Phase 11 reuses the entry point); discovery runs for prospects too.
**Hot spots:** schedulers, `create_client`/`convert_prospect`, `tools/all.ts`, email `render/types`, `coverage.ts`, migration numbers.
