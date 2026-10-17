# Phase 11a — Client setup wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** Staff find a business on Google (DataForSEO Maps), create the client prefilled, and finish a resumable `/c/[clientId]/setup` wizard (profile with AI suggestions → competitor search → pick competitors) that the client owner can also run; the starting-point brief waits for competitors; agency staff get reminders.

**Architecture:** One new table `client_setup` stores only what can't be derived; `getSetupState` derives step states from `client`, `discovery_run` and `client_setup`. A lookup tool + collector create the client with a `lookup`; a worker job writes AI suggestions validated against source quotes. Five tools serve the wizard; the client-owner rights during setup are enforced inside them. The engine's starting-point clock reads `client_setup`. A daily job enqueues reminder emails through the `notification` outbox.

**Tech Stack:** TypeScript, Drizzle/Postgres (RLS), Next.js App Router + shadcn/ui, pg-boss, `@cs/ai` (OpenRouter), DataForSEO, `@cs/email` + Postmark, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-phase-11a-client-setup-wizard-design.md` (D1–D11, §3–§11). Read it in full before Task 1; its SQL, types and rules are binding.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and each touched package's `CLAUDE.md` first (`packages/db`, `packages/tools`, `packages/collectors`, `packages/ai`, `packages/engine`, `packages/email`, `apps/worker`, `apps/web`, `packages/demo`).
- Migrations: next free number at execution time (pre-flight 2026-10-16: main ends at `0066_onboarding_rls` → 11a uses **0067** `client_setup` + **0068** `client_setup_rls`). Never edit applied ones; `pnpm --filter @cs/db generate --custom --name=<x>`. RLS in a separate hand-written `_rls.sql` migration (pattern `0053_discovery_rating_rls.sql`). DB roles are `app_user` / `app_service`.
- Web reads are registered tools; web writes go through `runTool`; tools decide permissions; page refusals → 404, never 403. Every new tool sets `access`.
- Model input goes through `redactForModel`. Client-facing payloads never carry internal suggestion fields (`overlap_score`, `signals`, `ad_matches`, `appearances`, `best_rank`) nor `upsell_tag`.
- Schedulers/jobs: clients with `status IN ('active','prospect')` only where the spec says so, plus `clientServiceable`/`agencyServiceable`; jobs return `{ skipped }` when `envName` is `demo` or `test`.
- No new root `.env` vars. E2E-only flag `SETUP_FAKE_LOOKUP` lives in `apps/web/playwright.config.ts`, validated in `apps/web/src/server/env.ts` (refused in production) and listed in `turbo.json` `globalPassThroughEnv` like `ASK_FAKE_AI`.
- Crawler untouched; website suggestion source stays off (`WEB_MONITORING_ENABLED` unset).
- Copy in this plan is binding; reminder email bodies are drafted by the implementer and flagged for owner sign-off in the work file.
- Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only (`git ls-files --eol | grep crlf` prints nothing).

## Decisions (plan-local)
- **P1** Setup code lives in `packages/tools/src/setup/` (`state.ts`, `lookup.ts`, `suggestions.ts`) and tools in `packages/tools/src/tools/setup.ts`. The starting-point clock helper is pure and lives in `packages/engine/src/briefs/setup-clock.ts` (engine must not import `@cs/tools`).
- **P2** `client_setup` writes go through `deps.service` (service role); `app_user` gets SELECT only via RLS (same as `discovery_run`).
- **P3** Suggestion validation is a pure function `validateSuggestions` in `@cs/tools` setup, consumed by the worker job; the job file is `apps/worker/src/jobs/setup.ts` (both jobs).
- **P4** `/agency/prospects/new` reuses the same lookup step component with `status: 'prospect'` (pre-flight: confirm its action calls `create_client`; if it calls `convert_prospect`/another tool, keep the old form there and note it).
- **P5** E2E can't run the worker: the E2E seed writes a `client_setup` row with `suggestions.status='ready'` and a done `discovery_run` + suggestions for the wizard spec; the lookup step uses `SETUP_FAKE_LOOKUP` (fixed 3 places from a fixture).
- **P6** "Done picking" with zero accepted suggestions is allowed (same as skip but recorded as confirm).

## File structure
- DB: `packages/db/src/schema/setup.ts` (new, `clientSetup`) + schema index; migrations `<n>_client_setup.sql` (generated + backfill) and `<n+1>_client_setup_rls.sql` (custom).
- Collectors: `packages/collectors/src/local/maps.ts` (`mapsSearchByText`), `packages/collectors/src/gbp/collect-gbp.ts` (scope + description) + tests/fixtures.
- Tools: `packages/tools/src/setup/{state.ts,lookup.ts,suggestions.ts,profile-change.ts}` (+ tests); `packages/tools/src/tools/{setup.ts,onboarding.ts,all.ts,competitors.ts}`; `packages/tools/src/index.ts` exports.
- AI: `packages/ai/config/ai.yaml` (`setup_suggestions`), `packages/ai/src/config.test.ts`.
- Engine: `packages/engine/src/briefs/{setup-clock.ts,readiness.ts,starting-point.ts}`.
- Email/delivery: `packages/db/src/schema/delivery.ts` (`AGENCY_KINDS`), `packages/email/src/templates/setup-notice.tsx`, `types.ts`, `render.ts`.
- Worker: `apps/worker/src/jobs/setup.ts` (+ test), `apps/worker/src/main.ts`.
- Web: `apps/web/src/app/(app)/agency/clients/new/{page.tsx,actions.ts,lookup-step.tsx}`, `apps/web/src/app/(app)/agency/prospects/new/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/setup/{page.tsx,actions.ts,setup-wizard.tsx,steps/*.tsx}`, `apps/web/src/components/setup-badge.tsx`, `apps/web/src/app/(app)/c/[clientId]/page.tsx`, `apps/web/src/app/(app)/agency/page.tsx`, `packages/tools/src/tools/portfolio.ts`, `apps/web/src/server/env.ts`, `apps/web/playwright.config.ts`, `turbo.json`.
- Demo/E2E: `packages/demo/src/{setup.ts,seed.ts,coverage.ts}`; `apps/web/e2e/{seed.ts,client-setup.spec.ts}`, `apps/web/e2e/fixtures/setup-lookup.json`.

## Dependencies on in-flight work
- **phase-10 (merged, verified at pre-flight 2026-10-16):** (a) migrations `0065_onboarding`, `0066_onboarding_rls`; (b) `create_client` stamps `agency_onboarding.first_client_at` + `reevaluateOnboardingCompletion` inside its service tx; the reduced-trial refusal lives in `assertCanActivateClient` (`@cs/billing`) — Task 5 keeps both; (c) checklist `first_client` → `/agency/clients/new` (`components/agency/onboarding-checklist.tsx`); (d) `OutgoingEmail.stream`/`headers` exist, `AGENCY_KINDS` unchanged (no DB check on `notification.kind`/`subject_type`); (e) jobs are factories (`createOnboardingJobs(deps, { envName })`) listed in `registerJobs` in `main.ts`; (f) `(app)/layout.tsx` only redirects suspended agencies and a never-redirected agency admin once to `/onboarding` — `/c/[id]/setup` is not otherwise caught.
- **phase-12 (merged):** `startFirstAutoSearch` (returns `null` silently on refusal and when any run exists — refusals are **not** stored), `discovery_run.status` ∈ `queued|searching|checking|finalising|done|failed` (+ `error` text), suggestion tiers, top-rival pre-tick rule (`list_competitor_suggestions`: `tier==='top' && room > 0` under `client.competitor_limit`); `acceptSuggestions(ctx, deps, clientId, ids)` in `tools/competitors.ts:235` is private, all-or-nothing, throws `not_found` unless every id is `suggested`; dismiss has no helper (inline in `dismiss_competitor_suggestion`).
- **9b (merged):** `assertCanActivateClient` / `postCommitSeatSync` in `create_client` stay as they are.
- `notification` outbox is client-scoped (`client_id NOT NULL`) — fine here: every setup notice has a client.

## Review focus
1. A client owner calling any setup write after `completed_at`/`dismissed_at` is set (stale tab, MCP) must be refused (`permission_denied` → page 404), and must never reach `update_client_profile` or competitor accept paths without `manage_competitors`.
2. Two people (staff + client owner) acting on the wizard at once: "Done picking" twice, or a profile save while the search is running, must not double-start a search, double-set timestamps, or flip `completed_at` back.
3. A lookup result with no lat/lng, no category, or a category matching no pack must still create a usable client (vertical chosen manually, service area null → profile step `todo`), not crash.
4. AI output with quotes that differ only by case/whitespace/curly quotes must validate; output with invented quotes, unknown service ids, > 5 keywords or malformed JSON must degrade to `failed` or trimmed lists, never an exception that leaves status `pending` forever.
5. Existing clients (backfilled rows, or no row at all) must see no wizard, no badge, no reminder, and an unchanged starting-point clock.

---

### Task 0: Pre-flight
**Goal:** Make the branch executable and the plan true to the code.
- Rebase `phase-11` on `main` (after phase-10 merged, or on `phase-10` if the owner accepted stacking). `pnpm install`; create the worktree's own test DB per `/rm-kickoff` §1 (`cs_phase_11_test`), then `pnpm --filter @cs/worker exec vitest run src/boss.test.ts`.
- Re-check every bullet of **Dependencies on in-flight work** and every path in **File structure**; confirm P4; confirm `client.status` values include `prospect`; confirm `recipientsFor(…, audience: 'agency')` and `notify` signatures (`packages/engine/src/delivery/{contacts,outbox}.ts`).
- Write drift to `docs/work/phase-11.md` § Assumes (bullet "Pre-flight drift <date>") and patch later tasks' text in this plan if a binding interface moved.
**Done when:** `pnpm test:affected` green on the rebased branch; work file committed `docs(phase-11): pre-flight`.

### Task 1: `client_setup` table, RLS, backfill
**Files:** create `packages/db/src/schema/setup.ts`; modify `packages/db/src/schema/index.ts`; migrations `<n>_client_setup.sql`, `<n+1>_client_setup_rls.sql`; test `packages/db/src/setup-rls.test.ts`.
**Interfaces:** Drizzle `clientSetup` exactly as spec §3 (columns, checks); exported types `SetupLookup`, `SetupSuggestion`, `SetupSuggestions` (zod schemas `setupLookupSchema`, `setupSuggestionsSchema` in `packages/db/src/schema/setup.ts`, re-exported from `@cs/db`). *(Pre-flight: `SetupLookup` also carries `city: string | null` (from `MapsPlace.city`) — Task 6 needs it for keyword fill.)*
Migration body (after the generated `CREATE TABLE`, append):
```sql
INSERT INTO client_setup (client_id, agency_id, completed_at)
SELECT id, agency_id, now() FROM client
ON CONFLICT (client_id) DO NOTHING;
--> statement-breakpoint
CREATE INDEX client_setup_open_idx ON client_setup (agency_id)
  WHERE completed_at IS NULL AND dismissed_at IS NULL;
```
RLS migration:
```sql
REVOKE INSERT, UPDATE, DELETE ON client_setup FROM app_user;
--> statement-breakpoint
ALTER TABLE client_setup ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client_setup FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY client_setup_select ON client_setup FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
```
**Behaviour:** `source` check `('staff','agency_link','platform_lead')`; `skipped` check `skipped <@ ARRAY['search','competitors']`. Add the table to any table inventory the RLS guard tests iterate (see `packages/db/CLAUDE.md`).
**Tests:** `client_setup rows are invisible across agencies`; `client-scoped session sees only its client's row`; `app_user cannot insert/update/delete`; `backfill marks every pre-existing client complete` (follow `packages/db/src/onboarding.test.ts` § backfill: seed clients, re-execute the migration file's `INSERT` statement, assert `completed_at` not null and idempotent).
**Done when:** `pnpm --filter @cs/db exec vitest run setup-rls` and the existing RLS/privilege guard tests pass.

### Task 2: `getSetupState` (derived steps)
**Files:** create `packages/tools/src/setup/state.ts` (+ `state.test.ts`); export from `packages/tools/src/index.ts`.
**Interfaces:**
```ts
export type StepStatus = 'todo' | 'running' | 'done' | 'skipped' | 'blocked';
export type SetupState = {
  open: boolean; exists: boolean;
  steps: { profile: StepStatus; search: StepStatus; competitors: StepStatus };
  searchRefusal: string | null;          // discovery_run failure/refusal reason, if any
  waitingOn: 'agency' | 'client' | 'system' | null;
  completedAt: Date | null; dismissedAt: Date | null;
};
export function deriveSetupState(input: {
  client: { keywords: string[]; serviceArea: unknown | null; placeId: string | null; status: string };
  setup: { skipped: string[]; competitorsDoneAt: Date | null; completedAt: Date | null; dismissedAt: Date | null } | null;
  latestRun: { status: string; error?: string | null } | null;
  hasPendingSuggestions: boolean;
}): SetupState;                           // pure
export async function getSetupState(db: Db, clientId: string): Promise<SetupState>;  // loads + derives
export async function completeIfDone(tx: Db, clientId: string, now: Date): Promise<boolean>; // sets completed_at when all steps done/skipped; guarded UPDATE … WHERE completed_at IS NULL
```
**Behaviour:** rules from spec §4. No row → `exists:false, open:false`, all steps `done`. `waitingOn`: profile `todo` → `agency`; search `running` → `system`; competitors `todo` with pending suggestions → `agency`; `blocked` → `agency`; closed → `null`. Map `discovery_run.status` (pre-flight): `queued|searching|checking|finalising` → `running`, `done` → `done`, `failed` → `blocked` with `searchRefusal = run.error`. Refusals of the auto start are not stored, so profile `done` + no run → search `todo` (see controller ruling in the work file).
**Tests:** a table-driven matrix over `deriveSetupState` (≥ 10 rows incl. no row, all-skipped, blocked search, profile incomplete after place-id removal, closed setup); `completeIfDone is idempotent and never clears completed_at`.
**Done when:** `pnpm --filter @cs/tools exec vitest run setup/state`.

### Task 3: Collectors — text Maps search, GBP scope + description
**Files:** modify `packages/collectors/src/local/maps.ts`, `packages/collectors/src/gbp/collect-gbp.ts` and their tests; fixture `packages/collectors/test/fixtures/vendors/maps-search-text.json`.
**Interfaces:**
```ts
export async function mapsSearchByText(dfs: DataForSeoClient,
  q: { keyword: string; locationName: string; depth?: number },  // depth default 10
  scope: CallScope): Promise<{ places: MapsPlace[]; raw: unknown }>;
// Pre-flight 2026-10-16: collectGbpProfile is a competitor *capture* collector ({db,store,dfs}, c: {id: competitorId,…});
// a new client has no competitor row, so the setup job uses a new fetch-only helper instead:
export type GbpProfile = { title: string | null; category: string | null; additionalCategories: string[]; description: string | null;
  services: unknown; attributes: unknown; /* …the rest of extractGbpProfile's fields */ };
