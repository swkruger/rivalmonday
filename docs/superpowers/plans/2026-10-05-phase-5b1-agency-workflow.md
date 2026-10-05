# Phase 5b-1 — Agency Workflow (Portfolio, Onboarding, Approvals, Alerts, Recommendations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agency users the day-to-day workflow on top of the 5a app: a portfolio of every client with alerts, briefs to approve, a competitive-pressure score and last activity; onboarding a client (profile, services from the vertical catalog, service area, keywords) and managing its competitors (suggestions → accept/dismiss, manual add, remove) and tracked pages (pin/unpin, manual add); the Friday approval queue (edit, drop, reorder, rate, approve, send now → PDF, auto-send toggle); the alert review queue (approve/dismiss); and recommendations as a kanban for agency and client roles.

**Architecture:** Every new read **and write** is a typed tool registered in the existing `ToolRegistry` (`@cs/tools`), so each call is audit-logged and Phase 6's MCP server and Ask reuse the same code (spec §1.5 rule 3, §8.1). Tools wrap the existing engine/collector functions (`editBriefItem`, `approveBrief`, `sendBriefNow`, `approveAlert`, `dismissAlert`, `acceptSuggestion`, `updateRecommendationStatus`, …), which already enforce roles, RLS visibility and feedback history. `ToolDeps` grows optional `packs`, `delivery`, `enqueue` and `webMonitoring` members. The web app's server actions call tools through a new `runTool` helper that maps tool errors to form messages. Two engine/collector changes ride along: recommendations of items dropped at delivery are dismissed, and vendor/web collection stops for competitors no client tracks any more.

**Tech Stack:** Next.js 16.3 App Router (server components + server actions), React 19.3, Tailwind CSS 4 + shadcn/ui (`@cs/ui`), Drizzle 0.44 / postgres.js, pg-boss 10 (enqueue only from web), Zod 4, Vitest 3 + Testing Library + jsdom, Playwright Test 1.63. No new UI libraries (no TanStack Table, react-hook-form, dnd-kit or recharts in 5b-1 — tables are `@cs/ui` `Table`, reordering is up/down buttons).

**Spec:** [docs/superpowers/specs/2026-09-29-core-platform-design.md](../specs/2026-09-29-core-platform-design.md) — §3 (roles), §4.1 (onboarding & discovery), §5.1 (portfolio, approval queue), §5.2 module 9 (recommendations), §8.1–8.2 (registry, tools), §8.5 (recommendations), §9.1 step 6 (approval, auto-send), §9.3 (alert modes, AM review), §11 (no existence leaks). Design reference: [docs/brand/mockups/04-approval-queue.html](../../brand/mockups/04-approval-queue.html) and [01-client-overview.html](../../brand/mockups/01-client-overview.html) ("Competitive pressure" card). Obligations: the [roadmap](2026-09-29-roadmap.md) "Phase 5a carry-over" and "Phase 4b carry-over" sections. Previous plan (patterns this one follows): [2026-10-04-phase-5a-app-foundation-and-auth.md](2026-10-04-phase-5a-app-foundation-and-auth.md).

---

## Phase 5b split (owner decision 2026-10-05)

The 5a plan's 5b row is cut in two, each written after the previous merges:

| Sub-phase | Delivers |
|---|---|
| **5b-1 — Agency workflow core (this plan)** | Portfolio (alerts, briefs awaiting approval, pressure score, last activity); client onboarding (create/edit client profile, services from the vertical catalog, service area, keywords); competitors (suggestions → accept/dismiss, manual add, remove — with the `list_alerts` left-join fix and collection stopping for untracked competitors); tracked pages (pin/unpin, manual add); approval queue (edit/drop/reorder/rate/approve/send now → enqueue `brief-pdf`, per-client auto-send); alert review queue (approve/dismiss); recommendations list/kanban for agency and client roles, including dismissing recommendations whose brief item was dropped at delivery (4b parked item) |
| **5b-2 — Agency operations** | Playbook overrides editor; theme proposals + `decision_review` resolution queue for **platform operators** (`PLATFORM_ADMIN_EMAILS`, owner decision) with the `resolveDecisionReview` claim fix; usage & limits (per-client monthly cap, default **$15**, spend vs cap from the ledger, 80 % warning — enforcement stays Phase 7; configurable competitor limit; Postmark test-server ledger fix; question-quota placeholder); **prospecting snapshot report** (owner decision: prospect = client in `prospect` status, one GBP + ads pull + small 3×3 rank scan, deterministic landscape report, no model text, convertible to a client); 5a auth/audit hardening (`session.create.before` refusal for Google users without a sign-in right, hashed magic-link tokens, audit-logging the 5a service-function mutations, m2/m3, multi-membership `/c/[clientId]` switch) |
| **5c — Client workspace intelligence** | Unchanged from the 5a plan's overview table |

## Global Constraints

- Node 24 locally, pnpm 10, Turborepo 2.11.5. Before changing `turbo.json`, read `node_modules/turbo/docs/README.md` (repo `AGENTS.md` rule — the installed docs win over memory).
- Before writing Next.js code, read the bundled docs in `apps/web/node_modules/next/dist/docs/` for the API you touch (`apps/web/AGENTS.md`). Next 16: `proxy.ts` not `middleware.ts`; `cookies()`, `headers()`, `params`, `searchParams` are **async**.
- Every new read or write the web app performs is a **registered tool** in `@cs/tools` (`defineTool` + added to `src/tools/all.ts`). Server actions call tools with `runTool` (Task 1); pages read with `callTool` (5a). Never call an engine mutator directly from `apps/web`.
- Tool output dates are ISO strings. Tool names match `/^[a-z][a-z0-9_]{1,63}$/`.
- Errors: a row that exists but is not the caller's → `ToolError('not_found')`; the caller's own role is wrong → `permission_denied`; bad input the user can fix → `invalid_input` with a human sentence. Pages turn all three into **404** via `callTool` (spec §11); forms show the `invalid_input` message and "Not found" otherwise.
- Client-facing read paths strip `upsell_tag` (spec §8.5), show only `alert.status = 'delivered'` and `brief.status IN ('approved','sent')` (5a constraint, unchanged).
- Global tables (`competitor`, `tracked_page`, `competitor_source`) are written only with the **service** Db, after an RLS-checked (`withTenant(deps.app, ctx, …)`) proof that the caller's client tracks the competitor. Tenant tables `app_user` may write (`client` granted columns, `client_competitor`, `competitor_suggestion.status`) are written through `withTenant(deps.app, ctx, …)`.
- **No crawling of real competitors** until `https://rivalmonday.com/bot` exists (HANDOVER §5 item 6): `discover-pages` is enqueued and manual pages are accepted only when `WEB_MONITORING_ENABLED=true` (decision 7). It is unset in `.env` and in E2E.
- Brand: Inter; primary `#47A8E7`, secondary `#2A6BAC`, accent `#F5A524`, ink `#0B2540`, canvas `#F6F9FC`, muted surface `#EEF2F6`; cards `rounded-[14px] bg-surface p-6 shadow-card`; page titles `text-[26px] font-extrabold tracking-tight`; messages `rounded-lg bg-muted-surface p-3 text-ink` (`role="alert"` for errors); links `font-semibold text-primary-soft-text`; content max-width 1560px (the 5a layout already applies it).
- New nav items go in `apps/web/src/components/shell/nav-items.ts` **and** the `ICONS` map in `sidebar-nav.tsx` (`satisfies Record<NavItem['icon'], unknown>`), with a case in `sidebar-nav.test.tsx`.
- Forms: plain `FormData` + `useActionState(action, { ok: true } as FormResult)`; native `<select className={selectClass}>`; switches send a hidden input. Never call `Intl.supportedValuesOf` in a `'use client'` component — build time-zone options server-side with `timezoneOptions()` (HANDOVER §6).
- LF line endings only. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- Focused test runs: `pnpm --filter <pkg> exec vitest run <pattern>` (foreground, `timeout: 600000`). Full DB-backed package runs take minutes against Neon; never start two test runs at once (shared `cs_test`), and never hand back while a test run you started is still running.

## Review Focus

