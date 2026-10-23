# Phase 7b1 — Cost guards (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (fresh implementer + reviewer per task, final whole-branch review on the most capable model, one fix wave). **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; implementers write code + tests from Behaviour + Tests. Full code appears only for SQL/grants, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** Platform-owned credit limits with a hands-off spend pause, a platform spike guard on AI spend, an exact `numeric` ledger with per-competitor cost sharing (O11), and the retry/cost leak fixes (PDF, moves, Anthropic batch, prospect cooldown, Ask AbortSignal). Tenants see credits, never dollars or the product name.

**Architecture:** One hourly worker job (`spend-guard`) reads the ledger, pauses/lifts clients (`client.spend_paused_at`) and sets a platform AI state (`platform_setting.ai_guard_state`). An `AiGuard` inside `@cs/ai` refuses provider calls while either pause holds; schedulers switch to `clientWorkAllowed`; the worker defers (platform) or skips (client) refused jobs. Limits live in USD on `client.spend_limit_usd` + global settings; tools convert to credits at the edge.

**Spec:** `docs/superpowers/specs/2026-10-22-phase-7b-money-design.md` (7b1 part: §1–§5, §6 "7b1", §7, §8). Core spec §1.4, §7.5, §10.6, §11. Execution branch `phase-7b1` (own worktree via `/rm-kickoff`).

## Global constraints
- Root `CLAUDE.md` Essentials, `docs/gotchas-cross-cutting.md`, the `CLAUDE.md` of every package touched (`db`, `core`, `ai`, `tools`, `ask`, `collectors`, `engine`, `email`, `apps/worker`, `apps/web`). Never print/stage `.env`; **no new env vars**.
- Exact values (spec §3/§4, verbatim): `creditsPerUsd` 100; `clientMonthlyLimitUsd` 15; `clientPausePercent` 130; `spikeWarnPercent` 100; `spikePausePercent` 200; `spikeFloorUsdPerDay` 5; `spikeFloorUsdPerClientDay` 0.5; `spikeSnoozeHours` 24; near = 80 % (badge only); job cron `'7 * * * *'`, `short`, `retryLimit: 1`; worker defer `startAfter: 600`; guard cache `30_000` ms; `PROSPECT_SNAPSHOT_COOLDOWN_HOURS = 24`; Ask final-call reserve 45 s; `SPEND_GUARD_EXCLUDED_PROVIDERS = ['jev']`; ledger `cost_usd numeric(14,6)`; `spend_limit_usd numeric(10,2)` in (0, 10000].
- **Anti-goals (spec §2):** a spend pause never touches `client.paused_at`/`paused_by`, seats, Stripe, `syncSeats` or `clientServiceable`. **No tenant-facing text, tool output on agency/client/MCP/Ask channels, or email to tenants names Rival Monday, dollars or cost.** No red/orange for spend states (calm `bg-muted-surface`/`text-secondary`).
- Month = UTC calendar month (`monthStart`). Archived clients ignored everywhere. Prospects are guarded like clients.
- Jev (`provider = 'jev'`) rows stay in the ledger and on `/platform/costs` but are excluded from client spend, levels, credits and the spike guard — via the one constant, never an inline `'jev'`.
- Web reads = registered `@cs/tools` tools (`callTool`; refusal → 404); web writes via `runTool`; every new write control has `WriteGuard`/`useReadOnly()`; new tools update `access-marks.test.ts` snapshot and `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`.
- Migrations: next free number at execution (main ends at `0084`); never edit applied ones; schema changes via plain `pnpm --filter @cs/db generate --name=<x>`, hand-appended RLS/grants/data in the same new file, then `generate` = "No schema changes" and `drizzle-kit check`.
- Copy marked **(owner sign-off)** goes into `docs/work/phase-7b1.md` § Owner verification as one list; implementers use it verbatim.
- Commits end with the attribution line from root `CLAUDE.md` (subagents: own model); LF only. Test scope per root `CLAUDE.md` § Process 6.

## Decisions
Spec §3 d1–d19 bind (credits display-only, platform-only limits, `spend_limit_usd`, pause at 130 %, skip-not-queue, O11 read-time split, spike math d10–d12, Jev excluded d19). Plan-local:
1. **`numeric({ precision: 14, scale: 6, mode: 'number' })`** (drizzle-orm 0.44.7 has `mode`, verified) for both ledger `cost_usd` columns and `numeric(10,2) mode: 'number'` for `spend_limit_usd`: Drizzle reads stay `number`; raw-SQL sums already cast (`::float8` / `::text` + `Number`). Sub-micro-dollar costs round to 6 dp (accepted).
2. **Third migration M-c `retry_backoff`** (Task 13): `model_batch.provider_batch_id` nullable (row-before-submit) + `move.rec_attempts`/`rec_retry_after`. Spec §7 allowed a migration when no column fits; none did.
3. **The guard checks Jev calls too** (`recording`): a pause stops *all* AI; d19 only excludes Jev from *measurement*.
4. **Worker CLIs (`*-once`) build `Ai` without a guard** (explicit operator runs); web and the worker daemon always pass one.
5. **Moves backoff is per move** inside the per-client job: `rec_attempts`/`rec_retry_after` on `move`, delay `min(2^(n−1), 16)` days, give up after 5. Only AI outcomes count (throw, or verifier kept nothing); "no playbook"/"no events" skips don't.
6. **PDF backoff is stateless:** the hourly catch-up enqueues a missing PDF only when the whole hours since `sent_at` is a power of two (1, 2, 4 … 128 h) — ≤ 8 renders over 7 days, no column.
7. **Anthropic batch:** `model_batch` row inserted `status 'pending'` before submit, provider id written after; apply runs in one transaction under `FOR UPDATE` with a `status = 'submitted'` re-check (idempotent); `pending` rows older than 1 h → `failed` (orphan sweep in `collectModelBatches`).
8. **`get_my_usage.questions` is `null` for client roles** (`@cs/ask` 6b rule "clients never learn counts or quotas" binds); agency roles get `{ used, quota }`. Flagged to the owner.
9. **New plan-local tools:** `get_spend_status` (agency/client banners), `get_client_limits` (platform limits editor), `get_ai_guard_state` (platform banner) — reads only.
10. **C1 (100 %) is an inline note** on the agency usage row, the client usage page and agency home row — not a banner, no email.
11. **C6 email** rides the 9b agency-client sender (`billing_notice` audience `agency`, platform-branded like `client-auto-paused`); its copy names no product. Owner may switch to agency branding at sign-off.
12. **One `client_paused` event/email per client per month** (unique index): a re-pause after a staff raise in the same month pauses silently (banner still shows).
13. **Rank budget** (d15) refuses when `spent + estimate > limit × clientPausePercent/100`; copy has no dollars (R1).

## File structure
- **db:** `packages/db/migrations/<next>_ledger_cost_numeric.sql`, `<next+1>_spend_guard.sql`, `<next+2>_retry_backoff.sql` (+ `meta/*`); `packages/db/src/schema/{ledger,tenancy,model-ops,engine,platform}.ts`; create `packages/db/src/spend-guard.ts` (+ test); `packages/db/src/{spend,filters,ledger,index}.ts` (+ tests).
- **core:** create `packages/core/src/spend.ts` (+ test); `packages/core/src/{ledger,tools,index}.ts`.
- **ai:** `packages/ai/src/{ai,env,http,chat,openrouter}.ts` (+ tests).
- **tools:** create `packages/tools/src/spend-guard.ts` (+ test), `packages/tools/src/tools/{spend-guard,my-usage}.ts` (+ tests); modify `packages/tools/src/{limits,usage,rank-scan,rival-search}.ts`, `tools/{usage,portfolio,schemas,all,prospects,competitors,runbooks,access-marks.test}.ts`.
- **collectors:** `rankings/{budget,scan}.ts`, `ads/{google,meta}.ts`, `gbp/collect-gbp.ts`, `reviews/{post,collect}.ts`, `jobs/post.ts`, `vendors/{apify,scrapecreators}.ts`, `prospect/snapshot.ts`, schedulers listed in Task 8.
- **engine/ask/email/mcp:** `engine/src/{briefs/pdf,reports/quarterly,briefs/recommendations,model-ops/batches,reviews/discovery,delivery/rank-notices}.ts`; `ask/src/{quota,turn}.ts`; `email/src/{types,render}.ts`, `templates/{agency-client-billing-notice,platform-spend-alert}.tsx`; `mcp/src/errors.ts`.
- **worker:** `apps/worker/src/{jobs,boss,sentry,deps,main}.ts`, create `jobs/spend-guard.ts`; `jobs/{billing-notices,moves}.ts`.
- **web:** `apps/web/src/server/{ask,tools,runbook-tailor,vertical-draft,forms}.ts`; `lib/format/money.ts`; `components/spend-badge.tsx`; `components/shell/{app-shell,nav-items}.tsx|ts`, create `components/shell/spend-banner.tsx`; pages `agency/settings/usage/*`, `agency/page.tsx`, create `c/[clientId]/settings/usage/page.tsx`; `(platform)/layout.tsx`, `platform/{health,costs,agencies/[id]}/*`; `help/copy/{agency,client,platform}.ts`; `scripts/e2e-affected-rules.ts`; `e2e/workflow.spec.ts`.
- **docs:** `docs/help/pages/*usage*`, `platform.{health,costs,agencies.detail}.operator.md`; `docs/OPS.md`; `docs/work/phase-7b1.md`; `packages/*/CLAUDE.md` gotchas.

