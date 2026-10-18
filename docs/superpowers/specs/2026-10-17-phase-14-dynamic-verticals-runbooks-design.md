# Phase 14 — Dynamic verticals, business areas and runbooks (design)

**Status:** owner-approved design, 2026-10-17. Branch `phase-14b` (plans both sub-phases). Brief: `docs/work/phase-14b.md`.
**Extends:** core spec §2.2 (more verticals), §4.1 (services from the vertical catalogue), §6.2–6.3 (per-vertical tagging, versioned config, stored factors), §6.5 (themes), §8.5 (playbooks), §10.5 (YAML packs + agency overrides — replaced here by DB rows).
**Sub-phases:** **14a** catalogue in the DB + auto-creation during setup + operator review; **14b** runbooks (platform → agency → client). 14a merges first; 14b depends on it.

**Acceptance:** add a new **Distillery** client → setup creates the vertical and its business areas where missing → the client's runbook is tailored for a distillery → the agency edits one play at `/c/[id]/settings/runbook` → the next brief uses that wording.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | Split 14a (catalogue) → 14b (runbooks), both planned on `phase-14b`. |
| D2 | A **business area** = one level of service offers per vertical (today's pack `services`). Google categories are mapping input only. |
| D3 | **Governance:** any agency user can create a vertical or business area; it is usable immediately, status `unreviewed`, and appears in an operator queue (`/platform/verticals`, pattern of `/platform/themes`) for approve / rename / edit / merge. Self-start and intake never write the catalogue directly; the vertical is created when an agency accepts the lead. Names never contain client data. |
| D4 | **Contents of a new vertical:** numeric knobs come from one platform `generic` row (no AI-guessed weights); text parts are LLM-drafted from GBP data, each item carrying its evidence quote, and reviewed in the setup wizard before save. |
| D5 | **Mapping:** deterministic first — GBP primary category, then additional categories, against each vertical's category lists (case-insensitive name match, today's `preselectVertical` rule). AI runs only when nothing matches (draft a new vertical) or to propose missing business areas. |
| D6 | **Migration:** `hvac_plumbing` and `dental` are seeded into the DB with the same ids, status `reviewed`, including phase-13b's v3 keys. YAML stays as fixtures and seed source only; the DB is the only runtime source. |
| D7 | **AI cost:** per-vertical tagging stays; cost is attributed per vertical on `/platform/costs`. |
| D8 | **Runbook inheritance = copy + "update available"**, three levels only: platform → agency → client (no vertical level). Each level holds a full copy; upstream changes surface as "Update available" and are pulled or dismissed. |
| D9 | **Runbook contents:** plays (trigger, title, template, effort/impact, on/off, optional business-area limits), starting-point self-rules, and safe knobs (alert/brief thresholds, focus business areas, competitor tier limits). Scoring weights stay on the vertical. |
| D10 | **Specificity:** the platform runbook is vertical-neutral; each **client copy is AI-tailored** to its vertical, business areas and audience noun at creation (one call per client). Pulling an update re-tailors that single item. |
| D11 | **Visibility:** agency-only (platform operators edit the platform runbook). Clients see only the effects. Platform-authored text never names Rival Monday. |
| D12 | **Editors:** `/platform/runbook`, `/agency/runbook` (replaces `/agency/playbooks`, which redirects), `/c/[clientId]/settings/runbook` (independent of 13a2; its Customisation page may link here later). |
| D13 | Catalogue changes reach new tagging runs only; **no backfill** of already-tagged events or analysed reviews (existing backlog limitation, unchanged). History is never rescored (§6.3 stored factors). |
| D14 | Existing HVAC/dental clients' runbooks are seeded **without AI** from their pack's current plays and self-rules with the agency's `playbook_override` applied, so their briefs don't change. |

## 2. 14a — Catalogue

### 2.1 Tables (global, not tenant-scoped; next free migration numbers at execution time)
```
vertical(
  id text pk,                       -- slug, immutable ('hvac_plumbing', 'dental', 'distillery')
  name text not null,
  status text not null check (status in ('reviewed','unreviewed','merged')),
  merged_into text null references vertical(id),
  version int not null default 1,   -- bumped on every edit/merge; feeds event_score.pack_version
  gbp_categories text[] not null,   -- primary-match list (pack discovery.categories)
  gbp_related_categories text[] not null default '{}',
  config jsonb not null,            -- the pack minus services/playbooks/self_rules (validated, §2.2)
  draft_evidence jsonb null,        -- quotes behind AI-drafted items
  created_by_agency_id uuid null references agency(id) on delete set null,
  created_at, updated_at, reviewed_at, reviewed_by text null
)
business_area(
  vertical_id text references vertical(id),
  id text,                          -- slug, unique within vertical
  name text not null, aliases text[] not null default '{}',
  status text not null check (status in ('reviewed','unreviewed','merged')),
  merged_into text null,            -- id within the same vertical (or target vertical after a vertical merge)
  evidence jsonb null, created_by_agency_id uuid null, created_at, reviewed_at,
  primary key (vertical_id, id)
)
```
- A row `vertical.id = 'generic'` (status `reviewed`, not selectable) holds default numeric knobs; a new vertical's `config` stores only text parts and any operator-set numbers; missing keys resolve from `generic`.
- Side table `vertical_category(category_lc text pk, vertical_id text references vertical(id), kind text check (kind in ('primary','related')))`, rewritten by the tools whenever `gbp_categories` changes: a category maps to at most one vertical (insert conflict → `invalid_input` naming the owning vertical). Lookup matching reads this table.
- Reads: every agency/web role can `select` non-merged rows. Writes only via tools in `@cs/tools` (owner role for platform tools).

