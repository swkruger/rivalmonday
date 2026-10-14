# Phase 10 — Agency self-serve sign-up & onboarding wizard (design)

New decisions and interfaces only. Builds on core spec §1.3/§2.2, §3, §5.1, §9.4, §10.6 and the 9a spec
(`2026-10-12-phase-9a-platform-billing-design.md`, e4/e7/e8/e10/e12/e13). Brief: `docs/work/phase-10.md`.

## Decisions (owner-approved 2026-10-14)
- **f1 One phase**, three plan phases: (1) sign-up → agency creation, (2) wizard + checklist + logo, (3) emails + jobs + console.
- **f2 After 9a.** Execution starts after 9a merges; we consume `agency_invite_link`, `generateInviteToken`/`hashInviteToken`,
  `startAgencyTrial`, `create_checkout_session`, `get_billing_summary`, `billingAccess`, `fakeGateway` as declared there.
- **f3 Open self-serve sign-up for agencies** (amends root `CLAUDE.md` "invitation-only" and core §1.3/§2.2): anyone may create
  an *agency* on a trial. Agency staff and client users stay invitation-only. Self-serve SMB stays "never". 9a invite links
  remain for pilots and special offers.
- **f4 Light abuse protection**, no card at start (9a e4 stands): email verification before creation; Cloudflare Turnstile;
  5 sign-ups / IP-hash / hour; one trial per email ever; one per email domain unless free-mail; reduced trial allowance (f12);
  operator notice per sign-up; console pause switch.
- **f5 Agency created only after verified sign-in**, from a `pending_signup` row (expires 7 d). Invite-link `uses` is consumed
  at creation, not at form submit.
- **f6 Wizard order:** profile & contact → team → plan → branding. Only agency name is required; every step skippable.
  "Add your first client" is a checklist item, not a step. The `/agency` checklist lists every skipped/unfinished step
  (incl. branding) plus first client, until done or dismissed.
- **f7 Profile data** in our own `agency_profile`. Saving the profile step requires contact name, contact email and phone;
  "Skip" skips the whole step (agency name was captured at sign-up); address/billing fields are always optional. Billing email + address + tax ID copied to the Stripe customer when
  a Checkout session is created.
- **f8 Existing users** may create/join a second agency (switcher). Email-locked link + different sign-in email → refused,
  nothing created, link not consumed.
- **f9 Emails:** sign-in (sign-up wording), `agency_invite`, `agency_welcome`, `onboarding_tip` at day 1/3/7 (each skipped once
  onboarding is complete/dismissed/unsubscribed), `platform_signup_notice`. Tips on Postmark's broadcast stream with one-click
  unsubscribe. Reply-to `SUPPORT_REPLY_TO` (default `support@rivalmonday.app`).
- **f10 Progress** in `agency_onboarding` (per-step done/skipped timestamps); existing agencies backfilled complete.
- **f11 Logo upload** in this phase; every upload re-encoded to PNG by `sharp` (SVG rasterised, never stored as SVG).
- **f12 Reduced trial allowance:** agency with `agency_onboarding.source = 'open'` and billing state `trialing` → max **1**
  active client and **weekly** collection. Lifted when the state leaves `trialing` (Checkout → `active`). Invite-link and
  pilot agencies keep 9a e7 (3).
- **f13 Sign-up lives in the app** at `/sign-up` and `/join/[token]`; the marketing site links to it. No marketing pages here.
- **f14 Mechanism:** extend the existing auth hooks (approach A) — `hasSignInRight` accepts a live pending sign-up;
  `completePendingSignups` runs beside `acceptInvitations` in the session `after` hook.

## Data model (one migration, next free number at execution — ≥ 0054)
```sql
CREATE TABLE pending_signup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,                         -- normalizeEmail()
  agency_name text NOT NULL CHECK (length(agency_name) BETWEEN 1 AND 120),
  contact_name text CHECK (length(contact_name) <= 120),
  invite_link_id uuid REFERENCES agency_invite_link(id),
  source text NOT NULL CHECK (source IN ('open','invite')),
  ip_hash text NOT NULL,                       -- HMAC-SHA256(ip, AUTH secret), never the raw IP
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_agency_id uuid REFERENCES agency(id) ON DELETE SET NULL,
  completed_at timestamptz
);
CREATE UNIQUE INDEX pending_signup_open_email_uq ON pending_signup (email) WHERE completed_at IS NULL;
CREATE INDEX pending_signup_ip_idx ON pending_signup (ip_hash, created_at);
-- service role only: RLS enabled, no policies for app roles.

CREATE TABLE agency_profile (
  agency_id uuid PRIMARY KEY REFERENCES agency(id) ON DELETE CASCADE,
  legal_name text, website text, contact_name text, contact_role text, contact_email text, phone text,
  line1 text, line2 text, city text, region text, postal_code text, country text NOT NULL DEFAULT 'US',
  timezone text NOT NULL DEFAULT 'America/New_York', verticals text[] NOT NULL DEFAULT '{}',
  billing_email text, billing_same_as_postal boolean NOT NULL DEFAULT true,
  billing_line1 text, billing_line2 text, billing_city text, billing_region text, billing_postal_code text,
  billing_country text, tax_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agency_onboarding (
  agency_id uuid PRIMARY KEY REFERENCES agency(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('open','invite','legacy')),
  invite_link_id uuid REFERENCES agency_invite_link(id),
  profile_done_at timestamptz, profile_skipped_at timestamptz,
  team_done_at timestamptz, team_skipped_at timestamptz,
  plan_done_at timestamptz, plan_skipped_at timestamptz,
  branding_done_at timestamptz, branding_skipped_at timestamptz,
  first_client_at timestamptz,
  dismissed_at timestamptz, completed_at timestamptz, redirected_at timestamptz,
  nudges_sent smallint NOT NULL DEFAULT 0 CHECK (nudges_sent BETWEEN 0 AND 3),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO agency_onboarding (agency_id, source, completed_at) SELECT id, 'legacy', now() FROM agency;
```
- RLS: `agency_profile` — select for members of the agency with role `agency_admin` or `account_manager`; insert/update for
  `agency_admin`. `agency_onboarding` — select for agency members (admin/account manager); writes service-role only (via tools).
  Mirror the policy style of the latest tenancy migration. `tax_id` and billing columns never appear in client-facing reads.
