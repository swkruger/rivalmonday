# Phase 15b-3 — review "theme" → "topic" rename (design)

**Builds on:** [15b-2 spec C7](2026-10-20-phase-15b2-help-content-design.md) (what renames and what stays), C3 (users already see "topic"). Core spec §6.4, §6.5, §8.2, §8.5. Footprint and in-flight overlap: [work file brief](../../work/phase-15b3.md).

## Why
Users have read "topic" since 15b-2. Code, DB, tools, packs and URLs still say `theme`, which means maintainers and the help/copy layer keep translating between two names. 15b-3 makes "topic" the only name, except where C7 keeps it on purpose. "Done" means a grep for the review sense of `theme` finds only the documented exceptions (§3) and history (applied migrations, archived docs).

## 1. Decisions (owner, 2026-10-21)
| # | Decision |
|---|---|
| D1 | **Two sub-phases, two merges.** **15b-3a data & engine:** migration, Drizzle schema, engine, verticals/packs, catalogue seed, AI output keys, worker, demo, and every tool *internal* plus web-only tool fields. **15b-3b surfaces:** MCP/Ask tool names and fields, web routes, query params, help page key and guide file, web component/file names, tool descriptions and error strings. 3a ships first, so code and DB never disagree. |
| D2 | **Full DB rename per C7** in one hand-written migration (§2.1). |
| D3 | **No aliases (supersedes C7's "deprecated aliases" and "redirects"):** there are no live users. Old tool names, `themeId`, `themes` outputs, `/platform/themes` and `?theme=` are dropped outright: no aliases, no redirects. |
| D4 | **Stored data backfilled once** in the 3a migration. Readers read only the new names, with no dual-read. This covers `cs_dev` live data. |
| D5 | **`{{theme}}` placeholder → `{{topic}}`** in all stored templates (vertical config, agency `playbook_override.template`, runbook content and snapshots). After 3a, `{{theme}}` is no longer a valid var (`PLAYBOOK_VARS`), so runbook item edits reject it (`engine/src/runbook/items.ts`). Legacy `playbook_override` templates have no write path and are not validated, so the backfill is their only fix. `renderPlaybook` keeps its fallback text ("this topic") under the key `topic`. |
| D6 | **C7 exceptions stay** (§3). |

**My calls (owner may override):** 15b-3a runs on this branch `phase-15b3`. 15b-3b gets its own short kickoff and plan (`phase-15b3b`) after 3a merges. `vertical.version` is not bumped by the rename, because the content is unchanged. Free prose that is already stored (brief text, `what_changed`, `before_text`/`after_text`, feedback before/after audit rows, Ask message history) is not rewritten.

## 2. 15b-3a — data & engine

### 2.1 Migration (next free number at execution time, ≥ 0083; `generate --custom --name=topic_rename`)
One transaction, idempotent where cheap:
1. `ALTER TABLE theme_proposal RENAME TO topic_proposal`; column `theme_id` → `topic_id`; indexes `theme_proposal_live_unique|_pending_unique|_vertical_idx` → `topic_proposal_*`. Also rename the pkey and FK constraint names that carry `theme_proposal`, if any (check with `\d` at execution time). RLS stays enabled and forced, with no policy (service-only).
2. `review_analysis`: column `themes` → `topics`.
3. **Id and key rewrite** in jsonb. The rewrite map is binding:
   - object key `themes` → `topics`, only at the top level of `vertical.config`, `vertical_draft.draft` and `vertical.draft_evidence` (a copy of the draft);
   - self-rule ids `theme_weakness` → `topic_weakness`, `theme_strength` → `topic_strength` (as `self_rules[].id`, `playbooks[].trigger`);
   - playbook id `fix_theme` → `fix_topic` (as `playbooks[].id`, `self_rules[].playbook`);
   - placeholder `{{theme}}` → `{{topic}}` inside template strings;
   - complaint-spike details keys `theme` → `topic`, `themeName` → `topicName`, in **both** `detected_change.details` and `event.details` (`changeEvent`, a copy read by moves, playbooks, `score-stage` `detailsSignature`, `tag/structured.ts`), on rows with `details ? 'theme'`;
   - `move.details #> '{facts,theme}'` → `facts.topic` (reputation slump; the value is joined display names, moved as-is);
   - `model_batch.items[].context.themeIds` → `topicIds` (`ThemeDiscoveryContext` → `TopicDiscoveryContext`, read back by `model-ops/batches.ts`), so submitted batches on `cs_dev` keep their context.

   Apply to: `vertical.config`, `vertical.draft_evidence`, `vertical_draft.draft`, `runbook_item.content`, `runbook_item.upstream_snapshot`, `detected_change.details`, `event.details`, `move.details`, `model_batch.items`. (`brief.scorecard` holds no topic data, and finding `values` are never persisted.) Use structured `jsonb_set` / key rename where the path is fixed. A **text-level `replace` is allowed only for the quoted tokens** `"theme_weakness"`, `"theme_strength"`, `"fix_theme"` and `{{theme}}`, which are unambiguous. A bare `"theme"` or `"themes"` is never replaced as text.

   **Layout:** renames first, then each backfill `UPDATE` in its own `--> statement-breakpoint` block. Each `UPDATE` is idempotent and filtered to old-shape rows, so the test can re-run it (§2.3). Platform runbook items and their copies' `upstream_snapshot` are rewritten in place with no version bump, so `compareWithParent` sees no spurious upstream change.
4. Text id columns: `runbook_item.item_key` (`self_rule:theme_*` → `self_rule:topic_*`, `play:fix_theme` → `play:fix_topic`; the check constraints still pass), `playbook_override.playbook_id`, `brief_item.playbook_id` and `recommendation.playbook_id` (`fix_theme` → `fix_topic`). `playbook_override.template`: replace `{{theme}}`. Any PK clash (e.g. an agency already has both ids) is impossible today; assert with a `DO` block that raises if one exists.
5. **Not touched (C7):** `decision_sample`, `gold_label`, `llm_call.task`, `model_batch.purpose`, stage-ledger stage `review_themes`, Ask history.

Applied migrations (0022–0024, 0077) are never edited. The catalogue seed source (`packages/verticals/packs/*.yaml` → `scripts/seed-sql.ts` → `packages/db/src/catalog-seed.sql.ts`) is regenerated with `pnpm --filter @cs/verticals seed-sql` (script `packages/verticals/scripts/seed-sql.ts`), so `reset`/`catalog.ts` seed the new shape. The seed is insert-or-ignore, so on `cs_dev` the backfill alone fixes the existing verticals.

### 2.2 Interfaces (renamed; behaviour unchanged)
- `@cs/db`: `topicProposal` (`topicId`), `reviewAnalysis.topics`, `TopicProposalStatus`; `DetectedChangeDetails`/`ChangeDetails` `topic?/topicName?`; `MoveDetails.facts.topic`.
- `@cs/core`: `SELF_RULE_IDS` has `topic_weakness`, `topic_strength`; glossary already `topic`.
- `@cs/verticals`: pack schema key `topics` (`uniqueIds('topic')`), YAML packs and draft schema (`draft.ts`) use `topics`, `fix_topic`, `topic_*`, `{{topic}}`. The `vertical-draft` model's output key is `topics`, and its prompt wording says "topic".
- `@cs/engine`: `reviews/{themes,discovery,benchmark,complaints}.ts` → `topics.ts`, `topicsForVertical`, `discoverTopic`, `reviewBenchmark` output `topics`, `complaintBlockKey(verticalId, topicId)` (the key string `reviews:complaints:<v>:<id>` is unchanged). `PLAYBOOK_VARS` = `['competitor','service','new_price','areas','topic']`. `starting-point.ts` / `self-rules.ts` finding values `topic`, `retract.ts` predicate `details ? 'topic'`, `moves/rules.ts` reads `details.topic/topicName`. Exported names and files rename. The one-line "Topic …" fact sentence is unchanged.
- **Tools (internals + web-only fields in 3a):** `list_theme_proposals` → `list_topic_proposals`, `decide_theme_proposal` → `decide_topic_proposal`, `create_vertical`/`update_vertical` input `topics`, `get_platform_nav_counts` output `topics`, `list_catalog_review` output `topics`; schemas `TopicProposalView`. The web callers change in the same branch, along with `tools/workspace/labels.ts` (`d.topicName`) and the web `FALLBACK` map in `components/runbook/item-card.tsx` (key `topic`; both copies of the map are just renamed, not merged). **Not in 3a:** `get_theme_benchmark` and `search_reviews` (MCP/Ask-exposed) keep their names and fields. A small explicit mapping in `reputation.ts` translates the engine's `topics`/`topicId` to the old fields, and 3b deletes it. Their MCP output must be unchanged before and after 3a.
- `ai.yaml`: task names stay (C7). Output JSON-schema property names inside prompts that the engine now reads as `topics` change together with the parser. The JSON-schema *name* `theme_proposal` stays (model-ops).
- Worker jobs, demo data (`packages/demo`) and E2E seed: new names.

### 2.3 Tests (3a)
- **Backfill test** (follow `billing.test.ts:64`: the test DB is already migrated, so read the migration `.sql`, split on `--> statement-breakpoint`, and re-run the backfill blocks). Seed old-shape rows in every table in §2.1, including an agency `playbook_override` with `{{theme}}`, a runbook item `self_rule:theme_weakness` with an upstream snapshot, a complaint spike in both `detected_change` and `event`, a reputation-slump `move`, a submitted discovery `model_batch`, and a draft. Run the backfill blocks and assert the new shape. Run them a second time and assert nothing changes (idempotent). Also assert that a `decision_sample` key `theme_dental__x` and a `model_batch.purpose = 'theme_discovery'` are untouched.
- **Leftover scan test:** after migrate + catalogue seed + demo seed, scan every jsonb column and the id columns in §2.1 for `theme_weakness|theme_strength|fix_theme|{{theme}}` and top-level config key `themes`. Expect none.
- `PLAYBOOK_VARS` rejects `{{theme}}` as an unknown placeholder (runbook item edit, runbook tailor). `renderPlaybook` fills `{{topic}}`.
- `get_theme_benchmark` and `search_reviews` return the same output shape as before 3a (snapshot of the field names).
- Existing engine/tools/web tests pass under the new names. Renamed tests keep their assertions.
- **Owner step:** run the migration on `cs_dev` (OPS runbook), then re-run the leftover scan against it.

## 3. Stays `theme` (documented exceptions, C7)
LLM question keys `theme_<vertical>__<id>` (`decision_sample`, `gold_label` PK, `decision_review.keys`/`answers`/`resolution`, model-ops report, labeler tool); `ai.yaml` tasks `theme_discovery`, `theme_discovery_batch`; `model_batch.purpose`; stage `review_themes`; JSON-schema name `theme_proposal`; `llm_call.task` history. Each gets a one-line `// kept: model-ops key (15b-3 C7)` comment at its definition. UI theming (`themeVars`, `themeForViewer`, `@cs/ui` theme) is a different sense and is out of scope.

## 4. 15b-3b — surfaces (planned at its own kickoff)
- MCP/Ask: `get_theme_benchmark` → `get_topic_benchmark` (output `topics`, field `topicId`); `search_reviews` input `topicId`, output `topics`, error "Unknown topic"; `ask/labels.ts`; tool descriptions (`reputation.ts`, `nav-counts`). No aliases (D3).
- Web: route `(platform)/platform/themes` → `/platform/topics`; query `?theme=` → `?topic=` (Reviews); `ThemeQueue`, `ThemeHeatmap`, `pendingThemes`, `counts.themes` and the nav item href → topic names; `help/copy/platform.ts`.
- Help: page key `page:platform.themes` → `page:platform.topics`; guide `docs/help/pages/platform.themes.operator.md` → `platform.topics.operator.md`; `kb:seed` removes the stale key row (or the plan adds a one-line delete); coverage and terminology tests updated.
- Tests: MCP `tools/list` shows only the new names; old names are unknown; E2E for `/platform/topics` and Reviews `?topic=`; `/platform/themes` is a 404.

## 5. Dependencies on in-flight work
**phase-7** (migrations 0081, 0082) edits `nav-items.ts`, `nav.ts`, `ai.yaml`, `tools/all.ts`, `channels.test.ts`, `mcp/server.test.ts`, `demo/coverage.ts`, `e2e/seed.ts` and worker `reviews.ts`/`model-ops.ts`. The conflicts are textual only. Whichever branch merges second rebases, and this migration takes the next free number then.
