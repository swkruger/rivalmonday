# State of `main`

> **Overwritten, never appended. Hard cap 12 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here - each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-11-16 (phase-13a1 merge: white-label hosts, domains, MCP host, sender; before it 18e on 2026-11-14, 18d on 2026-11-13, 18c, site-audiences, 18b on 2026-11-10)

## Where `main` is
- Every phase with a ✅ row in the [roadmap](superpowers/plans/2026-09-29-roadmap.md) is on `main`, latest **13a1** (agency hosts `<host_slug>.<NEUTRAL_DOMAIN>` + custom domains, per-origin auth, MCP on `mcp.<NEUTRAL_DOMAIN>`, per-agency sending domains with Vercel + Postmark adapters and verify jobs; merged 2026-11-16), 18e (competitor social, Jev-only `ai_decision_mode`), 18d, 18c, site-audiences, 18b, 18a-1..3, brief-report, brief-signal, pricing-v2, launch-gate, 7a-7c2 code, 16, 17, staging worker on Railway. Web monitoring ships dark behind `WEB_MONITORING_ENABLED`; site not deployed; staging not fully provisioned. Owner verification pending: 10, 11, 11-fixes, 15a, 14, 15b, 15b-3a, 15c-1, 15c-2a, 13a1. **7a1 Task 12 (live deploy) is not done.**
- Migrations run through **`0113`** (0113 `sending_domain_unique`; 0112 `hosts_rls`; 0111 `hosts` = `agency.host_slug`, `agency_domain`, `agency_sending_domain`; 0110 `social`; next free **`0114`**, claimed by 13a2). `cs_dev` and staging are at 0110 (staging migrates on the next CI deploy; `kb:seed` verified current 2026-11-14, 127 articles; the 13a1 Domains guide needs a re-seed). `cs_demo`: `pnpm demo:reset` before demoing.
- **Tests at the 13a1 merge:** typecheck green; demo tests pass (306); `test:affected` green after test-only fixes; `e2e:affected` 164 passed; launch gate green on both hosts (platform max 6 DB stages, agency host max 7). **Full unit and E2E suites deferred to CI.** Last full local unit run: site-audiences merge 2026-11-10 (19/19 packages, 11,889 tests). Local cluster `scripts/local-test-db.sh` (port 5444); after a rebase use `e2e:affected --full`; a `next build` OOM `0xC0000409` needs one retry (gotchas).
- CI: Ask cassette + baseline re-recorded on phase-18e; `eval:replay` green at that merge. CI `deploy` is skipped until repo var `DEPLOY_ENABLED=true`; `deploy-staging`/`deploy-staging-site` until `STAGING_DEPLOY_ENABLED=true` (then prod waits for both).
- **Boot rules (13a1):** web and worker need the same `NEUTRAL_DOMAIN` (staging `staging.rivalmonday.app`); prod web and previews refuse to boot without it (OPS § Hosts, domains and sending). New env: `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`; E2E-only `DOMAINS_FAKE_VENDORS` (refused on any `VERCEL_ENV`).
- **Prod worker needs `SERVICE_DATABASE_POOLED_URL`** (refuses to start without it). Rehearsal-only vars (`AI_PROVIDER_MODE`, `VENDOR_FAKE_MODE`, `CRAWL_HOST_ALLOWLIST`, `REHEARSAL_LIVE_CLIENT_IDS`, `FIXTURE_HOSTS`, `FIXTURE_LOG_TOKEN`, `VENDOR_LIVE_RANK_SCANS`) are refused outside staging.
- Switches: `KB_IMPORT_ENABLED`, `ASK_FAKE_AI`, `BILLING_FAKE_GATEWAY` (refused on any Vercel env), `SETUP_FAKE_LOOKUP`, `WEBHOOK_FAKE_SEND` (E2E only). Billing off until `STRIPE_SECRET_KEY`; Turnstile faked until keys; `POSTMARK_WEBHOOK_SECRET` on Vercel only.
- **In flight:** none. 13a2 is planned (plan owner-approved 2026-11-16; work file `docs/work/phase-13a2.md`); 13a3 is open.
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbooks: [OPS.md](OPS.md), [DEPLOY.md](DEPLOY.md), [STAGING.md](STAGING.md).

