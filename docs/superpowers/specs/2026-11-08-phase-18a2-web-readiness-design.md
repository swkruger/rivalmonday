# Phase 18a-2 — Web readiness (design)

**Date:** 2026-11-08 · **Branch:** `phase-18a` (18a-2, after 18a-1; both merge together) · **Brief:** `docs/work/phase-18a.md`
**Core spec:** §4.1, §4.2, §4.4, §6.1–6.3, §6.6, §9.1 (cited, not restated). **Format/interfaces from:** 18a-1 spec (`2026-11-08-phase-18a1-gbp-meta-design.md`).

## Intent

Everything the crawler needs before `WEB_MONITORING_ENABLED` is switched on, so the first live week already briefs
more than text diffs: rival **website tools** (online booking, chat, financing …) appearing or going, **new pages**
appearing on a rival's site, and **structured prices** (schema.org Offer JSON-LD) in the price tracker. Plus the
tracked-page hygiene and prospect gate the switch-on backlog asks for. Ships **dark**: no live crawl in this phase;
every path is proven by tests over stored-capture fixtures (`page.html.gz`).

**Non-goals.** Event JSON-LD (18d). Own-site prices / a "you" column (deferred, backlog kept). A competitor-page
"website tools" section or any new page read. Inline-script text matching. Page-removed events.

**Anti-goals.** A "rival added online booking" line from a widget that failed to load once. A "new page" line for a
page that always existed (first crawl, sitemap truncation, a page we merely started tracking). Any change in crawl
politeness or a second fetch path. Model spend that grows with sitemap size.

## Owner decisions (2026-11-08, "go as recommended")

- **O1 (Q3)** Bot page stays as built in `apps/web` (`rivalmonday.app/bot`), live with the prod deploy.
  `WEB_MONITORING_ENABLED` stays unset until it is live; 18a-2 adds nothing that crawls without it.
- **O2 (Q5)** New change type `site_feature` (added / removed), briefable, detected from `<script>`/`<iframe>`/
  `<link>`/`<a>` signatures in the stored raw HTML.
- **O3 (Q7)** schema.org Offer/Product price JSON-LD feeds `price_point` now (rules-only: a structured price is a
  price; a discount or a `priceSpecification`-only offer never becomes one). Event markup waits for 18d.
- **O4 (Q8)** Own-site prices deferred until web is live (backlog item kept).

## Design decisions (my calls — builder may refine numbers, not the shape)

### D1 Change types and scoring

`CHANGE_TYPES` += `site_feature`, `new_page`. Both are produced from `web` captures (channel `web`) but are
**structured** changes: they carry `details.changeType` and skip the web tag path's change-type question.

| Type | `type_weights` | Size | Relevance | Typical score → route |
|---|---|---|---|---|
| `site_feature` (added/removed) | 0.7 | `size.default` 0.6 | whole-business 1.0 | 42 → brief |
| `new_page` | 0.7 | `size.default` | service-mapped; `none` → whole-business 1.0; unmatched 0.2 | 42 → brief (matched/none), 8 → archive (unmatched) |

- Both in `WHOLE_BUSINESS_TYPES`; `new_page` also in `SERVICE_MAPPED_TYPES` (title/headings name a service).
- **Brief-only:** like `profile_change`, a route of `alert` is capped to `brief`; new factor `briefOnly: true`
  (`profileCap` stays for `profile_change`; stored factors are never renamed).
- `detailsSignature`: `site_feature|<feature>|<direction>`, `new_page|<pageKey>` (18a-1 lesson: every new type).
- `scoring.version` → 6; three shipped packs + data migration (0100 pattern) + regenerated `catalog-seed.sql.ts`.
- `ChangeDetails` += `feature`, `category`, `vendor`, `pageUrl`, `pageType`, `pageKey`; `direction` widens to
  `'closed' | 'reopened' | 'added' | 'removed'`.
