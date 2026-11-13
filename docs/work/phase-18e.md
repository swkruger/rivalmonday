# phase-18e — Wider sources 5: competitor social (ScrapeCreators)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18e   **Base:** main @ d9ff7b87
**Plan/spec:** none yet (spec = new decisions only, <= 15 KB; lean plan)

## Status (overwrite)
Kickoff done; brief below. No design decisions made. No branch is in flight (`git branch --no-merged main` is empty).

## Next (overwrite)
Owner answers the open questions (Brief 6); then `superpowers:brainstorming`, spec, lean plan, owner approval.

## Interfaces this branch adds or changes
None yet. Next free migration: `0110`.

## Assumes from other branches
Nothing in flight.

## Decisions (owner-approved)
- 2026-11-13: owner adds a second track to 18e: confidence in the Jev evals is now high, so add a setting to run review decisions on **Jev only** (no LLM step), with an option to **re-evaluate with all models** (today's Jev → LLM cascade / shadow comparison). Touches CLAUDE.md decision "Review decisions stay on Jev until pilot gold labels; verifier τ 0.85" and the cascade Jev → LLM → human.

## New backlog (target -> item)
None yet.

## Owner verification steps
None yet.

---
# Brief

## 1. Scope
**Track B (owner, 2026-11-13): Jev-only mode** — staff setting: decisions run on Jev alone; an on-demand/periodic "re-evaluate with all models" runs the full cascade for comparison. Reuse `@cs/ai` cascade, `AI_SHADOW_RATE`, `decision_sample`, eval suites (`packages/evals` reviews/changes).

No 18e row in the roadmap (rows 18a-18d only). Sources: CLAUDE.md "Wider sources (18)": *18e social (ScrapeCreators)*; 18a-1 spec D3/Non-goals ("follower counts outside Meta ads (18e)"; page-like line works only for steady advertisers, "18e social fills it"; `audience_growth` name "reused by 18e"). Out of Phase 18: FB Events, Nextdoor, video, Yelp, bought citations, public records, newsletters. Competitor social is marked "no" on the site compare table (`apps/site/content/compare.ts` `social`, ledger `cap-social`; claim-check: "no social kind"); BACKLOG says flip the row only after it ships. Competitors (Birdeye) sell posting frequency, audience growth, engagement.
Core spec cites likely: §1.5 (public info only), §4.2-4.4 (collection, evidence, vendor ledger), §6.1-6.3 (changes, scoring, briefs; no evidence, no claim), §6.5, §10.5 (cost/vendor limits). Build: a social source per rival (+ maybe self) -> evidence captures -> diff -> graded change lines + scorecard metric(s) + tools; no new paid vendor beyond ScrapeCreators (key already live).

## 2. Already built (reuse)
- ScrapeCreators client: `packages/collectors/src/vendors/scrapecreators.ts` (`fetchMetaAdsScrapeCreators`, `x-api-key`, cursor loop, `safeRecordVendorCall` ledger, `units = credits_charged`, `costUsd null`; empty-string cursor gotcha); `vendors/meta-search.ts`; `ads/meta.ts`. Limiter `VendorKey 'scrapecreators'` 5/s (`packages/core/src/server/token-bucket.ts`). Fixtures `vendors/fixture-fetch.ts` ($0 rehearsal; add social routes), `test/fixtures/vendors/scrapecreators-meta-ads.json`.
- Cost visibility: `packages/tools/src/platform/costs/adapters/scrapecreators.ts` (`/v1/credit-balance`, credits not USD, ~1 credit/request, no documented rate limit; research 2026-10-13-phase-8c).
- Page-like trend (18a-1): `packages/collectors/src/ads/meta-page.ts` (`pageReadingFrom`, `writeMetaPageObservation`, observation kind `meta_page`, key = page id, data `{pageId,pageName,likes}`), engine `structured/meta-page.ts` (-> change type `audience_growth`, scoring `size.audience_pct_for_full 20`, whole-business), tool `packages/tools/src/tools/audience.ts` (`get_audience_trend`, trace needs >= 4 weekly readings; web only), CLI `meta-page-backfill`. `competitor.meta_page_ids` (plural). Limit: only rivals with live ads get a reading.
- Scheduling: `packages/collectors/src/sources/{kinds,due,ensure}.ts` (`SOURCE_KINDS` incl. `tripadvisor`; `DEFAULT_SOURCE_KINDS` excludes opt-in kinds; self-business literal list in `due.ts`; `clientWorkAllowed` + `agencyServiceable`); worker `jobs/vendor.ts`.
- 18d pattern for a new source: `collectors/src/tripadvisor/{search,parse}.ts`, engine `structured/tripadvisor.ts` (`diffTripadvisor` in `DIFFERS`), migration `0109_events_venues.sql` (`competitor.tripadvisor_id/url`), pack flag `tripadvisor: true` (opt-in per vertical; $0 for others), `CHANNELS` += kind, capture `source` = kind, scorecard columns (`ScorecardMetric`), self rule (`event_gap`), tool + menu route, help copy, sign-off ledger, Ask cassette re-record (`eval:replay`, <= $5).
- Engine: `packages/engine/src/{structured,score,tag}` (`tag/structured.ts` summaries; `score.ts` `CHANGE_TYPES`, `WHOLE_BUSINESS_TYPES`, `BRIEF_ONLY_TYPES`; `type_weights` in packs, `scoring.version` bump + idempotent pack data migration like 0099/0100); `vendor-diff.ts`; brief pipeline `brief-report` (`topicOf`/`GROUP_PHRASE`), `CHANGE_LABELS`, `email/labels.ts`, `core/help/glossary.ts`.
- Observation/evidence: `observation` table (kind, key, data), `recordVendorCapture`, immutable evidence in R2; `get_audience_trend` is web-only (not citable by Ask/MCP).
- Read first: `docs/gotchas-cross-cutting.md`; `packages/{collectors,engine,db,tools}/CLAUDE.md`; `docs/research/2026-09-30-phase-2-vendor-apis.md` (2c, ScrapeCreators verified 2026-10-01). Only Meta Ad Library endpoints are documented in-repo; social profile/post endpoints need a probe.

## 3. Binding decisions (do not re-open)
Public information only; no evidence, no claim (Ask drops uncited figures). 18a: no new paid vendors; 18e = ScrapeCreators (key exists, in turbo `globalPassThroughEnv`). Out: video, FB Events/Nextdoor, Yelp, bought citations. Person images never stored (18a-3); images only via guarded byte fetch / SSRF guard. Client text names the category, never the vendor (never "ScrapeCreators"). Nothing usage-billed; credits 1 USD = 100; `clientWorkAllowed` in every paid-work scheduler; 130% pause; vendor calls via limiter + `vendor_call` ledger; fake gateway refused on Vercel. Jev cascade Jev -> LLM -> human; review decisions stay on Jev. Briefs: Major >= T / Notable >= T/2 / Minor; quiet = no written item; brief-only types never alert. New tool => `ISOLATION_FIXTURES`; new table => `TABLE_CLASS` + world rows; out-of-scope client => `not_found`. Web reads = registered `@cs/tools`; writes via `runTool`. Stat-card traces from real history only (>= 4 readings). New copy through `pnpm copy:review`; every `PageHeader` page needs help key + guides. Readers filter `retracted_at IS NULL`; client lists `client.status='active'`. Pilot scale <= 20 agencies x 3 clients; launch gate <= 8 DB stages/page. 18d precedent: probe first, owner picks, opt-in via vertical pack, cost per client/week quoted.

## 4. Backlog to fold in
- `[ ] Social collection, if ever built: flip the compare row from "Not offered"` - *phase-17c* (BACKLOG:201; site `compare.ts` `social` + `cap-social` ledger + `compare.test.ts:114`)
- `[ ] 18e/later -> Google Events SERP re-probe (DataForSEO events endpoint returned 50304 on 2026-11-11; coverage on real venues)` - *18d probe* (not social; re-probe only)
- `[ ] Later -> Meta ad images: ask the Meta ads vendor whether its API can deliver image files (fbcdn robots disallows us)` - *from 18a-3 owner decision* (ScrapeCreators is the Meta ads fallback vendor)
- `[ ] Later -> audience cooldown keyed on detected_at over-suppresses after a long engine stall` - *from 18a-1 final review* (touches `audience_growth`)
- `[ ] Polish -> change summaries in engine/src/tag/structured.ts are outside the copy:review scan` - *18b-2 final review* (new social summaries hit this)
- Not social, leave: `Later -> Google Q&A, News, Trustpilot` - *18b brief*

## 5. In-flight workstreams
`git branch --no-merged main`: none. Worktree `staging-worker` is a detached HEAD at 292dddc3 (staging worker; no expected 18e overlap). Migration `0110` is free.

## 6. Open questions (ordered by design impact)
1. Split into sub-phases? A) one phase (18d style) B) 18e-1 Facebook page + Instagram, 18e-2 other networks C) 18e-1 probe + collection, 18e-2 briefs/UI. Rec: B after the probe.
2. Networks? A) Facebook page posts + Instagram only B) + TikTok C) + LinkedIn, X, YouTube channel text. Video content itself is out (metadata/captions only if at all). Rec: A; TikTok later if the probe shows value.
3. Signals? A) cadence + follower trend B) A + promo/offer detection in post text (feeds `price_point` like Google posts) C) B + engagement (likes/comments). Rec: B; engagement is noisy at small-business scale.
4. Paid probe first? ScrapeCreators bills ~1 credit/request (`credits_charged`); USD per credit is not recorded in the repo (confirm on the dashboard; balance was 7,099 credits on 2026-10-13). A) probe ~10 rivals first (est. < 100 credits) then decide B) design first C) skip. Rec: A.
5. Handle discovery/confirm? A) from GBP/website links + one name search, agency/owner confirms (never auto-link on ambiguity) B) fully automatic on name match like Tripadvisor C) manual entry only. Rec: A with auto-suggest.
6. Track self too? A) yes (gap rule + trend) B) rivals only. Rec: A, mirroring `SELF_SOURCES`.
7. Opt-in scope? A) all verticals B) pack flag per vertical (venues first, $0 for others). Rec: B to bound cost.
8. Cadence/cost cap? weekly Sunday vs. daily; per-client/week cap quote. Rec: weekly.
9. Grading: brief-only like `event_listed`, or alert-capable for a viral spike? Rec: brief-only.
10. UI/channels: new page vs. scorecard column + brief lines; Ask/MCP exposure (needs citable evidence + cassette re-record). Rec: scorecard + brief lines + one tool; flip the site compare row at merge.
