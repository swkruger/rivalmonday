# Phase 18c-2 — Check listings now, scorecard row, fix guidance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md` § Process).

**Goal:** "Check listings now" (agency, rate-limited), scorecard row "Directory listings", per-directory fix links + how-to, and the "Add or correct your listings" wording (pack v8).
**Spec:** `docs/superpowers/specs/2026-11-10-phase-18c2-listing-pages-design.md` (D1–D7); 18c-1 spec C1–C12 still binds.
**Branch:** `phase-18c` (worktree `E:/Claude Projects/CompetitorSpy-wt/phase-18c`), test DB `cs_phase_18c_test`.
**Scope change (owner, 2026-11-10):** the listing-page / address check was dropped after the Task 0 probes (spec § Why) — no crawler work in this plan.

## Global constraints
- No new vendor; manual runs are ordinary audits ($0.20 cap, spend guard, credits, `clientWorkAllowed`).
- Web reads = registered `@cs/tools` tools; writes via `runTool`; page refusals 404; out-of-scope client → `not_found`; new tool ⇒ `ISOLATION_FIXTURES` entry.
- `get_citation_audit` description unchanged (ask cassette keys). `request_citation_audit` channel `web` only.
- Dates in viewer tz; status text via `lib/labels.ts`; 36 px controls; design system v1; new strings → owner `copy:review`.
- Never edit 0107; new migration 0108. LF only. Commits end with the model's Co-Authored-By line.
- Profile gate: `/c/<id>/listings` ≤ 8 app DB stages.

## Decisions (plan-level)
- **P1** Availability is computed in the `get_citation_audit` read (web only) so the page adds no extra tool call.
- **P2** The manual run row is inserted by the tool (status `running`, `trigger='manual'`); `citation-audit-client` receives `runId` and `runCitationAudit` adopts that row (no second insert). Without `runId` behaviour is unchanged.
- **P3** v8 backfill SQL is produced the same way as 0107's (from the packs); the `fix_citations` play is replaced by id, never appended twice.

## File structure
- `packages/db/migrations/0108_listing_fixes.sql` (+ journal), `packages/db/src/schema/citations.ts` (trigger type)
- `packages/verticals/src/{schema.ts,citations.ts}`, `packages/verticals/packs/{generic,hvac_plumbing,dental}.yaml`
- `packages/tools/src/{limits.ts,citation-audit.ts}`, `packages/tools/src/tools/citations.ts`, `tools/schemas.ts`, isolation fixtures
- `packages/collectors/src/citations/run.ts`, `apps/worker/src/jobs/citations.ts`
- `packages/engine/src/briefs/{scorecard.ts,scorecard-model.ts}`, `packages/email/src/templates/scorecard.tsx`, `packages/demo/src/starting-point.ts`
- `apps/web/src/app/(app)/c/[clientId]/listings/{listings-view.tsx,page.tsx,actions.ts,check-now-button.tsx,check-copy.ts}`, `apps/web/src/help/copy/listing-fixes.ts`, `apps/web/src/lib/labels.ts`, `docs/help/pages/client.listings.{client,agency}.md`
- Docs: `docs/OPS.md` § Directory listings, package `CLAUDE.md` gotchas, work file (backlog: page reads/address, management).

## Dependencies on in-flight work
- Stacked on 18c-1 (same branch). `site-audiences` = `apps/site` only. 0108 free on `main` (checked Task 0).

## Review focus
- **RF1** Two agency users pressing Check now at once → exactly one run; the loser gets `running`.
- **RF2** Limits at UTC day edges and the 7-day client window; `failed` runs don't count; `capped` runs do.
- **RF3** Enqueue failure leaves no orphan `running` row (else the client is locked out until the 3 h stale sweep).
- **RF4** v8 backfill on a DB already at v7 and on one with a DB-created vertical: play replaced once, `claim_url` present, idempotent on re-run.
- **RF5** Client viewers never see the button or `manual`; MCP/Ask never get `manual`.

---

### Task 0: Pre-flight (controller) — DONE
Recorded in the SDD ledger: constraint name, 0108 free, probes, scope ruling. Remaining: source `claim_url` for the 12 hosts (check each resolves, GET 2xx/3xx, generic UA; unresolved → omit) — done by the controller before Task 1 and passed in the Task 1 brief.

