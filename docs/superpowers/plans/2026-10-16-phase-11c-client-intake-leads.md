# Phase 11c — Client intake links, free preview, platform lead pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** Business owners start at `/start/<slug>` (agency) or `/start` (platform), pick their business, verify their email and see a free competitor snapshot with a validated AI summary; agencies accept or decline leads (accept → prospect + owner invite); platform operators assign pool leads to agencies.

**Architecture:** Builds on 11a + 11b (same branch, after Tasks 0–24) and Phase 10 (Turnstile, `hashIp`, public routes). A `lead` table holds submissions (agency or pool); public service functions (no session) do lookup/submit/verify with an atomic `intake_rate` counter; a `lead-preview` job builds the snapshot and validated summary; registered tools serve `/agency/leads`, intake-link settings and `/platform/leads`. Lead emails have no client, so they are sent directly with sent-at guard columns.

**Tech Stack:** as 11a/11b, plus Cloudflare Turnstile (Phase 10 `verifyTurnstile`).

**Spec:** `docs/superpowers/specs/2026-10-16-phase-11c-client-intake-leads-design.md` (L1–L8, §2–§10). SQL, limits and copy are binding.

## Global constraints
- All 11a/11b global constraints apply.
- Public intake: `submitIntake` returns the same `{ ok: true }` (status, body, redirect, ≥ 400 ms floor like Phase 10 P3) for every outcome after Turnstile; refusal reasons go to a server log line without email/IP. Never log tokens, raw IPs or emails.
- Tokens: 32 random bytes base64url; only SHA-256 hashes stored; compare by hash lookup (no string compare of raw tokens).
- `/start` (platform) may show "Rival Monday" (L4); `/start/<slug>` and every email after assignment must not.
- No new root `.env` vars (Turnstile keys come from Phase 10; `PLATFORM_ADMIN_EMAILS` exists). E2E uses Phase 10's fake Turnstile and 11a's `SETUP_FAKE_LOOKUP`; fake AI via the existing fake-AI pattern.
- Platform tools use `requirePlatformOperator` / `withPlatformAudit` (Phase 8).

## Decisions (plan-local)
- **R1 (spec deviation)** The `notification` outbox requires `client_id`, so lead emails (`lead_verify`, `lead_confirmation`, `lead_declined`, `lead_new`, pool notice) are sent **directly** after commit (web: server action; worker: job) via the email transport, guarded by `lead` columns `confirmation_sent_at`, `agency_notified_at`, `declined_notified_at`, `pool_notified_at` (set with `UPDATE … WHERE <col> IS NULL RETURNING` before sending; send failure logs and clears the column so the next cleanup run retries once). `lead_verify` is sent inline by `submitIntake`'s caller (no guard; a resubmit re-sends).
- **R2** Public functions live in `packages/tools/src/intake/{rate.ts,tokens.ts,public.ts}`; agency/platform tools in `packages/tools/src/tools/{leads.ts,platform-leads.ts}`; preview logic in `packages/tools/src/intake/preview.ts` (pure) used by `apps/worker/src/jobs/leads.ts`.
- **R3** Accept reuses 11a's `create_client` internals via a shared `createClientCore(tx, …)` extracted in Task 31 (the tool stays the public entry); not a nested `runTool`.
- **R4** The public preview page polls `getPublicPreview(service, leadId, viewToken)`; both a bad id and a bad token return `null` → 404.

