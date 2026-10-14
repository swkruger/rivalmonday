# Phase 8c: platform hosting costs — design

**Status:** owner-approved design 2026-10-13 (brainstorm). **Branch:** `phase-8c`, stacked on `phase-8b` (which is stacked on `phase-8`).
**Scope:** an owner-only `/platform/costs` page that tracks what the full stack costs to run. API services are read daily (balance or month-to-date usage), with low-balance warnings. Everything else is entered by hand as recurring or one-off costs. Vendor contracts: `docs/research/2026-10-13-phase-8c-cost-apis.md`.
This spec holds new decisions and interfaces only. Platform-console conventions (8a) and support sessions (8b) are not restated.

## Decisions (c1–c12)
- **c1 Placement.** A sub-phase on its own worktree/branch, stacked on `phase-8b` because 8b moved `/platform` to `app/(platform)/platform/**`. It merges after 8b.
- **c2 Access.** **Platform owners only**, for viewing and editing. Every tool calls `requirePlatformOperator(deps, ctx, 'owner')`. Non-owners get a 404 on the page, and the nav link and warning strip are hidden. All tools are `supportHidden: true`, so a support session can't reach them (defence in depth; `/platform` already uses the operator ctx).
- **c3 Freshness.** A daily pg-boss job plus a "Refresh now" button that queues the same job. The web app never calls vendors directly.
- **c4 API services (6).** OpenRouter, DataForSEO and ScrapeCreators report a **balance**. Apify, Anthropic and Neon report **month-to-date usage**. Apify's usage comes with a plan cap. ScrapeCreators is in credits and Neon in units; both convert to USD with a rate the owner sets.
- **c5 New env vars (owner adds them to `.env`, never the agent):** `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID`. Add them to `turbo.json` `globalPassThroughEnv`. A service whose key is unset shows **Not configured**, not an error.
- **c6 Manual costs.** Two kinds, in **USD only**:
  - recurring: amount, `monthly` or `yearly`, start date, optional end date
  - one-off: amount and a date
  Yearly costs count as amount ÷ 12 per month. Entries are archived, never deleted, so past months stay correct.
- **c7 Service URL.** Every API service and manual cost carries a `billingUrl`. Each name links to it, so the owner can go straight to the top-up page. API services ship with default URLs (table below), and the owner can edit them.
- **c8 Warnings.** A service is **Low** when either of these holds:
  - its balance (or remaining cap, for Apify) is below its `lowThresholdUsd`
  - its projected days left is at or below `warnDays` (default 7)
  Usage services without a cap (Anthropic, Neon) never go Low.
- **c9 Warning delivery.** Two channels:
  - a strip at the top of every `/platform` page, for owners only
  - an email to every platform owner, sent only when a service **newly** turns Low
  The flag `alerted_at` is cleared when the service is no longer Low, so the next low spell emails again. Email is best-effort and sent directly, like 8b R6.
- **c10 No renewal reminders** (owner decision). Manual entries are for tracking spend only.
- **c11 Burn rate.** For balance services: spend per day = the sum of drops between consecutive OK snapshots over the last 14 days, divided by the days between the first and last of them. Rises (top-ups) are ignored. Fewer than 2 OK snapshots, or a rate of 0, means days left is `null`, shown as "—". Days left = balance ÷ rate, rounded down.
- **c12 Monthly spend (approximate, labelled as such on the page).** Per month (UTC):
  - usage services: the latest OK snapshot's `amountUsd` within that month
  - balance services: the sum of drops between consecutive OK snapshots within that month
  - manual: the monthly equivalent of every recurring cost active on any day of the month, plus one-off costs dated in it

## Services
| `service` key | Kind | Endpoint (see research doc) | Amount stored | Default billing URL |
|---|---|---|---|---|
| `openrouter` | balance | `GET openrouter.ai/api/v1/credits` | `total_credits - total_usage` | https://openrouter.ai/settings/credits |
| `dataforseo` | balance | `GET api.dataforseo.com/v3/appendix/user_data` (**always production host**, check task `status_code` = 20000) | `money.balance` | https://app.dataforseo.com/billing |
| `scrapecreators` | balance (credits) | `GET api.scrapecreators.com/v1/credit-balance` | units = `creditCount`; USD = units × `unitRateUsd` (null when the rate is unset) | https://app.scrapecreators.com |
| `apify` | usage + cap | `GET api.apify.com/v2/users/me/limits` | `current.monthlyUsageUsd`; `capUsd` = `limits.maxMonthlyUsageUsd` | https://console.apify.com/billing |
| `anthropic` | usage | `GET api.anthropic.com/v1/organizations/cost_report` from the 1st of the month UTC, `bucket_width=1d`, `limit=31` | Σ `amount` ÷ 100 (the amount is a decimal string in cents; parse it as a decimal and never sum floats of cents) | https://platform.claude.com/settings/billing |
| `neon` | usage (units) | `GET console.neon.tech/api/v2/consumption_history/v2/projects?org_id&metrics=compute_unit_seconds,root_branch_bytes_month&granularity=daily` from the 1st | units = CU-hours; USD = CU-hours × `unitRateUsd` (storage is ignored in v1) | https://console.neon.tech/app/billing |

