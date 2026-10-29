# phase-17 — marketing launch site (rivalmonday.com) + pilot waitlist

**Kind:** execution   **Worktree:** ../CompetitorSpy-wt/phase-17   **Base:** main @ 023a9f52 (rebased; phase-16 merged)
**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` (owner-approved 2026-10-28) · **Plans:** 17a `docs/superpowers/plans/2026-10-28-phase-17a-waitlist-and-pilot.md` (done); 17b `docs/superpowers/plans/2026-10-29-phase-17b-site-foundation-and-home.md` (implemented); 17c to follow

## Status (overwrite)
2026-10-29: **17a done** (final review clean, fix wave 3817a19b). **17b implemented (Tasks 1-15), pending final review**: new `apps/site` (home, popup, sample brief, how-it-works, legal drafts, 404, SEO files), `@cs/demo` exporters, CI jobs, DEPLOY.md section, Sentry + Vercel Analytics. Copy sign-off: `docs/archive/phase-17b-copy-signoff.md` (17a: `phase-17a-copy-signoff.md`). Site E2E ran green in Task 13 (43 passed, 3 skipped).

## Next (overwrite)
1. Final review (`--base main`): `pnpm test:affected`, `pnpm --filter @cs/site e2e`, `pnpm --filter @cs/web e2e:affected` (17a's `@waitlist` spec has not run yet), `bash scripts/design-lint.sh`, `git ls-files --eol | grep crlf`, `iconv` over the diff; fold in the deferred minors in `.superpowers/sdd/2026-10-29-phase-17b-site-foundation-and-home/progress.md` (Task 8 Turnstile retry, Task 10 count, Task 11 hub SVG, copy typos in the sign-off file); one fix wave.
2. Write + execute the 17c plan (integrations, sources, compare, pricing, partners, SEO; each page registers in `content/pages.ts`).
3. Owner: sign both copy files and do the verification steps below. `/rm-merge` only after 17b/17c or on the owner's call.

## Interfaces this branch adds or changes
**17a (app):**
- **Migration 0096** `waitlist_entry` (platform class, service role; unique `(kind, email)`; confirm token hash + 7-day expiry; sample columns) and `brief.claims_checked`. Next free migration **0097**.
- **platform_setting keys:** `pilot_mode {on}`, `sample_brief_monthly_limit {n}` (10), `sample_agency_id {agencyId}`.
- **Routes:** `POST|OPTIONS /api/waitlist` (Origin allowlist, Turnstile, uniform `{ok:true}`, 400 ms floor), `GET /api/site-status` (pilot flag + rounded counters, CORS `*`), `/waitlist/confirm/<token>`, `/waitlist/confirmed`, `/sample/<token>` (+ `/evidence/<id>`), `/platform/waitlist`, `/sign-up` pilot branch, pilot panel on `/platform/billing`.
- **Tools (web-only, platform):** `get_pilot_settings`, `set_pilot_mode`, `set_sample_brief_limit`, `list_waitlist`, `invite_waitlist_agencies`, `decline_waitlist_entry`, `platform_find_business`, `assign_waitlist_business`, `decide_sample_brief`, `send_sample_brief`. Service functions in `@cs/tools` `waitlist/`. Emails `waitlist_confirmation`, `sample_brief_ready` (Reply-To `support@rivalmonday.app`).
- **Env (app):** `SITE_ORIGIN`, `SITE_ORIGIN_EXTRA` (`globalPassThroughEnv`). **Engine:** verifier tallies `claims_checked` per brief.

**17b (`apps/site`, own Vercel project, port 3001):**
- **Pages:** `/`, `/how-it-works`, `/sample-brief`, `/privacy`, `/terms`, 404, `robots`, `sitemap`; registry `content/pages.ts` (`PAGES`, `NAV_EXTRA`).
- **Content files:** `content/{site,home,how-it-works,pricing,founder,sample-friday,pages}.ts`, `sample-brief.json`, `verticals.json`, `legal/{privacy,terms}.md` (OWNER-PLACEHOLDER markers).
- **Env (site):** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SOCIAL_*`, `NEXT_PUBLIC_CLIENT_PRICE_USD`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_VERCEL_ENV`.
- **Scripts:** `@cs/demo` `export:sample-brief` (reads `cs_demo`) and `export:site-verticals` (reads the `SERVICE_DATABASE_URL` DB), via `site-export/` renamer + leak guard, writing `apps/site/content/`; `@cs/site` `check:placeholders`, `check:bundle`, `e2e`.
- **CI:** job `site` = lint, build, check:bundle, e2e (site unit tests run in `test`; `check:placeholders` runs in `deploy-site`); `deploy-site` gated like `deploy`. Deploy steps: `docs/DEPLOY.md` § Marketing site.
- Join popup posts to `<app>/api/waitlist`; pilot flag from `/api/site-status` (CDN 300 s + swr 60 s + 60 s memo).

## Assumes from other branches
phase-16 (merged): DS v1 primitives, `AuthCard`, `/sign-up`. 13a (white-label, unbuilt) touches `theme.ts`, `app-shell`, `auth-card`: neither 17a nor 17b edits them; `@cs/ui` untouched.

## Decisions (owner-approved; spec (O)/(C) marks stand)
Headline "Every Monday, your clients learn what their competitors did last week, under your brand."; businesses served by the owner's agency ($99/mo, free in pilot); pilot invites = pitched agencies; `pilot_mode` blocks token-less sign-up; samples requested by agencies, operator-driven setup, read-only `/sample/<token>`; data vendors never named; named compare pages switchable by config; partners = standard reseller offer.
17a P1-P15 (in the 17a plan): public writes are service functions; resubmit never overwrites a confirmed row; exact-origin CORS fail closed; HMAC sample link; sample agency excluded from spike guard and counters. 17b rulings (ledger): the site never imports app code; sample data is renamed + leak-guarded at export; Friday figures must appear in their cited evidence; site utility classes `text-display*`/`shadow-float` only on site-owned elements.

## New backlog (target -> item)
- 17c/follow-up: favicon + apple-touch icon (none yet).
- 17c/follow-up: SRI / nonce-based CSP for the site (P7).
- Later: affiliate program (owner scope pending; partner page only links to it).
- 17a/follow-up: hide "Ask the owner to pick" on the competitors step for sample clients (no owner; starting point would wait for the 14-day cap).
- 17a/follow-up: Samples-agency membership of an approving operator is permanent; add cleanup or expiry (revocation).
- Ops: alert when the `waitlist:all` rate-limit cap (500/day) is hit.
- Manual vertical refresh (P2): re-run `export:site-verticals` when verticals change.

## Owner verification steps
**17a:** (1) Set `SITE_ORIGIN=https://rivalmonday.com` (+ previews in `SITE_ORIGIN_EXTRA`) on Vercel and in `.env` yourself. (2) Add `rivalmonday.com` + `www` to the Turnstile widget hostnames. (3) `pnpm db:migrate`; Pilot mode on at `/platform/billing`; `/sign-up` in a private window shows the pilot message. (4) With Cloudflare's test secret `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` in `.env` (no secret = `400 check`): POST an agency JSON to `<app>/api/waitlist` with `Origin: https://rivalmonday.com`, `"turnstileToken":"x"` -> `{"ok":true}`; confirm via `apps/web/.outbox/`. (5) Invite from `/platform/waitlist`. (6) Sample: submit, approve with a real listing, run setup (pick rivals yourself), approve the starting point, Send sample, open the link privately; evidence opens, nothing links into the app. (7) `curl <app>/api/site-status`. (8) Sign the 17a copy file; confirm `support@rivalmonday.app` exists.

