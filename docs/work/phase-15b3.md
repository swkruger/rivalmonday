# phase-15b3 — rename review "theme" to "topic" in code, DB, tools and routes

**Kind:** implementation (15b-3a)   **Worktree:** ../CompetitorSpy-wt/phase-15b3   **Base:** main @ 55964738 (rebased on 7a)
**Plan/spec:** spec [15b-3 design](../superpowers/specs/2026-10-21-phase-15b3-topic-rename-design.md) (approved 2026-10-21); plan [15b-3a](../superpowers/plans/2026-10-21-phase-15b3a-topic-rename-data.md)

## Status (overwrite)
15b-3a built and reviewed (Tasks 0–6 + final fix wave), rebased onto main 55964738 (7a merged) on 2026-10-22: migration renumbered to `0084`, `generate` = no changes, `drizzle-kit check` OK; typecheck 16/16, `test:affected --base main` 15/15 packages green (all packages ran). E2E not re-run since the rebase (owner: after 15c merges). Tree clean, not pushed. 15b-3b (surfaces) not started.

## Next (overwrite)
1. Owner go-ahead → `/rm-merge phase-15b3` (fold work file → shared docs, merge, push). Full E2E deferred until after 15c merges (owner, 2026-10-22).
2. With owner OK after merge: `cs_dev` steps below, then `kb:seed`.
3. `/rm-kickoff phase-15b3b` (routes, page key, MCP/Ask tool names; delete `toLegacyThemeFields`).

## Interfaces this branch adds or changes
Migration `0084_topic_rename` (renumbered after phase-7 took 0081-0083): `topic_proposal`, `review_analysis.topics`, backfilled ids/keys. Tools `list_topic_proposals`, `decide_topic_proposal` (input `proposalId`), `get_platform_nav_counts` → `topics`. `findTopicLeftovers` + `pnpm --filter @cs/db topic-leftovers`. MCP `get_theme_benchmark`/`search_reviews` unchanged (legacy mapping); `get_move` fact label now reads "Topic". Next free migration after merge: **0085**.

## Assumes from other branches
- **phase-7 (7a)**: merged to main 2026-10-22 (0081–0083); this branch is rebased on it, no assumptions left.
- **phase-15c** (in flight, no migration): touches `theme-heatmap.tsx` and `@cs/ui` theme (UI sense) — no overlap with 3a; its "next free 0084" note becomes 0085 once this merges.

## Decisions (owner-approved)
D1–D6 in the 15b-3 spec §1: two sub-phases (3a data & engine, 3b surfaces); full DB rename; no aliases/redirects (no live users; supersedes C7); one-time backfill, no dual-read; `{{theme}}`→`{{topic}}`; C7 model-ops exceptions stay.
7. Merge order 7a → 15b-3a → 15c (fewest migration renumbers).
8. Full E2E for this merge deferred until after 15c merges; unit coverage = `test:affected` (all packages).

## New backlog (target → item)
- 15b-3b → `workspace-fixtures.ts` `seedReview` input `analysis.themes` → `topics` (test-only; with `reputation.test.ts`).
- Polish → `docs/OPS.md:9` says "Latest migration `0037`" (stale).

## Owner verification steps
After merge, on `cs_dev` per `docs/OPS.md`: run the `fix_theme`-slug pre-check, stop the worker, migrate, deploy web + worker together, then `pnpm --filter @cs/db topic-leftovers` (expect no output).

## Brief

### 1. Scope
- **C7** ([15b-2 spec §1](../superpowers/specs/2026-10-20-phase-15b2-help-content-design.md)): own sub-phase after 15b-2. Hand-written migration: `theme_proposal`→`topic_proposal` (+ `theme_id`, 3 indexes), `review_analysis.themes`→`topics`, `vertical.config` key `themes`→`topics`; rule/playbook ids `theme_weakness`/`theme_strength`/`fix_theme` → `topic_*` (incl. `runbook_item.item_key`, pack YAML, catalogue seed, together); `detected_change.details.theme(Name)` backfill or dual-read; tool `get_topic_benchmark` + `topicId`/`topics` with **old names as deprecated aliases**; route `/platform/topics` + `?topic=` with redirects; engine/web identifiers. **Stays:** LLM question keys `theme_<vertical>__<id>` and `model_batch` purpose/task names.
- **C3**: user text already says "topic"; page key `page:platform.themes` renames with its route.
- Core spec §6.4 (complaint spikes), §6.5 (review themes), §8.2 (tools), §8.5 (playbooks). Roadmap row 15: "15b-3 topic rename *to be written*".

