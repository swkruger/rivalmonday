# phase-12 — Competitor discovery & rating (12a) + starting-point brief (12b)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-12   **Base:** main @ c84ca97
**Plan/spec:** spec `docs/superpowers/specs/2026-10-14-phase-12-discovery-and-starting-point-design.md` (owner-approved 2026-10-14) · plans `docs/superpowers/plans/2026-10-14-phase-12a-competitor-discovery.md`, `…-12b-starting-point-brief.md` (owner-approved 2026-10-14, subagent-driven)

## Status (overwrite)
Plans 12a + 12b owner-approved 2026-10-14 (subagent-driven); owner chose to build Phase 12 **before** 9, 10, 11 (9a runs in parallel in its own worktree). Test DB `cs_phase_12_test`. 12a Tasks 0–11 built (migrations 0052 `discovery_rating`, 0053 `discovery_rating_rls`); 12b Tasks 1–9 built (migration 0054 `starting_point_brief`); 12b final review fix wave done (I1–I4, M1–M13); owner verification next.

## Next (overwrite)
Owner verification of 12a + 12b, then `/rm-merge`.

## Interfaces this branch adds or changes
(12a + 12b built)
- Tables: `discovery_run`, `competitor_signal`. `competitor_suggestion` + `category`, `distance_km`, `overlap`, `activity`, `tier`, `signals` jsonb, `ad_matches` jsonb, `run_id`, `last_seen_at`. `brief.kind` + `'starting_point'` (extend CHECK `brief_kind_check`; one per client), `brief.scorecard` jsonb; `brief_item.competitor_id` nullable + `subject` `'self'|'competitor'`.
- Vertical packs: `discovery.categories` allowlist, discovery seed keywords (≤ 5), self-rules for the starting point.
- Migrations: 12a = 0052 + 0053 (renumber to >= 0055 if phase-9 merges first, see Pre-flight).

### Pre-flight 2026-10-14 (12a Task 0)
- **Migrations:** main ends 0051; unmerged phase-9 holds 0052-0054 (renumber 12a to >= 0055 if it merges first); phase-10 >= 0054. **P6:** `agencyServiceable` not on main; BACKLOG at merge: "apply agencyServiceable to rival-search and signals-weekly".
- Vendor shapes (maps categories, `ads_advertisers`, ScrapeCreators ad-library search) are in the 12a plan Task 0 and the fixtures `packages/collectors/test/fixtures/vendors/` dfs-maps-live-{dental,hvac}, dfs-ads-advertisers-live, scrapecreators-adlibrary-search.

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
- Unscheduled (12b final review, parked) → home card when the starting point is exhausted after 3 attempts; `editBriefItem` false warnings on self items; standard→quiet-at-delivery brief has no scorecard; self `ads_google` diff/tag spend; soften facts (BASELINE_BODY "map rankings" when none, 0-review velocity, `complete_profile` claim wording).

## Owner verification steps
On `cs_dev` with the worker running:
1. Run "Find competitors" for both clients: no wrong-category or self suggestions.
2. Granbury Dental Center and Archstone are rated Top rival or Worth watching.
3. Run cost <= $3 on `/platform/costs`.
4. Accept one suggestion: Meta/Google ad-account chips appear on its profile.
5. Next Monday `signals-weekly` fills the tracked competitors' tiers.

### 12b
On `cs_dev` (migration `0054` starting_point_brief; renumber if phase-9/10 merged first), with the worker running:
1. `pnpm db:migrate`.
2. On cs_dev, before approving, check each client has a self Google ads check and a rank scan captured since this deploy; if not, regenerate with `pnpm --filter @cs/worker brief-once --client <id> --starting-point --force` after they land. (The hourly `starting-point-schedule` at :15 makes the first one; it also waits for at least one tracked rival.) Until each client has its profile and reviews (or 48 h pass) the client home shows the "Preparing your starting point" checklist.
3. Open `/agency/approvals`: each starting point is "Needs review" (3-5 findings, one strength at most, scorecard on top, AM notice "Your starting point brief for {client} is ready to review."). Approve one: it is sent at once (Postmark test account).
4. The email arrives: subject "Your starting point with {agency}", heading, four tiles, scorecard table, finding cards, no upsell tag. Open the client view: the same tiles, scorecard rows (client first, rivals with tier chip, "—" where not measured) and cards.
5. After the next quiet Monday the client's brief shows "Where you stand" (▲/▼ with words, "since your starting point") and "First moves still open".

