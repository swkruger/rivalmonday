# Phase 5b-2 — Agency Operations (Usage & Limits, Playbooks, Model-Ops Queues, Prospecting, Auth/Audit Hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agency staff the operating screens that sit around the 5b-1 workflow: per-client usage against a monthly cap (default $15, 80 % warning) and a configurable competitor limit; an editor for the agency's playbook overrides; a **prospecting snapshot** (a prospect is a client in `prospect` status: find competitors, one GBP + ads pull and a 3×3 rank scan, a deterministic landscape report, then convert to a client); and two **platform-operator** queues (`decision_review` resolution and theme proposals). Close the remaining 5a auth/audit hardening (Google sign-in refusal, hashed magic-link tokens, audit-logged settings writes, m2/m3, the multi-membership `/c/[clientId]` switch) and three 5b-1 carry-over items.

**Architecture:** Same shape as 5b-1. Every new read and write is a registered tool in `@cs/tools` (audit-logged, reusable by Phase 6 MCP/Ask). 5a's settings service functions (team, branding, webhooks, recipients, delivery, personal preferences) also become registered tools, so every mutation is audit-logged. One migration adds `client.status`, `client.monthly_cap_usd` and `client.competitor_limit`, plus a tenant table `prospect_report`. Prospects get no recurring work: every scheduler that picks clients or tracked competitors filters on `client.status = 'active'`. A new worker job, `prospect-snapshot`, runs the one-off pulls and stores a deterministic report. Platform operators are agency users whose email is in `PLATFORM_ADMIN_EMAILS`; their tools check that list on every call.

**Tech Stack:** Next.js 16.3 App Router (server components + server actions), React 19.3, Tailwind CSS 4 + shadcn/ui (`@cs/ui`), Drizzle 0.44 / postgres.js, pg-boss 10, Better Auth 1.7.7, Zod 4, Vitest 3 + Testing Library + jsdom, Playwright Test 1.63. No new libraries.

**Spec:** [docs/superpowers/specs/2026-09-29-core-platform-design.md](../specs/2026-09-29-core-platform-design.md). Sections used:
- §3 roles (Agency Admin owns usage/limits; AMs do prospecting)
- §4.1 (competitor limit "tier limit configurable")
- §4.2 (rankings "on demand (prospecting)")
- §5.1 (Prospecting, Users/usage & limits, Playbooks)
- §7.3–7.5 (DecisionProvider review queue, cost ledger)
- §8.1–8.2 (`get_usage`†, `run_prospecting_brief`† — renamed here, see decision 13)
- §8.5 (agency-editable playbooks)
- §10.6 (usage metering and limits only)
- §11 (budgets: warn at 80 %; enforcement is Phase 7)

Obligations and previous plan:
- Owner scope: the [5b-1 plan](2026-10-05-phase-5b1-agency-workflow.md)'s "Phase 5b split" table (5b-2 row, owner decisions binding).
- Carry-over: the [roadmap](2026-09-29-roadmap.md)'s "Phase 5a carry-over", "Phase 5b-1 carry-over", "Phase 3d carry-over" (the `resolveDecisionReview` claim fix) and "Phase 4b carry-over" (the Postmark test-server ledger).
- Patterns: the 5b-1 plan, which this plan follows step for step.

---

## Phase 5 position

| Sub-phase | Delivers |
|---|---|
| 5a ✅ | App foundation, auth, delivery routes |
| 5b-1 ✅ | Portfolio, onboarding, competitors/pages, approval queue, alert review, recommendations |
| **5b-2 (this plan)** | Usage & limits; playbooks editor; platform-operator decision-review and theme-proposal queues (+ the claim fix); prospecting snapshot report; Postmark test-server ledger fix; 5a auth/audit hardening (Google refusal, hashed tokens, settings writes as audited tools, m2, m3, multi-membership switch); 5b-1 carry-over (suggestion throttle, `PinPageSwitch` → `useOptimistic`, atomic recommendation status) |
| 5c | Client workspace intelligence (unchanged from the 5a plan's overview table) |

## Global Constraints

- Node 24 locally, pnpm 10, Turborepo 2.11.5. Before changing `turbo.json`, read `node_modules/turbo/docs/README.md` (repo `AGENTS.md` rule). This plan does not change `turbo.json`.
- Before writing Next.js code, read the bundled docs in `apps/web/node_modules/next/dist/docs/` for the API you touch (`apps/web/AGENTS.md`). Next 16: `proxy.ts` not `middleware.ts`; `cookies()`, `headers()`, `params`, `searchParams` are **async**.
- Every new read or write the web app performs is a **registered tool** in `@cs/tools`: `defineTool` + its array added to `src/tools/all.ts`. Server actions call tools with `runTool`; pages read with `callTool`. Never call an engine/service mutator directly from `apps/web`.
- Tool output dates are ISO strings. Tool names match `/^[a-z][a-z0-9_]{1,63}$/`. Id inputs are `z.string().uuid()`, so a malformed id is `invalid_input`, never a raw driver error (closes 5a m2).
- Error codes:
  - a row that exists but is not the caller's → `ToolError('not_found')`;
  - the caller's own role is wrong → `permission_denied`;
  - bad input the user can fix → `invalid_input` with a human sentence.
  - Pages turn all three into **404** (spec §11). Forms show the `invalid_input` message, and "Not found" for the other two.
- Global tables (`competitor`, `competitor_source`, `decision_review`, `theme_proposal`, ledger tables) are read and written only with the **service** Db, and only after a role/scope check. Tenant tables go through `withTenant(deps.app, ctx, …)` for reads. `client` columns added in this phase (`status`, `monthly_cap_usd`, `competitor_limit`) are agency decisions written by the **service** Db only — no `app_user` column grant (like `alert_mode`).
- **No crawling of real competitors** until `https://rivalmonday.com/bot` exists: the prospect snapshot calls vendor APIs only (GBP, Google ads, Meta ads, Maps rank scan) and never enqueues `discover-pages`.
- Paid work is single-shot and deduped: new queues use `{ ...SINGLE_SHOT_QUEUE, policy: 'short' }` with a per-client `singletonKey`.
- Brand: Inter; primary `#47A8E7`, secondary `#2A6BAC`, accent `#F5A524`, ink `#0B2540`, canvas `#F6F9FC`, muted surface `#EEF2F6`.
  - Cards: `rounded-[14px] bg-surface p-6 shadow-card`.
  - Page titles: `text-[26px] font-extrabold tracking-tight`.
  - Messages: `rounded-lg bg-muted-surface p-3 text-ink` (`role="alert"` for errors).
  - Links: `font-semibold text-primary-soft-text`.
- New nav items go in `apps/web/src/components/shell/nav-items.ts` **and** the `ICONS` map in `sidebar-nav.tsx` (`satisfies Record<NavItem['icon'], unknown>`), with a case in `sidebar-nav.test.tsx`. Agency pages go in the `agency` group; operator pages go in the `account` group.
- Action-result messages live in a component that stays mounted across `revalidatePath` (HANDOVER §6; precedents `ReviewFooter`, `AlertList`). A switch backed by a server action uses `useOptimistic` + `startTransition` (`AutoSendSwitch`).
- Forms: plain `FormData` + `useActionState(action, { ok: true } as FormResult)`; native `<select>`/`<textarea>`.
- LF line endings only. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- Test runs:
  - Focused: `pnpm --filter <pkg> exec vitest run <pattern>`, in the foreground with `timeout: 600000`.
  - Never start two test runs at once (they share `cs_test`).
  - Never hand back while a test run you started is still running.
  - Before E2E, check free commit memory (HANDOVER §6, `Get-CimInstance Win32_OperatingSystem` → `FreeVirtualMemory` ≥ ~8 GB).

## Review Focus

1. **A prospect leaks into recurring, paid or client-facing work.** A client in `prospect` status, and any competitor only prospects track, must not be:
   - claimed by `claimDueSources`/`claimDuePages`;
   - rank-scanned monthly;
   - scored (so no alerts or briefs);
   - given moves, briefs or quarterly reports;
   - shown on the portfolio.
   Converting it must start all of that on the next tick. Tests: Tasks 10, 12.
2. **An operator tool called by a non-operator.** An agency admin whose email is not in `PLATFORM_ADMIN_EMAILS`, a client user and an email-link guest must all get `permission_denied` (→ 404) from every platform tool, and from a crafted form post too. Tests: Tasks 7, 8.
3. **Two operators resolve the same review, or a supersede lands mid-resolve.** Exactly one resolution wins and the other gets `invalid_input`. A review whose change was superseded or suppressed must never relink or create an event. Tests: Task 7.
4. **Limits and money input.** These must each get a clear `invalid_input` and change nothing:
   - a cap of 0, a negative cap, `NaN` or `1e9`;
   - a competitor limit of 0 or 11;
   - a client user calling `set_client_limits`, or an AM calling it.
   Lowering the competitor limit below the current count keeps existing competitors, but refuses new ones. Usage counts only the current UTC month's ledger rows for that client. Tests: Task 3.
5. **Playbook templates with bad placeholders.** These must each be refused with a message naming the problem:
   - an unknown `{{placeholder}}`;
   - a 2 001-character template;
   - an AM (not admin) editing.
   Resetting an override must restore the pack text exactly. Tests: Task 5.

---

## Decisions

1. **New registered tools** (permission in brackets; `admin` = permission `agency` plus an `agency_admin` role check in the handler; `operator` = permission `agency` plus the platform-operator check):
   - Usage: `get_usage` [agency], `set_client_limits` [admin].
   - Playbooks: `list_playbooks` [agency], `update_playbook` [admin].
   - Operator queues: `list_decision_reviews`, `resolve_decision_review`, `list_theme_proposals`, `decide_theme_proposal` [operator].
   - Prospects: `list_prospects`, `run_prospect_snapshot`, `get_prospect_report`, `convert_prospect` [agency].
   - 5a settings writes, now audited:
     - `invite_member`, `revoke_membership`, `revoke_invitation` [agency];
     - `update_agency_branding`, `add_webhook`, `set_webhook_active` [admin];
     - `add_client_recipient`, `deactivate_recipient`, `update_client_delivery` [agency];
     - `set_my_notification_pref`, `update_my_contact` [read; signed-in users only].
   - `create_client` gains `status`; `list_clients` and `list_client_competitors` gain fields (Tasks 3, 12).
2. **Platform operators** (owner decision): `PLATFORM_ADMIN_EMAILS` holds comma-separated emails, compared case-insensitively.
   - It reaches the tools as `ToolDeps.platformAdmins: readonly string[]` (lower-cased).
   - `requirePlatformOperator(ctx, deps)` refuses guests (`userId` `contact:…`), then looks up `auth."user".email` for `ctx.userId` with the service Db. If that email is missing from the list, the call gets `permission_denied`.
   - The audit row goes to the operator's current agency (registry ctx) — accepted.
   - Operator pages: `/platform/reviews` and `/platform/themes`. They appear in the sidebar's `account` group only when `NavRoleFlags.isPlatformOperator`.
3. **`resolveDecisionReview` claim fix** (roadmap 3d carry-over):
   - The review is claimed inside the transaction: `UPDATE decision_review … WHERE id = $1 AND resolved_at IS NULL RETURNING`. Zero rows → `invalid_input` "already resolved".
   - The change row is then locked with `SELECT … FOR UPDATE` and its status re-checked: superseded or suppressed → `invalid_input`, and the transaction rolls back.
   - The live event link is read inside the transaction, after the lock.
   - Every user-fixable refusal becomes `ToolError('invalid_input', <same message as before>)`.
   - New `reviewQuestions()` returns the review's open questions, so the UI can render choices.
4. **Theme proposals:** `list_theme_proposals` returns pending proposals plus those decided in the last 30 days (≤ 50), each with up to 3 sample review texts (≤ 300 characters). `decide_theme_proposal` wraps `decideThemeProposal`, whose "not awaiting a decision" error becomes `invalid_input`.
5. **Playbooks:**
   - `list_playbooks` returns every bundled vertical pack's playbooks, merged with this agency's overrides: pack title/template, effective title/template, `overridden`, `disabled`.
   - `update_playbook` is agency-admin only (spec §3: admins own agency-wide settings). Inputs: `title` (≤ 200), `template` (≤ 2 000), `disabled`.
   - Placeholders are restricted to `PLAYBOOK_VARS` (`competitor`, `service`, `new_price`, `areas`, `theme`). An unknown placeholder is `invalid_input`.
   - Blank `title`/`template` fall back to the pack. "Reset" = both null and not disabled.
6. **Usage & limits:**
   - New `client` columns (service-role writes only):
     - `monthly_cap_usd double precision NOT NULL DEFAULT 15`, CHECK `> 0 AND <= 10000`;
     - `competitor_limit integer NOT NULL DEFAULT 5`, CHECK `BETWEEN 1 AND 10`.
   - **Spend** = `sum(cost_usd)` of `llm_call` + `vendor_call` rows with that `client_id` and `created_at ≥` the first instant of the current **UTC** month. **Level:**
     - `over` ≥ 100 % of cap;
     - `warning` ≥ 80 % (`SPEND_WARNING_RATIO`);
     - else `ok`.
   - Agency-level spend (`agency_id` set, `client_id` NULL) is shown separately, only to scope-`all` users.
   - Shared collection (`agency_id` NULL — competitor GBP/reviews/ads, engine stages) is **not attributed** to clients in 5b-2. The page says so; allocation is Phase 7, together with enforcement.
   - `set_client_limits` takes `monthlyCapUsd` (1–10 000, rounded to cents) and `competitorLimit` (1–10).
   - Lowering the limit below the current count keeps existing competitors. `assertRoomForCompetitor` reads `client.competitor_limit` in the caller's transaction, so new ones are refused.
   - Question quota is a placeholder (`questions: { used: null, quota: null }`, "Ask arrives in Phase 6").
   - The portfolio row gains `spend` so a warning shows there too.
7. **Postmark test server:** `POSTMARK_TEST_SERVER=true` (or the Postmark sandbox token `POSTMARK_API_TEST`) makes the transport ledger each accepted send at `costUsd: 0` with operation `email_test`. `.env` here gets `POSTMARK_TEST_SERVER=true` (owner action, §4 of the HANDOVER).
8. **Prospect status:** `client.status text NOT NULL DEFAULT 'active'`, CHECK `IN ('active','prospect')`.
   - `create_client` takes `status` (default `active`) and keeps the decision-3 rule from 5b-1: creating needs scope `all`.
   - `list_clients` returns `status`. The sidebar client panel works for prospects, so their competitor pages reuse the 5b-1 screens.
9. **No recurring work for prospects.** These filter on `status = 'active'`:
   - `claimDueSources` (both the tracked branch and the self-business branch) and `claimDuePages`;
   - `ensureSelfCompetitors` and `listRankClients`;
   - the engine score sweep and `scoreEvent` — no `event_score`, so no alerts and no brief content;
   - `listMoveClients`, `listBriefDueClients`, `runQuarterlyReports` and `get_portfolio`.
   Competitor sources created when a prospect accepts a suggestion stay due-now, unclaimed, until an active client tracks that competitor.
10. **Prospect snapshot** (owner decision): `run_prospect_snapshot` needs:
    - ≥ 1 tracked competitor;
    - ≥ 1 keyword and a service area;
    - no non-stale `running` report.
    It inserts a `prospect_report` (`running`) with the service Db and enqueues `prospect-snapshot` `{ clientId, reportId }` (`singletonKey` `prospect:<clientId>`). The worker then:
    - links the prospect's own business when it has a place id (`ensureSelfCompetitor`);
    - runs `gbp`, `ads_google` and `ads_meta` once per tracked competitor, and `gbp` for the self business, through the existing `runSource`;
    - runs `scanRankings` with `gridSize: 3, maxKeywords: 3`;
    - builds the report from stored data with `buildProspectReport` — deterministic, no model text;
    - marks the row `ready`, or `failed` with a short error.
    - A `running` row older than 3 hours reads as failed ("timed out").
    Estimated cost ≈ $0.10–0.15 per snapshot, including the ≈ $0.04 competitor search.
11. **Report contents**, per business (the prospect first, then competitors by name):
    - GBP rating, review count, primary category and the number of extra categories (latest `gbp_profile` observation);
    - active Google ads and active Meta ads — `null` = not checked, i.e. the source was skipped for lack of a domain or Meta page;
    - per keyword: points found (of 9), points in the top 3, and average rank where found.
    `notes` lists every source that errored. Matching in rank results is by place id, then cid.
12. **Converting a prospect:** `convert_prospect` sets `status = 'active'` (service Db, `WHERE status = 'prospect'`) and bumps that client's `client_competitor.created_at` to now. The bump makes the score sweep's late-link lookback offer the last 90 days of events other clients already gathered. Collection starts on the next `vendor-schedule` tick; the first brief comes on the next Thursday-night window.
13. **Naming:** spec §8.2's `run_prospecting_brief` becomes `run_prospect_snapshot` — the owner chose a deterministic snapshot report, not a model-written brief.
14. **Auth hardening:**
    - `databaseHooks.session.create.before` refuses (`false`) a session for a user without `hasSignInRight`. This covers Google users whose memberships were all removed.
    - `magicLink({ storeToken: 'hashed' })`.
    - `acceptInvitations` no longer rewrites the linked contact's `role`/`clientScope` when the existing membership at that scope is an `agency_admin` (m3).
15. **Settings writes become tools (m2, m4).** The wrappers live in `src/tools/settings.ts` and call the existing service functions unchanged, so the registry audit-logs every mutation. Web actions switch to `runTool`. Reads (`listTeam`, `getAgencyBranding`, `listWebhooks`, `listClientRecipients`, `myNotificationSettings`) stay service functions — 5a decision, not a mutation.
16. **Multi-membership switch:** `resolveViewer` takes a `clientHint` (the `/c/<uuid>` of the request path). When the cookie's membership doesn't cover that client but another of the user's memberships does, that membership is used for this request (the cookie is unchanged). "Covers" means:
    - an agency membership of the client's agency with scope `all`, or with the client in scope; or
    - a client membership for that exact client.
17. **5b-1 carry-over:**
    - `request_competitor_suggestions` refuses (`invalid_input`) while the newest search is queued or running, or finished less than 10 minutes ago. This applies only when `deps.jobStatus` is configured.
    - `PinPageSwitch` moves to the `useOptimistic`/`startTransition` pattern.
    - `updateRecommendationStatus` reads, updates and writes feedback inside one transaction, with the row locked `FOR UPDATE`.
18. **Not in 5b-2:**
    - enforcing caps (pausing Ask/jobs at 100 %) and allocating shared collection cost — Phase 7;
    - deleting or archiving a prospect;
    - per-agency default caps or limits;
    - the Ask question quota itself — Phase 6;
    - acting on a removed competitor's pending alerts/brief items (5b-1 Minor 5);
    - the trend-table "— → —" wording (owner undecided).

## File structure

```
packages/db/
  src/schema/tenancy.ts                 client.status, monthly_cap_usd, competitor_limit                 (Task 1)
  src/schema/client-intel.ts            prospect_report + ProspectReportData                              (Task 1)
  migrations/0036_agency_ops.sql        generated                                                        (Task 1)
  migrations/0037_agency_ops_rls.sql    custom: RLS + revokes for prospect_report                        (Task 1)
  src/agency-ops.test.ts                                                                                  (Task 1)

packages/email/src/transport.ts         testServer flag, POSTMARK_TEST_SERVER                            (Task 2)

packages/tools/
  src/usage.ts                          monthStart, spendLevel, spendByClient, agencyLevelSpend          (Task 3)
  src/limits.ts                         DEFAULT_COMPETITOR_LIMIT, DEFAULT_MONTHLY_CAP_USD, ratios          (Task 3)
  src/tools/usage.ts                    get_usage, set_client_limits                                      (Task 3)
  src/tools/playbooks.ts                list_playbooks, update_playbook                                   (Task 5)
  src/platform.ts                       normalizeAdminEmails, requirePlatformOperator                    (Task 7)
  src/tools/model-ops.ts                list_decision_reviews, resolve_decision_review                    (Task 7)
  src/tools/themes.ts                   list_theme_proposals, decide_theme_proposal                       (Task 8)
  src/tools/prospects.ts                list_prospects, run_prospect_snapshot, get_prospect_report, convert_prospect (Task 12)
  src/tools/settings.ts                 the 11 settings write tools                                       (Task 15)
  src/deps.ts                           platformAdmins; QueueJob + 'prospect-snapshot'                    (Tasks 7, 12)

packages/engine/src/briefs/playbooks.ts       PLAYBOOK_VARS, unknownPlaybookVars                          (Task 5)
packages/engine/src/model-ops/resolve.ts      reviewContext, reviewQuestions, claim fix, ToolErrors        (Task 7)
packages/engine/src/briefs/recommendations.ts atomic updateRecommendationStatus                           (Task 17)
packages/engine/src/{sweep.ts, score/score-stage.ts, moves/moves-stage.ts, briefs/generate.ts, reports/quarterly.ts}  active-only (Task 10)
packages/collectors/src/{sources/due.ts, schedule/due-pages.ts, local/self.ts}  active-only             (Task 10)
packages/collectors/src/prospect/report.ts    summarizeRanks, buildProspectReport (pure)                 (Task 11)
packages/collectors/src/prospect/snapshot.ts  runProspectSnapshot, failProspectReport                    (Task 11)
apps/worker/src/{deps.ts, jobs/prospects.ts, main.ts}  prospect-snapshot job                             (Tasks 10, 11)

apps/web/src/server/env.ts                    platformAdmins                                              (Task 7)
apps/web/src/server/viewer.ts                 clientHint                                                  (Task 16)
apps/web/src/server/auth-options.ts           session.create.before, storeToken hashed                    (Task 14)
apps/web/src/components/shell/nav-items.ts    new items + isPlatformOperator                              (Tasks 4, 6, 9, 13)
apps/web/src/app/(app)/agency/usage/          usage & limits                                              (Task 4)
apps/web/src/app/(app)/agency/playbooks/      playbooks editor                                            (Task 6)
apps/web/src/app/(app)/platform/{reviews,themes}/  operator queues                                        (Task 9)
apps/web/src/app/(app)/agency/prospects/      list, new, [clientId] hub + report                          (Task 13)
apps/web/src/app/(app)/{agency/team,agency/branding,agency/webhooks,c/[clientId]/settings/delivery,settings/notifications}/actions.ts  runTool (Task 15)
apps/web/e2e/{seed.ts,workflow.spec.ts}       5b-2 E2E                                                    (Task 18)
```

---

### Task 1: Migration — client status, caps, competitor limit, `prospect_report`

**Files:**
- Modify: `packages/db/src/schema/tenancy.ts`, `packages/db/src/schema/client-intel.ts`, `packages/db/src/index.ts` (only if `client-intel` types aren't already re-exported — check with `grep -n client-intel packages/db/src/schema/index.ts`)
- Create: `packages/db/migrations/0036_agency_ops.sql` (generated), `packages/db/migrations/0037_agency_ops_rls.sql` (custom), `packages/db/src/agency-ops.test.ts`
- Modify: `packages/db/src/evidence.test.ts` (privilege allow-list comment only — `prospect_report` must not appear in the allow-list)

**Interfaces:**
- Produces:
  - `client.status: 'active' | 'prospect'` (`text`, typed `$type<ClientStatus>()`), `export type ClientStatus = 'active' | 'prospect'`, `export const CLIENT_STATUSES = ['active', 'prospect'] as const`
  - `client.monthlyCapUsd: number` (`double precision`), `client.competitorLimit: number` (`integer`)
  - `prospectReport` table: `{ id, agencyId, clientId, status: 'running' | 'ready' | 'failed', data: ProspectReportData | null, error: string | null, createdAt, finishedAt }`
  - `export interface ProspectRank { keyword: string; found: number; top3: number; averageRank: number | null }`
  - `export interface ProspectBusiness { competitorId: string; name: string; self: boolean; gbp: { rating: number | null; reviews: number | null; category: string | null; extraCategories: number } | null; ads: { google: number | null; meta: number | null }; ranks: ProspectRank[] }`
  - `export interface ProspectReportData { generatedAt: string; keywords: string[]; points: number; scanId: string | null; businesses: ProspectBusiness[]; notes: string[] }`

- [ ] **Step 1: Write the failing test**

`packages/db/src/agency-ops.test.ts`:

```ts
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { client, prospectReport, withTenant } from './index';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('client operations columns (5b-2 decisions 6, 8)', () => {
  it('defaults new clients to active, a $15 cap and 5 competitors', async () => {
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ status: 'active', monthlyCapUsd: 15, competitorLimit: 5 });
  });

  it('rejects unknown statuses and out-of-range caps and limits', async () => {
    const set = (v: Partial<typeof client.$inferInsert>) => errorText(dbs.owner.update(client).set(v).where(eq(client.id, IDS.clientA1)));
    expect(await set({ status: 'lost' as never })).toMatch(/client_status_check/);
    expect(await set({ monthlyCapUsd: 0 })).toMatch(/client_monthly_cap_check/);
    expect(await set({ monthlyCapUsd: 10001 })).toMatch(/client_monthly_cap_check/);
    expect(await set({ competitorLimit: 0 })).toMatch(/client_competitor_limit_check/);
    expect(await set({ competitorLimit: 11 })).toMatch(/client_competitor_limit_check/);
  });

  it('app_user cannot change status, cap or limit', async () => {
    for (const v of [{ status: 'prospect' as const }, { monthlyCapUsd: 99 }, { competitorLimit: 9 }]) {
      const err = await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.update(client).set(v).where(eq(client.id, IDS.clientA1))));
      expect(err).toMatch(/permission denied/);
    }
  });
});

describe('prospect_report', () => {
  it('is readable through RLS by the owning agency only and writable only by the service role', async () => {
    const [r] = await dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'running' }).returning();
    const asA = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(prospectReport));
    expect(asA.map((x) => x.id)).toEqual([r!.id]);
    const asB = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(prospectReport));
    expect(asB).toEqual([]);
    const err = await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'running' })));
    expect(err).toMatch(/permission denied/);
  });

  it('checks status and ties client to agency', async () => {
    expect(await errorText(dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done' as never }))).toMatch(/prospect_report_status_check/);
    expect(await errorText(dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyB, clientId: IDS.clientA1, status: 'running' }))).toMatch(/foreign key/);
  });

  it('has forced RLS', async () => {
    const [row] = (await dbs.owner.execute(sql`SELECT relrowsecurity AS rls, relforcerowsecurity AS force FROM pg_class WHERE relname = 'prospect_report'`)) as unknown as { rls: boolean; force: boolean }[];
    expect(row).toEqual({ rls: true, force: true });
  });
});
```

Check the import path of `errorText`/`openTestDbs` against an existing test in `packages/db/src` (e.g. `delivery.test.ts`) and copy it exactly. Likewise copy the `withTenant` context shape from `tenant.test.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cs/db exec vitest run src/agency-ops.test.ts` → FAIL (`prospectReport` not exported / columns missing).

- [ ] **Step 3: Implement the schema**

`packages/db/src/schema/tenancy.ts` — add above `client`:

```ts
export const CLIENT_STATUSES = ['active', 'prospect'] as const;
/** 5b-2 decision 8: a prospect is a client being pitched — it gets one snapshot and no recurring work until converted. */
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
```

Inside `client`'s columns (after `briefAutoSend`), add:

```ts
    /** 5b-2 decision 8 (service role only). */
    status: text('status').$type<ClientStatus>().notNull().default('active'),
    /** 5b-2 decision 6: monthly AI + vendor spend cap in USD (warning at 80 %; enforcement is Phase 7). Service role only. */
    monthlyCapUsd: doublePrecision('monthly_cap_usd').notNull().default(15),
    /** 5b-2 decision 6: how many competitors this client may track (spec §4.1 "tier limit configurable"). Service role only. */
    competitorLimit: integer('competitor_limit').notNull().default(5),
```

Add `doublePrecision, integer` to the `drizzle-orm/pg-core` import. Add to the `client` table's constraint list:

```ts
    check('client_status_check', sql`status IN ('active', 'prospect')`),
    check('client_monthly_cap_check', sql`monthly_cap_usd > 0 AND monthly_cap_usd <= 10000`),
    check('client_competitor_limit_check', sql`competitor_limit BETWEEN 1 AND 10`),
```

`packages/db/src/schema/client-intel.ts` — add the report types and table. It uses the same `tenant`/`clientFk` helpers this file already uses for `rank_scan`. Read the top of the file first: if `rank_scan` declares `agencyId`/`clientId` inline, copy that form, including its composite FK:

```ts
export interface ProspectRank { keyword: string; found: number; top3: number; averageRank: number | null }
export interface ProspectBusiness {
  competitorId: string;
  name: string;
  self: boolean;
  gbp: { rating: number | null; reviews: number | null; category: string | null; extraCategories: number } | null;
  /** null = not checked (no domain / no Meta page to look up). */
  ads: { google: number | null; meta: number | null };
  ranks: ProspectRank[];
}
/** 5b-2 decision 11: deterministic landscape report — no model text. */
export interface ProspectReportData {
  generatedAt: string;
  keywords: string[];
  /** Grid points per keyword (9 for the 3×3 scan). */
  points: number;
  scanId: string | null;
  businesses: ProspectBusiness[];
  notes: string[];
}

export const prospectReport = pgTable(
  'prospect_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    status: text('status').$type<'running' | 'ready' | 'failed'>().notNull(),
    data: jsonb('data').$type<ProspectReportData | null>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('prospect_report_status_check', sql`status IN ('running', 'ready', 'failed')`),
    index('prospect_report_client_idx').on(t.clientId, t.createdAt),
  ],
);
```

Import any of `agency`, `client`, `foreignKey`, `check`, `index`, `jsonb`, `timestamp`, `sql` this file doesn't already import. Make sure `prospectReport` and the types are exported from the `@cs/db` barrel (`src/schema/index.ts` re-exports `client-intel` — verify).

- [ ] **Step 4: Generate the migrations**

Run: `pnpm --filter @cs/db generate --name=agency_ops`. This creates `0036_agency_ops.sql`. Open it and check it contains:
- the three `ALTER TABLE "client" ADD COLUMN` statements with defaults;
- the three `client` CHECKs;
- `CREATE TABLE "prospect_report"` with its FK, CHECK and index.

Reorder by hand if the composite FK precedes anything it needs (HANDOVER §6).

Run: `pnpm --filter @cs/db generate --custom --name=agency_ops_rls`, and fill `0037_agency_ops_rls.sql` with:

```sql
-- 5b-2: prospect reports are written by the worker/service role only; tenants read their own through RLS (same as trend_report, 0032).
REVOKE INSERT, UPDATE, DELETE ON prospect_report FROM app_user;
--> statement-breakpoint
ALTER TABLE prospect_report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prospect_report FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY prospect_report_select ON prospect_report FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
GRANT SELECT ON prospect_report TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON prospect_report TO app_service;
```

Before writing the last two lines, check how `0032_delivery_rls.sql`/`0029_briefs_rls.sql` grant `SELECT` to `app_user` and DML to `app_service`. If default privileges already cover new tables (look for `ALTER DEFAULT PRIVILEGES` in an early migration), drop the explicit GRANTs and mirror exactly what `trend_report` received. The new `client` columns need **no** grant: `app_user`'s client UPDATE is column-level (0026/0029) and must not include them.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @cs/db exec vitest run src/agency-ops.test.ts src/evidence.test.ts src/tenant.test.ts` → PASS. The privilege allow-list in `evidence.test.ts` must still pass unchanged (`prospect_report` has no write privilege for `app_user`). Extend that test's comment list of revoked tables with `prospect_report`. Also run `pnpm --filter @cs/db typecheck`.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): client status, monthly cap and competitor limit; prospect_report table (5b-2)"
```

---

### Task 2: Postmark test-server sends cost nothing in the ledger

**Files:**
- Modify: `packages/email/src/transport.ts`, `packages/email/src/transport.test.ts`

**Interfaces:**
- Produces: `createPostmarkTransport(opts: { token; ledger; fetch?; messageStream?; testServer?: boolean })`; `isPostmarkTestServer(env: NodeJS.ProcessEnv): boolean`; `POSTMARK_SANDBOX_TOKEN = 'POSTMARK_API_TEST'`.

- [ ] **Step 1: Write the failing tests** (append to `transport.test.ts`; reuse its existing fake-fetch helper — read the file first and use the same names)

```ts
describe('Postmark test server (5b-2 decision 7)', () => {
  it('ledgers an accepted test-server send at $0 under email_test', async () => {
    const rows: VendorCallRecord[] = [];
    const ledger = { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => void rows.push(r) };
    const fetch = async () => new Response(JSON.stringify({ ErrorCode: 0, MessageID: 'm1' }), { status: 200 });
    const t = createPostmarkTransport({ token: 'x', ledger, fetch: fetch as typeof globalThis.fetch, testServer: true });
    await t.send(msg, { agencyId: null, clientId: null });
    expect(rows[0]).toMatchObject({ vendor: 'postmark', operation: 'email_test', costUsd: 0, ok: true });
  });

  it('detects a test server from POSTMARK_TEST_SERVER or the sandbox token', () => {
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'live' })).toBe(false);
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'live', POSTMARK_TEST_SERVER: 'true' })).toBe(true);
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'POSTMARK_API_TEST' })).toBe(true);
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'live', POSTMARK_TEST_SERVER: 'yes' })).toBe(false);
  });
});
```

(`msg` = the `OutgoingEmail` fixture the file already uses; import `VendorCallRecord` from `@cs/core`, `isPostmarkTestServer` from `./transport`.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/email exec vitest run src/transport.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `transport.ts`:

```ts
/** Postmark's documented sandbox token: accepted, never delivered. */
export const POSTMARK_SANDBOX_TOKEN = 'POSTMARK_API_TEST';