export function extractGbpProfile(item: unknown): GbpProfile | null;          // typed; gains `description`
export async function fetchGbpProfile(dfs: DataForSeoClient, q: { placeId: string }, scope: CallScope): Promise<GbpProfile | null>; // no capture, no observation; throws VendorError
// collectGbpProfile keeps its signature and null scope (behaviour unchanged) but shares the post/parse with fetchGbpProfile.
export const MAPS_SEARCH_OPERATION = '/serp/google/maps/live/advanced';   // the ledger's `operation` is the path
```
**Behaviour:** endpoint `/serp/google/maps/live/advanced` with `location_name` + `language_code: 'en'`; reuse `parseMapsItems`. The DataForSEO client ledgers `operation = path` (no custom names), so the lookup is told apart by scope: `agency_id` set, `client_id` NULL (no other maps call is agency-only today). Follow pattern: `mapsSearch` in the same file.
**Tests:** `mapsSearchByText posts location_name and keyword and parses places` (fakeDfs); `passes the given scope to dfs.post`; `extractGbpProfile parses description when present, null when absent`; `fetchGbpProfile posts place_id with the given scope and returns the profile; null on no results`; existing `collect-gbp` tests stay green.
**Done when:** `pnpm --filter @cs/collectors exec vitest run maps collect-gbp`.
### Task 4: `find_business` tool + vertical preselect
**Files:** create `packages/tools/src/setup/lookup.ts` (+ test), add tool to `packages/tools/src/tools/setup.ts` (new file, `setupTools` array) and `tools/all.ts`; `packages/tools/src/deps.ts` (`setupLookup`); test `packages/tools/src/tools/setup.test.ts`.
**Interfaces:**
```ts
// lookup.ts
export function preselectVertical(packs: VerticalPack[], categories: string[]): string | null;
export function toSetupLookup(p: MapsPlace): SetupLookup | null;   // null when lat/lng missing
export const FIND_BUSINESS_DAILY_CAP = 30;
// tool
find_business: input z.object({ name: z.string().trim().min(1).max(120), location: z.string().trim().min(2).max(120) })
  output z.object({ places: z.array(setupLookupSchema.extend({ suggestedVerticalId: z.string().nullable() })).max(5) })
  access 'read', permission 'agency', channels ['web'].
