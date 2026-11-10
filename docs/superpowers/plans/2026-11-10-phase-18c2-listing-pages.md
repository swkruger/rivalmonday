# Phase 18c-2 — Listing pages, Check now, scorecard, fix guidance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md` § Process).

**Goal:** Read the client's own directory listing pages (name/address/phone, dark until web monitoring is on), add "Check listings now", a scorecard row "Directory listings" and per-directory fix guidance.
**Spec:** `docs/superpowers/specs/2026-11-10-phase-18c2-listing-pages-design.md` (D1–D16); 18c-1 spec C1–C12 still binds.
**Branch:** `phase-18c` (worktree `E:/Claude Projects/CompetitorSpy-wt/phase-18c`), test DB `cs_phase_18c_test`.

## Global constraints
- No new vendor, no paid calls in page checks; crawler only via the worker's polite renderer (robots RFC 9309, ≥ 3 s/host, SSRF guard). Never evade a bot wall.
- `WEB_MONITORING_ENABLED` gates `citation-page-check` (idle when not `'true'`). Never set it anywhere.
- No mismatch without a stored `directory_page` capture id. Address only from structured data (D5).
- Self business only (D1). Rival listing pages are never opened.
- Web reads = registered `@cs/tools` tools; writes via `runTool`; page refusals 404; out-of-scope client → `not_found`.
- New tool ⇒ `ISOLATION_FIXTURES` entry. `shownAddress`/page `shownPhone` web-only (`forChannel`).
- Model input via `redactForModel`; `client.status='active'` and `clientWorkAllowed` in schedulers/jobs.
- Copy rules: dates in viewer tz, status text via `lib/labels.ts`, 36 px controls, design system v1; new strings go to owner `copy:review`.
- Never edit migration 0107; new migration 0108. LF only. Commits end with the model's Co-Authored-By line.
- Profile gate: `/c/<id>/listings` ≤ 8 app DB stages.