/** 5b-2 decision 7: a test/sandbox server accepts and logs messages but never delivers them — they must not count as spend. */
export function isPostmarkTestServer(env: NodeJS.ProcessEnv): boolean {
  return env.POSTMARK_TEST_SERVER?.trim() === 'true' || env.POSTMARK_SERVER_TOKEN?.trim() === POSTMARK_SANDBOX_TOKEN;
}
```

`createPostmarkTransport` gains `testServer?: boolean` in its options. The ledger line becomes:

```ts
        await opts.ledger.recordVendorCall({
          ...scope, vendor: 'postmark', operation: opts.testServer ? 'email_test' : 'email', units: 1,
          costUsd: ok ? (opts.testServer ? 0 : POSTMARK_USD_PER_EMAIL) : null, latencyMs: Date.now() - started, ok,
        });
```

`createEmailTransportFromEnv` passes `testServer: isPostmarkTestServer(env)`.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS; `pnpm --filter @cs/email typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add packages/email
git commit -m "fix(email): Postmark test-server sends ledger at \$0 (POSTMARK_TEST_SERVER)"
```

---

### Task 3: Usage & limits tools, configurable competitor limit

**Files:**
- Create: `packages/tools/src/usage.ts`, `packages/tools/src/usage.test.ts`, `packages/tools/src/tools/usage.ts`, `packages/tools/src/tools/usage.test.ts`
- Modify: `packages/tools/src/limits.ts`, `packages/tools/src/index.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/competitors.ts`, `packages/tools/src/tools/competitors.test.ts`, `packages/tools/src/tools/portfolio.ts`, `packages/tools/src/tools/portfolio.test.ts`, `packages/tools/src/tools/clients.ts`

**Interfaces:**
- Consumes: `client.monthlyCapUsd`, `client.competitorLimit`, `client.status` (Task 1); `llmCall`, `vendorCall` (`@cs/db`).
- Produces:
  - `limits.ts`: `DEFAULT_COMPETITOR_LIMIT = 5`, `MAX_COMPETITOR_LIMIT = 10`, `DEFAULT_MONTHLY_CAP_USD = 15`, `MAX_MONTHLY_CAP_USD = 10000`, `SPEND_WARNING_RATIO = 0.8`, `MAX_ACTIVE_PAGES` (unchanged). `COMPETITOR_LIMIT` is **removed**.
  - `usage.ts`: `type SpendLevel = 'ok' | 'warning' | 'over'`; `monthStart(now: Date): Date`; `spendLevel(spent: number, cap: number): SpendLevel`; `spendByClient(db: Db | Tx, clientIds: string[], since: Date): Promise<Map<string, number>>`; `agencyLevelSpend(db: Db, agencyId: string, since: Date): Promise<number>`
  - schemas: `SpendView = { monthToDateUsd: number; capUsd: number; ratio: number; level: SpendLevel }`, `UsageRow = { clientId, name, status, spend: SpendView, competitorLimit: number, competitors: number, questions: { used: null; quota: null } }`; `PortfolioRow` gains `spend: SpendView`; `ClientSummary` gains `status: 'active' | 'prospect'`.
  - tools: `get_usage` → `{ month: string /* YYYY-MM */, items: UsageRow[], agencyLevelUsd: number | null }`; `set_client_limits({ clientId, monthlyCapUsd?, competitorLimit? })` → `{ clientId, monthlyCapUsd, competitorLimit }`; `list_client_competitors` output gains `limit: number`.

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/usage.test.ts`:

```ts
import { llmCall, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agencyLevelSpend, monthStart, spendByClient, spendLevel } from './usage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('usage math', () => {
  it('starts the month at 00:00 UTC on the 1st', () => {
    expect(monthStart(new Date('2026-10-07T15:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(monthStart(new Date('2026-01-01T00:00:00Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('warns at 80 % and is over at 100 %', () => {
    expect(spendLevel(11.99, 15)).toBe('ok');
    expect(spendLevel(12, 15)).toBe('warning');
    expect(spendLevel(15, 15)).toBe('over');
  });
});

describe('spend from the ledger (decision 6)', () => {
  it('sums this month’s llm and vendor rows per client; ignores last month, other clients and platform rows', async () => {
    const llm = (clientId: string | null, costUsd: number | null, createdAt: Date, agencyId: string | null = IDS.agencyA) =>
      ({ agencyId, clientId, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true, createdAt });
    const vendor = (clientId: string | null, costUsd: number | null, createdAt: Date, agencyId: string | null = IDS.agencyA) =>
      ({ agencyId, clientId, vendor: 'dataforseo', operation: 'x', units: 1, costUsd, latencyMs: 1, ok: true, createdAt });
    const now = new Date('2026-10-07T12:00:00Z');
    await dbs.owner.insert(llmCall).values([llm(IDS.clientA1, 1.25, now), llm(IDS.clientA1, 9, new Date('2026-09-30T23:59:59Z')), llm(IDS.clientA1, null, now), llm(null, 2, now), llm(null, 5, now, null)]);
    await dbs.owner.insert(vendorCall).values([vendor(IDS.clientA1, 0.5, now), vendor(IDS.clientA2, 3, now)]);
    const m = await spendByClient(dbs.service, [IDS.clientA1, IDS.clientA2, IDS.clientB1], monthStart(now));
    expect(m.get(IDS.clientA1)).toBeCloseTo(1.75);
    expect(m.get(IDS.clientA2)).toBeCloseTo(3);
    expect(m.get(IDS.clientB1) ?? 0).toBe(0);
    expect(await agencyLevelSpend(dbs.service, IDS.agencyA, monthStart(now))).toBeCloseTo(2);
  });
});
```

`packages/tools/src/tools/usage.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { client, clientCompetitor, competitor, llmCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const am = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

type Usage = { month: string; items: { clientId: string; spend: { monthToDateUsd: number; capUsd: number; level: string }; competitorLimit: number; competitors: number; questions: { used: null; quota: null } }[]; agencyLevelUsd: number | null };

describe('get_usage', () => {
  it('shows spend vs cap per client in scope; agency-level spend only for scope all', async () => {
    await dbs.owner.update(client).set({ monthlyCapUsd: 10 }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 8.5, latencyMs: 1, ok: true });
    const all = (await registry.invoke(admin, 'get_usage', {})) as Usage;
    const a1 = all.items.find((i) => i.clientId === IDS.clientA1)!;
    expect(a1.spend).toMatchObject({ monthToDateUsd: 8.5, capUsd: 10, level: 'warning' });
    expect(a1).toMatchObject({ competitorLimit: 5, competitors: 1, questions: { used: null, quota: null } });
    expect(all.items.map((i) => i.clientId).sort()).toEqual([IDS.clientA1, IDS.clientA2].sort());
    expect(all.agencyLevelUsd).toBe(0);
    const scoped = (await registry.invoke(am, 'get_usage', {})) as Usage;
    expect(scoped.items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
    expect(scoped.agencyLevelUsd).toBeNull();
    await expect(registry.invoke(owner, 'get_usage', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('set_client_limits (Review Focus 4)', () => {
  it('lets admins set a cap (rounded to cents) and a competitor limit', async () => {
    const r = await registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, monthlyCapUsd: 22.499, competitorLimit: 8 });
    expect(r).toEqual({ clientId: IDS.clientA1, monthlyCapUsd: 22.5, competitorLimit: 8 });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ monthlyCapUsd: 22.5, competitorLimit: 8 });
  });

  it('refuses bad numbers, AMs, client roles and other agencies’ clients, changing nothing', async () => {
    for (const bad of [{ monthlyCapUsd: 0 }, { monthlyCapUsd: -5 }, { monthlyCapUsd: 1e9 }, { monthlyCapUsd: Number.NaN }, { competitorLimit: 0 }, { competitorLimit: 11 }, { competitorLimit: 2.5 }, {}]) {
      await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, ...bad })).rejects.toMatchObject({ code: 'invalid_input' });
    }
    await expect(registry.invoke(am, 'set_client_limits', { clientId: IDS.clientA1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'set_client_limits', { clientId: IDS.clientA1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientB1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'not_found' });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ monthlyCapUsd: 15, competitorLimit: 5 });
  });
});

describe('configurable competitor limit (decision 6)', () => {
  it('refuses a new competitor at the client’s own limit, keeps existing ones when lowered', async () => {
    await dbs.owner.update(client).set({ competitorLimit: 1 }).where(eq(client.id, IDS.clientA1));
    await expect(registry.invoke(admin, 'add_competitor', { clientId: IDS.clientA1, name: 'Other HVAC', domain: 'otherhvac.example' })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/at most 1 competitor/) });
    const [extra] = await dbs.owner.insert(competitor).values({ name: 'Third', domain: 'third.example' }).returning();
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: extra!.id });
    const list = (await registry.invoke(admin, 'list_client_competitors', { clientId: IDS.clientA1 })) as { items: unknown[]; limit: number };
    expect(list).toMatchObject({ limit: 1 });
    expect(list.items).toHaveLength(2);
  });
});
```

Add to `portfolio.test.ts` (inside its existing `describe`, reusing its registry and admin ctx; add `llmCall` to its `@cs/db` import):

```ts
it('includes month-to-date spend against the cap', async () => {
  await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 16, latencyMs: 1, ok: true });
  const { items } = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string; spend: { level: string; monthToDateUsd: number } }[] };
  expect(items.find((i) => i.clientId === IDS.clientA1)!.spend).toMatchObject({ level: 'over', monthToDateUsd: 16 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cs/tools exec vitest run src/usage.test.ts src/tools/usage.test.ts src/tools/portfolio.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`packages/tools/src/limits.ts` (replace):

```ts
/** Decision 6 (5b-2): defaults for the per-client columns `client.competitor_limit` / `client.monthly_cap_usd` (spec §4.1, §11). */
export const DEFAULT_COMPETITOR_LIMIT = 5;
export const MAX_COMPETITOR_LIMIT = 10;
export const DEFAULT_MONTHLY_CAP_USD = 15;
export const MAX_MONTHLY_CAP_USD = 10000;
/** Spec §11: warn at 80 % of the monthly cap (enforcement is Phase 7). */
export const SPEND_WARNING_RATIO = 0.8;
/** Spec §4.1: cap ≈ 25 tracked pages per competitor. */
export const MAX_ACTIVE_PAGES = 25;
```

`packages/tools/src/usage.ts`:

```ts
import { type Db, llmCall, type Tx, vendorCall } from '@cs/db';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { SPEND_WARNING_RATIO } from './limits';

export type SpendLevel = 'ok' | 'warning' | 'over';

/** Decision 6: usage months are calendar months in UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function spendLevel(spent: number, cap: number): SpendLevel {
  if (spent >= cap) return 'over';
  return spent >= cap * SPEND_WARNING_RATIO ? 'warning' : 'ok';
}

/** Sum of this period's attributed llm_call + vendor_call cost per client (rows with a null cost count as 0). */
export async function spendByClient(db: Db | Tx, clientIds: string[], since: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (clientIds.length === 0) return out;
  for (const table of [llmCall, vendorCall]) {
    const rows = await db
      .select({ id: table.clientId, usd: sql<number>`coalesce(sum(${table.costUsd}), 0)::float8` })
      .from(table)
      .where(and(inArray(table.clientId, clientIds), gte(table.createdAt, since)))
      .groupBy(table.clientId);
    for (const r of rows) if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + Number(r.usd));
  }
  return out;
}

/** Calls attributed to the agency but no client (e.g. agency notices); platform-level rows (agency_id NULL) are not included. */
export async function agencyLevelSpend(db: Db, agencyId: string, since: Date): Promise<number> {
  let total = 0;
  for (const table of [llmCall, vendorCall]) {
    const [r] = await db
      .select({ usd: sql<number>`coalesce(sum(${table.costUsd}), 0)::float8` })
      .from(table)
      .where(and(eq(table.agencyId, agencyId), isNull(table.clientId), gte(table.createdAt, since)));
    total += Number(r?.usd ?? 0);
  }
  return total;
}
```

If TypeScript rejects iterating `[llmCall, vendorCall]` as a union in `.from(table)`, split it into two explicit queries (same SQL) rather than casting.

`packages/tools/src/tools/schemas.ts` — add:

```ts
export const SpendView = z.object({ monthToDateUsd: z.number(), capUsd: z.number(), ratio: z.number(), level: z.enum(['ok', 'warning', 'over']) });
export type SpendView = z.infer<typeof SpendView>;

export const UsageRow = z.object({
  clientId: uuid, name: z.string(), status: z.enum(['active', 'prospect']), spend: SpendView, competitorLimit: z.number().int(), competitors: z.number().int(),
  /** Decision 6: Ask arrives in Phase 6 — always null for now. */
  questions: z.object({ used: z.null(), quota: z.null() }),
});
export type UsageRow = z.infer<typeof UsageRow>;
```

Then:
- Extend `ClientSummary` with `status: z.enum(['active', 'prospect'])`.
- Extend `PortfolioRow` with `spend: SpendView`. Declare `SpendView` above `PortfolioRow`.

`packages/tools/src/tools/usage.ts`:

```ts
import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { client, clientCompetitor, withTenant } from '@cs/db';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { MAX_COMPETITOR_LIMIT, MAX_MONTHLY_CAP_USD } from '../limits';
import { agencyLevelSpend, monthStart, spendByClient, spendLevel } from '../usage';
import { UsageRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const round2 = (n: number) => Math.round(n * 100) / 100;

export const spendView = (spent: number, cap: number) => ({ monthToDateUsd: round2(spent), capUsd: cap, ratio: cap > 0 ? spent / cap : 0, level: spendLevel(spent, cap) });

export const getUsage = defineTool({
  name: 'get_usage',
  description: 'This month’s AI and data spend per client against its monthly cap, plus competitor limits.',
  input: z.object({}),
  output: z.object({ month: z.string(), items: z.array(UsageRow), agencyLevelUsd: z.number().nullable() }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const now = new Date();
    const since = monthStart(now);
    const clients = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: client.id, name: client.name, status: client.status, cap: client.monthlyCapUsd, limit: client.competitorLimit }).from(client).orderBy(asc(client.name)));
    const ids = clients.map((c) => c.id);
    const [spend, links] = await Promise.all([
      spendByClient(deps.service, ids, since),
      ids.length ? withTenant(deps.app, ctx, (tx) => tx.select({ id: clientCompetitor.clientId, n: count() }).from(clientCompetitor).where(inArray(clientCompetitor.clientId, ids)).groupBy(clientCompetitor.clientId)) : [],
    ]);
    const competitors = new Map(links.map((l) => [l.id, l.n]));
    return {
      month: since.toISOString().slice(0, 7),
      items: clients.map((c) => ({
        clientId: c.id, name: c.name, status: c.status, spend: spendView(spend.get(c.id) ?? 0, c.cap), competitorLimit: c.limit, competitors: competitors.get(c.id) ?? 0,
        questions: { used: null, quota: null },
      })),
      agencyLevelUsd: ctx.clientScope === 'all' ? round2(await agencyLevelSpend(deps.service, ctx.agencyId, since)) : null,
    };
  },
});

export const setClientLimits = defineTool({
  name: 'set_client_limits',
  description: 'Set a client’s monthly spend cap (USD) and how many competitors it may track (agency admins).',
  input: z.object({ clientId: uuid, monthlyCapUsd: z.number().optional(), competitorLimit: z.number().optional() }),
  output: z.object({ clientId: uuid, monthlyCapUsd: z.number(), competitorLimit: z.number().int() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins change limits');
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const patch: { monthlyCapUsd?: number; competitorLimit?: number } = {};
    if (input.monthlyCapUsd !== undefined) {
      const cap = round2(input.monthlyCapUsd);
      if (!Number.isFinite(cap) || cap < 1 || cap > MAX_MONTHLY_CAP_USD) throw new ToolError('invalid_input', `The monthly cap must be between $1 and $${MAX_MONTHLY_CAP_USD}`);
      patch.monthlyCapUsd = cap;
    }
    if (input.competitorLimit !== undefined) {
      if (!Number.isInteger(input.competitorLimit) || input.competitorLimit < 1 || input.competitorLimit > MAX_COMPETITOR_LIMIT) {
        throw new ToolError('invalid_input', `The competitor limit must be a whole number from 1 to ${MAX_COMPETITOR_LIMIT}`);
      }
      patch.competitorLimit = input.competitorLimit;
    }
    if (Object.keys(patch).length === 0) throw new ToolError('invalid_input', 'Nothing to change');
    const [row] = await deps.service
      .update(client)
      .set(patch)
      .where(and(eq(client.id, input.clientId), eq(client.agencyId, ctx.agencyId)))
      .returning({ clientId: client.id, monthlyCapUsd: client.monthlyCapUsd, competitorLimit: client.competitorLimit });
    if (!row) throw new ToolError('not_found', 'Client not found');
    return row;
  },
});

export const usageTools = [getUsage, setClientLimits];
```

`competitors.ts`:
- Remove the `COMPETITOR_LIMIT` import.
- Replace `assertRoomForCompetitor` with the version below.
- In `listClientCompetitors`, also read `client.competitorLimit` in the same `withTenant` call and return `{ items, limit }`. Add `limit: z.number().int()` to its output object.

```ts
/** Decision 6 (5b-2): the client's own `competitor_limit`. Call inside the caller's tenant transaction; a competitor already linked doesn't count twice. */
export async function assertRoomForCompetitor(tx: Tx, clientId: string, competitorId: string | null): Promise<void> {
  const [c] = await tx.select({ limit: client.competitorLimit }).from(client).where(eq(client.id, clientId));
  if (!c) throw new ToolError('not_found', 'Client not found');
  const where = competitorId ? and(eq(clientCompetitor.clientId, clientId), ne(clientCompetitor.competitorId, competitorId)) : eq(clientCompetitor.clientId, clientId);
  const [row] = await tx.select({ n: count() }).from(clientCompetitor).where(where);
  if ((row?.n ?? 0) >= c.limit) throw new ToolError('invalid_input', `This client can track at most ${c.limit} competitor${c.limit === 1 ? '' : 's'} — remove one first or raise its limit`);
}
```

Grep `competitors.test.ts` for the old message (`at most 5 competitors`) and update the expectation to the new text (`at most 5 competitors`, which still matches for limit 5).

`portfolio.ts`:
- Select `cap: client.monthlyCapUsd` with the clients.
- Add `spendByClient(deps.service, ids, monthStart(now))` to the `Promise.all`. The ledger tables are service-role data; the ids were just proved visible by the RLS-scoped client select, so the service read leaks nothing. Use `deps.service`, not `tx`.
- Set `spend: spendView(spend.get(c.id) ?? 0, c.cap)` on each row, importing `spendView` from `./usage`.
- Add `.where(eq(client.status, 'active'))` to the clients select now as well (decision 9 — Task 10 adds the test).

`clients.ts`: `list_clients` returns `status: c.status` too.

`tools/all.ts`: append `...usageTools` (import from `./usage`). `index.ts`: add `export * from './usage';`.

The web app still imports `COMPETITOR_LIMIT` — Task 4 fixes that page. To keep the workspace typecheck green at this commit, change `apps/web/src/app/(app)/c/[clientId]/competitors/page.tsx` now:
- read `tracked.limit` instead of the constant;
- drop the import;
- replace each `COMPETITOR_LIMIT` with `tracked.limit`.

- [ ] **Step 4: Run tests and typecheck**

Run the Step 2 command plus `pnpm --filter @cs/tools exec vitest run src/tools/competitors.test.ts src/tools/read-tools.test.ts` → PASS. `pnpm --filter @cs/tools typecheck && pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools apps/web/src/app/\(app\)/c/\[clientId\]/competitors/page.tsx
git commit -m "feat(tools): get_usage, set_client_limits, per-client competitor limit and portfolio spend"
```

---

### Task 4: Usage & limits screen, portfolio budget badge

**Files:**
- Create: `apps/web/src/app/(app)/agency/usage/page.tsx`, `apps/web/src/app/(app)/agency/usage/actions.ts`, `apps/web/src/app/(app)/agency/usage/limits-form.tsx`, `apps/web/src/app/(app)/agency/usage/limits-form.test.tsx`, `apps/web/src/components/spend-badge.tsx`, `apps/web/src/components/spend-badge.test.tsx`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`, `apps/web/src/app/(app)/agency/page.tsx`, `apps/web/src/server/format.ts` (+ test)

**Interfaces:**
- Consumes: `get_usage`, `set_client_limits` (Task 3); `UsageRow`, `SpendView` (`@cs/tools`).
- Produces: `formatUsd(n: number): string` (`server/format.ts`, e.g. `$8.50`); `<SpendBadge spend={SpendView} />`; nav item `{ href: '/agency/usage', label: 'Usage & limits', icon: 'usage', group: 'agency' }`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/spend-badge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpendBadge } from './spend-badge';

describe('SpendBadge', () => {
  it('shows the percentage and a warning/over label', () => {
    const { rerender } = render(<SpendBadge spend={{ monthToDateUsd: 3, capUsd: 15, ratio: 0.2, level: 'ok' }} />);
    expect(screen.getByText('20%')).toBeTruthy();
    rerender(<SpendBadge spend={{ monthToDateUsd: 12.5, capUsd: 15, ratio: 12.5 / 15, level: 'warning' }} />);
    expect(screen.getByText(/83% · near cap/)).toBeTruthy();
    rerender(<SpendBadge spend={{ monthToDateUsd: 16, capUsd: 15, ratio: 16 / 15, level: 'over' }} />);
    expect(screen.getByText(/107% · over cap/)).toBeTruthy();
  });
});
```

`apps/web/src/app/(app)/agency/usage/limits-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LimitsForm } from './limits-form';