```
**Behaviour:** `ctx.clientScope !== 'all'` → `permission_denied`. Cap: count today's (UTC) `vendor_call` rows with `vendor='dataforseo'`, `operation=MAPS_SEARCH_OPERATION`, `agency_id=ctx.agencyId`, `client_id IS NULL`; `>= 30` → `throw new ToolError('rate_limited', "You've reached today's limit of 30 business searches. Try again tomorrow or enter the details by hand.", { userFacing: true })` (pre-flight: `daily_cap` is a `SearchRefusal`, not a `ToolErrorCode`; 9b R19 `userFacing` carries the copy through `toFormResult` and MCP `mapError` — no union change). Keyword `${name} ${location}`, `locationName 'United States'`. Drop places without coordinates or `closed`; first 5. `preselectVertical`: case-insensitive exact match of any category against `pack.discovery.categories`, then `related_categories`; first pack in `listVerticalPacks()` order wins. Vendor access (pre-flight: web `ToolDeps` has **no** DataForSEO client today): `ToolDeps.setupLookup?: (q: { keyword: string; locationName: string }, scope: CallScope) => Promise<MapsPlace[]>`; web `tools.ts` builds it from `mapsSearchByText` + `createDataForSeo({ login, password, baseUrl, ledger: createLedgerSink(service) })` when `DATAFORSEO_LOGIN/PASSWORD` are set (already in root `.env` + `turbo.json`), or the fixture when `SETUP_FAKE_LOOKUP=1`; absent → `ToolError('internal', 'Business search is not configured', { userFacing: true })`.
**Tests:** `preselectVertical matches category, then related, else null`; `toSetupLookup returns null without coordinates`; `find_business refuses client-scoped staff`; `find_business refuses (rate_limited, user-facing copy) once 30 calls exist today`; `client-scoped maps calls do not count toward the cap`; `find_business ledgers with clientId null`; `find_business hides closed places and caps at 5`.
**Done when:** `pnpm --filter @cs/tools exec vitest run setup`.

### Task 5: `create_client` with `lookup`; shared profile change
**Files:** create `packages/tools/src/setup/profile-change.ts` (+ test); modify `packages/tools/src/tools/onboarding.ts` (+ its test), `packages/tools/src/deps.ts` (`QueueJob`).
**Interfaces:**
```ts
// profile-change.ts — extracted from update_client_profile (behaviour-preserving)
export async function applyClientProfileChange(ctx: AccessContext, deps: ToolDeps, clientId: string,
  patch: { name?: string; services?: string[]; keywords?: string[]; serviceArea?: ServiceAreaInput | null;
           placeId?: string | null; features?: string[] },
  actor?: { userId: string; role: Role },
  recheck?: (tx: Tx) => Promise<void> ): Promise<{ client: ClientRow; searchStarted: boolean }>;
