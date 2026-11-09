# Phase 18a-3 — Reading ad images (design)

**Date:** 2026-11-08, revised 2026-11-09 after the builder check · **Branch:** `phase-18a3` · **Brief:** `docs/work/phase-18a3.md`
**Core spec:** §1.5, §4.4, §4.5, §6.6, §7.3, §7.4 (cited, not restated).

## Intent

Jev triages new **Google** ad images; price/offer images without people are stored as evidence; a vision LLM reads
their prices into `price_point` ("From an ad image"); the Ads page shows stored images.

**Owner decision (2026-11-09, replaces "Google + Meta" in decision 2):** Google only (`*.fbcdn.net`
robots disallows all; `tpc.googlesyndication.com` robots = 404 = allow). Meta waits for a permitted route (backlog: ask
the Meta ads vendor whether its API delivers image files).

**Non-goals:** Meta, video, backfill, triage tags in UI/briefs/Ask, change types, review UI, Promo chip, dark charts.
**Anti-goals:** a person image kept/shown/read; a price not in the image; a discount as a price; vendor URLs in a
browser; image bytes in ledger/logs/cassettes; evidence reachable via another competitor's ad.

Each **R-n** below is a *ruling (agent), owner may overturn*; [brackets] give the cost if it is wrong.

## D1 Candidates and pipeline

- **R1 No new column.** A Google ad's image URL is `ad.media_urls->>0`: the normaliser stores only
  `preview_image.url`. Ads with `ad.format = 'video'` are skipped (Task 0 lists the stored formats from cs_dev, $0).
  At most 1 image per ad. [If Google ever gives a second URL type, a typed `image_urls` column comes back.]
- **R2 Candidates (sweep):** active Google ads with `first_seen_at >= AD_IMAGE_SINCE` (`engine/src/ads/images.ts`,
  merge date), no `ad_image` row for this URL hash, and a tracker passing `clientWorkAllowed` + `agencyServiceable`;
  ≤ 200 per sweep, after `VENDOR_SETTLE_MINUTES`.
- **R3 Gate:** both stages run only while `WEB_MONITORING_ENABLED === 'true'`, the precondition for the bot page our
  user agent names. No new env var. [If wrong: a new flag plus a `turbo.json` entry.]
- **Stages** (`engine/src/ads/`, `runStage`; each gets a sweep list, worker job and `drain.ts` entry like
  `ad_price_extract`):
  - `ad_image_triage` v1 (job `engine-ad-image`): fetch → normalise → dedupe → triage → store.
  - `ad_image_read` v1 (job `engine-ad-image-read`): read → rules → confirm → map → `price_point`.
- **R4 Subjects and retries:** subject `md5(ad_image.id || '|' || source_url_sha)::uuid` (a new URL = new row and
  subject). Cap, busy-host and client-work checks run **before** the claim; a waiting row is not seeded or is
  re-enqueued with `startAfter` (`apps/worker/src/jobs/web.ts:38-41`). Transient failures (network, 5xx, robots
  `unavailable`) throw into `MAX_STAGE_ATTEMPTS` backoff, no own counter; 403/404/410 = expired, final for that URL.
  [Stuck rows or burnt stage budget.]

## D2 Fetching media

- **New** in `collectors/src/net/guard.ts`: `createGuardedFetchBytes(opts?: { fetch?; assertUrl? }): FetchBytes` and
  `guardedFetchBytes`, with `type FetchBytes = (url: string, o: { maxBytes: number; accept: string }) =>
  Promise<{ status: number; bytes: Uint8Array | null; finalUrl: string; tooLarge: boolean }>`.
  Redirects as `createGuardedFetchText` (≤ 5 hops, each asserted, 10 s, `BOT_USER_AGENT`); aborts past `maxBytes`.
- **R5 Robots:** `RobotsPolicy` on the start host and again on the final host after a cross-host redirect (as
  `polite.ts:33-38`). Only an explicit disallow is final (`rejected/robots`); `unavailable` (5xx/429/unreachable)
  retries (R4). SSRF is final (`rejected/ssrf`). [Images lost to a robots outage.]
- **Conduct:** at least 3 s per host via `HostRateLimiter`; a busy host defers the row, the job never sleeps. New
  `VendorKey` `ad_media { concurrent: 4 }` (`core/src/server/token-bucket.ts:5`).