## Next up
**Owner - phase-13a1 (merged 2026-11-16), in order:**
1. **Copy sign-off (deferred at merge):** run `pnpm copy:review` on `main` (about 89 strings: 13a1's new strings plus 3 re-signs for the `NEUTRAL_DOMAIN` refusal text) before anything client-facing ships.
2. **Choose the neutral domain, then infra.** Not under `rivalmonday.app`; available 2026-11-14: clientintel.app (suggested), insightdesk.app/.io, intelportal.app, weeklybrief.app, briefportal.app. Then: Vercel wildcard `*.<neutral>` and `mcp.<neutral>` on the web project, Postmark `mail.<neutral>`, and the tokens above on Vercel web (prod + staging) and the Railway worker.
3. **F6 env order before the next staging and prod deploy:** set `NEUTRAL_DOMAIN=staging.rivalmonday.app` on the staging web project **and** the Railway staging worker (`pnpm staging:railway-vars`, 21 vars); otherwise staging boot fails. Prod: set the neutral domain before `DEPLOY_ENABLED`. Set it on the Vercel Preview environment too, or keep previews off. Then migrate 0111-0113 (worker, then web).
4. **Verify:** (a) as a client open `<slug>.<NEUTRAL_DOMAIN>` (staging `<slug>.staging.rivalmonday.app`): agency branding, no Rival Monday, sign-in on that host; (b) Agency settings -> Domains: add a real custom subdomain, set DNS, see it go live (sweep or Check now); (c) add a sending domain, set DKIM + Return-Path, wait for verified, confirm a brief arrives From it; (d) in Claude connect `https://mcp.<neutral>/mcp`: OAuth completes and tools list; (e) platform `/mcp` returns 404 (no moved notice, by decision).
5. **13a2:** run SDD from Task 0 of [the plan](superpowers/plans/2026-11-16-phase-13a2-voice-scrub-leaks.md) in its own worktree `phase-13a2` from `main` (owner-approved; migration 0114).
6. **13a3 may start any time** in its own worktree (branding addendum 2026-11-05).

**Owner - phase-18e (merged 2026-11-14):** sign the 18e drafts in `pnpm copy:review` (still pending); deploy order: migrate 0110, worker, then web (confirm `SCRAPECREATORS_API_KEY` on the worker); staging: one social-pack client, first social pull (discovery then pull, 3-5 credits per rival), confirm a suggested account, scorecard count and brief line; run the OPS "Credits used" query against `/platform/costs`; try the AI decisions card (default Jev only; "Re-evaluate with all models" for a day, then stop).

**Owner - earlier merges still owed (details in BACKLOG § Owner):** 18d (sign copy; staging venues check; spot-check 5 unverified add-listing URLs; prod: migrate 0109 before worker, then web), 18c (sign copy; listings checks), site-audiences (phone heroes, menu sheet 1024-1279 px, four calls to confirm), 18b (sign copy; week 1/2 staging checks).

**Owner - phase-18a3 / 18a:** sign the ad-image copy; any env with data: `pnpm db:migrate` (0100-0104), restart the worker at once (old code rejects v6 packs), then web; `meta-page-backfill --dry-run` then real, `rescore --dry-run` then real. Set `AD_IMAGE_SINCE` (`packages/engine/src/ads/images.ts`) and `AD_PRICE_SINCE` to the switch-on day if later. Website monitoring stays off until `rivalmonday.app/bot` is live: OPS "Switching on website monitoring (18a-2)".

**Owner - brief-report / brief-signal:** the week of 2026-11-16 check a real weekly report after the first full run (briefs generated Thu 2026-11-12, delivered Mon 2026-11-16): PDF and email grades match the Major lines, charts/map filled, cover names the agency only; `SELECT id, kind, report IS NOT NULL FROM brief WHERE period_end >= '2026-11-12';`. Staging: one live week, email on a phone, app brief page. `deliver-once --brief <id> pdf` on cs_dev, open on a phone. Label `verifier_decisions` (tau stays 0.85 until labelled).

**Owner - staging worker on Railway (2026-11-07):** rotate `RAILWAY_TOKEN` (the staging project token was pasted into a chat): new token at Railway -> `rivalmonday-staging` -> Settings -> Tokens (environment `production`), `gh secret set RAILWAY_TOKEN --env staging` in your own terminal, delete the old `github-ci-staging` token.

**Owner - closed:** see git history / `docs/archive/`. Before the first pilot invite: [PILOT.md](PILOT.md) § 1 gate.

**Then, in order (pilot):** 13a1 infra and verification above (before the pilot: preferred, not a blocker) -> rehearsal stack (worker host = Railway; staging worker live) -> 7c2 Task 12 rehearsal + Task 13 -> 7a1 Task 12 live deploy -> pilot ([PILOT.md](PILOT.md) § 1 gate). **Phase 7 dev:** 7b1, 7b2, 7c1, 7c2 all merged. **Dev next:** 13a2, then 13a3 (any time). Site deploy follows the 7a1 live deploy ([DEPLOY.md](DEPLOY.md) § Marketing site).

**Owner housekeeping:** at prod deploy: create standard v2 on `/platform/billing` (live Stripe key), then move agencies; Vercel `NEXT_PUBLIC_CLIENT_PRICE_USD=249`; `NEON_API_KEY` + `NEON_ORG_ID` in the worker env; `set_seat_cap_exempt` for the owner's agency if > 3 active clients.

**Later:** Phase 9/10/11/15 "Soon" backlog items. **Waiting on real data:** first real alerts from the 2026-10-20 weekly pull.

## Process (short)
`/rm-start` -> `/rm-kickoff` -> brainstorm -> spec -> lean plan -> owner approval -> subagent-driven development -> `/rm-wrap-up` -> `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
