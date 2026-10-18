# Phase 14b — Runbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Lean plan format (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security logic, non-obvious algorithms and decided copy.

**Goal:** Each client has a runbook (plays, self-rules, safe knobs) copied from its agency's runbook, which is copied from one platform runbook. Client copies are AI-tailored to the client's vertical and business areas. Upstream changes surface as "Update available". Briefs, recommendations and the starting point read the client's runbook.

**Architecture:** There are two service-only tables, `runbook` and `runbook_item`. A pure `@cs/engine` `runbook/` module holds item schemas, the copy/update state machine and the effective view. The engine's `resolvePlaybooks` and self-rule reads switch to the runbook. Clients without a runbook fall back to today's pack + `playbook_override` path, so the cut-over is safe. A backfill CLI materialises those clients without AI (D14). One shared editor serves `/platform/runbook`, `/agency/runbook` and `/c/[clientId]/settings/runbook`.

**Tech Stack:** TypeScript, Drizzle + custom SQL, zod, `@cs/tools`, pg-boss, Next.js + shadcn/ui, OpenRouter via `@cs/ai`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-phase-14-dynamic-verticals-runbooks-design.md` (§1 D8–D14; §3). **Builds on** the 14a plan `2026-10-18-phase-14a-vertical-catalogue.md` (catalogue, `generic.yaml`, `catalogOf`, `CallScope.verticalId`).

## Global Constraints
- Same as 14a: LF only; new migrations at the next free number; `redactForModel` for model input; *no evidence, no claim*; web writes via `runTool`; refusals → 404; platform text never names Rival Monday; `upsell_tag` never in client-facing reads.
- Runbooks are **agency-only** (D11): `client_owner`/`client_viewer` get 404 on every runbook page and tool.
- Paused / non-active clients get no tailoring job (`clientServiceable` + `agencyServiceable`).
- History is never rewritten. Existing `brief_item`/`recommendation` rows keep their text snapshots.
- Template placeholders: only `PLAYBOOK_VARS` (`competitor`, `service`, `new_price`, `areas`, `theme`). `{{` is refused in titles. Lengths: `PLAYBOOK_TITLE_MAX` 200 and `PLAYBOOK_TEMPLATE_MAX` 2000.

## Decisions (plan-local; do not re-open)
- **R1 Access:** `runbook`/`runbook_item` are service-only (RLS forced, no policy, `app_user` revoked), the same as the 14a catalogue. Tools gate by role and agency id; isolation is tested at the tool level.
- **R2 Safe cut-over:** `loadClientRunbook` returns the client runbook if one exists; otherwise the agency runbook (untailored); and for a client whose agency has `playbook_override` rows and no client runbook, the **legacy view** (pack plays + overrides, exactly today's `resolvePlaybooks`). `playbook_override` is dropped later (new backlog item), not in this phase.
- **R3 Thresholds knob:** the client-level `thresholds` knob **is** `client.score_thresholds`. It is read and written through the existing `set_alert_rules` core, with no data migration. Agency and platform `thresholds` knobs supply defaults. Resolution: `client.score_thresholds ?? agency knob ?? platform knob ?? pack.scoring.routing`. This supersedes spec §3.2's "migrates into the knob".
- **R4 Focus areas:** `focus_areas` (subset of `client.services`) only re-orders brief candidates: in-focus first, then by score, before the brief cap. Nothing else reads it.
- **R5 Tier limits:** a `tier_limits` knob overrides `discovery.tiers` in `collectors/src/rivals/run.ts` and `signals/tracked.ts`. Resolution: client ?? agency ?? pack.
- **R6 Item keys:** `play:<playbookId>`, `self_rule:<SelfRuleId>`, `knob:thresholds|focus_areas|tier_limits`. Platform play ids equal the `generic.yaml` playbook ids, which equal today's pack ids, so legacy clients map one to one.
- **R7 Provenance:** `brief_item.playbook_version` and `recommendation.playbook_version` (int, null) are added next to the existing `playbook_id`. This replaces the spec's `runbook_item_key` column, since `playbook_id` already names the play.
- **R8 Tailoring scope:** the AI rewrites only play `title`/`template`, and may propose `business_area_ids`. Triggers, self-rule params and knobs are never AI-written.
- **R9 Who edits:** platform runbook = platform staff; agency runbook = `agency_admin`; client runbook = `agency_admin` or an `account_manager` with the client in scope. This mirrors `update_playbook` and `set_alert_rules`.

## File structure
- `packages/db/migrations/NNNN_runbooks.sql`; `packages/db/src/schema/runbooks.ts` (+ index).
- `packages/engine/src/runbook/{items.ts,state.ts,store.ts,tailor.ts}` (+ tests); `packages/engine/src/runbook/index.ts`.
- `packages/engine/src/briefs/{playbooks,generate,recommendations,starting-point,gather}.ts`, `score/score.ts`, `score/score-stage.ts` (modified).
- `packages/collectors/src/rivals/run.ts`, `signals/tracked.ts` (tier knob).
- `apps/worker/src/jobs/runbooks.ts` (tailor job), `apps/worker/src/cli/runbook-backfill.ts`.
- `packages/tools/src/tools/runbooks.ts` (+ test); `packages/tools/src/tools/playbooks.ts` (removed from `all.ts`).
- `apps/web/src/components/runbook/{runbook-editor.tsx,item-card.tsx,diff.tsx}`; pages `apps/web/src/app/(platform)/platform/runbook/`, `apps/web/src/app/(app)/agency/runbook/`, `apps/web/src/app/(app)/c/[clientId]/settings/runbook/`; `agency/playbooks/page.tsx` → redirect.
- `apps/web/e2e/runbook.spec.ts`.

## Dependencies on in-flight work (re-check in Task 0)
- **14a complete on this branch:** `generic.yaml` (playbooks + self_rules with the same ids as HVAC/dental), `catalogOf(deps)`, `CallScope.verticalId`, the catalogue `packs` loader in worker/web.
- **phase-13b merged:** playbook `map_climb_defend`; `MOVE_TYPES` includes `map_climb`; self-rule `map_visibility_gap` → `improve_map_rank`.
- **13a2** (if merged first): its Customisation page links to `/c/[id]/settings/runbook`. No other coupling.

## Review Focus
1. **Agency edits an item the client copy customised.** Expected: the client sees "Update available" with a diff against `upstream_snapshot`. Pull replaces it only after review, and Dismiss hides it until the next agency change (Task 2 + Task 6 tests).
2. **Client runbook missing** (tailor job failed, or a client predating the backfill). Expected: briefs still render from the agency runbook or legacy view, never an empty brief or a throw (Task 3 + Task 4 tests).
3. **AI tailoring returns an unknown `{{var}}`, a `{{` title, a changed trigger or an over-length template.** Expected: that item keeps the untailored text and the rest are applied (Task 5 test).
4. **Client changes vertical or services after tailoring.** Expected: plays limited to areas the client no longer has stop applying (filtered at read), with no crash, and "Re-tailor" is available (Task 3 + Task 6 tests).
5. **Client owner or a viewer opens `/c/[id]/settings/runbook` or calls a runbook tool, or a cross-agency id is used.** Expected: 404 / `not_found` (Task 6 + Task 8 tests).

---

### Task 0: Pre-flight
- [ ] Confirm 14a is complete and green on `phase-14b` (`pnpm test:affected --base main`). Rebase on `main` if it moved.
- [ ] Re-check the Dependencies lines and every path in this plan. Record the next free migration number. Fix the plan in place and commit `docs(phase-14b): 14b pre-flight`.

**Done when:** the plan matches the code.

### Task 1: Migration — runbook tables + provenance columns
**Files:** migration `NNNN_runbooks.sql`; `packages/db/src/schema/runbooks.ts`, `schema/index.ts`, `schema/briefs.ts` (two columns); `packages/db/src/runbooks-rls.test.ts`.

**SQL (binding):**
```sql
CREATE TABLE runbook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('platform','agency','client')),
  agency_id uuid REFERENCES agency(id) ON DELETE CASCADE,
  client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  tailored_at timestamptz,
  tailor_status text CHECK (tailor_status IN ('pending','done','failed','skipped')),
  CHECK ((level = 'platform' AND agency_id IS NULL AND client_id IS NULL)
      OR (level = 'agency' AND agency_id IS NOT NULL AND client_id IS NULL)
      OR (level = 'client' AND agency_id IS NOT NULL AND client_id IS NOT NULL)),
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX runbook_platform_uq ON runbook (level) WHERE level = 'platform';
CREATE UNIQUE INDEX runbook_agency_uq ON runbook (agency_id) WHERE level = 'agency';
CREATE UNIQUE INDEX runbook_client_uq ON runbook (client_id) WHERE level = 'client';
CREATE TABLE runbook_item (
  runbook_id uuid NOT NULL REFERENCES runbook(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key ~ '^(play|self_rule|knob):[a-z][a-z0-9_]{0,79}$'),
  kind text NOT NULL CHECK (kind IN ('play','self_rule','knob')),
  content jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  business_area_ids text[],
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  upstream_version integer,
  upstream_snapshot jsonb,
  dismissed_upstream_version integer,
  customised boolean NOT NULL DEFAULT false,
  removed_upstream boolean NOT NULL DEFAULT false,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (runbook_id, item_key),
  CHECK (split_part(item_key, ':', 1) = kind)
);
REVOKE ALL ON runbook, runbook_item FROM app_user;
ALTER TABLE runbook ENABLE ROW LEVEL SECURITY;      ALTER TABLE runbook FORCE ROW LEVEL SECURITY;
ALTER TABLE runbook_item ENABLE ROW LEVEL SECURITY; ALTER TABLE runbook_item FORCE ROW LEVEL SECURITY;
ALTER TABLE brief_item ADD COLUMN playbook_version integer;
ALTER TABLE recommendation ADD COLUMN playbook_version integer;
```
**Tests (TDD):** `app_user` is denied on both tables; the level/owner CHECKs reject mixed rows; the platform unique index allows one platform runbook; the item_key/kind CHECK holds; guard suites (`tenant.test.ts`, `evidence.test.ts`) pass.
**Done when:** `pnpm --filter @cs/db exec vitest run runbooks tenant evidence` passes.

### Task 2: Runbook model (pure): items, effective view, update state
**Files:** create `packages/engine/src/runbook/{items.ts,state.ts,index.ts}` + tests.

**Interfaces:**
```ts
// items.ts
export const playContentSchema = z.strictObject({ trigger: z.enum([...MOVE_TYPES, ...CHANGE_TYPES, ...SELF_RULE_IDS]),
  title: z.string().min(1).max(PLAYBOOK_TITLE_MAX).refine(t => !t.includes('{{'), 'no placeholders in titles'),
  template: z.string().min(1).max(PLAYBOOK_TEMPLATE_MAX).refine(t => unknownPlaybookVars(t).length === 0, 'unknown placeholder'),
  effort: z.enum(['L','M','H']).optional(), impact: z.enum(['L','M','H']).optional() });
export const selfRuleContentSchema = selfRuleSchema;   // from @cs/verticals
export const knobContentSchemas = { thresholds: z.strictObject({ alert: z.number().int().min(1).max(100), brief: z.number().int().min(0).max(99) }).refine(t => t.brief < t.alert),
  focus_areas: z.strictObject({ areaIds: z.array(z.string().max(40)).max(20) }),
  tier_limits: discoverySchema.shape.tiers } as const;
export type ItemKind = 'play' | 'self_rule' | 'knob';
export interface RunbookItem { key: string; kind: ItemKind; content: unknown; enabled: boolean; businessAreaIds: string[] | null;
  version: number; upstreamVersion: number | null; upstreamSnapshot: unknown | null; dismissedUpstreamVersion: number | null;
  customised: boolean; removedUpstream: boolean }
export function parseItemContent(kind: ItemKind, key: string, content: unknown): { ok: true; value: unknown } | { ok: false; error: string };
export function itemsFromPack(pack: VerticalPack): Omit<RunbookItem,'version'|'upstreamVersion'|'upstreamSnapshot'|'dismissedUpstreamVersion'|'customised'|'removedUpstream'>[];  // plays + self_rules; no knobs
// state.ts
export type UpdateState = 'in_sync' | 'update_available' | 'new_upstream' | 'removed_upstream';
export function compareWithParent(child: RunbookItem[], parent: RunbookItem[]): { key: string; state: UpdateState; parentVersion: number | null }[];
export function copyItems(parent: RunbookItem[]): RunbookItem[];   // upstreamVersion = parent.version, upstreamSnapshot = parent content+enabled+areas, customised false
export interface EffectiveRunbook { source: 'client' | 'agency' | 'legacy'; plays: (Playbook & { version: number; businessAreaIds: string[] | null; effort?: 'L'|'M'|'H'; impact?: 'L'|'M'|'H' })[];
  selfRules: PackSelfRule[]; thresholds: ScoreThresholds | null; focusAreaIds: string[]; tierLimits: DiscoveryConfig['tiers'] | null }
export function effectiveFrom(items: RunbookItem[], source: EffectiveRunbook['source'], clientServices: string[] | null): EffectiveRunbook;
```
**Behaviour (state machine, binding):**
- `update_available`: the parent item exists, `parent.version > (child.upstreamVersion ?? 0)` and `parent.version !== child.dismissedUpstreamVersion`.
- `new_upstream`: the parent has the key and the child doesn't, unless the child holds a tombstone. A removed/declined item stays as a row with `enabled=false, removedUpstream=false, content` kept, and `dismissedUpstreamVersion = parent.version`, so it does not reappear.
- `removed_upstream`: the child has `upstreamVersion !== null` and the parent lacks the key.
- Otherwise `in_sync`. Items the child added itself (`upstreamVersion === null`) are always `in_sync`.
- `effectiveFrom`:
  - Plays: disabled ones are dropped. Plays whose `businessAreaIds` don't intersect `clientServices` are dropped (Review Focus 4), unless the play's trigger is a self-rule id or the ids are null.
  - Self-rules: disabled rules are dropped.
  - Knobs: missing knobs → null/[].
  - `Playbook.source` = `'agency'` for compatibility with existing callers.
**Tests (TDD):** each state from fixtures; a dismissed version is hidden but a newer one shows; a tombstone blocks `new_upstream`; `copyItems` snapshots; `effectiveFrom` filters disabled plays and area-limited plays; the play schema refuses `{{` in a title, an unknown var, and an over-length template; `itemsFromPack(hvac)` round-trips today's playbooks.
**Done when:** `pnpm --filter @cs/engine exec vitest run runbook` passes.

### Task 3: Runbook store + effective resolution with fallback
**Files:** create `packages/engine/src/runbook/store.ts` + test.

**Interfaces:**
```ts
export async function ensurePlatformRunbook(service: Db, generic: VerticalPack): Promise<string>;           // idempotent; items from itemsFromPack(generic) + knob:thresholds from generic.scoring.routing
export async function ensureAgencyRunbook(service: Db, agencyId: string, generic: VerticalPack): Promise<string>; // copies platform (ensures it first); idempotent (ON CONFLICT DO NOTHING on the partial unique index)
export async function createClientRunbook(service: Db, clientId: string, items: RunbookItem[], by: string): Promise<string>;
export async function readRunbookItems(service: Db, runbookId: string): Promise<RunbookItem[]>;
export async function loadClientRunbook(deps: { db: Db; packs: PackLoader }, clientId: string): Promise<EffectiveRunbook>;
export async function writeItem(service: Db, runbookId: string, item: RunbookItem, by: string): Promise<void>;  // bumps version, sets customised when content differs from upstreamSnapshot
```
**Behaviour (R2, binding order):**
1. If a client runbook exists → `effectiveFrom(items, 'client', client.services)`.
2. Else, if the agency has any `playbook_override` row for the client's vertical → **legacy**: plays from `resolvePlaybooks(db, agencyId, pack)` (today's function, kept as `resolveLegacyPlaybooks`) and self-rules from `pack.self_rules`.
3. Else, if an agency runbook exists → `effectiveFrom(agencyItems, 'agency', client.services)`.
4. Else → legacy (pack only).

`thresholds` always resolves per R3 (the client column first). A DB error propagates (no silent empty runbook). Item content that fails `parseItemContent` is skipped with a warning (Review Focus 2).

**Tests (TDD):** each branch of the order; an invalid stored item is skipped; ensure* are idempotent under concurrent calls (two `Promise.all` calls → one runbook); the R3 threshold order.
**Done when:** `pnpm --filter @cs/engine exec vitest run runbook` passes.

### Task 4: Engine reads the runbook
**Goal:** Briefs, move recommendations, the starting point, scoring thresholds and tiers use `loadClientRunbook`, with output unchanged for existing clients.
**Files:** modify `packages/engine/src/briefs/{playbooks,generate,recommendations,starting-point,gather,writer}.ts`, `packages/engine/src/score/{score,score-stage}.ts`, `packages/collectors/src/rivals/run.ts`, `packages/collectors/src/signals/tracked.ts`; tests alongside.

**Behaviour:**
- **Brief playbooks:** `generate.ts:111` and `recommendations.ts:57` call `loadClientRunbook` instead of `resolvePlaybooks`. They store `playbookVersion` next to `playbookId` in `brief_item`/`recommendation` (`recommendationFromItem` copies it).
- **Starting point:** `starting-point.ts:193-215` passes `runbook.selfRules` and `runbook.plays` (for effort/impact) into `evaluateSelfRules`. Playbook lookup goes through `runbook.plays`.
- **Thresholds:** `gather.ts:49` and `score.ts`/`score-stage.ts` use `runbook.thresholds ?? pack.scoring.routing` (score-stage loads the runbook once per client per run).
- **Focus areas (R4):** in `gather.ts`, sort candidates by (service ∈ focusAreaIds desc, existing order) before the cap.
- **Tier limits (R5):** `rivals/run.ts:369` and `tracked.ts:108` use the client's `tierLimits ?? pack.discovery.tiers`. Collectors receive a `runbookTiers?: (clientId) => Promise<Tiers | null>` dep; when it is absent (tests), they use the pack.
- `resolvePlaybooks` is renamed `resolveLegacyPlaybooks` and used only by the store's legacy branch.
- **Golden equivalence:** for the seeded HVAC + dental test clients with and without `playbook_override`, the legacy path and a backfilled client runbook (Task 7's converter) produce identical `Playbook[]`, self-rules and thresholds.
**Tests (TDD):** existing `playbooks`, `generate`, `recommendations`, `starting-point`, `score`, rivals tests pass; new: the golden equivalence; a client runbook with a customised play changes the brief prompt text; an area-limited play is skipped for a client without that area; a focus area re-orders candidates; the `tier_limits` knob changes the tier; `playbook_version` is stored.
**Done when:** `pnpm test:affected` passes.

### Task 5: AI tailoring job
**Files:** create `packages/engine/src/runbook/tailor.ts` (+ test), `apps/worker/src/jobs/runbooks.ts`; modify `apps/worker/src/main.ts`, `apps/worker/src/deps.ts`, `packages/tools/src/deps.ts` (`QueueJob` += `'runbook-tailor'`), `packages/tools/src/tools/setup.ts` (`advance_client_setup` enqueue after commit), `packages/ai/config/ai.yaml`.

**Interfaces:**
```ts
export const tailorOutputSchema = z.strictObject({ items: z.array(z.strictObject({ key: z.string(), title: z.string(), template: z.string(),
  businessAreaIds: z.array(z.string()).nullable() })).max(40) });
export function applyTailoring(base: RunbookItem[], raw: unknown, ctx: { areaIds: string[] }): { items: RunbookItem[]; rejected: string[] };
export async function tailorClientRunbook(d: { db: Db; ai: Ai; packs: PackLoader }, clientId: string): Promise<{ status: 'done' | 'failed' | 'skipped'; rejected: string[] }>;   // writes
export async function proposeTailoring(d: { db: Db; ai: Ai; packs: PackLoader }, clientId: string, key: string, parentContent: unknown): Promise<{ title: string; template: string; businessAreaIds: string[] | null } | null>;   // one item, never writes
// job: defineJob({ name: 'runbook-tailor', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short', retryLimit: 1 } })
```
**Behaviour:**
- **Skips:** paused / non-active clients and non-serviceable agencies (`skipped`). Demo/test envs also skip (the job is not run in E2E; E2E seeds a tailored runbook).
- **Base:** the agency runbook items (`ensureAgencyRunbook` first) → `copyItems`.
- **Prompt input** (through `redactForModel` with the client's business name):
  - the vertical name and audience noun
  - the client's business-area names with ids
  - the plays' key/title/template
- **Instruction:** "Rewrite each play's title and template so it fits a {vertical} serving {audience_noun}. Keep every {{placeholder}} exactly as written, add no new placeholders, keep titles under 200 characters with no placeholders, keep the advice practical and specific to the listed services. Optionally limit a play to the service ids it is about. Return JSON."
- **`applyTailoring` (Review Focus 3):** per item, accept only when the key exists, it is a play, `playContentSchema` passes with the base trigger/effort/impact, the placeholder set ⊆ the base item's placeholders, and `businessAreaIds ⊆ ctx.areaIds` (empty → null). Otherwise keep the base and add the key to `rejected`. Tailored items keep `upstreamSnapshot` = the agency content, so later agency edits still show as updates, and get `customised = false`.
- **Write:** `tailorClientRunbook` creates the client runbook when it has none, or replaces the play contents of an existing runbook whose `tailor_status` is `pending` (the `key:'*'` create path). It never overwrites a `customised` item. It sets `runbook.tailor_status`/`tailored_at`. The AI scope is `{ agencyId, clientId, verticalId }`.
- **`proposeTailoring`:** the same prompt and `applyTailoring` rules for one play (the parent's new content as the base). It returns the proposal or null and **never writes**. The pull/re-tailor tools (Task 6) show it for review.
- **Failure:** the AI error → the untailored copy is written, `tailor_status = 'failed'`.
- **Enqueue:** `advance_client_setup` (`confirm_competitors`/`skip_competitors`, first time only) enqueues `runbook-tailor` with singleton key `runbook-tailor:<clientId>` after commit, in a try/catch like `enqueueSetupSuggestions`.
- `ai.yaml`: `runbook_tailor: { provider: openrouter, model: <same as setup_suggestions>, fallbacks: [...], temperature: 0.3, max_tokens: 4000 }`.
**Tests (TDD):** `applyTailoring` rejects an unknown var, a `{{` title, a changed trigger, an over-length template, a foreign area id; accepts a valid rewrite. `tailorClientRunbook`: paused → skipped; AI failure → untailored + failed; success → client runbook with tailored text and a correct `upstreamSnapshot`; a customised item is never overwritten; `proposeTailoring` writes nothing. `advance_client_setup` enqueues once.
**Done when:** `pnpm test:affected` passes.

### Task 6: Runbook tools
**Files:** create `packages/tools/src/tools/runbooks.ts`, `runbooks.test.ts`; modify `tools/all.ts` (add `runbookTools`, remove `playbookTools`), `tools/schemas.ts`.

**Interfaces (all `channels: ['web']`, writes via the service connection inside `withPlatformAudit` for the platform level):**
```ts
type RunbookOwner = { level: 'platform' } | { level: 'agency' } | { level: 'client'; clientId: string };
get_runbook        { owner: RunbookOwner } → { level; source?: 'client'|'agency'|'legacy'; tailorStatus: string | null;
                     items: (RunbookItemView & { state: UpdateState; parent: { content: unknown; version: number } | null })[];
                     vars: string[]; businessAreas: { id: string; name: string }[] }   // businessAreas only for client
update_runbook_item { owner; key; content: unknown; businessAreaIds?: string[] | null } → RunbookItemView
set_runbook_item_enabled { owner; key; enabled: boolean } → RunbookItemView
pull_runbook_update { owner; key; content?: unknown } → RunbookItemView   // client level: content = the reviewed re-tailored text
dismiss_runbook_update { owner; key } → RunbookItemView
add_runbook_item    { owner; key } → RunbookItemView     // adopts a new_upstream parent item
remove_runbook_item { owner; key } → { ok: true }         // tombstone per Task 2
retailor_runbook_item { owner: {level:'client'; clientId}; key } → { proposed: { title: string; template: string; businessAreaIds: string[] | null } | null }
```
**Behaviour:**
- **Gates (R9):** platform level requires `requirePlatformOperator(deps, ctx, 'staff')`; agency level requires an agency role and `agency_admin` for writes; client level requires an agency role, the client in scope (`app_client_visible` semantics via `ctx.clientScope`), and `agency_admin|account_manager` for writes. Anything else → `not_found` (404) (Review Focus 5). Support sessions → `read_only_session`.
- **Lazy creation:** `get_runbook` lazily `ensureAgencyRunbook`. For a client without a runbook it returns the effective items read-only, with `source` set, plus the action "Create client runbook". That action is `add_runbook_item` with key `*`, which copies the agency runbook untailored and enqueues tailoring (decided: one call, `key: '*'`).
- **Content validation:** `content` is validated by `parseItemContent`; failures → `invalid_input` with the zod message (userFacing).
- **Client `thresholds` knob (R3):** writes through the `set_alert_rules` core (respects the CHECK).
- **Pulls and the client copy:** `pull_runbook_update` sets content (parent content, or the reviewed re-tailored content at client level), `upstreamVersion = parent.version`, `upstreamSnapshot = parent`, `customised = (content ≠ parent content)`. `dismiss` sets `dismissedUpstreamVersion`.
- **Re-tailoring:** `retailor_runbook_item` runs `proposeTailoring` **synchronously** (one AI call; rejected → `proposed: null`) and does not save.
- **Removed tools:** `list_playbooks`/`update_playbook` are removed. The web page is replaced in Task 8. Grep for other callers first.
**Tests (TDD):** each gate (client_owner, viewer, out-of-scope AM, other agency's clientId → not_found; AM can't edit the agency level); each update action against fixtures; an invalid content refusal; the thresholds knob writes `client.score_thresholds`; the `key:'*'` create copies and enqueues; lazy agency runbook; platform edit bumps the version and the agency sees `update_available`.
**Done when:** `pnpm --filter @cs/tools exec vitest run runbooks` passes.

### Task 7: Agency hooks + legacy backfill CLI
**Files:** modify `packages/tools/src/access/signup-complete.ts` (after the agency insert, `ensureAgencyRunbook` in the same tx), `apps/web/scripts/admin.ts` (`create-agency`), `apps/web/e2e/seed.ts`, `packages/demo/src/tenancy.ts`; create `apps/worker/src/cli/runbook-backfill.ts` (+ `package.json` script `runbook:backfill`), `packages/engine/src/runbook/legacy.ts` (+ test).

**Interfaces:**
```ts
export async function legacyClientItems(deps: { db: Db; packs: PackLoader }, clientId: string, agencyItems: RunbookItem[]): Promise<RunbookItem[]>;
// plays from resolveLegacyPlaybooks (overrides applied, disabled → enabled=false), self_rules from pack;
// upstreamVersion = agency item version, upstreamSnapshot = agency content, customised = content ≠ agency content (D14: no AI)
```
**Behaviour:**
- The CLI `pnpm --filter @cs/worker runbook:backfill [--dry-run]`:
  1. `ensurePlatformRunbook`.
  2. `ensureAgencyRunbook` for every agency.
  3. For every client without a runbook (all statuses), `createClientRunbook(legacyClientItems)` with `tailor_status = 'skipped'`.
  4. Print counts.

  It is idempotent. It does not touch `playbook_override`.
- The golden equivalence from Task 4 is asserted here too: the effective runbook of a backfilled client equals its legacy view.
- `docs/OPS.md` gets the backfill step for `cs_dev` and prod (after migrating, before the next brief run).
**Tests (TDD):** `legacy.test.ts` (override applied, disabled carried, customised flag); the CLI dry-run on seeded data reports counts and writes nothing; a second run is a no-op.
**Done when:** `pnpm test:affected` passes.

### Task 8: Shared editor + three pages
**Files:** create `apps/web/src/components/runbook/{runbook-editor.tsx,item-card.tsx,diff.tsx}` (+ `runbook-editor.test.tsx`), `apps/web/src/app/(platform)/platform/runbook/{page.tsx,actions.ts}`, `apps/web/src/app/(app)/agency/runbook/{page.tsx,actions.ts}`, `apps/web/src/app/(app)/c/[clientId]/settings/runbook/{page.tsx,actions.ts}`; modify `apps/web/src/app/(app)/agency/playbooks/page.tsx` (→ `redirect('/agency/runbook')`; delete `actions.ts`, `playbook-editor.tsx` and its test, moving reusable bits), `apps/web/src/components/shell/nav-items.ts` ("Playbooks" → "Runbook" at `/agency/runbook`; client module "Runbook" for agency roles only; platform "Runbook"), `sidebar-nav.tsx` icon map.

**Behaviour:**
- **Sections:** "Plays", "Starting-point rules", "Settings" (knobs).
- **Each play card:**
  - badge
  - title
  - on/off switch
  - "Edit" (title + template with a placeholder list from `vars`)
  - business-area multi-select (client level only)
  - effort/impact (read-only)
- **Badges (decided copy):** "Inherited" (in sync, not customised) · "Customised" · "Update available" · "New" · "Removed upstream".
- **Update available** opens a diff (old snapshot → new parent) with "Use the update" / "Keep mine". At client level, "Use the update" first calls `retailor_runbook_item` and shows "Tailored for this client" text for approval, with "Use as is" as a fallback.
- **Other prompts:**
  - New: "New play available" with "Add" / "Not now".
  - Removed: "No longer in the agency runbook" with "Keep" / "Remove".
- **Client page, no runbook yet:** banner "This client uses the agency runbook." with button "Create a runbook for this client". During tailoring: "Tailoring plays for {vertical}…" (poll like `useSetupPoll`, max 5 min). If tailoring failed: "We couldn't tailor these plays. They match the agency runbook; edit them as needed."
- **Settings knobs:** alert/brief thresholds (number inputs, same validation copy as `/settings/alerts`), focus services (checkboxes from the client's services), competitor tiers (two pairs of numbers, agency/platform only plus client override).
- **Preview** (client level): the rendered template with the client's latest candidate vars, or the fallbacks.
- **Gates:** client page → `if (!isAgencyRole(ctx.role)) notFound();`; platform page → operator gate. Writes go via `runTool` server actions; refusals → 404.
- Calm styling: existing chip/badge tokens.
**Tests:** `runbook-editor.test.tsx` (badge per state, the diff renders, the disabled switch for read-only roles); E2E in Task 9.
**Done when:** `pnpm --filter @cs/web typecheck` and `e2e:affected` pass.

### Task 9: E2E acceptance + docs
**Files:** create `apps/web/e2e/runbook.spec.ts`; modify `apps/web/e2e/seed.ts` (a tailored Distillery client runbook for the 14a Distillery client or a seeded one, plus an agency runbook), `apps/web/e2e/workflow.spec.ts` (the playbook card now reads from the runbook), `docs/work/phase-14b.md`, `docs/OPS.md`, `packages/engine/CLAUDE.md` (runbook resolution order).

**E2E `runbook.spec.ts` (`@runbook`):**
1. The agency admin opens `/c/<distillery>/settings/runbook` and sees tailored plays. They edit one play's template, which then shows "Customised".
2. The agency admin edits the same play in `/agency/runbook`. The client page shows "Update available"; "Keep mine" hides it.
3. The client owner gets 404 on `/c/<id>/settings/runbook`.
4. `/agency/playbooks` redirects to `/agency/runbook`.
5. A brief generated in E2E (seeded candidate, fake writer, as in `workflow.spec.ts`) uses the customised text.

**Docs:**
- Work file: Status, Interfaces, copy for owner sign-off (all decided copy in Tasks 5 and 8, plus the tailoring prompt), new backlog item ("Drop `playbook_override` after the runbook backfill is verified in prod — next migration").
- Owner verification:
  1. Run the backfill on `cs_dev`. Existing clients' next briefs are unchanged.
  2. A Distillery client's runbook is tailored and the quotes make sense.
  3. Customise a play; the next brief uses it.
  4. An agency edit shows "Update available" on the client.
  5. The platform runbook edit reaches agencies as an update.

**Done when:** `pnpm --filter @cs/web e2e:affected` and `pnpm test:affected` pass; docs committed; `git ls-files --eol | grep crlf` prints nothing.