- **R6 Validation:** > 2 MiB ⇒ `rejected/too_large`; magic bytes JPEG/PNG/WebP only, else `rejected/bad_type`;
  `sharp(buf, { limitInputPixels: 4e7, animated: false }).rotate().resize({ width: 1024, height: 1024, fit: 'inside',
  withoutEnlargement: true }).webp({ quality: 80 })` (downscale, no EXIF; error ⇒ `rejected/bad_image`). Models see
  exactly the stored WebP. [Originals: per-type serving + second hash.]

## D3 Triage

- **`@cs/ai` image parts (binding):**
  ```ts
  export interface DecisionImage { mediaType: 'image/webp' | 'image/jpeg' | 'image/png'; data: Uint8Array; sha256: string }  // Task 0b: Jev takes PNG/JPEG only; decision calls send a JPEG of the stored WebP (plan P15)
  // DecisionProvider.decide(state, questions, opts?: { images?: readonly DecisionImage[] })
  // Ai.decide(task, state, questions, scope, opts?: { images?: readonly DecisionImage[] })
  // Ai.chat(task, { messages, jsonSchema }, scope): user content may be ContentPart[]
  // ChatMessage user content: string | ContentPart[]
  // ContentPart = { type: 'text'; text: string } | { type: 'image'; image: DecisionImage }
  ```
  - `config.ts:28-47`: `openRouterTask`/`jevTask` gain `images: z.boolean().default(false)`; without it, images throw.
  - Wire: `{ type: 'image_url', image_url: { url: 'data:image/webp;base64,…' } }`. `llm.ts:76` builds the user message
    as `[text, ...image parts]` when images are present (a string today).
  - `cassette.ts:90`: normalisation replaces image parts by `{ type: 'image', sha256 }` **before** `canonicalJson`.
- **Task 0b probe** (the owner approves before it runs; < $0.01 in total, together with D5):
  synthetic WebPs ("TUNE-UP $89", blank control); Jev shapes (A) top-level `images: [dataUrl]`, (B) `state` content
  array, (C) `state: { text, image }`, 2 calls each (`shows_price`); pass = p ≥ 0.85 vs ≤ 0.15; record
  `usage.input_tokens`; the passing case joins `jev.live.test.ts`.
- **R7** If no shape passes, `ad_image_decisions` becomes `{ provider: openrouter, model: anthropic/claude-haiku-4.5,
  mode: decisions, images: true }`. [About $0.002 per image instead of about $0.0001.]
- **ai.yaml** (`llm_decisions` unchanged):
  - `ad_image_decisions: { provider: jev, model: typesafe/jev-1.14, escalate_to: image_llm_decisions, min_confidence:
    { default: 0.85 }, shadow_rate: 0, images: true }`
  - `image_llm_decisions: { provider: openrouter, model: anthropic/claude-haiku-4.5, mode: decisions, images: true }`
- **Questions** (one call; state `{ competitor, ad_title }` via `redactForModel`):
  nouls `shows_person` (real person/face/body part in a photo; not cartoons), `shows_price` (a money amount for a
  service; %, "free" or a discount alone is not), `shows_offer` (discount, coupon, rebate, free add-on, financing,
  limited time); choice `service_<verticalId>` (`buildPriceQuestions` options); choice `theme` (`price_promo | seasonal |
  emergency | financing | trust | new_service | event | hiring | brand | other`).
- **R8 Resolution:** cascade Jev → LLM. `shows_person` true or below τ ⇒ person; price/offer below τ ⇒ false; choice
  below τ ⇒ null. Excluded from decision sampling (`shadow_rate: 0`, no `keepSample`): samples hold no image and person
  images are never kept. [No gold labels for image triage; revisit if pilots need them.]
- **No-people rule:** a person ⇒ status `triaged`, `shows_person = true`, no other answers, and the bytes are dropped
  in memory. Accepted trade-off: the ZDR model has to see the image to judge it.
- **R9 Service:** the triage service answer is a stored tag only (owner decision 3). `price_point.service_id` comes
  from `mapPricedTexts` (D5), exactly as for copy prices. [If wrong: the service answer is paid for twice, a small cost.]
