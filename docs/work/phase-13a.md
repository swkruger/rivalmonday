# phase-13a — White-label parity (hosts, domains, MCP host, sender, voice, scrub, branding)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13a   **Base:** main @ bccdc980
**Plan/spec:** [13a1 plan 11-14](../superpowers/plans/2026-11-14-phase-13a1-hosts-domains.md) (approved; supersedes Part 1 of [plan 10-17](../superpowers/plans/2026-10-17-phase-13a-white-label.md)) · [spec + addendum 11-05](../superpowers/specs/2026-10-17-phase-13a-white-label-design.md) · old brief [phase-13.md](phase-13.md) (delete at merge)

## Status (overwrite)
13a1 SDD Tasks 0–13 complete and reviewed. Task 14 (MCP moved notice) skipped by ruling R13. Task 15 prep is done: `--filter`, coverage entry for Domains, staging worker `NEUTRAL_DOMAIN`, kb:seed, copy list. The launch gate is green on both hosts.

## Next (overwrite)
Agent: the final review (top model): `pnpm test:affected`, `pnpm --filter @cs/web e2e:affected` (background, one at a time), Review focus 1–5, one fix wave. Owner: `pnpm copy:review` in this worktree, the R9 confirmation, then `/rm-merge` on the owner's go-ahead. 13a2/13a3 plans come later (13a3 may start in its own worktree at any time).

## Interfaces this branch adds or changes
- **Migrations:** `0111_hosts` (`agency.host_slug` unique, `agency_domain`, `agency_sending_domain`), `0112_hosts_rls` (service-role writes), `0113_sending_domain_unique` (partial unique `agency_sending_domain(domain) WHERE status <> 'removed'`).
- **Hosts (`@cs/db` `hosts.ts`):** `HostEnv`, `parseHostEnv(env)` (null host env when there is no routing; prod refuses without `NEUTRAL_DOMAIN`), `clientOriginFor(db, agencyId, h)`. Delivery: `senderFor` (`engine delivery/sender.ts`) and `linkBaseFor` (`outbox.ts`, audience = recipient). Tools: `linkBase(deps, ctx)` (`tools/link-base.ts`).
- **Tools:** `get_agency_domains`, `set_custom_domain`, `remove_custom_domain`, `set_sending_domain`, `remove_sending_domain` (agency admin, web only), `platform_set_agency_host_slug`.
- **Jobs:** `domain-verify` and `sender-verify` (worker `jobs/domains.ts`), plus cron `domain-verify-sweep` (`23 * * * *`).
- **Routes:** `/agency/settings/domains`, `/rm-internal/host-redirect` (cross-host 307 + no-store; target in a proxy-set header, never a query). Platform `/mcp` now returns 404; MCP and its OAuth issuer live on `mcp.<NEUTRAL_DOMAIN>`.
- **Env:** `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`, E2E-only `DOMAINS_FAKE_VENDORS` (refused on any `VERCEL_ENV`). The staging worker gets `NEUTRAL_DOMAIN` via `pnpm staging:railway-vars` (21 vars; must equal the `APP_URL` host).

## Assumes from other branches
None in flight.

## Later sub-phases (from the 11-14 refresh)
- **13a2** (own plan after 13a1 merges): voice (R3/R5, AM review flags), scrub (favicon per host — F24, host-aware root metadata, `productNameFor`/`kbNamesFor` fallbacks, `support.ts` copy, Stripe product name), leak check (unit + E2E crawl), `apps/site` white-label FAQ (BACKLOG l.200).
- **13a3** (any time, own worktree): spec addendum 2026-11-05 (header colour, dark logo, editor preview, tokens everywhere incl. BACKLOG l.162 URLs, l.209, l.213, l.217; property test; 3-theme shots).

