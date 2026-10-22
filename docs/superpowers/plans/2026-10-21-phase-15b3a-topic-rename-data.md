# Phase 15b-3a — topic rename: data & engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the review sense of `theme` to `topic` in the DB, stored data, Drizzle schema, core, verticals/packs, engine, worker, demo and web-only tool fields. MCP/Ask-exposed tools, routes, page keys and web component names stay as they are (15b-3b).

**Architecture:** One hand-written migration renames the table/column/indexes and backfills every stored id/key/placeholder. Code then renames package by package, bottom-up. Each task leaves the whole repo type-checking and its tests green, so it fixes its own ripple in consumers. `get_theme_benchmark` / `search_reviews` keep their exact MCP output through a thin mapping in `reputation.ts`.

**Tech Stack:** TypeScript, Drizzle + Postgres (local test cluster), Vitest, pnpm/Turborepo.

**Spec:** [docs/superpowers/specs/2026-10-21-phase-15b3-topic-rename-design.md](../specs/2026-10-21-phase-15b3-topic-rename-design.md) (D1–D6, §2, §3). Brief: `docs/work/phase-15b3.md`.

## Global constraints
- **Rename map (binding):** `theme`→`topic`, `themes`→`topics`, `themeId`→`topicId`, `themeName`→`topicName`, `theme_weakness`→`topic_weakness`, `theme_strength`→`topic_strength`, `fix_theme`→`fix_topic`, `{{theme}}`→`{{topic}}`, `theme_proposal`→`topic_proposal`, `ThemeX`→`TopicX`, file `themes.ts`→`topics.ts`.
- **Do NOT rename (C7 / 3b):** `theme_<vertical>__<id>` question keys and everything holding them (`decision_sample`, `gold_label`, `decision_review`, model-ops report, labeler); `ai.yaml` tasks `theme_discovery`, `theme_discovery_batch`; `THEME_BATCH_TASK`/`THEME_BATCH_PURPOSE` *values*; `model_batch.purpose`; stage `review_themes`; JSON-schema name `theme_proposal`; MCP/Ask tools `get_theme_benchmark`, `search_reviews` (names, `themeId` input, `themes` output, "Unknown theme"); `ask/labels.ts`; routes `/platform/themes`, `?theme=`; page key `page:platform.themes`; web component/file names (`ThemeQueue`, `ThemeHeatmap`, `theme-*.tsx`); UI theming (`themeVars`, `themeForViewer`, `@cs/ui`). Each C7 definition site gets `// kept: model-ops key (15b-3 C7)`. Each 3b-deferred site needs no comment.
- Never edit applied migrations. The new migration takes the **next free number at execution time** (≥ 0083 if phase-7 merged first).
- Free prose already stored (brief text, `what_changed`, `before_text`/`after_text`, `feedback` audit rows, Ask history) is not rewritten. New prose may say "topic".
- Every task ends with `pnpm typecheck` (or `npx turbo run typecheck`) green repo-wide. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. LF only.
- Test DB: this worktree's `cs_phase_15b3_test` (in `.env`), never `cs_test`, never Neon.

## Decisions
Spec D1–D6 and "My calls". Plan-local:
- P1. The backfill uses a temporary SQL function `topic_rename_ids(text)` (created and dropped inside the migration) so every jsonb/text rewrite shares one word-bounded regex.
- P2. `findTopicLeftovers` (new, `@cs/db`) is the single scan used by the test and by the owner's `cs_dev` check.
- P3. The MCP mapping for `get_theme_benchmark`/`search_reviews` lives in `packages/tools/src/tools/reputation.ts` as `toLegacyThemeFields(...)`, marked `// 15b-3b: delete`.

## File structure
- Create: `packages/db/migrations/<NNNN>_topic_rename.sql`, `packages/db/src/topic-rename.test.ts`, `packages/db/src/topic-leftovers.ts`, `packages/db/src/topic-leftovers.test.ts`, `packages/db/scripts/topic-leftovers.ts`.
- Rename: `packages/engine/src/reviews/themes.ts`(+test) → `topics.ts`, `packages/tools/src/tools/themes.ts`(+test) → `topics.ts`.
- Modify: files listed per task.

