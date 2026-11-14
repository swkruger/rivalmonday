# Phase 13a1 — Hosts, custom domains, MCP host, sending domains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Supersedes** Part 1 (header + Tasks 0–14) of `docs/superpowers/plans/2026-10-17-phase-13a-white-label.md` (owner-approved 2026-10-17). Its design and binding interfaces stand unless this plan changes them; its Part 2 moves to the 13a2 plan (below). **Lean plan format** (root `CLAUDE.md` § Process): interfaces are binding; full code only in the **Appendices** (SQL/RLS, host env, host routing, per-origin auth, viewer host rules, hostname validation), referenced by the tasks.

**Goal:** Client-facing traffic runs on the agency's own host (live custom subdomain, else `<host_slug>.<NEUTRAL_DOMAIN>`), MCP and its OAuth issuer on `mcp.<NEUTRAL_DOMAIN>`, and client email comes from the agency's verified sending domain, else `<host_slug>@mail.<NEUTRAL_DOMAIN>` — never a Rival Monday host or address.

**Architecture:** `proxy.ts` (async, Node runtime) resolves each request's host — platform (`APP_URL`, checked first) / mcp / agency / unknown — through a 60 s hostname cache, applies session-free path rules and forwards the validated origin in headers. Better Auth runs one instance per origin. Viewer resolution filters memberships by host and moves staff ↔ client-only users between hosts. `clientOriginFor` (`@cs/db`) builds every client-facing URL; `senderFor` (`@cs/engine`) picks every From address. Domains are self-serve tools over Vercel/Postmark wrappers (fakes in tests) with self-rescheduling worker verify jobs.

