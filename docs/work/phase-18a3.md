# phase-18a3 — Reading ad images: Jev triages ad creatives, a vision LLM reads prices

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-18a3   **Base:** main @ c2e5eb2b
**Spec:** `docs/superpowers/specs/2026-11-08-phase-18a3-ad-images-design.md` (R1-R17)   **Plan:** `docs/superpowers/plans/2026-11-09-phase-18a3-ad-images.md` (Tasks 0-12, P1-P14)

## Status (overwrite)
Spec and plan owner-approved 2026-11-09. SDD execution started 2026-11-09.

## Next (overwrite)
SDD Tasks 0-12 (ledger `.superpowers/sdd/`). Task 0b live probe (< $0.01) and Task 12 ask eval re-record (<= $5) wait for the owner's OK.

## Interfaces this branch adds or changes
Planned, not built: image parts in the `@cs/ai` Jev provider (`decisions/jev.ts`, `types.ts`); ad images copied into the evidence store; an ad-image triage stage plus a vision-read step; one migration (next free number: 0103 or later; `brief-report` also takes "next free >= 0100", so re-check at execution).

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


---
## Brief

### 1. Scope
No Phase 18 roadmap row exists (Phase 18 lives in `docs/work/phase-18a.md` Decision 1). 18a-3 turns ad *images* into facts: (a) Jev triage per image (service, offer, theme, "shows a price"); (b) a vision LLM reads the amount only on price-bearing images; (c) results land in `price_point` (ad source) and as offer/theme tags; (d) images are copied into our evidence store so claims are citable. Core spec: §1.5 (no evidence, no claim), §4.4 evidence vault, §4.5 privacy, §6.6 price normalisation, §7.3-7.4 DecisionProvider and cascade. Start with Google ads (title/text null today); Meta already has copy prices from 18a-1.

### 2. Already built (reuse)
- **Google ads:** `packages/collectors/src/ads/google.ts` (DataForSEO; `creative_id`, `preview_image.url` -> `mediaUrls`; no copy). **Meta:** `ads/meta.ts` (Apify, ScrapeCreators fallback; `snapshot.images/videos/cards[]` -> `mediaUrls`). `ads/upsert.ts` writes `ad`.
- **`ad` table** (`packages/db/src/schema/sources.ts`): `media_urls jsonb string[]` holds vendor URLs only; they are never fetched or stored and nothing in `apps/` reads them. Also `text`, `title`, `landing_url`, first/last/ended capture ids. Global public table.
- **Evidence:** `packages/storage/src/store.ts` `ObjectStore.put` (refuses overwrite; `delete` only for `avatars/`). `collectors/src/evidence/vendor-capture.ts` writes `evidence/<competitorId>/<captureId>/vendor.json.gz`. `EVIDENCE_KINDS` = html, text, screenshot, vendor_json (`db/src/schema/evidence.ts`; a new kind needs a migration + `lib/labels.ts`). Viewer `/files/evidence/<clientId>/<evidenceId>`, `EvidenceImage`. Closest pattern for "fetch an image into the store": Stadia map cache (13b `rank_map_image`).
- **Fetch safety:** `collectors/src/net/guard.ts` (`guardedFetchText`, `assertPublicUrl`; text only, so binary image fetch needs a guarded variant).
- **Jev:** `packages/ai/src/decisions/jev.ts` posts `{model, state, questions}` to OpenRouter `/api/v1/systemone`; `state` is free-form, no image parts yet; `types.ts` `DecisionQuestion` = choice/score/noul. `cascade.ts` (Jev -> `llm_decisions` -> `decision_review`); per-use tasks in `packages/ai/config/ai.yaml` (`price_decisions`, `structured_decisions`); `jev.live.test.ts`; shadow sampling.
- **Cost:** `clientWorkAllowed` (`packages/db/src/filters.ts`), `AiGuard.assertAllowed`, ledger `llm_call`, Jev counted, credits 1 USD = 100, `spendByClient`/`splitByCompetitor` (shared competitor cost).
- **Privacy/prices:** `collectors/src/evidence/model-privacy.ts` `redactForModel` (text only; images need their own rule); `engine/src/prices/{price-stage,observe,tracker}.ts`.

