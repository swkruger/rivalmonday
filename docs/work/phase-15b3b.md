# phase-15b3b — topic rename, surfaces (MCP/Ask tools, routes, help key, web names)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-15b3b   **Base:** main @ f37d14f1
**Plan/spec:** [spec](../superpowers/specs/2026-10-23-phase-15b3b-topic-surfaces-design.md) (builds on [15b-3 spec](../superpowers/specs/2026-10-21-phase-15b3-topic-rename-design.md) §4) · [plan](../superpowers/plans/2026-10-23-phase-15b3b-topic-surfaces.md)

## Status (overwrite)
Implementation done: Tasks 0-9 (T2 migration `generic_topic_id`; T3 `collectBatch(…, scopeFor?)`; T4 tools; T5 `/platform/topics`, `TopicHeatmap`, `?topic=`; T6 help key, tips, guide, copy; T7 `review_checked_at` + re-ask sweep; T8 worker job `engine-reask`; T9 done grep + docs). Both done greps clean (see exclusions below). Awaiting final whole-branch review, then owner go-ahead for `/rm-merge`.


## Next (overwrite)
Final whole-branch review (most capable model), one fix wave; owner signs `phase-15b3b-copy-signoff.md` before merge; `/rm-merge` only with the owner's go-ahead.


## Pre-flight (Task 0, 2026-10-23)
- Rebased on `main` `b93f7ff4` (confirmed ancestor). 7b1: unmerged, docs-only commits, claims 0085 ledger_cost_numeric / 0086 spend_guard / 0087 retry_backoff; 15c2: docs-only, may claim 0085 (`ask_thread.deleted_at`). `main` + `cs_dev` at 0084. Our N = next free at execution (0085/0086 if 7b1 still unmerged, else 0088/0089); second merger renumbers. 7b1 unmerged: Task 3 stays full, Task 8 `usesAi` stays conditional.
- Conflict-scan: every non-C7, non-UI `theme` hit is in a task file list except `apps/web/src/components/charts/line-chart.test.tsx:182` (names `theme-heatmap.tsx`) -> added to Task 5. `e2e-affected-rules.ts` 170/195/217 and `demo/coverage.ts` 231/270/366/393 confirmed.
- `cs_dev` (SELECT only) stored `technician_professionalism`: `decision_label.question_key` 10; `vertical.config` 2 (generic, hvac_plumbing); `review_analysis.topics` 635 / `.asked` 657; `decision_sample` questions/primary/final 1,079, fallback 508, needs_review 447. All hvac_plumbing except generic's config. No hits in topic_proposal, detected_change, event, model_batch, vertical_draft, decision_review, llm_call, any other text/jsonb column. No new stored location -> Task 2 SQL unchanged.
- Inheriting set on `cs_dev` = `{generic}` only (generic, dental, hvac all have own `topics`); `generic` has 0 `review_analysis`/proposal/label rows. Collisions: review_analysis both ids 0; topic_proposal 0 (table empty); decision_label pairs 0; decision_sample both keys 0. The migration changes 1 row on `cs_dev` (generic config); inheriting-vertical logic is test-covered only.
- User triggers on detected_change/event/decision_label/decision_sample: none (only `capture_immutable`, `evidence_immutable`).
- Re-ask volume (Task 7 SQL, `analyzed_at` for `checked_at`): 1,635 reviews in done 180-day set; candidates 1,375 (gap_a 1,375; gap_b 0). One-off deploy wave: 0084 bumped `vertical.updated_at` (2026-10-20) past every `analyzed_at`, so rows missing a below-τ seed topic are re-asked once. Drain ~0.7 day at 2,000/day. cs_dev: 10,908 reviews, 1,719 review_analysis rows.
- Rulings R1 (Task 7: `reask: []` in all `EngineWork` literals/fakes in worker) and R2 (Task 2: `coalesce(col::text,'')` on nullable columns + NULL-row tests) written into the plan.

## Interfaces this branch adds or changes
No aliases: `get_topic_benchmark` (was `get_theme_benchmark`), `search_reviews.topicId`, `TopicBenchmarkView.topics[].topicId`, review views `topics`, "Unknown topic", `/platform/topics` (`/platform/themes` 404s), `?topic=`, `page:platform.topics`, tips `platform.topics.*`, components `TopicHeatmap`/`TopicQueue`/`decideTopicAction`. `@cs/ai` `collectBatch(…, scopeFor?)` (per-vertical batch ledger). Engine `reaskReview`/`ReaskOutcome`, `EngineWork.reask`, `DrainResult.reasked`, worker job `engine-reask` (singletonKey `reask:<id>`, no `usesAi`), `REASK_DAILY_MAX = 2000`. Migrations (next free at execution, 0085/0086): `generic_topic_id` (generic `technician_professionalism` -> `staff_professionalism`), `review_analysis.checked_at`.


