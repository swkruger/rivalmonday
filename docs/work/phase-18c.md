# phase-18c — Wider sources, part 3: citations (directory listings, client NAP hygiene, rival citation growth)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18c   **Base:** main @ 88974241
**Plan/spec:** [spec](../superpowers/specs/2026-11-10-phase-18c-citations-design.md) · [plan](../superpowers/plans/2026-11-10-phase-18c-citations.md)

## Status (overwrite)
2026-11-10: spec + lean plan written (`docs/superpowers/plans/2026-11-10-phase-18c-citations.md`, Tasks 0-13); awaiting owner approval.

## Next (overwrite)
Spec (`docs/superpowers/specs/2026-11-10-phase-18c-citations-design.md`) → lean plan → owner approval → SDD.

## Interfaces this branch adds or changes
TBD. Migration: next free on main is **0107**; site-audiences claims none.

## Assumes from other branches
- `site-audiences` (site only; no migration/env/`apps/web`): no overlap. `apps/site/content/roadmap.ts:33` ("Listings and citations") stays; making it a live claim is a site follow-up after both merge.

## Decisions (owner-approved)
2026-11-10: owner took every brief recommendation (1C 2C 3C 4B 5B 6B 7A 8A 9A). Intent (owner): find the client's missing or incorrect citations; a newly found listing shows as a Minor change.
- Split: 18c-1 now (search-based presence + name/phone from results); 18c-2 (listing-page NAP via crawler) after prod deploy + `/bot` (backlog).
- Our call (owner to confirm in spec review): "new listing" Minor = tracked rival newly listed (`citation_added`, brief-only, never alerts); the client's own new/missing/mismatched listings show in the Listings page + `citation_gap` self-rule.
- Owner 2026-11-10: the citation view is its own client menu item + page (our call: "Listings", `/c/<id>/listings`, after Rankings), not a Rankings section.
- Owner 2026-11-10: directory groups (general / home_services / dental_health) picked per vertical, operators tick them for DB verticals; "Also found on" = informational non-catalogue hits from the name+phone search. No searching directories a vertical didn't pick.

## New backlog (target → item)
- none yet

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
1. **Split 18c?** (A) one branch; (B) 18c-1 presence from Google results (catalogue, audit job, table, self-rule + play, tool + Rankings section, rival events) / 18c-2 listing-page reads for NAP via our crawler (dark like 18a-2); (C) B, 18c-2 only after the prod deploy + `/bot`. **Rec: C** — page reads need web monitoring on.
2. **How to find listings (no new vendor).** (A) one organic call per directory × business (`site:<host> "<name>" <city>`, $0.002; 8 dirs × 4 businesses ≈ $0.06/client/run); (B) one `"<name>" "<phone>"` search per business, depth ≤ 50, hosts classified against the catalogue (≈ $0.01/client/run; misses deep listings); (C) B, then A only for catalogue directories B missed, after a Task 0 probe (≤ $0.10) comparing hit rate with a manual check. **Rec: C.** Free extra: `serp_snapshot` already shows which directories rank page one for the client's keywords.
3. **NAP consistency.** (A) presence only; (B) name/phone match read from the result title/snippet, address "not checked" when absent; (C) B now, full NAP from the listing page in 18c-2 where robots allow. **Rec: C** — never guess a mismatch.
4. **Directory catalogue.** (A) fixed list in code; (B) per-vertical list in the pack YAML (`citations.directories`: host, label, add-listing URL), inherited by DB verticals; (C) B, seeded with the `SHARED_HOSTS` directories seen in `serp_snapshot`. **Rec: B.** Excluded by binding rules: Yelp, Healthgrades, Zocdoc, Nextdoor. Bing Places / Apple Maps: include only if Task 0 shows search can find their listing pages.
5. **Rival citation growth as events.** (A) no events, audit view only; (B) new change type `citation_added` (rival newly listed; grouped per rival; brief-only; pack v7); (C) reuse `profile_change`. **Rec: B** — "rival citation growth" needs a brief line; never alert.
6. **What the client sees.** (A) self-rule `citation_gap` + `fix_citations` play (starting point, recommendations) only; (B) A + "Directories" section on Rankings (you vs top rivals: listed / name+phone match / not found / not checked) + tool `get_citation_audit` (web, MCP, Friday); (C) B + scorecard row metric "Directories listed". **Rec: B** — the scorecard is already 7 columns wide in email/PDF.
7. **Cadence and caps.** (A) once at profile completion, then monthly for self + Top-rival tier (≤ 3 rivals); (B) A + "Check now" ≤ 1/client/week; (C) quarterly. **Rec: A** — listings move slowly.
8. **Storage.** (A) global `citation_listing` per competitor × directory (public facts, shared like `ad`; tenants via `client_competitor` + self); (B) tenant-private like `serp_snapshot`. **Rec: A** — queries use the business's own name/phone/city.
9. **Guided fixes.** (A) out — the play links the directory's add-listing page; (B) prefilled NAP block + claim link per missing directory (copy-only); (C) defer to the act-on-recommendations phase. **Rec: A** — keeps the deferred action feature intact.