## Decisions (owner-approved)
Spec D1–D7 and plan P1–P23 (2026-10-17) stand, amended by the 2026-11-14 refresh (13a1 plan Decisions P/N):
- **R1 Split:** 13a1 covers hosts, custom domains, the MCP host and sending domains. 13a2 covers voice, the remaining scrub and the leak check. 13a3 = spec addendum 2026-11-05 (own worktree, may start first).
- **R2 Host cache:** the 60 s hostname→agency cache is a named exception to "no cross-request cache" (routing data only; memberships are checked per request). Record it under Launch gate at merge.
- **R3 Client voice:** a "Voice" section on the client Runbook settings page.
- **R4 `host_slug`:** `intake_link.slug`, else a slug of `agency.name`; the operator can change it.
- **R5 Voice coverage:** P20 writers + `runbook_tailor`; the preview counts as agency AI spend under the 7b guards.
- **R6 `/start`:** platform `/start` may show Rival Monday; agency hosts serve only `/start/<slug>`.
- **R7 Staging hosts:** staging `NEUTRAL_DOMAIN` = `staging.rivalmonday.app` (agency `<slug>.staging.rivalmonday.app`, MCP `mcp.staging.rivalmonday.app`). The production neutral domain must not be under `rivalmonday.app`.
- **R8 Fake vendors:** `DOMAINS_FAKE_VENDORS` is refused on any `VERCEL_ENV`.
- **R9 MCP cutover:** if 13a1 reaches prod with or before the first live deploy, drop the moved error and the reconnect notice (P16). Decide at merge.
- **R10 Prerequisites:** code runs on fakes; infra goes in parallel. The new env names are in `turbo.json`.
- **R11 Neutral domain:** not chosen. Available 2026-11-14: clientintel.app (suggested), insightdesk.app/.io, intelportal.app, weeklybrief.app, briefportal.app.
- **R12 13a1 plan approved (2026-11-14):** N1–N6 and the Proposed copy, as written.
- **R13 Task 14 skipped:** pending the owner's R9 confirmation at merge. No production deploy exists, so no OAuth connection to the old `/mcp` exists. If the owner wants it, the task can be built from the plan.

## Launch gate (Task 15, 2026-11-14) — green, both passes
- **Platform:** `bash apps/web/scripts/profile-gate.sh --seed`: 74/74 routes, max **6** DB stages; `/agency/settings/domains` = 4, `/platform/agencies/[id]` = 3.
- **Agency host (client):** run as asker@e2e.test on Ask Demo Heating, signed in by magic link on `e2e-agency.localhost`; storage state passed as `--cookie`. 28 pages, max **7**. Every 404/307 is ≤ 7 and every 200 page ≤ 7. Command:
  `MSYS2_ARG_CONV_EXCL='/c/' bash apps/web/scripts/profile-gate.sh --skip-build --no-strict-routes -- --base http://e2e-agency.localhost:3100 --cookie <state> --filter /c/ --param clientId=<Ask Demo Heating id> --params-from-seed --assert-db-stages 8`
  - `MSYS2_ARG_CONV_EXCL` stops Git Bash rewriting `/c/` into `C:/` (`MSYS_NO_PATHCONV=1` breaks the server start).
  - `--param` is needed because the seed's `clientId` is the admin's. `--seed` regenerates the ids, so look the id up after each seed.
  - `--no-strict-routes` is for this pass only: the seed has no `alertId`/`briefId` for that client.
- **Fix:** a 404 or page `redirect()` re-renders the root layout with a fresh `cache()`, so the viewer resolves twice. The Decision 16 client-hint lookup (multi-membership users) was its own stage per pass. It now starts beside `listMemberships` (`server/viewer.ts`), so 404/307 drop from 9 to 7.
- **Profiler:** `--filter <prefix>`, `*.localhost` requested on 127.0.0.1 + `Host`; gate flag `--no-strict-routes`.

## Owner verification steps
1. Before the merge deploy (order in Merge notes, F6), set the env on Vercel web (prod + staging) and the Railway worker: `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`. Add the wildcard `*.<neutral>` and `mcp.<neutral>` domains to the web project.
2. As a client, open `<slug>.<NEUTRAL_DOMAIN>` (staging: `<slug>.staging.rivalmonday.app`). Expect the agency's branding, no Rival Monday, and sign-in on that host.
3. On Agency settings → Domains, add a real custom subdomain, set its DNS, and see it go live (sweep or Check now).
4. Add a sending domain, set DKIM + Return-Path, wait for verified, and confirm a brief arrives From it.
5. In Claude, connect `https://mcp.<neutral>/mcp`; OAuth completes and tools list.
6. Old URL: platform `/mcp` returns 404 (per R9/R13, no moved notice).
7. Before the merge, set `NEUTRAL_DOMAIN` on the Vercel **Preview** environment, or confirm previews are off. Otherwise previews refuse to boot (see OPS notes). The real Vercel preview env was not checked.

