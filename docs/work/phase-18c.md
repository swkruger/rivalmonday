# phase-18c — Wider sources, part 3: citations (directory listings, client NAP hygiene, rival citation growth)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18c   **Base:** main @ 88974241
**Plan/spec:** [spec](../superpowers/specs/2026-11-10-phase-18c-citations-design.md) · [plan](../superpowers/plans/2026-11-10-phase-18c-citations.md)

## Status (overwrite)
2026-11-10: **18c-1 built and reviewed** (SDD Tasks 0-13, 40+ commits). Final whole-branch review clean after one fix wave; `test:affected` failures fixed (focused re-runs green); `e2e:affected --full` 154 passed incl. `next build`. **Open:** Ask eval cassette — 48/50 recorded ($2.07), 2 flaky live turns; uncommitted `packages/evals/cassettes/ask.json`; `eval:replay` fails on `ask` until a `record --fill` (~$0.05-0.15, owner OK pending; never run vitest on this worktree DB meanwhile).

## Next (overwrite)
1. Owner: OK the ask `record --fill`; then `eval run --suite ask --mode replay --update-baseline`, commit cassette + baseline.
2. Owner: `pnpm copy:review` (new strings: Listings page, help + 2 guides, glossary, play/self-rule copy, recommendations subtitle, operator group labels; flag: "Add your business to …" reads oddly for mismatch-only).
3. `/rm-merge` on the owner's go-ahead. After merge, any env with data: `pnpm db:migrate` (0107) → deploy worker, then web; `pnpm kb:seed`. Staging: wait for the 09:00 UTC `citation-audit` (or run `citation-audit-client` for one client), check `/c/<id>/listings`, one `citation_audit_run.est_usd` ≤ 0.20, no banned host in `citation_listing`. Old 18b-2 `serp_snapshot` rows stay unmatched (domain google.com); staging rivals may read "entered page one" once.

## Task 0 results (2026-11-10)
Probe $0.078: organic results are `google.com/goto` wrappers (host from breadcrumb), vendor ignores `site:` (billed $0.01), depth 50 errors → depth 20 at $0.004; Bing Places + Apple Maps removed (0/4); stage-1 recall 6/9 = 67 %. Details + rulings B1-B4: SDD ledger / spec C2-C6.

## Interfaces this branch adds or changes
- Migration **0107**: `citation_listing` (global_public, PK competitor+host, `newly_found_at`, `in_catalogue`), `citation_audit_run` (tenant_client), recommendation source `listings` + `recommendation_listings_live_unique`; pack v7 backfill.
- Packs v7: `citations.directory_groups` (generic) + `groups`; `citation_added` weight 0.3; self rule `citation_gap`; play `fix_citations`; `CHANNELS += directories`.
- `parseSerp` derives the real host (`organicHost`, breadcrumb/website_name) — fixes 18b-2 `get_search_visibility` matching.
- Worker: cron `citation-audit` 09:00 UTC, job `citation-audit-client`; `recommendForCitations`.
- Tool `get_citation_audit` (web/MCP/Ask; `shownPhone` web-only); `get_starting_point_status.checks.citations`; `review_vertical` action `groups`.
- Web: client page `/c/<id>/listings` ("Listings" after Local rankings); operator group checkboxes.
- `packages/ai`: a body-read timeout is retried once (within the existing 2 attempts).

## Assumes from other branches
- `site-audiences` (site only; no migration/env/`apps/web`): no overlap. `apps/site/content/roadmap.ts:33` ("Listings and citations") stays; making it a live claim is a site follow-up after both merge.

## Decisions (owner-approved)
2026-11-10: owner took every brief recommendation (1C 2C 3C 4B 5B 6B 7A 8A 9A). Intent (owner): find the client's missing or incorrect citations; a newly found listing shows as a Minor change.
- Split: 18c-1 now (search-based presence + name/phone from results); 18c-2 (listing-page NAP via crawler) after prod deploy + `/bot` (backlog).
- Our call (owner to confirm in spec review): "new listing" Minor = tracked rival newly listed (`citation_added`, brief-only, never alerts); the client's own new/missing/mismatched listings show in the Listings page + `citation_gap` self-rule.
- Owner 2026-11-10: the citation view is its own client menu item + page (our call: "Listings", `/c/<id>/listings`, after Rankings), not a Rankings section.
- Owner 2026-11-10: directory groups (general / home_services / dental_health) picked per vertical, operators tick them for DB verticals; "Also found on" = informational non-catalogue hits from the name+phone search. No searching directories a vertical didn't pick.

## New backlog (target → item)
- **hotfix/next** → 18b-2 organic matching used `domain` (vendor returns `google.com`); fixed for new scans in 18c (host from breadcrumb). **18b-2 `serp_snapshot` rows before 18c stay unmatched (domain google.com) — optional backfill from stored captures.**
- **18c-2** → listing-page NAP + address via the crawler (after prod + `/bot` + `WEB_MONITORING_ENABLED`); replaces "Address: not checked".
- **later** → platform page for uncatalogued hosts ("Also found on" promotion; OPS SQL meanwhile); "check now" for a client's listings; scorecard row for listings; editing citation groups on already-reviewed verticals.
- **phase-16** → no-self clients: "Link Google listing" prompt (the Listings page only shows a note).