**Copy for owner review (not in the decided list):**
- AM notice second line: "It goes to the client as soon as you approve it."
- Starting-point `summary` (the web/email intro): "Where {client} stands against the {n} rival(s) we now watch. Weekly briefs from here show what changes." (singular "rival" when n = 1).
- Email heading: "Your starting point" (same as the web title).
- Approve confirmation for a starting point (Ruling 13): "Approved — sent to the client."; its button reads "Approve and send"; review-page heading "{client} · Starting point".
- Reply-rate fact (Ruling 12): "You replied to {you}% of reviews; the rival median is {median}%."
- Web tile deltas: "▲ {n} pts since your starting point" / "▼ {n} pts since your starting point" (ratings and counts without "pts"), and "No change since your starting point".
- "First moves still open" lists up to 3 open recommendation titles (the playbook titles) from the starting point.
- Failed starting-point AM notice adds a "Last error: …" line.
- The 8 default "why it matters" sentences (used when the writer is off or fails verification):
  - review_velocity_gap: Review count and freshness help decide who shows first on Google Maps.
  - reply_rate_gap: People comparing businesses read the replies, and replying shows you are active and care.
  - rating_gap: Most people compare star ratings before they call, so a lower rating can cost you calls.
  - rival_only_advertiser: Ads put rivals above the map results for searches you could be winning.
  - theme_weakness: A complaint that keeps coming up is what new customers notice first when they read your reviews.
  - theme_strength: Something reviewers keep praising is a reason to choose you, and it is worth saying out loud.
  - map_visibility_gap: Businesses in the map top three are the ones people see first when they search nearby.
  - profile_gap: A complete profile helps Google show you for more searches and helps people decide to call.
- Self-rule playbook effort/impact (same in both packs): ask_for_reviews L/H, reply_to_reviews L/M, fix_top_complaint M/H, consider_search_ads M/M, fix_theme M/M, promote_strength L/M, improve_map_rank M/H, complete_profile L/M.

## Brief (condensed)
**12a** (core spec §4.1 item 2, §4.2, §6.3): Maps search over client + pack seed keywords (≤ 5, 7x7 grid); hard filters (category allowlist, area, self, closed); overlap = rank-weighted presence x category/service match x distance; stage 2 on the top ~20 (Google `ads_advertisers`, Meta name search, 20-review sample, claimed/chain) gives activity; tiers Top rival / Worth watching / Minor (scores internal); auto-run with keywords + area + place id; top rivals pre-ticked up to `competitor_limit`; strong ad matches auto-attach, weak need confirm; weekly re-rating; null = not checked, 0 = checked-none; $3/run, 5 runs/agency/day.
**12b** (§8.5, §9.1; amend §9.1 item 5): `brief.kind='starting_point'`, one per client, generated when onboarding data is ready or after 48 h; deterministic pack self-rules (`review_velocity_gap`, `reply_rate_gap`, `rating_gap`, `rival_only_advertiser`, `theme_strength`/`theme_weakness`, `map_visibility_gap`, `profile_gap`) give 3-5 items; 4 tiles + scorecard + finding cards; quiet weeks carry "Where you stand"; client-home progress card.
**Binding:** crawler conduct; `WEB_MONITORING_ENABLED` unset; reads = `@cs/tools`, writes via `runTool`, refusals 404; `upsell_tag` never client-facing; `retracted_at IS NULL`; `redactForModel`; inline SVG charts; Jev review decisions, tau 0.85; never edit applied migrations.
**Backlog folded in:** DataForSEO "No Search Results." must record an empty successful observation (jobs `failed`, `ads_google` `vendor_error` today); franchise brands: pick the franchisee's ad accounts and jobs, not the brand's; unpinning Google advertisers can report mass "ads stopped" ~21 d later (retire silently before any unpin UI); `ensureSelfCompetitor` race and non-atomic competitor-limit check; before `WEB_MONITORING_ENABLED`: prospect `'disabled'` in accept/add tools and discovery in `convert_prospect`.
**Resolved:** daily cap per agency; auto-run now (Phase 11 reuses the entry point); discovery runs for prospects too.
