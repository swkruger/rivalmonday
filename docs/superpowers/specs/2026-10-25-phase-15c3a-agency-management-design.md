# Phase 15c-3a — agency management (rename, people, hold, archive): design

**Status:** draft, builder-checked 2026-10-25. **Base spec:** [15c spec](2026-10-21-phase-15c-page-fixes-design.md) §5 (binding; this file adds only new decisions and interfaces and the places where it narrows §5). **Mockups (owner-approved 2026-10-25):** [`docs/design-system/mockups/agency-management/`](../../design-system/mockups/agency-management/agency-management.html) (PDF next to it). Work file: `docs/work/phase-15c3.md`.

## 1. Intent

Platform staff need to run an agency without a database console. That means: fixing its name, sorting out who is on it, freezing it when payment or terms break down, and removing it when it leaves. Today the agency detail page only says "Agency management is coming soon". Archive and unarchive exist only as a worker CLI, and nothing can put an agency on hold.

**Goals:** every item in §5.1–5.4 and §5.6 of the 15c spec, reachable from `/platform/agencies/<id>` and the agency list, each behind a confirm dialog and recorded in the audit log.
**Non-goals:** plans and changing an agency's plan (§5.5 → **15c-3b**); stepping into a client (C5); editing client people's roles; branding privacy/site URLs (→ 13a).
**Anti-goals:**
- a hold that a Stripe payment silently lifts (C6);
- a hold that leaks to clients (they only ever see the neutral "account needs attention" line);
- an archive that hides live billing that keeps charging;
- operator actions that dodge the agency's invite limits.

## 2. Decisions (owner, 2026-10-25)

| # | Decision |
|---|---|
| A1 | **Split:** 15c-3a = rename, people, hold, archive (this spec). 15c-3b = §5.5 plans, own spec/plan after 3a merges. Phase 7b2 waits only for 3a. |
| A2 | **Archive keeps 7a2's refusal while billing is live** (agency subscription not `pilot`/`cancelled`, or any client billing `active`/`payment_needed`). The dialog says to cancel in Stripe first. No auto-cancel. The archive logic moves from `apps/worker` into `@cs/tools`, and the CLI and the tool share it. |
| A3 | **Archived agencies are reachable by operators:** the agency list gets an "Archived" filter. Only **owners** can unarchive (list row action and detail page). |
| A4 | **A hold freezes all billing work for that agency.** `runBillingDaily` skips it (seat sync, reconcile, timers, reminders, `runConnectDaily`). `syncSeats` is a no-op. `assertCanActivateClient` and `resumeClient` refuse with `service_paused`. This also covers worker paths that never pass the registry's write guard. |
| A5 | **Operator invites and resends count toward the agency's own limits** (`RESEND_LIMIT` 3 per invite per 24 h, `TEAM_INVITE_LIMIT` 20 per agency per 24 h). The invite email names the agency as the inviter, never the operator. |
| A6 | **Held agencies are visible on the list:** an "On hold" chip on the row plus an "On hold" filter. The default "Active" view includes held agencies. |
| A7 | **Starting and lifting a hold emails the agency's admins.** The email is generic, and the staff reason is never included. Sender: Rival Monday (agencies are platform customers; their clients never get it). |
| A8 | Branding privacy/site URLs stay in the 13a backlog. |
| A9 | **Hold time counts toward billing clocks; nothing is shifted on lift.** Trial end, `past_due_since`, `cancel_at` and `payment_failed_since` stay as they are. After a lift, the next daily run applies whatever the clocks say (e.g. past_due → read_only, client auto-pause). Staff give time back with the existing `extend_trial`. Stripe stays the source of truth. |

## 3. Data

Migration (next free number at execution; phase-7c2 holds 0093). Columns exactly as in 15c spec §5.3: `agency.suspended_at timestamptz`, `suspended_reason text`, `suspended_by text`. No new tables, so no `TABLE_CLASS` change.
- Check the 7a1 runtime roles (`cs_web`, `cs_worker`) can update these columns on the service path. App roles keep no `UPDATE` on `agency`.
- Code and UI say "hold"/`onHold`. The columns keep §5.3's names. The existing `BillingAccess.suspended` stays the *Stripe* state; do not conflate the two.

