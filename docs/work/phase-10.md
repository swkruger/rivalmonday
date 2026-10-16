# phase-10 — Agency onboarding wizard (invite-link sign-up, billing step, emails)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-10   **Base:** main @ 4b1fb82
**Plan/spec:** spec `docs/superpowers/specs/2026-10-14-phase-10-agency-onboarding-design.md`; plan `docs/superpowers/plans/2026-10-14-phase-10-agency-onboarding.md` (Tasks 0–15)

## Status (overwrite)
**Task 0 pre-flight done 2026-10-15**: `sharp@0.35.5` pinned in `@cs/web`; drift below. Details: `.superpowers/sdd/2026-10-14-phase-10-agency-onboarding/preflight-findings.md` (local).

## Next (overwrite)
SDD Tasks 1–15 applying the pre-flight drift. Owner: add the 4 env vars (fakes/defaults until then).

## Interfaces this branch adds or changes
(planned, not built)
- Tables: `pending_signup`, `agency_profile`, `agency_onboarding` (reuse 9b `platform_setting`); migrations from 0065.
- Service fn `startAgencySignup` (no session); tools: `get_onboarding_status`, `mark_onboarding_step`, `dismiss_onboarding_checklist`, `mark_onboarding_redirected`, `get_agency_profile`, `update_agency_profile`, `upload_agency_logo`, `set_signups_paused`, `get_signups_paused`, `get_signup_funnel`.
- Changes others' code: `hasSignInRight` (pending sign-up = right); session `after` hook calls `completePendingSignups`; `create_client` sets `first_client_at`; 9a `billingAccess` + `reducedTrial`/`maxActiveClients`; `BillingGateway.updateCustomer`; 9a `create_invite_link` + `emailIt`; `OutgoingEmail.stream`/`headers`; 4 email templates + sign-in `signup` prop.
- Routes: `/sign-up`, `/sign-up/problem`, `/join/[token]`, `/onboarding`, `/u/[token]`, `/files/logo/[agencyId]/[file]`, `POST /agency/branding/logo`.
- Env (owner adds): `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM`. Worker job `onboarding-nudges` (daily 15:00 UTC).

## Assumes from other branches
- **phase-9 merged ✅ 2026-10-16** (main `c9c529c`+): 9a tables `agency_invite_link`, `agency_billing`, `plan`, `discount_code`, `billing_notice` are migrations **0057–0059** (not 0052–0053); `generateInviteToken`/`hashInviteToken`, `startAgencyTrial`, `billingAccess`, `create_checkout_session`, `get_billing_summary`, `create_invite_link`, `fakeGateway` in `@cs/billing`/`@cs/tools`; `clientServiceable` + `agencyServiceable` on every new scheduler.
- **Pre-flight drift (2026-10-15)** — binds later tasks:
  - T1: `platform_setting` exists (9b) → no DDL; key `signups_paused`. Type is `AgencyInviteLinkRow`.
  - T3: no public tool kind (`access` = read/write) → `startAgencySignup(service, input, now)` service fn in `@cs/tools`, called by the server action; not registered.
  - T4: null-transition risk is real (`lockBillingRow`, `ensureCustomer`, `set_seat_cap_exempt` insert pilot rows) → `startAgencyTrial(db: BillingDb, gw | null, …)` runs **inside** the completion tx with `gw=null` (customer lazily at Checkout); no `AuthDeps` gateway. Membership: `createdBy`, `addContact`; `branding: null`. Callback `/onboarding/start` route sets `rm_membership` to the new agency (oldest membership wins otherwise) or → `/sign-up/problem`.
  - T4/12/13 emails: welcome, signup notice, tips via **`billing_notice`** outbox (same tx, dedupe keys) + kind branches in worker `billing-notices.ts`; invite email sent directly in `createInviteLinkAction`. `OutgoingEmail` gains `stream`/`headers`.
  - T6: `create_client` is already transactional → set `first_client_at` in its tx.
  - T7: vendor sources are already weekly; only `claimDuePages` daily cadence becomes weekly for reduced trials (`agencyReducedTrial` SQL in `filters.ts`). Cap reuses `billing_seat_limit`.
  - T8: widen `ToolDeps.evidenceStore` with `put`. T9: `create_checkout_session` needs a `returnTo` input. T13: register in `main.ts`, skip on `envName`.