describe('LimitsForm', () => {
  it('posts the client id, cap and limit and keeps the result message visible', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Limits saved.' }));
    render(<LimitsForm action={action} clientId="c1" clientName="A1 HVAC" capUsd={15} competitorLimit={5} />);
    fireEvent.change(screen.getByLabelText('Monthly cap for A1 HVAC (USD)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Competitor limit for A1 HVAC'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits for A1 HVAC' }));
    await waitFor(() => expect(screen.getByText('Limits saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('clientId'), fd.get('monthlyCapUsd'), fd.get('competitorLimit')]).toEqual(['c1', '25', '7']);
  });
});
```

Add to `apps/web/src/server/format.test.ts`:

```ts
it('formats dollars with cents', () => {
  expect(formatUsd(8.5)).toBe('$8.50');
  expect(formatUsd(0)).toBe('$0.00');
  expect(formatUsd(1234.567)).toBe('$1,234.57');
});
```

Add to `sidebar-nav.test.tsx`:

```tsx
it('shows Usage & limits to agency users', () => {
  pathname = '/agency/usage';
  render(<SidebarNav flags={agencyAdmin} />);
  expect(activeHrefOf()).toBe('/agency/usage');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/components/spend-badge.test.tsx "src/app/(app)/agency/usage" src/server/format.test.ts src/components/shell/sidebar-nav.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`server/format.ts` — add:

```ts
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatUsd = (n: number): string => USD.format(n);
```

(`format.ts` must stay importable from client components — if it imports `server-only`, put `formatUsd` in a new `apps/web/src/lib/money.ts` instead and import it from there in both places.)

`components/spend-badge.tsx`:

```tsx
import type { SpendView } from '@cs/tools';

const STYLE: Record<SpendView['level'], string> = {
  ok: 'bg-muted-surface text-ink',
  warning: 'bg-amber/20 text-amber-text',
  over: 'bg-destructive/15 text-destructive',
};
const LABEL: Record<SpendView['level'], string> = { ok: '', warning: ' · near cap', over: ' · over cap' };

/** Decision 6: month-to-date spend as a share of the client's cap; amber from 80 %, red from 100 %. */
export function SpendBadge({ spend }: { spend: SpendView }) {
  const pct = Math.round(spend.ratio * 100);
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STYLE[spend.level]}`}>{`${pct}%${LABEL[spend.level]}`}</span>;
}
```

(Check that `amber`/`amber-text`/`destructive` tokens exist in `packages/ui/src/styles.css`; `PressureBadge` is the precedent — copy whichever tokens it uses for its elevated/high levels.)

`agency/usage/actions.ts`:

```ts
'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const num = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? '').trim();
  return raw === '' ? undefined : Number(raw);
};

export async function saveLimitsAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool(ctx, 'set_client_limits', { clientId: String(fd.get('clientId') ?? ''), monthlyCapUsd: num(fd, 'monthlyCapUsd'), competitorLimit: num(fd, 'competitorLimit') });
  if (!r.ok) return r;
  revalidatePath('/agency/usage');
  return { ok: true, message: 'Limits saved.' };
}
```

`agency/usage/limits-form.tsx` (`'use client'`):
- `useActionState(action, { ok: true } as FormResult)`.
- Hidden `clientId`.
- Two `Input`s:
  - `type="number"`, `step="0.01"`, `min="1"`, `max="10000"`, `name="monthlyCapUsd"`, `aria-label={`Monthly cap for ${clientName} (USD)`}`, `defaultValue={capUsd}`;
  - `type="number"`, `step="1"`, `min="1"`, `max="10"`, `name="competitorLimit"`, `aria-label={`Competitor limit for ${clientName}`}`, `defaultValue={competitorLimit}`.
- A `Button` `aria-label={`Save limits for ${clientName}`}` with the visible text "Save".
- A message `<p>` below: error with `role="alert"`, otherwise the success message.

Because the message lives in this per-row form and saving re-renders the same row (no status flip unmounts it), the 5b-1 unmount bug doesn't apply. Keep the form's `key` stable (`clientId`) in the page.

`agency/usage/page.tsx` (server component, `export const dynamic = 'force-dynamic'`):
- `requireContext()`; not an agency role → `notFound()`.
- `callTool<{ month: string; items: UsageRow[]; agencyLevelUsd: number | null }>(ctx, 'get_usage', {})`.
- Title "Usage & limits"; subtitle `Spend this month (${month}, UTC) — AI and data costs tied to each client.`
- A `Table` with columns Client (link to `/c/<id>` for active, `/agency/prospects/<id>` for prospects, with a "Prospect" `Badge`), Spend (`formatUsd(monthToDateUsd)` of `formatUsd(capUsd)`), Share (`<SpendBadge>`), Competitors (`competitors` of `competitorLimit`, with an amber "over limit" note when `competitors > competitorLimit`), Questions ("Ask arrives in Phase 6").
- When `ctx.role === 'agency_admin'`, a last column renders `<LimitsForm …>` per row.
- Under the table, a muted paragraph: "Shared monitoring of competitors (Google profile, reviews, ads) and the intelligence engine’s shared work are not yet split across clients; they’ll be allocated in a later release." When `agencyLevelUsd !== null`, add: "Agency-level spend not tied to a client: {formatUsd(agencyLevelUsd)}".
- Show a card-style summary row above the table with the count of clients at `warning` and `over`.

`agency/page.tsx` (portfolio): add a "Budget" column after the pressure column rendering `<SpendBadge spend={row.spend} />`.

`nav-items.ts`:
- Add `'usage'` to the `icon` union.
- Add `agency('/agency/usage', 'Usage & limits', 'usage');` after the Alert review item.

`sidebar-nav.tsx`: `ICONS.usage = Gauge` (from `lucide-react`).

- [ ] **Step 4: Run tests** — the Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): usage & limits page, spend badge on the portfolio"
```

---

### Task 5: Playbook tools — `list_playbooks`, `update_playbook`

**Files:**
- Modify: `packages/engine/src/briefs/playbooks.ts`, `packages/engine/src/briefs/playbooks.test.ts`, `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`
- Create: `packages/tools/src/tools/playbooks.ts`, `packages/tools/src/tools/playbooks.test.ts`

**Interfaces:**
- Consumes: `upsertPlaybookOverride`, `resolvePlaybooks`, `PLAYBOOK_TEMPLATE_MAX` (`@cs/engine`); `listVerticalPacks` (`@cs/verticals`); `packsOf` (`deps.ts`); `playbookOverride` (`@cs/db`).
- Produces:
  - engine: `PLAYBOOK_VARS = ['competitor', 'service', 'new_price', 'areas', 'theme'] as const`; `unknownPlaybookVars(template: string): string[]`; `PLAYBOOK_TITLE_MAX = 200`
  - schemas: `PlaybookView = { id, trigger, packTitle, packTemplate, title, template, overridden: boolean, disabled: boolean, updatedAt: string | null }`, `PlaybookVertical = { id, name, playbooks: PlaybookView[] }`
  - tools: `list_playbooks({})` → `{ verticals: PlaybookVertical[], vars: string[] }`; `update_playbook({ verticalId, playbookId, title: string | null, template: string | null, disabled: boolean })` → `PlaybookView`

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/src/briefs/playbooks.test.ts` (add `PLAYBOOK_VARS, unknownPlaybookVars` to its import from `./playbooks`):

```ts
describe('playbook placeholders (5b-2 decision 5)', () => {
  it('lists unknown placeholders, whatever their spelling', () => {
    expect(unknownPlaybookVars('Beat {{competitor}} on {{ service }}.')).toEqual([]);
    expect(unknownPlaybookVars('Hi {{client}} and {{ Competitor }} and {{client}}')).toEqual(['client', 'Competitor']);
    expect(unknownPlaybookVars('Plain text')).toEqual([]);
  });
  it('has a fallback for every known placeholder', () => {
    for (const v of PLAYBOOK_VARS) expect(renderPlaybook(`{{${v}}}`, {})).not.toBe('this');
  });
});
```

`packages/tools/src/tools/playbooks.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { resolvePlaybooks } from '@cs/engine';
import { loadVerticalPack } from '@cs/verticals';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: role === 'agency_admin' ? 'all' : [agencyId === IDS.agencyA ? IDS.clientA1 : IDS.clientB1], features: [] });
const admin = ctx('agency_admin');
const am = ctx('account_manager');
const adminB = ctx('agency_admin', IDS.agencyB);
type View = { id: string; title: string; template: string; packTemplate: string; overridden: boolean; disabled: boolean };
const find = async (c: AccessContext, id: string) =>
  ((await registry.invoke(c, 'list_playbooks', {})) as { verticals: { id: string; playbooks: View[] }[] }).verticals.find((v) => v.id === 'hvac_plumbing')!.playbooks.find((p) => p.id === id)!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('playbooks (Review Focus 5)', () => {
  it('lists every pack playbook with the pack text when nothing is overridden', async () => {
    const p = await find(am, 'price_cut_bundle');
    expect(p).toMatchObject({ overridden: false, disabled: false });
    expect(p.template).toBe(p.packTemplate);
  });

  it('lets an admin override, disable and reset; other agencies never see it', async () => {
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: 'Bundle, don’t match', template: 'Bundle {{service}} against {{competitor}}.', disabled: false });
    expect(await find(admin, 'price_cut_bundle')).toMatchObject({ title: 'Bundle, don’t match', template: 'Bundle {{service}} against {{competitor}}.', overridden: true });
    expect((await find(adminB, 'price_cut_bundle')).overridden).toBe(false);
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: null, template: null, disabled: true });
    const pack = await loadVerticalPack('hvac_plumbing');
    expect((await resolvePlaybooks(dbs.service, IDS.agencyA, pack)).some((p) => p.id === 'price_cut_bundle')).toBe(false);
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: null, template: null, disabled: false });
    const reset = await find(admin, 'price_cut_bundle');
    expect(reset).toMatchObject({ overridden: false, disabled: false });
    expect(reset.template).toBe(reset.packTemplate);
  });

  it('stores nothing when the text equals the pack text', async () => {
    const p = await find(admin, 'price_cut_bundle');
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: p.title, template: `  ${p.packTemplate}  `, disabled: false });
    expect((await find(admin, 'price_cut_bundle')).overridden).toBe(false);
  });

  it('refuses unknown placeholders, over-long text, unknown ids and non-admins', async () => {
    const base = { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: null, disabled: false };
    await expect(registry.invoke(admin, 'update_playbook', { ...base, template: 'Hi {{client}}' })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/\{\{client\}\}/) });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, template: 'x'.repeat(2001) })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/2000/) });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, template: null, title: 't'.repeat(201) })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, playbookId: 'nope', template: null })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, verticalId: 'bakeries', template: null })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(am, 'update_playbook', { ...base, template: 'Bundle {{service}}.' })).rejects.toMatchObject({ code: 'permission_denied' });
    expect((await find(admin, 'price_cut_bundle')).overridden).toBe(false);
  });
});
```

If `loadVerticalPack` isn't exported from `@cs/verticals` under that name, use the loader the engine's `playbooks.test.ts` uses.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/engine exec vitest run src/briefs/playbooks.test.ts` and `pnpm --filter @cs/tools exec vitest run src/tools/playbooks.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`packages/engine/src/briefs/playbooks.ts` — add near `FALLBACK` (and type `FALLBACK` as `Record<PlaybookVar, string>`):

```ts
/** Placeholders a playbook template may use (5b-2 decision 5); `renderPlaybook` fills them from the evidence. */
export const PLAYBOOK_VARS = ['competitor', 'service', 'new_price', 'areas', 'theme'] as const;
export type PlaybookVar = (typeof PLAYBOOK_VARS)[number];
export const PLAYBOOK_TITLE_MAX = 200;