- **R10 Dedupe:** `source_sha256` = hash of the **original** bytes. A `triaged` row with that hash ⇒ answers copied,
  no model call (`triage.copiedFrom`). Same competitor ⇒ a new capture + evidence row pointing at the existing storage
  key (no new bytes; viewer shows this ad's library link). Other competitors store their own copy (access is via
  `capture.competitor_id`). [Bit more storage.]

## D4 Storage

- **Migration 0103** (re-check the number at execution):
  ```sql
  CREATE TABLE ad_image (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id uuid NOT NULL REFERENCES ad(id) ON DELETE CASCADE,
    competitor_id uuid NOT NULL REFERENCES competitor(id) ON DELETE CASCADE,
    source_url_sha text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rejected','triaged')),
    fail_reason text,   -- too_large | bad_type | bad_image | expired | robots | ssrf
    source_sha256 text,
    shows_person boolean, shows_price boolean, shows_offer boolean, theme text,
    service_ids jsonb,  -- { [verticalId]: serviceId | null }
    triage jsonb,       -- { provider, model, confidences, copiedFrom? }
    evidence_id uuid REFERENCES evidence(id) ON DELETE RESTRICT,
    read_status text CHECK (read_status IN ('read','no_price','unconfirmed','failed')),
    read_at timestamptz, triaged_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ad_image_ad_url_unique UNIQUE (ad_id, source_url_sha),
    CONSTRAINT ad_image_person_unstored CHECK (shows_person IS NOT TRUE OR evidence_id IS NULL)
  );
  -- indexes: (source_sha256); (competitor_id, source_sha256) WHERE evidence_id IS NOT NULL; (competitor_id, read_at)
  ALTER TABLE price_point ADD COLUMN ad_image_id uuid REFERENCES ad_image(id) ON DELETE CASCADE,
    ADD CONSTRAINT price_point_ad_image_has_ad CHECK (ad_image_id IS NULL OR ad_id IS NOT NULL);
  ```
  RLS as `ad` (`app_competitor_visible`, service-role writes); `TABLE_CLASS.ad_image = 'global_public'`; world rows: a
  stored image only client A can see, and a person row. A cap wait is no status (never reaches the stage, R4).