1. **A crafted form post for a client outside the caller's scope** — an account manager restricted to client A1 who posts A2's (or another agency's) brief, item, alert, suggestion, competitor, page or recommendation id must get "Not found" and change nothing. Every write tool's test file has a cross-scope case (Tasks 2, 4, 5, 6, 10, 12, 13).
2. **Two people acting on the same brief or alert** — approve while a colleague edits, double-click "Send now", approve an alert twice: exactly one action wins, the other gets a clear `invalid_input` message, nothing is sent twice (Tasks 10, 12).
3. **Removing a competitor** — its past alerts must still list (left join, "Competitor" fallback), collection (vendor + web) must stop once no client tracks it, and re-adding it must work (Task 5).
4. **Client roles and recommendations** — a client owner/viewer never sees `upsellTag` or another client's recommendations; a viewer (including an email-link guest) cannot change a status; dismissal always needs a reason (Tasks 13, 14).
5. **Paid and crawling actions** — requesting suggestions twice must not run two paid DataForSEO jobs (`policy: 'short'` + `singletonKey`); with `WEB_MONITORING_ENABLED` unset no `discover-pages` job is enqueued and no manual page is accepted (Tasks 1, 4, 5, 6).

---

## Decisions

1. **Writes are tools.** 5b-1 adds these registered tools (permission in brackets; `manage+mc` = permission `manage` with feature `manage_competitors`, i.e. exactly `canManageCompetitors`): `get_portfolio` [agency], `create_client` [agency], `update_client_profile` [agency], `list_client_competitors` [read], `list_competitor_suggestions` [manage+mc], `request_competitor_suggestions` [agency], `accept_competitor_suggestion` [manage+mc], `dismiss_competitor_suggestion` [manage+mc], `add_competitor` [manage+mc], `remove_competitor` [manage+mc], `list_tracked_pages` [read], `set_page_pin` [agency], `add_tracked_page` [agency], `list_brief_queue` [agency], `get_brief_review` [agency], `edit_brief_item`, `drop_brief_item`, `reorder_brief_items`, `rate_brief_item`, `approve_brief`, `send_brief_now`, `set_brief_auto_send` [all agency], `list_alert_queue`, `approve_alert`, `dismiss_alert` [agency], `list_recommendations` [read], `update_recommendation_status` [manage]. The 5b-1 UI exposes the `manage+mc` tools to agency roles only; 5c's client settings may expose them to client owners with the flag.
2. **`ToolDeps`** gains optional `packs` (default `createPackLoader()`), `delivery` (`DeliveryConfig | null`), `enqueue` (`EnqueueJob`) and `webMonitoring` (`boolean`, default false). They live in a new `src/deps.ts`; `registry.ts` re-exports `ToolDeps`. Tool arrays are collected in `src/tools/all.ts`.
3. **Creating clients:** agency roles whose scope is `'all'` (admins, and account managers with no client restriction). A restricted AM gets `permission_denied` — a new client would be outside their own scope. The row is inserted with the **service** Db (the `client` RLS `WITH CHECK` needs the new id in scope). Profile edits go through `withTenant(deps.app)` (the 9 granted columns). The vertical cannot change after creation (services are vertical-specific). Profile editing is agency-only in 5b-1.
4. **Profile validation:** name 1–120 chars; services ⊆ the vertical pack's service ids; keywords 0–5, each 2–60 chars, de-duplicated case-insensitively; service area either `null` or `{ center: { lat −90..90, lng −180..180 }, radiusKm 1–80, zips: 0–100 five-digit strings, towns?: 0–30 entries of 2–60 chars }`; `placeId` `null` or `/^[A-Za-z0-9_-]{10,200}$/`; time zone via `validTimezone`. The form takes the centre as one "lat, lng" field (pasted from Google Maps).
5. **Competitor limit:** `COMPETITOR_LIMIT = 5` per client (spec §4.1 "AM confirms 3–5"), checked by accept and manual add (a competitor already linked doesn't count twice). Making it configurable is 5b-2 (usage & limits).
6. **Suggestions** enqueue the worker's paid `suggest-competitors` job (≈ 18 DataForSEO Maps searches at the defaults), agency roles only, once the client has ≥ 1 keyword and a service area. `suggest-competitors` and `discover-pages` queues gain `policy: 'short'`, so the web's `singletonKey` (`suggest:<clientId>`, `discover:<competitorId>`) dedupes a queued duplicate.
7. **Website monitoring gate:** `WEB_MONITORING_ENABLED=true` (web env → `ToolDeps.webMonitoring`). Off: accepting/adding a competitor starts vendor sources (paid APIs, as `acceptSuggestion` already does) but never enqueues `discover-pages`; `add_tracked_page` is refused. On: a newly linked competitor with a domain and no tracked pages gets one `discover-pages` job.
8. **Removing a competitor** deletes only the `client_competitor` row; global data and history stay. `claimDueSources` and `claimDuePages` skip competitors no client tracks (a self-business competitor keeps `gbp`/`reviews` only), so spend stops. `list_alerts` switches to a left join with a "Competitor" fallback (5a carry-over).
9. **Pages:** `tracked_page` is shared by every client tracking the competitor, so 5b-1 offers no per-client deactivation (carry-over). Pin = keep through re-discovery and capture **daily**; unpin = back to the page type's default cadence (`home`/`pricing`/`promo` daily, else weekly). A manual page must be `http(s)` on the competitor's own host (or `www.` of it); at most 25 active pages per competitor (spec §4.1); stored `source: 'manual'`, pinned, daily.
10. **Pressure score (spec §5.1, mockup 01):** per (client, competitor) over the last 30 days, signals are each live (non-retracted) `brief`/`alert`-routed event score (weight = score / 100, label = its change type) and each open move (weight = confidence × 0.8 active / 0.5 emerging / 0.3 fading, label = its move type). `score = round(100 × (1 − Π(1 − weight)))`, 0–100; level `high` ≥ 70, `elevated` ≥ 40, else `low`; reasons = the two strongest distinct labels, or "Quiet". A client's pressure is its highest competitor's. Computed on read, never stored.
11. **Portfolio row:** client, pressure + top competitor + reasons, alerts waiting for review (`pending_review`), alerts delivered in the last 7 days, the newest `ready` brief (id + delivery date), open recommendations (`todo`/`in_progress`), and last activity = the latest of a non-archive `event_score.scored_at`, `alert.created_at` and `brief.sent_at`.
12. **Approval queue:** `list_brief_queue` returns, per visible client, its newest brief with `delivery_date ≥ today − 7 days` (UTC), plus any older `ready` brief; ready briefs first. The editor reads `get_brief_review` (agency view incl. dropped items, fact-check drop counts, `touched` = any human edit/drop/reorder per `isUntouched`, client auto-send). Reorder is "Move up/Move down" — the action computes the new order from the current active items and calls `reorder_brief_items`. "Send now" approves a `ready` brief first (engine), sends, then enqueues `brief-pdf` with `singletonKey = briefId` (same key as `/files/brief`); a failed enqueue is logged — the worker's 7-day missing-PDF catch-up renders it anyway.
13. **Alert queue:** `list_alert_queue` = `pending_review` alerts plus `approved` alerts held for the digest (`delivery = 'digest'`), oldest first. Approve reports the engine's outcome (sent now / held for the 17:00 digest / withdrawn because its evidence was retracted).
14. **Recommendations:** `list_recommendations` for any role that can see the client (all statuses; `upsellTag` agency-only); `update_recommendation_status` = permission `manage` (agency roles and client owners — viewers and guests read only); dismissal needs a reason. Board columns To do / In progress / Done, plus a collapsed Dismissed list. `dropRetractedItems` (approval and delivery) now dismisses that item's recommendation if it is still `todo` (`dismiss_reason` "Evidence withdrawn before delivery", `system` feedback) — closing the 4b parked item; an `in_progress`/`done` one is left to the humans working on it.
15. **Not in 5b-1:** everything in the 5b-2 row above; per-client page deactivation; drag-and-drop reordering; agency-wide recommendation board; client-owner self-service competitor management UI (5c).

## File structure

```
packages/tools/
  package.json                          + @cs/collectors, @cs/verticals deps
  src/deps.ts                           ToolDeps, QueueJob, EnqueueJob, packsOf, enqueueOf          (Task 1)
  src/registry.ts                       uses deps.ts + tools/all.ts                                  (Task 1)
  src/tools/all.ts                      every tool array                                             (Task 1, appended by later tasks)
  src/client-input.ts                   cleanClientInput, clientInputProblems                        (Task 2)
  src/tools/onboarding.ts               create_client, update_client_profile                         (Task 2)
  src/limits.ts                         COMPETITOR_LIMIT, MAX_ACTIVE_PAGES                           (Task 4)
  src/tools/competitors.ts              suggestions, add/remove, list_client_competitors             (Tasks 4, 5)
  src/tools/pages.ts                    list_tracked_pages, set_page_pin, add_tracked_page           (Task 6)
  src/pressure.ts                       combinePressure, pressureByClient                            (Task 8)
  src/tools/portfolio.ts                get_portfolio                                                (Task 8)
  src/tools/review.ts                   brief queue + review tools                                   (Task 10)
  src/tools/alert-queue.ts              list_alert_queue, approve_alert, dismiss_alert               (Task 12)
  src/tools/recommendations.ts          list_recommendations, update_recommendation_status           (Task 13)
  src/tools/schemas.ts                  new output schemas (each task appends its own)

packages/collectors/src/local/accept.ts         not-found → ToolError                                (Task 4)
packages/collectors/src/sources/due.ts          skip untracked competitors                           (Task 5)
packages/collectors/src/schedule/due-pages.ts   skip untracked competitors                           (Task 5)
packages/engine/src/briefs/review.ts            dropRetractedItems dismisses todo recommendations    (Task 13)
apps/worker/src/jobs/vendor.ts, web.ts          policy 'short' on suggest/discover queues            (Task 1)

apps/web/src/server/env.ts                      webMonitoring                                        (Task 1)
apps/web/src/server/queue.ts                    enqueueJob (EnqueueJob)                              (Task 1)
apps/web/src/server/tools.ts                    registry with delivery/enqueue/webMonitoring         (Task 1)
apps/web/src/server/run-tool.ts                 createRunTool, runTool                               (Task 1)
apps/web/src/server/forms.ts                    parseClientProfileForm                               (Task 3)
apps/web/src/server/format.ts                   relativeTime                                         (Task 9)
apps/web/src/server/order.ts                    moveInOrder                                          (Task 11)
apps/web/src/components/client-profile-form.tsx shared create/edit form                              (Task 3)
apps/web/src/app/(app)/agency/page.tsx          portfolio                                            (Task 9)
apps/web/src/app/(app)/agency/clients/new/      create client                                        (Task 3)
apps/web/src/app/(app)/c/[clientId]/settings/profile/   edit profile                                 (Task 3)
apps/web/src/app/(app)/c/[clientId]/competitors/        competitors + pages                          (Task 7)
apps/web/src/app/(app)/agency/approvals/                queue + editor                               (Task 11)
apps/web/src/app/(app)/agency/alerts/                   alert review                                 (Task 12)
apps/web/src/app/(app)/c/[clientId]/recommendations/    board                                        (Task 14)
apps/web/e2e/{helpers.ts,workflow.spec.ts}              5b-1 E2E                                     (Task 15)
```

---

### Task 1: Tool deps, job enqueue and the `runTool` form helper

**Files:**
- Create: `packages/tools/src/deps.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/deps.test.ts`, `apps/web/src/server/run-tool.ts`, `apps/web/src/server/run-tool.test.ts`
- Modify: `packages/tools/package.json`, `packages/tools/src/registry.ts`, `packages/tools/src/index.ts`, `apps/web/package.json`, `apps/web/src/server/env.ts`, `apps/web/src/server/env.test.ts`, `apps/web/src/server/queue.ts`, `apps/web/src/server/queue.test.ts`, `apps/web/src/server/tools.ts`, `apps/worker/src/jobs/vendor.ts`, `apps/worker/src/jobs/web.ts`, `apps/worker/src/jobs/vendor.test.ts`, `apps/worker/src/jobs/web.test.ts`, `apps/web/playwright.config.ts`

**Interfaces:**
- Consumes: `createPackLoader`, `PackLoader`, `DeliveryConfig`, `deliveryConfigFromEnv` (`@cs/engine`); `ToolError` (`@cs/core`); `toFormResult`, `FormResult` (`apps/web/src/server/forms.ts`).
- Produces:
  - `type QueueJob = 'brief-pdf' | 'report-pdf' | 'suggest-competitors' | 'discover-pages'`
  - `type EnqueueJob = (job: QueueJob, data: Record<string, string>, singletonKey: string) => Promise<void>`
  - `interface ToolDeps { app: Db; service: Db; packs?: PackLoader; delivery?: DeliveryConfig | null; enqueue?: EnqueueJob; webMonitoring?: boolean }`
  - `packsOf(deps: ToolDeps): PackLoader`, `enqueueOf(deps: ToolDeps): EnqueueJob` (throws `ToolError('internal')` when absent)
  - `allTools` (`src/tools/all.ts`) — later tasks append their arrays here
  - web: `WebEnv.webMonitoring: boolean`; `enqueueJob: EnqueueJob` (`server/queue.ts`); `type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }`; `createRunTool(reg: () => { invoke(ctx, name, input): Promise<unknown> })`; `runTool<T>(ctx: AccessContext, name: string, input: unknown): Promise<ToolResult<T>>`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/deps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { enqueueOf, packsOf, type ToolDeps } from './deps';

const base = { app: {} as ToolDeps['app'], service: {} as ToolDeps['service'] };

describe('tool deps', () => {
  it('defaults the pack loader to the bundled packs', async () => {
    const pack = await packsOf(base)('hvac_plumbing');
    expect(pack.id).toBe('hvac_plumbing');
  });

  it('refuses background work when no queue is wired', () => {
    expect(() => enqueueOf(base)).toThrow(expect.objectContaining({ code: 'internal' }));
    const enqueue = async () => {};
    expect(enqueueOf({ ...base, enqueue })).toBe(enqueue);
  });
});
```

`apps/web/src/server/run-tool.test.ts`:

```ts
import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { createRunTool } from './run-tool';

const ctx = {} as never;
const reg = (impl: () => Promise<unknown>) => () => ({ invoke: impl });

describe('runTool', () => {
  it('returns the data on success', async () => {
    await expect(createRunTool(reg(async () => ({ id: 'x' })))(ctx, 't', {})).resolves.toEqual({ ok: true, data: { id: 'x' } });
  });
  it('shows invalid_input messages and hides not_found / permission_denied', async () => {
    await expect(createRunTool(reg(async () => { throw new ToolError('invalid_input', 'Name is required'); }))(ctx, 't', {})).resolves.toEqual({ ok: false, error: 'Name is required' });
    await expect(createRunTool(reg(async () => { throw new ToolError('permission_denied', 'secret'); }))(ctx, 't', {})).resolves.toEqual({ ok: false, error: 'Not found' });
    await expect(createRunTool(reg(async () => { throw new ToolError('not_found', 'secret'); }))(ctx, 't', {})).resolves.toEqual({ ok: false, error: 'Not found' });
  });
  it('lets internal failures reach the error boundary', async () => {
    await expect(createRunTool(reg(async () => { throw new ToolError('internal', 'boom'); }))(ctx, 't', {})).rejects.toThrow('boom');
  });
});
```

Add to `apps/web/src/server/env.test.ts` (inside its existing `describe`, reusing its valid-env fixture — read the file first; it builds a complete env object, call it `valid` here):

```ts
it('reads WEB_MONITORING_ENABLED as an explicit opt-in', () => {
  expect(parseWebEnv({ ...valid }).webMonitoring).toBe(false);
  expect(parseWebEnv({ ...valid, WEB_MONITORING_ENABLED: 'yes' }).webMonitoring).toBe(false);
  expect(parseWebEnv({ ...valid, WEB_MONITORING_ENABLED: 'true' }).webMonitoring).toBe(true);
});
```

Add to `apps/web/src/server/queue.test.ts`:

```ts
it('enqueues the 5b-1 onboarding jobs with their singleton keys', async () => {
  const working = fakeBoss();
  const { enqueue } = createBossQueue(() => working);
  await enqueue('suggest-competitors', { clientId: 'c1' }, 'suggest:c1');
  expect(working.send).toHaveBeenCalledWith('suggest-competitors', { clientId: 'c1' }, { singletonKey: 'suggest:c1' });
});
```

Replace the queue test in `apps/worker/src/jobs/vendor.test.ts` (`'registers rank-scan and suggest-competitors as single-shot queues…'`) with:

```ts
it('registers rank-scan and suggest-competitors as single-shot queues; suggest dedupes queued duplicates', () => {
  const jobs = createVendorJobs({} as WorkerDeps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
  for (const job of [jobs.rankScan, jobs.suggest]) {
    expect(job.queue?.retryLimit).toBe(0);
    expect(job.queue?.expireInSeconds).toBeGreaterThanOrEqual(2 * 60 * 60);
  }
  expect(jobs.suggest.queue?.policy).toBe('short');
});
```

Add to `apps/worker/src/jobs/web.test.ts`:

```ts
it('dedupes queued page discovery per competitor (short policy)', () => {
  const jobs = createWebJobs({} as WorkerDeps, { enqueueCapture: async () => {} });
  expect(jobs.discover.queue?.policy).toBe('short');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cs/tools exec vitest run src/deps.test.ts` → FAIL (module missing). `pnpm --filter @cs/web exec vitest run src/server/run-tool.test.ts src/server/env.test.ts src/server/queue.test.ts` → FAIL. `pnpm --filter @cs/worker exec vitest run src/jobs/vendor.test.ts src/jobs/web.test.ts` → FAIL (`policy` undefined).

- [ ] **Step 3: Implement**

`packages/tools/package.json`: add `"@cs/collectors": "workspace:*"` and `"@cs/verticals": "workspace:*"` to `dependencies` (later tasks import them). `apps/web/package.json`: add `"@cs/verticals": "workspace:*"` (Task 3 reads the packs). Run `pnpm install`.

`packages/tools/src/deps.ts`:

```ts
import { ToolError } from '@cs/core';
import type { Db } from '@cs/db';
import { createPackLoader, type DeliveryConfig, type PackLoader } from '@cs/engine';

/** Jobs the web app may enqueue. The worker owns the queues (5a decision 8); `singletonKey` dedupes on `short`-policy queues. */
export type QueueJob = 'brief-pdf' | 'report-pdf' | 'suggest-competitors' | 'discover-pages';
export type EnqueueJob = (job: QueueJob, data: Record<string, string>, singletonKey: string) => Promise<void>;

export interface ToolDeps {
  /** app_user connection: tenant reads go through withTenant + RLS. */
  app: Db;
  /** Service role: audit, global tables, and engine functions that need it. */
  service: Db;
  /** Vertical packs; defaults to the bundled YAML packs. */
  packs?: PackLoader;
  /** Null or absent when APP_URL / LINK_SIGNING_SECRET are missing — sending tools refuse with a clear message. */
  delivery?: DeliveryConfig | null;
  /** Absent: tools that start background work refuse with `internal`. */
  enqueue?: EnqueueJob;
  /** Decision 7: website crawling (page discovery, manual pages) only when true. */
  webMonitoring?: boolean;
}

let bundledPacks: PackLoader | null = null;
export const packsOf = (deps: ToolDeps): PackLoader => deps.packs ?? (bundledPacks ??= createPackLoader());

export function enqueueOf(deps: ToolDeps): EnqueueJob {
  if (!deps.enqueue) throw new ToolError('internal', 'Background jobs are not configured');
  return deps.enqueue;
}
```

`packages/tools/src/tools/all.ts`:

```ts
import { alertTools } from './alerts';
import { briefTools } from './briefs';
import { clientTools } from './clients';
import { reportTools } from './reports';

/** Every registered tool. Each 5b-1 task appends its array here. */
export const allTools = [...clientTools, ...briefTools, ...alertTools, ...reportTools];
```

`packages/tools/src/registry.ts` (replace the file):

```ts
import { type AuditSink, ToolRegistry } from '@cs/core';
import { createAuditSink } from '@cs/db';
import type { ToolDeps } from './deps';
import { allTools } from './tools/all';

export type { ToolDeps } from './deps';

export function createToolRegistry(deps: ToolDeps, opts: { audit?: AuditSink } = {}): ToolRegistry<ToolDeps> {
  return new ToolRegistry<ToolDeps>(deps, opts.audit ?? createAuditSink(deps.service)).register(...allTools);
}
```

Existing tool files import `type ToolDeps from '../registry'` — leave them; the re-export keeps working. In `src/index.ts` add `export * from './deps';` (before `./registry`) and remove nothing. If TypeScript reports `ToolDeps` exported twice through the barrel, change the registry line to `export type { ToolDeps } from './deps';` only in `registry.ts` and drop the duplicate from `deps` by exporting `ToolDeps` from `index.ts` via `./deps` alone.

`apps/web/src/server/env.ts`: add `/** Decision 7 (5b-1): crawl competitor websites only when explicitly enabled (no bot page yet). */ webMonitoring: boolean;` to `WebEnv` and `webMonitoring: env.WEB_MONITORING_ENABLED?.trim() === 'true',` to `parsed`.

`apps/web/src/server/queue.ts`: import `type EnqueueJob` from `@cs/tools`; type `createBossQueue`'s return as `{ enqueue: EnqueueJob }` (the body is unchanged — `send(name, data, { singletonKey })`); at the bottom:

```ts
/** Every job the web app starts (PDF renders, competitor suggestions, page discovery). */
export const enqueueJob: EnqueueJob = queue.enqueue;
/** The worker's `short` policy on `brief-pdf`/`report-pdf` dedupes by `singletonKey`, so repeated page refreshes don't pile up renders. */
export const enqueue: Enqueue = queue.enqueue;
```

`apps/web/src/server/tools.ts`: replace the `registry` line with

```ts
import { deliveryConfigFromEnv } from '@cs/engine';
import { webEnv } from './env';
import { enqueueJob } from './queue';

export const registry = () =>
  (cached ??= createToolRegistry({ ...dbs(), delivery: deliveryConfigFromEnv(process.env), enqueue: enqueueJob, webMonitoring: webEnv().webMonitoring }));
```

`apps/web/src/server/run-tool.ts`:

```ts
import 'server-only';
import type { AccessContext } from '@cs/core';
import { toFormResult } from './forms';
import { registry } from './tools';

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };
type Invoker = () => { invoke(ctx: AccessContext, name: string, input: unknown): Promise<unknown> };

/** For server actions: a tool refusal becomes a form message (invalid_input shown, not_found/permission_denied → "Not found"); internal errors propagate. */
export function createRunTool(reg: Invoker) {
  return async function run<T>(ctx: AccessContext, name: string, input: unknown): Promise<ToolResult<T>> {
    try {
      return { ok: true, data: (await reg().invoke(ctx, name, input)) as T };
    } catch (e) {
      const r = toFormResult(e);
      return r.ok ? { ok: false, error: 'Not found' } : r;
    }
  };
}

export const runTool = createRunTool(registry);
```

`apps/worker/src/jobs/vendor.ts`: the `suggest` job's queue becomes `queue: { ...SINGLE_SHOT_QUEUE, policy: 'short' }` (`rank-scan` keeps `SINGLE_SHOT_QUEUE`). `apps/worker/src/jobs/web.ts`: the `discover` job gains `queue: { policy: 'short' }`. Check `JobQueueOptions` in `apps/worker/src/jobs.ts` already allows `policy` (the PDF jobs use it); `registerJobs` calls `updateQueue`, so an existing queue picks up the policy on the next worker start.

`apps/web/playwright.config.ts`: add `WEB_MONITORING_ENABLED: ''` to `webServer.env`.

- [ ] **Step 4: Run tests and typecheck**

Run the Step 2 commands → PASS. Then `pnpm --filter @cs/tools typecheck && pnpm --filter @cs/web typecheck && pnpm --filter @cs/worker typecheck` → clean. Also `pnpm --filter @cs/tools exec vitest run src/tools/read-tools.test.ts` → PASS (registry still registers the 5a tools).

- [ ] **Step 5: Commit**

```bash
git add packages/tools apps/web apps/worker pnpm-lock.yaml
git commit -m "feat(tools,web,worker): tool deps for packs/delivery/queue, runTool form helper, short-policy onboarding queues"
```

---

### Task 2: Client onboarding tools — `create_client`, `update_client_profile`

**Files:**
- Create: `packages/tools/src/client-input.ts`, `packages/tools/src/client-input.test.ts`, `packages/tools/src/tools/onboarding.ts`, `packages/tools/src/tools/onboarding.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/clients.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/tools/read-tools.test.ts`, `packages/tools/src/index.ts`

**Interfaces:**
- Consumes: `packsOf`, `ToolDeps` (Task 1); `validTimezone` (`src/timezone.ts`); `client`, `ServiceArea`, `withTenant` (`@cs/db`); `FEATURES`, `Feature`, `toolkit`, `ToolError`, `canAccessClient` (`@cs/core`); `VerticalPack` (`@cs/verticals`).
- Produces:
  - `interface ClientInput { name: string; services: string[]; keywords: string[]; serviceArea: ServiceArea | null; placeId: string | null; features: Feature[] }`
  - `cleanClientInput(input: ClientInput): ClientInput`, `clientInputProblems(input: ClientInput, pack: VerticalPack): string[]`
  - zod `ServiceAreaInput` (schemas.ts) = `{ center: { lat: number; lng: number }; radiusKm: number; zips: string[]; towns?: string[] }`
  - `ClientProfile` gains `serviceArea: ServiceAreaInput | null` and `placeId: string | null`
  - tool `create_client` input `{ name, verticalId, services, keywords, serviceArea, placeId, timezone?, features? }` → `{ clientId: string }`
  - tool `update_client_profile` input `{ clientId, name?, services?, keywords?, serviceArea?, placeId?, features? }` → `{ clientId: string }`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/client-input.test.ts`:

```ts
import { loadVerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import { type ClientInput, cleanClientInput, clientInputProblems } from './client-input';

const pack = await loadVerticalPack('hvac_plumbing');
const ok: ClientInput = {
  name: 'Comfort Air', services: ['ac_tune_up'], keywords: ['ac repair', 'hvac'], placeId: null, features: [],
  serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: ['30338'], towns: ['Dunwoody'] },
};

describe('client input', () => {
  it('accepts a valid profile and trims/dedupes it', () => {
    const c = cleanClientInput({ ...ok, name: '  Comfort Air ', keywords: [' AC repair', 'ac repair', 'hvac', ''] });
    expect(c.name).toBe('Comfort Air');
    expect(c.keywords).toEqual(['AC repair', 'hvac']);
    expect(clientInputProblems(c, pack)).toEqual([]);
  });

  it('reports every problem in one pass', () => {
    const problems = clientInputProblems(
      { ...ok, name: '', services: ['not_a_service'], keywords: ['a', 'b2', 'c3', 'd4', 'e5', 'f6'], placeId: 'bad id!',
        serviceArea: { center: { lat: 91, lng: 0 }, radiusKm: 0, zips: ['1234'], towns: [] } },
      pack,
    );
    expect(problems).toEqual(expect.arrayContaining([
      'Name is required (up to 120 characters)', 'Unknown service: not_a_service', 'Use at most 5 keywords',
      'Keywords must be 2–60 characters', 'Google place id looks wrong', 'Latitude must be between -90 and 90',
      'Radius must be 1–80 km', 'ZIP codes must be 5 digits: 1234',
    ]));
  });

  it('allows no service area and no keywords at creation', () => {
    expect(clientInputProblems({ ...ok, serviceArea: null, keywords: [] }, pack)).toEqual([]);
  });
});
```

`packages/tools/src/tools/onboarding.test.ts`:

```ts
import { type AccessContext, type AuditEvent, createAccessContext } from '@cs/core';
import { client } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const audit: AuditEvent[] = [];
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async (e) => void audit.push(e) } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const amAll = ctx('account_manager', 'all');
const amA1 = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);
const input = {
  name: 'Comfort Air', verticalId: 'hvac_plumbing', services: ['ac_tune_up'], keywords: ['ac repair'], placeId: null,
  serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: ['30338'] }, timezone: 'America/New_York',
};

beforeEach(async () => {
  audit.length = 0;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('create_client', () => {
  it('creates a client for admins and unrestricted AMs, audited', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', input)) as { clientId: string };
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row).toMatchObject({ agencyId: IDS.agencyA, name: 'Comfort Air', services: ['ac_tune_up'], timezone: 'America/New_York', alertMode: 'after_am_check' });
    expect(audit.at(-1)).toMatchObject({ tool: 'create_client', outcome: 'ok' });
    await expect(registry.invoke(amAll, 'create_client', { ...input, name: 'Second' })).resolves.toBeTruthy();
  });

  it('refuses restricted AMs, client roles, unknown verticals and bad input', async () => {
    await expect(registry.invoke(amA1, 'create_client', input)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'create_client', input)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'create_client', { ...input, verticalId: 'bakery' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'create_client', { ...input, services: ['nope'] })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('Unknown service') });
    await expect(registry.invoke(admin, 'create_client', { ...input, timezone: 'Mars/Base' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('update_client_profile', () => {
  it('patches only the given fields through RLS', async () => {
    await registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA1, keywords: ['furnace repair'], serviceArea: input.serviceArea });
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(row).toMatchObject({ name: 'A1 HVAC', keywords: ['furnace repair'], serviceArea: { radiusKm: 15, zips: ['30338'] } });
    const profile = (await registry.invoke(amA1, 'get_client_profile', { clientId: IDS.clientA1 })) as { serviceArea: { radiusKm: number } | null };
    expect(profile.serviceArea?.radiusKm).toBe(15);
  });

  it('refuses clients out of scope (Review Focus 1), client roles and invalid services', async () => {
    await expect(registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA2, name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('agency_admin', 'all', IDS.agencyB), 'update_client_profile', { clientId: IDS.clientA1, name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'update_client_profile', { clientId: IDS.clientA1, name: 'x' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, services: ['root_canal'] })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
```

(`seedTenancy` names the A1 client `'A1 HVAC'` with vertical `hvac_plumbing`; `root_canal` is a dental service id — check `packages/verticals/packs/dental.yaml` and substitute any dental-only id if that one differs.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/client-input.test.ts src/tools/onboarding.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`packages/tools/src/client-input.ts`:

```ts
import type { Feature } from '@cs/core';
import type { ServiceArea } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';

export interface ClientInput {
  name: string;
  services: string[];
  keywords: string[];
  serviceArea: ServiceArea | null;
  placeId: string | null;
  features: Feature[];
}

export const MAX_KEYWORDS = 5;
const ZIP = /^\d{5}$/;
const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim().replace(/\s+/g, ' ');
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

export function cleanClientInput(input: ClientInput): ClientInput {
  const area = input.serviceArea;
  return {
    name: input.name.trim(),
    services: [...new Set(input.services)],
    keywords: dedupe(input.keywords),
    placeId: input.placeId?.trim() || null,
    features: [...new Set(input.features)],
    serviceArea: area
      ? { center: area.center, radiusKm: area.radiusKm, zips: [...new Set(area.zips.map((z) => z.trim()).filter(Boolean))], ...(area.towns ? { towns: dedupe(area.towns) } : {}) }
      : null,
  };
}

/** Decision 4. Messages are shown to the AM as-is. */
export function clientInputProblems(input: ClientInput, pack: VerticalPack): string[] {
  const p: string[] = [];
  if (input.name.length < 1 || input.name.length > 120) p.push('Name is required (up to 120 characters)');
  const known = new Set(pack.services.map((s) => s.id));
  for (const s of input.services) if (!known.has(s)) p.push(`Unknown service: ${s}`);
  if (input.keywords.length > MAX_KEYWORDS) p.push(`Use at most ${MAX_KEYWORDS} keywords`);
  if (input.keywords.some((k) => k.length < 2 || k.length > 60)) p.push('Keywords must be 2–60 characters');
  if (input.placeId !== null && !PLACE_ID.test(input.placeId)) p.push('Google place id looks wrong');
  const a = input.serviceArea;
  if (a) {
    if (!(a.center.lat >= -90 && a.center.lat <= 90)) p.push('Latitude must be between -90 and 90');
    if (!(a.center.lng >= -180 && a.center.lng <= 180)) p.push('Longitude must be between -180 and 180');
    if (!(a.radiusKm >= 1 && a.radiusKm <= 80)) p.push('Radius must be 1–80 km');
    const badZips = a.zips.filter((z) => !ZIP.test(z));
    if (badZips.length) p.push(`ZIP codes must be 5 digits: ${badZips.join(', ')}`);
    if (a.zips.length > 100) p.push('Use at most 100 ZIP codes');
    if ((a.towns?.length ?? 0) > 30) p.push('Use at most 30 towns');
    if (a.towns?.some((t) => t.length < 2 || t.length > 60)) p.push('Town names must be 2–60 characters');
  }
  return p;
}
```

In `packages/tools/src/tools/schemas.ts` add (before `ClientProfile`) and extend `ClientProfile`:

```ts
export const ServiceAreaInput = z.object({
  center: z.object({ lat: z.number(), lng: z.number() }),
  radiusKm: z.number(),
  zips: z.array(z.string()).max(200),
  towns: z.array(z.string()).max(60).optional(),
});
export type ServiceAreaInput = z.infer<typeof ServiceAreaInput>;
```

and add `serviceArea: ServiceAreaInput.nullable(), placeId: z.string().nullable(),` to `ClientProfile`. In `tools/clients.ts` `getClientProfile` return `serviceArea: c.serviceArea ?? null, placeId: c.placeId,` too. In `read-tools.test.ts` nothing asserts the whole profile object (it checks `alertMode` only) — run it to confirm.

`packages/tools/src/tools/onboarding.ts`:

```ts
import { canAccessClient, FEATURES, toolkit, ToolError } from '@cs/core';
import { client, withTenant } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ClientInput, cleanClientInput, clientInputProblems } from '../client-input';
import { packsOf, type ToolDeps } from '../deps';
import { validTimezone } from '../timezone';
import { ServiceAreaInput } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const Features = z.array(z.enum(FEATURES)).max(FEATURES.length);

async function packFor(deps: ToolDeps, verticalId: string): Promise<VerticalPack> {
  try {
    return await packsOf(deps)(verticalId);
  } catch {
    throw new ToolError('invalid_input', `Unknown vertical: ${verticalId}`);
  }
}

function validated(input: ClientInput, pack: VerticalPack): ClientInput {
  const clean = cleanClientInput(input);
  const problems = clientInputProblems(clean, pack);
  if (problems.length) throw new ToolError('invalid_input', problems.join('; '));
  return clean;
}

export const createClient = defineTool({
  name: 'create_client',
  description: 'Create a client business for this agency (agency users who cover all clients).',
  input: z.object({
    name: z.string().max(200), verticalId: z.string().max(40), services: z.array(z.string().max(80)).max(255), keywords: z.array(z.string().max(120)).max(20),
    serviceArea: ServiceAreaInput.nullable(), placeId: z.string().max(300).nullable(), timezone: z.string().max(64).optional(), features: Features.default([]),
  }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    // Decision 3: a restricted AM could not see the client they create.
    if (ctx.clientScope !== 'all') throw new ToolError('permission_denied', 'Only users who cover all clients can add a client');
    const pack = await packFor(deps, input.verticalId);
    const c = validated(input, pack);
    if (input.timezone !== undefined && !validTimezone(input.timezone)) throw new ToolError('invalid_input', 'Unknown time zone');
    const [row] = await deps.service
      .insert(client)
      .values({ agencyId: ctx.agencyId, name: c.name, verticalId: pack.id, services: c.services, keywords: c.keywords, serviceArea: c.serviceArea, placeId: c.placeId, features: c.features, ...(input.timezone ? { timezone: input.timezone } : {}) })
      .returning({ id: client.id });
    return { clientId: row!.id };
  },
});

export const updateClientProfile = defineTool({
  name: 'update_client_profile',
  description: 'Update a client’s name, services, keywords, service area, Google place id or client features.',
  input: z.object({
    clientId: uuid, name: z.string().max(200).optional(), services: z.array(z.string().max(80)).max(255).optional(), keywords: z.array(z.string().max(120)).max(20).optional(),
    serviceArea: ServiceAreaInput.nullable().optional(), placeId: z.string().max(300).nullable().optional(), features: Features.optional(),
  }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId, ...patch }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [current] = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).where(eq(client.id, clientId)));
    if (!current) throw new ToolError('not_found', 'Client not found');
    const pack = await packFor(deps, current.verticalId);
    const merged = validated(
      {
        name: patch.name ?? current.name, services: patch.services ?? current.services, keywords: patch.keywords ?? current.keywords,
        serviceArea: patch.serviceArea === undefined ? current.serviceArea : patch.serviceArea, placeId: patch.placeId === undefined ? current.placeId : patch.placeId,
        features: (patch.features ?? current.features) as ClientInput['features'],
      },
      pack,
    );
    await withTenant(deps.app, ctx, (tx) =>
      tx.update(client).set({ name: merged.name, services: merged.services, keywords: merged.keywords, serviceArea: merged.serviceArea, placeId: merged.placeId, features: merged.features }).where(eq(client.id, clientId)),
    );
    return { clientId };
  },
});

export const onboardingTools = [createClient, updateClientProfile];
```

(`current.features` may hold unknown legacy strings; `cleanClientInput` keeps them — filter with `.filter((f) => (FEATURES as readonly string[]).includes(f))` when building `merged.features` so an unknown value is dropped on the next save.)

Append `...onboardingTools` to `allTools` (import from `./onboarding`). Export `client-input` from `src/index.ts` (`export * from './client-input';`).

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/client-input.test.ts src/tools/onboarding.test.ts src/tools/read-tools.test.ts` → PASS; `pnpm --filter @cs/tools typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): create_client and update_client_profile with vertical-catalog validation"
```

---

### Task 3: Onboarding screens — new client and client profile

**Files:**
- Create: `apps/web/src/server/verticals.ts`, `apps/web/src/components/client-profile-form.tsx`, `apps/web/src/components/client-profile-form.test.tsx`, `apps/web/src/app/(app)/agency/clients/new/page.tsx`, `apps/web/src/app/(app)/agency/clients/new/actions.ts`, `apps/web/src/app/(app)/c/[clientId]/settings/profile/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/settings/profile/actions.ts`
- Modify: `apps/web/src/server/forms.ts`, `apps/web/src/server/forms.test.ts`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `runTool` (Task 1); tools `create_client`, `update_client_profile`, `get_client_profile` (Task 2); `listVerticalPacks`, `loadVerticalPack` (`@cs/verticals`); `timezoneOptions` (`@/server/timezones`); `FormResult`.
- Produces:
  - `interface VerticalOption { id: string; name: string; services: { id: string; name: string }[] }`; `verticalOptions(): Promise<VerticalOption[]>` (`server/verticals.ts`)
  - `parseClientProfileForm(fd: FormData): ClientProfileFields | { error: string }` where `ClientProfileFields = { name: string; verticalId: string; services: string[]; keywords: string[]; serviceArea: ServiceAreaInput | null; placeId: string | null; timezone?: string }`
  - `<ClientProfileForm mode="create" | "edit" … />`
  - nav item `{ href: '/c/<id>/settings/profile', label: 'Profile', icon: 'profile' }` (agency, client-scoped)

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/server/forms.test.ts`:

```ts
describe('parseClientProfileForm', () => {
  const fd = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };

  it('parses a full profile', () => {
    const r = parseClientProfileForm(fd([
      ['name', ' Comfort Air '], ['verticalId', 'hvac_plumbing'], ['services', 'ac_tune_up'], ['services', 'furnace_tune_up'],
      ['keywords', 'ac repair\nhvac\n'], ['center', '33.9526, -84.3346'], ['radiusKm', '15'], ['zips', '30338, 30346 30350'],
      ['towns', 'Dunwoody\nSandy Springs'], ['placeId', ''], ['timezone', 'America/New_York'],
    ]));
    expect(r).toEqual({
      name: 'Comfort Air', verticalId: 'hvac_plumbing', services: ['ac_tune_up', 'furnace_tune_up'], keywords: ['ac repair', 'hvac'], placeId: null, timezone: 'America/New_York',
      serviceArea: { center: { lat: 33.9526, lng: -84.3346 }, radiusKm: 15, zips: ['30338', '30346', '30350'], towns: ['Dunwoody', 'Sandy Springs'] },
    });
  });

  it('leaves the service area empty when no centre and no ZIPs are given', () => {
    const r = parseClientProfileForm(fd([['name', 'X'], ['verticalId', 'dental'], ['center', ''], ['radiusKm', ''], ['zips', '']]));
    expect(r).toMatchObject({ serviceArea: null, services: [], keywords: [] });
  });

  it('explains an unreadable centre or radius', () => {
    expect(parseClientProfileForm(fd([['name', 'X'], ['center', 'Dunwoody'], ['radiusKm', '10']]))).toEqual({ error: 'Enter the centre as "latitude, longitude" (e.g. 33.95, -84.33)' });
    expect(parseClientProfileForm(fd([['name', 'X'], ['center', '33.9, -84.3'], ['radiusKm', 'far']]))).toEqual({ error: 'Enter the radius in kilometres' });
  });
});
```

`apps/web/src/components/client-profile-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [{ ok: true }, vi.fn(), false] }));
const { ClientProfileForm } = await import('./client-profile-form');

const verticals = [
  { id: 'hvac_plumbing', name: 'HVAC & Plumbing', services: [{ id: 'ac_tune_up', name: 'AC tune-up' }] },
  { id: 'dental', name: 'Dental', services: [{ id: 'cleaning', name: 'Cleaning' }] },
];

describe('ClientProfileForm', () => {
  it('shows the services of the chosen vertical when creating', () => {
    render(<ClientProfileForm mode="create" action={vi.fn()} verticals={verticals} timezoneOptions={['America/Chicago']} />);
    expect(screen.getByLabelText('AC tune-up')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Vertical'), { target: { value: 'dental' } });
    expect(screen.queryByLabelText('AC tune-up')).toBeNull();
    expect(screen.getByLabelText('Cleaning')).toBeTruthy();
  });

  it('fixes the vertical and pre-fills values when editing', () => {
    render(
      <ClientProfileForm mode="edit" action={vi.fn()} verticals={verticals} clientId="c1"
        initial={{ name: 'Comfort Air', verticalId: 'hvac_plumbing', services: ['ac_tune_up'], keywords: ['ac repair'], placeId: null,
          serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: ['30338'] } }} />,
    );
    expect(screen.queryByLabelText('Vertical')).toBeNull();
    expect((screen.getByLabelText('AC tune-up') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/centre/i) as HTMLInputElement).value).toBe('33.95, -84.33');
  });
});
```

Add to `sidebar-nav.test.tsx`:

```tsx
it('shows Profile for agency users inside a client', () => {
  pathname = `/c/${CLIENT_ID}/settings/profile`;
  render(<SidebarNav flags={agencyAdmin} />);
  expect(activeHrefOf()).toBe(`/c/${CLIENT_ID}/settings/profile`);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/server/forms.test.ts src/components/client-profile-form.test.tsx src/components/shell/sidebar-nav.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/server/forms.ts` — add:

```ts
import type { ServiceAreaInput } from '@cs/tools';

export interface ClientProfileFields {
  name: string;
  verticalId: string;
  services: string[];
  keywords: string[];
  serviceArea: ServiceAreaInput | null;
  placeId: string | null;
  timezone?: string;
}

const lines = (v: string) => v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const CENTER = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Range checks happen in the tool (`clientInputProblems`); this only reads the form. */
export function parseClientProfileForm(fd: FormData): ClientProfileFields | { error: string } {
  const center = str(fd, 'center');
  const radius = str(fd, 'radiusKm');
  const zips = str(fd, 'zips').split(/[\s,;]+/).filter(Boolean);
  let serviceArea: ServiceAreaInput | null = null;
  if (center || zips.length) {
    const m = CENTER.exec(center);
    if (!m) return { error: 'Enter the centre as "latitude, longitude" (e.g. 33.95, -84.33)' };
    const radiusKm = Number(radius);
    if (!radius || !Number.isFinite(radiusKm)) return { error: 'Enter the radius in kilometres' };
    const towns = lines(str(fd, 'towns'));
    serviceArea = { center: { lat: Number(m[1]), lng: Number(m[2]) }, radiusKm, zips, ...(towns.length ? { towns } : {}) };
  }
  const tz = str(fd, 'timezone');
  return {
    name: str(fd, 'name'), verticalId: str(fd, 'verticalId'), services: fd.getAll('services').map(String), keywords: lines(str(fd, 'keywords')),
    serviceArea, placeId: str(fd, 'placeId') || null, ...(tz ? { timezone: tz } : {}),
  };
}
```

`apps/web/src/server/verticals.ts`:

```ts
import 'server-only';
import { listVerticalPacks, loadVerticalPack } from '@cs/verticals';

export interface VerticalOption {
  id: string;
  name: string;
  services: { id: string; name: string }[];
}

let cached: Promise<VerticalOption[]> | null = null;
/** Packs are static YAML bundled with the app; read them once per process. */
export function verticalOptions(): Promise<VerticalOption[]> {
  cached ??= (async () => {
    const ids = await listVerticalPacks();
    const packs = await Promise.all(ids.map((id) => loadVerticalPack(id)));
    return packs.map((p) => ({ id: p.id, name: p.name, services: p.services.map((s) => ({ id: s.id, name: s.name })) }));
  })();
  return cached;
}
```

(Turbopack can't resolve `new URL('<relative>', import.meta.url)` lookups — `@cs/verticals`' loader already uses `path.join(dirname(fileURLToPath(import.meta.url)), …)` (HANDOVER §6). If `next build` cannot find `packs/*.yaml` at runtime, add `outputFileTracingIncludes: { '/**': ['../../packages/verticals/packs/**'] }` to `next.config.ts` — roadmap Phase 1 carry-over "file tracing for `packages/verticals/packs/`".)

`apps/web/src/components/client-profile-form.tsx`:

```tsx
'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';
import type { VerticalOption } from '@/server/verticals';

const selectClass = 'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const areaClass = 'min-h-20 w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

interface Initial {
  name: string;
  verticalId: string;
  services: string[];
  keywords: string[];
  placeId: string | null;
  serviceArea: { center: { lat: number; lng: number }; radiusKm: number; zips: string[]; towns?: string[] } | null;
}

type Props =
  | { mode: 'create'; action: (prev: FormResult, fd: FormData) => Promise<FormResult>; verticals: VerticalOption[]; timezoneOptions: string[]; initial?: undefined; clientId?: undefined }
  | { mode: 'edit'; action: (prev: FormResult, fd: FormData) => Promise<FormResult>; verticals: VerticalOption[]; initial: Initial; clientId: string; timezoneOptions?: undefined };

export function ClientProfileForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, { ok: true } as FormResult);
  const [verticalId, setVerticalId] = useState(props.initial?.verticalId ?? props.verticals[0]?.id ?? '');
  const services = props.verticals.find((v) => v.id === verticalId)?.services ?? [];
  const area = props.initial?.serviceArea ?? null;
  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
      {props.mode === 'edit' && <input type="hidden" name="clientId" value={props.clientId} />}
      {props.mode === 'edit' && <input type="hidden" name="verticalId" value={verticalId} />}
      {!state.ok && state.error && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={props.initial?.name} className="max-w-sm" />
      </div>

      {props.mode === 'create' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="verticalId">Vertical</Label>
          <select id="verticalId" name="verticalId" value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className={selectClass}>
            {props.verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Services the business offers</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input type="checkbox" name="services" value={s.id} defaultChecked={props.initial?.services.includes(s.id)} className="h-4 w-4" aria-label={s.name} />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="keywords">Search keywords (one per line, up to 5)</Label>
        <textarea id="keywords" name="keywords" defaultValue={props.initial?.keywords.join('\n')} className={areaClass} />
        <p className="text-muted-foreground">Used for competitor discovery and local-ranking scans, e.g. “ac repair”.</p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">Service area</legend>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="center">Map centre (latitude, longitude)</Label>
            <Input id="center" name="center" placeholder="33.95, -84.33" defaultValue={area ? `${area.center.lat}, ${area.center.lng}` : ''} className="w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="radiusKm">Radius (km)</Label>
            <Input id="radiusKm" name="radiusKm" inputMode="decimal" defaultValue={area ? String(area.radiusKm) : ''} className="w-28" />
          </div>
        </div>
        <p className="text-muted-foreground">In Google Maps, right-click the business location and click the coordinates to copy them.</p>
        <Label htmlFor="zips">ZIP codes served</Label>
        <textarea id="zips" name="zips" defaultValue={area?.zips.join(', ')} className={areaClass} />
        <Label htmlFor="towns">Towns served (one per line, optional)</Label>
        <textarea id="towns" name="towns" defaultValue={area?.towns?.join('\n')} className={areaClass} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="placeId">Google place id (optional)</Label>
        <Input id="placeId" name="placeId" defaultValue={props.initial?.placeId ?? ''} className="max-w-md" />
        <p className="text-muted-foreground">Lets Rival Monday benchmark the business’s own reviews against its competitors.</p>
      </div>

      {props.mode === 'create' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="timezone">Business time zone</Label>
          <select id="timezone" name="timezone" defaultValue="America/Chicago" className={selectClass}>
            {props.timezoneOptions.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      )}

      <Button type="submit" disabled={pending} className="self-start">{props.mode === 'create' ? 'Create client' : 'Save profile'}</Button>
    </form>
  );
}
```

The label text "Map centre (latitude, longitude)" matches the test's `/centre/i`; the vertical `<select>` is labelled "Vertical" via `htmlFor`. If `getByLabelText('Vertical')` resolves ambiguously, keep the `<Label>` text exactly `Vertical`.

`apps/web/src/app/(app)/agency/clients/new/actions.ts`:

```ts
'use server';
import { isAgencyRole } from '@cs/core';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseClientProfileForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function createClientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const parsed = parseClientProfileForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const r = await runTool<{ clientId: string }>(ctx, 'create_client', parsed);
  if (!r.ok) return r;
  redirect(`/c/${r.data.clientId}/competitors`);
}
```

`apps/web/src/app/(app)/agency/clients/new/page.tsx`:

```tsx
import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { ClientProfileForm } from '@/components/client-profile-form';
import { requireContext } from '@/server/current-viewer';
import { timezoneOptions } from '@/server/timezones';
import { verticalOptions } from '@/server/verticals';
import { createClientAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Add a client</h1>
      <p className="text-muted-foreground">Next you’ll pick 3–5 competitors to monitor.</p>
      <ClientProfileForm mode="create" action={createClientAction} verticals={await verticalOptions()} timezoneOptions={timezoneOptions('America/Chicago')} />
    </>
  );
}
```

`apps/web/src/app/(app)/c/[clientId]/settings/profile/actions.ts`:

```ts
'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseClientProfileForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function updateProfileAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const clientId = String(formData.get('clientId') ?? '');
  const parsed = parseClientProfileForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const { verticalId: _v, timezone: _t, ...patch } = parsed;
  const r = await runTool(ctx, 'update_client_profile', { clientId, ...patch });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}`, 'layout');
  return { ok: true, message: 'Profile saved.' };
}
```

`apps/web/src/app/(app)/c/[clientId]/settings/profile/page.tsx`:

```tsx
import { isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientProfileForm } from '@/components/client-profile-form';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { updateProfileAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const p = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Profile — {p.name}</h1>
      <p className="text-muted-foreground">
        Time zone and delivery live under <Link href={`/c/${clientId}/settings/delivery`} className="font-semibold text-primary-soft-text">Delivery</Link>.
      </p>
      <ClientProfileForm
        mode="edit" action={updateProfileAction} verticals={await verticalOptions()} clientId={clientId}
        initial={{ name: p.name, verticalId: p.verticalId, services: p.services, keywords: p.keywords, placeId: p.placeId, serviceArea: p.serviceArea }}
      />
    </>
  );
}
```

Nav: in `nav-items.ts` add `'profile'` to the `NavItem['icon']` union and, in the agency client-scoped block after Overview, `items.push({ href: \`/c/${clientId}/settings/profile\`, label: 'Profile', icon: 'profile' });`. In `sidebar-nav.tsx` import `Building2` from `lucide-react` and add `profile: Building2` to `ICONS`.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add-client and client profile screens"
```

---

### Task 4: Competitor suggestions — request, list, accept, dismiss

**Files:**
- Create: `packages/tools/src/limits.ts`, `packages/tools/src/tools/competitors.ts`, `packages/tools/src/tools/competitors.test.ts`
- Modify: `packages/collectors/src/local/accept.ts`, `packages/collectors/src/local/accept.test.ts` (or the file holding `acceptSuggestion`'s tests — `grep -rln acceptSuggestion packages/collectors/src`), `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/index.ts`

**Interfaces:**
- Consumes: `acceptSuggestion` (`@cs/collectors`); `enqueueOf`, `ToolDeps` (Task 1); `client`, `clientCompetitor`, `competitor`, `competitorSuggestion`, `trackedPage`, `withTenant` (`@cs/db`).
- Produces:
  - `COMPETITOR_LIMIT = 5`, `MAX_ACTIVE_PAGES = 25` (`src/limits.ts`)
  - `type Discovery = 'queued' | 'disabled' | 'not_needed'`; `startDiscovery(deps: ToolDeps, competitorId: string): Promise<Discovery>`; `assertRoomForCompetitor(tx: Tx, clientId: string, competitorId: string | null): Promise<void>` (exported from `tools/competitors.ts` for Task 5)
  - zod `SuggestionView` = `{ id, name, domain: string|null, placeId: string|null, rating: number|null, votes: number|null, appearances: number, bestRank: number|null, overlapScore: number }`
  - tools `list_competitor_suggestions {clientId}` → `{ items: SuggestionView[] }`; `request_competitor_suggestions {clientId}` → `{ queued: true }`; `accept_competitor_suggestion {suggestionId}` → `{ competitorId, discovery }`; `dismiss_competitor_suggestion {suggestionId}` → `{ dismissed: true }`

- [ ] **Step 1: Write the failing tests**

In the collectors test for `acceptSuggestion`, add:

```ts
it('reports an unknown or invisible suggestion as a not_found ToolError', async () => {
  await expect(acceptSuggestion({ service: dbs.service, app: dbs.app }, adminCtx, '00000000-0000-4000-8000-00000000dead')).rejects.toMatchObject({ code: 'not_found' });
});
```

(Use that file's existing db handles and agency context names.)

`packages/tools/src/tools/competitors.test.ts`:

```ts
import { type AccessContext, createAccessContext, type Feature } from '@cs/core';
import { client, clientCompetitor, competitor, competitorSuggestion, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const reg = (webMonitoring: boolean) => createToolRegistry({ app: dbs.app, service: dbs.service, enqueue, webMonitoring }, { audit: { record: async () => {} } });
const registry = reg(false);
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], features: Feature[] = [], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features });
const admin = ctx('agency_admin', 'all');
const amA1 = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);

