# phase-18a — Wider sources, part 1: brief what we already collect (no new paid vendors)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18a   **Base:** main @ 4b305a7e
**Spec/plan:** 18a-1 `docs/superpowers/{specs,plans}/2026-11-08-phase-18a1-gbp-meta*`; 18a-2 `…/2026-11-08-phase-18a2-web-readiness*` (spec O1–O4, D1–D7; plan Tasks 0–13)

## Status (overwrite)
18a-1 done (final review clean 2026-11-08; e2e:affected 153/153, profile gate pass). 18a-2 (web readiness) Tasks 0-13 done on this branch (ledger `.superpowers/sdd/2026-11-08-phase-18a2-web-readiness/progress.md`); final branch review next. Both halves merge together. Ships dark: nothing crawls until `WEB_MONITORING_ENABLED` is set (OPS "Switching on website monitoring (18a-2)"). Not on the roadmap yet.

## Next (overwrite)
Final review + one fix wave (carry: one try/catch around the whole `convert_prospect` loop). At `/rm-merge` (both halves): `.describe` on `PriceNowView.source` (M5); one Ask eval re-record (`record --fill`; tool spec changes: 18a-1 `get_price_matrix` `source`, 18a-2 `search_events` and `Discovery` enums incl. `deferred`; past cost $1.6-7.65); one brief eval re-record (new `EVIDENCE_WORDING` lines for `site_feature`/`new_page`); bump `AD_PRICE_SINCE` if the deploy slips by weeks; owner signs new copy in `pnpm copy:review`. 18a-3 (ad images) stays a separate branch.

## Interfaces this branch adds or changes
- **Migration 0100 (18a-1):** `price_point.ad_id` (FK `ad`), `tracked_page_id` now nullable, CHECK exactly one of the two, unique index `price_point_ad_open_unique`; `ad.event` column; vertical pack v5 data (scoring v5).
- **Change types** `status_change` (GBP closed/reopened; alert-capable), `profile_change` (title/domain/hours/description), `audience_growth` (Meta Page likes). Each has `CHANGE_LABELS`, status wording and glossary entries.
- **`observation` kind `meta_page`** (Page likes per capture). Worker CLI `meta-page-backfill [--dry-run]` fills it from stored raw Meta captures.
- **Engine:** stage `ad_price_extract` (`AD_PRICE_SINCE` = 2026-11-08; Meta ad copy only, rules-only prices) and worker job `engine-ad-price`. `GBP_STATUS_PHRASE` in `packages/engine/src/structured/gbp-status.ts`.
- **Tool** `get_audience_trend` (web only; `ISOLATION_FIXTURES` entry; out-of-scope => `not_found`). Competitor page shows a Page likes stat from 4 weekly points.
- **`PriceNow.source`** (`web` | `meta_ad`; `PriceNowView` same); the pricing page tags ad prices "From an ad"; ad prices never count toward the 90-day tag.

