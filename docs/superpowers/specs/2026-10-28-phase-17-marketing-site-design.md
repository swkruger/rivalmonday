# Phase 17 — marketing launch site (rivalmonday.com) + pilot waitlist — design

**Date:** 2026-10-28 · **Branch:** `phase-17` · **Brief:** `docs/work/phase-17.md` (reuse list, binding decisions) · **Inspiration:** `docs/work/phase-17-inspiration.md` · **Comparison facts:** `docs/research/2026-10-28-phase-17-comparison-facts.md`

New decisions and interfaces only. The core spec, root `CLAUDE.md` § Decisions and the brief's § 3 stay binding. **(O)** = owner decided in brainstorming; **(C)** = Claude's call, owner may override at plan approval.

## 1. Intent

Agencies arrive from the owner's **cold calls and cold emails**: sceptical, short on time, checking the pitch. Within the first sentence they must understand the offer, and "Join the pilot" must be right there **(O)**. No testimonials, logos of customers, reviews or blog exist, so the site earns trust by **letting them use the product** and by **showing real numbers and the method** instead of social proof **(O)**.

**Goals:** one clear sentence; a sign-up the owner can manage; a sample the agency can click; a real sample for their own client on request; honest, sourced comparisons; SEO from day one.
**Non-goals:** blog, testimonials, customer logos, affiliate program (later backlog item), automatic lead routing, a CMS.
**Anti-goals (failure even if it works):** any made-up fact, number, logo or quote; implying a partnership with Google/Meta; a client-facing surface naming Rival Monday after a client is assigned to an agency; letting anyone into the app without the owner's invite while the pilot is on; the site holding database credentials.

## 2. Sub-phases (O)

| Part | Scope | Depends on |
|---|---|---|
| **17a** (app only) | `waitlist_entry` + public submit/status routes, pilot switch, `/platform/waitlist` (invites single + bulk, assign clients, sample-brief approvals), sample space + `/sample/<token>` read-only brief page, verifier tally, confirmation emails | phase-16 merged |
| **17b** | `apps/site` foundation (Next.js, Vercel project, tokens), home page, sign-up popup, interactive sample brief, live counters, "How we check every claim", founder note, privacy/terms | 17a routes |
| **17c** | integrations strip + per-service pages, sources pages, comparison hub + "vs X" pages, pricing, partner page, social links, full SEO pass | 17b |

Each part gets its own lean plan, built and merged in order.

## 3. Message and hero (O)

- **Headline:** "Every Monday, your clients learn what their competitors did last week, under your brand."
- **Eyebrow:** "Pilot" pill + "White-label competitor intelligence for agencies" (also the SEO title stem).
- **Sub:** "Rival Monday watches your clients' local rivals — websites, Google reviews, ads and map rankings — and turns it into an evidence-backed weekly brief, a dashboard and an AI assistant you sell as your own."
- **CTAs:** "Join the pilot" (primary) · "See a sample brief" (secondary). Fine print "Free during the pilot · No card needed · Limited places".
- **Announcement bar:** "Pilot now open for agencies serving local businesses" + rotating examples (HVAC, plumbing, dental, roofing, med spa, legal, …) — never only HVAC/dental: the vertical catalogue is open (Phase 14).
- **Product shown as live HTML fragments** (brief with evidence chips, the snapshot behind a claim, a Friday answer with sources) — no flat screenshot. Approved mockup: `.superpowers/brainstorm/*/content/hero-and-signup.html` (copy text is placeholder until signed).
- All final copy is signed by the owner (existing rule); the plan carries it as decided copy.

## 4. Home page sections (O: 1–5 all at launch)

1. **Interactive sample brief** — a full Monday brief for a fictional HVAC business, static data generated from the demo world (`cs_demo` seed) and committed as JSON, with **every business, person and place renamed to clearly fictional names** in the export step (C: no real business beside made-up reviews/ads): click a claim → its evidence (snapshot / reviews / ad) slides in; a week slider on the map-rank grid; Friday with 3–4 canned questions and cited answers. Runs entirely in the browser, no API calls. Labelled "Sample data" visibly. Also at `/sample-brief` (shareable from cold emails).
2. **"This week on Rival Monday" live counters** — real platform numbers (§ 6.3). Rounded down, shown only when ≥ a floor (C: hide a counter below 10) so a tiny pilot never looks empty.
3. **"How we check every claim"** — the evidence → claim → verifier → "no evidence, no claim" path, drawn as the hub diagram from the inspiration notes.
4. **Founder note** — one paragraph + name + photo or initials, owner-written.
5. **Real sample brief for your client** — offered in the popup (§ 5) and explained on the page.

