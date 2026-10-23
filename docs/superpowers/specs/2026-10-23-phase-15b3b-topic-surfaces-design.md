# Phase 15b-3b — topic surfaces + three topic fixes (design)

**Builds on:** [15b-3 spec](2026-10-21-phase-15b3-topic-rename-design.md) §4 (the surface rename list, binding), D3 (no aliases, no redirects), D4 (no dual-read), §3 (C7 exceptions keep `theme`). Core spec §6.4, §6.5, §8.2, §8.5. Footprint, counts and file list: [work file brief](../../work/phase-15b3b.md) §2.

## Why
15b-3a renamed the data and the engine. Users and MCP clients still meet `theme` in tool names, fields, URLs, the help key and web names. 15b-3b finishes the rename. The owner also folded in three topic-related backlog fixes (§3–§5), because they touch the same code and the same review data.

## 1. Decisions (owner, 2026-10-23)
| # | Decision |
|---|---|
| E1 | **One branch, one plan** (`phase-15b3b`), not split. |
| E2 | **15b-3b goes before 15c-2 and merges fast.** 15c-2 then builds on the renamed files. |
| E3 | **`TopicBenchmarkView` inner fields renamed end to end** (`themes` → `topics`, `themeId` → `topicId`) in tools, schemas, fixtures and web readers (heatmap, competitor `sections.tsx`, `review-item.tsx`). No web-side adapter. |
| E4 | **Fold in all three topic backlog items:** batch discovery ledger tagging (§3), generic `technician_professionalism` id (§4), and re-asking older reviews (§5). Close the stale 4a `playbooks.ts:106` `themeName` item: it no longer exists in the code. |
| E5 | **Help tip ids are renamed with the key** (`platform.themes.*` → `platform.topics.*`). **The guide wording is also reviewed**, along with the topic-proposals page copy and the renamed tool descriptions. These go in a sign-off doc (§6). |
| E6 | **Re-ask runs automatically** (no operator button). It fires when a topic is approved or a competitor gains a vertical, covers reviews from the last 180 days, asks only the missing questions, cascades Jev first, and is capped per run (§5). |

**My calls (owner may override):** the generic topic's new id is `staff_professionalism`, which matches its existing name "Staff professionalism". Re-ask is a sweep-detected gap, tracked with a `review_analysis.checked_at` marker (one added column), not an event queue (§5). Re-ask spend is platform spend, scoped like review analysis (`singleVerticalScope`), and never counts against a client's cap. Caps: re-ask runs only when no new reviews are pending, at most `ENGINE_SWEEP_LIMIT` per sweep and 2,000 reviews per UTC day. `generic`'s own rows count as inheriting (§4). On an id collision the migration merges rather than fails (§4).

## 2. Surface rename (15b-3 §4, unchanged scope)
§4 of the 15b-3 spec is the binding list. The 15b-3b additions, all from the brief:
- **Tools:** delete `toLegacyThemeFields`. Rename the export `getThemeBenchmark` → `getTopicBenchmark`. `workspace-fixtures.ts` `seedReview` `analysis.themes` → `topics`. In MCP `get_topic_benchmark` the output keys are `topics[]` and `businesses[].topics[].topicId`. `search_reviews` input is `topicId` and output `topics`. The error is `Unknown topic`.
- **Callers:** `packages/mcp/src/prompts.ts`, `packages/ask/src/labels.ts`, `packages/demo/src/coverage.ts` + `demo/README.md`, `scripts/e2e-affected-rules.ts`, `e2e/workflow.spec.ts`.
- **Web:** `ThemeProposalsPage`, `ThemeQueue`, `decideThemeAction` → `Topic…`. `charts/theme-heatmap.tsx` → `topic-heatmap.tsx` (`TopicHeatmap`). The Reviews page's `THEME` regex and select `name` → `topic`.
- **`terminology.test.ts`:** drop `/platform/themes`, `?theme=` and `page:platform.themes` from the allow-list.
- **Not stored data:** Ask message history keeps the old tool names, per the 15b-3 "My calls".
- **Done when:** a review-sense `theme` grep (excluding §3 exceptions, UI theming and history) prints nothing. The plan writes it as a script step.

## 3. Batch discovery spend tagged with its vertical (14a)
Batch results already carry `customId = verticalId` (`engine/src/reviews/discovery.ts`). Each result is ledgered separately, so attributing cost per result is exact, not a guess. That overrides 14b decision 5 for the batch path only. Multi-vertical sync calls stay untagged.
- **Interface** (`@cs/ai`): `collectBatch(name, batchId, scope, scopeFor?: (customId: string) => Partial<CallScope>)`. Each ledger row is `{ ...scope, ...scopeFor?.(r.customId) }`.
- **Caller:** `engine/src/model-ops/batches.ts` passes `id => ({ verticalId: id })` when `b.purpose === THEME_BATCH_PURPOSE`. Other purposes pass nothing.
- **History:** old rows stay untagged, because the ledger never stored `customId`. No migration.
- **Test:** a batch with two verticals writes two `llm_call` rows, each with its own `vertical_id`.

