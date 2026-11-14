# phase-13a — White-label parity (hosts, domains, MCP host, sender, voice, scrub, branding)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13a   **Base:** main @ bccdc980
**Plan/spec:** [13a1 plan 11-14](../superpowers/plans/2026-11-14-phase-13a1-hosts-domains.md) (awaiting owner approval; supersedes Part 1 of [plan 10-17](../superpowers/plans/2026-10-17-phase-13a-white-label.md)) · [spec + addendum 11-05](../superpowers/specs/2026-10-17-phase-13a-white-label-design.md) · old brief [phase-13.md](phase-13.md) (delete at merge)

## Status (overwrite)
Owner approved the 13a1 plan 2026-11-14 (incl. N1–N6 and its Proposed copy). SDD execution started; Task 0 next.

## Next (overwrite)
Agent: SDD from Task 0 (pre-flight). 13a2/13a3 plans later (13a3 may start in its own worktree any time).

## Interfaces this branch adds or changes
Migrations next free at execution, currently **0111+**. Tables `agency_domain`, `agency_sending_domain`; `agency.host_slug`; `client.voice_override`; `brief`/`alert` `review_reason`/`review_terms`. Env `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`, `DOMAINS_FAKE_VENDORS` (E2E).

## Assumes from other branches
None in flight. Plan "Dependencies on in-flight work" all satisfied (13b, 11, 10, 15a–c, 16, 17, 7a–c, 18a–e merged).

## Plan refresh (summary — detail now in the 13a1 plan)
Audit 2026-11-14 of the 10-17 plan against `main`: per-task drift (paths, symbols, new routes, sender sites, settings pages under `/agency/settings/*`, registry in `tools/src/tools/`, `E2E_PORT`), done-elsewhere items (15a auth branding/titles/error pages/connector slug, `--brand-ink`, runbook pages, intake) and new scope are folded into the [13a1 plan](../superpowers/plans/2026-11-14-phase-13a1-hosts-domains.md) (Decisions P/N, task Files, Appendices). Open questions Q1–Q10 became R1–R11.
- **13a2** (own plan after 13a1 merges): voice (R3 Runbook "Voice" section, R5 writers + `runbook_tailor`, preview under 7b guards, AM review flags), scrub (favicon per host, host-aware root metadata, `productNameFor`/`kbNamesFor` fallbacks, `support.ts` copy, Stripe product name), leak check (unit + E2E crawl, `brief_highlights`/`brief_report`/`scorecard`/`digest`/`lead_*`/`feedback_line`), `apps/site` white-label FAQ (BACKLOG l.200) once 13a1 is live.
- **13a3** (any time, own worktree): spec addendum 2026-11-05 (header colour, dark logo, editor preview, tokens everywhere incl. BACKLOG l.162 URLs, l.209, l.213, l.217; property test; 3-theme shots).

## Decisions (owner-approved)
Spec D1–D7 and plan P1–P23 (2026-10-17) stand, amended by the 2026-11-14 refresh:
- **R1 Split (Q1):** three sub-phases, own plan + merge each: 13a1 hosts/custom domains/MCP host/sending domains; 13a2 voice/remaining scrub/leak check; 13a3 = spec addendum 2026-11-05 (comprehensive branding), no domain prerequisites, may start first in its own worktree.
- **R2 Host cache (Q2):** 60 s hostname→agency cache is a named exception to "no cross-request cache" (routing data only; memberships checked per request). Record under Launch gate at merge.
- **R3 Client voice (Q3):** a "Voice" section on the client Runbook settings page; no `/c/<id>/settings/customisation` page.
- **R4 `host_slug` (Q4):** `intake_link.slug` when present, else slugify `agency.name`; operator can change it.
- **R5 Voice coverage (Q5):** P20 writers + `runbook_tailor`; preview = agency AI spend under 7b guards.
- **R6 `/start` (Q6):** P24 dropped; platform `/start` may show Rival Monday (CLAUDE.md Onboarding 11); agency hosts serve only `/start/<slug>`.
- **R7 Staging hosts (Q7, owner 2026-11-14):** staging `NEUTRAL_DOMAIN` = `staging.rivalmonday.app` → agency `<slug>.staging.rivalmonday.app`, MCP `mcp.staging.rivalmonday.app` (no client visibility yet). Production neutral domain must not be under `rivalmonday.app`.
- **R8 Fake vendors (Q8):** `DOMAINS_FAKE_VENDORS` refused on any `VERCEL_ENV` (like `BILLING_FAKE_GATEWAY`).
- **R9 MCP cutover (Q9):** if 13a1 reaches prod with/before the first live deploy, drop the moved error + reconnect notice (P16); decide at 13a1 merge.
- **R10 Prerequisites (Q10):** code now on fakes (`NEUTRAL_DOMAIN=localhost`); infra in parallel. Owner OK'd adding `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`, `DOMAINS_FAKE_VENDORS` to `turbo.json`.
- **R12 13a1 plan approved (2026-11-14):** N1–N6 and Proposed copy as written in the plan.
- **R11 Neutral domain:** not chosen. Available 2026-11-14 (registry check): clientintel.app (suggested), insightdesk.app/.io, intelportal.app, weeklybrief.app, briefportal.app.

