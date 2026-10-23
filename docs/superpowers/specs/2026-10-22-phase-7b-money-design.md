# Phase 7b — Money: credits, limits, spend pauses, spike guard, billing fixes

**Date:** 2026-10-22 · **Branches:** `phase-7b1`, `phase-7b2` · **Core spec:** §1.4, §7.5, §10.6, §11 · **Brief:** `docs/work/phase-7-planning.md` § 7b · **Earlier:** 5b-2 d6/d17, 8c, 9a/9b, 7a §6/§10, 13b.

## 1. Intent & why
Fees are flat (agency fee + per-client seats) and priced for generous AI use; nothing is billed by usage. Limits only protect platform margin against runaway use, bugs and abuse. 7b1: platform-owned **credit** limits with a hands-off spend pause, a platform **spike guard**, an exact ledger, retry/cost leak fixes. 7b2: Phase 9 billing correctness.

## 2. Non-goals / anti-goals
- **Non-goals:** buying extra credits (future; keep the limit in `effectiveLimitUsd` so a purchased term slots in); usage billing; agency allowances; cross-replica limiter (7c); error-rate breakers (7a1 health has them).
- **Anti-goals:** a spend pause never touches `client.paused_at`/`paused_by`, seats, Stripe or `clientServiceable`; no tenant text names Rival Monday, dollars or cost; no red/orange for spend states.

## 3. Decisions
1. **(owner)** Tenants see credits; platform sees USD. **(my call)** `creditsPerUsd` setting (100); credits = `round(usd × rate)`; limits **stored in USD** (rate change = display only).
2. **(owner)** Platform-only limits: global default + per-client override. Agency `LimitsForm`/`saveLimitsAction` removed. **(my call)** no agency allowance; agency total = Σ clients + agency-level rows.
3. **(my call)** Drop `client.monthly_cap_usd`; add nullable `client.spend_limit_usd` (NULL = default); all existing clients → NULL.
4. **(owner)** Agencies set no per-client caps or limits: competitor limit and Ask quota move to platform staff too (`set_client_limits`); agency page fully read-only.
5. **(owner)** 100 % = calm in-app notice, work unaffected. **(my call)** no email; 80 % "near" is a badge only.
6. **(owner)** At `clientPausePercent` (130): email + banner to agency admins and platform staff; pause Ask, weekly and starting-point briefs, monitoring/collection, competitor searches. **(my call)** also rank scans, alert processing, prospect snapshots, Ask starters, moves. Client view opens normally. Lifts on a platform limit raise or UTC month rollover. Replaces O10.
7. **(my call)** Spend-paused work is **skipped, not queued** (that week's brief isn't made; starting-point/setup work resumes via its scheduler). Shared competitors are collected while any workable tracker remains.
8. **(owner O11; my call mechanics)** Ledger rows get `competitor_id`; rows with `client_id IS NULL AND competitor_id IS NOT NULL` split evenly at read time over the competitor's **current trackers**; retroactive drift accepted.
   - **Trackers (my call):** non-archived clients, `status IN ('active','prospect')`, `paused_at IS NULL`, linked via `client_competitor` **or** as `self_competitor_id`. Spend-paused clients stay in. Helper `competitorTrackers` (`@cs/db` `spend.ts`).
   - **Multi-competitor calls (my call):** one call serving N competitors (DataForSEO review-post chunks, jobs `task_post` batches, Anthropic message batches) is ledgered as N rows with cost/N each (tokens/units integer-split, remainder on row 1). Anthropic batches ledger per request via `scopeFor(customId)`; a request not tied to one competitor gets the equal share.
   - **Platform overhead (my call):** vertical-level engine stages (tag/diff/price) carry no client/competitor id: spike guard only, never a client limit.
