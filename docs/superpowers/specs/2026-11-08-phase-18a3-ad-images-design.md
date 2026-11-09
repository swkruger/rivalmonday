# Phase 18a-3 — Reading ad images (design)

**Date:** 2026-11-08 · **Branch:** `phase-18a3` (main @ bd58dd62) · **Brief + owner decisions 1–9:** `docs/work/phase-18a3.md`
**Core spec:** §1.5, §4.4, §4.5, §6.6, §7.3, §7.4 (cited, not restated).

## Intent

Jev triages each new ad image. Only images that show a price or offer, and no person, go into our evidence store.
A vision LLM reads prices from those images only. The prices join `price_point` tagged "From an ad image", and the Ads
page shows the stored images.

**Non-goals:** video; backfill; triage tags in UI/briefs/Ask; new change types; an AM image-review UI; Promo chip or
cell-lead changes (backlog stays open); logos; the dark chart theme.
**Anti-goals:** keeping, showing or reading a person image; a price the image doesn't show; a discount as a price; a
vendor URL in a browser; image bytes in samples/ledger/logs; evidence reachable via another competitor's ad.

Each **R-n** is a *ruling (agent), owner may overturn*; [brackets] give the cost if it's overturned.

## D1 Candidates and pipeline

- **R1** `NormalizedAd.imageUrls` → new `ad.image_urls jsonb` (refreshed each upsert; `media_urls` unchanged). Meta:
  `snapshot.images[]`, then `cards[]` without a video field (videos, video cards and their previews skipped; one card =
  one image). Google: `preview_image.url` unless `format = 'video'` (Task 0 lists stored formats, $0). [Small.]
- **R2** ≤ 4 images per ad, ≤ 200 seeded per sweep. [Cards 5+ lost; a constant.]
- **R3** Candidates are new ads only: `first_seen_at >= AD_IMAGE_SINCE` (constant in `engine/src/ads/images.ts`, set to
  the merge date), the ad is active, and the competitor has a tracker passing `clientWorkAllowed` + `agencyServiceable`.
- **R4** After `VENDOR_SETTLE_MINUTES`, the sweep seeds one `ad_image` row per `(ad_id, position)` with status
  `pending`. The stage subject is that row, so host spacing and retries are per image.
- **Stages** (`engine/src/ads/`, `runStage`; sweep list, worker job, `drain.ts` entry as `ad_price_extract`):
  - `ad_image_triage` v1 (`engine-ad-image`): fetch → normalise → dedupe → triage → store.
  - `ad_image_read` v1 (`engine-ad-image-read`): read → rules → confirm → map → `price_point`.
- **R5** Both stages run only while `WEB_MONITORING_ENABLED === 'true'` (the UA's bot page; no new env var). [Images
  before crawling: a new flag + `turbo.json`.]
- **R6** A read runs only when `pricesInBlock([title, text].join('\n'))` is empty (decision 2): deterministic, so no
  ordering on `ad_price_extract`, whose lifecycle (advance/end by `ad_id`) then covers Meta image spans unchanged.
- **R7** `ad_price_extract`'s sweep also takes ok `google_ads` captures from `AD_IMAGE_SINCE`, but only to advance
  listed ads and end spans whose `ended_capture_id` is this capture. No copy pricing, no `endUnlisted`, version stays 1.
  [Without this, Google image prices never end.]

## D2 Fetching vendor media

- New in `collectors/src/net/guard.ts`: `createGuardedFetchBytes(opts?: { fetch?; assertUrl? }): FetchBytes` and
  `guardedFetchBytes`, with
  `type FetchBytes = (url: string, o: { maxBytes: number; accept: string }) => Promise<{ status: number; bytes:
  Uint8Array | null; finalUrl: string; tooLarge: boolean }>`.
  - Redirects as `createGuardedFetchText` (≤ 5 hops, each `assertUrl`, 10 s, `BOT_USER_AGENT`); aborts past
    `maxBytes`. The only path for media URLs (third-party-supplied).