// pre-flight: `recheck` runs inside the tenant tx right after the client `FOR UPDATE` (Task 7's closed-setup re-guard).
// pre-flight: deps.ts `QueueJob` += 'setup-suggestions'; EnqueueJob is (job, data, singletonKey: string)
// create_client input gains:  lookup: setupLookupSchema.optional()
```
**Behaviour:**
- `applyClientProfileChange` does **no** permission checks (callers guard). `update_client_profile` calls it (same validation via `client-input.ts`, same `FOR UPDATE`, same self-competitor reset, same `startFirstAutoSearch` trigger). When `actor` is given and a `client_setup` row exists, set `last_changed_by/role/at` via `deps.service`.
- `create_client` with `lookup`: name defaults to `lookup.title` when the input name is empty; `placeId = lookup.placeId`; `serviceArea = { center: { lat, lng }, radiusKm: 15, zips: [] }` (adapt to the real `ServiceAreaInput` shape); **keywords forced to `[]`** (so `startFirstAutoSearch` does not fire); insert `client_setup { source:'staff', lookup, suggestions:{status:'pending'} }` in the same transaction; after commit `deps.enqueue('setup-suggestions', { clientId }, \`setup-suggestions:${clientId}\`)`. No queue or a failed enqueue → log and set `suggestions = {status:'failed'}` (guarded `WHERE suggestions->>'status' = 'pending'`) so the UI never spins forever; client creation still succeeds. Name from `lookup.title` is truncated to 120 chars (`clientInputProblems` limit).
- Without `lookup`: insert `client_setup { lookup:null, suggestions:{status:'none'} }`; behaviour otherwise unchanged (auto search fires if inputs complete).
- Keep phase-10's `first_client_at` and reduced-trial logic and 9b's seat check untouched.
**Tests:** `update_client_profile behaviour unchanged` (existing tests stay green); `create_client with lookup stores place, area, empty keywords and a pending setup row`; `create_client with lookup enqueues setup-suggestions and does not start a search`; `create_client without lookup creates a setup row with status none`; `create_client with lookup marks suggestions failed when the enqueue fails`; `applyClientProfileChange records last_changed_* for a client-role actor`.
**Done when:** `pnpm --filter @cs/tools exec vitest run onboarding setup/profile-change`.

### Task 6: AI suggestions — validator, AI task, worker job
**Files:** create `packages/tools/src/setup/suggestions.ts` (+ test); modify `packages/ai/config/ai.yaml`, `packages/ai/src/config.test.ts`; create `apps/worker/src/jobs/setup.ts` (+ `setup.test.ts`); modify `apps/worker/src/main.ts`, `apps/worker/src/deps.ts` (pre-flight: `WorkerDeps` is a method interface with lazy `getDfs()`/`getAi()` — add `generateSetupSuggestions(clientId): Promise<{ status: 'ready' | 'failed' } | { skipped: string }>` wired to an exported `runSetupSuggestions(d: { db; dfs; ai; packs }, clientId)` in `jobs/setup.ts`, pattern `generateAskStarters`; tests drive `runSetupSuggestions` with fake ai + fakeDfs).
**Interfaces:**
```ts
export type SuggestionSource = { text: string; sources: ('gbp' | 'reviews' | 'website')[] };
export function buildSuggestionSource(gbp: GbpProfile, reviews: string[]): SuggestionSource;   // ≤ 10 reviews; GbpProfile from @cs/collectors (Task 3)
export const setupSuggestionsJsonSchema: JsonSchemaFormat;  // { services:[{id,quote}], keywords:[{text,quote}] }
export function validateSuggestions(raw: unknown, ctx: { packServices: { id: string; name: string }[];
  sourceText: string; city: string | null }): { services: SetupSuggestion[]; keywords: SetupSuggestion[] } | null;
// job: defineJob({ name: 'setup-suggestions', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short' }, handler })
```
`ai.yaml`: `setup_suggestions: { provider: openrouter, model: anthropic/claude-sonnet-4.6, fallbacks: [anthropic/claude-haiku-4.5], temperature: 0.2, max_tokens: 800 }` (pre-flight: key is `fallbacks: [...]`, as `alert_writer`).
`validateSuggestions` (non-obvious; implement exactly):
```ts
const norm = (s: string) => s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim().toLowerCase();
// parse with zod; on failure return null
// services: keep items whose id ∈ packServices and norm(sourceText).includes(norm(quote)) and quote.length ≥ 3; dedupe by id
// keywords: keep items whose quote is found as above; keyword text trimmed, 2..60 chars, deduped by norm
//   if fewer than 5 keywords: append `${service.name.toLowerCase()} ${city.toLowerCase()}` for accepted services
//   (quote = that service's quote) until 5 or services exhausted (only when city is non-null)
// cap keywords at MAX_KEYWORDS (5) from client-input.ts
```
**Job behaviour:** load client + setup via `deps.service`; return `{ skipped }` when env is demo/test, setup missing, `suggestions.status !== 'pending'`, client status not in (`active`,`prospect`), or `!agencyServiceable`. Fetch GBP via `fetchGbpProfile(dfs, { placeId: client.placeId }, { agencyId, clientId })` (Task 3; no placeId → `failed`); reviews from stored review observations of `client.self_competitor_id` if present (else none — usual for a new client). Text → `redactForModel(text, { businessNames: [client.name] })` → `ai.chat('setup_suggestions', { messages, jsonSchema }, { agencyId, clientId })`. Prompt (system): "You suggest services and search keywords for a local business. Use only the text provided. For every item, copy a short exact quote from the text that supports it. Services must be ids from this list: <id — name lines>. At most 5 keywords, the way customers search (e.g. 'emergency plumber')." Store `{status:'ready', services, keywords, sources, generatedAt}`, or `{status:'failed'}` when `validateSuggestions` returns null, the vendor fails, or AI throws (log reason, no rethrow). City = `lookup.city` (Task 1; null when absent or no lookup). Register the job in `main.ts`: a `createSetupJobs(deps, { envName: liveEnvName })` factory added to `registerJobs` (follow `jobs/onboarding.ts`).
**Tests:** `validateSuggestions` cases: curly quotes/whitespace/case match; invented quote dropped; unknown id dropped; >5 keywords capped; city fill; malformed → null. Job: `skips when not pending`; `skips in demo/test`; `writes ready with validated lists` (fake ai + fakeDfs); `writes failed when AI throws`; `writes failed when validateSuggestions returns null (never stays pending)`; `model input is redacted` (assert on fake ai call arg). Config: add `setup_suggestions` to the task loop in `config.test.ts`.
**Done when:** `pnpm --filter @cs/tools exec vitest run setup/suggestions`, `pnpm --filter @cs/worker exec vitest run jobs/setup`, `pnpm --filter @cs/ai exec vitest run config`.

### Task 7: Wizard tools
**Files:** modify `packages/tools/src/tools/setup.ts` (+ `setup.test.ts`), `packages/tools/src/tools/competitors.ts` (export `acceptSuggestions`; **extract** `dismissSuggestions(ctx, deps, clientId, ids)` from `dismiss_competitor_suggestion`, which then calls it — behaviour-preserving; export the `room`-aware pre-tick as `preTickTop(rows, limit, tracked)` and use it in `list_competitor_suggestions`).
**Interfaces:**
```ts
get_client_setup: input { clientId: uuid }; access 'read', permission 'read', channels ['web'];
  output { state: SetupState; lookup: SetupLookup | null; suggestions: SetupSuggestions;
           competitorSuggestions: ClientSafeSuggestion[]; vertical: { services: {id,name}[]; seedKeywords: string[] } }
type ClientSafeSuggestion = { id: string; name: string; tier: 'top'|'watch'|'minor'; rating: number|null;
  votes: number|null; distanceKm: number|null; status: 'suggested'|'accepted'|'dismissed'; preTicked: boolean };
save_setup_profile: input { clientId, services?, keywords?, serviceArea?, placeId? }; access 'write', permission 'manage'; output { state }
pick_setup_competitors: input { clientId, accept: uuid[] (max 25), dismiss: uuid[] (max 25) }; access 'write', permission 'manage'; output { state }
advance_client_setup: input { clientId, action: 'confirm_competitors'|'skip_search'|'skip_competitors'|'dismiss' }; access 'write', permission 'manage'; output { state }
```
Shared guard (security-sensitive; implement exactly):
```ts
async function assertSetupActor(ctx: AccessContext, deps: ToolDeps, clientId: string,
  opts: { agencyOnly?: boolean } = {}): Promise<SetupState> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const isAgency = isAgencyRole(ctx.role);                     // @cs/core (pre-flight: there is no AGENCY_ROLES / toolError())
  if (opts.agencyOnly && !isAgency) throw new ToolError('permission_denied', 'Only agency staff can do this');
  const state = await getSetupState(deps.service, clientId);   // service read; client already scoped above
  if (!isAgency) {
    if (ctx.role !== 'client_owner') throw new ToolError('permission_denied', 'Not allowed');
    if (!state.open) throw new ToolError('permission_denied', 'Setup is finished');
  }
  return state;
}
```
*(Pre-flight: the guard runs on the service connection and `applyClientProfileChange` on `withTenant(deps.app)`, and `app_user` cannot lock `client_setup` (SELECT only, P2) — so "re-guard in one transaction" means: every setup write first takes `SELECT … FROM client WHERE id = $1 FOR UPDATE` (the shared lock, already taken by the profile change), then re-reads `client_setup.completed_at/dismissed_at` in that same transaction and refuses a client owner if closed. `advance_client_setup` and `pick_setup_competitors` take the same `client` lock on `deps.service` before writing.)*
**Behaviour:**
- `get_client_setup`: read via `withTenant` (RLS applies); `client_viewer` always `not_found` (spec §7: staff + client owner only); `client_owner` `not_found` when `!state.open`; `preTicked` = `preTickTop` (Phase 12 D5: top tier, strongest overlap first, only up to `competitor_limit − tracked` room — else "Done picking" with every top ticked can exceed the limit and `acceptSuggestions` refuses all); rows `status IN ('suggested','accepted')` of the same run set `list_competitor_suggestions` uses (latest done run + newer runs).
- `save_setup_profile`: guard, then `applyClientProfileChange(ctx, deps, clientId, patch, actor)`. Client owners can't change `name`/`features`. Re-guard is inside one transaction with the `FOR UPDATE` lock so a concurrent completion wins (Review focus 1–2).
- `pick_setup_competitors`: guard; accept via `acceptSuggestions`, dismiss via `dismissSuggestions`, bypassing `manage_competitors` **only** inside this tool; ids must belong to `clientId` (helpers already filter by client — assert in test). `acceptSuggestions` is all-or-nothing and refuses ids that are no longer `suggested`: drop already-`accepted` ids from `accept` before calling it (a re-submit/second tab must not fail); `accept` max 25 is fine (`acceptSuggestions` has no count cap; the tool cap of 10 is on `accept_competitor_suggestions` only).
- `advance_client_setup`: guard (`dismiss` → `agencyOnly`); `confirm_competitors`/`skip_competitors` set `competitors_done_at = coalesce(competitors_done_at, now)` (+ add `competitors` to `skipped` for skip); `skip_search` adds `search`; `dismiss` sets `dismissed_at` when null; then `completeIfDone`. All writes via `deps.service` in one transaction, set `last_changed_*`.
- All three writes return the fresh `state`; `audit` on as for other write tools.
**Tests:** `client_owner can save profile while open`; `client_owner refused after completion` (permission_denied); `client_viewer refused`; `client owner can pick competitors without manage_competitors while open`; `ids of another client are ignored/refused`; `profile save while a search is running starts no second search`; `dismiss refused for client_owner`; `confirm twice keeps the first competitors_done_at`; `completed_at set once all steps done/skipped`; `get_client_setup payload has none of overlap_score/signals/ad_matches/appearances/best_rank/upsell_tag` (assert on JSON keys); `get_client_setup not_found for client role once closed`; `get_client_setup not_found for client_viewer`; `preTicked respects the competitor limit room`; `pick re-submitting an accepted id succeeds`; `other agency → not_found`.
**Done when:** `pnpm --filter @cs/tools exec vitest run tools/setup`.

### Task 8: Starting-point clock
**Files:** create `packages/engine/src/briefs/setup-clock.ts` (+ test); modify `readiness.ts` (:22, :51) and `starting-point.ts` (:172–177).
**Interfaces:**
```ts
export const SETUP_HOLD_DAYS = 14;
export function startingPointClockStart(
  c: { activatedAt: Date | null; createdAt: Date },
  s: { competitorsDoneAt: Date | null; completedAt: Date | null; dismissedAt: Date | null } | null,
  now: Date): Date | null {
  const base = c.activatedAt ?? c.createdAt;
  if (!s || s.completedAt) return base;
  const start = s.competitorsDoneAt ?? s.dismissedAt;
  if (start) return start;
  return now.getTime() - base.getTime() >= SETUP_HOLD_DAYS * 864e5 ? base : null;  // null = not due yet
}
```
**Behaviour:** both queries left-join `client_setup`; `null` → readiness returns `ready: false, timedOut: false` (pre-flight: `StartingPointReadiness` has no reasons list — add `setupHold: boolean`; without forcing `ready:false` a lookup client becomes "ready" during setup once its self GBP/reviews land, since competitors read `null` while keywords are empty); otherwise `timedOut` measures 48 h from the clock start; `listStartingPointDue` keeps its filters.
**Tests:** table test of the helper (no row, completed, open+done, open+dismissed, open+nothing < 14 d, ≥ 14 d); `readiness holds an open setup and times out 48 h after competitors_done_at`; `existing client without a row keeps the activated_at clock`.
**Done when:** `pnpm --filter @cs/engine exec vitest run setup-clock readiness starting-point`.

### Task 9: Reminders
**Files:** modify `packages/db/src/schema/delivery.ts` (`AGENCY_KINDS` += `setup_suggestions_ready`, `setup_client_changed`, `setup_idle`; no migration — pre-flight: `kind`/`subject_type` have no DB check), `packages/email/src/templates/setup-notice.tsx` (new), `packages/email/src/{types.ts,render.ts}`; `apps/worker/src/jobs/setup.ts` (+ test), `main.ts`. Pre-flight additions: `packages/core/src/links.ts` (`LINK_TARGETS += 'setup'`, moved here from 11b Q2), `apps/web/src/server/links.ts` (`destinationPath` `'setup'` → `/c/${clientId}/setup`; fix `suspended-routes.test.ts` if it enumerates targets), `packages/engine/src/delivery/outbox.ts` (`NotifyInput.subjectType += 'setup'`), `apps/web/src/server/inbox.ts` (`NOTIFICATION_KIND_LABELS` for the 3 kinds), `apps/web/src/app/(app)/agency/webhooks/webhook-controls.tsx` (kind options).
**Interfaces:**
```ts
// email
interface SetupNoticeProps extends Base {   // Base = { branding, recipientName, clientName } — the email sender reads props.branding
  notice: 'suggestions_ready' | 'client_changed' | 'idle'; setupUrl: string; idleDays?: 3 | 7; changedBy?: string }
// EmailPayload += { template: 'setup_notice'; props: SetupNoticeProps }
// job
defineJob({ name: 'setup-reminders', schema: z.looseObject({}), cron: '0 14 * * *', handler })
export async function runSetupReminders(deps, now: Date): Promise<{ queued: number }>;
```
**Behaviour:** open setups (`completed_at IS NULL AND dismissed_at IS NULL`), client status `active|prospect`, `clientServiceable` + `agencyServiceable`; skip in demo/test. For each: derive state; `suggestions_ready` when competitors step `todo` and the latest run is done with ≥ 1 `suggested` row (dedupe `setup-ready:<clientId>`); `client_changed` when `last_changed_role` is a client role and `last_changed_at` within the last 24 h (dedupe `setup-client:<clientId>:<UTC yyyy-mm-dd>`); `idle` when `waitingOn='agency'` and `now - coalesce(last_changed_at, created_at)` ≥ 3 d or ≥ 7 d (dedupe `setup-idle:<clientId>:3|7`; the 7-day one only after the 3-day exists). Recipients: `notify(conn, cfg, { agencyId, clientId, kind, audience: 'agency', subjectType: 'setup', subjectId: clientId, dedupe, link: { t: 'setup', id: clientId }, now, build: (r, link) => ({ title, body, email: { template: 'setup_notice', props: { branding: await loadBranding(...) (once per client), recipientName: r?.name ?? null, clientName, notice, setupUrl: link, … } } }) })` — `notify` calls `recipientsFor(…, audience: 'agency')` itself and also posts to the agency's Slack/Teams webhooks (`kinds` null = all); `setupUrl` is the personal signed link (agency contacts land on sign-in → `/c/<id>/setup`). "7-day only after the 3-day exists": `notification.dedupe_key LIKE 'setup-idle:<clientId>:3:%'` (notify appends `:<contactId>:<channel>`). Subjects (binding): "Competitor suggestions are ready for {clientName}", "{clientName} updated their setup", "{clientName}'s setup is waiting on you". Bodies: implementer drafts; add "Copy sign-off: setup-notice bodies" to the work file's owner steps.
**Tests:** `queues suggestions_ready once across two runs`; `client_changed once per day`; `idle at 3 and 7 days, never 14`; `skips completed, dismissed, paused clients and unserviceable agencies`; `skips in demo/test`; template render snapshot for each notice.
**Done when:** `pnpm --filter @cs/worker exec vitest run jobs/setup` and `pnpm --filter @cs/email exec vitest run setup-notice`.

### Task 10: Web — lookup step on `/agency/clients/new`
**Files:** create `apps/web/src/app/(app)/agency/clients/new/lookup-step.tsx`; modify `page.tsx`, `actions.ts`, `apps/web/src/app/(app)/agency/prospects/new/page.tsx` (P4), `apps/web/src/server/env.ts`, `apps/web/src/server/tools.ts` (`toolDeps` — pre-flight: builds `setupLookup` per Task 4: real DataForSEO client with the service ledger sink, or the fixture when `SETUP_FAKE_LOOKUP=1`; DEMO env uses the fixture too, never a paid call), `apps/web/playwright.config.ts`, `turbo.json`; fixture `apps/web/e2e/fixtures/setup-lookup.json`.
**Interfaces:** server actions `findBusinessAction({ name, location })` → `runTool('find_business')`; `createClientFromLookupAction(formData)` → `runTool('create_client', { …, lookup })` → `redirect('/c/<id>/setup')`.
**Behaviour:** two inputs ("Business name", "City and state, or ZIP") + "Find business"; up to 5 result cards (title, address, category, rating ★ votes); choosing one shows the vertical select (preselected) + name (prefilled) + "Create client". Link "Can't find it? Enter details by hand" reveals today's `ClientProfileForm` (unchanged create path). The daily-cap refusal (`rate_limited`, user-facing, Task 4) shows its message as returned by `runTool`. Empty results: "No businesses found. Check the spelling or try a ZIP code." Same page-level 404 rules as today. Style per `docs/brand/` and existing forms (calm, subtle).
**Tests:** component/unit if the app has them for actions; otherwise covered by Task 13 E2E.
**Done when:** `pnpm --filter @cs/web typecheck` and `pnpm --filter @cs/web lint`.

### Task 11: Web — `/c/[clientId]/setup` wizard + badges
**Files:** create `apps/web/src/app/(app)/c/[clientId]/setup/{page.tsx,actions.ts,setup-wizard.tsx,steps/business-step.tsx,steps/search-step.tsx,steps/pick-step.tsx}`, `apps/web/src/components/setup-badge.tsx`; modify `apps/web/src/app/(app)/c/[clientId]/page.tsx`, `apps/web/src/app/(app)/agency/page.tsx` (`ClientName`), `packages/tools/src/tools/portfolio.ts` (+ test: rows gain `setup: { open: boolean; doneSteps: number } | null`).
**Interfaces:** actions `setupStatusAction(clientId)` → `get_client_setup`; `saveSetupProfileAction`, `pickSetupCompetitorsAction`, `advanceSetupAction` → the Task 7 tools.
**Behaviour:**
- Page: `get_client_setup`; `not_found` → `notFound()`; closed setup → staff see a read-only summary with "Setup finished" / "Setup dismissed"; client roles never reach it (tool 404s).
- Stepper labels (binding): **Your business**, **Finding competitors**, **Pick competitors**. Current step = first `todo|running|blocked` step.
- Business step: `ClientProfileForm`-based fields (services, keywords, service area, place id); suggestions as pre-ticked chips, quote in a tooltip/expandable line "From Google: “…”"; while `suggestions.status='pending'` show "Reading your Google profile…" and poll `setupStatusAction` (pattern `useSearchProgress` in `competitors/competitor-controls.tsx`: fast then slow); `failed`/`none` → pack `seedKeywords` as unticked chips. Save button "Save and find competitors".
- Search step: progress from state; copy staff: "Finding competitors. This can take a few minutes — you can leave this page; we'll email you when suggestions are ready."; client owner: "Finding competitors. This can take a few minutes — you can leave this page and come back." Blocked: plain-words refusal + "Skip this step".
- Pick step: tiered lists (Top rival / Worth watching / Minor), checkboxes pre-ticked per `preTicked`; buttons "Done picking" (→ `pick_setup_competitors` then `advance_client_setup confirm_competitors`) and "Skip for now". Staff also get "Dismiss setup" (confirm dialog: "Hide setup for this client? You can still edit everything in settings.").
- Badge `SetupBadge({ open, doneSteps })` → "Finish setup · {doneSteps} of 3" link to `/c/<id>/setup`; shown on the client overview (agency staff + client owner) and in portfolio `ClientName` when `setup.open`.
**Tests:** portfolio tool test `rows carry setup progress only for open setups`; rest covered by Task 13.
**Done when:** `pnpm --filter @cs/web typecheck`, `pnpm --filter @cs/web lint`, `pnpm --filter @cs/tools exec vitest run portfolio`.

### Task 12: Demo seed + coverage
**Files:** create `packages/demo/src/setup.ts`; modify `packages/demo/src/seed.ts`, `packages/demo/src/coverage.ts` (+ README regen via `cli/coverage-readme.ts`).
**Behaviour:** seed one extra client in the main demo agency mid-setup: `client_setup` open with `lookup`, `suggestions.status='ready'` (2 services, 3 keywords with quotes), profile complete, a done `discovery_run` with 6 suggestions (2 top, 2 watch, 2 minor), competitors step `todo`. All other demo clients get completed setup rows. Coverage: `/c/[clientId]/setup` as agency admin (`get_client_setup` → data) and as client owner of the mid-setup client (data); as client owner of a completed client (`expect: 'not_found'`); `/agency/clients/new` (`NO_DATA_ROUTES` if it has no read).
**Done when:** `pnpm --filter @cs/demo exec vitest run` and the coverage test pass; `pnpm demo:reset` runs locally.

### Task 13: E2E
**Files:** create `apps/web/e2e/client-setup.spec.ts`; modify `apps/web/e2e/seed.ts`.
**Behaviour:** seed (P5): **two** mid-setup clients with ready suggestions, done run + suggestions (pre-flight: spec 2 finishes one, spec 3 needs the other; spec 5 needs one still open — use spec 3's client before it completes, or a third open one), the second's `client_owner` user (`setup-owner@e2e.test`); a completed client for the refusal check (reuse the same owner user via a second membership only if the context switcher supports it, else mind the 5-per-minute magic-link limit). Specs:
1. `staff finds a business and lands in setup` — lookup (fake, 3 results) → pick → Create → URL `/c/<id>/setup`, step "Your business" shows "Reading your Google profile…".
2. `staff finishes setup` (seeded client) — Pick step shows top rivals pre-ticked → "Done picking" → summary "Setup finished"; client overview has no badge.
3. `client owner edits profile and picks competitors` (second seeded mid-setup client) — save profile, pick, done.
4. `client owner gets 404 on a finished setup`.
5. `portfolio shows Finish setup badge` for an open setup.
Log in like `competitors-rivals.spec.ts` (`signIn` + saved storage state).
**Done when:** `pnpm --filter @cs/web e2e:affected` green (one E2E run at a time; port 3100).

### Task 14: Docs for merge
**Files:** `docs/work/phase-11.md` (Status, Interfaces built, owner verification steps), package `CLAUDE.md` gotchas if any were learned.
**Owner verification steps to record:** (1) on `cs_dev`, add a real HVAC/dental business via lookup → client created with place id; (2) suggestions arrive within a minute, quotes match the GBP; (3) search runs after "Save and find competitors" (cost ≤ $3); (4) pick, Done → starting point due 48 h later; (5) invite a client owner via `/agency/team`, they finish a second client's setup; (6) next day 14:00 UTC reminder email for an idle setup; (7) copy sign-off for setup-notice bodies.
**Done when:** final whole-branch review (most capable model) with `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`; one fix wave.
