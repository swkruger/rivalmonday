# phase-9 — Billing (platform → agency subscriptions; agency → client billing TBD)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-9   **Base:** main @ c84ca97
**Plan/spec:** 9a spec `docs/superpowers/specs/2026-10-12-phase-9a-platform-billing-design.md` (e1–e16); 9a plan `docs/superpowers/plans/2026-10-12-phase-9a-platform-billing.md` (P1–P5, Tasks 0–12). 9b spec `docs/superpowers/specs/2026-10-12-phase-9b-client-billing-connect-design.md` (f1–f13); 9b plan `docs/superpowers/plans/2026-10-12-phase-9b-client-billing-connect.md` (Q1–Q4, Tasks 0–12). 9b execution after pilot feedback.

## Status (overwrite)
**9a execution started 2026-10-14** (phase-6 and phase-8 on `main`; subagent-driven). Specs + plans for 9a and 9b owner-approved 2026-10-12. 9b executes only after 9a merge + pilot feedback. Test DB: `cs_phase_9_test` on the local cluster.

## Next (overwrite)
1. 9a Task 0 pre-flight (re-check dependencies vs code, Stripe test keys from owner — fake gateway until then, scheduler inventory), then Tasks 1–12 via subagent-driven development.

## Interfaces this branch adds or changes
None yet.

## Assumes from other branches
- **phase-6:** 6b adds `client.ask_monthly_quota` (default 100, hard stop), `get_usage.questions`, `set_client_limits.askMonthlyQuota`; per-plan quota defaults build on it. Shared: `tools/usage.ts`, `tenancy.ts`, `tools/all.ts`, `deps.ts`.
- **phase-8 (8a approved, not built):** `platform_admin` (owner|staff|viewer) + `requirePlatformOperator(deps, ctx, min?)` gate billing writes (pilot grants, suspend); MRR / paid seats extend `agency_daily_stat`; actions live on `/platform/agencies/[id]`. Conflicts: `tools/platform.ts`, nav.
- **phase-7-planning (parked):** caps + pause-at-100 % stay Phase 7b (not here). Prod domain `rivalmonday.app` (webhook URL); Postmark from `mail.rivalmonday.app`.
- **Migrations:** next free at execution time; phase-6 holds 0038–0043, phase-8 plans two after that.

## Pre-flight drift (9a Task 0, 2026-10-14)
Drift (plan -> actual); plan file already corrected for paths:
- Console pages live in `app/(platform)/platform/**`, not `(app)/platform`; nav in `components/shell/nav-items.ts`; `StatCard` = `apps/web/src/components/stat-card.tsx`.
- Write choke point is `ToolRegistry.invoke` in `packages/core/src/tools.ts` (generic, no deps hook yet), not `tools/registry.ts`/`run-tool.ts`. `generatePat`/`hashPat` = `packages/core/src/tokens.ts`.
- `ToolErrorCode` is a closed union: `billing_seat_limit`, `service_paused`, `invalid_code` need adding there, in `mcp/src/errors.ts` `mapError` (else -> internal) and `forms.ts` `FORM_COPY`.
- `packages/db/src/filters.ts` does not exist (create). Next free migration **0052**. Service role `app_service` gets rights via 0001 default privileges (no GRANT line).
- `notification` outbox is client-scoped (`client_id` NOT NULL, kind = text, dedupe = `dedupe_key` unique) -> **plan conflict for P4/Task 7**: agency-level billing mail cannot use it; default to direct send like `server/support-email.ts` (see plan P4).
- `create_client` has no transaction; no client reactivation tool exists (only `convert_prospect`). Recording platform audit = `withPlatformAudit` (`tools/src/platform/audit.ts`).
- No middleware (only `proxy.ts` cookie check): webhook route needs a `PUBLIC` entry; suspended redirect goes in `(app)/layout.tsx`. Worker has no DEMO/TEST gate; jobs registered in `main.ts` `registerJobs`.

