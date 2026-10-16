# phase-10 — Agency self-serve sign-up & onboarding wizard

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-10   **Base:** main @ 4b1fb82
**Plan/spec:** spec `docs/superpowers/specs/2026-10-14-phase-10-agency-onboarding-design.md`; plan `docs/superpowers/plans/2026-10-14-phase-10-agency-onboarding.md` (Tasks 0–15)

## Status (overwrite)
**Built and reviewed 2026-10-16** (head `38b4c33`): Tasks 0–15 done via SDD (task review per task), final whole-branch review ("with fixes") + one 13-item fix wave, scoped re-review clean. `pnpm test:affected --base main` 16/16 green at the final review (after the fix wave a combined run crashed one `@cs/web` vitest worker with `ERR_IPC_CHANNEL_CLOSED` — memory; tools/web/worker re-run alone green). `e2e:affected --base main` 76/76 green after the fix wave. Nothing uncommitted. **Not merged.**

## Next (overwrite)
1. Owner: review "Rulings made during execution" below + R20 copy; add the 4 env vars (fakes/defaults work until then).
2. `/rm-merge phase-10` with the owner's go-ahead (full unit + full E2E there). At merge: root `CLAUDE.md` § Decisions — new agencies may self-sign-up (f3); BACKLOG/ARCHITECTURE fold-in from this file.

