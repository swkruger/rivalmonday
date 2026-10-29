# phase-17 — marketing launch site (rivalmonday.com) + pilot waitlist

**Kind:** execution   **Worktree:** ../CompetitorSpy-wt/phase-17   **Base:** main @ 023a9f52 (rebased; phase-16 merged)
**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` (owner-approved 2026-10-28) · **Plans:** 17a `docs/superpowers/plans/2026-10-28-phase-17a-waitlist-and-pilot.md` (done); 17b `docs/superpowers/plans/2026-10-29-phase-17b-site-foundation-and-home.md` (implemented); 17c to follow

## Status (overwrite)
2026-10-29: **17a done** (final review clean). **17b implemented, pending final review.** **17c implemented (Tasks 0-16), pending final review**: integrations hub + 9 vendor pages, sources hub + 6, compare hub + 5 rival pages (off by default), `/pricing`, `/partners`, `llms.txt`, per-page OG images, JSON-LD, `check:facts`, CI gate. Sign-offs: `docs/archive/phase-17a-copy-signoff.md`, `phase-17b-copy-signoff.md`, `phase-17c-copy-signoff.md` (compare also needs counsel). Ledgers: `docs/research/2026-10-29-phase-17c-claim-check.md` (truth ledger), `-vendor-logos.md`. Site E2E: 88 passed, 6 skipped.

## Next (overwrite)
1. Final review of 17b + 17c (`--base main`): `pnpm test:affected`, `pnpm --filter @cs/site e2e`, `pnpm --filter @cs/web e2e:affected` (17a `@waitlist` spec has not run), `bash scripts/design-lint.sh`, `git ls-files --eol | grep crlf`, `iconv` over the diff; fold deferred minors from both SDD ledgers (`.superpowers/sdd/2026-10-29-phase-17{b,c}-*/progress.md`); one fix wave.
2. Owner: sign the three copy files, do the verification steps below, counsel review of `/compare/*`.
3. `/rm-merge` only on the owner's go-ahead (note below).

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

**17c (`apps/site`):**
- **Pages:** `/integrations` + `/integrations/<vendor>` (9), `/sources` + `/sources/<source>` (6), `/compare` (always) + `/compare/<rival>` (only slugs in `NEXT_PUBLIC_COMPARE_PAGES`, fail closed), `/pricing`, `/partners`, `/llms.txt`; each with its own `opengraph-image.tsx`; `PageIntro` + BreadcrumbList on all.
- **Env (site):** `NEXT_PUBLIC_COMPARE_PAGES` (comma list of rival slugs). **Script:** `@cs/site check:facts` (fails on rival facts or sources over 90 days old, or unknown source ids); `deploy-site` runs it for all five rivals.
- **Content modules:** `content/{integrations,integrations-evidence,sources,sources-evidence,compare,pricing-page,partners}.ts`; `pages.ts` derives collections via `collectionPage()`. Ledgers: `docs/research/2026-10-29-phase-17c-{claim-check,vendor-logos}.md`.

## Assumes from other branches
phase-16 (merged): DS v1 primitives, `AuthCard`, `/sign-up`. 13a (white-label, unbuilt) touches `theme.ts`, `app-shell`, `auth-card`: neither 17a nor 17b edits them; `@cs/ui` untouched.

## Decisions (owner-approved; spec (O)/(C) marks stand)
Headline "Every Monday, your clients learn what their competitors did last week, under your brand."; businesses served by the owner's agency ($99/mo, free in pilot); pilot invites = pitched agencies; `pilot_mode` blocks token-less sign-up; samples requested by agencies, operator-driven setup, read-only `/sample/<token>`; data vendors never named; named compare pages switchable by config; partners = standard reseller offer.
17a P1-P15 (in the 17a plan): public writes are service functions; resubmit never overwrites a confirmed row; exact-origin CORS fail closed; HMAC sample link; sample agency excluded from spike guard and counters. 17b rulings (ledger): the site never imports app code; sample data is renamed + leak-guarded at export; Friday figures must appear in their cited evidence; site utility classes `text-display*`/`shadow-float` only on site-owned elements.

## New backlog (target -> item)
- 17c/follow-up: favicon + apple-touch icon, `Organization.logo` (none yet); SRI / nonce CSP (P7).
- Later: affiliate program (owner scope pending; partners page only offers reselling); social collection if ever built (compare row says Not offered).
- 13a: when white-label (own domain, email) ships, update the white-label FAQ, partners and RM compare cells.
- Quarterly: re-run the rival fact check (`check:facts` enforces 90 days).
- 17c minors: add `^logo$` to the JSON-LD deep-walk key guard; guard test that `public/logos/*.svg` belong to logo-ok vendors with `approved=yes`; type `INTEGRATION_VERIFIED_IN` by slug; `check:facts` tests for unknown/stale source; mobile-menu nav vs header test; llms headings vs registry; fixed-date test assertions; Sentry "before anyone writes in" wording.
- 17a/follow-up: hide "Ask the owner to pick" on the competitors step for sample clients; Samples-agency membership of an approving operator is permanent (add expiry); alert when the `waitlist:all` cap (500/day) is hit.
- Manual vertical refresh (P2): re-run `export:site-verticals` when verticals change.

## Owner verification steps
**17a:** (1) `SITE_ORIGIN=https://rivalmonday.com` (+ previews in `SITE_ORIGIN_EXTRA`) on Vercel and in `.env` yourself. (2) Add `rivalmonday.com` + `www` to the Turnstile hostnames. (3) `pnpm db:migrate`; Pilot mode on at `/platform/billing`; `/sign-up` in a private window shows the pilot message. (4) With Cloudflare's test secret (`1x0000000000000000000000000000000AA`) POST an agency JSON to `<app>/api/waitlist` with `Origin: https://rivalmonday.com` and `"turnstileToken":"x"` -> `{"ok":true}`; confirm via `apps/web/.outbox/`. (5) Invite from `/platform/waitlist`. (6) Sample: submit, approve, run setup, approve the starting point, Send sample, open the link privately. (7) `curl <app>/api/site-status`. (8) Sign the 17a copy file; confirm `support@rivalmonday.app` exists.

**17b:** (1) `pnpm --filter @cs/site dev`, check `http://localhost:3001` at 1440 and 390. (2) Both join flows against `pnpm dev:web` (`SITE_ORIGIN_EXTRA=http://localhost:3001`, Cloudflare test secret and site key `1x00000000000000000000AA`; ask first before editing `.env`). (3) Pilot mode off: within ~6 minutes bar and pill go, CTAs read "Start your free trial". (4) Click through `/sample-brief`. (5) Sign the 17b file; supply founder note + photo, privacy and terms. (6) Before the first deploy re-run `pnpm --filter @cs/demo export:site-verticals` against prod and commit `verticals.json`, then follow `docs/DEPLOY.md` § Marketing site. (7) Set `NEXT_PUBLIC_SOCIAL_*` and `NEXT_PUBLIC_CLIENT_PRICE_USD`.

**17c:**
1. `pnpm --filter @cs/site dev`; visit every new page (`/integrations`, 9 vendors, `/sources`, 6 sources, `/compare`, `/pricing`, `/partners`) at 1440, 1024 and 390. To see rival pages set `NEXT_PUBLIC_COMPARE_PAGES=rivalmappd,brightlocal,local-falcon,birdeye,visualping` locally.
2. Vendor logos: download from official press kits for OpenRouter and Neon (logo-ok), commit under `apps/site/public/logos/`, set `approved=yes` in `docs/research/2026-10-29-phase-17c-vendor-logos.md`; check Railway, Postmark, Sentry guidelines. Never Google/Meta logos.
3. Confirm Connect fee = 0 at `/platform/billing` (global and per agency) before "no platform fee" is live. Confirm prod `standard` plan includes Ask + MCP, the Stripe portal lets agencies cancel, and `ANTHROPIC_API_KEY` is set in prod.
4. Set `WEB_MONITORING_ENABLED=true` (after `https://rivalmonday.app/bot` loads) BEFORE the site deploy (DEPLOY.md step 1). Then flip the RM `websites` cell ("Switching on soon") and restore the website `weDiffer` lines once.
5. Counsel review of `/compare/*` with archived PDFs of every source URL (save outside the site, e.g. `docs/research/compare-sources-2026-10-28/`); then set `NEXT_PUBLIC_COMPARE_PAGES` in Vercel and re-run `deploy-site`.
6. Re-check every rival fact within 7 days of first publish: update the research file + `compare.ts` `factsCheckedOn`/source dates; `check:facts` blocks the deploy past 90 days (all five rivals, even if disabled).
7. Sign `docs/archive/phase-17c-copy-signoff.md` (answer its decisions, incl. `HERO.eyebrow` / "under your brand" vs partial white-label, and the vendor `<title>` format).
8. After deploy: Google Rich Results Test on `/pricing`; confirm `/llms.txt` and `/sitemap.xml`.

## Note for /rm-merge
Fold: ARCHITECTURE (site pages and registry `content/pages.ts`, derived collections, SEO helpers `lib/{metadata,json-ld,breadcrumbs,llms,og}`, per-page `opengraph-image.tsx`, `check:facts`); STATE; DEPLOY.md (already updated: `WEB_MONITORING_ENABLED` step, `check:facts` gate, compare env); BACKLOG (section above); gotchas: every `pageMetadata` page needs its own `opengraph-image.tsx`; enabled rivals = known-rival array filtered by env; evidence paths live in `*-evidence.ts` (bundle rule). Compare pages ship **off**. Docs-only owner gates above are not merge blockers except 3-4 before the site deploy.

## Brief (condensed)
No roadmap row. Request: separate Vercel deployable (rivalmonday.com vs app rivalmonday.app); launch site marked "in pilot", no social proof yet; waitlist popup (agency vs business) + in-app waitlist page; integrations strip + pages, comparisons, pricing, partner page, social, full SEO. Binding: agency clients first; nothing client-facing names Rival Monday; claims evidence-backed (counsel review of AI claims about named rivals pending); owner signs copy; Turnstile + uniform responses on public forms. Backlog folded in: marketing page, register rivalmonday.com/.ai + trademark knockout, Phase 0 validation (GHL/Vendasta check, LOIs, counsel review), affiliate program, automatic lead routing (phase-11). All open questions answered 2026-10-28 (spec (O)/(C) marks).