- **Pause switch:** reuse a platform settings table if 8a/8b has one (pre-flight check); else
  `platform_setting (key text PRIMARY KEY, value jsonb NOT NULL, updated_at, updated_by text)`, service-role only.
  Key `signups_paused` → `{ "paused": boolean }`.
- Logo objects: storage key `logos/<agency_id>/<sha256>.png`; `agency.branding.logoUrl` = `${APP_URL}/files/logo/<agency_id>/<sha256>.png`.

## Sign-up and completion (`@cs/tools`, `apps/web`)
- `start_agency_signup` — public write (no session; `access` = new `public` kind or the 8b equivalent, decided in pre-flight).
  Input zod: `{ email, agencyName, contactName?, inviteToken?, turnstileToken }`. Order: Turnstile → pause switch
  (open only) → IP rate limit → invite token (hash, not revoked, `expires_at > now`, `uses < max_uses`, `email_lock` matches
  if set) → trial limits (open only: no agency ever created from this email; domain rule) → upsert `pending_signup`
  (expires 7 d) → trigger Better Auth magic link with `callbackURL=/onboarding`. **Every outcome after Turnstile returns the
  same `{ ok: true }`** and the same redirect to `/sign-in/check-email`; refusals are logged by reason, never echoed. Bad invite
  token is the exception: `/join/[token]` shows "This link is no longer valid" before the form (token validity is not secret).
- Free-mail list: bundled static list in `@cs/tools` (`FREE_MAIL_DOMAINS`), no network lookup.
- Google: the form sets cookie `rm_signup` = signed `pending_signup.id` (HttpOnly, SameSite=Lax, 30 min) then starts Google
  OAuth. The cookie only selects the row; the right still comes from the row's email matching the Google email.
- `hasSignInRight(db, email, now)` additionally returns true for an uncompleted, unexpired `pending_signup` with that email.
- `completePendingSignups(service, user: { id, email, name }, now, gw): Promise<{ agencyIds: string[]; problems: SignupProblem[] }>`
  — called in the session `after` hook for verified users, before `acceptInvitations`. Per open row with the user's email,
  in one transaction with `SELECT … FOR UPDATE` on the row (and on the invite link): re-check invite link validity →
  create `agency` (name, default branding) + `agency_profile` (contact_name, contact_email = email) + `membership`
  (`agency_admin`) + `agency_onboarding` (source, invite link) → `startAgencyTrial(offer from link or 'trial', pilotEndsAt,
  couponId)` → increment link `uses` → set `completed_at`, `completed_agency_id` → enqueue `agency_welcome` and
  `platform_signup_notice` (outbox, same transaction). Idempotent: a completed row is skipped.
  `SignupProblem = 'email_lock_mismatch' | 'link_used_up' | 'link_revoked' | 'link_expired'`; a problem leaves the row open
  and nothing created. A problem is surfaced through a short-lived cookie `rm_signup_problem` read by `/sign-up/problem`.
- `/onboarding` callback: if the user has no membership yet and a problem cookie exists → `/sign-up/problem`.

## Wizard, checklist, logo
- Routes (`app/(app)/onboarding/page.tsx`, `?step=profile|team|plan|branding`), `/agency` checklist card,
  `/sign-up`, `/join/[token]`, `/sign-up/problem`. All new screens in `packages/demo/src/coverage.ts`.