## Dependencies on in-flight work (re-check in Task 0)
- **main** has gained phase-15c-1 (`@cs/ui` `StatusChip`/`ConfirmDialog`/`SaveBar`, `lib/format/money.ts`, `lib/report-error.ts`), 7a1/7a2, 15b-3a (migration `0084_topic_rename`). Migrations: **next free at execution** (planning saw 0085); 7b1 claims three in a row.
- **phase-15c2** (planning, no code yet): adopts chips/ConfirmDialog on `/platform/agencies/[id]`, `/platform/health`; its alert-queue "cap notice" must use `SpendLevel`/credits or be dropped (spec §8) — whichever lands second rebases; tell its session.
- **phase-15c3** (unplanned): `agency.suspended_*`, `agencyServiceable` changes, `daily.ts`/`syncSeats` — `clientWorkAllowed` composes with `agencyServiceable` unchanged; 7b2 waits for it, 7b1 doesn't.
- **phase-15b3b** (planning): tool renames in `tools/all.ts`/`schemas.ts`, `access-marks` snapshot — merge conflicts only.
- **13a** (unbuilt): 2 migrations, worker `main.ts`/`deps.ts`, `turbo.json`, `tools/all.ts` — conflicts only; whoever is second renumbers (`packages/db/CLAUDE.md` § renumbering).

## Review focus
1. **Ledger split exactness** — N rows sum to the original cost to the micro-dollar and tokens/units exactly; `null` cost stays `null` on every row; duplicate ids collapse; 0/1 ids write one row (Task 3 `splitByCompetitor` tests).
2. **O11 share filters** — archived and `paused_at` clients never take a share (statuses are only `active`/`prospect`; both count); self competitor counts; spend-paused clients keep their share; Jev excluded; client-attributed rows never double-counted (Task 3 `spendByClient` tests).
3. **Spend guard idempotency** — two concurrent runs ⇒ one `client_paused` event, one notice, one staff email; rollover lifts; a limit raise via `set_client_limits` lifts in the same transaction; `paused_at`/seats untouched (Task 5, Task 9 tests).
4. **Worker defer/skip** — `AiPausedError('platform')` re-sends with `startAfter: 600` and the same `singletonKey`, completes without Sentry/retry; `('client')` completes `{ skipped }`; a `usesAi` batch is deferred before the handler runs (Task 7 tests).
5. **Tenant leak of USD/product** — `get_usage`, `get_portfolio`, `get_my_usage`, `get_spend_status`, refusal copy and C6 contain no `usd`/`$`/"Rival Monday" on any channel (Task 4 test `no usd keys or dollar text`, Task 8 refusal-copy test, Task 9 email test).

---

### Task 0: Pre-flight
**Goal:** Prove the plan against the code; fix it inline where it fails.
**Steps:**
- `git fetch && git rebase main` in the `phase-7b1` worktree; `pnpm install`; own test DB `cs_phase_7b1_test` (`bash scripts/local-test-db.sh start|env`), `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once (pgboss schema), E2E port 3101.
- Re-check **Dependencies** (`git branch --no-merged main`, other work files via `git show <b>:docs/work/<b>.md`); claim three migration numbers.
- `rg "cost_usd|costUsd" packages apps --glob '!*.test.*' --glob '!**/migrations/**'` — confirm every DB read of `cost_usd` either uses the Drizzle column (mode `number`) or casts (`::float8`/`::text`). Known: `platform/stats.ts:116`, `tools/platform-console.ts:101`, `tools/platform-costs.ts:72`, `tools/platform-verticals.ts:68`, `usage.ts:19`, `db/spend.ts`.
- `rg "recordVendorCall|safeRecordVendorCall|dfs\.(post|get)\(" packages/collectors/src --glob '!*.test.*'` — list every collection call site for Task 3 (known: `ads/google.ts:70`, `gbp/collect-gbp.ts:96`, `jobs/post.ts:18`, `reviews/post.ts:18`, `reviews/collect.ts:31,40`, `vendors/apify.ts:64`, `vendors/scrapecreators.ts:40`; rivals/rank/static-map calls are client-scoped already).
- `rg "getAi\(\)" apps/worker/src/deps.ts` — confirm the `usesAi` job list in Task 7.
- `rg "clientServiceable\(" packages --glob '!*.test.*'` — confirm Task 8's switch/keep lists.
- Conflict-scan every task's Files against `main` and the in-flight branches; record findings in `docs/work/phase-7b1.md`.
**Done when:** findings recorded; plan edited where needed.

### Task 1: Ledger `cost_usd` → numeric (M-a)
**Goal:** Exact ledger before real spend data (spec d16).
**Files:** modify `packages/db/src/schema/ledger.ts`; create `packages/db/migrations/<n>_ledger_cost_numeric.sql` (`pnpm --filter @cs/db generate --name=ledger_cost_numeric`); modify `packages/db/src/ledger.test.ts`.
**Interfaces:** `llmCall.costUsd`, `vendorCall.costUsd` = `numeric('cost_usd', { precision: 14, scale: 6, mode: 'number' })` (nullable).
**SQL** (generated; verify it is exactly):
```sql
ALTER TABLE "llm_call" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(14, 6);
--> statement-breakpoint
ALTER TABLE "vendor_call" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(14, 6);
```
**Behaviour:** Readers unchanged (Task 0 list); any reader found returning a string is fixed with `Number()` at the boundary. Writers keep passing numbers.
**Tests (TDD):** `ledger rows keep 6 decimal places` (insert `0.0000042` → read `0.000004`); `costUsd reads back as a number`; `sum over numeric matches the float total within 1e-6` (via `spendByClient`).
**Done when:** `pnpm --filter @cs/db exec vitest run ledger spend schema`, `pnpm --filter @cs/db generate` = no changes, `pnpm --filter @cs/db exec drizzle-kit check`, `pnpm test:affected`.

### Task 2: Spend-guard migration (M-b), settings module, `clientWorkAllowed`
**Goal:** Columns, table, settings rows and the shared readers every later task needs.
**Files:** create `packages/db/migrations/<n+1>_spend_guard.sql` (plain `generate --name=spend_guard`, then append the RLS/revoke/insert block); modify `packages/db/src/schema/{ledger,tenancy,platform}.ts` (`spendGuardEvent` in `platform.ts`), `packages/db/src/{filters,index}.ts`; create `packages/db/src/spend-guard.ts` (+ `spend-guard.test.ts`); modify `packages/db/src/{filters,agency-ops}.test.ts` and the privilege guard test. Compile-fixes only (no behaviour change yet) in `packages/collectors/src/rankings/budget.ts`, `packages/tools/src/tools/{usage,portfolio}.ts` (use `effectiveLimitUsd(client.spendLimitUsd, settings)` where `monthlyCapUsd` was read; `set_client_limits` writes `spendLimitUsd` from its `monthlyCapUsd` input until Task 5) and every test that sets `monthlyCapUsd` (`db/agency-ops.test.ts`, `collectors/rankings/{budget,scan}.test.ts`, `tools/{rank-scan,tools/usage}.test.ts`).
**SQL** (spec §4 M-b verbatim, plus the revoke; split statements with `--> statement-breakpoint`):
```sql
ALTER TABLE llm_call ADD COLUMN competitor_id uuid;
ALTER TABLE vendor_call ADD COLUMN competitor_id uuid;
CREATE INDEX llm_call_competitor_created_idx ON llm_call (competitor_id, created_at) WHERE competitor_id IS NOT NULL;
CREATE INDEX vendor_call_competitor_created_idx ON vendor_call (competitor_id, created_at) WHERE competitor_id IS NOT NULL;
CREATE INDEX llm_call_created_idx ON llm_call (created_at);
ALTER TABLE client DROP CONSTRAINT client_monthly_cap_check, DROP COLUMN monthly_cap_usd;
ALTER TABLE client ADD COLUMN spend_limit_usd numeric(10,2) CHECK (spend_limit_usd > 0 AND spend_limit_usd <= 10000),
  ADD COLUMN spend_paused_at timestamptz;