### Task 1: Pack v8 + migration 0108
**Files:** verticals schema/citations/packs, `0108_listing_fixes.sql` (`pnpm --filter @cs/db generate --custom --name=listing_fixes`), db schema trigger type, backfill test.
**Interfaces:** spec § Migration 0108, § Verticals; D5 copy verbatim.
**Behaviour:** packs v8; generic directory entries get `claim_url` (values from the brief); play `fix_citations` title/template per D5; backfill mirrors 0107 (P3).
**Tests (first):** schema accepts https `claim_url`, rejects `http://`; catalogue carries `claim_url`; migration test: `trigger='manual'` accepted, `'other'` rejected; backfill test (follow `packages/db/src/citations-backfill.test.ts`): v7 vertical → v8 with one `fix_citations` play (new text) and `claim_url`s; re-run idempotent; DB-created vertical inherits via `assemblePack`.
**Done when:** focused vitest (verticals, db) + `tsc`.

### Task 2: Check now (tools + worker)
**Files:** `tools/src/{limits.ts,citation-audit.ts}`, `tools/citations.ts` (new tool), isolation fixtures, `collectors/src/citations/run.ts` (`runId` adoption, manual = self fresh), `apps/worker/src/jobs/citations.ts` (payload `runId?`).
**Interfaces:** spec § Tools; D1, D2, P2.
**Behaviour:** follow pattern `packages/tools/src/rank-scan.ts` (`rankScanAvailability`, `requestRankScan`) and `tools/rankings.ts` `request_rank_scan`.
**Tests (first):** available → run row + job with `runId`; second within 7 d → `weekly_limit` + `nextAvailableAt`; 10 today → `agency_daily_limit`, yesterday's don't count; failed doesn't count, capped does; `running`; `spend_paused`; `not_ready` (no vendors / no self and no rivals); concurrent → one run (RF1); enqueue failure deletes row (RF3); client role refused; other agency's client → `not_found`; worker with `runId` adopts the row (one row total), self re-searched even if fresh, rivals reused.
**Done when:** focused vitest (tools, collectors, worker) + isolation test + `tsc`.

### Task 3: `get_citation_audit` additions
**Files:** `tools/citations.ts`, `tools/schemas.ts`.
**Interfaces:** D6: `directories[].fixUrl: string`, `manual?: { state; nextAvailableAt? }` (web only). Description unchanged.
**Tests:** `fixUrl` = claim else add URL; web gets `manual` with the right state; mcp/ask lack it; client role on web gets no `manual` (RF5).
**Done when:** focused vitest + `tsc`.

### Task 4: Scorecard row
**Files:** `engine/src/briefs/{scorecard.ts,scorecard-model.ts}`, `email/src/templates/scorecard.tsx`, `demo/src/starting-point.ts` (+ brief-view only if needed).
**Behaviour:** D3; follow `googlePosts30d` (18b-1) end to end.
**Tests:** counts only in-catalogue listed rows per business; never audited → null; old JSON parses; header "Directory listings"; email shows "Listings".
**Done when:** focused vitest (engine, email) + `tsc`.

### Task 5: Web — Listings page
**Files:** listings `listings-view.tsx`, `page.tsx`, `actions.ts`, `check-now-button.tsx`, `check-copy.ts`, `help/copy/listing-fixes.ts`, `lib/labels.ts`, guides.
**Behaviour:** D4, D7; refusal copy by reason (mirror `rankings/scan-copy.ts`); how-to lines for the 12 hosts + fallback (short, plain, name the directory, never Rival Monday).
**Tests:** button shown for agency, hidden for client; availability text per state; action maps refusals; mismatch row on own business shows "Fix on {label}" with claim URL, falls back to add URL; rival mismatch row has no fix link; `not_found` keeps "Add listing".
**Done when:** focused vitest + `tsc` + `bash apps/web/scripts/profile-gate.sh --seed` (listings ≤ 8).

### Task 6: Docs + final checks (controller)
OPS (Check now limits, SQL for manual runs), package `CLAUDE.md` gotchas, work file (interfaces, backlog: page reads/address with probe evidence, listing management). Final whole-branch review (top model) over 18c-2, one fix wave; `test:affected` + `e2e:affected --full` once; `pnpm eval:replay` (re-record with `--fill` only if a key changed).