## Dependencies on in-flight work
- **phase-7** (0081 `runtime_roles`, 0082 `lifecycle`) edits `nav-items.ts`, `server/nav.ts`, `ai.yaml`, `tools/all.ts`, `channels.test.ts`, `mcp/server.test.ts`, `demo/coverage.ts`, `e2e/seed.ts`, worker `jobs/reviews.ts`/`model-ops.ts`. These are textual conflicts only. Re-check at Task 0 whether it has merged. If not, take 0081 only after confirming phase-7's numbers, or wait and rebase.
- **phase-7-planning:** docs only.

## Review focus
1. **A stored row the backfill misses** keeps an old id, and new-name readers silently drop it (complaint spikes vanish from moves, a self-rule finding has no playbook). Pinned by Task 1's per-table backfill test and Task 6's leftover scan over every jsonb column.
2. **Over-replacement:** a word-bounded regex must not touch `theme_dental__x` keys, `theme_discovery` purposes, or prose like "themes". Pinned in Task 1 (C7 rows untouched, prose untouched).
3. **Runbook drift:** rewriting a platform item but not its copies' `upstream_snapshot` would flag every client runbook as "upstream changed". Pinned in Task 1 (both rewritten) and Task 4 (`compareWithParent` shows no diff after backfill).
4. **MCP contract drift in 3a:** `get_theme_benchmark`/`search_reviews` must return byte-identical field names. Pinned in Task 3 snapshot test.
5. **Agency override with `{{theme}}`** renders as a blank or a raw `{{theme}}` if the backfill misses it. Pinned in Task 1 (override template) and Task 4 (`renderPlaybook` with `{{topic}}`).

---

