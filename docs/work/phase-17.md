# phase-17 — marketing launch site (rivalmonday.com) + pilot waitlist

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-17   **Base:** main @ 023a9f52 (rebased; phase-16 merged)
**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` (owner-approved 2026-10-28) · **Plans:** 17a `docs/superpowers/plans/2026-10-28-phase-17a-waitlist-and-pilot.md` (implemented, final review pending); 17b, 17c to follow

## Status (overwrite)
2026-10-29: **17a implemented (Tasks 1-12)**, final whole-branch review pending. Spec approved 2026-10-28; split 17a (app: waitlist, pilot switch, invites, samples) -> 17b (`apps/site` foundation + home + popup + sample brief) -> 17c (integrations/sources/compare/pricing/partners + SEO). Task 12 added the copy sign-off (`docs/archive/phase-17a-copy-signoff.md`), `apps/web/e2e/waitlist.spec.ts` (`@waitlist`, `@platform`; not yet run, runs once at the final review), seed rows, 8b doc rows and guide additions.

## Next (overwrite)
1. Final review: `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` once (`--base main`), `bash scripts/design-lint.sh`, `git ls-files --eol | grep crlf` (empty), `iconv -f utf-8 -t utf-8` over `git diff --name-only main...HEAD`; one fix wave.
2. Owner: sign the copy file and do the verification steps below; then `/rm-merge`.
3. Write the 17b and 17c plans.

## Interfaces this branch adds or changes
- **Migration 0096** `waitlist_entry` (platform class, service role only; unique `(kind, email)`; confirm token hash + 7-day expiry; sample columns) and `brief.claims_checked integer`. Next free migration **0097**.
- **platform_setting keys:** `pilot_mode {on}`, `sample_brief_monthly_limit {n}` (default 10), `sample_agency_id {agencyId}`.
- **Routes:** `POST|OPTIONS /api/waitlist` (Origin allowlist, Turnstile, uniform `{ok:true}`, 400 ms floor), `GET /api/site-status` (pilot flag + rounded counters, CORS `*`), `GET /waitlist/confirm/<token>`, `/waitlist/confirmed`, `/sample/<token>` (+ `/evidence/<id>`), `/platform/waitlist` (tabs Agencies / Businesses / Sample requests), `/sign-up` pilot branch, pilot panel on `/platform/billing`.
- **Tools (all web-only, platform):** `get_pilot_settings`, `set_pilot_mode`, `set_sample_brief_limit` (owner), `list_waitlist` (viewer+), `invite_waitlist_agencies`, `decline_waitlist_entry`, `platform_find_business`, `assign_waitlist_business`, `decide_sample_brief`, `send_sample_brief` (staff). Rows in the 8b doc.
- **Service functions (`@cs/tools` `waitlist/`):** `submitWaitlistEntry`, `confirmWaitlistEmail`, `siteStatus`, `getSampleBrief`, `sampleEvidenceKey`, `sendWaitlistEmail`, `pilotMode`, `sampleBriefMonthlyLimit`.
- **Emails:** `waitlist_confirmation`, `sample_brief_ready` (platform-branded, direct send, Reply-To `support@rivalmonday.app`).
- **Env:** `SITE_ORIGIN`, `SITE_ORIGIN_EXTRA` (`turbo.json` `globalPassThroughEnv`); the owner adds them to `.env` and Vercel.
- **Engine:** the verifier tallies model-written sentences per brief (`claims_checked`).

## Assumes from other branches
phase-16 (merged @ 023a9f52): DS v1 primitives, `AuthCard`, `/sign-up`. 13a (white-label, unbuilt) touches `theme.ts`, `app-shell`, `auth-card`: 17a edits none of them; 17b should keep the site out of those files too.

## Decisions (owner-approved; spec (O)/(C) marks stand)
Headline "Every Monday, your clients learn what their competitors did last week, under your brand."; businesses served by the owner's agency ($99/mo, free in pilot); pilot invites = pitched agencies; `pilot_mode` blocks token-less sign-up; samples requested by agencies, operator-driven setup, read-only `/sample/<token>`; data vendors never named; named compare pages switchable by config; partners = standard reseller offer.
Plan P1-P15 (details in the plan): P1 public writes are service functions, no system-actor tool; P2 extra columns, no stored `running` sample status; P3 resubmit never overwrites a confirmed row; P4 rate limits 5/h/IP and 500/day; P5 same Turnstile widget as the app; P6 exact-origin CORS, fail closed; P7 settings on `/platform/billing`; P8 `claims_checked` tally; P9 counters floored/rounded, sample + archived excluded; P10 place pick via `platform_find_business` for assign and approve; P11 sample space = operator membership in the Samples agency (not a support session); P12 sending is an explicit step; P13 pause after send, spike guard and counters exclude the sample agency, no client contacts; P14 HMAC sample link, evidence only for cited screenshot/text; P15 cost estimate = $3 discovery cap + recent average.

## New backlog (target -> item)
- 17a/follow-up: the Samples agency membership of an approving operator is permanent (never removed); add a cleanup or expiry.
- 17a/follow-up: hide "Ask the owner to pick" on the competitors step for sample clients (no owner; the starting point would wait for the 14-day cap). Today only the operator guide warns about it.
- Copy: waitlist short copy says "the public website" / "the Samples agency" because copy tests forbid the product name; revisit if the owner wants the names back.

## Owner verification steps
1. Add `SITE_ORIGIN=https://rivalmonday.com` (+ preview origins in `SITE_ORIGIN_EXTRA`, comma-separated) on Vercel and in `.env` yourself.
2. Add `rivalmonday.com` (+ `www`) to the Turnstile widget's hostnames.
3. `pnpm db:migrate`. Turn Pilot mode on at `/platform/billing`, open `/sign-up` in a private window: the pilot message shows.
4. In dev without Turnstile keys: `curl -X POST <app>/api/waitlist -H 'Origin: https://rivalmonday.com' -H 'content-type: application/json' -d '{...agency json with "turnstileToken":"x"...}'` returns `{"ok":true}`. Open the confirmation email in `apps/web/.outbox/`, click Confirm: "You're confirmed".
5. Invite it from `/platform/waitlist`: the invite email is in the outbox.
6. Submit a sample request, approve it with a real listing, run setup (pick rivals yourself, do not use "Ask the owner"), approve the starting point in Approvals, press Send sample, open the link in a private window. Check the evidence opens and nothing links into the app.
7. `curl <app>/api/site-status`.
8. Sign `docs/archive/phase-17a-copy-signoff.md`; confirm the reworded copy (decision 1) and that `support@rivalmonday.app` exists.
9. Know that the approving operator keeps an `agency_admin` membership in the Samples agency (backlog item above).

