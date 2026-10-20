# Phase 7a2 — Security & data lifecycle (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; implementers write code + tests from Behaviour + Tests. Full code appears only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Owner-approved 2026-10-19.**

**Goal:** Close the security and data-lifecycle gaps before any real pilot agency is onboarded (spec D1): one SSRF guard, Ask pinned to its thread's client with request checks and a per-turn budget, plan feature flags and MCP client scope, KB URL validation, no-overwrite object store, support-session audit gaps, Postmark bounce handling, archival + purge, lead PII cap and stale-outbox skipping.

**Spec:** `docs/superpowers/specs/2026-10-19-phase-7a-launch-production-security-design.md` §2 (D11–D19), §4, §6–§10 (binding). Runs after 7a1's code tasks (needs `@cs/core/server` from 7a1 Task 1); does not wait for 7a1's live deploy.

## Global constraints
- Root `CLAUDE.md` Essentials, `docs/gotchas-cross-cutting.md`, each touched package's `CLAUDE.md`. Never print/stage `.env`; ask the owner before adding vars (`POSTMARK_WEBHOOK_SECRET` is new; code runs with it unset).
- Refusals stay indistinguishable: tool invisible → `not_found` → page 404. **No new `ToolErrorCode`** (spec D13).
- Web reads via registered tools (`callTool`); web writes via `runTool`. `server/theme.ts` stays direct (spec §4).
- **Evidence, captures and objects are never deleted or pruned** (spec D17). Event readers keep `retracted_at IS NULL`.
- Never edit applied migrations; RLS/grant rules per `packages/db/CLAUDE.md`. Model input via `redactForModel`.
- 7a2's only edit to a 13a-owned file is the `proxy.ts` `PUBLIC` entry for the Postmark webhook (spec §6); no sender code.
- Commits end `Co-Authored-By: <model> <noreply@anthropic.com>`; LF only. Test scope: root `CLAUDE.md` § Process 6.