**Tech stack:** TypeScript, Next.js 16 App Router (`proxy.ts`), Better Auth 1.7.7 + `@better-auth/oauth-provider`, Drizzle + Postgres RLS, pg-boss 10, `@cs/tools` registry, react-email, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-phase-13a-white-label-design.md` (binding, D1–D7) **plus** Decisions R1–R11 in `docs/work/phase-13a.md` (owner-approved 2026-11-14; they override P-decisions and the spec where they conflict).

## Global constraints
- Worktree `../CompetitorSpy-wt/phase-13a`, branch `phase-13a` (not `main`). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`, `apps/web/next-env.d.ts`. LF only. Commits end with the Co-Authored-By line from root `CLAUDE.md` (subagents: their own model).
- Before coding, read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every touched package: db, core, engine, email, tools, mcp, billing, collectors, worker, web, demo, copy-review.
- **Root rule:** nothing client-facing names Rival Monday; client email never uses a Rival Monday domain. Agency staff and the platform console stay on `APP_URL`. `/bot` only on the platform host.
- Web reads = registered tools via `callTool` (read audits deferred with `after()` by the registry); writes via `runTool`; refusals 404 (never 403); a named out-of-scope client → `not_found`, never an empty list.
- New tools: `access` mark + `access-marks.test.ts` snapshot + `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; `ISOLATION_FIXTURES` entry; all new tools are web-only (`channels.test.ts` lists stay as they are and must pass); not added to `PAUSED_WRITE_ALLOW_LIST` (held agencies refused); controls wrapped in `WriteGuard`.
- New tables: ENABLE + FORCE RLS, `TABLE_CLASS` (`packages/db/test/table-classes.ts`) + world rows (`test/isolation-world.ts`), privilege-guard lists. Migrations: next free numbers at execution (currently **0111** generated, **0112** custom); never edit applied migrations.
- Env (R10, owner-approved names): `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`, `DOMAINS_FAKE_VENDORS` → `turbo.json` `globalPassThroughEnv`. Never read, print or log `.env` values or tokens; vendor error text never carries tokens or query strings.
- Fakes (R8): `DOMAINS_FAKE_VENDORS=1` selects fake vendors in E2E only; refused on any `VERCEL_ENV`; ignored by the worker. DEMO/TEST databases and Vitest always use fakes.
- SSRF: any fetch of a user-supplied hostname goes through `assertPublicUrl` (`@cs/collectors` `net/guard.ts`).
- Launch gate: every page ≤ 8 app DB stages, also client pages on an agency host. The 60 s hostname→agency cache in the proxy is the one named exception to "no cross-request cache" (R2: routing data only; memberships re-checked per request).
- Host redirects are 307 + `cache-control: no-store` (P5).
- UI: design system v1 (`docs/design-system/README.md`); `PageHeader` title = menu label + breadcrumb; help key + guide (`docs/help/pages/`); statuses via `lib/labels.ts`; 36 px controls; new copy into `pnpm copy:review`; new email template ⇒ preview in `@cs/email` `src/previews.ts`.
- E2E agency host = `http://<host_slug>.localhost:${E2E_PORT}` (3101 in this worktree) with `NEUTRAL_DOMAIN=localhost`; Node-side requests to `*.localhost` use the Task 13 `hostRequest` helper. New tags `@hosts`, `@domains`.
- Tests: implementers run focused tests only, in the foreground; `test:affected` + `e2e:affected` once at the final review (Task 15); full suites only in `/rm-merge` after asking. Test DB `cs_phase_13a_test` (pgboss done).
- Decided copy is verbatim (spec + the 2026-10-17 plan's copy lines, approved with it); new lines are marked **Proposed copy**.

## Decisions
**Spec D1–D7** by reference (D7's "Client customisation page" is replaced by R3 and belongs to 13a2). **R1–R11** (work file) by reference: R1 this plan = 13a1 only; R2 host cache exception; R4 slug source; R6 P24 dropped; R7 staging hosts; R8 fakes; R9 MCP moved notice separable (Task 14); R10 fakes + env names; R11 neutral domain not chosen.

**P1–P23 of the 2026-10-17 plan stand** (P17–P23 are 13a2), amended:
- **P1 (+R4):** `agency_host_slug_for(name, self)` returns the agency's `intake_link.slug` when present, free and not reserved, else the slugified name (mirrors `slugBase` in `@cs/tools` `tools/leads.ts`), de-duplicated `-2`, `-3`…; backfill processes agencies with an intake link first. The `BEFORE INSERT` trigger fills `host_slug` (no intake link exists yet at insert → name) under an advisory lock. A later intake-slug change never changes `host_slug`.
- **P2 (+R7):** `parseHostEnv` (Appendix B). Platform host checked before anything else, so staging's `<slug>.staging.rivalmonday.app` and `mcp.staging.rivalmonday.app` nest under `APP_URL` = `https://staging.rivalmonday.app`. A `NEUTRAL_DOMAIN` under `rivalmonday.app`/`.com` is refused unless it equals `APP_URL`'s host and that host is not a Rival Monday root (staging only).
- **P11 (+R8):** as Global constraints; worker passes `{ allowFakeFlag: false }` (mirrors `gatewayFor`).
- **P16 (+R9):** Task 8 makes platform `/mcp` a 404; the moved JSON-RPC error, `MCP_HOST_CUTOVER`/`MCP_MOVED_UNTIL` and the reconnect notice live only in Task 14, its own commits, droppable at merge.
- **P24 dropped (R6):** platform `/start` may show Rival Monday; agency hosts serve only `/start/<own slug>`, `/start/v/*`, `/start/verify/*`.

**Plan-local (new, owner to confirm with the plan):**
- **N1 Audience = recipient.** `senderFor(…, 'client')` for every mail to a client contact or to an agency's lead; `'agency'` (platform sender `"Rival Monday" <EMAIL_FROM>`, P15) for mail to agency staff — outbox `AGENCY_KINDS`, `lead_new`, team invites. Pool leads keep the platform sender. This resolves BACKLOG l.162 "Team invite From → neutral domain" as *platform sender* (staff live on `APP_URL`, D4).
- **N2 `NEUTRAL_DOMAIN` is required in production:** web env problem when `VERCEL_ENV=production` and missing; worker `REQUIRED_PROD_ENV` gains it. Delivery fails closed (`deliveryConfigFromEnv` → null) without a host env.
- **N3 Host-agency checks in handlers:** the proxy is session-free and DB-free beyond the host lookup, so `/files/logo/clients/<clientId>/*`, `/start/<slug>`, `/start/v/*`, `/start/verify/*` and `/l/<token>` compare their object's agency with the `x-rm-host-agency` header and 404 / `/link-expired` on mismatch.
- **N4 Staff signing in on an agency host** are bounced to the platform after sign-in and sign in again there (host-only cookies; no cross-host session transfer).
- **N5 Launch gate:** `isOperator` and the bounce target's `clientOriginFor` are read only on the platform-bounce path (`platformBounceTarget`, Appendix E); normal pages add no DB stage. The proxy lookup is cached, so warm profiled visits add none.
- **N6 Vendor rate limits:** worker Vercel/Postmark calls go through the shared limiter with new keys `vercel`/`postmark` (`{ concurrent: 2 }`) in `DEFAULT_VENDOR_LIMITS`; wrappers pass `timeoutMs: 10_000` in `init`.

## File structure
New: db `src/schema/hosts.ts`, `src/hosts.ts`, `src/hosts-rls.test.ts`; engine `src/delivery/sender.ts`; email `src/templates/agency-domain-notice.tsx`; tools `src/domains/{hostname,vercel,postmark,fakes,vendors,verify}.ts`, `src/tools/domains.ts`, `src/link-base.ts`; worker `src/jobs/domains.ts`; web `src/server/{hosts,request-host,host-viewer}.ts`, `src/app/(app)/agency/settings/domains/{page.tsx,actions.ts}`, `src/components/agency/{domain-panel,sending-panel}.tsx`, `e2e/{hosts,domains}.spec.ts`; `docs/help/pages/agency.settings.domains.agency.md`; migrations 0111/0112. Task 14 only: web `src/server/mcp-cutover.ts`. Plus `turbo.json`, `docs/work/phase-13a.md`.

## Dependencies on in-flight work
None in flight (`git worktree list`: only `main` and a detached `staging-worker` checkout). Everything the old plan depended on (13b, 11, 10, 15a–c, 16, 17, 7a–c, 18a–e) is on `main`. Task 0 re-checks; shared docs (`STATE`, `BACKLOG`, `ARCHITECTURE`, roadmap) change only at merge.

## Review focus
1. **Session leaking across hosts:** sessions stay on the origin that set them; the auth memo never keys off a raw `Host` — Task 5 (`cookies carry no Domain attribute`, `authFor refuses an origin the proxy did not set`, `magic link URL uses the request origin`).
2. **Redirect loops / wrong bounces:** no decision targets its own origin; staff+client users and operators are never bounced; staging nesting resolves platform first — Task 6 (`decideHost never targets the current origin`, `mixed memberships stay`), Task 4 (`staging: <slug>.staging.rivalmonday.app is agency, staging.rivalmonday.app is platform`), Task 13 E2E.
3. **Another agency's data on an agency host:** B's memberships, guest cookies, `/l/` tokens, logos, client logos, intake slugs and pages are invisible on A's host — Task 6 (`guest cookie of another agency → null`, `/l token of another agency → link-expired`, `client logo of another agency → 404`, `/start/<other slug> → 404`), Task 4, Task 13 (`other agency's client → 404`).
4. **Links on the wrong origin:** client links (outbox, invites, magic links, client-role tool URLs, Stripe returns, billing notices, lead verify) use the client origin; agency notices keep `APP_URL` — Task 7 (`notify builds client links on the custom host, agency links on APP_URL`, `client-role MCP url is on the client origin`).
5. **Client email from a Rival Monday address, or a misconfigured env:** every client-audience From is the verified domain or `<slug>@mail.<neutral>`; a prod `NEUTRAL_DOMAIN` under rivalmonday.app is refused — Task 3 (`client audience never uses EMAIL_FROM or the APP_URL domain`), Task 2 (`refuses NEUTRAL_DOMAIN x.rivalmonday.app with APP_URL rivalmonday.app`, `allows staging.rivalmonday.app when APP_URL is https://staging.rivalmonday.app`).

---

### Task 0: Pre-flight
- [ ] `git status` clean; `git fetch`; if `main` moved past `bccdc980`, `git rebase main` and re-run `pnpm install`.
- [ ] Conflict scan (Grep) for every cited symbol and path in this plan, notably `proxy`, `buildAuthOptions`, `auth`/`perEnv` (`server/auth.ts`, 12 importers), `authBranding`, `defaultBranding`, `themeForViewer`, `agencyBrandingOf`, `resolveViewer`/`viewerWith`, `notify`, `personalLink`, `createEmailSender`, `deliveryConfigFromEnv`, `loadBranding`, `appLinkFor`, `handleMcpRequest`, `createVerifyOAuth`, `mcpServerName`, `displayNameFor`, `updateAgencyBranding`, `sendLeadEmail`, `sendTeamInviteEmail`, `client-invite.ts` `startUrl`, `briefAttachment`, `client-details.ts` logo, worker `deps.ts` senders. Record drift in the work file.
- [ ] Claim migration numbers (next free after `main`'s latest; expected 0111/0112) and write them into Task 1.
- [ ] Spike (no commit): build + `pnpm --filter @cs/web start --port $E2E_PORT`; (a) Playwright Chromium opens `http://foo.localhost:$E2E_PORT/health`; (b) Node `http.request` to `127.0.0.1:$E2E_PORT` with `Host: foo.localhost:$E2E_PORT` reaches the server; (c) an async `proxy` importing `@/server/db` (`server-only`) runs a drizzle query under `next start`. Record results.
- [ ] `cs_dev` read-only: run Appendix A's function bodies inside `BEGIN … ROLLBACK` to preview each agency's slug (intake slug vs name); record the list.
- [ ] Vendor contracts from live docs (WebFetch, no tokens); record endpoints + response shapes in the work file. Expected — **Vercel:** `POST /v10/projects/{id}/domains` (`verified`, `verification[]`), `GET /v9/projects/{id}/domains/{name}`, `POST /v9/projects/{id}/domains/{name}/verify`, `GET /v6/domains/{name}/config` (`misconfigured`, recommended CNAME), `DELETE /v9/projects/{id}/domains/{name}`, `teamId` query. **Postmark** (`X-Postmark-Account-Token`): `POST /domains` `{Name, ReturnPathDomain}` (`ID`, `DKIMPendingHost/TextValue`, `DKIMHost/TextValue`, `ReturnPathDomainCNAMEValue`, `DKIMVerified`, `ReturnPathDomainVerified`), `GET /domains/{id}`, `PUT /domains/{id}/verifyDkim`, `PUT /domains/{id}/verifyReturnPath`, `DELETE /domains/{id}`. Code against fakes until confirmed.
- [ ] Ask the owner only for what R10 left open: live-verification infra status (neutral domain, Vercel wildcard + `mcp.` on the project, `mail.<neutral>` in Postmark, tokens on Vercel web + Railway worker) — not blocking.
- **Done when:** work file has the drift, migration numbers, spike results, slug preview, vendor contracts; `pnpm typecheck` green on the branch.

### Task 1: Migrations 0111 (generated + hand-edited) and 0112 (custom RLS)
**Goal:** spec data model for hosts with the P1/R4 slug fill.
**Files:** new `packages/db/src/schema/hosts.ts`; modify `src/schema/tenancy.ts` (`agency.hostSlug`), `src/schema/index.ts`; migrations `0111_hosts.sql` (+snapshot/journal), `0112_hosts_rls.sql`; new `src/hosts-rls.test.ts`; modify `test/table-classes.ts`, `test/isolation-world.ts`, `src/evidence.test.ts` + `src/tenant.test.ts` privilege lists.
**Interfaces:** `agency.hostSlug: text('host_slug').notNull().default(sql\`NULL\`)` (comment: filled by trigger `agency_host_slug_fill`) + `unique('agency_host_slug_unique')` + `check('agency_host_slug_check', …)` exactly as Appendix A. `agencyDomain`, `agencySendingDomain` exactly per spec columns, checks and partial unique indexes. Export `AgencyDomainStatus = 'pending'|'verifying'|'live'|'failed'|'removed'`, `SendingDomainStatus = 'pending'|'verified'|'failed'|'removed'`, `DnsRecord = { type: string; name: string; value: string }`, row types.
**Behaviour:**
- `pnpm --filter @cs/db generate --name=hosts`; keep the generated table/index/check SQL for the two tables; **replace** the generated `agency` lines with Appendix A § 0111. Then `pnpm --filter @cs/db generate --custom --name=hosts_rls` with Appendix A § 0112.
- `TABLE_CLASS`: both `tenant_agency`; world rows for tenants A and B (one `agency_domain` each: A `live` `intel.a-world.test`, B `pending`; one `agency_sending_domain` each); add both to `NO_FREE_TEXT` only if no free-text column carries a canary (`error` can: seed `CANARY-A-n`).
- **Follow pattern:** `migrations/0066_onboarding_rls.sql` (`agency_onboarding`), `test/isolation-world.ts` existing agency rows.
**Tests (TDD)** `hosts-rls.test.ts`: `name "E2E Agency" → e2e-agency; duplicates → -2, -3`; `"A" → a-agency, "Mail" → mail-agency, "Café Ünïon" → cafe-union`; `60-char name → ≤ 40 chars, passes the check`; `intake slug wins when present and free`; `reserved intake slug "mail" falls back to the name`; `backfill gives intake agencies their slug before name-derived agencies` (call the function in intake-first order); `insert without host_slug gets one from the trigger`; `explicit 'www' rejected`; `duplicate violates agency_host_slug_unique`; `app_user cannot UPDATE agency.host_slug`; `second non-removed agency_domain per agency violates agency_domain_one_per_agency`; `same live hostname for two agencies violates agency_domain_hostname_active; removed rows don't count`; `account_manager reads own rows, client_owner sees none, other agency none`; `app_user cannot insert either table`; `bad status / local_part rejected`.
**Done when:** `pnpm --filter @cs/db generate` → "No schema changes"; `pnpm --filter @cs/db exec vitest run hosts-rls evidence tenant isolation-world rls-sweep` green; `pnpm typecheck`.

### Task 2: Host helpers in `@cs/db` + env plumbing
**Goal:** one source for host env, origins and host lookups (P2/R7, P3, P9, N2).
**Files:** new `packages/db/src/hosts.ts` (+`hosts.test.ts`), db index; `apps/web/src/server/env.ts` (+test); `apps/worker/src/env.ts` (+test); `turbo.json`.
**Interfaces:** Appendix B in full, plus:
```ts
export async function clientOriginFor(db: Db | Tx, agencyId: string, h: HostEnv): Promise<string>; // live agency_domain.hostname, else fallback; unknown agency → throws
export async function agencyByHostname(db: Db, hostname: string, h: HostEnv): Promise<{ agencyId: string; canonical: boolean; canonicalOrigin: string } | null>;
export function rehostLogoUrl(url: string | null, h: HostEnv, origin: string): string | null; // `${appUrl}/files/logo/…` → `${origin}/files/logo/…`; other URLs unchanged
```
**Behaviour:**
- `agencyByHostname`: hostname = `<label>.<neutralDomain>` with exactly one extra label matching `HOST_SLUG_RE` → agency by `host_slug` (`canonical` = no `live` domain; `canonicalOrigin` = live custom origin when there is one); else exact match on a `live` `agency_domain.hostname` (`canonical: true`). Both filter `agency.archived_at IS NULL`. One query each.
- `clientOriginFor`: one query (slug + live domain); `originOf` gives scheme/port.
- `WebEnv` gains `hostEnv: HostEnv` (non-null after a clean parse: a null host env always comes with a problem, incl. APP_URL's own; problems from `parseHostEnv`; plus `NEUTRAL_DOMAIN is required` when `VERCEL_ENV=production` and unset — N2). Worker `REQUIRED_PROD_ENV` += `NEUTRAL_DOMAIN`; worker start-up reports `parseHostEnv` problems like `emailFromErrors`.
- `turbo.json` `globalPassThroughEnv` += the six R10 names.
- **Follow pattern:** `packages/db/src/filters.ts` (helpers on `Db | Tx`), `apps/worker/src/env.ts` `emailFromErrors`.
**Tests (TDD):** `defaults neutral to localhost only for a localhost APP_URL`; `null + problem for a production APP_URL without NEUTRAL_DOMAIN`; `refuses NEUTRAL_DOMAIN x.rivalmonday.app with APP_URL rivalmonday.app`; `refuses rivalmonday.app itself`; `allows staging.rivalmonday.app when APP_URL is https://staging.rivalmonday.app`; `VERCEL_URL host joins extraPlatformHosts`; `originOf keeps http + port in dev, https without port in prod`; `clientOriginFor → fallback, custom when live, fallback after removed/failed`; `agencyByHostname: fallback (canonical true); fallback with live custom (canonical false, canonicalOrigin custom); live custom; pending custom → null; two-label sub (a.b.<neutral>) → null; archived agency → null`; `rehostLogoUrl rewrites only own-logo URLs (agency and clients/)`; web env `NEUTRAL_DOMAIN missing with VERCEL_ENV=production is a problem`; worker `missingProdEnv lists NEUTRAL_DOMAIN`.
**Done when:** `pnpm --filter @cs/db exec vitest run hosts`, `pnpm --filter @cs/web exec vitest run env`, `pnpm --filter @cs/worker exec vitest run env` green; `pnpm typecheck`.

### Task 3: `senderFor` + every email path + `fromEmail` kept
**Goal:** spec sender selection with N1 audiences (P14, P15); branding save keeps a stored `fromEmail` (BACKLOG 5a T18).
**Files:** new `packages/engine/src/delivery/sender.ts` (+test), `delivery/index.ts`; `delivery/outbox.ts` (+test); `apps/worker/src/deps.ts` (+`billing-notices-senders.test.ts`); `packages/tools/src/intake/emails.ts`, `access/team-invite-email.ts` (+tests); `apps/web/src/server/tools.ts`, `apps/web/src/app/start/actions.ts` (+test); `packages/tools/src/settings.ts` (+test).
**Interfaces:**
```ts
// reuse `Audience` from delivery/contacts.ts ('client' | 'agency')
export interface SenderConfig { hostEnv: HostEnv; platformFrom: string } // platformFrom = EMAIL_FROM || briefs@<APP_URL host>
export async function senderFor(db: Conn, agencyId: string, audience: Audience, cfg: SenderConfig): Promise<{ from: string; replyTo?: string }>;
export const platformSender = (cfg: SenderConfig) => `"Rival Monday" <${cfg.platformFrom}>`;
export const mcpSignInSender = (h: HostEnv) => `"Sign in" <sign-in@mail.${h.neutralDomain}>`; // P15
// DeliveryConfig: fromAddress removed; += hostEnv: HostEnv; platformFrom: string (DeliveryConfig satisfies SenderConfig)
export function createEmailSender(opts: { transport: EmailTransport; db: Db; cfg: SenderConfig; attachment?: (n: NotificationRow) => Promise<OutgoingAttachment | null> }): ChannelSender;
// LeadEmailDeps: fromAddress → sender: SenderConfig (team invites share it)
```
**Behaviour:**
- Client: `verified` sending domain → `"<fromName>" <localPart@domain>`; else `"<fromName>" <host_slug@mail.<neutralDomain>>`; display name sanitised like `quoteName`; `replyTo` = branding `fromEmail` when set. One query (agency name/branding/slug + verified domain).
- Agency: `platformSender(cfg)`, no replyTo.
- `createEmailSender`: audience = `AGENCY_KINDS.includes(n.kind) ? 'agency' : 'client'`; `replyTo: s.replyTo ?? p.replyTo`; keeps `cc` and the brief PDF `attachment`.
- `deliveryConfigFromEnv` → null when `parseHostEnv` has no host env (worker warning names `NEUTRAL_DOMAIN`).
- Worker: `getSenders` passes `{ db, cfg }`; `sendClient` (client billing notices) uses `senderFor(…, 'client')`; `leadEmailDeps` passes `sender`; the Rival Monday-branded senders (`platformCosts`, `briefReadiness`, `spendGuard`, `billingEmail.send/sendOnboarding/sendAgencyClient`) use `platformSender` (same address as today).
- Intake (`sendLeadEmail`): `verify`/`confirmation`/`declined` to a lead with an agency → client sender of that agency; pool leads and `pool_new` → platform; `agency_new` → platform (N1). Team invite → platform (N1).
- `updateAgencyBranding`: keys absent from the input keep their stored value for `fromEmail`; an explicit `''` clears it.
- **Follow pattern:** `engine/src/delivery/contacts.ts` `replyToFor` (one-query reader).
**Tests (TDD):** `client audience uses the verified sending domain and local part`; `pending/failed/removed → <slug>@mail.<neutral>`; `client audience never uses EMAIL_FROM or the APP_URL domain` (every status); `replyTo is branding fromEmail when set`; `agency audience is the platform sender`; outbox `client kinds get the client sender, AGENCY_KINDS the platform sender`; `cc and brief attachment still reach the transport`; worker `client billing notice From is the agency sender`; intake `agency lead verify mail is From the agency sender; pool verify From the platform`; team invite `From is the platform sender`; settings `saving branding without fromEmail keeps it`, `'' clears it`.
**Done when:** `npx vitest run sender outbox` (from `packages/engine`), `pnpm --filter @cs/tools exec vitest run settings emails team-invite-email`, `pnpm --filter @cs/worker exec vitest run billing-notices deps`, `pnpm --filter @cs/web exec vitest run start/actions` green; `pnpm typecheck`.

### Task 4: `resolveHost` + async `proxy.ts` host rules
**Goal:** spec host resolution and session-free proxy rules (P4, P5, P9, R2, R6, R7).
**Files:** new `apps/web/src/server/hosts.ts` (+`hosts.test.ts`; no `server-only` import); `apps/web/src/proxy.ts`, `proxy.test.ts`.
**Interfaces:** Appendix C in full (`HostInfo`, `HostRoute`, `hostnameOf`, `resolveHost`, `clearHostCache`, `routeForHost`, `requestOriginFor`). Headers set by the proxy only: `x-rm-host-kind` (`platform|agency|mcp`), `x-rm-host-agency` (agency id or absent), `x-rm-origin`.
**Behaviour:**
- `export async function proxy(req)`: delete client-sent `x-rm-path`, `x-rm-host-kind`, `x-rm-host-agency`, `x-rm-origin`; `resolveHost(req.headers.get('host'), { env: webEnv().hostEnv, envName: activeEnvName(), lookup: (h) => agencyByHostname(dbs(envName).service, h, env) })`; `not_found` → plain `Not found` 404 + `no-store`; `redirect` → 307 + `no-store`; then set the three headers (origin from `requestOriginFor`) and run today's `PUBLIC` list, `NO_REFERRER` and session-cookie check unchanged (its sign-in redirect stays relative = same host).
- `PLATFORM_HOST_DENY` stays `null` here; Task 8 sets it.
- **Follow pattern:** the current `proxy.ts` (header hygiene comment, `PUBLIC`).
**Tests (TDD)** `hosts.test.ts`: `platform, mcp, fallback agency, live custom, unknown`; `VERCEL_URL host is platform`; `staging: <slug>.staging.rivalmonday.app is agency, staging.rivalmonday.app is platform, mcp.staging.rivalmonday.app is mcp`; `cache hit within 60 s skips lookup, refreshes after`; `negative result cached`; `cache never exceeds 2000 entries`; `hostnameOf strips port and trailing dot, rejects junk`; `unknown host → not_found except /health`; `mcp host allows only its paths`; `agency host denies /mcp, /sign-up, /join, /u/x, /bot, /api/stripe/webhook, /api/postmark/webhook, /api/waitlist, /api/site-status, /waitlist/confirm/x, /sample/x, /start`; `agency host allows /start/acme, /start/v/x, /start/verify/x, /api/ask/turn, /files/evidence/c/e, /c/x/setup`; `agency host redirects /agency/x?y and /onboarding/steps to the platform, but not /onboarding/client-done.webp`; `another agency's logo → not_found, own logo → next, /files/logo/clients/x/y → next`; `non-canonical GET → canonical origin, POST → next`. `proxy.test.ts`: `client-sent x-rm-host-* are replaced`; `404 for unknown host carries no-store`; `redirect is 307 + no-store`; existing cases pass on the platform host.
**Done when:** `pnpm --filter @cs/web exec vitest run hosts proxy` green; `pnpm typecheck`.

### Task 5: Better Auth per origin + host branding on auth pages
**Goal:** one Better Auth instance per origin (P6), magic links on the request origin, host-aware auth branding (BACKLOG phase-11 "sign-in page uses host default branding").
**Files:** `apps/web/src/server/auth.ts`, `auth-options.ts` (+tests), new `server/request-host.ts`; `server/branding.ts` (`authBranding`), `server/theme.ts` (`themeForViewer`); the 12 `auth` importers (Task 0 list: `server/current-viewer.ts`, `server/mcp.ts`, `app/(app)/actions.ts`, `app/.well-known/oauth-authorization-server/[[...path]]/route.ts`, `app/api/auth/[...all]/route.ts`, `app/l/[token]/route.ts`, `app/oauth/consent/actions.ts`, `app/onboarding/start/route.ts`, `app/sign-in/check-email/actions.ts`, `app/sign-up/actions.ts`, `app/support/end/route.ts`, `dev-panel/handlers.ts`) + their test mocks; `authBranding` callers (`sign-in`, `sign-in/check-email`, `link-expired`, `link-other-account`, `no-access`, `oauth/consent` pages); `app/sign-in/page.tsx` (`googleEnabled` only on platform).
**Interfaces:** Appendix D in full (`RequestHost`, `requestHost`, `authFor`, `requestAuth`, `platformAuth`, `mcpAuth`, `buildAuthOptions` host rules). `authBranding(service, env, hint, host: HostInfo): Promise<Branding | null>` — agency host → that agency's branding (hint ignored); mcp → `null` (neutral); platform → today's behaviour. `NEUTRAL_APP_NAME = 'Connect'` (decided).
**Behaviour:**
- Magic-link email: platform → `platformSender` + `defaultBranding`; agency → `senderFor(service, agencyId, 'client', cfg)` + that agency's branding (logo rehosted, P9); mcp → `mcpSignInSender` + neutral branding (`resolveBranding(NEUTRAL_APP_NAME, null)`).
- `themeForViewer(null | member-less)`: agency host → host agency's branding via `agencyBrandingOf`; else today's `defaultBranding`.
- Call sites: request-scoped → `requestAuth()`; `.well-known` AS metadata + consent action → `mcpAuth()`; dev panel, sign-up, onboarding start → `platformAuth()`. `auth` export removed. `instrumentPgPool` stays under `PROFILE_TOOLS`.
- **Follow pattern:** existing `perEnv` instance cache in `server/auth.ts`.
**Tests (TDD):** `baseURL and trustedOrigins equal the host origin`; `cookies carry no Domain attribute` (sign-in response `Set-Cookie`); `magic link URL uses the request origin` (agency → `http://<slug>.localhost:<port>/api/auth/magic-link/verify…`); `oauth plugin endpoints exist only on the mcp instance` (`/api/auth/oauth2/register` 404 on platform); `Google provider only on platform`; `authFor refuses an origin the proxy did not set`; `one instance per origin, one pool per env`; `agency sign-in email is From the agency sender with its branding`; `mcp sign-in email From sign-in@mail.<neutral>, neutral branding`; `authBranding on an agency host ignores a hint for another agency`; `authBranding is null on the mcp host`; `themeForViewer(null) on an agency host uses that agency`. Existing `oauth-consent`, `mcp`, `auth-options` tests pass against `mcpAuth()`.
**Done when:** `pnpm --filter @cs/web exec vitest run auth auth-options oauth-consent mcp current-viewer branding theme sign-in` green; `pnpm typecheck`.

### Task 6: Host-scoped viewers, redirects and host-agency checks
**Goal:** spec session-dependent host rules (P5, P7, N3–N5).
**Files:** new `apps/web/src/server/host-viewer.ts` (+test); `server/viewer.ts`, `server/current-viewer.ts` (+tests); routes building on `env.appUrl`: `app/l/[token]/route.ts`, `app/go/[target]/[id]/route.ts`, `app/onboarding/start/route.ts`, `app/start/verify/[token]/route.ts`, `app/support/{end,exit}/route.ts` → `requestHost().origin`; host-agency checks: `app/files/logo/clients/[clientId]/[file]/route.ts`, `app/start/[slug]/page.tsx`, `app/start/v/[leadId]/*`, `app/start/verify/[token]/route.ts`.
**Interfaces:** Appendix E in full (`HostDecision`, `NO_PLATFORM_BOUNCE`, `platformBounceTarget`, `decideHost`).
**Behaviour:**
- `resolveViewer` gains `host: RequestHost`, `path`, `bounce` inputs; memberships are filtered by `decideHost` before `pickMembership` and the client hint; none left → `member-less` (agency host `/no-access` stays on that host). `viewerWith` computes `platformBounceTarget` first and only then reads `isOperator` (`platformRoleForUser(…) !== null`) and `clientOriginFor(target.agencyId)` (N5). Applies in all modes; `operator` mode off the platform host → null.
- Guest cookie: accepted only on agency hosts and only when `claims.agencyId === host agencyId`; `rm_support` read only on the platform host.
- `mode='page'`: `redirect` decision → `redirect(to)`; `mode='api'`: treated as no viewer.
- `/l/<token>` on the platform host: valid token of a client contact → 307 + `no-store` to `clientOriginFor(agency)/l/<token>` (no cookie set); on an agency host, a token of another agency → `/link-expired`.
- Host-agency checks (N3) read `x-rm-host-agency` via `requestHost()`: on an agency host the object's agency must match, else 404 (`/start/verify` → its usual invalid-token page). Platform host unchanged.
- **Follow pattern:** `resolveSupportViewer` (pure resolution + tests).
**Tests (TDD):** `staff on agency host → platform same path`; `client of host agency → only that membership`; `staff + client of host agency → client membership, no bounce`; `client of another agency only → member-less`; `client-only on platform → picked membership's client origin`; `mixed staff + client on platform → allow`; `operator with only client roles stays`; `decideHost never targets the current origin`; `sign-in, start, sample, waitlist paths never bounce`; `platformBounceTarget null on agency/mcp hosts` (no operator/origin reads: spy); viewer `guest cookie of another agency → null`, `guest cookie ignored on platform`, `support cookie ignored on agency host`; routes `/l token of a client contact on the platform → 307 to the agency host with no-store`, `/l token of another agency on an agency host → link-expired`, `agency staff token stays on the platform`; `client logo of another agency → 404`; `/start/<other agency slug> → 404`.
**Done when:** `pnpm --filter @cs/web exec vitest run host-viewer viewer current-viewer links logo start` green; `pnpm typecheck`.

### Task 7: `clientOriginFor` at every client-facing URL
**Goal:** spec "outbox links, invites, magic links, PDFs, logo and rank-map URLs, guest links" on the client origin; agency-facing keeps `APP_URL` (P8, P9).
**Files and call sites (verified 2026-11-14):**
- `packages/engine/src/delivery/outbox.ts`: `personalLink`/`notify` — client audience base `clientOriginFor(conn, agencyId, cfg.hostEnv)`; agency audience and `plainLink` keep `cfg.appUrl`. `loadBranding(db, agencyId, opts?: { origin?: string })` rehosts the logo; client-audience callers (`alerts/route.ts`, `alerts/digest.ts`, `briefs/deliver.ts`, `briefs/notify.ts`, `reports/quarterly.ts`) pass the client origin. PDF logo rehost skipped (renderer-internal `allowUrls`).
- `packages/tools/src/access/client-invite.ts` `startUrl`; `setup/review-email.ts` `reviewUrl`; `intake/emails.ts` `verifyUrl` (lead with an agency) → client origin.
- New `packages/tools/src/link-base.ts` `linkBase(deps: ToolDeps, ctx: AccessContext): Promise<string | undefined>` (client roles → `clientOriginFor`, agency roles → `deps.appUrl`; `deps.hostEnv` absent → `deps.appUrl`); replaces `appLinkFor(deps.appUrl, …)` in `search/fetch-item.ts` and `tools/{add-recommendation,ads,alerts,briefs,clients,competitors,events,moves,recommendations,reputation,search}.ts`. `ToolDeps` += `hostEnv?: HostEnv` (web `server/tools.ts` sets it). Rank-map URL is relative — unchanged.
- `tools/client-billing.ts` `checkoutFor` success/cancel and `my-billing.ts` portal `returnUrl` → client origin; `billingUrl` (agency pages) and `platform-billing.ts` keep `APP_URL`.
- `apps/worker/src/jobs/billing-notices.ts` client `actionUrl` → client origin.
- `tools/client-details.ts` stored logo URL stays on `APP_URL`; client-facing renders rehost (`rehostLogoUrl`).
- `apps/web/src/app/(app)/agency/settings/team/actions.ts` `signInHint`: client-role invite → `${clientOrigin}/sign-in`, agency role → `APP_URL`.
- `apps/web/src/server/inbox.ts` `internalLink(link, origins: string[])` accepts the request origin and `APP_URL`; `app/(app)/inbox/actions.ts`.
- `server/theme.ts`, `components/shell/app-shell.tsx`: logos rehosted to the request origin on agency hosts.
- `packages/demo/src/cli/links.ts` (+`reset.ts` printout): client-contact links on the demo agency's client origin.
- Unchanged by design: `platform/costs/*`, `agency-onboarding.ts` logo storage URL, `support/*`, `u/[token]`, `branding/logo` upload origin check, `team-invite-email.ts` (staff, `APP_URL`).
**Behaviour:** `clientOriginFor` failure throws → the enclosing transaction rolls back (no stray outbox row). **Follow pattern:** `personalLink`.
**Tests (TDD):** outbox `notify builds client links on the custom host, agency links on APP_URL` (+ fallback host before live); `webhook links stay on APP_URL`; `client email logo is rehosted`; tools `client-role MCP url is on the client origin, agency-role on APP_URL` (`list_briefs`, `fetch`); `checkout success URL on the client origin`; `portal return URL on the client origin`; `client invite startUrl and review URL on the client origin`; `agency lead verifyUrl on the client origin, pool lead on APP_URL`; worker `client billing notice actionUrl on the client origin`; inbox `internalLink accepts a client-origin link, rejects a foreign host`; demo `client links use the slug host`.
**Done when:** `npx vitest run outbox route digest deliver notify quarterly` (engine), `pnpm --filter @cs/tools exec vitest run fetch briefs client-billing my-billing client-invite review-email emails link-base`, `pnpm --filter @cs/worker exec vitest run billing-notices`, `pnpm --filter @cs/web exec vitest run inbox team`, `npx vitest run links` (demo) green; `pnpm typecheck`.

### Task 8: MCP on `mcp.<NEUTRAL_DOMAIN>`
**Goal:** spec MCP section without the cutover notice (R9 → Task 14).
**Files:** `apps/web/src/server/mcp.ts`, `server/oauth-consent.ts` (`createVerifyOAuth` resource), `server/hosts.ts` (`PLATFORM_HOST_DENY`), `app/mcp/route.ts`, `app/.well-known/oauth-protected-resource/[[...path]]/route.ts`, `app/.well-known/oauth-authorization-server/[[...path]]/route.ts`, `app/oauth/consent/{page.tsx,actions.ts}`, `app/(app)/agency/settings/ai/page.tsx`, `app/(app)/c/[clientId]/settings/ai/page.tsx` (+tests).
**Interfaces:** `McpHandlerDeps.appUrl` = `mcpOrigin(hostEnv)`; `createVerifyOAuth({ context: () => mcpAuth(name).$context, service, appUrl: mcpOrigin(hostEnv) })`; `PLATFORM_HOST_DENY = /^\/(?:mcp|oauth|\.well-known)(?:\/|$)/`.
**Behaviour:**
- `/mcp` is served on the mcp host only (agency hosts deny it, Task 4; platform 404 via `PLATFORM_HOST_DENY`). PATs unchanged (work on the new URL). OAuth tokens minted for the old `${APP_URL}/mcp` audience are refused (fresh consent on the mcp host).
- Protected-resource metadata: `resource` `${mcpOrigin}/mcp`, `authorization_servers` `[${mcpOrigin}/api/auth]`, **no `resource_name`**. AS metadata from `mcpAuth()`.
- Consent page: sign-in on the mcp host; neutral `AuthCard` before sign-in; after sign-in agency-branded when every option belongs to one agency, else neutral (existing `authBranding` hint, host `mcp` → only the hint path). `pluginConsent` posts to `${mcpOrigin}/api/auth/oauth2/consent` via `mcpAuth()` with `origin: mcpOrigin`.
- AI connection pages: `ConnectorUrlCard url={`${mcpOrigin(env.hostEnv)}/mcp`}`; `mcpServerName(displayName)` unchanged (15a; `connectorSlug` from the old plan dropped).
- **Follow pattern:** existing `.well-known` routes.
**Tests (TDD):** `platform /mcp is 404`; `agency host /mcp is 404`; `protected-resource metadata names the mcp origin and has no resource_name`; `verifyOAuth rejects a token whose aud is the old resource`; `PAT works on the mcp host`; `consent page is neutral before sign-in and agency-branded for one agency`; `connector URL on both AI pages is the mcp origin`.
**Done when:** `pnpm --filter @cs/web exec vitest run mcp oauth-consent consent ai-connections hosts` and `pnpm --filter @cs/mcp test` green; `pnpm typecheck`.

### Task 9: Vendor wrappers, fakes, hostname rules
**Goal:** spec `VercelDomains`, `PostmarkDomains` with fakes (P11/R8, P13, N6); hostname validation.
**Files:** new `packages/tools/src/domains/{hostname,vercel,postmark,fakes,vendors}.ts` (+tests); `packages/core/src/server/token-bucket.ts` (`VendorKey` += `'vercel' | 'postmark'`, limits `{ concurrent: 2 }`).
**Interfaces:**
```ts
export interface VercelDomainState { verified: boolean; misconfigured: boolean; records: DnsRecord[]; message: string | null }
export interface VercelDomains { add(hostname: string): Promise<VercelDomainState>; remove(hostname: string): Promise<void>; status(hostname: string): Promise<VercelDomainState> }
export interface PostmarkDomainState { id: number; dkim: { host: string; value: string; verified: boolean }; returnPath: { host: string; value: string; verified: boolean } }
export interface PostmarkDomains { create(domain: string): Promise<PostmarkDomainState>; verifyDkim(id: number): Promise<PostmarkDomainState>; verifyReturnPath(id: number): Promise<PostmarkDomainState>; remove(id: number): Promise<void> }
export function createVercelDomains(o: { token: string; projectId: string; teamId?: string; fetch?: TimedFetch }): VercelDomains;
export function createPostmarkDomains(o: { token: string; fetch?: TimedFetch }): PostmarkDomains;
export function domainVendorsFor(env: NodeJS.ProcessEnv, envName: EnvName, opts?: { allowFakeFlag?: boolean }): { vercel: VercelDomains | null; postmark: PostmarkDomains | null; fake: boolean };
export class DomainVendorError extends Error { constructor(public code: 'in_use' | 'invalid' | 'unavailable', message: string) }
```
Hostname rules: Appendix F in full.
**Behaviour:**
- `domainVendorsFor`: fakes when `envName` is `demo`/`test`, `VITEST`/`NODE_ENV=test`, or `DOMAINS_FAKE_VENDORS === '1'` with `allowFakeFlag !== false`; else real when the tokens (+ `VERCEL_PROJECT_ID`) are set; else nulls. Web env reports a problem when `DOMAINS_FAKE_VENDORS` is set with any `VERCEL_ENV` (R8, like `BILLING_FAKE_GATEWAY`).
- Fetch wrappers pass `timeoutMs: 10_000`; Vercel `409`/`domain_already_in_use` → `in_use`; verification records → `DnsRecord`s (CNAME target + any TXT); `status` = project-domain `verified` ∧ config `misconfigured`. Postmark create uses `ReturnPathDomain: pm-bounces.<domain>`, prefers `DKIMPending*` when present. Errors via `redactForLog`; never a token or URL query.
- Fakes: in-memory per process; `failNext(code)`, `setVerified(hostname | id)`; fake `add` returns a CNAME to `cname.vercel-dns.com.`.
- **Follow pattern:** `packages/billing/src/fake-gateway.ts` + `gateway.ts` (`gatewayMode`), `packages/collectors/src/vendors/meta-search.ts` (fetch).
**Tests (TDD):** `intel.agency.com ok; agency.com → apex; foo.<neutral>, x.rivalmonday.app, x.staging.rivalmonday.app → reserved; IDN normalised; trailing dot stripped; bad label → invalid`; `sending domain: apex ok, neutral and rivalmonday refused`; vercel `add maps records`, `409 → in_use`, `status combines verified + misconfigured`, `error text has no token`; postmark `create maps pending DKIM`, `verify flips flags`; vendors `fakes for test env and the E2E flag`, `allowFakeFlag false ignores the flag`, `null without tokens`; web env `DOMAINS_FAKE_VENDORS with VERCEL_ENV=preview is a problem`.
**Done when:** `pnpm --filter @cs/tools exec vitest run hostname vercel postmark vendors`, `pnpm --filter @cs/core exec vitest run token-bucket`, `pnpm --filter @cs/web exec vitest run env` green; `pnpm typecheck`.

### Task 10: Domain tools + operator slug tool
**Goal:** spec domain tools via `runTool` (audited) and the console `host_slug` change.
**Files:** new `packages/tools/src/tools/domains.ts` (+test); `tools/platform-agency.ts` (+test), `tools/platform-console.ts` (`get_platform_agency` output += `hostSlug`); `deps.ts` (`domains?: { vercel; postmark } `, `hostEnv?`; `QueueJob` += `'domain-verify' | 'sender-verify'`); `tools/all.ts`, `tools/schemas.ts`, `access-marks.test.ts` (+snapshot), `isolation/fixtures.ts`; 8b access doc; `apps/web/src/server/tools.ts` (wire `domains`, `hostEnv`).
**Interfaces:** `get_agency_domains {}` (read, agency admin, web only) → spec output exactly; `set_custom_domain { hostname: z.string().trim().max(253) }` → `{ ok: true }`; `remove_custom_domain {}`; `set_sending_domain { domain: z.string().trim().max(253), localPart?: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,39}$/) }`; `remove_sending_domain {}` — all `access: 'write'`, `permission: 'agency'`, `requireAdmin(ctx)`. `platform_set_agency_host_slug { agencyId: Id, hostSlug: z.string().trim().toLowerCase() }` → `{ hostSlug }`, `operate(deps, ctx, 'owner', …)`, `audit: 'skip-web'`.
**Behaviour:**
- `set_custom_domain`: `customHostnameProblem` → copy; a non-removed row for this agency → refuse; hostname active elsewhere (or Vercel `in_use`) → in-use copy; insert `pending` via service (unique violation → in-use), then `vercel.add` → `dns_records`; vendor failure deletes the row and refuses; enqueue `domain-verify { domainId }`, singleton `domain:<id>`.
- `remove_custom_domain`: `vercel.remove` (404 ignored) then `status 'removed'`, `removed_at`. Sending: same shape over Postmark (store DKIM/Return-Path, enqueue `sender-verify` singleton `sender:<id>`; remove → `postmark.remove` + `removed`, fallback sender immediately).
- Vendors null → refuse (not configured). Refusals `ToolError('invalid_input', msg, { userFacing: true })`. Held agencies are refused by `billingWriteGuard` (not on the allow-list).
- Slug tool: `HOST_SLUG_RE` + `RESERVED_HOST_SLUGS` → invalid; unique violation → taken. Old slug host keeps resolving ≤ 60 s (cache) — accepted.
- `ISOLATION_FIXTURES`: the five agency tools `kind: 'agency'` (inputs: hostname `intel.iso-world.test`, domain `iso-world.test`); slug tool `kind: 'platform'`, input `{ agencyId: w.ids.agencyB, hostSlug: 'iso-b-renamed' }`.
- **Follow pattern:** `tools/client-billing.ts` (`refuse`, service writes), `tools/platform-agency.ts` `platformRenameAgencyTool`.
**Copy (decided):** apex "Use a subdomain such as intel.youragency.com."; in use "This domain is already in use."; invalid "Enter a domain such as intel.youragency.com."; reserved "That domain can't be used."; one at a time "Remove the current domain first."; not configured "Custom domains are not set up on this server yet."; slug taken "That address is taken."
**Proposed copy:** sending invalid "Enter a domain such as youragency.com."; local part invalid "Use lower-case letters, digits, dots, hyphens or underscores."; slug invalid "Use 3–40 lower-case letters, digits or hyphens."
**Tests (TDD):** `get_agency_domains returns fallbackHost and nulls`; `account_manager and client roles cannot call the writes (not_found)`; `set stores Vercel records, pending, enqueues one verify job`; `apex refused with decided copy`; `live for another agency → in use`; `Vercel in_use → in use, no row left`; `second set while pending → refused`; `remove calls Vercel and marks removed; a new set then works`; `sending create/remove`; `localPart default briefs`; `vendors null → not configured`; `held agency → service_paused`; slug `operator owner changes it`, `staff/non-operator → not_found`, `taken → copy`, `reserved → invalid`; access-marks snapshot; isolation suite.
**Done when:** `pnpm --filter @cs/tools exec vitest run domains platform-agency platform-console access-marks channels isolation` green; `pnpm typecheck`.

### Task 11: Worker `domain-verify` / `sender-verify` + notice email
**Goal:** spec jobs (P10, P12, P13) with the SSRF-guarded certificate probe.
**Files:** new tools `src/domains/verify.ts`, worker `src/jobs/domains.ts`, email `src/templates/agency-domain-notice.tsx` (each +test); worker `src/{deps.ts,job-list.ts}`; email `src/{types,render,previews}.ts`.
**Interfaces:**
```ts
export const DOMAIN_VERIFY_SECONDS = 600; export const SENDER_VERIFY_SECONDS = 900; export const VERIFY_WINDOW_HOURS = 72;
export type DomainNotice = { agencyId: string; kind: 'domain_live' | 'domain_failed' | 'sender_verified' | 'sender_failed'; name: string; error?: string };
export async function verifyAgencyDomain(d: { service: Db; vercel: VercelDomains; probe: (hostname: string) => Promise<boolean>; notify: (n: DomainNotice) => Promise<void> }, domainId: string, now: Date): Promise<'again' | 'done'>;
export async function verifySendingDomain(d: { service: Db; postmark: PostmarkDomains; resolveTxt: (name: string) => Promise<string[][]>; notify: (n: DomainNotice) => Promise<void> }, id: string, now: Date): Promise<'again' | 'done'>;
// email: { template: 'agency_domain_notice'; props: { branding: Branding; kind: DomainNotice['kind']; name: string; settingsUrl: string; error?: string } }
```
**Behaviour:**
- Domain: only `pending`/`verifying` rows; `vercel.status` outside a tx; conditional update (`… AND status IN ('pending','verifying')`): records + `last_checked_at`; verified ∧ ¬misconfigured → `verifying`; `probe` ok → `live`, `live_at`, `domain_live`; past `created_at + 72 h` → `failed` (Vercel's message or the timeout copy), `domain_failed`. `again` while non-terminal.
- Probe: `assertPublicUrl('https://<hostname>/health')` (worker lookup) then `fetch` `redirect: 'manual'`, 10 s; 2xx = ok (Node checks the cert); blocked = not ok.
- Sender: `verifyDkim` + `verifyReturnPath`; both → `verified`, `verified_at`, `dmarc_ok` = a TXT at `_dmarc.<domain>` starting `v=DMARC1` (lookup failure → false, never blocks), `sender_verified`; 72 h → `failed`, `sender_failed`.
- Jobs `domain-verify { domainId }`, `sender-verify { sendingDomainId }` (`short`, retryLimit 2); `again` → re-enqueue with `startAfter` + same singleton key; vendors null → log + done. Vendors: `domainVendorsFor(env, envName, { allowFakeFlag: false })` over `limiter.limitedFetch('vercel'|'postmark')`.
- `notify` → `deps.domainEmail`: `agency_domain_notice` (Rival Monday branding, `platformSender`, `settingsUrl` `${APP_URL}/agency/settings/domains`) to active agency-admin contacts; failures logged, never thrown. One preview per kind in `previews.ts`.
- **Follow pattern:** worker `jobs/web.ts` (self re-enqueue), `jobs/billing-notices.ts` (recipients), email `templates/billing-notice.tsx`.
**Copy (decided):** subjects `Your domain {name} is live` / `We couldn't verify {name}` / `Email from {name} is ready` / `We couldn't verify email for {name}`; bodies "Client links now use {name}." / "{error} Check the DNS records on the Domains page and try again." / "Client emails now come from {name}." / same failure line; timeout error "We couldn't verify this domain within 72 hours."; action label `Open Domains`.
**Tests (TDD):** `pending + unverified → again, records updated`; `verified + probe fails → verifying, again`; `probe ok → live, one notice`; `live row re-run → done, no notice`; `72 h → failed with Vercel message`; `removed meanwhile → done, no write`; `probe refuses a hostname resolving to 10.0.0.1`; sender `both verified → verified + dmarc_ok true`, `no DMARC → dmarc_ok false, still verified`, `72 h → failed`; worker `again re-enqueues with startAfter 600 and the singleton`; template `renders each kind, Rival Monday branded`; previews exhaustiveness.
**Done when:** `pnpm --filter @cs/tools exec vitest run verify`, `pnpm --filter @cs/worker exec vitest run domains job-list concurrency`, `pnpm --filter @cs/email exec vitest run agency-domain-notice render previews jsx-pragma` green; `pnpm typecheck`.

### Task 12: Domains page + console slug control
**Goal:** agency-admin UI for both domains in every state; operator slug edit.
**Files:** new `apps/web/src/app/(app)/agency/settings/domains/{page.tsx,actions.ts}` (+tests), `src/components/agency/{domain-panel,sending-panel}.tsx` (+tests); `components/shell/nav-items.ts` (`agencySettings` › Integrations: `add('/agency/settings/domains', 'Domains', 'domains')` when `adminUser`), `components/shell/nav-link.tsx` (icon `domains: Globe2`); `lib/labels.ts` (`AGENCY_DOMAIN_STATUS`, `SENDING_DOMAIN_STATUS`); `help/copy/agency.ts` (`PAGE_COPY['agency.settings.domains']` + tips); new `docs/help/pages/agency.settings.domains.agency.md`; `app/page-titles.test.ts`; `(platform)/platform/agencies/[id]/{page.tsx,actions.ts,manage-menu.tsx}`; `scripts/e2e-affected-rules.ts` (`@domains`, `@hosts` + rules for every new web file).
**Behaviour:**
- Page (admin and `viewer.kind === 'user'`, else 404 like Intake link): `callTool('get_agency_domains')`; `PageHeader` title `Domains`, breadcrumb `Agency settings › Domains`, help key `page:agency.settings.domains`, guide. Custom panel: none → hostname field + Save; `pending`/`verifying` → DNS table (type/name/value + `CopyButton`) + status chip; `live` → hostname + live date (viewer tz); `failed` → error + "Remove and try again"; Remove via `ConfirmForm` with the warning. Fallback line always shown.
- Sending panel: domain + local-part fields; DKIM/Return-Path table; `verified` ∧ `dmarcOk === false` → warning (never blocks); From line shows the current address (fallback until verified).
- Sections before cards (design system v1), fixed chip tints, 36 px controls, results hoisted to always-mounted regions, controlled fields + `onReset` prevent, `WriteGuard`.
- Console: agency detail shows `hostSlug`; owner-only menu item opens a form → `runTool(…, 'platform_set_agency_host_slug')`.
- **Follow pattern:** `(app)/agency/settings/intake/page.tsx` + `components/agency/intake-link-card.tsx`; console `renameAgencyAction` + `manage-menu.tsx`.
**Copy (decided):** title/nav `Domains`; sections `Web address`, `Email sending`; help "Add a CNAME record at your DNS provider. We check every 10 minutes for up to 72 hours."; statuses `Waiting for DNS`, `Checking certificate`, `Live`, `Failed`; "Remove and try again"; remove warning "Links in emails already sent to clients will stop working."; DMARC warning "Add a DMARC record for {domain} so inboxes trust these emails."; "Until then, clients use {fallbackHost}."; "Client emails come from {address}."
**Proposed copy:** page description "Give clients your own web address and email domain. Until they are ready, clients use {fallbackHost}."; field labels `Domain`, `Email domain`, `Address name`; sending status `Verified` (pending → `Waiting for DNS`, failed → `Failed`); console item `Change web address`, field `Web address name`, result "Web address changed."; the help guide text.
**Tests (TDD):** `renders each custom-domain state's copy and records`; `remove confirm shows the warning`; `sending panel shows DMARC warning only when verified and not ok`; `actions map refusals to their copy`; `nav shows Domains to admins only, not in support`; `page 404 for account_manager and in support`; `read-only-guard covers the new controls`; `page-titles`; help `coverage`/`copy`; console `owner sees Change web address, staff does not`.
**Done when:** `pnpm --filter @cs/web exec vitest run domains nav-items read-only-guard agencies page-titles help labels client-boundary page-gates` and `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` green; `pnpm typecheck`.

### Task 13: E2E — hosts, domains, MCP host
**Goal:** spec E2E for 13a1 and the existing specs that sign in client users on the platform host.
**Files:** `apps/web/playwright.config.ts` (`NEUTRAL_DOMAIN: 'localhost'`, `DOMAINS_FAKE_VENDORS: '1'`, `HOSTS_FIXTURE_FILE`); `e2e/helpers.ts` (`agencyOrigin(slug)`, `MCP_ORIGIN`, `hostRequest(host, path, init)` = Node `http.request` to `127.0.0.1:${E2E_PORT}` with `Host`, all from `E2E_PORT`); `e2e/seed.ts` (write `HOSTS_FIXTURE_FILE`: E2E Agency slug, another agency's client id + slug); new `e2e/hosts.spec.ts`, `e2e/domains.spec.ts`; update `e2e/ai-connections.spec.ts` (connector URL; OAuth via `hostRequest` on the mcp host), `e2e/smoke.spec.ts` (owner link lands on the agency host), every spec signing a client user in on the platform host (Grep `signIn(`/`requestMagicLink(` with client emails).
**Behaviour:** at most one new magic-link sign-in: `mcp-owner@e2e.test` on the agency host once, saved as `agency-client-state.json`; cross-host cases copy session cookies into a new context for the other host (same secret) instead of signing in again.
**Tests (E2E, tags `@hosts`/`@domains`/`@ai-connections`):** `client signs in on the agency host and sees their client`; `agency admin session on the agency host is redirected to the platform`; `client-only session on the platform is redirected to the agency host`; `other agency's client on the agency host → 404`; `unknown host → 404` (`hostRequest`); `agency host /agency → platform`; `agency host /start → 404, /start/<own slug> → 200`; `domains page: set → pending with records, (DB) live → live, remove → fallback`; `sending: set → records, (DB) verified → From shows the domain`; `MCP: PAT works on the mcp host; platform /mcp is 404`.
**Done when:** `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` green; the new specs pass with `E2E_SKIP_BUILD=1 pnpm --filter @cs/web exec playwright test hosts domains ai-connections` after one build (no concurrent test run on `cs_phase_13a_test`).

### Task 14: MCP cutover notice (R9 — separable, droppable at merge)
**Goal:** P16's moved error and reconnect notice, isolated so `/rm-merge` can drop it if 13a1 reaches prod with or before the first live deploy.
**Rules:** own commits (`feat(13a1-cutover): …`), touches only the files below; nothing in Tasks 0–13 imports it. Dropping = revert these commits; Task 8 behaviour (platform `/mcp` 404) remains.
**Files:** new `apps/web/src/server/mcp-cutover.ts` (+test); `app/mcp/route.ts`, `server/hosts.ts` (`PLATFORM_HOST_DENY` lets `/mcp` through until `MCP_MOVED_UNTIL`), `components/ai-connections.tsx` + both AI settings pages (notice); `e2e/ai-connections.spec.ts` (one test tagged `@ai-connections`).
**Interfaces:** `MCP_HOST_CUTOVER: string` (ISO date, set at merge), `MCP_MOVED_UNTIL: string` (+90 days); `movedResponse(req: Request, mcpUrl: string): Promise<Response>` = HTTP 200 JSON `{"jsonrpc":"2.0","id":<request id or null>,"error":{"code":-32000,"message":"This connector moved to <mcpUrl>"}}`; `hasPreCutoverOAuth(service: Db, userId: string): Promise<boolean>` (active `oauth_grant_binding` created before `MCP_HOST_CUTOVER`).
**Behaviour:** platform `/mcp` POST before `MCP_MOVED_UNTIL` → `movedResponse`, after → 404; the reconnect notice shows on the AI pages while `hasPreCutoverOAuth`.
**Copy (decided):** "This connector moved to https://mcp.<NEUTRAL_DOMAIN>/mcp"; "Your AI connector has a new address. Remove the old connector in your AI app, then add it again with the address above."
**Tests (TDD):** `platform /mcp returns the moved JSON-RPC error with the request id`; `after MCP_MOVED_UNTIL platform /mcp is 404`; `notice only with a pre-cutover binding`; E2E `platform /mcp shows the moved message`.
**Done when:** `pnpm --filter @cs/web exec vitest run mcp-cutover mcp hosts ai-connections` green; `pnpm typecheck`.

### Task 15: Docs, launch gate, final review, merge gate
**Files:** `docs/work/phase-13a.md`; `docs/help/pages/*` via `kb:seed`; `docs/copy/signoff.json` (owner signs).
**Behaviour:**
- Work file: Status/Next overwritten; Interfaces lists 0111/0112, `HostEnv`/`parseHostEnv`/`clientOriginFor`/`senderFor`, tools, jobs, routes, env; Owner verification steps: env on Vercel web (prod + staging) and Railway worker; `<slug>.<NEUTRAL_DOMAIN>` (and `<slug>.staging.rivalmonday.app`) as a client; a real custom subdomain goes live; a sending domain verifies and a brief arrives From it; Claude connects on `mcp.<neutral>`; old URL behaviour per the R9 decision. Merge notes: R2 cache recorded under Launch gate; BACKLOG closures — custom/sending domains (4b, 5a), connector name (6a part), `fromEmail` drop (5a T18), sign-in host branding (phase-11), l.162 From (N1). R9: decide keep/drop Task 14; if kept set `MCP_HOST_CUTOVER`.
- Launch gate: `bash apps/web/scripts/profile-gate.sh --seed` (platform host); then an agency-host pass of the client pages with a client cookie: `profile:pages --base http://e2e-agency.localhost:3100 --cookie <client-cookie> --filter '/c/' --params-from-seed --strict-routes --assert-db-stages 8` (record the command used in the work file). Not alongside an E2E run.
- `pnpm copy:status` lists the new strings; owner signs in `pnpm copy:review` (in this worktree); `pnpm kb:seed` (test DB) for the new guide.
- Launch-gate command: `pnpm --filter @cs/web profile:pages …` (server started by hand as in `profile-gate.sh`).
- [ ] **Final review (top model):** `pnpm test:affected`, `pnpm --filter @cs/web e2e:affected` (background, one at a time); check Review focus 1–5 against their tests; one fix wave. `/rm-merge` **only with the owner's go-ahead**.
**Done when:** work file ≤ 12 KB; `git ls-files --eol | grep crlf` prints nothing; profile gate green.

---

## Appendix A — Migrations (full SQL)

**§ 0111** (replaces the generated `agency` lines; keep the generated `agency_domain`/`agency_sending_domain` SQL):
```sql
ALTER TABLE "agency" ADD COLUMN "host_slug" text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION agency_host_slug_for(p_name text, p_self uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  reserved constant text[] := ARRAY['www','mcp','mail','app','api','admin','support'];
  base text; candidate text; intake text; n int := 1;
BEGIN
  -- R4: the agency's intake slug (same regex, already public) when it is free and not reserved.
  IF p_self IS NOT NULL THEN
    SELECT slug INTO intake FROM intake_link WHERE agency_id = p_self;
    IF intake IS NOT NULL AND NOT (intake = ANY (reserved))
       AND NOT EXISTS (SELECT 1 FROM agency WHERE host_slug = intake AND id <> p_self) THEN
      RETURN intake;
    END IF;
  END IF;
  -- Else the name, as `slugBase` (@cs/tools tools/leads.ts) builds an intake slug.
  base := lower(regexp_replace(normalize(coalesce(p_name, ''), NFKD), '[̀-ͯ]', '', 'g'));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  base := regexp_replace(left(base, 40), '-+$', '');
  IF base = '' THEN base := 'agency';
  ELSIF length(base) < 3 OR base = ANY (reserved) THEN base := base || '-agency';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM agency WHERE host_slug = candidate AND (p_self IS NULL OR id <> p_self)) LOOP
    n := n + 1;
    candidate := regexp_replace(left(base, 39 - length(n::text)), '-+$', '') || '-' || n;
  END LOOP;
  RETURN candidate;
END $$;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
  -- Agencies with an intake link first, so a name-derived slug never takes an intake slug (R4).
  FOR r IN SELECT a.id, a.name FROM agency a
           ORDER BY (EXISTS (SELECT 1 FROM intake_link i WHERE i.agency_id = a.id)) DESC, a.created_at, a.id LOOP
    UPDATE agency SET host_slug = agency_host_slug_for(r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION agency_host_slug_fill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.host_slug IS NULL THEN
    -- Serialises concurrent sign-ups with the same name; each query in the VOLATILE function sees committed rows.
    PERFORM pg_advisory_xact_lock(hashtext('agency_host_slug'));
    NEW.host_slug := agency_host_slug_for(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER agency_host_slug_fill BEFORE INSERT ON agency FOR EACH ROW EXECUTE FUNCTION agency_host_slug_fill();
--> statement-breakpoint
ALTER TABLE "agency" ALTER COLUMN "host_slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "agency" ADD CONSTRAINT "agency_host_slug_unique" UNIQUE ("host_slug");
--> statement-breakpoint
ALTER TABLE "agency" ADD CONSTRAINT "agency_host_slug_check" CHECK (host_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$' AND host_slug NOT IN ('www','mcp','mail','app','api','admin','support'));
```

**§ 0112** (`generate --custom --name=hosts_rls`):
```sql
REVOKE ALL ON agency_domain, agency_sending_domain FROM app_user;
--> statement-breakpoint
GRANT SELECT ON agency_domain, agency_sending_domain TO app_user;
--> statement-breakpoint
ALTER TABLE agency_domain ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_domain FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_domain_read ON agency_domain FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
--> statement-breakpoint
ALTER TABLE agency_sending_domain ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_sending_domain FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_sending_domain_read ON agency_sending_domain FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
```

## Appendix B — `@cs/db` `src/hosts.ts` host env and origins
```ts
export interface HostEnv { appUrl: string; neutralDomain: string; extraPlatformHosts: string[] }
export const HOST_SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_HOST_SLUGS: readonly string[] = ['www', 'mcp', 'mail', 'app', 'api', 'admin', 'support'];
const RM_ROOTS = ['rivalmonday.app', 'rivalmonday.com'];
const DOMAIN_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
export const isUnder = (h: string, root: string) => h === root || h.endsWith(`.${root}`);

/** P2 + R7. `hostEnv` null = no host routing (web reports `problems`; delivery idles). */
export function parseHostEnv(env: NodeJS.ProcessEnv): { hostEnv: HostEnv | null; problems: string[] } {
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, '');
  if (!appUrl) return { hostEnv: null, problems: [] }; // APP_URL's own check reports it
  let appHost: string;
  try { appHost = new URL(appUrl).hostname.toLowerCase(); } catch { return { hostEnv: null, problems: [] }; }
  const neutralDomain = env.NEUTRAL_DOMAIN?.trim().toLowerCase().replace(/\.$/, '') || (appHost === 'localhost' ? 'localhost' : '');
  if (!neutralDomain) return { hostEnv: null, problems: ['NEUTRAL_DOMAIN is required'] };
  if (!DOMAIN_RE.test(neutralDomain)) return { hostEnv: null, problems: ['NEUTRAL_DOMAIN must be a domain name'] };
  // R7: a Rival Monday domain only as staging's own host (APP_URL host = NEUTRAL_DOMAIN, not a Rival Monday root).
  const stagingOwn = neutralDomain === appHost && !RM_ROOTS.includes(appHost);
  if (RM_ROOTS.some((r) => isUnder(neutralDomain, r)) && !stagingOwn) return { hostEnv: null, problems: ['NEUTRAL_DOMAIN must not be a Rival Monday domain'] };
  const extraPlatformHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL].flatMap((v) => (v?.trim() ? [v.trim().toLowerCase()] : []));
  return { hostEnv: { appUrl, neutralDomain, extraPlatformHosts }, problems: [] };
}
/** Same scheme and port as APP_URL (dev/E2E: http + port; prod: https, no port). */
export function originOf(h: HostEnv, hostname: string): string {
  const u = new URL(h.appUrl);
  return `${u.protocol}//${hostname}${u.port ? `:${u.port}` : ''}`;
}
export const platformOrigin = (h: HostEnv) => new URL(h.appUrl).origin;
export const mcpOrigin = (h: HostEnv) => originOf(h, `mcp.${h.neutralDomain}`);
export const fallbackHostname = (h: HostEnv, hostSlug: string) => `${hostSlug}.${h.neutralDomain}`;
```

## Appendix C — `apps/web/src/server/hosts.ts` (routing)
```ts
import { type HostEnv, mcpOrigin, originOf, platformOrigin } from '@cs/db';
export type HostInfo = { kind: 'platform' } | { kind: 'agency'; agencyId: string; canonical: boolean; canonicalOrigin: string } | { kind: 'mcp' };
export type HostRoute = { kind: 'next' } | { kind: 'not_found' } | { kind: 'redirect'; to: string };
type AgencyHit = Omit<Extract<HostInfo, { kind: 'agency' }>, 'kind'>;
const TTL_MS = 60_000; // R2: the one allowed cross-request cache — routing data only, memberships re-checked per request
const MAX_ENTRIES = 2000;
const cache = new Map<string, { v: HostInfo | null; at: number }>();
export const clearHostCache = () => cache.clear();
export function hostnameOf(hostHeader: string | null): string | null {
  const m = /^([a-z0-9.-]+?)\.?(?::\d{1,5})?$/.exec((hostHeader ?? '').trim().toLowerCase());
  return m && m[1] ? m[1] : null;
}
export async function resolveHost(host: string | null, d: { env: HostEnv; envName: string; lookup: (hostname: string) => Promise<AgencyHit | null>; now?: () => number }): Promise<HostInfo | null> {
  const hostname = hostnameOf(host);
  if (!hostname) return null;
  // R7: platform first — staging's agency hosts nest under the platform host.
  if (hostname === new URL(d.env.appUrl).hostname || d.env.extraPlatformHosts.includes(hostname)) return { kind: 'platform' };
  if (hostname === `mcp.${d.env.neutralDomain}`) return { kind: 'mcp' };
  const key = `${d.envName}|${hostname}`;
  const now = (d.now ?? Date.now)();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.v;
  const a = await d.lookup(hostname);
  const v: HostInfo | null = a ? { kind: 'agency', ...a } : null;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { v, at: now }); // negative results too: random Host headers can't hammer the DB
  return v;
}
const ANY_HOST = /^\/health$/;
const MCP_ALLOWED = [/^\/mcp$/, /^\/oauth\//, /^\/\.well-known\/oauth-(?:authorization-server|protected-resource)(?:\/|$)/, /^\/api\/auth\//, /^\/sign-in(?:\/|$)/, /^\/_next\//, /^\/link-expired$/, /^\/favicon/, /^\/icon\.svg$/];
const STAFF_ONLY = /^\/(?:agency|platform)(?:\/|$)|^\/onboarding(?:$|\/(?![\w-]+\.webp$))/;
const AGENCY_HOST_DENY = /^\/(?:mcp|\.well-known|oauth|sign-up|join|support|u|bot|waitlist|sample|api\/(?:stripe|postmark|waitlist|site-status))(?:\/|$)|^\/start\/?$/;
const PLATFORM_HOST_DENY: RegExp | null = null; // Task 8: /^\/(?:mcp|oauth|\.well-known)(?:\/|$)/
export function routeForHost(host: HostInfo | null, req: { pathname: string; search: string; method: string }, platform: string): HostRoute {
  const { pathname, search, method } = req;
  if (ANY_HOST.test(pathname)) return { kind: 'next' };
  if (!host) return { kind: 'not_found' };
  if (host.kind === 'mcp') return MCP_ALLOWED.some((r) => r.test(pathname)) ? { kind: 'next' } : { kind: 'not_found' };
  if (host.kind === 'platform') return PLATFORM_HOST_DENY?.test(pathname) ? { kind: 'not_found' } : { kind: 'next' };
  if (AGENCY_HOST_DENY.test(pathname)) return { kind: 'not_found' };
  if (pathname.startsWith('/dev-panel/') && !pathname.startsWith('/dev-panel/sign-in/')) return { kind: 'not_found' };
  const logo = /^\/files\/logo\/(?!clients\/)([^/]+)\//.exec(pathname); // client logos: checked by their route (N3)
  if (logo && logo[1] !== host.agencyId) return { kind: 'not_found' };
  if (STAFF_ONLY.test(pathname)) return { kind: 'redirect', to: `${platform}${pathname}${search}` };
  if (!host.canonical && (method === 'GET' || method === 'HEAD')) return { kind: 'redirect', to: `${host.canonicalOrigin}${pathname}${search}` };
  return { kind: 'next' };
}
/** The origin served for this request, built from the validated hostname (never the raw header). */
export function requestOriginFor(host: HostInfo, hostname: string, env: HostEnv): string {
  return host.kind === 'platform' ? platformOrigin(env) : host.kind === 'mcp' ? mcpOrigin(env) : originOf(env, hostname);
}
```
(Platform keeps `platformOrigin` even for a `VERCEL_URL` host: preview deploys sign in on `APP_URL`'s origin as today.)

## Appendix D — per-origin Better Auth (`server/request-host.ts`, `server/auth.ts`)
```ts
// server/request-host.ts ('server-only')
export interface RequestHost { origin: string; info: HostInfo }
/** Only the proxy sets x-rm-host-kind / x-rm-host-agency / x-rm-origin (it strips client copies); absent = platform (unit tests, /health). */
export async function requestHost(): Promise<RequestHost>;
// server/auth.ts
const pools = perEnv((name) => { const raw = new Pool({ connectionString: envUrls(name).service, max: 5 }); return profilingOn() ? instrumentPgPool(raw) : raw; }, (p) => p.end());
const instances = perEnv(() => new Map<string, Auth>(), (m) => m.clear());
export function authFor(host: RequestHost, name?: EnvName): Auth {
  const h = webEnv().hostEnv;
  const known = host.info.kind === 'platform' ? platformOrigin(h) : host.info.kind === 'mcp' ? mcpOrigin(h) : null;
  if (known !== null && host.origin !== known) throw new Error('auth origin does not match its host kind');
  if (host.info.kind === 'agency' && !/^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/.test(host.origin)) throw new Error('bad agency origin');
  const map = instances(name);
  let a = map.get(host.origin);
  if (!a) { a = create(name ?? activeEnvName(), host, pools(name)); map.set(host.origin, a); }
  return a;
}
export const requestAuth = async (name?: EnvName) => authFor(await requestHost(), name);
export const platformAuth = (name?: EnvName) => authFor({ origin: platformOrigin(webEnv().hostEnv), info: { kind: 'platform' } }, name);
export const mcpAuth = (name?: EnvName) => authFor({ origin: mcpOrigin(webEnv().hostEnv), info: { kind: 'mcp' } }, name);
```
`buildAuthOptions(deps)` gains `deps.host: RequestHost`: `baseURL = trustedOrigins[0] = host.origin`; `appName` platform `'Rival Monday'`, agency `displayName`, mcp `NEUTRAL_APP_NAME`; `socialProviders.google` only when `host.info.kind === 'platform'`; `oauthProvider(oauthOptions(host.origin))` and the `/oauth2/*` before-hook only when `host.info.kind === 'mcp'`; never `advanced.crossSubDomainCookies` or a cookie `domain`. `deps.branding`/`deps.sendEmail` resolve per host (Task 5 Behaviour).

## Appendix E — `apps/web/src/server/host-viewer.ts` (pure host decision)
```ts
export type HostDecision = { kind: 'allow'; memberships: MembershipSummary[] } | { kind: 'redirect'; to: string };
export const NO_PLATFORM_BOUNCE = /^\/(?:sign-in|no-access|link-expired|link-other-account|api|support|dev-panel|start|waitlist|sample|join|u|sign-up|onboarding|bot)(?:\/|$)/;
/** N5: the only path that needs isOperator + clientOriginFor (platform host, client roles only, path not exempt). */
export function platformBounceTarget(i: { host: RequestHost; memberships: MembershipSummary[]; path: string; pickedAgencyId: string | null }): MembershipSummary | null {
  if (i.host.info.kind !== 'platform') return null;
  const allClient = i.memberships.length > 0 && i.memberships.every((m) => isClientRole(m.role));
  if (!allClient || NO_PLATFORM_BOUNCE.test(safeNext(i.path))) return null;
  return i.memberships.find((m) => m.agencyId === i.pickedAgencyId) ?? i.memberships[0]!;
}
export function decideHost(i: { host: RequestHost; memberships: MembershipSummary[]; path: string; platformOrigin: string; bounce: { origin: string; isOperator: boolean } | null }): HostDecision {
  const path = safeNext(i.path);
  const all: HostDecision = { kind: 'allow', memberships: i.memberships };
  if (i.host.info.kind === 'mcp') return all;
  if (i.host.info.kind === 'agency') {
    const agencyId = i.host.info.agencyId;
    const own = i.memberships.filter((m) => m.agencyId === agencyId && isClientRole(m.role));
    if (own.length > 0) return { kind: 'allow', memberships: own };
    if (i.memberships.some((m) => isAgencyRole(m.role))) return { kind: 'redirect', to: `${i.platformOrigin}${path}` };
    return { kind: 'allow', memberships: [] };
  }
  if (!i.bounce || i.bounce.isOperator) return all;
  const to = `${i.bounce.origin}${path}`;
  return new URL(to).origin === i.host.origin ? all : { kind: 'redirect', to };
}
```

## Appendix F — `packages/tools/src/domains/hostname.ts`
```ts
import { domainToASCII } from 'node:url';
import { type HostEnv, isUnder } from '@cs/db';
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export function normaliseHostname(input: string): string | null {
  const h = domainToASCII(input.trim().toLowerCase().replace(/\.$/, ''));
  if (!h || h.length > 253) return null;
  const labels = h.split('.');
  return labels.length >= 2 && labels.every((l) => LABEL.test(l)) && !/^\d+$/.test(labels.at(-1)!) ? h : null;
}
function reservedRoots(env: HostEnv): string[] {
  const appHost = new URL(env.appUrl).hostname;
  return [env.neutralDomain, 'rivalmonday.app', 'rivalmonday.com', appHost, appHost.split('.').slice(-2).join('.')];
}
export function customHostnameProblem(input: string, env: HostEnv): 'invalid' | 'apex' | 'reserved' | null {
  const h = normaliseHostname(input);
  if (!h) return 'invalid';
  if (h.split('.').length < 3) return 'apex';
  return reservedRoots(env).some((r) => isUnder(h, r)) ? 'reserved' : null;
}
export function sendingDomainProblem(input: string, env: HostEnv): 'invalid' | 'reserved' | null {
  const h = normaliseHostname(input);
  if (!h) return 'invalid';
  return reservedRoots(env).some((r) => isUnder(h, r)) ? 'reserved' : null;
}
```

---

## Moves to 13a2 / 13a3 (not in this plan)
- **13a2** (own plan, after 13a1 merges): old Tasks 15–23 re-mapped per the work file — voice (`VoiceSettings`, agency voice, client "Voice" section on Runbook settings R3, writers P20 + `runbook_tailor` R5, banned-term check, preview under 7b guards), remaining scrub (favicon per host, host-aware root metadata, `productNameFor`/`kbNamesFor` fallbacks P17, `support.ts` copy, Stripe product name P23), leak check (unit + E2E crawl incl. `rivalmonday.app` logo URLs), `apps/site` white-label FAQ after 13a1 is live.
- **13a3** (own plan/worktree, may start any time): spec addendum 2026-11-05 — header colour, dark logo, editor preview, tokens everywhere, property test, 3-theme screenshots.