### 2.2 Loader
- `@cs/verticals` keeps `VerticalPack` / `verticalPackSchema` as the engine-facing type. New `VerticalCatalog` (`loadCatalog(db)`) assembles a `VerticalPack` per non-merged vertical: `generic` config ⊕ vertical config ⊕ business areas as `services` ⊕ (until 14b lands) the seeded `playbooks`/`self_rules`. Result is validated with `verticalPackSchema`; a row that fails validation is logged and skipped, never thrown into a run.
- `resolveVerticalId(id)` follows `merged_into`.
- Replaces `createPackLoader` (engine tag stage), `packsOf` (tools deps) and `apps/web/src/server/verticals.ts`. Worker jobs load once per run; web caches 60 s.
- The hard-coded HVAC/dental spots switch to the catalogue: `agency/page.tsx` `VERTICAL_LABELS`, `onboarding/steps/profile.tsx`, `agency-onboarding.ts` `VERTICALS` enum (→ catalogue id check), `ask/src/turn.ts` prompt, `evidence/model-privacy.ts` (keep-list from catalogue names/areas), `server/setup-lookup.ts` fake.

### 2.3 Setup flow
1. **Match** (`find_business` / `preselectVertical`, unchanged rule over the catalogue): primary category, then additional categories → preselect.
2. **Missing areas** (matched vertical): `setup-suggestions` additionally returns GBP `services[]` entries that match no area name/alias as `newAreas: {name, quote}[]`; ticked ones are created `unreviewed` on profile save.
3. **No match:** dedupe first — pure TS `similarVerticals(name, catalogue)` in `@cs/verticals` (no DB extension): normalise (lowercase, strip punctuation and generic words like "craft", "service", "shop", singularise), then slug equality or token-set Jaccard ≥ 0.5 or normalised Levenshtein ≤ 0.25 against non-merged vertical names and categories → "Did you mean *X*?" (up to 3). Otherwise enqueue `vertical-draft`. The same check runs on the draft's name before save.
4. **`vertical-draft` job** (worker, one OpenRouter call; input via `redactForModel`): GBP category names, services, place topics, nearby rivals' categories from the existing maps search. Output (zod, every item with `quote`):
   ```ts
   VerticalDraft = { name: string; slug: string; audienceNoun: string;
     areas: { name: string; aliases: string[]; quote: string }[];      // 3–12
     seedKeywords: string[]; /* ≤5 */ categories: string[]; relatedCategories: string[];
     themes: { id: string; name: string; quote: string }[] }
   ```
   Model + prompt in `packages/ai/config/ai.yaml` (`vertical_draft`). Cost logged with `vertical` attribution.
5. **Review** in the profile step: rename, remove, add areas/keywords. The draft lives in setup state only; nothing is written until save.
6. **Save:** `create_vertical` (via `runTool`) inserts vertical + areas `unreviewed` with `created_by_agency_id`, then the client is saved against them (same transaction where possible).
7. **Failure:** draft error/timeout → manual form (name + areas), generic numbers. One draft per setup lookup (re-runs reuse the stored draft).
8. **Intake/pool (11c):** lead stores `suggestedVerticalId` **or** `verticalDraft`; `accept_lead` / `assign_lead` create the vertical on acceptance.

### 2.4 Operator queue and edits
- `/platform/verticals`: unreviewed verticals and areas with creator agency, client count, evidence quotes, draft cost; actions approve / rename (name only) / edit text + categories / merge. Console nav badge = queue count. No email.
- Agencies may add areas to any vertical (`unreviewed`); the creating agency may edit its own vertical's text while `unreviewed`; after review only operators edit.
- **Merge** (`merge_vertical`, `merge_business_area`, one transaction): rewrite `client.vertical_id`, `client.services` (dedupe), `playbook_override` / runbook area refs; re-key `event.services`, `review_analysis`, `price_point`, `theme_proposal` where no conflict, drop the merged side's duplicates; set source `merged` + `merged_into`; bump target `version`.

### 2.5 Tools (14a)
`list_verticals` (catalogue for pickers), `create_vertical`, `add_business_area`, `update_vertical` (creator while unreviewed, or operator), `review_vertical`, `review_business_area`, `merge_vertical`, `merge_business_area` (operator), `get_vertical_draft` (setup). `find_business` / `get_client_setup` outputs gain `verticalMatch: {id, name} | null` and `newAreas`. `create_client` / `save_setup_profile` accept a catalogue id (unknown → `invalid_input`). MCP exposes `list_verticals` only.

## 3. 14b — Runbooks