- **Routing rule (new, engine-wide):** `isStructuredChange(c) = c.source !== 'web' || typeof c.details.changeType === 'string'`
  replaces every `source === 'web'` branch that chooses tag questions, summaries or evidence wording (tag stage,
  `model-ops/resolve.ts`, `events/retract.ts`, `briefs/evidence.ts`). Web text diffs never set `details.changeType`.
- `supersedePriorChanges` for web captures excludes `site_feature` rows (`details->>'changeType' = 'site_feature'`),
  as it already excludes `topic` rows; `new_page` belongs to the web diff stage and supersedes with it.

### D2 Markup signals (`@cs/collectors` `web/markup.ts`, pure)

- `siteFeatures(html): SiteFeature[]` — regex over raw HTML attributes (no DOM dependency): `script[src]`,
  `iframe[src]`, `link[href]`, and for `online_booking`/`financing` also `a[href]`. Matches on **host** (suffix) and
  optional path regex. Inline script text is never matched.
- **Registry** `SITE_FEATURE_REGISTRY: readonly SiteFeatureSignature[]` with
  `{ id, category, vendor, hosts: string[], path?: RegExp, tags: ('script'|'iframe'|'link'|'a')[], since: number }`
  and `SITE_FEATURE_REGISTRY_VERSION`. Seed set (each entry needs a fixture; drop any host the builder cannot confirm
  from the vendor's public embed docs rather than guess):
  - `online_booking`: Housecall Pro, ServiceTitan, Jobber, Calendly, Acuity, Setmore, Zocdoc, NexHealth, LocalMed.
  - `live_chat`: Podium, Intercom, Drift, LiveChat, tawk.to, Tidio, Zendesk, HubSpot chat.
  - `financing`: Wisetack, GreenSky, Synchrony, CareCredit, Sunbit, Affirm, Cherry, Service Finance.
  - `review_widget`: Birdeye, NiceJob, Trustindex.
- **Client-facing text names the category, never the vendor** (`SITE_FEATURE_CATEGORY_LABEL` in `@cs/core`:
  "online booking", "live chat", "financing", "review widget"; call tracking is out — customers never see it, ruling 2026-11-08, owner may overturn). The vendor lives in `details.vendor`
  and the evidence text; `EVIDENCE_WORDING` tells the writer not to name it.
- `jsonLdOffers(html): StructuredOffer[]` — every `<script type="application/ld+json">` body, `JSON.parse` in
  try/catch, walks arrays and `@graph`, collects `Offer`/`AggregateOffer` (also nested under `Product`/`Service`
  `offers`) with the nearest `name`/`description`. Max 50 offers per page.
- `markupSha(html)` = sha256 over sorted feature ids + normalised offer tuples (registry version **not** included,
  so a registry edit does not force a full recapture of every page).

### D3 Hash-first capture keeps markup changes (§4.2 "text hash first", §4.4)

`recordWebCapture` today stores `unchanged` (no HTML) when only the text hash matches, so a widget or JSON-LD change
with identical text is invisible. New: `capture.markup_sha` (nullable) is written on `ok`/`unchanged` web captures;
a capture is `unchanged` only when **text sha and markup sha** both match the page's last `ok` capture (a `null`
stored markup sha counts as different: one full capture per page after deploy). `WEB_COLLECTOR_VERSION` → `web/2`.
Captures stay immutable (the column is set at insert).

### D4 `site_feature` stage — two-capture confirmation