- **phase-8 merged ✅**: `requirePlatformOperator`, `withPlatformAudit`, console under `app/(platform)/platform/**`, `ToolDefinition.access` required.
- **phase-12 merged ✅ 2026-10-15**: also edits `create_client` (`first_client_at`/activation backfill 0055); auto competitor search on profile completion; 1 manual search/client/week.
- **phase-7-planning (parked):** domain `rivalmonday.app`, reply-to `support@`.
- **Migrations:** `main` ends at **0064** → Phase 10 starts at **0065**.

## Decisions (owner-approved)
Spec f1–f14 (`docs/superpowers/specs/2026-10-14-phase-10-agency-onboarding-design.md`). Headline: **open self-serve agency sign-up** (amends root `CLAUDE.md` "invitation-only" — update § Decisions at merge); no card at trial start; open-trial allowance 1 client, weekly; agency created only after email verification. Plan-local P1–P6 in the plan. Plan approved 2026-10-14.

## New backlog (target → item)
- Owner → create Cloudflare Turnstile site (prod domain + localhost) and a Postmark Broadcast stream before Phase 10 execution.
- Phase 10 merge → root `CLAUDE.md` § Decisions: auth no longer invitation-only for new agencies (f3).
- Polish → delete superseded logo objects under `logos/<agency>/` (Phase 10 keeps them).
- Unscheduled → public "request access" form / marketing landing (declined for now, Q3/Q12).

## Owner verification steps
See the plan § Owner verification (5 checks: env/Turnstile, open sign-up end-to-end, email-locked invite + mismatch, pause switch, day-1 tip + one-click unsubscribe).

## Brief

### 1. Scope
Roadmap row 10 (sign-up via invite link, billing step, emails); core spec §1.3/§2.2, §3, §5.1, §9.4, §10.6 + 9a spec. Phase 11 owns the client wizard.

### 2. Already built — reuse, don't rebuild
- **Auth:** `apps/web/src/server/auth-options.ts` — invitation-only (`hasSignInRight` in user-create `before` hook; `acceptInvitations` in session `after` hook); `packages/tools/src/access/invitations.ts` (`createInvitation`, `INVITATION_TTL_DAYS`=14, `normalizeEmail`); `/sign-in`, `/sign-in/check-email`, `/no-access`, `/link-other-account`; membership switcher.
- **Agency creation today:** CLI `apps/web/scripts/admin.ts` `create-agency` + `invite`.
- **Tenancy:** `agency` (`id, name, branding jsonb, created_at`) in `packages/db/src/schema/tenancy.ts`; `AgencyBranding` (`displayName, logoUrl, primary, secondary, accent, fromName, fromEmail, signOff, assistantName`) in `schema/delivery.ts`; `membership`/`invitation` in `schema/access.ts`.
- **Tools:** `invite_member`, `revoke_invitation`, `update_agency_branding` (`tools/src/tools/settings.ts`); `create_client` (`tools/src/tools/onboarding.ts`); pages `/agency/team`, `/agency/branding` (`branding-form.tsx`), `/agency/clients/new`.
- **Email:** `@cs/email` (`templates/sign-in.tsx`, `agency-notice.tsx`); agency emails via `billing_notice` (see drift).
- New screens → `packages/demo/src/coverage.ts`.

### 3. Binding decisions (do not re-open)
- Self-hosted Better Auth; access in own `membership` table.
- Web reads = registered tools; writes via `runTool`; tools decide permissions; refusals → 404. Service role only where needed; RLS via `withTenant`.
- Postmark; owner approves new `.env` vars (`turbo.json` `globalPassThroughEnv`); no jobs in DEMO/TEST; DEMO/TEST use `fakeGateway`.
- 9a e4 no card at trial start; e7 max 3 active clients in pilot/trial; e8 pilot = status flag; e10 invite links made in 9a, redemption + emails here; e12 Stripe Checkout/Portal for cards; e13 Postmark lifecycle mails in Rival Monday branding.
- 8a d2/d4: platform roles owner|staff|viewer; cross-agency via `deps.service` after `requirePlatformOperator`.

### 4. Backlog to fold in
`docs/BACKLOG.md` has **no Phase 10 heading**. Related items (fold in only if owner agrees):
- [ ] Exercise `/link-other-account` live (never run live) — *from 5a*
- [ ] Google sign-in button has no busy/error handling; `magicLink` call not wrapped in try/catch (button stays disabled) — *from 5a T12*
- Also in Polish: the branding parts of the *5a T18* item (`ColorField` labels, logo preview, dropped `fromEmail`).