CREATE TABLE spend_guard_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('client_reached','client_paused','client_unpaused','spike_warn','spike_paused','spike_reset')),
  agency_id uuid, client_id uuid, month date,
  scope text CHECK (scope IN ('total','openrouter','anthropic')),
  observed_usd numeric(14,6), baseline_usd numeric(14,6), limit_usd numeric(10,2),
  actor text NOT NULL DEFAULT 'system', note text CHECK (length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX spend_guard_event_client_once ON spend_guard_event (client_id, kind, month) WHERE kind IN ('client_reached','client_paused');
CREATE INDEX spend_guard_event_created_idx ON spend_guard_event (created_at DESC);
ALTER TABLE spend_guard_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_guard_event FORCE ROW LEVEL SECURITY;
REVOKE ALL ON spend_guard_event FROM app_user;
INSERT INTO platform_setting (key, value, updated_by) VALUES ('spend_guard_settings','{}','migration'),
  ('ai_guard_state','{"state":"ok"}','migration') ON CONFLICT DO NOTHING;
```
(The generated part covers columns/table/indexes/checks; append only what drizzle can't express. No `GRANT UPDATE` on the new client columns: service role only.)
**Interfaces:** `@cs/db` `spend-guard.ts` exactly as spec §4 (`SpendGuardSettings`, `AiGuardState`, `readSpendGuardSettings`, `readAiGuardState`, `effectiveLimitUsd`) plus `SPEND_GUARD_SETTINGS_KEY = 'spend_guard_settings'`, `AI_GUARD_STATE_KEY = 'ai_guard_state'`, `writeAiGuardState(db: Db | Tx, s: AiGuardState, by: string): Promise<void>`, `pauseThresholdUsd(limitUsd: number, s: SpendGuardSettings): number` (= `limit × clientPausePercent / 100`). `createAiGuard` lands in Task 6. Schema: `client.spendLimitUsd` (`numeric(10,2)`, `mode: 'number'`, nullable), `client.spendPausedAt` (`timestamptz`), `llmCall.competitorId`/`vendorCall.competitorId` (`uuid`, no FK), `spendGuardEvent` table.
```ts
// filters.ts — same argument forms as clientServiceable
export function clientWorkAllowed(t: typeof client | string): SQL {
  if (typeof t === 'string') {
    if (!/^[a-z_][a-z0-9_]*$/i.test(t)) throw new Error(`clientWorkAllowed: invalid alias ${t}`);
    return sql.raw(`(${t}.status = 'active' AND ${t}.paused_at IS NULL AND ${t}.archived_at IS NULL AND ${t}.spend_paused_at IS NULL)`);
  }
  return sql`(${clientServiceable(t)} AND ${t.spendPausedAt} IS NULL)`;
}
```
**Behaviour:** `readSpendGuardSettings` parses with `.parse` and falls back to defaults on a missing row or a failed parse (log once); `effectiveLimitUsd(null, s)` = `s.clientMonthlyLimitUsd`; string input parsed with `Number`. Existing clients get NULL (default).
**Tests (TDD):** `{} parses to the spec defaults`; `refine rejects pause % ≤ warn %`; `effectiveLimitUsd uses the override, else the default`; `spend_limit_usd rejects 0 and 10001`; `app_user cannot read or write spend_guard_event`; `app_user cannot update spend_limit_usd or spend_paused_at` (permission denied); `clientWorkAllowed excludes a spend-paused client but clientServiceable keeps it`; `alias form rejects "c; drop"`; `migration seeds both platform_setting rows once`.
**Done when:** `pnpm --filter @cs/db exec vitest run spend-guard filters agency-ops schema`, generate = no changes, `drizzle-kit check`, `pnpm typecheck`, `pnpm test:affected`.

### Task 3: Per-competitor attribution (O11)
**Goal:** Shared collection rows carry `competitor_id`; multi-competitor calls split; client spend includes an equal share per current tracker (spec d8).
**Files:** modify `packages/core/src/ledger.ts`; `packages/db/src/{ledger,spend,index}.ts` (+ `ledger.test.ts`, create `spend.test.ts`); collectors call sites from Task 0 (`ads/google.ts`, `ads/meta.ts`, `gbp/collect-gbp.ts`, `jobs/post.ts`, `reviews/post.ts`, `reviews/collect.ts`, `vendors/apify.ts`, `vendors/scrapecreators.ts`) + their tests; `packages/ai/src/ai.ts` (`collectBatch` `scopeFor`); `packages/engine/src/model-ops/batches.ts`.
**Interfaces:**
```ts
// @cs/core ledger.ts
export interface CallScope { agencyId: string | null; clientId: string | null; verticalId?: string; /** non-empty ⇒ N ledger rows, cost/N each */ competitorIds?: readonly string[] }
// LlmCallRecord / VendorCallRecord gain: competitorId?: string | null
// @cs/db
export function splitByCompetitor<R extends LlmCallRecord | VendorCallRecord>(record: R, ids: readonly string[]): R[];
export async function competitorTrackers(db: Db | Tx, competitorIds: string[]): Promise<Map<string, string[]>>; // competitor → client ids
export async function spendByClient(db: Db | Tx, clientIds: string[], since: Date): Promise<Map<string, number>>; // same signature
export const SPEND_GUARD_EXCLUDED_PROVIDERS = ['jev'] as const; // @cs/db spend.ts — the one place
// @cs/ai
collectBatch(task: string, batchId: string, scope: CallScope, scopeFor?: (customId: string) => CallScope)
```
**Algorithm (`splitByCompetitor`, full):**
```ts
export function splitByCompetitor<R extends LlmCallRecord | VendorCallRecord>(record: R, ids: readonly string[]): R[] {
  const { competitorIds: _drop, ...base } = record as R & { competitorIds?: readonly string[] };
  const uniq = [...new Set(ids)];
  if (uniq.length <= 1) return [{ ...base, competitorId: uniq[0] ?? base.competitorId ?? null } as R];
  const n = uniq.length;
  const share = (v: number, i: number) => Math.floor(v / n) + (i === 0 ? v % n : 0); // integers, remainder on row 1
  const micros = base.costUsd === null ? null : Math.round(base.costUsd * 1e6);
  return uniq.map((competitorId, i) => {
    const row: Record<string, unknown> = { ...base, competitorId, costUsd: micros === null ? null : share(micros, i) / 1e6 };
    if ('units' in base) row.units = share(base.units, i);
    if ('inputTokens' in base) { row.inputTokens = share(base.inputTokens, i); row.outputTokens = share(base.outputTokens, i); }
    return row as R;
  });
}
```
**O11 read (full SQL in `spendByClient`, after the existing client-attributed sums, which now also exclude `provider = ANY(excluded)` on `llm_call`):**
```sql
WITH trackers AS (
  SELECT cc.competitor_id, cc.client_id FROM client_competitor cc JOIN client c ON c.id = cc.client_id
   WHERE c.archived_at IS NULL AND c.status IN ('active','prospect') AND c.paused_at IS NULL
  UNION
  SELECT c.self_competitor_id, c.id FROM client c
   WHERE c.self_competitor_id IS NOT NULL AND c.archived_at IS NULL AND c.status IN ('active','prospect') AND c.paused_at IS NULL),
n AS (SELECT competitor_id, count(*)::numeric AS k FROM trackers GROUP BY competitor_id),
shared AS (
  SELECT competitor_id, sum(cost_usd) AS usd FROM llm_call
   WHERE client_id IS NULL AND competitor_id IS NOT NULL AND created_at >= $since AND provider <> ALL($excluded) GROUP BY competitor_id
  UNION ALL
  SELECT competitor_id, sum(cost_usd) FROM vendor_call
   WHERE client_id IS NULL AND competitor_id IS NOT NULL AND created_at >= $since GROUP BY competitor_id)
SELECT t.client_id, coalesce(sum(s.usd / n.k), 0)::float8 AS usd
  FROM shared s JOIN n USING (competitor_id) JOIN trackers t USING (competitor_id)
 WHERE t.client_id = ANY($clientIds::uuid[]) GROUP BY t.client_id
```
(Arrays built per `packages/db/CLAUDE.md` `ARRAY[...]::uuid[]`.) `competitorTrackers` uses the same `trackers` CTE (exported SQL fragment, one definition).
**Behaviour:**
- `createLedgerSink`: a record with non-empty `competitorIds` inserts `splitByCompetitor(...)` rows in one insert; otherwise one row with `competitorId` (default null). `competitorIds` never reaches Drizzle.
- Per-competitor calls pass `{ agencyId: null, clientId: null, competitorIds: [c.id] }`; batch calls pass the batch's ids (`reviews/post.ts` chunk, `jobs/post.ts` batch); `reviews/collect.ts` `taskScope` adds `[vt.competitorId]` when not a suggestion task. `apify.ts`/`scrapecreators.ts` take a `scope: CallScope` param instead of the hard-coded null scope; `collectMetaAds` passes the competitor scope.
- `collectBatch`: each result row's scope = `scopeFor?.(r.customId) ?? scope`. `collectModelBatches` passes `(customId) => ({ ...PLATFORM, verticalId: customId })` (theme discovery is vertical overhead: spike guard only).
- Vertical-level engine stages (diff/tag/price/review analysis) stay unscoped (spec d8).
**Tests (TDD):** `splitByCompetitor`: `3 ids split 0.10 into 0.033334+0.033333+0.033333`; `tokens 10 over 3 → 4,3,3`; `null cost stays null on every row`; `duplicate ids collapse`; `one id → one row`. `ledger sink writes N rows for competitorIds`. `spendByClient`: `two active trackers each get half`; `archived / paused_at tracker gets no share and the others split`; `prospect tracker shares`; `self competitor counts as a tracker`; `spend-paused client keeps its share`; `jev rows ignored, llm rows counted`; `a client-attributed row is not also shared`. Collectors: `gbp pull ledgers competitor_id`; `reviews task_post chunk of 3 ledgers 3 rows`; `apify meta ledgers the competitor scope`. AI: `collectBatch uses scopeFor per result`.
**Done when:** `pnpm --filter @cs/db exec vitest run ledger spend`, `pnpm --filter @cs/collectors exec vitest run gbp reviews jobs ads apify scrapecreators meta`, `pnpm --filter @cs/ai exec vitest run ai anthropic`, `cd packages/engine && npx vitest run model-ops`, `pnpm test:affected`.

### Task 4: Credits in tenant tools
**Goal:** Tenants see integer credits and calm levels; no USD on any tenant channel (spec d1, d5, §4 tool table).
**Files:** create `packages/core/src/spend.ts` (+ test), export from `index.ts`; modify `packages/tools/src/{usage,limits}.ts`, `tools/{usage,portfolio,schemas,all}.ts` (+ `usage.test.ts`, `portfolio.test.ts`, `access-marks.test.ts`); create `packages/tools/src/tools/my-usage.ts` (+ test).
**Interfaces:**
```ts
// @cs/core spend.ts
export type SpendLevel = 'ok' | 'near' | 'reached' | 'paused';
export const SPEND_NEAR_RATIO = 0.8;
export function usdToCredits(usd: number, creditsPerUsd: number): number; // Math.round(usd × rate)
export function spendLevel(spentUsd: number, limitUsd: number, spendPausedAt: Date | string | null): SpendLevel; // paused > reached (≥ limit) > near (≥ 0.8) > ok
// @cs/tools schemas.ts (replaces SpendView)
export const SpendCredits = z.object({ used: z.number().int(), limit: z.number().int(), ratio: z.number(), level: z.enum(['ok','near','reached','paused']) });
UsageRow = { clientId, name, status, credits: SpendCredits, competitorLimit, competitors, questions: { used, quota } }
// tools/usage.ts
export function creditsView(spentUsd: number, limitUsd: number, pausedAt: Date | null, s: SpendGuardSettings): SpendCredits;
```
| Tool | Change |
|---|---|
| `get_usage` (agency, web/mcp/ask) | output `{ month, items: UsageRow[], agencyLevelCredits: int \| null, totalCredits: int }`; `totalCredits` = Σ items `used` + (`agencyLevelCredits` ?? 0) |
| `get_portfolio` (agency) | row `spend` → `credits: SpendCredits` |
| `get_my_usage` (new, `access: 'read'`, `permission: 'read'`, web only) | input `{ clientId }` → `{ month: string, credits: SpendCredits, questions: { used, quota } \| null }`; agency roles + `client_owner` only (else `not_found`, pattern `tools/my-billing.ts:30`); `questions` null for client roles (Decision 8) |
| `get_spend_status` (new, read, `permission: 'read'`, web only, plan-local) | input `{ clientId?: uuid }` → `{ paused: { clientId, name, until: 'YYYY-MM-DD' }[] }`; agency admins/AMs: visible paused clients; client roles: only `clientId` if visible; `until` = 1st of next UTC month |
**Behaviour:** Delete `DEFAULT_MONTHLY_CAP_USD`, `MAX_MONTHLY_CAP_USD`, `SPEND_WARNING_RATIO` (+ old `SpendLevel`/`spendLevel` in `tools/usage.ts`); keep `MAX_COMPETITOR_LIMIT`. Credits/levels computed from `spendByClient` (Task 3, Jev excluded) and `effectiveLimitUsd`; settings read once per call. `agencyLevelSpend` also excludes Jev. Descriptions say "credits", never "spend"/"$".
**Tests (TDD):** `get_usage returns integer credits at 100 per USD`; `level near at 80 %, reached at 100 %, paused when spend_paused_at set`; `override limit used, else default`; `no usd keys or dollar text` — `JSON.stringify(out)` of `get_usage`/`get_portfolio`/`get_my_usage`/`get_spend_status` has no `/usd|\$|rival monday/i`; `get_my_usage refuses client_viewer and a guest (not_found)`; `client_owner gets questions null`; `get_spend_status lists only visible paused clients`; access-marks snapshot updated.
**Done when:** `pnpm --filter @cs/core exec vitest run spend`, `pnpm --filter @cs/tools exec vitest run usage portfolio my-usage access-marks channels`, `pnpm test:affected`.

### Task 5: Platform-owned limits + rank budget
**Goal:** Only platform staff change client limits; a raise lifts a pause at once; rank scans budget against the pause threshold (spec d2, d4, d15, d18).
**Files:** modify `packages/tools/src/tools/usage.ts` (`set_client_limits`), create tool `get_client_limits` there; `packages/collectors/src/rankings/{budget,scan}.ts`; `packages/tools/src/rank-scan.ts`; `packages/engine/src/delivery/rank-notices.ts`; tests `tools/usage.test.ts`, `rank-scan.test.ts`, `collectors/rankings/{budget,scan}.test.ts`, engine rank-notices test.
**Interfaces:**
```ts
set_client_limits: permission 'agency', audit 'skip-web', supportHidden: true, access 'write'
  input  z.object({ clientId: uuid, spendLimitUsd: z.number().min(1).max(10_000).nullable().optional(), competitorLimit: z.number().int().min(1).max(MAX_COMPETITOR_LIMIT).optional(), askMonthlyQuota: z.number().int().min(0).max(100_000).optional() })
  output z.object({ clientId: uuid, spendLimitUsd: z.number().nullable(), competitorLimit: z.number().int(), askMonthlyQuota: z.number().int(), lifted: z.boolean() })
get_client_limits (platform viewer, read, supportHidden, audit 'skip-web'): input { agencyId: uuid } →
  { defaultLimitUsd: number, pausePercent: number, items: { clientId, name, status, spendUsd, effectiveLimitUsd, spendLimitUsd: number | null, competitorLimit, askMonthlyQuota, level: SpendLevel, spendPausedAt: string | null }[] }
checkRankScanBudget(db, clientId, estimateUsd, now?): Promise<{ ok: true } | { ok: false; reason: 'cap' }>
RankScanSkipped: drop spentUsd/capUsd (keep estimatedUsd); RankScanAvailability: drop capUsd
```
**Behaviour:**
- `set_client_limits`: `requirePlatformOperator(deps, ctx, 'staff')` then `withPlatformAudit` (pattern `tools/platform-costs.ts` `update_platform_cost_service`, agencyId = the client's); `spendLimitUsd: null` clears the override; rounds to cents. In **one transaction**: update the row (no agency filter — operator), then if `spend_paused_at` is set and month spend < `pauseThresholdUsd(new effective limit)` → set `spend_paused_at = NULL` and insert `spend_guard_event` (`client_unpaused`, actor = `ctx.userId`, note `'limit raised'`) → `lifted: true`. Lowering never pauses inline (d18).
- `get_client_limits`: archived excluded; spend via `spendByClient` (USD — operator only).
- Rank: threshold = `pauseThresholdUsd(effectiveLimitUsd(...))`; compare in micro-dollars (`spent + estimate ≤ threshold`). Prospects keep no budget check (unchanged).
- Copy, no dollars — **R1 (owner sign-off)** for both the refusal (`rankScanRefusalMessage` `'cap'`) and the agency notice body: "{Client} is close to this month's credit limit, so this scan can't run until next month."
**Tests (TDD):** `agency_admin calling set_client_limits gets not_found` (permission_denied → hidden); `staff sets an override and clears it with null`; `viewer is refused`; `raise above spend lifts the pause and writes client_unpaused in the same tx`; `raise still under the threshold keeps the pause`; `lowering below spend does not pause`; `paused_at and paused_by untouched`; `rank budget allows up to 130 % of the limit and refuses beyond`; `refusal and notice copy contain no $`; access-marks snapshot.
**Done when:** `pnpm --filter @cs/tools exec vitest run usage rank-scan access-marks`, `pnpm --filter @cs/collectors exec vitest run budget scan`, `cd packages/engine && npx vitest run rank-notices`, `pnpm test:affected`.

### Task 6: AI guard
**Goal:** Every provider call is refused while the platform or the call's client is paused (spec d6, d9, §4 `@cs/ai`).
**Files:** modify `packages/core/src/{spend,tools}.ts` (+ tests); `packages/db/src/spend-guard.ts` (`createAiGuard`); `packages/ai/src/{ai,env}.ts` (+ `ai.test.ts`, `env.test.ts`); `packages/mcp/src/errors.ts`; `apps/web/src/server/{forms,ask,tools,runbook-tailor,vertical-draft}.ts`; `apps/worker/src/deps.ts`.
**Interfaces:**
```ts
// @cs/core
export interface AiGuard { assertAllowed(scope: CallScope): Promise<void> }
export class AiPausedError extends Error { constructor(readonly reason: 'platform' | 'client') { super(`AI paused (${reason})`); this.name = 'AiPausedError'; } }
// ToolErrorCode += 'spend_paused' | 'system_busy'
export const SPEND_PAUSED_COPY = "AI work for this client is paused for the rest of this month — it went well past this month's credits."; // S1 (owner sign-off)
export const SYSTEM_BUSY_COPY = 'The system is currently experiencing heavy load — please try again later.'; // C5 (owner text)
// @cs/db
export function createAiGuard(db: Db, opts?: { cacheMs?: number /* 30_000 */; now?: () => number }): AiGuard;
// @cs/ai
AiDeps.guard?: AiGuard;  createAiFromEnv(env, config, ledger, samples?, guard?)
```
**Behaviour (security-sensitive):**
- `createAiGuard.assertAllowed(scope)`: read `ai_guard_state` (cached `cacheMs`); `state === 'paused'` → throw `AiPausedError('platform')`. Then if `scope.clientId`: read `client.spend_paused_at` (per-client cache, same TTL) — not null → `AiPausedError('client')`. `warn` never refuses. A read failure **fails open** with one logged error per minute (a DB blip must not stop all AI; the hourly job re-asserts).
- `@cs/ai`: `await deps.guard?.assertAllowed(scope)` before the provider call in `runChat`, `recording` (Jev and LLM decisions, Decision 3), each `embed` chunk loop entry, and `submitBatch`; **not** in `collectBatch`. A refused call writes **no** ledger row.
- Registry (`core/tools.ts` handler catch): `AiPausedError` → `new ToolError(reason === 'platform' ? 'system_busy' : 'spend_paused', copy, { userFacing: true })`. `mcp/errors.ts` passes both codes through; `web/server/forms.ts` already shows `userFacing` copy.
- Web factories (`server/{ask,tools,runbook-tailor,vertical-draft}.ts`) pass `createAiGuard(service)`; worker `deps.ts` builds one guard (`aiGuard()` on `WorkerDeps`) and passes it to `createAiFromEnv`. CLIs pass none (Decision 4).
**Tests (TDD):** `paused platform state refuses chat, decide (jev + llm), embed and submitBatch with no ledger row`; `client pause refuses only that client's scope`; `warn allows`; `collectBatch is never refused`; `cache: second call within 30 s does not re-query` (`cacheMs` injectable; tests use `0` elsewhere); `guard read failure allows the call`; `registry maps AiPausedError to userFacing system_busy / spend_paused`; `mcp passes spend_paused copy through`.
**Done when:** `pnpm --filter @cs/ai exec vitest run ai env`, `pnpm --filter @cs/db exec vitest run spend-guard`, `pnpm --filter @cs/core exec vitest run tools spend`, `pnpm --filter @cs/mcp exec vitest run errors`, `pnpm test:affected`.

### Task 7: Ask `paused`/`busy` + worker defer/skip
**Goal:** Ask answers with C4/C5 before any model call; the worker never fails or retries a refused job (spec §4 Worker, `@cs/ask`).
**Files:** modify `packages/ask/src/{quota,index}.ts` (+ `quota.test.ts`); `apps/web/src/server/ask.ts` (+ test); `apps/worker/src/{jobs,boss,sentry,main}.ts` (+ `boss.test.ts`, `sentry.test.ts`); job files that set `usesAi`.
**Interfaces:**
```ts
// @cs/ask
export type BeginTurnResult = { kind: 'ok'; threadId: string; userMessageId: string }
  | { kind: 'quota' | 'paused' | 'busy'; threadId: string; messageId: string };
beginTurn(app, ctx, input, now = new Date(), opts: { pause?: 'platform' | 'client' | null } = {})
ASK_COPY.paused = "Ask is paused for the rest of this month. Your past answers are still here."; // C4 (owner sign-off)
ASK_COPY.busy = SYSTEM_BUSY_COPY; // C5
// worker
JobDefinition.usesAi?: boolean;
runJob(job, jobId, data, handler, log, opts?: { resend?: (startAfterS: number) => Promise<void> })
registerJobs(boss, jobs, opts: { pollingIntervalSeconds?: number; aiPaused?: () => Promise<boolean> })
```
**Behaviour:**
- Web `handleAskTurn`: after `assertAgencyServiceable`, `pause = await aiPauseOf(guard, { agencyId: ctx.agencyId, clientId })` (catches `AiPausedError` → reason, else null) and passes it to `beginTurn`. `beginTurn` (inside its tx, after the thread lookup, before the quota check): a pause stores the user question (`countsTowardQuota: false`) and an assistant row `status: 'refused'` with C4 (`client`) or C5 (`platform`) → `{ kind: 'paused' | 'busy' }`. The route writes one `final` with that copy and `messageId` (`AskEvent` final `status: 'refused'`, already in the union). Agency roles are refused too. `AskDeps` gains `guard?: AiGuard` (the route's source for `aiPauseOf`).
- `runJob`: catch `AiPausedError` **before** Sentry capture: `platform` → `await opts.resend?.(600)`; return `{ deferred: 'ai_paused' }`; `client` → return `{ skipped: 'spend_paused' }`; both logged at `info`, never rethrown.
- `registerJobs`: `boss.work(name, { pollingIntervalSeconds, includeMetadata: true }, …)`; resend = `boss.send(job.name, item.data, { startAfter, singletonKey: item.singletonKey ?? undefined })`. For a `usesAi` job, `if (await opts.aiPaused?.())` before the batch → resend every item with `startAfter: 600`, return `{ deferred: 'ai_paused' }` without running handlers. `aiPaused` in `main.ts` = guard `assertAllowed({ agencyId: null, clientId: null })` rejected with `'platform'`.
- `usesAi: true` on (confirm in Task 0): `engine-diff`, `engine-tag`, `engine-review`, `engine-price`, `reviews-nightly`, `moves-client`, `brief-client`, `starting-point-client`, `ask-starters`, `setup-suggestions`, `runbook-tailor`, `lead-preview`, `discover-pages`, `alert-process`, `kb-embed` (+ `rival-search` if `runRivalSearch` reaches `Ai`). Not on crons that only enqueue, collection, `model-batch-poll`, delivery.
**Tests (TDD):** `paused client: beginTurn stores refused C4, no quota count`; `busy: C5`; `route emits exactly one final with C4`; `runJob platform pause resends after 600 s and completes without Sentry`; `runJob client pause completes skipped`; `other errors still captured and rethrown`; `usesAi batch deferred with the same singletonKey while paused`; `non-AI job runs while paused`.
**Done when:** `pnpm --filter @cs/ask exec vitest run quota turn`, `pnpm --filter @cs/web exec vitest run src/server/ask`, `pnpm --filter @cs/worker exec vitest run boss sentry`, `pnpm test:affected`.

### Task 8: Schedulers → `clientWorkAllowed`; on-demand refusals
**Goal:** A spend-paused client gets no new paid work; billing/seats are unaffected (spec d7, §5 Spend pause).
**Files (switch `clientServiceable` → `clientWorkAllowed`):** `packages/ask/src/starters.ts:36`; `packages/collectors/src/{local/self.ts:40,46, rankings/map-refresh.ts:21, rankings/scan.ts:146, schedule/due-pages.ts:17,24, signals/tracked.ts:18, sources/due.ts:19,20}`; `packages/engine/src/{alerts/create.ts:44,99, briefs/generate.ts:167, briefs/readiness.ts:67, moves/moves-stage.ts:61, runbook/tailor.ts:137, score/score-stage.ts:120, sweep.ts:70,85}`; `packages/tools/src/{rival-search.ts:168, tools/runbooks.ts:329}`. **Keep `clientServiceable`:** `billing/src/access.ts:42`, `tools/src/tools/billing.ts:293`, `engine/src/briefs/deliver.ts:115`, `alerts/digest.ts:17`, `reports/quarterly.ts:67` (delivery of already-made work, no AI). On-demand: `tools/src/{rank-scan.ts, rival-search.ts, tools/competitors.ts, tools/prospects.ts, tools/runbooks.ts}`. Tests beside each.
**Interfaces:** `RankScanState` += `'spend_paused'`; `SearchRefusal` += `'spend_paused'` (copy in `tools/competitors.ts:145` map = S1); `run_prospect_snapshot` and `retailor_runbook_item` throw `ToolError('spend_paused', SPEND_PAUSED_COPY, { userFacing: true })`.
**Behaviour:**
- Shared competitors: due-pages/sources keep collecting while **any** tracker passes `clientWorkAllowed` (the `EXISTS` already expresses this once switched).
- Prospect snapshots: `prospect` status isn't `active`, so add `spend_paused_at IS NULL` to the `run_prospect_snapshot` lock query refusal, not `clientWorkAllowed`.
- Rank `request_rank_scan` refuses `spend_paused` before the budget check; `startCompetitorSearch` returns `{ refused: 'spend_paused' }` inside its tx (manual and scheduled).
- Skipped work is not queued (d7): no catch-up enqueues; the starting point resumes through its scheduler.
**Tests (TDD):** one per switched reader: `spend-paused client is not offered <work>`; `shared competitor still collected while one tracker is workable`; `not collected when every tracker is spend-paused`; `seat count (countActiveClients) unchanged by a spend pause`; `approved brief still delivered`; `request_rank_scan / manual rival search / prospect snapshot / retailor refuse with S1`; `S1 has no $ or product name`.
**Done when:** focused runs of each touched test file (`pnpm --filter @cs/collectors exec vitest run due self tracked scan map-refresh`, `cd packages/engine && npx vitest run alerts briefs moves runbook score sweep`, `pnpm --filter @cs/tools exec vitest run rank-scan rival competitors prospects runbooks`, `pnpm --filter @cs/ask exec vitest run starters`, `pnpm --filter @cs/billing exec vitest run access`), `pnpm test:affected`.

### Task 9: `runSpendGuard` client part, job, notices
**Goal:** Hourly reached/pause/lift/rollover with one agency email and one staff email per pause (spec d5, d6, d14, §5).
**Files:** create `packages/tools/src/spend-guard.ts` (+ test), export from `index.ts`; create `apps/worker/src/jobs/spend-guard.ts` (+ test); modify `apps/worker/src/{main,deps}.ts`, `apps/worker/src/jobs/billing-notices.ts` (+ test); `packages/email/src/{types,render,index}.ts`, `templates/agency-client-billing-notice.tsx`, create `templates/platform-spend-alert.tsx` (+ tests).
**Interfaces:**
```ts
export interface SpendGuardDeps { service: Db; now?: () => Date; appUrl: string; platformAdmins: string[];
  sendStaffEmail(to: string, p: PlatformSpendAlertPayload): Promise<void> }
export interface SpendGuardSummary { reached: number; paused: number; lifted: number; rolledOver: number; spike: AiGuardState['state'] }
export async function runSpendGuard(deps: SpendGuardDeps, now: Date): Promise<SpendGuardSummary>;
export type PlatformSpendAlertPayload = { kind: 'client_paused' | 'spike_warn' | 'spike_paused'; title: string; lines: string[]; url: string };
// email: AgencyClientBillingNoticeKind += 'client_spend_paused' (props + until?: string); template 'platform_spend_alert' { branding, ...payload }
```
**Behaviour (client part, steps 1–2; spike = Task 10):**
1. Rollover: `UPDATE client SET spend_paused_at = NULL WHERE spend_paused_at < monthStart RETURNING id, agency_id` → `client_unpaused` rows (note `'month rollover'`).
2. Guarded clients = `archived_at IS NULL AND status IN ('active','prospect')`; spend via `spendByClient` (Task 3); limit via `effectiveLimitUsd`; threshold via `pauseThresholdUsd`.
   - spend ≥ limit → `INSERT … ON CONFLICT (client_id, kind, month) WHERE kind IN ('client_reached','client_paused') DO NOTHING` (`client_reached`).
   - spend ≥ threshold → in one tx: insert `client_paused` (same conflict clause, `RETURNING id`); `UPDATE client SET spend_paused_at = now WHERE id = $1 AND spend_paused_at IS NULL`; **only when the event row was inserted**: `billing_notice` (`audience 'agency'`, `kind 'client_spend_paused'`, `params { clientName, until }`, `dedupe_key 'spend_paused:<client>:<YYYY-MM>'`, `ON CONFLICT DO NOTHING`) and, after commit, staff emails (owner|staff via `platformOperatorEmails`, best-effort like `platform/costs/alerts.ts`).
   - `spend_paused_at` set and spend < threshold → lift (`client_unpaused`, note `'under threshold'`).
3. Never touches `paused_at`/`paused_by`/billing. Idempotent: the unique index is the race guard.
- Job `spend-guard`: `cron '7 * * * *'`, `queue: { policy: 'short', retryLimit: 1 }`, skipped in DEMO/TEST env (pattern `jobs/platform-costs.ts`); returns the summary.
- `billing-notices.ts`: add `client_spend_paused` to `AGENCY_CLIENT_KINDS`; button URL `${appUrl}/agency/settings/usage`.
- **Copy (owner sign-off):** C6 subject "{Client}: AI work paused until {date}", body C2: "AI work for {Client} is paused until {1st of next month} — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit.", button "Open usage". **C9** staff (USD allowed): subject "{Client} ({Agency}) paused for spend", line "{Client} used {$spend} of its {$limit} limit this month (pause at {pct} %). Raise the limit on the agency page or it lifts on {date}." Dates: "November 1" style, UTC.
**Tests (TDD):** `reached once per month`; `paused at 130 %: event, notice, staff email, spend_paused_at`; `second run: no new event/notice/email`; `two concurrent runs: one event, one notice` (Promise.all); `rollover clears last month's pause`; `limit raised outside the tool → lifted next run`; `archived clients ignored, prospect guarded`; `paused_at/paused_by unchanged`; `C6 has no $ or product name in subject/body`; job skipped in TEST.
**Done when:** `pnpm --filter @cs/tools exec vitest run spend-guard`, `pnpm --filter @cs/worker exec vitest run spend-guard billing-notices`, `pnpm --filter @cs/email exec vitest run agency-client platform-spend jsx-pragma`, `pnpm test:affected`.

### Task 10: Spike guard, state, snooze, guard tools
**Goal:** Hourly per-vendor and total AI spike check with warn/pause, staff reset and snooze (spec d9–d12).
**Files:** modify `packages/tools/src/spend-guard.ts` (+ test); create `packages/tools/src/tools/spend-guard.ts` (+ test); modify `tools/all.ts`, `access-marks.test.ts`, `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`.
**Interfaces:**
```ts
export type SpikeScope = 'total' | 'openrouter' | 'anthropic';
export const SPIKE_PROVIDERS: Record<Exclude<SpikeScope, 'total'>, readonly string[]> = { openrouter: ['openrouter', 'llm'], anthropic: ['anthropic'] };
export interface SpikeReading { scope: SpikeScope; observedUsd: number; baselineUsd: number; ratioPercent: number; floorOnly: boolean }
export async function readSpikes(db: Db, now: Date, s: SpendGuardSettings): Promise<SpikeReading[]>;
// tools (all permission 'agency' + requirePlatformOperator, supportHidden, audit 'skip-web' + withPlatformAudit, web only)
get_spend_guard (viewer, read): {} → { settings, state: AiGuardState, scopes: SpikeReading[], pausedClients: { clientId, clientName, agencyId, agencyName, spendPausedAt, spendUsd, limitUsd }[], events: SpendGuardEventView[] /* last 50 */ }
get_ai_guard_state (viewer, read): {} → AiGuardState
update_spend_guard_settings (owner, write): SpendGuardSettings.partial() → SpendGuardSettings  // merged result must pass the refine
reset_ai_pause (staff, write): { note: z.string().trim().min(1).max(200) } → AiGuardState
```
**Baseline math (full; `total` = every `llm_call` provider except `SPEND_GUARD_EXCLUDED_PROVIDERS`; vendor scopes = `SPIKE_PROVIDERS`; `vendor_call` never):**
```ts
const H = 3_600_000, D = 24 * H;
const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());       // today 00:00 UTC
const observed = await sumLlm(scope, now.getTime() - D, now.getTime());                  // rolling 24 h
const n = await countClientServiceable(db);                                              // live N, all agencies incl. trials
const days = await clientsActiveByDay(db, day0 - 7 * D, day0);                           // Σ agency_daily_stat.clients_active per day, 7 full days
const clientDays7 = sum(days.values());
const historyOk = days.size >= 7 && clientDays7 > 0;
let rate = 0;
if (historyOk) {
  const rate7 = (await sumLlm(scope, day0 - 7 * D, day0)) / clientDays7;
  const wEnd = now.getTime() - 7 * D;                                                    // same 24 h window a week ago
  const wDay = isoDay(wEnd - 12 * H);                                                    // the window's midpoint day
  const wClients = days.get(wDay) ?? 0;
  const rateW = wClients > 0 ? (await sumLlm(scope, wEnd - D, wEnd)) / wClients : 0;
  rate = Math.max(rate7, rateW);
}
const baseline = Math.max(rate * n, s.spikeFloorUsdPerClientDay * n, s.spikeFloorUsdPerDay);
const ratioPercent = Math.round((observed / baseline - 1) * 100);
```
**State machine (inside `runSpendGuard`, step 3, after the client part):**
- `paused` stays `paused` (only `reset_ai_pause` clears it).
- Else take the highest-ratio scope: `≥ spikePausePercent` and not `snoozeUntil > now` → `paused` (`since`, `scope`, `observedUsd`, `baselineUsd`), event `spike_paused`, staff email C8.
- Else `≥ spikeWarnPercent` (snoozed pause-level readings included) → `warn`; event + email C7 only on entry from `ok`.
- Else `ok`, keeping `snoozeUntil`.
- `reset_ai_pause`: state `ok`, `snoozeUntil = now + spikeSnoozeHours`, `resetBy = ctx.userId`, event `spike_reset` (actor user, note). Warn re-arms at once (d12).
- **Copy (owner sign-off):** C7 "AI spend is {n}% above normal ({scope})." C8 "All AI calls are paused after a spend spike ({scope}). Queued work is waiting — reset on Health." Scope labels: total → "all providers", openrouter → "OpenRouter", anthropic → "Anthropic".
**Tests (TDD):** `cold start (< 7 days of stats) uses the floor only`; `per-client-day floor × N beats the daily floor`; `same-weekday window wins over a lower 7-day rate`; `jev and vendor_call excluded from observed`; `openrouter scope sums openrouter + llm`; `+200 % pauses and emails once`; `paused stays paused below threshold`; `reset → ok, snoozed 24 h, next run at +250 % gives warn not paused`; `warn emails only on entry`; `update_spend_guard_settings: staff refused, owner merges, invalid merge (pause ≤ warn) refused`; `reset note > 200 chars refused`; `viewer reads get_spend_guard but cannot reset`.
**Done when:** `pnpm --filter @cs/tools exec vitest run spend-guard access-marks`, `pnpm test:affected`.

### Task 11: Tenant UI — usage pages, badge, banners
**Goal:** Read-only credits for agencies, a client usage page, calm badges and pause banners (spec §4 Web, §5 copy).
**Files:** modify `apps/web/src/lib/format/money.ts` (+ test: `formatCredits`); `components/spend-badge.tsx` (+ test); `(app)/agency/settings/usage/page.tsx`, delete `actions.ts`, `limits-form.tsx`, `limits-form.test.tsx`; `(app)/agency/page.tsx` (+ `portfolio-billing.test.tsx`, help-agency tests' fixtures); create `(app)/c/[clientId]/settings/usage/page.tsx` (+ test); `components/shell/nav-items.ts` (client settings "Usage"), create `components/shell/spend-banner.tsx` (+ test), `components/shell/app-shell.tsx` (+ test); `help/copy/{agency,client}.ts`; create `docs/help/pages/client.settings.usage.{agency,client}.md`; `scripts/e2e-affected-rules.ts`; `e2e/workflow.spec.ts:67`.
**Interfaces:** `formatCredits(n: number): string` ("1,234 credits"); `SpendBadge({ credits }: { credits: SpendCredits })`; `SpendBanner({ items, audience }: { items: { clientId: string; name: string; until: string }[]; audience: 'agency' | 'client'; agencyName: string })`; route `/c/<id>/settings/usage`, help key `page:client.settings.usage`, `PageHeader` title "Usage".
**Behaviour:**
- Agency usage page: read via `get_usage` only; columns Client · Credits ("{used} of {limit}") · `SpendBadge` · Competitors · Questions; C1 note on `reached` rows; tiles "Near limit"/"Limit reached"/"Paused" counts; footnote `agencyLevelCredits` (all-scope users) and total. No inputs, no `WriteGuard` needed.
- Badge: `bg-muted-surface text-secondary` for every non-ok level, labels **"Near limit" / "Limit reached" / "Paused"**; ok shows only "{pct}%".
- Client usage page: `get_my_usage` (refusal → 404); credits bar + badge, C1 when `reached`, C3 when `paused`; questions block only when non-null. Nav tab "Usage" for agency roles and `client_owner`.
- Banners (`app-shell.tsx`, beside `BillingBanner`): agency admins only (not AMs) — C2 per paused client from `get_spend_status` (max 3 lines + "and {n} more"); client roles in `/c/<id>` — C3 for that client; never in support sessions' write paths (read-only banner is fine).
- **Copy (owner sign-off):** C1 "{Client} has used this month's credits. Nothing changes — monitoring, briefs and Ask carry on as normal." C2 (Task 9). C3 "Monitoring and new briefs are paused for the rest of this month. Your past briefs and evidence are still here, and your {agency} team has been told." Help copy/guides: draft text in credits (no "$", no "cap"), listed in the sign-off doc.
- e2e rules: `c/[clientId]/settings/usage/` → `@usage`; `spend-banner` → `@usage`, `@navigation`. Rewrite `workflow.spec.ts:67` to "usage shows credits and the near-limit badge (read-only)" (seed spend via the existing seed helper) and add a client-owner usage step.
**Tests (TDD):** `badge labels and calm classes for each level`; `formatCredits groups thousands`; `agency usage page renders credits, no $ anywhere` (render + `/\$/` check); `client usage page 404s for client_viewer`; `client_owner sees no questions block`; `admin banner lists paused clients, AM sees none`; `client banner shows C3`; `help/coverage.test.ts`, `copy-bundle`, `white-label-leak`, `terminology` pass; `e2e-affected.test.ts` passes.
**Done when:** `pnpm --filter @cs/web exec vitest run spend-badge spend-banner usage app-shell money coverage white-label terminology`, `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`, `pnpm --filter @cs/web e2e:affected`, `pnpm test:affected`.

### Task 12: Platform UI — spend guard panel, settings, limits editor, banner
**Goal:** Staff see and act on the guard; owners tune settings (spec §4 Web, d13).
**Files:** create `(platform)/platform/health/_components/spend-guard-panel.tsx` (+ test), modify `platform/health/page.tsx`, create `platform/health/actions.ts` (`resetAiPauseAction`); create `platform/costs/_components/spend-guard-settings.tsx` (+ test), modify `platform/costs/{page,actions}.tsx|ts`; create `platform/agencies/[id]/client-limits.tsx` (+ test), modify `agencies/[id]/{page,actions}.tsx|ts`; modify `(platform)/layout.tsx` (+ `layout.test.tsx`) for the banner; `help/copy/platform.ts`; `scripts/e2e-affected-rules.ts`.
**Behaviour:**
- Health page adds a **Spend guard** card (`get_spend_guard`): state `StatusChip` (calm tones), per-scope table (observed / baseline USD, ratio %, "floor" marker), paused clients (agency link), last 50 events. **Reset** (staff+) opens `ConfirmDialog` with a required note (1–200) → `runTool('reset_ai_pause')`; viewers see no button.
- Costs page (owner only, as today) adds **Limits & spike guard**: the eight settings with `SaveBar` → `runTool('update_spend_guard_settings', changedFieldsOnly)`; shows "100 credits = $1".
- Agency detail: **Client limits** table (`get_client_limits`): spend USD, effective limit, override input (blank = default), competitor limit, Ask quota, level chip; row save → `runTool('set_client_limits')`; "lifted" toast copy "Pause lifted." Staff+ only; viewers read-only (`WriteGuard`).
- Platform layout: banner for every operator role from `get_ai_guard_state`: C7 when `warn`, C8 when `paused` (calm, not red).
**Tests (TDD):** `viewer sees panel without Reset`; `reset requires a note`; `settings form sends only changed fields`; `limits editor clears an override with blank`; `layout shows C8 when paused, nothing when ok`; e2e rules test.
**Done when:** `pnpm --filter @cs/web exec vitest run spend-guard client-limits health costs agencies layout`, `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`, `pnpm --filter @cs/web e2e:affected`, `pnpm test:affected`.

### Task 13: Retry/cost leaks (M-c)
**Goal:** Close the PDF, move-recommendation and Anthropic batch leaks (spec §6 item 11).
**Files:** create `packages/db/migrations/<n+2>_retry_backoff.sql` (plain `generate --name=retry_backoff`); modify `packages/db/src/schema/{model-ops,engine}.ts`; `packages/engine/src/{briefs/pdf,reports/quarterly,briefs/recommendations,model-ops/batches,reviews/discovery}.ts` (+ tests).
**SQL** (generated; verify):
```sql
ALTER TABLE "model_batch" ALTER COLUMN "provider_batch_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "move" ADD COLUMN "rec_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "move" ADD COLUMN "rec_retry_after" timestamp with time zone;
```
**Interfaces:** `ModelBatchStatus = 'pending' | 'submitted' | 'ended' | 'failed'`; `PDF_RETRY_HOURS(h: number): boolean`; `MOVE_REC_MAX_ATTEMPTS = 5`; `BATCH_PENDING_STALE_MINUTES = 60`.
**Behaviour:**
- **PDF (Decision 6):** `listBriefsMissingPdf`/`listReportsMissingPdf` keep the 7-day window and filter in JS: `h = Math.floor((now − sentAt) / 3_600_000)`; enqueue iff `h >= 1 && (h & (h − 1)) === 0`.
- **Moves (Decision 5):** `recommendForMoves` selects only moves with `rec_retry_after IS NULL OR rec_retry_after <= now` and `rec_attempts < 5`; on throw or "verifier kept nothing": `rec_attempts + 1`, `rec_retry_after = now + min(2^(attempts−1), 16) days`; success clears both.
- **Batch (Decision 7):** `submitTopicDiscoveryBatch` inserts the row `status 'pending'`, `provider_batch_id NULL` first; submit; then `UPDATE … SET provider_batch_id, status 'submitted'`; a submit throw marks the row `failed` and throws `BatchSubmitError` as today; an update failure keeps today's "submitted but not recorded" error. `collectModelBatches`: per batch, after `collectBatch` ends, one transaction: `SELECT … FOR UPDATE` the row, skip unless `status = 'submitted'`, apply items with `tx`, mark `ended`. Before polling: `pending` older than 60 min → `failed` (`error 'orphaned before submit'`). `applyTopicProposal` takes `Db | Tx`.
**Tests (TDD):** `PDF re-enqueued at 1,2,4,8 h, not at 3 or 5 h`; `move rec failing twice waits 1 then 2 days`; `stops after 5 attempts`; `success clears backoff`; `pending row exists before submit and becomes submitted`; `submit throw marks the row failed`; `re-applying an ended batch creates no second proposal`; `stale pending swept to failed`.
**Done when:** `cd packages/engine && npx vitest run pdf quarterly recommendations batches discovery`, `pnpm --filter @cs/db exec vitest run model-ops engine`, generate = no changes, `drizzle-kit check`, `pnpm test:affected`.

### Task 14: Prospect cooldown + attribution
**Goal:** A re-run within 24 h is refused; a prospect's GBP/ads pulls are attributed to it (spec §6 item 12; backlog 5b-2 Minor 3).
**Files:** modify `packages/tools/src/{limits.ts, tools/prospects.ts}` (+ test); `packages/collectors/src/prospect/snapshot.ts` (+ test); `apps/worker/src/deps.ts` (`runSource`); `packages/collectors/src/{gbp/collect-gbp,ads/google,ads/meta}.ts` (optional scope param).
**Interfaces:** `PROSPECT_SNAPSHOT_COOLDOWN_HOURS = 24`; `ProspectSnapshotDeps.runSource(competitorId: string, source: SnapshotSource, scope?: CallScope): Promise<{ status: string }>`; `WorkerDeps.runSource` same; collectors' `collectGbpProfile`/`collectGoogleAds`/`collectMetaAds` accept `scope?: CallScope` (default the Task 3 competitor scope).
**Behaviour:** `run_prospect_snapshot` (inside its locked tx) refuses when a `ready` report was created < 24 h ago (failed/running don't count) with `ToolError('invalid_input', P1, { userFacing: true })`. `runProspectSnapshot` passes `{ agencyId: c.agencyId, clientId }` to every `runSource` call, so its pulls are client-attributed (no competitor split). **P1 (owner sign-off):** "This business had a snapshot in the last 24 hours — try again tomorrow."
**Tests (TDD):** `second snapshot within 24 h refused with P1`; `after a failed run it is allowed`; `after 24 h allowed`; `prospect gbp/ads ledger rows carry the prospect's client_id and no competitor_id`; `regular collection still ledgers competitor_id`.
**Done when:** `pnpm --filter @cs/tools exec vitest run prospects`, `pnpm --filter @cs/collectors exec vitest run snapshot gbp ads`, `pnpm --filter @cs/worker exec vitest run deps`, `pnpm test:affected`.

### Task 15: Ask true AbortSignal
**Goal:** The 90 s turn deadline actually stops model calls (backlog 7a; spec §5 Ask deadline).
**Files:** modify `packages/ai/src/{chat,http,openrouter,ai}.ts` (+ `http.test.ts`, `ai.test.ts`); `packages/ask/src/turn.ts` (+ `turn.test.ts`), `packages/ask/src/testing.ts` if its fake must honour the signal.
**Interfaces:** `ChatRequest.signal?: AbortSignal`; `Ai.chatWithTools(task, req: { messages; tools; toolChoice?; signal?: AbortSignal }, scope)`; `postJson(provider, url, body, headers, deps, timing?, signal?)`.
**Behaviour:**
```ts
// http.ts, per attempt
const s = signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs);
// on fetch error: if (signal?.aborted) throw new AiProviderError(provider, null, `${provider} call aborted`, false, { cause: err }); — no retry, no sleep
// before each retry sleep: if (signal?.aborted) throw the same
```
- `turn.ts`: one `AbortController`; `setTimeout(abort, deadlineMs − min(FINAL_CALL_RESERVE_MS, deadlineMs / 2) − elapsed)` cleared in `finally`; non-final calls pass `ac.signal`; the forced final call passes `AbortSignal.timeout(FINAL_CALL_RESERVE_MS)` (its own). An aborted non-final call ⇒ `trace.deadlineHit = true` and the loop goes to the forced final call (no error copy). The aborted call is ledgered `ok: false`, `costUsd: null` by `runChat`'s catch (existing). Client disconnect does not abort (spec §7 default no).
**Tests (TDD):** `http: aborted signal stops without retry`; `http: timeout still retries`; `turn: a hanging tool-step call is aborted at deadline − reserve and the final call runs`; `final call has its own 45 s signal`; `aborted call ledgered ok false, cost null`.
**Done when:** `pnpm --filter @cs/ai exec vitest run http ai openrouter`, `pnpm --filter @cs/ask exec vitest run turn`, `pnpm test:affected`.

### Task 16: Docs
**Goal:** Hand-over docs, runbook and help finished; backlog closed (shared docs change only at merge).
**Files:** `docs/work/phase-7b1.md` (Status/Next, Interfaces added, decisions, **Owner verification** incl. the copy sign-off list R1, S1, P1, C1–C9, badges, help drafts); `docs/OPS.md` (new § "Spend guard": read `get_spend_guard`/Health; reset = Health → Reset with note (staff); raise a client limit = Platform → Agency → Client limits; SQL to inspect `spend_guard_event`, `client.spend_paused_at`, `platform_setting` `ai_guard_state`; manual unpause via `set_client_limits`, never SQL on `paused_at`); help: rewrite `docs/help/pages/agency.settings.usage.agency.md`, finalise `client.settings.usage.*`, update `platform.{health,costs,agencies.detail}.operator.md`, glossary entry "credits" in `packages/core/src/help/glossary.ts` (no placeholders) — all marked for owner sign-off; package gotchas: `packages/db/CLAUDE.md` (numeric mode, `competitor_id` + O11, `spend_guard_event` service-only, `clientWorkAllowed`), `packages/tools/CLAUDE.md` (replace the `get_usage` "allocating it is Phase 7" note; credits only on tenant channels), `packages/ai/CLAUDE.md` (guard, abort), `packages/engine/CLAUDE.md` (PDF power-of-two catch-up, move backoff, batch pending), `apps/worker/CLAUDE.md` (`usesAi`, defer/skip), `docs/gotchas-cross-cutting.md` (schedulers: `clientWorkAllowed` vs `clientServiceable`). Backlog lines to close at merge (list them in the work file with their BACKLOG.md text): enforce caps + allocate shared cost (5b-2 d18), prospect cooldown + attribution (5b-2 Minor 3), `cost_usd` numeric (Phase 1), Ask AbortSignal (7a), PDF re-enqueue (4b), move recs backoff (4a), Anthropic batch submit/apply (3d/4a); new backlog: confirm Jev price → lift d19 exclusion; buying extra credits (future).
**Done when:** `pnpm --filter @cs/web exec vitest run coverage` and `pnpm --filter @cs/core exec vitest run glossary` pass; work file ≤ 12 KB; `git ls-files --eol | grep crlf` prints nothing.