async function suggest(clientId: string, agencyId: string, name: string, placeId: string, domain: string | null = null): Promise<string> {
  const [s] = await dbs.owner.insert(competitorSuggestion).values({ agencyId, clientId, name, placeId, domain, appearances: 3, overlapScore: 0.8 }).returning();
  return s!.id;
}

beforeEach(async () => {
  enqueue.mockClear();
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('request_competitor_suggestions', () => {
  it('needs keywords and a service area, then enqueues one deduped job', async () => {
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input' });
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 10, zips: [] } }).where(eq(client.id, IDS.clientA1));
    await registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 });
    expect(enqueue).toHaveBeenCalledWith('suggest-competitors', { clientId: IDS.clientA1 }, `suggest:${IDS.clientA1}`);
  });

  it('is agency-only and scoped', async () => {
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['manage_competitors']), 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(amA1, 'request_competitor_suggestions', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('suggestions', () => {
  it('lists open suggestions best first, for agency roles and owners with the flag only', async () => {
    await suggest(IDS.clientA1, IDS.agencyA, 'Low', 'ChIJlowlowlow1', null);
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'High', placeId: 'ChIJhighhigh1', appearances: 9, overlapScore: 0.95 });
    const { items } = (await registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA1 })) as { items: { name: string }[] };
    expect(items.map((i) => i.name)).toEqual(['High', 'Low']);
    await expect(registry.invoke(owner, 'list_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['manage_competitors']), 'list_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toBeTruthy();
  });

  it('accepts: links the competitor, starts vendor sources, and enqueues discovery only when monitoring is on', async () => {
    const off = await suggest(IDS.clientA1, IDS.agencyA, 'Peachtree Air', 'ChIJpeachtree1', 'peachtreeair.com');
    const r1 = (await registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: off })) as { competitorId: string; discovery: string };
    expect(r1.discovery).toBe('disabled');
    expect(enqueue).not.toHaveBeenCalled();
    const links = await dbs.owner.select().from(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, r1.competitorId)));
    expect(links).toHaveLength(1);

    const on = await suggest(IDS.clientA1, IDS.agencyA, 'Metro Comfort', 'ChIJmetrocomf1', 'metrocomfort.com');
    const r2 = (await reg(true).invoke(amA1, 'accept_competitor_suggestion', { suggestionId: on })) as { competitorId: string; discovery: string };
    expect(r2.discovery).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith('discover-pages', { competitorId: r2.competitorId }, `discover:${r2.competitorId}`);

    // A competitor that already has tracked pages is not re-discovered.
    await dbs.owner.insert(trackedPage).values({ competitorId: r2.competitorId, url: 'https://metrocomfort.com/', pageType: 'home', source: 'nav', cadence: 'daily' });
    const again = await suggest(IDS.clientA2, IDS.agencyA, 'Metro Comfort', 'ChIJmetrocomf1', 'metrocomfort.com');
    const r3 = (await reg(true).invoke(admin, 'accept_competitor_suggestion', { suggestionId: again })) as { discovery: string };
    expect(r3.discovery).toBe('not_needed');
  });

  it('enforces the competitor limit', async () => {
    for (let i = 0; i < 4; i++) {
      const [c] = await dbs.owner.insert(competitor).values({ name: `C${i}` }).returning();
      await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: c!.id });
    }
    const sixth = await suggest(IDS.clientA1, IDS.agencyA, 'Sixth', 'ChIJsixthsixth');
    await expect(registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: sixth })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('5 competitors') });
  });

  it('dismisses, and refuses other scopes (Review Focus 1)', async () => {
    const id = await suggest(IDS.clientA1, IDS.agencyA, 'Nope', 'ChIJnopenopeno');
    await registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: id });
    const [s] = await dbs.owner.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, id));
    expect(s!.status).toBe('dismissed');
    await expect(registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: id })).rejects.toMatchObject({ code: 'not_found' });
    const other = await suggest(IDS.clientA2, IDS.agencyA, 'A2 only', 'ChIJa2onlya2on');
    await expect(registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: other })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: other })).rejects.toMatchObject({ code: 'not_found' });
    const foreign = await suggest(IDS.clientB1, IDS.agencyB, 'B1 only', 'ChIJb1onlyb1on');
    await expect(registry.invoke(admin, 'accept_competitor_suggestion', { suggestionId: foreign })).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

