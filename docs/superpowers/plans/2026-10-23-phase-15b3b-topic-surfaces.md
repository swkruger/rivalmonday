# Phase 15b-3b — topic surfaces + three topic fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the review-sense `theme` → `topic` rename on every surface (MCP/Ask tools and fields, routes, query param, help key/tips/guide, web names), and land the three folded topic fixes: vertical-tagged batch discovery spend, the generic `staff_professionalism` id, and automatic re-asking of older reviews.

**Spec (binding):** [2026-10-23-phase-15b3b-topic-surfaces-design.md](../specs/2026-10-23-phase-15b3b-topic-surfaces-design.md) (E1–E6, §2–§7), built on [15b-3 spec](../specs/2026-10-21-phase-15b3-topic-rename-design.md) §3 (C7 exceptions) and §4 (surface list), D3 (no aliases/redirects), D4 (no dual-read). Brief + file inventory: `docs/work/phase-15b3b.md` §2.

**Tech stack:** TypeScript, Drizzle + Postgres (local test cluster), Vitest, Playwright, pg-boss 10, pnpm/Turborepo.

## Global constraints
- **Rename map (binding):** `get_theme_benchmark`→`get_topic_benchmark`, `getThemeBenchmark`→`getTopicBenchmark`, `search_reviews.themeId`→`topicId`, output `themes`→`topics`, inner `themeId`→`topicId` (E3, end to end incl. web), `Unknown theme`→`Unknown topic`, `/platform/themes`→`/platform/topics`, `?theme=`→`?topic=`, `page:platform.themes`→`page:platform.topics`, `PAGE_COPY['platform.themes']`→`['platform.topics']`, tip ids `platform.themes.*`→`platform.topics.*`, `ThemeProposalsPage`/`ThemeQueue`/`decideThemeAction`→`Topic…`, `theme-queue.tsx`→`topic-queue.tsx`, `theme-heatmap.tsx`/`ThemeHeatmap`→`topic-heatmap.tsx`/`TopicHeatmap`, guide `platform.themes.operator.md`→`platform.topics.operator.md`. Delete `toLegacyThemeFields`.
- **Never rename (C7, UI theming, history):** `theme_<v>__<id>` keys + `themeKey`, `THEME_BATCH_TASK`/`THEME_BATCH_PURPOSE`, `ai.yaml` `theme_discovery*`, `model_batch.purpose`, stage `review_themes`, JSON-schema name `theme_proposal`, `model-ops/report.ts` family `theme`, `llm_call.task`; `themeVars`, `themeForViewer`, `server/theme.ts`, `shell-theme.tsx`, `@cs/ui`; applied migrations; Ask message history; `docs/research/*`, `docs/archive/*`.
- **No aliases, no redirects (D3):** old tool names are unknown tools; `/platform/themes` is a 404; `?theme=` is ignored.
- Migrations: next free numbers **at execution** (phase-7b1 is claiming 0085–0087 now). Never edit applied migrations. Test DB: this worktree's own (`cs_phase_15b3b_test`, `bash scripts/local-test-db.sh env`), never `cs_test`, never Neon.
- Web reads via registered tools; web writes via `runTool`; refusals → 404. Help copy stays `server-only`. Every `PageHeader` page keeps a help key + guide.
- Each task ends with the repo type-checking (`npx turbo run typecheck`) and its focused tests green; reviewers run `pnpm test:affected` (+ `pnpm --filter @cs/web e2e:affected` when web files changed). LF only. Commits end `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents: their own model line).

## Decisions
Spec E1–E6 and its "My calls" bind. Plan-local calls (P = plan):
- **P1 Two migrations, not one.** `review_analysis.checked_at` is a plain Drizzle column → `pnpm --filter @cs/db generate --name=review_checked_at` (keeps the snapshot current; `@cs/db` CLAUDE.md: `--custom` for a column leaves the snapshot stale). The id rename is `generate --custom --name=generic_topic_id`. Order: `generic_topic_id` (Task 2) then `review_checked_at` (Task 7).
- **P2 Collision = keep the existing target, drop the old.** Spec §4.4 "skip it and keep the existing one" read as: the old key/label/array element is removed, the existing `staff_professionalism` one wins (else leftovers and orphan labels would remain).
- **P3 Drafts carry no topic ids** (`vertical-draft.ts` schema: `topics[]{name, quote}`). The migration still rewrites the exact JSON string `"technician_professionalism"` in `vertical_draft.draft` and inheriting verticals' `draft_evidence` (cheap, idempotent, normally 0 rows). Other stored ids found by code: `detected_change.block_key` + `details.topic` and `event.details.topic` (complaint spikes, scoped by `details.verticalId`), `model_batch.items` contexts. Pre-flight confirms nothing else.
- **P4 The generic row's `version` and `updated_at` are not bumped** by the migration (a rename is not a topic change; bumping `updated_at` would trigger a re-ask wave of every below-τ generic seed topic).
- **P5 Re-ask reads topics fresh from the DB**, not through the 60-s cached pack loader (`createCatalog ttlMs: 60_000`): seed = `vertical.config.topics` if the key exists, else `generic.config.topics` (= `assemblePack`'s whole-array replace); approved = `topic_proposal`. A cached stale pack would let the handler mark a row checked without asking a just-edited seed topic. Pack loader only supplies `pack.name` for `business_type`.
- **P6 The marker is the handler's start time** (`startedAt`, captured before any read), not the write time, so a topic approved mid-run is caught by the next sweep.
- **P7 The vertical-edit trigger also needs a seed topic missing from `asked`** in SQL (spec §5 says "can be computed in SQL"); without it any business-area edit (`merge.ts` bumps `updated_at`) would enqueue every review of that vertical for a no-op mark and burn the daily cap.
- **P8 Re-ask is limited to current verticals and to a done `REVIEW_STAGE`.** (a) rows only for verticals still in `competitorVerticals`; candidates need a `stage_run` with `status = 'done'` for the current text (not the sweep's `finished()`, which also counts failed/exhausted). Same vertical set as `competitorVerticals` (no serviceable filter), matching `analyzeReview`.
- **P9 Failure retry = the next sweep** (spec: `ENGINE_STAGE_QUEUE`, marker only on success). There is no `stage_run` backoff for re-ask, so a review whose decide keeps throwing is re-offered every 5 min while no new reviews are pending. `decide` throws only when Jev and the LLM both fail; accepted, logged, flagged for the owner (work file).
- **P10 Copy:** the sign-off doc is written first (Task 1) so the owner can sign while code proceeds; Task 6 applies the proposed text unless the owner amended it. Owner sign-off is a merge precondition.
- **P11 `packages/mcp/src/prompts.ts` needs no change** (it never names the benchmark tool). The 8b tool-access register `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md:98` is updated (tools CLAUDE.md requires it).

## File structure
- **Create:** `packages/db/migrations/<N>_generic_topic_id.sql`, `packages/db/migrations/<N+1>_review_checked_at.sql` (+ `meta/*`), `packages/db/src/generic-topic-id.test.ts`, `packages/engine/src/reviews/reask.test.ts`, `docs/archive/phase-15b3b-copy-signoff.md`.
- **Rename (git mv):** `apps/web/src/app/(platform)/platform/themes/` → `topics/` (`theme-queue.tsx`(+test) → `topic-queue.tsx`(+test)); `apps/web/src/components/charts/theme-heatmap.tsx`(+test) → `topic-heatmap.tsx`(+test); `docs/help/pages/platform.themes.operator.md` → `platform.topics.operator.md`.
- **Modify:** per task.

## Dependencies on in-flight work (re-check in Task 0)
- **phase-7b1** (executing, docs-only commits on its branch as of Task 0 pre-flight 2026-10-23, NOT merged; claims 0085 `ledger_cost_numeric`, 0086 `spend_guard`, 0087 `retry_backoff`): plans the **same** `collectBatch(…, scopeFor?)` change (returns a full `CallScope`, replace semantics, caller passes `{ ...PLATFORM, verticalId }`); ours (`Partial<CallScope>`, merged) gives identical rows for that caller — the second merger keeps one version. It also edits `model-ops/batches.ts` (pending/nullable `provider_batch_id`), `apps/worker/src/{jobs,main}.ts` and every AI job's `usesAi: true` (incl. `engine-review`). **If 7b1 merged first:** `engine-reask` must set `usesAi: true` (Task 8) and our migrations renumber after 0087. **If we merge first:** tell 7b1 to add `engine-reask` to its `usesAi` list.
- **phase-15c2** (docs only so far): its tasks on `platform/themes/*`, `theme-heatmap.tsx`, Reviews `page.tsx`, `help/copy/platform.ts`, `nav-items.ts` rebase on our renames (E2). It may claim a migration (`ask_thread.deleted_at`).
- **phase-7c1 / 7c2** (planned, not started): 7c1's `ISOLATION_FIXTURES`, MCP exact lists and Ask evals must use `get_topic_benchmark` / `topicId` (its plan already notes this); 7c2's per-queue concurrency list leaves `engine-reask` at the default 1 (intended: spreads re-ask spend).
- **phase-7-planning:** merged into `main` (docs only). Rebased onto `b93f7ff4` in Task 0 (done).
- **Migration numbers (Task 0, 2026-10-23):** `main` holds 0000–0084; `cs_dev` applied through 0084. 7b1 and 15c2 are unmerged and claim 0085–0087 / maybe 0085. **N = next free at Task 2 execution**: 0085 (`generic_topic_id`) and 0086 (`review_checked_at`) if 7b1 has not merged by then; if it has, 0088 and 0089. Whoever merges second renumbers (journal + meta snapshot). Re-check `ls packages/db/migrations | tail -3` at Task 2 and Task 7.

## Review focus (failure modes no single task test catches)
1. **SQL candidate set and JS gap disagree** → an AI call every sweep for the same review, or a gap marked checked without asking. Pinned by Task 7 `sweep candidates equal reviews with a non-empty JS gap` (fixture matrix: approved-after, approved-before-but-unasked, vertical edit with/without missing seed, inheriting vertical + generic edit, new vertical, removed vertical) and `a second sweep selects nothing`.
2. **Re-ask (a) clobbers the first analysis** (moves `analyzed_at` so discovery recounts, rewrites `sentiment`/`other`, or writes answers for a text edited mid-run). Pinned by Task 7 `(a) keeps analyzed_at, sentiment, other, analysis_version` and `a text edit between read and write leaves the row alone`.
3. **Migration scope wrong**: an `hvac_plumbing` or own-topics row rewritten, an inheriting vertical missed, or a PK/unique violation on collision. Pinned by Task 2 per-table tests incl. `leaves hvac_plumbing and own-topic verticals untouched` and the three collision tests; Task 2 leftover check on the migrated DB.
4. **Old MCP names quietly half-work**: zod strips unknown keys, so an old client's `themeId` would return unfiltered reviews with no error. Pinned by Task 4 `tools/list input schema of search_reviews has topicId and no themeId` + `get_theme_benchmark is an unknown tool` (MCP), and the work-file note for MCP users.
5. **Help ids drift from the page** (a renamed tip id with no copy renders an empty tip; guide key mismatch hides the guide button). Pinned by Task 6 `every tip/empty id on /platform/topics resolves in PAGE_COPY` (help-platform test) and the kb coverage list.

---

### Task 0: Pre-flight
- [x] `git -C <wt> fetch` (local) and `git rebase main`; confirm the base includes `b93f7ff4`. Read `git show phase-7b1:docs/work/phase-7b1.md` and `git log main..phase-7b1`, `main..phase-15c2`: note merged/unmerged, migrations taken; set N in the File structure.
- [x] Re-check "Dependencies" above; if 7b1 merged, mark Task 3 as "verify + add test only" and Task 8's `usesAi`.
- [x] Conflict-scan: `git grep -n -i "theme" -- packages apps` vs the task file lists; every non-C7, non-UI hit belongs to a task. Confirm `apps/web/scripts/e2e-affected-rules.ts` lines (~170, ~195, ~217) and `packages/demo/src/coverage.ts` (~231, ~270, ~366, ~393).
- [x] **`cs_dev` read-only enumeration** (OPS.md; owner `DATABASE_URL`; only `SELECT`; use psql `\gexec` or a throwaway tsx script in the scratchpad, never committed):
  - every `public` column of type `jsonb`/`text` whose `::text` contains `technician_professionalism`, with row counts and the vertical ids involved;
  - collision counts for the inheriting set `S = {generic} ∪ {v : NOT config ? 'topics'}`: `review_analysis` rows with both ids, `topic_proposal` rows with `topic_id = 'staff_professionalism'` in S, `decision_label` pairs (same `sample_id`, old and new key), `decision_sample` objects with both keys;
  - user triggers on `detected_change`, `event`, `decision_label`, `decision_sample` (`pg_trigger WHERE NOT tgisinternal`) — an UPDATE-blocking trigger changes Task 2's SQL;
  - re-ask volume: reviews in the 180-day set with a gap (run Task 7's candidate SQL as a `count(*)` without LIMIT) — record it; at 2,000/day this is the drain time.
- [x] Fix the plan for anything found (new stored location → Task 2 SQL + test). Record counts in `docs/work/phase-15b3b.md` § Pre-flight.
- **Done when:** plan/work file updated and committed `docs(phase-15b3b): pre-flight`.
- **Result (2026-10-23):** see `docs/work/phase-15b3b.md` § Pre-flight. 7b1 unmerged (usesAi stays conditional; Task 3 stays full); no new stored locations; cs_dev collisions 0; re-ask deploy wave ~1,375 reviews.

### Task 1: Copy sign-off doc
**Goal:** Put every changed user-facing string in front of the owner before Task 6 applies it (spec §6, E5).
**Files:** create `docs/archive/phase-15b3b-copy-signoff.md` (moved to `docs/archive/` at merge).
**Behaviour:** one table per surface, columns *Where (file:key)* / *Current* / *Proposed*. Copy the decided text below verbatim; "unchanged" rows list the text and say "unchanged — id/key rename only". End with **Decisions for the owner** (below) and a sign-off line (`Approved as a whole / with changes: …, date`).

**Proposed copy (decided; applied in Tasks 4 and 6):**
- `help/copy/platform.ts` `platform.topics.description`: *New review topics found in reviews that didn’t fit any existing topic. An approved topic is asked for every new review, and reviews from the last 180 days are checked for it too.*
- tip `platform.topics.decide` body: *Approve a topic and it is asked for every new review in that business type, and reviews from the last 180 days are checked for it in the background. Reject it and it is not proposed again. A decision cannot be undone from this page, and a proposal someone else already decided shows an error.*
- tips `source`, `decided`, empty state `queue`: unchanged text, ids renamed.
- PageHeader title / breadcrumb / metadata: *Topic proposals* · *Platform › Topic proposals* (unchanged).
- Guide `platform.topics.operator.md`: front matter `help_key: page:platform.topics`; How to use it, step 2: *…**Approve** to add it: it is asked for every new review in that business type, and reviews from the last **180 days** are checked for it too. **Reject** to turn it down: it is not proposed again.* Common question retitled **"Does approving check older reviews?"**, answer: *Yes, back to 180 days. After you approve a topic, reviews of that business type from the last 180 days are checked for it in the background, after any new reviews and at most 2,000 reviews a day across the platform. Older reviews are not checked. Until the check is done, the topic's numbers are based on fewer reviews. The same check runs when a business type's topics are edited, and when a competitor starts being tracked for another business type.*
- MCP/Ask `get_topic_benchmark` description: *Review topics, your business vs each tracked competitor: how often each topic comes up and how positively, last 90 days vs the 90 before.*
- `search_reviews` description: *Search Google reviews of your business and tracked competitors by business, topic, stars or text. Reviewer identities are never returned.* Error: *Unknown topic*.
- `get_platform_nav_counts` description and error: unchanged (already "topic proposals").
- Ask label `get_topic_benchmark`: *Comparing review topics…* (unchanged text, key renamed).

**Decisions for the owner:** (1) the guide's "Yes, back to 180 days" answer; (2) naming the 2,000-a-day cap in an operator guide (operator audience may see internals); (3) the last guide sentence about topic edits and new business types (drop it if too much); (4) MCP tool descriptions; (5) client-facing Reviews copy stays unchanged (it never promised "new reviews only"); (6) note for MCP users that `get_theme_benchmark`/`themeId` are gone with no alias (D3) — announce or not.
**Done when:** doc committed `docs(phase-15b3b): copy sign-off draft`; the work file's Next says "owner signs copy before merge".

### Task 2: Generic topic id migration + packs + leftover check
**Goal:** `generic`'s `technician_professionalism` becomes `staff_professionalism` in source and in every stored row of generic and inheriting verticals (spec §4).
**Files:** modify `packages/verticals/packs/generic.yaml:12`; regenerate `packages/db/src/catalog-seed.sql.ts` (`pnpm --filter @cs/verticals seed-sql`); create `packages/db/migrations/<N>_generic_topic_id.sql` (`pnpm --filter @cs/db generate --custom --name=generic_topic_id`, paste below), `packages/db/src/generic-topic-id.test.ts`; modify `packages/db/src/topic-leftovers.ts` (+ `topic-leftovers.test.ts`); `packages/demo/src/*` and `packages/engine/src/reviews/benchmark.test.ts` only where they exercise `generic` (HVAC's id stays).
**Interfaces:** `TopicLeftover` unchanged; `findTopicLeftovers(db)` additionally reports `{ table, column, rows }` for `technician_professionalism` held by a vertical whose effective seed list lacks it: `review_analysis.asked|topics`, `topic_proposal.topic_id`, `decision_label.question_key`, `decision_sample.questions|needs_review`, `detected_change.details`, `event.details`. Effective seed list = `CASE WHEN v.config ? 'topics' THEN v.config->'topics' ELSE generic.config->'topics' END`; key vertical = `substring(k from '^theme_(.+)__technician_professionalism$')`.

**Migration (full SQL):**
```sql
-- 15b-3b §4: generic's topic id technician_professionalism -> staff_professionalism, for generic and every vertical that
-- inherits generic's topic list (no 'topics' key in vertical.config). hvac_plumbing (own topics) keeps its id. Idempotent.
-- backfill:start
CREATE OR REPLACE FUNCTION _gt_verticals() RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(id ORDER BY id), '{}') FROM vertical WHERE id = 'generic' OR NOT (config ? 'topics')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION _gt_arr(a jsonb, old text, new text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(a) IS DISTINCT FROM 'array' OR NOT (a ? old) THEN a ELSE (
    SELECT coalesce(jsonb_agg(to_jsonb(d.x) ORDER BY d.o), '[]'::jsonb)
    FROM (SELECT m.x, min(m.o) AS o
          FROM (SELECT CASE WHEN e.v = old THEN new ELSE e.v END AS x, e.o
                FROM jsonb_array_elements_text(a) WITH ORDINALITY AS e(v, o)) m
          GROUP BY m.x) d) END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION _gt_obj(o jsonb, vs text[]) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text; k_old text; k_new text;
BEGIN
  IF o IS NULL OR jsonb_typeof(o) <> 'object' THEN RETURN o; END IF;
  FOREACH v IN ARRAY vs LOOP
    k_old := 'theme_' || v || '__technician_professionalism';
    k_new := 'theme_' || v || '__staff_professionalism';
    IF o ? k_old THEN
      o := CASE WHEN o ? k_new THEN o - k_old ELSE (o - k_old) || jsonb_build_object(k_new, o -> k_old) END;
    END IF;
  END LOOP;
  RETURN o;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION _gt_keys(a jsonb, vs text[]) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY vs LOOP
    a := _gt_arr(a, 'theme_' || v || '__technician_professionalism', 'theme_' || v || '__staff_professionalism');
  END LOOP;
  RETURN a;
END $$;
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{topics}', (
    SELECT jsonb_agg(CASE WHEN t ->> 'id' = 'technician_professionalism' THEN jsonb_set(t, '{id}', '"staff_professionalism"') ELSE t END ORDER BY o)
    FROM jsonb_array_elements(config -> 'topics') WITH ORDINALITY AS x(t, o)))
  WHERE id = 'generic' AND config -> 'topics' @> '[{"id": "technician_professionalism"}]';
--> statement-breakpoint
UPDATE review_analysis
  SET asked = _gt_arr(asked, 'technician_professionalism', 'staff_professionalism'),
      topics = _gt_arr(topics, 'technician_professionalism', 'staff_professionalism')
  WHERE vertical_id = ANY (_gt_verticals()) AND (asked ? 'technician_professionalism' OR topics ? 'technician_professionalism');
--> statement-breakpoint
DELETE FROM topic_proposal p
  WHERE p.topic_id = 'technician_professionalism' AND p.vertical_id = ANY (_gt_verticals())
    AND EXISTS (SELECT 1 FROM topic_proposal q WHERE q.vertical_id = p.vertical_id AND q.topic_id = 'staff_professionalism');
--> statement-breakpoint
UPDATE topic_proposal SET topic_id = 'staff_professionalism'
  WHERE topic_id = 'technician_professionalism' AND vertical_id = ANY (_gt_verticals());
--> statement-breakpoint
DELETE FROM decision_label l USING unnest(_gt_verticals()) AS v(id)
  WHERE l.question_key = 'theme_' || v.id || '__technician_professionalism'
    AND EXISTS (SELECT 1 FROM decision_label t WHERE t.sample_id = l.sample_id AND t.question_key = 'theme_' || v.id || '__staff_professionalism');
--> statement-breakpoint
UPDATE decision_label l SET question_key = 'theme_' || v.id || '__staff_professionalism'
  FROM unnest(_gt_verticals()) AS v(id)
  WHERE l.question_key = 'theme_' || v.id || '__technician_professionalism';
--> statement-breakpoint
UPDATE decision_sample SET
    questions = _gt_obj(questions, _gt_verticals()),
    primary_answers = CASE WHEN jsonb_typeof(primary_answers -> 'answers') = 'object'
      THEN jsonb_set(primary_answers, '{answers}', _gt_obj(primary_answers -> 'answers', _gt_verticals())) ELSE primary_answers END,
    fallback_answers = CASE WHEN jsonb_typeof(fallback_answers -> 'answers') = 'object'
      THEN jsonb_set(fallback_answers, '{answers}', _gt_obj(fallback_answers -> 'answers', _gt_verticals())) ELSE fallback_answers END,
    final_answers = _gt_obj(final_answers, _gt_verticals()),
    needs_review = _gt_keys(needs_review, _gt_verticals())
  WHERE strpos(questions::text || coalesce(primary_answers::text, '') || coalesce(fallback_answers::text, '')
               || final_answers::text || needs_review::text, '__technician_professionalism') > 0;
--> statement-breakpoint
UPDATE decision_review SET keys = _gt_keys(keys, _gt_verticals()), answers = _gt_obj(answers, _gt_verticals()),
    resolution = _gt_obj(resolution, _gt_verticals())
  WHERE strpos(keys::text || answers::text || coalesce(resolution::text, ''), '__technician_professionalism') > 0;
--> statement-breakpoint
UPDATE detected_change SET
    details = CASE WHEN details ->> 'topic' = 'technician_professionalism'
      THEN jsonb_set(details, '{topic}', '"staff_professionalism"') ELSE details END,
    block_key = CASE WHEN block_key = 'reviews:complaints:' || (details ->> 'verticalId') || ':technician_professionalism'
      THEN 'reviews:complaints:' || (details ->> 'verticalId') || ':staff_professionalism' ELSE block_key END
  WHERE details ->> 'verticalId' = ANY (_gt_verticals())
    AND (details ->> 'topic' = 'technician_professionalism' OR block_key LIKE '%:technician\_professionalism');
--> statement-breakpoint
UPDATE "event" SET details = jsonb_set(details, '{topic}', '"staff_professionalism"')
  WHERE details ->> 'topic' = 'technician_professionalism' AND details ->> 'verticalId' = ANY (_gt_verticals());
--> statement-breakpoint
UPDATE model_batch b SET items = (
    SELECT jsonb_object_agg(e.k, CASE WHEN e.k = ANY (_gt_verticals())
      THEN replace(e.v::text, '"technician_professionalism"', '"staff_professionalism"')::jsonb ELSE e.v END)
    FROM jsonb_each(b.items) AS e(k, v))
  WHERE jsonb_typeof(b.items) = 'object' AND strpos(b.items::text, '"technician_professionalism"') > 0;
--> statement-breakpoint
UPDATE vertical SET draft_evidence = replace(draft_evidence::text, '"technician_professionalism"', '"staff_professionalism"')::jsonb
  WHERE id = ANY (_gt_verticals()) AND strpos(coalesce(draft_evidence::text, ''), '"technician_professionalism"') > 0;
--> statement-breakpoint
UPDATE vertical_draft SET draft = replace(draft::text, '"technician_professionalism"', '"staff_professionalism"')::jsonb
  WHERE strpos(draft::text, '"technician_professionalism"') > 0;
--> statement-breakpoint
DROP FUNCTION _gt_keys(jsonb, text[]);
--> statement-breakpoint
DROP FUNCTION _gt_obj(jsonb, text[]);
--> statement-breakpoint
DROP FUNCTION _gt_arr(jsonb, text, text);
--> statement-breakpoint
DROP FUNCTION _gt_verticals();
```
**Pre-flight (cs_dev, read-only):** the old id is stored only in `decision_label.question_key` (10), `vertical.config` (generic + hvac), `review_analysis.asked|topics` (657/635), `decision_sample.{questions,primary,fallback,final}_answers|needs_review` (1,079) — all `hvac_plumbing` rows except `generic`'s config; on `cs_dev` `generic` has its own `topics` key, so the inheriting set is `{generic}` and the migration changes only `generic`'s config there (0 collisions, 0 rows elsewhere). No new stored location beyond the SQL above (`detected_change`, `event`, `model_batch`, `topic_proposal`, `decision_review`, `vertical_draft`: 0 hits). User triggers on those tables: none (only `capture_immutable`, `evidence_immutable`). Tests, not cs_dev, therefore carry the inheriting-vertical coverage.
**R2 (controller ruling):** every nullable column in a `WHERE` must be `coalesce(col::text,'')` (already so for `decision_sample.primary_answers|fallback_answers`, `decision_review.resolution`; schema-nullable: those three only — `decision_sample.final_answers|needs_review|questions` and `decision_review.keys|answers` are NOT NULL). The `decision_sample` and `decision_review` tests each add a row with NULL `primary_answers`/`fallback_answers`/`resolution` and assert it neither errors nor matches wrongly.
**Behaviour:** `pnpm --filter @cs/db generate` must still say "No schema changes" (data-only migration). `generic.yaml` keeps `version: 1` and name "Staff professionalism" (P4). `packs.test.ts` and the seed test still pass (no "theme" text). Free prose (`decision_sample.state`, question instructions) and `llm_call` are untouched.
**Follow pattern:** `packages/db/src/topic-rename.test.ts` (read the `.sql`, split on `--> statement-breakpoint`, run from `-- backfill:start` as `dbs.owner`; seed legacy rows with `session_replication_role = replica`; `DROP FUNCTION IF EXISTS` the four helpers in `beforeEach`). The test saves `generic`'s config in `beforeAll`, sets the old id back before each case, and restores it in `afterAll`; it inserts an inheriting vertical `distillery` (`status 'unreviewed'`, `config '{}'`) and an own-topics vertical.
**Tests (TDD) — `generic-topic-id.test.ts`:**
- `renames generic's topic and leaves hvac_plumbing's`: generic config topic id is `staff_professionalism`, order and name kept; hvac config still has `technician_professionalism`.
- `rewrites review_analysis for generic and inheriting verticals only`: rows for `generic`, `distillery` renamed; `hvac_plumbing` and own-topics rows unchanged; `["technician_professionalism","staff_professionalism"]` → `["staff_professionalism"]`.
- `renames proposals; on collision keeps the existing row`.
- `renames decision labels; on collision deletes the old label and keeps the existing one` (no PK error).
- `renames decision_sample object keys in questions, primary/fallback answers, final answers and needs_review`; a `theme_hvac_plumbing__technician_professionalism` key is untouched; when both keys exist the existing one is kept.
- `renames decision_review keys, answers and resolution`.
- `renames complaint spikes: detected_change block_key + details.topic, event details.topic` (distillery yes, hvac no).
- `renames model_batch contexts of inheriting verticals only`.
- `is idempotent` (second run: identical rows) and `drops its helper functions`.
- `topic-leftovers.test.ts`: `[]` on the seeded DB (hvac rows with the old id are not leftovers); a `distillery` `review_analysis` row with `technician_professionalism` is reported as `review_analysis.asked`; a `decision_label` key `theme_distillery__technician_professionalism` is reported.
**Done when:** `pnpm --filter @cs/db exec vitest run generic-topic-id topic-leftovers topic-rename`, `pnpm --filter @cs/verticals exec vitest run`, `pnpm --filter @cs/db generate` = no changes; typecheck; commit `feat(db): generic topic id staff_professionalism`.

### Task 3: Batch discovery spend tagged per vertical
**Goal:** Each collected batch result is ledgered with its own `verticalId` (spec §3).
**Files:** modify `packages/ai/src/ai.ts` (+ `ai.test.ts`), `packages/engine/src/model-ops/batches.ts`, `packages/engine/test/fake-ai.ts`, `packages/engine/src/reviews/discovery.test.ts`; check fakes compile in `packages/ask/src/testing.ts`, `packages/collectors/src/discovery/discover.test.ts`.
**Interfaces:**
```ts
// Ai (packages/ai/src/ai.ts)
collectBatch(task: string, batchId: string, scope: CallScope, scopeFor?: (customId: string) => Partial<CallScope>):
  Promise<{ status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] }>;
// each ledger row: { ...scope, ...scopeFor?.(r.customId), task, provider, model, ... }
// FakeAi.calls gains: collects: { task: string; batchId: string; scope: CallScope; scopeFor?: (id: string) => Partial<CallScope> }[]
```
**Behaviour:** `collectModelBatches` passes `b.purpose === THEME_BATCH_PURPOSE ? (id) => ({ verticalId: id }) : undefined`. Sync multi-vertical calls unchanged. Old ledger rows untouched. Also rename review-sense test names in `discovery.test.ts`: helper `unthemed` → `unmatched`, test id `other_theme` → `other_topic`, "unthemed reviews" → "unmatched reviews" (C7 `THEME_BATCH_*`, `theme_proposal` stay).
**Tests (TDD):**
- `ai.test.ts` `collectBatch tags each result row with scopeFor(customId)`: results `hvac_plumbing` ok + `dental` failed → two records with `verticalId` `hvac_plumbing` / `dental`, `agencyId`/`clientId` from `scope`; without `scopeFor` both rows equal `scope`.
- `discovery.test.ts` `applying a discovery batch passes a per-vertical scope`: `ai.calls.collects[0].scopeFor!('dental')` → `{ verticalId: 'dental' }`; a non-discovery purpose row passes `undefined`.
**Done when:** `pnpm --filter @cs/ai exec vitest run ai`, `npx vitest run discovery` (in `packages/engine`); typecheck; commit `feat(ai): ledger batch results per vertical`.

### Task 4: Tools, MCP, Ask, demo + E3 field rename end to end
**Goal:** Externally visible tool names/fields say topic; web readers consume the new fields (spec §2, E3).
**Files:** modify `packages/tools/src/tools/{reputation,schemas,workspace-fixtures}.ts` (+ `reputation.test.ts`, `paged-lists.test.ts`, `channels.test.ts`, `topics.test.ts`), `packages/mcp/src/{server,integration}.test.ts`, `packages/ask/src/labels.ts`, `packages/demo/src/coverage.ts:231,270` + `packages/demo/README.md:53,62`, `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md:98`; web: `apps/web/src/app/(app)/c/[clientId]/reviews/page.tsx` (tool name, `benchmark.topics`, input `topicId` — URL param stays until Task 5), `competitors/[competitorId]/{page,sections}.tsx` (+ `page.test.tsx`, `sections.test.tsx`), `reviews/review-item.tsx` (+ test), `components/charts/theme-heatmap.tsx` (fields only; file rename in Task 5) (+ test), fakes in `c/[clientId]/help-client-a.test.tsx`, `help-pilot.test.tsx`.
**Interfaces:**
```ts
export const getTopicBenchmark = defineTool({ name: 'get_topic_benchmark', access: 'read', permission: 'read',
  channels: ['web', 'mcp', 'ask'], feature: 'dashboard', input: z.object({ clientId: uuid }), output: TopicBenchmarkView, … });
export const TopicBenchmarkView = z.object({ windowDays: z.number().int(), from: iso, to: iso,
  topics: z.array(z.object({ id: z.string(), name: z.string() })),
  businesses: z.array(z.object({ competitorId: uuid, name: z.string(), self: z.boolean(), reviews: z.number().int(),
    avgRating: z.number().nullable(), prevReviews: z.number().int(), prevAvgRating: z.number().nullable(),
    topics: z.array(z.object({ topicId: z.string(), mentions: z.number().int(), asked: z.number().int(), share: z.number().nullable(),
      sentiment: z.number().nullable(), shareDelta: z.number().nullable(), sentimentDelta: z.number().nullable() })) })) });
// ReviewView: themes → topics: z.array(z.object({ id: z.string(), name: z.string() }))
// search_reviews input: topicId: z.string().regex(/^[a-z0-9_]{1,64}$/).optional(); unknown → ToolError('invalid_input', 'Unknown topic')
// reputationTools = [getTopicBenchmark, getRatingTrend, searchReviews]
// workspace-fixtures seedReview: analysis?: { asked: string[]; topics: string[]; sentiment: number | null }
// ask/labels.ts: get_topic_benchmark: 'Comparing review topics…'
```
**Behaviour:** delete `toLegacyThemeFields` and both `// 15b-3b: delete` comments; map engine `TopicShare` rows explicitly to the seven keys. Descriptions/error = Task 1 text. No alias for old names (D3). Comment at `reputation.ts:143` says `get_topic_benchmark`.
**Tests (TDD):**
- `reputation.test.ts` (replace the "legacy MCP shape" block) `get_topic_benchmark and search_reviews expose exactly the topic keys`: top keys `businesses, from, to, topics, windowDays`; business keys end `topics`; share keys include `topicId`, no `themeId`; review item key `topics`; `search_reviews {topicId:'nope'}` → `invalid_input` "Unknown topic"; `{topicId:'response_time'}` filters.
- `channels.test.ts` / `topics.test.ts`: registry has `get_topic_benchmark`, not `get_theme_benchmark`.
- MCP `server.test.ts`/`integration.test.ts`: exact `tools/list` names with `get_topic_benchmark`; `search_reviews` input JSON schema has `topicId` and no `themeId`; `tools/call get_theme_benchmark` → unknown-tool error.
- web `sections.test.tsx`, `review-item.test.tsx`, heatmap test, `page.test.tsx` fixtures use `topics`/`topicId`.
- demo `coverage.test.ts` passes (page tool names = coverage entries).
**Done when:** `pnpm --filter @cs/tools exec vitest run reputation channels topics paged-lists`, `pnpm --filter @cs/mcp exec vitest run`, `pnpm --filter @cs/ask exec vitest run labels`, `npx vitest run coverage` (in `packages/demo`), `pnpm --filter @cs/web exec vitest run sections review-item heatmap competitors help-client-a help-pilot`; typecheck; commit `feat(tools): get_topic_benchmark and topic fields (no aliases)`.

### Task 5: Web route, component names, Reviews `?topic=`, E2E
**Goal:** `/platform/topics`, `Topic*` names, `TopicHeatmap`, `?topic=`; `/platform/themes` 404 (spec §2, 15b-3 §4).
**Files:** git mv `apps/web/src/app/(platform)/platform/themes/` → `topics/` with `theme-queue.tsx`(+test) → `topic-queue.tsx`(+test); modify its `page.tsx`, `actions.ts`; git mv `components/charts/theme-heatmap.tsx`(+test) → `topic-heatmap.tsx`(+test); modify `c/[clientId]/reviews/page.tsx`, `components/shell/nav-items.ts:123` (+ `nav-items.test.ts`), `(platform)/platform/help-platform.test.tsx` (import path only), `apps/web/scripts/e2e-affected-rules.ts` (~170 why "review/topic queues", ~195 `charts/topic-heatmap\.tsx$` why "topic heatmap", ~217 `kw('review|reputation|topics|complaints', …, 'reviews/topics')`), `apps/web/e2e/{workflow,data-views}.spec.ts`, `apps/web/src/components/charts/line-chart.test.tsx:182` (file list names `theme-heatmap.tsx`; found in Task 0 conflict-scan), `packages/demo/src/coverage.ts:366,393` + `README.md:97`, `help/copy/client.ts:87` (source comment path).
**Interfaces:** `export default async function TopicProposalsPage()`; `export function TopicQueue({ pending, decided, action })`; `export async function decideTopicAction(_p: FormResult, fd: FormData): Promise<FormResult>` → `runTool(ctx, 'decide_topic_proposal', …)`, `revalidatePath('/platform/topics')`; `export function TopicHeatmap({ title, benchmark }: { title: string; benchmark: Pick<TopicBenchmarkView, 'topics' | 'businesses'> })` (`sentimentFill` export unchanged); Reviews: `const TOPIC = /^[a-z0-9_]{1,64}$/`, `topicParam = one(sp.topic)`, `<select name="topic">`, pager link param `topic`; nav `add('/platform/topics', 'Topic proposals', 'topics', { count: counts.topics })`.
**Behaviour:** page keeps `HELP_KEY`/`COPY` on the old key until Task 6 (help tests stay green). Old `?theme=` is ignored (no redirect). Local variable names in the heatmap/Reviews page say topic (`th` → `tp` etc.). Keep the hidden `WriteGuard` usage as is.
**Tests (TDD):**
- `topic-queue.test.tsx`: `TopicQueue` renders pending/decided as before.
- `nav-items.test.ts`: platform hrefs contain `/platform/topics`, not `/platform/themes`.
- heatmap test: `TopicHeatmap` cases unchanged in substance.
- E2E `workflow.spec.ts` (`@platform @reviews`): operator approves at `/platform/topics`; `page.goto('/platform/themes')` → response status 404 and heading "Page not found".
- E2E `data-views.spec.ts` reviews test: `/c/<id>/reviews?topic=upsell_pressure` shows "The technician was late and pushy." and not "Fast and friendly service."; the topic select has value `upsell_pressure`; `?theme=upsell_pressure` shows both reviews.
- `scripts/e2e-affected.test.ts` passes (no dead rule).
**Done when:** `pnpm --filter @cs/web exec vitest run topic-queue nav-items heatmap help-platform e2e-affected`, `npx vitest run coverage` (demo), `pnpm --filter @cs/web e2e:affected`; typecheck + lint; commit `feat(web): /platform/topics, TopicHeatmap, ?topic=`.

### Task 6: Help key, tip ids, guide, copy, terminology guard
**Goal:** `page:platform.topics` with renamed tips and the signed-off copy; the guard no longer allows theme routes/keys (spec §2, §6).
**Files:** git mv `docs/help/pages/platform.themes.operator.md` → `platform.topics.operator.md`; modify `apps/web/src/help/copy/platform.ts` (key, tip ids, header comment lines 8–9, `source:` comments → `reaskReview`), `(platform)/platform/topics/{page,topic-queue}.tsx` (`HELP_KEY = 'page:platform.topics'`, `PAGE_COPY['platform.topics']`, tips `platform.topics.source|decide|decided`, empty `platform.topics.queue`), `help-platform.test.tsx`, `packages/tools/src/kb/help-content.test.ts` (`PLATFORM_KEYS` `topics`; `want.topics: ['topic', '20', '90 days', 'fifth', '30 days', '180 days']`; drop the line-42 note), `apps/web/src/terminology.test.ts`.
**Interfaces:** `PAGE_COPY['platform.topics']: PageCopy` with tips `source | decide | decided | queue`; guide front matter `help_key: page:platform.topics`, `audience: operator`, `title: Topic proposals`.
**Behaviour:** apply Task 1's proposed text (or the owner's amended text if the sign-off doc says so). `kb:seed`'s stale sweep (`tools/src/kb/seed.ts:~180`) removes the old `page:platform.themes` row — no code. `terminology.test.ts`: remove `/platform/themes`, `?theme=`, `page:platform.themes` from the allow-list doc and narrow `IDENTIFIER_LIKE` so a string containing `platform/themes`, `platform.themes` or `?theme=` is a hit; remove the `help_key:` front-matter exemption (no key contains theme now); empty `MODEL_PROMPT_FILES` if `vertical-draft.ts` has no "theme" (3a renamed it; its own test asserts that).
**Tests (TDD):**
- `help-platform.test.tsx`: `show('platform.topics')` renders without "theme"; `tipText('platform.topics','decide')` matches `/180 days/` (was `/from now on/`); `source` and `decided` as before; **every tip/empty id used by `/platform/topics` exists in `PAGE_COPY['platform.topics']`**.
- `help-content.test.ts`: the operator guide `page:platform.topics` exists, carries the `want` strings, and `page:platform.themes` has no guide.
- `terminology.test.ts`: a fixture string `'/platform/themes'` is now reported (unit-test the predicate); the whole-tree checks pass.
**Done when:** `pnpm --filter @cs/web exec vitest run help-platform terminology`, `pnpm --filter @cs/tools exec vitest run help-content seed`; typecheck; commit `feat(help): page:platform.topics + re-ask copy`.

### Task 7: Re-ask engine (`checked_at`, sweep gap list, `reaskReview`, drain)
**Goal:** Older reviews get only the missing questions when a topic is approved, a vertical's seed topics change, or a competitor gains a vertical (spec §5, E6).
**Files:** create `packages/db/migrations/<N+1>_review_checked_at.sql` via `pnpm --filter @cs/db generate --name=review_checked_at` (must emit exactly `ALTER TABLE "review_analysis" ADD COLUMN "checked_at" timestamp with time zone;`); modify `packages/db/src/schema/insights.ts` (`checkedAt: ts('checked_at')`, doc: "last re-ask check; null = as of analyzed_at"); `packages/engine/src/reviews/topics.ts` (+ `topics.test.ts`), `packages/engine/src/sweep.ts` (+ `sweep.test.ts`), `packages/engine/src/drain.ts` (+ tests asserting `DrainResult`/`EngineWork` literals), `apps/worker/src/cli/engine-once.ts` (print `reasked`); create `packages/engine/src/reviews/reask.test.ts`.
**Interfaces:**
```ts
// sweep.ts
export const REASK_DAILY_MAX = 2000;
export interface EngineWork { diff: string[]; tag: string[]; score: string[]; rankDiff: string[]; reviews: string[]; prices: string[]; reask: string[] }
// topics.ts
export interface ReaskTopics { seed: TopicDef[]; seedEditedAt: Date | null; approved: (TopicDef & { decidedAt: Date })[] }
export async function reaskTopics(db: Db, verticalId: string): Promise<ReaskTopics>;   // fresh from DB (P5)
export interface ReaskGap { kind: 'a' | 'b'; verticalId: string; topics: TopicDef[] }   // a = row exists, b = no row for this vertical
// findEngineWork opts gain `reaskDailyMax?: number` (default REASK_DAILY_MAX; tests pass a small cap)
export function reaskGap(verticalId: string, row: { asked: string[]; analyzedAt: Date; checkedAt: Date | null } | null, t: ReaskTopics): ReaskGap | null;
export function buildReaskQuestions(gaps: ReaskGap[], packs: Map<string, VerticalPack>): Record<string, DecisionQuestion>;
export interface ReaskOutcome { ran: boolean; questions: number; rows: number }
export async function reaskReview(deps: { db: Db; ai: Ai; packs: PackLoader; now?: () => Date }, reviewId: string): Promise<ReaskOutcome>;
// drain.ts: DrainResult gains `reasked: number`
```
**Sweep SQL (full; runs only when `reviews` is empty; `room = min(opts.limit, (opts.reaskDailyMax ?? REASK_DAILY_MAX) − used)`, skip when `room <= 0`):**
```ts
const [{ n: used }] = (await db.execute(sql`
  SELECT count(DISTINCT review_id)::int AS n FROM review_analysis
  WHERE checked_at >= date_trunc('day', ${now}::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`)) as unknown as { n: number }[];
const reask = await db.execute(sql`
  WITH cv AS (
    SELECT cc.competitor_id, cl.vertical_id FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
    UNION
    SELECT cl.self_competitor_id, cl.vertical_id FROM client cl WHERE cl.self_competitor_id IS NOT NULL
  ), base AS (
    SELECT r.id, r.competitor_id, r.posted_at FROM review r
    WHERE r.text IS NOT NULL AND length(regexp_replace(r.text, '^\\s+|\\s+$', '', 'g')) >= ${MIN_REVIEW_CHARS}::int
      AND r.posted_at >= ${now}::timestamptz - make_interval(days => ${REVIEW_ANALYSIS_DAYS}::int) ${only('r.competitor_id')}
      AND EXISTS (SELECT 1 FROM stage_run s WHERE s.stage = ${REVIEW_STAGE} AND s.stage_version = ${REVIEW_VERSION}::int
                  AND s.subject_id = md5(r.id::text || '|' || r.text)::uuid AND s.status = 'done')
  ), gap_a AS (
    SELECT b.id, b.posted_at
    FROM base b
    JOIN review_analysis ra ON ra.review_id = b.id
    JOIN cv ON cv.competitor_id = b.competitor_id AND cv.vertical_id = ra.vertical_id
    JOIN vertical v ON v.id = ra.vertical_id
    LEFT JOIN vertical g ON g.id = 'generic'
    CROSS JOIN LATERAL (SELECT coalesce(ra.checked_at, ra.analyzed_at) AS mark,
        CASE WHEN v.config ? 'topics' THEN v.updated_at ELSE greatest(v.updated_at, g.updated_at) END AS edited,
        CASE WHEN v.config ? 'topics' THEN v.config -> 'topics' ELSE g.config -> 'topics' END AS seed) x
    WHERE EXISTS (SELECT 1 FROM topic_proposal tp
                  WHERE tp.vertical_id = ra.vertical_id AND tp.status = 'approved'
                    AND tp.decided_at > x.mark AND NOT (ra.asked ? tp.topic_id))
       OR (x.edited > x.mark
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.seed) = 'array' THEN x.seed ELSE '[]'::jsonb END) t
                       WHERE NOT (ra.asked ? (t ->> 'id'))))
  ), gap_b AS (
    SELECT b.id, b.posted_at FROM base b JOIN cv ON cv.competitor_id = b.competitor_id
    WHERE NOT EXISTS (SELECT 1 FROM review_analysis ra WHERE ra.review_id = b.id AND ra.vertical_id = cv.vertical_id)
  )
  SELECT id FROM (SELECT id, posted_at FROM gap_a UNION SELECT id, posted_at FROM gap_b) gaps
  ORDER BY posted_at DESC, id LIMIT ${room}`);
```
**Behaviour (`reaskReview`):**
- `startedAt = deps.now?.() ?? new Date()` first (P6). Load review + competitor name as `analyzeReview`; return `{ ran: false, … }` if missing, text < `MIN_REVIEW_CHARS`, posted > 180 days ago, or no `done` `stage_run` for `reviewSubjectId(id, text)`.
- `verticalIds = competitorVerticals(db, competitorId)`; rows = its `review_analysis` rows. Per vertical: `reaskGap(v, row ?? null, await reaskTopics(db, v))`. `reaskTopics`: seed from `vertical.config.topics` or else `generic.config.topics`, `seedEditedAt` = own `updated_at` or `greatest(own, generic)` (mirror the SQL); approved rows ordered by `decided_at`. Combined list = seed + approved not in seed. **(a)** (row exists): topics not in `row.asked` that are approved with `decidedAt > mark`, or seed with `seedEditedAt > mark`. **(b)** (no row): all combined topics.
- No gap anywhere → one UPDATE `checked_at = startedAt` on the current verticals' rows; `{ ran: true, questions: 0 }`.
- Else questions: (a) `themeKey(v, id)` only; (b) every topic key + `otherKey(v)`; `sentiment` only if a (b) gap exists (text exactly as `buildReviewQuestions`). `state` exactly as `analyzeReview` (`business_type` = all verticals' pack names joined `' / '`, `redactForModel`, `MAX_REVIEW_CHARS`). One `deps.ai.decide('review_decisions', state, questions, singleVerticalScope(gapVerticalIds))`; a throw propagates, nothing written (P9).
- One transaction: re-read the review's `text`; if `sha256Hex(text)` ≠ the row's `textSha` (or the review changed), write nothing for that row. (a) rows `SELECT … FOR UPDATE`: `asked` += newly confident gap ids, `topics` += gap yes-answers (dedupe, order kept), `confidence = min(old, min gap confidence)` rounded to 2 dp, `needsReview = old || any gap key in needsReview`, `checkedAt = startedAt`; **`analyzedAt`, `sentiment`, `other`, `analysisVersion` untouched**. (b): `resolveReviewAnalysis(result, bVerticals, base)` rows inserted with `checkedAt = startedAt`, `ON CONFLICT DO NOTHING`. Other current-vertical rows without a gap: `checkedAt = startedAt`.
- `analyzeReview`'s upsert `set` gains `checkedAt: null` (text edit resets the marker).
- `drainEngine`: loop exit includes `work.reask.length`; `for (const id of work.reask)` → `reaskReview`, `r.reasked++` when `questions > 0`.
**R1 (controller ruling):** adding `reask` to `EngineWork` breaks every literal: also add `reask: []` to each `EngineWork` literal/fake in worker tests and fakes (`apps/worker/src/jobs/engine.test.ts`, `apps/worker/src/cli/*` fakes, any `findEngineWork` stub) in this task so `npx turbo run typecheck` is green before Task 8 (Task 8 then adds the `reask: [U(7)]` case).
**Pre-flight volume (cs_dev, 2026-10-23, `ra.analyzed_at` for the absent `checked_at`):** 1,635 reviews in the 180-day done-set; candidates 1,375 (all gap_a; gap_b 0) — a one-off deploy wave: `vertical.updated_at` (2026-10-20, bumped by 0084) is later than every `analyzed_at`, so every row missing a below-τ seed topic is re-asked once. Drain ~0.7 day at 2,000/day; later sweeps select nothing. Accepted (cheap; by design of the vertical-edit trigger).
**Follow pattern:** `topics.test.ts` / `discovery.test.ts` (DB-backed, `createFakeAi({ decide: reviewResult(…) })`, `seed.ts` fixtures); SQL style of `sweep.ts`.
**Tests (TDD) — `reask.test.ts`** (each: analyse via `analyzeReview`, then act, then `findEngineWork` + `reaskReview`):
- `approving a topic re-asks older analysed reviews once, with only that question` (decide called with exactly `theme_hvac_plumbing__<new>`; asked/topics grow; no `sentiment` key).
- `a second sweep selects nothing`; `a below-τ answer is not retried` (needsReview for the key → not in asked, marker set, next sweep empty).
- `topics left below τ earlier are not re-asked on deploy` (checked_at null, proposal decided before analysis → nothing).
- `a vertical edit re-asks its missing seed topics once`; `an edit with every seed topic already asked selects nothing`; `a generic edit re-asks an inheriting vertical, not hvac_plumbing`.
- `a competitor gaining a vertical gets full rows for that vertical only` (sentiment + other asked; other verticals' rows unchanged except `checked_at`).
- `(a) keeps analyzed_at, sentiment, other, analysis_version`; `a text edit between read and write leaves the row alone`.
- `reviews older than 180 days are skipped`; `re-ask waits while new reviews are pending`; `the daily cap is honoured` (`reaskDailyMax: 2`, two rows with `checked_at` today → `reask` empty; one → at most one candidate; yesterday's rows don't count); `a throwing decide leaves checked_at null and the review is offered again`.
- `sweep candidates equal reviews with a non-empty JS gap` (fixture matrix of Review focus 1).
- `topics.test.ts`: `an edited review's upsert clears checked_at`. Unit: `reaskGap` cases (a)/(b)/none; `buildReaskQuestions` omits sentiment without (b).
**Done when:** `npx vitest run reask topics sweep drain discovery` (in `packages/engine`), `pnpm --filter @cs/db exec vitest run insights`, `pnpm --filter @cs/db generate` = no changes after the generated migration; typecheck; commit `feat(engine): re-ask older reviews for new topics and verticals`.

### Task 8: Worker `engine-reask` job
**Goal:** The worker runs re-ask like the other engine stages (spec §5 Job).
**Files:** modify `apps/worker/src/jobs/engine.ts` (+ `engine.test.ts`), `apps/worker/src/deps.ts` (+ deps test if it lists members), `apps/worker/src/main.ts`.
**Interfaces:** `WorkerDeps.reaskReview(reviewId: string): Promise<{ ran: boolean; questions: number }>` (→ `@cs/engine` `reaskReview({ db: getDb(), ai: await getAi(), packs }, id)`); `createEngineJobs(deps, queue)` queue gains `enqueueReask(reviewId: string): Promise<void>`; job `defineJob({ name: 'engine-reask', schema: z.object({ reviewId: z.uuid() }), queue: ENGINE_STAGE_QUEUE, handler })`; returned object gains `reask`; `main.ts`: `enqueueReask: (reviewId) => enqueue(boss, engine.reask, { reviewId }, { singletonKey: \`reask:${reviewId}\` })` and `engine.reask` in the registered list next to `engine.review`. If phase-7b1 merged: `usesAi: true`.
**Behaviour:** sweep enqueues `w.reask` after `w.reviews`; the summary log line adds `reask N` and counts it in the "> 0" check; handler logs `[engine-reask] <id> → <n> question(s)` via `workerLog.info` only when `questions > 0`. No console.*. `/platform/health` lists the queue automatically (no code).
**Tests (TDD):** `engine.test.ts`: `sweeps … enqueues all found work` includes `reask: [U(7)]` → `enqueueReask` called with `U(7)`; `engine-reask calls deps.reaskReview` and uses `ENGINE_STAGE_QUEUE`; queue helper adds `enqueueReask`.
**Done when:** `pnpm --filter @cs/worker exec vitest run engine`; typecheck + lint; commit `feat(worker): engine-reask job`.

### Task 9: Done grep + docs
**Goal:** Prove no review-sense `theme` is left; record operator steps (spec §2 "Done when").
**Files:** modify `docs/work/phase-15b3b.md` (Status/Next, Interfaces, Decisions P1–P11, Owner verification, new backlog), `docs/OPS.md` (line 9: drop the stale "Latest migration `0037`" clause → "run `pnpm db:migrate` if it is behind"; add the 15b-3b owner steps under the 0084 note), prose in `packages/engine/CLAUDE.md` ("per-theme cooldown" → "per-topic"; add one gotcha: re-ask marker/caps), `packages/ai/CLAUDE.md` ("theme discovery" → "topic discovery"), `packages/collectors/src/evidence/model-privacy.ts:7` comment ("themes" → "topics"). Shared docs (STATE, BACKLOG, ARCHITECTURE, roadmap) change only at merge.
**Behaviour — the done check (must print nothing):**
```bash
git grep -n -i -E "theme" -- packages apps scripts docs/help \
  ':!packages/db/migrations' ':!packages/db/src/topic-rename.test.ts' ':!packages/db/src/topic-leftovers.ts' \
  ':!packages/db/src/topic-leftovers.test.ts' ':!packages/ui' ':!apps/web/src/server/theme.ts' \
  ':!apps/web/src/components/shell/shell-theme.tsx' ':!apps/web/src/app/layout.test.tsx' \
  ':!apps/web/src/components/shell/app-shell.test.tsx' ':!apps/web/src/terminology.test.ts' \
  | grep -v -E "kept: model-ops key|themeKey|THEME_BATCH_(TASK|PURPOSE)|theme_discovery|review_themes|'theme_proposal'|startsWith\('theme_'\)|return 'theme'|'theme', 'other'|theme_<v>|theme_\\$\{|themeVars|themeForViewer|ShellTheme|data-shell-theme|platformTheme|@/server/theme|\btheme\.(branding|assistantName)|\[link, theme|light theme|default theme|agency's theme|themes it|themes \`<html>\`|themed client list|theme=x|\{\{theme\}\}|not\.to(Match|Contain)|toBeUndefined|never \"Theme|\"theme\" in|says theme|or a theme|\\\\bthemes\?"
```
Each surviving line is either renamed or, if it is a genuine C7/UI/absence-assertion line, added to the exclusion with a one-line reason in the work file. Also: `git grep -n -E "get_theme_benchmark|toLegacyThemeFields|getThemeBenchmark|themeId|ThemeHeatmap|ThemeQueue|decideThemeAction|platform[./]themes|Unknown theme" -- packages apps docs/help` prints only `ask`-history-free test assertions of absence.
**Owner verification (work file):** after merge — `pnpm --filter @cs/db migrate` on `cs_dev` (worker stopped; OPS order), `pnpm --filter @cs/db topic-leftovers` prints nothing, `pnpm kb:seed`; `/platform/topics` works and `/platform/themes` 404s; Reviews `?topic=`; MCP `tools/list` shows `get_topic_benchmark`; watch `[engine-reask]` log lines and `llm_call` `review_decisions` rows with `vertical_id` and no `client_id`; check the daily count `SELECT count(DISTINCT review_id) FROM review_analysis WHERE checked_at >= date_trunc('day', now())`.
**Done when:** both greps clean; `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main` green; `git ls-files --eol | grep crlf` empty; commit `docs(phase-15b3b): done grep, OPS steps, work file`.

---

## Self-review
- **Spec coverage:** §1 E1–E6 → whole plan, E3 Task 4, E4 Tasks 2/3/7, E5 Tasks 1/6, E6 Tasks 7/8; §2 tools/callers Task 4, web Task 5, terminology Task 6, done grep Task 9; §3 Task 3; §4 Task 2 (+ pre-flight counts, leftover check); §5 Tasks 7/8 (all eleven spec tests listed in Task 7); §6 Tasks 1/6; §7 non-goals respected (no aliases, no prose rewrite, τ untouched, 180-day bound, no UI); §8 Dependencies.
- **Names used across tasks:** `get_topic_benchmark`, `getTopicBenchmark`, `topicId`, `topics`, `TopicHeatmap`, `TopicQueue`, `decideTopicAction`, `TopicProposalsPage`, `page:platform.topics`, `REASK_DAILY_MAX`, `EngineWork.reask`, `reaskReview`/`ReaskOutcome`, `DrainResult.reasked`, `engine-reask`, `enqueueReask`, `checkedAt`/`checked_at`.
