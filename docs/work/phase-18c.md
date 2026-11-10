# phase-18c — Wider sources, part 3: citations (directory listings, client NAP hygiene, rival citation growth)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18c   **Base:** main @ 88974241
**Plan/spec:** [spec](../superpowers/specs/2026-11-10-phase-18c-citations-design.md) · [plan](../superpowers/plans/2026-11-10-phase-18c-citations.md)

## Status (overwrite)
2026-11-10: plan approved; SDD Task 0 (pre-flight + probe) done, live spend $0.078. **Blocked** on controller/owner rulings B1–B4 (below) before Tasks 3b/4.

## Next (overwrite)
Rulings on B1–B4 (`.superpowers/sdd/2026-11-10-phase-18c-citations/preflight-scan.md`) → SDD Task 1.

## Task 0 results (2026-11-10)
**Probe** (live organic, US, en; businesses from cs_dev: Atomic Plumbing + rival Daffan Cooling & Heating, Granbury Park Dental + rival Lakeview Dental, all Granbury TX). Spend **$0.078** of $0.10: stage 1 depth 20 = $0.004 (4 calls), depth 10 = $0.002, depth 50 = 40101 error 2/2 (free); `site:` calls **$0.01 each** (6). 40101 "Internal SE Server Error" on 5 of 17 calls (free; retry works).
- **B1** organic `url` = `https://google.com/goto?url=…`, `domain` = `google.com` on every item; the real host is only in `breadcrumb` ("https://www.angi.com › TX › Granbury") or `website_name` ("Facebook · Atomic Plumbing"). Also breaks 18b-2 on main (`get_search_visibility`/`structured/serp.ts` match `domain`).
- **B2** `site:<host>` is ignored: `site:bbb.org` and `site:bing.com` for Atomic returned identical results (no bbb.org item), billed $0.01.
- **B3** stage 1 is relaxed by Google: exact name+phone often returns other businesses (e.g. "Lakeview Dental" Roy UT on MapQuest) → name-only hits need a city check. GBP phones are often tracking numbers (Daffan, Lakeview listings show other numbers).
- **B4** phone-only hits on BBB category pages ("Plumber near Granbury, TX") would read "Name differs".
- Phone format in snippets: `(817) 219-4790` and `817-219-4790`; `description` present on organic items.
**Hit rate** (stage 1 vs manual web check; manual = listing confirmed): Atomic 4/6 (angi, bbb, mapquest, facebook; missed yellowpages, homeadvisor), Daffan 2/2 (mapquest, facebook), Lakeview 0/1 (mapquest found only via a same-name UT business), Granbury Park Dental 0/0 (no catalogue listing confirmed). Per directory: facebook 2/2, mapquest 2/3, angi 1/1, bbb 1/1, yellowpages 0/1, homeadvisor 0/1; Bing Places 0/4 and Apple Maps 0/4 searched (Google does not index them). **Overall recall 6/9 = 67 %** (stage 1 only; stage 2 contributed nothing). Small sample.
**Rulings (C3):** Bing Places + Apple Maps **removed**; recall ≥ 50 % → no stop; depth 50 unusable → **stage 1 depth 20**, `CITATION_CALL_USD.stage1 = 0.004`. Migration stays **0107**.
**add_listing_url** (hand-checked: curl status + page title / web search):
| host | add_listing_url | check |
|---|---|---|
| facebook.com | https://www.facebook.com/pages/create | "Create a Page" (bots get 400) |
| bbb.org | https://www.bbb.org/get-listed | 200 "Submit a business to our directory" |
| yellowpages.com | https://www.yellowpages.com/claim-your-listing | 200 "Claim Your Yellow Pages Business Listing" |
| manta.com | https://www.manta.com/business-listings/add-your-company | 200 (linked from the home page) |
| foursquare.com | https://business.foursquare.com/claim | 200 "Business Listings" |
| mapquest.com | https://business.mapquest.com/ | 200 "Business Listing Updater" |
| angi.com | https://signup.angi.com/pro | 200 "Angi Pro" (pro.angi.com redirects) |
| homeadvisor.com | https://pro.homeadvisor.com/ | 200 |
| thumbtack.com | https://www.thumbtack.com/pro | 200 |
| houzz.com | https://pro.houzz.com/pro | Houzz Pro sign-up (www.houzz.com/pro 301s here; bots 403) |
| porch.com | https://pro.porch.com/how-it-works | 200 "How it Works" (pro.porch.com redirects) |
| findadentist.ada.org | https://www.ada.org/join-the-ada/member-benefits/find-a-dentist | 200; listing comes with ADA membership (My ADA) |

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
- **hotfix/next** → 18b-2 organic matching uses `domain`, which the vendor now returns as `google.com` (Task 0 B1): derive host from `breadcrumb`.

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
