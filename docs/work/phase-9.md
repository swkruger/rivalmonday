# phase-9 — Billing (platform → agency subscriptions; agency → client billing TBD)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-9   **Base:** main @ 6c14877
**Plan/spec:** 9a spec `docs/superpowers/specs/2026-10-12-phase-9a-platform-billing-design.md` (e1–e16); 9a plan `docs/superpowers/plans/2026-10-12-phase-9a-platform-billing.md` (P1–P5, Tasks 0–12). 9b (Stripe Connect) parked until pilot feedback.

## Status (overwrite)
9a spec owner-approved 2026-10-12; 9a plan **owner-approved 2026-10-12** (subagent-driven). 9b (Stripe Connect) being planned now; execution of 9b only after pilot feedback. Execution needs phase-6 **and** phase-8 merged (order 6 → 8 → 9) and an owner Stripe test account.

## Next (overwrite)
1. Brainstorm + spec + plan 9b on this branch.
2. After phase-6 and phase-8 merge: Task 0 pre-flight (rebase, Stripe test keys from owner, scheduler inventory).

## Interfaces this branch adds or changes
None yet.

## Assumes from other branches
- **phase-6:** 6b adds `client.ask_monthly_quota` (default 100, hard stop), `get_usage.questions`, `set_client_limits.askMonthlyQuota`; per-plan quota defaults build on it. Shared: `tools/usage.ts`, `tenancy.ts`, `tools/all.ts`, `deps.ts`.
- **phase-8 (8a approved, not built):** `platform_admin` (owner|staff|viewer) + `requirePlatformOperator(deps, ctx, min?)` gate billing writes (pilot grants, suspend); MRR / paid seats extend `agency_daily_stat`; actions live on `/platform/agencies/[id]`. Conflicts: `tools/platform.ts`, nav.
- **phase-7-planning (parked):** caps + pause-at-100 % stay Phase 7b (not here). Prod domain `rivalmonday.app` (webhook URL); Postmark from `mail.rivalmonday.app`.
- **Migrations:** next free at execution time; phase-6 holds 0038–0043, phase-8 plans two after that.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

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
