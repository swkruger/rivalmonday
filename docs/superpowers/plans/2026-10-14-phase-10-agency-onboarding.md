# Phase 10 — Agency self-serve sign-up & onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** Any agency can sign up at `/sign-up` (or redeem a 9a invite link at `/join/<token>`), verify its email, get an agency on a trial/pilot, and finish a skippable 4-step wizard; a checklist, emails and console controls support the funnel.

**Architecture:** A public `start_agency_signup` tool writes `pending_signup` and triggers the magic link; the existing Better Auth hooks treat a live pending sign-up as a sign-in right and `completePendingSignups` creates agency + profile + admin membership + onboarding row + trial after verification. The wizard and checklist read/write `agency_profile` / `agency_onboarding` through tools. Emails go through the notification outbox; a daily worker job sends day 1/3/7 tips.

**Tech Stack:** TypeScript, Drizzle/Postgres (RLS), Better Auth 1.7.x hooks, Next.js App Router, `sharp` (exact pinned version), Cloudflare Turnstile (server verify over `fetch`), `@cs/email` + Postmark, pg-boss, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-phase-10-agency-onboarding-design.md` (f1–f14). Read it in full before Task 1; its SQL, rules and copy are binding. 9a spec `2026-10-12-phase-9a-platform-billing-design.md` for consumed interfaces.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and each touched package's `CLAUDE.md` first (`apps/web`, `packages/tools`, `packages/email`, `packages/db`, `apps/worker`, `packages/billing`).
- Migrations: next free number at execution time (≥ 0054); never edit applied ones; generate with `pnpm --filter @cs/db generate --custom --name=<x>`.
- Web reads are registered tools; writes go through `runTool`; tools decide permissions; page refusals → 404. Every new tool sets `access` (8b).
- Never log magic links, invite tokens, raw IPs, Turnstile tokens or unsubscribe tokens. IPs are stored only as `ip_hash`.
- `start_agency_signup` returns the same `{ ok: true }` for every outcome after Turnstile (spec § Sign-up); refusal reasons go to a server log line only.
- DEMO/TEST: fake Turnstile verifier, `fakeGateway`, no worker jobs scheduled.
- `tax_id` and billing columns never reach client-user payloads; `upsell_tag` rules unchanged.
- New env vars `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM` are added to `.env` **by the owner**; add them to `turbo.json` `globalPassThroughEnv`, `apps/web/src/server/env.ts` and the worker env. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is derived in `next.config` from `TURNSTILE_SITE_KEY` (no extra var).
- Copy is binding as written in this plan.
- Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only.

## Decisions (plan-local)
- **P1** Sign-up guards live in `packages/tools/src/access/signup.ts` (pure functions + small DB queries), the tool in `packages/tools/src/tools/signup.ts`, completion in `packages/tools/src/access/signup-complete.ts` (exported from `@cs/tools` beside `acceptInvitations`).
- **P2** `start_agency_signup` cannot itself call Better Auth (tools don't depend on `apps/web`). The tool returns `{ ok: true, sendLink: boolean }` to its **server action** caller, which then calls `auth.api.signInMagicLink({ body: { email, callbackURL: '/onboarding' }, headers })` when `sendLink`. The page response is identical either way; `sendLink` never leaves the server.
- **P3** "Same response time": the server action always awaits a fixed floor of 400 ms before returning (sign-ups are rare; cheap protection against timing probes).
- **P4** Console funnel: one read tool `get_signup_funnel({ days: 30|90 })` (platform viewer) → counts of sign-ups, profile done, first client, card added (`agency_billing.state = 'active'`), by source. Shown as a stat row on `/platform/billing`.
- **P6** No `rm_signup_problem` cookie (spec deviation): `/sign-up/problem` re-derives the problem from the user's open `pending_signup` + `checkInviteLink` — avoids setting cookies from inside Better Auth's session hook.
- **P5** Tip copy keyed by `nextStep`; `day` only changes the subject line.

## File structure
- `packages/db/src/schema/onboarding.ts` (new: `pendingSignup`, `agencyProfile`, `agencyOnboarding`, maybe `platformSetting`) + schema index; migrations `<n>_onboarding.sql` (generated) + `<n+1>_onboarding_rls.sql` (custom).
- `packages/tools/src/access/{signup.ts,signup-complete.ts,free-mail.ts}` (+ tests); `access/invitations.ts` (`hasSignInRight`).
- `packages/tools/src/tools/{signup.ts,agency-onboarding.ts,platform-signups.ts}` (+ tests), `all.ts`, `onboarding.ts` (`create_client`).
- `packages/billing/src/{access.ts,gateway.ts,fake-gateway.ts,stripe-gateway.ts}` (allowance + `updateCustomer`); collector scheduler (Task 0 inventory).
- `packages/email/src/templates/{agency-invite,agency-welcome,onboarding-tip,platform-signup-notice}.tsx`, `sign-in.tsx`, `types.ts`, `render.ts`, `labels.ts`, `transport.ts` (stream + headers).
- `apps/web/src/server/{auth-options.ts,logo.ts,turnstile.ts,signup-cookie.ts,unsubscribe.ts}`; `app/sign-up/{page.tsx,sign-up-form.tsx,actions.ts,problem/page.tsx}`, `app/join/[token]/page.tsx`, `app/u/[token]/{page.tsx,route.ts}`, `app/files/logo/[agencyId]/[file]/route.ts`, `app/(app)/onboarding/{page.tsx,steps/*.tsx,actions.ts}`, `app/(app)/agency/branding/logo/route.ts`, `components/agency/{branding-editor.tsx,onboarding-checklist.tsx}`; `(app)/layout.tsx`; console pages under `app/(platform)/platform/billing/`.
- `apps/worker/src/jobs/onboarding.ts` (+ test), `jobs.ts`.
- `packages/demo/src/coverage.ts`; `apps/web/e2e/signup.spec.ts`.

## Dependencies on in-flight work
- **9a merged (hard, f2):** `agency_invite_link`, `generateInviteToken`/`hashInviteToken`, `startAgencyTrial(db, gw, agencyId, { offer, pilotEndsAt?, couponId? })`, `billingAccess`, `assertCanActivateClient`, `create_checkout_session`, `get_billing_summary`, `create_invite_link`, `gatewayFor`/`fakeGateway`, `/platform/billing` page, `agencyServiceable`.
- **8a/8b/8c merged ✅ 2026-10-14 (main c84ca97):** `requirePlatformOperator(deps, ctx, min)`, `platform_audit_log`, console under `app/(platform)/platform/**`, `ToolDefinition.access` required (check whether a "public/no session" access kind exists; if not, add `access: { kind: 'public' }` in Task 3 and note it).
- Platform settings table: none on main after 8a/8b/8c (checked 2026-10-14) → Task 1 creates `platform_setting` unless 9a added one.
- **9a pre-flight drift (2026-10-14, `docs/work/phase-9.md`) that binds this plan:**
  - The `notification` outbox is **client-scoped** (`client_id NOT NULL`). Agency-level emails (welcome, sign-up notice, tips, invite) **use whatever 9a P4 settled** — default: direct send after commit, like `apps/web/src/server/support-email.ts` / the worker transport, with a dedupe guard (welcome/notice: `pending_signup.completed_at` row; tips: the `nudges_sent` update). Tasks 4, 12, 13, 14: replace "enqueue in the same transaction" with "send after commit"; a failed send is logged, never fails sign-up. Task 14's plaintext-URL concern disappears (nothing persisted).
  - Write choke point is `ToolRegistry.invoke` (`packages/core/src/tools.ts`); `ToolErrorCode` is a closed union — new codes (e.g. `trial_client_limit` if not reusing 9a's `billing_seat_limit`) go there + `mcp/src/errors.ts` `mapError` + `forms.ts` `FORM_COPY`.
  - No Next middleware, only `proxy.ts` cookie check: add `PUBLIC` entries for `/sign-up`, `/sign-up/problem`, `/join/`, `/u/`, `/files/logo/`.
  - Worker has no DEMO/TEST gate; jobs are registered in `apps/worker/src/main.ts` `registerJobs` (Task 13 follows 9a's choice).
  - `create_client` has no transaction (Task 6 sets `first_client_at` with a guarded `UPDATE … WHERE first_client_at IS NULL`). Platform audit = `withPlatformAudit` (`tools/src/platform/audit.ts`). Console nav: `components/shell/nav-items.ts`.
- **phase-12 (planning):** also edits `create_client`; migrations 0052–0053 are 9a's, phase-10 ≥ 0054, phase-12 after.

## Review focus
1. A refused sign-up (paused, rate-limited, duplicate trial, bad lock) must be indistinguishable from an accepted one in status, body, redirect and (≥ floor) timing — and no email is sent for it.
2. Two sessions completing the same pending sign-up concurrently (magic link opened in two tabs; Google + link) must create exactly one agency and consume one invite use.
3. An invite link revoked/used up/expired **between** form submit and verification must create nothing and show `/sign-up/problem` with the right copy.
4. A user who already belongs to agency A and signs up for agency B ends with two memberships, lands in B's wizard, and A is untouched.
5. Logo upload of a hostile file (SVG with `<script>` / external href / entity, decompression bomb, mislabelled type) is refused or neutralised and never served as anything but `image/png`.

---

### Task 0: Pre-flight
- [ ] `git rebase main` (8, 8b, 8c, 9a merged). Re-check every item in "Dependencies on in-flight work" against the code; fix names/paths in this plan; record drift in `docs/work/phase-10.md`.
- [ ] Find: platform settings table (reuse?), public tool access kind, actual `billingAccess` return type, `startAgencyTrial` signature, where `create_invite_link`'s form lives, the collection scheduler query files (grep `agencyServiceable(`).
- [ ] Ask the owner to add `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (Cloudflare dashboard → Turnstile → add site `rivalmonday.app` + `localhost`), `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM` (create a Broadcast stream in Postmark) to `.env`. Work proceeds without them (fake verifier, defaults).
- [ ] `pnpm add sharp@<exact current version> --filter @cs/web`; confirm it installs on Windows and in the Vercel build (prebuilt binaries).
- **Done when:** `pnpm test:affected` green after rebase.

## Plan phase 1 — Sign-up → agency

### Task 1: Schema, migrations, backfill
**Goal:** spec § Data model tables, RLS, backfill, pause setting.
**Files:** `packages/db/src/schema/onboarding.ts` + index; generated migration; custom RLS migration.
**Interfaces:** Drizzle `pendingSignup`, `agencyProfile`, `agencyOnboarding` (+ `platformSetting` if needed); types `PendingSignupRow`, `AgencyProfileRow`, `AgencyOnboardingRow`, `OnboardingStep = 'profile'|'team'|'plan'|'branding'`, `OnboardingSource = 'open'|'invite'|'legacy'`.
**Custom migration (full; style of `0046_kb_rls.sql` / `0039_mcp_rls.sql`, with `--> statement-breakpoint` between statements):**
```sql
REVOKE ALL ON pending_signup FROM app_user;
ALTER TABLE pending_signup ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_signup FORCE ROW LEVEL SECURITY;

REVOKE ALL ON agency_profile, agency_onboarding FROM app_user;
GRANT SELECT, INSERT, UPDATE ON agency_profile TO app_user;
GRANT SELECT ON agency_onboarding TO app_user;
ALTER TABLE agency_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_profile_read ON agency_profile FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
CREATE POLICY agency_profile_insert ON agency_profile FOR INSERT
  WITH CHECK (agency_id = app_agency_id() AND app_role() = 'agency_admin');
CREATE POLICY agency_profile_update ON agency_profile FOR UPDATE
  USING (agency_id = app_agency_id() AND app_role() = 'agency_admin')
  WITH CHECK (agency_id = app_agency_id() AND app_role() = 'agency_admin');
ALTER TABLE agency_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_onboarding FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_onboarding_read ON agency_onboarding FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));

INSERT INTO agency_onboarding (agency_id, source, completed_at) SELECT id, 'legacy', now() FROM agency
ON CONFLICT (agency_id) DO NOTHING;
INSERT INTO agency_profile (agency_id) SELECT id FROM agency ON CONFLICT (agency_id) DO NOTHING;
-- only if no platform settings table exists (Task 0):
-- CREATE TABLE platform_setting (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL);
-- REVOKE ALL ON platform_setting FROM app_user; ALTER TABLE platform_setting ENABLE ROW LEVEL SECURITY; ALTER TABLE platform_setting FORCE ROW LEVEL SECURITY;
```
Writes to `agency_onboarding` and `pending_signup` run on the service connection inside tools (like KB, 0046).
**Tests:** `app_user` cannot read `pending_signup`; account manager reads profile, cannot update; admin updates own agency only; client user reads nothing; every pre-existing agency has a `legacy` completed onboarding row and an empty profile; one open pending sign-up per email (unique index).
**Done when:** `pnpm --filter @cs/db exec vitest run onboarding` passes.

### Task 2: Sign-up guards
**Goal:** pure + query helpers used by the tool and by completion.
**Files:** `packages/tools/src/access/{signup.ts,free-mail.ts}` (+ tests); `apps/web/src/server/turnstile.ts` (+ test).
**Interfaces:**
- `FREE_MAIL_DOMAINS: ReadonlySet<string>` (gmail.com, googlemail.com, yahoo.com, outlook.com, hotmail.com, live.com, msn.com, icloud.com, me.com, aol.com, proton.me, protonmail.com, gmx.com, mail.com, zoho.com, yandex.com, comcast.net, att.net, verizon.net, sbcglobal.net).
- `hashIp(ip: string, secret: string): string` — HMAC-SHA256 hex.
- `signupRateLimited(db, ipHash, now): Promise<boolean>` — ≥ 5 rows with that `ip_hash` and `created_at > now − 1 h`.
- `trialAllowed(db, email, now): Promise<boolean>` — false if any `pending_signup` with `source='open'` and `completed_at IS NOT NULL` has this email, or (domain ∉ free-mail) one with the same domain.
- `signupsPaused(db): Promise<boolean>`.
- `checkInviteLink(db, token, email | null, now): Promise<{ ok: true; link: InviteLinkRow } | { ok: false; problem: SignupProblem | 'link_unknown' }>` — `email` null = page-load check (skips lock).
- `type SignupProblem = 'email_lock_mismatch'|'link_used_up'|'link_revoked'|'link_expired'`.
- `verifyTurnstile(token: string, ip: string | null, env): Promise<boolean>` — POST `https://challenges.cloudflare.com/turnstile/v0/siteverify` (`secret`, `response`, `remoteip`), `success === true`; fake when DEMO/TEST or secret unset (passes unless token = `'fail'`); network error → false.
**Behaviour:** emails normalised with `normalizeEmail`; domain compare lower-case; lock compare on normalised emails.
**Tests:** rate limit boundary (4 → ok, 5 → limited, rows older than 1 h ignored); trial rule (same email; same company domain; gmail twice allowed for different addresses); each invite problem; lock case-insensitive; Turnstile fake matrix + real path with mocked `fetch` (success/false/network error).
**Done when:** `pnpm --filter @cs/tools exec vitest run signup` and `pnpm --filter @cs/web exec vitest run turnstile` pass.

### Task 3: `start_agency_signup` tool + sign-in right
**Goal:** public tool writing `pending_signup`; `hasSignInRight` extension.
**Files:** `packages/tools/src/tools/signup.ts` (+ test), `all.ts`, `access/invitations.ts` (+ test).
**Interfaces:**
```ts
const startAgencySignupInput = z.object({
  email: z.string().trim().email().max(254),
  agencyName: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).optional(),
  inviteToken: z.string().startsWith('rm_inv_').max(80).optional(),
  ipHash: z.string().length(64),            // set by the server action, never by the browser
});
// output: { ok: true; sendLink: boolean }
```
Turnstile is verified in the server action **before** calling the tool (tools stay network-free).
**Behaviour (order):** invite token present → `checkInviteLink(token, email)`; not ok → `sendLink=false`. No token → `signupsPaused` → false; `trialAllowed` → false. Then `signupRateLimited` → false. Else upsert the open row for the email (`ON CONFLICT (email) WHERE completed_at IS NULL DO UPDATE` agency_name, contact_name, invite_link_id, source, ip_hash, created_at, `expires_at = now + 7 d`) → `sendLink=true`. Log refusals as `[signup] refused <reason>` (no email). Tool access: public (Task 0).
`hasSignInRight(db, email, now)`: additionally true if an open, unexpired `pending_signup` row has this email.
**Tests:** each refusal returns `{ ok: true, sendLink: false }` and writes nothing; accepted writes one row; second submit overwrites (not duplicates); invite source + link id stored; `hasSignInRight` true for live pending, false after expiry and after completion; existing invitation path unchanged.
**Done when:** `pnpm --filter @cs/tools exec vitest run signup invitations` passes.

### Task 4: Completion in the auth hooks
**Goal:** `completePendingSignups` and wiring (security-sensitive — full logic below).
**Files:** `packages/tools/src/access/signup-complete.ts` (+ test), `apps/web/src/server/auth-options.ts` (+ test), `AuthDeps` gains `billingGateway`.
**Interfaces:** `completePendingSignups(service: Db, gw: BillingGateway, user: { id: string; email: string; name: string | null }, now: Date): Promise<{ agencyIds: string[]; problems: SignupProblem[] }>`.
**Logic (full):**
```ts
const rows = await service.select({ id: pendingSignup.id }).from(pendingSignup)
  .where(and(eq(pendingSignup.email, normalizeEmail(user.email)), isNull(pendingSignup.completedAt), gt(pendingSignup.expiresAt, now)));
for (const { id } of rows) {
  const r = await service.transaction(async (tx) => {
    const [p] = await tx.select().from(pendingSignup).where(eq(pendingSignup.id, id)).for('update');
    if (!p || p.completedAt) return null;                                  // another session won
    let link: InviteLinkRow | null = null;
    if (p.inviteLinkId) {
      [link] = await tx.select().from(agencyInviteLink).where(eq(agencyInviteLink.id, p.inviteLinkId)).for('update');
      const problem = !link ? 'link_revoked' : link.revokedAt ? 'link_revoked' : link.expiresAt <= now ? 'link_expired'
        : link.uses >= link.maxUses ? 'link_used_up'
        : link.emailLock && normalizeEmail(link.emailLock) !== p.email ? 'email_lock_mismatch' : null;
      if (problem) return { problem };
    }
    const [a] = await tx.insert(agency).values({ name: p.agencyName, branding: defaultBranding(p.agencyName) }).returning({ id: agency.id });
    await tx.insert(agencyProfile).values({ agencyId: a.id, contactName: p.contactName, contactEmail: p.email });
    await tx.insert(membership).values({ userId: user.id, agencyId: a.id, role: 'agency_admin' /* + required columns as createInvitation/acceptInvitations write them */ });
    await tx.insert(agencyOnboarding).values({ agencyId: a.id, source: p.source, inviteLinkId: p.inviteLinkId });
    await startAgencyTrial(tx, gw, a.id, link?.offer === 'pilot'
      ? { offer: 'pilot', pilotEndsAt: link.pilotEndsAt ?? undefined, couponId: await couponFor(tx, link) }
      : { offer: 'trial', couponId: link ? await couponFor(tx, link) : undefined });
    if (link) await tx.update(agencyInviteLink).set({ uses: sql`${agencyInviteLink.uses} + 1` }).where(eq(agencyInviteLink.id, link.id));
    await tx.update(pendingSignup).set({ completedAt: now, completedAgencyId: a.id }).where(eq(pendingSignup.id, id));
    await enqueueSignupEmails(tx, a.id, p, now);                            // Task 12: agency_welcome + platform_signup_notice
    return { agencyId: a.id };
  });
  // collect agencyIds / problems
}
```
If `startAgencyTrial` takes a `Db` not a transaction, Task 0 decides: pass `tx` (preferred) or call it right after commit with the agency id (and note it). Stripe customer creation inside `startAgencyTrial` must not happen inside the row lock if it calls the gateway — if it does, move the gateway call after commit.
**Hook wiring:** in `session.create.after`, for verified users call `completePendingSignups` **before** `acceptInvitations`. No problem cookie (plan decision P6): `/onboarding` sends a signed-in user with no membership to `/sign-up/problem`, which re-derives the problem from their open pending row via `checkInviteLink`.
`session.create.before` stays as-is (pending sign-up already counts as a right via Task 3).
**Tests:** open sign-up creates agency/profile/membership(agency_admin)/onboarding(open)/billing(trialing); invite pilot creates `pilot` with `pilot_ends_at` and consumes one use; concurrent double completion (two parallel calls) → one agency (Review focus 2); link revoked/used up/expired/lock mismatch after submit → nothing created, row stays open, problem returned (Review focus 3); existing member of agency A → second membership, A unchanged (Review focus 4); unverified user → nothing; expired row → nothing; auth-options test: magic-link sign-in of a pending email creates the agency once.
**Done when:** `pnpm --filter @cs/tools exec vitest run signup-complete` and `pnpm --filter @cs/web exec vitest run auth-options` pass.

### Task 5: Sign-up pages, Google path, sign-in wording
**Goal:** `/sign-up`, `/join/[token]`, `/sign-up/problem`, Google cookie, sign-up wording in the sign-in email.
**Files:** `apps/web/src/app/sign-up/{page.tsx,sign-up-form.tsx,actions.ts,problem/page.tsx}`, `app/join/[token]/page.tsx`, `server/signup-cookie.ts`, `auth-options.ts` (sendMagicLink props), `packages/email/src/templates/sign-in.tsx`. **Follow pattern:** `app/sign-in/{page,sign-in-form}.tsx`.
**Behaviour:**
- Form fields: Work email, Agency name, Your name (optional), Turnstile widget (script `https://challenges.cloudflare.com/turnstile/v0/api.js`, loaded only on these pages; skipped in DEMO/TEST). Buttons "Create my agency" and "Continue with Google" (only if Google configured).
- Server action `startSignup(formData)`: read IP from `x-forwarded-for` first hop → `hashIp` → `verifyTurnstile` (fail → re-render with "Please complete the check and try again.") → `runTool('start_agency_signup')` → if `sendLink` call `auth.api.signInMagicLink` with `callbackURL: '/onboarding'` → wait until ≥ 400 ms elapsed (P3) → redirect `/sign-in/check-email?for=signup`.
- Google button: same action with `intent=google` → on `sendLink` set cookie `rm_signup` = HMAC-signed pending id (HttpOnly, Secure in prod, SameSite=Lax, 30 min) and return the Google URL from `auth.api.signInSocial({ body: { provider: 'google', callbackURL: '/onboarding' } })`; when not `sendLink`, return the same Google URL anyway (the right check refuses later → `/no-access`, same as today). The cookie is informational for `/onboarding` (shows the agency name while loading); the right comes from the email.
- `sendMagicLink`: if an open pending sign-up exists for the email, render the sign-in template with `signup: { agencyName }`.
- `/join/[token]`: server-side `checkInviteLink(token, null)`; unknown/revoked/expired/used up → page "This invite link is no longer valid. Ask the person who sent it for a new one." (no form). Valid → offer banner then the same form (token in a hidden field; email pre-filled and read-only when `email_lock`).
- `/sign-up/problem`: signed-in user with no membership; re-derive the problem from their open pending row + `checkInviteLink`; copy below; no row → generic.
- Signed-in users visiting `/sign-up` see the form too (second agency, f8).
**Copy (decided):**
- `/sign-up` h1 "Start your Rival Monday trial"; sub "Monitor your clients' competitors from public information. 30 days, no card needed."
- Offer banner (pilot): "You're invited to the Rival Monday pilot{ until {date}}." (trial): "You're invited to a 30-day Rival Monday trial{ with {discount}}."
- check-email `for=signup`: "Check your inbox. If you can create an agency with this address, we've sent a link to confirm it. The link works for 15 minutes."
- Sign-in email with `signup`: subject "Confirm your email to create {agencyName}", body "Click below to confirm your email and set up {agencyName} on Rival Monday.", button "Confirm and continue".
- Problem copy: `email_lock_mismatch` "This invite is for a different email address. Sign in with that address or ask Rival Monday for a new link." `link_used_up` "This invite link has already been used." `link_revoked`/`link_expired` "This invite link is no longer valid." Generic "We couldn't finish creating your agency. Contact support@rivalmonday.app." Each with button "Back to sign-up".
**Tests:** form renders; action happy path calls the magic link once; refused path does not call it but returns the same redirect; Turnstile failure message; join page invalid token copy; locked email read-only; problem page copy per problem; sign-in template signup subject.
**Done when:** `pnpm --filter @cs/web exec vitest run sign-up join` and `pnpm --filter @cs/email exec vitest run sign-in` pass.