### 3. Binding decisions (do not re-open)
Jev -> LLM -> human cascade; review decisions stay on Jev, tau 0.85. No evidence, no claim: an image price needs a stored image. Evidence never deleted. Prices come from the extractor/rules, never free model text; a discount never becomes a price. Vendors never named client-facing (tag reads "From an ad"). Paid work via `clientWorkAllowed`; Jev counts as a provider; 100 %/130 % rules; only staff set limits; nothing usage-billed. SSRF guard is the only fetch path for user-supplied URLs; vendor media URLs are third-party-supplied, so route them through it too (recommended). Model input via `redactForModel`. New table => `TABLE_CLASS` + world rows; new tool => `ISOLATION_FIXTURES`; out-of-scope client => `not_found`. Event readers filter `retracted_at IS NULL`. Paid model runs: cheapest first, cost up front, owner approves live spend.

### 4. Backlog to fold in
- Ad images (vendor media URLs expire and leak viewer requests); dark chart theme (with the app's dark theme) — *from 5c-1/5c-2* (BACKLOG; take the first half)
- 18a-3 → ad prices can lead a pricing cell and the Promo chip counts ad promos (display only, tagged "From an ad"); revisit with pilots — *from 18a-1 final review*
- Evidence: `EvidenceImage` `onError` can miss a pre-hydration 404 — *from 5c-1 final review* (if ad thumbnails reuse it)


### 5. Open questions (ZDR vision-model probe needed; eval cassettes re-record batches with 18a merge)
1. Stack on `phase-18a` or wait for its merge? (a) wait, branch off main after merge (recommended: 0100-0102 and `ad_id` are prerequisites, avoids a double rebase); (b) stack now; (c) plan now, build after merge.
2. Google only, or Google + Meta images? (a) Google only (recommended: Meta has copy prices); (b) both; (c) Google now, Meta flag later.
3. What does triage feed? (a) price only; (b) price + offer/service/theme tags stored on the ad, no UI yet (recommended); (c) tags also shown in UI/briefs.
4. Where do image-read prices surface? (a) `price_point` with new `source: 'ad_image'`, tag "From an ad image" (recommended); (b) same `meta_ad`-style "From an ad" tag, no split; (c) store only, never in the matrix until pilots validate.
5. Which vision LLM and caps? (a) cheapest ZDR vision model on OpenRouter after a probe, per-image cap ~$0.01, 20 reads/client/week (recommended); (b) Claude Haiku 4.5 vision; (c) tight cap first (5/client/week), raise later.
6. Which images are copied to the evidence store, and limits? (a) only triaged price/offer-bearing images (recommended); (b) every ad image; (c) all, but downscaled. Limits: max 2 MB, 1024 px, JPEG/PNG/WebP only; never deleted.
7. No-people rule? (a) Jev "shows a person" Noul; people images are not stored or shown, price read skipped (recommended); (b) store but never display; (c) no rule.
8. Show ad images in the UI? (a) thumbnails from our store on the Ads page and evidence viewer, fixing the backlog item (recommended); (b) evidence viewer only; (c) none.
9. Cutoff and cost check: (a) new `AD_IMAGE_SINCE` cutoff, no backfill, one < $0.01 live probe the owner approves (recommended); (b) small capped backfill.

## Pre-flight findings (Task 0)

Read-only, $0. Branch `phase-18a3` has main @ c2e5eb2b as an ancestor (no rebase needed).

- **Migration:** last is `0103_brief_report.sql`; next free = **0104**.
- **Google ad formats (cs_dev, 243 ads):** text 191, image 32, video 20. Only `video` is a non-image kind, so `AD_IMAGE_SKIP_FORMATS = ['video']` stands.
- **Image hosts:** `tpc.googlesyndication.com` 189 ads (all with `media_urls[0]`); no URL at all on 54 ads (image 1, text 34, video 19). One video ad also has a URL.
- **Concern:** the host is used by `text` ads too (157 text, 31 image, 1 video). Path shape for all 189: `/archive/simgad/<id 17-20 chars>` (no extension, no query string). So text ads carry a simgad URL and will be fetched as candidates; Task 8 must reject non-image content types (fail_reason) rather than assume the format. Not changed in the plan (the content-type check is already a limit: JPEG/PNG/WebP only); Task 0b/the first live sweep shows what simgad returns for a text ad.
- **robots.txt:** `tpc.googlesyndication.com/robots.txt` = 404 (RFC 9309 ⇒ allow). Only one host exists.
- **OpenRouter endpoints (GET only; ZDR = present in `/api/v1/endpoints/zdr`; image input from `architecture.input_modalities`):**

| model | image input | structured outputs | temperature | ZDR | prompt $/M | image price |
|---|---|---|---|---|---|---|
| google/gemini-2.5-flash-lite (AI Studio, std) | yes | yes (+flex/priority tiers) | yes | no (no endpoint in ZDR list) | 0.10 (flex 0.05) | 0.10/M image tokens |
| google/gemini-2.5-flash (AI Studio, std) | yes | yes | yes | no | 0.30 (flex 0.15) | 0.30/M image tokens |
| openai/gpt-4.1-mini, azure (global) | yes | yes | yes | **yes** (azure, azure/swedencentral; not openai direct) | 0.40 (compl 1.60) | none listed (tokens) |
| anthropic/claude-haiku-4.5, bedrock/vertex global | yes | yes (vertex: structured_outputs, no response_format) | yes | **yes** (bedrock + vertex, all regions; not azure/anthropic direct) | 1.00 (compl 5.00) | none listed (tokens) |

  **Cheapest ZDR + image + structured outputs among the four: `openai/gpt-4.1-mini` on Azure, $0.40/M prompt, $1.60/M completion.** Gemini 2.5 flash/flash-lite are cheaper but have no ZDR endpoint (only `gemini-2.5-flash-image` on vertex is on the ZDR list; it is an image-generation model). Other ZDR vision models were not scanned (the ZDR list carries no modality field); if a cheaper one matters, check before Task 0b. Image token cost per 512 px read is not in the list (usage reports it).
- **typesafe/jev-1.14:** one endpoint (`typesafe`), ZDR yes, `input_modalities` text+image, output `decisions`. Price: prompt $0.000000042/token ($0.042/M), completion 0, no per-image price, no `supported_parameters`, context 262144, p50 latency 117 ms. So a call is about $0.00005 at roughly 1.2k input tokens (images' token count only visible in `usage.input_tokens` on Task 0b).
- **Aggregate capture readers** (grep `max(capture.capturedAt)`, freshness, unfiltered `FROM capture`, `packages/tools/src` + `packages/engine/src`). Capture rows with `source = 'ad_image'` are created by Task 8, so these two must exclude them (added to Task 10):
  - `packages/tools/src/tools/platform-health.ts:88`: `max(capture.capturedAt)` where status ok, all sources ("data-source freshness"): derived captures would mask a collector outage.
  - `packages/tools/src/waitlist/site-status.ts:41`: `count(*) FROM capture cp WHERE status IN ('ok','unchanged') ...` = the marketing "snapshots" figure; an image copy is not a snapshot.
  - Already source-scoped, no change: `moves/moves-stage.ts:34`, `workspace/ads.ts:18` (`google_ads`/`meta_ads`), `briefs/starting-point.ts:129` (`google_ads`), `sweep.ts` lists (explicit sources), `reviews/complaints.ts`, `briefs/scorecard.ts`, `structured/vendor-diff.ts:55` (same source+url as the capture). Per-tracked-page readers (`search.ts:140`, `fetch-item.ts:272`, `competitor-profile.ts:59`, `web/blocks.ts`) key on `tracked_page_id`, which ad_image captures lack.
- **Plan edits:** Task 10 gains the two readers above. Task 9/0b unchanged.
