# Phase 18c-2 — Listing pages, Check now, scorecard, fix guidance (design)

**Date:** 2026-11-10 · **Branch:** `phase-18c` (stacked on 18c-1) · **Brief:** `docs/work/phase-18c.md`
Builds on `2026-11-10-phase-18c-citations-design.md` (C1–C12). Core spec §1.5, §2.2, §4.3, §6.2, §8.2, §10.5. New decisions only.

## Intent
Owner: find the client's **missing or incorrect** citations. 18c-1 only sees Google's title/snippet, so the address is
"not checked" and a wrong phone is caught only when the snippet shows one. 18c-2 opens the client's own listing pages
and reads name, address and phone; lets the agency re-check on demand; adds a scorecard row; and tells the client how to fix each problem.

**Anti-goals:** no mismatch without a stored page capture; never guess an address from free text; no crawling a host whose
robots.txt says no; no bot-wall evasion; no new vendor or paid calls; rivals' listing pages are never opened.

## Decisions
| # | Decision |
|---|---|
| D1 | **Self only.** Page checks run for the client's own business (`client.self_competitor_id`) rows with `status='listed'`, `in_catalogue=true`. Rivals keep the 18c-1 search check (their NAP accuracy is not actionable for the client; keeps crawl load ≤ 15 pages/client/run). |
| D2 | **Ships dark.** Job `citation-page-check` idles (logs, returns) unless `WEB_MONITORING_ENABLED='true'`, same rule as `discover-schedule`. While off, the page keeps "Address: not checked". Staging needs listing hosts in `CRAWL_HOST_ALLOWLIST`. |
| D3 | **Fetch path** = the worker's polite renderer: `getRenderer().renderOrDefer(listingUrl)` (robots RFC 9309, ≥ 3 s/host, SSRF guard via renderer `assertUrl`). `deferred` → re-enqueue with `startAfter = retryInMs`. Off-site redirect / robots-disallowed redirect → page status as the renderer reports. |
| D4 | **Evidence.** Every read (any status) stores a capture: `text` + `html` evidence, `capture.source='directory_page'`, no `tracked_page_id`, collector version `directory-page/1`. New recorder `recordListingPageCapture` (mirrors `recordVendorCapture` key layout `evidence/<competitorId>/<captureId>/…`, hash-first). A mismatch row must carry this capture id. |
| D5 | **Parsing order (deterministic, no LLM):** (1) JSON-LD objects whose `@type` includes `LocalBusiness` or a subtype, or `Organization`, with `name` / `telephone` / `address` (`PostalAddress`); pick the object whose name hits the business (`nameHit`) else the only one; (2) microdata `itemprop="telephone"` / `streetAddress`/`postalCode`; (3) phone only: `tel:` links, then `usPhones(text)` limited to the first 4 KB after the first name hit. **Address only from (1) or (2)** — never from free text. Nothing read → field is `null` (unknown). |
| D6 | **Address compare.** Normalise both sides: lowercase, strip punctuation, USPS suffixes (street→st, avenue→ave, road→rd, drive→dr, boulevard→blvd, lane→ln, court→ct, place→pl, parkway→pkwy, highway→hwy, suite/ste/#/unit/apt dropped with what follows), directions (north→n …). **Match** = same 5-digit ZIP **and** same street number **and** same street-name tokens. **Mismatch** only when both sides have number + street + ZIP and they differ. Anything partial → `null`. Client side = `client.address` (`line1`, `postalCode`); no client address (service-area) → `null` and "Address: hidden on your Google profile". |
| D7 | **Phone compare** = `phone10` equality against `client.phone`. Different phone → `page_shown_phone` (digits), copy "Shows a different phone" (C-rule: a tracking number is never called wrong). Toll-free-only page phone → `null`. |
| D8 | **Name compare** = `nameHit(pageName, biz.name)`; page without a structured name → `null` (we don't re-judge the title). |
| D9 | **Page result wins** for display, recommendation and self-rule when `page_status='ok'`; otherwise the 18c-1 search fields stand. A search audit that changes `listing_url` (or flips the row to `not_found`) clears all `page_*` columns. |
| D10 | **When.** `citation-audit-client` enqueues one `citation-page-check` per eligible self row after its run commits (setup, monthly, manual). Singleton key `citation-page:<competitorId>:<host>:<runId>`. No separate cron. |
| D11 | **Check listings now.** Tool `request_citation_audit` (write, channel `web` only, agency roles only, `runTool`). Limits: ≤ 1 manual run per client per 7 days, ≤ 10 per agency per UTC day, counted from `citation_audit_run` `trigger='manual'` and `status <> 'failed'`. Also refused while a run is `running`, when `clientWorkAllowed` says no (`spend_paused`), when vendors aren't configured or the client has no self and no rivals (`not_ready`). Manual run re-searches the self business always; rivals follow `CITATION_REUSE_DAYS` (cost ≤ $0.20 cap unchanged). Concurrency = agency-row `FOR UPDATE` + existing `citation_audit_run_one_live` index, enqueue after commit, delete row if enqueue fails (mirror `requestRankScan`). |
| D12 | **Scorecard row** `listings` — header "Directory listings", value = count of `in_catalogue` `listed` rows for that business; `null` when the business was never audited. Email short label "Listings". Old scorecards parse it as `null`. No new evidence (count over citation rows, like `googlePosts30d`). |
| D13 | **Fix guidance.** Pack directory entries gain optional `claim_url` (owner sign-in / claim page). Rows: `not_found` → "Add listing" (`add_listing_url`, unchanged); any mismatch (name, phone or address `false`) → "Fix on {label}" (`claim_url ?? add_listing_url`) plus one how-to line from `help/copy/listing-fixes.ts` keyed by host, generic fallback. The `fix_citations` recommendation and `citationGapFinding` say "Correct your listing on …" for mismatch-only hosts (fixes the 18c-1 "Add your business to …" wording). |
| D14 | **Recommendation + self-rule** count `address_match=false` as a mismatch (`field: 'address'`, weight as phone). No new event type, no alert, no brief line (self data is not a rival change). |
| D15 | **Ask/MCP.** `get_citation_audit` adds per listing `addressMatch`, `pageStatus`, `pageCheckedAt`, `pageEvidenceId`; `directories[].fixUrl`. `shownAddress` and page `shownPhone` are web-only (same `forChannel` rule as 18c-1 `shownPhone`). |
| D16 | **UI states** (Listings page, self rows): `ok` → name/address/phone lines from the page with "Checked on the listing page {date}"; `robots_disallowed` → "This site doesn't allow automated checks — checked from Google search only"; `blocked`/`timeout`/`error` → "Couldn't open the page — checked from Google search only"; never read (dark or pending) → 18c-1 lines + "Address: not checked". Check-now button + availability line beside the page header, agency viewers only. |

## Interfaces

### Migration 0108 (`0108_listing_pages.sql`)
```sql
ALTER TABLE citation_listing
  ADD COLUMN page_status text CHECK (page_status IN ('ok','blocked','timeout','error','robots_disallowed')),
  ADD COLUMN page_checked_at timestamptz,
  ADD COLUMN page_capture_id uuid REFERENCES capture(id) ON DELETE RESTRICT,
  ADD COLUMN page_name_match boolean,
  ADD COLUMN page_phone_match boolean,
  ADD COLUMN page_shown_phone text,
  ADD COLUMN address_match boolean,
  ADD COLUMN shown_address text;  -- page address as read, only when address_match = false
ALTER TABLE citation_audit_run DROP CONSTRAINT citation_audit_run_trigger_check,
  ADD CONSTRAINT citation_audit_run_trigger_check CHECK (trigger IN ('setup','monthly','manual'));
CREATE INDEX citation_audit_run_manual_idx ON citation_audit_run (agency_id, started_at) WHERE trigger = 'manual';
```
(Exact existing constraint name verified in Task 0.) RLS unchanged (global public table; service-role writes).

### Collectors (`packages/collectors/src/citations/`)
- `page.ts`: `readListingPage(html: string, biz: CitationBiz): ListingPageRead` →
  `{ name: string|null; phone10: string|null; address: { street: string; number: string; zip5: string }|null; rawAddress: string|null }`.
- `address.ts`: `normaliseStreet(s: string): { number: string; tokens: string[] }|null`; `compareAddress(a, b): boolean|null` (D6).
- `page-check.ts`: `checkListingPage(deps: { db; store; renderer: PoliteRenderer }, input: { competitorId; host; listingUrl; biz: CitationBiz & { address: ClientAddress|null } }): Promise<{ kind: 'done'; pageStatus } | { kind: 'deferred'; retryInMs }>` — captures (D4), compares (D5–D8), updates the row only if `listing_url` still equals `listingUrl`.
- `upsertCitationRows`: clears `page_*` when `listing_url` changes or status leaves `listed` (D9).

### Worker (`apps/worker/src/jobs/citations.ts`)
- Job `citation-page-check`, payload `{ clientId: uuid, competitorId: uuid, host: string, listingUrl: string }`, `SINGLE_SHOT_QUEUE`, idles when dark (D2), `clientWorkAllowed` re-checked, `client.status='active'`.
- `citation-audit-client` enqueues page checks after `diffCitations` (D10), spacing `i * 5` s (limiter does the real pacing).

### Tools
- `packages/tools/src/citation-audit.ts`: `citationAuditAvailability(db, client: { id; agencyId }, now): Promise<{ state: 'available'|'weekly_limit'|'agency_daily_limit'|'running'|'not_ready'|'spend_paused'; nextAvailableAt?: string }>`; `requestCitationAudit(deps, userId, c, now)`.
- `limits.ts`: `CITATION_MANUAL_PER_CLIENT_DAYS = 7`, `CITATION_MANUAL_PER_AGENCY_DAY = 10`.
- Tool `request_citation_audit` (input `{ clientId }`, output `{ runId } | refusal reason`); `get_citation_audit` gains `manual: { state; nextAvailableAt? }` (web only) + D15 fields. `ISOLATION_FIXTURES` entry for the new tool; out-of-scope client → `not_found`.

### Engine
- `ScorecardMetric` + `listings`; `buildScorecard` fills from citation rows; `scorecard-model.ts` header "Directory listings"; email map `{ short: 'Listings' }`; demo starting point value.
- `recommendForCitations` / `citationGapFinding`: effective match = page value when `page_status='ok'` (D9), address mismatch (D14), wording (D13).

### Verticals
- `Directory` gains `claim_url?: string`; pack versions bump (v8 backfill like 0107's v7) only if the pack loader requires it — Task 0 decides.

### Web
- `listings/listings-view.tsx`: D16 states, fix links (D13), `CheckListingsNowButton` (mirror `rankings/scan-now-button.tsx`, copy in `listings/check-copy.ts`), action `requestCitationAudit(clientId)` in `listings/actions.ts` (agency only, refusal copy by reason).
- `help/copy/listing-fixes.ts` (server-only): `LISTING_FIX: Record<string, string>` + `LISTING_FIX_FALLBACK`.
- Guides `client.listings.{client,agency}.md` updated (page check, Check now, fixes); glossary unchanged.

## Cost & load
No vendor cost for page checks. Per client run ≤ 15 page renders (catalogue max), ≥ 3 s per host; monthly + manual ≤ 2 runs/client/month in practice. Manual runs are ordinary audits ($0.008 self + reused rivals; $0.20 cap, credits, spend guard).

## Testing focus
Parser fixtures (JSON-LD LocalBusiness, nested `@graph`, microdata, phone-only, multiple businesses, no data); address normaliser table (suffixes, suite, directions, ZIP+4); page result overriding search; `listing_url` change clears page fields; dark mode idles; robots-disallowed / blocked states; manual limits (7 d client, 10/day agency, running, spend pause, not_ready) incl. concurrency; scorecard old-row parse; `forChannel` drops `shownAddress` off web.

## Open (Task 0 / owner)
1. **Live page probe** (free, ≤ 12 pages, RivalMondayBot UA, robots honoured) needs owner OK because `rivalmonday.app/bot` doesn't exist yet. Without it, the parser ships fixture-tested and is first verified on staging when monitoring is switched on.
2. `claim_url` values per directory: sourced in Task 0 (checked to resolve); missing → fallback to `add_listing_url`.

## Out / backlog
Rival listing pages; platform page for "Also found on" promotion; editing groups on reviewed verticals; own listing lines in the brief; address check for service-area businesses.