- Tools (agency_admin unless noted; others → 404):
  - `get_onboarding_status` (admin + account manager) → `{ steps: Record<'profile'|'team'|'plan'|'branding'|'first_client', 'done'|'skipped'|'open'>, dismissed, completed, source }`.
  - `mark_onboarding_step({ step: 'profile'|'team'|'plan'|'branding', action: 'done'|'skip' })`; sets `completed_at` when all
    four are done/skipped **and** `first_client_at` is set or the checklist is dismissed.
  - `dismiss_onboarding_checklist()`.
  - `get_agency_profile` (admin + account manager; account manager without billing/tax fields), `update_agency_profile(input)` (zod: name, contact name/email/phone required;
    name 1–120; website URL; US phone `^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$`; ZIP `^\d{5}(-\d{4})?$`
    when country = US; timezone ∈ `Intl.supportedValuesOf('timeZone')`; verticals ⊂ `['hvac_plumbing','dental']`).
    Agency display name stays in `agency.name`.
  - `upload_agency_logo({ bytes, contentType })` via route handler `POST /agency/branding/logo` → `runTool`.
  - Plan step reads 9a `get_billing_summary`; "Add payment method" → 9a `create_checkout_session` with
    `return=/onboarding?step=plan`. Before creating the session, copy profile billing fields to the Stripe customer
    (extend `BillingGateway` with `updateCustomer(customerId, { email, address, taxId })`; `fakeGateway` records it).
- `create_client`: on first success set `agency_onboarding.first_client_at` (same transaction).
- Branding form moved to a shared component used by `/agency/branding` and the wizard; adds upload + live preview (dashboard
  header and email header).
- Logo pipeline (`apps/web/src/server/logo.ts`): accept `image/png|jpeg|webp|svg+xml`, ≤ 512 KB (reject before decode);
  `sharp(input, { limitInputPixels: 25e6 })` → resize to fit 512×512 → PNG, strip metadata. SVG: `sharp` with
  external resources disabled (librsvg default; reject inputs containing `<!ENTITY`, `href="http`, `xlink:href="http`).
  Store via the evidence storage adapter. Public route `GET /files/logo/[agencyId]/[hash].png` → 200 with
  `Cache-Control: public, max-age=31536000, immutable`, 404 otherwise. No session required.
- First-session redirect: `(app)` layout sends an `agency_admin` whose current agency has onboarding not completed,
  not dismissed and `redirected_at IS NULL` to `/onboarding`, then sets `redirected_at`.

## Allowance (f12)
- Extend 9a `billingAccess` result with `reducedTrial: boolean` and `maxActiveClients: number`; `canAddActiveClient` uses it.
  `reducedTrial = state = 'trialing' AND onboarding.source = 'open'` (and `seat_cap_exempt` is false).
- Collection scheduler: for `reducedTrial` agencies, collect at most once per 7 days per client (shared helper beside
  `agencyServiceable`). Refusal copy in `create_client`: "Your trial includes 1 active client. Add a payment method to monitor
  up to 3." (+ link to `/onboarding?step=plan`).

## Emails & jobs
- Templates in `@cs/email`: `agency_invite { url, offer, pilotEndsAt?, expiresAt }`, `agency_welcome { agencyName, url }`,
  `onboarding_tip { day: 1|3|7, nextStep, url, unsubscribeUrl }`, `platform_signup_notice { agencyName, contactName, email,
  source, offer, consoleUrl }`. Sign-in template gets optional `signup: { agencyName }` prop for sign-up wording.
  All in Rival Monday branding (9a e13); reply-to `SUPPORT_REPLY_TO`.
- `onboarding_tip` sent on stream `POSTMARK_BROADCAST_STREAM` (default `broadcast`) with headers
  `List-Unsubscribe: <${APP_URL}/u/<token>>, <mailto:…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
  `/u/[token]`: GET shows a confirm button, POST (incl. one-click) sets `unsubscribed_at`. Token = HMAC(agencyId, AUTH secret),
  base64url; no expiry.
- Console: "Email this link" on 9a's invite-link list for email-locked links → tool `send_invite_link_email({ linkId })` (staff).
  It needs the raw token, which is shown once — so the action is offered **only at creation** (checkbox "Email it to the
  locked address" in `create_invite_link`'s form, sent in the same request). Pause switch tool
  `set_signups_paused({ paused })` (owner), audited in `platform_audit_log`.
- Worker job `onboarding-nudges` (daily, 15:00 UTC): agencies with onboarding not completed/dismissed/unsubscribed, billing
  state not `read_only`/`suspended`; due slot = largest d ∈ {1,3,7} with `created_at + d ≤ now`, index i (1..3); send iff
  `nudges_sent < i`, then set `nudges_sent = i` (never a burst). Recipient: agency admins. `nextStep` = first open step in f6 order,
  else first client. No jobs in DEMO/TEST.
- `pending_signup` cleanup: same daily job deletes rows with `expires_at < now − 30 d`.

## Env (owner approval at plan time; add to `turbo.json` `globalPassThroughEnv`)
`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM`. DEMO/TEST use a fake
Turnstile verifier (always passes unless token = `fail`).

## Testing focus
Tool zod/permissions/404; RLS for new tables and the backfill; hook integration: open sign-up, invite link, email-lock
mismatch, used-up link, double completion, Google + cookie, second agency for existing user, uninvited email still refused;
identical response for accepted vs refused sign-ups; logo pipeline (SVG with script/external href, > 512 KB, wrong type,
pixel bomb); nudge slot selection over time; reduced-trial cap and weekly collection. E2E: open sign-up → magic link (dev
panel) → skip all steps → checklist; invite link → offer shown → plan step with `fakeGateway`.