## 4. Generic topic id `technician_professionalism` → `staff_professionalism` (14a)
**Problem:** `generic.yaml` keeps an HVAC noun in its id. `assemblePack` replaces arrays whole, so every catalogue vertical without its own `topics` inherits the id. Draft verticals such as Distillery are examples. The id then reaches discovery prompts (`id (name)`), decision keys and stored analysis. HVAC's own `technician_professionalism` is correct and **stays**.
- **Source:** `packages/verticals/packs/generic.yaml` and `packages/db/src/catalog-seed.sql.ts`.
- **Migration** (next free at execution, expected `0085`, `generate --custom --name=generic_topic_id`), hand-written and idempotent. It renames the id in:
  1. `vertical.config` of the `generic` row: the topic entry with `id = technician_professionalism`.
  2. Rows of `generic` itself **and** of any vertical that inherits generic topics (its `vertical.config` has no `topics` key):
     - `review_analysis.asked` / `topics` array elements;
     - `topic_proposal.topic_id`;
     - the decision key `theme_<v>__technician_professionalism` → `theme_<v>__staff_professionalism`, in:
       - `decision_label.question_key` (PK `sample_id, question_key`: UPDATE, not delete-insert);
       - `decision_sample`: jsonb **object keys** in `questions`, `primary_answers`, `fallback_answers` and `final_answers`, and elements of `needs_review`;
       - `decision_review.keys` / `answers` / `resolution`.
  3. Topic ids in `vertical_draft.draft` and `vertical.draft_evidence`, and in any other stored jsonb the plan's pre-flight finds (event/brief `details`, benchmark snapshots). `topic-leftovers.ts` is the pattern.
  4. **Collision:** `staff_professionalism` may already exist for a vertical, from a discovered proposal. Then the migration merges:
     - dedupe the arrays;
     - keep the existing proposal row and delete the renamed one;
     - where the target decision key or label already exists, skip it and keep the existing one.

     Pre-flight reports the counts on `cs_dev`.
- **Not rewritten:** `hvac_plumbing` rows, rows of verticals with their own `topics`, free prose, `llm_call` history.
- **Verification:** a `pnpm --filter @cs/db` check (extend `topic-leftovers`) counts `technician_professionalism` outside verticals whose effective topic list contains it. It must print nothing on `cs_dev` after migrating.
- **Demo and tests:** `demo/src/names.ts` and `benchmark.test.ts` use the HVAC id. They change only where they exercise generic.

## 5. Re-ask older reviews (3c decisions 4 and 8, now reversed)
**Today:** review analysis runs once per review text version (`REVIEW_STAGE` / `REVIEW_VERSION`, subject `md5(id|text)`). It asks every topic of every vertical the competitor has at that moment. A topic approved later (`decideTopicProposal`) is asked only of new reviews. A vertical added later to a competitor never gets `review_analysis` rows for existing reviews. Shares stay honest, because the denominator is `asked`, but a new topic's numbers take months to fill in.

**New:** a gap scan in the sweep, plus its own engine job, driven by a check marker on each row. A gap scan is used instead of an event hook on approve or vertical attach. It also catches gaps that already exist on `cs_dev`, and no write path changes.

**Migration** (the same `0085` as §4, or the next free number): `ALTER TABLE review_analysis ADD COLUMN checked_at timestamptz`. The column is nullable; null means "as of `analyzed_at`". No backfill. RLS and grants are unchanged (same table).

**Gap.** This applies to a review in the sweep's normal review set (text >= `MIN_REVIEW_CHARS`, posted within `REVIEW_ANALYSIS_DAYS` = 180, competitor tracked or a client's own business) whose current text has already finished `REVIEW_STAGE`. Let `mark = coalesce(ra.checked_at, ra.analyzed_at)`.
- **(a) New topic:** a `review_analysis` row for vertical `v` exists, and either:
  - an approved `topic_proposal` for `v` has `decided_at > mark` and a `topic_id` not in `asked`; or
  - `vertical.updated_at > mark` for `v`, because a catalogue or pack edit may have added seed topics. For verticals that inherit the generic topic list, `generic`'s `updated_at` counts too.
- **(b) New vertical:** a vertical in `competitorVerticals(competitor)` has no `review_analysis` row for the review.

Topics that the first analysis asked but left below τ are **not** gaps: the `> mark` rule excludes them. So deploying this does not re-ask every `needs_review` row. The one exception: after a vertical edit, that vertical's seed topics not in `asked` get one more try, bounded by the marker. Accepted.

**Sweep SQL** (`engine/src/sweep.ts`): a new `reask` list. It is a `review_analysis` / `client_competitor` join that implements (a) as written (both of its conditions can be computed in SQL), **UNION** (b) as a NOT EXISTS, limited per the caps below. Rows whose marker is newer than every trigger drop out by construction. So an unanswerable gap never loops, and `drainEngine` still sees "no work".