- **Evidence kind `image`:** `EVIDENCE_KINDS` + `EVIDENCE_CONTENT_TYPES.image = 'image/webp'`
  (`tools/src/workspace/evidence-access.ts:12`). Own capture per image (`source = 'ad_image'`, `collector_version =
  'ad-image/1'`, `url` = the ad's `libraryUrl` or null, never the vendor URL); key
  `evidence/<competitorId>/<captureId>/ad-image.webp`; put, then one transaction; never deleted. `channelLabel` "Ad
  image". Stored only when `shows_price || shows_offer` and no person.

## D5 Vision read

- **Model (Task 0b):** cheapest of `google/gemini-2.5-flash-lite`, `google/gemini-2.5-flash`, `openai/gpt-4.1-mini`,
  `anthropic/claude-haiku-4.5` with a ZDR endpoint taking images + `structured_outputs` (`/api/v1/models/<id>/endpoints`,
  $0) that reads "$89" off the synthetic image. `ad_image_read: { provider: openrouter, mode: chat, model: <winner>, fallbacks: [anthropic/claude-haiku-4.5],
  temperature: 0, max_tokens: 300, images: true }` (drop temperature if rejected).
- **R11 Transcription, not numbers:** the output schema is `{ price_lines: string[] }` (at most 6 lines, 200 chars
  each); the model copies the lines that contain money amounts. Amount, unit, qualifier and promo come from
  `pricesInBlock(line)` (§6.6: a discount never becomes a price). [If wrong: we'd be trusting amounts the model typed.]
- **Confirm (no evidence, no claim):** one `ad_image_decisions` call asks a `confirm_<i>` noul per raw price: "The
  image shows "<raw>" as a price." Raws below τ are dropped. None left ⇒ `unconfirmed`.
- **Map:** the kept lines go through `mapPricedTexts` (sha cache; platform scope as today). Each price becomes a
  `price_point` row with `ad_id` and `ad_image_id`, `first/last_capture_id` = the ad's `last_capture_id`, and
  `context` = the redacted line, inserted with `onConflictDoNothing`.
- **R12 Cap (decision 6):** a read is enqueued only while some workable tracker has < 20 `read_at` in 7 days across
  its competitors. `read_at` is set whenever the vision model was called (read, no_price, unconfirmed, billed failures);
  the confirm call doesn't count. [All trackers under cap: less coverage for shared rivals.]
- **R13 Spend:** right before each paid call, re-check that a tracker passes `clientWorkAllowed`. Scope
  `{ agencyId: null, clientId: null, competitorIds: [competitorId] }` (split across trackers); `AiPausedError`
  rethrown. `mapPricedTexts` stays platform-scoped; backlog: "image/copy price mapping spend is platform-scoped, not
  split to tenants".
- **Cost per stored price image:** triage ≈ $0.0001 (Jev), read $0.0002–0.002, confirm ≈ $0.0001, plus one
  `price_decisions` call on a cache miss (≈ $0.0001).
- **R14 Google span lifecycle:** `extractAdPrices` (Meta-only throw today) gets a Google path or sibling, sweeping ok
  `google_ads` captures from `AD_IMAGE_SINCE`. Listed ads = `ad.last_capture_id = cap.id`; watermark keyed by capture
  `url` (advertiser set or domain); listed open spans advance; a span ends at the first capture where its ad is inactive,
  incl. pinned-mode retired ads without `ended_capture_id`. No copy pricing. [Google image prices never end.]

## D6 Readers, tools, UI

- **R15 Price source:** `PriceNow.source` `'web' | 'meta_ad' | 'ad_image'` from `ad_image_id`, not
  `trackedPageId === null` (`tracker.ts:62`); `pageUrl` per platform (Meta `metaPageUrl`, Google the ad's `libraryUrl`);
  `PriceNow(View)` gain `evidenceId: string | null`; widen `lowestUsd` (`pricing.ts:18`) and the `PriceNowView.source`
  enum (`schemas.ts:340`), keeping `.describe` plus "ad_image = a price shown in one of their ad images". O6 unchanged.
- **Tags:** "From an ad image", linked to `/c/<id>/evidence/<evidenceId>`, in
  `competitors/[competitorId]/sections.tsx:34` and `pricing/price-card.tsx:53`. "From an ad" stays for `meta_ad`.
- **Ads:** `AdView` (`schemas.ts:357`) gains `imageEvidenceIds: uuid[]`; `list_ads` (`tools/ads.ts`) reads them after
  `workspaceBusinesses` proves visibility. `AdCard` shows the image through `EvidenceImage` at
  `/files/evidence/<clientId>/<id>`: lazy, contained, at most 240 px, grey panel, alt "Ad image from <competitor>".
  Without a stored image it shows today's text card.
- **R16 Citable:** `image` is added to `MCP_EVIDENCE_KINDS` (`events-read.ts:34`), and with it to
  `citableEvidenceKinds`, so image prices and ad summaries can be cited in summaries, MCP and Ask.
- **Viewer:** an `image` branch in `evidence/[evidenceId]/page.tsx` (:127, :140) like a screenshot; `snapshotSide`
  (`evidence-access.ts:63`) learns `image`; backlog fix: `EvidenceImage` checks `complete && naturalWidth === 0` on mount.
- **Access** unchanged (`get_evidence` → `competitorLinked`, 404s, `private, no-store`).
- **No new tool;** isolation fixtures updated for the kind and world rows; `record --fill` re-record of `ask` (`briefs`
  if it misses), ≤ $1.6, `--max-usd 5`.
- **Copy (sign-off):** the tag, "Ad image" (kind + channel), alt text, a `client.ads.md` line (kept only with a price or
  offer, never with people), a pricing-guide line.
  **R17:** no glossary term.

## Review focus

URL expiry/new-URL subjects · hostile bytes (lying type, bomb, animated, SVG/HTML, oversize) · redirects (private, cross-
host) · robots disallow vs `unavailable` · no sleeping · Jev ignoring the image · bytes in cassettes/logs · people false
negatives · cross-competitor dedupe · "$50 off" as a price · cap counting · spend pause between steps · Google retired ads.

## Dependencies on in-flight work

- **`brief-report`** (planned) takes a migration number (re-check 0103) and moves `workspace/ads.ts` to `@cs/engine`.
