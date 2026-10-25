# Phase 15c-3a — Agency management (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; implementers write code + tests from Behaviour + Tests. Full code appears only for the migration, the target-agency context, the hold guard and decided copy.

**Goal:** Platform staff can rename an agency, manage its people, put it on hold (read-only, billing frozen, admins emailed), and archive/unarchive it, all from `/platform/agencies/<id>` and the agency list.

**Architecture:**
- **Hold:** three `agency` columns. `billingAccess().onHold` feeds the existing guard, `agencyServiceable` and the billing paths. A new `applyHoldCollection` pauses or resumes Stripe collection after commit.
- **New tools:** twelve platform tools in a new module `platform-agency.ts`. They reuse `team.ts` with a target-agency context and the archive logic moved out of the worker.
- **Web:** the detail page and the list get a Manage menu, a People section, hold/archive dialogs and status filters.

**Spec:** `docs/superpowers/specs/2026-10-25-phase-15c3a-agency-management-design.md` (A1–A9, §3–§5, binding), on top of `docs/superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md` §5. Mockups: `docs/design-system/mockups/agency-management/agency-management.html` (owner-approved).

**Branch / worktree:** `phase-15c3` in `../CompetitorSpy-wt/phase-15c3`; test DB `cs_phase_15c3_test` (already in `.env`); work file `docs/work/phase-15c3.md`.