- **Neon:** a 403 (plan not eligible) records status `unavailable`. **Before typing the schema, Task 0 verifies the field names with one live call**, because the docs disagree. If the owner hasn't added the key yet, the adapter ships against the documented v2 names and the gap is recorded in the work file.
- Never log or store raw vendor bodies. They include logins, labels and about 36 KB of rate tables. The adapters keep only the fields above.

## Data (next free migration number at execution; 8b took 0049/0050, so expect **0051**)
Both tables are service-role only, with RLS forced and no app-role policy, following the `support_session` pattern.

```sql
create table platform_cost_service (
  service text primary key check (service in ('openrouter','dataforseo','scrapecreators','apify','anthropic','neon')),
  enabled boolean not null default true,
  billing_url text,
  low_threshold_usd numeric(12,2),        -- null = no threshold
  warn_days integer not null default 7 check (warn_days between 0 and 90),
  unit_rate_usd numeric(14,8),            -- scrapecreators: $/credit; neon: $/CU-hour
  alerted_at timestamptz,                 -- set when the low email went out; cleared when no longer Low
  updated_at timestamptz not null default now(),
  updated_by text
);
create table platform_cost_snapshot (
  id uuid primary key default gen_random_uuid(),
  service text not null references platform_cost_service(service),
  taken_at timestamptz not null default now(),
  status text not null check (status in ('ok','error','unavailable')),
  kind text not null check (kind in ('balance','usage')),
  amount_usd numeric(14,4),               -- balance or MTD usage; null when status <> 'ok' or no unit rate
  units numeric(20,4),                    -- credits / CU-hours when relevant
  cap_usd numeric(14,4),                  -- apify plan cap
  error text                              -- short, no secrets, no body (e.g. 'HTTP 401', 'timeout', 'task 40201')
);
create index on platform_cost_snapshot (service, taken_at desc);
create table platform_cost_item (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('recurring','one_off')),
  amount_usd numeric(12,2) not null check (amount_usd >= 0),
  period text check (period in ('monthly','yearly')),   -- recurring only
  starts_on date not null,                -- one_off: the charge date
  ends_on date,                           -- recurring only, inclusive, null = ongoing
  billing_url text,
  notes text check (length(notes) <= 500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null,
  check ((kind = 'recurring') = (period is not null)),
  check (kind = 'recurring' or ends_on is null),
  check (ends_on is null or ends_on >= starts_on)
);
```
- The migration seeds the 6 `platform_cost_service` rows with their default billing URLs. Snapshots are kept indefinitely; that's 6 rows a day.
- `billing_url` (both tables) is validated in zod as `https:` only, ≤ 500 chars, and rendered with `rel="noopener noreferrer" target="_blank"`.

## Interfaces
- **Module** (no new package): adapters live in `packages/tools/src/platform/costs/`:
  - `adapters/<service>.ts`: each exports `readService(env, fetchImpl, now): Promise<CostReading>`
  - `types.ts`: `CostReading = { status: 'ok'|'error'|'unavailable'|'not_configured'; kind: 'balance'|'usage'; amountUsd?: number; units?: number; capUsd?: number; error?: string }`
  - `snapshot.ts`: `snapshotAll(deps, opts?)` runs every enabled, configured adapter with a 15 s timeout each, inserts one row per service (none for `not_configured`), then calls `evaluateAlerts`
  - `math.ts` (pure): `burnRate`, `daysLeft`, `serviceStatus`, `monthlySpend`, `manualMonthly`
  - `alerts.ts`: `evaluateAlerts(deps, sendEmail)` sets or clears `alerted_at` and emails on a newly Low service