9. **(owner)** Spike guard hourly, per vendor (OpenRouter, Anthropic) and total; warn +100 %, pause all AI +200 % (settings); staff reset on `/platform/health`; queued work waits; tenants see the heavy-load message.
10. **(my call)** Observed = rolling-24 h `llm_call` spend. Baseline = per-client-day rate × **N**, N = live count of `clientServiceable` clients, all agencies incl. trials. Rate = `max(7-day rate, same-weekday rate)`: 7-day = spend over trailing 7 full UTC days ÷ Σ `agency_daily_stat.clients_active` over those days; same-weekday = the same 24 h window 7 days earlier ÷ that day's Σ `clients_active` (absorbs Thursday brief nights). Not `client_seats` (counts users). OpenRouter = providers `openrouter`+`llm`; Anthropic = `anthropic`; total = all rows (Jev per d19). `vendor_call` isn't spike-guarded.
11. **(my call)** Cold start: baseline = `max(computed, floorPerClientDay × N, floorPerDay)` ($0.50, $5; same per vendor); < 7 days of `clients_active` history or Σ = 0 ⇒ floor only.
12. **(my call)** Reset snoozes auto-pause for `spikeSnoozeHours` (24); warn re-arms at once (else the next run re-pauses on the same window).
13. **(my call)** Platform staff = `platformRole` owner|staff; viewers get banners only. Settings: owner; client limits + reset: staff.
14. **(my call)** Agency email: `billing_notice` (audience `agency`), kind `client_spend_paused`. Staff email: direct transport like `platform_cost_low`, template `platform_spend_alert`.
15. **(my call)** Rank scans (weekly + Scan now) check against the pause threshold, not 100 %.
16. **(owner)** 7b1 housekeeping: `numeric` first; PDF/moves/batch retry leaks; prospect cooldown (**my call** 24 h); Ask true AbortSignal.
17. **(owner)** 7b2 = R27, M3, M8, fake gateway, `max_redemptions`, after 15c-3. M4 + billing auto-refresh → 15c-2.
18. **(my call)** A limit lowered below current spend pauses at the next hourly run, not inline.
19. **TBD — owner answer pending: Jev pricing.** `ai.yaml` `jev.input_usd_per_mtok` is a placeholder ($0.042/M input, BACKLOG:205). Options: **(a)** owner confirms the real price, Jev rows count toward limits and the spike total; **(b)** exclude `provider = 'jev'` rows from client limits and the spike guard until confirmed. Builder must not start T4/T9 until settled.

## 4. Interfaces
**Migrations** (next free number at execution; main is at 0084).
- **M-a `ledger_cost_numeric`** (T1): `llm_call.cost_usd`, `vendor_call.cost_usd` → `numeric(14,6)`.
- **M-b `spend_guard`** (T2–T3):
```sql
ALTER TABLE llm_call ADD COLUMN competitor_id uuid;     -- no FKs (ledger outlives purge)
ALTER TABLE vendor_call ADD COLUMN competitor_id uuid;
CREATE INDEX llm_call_competitor_created_idx ON llm_call (competitor_id, created_at) WHERE competitor_id IS NOT NULL;
CREATE INDEX vendor_call_competitor_created_idx ON vendor_call (competitor_id, created_at) WHERE competitor_id IS NOT NULL;
CREATE INDEX llm_call_created_idx ON llm_call (created_at);
ALTER TABLE client DROP CONSTRAINT client_monthly_cap_check, DROP COLUMN monthly_cap_usd;
ALTER TABLE client ADD COLUMN spend_limit_usd numeric(10,2) CHECK (spend_limit_usd > 0 AND spend_limit_usd <= 10000),
  ADD COLUMN spend_paused_at timestamptz;              -- service role only (no app_user grant)
CREATE TABLE spend_guard_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('client_reached','client_paused','client_unpaused','spike_warn','spike_paused','spike_reset')),
  agency_id uuid, client_id uuid, month date,          -- client_* only; no FKs
  scope text CHECK (scope IN ('total','openrouter','anthropic')),
  observed_usd numeric(14,6), baseline_usd numeric(14,6), limit_usd numeric(10,2),
  actor text NOT NULL DEFAULT 'system', note text CHECK (length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX spend_guard_event_client_once ON spend_guard_event (client_id, kind, month) WHERE kind IN ('client_reached','client_paused');
CREATE INDEX spend_guard_event_created_idx ON spend_guard_event (created_at DESC);
ALTER TABLE spend_guard_event ENABLE ROW LEVEL SECURITY; ALTER TABLE spend_guard_event FORCE ROW LEVEL SECURITY; -- no policy
INSERT INTO platform_setting (key, value, updated_by) VALUES ('spend_guard_settings','{}','migration'),
  ('ai_guard_state','{"state":"ok"}','migration') ON CONFLICT DO NOTHING;
```
**`@cs/db` `spend-guard.ts`** (`{}` parses to defaults):
```ts
export const SpendGuardSettings = z.object({
  creditsPerUsd: z.number().int().min(1).max(10_000).default(100),
  clientMonthlyLimitUsd: z.number().min(1).max(10_000).default(15),
  clientPausePercent: z.number().int().min(100).max(1_000).default(130),
  spikeWarnPercent: z.number().int().min(10).max(1_000).default(100),
  spikePausePercent: z.number().int().min(20).max(2_000).default(200),
  spikeFloorUsdPerDay: z.number().min(0).max(10_000).default(5),
  spikeFloorUsdPerClientDay: z.number().min(0).max(100).default(0.5),
  spikeSnoozeHours: z.number().int().min(1).max(168).default(24),
}).refine((s) => s.spikePausePercent > s.spikeWarnPercent);
export const AiGuardState = z.object({ state: z.enum(['ok', 'warn', 'paused']), since: z.string().datetime().optional(),
  scope: z.enum(['total', 'openrouter', 'anthropic']).optional(), observedUsd: z.number().optional(),
  baselineUsd: z.number().optional(), snoozeUntil: z.string().datetime().optional(), resetBy: z.string().optional() });
readSpendGuardSettings(db): Promise<SpendGuardSettings>; readAiGuardState(db): Promise<AiGuardState>;
effectiveLimitUsd(spendLimitUsd: string | number | null, s: SpendGuardSettings): number;
createAiGuard(db: Db, opts?: { cacheMs?: number /* 30_000 */ }): AiGuard;
```
Also `@cs/db`: `spendByClient(db, clientIds, since)` same signature, + O11 shares over `competitorTrackers`; `filters.ts` `clientWorkAllowed(t)` = `clientServiceable(t) AND spend_paused_at IS NULL` (same argument forms); `createLedgerSink` expands a record with `competitorIds` via `splitByCompetitor(record, ids): Record[]`.