## 4. Interfaces

### 4.1 Hold primitives (`@cs/billing`, `@cs/db`)
```ts
// @cs/core
export const DEFAULT_SUPPORT_EMAIL = 'support@rivalmonday.app';   // replaces apps/worker deps.ts DEFAULT_SUPPORT_REPLY_TO
// @cs/billing access.ts
interface BillingAccess { /* … */ onHold: boolean }              // readOnly = state === 'read_only' || onHold
export function holdMessage(role: string, supportEmail?: string): string;
//   agency roles: `This account is on hold. Contact ${supportEmail ?? DEFAULT_SUPPORT_EMAIL} to restore it.`
//   client roles / contacts: ACCOUNT_NEEDS_ATTENTION_MESSAGE
export async function isOnHold(db: BillingDb, agencyId: string): Promise<boolean>;
```
- **`agencyServiceable`** (`packages/db/src/filters.ts`) adds `AND NOT EXISTS (… ax.suspended_at IS NOT NULL)`. All 29 call sites inherit this.
- **`assertAgencyServiceable` / `billingWriteGuard`:** when `onHold`, throw `ToolError('service_paused', holdMessage(ctx.role, deps.supportEmail))`. This takes precedence over the Stripe-state message. `PAUSED_WRITE_ALLOW_LIST` is unchanged (C6), so paying and access management stay open, and none of them lifts the hold.
- **`assertCanActivateClient`, `resumeClient`:** when held, refuse first (before seat logic) with `ToolError('service_paused', holdMessage(opts.role))`. 7b2's `liftAutoPause` treats `service_paused` as `'refused'`.
- **`syncSeats`:** returns early when held. **`runBillingDaily`:** a held agency skips everything except the `agency_daily_stat` write, which records `paidSeats 0, mrrCents 0` (collection is paused) and the unchanged `billingState`.
- **Deadlines:** none shifted (A9).
- **Outbox** *(my call)*: the outbox claim already filters on `agencyServiceable`, so notifications queued during a hold wait and send after the lift. This is the same as Stripe `read_only` today, and nothing is expired. Schedulers create no new work while an agency is held.
- `ToolDeps.supportEmail?: string`: web and worker wire `SUPPORT_REPLY_TO`, and anything unset falls back to `DEFAULT_SUPPORT_EMAIL`.

### 4.2 Collection pause (`@cs/billing` gateway)
§5.3's `pauseCollection(subscriptionId, o?: { stripeAccount?: string })` / `resumeCollection(...)` go in `types.ts`, `fake-gateway.ts` and `stripe-gateway.ts`. Pausing never changes the subscription `status` (7b2 relies on this).
```ts
// packages/billing/src/hold.ts
export interface HoldBillingResult { done: number; failed: { kind: 'agency' | 'client'; clientId?: string; clientName?: string }[] }
export async function applyHoldCollection(db: Db, gw: BillingGateway | null, agencyId: string, mode: 'pause' | 'resume', actor: string): Promise<HoldBillingResult>;
```
- Targets: the agency's `agency_billing.stripe_subscription_id` (when set and state not `cancelled`), plus every `client_billing.stripe_subscription_id` of its clients whose state is `active`/`payment_needed`, on `agency_connect.stripe_account_id`.
- Each call is independent and idempotent.
- After the run, one `agency_billing_event` row: `reason` = `admin_hold_billing_ok` or `admin_hold_billing_failed`, `from_state = to_state` = current state, `actor` = platform user id.
- `gw === null` (billing off) → `{ done: 0, failed: [] }`, with an `ok` event.
- **Outstanding failure** = the newest `admin_hold_billing_*` event is `_failed`. The detail page shows the banner "Billing pause failed for some subscriptions. The hold still applies." (or "Billing resume failed for some subscriptions." after a lift) with **Retry**. The per-subscription list only appears in the action's immediate result. *(My call: no new column; the mockup's "1 of 4 (Smile Dental)" detail only shows right after the action.)*
- **New subscriptions during a hold** *(my call)*: the webhook (`recordCheckoutFacts` and the client-checkout path) calls `pauseCollection` on a freshly created subscription of a held agency, best-effort, and records the same event on failure.