## Decisions (plan-local; spec §2 binds)
1. **`AccessContext.planFeatures`** is set by `createAccessContext` from optional input `planFeatures` (default both, so tests and support contexts keep today's behaviour); `accessContextFor` and `guestAccessFor` always pass it explicitly from `planFeaturesFor()` (test-enforced). No billing row, `planId` null or state `pilot` ⇒ both on.
2. **Plan gate also hides `feature: 'ask' | 'mcp'` web tools** (Ask thread lists), so plan-off reads as "not found" on every channel.
3. **One scoping helper:** `scopeToClient(ctx, clientId)` (`@cs/core` access.ts) builds the pinned context (no `support`, keeps `features` and `planFeatures`); `turn.ts`'s evidence-access context and `confirmAskAction` reuse it.
4. **Ask early gate** resolves the viewer with no client hint: signed-in user, not a contact, plan has `ask`. The client-level `ask` feature is checked after parsing, against the client-hinted viewer (a null-hint context may belong to another single-client membership).
5. **Unknown model cost** (`trace.costUsd === null`) never triggers the $0.30 budget; the step limit and deadline still bound the turn.
6. **SSRF guard lookup failures** propagate as ordinary fetch errors (not `ssrf_blocked`); only a non-public address or URL is `ssrf_blocked`. Chromium resolves DNS itself, so a rebinding race between our check and its connection remains (documented; spec accepts a route-level check).
7. **Purge leaves Better Auth users** (sign-in → `/no-access`); anonymises `audit_log.user_id` of guest contacts (`contact:<id>`) of a purged client too. One `platform_audit_log` row per archive/undo and per purge run (`user_id = 'cli'`).
8. **`skipped` notifications** read like `failed` everywhere a status is shown or counted.

## File structure
- `packages/db/migrations/<next>_lifecycle.sql`; `packages/db/src/schema/{tenancy,billing,delivery,ledger}.ts`; `packages/db/src/filters.ts`
- `packages/collectors/src/net/guard.ts` (+ test), `packages/collectors/src/web/{user-agent,renderer,robots}.ts`, `packages/collectors/src/index.ts`; delete `packages/tools/src/kb/public-url.ts` (+ test)
- `packages/tools/src/{index.ts,kb/import-error.ts,kb/write.ts,tools/knowledge-admin.ts}`, `apps/worker/src/jobs/kb.ts`
- `packages/core/src/{access,tools,tokens}.ts`; `packages/tools/src/access/{memberships,plan-features}.ts`
- `packages/ask/src/turn.ts`; `apps/web/src/server/ask.ts`; `apps/web/src/app/api/ask/turn/route.ts`; `apps/web/src/app/(app)/c/[clientId]/ask/actions.ts`
- `packages/storage/src/{store,fs,memory,r2,contract}.ts`, `r2.live.test.ts`; callers listed in Task 6
- `packages/tools/src/tools/{settings,support}.ts`, `packages/tools/src/platform/audit.ts`; pages/routes listed in Task 7
- `apps/web/src/app/api/postmark/webhook/route.ts`, `packages/engine/src/delivery/{bounces,outbox}.ts`, `packages/email/src/types.ts`
- `apps/worker/src/cli/{archive,archive-args,purge-archived,purge-args}.ts`, `apps/worker/src/jobs/leads.ts`
- `apps/web/e2e/ops.spec.ts` (7a1) or new `apps/web/e2e/security.spec.ts`, `docs/DEPLOY.md`

## Dependencies on in-flight work (re-check in Task 0)
- **phase-14b** (unmerged): `packages/db/src/schema/ledger.ts` (`llm_call.vertical_id`, 0078) — this plan edits the same file (drops FKs); migrations `0077`–`0079`; new tools/jobs (archival filters + plan gating must cover any new client/agency scheduler or MCP/Ask tool).
- **13a** (plan on `main`): `proxy.ts` (only the `PUBLIC` hunk here), per-agency Postmark servers (the webhook keys on `notification.provider_id`, so their URL is reused), `turbo.json` env list.
- **phase-15b** (planning): may touch KB (`kb/seed.ts`, page keys) and claim a migration. **7a1**: `@cs/core/server` (`hashInput`), migration `0081_runtime_roles`. Migration number = next free at execution (assumed `0082`).

## Review focus
1. **SSRF address forms** — SIIT `::ffff:0:a.b.c.d`, mapped `::ffff:127.0.0.1`, NAT64 `64:ff9b::7f00:1`, 6to4, decimal host `http://2130706433/`, DNS answers mixing public + private, a redirect hop or sub-resource to `127.0.0.1`, and a service worker/WebSocket bypass (Task 2 tests).
2. **Ask cross-client reach** — the model passes another in-scope client's id to `search`/`fetch`/`search_events`; a confirmed action whose input names a different `clientId`; a non-`ASK_WRITE_TOOLS` tool in a stored action (Task 4 tests).
3. **Malformed Ask requests** — no/foreign `Origin`, `text/plain`, a chunked body over 32 KB without `Content-Length`, invalid JSON from a refused user (404, never 400) (Task 5 tests).
4. **Purge** — ledger/audit rows survive detached and anonymised, evidence/captures untouched, `< 30d` refused, a user with another membership keeps their audit identity, dry-run writes nothing (Task 10 tests).
5. **Postmark webhook** — missing/wrong auth 401, unset secret 404, unknown `MessageID` 200 + no change, soft bounce no change, mixed-case address matches, a retried delivery creates one notice (Task 8 tests).

---

### Task 0: Pre-flight
**Goal:** Prove assumptions; fix the plan inline where they fail.
**Steps:**
- `git fetch && git rebase main` (7a1 code tasks merged or stacked: `@cs/core/server` must exist); `pnpm install`; own test DB.
- Re-check **Dependencies** (`git branch --no-merged main`); claim the next free migration number.
- **Purge blockers:** on the test DB run `SELECT conrelid::regclass, conname, confdeltype FROM pg_constraint WHERE contype = 'f' AND confrelid IN ('agency'::regclass, 'client'::regclass);` and repeat for every table reached by cascade; list any `confdeltype` other than `c`/`n` and any non-internal trigger (`pg_trigger`) that blocks DELETE on a cascaded table. Each blocker → a Task 1 migration line (cascade or detach) or a Task 10 pre-delete step; record in the work file.
- **R2 `IfNoneMatch`:** with owner-provided R2 test creds (else skip and use HEAD-then-put), run `r2.live.test.ts`'s new case.
- `rg "fetch\(" packages/collectors/src --glob '!*.test.ts'` — every fetch of a user/page-supplied URL must move to `guardedFetchText` (vendor API hosts are fixed and stay).
- `rg "notification\.status|'failed'" packages apps --glob '!*.test.*'` — list status readers for Decision 8.
- Conflict-scan every task's Files against `main`.
**Done when:** findings recorded in `docs/work/phase-7.md`; plan edited where needed.

### Task 1: Lifecycle migration + schema
**Goal:** Columns, constraints and FK changes the later tasks need, in one migration.
**Files:** create `packages/db/migrations/<next>_lifecycle.sql` (`generate --custom --name=lifecycle`); modify `packages/db/src/schema/{tenancy,billing,delivery,ledger}.ts`, `packages/db/src/schema.test.ts` / privilege guard tests as needed; create `packages/db/src/lifecycle.test.ts`.
**Interfaces:** `agency.archivedAt`, `client.archivedAt` (`timestamptz` null); `plan.features` (`jsonb`, `$type<PlanFeature[]>()`); `NotificationStatus` += `'skipped'`; `.references()` removed from `auditLog.agencyId`, `llmCall.agencyId/clientId`, `vendorCall.agencyId/clientId` (columns kept).
**SQL** (+ Task 0 blockers):
```sql
ALTER TABLE agency ADD COLUMN archived_at timestamptz;
--> statement-breakpoint
ALTER TABLE client ADD COLUMN archived_at timestamptz;
--> statement-breakpoint
ALTER TABLE plan ADD COLUMN features jsonb NOT NULL DEFAULT '["ask","mcp"]'::jsonb;
--> statement-breakpoint
ALTER TABLE plan ADD CONSTRAINT plan_features_check CHECK (jsonb_typeof(features) = 'array' AND features <@ '["ask","mcp"]'::jsonb);
--> statement-breakpoint
ALTER TABLE notification DROP CONSTRAINT notification_status_check;
--> statement-breakpoint
ALTER TABLE notification ADD CONSTRAINT notification_status_check CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped'));
--> statement-breakpoint
ALTER TABLE audit_log DROP CONSTRAINT audit_log_agency_id_agency_id_fk;
--> statement-breakpoint
ALTER TABLE llm_call DROP CONSTRAINT llm_call_agency_id_agency_id_fk;
--> statement-breakpoint
ALTER TABLE llm_call DROP CONSTRAINT llm_call_client_id_client_id_fk;
--> statement-breakpoint
ALTER TABLE vendor_call DROP CONSTRAINT vendor_call_agency_id_agency_id_fk;
--> statement-breakpoint
ALTER TABLE vendor_call DROP CONSTRAINT vendor_call_client_id_client_id_fk;
--> statement-breakpoint
DROP POLICY client_isolation ON client;
--> statement-breakpoint
CREATE POLICY client_isolation ON client FOR ALL
  USING (agency_id = app_agency_id() AND app_client_visible(id) AND archived_at IS NULL)
  WITH CHECK (agency_id = app_agency_id() AND app_client_visible(id));
```
**Behaviour:** `archived_at` is service-role only: `app_user` has no `UPDATE` on `agency`, and `client` UPDATE is column-granted (do not add `archived_at`). Snapshot/journal regenerated so `generate` reports no changes.
**Tests (TDD):** `app_user cannot see an archived client`; `app_user cannot update archived_at` (permission denied); `plan.features defaults to ask+mcp and rejects "sms"`; `notification accepts skipped`; `deleting an agency keeps its audit_log/llm_call/vendor_call rows`.
**Done when:** `pnpm --filter @cs/db exec vitest run lifecycle schema`, `drizzle-kit check`, `pnpm --filter @cs/db generate` = no changes.

### Task 2: One SSRF guard (+ KB URL rules)
**Goal:** Every user/page-supplied URL, redirect hop and Playwright request is checked against public addresses (spec D11); KB writers and import scope are validated.
**Files:** create `packages/collectors/src/net/guard.ts` (+ `guard.test.ts`, moved table from `tools/src/kb/public-url.test.ts`); modify `packages/collectors/src/web/{user-agent,renderer,robots}.ts` (+ tests), `packages/collectors/src/index.ts`, `packages/tools/src/{index.ts,kb/import-error.ts,kb/write.ts,tools/knowledge-admin.ts}` (+ tests), `apps/worker/src/jobs/kb.ts` (+ test), the KB import UI copy map (`rg "off_site" apps/web/src`); delete `packages/tools/src/kb/public-url.ts` (+ test).
**Interfaces:** spec §4 verbatim (`isPublicAddress`, `isPublicHttpUrl`, `assertPublicUrl`, `SsrfBlockedError`, `guardedFetchText`), plus `export type LookupFn = (host: string) => Promise<string[]>`; `createPlaywrightRenderer(opts & { assertUrl?: (url: string) => Promise<void> })` (default `assertPublicUrl`); `IMPORT_ERRORS` += `'not_public'`.
**Behaviour (security-sensitive):**
- `isPublicAddress`: moved; add before the IPv4-compatible rule: `h[0..3] === 0 && h[4] === 0xffff && h[5] === 0` (SIIT `::ffff:0:0:0/96`) ⇒ `false`; mapped `::ffff:0:0/96` stays judged by its IPv4.
- `assertPublicUrl(url, lookup)`: `!isPublicHttpUrl(url)` ⇒ throw `SsrfBlockedError`; IP-literal host ⇒ done; else `lookup` (default `dns.promises.lookup(host, { all: true, verbatim: true })`) — empty result or any non-public address ⇒ throw; lookup errors propagate (Decision 6).
- `guardedFetchText`: `redirect: 'manual'`, ≤ 5 hops, resolve relative `Location` against the current URL, `assertPublicUrl` before every hop, same UA/accept headers, one 10 s overall timeout, body capped as today; `finalUrl` = last URL. `defaultFetchText = guardedFetchText`; `RobotsPolicy` keeps "unreachable ⇒ disallow" for `SsrfBlockedError`.
- Renderer: `newContext({ …, serviceWorkers: 'block' })`; `context.routeWebSocket('**', (ws) => ws.close())`; `context.route('**/*')` — non-http(s) continue; else `await assertUrl(u)` → `continue()`, on failure `abort('blockedbyclient')` and, when it is the main-frame navigation, mark the page → `emptyPage(url, 'error', 'ssrf_blocked')` (no DB change). Existing renderer tests on `127.0.0.1` fixtures inject a permissive `assertUrl`.
- KB: `saveArticle` throws `ToolError('invalid_input')` for a non-null `sourceUrl` failing `isPublicHttpUrl`; `import_kb_url` checks the agency exists and, for `client` level, the client belongs to it (`invalid_input`) before enqueue; worker `fetchMarkdown` uses `assertPublicUrl` with `deps.resolveHost`, maps `SsrfBlockedError`/`page.error === 'ssrf_blocked'` → `'not_public'`. Copy: `not_public: 'That address is not a public web page.'`
- `@cs/tools` re-exports `isPublicAddress`/`isPublicHttpUrl` from `@cs/collectors`.
**Tests (TDD):** address table incl. SIIT/mapped/NAT64/6to4/ULA/link-local/CGNAT/`2130706433`; `assertPublicUrl rejects a host resolving to one private + one public address`; `guardedFetchText stops at a redirect to 127.0.0.1` (fake fetch + lookup); `stops after 5 hops`; `renderer aborts a redirect to 127.0.0.1` (local fixture, guard admits only the start URL) → `error 'ssrf_blocked'`; `renderer blocks a sub-resource to 127.0.0.1 but renders the page`; `robots: blocked robots URL ⇒ disallow`; `saveArticle rejects a file: sourceUrl`; `import_kb_url rejects a client of another agency`; `kb-import maps ssrf to not_public`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run guard renderer robots user-agent`, `pnpm --filter @cs/tools exec vitest run knowledge write`, `pnpm --filter @cs/worker exec vitest run kb` pass.

### Task 3: Plan feature flags + MCP client scope
**Goal:** `plan.features` gates Ask and MCP for every role (spec D13); `client_owner` may hold `manage` (D14).
**Files:** create `packages/tools/src/access/plan-features.ts` (+ test); modify `packages/core/src/{access,tools,tokens}.ts` (+ tests), `packages/tools/src/access/memberships.ts` (+ test), `packages/mcp/src/*` tests touching scopes, any UI listing grantable scopes (`rg grantableScopes apps/web/src`).
**Interfaces:**
```ts
// @cs/core access.ts
export const PLAN_FEATURES = ['ask', 'mcp'] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];
// AccessContext gains: readonly planFeatures: ReadonlySet<PlanFeature>;  AccessContextInput gains: planFeatures?: readonly PlanFeature[]
export function scopeToClient(ctx: AccessContext, clientId: string): AccessContext;
// tools
export async function planFeaturesFor(service: Db, agencyId: string): Promise<PlanFeature[]>;
```
**Behaviour:**
- `planFeaturesFor`: `agency_billing` left join `plan`; no row, `plan_id` null or `state = 'pilot'` ⇒ `['ask','mcp']`; else the plan's `features` filtered to known values.
- `isVisible`: channel feature (`mcp`/`ask`) must be in `ctx.planFeatures` for **every** role; a tool whose `feature` is a plan feature is hidden when absent (Decision 2). Existing client-feature rules unchanged.
- `grantableScopes('client_owner')` → `['read','feedback','manage']`; `client_viewer` → `['read']`. Role permission, client `features` and `clientScope` still bound every call.
- `scopeToClient`: `createAccessContext({ …ctx, clientScope: [clientId], planFeatures: [...ctx.planFeatures] })` without `support`.
**Tests (TDD):** `plan without mcp hides every mcp tool for agency_admin`; `plan without ask hides ask tools and ask-feature web tools for agency roles`; `no billing row → both on`; `pilot state → both on even if plan omits them`; `accessContextFor sets planFeatures from the DB`; `client_owner token with manage reaches a manage tool`; `client_viewer cannot be granted manage`; `scopeToClient drops support and keeps planFeatures`.
**Done when:** `pnpm --filter @cs/core exec vitest run access tools tokens`, `pnpm --filter @cs/tools exec vitest run memberships plan-features`, `pnpm --filter @cs/mcp exec vitest run` pass.

### Task 4: Ask — client pinning, action allowlist, per-turn budget
**Goal:** Every Ask tool call runs pinned to the thread's client; confirmed actions are allowlisted and client-matched; a turn stops spending at $0.30 (spec D12, §4).
**Files:** modify `packages/ask/src/turn.ts` (+ `turn.test.ts`), `packages/ask/src/index.ts`, `apps/web/src/app/(app)/c/[clientId]/ask/actions.ts` (+ test).
**Interfaces:**
```ts
export const ASK_TURN_BUDGET_USD = 0.30;               // @cs/ask
export function actionAllowed(action: { tool: string; input: unknown }, threadClientId: string): boolean;
```
**Behaviour:**
- `runTurn`: `const pinned = scopeToClient(ctx, thread.clientId)`; `describe`, `list` and every `registry.invoke` use `pinned` (the `search_knowledge` client override stays). The evidence-access context reuses `scopeToClient`.
- Budget: after each model call, if `trace.costUsd !== null && trace.costUsd >= ASK_TURN_BUDGET_USD`, the next call is the forced final (`toolChoice: 'none'`); set `trace.budgetHit = true` (`AskTrace` gains `budgetHit: boolean`). Null cost per Decision 5.
- `actionAllowed`: tool ∈ `ASK_WRITE_TOOLS` **and** every `clientId` key found in `input` (objects/arrays, depth ≤ 3) equals `threadClientId`; an input with no `clientId` is allowed only if the tool's schema has none (all three current tools take `clientId`, so require it).
- `confirmAskAction`: after the claim, `!actionAllowed(claimed.action, claimed.clientId)` ⇒ mark the action `failed` with `error: 'Not allowed'` (existing failed path), never call `runTool`; otherwise `runTool(scopeToClient(ctx, claimed.clientId), …, { channel: 'ask' })`.
**Tests (TDD):** `search_events with a foreign in-scope clientId returns not_found` (agency admin, two clients); `fetch of another client's evidence is refused`; `describe is computed with the pinned context`; `forced final once cost reaches 0.30` (scripted AI with costs 0.2, 0.15); `null cost never forces`; `actionAllowed rejects a non-write tool`; `rejects a mismatched nested clientId`; `confirm with a mismatched clientId marks failed and never runs the tool`.
**Done when:** `pnpm --filter @cs/ask exec vitest run turn`, the actions test, `pnpm --filter @cs/web e2e:affected` (`@ask`) pass.

### Task 5: Ask — request checks on `/api/ask/turn`
**Goal:** Refused users get 404 before any body handling; bad requests get 415/413 (spec §4 order).
**Files:** modify `apps/web/src/server/ask.ts`, `apps/web/src/app/api/ask/turn/route.ts`, `apps/web/src/app/api/ask/turn/route.test.ts`, `apps/web/src/server/ask.test.ts` (if present).
**Interfaces:**
```ts
export type AskTurnOptions = { viewerFor: (clientId: string | null) => Promise<Viewer | null>; deps: () => Promise<AskDeps>; keepAlive?: (turn: Promise<void>) => void };
export const ASK_MAX_BODY_BYTES = 32 * 1024;
export async function readCappedJson(req: Request, max: number): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }>;
```
**Behaviour (order binding; Decision 4):**
1. `viewerFor(null)`: not `kind: 'user'` or `userId` starts `contact:` or `!ctx.planFeatures.has('ask')` ⇒ 404.
2. Origin (security-sensitive):
```ts
const host = req.headers.get('host')?.toLowerCase() ?? null;
let originHost: string | null = null;
try { originHost = new URL(req.headers.get('origin') ?? '').host.toLowerCase(); } catch { originHost = null; }
if (!host || !originHost || originHost !== host) return notFound();
```
3. `content-type` media type (before `;`, trimmed, lower-cased) ≠ `application/json` ⇒ 415.
4. `readCappedJson`: `Content-Length` > max ⇒ 413; stream `req.body`, summing bytes, cancel + 413 past max; decode UTF-8, `JSON.parse` failure ⇒ 400.
5. `AskTurnBody` parse ⇒ 400; then `viewerFor(body.clientId)` and today's checks (contact, `hasFeature(ctx,'ask')`, plan, `canAccessClient`, `clientVisible`, serviceable, `beginTurn`).
- `route.ts`: no pre-parse; `handleAskTurn(req, { viewerFor: getViewerForClient, deps: () => askDeps(), keepAlive })`.
**Tests (TDD):** `signed-out → 404 even with a malformed body`; `plan without ask → 404 before body read`; `missing Origin → 404`; `foreign Origin → 404`; `text/plain → 415`; `Content-Length 40000 → 413`; `chunked 33 KB body without Content-Length → 413`; `invalid JSON → 400`; `valid request streams as today`; `client hint picks the membership covering the body's client`.
**Done when:** `pnpm --filter @cs/web exec vitest run ask`, `pnpm --filter @cs/web e2e:affected` (`@ask`) pass.

### Task 6: Object store never overwrites by default
**Goal:** `put` refuses an existing key unless told otherwise (spec D15).
**Files:** modify `packages/storage/src/{store,fs,memory,r2,contract}.ts`, `r2.live.test.ts`, `packages/tools/src/deps.ts` (`evidenceStore.put` opts), `apps/web/src/server/tools.ts` (adapter), `packages/tools/src/tools/agency-onboarding.ts`, `packages/collectors/src/rankings/map-refresh.ts`, `packages/engine/src/briefs/pdf.ts`, `packages/engine/src/reports/quarterly.ts`, `packages/demo/src/{evidence,briefs}.ts`, `apps/web/e2e/seed.ts` (+ affected tests).
**Interfaces:**
```ts
export class ObjectExistsError extends Error { readonly code = 'object_exists'; constructor(readonly key: string) }
export interface ObjectStore { put(key: string, body: Uint8Array, contentType: string, opts?: { overwrite?: boolean }): Promise<void>; /* get/exists unchanged */ }
```
**Behaviour:**
- fs: `writeFile(p, body, { flag: opts?.overwrite ? 'w' : 'wx' })`, `EEXIST` → `ObjectExistsError`. memory: same semantics. R2: `IfNoneMatch: '*'` (412 → `ObjectExistsError`) when Task 0 proved it, else `HeadObject` then put; `overwrite` ⇒ plain put.
- Logos and rank maps (content-addressed) catch `ObjectExistsError` as stored; brief/report PDFs pass `overwrite: true`; evidence (`recorder.ts`, `vendor-capture.ts`) propagates; demo and E2E seeds pass `overwrite: true` (re-seeding).
**Tests (TDD):** contract: `second put without overwrite throws ObjectExistsError`; `overwrite: true replaces`; `logo re-upload of the same bytes succeeds`; `rank map refresh with an existing key stores the row`; `brief PDF re-render overwrites`; live R2 case (skipped without creds).
**Done when:** `pnpm --filter @cs/storage exec vitest run`, affected package tests pass.

### Task 7: Support-session audit gaps
**Goal:** Every support-session read is audited in the target agency; `end_support_session` lands there too.
**Files:** modify `packages/tools/src/tools/settings.ts` (or new `packages/tools/src/tools/agency-settings-reads.ts`), `packages/tools/src/tools/{all,support}.ts`, `packages/tools/src/platform/audit.ts` (+ tests); pages `apps/web/src/app/(app)/agency/settings/{team,branding,slack-teams}/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/settings/delivery/page.tsx`, `apps/web/src/app/(app)/onboarding/page.tsx`; routes `apps/web/src/app/go/[target]/[id]/route.ts`, `apps/web/src/app/files/{brief/[id],report/[id],evidence/[clientId]/[evidenceId],rank-map/[clientId]}/route.ts`.
**Interfaces:**
```ts
// web-only read tools wrapping the service functions (outputs = their return shapes, zod-described):
// get_team → listTeam · get_agency_branding → getAgencyBranding · list_webhooks → listWebhooks · list_client_recipients({ clientId }) → listClientRecipients
export async function recordSupportAccess(service: Db, ctx: AccessContext, a: { surface: 'go' | 'evidence' | 'pdf' | 'rank_map'; subjectId: string }): Promise<void>;
```
**Behaviour:**
- Tools: `access: 'read'`, permission = the weakest role that reaches the page today; keep the service functions' own checks and 8b masking (`supportMask` for any unmasked email field). Pages switch to `callTool`; `server/theme.ts` stays direct.
- `recordSupportAccess` (no-op unless `ctx.support`): one `audit_log` row — `agency_id = ctx.agencyId`, `user_id = ctx.support.platformUserId`, `role = 'platform_support'`, `tool = 'support_view_<surface>'`, `input_hash = hashInput({ surface, subjectId })` (`@cs/core/server`), `outcome = 'ok'`, `channel = 'web'`, `support_session_id`. Called by `/go` and `/files/*` after access succeeds (logo route is public: not called).
- `end_support_session`: `audit: 'skip-web'`; writes `recordPlatformAudit` with `agencyId` = the ended session's agency and `supportSessionId`; no open session ⇒ `platform_audit_log` row. Role from `platformRoleForUser` (null ⇒ `'viewer'`).
**Tests (TDD):** `each new tool returns the service output and masks emails in a support context`; `support context call writes an audit row in the target agency`; `recordSupportAccess no-op outside support`; `/files/evidence in a support session writes support_view_evidence`; `end_support_session audits under the session's agency`.
**Done when:** focused tool tests, `pnpm --filter @cs/web e2e:affected` (`@support`) pass.

### Task 8: Postmark bounce & complaint webhook
**Goal:** Hard bounces and spam complaints deactivate the address agency-wide and notify the agency (spec D19).
**Files:** create `apps/web/src/app/api/postmark/webhook/route.ts` (+ test), `packages/engine/src/delivery/bounces.ts` (+ test); modify `packages/db/src/schema/delivery.ts` (`AGENCY_KINDS` += `'contact_bounced'`), `packages/email/src/types.ts` (`notice` union), `apps/web/src/server/inbox.ts`, `apps/web/src/app/(app)/agency/settings/slack-teams/webhook-controls.tsx`, `apps/web/src/server/env.ts` (`postmarkWebhookSecret?`), `apps/web/src/proxy.ts` (`PUBLIC` += `/^\/api\/postmark\/webhook$/`, same hunk as 7a1), `turbo.json`.
**Interfaces:**
```ts
export type PostmarkOutcome = 'deactivated' | 'ignored';
export async function handlePostmarkEvent(deps: { db: Db; delivery: DeliveryConfig | null }, event: unknown, now?: Date): Promise<PostmarkOutcome>;
export function postmarkAuthOk(header: string | null, secret: string): boolean;
```
**Behaviour:**
- Auth (security-sensitive):
```ts
export function postmarkAuthOk(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Basic ${Buffer.from(`postmark:${secret}`, 'utf8').toString('base64')}`, 'utf8');
  const got = Buffer.from(header ?? '', 'utf8');
  return got.length === expected.length && timingSafeEqual(got, expected);
}
```
  Secret unset ⇒ 404; auth fails ⇒ 401. After auth everything is 200 (parse errors logged).
- Handles `RecordType 'Bounce'` with `Type 'HardBounce'` and `RecordType 'SpamComplaint'`; others ⇒ `ignored`. Agency = `notification.agency_id` where `provider_id = MessageID` (none ⇒ log, `ignored`). One `db.transaction`: `contact.active = false` where agency + `lower(email) = lower(Email)`; for each affected contact with a `client_id`, `notify(tx, …)` kind `contact_bounced`, `audience: 'agency'`, dedupe `contact_bounced:<contactId>` (pattern `rank-notices.ts`). No delivery config ⇒ deactivate only.
- Decided copy: title `Emails to {email} are bouncing`; lines `We stopped sending to {email} ({clientName}) after a hard bounce.` (or `after a spam complaint.`), `Check the address in the client's delivery settings, then turn the contact back on.`; actionLabel `Open inbox`; inbox label `Contact bouncing`.
**Tests (TDD):** `401 on missing/wrong auth`; `404 when secret unset`; `hard bounce deactivates every contact with that address in the agency (case-insensitive)`; `contact in another agency untouched`; `soft bounce ignored`; `unknown MessageID ignored, 200`; `spam complaint deactivates`; `retry creates one notice`; `agency staff contact deactivated without a notice`.
**Done when:** `pnpm --filter @cs/engine exec vitest run bounces`, `pnpm --filter @cs/web exec vitest run postmark` pass.

### Task 9: Archival filters + `evidenceReferenced`
**Goal:** Archived agencies/clients behave as deleted for tenants and schedulers (spec D16).
**Files:** modify `packages/db/src/filters.ts` (+ `filters.test.ts` or nearest), `packages/tools/src/access/memberships.ts`, `packages/tools/src/tools/{portfolio,platform-console,search}.ts` and other service-role lists of agencies/clients found by `rg "from\(agency\)|from\(client\)" packages/tools/src apps/web/src --glob '!*.test.*'`, `packages/mcp/src/*` if it lists clients outside tools.
**Interfaces:**
```ts
export function evidenceReferenced(evidenceIdCol: AnyColumn | SQL): SQL;  // @cs/db filters.ts
```
**Behaviour:**
- `clientServiceable` adds `archived_at IS NULL` (both forms); `agencyServiceable` adds `NOT EXISTS (SELECT 1 FROM agency ax WHERE ax.id = <col> AND ax.archived_at IS NOT NULL)`.
- `listMemberships` drops rows whose agency or client is archived (→ `/no-access`; MCP `tokenAccess` inherits it).
- Service-role lists (portfolio, platform console/agencies, MCP `search`, billing seat counts via `countActiveClients`) exclude archived rows.
- `evidenceReferenced` (non-obvious, use as written):
```ts
sql`(EXISTS (SELECT 1 FROM brief_item bi WHERE bi.evidence_ids @> jsonb_build_array((${col})::text))
  OR EXISTS (SELECT 1 FROM recommendation r WHERE r.evidence_ids @> jsonb_build_array((${col})::text))
  OR EXISTS (SELECT 1 FROM alert a WHERE a.evidence_ids @> jsonb_build_array((${col})::text)))`
```
  Exported for future pruning; no caller deletes evidence in 7a.
**Tests (TDD):** `clientServiceable excludes an archived client`; `agencyServiceable excludes an archived agency`; `listMemberships omits archived agency and archived client memberships`; `portfolio and platform agency list hide archived rows`; `evidenceReferenced true via brief_item, recommendation and alert, false otherwise`.
**Done when:** focused tests, `pnpm test:affected` pass.

### Task 10: Archive + purge CLIs
**Goal:** Operators archive/unarchive and later purge agencies/clients without losing ledger/audit history or evidence.
**Files:** create `apps/worker/src/cli/{archive,archive-args,purge-archived,purge-args}.ts` (+ args tests), `apps/worker/src/purge.ts` (+ `purge.test.ts`); modify `apps/worker/package.json` (scripts `archive`, `purge-archived`).
**Interfaces:**
```ts
export type ArchiveArgs = { kind: 'agency' | 'client'; id: string; undo: boolean } | { error: string };
export type PurgeArgs = { olderThanDays: number; dryRun: boolean } | { error: string };   // '90d' → 90; < 30 → error
export async function purgeArchived(db: Db, o: { olderThanDays: number; dryRun: boolean; now?: Date }): Promise<{ agencies: number; clients: number; auditAnonymised: number }>;
```
**Behaviour:**
- CLIs use `SERVICE_DATABASE_URL` (pattern `cli/platform-admin.ts` + `platform-admin-args.ts`). `archive` sets/clears `archived_at` (unknown id ⇒ exit 1) and writes a `platform_audit_log` row (`user_id 'cli'`, `tool 'archive_<kind>'`/`'unarchive_<kind>'`, `hashInput` of args).
- `purgeArchived` (non-obvious), cutoff = `now − olderThanDays`:
  - each agency with `archived_at < cutoff`, one tx: `UPDATE audit_log SET user_id = 'purged' WHERE agency_id = $a`; `DELETE FROM agency WHERE id = $a AND archived_at < $cutoff`.
  - each client with `archived_at < cutoff` in a non-archived agency, one tx: `UPDATE audit_log SET user_id = 'purged' WHERE agency_id = $agency AND (user_id IN (SELECT m.user_id FROM membership m WHERE m.client_id = $c AND NOT EXISTS (SELECT 1 FROM membership m2 WHERE m2.user_id = m.user_id AND m2.client_id IS DISTINCT FROM $c)) OR user_id IN (SELECT 'contact:' || id FROM contact WHERE client_id = $c))`; `DELETE FROM client WHERE id = $c`.
  - Task 0 blockers handled first in the same tx; evidence, captures and objects are never touched. `dryRun` counts only. One `platform_audit_log` row per run; prints counts.
**Tests (TDD):** `refuses --older-than 29d`; `archive then --undo clears archived_at`; `purge deletes an agency archived 91 days ago and keeps its audit_log/llm_call/vendor_call rows with user_id purged`; `skips one archived 10 days ago`; `client purge anonymises a client-only user but not one with another membership`; `evidence and capture rows unchanged`; `dry-run writes nothing`.
**Done when:** `pnpm --filter @cs/worker exec vitest run purge archive-args purge-args` pass.

### Task 11: Lead PII cap + stale outbox
**Goal:** Undecided verified leads are deleted after 180 days (O8); pending notifications overdue by 7 days are skipped at send time (D18).
**Files:** modify `apps/worker/src/jobs/leads.ts` (+ test), `packages/engine/src/delivery/outbox.ts` (+ test), status readers from Task 0 (Decision 8).
**Interfaces:** `LeadsCleanupResult` gains `deletedVerified: number`; `export const STALE_OUTBOX_DAYS = 7;` (outbox.ts); `dispatchDue` result gains `skipped: number`.
**Behaviour:**
- `runLeadsCleanup` step `verified`: delete `status = 'verified'` leads (incl. pool, `agency_id IS NULL`) with `coalesce(verified_at, updated_at) < now − 180 d`; isolated like the other steps.
- `dispatchDue`, before claiming: `UPDATE notification SET status = 'skipped', error = 'stale' WHERE status = 'pending' AND not_before < now − 7 d`; count into `skipped`. Rows retried with backoff have a future `not_before`, so they are untouched.
- Readers listing or counting by status treat `skipped` like `failed` (Decision 8).
**Tests (TDD):** `deletes a verified lead verified 181 days ago`; `keeps one verified 179 days ago`; `falls back to updated_at when verified_at is null`; `pool lead included`; `pending row due 8 days ago becomes skipped with error stale and is not sent`; `row due 6 days ago is sent`; `sending/failed rows untouched`.
**Done when:** `pnpm --filter @cs/worker exec vitest run leads`, `pnpm --filter @cs/engine exec vitest run outbox` pass.

### Task 12: Docs + E2E
**Goal:** E2E for the user-visible refusals; runbooks and work file current.
**Files:** create or extend `apps/web/e2e/security.spec.ts` (`@ask`, `@platform`); modify `apps/web/scripts/e2e-affected-rules.ts` (`api/postmark/`, `net/guard` → tags), `docs/DEPLOY.md` (Postmark webhook URL `https://postmark:<secret>@rivalmonday.app/api/postmark/webhook` for Bounce + SpamComplaint; `POSTMARK_WEBHOOK_SECRET`; archive/purge runbook), `docs/OPS.md` (archive/purge commands), `docs/gotchas-cross-cutting.md` (SSRF guard is the only URL fetch path; archived = deleted; `skipped` status; object store no-overwrite), `packages/db/CLAUDE.md` (dropped ledger FKs, `client_isolation` archived clause), `docs/work/phase-7.md` (owner verification steps; new backlog: orphaned auth users after purge, evidence pruning via `evidenceReferenced`).
**Tests:** E2E: `Ask POST without Origin is 404` (request fixture, signed in); `archived client page 404s for its agency admin` (seed + archive via service DB); `plan without ask hides the Ask page` (seed plan features); `support session opening an evidence file adds an agency audit row`.
**Done when:** `pnpm test:affected --base main`, `pnpm --filter @cs/web e2e:affected --base main` pass; `git ls-files --eol | grep crlf` empty; work file ≤ 10 KB.