**`@cs/core`:** `CallScope.competitorIds?: readonly string[]` (non-empty ⇒ N rows); `LlmCallRecord`/`VendorCallRecord` + `competitorId?: string | null`; `usdToCredits(usd, creditsPerUsd): number`; `SpendLevel = 'ok'|'near'|'reached'|'paused'`; `interface AiGuard { assertAllowed(scope: CallScope): Promise<void> }`; `AiPausedError { reason: 'platform'|'client' }`; `ToolErrorCode` + `'spend_paused'`, `'system_busy'` (userFacing C4/C5).

**`@cs/ai`:** `AiDeps.guard?: AiGuard`, checked before every provider call (`runChat`, `recording`, `embed`, `submitBatch`; not `collectBatch`, cost already incurred); `createAiFromEnv(…, guard?)`. `collectBatch(task, batchId, scope, scopeFor?: (customId: string) => CallScope)`. `ChatRequest.signal?`; `chatWithTools(task, req & { signal?: AbortSignal }, scope)`; `http.ts` `AbortSignal.any([timeout, signal])`.

**`@cs/tools`** (`SpendCredits = { used, limit, ratio, level }`, integers):
| Tool | Who | Change |
|---|---|---|
| `get_usage` | agency | `spend` → `credits`; `agencyLevelCredits`, `totalCredits`. No USD (MCP/Ask channel). |
| `get_portfolio` | agency | `spend` → `credits`. |
| `get_my_usage` (new) | client view: agency roles + `client_owner` | `{ month, credits, questions: { used, quota } }`. |
| `set_client_limits` | platform staff, `supportHidden` | `{ clientId, spendLimitUsd?: number \| null, competitorLimit?, askMonthlyQuota? }`; lifts a pause now under threshold (same tx). |
| `get_spend_guard` (new) | platform viewer | settings, state, per-scope observed/baseline/ratio, paused clients, last 50 events. |
| `update_spend_guard_settings` (new) | platform owner | partial settings. |
| `reset_ai_pause` (new) | platform staff | `{ note: 1–200 chars }` → `ok`, `snoozeUntil`, `spike_reset`. |

`runSpendGuard(deps, now): Promise<SpendGuardSummary>` (`@cs/tools` `spend-guard.ts`). `limits.ts`: drop cap constants, add `PROSPECT_SNAPSHOT_COOLDOWN_HOURS = 24`. `@cs/ask`: `BeginTurnResult` + `{ kind: 'paused' }`, `{ kind: 'busy' }`.

**Worker:** job `spend-guard` (cron `'7 * * * *'`, `short`, `retryLimit: 1`); `JobDefinition.usesAi?: boolean`. `runJob`: `AiPausedError('platform')` → re-send payload `startAfter: 600`, complete `{ deferred: 'ai_paused' }`; `('client')` → complete `{ skipped: 'spend_paused' }`. `registerJobs` defers `usesAi` batches while paused.

**Web:** `/agency/settings/usage` read-only credits; new `/c/<id>/settings/usage` (`page:client.settings.usage` + guide); `/platform/health` **Spend guard** panel (Reset + `ConfirmDialog`); `/platform/costs` **Limits & spike guard** settings (owner); `/platform/agencies/[id]` client limits editor; banners in platform, agency (admins) and client layouts.

