# Phase 11b — Client invite, competitor-review email, billing step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** Staff invite the business owner from the setup wizard (agency-branded email, agency Cc'd), the owner gets a competitor-review email when suggestions are ready, and agency admins turn on client billing with a per-client price from step 5 — even while the invitation is pending.

**Architecture:** Builds on 11a (same branch, after 11a Tasks 1–14). A shared `inviteClientUser` creates the invitation, an **inactive** contact and a `client_invite` outbox row in one transaction; acceptance activates the contact. Email transport gains `cc`; `notify` gains explicit `contactIds` + `cc`; the dispatcher lets the two setup kinds reach inactive contacts. `clientOwnerEmails` includes pending invitations. `getSetupState` grows to five steps for clients.

**Tech Stack:** as 11a (Drizzle/Postgres, Next.js, pg-boss, `@cs/email` + Postmark, Stripe via `@cs/billing`, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-16-phase-11b-client-invite-billing-design.md` (E1–E7, §2–§9); 11a spec + plan for everything it builds on. Copy in spec §6 is binding.

## Global constraints
- All 11a global constraints apply.
- Client-facing email: agency branding via `resolveBranding`/`loadBranding`; `from` = `"${fromName}" <fromAddress>`; nothing names Rival Monday; `replyTo` = `replyToFor`.
- Only the kinds `client_invite` and `competitor_review` may be delivered to an inactive contact. Briefs, alerts and every other kind keep refusing inactive contacts.
- `cc` ≤ 5 addresses, lower-cased, deduped, never containing the `to` address.
- Email props never carry internal suggestion fields (`overlap_score`, `signals`, `ad_matches`, `appearances`, `best_rank`).
- Sign-in links use `safeNext` (`apps/web/src/server/safe-next.ts`) — never build a redirect from raw input.

## Decisions (plan-local)
- **Q1** `notify` keeps `recipientsFor` as the default; `contactIds` (new) loads exactly those contacts (same agency + client, any `active`) with their email channel only.
- **Q2** `LINK_TARGETS` (`packages/core/src/links.ts`) += `'setup'`; `NotifyInput.subjectType` += `'setup'` (subject id = client id). *(11a pre-flight 2026-10-16: both now land in 11a Task 9 — 11b only reuses them.)* The email button uses the **sign-in URL** (spec §6), not the personal `/l/` link — an invited owner has no session yet and the personal link's landing behaviour is for existing contacts.
- **Q3** Sign-in page accepts `?email=` to prefill the field (display only; validated as an email, else ignored).
- **Q4** `invite_member` for client roles delegates to `inviteClientUser`; for agency roles it is unchanged.
- **Q5** The manual review send lives on the Pick step as a secondary button, visible to staff when an invited contact exists.

## File structure
- DB: migration `<n>_client_setup_invite.sql` (spec §2 SQL); `packages/db/src/schema/{setup.ts,delivery.ts}` (columns, kinds, `payload.cc` type).
- Core: `packages/core/src/links.ts`.
- Email: `packages/email/src/transport.ts` (+ test), `packages/email/src/templates/{client-invite.tsx,competitor-review.tsx}`, `types.ts`, `render.ts`.
- Engine: `packages/engine/src/delivery/{outbox.ts,contacts.ts}` (+ tests); the email channel sender that maps `payload` → `OutgoingEmail` (locate in pre-flight; likely `apps/worker/src/deps.ts` or `engine/src/delivery/senders.ts`).
- Tools: `packages/tools/src/access/{client-invite.ts (new),team.ts,invitations.ts}`, `packages/tools/src/tools/{setup.ts,settings.ts,client-billing.ts,prospects.ts,portfolio.ts}`, `packages/tools/src/setup/state.ts`.
- Worker: `apps/worker/src/jobs/{setup.ts,billing-notices.ts}`.
- Web: `apps/web/src/app/(app)/c/[clientId]/setup/steps/{invite-step.tsx,billing-step.tsx}`, `setup-wizard.tsx`, `actions.ts`, `steps/pick-step.tsx`; `apps/web/src/app/(app)/agency/team/actions.ts`; `apps/web/src/app/sign-in/{page.tsx,sign-in-form.tsx}`.
- Demo/E2E: `packages/demo/src/{setup.ts,coverage.ts}`; `apps/web/e2e/{seed.ts,client-setup-invite.spec.ts}`.

## Dependencies on in-flight work
- **11a Tasks 1–14 done** on this branch: `client_setup`, `getSetupState`/`deriveSetupState`/`completeIfDone`, `setup-reminders` + `runSetupReminders`, wizard page and step components, `SetupBadge`, portfolio `setup` field.
- **phase-10:** may have changed `OutgoingEmail` (`stream`, `headers`) and `create_invite_link` + `emailIt`; `cc` must sit beside those. Re-check `acceptInvitations` (phase-10 edits `hasSignInRight` + session `after` hook).
- **9b:** `clientOwnerEmails` (`tools/client-billing.ts:297`) and the duplicate query in `apps/worker/src/jobs/billing-notices.ts:114`; `enable_client_billing` refusal order (`client-billing.ts:462-505`).

## Review focus
1. A revoked or expired invitation must stop counting as an owner for billing *and* must not leave an active contact; a later re-invite of the same email must reuse, not duplicate, the contact.
2. An invited owner who never accepts must receive no brief, alert or digest (only the two setup kinds) — including the starting-point brief and quiet-week scorecards.
3. Staff inviting from `/agency/team` and from the wizard at the same moment for the same email must end with one pending invitation, one contact and at most two `client_invite` rows (one per invitation id), never a crash on a unique key.
4. A `cc` address that bounces or is malformed must not fail the `to` send (Postmark rejects the whole message on a bad Cc — validate and drop bad addresses before sending).
5. The sign-in page reached from these emails still shows the host's default branding (existing behaviour); confirm on `cs_dev` what an owner of a white-labelled agency sees and file a backlog item if it names Rival Monday.

---

### Task 15: Pre-flight (11b)
**Goal:** Re-validate 11b against the code after 11a landed.
- Re-check **Dependencies on in-flight work**; locate the email channel sender (payload → `OutgoingEmail`) and record its path; confirm `contact` columns (`active`, `role`, `user_id`, unique keys) and whether `contactFor` reactivates an inactive contact today; confirm `client_billing.state` values for "invited/paying/payment needed".
- Patch this plan's paths/names if anything moved; note drift in `docs/work/phase-11.md`.
**Done when:** `pnpm test:affected` green; `docs(phase-11): 11b pre-flight` committed.

### Task 16: Schema — setup columns, kinds, link target
**Files:** migration `<n>_client_setup_invite.sql`; `packages/db/src/schema/{setup.ts,delivery.ts}`; `packages/core/src/links.ts`; tests in `packages/db` (constraint) and `packages/core` (links).
**Interfaces:** spec §2 SQL verbatim; `CLIENT_KINDS += 'client_invite' | 'competitor_review'` (add a DB check migration if kinds are constrained in SQL); `LINK_TARGETS += 'setup'`; `subjectType` comment/type += `'setup'`; notification payload type gains `cc?: string[]`.
**Tests:** `skipped accepts invite and billing, rejects others`; `invited_contact_id is nulled when the contact is deleted`; `signLink/verifyLink round-trip for t=setup`.
**Done when:** `pnpm --filter @cs/db exec vitest run setup` and `pnpm --filter @cs/core exec vitest run links`.

### Task 17: Transport `cc`, `notify` explicit recipients, dispatcher rule
**Files:** `packages/email/src/transport.ts` (+ test); `packages/engine/src/delivery/outbox.ts`, `contacts.ts` (+ tests); the email channel sender found in Task 15.
**Interfaces:**
```ts
// transport.ts
interface OutgoingEmail { /* existing fields */ cc?: string[] }
export function cleanCc(cc: string[] | undefined, to: string): string[];   // lower-case, trim, valid email only, dedupe, drop `to`, max 5
// outbox.ts
interface NotifyInput { /* existing */ contactIds?: string[]; cc?: string[] }
export const INACTIVE_OK_KINDS: readonly NotificationKind[] = ['client_invite', 'competitor_review'];
// contacts.ts
export async function contactsByIds(db: Conn, agencyId: string, clientId: string, ids: string[]): Promise<Recipient[]>; // email channel only, any active state
```
**Behaviour:** `notify`: `contactIds` → `contactsByIds` instead of `recipientsFor`; `payload.cc = cleanCc(input.cc, r.email)` per recipient. Postmark: `Cc` = `cc.join(', ')` only when non-empty. File/memory/console transports write `cc`. Dispatcher `undeliverableReason`, security-sensitive — implement exactly:
```ts
if (n.contactId) {
  const [c] = await db.select({ active: contact.active }).from(contact).where(eq(contact.id, n.contactId));
  if (!c) return 'recipient contact no longer exists';
  if (!c.active && !INACTIVE_OK_KINDS.includes(n.kind as NotificationKind)) return 'recipient contact is inactive';
}
```
The channel sender passes `payload.cc` through `cleanCc` again into `OutgoingEmail.cc`.
**Tests:** `cleanCc drops invalid, duplicate and to-address entries and caps at 5`; `postmark request carries Cc only when non-empty`; `file transport records cc`; `notify with contactIds reaches an inactive contact and sets payload.cc`; `dispatcher sends client_invite to an inactive contact`; `dispatcher still refuses a brief to an inactive contact`; `recipientsFor still skips inactive contacts`.
**Done when:** `pnpm --filter @cs/email exec vitest run transport` and `pnpm --filter @cs/engine exec vitest run delivery`.

### Task 18: Email templates
**Files:** `packages/email/src/templates/{client-invite.tsx,competitor-review.tsx}` (+ tests); `types.ts`, `render.ts`.
**Interfaces:**
```ts
type ClientInviteProps = { businessName: string; agencyName: string; startUrl: string };
type CompetitorReviewProps = { businessName: string; competitorNames: string[]; reviewUrl: string };  // 1..5 names
```
**Behaviour:** copy from spec §6 verbatim (subject, body core, button); `{list}` rendered as a bulleted list in HTML and "- name" lines in text; agency branding + sign-off like `client-billing-notice.tsx`; no "Rival Monday" anywhere. Follow pattern: `client-billing-notice.tsx`.
**Tests:** render snapshots for both; `no template output contains "Rival Monday"`; `competitor list is capped at 5 and escaped`.
**Done when:** `pnpm --filter @cs/email exec vitest run client-invite competitor-review`.

### Task 19: `inviteClientUser`, `invite_client_owner`, activation
**Files:** create `packages/tools/src/access/client-invite.ts` (+ test); modify `packages/tools/src/access/{team.ts,invitations.ts}`, `packages/tools/src/tools/{setup.ts,settings.ts}`, `apps/web/src/app/(app)/agency/team/actions.ts` (success copy).
**Interfaces:**
```ts
export async function inviteClientUser(ctx: AccessContext, deps: ToolDeps,
  input: { clientId: string; email: string; name: string | null; role: 'client_owner' | 'client_viewer' }, now: Date
): Promise<{ invitationId: string; expiresAt: Date; contactId: string }>;
invite_client_owner: input { clientId: uuid, name: string(1..120), email: z.email().max(320) }
  output { invitationId, expiresAt, contactId }; access 'write', permission 'agency', channels ['web'].
```
**Behaviour:** spec §4 steps 1–5 in **one transaction** (`deps.service` for contact + `client_setup`; invitation via the existing `createInvitation` path; `notify` with `contactIds`, `cc: [inviter email]`, kind `client_invite`, `subjectType 'setup'`, `subjectId clientId`, `link { t:'setup', id: clientId }`, dedupe `client-invite:<invitationId>`, `build` → template `client_invite` with `startUrl = ${appUrl}/sign-in?email=<enc>&next=${encodeURIComponent('/c/'+clientId+'/setup')}`). Prospects are allowed (11c L7). Contact upsert: reuse an existing contact for (agency, client, lower(email)); if it is active keep it active; if none, insert `active=false`. `invite_member` with a client role → `inviteClientUser` (name null). Activation: in `acceptInvitations`/`contactFor`, set `active = true` on the linked contact (only for the accepted invitation's client). Team page success copy for client roles: "Invitation sent to {email}."
**Tests:** `account manager outside scope refused`; `client roles refused`; `creates an inactive contact and one client_invite row with cc`; `re-invite same email reuses the contact and queues a new row (new invitation id)`; `concurrent invites end with one pending invitation and one contact` (two parallel calls); `prospect invite allowed`; `acceptance activates the contact`; `team invite for client_viewer also queues client_invite`; `agency-role invite_member unchanged`.
**Done when:** `pnpm --filter @cs/tools exec vitest run client-invite invitations team tools/setup`.

### Task 20: Competitor-review email (auto + manual)
**Files:** `apps/worker/src/jobs/setup.ts` (`runSetupReminders`, + test); `packages/tools/src/tools/setup.ts` (+ test); shared builder `packages/tools/src/setup/review-email.ts` (+ test).
**Interfaces:**
```ts
export async function queueCompetitorReview(conn: Conn, cfg: DeliveryConfig,
  input: { agencyId: string; clientId: string; dedupe: string; now: Date }): Promise<boolean>;  // false when conditions fail
send_competitor_review: input { clientId: uuid } output { queued: boolean }; access 'write', permission 'agency'.
```
**Behaviour:** conditions (spec E3): `invited_contact_id` set and its invitation pending-unexpired or accepted; latest `discovery_run` done with ≥ 1 `suggested`/`accepted` row; competitors step not `done` (automatic only — manual ignores this). Names: tier `top` then `watch`, by `overlap_score` desc, max 5 — names only in props. Cc = `invited_by` user's email, else `replyToFor(...)?.email`. Dedupe: auto `competitor-review:<clientId>`; manual `competitor-review:<clientId>:<UTC yyyy-mm-dd>`. `runSetupReminders` calls it for every open setup (clients and prospects) after its agency-notice checks.
**Tests:** `auto sends once across two runs`; `no auto send when competitors done`; `no send without invited contact`; `manual send works after competitors done, once per day`; `props carry names only` (assert keys); `cc falls back to the account manager`.
**Done when:** `pnpm --filter @cs/worker exec vitest run jobs/setup` and `pnpm --filter @cs/tools exec vitest run review-email tools/setup`.

### Task 21: Billing with a pending owner
**Files:** `packages/tools/src/tools/client-billing.ts` (+ test); `apps/worker/src/jobs/billing-notices.ts` (+ test); `packages/tools/src/forms.ts` (copy).
**Interfaces:**
```ts
export async function clientOwnerEmails(db: Conn, clientId: string, now: Date): Promise<string[]>;  // moved to a shared export; worker imports it
```
**Behaviour:** union of accepted `client_owner` membership emails and pending (not accepted, not revoked, `expires_at > now`) `client_owner` invitation emails for the client; lower-cased, deduped, sorted. `billing-notices.ts` drops its inline query and uses this. `no_client_owner` copy → "Invite the business owner first." Price/setup-fee inputs already exist on `enable_client_billing` — no change beyond tests.
**Tests:** `includes a pending invitation`; `excludes expired and revoked invitations`; `enable_client_billing with priceCents and setupFeeCents for a pending owner sends one payment link at that price`; `payment-link email reaches the pending owner's address`.
**Done when:** `pnpm --filter @cs/tools exec vitest run client-billing` and `pnpm --filter @cs/worker exec vitest run billing-notices`.

### Task 22: Five-step setup state
**Files:** `packages/tools/src/setup/state.ts` (+ test); `packages/tools/src/tools/{prospects.ts,portfolio.ts,setup.ts}` (+ tests).
**Interfaces:** `SetupState.steps` gains optional `invite?: StepStatus; billing?: StepStatus` (`invite` for clients and prospects, `billing` for clients only); `SetupState.totalSteps: 4 | 5`; `deriveSetupState` input gains `invite: { status: 'none' | 'pending' | 'accepted' } ` and `billing: { eligible: boolean; state: string | null }`; `advance_client_setup` actions += `'skip_invite' | 'skip_billing'`; portfolio row `setup: { open; doneSteps; totalSteps }`.
**Behaviour:** spec §8. `billing` = `skipped` when `!eligible` (eligibility = the same checks as `enable_client_billing`'s agency/Connect refusals, via a shared `clientBillingEligibility(db, agencyId)`); `done` for invited/paying/payment-needed states; else `todo`. `convert_prospect`: if a setup row exists and `completed_at` is set, clear it (setup reopens at the invite step). `completeIfDone` uses the client's step list.
**Tests:** matrix rows for 5-step clients (invite pending counts done; billing ineligible counts skipped); `prospect has 4 steps (no billing)`; `convert_prospect reopens a completed setup`; `skip_invite/skip_billing refused for client roles`; portfolio `totalSteps`.
**Done when:** `pnpm --filter @cs/tools exec vitest run setup prospects portfolio`.

### Task 23: Web — invite and billing steps, review button, sign-in prefill
**Files:** `apps/web/src/app/(app)/c/[clientId]/setup/steps/{invite-step.tsx,billing-step.tsx}`, `setup-wizard.tsx`, `actions.ts`, `steps/pick-step.tsx`; `apps/web/src/components/setup-badge.tsx`; `apps/web/src/app/sign-in/{page.tsx,sign-in-form.tsx}` (+ `sign-in-form.test.tsx`).
**Interfaces:** actions `inviteOwnerAction`, `sendReviewAction`, `enableBillingAction` → `runTool('invite_client_owner' | 'send_competitor_review' | 'enable_client_billing')`, `advanceSetupAction` with the new skip actions.
**Behaviour:**
- Stepper labels (binding) for clients: **Your business**, **Finding competitors**, **Pick competitors**, **Invite the owner**, **Billing**; prospects: the first four.
- Invite step: name + email fields, "Send invite"; afterwards "Invited {email} — waiting for them to accept" / "{name} accepted"; "Send again"; "Skip for now". A "Invite the owner" side panel button on steps 1–3 opens the same form (staff only, clients and prospects).
- Billing step (agency admins only; others see "An agency admin turns on billing."): monthly price + setup fee inputs (dollars, 2 decimals → cents), prefilled per spec §7; button "Turn on billing and email the payment link"; ineligible notes per spec §7 copy; "Skip for now".
- Pick step: staff see "Ask {ownerName} to review" when an invited contact exists; success "Review email sent."
- Badge shows "Finish setup · {doneSteps} of {totalSteps}".
- Sign-in: `?email=` prefill (Q3).
**Tests:** `sign-in form prefills a valid email param and ignores an invalid one`; rest covered by Task 24.
**Done when:** `pnpm --filter @cs/web typecheck`, `lint`, `pnpm --filter @cs/web exec vitest run sign-in`.

### Task 24: Demo, coverage, E2E, docs
**Files:** `packages/demo/src/setup.ts`, `coverage.ts`; `apps/web/e2e/{seed.ts,client-setup-invite.spec.ts}`; `docs/work/phase-11.md`.
**Behaviour:** demo: mid-setup client gains a pending invited owner (inactive contact) so the invite step shows "Invited"; coverage entries for the new steps. E2E (uses `BILLING_FAKE_GATEWAY`, file outbox): (1) staff invite from step 4 → outbox JSON for the owner has `cc` = staff email and subject per spec; (2) follow `startUrl` → sign-in with email prefilled → magic link → lands on `/c/<id>/setup`; (3) agency admin billing step with price $249 + setup fee $99 → payment-link email to the pending owner; (4) a client role cannot see the billing step. Work file: owner verification steps — (a) real Postmark test send shows Cc in the client's mail client; (b) invite → accept → contact active, first brief only after acceptance; (c) billing step with pending owner on Stripe test mode; (d) copy sign-off for both templates; (e) sign-in branding check (Review focus 5).
**Done when:** final whole-branch review (most capable model) with `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`; one fix wave.