/** Every `{{…}}` in the template that isn't a known placeholder, in order, de-duplicated (case-sensitive: renderPlaybook only fills lower-case names). */
export function unknownPlaybookVars(template: string): string[] {
  const names = [...template.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]!);
  return [...new Set(names.filter((n) => !(PLAYBOOK_VARS as readonly string[]).includes(n)))];
}
```

Use `PLAYBOOK_TITLE_MAX` in `upsertPlaybookOverride`'s title check (replacing the literal 200). Make sure `@cs/engine`'s barrel re-exports these (it re-exports `briefs/playbooks` — verify with grep).

`packages/tools/src/tools/schemas.ts`:

```ts
export const PlaybookView = z.object({
  id: z.string(), trigger: z.string(), packTitle: z.string(), packTemplate: z.string(), title: z.string(), template: z.string(),
  overridden: z.boolean(), disabled: z.boolean(), updatedAt: iso.nullable(),
});
export type PlaybookView = z.infer<typeof PlaybookView>;
export const PlaybookVertical = z.object({ id: z.string(), name: z.string(), playbooks: z.array(PlaybookView) });
export type PlaybookVertical = z.infer<typeof PlaybookVertical>;
```

`packages/tools/src/tools/playbooks.ts`:

```ts
import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { playbookOverride, withTenant } from '@cs/db';
import { PLAYBOOK_TEMPLATE_MAX, PLAYBOOK_TITLE_MAX, PLAYBOOK_VARS, unknownPlaybookVars, upsertPlaybookOverride } from '@cs/engine';
import { listVerticalPacks, type VerticalPack } from '@cs/verticals';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { PlaybookVertical, PlaybookView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
type Override = typeof playbookOverride.$inferSelect;

function view(p: VerticalPack['playbooks'][number], o: Override | undefined): z.input<typeof PlaybookView> {
  return {
    id: p.id, trigger: p.trigger, packTitle: p.title, packTemplate: p.template.trim(), title: o?.title ?? p.title, template: (o?.template ?? p.template).trim(),
    overridden: Boolean(o && (o.title !== null || o.template !== null)), disabled: Boolean(o?.disabledBy), updatedAt: o ? o.updatedAt.toISOString() : null,
  };
}

const overridesFor = (deps: ToolDeps, ctx: AccessContext): Promise<Override[]> => withTenant(deps.app, ctx, (tx) => tx.select().from(playbookOverride));

export const listPlaybooks = defineTool({
  name: 'list_playbooks',
  description: 'The response playbooks for each business type, with this agency’s edits.',
  input: z.object({}),
  output: z.object({ verticals: z.array(PlaybookVertical), vars: z.array(z.string()) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const overrides = await overridesFor(deps, ctx);
    const packs = await Promise.all((await listVerticalPacks()).map((id) => packsOf(deps)(id)));
    return {
      verticals: packs.map((pack) => ({
        id: pack.id, name: pack.name,
        playbooks: pack.playbooks.map((p) => view(p, overrides.find((o) => o.verticalId === pack.id && o.playbookId === p.id))),
      })),
      vars: [...PLAYBOOK_VARS],
    };
  },
});

export const updatePlaybook = defineTool({
  name: 'update_playbook',
  description: 'Edit, disable or reset one playbook for this agency (agency admins). Blank title/template = use the standard text.',
  input: z.object({
    verticalId: z.string().max(40), playbookId: z.string().max(80), title: z.string().max(1000).nullable(), template: z.string().max(10000).nullable(), disabled: z.boolean(),
  }),
  output: PlaybookView,
  permission: 'agency',
  async handler(ctx, input, deps) {
    if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins edit playbooks');
    if (!(await listVerticalPacks()).includes(input.verticalId)) throw new ToolError('invalid_input', `Unknown business type: ${input.verticalId}`);
    const pack = await packsOf(deps)(input.verticalId);
    const p = pack.playbooks.find((x) => x.id === input.playbookId);
    if (!p) throw new ToolError('invalid_input', `Unknown playbook: ${input.playbookId}`);
    const title = input.title?.trim() || null;
    const template = input.template?.trim() || null;
    if (title && title.length > PLAYBOOK_TITLE_MAX) throw new ToolError('invalid_input', `The title must be at most ${PLAYBOOK_TITLE_MAX} characters`);
    if (template && template.length > PLAYBOOK_TEMPLATE_MAX) throw new ToolError('invalid_input', `The template must be at most ${PLAYBOOK_TEMPLATE_MAX} characters`);
    const unknown = template ? unknownPlaybookVars(template) : [];
    if (unknown.length) {
      throw new ToolError('invalid_input', `Unknown placeholder ${unknown.map((u) => `{{${u}}}`).join(', ')} — use ${PLAYBOOK_VARS.map((v) => `{{${v}}}`).join(', ')}`);
    }
    // Text equal to the pack's is not an override: storing it would freeze today's pack text against future pack updates.
    await upsertPlaybookOverride(deps, ctx, {
      verticalId: pack.id, playbookId: p.id, title: title === p.title ? null : title, template: template === p.template.trim() ? null : template, disabled: input.disabled,
    }, pack);
    const o = (await overridesFor(deps, ctx)).find((x) => x.verticalId === pack.id && x.playbookId === p.id);
    return view(p, o);
  },
});

export const playbookTools = [listPlaybooks, updatePlaybook];
```

Append `...playbookTools` in `tools/all.ts`.

- [ ] **Step 4: Run tests** — the Step 2 commands → PASS; `pnpm --filter @cs/engine typecheck && pnpm --filter @cs/tools typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/tools
git commit -m "feat(tools,engine): list_playbooks and update_playbook with placeholder validation"
```

---

### Task 6: Playbooks screen

**Files:**
- Create: `apps/web/src/app/(app)/agency/playbooks/page.tsx`, `apps/web/src/app/(app)/agency/playbooks/actions.ts`, `apps/web/src/app/(app)/agency/playbooks/playbook-editor.tsx`, `apps/web/src/app/(app)/agency/playbooks/playbook-editor.test.tsx`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `list_playbooks`, `update_playbook` (Task 5); `PlaybookVertical`, `PlaybookView`.
- Produces: nav item `{ href: '/agency/playbooks', label: 'Playbooks', icon: 'playbooks', group: 'agency' }`.

- [ ] **Step 1: Write the failing tests**

`playbook-editor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlaybookEditor } from './playbook-editor';

const pb = { id: 'price_cut_bundle', trigger: 'price_change', packTitle: 'Answer a price cut', packTemplate: 'Bundle {{service}}.', title: 'Answer a price cut', template: 'Bundle {{service}}.', overridden: false, disabled: false, updatedAt: null };

describe('PlaybookEditor', () => {
  it('is read-only for non-admins', () => {
    render(<PlaybookEditor verticalId="hvac_plumbing" playbook={pb} canEdit={false} action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.getByText('Bundle {{service}}.')).toBeTruthy();
  });

  it('saves edits, shows the tool’s refusal, and offers reset only when overridden', async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: 'Unknown placeholder {{client}}' }));
    const { rerender } = render(<PlaybookEditor verticalId="hvac_plumbing" playbook={pb} canEdit action={action} />);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'Hi {{client}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/\{\{client\}\}/));
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('verticalId'), fd.get('playbookId'), fd.get('template'), fd.get('intent')]).toEqual(['hvac_plumbing', 'price_cut_bundle', 'Hi {{client}}', 'save']);
    rerender(<PlaybookEditor verticalId="hvac_plumbing" playbook={{ ...pb, overridden: true }} canEdit action={action} />);
    expect(screen.getByRole('button', { name: /reset to standard/i })).toBeTruthy();
  });
});
```

Add to `sidebar-nav.test.tsx`:

```tsx
it('highlights Playbooks on /agency/playbooks', () => {
  pathname = '/agency/playbooks';
  render(<SidebarNav flags={agencyAdmin} />);
  expect(activeHrefOf()).toBe('/agency/playbooks');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/agency/playbooks" src/components/shell/sidebar-nav.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`actions.ts`:

```ts
'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const DONE: Record<string, string> = { save: 'Playbook saved.', disable: 'Playbook turned off.', enable: 'Playbook turned on.', reset: 'Back to the standard playbook.' };

/** intent = save | disable | enable | reset. Save sends the edited text; disable/enable keep the current text; reset clears it. */
export async function playbookAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const intent = s(fd, 'intent');
  const reset = intent === 'reset';
  const disabled = intent === 'disable' ? true : intent === 'enable' || reset ? false : fd.get('disabled') === 'true';
  const r = await runTool(ctx, 'update_playbook', {
    verticalId: s(fd, 'verticalId'), playbookId: s(fd, 'playbookId'), title: reset ? null : s(fd, 'title') || null, template: reset ? null : s(fd, 'template') || null, disabled,
  });
  if (!r.ok) return r;
  revalidatePath('/agency/playbooks');
  return { ok: true, message: DONE[intent] ?? 'Saved.' };
}
```

`playbook-editor.tsx` (`'use client'`). Props `{ verticalId: string; playbook: PlaybookView; canEdit: boolean; action: (p: FormResult, fd: FormData) => Promise<FormResult> }`:

```tsx
'use client';
import type { PlaybookView } from '@cs/tools';
import { Badge, Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

const area = 'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function PlaybookEditor({ verticalId, playbook: p, canEdit, action }: { verticalId: string; playbook: PlaybookView; canEdit: boolean; action: (prev: FormResult, fd: FormData) => Promise<FormResult> }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const id = `${verticalId}-${p.id}`;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{p.trigger}</Badge>
        {p.overridden && <Badge>Edited</Badge>}
        {p.disabled && <Badge variant="secondary">Off</Badge>}
      </div>
      {!canEdit ? (
        <>
          <h3 className="font-semibold">{p.title}</h3>
          <p className="whitespace-pre-wrap text-sm">{p.template}</p>
        </>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="verticalId" value={verticalId} />
          <input type="hidden" name="playbookId" value={p.id} />
          <input type="hidden" name="disabled" value={p.disabled ? 'true' : 'false'} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`title-${id}`}>Title</Label>
            <Input id={`title-${id}`} name="title" defaultValue={p.title} maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`template-${id}`}>Template</Label>
            <textarea id={`template-${id}`} name="template" defaultValue={p.template} rows={4} maxLength={2000} className={area} />
            <p className="text-xs text-muted-ink">Placeholders: {'{{competitor}} {{service}} {{new_price}} {{areas}} {{theme}}'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="save" disabled={pending}>Save</Button>
            <Button type="submit" name="intent" value={p.disabled ? 'enable' : 'disable'} variant="outline" disabled={pending}>{p.disabled ? 'Turn on' : 'Turn off'}</Button>
            {p.overridden && <Button type="submit" name="intent" value="reset" variant="outline" disabled={pending}>Reset to standard</Button>}
          </div>
          {!state.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
          {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
        </form>
      )}
      {p.overridden && (
        <details className="text-sm text-muted-ink">
          <summary>Standard text</summary>
          <p className="mt-1 font-semibold">{p.packTitle}</p>
          <p className="whitespace-pre-wrap">{p.packTemplate}</p>
        </details>
      )}
    </div>
  );
}
```

Check `Badge`'s supported `variant` names in `packages/ui/src/components/badge.tsx` and adjust (`outline`/`secondary` are shadcn defaults). Keep the editor's `key` stable (`${verticalId}:${p.id}`), so its message survives `revalidatePath`.

`page.tsx`:

```tsx
import { isAgencyRole } from '@cs/core';
import type { PlaybookVertical } from '@cs/tools';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { playbookAction } from './actions';
import { PlaybookEditor } from './playbook-editor';

export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { verticals } = await callTool<{ verticals: PlaybookVertical[] }>(ctx, 'list_playbooks', {});
  const canEdit = ctx.role === 'agency_admin';
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Playbooks</h1>
      <p className="text-muted-foreground">How Friday words its recommendations for each kind of competitor move. Your edits apply to every client of this agency.</p>
      {verticals.map((v) => (
        <section key={v.id} className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">{v.name}</h2>
          <div className="grid gap-5 xl:grid-cols-2">
            {v.playbooks.map((p) => <PlaybookEditor key={`${v.id}:${p.id}`} verticalId={v.id} playbook={p} canEdit={canEdit} action={playbookAction} />)}
          </div>
        </section>
      ))}
    </>
  );
}
```

`nav-items.ts`: add `'playbooks'` to the icon union and `agency('/agency/playbooks', 'Playbooks', 'playbooks')` after Usage & limits. `sidebar-nav.tsx`: `ICONS.playbooks = BookOpen`.

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): playbooks editor"
```

---

### Task 7: Platform operators, the decision-review queue tools and the claim fix

**Files:**
- Create: `packages/tools/src/platform.ts`, `packages/tools/src/platform.test.ts`, `packages/tools/src/tools/model-ops.ts`, `packages/tools/src/tools/model-ops.test.ts`
- Modify: `packages/tools/src/deps.ts`, `packages/tools/src/index.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/tools/schemas.ts`, `packages/tools/package.json` (only if `@cs/ai` is missing), `packages/engine/src/model-ops/resolve.ts`, `packages/engine/src/model-ops/resolve.test.ts`, `packages/engine/src/index.ts` (export `reviewQuestions` if the barrel lists names explicitly), `apps/web/src/server/env.ts`, `apps/web/src/server/env.test.ts`, `apps/web/src/server/tools.ts`, `apps/web/src/server/auth-options.test.ts` (its `WebEnv` literal gains `platformAdmins: []`), `apps/web/playwright.config.ts`

**Interfaces:**
- Consumes: `listOpenReviews`, `resolveDecisionReview` (`@cs/engine`); `DecisionQuestion` (`@cs/ai`).
- Produces:
  - `ToolDeps.platformAdmins?: readonly string[]` (lower-cased emails)
  - `normalizeAdminEmails(raw: string | undefined): string[]`; `isPlatformOperator(deps: Pick<ToolDeps, 'service' | 'platformAdmins'>, ctx: AccessContext): Promise<boolean>`; `requirePlatformOperator(deps, ctx): Promise<void>` (throws `permission_denied`)
  - engine: `reviewQuestions(deps: { db: Db; packs: PackLoader }, reviewId: string): Promise<{ key: string; question: DecisionQuestion }[]>`; `resolveDecisionReview` throws `ToolError('invalid_input' | 'not_found')` for user-fixable refusals (message texts unchanged)
  - schemas: `ReviewQuestionView = { key, type: 'noul' | 'choice' | 'score', instructions, options: { value: string; label: string }[], modelAnswer: string | null, confidence: number | null }`, `DecisionReviewView = { id, createdAt, competitorName, source, kind, beforeText: string | null, afterText: string | null, questions: ReviewQuestionView[] }`
  - tools: `list_decision_reviews({})` → `{ items: DecisionReviewView[] }`; `resolve_decision_review({ reviewId, answers: Record<string, string> })` → `{ action: 'created' | 'updated' | 'detached' | 'retracted' | 'unchanged', eventId: string | null, labels: number }`
  - web: `WebEnv.platformAdmins: string[]` from `PLATFORM_ADMIN_EMAILS`

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/src/model-ops/resolve.test.ts` (inside the existing `describe`; it reuses the file's `webChange`, `review`, `modelSaid`, `deps`; add `reviewQuestions` to the import from `./resolve`):

```ts
  it('lets exactly one of two concurrent resolutions win (Review Focus 3)', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'));
    const answers = { meaningful: true, change_type: 'new_service', service_hvac_plumbing: 'duct_cleaning' };
    const results = await Promise.allSettled([
      resolveDecisionReview(deps, id, { answers, resolvedBy: 'op1' }),
      resolveDecisionReview(deps, id, { answers, resolvedBy: 'op2' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/already resolved/) });
    expect(await dbs.owner.select().from(changeEvent)).toHaveLength(1);
  });

  it('refuses user-fixable problems as invalid_input and a missing review as not_found', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['change_type'], modelSaid(true, 'content'));
    await expect(resolveDecisionReview(deps, id, { answers: { change_type: 'banana' }, resolvedBy: 'op' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(resolveDecisionReview(deps, id, { answers: { nope: 'true' }, resolvedBy: 'op' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(resolveDecisionReview(deps, '00000000-0000-4000-8000-000000000999', { answers: {}, resolvedBy: 'op' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('returns the open questions of a review', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful', 'change_type'], modelSaid(false, 'cosmetic'));
    const qs = await reviewQuestions(deps, id);
    expect(qs.map((q) => [q.key, q.question.type])).toEqual([['meaningful', 'noul'], ['change_type', 'choice']]);
  });
```

The existing "hides and refuses a review whose change was superseded" test keeps its message regex. Also add `.rejects.toMatchObject({ code: 'invalid_input' })` there.

`packages/tools/src/platform.test.ts`:

```ts
import { createAccessContext } from '@cs/core';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../test/fixtures';
import { isPlatformOperator, normalizeAdminEmails } from './platform';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'Op@Example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
});
const as = (userId: string, role: 'agency_admin' | 'client_viewer' = 'agency_admin') =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: role === 'agency_admin' ? 'all' : [IDS.clientA1], features: [] });

describe('platform operators (decision 2, Review Focus 2)', () => {
  it('normalises the env list', () => {
    expect(normalizeAdminEmails(' Op@Example.com, ,bad, x@y.co ,op@example.com')).toEqual(['op@example.com', 'x@y.co']);
    expect(normalizeAdminEmails(undefined)).toEqual([]);
  });
  it('matches the signed-in user’s email case-insensitively; never guests or an empty list', async () => {
    const deps = { service: dbs.service, platformAdmins: ['op@example.com'] };
    expect(await isPlatformOperator(deps, as('op'))).toBe(true);
    expect(await isPlatformOperator(deps, as('admin'))).toBe(false);
    expect(await isPlatformOperator(deps, as('contact:00000000-0000-4000-8000-000000000001', 'client_viewer'))).toBe(false);
    expect(await isPlatformOperator({ ...deps, platformAdmins: [] }, as('op'))).toBe(false);
  });
});
```

`packages/tools/src/tools/model-ops.test.ts`:

```ts
import { createAccessContext } from '@cs/core';
import { decisionReview, detectedChange, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
let reviewId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
  const [page] = await dbs.service.insert(trackedPage).values({ competitorId: IDS.competitorX, url: 'https://smithhvac.example/services', pageType: 'service' }).returning();
  const [ch] = await dbs.service
    .insert(detectedChange)
    .values({ competitorId: IDS.competitorX, trackedPageId: page!.id, source: 'web', kind: 'added', blockKey: 'p#0', afterText: 'Now offering duct cleaning', status: 'cosmetic', stageVersion: 1, numericChanges: [] })
    .returning();
  const [r] = await dbs.service
    .insert(decisionReview)
    .values({ subjectType: 'detected_change', subjectId: ch!.id, keys: ['meaningful'], answers: { meaningful: { type: 'noul', value: false, probability: 0.4, confidence: 0.2 } } })
    .returning();
  reviewId = r!.id;
});

describe('decision-review queue (Review Focus 2)', () => {
  it('lists open reviews with answerable questions for operators', async () => {
    const { items } = (await registry.invoke(op, 'list_decision_reviews', {})) as { items: { id: string; competitorName: string; questions: { key: string; options: { value: string }[]; modelAnswer: string | null }[] }[] };
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: reviewId, competitorName: 'Smith HVAC' });
    expect(items[0]!.questions[0]).toMatchObject({ key: 'meaningful', modelAnswer: 'false' });
    expect(items[0]!.questions[0]!.options.map((o) => o.value)).toEqual(['true', 'false']);
  });

  it('refuses non-operators, client roles and malformed ids', async () => {
    await expect(registry.invoke(admin, 'list_decision_reviews', {})).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'resolve_decision_review', { reviewId, answers: { meaningful: 'false' } })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'list_decision_reviews', {})).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(op, 'resolve_decision_review', { reviewId: 'not-a-uuid', answers: { meaningful: 'false' } })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('resolves once; a second attempt is invalid_input and the queue is empty', async () => {
    const r = await registry.invoke(op, 'resolve_decision_review', { reviewId, answers: { meaningful: 'false' } });
    expect(r).toMatchObject({ action: 'unchanged' });
    await expect(registry.invoke(op, 'resolve_decision_review', { reviewId, answers: { meaningful: 'false' } })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(((await registry.invoke(op, 'list_decision_reviews', {})) as { items: unknown[] }).items).toEqual([]);
  });
});
```

If the `trackedPage`/`detectedChange` inserts miss a NOT NULL column, mirror the engine's `test/seed.ts` `seedPage` and `resolve.test.ts`'s `webChange` (it seeds a capture; do the same if `after_capture_id` turns out to be required).

Add to `apps/web/src/server/env.test.ts`:

```ts
it('reads PLATFORM_ADMIN_EMAILS as a normalised list', () => {
  expect(parseWebEnv({ ...valid }).platformAdmins).toEqual([]);
  expect(parseWebEnv({ ...valid, PLATFORM_ADMIN_EMAILS: 'A@b.co, c@d.co' }).platformAdmins).toEqual(['a@b.co', 'c@d.co']);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/engine exec vitest run src/model-ops/resolve.test.ts`, `pnpm --filter @cs/tools exec vitest run src/platform.test.ts src/tools/model-ops.test.ts`, `pnpm --filter @cs/web exec vitest run src/server/env.test.ts` → FAIL.

- [ ] **Step 3: Implement the engine changes** (`packages/engine/src/model-ops/resolve.ts`)

1. Import `ToolError` from `@cs/core`.
2. Extract the context loading into one function used by both callers (place it above `resolveDecisionReview`):

```ts
type ReviewRow = typeof decisionReview.$inferSelect;
type ChangeRow = typeof detectedChange.$inferSelect;
type SampleRow = typeof decisionSample.$inferSelect;
interface ReviewContext { rev: ReviewRow; ch: ChangeRow; sample: SampleRow | undefined; packs: Awaited<ReturnType<PackLoader>>[]; questions: Record<string, DecisionQuestion> }

/** Loads an open review with its change, sample, packs and questions; refuses resolved or closed ones (5b-2 decision 3). */
async function reviewContext(deps: { db: Db; packs: PackLoader }, reviewId: string): Promise<ReviewContext> {
  const { db } = deps;
  const [rev] = await db.select().from(decisionReview).where(eq(decisionReview.id, reviewId)).limit(1);
  if (!rev) throw new ToolError('not_found', `decision_review ${reviewId} not found`);
  if (rev.resolvedAt) throw new ToolError('invalid_input', `decision_review ${reviewId} is already resolved`);
  if (rev.subjectType !== 'detected_change') throw new Error(`decision_review ${reviewId} has unsupported subject ${rev.subjectType}`);
  const [ch] = await db.select().from(detectedChange).where(eq(detectedChange.id, rev.subjectId)).limit(1);
  if (!ch) throw new Error(`detected_change ${rev.subjectId} not found`);
  if (ch.status === 'superseded') throw new ToolError('invalid_input', `decision_review ${reviewId}: detected_change ${ch.id} was superseded by a newer stage version; nothing to resolve`);
  if (ch.status === 'suppressed') throw new ToolError('invalid_input', `decision_review ${reviewId}: detected_change ${ch.id} is suppressed; nothing to resolve`);
  const [sample] = rev.sampleId ? await db.select().from(decisionSample).where(eq(decisionSample.id, rev.sampleId)).limit(1) : [];
  const verticalIds = ch.clientId ? (await db.select({ v: client.verticalId }).from(client).where(eq(client.id, ch.clientId))).map((r) => r.v) : await competitorVerticals(db, ch.competitorId);
  const packs = await Promise.all(verticalIds.map(deps.packs));
  const questions = (sample?.questions as Record<string, DecisionQuestion> | undefined) ??
    (ch.source === 'web' ? buildTagQuestions(packs) : buildStructuredQuestions(ch.details.changeType as ChangeType, packs));
  return { rev, ch, sample, packs, questions };
}

/** 5b-2: the questions an operator must answer for this review (its `keys`), for the platform review screen. */
export async function reviewQuestions(deps: { db: Db; packs: PackLoader }, reviewId: string): Promise<{ key: string; question: DecisionQuestion }[]> {
  const { rev, questions } = await reviewContext(deps, reviewId);
  return rev.keys.filter((k) => questions[k]).map((k) => ({ key: k, question: questions[k]! }));
}
```

3. In `humanAnswer`, change the three `throw new Error(...)` to `throw new ToolError('invalid_input', ...)` with the same text.
4. In `resolveDecisionReview`:
   - Replace its opening block (from `const [rev] = …` through the `questions` constant) with `const { ch, sample, packs, questions } = await reviewContext(deps, reviewId);`.
   - The unknown-question error becomes `ToolError('invalid_input', …)`, same text.
   - Delete the outer `const [link] = …` / `const eventId = …` lines.
   - At the very top of the `db.transaction` callback, insert the claim, the lock and the link read below, and start the existing branch locals from them:

```ts
    // 5b-2 decision 3 (3d carry-over): claim the review first, then lock the change and re-check it — a concurrent resolve
    // loses here, and a supersede that commits after reviewContext() can no longer relink a superseded change.
    const claimed = await tx
      .update(decisionReview)
      .set({ resolvedAt: new Date(), resolvedBy: input.resolvedBy, resolution: input.answers })
      .where(and(eq(decisionReview.id, reviewId), isNull(decisionReview.resolvedAt)))
      .returning({ id: decisionReview.id });
    if (claimed.length === 0) throw new ToolError('invalid_input', `decision_review ${reviewId} is already resolved`);
    const [locked] = await tx.select({ status: detectedChange.status }).from(detectedChange).where(eq(detectedChange.id, ch.id)).for('update');
    if (!locked || CLOSED_CHANGE_STATUSES.includes(locked.status)) {
      throw new ToolError('invalid_input', `decision_review ${reviewId}: detected_change ${ch.id} was superseded or suppressed while it was being resolved; nothing to resolve`);
    }
    const [link] = await tx
      .select({ eventId: eventChange.eventId })
      .from(eventChange)
      .innerJoin(changeEvent, eq(changeEvent.id, eventChange.eventId))
      .where(and(eq(eventChange.changeId, ch.id), isNull(changeEvent.retractedAt)))
      .limit(1);
    let action: ResolveAction = 'unchanged';
    let newEventId: string | null = link?.eventId ?? null;
    let labels = 0;
```

   - **Delete** the trailing `await tx.update(decisionReview).set({ resolvedAt: … })` — the claim did it.
   - The web/structured branches and the sample-label loop stay as they are.
   - `webRow`/`embedding` stay loaded before the transaction (they need the pool Db).
   - The final `scoreEvent` call and return value are unchanged.

Run the whole `resolve.test.ts` file. Every 3d test must still pass, including "supersedePriorChanges closes the open reviews" and "works without a sample".

- [ ] **Step 4: Implement the tools**

`packages/tools/src/deps.ts` — add to `ToolDeps`:

```ts
  /** 5b-2 decision 2: lower-cased emails allowed to use the platform model-ops queues (PLATFORM_ADMIN_EMAILS). */
  platformAdmins?: readonly string[];
```

`packages/tools/src/platform.ts`:

```ts
import { type AccessContext, ToolError } from '@cs/core';
import { sql } from 'drizzle-orm';
import type { ToolDeps } from './deps';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "A@b.co, c@d.co" → ['a@b.co', 'c@d.co']; drops blanks, malformed entries and duplicates. */
export function normalizeAdminEmails(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
}

/** Decision 2: a signed-in user (never an email-link guest) whose account email is listed in PLATFORM_ADMIN_EMAILS. */
export async function isPlatformOperator(deps: Pick<ToolDeps, 'service' | 'platformAdmins'>, ctx: AccessContext): Promise<boolean> {
  const admins = deps.platformAdmins ?? [];
  if (admins.length === 0 || ctx.userId.startsWith('contact:')) return false;
  const rows = [...(await deps.service.execute<{ email: string }>(sql`select email from auth."user" where id = ${ctx.userId}`))];
  const email = rows[0]?.email?.toLowerCase();
  return email !== undefined && admins.includes(email);
}

export async function requirePlatformOperator(deps: Pick<ToolDeps, 'service' | 'platformAdmins'>, ctx: AccessContext): Promise<void> {
  if (!(await isPlatformOperator(deps, ctx))) throw new ToolError('permission_denied', 'Platform operators only');
}
```

`schemas.ts`:

```ts
export const ReviewQuestionView = z.object({
  key: z.string(), type: z.enum(['noul', 'choice', 'score']), instructions: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })), modelAnswer: z.string().nullable(), confidence: z.number().nullable(),
});
export const DecisionReviewView = z.object({
  id: uuid, createdAt: iso, competitorName: z.string(), source: z.string(), kind: z.string(), beforeText: z.string().nullable(), afterText: z.string().nullable(),
  questions: z.array(ReviewQuestionView),
});
export type DecisionReviewView = z.infer<typeof DecisionReviewView>;
```

`packages/tools/src/tools/model-ops.ts`:

```ts
import type { DecisionQuestion } from '@cs/ai';
import { toolkit, ToolError } from '@cs/core';
import { listOpenReviews, resolveDecisionReview, reviewQuestions } from '@cs/engine';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { DecisionReviewView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const TEXT_MAX = 2000;
const clip = (t: string | null) => (t === null ? null : t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX)}…` : t);

function options(q: DecisionQuestion): { value: string; label: string }[] {
  if (q.type === 'noul') return [{ value: 'true', label: q.criteria?.true ?? 'Yes' }, { value: 'false', label: q.criteria?.false ?? 'No' }];
  if (q.type === 'choice') return Object.entries(q.options).map(([value, label]) => ({ value, label }));
  return q.levels.map((label, i) => ({ value: String(i), label }));
}

export const listDecisionReviews = defineTool({
  name: 'list_decision_reviews',
  description: 'Platform operators: model decisions below the confidence threshold, waiting for a human answer (oldest first).',
  input: z.object({}),
  output: z.object({ items: z.array(DecisionReviewView) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    await requirePlatformOperator(deps, ctx);
    const open = await listOpenReviews(deps.service, 50);
    const items: z.input<typeof DecisionReviewView>[] = [];
    for (const r of open) {
      let qs: Awaited<ReturnType<typeof reviewQuestions>>;
      try {
        qs = await reviewQuestions({ db: deps.service, packs: packsOf(deps) }, r.id);
      } catch (e) {
        if (e instanceof ToolError) continue; // resolved or superseded between the list and this read
        throw e;
      }
      const said = r.answers as Record<string, { value?: unknown; confidence?: number } | undefined>;
      items.push({
        id: r.id, createdAt: r.createdAt.toISOString(), competitorName: r.competitorName, source: r.source, kind: r.kind, beforeText: clip(r.beforeText), afterText: clip(r.afterText),
        questions: qs.map(({ key, question }) => ({
          key, type: question.type, instructions: question.instructions, options: options(question),
          modelAnswer: said[key]?.value === undefined ? null : String(said[key]!.value), confidence: said[key]?.confidence ?? null,
        })),
      });
    }
    return { items };
  },
});

export const resolveDecisionReviewTool = defineTool({
  name: 'resolve_decision_review',
  description: 'Platform operators: answer a waiting model decision; the change, its event and the gold labels are updated.',
  input: z.object({
    reviewId: z.string().uuid(),
    answers: z.record(z.string().max(80), z.string().max(80)).refine((a) => Object.keys(a).length > 0 && Object.keys(a).length <= 20, 'Answer at least one question'),
  }),
  output: z.object({ action: z.enum(['created', 'updated', 'detached', 'retracted', 'unchanged']), eventId: z.string().uuid().nullable(), labels: z.number().int() }),
  permission: 'agency',
  async handler(ctx, { reviewId, answers }, deps) {
    await requirePlatformOperator(deps, ctx);
    return resolveDecisionReview({ db: deps.service, packs: packsOf(deps) }, reviewId, { answers, resolvedBy: ctx.userId });
  },
});

export const modelOpsTools = [listDecisionReviews, resolveDecisionReviewTool];
```

Final wiring:
- `@cs/ai` must be a dependency of `@cs/tools` for the type import. If it isn't, add `"@cs/ai": "workspace:*"` and run `pnpm install`.
- Append `...modelOpsTools` to `all.ts`.
- Add `export * from './platform';` to `index.ts`.

`apps/web/src/server/env.ts`:
- Add `/** 5b-2 decision 2: emails of platform operators (lower-cased). */ platformAdmins: string[];` to `WebEnv`.
- Add `platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS),` to `parsed` (import from `@cs/tools`).

`apps/web/src/server/tools.ts`: pass `platformAdmins: webEnv().platformAdmins` into `createToolRegistry`.

`apps/web/playwright.config.ts`: add `PLATFORM_ADMIN_EMAILS: 'admin@e2e.test'` to `webServer.env` (Task 18 uses it).

Update every `WebEnv` literal in tests (`grep -rn "webMonitoring: false" apps/web/src`) to include `platformAdmins: []`.

- [ ] **Step 5: Run tests and typecheck** — the Step 2 commands → PASS; `pnpm --filter @cs/engine typecheck && pnpm --filter @cs/tools typecheck && pnpm --filter @cs/web typecheck` clean. Also run `pnpm --filter @cs/worker typecheck` (the `decisions` CLI calls `resolveDecisionReview`; it prints `err.message`, unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/engine packages/tools apps/web pnpm-lock.yaml
git commit -m "feat(tools,engine): platform-operator decision-review queue; resolveDecisionReview claims and locks inside its transaction"
```

---

### Task 8: Theme proposal tools

**Files:**
- Create: `packages/tools/src/tools/themes.ts`, `packages/tools/src/tools/themes.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: `decideThemeProposal` (`@cs/engine`); `themeProposal`, `review` (`@cs/db`); `requirePlatformOperator` (Task 7).
- Produces: `ThemeProposalView = { id, verticalId, verticalName, themeId, name, description, status: 'proposed' | 'approved' | 'rejected', otherCount, createdAt, decidedAt: string | null, samples: string[] }`; tools `list_theme_proposals({})` → `{ pending: ThemeProposalView[], decided: ThemeProposalView[] }`, `decide_theme_proposal({ proposalId, decision: 'approved' | 'rejected' })` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test** (`themes.test.ts`)

```ts
import { createAccessContext } from '@cs/core';
import { review, themeProposal } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
let proposalId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
  const [rv] = await dbs.service.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: 'k1', rating: 2, text: 'They charged a trip fee nobody mentioned.' }).returning();
  const [p] = await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'hidden_fees', name: 'Hidden fees', description: 'Unexpected trip or diagnostic fees', otherCount: 14, sampleReviewIds: [rv!.id] }).returning();
  proposalId = p!.id;
});

describe('theme proposals (Review Focus 2)', () => {
  it('lists pending proposals with sample reviews', async () => {
    const r = (await registry.invoke(op, 'list_theme_proposals', {})) as { pending: { id: string; verticalName: string; samples: string[] }[]; decided: unknown[] };
    expect(r.pending).toEqual([expect.objectContaining({ id: proposalId, verticalName: 'HVAC & Plumbing', samples: ['They charged a trip fee nobody mentioned.'] })]);
    expect(r.decided).toEqual([]);
  });

  it('approves once; a second decision is invalid_input; non-operators are refused', async () => {
    await expect(registry.invoke(admin, 'decide_theme_proposal', { proposalId, decision: 'approved' })).rejects.toMatchObject({ code: 'permission_denied' });
    await registry.invoke(op, 'decide_theme_proposal', { proposalId, decision: 'approved' });
    const [row] = await dbs.owner.select().from(themeProposal).where(eq(themeProposal.id, proposalId));
    expect(row).toMatchObject({ status: 'approved', decidedBy: 'op' });
    await expect(registry.invoke(op, 'decide_theme_proposal', { proposalId, decision: 'rejected' })).rejects.toMatchObject({ code: 'invalid_input' });
    const r = (await registry.invoke(op, 'list_theme_proposals', {})) as { pending: unknown[]; decided: { id: string; status: string }[] };
    expect(r.pending).toEqual([]);
    expect(r.decided[0]).toMatchObject({ id: proposalId, status: 'approved' });
  });
});
```

(If the `review` insert misses a NOT NULL column, copy them from `packages/db/src/schema/sources.ts`.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/themes.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`schemas.ts`:

```ts
export const ThemeProposalView = z.object({
  id: uuid, verticalId: z.string(), verticalName: z.string(), themeId: z.string(), name: z.string(), description: z.string(),
  status: z.enum(['proposed', 'approved', 'rejected']), otherCount: z.number().int(), createdAt: iso, decidedAt: iso.nullable(), samples: z.array(z.string()),
});
export type ThemeProposalView = z.infer<typeof ThemeProposalView>;
```

`themes.ts`:

```ts
import { toolkit, ToolError } from '@cs/core';
import { review, themeProposal } from '@cs/db';
import { decideThemeProposal } from '@cs/engine';
import { listVerticalPacks } from '@cs/verticals';
import { and, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { ThemeProposalView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const SAMPLE_CHARS = 300;

export const listThemeProposals = defineTool({
  name: 'list_theme_proposals',
  description: 'Platform operators: new review topics the model proposes per business type, and recent decisions.',
  input: z.object({}),
  output: z.object({ pending: z.array(ThemeProposalView), decided: z.array(ThemeProposalView) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    await requirePlatformOperator(deps, ctx);
    const since = new Date(Date.now() - 30 * 86_400_000);
    // 'none' rows (the model found nothing) are never listed.
    const rows = await deps.service
      .select()
      .from(themeProposal)
      .where(or(eq(themeProposal.status, 'proposed'), and(inArray(themeProposal.status, ['approved', 'rejected']), gte(themeProposal.decidedAt, since))))
      .orderBy(desc(themeProposal.createdAt))
      .limit(50);
    const sampleIds = [...new Set(rows.flatMap((r) => r.sampleReviewIds.slice(0, 3)))];
    const texts = sampleIds.length ? await deps.service.select({ id: review.id, text: review.text }).from(review).where(inArray(review.id, sampleIds)) : [];
    const textOf = new Map(texts.map((t) => [t.id, t.text ?? '']));
    const names = new Map(await Promise.all((await listVerticalPacks()).map(async (id) => [id, (await packsOf(deps)(id)).name] as const)));
    const toView = (r: (typeof rows)[number]) => ({
      id: r.id, verticalId: r.verticalId, verticalName: names.get(r.verticalId) ?? r.verticalId, themeId: r.themeId, name: r.name, description: r.description,
      status: r.status as 'proposed' | 'approved' | 'rejected', otherCount: r.otherCount, createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
      samples: r.sampleReviewIds.slice(0, 3).map((id) => textOf.get(id)).filter((t): t is string => Boolean(t)).map((t) => (t.length > SAMPLE_CHARS ? `${t.slice(0, SAMPLE_CHARS)}…` : t)),
    });
    return { pending: rows.filter((r) => r.status === 'proposed').map(toView), decided: rows.filter((r) => r.status !== 'proposed').map(toView) };
  },
});

export const decideThemeProposalTool = defineTool({
  name: 'decide_theme_proposal',
  description: 'Platform operators: approve or reject a proposed review topic.',
  input: z.object({ proposalId: z.string().uuid(), decision: z.enum(['approved', 'rejected']) }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { proposalId, decision }, deps) {
    await requirePlatformOperator(deps, ctx);
    try {
      await decideThemeProposal(deps.service, proposalId, decision, ctx.userId);
    } catch (e) {
      if (e instanceof Error && /not awaiting a decision/.test(e.message)) throw new ToolError('invalid_input', 'This proposal was already decided');
      throw e;
    }
    return { ok: true as const };
  },
});

export const themeTools = [listThemeProposals, decideThemeProposalTool];
```

Append `...themeTools` to `all.ts`.

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/tools typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): platform-operator theme proposal list and decision"
```

---

### Task 9: Platform operator screens

**Files:**
- Create: `apps/web/src/app/(app)/platform/reviews/{page.tsx,actions.ts,review-queue.tsx,review-queue.test.tsx}`, `apps/web/src/app/(app)/platform/themes/{page.tsx,actions.ts,theme-queue.tsx,theme-queue.test.tsx}`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`, `apps/web/src/server/nav.ts`, `apps/web/src/server/nav.test.ts`, `apps/web/src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `list_decision_reviews`, `resolve_decision_review` (Task 7); `list_theme_proposals`, `decide_theme_proposal` (Task 8); `WebEnv.platformAdmins`.
- Produces: `NavRoleFlags.isPlatformOperator?: boolean`; `navFlagsFor(v, platformAdmins: readonly string[] = [])`; account-group items `/platform/reviews` ("Model reviews", icon `reviews`) and `/platform/themes` ("Theme proposals", icon `themes`), only when `isPlatformOperator`.

- [ ] **Step 1: Write the failing tests**

`review-queue.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewQueue } from './review-queue';

const item = {
  id: 'r1', createdAt: '2026-10-07T00:00:00.000Z', competitorName: 'Smith HVAC', source: 'web', kind: 'added', beforeText: null, afterText: 'Now offering duct cleaning',
  questions: [{ key: 'meaningful', type: 'noul' as const, instructions: 'Is this a meaningful business change?', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], modelAnswer: 'false', confidence: 0.2 }],
};

describe('ReviewQueue', () => {
  it('shows the change and the model’s guess, posts the answers, and keeps the result after the item leaves', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Resolved — a new event was created.' }));
    const { rerender } = render(<ReviewQueue items={[item]} action={action} />);
    expect(screen.getByText('Now offering duct cleaning')).toBeTruthy();
    expect(screen.getByText(/model said: No \(20%\)/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Is this a meaningful business change?'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(screen.getByText('Resolved — a new event was created.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('reviewId'), fd.get('q:meaningful')]).toEqual(['r1', 'true']);
    rerender(<ReviewQueue items={[]} action={action} />);
    expect(screen.getByText('Resolved — a new event was created.')).toBeTruthy();
    expect(screen.getByText(/nothing waiting/i)).toBeTruthy();
  });
});
```

`theme-queue.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeQueue } from './theme-queue';

const p = { id: 'p1', verticalId: 'hvac_plumbing', verticalName: 'HVAC & Plumbing', themeId: 'hidden_fees', name: 'Hidden fees', description: 'Unexpected fees', status: 'proposed' as const, otherCount: 14, createdAt: '2026-10-07T00:00:00.000Z', decidedAt: null, samples: ['They charged a trip fee.'] };

describe('ThemeQueue', () => {
  it('approves a proposal and keeps the message after it moves to the decided list', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Approved “Hidden fees”.' }));
    const { rerender } = render(<ThemeQueue pending={[p]} decided={[]} action={action} />);
    expect(screen.getByText('They charged a trip fee.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve Hidden fees' }));
    await waitFor(() => expect(screen.getByText('Approved “Hidden fees”.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('proposalId'), fd.get('decision'), fd.get('name')]).toEqual(['p1', 'approved', 'Hidden fees']);
    rerender(<ThemeQueue pending={[]} decided={[{ ...p, status: 'approved', decidedAt: '2026-10-07T01:00:00.000Z' }]} action={action} />);
    expect(screen.getByText('Approved “Hidden fees”.')).toBeTruthy();
  });
});
```

Add to `sidebar-nav.test.tsx`:

```tsx
it('shows the platform queues only to platform operators', () => {
  pathname = '/agency';
  const { rerender } = render(<SidebarNav flags={agencyAdmin} />);
  expect(screen.queryByRole('link', { name: 'Model reviews' })).toBeNull();
  rerender(<SidebarNav flags={{ ...agencyAdmin, isPlatformOperator: true }} />);
  expect(screen.getByRole('link', { name: 'Model reviews' }).getAttribute('href')).toBe('/platform/reviews');
  expect(screen.getByRole('link', { name: 'Theme proposals' }).getAttribute('href')).toBe('/platform/themes');
});
```

Add to `server/nav.test.ts` (read it for its viewer fixtures first — the names below are placeholders for whatever user/guest viewers it defines; give the user one an `email` if it lacks it):

```ts
it('flags platform operators by their signed-in email, never guests', () => {
  expect(navFlagsFor(userViewer, ['owner@e.co']).isPlatformOperator).toBe(false);
  expect(navFlagsFor({ ...userViewer, email: 'Owner@E.co' }, ['owner@e.co']).isPlatformOperator).toBe(true);
  expect(navFlagsFor(guestViewer, ['owner@e.co']).isPlatformOperator).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/platform" src/components/shell/sidebar-nav.test.tsx src/server/nav.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`nav-items.ts`:
- `NavRoleFlags` gains `/** 5b-2 decision 2. */ isPlatformOperator?: boolean;`.
- The `icon` union gains `'reviews' | 'themes'`.
- At the end of `navItemsFor` (after the notifications item):

```ts
  if (flags.isPlatformOperator) {
    account('/platform/reviews', 'Model reviews', 'reviews');
    account('/platform/themes', 'Theme proposals', 'themes');
  }
```

`sidebar-nav.tsx`: `ICONS.reviews = Scale`, `ICONS.themes = Tags` (`lucide-react`).

`server/nav.ts`:

```ts
export function navFlagsFor(v: { kind: 'user' | 'guest'; ctx: AccessContext; email?: string }, platformAdmins: readonly string[] = []): NavRoleFlags {
  const isPlatformOperator = v.kind === 'user' && !!v.email && platformAdmins.includes(v.email.toLowerCase());
  return { isAgency: isAgencyRole(v.ctx.role), isAgencyAdmin: v.ctx.role === 'agency_admin', isUser: v.kind === 'user', homePath: homePath(v.ctx), isPlatformOperator };
}
```

`navFor` takes the same optional second argument and passes it through. In `(app)/layout.tsx`, use `flags={navFlagsFor(viewer, webEnv().platformAdmins)}` (import `webEnv` from `@/server/env`). The nav flag only hides links — the tools are the real gate.

`platform/reviews/actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const DONE: Record<string, string> = {
  created: 'Resolved — a new event was created.', updated: 'Resolved — the event was updated and re-scored.', detached: 'Resolved — the change was detached from its event.',
  retracted: 'Resolved — the event was withdrawn.', unchanged: 'Resolved.',
};

export async function resolveReviewAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const answers: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith('q:') && String(v)) answers[k.slice(2)] = String(v);
  const r = await runTool<{ action: string }>(ctx, 'resolve_decision_review', { reviewId: String(fd.get('reviewId') ?? ''), answers });
  if (!r.ok) return r;
  revalidatePath('/platform/reviews');
  return { ok: true, message: DONE[r.data.action] ?? 'Resolved.' };
}
```

`platform/reviews/review-queue.tsx`:

```tsx
'use client';
import type { DecisionReviewView } from '@cs/tools';
import { Button } from '@cs/ui';
import { type FormEvent, useState, useTransition } from 'react';
import type { FormResult } from '@/server/forms';

const selectClass = 'h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/** The result lives here, above the items, because a resolved item disappears on revalidate (HANDOVER §6). */
export function ReviewQueue({ items, action }: { items: DecisionReviewView[]; action: Action }) {
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [pending, startTransition] = useTransition();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => setResult(await action({ ok: true }, fd)));
  };
  return (
    <div className="flex flex-col gap-5">
      {!result.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{result.error}</p>}
      {result.ok && result.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{result.message}</p>}
      {items.length === 0 && <p className="text-muted-foreground">Nothing waiting for review.</p>}
      {items.map((item) => (
        <form key={item.id} onSubmit={submit} className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
          <input type="hidden" name="reviewId" value={item.id} />
          <div className="text-sm text-muted-ink">{item.competitorName} · {item.source} · {item.kind} · {item.createdAt.slice(0, 10)}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><div className="text-xs font-semibold uppercase text-muted-ink">Before</div><pre className="whitespace-pre-wrap rounded-lg bg-muted-surface p-3 text-sm">{item.beforeText ?? '—'}</pre></div>
            <div><div className="text-xs font-semibold uppercase text-muted-ink">After</div><pre className="whitespace-pre-wrap rounded-lg bg-muted-surface p-3 text-sm">{item.afterText ?? '—'}</pre></div>
          </div>
          {item.questions.map((q) => {
            const id = `${item.id}-${q.key}`;
            const said = q.options.find((o) => o.value === q.modelAnswer)?.label ?? q.modelAnswer;
            return (
              <div key={q.key} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-sm font-semibold">{q.instructions}</label>
                <select id={id} name={`q:${q.key}`} required defaultValue="" className={selectClass}>
                  <option value="" disabled>Choose…</option>
                  {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {said !== null && <span className="text-xs text-muted-ink">Model said: {said}{q.confidence !== null ? ` (${Math.round(q.confidence * 100)}%)` : ''}</span>}
              </div>
            );
          })}
          <Button type="submit" disabled={pending} className="self-start">Resolve</Button>
        </form>
      ))}
    </div>
  );
}
```

`platform/reviews/page.tsx`:

```tsx
import type { DecisionReviewView } from '@cs/tools';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { resolveReviewAction } from './actions';
import { ReviewQueue } from './review-queue';