(`seedTenancy` links A1 to competitor X, so A1 starts with 1 competitor; the limit test adds 4 → 5.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/competitors.test.ts` → FAIL; the new collectors test → FAIL (plain `Error`).

- [ ] **Step 3: Implement**

`packages/collectors/src/local/accept.ts`: replace `if (!s) throw new Error('Suggestion not found');` with `if (!s) throw new ToolError('not_found', 'Suggestion not found');` (`ToolError` is already imported).

`packages/tools/src/limits.ts`:

```ts
/** Decision 5 (spec §4.1 "AM confirms 3–5"); configurable per agency/tier in 5b-2. */
export const COMPETITOR_LIMIT = 5;
/** Spec §4.1: cap ≈ 25 tracked pages per competitor. */
export const MAX_ACTIVE_PAGES = 25;
```

Add to `schemas.ts`:

```ts
export const SuggestionView = z.object({
  id: uuid, name: z.string(), domain: z.string().nullable(), placeId: z.string().nullable(), rating: z.number().nullable(), votes: z.number().nullable(),
  appearances: z.number(), bestRank: z.number().nullable(), overlapScore: z.number(),
});
export type SuggestionView = z.infer<typeof SuggestionView>;
```

`packages/tools/src/tools/competitors.ts`:

```ts
import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { acceptSuggestion } from '@cs/collectors';
import { client, clientCompetitor, competitor, competitorSuggestion, trackedPage, type Tx, withTenant } from '@cs/db';
import { and, count, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, type ToolDeps } from '../deps';
import { COMPETITOR_LIMIT } from '../limits';
import { SuggestionView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export type Discovery = 'queued' | 'disabled' | 'not_needed';

/** Decision 7: page discovery crawls the competitor's site, so it only runs with website monitoring switched on. */
export async function startDiscovery(deps: ToolDeps, competitorId: string): Promise<Discovery> {
  if (!deps.webMonitoring) return 'disabled';
  const [c] = await deps.service.select({ domain: competitor.domain }).from(competitor).where(eq(competitor.id, competitorId));
  if (!c?.domain) return 'not_needed';
  const [pages] = await deps.service.select({ n: count() }).from(trackedPage).where(eq(trackedPage.competitorId, competitorId));
  if ((pages?.n ?? 0) > 0) return 'not_needed';
  await enqueueOf(deps)('discover-pages', { competitorId }, `discover:${competitorId}`);
  return 'queued';
}

/** Decision 5. Call inside the caller's tenant transaction; a competitor already linked to the client doesn't count twice. */
export async function assertRoomForCompetitor(tx: Tx, clientId: string, competitorId: string | null): Promise<void> {
  const where = competitorId ? and(eq(clientCompetitor.clientId, clientId), ne(clientCompetitor.competitorId, competitorId)) : eq(clientCompetitor.clientId, clientId);
  const [row] = await tx.select({ n: count() }).from(clientCompetitor).where(where);
  if ((row?.n ?? 0) >= COMPETITOR_LIMIT) throw new ToolError('invalid_input', `A client can track at most ${COMPETITOR_LIMIT} competitors — remove one first`);
}

export const listCompetitorSuggestions = defineTool({
  name: 'list_competitor_suggestions',
  description: 'List open competitor suggestions for a client, strongest overlap first.',
  input: z.object({ clientId: uuid }),
  output: z.object({ items: z.array(SuggestionView) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select().from(competitorSuggestion).where(and(eq(competitorSuggestion.clientId, clientId), eq(competitorSuggestion.status, 'suggested'))).orderBy(desc(competitorSuggestion.overlapScore), desc(competitorSuggestion.appearances)).limit(50));
    return { items: rows.map((s) => ({ id: s.id, name: s.name, domain: s.domain, placeId: s.placeId, rating: s.rating, votes: s.votes, appearances: s.appearances, bestRank: s.bestRank, overlapScore: s.overlapScore })) };
  },
});

export const requestCompetitorSuggestions = defineTool({
  name: 'request_competitor_suggestions',
  description: 'Search Google Maps around the client’s service area for likely competitors (paid; runs in the background).',
  input: z.object({ clientId: uuid }),
  output: z.object({ queued: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ keywords: client.keywords, serviceArea: client.serviceArea }).from(client).where(eq(client.id, clientId)));
    if (!c) throw new ToolError('not_found', 'Client not found');
    if (c.keywords.length === 0 || !c.serviceArea) throw new ToolError('invalid_input', 'Add at least one keyword and a service area to the client profile first');
    await enqueueOf(deps)('suggest-competitors', { clientId }, `suggest:${clientId}`);
    return { queued: true as const };
  },
});

export const acceptCompetitorSuggestion = defineTool({
  name: 'accept_competitor_suggestion',
  description: 'Start tracking a suggested competitor for its client.',
  input: z.object({ suggestionId: uuid }),
  output: z.object({ competitorId: uuid, discovery: z.enum(['queued', 'disabled', 'not_needed']) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { suggestionId }, deps) {
    await withTenant(deps.app, ctx, async (tx) => {
      const [s] = await tx.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId));
      if (!s || !canAccessClient(ctx, s.clientId)) throw new ToolError('not_found', 'Suggestion not found');
      const existing = s.placeId ? (await tx.select({ id: competitor.id }).from(competitor).where(eq(competitor.placeId, s.placeId)))[0] : undefined;
      await assertRoomForCompetitor(tx, s.clientId, existing?.id ?? null);
    });
    const { competitorId } = await acceptSuggestion({ service: deps.service, app: deps.app }, ctx, suggestionId);
    return { competitorId, discovery: await startDiscovery(deps, competitorId) };
  },
});

export const dismissCompetitorSuggestion = defineTool({
  name: 'dismiss_competitor_suggestion',
  description: 'Hide a competitor suggestion.',
  input: z.object({ suggestionId: uuid }),
  output: z.object({ dismissed: z.literal(true) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { suggestionId }, deps) {
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.update(competitorSuggestion).set({ status: 'dismissed' }).where(and(eq(competitorSuggestion.id, suggestionId), eq(competitorSuggestion.status, 'suggested'))).returning({ clientId: competitorSuggestion.clientId }));
    if (!rows[0] || !canAccessClient(ctx, rows[0].clientId)) throw new ToolError('not_found', 'Suggestion not found');
    return { dismissed: true as const };
  },
});

export const competitorTools = [listCompetitorSuggestions, requestCompetitorSuggestions, acceptCompetitorSuggestion, dismissCompetitorSuggestion];
```

Notes for the implementer:
- `competitor` is visible to `app_user` only when tracked by a visible client, so the place-id lookup inside `withTenant` finds an existing row only if the agency already tracks it — that is enough for the "already linked doesn't count twice" rule.
- In `dismissCompetitorSuggestion`, RLS already hides other clients' rows; the `canAccessClient` re-check is the second barrier for an AM whose RLS scope equals their scope (it always does — keep it anyway, it documents intent).
- Append `...competitorTools` to `allTools`; add `export * from './limits';` and `export { startDiscovery, assertRoomForCompetitor, type Discovery } from './tools/competitors';` to `src/index.ts`.

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/tools/competitors.test.ts` and the collectors accept test → PASS; typecheck both packages.

- [ ] **Step 5: Commit**

```bash
git add packages/tools packages/collectors
git commit -m "feat(tools): competitor suggestion tools with limit and website-monitoring gate"
```

---

### Task 5: Manual add / remove competitor, `list_client_competitors`, untracked collection stops

**Files:**
- Modify: `packages/tools/src/tools/competitors.ts`, `packages/tools/src/tools/competitors.test.ts`, `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/alerts.ts`, `packages/tools/src/tools/read-tools.test.ts`, `packages/collectors/src/sources/due.ts`, `packages/collectors/src/schedule/due-pages.ts`, and their tests (`grep -rln "claimDueSources\|claimDuePages" packages/collectors/src --include=*.test.ts`)

**Interfaces:**
- Consumes: `findExistingCompetitor`, `ensureCompetitorSources` (`@cs/collectors`); `startDiscovery`, `assertRoomForCompetitor` (Task 4).
- Produces:
  - `normalizeDomain(raw: string): string | null` (exported from `tools/competitors.ts`)
  - zod `TrackedCompetitor` = `{ id, name, domain: string|null, placeId: string|null, addedAt: string, activePages: number }`
  - tools `list_client_competitors {clientId}` → `{ items: TrackedCompetitor[] }`; `add_competitor {clientId, name, domain?, placeId?}` → `{ competitorId, discovery }`; `remove_competitor {clientId, competitorId}` → `{ removed: true }`

- [ ] **Step 1: Write the failing tests**

Append to `competitors.test.ts`:

```ts
import { alert, changeEvent } from '@cs/db';
import { normalizeDomain } from './competitors';

describe('manual competitors', () => {
  it('normalises websites to a bare host', () => {
    expect(normalizeDomain('https://www.SmithHVAC.com/about?x=1')).toBe('smithhvac.com');
    expect(normalizeDomain('smithhvac.com')).toBe('smithhvac.com');
    expect(normalizeDomain('not a domain')).toBeNull();
  });

  it('adds by website, reusing an existing global row, and lists tracked competitors', async () => {
    await dbs.owner.update(competitor).set({ domain: 'smithhvac.com' }).where(eq(competitor.id, IDS.competitorX));
    const r = (await registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'Ignored Name', domain: 'https://smithhvac.com' })) as { competitorId: string };
    expect(r.competitorId).toBe(IDS.competitorX);
    const n = (await registry.invoke(admin, 'add_competitor', { clientId: IDS.clientA2, name: 'Fresh Plumbing', domain: 'freshplumbing.com' })) as { competitorId: string; discovery: string };
    expect(n.discovery).toBe('disabled');
    const { items } = (await registry.invoke(admin, 'list_client_competitors', { clientId: IDS.clientA2 })) as { items: { name: string }[] };
    expect(items.map((i) => i.name).sort()).toEqual(['Bright Smiles', 'Fresh Plumbing']);
    await expect(registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'X' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA2, name: 'X', domain: 'x.com' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('removes a competitor; its alerts still list with a fallback name (Review Focus 3)', async () => {
    const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning();
    await dbs.owner.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e!.id, score: 80, headline: 'Price cut', status: 'delivered', mode: 'direct' });
    await registry.invoke(amA1, 'remove_competitor', { clientId: IDS.clientA1, competitorId: IDS.competitorX });
    const { items } = (await registry.invoke(amA1, 'list_alerts', { clientId: IDS.clientA1 })) as { items: { competitorName: string }[] };
    expect(items).toEqual([expect.objectContaining({ competitorName: 'Competitor' })]);
    await expect(registry.invoke(amA1, 'remove_competitor', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'not_found' });
    // Re-adding works.
    await registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'Smith HVAC', placeId: 'ChIJsmithsmith1' });
  });
});
```