## 5. Behaviour & edge cases
- Month = UTC; threshold = limit × `clientPausePercent`/100. Archived ignored; prospects guarded like clients.
- **`runSpendGuard`:** (1) rollover: clear `spend_paused_at < monthStart` + `client_unpaused`; (2) per client: ≥ limit → `client_reached` once/month; ≥ threshold → `spend_paused_at`, `client_paused`, `billing_notice` (dedupe `spend_paused:<client>:<month>`), staff email; paused but under threshold → lift; (3) spike. Idempotent; unique index guards races.
- **Spike:** ratio = observed/baseline − 1 per scope. ≥ pause % and not snoozed → `paused` + email; else ≥ warn % → `warn` (email on entry); below → `ok`. `paused` clears only via reset.
- **Platform pause:** AI calls refuse; `usesAi` jobs wait (re-sent; `short` collisions are the same work); crons and non-AI collection continue; Ask/web AI tools show C5; reads and MCP unaffected.
- **Spend pause:** paid-work schedulers switch `clientServiceable` → `clientWorkAllowed` (briefs, starting point, web/vendor schedule, reviews, rival monthly/sweep, rank schedule, moves, alerts, Ask starters); seats, billing, `syncSeats` keep `clientServiceable`. A shared competitor is skipped only if no tracker is workable. On-demand tools (Scan now, manual rival search, prospect re-snapshot, Ask, runbook tailor) refuse `spend_paused`; the AI guard backstops. Past briefs/evidence/alerts stay readable.
- **Ask deadline:** `turn.ts` `AbortController` fires at deadline − reserve; the forced final call (45 s reserve) gets its own signal; aborted calls ledger `ok: false`, cost NULL.
- **Numeric:** drizzle returns strings; parse at read boundaries (as 8c); keep `::float8` in sums.

**Proposed copy — owner sign-off** (no product name, no dollars):
- C1 reached: "{Client} has used this month's credits. Nothing changes — monitoring, briefs and Ask carry on as normal."
- C2 paused (agency admins): "AI work for {Client} is paused until {1st of next month} — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit."
- C3 paused (client roles): "Monitoring and new briefs are paused for the rest of this month. Your past briefs and evidence are still here, and your {agency} team has been told."
- C4 Ask: "Ask is paused for the rest of this month. Your past answers are still here."
- C5 (owner text): "The system is currently experiencing heavy load — please try again later."
- C6 email: "{Client}: AI work paused until {date}" + C2 + Usage link. C7/C8 staff email + platform banner: "AI spend is {n}% above normal ({scope})." / "All AI calls are paused after a spend spike ({scope}). Queued work is waiting — reset on Health."
- Badges (`bg-muted-surface`/`text-secondary`): "Near limit", "Limit reached", "Paused".

## 6. Sub-phases
**7b1** — 1 M-a + read parsing (before first live deploy if possible) · 2 `competitor_id`, `competitorIds` sink split, `scopeFor`, collection call sites, `competitorTrackers`, O11 `spendByClient` · 3 M-b rest, readers, `clientWorkAllowed` · 4 credits in tools, `set_client_limits` → platform, rank budget (d15) · 5 tenant UI: read-only usage, calm `SpendBadge`, agency home, client usage page, banners · 6 AI guard, errors, Ask `paused`/`busy`, worker defer/skip · 7 schedulers → `clientWorkAllowed`, on-demand refusals · 8 `runSpendGuard` client part, job, notice kind, staff template · 9 spike part (live N, `clients_active` history, floors), state, snooze · 10 platform UI · 11 retry leaks: PDF capped backoff, moves per-client backoff, Anthropic batch row-before-submit + idempotent apply + orphan sweep · 12 prospect cooldown + GBP/ads attribution · 13 Ask AbortSignal.

**7b2** (after 15c-3) — 1 R27 in-tx re-check in `disable_client_billing` · 2 M3 reconcile (`connect-daily.ts`/`client-billing-state.ts`) lifts `paused_by='auto'`, sets `last_paid_at` · 3 M8 second live subscription → agency `billing_notice` · 4 `BILLING_FAKE_GATEWAY` refused on any `VERCEL_ENV` and in worker env · 5 `max_redemptions` in `couponFor` and `redeem_discount_code` (`invalid_code`).

## 7. Open items for the builder
- Call sites needing `competitorIds` (grep `LedgerSink` callers: vendor-collect, web capture, reviews; vertical-level engine stages stay unscoped).
- drizzle `numeric({ mode: 'number' })` availability.
- PDF/moves backoff state, 7b2 redemption counting: migration only if no column fits.
- Guard cache in tests (`cacheMs: 0`); Ask abort on disconnect (default no); help copy keys + glossary "credits".

## 8. Dependencies on in-flight work (re-check)
- **15c-1** (on main): `lib/format/money.ts` (+ `formatCredits`), `StatusChip`, `ConfirmDialog`, `SaveBar`, `reportError`.
- **15c-2**: its Alert-review cap notice must use `SpendLevel`/credits or be dropped; owns M4 + auto-refresh.
- **15c-3**: `agency.suspended_*`, `agencyServiceable`, `daily.ts`, gateway — 7b2 waits; `clientWorkAllowed` composes with it.
- **15b-3b**, **13a**: `tools/all.ts`/`schemas.ts`, worker `main.ts`/`deps.ts` merge conflicts only.
- Migrations: 15c-3 (1), 13a (2), 15c-2 (0–1), 7b1 (2) — next free at execution.