- **Conduct:**
  - Robots: `RobotsPolicy` per host; a 5xx counts as disallow.
  - ≥ 3 s per host (`HostRateLimiter`); a busy host defers (`deferIn`, row stays `pending`), never sleeps.
  - Limiter: new `VendorKey` `ad_media { concurrent: 4 }`.
- **R8 Validation:**
  - Size: over 2 MiB ⇒ `rejected/too_large`.
  - Type: magic bytes only (JPEG `FF D8 FF`, PNG `89 50 4E 47…`, WebP `RIFF????WEBP`). Anything else ⇒
    `rejected/bad_type`.
  - Normalise with `sharp` (already a collectors dependency): `sharp(buf, { limitInputPixels: 4e7, animated: false })
    .rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 })`.
    Larger images are downscaled, not rejected, and EXIF is stripped. A sharp error ⇒ `rejected/bad_image`.
  - Models see exactly the stored WebP (evidence = input). [Originals: per-type serving + a second sha.]
- **Expired URLs:** 403/404/410 ⇒ `fetch_failed/expired`; else `http_<n>`/`network`; `attempts += 1`; re-offered when
  `ad.last_capture_id` moves (fresh signed URL) while `attempts < 3`. SSRF/robots ⇒ `rejected/ssrf|robots`, final.

## D3 Triage and the cascade

- **`@cs/ai` image parts (binding):**
  ```ts
  export interface DecisionImage { mediaType: 'image/webp'; data: Uint8Array; sha256: string }
  // DecisionProvider.decide(state, questions, opts?: { images?: readonly DecisionImage[] })
  // Ai.decide(task, state, questions, scope, opts?: { images?: readonly DecisionImage[] })
  // ChatMessage user content: string | ContentPart[]
  // ContentPart = { type: 'text'; text: string } | { type: 'image'; image: DecisionImage }
  ```
  - Only tasks with `ai.yaml` `images: true` accept images (else throw before calling). Wire:
    `{ type: 'image_url', image_url: { url: 'data:image/webp;base64,…' } }`; samples and cassette keys hold `sha256` only.
- **Task 0b probe (owner approves before it runs; < $0.01 in total, together with D5).**
  - Scratchpad script (not committed); two synthetic WebPs from SVG: "TUNE-UP $89" and a blank control.
  - Shapes, 2 calls each (`shows_price` noul): (A) top-level `images: [dataUrl]`; (B) `state` as an OpenAI-style
    content array; (C) `state: { text, image: dataUrl }`.
  - Pass = price p ≥ 0.85 and control ≤ 0.15 (catches Jev reading base64 as text). Record `usage.input_tokens`.
    At most 6 calls; the passing case joins `jev.live.test.ts`.
- **R9** If no shape passes, `ad_image_decisions` becomes `{ provider: openrouter, model: anthropic/claude-haiku-4.5,
  mode: decisions, images: true }`: LLM, then human. [About $0.002 per image instead of about $0.0001.]
- **ai.yaml** (`llm_decisions` untouched):
  - `ad_image_decisions: { provider: jev, model: typesafe/jev-1.14, escalate_to: image_llm_decisions, min_confidence:
    { default: 0.85 }, shadow_rate: 0.05, images: true }`
  - `image_llm_decisions: { provider: openrouter, model: anthropic/claude-haiku-4.5, mode: decisions, images: true }`