## Interfaces 18a-2 (web readiness; spec O1-O4, D1-D7)
- **Migrations:** `0101_web_readiness_pack_v6` (pack v6 data, scoring v6; `typeWeights` is strict over `CHANGE_TYPES`, so it must apply before the new types parse) and `0102_web_readiness` (schema). Columns/tables: `capture.markup_sha`; `site_url` (competitor_id, url_key, url, source `sitemap|nav`, first/last_seen_at); `site_discovery` (competitor_id PK, last_run_at, next_due_at, homepage_status, urls, truncated, runs); `tracked_page.{inactive_reason, appeared_at}`. The `tracked_page` CHECK (an inactive row needs a reason) is hand SQL after the backfill, not in the Drizzle schema. Both tables have `TABLE_CLASS` + world rows.
- **Change types** `site_feature` (a website tool added/removed) and `new_page` (a page first seen after tracking began). Categories `online_booking | live_chat | financing | review_widget` (`SITE_FEATURE_CATEGORIES`, `@cs/core`); call tracking was dropped (customers never see it). Labels, wording, glossary, scoring weight and `detailsSignature` cases exist; `SERVICE_MAPPED_TYPES` includes `new_page`. Both route through `isStructuredChange` (not `source === 'web'`); `site_feature` is exempt from supersede, `new_page` is not.
- **Vendor never in client text (J1):** site_feature text is `<category label> (on <path>)`; the vendor lives only in `details.vendor`. `new_page` summary = `details.items[0].label` (h1, else `<title>`), else the path of `details.pageUrl`, never `afterText`.
- **Collectors:** `WEB_COLLECTOR_VERSION` `web/2` (a capture is unchanged only when text AND `markup_sha` match, so each page gets one full capture after deploy). Pure parsers in `collectors/src/web/markup*.ts`: `siteFeatures`, `SITE_FEATURE_REGISTRY` (`_VERSION` = 1, entries carry `since`), `jsonLdOffers`, `markupSha`. Re-discovery refresh mode (`discoverPages`; `pageKey` = host without www/scheme + path): new, gone, duplicate and replaced pages; at the 25-page cap a replacement is atomic, otherwise it adds and replaces nothing; `MAX_ACTIVE_PAGES` (25) lives in `@cs/core`.
- **Engine:** stage `site_features` (two-capture confirmation, observations, 28-day cooldown on `captured_at`; skips untracked/self; rules only, no AI); worker job `engine-site-features`. `price_extract` also reads JSON-LD Offer/Product prices (missing `priceCurrency` = USD; rules only, a discount never becomes a price). Missing or unreadable stored html counts as truncated: text prices are written, no spans end.
- **Scheduler:** worker job `discover-schedule` (daily; `REDISCOVERY_DAYS` = 28; <= 25 competitors/day; <= 20 new URLs classified per run, the rest stay in `site_url` unrecorded). A competitor's first run is a baseline: no events. Every run sets `next_due_at` = greatest(existing, now + 28 d). Idle unless `WEB_MONITORING_ENABLED` (passed as `createWebJobs(..., { webMonitoring })`). Uses `clientWorkAllowed`.
- **Tools:** `Discovery` = `queued | disabled | deferred | not_needed` (bulk-note precedence disabled > deferred > queued). `deferred` = prospect or paused/archived/spend-paused client: no crawl; `convert_prospect` starts discovery. `add_tracked_page` matches by page key. No new tool, so `ISOLATION_FIXTURES` is unchanged; `search_events` output enums gained the new types.

## Rollout (in order)
1. Migrate (`pnpm db:migrate`), deploy web + worker.
2. `pnpm --filter @cs/worker meta-page-backfill --dry-run`, then without `--dry-run`.
3. `pnpm --filter @cs/worker rescore --dry-run`, then without (read the `archive->brief` line first). No re-score for 18a-2 (new types appear only on new captures).
4. 18a-2 switch-on is separate and later: OPS "Switching on website monitoring (18a-2)" (needs `rivalmonday.app/bot` live).

## Owner notes
- GBP closure values (`closed_forever` / `temporarily_closed`) are unverified live: none exists in `cs_dev`; the first real closure in the pilot confirms them.
- Copy sign-off: `pnpm copy:status --todo` lists 0 strings to edit (2026-11-08). Re-run after any copy change; sign off in `pnpm copy:review`.

## Assumes from other branches
- `brief-report` (planned, unmerged): `@cs/core` `brief-report.ts` `topicOf` (unknown types → `offers` "Website, prices & services") and `@cs/email` `GROUP_PHRASE` are tested to cover every `CHANGE_LABELS` key; a new change type must add both. Edits `briefs/{generate,summary,review,deliver}.ts`, `labels.ts`; 18a rebases onto it.

## Decisions (owner-approved)
1. Phase 18 "Wider sources" (brainstorm 2026-11-08): **18a** use what we have (this branch) → **18b** more Google via DataForSEO (GBP posts/offers, Google Guaranteed/LSA, organic + AI Overview, news/awards, Tripadvisor/Trustpilot) → **18c** citations (client NAP hygiene, rival citation growth/partner directories) → **18d** events & entertainment vertical → **18e** social via ScrapeCreators. Out of Phase 18: public records, newsletters, FB Events/Nextdoor, ad image/video analysis, bought citation data, Yelp.
2. 18a adds no paid vendors.
3. 18a splits: **18a-1** GBP + Meta (this branch; spec `docs/superpowers/specs/2026-11-08-phase-18a1-gbp-meta-design.md`, O1–O6), **18a-2** web readiness (later moved onto this branch; merges with 18a-1), **18a-3** reading ad images (own branch, after 18a-1).
4. 18a-3 basis (checked 2026-11-08, OpenRouter): `typesafe/jev-1.14` takes text + image input, output = decisions only (choice/score/noul; no text read-out), $0.042/M prompt tokens, completion free. Plan: Jev triages ad images (service, offer, theme, "shows a price"); only price-bearing images go to a vision LLM to read the amount. Start with Google ad images (no copy today). Needs: image parts in `@cs/ai` Jev provider, ad images copied into the evidence store, a no-people-images rule, a < $0.01 live cost check (owner approves).
5. **18a-2 owner calls (2026-11-08, "go as recommended"):** Q3 bot page stays in `apps/web` at `rivalmonday.app/bot`, live with the prod deploy; 18a-2 ships dark behind `WEB_MONITORING_ENABLED` (fixture tests, no live crawl). Q5 new change type `site_feature` (added/removed) from script/iframe/link signatures in stored `page.html.gz`; client text names the category, vendor stays in details. Q7 Offer/Product JSON-LD prices feed `price_point` (rules-only); Event markup waits for 18d. Q8 own-site prices deferred until web is live (backlog kept).

