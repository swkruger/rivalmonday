# phase-18a — Wider sources, part 1: brief what we already collect (no new paid vendors)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18a   **Base:** main @ 4b305a7e
**Spec/plan:** 18a-1 `docs/superpowers/{specs,plans}/2026-11-08-phase-18a1-gbp-meta*`; 18a-2 `…/2026-11-08-phase-18a2-web-readiness*` (spec O1–O4, D1–D7; plan Tasks 0–13)

## Status (overwrite)
18a-1 done: tasks 0-10 + final fix wave 5326e722, final review clean (2026-11-08); test:affected green (focused), e2e:affected 153/153, profile gate pass. 18a-2 (web readiness) spec + lean plan written 2026-11-08 on this branch, awaiting owner approval; both merge together. Not on the roadmap yet.

## Next (overwrite)
Owner approves the 18a-2 plan (check its D-calls: D1 `new_page` type, D4 two-capture confirmation, D6 28-day re-discovery + `site_url`, D7 `deferred`), then `superpowers:subagent-driven-development` from Task 0. At `/rm-merge` (covers both halves): `.describe` on `PriceNowView.source` (M5); one Ask eval re-record (`record --fill`; 18a-1 `get_price_matrix` spec + 18a-2 `search_events`/`Discovery` enums; past cost $1.6-7.65); bump `AD_PRICE_SINCE` if the deploy slips by weeks; owner signs new copy in `pnpm copy:review`. 18a-3 (ad images) stays a separate branch.

## Interfaces this branch adds or changes
- **Migration 0100:** `price_point.ad_id` (FK `ad`), `tracked_page_id` now nullable, CHECK exactly one of the two, unique index `price_point_ad_open_unique`; `ad.event` column; vertical pack v5 data (scoring v5).
- **Change types** `status_change` (GBP closed/reopened; alert-capable), `profile_change` (title/domain/hours/description), `audience_growth` (Meta Page likes). Each has `CHANGE_LABELS`, status wording and glossary entries.
- **`observation` kind `meta_page`** (Page likes per capture). Worker CLI `meta-page-backfill [--dry-run]` fills it from stored raw Meta captures.
- **Engine:** stage `ad_price_extract` (`AD_PRICE_SINCE` = 2026-11-08; Meta ad copy only, rules-only prices) and worker job `engine-ad-price`. `GBP_STATUS_PHRASE` in `packages/engine/src/structured/gbp-status.ts`.
- **Tool** `get_audience_trend` (web only; `ISOLATION_FIXTURES` entry; out-of-scope => `not_found`). Competitor page shows a Page likes stat from 4 weekly points.
- **`PriceNow.source`** (`page` | `ad`); the pricing page tags ad prices "From an ad"; ad prices never count toward the 90-day tag.

## Rollout (in order)
1. Migrate (`pnpm db:migrate`), deploy web + worker.
2. `pnpm --filter @cs/worker meta-page-backfill --dry-run`, then without `--dry-run`.
3. `pnpm --filter @cs/worker rescore --dry-run`, then without (read the `archive->brief` line first).

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
- 18e → `ad.event` keeps only the latest pull's value (event field never populated live yet) — *from 18a-1 final review*
- 18a-3 → ad prices can lead a pricing cell and the Promo chip counts ad promos (display only, tagged "From an ad"); revisit with pilots — *from 18a-1 final review*
- later → audience cooldown keyed on `detected_at` over-suppresses after a long engine stall — *from 18a-1 final review*
- pilot → confirm GBP closure values (`closed_forever`/`temporarily_closed`) on the first real closure — *from 18a-1 pre-flight*

## Brief

### Scope
- **(a) GBP changes** already diffed but scored `content` × `unmapped` (weight 0.2 × 0.6 ⇒ never briefed): `currentStatus` (temporarily/permanently closed; open/close flips ignored), hours, title, domain. `description` is collected (`extractGbpProfile`) but never diffed.
- **(b) Meta ads data:** `snapshot.page_like_count`/`event` are in the raw Apify capture, not in `ad`. Prices in ad copy → `price_point`. Google ads carry no copy (`text: null`): their prices need image analysis (out).
- **(c) Website readiness:** `/bot` + `robots.ts` exist in `apps/web` (7a1); prod is undeployed (7a1 Task 12), so `rivalmonday.app/bot` is not live. Then: sitemap diffs (discovery runs once; no re-discovery job), site tools from scripts in stored `page.html.gz` (extraction strips `<script>`), Event/Offer JSON-LD.
- **Core spec:** §1.5 (no evidence no claim; honest collection), §4.1 (page discovery ≈ 25), §4.2 (collectors; crawler conduct, bot page), §4.3 (global tables), §4.4 (immutable evidence), §4.5 (redaction), §6.1 (diffs grouped per capture), §6.2 (type list), §6.3 (score; 70 alert/40 brief), §6.6 (rules-only prices; ads/own-site deferred), §9.1 (verify, never pad).