### 3.1 Tables (tenant-scoped with RLS, same pattern as `playbook_override`)
```
runbook(id uuid pk, level text check (level in ('platform','agency','client')),
        agency_id uuid null, client_id uuid null,
        unique (level, agency_id, client_id))       -- one per owner; platform has both null
runbook_item(
  runbook_id uuid references runbook(id) on delete cascade,
  item_key text,                     -- stable across copies, e.g. 'play:price_cut_defend'
  kind text check (kind in ('play','self_rule','knob')),
  content jsonb not null,            -- zod per kind (§3.2)
  enabled boolean not null default true,
  business_area_ids text[] null,     -- play applies only to these areas (null = all)
  version int not null default 1,
  upstream_version int null,         -- parent item version when copied/pulled
  upstream_snapshot jsonb null,      -- parent content at that time (diff base)
  customised boolean not null default false,
  dismissed_upstream_version int null,
  updated_by text not null, updated_at,
  primary key (runbook_id, item_key))
```
Platform runbook rows are readable by all agencies (copy source), writable by operators only. Agency rows readable/writable by that agency; client rows by that agency's staff. Client owners have no access (D11).

### 3.2 Item content
- `play`: `{ trigger: MoveType|ChangeType|SelfRuleId, title, template, effort?, impact? }` — template placeholders restricted to an allow-list (`{{competitor}}`, `{{audience_noun}}`, `{{business_area}}`, existing ones); `{{` refused in titles.
- `self_rule`: today's `selfRuleSchema` (`id`, `weight`, `playbook`, `strength`, `params`).
- `knob`: one of `thresholds` (`ScoreThresholds` {alert, brief}), `focus_areas` (business-area ids), `tier_limits` (discovery tier thresholds). `client.score_thresholds` migrates into the client `thresholds` knob; the column is dropped in a later migration once nothing reads it.

### 3.3 Copy, update available, tailoring
- Agency runbook copied from platform on agency creation; the migration creates one for every existing agency.
- Client runbook created by worker job **`runbook-tailor`** when setup's competitors step completes (before the starting point); skips paused / non-active clients. Copies the agency runbook, then one LLM call (input via `redactForModel`) rewrites play titles/templates for the client's vertical, areas and audience noun and may propose `business_area_ids`. Output validated (placeholders, titles); on failure the untailored copy is kept. Model + prompt in `ai.yaml` (`runbook_tailor`); cost attributed to the vertical.
- **Update available:** parent `version` > child `upstream_version` and ≠ `dismissed_upstream_version`. Pull = replace content (client level: re-tailor that item, shown for review before save); Dismiss = record the version. New parent items → "New play available — add"; parent item removed → "No longer in the agency runbook — keep / remove".
- Editing an item sets `customised = true` and bumps its `version` (which is what children compare against).

### 3.4 Engine
`engine/src/briefs/playbooks.ts`, `self-rules.ts`, `starting-point.ts` and the alert/brief threshold reads use `effectiveRunbook(clientId)`. Each recommendation stores `runbook_item_key` + `runbook_item_version`. Pack `playbooks`/`self_rules` and `playbook_override` are no longer read at runtime once 14b is on (`playbook_override` dropped after the seed). `upsell_tag` stays out of every client-facing read.

### 3.5 Tools and UI (14b)
Tools: `get_runbook` (level + owner), `update_runbook_item`, `set_runbook_item_enabled`, `pull_runbook_update`, `dismiss_runbook_update`, `add_runbook_item`, `remove_runbook_item`, `retailor_runbook_item`. One shared editor component on the three pages (D12): badges Inherited / Customised / Update available / New; on/off per play; business-area limits; preview filled with the client's data. Writes via `runTool`; refusals → 404.

### 3.6 Copy to sign off (at plan time)
Vertical-neutral platform plays and self-rule wording (generalised from today's HVAC/dental plays); setup copy "We don't track this business type yet", "Did you mean {name}?"; runbook badges and update prompts.

## 4. Testing focus
- Loader: seeded HVAC/dental packs assembled from the DB deep-equal today's YAML packs (golden test); `generic` fallback; invalid row skipped.
- Setup: match / no-match / dedupe / draft failure; Distillery end-to-end with `SETUP_FAKE_LOOKUP` + fake AI (E2E).
- Merge: every referencing table rewritten; no duplicate-key failures.
- Runbooks: RLS isolation (agency A can't read B's runbooks; owners can't read any); update-available state machine; tailoring validation fallback; existing clients' brief output unchanged after the seed (golden).

## 5. Dependencies on in-flight work
- **phase-13b** merged first: v3 pack keys (`tier_change`, `map_climb`, `scoring.version 3`), `ClientRow` in `@cs/db`, `ServiceAreaWrite`, profile-change map refresh. Migration numbers: next free at execution time.
- **phase-11-fixes** merged first: `get_client_setup.vertical.name`, seed-keyword chips, edits to `setup/lookup.ts`, `tools/setup.ts`, `onboarding/steps/profile.tsx`.
- **13a2** independent: if merged first, its Customisation page links to `/c/[id]/settings/runbook`.