### Task 0: Pre-flight
- [ ] `git -C <wt> fetch && git rebase main`. Note whether phase-7 has merged and pick the migration number (`ls packages/db/migrations | tail -3`, plus phase-7's work file).
- [ ] Re-check each spec §2.1 location against the code: `event` table = `changeEvent` (`schema/engine.ts:~216`), `move.details.facts` (`MoveDetails`), `model_batch.items` = `{ [customId]: ThemeDiscoveryContext }` (`reviews/discovery.ts:38`), `theme_proposal` pkey name (`\d theme_proposal` on the test DB). Fix the plan if any differ.
- [ ] Conflict-scan: `git grep -n "theme" -- packages apps` vs this plan's task file lists. Add any unlisted non-C7, non-3b file to the right task.
- **Done when:** plan updated (if needed) and committed `docs(phase-15b3): pre-flight`.

### Task 1: Migration + `@cs/db` schema rename + backfill test
**Files:** create `packages/db/migrations/<NNNN>_topic_rename.sql` (via `pnpm --filter @cs/db generate --custom --name=topic_rename`, then paste below) and `packages/db/src/topic-rename.test.ts`; modify `packages/db/src/schema/insights.ts`, `schema/engine.ts`, `schema/model-ops.ts` (comment only), `packages/db/src/insights.test.ts`, plus every consumer of the renamed Drizzle identifiers (engine/tools/web/worker/demo), with **identifier-only** edits.

**Interfaces (produces):** `topicProposal` (table `topic_proposal`, column `topicId`), `TopicProposalStatus`, `reviewAnalysis.topics`; `ChangeDetails` / detected-change details `topic?: string; topicName?: string` (replacing `theme`/`themeName`); `MoveDetails.facts` unchanged type (key `topic` by convention).

**Migration (full SQL; each block separated by `--> statement-breakpoint`; blocks after `-- backfill:start` are idempotent and re-run by the test):**
```sql
ALTER TABLE theme_proposal RENAME TO topic_proposal;
--> statement-breakpoint
ALTER TABLE topic_proposal RENAME COLUMN theme_id TO topic_id;
--> statement-breakpoint
ALTER TABLE topic_proposal RENAME CONSTRAINT theme_proposal_pkey TO topic_proposal_pkey;
--> statement-breakpoint
ALTER INDEX theme_proposal_live_unique RENAME TO topic_proposal_live_unique;
--> statement-breakpoint
ALTER INDEX theme_proposal_pending_unique RENAME TO topic_proposal_pending_unique;
--> statement-breakpoint
ALTER INDEX theme_proposal_vertical_idx RENAME TO topic_proposal_vertical_idx;
--> statement-breakpoint
ALTER TABLE review_analysis RENAME COLUMN themes TO topics;
--> statement-breakpoint
-- backfill:start
CREATE OR REPLACE FUNCTION topic_rename_ids(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(
           regexp_replace(regexp_replace(regexp_replace(t,
             '\mtheme_weakness\M', 'topic_weakness', 'g'),
             '\mtheme_strength\M', 'topic_strength', 'g'),
             '\mfix_theme\M', 'fix_topic', 'g'),
           '{{theme}}', '{{topic}}')
$$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM runbook_item a JOIN runbook_item b
               ON b.runbook_id = a.runbook_id AND b.item_key = topic_rename_ids(a.item_key)
             WHERE a.item_key <> topic_rename_ids(a.item_key))
  OR EXISTS (SELECT 1 FROM playbook_override a JOIN playbook_override b
               ON b.agency_id = a.agency_id AND b.vertical_id = a.vertical_id AND b.playbook_id = 'fix_topic'
             WHERE a.playbook_id = 'fix_theme')
  THEN RAISE EXCEPTION 'topic_rename: old and new ids both present'; END IF;
END $$;
--> statement-breakpoint
UPDATE vertical SET config = (config - 'themes') || jsonb_build_object('topics', config -> 'themes')
  WHERE jsonb_typeof(config) = 'object' AND config ? 'themes';
--> statement-breakpoint
UPDATE vertical SET draft_evidence = (draft_evidence - 'themes') || jsonb_build_object('topics', draft_evidence -> 'themes')
  WHERE jsonb_typeof(draft_evidence) = 'object' AND draft_evidence ? 'themes';
--> statement-breakpoint
UPDATE vertical_draft SET draft = (draft - 'themes') || jsonb_build_object('topics', draft -> 'themes')
  WHERE jsonb_typeof(draft) = 'object' AND draft ? 'themes';
--> statement-breakpoint
UPDATE vertical SET config = topic_rename_ids(config::text)::jsonb WHERE config::text <> topic_rename_ids(config::text);
--> statement-breakpoint
UPDATE vertical SET draft_evidence = topic_rename_ids(draft_evidence::text)::jsonb
  WHERE draft_evidence IS NOT NULL AND draft_evidence::text <> topic_rename_ids(draft_evidence::text);
--> statement-breakpoint
UPDATE vertical_draft SET draft = topic_rename_ids(draft::text)::jsonb WHERE draft::text <> topic_rename_ids(draft::text);
--> statement-breakpoint
UPDATE runbook_item SET
    item_key = topic_rename_ids(item_key),
    content = topic_rename_ids(content::text)::jsonb,
    upstream_snapshot = CASE WHEN upstream_snapshot IS NULL THEN NULL ELSE topic_rename_ids(upstream_snapshot::text)::jsonb END
  WHERE item_key <> topic_rename_ids(item_key)
     OR content::text <> topic_rename_ids(content::text)
     OR coalesce(upstream_snapshot::text, '') <> topic_rename_ids(coalesce(upstream_snapshot::text, ''));
--> statement-breakpoint
UPDATE playbook_override SET playbook_id = topic_rename_ids(playbook_id),
    template = CASE WHEN template IS NULL THEN NULL ELSE topic_rename_ids(template) END
  WHERE playbook_id <> topic_rename_ids(playbook_id) OR coalesce(template, '') <> topic_rename_ids(coalesce(template, ''));
--> statement-breakpoint
UPDATE brief_item SET playbook_id = 'fix_topic' WHERE playbook_id = 'fix_theme';
--> statement-breakpoint
UPDATE recommendation SET playbook_id = 'fix_topic' WHERE playbook_id = 'fix_theme';
--> statement-breakpoint
UPDATE detected_change SET details = (details - 'theme' - 'themeName')
    || jsonb_build_object('topic', details -> 'theme')
    || CASE WHEN details ? 'themeName' THEN jsonb_build_object('topicName', details -> 'themeName') ELSE '{}'::jsonb END
  WHERE details ? 'theme';
--> statement-breakpoint
UPDATE "event" SET details = (details - 'theme' - 'themeName')
    || jsonb_build_object('topic', details -> 'theme')
    || CASE WHEN details ? 'themeName' THEN jsonb_build_object('topicName', details -> 'themeName') ELSE '{}'::jsonb END
  WHERE details ? 'theme';
--> statement-breakpoint
UPDATE move SET details = jsonb_set(details #- '{facts,theme}', '{facts,topic}', details #> '{facts,theme}')
  WHERE details #> '{facts,theme}' IS NOT NULL;
--> statement-breakpoint
UPDATE model_batch SET items = (
    SELECT jsonb_object_agg(k, CASE WHEN jsonb_typeof(v) = 'object' AND v ? 'themeIds'
                                    THEN (v - 'themeIds') || jsonb_build_object('topicIds', v -> 'themeIds') ELSE v END)
    FROM jsonb_each(items) AS e(k, v))
  WHERE jsonb_typeof(items) = 'object'
    AND EXISTS (SELECT 1 FROM jsonb_each(items) AS e(k, v) WHERE jsonb_typeof(v) = 'object' AND v ? 'themeIds');
--> statement-breakpoint
DROP FUNCTION topic_rename_ids(text);
```
The test runs every block from the one starting `-- backfill:start` to the end. The `event` table name and the pkey name are confirmed in Task 0. RLS on `topic_proposal` carries over with the rename. Grants follow the table.

**Behaviour:** Drizzle schema matches the renamed objects (`drizzle-kit` snapshot: run `pnpm --filter @cs/db generate` afterwards and confirm it reports **no changes**; if it wants to emit SQL, fix the schema, not the migration). Engine/tools code that wrote `details.theme` now writes `details.topic` only where it is a pure Drizzle-type rename. Behavioural renames come in Tasks 3–5, but compile must pass.

**Tests (TDD) — `topic-rename.test.ts`** (follow `billing.test.ts:64`: read the `.sql`, split on `--> statement-breakpoint`, run blocks from `-- backfill:start` to the end as `dbs.owner`):
- `renames theme_proposal objects`: `pg_class` has `topic_proposal`, `topic_proposal_live_unique|pending_unique|vertical_idx`, `topic_proposal_pkey`; column `topic_id` exists; `review_analysis.topics` exists; RLS forced on `topic_proposal`.
- `backfills vertical config, draft and draft_evidence`: seed a vertical whose config has `themes`, `self_rules[{id:'theme_weakness',playbook:'fix_theme'}]`, `playbooks[{id:'fix_theme',trigger:'theme_weakness',template:'fix {{theme}} now'}]` and the description `"themes customers mention"`. After the run: `topics` present, `themes` absent, ids/placeholder renamed, the description prose unchanged.
- `backfills runbook items and their snapshots`: a platform item `self_rule:theme_weakness` plus an agency copy with `upstream_snapshot` holding `fix_theme`/`{{theme}}`. Both are renamed, and the key check constraints still pass.
- `backfills playbook_override, brief_item, recommendation`: `fix_theme` → `fix_topic`; override template `{{theme}}` → `{{topic}}`.
- `backfills complaint details in detected_change and event`: `{theme:'wait_time',themeName:'Wait time',count:3}` → `{topic:'wait_time',topicName:'Wait time',count:3}`; a row without `theme` is untouched.
- `backfills move facts and model_batch contexts`: `facts.theme` → `facts.topic`; `items.{c1:{themeIds:['a']}}` → `{topicIds:['a']}`, and `purpose` stays `theme_discovery`.
- `leaves C7 keys alone`: `decision_sample` key `theme_dental__wait_time` and `gold_label` row unchanged.
- `is idempotent`: running the backfill blocks twice gives the same rows.
- `refuses when old and new ids both exist`: seed `self_rule:theme_weakness` and `self_rule:topic_weakness` in one runbook. The DO block raises `topic_rename: old and new ids both present`.

**Done when:** `pnpm --filter @cs/db exec vitest run topic-rename insights` passes; `pnpm --filter @cs/db generate` reports no changes; repo typecheck green; commit `feat(db): rename theme_proposal/review themes to topic + backfill`.

### Task 2: Core, verticals, packs, catalogue seed, vertical-draft output
**Files:** modify `packages/core/src/domain.ts` (`SELF_RULE_IDS`), `packages/verticals/src/{schema,draft}.ts` (+ `catalog.test.ts`, `draft.test.ts`, `loader.test.ts`, `packs.test.ts`), `packages/verticals/packs/{dental,generic,hvac_plumbing}.yaml`, regenerate `packages/db/src/catalog-seed.sql.ts` (`pnpm --filter @cs/verticals seed-sql`), `apps/web/src/server/vertical-draft.ts` (+test; model output key and prompt wording "topic"), `apps/web/src/components/new-business-type-model.ts` (+test), `packages/tools/src/catalog/merge.ts`, `packages/tools/src/tools/{verticals,platform-verticals}.ts` (+tests; input/output `topics`), `apps/web/src/app/(platform)/platform/verticals/catalog-queue.tsx` (+test), plus engine readers of `pack.themes` (identifier-only).

**Interfaces (produces):** `SELF_RULE_IDS` contains `'topic_weakness','topic_strength'` (same positions); pack schema field `topics: TopicDef[]` (`{ id, name, description }`, `superRefine(uniqueIds('topic'))`); type exports `TopicDef` (was `ThemeDef` or equivalent); playbook id `fix_topic`; templates use `{{topic}}`. Tool inputs: `create_vertical`/`update_vertical` `{ topics }`; `list_catalog_review` output `topics`.

**Behaviour:** YAML packs and the regenerated seed carry `topics`, `fix_topic`, `topic_*` and `{{topic}}`. Applied migration 0077 is untouched. The vertical-draft prompt asks for `topics` and its parser reads `topics`. Merge logic (`catalog/merge.ts`) merges `topics`.

**Tests (TDD):**
- `packs.test.ts`: every pack has `topics` with unique ids; no pack contains `theme` keys, `fix_theme` or `{{theme}}` (string scan of the YAML).
- `schema`: a pack with `themes` fails validation (unknown/missing `topics`).
- `draft.test.ts` / `vertical-draft.test.ts`: the draft output `topics` parses; the prompt text contains "topic".
- `verticals.test.ts`: `create_vertical` with `topics` stores `config.topics`.
- `catalog-seed`: the generated SQL contains `"topics":` and not `"themes":`.

**Done when:** `pnpm --filter @cs/verticals exec vitest run`, `pnpm --filter @cs/tools exec vitest run verticals platform-verticals merge`, `pnpm --filter @cs/web exec vitest run vertical-draft new-business-type catalog-queue`; typecheck green; commit.

### Task 3: Engine reviews, events, moves, scoring, batches + MCP mapping
**Files:** rename `packages/engine/src/reviews/themes.ts`(+test) → `topics.ts`; modify `reviews/{discovery,benchmark,complaints}.ts`(+tests), `events/retract.ts`(+test), `moves/rules.ts`(+test), `score/score-stage.ts`(+test), `tag/{structured,tag-stage}.ts`, `model-ops/{batches,report}.ts` (report: comment only, C7 keys), `drain.ts`, `sweep.ts`(+test), `index.ts`, `test/fake-ai.ts`, `engine.live.test.ts`; `packages/tools/src/tools/reputation.ts`(+test), `packages/tools/src/workspace/labels.ts`(+test); `apps/worker/src/cli/engine-once.ts`, `apps/worker/src/jobs/{reviews,model-ops}.ts` (comments/identifiers).

**Interfaces:** `topicsForVertical(db, pack): Promise<TopicDef[]>`; `discoverTopic(...)` (was `discoverTheme`); `TopicDiscoveryContext { verticalId; otherCount; sampleReviewIds; topicIds; rejectedIds }`; `THEME_BATCH_TASK`/`THEME_BATCH_PURPOSE` constants keep their names and values (`// kept: model-ops key (15b-3 C7)`); `reviewBenchmark(...)` business rows carry `topics: TopicShare[]` (was `themes`); `complaintBlockKey(verticalId, topicId)` (same string); complaint details write `{ topic, topicName }`; `retract.ts` predicate `details ? 'topic'`; `moves/rules.ts` reads `details.topic/topicName` and writes `facts.topic`; `score-stage` `detailsSignature` uses `d.topic` (same string output); `toLegacyThemeFields` in `reputation.ts` (`// 15b-3b: delete`).

**Behaviour:** The engine reads and writes only new names. The `get_theme_benchmark` and `search_reviews` outputs keep `themes`/`themeId`/"Unknown theme" by mapping at the tool boundary. Their input `themeId` maps to engine `topicId`. `labels.ts` reads `topicName`. The question key `theme_<v>__<id>` builders in discovery/labeler stay.

**Tests (TDD):**
- `topics.test.ts`: `topicsForVertical` returns pack topics plus approved `topic_proposal` rows.
- `complaints.test.ts`: a spike writes `details.topic`/`topicName` and the block key is unchanged.
- `retract.test.ts`: complaint rows (`details ? 'topic'`) are not superseded by structured retraction.
- `rules.test.ts`: a reputation slump from complaint events with `details.topic` sets `facts.topic` and the title text.
- `score-stage.test.ts`: the signature for a complaint event is `reviews|<topicId>|…`, the same string as before.
- `discovery.test.ts` / batches: a batch item stores `topicIds`; `purpose` is `theme_discovery`; applying the batch reads `topicIds`.
- `reputation.test.ts` **snapshot**: `get_theme_benchmark` output keys and `search_reviews` output/error are exactly as before (`themes`, `themeId`, "Unknown theme").

**Done when:** `pnpm --filter @cs/engine exec vitest run reviews events moves score model-ops sweep`, `pnpm --filter @cs/tools exec vitest run reputation labels`, `pnpm --filter @cs/mcp exec vitest run`; typecheck green; commit.

### Task 4: Briefs, playbooks, runbooks, web item card
**Files:** modify `packages/engine/src/briefs/{playbooks,self-rules,starting-point}.ts`(+tests incl. `starting-point-text.test.ts`), `packages/engine/src/runbook/*` (`tailor.test.ts`, state/items as needed), `apps/web/src/components/runbook/item-card.tsx` (`FALLBACK` key `topic`).

**Interfaces:** `PLAYBOOK_VARS = ['competitor','service','new_price','areas','topic'] as const`; `renderPlaybook(template, { topic })` with fallback text "this topic" under `topic`; self-rule ids `topic_weakness`/`topic_strength` with finding `values.topic`; `starting-point.ts` WHY map keys `topic_weakness`/`topic_strength`; the fact line stays `Topic <x>: …`.

**Behaviour:** `{{theme}}` is an unknown placeholder (runbook item edit and tailor reject it). Legacy `playbook_override` rendering uses `{{topic}}`.

**Tests (TDD):**
- `playbooks.test.ts`: `renderPlaybook('fix {{topic}}', {topic:'Wait time'})` → `fix Wait time`; a missing topic → "this topic"; `unknownPlaceholders('x {{theme}}')` → `['theme']`.
- `self-rules.test.ts`: the weakness/strength findings use ids `topic_*` and `values.topic`, and their playbook is `fix_topic`/`promote_strength`.
- `tailor.test.ts`: tailoring output with `{{theme}}` is rejected; `{{topic}}` is accepted.
- runbook state test: after the Task 1 backfill fixture shape (platform item + copy with new-name snapshot), `compareWithParent` reports no upstream change.

**Done when:** `pnpm --filter @cs/engine exec vitest run briefs runbook`, `pnpm --filter @cs/web exec vitest run item-card`; typecheck green; commit.

### Task 5: Web-only tools — proposals, nav counts, schemas
**Files:** rename `packages/tools/src/tools/themes.ts`(+test) → `topics.ts`; modify `tools/schemas.ts`, `tools/all.ts`, `tools/nav-counts.ts`(+test; output `topics`), `tools/access-marks.test.ts`, `tools/channels.test.ts`, `tools/workspace-fixtures.ts`, `billing-guard.ts`; web callers `apps/web/src/app/(platform)/platform/themes/{actions.ts,page.tsx,theme-queue.tsx}` (tool names/fields only; files and route keep their names), `apps/web/src/server/nav.ts`(+`nav-counts.test.ts`), `components/shell/{nav-items,sidebar-nav}.tsx|ts`(+tests; `counts.topics`, `pendingTopics`; href unchanged), `help-platform.test.tsx` if it fakes the tool.

**Interfaces:** tools `list_topic_proposals` → `TopicProposalView[]`, `decide_topic_proposal({ id, decision })` (same shape otherwise); `get_platform_nav_counts` output `{ …, topics: number }`; schemas `TopicProposalView`, `TopicBenchmarkView` (internal type name; the MCP field names stay via Task 3's mapping); channels unchanged (web-only).

**Behaviour:** Old tool names are removed (D3). The nav item for topic proposals still links `/platform/themes` until 3b.

**Tests (TDD):**
- `topics.test.ts`: list returns pending proposals with `topicId`; decide approve/reject updates `topic_proposal`.
- `nav-counts.test.ts`: the output has `topics` and no `themes`.
- `channels.test.ts` / `access-marks.test.ts`: the registry has `list_topic_proposals` and `decide_topic_proposal`, and not the old names.
- web `nav-items.test.ts`: the badge reads `counts.topics`.

**Done when:** `pnpm --filter @cs/tools exec vitest run topics nav-counts channels access-marks`, `pnpm --filter @cs/web exec vitest run nav`; typecheck green; commit.

### Task 6: Demo, E2E seed, leftover scan, C7 comments
**Files:** modify `packages/demo/src/{agency,changes,coverage,names,platform,reviews}.ts`(+tests), `apps/web/e2e/seed.ts`, `packages/ai/src/*.test.ts` (only if they assert renamed fields); create `packages/db/src/topic-leftovers.ts`, `topic-leftovers.test.ts`, `packages/db/scripts/topic-leftovers.ts` (+ `package.json` script `topic-leftovers`); add the C7 `// kept` comments (`ai.yaml` task lines, `THEME_BATCH_*`, question-key builders, `model_batch.purpose`, stage `review_themes`); update `docs/OPS.md` with a one-line owner step.

**Interfaces:** `findTopicLeftovers(db): Promise<{ table: string; column: string; rows: number }[]>`. It scans every `public` jsonb column plus `runbook_item.item_key`, `playbook_override.playbook_id|template`, `brief_item.playbook_id` and `recommendation.playbook_id` for `\m(theme_weakness|theme_strength|fix_theme)\M|\{\{theme\}\}`, plus `vertical.config ? 'themes'`, `review`-details `? 'theme'` on `detected_change`/`event`, and `model_batch` contexts with `themeIds`. It excludes `feedback` and Ask message tables (history). The script prints the rows and exits 1 if any exist.

**Behaviour:** Demo data and the E2E seed write only new names.

**Tests (TDD):**
- `topic-leftovers.test.ts`: on the migrated test DB with the catalogue seed plus a demo seed (follow `packages/demo/src/agency.test.ts` setup), `findTopicLeftovers` returns `[]`; after inserting one `detected_change` with `details.theme` it reports that table.
- demo `reviews.test.ts`: demo analyses use `topics`.

**Done when:** `pnpm --filter @cs/db exec vitest run topic-leftovers`, `pnpm --filter @cs/demo exec vitest run`; `pnpm test:affected` and `pnpm --filter @cs/web e2e:affected` green; `git grep -nE "\b(themeProposal|theme_proposal|fix_theme|theme_weakness|theme_strength)\b|\{\{theme\}\}" -- packages apps ':!packages/db/migrations'` prints only C7 sites (the JSON-schema name `theme_proposal`); commit.

**Owner step (after merge):** `pnpm --filter @cs/db migrate` against `cs_dev` (OPS runbook), then `pnpm --filter @cs/db topic-leftovers` against `cs_dev`. It should print nothing.
