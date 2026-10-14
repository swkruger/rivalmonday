# phase-10 — Agency onboarding wizard (invite-link sign-up, billing step, emails)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-10   **Base:** main @ 4c3ebc1
**Plan/spec:** none yet

## Status (overwrite)
Brief written 2026-10-14; brainstorm not started.

## Next (overwrite)
Owner answers Brief §6 → `superpowers:brainstorming` → spec (new decisions only) → lean plan.

## Interfaces this branch adds or changes
None yet.

## Assumes from other branches
- **phase-9 (9a, approved, not built — hard dependency):** tables `agency_invite_link` (`token_hash`, `token_prefix`, `offer pilot|trial`, `pilot_ends_at`, `discount_code_id`, `email_lock`, `max_uses`, `uses`, `expires_at`, `revoked_at`), `agency_billing`, `plan`, `discount_code`; `generateInviteToken`/`hashInviteToken`, `startAgencyTrial(db, gw, agencyId, { offer, pilotEndsAt?, couponId? })`, `create_checkout_session`, `fakeGateway`; `create_invite_link` returns `${APP_URL}/join/<token>` (**route `/join/[token]` is ours**); `billing-notice` template + outbox kinds; console `/platform/billing` invite-links UI. 9a e10: *redemption and invite emails are Phase 10*.
- **phase-8 (8a, done, awaiting merge):** `requirePlatformOperator(deps, ctx, min?)`, `platform_audit_log`, `/platform/agencies[/id]`; migrations 0047–0048.
- **phase-8b (done, stacked on 8):** moves console to `app/(platform)/platform/**` — use those paths; `AccessContext.support`, `ToolDefinition.access` **required** on every new tool; email template `support-session-started`, edits `packages/email/src/{render,types}.ts`; migrations 0049–0050.
- **phase-8c (no work file; on 8b, platform costs):** migration 0051; edits `turbo.json`, `email/src/{labels,render,types}.ts`, `coverage.ts`.
- **phase-7-planning (parked):** domain `rivalmonday.app`, mail from `mail.rivalmonday.app`, reply-to `support@` (7a d3/d5).
- **Migrations:** main at 0046; in-flight use 0047–0051; 9a adds two → Phase 10 earliest **0054** (take next free at execution).
- **Hot spots:** `email/src/{render,types,labels}.ts`, `coverage.ts`, `tools/all.ts`, `server/auth-options.ts`, nav.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

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

### 6. Open questions for the owner (most design-changing first)
1. **Split?** (a) one phase, ~3 plan phases (redemption + account/agency creation; wizard steps; emails); (b) 10a sign-up + wizard, 10b emails/nudges + console follow-up. *Rec: (a) — 9a already builds links/billing, scope is ~1–1.5 wks.*
2. **Order vs 9a:** (a) execute after 9a merges, consume its links + `startAgencyTrial`; (b) build now with a minimal own token table, 9a adapts; (c) move invite-link creation from 9a into 10. *Rec: (a); plan can be written now.*
3. **Entry model:** (a) invite link only; (b) link + public "request access" form feeding the console; (c) open self-serve trial sign-up. *Rec: (a), (b) later.*
4. **When the agency is created:** (a) on form submit before email verification; (b) only after verified sign-in (pending signup row + auth hook, link `uses` consumed then). *Rec: (b) — no orphan agencies, fits invitation-only auth.*
5. **Wizard steps & required:** account → agency profile (name, website, timezone, verticals) → branding (logo, colours, display/assistant name, sign-off) → invite team → billing/offer confirm → "add first client" (Phase 11). (a) only account + name required, rest skippable, resumable checklist on `/agency`; (b) all steps mandatory. *Rec: (a).*
6. **Billing step:** (a) show offer (pilot end / trial end, plan, 3-client cap, discount) + optional "Add payment method" via Checkout; (b) require Checkout for trial links. *Rec: (a) per 9a e4.*
7. **Existing users / email lock:** user already in another agency redeems → (a) allow, second membership via switcher; (b) refuse. Locked link + different Google email → refuse with copy. *Rec: (a) + refuse mismatch.*
8. **Emails:** (a) invite (email-locked links, sent from console), welcome, one nudge at 3 d if wizard unfinished, owner notice on new sign-up; (b) add multi-step drip (1/3/7 d); (c) invite + welcome only. All via outbox, Rival Monday branding, reply-to TBD. *Rec: (a).*
9. **Wizard state:** (a) derived from data + `agency.onboarding_completed_at` (existing agencies backfilled as complete); (b) `agency_onboarding` table with per-step timestamps (funnel stats for console). *Rec: (b) thin — gives the console a funnel.*
10. **Logo:** (a) URL field as today; (b) upload to evidence storage (fs/R2) served by a public route. *Rec: (a) now, (b) when R2 exists.*