### 4.3 Archive service
`packages/tools/src/platform/archive.ts` exports `archiveTenant(db, { kind, id, undo }, o?: { now?: Date; audit?: 'cli' | 'none' })` and `ArchiveResult`. The SQL and the refusal come unchanged from `apps/worker/src/purge.ts`. `audit: 'cli'` (the CLI's default) writes today's `platform_audit_log` row. Tools pass `'none'`, because `withPlatformAudit` writes theirs. `purge.ts` and `cli/archive.ts` import it, and `purgeArchived` stays in the worker. Also add `liveBilling(db, agencyId): Promise<{ agencyPlan: boolean; clientSubscriptions: number }>`, which the dialog uses to show the refusal before the operator types the name.

### 4.4 Tools (new module `packages/tools/src/tools/platform-agency.ts`, array `platformAgencyTools`, added to `PLATFORM_TOOLS`)
All follow `operate()` (`permission: 'agency'`, `audit: 'skip-web'`, one `withPlatformAudit` row into the target agency's `audit_log`). Each new tool also needs:
- an `ISOLATION_FIXTURES` entry;
- access marks plus `access-marks.test.ts`;
- the 8b tool-access doc.

| Tool | Min role | Input → output |
|---|---|---|
| `list_agency_people` | viewer | `{ agencyId }` → §5.2 shape |
| `platform_rename_agency` | staff | `{ agencyId, name }` (trim, 1–120) → `{ name }` |
| `platform_change_member_role` | staff | `{ agencyId, membershipId, role: 'agency_admin'\|'account_manager' }` → `{ role }`; a target with a client role → `not_found` |
| `platform_remove_member` | staff | `{ agencyId, membershipId }` → `{ removed: true }` (any membership of the agency) |
| `platform_invite_agency_admin` | staff | `{ agencyId, email }` → `{ invitationId, expiresAt, emailSent }` |
| `platform_resend_invitation` | staff | `{ agencyId, invitationId }` → `{ sentAt, expiresAt, emailSent }` |
| `platform_revoke_invitation` | staff | `{ agencyId, invitationId }` → `{ revoked: true }` |
| `platform_suspend_agency` | staff | `{ agencyId, reason }` (3–500) → `{ suspendedAt, billing: HoldBillingResult, emailsSent: number }`; already held → `invalid_input` "This agency is already on hold." |
| `platform_unsuspend_agency` | staff | `{ agencyId }` → `{ billing, emailsSent }`; not held → `invalid_input` |
| `platform_retry_hold_billing` | staff | `{ agencyId }` → `HoldBillingResult` (mode from current hold state) |
| `platform_archive_agency` | owner | `{ agencyId }` → `{ archivedAt }`; live billing → `invalid_input` with the A2 copy |
| `platform_unarchive_agency` | owner | `{ agencyId }` → `{ ok: true }` |

- **Target-agency context (security-sensitive):** `platformAgencyCtx(ctx, agencyId): AccessContext` returns `{ ...ctx, agencyId, role: 'agency_admin', clientScope: 'all' }`. It is built only inside these tools, after `requirePlatformOperator` and `requireAgency`, and never leaves them. The `team.ts` functions (`listTeam`, `inviteMember`, `revokeMembership`, `revokeInvitation`, `resendInvitation`) run with it unchanged.
- **New `changeMemberRole(service, ctx, membershipId, role)`** in `team.ts`: it uses the same row locks and last-admin rule as `revokeMembership`. Error copy for both is "An agency needs at least one admin." (with the full stop). *(My call:)* promoting to admin clears `client_scope` (NULL, as `membership_client_scope_check` requires), and demoting an admin gives an account manager with NULL scope (all clients). The confirm copy says so.
- **Client-role invites** *(my call)*: `platform_resend_invitation` works on them too. The operator path sends with **no Cc**, so the operator's address never reaches a client. `resendInvitation` passes `inviter` through to `sendClientInvite` (`client-invite.ts`, Cc lookup skipped for `{ agency: true }`). Operators never create client invites, so `clientSetup.invitedBy` and the review email are untouched.
- **Limits (A5):** `priorResends` and `teamInviteSends` match `tool IN ('resend_invitation', 'platform_resend_invitation')`. `platform_resend_invitation` passes `{ invitationId }` (not its full input) as the audited input, so the hashes match. The platform invite calls `assertTeamInviteBudget` before `inviteMember`.
- **Invite email (A5):** `sendTeamInviteEmail` takes `inviter: { userId: string } | { agency: true }`. With `{ agency: true }`, `inviterName = branding.displayName` and `replyTo = null`. `resendInvitation` gets an optional `inviter` it passes through.
- **Archived reach (A3):** `requireAgency(deps, id, { allowArchived?: boolean })`. Only `get_platform_agency`, `list_agency_people` and `platform_unarchive_agency` pass `true`; every other tool keeps 404-ing archived agencies (so rename, hold and invite on an archived agency are refused).
- **Hold order:**
  1. One transaction: set the columns, guarded by `suspended_at IS NULL`.
  2. After commit: `applyHoldCollection`.
  3. Then the emails.
  A failure in step 2 or 3 never undoes the hold. A lift reverses the order the same way (clear the columns, then resume collection, then the emails).
- **Hold email** (`packages/tools/src/platform/hold-email.ts`, `sendAgencyHoldEmail(deps, agencyId, kind: 'started' | 'lifted'): Promise<number>`): one email per distinct agency-admin address.
  - Transport: `deps.leadEmail`, From `"Rival Monday" <fromAddress>`, Reply-To `deps.supportEmail ?? DEFAULT_SUPPORT_EMAIL`, branding `resolveBranding('Rival Monday', null)`.
  - Never throws, and logs no PII. Follow pattern: `apps/web/src/server/support-email.ts`.
  - New `@cs/email` template `agency_hold` with props `{ branding, recipientName, agencyName, kind, supportEmail }`. Copy is decided (mockup page 7):
    - started: subject "Your {agency} account is on hold". Body: "Your {agency} account is on hold. Your team can still sign in and see everything, but changes and scheduled work are paused, and so is billing." / "To restore it, reply to this email or contact {supportEmail}."
    - lifted: subject "Your {agency} account is active again". Body: "The hold on your {agency} account has been lifted. Your team can make changes again, and scheduled work and billing resume today."
- **Changed reads** (`platform-console.ts`; `liveAgencies()` today always filters `archived_at IS NULL`, so it gains an `archived: 'exclude' | 'only' | 'include'` parameter):
  - `list_platform_agencies` input `status?: 'active' | 'on_hold' | 'archived' | 'all'` (default `active` = not archived, held included). Rows gain `onHold: boolean`, `archivedAt: string | null`. Output gains `counts: { onHold: number; archived: number }` for the filter. *(My call:)* archived rows keep their figures, computed as usual.
  - `get_platform_agency` works for archived agencies. Output gains `hold: { since, reason, byName } | null`, `archivedAt: string | null` and `holdBillingIssue: 'pause' | 'resume' | null`. For an archived agency, `health`, `tiles` and `series` are `null` (schema made nullable), and the page renders the archived layout. The reason is operator-only; this tool is already operator-only.

### 4.5 Page (`/platform/agencies/[id]`, list)
Per mockups 2–9. This sub-phase lands before phase-16's restyle, so build with the existing `@cs/ui` pieces (`ConfirmDialog`, `StatusChip`, `TabsLink`/tabs, menu). Hidden menu items follow §5.6.
- **Manage ▾** contains Rename, Put on hold / Lift hold, and Archive (owner). It replaces the "coming soon" line (also update `e2e/platform.spec.ts:74`). 3b adds Change plan; 3a shows no placeholder for it *(my call: the mockup's greyed item is dropped)*.
- **People** replaces the Team card:
  - The counts go in the heading.
  - Tabs: Agency team (row menu: change role, remove), Client people (remove only), Pending invites (Resend, Revoke).
  - "Invite agency admin" button.
  - Refusals (last admin, rate limits) show inline in the dialog.
- **On hold:**
  - danger `StatusChip` "On hold" with a tooltip: reason, since, by (operators only);
  - the billing-issue banner with Retry (§4.2);
  - Lift hold confirm: "Lift the hold on {agency}? Changes, scheduled work and billing resume now, and its admins get an email."
- **Archive dialog:** `ConfirmDialog requireText={agency.name}`. When `liveBilling` reports anything, the dialog shows the refusal instead of the input. The tool re-checks on submit.
- **Archived detail** *(my call)*: the header with an "Archived" chip and "Archived {date}", an Unarchive button (owner), and the Clients and People sections read-only. Tiles, charts, limits, billing and support sections are hidden, because their reads keep 404-ing archived agencies.
- **List:**
  - Segmented filter Active / On hold (count) / Archived (count) / All, kept in `?status=`.
  - "On hold" chip after the name.
  - Archived rows: "Archived {date}", plus "· purge possible" once 30 days or more have passed, and an Unarchive button (owner).
  - Unarchive confirm: "Unarchive {agency}? The agency and its clients come back as they were. Paused billing doesn't restart on its own."
- **Agency side:** `billing-banner.tsx` shows `holdMessage` to every agency role when `onHold`. Write controls use the existing read-only treatment (`components/read-only.tsx`). Client views keep the neutral line.
- **Labels and help:**
  - `lib/labels.ts` gains `AGENCY_LIFECYCLE` (`on_hold` danger, `archived` neutral).
  - Tips: `platform.agencies.detail.people`, `.hold`, `.archive`, and the list's `platform.agencies.status`.
  - Update the `page:platform.agencies.detail` guide in `docs/help/pages/`.
  - Remove the "About the team counts" tip.
- **Copy:** all strings in this spec and the mockups are drafts until the C10 sign-off doc (`docs/archive/phase-15c3a-copy-signoff.md`) is signed. The hold email and the role/limit refusals are the owner-decided parts.

## 5. Testing (adds to 15c spec §7)
- **Unit:**
  - each tool: the role matrix (viewer/staff/owner), `not_found` for an unknown or archived agency (except the three `allowArchived` tools), one audit row per call;
  - `changeMemberRole` / remove last-admin refusal;
  - limits counted across `resend_invitation` and `platform_resend_invitation`;
  - the invite email uses the agency name with `replyTo` null for operators;
  - `holdMessage` per role;
  - `billingWriteGuard` refuses a held agency even when Stripe is `active`, and the allow-list still passes;
  - `agencyServiceable` excludes held agencies;
  - `assertCanActivateClient` / `resumeClient` → `service_paused`;
  - `runBillingDaily` skips a held agency's Connect step, timers and seat sync, and writes MRR 0;
  - `applyHoldCollection` with the fake gateway: targets, the `stripeAccount` param, idempotent repeat, a partial failure → `_failed` event, and retry clears it;
  - no deadline moves on lift (A9);
  - operator resend of a client invite sends with no Cc;
  - `archiveTenant` refusal from the moved module, with the CLI behaviour unchanged.
- **Isolation:** fixtures for all 12 tools. An agency user calling any of them → `not_found`/`permission_denied`, never data.
- **E2E (`platform.spec.ts`):**
  1. staff puts an agency on hold, the agency user sees the banner and Add client is refused, staff lifts the hold;
  2. owner archives an agency with no billing, it is gone from Active and listed under Archived, unarchive;
  3. invite agency admin, then resend 4 times, and the 4th is refused.

## 6. Overlaps
- **phase-7c2:** migration 0093 (whoever merges second renumbers and regenerates the journal/snapshot). Both branches edit `isolation/fixtures.ts` and `packages/tools/src/index.ts`. Its readiness checks use `agencyServiceable`, so held agencies drop out once we extend it.
- **phase-7b2:** consumes A4, `onHold`, `service_paused`, the unchanged allow-list and the gateway methods. Record its Task 0 answers in the work file at merge.
- **phase-16:** restyles these pages later; no conflict now.