- **Worker job** `platform-costs-snapshot`: cron `0 6 * * *` UTC, `singletonKey` so it doesn't double-run, following the `apps/worker/src/jobs.ts` pattern. It needs the vendor env vars in the worker.
- **Tools** (`packages/tools/src/tools/platform-costs.ts`, all `supportHidden: true`, owner-only, audited via `withPlatformAudit`):
  - `list_platform_costs` (read) → `{ services: ServiceRow[]; items: CostItem[]; months: { month: 'YYYY-MM'; apiUsd: number; manualUsd: number }[] /* last 6 incl. current */; summary: { mtdUsd; projectedMonthUsd; lowCount }; refreshQueued: boolean }`
    - `ServiceRow = { service; label; kind; status: 'ok'|'low'|'error'|'unavailable'|'not_configured'|'disabled'; amountUsd|null; units|null; capUsd|null; daysLeft|null; takenAt|null; error|null; billingUrl|null; lowThresholdUsd|null; warnDays; unitRateUsd|null; enabled }`
    - `projectedMonthUsd` = API MTD ÷ elapsed days × days in month, plus the month's full manual total (manual costs are not extrapolated).
  - `refresh_platform_costs` (write) queues the job and returns `{ queued: boolean }` (false if one is already queued or active).
  - `update_platform_cost_service` (write) takes `{ service, enabled?, billingUrl?, lowThresholdUsd?, warnDays?, unitRateUsd? }` (null clears a field).
  - `save_platform_cost_item` (write) takes `{ id?, name, kind, amountUsd, period?, startsOn, endsOn?, billingUrl?, notes? }` and returns `{ id }`.
  - `archive_platform_cost_item` (write) takes `{ id }`.
- **Email template** `platform-cost-low`:
  - subject: `Rival Monday: low balance on {Label}`
  - body: `{Label} is running low: {amount} left{, about N days at the current rate}. Top up: {billingUrl}. See all costs: {APP_URL}/platform/costs`
  - sent from `EMAIL_FROM`, one email per owner
- **Web:**
  - the page `app/(platform)/platform/costs/page.tsx` and its server actions
  - a "Costs" nav item (owner only)
  - `components` under `costs/_components/`: `services-table`, `cost-items-table` + `cost-item-dialog`, `service-settings-dialog`, `monthly-chart` (inline SVG)
  - `CostWarningStrip`, rendered by the `(platform)` layout when the operator is an owner and `lowCount > 0`
  - E2E tag `@costs`

## Page copy (decided)
- Title "Platform costs". Subtitle "What it costs to run Rival Monday. API balances refresh daily at 06:00 UTC."
- Summary cards: "Spent this month", "Projected this month", "Warnings".
- Status badges: OK, Low, Error, Unavailable on this plan, Not configured, Off.
- Strip: "{Label} balance low: {amount}{ · about N days left}. View costs →". With several services: "{N} services are low on balance. View costs →".
- Chart caption: "Monthly spend (approximate: balance services are estimated from daily readings)".
- Refresh toast: "Refreshing — figures update in a minute." / "A refresh is already running."

## Testing
- Each adapter is tested against recorded fixtures for: ok, HTTP 401/500, timeout, and malformed body. DataForSEO also covers task `40201`, Neon 403 → `unavailable`, an Anthropic cents string → exact USD, and a missing env var → `not_configured`. No live calls in CI.
- `math.ts`: burn rate ignoring top-ups, days left with fewer than 2 snapshots, the yearly ÷ 12 spread, recurring active on part of a month, a one-off in or out of the month, and a balance-service month crossing a top-up.
- `snapshotAll` and `evaluateAlerts` on the test DB:
  - one failing adapter doesn't block the others
  - an email goes out exactly once per Low spell and again after recovery
  - an email failure is swallowed and logged with no amounts or addresses
- Tools: owner OK; staff/viewer/non-operator → `permission_denied`; support ctx → `not_found`; zod rejects an `http:` URL, a one-off with a period, and `ends_on < starts_on`.
- E2E `@costs`: the owner adds a monthly manual cost, it shows up in the table and the summary, then gets archived; a seeded Low snapshot shows the strip; a staff operator gets a 404 on `/platform/costs`.

## Out of scope / backlog
- Vercel, Cloudflare R2, Postmark and the worker host are tracked as manual entries. Vercel and Cloudflare API reads are for a later phase.
- Neon storage cost, a CSV export, multi-currency, renewal reminders and per-agency cost allocation.