- **Questions** (one call per image). State = `{ competitor, platform, ad_text }`, every string through
  `redactForModel`, cut to `MAX_STATE_TEXT`.
  - `shows_person` noul: a real person, face or body part in a photo (cartoons and icons don't count).
  - `shows_price` noul: a money amount for a service or product. A %, "free" or a discount amount alone is not a price.
  - `shows_offer` noul: a discount, % off, coupon, rebate, free add-on, financing or a limited-time offer.
  - `service_<verticalId>` choice per tracking vertical, with `buildPriceQuestions`' options.
  - `theme` choice: `price_promo | seasonal | emergency | financing | trust | new_service | event | hiring | brand | other`.
- **R10 Resolution** (τ 0.85 everywhere):
  - `shows_person` true, or still below τ after the LLM ⇒ treated as a person.
  - Price/offer below τ ⇒ false. Choices below τ ⇒ null.
  - No `decision_review` row: the human step is the kept `decision_sample`, labelled later. [A new AM review screen.]
- **No-people rule:** a person ⇒ `triaged` with `shows_person = true` and other answers null. The bytes are dropped in
  memory: nothing is stored, read or shown. Accepted: the ZDR model has to see the image to judge it.
- **R11 Dedupe:** same `source_sha256` as a `triaged` row ⇒ answers copied, no model call (`triage.copiedFrom`).
  Evidence is reused only within one competitor (access goes via `capture.competitor_id`). [Bit more storage.]

## D4 Storage

- **Migration 0103** (re-check the number at execution):
  ```sql
  ALTER TABLE ad ADD COLUMN image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
  CREATE TABLE ad_image (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id uuid NOT NULL REFERENCES ad(id) ON DELETE CASCADE,
    competitor_id uuid NOT NULL REFERENCES competitor(id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fetch_failed','rejected','triaged')),
    fail_reason text, attempts smallint NOT NULL DEFAULT 0, source_sha256 text,
    shows_person boolean, shows_price boolean, shows_offer boolean, theme text,
    service_ids jsonb,  -- { [verticalId]: serviceId | null }
    triage jsonb,       -- { provider, model, confidences, needsReview, copiedFrom? }
    evidence_id uuid REFERENCES evidence(id) ON DELETE RESTRICT,
    read_status text CHECK (read_status IN ('read','no_price','unconfirmed','skipped_copy_price','skipped_cap','failed')),
    read_at timestamptz, triaged_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ad_image_ad_position_unique UNIQUE (ad_id, position),
    CONSTRAINT ad_image_person_unstored CHECK (shows_person IS NOT TRUE OR evidence_id IS NULL)
  );
  -- indexes: (source_sha256); (competitor_id, source_sha256) WHERE evidence_id IS NOT NULL; partial (status); (competitor_id, read_at)
  ALTER TABLE price_point ADD COLUMN ad_image_id uuid REFERENCES ad_image(id) ON DELETE CASCADE,
    ADD CONSTRAINT price_point_ad_image_has_ad CHECK (ad_image_id IS NULL OR ad_id IS NOT NULL);
  ```
  - RLS as for `ad`: `app_competitor_visible(competitor_id)`, app roles SELECT only, the service role writes.
  - `TABLE_CLASS.ad_image = 'global_public'`.
  - World rows: one stored image of a competitor that only client A tracks (B sees none), and one person row.
- **Evidence kind `image`:**
  - `EVIDENCE_KINDS` + `EVIDENCE_CONTENT_TYPES.image = 'image/webp'` (no SQL CHECK exists); the file route is unchanged.
  - Each stored image gets its own capture, because evidence is unique on `(capture_id, kind)`: `source = 'ad_image'`,
    `collector_version = 'ad-image/1'`, and `url` = the ad's `libraryUrl` or null, never the vendor URL.
  - Object key: `evidence/<competitorId>/<captureId>/ad-image.webp`. Put without overwrite, then insert capture +
    evidence and update `ad_image` in one transaction (recorder pattern). Never deleted.
  - `channelLabel('ad_image')` = "Ad image". Stored only when `shows_price || shows_offer` and no person (decision 7).

## D5 Vision read

- **Model (Task 0b, same approval):**
  - Candidates, cheapest first: `google/gemini-2.5-flash-lite`, `google/gemini-2.5-flash`, `openai/gpt-4.1-mini`,
    `anthropic/claude-haiku-4.5`.
  - Qualifies: `GET /api/v1/models/<id>/endpoints` ($0) shows a ZDR endpoint with image input + `structured_outputs`,
    and one live call on the synthetic image returns "$89". Cheapest qualifier wins.
  - ai.yaml: `ad_image_read: { provider: openrouter, model: <winner>, fallbacks: [anthropic/claude-haiku-4.5],
    temperature: 0, max_tokens: 300, images: true }`. Drop `temperature` if the winner rejects it.
- **R12 Transcription, not numbers:**
  - Schema: `{ price_lines: string[] }`, at most 6 lines of ≤ 200 chars each. Prompt: "copy every line of text in the
    image that contains a money amount, exactly as written; [] if none".
  - Amount, unit, qualifier and promo come from `pricesInBlock(line)`, the rules (§6.6; a discount never becomes a
    price), never from model numbers. [Overturning means trusting model-typed amounts.]
- **Confirm (no evidence, no claim):**
  - One `ad_image_decisions` call on the same image, with one `confirm_<i>` noul per raw: "The image shows the text
    "<raw>" as a price." Raws below τ are dropped; none left ⇒ `unconfirmed`.
  - The kept lines go to `mapPricedTexts` (sha of the joined kept lines, `price_block_map` cache, state
    `{ competitor, ad_image_text, source: 'ad_image' }`, redacted).
- **`price_point` rows:** `tracked_page_id` null, `ad_id`, `ad_image_id`, `first/last_capture_id` = the ad's
  `last_capture_id`, `context` = the redacted line, `onConflictDoNothing`.
- **R13 Cap (decision 6):** 20 reads per client per week. A read is allowed while any workable tracker has fewer than 20
  `read_at` in the last 7 days across its tracked competitors. Otherwise `skipped_cap`, re-offered while the ad is active.
  [If every tracker must be under the cap instead, coverage drops for shared rivals.]
- **Credits:** scope `{ agencyId: null, clientId: null, competitorIds: [competitorId] }` (split via `spendByClient`;
  `AiGuard` gates; `AiPausedError` rethrown ⇒ stage retries). Estimate: triage ≈ $0.0001 with Jev; a read ≈ $0.0002–0.002 depending on the winner.

## D6 Readers, tools, UI

- **R14 Price source:**
  - `PriceNow(View).source`: `'web' | 'meta_ad' | 'ad_image'` (one value for both platforms; from `ad_image_id`), plus
    `evidenceId: string | null` and a `describe` line. O6 unchanged: shown, never counted (existing filters).
- **Tags:** the pricing page and competitor sections tag these prices **"From an ad image"**, linked to
  `/c/<id>/evidence/<evidenceId>`. "From an ad" stays for `meta_ad`.
- **Ads page:**
  - `AdView` gains `imageEvidenceIds: uuid[]` (stored, servable, in position order), read with the service Db after
    `workspaceBusinesses` proves visibility. Summary `evidenceIds` include them.
  - `AdCard`: first image via `EvidenceImage` (`/files/evidence/<clientId>/<id>`, lazy, contained, ≤ 240 px, grey
    panel, alt "Ad image from <competitor>", "+N more"); none stored ⇒ today's text card, no placeholder.
- **Evidence viewer:** `image` renders like a screenshot. Folded backlog fix: `EvidenceImage` checks
  `complete && naturalWidth === 0` on mount (pre-hydration 404).
- **Access:** unchanged (`get_evidence` → `competitorLinked`, 404 refusals, `private, no-store`); no vendor URL anywhere.
- **No new tool.** The `list_ads` and `get_price_matrix` shapes and the isolation world change ⇒ replay misses ⇒
  re-record `ask` (and `briefs` if it misses) via `record --fill` in the PR. Estimate ≤ $1.6, `--max-usd 5`.
- **Copy (sign-off):** the tag, `EVIDENCE_KIND.image`/channel "Ad image", alt text, "+N more", a `client.ads.md` line
  (images kept only when they carry a price or offer, never with people) and a pricing-guide line. **R15** no glossary term.

## Review focus

URL expiry/refresh/retry · hostile bytes (lying type, bomb, animated, SVG/HTML, oversize) · redirect to a private address,
robots 5xx, deferral never sleeps · Jev ignoring the image; bytes in samples/ledger/logs · people false negatives ·
dedupe across competitors · copy + image double prices, "$50 off" as a price · cap and credit split, spend pause
mid-stage · Meta/Google span lifecycle · cassette keys for image parts.

## Dependencies on in-flight work

- **`brief-report`** (planned): takes a migration number (re-check 0103); moves `workspace/ads.ts` to `@cs/engine`.

## Owner question

- If the ad CDNs' `robots.txt` (Task 0 checks it for free) disallows our bot, we either honour it and lose images from
  that platform, or you rule vendor-supplied media out of the crawler rule.