## Assumes from other branches
- **phase-7b1** (executing; claims 0085–0087): same `collectBatch` `scopeFor` change (second merger keeps one); edits `batches.ts`, worker `jobs`/`main.ts`, adds `usesAi` to AI jobs — `engine-reask` needs it if 7b1 merges first.
- **phase-15c2** (2a plan awaiting approval): rebases on our renames (E2); may claim a migration (`ask_thread.deleted_at`).
- **phase-7c1/7c2** (planned): use the new tool names; `engine-reask` stays at default concurrency.

## Decisions (owner-approved)
Spec E1–E6 (2026-10-23): one branch; before 15c-2; E3 full field rename; fold in all three topic backlog items; tip ids renamed + guide/copy reviewed with sign-off doc; automatic re-ask (180 d, gap only, Jev first, capped).

## New backlog (target → item)
- Polish -> pack YAML flow-mapping descriptions containing commas are truncated (generic `staff_professionalism` is stored as "Courtesy"): quote descriptions + new migration.
- Polish -> `review_analysis.checked_at` has no index; the daily-cap count scans the table each idle sweep. Add one if volume grows.
- Scale -> the re-ask sweep hashes 180 d of review text per idle sweep; a stored `review.text_sha` column would remove it.
- Phase 7c -> `search_reviews` input is not `.strict()`: an old MCP client sending `themeId` gets unfiltered results silently. Decide whether tool inputs become strict.
- Polish -> vertical-edit re-ask trigger fires on any `vertical.updated_at` bump (business-area version bumps, renames, reviewed status; a generic edit hits every inheriting vertical); on cs_dev ~84% of analysed reviews have a below-τ seed topic, so each bump re-asks most of that vertical's 180-day reviews and shares the 2,000/day cap with approval re-asks. Fix: topics-specific edit marker (`config->'topics'` hash or `topics_edited_at`) or order approval gaps first.
- Polish -> duplicate `engine-reask` job can be queued while one runs (singleton `short` policy only covers queued jobs): at most one extra Jev call under backlog; data deduped under FOR UPDATE; optional `pg_try_advisory_xact_lock(hashtext('reask:'||id))` guard.
- Process -> `scripts/local-test-db.sh env` prints `/cs_test`; the per-worktree DB name only comes from the kickoff sed, so a reviewer using the script's output hits the shared `cs_test`.
- Close at merge: BACKLOG 15b-3b row, OPS `0037`, 14a batch discovery untagged, 14a generic `technician_professionalism`, 3c mid-window theme, 4a `playbooks.ts` `themeName`.


## Owner verification steps
After merge, `cs_dev`, worker stopped (OPS order): `pnpm --filter @cs/db migrate`; `pnpm --filter @cs/db topic-leftovers` prints nothing; `pnpm kb:seed`. Then: `/platform/topics` works and `/platform/themes` 404s; Reviews `?topic=`; MCP `tools/list` shows `get_topic_benchmark`. Watch `[engine-reask]` log lines and `llm_call` rows with `task = 'review_decisions'` with `vertical_id` and no `client_id`; daily count: `SELECT count(DISTINCT review_id) FROM review_analysis WHERE checked_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`.

**Notes for the owner**
- P9: a review whose decide keeps throwing (Jev and LLM both down) is re-offered every 5 min while no new reviews are pending (no backoff).
- First deploy re-asks about 1,375 reviews once on `cs_dev` (0084 bumped `vertical.updated_at`); about 0.7 d at 2,000/day.
- MCP users: `get_theme_benchmark` / `themeId` are gone, no alias.
- Sign the copy doc `phase-15b3b-copy-signoff.md` before merge.
- If phase-7b1 merges first: `engine-reask` needs `usesAi: true`, and both migrations renumber after 0087. phase-15c2 rebases on our renames.

**Merge note:** `docs/ARCHITECTURE.md` and `docs/BACKLOG.md` still name `get_theme_benchmark` etc.; fold at `/rm-merge`.

**Done-grep exclusions** (review-sense `theme` renamed everywhere else): UI theming (`apps/web/CLAUDE.md:35`, `layout.tsx:14`, `help-index.ts:31`, `bot/page.test.tsx`, `agency-settings-reads.ts:10`, `e2e-affected-rules.ts:74` all name `server/theme.ts` or the CSS theme); C7 keys (`generic-topic-id.test.ts:16` and `model-ops/report.test.ts:6` use `theme_<v>__id` question keys); absence assertions of the old names (`workflow.spec.ts:115`, `data-views.spec.ts:48` old `?theme=` is ignored, `terminology.test.ts`, `mcp/integration.test.ts:114-121`, `help-content.test.ts:368,394-395`, `vertical-draft.test.ts:64`, `reputation.test.ts:41`, `topics.test.ts`, `verticals` `loader.test.ts`/`packs.test.ts`); migration/leftover tests that seed the old `themeIds` shape (`db/migrations`, `topic-rename.test.ts`, `topic-leftovers*`).


## Brief
Distilled in the spec and plan (links above); the original scope/question list was removed to stay under the cap.