Other sections (C): 4-step "How it works" (Add a client → We find the rivals → We watch every week → Monday brief + alerts), Friday row (rivals table with the Ask box docked), integrations strip, pricing teaser, footer CTA card.

## 5. Sign-up popup (O)

Opened by every "Join the pilot" / sign-up button while the pilot switch is on.

- **Step 1** — two choices with explanations: *I run an agency* ("Resell Rival Monday to your clients under your own brand. Free during the pilot, then $229/mo incl. 3 client seats.") · *I own a local business* ("Get a weekly brief on what your competitors are doing. Free during the pilot, then $99/mo.").
- **Step 2 · agency:** your name, work email, agency name, website, local-business clients (band: 1–5 / 6–15 / 16–50 / 50+). Checkbox **"Send me a real sample brief for one of my clients"** → client business name + website or city/ZIP.
- **Step 2 · business (C):** your name, email, business name, website or city/ZIP, type of business (vertical catalogue, "Other" allowed).
- Done state: "You're on the list. We've emailed you a confirmation." Uniform for duplicates.
- Pilot switch off → the buttons link to `https://rivalmonday.app/sign-up` (agencies) instead; the business path shows the waitlist still (C: businesses always go through the owner; there is no business self-sign-up).

## 6. App side (17a) — interfaces

### 6.1 Table `waitlist_entry` (next free migration at execution time; `TABLE_CLASS` = platform-only, operator RLS; world rows)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `kind` | text check in (`agency`,`business`) | |
| `status` | text check in (`new`,`invited`,`assigned`,`declined`) default `new` | |
| `contact_name`, `email` | text not null | email lower-cased; unique (`kind`, `email`) — resubmits update `updated_at`, never duplicate |
| `org_name` | text not null | agency or business name |
| `website` | text null | stored as typed; never fetched by the submit route |
| `location` | text null | city/ZIP (business, sample) |
| `vertical_id` | uuid null fk vertical | business only |
| `client_count_band` | text null | agency only |
| `sample_requested` | bool default false | |
| `sample_business_name`, `sample_location`, `sample_website` | text null | |
| `sample_status` | text null check in (`requested`,`approved`,`running`,`sent`,`declined`,`failed`) | |
| `sample_client_id` | uuid null fk client | in the sample agency |
| `invite_link_id` | uuid null fk agency_invite_link | agency invites |
| `lead_id` | uuid null fk lead | business assignment |
| `source` | text null | `utm_source`/referrer page, ≤ 200 chars |
| `ip_hash` | text | `hashIp` |
| `created_at`, `updated_at`, `decided_at`, `decided_by` | | |

### 6.2 Settings (`platform_setting`, console-toggled, audited via `withPlatformAudit`)
- `pilot_mode` bool. **ON:** site CTAs open the popup; app `/sign-up` without an invite token shows "We're in pilot — join the waitlist" with a link to `rivalmonday.com/#join` and creates nothing (C: enforced in `startAgencySignup` next to the `signups_paused` check, which already skips token sign-ups); `/join/<token>` invite links keep working. If both `pilot_mode` and `signups_paused` are on, the pilot message shows (C). **OFF:** `/sign-up` reverts to open trial (subject to `signups_paused` as today). (O)
- `sample_brief_monthly_limit` int (C: default 10). Approvals beyond it are refused with a message.

### 6.3 Public routes on rivalmonday.app (added to `proxy.ts` `PUBLIC`)
- `POST /api/waitlist` — JSON body (zod, discriminated on `kind`) + Turnstile token. CORS allows only `SITE_ORIGIN` (env, e.g. `https://rivalmonday.com`; preview origins via `SITE_ORIGIN_EXTRA`). `hashIp` + rate counter (C: ≤ 5 per IP per hour), uniform `{ ok: true }`, ≥ 400 ms floor (mirror `submitIntake`). Writes through a registered tool via `runTool` with a system actor. Sends the confirmation email (§ 6.6).
- `GET /api/site-status` — `{ pilotMode, counters: { rivalSitesWatched, snapshotsThisWeek, claimsChecked, claimsDropped } | null }`, cached (C: `s-maxage=300`). Counters are platform-wide aggregates over the last 7 days, excluding the sample agency (the demo world is a separate DB); no tenant identifiers. Builder defines each counter's query from existing tables; any counter without a clean source is dropped, never estimated. **Verifier tally (C):** verifier drops are not stored today (`brief_item` comment), so 17a adds a minimal per-run tally (checked / dropped counts, no claim text) written by the brief verifier, feeding `claimsChecked`/`claimsDropped`.