Scheduler inventory (needs `agencyServiceable`):
- collectors `local/self.ts:37` ensureSelfCompetitors; `rankings/scan.ts:68` listRankClients (monthly rank scans); `schedule/due-pages.ts:17` claimDuePages; `sources/due.ts:19-20` claimDueSources (2 branches)
- engine `sweep.ts:70` score branch; `sweep.ts:85` rankDiff branch; `moves/moves-stage.ts:61` listMoveClients; `briefs/generate.ts:136` listBriefDueClients; `score/score-stage.ts:116` scoreEvent; `reports/quarterly.ts:67` runQuarterlyReports
- no client query (select briefs/alerts/notifications; need a join): `briefs/deliver.ts:94` deliverDueBriefs, `alerts/create.ts:34` sweepAlerts, `alerts/digest.ts:11` runAlertDigests, `delivery/outbox.ts:122` dispatchDue
- ask/MCP/tools: `ask/starters.ts:37` starters; `ask/quota.ts:58` beginTurn + `ask/turn.ts:201` runTurn (Ask entry); `mcp/auth.ts:38` token auth (returns null unless client active) + `mcp/server.ts:42` tools/call; `tools/access/oauth.ts:35`; `tools/tools/portfolio.ts:29` get_portfolio (read)
- not filtered by design: sweep review/price branches; `run_prospect_snapshot` (prospect, agency-initiated)

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
- [ ] **Later (9b follow-up)** → Review annual billing option for agency → client subscriptions (9b ships monthly only) — *from 9b brainstorm 2026-10-12*

## Owner verification steps
TBD.

## Brief

### 1. Scope (owner's words + spec)
Owner: platform + agency billing; manageable prices. Platform: free pilot (selected agencies), 30-day trial, then $229/agency incl. 3 client seats, +$99 per extra seat; discount codes. Agency: build agency→client billing or not? Agency may charge any price per seat.
- **§10.6:** MVP = metering + limits only; "Stripe Billing arrives with Phase 2". **§2.2:** Phase 2 (wholesale) = "Stripe Billing for wholesale seats", agency onboarding flow; Phase 3 = "Stripe Connect rebilling". This phase pulls both forward (Connect = open Q).
- **§5.1** "seats" (5b-2 deferred seat limits to billing). **§8.3/§8.4** MCP gating + Ask quota "per tier". **§11** caps = Phase 7b. **§1.3** own clients first, then wholesale.
- Build: manageable plans/prices; agency lifecycle pilot → trial → paid → past-due → suspended/cancelled; seat count + sync; discount codes; provider + webhooks; agency billing UI; billing emails; platform controls (grant pilot, status); entitlement checks.
- **Seams:** Phase 10 wizard calls start-trial/checkout tools; Phase 11 client activation changes seat count; Phase 8 income statement reads our payment records, suspend reuses our agency status.

### 2. Already built — reuse, don't rebuild
- **No Stripe/billing code** (docs only; mockup `docs/brand/mockups/05-white-label-settings.html` has a "Billing" tab). `.env`: 0 `STRIPE*` keys.
- **Tenancy:** `agency` (`id, name, branding, created_at` — no status/plan) and `client` (`status` `active|prospect`, `monthly_cap_usd` default 15, `competitor_limit` 1–10) in `packages/db/src/schema/tenancy.ts`; `membership`/`invitation` (service-role only) in `schema/access.ts`.
- **Usage:** `packages/tools/src/usage.ts` (`monthStart`, `spendByClient`, `agencyLevelSpend`), `limits.ts`; ledgers `llm_call`/`vendor_call` (`schema/ledger.ts`, `cost_usd` doublePrecision); tools `get_usage`, `set_client_limits` (`tools/src/tools/usage.ts`); page `/agency/usage`.
- **Client lifecycle:** `create_client` (`tools/src/tools/onboarding.ts`), `convert_prospect`, `list_prospects`, `run_prospect_snapshot` (`tools/src/tools/prospects.ts`); page `/agency/clients/new`, `/agency/prospects`.
- **Seats/team:** `invite_member`, `revoke_membership`, `revoke_invitation`, `update_agency_branding` (`tools/src/tools/settings.ts`); `/agency/team`, `/agency/branding`.
- **Email:** `@cs/email` (Postmark + file-outbox transports, `templates/agency-notice.tsx` etc.); notification outbox written in the state-change transaction (`schema/delivery.ts`).
- **Worker:** `apps/worker/src/jobs/*`, cron via `JobDef.cron` (`jobs.ts`, `boss.ts`).
- **Web:** `apps/web/src/server/{run-tool,tools,env}.ts`; only API route `app/api/auth/[...all]/route.ts`. New env vars → `turbo.json` `globalPassThroughEnv` + `server/env.ts`. Operator gate `tools/src/platform.ts`. New screens → `packages/demo/src/coverage.ts`.