## File structure
- DB: `packages/db/src/schema/leads.ts` (`intakeLink`, `lead`, `intakeRate`); migrations `0072_leads.sql`, `0073_leads_rls.sql` (pre-flight: next free 0072).
- Tools: `packages/tools/src/intake/{rate.ts,tokens.ts,public.ts,preview.ts,emails.ts}` (+ tests); `packages/tools/src/tools/{leads.ts,platform-leads.ts,all.ts,onboarding.ts}`.
- AI: `packages/ai/config/ai.yaml` (`lead_preview_summary`), `config.test.ts`.
- Email: `packages/email/src/templates/{lead-verify,lead-confirmation,lead-declined,lead-new}.tsx`, `types.ts`, `render.ts`.
- Worker: `apps/worker/src/jobs/leads.ts` (+ test), `main.ts`.
- Web: `apps/web/src/app/start/{page.tsx,[slug]/page.tsx,intake-form.tsx,actions.ts,v/[leadId]/page.tsx,verify/[token]/route.ts}`, `apps/web/src/proxy.ts` (`PUBLIC`), `apps/web/src/app/(app)/agency/leads/{page.tsx,actions.ts,lead-card.tsx}`, `apps/web/src/components/agency/intake-link-card.tsx` (on `/agency/settings`), `apps/web/src/app/(platform)/platform/leads/{page.tsx,actions.ts}`, `apps/web/src/components/shell/nav-items.ts`.
- Demo/E2E: `packages/demo/src/{leads.ts,seed.ts,coverage.ts}`; `apps/web/e2e/{seed.ts,intake.spec.ts}`.