export const dynamic = 'force-dynamic';

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function ModelReviewsPage() {
  const { ctx } = await requireContext();
  const { items } = await callTool<{ items: DecisionReviewView[] }>(ctx, 'list_decision_reviews', {});
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Model reviews</h1>
      <p className="text-muted-foreground">Decisions the models weren’t sure about. Your answer fixes the event and becomes a gold label.</p>
      <ReviewQueue items={items} action={resolveReviewAction} />
    </>
  );
}
```

`platform/themes/actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function decideThemeAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const decision = String(fd.get('decision') ?? '');
  const r = await runTool(ctx, 'decide_theme_proposal', { proposalId: String(fd.get('proposalId') ?? ''), decision });
  if (!r.ok) return r;
  revalidatePath('/platform/themes');
  const name = String(fd.get('name') ?? 'the topic');
  return { ok: true, message: decision === 'approved' ? `Approved “${name}”.` : `Rejected “${name}”.` };
}
```

`platform/themes/theme-queue.tsx`:

```tsx
'use client';
import type { ThemeProposalView } from '@cs/tools';
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { type FormEvent, useState, useTransition } from 'react';
import type { FormResult } from '@/server/forms';

type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

export function ThemeQueue({ pending, decided, action }: { pending: ThemeProposalView[]; decided: ThemeProposalView[]; action: Action }) {
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [busy, startTransition] = useTransition();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(async () => setResult(await action({ ok: true }, fd)));
  };
  return (
    <div className="flex flex-col gap-5">
      {!result.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{result.error}</p>}
      {result.ok && result.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{result.message}</p>}
      {pending.length === 0 && <p className="text-muted-foreground">No proposals waiting.</p>}
      {pending.map((p) => (
        <form key={p.id} onSubmit={submit} className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
          <input type="hidden" name="proposalId" value={p.id} />
          <input type="hidden" name="name" value={p.name} />
          <div className="text-sm text-muted-ink">{p.verticalName} · {p.otherCount} unthemed reviews</div>
          <h3 className="text-lg font-bold">{p.name} <span className="font-mono text-xs text-muted-ink">{p.themeId}</span></h3>
          <p>{p.description}</p>
          {p.samples.length > 0 && <ul className="flex flex-col gap-1 text-sm">{p.samples.map((s, i) => <li key={i} className="rounded-lg bg-muted-surface p-2">“{s}”</li>)}</ul>}
          <div className="flex gap-2">
            <Button type="submit" name="decision" value="approved" aria-label={`Approve ${p.name}`} disabled={busy}>Approve</Button>
            <Button type="submit" name="decision" value="rejected" variant="outline" aria-label={`Reject ${p.name}`} disabled={busy}>Reject</Button>
          </div>
        </form>
      ))}
      {decided.length > 0 && (
        <section className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="mb-3 font-bold">Recently decided</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Topic</TableHead><TableHead>Business type</TableHead><TableHead>Decision</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {decided.map((d) => (
                <TableRow key={d.id}><TableCell>{d.name}</TableCell><TableCell>{d.verticalName}</TableCell><TableCell><Badge variant={d.status === 'approved' ? 'default' : 'outline'}>{d.status}</Badge></TableCell><TableCell>{d.decidedAt?.slice(0, 10) ?? '—'}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
```

jsdom's `FormData(form, submitter)` support: if the test fails because jsdom ignores the submitter, append it manually instead — `const fd = new FormData(e.currentTarget); if (submitter?.name) fd.set(submitter.name, submitter.value);`.

`platform/themes/page.tsx`: same as the reviews page, with `callTool<{ pending: ThemeProposalView[]; decided: ThemeProposalView[] }>(ctx, 'list_theme_proposals', {})`. Title "Theme proposals"; subtitle "New review topics found in reviews that didn’t fit any existing topic. Approved topics are asked for every review analysed from now on." Then `<ThemeQueue pending={…} decided={…} action={decideThemeAction} />`.

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): platform-operator model review and theme proposal screens"
```

---

### Task 10: No recurring work for prospects

**Files:**
- Modify: `packages/collectors/src/sources/due.ts`, `packages/collectors/src/sources/due.test.ts`, `packages/collectors/src/schedule/due-pages.ts`, `packages/collectors/src/schedule/due-pages.test.ts`, `packages/collectors/src/local/self.ts`, `packages/collectors/src/local/self.test.ts`, `packages/collectors/src/rankings/scan.ts`, `packages/collectors/src/rankings/scan.test.ts`, `packages/engine/src/sweep.ts`, `packages/engine/src/score/score-stage.ts`, `packages/engine/src/score/score-stage.test.ts`, `packages/engine/src/moves/moves-stage.ts`, `packages/engine/src/moves/moves-stage.test.ts`, `packages/engine/src/briefs/generate.ts`, `packages/engine/src/briefs/generate.test.ts`, `packages/engine/src/reports/quarterly.ts`, `packages/engine/src/reports/quarterly.test.ts`, `apps/worker/src/deps.ts`, `packages/tools/src/tools/portfolio.test.ts`

**Interfaces:**
- Consumes: `client.status` (Task 1).
- Produces: `listRankClients(db: Db): Promise<string[]>` exported from `@cs/collectors` (`rankings/scan.ts`), used by the worker's `listRankClients`. Every scheduler listed in decision 9 ignores prospects.

- [ ] **Step 1: Write the failing tests**

Each test sets `IDS.clientA2` to `prospect`. In `seedTenancy`, A2 is the **only** client tracking `competitorY`; A1 and B1 (active) track `competitorX`. Add `client`/`competitor`/`eq` imports where a file lacks them.

`packages/collectors/src/sources/due.test.ts`:

```ts
it('never claims a competitor only prospects track, nor a prospect’s own business; resumes on convert (5b-2 decision 9)', async () => {
  await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  const [self] = await dbs.owner.insert(competitor).values({ name: 'A2 Dental', placeId: 'ChIJprospectSelf01' }).returning();
  await dbs.owner.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, IDS.clientA2));
  await ensureCompetitorSources(dbs.service, IDS.competitorX);
  await ensureCompetitorSources(dbs.service, IDS.competitorY);
  await ensureCompetitorSources(dbs.service, self!.id, ['gbp', 'reviews']);
  expect(new Set((await claimDueSources(dbs.service, 100)).map((c) => c.competitorId))).toEqual(new Set([IDS.competitorX]));
  await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientA2));
  expect(new Set((await claimDueSources(dbs.service, 100)).map((c) => c.competitorId))).toEqual(new Set([IDS.competitorY, self!.id]));
});
```

`packages/collectors/src/schedule/due-pages.test.ts`:

```ts
it('skips pages of competitors only prospects track (5b-2 decision 9)', async () => {
  await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  const [x] = await dbs.service.insert(trackedPage).values({ competitorId: IDS.competitorX, url: 'https://smithhvac.example/', pageType: 'home' }).returning();
  await dbs.service.insert(trackedPage).values({ competitorId: IDS.competitorY, url: 'https://brightsmiles.example/', pageType: 'home' });
  expect(await claimDuePages(dbs.service, 10)).toEqual([x!.id]);
});
```

(Copy any extra NOT NULL `tracked_page` columns from the file's existing inserts.)

`packages/collectors/src/local/self.test.ts`:

```ts
it('does not link a prospect’s own business on the schedule tick (5b-2 decision 9)', async () => {
  await dbs.owner.update(client).set({ status: 'prospect', placeId: 'ChIJprospectSelf02' }).where(eq(client.id, IDS.clientA2));
  expect(await ensureSelfCompetitors(dbs.service)).toBe(0);
  const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA2));
  expect(c!.selfCompetitorId).toBeNull();
});
```

`packages/collectors/src/rankings/scan.test.ts`:

```ts
it('lists active clients with keywords and a service area for the monthly scan (5b-2 decision 9)', async () => {
  const area = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
  await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.update(client).set({ keywords: ['dentist'], serviceArea: area, status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  expect(await listRankClients(dbs.service)).toEqual([IDS.clientA1]);
});
```

`packages/engine/src/score/score-stage.test.ts` (import `findEngineWork` from `../sweep`; reuse the file's pack loader / deps names):

```ts
it('never scores an event for a prospect and the sweep never offers it (5b-2 decision 9)', async () => {
  await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  const [ev] = await dbs.service
    .insert(changeEvent)
    .values({ competitorId: IDS.competitorY, changeType: 'promo', channels: ['web'], summary: 'Bright Smiles started a promo', confidence: 0.9, occurredAt: new Date() })
    .returning();
  expect((await findEngineWork(dbs.service, { limit: 50 })).score).not.toContain(ev!.id);
  expect((await scoreEvent({ db: dbs.service, packs: createPackLoader() }, ev!.id)).scored).toBe(0);
});
```

`packages/engine/src/moves/moves-stage.test.ts`:

```ts
it('lists only active clients for the nightly moves run (5b-2 decision 9)', async () => {
  await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  const ids = await listMoveClients(dbs.service);
  expect(ids).toContain(IDS.clientA1);
  expect(ids).not.toContain(IDS.clientA2);
});
```

`packages/engine/src/briefs/generate.test.ts`:

```ts
it('never schedules a brief for a prospect (5b-2 decision 9)', async () => {
  await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  // Thursday 2026-10-08 23:00 in Chicago — inside the brief window for every client in the default time zone.
  const due = await listBriefDueClients(dbs.service, new Date('2026-10-09T04:00:00Z'));
  expect(due).toContain(IDS.clientA1);
  expect(due).not.toContain(IDS.clientA2);
});
```

`packages/engine/src/reports/quarterly.test.ts`: find the case that asserts a report is created for a client in the first week of a quarter. Copy it, set that client to `prospect` first, and assert `created` is empty for it.

`packages/tools/src/tools/portfolio.test.ts`:

```ts
it('leaves prospects off the portfolio (5b-2 decision 9)', async () => {
  await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  const { items } = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string }[] };
  expect(items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
});
```

(Use the file's admin ctx name. Task 3 already added the filter; this test pins it.)

- [ ] **Step 2: Run to verify failure**

Run:
- `pnpm --filter @cs/collectors exec vitest run src/sources/due.test.ts src/schedule/due-pages.test.ts src/local/self.test.ts src/rankings/scan.test.ts`
- `pnpm --filter @cs/engine exec vitest run src/score/score-stage.test.ts src/moves/moves-stage.test.ts src/briefs/generate.test.ts src/reports/quarterly.test.ts`

Both → FAIL (the portfolio test already passes).

- [ ] **Step 3: Implement**

`packages/collectors/src/sources/due.ts`:
- Update the doc comment: "…untracked competitors — and competitors only prospects track (5b-2 decision 9) — are skipped…".
- Replace the inner `AND (EXISTS …)` block with:

```sql
          AND (EXISTS (SELECT 1 FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
                        WHERE cc.competitor_id = cs.competitor_id AND cl.status = 'active')
               OR (cs.source IN ('gbp', 'reviews') AND EXISTS (SELECT 1 FROM client c WHERE c.self_competitor_id = cs.competitor_id AND c.status = 'active')))
```

`packages/collectors/src/schedule/due-pages.ts` — replace the `EXISTS` line with:

```sql
          AND EXISTS (SELECT 1 FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
                       WHERE cc.competitor_id = tp.competitor_id AND cl.status = 'active')
```

`packages/collectors/src/local/self.ts` — `ensureSelfCompetitors`' where becomes `and(isNotNull(client.placeId), isNull(client.selfCompetitorId), eq(client.status, 'active'))` (import `eq`). `ensureSelfCompetitor` (single client) is unchanged — the prospect snapshot calls it directly.

`packages/collectors/src/rankings/scan.ts` — add (import `client` and `sql` if missing):

```ts
/** Clients due a monthly rank scan: active (5b-2 decision 9), with a service area and at least one keyword. */
export async function listRankClients(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: client.id })
    .from(client)
    .where(sql`${client.serviceArea} IS NOT NULL AND jsonb_array_length(${client.keywords}) > 0 AND ${client.status} = 'active'`);
  return rows.map((r) => r.id);
}
```

`apps/worker/src/deps.ts`: replace the body of `listRankClients()` with `return listRankClients(getDb());` (import from `@cs/collectors`; rename the import if it clashes with the method name, e.g. `import { listRankClients as rankClients } from '@cs/collectors'`).

`packages/engine/src/sweep.ts` — in the score query, after the `verticalId` line add:

```sql
          -- 5b-2 decision 9: prospects get no scores (so no alerts or brief content) until converted.
          AND cl.status = 'active'
```

`packages/engine/src/score/score-stage.ts` — add `eq(client.status, 'active'),` to the `and(…)` in `scoreEvent`'s client query, with the comment `// 5b-2 decision 9: never score for a prospect`.

`packages/engine/src/moves/moves-stage.ts`:

```ts
export async function listMoveClients(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: clientCompetitor.clientId })
    .from(clientCompetitor)
    .innerJoin(client, eq(client.id, clientCompetitor.clientId))
    .where(eq(client.status, 'active'));
  return rows.map((r) => r.id);
}
```

`packages/engine/src/briefs/generate.ts` — `listBriefDueClients`: `db.select({ id: client.id, timezone: client.timezone }).from(client).where(eq(client.status, 'active'))`.

`packages/engine/src/reports/quarterly.ts` — `runQuarterlyReports`' client select gains `.where(eq(client.status, 'active'))`.

Import `eq`/`client` where a file lacks them.

- [ ] **Step 4: Run tests** — the Step 2 commands plus `pnpm --filter @cs/tools exec vitest run src/tools/portfolio.test.ts` → PASS. Run each touched test file whole (not just the new case) to catch regressions in the existing cases. `pnpm --filter @cs/collectors typecheck && pnpm --filter @cs/engine typecheck && pnpm --filter @cs/worker typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add packages/collectors packages/engine packages/tools apps/worker
git commit -m "feat(collectors,engine,worker): no recurring collection, scoring, moves, briefs or reports for prospects"
```

---

### Task 11: The prospect snapshot — report builder, snapshot runner, worker job

**Files:**
- Create: `packages/collectors/src/prospect/report.ts`, `packages/collectors/src/prospect/report.test.ts`, `packages/collectors/src/prospect/snapshot.ts`, `packages/collectors/src/prospect/snapshot.test.ts`, `apps/worker/src/jobs/prospects.ts`, `apps/worker/src/jobs/prospects.test.ts`
- Modify: `packages/collectors/src/index.ts`, `apps/worker/src/deps.ts`, `apps/worker/src/main.ts`

**Interfaces:**
- Consumes:
  - `ensureSelfCompetitor` (`local/self.ts`); `scanRankings` (opts `{ gridSize, maxKeywords }`);
  - `prospectReport`, `ProspectReportData`, `ProspectBusiness`, `ProspectRank`, `RankResult`, `observation`, `ad`, `rankSnapshot`, `client`, `clientCompetitor`, `competitor` (`@cs/db`);
  - the worker's `runSource`.
- Produces:
  - `report.ts`:
    - `interface RankPoint { keyword: string; results: RankResult[] }`;
    - `summarizeRanks(points: RankPoint[], keywords: string[], who: { placeId: string | null; cid: string | null }): ProspectRank[]`;
    - `gbpSummary(data: Record<string, unknown> | null): ProspectBusiness['gbp']`;
    - `interface ReportInputBusiness { competitorId: string; name: string; self: boolean; placeId: string | null; cid: string | null; gbp: Record<string, unknown> | null; ads: { google: number | null; meta: number | null } }`;
    - `buildProspectReport(input: { generatedAt: Date; keywords: string[]; points: number; scanId: string | null; businesses: ReportInputBusiness[]; rankPoints: RankPoint[]; notes: string[] }): ProspectReportData`.
  - `snapshot.ts`:
    - `PROSPECT_GRID = 3`, `PROSPECT_KEYWORDS = 3`, `PROSPECT_STALE_HOURS = 3`;
    - `type SnapshotSource = 'gbp' | 'ads_google' | 'ads_meta'`;
    - `interface ProspectSnapshotDeps { db: Db; runSource(competitorId: string, source: SnapshotSource): Promise<{ status: string }>; scanRankings(clientId: string, opts: { gridSize: number; maxKeywords: number }): Promise<{ snapshots: number; failed: number; scanId: string | null }>; now?: () => Date }`;
    - `runProspectSnapshot(deps: ProspectSnapshotDeps, clientId: string, reportId: string): Promise<{ status: 'ready' | 'failed' }>`;
    - `failProspectReport(db: Db, reportId: string, message: string, now?: Date): Promise<void>`.
  - Worker:
    - `WorkerDeps.runProspectSnapshot(clientId: string, reportId: string): Promise<{ status: 'ready' | 'failed' }>`;
    - job `prospect-snapshot` with data `{ clientId: uuid, reportId: uuid }`, queue `{ ...SINGLE_SHOT_QUEUE, policy: 'short' }`.

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/prospect/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildProspectReport, gbpSummary, summarizeRanks } from './report';

const at = (keyword: string, ...results: { rank: number; placeId?: string; cid?: string }[]) => ({
  keyword, results: results.map((r) => ({ rank: r.rank, placeId: r.placeId ?? null, cid: r.cid ?? null, domain: null, title: 'x' })),
});

describe('summarizeRanks', () => {
  it('counts points found, points in the top 3 and the average rank where found, per keyword', () => {
    const points = [at('ac repair', { rank: 1, placeId: 'P1' }), at('ac repair', { rank: 5, placeId: 'P1' }), at('ac repair', { rank: 2, placeId: 'P2' }), at('furnace', { rank: 3, cid: 'C1' })];
    expect(summarizeRanks(points, ['ac repair', 'furnace'], { placeId: 'P1', cid: 'C1' })).toEqual([
      { keyword: 'ac repair', found: 2, top3: 1, averageRank: 3 },
      { keyword: 'furnace', found: 1, top3: 1, averageRank: 3 },
    ]);
    expect(summarizeRanks(points, ['ac repair'], { placeId: null, cid: null })).toEqual([{ keyword: 'ac repair', found: 0, top3: 0, averageRank: null }]);
  });
});

describe('gbpSummary', () => {
  it('reads rating, reviews and categories defensively', () => {
    expect(gbpSummary({ rating: 4.6, votes: 212, category: 'HVAC contractor', additionalCategories: ['Plumber', 'Electrician'] })).toEqual({ rating: 4.6, reviews: 212, category: 'HVAC contractor', extraCategories: 2 });
    expect(gbpSummary({ rating: 'x', votes: null })).toEqual({ rating: null, reviews: null, category: null, extraCategories: 0 });
    expect(gbpSummary(null)).toBeNull();
  });
});

describe('buildProspectReport', () => {
  it('puts the prospect first, then competitors by name, with no model text', () => {
    const r = buildProspectReport({
      generatedAt: new Date('2026-10-07T12:00:00Z'), keywords: ['ac repair'], points: 9, scanId: 's1', notes: [],
      rankPoints: [at('ac repair', { rank: 1, placeId: 'SELF' })],
      businesses: [
        { competitorId: 'b', name: 'Zeta Air', self: false, placeId: 'Z', cid: null, gbp: null, ads: { google: 2, meta: null } },
        { competitorId: 'a', name: 'Alpha Air', self: false, placeId: 'A', cid: null, gbp: null, ads: { google: 0, meta: 1 } },
        { competitorId: 's', name: 'Our Shop', self: true, placeId: 'SELF', cid: null, gbp: { rating: 4.9, votes: 10 }, ads: { google: null, meta: null } },
      ],
    });
    expect(r.businesses.map((b) => b.name)).toEqual(['Our Shop', 'Alpha Air', 'Zeta Air']);
    expect(r.businesses[0]!.ranks).toEqual([{ keyword: 'ac repair', found: 1, top3: 1, averageRank: 1 }]);
    expect(r).toMatchObject({ generatedAt: '2026-10-07T12:00:00.000Z', points: 9, scanId: 's1' });
  });
});
```

`packages/collectors/src/prospect/snapshot.test.ts`:

```ts
import { ad, capture, client, competitor, observation, prospectReport, rankScan, rankSnapshot } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type ProspectSnapshotDeps, runProspectSnapshot } from './snapshot';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const AREA = { center: { lat: 33.95, lng: -84.33 }, radiusKm: 10, zips: [] };
let reportId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  // A2 (dental) is the prospect; it tracks Y (Bright Smiles) only.
  await dbs.owner.update(client).set({ status: 'prospect', keywords: ['dentist'], serviceArea: AREA, placeId: 'ChIJselfProspect01' }).where(eq(client.id, IDS.clientA2));
  await dbs.owner.update(competitor).set({ placeId: 'ChIJcompetitorY001' }).where(eq(competitor.id, IDS.competitorY));
  const [r] = await dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, status: 'running' }).returning();
  reportId = r!.id;
});

async function gbp(competitorId: string, data: Record<string, unknown>) {
  const [cap] = await dbs.service.insert(capture).values({ competitorId, source: 'google_business_profile', status: 'ok', collectorVersion: 'test' }).returning();
  await dbs.service.insert(observation).values({ competitorId, captureId: cap!.id, kind: 'gbp_profile', key: 'profile', data });
}

function fakeDeps(over: Partial<ProspectSnapshotDeps> = {}): ProspectSnapshotDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    db: dbs.service,
    calls,
    async runSource(competitorId, source) {
      calls.push(`${source}:${competitorId}`);
      if (source === 'gbp') {
        await gbp(competitorId, competitorId === IDS.competitorY ? { rating: 4.4, votes: 120, category: 'Dentist', additionalCategories: ['Cosmetic dentist'] } : { rating: 4.9, votes: 31, category: 'Dentist' });
        return { status: 'ok' };
      }
      if (source === 'ads_google') {
        await dbs.service.insert(ad).values([
          { competitorId, platform: 'google', externalId: `g1-${competitorId}`, isActive: true },
          { competitorId, platform: 'google', externalId: `g2-${competitorId}`, isActive: true },
          { competitorId, platform: 'google', externalId: `g3-${competitorId}`, isActive: false },
        ]);
        return { status: 'ok' };
      }
      return { status: 'skipped' };
    },
    async scanRankings(clientId, opts) {
      calls.push(`scan:${clientId}:${opts.gridSize}x${opts.maxKeywords}`);
      const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId, status: 'done', snapshots: 9 }).returning();
      for (let i = 0; i < 9; i++) {
        const results = [
          ...(i < 3 ? [{ rank: 1, placeId: 'ChIJselfProspect01', cid: null, domain: null, title: 'A2 Dental' }] : []),
          ...(i < 5 ? [{ rank: 2, placeId: 'ChIJcompetitorY001', cid: null, domain: null, title: 'Bright Smiles' }] : []),
        ];
        await dbs.service.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId, scanId: scan!.id, keyword: 'dentist', lat: 33.9 + i / 100, lng: -84.3, results });
      }
      return { snapshots: 9, failed: 0, scanId: scan!.id };
    },
    ...over,
  };
}

const report = async () => (await dbs.owner.select().from(prospectReport).where(eq(prospectReport.id, reportId)))[0]!;

describe('runProspectSnapshot (decisions 10, 11)', () => {
  it('pulls each business once, scans 3×3 × 3 keywords, and stores a deterministic report', async () => {
    const deps = fakeDeps();
    expect(await runProspectSnapshot(deps, IDS.clientA2, reportId)).toEqual({ status: 'ready' });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA2));
    expect(deps.calls).toEqual([`gbp:${c!.selfCompetitorId}`, `gbp:${IDS.competitorY}`, `ads_google:${IDS.competitorY}`, `ads_meta:${IDS.competitorY}`, `scan:${IDS.clientA2}:3x3`]);
    const r = await report();
    expect(r.status).toBe('ready');
    expect(r.data!.businesses).toEqual([
      { competitorId: c!.selfCompetitorId, name: 'A2 Dental', self: true, gbp: { rating: 4.9, reviews: 31, category: 'Dentist', extraCategories: 0 }, ads: { google: null, meta: null }, ranks: [{ keyword: 'dentist', found: 3, top3: 3, averageRank: 1 }] },
      { competitorId: IDS.competitorY, name: 'Bright Smiles', self: false, gbp: { rating: 4.4, reviews: 120, category: 'Dentist', extraCategories: 1 }, ads: { google: 2, meta: null }, ranks: [{ keyword: 'dentist', found: 5, top3: 5, averageRank: 2 }] },
    ]);
    expect(r.data).toMatchObject({ keywords: ['dentist'], points: 9, notes: [] });
  });

  it('notes a failed source and still finishes', async () => {
    const base = fakeDeps();
    const deps = fakeDeps({ runSource: async (id, s) => { if (s === 'ads_google') throw new Error('DataForSEO 500'); return base.runSource(id, s); } });
    expect(await runProspectSnapshot(deps, IDS.clientA2, reportId)).toEqual({ status: 'ready' });
    const r = await report();
    expect(r.data!.businesses[1]!.ads.google).toBeNull();
    expect(r.data!.notes).toEqual([expect.stringMatching(/Bright Smiles: Google ads .*DataForSEO 500/)]);
  });

  it('fails cleanly for a client that is no longer a prospect, and never overwrites a report that is no longer running', async () => {
    await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientA2));
    expect(await runProspectSnapshot(fakeDeps(), IDS.clientA2, reportId)).toEqual({ status: 'failed' });
    expect(await report()).toMatchObject({ status: 'failed', error: expect.stringMatching(/no longer a prospect/) });
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    expect(await runProspectSnapshot(fakeDeps(), IDS.clientA2, reportId)).toEqual({ status: 'failed' });
    expect((await report()).status).toBe('failed');
  });
});
```

`apps/worker/src/jobs/prospects.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createProspectJobs } from './prospects';

