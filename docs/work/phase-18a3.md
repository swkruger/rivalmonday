# phase-18a3 — Reading ad images: Jev triages ad creatives, a vision LLM reads prices

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-18a3   **Base:** main @ c2e5eb2b
**Spec:** `docs/superpowers/specs/2026-11-08-phase-18a3-ad-images-design.md` (R1-R17)   **Plan:** `docs/superpowers/plans/2026-11-09-phase-18a3-ad-images.md` (Tasks 0-12, P1-P14)

## Status (overwrite)
SDD complete 2026-11-09: Tasks 0-12, final review clean (0 Critical/Important), one fix wave, test:affected 18/18 green, e2e:affected 154/0. Awaiting owner verification + `copy:review`.

## Next (overwrite)
Owner: `pnpm copy:review` (new ad-image strings), then `/rm-merge` go-ahead.
**`/rm-merge` note:** set `AD_IMAGE_SINCE` (`packages/engine/src/ads/images.ts`, ships as 2026-11-16) to the day `WEB_MONITORING_ENABLED` goes on (else a small implicit backfill), at least the merge day; re-check the migration number (0104) against main.

## Interfaces this branch adds or changes
- **Migration 0104:** table `ad_image` (status pending|rejected|triaged, `fail_reason`, `shows_person/price/offer`, `theme`, `service_ids`, `triage`, `evidence_id`, `read_status`, `read_at`; unique `(ad_id, source_url_sha)`; CHECK person => no evidence); `price_point.ad_image_id` (FK, CHECK needs `ad_id`). `TABLE_CLASS.ad_image = global_public`.
- **Evidence:** kind `image` (`image/webp`), capture `source = 'ad_image'` (`collector_version ad-image/1`), key `evidence/<competitorId>/<captureId>/ad-image.webp`; channel label "Ad image".
- **Stages/jobs:** `ad_image_triage` (`engine-ad-image`), `ad_image_read` (`engine-ad-image-read`), Google path of `ad_price_extract`; constants in `engine/src/ads/images.ts` (`AD_IMAGE_SINCE`, `AD_IMAGE_READS_PER_WEEK` 20); test seam `adImageSince` on `findEngineWork`/`drainEngine`. Gate = `WEB_MONITORING_ENABLED`.
- **AI:** `VendorKey` `ad_media`; `DecisionImage`/`ContentPart` image parts; task flag `images: true`; `ad_image_read` = `openai/gpt-4.1-mini`; Jev takes PNG/JPEG only (`toDecisionJpeg`); cassette `taskSignature` drops `images: false`.
- **Collectors:** `FetchBytes` guarded byte fetch, `fetchAdImage` (magic bytes, host-limiter defer).
- **Tools/UI:** `PriceNow.source` gains `ad_image` ("From an ad image", not in 90-day tags); `AdView.imageEvidenceIds`; evidence route serves `image`; platform-health and site-status exclude `ad_image` captures.
- **Docs:** OPS "Ad images (18a-3)"; help copy in `client.{ads,pricing,evidence.detail}.md` (new strings await owner `copy:review`); gotchas in collectors/ai/tools CLAUDE.md.

## Assumes from other branches
- **phase-18a: MERGED 2026-11-08 (main @ bd58dd62)** — interfaces below are on main: migration 0100 `price_point.ad_id` (FK `ad`, CHECK exactly one of `tracked_page_id`/`ad_id`, unique `price_point_ad_open_unique`) and `ad.event`; `PriceNow.source` `web|meta_ad` (`PriceNowView` same; widen if image prices get their own tag); stage `ad_price_extract` (`engine/src/prices/`, `AD_PRICE_SINCE` = 2026-11-08, Meta copy only, rules-only `pricesInBlock`, `price_block_map` cache keyed by text sha, own sweep + worker job `engine-ad-price` + `drain.ts` entry; Google skipped); pricing page "From an ad" tag; O6: ad prices shown, not counted toward the 90-day tag. Migrations 0101/0102 are 18a-2 (`capture.markup_sha`, `site_url`, `site_discovery`, `tracked_page` columns); next free after both = 0103. `tools/catalog/merge.ts` already handles `ad_id` rows. Same files as 18a-1: `collectors/src/ads/{google,meta,upsert}.ts`, `evidence/{recorder,vendor-capture}.ts`, `engine/src/prices/tracker.ts`.
- **brief-report (planned, unmerged):** `topicOf`/`GROUP_PHRASE` tests cover every `CHANGE_LABELS` key (matters only if 18a-3 adds a change type); takes a migration number; moves `workspace/ads.ts` to `@cs/engine` (shims stay).