### 2. Already built — the `theme` footprint (review sense; UI-theme `themeVars`/`themeForViewer`/`@cs/ui` theme excluded)
| Package | Files / lines (test files) | Key paths |
|---|---|---|
| engine | 33 / 332 (15) | `reviews/{themes,discovery,benchmark,complaints}.ts`, `briefs/{self-rules,playbooks,starting-point}.ts`, `moves/rules.ts`, `events/retract.ts`, `model-ops/report.ts` |
| web | 50 / 211 (26) | `(platform)/platform/themes/*` (`ThemeQueue`), `charts/theme-heatmap.tsx`, `reviews/page.tsx` (`?theme=`), `competitors/[id]/sections.tsx`, `nav-items.ts`/`nav.ts` (`pendingThemes`, `counts.themes`), `server/vertical-draft.ts`, `new-business-type-model.ts`, `help/copy/platform.ts`, `terminology.test.ts` |
| tools | 21 / 142 (9) | `tools/themes.ts`, `reputation.ts`, `schemas.ts` (`ThemeProposalView`, `ThemeBenchmarkView`), `verticals.ts`, `platform-verticals.ts`, `nav-counts.ts`, `catalog/merge.ts`, `workspace/labels.ts` |
| db | 10 / 56 (2) + migrations 0022–0024, 0077 | `schema/insights.ts`, `schema/engine.ts` (`details.theme/themeName`), `catalog-seed.sql.ts` |
| demo 10/57 · verticals 9/40 · ai 5/15 · worker 3/5 · core 2/2 · mcp 2/2 · ask 1/1 · collectors 1/1 | | `packs/*.yaml`, `verticals/src/{schema,draft}.ts`, `ai.yaml`, `core/domain.ts` `SELF_RULE_IDS`, `ask/labels.ts` |

**DB:** table `theme_proposal` (col `theme_id`; idx `theme_proposal_live_unique`, `_pending_unique`, `_vertical_idx`; RLS enabled/forced, no policy, service-only), `review_analysis.themes` (jsonb), `ThemeProposalStatus` (TS type, no PG enum). No theme RLS policy names.
**External contracts (need aliases/migrations):**
- MCP + Ask tools: `get_theme_benchmark` (output `themes`, `themeId`), `search_reviews` (input `themeId`, output `themes`, error "Unknown theme"). Web-only: `list_theme_proposals`, `decide_theme_proposal`, `create_vertical`/`update_vertical` input `themes`, `get_platform_nav_counts` output `themes`, `list_catalog_review` output `themes`.
- URLs: `/platform/themes`, `?theme=`; help key `page:platform.themes` (+ `docs/help/pages/platform.themes.operator.md`, KB rows via `kb:seed`).
- Stored data: `vertical.config.themes` (agency-created verticals too), `detected_change.details.theme/themeName`, `brief_item`/`recommendation.playbook_id` and `playbook_override` PK = `fix_theme`, `runbook_item.item_key` `play:fix_theme`/`self_rule:theme_*` (+ `content` jsonb), **`{{theme}}` placeholder** in `PLAYBOOK_VARS` and agency-edited templates (`playbook_override.template`, runbook content), Ask message history naming the old tool.
- Model-ops keys (C7: stay): `theme_<v>__<id>` in `decision_sample`/`gold_label`; `ai.yaml` tasks `theme_discovery(_batch)` (also `llm_call.task` cost history), `model_batch.purpose`, stage `review_themes` (stage ledger), JSON-schema name `theme_proposal`.

### 3. Binding decisions
C7, C3; never edit applied migrations; web writes via `runTool`, reads via tools; refusals 404; event readers filter `retracted_at IS NULL`; help keys `page:<context>.<page>`; HVAC/dental keep legacy pack plays (14); τ 0.85.

### 4. Backlog to fold in
- [ ] **15b-3** topic rename (identifiers) per [15b-2 spec](superpowers/specs/2026-10-20-phase-15b2-help-content-design.md) C7: DB/tools/packs/routes (`/platform/themes` → `/platform/topics`, key `page:platform.themes`, `?theme=`) with MCP aliases; also tool descriptions + 'Unknown theme' (`reputation.ts`), `nav-counts` description, `vertical-draft` prompt — *phase-15b2*
- Related (optional): "batch theme discovery untagged; … generic theme `technician_professionalism…`" — *14a*; "theme approved mid-window not asked of older reviews" — *3c*; "`playbooks.ts:106` `themeName` fallback" — *4a*.

### 5. In-flight workstreams
See **Assumes from other branches** (textual conflicts only).

### 6. Open questions for the owner
All answered 2026-10-21 — see spec §1 (D1–D6).