## Global constraints
- Root `CLAUDE.md` Essentials; `docs/gotchas-cross-cutting.md`; the `CLAUDE.md` of every package touched (`packages/{billing,tools,db,email}`, `apps/{web,worker}`). Never print/stage `.env`. **No new env vars** (`SUPPORT_REPLY_TO` already exists).
- **No Stripe call inside a DB transaction.** Hold, lift and webhook pauses call Stripe after commit and record failures; they never roll back.
- Platform tools: `permission: 'agency'`, `audit: 'skip-web'`, body inside `operate()` (role check first, then `requireAgency`, then one `withPlatformAudit` row into the target agency's `audit_log`).
- Refusals the user sees use `ToolError(code, msg, { userFacing: true })`. Unknown, foreign or archived agency → `not_found` (pages 404).
- Web writes go through `runTool` and server actions. Every write sits behind `ConfirmDialog`. Status words come from `lib/labels.ts`. Dates use `formatDate(v, { tz: viewerTimeZone })`.
- Logs carry ids and error names only: no emails, names, hold reasons or Stripe messages.
- Every new tool needs: an `ISOLATION_FIXTURES` entry, access marks + `access-marks.test.ts`, the 8b tool-access doc row. New module joins `PLATFORM_TOOLS` in `billing-guard.ts`.
- Hold copy (decided, spec §4.1): agency roles **"This account is on hold. Contact {supportEmail} to restore it."**; client roles keep `ACCOUNT_NEEDS_ATTENTION_MESSAGE`.
- Last-admin copy: **"An agency needs at least one admin."** (with the full stop; also update `revokeMembership`).
- Commits end with the trailer from root `CLAUDE.md` (subagents: own model); LF only. Test scope: root `CLAUDE.md` § Process 6 (focused tests per task; `test:affected` + `e2e:affected` once at the final review).

## Decisions (plan-local; spec A1–A9 bind)
1. **`suspended_*` columns are read and written only by the service role.** `isOnHold` and `billingAccess` read `agency.suspended_at` in the same query path as `agency_billing`. No RLS change: app roles already have no `UPDATE` on `agency`, and `SELECT` of the new columns is harmless.
2. **Guard order:** `onHold` is checked before the Stripe states in `assertAgencyServiceable`, so a held agency always gets the hold copy.
3. **`resumeClient` / `assertCanActivateClient` hold refusal** = `ToolError('service_paused', holdMessage(role), { userFacing: true })`. 7b2's `liftAutoPause` swallows `service_paused`.
4. **`applyHoldCollection` lives in `@cs/billing`** (`hold.ts`). Each target runs in its own try/catch, and one event row is written per run. Retry re-runs every target; pause and resume are idempotent in Stripe.
5. **Webhook pause of a new subscription** happens after the webhook transaction commits, in the route handlers that already call the gateway after commit (`apps/web/src/app/api/stripe/webhook/route.ts`, `…/connect-webhook/route.ts`). It runs only when `isOnHold`.
6. **Archive module path:** `packages/tools/src/platform/archive.ts`. `apps/worker/src/purge.ts` re-exports `archiveTenant`/`ArchiveResult` from `@cs/tools`, so CLI imports keep working.
7. **Hold email** is sent from the tool after commit (not from the server action), so MCP/Ask callers get it too. `emailsSent` is returned for the UI toast.
8. **List counts** come from the same tool call (`counts`), computed with two `count(*)` queries independent of `status`/`query`.

## File structure
- `packages/db/migrations/<next>_agency_hold.sql`, `packages/db/src/schema/*.ts` (agency table), `packages/db/src/filters.ts` (+ test)
- `packages/core/src/…` — `DEFAULT_SUPPORT_EMAIL` (next to other shared constants; export from index)
- `packages/billing/src/access.ts`, `client-pause.ts`, `seats.ts`, `daily.ts`, `hold.ts` (new), `types.ts`, `fake-gateway.ts`, `stripe-gateway.ts`, `index.ts` (+ tests)
- `packages/tools/src/billing-guard.ts`, `deps.ts`, `access/team.ts`, `access/team-invite-email.ts`, `access/client-invite.ts`, `platform/archive.ts` (new), `platform/hold-email.ts` (new), `platform/agency-ctx.ts` (new), `tools/platform-agency.ts` (new), `tools/platform-billing.ts` (`requireAgency`), `tools/platform-console.ts`, `isolation/fixtures.ts`, `index.ts` (+ tests)
- `packages/email/src/templates/agency-hold.tsx` (new), `types.ts`, `render.ts` (+ test)
- `apps/worker/src/purge.ts`, `cli/archive.ts`, `deps.ts`
- `apps/web/src/app/(platform)/platform/agencies/{page.tsx,agency-table.tsx,agency-actions.ts}`, `…/agencies/[id]/{page.tsx,actions.ts,manage-menu.tsx,people-section.tsx,hold-banner.tsx,archived-view.tsx}` (+ tests), `components/shell/{app-shell.tsx,billing-banner.tsx}`, `server/billing-state.ts`, `server/tools.ts` (wire `supportEmail`), `lib/labels.ts`, `help/copy/platform.ts`, `apps/web/e2e/platform.spec.ts`, `apps/web/src/app/api/stripe/**/route.ts`
- Docs: `docs/help/pages/<platform agencies detail guide>.md`, 8b tool-access doc, `packages/billing/CLAUDE.md`, `docs/work/phase-15c3.md`, `docs/archive/phase-15c3a-copy-signoff.md` (created at the end, signed at merge)

## Dependencies on in-flight work (re-check in Task 0)
- **phase-7c2** (executing): claims migration **0093** (`ops_alert`); this branch takes the next free number at execution. Whichever merges second renumbers and regenerates `meta/_journal.json` + snapshot. Both branches edit `packages/tools/src/isolation/fixtures.ts` and `packages/tools/src/index.ts` (append-only hunks). 7c2's readiness checks call `agencyServiceable`; after Task 1, held agencies drop out (intended).
- **phase-7b2** (not started; waits for us): consumes `agency.suspended_at`, `billingAccess().onHold`, `service_paused` from guard/`resumeClient`/`assertCanActivateClient`, the unchanged allow-list, and `pauseCollection`/`resumeCollection`. **We must not edit** `connect-daily.ts` internals or `client-billing-state.ts`. We only skip `runConnectDaily` from `daily.ts` for held agencies. At merge, record 7b2's Task 0 answers in the work file: (a) skipped; (b) `service_paused`; (c) allow-list unchanged; (d) files touched.
- **phase-16** (docs only): no overlap now; it restyles these pages later.

## Review focus
1. **Held + Stripe active:** an agency whose Stripe state is `active` but `suspended_at` is set must get `service_paused` from every write tool except the allow-list, and from Ask/MCP up-front checks (Task 2 test "hold beats active Stripe state").
2. **Operator context never leaks:** `platformAgencyCtx` is only built after `requirePlatformOperator` + `requireAgency`. Agency users calling any `platform_*` tool get `not_found`/`permission_denied` (Task 6/7 isolation fixtures). A staff member's address is never Cc'd or used as Reply-To on agency or client invites (Task 5 tests).
3. **Limits shared across both paths:** 3 agency-side resends + 1 operator resend in 24 h → the operator's call is refused; the operator's invites count toward the agency's 20/day (Task 5 test "operator resend counts toward RESEND_LIMIT").
4. **Partial Stripe failure:** one client subscription fails to pause, so the hold still stands, the `_failed` event is newest, `holdBillingIssue = 'pause'`, and Retry succeeds and clears it (Task 3 + Task 8 tests).
5. **Archived reach:** rename/hold/invite on an archived agency → `not_found`; `get_platform_agency`/`list_agency_people`/`platform_unarchive_agency` work; an archived agency never shows under Active or On hold (Task 6/8 tests).

---

### Task 0: Pre-flight
**Goal:** Prove the Dependencies; fix the plan inline where they fail.
**Steps:**
- `git fetch && git rebase main`; `pnpm install`. Confirm `.env` `TEST_*` URLs point at `cs_phase_15c3_test`.
- `git branch --no-merged main`; re-read `phase-7c2`/`phase-7b2` work files; note 7c2's migration number if merged.
- `rg "agencyServiceable\(" packages apps --glob '!*.test.ts' | wc -l` (expect about 29; record the count).
- `rg "resumeClient\(|assertCanActivateClient\(" packages apps --glob '!*.test.ts'`: every caller passes `role` where it has one.
- `rg "archiveTenant" apps packages`: only `purge.ts`, `cli/archive.ts` and tests.
- Find the Stripe webhook routes that already call the gateway after commit (Decision 5); record the paths.
- Find the 8b tool-access doc (`rg -l "tool access" docs`) and the platform agencies help guide file (`help_key` `page:platform.agencies.detail`).
**Done when:** findings are in `docs/work/phase-15c3.md`, and the plan is edited where an assumption failed.

### Task 1: Hold data + access primitives
**Goal:** `agency.suspended_*` columns exist; `billingAccess` knows `onHold`; `agencyServiceable` excludes held agencies; `holdMessage` and `DEFAULT_SUPPORT_EMAIL` exist.
**Files:** migration (`pnpm --filter @cs/db generate --custom --name=agency_hold`), agency schema, `packages/db/src/filters.ts` (+ test), `packages/core` constant, `packages/billing/src/access.ts` (+ `access.test.ts`), `apps/worker/src/deps.ts`.
**Migration (full):**
```sql
ALTER TABLE agency ADD COLUMN suspended_at timestamptz;
ALTER TABLE agency ADD COLUMN suspended_reason text;
ALTER TABLE agency ADD COLUMN suspended_by text;
ALTER TABLE agency ADD CONSTRAINT agency_suspended_reason_len CHECK (suspended_reason IS NULL OR char_length(suspended_reason) BETWEEN 3 AND 500);
ALTER TABLE agency ADD CONSTRAINT agency_suspended_consistent CHECK ((suspended_at IS NULL) = (suspended_reason IS NULL) AND (suspended_at IS NULL) = (suspended_by IS NULL));
```
**Interfaces (Produces):**
```ts
// @cs/core
export const DEFAULT_SUPPORT_EMAIL = 'support@rivalmonday.app';
// @cs/billing access.ts
interface BillingAccess { /* existing */ onHold: boolean }        // readOnly = state === 'read_only' || onHold
export async function isOnHold(db: BillingDb, agencyId: string): Promise<boolean>;
export function holdMessage(role: string, supportEmail?: string): string;
export const HOLD_MESSAGE = (supportEmail: string) => `This account is on hold. Contact ${supportEmail} to restore it.`;
```
**Behaviour:**
- `holdMessage`: `agency_admin`/`account_manager` → `HOLD_MESSAGE(supportEmail ?? DEFAULT_SUPPORT_EMAIL)`; any other role (client roles, contacts) → `ACCOUNT_NEEDS_ATTENTION_MESSAGE`.
- `agencyServiceable` gains `AND NOT EXISTS (SELECT 1 FROM agency ax WHERE ax.id = … AND ax.suspended_at IS NOT NULL)`. Fold it into the existing archived sub-select: `AND (ax.archived_at IS NOT NULL OR ax.suspended_at IS NOT NULL)`.
- Worker `DEFAULT_SUPPORT_REPLY_TO` becomes a re-export of `DEFAULT_SUPPORT_EMAIL` (or callers switch; keep the name exported for one release).
- **Follow pattern:** existing `billingAccess`/`agencyServiceable` tests.
**Tests (TDD):**
- `access.test.ts` › `onHold`: held + Stripe `active` → `{ onHold: true, readOnly: true, suspended: false }`; not held → `onHold: false`.
- `holdMessage`: `agency_admin` and `account_manager` → the exact `HOLD_MESSAGE('support@rivalmonday.app')` string; `client_owner`/`client_viewer` → `ACCOUNT_NEEDS_ATTENTION_MESSAGE`; custom `supportEmail` is used.
- `filters.test.ts`: held agency's client is excluded by `agencyServiceable`; unheld is included; archived still excluded.
- Migration check: setting `suspended_at` without a reason fails `agency_suspended_consistent`.
**Done when:** `pnpm --filter @cs/db exec vitest run filters`, `pnpm --filter @cs/billing exec vitest run access` pass; `pnpm --filter @cs/db migrate` applies cleanly on the test DB.

### Task 2: Hold enforcement (guard, activation, seats, daily job)
**Goal:** A held agency is read-only through every path, and the daily billing job freezes for it (A4).
**Files:** `packages/tools/src/billing-guard.ts` (+ test), `packages/tools/src/deps.ts`, `apps/web/src/server/tools.ts`, worker deps wiring, `packages/billing/src/access.ts`, `client-pause.ts`, `seats.ts`, `daily.ts` (+ tests).
**Interfaces:** `ToolDeps.supportEmail?: string` (web/worker set it from `SUPPORT_REPLY_TO`). **Consumes:** Task 1.
**Behaviour (guard, full code; security-sensitive):**
```ts
export async function assertAgencyServiceable(service: ToolDeps['service'], ctx: { agencyId: string; role: string }, supportEmail?: string): Promise<void> {
  const access = await billingAccess(service, ctx.agencyId);
  // 15c-3a (C6): an operator hold wins over any Stripe state, and no payment lifts it.
  if (access.onHold) throw new ToolError('service_paused', holdMessage(ctx.role, supportEmail), { userFacing: true });
  if (access.readOnly || access.suspended) throw new ToolError('service_paused', pausedMessage(ctx.role));
}
```
`billingWriteGuard(deps)` passes `deps.supportEmail`. `PAUSED_WRITE_ALLOW_LIST` is unchanged. Every other `assertAgencyServiceable` caller (Ask turn, MCP `tools/call`) passes the support email where it has deps.
- `assertCanActivateClient(tx, agencyId, opts)` and `resumeClient(tx, clientId, actor, opts)`: first statement after the lock is `if (await isOnHold(tx, agencyId)) throw new ToolError('service_paused', holdMessage(opts.role ?? 'agency_admin'), { userFacing: true })`.
- `syncSeats`: return `'skipped'` when held (before any gateway call).
- `runBillingDaily`: for a held agency, skip seat retry, reconcile, timer `apply`, reminders and `runConnectDaily`. Still update `agency_daily_stat` with `billingState: row?.state ?? 'pilot'`, `paidSeats: 0`, `mrrCents: 0` and `clientMrrCents: 0`. Load held ids once per run (`select id from agency where suspended_at is not null and archived_at is null`).
- No deadline shifts anywhere (A9).
**Tests (TDD):**
- `billing-guard.test.ts` › `hold beats active Stripe state`: held agency with state `active`: a write tool not on the allow-list → `service_paused` with the hold copy for `agency_admin`, and the neutral copy for `client_owner`; `create_portal_session` (allow-listed) passes.
- `assertAgencyServiceable` with `supportEmail: 'help@x.test'` → message contains `help@x.test`.
- `access.test.ts` › `assertCanActivateClient refuses a held agency with service_paused` even with free seats.
- `client-pause.test.ts` › `resumeClient refuses on hold`.
- `seats.test.ts` › `syncSeats skips a held agency` (fake gateway records no call).
- `daily.test.ts` › `held agency: no Connect/timer/seat work, stat written with MRR 0`: a trial past its end stays `trialing`; `runConnectDaily` is not invoked (spy, or no `client_billing` change for a client with an expired failed payment).
**Done when:** `pnpm --filter @cs/tools exec vitest run billing-guard` and `pnpm --filter @cs/billing exec vitest run access client-pause seats daily` pass.

### Task 3: Collection pause (gateway + `applyHoldCollection` + webhook)
**Goal:** Hold and lift pause or resume Stripe collection on the agency's platform subscription and its clients' Connect subscriptions; failures are visible and retryable.
**Files:** `packages/billing/src/types.ts`, `fake-gateway.ts`, `stripe-gateway.ts`, `hold.ts` (new), `index.ts` (+ `hold.test.ts`, `stripe-gateway.test.ts`, `fake-gateway.test.ts`); the webhook routes from Task 0.
**Interfaces (Produces):**
```ts
// BillingGateway
pauseCollection(subscriptionId: string, o?: { stripeAccount?: string }): Promise<void>;   // subscriptions.update({ pause_collection: { behavior: 'void' } })
resumeCollection(subscriptionId: string, o?: { stripeAccount?: string }): Promise<void>;  // subscriptions.update({ pause_collection: '' })
// hold.ts
export interface HoldBillingResult { done: number; failed: { kind: 'agency' | 'client'; clientId?: string; clientName?: string }[] }
export async function applyHoldCollection(db: Db, gw: BillingGateway | null, agencyId: string, mode: 'pause' | 'resume', actor: string): Promise<HoldBillingResult>;
export type HoldBillingIssue = 'pause' | 'resume' | null;
export async function holdBillingIssue(db: BillingDb, agencyId: string): Promise<HoldBillingIssue>;
export async function pauseIfHeld(db: Db, gw: BillingGateway | null, agencyId: string, subscriptionId: string, o?: { stripeAccount?: string }): Promise<void>;
```
**Behaviour:**
- Targets: `agency_billing.stripe_subscription_id` when set and state ≠ `cancelled` (no `stripeAccount`). Each `client_billing` row of the agency with `stripe_subscription_id` set and state in (`active`, `payment_needed`) uses `stripeAccount` = `agency_connect.stripe_account_id`. Skip client rows when there is no account id.
- One try/catch per target; the failure is logged with ids + error name only.
- After the loop, insert one `agency_billing_event`: `from_state = to_state` = current state (or `'pilot'`), `reason` = `admin_hold_billing_ok` | `admin_hold_billing_failed`, `actor`. For `gw === null`: no calls, an `ok` event, `{ done: 0, failed: [] }`.
- `holdBillingIssue`: newest event with reason in (`admin_hold_billing_ok`, `admin_hold_billing_failed`). If it's `_failed` → `'pause'` when the agency is held, else `'resume'`. Otherwise `null`.
- The fake gateway records the calls (`calls.pauseCollection` etc.) and supports a configurable failure per subscription id.
- Webhook (Decision 5): after a checkout creates a subscription (platform or client), the route calls `pauseIfHeld`. When the call fails, `pauseIfHeld` writes the `_failed` event.
**Tests (TDD)** (`hold.test.ts`):
- `pauses agency + active client subs with the connected account`: assert the fake calls (ids, `stripeAccount`); `cancelled`/`off` client rows are skipped.
- `partial failure records _failed and the issue is 'pause'`; the hold row is untouched.
- `retry after failure clears the issue`.
- `resume mirrors pause`.
- `no gateway → ok event, nothing called`.
- `pauseIfHeld does nothing for an unheld agency`.
- `stripe-gateway.test.ts`: the request body for pause is `pause_collection[behavior]=void`, for resume `pause_collection=` (empty), with the `Stripe-Account` header when given (mirror the existing request-shape tests).
**Done when:** `pnpm --filter @cs/billing exec vitest run hold stripe-gateway fake-gateway` pass, plus the webhook route tests touched.

### Task 4: Archive service shared by CLI and tools
**Goal:** `archiveTenant` lives in `@cs/tools`; the CLI behaves exactly as before; tools can ask what live billing blocks an archive.
**Files:** create `packages/tools/src/platform/archive.ts` (+ `archive.test.ts`, moved from the worker's archive tests); modify `apps/worker/src/purge.ts`, `apps/worker/src/cli/archive.ts`, `packages/tools/src/index.ts`.
**Interfaces (Produces):**
```ts
export type ArchiveResult = { ok: true } | { error: 'not_found' | 'billing_active'; message: string };
export async function archiveTenant(db: Db, args: { kind: 'agency' | 'client'; id: string; undo: boolean }, o?: { now?: Date; audit?: 'cli' | 'none' }): Promise<ArchiveResult>;
export async function liveBilling(db: Db | Tx, agencyId: string): Promise<{ agencyPlan: boolean; clientSubscriptions: number }>;
```
**Behaviour:**
- Body and SQL move unchanged; `audit` defaults to `'cli'`, which writes today's `platform_audit_log` row (`userId: 'cli'`); `'none'` writes nothing.
- `liveBilling` splits `liveBillingQuery`'s two conditions into the two fields (same predicates: agency subscription not `pilot`/`cancelled`, client billing `enabled` and `active`/`payment_needed`).
- `purgeArchived` stays in the worker.
- **Follow pattern:** existing worker archive tests.
**Tests (TDD):** the moved tests stay green. New:
- `audit 'none' writes no platform_audit_log row`;
- `liveBilling counts client subscriptions and the agency plan`;
- the CLI test (`cli/archive.test.ts`) is unchanged and green.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform/archive` and `pnpm --filter @cs/worker exec vitest run archive purge` pass.

### Task 5: Team service changes (role change, inviter override, shared limits)
**Goal:** `team.ts` supports operator use: change role, invites that never name or Cc the operator, and resend limits counted across both tools.
**Files:** `packages/tools/src/access/team.ts`, `team-invite-email.ts`, `client-invite.ts` (+ `team.test.ts`, `team-invite-email.test.ts`, `client-invite.test.ts`).
**Interfaces (Produces):**
```ts
export type Inviter = { userId: string } | { agency: true };
export async function changeMemberRole(service: Db, ctx: AccessContext, membershipId: string, role: 'agency_admin' | 'account_manager'): Promise<{ role: Role }>;
export async function inviteMember(service, ctx, input, now?, o?: { inviter?: Inviter })   // passes inviter to the email
export async function resendInvitation(ctx, deps, invitationId, now?, o?: { inviter?: Inviter })
// sendTeamInviteEmail(deps, i: { …; inviter: Inviter })   (replaces inviterUserId)
// sendClientInvite(tx, deps, { …; inviter?: Inviter })     ({ agency: true } → cc: [])
export const RESEND_TOOLS = ['resend_invitation', 'platform_resend_invitation'] as const;
export const LAST_ADMIN_MESSAGE = 'An agency needs at least one admin.';
```
**Behaviour:**
- `changeMemberRole`: same locking as `revokeMembership` (membership row `FOR UPDATE`, then all admin rows `FOR UPDATE` when demoting an admin). The target must be an agency role, else `not_found`. Same role → return unchanged (no write). Demoting the last admin → `ToolError('invalid_input', LAST_ADMIN_MESSAGE, { userFacing: true })`. The role change sets `client_scope = NULL` (spec: promote clears scope, demote = all clients). Requires `isAdmin(ctx)`.
- `revokeMembership` uses `LAST_ADMIN_MESSAGE` and `userFacing: true`.
- `sendTeamInviteEmail` with `{ agency: true }` → `inviterName = branding.displayName`, `replyTo: null`, and no `auth.user` lookup. With `{ userId }`, behaviour is unchanged.
- `sendClientInvite` with `{ agency: true }` → `cc: []` (no inviter lookup).
- `priorResends` and `teamInviteSends` use `inArray(auditLog.tool, RESEND_TOOLS)`. The platform tool audits the input `{ invitationId }` (Task 6), so the hashes match.
**Tests (TDD):**
- `changeMemberRole`: promote AM with scope `[c1]` → admin, scope null; demote one of two admins → AM, scope null; demote the last admin → `invalid_input` + exact `LAST_ADMIN_MESSAGE`; a client-role target → `not_found`.
- `revokeMembership last admin message has a full stop`.
- `team-invite-email`: `{ agency: true }` → props `inviterName` = the agency display name, `replyTo` null.
- `client-invite`: `{ agency: true }` → the queued notification has `cc: []`.
- `operator resend counts toward RESEND_LIMIT`: 3 ok `resend_invitation` audit rows + 1 ok `platform_resend_invitation` row (same `hashInput({ invitationId })`) → the next resend is `rate_limited`.
- `teamInviteSends counts platform resends`.
**Done when:** `pnpm --filter @cs/tools exec vitest run access/team access/team-invite-email access/client-invite` pass.

### Task 6: Platform agency tools — context, people, rename
**Goal:** The new module with the target-agency context, `list_agency_people`, rename and the five people writes.
**Files:** create `packages/tools/src/platform/agency-ctx.ts`, `packages/tools/src/tools/platform-agency.ts` (+ `platform-agency.test.ts`); modify `tools/platform-billing.ts` (`requireAgency` export + option), `billing-guard.ts` (`PLATFORM_TOOLS`), `index.ts`, `isolation/fixtures.ts`, access marks + test, 8b tool-access doc.
**Interfaces (Produces):**
- `requireAgency(deps, agencyId, o?: { allowArchived?: boolean }): Promise<{ id: string; name: string; archivedAt: Date | null; suspendedAt: Date | null }>`, exported for `platform-agency.ts`/`platform-console.ts`. `operate()` gains the same option.
- Tools (names, roles, I/O binding; spec §4.4): `list_agency_people`, `platform_rename_agency`, `platform_change_member_role`, `platform_remove_member`, `platform_invite_agency_admin`, `platform_resend_invitation`, `platform_revoke_invitation`. Array `platformAgencyTools` (Task 7 appends).
- `list_agency_people` output: `{ members: { membershipId, userId, name, email, role, clients: { id, name }[] }[], invitations: { invitationId, email, role, clientId: string | null, clientName: string | null, sentAt, expiresAt }[] }`. `clients` = the client for client roles, scoped clients for scoped AMs, `[]` for all-client admins/AMs (the UI says "All clients").
**Target-agency context (full code; security-sensitive):**
```ts
// packages/tools/src/platform/agency-ctx.ts
import type { AccessContext } from '@cs/core';

/**
 * 15c-3a: the AccessContext a platform tool uses to run agency-side services (team.ts) on the agency it manages.
 * Build it ONLY inside a platform tool body, after `requirePlatformOperator` and `requireAgency` (i.e. inside `operate()`).
 * It never leaves the tool: not returned, not stored, not passed to the registry or to anything that writes audit rows.
 */
export function platformAgencyCtx(ctx: AccessContext, agencyId: string): AccessContext {
  return { ...ctx, agencyId, role: 'agency_admin', clientScope: 'all' };
}
```
**Behaviour:**
- Every tool runs `operate(deps, ctx, <min>, <name>, <auditInput>, agencyId, …)`; `list_agency_people` passes `{ allowArchived: true }`.
- `platform_resend_invitation` passes `{ invitationId }` as `auditInput`, and the others pass their parsed input. The audit row goes to the target agency's `audit_log` (existing `withPlatformAudit`).
- Rename: `name.trim()` 1–120 → `update agency set name`. Returns `{ name }`.
- Invite admin: `assertTeamInviteBudget(tx, agencyId)` then `inviteMember(…, { role: 'agency_admin', email }, now, { inviter: { agency: true } })`. Reuse `invite_member`'s email-normalising and duplicate rules (same errors).
- Resend/revoke/remove/change role call the Task 5 functions with `platformAgencyCtx` and `{ inviter: { agency: true } }`. Resend returns `{ sentAt, expiresAt, emailSent }`.
- **Follow pattern:** `tools/platform-billing.ts` (`operate`, zod I/O, `defineTool`), tests in `platform-billing.test.ts`.
**Tests (TDD)** (`platform-agency.test.ts`):
- role matrix: `viewer` can list but every write is `permission_denied`; `staff` can do all seven; a non-operator → `permission_denied` (or `not_found` per `requirePlatformOperator`).
- unknown agency → `not_found`; archived → `not_found` for writes, ok for `list_agency_people`.
- each write leaves exactly one `audit_log` row with `role` `platform_staff` in the target agency.
- invite admin: the email's inviter name is the agency name (fake transport); budget refusal at 20.
- resend: the 4th in 24 h across both tools is refused (`rate_limited`, user-facing copy unchanged).
- rename: trims; empty or 121 chars → `invalid_input`.
- isolation fixtures for all seven (an agency user → refused, no data).
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-agency access-marks isolation` pass.

### Task 7: Hold, lift, retry, archive tools + hold email
**Goal:** The remaining five tools, plus the generic hold emails.
**Files:** `packages/tools/src/tools/platform-agency.ts` (+ test), create `packages/tools/src/platform/hold-email.ts` (+ test), `packages/email/src/templates/agency-hold.tsx`, `packages/email/src/types.ts`, `render.ts` (+ render test), fixtures, access marks, tool-access doc.
**Interfaces (Produces):** tools `platform_suspend_agency`, `platform_unsuspend_agency`, `platform_retry_hold_billing` (staff), `platform_archive_agency`, `platform_unarchive_agency` (owner), with I/O per spec §4.4. `sendAgencyHoldEmail(deps: ToolDeps, agencyId: string, kind: 'started' | 'lifted'): Promise<number>`. Email union member `{ template: 'agency_hold'; props: AgencyHoldProps }` with `AgencyHoldProps = { branding; recipientName: string | null; agencyName: string; kind: 'started' | 'lifted'; supportEmail: string }`.
**Behaviour:**
- **Suspend:**
  1. Transaction: `update agency set suspended_at = now(), suspended_reason = $reason.trim(), suspended_by = ctx.userId where id = $id and suspended_at is null returning`. No row → `invalid_input` "This agency is already on hold." (user-facing).
  2. After commit: `applyHoldCollection(…, 'pause', ctx.userId)` (gateway = `gatewayOf(deps)` or null).
  3. Then `sendAgencyHoldEmail(…, 'started')`.
  4. Return `{ suspendedAt, billing, emailsSent }`. A failure in step 2 or 3 never undoes the hold.
- **Unsuspend:** guarded on `suspended_at is not null` (else `invalid_input` "This agency isn't on hold."). Clear the three columns, then `'resume'`, then `'lifted'`.
- **Retry:** mode = held ? `'pause'` : `'resume'`; returns `HoldBillingResult`.
- **Archive:** `operate(…, 'owner', …)`; call `archiveTenant(deps.service, { kind: 'agency', id, undo: false }, { audit: 'none' })`. `billing_active` → `ToolError('invalid_input', ARCHIVE_BILLING_MESSAGE, { userFacing: true })`. Returns `{ archivedAt }`.
- **Unarchive:** `{ allowArchived: true }`, `undo: true`.
- Archive copy (decided draft):
```ts
export const ARCHIVE_BILLING_MESSAGE = 'This agency still has active billing. Cancel it in Stripe first, then archive.';
```
- **Hold email:**
  - Recipients: distinct lower-cased agency-admin emails, query as in `apps/web/src/server/support-email.ts`.
  - Transport: `deps.leadEmail`; no transport → return 0.
  - From `"Rival Monday" <${leadEmail.fromAddress}>`, Reply-To `deps.supportEmail ?? DEFAULT_SUPPORT_EMAIL`, branding `resolveBranding('Rival Monday', null)`, tag `agency_hold`.
  - Never throws; logs agency id + error name only.
- Template copy (decided, spec §4.4; `{agency}` = agency name; greeting via the layout's `greeting(recipientName)`):
```ts
export const agencyHoldSubject = (kind: 'started' | 'lifted', agency: string) =>
  kind === 'started' ? `Your ${agency} account is on hold` : `Your ${agency} account is active again`;
// started body:
//   `Your ${agency} account is on hold. Your team can still sign in and see everything, but changes and scheduled work are paused, and so is billing.`
//   `To restore it, reply to this email or contact ${supportEmail}.`
// lifted body:
//   `The hold on your ${agency} account has been lifted. Your team can make changes again, and scheduled work and billing resume today.`
```
**Tests (TDD):**
- suspend: sets the columns, calls the fake gateway pause for each target, sends one email per admin (2 admins → `emailsSent: 2`), audit row `platform_suspend_agency`; a second suspend → `invalid_input`; a gateway failure still returns the hold with `billing.failed.length === 1`.
- the email never contains the reason (render output does not include it).
- unsuspend: clears the columns, resume calls, `lifted` email; not held → `invalid_input`.
- retry: after a forced failure → the fake's next call succeeds, `holdBillingIssue` becomes `null`.
- archive: owner ok (agency now 404s for `platform_rename_agency`); staff → `permission_denied`; live billing → `invalid_input` + `ARCHIVE_BILLING_MESSAGE`; unarchive restores.
- `render.test.ts`: both `agency_hold` kinds render the exact subjects and body lines.
- isolation fixtures for all five.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-agency platform/hold-email isolation access-marks` and `pnpm --filter @cs/email exec vitest run render` pass.

### Task 8: Console reads — status filter, counts, hold/archived detail
**Goal:** The list and the detail read expose hold and archive state; archived agencies are reachable read-only.
**Files:** `packages/tools/src/tools/platform-console.ts` (+ test).
**Interfaces (Produces):**
- `liveAgencies(deps, now, agencyId?, o?: { nameLike?: string; archived?: 'exclude' | 'only' | 'include'; onHoldOnly?: boolean })` (default `archived: 'exclude'`). `LiveAgency` gains `suspendedAt: string | null`, `archivedAt: string | null`.
- `list_platform_agencies` input `status?: 'active' | 'on_hold' | 'archived' | 'all'` (default `'active'`). Rows gain `onHold: boolean`, `archivedAt: string | null`. Output gains `counts: { onHold: number; archived: number }`.
- `get_platform_agency`: uses `requireAgency(…, { allowArchived: true })`. Output gains `hold: { since: string; reason: string; byName: string } | null`, `archivedAt: string | null`, `holdBillingIssue: 'pause' | 'resume' | null`. For an archived agency, `health`, `tiles` and `series` are `null` (zod `.nullable()`), and `team` and `clients` are still returned.
**Behaviour:**
- `active` = not archived (held included); `on_hold` = not archived and held; `archived` = archived only; `all` = everything.
- `counts` ignore `status` and `query`: held among non-archived, and archived.
- `byName` = `auth.user.name` (fallback email local part) of `suspended_by`, via `supportDisplayName` if that is the existing display helper for platform users.
- The cursor and sorts keep working for each status.
**Tests (TDD):**
- one active, one held and one archived agency: `active` → 2 rows (the held one has `onHold: true`), `on_hold` → 1, `archived` → 1 with `archivedAt`, `all` → 3; `counts` = `{ onHold: 1, archived: 1 }` in every case.
- `get_platform_agency` on an archived agency → `tiles`/`series`/`health` null, `archivedAt` set; on a held agency → `hold.reason` = the stored reason; `holdBillingIssue` reflects Task 3's events.
- an unknown id is still `not_found`.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-console` passes.

### Task 9: Agency detail page — Manage menu, People, hold, archived view
**Goal:** Mockup pages 2–8 on `/platform/agencies/[id]`.
**Files:** `apps/web/src/app/(platform)/platform/agencies/[id]/page.tsx`, `actions.ts`, create `manage-menu.tsx`, `people-section.tsx`, `hold-banner.tsx`, `archived-view.tsx` (+ tests next to them, plus `page.test.tsx`).
**Interfaces:** server actions in `actions.ts`, one per tool, each `runTool` with the tool name from Tasks 6–7, `revalidatePath` the detail page. They return `{ ok: true, … } | { error: string }` (the user-facing message) for inline dialog errors. **Follow pattern:** `billing-actions.ts` + `billing-panel.tsx` (dialogs, inline errors, role props).
**Behaviour:**
- The header shows `StatusChip` "On hold" (danger) when `hold`, with a tooltip `Reason: {reason}` / `Since {formatDate(since)} · by {byName}`, then the health chip, then View as agency, then **Manage ▾**.
- Manage items:
  - Rename agency (staff+, a dialog with a name field);
  - Put on hold / Lift hold (staff+);
  - Archive agency (owner, danger).
  - Viewers get no Manage button. No Change plan item (spec §4.5).
- Put on hold dialog: the mockup page 5 copy verbatim (list of four effects), a reason textarea labelled "Reason (staff only)", hint "Never shown to the agency. 3–500 characters." and the danger button "Put on hold". The success toast says "On hold. Billing paused for {done} subscriptions; {emailsSent} admins emailed." plus "{n} could not be paused." when `failed.length`.
- Lift hold: the `ConfirmDialog` body from the spec §4.5.
- `hold-banner.tsx`: shown when `holdBillingIssue` is set, with the copy from spec §4.2 and a "Retry billing pause" / "Retry billing resume" button calling the retry action.
- People section (replaces the Team card; the counts line goes in the heading, as in the mockup):
  - Tabs: Agency team / Client people / Pending invites, with counts, via `?people=` with `TabsLink` (pattern from Changes).
  - Row menus: agency roles get "Make account manager"/"Make agency admin" plus "Remove from agency"; client people get "Remove from agency"; invites get Resend/Revoke.
  - "Invite agency admin" opens a dialog with an email field.
  - Dialog copy is mockup page 4 verbatim; inline errors show the tool message.
  - Staff+ see the actions; viewers see read-only tables.
- Archive dialog: on open, read `liveBilling` through a small read action. If anything is live, show the refusal banner (Task 7 `ARCHIVE_BILLING_MESSAGE` plus the counts: "Its plan and {n} client subscriptions are still active.") and a Close button only. Else `ConfirmDialog` with `requireText={agency.name}`, the mockup page 8 body and "Archive agency".
- `archived-view.tsx`: when `archivedAt`, render the header with an "Archived" chip and "Archived {date}", Unarchive (owner, `ConfirmDialog` with the spec copy), and the People (read-only) and Clients sections. All other sections and their tool calls are skipped.
- Remove "Agency management is coming soon." and the "About the team counts" tip. Add tips `platform.agencies.detail.people` / `.hold` / `.archive` (copy in Task 11).
**Tests (TDD):**
- `page.test.tsx`: viewer → no Manage; staff → Manage without Archive; owner → with Archive; a held agency shows the "On hold" chip and (with an issue) the banner; an archived agency renders `archived-view` and does not call `get_agency_billing`.
- `people-section.test.tsx`: three tabs with counts; a client-person row has only Remove; viewer has no actions.
- `actions` tests: each action calls `runTool` with the right tool + input and returns the user-facing error on `invalid_input`/`rate_limited`.
**Done when:** `pnpm --filter @cs/web exec vitest run "platform/agencies/\[id\]"` passes; `pnpm --filter @cs/web typecheck` is clean.

### Task 10: Agency list filters, agency-side hold, labels
**Goal:** Mockup page 9; the agency's own users see the hold and get the read-only treatment.
**Files:** `apps/web/src/app/(platform)/platform/agencies/page.tsx`, `agency-table.tsx`, create `agency-actions.ts` (+ tests); `apps/web/src/server/billing-state.ts`, `components/shell/app-shell.tsx`, `components/shell/billing-banner.tsx` (+ tests); `apps/web/src/lib/labels.ts` (+ terminology test if it covers platform maps).
**Interfaces:** `BillingSnapshot` gains `onHold: boolean` and `supportEmail: string`. `BillingBanner` props gain `onHold: boolean` and `supportEmail: string`. `AGENCY_LIFECYCLE: LabelMap<'on_hold' | 'archived'>` = `{ on_hold: e('On hold', 'danger'), archived: e('Archived', 'neutral') }`.
**Behaviour:**
- List: a segmented filter Active / On hold {counts.onHold} / Archived {counts.archived} / All, kept in `?status=` (default active) and combined with the existing search and cursor.
- A held row gets the "On hold" chip after the name.
- Archived view columns: Agency, Status (chip), Clients, Archived (`formatDate` + " · purge possible" when ≥ 30 days), and an Unarchive button (owner only; `ConfirmDialog` with the spec copy; `agency-actions.ts` → `platform_unarchive_agency`).
- Archived rows link to the detail page (archived view).
- `BillingBanner`: when `onHold`, every agency role sees `HOLD_MESSAGE(supportEmail)` (warning tone, before any Stripe-state banner, which is suppressed). Client roles see no hold text; the existing client logic is unchanged.
- `AppShell`: `<ReadOnlyProvider readOnly={support !== null || billing?.onHold === true}>`.
**Tests (TDD):**
- `agency-table.test.tsx` / `page.test.tsx`: the status param is passed to the tool; counts render; the held chip; archived rows show Unarchive only for owner; "purge possible" after 30 days.
- `billing-banner.test.tsx`: `onHold` + `account_manager` → the exact hold sentence with the support email; `onHold` + Stripe `past_due` → only the hold sentence; `client_owner` → no hold text.
- `app-shell.test.tsx`: held → read-only provider on.
**Done when:** `pnpm --filter @cs/web exec vitest run "platform/agencies" billing-banner app-shell labels` passes.

### Task 11: Help, copy sign-off, E2E
**Goal:** Help coverage, the copy doc and the end-to-end flows.
**Files:** `apps/web/src/help/copy/platform.ts` (tips), the `page:platform.agencies.detail` guide in `docs/help/pages/` (+ the agencies list guide if one exists), `docs/archive/phase-15c3a-copy-signoff.md` (new), `apps/web/e2e/platform.spec.ts`.
**Behaviour:**
- Tips (draft for sign-off):
  - `platform.agencies.detail.people`: "Everyone on this agency and its clients, plus invites that haven't been accepted. Staff can change agency roles, remove people and resend invites. Invites count toward the agency's daily limits."
  - `.hold`: "A hold makes the agency read-only, stops its scheduled work and pauses its billing. Its admins get an email when a hold starts and ends. Payments don't lift a hold; only staff can."
  - `.archive`: "Archiving hides the agency and its clients from everyone outside the platform. Nothing is deleted, and an owner can unarchive it from the Archived filter. You can't archive while billing is active."
  - `platform.agencies.status`: "Active includes agencies on hold. Archived agencies can be restored by an owner, and purged after 30 days."
- Guide: add sections "Managing people", "Putting an agency on hold", "Archiving"; run the help coverage test.
- Copy sign-off doc: every new string (dialogs, toasts, banners, chips, refusals, email subjects and bodies, tips), grouped by surface, with the source file. The owner signs at merge (C10).
- E2E (`platform.spec.ts`, replace the "coming soon" assertion at line ~74):
  1. `staff puts an agency on hold and lifts it`: the agency user sees the hold banner and Add client is refused; after lifting, the banner is gone.
  2. `owner archives and unarchives an agency without billing`: gone from Active, listed under Archived, Unarchive brings it back.
  3. `invite agency admin, resend limit`: the 4th resend in 24 h is refused with the user-facing message (3 prior resends seeded via audit rows, the 4th via the UI).
**Tests:** help coverage (`help-coverage` test), the terminology test, plus the three E2E specs (run once at the final review via `e2e:affected`).
**Done when:** `pnpm --filter @cs/web exec vitest run help terminology` passes; the E2E specs pass under `pnpm --filter @cs/web e2e:affected --base main` at the final review.

### Task 12: Docs
**Goal:** The branch documents what it built.
**Files:** `packages/billing/CLAUDE.md` (hold rules: `onHold` precedence, `applyHoldCollection` after commit, `service_paused` from activation/resume, no deadline shifts), `packages/tools/CLAUDE.md` (`platformAgencyCtx` rule, `RESEND_TOOLS`), 8b tool-access doc (done per task; verify), `docs/work/phase-15c3.md` (Status, Interfaces, owner verification steps, the 7b2 answers (a)–(d), new backlog: 15c-3b).
**Owner verification steps (write into the work file):**
1. On `cs_dev` after the migration, put a test agency on hold: its admin gets the email, the agency UI is read-only with the banner, and Stripe test subscriptions show "collection paused".
2. Lift it: the email arrives and collection resumes.
3. Try archiving an agency with a live test subscription: refused.
4. Cancel it, archive, find it under Archived, then unarchive.
5. Invite an agency admin: the email names the agency, not you.
6. Change roles and hit the last-admin refusal.
7. Sign the copy doc.
**Done when:** the docs are committed; the root `CLAUDE.md` Decisions line for Phase 15c is appended at merge (not here).
