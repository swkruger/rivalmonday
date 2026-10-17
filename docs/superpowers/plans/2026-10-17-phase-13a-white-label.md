# Phase 13a — White-label parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, host routing, per-origin auth, viewer host rules, hostname validation, the banned-term matcher and decided copy.

**Goal:** An agency resells the product with no visible trace of Rival Monday: its own web address (custom domain or `<host_slug>.<NEUTRAL_DOMAIN>`), its own email domain, MCP on a neutral host, its own voice in briefs and alerts, and no leaks in titles, PDFs, Stripe, MCP or error pages.

**Architecture:** `proxy.ts` resolves each request's host (60 s cache) to platform / agency / mcp / unknown, applies per-host path rules and passes the validated origin in headers. Better Auth runs one instance per origin. Viewer resolution filters memberships by host and moves staff ↔ clients between hosts. `clientOriginFor` (`@cs/db`) builds every client-facing URL; `senderFor` (`@cs/engine`) picks every From address. Domains are self-serve tools over Vercel/Postmark wrappers with self-rescheduling verify jobs. Part 2 adds `VoiceSettings` to the writers with a banned-term check, then scrubs titles, favicon, error pages, Stripe and copy, pinned by unit and E2E leak checks.

**Tech stack:** TypeScript, Next.js 16 App Router (`proxy.ts`, Node runtime), Better Auth 1.7.7 + `@better-auth/oauth-provider`, Drizzle + Postgres RLS, pg-boss, `@cs/tools`, react-email, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-phase-13a-white-label-design.md` (binding). Brief: `docs/work/phase-13.md`.

**Structure:** **Part 1 = 13a1** (Tasks 0–14: hosts, custom domains, MCP host, sending domains) ends mergeable and **merges on its own via `/rm-merge` (owner go-ahead) before Part 2 starts**. **Part 2 = 13a2** (Tasks 15–23: voice, scrubbing, leak check) has its own pre-flight and merge.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package touched (db, core, engine, email, tools, mcp, billing, ask, ai, worker, web, demo) before coding.
- Runs on `main`, no worktree (owner instruction); never stage `apps/web/next-env.d.ts`, `.env`, `.claude/`. LF only. Commits end with the Co-Authored-By line from root `CLAUDE.md`.
- **Root rule:** nothing client-facing names Rival Monday; client email never uses a Rival Monday domain. Agency staff and the platform console stay on `APP_URL` (`rivalmonday.app`). `/bot` stays Rival Monday on the platform host only.
- Web reads are registered tools; writes via `runTool`; refusals → 404 (never 403). New tools: `access` mark + `access-marks.test.ts` + `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; MCP tools in `channels.test.ts`; write controls need `WriteGuard`.
- New tables ENABLE + FORCE RLS; `agency_domain`/`agency_sending_domain` written by the service role only. Migrations: next free numbers at execution (main 0066; phase-11 holds 0067–0071+; 13b takes the next two). Never edit applied migrations.
- New env (spec's five + E2E-only `DOMAINS_FAKE_VENDORS`) → `turbo.json` `globalPassThroughEnv`; the owner adds `.env` values; never print or log tokens; error text strips query strings.
- Voice terms pass `escapeEvidence`; event readers filter `retracted_at IS NULL`.
- E2E agency host = `http://<host_slug>.localhost:3100` (`NEUTRAL_DOMAIN=localhost`); Node-side requests to `*.localhost` go through the Task 13 helper (127.0.0.1 + `Host` header), browsers resolve `*.localhost` natively.
- Decided copy (verbatim from spec): "This domain is already in use."; "Use a subdomain such as intel.youragency.com."; MCP moved error "This connector moved to https://mcp.<NEUTRAL_DOMAIN>/mcp"; client page title `{page} · {displayName}`.
- Proposed copy (becomes decided on plan approval): each task's **Copy** line.

## Decisions
**Spec D1–D7** (split/order, self-serve Vercel domains + neutral fallback, CNAME/72 h/live = verified + cert/subdomains only, host scope with MCP on `mcp.<NEUTRAL_DOMAIN>`, Postmark sending domain with neutral fallback, agency voice + client override, Client customisation page) — by reference, never re-open.

**Plan-local:**
- **P1 `host_slug` fill trigger.** 14 `insert(agency)` sites give no slug; a `BEFORE INSERT` trigger fills it via `agency_host_slug_for()` (also the backfill). Drizzle `.notNull().default(sql\`NULL\`)` keeps inserts optional; NOT NULL holds after the trigger.
- **P2 Host env.** `HostEnv = { appUrl; neutralDomain; extraPlatformHosts }`. `NEUTRAL_DOMAIN` unset → `'localhost'` only when `APP_URL`'s host is `localhost`; otherwise web env reports a problem and `deliveryConfigFromEnv` returns null (fail closed, delivery idles naming `NEUTRAL_DOMAIN`). Every non-platform origin uses `APP_URL`'s scheme and port (`http://e2e-agency.localhost:3100` in E2E, `https://…` in prod). `VERCEL_URL`/`VERCEL_BRANCH_URL` hostnames count as platform (preview deploys).
- **P3 Signatures carry their deps** (spec omits them): `clientOriginFor(db, agencyId, hostEnv)` in `@cs/db` `hosts.ts`; `senderFor(db, agencyId, audience, cfg)` in `@cs/engine` `delivery/sender.ts`.
- **P4 Split routing.** `proxy.ts` (Node runtime) resolves the host and applies session-free path rules; session-dependent redirects (staff off agency hosts, client-only users off the platform) happen in viewer resolution (`current-viewer.ts`). The proxy strips client-sent `x-rm-host-kind`/`x-rm-host-agency`/`x-rm-origin` and sets them from the resolved host; `/health` answers on any host (cert probe, P13).
- **P5 307 + `no-store`, not 308.** A cached permanent redirect would loop once a user's memberships change (client becomes staff). Applies to every host redirect.
- **P6 Per-origin Better Auth.** One instance per validated origin (memoised, shared pg pool per env); `oauthProvider` and its authorize hook only on the MCP-origin instance; Google sign-in only on the platform host (custom domains can't be registered as Google redirect URIs); no `Domain` cookie attribute. `auth()` is replaced by `authFor(host)` / `requestAuth()`.
- **P7 Host-scoped viewers.** Agency host: only client-role memberships of that agency count; `rm_guest` must carry the host's agency; `rm_support` ignored. Platform host: `rm_guest` ignored; a `/l/<token>` for a client contact 307s to the client origin (old emails keep working). MCP host: all memberships (consent picks one); `rm_guest`/`rm_support` ignored.
- **P8 Link base for tools.** `linkBase(deps, ctx)` = client origin for client roles, `APP_URL` for agency roles — used by every `appLinkFor(deps.appUrl, …)` and the Connect Checkout/portal return URLs.
- **P9 Logos.** Stored logo URLs stay on `APP_URL`; client-facing renders rehost `${APP_URL}/files/logo/` to the client origin (`rehostLogoUrl`); an agency host serves only its own `/files/logo/<agencyId>/`.
- **P10 Domain emails are direct**, not outbox rows (`notification.client_id` is NOT NULL): after the status transition commits, the worker emails active agency-admin contacts, best effort; new platform-branded template `agency_domain_notice`.
- **P11 Vendor code in `@cs/tools` `src/domains/`.** Fakes when the env is demo/test, under Vitest, or `DOMAINS_FAKE_VENDORS=1` (E2E; refused when `VERCEL_ENV=production`); tokens absent → domain write tools refuse (copy in Task 10).
- **P12 Verify jobs self-reschedule** (`startAfter` 600 s / 900 s, `singletonKey` = row id) until a terminal status or `created_at + 72 h`.
- **P13 Certificate issued** = after Vercel reports verified and not misconfigured, an HTTPS `GET https://<hostname>/health` succeeds (Node validates the certificate).
- **P14 Reply-To** = branding `fromEmail` → else today's account-manager contact (`replyToFor`) → none. From display name = `branding.fromName` (defaults to displayName).
- **P15 Agency audience From** = `"Rival Monday" <EMAIL_FROM>` (spec "platform sender"). MCP-host sign-in email From `"Sign in" <sign-in@mail.<NEUTRAL_DOMAIN>>`.
- **P16 MCP cutover.** Constants `MCP_HOST_CUTOVER` (ISO date set at Part 1 merge) and `MCP_MOVED_UNTIL` (+90 days): platform `/mcp` answers the moved error until then, 404 after. Reconnect notice shows while the viewer has an active `oauth_grant_binding` created before cutover.
- **P17 Name fallbacks.** `productNameFor` (@cs/mcp), `kbNamesFor` (@cs/tools), Ask `brandingFor` fall back to `resolveBranding(agency.name, branding).displayName`, never "Rival Monday" (amends 6a P15; root rule wins).
- **P18 New read tool `get_voice_settings { clientId? }`** (agency roles) for the two voice pages (spec defines no read).
- **P19 Review flags.** New columns `brief.review_reason`, `brief.review_terms`, `alert.review_reason`, `alert.review_terms`. A flagged alert always goes `pending_review` (any mode); a flagged brief stays `ready` and auto-send skips it. Agency-only fields.
- **P20 Writers with voice:** `brief_writer` (weekly + starting point), `alert_writer`, `playbook_writer` (recommendation text reaches clients). The quarterly report is deterministic (no writer) → no voice block.
- **P21 Preview limit** = count of `llm_call` rows with task `voice_preview` for the agency since UTC midnight (small overshoot under concurrency accepted).
- **P22 Titles** via a new `(app)/c/[clientId]/layout.tsx` title template plus a static `metadata.title` per client page; the root layout's `generateMetadata` is host-aware.
- **P23 Stripe product** `${displayName} competitor monitoring` (source swapped from `agency.name`); existing products are not renamed. PDF title stays descriptive (client + brief); author/creator/producer are already displayName.
- **P24 `/start` neutral** until an agency is assigned (13a spec supersedes phase-11 11c L4).

## File structure
Exact paths are in each task's **Files**. New modules: db `src/schema/hosts.ts`, `src/hosts.ts`; core `src/voice.ts`, `src/white-label.ts`; engine `delivery/sender.ts`, `voice/{block,banned,preview}.ts`; email `templates/agency-domain-notice.tsx`; tools `src/domains/*`, `src/tools/{domains,voice}.ts`, `src/link-base.ts`; worker `jobs/domains.ts`; web `server/{hosts,request-host,host-viewer,mcp-cutover}.ts`, `(app)/agency/settings/domains/*`, `(app)/c/[clientId]/{layout.tsx,settings/customisation/*}`, `app/{not-found,error,global-error}.tsx`, `public/neutral-icon.svg`, `e2e/{hosts,domains,white-label}.spec.ts`. Migrations `<A>`/`<A+1>` (Part 1), `<B>`/`<B+1>` (Part 2). Plus `turbo.json`, `docs/work/phase-13.md`.

## Dependencies on in-flight work
Re-check each at Task 0 / Task 15 and before any task touching the file.
- **13b (merged before 13a):** migrations — 13a numbers start after 13b's; `/files/rank-map/[clientId]` — if `get_geogrid.map.url` is absolute (built on `appUrl`), Task 7 switches it to `linkBase`; relative paths are fine (same origin). `rank_scan_skipped` notice is agency-audience (keeps `APP_URL`). `AGENCY_KINDS`, `QueueJob`, worker registry, `turbo.json` (`MAPTILER_API_KEY`) → additive.
- **phase-11 (merged before 13a):**
  - Sign-in page (11b `?email=` prefill) → Task 5's host branding keeps the prefill; resolves the phase-11 backlog "sign-in page uses host default branding".
  - `OutgoingEmail.cc`, `notify` `contactIds`/`cc` (11b) → Task 3/7 keep them; `senderFor` applies to cc'd mail too.
  - `packages/tools/src/access/client-invite.ts` `startUrl` (`cfg.appUrl`) and `setup/review-email.ts` links → client origin (Task 7). Templates `client_invite`, `competitor_review` → leak test (Task 21).
  - `applyClientProfileChange` — no 13a change. `AGENCY_KINDS` (+setup kinds) — 13a adds none (P10).
  - 11c `/start*` routes → public on platform and agency hosts (Task 4); neutral copy (Task 20, P24).
  - Worker `main.ts`/`deps.ts`, `turbo.json`, `e2e/seed.ts`, `playwright.config.ts`, `e2e-affected-rules.ts`, tools `all`/`schemas`/`settings`, `access-marks.test.ts` → additive.
- **phase-7-planning** (docs): `/bot` page will live on the platform host only (Task 4 denies it elsewhere).

## Review focus
1. **Session leaking across hosts:** sessions stay on the origin that set them; the memo never keys off a raw `Host` — pinned in Task 5 (`cookies carry no Domain attribute`, `authFor refuses an origin the proxy did not set`, `magic link URL uses the request origin`).
2. **Staff ↔ client redirect loops:** no decision may redirect to the host it came from, a staff+client user is never bounced, operators stay on the platform — pinned in Task 6 (`decideHost never targets the current origin`, `mixed memberships stay`) and Task 13 E2E (`staff redirected off the agency host`, `client-only user redirected off the platform`).
3. **Another agency's data on an agency host:** agency B's memberships, guest cookies, `/l/` tokens, logos and pages are invisible on A's host — pinned in Task 6 (`guest cookie of another agency → null`), Task 4 (`another agency's logo path → 404`), Task 13 E2E (`other agency's client → 404`).
4. **Links on the wrong origin:** client links (outbox, invites, magic links, client-role MCP URLs, Stripe returns) use the client origin; agency notices keep `APP_URL` — pinned in Task 7 (`notify builds client links on the custom host, agency links on APP_URL`, `client-role MCP url is on the client origin`) and Task 5.
5. **Client email from a Rival Monday address:** every client-audience From is the verified sending domain or `<slug>@mail.<NEUTRAL_DOMAIN>` — pinned in Task 3 (`client audience never uses EMAIL_FROM or the APP_URL domain`, `outbox sender picks the client sender for client contacts`) and Task 21 (template leak scan).

---

# Part 1 — 13a1: hosts, custom domains, MCP host, sending domains

### Task 0: Pre-flight (Part 1)
- [ ] On `main`: `git status` clean apart from `apps/web/next-env.d.ts`; confirm 13b and phase-11 are merged (`git branch -a`, `git log`). If not, stop and tell the owner (spec D1).
- [ ] Re-check "Dependencies on in-flight work"; conflict-scan the Part 1 files for the cited symbols (`proxy`, `buildAuthOptions`, `auth`/`perEnv`, `viewerWith`, `resolveViewer`, `notify`, `personalLink`, `createEmailSender`, `loadBranding`, `appLinkFor`, `handleMcpRequest`, `createVerifyOAuth`, `updateAgencyBranding`, `client-invite.ts` `startUrl`). Record drift in `docs/work/phase-13.md`.
- [ ] Claim the next two free migration numbers for Task 1 and write them into its header.
- [ ] Local test DB: `bash scripts/local-test-db.sh start` (or `setup`), `env` → a DB name ending `_test` no other session uses; `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once.
- [ ] Spike (no commit): Playwright Chromium opens `http://foo.localhost:3100/health` against `pnpm --filter @cs/web start --port 3100`; a Node `http.request` to `127.0.0.1:3100` with `Host: foo.localhost:3100` reaches the server. Record both results.
- [ ] `cs_dev` read-only: `SELECT name FROM agency ORDER BY created_at` — preview the slugs the backfill will produce (run the Task 1 function body in a `BEGIN … ROLLBACK`).
- [ ] **Ask the owner:** (a) neutral domain chosen and bought? (b) `*.<NEUTRAL_DOMAIN>` and `mcp.<NEUTRAL_DOMAIN>` added to the Vercel project (wildcard needs Vercel nameservers); (c) `mail.<NEUTRAL_DOMAIN>` verified in Postmark (DKIM + Return-Path); (d) add `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN` to `.env` (never print them); (e) approve the proposed copy lines in Tasks 3, 5, 8, 10, 11, 12.
- [ ] Confirm vendor contracts from live docs; record endpoints + response shapes in the work file; code against fakes until then. Expected — **Vercel:** `POST /v10/projects/{id}/domains` (add; `verified`, `verification[]`), `GET /v9/projects/{id}/domains/{name}`, `POST …/{name}/verify`, `GET /v6/domains/{name}/config` (`misconfigured`), `DELETE /v9/projects/{id}/domains/{name}`, CNAME target. **Postmark** (account token): `POST /domains` `{Name, ReturnPathDomain}` (`ID`, `DKIMPending*`/`DKIM*` host+value, `ReturnPathDomainCNAMEValue`, verified flags), `PUT /domains/{id}/verifyDkim`, `…/verifyReturnPath`, `DELETE /domains/{id}`.
- **Done when:** work file updated; `pnpm test:affected` green on `main`.

### Task 1: Migrations `<A>` (generated + hand-edited) and `<A+1>` (custom RLS)
**Goal:** spec data model for hosts (P1 trigger).
**Files:** new `packages/db/src/schema/hosts.ts`; `src/schema/tenancy.ts` (`agency.hostSlug`), `src/schema/index.ts`; migrations; new `src/hosts-rls.test.ts`; modify `src/evidence.test.ts`/`src/tenant.test.ts` table/privilege lists.
**Interfaces:** `agency.hostSlug: text('host_slug').notNull().default(sql\`NULL\`)` (comment: filled by trigger) with `unique('agency_host_slug_unique')` and `check('agency_host_slug_check', …spec regex + reserved list…)`. `agencyDomain`, `agencySendingDomain` exactly per spec columns/checks/partial unique indexes; export `AgencyDomainStatus = 'pending'|'verifying'|'live'|'failed'|'removed'`, `SendingDomainStatus = 'pending'|'verified'|'failed'|'removed'`, `DnsRecord = { type: string; name: string; value: string }`, row types.
**Migration `<A>`:** run `pnpm --filter @cs/db generate`, keep the generated `CREATE TABLE`/index/check SQL for the two tables, and **replace** the generated `agency` lines with:
```sql
ALTER TABLE "agency" ADD COLUMN "host_slug" text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION agency_host_slug_for(p_name text, p_self uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE base text; candidate text; n int := 1;
BEGIN
  base := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  base := regexp_replace(left(base, 34), '-+$', '', 'g');
  IF length(base) < 3 THEN base := trim(both '-' from 'agency-' || base); END IF;
  IF base IN ('www','mcp','mail','app','api','admin','support') THEN base := base || '-agency'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM agency WHERE host_slug = candidate AND (p_self IS NULL OR id <> p_self)) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  RETURN candidate;
END $$;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM agency WHERE host_slug IS NULL ORDER BY created_at, id LOOP
    UPDATE agency SET host_slug = agency_host_slug_for(r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION agency_host_slug_fill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.host_slug IS NULL THEN NEW.host_slug := agency_host_slug_for(NEW.name, NEW.id); END IF;
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
**Custom migration `<A+1>` (full):** `pnpm --filter @cs/db generate --custom --name=hosts_rls`
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
**Follow pattern:** `migrations/0066_onboarding_rls.sql` (`agency_onboarding`: read-only for agency roles, service writes).
**Tests (TDD)** `hosts-rls.test.ts`: `backfill slugs "E2E Agency" → e2e-agency, duplicates → -2, -3`; `name "A" → agency-a, "" → agency, "Mail" → mail-agency`; `a 60-char name yields ≤ 40 chars and passes the check`; `insert without host_slug gets one from the trigger`; `explicit host_slug 'www' is rejected`; `duplicate host_slug violates agency_host_slug_unique`; `app_user cannot UPDATE agency.host_slug`; `second non-removed agency_domain for one agency violates agency_domain_one_per_agency`; `same hostname live for two agencies violates agency_domain_hostname_active`, `removed rows don't count`; `account_manager reads own agency_domain rows, client_owner sees none, other agency sees none`; `app_user cannot insert either table`; `bad status / local_part rejected`. Privilege guard lists gain both tables (SELECT only).
**Done when:** `pnpm --filter @cs/db generate` says "No schema changes"; `pnpm --filter @cs/db exec vitest run hosts-rls evidence tenant` green; `pnpm typecheck`.

### Task 2: Host helpers in `@cs/db` + env plumbing
**Goal:** one source for origins and host lookups, usable by web, worker, tools, engine (P2, P3, P9).
**Files:** new `packages/db/src/hosts.ts` (+ `hosts.test.ts`), db index; `apps/web/src/server/env.ts` (+test); `turbo.json`.
**Interfaces (full code for the origin rules):**
```ts
export interface HostEnv { appUrl: string; neutralDomain: string; extraPlatformHosts: string[] }
export const HOST_SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;
export function hostEnvFrom(env: NodeJS.ProcessEnv): HostEnv | null {
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, '');
  if (!appUrl) return null;
  const appHost = new URL(appUrl).hostname;
  const neutralDomain = env.NEUTRAL_DOMAIN?.trim().toLowerCase().replace(/\.$/, '') || (appHost === 'localhost' ? 'localhost' : '');
  if (!neutralDomain) return null;
  const extraPlatformHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL].flatMap((v) => (v?.trim() ? [v.trim().toLowerCase()] : []));
  return { appUrl, neutralDomain, extraPlatformHosts };
}
/** Same scheme and port as APP_URL (dev/E2E: http + port; prod: https, no port). */
export function originOf(h: HostEnv, hostname: string): string {
  const u = new URL(h.appUrl);
  return `${u.protocol}//${hostname}${u.port ? `:${u.port}` : ''}`;
}
export const platformOrigin = (h: HostEnv) => new URL(h.appUrl).origin;
export const mcpOrigin = (h: HostEnv) => originOf(h, `mcp.${h.neutralDomain}`);
export const fallbackHostname = (h: HostEnv, hostSlug: string) => `${hostSlug}.${h.neutralDomain}`;
export async function clientOriginFor(db: Db | Tx, agencyId: string, h: HostEnv): Promise<string>; // live agency_domain.hostname, else fallback; unknown agency → throws
export async function agencyByHostname(db: Db, hostname: string, h: HostEnv): Promise<{ agencyId: string; canonical: boolean; canonicalOrigin: string } | null>;
export function rehostLogoUrl(url: string | null, h: HostEnv, origin: string): string | null; // `${appUrl}/files/logo/…` → `${origin}/files/logo/…`; other URLs unchanged
```
**Behaviour:**
- `agencyByHostname`: hostname under `.${neutralDomain}` → slug must match `HOST_SLUG_RE` (else null) → agency by `host_slug`; `canonical` = the agency has no `live` domain; else exact match on a `live` `agency_domain.hostname` (`canonical: true`). `mcp.<neutral>` and the platform host are never looked up here (Task 4 checks them first).
- `clientOriginFor` reads `agency.host_slug` + the `live` domain in one query; `https://` comes from `originOf`.
- `WebEnv` gains `hostEnv: HostEnv` (problem `NEUTRAL_DOMAIN is required` when `hostEnvFrom` is null). `turbo.json` adds the five spec vars + `DOMAINS_FAKE_VENDORS`.
- **Follow pattern:** `packages/db/src/filters.ts` (helpers taking `Db | Tx`).
**Tests (TDD):** `hostEnvFrom defaults neutral to localhost only for a localhost APP_URL`; `returns null for a production APP_URL without NEUTRAL_DOMAIN`; `originOf keeps http and port in dev, https without port in prod`; `clientOriginFor → fallback when no live domain, custom when live, fallback again after removed/failed`; `agencyByHostname resolves fallback (canonical true), fallback with live custom (canonical false, canonicalOrigin custom), live custom; pending custom → null; bad slug → null`; `rehostLogoUrl rewrites only own-logo URLs`; web env `NEUTRAL_DOMAIN missing in production is a problem`.
**Done when:** `pnpm --filter @cs/db exec vitest run hosts` and `pnpm --filter @cs/web exec vitest run env` green; `pnpm typecheck`.

### Task 3: `senderFor` + email wiring + `fromEmail` kept
**Goal:** spec sender selection on every client/agency email path (P14, P15); branding save keeps a stored `fromEmail` (backlog).
**Files:** new `packages/engine/src/delivery/sender.ts` (+test), engine index; `delivery/outbox.ts` (`DeliveryConfig`, `deliveryConfigFromEnv`, `createEmailSender`); `apps/worker/src/deps.ts` (`getSenders`, `sendClient`); `packages/tools/src/settings.ts` (`updateAgencyBranding`) + test.
**Interfaces:**
```ts
export type Audience = 'client' | 'agency';
export async function senderFor(db: Db | Tx, agencyId: string, audience: Audience, cfg: Pick<DeliveryConfig, 'hostEnv' | 'platformFrom'>): Promise<{ from: string; replyTo?: string }>;
// DeliveryConfig += hostEnv: HostEnv; platformFrom: string (EMAIL_FROM || briefs@<APP_URL host>); fromAddress removed
export function createEmailSender(opts: { transport: EmailTransport; db: Db; cfg: DeliveryConfig }): ChannelSender;
```
**Behaviour:**
- Client: `status = 'verified'` sending domain → `"<fromName>" <localPart@domain>`; else `"<fromName>" <host_slug@mail.<neutralDomain>>`. `replyTo` = branding `fromEmail` → else `replyToFor` is applied by the caller (outbox keeps writing `payload.replyTo`); display name sanitised like `quoteName`.
- Agency: `"Rival Monday" <platformFrom>`, no replyTo.
- `createEmailSender`: audience from the row's contact (`contact.client_id IS NOT NULL` → client), so pre-existing rows work; `replyTo` precedence P14 (`senderFor().replyTo ?? payload.replyTo`). Keeps phase-11 `cc`.
- `deliveryConfigFromEnv` → null when `hostEnvFrom` is null (worker warning names `NEUTRAL_DOMAIN`).
- Worker `sendClient` (client billing notices) uses `senderFor(…, 'client')`; Rival Monday-branded platform/agency mails keep `platformFrom`.
- `updateAgencyBranding`: keys absent from the input keep their stored value for `fromEmail` (and, in Part 2, `voice`); an explicit empty string clears.
- **Follow pattern:** `engine/src/delivery/contacts.ts` `replyToFor`.
**Copy (proposed):** none.
**Tests (TDD):** `client audience uses the verified sending domain and local part`; `pending/failed/removed sending domain → <slug>@mail.<neutral>`; `client audience never uses EMAIL_FROM or the APP_URL domain` (property over all states); `replyTo is branding fromEmail when set`; `agency audience is the platform sender`; outbox `sender picks the client sender for client contacts and the platform sender for agency contacts`; `cc still reaches the transport`; settings `saving branding without fromEmail keeps the stored one`, `empty fromEmail clears it`.
**Done when:** `pnpm --filter @cs/engine exec vitest run sender outbox`, `pnpm --filter @cs/tools exec vitest run settings`, `pnpm --filter @cs/worker exec vitest run billing-notices delivery` green; `pnpm typecheck`.

### Task 4: `resolveHost` + `proxy.ts` host rules
**Goal:** spec host resolution and proxy rules (P4–P6 session-free part, P9 logos).
**Files:** new `apps/web/src/server/hosts.ts` (+ `hosts.test.ts`; no `server-only` — the proxy imports it); `apps/web/src/proxy.ts`, `proxy.test.ts`.
**Full code (`server/hosts.ts`, routing):**
```ts
export type HostInfo = { kind: 'platform' } | { kind: 'agency'; agencyId: string; canonical: boolean; canonicalOrigin: string } | { kind: 'mcp' };
export type HostRoute = { kind: 'next' } | { kind: 'not_found' } | { kind: 'redirect'; to: string };
const TTL_MS = 60_000;
const MAX_ENTRIES = 2000;
const cache = new Map<string, { v: HostInfo | null; at: number }>();
export function hostnameOf(hostHeader: string | null): string | null {
  const m = /^([a-z0-9.-]+?)\.?(?::\d{1,5})?$/.exec((hostHeader ?? '').trim().toLowerCase());
  return m && m[1] ? m[1] : null;
}
export async function resolveHost(host: string, d: { env: HostEnv; envName: string; lookup: (hostname: string) => Promise<Omit<Extract<HostInfo, { kind: 'agency' }>, 'kind'> | null>; now?: () => number }): Promise<HostInfo | null> {
  const hostname = hostnameOf(host);
  if (!hostname) return null;
  if (hostname === new URL(d.env.appUrl).hostname || d.env.extraPlatformHosts.includes(hostname)) return { kind: 'platform' };
  if (hostname === `mcp.${d.env.neutralDomain}`) return { kind: 'mcp' };
  const key = `${d.envName}|${hostname}`;
  const now = (d.now ?? Date.now)();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.v;
  const a = await d.lookup(hostname);
  const v: HostInfo | null = a ? { kind: 'agency', ...a } : null;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { v, at: now }); // negative results cached too: random Host headers can't hammer the DB
  return v;
}
const ANY_HOST = /^\/health$/;
const MCP_ALLOWED = [/^\/mcp$/, /^\/oauth\//, /^\/\.well-known\/oauth-(authorization-server|protected-resource)(\/|$)/, /^\/api\/auth\//, /^\/sign-in(\/|$)/, /^\/_next\//, /^\/link-expired$/];
const STAFF_ONLY = /^\/(agency|platform|onboarding)(\/|$)/;
const AGENCY_HOST_DENY = /^\/(mcp|\.well-known|oauth|sign-up|join|support|u|bot|api\/stripe)(\/|$)/;
const PLATFORM_HOST_DENY = /^\/(oauth|\.well-known)(\/|$)/;
export function routeForHost(host: HostInfo | null, req: { pathname: string; search: string; method: string }, platform: string): HostRoute {
  const { pathname, search, method } = req;
  if (ANY_HOST.test(pathname)) return { kind: 'next' };
  if (!host) return { kind: 'not_found' };
  if (host.kind === 'mcp') return MCP_ALLOWED.some((r) => r.test(pathname)) ? { kind: 'next' } : { kind: 'not_found' };
  if (host.kind === 'platform') return PLATFORM_HOST_DENY.test(pathname) ? { kind: 'not_found' } : { kind: 'next' };
  if (AGENCY_HOST_DENY.test(pathname)) return { kind: 'not_found' };
  if (pathname.startsWith('/dev-panel/') && !pathname.startsWith('/dev-panel/sign-in/')) return { kind: 'not_found' };
  const logo = /^\/files\/logo\/([^/]+)\//.exec(pathname);
  if (logo && logo[1] !== host.agencyId) return { kind: 'not_found' };
  if (STAFF_ONLY.test(pathname)) return { kind: 'redirect', to: `${platform}${pathname}${search}` };
  if (!host.canonical && (method === 'GET' || method === 'HEAD')) return { kind: 'redirect', to: `${host.canonicalOrigin}${pathname}${search}` };
  return { kind: 'next' };
}
/** The origin served for this request, built from the validated hostname (never the raw header). */
export function requestOriginFor(host: HostInfo, hostname: string, env: HostEnv): string;
```
**Proxy behaviour:** `export async function proxy(req)`; delete client-sent `x-rm-path`, `x-rm-host-kind`, `x-rm-host-agency`, `x-rm-origin`; resolve with `lookup = (h) => agencyByHostname(dbs(activeEnvName()).service, h, env)`; `not_found` → plain `Not found` 404 with `cache-control: no-store`; `redirect` → 307 + `no-store` (P5); then set the three host headers and keep today's `PUBLIC` list + session-cookie check unchanged (its sign-in redirect stays relative = same host). Add `/start(\/|$)` to `PUBLIC` only if phase-11 has not.
**Tests (TDD)** `hosts.test.ts`: `platform, mcp, fallback agency, live custom, unknown`; `VERCEL_URL host is platform`; `cache hit within 60 s skips lookup, refreshes after`; `negative result cached`; `hostnameOf strips port and trailing dot, rejects junk`; `unknown host → not_found except /health`; `mcp host allows only its paths`; `agency host denies /mcp, /sign-up, /join, /api/stripe/webhook, /u/x, /bot`; `agency host redirects /agency/x?y to the platform with the query`; `another agency's logo path → not_found, own logo → next`; `non-canonical GET → canonical origin, POST → next`; `platform denies /oauth/consent and /.well-known/*`. `proxy.test.ts`: `client-sent x-rm-host-* are replaced`; `404 for unknown host carries no-store`; existing cases still pass on the platform host.
**Done when:** `pnpm --filter @cs/web exec vitest run hosts proxy` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 5: Better Auth per origin + host branding on auth pages
**Goal:** spec "one instance per origin" (P6), magic links on the request origin, agency-branded sign-in.
**Files:** `apps/web/src/server/auth.ts`, `auth-options.ts` (+tests), new `server/request-host.ts`; `server/branding.ts` (`hostBranding`); every `auth()` caller: `server/current-viewer.ts`, `app/api/auth/[...all]/route.ts`, `app/.well-known/oauth-authorization-server/[[...path]]/route.ts`, `server/mcp.ts`, `app/(app)/actions.ts`, `app/support/end/route.ts`, `app/l/[token]/route.ts`, `app/sign-up/actions.ts`, `app/onboarding/start/route.ts`, `app/oauth/consent/actions.ts`, `dev-panel/handlers.ts` (+ their test mocks); every `defaultBranding` caller (11 pages listed by `grep -rl defaultBranding apps/web/src/app`); `components/auth-card.tsx`; `app/sign-in/sign-in-form.tsx` (Google button only when `googleEnabled`).
**Interfaces + full code (security-sensitive):**
```ts
// server/request-host.ts ('server-only')
export interface RequestHost { origin: string; info: HostInfo }
/** Only the proxy sets these headers (it strips client-sent copies); absent = platform (unit tests, health). */
export async function requestHost(): Promise<RequestHost>;
// server/auth.ts
const pools = perEnv((name) => new Pool({ connectionString: envUrls(name).service, max: 5 }), (p) => p.end());
const instances = perEnv(() => new Map<string, Auth>(), (m) => m.clear());
export function authFor(host: RequestHost, name?: EnvName): Auth {
  const env = webEnv();
  const known = host.info.kind === 'platform' ? platformOrigin(env.hostEnv) : host.info.kind === 'mcp' ? mcpOrigin(env.hostEnv) : null;
  if (known !== null && host.origin !== known) throw new Error('auth origin does not match its host kind');
  const map = instances(name);
  let a = map.get(host.origin);
  if (!a) { a = create(name ?? activeEnvName(), host); map.set(host.origin, a); }
  return a;
}
export const requestAuth = async (name?: EnvName) => authFor(await requestHost(), name);
export const platformAuth = (name?: EnvName) => { const h = webEnv().hostEnv; return authFor({ origin: platformOrigin(h), info: { kind: 'platform' } }, name); };
export const mcpAuth = (name?: EnvName) => { const h = webEnv().hostEnv; return authFor({ origin: mcpOrigin(h), info: { kind: 'mcp' } }, name); };
```
- `buildAuthOptions(deps)` gains `deps.host: RequestHost`: `baseURL = trustedOrigins[0] = host.origin`; `appName` = platform "Rival Monday", agency displayName, mcp `NEUTRAL_APP_NAME`; `socialProviders.google` only on platform; `oauthProvider(oauthOptions(host.origin))` and the `before` hook only when `host.info.kind === 'mcp'`; never set `advanced.crossSubDomainCookies` or a cookie `domain`.
- Magic-link email: platform → `env.emailFrom` + `hostBranding`; agency → `senderFor(service, agencyId, 'client', cfg)` + that agency's branding (logo rehosted, P9); mcp → P15 neutral sender + neutral branding.
- `hostBranding(service, env, host): Promise<{ branding: Branding; neutral: boolean }>` — platform: today's `defaultBranding`; agency: `resolveBranding(agency)`; mcp: neutral (`neutral: true`). `AuthCard` takes `neutral` and then renders no wordmark/logo.
- Call sites: request-scoped → `requestAuth()`; `.well-known` AS metadata + consent action → `mcpAuth()`; dev panel + sign-up + onboarding start → `platformAuth()`. Remove `auth`.
- **Follow pattern:** existing `perEnv` instance cache in `server/auth.ts`.
**Copy (proposed):** `NEUTRAL_APP_NAME = 'Connect'`; MCP-host sign-in email subject stays the template's.
**Tests (TDD)** `auth-options.test.ts`/new `auth.test.ts`: `baseURL and trustedOrigins equal the host origin`; `cookies carry no Domain attribute` (sign-in response `Set-Cookie`); `magic link URL uses the request origin` (agency host → `http://<slug>.localhost…/api/auth/magic-link/verify`); `oauth plugin endpoints exist only on the mcp instance` (`/api/auth/oauth2/register` 404 on platform); `Google provider only on platform`; `authFor refuses an origin the proxy did not set` (platform kind + foreign origin throws); `one instance per origin, shared pool`; `agency sign-in email is From the agency sender with its branding`; `hostBranding is neutral on the mcp host`. Existing OAuth tests (`oauth-consent`, `mcp`) pass against `mcpAuth()`.
**Done when:** `pnpm --filter @cs/web exec vitest run auth auth-options oauth-consent mcp current-viewer branding sign-in` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 6: Host-scoped viewer resolution and redirects
**Goal:** spec proxy rules that need a session (P5, P7): staff off agency hosts, client-only users off the platform, other agencies invisible.
**Files:** new `apps/web/src/server/host-viewer.ts` (+test); `server/viewer.ts`, `server/current-viewer.ts` (+tests); `app/l/[token]/route.ts`, `app/go/[target]/[id]/route.ts`, `app/onboarding/start/route.ts`, `app/support/{end,exit}/route.ts` (`new URL(path, env.appUrl)` → request origin).
**Full code (pure decision):**
```ts
export type HostDecision = { kind: 'allow'; memberships: MembershipSummary[] } | { kind: 'redirect'; to: string };
const NO_PLATFORM_BOUNCE = /^\/(sign-in|no-access|link-expired|link-other-account|api|support|dev-panel)(\/|$)/;
export function decideHost(i: { host: RequestHost; memberships: MembershipSummary[]; isOperator: boolean; path: string; platformOrigin: string; clientOrigin: (agencyId: string) => string; pickedAgencyId: string | null }): HostDecision {
  const path = safeNext(i.path);
  if (i.host.info.kind === 'mcp') return { kind: 'allow', memberships: i.memberships };
  if (i.host.info.kind === 'agency') {
    const agencyId = i.host.info.agencyId;
    const own = i.memberships.filter((m) => m.agencyId === agencyId && isClientRole(m.role));
    if (own.length > 0) return { kind: 'allow', memberships: own };
    if (i.memberships.some((m) => isAgencyRole(m.role))) return { kind: 'redirect', to: `${i.platformOrigin}${path}` };
    return { kind: 'allow', memberships: [] };
  }
  const allClient = i.memberships.length > 0 && i.memberships.every((m) => isClientRole(m.role));
  if (!allClient || i.isOperator || NO_PLATFORM_BOUNCE.test(path)) return { kind: 'allow', memberships: i.memberships };
  const target = i.memberships.find((m) => m.agencyId === i.pickedAgencyId) ?? i.memberships[0]!;
  const to = `${i.clientOrigin(target.agencyId)}${path}`;
  return new URL(to).origin === i.host.origin ? { kind: 'allow', memberships: i.memberships } : { kind: 'redirect', to };
}
```
**Behaviour:**
- `resolveViewer` takes `host` and `decide` inputs; memberships are filtered by `decideHost` before `pickMembership`/client hint; empty → `member-less` (agency host `/no-access` stays on that host).
- Guest cookie: accepted only on agency hosts and only when `claims.agencyId === host.agencyId` (else null). `rm_support` read only on the platform host.
- `viewerWith(mode='page')`: a `redirect` decision → `redirect(to)` (Next 307); `mode='api'` never redirects (treat as no viewer). `isOperator` = `platformRoleForUser(...) !== null`.
- `/l/<token>` on the platform host: a valid token whose contact has `client_id` → 307 to `clientOriginFor(agency)/l/<token>` (no cookie set); on an agency host a token of another agency → the same `/link-expired` page as any bad token. All route redirects build on `requestHost().origin`.
- **Follow pattern:** `resolveSupportViewer` (pure resolution + tests).
**Tests (TDD):** `staff on agency host → platform same path`; `client of host agency → allow only that membership`; `staff + client of host agency → allow client membership (no bounce)`; `client of another agency only → member-less`; `client-only on platform → client origin of the picked membership`; `mixed staff + client on platform → allow`; `operator with only client roles stays`; `decideHost never targets the current origin`; `sign-in path never bounces`; viewer `guest cookie of another agency → null`, `guest cookie ignored on platform`, `support cookie ignored on agency host`; route `/l token for a client contact on the platform → 307 to the agency host with no-store`, `agency staff token stays on the platform`.
**Done when:** `pnpm --filter @cs/web exec vitest run host-viewer viewer current-viewer links` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 7: `clientOriginFor` at every client-facing URL
**Goal:** spec "used by outbox links, invites, magic links, PDFs, logo and rank-map URLs, guest links"; agency-facing keeps `APP_URL` (P8, P9).
**Files and call sites (verified):**
- `packages/engine/src/delivery/outbox.ts`: `personalLink`/`notify` — client audience base = `clientOriginFor(conn, agencyId, cfg.hostEnv)`; agency audience and `plainLink` (webhooks) keep `cfg.appUrl`. `loadBranding` → `loadBranding(db, agencyId, { origin? })` rehosting the logo; client-audience callers (`alerts/route.ts releaseAlert`, `alerts/digest.ts`, `briefs/deliver.ts`, `reports/quarterly.ts`, `briefs/pdf.ts`, `reports` PDF) pass the client origin (PDF `allowUrls` follows the rehosted URL).
- `packages/tools/src/access/client-invite.ts` `startUrl` and `setup/review-email.ts` links (phase-11) → client origin.
- New `packages/tools/src/link-base.ts` `linkBase(deps, ctx): Promise<string | undefined>`; replace `appLinkFor(deps.appUrl, …)` in `search/fetch-item.ts` (9), `tools/{add-recommendation,ads,alerts,briefs,clients,competitors,events,moves,recommendations,reputation,search}.ts`; 13b `get_geogrid.map.url` if absolute. `ToolDeps` += `hostEnv?: HostEnv`.
- `packages/tools/src/tools/client-billing.ts` `checkoutFor` success/cancel URLs and `my-billing.ts` portal `returnUrl` → client origin; `billingUrl`/`appPath` (agency pages) and `platform-billing.ts` `/join` keep `APP_URL`.
- `apps/web/src/app/(app)/agency/team/actions.ts` invitation message: client-role invite → `${clientOrigin}/sign-in`, agency role → `APP_URL`.
- `apps/web/src/server/inbox.ts` `internalLink(link, origins)` accepts the request origin and `APP_URL`; `app/(app)/inbox/actions.ts`.
- Web shell/theme (`server/theme.ts`, `components/shell/app-shell.tsx`) rehost the logo to the request origin on agency hosts.
- `packages/demo/src/cli/links.ts` (+`reset.ts` printout): client-contact links on the demo agency's client origin.
- Unchanged by design: `platform/costs/*`, `agency-onboarding.ts` logo storage URL, `support/*`, `u/[token]`, `branding/logo/route.ts` origin check.
**Behaviour:** `clientOriginFor` failure (agency missing) throws → the transaction rolls back (no stray outbox row). **Follow pattern:** `personalLink`.
**Tests (TDD):** outbox `notify builds client links on the custom host, agency links on APP_URL` (+ fallback host before live); `webhook links stay on APP_URL`; `client email logo is rehosted`; tools `client-role MCP url is on the client origin, agency-role on APP_URL` (`list_briefs`, `fetch`); `checkout success URL is on the client origin`; `portal return URL on the client origin`; phase-11 `client invite startUrl on the client origin`; inbox `internalLink accepts a client-origin link`; demo `client links use the slug host`.
**Done when:** `pnpm --filter @cs/engine exec vitest run outbox route digest deliver pdf quarterly`, `pnpm --filter @cs/tools exec vitest run fetch briefs client-billing my-billing client-invite`, `pnpm --filter @cs/web exec vitest run inbox team`, `pnpm --filter @cs/demo exec vitest run links` green; `pnpm test:affected`; `pnpm typecheck`.

### Task 8: MCP on `mcp.<NEUTRAL_DOMAIN>`
**Goal:** spec MCP section (P16).
**Files:** `apps/web/src/server/mcp.ts`, `server/oauth-consent.ts` (`createVerifyOAuth` resource), `app/mcp/route.ts`, `app/.well-known/oauth-protected-resource/[[...path]]/route.ts`, `app/.well-known/oauth-authorization-server/[[...path]]/route.ts`, `app/oauth/consent/{page,actions}.ts`, `app/(app)/agency/ai/page.tsx`, `app/(app)/c/[clientId]/settings/ai/page.tsx`, `components/ai-connections.tsx` (+tests); new `server/mcp-cutover.ts`.
**Interfaces:** `MCP_HOST_CUTOVER: string` (ISO date), `MCP_MOVED_UNTIL: string`; `movedResponse(req, mcpUrl): Response` = HTTP 200 JSON `{"jsonrpc":"2.0","id":<request id or null>,"error":{"code":-32000,"message":"This connector moved to <mcpUrl>"}}`; `connectorSlug(productName: string): string` (lower-case, non-alnum → `-`, trimmed, else `connector`); `hasPreCutoverOAuth(service, userId): Promise<boolean>`.
**Behaviour:**
- `McpHandlerDeps.appUrl` and `createVerifyOAuth` resource = `mcpOrigin(hostEnv)`; `verifyOAuth` uses `mcpAuth(name).$context`. PATs unchanged (work on the new URL).
- `/mcp` POST: mcp host → `handleMcpRequest`; platform host before `MCP_MOVED_UNTIL` → `movedResponse`, after → 404 (agency hosts never reach it, Task 4).
- Protected-resource metadata: `resource` `${mcpOrigin}/mcp`, `authorization_servers` `[${mcpOrigin}/api/auth]`, **no `resource_name`** (was "Rival Monday"). AS metadata from `mcpAuth()`.
- Consent page: neutral `AuthCard` before sign-in (sign-in on the mcp host); after sign-in agency-branded when every option belongs to one agency, else neutral. `pluginConsent` posts to `${mcpOrigin}/api/auth/oauth2/consent` via `mcpAuth()`.
- AI connection pages: connector URL `${mcpOrigin}/mcp`; Claude Code line `claude mcp add --transport http ${connectorSlug(productName)} …` with `productName` from `productNameFor`; reconnect notice when `hasPreCutoverOAuth`.
- **Follow pattern:** existing `.well-known` routes.
**Copy (proposed):** notice "Your AI connector has a new address. Remove the old connector in your AI app, then add it again with the address above."
**Tests (TDD):** `platform /mcp returns the moved JSON-RPC error with the request id`; `after MCP_MOVED_UNTIL platform /mcp is 404`; `protected-resource metadata names the mcp origin and has no resource_name`; `verifyOAuth rejects a token whose aud is the old resource`; `PAT works on the mcp host`; `consent page is neutral before sign-in and agency-branded for one agency`; `connector command uses the product slug, never rival-monday`; `reconnect notice only with a pre-cutover binding`.
**Done when:** `pnpm --filter @cs/web exec vitest run mcp oauth-consent consent ai-connections` and `pnpm --filter @cs/mcp test` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 9: Vendor wrappers, fakes, hostname rules
**Goal:** spec `VercelDomains`, `PostmarkDomains` with fakes (P11, P13); validation.
**Files:** new `packages/tools/src/domains/{hostname,vercel,postmark,fakes,vendors}.ts` (+tests).
**Interfaces:**
```ts
export interface VercelDomainState { verified: boolean; misconfigured: boolean; records: DnsRecord[]; message: string | null }
export interface VercelDomains { add(hostname: string): Promise<VercelDomainState>; remove(hostname: string): Promise<void>; status(hostname: string): Promise<VercelDomainState> }
export interface PostmarkDomainState { id: number; dkim: { host: string; value: string; verified: boolean }; returnPath: { host: string; value: string; verified: boolean } }
export interface PostmarkDomains { create(domain: string): Promise<PostmarkDomainState>; verifyDkim(id: number): Promise<PostmarkDomainState>; verifyReturnPath(id: number): Promise<PostmarkDomainState>; remove(id: number): Promise<void> }
export function createVercelDomains(o: { token: string; projectId: string; teamId?: string; fetch?: typeof fetch }): VercelDomains;
export function createPostmarkDomains(o: { token: string; fetch?: typeof fetch }): PostmarkDomains;
export function domainVendorsFor(env: NodeJS.ProcessEnv, envName: EnvName): { vercel: VercelDomains | null; postmark: PostmarkDomains | null };
export class DomainVendorError extends Error { constructor(public code: 'in_use' | 'invalid' | 'unavailable', message: string) }
```
**Full code (`hostname.ts`):**
```ts
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export function normaliseHostname(input: string): string | null {
  const h = domainToASCII(input.trim().toLowerCase().replace(/\.$/, ''));
  if (!h || h.length > 253) return null;
  const labels = h.split('.');
  return labels.length >= 2 && labels.every((l) => LABEL.test(l)) && !/^\d+$/.test(labels.at(-1)!) ? h : null;
}
const under = (h: string, root: string) => h === root || h.endsWith(`.${root}`);
export function customHostnameProblem(input: string, env: HostEnv): 'invalid' | 'apex' | 'reserved' | null {
  const h = normaliseHostname(input);
  if (!h) return 'invalid';
  if (h.split('.').length < 3) return 'apex';
  const appHost = new URL(env.appUrl).hostname;
  const reserved = [env.neutralDomain, 'rivalmonday.app', 'rivalmonday.com', appHost, appHost.split('.').slice(-2).join('.')];
  return reserved.some((r) => under(h, r)) ? 'reserved' : null;
}
export function sendingDomainProblem(input: string, env: HostEnv): 'invalid' | 'reserved' | null; // ≥ 2 labels; same reserved roots
```
**Behaviour:** fetch wrappers: 10 s timeout; Vercel `409`/`domain_already_in_use` → `DomainVendorError('in_use')`; verification records → `DnsRecord`s (CNAME target + any TXT); `status` = project-domain `verified` + config `misconfigured`. Postmark create uses `ReturnPathDomain: pm-bounces.<domain>`; prefers `DKIMPending*` when present. Errors never include tokens/URLs with query strings. Fakes: in-memory, `failNext()`, `setVerified(hostname|id)`; fake `add` returns CNAME `cname.vercel-dns.com.`-style records. **Follow pattern:** `packages/billing/src/fake-gateway.ts` (fake shape), `collectors/src/vendors/meta-search.ts` (fetch).
**Tests (TDD):** `intel.agency.com ok; agency.com → apex; foo.<neutral> and x.rivalmonday.app → reserved; IDN normalised; trailing dot stripped; bad label → invalid`; `sending domain apex allowed, neutral refused`; vercel `add maps records`, `409 → in_use`, `status combines verified + misconfigured`, `error text has no token`; postmark `create maps pending DKIM`, `verify flips flags`; `domainVendorsFor → fakes for test env and DOMAINS_FAKE_VENDORS, null without tokens, refuses the fake flag in production`.
**Done when:** `pnpm --filter @cs/tools exec vitest run hostname vercel postmark vendors` green; `pnpm typecheck`.

### Task 10: Domain tools + operator slug tool
**Goal:** spec domain tools via `runTool` (audited) and the console `host_slug` change.
**Files:** new `packages/tools/src/tools/domains.ts` (+test); `tools/platform-console.ts` (+test); `deps.ts` (`domains?`, `hostEnv?`, `QueueJob` += `'domain-verify' | 'sender-verify'`); `all.ts`, `schemas.ts`, `access-marks.test.ts`; 8b access doc; `apps/web/src/server/tools.ts` (wire `hostEnv`, `domains`).
**Interfaces:** spec `get_agency_domains` (read, agency admin, web only) output exactly; `set_custom_domain { hostname: z.string().max(253) }` → `{ ok: true }`; `remove_custom_domain {}`; `set_sending_domain { domain, localPart?: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,39}$/) }`; `remove_sending_domain {}` — all `access: 'write'`, `permission: 'agency'`, admin-only check (`ctx.role === 'agency_admin'`, not `contact:`), web only. `set_agency_host_slug { agencyId: uuid, hostSlug }` — operator `owner`, `audit: 'skip-web'` + `withPlatformAudit`.
**Behaviour:**
- `set_custom_domain`: `customHostnameProblem` → decided copy (apex: "Use a subdomain such as intel.youragency.com."; reserved/invalid: proposed); a non-removed row for this agency → refuse; hostname active for another agency (or `in_use` from Vercel) → "This domain is already in use."; insert `pending` in a service tx (unique violation → in-use copy), then `vercel.add` → store `dns_records`; vendor failure deletes the row and refuses; enqueue `domain-verify { domainId }` singleton `domain:{id}`.
- `remove_custom_domain`: `vercel.remove` (404 ignored) then `status 'removed'`, `removed_at`.
- Sending: same shape with Postmark; store DKIM/Return-Path; enqueue `sender-verify` singleton `sender:{id}`; remove → `postmark.remove` + `removed` (fallback sender immediately).
- `vercel`/`postmark` null → refuse (copy below). All refusals `ToolError('invalid_input', msg, { userFacing: true })`.
- `set_agency_host_slug`: `HOST_SLUG_RE` + reserved list; unique violation → "That address is taken."
- **Follow pattern:** `tools/client-billing.ts` (`refuse`, service writes), `tools/platform-console.ts`.
**Copy (proposed):** invalid "Enter a domain such as intel.youragency.com."; reserved "That domain can't be used."; one at a time "Remove the current domain first."; not configured "Custom domains are not set up on this server yet."; slug taken "That address is taken."
**Tests (TDD):** `get_agency_domains returns fallbackHost and nulls`; `account_manager and client roles cannot call the writes (not_found)`; `set stores Vercel records, pending, enqueues one verify job`; `apex refused with decided copy`; `hostname live for another agency → in use`; `Vercel in_use → in use, no row left`; `second set while pending → refused`; `remove calls Vercel and marks removed; a new set then works`; `sending domain create/remove`; `localPart default briefs`; `vendors null → not configured`; console `operator changes slug, non-operator → not_found, taken → copy`; access-marks updated.
**Done when:** `pnpm --filter @cs/tools exec vitest run domains platform-console access-marks` green; `pnpm test:affected`; `pnpm typecheck`.

### Task 11: Worker `domain-verify` / `sender-verify` + notice email
**Goal:** spec jobs (P10, P12, P13).
**Files:** new `packages/tools/src/domains/verify.ts` (+test); new `apps/worker/src/jobs/domains.ts` (+test); `apps/worker/src/{deps.ts,main.ts}`; new `packages/email/src/templates/agency-domain-notice.tsx` (+test), `types.ts`, `render.ts`.
**Interfaces:**
```ts
export const DOMAIN_VERIFY_SECONDS = 600; export const SENDER_VERIFY_SECONDS = 900; export const VERIFY_WINDOW_HOURS = 72;
export async function verifyAgencyDomain(d: { service: Db; vercel: VercelDomains; probe: (hostname: string) => Promise<boolean>; notify: (n: DomainNotice) => Promise<void> }, domainId: string, now: Date): Promise<'again' | 'done'>;
export async function verifySendingDomain(d: { service: Db; postmark: PostmarkDomains; resolveTxt: (name: string) => Promise<string[][]>; notify: (n: DomainNotice) => Promise<void> }, id: string, now: Date): Promise<'again' | 'done'>;
export type DomainNotice = { agencyId: string; kind: 'domain_live' | 'domain_failed' | 'sender_verified' | 'sender_failed'; name: string; error?: string };
// email: { template: 'agency_domain_notice'; props: { branding; kind; name; settingsUrl; error? } }
```
**Behaviour:**
- Domain: only `pending`/`verifying` rows; `vercel.status` outside a tx; then a conditional update (`WHERE id AND status IN ('pending','verifying')`): store records + `last_checked_at`; verified ∧ ¬misconfigured → `verifying`, and `probe` (`GET https://<hostname>/health`, 10 s) ok → `live`, `live_at`, notify `domain_live`; past `created_at + 72 h` → `failed` with Vercel's message or the proposed copy, notify `domain_failed`. Returns `again` while non-terminal.
- Sender: `verifyDkim` + `verifyReturnPath`; both → `verified`, `verified_at`, `dmarc_ok` = any TXT at `_dmarc.<domain>` starting `v=DMARC1` (lookup failure → false; never blocks), notify `sender_verified`; 72 h → `failed`.
- Worker: jobs `domain-verify { domainId }`, `sender-verify { sendingDomainId }` (`short`, retryLimit 2); `again` → re-enqueue itself with `startAfter` and the same singleton key; vendors null → log + done. `notify` → `deps.domainEmail` sends `agency_domain_notice` (Rival Monday branding, `settingsUrl` `${APP_URL}/agency/settings/domains`) to active agency-admin contacts; failures logged, never thrown. Enqueue from web uses the Task 10 keys.
- **Follow pattern:** `apps/worker/src/jobs/ask.ts` (job), `jobs/billing-notices.ts` `deliver` (recipients), `templates/billing-notice.tsx`.
**Copy (proposed):** subjects `Your domain {name} is live` / `We couldn't verify {name}` / `Email from {name} is ready` / `We couldn't verify email for {name}`; bodies one line each: "Client links now use {name}." / "{error} Check the DNS records on the Domains page and try again." / "Client emails now come from {name}." / same failure line; timeout error "We couldn't verify this domain within 72 hours."; action label `Open Domains`.
**Tests (TDD):** `pending + Vercel unverified → again, records updated`; `verified + probe fails → verifying, again`; `verified + probe ok → live, one notice`; `re-running a live row is done, no second notice`; `72 h → failed with Vercel message`; `removed meanwhile → done, no write`; sender `both verified → verified + dmarc_ok true`, `no DMARC → dmarc_ok false but verified`, `72 h → failed`; worker `again re-enqueues with startAfter 600 and the singleton`; template `renders each kind, Rival Monday branded`.
**Done when:** `pnpm --filter @cs/tools exec vitest run verify`, `pnpm --filter @cs/worker exec vitest run domains`, `pnpm --filter @cs/email exec vitest run agency-domain-notice render` green; `pnpm typecheck`.

### Task 12: Domains page + console slug control
**Goal:** agency admin UI for both domains in every state; operator slug edit.
**Files:** new `apps/web/src/app/(app)/agency/settings/domains/{page.tsx,actions.ts,domain-panel.tsx,sending-panel.tsx}` (+tests); `components/shell/nav-items.ts` (`/agency/settings/domains`, "Domains", admins, `isUser`); `app/(platform)/platform/agencies/[id]/{page.tsx,actions.ts}`; `scripts/e2e-affected-rules.ts` (`@domains`, `@hosts`).
**Behaviour:**
- Page (admin; support session → 404 like billing): reads `get_agency_domains`. Custom panel: none → hostname input + Save; `pending`/`verifying` → DNS records table (type/name/value + `CopyButton`) and status chip; `live` → hostname + live date; `failed` → error + "Remove and try again"; Remove opens a confirm with the warning copy. Fallback host always shown.
- Sending panel: domain + local-part inputs; DKIM and Return-Path records; `verified` + `dmarcOk === false` → warning (never blocks); current From address shown (fallback when not verified).
- Results hoisted to always-mounted regions; controlled fields + `onReset` prevent; `WriteGuard`.
- Console: agency detail shows `host_slug` with an edit form (owner only) via `runTool(…'set_agency_host_slug')`.
- **Follow pattern:** `(app)/agency/settings/billing` page + `components/billing/client-billing-controls.tsx`; `(platform)/platform/agencies/[id]/billing-actions.ts`.
**Copy (proposed):** title `Domains`; sections `Web address`, `Email sending`; help "Add a CNAME record at your DNS provider. We check every 10 minutes for up to 72 hours." ; statuses `Waiting for DNS`, `Checking certificate`, `Live`, `Failed`; remove warning "Links in emails already sent to clients will stop working."; DMARC warning "Add a DMARC record for {domain} so inboxes trust these emails."; fallback line "Until then, clients use {fallbackHost}."; From line "Client emails come from {address}."
**Tests (TDD):** `renders each custom-domain state's copy and records`; `remove confirm shows the warning`; `sending panel shows DMARC warning only when verified and not ok`; `actions map refusals to their copy`; `nav shows Domains to admins only`; `read-only-guard covers the new controls`.
**Done when:** `pnpm --filter @cs/web exec vitest run domains nav-items read-only-guard agencies` and the e2e rules test (`--config scripts/vitest.scripts.config.ts`) green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 13: E2E — hosts, domains, MCP host
**Goal:** spec E2E for 13a1 plus updating specs that sign in client users on the platform host.
**Files:** `apps/web/playwright.config.ts` (`NEUTRAL_DOMAIN: 'localhost'`, `DOMAINS_FAKE_VENDORS: '1'`), `e2e/helpers.ts` (`agencyOrigin(slug)`, `MCP_ORIGIN`, `hostRequest(host, path, init)` = Node `http.request` to `127.0.0.1:3100` with `Host`), `e2e/seed.ts` (write `HOSTS_FIXTURE_FILE`: agency slug, another agency's client id); new `e2e/hosts.spec.ts`, `e2e/domains.spec.ts`; update `e2e/ai-connections.spec.ts` (connector URL, OAuth on the mcp host via `hostRequest`), `e2e/smoke.spec.ts` (owner link now lands on the agency host), any spec signing in `mcp-owner`/client owners on the platform host (grep `signIn(`/`requestMagicLink(` with client emails).
**Behaviour:** one magic-link sign-in per new spec at most (rate limit): sign `mcp-owner@e2e.test` in on the agency host once and save `agency-client-state.json`; staff/client cross-host cases copy session cookies to the other host's domain in a new context (same secret, different host) instead of signing in again.
**Tests (E2E, tags `@hosts`/`@domains`/`@ai-connections`):** `client signs in on the agency host and sees their client`; `agency admin session on the agency host is redirected to the platform`; `client-only session on the platform is redirected to the agency host`; `other agency's client on the agency host → 404`; `unknown host → 404` (via `hostRequest`); `agency host /agency → platform`; `domains page: set → pending with records, (DB) live → live, remove → fallback`; `sending: set → pending records, (DB) verified → From shows the domain`; `MCP: PAT works on mcp host, platform /mcp shows the moved message`.
**Done when:** `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` green; `pnpm --filter @cs/web e2e:affected`.

### Task 14: Part 1 docs + merge gate
**Files:** `docs/work/phase-13.md`.
**Behaviour:** Status/Next overwritten; "Interfaces" lists migrations `<A>`/`<A+1>`, `HostEnv`/`clientOriginFor`/`senderFor`, tools, jobs, routes, env; set `MCP_HOST_CUTOVER` = planned deploy date and `MCP_MOVED_UNTIL` = +90 days; owner verification: env on Vercel web + worker; `<slug>.<NEUTRAL_DOMAIN>` as a client; a real custom subdomain goes live; a sending domain verifies and a brief arrives From it; Claude reconnects to the mcp host, old URL shows the moved message. Backlog closures at merge: custom/sending domains (4b, 5a), connector name (6a part), `fromEmail` drop (5a T18 part), sign-in host branding (phase-11).
- [ ] **Final review (Part 1, most capable model):** `pnpm test:affected --base main`, `pnpm --filter @cs/web e2e:affected --base main`; check Review focus 1–5 against their pinned tests; one fix wave. Then `/rm-merge` **only with the owner's go-ahead**; Part 2 starts after Part 1 is on `main`.
**Done when:** work file ≤ 8 KB; `git ls-files --eol | grep crlf` prints nothing.

---

# Part 2 — 13a2: voice, scrubbing, leak check

### Task 15: Pre-flight (Part 2)
- [ ] Part 1 merged; `main` clean (except `next-env.d.ts`). Re-check Dependencies (phase-11 `/start` pages and templates exist as assumed). Conflict-scan Part 2 files (`writeBrief`, `buildWriterPrompt`, starting-point writer, `writeAlertText`, `processAlert`, recommendations writer, `deliverDueBriefs` auto-send, `updateAgencyBranding`, `productNameFor`, `kbNamesFor`, Ask `brandingFor`, root `layout.tsx` metadata, `client-billing.ts` product name).
- [ ] Claim migration numbers `<B>`, `<B+1>`; local test DB as Task 0.
- [ ] Ask the owner to approve Part 2 proposed copy (Tasks 16–20).
- **Done when:** work file updated; `pnpm test:affected` green.

### Task 16: Voice model + migrations `<B>`/`<B+1>`
**Goal:** spec `VoiceSettings`, `effectiveVoice`, term rules; storage (P18, P19).
**Files:** new `packages/core/src/voice.ts` (+test), core index; `packages/db/src/schema/{delivery.ts (AgencyBranding.voice, alert cols), tenancy.ts (client.voiceOverride), briefs.ts (brief cols)}`; migrations; new `packages/db/src/voice.test.ts`; `evidence.test.ts` client grant list; `packages/tools/src/settings.ts` (keep `voice` on save, P-branding).
**Interfaces:** spec `VoiceSettings` verbatim; `export const DEFAULT_VOICE: VoiceSettings = { tone: 'friendly', preferredTerms: [], bannedTerms: [] }`; `export const VoiceTerm = z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N} '\-]+$/u)`; `VoiceSettingsSchema` (≤ 20 each), `VoiceOverrideSchema = VoiceSettingsSchema.partial()`; `effectiveVoice(agencyVoice: Partial<VoiceSettings> | null | undefined, override: Partial<VoiceSettings> | null | undefined): VoiceSettings` (per field, default fills gaps); `export type ReviewReason = 'banned_term'`.
- `client.voiceOverride: jsonb('voice_override').$type<Partial<VoiceSettings> | null>()`; `brief`/`alert`: `reviewReason: text('review_reason')` + check `IN ('banned_term')`, `reviewTerms: jsonb('review_terms').$type<string[] | null>()`.
**Custom migration `<B+1>` (full):**
```sql
GRANT UPDATE (voice_override) ON client TO app_user;
```
**Tests (TDD):** `override with only bannedTerms inherits tone and preferredTerms`; `explicit empty bannedTerms override clears agency terms`; `null override = agency voice`; `no agency voice = DEFAULT_VOICE`; `term rules: 41 chars, "a*b", empty rejected; "can't", "Ünïcode", "co-op" accepted; 21 terms rejected`; db `review_reason 'other' rejected`; `app_user updates voice_override via withTenant`; branding `save without voice keeps stored voice`.
**Done when:** `pnpm --filter @cs/db generate` "No schema changes"; `pnpm --filter @cs/core exec vitest run voice`, `pnpm --filter @cs/db exec vitest run voice evidence tenant`, `pnpm --filter @cs/tools exec vitest run settings` green; `pnpm typecheck`.

### Task 17: Voice tools + preview
**Goal:** spec `update_agency_voice`, `update_client_voice`, `preview_voice`; P18 read; P21 limit.
**Files:** new `packages/tools/src/tools/voice.ts` (+test); `deps.ts` (`voicePreview?`); `all.ts`, `schemas.ts`, `access-marks.test.ts`, 8b doc; new `packages/engine/src/voice/preview.ts` (+test); `packages/ai/config/ai.yaml` (`voice_preview` = brief_writer routing, `max_tokens: 400`, + `config.test.ts`); `apps/web/src/server/tools.ts` (wire `voicePreview`).
**Interfaces:** `get_voice_settings { clientId?: uuid }` → `{ agency: VoiceSettings; override: Partial<VoiceSettings> | null; effective: VoiceSettings }` (read, agency roles, web); `update_agency_voice { voice: VoiceSettingsSchema }` (write, admin); `update_client_voice { clientId, override: VoiceOverrideSchema.nullable() }` (write, agency roles, `canAccessClient`); `preview_voice { clientId?: uuid }` → `{ text: string }` (write — paid call; agency roles); `export const VOICE_PREVIEWS_PER_DAY = 10`; `ToolDeps.voicePreview?: (voice: VoiceSettings, scope: CallScope) => Promise<string>`; engine `writeVoicePreview(ai, scope, voice): Promise<string>` over a fixed demo evidence paragraph (constant in `preview.ts`).
**Behaviour:** agency voice merges into `branding.voice` with a jsonb `||` update (other branding keys untouched); client override via `withTenant` + the Task 16 grant; preview: ≥ 10 `llm_call` rows (`task='voice_preview'`, agency, since UTC midnight) → refuse; skipped under `ctx.support` (write); absent `voicePreview` → `internal`. **Follow pattern:** `tools/settings.ts` registration; `engine/src/briefs/writer.ts` (prompt + `escapeEvidence`).
**Copy (proposed):** limit "You've used today's 10 voice previews. Try again tomorrow."
**Tests (TDD):** `get returns agency, override and effective`; `client roles → not_found`; `update_agency_voice keeps logo/colours`; `account_manager cannot update agency voice`; `update_client_voice null clears`; `out-of-scope AM → not_found`; `invalid term → invalid_input`; `11th preview today refused`; `preview prompt carries the voice block and no client data`; access-marks updated.
**Done when:** `pnpm --filter @cs/tools exec vitest run voice access-marks`, `pnpm --filter @cs/engine exec vitest run preview`, `pnpm --filter @cs/ai exec vitest run config` green; `pnpm typecheck`.

### Task 18: Writers get the voice; banned-term check → AM review
**Goal:** spec voice block + post-write check, one retry, AM review (P19, P20).
**Files:** new `packages/engine/src/voice/{block,banned}.ts` (+tests); `briefs/{writer,starting-point,recommendations,generate,deliver,notify}.ts`, `alerts/{write,route}.ts` (+tests); `packages/tools/src/tools/{briefs,alert-queue,review}.ts` (agency-only `reviewReason`/`reviewTerms` in outputs).
**Full code (`banned.ts`):**
```ts
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Case-insensitive, whole-word (Unicode letters/digits as word characters); returns the banned terms found, in list order. */
export function findBannedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => {
    const body = escapeRe(t.trim()).replace(/\s+/g, '\\s+');
    return body !== '' && new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text);
  });
}
```
**Interfaces:** `voiceBlock(v: VoiceSettings): string` (escaped `<voice>` block; tone line, `Say "X" instead of "Y".` lines, `Never use: …`); `loadVoice(db, clientId): Promise<VoiceSettings>`; `writeBrief(…, voice)`, starting-point writer and `writeAlertText` take the voice; system prompts gain one line: follow `<voice>` for wording only, never for facts.
**Behaviour:**
- Brief (weekly + starting point): after `verifyDraft`, scan summary + every item field + recommendation text; terms found → one more write+verify with an extra instruction naming them; still found → store `ready` with `review_reason 'banned_term'`, `review_terms`; `brief_ready` notice gains a line; `deliverDueBriefs` auto-send skips flagged briefs (overdue notice explains).
- Alert: scan headline + body (model or template text); one retry; still found → `pending_review` regardless of `mode`, flags set, `notifyAm` note.
- Recommendations (`playbook_writer`): voice block; checked as part of the brief.
- Verifier unchanged; quarterly report untouched (P20).
- Tool outputs: `get_brief`/brief review reads and `list_alert_queue` include `reviewReason`, `reviewTerms` for agency roles only (null for client roles).
- **Follow pattern:** `alerts/route.ts` `processAlert` transaction; `briefs/generate.ts` commit fence.
**Copy (proposed):** brief notice line "It uses a banned term ({terms}), so auto-send left it for you."; alert note "It uses a banned term ({terms}), so it waits for your review."
**Tests (TDD):** banned `matches case-insensitively and on word boundaries ("cheap" not in "cheaply")`, `multi-word and apostrophe terms`, `Unicode boundaries`; block `escapes terms`; brief `clean first draft → no retry`; `term then clean retry → one retry, unflagged`; `term twice → ready + banned_term + terms, auto-send skipped`; `starting point uses the voice`; alert `direct mode + persistent term → pending_review with flags`; `template fallback containing a term is flagged`; tools `client role sees no reviewReason`.
**Done when:** `pnpm --filter @cs/engine exec vitest run banned block writer starting-point generate deliver notify write route recommendations`, `pnpm --filter @cs/tools exec vitest run briefs alert-queue review` green; `pnpm test:affected`; `pnpm typecheck`.

### Task 19: Voice UI + AM highlight
**Goal:** spec web: Branding → Voice section; Settings → Client customisation page; banned terms highlighted in AM review.
**Files:** `apps/web/src/app/(app)/agency/branding/{page.tsx,actions.ts}`, new `voice-form.tsx` (+test); new `apps/web/src/app/(app)/c/[clientId]/settings/customisation/{page.tsx,actions.ts,customisation-form.tsx}` (+tests); new `components/voice-fields.tsx`, `components/highlight-terms.tsx`; `components/shell/nav-items.ts` (agency roles: `Client customisation`); `app/(app)/agency/approvals/[briefId]/page.tsx`, `app/(app)/agency/alerts/{page.tsx,alert-controls.tsx}`; `scripts/e2e-affected-rules.ts`.
**Behaviour:** shared `VoiceFields`: tone radio (3), preferred-term rows (say / instead of, add/remove, ≤ 20), banned-term chips (≤ 20); client page adds "Use agency default" per field (unchecked field = omitted from the override; all default → `null`); Preview button (calls `preview_voice`, shows the paragraph, hoisted message); `WriteGuard`; controlled + `onReset` prevent. Client page 404 for client roles. Approvals/alerts show a flag chip and wrap each `reviewTerms` match in `<mark>` via `HighlightTerms` (uses `findBannedTerms`-equivalent client-safe matcher from `@cs/core`).
**Copy (proposed):** section `Voice`; tone labels `Friendly`, `Formal`, `Direct` with hints "Warm and plain.", "Courteous and businesslike.", "Short sentences, the point first."; `Preferred words` ("Say … instead of …"); `Banned words`; `Preview`; saved "Saved. New briefs and alerts use this voice."; page title `Client customisation`; checkbox `Use agency default`; chip `Banned term`.
**Tests (TDD):** `voice form caps terms at 20 and validates characters`; `customisation sends only overridden fields, null when all default`; `client role → 404`; `preview shows text and the limit copy`; `HighlightTerms marks whole words only`; `approvals show the banned-term chip`; nav + read-only-guard.
**Done when:** `pnpm --filter @cs/web exec vitest run voice customisation highlight approvals alert-controls nav-items read-only-guard` + e2e rules test green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 20: Scrubbing
**Goal:** spec scrubbing list except Stripe/leak tests (P17, P22, P24).
**Files:** `apps/web/src/app/layout.tsx` (+`layout.test.tsx`), new `(app)/c/[clientId]/layout.tsx`, every client page under `(app)/c/[clientId]/**/page.tsx` (22) + `(app)/inbox`, `(app)/settings/notifications`, `(app)/kb/[id]` (`metadata.title`), `(app)/c/[clientId]/settings/billing/page.tsx` (drop its own suffix) + `brand-leak.test.tsx`; new `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`; new `apps/web/public/neutral-icon.svg`; `components/client-profile-form.tsx`; phase-11 `/start*` pages; `packages/mcp/src/branding.ts`, `packages/tools/src/kb/names.ts`, `packages/ask/src/turn.ts` (+tests).
**Behaviour:**
- Root `generateMetadata` (host-aware via `requestHost`): platform → today's title; agency → `title: { default: displayName, template: '%s · ' + displayName }`, `icons.icon` = rehosted logo else `/neutral-icon.svg`; mcp → neutral title, neutral icon. Never `generator`; `poweredByHeader: false` stays (test).
- `(app)/c/[clientId]/layout.tsx` adds the same template for agency viewers on the platform host; page titles = nav labels (`Overview`, `Competitors`, …, `Client customisation`, `Billing`).
- `not-found.tsx` / `error.tsx` / `global-error.tsx`: plain neutral copy, no wordmark on agency/mcp hosts (platform keeps the wordmark).
- Client profile help line rewritten; `/start*` neutral (no wordmark/name) until an agency is assigned, agency-branded on agency hosts.
- Name fallbacks per P17.
- **Follow pattern:** `c/[clientId]/settings/billing/page.tsx` `generateMetadata`.
**Copy (proposed):** profile line "Lets us benchmark the business's own reviews against its competitors."; 404 "Page not found" / "This page doesn't exist or you don't have access to it."; error "Something went wrong" / "Please try again in a moment."; neutral title `Sign in` (mcp host).
**Tests (TDD):** layout `agency host title template uses displayName`, `favicon is the agency logo, neutral without one`, `no generator meta`, `platform title unchanged`; client layout `pages render "{page} · {displayName}"`; `not-found has no Rival Monday on agency host`; `productNameFor/kbNamesFor/Ask fall back to the agency name`; `/start neutral without an agency`.
**Done when:** `pnpm --filter @cs/web exec vitest run layout brand-leak not-found error client-profile start`, `pnpm --filter @cs/mcp test`, `pnpm --filter @cs/tools exec vitest run names`, `pnpm --filter @cs/ask test` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 21: Stripe product name + leak unit tests
**Goal:** spec Stripe item (P23) and the unit leak check.
**Files:** `packages/tools/src/tools/client-billing.ts` (~line 221) + test; new `packages/core/src/white-label.ts` (`export const PLATFORM_BRAND_RE = /rival\s?monday|rivalmonday/i`); new `packages/email/src/leak.test.ts`, `packages/mcp/src/leak.test.ts`, `packages/ask/src/leak.test.ts`; `packages/engine/src/briefs/pdf.test.ts`, `reports/quarterly.test.ts`.
**Behaviour:** product name `${resolveBranding(a.name, a.branding).displayName} competitor monitoring`. Leak fixtures use agency "Cool Agency" with **no** branding (worst case: defaults) and APP_URL `https://rivalmonday.app` with hostEnv neutral `example-neutral.test`.
**Tests (TDD):** `Connect product uses displayName`; email `every client template renders with no platform brand` — `alert`, `alert_digest`, `brief`, `trend_report`, starting-point/scorecard brief, `sign_in` (non-signup), `client_billing_notice`, `client_invite`, `competitor_review` — subject + html + text; engine `brief and report PDF meta and html have no platform brand` (fake `PdfRenderer` captures meta); mcp `tool descriptions, server name and MCP outputs for a client role have no platform brand` (list_briefs/get_brief/fetch/list_alerts URLs on the client origin); ask `system prompt and guard templates for an unbranded agency have no platform brand`.
**Done when:** `pnpm --filter @cs/tools exec vitest run client-billing`, `pnpm --filter @cs/email exec vitest run leak`, `pnpm --filter @cs/mcp exec vitest run leak`, `pnpm --filter @cs/ask exec vitest run leak`, `pnpm --filter @cs/engine exec vitest run pdf quarterly` green; `pnpm typecheck`.

### Task 22: E2E — leak crawl, voice, customisation
**Goal:** spec E2E for 13a2.
**Files:** new `apps/web/e2e/white-label.spec.ts`; `e2e/seed.ts` (E2E Agency branding without the word "Rival"; a flagged ready brief); `scripts/e2e-affected-rules.ts` (`@whitelabel`, rules for layout/not-found/error/titles → `@whitelabel`).
**Behaviour:** reuse Task 13's `agency-client-state.json`. Crawl as the client on the agency host: breadth-first over same-origin links from `/c/<id>` (≤ 60 pages) plus `/inbox`, `/settings/notifications`, a 404 path and signed-out `/sign-in`, `/link-expired`; for each response assert `PLATFORM_BRAND_RE` absent from HTML, `<title>`, response headers and every redirect hop (`request.redirectedFrom()` chain).
**Tests (E2E, `@whitelabel` + module tags):** `client pages on the agency host never name the platform`; `agency admin saves a voice and previews it`; `client customisation override saves and resets to default`; `a flagged brief shows the banned-term chip and highlight`.
**Done when:** e2e rules test green; `pnpm --filter @cs/web e2e:affected`.

### Task 23: Part 2 docs + demo coverage
**Files:** `docs/work/phase-13.md`; `packages/demo/src/coverage.ts` + README (`coverage:readme`) for the Domains and Client customisation screens (seed a fallback-only domain state and one client override in demo).
**Behaviour:** Status/Next; interfaces (migrations, voice tools, columns, `PLATFORM_BRAND_RE`); owner verification: banned term + `brief-once` on `cs_dev` → flagged brief; voice preview; agency-host titles/favicon; Checkout shows the agency name. Closures at merge: agency voice (4a), Connect product (9b M9), tab titles (9b R18).
- [ ] **Final review (Part 2, most capable model):** `pnpm test:affected --base main`, `pnpm --filter @cs/web e2e:affected --base main`; Review focus re-checked (focus 5 via Task 21); one fix wave; `/rm-merge` only with the owner's go-ahead.
**Done when:** `pnpm --filter @cs/demo exec vitest run coverage` green; work file ≤ 8 KB; `git ls-files --eol | grep crlf` prints nothing.