## Brief

### 1. Scope
**No roadmap row** for Phase 17 (roadmap ends at 16/13b). Mentions: spec §1.3 "Direct self-serve SMB is out of scope"; §1.4 pilot = 8 weeks, 10–15 own clients; roadmap Phase 0 "GHL/Vendasta check, LOIs, US counsel review before the pilot"; BACKLOG "Public 'request access' form / marketing landing page (declined for now) — *phase-10*"; "Register rivalmonday.com / .ai; trademark knockout". Request:
- **Separate Vercel deployable**: rivalmonday.com (marketing) vs app rivalmonday.app.
- **Launch site**, clearly "in pilot"; showcase the app with excitement; no references/social proof/blog yet.
- **Waitlist** (while an "in pilot" flag is set): Sign up → popup; step 1 Agency vs Client (each explained); step 2 minimum contact + business/agency name.
- **In-app waitlist page** (platform context): send pilot and/or trial invites, one or bulk.
- **Integrations**: scrolling logo strip of vendors we actually use + a detail page per service.
- **Comparisons** (RM vs its rivals, true facts only); **Pricing** (agency and/or client); **Agency partner program** page; social links; full SEO.
- Design system is the reference, creativity allowed; images via OpenRouter `POST /api/v1/images` (gotchas).

### 2. Already built — reuse, don't rebuild
- **Agency sign-up (10):** `/sign-up` (Turnstile, verify-then-create `pending_signup`, `completePendingSignups`), open trial `billingAccess.reducedTrial`; `set_signups_paused` / `signupsPaused` (`packages/tools/src/access/signup.ts`, `platform_setting`), `get_signup_funnel`; `hashIp`.
- **Invites (9a/11-fixes):** `agency_invite_link` (`offer` pilot|trial, `pilot_ends_at`, `email_lock`, `max_uses`, discount code), tool `create_invite_link` (`emailIt`, `packages/tools/src/tools/platform-billing.ts`), `/join/[token]`, `@cs/core/invite-offer` `pilotLinkRefusal`; email `agency-invite.tsx`.
- **Client intake (11c/16):** `/start`, `/start/[slug]`, `lead` (`agency_id` null = platform pool), `intake_rate`, `submitIntake`/`verifyIntake`, `/platform/leads` + `list_pool_leads`/`assign_lead` (`platform-leads.ts`), lead emails sent directly (11c R1), ≥ 400 ms uniform response.
- **Plumbing:** `apps/web/src/server/turnstile.ts` `verifyTurnstile`; `proxy.ts` `PUBLIC` RegExp list; `server/invite-email.ts` direct-send pattern; `billing_notice` outbox; Postmark + broadcast stream + `/u/[token]` unsubscribe; `@cs/email` templates (`packages/email/src/templates/`); `platform_setting`.
- **Platform pages:** `app/(platform)/platform/*`, `requirePlatformOperator` (owner|staff|viewer), `withPlatformAudit`, `PageHeader` + `helpKey`, nav `nav-items.ts`.
- **Pricing model:** `plan` (`standard`, versions, `base_price_cents` 22900, 3 seats, `seat_price_cents` 9900, `trial_days` 30, `features` ask/mcp), `list_plans`; client pricing is per agency (Stripe Connect 9b).
- **UI:** `@cs/ui` exports raw TS (`./src/index.ts`, `./styles.css`, Tailwind 4) — a second Next app can consume it via `transpilePackages`; note it depends on `@cs/email`. Brand `docs/brand/brand.md`, mockups; `docs/design-system/` (tokens json, storyboard).
- **SEO/public today:** `app/robots.ts` disallows all but `/bot`; `/bot` page; root `/` redirects to sign-in. No sitemap.
- **Deploy:** `docs/DEPLOY.md` (Vercel project root `apps/web`, iad1, Namecheap DNS, CI `deploy` job gated by `DEPLOY_ENABLED`); `turbo.json` strict env (`globalPassThroughEnv`).
- **Vendors actually used** (logo strip/pages): DataForSEO, Apify, ScrapeCreators (Meta Ad Library), Stadia Maps (static maps + geocoding), OpenRouter (+ Jev `typesafe/jev-1.14`), Anthropic (batch), Neon, Vercel, Railway, Cloudflare R2 + Turnstile, Postmark, Stripe (Billing + Connect), Sentry, Better Auth, Playwright, pg-boss. Instagram Graph is researched only (fixtures), not used.

