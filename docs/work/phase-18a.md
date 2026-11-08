# phase-18a — Wider sources, part 1: brief what we already collect (no new paid vendors)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18a   **Base:** main @ cca12fde
**Plan/spec:** none yet

## Status (overwrite)
Kicked off 2026-11-08; not on the roadmap yet.

## Next (overwrite)
Owner answers the open questions → `superpowers:brainstorming` → spec.

## Interfaces this branch adds or changes
TBD. Migration: next free at execution; main ends 0099, `brief-report` claims the next (≥ 0100) ⇒ expect **0101**; re-check.

## Assumes from other branches
- `brief-report` (planned, unmerged): `@cs/core` `brief-report.ts` `topicOf` (unknown types → `offers` "Website, prices & services") and `@cs/email` `GROUP_PHRASE` are tested to cover every `CHANGE_LABELS` key; a new change type must add both. Edits `briefs/{generate,summary,review,deliver}.ts`, `labels.ts`; 18a rebases onto it.

## Decisions (owner-approved)
1. Phase 18 "Wider sources" (brainstorm 2026-11-08): **18a** use what we have (this branch) → **18b** more Google via DataForSEO (GBP posts/offers, Google Guaranteed/LSA, organic + AI Overview, news/awards, Tripadvisor/Trustpilot) → **18c** citations (client NAP hygiene, rival citation growth/partner directories) → **18d** events & entertainment vertical → **18e** social via ScrapeCreators. Out of Phase 18: public records, newsletters, FB Events/Nextdoor, ad image/video analysis, bought citation data, Yelp.
2. 18a adds no paid vendors.

## New backlog (target → item)
- none yet

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
1. **Split 18a?** (A) one branch; (B) 18a-1 data-only briefing (GBP + Meta) / 18a-2 web readiness (bot live, sitemap diffs, tools, JSON-LD); (C) B, web part after the prod deploy. **Rec: C** — web needs the prod deploy.
2. **GBP closure severity.** (A) keep `content`, add GBP fields to the whole-business set; (B) new type `status_change` (closed/reopened; alert-capable); (C) B plus `profile_change` for title/domain/hours/description. **Rec: B** — a closure is news.
3. **Bot page.** (A) as is in `apps/web` at `rivalmonday.app/bot`, live with the prod deploy; (B) move to `apps/site` (rivalmonday.com) and change the UA URL; (C) A, plus a list of what we collect and a dedicated opt-out address. **Rec: A** — built, copy approved, matches the UA.
4. **Page-like trend.** (A) signal icon/tier input only; (B) brief line on ≥ N % jump, no stat card until ≥ 4 weekly points; (C) stat card with trace now. **Rec: B** — likes arrive only while ads run (sparse history).
5. **Site-tool detection.** (A) new change type `site_feature` (added/removed); (B) `content` with `details.feature`, shown on profile; (C) competitor facts only, no events. **Rec: A** — "rival added online booking" is briefable.
6. **Ad prices into `price_point`.** (A) Meta ad copy only, nullable `tracked_page_id` + `source` column; (B) separate `ad_price` table; (C) defer. **Rec: A** — one tracker.
7. **Event JSON-LD.** (A) Offer now (feeds prices), Event waits for 18d; (B) both now, stored only; (C) both wait. **Rec: A** — HVAC/dental rarely post Events.
8. **Own-site prices ("you" column).** (A) crawl the client's own site in 18a; (B) defer to after web goes live; (C) out of 18a. **Rec: B**.