## Decisions (owner-approved)
Basis = 18a Decision 4: `typesafe/jev-1.14` takes text + image, answers choice/score/noul only, $0.042/M prompt, completion free; Jev triages, only price-bearing images go to a vision LLM; Google first; needs image parts in the Jev provider, ad images in the evidence store, a no-people rule, a < $0.01 live cost check the owner approves.
1. Build after phase-18a merged (done).
2. **Google ad images only** (owner 2026-11-09, replacing "Google + Meta"): Meta's image CDN robots.txt disallows all bots; Google's has none. Meta waits for a permitted route.
3. Jev triage stores shows-price / offer / service / theme on the ad; not shown in the UI yet.
4. Image-read prices go to `price_point` as their own source, tagged "From an ad image" (separate from "From an ad").
5. No-people rule: Jev answers "shows a person?"; yes => image not stored, not shown, not read.
6. Reader = cheapest privacy-safe (ZDR) vision model on OpenRouter after a probe (~$0.01/image); max 20 reads per client per week; counts against tenant credits.
7. Only images Jev marks price- or offer-bearing are copied into the evidence store: <= 2 MB, <= 1024 px, JPEG/PNG/WebP, never deleted.
8. Ad image previews from our own store on the Ads page and in the evidence viewer (closes backlog "Ad images (vendor media URLs expire…)").
9. New cutoff `AD_IMAGE_SINCE`, no backfill; one live probe < $0.01 the owner approves before it runs.

## New backlog (target → item)
- later → Meta ad images: ask the Meta ads vendor whether its API can deliver image files (fbcdn robots disallows us) — *from 18a-3 owner decision*
- later → image/copy price mapping spend (`mapPricedTexts`) is platform-scoped, not split to tenants — *from 18a-3 spec R13*
- later → ad image read: `read_at` not set if the commit transaction throws (P8; ≤ 1 uncounted read) — *18a-3 final review*
- later → ad image read cap counts rows before the claim; make it atomic before running >1 poller — *18a-3 final review*
- later → guarded byte fetch checks robots for a cross-host redirect target after the fetch (same as `polite.ts`) — *18a-3 final review*
- later → test that `findEngineWork` gets `adImages:false` when `WEB_MONITORING_ENABLED` is off — *18a-3 final re-review*
- owner → pricing-page "From an ad image" tag is plain text (plan P9) while spec D6 wanted an evidence link; competitor page links — *18a-3 final review*
- **Closes:** "Ad images (vendor media URLs expire and leak viewer requests)" (first half) and the `EvidenceImage` pre-hydration 404 item (*5c-1 final review*); remove both from BACKLOG at merge.


---
## Brief (condensed; spec R1-R17 and the plan hold the detail)
Google ad images only: Jev triages each image, price/offer-bearing ones without people are copied to the evidence store, a vision model reads price lines, results land in `price_point` as "From an ad image". Binding: no evidence no claim, SSRF guard, `redactForModel`, `clientWorkAllowed`, evidence never deleted.

## Findings worth keeping
- Google formats on cs_dev: text 191, image 32, video 20; only `video` skips. Host `tpc.googlesyndication.com` (no robots.txt = allow); text ads carry simgad URLs too, so magic-byte sniffing rejects non-images.
- Vision model: cheapest ZDR + image + structured outputs = `openai/gpt-4.1-mini` (Azure). Haiku 4.5 fallback not needed.
- Live probe (~$0.0011): Jev `state_content` shape works only with PNG/JPEG data URLs (P15); ~$0.00005/call. Read ~$0.00023/call, `temperature: 0` and strict json_schema accepted.
- Ask baseline `citations_per_answer` 0.63 -> 0.41 (re-baselined 2026-11-09): isolation world gained ad-image rows; model citation markers ~unchanged (191 -> 180), the drop is verifier grounding variance (`grounding_removed_rate` 0.47 -> 0.50).
- Aggregate capture readers excluding `ad_image`: `tools/tools/platform-health.ts`, `tools/waitlist/site-status.ts`.