## Decisions (plan-level)
- **P1** `get_citation_audit` **description stays unchanged** (its text is part of every ask cassette key; changing it costs a ~$2 re-record). New output fields are self-describing. `request_citation_audit` is web-only, so the ask tool list is unchanged. If any ask cassette key still changes, re-record with `--fill` (≤ $0.20, owner already OK'd ask re-records this phase).
- **P2** Page checks reuse the worker's single `getRenderer()` instance and `HostRateLimiter`; no second limiter.
- **P3** A manual run uses `trigger='manual'`; `runCitationAudit` treats it like `setup` for the self business (always re-search) and like `monthly` for rivals (reuse ≤ 25 d).
- **P4** Effective listing view = one pure helper `effectiveListing(row)` in `@cs/engine` (or `@cs/core` if tools need it without engine) used by tools, recommendation and self-rule — no duplicated override logic.
- **P5** `claim_url` lives in pack YAML; how-to lines live in `apps/web/src/help/copy/listing-fixes.ts` (server-only), keyed by host.

## File structure
- `packages/db/migrations/0108_listing_pages.sql`, `packages/db/src/schema/citations.ts`
- `packages/collectors/src/citations/{address.ts,page.ts,page-check.ts}` (+ tests, fixtures under `citations/__fixtures__/pages/`), `evidence/listing-page-capture.ts`
- `apps/worker/src/jobs/citations.ts`, `apps/worker/src/deps.ts`
- `packages/tools/src/{citation-audit.ts,limits.ts}`, `packages/tools/src/tools/citations.ts`, `tools/schemas.ts`, isolation fixtures
- `packages/engine/src/briefs/{scorecard.ts,scorecard-model.ts,self-rules.ts,citation-recommendation.ts}`, `packages/email/src/templates/scorecard.tsx`, `packages/demo/src/starting-point.ts`
- `packages/verticals/src/{schema.ts,citations.ts}`, `packages/verticals/packs/*.yaml`
- `apps/web/src/app/(app)/c/[clientId]/listings/{listings-view.tsx,page.tsx,actions.ts,check-now-button.tsx,check-copy.ts}`, `apps/web/src/help/copy/listing-fixes.ts`, `apps/web/src/lib/labels.ts`, `docs/help/pages/client.listings.{client,agency}.md`
- Docs: `docs/OPS.md` § Directory listings, package `CLAUDE.md` gotchas, work file.

## Dependencies on in-flight work
- Stacked on 18c-1 (same branch, unmerged). `site-audiences` touches only `apps/site` — no overlap. Re-check `git branch --no-merged main` in Task 0; migration 0108 must still be free on `main`.

## Review focus
- **RF1** A row whose `listing_url` changed between enqueue and page check must not get the old page's result (guard in `checkListingPage`).
- **RF2** JSON-LD with several businesses (directory "nearby" blocks) must not attribute a neighbour's phone/address to the client (name-hit selection; else null).
- **RF3** Partial addresses (no number, PO box, ZIP missing) → `null`, never `false`.
- **RF4** Two agency users pressing Check now at once → exactly one run (lock + unique index), limits counted correctly at UTC day edges.
- **RF5** Dark mode: no renders, no captures, no row changes; UI unchanged from 18c-1.

---

### Task 0: Pre-flight (controller)
- `git branch --no-merged main`; confirm 0108 free on `main`; read the existing `citation_audit_run` trigger constraint name and `capture.source` constraints (there is none on `capture.source` today — confirm).
- Decide whether adding `claim_url` needs a pack version bump/backfill (pack loader + `vertical` table copy); record ruling.
- Source `claim_url` for the 12 catalogue hosts (owner sign-in / claim pages), check each resolves (GET, 2xx/3xx after redirects, generic UA); unresolved → omit (fallback to `add_listing_url`). Record values in the ledger.
- **Only if the owner OK'd the live probe:** render ≤ 12 real listing pages (one per allowed host; robots honoured, 3 s/host, `RivalMondayBot`), save sanitised HTML as fixtures (strip scripts except JSON-LD), note which carry JSON-LD/microdata. Otherwise build synthetic fixtures modelled on schema.org examples.
- **Done when:** ledger has rulings + claim URLs; fixtures listed.

### Task 1: Migration 0108 + schema
**Files:** `packages/db/migrations/0108_listing_pages.sql` (+ journal via `pnpm --filter @cs/db generate --custom --name=listing_pages`), `packages/db/src/schema/citations.ts`, isolation world (self row gets page fields in one case).
**Interfaces:** SQL exactly as spec § Migration 0108 (constraint name from Task 0). Drizzle columns `pageStatus`, `pageCheckedAt`, `pageCaptureId`, `pageNameMatch`, `pagePhoneMatch`, `pageShownPhone`, `addressMatch`, `shownAddress`; `CitationPageStatus` type export.
**Tests:** migration test: insert row with each `page_status`, bad value rejected; `trigger='manual'` accepted, `'other'` rejected; `page_capture_id` FK restrict.
**Done when:** `pnpm --filter @cs/db exec vitest run <migration test>`, `tsc --noEmit`.

### Task 2: Address normaliser + page parser (pure)
**Files:** `citations/address.ts`, `citations/page.ts`, tests + fixtures.
**Interfaces:** spec § Collectors `normaliseStreet`, `compareAddress`, `readListingPage(html, biz): ListingPageRead`.
**Behaviour:** D5 order; JSON-LD may be array, `@graph`, or nested `address`; invalid JSON blocks skipped; `@type` may be array; ZIP+4 → 5; toll-free-only phone → null; suite/unit dropped; directions/suffix table per D6.
**Tests (first):** `normaliseStreet` table (≥ 12 rows incl. "123 N. Main Street, Ste 4" ≡ "123 North Main St"); `compareAddress` true/false/null (missing ZIP, missing number, PO Box → null); parser: single LocalBusiness, `@graph`, Dentist subtype, microdata, phone-only via `tel:`, two businesses with name hit picks right one, two without name hit → all null (RF2), garbage JSON-LD.
**Done when:** focused vitest + `tsc`.

### Task 3: Listing-page capture + check
**Files:** `evidence/listing-page-capture.ts`, `citations/page-check.ts`, `citations/audit.ts` (`upsertCitationRows` clears `page_*`).
**Interfaces:** `recordListingPageCapture({db, store}, {competitorId, url, page: RenderedPage}): Promise<{captureId}>` (source `directory_page`, version `directory-page/1`, text + html evidence, hash-first; follow `evidence/vendor-capture.ts`). `checkListingPage` per spec.
**Behaviour:** capture on every non-deferred outcome; status `ok` → compare D6–D8 and write `page_*`, `address_match`, `shown_address` (only when false), `page_shown_phone` (only when phone false); non-ok → write `page_status`, `page_checked_at`, `page_capture_id`, null the match fields; skip update when row `listing_url` ≠ input or status ≠ `listed` (RF1). Close the page.
**Tests:** fake renderer: ok match, address mismatch stores `shown_address`, robots_disallowed, blocked, deferred (no capture, no write), listing_url changed (no write); upsert with new listing_url clears page fields; same url keeps them.
**Done when:** focused vitest (DB) + `tsc`.

### Task 4: Worker job
**Files:** `apps/worker/src/jobs/citations.ts`, `deps.ts` (+ deps interface), job tests.
**Interfaces:** job `citation-page-check` payload `{clientId, competitorId, host, listingUrl}` (zod), `SINGLE_SHOT_QUEUE`; `deps.webMonitoringEnabled()` (reuse the `adImagesEnabled` env read — rename only if trivial, else add a sibling).
**Behaviour:** dark → log + return (RF5); client not active or `clientWorkAllowed` false → return; `deferred` → `queue.send` same payload with `startAfter` seconds; `citation-audit-client` enqueues eligible self rows after `diffCitations` (D10 singleton key, `startAfter i*5`), only when web monitoring is on.
**Tests:** dark → no renderer call; on → enqueued count = eligible self rows (not rivals, not also-found, not `not_found`); deferred re-enqueues; paused client skipped.
**Done when:** focused vitest + `tsc`.

### Task 5: Check listings now (tools)
**Files:** `packages/tools/src/{limits.ts,citation-audit.ts}`, `tools/citations.ts` (new tool), `collectors/src/citations/run.ts` (`trigger` manual, P3), isolation fixtures.
**Interfaces:** spec § Tools. Tool `request_citation_audit` channels `['web']`, write, agency roles only; output `{ runId }`; refusals `weekly_limit | agency_daily_limit | running | not_ready | spend_paused` as `ToolRefusal`.
**Behaviour:** mirror `rank-scan.ts` `requestRankScan` (agency `FOR UPDATE`, re-check, insert running run, enqueue `citation-audit-client` with `{clientId, runId?}` after commit, delete on enqueue failure). Counting per D11. `not_ready` when `!vendorsConfigured` or no self and no rivals.
**Tests (first):** available → run row + job; second within 7 d → `weekly_limit` with `nextAvailableAt`; 10 agency runs today → `agency_daily_limit`, yesterday's don't count; running → `running`; spend paused; failed runs don't count; concurrent two calls → one run (RF4); client role → refused; other agency's client → `not_found`.
**Done when:** focused vitest + `tsc`; isolation suite entry passes (`pnpm --filter @cs/tools exec vitest run <isolation test>`).

### Task 6: `get_citation_audit` additions
**Files:** `tools/citations.ts`, `tools/schemas.ts`, `@cs/core` or engine `effectiveListing` (P4).
**Interfaces:** per listing `addressMatch: boolean|null`, `pageStatus: CitationPageStatus|null`, `pageCheckedAt: string|null`, `pageEvidenceId: string|null`, `shownAddress: string|null` (web only); `nameMatch`/`phoneMatch`/`shownPhone` = effective values (D9); `directories[].fixUrl` (`claim_url ?? add_listing_url`); top-level `manual: {state, nextAvailableAt?}` web only. Description unchanged (P1).
**Tests:** page ok overrides search values; non-ok keeps search values; mcp/ask drop `shownAddress`, `shownPhone`, `manual`; evidence id resolves to the page capture's evidence.
**Done when:** focused vitest + `tsc`.

### Task 7: Recommendation + self-rule
**Files:** `engine/src/briefs/{citation-recommendation.ts,self-rules.ts,starting-point.ts}` (loader adds page fields).
**Behaviour:** use `effectiveListing`; `address_match=false` → mismatch `field:'address'` (D14); mismatch-only host copy "Correct your listing on {label}" (D13; exact copy in the task brief from existing strings' pattern, owner signs in copy review); scoring weight as phone.
**Tests:** address mismatch alone produces finding + recommendation with "Correct your listing on"; missing + mismatch mixed; page non-ok ignored.
**Done when:** focused vitest + `tsc`.

### Task 8: Scorecard row
**Files:** `engine/src/briefs/{scorecard.ts,scorecard-model.ts}`, `email/src/templates/scorecard.tsx`, `demo/src/starting-point.ts`, `brief-view` only if it needs the column.
**Behaviour:** D12; `formatMetric` integer; old stored scorecard (no `listings`) parses to null and renders "—".
**Tests:** builder counts only in-catalogue listed rows of each business; never-audited → null; old JSON parses; model has header "Directory listings"; email preview renders "Listings".
**Done when:** focused vitest (engine, email) + `tsc`.

### Task 9: Verticals `claim_url`
**Files:** `verticals/src/{schema.ts,citations.ts}`, packs, backfill migration only if Task 0 ruled it needed (then it joins 0108 or becomes 0109).
**Tests:** schema accepts optional `https` `claim_url`, rejects non-https; catalogue carries it.
**Done when:** focused vitest + `tsc`.

### Task 10: Web — Listings page
**Files:** listings `listings-view.tsx`, `page.tsx`, `actions.ts`, `check-now-button.tsx`, `check-copy.ts`, `help/copy/listing-fixes.ts`, `lib/labels.ts`, guides.
**Behaviour:** D16 states for self rows; fix link + how-to (D13); Check now button (agency viewers only, availability line with viewer-tz date; mirror `rankings/scan-now-button.tsx` + `rankings/actions.ts` refusal copy); client viewers see no button. Guides: page check, Check now, how to fix.
**Tests:** page test per state (ok / robots / blocked / never read keeps "Address: not checked"); fix link uses claim URL else add URL; button hidden for client role; action refusal copy per reason. Profile gate stays ≤ 8.
**Done when:** focused vitest + `tsc` + `bash apps/web/scripts/profile-gate.sh --seed` for the listings page.

### Task 11: Docs + final checks (controller)
- OPS § Directory listings: page checks (dark rule, staging `CRAWL_HOST_ALLOWLIST` hosts), Check now limits, SQL to inspect `page_status`. Package `CLAUDE.md` gotchas (collectors: address only from structured data; tools: P1 description rule). Work file Interfaces + staging checks.
- Final whole-branch review (top model) over 18c-2 commits, one fix wave; `test:affected` + `e2e:affected --full` once; `pnpm eval:replay` (re-record per P1 only if a key changed).