## Merge notes
- **F6 env order:** before the merge deploy, set `NEUTRAL_DOMAIN=staging.rivalmonday.app` on the staging web project **and** the Railway staging worker (`pnpm staging:railway-vars`). Otherwise staging boot fails. On prod, set the neutral domain before `DEPLOY_ENABLED`.
- **R2:** record the 60 s host cache under Launch gate (CLAUDE.md).
- **BACKLOG closures:** custom/sending domains (4b, 5a); connector name (6a part); `fromEmail` drop (5a T18); sign-in host branding (phase-11); l.162 From (N1); l.212 `--secondary-foreground` (done in `theme.ts`).
- **R9:** confirm skipping Task 14. If it is kept, build it and set `MCP_HOST_CUTOVER`.
- **OPS notes:**
  - Pool lead mail is skipped without `NEUTRAL_DOMAIN`.
  - A removed sending domain whose Postmark domain stays verified blocks re-adding until it is cleaned in Postmark.
  - Vercel branch-alias preview hosts must be in `extraPlatformHosts` (`VERCEL_URL`/`VERCEL_BRANCH_URL` only).
  - Preview and production both refuse to boot unless `NEUTRAL_DOMAIN` is set or `APP_URL` is a non-root host such as staging. Off production, `hostEnvFor` retries with the `APP_URL` host, but `parseHostEnv` refuses `rivalmonday.app` (an RM root). So a preview with `APP_URL=https://rivalmonday.app` refuses too (owner step 7).
  - Next `redirect()` bounces can't set no-store (RSC responses are already no-store; P5 holds for proxy redirects).
- **Copy:** owner signs the new strings in `pnpm copy:review`. About 86 items are on lines added by this branch: Domains page/panels and `DOMAIN_COPY`, the agency help copy, labels, the platform manage menu (host slug), the MCP tool text and the Domains guide. The list is in the SDD `task-15-report.md`.
- Delete `docs/work/phase-13.md`.

## New backlog (target → item)
- **13a2 → hosts:** surface an unparsable `APP_URL` as a `hostEnvFor` problem (env.ts `hostEnv!`). Short-circuit `RESERVED_HOST_SLUGS` before the query (fix the hosts.ts:73 comment). Add a test for a hostname removed by A then live for B. Bound the host-cache instances (LRU, not insertion order). Add an unknown-host `/health` pass-through test.
- **13a2 → MCP/auth:** `productNameFor` agency fallback (P17). Fix the stale proxy.ts:9 comment. Add tests for revoked/accepted invitations in `hasSignInRightIn`. Split the consent `page.test` states. Add a smoke test that refuses a platform guest cookie at `/agency`.
- **Polish → domains:** `dnsRecords` update failure after `vercel.add` leaves a pending row (the sweep covers it). Support sessions can't read the Domains page (note in the 8b doc). An unnamed unique violation is mapped to slug-taken. `deps.ts` `domainEmail` logs the raw `err.message` (use `redactForLog`). No DKIM refresh from Postmark state (check at live verification). A misconfigured verifying row doesn't revert to pending. Concurrency test for the host_slug advisory lock / operator slug refusal.
- **Polish → delivery:** `clientOriginFor` is computed per message in worker paths (precompute). Mixed-membership inbox edge goes to `/inbox`. Theme `hostForLogo` swallows errors. Outbox test rows without an audience fall back to agency. The `pool_new` guard test can't fail. Import placement in swept tests.
- **Polish → web:** `/start` with a malformed slug skips the host check (submitIntake refuses anyway). Agency-contact `/l` on its own agency host goes to platform sign-in.
- **Soon → launch gate:** seed `alertId`/`briefId` for a client user so the agency-host pass can be `--strict-routes`.

## Pre-flight (Task 0, 2026-11-14, condensed)
Base `main` `bccdc980`, migrations 0111/0112 claimed (0113 added in Task 10). No drift. Spike: Chromium resolves `*.localhost`; Node needs `127.0.0.1` + `Host`; async `proxy` with DB works under `next start` (tests must `await proxy`). Vendor contracts: Vercel v10/v9/v6 domain endpoints (Bearer + `teamId`); Postmark `/domains` with `X-Postmark-Account-Token`. `ID` is an integer and the SPF fields are deprecated.