**17b:**
1. Local: `pnpm --filter @cs/site dev`, open `http://localhost:3001` at 1440 and 390 wide (check hero, popup, menu, sample brief, no sideways scroll).
2. With the app running (`pnpm dev:web`), add `SITE_ORIGIN_EXTRA=http://localhost:3001` and the Cloudflare test secret to `.env` (ask first); in the site shell use `NEXT_PUBLIC_APP_URL=http://localhost:3000` and the test site key `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`. Try both join flows (agency with a sample request, local business); the confirmation email lands in `apps/web/.outbox/`. Without any secret the dev app refuses every submit.
3. Turn Pilot mode off at `/platform/billing`; within about 6 minutes the bar, pill and fine print go and CTAs read "Start your free trial".
4. Click through `/sample-brief`: claim -> evidence, slider, Friday; every name fictional. Optional: `pnpm demo:reset` then re-run `export:sample-brief` for richer snapshots (your call).
5. Sign `docs/archive/phase-17b-copy-signoff.md`; supply the founder note + photo, privacy and terms.
6. Before the first site deploy, re-run `pnpm --filter @cs/demo export:site-verticals` against prod (prod `SERVICE_DATABASE_URL` in the shell; the committed `verticals.json` lists only dental + HVAC) and commit it. Then follow `docs/DEPLOY.md` § Marketing site (Vercel project, toolbar off, env, DNS, Turnstile hostnames, `DEPLOY_ENABLED`).
7. Set the social URLs (`NEXT_PUBLIC_SOCIAL_*`) and `NEXT_PUBLIC_CLIENT_PRICE_USD`.

## Brief (condensed)
No roadmap row. Request: separate Vercel deployable (rivalmonday.com vs app rivalmonday.app); launch site marked "in pilot", no social proof yet; waitlist popup (agency vs business) + in-app waitlist page; integrations strip + pages, comparisons, pricing, partner page, social, full SEO. Binding: agency clients first; nothing client-facing names Rival Monday; claims evidence-backed (counsel review of AI claims about named rivals pending); owner signs copy; Turnstile + uniform responses on public forms. Backlog folded in: marketing page, register rivalmonday.com/.ai + trademark knockout, Phase 0 validation (GHL/Vendasta check, LOIs, counsel review), affiliate program, automatic lead routing (phase-11). All open questions answered 2026-10-28 (spec (O)/(C) marks).