describe('prospect-snapshot job', () => {
  it('is single-shot, deduped per client, and runs the snapshot with the job data', async () => {
    const runProspectSnapshot = vi.fn(async () => ({ status: 'ready' as const }));
    const { snapshot } = createProspectJobs({ runProspectSnapshot } as unknown as WorkerDeps);
    expect(snapshot.name).toBe('prospect-snapshot');
    expect(snapshot.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
    const data = { clientId: '00000000-0000-4000-8000-0000000000a2', reportId: '00000000-0000-4000-8000-000000000001' };
    await snapshot.handler(snapshot.schema.parse(data));
    expect(runProspectSnapshot).toHaveBeenCalledWith(data.clientId, data.reportId);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/collectors exec vitest run src/prospect` and `pnpm --filter @cs/worker exec vitest run src/jobs/prospects.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`packages/collectors/src/prospect/report.ts`:

```ts
import type { ProspectBusiness, ProspectRank, ProspectReportData, RankResult } from '@cs/db';

export interface RankPoint { keyword: string; results: RankResult[] }
export interface ReportInputBusiness {
  competitorId: string;
  name: string;
  self: boolean;
  placeId: string | null;
  cid: string | null;
  gbp: Record<string, unknown> | null;
  ads: { google: number | null; meta: number | null };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Decision 11: per keyword, grid points where the business appears, points in the top 3, and its average rank where it appears. */
export function summarizeRanks(points: RankPoint[], keywords: string[], who: { placeId: string | null; cid: string | null }): ProspectRank[] {
  const matches = (r: RankResult) => (who.placeId !== null && r.placeId === who.placeId) || (who.cid !== null && r.cid === who.cid);
  return keywords.map((keyword) => {
    const found = points.filter((p) => p.keyword === keyword).map((p) => p.results.find(matches)?.rank).filter((r): r is number => typeof r === 'number');
    return { keyword, found: found.length, top3: found.filter((r) => r <= 3).length, averageRank: found.length ? round1(found.reduce((a, b) => a + b, 0) / found.length) : null };
  });
}

/** The latest GBP observation's headline numbers (collect-gbp.ts `extractGbpProfile` shape). */
export function gbpSummary(data: Record<string, unknown> | null): ProspectBusiness['gbp'] {
  if (!data) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    rating: num(data.rating), reviews: num(data.votes), category: typeof data.category === 'string' ? data.category : null,
    extraCategories: Array.isArray(data.additionalCategories) ? data.additionalCategories.length : 0,
  };
}

/** Deterministic landscape report — no model text (owner decision). The prospect first, then competitors by name. */
export function buildProspectReport(input: {
  generatedAt: Date; keywords: string[]; points: number; scanId: string | null; businesses: ReportInputBusiness[]; rankPoints: RankPoint[]; notes: string[];
}): ProspectReportData {
  const businesses: ProspectBusiness[] = input.businesses
    .map((b) => ({ competitorId: b.competitorId, name: b.name, self: b.self, gbp: gbpSummary(b.gbp), ads: b.ads, ranks: summarizeRanks(input.rankPoints, input.keywords, b) }))
    .sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
  return { generatedAt: input.generatedAt.toISOString(), keywords: input.keywords, points: input.points, scanId: input.scanId, businesses, notes: input.notes };
}
```

(Check `RankResult` is exported from `@cs/db`; it's defined in `client-intel.ts`.)

`packages/collectors/src/prospect/snapshot.ts`:

```ts
import { ad, client, clientCompetitor, competitor, type Db, observation, prospectReport, rankSnapshot } from '@cs/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { ensureSelfCompetitor } from '../local/self';
import { buildProspectReport, type RankPoint, type ReportInputBusiness } from './report';

export const PROSPECT_GRID = 3;
export const PROSPECT_KEYWORDS = 3;
/** A `running` report older than this is shown as failed ("timed out") and may be re-run. */
export const PROSPECT_STALE_HOURS = 3;

export type SnapshotSource = 'gbp' | 'ads_google' | 'ads_meta';
export interface ProspectSnapshotDeps {
  db: Db;
  runSource(competitorId: string, source: SnapshotSource): Promise<{ status: string }>;
  scanRankings(clientId: string, opts: { gridSize: number; maxKeywords: number }): Promise<{ snapshots: number; failed: number; scanId: string | null }>;
  now?: () => Date;
}

const LABEL: Record<SnapshotSource, string> = { gbp: 'Google profile', ads_google: 'Google ads', ads_meta: 'Meta ads' };

export async function failProspectReport(db: Db, reportId: string, message: string, now = new Date()): Promise<void> {
  await db.update(prospectReport).set({ status: 'failed', error: message.slice(0, 500), finishedAt: now }).where(and(eq(prospectReport.id, reportId), eq(prospectReport.status, 'running')));
}

/** Decision 10: one GBP + ads pull per business and a 3×3 rank scan, then a deterministic report. Never throws. */
export async function runProspectSnapshot(deps: ProspectSnapshotDeps, clientId: string, reportId: string): Promise<{ status: 'ready' | 'failed' }> {
  const now = deps.now ?? (() => new Date());
  try {
    const [c] = await deps.db.select().from(client).where(eq(client.id, clientId));
    if (!c || c.status !== 'prospect') throw new Error('This business is no longer a prospect');
    const notes: string[] = [];
    const run = async (b: { id: string; name: string }, source: SnapshotSource): Promise<string> => {
      try {
        const { status } = await deps.runSource(b.id, source);
        if (status === 'vendor_error') notes.push(`${b.name}: ${LABEL[source]} unavailable from the data provider`);
        return status;
      } catch (err) {
        notes.push(`${b.name}: ${LABEL[source]} failed (${err instanceof Error ? err.message.slice(0, 120) : 'error'})`);
        return 'error';
      }
    };

    const businesses: Omit<ReportInputBusiness, 'gbp'>[] = [];
    if (c.placeId) {
      const linked = await ensureSelfCompetitor(deps.db, clientId);
      if ('competitorId' in linked) {
        await run({ id: linked.competitorId, name: c.name }, 'gbp');
        businesses.push({ competitorId: linked.competitorId, name: c.name, self: true, placeId: c.placeId, cid: null, ads: { google: null, meta: null } });
      }
    }
    const tracked = await deps.db
      .select({ id: competitor.id, name: competitor.name, placeId: competitor.placeId, cid: competitor.cid })
      .from(clientCompetitor)
      .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
      .where(eq(clientCompetitor.clientId, clientId))
      .orderBy(competitor.name);
    for (const t of tracked) {
      await run(t, 'gbp');
      const google = await run(t, 'ads_google');
      const meta = await run(t, 'ads_meta');
      // null = not checked (skipped for lack of a domain / Meta page, or failed); a count only after an ok pull.
      const active = async (platform: 'google' | 'meta') =>
        (await deps.db.select({ n: count() }).from(ad).where(and(eq(ad.competitorId, t.id), eq(ad.platform, platform), eq(ad.isActive, true))))[0]?.n ?? 0;
      businesses.push({ competitorId: t.id, name: t.name, self: false, placeId: t.placeId, cid: t.cid, ads: { google: google === 'ok' ? await active('google') : null, meta: meta === 'ok' ? await active('meta') : null } });
    }

    const scan = await deps.scanRankings(clientId, { gridSize: PROSPECT_GRID, maxKeywords: PROSPECT_KEYWORDS });
    if (scan.failed > 0) notes.push(`${scan.failed} of ${scan.snapshots + scan.failed} map searches failed`);
    const rankPoints: RankPoint[] = scan.scanId
      ? (await deps.db.select({ keyword: rankSnapshot.keyword, results: rankSnapshot.results }).from(rankSnapshot).where(eq(rankSnapshot.scanId, scan.scanId)))
      : [];

    const ids = businesses.map((b) => b.competitorId);
    const profiles = ids.length
      ? await deps.db
          .select({ competitorId: observation.competitorId, data: observation.data })
          .from(observation)
          .where(and(inArray(observation.competitorId, ids), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
          .orderBy(desc(observation.observedAt))
      : [];
    const latest = new Map<string, Record<string, unknown>>();
    for (const p of profiles) if (!latest.has(p.competitorId)) latest.set(p.competitorId, p.data);

    const data = buildProspectReport({
      generatedAt: now(), keywords: c.keywords.slice(0, PROSPECT_KEYWORDS), points: PROSPECT_GRID * PROSPECT_GRID, scanId: scan.scanId,
      businesses: businesses.map((b) => ({ ...b, gbp: latest.get(b.competitorId) ?? null })), rankPoints, notes,
    });
    const done = await deps.db
      .update(prospectReport)
      .set({ status: 'ready', data, finishedAt: now() })
      .where(and(eq(prospectReport.id, reportId), eq(prospectReport.status, 'running')))
      .returning({ id: prospectReport.id });
    return { status: done.length ? 'ready' : 'failed' };
  } catch (err) {
    await failProspectReport(deps.db, reportId, err instanceof Error ? err.message : String(err), now());
    return { status: 'failed' };
  }
}
```

The test expects `calls` to list the self `gbp` first: the order above matches (self, then tracked competitors by name). `packages/collectors/src/index.ts`: add `export * from './prospect/report';` and `export * from './prospect/snapshot';`.

`apps/worker/src/deps.ts`:
- Add to `WorkerDeps`:

```ts
  /** 5b-2 decision 10: the one-off prospect snapshot (vendor pulls + 3×3 rank scan + deterministic report). Never throws. */
  runProspectSnapshot(clientId: string, reportId: string): Promise<{ status: 'ready' | 'failed' }>;
```

- In `createWorkerDeps`, hoist the existing `runSource` implementation and the `vendorsConfigured` check into local `const`s above the returned object. Keep the object's `runSource`/`vendorsConfigured` members pointing at them.
- Add:

```ts
    async runProspectSnapshot(clientId, reportId) {
      if (!vendorsConfigured()) {
        await failProspectReport(getDb(), reportId, 'Vendor APIs are not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)');
        return { status: 'failed' as const };
      }
      return runProspectSnapshot(
        { db: getDb(), runSource, scanRankings: (id, opts) => scanRankings({ db: getDb(), dfs: getDfs() }, id, opts) },
        clientId, reportId,
      );
    },
```

`apps/worker/src/jobs/prospects.ts`:

```ts
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { SINGLE_SHOT_QUEUE } from './vendor';

/** 5b-2 decision 10: paid and one-off — never retried automatically; `singletonKey` `prospect:<clientId>` dedupes a queued duplicate. */
export function createProspectJobs(deps: WorkerDeps) {
  const snapshot = defineJob({
    name: 'prospect-snapshot',
    schema: z.object({ clientId: z.uuid(), reportId: z.uuid() }),
    queue: { ...SINGLE_SHOT_QUEUE, policy: 'short' },
    async handler({ clientId, reportId }) {
      const r = await deps.runProspectSnapshot(clientId, reportId);
      console.log(`[prospect-snapshot] client ${clientId} report ${reportId}: ${r.status}`);
    },
  });
  return { snapshot };
}
```

(Match `defineJob`'s import path and the `z.uuid()` style used by `jobs/vendor.ts`.)

`apps/worker/src/main.ts`: `const prospects = createProspectJobs(deps);` and add `prospects.snapshot` to the `registerJobs` list.

- [ ] **Step 4: Run tests** — the Step 2 commands → PASS. `pnpm --filter @cs/collectors typecheck && pnpm --filter @cs/worker typecheck` clean. Also run `pnpm --filter @cs/worker exec vitest run src/jobs` (existing job tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/collectors apps/worker
git commit -m "feat(collectors,worker): prospect snapshot job — one GBP/ads pull, 3x3 rank scan, deterministic report"
```

---

### Task 12: Prospect tools — create, list, run snapshot, report, convert

**Files:**
- Create: `packages/tools/src/tools/prospects.ts`, `packages/tools/src/tools/prospects.test.ts`
- Modify: `packages/tools/src/deps.ts`, `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/tools/onboarding.ts`, `packages/tools/src/tools/onboarding.test.ts`, `packages/tools/src/tools/clients.ts`, `apps/web/src/server/queue.ts` (only if it whitelists job names), `apps/web/src/server/queue.test.ts`

**Interfaces:**
- Consumes: `prospectReport`, `client.status` (Task 1); `failProspectReport`, `PROSPECT_STALE_HOURS`, `PROSPECT_GRID` (Task 11); `enqueueOf` (`deps.ts`).
- Produces:
  - `QueueJob` gains `'prospect-snapshot'`
  - `create_client` input gains `status: 'active' | 'prospect'` (default `'active'`)
  - `ClientProfile` gains `status`
  - schemas:
    - `ProspectReportDataView` (zod mirror of `ProspectReportData`);
    - `ProspectReportView = { id, status: 'running' | 'ready' | 'failed', createdAt, finishedAt: string | null, error: string | null, data: ProspectReportData | null }`;
    - `ProspectRow = { clientId, name, verticalId, createdAt, competitors: number, keywords: number, hasServiceArea: boolean, report: { id, status, createdAt } | null }`.
  - tools:
    - `list_prospects({})` → `{ items: ProspectRow[] }`;
    - `run_prospect_snapshot({ clientId })` → `{ reportId }`;
    - `get_prospect_report({ clientId })` → `{ report: ProspectReportView | null }`;
    - `convert_prospect({ clientId })` → `{ clientId }`.

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/tools/prospects.test.ts`:

```ts
import { type AccessContext, createAccessContext } from '@cs/core';
import { claimDueSources, ensureCompetitorSources } from '@cs/collectors';
import { client, clientCompetitor, prospectReport } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const queued: { job: string; data: Record<string, string>; key: string }[] = [];
const enqueue: EnqueueJob = async (job, data, key) => void queued.push({ job, data, key });
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, enqueue }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const amA1 = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA2]);
const AREA = { center: { lat: 33.95, lng: -84.33 }, radiusKm: 10, zips: [] };

beforeEach(async () => {
  queued.length = 0;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ status: 'prospect', keywords: ['dentist'], serviceArea: AREA }).where(eq(client.id, IDS.clientA2));
});

describe('prospects (decisions 8–12, Review Focus 1)', () => {
  it('creates a prospect, lists it, and keeps it off the portfolio', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', { name: 'Peach Dental', verticalId: 'dental', services: [], keywords: ['dentist'], serviceArea: AREA, placeId: null, status: 'prospect' })) as { clientId: string };
    const { items } = (await registry.invoke(admin, 'list_prospects', {})) as { items: { clientId: string; competitors: number; report: null }[] };
    expect(items.map((i) => i.clientId).sort()).toEqual([IDS.clientA2, clientId].sort());
    const portfolio = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(portfolio.items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
  });

  it('runs one snapshot at a time, deduped per client, and re-runs after a timeout', async () => {
    const { reportId } = (await registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })) as { reportId: string };
    expect(queued).toEqual([{ job: 'prospect-snapshot', data: { clientId: IDS.clientA2, reportId }, key: `prospect:${IDS.clientA2}` }]);
    expect(await registry.invoke(admin, 'get_prospect_report', { clientId: IDS.clientA2 })).toMatchObject({ report: { id: reportId, status: 'running' } });
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/already running/) });
    await dbs.owner.update(prospectReport).set({ createdAt: new Date(Date.now() - 4 * 3_600_000) }).where(eq(prospectReport.id, reportId));
    expect(await registry.invoke(admin, 'get_prospect_report', { clientId: IDS.clientA2 })).toMatchObject({ report: { status: 'failed', error: expect.stringMatching(/timed out/) } });
    await registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 });
    expect(queued).toHaveLength(2);
  });

  it('refuses a snapshot without keywords, area or competitors, for active clients, out-of-scope callers and client roles', async () => {
    await dbs.owner.update(client).set({ keywords: [] }).where(eq(client.id, IDS.clientA2));
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input' });
    await dbs.owner.update(client).set({ keywords: ['dentist'] }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA2));
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/competitor/) });
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(amA1, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    expect(queued).toEqual([]);
  });

  it('marks the report failed when the queue is down', async () => {
    const broken = createToolRegistry({ app: dbs.app, service: dbs.service, enqueue: async () => { throw new Error('boss down'); } }, { audit: { record: async () => {} } });
    await expect(broken.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toBeTruthy();
    const [r] = await dbs.owner.select().from(prospectReport);
    expect(r).toMatchObject({ status: 'failed' });
  });

  it('converts once: status active, links bumped, collection starts on the next claim', async () => {
    await ensureCompetitorSources(dbs.service, IDS.competitorY);
    expect((await claimDueSources(dbs.service, 100)).map((c) => c.competitorId)).not.toContain(IDS.competitorY);
    const before = new Date();
    await registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA2));
    expect(c!.status).toBe('active');
    const [link] = await dbs.owner.select().from(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA2));
    expect(link!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect((await claimDueSources(dbs.service, 100)).map((x) => x.competitorId)).toContain(IDS.competitorY);
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

Add to `onboarding.test.ts`:

```ts
it('creates active clients by default and returns status on the profile', async () => {
  const { clientId } = (await registry.invoke(admin, 'create_client', { name: 'Plain HVAC', verticalId: 'hvac_plumbing', services: [], keywords: [], serviceArea: null, placeId: null })) as { clientId: string };
  expect(await registry.invoke(admin, 'get_client_profile', { clientId })).toMatchObject({ status: 'active' });
});
```

(Use the file's admin ctx/registry names.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/prospects.test.ts src/tools/onboarding.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`deps.ts`: `export type QueueJob = 'brief-pdf' | 'report-pdf' | 'suggest-competitors' | 'discover-pages' | 'prospect-snapshot';`.

`onboarding.ts`:
- `create_client` input gains `status: z.enum(CLIENT_STATUSES).default('active')` (import `CLIENT_STATUSES` from `@cs/db`).
- The insert gains `status: input.status`.
- Update the description: "Create a client business — or a prospect being pitched — for this agency (agency users who cover all clients)."

`schemas.ts`:
- `ClientProfile` gains `status: z.enum(['active', 'prospect'])`; `get_client_profile` returns `status: c.status`.
- Add:

```ts
const ProspectRankView = z.object({ keyword: z.string(), found: z.number().int(), top3: z.number().int(), averageRank: z.number().nullable() });
const ProspectBusinessView = z.object({
  competitorId: uuid, name: z.string(), self: z.boolean(),
  gbp: z.object({ rating: z.number().nullable(), reviews: z.number().nullable(), category: z.string().nullable(), extraCategories: z.number().int() }).nullable(),
  ads: z.object({ google: z.number().int().nullable(), meta: z.number().int().nullable() }), ranks: z.array(ProspectRankView),
});
export const ProspectReportDataView = z.object({
  generatedAt: iso, keywords: z.array(z.string()), points: z.number().int(), scanId: uuid.nullable(), businesses: z.array(ProspectBusinessView), notes: z.array(z.string()),
});
export const ProspectReportView = z.object({
  id: uuid, status: z.enum(['running', 'ready', 'failed']), createdAt: iso, finishedAt: iso.nullable(), error: z.string().nullable(), data: ProspectReportDataView.nullable(),
});
export type ProspectReportView = z.infer<typeof ProspectReportView>;
export const ProspectRow = z.object({
  clientId: uuid, name: z.string(), verticalId: z.string(), createdAt: iso, competitors: z.number().int(), keywords: z.number().int(), hasServiceArea: z.boolean(),
  report: z.object({ id: uuid, status: z.enum(['running', 'ready', 'failed']), createdAt: iso }).nullable(),
});
export type ProspectRow = z.infer<typeof ProspectRow>;
```

`prospects.ts`:

```ts
import { type AccessContext, canAccessClient, toolkit, ToolError } from '@cs/core';
import { failProspectReport, PROSPECT_STALE_HOURS } from '@cs/collectors';
import { client, clientCompetitor, prospectReport, withTenant } from '@cs/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, type ToolDeps } from '../deps';
import { ProspectReportView, ProspectRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const STALE_MS = PROSPECT_STALE_HOURS * 3_600_000;
type ReportRow = typeof prospectReport.$inferSelect;

/** Decision 10: a `running` row older than the stale window is reported (and treated) as failed. */
function effective(r: ReportRow, now: Date): ReportRow {
  if (r.status === 'running' && now.getTime() - r.createdAt.getTime() > STALE_MS) return { ...r, status: 'failed', error: 'The snapshot timed out — run it again' };
  return r;
}

const latestReport = async (deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<ReportRow | undefined> =>
  (await withTenant(deps.app, ctx, (tx) => tx.select().from(prospectReport).where(eq(prospectReport.clientId, clientId)).orderBy(desc(prospectReport.createdAt)).limit(1)))[0];

export const listProspects = defineTool({
  name: 'list_prospects',
  description: 'Businesses this agency is pitching (prospects), with their competitors and latest snapshot.',
  input: z.object({}),
  output: z.object({ items: z.array(ProspectRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const now = new Date();
    return withTenant(deps.app, ctx, async (tx) => {
      const rows = await tx.select().from(client).where(eq(client.status, 'prospect')).orderBy(desc(client.createdAt));
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return { items: [] };
      const [links, reports] = await Promise.all([
        tx.select({ id: clientCompetitor.clientId, n: count() }).from(clientCompetitor).where(inArray(clientCompetitor.clientId, ids)).groupBy(clientCompetitor.clientId),
        tx.select().from(prospectReport).where(inArray(prospectReport.clientId, ids)).orderBy(desc(prospectReport.createdAt)),
      ]);
      return {
        items: rows.map((c) => {
          const r = reports.find((x) => x.clientId === c.id);
          const e = r ? effective(r, now) : null;
          return {
            clientId: c.id, name: c.name, verticalId: c.verticalId, createdAt: c.createdAt.toISOString(), competitors: links.find((l) => l.id === c.id)?.n ?? 0,
            keywords: c.keywords.length, hasServiceArea: c.serviceArea !== null, report: e ? { id: e.id, status: e.status, createdAt: e.createdAt.toISOString() } : null,
          };
        }),
      };
    });
  },
});

export const runProspectSnapshotTool = defineTool({
  name: 'run_prospect_snapshot',
  description: 'Pull each business’s Google profile and ads once and scan local rankings on a 3×3 grid, then build a landscape report (paid; runs in the background).',
  input: z.object({ clientId: uuid }),
  output: z.object({ reportId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).where(eq(client.id, clientId)));
    if (!c) throw new ToolError('not_found', 'Client not found');
    if (c.status !== 'prospect') throw new ToolError('invalid_input', 'Snapshots are for prospects — this business is already a client');
    if (c.keywords.length === 0 || !c.serviceArea) throw new ToolError('invalid_input', 'Add at least one keyword and a service area to the profile first');
    const [links] = await withTenant(deps.app, ctx, (tx) => tx.select({ n: count() }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId)));
    if ((links?.n ?? 0) === 0) throw new ToolError('invalid_input', 'Pick at least one competitor first');
    const last = await latestReport(deps, ctx, clientId);
    if (last && effective(last, new Date()).status === 'running') throw new ToolError('invalid_input', 'A snapshot is already running — it usually takes a few minutes');
    const [row] = await deps.service.insert(prospectReport).values({ agencyId: ctx.agencyId, clientId, status: 'running' }).returning({ id: prospectReport.id });
    try {
      await enqueueOf(deps)('prospect-snapshot', { clientId, reportId: row!.id }, `prospect:${clientId}`);
    } catch (err) {
      await failProspectReport(deps.service, row!.id, 'Could not start the snapshot — try again');
      throw err;
    }
    return { reportId: row!.id };
  },
});

export const getProspectReport = defineTool({
  name: 'get_prospect_report',
  description: 'The latest prospect snapshot report for a business (running, ready or failed).',
  input: z.object({ clientId: uuid }),
  output: z.object({ report: ProspectReportView.nullable() }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const r = await latestReport(deps, ctx, clientId);
    if (!r) return { report: null };
    const e = effective(r, new Date());
    return { report: { id: e.id, status: e.status, createdAt: e.createdAt.toISOString(), finishedAt: e.finishedAt?.toISOString() ?? null, error: e.error, data: e.data } };
  },
});

export const convertProspect = defineTool({
  name: 'convert_prospect',
  description: 'Turn a prospect into a client: monitoring, alerts and weekly briefs start.',
  input: z.object({ clientId: uuid }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [visible] = await withTenant(deps.app, ctx, (tx) => tx.select({ status: client.status }).from(client).where(eq(client.id, clientId)));
    if (!visible) throw new ToolError('not_found', 'Client not found');
    const rows = await deps.service
      .update(client)
      .set({ status: 'active' })
      .where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId), eq(client.status, 'prospect')))
      .returning({ id: client.id });
    if (rows.length === 0) throw new ToolError('invalid_input', 'This business is already a client');
    // Decision 12: a fresh link date lets the score sweep's late-link lookback offer the last 90 days of events.
    await deps.service.update(clientCompetitor).set({ createdAt: new Date() }).where(eq(clientCompetitor.clientId, clientId));
    return { clientId };
  },
});

export const prospectTools = [listProspects, runProspectSnapshotTool, getProspectReport, convertProspect];
```

- Append `...prospectTools` to `all.ts`.
- `@cs/tools` already depends on `@cs/collectors` (5b-1 Task 1).
- `client_competitor.created_at` is not granted to `app_user`, but the bump uses the service Db after the RLS-checked visibility read — consistent with the Global Constraints.
- `apps/web/src/server/queue.ts`: if it validates job names against a list, add `'prospect-snapshot'`. Add a `queue.test.ts` case enqueuing it with `singletonKey: 'prospect:c1'` (mirror the 5b-1 suggest-competitors case).

- [ ] **Step 4: Run tests** — the Step 2 command plus `pnpm --filter @cs/web exec vitest run src/server/queue.test.ts` → PASS; `pnpm --filter @cs/tools typecheck && pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools apps/web/src/server
git commit -m "feat(tools): prospects — create, list, run snapshot, report, convert"
```

---

### Task 13: Prospecting screens

**Files:**
- Create:
  - `apps/web/src/app/(app)/agency/prospects/page.tsx`
  - `apps/web/src/app/(app)/agency/prospects/new/page.tsx`
  - `apps/web/src/app/(app)/agency/prospects/new/actions.ts`
  - `apps/web/src/app/(app)/agency/prospects/[clientId]/page.tsx`
  - `apps/web/src/app/(app)/agency/prospects/[clientId]/actions.ts`
  - `apps/web/src/app/(app)/agency/prospects/[clientId]/snapshot-controls.tsx` (+ test)
  - `apps/web/src/components/prospect-report-view.tsx` (+ test)
- Modify: `apps/web/src/components/client-profile-form.tsx`, `apps/web/src/components/client-profile-form.test.tsx`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `list_prospects`, `run_prospect_snapshot`, `get_prospect_report`, `convert_prospect`, `create_client` (`status`) (Task 12); `get_client_profile`, `list_client_competitors` (5b-1/Task 3).
- Produces:
  - `ClientProfileForm` create mode gains optional `status?: 'prospect'` (a hidden input) and `submitLabel?: string`;
  - `<ProspectReportView data={ProspectReportData} />`;
  - `<SnapshotControls clientId report canRun blockers action />`;
  - nav item `{ href: '/agency/prospects', label: 'Prospects', icon: 'prospects', group: 'agency' }`.

- [ ] **Step 1: Write the failing tests**

`components/prospect-report-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProspectReportView } from './prospect-report-view';

const data = {
  generatedAt: '2026-10-07T12:00:00.000Z', keywords: ['dentist'], points: 9, scanId: null, notes: ['Bright Smiles: Meta ads unavailable from the data provider'],
  businesses: [
    { competitorId: 'a', name: 'Peach Dental', self: true, gbp: { rating: 4.9, reviews: 31, category: 'Dentist', extraCategories: 0 }, ads: { google: null, meta: null }, ranks: [{ keyword: 'dentist', found: 3, top3: 3, averageRank: 1 }] },
    { competitorId: 'b', name: 'Bright Smiles', self: false, gbp: null, ads: { google: 2, meta: null }, ranks: [{ keyword: 'dentist', found: 5, top3: 2, averageRank: 3.4 }] },
  ],
};

describe('ProspectReportView', () => {
  it('shows profiles, ads and map visibility, marks the prospect, and lists notes', () => {
    render(<ProspectReportView data={data} />);
    const profile = within(screen.getByRole('table', { name: 'Google profile and ads' }));
    expect(profile.getByText('Peach Dental')).toBeTruthy();
    expect(profile.getByText('(prospect)')).toBeTruthy();
    expect(profile.getByText('4.9')).toBeTruthy();
    expect(profile.getAllByText('not checked').length).toBeGreaterThan(0);
    const ranks = within(screen.getByRole('table', { name: 'Map visibility' }));
    expect(ranks.getByText('5/9 · top 3: 2 · avg 3.4')).toBeTruthy();
    expect(screen.getByText(/Meta ads unavailable/)).toBeTruthy();
  });
});
```

`[clientId]/snapshot-controls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const { SnapshotControls } = await import('./snapshot-controls');

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  refresh.mockReset();
});

describe('SnapshotControls', () => {
  it('lists what is missing and disables the button', () => {
    render(<SnapshotControls clientId="c1" report={null} canRun={false} blockers={['Pick at least one competitor']} action={vi.fn()} />);
    expect(screen.getByText('Pick at least one competitor')).toBeTruthy();
    expect((screen.getByRole('button', { name: /run snapshot/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts a snapshot and refreshes while it runs', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Snapshot started.' }));
    const { rerender } = render(<SnapshotControls clientId="c1" report={null} canRun blockers={[]} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: /run snapshot/i }));
    await waitFor(() => expect(screen.getByText('Snapshot started.')).toBeTruthy());
    rerender(<SnapshotControls clientId="c1" report={{ id: 'r1', status: 'running', createdAt: new Date().toISOString(), finishedAt: null, error: null, data: null }} canRun blockers={[]} action={action} />);
    expect(screen.getByText(/running/i)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a failed snapshot’s reason', () => {
    render(<SnapshotControls clientId="c1" report={{ id: 'r1', status: 'failed', createdAt: '2026-10-07T00:00:00.000Z', finishedAt: null, error: 'The snapshot timed out — run it again', data: null }} canRun blockers={[]} action={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/timed out/);
  });
});
```

Add to `client-profile-form.test.tsx`:

```tsx
it('carries the prospect status and a custom submit label in create mode', () => {
  render(<ClientProfileForm mode="create" status="prospect" submitLabel="Create prospect" action={vi.fn()} verticals={verticals} timezoneOptions={['America/Chicago']} />);
  expect(screen.getByRole('button', { name: 'Create prospect' })).toBeTruthy();
  expect((document.querySelector('input[name="status"]') as HTMLInputElement).value).toBe('prospect');
});
```

(Use the file's existing `verticals` fixture name.) Add a `sidebar-nav.test.tsx` case for `/agency/prospects` highlighting "Prospects".

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/components/prospect-report-view.test.tsx "src/app/(app)/agency/prospects" src/components/client-profile-form.test.tsx src/components/shell/sidebar-nav.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`components/prospect-report-view.tsx` (server-safe, no hooks):

```tsx
import type { ProspectReportData } from '@cs/db';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';

const count = (n: number | null) => (n === null ? 'not checked' : String(n));

/** Decision 11: figures only, straight from the stored data — no model text. */
export function ProspectReportView({ data }: { data: ProspectReportData }) {
  const name = (b: ProspectReportData['businesses'][number]) => (
    <>
      {b.name} {b.self && <span className="text-muted-ink">(prospect)</span>}
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      <Table aria-label="Google profile and ads">
        <TableHeader>
          <TableRow><TableHead>Business</TableHead><TableHead>Rating</TableHead><TableHead>Reviews</TableHead><TableHead>Category</TableHead><TableHead>Google ads running</TableHead><TableHead>Meta ads running</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {data.businesses.map((b) => (
            <TableRow key={b.competitorId}>
              <TableCell className="font-semibold">{name(b)}</TableCell>
              <TableCell>{b.gbp?.rating ?? '—'}</TableCell>
              <TableCell>{b.gbp?.reviews ?? '—'}</TableCell>
              <TableCell>{b.gbp?.category ?? '—'}{b.gbp && b.gbp.extraCategories > 0 ? ` +${b.gbp.extraCategories}` : ''}</TableCell>
              <TableCell>{count(b.ads.google)}</TableCell>
              <TableCell>{count(b.ads.meta)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Table aria-label="Map visibility">
        <TableHeader>
          <TableRow><TableHead>Business</TableHead>{data.keywords.map((k) => <TableHead key={k}>“{k}”</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {data.businesses.map((b) => (
            <TableRow key={b.competitorId}>
              <TableCell className="font-semibold">{name(b)}</TableCell>
              {b.ranks.map((r) => (
                <TableCell key={r.keyword}>{r.found === 0 ? `not in the top 20 at any of ${data.points} points` : `${r.found}/${data.points} · top 3: ${r.top3} · avg ${r.averageRank}`}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.notes.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-ink">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <p className="text-xs text-muted-ink">Generated {data.generatedAt.slice(0, 10)} from Google Business Profile, ad-library and Google Maps data across a 3×3 grid of the service area. No AI-written text.</p>
    </div>
  );
}
```

(If `@cs/ui`'s `Table` doesn't forward `aria-label` to the `<table>`, pass it through or wrap in a `<section aria-label>`, and adjust the test's role query to `region`. Check `table.tsx`.)

`[clientId]/snapshot-controls.tsx` (`'use client'`):

```tsx
'use client';
import type { ProspectReportView } from '@cs/tools';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import type { FormResult } from '@/server/forms';

const POLL_MS = 10_000;
const POLL_FOR_MS = 15 * 60_000;

export function SnapshotControls({ clientId, report, canRun, blockers, action }: {
  clientId: string; report: ProspectReportView | null; canRun: boolean; blockers: string[]; action: (p: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const router = useRouter();
  const running = report?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) clearInterval(t);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [running, router]);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      {blockers.length > 0 && <ul className="list-disc pl-5 text-sm">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <Button type="submit" disabled={!canRun || running || pending} className="self-start">{report ? 'Run snapshot again' : 'Run snapshot'}</Button>
      {running && <p className="rounded-lg bg-muted-surface p-3 text-ink">Snapshot running — this page updates by itself.</p>}
      {report?.status === 'failed' && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{report.error ?? 'The snapshot failed.'}</p>}
      {!state.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
      {state.ok && state.message && !running && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
    </form>
  );
}
```

The "starts a snapshot" test re-renders with a running report and expects "Snapshot started." **before** that. Keep the message visible while not running, as above. If the test's first `waitFor` races the rerender, it still passes because the rerender happens after it.

`[clientId]/actions.ts`:

```ts
'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

async function agencyCtx() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}

export async function runSnapshotAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(fd.get('clientId') ?? '');
  const r = await runTool(ctx, 'run_prospect_snapshot', { clientId });
  if (!r.ok) return r;
  revalidatePath(`/agency/prospects/${clientId}`);
  return { ok: true, message: 'Snapshot started.' };
}

export async function convertAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(fd.get('clientId') ?? '');
  const r = await runTool(ctx, 'convert_prospect', { clientId });
  if (!r.ok) return r;
  redirect(`/c/${clientId}`);
}
```

`[clientId]/page.tsx` (server):
- `requireContext`; not an agency role → `notFound()`.
- `Promise.all` of `get_client_profile`, `list_client_competitors`, `get_prospect_report`.
- If `profile.status === 'active'`, `redirect(`/c/${clientId}`)`.
- Blockers: `profile.keywords.length === 0` → "Add at least one search keyword"; `!profile.serviceArea` → "Set a service area"; `competitors.items.length === 0` → "Pick at least one competitor". `canRun = blockers.length === 0`.

Render:
1. Title `Prospect — {profile.name}`; subtitle "Find their competitors, run a one-off snapshot, and share the landscape. Nothing is monitored until you convert them."
2. Card "1. Profile": keywords and service-area summary + link `Edit profile` → `/c/${clientId}/settings/profile`.
3. Card "2. Competitors": `{n} of {limit}` + names + link `Find and pick competitors` → `/c/${clientId}/competitors`.
4. Card "3. Snapshot": `<SnapshotControls clientId report={report} canRun blockers action={runSnapshotAction} />` with "≈ $0.10–0.15 per snapshot" in muted text.
5. When `report?.status === 'ready' && report.data`: card "Landscape" with `<ProspectReportView data={report.data} />`.
6. Card "4. Convert": text "Converting starts weekly monitoring, alerts and briefs for this business." plus a small client form component — inline it in the page file as a separate `'use client'` file `convert-button.tsx` with `useActionState(convertAction)` — showing a "Convert to client" `Button` and an error message on refusal.

`agency/prospects/page.tsx`:
- Agency only.
- `callTool<{ items: ProspectRow[] }>(ctx, 'list_prospects', {})`.
- Title "Prospects"; subtitle "Businesses you’re pitching. A snapshot shows how they stack up locally — no monitoring until they sign."
- A `Button asChild` "New prospect" → `/agency/prospects/new`, only when `ctx.clientScope === 'all'`.
- A `Table`: Business (link `/agency/prospects/<id>`), Competitors, Ready? (✓ when `keywords > 0 && hasServiceArea && competitors > 0`, else "needs setup"), Snapshot (status `Badge` or "—"), Added (`relativeTime`).
- Empty state: "No prospects yet."

`agency/prospects/new/actions.ts`:

```ts
'use server';
import { isAgencyRole } from '@cs/core';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseClientProfileForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function createProspectAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const parsed = parseClientProfileForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const r = await runTool<{ clientId: string }>(ctx, 'create_client', { ...parsed, status: 'prospect' });
  if (!r.ok) return r;
  redirect(`/agency/prospects/${r.data.clientId}`);
}
```

`agency/prospects/new/page.tsx`: same as `agency/clients/new/page.tsx` — same guard (`ctx.clientScope !== 'all'` → `notFound()`), title "Add a prospect", subtitle "Profile first — keywords and a service area let us find their competitors." It renders `<ClientProfileForm mode="create" status="prospect" submitLabel="Create prospect" action={createProspectAction} …/>`.

`client-profile-form.tsx`:
- The create variant of `Props` gains `status?: 'prospect'; submitLabel?: string`.
- Render `{props.mode === 'create' && props.status && <input type="hidden" name="status" value={props.status} />}`.
- The submit label becomes `props.mode === 'create' ? (props.submitLabel ?? 'Create client') : 'Save profile'`.
- The status is set by the action (not read from the form) — the hidden input is informative only. The `create_client` call passes `status: 'prospect'` explicitly.

`nav-items.ts`: `'prospects'` icon; `agency('/agency/prospects', 'Prospects', 'prospects')` after Alert review. `sidebar-nav.tsx`: `ICONS.prospects = Telescope`.

The competitors page (`/c/[clientId]/competitors`) and profile page work unchanged for prospects. When `profile.status === 'prospect'`, add a link "← Back to the prospect" (`/agency/prospects/<id>`) at the top of both pages. They already read `get_client_profile`, which now returns `status`.

- [ ] **Step 4: Run tests** — Step 2 command → PASS; `pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): prospecting — list, new prospect, snapshot hub with landscape report, convert"
```

---

### Task 14: Auth hardening — Google refusal, hashed magic-link tokens, admin contact kept (m3)

**Files:**
- Modify: `apps/web/src/server/auth-options.ts`, `apps/web/src/server/auth-options.test.ts`, `packages/tools/src/access/invitations.ts`, `packages/tools/src/access/invitations.test.ts`

**Interfaces:**
- Consumes: `hasSignInRight`, `acceptInvitations` (`@cs/tools`).
- Produces: `buildAuthOptions(...).databaseHooks.session.create.before` returns `false` for a user with no sign-in right. The magic-link plugin is configured with `storeToken: 'hashed'`. `acceptInvitations` leaves an existing admin's contact `role`/`clientScope` alone.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/server/auth-options.test.ts` (reuse its `auth`, `post`, `flush`, `linkFromMail`, `env`, `pool`, `dbs`):

```ts
describe('5b-2 hardening (decision 14)', () => {
  it('stores only a hash of the magic-link token, and the link still signs in', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'hash@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    await post('/sign-in/magic-link', { email: 'hash@example.com', callbackURL: '/' });
    await flush();
    const token = new URL(linkFromMail()).searchParams.get('token')!;
    const rows = [...(await dbs.owner.execute<{ identifier: string; value: string }>(sql`select identifier, value from auth.verification`))];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.identifier === token || r.value.includes(token))).toBe(false);
    const verify = await auth.handler(new Request(linkFromMail()));
    expect(verify.headers.get('set-cookie')).toMatch(/session_token/);
  });

  it('refuses a session for a user who has lost every sign-in right (e.g. a Google user whose memberships were removed)', async () => {
    const opts = buildAuthOptions({ env, service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null), runInBackground: () => {}, sendEmail: async () => {} });
    const before = opts.databaseHooks!.session!.create!.before!;
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('g1', 'G', 'google@example.com', true)`);
    const session = { userId: 'g1', token: 't', expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() };
    expect(await before(session as never, undefined as never)).toBe(false);
    await dbs.service.insert(membership).values({ userId: 'g1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
    expect(await before(session as never, undefined as never)).not.toBe(false);
  });
});
```

Add to `packages/tools/src/access/invitations.test.ts` (inside `describe('acceptInvitations', …)`):

```ts
  it('leaves an admin’s linked contact role and scope alone when an older invitation would demote them (m3)', async () => {
    await seedUser(dbs.owner, 'u1', 'admin@e.co');
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'agency_admin', email: 'admin@e.co', userId: 'u1' }).returning();
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', contactId: c!.id, createdBy: 'x' });
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'admin@e.co', role: 'account_manager', clientScope: [IDS.clientA1], invitedBy: 'x', expiresAt: new Date('2026-10-19T12:00:00Z') });
    await acceptInvitations(dbs.service, { id: 'u1', email: 'admin@e.co' }, NOW);
    const [after] = await dbs.service.select().from(contact).where(eq(contact.id, c!.id));
    expect(after).toMatchObject({ role: 'agency_admin', clientScope: null, userId: 'u1', active: true });
  });
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/server/auth-options.test.ts` and `pnpm --filter @cs/tools exec vitest run src/access/invitations.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`auth-options.ts`:
- `magicLink({ expiresIn: …, storeToken: 'hashed', sendMagicLink: … })`. Read `apps/web/node_modules/better-auth/dist/plugins/magic-link/index.d.mts` around `storeToken` to confirm the option name and value. The verify endpoint hashes the incoming token itself, so nothing else changes.
- In `databaseHooks.session.create`, add next to `after`:

```ts
          // 5b-2 decision 14 (5a carry-over): a Google user whose memberships were all removed still has an account; refuse the
          // session outright instead of landing them on /no-access. Invited users still pass (a pending invitation is a right).
          before: async (session) => {
            const rows = [...(await deps.service.execute<{ email: string }>(sql`select email from auth."user" where id = ${session.userId}`))];
            const email = rows[0]?.email;
            return email && (await hasSignInRight(deps.service, email, now())) ? undefined : false;
          },
```

Existing tests ("signs in an invited user…", "refuses to create a user…") must keep passing: the invitation is still pending when the session is created (`acceptInvitations` runs in `after`).

`packages/tools/src/access/invitations.ts`:
- `contactFor(tx, inv, user, keepRole: boolean)`.
- When `keepRole` is true, the existing-contact update sets only `{ userId: user.id, active: true }`.
- A new contact is created with `role: keepRole ? 'agency_admin' : inv.role` and `clientScope: keepRole ? null : inv.clientScope ?? null`.
- In `acceptInvitations`' loop, before `contactFor`:

```ts
      // m3 (5a final review): the same never-demote rule the membership upsert applies must hold for the linked contact.
      const [held] = await tx
        .select({ role: membership.role })
        .from(membership)
        .where(and(eq(membership.userId, user.id), eq(membership.agencyId, inv.agencyId), sameClient(membership.clientId, inv.clientId)));
      const keepRole = held?.role === 'agency_admin' && inv.role !== 'agency_admin';
      const contactId = await contactFor(tx, inv, user, keepRole);
```

- [ ] **Step 4: Run tests** — Step 2 commands → PASS (whole files). `pnpm --filter @cs/web typecheck && pnpm --filter @cs/tools typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server packages/tools/src/access
git commit -m "fix(web,tools): refuse sessions without a sign-in right, hash magic-link tokens, keep an admin's contact role (m3)"
```

---

### Task 15: Settings writes become audited tools (m2, m4)

**Files:**
- Create: `packages/tools/src/tools/settings.ts`, `packages/tools/src/tools/settings.test.ts`
- Modify: `packages/tools/src/tools/all.ts`, `apps/web/src/app/(app)/agency/team/actions.ts`, `apps/web/src/app/(app)/agency/branding/actions.ts`, `apps/web/src/app/(app)/agency/webhooks/actions.ts`, `apps/web/src/app/(app)/c/[clientId]/settings/delivery/actions.ts`, `apps/web/src/app/(app)/settings/notifications/actions.ts`

**Interfaces:**
- Consumes: `inviteMember`, `revokeMembership`, `revokeInvitation`, `updateAgencyBranding`, `addWebhook`, `setWebhookActive`, `addClientRecipient`, `deactivateRecipient`, `updateClientDeliverySettings`, `setMyNotificationPref`, `updateMyContact` (`@cs/tools`, unchanged); `CLIENT_KINDS`, `AGENCY_KINDS` (`@cs/db`); `PERSONAL_CHANNELS` (`@cs/engine`).
- Produces (all audit-logged by the registry):
  - `invite_member({ email, role, clientId?, clientScope? })` → `{ invitationId, expiresAt }`;
  - `revoke_membership({ membershipId })`, `revoke_invitation({ invitationId })`;
  - `update_agency_branding({ displayName?, logoUrl?, primary?, secondary?, fromName?, signOff? })`;
  - `add_webhook({ kind, url, kinds? })` → `{ webhookId }`, `set_webhook_active({ webhookId, active })`;
  - `add_client_recipient({ clientId, email, name?, role })` → `{ contactId }`, `deactivate_recipient({ contactId })`;
  - `update_client_delivery({ clientId, alertMode?, briefAutoSend?, timezone? })`;
  - `set_my_notification_pref({ contactId, kind, channel, enabled })`, `update_my_contact({ contactId, timezone?, quietHours? })`.
  - Each mutation tool without another output returns `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

`packages/tools/src/tools/settings.test.ts`:

```ts
import { type AuditEvent, createAccessContext } from '@cs/core';
import { agency, contact, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const audit: AuditEvent[] = [];
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async (e) => void audit.push(e) } });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
const me = createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] });
const guest = createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:00000000-0000-4000-8000-000000000001', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] });

beforeEach(async () => {
  audit.length = 0;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'admin', 'admin@e.co');
  await seedUser(dbs.owner, 'u1', 'u1@e.co');
  await dbs.service.insert(membership).values({ userId: 'admin', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'seed' });
});

describe('settings writes are audited tools (m4)', () => {
  it('invites and revokes through the registry, one audit row per call', async () => {
    const { invitationId } = (await registry.invoke(admin, 'invite_member', { email: 'new@e.co', role: 'client_viewer', clientId: IDS.clientA1 })) as { invitationId: string };
    await registry.invoke(admin, 'revoke_invitation', { invitationId });
    expect((await dbs.owner.select().from(invitation))[0]!.revokedAt).not.toBeNull();
    expect(audit.map((a) => [a.tool, a.outcome])).toEqual([['invite_member', 'ok'], ['revoke_invitation', 'ok']]);
  });

  it('saves branding (admins only) and audits the refusal too', async () => {
    await registry.invoke(admin, 'update_agency_branding', { displayName: 'Peak Digital', primary: '#112233' });
    expect((await dbs.owner.select().from(agency).where(eq(agency.id, IDS.agencyA)))[0]!.branding).toMatchObject({ displayName: 'Peak Digital', primary: '#112233' });
    await expect(registry.invoke(am, 'update_agency_branding', { displayName: 'x' })).rejects.toMatchObject({ code: 'permission_denied' });
    expect(audit.at(-1)).toMatchObject({ tool: 'update_agency_branding', outcome: 'permission_denied' });
  });

  it('turns malformed ids into invalid_input instead of a driver error (m2)', async () => {
    await expect(registry.invoke(admin, 'revoke_membership', { membershipId: 'nope' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'deactivate_recipient', { contactId: "1' or 1=1" })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('adds and deactivates a client recipient, and updates delivery', async () => {
    const { contactId } = (await registry.invoke(am, 'add_client_recipient', { clientId: IDS.clientA1, email: 'owner@a1.co', name: null, role: 'client_owner' })) as { contactId: string };
    await registry.invoke(am, 'update_client_delivery', { clientId: IDS.clientA1, alertMode: 'digest_only', briefAutoSend: true, timezone: 'America/Denver' });
    await registry.invoke(am, 'deactivate_recipient', { contactId });
    expect((await dbs.owner.select().from(contact).where(eq(contact.id, contactId)))[0]!.active).toBe(false);
    await expect(registry.invoke(am, 'update_client_delivery', { clientId: IDS.clientA2, alertMode: 'direct' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets a signed-in user change their own contact, never a guest', async () => {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'u1@e.co', userId: 'u1' }).returning();
    await registry.invoke(me, 'update_my_contact', { contactId: c!.id, timezone: 'America/Denver', quietHours: { start: '21:00', end: '07:00' } });
    await registry.invoke(me, 'set_my_notification_pref', { contactId: c!.id, kind: 'brief', channel: 'email', enabled: false });
    await expect(registry.invoke(me, 'update_my_contact', { contactId: c!.id, quietHours: { start: '25:00', end: '07:00' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(guest, 'update_my_contact', { contactId: c!.id, timezone: 'UTC' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

(`'brief'` must be one of `CLIENT_KINDS` — it is in `packages/db/src/schema/delivery.ts`.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/settings.test.ts` → FAIL.

- [ ] **Step 3: Implement the tools** (`packages/tools/src/tools/settings.ts`)

```ts
import { type AccessContext, ROLES, toolkit, ToolError } from '@cs/core';
import { AGENCY_KINDS, CLIENT_KINDS, type NotificationKind } from '@cs/db';
import { ALERT_MODES, PERSONAL_CHANNELS } from '@cs/engine';
import { z } from 'zod';
import { inviteMember, revokeInvitation, revokeMembership } from '../access/team';
import type { ToolDeps } from '../deps';
import { setMyNotificationPref, updateMyContact } from '../preferences';
import { addClientRecipient, addWebhook, deactivateRecipient, setWebhookActive, updateAgencyBranding, updateClientDeliverySettings } from '../settings';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const OK = z.object({ ok: z.literal(true) });
const ok = { ok: true as const };
const text = (max: number) => z.string().max(max).optional();

/** Guests (email-link sessions) are read-only (5a decision 11). */
function requireSignedIn(ctx: AccessContext) {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to change your settings');
}

export const inviteMemberTool = defineTool({
  name: 'invite_member', description: 'Invite someone to this agency or one of its clients.',
  input: z.object({ email: z.string().max(320), role: z.enum(ROLES), clientId: uuid.nullable().optional(), clientScope: z.array(uuid).max(500).nullable().optional() }),
  output: z.object({ invitationId: uuid, expiresAt: z.string() }), permission: 'agency',
  async handler(ctx, input, deps) {
    const r = await inviteMember(deps.service, ctx, input);
    return { invitationId: r.id, expiresAt: r.expiresAt.toISOString() };
  },
});
export const revokeMembershipTool = defineTool({
  name: 'revoke_membership', description: 'Remove someone’s access.', input: z.object({ membershipId: uuid }), output: OK, permission: 'agency',
  async handler(ctx, { membershipId }, deps) { await revokeMembership(deps.service, ctx, membershipId); return ok; },
});
export const revokeInvitationTool = defineTool({
  name: 'revoke_invitation', description: 'Cancel a pending invitation.', input: z.object({ invitationId: uuid }), output: OK, permission: 'agency',
  async handler(ctx, { invitationId }, deps) { await revokeInvitation(deps.service, ctx, invitationId); return ok; },
});
export const updateAgencyBrandingTool = defineTool({
  name: 'update_agency_branding', description: 'Save the agency’s white-label branding (agency admins).',
  input: z.object({ displayName: text(200), logoUrl: text(1000), primary: text(20), secondary: text(20), fromName: text(200), signOff: text(600) }),
  output: OK, permission: 'agency',
  async handler(ctx, input, deps) { await updateAgencyBranding(deps.service, ctx, input); return ok; },
});
export const addWebhookTool = defineTool({
  name: 'add_webhook', description: 'Send agency notices to a Slack or Teams channel (agency admins).',
  input: z.object({ kind: z.enum(['slack', 'teams']), url: z.string().max(2000), kinds: z.array(z.string().max(40)).max(30).nullable().optional() }),
  output: z.object({ webhookId: uuid }), permission: 'agency',
  async handler(ctx, input, deps) { return { webhookId: await addWebhook(deps.service, ctx, input) }; },
});
export const setWebhookActiveTool = defineTool({
  name: 'set_webhook_active', description: 'Pause or resume a Slack/Teams webhook (agency admins).', input: z.object({ webhookId: uuid, active: z.boolean() }), output: OK, permission: 'agency',
  async handler(ctx, { webhookId, active }, deps) { await setWebhookActive(deps.service, ctx, webhookId, active); return ok; },
});
export const addClientRecipientTool = defineTool({
  name: 'add_client_recipient', description: 'Add an email-only recipient of a client’s briefs and alerts.',
  input: z.object({ clientId: uuid, email: z.string().max(320), name: z.string().max(200).nullable().optional(), role: z.enum(['client_owner', 'client_viewer']) }),
  output: z.object({ contactId: uuid }), permission: 'agency',
  async handler(ctx, input, deps) { return { contactId: await addClientRecipient(deps.service, ctx, input) }; },
});
export const deactivateRecipientTool = defineTool({
  name: 'deactivate_recipient', description: 'Stop sending to a recipient and expire every link already sent to them.', input: z.object({ contactId: uuid }), output: OK, permission: 'agency',
  async handler(ctx, { contactId }, deps) { await deactivateRecipient(deps.service, ctx, contactId); return ok; },
});
export const updateClientDeliveryTool = defineTool({
  name: 'update_client_delivery', description: 'Set a client’s alert mode, brief auto-send and time zone.',
  input: z.object({ clientId: uuid, alertMode: z.enum(ALERT_MODES).optional(), briefAutoSend: z.boolean().optional(), timezone: z.string().max(64).optional() }),
  output: OK, permission: 'agency',
  async handler(ctx, { clientId, ...patch }, deps) { await updateClientDeliverySettings(deps, ctx, clientId, patch); return ok; },
});
export const setMyNotificationPrefTool = defineTool({
  name: 'set_my_notification_pref', description: 'Turn one of your own notifications on or off.',
  input: z.object({ contactId: uuid, kind: z.enum([...CLIENT_KINDS, ...AGENCY_KINDS] as [string, ...string[]]), channel: z.enum(PERSONAL_CHANNELS), enabled: z.boolean() }),
  output: OK, permission: 'read',
  async handler(ctx, input, deps) {
    requireSignedIn(ctx);
    await setMyNotificationPref(deps.service, ctx.userId, { ...input, kind: input.kind as NotificationKind });
    return ok;
  },
});
export const updateMyContactTool = defineTool({
  name: 'update_my_contact', description: 'Set your own time zone and quiet hours.',
  input: z.object({ contactId: uuid, timezone: z.string().max(64).nullable().optional(), quietHours: z.object({ start: z.string().max(5), end: z.string().max(5) }).nullable().optional() }),
  output: OK, permission: 'read',
  async handler(ctx, input, deps) {
    requireSignedIn(ctx);
    await updateMyContact(deps.service, ctx.userId, input);
    return ok;
  },
});

export const settingsTools = [
  inviteMemberTool, revokeMembershipTool, revokeInvitationTool, updateAgencyBrandingTool, addWebhookTool, setWebhookActiveTool,
  addClientRecipientTool, deactivateRecipientTool, updateClientDeliveryTool, setMyNotificationPrefTool, updateMyContactTool,
];
```

Notes:
- If `ALERT_MODES`/`PERSONAL_CHANNELS` aren't readonly tuples `z.enum` accepts, spread them: `z.enum([...ALERT_MODES] as [AlertMode, ...AlertMode[]])`. Same for `ROLES`.
- If `CLIENT_KINDS`/`AGENCY_KINDS` overlap (both contain the same string), de-duplicate with `[...new Set([...CLIENT_KINDS, ...AGENCY_KINDS])]` before `z.enum`.
- Append `...settingsTools` to `all.ts`.

- [ ] **Step 4: Switch the web actions to `runTool`**

Each action keeps its role guard (`notFound()` before any `try`, as today) and its revalidate/messages. It replaces the direct service call with `runTool` and returns `r` when `!r.ok`:
- `agency/team/actions.ts`:
  - `inviteMember(...)` → `runTool(ctx, 'invite_member', parsed)`;
  - `revokeMembership` → `runTool(ctx, 'revoke_membership', { membershipId: String(formData.get('membershipId') ?? '') })`;
  - `revokeInvitation` → `revoke_invitation`.
- `agency/branding/actions.ts`: `runTool(ctx, 'update_agency_branding', parseBrandingForm(formData))`.
- `agency/webhooks/actions.ts`:
  - `add_webhook`;
  - `toggleWebhookAction` → `await runTool(ctx, 'set_webhook_active', { webhookId: input.id, active: input.active })`, ignoring the result's error (the switch re-renders from the server value after `revalidatePath`). This closes T18's "no error path".
- `c/[clientId]/settings/delivery/actions.ts`: `update_client_delivery` (spread `parsed`), `add_client_recipient`, `deactivate_recipient`.
- `settings/notifications/actions.ts`:
  - `setPrefAction` → `runTool(ctx, 'set_my_notification_pref', input)`. It needs `ctx` — keep `requireContext()` and the `viewer.kind !== 'user'` → `notFound()` check.
  - `updateContactAction` → `const r = await runTool(ctx, 'update_my_contact', {...}); return { error: r.ok ? null : r.error };`. Drop the `e instanceof Error ? e.message` path (m2).

Remove now-unused imports (`dbs`, `toFormResult`, the service functions). Run the existing component tests for these screens — they mock the actions, so they should be unaffected.

- [ ] **Step 5: Run tests** — `pnpm --filter @cs/tools exec vitest run src/tools/settings.test.ts src/access src/settings.test.ts src/preferences.test.ts` and `pnpm --filter @cs/web exec vitest run "src/app/(app)/agency/team" "src/app/(app)/agency/branding" "src/app/(app)/agency/webhooks" "src/app/(app)/settings" "src/app/(app)/c/[clientId]/settings"` → PASS (some globs may match no test files; that's fine). `pnpm --filter @cs/tools typecheck && pnpm --filter @cs/web typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add packages/tools apps/web
git commit -m "feat(tools,web): team, branding, webhook, delivery and preference writes go through audited tools (m2, m4)"
```

---

### Task 16: Multi-membership — open a client under the membership that covers it

**Files:**
- Modify: `packages/tools/src/access/memberships.ts`, `packages/tools/src/access/memberships.test.ts`, `apps/web/src/server/viewer.ts`, `apps/web/src/server/viewer.test.ts`, `apps/web/src/server/current-viewer.ts`

**Interfaces:**
- Produces: `coversClient(m: MembershipSummary, clientId: string, clientAgencyId: string): boolean` (`@cs/tools`); `resolveViewer({ …, clientHint?: string | null })`.

- [ ] **Step 1: Write the failing tests**

`memberships.test.ts`:

```ts
describe('coversClient (5b-2 decision 16)', () => {
  const base = { id: 'm', agencyName: 'A', clientName: null, contactId: null, createdAt: new Date() };
  it('matches agency admins and unrestricted AMs of the client’s agency, scoped AMs in scope, and client roles of that client', () => {
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'agency_admin', clientId: null, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(true);
    expect(coversClient({ ...base, agencyId: IDS.agencyB, role: 'agency_admin', clientId: null, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(false);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'account_manager', clientId: null, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(true);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'account_manager', clientId: null, clientScope: [IDS.clientA2] }, IDS.clientA1, IDS.agencyA)).toBe(false);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA1, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(true);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA2, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(false);
  });
});
```

`viewer.test.ts`:

```ts
  it('uses a membership that covers the client in the path when the cookie’s one does not (decision 16)', async () => {
    const [own] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, createdBy: 't', createdAt: new Date('2026-10-01T00:00:00Z') }).returning();
    const [adminB] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyB, role: 'agency_admin', createdBy: 't' }).returning();
    const forB1 = await resolveViewer({ service: dbs.service, session, membershipCookie: own!.id, clientHint: IDS.clientB1, linkSecrets: S, now: NOW });
    expect(forB1).toMatchObject({ kind: 'user', membership: { id: adminB!.id } });
    const forA1 = await resolveViewer({ service: dbs.service, session, membershipCookie: adminB!.id, clientHint: IDS.clientA1, linkSecrets: S, now: NOW });
    expect(forA1).toMatchObject({ kind: 'user', membership: { id: own!.id } });
    const uncovered = await resolveViewer({ service: dbs.service, session, membershipCookie: own!.id, clientHint: IDS.clientA2, linkSecrets: S, now: NOW });
    expect(uncovered).toMatchObject({ kind: 'user', membership: { id: own!.id } });
    const bogus = await resolveViewer({ service: dbs.service, session, membershipCookie: own!.id, clientHint: 'not-a-uuid', linkSecrets: S, now: NOW });
    expect(bogus).toMatchObject({ kind: 'user', membership: { id: own!.id } });
  });
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/access/memberships.test.ts` and `pnpm --filter @cs/web exec vitest run src/server/viewer.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`memberships.ts`:

```ts
/** 5b-2 decision 16: whether this membership grants access to `clientId` (whose agency is `clientAgencyId`). */
export function coversClient(m: MembershipSummary, clientId: string, clientAgencyId: string): boolean {
  if (m.agencyId !== clientAgencyId) return false;
  if (m.role === 'agency_admin') return true;
  if (m.role === 'account_manager') return m.clientScope === null || m.clientScope.includes(clientId);
  return m.clientId === clientId;
}
```

`viewer.ts`:
- `resolveViewer`'s input gains `clientHint?: string | null`.
- In the session branch, replace `const m = pickMembership(…)` with:

```ts
    let m = pickMembership(memberships, input.membershipCookie);
    // Decision 16 (5a carry-over): a link into /c/<id> opens under a membership that covers that client, without changing the cookie.
    const hint = input.clientHint;
    if (m && hint && isUuid(hint) && memberships.length > 1) {
      const [c] = await service.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, hint));
      if (c && !coversClient(m, hint, c.agencyId)) m = memberships.find((x) => coversClient(x, hint, c.agencyId)) ?? m;
    }
```

Import `isUuid` (`@cs/core`), `client` (`@cs/db`), `eq` (`drizzle-orm`), `coversClient` (`@cs/tools`).

`current-viewer.ts` — pass `clientHint: clientIdFromPath(h.get('x-rm-path') ?? '')` (import `clientIdFromPath` from `@/components/shell/nav-items` — a pure, client-safe module). The `x-rm-path` header is set by `proxy.ts` on every request, including RSC navigations.

The sidebar is computed in the layout from the same `getViewer()` result, so a full page load (the email-link case) shows the covering membership's nav. Note one limitation in a code comment: a later client-side navigation away from `/c/<id>` keeps the layout's membership until the next full load (HANDOVER §6 L1).

- [ ] **Step 4: Run tests** — Step 2 commands → PASS (whole files). Typecheck both packages.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/access apps/web/src/server
git commit -m "feat(web,tools): /c/<id> resolves under a membership that covers the client"
```

---

### Task 17: 5b-1 carry-over — suggestion throttle, `PinPageSwitch`, atomic recommendation status

**Files:**
- Modify: `packages/tools/src/limits.ts`, `packages/tools/src/tools/competitors.ts`, `packages/tools/src/tools/competitors.test.ts`, `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page-controls.tsx`, `packages/engine/src/briefs/recommendations.ts`, `packages/engine/src/briefs/recommendations.test.ts`
- Create: `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page-controls.test.tsx` (if absent; otherwise extend it)

**Interfaces:**
- Produces: `SUGGEST_COOLDOWN_MINUTES = 10` (`limits.ts`); `request_competitor_suggestions` refuses while a search is queued/running or within the cooldown; `updateRecommendationStatus` is serialised per recommendation.

- [ ] **Step 1: Write the failing tests**

`competitors.test.ts` (new `describe`; build a registry with a fake `jobStatus`):

```ts
describe('request_competitor_suggestions throttle (decision 17)', () => {
  const area = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
  const withJob = (job: Awaited<ReturnType<JobStatusLookup>>) =>
    createToolRegistry({ app: dbs.app, service: dbs.service, enqueue: async () => {}, jobStatus: async () => job }, { audit: { record: async () => {} } });
  beforeEach(async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientA1));
  });
  it('refuses while a search is queued or running, and for 10 minutes after one finished', async () => {
    const now = Date.now();
    for (const state of ['created', 'active', 'retry'] as const) {
      await expect(withJob({ state, createdOn: new Date(now), completedOn: null }).invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/already running/) });
    }
    await expect(withJob({ state: 'completed', createdOn: new Date(now - 300_000), completedOn: new Date(now - 120_000) }).invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(withJob({ state: 'completed', createdOn: new Date(now - 3_600_000), completedOn: new Date(now - 11 * 60_000) }).invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toEqual({ queued: true });
    await expect(withJob({ state: 'failed', createdOn: new Date(now - 60_000), completedOn: new Date(now - 30_000) }).invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toEqual({ queued: true });
    await expect(withJob(null).invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toEqual({ queued: true });
  });
});
```

(Use the file's admin ctx name; import `JobStatusLookup` from `../deps`.)

`recommendations.test.ts` (engine; reuse its seeded recommendation and agency ctx):

```ts
it('serialises concurrent status changes so feedback history never skips a step (decision 17)', async () => {
  await Promise.all([
    updateRecommendationStatus(deps, am, recId, 'in_progress'),
    updateRecommendationStatus(deps, am, recId, 'done'),
  ]);
  const rows = await dbs.owner.select().from(feedback).where(eq(feedback.subjectId, recId)).orderBy(asc(feedback.createdAt), asc(feedback.id));
  expect(rows).toHaveLength(2);
  expect((rows[1]!.before as { status: string }).status).toBe((rows[0]!.after as { status: string }).status);
});
```

(If `feedback.createdAt` ties at microsecond resolution, sort in JS by matching `before`/`after` chains instead: exactly one row has `before.status === 'todo'`, and the other's `before` equals that row's `after`.)

`page-controls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const setPinAction = vi.fn();
vi.mock('../actions', () => ({ setPinAction: (...a: unknown[]) => setPinAction(...a), addPageAction: vi.fn() }));
const { PinPageSwitch } = await import('./page-controls');
const page = { id: 'p1', url: 'https://smith.example/pricing', pageType: 'pricing', source: 'discovered', pinned: false, active: true, cadence: 'daily', lastCapturedAt: null };

describe('PinPageSwitch (decision 17)', () => {
  it('posts the new value and shows a refusal, falling back to the server value', async () => {
    setPinAction.mockResolvedValueOnce({ ok: false, error: 'Not found' });
    render(<PinPageSwitch clientId="c1" competitorId="k1" page={page} />);
    const sw = screen.getByRole('switch', { name: `Pinned — ${page.url}` });
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Not found'));
    const fd = setPinAction.mock.calls[0]![1] as FormData;
    expect([fd.get('pageId'), fd.get('pinned')]).toEqual(['p1', 'true']);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/competitors.test.ts`, `pnpm --filter @cs/engine exec vitest run src/briefs/recommendations.test.ts`, `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/competitors/[competitorId]"` → FAIL (the recommendation test may pass by luck on a fast DB — run it 3 times; with the current non-atomic code, at least one run should show two rows both with `before: todo`).

- [ ] **Step 3: Implement**

`limits.ts`: `/** Decision 17 (5b-2): a new paid competitor search waits this long after the last one finished. */ export const SUGGEST_COOLDOWN_MINUTES = 10;`

`competitors.ts` — in `request_competitor_suggestions`, after the keyword/area check and before enqueueing:

```ts
    // 5b-2 decision 17 (5b-1 Minor 1): the UI blocks a second click, but the tool must not start a second paid search either.
    if (deps.jobStatus) {
      const job = await deps.jobStatus('suggest-competitors', `suggest:${clientId}`);
      if (job && (job.state === 'created' || job.state === 'retry' || job.state === 'active')) throw new ToolError('invalid_input', 'A competitor search is already running for this client');
      if (job?.state === 'completed' && job.completedOn && Date.now() - job.completedOn.getTime() < SUGGEST_COOLDOWN_MINUTES * 60_000) {
        throw new ToolError('invalid_input', 'A search just finished — its suggestions are below. You can search again in a few minutes.');
      }
    }
```

`page-controls.tsx` — replace `PinPageSwitch` (and its long ref/RAF comment) with the `AutoSendSwitch` pattern:

```tsx
/** Decision 17 (5b-1 Minor 3): same optimistic pattern as AutoSendSwitch — React reverts to `page.pinned` once the transition ends. */
export function PinPageSwitch({ clientId, competitorId, page }: { clientId: string; competitorId: string; page: TrackedPageView }) {
  const [pinned, setPinned] = useOptimistic(page.pinned);
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Switch
        checked={pinned}
        disabled={isPending}
        aria-label={`Pinned — ${page.url}`}
        onCheckedChange={(next: boolean) => {
          if (isPending) return;
          startTransition(async () => {
            setPinned(next);
            const fd = new FormData();
            fd.set('clientId', clientId);
            fd.set('competitorId', competitorId);
            fd.set('pageId', page.id);
            fd.set('pinned', next ? 'true' : 'false');
            setResult(await setPinAction({ ok: true }, fd));
          });
        }}
      />
      <Message state={result} />
    </div>
  );
}
```

Update the React imports (`useOptimistic`, `useState`, `useTransition`; drop `useEffect`/`useRef` if `AddPageForm` doesn't need them). Check the switch's role/`aria-checked` in `@cs/ui`'s `Switch` (Radix renders `role="switch"`).

`packages/engine/src/briefs/recommendations.ts` — `updateRecommendationStatus` becomes:

```ts
export async function updateRecommendationStatus(deps: { service: Db; app: Db }, ctx: AccessContext, id: string, status: RecommendationStatus, reason?: string): Promise<void> {
  if (!hasPermission(ctx, 'manage')) throw new ToolError('permission_denied', 'This role may not change recommendations');
  const [visible] = await withTenant(deps.app, ctx, (tx) => tx.select({ clientId: recommendation.clientId }).from(recommendation).where(eq(recommendation.id, id)).limit(1));
  if (!visible || !canAccessClient(ctx, visible.clientId)) throw new ToolError('not_found', 'Recommendation not found');
  if (status === 'dismissed' && !reason?.trim()) throw new ToolError('invalid_input', 'A dismissal needs a reason');
  // 5b-2 decision 17 (5b-1 Minor 6): read, update and record feedback under one row lock, so concurrent changes serialise
  // and every feedback row's `before` is the status it actually replaced.
  await deps.service.transaction(async (tx) => {
    const [r] = await tx.select().from(recommendation).where(eq(recommendation.id, id)).for('update');
    if (!r || r.status === status) return;
    await tx.update(recommendation).set({ status, dismissReason: status === 'dismissed' ? reason!.trim() : null, updatedAt: new Date() }).where(eq(recommendation.id, id));
    await tx.insert(feedback).values({ agencyId: r.agencyId, clientId: r.clientId, subjectType: 'recommendation', subjectId: id, kind: 'status', actor: ctx.userId, before: { status: r.status }, after: { status }, reason: reason?.trim() || null });
  });
}
```

- [ ] **Step 4: Run tests** — Step 2 commands → PASS (whole files). Typecheck `@cs/tools`, `@cs/engine`, `@cs/web`.

- [ ] **Step 5: Commit**

```bash
git add packages/tools packages/engine apps/web
git commit -m "fix: throttle competitor searches server-side, optimistic PinPageSwitch, atomic recommendation status (5b-1 carry-over)"
```

---

### Task 18: E2E, full suite, final review and documentation

**Files:**
- Modify: `apps/web/e2e/seed.ts`, `apps/web/e2e/workflow.spec.ts`, `docs/HANDOVER.md`, `docs/superpowers/plans/2026-09-29-roadmap.md`
- Possibly: any file the final review asks to fix

- [ ] **Step 1: Seed the 5b-2 E2E data** (`apps/web/e2e/seed.ts`, after the existing inserts; reuse its `db`, `agencyId`, `clientId`)

```ts
  // 5b-2: spend near the cap (decision 6), a prospect with a ready snapshot (decisions 8–11), a pending theme proposal (decision 4).
  await db.insert(llmCall).values({ agencyId, clientId, task: 'brief_writer', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 13, latencyMs: 1, ok: true });
  const [prospect] = await db
    .insert(client)
    .values({ agencyId, name: 'E2E Prospect Dental', verticalId: 'dental', status: 'prospect', keywords: ['dentist'], serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 10, zips: [] } })
    .returning();
  const [rival] = await db.insert(competitor).values({ name: 'Bright Smiles E2E', placeId: 'ChIJe2eBrightSmile1' }).returning();
  await db.insert(clientCompetitor).values({ agencyId, clientId: prospect!.id, competitorId: rival!.id });
  await db.insert(prospectReport).values({
    agencyId, clientId: prospect!.id, status: 'ready', finishedAt: new Date(),
    data: {
      generatedAt: new Date().toISOString(), keywords: ['dentist'], points: 9, scanId: null, notes: [],
      businesses: [{ competitorId: rival!.id, name: 'Bright Smiles E2E', self: false, gbp: { rating: 4.4, reviews: 120, category: 'Dentist', extraCategories: 1 }, ads: { google: 2, meta: null }, ranks: [{ keyword: 'dentist', found: 5, top3: 2, averageRank: 3.4 }] }],
    },
  });
  await db.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'e2e_hidden_fees', name: 'E2E hidden fees', description: 'Unexpected trip fees', otherCount: 12, sampleReviewIds: [] });
```

Add the new names to the file's `@cs/db` import. The E2E admin (`admin@e2e.test`) is a platform operator through `PLATFORM_ADMIN_EMAILS` (Task 7's `playwright.config.ts` change).

- [ ] **Step 2: Add the E2E tests** (append to `workflow.spec.ts`; they reuse `ADMIN_STATE` — never sign in again, HANDOVER §6)

```ts
test('usage shows the near-cap warning and an admin raises the cap', async ({ page }) => {
  await page.goto('/agency/usage');
  await expect(page.getByText(/87% · near cap/)).toBeVisible();
  await page.getByLabel('Monthly cap for E2E HVAC (USD)').fill('30');
  await page.getByRole('button', { name: 'Save limits for E2E HVAC' }).click();
  await expect(page.getByText('Limits saved.')).toBeVisible();
  await expect(page.getByText(/43%/)).toBeVisible();
});

test('an admin edits a playbook and an unknown placeholder is refused', async ({ page }) => {
  await page.goto('/agency/playbooks');
  const card = page.locator('form').filter({ has: page.locator('input[name="playbookId"][value="price_cut_bundle"]') });
  await card.getByLabel('Template').fill('Hi {{client}}');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('alert')).toContainText('{{client}}');
  await card.getByLabel('Template').fill('Bundle {{service}} instead of matching {{competitor}}.');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('Playbook saved.')).toBeVisible();
});

test('a prospect’s landscape report shows and the prospect converts to a client', async ({ page }) => {
  await page.goto('/agency/prospects');
  await page.getByRole('link', { name: 'E2E Prospect Dental' }).click();
  await expect(page.getByRole('table', { name: 'Map visibility' }).getByText('5/9 · top 3: 2 · avg 3.4')).toBeVisible();
  await page.getByRole('button', { name: 'Convert to client' }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await page.goto('/agency');
  await expect(page.getByRole('link', { name: 'E2E Prospect Dental' })).toBeVisible();
});

test('a platform operator approves a theme proposal', async ({ page }) => {
  await page.goto('/platform/themes');
  await page.getByRole('button', { name: 'Approve E2E hidden fees' }).click();
  await expect(page.getByText('Approved “E2E hidden fees”.')).toBeVisible();
});
```

Note: the usage-page 43 % is $13 of a $30 cap. Run order matters only for the prospect test (it converts the prospect). Keep it after the others in the file, or make it the last test.

- [ ] **Step 3: Run E2E**

Check free commit memory first (`Get-CimInstance Win32_OperatingSystem | Select-Object FreeVirtualMemory` ≥ ~8 GB; HANDOVER §6). Then run `pnpm --filter @cs/web e2e` (foreground, `timeout: 600000`). Expected: 10/10 (6 existing + 4 new). Fix any real bug found with a regression test first — 5b-1's E2E pass found two real ones.

- [ ] **Step 4: Full suite**

Run `pnpm typecheck` (12/12), then `npx turbo run test --concurrency=1 --continue` with `run_in_background` (~45 min). Wait for the completion notice and start nothing else meanwhile. A package failing with only `connect ETIMEDOUT` is a Neon flake: re-run that package once (HANDOVER §6). Record per-package counts.

- [ ] **Step 5: Final whole-branch review**

Dispatch the final review (most capable model) over `git diff main...phase-5b2-operations`, with this plan's Review Focus as the checklist. Fix every Critical/Important finding with a test first, re-review, and park minors in the roadmap carry-over.

- [ ] **Step 6: Documentation**

`docs/HANDOVER.md`:
- State line: 5b-2 complete on branch `phase-5b2-operations`; next is merge, then write 5c.
- A **Phase 5b-2** paragraph in §3: tools added; decisions 1–18 one line each; migrations `0036`/`0037`; the engine/collector changes (prospect gating list, claim fix, `reviewQuestions`, atomic recommendations); the new worker job `prospect-snapshot`; test counts.
- §4 env:
  - `PLATFORM_ADMIN_EMAILS` (comma-separated; the owner's address makes the owner an operator).
  - `POSTMARK_TEST_SERVER=true` while the Postmark test-server token is in `.env`.
  - Ask the owner before adding either to `.env`; never print `.env`.
- §5 item 2 — append the 5b-2 owner-verification steps, deferred to the end of Phase 5 (decided 2026-10-06):
  - restart the worker so `prospect-snapshot` registers;
  - check `/agency/usage` numbers against `llm_call`/`vendor_call` for the month;
  - set a cap and a competitor limit, and see the competitors page show the new limit;
  - edit, turn off and reset a playbook;
  - open `/platform/reviews` and `/platform/themes` as the owner. `cs_dev` may have no open reviews — check with `decisions reviews`;
  - create a prospect near Granbury with 2 keywords and a 25 km area, Find competitors (≈ $0.04), accept 2–3, and Run snapshot (≈ $0.10). Check the report; leave the prospect **unconverted** unless the owner wants weekly paid collection to start for it;
  - send one email through the Postmark test server and see a `vendor_call` row with `operation = 'email_test'`, `cost_usd = 0`;
  - sign in again by magic link (hashed tokens).
- §6 gotchas:
  - prospects get no recurring work — the full filter list, and that a new scheduler must filter `client.status = 'active'`;
  - operator tools check `PLATFORM_ADMIN_EMAILS` on every call; the nav flag is cosmetic;
  - `resolveDecisionReview` errors are `ToolError`s now;
  - settings writes are tools (call `runTool`, never the service function);
  - usage counts attributed ledger rows only.

`docs/superpowers/plans/2026-09-29-roadmap.md`:
- Phase 5 row: 5b-2 ✅ with the plan link.
- A "Phase 5b-2 carry-over" section: decision 18's "Not in 5b-2" list, parked review minors, and per-task deferred minors.
- Tick ✅ the closed items in the "Phase 5a carry-over" (Google refusal, hashed tokens, audit logging, m2, m3, m4, multi-membership) and "Phase 5b-1 carry-over" (Minor 1, Minor 3, Minor 6) sections, the Phase 3d `resolveDecisionReview` claim item, and the Phase 4b Postmark ledger item.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e docs
git commit -m "test(e2e),docs: 5b-2 workflow E2E, handover and roadmap"
```

---

## Self-review notes (writing-plans checklist, done 2026-10-07)

1. **Spec / owner-scope coverage** — every item in the 5b-1 plan's 5b-2 row maps to a task:

| 5b-2 row item | Task |
|---|---|
| Playbook overrides editor | 5, 6 |
| Platform-operator queues via `PLATFORM_ADMIN_EMAILS` | 7, 8, 9 |
| `resolveDecisionReview` claim fix | 7 |
| $15 default cap, spend vs cap from the ledger, 80 % warning | 1, 3, 4 |
| Configurable competitor limit | 1, 3, 4 |
| Postmark test-server ledger fix | 2 |
| Question-quota placeholder | 3, 4 |
| Prospecting snapshot (prospect status, one GBP + ads pull, 3×3 scan, deterministic report, convertible) | 1, 10, 11, 12, 13 |
| `session.create.before` | 14 |
| Hashed tokens | 14 |
| Audit-logging 5a mutations, m2, m4 | 15 |
| m3 | 14 |
| Multi-membership switch | 16 |

   Folded-in 5b-1 carry-over (Minors 1, 3, 6) is in Task 17. Spec §5.1's "seats" under Users/usage is covered by the existing team page (5a). Seat *limits* are a billing concern (spec §10.6: metering only) — not added.
2. **Placeholder scan** — no TBD/TODO. Where an implementer must match local code they can't see from here (existing test fixture names, a barrel export, Badge variants, jsdom `FormData(form, submitter)`), the step names exactly what to check and what to do either way.
3. **Type consistency:**
   - `ProspectReportData`/`ProspectBusiness`/`ProspectRank`: `@cs/db` (Task 1) → `report.ts` (Task 11) → `ProspectReportDataView` (Task 12) → `ProspectReportView` component (Task 13).
   - `SpendView`/`spendView`: Task 3 → Task 4.
   - `isPlatformOperator`/`platformAdmins`: Task 7 → Tasks 8, 9.
   - `QueueJob` gains `prospect-snapshot` in Task 12 — the worker job name in Task 11 matches.
   - `listRankClients` moves to collectors in Task 10 — the worker uses it.
   - `assertRoomForCompetitor` keeps its signature (Task 3).
4. **Review Focus → tests:**
   - Focus 1: Tasks 10, 12 (claim/score/brief/move/report/portfolio filters + convert resumes collection).
   - Focus 2: Tasks 7, 8 (non-operator, client role, guest).
   - Focus 3: Task 7 (concurrent resolve, superseded).
   - Focus 4: Task 3 (bad caps/limits, AM/client refusals, lowered limit).
   - Focus 5: Task 5 (unknown placeholder, 2 001 chars, AM refusal, reset).