## Interfaces this branch adds or changes
- **Migrations 0065** (`pending_signup`, `agency_profile`, `agency_onboarding`) **+ 0066** (RLS, grants, legacy backfill: every existing agency → completed `legacy` onboarding + empty profile). Next free: **0067**. `app_user` gets INSERT/UPDATE on `agency_profile` (privilege allow-list updated).
- `@cs/tools`: service fns `startAgencySignup`, `completePendingSignups`, guards (`checkInviteLink`, `inviteProblemForLink`, `trialAllowed`, `signupRateLimited`, `signupsPaused`, `hashIp`, `FREE_MAIL_DOMAINS`), `unsubscribeToken`/`verifyUnsubscribeToken`, `platformOperatorEmails`; `hasSignInRight` accepts a live pending sign-up. Tools: `get_onboarding_status`, `mark_onboarding_step`, `dismiss_onboarding_checklist`, `mark_onboarding_redirected`, `get_agency_profile`, `update_agency_profile`, `upload_agency_logo`, `set_signups_paused`, `get_signups_paused`, `get_signup_funnel`. `create_client` stamps `first_client_at`; `create_invite_link` gains `emailIt`, rejects restricted/expired codes; `create_checkout_session` gains `returnTo`; `get_billing_summary` gains `reducedTrial`/`maxActiveClients`. `ToolDeps.evidenceStore` now `{get, put}`.
- `@cs/billing`: `startAgencyTrial(db: BillingDb, gw | null, …, { notice? })`; `billingAccess` + `reducedTrial`/`maxActiveClients`; `BillingGateway.updateCustomer`; `normalizeUsEin`. `@cs/db` `agencyReducedTrial()` (used by `claimDuePages`).
- `@cs/email`: templates `agency_invite`, `agency_welcome`, `onboarding_tip`, `platform_signup_notice`; sign-in `signup` prop; `OutgoingEmail.stream`/`headers`; Layout `footer: ReactNode`.
- Worker: new `billing_notice` kinds `agency_welcome`, `platform_signup_notice`, `onboarding_tip` (delivered by `billing-notices`); job `onboarding-nudges` (`0 15 * * *`). Worker now reads `BETTER_AUTH_SECRET`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM`.
- Routes: `/sign-up`, `/sign-up/problem`, `/join/[token]`, `/onboarding/start`, `/onboarding`, `/u/[token]` (+ `/confirm`, `/done`), `/files/logo/[agencyId]/[file]`, `POST /agency/branding/logo`; proxy PUBLIC adds `/sign-up`, `/join/`, `/u/`, `/files/logo/`. Cookie `rm_signup`. E2E tag `@onboarding`.
- Env (owner adds): `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM` (in `turbo.json`). `sharp` pinned 0.34.5 in `@cs/web`.

## Assumes from other branches
- Phases 8, 9 (9a+9b), 12 merged ✅. phase-7-planning parked (domain `rivalmonday.app`, reply-to `support@`). No other in-flight branch.

## Decisions (owner-approved)
Spec f1–f14; plan P1–P6; plan approved 2026-10-14.

### Rulings made during execution (controller — owner to review; reasoning in commit history)
- R1 reuse 9b `platform_setting` (key `signups_paused`). R2 `startAgencySignup` is a service fn, not a tool (no tool runs without an agency ctx).
- R3 completion runs `startAgencyTrial(tx, null, …, {notice:false})` inside its tx: no Stripe call in the lock, no default-pilot-row race; **trial_started email suppressed at sign-up** (welcome email sent instead).
- R4 callback `/onboarding/start` picks the newest open admin membership (else `/sign-up/problem` or `/agency`). R5 agency emails via 9a `billing_notice` outbox; invite email sent directly from the console action (URL never stored).
- R6 reduced trial slows only daily web pages to weekly (vendor data already weekly). R7 trial cap reuses `billing_seat_limit`; error links to `/agency/settings/billing` (not `/onboarding?step=plan`).
- R8 any `create_client` (prospects too) ticks "first client". R16 Turnstile site key passed as a server prop (no `NEXT_PUBLIC_` var). R18 Google path always sets `rm_signup` (refused = random id) so responses are identical.
- R19 small SVG logos rasterised at higher density (still ≤ 512 px, pixel limit applies). R20 **profile intro copy kept** ("Only your agency name is required…") although saving the step needs contact name/email/phone — **owner sign-off**.
- R21 unsubscribe token helpers in `@cs/tools` (worker builds, web verifies). R22 `List-Unsubscribe` = https URL only (no mailto). R23 tips skip skipped steps. R24 sharp 0.34.5 repo-wide (two versions crash `next build` on Windows). R25 agency without an onboarding row = completed legacy (admin CLI/seeds never see the wizard).

## New backlog (target → item)
- Owner → Postmark broadcast stream must use unsubscribe handling **"None"** (else Postmark suppresses without setting `unsubscribed_at`, tips 406-retry).
- Polish → delete superseded logo objects under `logos/<agency>/`; SVG `<!DOCTYPE`/`<!ENTITY` rejects Illustrator exports with "scripts or external links" copy (tweak copy).
- Polish → existing member whose second-agency invite breaks lands on `/agency` with no explanation (`onboarding-start.ts` checks membership first).
- Polish → welcome-email link may open the wrong wizard for a user with two open agencies; sign-up email subject echoes the typed agency name (strip URL-like text?).
- Polish → Checkout return doesn't mark the plan step; wizard skip/continue tool failures show 404; team step has no post-invite hint.
- Polish → `/sign-up` pause read fails closed on DB error; invite email `expiresAt` recomputed (ms drift); `get_billing_summary` reads billing twice; `billing-notices.ts` repeats the admins+deliver pattern 5×.
- Polish → test hygiene: >120-char CHECK tests, `parseWebEnv` new-var test, funnel non-active `cardAdded` case, sequential double-run nudge test, refused-duplicate E2E fixed 3 s wait, mock-based console spies.
- Polish → `couponFor` ignores `max_redemptions` (Stripe enforces; exhausted coupon → Checkout error).
- Unscheduled → public "request access" form / marketing landing (declined for now).

## Owner verification steps
1. `.env` has the four new vars; Turnstile site covers `rivalmonday.app` + `localhost`; Postmark broadcast stream exists with unsubscribe handling "None".
2. Incognito → `/sign-up` with a real address → confirm email → wizard → skip all → `/agency` checklist "0 of 5"; operator notice email arrives; welcome email arrives (no separate "trial started" email — R3).
3. Console `/platform/billing`: create an email-locked pilot invite with "Email it" → email arrives → redeem with a different Google account → problem page; with the right one → pilot, "Join the Rival Monday pilot" heading.
4. Pause sign-ups → `/sign-up` shows paused copy; invite link still works. Funnel stat row shows the test sign-ups.
5. Next day 15:00 UTC: day-1 tip arrives on the broadcast stream; Gmail shows "Unsubscribe"; one click stops further tips.
6. Open-trial agency: a second active client is refused with "Your trial includes 1 active client. Add a payment method to monitor up to 3."; after Checkout it's allowed.
7. Copy sign-off: profile intro (R20) and the four email templates.
