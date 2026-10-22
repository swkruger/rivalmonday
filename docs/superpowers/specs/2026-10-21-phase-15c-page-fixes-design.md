# Phase 15c — page fixes, shared UI pieces, agency management

**Status:** brainstormed with the owner 2026-10-21 · **Branch:** `phase-15c` · **Inputs:** [brief](../../work/phase-15c.md), [Phase 15 spec](2026-10-18-phase-15-ux-ia-design.md) D1/§4, [UX audit](../../research/2026-10-18-phase-15-ux-audit.md), [13a plan](../plans/2026-10-17-phase-13a-white-label.md) Task 20.
This doc adds only new decisions and interfaces. Audit findings are cited by audit §; the per-page list lives in the brief §1 and the audit.

## 1. Why
The app works but reads unfinished: raw enum values, mixed date formats, km in a US product, no loading/error pages, irreversible actions without confirmation, a "coming soon" line on the operator's agency page. 15c makes every page feel finished and gives operators real agency management.

## 2. Decisions (owner-approved 2026-10-21)
| # | Decision |
|---|---|
| C1 | **Three sub-phases, three plans:** **15c-1** shared pieces (§3), **15c-2** page fixes + small features (§4), **15c-3** agency management (§5). Each merges before the next starts its pre-flight. |
| C2 | **Error/404 pages built in 15c-1**, neutral (no Rival Monday wordmark, no agency branding), using 13a Task 20's copy. 13a later makes them host-aware (wordmark on platform host); phase-7 plugs Sentry into the seam (§3.6). 13a's plan drops "create" for these files and keeps "make host-aware". |
| C3 | **Miles everywhere users look or type; km stays in storage and tool schemas.** One converter. Rank radius = select of round miles (§3.3). |
| C4 | **Small features in 15c-2:** delete an Ask conversation; delete a webhook + send a test; resend a team invite; resend the sign-up email; search on the platform agencies list; paging on platform leads and reviews; client filter + cap notice on Alert review; **agency intake preview**; **whole-page "compare with previous capture" diff**. Knowledge-base preview → backlog. |
| C5 | **Agency management on `/platform/agencies/<id>` (15c-3):** rename, people (list, change role, remove, resend/revoke invite, invite an agency admin), suspend/unsuspend (read-only), archive (7a2's logic), change plan. "Step into a client" is not built. The "coming soon" line goes. |
| C6 | **Operator suspend = read-only** (sign-in works, notice shown, writes refused, no recurring work), separate from Stripe states so no payment event lifts it. **Billing collection pauses while on hold** (platform subscription and the agency's client subscriptions) and resumes on lift. |
| C11 | **Real separate plans:** operators create plans beyond `standard` (custom/enterprise pricing, seat bundles) and move any agency to the current version of any plan. |
| C7 | **Start now**; pages that 15b-3b renames (`/platform/themes`, theme heatmap, `?theme=` on Reviews) are the **last** tasks of 15c-2. Whichever branch merges second rebases. |
| C8 | **Time zones:** client pages (`/c/<id>/**`) show the client's `timezone`; agency, platform and account pages show the viewer's browser zone. Zone label when a time is shown ("Mon 9:00 AM CT"). One date style: "Oct 21" within the current year, "Oct 21, 2025" otherwise; no ISO dates or ISO weeks in UI. |
| C9 | **Mobile list/detail** (Changes, Moves): below `lg` the detail opens in a `Sheet`; the URL keeps the selected id so back/refresh work. |
| C10 | **Mockups first** (visual companion) per sub-phase: 15c-1 chips, confirm, error/404, skeleton, save bar; 15c-2 sheet, tabs, intake preview, page diff; 15c-3 agency management layout. **One copy sign-off doc per sub-phase** (`docs/archive/phase-15c<n>-copy-signoff.md` at merge). |

## 3. 15c-1 — shared pieces (interfaces binding)

### 3.1 UI primitives (`packages/ui/src/components/`)
- `skeleton.tsx` — `Skeleton({ className })`, `animate-pulse` block on `bg-muted-surface`; respects `prefers-reduced-motion` (no pulse).
- `status-chip.tsx` — `StatusChip({ tone, children, title? })`, `tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'`. Calm tinted background + dark text (owner preference: subtle chips matching the palette); contrast ≥ 4.5:1 verified per tone in a unit test. Replaces solid `Badge` status uses and hex chips.
- `confirm-dialog.tsx` — built on `Dialog`:
  ```ts
  interface ConfirmDialogProps {
    trigger: React.ReactNode; title: string; body: React.ReactNode;
    confirmLabel: string; tone?: 'default' | 'danger';
    requireText?: string;            // confirm button disabled until typed exactly (archive)
    action: (fd: FormData) => void;  // server action / form action; hidden inputs via `fields`
    fields?: Record<string, string>;
  }
  ```
  Focus lands on Cancel; Esc cancels; pending state disables both buttons.
- `save-bar.tsx` — `SaveBar({ dirty, pending, onReset?, saveLabel? })`: sticky bottom bar shown while a form is dirty; used by settings forms with more than one field.

### 3.2 Labels (`apps/web/src/lib/labels.ts`)
One typed map per enum shown in UI, each `Record<Enum, { label: string; tone: ChipTone }>`, plus `labelFor(map, value)` that falls back to a sentence-cased value (never throws). Covers at least: billing state, client status, lead status, alert status, review/decision status, report status, Ask message status, evidence kind, webhook kind, membership role. Client-audience maps never contain agency wording (enforced by `terminology.test.ts` extension).

### 3.3 Formatters (`apps/web/src/lib/format/`)
```ts
// date.ts
export function formatDate(v: string | Date, o: { tz: string; withYear?: 'auto' | 'always' }): string;   // "Oct 21" / "Oct 21, 2025"
export function formatDateTime(v: string | Date, o: { tz: string; zoneLabel?: boolean }): string;      // "Oct 21, 9:00 AM CT"
export function formatRelative(v: string | Date, now?: Date): string;                                  // "3 days ago"
export function formatWeekOf(v: string | Date, o: { tz: string }): string;                             // "Week of Oct 20"
// money.ts
export function formatMoney(amount: number, o?: { unit?: 'usd' | 'cents'; cents?: boolean }): string; // "$229" / "$0.42"
// distance.ts
export const KM_PER_MILE = 1.609344;
export function kmToMiles(km: number): number;
export function milesToKm(mi: number): number;
export function formatMiles(km: number): string;                 // "3 mi", "0.4 mi" (<1 → one decimal)
export const RADIUS_MILES = [2, 3, 5, 10, 15, 20, 25] as const;  // rank radius choices
```
- Replaces `server/format.ts` `formatUsd`, `components/billing/format.ts`, `client-billing/money.ts`, `briefs/format.ts` `formatDay`, and local `formatShortDate`/`fmt` copies (delete them).
- **Viewer zone:** a tiny client component in the app shell writes cookie `rm_tz` (IANA from `Intl.DateTimeFormat().resolvedOptions().timeZone`, validated by `validTimezone`) when missing or changed; `server/viewer-tz.ts` `viewerTimeZone(): Promise<string>` reads it, fallback `'UTC'` (then labelled "UTC"). Client pages pass `client.timezone`.
- **Miles:** every km display/input in the brief's list moves to miles (rank settings, rankings page line, setup business + pick steps, `client-profile-form`, `services-area-summary`, `/start/v/[leadId]`, intake lead summary fact in `tools/intake/preview.ts`). `competitor-controls.tsx` switches to the shared converter. Storage, `radiusKm` fields and tool input schemas stay km; tool **descriptions** state the unit.
- **Rank radius:** select of `RADIUS_MILES`; save `min(round(milesToKm(mi), 1), 40)` (25 mi → 40 km, today's cap; no bound changes in `server/forms.ts`, `rankings.ts`, `client-input.ts`). A stored value not in the list shows as "≈ N mi (custom)" and stays until changed. Service area: numeric miles input, 1–50 mi, step 1, saved as `min(km, 80)`. *(Builder-check call.)*

### 3.4 Loading
`loading.tsx` with `Skeleton`s in `(app)/c/[clientId]`, `(app)/agency`, `(platform)/platform`, `(app)/inbox`: header bar + 3 card blocks; no layout shift against `PageHeader`.

### 3.5 Error and not found
- `app/not-found.tsx`, `app/error.tsx` (client), `app/global-error.tsx` (own `<html>`), plus in-shell `(app)/error.tsx` and `(platform)/platform/error.tsx` so the sidebar survives a page crash.
- Copy (13a, decided): 404 **"Page not found"** / **"This page doesn't exist or you don't have access to it."**; error **"Something went wrong"** / **"Please try again in a moment."** Buttons: "Try again" (`reset()`), "Go to your home page" (`/`).
- Neutral: no wordmark, no agency branding, title "Page not found" / "Something went wrong" with no product suffix. Error digest shown small for support ("Reference: abc123").
### 3.6 Error reporting seam
`apps/web/src/lib/report-error.ts`: `export function reportError(error: Error & { digest?: string }, where: 'page' | 'global'): void` — `console.error` only. Every error boundary calls it. phase-7 replaces the body with Sentry; nothing else changes.

### 3.7 Cross-cutting sweeps in 15c-1
`border-line`/`bg-line` → the grey-panel token (`bg-line` draws nothing); one "You" colour token (`--you`, secondary #2A6BAC) used by rankings/charts; the duplicated owner-Billing nav rule moves into one helper; command input height. Each sweep is a mechanical task with a grep-based test (`no bg-line in src`).

## 4. 15c-2 — page fixes and small features
- **Page fixes:** the brief §1 lists by area (platform, agency, client, account/public), applying §3 (chips, labels, formatters, confirms, SaveBar, skeletons) page by page, plus the backlog items folded into the brief §4, a11y (form labels, `aria-describedby`, focus order on `/start`, heading accessible names without tips inside `CardTitle`), `/platform/billing` tabs and real tabs on Changes (`TabsLink`). Agency "coming soon" is handled in 15c-3, not here.
- **Mobile list/detail (C9):** `ListDetail({ list, detail, selectedId, closeHref })` in `components/list-detail.tsx`; ≥ `lg` two columns, below `lg` detail in a right `Sheet` opened when `selectedId` is set; closing navigates to `closeHref`.
- **Small features (C4) — new tools** (names binding; access marks + `access-marks.test.ts` + 8b tool-access doc as usual):
  - `delete_ask_thread { clientId, threadId }` — write, runs as the user: **own threads only** (threads are private per user, RLS `ask_thread_owner`); soft delete (`ask_thread.deleted_at`, migration if absent) hidden from every read and from Ask context; audit row. *(Builder-check call.)*
  - `delete_webhook { webhookId }`, `test_webhook { webhookId }` — agency admin; test sends one signed `test` payload synchronously with a 5 s timeout and returns `{ ok, status?, error? }`.
  - `resend_invitation { invitationId }` — same `canManage` rule as `revoke_invitation`; new token + expiry, re-sends the email; max 3 per invitation per 24 h.
  - Sign-up email resend: reuse the existing verify flow; a "Resend email" button on the check-your-inbox step, 60 s cooldown, ≤ 5/hour per address.
  - `list_platform_agencies` gains `query?: string` (name ILIKE, trimmed, ≥ 2 chars); page uses the existing cursor instead of `limit: 100`.
  - Platform leads and reviews lists use cursor paging (25 per page, Previous/Next pattern from `prev-next.tsx`).
  - `list_alert_queue` gains `clientId?`; the page shows "Showing the oldest 200 — filter by client to see more" when capped.
  - **Intake preview:** `/agency/settings/intake/preview` (agency admin) renders `IntakeLanding` with `agencyBrand(loadBranding(agency))` regardless of the link being enabled, inside a frame labelled "Preview — this is what visitors see"; lookup and submit are disabled (`preview` prop). Help key `page:agency.settings.intake.preview` + guide.
  - **Compare with previous capture:** read tool `compare_captures { clientId, captureId }` → previous `ok` `web` capture of the same `tracked_page` (pattern `diff-stage.ts` L101); diff from stored `capture_block` rows via `loadBlocks` + `alignBlocks`, word-level `wordDiff` for modified blocks, capped by `MAX_DIFF_CELLS` (truncated flag). Output `{ before: {captureId, capturedAt} | null, after: {...}, blocks: { kind: 'added'|'removed'|'modified'|'unchanged', segments }[], truncated }`; unchanged blocks collapsed in UI. Shown as a "Whole page" tab in the Changes viewer and a "Compare with previous" section on the evidence page. Captures without blocks (vendor sources) → tab hidden. Volatile blocks (`maskedBlockKeys`, as in `diff-stage.ts`) are left out and counted ("3 sections change on every visit"). A web capture (either side) with no stored `capture_block` rows → "Comparison not available for this capture"; the read never calls `ensureBlocks` (no writes on read). Evidence access rules = `get_evidence`'s. *(Builder-check calls.)*
- **Order:** theme-file pages (C7) last.

## 5. 15c-3 — agency management
All tools are platform tools (`permission: 'agency'`, `audit: 'skip-web'`, pattern `operate()` in `tools/platform-billing.ts`), added to `PLATFORM_TOOLS`, each writing one audit row via `withPlatformAudit`. Minimum role: **viewer** reads; **staff** rename/people/suspend; **owner** archive and change plan. Every write sits behind `ConfirmDialog`.

### 5.1 Rename
`platform_rename_agency { agencyId, name }` (1–120 chars, trimmed) updates `agency.name` only.

### 5.2 People
- `list_agency_people { agencyId }` → `{ members: { membershipId, userId, name, email, role, clients: {id,name}[] }[], invitations: { invitationId, email, role, clientId?, sentAt, expiresAt }[] }` (wraps `listTeam` with a service context for that agency).
- `platform_change_member_role { agencyId, membershipId, role }` — agency roles only (`agency_admin` ↔ `account_manager`); refuses removing/demoting the **last** agency admin (`invalid_input`, "An agency needs at least one admin.").
- `platform_remove_member { agencyId, membershipId }` — same last-admin rule.
- `platform_resend_invitation`, `platform_revoke_invitation { agencyId, invitationId }`; `platform_invite_agency_admin { agencyId, email }`.
- Shared service functions live in `packages/tools/src/access/team.ts` (the agency-side `resend_invitation` in §4 uses the same one).

### 5.3 Suspend (C6)
Migration (next free number at execution):
```sql
ALTER TABLE agency ADD COLUMN suspended_at timestamptz;
ALTER TABLE agency ADD COLUMN suspended_reason text;
ALTER TABLE agency ADD COLUMN suspended_by text;  -- platform user id
```
Service role only (app_user has no UPDATE on `agency`). Tools `platform_suspend_agency { agencyId, reason }` (reason 3–500 chars, internal), `platform_unsuspend_agency { agencyId }`.
- `billingAccess()` gains `onHold: boolean` and reports `readOnly: true` when `suspended_at` is set, whatever the Stripe state → `billingWriteGuard` and `assertAgencyServiceable` refuse with `ToolError('service_paused', holdMessage(role))`. Copy (for sign-off): agency roles **"This account is on hold. Contact {supportEmail} to restore it."**; client roles keep the neutral `ACCOUNT_NEEDS_ATTENTION_MESSAGE`. `{supportEmail}` = the existing `SUPPORT_REPLY_TO` env (Phase 10). The banner shows the same agency line to every agency role. Allow-list unchanged (paying stays possible but does not lift a hold).
- `agencyServiceable` also excludes agencies with `suspended_at` set (schedulers, intake, Ask starters); `syncSeats` and the daily billing timers (`daily.ts`) skip held agencies so dunning clocks don't advance.
- **Collection pause (C6):** `BillingGateway` += `pauseCollection(subscriptionId: string, o?: { stripeAccount?: string }): Promise<void>` (`pause_collection: { behavior: 'void' }`) and `resumeCollection(subscriptionId, o?)` (`pause_collection: ''`). Suspend pauses the agency's platform subscription (if any) and every active client subscription on its connected account (`stripeAccount` = the agency's Connect account); unsuspend resumes them. DB flag first, then Stripe calls; each Stripe failure is recorded (`agency_billing_event` `admin_hold_pause_failed`) and shown to the operator with a "Retry billing pause" action — the hold itself stands. Invoices voided during the hold are not re-billed.
- Stripe signals never touch these columns; unsuspend restores whatever the billing state says.
- Agency detail header shows a `StatusChip` "On hold" (danger) with the reason in a tooltip (operators only).

### 5.4 Archive
Button "Archive agency" (owner) → `ConfirmDialog` with `requireText` = agency name → `platform_archive_agency { agencyId }` / `platform_unarchive_agency`, calling **7a2's** archive function (`agency.archived_at`). **Depends on phase-7 7a2 merging first**; if it hasn't by 15c-3 pre-flight, this task is deferred and filed in BACKLOG. Note for 7a2: expose the archive logic as a service function (not only the CLI) so this tool can call it.

### 5.5 Plans and change plan (C11)
- **Plans:** `plan.code` stays the family key; versions stay per code (`plan_code_version_uq`, `plan_current_uq` unchanged). Migration adds `plan.visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private'))`. `standard` is the only `public` code and stays what self-sign-up, trials and `currentStandardPlan` use; `private` plans are assignable only by an operator.
- `create_plan { code, name, basePriceCents, includedSeats, seatPriceCents, trialDays }` (owner): `code` = `^[a-z][a-z0-9_]{2,30}$`, not `standard`, unique; creates version 1, current, `private`, synced via `syncPlanToStripe`. `create_plan_version` gains `code` (default `standard`). `list_plans` returns every code's versions with `visibility`; `/platform/billing` plans tab groups by code.
- `BillingGateway` += `swapSubscriptionPlan(subscriptionId: string, p: { basePriceId: string; seatPriceId: string; seatQuantity: number }): Promise<void>` (Stripe `subscriptions.update` items swap, always `proration_behavior: 'create_prorations'`); fake gateway records the call.
- `platform_change_agency_plan { agencyId, planId }` (owner): target must be a **current** version of any code and differ from the agency's plan. Live subscription → swap prices (seat quantity recomputed with the new plan's `includedSeats`), then set `agency_billing.plan_id`; no subscription (pilot/trial without card) → set `plan_id` only; checkout and trial start use `planFor(row)` (already prefers `plan_id`) — pre-flight confirms every `currentStandardPlan` caller that should honour an assigned plan (`apply.ts`, `trial.ts`) does. Writes `agency_billing_event` (`admin_change_plan`). Refused while on hold.
- Webhook `recordCheckoutFacts` matches price ids against **all** plans, not only `standard`.
- 15c-3's plan may split into two parts (people/rename/suspend/archive, then plans) if it exceeds the plan size cap.

### 5.6 Page
Header actions: Health, Support, **Manage ▾** (Rename, Suspend/Unsuspend, Change plan, Archive — items hidden below the needed role). New **People** card replacing the Team counts card (counts move into its header). Billing panel actions get confirms. Clients table uses `StatusChip` + `formatDate`.

## 6. Overlaps (re-check at each pre-flight)
- **phase-7 7a2:** `agency.archived_at`, `filters.ts` (`agencyServiceable`) — we add `suspended_at` to the same filter; `tools/support.ts`, agency settings pages; Sentry into §3.6 seam. 7a1 `nav-items.ts`. Second to merge rebases.
- **15b-3b:** theme routes/components (C7). **13a:** `app/{not-found,error,global-error}.tsx` now exist (C2), `client-profile-form.tsx` (miles), `/start*`, titles.
- Migrations: 15c-2 (`ask_thread.deleted_at` if the column doesn't exist) and 15c-3 (§5.3) take the next free numbers at execution (main 0080; phase-7 0081–0082; 15b-3 0083).

## 7. Testing
Unit tests per primitive, formatter (tz, year rule, miles rounding, radius round-trip and 40 km clamp), labels fallback, and each tool (role floors, last-admin rule, suspend → write refused with the hold message + scheduler/seat-sync/daily skip + collection paused and resumed via fake gateway incl. a client subscription, partial Stripe failure keeps the hold, create_plan code rules, plan swap via fake gateway, webhook matches a private plan, resend rate limit, compare_captures truncation, masked blocks, no-blocks case and access, delete_ask_thread refuses another user's thread). `white-label-leak.test.tsx` covers error/404. E2E: 404 page, confirm on a billing action, mobile Changes sheet (390px), operator suspend → agency sees banner and a write fails. Help coverage gate for new page keys.

## 8. Not doing
Step into a client from the agency page; knowledge-base preview (backlog); storage in miles; host-aware error pages (13a); Sentry (phase-7); product tour; dark mode.
