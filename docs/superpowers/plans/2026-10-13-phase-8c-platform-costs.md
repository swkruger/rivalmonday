# Phase 8c — Platform hosting costs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Lean plan format (root `CLAUDE.md`): interfaces are binding; full code only for SQL, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** An owner-only `/platform/costs` page that tracks what the stack costs to run. Six API services are read daily, with low-balance warnings (a strip and an email); everything else is entered by hand as recurring or one-off costs.
**Architecture:** One small adapter per vendor (`packages/tools/src/platform/costs/adapters/`). A daily pg-boss job, `platform-costs-snapshot`, writes one snapshot row per service and evaluates alerts. Five owner-only `@cs/tools` tools feed the page, and "Refresh now" queues the same job.
**Tech stack:** TypeScript, Drizzle + Postgres (RLS), pg-boss 10, zod, Next.js App Router, React Email, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-13-phase-8c-platform-costs-design.md` (c1–c12; the spec wins on any conflict). Vendor contracts: `docs/research/2026-10-13-phase-8c-cost-apis.md`.

## Global constraints
- **Owners only:** every tool calls `requirePlatformOperator(deps, ctx, 'owner')` first; every tool is `supportHidden: true`; page refusals are 404.
- Web reads go through registered tools, and web writes go through `runTool`. The web app **never calls a vendor**: refresh only queues the job.
- Never log or store raw vendor bodies, keys, logins or emails. `error` is a short code string (≤ 120 chars): `HTTP 401`, `timeout`, `task 40201`, `bad response`.
- DataForSEO's balance always comes from `https://api.dataforseo.com` (ignore `DATAFORSEO_BASE_URL`, which may be the sandbox).
- Money is stored as `numeric`. Anthropic `amount` is a decimal string **in cents**: parse it per value with `Number(s)`, sum in integer-cent space (`Math.round(Number(s) * 100)` → hundredths of a cent), and divide at the end.
- `billingUrl` is zod `z.string().url().max(500).refine(u => u.startsWith('https://'))`, rendered with `target="_blank" rel="noopener noreferrer"`.
- New env vars `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID` go in `turbo.json` `globalPassThroughEnv`. **The owner sets them in `.env`; agents never edit `.env`.**
- Migration: the next free number (expect `0051`), via `pnpm --filter @cs/db generate --custom --name=platform_costs`. Never edit an applied migration.
- Every commit ends with the trailers in root `CLAUDE.md`. LF only.

## Decisions (from the spec; do not re-open)
c1 stacked on 8b · c2 owners only · c3 daily job + Refresh queues it · c4 6 services, 3 balance (OpenRouter, DataForSEO, ScrapeCreators) + 3 usage (Apify w/ cap, Anthropic, Neon) · c5 3 new env vars, unset key = Not configured · c6 manual recurring monthly/yearly + one-off, USD, archive-not-delete · c7 billing URL everywhere · c8 Low = below threshold OR days-left ≤ warnDays; uncapped usage never Low · c9 strip + email on newly-Low, `alerted_at` reset on recovery · c10 no renewal reminders · c11 burn rate over 14 days ignoring rises · c12 monthly spend approximation.

## File structure
```
packages/db/migrations/00NN_platform_costs.sql            (custom migration, SQL below)
packages/db/src/schema/platform-costs.ts                   (drizzle tables; export from schema/index.ts)
packages/tools/src/platform/costs/types.ts                 CostReading, CostEnv, ServiceKey, SERVICES meta
packages/tools/src/platform/costs/http.ts                  fetchJson with timeout → typed result
packages/tools/src/platform/costs/adapters/{openrouter,dataforseo,scrapecreators,apify,anthropic,neon}.ts (+ .test.ts, fixtures/)
packages/tools/src/platform/costs/math.ts (+ .test.ts)     pure: burnRate, daysLeft, serviceStatus, monthlySpend, manualMonthly
packages/tools/src/platform/costs/snapshot.ts (+ .test.ts) snapshotAll
packages/tools/src/platform/costs/alerts.ts (+ .test.ts)   evaluateAlerts, platformOwnerEmails
packages/tools/src/platform/costs/index.ts                 re-exports
packages/tools/src/tools/platform-costs.ts (+ .test.ts)    5 tools; registered in tools/all.ts
packages/tools/src/deps.ts                                 QueueJob += 'platform-costs-snapshot'
packages/email/src/templates/platform-cost-low.tsx (+ render.ts, types.ts)
apps/worker/src/jobs/platform-costs.ts (+ .test.ts); apps/worker/src/main.ts registration
apps/web/src/app/(platform)/platform/costs/{page.tsx,actions.ts,_components/*}
apps/web/src/app/(platform)/layout.tsx                     CostWarningStrip for owners
apps/web/src/components/shell/nav-items.ts                 'Costs' item (owners)
apps/web/e2e/platform-costs.spec.ts                        @costs
turbo.json                                                 3 env vars
```