## Plan phase 2 — Wizard, checklist, logo, allowance

### Task 6: Onboarding + profile tools
**Goal:** spec § Wizard tools (except logo).
**Files:** `packages/tools/src/tools/agency-onboarding.ts` (+ test), `all.ts`, `tools/onboarding.ts` (`create_client` sets `first_client_at`).
**Interfaces:** `get_onboarding_status`, `mark_onboarding_step`, `dismiss_onboarding_checklist`, `get_agency_profile`, `update_agency_profile` exactly as spec; output types `OnboardingStatus`, `AgencyProfile` (account-manager variant omits `billing*`, `taxId`).
**Behaviour:** `completed_at` rule per spec; `mark_onboarding_step('profile','done')` is set automatically by `update_agency_profile` (wizard may still call it — idempotent); a step done after being skipped clears `*_skipped_at`; `update_agency_profile` writes `agency.name` + profile in one transaction; billing fields mirror postal when `billingSameAsPostal`. Non-admin writes and client users → `permission_denied` (404).
**Tests:** each tool permission matrix (admin/account manager/client/platform); zod: phone/ZIP/timezone/verticals/name; account manager never receives tax/billing; completion rule (all four + first client; all four + dismissed; three + first client → not complete); `create_client` sets `first_client_at` only once.
**Done when:** `pnpm --filter @cs/tools exec vitest run agency-onboarding onboarding` passes.