## New backlog (target → item)
- 18a-2 follow-up -> permanent sitemap refusals (robots, offsite, 401/403) should count as "no sitemap"; pages skipped for lack of room stay in `site_url` but are never tracked later (track them, without `appeared_at`, when room opens); active rows are not re-typed on refresh — *from 18a-2 Task 9 review*
- later -> competitor-page "website tools" section (site_feature history per rival); only changes are shown today — *from 18a-2 spec*
- pilot -> site_feature can replay history on the first sweep where old web captures exist (cs_dev/staging; prod has none); add a `since` cutoff if it bites — *from 18a-2 Task 7*
- later -> registry hosts (wisetack.us, setmore.com, withcherry.com, zdassets.com) are memory-sourced: verify against real embed pages (OPS runbook); zdassets also serves non-chat Zendesk widgets — *from 18a-2 Task 4*
- later -> site_feature: a cooldown-blocked tool can show as added twice; an ok capture without html evidence retries up to 5x — *from 18a-2 Task 7 review*
- 18e → `ad.event` keeps only the latest pull's value (event field never populated live yet) — *from 18a-1 final review*
- 18a-3 → ad prices can lead a pricing cell and the Promo chip counts ad promos (display only, tagged "From an ad"); revisit with pilots — *from 18a-1 final review*
- later → audience cooldown keyed on `detected_at` over-suppresses after a long engine stall — *from 18a-1 final review*
- pilot → confirm GBP closure values (`closed_forever`/`temporarily_closed`) on the first real closure — *from 18a-1 pre-flight*

## Brief (condensed; 18a-1 and 18a-2 both built)
- Core spec §1.5, §4.1-4.5, §6.1-6.3, §6.6, §9.1. Reuse: `collectors/src/{web,discovery,evidence,ads,gbp}`, `engine/src/{web,structured,prices,score}`, packs `verticals/packs/*.yaml`, `CHANGE_LABELS` in `email/src/labels.ts`, `EVIDENCE_WORDING`.
- Binding: crawler UA `RivalMondayBot`, RFC 9309 (5xx = disallow), >= 3 s/host, never evade; `WEB_MONITORING_ENABLED` unset until `rivalmonday.app/bot` is live; one worker replica; SSRF guard only. `redactForModel` for model input; prices rules-only; paid work via `clientWorkAllowed`; new tool => `ISOLATION_FIXTURES`; new table => `TABLE_CLASS` + world rows; stat-card traces from real history only.
- Backlog from the brief, still open: GBP title/domain/hours/status stay `unmapped`; GBP category/service changes are one change per entry; GBP flapping guard; `price_block_map` never re-mapped, no page lock for concurrent price jobs; own-site prices (a "you" column; kept until web is live); `price_extract` only fixture-verified until the switch-on; `.pnpmfile.cjs`/OTel, `/bot` dynamic, `globalPassThroughEnv` migration.
- Closed by 18a-2: prospect gate + discovery in `convert_prospect`; tracked-page re-discovery (deactivation with a reason, www/scheme keys).

## Pre-flight 18a-2 (condensed)
Base main 4b305a7e. Web branches moved to `isStructuredChange`: `tag/tag-stage.ts`, `model-ops/resolve.ts`, `events/retract.ts`, `briefs/evidence.ts`. Worker reads `WEB_MONITORING_ENABLED` only in the staging check and passes it to `createWebJobs`. Assumes `brief-report` (unmerged) adds `topicOf`/`GROUP_PHRASE` entries for both new types (its tests cover every `CHANGE_LABELS` key) and takes the next free migration number.