**Job:** `engine-reask` (`{ reviewId }`, `ENGINE_STAGE_QUEUE`, singletonKey `reask:<reviewId>`), registered next to `engine-review` in `apps/worker/src/jobs/engine.ts`. `EngineWork` gains `reask: string[]`. `drain.ts` handles it like `review`.

**Handler:** `reaskReview(deps, reviewId)` in `engine/src/reviews/topics.ts`.
- **Gap, recomputed exactly in JS:**
  - (a) = topics in `topicsForVertical(v)` that are not in `asked` and are approved proposals with `decided_at > mark`, plus the seed topics not in `asked` if `vertical.updated_at > mark`;
  - (b) = all topics + `other` + sentiment for that vertical.
  - If the gap is empty, the handler only sets `checked_at = now()` on the rows.
- **The call:** one `deps.ai.decide('review_decisions', state, gapQuestions, singleVerticalScope(gapVerticals))`.
  - `state` is exactly as in `analyzeReview`: `business_type` lists **all** of the competitor's verticals, with `redactForModel` and `MAX_REVIEW_CHARS`.
  - Sentiment is asked only when there is a (b) row.
  - Question keys are the existing `theme_<v>__<id>` / `other` keys (C7).
- **Writes:** not a `runStage`. No idempotence key is needed, because the marker provides idempotence. One transaction:
  - (a) rows: append newly confident ids to `asked` and the yes-answers to `topics` (deduplicated, jsonb); `confidence = least(old, new)`; `needs_review = old OR new`; `checked_at = now()`.
  - (a) rows keep **`analyzed_at`, `sentiment`, `other` and `analysis_version` unchanged**. Discovery's `analyzed_at > last run` filter must not recount the review.
  - (b) rows: insert via `resolveReviewAnalysis`, with `analyzed_at = now()` and `checked_at = now()`.
- **Errors:** a decide error throws, and the job retries like other engine jobs. The marker is set only on success.

**Caps:**
- The sweep adds re-ask candidates **only when that sweep's normal review list is empty**, so new reviews always go first.
- At most `ENGINE_SWEEP_LIMIT` per sweep, newest review first.
- At most `REASK_DAILY_MAX = 2000` reviews per UTC day, counted as rows with `review_analysis.checked_at >= today`.
- **Cost:** Jev first per `ai.yaml` `review_decisions` (τ 0.85; escalation and shadow unchanged). It is platform spend, ledgered with `verticalId` when single-vertical, and never counts against a client's cap.

**Unchanged:**
- **Text edits:** `REVIEW_STAGE` re-runs and replaces the rows, and that upsert resets `checked_at` to null.
- **Readers:** benchmark readers need no change, because `asked` grows along with the denominator. Discovery is unchanged.

**Tests (engine, DB-backed):**
- approving a topic re-asks older analysed reviews once, with only that question;
- a second sweep selects nothing;
- a below-τ answer is not retried;
- topics left below τ earlier are not re-asked on deploy;
- a vertical edit re-asks its missing seed topics once;
- a competitor gaining a vertical gets full rows for that vertical only, and other verticals' rows are untouched;
- `analyzed_at` is unchanged on (a) rows;
- reviews older than 180 days are skipped;
- re-ask waits while new reviews are pending;
- the daily cap is honoured;
- an edited review's upsert clears `checked_at`.

## 6. Copy review and sign-off (E5)
`docs/work/phase-15b3b-copy-signoff.md` (moved to `docs/archive/` at merge, as for 15c-1) lists, each as current text → proposed text:
- the guide `docs/help/pages/platform.topics.operator.md`, after the rename;
- the `platform.topics.*` tips and page copy in `help/copy/platform.ts`;
- the PageHeader title and breadcrumb for `/platform/topics`;
- the descriptions and error strings of `get_topic_benchmark`, `search_reviews` and `nav-counts`;
- one new guide sentence explaining that approving a topic also checks reviews from the last 180 days. This is the re-ask, as seen by an operator.

It also carries a "Decisions for the owner" list. Wording changes are proposed in the doc, not shipped silently. The implementer applies only what the owner signs off, defaulting to the proposed text if the owner approves the doc as a whole.

## 7. Non-goals
- No aliases or redirects for old names, routes or keys (D3).
- No rewriting of stored prose or Ask history.
- No change to τ, the cascade or Jev routing.
- No re-ask beyond 180 days, and no re-ask on vertical *removal* (rows stay, as today).
- No operator UI for re-ask progress. `engine-reask` shows in `/platform/health`'s pg-boss queue list like the other engine jobs. No stage-count panel.

## 8. Dependencies on in-flight work
- **phase-15c2** (docs only so far): its tasks on `platform/themes/*`, `theme-heatmap.tsx`, Reviews `page.tsx`, `help/copy/platform.ts` and `nav-items.ts` run last (15c C7). Per E2 it rebases on us. It may also want a migration: whoever merges first takes `0085`.
- **phase-7-planning** (docs only): 7c's isolation suite, MCP `tools/list` and Ask evals use the new tool names.