## Dependencies on in-flight work
- **11a/11b Tasks 0–24 done**: `find_business` collector path (`mapsSearchByText`, `toSetupLookup`, `preselectVertical`), `create_client` with `lookup`, `client_setup.source`, `inviteClientUser`, prospects with the invite step (L7 already in 11b's plan).
- **phase-10 merged**: `verifyTurnstile`, `hashIp`, `proxy.ts` `PUBLIC`, fake Turnstile in DEMO/TEST, platform console nav, agency settings page layout. Re-check names at pre-flight.
- **Phase 8**: `requirePlatformOperator(deps, ctx, min)`, `withPlatformAudit`, platform roles `owner|staff|viewer` (pre-flight: "operator" = staff+).

## Review focus
1. Enumeration: `/start/<slug>` for a disabled vs unknown slug, `submitIntake` for duplicate vs new vs rate-limited, and `/start/v/<id>` with a bad token vs bad id must be indistinguishable.
2. Concurrency: two submits for the same (agency, email, place) at once end in one open lead (unique index + upsert), and two `accept_lead` calls create one prospect.
3. A platform lead declined by agency A and reassigned to agency B must not let A still read it (RLS by current `agency_id`) and A's decision fields must not leak to B.
4. The AI summary validator must reject numbers formatted differently from the snapshot only when they truly differ (e.g. "4.6" vs rating 4.6 passes; "5" when no 5 exists fails; "12 km" when distance is 12.0 passes).
5. A lead whose business has no category or coordinates (lookup edge) gets `preview.status='failed'` with the fallback copy, never a stuck "Building your snapshot…".

---

### Task 25: Pre-flight (11c)
- Re-check **Dependencies on in-flight work**; record Phase 10's actual names for Turnstile, `hashIp`, `PUBLIC`, settings page, platform nav; confirm how a client role sees a `prospect` client's pages (spec §8) and note what Task 31 must open up.
- Patch plan names if drifted; note drift in `docs/work/phase-11.md`.
**Done when:** `pnpm test:affected` green; `docs(phase-11): 11c pre-flight` committed.
*Pre-flight 2026-10-17 (names as built):* `verifyTurnstile(token, ip, { envName, turnstileSecretKey })` in `apps/web/src/server/turnstile.ts` (fake passes unless token `'fail'`; no widget → token `'no-widget'`; mirror `app/sign-up/actions.ts`); `hashIp(ip, secret)` from `@cs/tools` (`access/signup.ts`; secret = `webEnv().authSecret`); `proxy.ts` `PUBLIC` is a **RegExp array**; there is **no `/agency/settings` page** (only `/settings/billing`, `/settings/platform-access`); platform nav = `navItemsFor` `isPlatformOperator` block in `nav-items.ts`; platform roles are `owner|staff|viewer` (no "operator"); web deps = `toolDeps(name)` (`apps/web/src/server/tools.ts`); direct web send pattern = `apps/web/src/server/invite-email.ts` (`webEmailTransport` + `webEnv().emailFrom`); `QueueJob` union in `packages/tools/src/deps.ts`; web `enqueueFor` **throws in demo/test**. Client roles on a prospect: membership access has no status filter, so a prospect's `client_owner` already opens `/c/<id>` and `/setup` (while `clientOpen`); prospects have `features: []` (Overview/Recommendations only). Task 31 opens nothing; it adds a test.

### Task 26: Schema + RLS
**Files:** `packages/db/src/schema/leads.ts` + index; migrations `<n>_leads.sql`, `<n+1>_leads_rls.sql`; test `packages/db/src/leads-rls.test.ts`.
**Interfaces:** spec §2 SQL verbatim **except `assigned_by text`, `decided_by text`** (Better Auth user ids are text — cf. fix migrations 0069/0071), plus (R1) and the rate table. Migrations **0072** `leads`, **0073** `leads_rls`:
```sql
ALTER TABLE lead
  ADD COLUMN confirmation_sent_at timestamptz,
  ADD COLUMN agency_notified_at   timestamptz,
  ADD COLUMN declined_notified_at timestamptz,
  ADD COLUMN pool_notified_at     timestamptz;
CREATE TABLE intake_rate (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
```
RLS file: spec §2 policies, plus `REVOKE ALL ON intake_rate FROM app_user; ALTER TABLE intake_rate ENABLE ROW LEVEL SECURITY; ALTER TABLE intake_rate FORCE ROW LEVEL SECURITY;` (no policy). Zod `leadPreviewSchema` + type `LeadPreview` exported from `@cs/db`. Guard tests (`tenant.test.ts` forced-RLS, privilege allow-list) enumerate tables automatically — nothing to add unless they fail. Test `assigned_by/decided_by accept a non-uuid user id`.
**Tests:** `agency A cannot read agency B leads`; `pool leads invisible to app_user`; `client roles see no leads or intake_link`; `app_user cannot write lead/intake_link/intake_rate`; `slug check rejects 'A-b', '-ab', 'ab-'`; `dedupe index blocks a second open lead for same agency/email/place but allows after accepted`.
**Done when:** `pnpm --filter @cs/db exec vitest run leads-rls` + guard tests.

### Task 27: Rate limiter + tokens
**Files:** `packages/tools/src/intake/{rate.ts,tokens.ts}` (+ tests).
**Interfaces:**
```ts
export async function hitRate(db: Db, key: string, window: 'hour' | 'day', limit: number, now: Date): Promise<boolean>; // true = allowed
export const INTAKE_LIMITS = { ipPerHour: 5, linkPerDay: 50, platformPerDay: 200 } as const;
export function newToken(): { raw: string; hash: string };   // 32 bytes base64url; sha256 hex
export const hashToken = (raw: string) => string;
```
`hitRate` (implement exactly):
```ts
const start = window === 'hour'
  ? new Date(Math.floor(now.getTime() / 36e5) * 36e5)
  : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const [row] = await db.execute<{ count: number }>(sql`
  INSERT INTO intake_rate (key, window_start, count) VALUES (${key}, ${start}, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = intake_rate.count + 1
  RETURNING count`);
return Number(row!.count) <= limit;
```
**Tests:** `allows up to the limit and refuses the next`; `new window resets`; `20 parallel hits with limit 5 allow exactly 5`; `token hash is stable and raw never equals hash`.
**Done when:** `pnpm --filter @cs/tools exec vitest run intake/rate intake/tokens`.

### Task 28: Public intake functions
**Files:** `packages/tools/src/intake/public.ts` (+ test); export from `@cs/tools`; `packages/tools/src/deps.ts` (`QueueJob` += `'lead-preview'`).
**Interfaces:**
```ts
export async function resolveIntake(service: Db, slug: string | null): Promise<{ agencyId: string | null; branding: 'agency' | 'platform' } | null>; // null = 404
export async function intakeLookup(deps: ToolDeps, input: { slug: string | null; name: string; location: string; ipHash: string }, now: Date)
  : Promise<{ places: SetupLookup[] } | { refused: 'rate' }>;
export async function submitIntake(deps: ToolDeps, input: { slug: string | null; lookup: SetupLookup; contactName: string;
  email: string; phone?: string; message?: string; ref?: string; ipHash: string }, now: Date)
  : Promise<{ send: { leadId: string; verifyRaw: string } | null }>;      // caller always shows the same page
export async function verifyIntake(deps: ToolDeps, raw: string, now: Date)
  : Promise<{ leadId: string; viewRaw: string } | { expired: true }>;
export async function getPublicPreview(service: Db, leadId: string, viewRaw: string): Promise<{ businessName: string; preview: LeadPreview; branding: 'agency' | 'platform'; agencyName: string | null } | null>;
```
**Behaviour:** `resolveIntake`: slug → enabled `intake_link`; disabled/unknown → null; `null` slug → platform. `intakeLookup`: `hitRate(ip:<hash>, hour, 5)` and `hitRate(link:<agencyId>|platform, day, 50|200)`; then the 11a lookup path (`mapsSearchByText` → `toSetupLookup`, honour `setupLookup` deps override), scope `{ agencyId | null, clientId: null }`. `submitIntake`: validate (zod: name 1..120, email ≤ 320, phone ≤ 40, message ≤ 500, ref ≤ 80 `[\w.-]`); `hitRate(ip, hour, 5)` shared with lookup; upsert open lead on the dedupe index (`ON CONFLICT … DO UPDATE SET contact_name, phone, message, ref, verify_token_hash, verify_expires_at = now + 48 h, ip_hash, updated_at`); return `send` (null when refused — caller logs `[intake] refused <reason>`). `verifyIntake`: find by `verify_token_hash`, `status='unverified'`, not expired → set `verified`, `verified_at`, clear token, set `view_token_hash`, enqueue `lead-preview` (singleton by lead id); else `{ expired: true }`. All writes via `deps.service`. *(pre-flight)* The upsert's conflict target must repeat the index expression and predicate: `ON CONFLICT (coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email), (lookup->>'placeId')) WHERE status IN ('unverified','verified')`. The enqueue runs after the verify write commits and is non-fatal (web `enqueueFor` throws in demo/test; mirror `enqueueSetupSuggestions` in `tools/onboarding.ts`: log, preview stays `none`). `getPublicPreview`: the view token is valid 30 days from `verified_at` (compare with `now()` in SQL). `lookup` is validated with `setupLookupSchema`.
**Tests:** `verify succeeds when enqueue throws`; `unknown and disabled slugs both resolve null`; `lookup refused after 5 per IP per hour`; `link daily cap 50`; `platform cap 200`; `submit twice updates one open lead`; `refused submit returns send null`; `verify sets verified, enqueues preview once, token single-use`; `expired token`; `getPublicPreview null for wrong token and wrong id`.
**Done when:** `pnpm --filter @cs/tools exec vitest run intake/public`.

### Task 29: Preview — snapshot, summary validator, job
**Files:** `packages/tools/src/intake/preview.ts` (+ test); `packages/ai/config/ai.yaml` (`lead_preview_summary: { provider: openrouter, model: anthropic/claude-haiku-4.5, temperature: 0.3, max_tokens: 300 }`, mirror key names), `packages/ai/src/config.test.ts`; `apps/worker/src/jobs/leads.ts` (+ test), `main.ts`, `apps/worker/src/deps.ts` (a `generateLeadPreview(leadId)`-style dep like `generateSetupSuggestions`, with `dfs`/`ai`/email transport/`platformAdmins`).
**Interfaces:**
```ts
export function buildSnapshot(self: SetupLookup, nearby: MapsPlace[]): Extract<LeadPreview, { status: 'ready' }> | null; // null when < 1 usable nearby
export function snapshotFacts(s: Pick<Snap, 'self' | 'nearby' | 'category'>): string[];
type Snap = Extract<LeadPreview, { status: 'ready' }>;
export function validateSummary(summary: string, s: Pick<Snap, 'self' | 'nearby'>): string | null;
// job: defineJob({ name: 'lead-preview', schema: z.object({ leadId: z.uuid() }), queue: { policy: 'short' }, handler })
```
`validateSummary` (implement exactly):
```ts
const DENY = /\b(best|guarantee[ds]?|#\s?1|number one|will rank|lawsuit|sue)\b/i;
if (DENY.test(summary) || summary.length > 600) return null;
const allowed = new Set<string>();
const add = (n: number | null | undefined) => { if (n == null) return;
  allowed.add(String(n)); allowed.add(n.toFixed(1)); allowed.add(String(Math.round(n))); };
add(s.self.rating); add(s.self.votes);
s.nearby.forEach(b => { add(b.rating); add(b.votes); add(b.distanceKm); });
add(s.nearby.length); for (let i = 1; i <= s.nearby.length; i++) add(i);
for (const m of summary.matchAll(/\d+(?:\.\d+)?/g)) if (!allowed.has(m[0])) return null;
const names = [s.self.name, ...s.nearby.map(b => b.name)].map(n => n.toLowerCase());
for (const m of summary.matchAll(/\b[A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*)+/g)) {
  const cand = m[0].toLowerCase();
  if (!names.some(n => n.includes(cand) || cand.includes(n))) return null;
}
return summary.trim();
```
(Sentence-initial capitalised words alone are single words and not matched; multi-word capitalised phrases must be snapshot names.)
**Job behaviour:** skip in demo/test (unless `lead.ref === 'demo-fixture'`); only `status='verified'` and `preview.status in ('none','pending')`; set `pending`; no category or coordinates → `failed` (`SetupLookup.lat/lng` are non-null by schema, so in practice only a null `category`). `mapsSearch(dfs, { keyword: lookup.category, lat, lng, depth: 20 }, scope)` where scope = `{ agencyId: lead.agency_id, clientId: null }`; drop own `placeId`; nearest 5 with coordinates (`distanceKm` via haversine, 1 decimal). Facts per spec §4. AI: input is the snapshot JSON only (no free text from the web → no `redactForModel` needed beyond names, but pass through `redactForModel` anyway for consistency), system prompt: "Write 2–3 plain sentences for a local business owner comparing their Google rating and review count with these nearby businesses. Use only the numbers and names in the JSON. No advice, no promises." → `validateSummary`. Store `ready`; then send `lead_confirmation` (R1 guard `confirmation_sent_at`) and, for agency leads, `lead_new` (guard `agency_notified_at`); for pool leads the pool notice to `PLATFORM_ADMIN_EMAILS` (guard `pool_notified_at`). Failures → `failed` + still send confirmation with fallback copy.
**Tests:** `buildSnapshot excludes self and sorts by distance`; facts wording; validator: passes clean summary, fails unknown number, fails unknown multi-word name, fails deny word, passes "4.6"/"12" forms; job: `ready + confirmation once across two runs`; `failed without category`; `AI throws → ready with summary null`; `pool lead notifies platform admins once`; `skips in test env`.
**Done when:** `pnpm --filter @cs/tools exec vitest run intake/preview`, `pnpm --filter @cs/worker exec vitest run jobs/leads`, `pnpm --filter @cs/ai exec vitest run config`.

### Task 30: Lead email templates + direct sender
**Files:** `packages/email/src/templates/{lead-verify,lead-confirmation,lead-declined,lead-new}.tsx` (tests at `packages/email/src/lead-*.test.ts`, the package's pattern), `types.ts`, `render.ts`; `packages/tools/src/intake/emails.ts` (+ test).
**Interfaces:**
```ts
export async function sendLeadEmail(deps: { service: Db; transport: EmailTransport; appUrl: string; fromAddress: string; platformAdmins: string[] },
  leadId: string, kind: 'verify' | 'confirmation' | 'declined' | 'agency_new' | 'pool_new', extra?: { verifyRaw?: string; viewRaw?: string }): Promise<void>;
```
**Behaviour:** copy per spec §9 verbatim. Branding: agency leads (and pool leads once assigned) → `loadBranding(agencyId)`; unassigned pool → Rival Monday default branding and the platform lines. `from = "${fromName}" <fromAddress>`; reply-to: agency → `replyToFor`-style first agency admin contact; platform → null. Guard columns per R1 (`verify` unguarded). *(pre-flight)* `pool_new` has no template of its own: it is `lead-new.tsx` with Rival Monday branding and a `/platform/leads` link, sent to `platformOperatorEmails(deps, ['owner','staff'])` (`platform/costs/alerts.ts`; env list + active rows). Links: verify → `${appUrl}/start/verify/<raw>`. Raw view tokens are never stored, so the job's `lead_confirmation` carries the preview **content inline** (facts + summary) and no preview link; the preview page is reached only through the verify redirect.
**Tests:** snapshots per template; `agency-branded templates never contain "Rival Monday"`; `pool template contains the platform line`; `guard prevents a second confirmation`; `send failure clears the guard`.
**Done when:** `pnpm --filter @cs/email exec vitest run lead-` and `pnpm --filter @cs/tools exec vitest run intake/emails`.

### Task 31: Agency tools — leads + intake link; accept/decline
**Files:** `packages/tools/src/tools/leads.ts` (+ test), `tools/all.ts`, `tools/onboarding.ts` (extract `createClientCore`), prospect access fix from Task 25 (path per pre-flight).
**Interfaces:**
```ts
list_leads: { status?: 'verified'|'accepted'|'declined' } → { leads: LeadSummary[] }       // read, agency, scope all
get_lead: { leadId } → LeadDetail                                                           // read, agency
accept_lead: { leadId, verticalId } → { clientId }                                          // write, agency, scope all
decline_lead: { leadId, notify: boolean } → { ok: true }                                     // write, agency, scope all
get_intake_link: {} → { slug: string | null; enabled: boolean; url: string | null; counts: { newThisMonth: number; accepted: number } }  // read, agency_admin
update_intake_link: { slug?: string; enabled?: boolean } → same as get                        // write, agency_admin; slug_taken
export async function createClientCore(tx: Db, deps: ToolDeps, ctx: AccessContext, input: CreateClientInput & { source?: SetupSource /* default 'staff' */ }): Promise<{ clientId: string; afterCommit: () => Promise<void> }>;
```
*(pre-flight)* `create_client` today opens its own `deps.service.transaction` (seat check for active, client + `client_setup` insert, `first_client_at` stamp) and after commit runs seat sync, `enqueueSetupSuggestions`, `startFirstAutoSearch`; the core takes the tx body, `afterCommit` the rest; `source` goes into the `client_setup` insert (no later update). `CreateClientInput` = the tool's parsed input type (export it). `inviteClientUser(ctx, deps, input, now)` opens its own transaction: call it as `inviteClientUser(ctx, { ...deps, service: tx }, …)` so it runs as a savepoint inside the accept transaction. `LeadDetail` carries `suggestedVerticalId: string | null` (`preselectVertical` over `lookup.category`, as `find_business`).
**Behaviour:** `accept_lead` (spec §5): `SELECT … FOR UPDATE` the lead (`agency_id = ctx.agencyId`, `status='verified'`, else `not_found`); `createClientCore` with `status:'prospect'`, `name: lookup.title`, `verticalId`, `lookup`; set `client_setup.source`; lead → `accepted`, `client_id`, `decided_*`; then `inviteClientUser` (same tx); after commit run `afterCommit` (enqueue setup-suggestions). `decline_lead`: platform-sourced → back to pool (clear `agency_id`, `assigned_*`; keep `status='verified'`; clear `agency_notified_at`); agency-sourced → `declined`; `notify` → `sendLeadEmail('declined')` after commit. First `update_intake_link` creates the row (slug default: slugified agency name, suffix `-2…` on conflict). Slug conflict → `slug_taken` ("That link name is taken. Try another.").
**Tests:** `accept creates prospect + setup(source) + inactive owner contact + client_invite row`; `accept twice → second not_found`; `other agency lead → not_found`; `unverified lead → not_found`; `decline platform lead returns it to the pool and agency can no longer read it`; `decline agency lead with notify sends once`; `intake link create/update/slug_taken`; `account_manager with limited scope refused`; `client roles refused`; `the invited client_owner of an accepted (prospect) lead can read get_client_setup while clientOpen` (spec §8; no access change needed).
**Done when:** `pnpm --filter @cs/tools exec vitest run tools/leads onboarding`.

### Task 32: Platform tools — pool + assign; cleanup job
**Files:** `packages/tools/src/tools/platform-leads.ts` (+ test), `tools/all.ts`; `apps/worker/src/jobs/leads.ts` (`leads-cleanup`, + test), `main.ts`.
**Interfaces:**
```ts
list_pool_leads: { } → { leads: PoolLead[]; agencies: { id; name; verticals: string[]; activeClients: number }[] }   // requirePlatformOperator(…, 'viewer')
assign_lead: { leadId, agencyId } → { ok: true }                                                                     // requirePlatformOperator(…, 'staff'), withPlatformAudit
// (pre-flight) roles are owner|staff|viewer; follow `operate()` in tools/platform-signups.ts (permission 'agency', audit 'skip-web')
// job: defineJob({ name: 'leads-cleanup', schema: z.looseObject({}), cron: '30 3 * * *', handler })
```
**Behaviour:** `assign_lead`: only `agency_id IS NULL AND status='verified'` (else `not_found`); target agency must be serviceable; sets `agency_id`, `assigned_*`; after commit `sendLeadEmail('agency_new')`. Cleanup per spec §7 + delete `intake_rate` rows older than 2 days; skip demo/test.
**Tests:** `assign audited`; `viewer cannot assign`; `staff can assign`; `non-pool lead refused`; `agency notified once`; cleanup: expire unverified past 48 h, delete declined/expired > 90 d, scrub accepted > 90 d, purge old rate rows.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-leads` and `pnpm --filter @cs/worker exec vitest run jobs/leads`.

### Task 33: Web — public pages
**Files:** `apps/web/src/app/start/{page.tsx,[slug]/page.tsx,intake-form.tsx,actions.ts,v/[leadId]/page.tsx,verify/[token]/route.ts}`; `apps/web/src/proxy.ts`.
**Behaviour:** `PUBLIC` += `/^\/start(\/|$)/` (RegExp array). Pages `noindex`. Server actions use `toolDeps()` (web), `hashIp(ip ?? 'unknown', webEnv().authSecret)`, and the Turnstile call exactly as `app/sign-up/actions.ts` (`'no-widget'` token when no widget; site key only in dev); `sendLeadEmail` gets `webEmailTransport(processGuardOn(), …)`, `webEnv().emailFrom`, `webEnv().appUrl` (pattern `server/invite-email.ts`). Preview `none` renders like `pending`. `/start/[slug]`: `resolveIntake` null → `notFound()`. Form (two stages, one page): "Business name", "City and state, or ZIP", "Find my business" → results (title, address, rating) → "Your name", "Email", "Phone (optional)", "What would you like help with? (optional)", consent "I agree to be contacted about my request." + Turnstile → "Get my free snapshot". Actions: IP from `x-forwarded-for` first hop → `hashIp` → `verifyTurnstile` (fail: "Please complete the check and try again.") → `intakeLookup` / `submitIntake` → if `send` → `sendLeadEmail('verify', { verifyRaw })` → ≥ 400 ms floor → page "Check your email — we sent a link to confirm it." (same for every outcome; rate refusal on lookup: "Too many searches. Please try again in an hour."). `ref` from `?ref=` (validated). Verify route: `verifyIntake` → redirect `/start/v/<leadId>?t=<viewRaw>`; expired → page "This link has expired. Start again." linking to the original intake page. Preview page: `getPublicPreview` null → 404; pending → "Building your snapshot…" (poll 3 s, max 2 min, then "Your snapshot is taking longer than usual — we'll email it to you."); ready → self card + nearby table (name, rating, reviews, distance) + facts + summary; failed → spec fallback copy. Platform pages show Rival Monday branding and the L4 line; agency pages agency branding.
**Done when:** `pnpm --filter @cs/web typecheck`, `lint`.

### Task 34: Web — agency leads, intake card, platform pool
**Files:** `apps/web/src/app/(app)/agency/leads/{page.tsx,actions.ts,lead-card.tsx}`, `apps/web/src/components/agency/intake-link-card.tsx` (+ mount on agency settings), `apps/web/src/app/(platform)/platform/leads/{page.tsx,actions.ts}`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/server/nav.ts`, `apps/web/src/components/shell/sidebar-nav.tsx` (+ mobile nav if it renders items).
*(pre-flight)* There is no `/agency/settings` page: mount the card on a new `apps/web/src/app/(app)/agency/settings/intake/page.tsx` (agency_admin; nav "Intake link" in the account group next to Billing, pattern `settings/platform-access`) — pending controller ruling. `NavItem` has no count and `NavRoleFlags` no scope flag: add `count?: number` on `NavItem`, `leads?: boolean` (agency_admin or scope `all`) and `newLeads?: number` on `NavRoleFlags` (computed in `server/nav.ts` via `list_leads`), new icons `leads`/`intake`, and `/platform/leads` "Leads" in the `isPlatformOperator` block.
**Behaviour:** `/agency/leads` tabs **New**, **Accepted**, **Declined**; card: business, address, contact (name, email, phone), ref, message, preview (facts + summary), "From your website" / "From {platform}" label; Accept (vertical select preselected via `preselectVertical`, confirm "Accept and invite {contactName}") → redirect `/c/<clientId>/setup`; Decline (checkbox "Let them know", default on). Nav item "Leads" with count of New (agency_admin / account_manager scope all). Intake card per spec §5 (copy link, copy button HTML `<a href="{url}" style="…">Get your free competitor snapshot</a>`, on/off, counts). `/platform/leads`: pool table + Assign (agency select showing verticals + active clients) + recent assignments; operator-only actions; viewer read-only. Page refusals 404.
**Done when:** `pnpm --filter @cs/web typecheck`, `lint`.

### Task 35: Demo, coverage, E2E, docs
**Files:** `packages/demo/src/leads.ts`, `seed.ts`, `coverage.ts`; `apps/web/e2e/{seed.ts,intake.spec.ts}`; `docs/work/phase-11.md`.
**Behaviour:** demo: intake link for the main agency; 3 leads (new with ready preview, accepted → existing prospect, declined) and 1 pool lead; coverage for `/agency/leads`, `/platform/leads`, intake card, `/start/<slug>` (`NO_DATA_ROUTES` for public pages). E2E (fake Turnstile, `SETUP_FAKE_LOOKUP`, fake AI, E2E seed provides a verified lead with ready preview for the agency flow since the worker doesn't run): (1) public: `/start/<slug>` → find → submit → outbox has `lead_verify` → open verify link → preview page shows the seeded/fixture state or "Building…"; (2) unknown slug 404; (3) agency accepts seeded lead → lands on `/c/<id>/setup`, a `client_invite` `notification` row exists (no worker in E2E — check the row or drain as `client-setup-invite.spec.ts` does; lead emails, being direct sends, land in the file outbox `OUTBOX`); (4) platform operator assigns seeded pool lead → agency `/agency/leads` shows it. Work file owner steps: real Turnstile on `cs_dev`; real preview for a dental business (summary numbers match); accept → prospect → owner invite; platform `/start` branding; copy sign-off for the four lead emails; set the agency's slug.
**Done when:** final whole-branch review (most capable model) with `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`; one fix wave.