New engine stage `site_features` (`SITE_FEATURE_STAGE`, version 1), subject = an `ok` web capture **N** that has a
successor **S** (the page's next capture with status `ok` or `unchanged`). Sweep: oldest first, competitors some
client tracks; no `AD_PRICE_SINCE`-style cutoff needed (prod has no web captures).

1. Features(N) from N's `page.html.gz`; features(S) = features(N) if S is `unchanged` (same markup sha), else from S's HTML.
2. Confirmed set per feature id: present in both → present; absent in both → absent; they disagree → the page's
   previous state (latest earlier `site_features` observation), absent when none.
3. Write `observation { kind: 'site_features', key: <trackedPageId>, data: { features: string[], registry } }`,
   `observed_at` = N's `captured_at`. Out of order (a later capture of the page already has a done run) → observation
   only, no change.
4. No previous observation for the page → baseline, no change. An id whose registry entry is newer (`since`) than the
   previous observation's `registry` → baseline for that id.
5. Page delta → competitor delta: `added` only if no other active page's latest observation (≤ N) has the id;
   `removed` only if none has it. Cooldown: no `site_feature` change for the same (competitor, feature id) in 28 days.
6. One `detected_change` per feature: `source 'web'`, `kind` added/removed, `block_key 'feature:<id>'`,
   `before/after_capture_id` = previous-observation capture / N, text `online booking: <vendor> (on <path>)`.

Effect: a change is briefed one cadence after it appears (daily pages ≈ 1 day, weekly ≈ 7), and a one-off load
failure (N absent, S present) never emits.

### D5 JSON-LD prices (`engine/src/prices/json-ld.ts`, inside `price_extract`)

- `offerPrices(offers): { text: string; obs: PriceObservation[] }[]` → pseudo-blocks joining the text blocks in the
  same `mapPricedTexts` call (sha = `sha256('jsonld|' + text)`, so `price_block_map` caches them) and the same
  `PRICE_MAX_BLOCKS` cap (text blocks first; over the cap = truncated, nothing ends).
- `Offer.price` → `exact`; `AggregateOffer.lowPrice` → `from`; `highPrice` alone ignored. `priceCurrency` must be
  `USD` or missing (missing → USD; all clients are US, ruling 2026-11-08, owner may overturn); any other currency → skip. Offers with any `priceSpecification` → skip. Price must parse as a plain number (commas
  allowed), 0 < amount ≤ `MAX_PRICE`. Name/description matching the discount words (`off`, `discount`, `rebate`,
  `coupon`, `credit`, `savings`) → skip. `promo` = the observer's `PROMO` test on name/description.
- Rows are ordinary page rows (`tracked_page_id` set, `PriceNow.source = 'page'`); dedupe with text prices by the
  existing open-span key. `raw` = `$129` / `from $79`; `context` = redacted `<name> — <raw>`.
- No `price_change` event from JSON-LD alone. `PRICE_VERSION` stays 1 (no re-run of old captures).

### D6 Re-discovery and new pages

- **Store:** `site_url (competitor_id, url_key, url, source, first_seen_at, last_seen_at)` PK (competitor_id,
  url_key) and `site_discovery (competitor_id PK, last_run_at, next_due_at, homepage_status, urls, truncated, runs)`;
  both `service_only`. `tracked_page.appeared_at` (nullable). `pageKey(url)` = bare lower-case host (no `www.`) +
  path without trailing slash + sorted non-tracking query; **scheme-free** (http/https and www/bare are one page).
- **Cadence:** every 28 days per competitor that has a domain and a tracker passing `clientWorkAllowed` +
  `agencyServiceable` (self businesses are never in `client_competitor`, so never crawled). Worker cron
  `discover-schedule` (daily 04:00 UTC, ≤ 25 competitors/run) enqueues the existing `discover-pages` job
  (singleton `discover:<id>`). The worker idles it unless `WEB_MONITORING_ENABLED === 'true'` (existing var). A
  competitor without a `site_discovery` row is due at once (covers pre-18a-2 discoveries, prospects converted, unpaused
  clients).
- **One `discoverPages`, two modes:** *initial* (no active tracked page other than `home`) = today's selection
  (≤ 25), records `site_url` as a baseline, no events. *Refresh* = upsert every candidate into `site_url`; **new** =
  key absent from `site_url`, competitor already had rows, not tracked, and from nav — or from the sitemap only when
  neither this nor the previous run was truncated (`collectSitemapUrls` returns `truncated`). At most 20 new URLs are
  classified per run (nav first). New pages of type `service | service_area | pricing | promo` are tracked with
  `appeared_at = now()`; other types are remembered, not tracked.
- **Room:** under 25 active pages → insert. Full → replace the lowest-priority non-pinned, non-manual page of a
  lower-priority type (`selectPages` order), reason `replaced`; else skip (logged).
- **Event:** the web diff stage, on the **first ok capture** of a page with `appeared_at` within 14 days, writes one
  `new_page` change (`kind 'added'`, `block_key 'page:<trackedPageId>'`, text = path + h1 + up to two h2 blocks,
  ≤ 600 chars; `details { changeType, pageUrl, pageType, pageKey }`). Evidence = that capture.
- **Tracked-page hygiene (backlog):** `tracked_page.inactive_reason` (`gone | duplicate | replaced | manual`),
  `CHECK (active = (inactive_reason IS NULL))`; existing inactive rows become `manual`.
  - Merely unselected pages are never deactivated. **Gone** = non-pinned sitemap/nav page absent from a non-truncated
    run's candidates whose latest capture was HTTP 404/410 → inactive `gone`; it re-activates if it reappears.
  - Discovery upserts never re-activate `manual`/`duplicate`/`replaced` pages (fixes "`active: true` re-activates").
  - Duplicates by `pageKey`: keep pinned, else most recently captured, else oldest; others inactive `duplicate`.
    `add_tracked_page` reuses a row with the same key instead of inserting.
- **Cost:** per run 1 home render + ≤ 10 sitemap files (polite path, robots, limiter) + ≤ 20 classifications.

### D7 Prospect gate (backlog)

`startDiscovery(deps, competitorId, clientId)`: web monitoring off → `disabled`; the client not `clientWorkAllowed`
(prospect, paused, spend-paused) → new value **`deferred`** (my call: "Website monitoring is off" would be false for a
prospect). `convert_prospect` calls it for each tracked competitor after commit; the scheduler is the safety net.
Copy: `deferred: 'Website page discovery starts once monitoring runs for this client.'`

## Interfaces summary

Migration `0101_web_readiness`: `capture.markup_sha`, `tracked_page.{inactive_reason, appeared_at}` + CHECK,
`site_url`, `site_discovery` (RLS forced, `service_only`), pack v6 data. Collectors: `web/markup.ts`
(`siteFeatures`, `jsonLdOffers`, `markupSha`, `SITE_FEATURE_REGISTRY*`), `discovery/page-key.ts` (`pageKey`),
`schedule/due-discovery.ts` (`claimDueDiscoveries`). Engine: `web/site-feature-stage.ts`, `prices/json-ld.ts`,
`isStructuredChange`. Core: `SITE_FEATURE_CATEGORIES`, `SITE_FEATURE_CATEGORY_LABEL`, `MAX_ACTIVE_PAGES` (tools
re-exports). Tools: `Discovery` += `deferred`. Worker: job `discover-schedule`, `engine-site-features`.

## Dependencies on in-flight work

- **18a-1** (same branch, done): change types, `briefOnly` sits next to `profileCap`; pack v5 → v6 in one more migration.
- **`brief-report`** (unmerged): `topicOf`/`GROUP_PHRASE` must cover the two new keys (`offers` topic, "Website,
  prices & services"); whichever merges second adds them.
- **Ask eval:** `search_events`' `changeType` enum and the `Discovery` enum change tool specs → covered by the
  re-record already planned at merge.

## Review Focus candidates

1. A widget absent on one capture and back on the next emits nothing (D4 step 2).
2. First discovery, a sitemap-truncated run and a newly tracked old page never emit `new_page`.
3. A text-identical capture with a new booking script is stored `ok` with HTML; a fully identical one stays `unchanged`.
4. `{"@type":"Offer","price":"20","name":"$20 off"}` and a `priceSpecification`-only offer give no price; `Offer 129 USD` gives one.
5. A `manual` inactive page is never re-activated by discovery; http/https/www variants are one page.
6. A prospect's added competitor returns `deferred` and is discovered on conversion; nothing crawls with the switch off.
7. Every `source === 'web'` branch now uses `isStructuredChange`; web text diffs are untouched.