## New backlog (target → item)
- Close at merge → BACKLOG l.212 (`--secondary-foreground` literal): done in `theme.ts`.

## Owner verification steps
TBD at plan refresh.

## Pre-flight (Task 0, 2026-11-14)
- **Base:** `main` still `bccdc980`; no rebase. Migrations: latest `0110_social_jev`; claim **0111** (hosts) + **0112** (hosts_rls), as planned (plan unchanged).
- **Drift:** none. Every cited symbol/path exists: `proxy` (`apps/web/src/proxy.ts`, sync today), `buildAuthOptions` (`server/auth-options.ts`), `server/auth.ts` has 12 importers (as planned), `authBranding`/`defaultBranding`, `themeForViewer`, `agencyBrandingOf`/`viewerWith` (`current-viewer.ts`, `theme.ts`), `resolveViewer` (`viewer.ts`, also named in `proxy.ts`), `notify` (`engine delivery/outbox.ts`), `personalLink`, `createEmailSender`, `deliveryConfigFromEnv`, `loadBranding` (`@cs/email`), `appLinkFor` (`@cs/core links.ts`), `handleMcpRequest`, `createVerifyOAuth`, `mcpServerName`, `displayNameFor`, `updateAgencyBranding`, `sendLeadEmail`, `sendTeamInviteEmail`, `client-invite.ts` `startUrl`, `briefAttachment`, `client-details.ts` `logoUrl`, worker `deps.ts`, `slugBase` (`tools/leads.ts:213`).
- **Gotcha for Task 3:** making `proxy` async breaks `next build` typecheck unless `src/proxy.test.ts` (~l.48-74) and `src/server/mcp.test.ts` (l.176-179) `await` it (build typechecks tests).
- **Spike** (port 3217; `E2E_PORT` unset, default 3100): (a) Playwright Chromium `http://foo.localhost:3217/health` 200 `{"ok":true}`. (b) Node `http.request` to 127.0.0.1 with `Host: foo.localhost:3217` 200. (c) async `proxy` importing `./server/db` (`server-only`) ran `select 1` under `next start` (header `x-spike: OK [{"x":1}]`); build needed `typescript.ignoreBuildErrors` only for the sync-test typing above. All pass; reverted, nothing committed.
- **Slug preview (`cs_dev`, BEGIN..ROLLBACK, Appendix A bodies):** 3 agencies: "CS Dev Verification Agency" -> `cs-dev` (intake slug); "No Fingers AI" -> `no-fingers-ai`; "DSTigerGuide" -> `dstigerguide`. Rolled back (no `host_slug` column left).
- **Vendor contracts (live docs 2026-11-14):** matches expectations; extras below. Bearer token + `teamId` (or `slug`) query on all Vercel calls.
  - Vercel `POST /v10/projects/{idOrName}/domains` body `{name}` (+ optional gitBranch/redirect...) -> `{apexName,name,projectId,verified,verification?[{domain,type,value,reason}],createdAt,updatedAt,...}`. Errors: 400 already on project/invalid, 402, 403, 409 (assigned to another project / not allowed).
  - `GET /v9/projects/{id}/domains/{name}` same shape; `POST .../{name}/verify` (no body) -> same minus `verification`; 400 when TXT missing/mismatched/used by another project. `DELETE /v9/projects/{id}/domains/{name}` -> 200 `{}`; 404 if absent.
  - `GET /v6/domains/{name}/config?projectIdOrName=` -> `{misconfigured, configuredBy: A|CNAME|dns-01|http|null, acceptedChallenges, recommendedCNAME:[{rank,value}], recommendedIPv4:[{rank,value:string[]}]}`; use rank 1; pass `projectIdOrName` for a not-yet-attached domain.
  - Postmark `https://api.postmarkapp.com`, header `X-Postmark-Account-Token`: `POST /domains {Name, ReturnPathDomain?}`, `GET /domains/{id}`, `PUT /domains/{id}/verifyDkim`, `PUT /domains/{id}/verifyReturnPath`, `DELETE /domains/{id}`. Domain object (create/get/verify all same): `ID` (int), `Name`, `DKIMVerified`, `DKIMHost/TextValue`, `DKIMPendingHost/TextValue`, `DKIMRevokedHost/TextValue`, `DKIMUpdateStatus` (Pending|Verified), `WeakDKIM`, `ReturnPathDomain`, `ReturnPathDomainVerified`, `ReturnPathDomainCNAMEValue`, `SPFVerified` (deprecated), `SPFHost/TextValue`, `SafeToRemoveRevokedKeyFromDNS`. Delete -> `{ErrorCode, Message}`. Differences: `ID` is integer (store as text/number carefully); SPF fields deprecated (ignore).
- **Infra:** pending (neutral domain unchosen, R10/R11); not blocking, code on fakes.
- `pnpm typecheck` green (19/19).