### Already built — reuse, don't rebuild
- GBP: `collectors/src/gbp/collect-gbp.ts`; `engine/src/structured/gbp.ts` (`diffGbpProfiles`, `guardedGbpDiff`), `vendor-diff.ts` (`SourceDiffer`).
- Ads: `collectors/src/ads/meta.ts` (`normalizeMetaAd`; raw items in the capture); `engine/src/structured/ads.ts`; `tag/structured.ts` `OFFER_QUESTION`.
- Web: `collectors/src/web/*` (robots, polite, renderer, `BOT_USER_AGENT`), `net/guard.ts`, `discovery/{discover,sitemap,select}.ts`, `evidence/recorder.ts`; `engine/src/web/{extract,diff-stage}.ts`.
- Prices: `engine/src/prices/{observe,price-stage,tracker}.ts`; `db/src/schema/insights.ts` `price_point` (**`tracked_page_id` NOT NULL**), `price_block_map`.
- Scoring `score/score.ts` (`WHOLE_BUSINESS_TYPES`), `rescore` CLI; packs `verticals/packs/*.yaml` (`type_weights`); pack edits = `vertical.config` migration (0099).
- `core/src/domain.ts` `CHANGE_TYPES`/`CHANNELS`/`PAGE_TYPES`; `email/src/labels.ts` `CHANGE_LABELS`; `EVIDENCE_WORDING`.
- Signals `collectors/src/signals/tracked.ts` → `competitor_signal.signals`; site switch `apps/site/content/website-monitoring.ts`.

### Binding decisions (never re-open)
- Crawler: UA `RivalMondayBot`, RFC 9309 (5xx ⇒ disallow), ≥ 3 s/host, never evade; `WEB_MONITORING_ENABLED` unset until `rivalmonday.app/bot` is live; one worker replica; staging refuses it. SSRF guard = only fetch path for user URLs.
- `redactForModel` for model input; no evidence, no claim; Ask drops uncited figures; event readers `retracted_at IS NULL`.
- 7b: paid work via `clientWorkAllowed`. 7c1: new tool ⇒ `ISOLATION_FIXTURES`; new table ⇒ `TABLE_CLASS` + world rows.
- brief-signal: whole-business set excludes `content` (P1); GBP title/domain/hours/status stay `unmapped` until revisited here (D9); scoring v4; brief bar 40.
- 3c: prices rules-only, a discount never becomes a price; `price_point` = spans with watermark; ads/own-site prices deferred (decision 11). Self competitor: no site crawl, no ads (§6.5).
- Stat-card traces from real history only.

### Backlog to fold in (verbatim)
- [ ] GBP title/domain/hours/status `content` events stay at `unmapped` relevance (never briefed); revisit if pilots want them — *from brief-signal D9*
- [ ] GBP category/service additions/removals are one change per entry, not grouped per capture — *from 3b*
- [ ] GBP guard: carry the last confirmed field value as state (the 4-capture guard cannot fix flapping values); a spurious `new_location` from address flapping reaches the brief, not an alert (max score 54) — *from brief-signal D6*
- [ ] Own-site prices: a "you" column; feed ads/own-website prices into `price_point` (3c decision 11) — *from 3c, 5c-2*
- [ ] `price_block_map` never re-mapped on catalogue change, partial failure or rotating copy; no page-level lock for concurrent price jobs (equal `captured_at` not ordered) — *from 3c*
- [ ] `price_extract` live-verified only by tests — no web captures until the bot page exists — *from 3c live verification*
- [ ] Before switching on `WEB_MONITORING_ENABLED`: `accept_competitor_suggestion`/`add_competitor` (`packages/tools/src/tools/competitors.ts`) return `'disabled'` for a prospect; start discovery in `convert_prospect` — *from 5b-2 final review Minor 1*
- [ ] Tracked pages: re-discovery never deactivates unselected pages; `active: true` re-activates human-deactivated pages; http/https and www/bare tracked separately — *from 2a review*
- [ ] Later: `.pnpmfile.cjs` drops drizzle's optional `@opentelemetry/api` peer (revisit if drizzle needs OTel); `/bot` is dynamic (root layout reads cookies); migrate root `globalPassThroughEnv` to `global.passThroughEnv` — *from 7a*

### Open questions for the owner
All settled: 1-2, 4, 6 in the 18a-1 spec (O1-O6); 3, 5, 7, 8 in the 18a-2 spec (O1-O4) and Decision 5.

## Pre-flight (18a-1 Task 0)
Rebased onto main 4b305a7e; test DB `cs_phase_18a_test`; migration 0100 (18a-2 takes the next free, 0101). Meta (cs_dev, 19 Apify captures): payload `{vendor, items[], truncated}`; `snapshot.page_like_count` numeric (352/353), `snapshot.event` always null. GBP `current_status` at `work_time.work_hours.current_status` (only `open`/`close` in cs_dev); no closed listing to probe.
