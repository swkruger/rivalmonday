# phase-12 — Competitor discovery & rating (12a) + starting-point brief (12b)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-12   **Base:** main @ c84ca97
**Plan/spec:** spec `docs/superpowers/specs/2026-10-14-phase-12-discovery-and-starting-point-design.md` (owner-approved 2026-10-14) · plans `docs/superpowers/plans/2026-10-14-phase-12a-competitor-discovery.md`, `…-12b-starting-point-brief.md` (owner-approved 2026-10-14, subagent-driven)

## Status (overwrite)
**12a + 12b complete 2026-10-15** (subagent-driven; every task reviewed; both final whole-branch reviews + one fix wave each, re-reviewed clean). HEAD 22bd256, 53 commits ahead of main. `test:affected --base main` 15/15; `e2e:affected` all green except the known smoke.spec :6/:41 magic-link rate-limit flake. Test DB `cs_phase_12_test`. Nothing uncommitted.

## Next (overwrite)
1. Owner: go-ahead for `/rm-merge phase-12` (full unit + E2E suites run there). Phase-9 is unmerged and also uses 0052–0056 → whoever merges second renumbers.
2. After merge: owner verification steps below on `cs_dev` (`pnpm db:migrate` first; cs_dev is at 0046).

## Interfaces this branch adds or changes
(12a + 12b built)
- Tables: `discovery_run`, `competitor_signal`. `competitor_suggestion` + `category`, `distance_km`, `overlap`, `activity`, `tier`, `signals` jsonb, `ad_matches` jsonb, `run_id`, `last_seen_at`. `brief.kind` + `'starting_point'` (extend CHECK `brief_kind_check`; one per client), `brief.scorecard` jsonb; `brief_item.competitor_id` nullable + `subject` `'self'|'competitor'`.
- Vertical packs: `discovery.categories` allowlist, discovery seed keywords (≤ 5), self-rules for the starting point.
- Migrations: 0052 `discovery_rating`, 0053 `discovery_rating_rls`, 0054 `starting_point_brief`, 0055 `client_activated_backfill` (renumber if phase-9 merges first). `client.activated_at`; `vendor_task.suggestion_id` (competitor_id nullable); `client_competitor.pending_ad_matches`; `rank_snapshot.capture_id` now filled.
- Tools: `get_competitor_signals`, `get_competitor_ad_matches`, `accept_competitor_suggestions`, `confirm_ad_match`/`remove_ad_match` (agency-only), `get_starting_point_status`; `startCompetitorSearch` exported from `@cs/tools` (Phase 11 entry point). Old `suggest-competitors` job removed.
- Worker jobs: `rival-search`, `rival-finalise`, `rival-sweep` (*/15), `signals-weekly` (Mon 09:00 UTC), `starting-point-schedule` (:15), `starting-point-client`. CLI `brief-once --starting-point [--force]`.
- Packs v3: `discovery`, `self_rules`, `audience_noun`, playbook `effort`/`impact`.

## Assumes from other branches
- **phase-9** (9a executing): migrations 0052–0056 (renumber collision); its `agencyServiceable` filter must also cover rival-search, signals-weekly, the self-competitor sweep and `listStartingPointDue` at its merge.
- **phase-10** (planned): edits `create_client`. **Phase 11** (unplanned): reuses `startCompetitorSearch` and starting-point readiness.

## Decisions (owner-approved)
Spec D1–D13. Owner 2026-10-15: discovery auto-runs only the first time a profile is complete; later runs via the button. Execution rulings (full list in the session hand-off): ad-account removal only by the sole tracker (agency-only); suggestions list = latest done run + any later run; self competitor gets an `ads_google` source + domain backfill; theme_weakness = mentioned ≥10 pts more for a negative theme; starting point waits for ≥1 tracked rival (else 48 h); quiet-week baseline needs an approved/sent starting point.

## New backlog (target → item)
- Unscheduled → `tier_change` event when a tracked competitor's tier changes (deferred by plan 12a P4: `detected_change_subject_check` needs a capture or rank scan)
- Phase 12 merge → STATE "Next up" order 12 → 9 → 10 → 11 (owner 2026-10-14)
- Phase 12 merge → add roadmap row 12; amend core spec §9.1 item 5 (quiet week carries a "Where you stand" scorecard) and §4.1 item 2.
- Polish → starting-point approval copy "Approved — sent to the client." is wrong when delivery is unconfigured (show by status); "In progress" label while waiting for the agency to track a rival; deleted-brief notice link 404s after `--force`
- Unscheduled (12a, parked) → re-tracked competitor keeps a stale `competitor_signal` until Monday; a failed first-ever run's suggestions stay hidden; sweep clock from `started_at`; bulk-accept lock order; deduped enqueue not detected
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

## Brief
Superseded by the spec (D1–D13) and plans; resolved kickoff questions: daily cap per agency, auto-run built now (Phase 11 reuses it), discovery runs for prospects too.
