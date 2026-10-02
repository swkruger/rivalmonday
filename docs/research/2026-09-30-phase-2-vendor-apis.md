# Phase 2 Vendor API Reference (researched 2026-09-30)

Purpose: exact, source-cited API contracts for implementing data collectors in the TypeScript/Node 24 SaaS. Every fact below is cited to the doc page it came from. Anything the research could not independently confirm is marked **UNVERIFIED**. Do not code strict TypeScript interfaces against UNVERIFIED nested fields without a live sandbox/test call first.

Research method note: most DataForSEO/Apify/Meta pages were retrieved via an HTML-to-markdown fetch-and-summarize tool rather than raw JSON schema dumps. Where a sub-finding carries elevated transcription risk (deep nesting, exact casing), this is flagged inline even when the overall fact is otherwise confirmed.

---

## 1. DataForSEO v3

**Auth:** HTTP Basic (`login:password`, base64-encoded in the `Authorization` header) against `https://api.dataforseo.com/v3`. This is standard across all DataForSEO v3 endpoints (confirmed explicitly on the Google Reviews doc page; treated as universal SDK convention for the other endpoints below — UNVERIFIED as independently restated on every individual page).

**Sandbox:** CONFIRMED real. Base URL is `https://sandbox.dataforseo.com/v3` — swap only the hostname from `api.dataforseo.com`; same paths, same POST bodies, no code changes needed. Same account credentials as production (no separate sandbox key). Free — "Your account will not be charged for using Sandbox endpoints." Returns dummy/mock data, but response structure and field names are identical to production. Same rate limits as production apply in sandbox (2,000 calls/min; POST bodies limited to 100 tasks, or 1 task for live methods).
Source: https://docs.dataforseo.com/v3/appendix-sandbox/ (note: the correct current path is `/v3/appendix-sandbox/`, **not** `/v3/sandbox/` — the latter 404s).

### 1a. Google Maps SERP (with coordinates)

Source: https://docs.dataforseo.com/v3/serp/google/maps/live/advanced/ ; pricing: https://dataforseo.com/pricing/serp/google-maps-serp-api

**Endpoint (Live/synchronous):** `POST https://api.dataforseo.com/v3/serp/google/maps/live/advanced`
(No task_post/task_get variant needed for this doc — Live is the endpoint modeled in the source brief; DataForSEO also offers Standard queue variants for Maps under `serp/google/maps/task_post` / `task_get`, not separately verified here.)

**Request fields:**
- `keyword` (string, required, ≤700 chars)
- One of: `location_code` (integer) | `location_name` (string) | `location_coordinate` (string, format **"latitude,longitude,zoom"**, e.g. style `"53.476,-2.243,15z"`) — **UNVERIFIED**: a full literal worked example string was not visible in the fetched page text; the format description itself ("latitude,longitude,zoom") is confirmed.
- One of: `language_code` (string) | `language_name` (string)
- `depth` (integer, optional, default 100, max 700 — number of results)
- `device` (string, optional: `"desktop"` | `"mobile"`, default `"desktop"`)
- `os` (string, optional: `"windows"`/`"macos"` for desktop; `"android"`/`"ios"` for mobile)
- `tag` (string, optional, ≤255 chars)
- `max_crawl_pages` (integer, optional, max 100)
- `url` (string, optional — direct search URL override)
- `se_domain` (string, optional — custom search engine domain)
- `search_this_area` (boolean, optional, default true)
- `search_places` (boolean, optional, default true)

**Response envelope (top level):**
```
version, status_code, status_message, time, cost, tasks_count, tasks_error, tasks[]
```
`tasks[]` item:
```
id, status_code, status_message, time, cost, result_count, path, data, result[]
```
`result[]` item:
```
keyword, type, se_domain, location_code, language_code, check_url, datetime,
spell, refinement_chips, item_types, se_results_count, items_count, items[]
```
`items[]` item (type `"maps_search"` or `"maps_paid_item"`) — fields relevant to us:
```
type, rank_group, rank_absolute, domain, title, original_title, url,
contact_url, contributor_url, book_online_url,
rating: { rating_type, value, votes_count, rating_max },
rating_distribution,
snippet, address, address_info, place_id, phone,
main_image, total_photos, category, additional_categories, category_ids,
work_hours (timetable with day/open/close), current_status,
feature_id, cid, latitude, longitude,
is_claimed, local_justifications, is_directory_item, price_level, hotel_rating
```
`rating` **is a nested object** (`rating.value`, `rating.votes_count`, `rating.rating_type`, `rating.rating_max`) — confirmed. `place_id` and `cid` are both top-level item fields, not nested.

**Cost:** Live Mode = **$0.002 per SERP page** (up to 1,000,000 SERPs = $2,000). Average turnaround ~6 seconds.

### 1b. Business Data: Google My Business Info

Sources: https://docs.dataforseo.com/v3/business_data/google/my_business_info/task_post/ ; https://docs.dataforseo.com/v3/business_data/google/my_business_info/task_get/ ; https://docs.dataforseo.com/v3/?p=18537 (Live doc); https://dataforseo.com/update/live-google-my-business-info-api

**Endpoints:**
- Live (sync): `POST https://api.dataforseo.com/v3/business_data/google/my_business_info/live` — note the exact path is `.../live`, **not** `.../live/advanced/` (that URL 404s).
- Standard (async): `POST https://api.dataforseo.com/v3/business_data/google/my_business_info/task_post`
- Result retrieval: `GET https://api.dataforseo.com/v3/business_data/google/my_business_info/task_get/{id}` (`{id}` = UUID from task_post response)

**Querying by keyword vs place_id vs cid — IMPORTANT:** this endpoint has **no separate `place_id`/`cid` request fields**. There is a single **`keyword`** field (string, ≤700 chars) that also accepts the literal prefixes `cid:` or `place_id:` inside that same string, e.g. `keyword: "place_id:ChIJ..."` or `keyword: "cid:194604..."`.

**Request fields:**
```
keyword             string   required  (business name, or "cid:<id>" / "place_id:<id>" prefix string)
location_name        string   one-of (with location_code, location_coordinate)
location_code        integer  one-of
location_coordinate  string   one-of  "latitude,longitude,radius"
language_name        string   one-of (with language_code)
language_code        string   one-of
priority             integer  optional  1=standard(default), 2=high priority (task_post only)
tag                  string   optional  ≤255 chars
postback_url         string   optional  (task_post only)
pingback_url         string   optional  (task_post only)
```

**Response envelope:** same shape as 1a (`status_code`, `tasks[]` → `result[]` → `items[]`, `type: "google_business_info"`).

**Item fields:**
```
type, rank_group, rank_absolute, position
title, original_title, description, snippet
category (primary, string), category_ids[], additional_categories[]
cid, feature_id, place_id
address (string)
address_info: { borough, address, city, zip, region, country_code }   UNVERIFIED exact nesting
phone, url, domain, contact_url, contributor_url, book_online_url
logo, main_image, total_photos
rating: { rating_type, value, votes_count, rating_max }
rating_distribution: { "1":n ... "5":n }   UNVERIFIED exact key format (string vs int keys)
work_time.work_hours.timetable: per-day { open:{hour,minute}, close:{hour,minute} }   UNVERIFIED exact dotting
current_status  (opened / closed / temporarily_closed / closed_forever)
popular_times.popular_times_by_days   UNVERIFIED structure
latitude, longitude (float)
is_claimed (boolean — this is the "verified" flag; no separate "verified" field documented)
attributes (object)   UNVERIFIED exact shape
place_topics (object — review keyword mentions)
price_level (inexpensive/moderate/expensive/very_expensive)
hotel_rating (1-5, hotels only)
people_also_search[], local_business_links[]
services[] (pricing — added by a later API update per changelog)
is_directory_item, directory[]
```
No dedicated `reviews_count` field was confirmed on this endpoint separate from `rating.votes_count` — **UNVERIFIED: likely does not exist** (unlike the Reviews endpoint below, which does have a distinct `reviews_count`).

**Cost:**
- Live: **$0.0054 per profile** ($5.4 per 1,000)
- Standard queue: **$0.0015 per profile** ($1.5 per 1,000)
- Priority queue: **$0.003 per profile** ($3 per 1,000)

### 1c. Business Data: Google Reviews

Sources: https://docs.dataforseo.com/v3/business_data/google/reviews/task_post/ ; https://docs.dataforseo.com/v3/business_data/google/reviews/task_get/ ; https://docs.dataforseo.com/v3/business_data/google/reviews/tasks_ready/ ; https://dataforseo.com/pricing/business-data/google-reviews-api

**No live/synchronous mode exists for Reviews** — confirmed explicitly: "Google Reviews API supports only the Standard method of data retrieval, which requires making separate POST and GET requests." (Live mode exists only for My Business Info, not Reviews.)

