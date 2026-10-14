# phase-10 — Agency onboarding wizard (invite-link sign-up, billing step, emails)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-10   **Base:** main @ c84ca97
**Plan/spec:** spec `docs/superpowers/specs/2026-10-14-phase-10-agency-onboarding-design.md`; plan `docs/superpowers/plans/2026-10-14-phase-10-agency-onboarding.md` (Tasks 0–15)

## Status (overwrite)
Planned ahead 2026-10-14: spec + lean plan (Tasks 0–15) **owner-approved**. No code. Dev blocked until 8, 8b, 8c, 9a merge.

## Next (overwrite)
After 8, 8b, 8c, 9a merge: `/rm-kickoff phase-10` → Task 0 pre-flight (rebase, re-check deps, owner adds 4 env vars, install `sharp`) → SDD.

## Interfaces this branch adds or changes
(planned, not built)
- Tables: `pending_signup`, `agency_profile`, `agency_onboarding` (+ `platform_setting` only if no settings table exists); migrations next free ≥ 0054.
- Tools: `start_agency_signup` (public), `get_onboarding_status`, `mark_onboarding_step`, `dismiss_onboarding_checklist`, `mark_onboarding_redirected`, `get_agency_profile`, `update_agency_profile`, `upload_agency_logo`, `set_signups_paused`, `get_signups_paused`, `get_signup_funnel`.
- Changes others' code: `hasSignInRight` (pending sign-up = right); session `after` hook calls `completePendingSignups`; `create_client` sets `first_client_at`; 9a `billingAccess` + `reducedTrial`/`maxActiveClients`; `BillingGateway.updateCustomer`; 9a `create_invite_link` + `emailIt`; `OutgoingEmail.stream`/`headers`; 4 email templates + sign-in `signup` prop.
- Routes: `/sign-up`, `/sign-up/problem`, `/join/[token]`, `/onboarding`, `/u/[token]`, `/files/logo/[agencyId]/[file]`, `POST /agency/branding/logo`.
- Env (owner adds): `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM`. Worker job `onboarding-nudges` (daily 15:00 UTC).

## Assumes from other branches
- **phase-9 (9a executing since 2026-10-14):** tables `agency_invite_link`, `agency_billing`, `plan`, `discount_code`; `generateInviteToken`/`hashInviteToken`, `startAgencyTrial`, `billingAccess`, `create_checkout_session`, `get_billing_summary`, `create_invite_link`, `fakeGateway`; migrations 0052–0053. Its pre-flight drift (outbox client-scoped, `proxy.ts` PUBLIC, closed `ToolErrorCode`, worker registration) is folded into the plan's "Dependencies on in-flight work".
- **phase-8 (8a/8b/8c) merged ✅** (main c84ca97, migrations to 0051): `requirePlatformOperator`, `withPlatformAudit`, console under `app/(platform)/platform/**`, `ToolDefinition.access` required.
- **phase-12 (planning):** also edits `create_client`; takes migrations after ours.
- **phase-7-planning (parked):** domain `rivalmonday.app`, reply-to `support@`.
- **Migrations:** Phase 10 ≥ **0054** (take next free at execution).

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
Roadmap row 10: "Step-by-step agency sign-up via invite link, billing step, emails"; plan *to be written*; **cites no spec §, no estimate**. Numbering is unambiguous (rows 8–11 added 2026-10-12; Phase 7 deferred after them). Relevant spec: **§1.3/§2.2** (agency onboarding flow is a wholesale-phase item, pulled forward; self-serve SMB never), **§3** (Agency Admin role), **§5.1** (branding & voice, users/seats), **§9.4** (Postmark, single sending domain), **§10.6** + 9a spec (billing). Build: `/join/<token>` redemption (validate hash, expiry, uses, revoke, email lock) → account (magic link/Google) → create agency + first `agency_admin` → wizard steps (agency profile, branding, team invites, billing/offer confirmation) → `startAgencyTrial` (pilot/trial) → hand-off to first client (Phase 11 owns the client wizard). Emails: invite, welcome, nudges.

### 2. Already built — reuse, don't rebuild
- **Auth:** `apps/web/src/server/auth-options.ts` — invitation-only (`hasSignInRight` in user-create `before` hook; `acceptInvitations` in session `after` hook); `packages/tools/src/access/invitations.ts` (`createInvitation`, `INVITATION_TTL_DAYS`=14, `normalizeEmail`); `/sign-in`, `/sign-in/check-email`, `/no-access`, `/link-other-account`; membership switcher.
- **Agency creation today:** CLI only — `apps/web/scripts/admin.ts` `create-agency` + `invite` (prints sign-in URL; **no invitation email exists**).
- **Tenancy:** `agency` (`id, name, branding jsonb, created_at`) in `packages/db/src/schema/tenancy.ts`; `AgencyBranding` (`displayName, logoUrl, primary, secondary, accent, fromName, fromEmail, signOff, assistantName`) in `schema/delivery.ts`; `membership`/`invitation` in `schema/access.ts`.
- **Tools:** `invite_member`, `revoke_invitation`, `update_agency_branding` (`tools/src/tools/settings.ts`); `create_client` (`tools/src/tools/onboarding.ts`); pages `/agency/team`, `/agency/branding` (`branding-form.tsx`), `/agency/clients/new`.
- **Email:** `@cs/email` (`templates/sign-in.tsx`, `agency-notice.tsx`); notification outbox (`schema/delivery.ts`) + worker delivery.
- New screens → `packages/demo/src/coverage.ts`.

### 3. Binding decisions (do not re-open)
- Self-hosted Better Auth, invitation-only; access in own `membership` table. Brand tokens, Inter.
- Web reads = registered tools; writes via `runTool`; tools decide permissions; refusals → 404. Service role only where needed; RLS via `withTenant`.
- Postmark; owner approves new `.env` vars (`turbo.json` `globalPassThroughEnv`); no jobs in DEMO/TEST; DEMO/TEST use `fakeGateway`.
- 9a e4 no card at trial start; e7 max 3 active clients in pilot/trial; e8 pilot = status flag; e10 invite links made in 9a, redemption + emails here; e12 Stripe Checkout/Portal for cards; e13 Postmark lifecycle mails in Rival Monday branding.
- 8a d2/d4: platform roles owner|staff|viewer; cross-agency via `deps.service` after `requirePlatformOperator`. 8b: `access` required on tools.

### 4. Backlog to fold in
`docs/BACKLOG.md` has **no Phase 10 heading**. Related items (fold in only if owner agrees):
- [ ] Exercise `/link-other-account` live (never run live) — *from 5a*
- [ ] Google sign-in button has no busy/error handling; `magicLink` call not wrapped in try/catch (button stays disabled) — *from 5a T12*
- Also in Polish: the branding parts of the *5a T18* item (`ColorField` labels, logo preview, dropped `fromEmail`).

### 5. In-flight workstreams
See **Assumes from other branches**. Phase 11 (unplanned) owns client onboarding.

### 6. Open questions
All answered 2026-10-14 → spec f1–f14.