## Dependencies on in-flight work (re-check in Task 0)
- 8b's `/platform` route group `app/(platform)/platform/**` and `(platform)/layout.tsx` (stacked base f666e79).
- `requirePlatformOperator`, `withPlatformAudit` (8a; `withPlatformAudit` is used in `tools/support.ts`).
- `ToolDefinition.supportHidden` and `access` (8b).
- Migrations 0049/0050 belong to 8b. If main has gained migrations by execution time, take the next free number.

## Review focus
1. **Owner gating everywhere.** A staff or viewer operator must get a 404 on the page, no nav link, no strip, and `permission_denied` from every tool, including `refresh_platform_costs`. (Tests in Tasks 6 and 7.)
2. **Secret hygiene.** An adapter error path, such as a vendor 401 whose body echoes the key or login, must never put a body, key or email into `error`, a log line or the DB. (Tests in Tasks 2 and 3: a fixture body containing a fake key, asserted absent from the result and from console spies.)
3. **Partial outages.** One vendor timing out or returning garbage must not stop the others or the alerts. (Task 5.)
4. **Alert storms.** The email must not repeat daily while a service stays Low; Error and Unavailable statuses must neither clear nor set `alerted_at`. (Task 5.)
5. **Monthly maths around top-ups and partial months.** A top-up mid-month must not count as negative spend; a yearly cost started on the 20th counts its full ÷ 12 for that month (it's "active on any day"). (Task 4.)

---

### Task 0: Pre-flight
**Goal:** Confirm the base and the env vars, live-verify Neon's field names, and fix the plan if needed.
- `git log --oneline -1` is a descendant of f666e79. If phase-8/8b have merged to main by now: `git rebase main`, and re-check the migration number.
- Check the presence (not the values) of `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY` and `NEON_ORG_ID` with `grep -c '^NEON_API_KEY=.' .env`. If any is missing: proceed; the adapter ships against the documented v2 names, and you log a work-file line "Neon/Anthropic not live-verified".
- If the Neon key is present: make one read-only call (key read into a shell variable, never printed) to `GET https://console.neon.tech/api/v2/consumption_history/v2/projects?org_id=$ORG&from=<1st of month>T00:00:00Z&to=<now>&granularity=daily&metrics=compute_unit_seconds`. Record only the **key paths** (not values) of the response in the research doc's §6, and adjust Task 3's Neon schema.
- Conflict-scan this plan against the code: the `tools/all.ts` registration shape, the `EmailPayload` union in `packages/email/src/types.ts`, and the `nav-items.ts` flags.
**Done when:** a ledger note lists the outcomes; the plan has been edited if anything changed.

---

### Task 1: Schema + migration
**Goal:** Three tables, service-role only, with 6 seeded service rows.
**Files:** create `packages/db/migrations/00NN_platform_costs.sql`, `packages/db/src/schema/platform-costs.ts`; modify `packages/db/src/schema/index.ts`; test `packages/db/src/platform-costs.test.ts`.
**Follow pattern:** `packages/db/src/schema/support.ts`, and migration 0050 for the RLS and grant style. Read 0049/0050 and copy their exact grant and role statements, substituting the table names.
**SQL (binding; adapt only the grant lines to mirror 0050):**
```sql
create table platform_cost_service (
  service text primary key check (service in ('openrouter','dataforseo','scrapecreators','apify','anthropic','neon')),
  enabled boolean not null default true,
  billing_url text,
  low_threshold_usd numeric(12,2),
  warn_days integer not null default 7 check (warn_days between 0 and 90),
  unit_rate_usd numeric(14,8),
  alerted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table platform_cost_snapshot (
  id uuid primary key default gen_random_uuid(),
  service text not null references platform_cost_service(service),
  taken_at timestamptz not null default now(),
  status text not null check (status in ('ok','error','unavailable')),
  kind text not null check (kind in ('balance','usage')),
  amount_usd numeric(14,4),
  units numeric(20,4),
  cap_usd numeric(14,4),
  error text check (length(error) <= 120)
);
create index platform_cost_snapshot_service_taken_idx on platform_cost_snapshot (service, taken_at desc);
create table platform_cost_item (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('recurring','one_off')),
  amount_usd numeric(12,2) not null check (amount_usd >= 0),
  period text check (period in ('monthly','yearly')),
  starts_on date not null,
  ends_on date,
  billing_url text check (length(billing_url) <= 500),
  notes text check (length(notes) <= 500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null,
  constraint platform_cost_item_period_ck check ((kind = 'recurring') = (period is not null)),
  constraint platform_cost_item_oneoff_ck check (kind = 'recurring' or ends_on is null),
  constraint platform_cost_item_dates_ck check (ends_on is null or ends_on >= starts_on)
);
alter table platform_cost_service enable row level security;  alter table platform_cost_service force row level security;
alter table platform_cost_snapshot enable row level security; alter table platform_cost_snapshot force row level security;
alter table platform_cost_item enable row level security;     alter table platform_cost_item force row level security;
-- no policy for the app role; grants mirror support_session in 0050 (service role only)
insert into platform_cost_service (service, billing_url) values
  ('openrouter','https://openrouter.ai/settings/credits'),
  ('dataforseo','https://app.dataforseo.com/billing'),
  ('scrapecreators','https://app.scrapecreators.com'),
  ('apify','https://console.apify.com/billing'),
  ('anthropic','https://platform.claude.com/settings/billing'),
  ('neon','https://console.neon.tech/app/billing');
```
**Interfaces:** Drizzle exports `platformCostService`, `platformCostSnapshot`, `platformCostItem` (camelCase columns; `numeric` columns as `numeric({ mode: 'number' })` if the repo's drizzle version supports it, else string, converted at the read boundary). If `truncateAll` in `@cs/db/test-helpers` truncates every table, make sure it **re-seeds or skips** `platform_cost_service` (tests in Tasks 5–6 need the 6 rows): add a `seedPlatformCostServices(db)` helper to test-helpers and call it where needed.
**Tests:**
- `app role cannot select any of the three tables` (0 rows or permission error, matching how 0050 is tested)
- `service role sees the 6 seeded services with default billing URLs`
- `item checks reject a recurring cost without a period, a one-off with ends_on, and ends_on < starts_on`
**Done when:** `pnpm --filter @cs/db exec vitest run platform-costs` passes; `pnpm --filter @cs/db typecheck` passes.

---

### Task 2: Balance adapters (OpenRouter, DataForSEO, ScrapeCreators) + shared types
**Goal:** Pure-ish readers that turn a vendor response into a `CostReading`.
**Files:** create `costs/types.ts`, `costs/http.ts`, `costs/adapters/{openrouter,dataforseo,scrapecreators}.ts` + tests + `costs/adapters/fixtures/*.json`.
**Interfaces (binding):**
```ts
export type ServiceKey = 'openrouter'|'dataforseo'|'scrapecreators'|'apify'|'anthropic'|'neon';
export type CostEnv = Partial<Record<'OPENROUTER_API_KEY'|'DATAFORSEO_LOGIN'|'DATAFORSEO_PASSWORD'|'SCRAPECREATORS_API_KEY'|'APIFY_TOKEN'|'ANTHROPIC_ADMIN_KEY'|'NEON_API_KEY'|'NEON_ORG_ID', string>>;
export interface CostReading { status: 'ok'|'error'|'unavailable'|'not_configured'; kind: 'balance'|'usage'; amountUsd?: number; units?: number; capUsd?: number; error?: string }
export type CostAdapter = (env: CostEnv, fetchImpl: typeof fetch, now: Date) => Promise<CostReading>;
export const SERVICES: Record<ServiceKey, { label: string; kind: 'balance'|'usage'; unit?: 'credits'|'CU-hours' }>;
// labels: OpenRouter, DataForSEO, ScrapeCreators, Apify, Anthropic, Neon
// http.ts
export async function fetchJson(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs = 15000):
  Promise<{ ok: true; body: unknown } | { ok: false; error: string; status?: number }>;
```
**Behaviour:**
- `fetchJson`: `AbortSignal.timeout(timeoutMs)`. Non-2xx → `{ ok:false, error:'HTTP <status>', status }` **without reading or including the body**. Abort → `'timeout'`. JSON parse failure → `'bad response'`. Any other throw → `'network error'`.
- Each adapter validates the body with a small zod schema (`.passthrough()` not needed; pick fields only). A schema failure → `{ status:'error', error:'bad response' }`.
- Missing key(s) → `{ status:'not_configured', kind }` with no fetch made.
- openrouter: `GET https://openrouter.ai/api/v1/credits`, `Authorization: Bearer`, amount = `total_credits - total_usage`.
- dataforseo: `GET https://api.dataforseo.com/v3/appendix/user_data`, Basic auth. Requires top-level `status_code === 20000` and `tasks[0].status_code === 20000`, else `error: 'task <code>'`. amount = `tasks[0].result[0].money.balance`.
- scrapecreators: `GET https://api.scrapecreators.com/v1/credit-balance`, `x-api-key`. `units = creditCount`, no `amountUsd` (the rate is applied in `snapshotAll`).
**Tests (each adapter, with an injected `fetchImpl` stub):**
- `ok fixture → exact amount/units`
- `401 → error 'HTTP 401'`
- `timeout → 'timeout'` (stub that respects `signal`)
- `malformed → 'bad response'`
- `missing env → not_configured and fetch not called`
- `error body containing 'sk-fake-123' never appears in the result or console` (spy on `console.*`)
- dataforseo: `task 40201 → 'task 40201'`; `uses the production host even if DATAFORSEO_BASE_URL is the sandbox`
**Done when:** `pnpm --filter @cs/tools exec vitest run costs/adapters` passes.

---

### Task 3: Usage adapters (Apify, Anthropic, Neon)
**Goal:** Month-to-date usage readers.
**Files:** create `costs/adapters/{apify,anthropic,neon}.ts` + tests + fixtures.
**Interfaces:** `CostAdapter` from Task 2.
**Behaviour:**
- apify: `GET https://api.apify.com/v2/users/me/limits`, Bearer. `amountUsd = data.current.monthlyUsageUsd`, `capUsd = data.limits.maxMonthlyUsageUsd`.
- anthropic: `GET https://api.anthropic.com/v1/organizations/cost_report?starting_at=<YYYY-MM-01T00:00:00Z of now UTC>&bucket_width=1d&limit=31`, headers `x-api-key`, `anthropic-version: 2023-06-01`. Follow `next_page` while `has_more` (cap at 3 pages). `amountUsd` = Σ over all `data[].results[].amount` (cents strings) ÷ 100. Sum in hundredths of a cent:
  ```ts
  const hundredths = results.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
  const amountUsd = hundredths / 10000;
  ```
  A non-numeric `amount` → `'bad response'`.
- neon: `GET https://console.neon.tech/api/v2/consumption_history/v2/projects?org_id=<NEON_ORG_ID>&from=<1st 00:00Z>&to=<now, floored to the hour>&granularity=daily&metrics=compute_unit_seconds&limit=100`, Bearer. Follow `pagination.cursor` (cap at 5 pages). `units` = Σ compute_unit_seconds ÷ 3600 (CU-hours, rounded to 4 dp), no `amountUsd`. HTTP 403 → `{ status:'unavailable' }`. Both `NEON_API_KEY` and `NEON_ORG_ID` are required, else `not_configured`. **The zod schema for the body uses the field paths Task 0 verified;** if unverified, use the documented v2 shape `projects[].periods[].consumption[].<metric>`, and accept a metric value either as a number or as `{ metric_name, value }` entries (the docs disagree).
**Tests:**
- `apify ok → amount and cap`
- `anthropic sums '123.45' + '0.55' → 1.24 exactly`
- `anthropic follows next_page`
- `anthropic starting_at is the 1st of now's UTC month` (now = 2026-10-01T00:30Z and 2026-12-31T23:59Z)
- `neon 403 → unavailable`
- `neon sums seconds across projects and pages → CU-hours`
- `neon missing org id → not_configured`
- 401 / timeout / malformed / secret-in-body cases, as in Task 2
**Done when:** `pnpm --filter @cs/tools exec vitest run costs/adapters` passes.

---

### Task 4: Cost maths (pure)
**Goal:** Burn rate, days left, status, monthly spend; fully unit-tested.
**Files:** create `costs/math.ts`, `costs/math.test.ts`.
**Interfaces (binding):**
```ts
export interface SnapPoint { takenAt: Date; status: 'ok'|'error'|'unavailable'; amountUsd: number | null; capUsd: number | null }
export interface ManualItem { kind: 'recurring'|'one_off'; amountUsd: number; period: 'monthly'|'yearly'|null; startsOn: string; endsOn: string | null; archivedAt: Date | null }
export type ServiceStatus = 'ok'|'low'|'error'|'unavailable'|'not_configured'|'disabled';
export function burnRate(points: SnapPoint[], now: Date): number | null;      // USD/day, balance services
export function daysLeft(balanceUsd: number, rate: number | null): number | null;
export function serviceStatus(args: { enabled: boolean; configured: boolean; kind: 'balance'|'usage'; latest: SnapPoint | null; lowThresholdUsd: number | null; warnDays: number; rate: number | null }): ServiceStatus;
export function monthlySpend(kind: 'balance'|'usage', points: SnapPoint[], month: string /* YYYY-MM */): number;
export function manualMonthly(items: ManualItem[], month: string): number;
export function monthKeys(now: Date, count: number): string[]; // oldest → newest, UTC, includes the current month
```
**Algorithms (binding):**
```ts
// burnRate: OK points with a non-null amount in (now - 14d, now], sorted by takenAt ascending
//   drops = Σ max(0, prev.amount - cur.amount) over consecutive pairs   (rises = top-ups → 0)
//   span  = (last.takenAt - first.takenAt) in days
//   fewer than 2 points, or span < 0.5 days, or drops == 0 → null; else drops / span
// daysLeft: rate null or <= 0 → null; else Math.floor(balance / rate)
// serviceStatus precedence: !enabled → 'disabled'; !configured → 'not_configured';
//   latest null → 'not_configured'; latest.status 'error' → 'error'; 'unavailable' → 'unavailable';
//   remaining = kind==='balance' ? latest.amount : (latest.cap != null ? latest.cap - latest.amount : null)
//   remaining == null → 'ok' (uncapped usage never Low)
//   (lowThreshold != null && remaining < lowThreshold) || (dl != null && dl <= warnDays) → 'low' else 'ok'
//   where dl = kind==='balance' ? daysLeft(remaining, rate) : null
// monthlySpend: OK points with an amount inside the UTC month
//   usage   → amount of the latest such point (0 if none)
//   balance → Σ max(0, prev - cur) over consecutive pairs inside the month (0 if < 2)
// manualMonthly: non-archived items, plus archived items (archiving only hides them; history still counts)
//   recurring active on any day of the month (starts_on <= monthEnd && (ends_on null || ends_on >= monthStart))
//     → monthly ? amount : amount / 12
//   one_off with starts_on inside the month → amount
//   result rounded to 2 dp
```
**Tests:**
- `burnRate ignores a top-up between two drops`
- `burnRate null with one point / zero drops / span under 12h`
- `burnRate only uses the last 14 days`
- `daysLeft floors; null on a zero rate`
- `status: disabled > not_configured > error > unavailable precedence`
- `status low by threshold`; `low by days left`; `apify low when cap - usage < threshold`; `anthropic usage without cap never low`
- `monthlySpend usage takes the latest point in the month`; `balance month across a top-up counts only drops`
- `manualMonthly: yearly ÷ 12; recurring that started on the 20th counts in full; ended last month excluded; one-off in or out of month; archived still counted for history`
- `monthKeys(2026-01-15, 6)` → `['2025-08', …, '2026-01']`
**Done when:** `pnpm --filter @cs/tools exec vitest run costs/math` passes.

---

### Task 5: Snapshot run, alerts, email, worker job
**Goal:** The daily job that stores readings and sends low-balance emails.
**Files:** create `costs/snapshot.ts`, `costs/alerts.ts`, `costs/index.ts` (+ tests), `packages/email/src/templates/platform-cost-low.tsx`, `apps/worker/src/jobs/platform-costs.ts` (+ test); modify `packages/email/src/{render.ts,types.ts}`, `packages/tools/src/index.ts` (export), `packages/tools/src/deps.ts` (`QueueJob` += `'platform-costs-snapshot'`), `apps/worker/src/main.ts`, `turbo.json`.
**Follow pattern:** `apps/worker/src/jobs/platform-stats.ts` (job), `apps/web/src/server/support-email.ts` (best-effort email, no PII in logs), `packages/email/src/templates/support-session-started.tsx`.
**Interfaces (binding):**
```ts
export const ADAPTERS: Record<ServiceKey, CostAdapter>;
export interface SnapshotDeps { service: Db; env: CostEnv; fetchImpl?: typeof fetch; now?: () => Date; platformAdmins: string[]; sendLowEmail: (to: string, p: PlatformCostLowPayload) => Promise<void>; appUrl: string }
export async function snapshotAll(deps: SnapshotDeps): Promise<{ written: number; statuses: Record<ServiceKey, CostReading['status'] | 'disabled'> }>;
export async function evaluateAlerts(deps: SnapshotDeps): Promise<{ emailed: ServiceKey[]; cleared: ServiceKey[] }>;
export async function platformOwnerEmails(deps: Pick<SnapshotDeps,'service'|'platformAdmins'>): Promise<string[]>; // env list ∪ active platform_admin role='owner' users' emails, lower-cased, deduped
export interface PlatformCostLowPayload { label: string; amountText: string; daysLeft: number | null; billingUrl: string | null; costsUrl: string }
```
**Behaviour:**
- `snapshotAll`: load the service rows. Skip `enabled=false` (status `disabled`). Run the adapters with `Promise.allSettled`; a rejected promise → `{ status:'error', error:'internal' }`. For `not_configured`, insert nothing. Otherwise insert one row: for scrapecreators and neon, `amount_usd = units * unit_rate_usd` when the rate is set (round to 4 dp), else null; `kind` comes from `SERVICES`. Then `evaluateAlerts`.
- `evaluateAlerts`, per enabled service: compute status from the latest snapshot plus `burnRate` over its last-14-day points.
  - `low` and `alerted_at` null → email every owner, then set `alerted_at = now` (set it even if some sends fail; log `[platform-costs] email failed for <service>` with no address or amount).
  - `ok` and `alerted_at` set → clear it.
  - `error`, `unavailable` or `disabled` → leave `alerted_at` unchanged.
- `amountText`: balance → `$12.34`; scrapecreators with no rate → `7,099 credits`; Apify → `$0.95 of $5.00 plan cap`.
- **Email copy (decided):**
  - subject `Rival Monday: low balance on {label}`
  - body text: `{label} is running low: {amountText} left{, about N days at the current rate}. Top up: {billingUrl}. See all costs: {costsUrl}`
  - when `billingUrl` is null, omit the ` Top up: …` sentence
  - plain template, Rival Monday brand (not agency-branded)
- Worker job `platform-costs-snapshot`: `cron: '0 6 * * *'`, `queue: { policy: 'short', expireInSeconds: 600, retryLimit: 1 }`, schema `z.looseObject({})`, `env` built from `process.env` (only the `CostEnv` keys), `sendLowEmail` via the worker's existing email sender (`createEmailSender` / `renderEmail`, from `EMAIL_FROM`), `appUrl` from `APP_URL`. Log only the `statuses` map.
- `turbo.json` `globalPassThroughEnv` += `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID`.
**Tests (test DB; adapters injected via `fetchImpl` stub routing by URL host):**
- `writes one row per configured enabled service; none for not_configured or disabled`
- `one adapter throwing does not stop the others`
- `scrapecreators amount uses unit_rate_usd; null when unset`
- `emails each owner once when a service newly turns low, and sets alerted_at`
- `no second email on the next run while still low`
- `recovery clears alerted_at and the next low emails again`
- `error snapshot neither sends nor clears`
- `send failure is swallowed and the log has no address or amount`
- `platformOwnerEmails = env list ∪ owner rows, excludes staff/viewer and revoked`
- email render: `platform-cost-low renders subject and body copy exactly; omits Top up when billingUrl null`
- worker: `job handler calls snapshotAll and returns statuses`
**Done when:** `pnpm --filter @cs/tools exec vitest run costs`, `pnpm --filter @cs/email exec vitest run platform-cost`, `pnpm --filter @cs/worker exec vitest run platform-costs` pass; `pnpm test:affected` green apart from known failures.

---

### Task 6: Tools
**Goal:** Five owner-only, support-hidden tools.
**Files:** create `packages/tools/src/tools/platform-costs.ts`, `.test.ts`; modify `packages/tools/src/tools/all.ts`; document the access marks in `docs/work/phase-8b-tool-access.md` if the 8b read-only guard test enumerates tools (follow whatever `read-only-guard`/registry tests require of new tools).
**Follow pattern:** `packages/tools/src/tools/support.ts` (`listAgencySupportSessions`: `requirePlatformOperator` + `withPlatformAudit`, `audit: 'skip-web'`, `permission: 'agency'`).
**Interfaces (binding):**
```ts
list_platform_costs   access:'read'  input z.object({})
  output { services: ServiceRow[]; items: CostItemRow[]; months: { month: string; apiUsd: number; manualUsd: number }[]; summary: { mtdUsd: number; projectedMonthUsd: number; lowCount: number }; refreshQueued: boolean }
  ServiceRow = { service: ServiceKey; label: string; kind: 'balance'|'usage'; unit: 'credits'|'CU-hours'|null; status: ServiceStatus; amountUsd: number|null; units: number|null; capUsd: number|null; daysLeft: number|null; takenAt: string|null; error: string|null; billingUrl: string|null; lowThresholdUsd: number|null; warnDays: number; unitRateUsd: number|null; enabled: boolean }
  CostItemRow = { id: string; name: string; kind: 'recurring'|'one_off'; amountUsd: number; period: 'monthly'|'yearly'|null; monthlyUsd: number|null; startsOn: string; endsOn: string|null; billingUrl: string|null; notes: string|null }   // non-archived only, ordered by name
refresh_platform_costs        access:'write' input z.object({}) → { queued: boolean }
update_platform_cost_service  access:'write' input { service: ServiceKey; enabled?: boolean; billingUrl?: Url|null; lowThresholdUsd?: number(0..1e6)|null; warnDays?: int(0..90); unitRateUsd?: number(0..1000)|null } → { ok: true }
save_platform_cost_item       access:'write' input { id?: uuid; name: string(trim 1..80); kind; amountUsd: number(0..1e7, 2dp); period?: 'monthly'|'yearly'; startsOn: 'YYYY-MM-DD'; endsOn?: 'YYYY-MM-DD'|null; billingUrl?: Url|null; notes?: string(≤500)|null } → { id }
archive_platform_cost_item    access:'write' input { id: uuid } → { ok: true }
```
**Behaviour:**
- Every handler: `const role = await requirePlatformOperator(deps, ctx, 'owner')`, then `withPlatformAudit(deps, ctx, { tool, input, role }, …)`. Every tool has `supportHidden: true`.
- `configured` per service = whether `deps.costEnvPresent?.[service]` is true. Add the optional `costEnvPresent?: Partial<Record<ServiceKey, boolean>>` to `ToolDeps`; web builds it from `process.env` key presence only. When it's absent, treat the service as configured if it has any snapshot.
- `list` computes everything with Task 4 maths. `months = monthKeys(now, 6)`. `apiUsd` = Σ over services of `monthlySpend`. `mtdUsd` = current month api + manual. `projectedMonthUsd = round2(apiMtd / elapsedDays * daysInMonth + manualMonth)`, where elapsedDays = days since the 1st (fractional, min 1). `refreshQueued` = `jobStatusOf(deps)('platform-costs-snapshot','platform-costs')` state ∈ {created, retry, active}; if `jobStatus` isn't configured → false.
- `refresh` uses `enqueueOf(deps)('platform-costs-snapshot', {}, 'platform-costs')`. If the status is already queued or active → `{ queued:false }` without enqueueing.
- `save` with `kind:'one_off'` and a `period` or `endsOn` → zod error. Recurring without a `period` → zod error. `endsOn < startsOn` → zod error. An `id` that's unknown or archived → `not_found`. `created_by = ctx.userId`.
- `archive` sets `archived_at = now()`; unknown or already archived → `not_found`.
**Tests:**
- `owner can list; staff, viewer and non-operator → permission_denied (all 5 tools)`
- `support ctx → not_found and hidden from list` (via the registry)
- `list returns 6 services incl. not_configured with null amounts`
- `list summary and months match seeded snapshots and items`
- `refresh enqueues once; second call while queued → queued:false`
- `update rejects an http: billingUrl`; `save rejects a one-off with a period`; `rejects endsOn < startsOn`; `archive hides the item from list but keeps it in months`
- `audit row written per call with role owner`
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-costs` and the registry/read-only-guard tests pass.

---

### Task 7: Web page, nav, warning strip
**Goal:** `/platform/costs` for owners, a Costs nav item and the strip.
**Files:** create `apps/web/src/app/(platform)/platform/costs/{page.tsx,actions.ts}`, `_components/{summary-cards,services-table,service-settings-dialog,cost-items-table,cost-item-dialog,monthly-chart,cost-warning-strip}.tsx` (+ component tests); modify `(platform)/layout.tsx`, `components/shell/nav-items.ts` (flag `isPlatformOwner`, item `account('/platform/costs', 'Costs', 'costs')` after Health), the web `ToolDeps` builder: add `costEnvPresent` (env key presence only); check that `enqueue` and `jobStatus` are wired, and wire them if not.
**Follow pattern:** `/platform/health/page.tsx` (operator page via tools), `/platform/knowledge` (dialogs + server actions via `runTool`), `_components/overview-charts.tsx` (inline SVG, dataviz palette), `components/support-banner.tsx` (strip styling).
**Behaviour:**
- The page calls `list_platform_costs`. `permission_denied` → `notFound()`. Layout: `max-w-[1560px]`.
- Summary cards: "Spent this month", "Projected this month", "Warnings" (the count; amber when > 0).
- Services table columns: Service (the name links to `billingUrl`, new tab), Status badge, Balance / usage (balance `$12.34`; scrapecreators `7,099 credits` plus `≈ $x` when there's a rate; Apify `$0.95 of $5.00`; Neon `12.3 CU-hours` plus `≈ $x`), Days left (`—` when null), Last read (relative time; the error code shown under it in muted text when status is error), an Edit button → settings dialog (enabled, billing URL, low threshold, warn days; unit rate only for scrapecreators and neon).
- Badges: OK, Low, Error, Unavailable on this plan, Not configured, Off.
- Manual table: Name (linked when `billingUrl`), Type (`Monthly`, `Yearly`, `One-off`), Amount, Per month (`monthlyUsd`, `—` for one-off), Dates, plus Edit and Archive (confirm "Archive {name}? It stays in past months' totals."). An "Add cost" button opens the dialog.
- The chart shows the last 6 months, stacked bars API (secondary #2A6BAC) + manual (accent #F5A524), with a legend and per-bar `<title>` totals. Caption (decided): "Monthly spend (approximate: balance services are estimated from daily readings)". Validate contrast with the dataviz skill.
- "Refresh now" → action → toast "Refreshing — figures update in a minute." or "A refresh is already running." Disabled while `refreshQueued`.
- Copy (decided): title "Platform costs", subtitle "What it costs to run Rival Monday. API balances refresh daily at 06:00 UTC."
- Strip: the `(platform)` layout calls `list_platform_costs` **only when the viewer is an owner** (resolve the role once, reusing the layout's existing operator lookup), and renders `CostWarningStrip` if `lowCount > 0`. One Low service: "{Label} balance low: {amount}{ · about N days left}. View costs →". Several: "{N} services are low on balance. View costs →". Link to `/platform/costs`. A tool failure in the layout must never break the page (catch → no strip).
- Server actions: `refreshCosts`, `updateCostService`, `saveCostItem`, `archiveCostItem`, each via `runTool`, mapping errors to form messages with the existing error-copy helper, and `revalidatePath('/platform/costs')`. Every control is inside `WriteGuard` (8b), even though support ctx never reaches `/platform`, to keep the sweep test green.
**Tests:**
- `nav shows Costs only with isPlatformOwner`
- `strip copy: single and multiple`
- `services table renders each unit format and badge`
- `chart renders 6 bars with titles`
- `item dialog hides period/end date for one-off`
- `layout renders no strip for staff and swallows a tool error`
**Done when:** the focused component tests pass, `pnpm --filter @cs/web typecheck`, and `pnpm --filter @cs/web lint` pass.

---

### Task 8: E2E, demo seed, docs
**Goal:** `@costs` E2E, demo data, wrap-up docs.
**Files:** create `apps/web/e2e/platform-costs.spec.ts`; modify the demo seed (follow `platform-support.ts` from 8b: add `platform-costs.ts`, seeding 14 days of OpenRouter/DataForSEO snapshots, one of them Low, plus 3 manual items: Vercel Pro $20 monthly, Namecheap domain $15 yearly, Worker host $7 monthly), `docs/work/phase-8c.md` (Interfaces/Status), `apps/web/CLAUDE.md` or `packages/tools/CLAUDE.md` (a gotcha only if one was learned).
**E2E tests (`@costs`):**
- `owner sees services, summary and the low strip`
- `owner adds a monthly cost; it appears in the table and the Spent card; archive removes it from the table`
- `staff operator gets 404 on /platform/costs and no Costs nav`
- `Refresh now shows the toast` (job not processed in E2E; assert the toast only)
**Done when:** `pnpm --filter @cs/web exec playwright test --grep @costs` passes; `pnpm test:affected` and `pnpm --filter @cs/web e2e:affected` are green apart from known flakes; the work file is updated.