### 3. Binding decisions (don't re-open)
Channel = agency clients first, then wholesale (§1.3); **nothing client-facing names Rival Monday** for agency clients; `/start` may show RM until assigned; clients self-start only via an agency intake link or the platform pool (11); billing pilot / 30-day trial / $229 incl. 3 seats + $99/seat, one `standard` plan, agency→client via Connect fee 0; auth invitation-only hooks, Better Auth self-hosted; web writes through `runTool`, reads via tools; new table → `TABLE_CLASS`; new tool → `ISOLATION_FIXTURES`; page refusals 404; every `PageHeader` page needs help key + guides; owner signs copy; SSRF guard for user URLs; Turnstile + uniform responses on public forms; crawler UA `RivalMondayBot`; DS v1 binding for app UI; images sparingly (owner-picked); claims evidence-backed (counsel review of AI claims about named competitors pending).
**Collisions:** (a) "Sign up as Client" = direct SMB, out of scope (§1.3) unless routed to the pool/agency; (b) client pricing shown publicly vs agency-set prices; (c) comparisons naming rivals vs pending counsel review; (d) a marketing site naming RM is fine, but waitlisted clients later served by an agency must not see RM after assignment.

### 4. Backlog to fold in
- [ ] Public "request access" form / marketing landing page (declined for now) — *phase-10*
- [ ] Register **rivalmonday.com** / **.ai**; trademark knockout search — *from HANDOVER §7*
- [ ] Phase 0 validation before the Phase 7 pilot: GoHighLevel/Vendasta marketplace check, 5 agency letters of intent, US counsel review (crawling, review privacy, AI claims about named competitors) — *from roadmap Phase 0, HANDOVER §7*
- [ ] **Affiliate program (fully featured)** … scope and details to be provided by the owner at planning — *owner, 2026-10-17* (partner page only links to it)
- [ ] Automatic lead routing to agencies (vertical/area/capacity/opt-in) on the 11c platform pool - *phase-11*

### 5. Open questions
All answered by the owner 2026-10-28; see the spec (O)/(C) marks.