### 3. Binding decisions (do not re-open)
- Web reads = registered `@cs/tools` tools; writes via `runTool`, audit-logged; tools decide permissions. Page refusals → 404.
- RLS via `withTenant`; service role only where needed. Self-hosted Better Auth; access in own `membership` table.
- Postmark; per-agency white-label branding; `upsell_tag` never client-facing; `client.status = 'active'` filters; no jobs in DEMO/TEST; owner approves new `.env` vars.
- phase-6 e3/e4: clients never see usage or limits.
- phase-8 d2/d4: platform roles owner|staff|viewer; cross-agency reads via `deps.service` after `requirePlatformOperator`.

### 4. Backlog to fold in (verbatim)
- [ ] Delete/archive a prospect (needs soft-delete first); per-agency default caps/limits — *from 5b-2*
- [ ] Soft-delete/archival before any delete feature — audit/ledger rows cascade-delete with agency/client today — *from Phase 1 review* (cancel/retention)
- [ ] Switch `cost_usd` (`packages/db/src/schema/ledger.ts`, `doublePrecision`) to `numeric` before real spend data — *from Phase 1 review*
No item is about Stripe, invoices, trials or seat billing.

### 5. In-flight workstreams
See **Assumes from other branches** (hot spots: `tenancy.ts`, `usage.ts`, `platform.ts`, nav, migration numbers).

### 6. Open questions for the owner (most design-changing first)
1. **Split?** (a) 9a platform→agency billing (Stripe Billing, trial, seats, codes, UI), 9b agency→client billing; (b) one phase. *Rec: (a); 9b may shrink to "seat report" per Q3.*
2. **Provider:** (a) Stripe Billing + Stripe Tax; (b) Paddle / Lemon Squeezy merchant-of-record (handles US sales tax). *Rec: (a) — Connect path for 9b, best seat/coupon APIs.*
3. **Agency→client billing:** (a) none — agencies bill clients themselves, we report seats; (b) optional Stripe Connect (Express) so agencies charge their own per-seat price through us, optional application fee; (c) invoice/CSV export only. *Rec: (a)+(c) now, (b) later phase.*
4. **Billable seat:** (a) `client.status='active'` only, prospects free; (b) active + prospects. Mid-month adds/removals: prorate vs bill next cycle. *Rec: (a), Stripe proration on add, credit on remove at period end.*
5. **Trial:** card up front or not; at trial end / failed payment: grace (e.g. 7 d) → read-only → suspend; data retention after cancel. *Rec: no card for trial; 7-day grace, then read-only (jobs stop), suspend after 30 d; retain 90 d.*
6. **Pilot/free:** (a) `pilot` plan flag on agency with optional end date; (b) 100 % Stripe coupon. Granted by platform admin (Phase 8 role ≥ staff). *Rec: (a) — no Stripe customer needed.*
7. **Price management:** (a) Stripe as source of truth, read-through; (b) own `plan`/`plan_price` tables synced to Stripe Prices, versioned, existing subs grandfathered. *Rec: (b) thin, Stripe IDs stored.*
8. **Discount codes:** (a) Stripe promotion codes in Checkout; (b) own codes table. *Rec: (a).*
9. **Overages:** flat seats only vs usage-based overage on AI/vendor spend over caps. *Rec: flat seats; caps stay cost guards (Phase 7b).*
10. **Tax/currency:** USD only + Stripe Tax? *Rec: yes.*
11. **Billing UI:** Stripe Checkout + Customer Portal linked from `/agency/settings/billing`, vs fully custom. *Rec: Checkout + Portal, own summary page (plan, seats, next invoice, status).*
12. **Dunning emails:** Stripe's vs our Postmark. *Rec: Stripe receipts/dunning; Postmark for trial-ending/suspension notices.*
13. **Enforcement:** block activating seat 4+ without a payment method? block during past-due? *Rec: trial — allow; paid — require payment method; past-due — block new seats only.*
14. **Webhooks:** Vercel route `/api/stripe/webhook`, signature check, idempotent via stored event ids. *Rec: yes.*