**Endpoints:**
- `POST https://api.dataforseo.com/v3/business_data/google/reviews/task_post`
- `GET https://api.dataforseo.com/v3/business_data/google/reviews/task_get/{id}` (`{id}` = UUID, valid 30 days)
- `GET https://api.dataforseo.com/v3/business_data/google/reviews/tasks_ready` — polling endpoint, up to 20 calls/min, up to 1000 ready tasks per call, 3-day retention post-completion. Each entry: `id`, `se` (`"google"`), `se_type` (`"reviews"`), `date_posted`, `tag`, `endpoint` (URL to fetch that task's result).

**task_post request fields:**
```
keyword               string   one-of {keyword, cid, place_id} — exactly one required
cid                    string   one-of  e.g. "194604053573767737"
place_id               string   one-of  e.g. "ChIJ..." / "GhIJ..."
location_name          string   one-of (with location_code, location_coordinate)
location_code          integer  one-of
location_coordinate    string   one-of  "latitude,longitude,radius" (min radius 199.9, max 7 decimals)
language_name          string   one-of (with language_code)
language_code          string   one-of
depth                  integer  optional  default 10, max 4490 — number of reviews to retrieve; billing is per-10-reviews so multiples of 10 recommended
sort_by                string   optional  default "relevant"; valid: "newest" | "highest_rating" | "lowest_rating" | "relevant"
priority               integer  optional  1=normal(default), 2=high priority (extra charge)
tag                    string   optional  ≤255 chars
postback_url           string   optional  supports $id/$tag variables
pingback_url           string   optional  supports $id/$tag variables
```
Both `place_id` and `cid` are first-class separate fields here (unlike My Business Info, which only has `keyword` with a prefix convention). No `search_after_token` field was found — **UNVERIFIED / likely does not exist**; pagination appears to be purely `depth`-based.

**Response envelope:** same shape (`tasks[]` → `result[]` → `items[]`). Result-level (aggregate) fields: `keyword, type, se_domain, location_code, language_code, check_url, datetime, title, sub_title, rating (object), feature_id, place_id, cid, reviews_count, items_count`.

**Review item fields (`items[]`):**
```
type, rank_group, rank_absolute, position, xpath
review_text, original_review_text, original_language
time_ago
timestamp                string   UTC, format "yyyy-mm-dd hh:mm:ss +00:00"
rating: { rating_type, value, votes_count, rating_max }   — per-review rating is rating.value (1-5)
reviews_count             (documented at result level; item-level occurrence UNVERIFIED)
photos_count
local_guide               boolean
profile_name
profile_url
profile_image_url         (reviewer's photo URL — NOT "profile_photo_url")
review_url
review_id
owner_answer               string — FLAT STRING, not a nested {text, timestamp} object
original_owner_answer       string
owner_time_ago               string
owner_timestamp               string (separate sibling field, same format as timestamp)
images[]: { type, alt, url, image_url }
review_highlights[]: { feature, assessment }
```
**Correction vs. common assumption:** `owner_answer` is a **flat string**, with `owner_timestamp` / `owner_time_ago` as separate sibling fields — not a nested `owner_answer.text` / `owner_answer.timestamp` object. No "helpful votes" field is documented for reviews.

**Depth/pagination:** `depth` is the sole pagination lever — max reviews returned per task (default 10, max 4490); no offset/page field. `depth=700` → up to 700 reviews, billed as 70 units of 10.

**Turnaround:** Standard queue up to 45 minutes; Priority queue (`priority:2`) up to 1 minute.

**Cost:**
- Standard queue: **$0.00075 per 10 reviews** ($75 per 1M reviews)
- Priority queue: **$0.0015 per 10 reviews** ($150 per 1M reviews)

**review_id stability:** not explicitly addressed by the docs fetched — treat as **UNVERIFIED** whether `review_id` is stable across repeated pulls of the same review (important for the data model's dedup key). Recommend a live test: pull the same place's reviews twice a week apart and diff `review_id` values before relying on it as a primary key.

### 1d. Google Ads Transparency (SERP endpoints)

Sources: https://docs.dataforseo.com/v3/serp/google/ads_advertisers/live/advanced/ ; https://docs.dataforseo.com/v3/serp/google/ads_search/live/advanced/ ; pricing: https://dataforseo.com/pricing/serp/google-ads-advertisers-serp-api ; https://dataforseo.com/pricing/serp/google-ads-search-serp-api

**Correction vs. common assumption:** these are two functionally different endpoints, not a single advertiser+ads pair keyed by domain.

**`ads_advertisers` — advertiser/account finder (keyword/name search, NOT a domain lookup):**
`POST https://api.dataforseo.com/v3/serp/google/ads_advertisers/live/advanced`
Request: `keyword` (string, required, ≤700 chars — advertiser name search, not a domain), `location_name`/`location_code`/`location_coordinate` ("latitude,longitude") optional, `priority` (1 normal/default, 2 high), `tag` (≤255 chars).
Response `items[]`:
```
type: "ads_multi_account_advertiser" | "ads_advertiser" | "ads_domain"
rank_group, rank_absolute
title            (advertiser name)
location         (country code)
verified         (boolean)
approx_ads_count (integer)
advertiser_id    (present for single-advertiser results)
domain           (present for domain-type results)
advertisers[]    (nested account objects, present for multi-account results)
```
No `creative_id`, `first_shown`/`last_shown`, or preview/image URL on this endpoint.
Cost: billed only for setting a task, at the Google Organic SERP base rate — Standard queue $0.0006/request ($600/1M), Priority queue $0.0012/request ($1,200/1M), despite the "/live/advanced" path name (turnaround framed as 5 min Standard / ~1 min Priority, not instant).

**`ads_search` — creative-level endpoint (this is the one with creative_id/first_shown/last_shown/preview image):**
`POST https://api.dataforseo.com/v3/serp/google/ads_search/live/advanced`
Request: one of `target` (string, domain associated with advertiser) or `advertiser_ids` (array, max 25); optional `location_code`/`location_name`/`location_coordinate`; `depth` (default 40, max 120); `platform` (`"all"|"google_play"|"google_maps"|"google_search"|"google_shopping"|"youtube"`); `format` (`"all"|"text"|"image"|"video"`); `priority` (1/2); `tag`; `date_from`/`date_to` (yyyy-mm-dd, min date 2018-05-31).
Response `items[]` (type `"ads_search"`):
```
type, rank_group, rank_absolute,
advertiser_id, creative_id,
title      (advertiser name)
url        (ad transparency platform link)
verified
format     (text | image | video)
preview_image: { url, height, width }
first_shown, last_shown   (timestamps)
```
Preview image is nested at `preview_image.url`, not a bare `preview`/`image` field.
Cost: Live Mode $0.002/SERP page of up to 40 results ($2,000/1M); Priority queue $0.0012/page (~1 min); Standard queue $0.0006/page (~5 min). Extra charges apply beyond 40 results/page — **UNVERIFIED exact multiplier/formula**.

### 1e. Google Jobs SERP

Sources: https://docs.dataforseo.com/v3/serp/google/jobs/overview/ ; https://docs.dataforseo.com/v3/serp/google/jobs/task_post/ ; https://docs.dataforseo.com/v3/serp/google/jobs/task_get/advanced/ ; https://dataforseo.com/pricing/serp/google-jobs-serp-api

**Correction vs. common assumption: there is NO live/advanced endpoint for Jobs.** `.../jobs/live/advanced/` 404s, and the pricing page explicitly states no separate Live pricing/execution method is offered. Standard (task_post/tasks_ready/task_get) is the only mode.

**Endpoints:**
```
POST https://api.dataforseo.com/v3/serp/google/jobs/task_post
GET  https://api.dataforseo.com/v3/serp/google/jobs/tasks_ready
GET  https://api.dataforseo.com/v3/serp/google/jobs/task_get/advanced/{id}
GET  https://api.dataforseo.com/v3/serp/google/jobs/task_get/html/{id}
GET  https://api.dataforseo.com/v3/serp/google/jobs/locations
```

**task_post request fields:**
```
keyword           string   required  (job title, ≤700 chars)
location_code / location_name   one-of, required
language_code / language_name   one-of, required
depth             integer  optional  default 10, max 200 (results per SERP)
priority          integer  optional  1 normal, 2 high
tag               string   optional  ≤255 chars
location_radius   string   optional  search radius in km, max 300
employment_type   array    optional  "fulltime" | "partime" | "contractor" | "intern"
                            NOTE: DataForSEO's own doc spells it "partime" (not "parttime") — quote verbatim, do not "fix" when implementing
pingback_url, postback_url, postback_data ("regular"|"advanced"|"html", required if postback_url set)
```

**task_get/advanced response** — same envelope shape as other SERP endpoints. `items[]` item (type `"google_jobs_item"`):
```
type, rank_group, rank_absolute, position, xpath,
job_id, title,
employer_name, employer_url, employer_image_url,
location,
source_name, source_url,
salary            (free-text string or null — NOT a structured min/max/currency object)
contract_type,
timestamp, time_ago,
rectangle (object or null)
```
Field-name corrections vs. common guesses: posting recency is `time_ago` (plus raw `timestamp`), not `posted_at`; the listing URL is `source_url`, not `url`. **UNVERIFIED: whether a long-form `description` field exists in `items[]`** — the fetched doc text did not show one; recommend checking a live example response before assuming a description is available via the advanced JSON (it may only exist in the `task_get/html` variant).

**Cost:** Standard queue normal priority $0.0006 per SERP page/10 results ($600/1M), turnaround up to 5 min; high priority $0.0012/page ($1,200/1M), turnaround ~1 min average.

### 1f. Error codes / rate limits

Sources: https://docs.dataforseo.com/v3/appendix/errors/ ; https://docs.dataforseo.com/v3/appendix-sandbox/ ; https://dataforseo.com/help-center/rate-limits-and-request-limits

**Error structure:** every response has `status_code` (integer) and `status_message` (string) at both the top level and inside each `tasks[]` item. Code ranges: `20000`s = success (e.g. `20000` "ok.", `20100` "task created."), `40000`s = client error, `50000`s = server error.

Specific codes quoted on the page:
- `40100` — "you are not authorized to access this resource"
- `40104` — account verification required before API use
- `40202` — "the rate-limit per minute has been exceeded"
- `40203` — daily cost limit exceeded
- `40401` — "task not found"
- `40403` — "results expired" (tasks older than 30 days)
- `50401` — "internal error - timeout" (live-mode tasks exceeding 120 seconds)
- `50301` — "3rd party api service unavailable"

HTTP-level status is normally `200` even on API-level errors, but `401`, `402`, `404`, `500` can occur at the HTTP layer too.

**Rate limits (production, from the help-center page):**
- General: **2,000 requests/minute** across most endpoints
- `task_post`: recommended max **100 tasks per POST call**
- OnPage Instant Pages / Content Parsing Live / Page Screenshot: stricter **20 tasks max per request**
- Database-dependent APIs (Content Analysis, Trends, Labs, Backlinks, AI Optimization, OnPage): max **30 simultaneous/concurrent requests** per endpoint
- Live Google Ads (Keyword Data API — a different product area from the SERP ads endpoints in 1d): **12 requests/minute** — **UNVERIFIED** whether this specific figure also applies to `serp/google/ads_search`/`ads_advertisers`; treat those as falling under the general 2,000/min limit unless proven otherwise
- Live Google Trends: 250 Live tasks/minute, system-wide (shared across all users)

**UNVERIFIED:** no dedicated `docs.dataforseo.com/v3/appendix/rate-limits/` page was found; the authoritative numbers above come from the `dataforseo.com/help-center` page, not a `docs.dataforseo.com` page.

---

## 2. Apify — Meta/Facebook Ad Library scraping

Caveat: Apify Store pages were mostly read via summarized fetch, so output field **casing** (camelCase vs snake_case) carries residual risk except where a raw OpenAPI spec was pulled directly (noted below). Recommend one live test run per actor before hard-coding TypeScript interfaces.

### 2a. Actor selection

| Actor slug | Users (total/monthly) | Rating | Notes |
|---|---|---|---|
| `apify/facebook-ads-scraper` (official) | 39,627 / 6,657 | 3.99/5 | Official Apify namespace |
| `curious_coder/facebook-ads-library-scraper` | 42,841 / 6,040 | 4.78/5 (102 reviews) | Higher rated, last updated Jan 30, 2026 |
| `tugkan/facebookads-scraper` | ~28,000 / 4,100 | 4.2/5 (52 reviews) | Smaller alternative |

Recommendation: **`apify/facebook-ads-scraper`** as primary (official, maintained), **`curious_coder/facebook-ads-library-scraper`** as higher-rated alternative.

Sources: https://apify.com/apify/facebook-ads-scraper , https://apify.com/curious_coder/facebook-ads-library-scraper , https://apify.com/tugkan/facebookads-scraper

**UNVERIFIED:** a competitor marketing page (metapi.io/compare/apify) claimed Meta tightened Ad Library rate limits in Jan 2026 and that Apify actors "stop at 5K-7K records even when 50K exist, with no SLA." Treat this as unverified/biased marketing claim, not confirmed from Apify or Meta's own docs.

**`apify/facebook-ads-scraper`** (actor ID for API calls: `apify~facebook-ads-scraper`)
Input fields (HIGH-CONFIDENCE, from store page text):
```json
{
  "startUrls": [{ "url": "https://www.facebook.com/ads/library/?country=ALL&ad_type=all&active_status=active&view_all_page_id=..." }],
  "resultsLimit": 10,
  "onlyTotal": false,
  "includeAboutPage": false,
  "isDetailsPerAd": false,
  "activeStatus": "",
  "sorting": "",
  "onlyAdsNewerThan": "2024-01-01",
  "onlyAdsOlderThan": "2024-12-31",
  "enrichWithEcommerceData": false
}
```
Country/ad-type/keyword/active-status filters are passed as **query params embedded in the `startUrls` URL itself** (e.g. `country=`, `ad_type=`, `active_status=`, `view_all_page_id=`), not as discrete top-level input fields. `resultsLimit` caps result count (empty = as many as possible).
Output fields (casing UNVERIFIED — summarizer showed mixed forms):
```json
{
  "adArchiveID": "...", "pageID": "...", "pageName": "Sephora",
  "startDate": "...", "startDateFormatted": "...",
  "endDate": "...", "endDateFormatted": "...",
  "isActive": true,
  "publisherPlatform": ["FACEBOOK", "INSTAGRAM", "THREADS"],
  "snapshot": {
    "body": { "text": "..." }, "title": "...",
    "images": ["..."],
    "videos": [{ "videoHdUrl": "...", "videoSdUrl": "...", "videoPreviewImageUrl": "..." }],
    "linkUrl": "...", "ctaText": "...", "cards": ["..."]
  },
  "ecommerceData": ["... when enrichWithEcommerceData=true"]
}
```
**UNVERIFIED:** exact field name for the Ad Library permalink/snapshot URL (`snapshotUrl`/`adSnapshotUrl`/`url`) — not confirmed in fetched text.
Sources: https://apify.com/apify/facebook-ads-scraper/api , https://apify.com/apify/facebook-ads-scraper/output

**`curious_coder/facebook-ads-library-scraper`** (actor ID: `curious_coder/facebook-ads-library-scraper` or `curious_coder~facebook-ads-library-scraper`)
Input schema — **pulled verbatim from the actor's raw OpenAPI JSON** (`https://api.apify.com/v2/actors/XtaWFhbtfxyzqrFmd/builds/wYDFs3xTPOVCo9Wag/openapi.json`), so this is CONFIRMED, not summarized:
```json
{
  "urls": [{ "url": "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&q=linkedin&search_type=keyword_unordered&media_type=all" }],
  "scrapeAdDetails": false,
  "limitPerSource": 100,
  "count": 100,
  "scrapePageAds.period": "",
  "scrapePageAds.activeStatus": "all",
  "scrapePageAds.sortBy": "impressions_desc",
  "scrapePageAds.countryCode": "ALL",
  "runTag": "",
  "proxy": {}
}
```
- `scrapePageAds.activeStatus`: enum `"all" | "active" | "inactive"`, default `"all"`
- `scrapePageAds.sortBy`: enum `"impressions_desc" | "most_recent"`
- `scrapePageAds.countryCode`: ISO 3166-1 alpha-2, or `"ALL"`
- `scrapePageAds.period`: enum `"" | "last24h" | "last7d" | "last14d" | "last30d"`
- `count`/`limitPerSource`: overlapping result-count caps ("actual number might exceed limit by up to 30")
Output fields documented on the store page (casing UNVERIFIED): Ad ID, Ad Archive ID, Categories, Spend, Impressions, Start/End Dates, Page Name, Advertiser, Reach Estimate (full data-fields table not fully enumerable from the fetch).
Sources: https://apify.com/curious_coder/facebook-ads-library-scraper/api

### 2b. Running an Apify actor synchronously via the API — CONFIRMED

Current official endpoint form uses `/actors/` (the older `/acts/` form still works as a legacy alias):
```
POST https://api.apify.com/v2/actors/{actorId}/run-sync-get-dataset-items
GET  https://api.apify.com/v2/actors/{actorId}/run-sync-get-dataset-items   (no-input variant)
```
`{actorId}` format: `username~actor-name` (tilde) e.g. `apify~facebook-ads-scraper`, or the actor's internal alphanumeric ID.

**Auth — both confirmed:**
- Header (recommended): `Authorization: Bearer <token>`
- Query param (documented but flagged by Apify as less secure since it lands in logs): `?token=<token>`

**Request body:** JSON object matching the actor's input schema, sent as POST body.

**Response:** a **raw JSON array** of dataset items directly (no `{data: ...}` wrapper). Other supported `format` values via query param: `json` (default), `jsonl`, `csv`, `html`, `xlsx`, `xml`, `rss`. Other params: `clean`, `limit`, `offset`, `fields`, `omit`, `timeout`, `memory`.

**Timeout:** if the run exceeds **300 seconds**, the sync endpoint returns **HTTP 408**. For longer scrapes, use the async run endpoint + dataset-items endpoint and poll instead.

Sources: https://docs.apify.com/api/v2 , https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post , https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-get

### 2c. ScrapeCreators Meta Ad Library API (fallback) — CONFIRMED official docs found

Docs root: https://docs.scrapecreators.com

**Search ads by keyword:**
```
GET https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads
```
Auth header: `x-api-key: <key>` (required).
Required param: `query` (string, search keyword).
Optional: `sort_by` (`total_impressions`|`relevancy_monthly_grouped`), `search_type` (`keyword_unordered`|`keyword_exact_phrase`), `ad_type` (`all`|`political_and_issue_ads`), `country` (2-letter, default `ALL`), `language`, `status` (`ALL`|`ACTIVE`|`INACTIVE`, default `ACTIVE`), `media_type` (`ALL`|`IMAGE`|`VIDEO`|`MEME`|`IMAGE_AND_MEME`|`NONE`), `start_date`/`end_date` (`YYYY-MM-DD`), `cursor`, `trim`.
Response: `searchResults[]` — each item has `ad_archive_id`, `collation_id`, `is_active`, `page_name`; top level also has `searchResultsCount`, `cursor`, `credits_charged`.
Source: https://docs.scrapecreators.com/v1/facebook/adLibrary/search/ads

**Get ads by page/company:**
```
GET https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads
```
(POST also supported, for large cursor payloads.)
Auth header: `x-api-key`. Required (one of): `pageId` or `companyName`. Optional: `country`, `status` (default `ACTIVE`), `media_type`, `language`, `sort_by`, `start_date`/`end_date`, `cursor`, `trim`.
Response skeleton:
```json
{
  "success": true,
  "results": [{
    "ad_archive_id": "...", "collation_id": "...", "collation_count": 1,
    "is_active": true, "page_id": "...", "page_name": "...",
    "start_date": 1710000000, "end_date": 1712000000,
    "publisher_platform": ["FACEBOOK", "INSTAGRAM"],
    "snapshot": {
      "body": { "text": "..." }, "display_format": "VIDEO",
      "images": ["..."],
      "videos": [{ "video_hd_url": "...", "video_sd_url": "...", "video_preview_image_url": "..." }]
    }
  }],
  "cursor": "...", "credits_remaining": 0, "credits_charged": 1
}
```
Note: `start_date`/`end_date` here are **Unix timestamps** (integers) — distinct from the request's own `YYYY-MM-DD` date-string params.
Source: https://docs.scrapecreators.com/v1/facebook/adLibrary/company/ads

---

## 3. Meta Graph API — Instagram Business Discovery

Sources: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery ; https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery ; https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user ; https://developers.facebook.com/docs/instagram-platform/reference/instagram-media

### 3a. Request format

Pattern: `GET /<YOUR_APP_USER'S_IG_USER_ID>/business_discovery` — the call is made **against your own connected account's IG User ID**, with the target specified via `username()` field expansion. It is not a lookup keyed by the target's own ID.

Confirmed example (quoted from the live doc):
```
GET https://graph.facebook.com/v26.0/17841405309211844
    ?fields=business_discovery.username(bluebottle){followers_count,media_count}
    &access_token=<YOUR_APP_USERS_INSTAGRAM_USER_ACCESS_TOKEN>
```
Response:
```json
{ "business_discovery": { "followers_count": 267793, "media_count": 1205, "id": "17841401441775531" }, "id": "17841405309211844" }
```
Nested media example (also quoted from the doc):
```
?fields=business_discovery.username(bluebottle){media{comments_count,like_count,view_count}}
```
Doc's own caveat (quoted): "Please note that `view_count` includes both paid and organic metrics." Also quoted: "performing a GET on any returned IG Media will fail due to insufficient permissions" — nested media data is read-only through the parent call, not independently fetchable.

**Confirmed available fields** (from the IG User / IG Media reference "Fields" tables):
- IG User node, Public fields: `alt_text`, `biography`, `followers_count`, `id`, `media_count`, `username`, `website`. (NOT public: `follows_count`, `has_profile_pic`, `is_published`, `legacy_instagram_user_id`, `name`, `profile_picture_url`.)
- IG Media node, Public fields: `alt_text`, `caption`, `comments_count`, `id`, `is_shared_to_feed`, `media_audio_type`, `media_product_type`, `media_type`, `media_url`, `owner`, `permalink`, `shortcode`, `thumbnail_url`, `timestamp`, `username`, `view_count`, `reposts_count`, `total_comments_count`, `total_like_count`. (NOT public: `boost_ads_list`, `copyright_check_information`, `is_ai_generated`, `like_count`, `saved_count`, `shares_count`, `total_views_count`.)

**Nuance:** `like_count` is not in the generic "Public" Media field set, yet Business Discovery's own example explicitly returns it — it's granted via Business Discovery's specific permission set (below), not the generic Public-field mechanism.

`media_url` omission rule (quoted): "The `media_url` field is omitted for video media that contains copyrighted or licensed audio... It is also omitted for reels whose owner has turned off reel downloads, on requests that read another user's media: business discovery, tags, mentions, hashtag search, and collaborative media."

**UNVERIFIED:** whether `profile_picture_url` resolves under `business_discovery` for a target — it is explicitly NOT marked Public on the IG User field table, so likely unavailable, despite third-party (non-Meta) examples showing it used. Also **UNVERIFIED**: `biography`/`website`/`username` are tagged Public in the generic table but no official Business Discovery example actually demonstrates requesting them on a target account.

### 3b. Token, permissions, consent

Business Discovery exists **only** under "Instagram API with Facebook Login" — confirmed absent from "Instagram API with Instagram Login" docs (zero mentions found there). Requires a connected Facebook Page + Facebook Login, not the native Instagram-Login-only product.

**Token type:** a Facebook User access token (the reference page's Permissions section explicitly says "A Facebook User access token with the following permissions" — not a Page token, not an App token).

**Permissions required** (quoted verbatim):
> "A Facebook User access token with the following permissions:
> - `instagram_basic`
> - `instagram_manage_insights`
> - `pages_read_engagement`
>
> If the token is from a User whose Page role was granted via the Business Manager, one of the following permissions is also required:
> - `ads_management`
> - `ads_read`"

**Consent nuance:** no target consent is required. Only documented restriction (quoted): "Data about age-gated Instagram professional accounts will not be returned." Target just needs to be a public Instagram Business or Creator professional account (not personal), not age-gated.

**UNVERIFIED:** a web-search claim that short-form scopes (e.g. `business_basic`) were deprecated Jan 27, 2025 in favor of `instagram_business_basic` for Instagram-Login apps — not independently re-verified against an official page in this session; the Facebook-Login scope trio above (`instagram_basic`/`instagram_manage_insights`/`pages_read_engagement`) IS directly confirmed.

### 3c. Current Graph API version

As of 2026-09-30 (from https://developers.facebook.com/docs/graph-api/changelog/versions):

| Version | Release | Expiration |
|---|---|---|
| v26.0 (current/latest) | July 29, 2026 | TBD |
| v25.0 | Feb 18, 2026 | July 29, 2028 |
| v24.0 | Oct 8, 2025 | Feb 18, 2028 |
| v23.0 | May 29, 2025 | Oct 8, 2027 |
| v22.0 | Jan 21, 2025 | May 20, 2027 |
| v21.0 | Oct 2, 2024 | Jan 21, 2027 |
| v20.0 | May 21, 2024 | **Sept 24, 2026 — already expired** |
| v19.0 and older | — | expired |

Use **v26.0** for new implementation. The Business Discovery doc's own live example uses v26.0.

### 3d. Rate limits

Sources: https://developers.facebook.com/docs/instagram-platform/overview ; https://developers.facebook.com/docs/graph-api/overview/rate-limiting

**Important carve-out** (quoted verbatim): "All endpoints are subject to Instagram Business Use Case rate limiting except for **Business Discovery** and **Hashtag Search** endpoints, which are subject to **Platform Rate limiting**." This means Business Discovery does **not** use the standard `4800 × impressions/24h` formula that applies to other Instagram Platform endpoints.

Instead, generic Graph API Platform Rate Limits apply:
- App-token formula (quoted): "Calls within one hour = 200 * Number of Users" (unique daily/weekly/monthly active users of the app), rolling one-hour window.
- User-token calls (the type Business Discovery actually uses): "A user's call count is the number of calls a user can make during a rolling one hour window. Due to privacy concerns, we do not reveal actual call count values for users" — **no published numeric ceiling**.
- Real-time usage surfaced via the `X-App-Usage` response header (JSON: `call_count`, `total_cputime`, `total_time`, each a % of the rolling hour's allotment); throttling occurs as any approaches 100.

**Practical implication:** budget conservatively per connected customer token and monitor `X-App-Usage` on every response rather than hardcoding a call ceiling.

---

## 4. Cloudflare R2 via AWS SDK v3

Sources: https://developers.cloudflare.com/r2/api/s3/api/ ; https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/

Current npm versions (registry.npmjs.org, Sept 2026): `@aws-sdk/client-s3` = **3.1144.0**; `@aws-sdk/s3-request-presigner` tracks the same release train (3.1144.0).

**S3Client config:**
```ts
import { S3Client } from "@aws-sdk/client-s3";

const S3 = new S3Client({
  region: "auto",                                      // literal string "auto"; required by SDK, unused by R2
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});
```
Cloudflare notes empty-string region / `us-east-1` also work as aliases for compatibility, but `"auto"` is the documented value.

**Commands:**
```ts
import { PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

await S3.send(new PutObjectCommand({ Bucket, Key, Body: fileBuffer, ContentType: "image/png" }));
await S3.send(new GetObjectCommand({ Bucket, Key }));
await S3.send(new HeadObjectCommand({ Bucket, Key }));
```
Supported ops per Cloudflare docs: GetObject, PutObject, HeadObject, DeleteObject(s), CopyObject, ListObjectsV2 (ListObjects also works, V2 recommended), full multipart set. **Documented unsupported:** `x-amz-acl`/grant headers, object locking/tagging, SSE-KMS, `x-amz-request-payer`, `x-amz-expected-bucket-owner`.

**Presigned GET:**
```ts
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const command = new GetObjectCommand({ Bucket, Key });
const url = await getSignedUrl(S3, command, { expiresIn: 3600 }); // seconds; default 900; max 604800 (7 days)
```

**Checksum incompatibility — CONFIRMED, current issue:** starting around AWS SDK for JS v3 3.729.0 (part of a broader SDK-wide default rollout), the client began automatically attaching CRC32 checksum headers (`x-amz-checksum-algorithm`, `x-amz-sdk-checksum-algorithm`, etc.) by default on requests like PutObject. R2's checksum support is partial — CRC-64/NVME is FULL_OBJECT-only, while CRC-32/CRC-32C/SHA-1/SHA-256 are COMPOSITE-type only — so R2 rejects the FULL_OBJECT-style header the newer SDK sends by default, producing errors like `Header 'x-amz-checksum-algorithm' with value 'CRC32' not implemented`.

**Workaround** (confirmed via AWS SDK config docs + multiple third-party reports; **UNVERIFIED** whether Cloudflare's own R2 docs pages explicitly state this):
```ts
const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",   // valid: "WHEN_SUPPORTED" (new SDK default) | "WHEN_REQUIRED"
  responseChecksumValidation: "WHEN_REQUIRED",
});
```
Also settable via env vars `AWS_REQUEST_CHECKSUM_CALCULATION` / `AWS_RESPONSE_CHECKSUM_VALIDATION`.

---

## 5. robots-parser (npm)

Source: https://www.npmjs.com/package/robots-parser ; https://github.com/samclarke/robots-parser

**Current version: 3.0.1**

```js
var robotsParser = require('robots-parser');

var robots = robotsParser('http://www.example.com/robots.txt', [
  'User-agent: *',
  'Disallow: /dir/',
  'Allow: /dir/test.html',
  'Crawl-delay: 1',
  'Sitemap: http://example.com/sitemap.xml',
  'Host: example.com'
].join('\n'));

robots.isAllowed('http://www.example.com/test.html', 'Sams-Bot/1.0');        // true
robots.isDisallowed('http://www.example.com/dir/test2.html', 'Sams-Bot/1.0'); // true
robots.getCrawlDelay('Sams-Bot/1.0');  // 1 (seconds; undefined if not specified)
robots.getSitemaps();                  // ['http://example.com/sitemap.xml']
robots.getPreferredHost();             // 'example.com' or null
```

Full method list: `robotsParser(url, contents)` (constructor — `url` used for relative-path/origin resolution, `contents` is raw robots.txt text), `isAllowed(url, [ua])` → true/false/undefined, `isDisallowed(url, [ua])`, `isExplicitlyDisallowed(url, ua)` (like isDisallowed but no fallback to wildcard `*` rules), `getMatchingLineNumber(url, [ua])` (1-based, -1 if none, undefined for internal rules), `getCrawlDelay([ua])`, `getSitemaps()`, `getPreferredHost()`.

---

## 6. Playwright (npm `playwright`) + sharp

Sources: https://playwright.dev/docs/api/class-browsertype ; https://playwright.dev/docs/api/class-page ; raw GitHub `microsoft/playwright/docs/src/api/class-page.md` ; https://playwright.dev/docs/screenshots

**Current version: 1.63.0** (npm registry `playwright/latest`).

Install: `npx playwright install chromium`

```ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true }); // headless defaults to true anyway
const context = await browser.newContext({ userAgent: 'MyBot/1.0' });
const page = await context.newPage();
// browser.newPage() also exists as a shortcut creating an implicit context

const response = await page.goto(url, {
  timeout: 30000,
  waitUntil: 'domcontentloaded',   // valid: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'; default 'load'
});
const status = response?.status();   // CONFIRMED: response.status() gives the HTTP status code

const html = await page.content();   // Promise<string>, full HTML incl. doctype

const buf = await page.screenshot({
  fullPage: true,
  type: 'jpeg',       // valid: "png" | "jpeg" | "webp", default "png"
  quality: 80,        // 0-100
});
```

Exact quoted wording from Playwright's source on `quality`/`type`:
> `quality` — "The quality of the image, between 0-100. Not applicable to `png` images. For `jpeg` the default is `80`. For `webp`, a quality of `100` (the default) produces a lossless image, while lower values use lossy compression."
> `type` — "Specify screenshot type, defaults to `png`." Valid: `"png"|"jpeg"|"webp"`.

So **quality applies to both jpeg and webp** (not just jpeg), ignored for png; default screenshot type is `png`.

Other common `launch()` options: `executablePath`, `args`, `timeout` (default 30000ms), `slowMo`, `proxy`, `channel`, `downloadsPath`.

**sharp (npm):** https://sharp.pixelplumbing.com/api-output ; current version **0.35.5**
```js
const sharp = require('sharp');
const outBuffer = await sharp(inputBuffer).webp({ quality: 80 }).toBuffer();
```
`.webp({ quality })`: integer, range 1–100, default 80 (lossy). `.toBuffer()` → `Promise<Buffer>`; pass `{ resolveWithObject: true }` to get `{ data, info }` (info includes format/size/width/height/channels); callback form `(err, data, info)` also supported.

---

## 7. Sitemap parsing — fast-xml-parser

Source: https://registry.npmjs.org/fast-xml-parser/latest ; GitHub `docs/v4,v5/2.XMLparseOptions.md`

**Current version: 5.11.2** (note: a `docs/v6` folder exists upstream with only a Getting Started stub — **UNVERIFIED** whether v6 is released or still WIP; the v4/v5 API below is authoritative for the published 5.11.2 package).

```js
const { XMLParser } = require('fast-xml-parser');

const options = {
  ignoreAttributes: false,     // default TRUE (attributes dropped by default) — set false to keep attributes
  attributeNamePrefix: '@_',
  parseTagValue: true,         // parses numeric-looking tag text via the `strnum` package
  isArray: (tagName, jPath, isLeafNode, isAttribute) => {
    return ['urlset.url', 'sitemapindex.sitemap'].includes(jPath);
  },
};

const parser = new XMLParser(options);
const obj = parser.parse(xmlString);
```

**Key gotcha:** by default, fast-xml-parser only produces an array for a repeated tag when there is more than one occurrence; a sitemap with exactly one `<url>` (or a sitemap index with exactly one `<sitemap>`) parses as a **plain object**, not a one-element array, unless `isArray` forces it via the `jPath` match shown above. This breaks naive `.map()` code on single-URL sitemaps.

- Regular sitemap shape: `{ urlset: { url: [ { loc, lastmod, changefreq, priority }, ... ] } }`
- Sitemap index shape: `{ sitemapindex: { sitemap: [ { loc }, ... ] } }`

`ignoreAttributes` can also take an array of attribute names, array of regexes, or a callback `(attrName, jPath) => boolean`. `parseTagValue` converts numeric-looking tag text to JS numbers via `strnum` (finer control via `numberParseOptions`). `isArray` signature: `(tagName, jPathOrMatcher, isLeafNode, isAttribute) => boolean`.

---

## Implementation notes

**Sync vs async per DataForSEO endpoint (weekly batch collector):**
- **Google Maps SERP** (1a): use **Live** (`.../live/advanced`) — synchronous, ~6s turnaround, cheap ($0.002/page). Good fit for a weekly per-location pull.
- **Google My Business Info** (1b): use **Live** (`.../live`) for weekly refresh — $0.0054/profile is the highest per-call cost of these four, but sync simplicity is worth it at weekly cadence/volume. Fall back to Standard queue task_post/task_get ($0.0015/profile) if volume makes the Live premium matter.
- **Google Reviews** (1c): **must** use task_post → tasks_ready (poll) → task_get — no live mode exists. Standard queue turnaround up to 45 min; budget the batch window accordingly, or pay for Priority (`priority:2`, ~1 min, 2x cost) if the weekly job is time-constrained.
- **Google Ads Transparency** (1d): both `ads_advertisers` and `ads_search` support `/live/advanced` and are cheap ($0.0006–0.002/page) — use Live for both in a weekly batch.
- **Google Jobs** (1e): **no live mode exists** — must use task_post/tasks_ready/task_get, same polling pattern as Reviews.

**Expected costs per call (summary):**
| Endpoint | Mode | Cost |
|---|---|---|
| Maps SERP | Live | $0.002/page |
| My Business Info | Live | $0.0054/profile |
| My Business Info | Standard/Priority queue | $0.0015 / $0.003 per profile |
| Reviews | Standard/Priority queue | $0.00075 / $0.0015 per 10 reviews |
| Ads Advertisers | Live (Standard/Priority-priced) | $0.0006 / $0.0012 per request |
| Ads Search | Live/Priority/Standard | $0.002 / $0.0012 / $0.0006 per page (≤40 results) |
| Jobs | Standard/Priority queue | $0.0006 / $0.0012 per page (10 results) |

**Things that would change the data model:**
- **Review IDs**: `review_id` stability across repeated pulls is **UNVERIFIED** — do not assume it's a safe long-term primary key without a live test (pull twice, diff). If unstable, dedup reviews by a composite key (place/cid + profile_name + timestamp + review_text hash) instead.
- **Ads `first_shown`/`last_shown`**: confirmed available, but only on `ads_search` (creative-level), not `ads_advertisers` (account-level) — the two endpoints serve different purposes and should map to different model entities (Advertiser vs Creative).
- **`owner_answer` is a flat string**, not `{text, timestamp}` — a naive nested-object model for business owner replies would need `owner_answer` + separate `owner_timestamp`/`owner_time_ago` fields instead.
- **Jobs**: no structured salary (single free-text `salary` string) and possibly no `description` field in the advanced JSON (UNVERIFIED) — a structured `salary_min/max/currency` column would require ourselves to parse the free-text string, and a full job description may require the separate `task_get/html` variant rather than the JSON one.
- **My Business Info** nested objects (`address_info`, `rating_distribution`, `work_time.work_hours.timetable`, `attributes`, `services[]`, `popular_times`) are UNVERIFIED in exact shape — treat as loosely-typed/`unknown` in TypeScript until a sandbox sample confirms real shapes, rather than writing strict interfaces now.
- **Instagram Business Discovery**: `like_count` is available despite not being a generically "Public" field (it's granted via Business Discovery's specific permission grant) — don't assume other "non-Public" fields work the same way; `profile_picture_url` is likely NOT available (flagged Public=false) despite third-party examples suggesting otherwise — confirm before building a model column for it.
- **Apify actor output casing** (camelCase fields like `adArchiveID`) is UNVERIFIED byte-for-byte — run one live sample through each candidate actor and lock the TS interface from the actual JSON, not from the store-page prose.

---

## Verified 2026-10-01 (Phase 2b Task 12 — partial)

### DataForSEO — NOT verified (account blocked)

Every call was refused at the account level before any data was returned (no charge):

- **Production** (`api.dataforseo.com`): HTTP **403** with envelope `status_code: 40104`, `"Please verify your account before using the API. You can complete verification in the user panel: https://app.dataforseo.com/ ."` — the free `appendix/user_data` endpoint still answers (balance shows the $1 trial credit).
- **Sandbox** (`sandbox.dataforseo.com`): HTTP **403**, `40104` on the endpoints, and `appendix/user_data` reports task-level `40201` "We noticed some unusual activity in your DataForSEO account, so we've temporarily paused access as a precaution…".
- **Verified fact:** DataForSEO sends its normal JSON envelope (with the API `status_code`) on non-2xx HTTP responses. The client now includes that code/message in the `VendorError` message (`HTTP 403 from <path>: 40104 …`), and `dataforseo.live.test.ts` skips (with a warning) on account-level `40104`/`40201` instead of failing the suite.
- **Re-probe after the user activated the account (later 2026-10-01):** the 40104 is gone, but both sandbox and production now return HTTP 200 / envelope `20000` with a **task-level `40201`** ("temporarily paused access as a precaution… reach out to support@dataforseo.com") and `cost: 0`. The client already treats a non-2xx task status as a failure (`mapsSearch` throws; collectors record `vendor_error`), and the live test now also skips on a task-level 40104/40201.
- **`data.tag` is echoed** (verified on these 40201 task responses): each `tasks[]` item carries `data` = the posted task (`api`, `function`, `se`, `se_type`, plus every posted field including `tag` and `location_coordinate` as sent, e.g. `"33.749,-84.388,14z"`). Whether a *successful* task_post echoes it identically, and whether the `z` suffix is accepted (not just echoed), is still to be confirmed.
- Still **UNVERIFIED** until the account is verified: `location_coordinate` `"lat,lng,14z"` acceptance, whether `data.tag` is echoed on `task_post`, `review_id` presence/stability, reviews item keys carrying photos/reviewer identity, maps/GBP/ads/jobs item shapes, actual `cost` per call, and same-name employers in jobs results. See the roadmap's Phase 2b carry-over.

### Apify `curious_coder~facebook-ads-library-scraper` — verified live

One discovery run (keyword search URL, `count: 10`, `scrapeAdDetails: false`, `scrapePageAds.*` as in `fetchMetaAdsApify`): HTTP **201** from `run-sync-get-dataset-items`, body a raw JSON array of 10 items. Input schema accepted as-is. Cost: actor is pay-per-event, **$0.00075 per ad** + $0.00005 per run start (Apify account usage after the run: $0.0076).

- **Output is snake_case**, not the camelCase the store page suggested. Top-level keys: `ad_archive_id`, `ad_id` (null), `collation_id`, `collation_count`, `is_active`, `page_id`, `page_name`, `page_is_deleted`, `start_date`, `end_date`, `start_date_formatted`, `end_date_formatted`, `publisher_platform[]` (`FACEBOOK`, `INSTAGRAM`, `AUDIENCE_NETWORK`, `MESSENGER`), `categories[]`, `currency`, `spend`, `reach_estimate`, `impressions_with_index`, `total_active_time` (null for US commercial ads), `targeted_or_reached_countries`, `snapshot`, `url` (the input Ad Library URL), `ad_library_url` (`https://www.facebook.com/ads/library/?id=<ad_archive_id>` — the permalink), `total`, `position`, `ads_count`, plus `has_user_reported`, `report_count`, `menu_items`, `gated_type`, `fev_info`, `regional_regulation_data`, `hide_data_status`, `state_media_run_label`, `is_aaa_eligible`, `contains_digital_created_media`, `contains_sensitive_content`.
- **Ids are strings** (`"2400251623508286"`); `start_date`/`end_date` are **Unix seconds** (integers). For an active ad `end_date` is "now/today", not a real end — `normalizeMetaAd` only uses it when `is_active === false`.
- **`total`** on each item is the total number of ads matching the input URL (25,313 for the broad keyword search) — usable to compare against the returned count / the `count` cap.
- `snapshot` keys: `body.text`, `title`, `caption`, `cta_text`, `cta_type`, `display_format` (`IMAGE`, `VIDEO`, `DCO`, …), `link_url`, `link_description`, `images[]` (`original_image_url`, `resized_image_url`, `watermarked_resized_image_url`, `image_crops`), `videos[]`, `cards[]`, `page_id`, `page_name`, `page_profile_uri`, `page_profile_picture_url`, `page_categories`, `page_like_count`, `byline`, `disclaimer_label`, `extra_*`, `branded_content`, `is_reshared`, `root_reshared_post`, `event`, `country_iso_code`, `additional_info`, `ec_certificates`, `brazil_tax_id`.
- **DCO / carousel ads** keep their copy and media in `snapshot.cards[]` (each card: `body`, `title`, `caption`, `link_url`, `link_description`, `cta_text`, `original_image_url`, `resized_image_url`, `video_hd_url`, `video_sd_url`, `video_preview_image_url`, …) with empty `images`/`videos` and a templated `body.text` / `title` (`"{{product.brand}}"`, `"{{product.name}}"`). `normalizeMetaAd` now falls back to the first card's copy/link and collects card media, ignoring `{{…}}` templates.
- A brand-specific page pull (`view_all_page_id`) was **not** run: the DataForSEO block stopped the production spot check, so the 200-item cap / `truncated` behaviour and the active-count comparison against the public Ad Library page remain to be checked with the rest of Task 12.
- Fixture: `packages/collectors/test/fixtures/vendors/apify-meta-ad.json` (one IMAGE ad, one DCO ad; signed fbcdn query strings replaced with `REDACTED`), asserted by `src/vendors/fixtures.test.ts`.

### ScrapeCreators — verified 2026-10-01

`SCRAPECREATORS_API_KEY` configured; one live call via `fetchMetaAdsScrapeCreators` (`maxPages: 1`), same target as the Apify spot check: `GET /v1/facebook/adLibrary/company/ads?pageId=1825453601028298&country=US&status=ACTIVE`, page id `1825453601028298` (`Aire Serv of Granbury`).

- **HTTP 200.** Envelope keys: `success` (`true`), `credits_remaining` (7099), `credits_charged` (**1**, for the whole page regardless of item count), `results[]`, `searchResultsCount` (**21**), `cursor`. `searchResultsCount` is undocumented (not in the skeleton in §2c above) but present on this call.
- **21 active ads returned — exactly matching Apify's 21** for the same page (3 DCO + 18 IMAGE, same split as the Apify spot check above). One page was enough; the second page allowed by the task budget was not needed.
- **Item shape is identical to Apify's**, not the `images: ["..."]` array-of-strings shown in the docs skeleton: top-level and `snapshot` keys are the same snake_case set (`ad_archive_id`, `page_id`, `is_active`, `start_date`/`end_date` as Unix seconds, `publisher_platform[]`, `snapshot.body.text`, `snapshot.display_format`, `snapshot.images[]` as objects with `original_image_url`/`resized_image_url`, `snapshot.cards[]` for DCO ads with the same per-card fields as Apify). One difference: each item also carries `start_date_string`/`end_date_string` (ISO 8601, e.g. `"2026-07-17T07:00:00.000Z"`) alongside the Unix-seconds fields — not present on the Apify fixture, not currently read by `normalizeMetaAd` (the Unix fields are sufficient).
- Unlike the Apify DCO example (templated `"{{product.brand}}"` top-level body), **this vendor's DCO items carried real, non-templated text in the top-level `snapshot.body`/`title`** (matching the first card) — so the `{{…}}`-template fallback path in `normalizeMetaAd` wasn't exercised by this pull, only the plain-text path. The cards fallback is still exercised and still correct when a template *is* present (per the Apify fixture).
- **All 21 items normalize cleanly with `normalizeMetaAd`** — externalId, advertiserId, format, text, mediaUrls, landingUrl, publisherPlatforms, startedAt/isActive all populated and sensible. **No normaliser changes were needed.**
- **Bug found and fixed in the client, not the normaliser:** on the terminal page the vendor sends `"cursor": ""` (an empty string), not `null`/absent as the docs skeleton implies. `fetchMetaAdsScrapeCreators` was coalescing with `??`, which only replaces `null`/`undefined`, so `cursor` stayed `""` and the final `truncated: cursor !== null` check came out `true` on a *complete* response. Fixed to `cursor = body.cursor || null` so an empty string is treated the same as no cursor; `truncated` is now correctly `false` for this call. Locked by a new test in `scrapecreators.test.ts` asserting an empty-string cursor page yields `truncated: false`.
- **Credits:** 1 credit charged for the single-page pull (21 items), `credits_remaining` 7099 beforehand on the account. Credits are charged per page/request, not per item.
- Fixture: `packages/collectors/test/fixtures/vendors/scrapecreators-meta-ads.json` (envelope + 3 items — 1 DCO, 2 IMAGE; signed `fbcdn.net` CDN query strings replaced with `?REDACTED`), asserted by `src/vendors/fixtures.test.ts`.

### DataForSEO — verified live (2026-10-01, after the account was activated and funded)

Sandbox pass (free; mock data, real shapes): maps live, my_business_info live, reviews task_post → tasks_ready → task_get, ads_search live, jobs task_post → tasks_ready → task_get/advanced — all `20000`/`20100`. Production spot check on **Aire Serv** (national HVAC franchise; place `Aire Serv of Central Texas`, `place_id ChIJ6VlKPHqPT4YR479jLd01gZY`, cid `10845008601750421475`, domain `aireserv.com`) via one maps search plus `collect-once --vendors` and `--poll`.

- **`location_coordinate` `"lat,lng,zoomz"` is accepted** in production and sandbox (`"31.549,-97.146,12z"`); the sandbox also accepts it without the `z`. `mapsSearch` is unchanged.
- **`data.tag` is echoed** on `task_post` responses (`tasks[].data` = the posted task plus `api`/`function`/`se`/`se_type`; task_get adds `device`/`os` defaults) and again on `task_get`; `tasks_ready` entries carry `id`, `se`, `se_type`, `date_posted`, `tag`, `endpoint`. Task-to-competitor mapping by tag works (the production reviews/jobs tasks came back tagged with the competitor id).
- **Costs (envelope `cost`, = ledger):** maps live **$0.002** (depth 10); my_business_info live **$0.0054**; ads_search live **$0.002** (depth 40); reviews task_post depth 700 **$0.0525** (= 70 × $0.00075, quoted on the requested depth; only 546 reviews existed, and the account balance moved by less than the ledger sum, so the final charge may follow the returned count); jobs task_post depth 20 **$0.0012** (2 pages × $0.0006). `tasks_ready` is $0. **`task_get` echoes the task's cost in its envelope but is not billed** (account balance unchanged across a repeat task_get) — the client now ledgers GET calls at $0 so post + get are not double-counted.
- **Account-level pause** shows as HTTP 200 / envelope `20000` with task-level `40201` and `cost: 0` (seen before the account was cleared).

**Maps item** (`maps_search`): matches §1a. `work_hours` = `{ timetable: { monday: [{ open: {hour, minute}, close: {hour, minute} }], … }, current_status }`; `rating_distribution` keys are strings `"1"`…`"5"`; `address_info` = `{ borough, address, city, zip, region, country_code }`.

**my_business_info item** (`google_business_info`): keys `type, rank_group, rank_absolute, position, title, original_title, description, category, category_ids, additional_categories, cid, feature_id, address, address_info, place_id, phone, url, contact_url, contributor_url, book_online_url, domain, logo, main_image, total_photos, snippet, latitude, longitude, is_claimed, questions_and_answers_count, attributes, place_topics, rating, hotel_rating, price_level, rating_distribution, people_also_search, work_time, popular_times, local_business_links, is_directory_item, directory, services`. **There is no top-level `current_status`**: it is `work_time.work_hours.current_status` (`"open"`/`"close"`) — `extractGbpProfile` now reads it from there. `attributes` = `{ available_attributes: { <group>: [<attr>…] }, unavailable_attributes }`; `services[]` = `{ category, title, snippet, price }`; `popular_times` can be null. No `reviews_count` (use `rating.votes_count`).

**ads_search item**: exactly §1d plus `preview_url` (null). `first_shown`/`last_shown` use the `"yyyy-mm-dd hh:mm:ss +00:00"` format; result-level `se_results_count` (900 for aireserv.com) vs `items_count` 40. **`target: <domain>` returns every advertiser whose ads point at that domain** (20 advertiser names among 40 creatives: franchisees, sister brands, agencies, a few individuals' verified-advertiser names), not just the brand.

**Reviews** (task_post depth 700 → 546 items = the place's full `reviews_count`; ready within ~10 minutes on the standard queue). Item keys: `type, rank_group, rank_absolute, position, xpath, review_text, original_review_text, original_language, time_ago, timestamp, rating, reviews_count, photos_count, local_guide, profile_name, profile_url, review_url, profile_image_url, owner_answer, original_owner_answer, owner_time_ago, owner_timestamp, review_id, images, review_highlights`.
- **`review_id` present on 546/546 items, all unique** (opaque base64-like string). Stability across pulls still to be checked a week later (roadmap carry-over).
- `review_text` null on 138 items (rating-only); `owner_answer` on 432; `original_*` all null for this English place.
- **Reviewer-identifying data found:** `profile_name`; `profile_url` (`/maps/contrib/<contributor id>/…` on every item); `profile_image_url`; item-level `reviews_count`, `photos_count`, `local_guide` (the *reviewer's* own activity — a fingerprint); `images[]` (`{ type: "images_element", alt, url: null, image_url }`, reviewer-uploaded photos, on 6 items; `null` otherwise); and **the reviewer's first name inside `owner_answer` on 311 of 432 replies** ("Thank you, Mike!"), the full name on 2. `review_url` (`/maps/reviews/data=…`) carries no contributor id and is kept. `review_highlights[]` = `{ feature, assessment }` (business data).
- The scrubber now drops all of those keys on review items (keeping the result-level `reviews_count`) and replaces the reviewer's own name words in `*_text`/`*_answer` with `[name]`; `parseReviewItem` applies the same name redaction to stored review text and owner replies. On the real payload: 0 reviewer names left in stored evidence or review rows in their own review. **Not caught:** a reviewer naming themselves differently from their profile (e.g. signing a review with a full name), or an owner using a nickname — free text is only scrubbed of the profile name's words.

**Jobs** (task_post depth 20 → 5 items, ready by the first poll): keys exactly §1e. No `description` field in the advanced JSON. `location` was `"United States"` on all 5 items (no city/state), `timestamp` often null, `salary` free text (`"60K–80K a year"`). Employers included `Aire Serv` and franchisees `Aire Serv of Woodstock`, `… of East Central Minnesota`, `… of the Sioux Empire` — the known same-name/other-states limitation, confirmed.

**Apify page pull:** the brand page id (`100783472531475`, from a third-party listing) returned **one error item** `{"error":"Ads not found","errorCode":"ADS_NOT_FOUND","url":…}` (HTTP 201) — the national page runs no US ads; the brand advertises from franchisee pages (a keyword search showed ads from `Aire Serv of <city>` pages only). The old code counted that error item as a 1-item response (which would allow deactivating every stored ad); `fetchMetaAdsApify` now treats `ADS_NOT_FOUND` as an empty result and any other error item as a non-retryable `VendorError`. Re-pointed at the franchisee page `Aire Serv of Granbury` (`1825453601028298`): **21 ads, `total` = 21 on every item, so the response was complete** (well under the 200 cap, `truncated: false`); 3 DCO + 18 IMAGE; all `is_active`. The public Ad Library page is script-rendered and was not compared directly; the actor's `total` is the Ad Library's own count for the query.

---

## Verified 2026-10-01 — engine models

Live contract test: `packages/engine/src/engine.live.test.ts` (`pnpm --filter @cs/engine test src/engine.live.test.ts`), run against real OpenRouter (and Jev via `TYPESAFE_API_KEY`) using the repo-root `.env` keys. Cost ≈ $0.001. Both tests passed.

**OpenRouter embeddings endpoint — confirmed shape:**
```
POST https://openrouter.ai/api/v1/embeddings
```
Request body: `model`, `input[]` (string array), `dimensions`, `provider: { data_collection, zdr }`.
Response: `data[{ index, embedding }]`, `usage: { prompt_tokens, cost }`.

- `openai/text-embedding-3-small` at `dimensions: 512` **passes** the ZDR (zero-data-retention) policy — this is the model configured for the `embeddings` task in `packages/ai/config/ai.yaml`.
- `voyageai/voyage-4-lite` does **not** pass ZDR — rejected, not usable for this pipeline.

**Measured cosines (this run, `text-embedding-3-small` @ 512):**
- Punctuation-only edit ("$89." vs "$89!"): **0.996**
- "$89 → $69" price edit: **0.969**
- Unrelated sentence (service-area change vs AC tune-up copy): **0.202**

These match the calibration already recorded in `constraints.md` (0.996 / 0.969 / 0.20), confirming the model is stable run-to-run. Both are comfortably above `SEMANTIC_THRESHOLD = 0.95`; the price edit is caught by cosine alone here, though per spec the numeric rule layer is the one actually relied on for money changes (money is never masked regardless of cosine).

**Decision providers and confidences (this run):** tagging a real "$89 → $69" AC tune-up price cut through `ai.decide('decisions', …)` resolved via the confidence cascade as:
- `meaningful`: provider `llm`, confidence `0.84`
- `change_type`: provider `jev`, confidence `1.00` → `price_change`
- `service_hvac_plumbing`: provider `jev`, confidence `1.00` → `ac_tune_up`

Result: `meaningful = true`, `type = price_change`, `services.hvac_plumbing = ac_tune_up`, `needsReview = []`. (Jev — the `TYPESAFE_API_KEY` deterministic/low-cost decision path — handled `change_type` and the service mapping with full confidence; the `meaningful` noul question fell through the cascade to the LLM at confidence 0.84. Since the change carries a money fact, `resolveTag`'s money-forces-meaningful rule would have made the result `meaningful = true` regardless of what either provider answered.)

**pgvector:** version **0.8.6** on Neon (the `vector(512)` columns used for `capture_block.embedding`).

---

## Verified 2026-10-02 — Phase 3b

Live structured-source pass against Aire Serv (vendors only, `collect-once --vendors`, no web crawl): `--domain aireserv.com --place-id ChIJ6VlKPHqPT4YR479jLd01gZY --meta-page-id 1825453601028298` with 3 Google advertiser ids pinned (found via `SELECT advertiser_id, count(*) FROM ad a JOIN competitor c ON c.id=a.competitor_id WHERE c.domain='aireserv.com' AND a.platform='google' GROUP BY 1 ORDER BY 2 DESC` against the 2026-10-01 baseline — top 3: `AR11447192921745391617` (7), `AR16031097081657556993` (2), `AR09867956064303972353` (2)).

**`ads_search` with `advertiser_ids` — request shape, depth, cost, items vs the old domain query:**
- Request: `{ advertiser_ids: [<id1>, <id2>, <id3>], location_code: <US>, depth: 120 }` (`collectGoogleAds`'s `PINNED_DEPTH`) in place of `{ target: 'aireserv.com', location_code: <US>, depth: 40 }`.
- **Depth 120 was accepted.** Cost (envelope `cost`, ledgered) **$0.006** — exactly 3× the $0.002 charged for a single depth-40 domain query on 2026-10-01, confirming cost scales linearly with requested depth regardless of advertiser count.
- **Result: 106 creatives returned, 0 dropped** (every item's `advertiser_id` was one of the 3 pinned ids, so the post-filter in `collectGoogleAds` had nothing to drop). This replaces the old domain-query behaviour, where `target: 'aireserv.com'` at depth 40 returned 40 creatives across 20 different advertisers (franchisees, sister brands, agencies) and the collector kept only the ones whose advertiser *name* matched "Aire Serv" by whole-word match, dropping the rest. Pinning by `advertiser_ids` removes the name-matching heuristic entirely and surfaces roughly 2.5× more of this competitor's own creatives (106 vs the ≤ 40 a name-filtered domain query could ever see) because it isn't capped by the domain query's depth-40 slice through *every* advertiser.
- `ads: 0 dropped: 0 ended: 0` — the "ended by our own `last_seen_at`" sweep (21-day unseen window) found nothing past its threshold on this first pinned pull, as expected for an existing, still-active ad set.

**Per-page Meta capture:** `ads_meta → {"status":"ok","ads":21,"deactivated":0,"pages":[{"pageId":"1825453601028298","status":"ok","ads":21,"deactivated":0,"vendor":"apify"}]}` — one capture per page (today just the one pinned page, `Aire Serv of Granbury`), each page's result keyed by `pageId` under `pages[]` rather than a single flat count; matches the Apify count from the 2026-10-01 spot check (21 ads, same page) and confirms the per-page code path (Phase 3b Task 4) collects and could independently fail per page without affecting a sibling page's ads.

**GBP capture:** `gbp → {"status":"ok","captureId":"c0385d9f-e167-4e32-a9d1-9f6283b4482f"}` — one `my_business_info` live call, cost $0.0054 (matches the 2026-10-01 rate).

**Reviews/jobs:** posted async as before — `jobs/task_post` depth 20, cost $0.0012. **`reviews/task_post` depth was 100, not 700** (cost $0.0075 = 10 × $0.00075): `postReviewTasks` requests `depth: c.backfill ? 700 : 100` (`packages/collectors/src/reviews/post.ts`) and this competitor already had its 24-month backfill from 2026-10-01, so this routine (non-backfill) pull correctly asked for only the newest ~100, `sort_by: 'newest'` — the 700-depth backfill request is onboarding-only. **Confirmed live:** `collect-once --poll`, run ~12 minutes after posting (the earlier "~45 minutes" estimate was conservative — both tasks were already in `tasks_ready` well before that), returned `{"reviews":{"collected":1,"failed":0,"reviews":100},"jobs":{"collected":1,"failed":0,"postings":5}}`. The 100 reviews returned were all **already-known** `review_id`s (stored review count stayed at 546, matching the 2026-10-01 baseline exactly) with **0 edits detected** (`review_revision` stayed at 0 rows) — expected over a 13-hour gap between pulls, and the edited-reviews mechanism (Task 5) ran against a real payload without erroring. The jobs poll returned the same 5 postings as 2026-10-01 (same employers, same `Aire Serv`/franchisee split) — no set change, so the jobs differ correctly produced no event.

**Total vendor spend this pass:** DataForSEO $0.0054 (GBP) + $0.006 (ads_search, pinned) + $0.0075 (reviews post) + $0.0012 (jobs post) = **$0.0201** for the posted/live calls (`task_get` calls during polling are ledgered at $0, per the 2026-10-01 finding); Apify ≈ **$0.0158** (21 ads × $0.00075 + $0.00005 run start) — **≈ $0.036 total** vendor-call cost, no rank scans run (per the brief, the rank differ is covered by tests, not live). Engine model spend for the first `engine-once` pass (ads/GBP only, before the poll) was negligible: one `embeddings` call at $0.00000042 and no `decisions` call — this competitor has no client tracking it yet (`client_competitor` has 0 rows for it), so structured tagging's "ask one service question per vertical of the tracking clients" step had no clients to ask (the Task 10 "no offer question when no tracking client" deferred behaviour, observed live rather than just in tests) and `ad_started`'s type is fixed, needing no `change_type` decide call.

**Observed structured-diff output** (`engine-once --competitor e9f9cbd3-8834-43a4-a1af-a31224ca43d3 --moves`, run ≥ 10 minutes after the ads/GBP/Meta captures):

```
{"diffs":9,"changes":1,"tagged":1,"events":1,"scored":0,"rankDiffs":0,"errors":0}
2026-10-02 ad_started          1 new Google ad: "12 Star Service, LLC DBA: Aire Serv of Iowa City"  [unscored]
```

9 subjects were diffed (GBP, Google ads, Meta ads plus leftover web-diff subjects already queued in `cs_dev`); only the Google-ads capture produced a real structured change — one new creative from a franchisee (`12 Star Service, LLC DBA: Aire Serv of Iowa City`), correctly grouped as **one** `ad_started` change (not 106 — the other 105 creatives in this capture were already known from 2026-10-01, so the set-difference differ found exactly the one genuinely new ad). It tagged cleanly to one `event` with `changeType: ad_started`, `channels: ['google_ads']`, `agencyId: null`, `clientId: null` (global, as expected — `rank_change` is the only tenant-private type). `scored: 0` because no client tracks `aireserv.com` in `cs_dev` (`client_competitor` has 0 rows) — this is correct behaviour, not a bug: the scoring stage only scores events for clients linked to the competitor. `--moves` printed no `[moves]`/move lines for the same reason (`listMoveClients`/the per-competitor client lookup returned nothing to evaluate, and `move` has 0 rows for this competitor). GBP and Meta ads produced no changes (both captures were identical to their 2026-10-01 baseline — no field/creative changes in the 13-hour window).

A second `engine-once --competitor … --moves` run (≥ 10 minutes after the `--poll` captures) picked up the reviews and jobs captures: `{"diffs":2,"changes":0,"tagged":0,"events":0,"scored":0,"rankDiffs":0,"errors":0}`. Both structured differs ran cleanly against a real vendor payload with **zero errors** and correctly produced **zero changes** — 546 already-known reviews with 0 edits and 5 unchanged job postings are, by design, not news (removed/edited-without-threshold job postings are explicitly "not events" per this plan's decision 5, and review velocity only fires on a z-score spike). This is the correct output for an unchanged set, not a gap in coverage.

**Spend this live pass, end to end:** ≈ $0.036 in vendor calls (DataForSEO + Apify) plus ≈ $0.0000004 in embeddings — well within the brief's "small spend" budget; no rank scans were run live (the rank differ's tenant-isolation and delta-threshold behaviour is covered by `packages/engine/src/structured/rank.test.ts` instead, at $0 live cost).

**What was and wasn't verified live:** verified — advertiser-id pinning end to end (request shape, depth 120 acceptance, cost, 0-dropped result), per-page Meta capture isolation, the ad-started structured diff grouping multiple new creatives into one change (trivially, with exactly one new ad), the reviews depth (backfill vs routine) behaviour, the 10-minute settle delay (the second `engine-once` run, not the first, is what picked up the reviews/jobs captures), the reviews/jobs/GBP/Meta "no change" paths against real vendor payloads with zero errors, global event `channels`, and the "no client → no score/no moves" paths. **Not verified live** (no real change occurred in the 13-hour window to exercise it): `ad_stopped`, GBP field changes, a genuine review-velocity spike, a rating change, a rank delta, cross-channel merge, and any of the seven move rules actually opening/transitioning a move — all of these are covered by `packages/engine/src/structured/*.test.ts`, `packages/engine/src/merge/merge.test.ts` and `packages/engine/src/moves/*.test.ts` with synthetic fixtures instead.

## Verified 2026-10-02 — Phase 3c

### `compromise` NER (model-privacy.ts), version 14.17.0

`packages/collectors/src/evidence/model-privacy.test.ts` (6 tests, all pass) is the Task 1 sample set run against the real installed library (no mocking — `compromise` is pure offline JS, so unit tests already are the live check). Catches, correctly, with zero false positives against the tested business names and service vocabulary:
- Bare first names repeated in the same text ("Mike … Thanks Mike!").
- A titled full name ("Dr. Patel") redacted as one unit — the bare title alone ("Dr.") is never redacted by itself.
- A name following an occupational cue ("her hygienist Jessica", "my daughter Emma").
- A first+last name introduced by "named" ("Tech named Carlos Ramirez"), redacted as the whole two-word span, not split.
- Correctly leaves alone: every word of two tested business names ("Smith HVAC", "Hope and Faith Dental") even where a name shares a word with the business ("Mike" in a sentence that also redacts "Mike" the person — the business-name protection is phrase-span based, not word based, per the Task 1 ruling); text with no capital letters at all (fast-path skip, no `compromise` call).
- No misses found against this sample set — no additional custom rule was needed beyond the library's own tagger (contrast the brief's "add the missed pattern as a rule" contingency, which wasn't triggered).

### `engine.live.test.ts` — review and price decisions (added Task 12)

Run: `pnpm --filter @cs/engine exec vitest run src/engine.live.test.ts` (4 tests, all pass, ≈ $0.0003 this run). Extends the 2026-10-01 "engine models" live contract test with the two Phase 3c decision tasks:

**Review decisions** — a redacted hidden-fee complaint ("Quoted $150 on the phone but the bill was $400 with fees nobody mentioned. Thanks Mike for being polite, I guess.", `redactForModel`'d with `businessNames: ['Smith HVAC']` first — the state sent to the model never contained "Mike") resolved through `ai.decide('review_decisions', …)`:
- `sentiment`: provider `jev`, confidence `0.85` → very negative (level 0).
- `theme_hvac_plumbing__price_transparency`: provider `jev`, confidence `0.94` → yes.
- `theme_hvac_plumbing__response_time`: `jev:0.94`; `__upsell_pressure`: `jev:0.88`; `__scheduling`: `jev:0.92`; `__fix_quality`: `jev:0.92`; `__cleanliness`: `jev:0.96` (all answered yes/no by Jev alone, within the 0.85 task threshold).
- Two questions escalated past Jev to the LLM provider (expected cascade behaviour, spec §7.1): `theme_hvac_plumbing__technician_professionalism` (`llm:0.70`) and `theme_hvac_plumbing__communication` (`llm:0.50`), plus `other_hvac_plumbing` (`llm:0.80`).
- Resolved row: `themes: ["price_transparency"]`, `sentiment: 0` (very negative) — matches the complaint.

**Price decisions** — `AC tune-up starting at $89 per system'` through `ai.decide('price_decisions', …)` resolved `service_hvac_plumbing` to `ac_tune_up` at confidence `1.00`, provider `jev` (probability mass 1.0 on `ac_tune_up`, 0 on every other service option).

### Live run against `cs_dev` (Task 12 Step 3)

`cs_dev` migrated to `0024` (`pnpm db:migrate`). **Finding:** `cs_dev` had no `agency`/`client` rows at all (not merely a client missing `place_id`, as the controller's Ruling R2 anticipated) — the existing `aireserv.com` competitor (546 reviews collected 2026-10-01/02) was tracked by no client. A minimal verification agency/client (`CS Dev Verification Agency` / `CS Dev Verification Client`, `vertical_id: hvac_plumbing`, `place_id` left **unset** — never invented) was created and linked to the existing competitor via `client_competitor`, so the Jev-only live sweep below would have real tracked data to analyse; no web crawl and no vendor collection were run (no `collect-once` call this session).

**Budget check before running:** `SELECT count(*) FROM review WHERE text IS NOT NULL AND length(btrim(text)) >= 10 AND posted_at >= now() - interval '180 days'` → **43** reviews (well under the 400-review `--rounds` cap threshold; ran with the brief's suggested `--rounds 20`, which was never exhausted — all 43 cleared in round 1 of `findEngineWork`'s default 100-row limit).

Command: `pnpm --filter @cs/worker engine-once --competitor e9f9cbd3-8834-43a4-a1af-a31224ca43d3 --insights --client <verification-client-id> --rounds 20`

```
{"diffs":0,"changes":0,"tagged":0,"events":0,"scored":1,"rankDiffs":0,"reviews":43,"prices":0,"errors":0}
[insights] {"competitors":1,"spikes":0,"proposals":0,"errors":0}
[benchmark]   Aire Serv: 28 reviews, avg 4.86 (prev 27 / 4.96); Response time 9% (1), Technician professionalism 93% (1), Upsell pressure 5% (1), Scheduling & reliability 20% (1), Fix quality 33% (1), Communication 56% (1)
[prices] Aire Serv: no prices yet
```

- **43 reviews analysed, 0 errors.** `scored: 1` is a side effect of newly linking the client — it retro-scored one pre-existing `ad_started` event (from the 2026-10-02 Phase 3b pass) now that a client tracks the competitor, unrelated to reviews/prices.
- **Insights:** 0 complaint-theme spikes, 0 theme proposals this pass (expected — 43 reviews is below the ≥ 20-unthemed-in-90-days theme-discovery trigger for any one theme, and no theme crossed the spike thresholds).
- **Benchmark (aggregate shares only — no review text or reviewer identity printed or recorded anywhere in this doc):** Aire Serv shows 28 reviews analysed in the current 90-day window (27 in the previous), avg rating 4.86 (prev 4.96); six themes had at least one mention, from "Upsell pressure" 5% up to "Technician professionalism" 93%. No self-business row (the verification client has no `place_id`, so `client.self_competitor_id` is unset) — self-benchmarking remains unverified live (carried forward in the roadmap's "Phase 3c carry-over").
- **Prices:** 0 — `cs_dev` has no `web`-source captures for `aireserv.com` (only vendor collection has ever been run against it, per the crawler-ban rule), so `price_extract` found no work. Price normalisation is live-verified only by its own test suite this session, not against a real web capture.
- **Spend** (`SELECT task, provider, count(*), sum(cost_usd) FROM llm_call WHERE created_at > now() - interval '1 hour' GROUP BY 1, 2`): `review_decisions` (provider `jev`) × 43 calls = **$0.001228**; the Jev→LLM cascade's `llm_decisions` escalation (provider `llm`) × 43 calls = **$0.057435** (at least one of each review's per-theme/sentiment questions fell through to the LLM on every review). **Total ≈ $0.0587** — comfortably under the brief's "well under $1" budget.

