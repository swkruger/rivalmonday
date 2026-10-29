# phase-17 — marketing launch site (rivalmonday.com) + pilot waitlist

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-17   **Base:** main @ 023a9f52 (rebased; phase-16 merged)
**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` (owner-approved 2026-10-28) · **Plans:** 17a `docs/superpowers/plans/2026-10-28-phase-17a-waitlist-and-pilot.md` (awaiting owner approval); 17b, 17c to follow

## Status (overwrite)
2026-10-28: brainstorm done, spec approved by owner. Split 17a (app: waitlist, pilot switch, invites, samples) → 17b (`apps/site` foundation + home + popup + sample brief) → 17c (integrations/sources/compare/pricing/partners + SEO). 17a plan being drafted.

## Next (overwrite)
Owner reviews the 17a plan → subagent-driven development of 17a. Then write the 17b and 17c plans.

## Interfaces this branch adds or changes
TBD. Next free migration **0096** (main at 0095; phase-16 adds none). Likely: `waitlist_entry` table (`TABLE_CLASS` + world rows), operator tools (`ISOLATION_FIXTURES`), public submit route, `platform_setting` key for the pilot flag, new app `apps/site` + Vercel project + turbo tasks.

## Assumes from other branches
- **phase-16** (done, awaiting merge): DS v1 primitives in `@cs/ui` (`Section`, `Frame`, `Tag`, `KpiStrip`, `Segmented`, `Toast`, `ResponsivePopover`, `Table`, tokens in `styles.css`, `theme.ts` foreground, wordmark), `AuthCard`, `/bot`, `/sign-up`, `/start` restyled; strict `scripts/design-lint.sh`. **Plan after phase-16 merges** and build the site on its primitives.
- **13a** (white-label, unbuilt, plan approved) touches `theme.ts`, `app-shell`, `auth-card`, host-aware error pages; keep the marketing site out of those files.

## Decisions (owner-approved)
See spec (O)/(C) marks, all approved 2026-10-28. Headline "Every Monday, your clients learn what their competitors did last week, under your brand."; businesses served by the owner's agency ($99/mo, free in pilot); pilot invites = pitched agencies, trial = later; `pilot_mode` blocks token-less sign-up; samples requested by agencies, operator-driven setup (option A), read-only `/sample/<token>`; data vendors never named (sources instead); named compare pages live, each switchable by config; partners = standard reseller offer; social links shown when configured.

## New backlog (target → item)
- (none yet)

## Owner verification steps
TBD.

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

### 5. In-flight workstreams
phase-16 (DS v1 everywhere; 445 files; done, awaiting merge): see Assumes. No migrations; next free 0096.

### 6. Open questions for the owner (ordered by design impact; rec = recommendation)
1. **Split.** (A) 17a waitlist + pilot flag + `/platform/waitlist` invites; 17b `apps/site` foundation + home + popup; 17c integrations, comparisons, pricing, partner, SEO; (B) one phase; (C) site first, waitlist later. *Rec A* (17a is app-side and testable alone; 17b/17c are content-heavy).
2. **Where the site lives.** (A) `apps/site` Next.js App Router in the monorepo, static/ISR, own Vercel project, shares `@cs/ui` + `styles.css` tokens; (B) same but own tokens copied (no `@cs/ui` dep, avoids pulling `@cs/email`); (C) Astro/Framer outside the repo. *Rec A*, with a lint rule that the site imports no server packages (`@cs/db`, `@cs/tools`).
3. **Waitlist submission path.** (A) public `POST https://rivalmonday.app/api/waitlist` (CORS allow rivalmonday.com, Turnstile, `hashIp` + rate counter, uniform `{ok:true}`, ≥ 400 ms floor), the site holds no secrets but the Turnstile site key; (B) site server action → app with a shared HMAC secret; (C) site writes to the DB. *Rec A* (C excluded: no DB credentials on the site).
4. **Waitlisted clients vs the agency-owned model.** (A) client entries become platform-pool `lead`s (reuse `/platform/leads` + `assign_lead`; agency then invites them); (B) owner assigns a waitlisted client to an agency from the waitlist page, which creates a pool lead pre-assigned; (C) "pilot-direct" clients under a house agency owned by the platform. *Rec B* (keeps §1.3 and 11 intact; C reopens direct SMB).
5. **Invite types.** (A) agency entries: "Pilot invite" = `create_invite_link` offer `pilot` (email-locked, `pilot_ends_at`), "Trial invite" = offer `trial` (30-day, card at end); client entries: no invite, only assign (Q4); (B) also a direct client invite into a house agency; (C) one generic "You're in" link to `/sign-up`. *Rec A*; bulk = same tool per row, ≤ 20 per batch, results per row; waitlist status `new/invited/assigned/declined`.
6. **Pilot flag.** (A) `platform_setting` key `pilot_mode` (console toggle, audited), exposed to the site via a public `GET /api/site-status` cached 5 min; ON = "In pilot" badges, CTA opens the waitlist popup, `/sign-up` shows "join the waitlist" (or stays invite-only); OFF = CTA links to `/sign-up` (open trial); (B) env var on both deploys (redeploy to switch); (C) site build flag only. *Rec A*. Sub-question: does ON also pause open self sign-up (reuse `signups_paused`)? *Rec yes*.
7. **Comparisons content.** (A) 3–5 named rivals (e.g. agency competitive-intel and local-SEO tools), each fact with a source URL + "checked on" date in repo content, neutral tone, "as of" footer, owner + counsel sign-off before publishing; (B) category comparisons only (vs "manual spreadsheets", "SEO rank trackers", "generic CI tools"), no names; (C) skip for launch. *Rec B at launch, A after counsel review* (counsel review is still open).
8. **Client pricing.** (A) agency pricing only ($229 incl. 3 seats, $99/seat, 30-day trial, pilot free) + "clients: priced by your agency"; (B) also a suggested resale range; (C) hide pricing during the pilot. *Rec A* (agencies set client prices; white-label).
9. **Partner program terms.** (A) referral page with "terms announced after the pilot" + interest form = waitlist type `partner`; (B) define now: one-off or recurring %, cookie window (feeds the backlog affiliate program); (C) reseller/wholesale tier description only. *Rec A* (affiliate build is a separate backlog phase).
10. **Content management.** (A) MDX/TS content in `apps/site/content/` (PR = edit, owner signs copy); (B) headless CMS (Sanity/Contentful); (C) reuse the KB tables. *Rec A* (low volume, no blog yet).
11. **Analytics & consent.** (A) Vercel Web Analytics (cookieless, no banner); (B) Plausible; (C) GA4 + consent banner. *Rec A*; plus Sentry on the site.
12. **Domain/DNS.** (A) register rivalmonday.com (+ .ai) at Namecheap, apex + `www` → Vercel site project, `.app` unchanged, `/` on rivalmonday.app keeps redirecting to sign-in; (B) site at `www.rivalmonday.app`; (C) marketing at rivalmonday.app root, app at `app.rivalmonday.app`. *Rec A* (matches DEPLOY.md; trademark knockout first).
