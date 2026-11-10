# Phase 18c-2 — Check listings now, scorecard row, fix guidance (design)

**Date:** 2026-11-10 · **Branch:** `phase-18c` (stacked on 18c-1) · **Brief:** `docs/work/phase-18c.md`
Builds on `2026-11-10-phase-18c-citations-design.md` (C1–C12). Core spec §1.5, §2.2, §8.2, §10.5. New decisions only.

## Intent
Owner: find the client's **missing or incorrect** citations and help fix them. 18c-2 lets the agency re-check listings on demand,
puts listings on the scorecard, and tells the client exactly where and how to fix each problem.

**Anti-goals:** no claim without evidence (unchanged from 18c-1); no new vendor; no bot-wall evasion; no address claims.

## Why there is no address / listing-page check (Task 0 evidence, 2026-11-10)
- **Listing pages (owner-OK'd live probe, 10 pages, `RivalMondayBot`, robots honoured):** Angi, BBB, Yellow Pages, Manta and
  ADA Find-a-Dentist answer 403 (bot wall); Facebook and MapQuest disallow in robots.txt; Foursquare redirects to its app;
  Porch has no structured data; HomeAdvisor and Thumbtack give name + city/ZIP only; **only Houzz** gives street + phone. → 1/12.
- **Google snippets ($0.026, 7 searches):** the business's own street address appeared once (MapQuest); list-page snippets
  carry *other* businesses' addresses (false-mismatch risk). Phone in BBB snippets is reliable (18c-1 already uses it).
- **Paid providers** (BrightLocal, Whitespark: quote-only, ~$30–80/location/month; Yext/Semrush/Uberall: management platforms)
  break "no new paid vendors" and cost near the seat price; proxy scrapers are evasion. → backlog (management, address check).

## Decisions
| # | Decision |
|---|---|
| D1 | **Check listings now.** Tool `request_citation_audit` (write, channel `web` only, agency roles only, via `runTool`). Limits: ≤ 1 manual run per client per 7 days, ≤ 10 per agency per UTC day, counted from `citation_audit_run` rows with `trigger='manual'` and `status <> 'failed'`. Refused while a run is `running`, when `clientWorkAllowed` says no (`spend_paused`), or when vendors aren't configured / the client has no self and no rivals (`not_ready`). Concurrency: agency row `FOR UPDATE` + existing `citation_audit_run_one_live` index; enqueue `citation-audit-client` after commit; delete the run row if the enqueue fails (mirror `requestRankScan`). |
| D2 | **Manual run behaviour.** `trigger='manual'`: the self business is always re-searched; rivals follow `CITATION_REUSE_DAYS` (25). Same $0.20 cap, spend guard, credits, diff and recommendation as a monthly run. A manual run resets the monthly clock like any run. |
| D3 | **Scorecard row** `listings` — header "Directory listings", value = count of `in_catalogue` `listed` rows for that business; `null` when never audited. Email short label "Listings". Old stored scorecards parse it as `null` ("—"). |
| D4 | **Fix links.** Pack directory entries gain optional `claim_url` (owner sign-in / claim page, `https`). `not_found` rows → "Add listing" (`add_listing_url`, unchanged). Rows with `name_match=false` or `phone_match=false` → "Fix on {label}" (`claim_url ?? add_listing_url`) plus one how-to line from `apps/web/src/help/copy/listing-fixes.ts` (server-only), keyed by host, generic fallback. |
| D5 | **Wording.** Pack v8 changes the `fix_citations` play to one text for missing and mismatched hosts: title "Fix your directory listings", template "Add or correct your listings on {{directories}} (links on the Listings page), with the same name and phone as your Google profile." Fixes the 18c-1 "Add your business to …" wording for mismatch-only findings. Owner signs in copy review. |
| D6 | **Ask/MCP.** `get_citation_audit` adds `directories[].fixUrl` (all channels) and top-level `manual: { state; nextAvailableAt? }` (web only, dropped by `forChannel`). Tool **description unchanged** (it is part of every ask cassette key). |
| D7 | **UI.** Listings page header area: `CheckListingsNowButton` + availability line (viewer tz), agency viewers only; client viewers see neither. Fix link + how-to under each mismatch row of the client's own business only; rivals' rows never show fix links. |

## Interfaces

### Migration 0108 (`0108_listing_fixes.sql`)
```sql
ALTER TABLE citation_audit_run DROP CONSTRAINT citation_audit_run_trigger_check;
ALTER TABLE citation_audit_run ADD CONSTRAINT citation_audit_run_trigger_check CHECK (trigger IN ('setup','monthly','manual'));
CREATE INDEX citation_audit_run_manual_idx ON citation_audit_run (agency_id, started_at) WHERE trigger = 'manual';
-- backfill:start  pack v8: claim_url on generic directory_groups; fix_citations play title/template (D5). Idempotent, mirrors 0107.
```
Backfill SQL is generated from the packs exactly like 0107's (`vertical.config` `citations.directory_groups` for generic; `playbooks` entry `fix_citations` replaced, not appended; `version` 8; `updated_at` untouched).

### Verticals
- `directorySchema` gains `claim_url: z.url().startsWith('https://').optional()`; `Directory.claim_url?: string`. Packs → v8.

### Tools
- `packages/tools/src/limits.ts`: `CITATION_MANUAL_PER_CLIENT_DAYS = 7`, `CITATION_MANUAL_PER_AGENCY_DAY = 10`.
- `packages/tools/src/citation-audit.ts`:
  `citationAuditAvailability(db, client: { id: string; agencyId: string }, now: Date): Promise<{ state: 'available'|'weekly_limit'|'agency_daily_limit'|'running'|'not_ready'|'spend_paused'; nextAvailableAt?: string }>`;
  `requestCitationAudit(deps, userId: string, c: { id: string; agencyId: string }, now: Date): Promise<{ runId: string } | { refused: Exclude<State,'available'>; nextAvailableAt?: string }>`.
- Tool `request_citation_audit`: input `{ clientId }`, output `{ runId }`; refusals as `ToolRefusal` with the state as reason. `ISOLATION_FIXTURES` entry; out-of-scope client → `not_found`.
- Worker `citation-audit-client` payload gains optional `runId` (manual run already inserted) — `runCitationAudit` adopts that row instead of inserting.

### Engine / email / demo
- `ScorecardMetric` + `'listings'`; `buildScorecard` value; `scorecard-model.ts` header "Directory listings"; email `{ short: 'Listings' }`; demo starting point value.

### Web
- `listings/{check-now-button.tsx,check-copy.ts,actions.ts}` (mirror `rankings/scan-now-button.tsx`, `rankings/scan-copy.ts`, `rankings/actions.ts`); `listings-view.tsx` fix links; `help/copy/listing-fixes.ts`; guides `client.listings.{client,agency}.md` (Check now, how to fix).

## Testing focus
Manual limits at UTC day edges, failed runs not counted, concurrent requests → one run, client role refused, other agency → `not_found`; `runId` adoption (no duplicate run row); scorecard old-row parse; `forChannel` drops `manual`; fix link falls back to `add_listing_url`; v8 backfill idempotent and replaces (not duplicates) the play.

## Out / backlog
Listing-page reads + address check (revisit if directories allow `RivalMondayBot` after `/bot` is live, or via an official API such as Foursquare Places); **listing management** (aggregator partnership or done-for-you service — business decision); platform page for "Also found on"; editing groups on reviewed verticals; own listing lines in the brief.