## Brief

### Scope
- **18a kickoff decision 1:** 18c = citations: client NAP hygiene, rival citation growth / partner directories. Out of Phase 18: bought citation data, Yelp, public records. No new paid vendors.
- Prior sketch (deferred proposal `research/2026-10-29-act-on-recommendations-proposal.md` § 4, § Citation data): per-vertical directory catalogue, `citation-audit` job (monthly), `citation_listing` table, Citations view (you vs top rivals: listed / NAP match / not listed), `citation_gap` self-rule + `fix_citations` play; search-only fallback where robots disallow; "not checked" instead of guessing. Its Yelp/Nextdoor/Healthgrades/Zocdoc entries are excluded (below).
- **Core spec:** §1.5 (no evidence no claim; honest collection, blocks recorded), §2.2 (never Yelp, Healthgrades/Zocdoc content), §4.2 (collectors, crawler conduct), §4.3 (global public facts vs tenant analysis), §4.4 (evidence + typed observations), §6.1–6.3 (diff, types, score 70/40), §6.5 (self business: benchmarked, never scored), §8.2 (tools), §8.5 (plays), §9.1 (verified brief), §10.5 (packs).

### Already built — reuse, don't rebuild
- Vendor: `collectors/src/vendors/dataforseo.ts` (`createDataForSeo`). Routes: `serp/google/{maps,organic,ads_*,jobs}`, `business_data/google/{my_business_info,my_business_updates,reviews}`. GBP `local_business_links`/`directory` = null (no citation data).
- Organic search: `collectors/src/rankings/serp.ts` ($0.002/call), `rankKeywordsFor` (`rankings/settings.ts`), table `serp_snapshot` (0106, tenant_client; page-one organic incl. directory hosts — free signal), `engine/src/structured/serp.ts` `SHARED_HOSTS` (directory hosts).
- Evidence `evidence/vendor-capture.ts`; crawler `web/{robots,polite}.ts`, `net/guard.ts` (dark).
- Sources: `sources/kinds.ts` `SOURCE_KINDS`, `sources/{due,ensure}.ts`, `local/self.ts` `SELF_SOURCES`; NAP inputs `client.phone`/`client.address` (`db/schema/tenancy.ts`), GBP phone/address/url (`gbp/collect-gbp.ts`, `structured/gbp.ts`), `competitor.domain/place_id`.
- Engine: `core/domain.ts` `CHANGE_TYPES`, `CHANNELS`, `SELF_RULE_IDS`; `score/score.ts` (`WHOLE_BUSINESS_TYPES`, `profileCap` brief-only cap); packs `verticals/packs/*.yaml` (`type_weights`, `playbooks`, `self_rules`; pack bump = data migration, pattern 0099/0101); `briefs/{self-rules,scorecard-model,starting-point,recommendations,playbooks}.ts`; `core/brief-report.ts` `topicOf` + `email` `CHANGE_LABELS`/`GROUP_PHRASE` (must cover new types).
- Tools/UI: `tools/src/tools/rankings.ts` (`get_search_visibility`), `isolation/fixtures.ts`, `TABLE_CLASS`; help `docs/help/pages/`.
- Templates: 18b-1 (source kind → capture → differ → stage → scorecard, 0105); 18b-2 (own table, tool + Rankings section, 0106).

### Binding decisions (never re-open)
- Phase 18: no new paid vendors (DataForSEO/Apify/ScrapeCreators only); out: bought citations, Yelp, public records, newsletters, FB Events/Nextdoor; client text names the category, never the vendor.
- §2.2 never: Yelp content, Healthgrades/Zocdoc, logged-in scraping, anti-bot bypass.
- Crawler: UA `RivalMondayBot`, RFC 9309 (5xx ⇒ disallow), ≥ 3 s/host, one worker; SSRF guard; web dark until `/bot` is live.
- No evidence, no claim; Ask drops uncited figures; stat traces from real history only; first pull = silent baseline; two-capture confirm for held fields (18a-1/18b-1).
- Paid work via `clientWorkAllowed`, credits/caps (7b); new tool ⇒ `ISOLATION_FIXTURES`, new table ⇒ `TABLE_CLASS` + world rows, out-of-scope ⇒ `not_found` (7c1); web reads = registered tools, writes via `runTool`.
- Self business is benchmarked, never scored (§6.5); `profile_change`-style brief-only cap for weak signals; scorecard rows, tiles stay 4.

### Backlog to fold in (verbatim)
No item is tagged 18c. Related:
- [ ] Act on a recommendation: drafted review replies, GBP edits/posts, citation audit + fixes, review request kit; … — *deferred 2026-10-29*
- [ ] Unscheduled → store the client's own website and match it in `get_search_visibility` (own listing is unhighlighted when the self competitor has no domain) — *18b-2 Task 4*
- [ ] No-listing clients have no self competitor (scorecard/rank self data empty until a listing is linked in Settings); consider a "Link Google listing" prompt — *phase-16*

### Open questions for the owner
All answered 2026-11-10 (1C 2C 3C 4B 5B 6B 7A 8A 9A; see Decisions and the spec).