### Task 7: Reduced trial allowance + Stripe customer details
**Goal:** f12 and spec § Allowance; `updateCustomer`.
**Files:** `packages/billing/src/{access.ts,gateway.ts,fake-gateway.ts,stripe-gateway.ts}` (+ tests), collection scheduler file(s) from Task 0, `packages/tools/src/tools/billing.ts` (`create_checkout_session` copies profile billing fields first).
**Interfaces:** `billingAccess(...)` adds `reducedTrial: boolean`, `maxActiveClients: number`; `BillingGateway.updateCustomer(customerId: string, d: { email?: string; name?: string; address?: { line1; line2?; city; state; postal_code; country }; taxId?: string }): Promise<void>`; `collectionIntervalDays(access): 1 | 7` (or the scheduler's existing unit).
**Behaviour:** `reducedTrial` per spec; `assertCanActivateClient` uses `maxActiveClients`; refusal copy exactly: "Your trial includes 1 active client. Add a payment method to monitor up to 3." Weekly: skip a client's due collection if its last successful collection is < 7 d old. `taxId` → Stripe `tax_id_data` only when it looks like a US EIN (`^\d{2}-?\d{7}$`), else ignored.
**Tests:** matrix open/invite/legacy × pilot/trialing/active; second active client refused with copy for open trial; Checkout lifts it (state active); scheduler skips at 6 d, collects at 7 d for reduced agency and daily for others; `updateCustomer` called with mapped address before checkout; fake records it.
**Done when:** `pnpm --filter @cs/billing exec vitest run access` + `pnpm test:affected` green.

### Task 8: Logo pipeline + routes
**Goal:** spec § Logo pipeline (security-sensitive).
**Files:** `apps/web/src/server/logo.ts` (+ test, fixtures under `apps/web/src/server/__fixtures__/logo/`), `app/(app)/agency/branding/logo/route.ts`, `app/files/logo/[agencyId]/[file]/route.ts`, tool `upload_agency_logo` in `agency-onboarding.ts`.
**Interfaces:** `normalizeLogo(bytes: Uint8Array, contentType: string): Promise<{ png: Uint8Array; sha256: string } | { error: 'too_large'|'unsupported_type'|'unsafe_svg'|'undecodable' }>`; tool input `{ png: base64 string, sha256 }` (the route normalises, the tool stores + updates branding) → `{ logoUrl }`.
**Logic (full for checks):**
```ts
const MAX = 512 * 1024;
if (bytes.byteLength > MAX) return { error: 'too_large' };
const sniff = sniffType(bytes);                   // magic bytes: 89504E47 png, FFD8FF jpeg, RIFF....WEBP webp, '<svg'/'<?xml' svg
if (!sniff || !['image/png','image/jpeg','image/webp','image/svg+xml'].includes(sniff)) return { error: 'unsupported_type' };
if (sniff === 'image/svg+xml') {
  const text = new TextDecoder().decode(bytes);
  if (/<!ENTITY|<!DOCTYPE|<script|<foreignObject|\bon\w+\s*=|(xlink:)?href\s*=\s*["']\s*(https?:|file:|data:text)/i.test(text)) return { error: 'unsafe_svg' };
}
try {
  const out = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'error' })
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer(); // sharp drops metadata unless .withMetadata()
  return { png: new Uint8Array(out), sha256: createHash('sha256').update(out).digest('hex') };
} catch { return { error: 'undecodable' }; }
```
The sniffed type wins over the declared `contentType` (declared only used for the error message).
**Behaviour:** upload route: agency admin session, multipart field `file`, → `normalizeLogo` → `runTool('upload_agency_logo')` → `ObjectStore.put('logos/<agencyId>/<sha>.png', png, 'image/png')` → branding `logoUrl = ${APP_URL}/files/logo/<agencyId>/<sha>.png`. Errors → 400 JSON `{ error }`; UI copy: too_large "Logo must be 512 KB or smaller." unsupported_type "Use a PNG, JPEG, WebP or SVG file." unsafe_svg "This SVG contains scripts or external links. Export it as a plain SVG or PNG." undecodable "We couldn't read this image." Public route: validate `agencyId` uuid and `file` `^[0-9a-f]{64}\.png$`, fetch from store, 200 `image/png` + `Cache-Control: public, max-age=31536000, immutable` + `X-Content-Type-Options: nosniff`, else 404.
**Tests:** fixtures: valid png/jpeg/webp/svg → PNG ≤ 512 px; svg with script / onload / external href / entity → `unsafe_svg`; 600 KB → `too_large`; text file named .png → `unsupported_type`; pixel bomb (e.g. 20000×20000 png header) → `undecodable`; route: non-admin 404, admin stores and updates branding; public route bad file name 404, good → headers.
**Done when:** `pnpm --filter @cs/web exec vitest run logo` passes.

### Task 9: `/onboarding` wizard + shared branding editor + first-session redirect
**Goal:** spec § Wizard UI.
**Files:** `app/(app)/onboarding/{page.tsx,actions.ts,steps/{profile,team,plan,branding}.tsx}`, `components/agency/branding-editor.tsx` (extracted from `app/(app)/agency/branding/branding-form.tsx`, which now uses it), `(app)/layout.tsx` (redirect). **Follow pattern:** existing `/agency/clients/new` form + server actions.
**Behaviour:** admin only (else 404); completed/dismissed → redirect `/agency`. Stepper shows 4 steps with done/skipped state; `?step=` invalid → first open step. Profile: fields per spec, "Billing address same as postal" checkbox. Team: rows (email + role select: Agency admin / Account manager), "Add another", calls `invite_member` per row; "Done" with zero invites asks "Continue without inviting anyone?". Plan: renders `get_billing_summary` (state, trial/pilot end, clients included, discount) + reduced allowance line when `reducedTrial`; "Add payment method" → `create_checkout_session` (return to `?step=plan`). Branding: shared editor with logo upload + preview. Each step: "Save and continue", "Skip for now", "Back". After branding → `/agency`. First-session redirect per spec (`redirected_at`), set via a tiny tool `mark_onboarding_redirected()` (admin).
**Copy (decided):** headings "Your agency", "Invite your team", "Your plan", "Make it yours"; profile intro "We use this to set up your account and invoices. Only your agency name is required to continue — you can skip and finish later."; plan reduced line "During your trial you can monitor 1 client, refreshed weekly. Add a payment method to monitor up to 3, refreshed daily."
**Tests:** component tests per step (submit calls the right action; skip calls `mark_onboarding_step(skip)`); page 404 for account managers; layout redirect fires once (second load no redirect).
**Done when:** `pnpm --filter @cs/web exec vitest run onboarding branding` passes.

### Task 10: `/agency` checklist card
**Goal:** checklist per f6.
**Files:** `components/agency/onboarding-checklist.tsx` (+ test), `app/(app)/agency/page.tsx`.
**Behaviour:** visible to admins when not completed and not dismissed; items in order: "Complete your agency profile", "Invite your team", "Review your plan" (+ "Add a payment method" sub-line when trialing without card), "Add your logo and colours", "Add your first client" (→ `/agency/clients/new`); done items ticked, open/skipped items link to `/onboarding?step=…`; "Dismiss" → `dismiss_onboarding_checklist`; progress "2 of 5 done". Account managers see nothing.
**Tests:** renders open/skipped/done states; dismiss calls the tool; hidden for account managers and when completed.
**Done when:** `pnpm --filter @cs/web exec vitest run onboarding-checklist` passes.

## Plan phase 3 — Emails, jobs, console

### Task 11: Email templates
**Goal:** four new templates + sign-in variant (Task 5) in Rival Monday branding, reply-to `SUPPORT_REPLY_TO`.
**Files:** `packages/email/src/templates/{agency-invite,agency-welcome,onboarding-tip,platform-signup-notice}.tsx` (+ tests), `types.ts`, `render.ts`, `labels.ts`. **Follow pattern:** `agency-notice.tsx` (and 9a `billing-notice.tsx`).
**Interfaces:** `EmailPayload` adds `agency_invite`, `agency_welcome`, `onboarding_tip`, `platform_signup_notice` with spec props; `OnboardingTipProps.nextStep: OnboardingStep | 'first_client'`.
**Copy (decided):**
- agency_invite — subject "You're invited to Rival Monday"; body "Rival Monday watches your clients' local competitors and sends a weekly brief with evidence for every claim. {Pilot: "You're invited to our pilot{ until {date}}." | Trial: "Your invite includes a 30-day trial{ with {discount}}."} This link works until {expiresAt}."; button "Create your agency".
- agency_welcome — subject "Welcome to Rival Monday"; body "{agencyName} is set up. Next: tell us about your agency, invite your team and add your first client. It takes about 10 minutes, and you can stop anytime."; button "Continue setup".
- onboarding_tip — subject by day: 1 "Your Rival Monday setup: next step", 3 "Two minutes to finish setting up {agencyName}", 7 "Your first competitor brief is one client away"; body by nextStep: profile "Add your contact details so we can reach you about your account." team "Invite the people who manage your clients — they'll get their own sign-in." plan "Check your plan, and add a payment method whenever you're ready." branding "Add your logo and colours so client reports look like yours." first_client "Add your first client and we'll start watching their competitors this week."; button "Pick up where you left off"; footer "You're getting this because you started setting up {agencyName}. Unsubscribe from setup tips: {unsubscribeUrl}".
- platform_signup_notice — subject "New agency sign-up: {agencyName}"; body lines "Contact: {contactName} <{email}>", "Source: {Open sign-up|Invite link}", "Offer: {Trial|Pilot until {date}}"; button "Open in console".
**Tests:** each renders subject/button/footer; tip copy per step and day; Rival Monday branding; no token text in logs.
**Done when:** `pnpm --filter @cs/email exec vitest run agency-invite agency-welcome onboarding-tip platform-signup-notice` passes.

### Task 12: Outbox wiring, broadcast stream, unsubscribe
**Goal:** enqueue + deliver the new kinds; tip stream/headers; `/u/[token]`.
**Files:** outbox kinds in `packages/db/src/schema/delivery.ts` (+ migration if kinds are a CHECK/enum), `packages/tools/src/access/signup-complete.ts` (`enqueueSignupEmails`), `apps/worker/src/jobs/delivery.ts`, `packages/email/src/transport.ts` (`OutgoingEmail.stream?: 'outbound'|'broadcast'`, `headers?: { Name: string; Value: string }[]`), `apps/web/src/server/unsubscribe.ts`, `app/u/[token]/{page.tsx,route.ts}`.
**Interfaces:** `unsubscribeToken(agencyId, secret): string` = base64url(agencyId bytes ‖ first 16 bytes of HMAC-SHA256(secret, 'unsub:' + agencyId)); `verifyUnsubscribeToken(token, secret): string | null` (constant-time compare).
**Behaviour:** recipients: welcome → the new admin; signup notice → platform admins with role owner|staff; tips → agency admins. Tip messages: stream `POSTMARK_BROADCAST_STREAM ?? 'broadcast'`, headers `List-Unsubscribe: <${APP_URL}/u/<token>>`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. `GET /u/[token]` page: "Stop setup tips for {agencyName}?" + button "Unsubscribe"; `POST` (form or one-click, no session) → set `unsubscribed_at` → "You won't get setup tips any more." Bad token → 404. All other kinds use the default stream and reply-to `SUPPORT_REPLY_TO ?? 'support@rivalmonday.app'`.
**Tests:** completion enqueues exactly two rows; delivery renders each kind; transport sends stream + headers for tips only; token round-trip, tamper → null; one-click POST sets the column; GET does not.
**Done when:** `pnpm --filter @cs/email exec vitest run transport` + `pnpm --filter @cs/web exec vitest run unsubscribe` + `pnpm --filter @cs/worker exec vitest run delivery` pass.

### Task 13: `onboarding-nudges` worker job
**Goal:** spec § Worker job (non-obvious selection — logic below).
**Files:** `apps/worker/src/jobs/onboarding.ts` (+ test), `apps/worker/src/jobs.ts`.
**Interfaces:** job `onboarding-nudges`, cron `0 15 * * *`; `dueTipSlot(createdAt: Date, now: Date): 0|1|2|3` (count of d ∈ {1,3,7} with `createdAt + d days ≤ now`); `nextOnboardingStep(row): OnboardingStep | 'first_client' | null`.
**Logic:** select onboarding rows `completed_at IS NULL AND dismissed_at IS NULL AND unsubscribed_at IS NULL AND source <> 'legacy'` joined to serviceable agencies (`agencyServiceable`); for each: `slot = dueTipSlot(created_at, now)`; if `slot > nudges_sent` and `nextOnboardingStep(row)` not null → in one transaction: `UPDATE … SET nudges_sent = slot WHERE agency_id = $1 AND nudges_sent < slot` (skip if 0 rows — another run won) and enqueue one `onboarding_tip` with `day = [1,3,7][slot-1]`. Then delete `pending_signup` rows with `expires_at < now − 30 d`. Not scheduled in DEMO/TEST (follow existing job gating).
**Tests:** `dueTipSlot` boundaries (23 h → 0, 24 h → 1, 3 d → 2, 7 d → 3, 30 d → 3); job missing days 1–6 sends **one** day-7 tip; completed/dismissed/unsubscribed/read_only skipped; double run sends once; cleanup deletes only old rows.
**Done when:** `pnpm --filter @cs/worker exec vitest run onboarding` passes.

### Task 14: Console — invite email, pause switch, funnel
**Goal:** spec § Console + P4.
**Files:** `packages/tools/src/tools/platform-signups.ts` (+ test), `all.ts`; 9a `create_invite_link` (add `emailIt: boolean` input; when true and `email_lock` set, enqueue `agency_invite` with the URL in the same transaction); console page `app/(platform)/platform/billing/` (checkbox, pause toggle, funnel stat row).
**Interfaces:** `set_signups_paused({ paused: boolean })` (owner, audited in `platform_audit_log`), `get_signups_paused()` (viewer), `get_signup_funnel({ days: 30|90 })` (viewer) → `{ open: FunnelCounts; invite: FunnelCounts }`, `FunnelCounts = { signups; profileDone; firstClient; cardAdded }`.
**Behaviour:** `emailIt` without `email_lock` → zod error "Set an email lock to email the link."; the invite URL is never stored in plaintext outside the outbox payload — the outbox row is deleted/redacted after delivery the same way sign-in links are handled (check the delivery job; if outbox payloads persist, store the URL encrypted or render at enqueue time and store only the rendered message — Task 0 decides and notes it). Paused copy on `/sign-up`: "New sign-ups are paused right now. Contact support@rivalmonday.app and we'll get you set up." (shown instead of the form; invite links unaffected).
**Tests:** staff cannot pause (404); pause audited; `/sign-up` shows paused copy; funnel counts on a seeded set; `emailIt` enqueues one invite email and requires a lock.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-signups` + `pnpm test:affected` green.

### Task 15: Demo, coverage, E2E
**Goal:** demo data, screen coverage, end-to-end flows.
**Files:** `packages/demo/src/coverage.ts` (+ demo onboarding rows: one agency mid-wizard), `apps/web/e2e/signup.spec.ts`.
**Behaviour:** coverage entries for `/sign-up`, `/sign-up/problem`, `/join/[token]`, `/onboarding?step=profile|team|plan|branding`, `/u/[token]`, `/agency` with checklist. E2E (fake Turnstile, fake gateway, dev-panel magic link): (1) open sign-up → link → wizard skip ×4 → `/agency` checklist shows 0 of 5 + dismiss; (2) invite pilot link → offer banner → sign-up → plan step shows pilot; (3) refused duplicate trial shows the same check-email page and no dev-panel link; (4) logo upload in branding step shows preview.
**Done when:** `pnpm --filter @cs/web e2e:affected` green; coverage test passes.

## Owner verification (after merge)
1. `.env` has the four new vars; Turnstile site includes the prod domain.
2. Incognito → `/sign-up` with a real address → confirm email → wizard → skip all → checklist visible; operator notice email arrives.
3. Console: create an email-locked pilot invite with "Email it" → email arrives → redeem with a different Google account → problem page; redeem with the right one → pilot.
4. Pause sign-ups → `/sign-up` shows paused copy; invite link still works.
5. Next day 15:00 UTC: day-1 tip arrives on the broadcast stream; Gmail shows "Unsubscribe"; one click stops further tips.