### 6.4 Operator tools (`@cs/tools`, platform scope, each in `ISOLATION_FIXTURES`)
`list_waitlist({ kind?, status?, sample?, q?, cursor })` · `invite_waitlist_agencies({ ids[], offer: 'pilot'|'trial', pilotEndsAt? })` — ≤ 50 ids, creates an invite link per row through the `create_invite_link` logic (email-locked, `max_uses` 1), per-row result, skips non-`new`/already-invited/unconfirmed rows; `create_invite_link` sends no email, so the **web action** sends `sendAgencyInviteEmail` per created row (mirror `platform/billing/actions.ts`) · `assign_waitlist_business({ id, agencyId, lookup })` — the operator picks the business's Google listing in the assign dialog (setup lookup UI, gives the NOT NULL `SetupLookup`); creates a `verified` pool `lead` (email already confirmed, below) and assigns it via the `assign_lead` path (UI default: the owner's agency), status `assigned`; the 11c lead emails are reviewed for this context in the copy sign-off · `decline_waitlist_entry({ id })` (no email, C) · `decide_sample_brief({ id, approve })` · `set_pilot_mode({ on })` · `set_sample_brief_limit({ n })`. Public submit: `submit_waitlist_entry` (system-only).

### 6.5 `/platform/waitlist` page
`PageHeader` "Waitlist" + help key `page:platform.waitlist` + guide. Tabs Agencies / Businesses / Sample requests; table with checkbox selection; bulk bar "Send pilot invite" (end date picker) / "Send trial invite"; row actions Assign (agency picker, default owner's agency), Decline; sample tab shows the request, **estimated cost before approving** (discovery cap $3 + starting-point estimate from existing cost tables), this month's count vs limit; Approve opens the sample client's setup wizard (§ 6.6). Pilot switch + limit on the console settings page. Nav item under Platform.

### 6.6 Sample briefs (O: agency requests, owner approves)
- **Operator-driven (O, option A).** The existing pipeline needs a human at each step (place pick in `setupLookupSchema`, keywords/area confirm, ≥ 1 tracked rival for `startingPointReadiness`, AM approval via `approveBrief`). No automation is built: **Approve** creates the sample client and opens the normal setup wizard for it in a support session; the operator picks the place, confirms keywords/area, ticks rivals (discovery auto-runs as usual, Phase 12 caps apply) and approves the starting-point brief. Status `approved` → `running` (setup started) → `sent` | `failed`.
- **Sample space (C):** one platform-owned agency flagged as sample (builder picks the storage), display name "Rival Monday Samples", excluded from billing, seats, cost spike alerts, counters and every recurring scheduler. The sample client has **no contacts**, so `sendBriefNow` emails nobody; after the brief is approved the client is paused (`paused_at`) so no weekly work runs.
- **Delivery (O):** a **new read-only public brief page** on rivalmonday.app, `/sample/<token>` (signed, expiring token, C: 30 days; refusal → 404): the starting-point brief and its evidence only — no login, no app shell, no Ask, no other pages, Rival Monday-branded (the requester is an agency, not a client). The `sample-brief-ready` email (sent when the operator approves the brief) carries the link. Not the guest-link/contact mechanism.
- Claims still pass the verifier; nothing unverified appears.

### 6.7 Emails (`@cs/email`, owner-signed copy)
`waitlist-confirmation` (agency/business variants) with a **confirm-your-email link** (C): adds `email_confirmed_at` to `waitlist_entry`; only confirmed entries can be invited, assigned or have a sample approved (stops signing up someone else's address) · `sample-brief-ready`. Invite emails reuse `agency-invite.tsx`; assignment reuses the lead emails (11c). No owner notification email (C): the nav shows a "new" count.

## 7. Site (17b/17c)

### 7.1 Build (C)
`apps/site` — Next.js App Router, statically generated (ISR only for `/api/site-status` reads, client-side), own Vercel project (iad1), domain `rivalmonday.com` + `www` redirect. Shares `@cs/ui` tokens/primitives via `transpilePackages`; a lint/CI check forbids importing `@cs/db`, `@cs/tools`, `@cs/worker` or any server package. Holds no secrets except the Turnstile site key. Content = TS/MDX files in `apps/site/content/`. Vercel Web Analytics (cookieless, no banner) + Sentry. Turbo tasks `build`/`lint`/`test`; CI `deploy` job extended behind `DEPLOY_ENABLED`.

### 7.2 Env (all `turbo.json` `globalPassThroughEnv`; owner adds on Vercel)
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SOCIAL_LINKEDIN|X|YOUTUBE|FACEBOOK|INSTAGRAM` (each link shows only when set, O), `NEXT_PUBLIC_COMPARE_PAGES` (comma list of enabled slugs, § 7.5), `NEXT_PUBLIC_CLIENT_PRICE_USD` (C: 99). App side: `SITE_ORIGIN`, `SITE_ORIGIN_EXTRA`.

### 7.3 Pages
`/` · `/sample-brief` · `/how-it-works` (C: the verification story at length) · `/integrations` + `/integrations/<vendor>` · `/sources` + `/sources/<source>` · `/compare` + `/compare/<rival>` · `/pricing` · `/partners` · `/privacy` · `/terms` · 404. Nav: Product · Integrations · Compare · Pricing · Partners · Sign in · Join the pilot.

### 7.4 Integrations and sources (O)
- **Strip + per-service pages** for AI and platform services only: OpenRouter, Anthropic, Neon, Vercel, Railway, Cloudflare (R2 + Turnstile), Postmark, Stripe, Sentry. Each page: what it is, exactly how Rival Monday uses it, what it means for the agency (e.g. Stripe → client billing in your name). Logos per each vendor's brand guidelines; drop a vendor whose guidelines forbid this use.
- **Data vendors are never named** (DataForSEO, Apify, ScrapeCreators, Stadia). Data appears as **sources**: competitor websites, Google reviews, Google Business Profile, Meta Ad Library, local map rankings, social — with our own icons, never Google/Meta logos, and no wording that implies a partnership.

### 7.5 Comparisons (O: named pages live at launch, each switchable)
- Hub `/compare` (category table: Rival Monday vs DIY spreadsheets vs local-SEO toolkits vs reputation suites) + named pages for the research set: RivalMappd, BrightLocal, Local Falcon, Birdeye, Visualping. A slug renders only if listed in `NEXT_PUBLIC_COMPARE_PAGES`; unlisted → 404 and removed from nav/sitemap.
- Every fact about a rival comes from the comparison-facts file, carries a source link, and the page shows "Facts checked <date>". Each page states honestly where the rival is better. `?` in research = not stated publicly → never shown as ✗. No "nobody else offers" claims (US ad history is out).
- The Rival Monday column is checked against shipped features before publishing (plan task). Re-check rival facts within 7 days of first publish.

### 7.6 Pricing and partners (O)
- `/pricing`: Agency — free during the pilot, then $229/mo incl. 3 client seats, $99 per extra seat, 30-day trial; Business — free during the pilot, then $99/mo. Feature table + FAQ (white-label, data sources, MCP, cancelling). Numbers from one content file.
- `/partners`: the standard reseller offer framed as a program — your brand, your client prices, billing through Stripe Connect with no platform fee, worked example margin (C: e.g. 10 clients × the agency's own price vs $229 + seats). No affiliate terms.

### 7.7 SEO (C)
Per-page `metadata` (title ≤ 60, description ≤ 155, canonical), `sitemap.ts` (enabled compare pages only), `robots.ts` allow all, OG images via `next/og` per page, JSON-LD: `Organization` (+ `sameAs` from set social links), `SoftwareApplication` with `offers`, `FAQPage` on pricing, `BreadcrumbList`. Static HTML for every page, LCP ≤ 2.5 s on mobile, no layout shift from fonts. `llms.txt` with page summaries.

### 7.8 Design (O: DS is the reference, creativity allowed)
DS v1 tokens and Inter (C: no serif display face unless the owner signs one off). Marketing sections may use faint grid lines, one soft blue wash per hero, large Inter 600 with tight tracking; floating product fragments carry shadows (they are floating layers). Orange only for Friday and one highlight per screen. Phone width 390 with no page overflow. Generated images (OpenRouter) only where a fragment can't show it — few, owner-picked.

## 7.9 Pre-flight
Branch rebased on `main` @ 023a9f52 (phase-16 merged, DS v1 primitives available). Migrations: next free number at execution time (0096 today).

## 8. Left to the builder
Exact section order below the hero; animation (respect `prefers-reduced-motion`); demo-brief JSON shape; how the sample-space flag is stored; counter queries; table layout of `/platform/waitlist`; privacy/terms structure (owner supplies the legal text).

## 9. Owner to-dos (not code)
Register rivalmonday.com (+ trademark knockout); social account URLs; founder note + photo; privacy/terms text; sign all copy; counsel review of compare pages (flip `NEXT_PUBLIC_COMPARE_PAGES` after).