(B1 still tracks X after A1 removes it, so the global row stays; the re-add uses a new place id and creates a new row — that's fine for the test.)

In the collectors scheduling tests, add (adapting fixture names):

```ts
it('never claims vendor sources of a competitor nobody tracks; a self business keeps gbp/reviews', async () => {
  // competitor U: no client_competitor link, not a self business; competitor S: some client's self_competitor_id
  // seed competitor_source rows (all five kinds) for both, due now
  const claimed = await claimDueSources(dbs.service, 100);
  expect(claimed.filter((c) => c.competitorId === U)).toEqual([]);
  expect(claimed.filter((c) => c.competitorId === S).map((c) => c.source).sort()).toEqual(['gbp', 'reviews']);
});

it('never claims tracked pages of a competitor nobody tracks', async () => {
  // a due tracked_page for untracked competitor U, and one for tracked competitor T
  expect(await claimDuePages(dbs.service, 100)).toEqual([pageOfT]);
});
```

Write these with real inserts (`competitor`, `competitorSource`, `client.selfCompetitorId`, `trackedPage`), matching each test file's setup helpers. **Existing tests** in these files may seed due sources/pages for competitors that no client tracks — link those competitors via `client_competitor` (after `seedTenancy`) so they keep passing.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/competitors.test.ts` and the collectors scheduling tests → FAIL.

- [ ] **Step 3: Implement**

Add to `schemas.ts`:

```ts
export const TrackedCompetitor = z.object({ id: uuid, name: z.string(), domain: z.string().nullable(), placeId: z.string().nullable(), addedAt: iso, activePages: z.number().int() });
export type TrackedCompetitor = z.infer<typeof TrackedCompetitor>;
```

Add to `tools/competitors.ts` (extend the imports: `findExistingCompetitor`, `ensureCompetitorSources` from `@cs/collectors`; `asc`, `sql` from `drizzle-orm`; `TrackedCompetitor` from `./schemas`):

```ts
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Smith.com/x" → "smith.com"; null when it isn't a host name. */
export function normalizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  return HOST.test(host) ? host : null;
}

export const listClientCompetitors = defineTool({
  name: 'list_client_competitors',
  description: 'List the competitors a client tracks, with their number of active tracked pages.',
  input: z.object({ clientId: uuid }),
  output: z.object({ items: z.array(TrackedCompetitor) }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx
        .select({
          id: competitor.id, name: competitor.name, domain: competitor.domain, placeId: competitor.placeId, addedAt: clientCompetitor.createdAt,
          activePages: sql<number>`(select count(*)::int from tracked_page tp where tp.competitor_id = ${competitor.id} and tp.active)`,
        })
        .from(clientCompetitor)
        .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
        .where(eq(clientCompetitor.clientId, clientId))
        .orderBy(asc(competitor.name)));
    return { items: rows.map((r) => ({ ...r, addedAt: r.addedAt.toISOString() })) };
  },
});

export const addCompetitor = defineTool({
  name: 'add_competitor',
  description: 'Track a competitor by website and/or Google place id.',
  input: z.object({ clientId: uuid, name: z.string().min(1).max(120), domain: z.string().max(300).optional(), placeId: z.string().max(300).optional() }),
  output: z.object({ competitorId: uuid, discovery: z.enum(['queued', 'disabled', 'not_needed']) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, input, deps) {
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const domain = input.domain?.trim() ? normalizeDomain(input.domain) : null;
    if (input.domain?.trim() && !domain) throw new ToolError('invalid_input', 'That website doesn’t look like a domain (e.g. smithhvac.com)');
    const placeId = input.placeId?.trim() || null;
    if (placeId && !/^[A-Za-z0-9_-]{10,200}$/.test(placeId)) throw new ToolError('invalid_input', 'Google place id looks wrong');
    if (!domain && !placeId) throw new ToolError('invalid_input', 'Give the competitor’s website or Google place id');
    const [visible] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, input.clientId)));
    if (!visible) throw new ToolError('not_found', 'Client not found');

    // Reuse a global row by place/cid first; for a typed website, the exact domain owner is that business.
    let row = await findExistingCompetitor(deps.service, { placeId, cid: null, domain });
    if (!row && domain) row = (await deps.service.select().from(competitor).where(eq(competitor.domain, domain)).limit(1))[0];
    await withTenant(deps.app, ctx, (tx) => assertRoomForCompetitor(tx, input.clientId, row?.id ?? null));
    let competitorId = row?.id;
    if (!competitorId) {
      const inserted = await deps.service.insert(competitor).values({ name: input.name.trim(), domain, placeId }).onConflictDoNothing().returning({ id: competitor.id });
      competitorId = inserted[0]?.id ?? (await findExistingCompetitor(deps.service, { placeId, cid: null, domain }))?.id;
      if (!competitorId) throw new ToolError('invalid_input', 'That competitor could not be added — try again');
    }
    await withTenant(deps.app, ctx, (tx) => tx.insert(clientCompetitor).values({ agencyId: ctx.agencyId, clientId: input.clientId, competitorId: competitorId! }).onConflictDoNothing());
    await ensureCompetitorSources(deps.service, competitorId);
    return { competitorId, discovery: await startDiscovery(deps, competitorId) };
  },
});

export const removeCompetitor = defineTool({
  name: 'remove_competitor',
  description: 'Stop tracking a competitor for a client. History is kept; collection stops once no client tracks it.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: z.object({ removed: z.literal(true) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { clientId, competitorId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Competitor not found');
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.delete(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))).returning({ id: clientCompetitor.competitorId }));
    if (rows.length === 0) throw new ToolError('not_found', 'Competitor not found');
    return { removed: true as const };
  },
});
```

Change the `competitorTools` array to include `listClientCompetitors, addCompetitor, removeCompetitor`.

`packages/tools/src/tools/alerts.ts` `listAlerts`: `.innerJoin(competitor, …)` → `.leftJoin(competitor, eq(competitor.id, alert.competitorId))`, and map `competitorName: competitorName ?? 'Competitor'` (5a carry-over). Add a `read-tools.test.ts` case if Task 5's competitor test doesn't already cover it (it does — keep one assertion there).

`packages/collectors/src/sources/due.ts` — the inner `SELECT` gains the tracked-only rule (decision 8):

```ts
       SELECT competitor_id, source FROM competitor_source cs
        WHERE active AND next_due_at <= now()
          AND (EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = cs.competitor_id)
               OR (cs.source IN ('gbp', 'reviews') AND EXISTS (SELECT 1 FROM client c WHERE c.self_competitor_id = cs.competitor_id)))
        ORDER BY next_due_at LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
```

(`SELF_SOURCES` in `local/self.ts` is `['gbp','reviews']` — keep the literal list in sync and say so in a comment.) Update the doc comment: "Untracked competitors are skipped (5b-1 decision 8): their rows stay due and resume when a client tracks them again."

`packages/collectors/src/schedule/due-pages.ts` inner `SELECT`:

```ts
       SELECT id FROM tracked_page tp
        WHERE active AND next_due_at <= now()
          AND EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = tp.competitor_id)
        ORDER BY next_due_at
```

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/tools` and `pnpm --filter @cs/collectors exec vitest run <the two scheduling test files>` → PASS. Typecheck both packages.

- [ ] **Step 5: Commit**

```bash
git add packages/tools packages/collectors
git commit -m "feat(tools,collectors): add/remove competitors, list tracked competitors, stop collecting untracked ones"
```

---

### Task 6: Tracked-page tools — list, pin/unpin, manual add

**Files:**
- Create: `packages/tools/src/tools/pages.ts`, `packages/tools/src/tools/pages.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: `MAX_ACTIVE_PAGES` (Task 4); `PAGE_TYPES`, `PageType` (`@cs/core`); `trackedPage`, `clientCompetitor`, `competitor`, `withTenant` (`@cs/db`).
- Produces:
  - `defaultCadence(pageType: string): 'daily' | 'weekly'`
  - zod `TrackedPageView` = `{ id, url, pageType, source, pinned: boolean, active: boolean, cadence, lastCapturedAt: string|null }`
  - tools `list_tracked_pages {clientId, competitorId}` → `{ items: TrackedPageView[] }`; `set_page_pin {clientId, pageId, pinned}` → `{ pageId }`; `add_tracked_page {clientId, competitorId, url, pageType}` → `{ pageId }`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/tools/pages.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { competitor, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';
import { defaultCadence } from './pages';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const reg = (webMonitoring: boolean) => createToolRegistry({ app: dbs.app, service: dbs.service, webMonitoring }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const amA1 = ctx('account_manager', [IDS.clientA1]);
let pricing = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(competitor).set({ domain: 'smithhvac.com' }).where(eq(competitor.id, IDS.competitorX));
  const [p] = await dbs.owner.insert(trackedPage).values({ competitorId: IDS.competitorX, url: 'https://smithhvac.com/blog/x', pageType: 'blog', source: 'sitemap', cadence: 'weekly' }).returning();
  pricing = p!.id;
});

describe('tracked pages', () => {
  it('default cadence follows the page type', () => {
    expect(defaultCadence('pricing')).toBe('daily');
    expect(defaultCadence('blog')).toBe('weekly');
  });

  it('lists pages of a tracked competitor only', async () => {
    const { items } = (await reg(false).invoke(amA1, 'list_tracked_pages', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as { items: { url: string }[] };
    expect(items.map((i) => i.url)).toEqual(['https://smithhvac.com/blog/x']);
    await expect(reg(false).invoke(amA1, 'list_tracked_pages', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('pins to daily and unpins back to the type default', async () => {
    await reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA1, pageId: pricing, pinned: true });
    expect((await dbs.owner.select().from(trackedPage).where(eq(trackedPage.id, pricing)))[0]).toMatchObject({ pinned: true, cadence: 'daily' });
    await reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA1, pageId: pricing, pinned: false });
    expect((await dbs.owner.select().from(trackedPage).where(eq(trackedPage.id, pricing)))[0]).toMatchObject({ pinned: false, cadence: 'weekly' });
    await expect(reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA2, pageId: pricing, pinned: true })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('adds manual pages only with monitoring on, on the competitor’s own host, under the cap (Review Focus 5)', async () => {
    const input = { clientId: IDS.clientA1, competitorId: IDS.competitorX, url: 'https://www.smithhvac.com/specials#top', pageType: 'promo' };
    await expect(reg(false).invoke(amA1, 'add_tracked_page', input)).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('monitoring') });
    const { pageId } = (await reg(true).invoke(amA1, 'add_tracked_page', input)) as { pageId: string };
    expect((await dbs.owner.select().from(trackedPage).where(eq(trackedPage.id, pageId)))[0]).toMatchObject({ url: 'https://www.smithhvac.com/specials', source: 'manual', pinned: true, cadence: 'daily', active: true });
    await expect(reg(true).invoke(amA1, 'add_tracked_page', { ...input, url: 'https://evil.example/specials' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(reg(true).invoke(amA1, 'add_tracked_page', { ...input, url: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'invalid_input' });
    for (let i = 0; i < 23; i++) await dbs.owner.insert(trackedPage).values({ competitorId: IDS.competitorX, url: `https://smithhvac.com/p${i}`, pageType: 'other', source: 'nav', cadence: 'weekly' });
    await expect(reg(true).invoke(amA1, 'add_tracked_page', { ...input, url: 'https://smithhvac.com/one-more' })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('25') });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/pages.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Add to `schemas.ts`:

```ts
export const TrackedPageView = z.object({
  id: uuid, url: z.string(), pageType: z.string(), source: z.string(), pinned: z.boolean(), active: z.boolean(), cadence: z.string(), lastCapturedAt: iso.nullable(),
});
export type TrackedPageView = z.infer<typeof TrackedPageView>;
```

`packages/tools/src/tools/pages.ts`:

```ts
import { type AccessContext, canAccessClient, PAGE_TYPES, toolkit, ToolError } from '@cs/core';
import { clientCompetitor, competitor, type Db, trackedPage, withTenant } from '@cs/db';
import { and, asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { MAX_ACTIVE_PAGES } from '../limits';
import { TrackedPageView, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAILY = new Set(['home', 'pricing', 'promo']);

/** Same split as discovery's `selectPages`: home/pricing/promo daily, everything else weekly. */
export const defaultCadence = (pageType: string): 'daily' | 'weekly' => (DAILY.has(pageType) ? 'daily' : 'weekly');

/** RLS proof that the caller's client tracks this competitor (Review Focus 1) — global rows are then written with the service Db. */
async function requireTracked(app: Db, ctx: AccessContext, clientId: string, competitorId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Competitor not found');
  const [link] = await withTenant(app, ctx, (tx) =>
    tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))));
  if (!link) throw new ToolError('not_found', 'Competitor not found');
}

const view = (p: typeof trackedPage.$inferSelect): TrackedPageView => ({
  id: p.id, url: p.url, pageType: p.pageType, source: p.source, pinned: p.pinned, active: p.active, cadence: p.cadence, lastCapturedAt: toIso(p.lastCapturedAt),
});

export const listTrackedPages = defineTool({
  name: 'list_tracked_pages',
  description: 'List the website pages monitored for one of the client’s competitors.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: z.object({ items: z.array(TrackedPageView) }),
  permission: 'read',
  async handler(ctx, { clientId, competitorId }, deps) {
    await requireTracked(deps.app, ctx, clientId, competitorId);
    const rows = await deps.service.select().from(trackedPage).where(eq(trackedPage.competitorId, competitorId)).orderBy(asc(trackedPage.pageType), asc(trackedPage.url));
    return { items: rows.map(view) };
  },
});

export const setPagePin = defineTool({
  name: 'set_page_pin',
  description: 'Pin a page (always monitored, daily) or unpin it (back to its normal cadence).',
  input: z.object({ clientId: uuid, pageId: uuid, pinned: z.boolean() }),
  output: z.object({ pageId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId, pageId, pinned }, deps) {
    const [p] = await deps.service.select().from(trackedPage).where(eq(trackedPage.id, pageId));
    if (!p) throw new ToolError('not_found', 'Page not found');
    await requireTracked(deps.app, ctx, clientId, p.competitorId);
    await deps.service.update(trackedPage).set({ pinned, cadence: pinned ? 'daily' : defaultCadence(p.pageType) }).where(eq(trackedPage.id, pageId));
    return { pageId };
  },
});

export const addTrackedPage = defineTool({
  name: 'add_tracked_page',
  description: 'Monitor an extra page of a competitor’s own website (pinned, daily).',
  input: z.object({ clientId: uuid, competitorId: uuid, url: z.string().max(2000), pageType: z.enum(PAGE_TYPES) }),
  output: z.object({ pageId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId, competitorId, url, pageType }, deps) {
    if (!deps.webMonitoring) throw new ToolError('invalid_input', 'Website monitoring is switched off, so pages can’t be added yet');
    await requireTracked(deps.app, ctx, clientId, competitorId);
    const [c] = await deps.service.select({ domain: competitor.domain }).from(competitor).where(eq(competitor.id, competitorId));
    if (!c?.domain) throw new ToolError('invalid_input', 'Add the competitor’s website first');
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new ToolError('invalid_input', 'That isn’t a web address');
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || host !== c.domain) throw new ToolError('invalid_input', `Pages must be on ${c.domain}`);
    parsed.hash = '';
    const [active] = await deps.service.select({ n: count() }).from(trackedPage).where(and(eq(trackedPage.competitorId, competitorId), eq(trackedPage.active, true)));
    if ((active?.n ?? 0) >= MAX_ACTIVE_PAGES) throw new ToolError('invalid_input', `A competitor can have at most ${MAX_ACTIVE_PAGES} monitored pages`);
    const [row] = await deps.service
      .insert(trackedPage)
      .values({ competitorId, url: parsed.toString(), pageType, source: 'manual', pinned: true, active: true, cadence: 'daily' })
      .onConflictDoUpdate({ target: [trackedPage.competitorId, trackedPage.url], set: { pinned: true, active: true, cadence: 'daily' } })
      .returning({ id: trackedPage.id });
    return { pageId: row!.id };
  },
});

export const pageTools = [listTrackedPages, setPagePin, addTrackedPage];
```

(`list_tracked_pages` reads with the service Db after the RLS proof — `tracked_page` is visible to `app_user` too, but the service read avoids a second transaction. Either is fine; keep the proof first.) Append `...pageTools` to `allTools`.

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/tools/pages.test.ts` → PASS; typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): tracked-page list, pin/unpin and manual add behind the website-monitoring gate"
```

---

### Task 7: Competitors and pages screens

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/competitors/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/competitors/actions.ts`, `apps/web/src/app/(app)/c/[clientId]/competitors/competitor-controls.tsx`, `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page-controls.tsx`, `apps/web/src/app/(app)/c/[clientId]/competitors/competitor-controls.test.tsx`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: tools from Tasks 2, 4, 5, 6; `runTool`; `callTool`; `webEnv().webMonitoring`; `PAGE_TYPES` (`@cs/core` — import it only in server files; pass the list to client components as a prop, `nav-items.ts` rule).
- Produces: routes `/c/<id>/competitors` and `/c/<id>/competitors/<competitorId>`; nav item `{ label: 'Competitors', icon: 'competitors' }` (agency, client-scoped).

- [ ] **Step 1: Write the failing tests**

`competitor-controls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({
  requestSuggestionsAction: vi.fn(), acceptSuggestionAction: vi.fn(), dismissSuggestionAction: vi.fn(), addCompetitorAction: vi.fn(), removeCompetitorAction: vi.fn(),
}));
const { SuggestionsPanel } = await import('./competitor-controls');

describe('SuggestionsPanel', () => {
  it('explains what is missing before suggestions can be requested', () => {
    render(<SuggestionsPanel clientId="c1" ready={false} suggestions={[]} atLimit={false} />);
    expect(screen.getByText(/add at least one keyword and a service area/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /find competitors/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists suggestions with accept disabled at the competitor limit', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[{ id: 's1', name: 'Peachtree Air', domain: 'peachtreeair.com', placeId: 'p', rating: 4.6, votes: 120, appearances: 7, bestRank: 2, overlapScore: 0.82 }]} atLimit />);
    expect(screen.getByText('Peachtree Air')).toBeTruthy();
    expect((screen.getByRole('button', { name: /accept peachtree air/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

Add a `sidebar-nav.test.tsx` case: on `/c/<id>/competitors/<other uuid>` the active item is `/c/<id>/competitors`.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[[]clientId]/competitors" src/components/shell/sidebar-nav.test.tsx` (quote the path; if vitest's filter trips on the brackets, pass `competitor-controls` as the pattern) → FAIL.

- [ ] **Step 3: Implement**

`actions.ts` (all agency-only, each re-derives `ctx`, posts ids in hidden fields, and re-checks through the tools):

```ts
'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const DISCOVERY: Record<string, string> = {
  queued: 'Website page discovery has started.', disabled: 'Website monitoring is off — only ads, reviews and Google profile data are collected.', not_needed: '',
};

async function done(clientId: string, r: { ok: true; data?: unknown } | { ok: false; error: string }, message: string): Promise<FormResult> {
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/competitors`);
  return { ok: true, message };
}

export async function requestSuggestionsAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  return done(clientId, await runTool(ctx, 'request_competitor_suggestions', { clientId }), 'Searching Google Maps — suggestions appear here in a few minutes.');
}

export async function acceptSuggestionAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ discovery: string }>(ctx, 'accept_competitor_suggestion', { suggestionId: s(fd, 'suggestionId') });
  return done(s(fd, 'clientId'), r, `Competitor added. ${r.ok ? DISCOVERY[r.data.discovery] : ''}`.trim());
}

export async function dismissSuggestionAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  return done(s(fd, 'clientId'), await runTool(ctx, 'dismiss_competitor_suggestion', { suggestionId: s(fd, 'suggestionId') }), 'Suggestion hidden.');
}

export async function addCompetitorAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  const r = await runTool<{ discovery: string }>(ctx, 'add_competitor', { clientId, name: s(fd, 'name'), domain: s(fd, 'domain') || undefined, placeId: s(fd, 'placeId') || undefined });
  return done(clientId, r, `Competitor added. ${r.ok ? DISCOVERY[r.data.discovery] : ''}`.trim());
}

export async function removeCompetitorAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  return done(clientId, await runTool(ctx, 'remove_competitor', { clientId, competitorId: s(fd, 'competitorId') }), 'Competitor removed. Its history is kept.');
}

export async function setPinAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  const r = await runTool(ctx, 'set_page_pin', { clientId, pageId: s(fd, 'pageId'), pinned: s(fd, 'pinned') === 'true' });
  if (r.ok) revalidatePath(`/c/${clientId}/competitors/${s(fd, 'competitorId')}`);
  return r.ok ? { ok: true } : r;
}

export async function addPageAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  const competitorId = s(fd, 'competitorId');
  const r = await runTool(ctx, 'add_tracked_page', { clientId, competitorId, url: s(fd, 'url'), pageType: s(fd, 'pageType') });
  if (r.ok) revalidatePath(`/c/${clientId}/competitors/${competitorId}`);
  return r.ok ? { ok: true, message: 'Page added — it is captured on the next daily run.' } : r;
}
```

`competitor-controls.tsx` (`'use client'`) exports:
- `SuggestionsPanel({ clientId, ready, suggestions, atLimit })` — a card titled "Suggested competitors". When `!ready`: the sentence "Add at least one keyword and a service area to the client profile before searching." with a link to `/c/<id>/settings/profile`. A form posting `requestSuggestionsAction` with a "Find competitors" button (`disabled={!ready || pending}`), helper text "Searches Google Maps across the service area (paid, about a minute of work in the background)". Then one row per suggestion: name, domain, `★ rating (votes)`, "seen in N searches, best rank #R", overlap as a percentage, and two small forms: "Accept" (`aria-label={\`Accept ${s.name}\`}`, `disabled={atLimit || pending}`; `title` "This client already tracks 5 competitors" when at the limit) and "Dismiss". Show each form's `FormResult` message/error inline (same `role="alert"` idiom as 5a).
- `AddCompetitorForm({ clientId, atLimit })` — name, website, Google place id (optional), submit "Add competitor".
- `RemoveCompetitorButton({ clientId, competitorId, name })` — `Dialog` confirm ("Stop tracking {name}? Its history is kept, and collection stops if no other client tracks it."), destructive button, posts `removeCompetitorAction`.

Use `useActionState(action, { ok: true } as FormResult)` per form, exactly like `delivery-controls.tsx` (5a).

`page.tsx` (`/c/[clientId]/competitors`):

```tsx
import { isAgencyRole } from '@cs/core';
import type { ClientProfile, SuggestionView, TrackedCompetitor } from '@cs/tools';
import { COMPETITOR_LIMIT } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { AddCompetitorForm, RemoveCompetitorButton, SuggestionsPanel } from './competitor-controls';

export const dynamic = 'force-dynamic';

export default async function CompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [profile, tracked, suggestions] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: TrackedCompetitor[] }>(ctx, 'list_client_competitors', { clientId }),
    callTool<{ items: SuggestionView[] }>(ctx, 'list_competitor_suggestions', { clientId }),
  ]);
  const atLimit = tracked.items.length >= COMPETITOR_LIMIT;
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Competitors — {profile.name}</h1>
      <p className="text-muted-foreground">Track 3–5 direct competitors ({tracked.items.length} of {COMPETITOR_LIMIT}).</p>
      <Card>
        <CardHeader><CardTitle>Tracked competitors</CardTitle></CardHeader>
        <CardContent>
          {tracked.items.length === 0 ? (
            <p className="text-muted-foreground">None yet — accept a suggestion or add one below.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Website</TableHead><TableHead>Pages monitored</TableHead><TableHead>Since</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {tracked.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><Link href={`/c/${clientId}/competitors/${c.id}`} className="font-semibold text-primary-soft-text">{c.name}</Link></TableCell>
                    <TableCell>{c.domain ?? '—'}</TableCell>
                    <TableCell>{c.activePages}</TableCell>
                    <TableCell>{c.addedAt.slice(0, 10)}</TableCell>
                    <TableCell><RemoveCompetitorButton clientId={clientId} competitorId={c.id} name={c.name} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-5 border-t border-line pt-5"><AddCompetitorForm clientId={clientId} atLimit={atLimit} /></div>
        </CardContent>
      </Card>
      <SuggestionsPanel clientId={clientId} ready={profile.keywords.length > 0 && profile.serviceArea !== null} suggestions={suggestions.items} atLimit={atLimit} />
    </>
  );
}
```

`[competitorId]/page.tsx`: agency-only; `callTool<{ items: TrackedCompetitor[] }>(…, 'list_client_competitors')` to find the competitor's name (`notFound()` if absent), `callTool<{ items: TrackedPageView[] }>(…, 'list_tracked_pages', { clientId, competitorId })`; a table (URL as plain text — never a clickable link to a competitor site from the app, type, cadence, last captured, "Pinned" `Switch` from `page-controls.tsx` posting `setPinAction` with a hidden `pinned` value), and — only when `webEnv().webMonitoring` — `AddPageForm({ clientId, competitorId, pageTypes: [...PAGE_TYPES] })` (URL + type select). When monitoring is off, show "Website monitoring is switched off for now, so pages can’t be added." Inactive pages show a muted "Inactive" badge.

Nav: add `'competitors'` icon key; in the agency client-scoped block after Profile push `{ href: \`/c/${clientId}/competitors\`, label: 'Competitors', icon: 'competitors' }`; `ICONS.competitors = Swords` (`lucide-react`).

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): competitors and tracked-pages screens"
```

---

### Task 8: Competitive pressure and the `get_portfolio` tool

**Files:**
- Create: `packages/tools/src/pressure.ts`, `packages/tools/src/pressure.test.ts`, `packages/tools/src/tools/portfolio.ts`, `packages/tools/src/tools/portfolio.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/index.ts`

**Interfaces:**
- Consumes: `changeTypeLabel` (`@cs/email`); `eventScore`, `changeEvent`, `move`, `clientCompetitor`, `competitor`, `alert`, `brief`, `recommendation`, `client`, `withTenant`, `Tx` (`@cs/db`).
- Produces:
  - `interface PressureSignal { weight: number; label: string }`, `type PressureLevel = 'low' | 'elevated' | 'high'`, `interface Pressure { score: number; level: PressureLevel; reasons: string[] }`
  - `combinePressure(signals: PressureSignal[]): Pressure`; `MOVE_LABELS: Record<string, string>`; `moveWeight(status: string, confidence: number): number`
  - `interface CompetitorPressure { competitorId: string; name: string; pressure: Pressure }`; `pressureByClient(tx: Tx, clientIds: string[], now: Date): Promise<Map<string, CompetitorPressure[]>>` (sorted by score desc)
  - zod `PortfolioRow` = `{ clientId, name, verticalId, pressure: { score, level, reasons }, topCompetitor: string|null, alertsPending: number, alertsDelivered7d: number, briefToApprove: { id, deliveryDate } | null, openRecommendations: number, lastActivityAt: string|null }`
  - tool `get_portfolio {}` → `{ items: PortfolioRow[] }`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/pressure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { combinePressure, moveWeight } from './pressure';

describe('combinePressure (decision 10)', () => {
  it('is quiet with no signals', () => {
    expect(combinePressure([])).toEqual({ score: 0, level: 'low', reasons: ['Quiet'] });
  });

  it('combines signals noisy-OR style, bounded at 100', () => {
    expect(combinePressure([{ weight: 0.5, label: 'Price change' }]).score).toBe(50);
    expect(combinePressure([{ weight: 0.5, label: 'Price change' }, { weight: 0.5, label: 'New ads' }]).score).toBe(75);
    expect(combinePressure(Array.from({ length: 20 }, () => ({ weight: 0.9, label: 'x' }))).score).toBe(100);
  });

  it('levels and names the two strongest distinct reasons', () => {
    const p = combinePressure([{ weight: 0.3, label: 'Hiring' }, { weight: 0.86, label: 'Price change' }, { weight: 0.6, label: 'Price change' }, { weight: 0.5, label: 'Ad surge' }]);
    expect(p.level).toBe('high');
    expect(p.reasons).toEqual(['Price change', 'Ad surge']);
    expect(combinePressure([{ weight: 0.45, label: 'Promo' }]).level).toBe('elevated');
  });

  it('weights moves by status', () => {
    expect(moveWeight('active', 1)).toBeCloseTo(0.8);
    expect(moveWeight('emerging', 1)).toBeCloseTo(0.5);
    expect(moveWeight('fading', 0.5)).toBeCloseTo(0.15);
  });
});
```

`packages/tools/src/tools/portfolio.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { alert, brief, changeEvent, eventScore, move, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) => createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const day = 86_400_000;

async function scored(score: number, route: string, ageDays: number, retracted = false): Promise<string> {
  const at = new Date(Date.now() - ageDays * day);
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: at, retractedAt: retracted ? at : null }).returning();
  await dbs.owner.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score, route, factors: {} as never, packVersion: 1, scoredAt: at });
  return e!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('get_portfolio', () => {
  it('summarises each visible client', async () => {
    const eventId = await scored(86, 'alert', 2);
    await scored(90, 'archive', 1); // archive never counts
    await scored(95, 'alert', 3, true); // retracted never counts
    await scored(99, 'alert', 40); // older than 30 days
    await dbs.owner.insert(move).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'ad_surge', status: 'active', confidence: 0.5, summary: 'm', ruleVersion: 2, lastHeldAt: new Date(), lastEvidenceAt: new Date() });
    await dbs.owner.insert(alert).values([
      { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId, score: 86, status: 'pending_review', mode: 'after_am_check' },
    ]);
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-12', periodStart: new Date(), periodEnd: new Date(), status: 'ready' }).returning();
    await dbs.owner.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'L', impact: 'H', owner: 'client', source: 'brief' });

    const { items } = (await registry.invoke(ctx('agency_admin', 'all'), 'get_portfolio', {})) as { items: Record<string, unknown>[] };
    const a1 = items.find((i) => i.clientId === IDS.clientA1)!;
    // 1 − (1 − 0.86)(1 − 0.5 × 0.8) = 0.916
    expect(a1).toMatchObject({
      name: 'A1 HVAC', alertsPending: 1, alertsDelivered7d: 0, briefToApprove: { id: b!.id, deliveryDate: '2026-10-12' }, openRecommendations: 1, topCompetitor: 'Smith HVAC',
      pressure: { score: 92, level: 'high', reasons: ['Price change', 'Ad surge'] },
    });
    expect(a1.lastActivityAt).toEqual(expect.any(String));
    const a2 = items.find((i) => i.clientId === IDS.clientA2)!;
    expect(a2).toMatchObject({ pressure: { score: 0, level: 'low', reasons: ['Quiet'] }, briefToApprove: null, lastActivityAt: null });
  });

  it('respects scope and is agency-only', async () => {
    const { items } = (await registry.invoke(ctx('account_manager', [IDS.clientA1]), 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1]), 'get_portfolio', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

(If `seedTenancy`'s client/competitor names differ from 'A1 HVAC'/'Smith HVAC', use the actual names. The 40-day-old score is inside the score row but outside the pressure window.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/pressure.test.ts src/tools/portfolio.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`packages/tools/src/pressure.ts`:

```ts
import { changeEvent, clientCompetitor, competitor, eventScore, move, type Tx } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { and, gte, inArray, isNull } from 'drizzle-orm';

export interface PressureSignal {
  weight: number;
  label: string;
}
export type PressureLevel = 'low' | 'elevated' | 'high';
export interface Pressure {
  score: number;
  level: PressureLevel;
  reasons: string[];
}
export interface CompetitorPressure {
  competitorId: string;
  name: string;
  pressure: Pressure;
}

export const PRESSURE_WINDOW_DAYS = 30;
export const MOVE_LABELS: Record<string, string> = {
  territory_expansion: 'Territory expansion', price_war: 'Price war', new_service_line: 'New service line', hiring_push: 'Hiring push',
  promo_blitz: 'Promo blitz', reputation_slump: 'Reputation slump', ad_surge: 'Ad surge',
};
const MOVE_STATUS_WEIGHT: Record<string, number> = { active: 0.8, emerging: 0.5, fading: 0.3 };

export const moveWeight = (status: string, confidence: number): number => (MOVE_STATUS_WEIGHT[status] ?? 0) * confidence;

/** Decision 10: noisy-OR of 0..1 signals → 0..100; never stored. */
export function combinePressure(signals: PressureSignal[]): Pressure {
  const live = signals.filter((s) => s.weight > 0).map((s) => ({ ...s, weight: Math.min(1, s.weight) }));
  const score = Math.round(100 * (1 - live.reduce((p, s) => p * (1 - s.weight), 1)));
  const reasons: string[] = [];
  for (const s of [...live].sort((a, b) => b.weight - a.weight)) {
    if (!reasons.includes(s.label)) reasons.push(s.label);
    if (reasons.length === 2) break;
  }
  return { score, level: score >= 70 ? 'high' : score >= 40 ? 'elevated' : 'low', reasons: reasons.length ? reasons : ['Quiet'] };
}

/** Pressure per tracked competitor of each client (decision 10), strongest first. Run inside `withTenant`. */
export async function pressureByClient(tx: Tx, clientIds: string[], now: Date): Promise<Map<string, CompetitorPressure[]>> {
  const out = new Map<string, CompetitorPressure[]>();
  if (clientIds.length === 0) return out;
  const since = new Date(now.getTime() - PRESSURE_WINDOW_DAYS * 86_400_000);
  const [links, events, moves] = await Promise.all([
    tx.select({ clientId: clientCompetitor.clientId, competitorId: competitor.id, name: competitor.name }).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId)).where(inArray(clientCompetitor.clientId, clientIds)),
    tx.select({ clientId: eventScore.clientId, competitorId: changeEvent.competitorId, changeType: changeEvent.changeType, score: eventScore.score })
      .from(eventScore).innerJoin(changeEvent, eq(changeEvent.id, eventScore.eventId))
      .where(and(inArray(eventScore.clientId, clientIds), inArray(eventScore.route, ['alert', 'brief']), gte(eventScore.scoredAt, since), isNull(changeEvent.retractedAt))),
    tx.select({ clientId: move.clientId, competitorId: move.competitorId, moveType: move.moveType, status: move.status, confidence: move.confidence })
      .from(move).where(and(inArray(move.clientId, clientIds), isNull(move.closedAt))),
  ]);
  const key = (c: string, k: string) => `${c}|${k}`;
  const signals = new Map<string, PressureSignal[]>();
  const push = (k: string, s: PressureSignal) => signals.set(k, [...(signals.get(k) ?? []), s]);
  for (const e of events) push(key(e.clientId, e.competitorId), { weight: e.score / 100, label: changeTypeLabel(e.changeType) });
  for (const m of moves) push(key(m.clientId, m.competitorId), { weight: moveWeight(m.status, m.confidence), label: MOVE_LABELS[m.moveType] ?? m.moveType });
  for (const l of links) {
    const list = out.get(l.clientId) ?? [];
    list.push({ competitorId: l.competitorId, name: l.name, pressure: combinePressure(signals.get(key(l.clientId, l.competitorId)) ?? []) });
    out.set(l.clientId, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.pressure.score - a.pressure.score);
  return out;
}
```

(Add `eq` to the `drizzle-orm` import. `Promise.all` on one transaction runs the queries sequentially on that connection — fine. Signals from a competitor no longer linked are ignored because only `links` produce rows.)

Add to `schemas.ts`:

```ts
export const PressureView = z.object({ score: z.number().int(), level: z.enum(['low', 'elevated', 'high']), reasons: z.array(z.string()) });
export const PortfolioRow = z.object({
  clientId: uuid, name: z.string(), verticalId: z.string(), pressure: PressureView, topCompetitor: z.string().nullable(),
  alertsPending: z.number().int(), alertsDelivered7d: z.number().int(), briefToApprove: z.object({ id: uuid, deliveryDate: z.string() }).nullable(),
  openRecommendations: z.number().int(), lastActivityAt: iso.nullable(),
});
export type PortfolioRow = z.infer<typeof PortfolioRow>;
```

`packages/tools/src/tools/portfolio.ts`:

```ts
import { toolkit } from '@cs/core';
import { alert, brief, client, eventScore, recommendation, withTenant } from '@cs/db';
import { and, asc, count, desc, eq, gte, inArray, max, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { combinePressure, pressureByClient } from '../pressure';
import { PortfolioRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const latest = (...ds: (Date | null | undefined)[]) => ds.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

export const getPortfolio = defineTool({
  name: 'get_portfolio',
  description: 'Every client this agency user can see, with alerts waiting, a brief to approve, competitive pressure and last activity.',
  input: z.object({}),
  output: z.object({ items: z.array(PortfolioRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    return withTenant(deps.app, ctx, async (tx) => {
      const clients = await tx.select({ id: client.id, name: client.name, verticalId: client.verticalId }).from(client).orderBy(asc(client.name));
      const ids = clients.map((c) => c.id);
      if (ids.length === 0) return { items: [] };
      const [pending, delivered, ready, recs, lastScore, lastAlert, lastSent, pressure] = await Promise.all([
        tx.select({ id: alert.clientId, n: count() }).from(alert).where(and(inArray(alert.clientId, ids), eq(alert.status, 'pending_review'))).groupBy(alert.clientId),
        tx.select({ id: alert.clientId, n: count() }).from(alert).where(and(inArray(alert.clientId, ids), eq(alert.status, 'delivered'), gte(alert.deliveredAt, weekAgo))).groupBy(alert.clientId),
        tx.select({ id: brief.id, clientId: brief.clientId, deliveryDate: brief.deliveryDate }).from(brief).where(and(inArray(brief.clientId, ids), eq(brief.status, 'ready'))).orderBy(desc(brief.deliveryDate)),
        tx.select({ id: recommendation.clientId, n: count() }).from(recommendation).where(and(inArray(recommendation.clientId, ids), inArray(recommendation.status, ['todo', 'in_progress']))).groupBy(recommendation.clientId),
        tx.select({ id: eventScore.clientId, at: max(eventScore.scoredAt) }).from(eventScore).where(and(inArray(eventScore.clientId, ids), ne(eventScore.route, 'archive'))).groupBy(eventScore.clientId),
        tx.select({ id: alert.clientId, at: max(alert.createdAt) }).from(alert).where(inArray(alert.clientId, ids)).groupBy(alert.clientId),
        tx.select({ id: brief.clientId, at: max(brief.sentAt) }).from(brief).where(inArray(brief.clientId, ids)).groupBy(brief.clientId),
        pressureByClient(tx, ids, now),
      ]);
      const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
      const [p, d, r, ls, la, lb] = [byId(pending), byId(delivered), byId(recs), byId(lastScore), byId(lastAlert), byId(lastSent)];
      return {
        items: clients.map((c) => {
          const comps = pressure.get(c.id) ?? [];
          const brief = ready.find((b) => b.clientId === c.id);
          const last = latest(ls.get(c.id)?.at, la.get(c.id)?.at, lb.get(c.id)?.at);
          return {
            clientId: c.id, name: c.name, verticalId: c.verticalId,
            pressure: comps[0]?.pressure ?? combinePressure([]), topCompetitor: comps[0] && comps[0].pressure.score > 0 ? comps[0].name : null,
            alertsPending: p.get(c.id)?.n ?? 0, alertsDelivered7d: d.get(c.id)?.n ?? 0,
            briefToApprove: brief ? { id: brief.id, deliveryDate: brief.deliveryDate } : null,
            openRecommendations: r.get(c.id)?.n ?? 0, lastActivityAt: last ? last.toISOString() : null,
          };
        }),
      };
    });
  },
});

export const portfolioTools = [getPortfolio];
```

(Drizzle's `max()` over a timestamp column returns a `Date` with postgres.js; if it comes back as a string in this codebase, wrap with `new Date(...)` inside `latest`. Verify in the test.) Append `...portfolioTools` to `allTools`; `export * from './pressure';` in `src/index.ts`.

- [ ] **Step 4: Run tests** — Step 2 command → PASS; typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): competitive pressure score and get_portfolio"
```

---

### Task 9: Portfolio screen and agency navigation

**Files:**
- Create: `apps/web/src/server/format.ts`, `apps/web/src/server/format.test.ts`, `apps/web/src/components/pressure-badge.tsx`, `apps/web/src/components/pressure-badge.test.tsx`
- Modify: `apps/web/src/app/(app)/agency/page.tsx`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `get_portfolio` (Task 8); `callTool`.
- Produces: `relativeTime(iso: string | null, now: Date): string`; `<PressureBadge score level />`; the `/agency` page is now the portfolio; the agency nav's first item is labelled **Portfolio** (href `/agency`, icon `clients`).

- [ ] **Step 1: Write the failing tests**

`format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { relativeTime } from './format';

const now = new Date('2026-10-05T12:00:00Z');
describe('relativeTime', () => {
  it('reads naturally', () => {
    expect(relativeTime(null, now)).toBe('No activity yet');
    expect(relativeTime('2026-10-05T11:59:30Z', now)).toBe('Just now');
    expect(relativeTime('2026-10-05T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-10-04T09:00:00Z', now)).toBe('Yesterday');
    expect(relativeTime('2026-09-28T12:00:00Z', now)).toBe('7 days ago');
    expect(relativeTime('2026-07-01T12:00:00Z', now)).toBe('1 Jul 2026');
  });
});
```

`pressure-badge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PressureBadge } from './pressure-badge';

describe('PressureBadge', () => {
  it('names the level for screen readers', () => {
    render(<PressureBadge score={86} level="high" />);
    expect(screen.getByLabelText('Competitive pressure 86 of 100, high')).toBeTruthy();
  });
});
```

In `sidebar-nav.test.tsx`, add `expect(screen.getByRole('link', { name: 'Portfolio' }).getAttribute('href')).toBe('/agency');` to the "highlights Clients on /agency" case (rename that case's title to "highlights Portfolio on /agency").

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/server/format.test.ts src/components/pressure-badge.test.tsx src/components/shell/sidebar-nav.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/server/format.ts`:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Server-rendered relative time (no client clock → no hydration mismatch). */
export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return 'No activity yet';
  const at = new Date(iso);
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}
```

`apps/web/src/components/pressure-badge.tsx`:

```tsx
const TONE: Record<string, string> = {
  high: 'bg-[#FDE8E8] text-[#B42318]',
  elevated: 'bg-[#FFF3DC] text-accent-text',
  low: 'bg-muted-surface text-muted-ink',
};

export function PressureBadge({ score, level }: { score: number; level: 'low' | 'elevated' | 'high' }) {
  return (
    <span aria-label={`Competitive pressure ${score} of 100, ${level}`} className={`inline-flex min-w-10 justify-center rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${TONE[level]}`}>
      {score}
    </span>
  );
}
```

`apps/web/src/app/(app)/agency/page.tsx` (replace): agency-only (`notFound()` otherwise). Reads `get_portfolio`. Layout:
1. Header row: title "Portfolio", subtitle "Every client at a glance — what needs you today.", and an **Add client** `Link` styled as a primary button to `/agency/clients/new`, shown only when `ctx.clientScope === 'all'`.
2. Four KPI cards (`grid gap-5 sm:grid-cols-2 xl:grid-cols-4`, card idiom from the mockups): Clients (count), Alerts waiting (sum of `alertsPending`, links to `/agency/alerts`), Briefs to approve (count of non-null `briefToApprove`, links to `/agency/approvals`), High pressure (count of `pressure.level === 'high'`).
3. A `Table`: Client (link `/c/<id>`) with the vertical label underneath in muted text; Pressure (`PressureBadge` + top competitor + reasons joined with " · ", muted); Alerts (`alertsPending` as a link to `/agency/alerts` when > 0, plus "N sent this week" muted); Brief ("Approve week of <date>" link to `/agency/approvals/<id>` when present, else "—"); Open actions (`openRecommendations`, link `/c/<id>/recommendations`); Last activity (`relativeTime(lastActivityAt, now)`).
4. Rows sorted: clients with alerts pending or a brief to approve first, then by pressure score desc, then name.
5. Empty state: "No clients yet." plus the Add client link when allowed.

Use `const VERTICAL_LABELS: Record<string, string> = { hvac_plumbing: 'HVAC & plumbing', dental: 'Dental' };` (already in the 5a page). The `/agency/alerts`, `/agency/approvals` and `/c/<id>/recommendations` routes arrive in Tasks 11, 12 and 14 — the links 404 until then, which is expected mid-branch.

`nav-items.ts`: label of the first agency item `'Clients'` → `'Portfolio'` (href and icon unchanged). Update the comment "5b/5c add their modules here".

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): agency portfolio with competitive pressure, alerts, briefs and last activity"
```

---

### Task 10: Brief review tools — queue, review view, edit/drop/reorder/rate/approve/send now, auto-send

**Files:**
- Create: `packages/tools/src/tools/review.ts`, `packages/tools/src/tools/review.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: `editBriefItem`, `dropBriefItem`, `reorderBriefItems`, `rateBriefItem`, `approveBrief`, `getBrief`, `sendBriefNow`, `isUntouched`, `updateClientDelivery` (`@cs/engine`); `packsOf`, `enqueueOf`, `ToolDeps` (Task 1); `BriefDetail` (schemas).
- Produces:
  - zod `BriefQueueRow` = `{ briefId, clientId, clientName, deliveryDate, status, kind, activeItems: number, droppedItems: number, touched: boolean, autoSend: boolean }`
  - zod `BriefReview` = `BriefDetail` + `{ clientName: string, autoSend: boolean, touched: boolean, factCheck: { items: number, sentences: number } }`
  - tools: `list_brief_queue {}` → `{ items: BriefQueueRow[] }`; `get_brief_review {briefId}` → `BriefReview`; `edit_brief_item {itemId, headline?, whatChanged?, whyItMatters?, recommendedAction?}` → `{ warnings: string[] }`; `drop_brief_item {itemId, reason?}` → `{ ok: true }`; `reorder_brief_items {briefId, itemIds}` → `{ ok: true }`; `rate_brief_item {itemId, useful, reason?}` → `{ ok: true }`; `approve_brief {briefId}` → `{ recommendations: number }`; `send_brief_now {briefId}` → `{ notifications: number, pdf: 'queued' | 'later' }`; `set_brief_auto_send {clientId, enabled}` → `{ ok: true }`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/tools/review.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { brief, briefItem, client, contact, feedback, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { DeliveryConfig } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'http://localhost:3000', linkSecrets: ['k'.repeat(40)], fromAddress: 'briefs@example.com' };
const enqueue = vi.fn<EnqueueJob>(async () => {});
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, delivery, enqueue }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const am = ctx('account_manager', [IDS.clientA1]);
const amA2 = ctx('account_manager', [IDS.clientA2]);
const today = new Date().toISOString().slice(0, 10);
let briefId = '';
let items: string[] = [];

beforeEach(async () => {
  enqueue.mockClear();
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: today, periodStart: new Date(), periodEnd: new Date(), status: 'ready', summary: 'Two moves.', dropped: { items: 1, sentences: 2 } }).returning();
  briefId = b!.id;
  const rows = await dbs.owner.insert(briefItem).values([1, 2].map((ord) => ({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId, ord, competitorId: IDS.competitorX, headline: `Item ${ord}`, whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L' as const, impact: 'H' as const, upsellTag: 'ppc',
  }))).returning();
  items = rows.map((r) => r.id);
  await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
});

describe('brief queue', () => {
  it('lists this week’s briefs per client with counts and flags', async () => {
    const { items: rows } = (await registry.invoke(am, 'list_brief_queue', {})) as { items: Record<string, unknown>[] };
    expect(rows).toEqual([expect.objectContaining({ briefId, clientName: 'A1 HVAC', status: 'ready', activeItems: 2, droppedItems: 0, touched: false, autoSend: false })]);
    expect(((await registry.invoke(amA2, 'list_brief_queue', {})) as { items: unknown[] }).items).toEqual([]);
  });

  it('get_brief_review carries fact-check counts and the agency-only upsell tag', async () => {
    const r = (await registry.invoke(am, 'get_brief_review', { briefId })) as { factCheck: unknown; items: { upsellTag: string | null }[]; clientName: string };
    expect(r.factCheck).toEqual({ items: 1, sentences: 2 });
    expect(r.items[0]!.upsellTag).toBe('ppc');
    await expect(registry.invoke(amA2, 'get_brief_review', { briefId })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('review actions', () => {
  it('edits, reorders, rates and drops, marking the brief touched', async () => {
    const { warnings } = (await registry.invoke(am, 'edit_brief_item', { itemId: items[0], headline: 'Smith HVAC cut tune-ups' })) as { warnings: string[] };
    expect(Array.isArray(warnings)).toBe(true);
    await registry.invoke(am, 'reorder_brief_items', { briefId, itemIds: [items[1], items[0]] });
    await registry.invoke(am, 'rate_brief_item', { itemId: items[1], useful: true });
    await registry.invoke(am, 'drop_brief_item', { itemId: items[1], reason: 'Not relevant' });
    const r = (await registry.invoke(am, 'get_brief_review', { briefId })) as { touched: boolean; items: { id: string; status: string; ord: number }[] };
    expect(r.touched).toBe(true);
    expect(r.items.find((i) => i.id === items[1])!.status).toBe('dropped');
  });

  it('refuses another scope’s items (Review Focus 1)', async () => {
    await expect(registry.invoke(amA2, 'edit_brief_item', { itemId: items[0], headline: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA2, 'approve_brief', { briefId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA2, 'send_brief_now', { briefId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('approve wins once; a later edit is refused with a clear message (Review Focus 2)', async () => {
    const { recommendations } = (await registry.invoke(am, 'approve_brief', { briefId })) as { recommendations: number };
    expect(recommendations).toBe(2);
    await expect(registry.invoke(am, 'edit_brief_item', { itemId: items[0], headline: 'late' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(am, 'approve_brief', { briefId })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('send now approves, sends once, and enqueues the PDF (Review Focus 2)', async () => {
    const r = (await registry.invoke(am, 'send_brief_now', { briefId })) as { notifications: number; pdf: string };
    expect(r.pdf).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith('brief-pdf', { briefId }, briefId);
    expect((await dbs.owner.select().from(brief).where(eq(brief.id, briefId)))[0]!.status).toBe('sent');
    expect(await dbs.owner.select().from(recommendation)).toHaveLength(2);
    await expect(registry.invoke(am, 'send_brief_now', { briefId })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('send now explains missing delivery configuration', async () => {
    const bare = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    await expect(bare.invoke(am, 'send_brief_now', { briefId })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('APP_URL') });
  });

  it('toggles auto-send with feedback history', async () => {
    await registry.invoke(am, 'set_brief_auto_send', { clientId: IDS.clientA1, enabled: true });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.briefAutoSend).toBe(true);
    expect((await dbs.owner.select().from(feedback).where(eq(feedback.subjectType, 'client'))).length).toBe(1);
    await expect(registry.invoke(amA2, 'set_brief_auto_send', { clientId: IDS.clientA1, enabled: true })).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

(If `deliverBrief` skips a brief for a reason this fixture doesn't satisfy — e.g. it requires the delivery date to have arrived in the client's time zone — read `deliverBrief` and adjust the fixture, not the tool. Today's UTC date as `deliveryDate` is chosen for that reason.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/review.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Add to `schemas.ts`:

```ts
export const BriefQueueRow = z.object({
  briefId: uuid, clientId: uuid, clientName: z.string(), deliveryDate: z.string(), status: z.string(), kind: z.string(),
  activeItems: z.number().int(), droppedItems: z.number().int(), touched: z.boolean(), autoSend: z.boolean(),
});
export type BriefQueueRow = z.infer<typeof BriefQueueRow>;
export const BriefReview = BriefDetail.extend({ clientName: z.string(), autoSend: z.boolean(), touched: z.boolean(), factCheck: z.object({ items: z.number().int(), sentences: z.number().int() }) });
export type BriefReview = z.infer<typeof BriefReview>;
```

Refactor `tools/briefs.ts` so the detail mapping can be reused: extract the body of `getBriefTool.handler` into `export async function briefDetail(deps: ToolDeps, ctx: AccessContext, briefId: string): Promise<BriefDetail>` and have the handler call it (no behaviour change; `read-tools.test.ts` must still pass).

`packages/tools/src/tools/review.ts`:

```ts
import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { brief, briefItem, client, withTenant } from '@cs/db';
import { approveBrief, dropBriefItem, editBriefItem, isUntouched, rateBriefItem, reorderBriefItems, sendBriefNow, updateClientDelivery } from '@cs/engine';
import { and, asc, eq, gte, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, packsOf, type ToolDeps } from '../deps';
import { briefDetail } from './briefs';
import { BriefQueueRow, BriefReview } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const text = z.string().max(2000);
const ok = z.object({ ok: z.literal(true) });
const reviewDeps = (deps: ToolDeps) => ({ service: deps.service, app: deps.app, packs: packsOf(deps) });

export const listBriefQueue = defineTool({
  name: 'list_brief_queue',
  description: 'This week’s brief per client (plus any older brief still waiting), ready-for-review first.',
  input: z.object({}),
  output: z.object({ items: z.array(BriefQueueRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const rows = await withTenant(deps.app, ctx, async (tx) => {
      const briefs = await tx
        .select({ b: brief, clientName: client.name, autoSend: client.briefAutoSend })
        .from(brief).innerJoin(client, eq(client.id, brief.clientId))
        .where(or(gte(brief.deliveryDate, since), eq(brief.status, 'ready')))
        .orderBy(asc(client.name), asc(brief.deliveryDate));
      const ids = briefs.map((r) => r.b.id);
      const items = ids.length ? await tx.select({ briefId: briefItem.briefId, status: briefItem.status }).from(briefItem).where(inArray(briefItem.briefId, ids)) : [];
      return { briefs, items };
    });
    // Decision 12: newest brief per client, plus older ones still `ready`.
    const newest = new Map<string, string>();
    for (const r of rows.briefs) newest.set(r.b.clientId, r.b.id);
    const keep = rows.briefs.filter((r) => newest.get(r.b.clientId) === r.b.id || r.b.status === 'ready');
    const out = [];
    for (const r of keep) {
      const its = rows.items.filter((i) => i.briefId === r.b.id);
      out.push({
        briefId: r.b.id, clientId: r.b.clientId, clientName: r.clientName, deliveryDate: r.b.deliveryDate, status: r.b.status, kind: r.b.kind,
        activeItems: its.filter((i) => i.status === 'active').length, droppedItems: its.filter((i) => i.status === 'dropped').length,
        touched: !(await isUntouched(deps.service, r.b.id)), autoSend: r.autoSend,
      });
    }
    out.sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready') || a.clientName.localeCompare(b.clientName));
    return { items: out };
  },
});

export const getBriefReview = defineTool({
  name: 'get_brief_review',
  description: 'A brief as the agency reviews it: every item including dropped ones, fact-check counts and auto-send.',
  input: z.object({ briefId: uuid }),
  output: BriefReview,
  permission: 'agency',
  async handler(ctx, { briefId }, deps) {
    const detail = await briefDetail(deps, ctx, briefId);
    const [row] = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ dropped: brief.dropped, clientName: client.name, autoSend: client.briefAutoSend }).from(brief).innerJoin(client, eq(client.id, brief.clientId)).where(eq(brief.id, briefId)));
    if (!row) throw new ToolError('not_found', 'Brief not found');
    return { ...detail, clientName: row.clientName, autoSend: row.autoSend, touched: !(await isUntouched(deps.service, briefId)), factCheck: row.dropped };
  },
});

export const editBriefItemTool = defineTool({
  name: 'edit_brief_item',
  description: 'Edit an item of a brief that is ready for review. Returns non-blocking fact-check warnings.',
  input: z.object({ itemId: uuid, headline: text.optional(), whatChanged: text.optional(), whyItMatters: text.optional(), recommendedAction: text.optional() }),
  output: z.object({ warnings: z.array(z.string()) }),
  permission: 'agency',
  async handler(ctx, { itemId, ...patch }, deps) {
    return editBriefItem(reviewDeps(deps), ctx, itemId, patch);
  },
});

export const dropBriefItemTool = defineTool({
  name: 'drop_brief_item',
  description: 'Remove an item from a brief that is ready for review.',
  input: z.object({ itemId: uuid, reason: z.string().max(500).optional() }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { itemId, reason }, deps) {
    await dropBriefItem(reviewDeps(deps), ctx, itemId, reason?.trim() || undefined);
    return { ok: true as const };
  },
});

export const reorderBriefItemsTool = defineTool({
  name: 'reorder_brief_items',
  description: 'Set the order of a ready brief’s active items (all of them, first to last).',
  input: z.object({ briefId: uuid, itemIds: z.array(uuid).min(1).max(20) }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { briefId, itemIds }, deps) {
    await reorderBriefItems(reviewDeps(deps), ctx, briefId, itemIds);
    return { ok: true as const };
  },
});

export const rateBriefItemTool = defineTool({
  name: 'rate_brief_item',
  description: 'Rate whether a brief item is useful (feeds the pilot’s usefulness metric).',
  input: z.object({ itemId: uuid, useful: z.boolean(), reason: z.string().max(500).optional() }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { itemId, useful, reason }, deps) {
    await rateBriefItem(reviewDeps(deps), ctx, itemId, useful, reason?.trim() || undefined);
    return { ok: true as const };
  },
});

export const approveBriefTool = defineTool({
  name: 'approve_brief',
  description: 'Approve a ready brief for Monday delivery; its items become recommendations.',
  input: z.object({ briefId: uuid }),
  output: z.object({ recommendations: z.number().int() }),
  permission: 'agency',
  async handler(ctx, { briefId }, deps) {
    return approveBrief(reviewDeps(deps), ctx, briefId);
  },
});

export const sendBriefNowTool = defineTool({
  name: 'send_brief_now',
  description: 'Approve (if needed) and send a brief to the client now, then render its PDF.',
  input: z.object({ briefId: uuid }),
  output: z.object({ notifications: z.number().int(), pdf: z.enum(['queued', 'later']) }),
  permission: 'agency',
  async handler(ctx, { briefId }, deps) {
    if (!deps.delivery) throw new ToolError('invalid_input', 'Sending is not configured on this server (APP_URL and LINK_SIGNING_SECRET)');
    const { notifications } = await sendBriefNow({ service: deps.service, app: deps.app, delivery: deps.delivery }, ctx, briefId);
    try {
      await enqueueOf(deps)('brief-pdf', { briefId }, briefId); // same singletonKey as /files/brief (5a)
      return { notifications, pdf: 'queued' as const };
    } catch (e) {
      // The worker's missing-PDF catch-up renders it within the hour (4b I3), so a failed enqueue never fails the send.
      console.warn('[send_brief_now] brief-pdf enqueue failed', briefId, e);
      return { notifications, pdf: 'later' as const };
    }
  },
});

export const setBriefAutoSend = defineTool({
  name: 'set_brief_auto_send',
  description: 'Send this client’s untouched briefs automatically on Monday 07:00 local time.',
  input: z.object({ clientId: uuid, enabled: z.boolean() }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { clientId, enabled }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    await updateClientDelivery({ service: deps.service, app: deps.app }, ctx, clientId, { briefAutoSend: enabled });
    return { ok: true as const };
  },
});

export const reviewTools = [listBriefQueue, getBriefReview, editBriefItemTool, dropBriefItemTool, reorderBriefItemsTool, rateBriefItemTool, approveBriefTool, sendBriefNowTool, setBriefAutoSend];
```

Append `...reviewTools` to `allTools`. (`and` may be unused — drop unused imports; Biome/tsc will flag them.)

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/tools/review.test.ts src/tools/read-tools.test.ts` → PASS; typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): brief approval-queue tools (queue, review, edit/drop/reorder/rate/approve/send now, auto-send)"
```

---

### Task 11: Approval queue screens

**Files:**
- Create: `apps/web/src/server/order.ts`, `apps/web/src/server/order.test.ts`, `apps/web/src/app/(app)/agency/approvals/page.tsx`, `apps/web/src/app/(app)/agency/approvals/[briefId]/page.tsx`, `apps/web/src/app/(app)/agency/approvals/[briefId]/actions.ts`, `apps/web/src/app/(app)/agency/approvals/[briefId]/review-controls.tsx`, `apps/web/src/app/(app)/agency/approvals/[briefId]/review-controls.test.tsx`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: Task 10 tools; `runTool`, `callTool`; `BriefQueueRow`, `BriefReview` (`@cs/tools`).
- Produces: `moveInOrder(ids: string[], id: string, dir: 'up' | 'down'): string[] | null`; routes `/agency/approvals` and `/agency/approvals/<briefId>`; nav item `{ href: '/agency/approvals', label: 'Approvals', icon: 'approvals' }` (agency, after Portfolio).

- [ ] **Step 1: Write the failing tests**

`order.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { moveInOrder } from './order';

describe('moveInOrder', () => {
  it('swaps with the neighbour', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });
  it('returns null at the edges or for an unknown id', () => {
    expect(moveInOrder(['a', 'b'], 'a', 'up')).toBeNull();
    expect(moveInOrder(['a', 'b'], 'b', 'down')).toBeNull();
    expect(moveInOrder(['a'], 'x', 'up')).toBeNull();
  });
});
```

`review-controls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({
  editItemAction: vi.fn(), dropItemAction: vi.fn(), moveItemAction: vi.fn(), rateItemAction: vi.fn(), approveAction: vi.fn(), sendNowAction: vi.fn(), autoSendAction: vi.fn(),
}));
const { ReviewItem, ReviewFooter } = await import('./review-controls');

const item = { id: 'i1', ord: 1, competitorId: 'c', competitorName: 'Smith HVAC', headline: 'Smith HVAC cut its AC tune-up to $79', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: 'ppc_audit' };

describe('approval review controls', () => {
  it('offers editing on a ready brief, with first/last move buttons disabled', () => {
    render(<ReviewItem briefId="b1" item={item} editable first last />);
    expect(screen.getByRole('button', { name: /edit/i })).toBeTruthy();
    expect((screen.getByRole('button', { name: /move up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Upsell: ppc_audit')).toBeTruthy();
  });

  it('is read-only once approved, but still ratable', () => {
    render(<ReviewItem briefId="b1" item={item} editable={false} first last />);
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.getByRole('button', { name: /useful/i })).toBeTruthy();
  });

  it('shows approve only for a ready brief and send now for ready or approved', () => {
    const { rerender } = render(<ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /send now/i })).toBeTruthy();
    rerender(<ReviewFooter briefId="b1" clientId="c1" status="sent" autoSend={false} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /send now/i })).toBeNull();
  });
});
```

Add a `sidebar-nav.test.tsx` case: `/agency/approvals/<uuid>` highlights `/agency/approvals`.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/server/order.test.ts review-controls src/components/shell/sidebar-nav.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/server/order.ts`:

```ts
/** Decision 12: the new full order after moving one id up/down; null when it can't move. */
export function moveInOrder(ids: string[], id: string, dir: 'up' | 'down'): string[] | null {
  const i = ids.indexOf(id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
```

`[briefId]/actions.ts`:

```ts
'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import type { BriefReview } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { moveInOrder } from '@/server/order';
import { runTool } from '@/server/run-tool';

async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
function refresh(briefId: string) {
  revalidatePath(`/agency/approvals/${briefId}`);
  revalidatePath('/agency/approvals');
}

export async function editItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ warnings: string[] }>(ctx, 'edit_brief_item', {
    itemId: s(fd, 'itemId'), headline: s(fd, 'headline'), whatChanged: s(fd, 'whatChanged'), whyItMatters: s(fd, 'whyItMatters'), recommendedAction: s(fd, 'recommendedAction'),
  });
  if (!r.ok) return r;
  refresh(s(fd, 'briefId'));
  return { ok: true, message: r.data.warnings.length ? `Saved. Please double-check: ${r.data.warnings.join(' ')}` : 'Saved.' };
}

export async function dropItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'drop_brief_item', { itemId: s(fd, 'itemId'), reason: s(fd, 'reason') || undefined });
  if (r.ok) refresh(s(fd, 'briefId'));
  return r.ok ? { ok: true } : r;
}

export async function moveItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const briefId = s(fd, 'briefId');
  const view = await runTool<BriefReview>(ctx, 'get_brief_review', { briefId });
  if (!view.ok) return view;
  const active = view.data.items.filter((i) => i.status === 'active').sort((a, b) => a.ord - b.ord).map((i) => i.id);
  const order = moveInOrder(active, s(fd, 'itemId'), s(fd, 'dir') === 'up' ? 'up' : 'down');
  if (!order) return { ok: true };
  const r = await runTool(ctx, 'reorder_brief_items', { briefId, itemIds: order });
  if (r.ok) refresh(briefId);
  return r.ok ? { ok: true } : r;
}

export async function rateItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'rate_brief_item', { itemId: s(fd, 'itemId'), useful: s(fd, 'useful') === 'true' });
  return r.ok ? { ok: true, message: 'Thanks — rating saved.' } : r;
}

export async function approveAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ recommendations: number }>(ctx, 'approve_brief', { briefId: s(fd, 'briefId') });
  if (!r.ok) return r;
  refresh(s(fd, 'briefId'));
  return { ok: true, message: `Approved — it goes out Monday 07:00. ${r.data.recommendations} recommendation(s) created.` };
}

export async function sendNowAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ notifications: number; pdf: string }>(ctx, 'send_brief_now', { briefId: s(fd, 'briefId') });
  if (!r.ok) return r;
  refresh(s(fd, 'briefId'));
  return { ok: true, message: `Sent to ${r.data.notifications} recipient(s). The PDF ${r.data.pdf === 'queued' ? 'is being prepared' : 'will be prepared shortly'}.` };
}

export async function autoSendAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'set_brief_auto_send', { clientId: s(fd, 'clientId'), enabled: s(fd, 'enabled') === 'true' });
  if (r.ok) refresh(s(fd, 'briefId'));
  return r.ok ? { ok: true, message: s(fd, 'enabled') === 'true' ? 'Untouched briefs will send automatically.' : 'Auto-send is off.' } : r;
}
```

`review-controls.tsx` (`'use client'`), exports:
- `ReviewItem({ briefId, item, editable, first, last })` — an `<article id={\`item-${item.id}\`}>` styled like `BriefView` (5a: left border amber when `confidence ≥ 0.85`, else primary; muted surface; dropped items at 60 % opacity with a "Dropped" badge). Shows headline, `**competitorName:** whatChanged`, whyItMatters, "Suggested: recommendedAction", "N evidence items", `Upsell: <tag>` chip when set, "Confidence N %". When `editable && item.status === 'active'`: an **Edit** button opening a `Dialog` with a form (`editItemAction`; hidden `briefId`/`itemId`; four `<textarea>`s labelled Headline / What changed / Why it matters / Suggested action, each `defaultValue` from the item, `maxLength={1200}`; the action's message — including fact-check warnings — shows inside the dialog), a **Remove** button opening a `Dialog` with an optional reason (`dropItemAction`), and **Move up** / **Move down** buttons (each its own tiny form posting `moveItemAction` with `dir`; `disabled={first}` / `disabled={last}`; `aria-label` exactly "Move up"/"Move down"). Always (any status, active items): **Useful** / **Not useful** buttons (`rateItemAction`, `aria-label` "Useful" and "Not useful").
- `ReviewFooter({ briefId, clientId, status, autoSend })` — the auto-send `Switch` (form `autoSendAction`, hidden `enabled` value, label "Send untouched briefs automatically on Monday 07:00"), an **Approve · send Mon 07:00** button when `status === 'ready'` (`approveAction`), and a **Send now** button when `status` is `ready` or `approved` that opens a confirm `Dialog` ("Send this brief to the client’s recipients now?") posting `sendNowAction`. Each shows its `FormResult`.

`/agency/approvals/page.tsx`: agency-only; `callTool<{ items: BriefQueueRow[] }>(ctx, 'list_brief_queue', {})`. Title "Approval queue", subtitle "Friday drafts each brief on Thursday night. Clients set to auto-send get untouched briefs Monday 07:00." A `Table`: Client (link to `/agency/approvals/<briefId>`), Week of (deliveryDate), Status badge (`ready` → "Needs review"; `approved` → "Approved"; `sent` → "Sent"; `failed` → "Failed — retrying"; `generating` → "Drafting"; and `kind === 'quiet'` adds a "Quiet week" badge), Items ("N items · M removed"), flags ("Edited" when `touched`, "Auto-send" when `autoSend`). Empty state: "Nothing to review this week."

`/agency/approvals/[briefId]/page.tsx`: agency-only; `callTool<BriefReview>(ctx, 'get_brief_review', { briefId })`. Header: "{clientName} · week of {deliveryDate}" + status badge + a "Client view" link to `/c/<clientId>/briefs/<briefId>`. A fact-check banner (`rounded-lg bg-muted-surface p-3`): "✔ Every remaining sentence was checked against saved evidence." and, when `factCheck.sentences > 0` or `factCheck.items > 0`, "The fact-check removed {sentences} sentence(s) and {items} item(s) it couldn’t prove." The summary paragraph. Items sorted by `ord`, active first then dropped; render `ReviewItem` with `editable={status === 'ready'}`, `first`/`last` computed over the active list. Then `ReviewFooter`. A `quiet` brief shows "No significant competitor moves this week." and still offers approve/send.

Nav: `'approvals'` icon key → `ClipboardCheck`; push `{ href: '/agency/approvals', label: 'Approvals', icon: 'approvals' }` right after Portfolio for agency roles.

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): approval queue and brief review editor"
```

---

### Task 12: Alert review queue — tools and screen

**Files:**
- Create: `packages/tools/src/tools/alert-queue.ts`, `packages/tools/src/tools/alert-queue.test.ts`, `apps/web/src/app/(app)/agency/alerts/page.tsx`, `apps/web/src/app/(app)/agency/alerts/actions.ts`, `apps/web/src/app/(app)/agency/alerts/alert-controls.tsx`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `approveAlert`, `dismissAlert`, `ReleaseOutcome` (`@cs/engine`); `alert`, `client`, `competitor`, `withTenant` (`@cs/db`).
- Produces:
  - zod `AlertQueueRow` = `{ id, clientId, clientName, competitorName, headline, body, score, status, heldForDigest: boolean, written: string|null, evidenceCount: number, createdAt: string }`
  - tools `list_alert_queue {}` → `{ items: AlertQueueRow[] }`; `approve_alert {alertId}` → `{ outcome: 'immediate' | 'digest' | 'withdrawn' }`; `dismiss_alert {alertId, reason}` → `{ ok: true }`
  - route `/agency/alerts`; nav `{ href: '/agency/alerts', label: 'Alert review', icon: 'alerts' }`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/tools/alert-queue.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { alert, changeEvent, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { DeliveryConfig } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'http://localhost:3000', linkSecrets: ['k'.repeat(40)], fromAddress: 'alerts@example.com' };
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, delivery }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const am = ctx('account_manager', [IDS.clientA1]);
const amA2 = ctx('account_manager', [IDS.clientA2]);
let pending = '';

async function mkAlert(status: string, delivery: string | null = null): Promise<string> {
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 'Smith HVAC cut tune-ups to $59', confidence: 0.9, occurredAt: new Date() }).returning();
  const [a] = await dbs.owner.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e!.id, score: 82, headline: 'Price cut', body: 'Smith HVAC cut tune-ups to $59.', status, mode: 'after_am_check', delivery, evidenceIds: ['00000000-0000-4000-8000-0000000000e1'] }).returning();
  return a!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
  pending = await mkAlert('pending_review');
  await mkAlert('approved', 'digest');
  await mkAlert('delivered', 'immediate');
});

describe('alert queue', () => {
  it('lists alerts waiting for review and digest-held ones, scoped', async () => {
    const { items } = (await registry.invoke(am, 'list_alert_queue', {})) as { items: { status: string; heldForDigest: boolean; clientName: string; evidenceCount: number }[] };
    expect(items.map((i) => [i.status, i.heldForDigest])).toEqual([['pending_review', false], ['approved', true]]);
    expect(items[0]).toMatchObject({ clientName: 'A1 HVAC', evidenceCount: 1 });
    expect(((await registry.invoke(amA2, 'list_alert_queue', {})) as { items: unknown[] }).items).toEqual([]);
  });

  it('approves once (Review Focus 2) and refuses other scopes (Review Focus 1)', async () => {
    await expect(registry.invoke(amA2, 'approve_alert', { alertId: pending })).rejects.toMatchObject({ code: 'not_found' });
    const { outcome } = (await registry.invoke(am, 'approve_alert', { alertId: pending })) as { outcome: string };
    expect(['immediate', 'digest']).toContain(outcome);
    await expect(registry.invoke(am, 'approve_alert', { alertId: pending })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('dismisses with a reason only', async () => {
    await expect(registry.invoke(am, 'dismiss_alert', { alertId: pending, reason: '  ' })).rejects.toMatchObject({ code: 'invalid_input' });
    await registry.invoke(am, 'dismiss_alert', { alertId: pending, reason: 'Already discussed with the client' });
    expect((await dbs.owner.select().from(alert).where(eq(alert.id, pending)))[0]).toMatchObject({ status: 'dismissed', dismissReason: 'Already discussed with the client' });
  });

  it('explains missing delivery configuration on approve', async () => {
    const bare = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    await expect(bare.invoke(am, 'approve_alert', { alertId: pending })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/alert-queue.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Add to `schemas.ts`:

```ts
export const AlertQueueRow = z.object({
  id: uuid, clientId: uuid, clientName: z.string(), competitorName: z.string(), headline: z.string(), body: z.string(), score: z.number(), status: z.string(),
  heldForDigest: z.boolean(), written: z.string().nullable(), evidenceCount: z.number().int(), createdAt: iso,
});
export type AlertQueueRow = z.infer<typeof AlertQueueRow>;
```

`packages/tools/src/tools/alert-queue.ts`:

```ts
import { toolkit, ToolError } from '@cs/core';
import { alert, client, competitor, withTenant } from '@cs/db';
import { approveAlert, dismissAlert } from '@cs/engine';
import { and, asc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { AlertQueueRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export const listAlertQueue = defineTool({
  name: 'list_alert_queue',
  description: 'Alerts waiting for an account manager’s check, and approved alerts held for the 17:00 digest, oldest first.',
  input: z.object({}),
  output: z.object({ items: z.array(AlertQueueRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx
        .select({ a: alert, clientName: client.name, competitorName: competitor.name })
        .from(alert)
        .innerJoin(client, eq(client.id, alert.clientId))
        .leftJoin(competitor, eq(competitor.id, alert.competitorId))
        .where(or(eq(alert.status, 'pending_review'), and(eq(alert.status, 'approved'), eq(alert.delivery, 'digest'))))
        .orderBy(asc(alert.createdAt))
        .limit(200));
    return {
      items: rows.map(({ a, clientName, competitorName }) => ({
        id: a.id, clientId: a.clientId, clientName, competitorName: competitorName ?? 'Competitor', headline: a.headline, body: a.body, score: a.score, status: a.status,
        heldForDigest: a.status === 'approved', written: a.written, evidenceCount: a.evidenceIds.length, createdAt: a.createdAt.toISOString(),
      })),
    };
  },
});

export const approveAlertTool = defineTool({
  name: 'approve_alert',
  description: 'Approve an alert waiting for review: it goes to the client now, or into the 17:00 digest if today’s limit is reached.',
  input: z.object({ alertId: uuid }),
  output: z.object({ outcome: z.enum(['immediate', 'digest', 'withdrawn']) }),
  permission: 'agency',
  async handler(ctx, { alertId }, deps) {
    if (!deps.delivery) throw new ToolError('invalid_input', 'Sending is not configured on this server (APP_URL and LINK_SIGNING_SECRET)');
    return { outcome: await approveAlert({ service: deps.service, app: deps.app, delivery: deps.delivery }, ctx, alertId) };
  },
});

export const dismissAlertTool = defineTool({
  name: 'dismiss_alert',
  description: 'Dismiss an alert waiting for review or for the digest. A reason is required.',
  input: z.object({ alertId: uuid, reason: z.string().max(500) }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { alertId, reason }, deps) {
    await dismissAlert({ service: deps.service, app: deps.app }, ctx, alertId, reason);
    return { ok: true as const };
  },
});

export const alertQueueTools = [listAlertQueue, approveAlertTool, dismissAlertTool];
```

Append `...alertQueueTools` to `allTools`.

Web — `actions.ts`: `approveAlertAction` (`runTool<{ outcome: 'immediate' | 'digest' | 'withdrawn' }>(ctx, 'approve_alert', { alertId })`; messages: immediate → "Sent to the client.", digest → "Today’s limit of 3 alerts is reached — it goes out in the 17:00 digest.", withdrawn → "Withdrawn — its evidence was retracted, so nothing was sent."), `dismissAlertAction` (`dismiss_alert` with the form's `reason`). Both agency-only via the same `agencyCtx()` helper and `revalidatePath('/agency/alerts')` + `revalidatePath('/agency')`.

`alert-controls.tsx` (`'use client'`): `AlertCard({ alert: AlertQueueRow })` — card with client name, competitor, score chip ("Score 82"), headline (bold), body, "N evidence items", a muted "Template text" note when `written === 'template'` ("Friday couldn’t verify its own wording, so this uses the evidence summary."), a "Held for the 17:00 digest" badge when `heldForDigest`; buttons **Approve & send** (only when `status === 'pending_review'`) and **Dismiss** (opens a `Dialog` with a required reason `<textarea>`, `required minLength={1} maxLength={500}`).

`page.tsx`: agency-only; `callTool<{ items: AlertQueueRow[] }>(ctx, 'list_alert_queue', {})`; title "Alert review"; subtitle "High-priority alerts (score 70+) for clients set to “after my check”. Unreviewed alerts expire after 7 days."; cards in a single column; empty state "No alerts waiting — nice." .

Nav: `'alerts'` icon key → `Siren`; push `{ href: '/agency/alerts', label: 'Alert review', icon: 'alerts' }` after Approvals for agency roles; add a `sidebar-nav.test.tsx` highlight case.

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/tools/alert-queue.test.ts` and `pnpm --filter @cs/web exec vitest run src/components/shell/sidebar-nav.test.tsx` → PASS; typecheck both.

- [ ] **Step 5: Commit**

```bash
git add packages/tools apps/web
git commit -m "feat(tools,web): alert review queue with approve and dismiss"
```

---

### Task 13: Recommendations — list/status tools, and dismissal when an item is dropped at delivery

**Files:**
- Create: `packages/tools/src/tools/recommendations.ts`, `packages/tools/src/tools/recommendations.test.ts`
- Modify: `packages/engine/src/briefs/review.ts`, `packages/engine/src/briefs/review.test.ts` (or `deliver.test.ts` — whichever already exercises `dropRetractedItems`), `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: `updateRecommendationStatus` (`@cs/engine`); `recommendation`, `RecommendationStatus`, `withTenant` (`@cs/db`).
- Produces:
  - `RECOMMENDATION_WITHDRAWN_REASON = 'Evidence withdrawn before delivery'` (engine, exported)
  - zod `RecommendationView` = `{ id, title, rationale, effort, impact, owner, status, dismissReason: string|null, dueAt: string|null, source, evidenceIds: string[], upsellTag: string|null, createdAt, updatedAt }`
  - tools `list_recommendations {clientId}` → `{ items: RecommendationView[] }`; `update_recommendation_status {recommendationId, status, reason?}` → `{ ok: true }`

- [ ] **Step 1: Write the failing tests**

Engine (`review.test.ts`, using that file's fixtures for a brief with items whose `eventIds` point at events):

```ts
it('dismisses the todo recommendation of an item dropped because its evidence was retracted (4b parked item)', async () => {
  // Given an approved brief whose item A has a `todo` recommendation and item B an `in_progress` one,
  // and both items' events are then retracted:
  const dropped = await dbs.service.transaction((tx) => dropRetractedItems(tx, briefId));
  expect(dropped.sort()).toEqual([itemA, itemB].sort());
  const [recA] = await dbs.owner.select().from(recommendation).where(eq(recommendation.briefItemId, itemA));
  expect(recA).toMatchObject({ status: 'dismissed', dismissReason: RECOMMENDATION_WITHDRAWN_REASON });
  const [recB] = await dbs.owner.select().from(recommendation).where(eq(recommendation.briefItemId, itemB));
  expect(recB!.status).toBe('in_progress');
  const fb = await dbs.owner.select().from(feedback).where(and(eq(feedback.subjectType, 'recommendation'), eq(feedback.subjectId, recA!.id)));
  expect(fb).toEqual([expect.objectContaining({ kind: 'status', actor: 'system', reason: RECOMMENDATION_WITHDRAWN_REASON })]);
});
```

Build the fixture with that file's helpers: insert two events, a brief in status `approved`, two items referencing one event each, two recommendations (`briefItemId` set, statuses `todo` and `in_progress`), then set `retracted_at` on both events.

`packages/tools/src/tools/recommendations.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const am = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);
const viewer = ctx('client_viewer', [IDS.clientA1]);
const ownerA2 = ctx('client_owner', [IDS.clientA2]);
let recId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [r] = await dbs.owner.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 'Offer a tune-up bundle', rationale: 'Smith HVAC cut its price.', effort: 'L', impact: 'H', owner: 'client', source: 'brief', upsellTag: 'ppc_audit' }).returning();
  recId = r!.id;
});

describe('recommendations (Review Focus 4)', () => {
  it('lists for agency and client roles; only agencies see the upsell tag', async () => {
    const asAm = (await registry.invoke(am, 'list_recommendations', { clientId: IDS.clientA1 })) as { items: { upsellTag: string | null }[] };
    expect(asAm.items[0]!.upsellTag).toBe('ppc_audit');
    const asViewer = (await registry.invoke(viewer, 'list_recommendations', { clientId: IDS.clientA1 })) as { items: { upsellTag: string | null }[] };
    expect(asViewer.items).toHaveLength(1);
    expect(asViewer.items[0]!.upsellTag).toBeNull();
    await expect(registry.invoke(ownerA2, 'list_recommendations', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets owners and agencies change status, never viewers; dismissal needs a reason', async () => {
    await registry.invoke(owner, 'update_recommendation_status', { recommendationId: recId, status: 'in_progress' });
    expect((await dbs.owner.select().from(recommendation).where(eq(recommendation.id, recId)))[0]!.status).toBe('in_progress');
    await expect(registry.invoke(viewer, 'update_recommendation_status', { recommendationId: recId, status: 'done' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(am, 'update_recommendation_status', { recommendationId: recId, status: 'dismissed' })).rejects.toMatchObject({ code: 'invalid_input' });
    await registry.invoke(am, 'update_recommendation_status', { recommendationId: recId, status: 'dismissed', reason: 'Client already runs this offer' });
    expect((await dbs.owner.select().from(recommendation).where(eq(recommendation.id, recId)))[0]).toMatchObject({ status: 'dismissed', dismissReason: 'Client already runs this offer' });
    await expect(registry.invoke(ownerA2, 'update_recommendation_status', { recommendationId: recId, status: 'done' })).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/engine exec vitest run src/briefs/review.test.ts` and `pnpm --filter @cs/tools exec vitest run src/tools/recommendations.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`packages/engine/src/briefs/review.ts` — export the reason and extend `dropRetractedItems` (update its doc comment: "…and dismisses those items' still-`todo` recommendations (4b parked item; 5b-1 decision 14). Recommendations someone already started or finished are left alone."):

```ts
export const RECOMMENDATION_WITHDRAWN_REASON = 'Evidence withdrawn before delivery';
```

At the end of `dropRetractedItems`, before `return`:

```ts
  const withdrawn = await tx
    .update(recommendation)
    .set({ status: 'dismissed', dismissReason: RECOMMENDATION_WITHDRAWN_REASON, updatedAt: new Date() })
    .where(and(inArray(recommendation.briefItemId, stale.map((i) => i.id)), eq(recommendation.status, 'todo')))
    .returning({ id: recommendation.id, agencyId: recommendation.agencyId, clientId: recommendation.clientId });
  if (withdrawn.length) {
    await tx.insert(feedback).values(withdrawn.map((r) => ({
      agencyId: r.agencyId, clientId: r.clientId, subjectType: 'recommendation', subjectId: r.id, kind: 'status', actor: 'system',
      before: { status: 'todo' }, after: { status: 'dismissed' }, reason: RECOMMENDATION_WITHDRAWN_REASON,
    })));
  }
```

(At approval, `dropRetractedItems` runs before recommendations exist, so this only bites at delivery — exactly the 4b parked case.)

Add to `schemas.ts`:

```ts
export const RecommendationView = z.object({
  id: uuid, title: z.string(), rationale: z.string(), effort: z.string(), impact: z.string(), owner: z.string(), status: z.enum(['todo', 'in_progress', 'done', 'dismissed']),
  dismissReason: z.string().nullable(), dueAt: iso.nullable(), source: z.string(), evidenceIds: z.array(z.string()), upsellTag: z.string().nullable(), createdAt: iso, updatedAt: iso,
});
export type RecommendationView = z.infer<typeof RecommendationView>;
```

`packages/tools/src/tools/recommendations.ts`:

```ts
import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { recommendation, withTenant } from '@cs/db';
import { updateRecommendationStatus } from '@cs/engine';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { RecommendationView, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const STATUSES = ['todo', 'in_progress', 'done', 'dismissed'] as const;

export const listRecommendations = defineTool({
  name: 'list_recommendations',
  description: 'Recommended next steps for a client, newest first, with their status.',
  input: z.object({ clientId: uuid }),
  output: z.object({ items: z.array(RecommendationView) }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(recommendation).where(eq(recommendation.clientId, clientId)).orderBy(desc(recommendation.updatedAt)).limit(300));
    const agency = isAgencyRole(ctx.role);
    return {
      items: rows.map((r) => ({
        id: r.id, title: r.title, rationale: r.rationale, effort: r.effort, impact: r.impact, owner: r.owner, status: r.status as (typeof STATUSES)[number],
        dismissReason: r.dismissReason, dueAt: toIso(r.dueAt), source: r.source, evidenceIds: r.evidenceIds, upsellTag: agency ? r.upsellTag : null,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      })),
    };
  },
});

export const updateRecommendationStatusTool = defineTool({
  name: 'update_recommendation_status',
  description: 'Move a recommendation to to-do, in progress, done or dismissed (dismissing needs a reason).',
  input: z.object({ recommendationId: uuid, status: z.enum(STATUSES), reason: z.string().max(500).optional() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'manage',
  async handler(ctx, { recommendationId, status, reason }, deps) {
    await updateRecommendationStatus({ service: deps.service, app: deps.app }, ctx, recommendationId, status, reason?.trim() || undefined);
    return { ok: true as const };
  },
});

export const recommendationTools = [listRecommendations, updateRecommendationStatusTool];
```

Append `...recommendationTools` to `allTools`.

- [ ] **Step 4: Run tests** — the Step 2 commands → PASS; `pnpm --filter @cs/engine exec vitest run src/briefs` (all brief tests — `deliver.test.ts` exercises `dropRetractedItems` at send) → PASS; typecheck both packages.

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/tools
git commit -m "feat(engine,tools): recommendation list/status tools; dismiss todo recommendations of items dropped at delivery"
```

---

### Task 14: Recommendations board (agency and client roles)

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/recommendations/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/recommendations/actions.ts`, `apps/web/src/components/recommendation-board.tsx`, `apps/web/src/components/recommendation-board.test.tsx`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: Task 13 tools; `hasPermission`, `isAgencyRole` (`@cs/core`, server side only); `runTool`, `callTool`.
- Produces: `<RecommendationBoard items canEdit agency clientId action />` (`action` = the route's `setStatusAction`, passed as a prop so the shared component never imports a route file); route `/c/<id>/recommendations`; nav item `{ label: 'Recommendations', icon: 'recommendations' }` for agency (client-scoped) **and** client/guest roles (`/c/<homeClient>/recommendations`).

- [ ] **Step 1: Write the failing tests**

`recommendation-board.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { RecommendationBoard } = await import('./recommendation-board');

const rec = (id: string, status: 'todo' | 'in_progress' | 'done' | 'dismissed', extra: object = {}) => ({
  id, title: `Rec ${id}`, rationale: 'because', effort: 'L', impact: 'H', owner: 'client', status, dismissReason: status === 'dismissed' ? 'Not now' : null, dueAt: null,
  source: 'brief', evidenceIds: ['e1'], upsellTag: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', ...extra,
});

describe('RecommendationBoard', () => {
  it('groups by status with a collapsed dismissed list', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo'), rec('b', 'in_progress'), rec('c', 'done'), rec('d', 'dismissed')]} />);
    expect(within(screen.getByRole('region', { name: 'To do' })).getByText('Rec a')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'In progress' })).getByText('Rec b')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Done' })).getByText('Rec c')).toBeTruthy();
    expect(screen.getByText(/1 dismissed/i)).toBeTruthy();
  });

  it('hides status controls for read-only viewers and the upsell tag for clients', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit={false} items={[rec('a', 'todo', { upsellTag: 'ppc' })]} />);
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
    expect(screen.queryByText(/ppc/)).toBeNull();
  });

  it('offers the next steps for an editable to-do card', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency canEdit items={[rec('a', 'todo', { upsellTag: 'ppc' })]} />);
    expect(screen.getByRole('button', { name: 'Start Rec a' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark Rec a done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss Rec a' })).toBeTruthy();
    expect(screen.getByText('Upsell: ppc')).toBeTruthy();
  });
});
```

`sidebar-nav.test.tsx`: a client viewer sees `Recommendations` linking to `/c/<CLIENT_ID>/recommendations`; an agency admin on `/c/<id>/recommendations` sees it highlighted.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/components/recommendation-board.test.tsx src/components/shell/sidebar-nav.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`actions.ts` (`/c/[clientId]/recommendations/actions.ts`) — **any signed-in role**: the tool decides (`manage` permission → agency roles and client owners; viewers and guests get "Not found"):

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function setStatusAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const status = s(fd, 'status');
  if (status === 'dismissed' && !s(fd, 'reason')) return { ok: false, error: 'Tell us why you’re dismissing it.' };
  const r = await runTool(ctx, 'update_recommendation_status', { recommendationId: s(fd, 'recommendationId'), status, reason: s(fd, 'reason') || undefined });
  if (r.ok) revalidatePath(`/c/${s(fd, 'clientId')}/recommendations`);
  return r.ok ? { ok: true } : r;
}
```

`recommendation-board.tsx` (`'use client'`): props `{ clientId: string; items: RecommendationView[]; canEdit: boolean; agency: boolean; action: (prev: FormResult, fd: FormData) => Promise<FormResult> }`; every status form uses `useActionState(action, …)`. Three columns (`grid gap-5 lg:grid-cols-3`), each a `<section aria-label="To do">` / "In progress" / "Done" with a count in its heading; cards (`rounded-[14px] bg-surface p-4 shadow-card`) show title (bold), rationale, effort/impact chips ("Effort L", "Impact H"), owner ("For you" when `owner === 'client'`, "Agency" otherwise), source ("From weekly brief" / "From a detected move" / "From Ask"), "N evidence items", and — only when `agency && upsellTag` — `Upsell: <tag>`. When `canEdit`: per-status buttons, each a tiny form posting the `action` prop with hidden `recommendationId`, `clientId`, `status` — todo: **Start** (→ in_progress), **Done** (→ done), **Dismiss**; in_progress: **Done**, **Back to to-do**, **Dismiss**; done: **Reopen** (→ in_progress). Button `aria-label`s are full sentences: `Start ${title}`, `Mark ${title} done`, `Move ${title} back to to-do`, `Reopen ${title}`, `Dismiss ${title}`. **Dismiss** opens a `Dialog` with a required reason textarea. Below the columns, a `<details>` "N dismissed" listing dismissed titles with their reason (and, when `canEdit`, a **Reopen** button → `todo`). Empty board: "No recommendations yet — they arrive with each approved weekly brief."

`page.tsx`:

```tsx
import { hasPermission, isAgencyRole } from '@cs/core';
import type { ClientProfile, RecommendationView } from '@cs/tools';
import { RecommendationBoard } from '@/components/recommendation-board';
import { setStatusAction } from './actions';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  const [profile, recs] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId }),
  ]);
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Recommendations — {profile.name}</h1>
      <p className="text-muted-foreground">Next steps from your weekly briefs and detected competitor moves.</p>
      <RecommendationBoard action={setStatusAction} clientId={clientId} items={recs.items} agency={isAgencyRole(ctx.role)} canEdit={viewer.kind === 'user' && hasPermission(ctx, 'manage')} />
    </>
  );
}
```

Nav (`nav-items.ts`): `'recommendations'` icon key → `ListChecks`. Agency client-scoped block: push `{ href: \`/c/${clientId}/recommendations\`, label: 'Recommendations', icon: 'recommendations' }` after Overview. Non-agency branch: after Overview push `{ href: \`${flags.homePath}/recommendations\`, label: 'Recommendations', icon: 'recommendations' }` (`homePath` is `/c/<id>` for client roles and guests).

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): recommendations board for agency and client roles"
```

---

### Task 15: E2E workflow tests, full suite, live verification and documentation

**Files:**
- Create: `apps/web/e2e/helpers.ts`, `apps/web/e2e/workflow.spec.ts`
- Modify: `apps/web/e2e/seed.ts`, `apps/web/e2e/smoke.spec.ts`, `docs/HANDOVER.md`, `docs/superpowers/plans/2026-09-29-roadmap.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `signIn(page: Page, email: string, next?: string): Promise<void>` and `latestMagicLink()` in `e2e/helpers.ts`; 3 new E2E tests.

- [ ] **Step 1: E2E helpers and seed**

Move `latestMagicLink` from `smoke.spec.ts` into `e2e/helpers.ts` (export it; `smoke.spec.ts` imports it) and add:

```ts
export async function signIn(page: Page, email: string, next = '/agency'): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();
  await expect(page).toHaveURL(/check-email/);
  await page.goto(await latestMagicLink());
}
```

Extend `seed.ts` (same transaction style): for client "E2E HVAC" add a `ready` brief with `deliveryDate: '2026-10-12'` and one active item headlined "Smith HVAC launched a $49 drain-cleaning promo" (`upsellTag: 'ppc_audit'`); a global `event` for Smith HVAC (`changeType: 'promo'`, `summary: 'Smith HVAC launched a $49 drain-cleaning promo.'`, `confidence: 0.9`, `occurredAt: new Date()`) and a `pending_review` alert on it (`score: 81`, `headline: 'Smith HVAC started a $49 promo'`, `body: 'Smith HVAC launched a $49 drain-cleaning promo.'`, `mode: 'after_am_check'`). The 5a seed already creates `owner@e2e.test` as a client contact (so approval produces notifications).

- [ ] **Step 2: Write the workflow tests**

`apps/web/e2e/workflow.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('an admin adds a client and lands on its competitors page', async ({ page }) => {
  await signIn(page, 'admin@e2e.test', '/agency/clients/new');
  await page.getByLabel('Business name').fill('E2E Dental');
  await page.getByLabel('Vertical').selectOption('dental');
  await page.getByLabel(/search keywords/i).fill('dentist\nteeth cleaning');
  await page.getByLabel(/map centre/i).fill('33.95, -84.33');
  await page.getByLabel(/radius/i).fill('10');
  await page.getByRole('button', { name: 'Create client' }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/competitors$/);
  await expect(page.getByRole('heading', { name: 'Competitors — E2E Dental' })).toBeVisible();
  // Website monitoring is off in E2E: the Find competitors button exists, but nothing is crawled.
  await expect(page.getByRole('button', { name: /find competitors/i })).toBeEnabled();
});

test('an admin approves the ready brief and its recommendation appears on the board', async ({ page }) => {
  await signIn(page, 'admin@e2e.test', '/agency/approvals');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Smith HVAC launched a $49 drain-cleaning promo').first()).toBeVisible();
  await page.getByRole('button', { name: /approve/i }).click();
  await expect(page.getByText(/approved — it goes out monday/i)).toBeVisible();
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).click();
  await page.getByRole('link', { name: 'Recommendations' }).click();
  await expect(page.getByRole('region', { name: 'To do' }).getByText(/drain-cleaning|bundle|promo/i).first()).toBeVisible();
});

test('an admin dismisses a pending alert with a reason', async ({ page }) => {
  await signIn(page, 'admin@e2e.test', '/agency/alerts');
  await expect(page.getByText('Smith HVAC started a $49 promo')).toBeVisible();
  await page.getByRole('button', { name: /dismiss/i }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill('Client already knows');
  await page.getByRole('dialog').getByRole('button', { name: /dismiss/i }).click();
  await expect(page.getByText('No alerts waiting — nice.')).toBeVisible();
});
```

(The recommendation's title comes from the item's `recommendedAction` — set the seeded item's `recommendedAction` to "Run a $49 drain-cleaning bundle" so the board assertion is specific; then assert that text exactly instead of the regex.) The approval test relies on `brief_ready` being `ready`; it must run after the smoke test that only reads the sent brief — the suite is serial (`workers: 1`), and the smoke tests don't touch the ready brief.

- [ ] **Step 3: Run the E2E suite**

`pnpm --filter @cs/web e2e` in the background (production build takes minutes); poll with short foreground checks; start no other `cs_test` run meanwhile. Expected: 6 passed (3 smoke + 3 workflow).

- [ ] **Step 4: Full suite**

`pnpm typecheck`, then the full `pnpm test` in the background (`pnpm turbo run test --concurrency=1 --continue`; ≈ 40 min against Neon). Expected: all green — the 5a baseline was 1184 passed + 3 skipped, plus this phase's new tests. Record per-package counts.

- [ ] **Step 5: Live verification on `cs_dev` (controller, with the owner)**

1. No migration in 5b-1 (`cs_dev` stays at `0035`). Restart the worker once so `updateQueue` applies `policy: 'short'` to `suggest-competitors`/`discover-pages`.
2. `$env:POSTMARK_SERVER_TOKEN=''; pnpm dev:web`; sign in as the owner (agency admin of `CS Dev Verification Agency`).
3. Portfolio: the verification client shows pressure (its one `archive` event doesn't count → likely 0 "Quiet"), last activity, any ready brief.
4. Profile: open `CS Dev Verification Client` → Profile; with the owner's go-ahead set keywords (e.g. "ac repair", "hvac repair"), a service area around Granbury TX (Aire Serv of Granbury) and — closing HANDOVER §5 item 5 — the client's own Google place id if the owner has one.
5. Competitors: with the owner's go-ahead (paid, ≈ $0.04 at defaults), click **Find competitors**, run the worker (`pnpm --filter @cs/worker dev` or `start`), and confirm suggestions appear; accept one (vendor sources start; "Website monitoring is off" message); dismiss one; remove and re-add a competitor; confirm the alert list still shows names/"Competitor".
6. Approvals: open the stored brief(s) (the quiet 2026-10-12 brief if still `ready`); rate, approve (or send now with the owner's go-ahead — file outbox for `@example.com` contacts) and check `/files/brief/<id>` renders after the worker runs.
7. Alert review and Recommendations: verify empty states (cs_dev has no pending alerts) and, after an approval with items, the board.
8. Record every finding in the HANDOVER; fix code bugs with a regression test before continuing.

- [ ] **Step 6: Documentation**

- `docs/HANDOVER.md`: state line (5b-1 complete on branch `phase-5b1-workflow`, not yet merged; next: merge, then write the 5b-2 plan from this plan's "Phase 5b split" table); a Phase 5b-1 paragraph in §3 (tools added, decisions 1–14 one line each, the engine/collector changes, test counts, live-verification results); §4 env: `WEB_MONITORING_ENABLED` (unset = no crawling; set `true` only once the bot page exists); §5 next steps (5b-2: `PLATFORM_ADMIN_EMAILS`, $15 default cap, prospecting snapshot); §6 gotchas — every web write is a registered tool called through `runTool`; `ToolDeps` optional members and what happens when they're missing; collection claims now skip untracked competitors (a competitor stops being collected the moment its last client removes it); `list_brief_queue`'s "newest per client + any ready" rule; `dropRetractedItems` now dismisses `todo` recommendations.
- Roadmap: Phase 5 row → "5a ✅ · 5b-1 ✅ done <date> ([plan](2026-10-05-phase-5b1-agency-workflow.md)) · 5b-2 / 5c to be written"; a "Phase 5b-1 carry-over" section with per-task review minors plus: per-client page deactivation; drag-and-drop reordering; agency-wide recommendation board; client-owner self-service competitor UI (5c); `list_brief_queue` calls `isUntouched` once per brief (N+1, fine at pilot scale); the 5a carry-over items moved to 5b-2.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e docs
git commit -m "test(web): 5b-1 workflow E2E; docs: Phase 5b-1 verification, handover and carry-over"
```

---

## Self-review notes (writing-plans checklist, done 2026-10-05)

- **Spec coverage (5b-1 scope):** §5.1 Portfolio → Tasks 8–9 (pressure per mockup 01, decision 10); §4.1 onboarding steps 1–3 → Tasks 2–7 (services from the vertical catalog, service area, competitor discovery with AM confirmation and a 3–5 limit, page pin/unpin; discovery gated per HANDOVER §5 item 6); §5.1 approval queue + §9.1 step 6 (edit inline, reorder, drop, approve, send now, per-client auto-send, edits stored as feedback by the engine) → Tasks 10–11; §9.3 AM alert check → Task 12; §5.2 module 9 + §8.5 (list/kanban, status, dismiss reasons, upsell agency-only, status changes stored as feedback) → Tasks 13–14; §8.1–8.2 one registry, audited, tool names from §8.2 where they exist (`list_recommendations`, `update_recommendation_status`, `approve_brief`, `add_competitor`, `remove_competitor`, `list_alerts`) → every task. 5a/4b obligations owed here: `approveAlert`/`dismissAlert`/`sendBriefNow` + `brief-pdf` enqueue (Tasks 10, 12), `list_alerts` left join in the unpin task (Task 5), recommendations of items dropped at delivery (Task 13). Moved to 5b-2 by the owner's split: playbooks, model-ops queues, usage & limits, prospecting, the 5a auth/audit hardening.
- **Review Focus → tests:** 1 → cross-scope cases in `onboarding.test.ts`, `competitors.test.ts`, `pages.test.ts`, `review.test.ts`, `alert-queue.test.ts`, `recommendations.test.ts`; 2 → `review.test.ts` (approve-then-edit, double approve, double send) and `alert-queue.test.ts` (double approve); 3 → `competitors.test.ts` remove/list_alerts/re-add + collectors scheduling tests; 4 → `recommendations.test.ts` + `recommendation-board.test.tsx`; 5 → `competitors.test.ts` (enqueue only when monitoring on, singleton keys), `pages.test.ts` (refused when off), worker queue-policy tests.
- **Type consistency:** `ToolDeps`/`EnqueueJob`/`QueueJob` (Task 1) are the only deps types; `Discovery` (Task 4) is reused by Task 5; `ServiceAreaInput` (Task 2) is used by Task 3's parser; `BriefReview`/`BriefQueueRow` (Task 10) by Task 11; `AlertQueueRow` (Task 12); `RecommendationView` (Task 13) by Task 14; `PortfolioRow`/`Pressure` (Task 8) by Task 9.
