# Phase 3d — Model Ops & Engine Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the engine's model decisions measurable and correctable (one routed task per decision use, Jev-vs-LLM shadow samples, gold labels, an accuracy/calibration report, a working `decision_review` resolution, an opt-in Anthropic Message Batches provider for theme discovery), and close the web-diff, scoring, stage-versioning and crawler-conduct carry-over from Phases 2a–3c.

**Architecture:** `@cs/ai` gains a shadow sampler inside `decide()` (a configured share of calls run both Jev and the LLM on every question; every call that still needs review is also recorded) and writes `decision_sample` rows through a new `DecisionSampleSink`; humans add `decision_label` rows (CSV round-trip or by resolving a `decision_review`), and a pure report computes accuracy and expected calibration error per task, question family and provider. Events gain a soft retraction (`event.retracted_at`) that every reader excludes; the diff stages use it to supersede outputs of an older stage version, and review resolution uses it to withdraw an event the AM rejects. A second `@cs/ai` provider wraps `@anthropic-ai/sdk` Message Batches; theme discovery submits one batch per night when `ANTHROPIC_API_KEY` is set, and a 15-minute `model-batch-poll` job applies the results. The rest is targeted hardening of existing modules (block re-extraction, consent tokens, alignment-based volatile learning with mask expiry, a churn guard that runs before paid work, context-checked ZIPs, score backoff, redirect checks, role checks, price-rule fixes).

**Tech Stack:** As Phase 3c (TypeScript, Drizzle 0.44 + Neon Postgres 18 with pgvector, pg-boss 10.4, vitest, `@cs/ai` OpenRouter + Jev). One new dependency: `@anthropic-ai/sdk@^0.131.0` (MIT) in `@cs/ai`.

**Spec:** [core platform spec](../specs/2026-09-29-core-platform-design.md) §3 (roles), §4.2 (crawler conduct), §6.1–6.3 (detection, tagging, scoring), §6.5 (theme discovery), §7.1–7.5 (model layer, shadow evaluation, ledger), §11–12 · **Roadmap:** [2026-09-29-roadmap.md](2026-09-29-roadmap.md) (carry-over sections for 2a, 3a, 3b, 3c) · **Previous plan (patterns to copy):** [3c](2026-10-02-phase-3c-reviews-and-prices.md).

**Prerequisite:** Phase 3c merged (`main` at `fa048f2` or later; `cs_dev` migrated to `0024`). `.env` has `OPENROUTER_API_KEY`; `TYPESAFE_API_KEY` for the live shadow run; `ANTHROPIC_API_KEY` is optional (the batch path stays off without it). Branch: `phase-3d-model-ops-hardening`.

---

## Scope (why one plan)

The 3c plan's overview table split the old "3c" in two and named this part **3d**. The owner chose (2026-10-02) to keep all of 3d in one plan and one branch rather than split it again: 17 tasks, comparable to 3b's 16.

| Area | Tasks | Carry-over closed |
|---|---|---|
| Model ops | 1–9 | Per-use decision tasks; Jev shadow sampling + gold labels + accuracy/calibration report (spec §7.3); `decision_review` resolution (3a); Anthropic-direct batch provider with theme discovery as first consumer (spec §7.1); stage-version retraction (3a/3b) |
| Engine hardening | 10–14 | Score backoff, `review_spike` vertical filter in the sweep, late-linked clients, threshold validation (3a/3c); `EXTRACTOR_VERSION` re-extraction (3a); camelCase consent tokens (3a); volatile learning on alignment, pending changes, mask expiry/unmask (3a); churn-guard gaps (3a); `extractZips` (3a) |
| Collectors & 3c fixes | 15–16 | Redirect host/robots checks (2a); discovery homepage status (2a); classifier business name (3c); `acceptSuggestion` role checks (3a overview); `DISCOUNT_AFTER` off-season (3c); "was $X now $Y" (3c); self-business naming (3c); `app_user` writing `client.self_competitor_id` (3c); `theme_proposal` tenant visibility (3c) |
| Verification | 17 | Live shadow run, report, docs |

## Decisions taken in this plan (review these first)

1. **One `ai.yaml` task per decision use.** `tag_decisions` (web tagging), `structured_decisions` (structured tagging), `merge_decisions` (same offer?), `page_decisions` (page classification) join `review_decisions`/`price_decisions`; the shared `decisions` task is removed. Each can move to the LLM, change τ or change its shadow rate by config alone (spec §7.3).
2. **Shadow sampling lives in `Ai.decide()`.** A Jev task with an escalation target has `shadow_rate` (0–1, default 0; shipped at 0.05, and 0.02 for review decisions). A sampled call runs Jev **and** the LLM on every question in parallel and resolves the cascade locally from both answer sets, so the returned result is the same rule as before (Jev unless below τ, then the LLM). The extra LLM call is ledgered as `llm_decisions:shadow`. `AI_SHADOW_RATE` (env) overrides every rate for a live measurement run.
3. **What gets recorded.** A `decision_sample` row is written for every sampled call (`reason: 'shadow'`) and for every call that still needs review after the cascade (`reason: 'review'`, no extra model call: it holds what the cascade already has). It stores the (already redacted) state, the questions, each provider's answers and the final answers. A failed sample write is logged and never fails the decision. `DecisionResult.sampleId` lets a stage link its `decision_review` row to the sample.
4. **Gold labels come from humans only.** `decision_label (sample_id, question_key)` rows come from (a) a CSV round-trip (`decisions export` → owner fills the `label` column → `decisions import`) or (b) resolving a `decision_review` (`source: 'review'`). No model ever writes a label (a stronger model's answer is not gold; it would grade the LLM against itself).
5. **Report = accuracy + expected calibration error (ECE, 10 equal-width bins)** per (task, question family, role) where role is `primary` (Jev), `fallback` (LLM) or `final` (what the engine used). Families group per-vertical keys (`service_*` → `service`, `theme_*` → `theme`, `other_*` → `other`, `same_<n>` → `same_offer`). A row notes "consider routing to the LLM" when both providers have ≥ 30 labelled answers and the LLM is ≥ 5 points more accurate. CI eval sets (spec §12) stay in Phase 7; this phase builds the data and the report they will use.
6. **Events can be retracted, never deleted.** `event.retracted_at` + `retraction_reason`. Retracting deletes the event's `event_score` and `move_event` rows (tenant-derived data that must not reach a brief) in the same transaction; the event row and its evidence chain stay for audit. Every reader excludes retracted events: merge candidates, novelty, scoring, the score sweep, moves.
7. **Stage-version supersede (diff stages only).** When a web/vendor/rank diff runs under a newer stage version, the same subject's detected changes from older versions become `status: 'superseded'`; each of their events loses that evidence link and is retracted (`reason: 'superseded'`) once no live evidence remains. A tag-stage bump still does not re-tag already-tagged changes (they are not `pending`); recorded as a known limitation.
8. **`decision_review` resolution.** `resolveDecisionReview()` takes the AM's answers (validated against the sample's questions, or the known tag questions when no sample exists), merges them over the model's answers and applies them: a rejected web change is detached from its event (event retracted when no evidence remains); a cosmetic change the AM calls meaningful becomes an event (no merge attempt — a human-created event stands alone); a changed type/service updates the event, clears `needs_review` and deletes its scores, then the event is re-scored. The AM's answers become labels on the linked sample. A human "not meaningful" is honoured even on a money change (the money rule binds models, not people). The AM UI is Phase 5; until then the `decisions` CLI is the interface.
9. **Anthropic Message Batches is opt-in.** Provider `anthropic`, `mode: batch`, through the official `@anthropic-ai/sdk` (`client.messages.batches.create/retrieve/results`). Task `theme_discovery_batch` (model `claude-sonnet-5`, the model the spec already chose for theme discovery; batch prices $1/$5 per MTok = 50% of list). Used only when `ANTHROPIC_API_KEY` is set; otherwise theme discovery stays synchronous on OpenRouter exactly as in 3c. Batch requests are not covered by OpenRouter's zero-data-retention routing — Anthropic's standard API retention applies; inputs are already redacted by `redactForModel` (accepted by the owner 2026-10-02).
10. **Batched theme discovery.** The nightly run submits one batch with one request per vertical (`custom_id` = vertical id) and records a `model_batch` row; a vertical with a batch in flight is skipped. `model-batch-poll` (cron `*/15 * * * *`) applies ended batches with the same validation as the sync path; a failed or expired request writes nothing, so its reviews are offered again the next night. A batch still unfinished 26 hours after submission is marked `failed` (Anthropic's limit is 24 h).
11. **Score backoff.** A failed (event, client) score writes `score_failure` (attempts, error); the sweep and `scoreEvent` skip a pair until `RETRY_BACKOFF_MINUTES × 2^(attempts−1)` has passed and give up after `MAX_STAGE_ATTEMPTS` — the same curve as the stage sweep. Success deletes the row.
12. **Late-linked clients get recent history.** The score sweep also offers an event created outside `SCORE_WINDOW_DAYS` when the client's link to the competitor is younger than `SCORE_WINDOW_DAYS` and the event occurred in the last `LATE_LINK_LOOKBACK_DAYS` (90, the moves window). Routing's `alert_max_age_days` cap (3b) already stops those from paging anyone.
13. **Score thresholds are validated twice.** The DB rejects malformed `client.score_thresholds` (CHECK: numbers, 0 ≤ brief < alert ≤ 100); `scoreForClient` also falls back to the pack's routing with a warning if a row somehow holds bad values.
14. **Re-extraction replaces blocks.** `ensureBlocks` under a new `EXTRACTOR_VERSION` deletes the capture's old `capture_block` rows before inserting the new ones (embeddings are recomputed on the next diff — a small paid cost). `EXTRACTOR_VERSION` → 2 for the consent-token fix; volatile learning only reads captures extracted under the current version.
15. **Volatile learning follows alignment chains.** Consecutive captures are aligned with `alignBlocks`; a block keeps its identity across captures through unchanged/modified alignments, so an insertion at the top no longer looks like every block changing. A chain is volatile when it changed in ≥ 3 of the last 5 transitions and none of its changes is an event **or still pending**. A mask expires when its block has not changed across the full window (or no longer exists); `unmaskBlock()` lets an AM unmask by hand and that block is never auto-masked again (`volatile_block.unmasked_at`).
16. **The churn guard runs before paid work.** Churn = added + removed + same-key rewrites (shape similarity < `MOVE_SIMILARITY`). On a churned page only money changes are embedded and gated (numbers by rules only, no LLM fallback); every other candidate is stored as a `suppressed` detected change (flag `churn`, never tagged, capped at 200) so nothing is silently lost.
17. **ZIPs need context.** A 5-digit number counts as a ZIP only after a state (abbreviation or name) or "ZIP/postal code", or inside a list of ≥ 2 such numbers; never next to a unit (BTU, sq ft, miles, SEER…), a `$`, or as part of a phone/decimal. ZIP+4 and sentence-final ZIPs are read.
18. **Crawler conduct after redirects.** The polite renderer re-checks the final URL: another site → capture `error` ("redirected off-site"); a robots-disallowed path → `robots_disallowed`. Sitemap fetches do the same with the fetch's final URL. The single request that followed the site's own redirect is not prevented (Playwright follows it), only its content is discarded — recorded limitation.
19. **Discovery records a failed homepage.** When the homepage render is not `ok`, discovery upserts the home `tracked_page` (never changing an existing row) and records a capture with that status, so "site blocks monitoring" is visible before onboarding UI exists.
20. **Who may accept a competitor suggestion:** agency admins and account managers; a client owner only with the `manage_competitors` feature; never a client viewer (`ToolError('permission_denied')`).
21. **`app_user` loses table-wide UPDATE on `client`** and gets it back column by column (`name, vertical_id, features, services, keywords, service_area, place_id, score_thresholds`) — `self_competitor_id` and `agency_id` are service-role only. `theme_proposal` stays invisible to tenant roles (no policy): proposals are platform data, approved through the service role (Phase 5 builds the AM screen on that).
22. **Self-business naming.** A competitor that is any client's self business takes its public GBP title as its name on each GBP pull, so a client's private `client.name` never stays on a row another agency can see.

**Not in 3d (stay in the roadmap carry-over):** tag-stage version retraction (decision 7); re-linking a competitor whose `place_id` changed; per-pack review-spike thresholds; GBP category/service grouping per capture; Google advertiser mode switch retirement; `price_block_map` re-mapping on catalogue changes; a page-level lock for concurrent price jobs; least-privilege worker role; `client_competitor` insert gating (Phase 5); the volatile/decision-review/theme AM screens (Phase 5); the 3b/3c per-task minors not listed in the scope table.

---

## Global Constraints

- All Phase 1–3c Global Constraints apply: tenant isolation below the model, service-role-only writes to global tables, never edit applied migrations (`cs_dev` is at `0024`; this plan adds `0025`–`0026`), Neon `cs_test` for tests via the repo-root `.env`, commit trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- **Stages are idempotent** (spec §6): claim via `runStage` (`packages/engine/src/stage.ts`); never call a model inside a DB transaction; outputs and the `done` marker commit together; `MAX_STAGE_ATTEMPTS = 5`.
- **No PII or health details to any model** (spec §4.5): every text placed in a decision state, chat message, batch request or embedding input goes through `redactForModel` (`@cs/collectors`) with the business's own name(s) as `businessNames`. Decision samples store states that were already redacted at the call site — never re-read raw text into a sample.
- **Model routing lives only in `packages/ai/config/ai.yaml`.** Global (competitor-level) work attributes ledger rows to `{ agencyId: null, clientId: null }`.
- **A model-ops failure never changes or fails the business decision:** shadow calls, sample writes and label writes are best-effort around the real result.
- **Weights, curves and thresholds live in the vertical pack YAML** where they are per vertical; engine windows and minimum counts are engine constants.
- **Line endings are LF**; `git ls-files --eol | grep crlf` must print nothing.
- **Never point the web crawler at real competitors** until `https://rivalmonday.com/bot` exists. Task 17 uses existing `cs_dev` data and model calls only.
- **Run the full test suite with `run_in_background`** (`pnpm typecheck && pnpm test`, ~11 minutes) and wait for its completion notice; never start a second run meanwhile (they collide on `cs_test`). Neon occasionally times out (`ETIMEDOUT`) — re-run that package once. Focused runs: `pnpm --filter <pkg> exec vitest run <pattern>`.
- **Dates in tests:** `day(n)` from `packages/engine/test/seed.ts` is 2026-10-01 06:00 UTC + n days. Functions that compare against the clock take an explicit `now` option; pass it in tests.

## Review Focus

1. **A shadow call or sample write that fails** (LLM outage during a sampled call, DB error on `decision_sample`) — the stage must still get the same decision it would have got without sampling, and must not fail. Pinned in Task 3.
2. **An AM rejecting one change of a merged event** (a web price cut merged with an ad) — only that change is detached; the event stays live on its other evidence, keeps its scores until re-scored, and is retracted only when no evidence is left. Pinned in Task 6.
3. **A `WEB_DIFF_VERSION` bump re-diffing a capture whose old event was merged with another channel's change** — the old web change is superseded and detached, the event survives on the ad change; a web-only event is retracted and disappears from scoring, merge and moves. Pinned in Task 5.
4. **A list item inserted at the top of a page** (every positional `li#n` key shifts) — no block is masked and no existing mask is dropped because of the shift. Pinned in Task 12.
5. **A batch result for a vertical that got a proposal meanwhile, or a batch that expires** — no second pending proposal, no crash, and an expired/failed request leaves its reviews eligible for the next night. Pinned in Task 9.

---

## File map

```
packages/ai/package.json                                + @anthropic-ai/sdk (Task 8)
packages/ai/config/ai.yaml                              per-use tasks (1), shadow_rate (3), theme_discovery_batch (8)
packages/ai/src/config.ts                               shadow_rate (3), anthropic provider (8)
packages/ai/src/decisions/cascade.ts                    DecisionTrace, shadow resolve, sampleId (3)
packages/ai/src/ai.ts                                   shadow sampling + samples sink (3), batch methods (8)
packages/ai/src/env.ts                                  AI_SHADOW_RATE, samples sink, ANTHROPIC_API_KEY (3, 8)
packages/ai/src/anthropic-batch.ts                      BatchProvider over @anthropic-ai/sdk (8)
packages/core/src/ledger.ts                             DecisionSampleRecord, DecisionSampleSink (3)
packages/db/src/schema/model-ops.ts                     decision_sample, decision_label, model_batch, score_failure (2)
packages/db/src/schema/engine.ts                        event.retracted_at, decision_review.sample_id/resolved_by/resolution, volatile_block.unmasked_at (2)
packages/db/src/schema/tenancy.ts                       client score_thresholds CHECK (2)
packages/db/migrations/0025_model_ops.sql (generated), 0026_model_ops_rls.sql (custom)
packages/db/src/ledger.ts                               createDecisionSampleSink (3)
packages/db/src/model-ops.test.ts                       (2)
packages/engine/src/tag/tag-stage.ts                    tag_decisions (1), sampleId (3), webEventValues (6)
packages/engine/src/tag/structured.ts                   structured_decisions (1), sampleId (3)
packages/engine/src/merge/merge.ts                      merge_decisions (1), skip retracted (5)
packages/engine/src/events/retract.ts                   retractEvent, detachChange, supersedePriorChanges (5)
packages/engine/src/model-ops/labels.ts                 export/import labels, CSV (4)
packages/engine/src/model-ops/report.ts                 accuracy + ECE report (4)
packages/engine/src/model-ops/resolve.ts                resolveDecisionReview, listOpenReviews (6)
packages/engine/src/model-ops/batches.ts                collectModelBatches (9)
packages/engine/src/reviews/discovery.ts                prepare/apply split, batched submit (9)
packages/engine/src/score/score-stage.ts                retracted skip (5), score_failure backoff (10)
packages/engine/src/score/score.ts                      threshold fallback (10)
packages/engine/src/sweep.ts                            retracted (5), score backoff, vertical filter, late links (10)
packages/engine/src/stage.ts                            RETRY_BACKOFF_MINUTES moves here (10)
packages/engine/src/web/blocks.ts                       replace blocks on re-extraction (11)
packages/engine/src/web/extract.ts                      camelCase consent tokens, EXTRACTOR_VERSION 2 (11)
packages/engine/src/web/volatile.ts                     alignment chains, expiry, unmaskBlock (12)
packages/engine/src/web/diff-stage.ts                   supersede (5), churn guard (13)
packages/engine/src/structured/vendor-diff.ts, rank.ts  supersede (5)
packages/engine/src/moves/moves-stage.ts                skip retracted (5)
packages/engine/src/geo/zips.ts                         extractZips (14; moved out of tag-stage.ts)
packages/engine/src/prices/observe.ts                   off-season, was/now (16)
packages/collectors/src/discovery/classify.ts           page_decisions (1), businessNames (15)
packages/collectors/src/discovery/discover.ts           homepage status, name (15)
packages/collectors/src/web/polite.ts, user-agent.ts    redirect checks (15)
packages/collectors/src/local/accept.ts                 role checks (16)
packages/collectors/src/gbp/collect-gbp.ts              self-business naming (16)
apps/worker/src/cli/decisions.ts, decisions-args.ts     decisions CLI (7)
apps/worker/src/jobs/model-ops.ts                       model-batch-poll job (9)
apps/worker/src/deps.ts, main.ts                        samples sink, batches, store for discovery (3, 9, 15)
docs/HANDOVER.md, docs/superpowers/plans/2026-09-29-roadmap.md, docs/research/2026-09-30-phase-2-vendor-apis.md (17)
```

---

### Task 1: One routed task per decision use

**Files:**
- Modify: `packages/ai/config/ai.yaml`
- Modify: `packages/engine/src/tag/tag-stage.ts:121`, `packages/engine/src/tag/structured.ts:151`, `packages/engine/src/merge/merge.ts:96`, `packages/collectors/src/discovery/classify.ts:26`
- Test: `packages/ai/src/config.test.ts`, `packages/engine/src/tag/tag-stage.test.ts`, `packages/engine/src/tag/structured.test.ts`, `packages/engine/src/merge/merge.test.ts`, `packages/engine/src/engine.live.test.ts`

**Interfaces:**
- Produces: `ai.yaml` tasks `tag_decisions`, `structured_decisions`, `merge_decisions`, `page_decisions` (all `provider: jev`, `escalate_to: llm_decisions`); the `decisions` task no longer exists. Exported constants `TAG_DECISION_TASK = 'tag_decisions'` (tag-stage.ts), `STRUCTURED_DECISION_TASK = 'structured_decisions'` (structured.ts), `MERGE_DECISION_TASK = 'merge_decisions'` (merge.ts), `PAGE_DECISION_TASK = 'page_decisions'` (classify.ts).

- [ ] **Step 1: Write the failing config test**

In `packages/ai/src/config.test.ts`, replace the task list in `'loads the shipped default config'` and add a test below it:

```ts
  it('loads the shipped default config', async () => {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    for (const task of ['brief_writer', 'ask_assistant', 'value_extract', 'theme_discovery', 'llm_decisions', 'review_decisions', 'price_decisions']) {
      expect(cfg.tasks[task]).toBeDefined();
    }
    expect(cfg.tasks.embeddings).toMatchObject({ provider: 'openrouter', mode: 'embeddings', model: 'openai/text-embedding-3-small', dimensions: 512 });
  });

  it('gives every decision use its own Jev task escalating to llm_decisions, and no shared "decisions" task (Phase 3d)', async () => {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    for (const name of ['tag_decisions', 'structured_decisions', 'merge_decisions', 'page_decisions', 'review_decisions', 'price_decisions']) {
      const t = cfg.tasks[name];
      expect(t?.provider, name).toBe('jev');
      if (t?.provider === 'jev') expect(t.escalate_to, name).toBe('llm_decisions');
    }
    expect(cfg.tasks.decisions).toBeUndefined();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/ai exec vitest run config`
Expected: FAIL — `tag_decisions` is undefined and `decisions` is still defined.

- [ ] **Step 3: Update `ai.yaml`**

Replace the `decisions:` line and the 3c per-use comment block with:

```yaml
  # Per-use decision tasks (Phase 3c/3d): each decision type routes, escalates and is shadow-sampled on its own,
  # so it can move to the LLM by config alone (spec §7.3). There is no shared "decisions" task.
  tag_decisions:        { provider: jev, model: jev-latest, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
  structured_decisions: { provider: jev, model: jev-latest, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
  merge_decisions:      { provider: jev, model: jev-latest, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
  page_decisions:       { provider: jev, model: jev-latest, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
  review_decisions:     { provider: jev, model: jev-latest, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
  price_decisions:      { provider: jev, model: jev-latest, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
```

- [ ] **Step 4: Point each call site at its task**

`packages/engine/src/tag/tag-stage.ts` — add next to `TAG_VERSION`:

```ts
/** ai.yaml task for web-change tagging decisions (Phase 3d: one task per decision use). */
export const TAG_DECISION_TASK = 'tag_decisions';
```
and change line 121 to `const result = await deps.ai.decide(TAG_DECISION_TASK, state, buildTagQuestions(packs), PLATFORM);`.

`packages/engine/src/tag/structured.ts` — add `export const STRUCTURED_DECISION_TASK = 'structured_decisions';` near the top and use it at line 151.

`packages/engine/src/merge/merge.ts` — add `export const MERGE_DECISION_TASK = 'merge_decisions';` next to `MERGE_WINDOW_DAYS` and use it at line 96.

`packages/collectors/src/discovery/classify.ts` — add `export const PAGE_DECISION_TASK = 'page_decisions';` and pass it as the first argument of `ai.decide`.

`packages/engine/src/engine.live.test.ts:37` — `ai.decide('tag_decisions', …)`. Leave `packages/ai/src/ai.test.ts`, `ai.models.test.ts` and `env.test.ts` alone: they parse their own inline configs that still define a task called `decisions`.

- [ ] **Step 5: Pin the task names at the call sites**

Append to the existing `it(...)` at `packages/engine/src/tag/tag-stage.test.ts:39` (the one that builds `const ai = createFakeAi(...)`), after its last `expect`:

```ts
    expect(ai.calls.decide.map((c) => c.task)).toEqual(['tag_decisions']);
```

In `packages/engine/src/tag/structured.test.ts` and `packages/engine/src/merge/merge.test.ts`, in the first test that asserts on a model decision, add the equivalent line with `'structured_decisions'` / `'merge_decisions'` (`grep -n "calls.decide" <file>` finds the fake's variable).

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @cs/ai exec vitest run config && pnpm --filter @cs/engine exec vitest run tag merge && pnpm --filter @cs/collectors exec vitest run discover && pnpm typecheck`
Expected: PASS. `grep -rn "'decisions'" packages apps --include=*.ts` now lists only `ai.test.ts`, `ai.models.test.ts`, `env.test.ts` (inline configs) and `llm.ts` (the JSON schema name).

- [ ] **Step 7: Commit**

```bash
git add packages/ai/config/ai.yaml packages/ai/src/config.test.ts packages/engine/src packages/collectors/src/discovery/classify.ts
git commit -m "feat(ai): one routed decision task per use (tag, structured, merge, page)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Schema — samples, labels, batches, retraction, score failures, client guards

**Files:**
- Create: `packages/db/src/schema/model-ops.ts`
- Modify: `packages/db/src/schema/engine.ts`, `packages/db/src/schema/tenancy.ts`, `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0025_model_ops.sql` (generated), `packages/db/migrations/0026_model_ops_rls.sql` (custom)
- Test: `packages/db/src/model-ops.test.ts`; modify `packages/db/src/evidence.test.ts` (privilege guard)

**Interfaces:**
- Produces (Drizzle, exported from `@cs/db`): `decisionSample`, `decisionLabel`, `modelBatch`, `scoreFailure`; types `SampleAnswers`, `DecisionSampleReason = 'shadow' | 'review'`, `LabelSource = 'human' | 'review'`, `ModelBatchStatus = 'submitted' | 'ended' | 'failed'`; new columns `changeEvent.retractedAt`, `changeEvent.retractionReason`, `decisionReview.sampleId`, `decisionReview.resolvedBy`, `decisionReview.resolution`, `volatileBlock.unmaskedAt`. `detected_change.status` gains the values `superseded` and `suppressed` (text column, documentation only).

- [ ] **Step 1: Write the failing schema test**

Create `packages/db/src/model-ops.test.ts`:

```ts
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { changeEvent, client, decisionLabel, decisionSample, modelBatch, scoreFailure, themeProposal } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const sample = () =>
  dbs.service
    .insert(decisionSample)
    .values({ task: 'tag_decisions', reason: 'shadow', state: { after: 'AC tune-up $79' }, questions: { meaningful: { type: 'noul' } }, final: { meaningful: { value: true } } })
    .returning({ id: decisionSample.id });

describe('model-ops schema', () => {
  it('stores a sample with one label per question key', async () => {
    const [s] = await sample();
    await dbs.service.insert(decisionLabel).values({ sampleId: s!.id, questionKey: 'meaningful', value: 'true', source: 'human', labeledBy: 'owner' });
    const text = await errorText(dbs.service.insert(decisionLabel).values({ sampleId: s!.id, questionKey: 'meaningful', value: 'false', source: 'human', labeledBy: 'owner' }));
    expect(text).toMatch(/duplicate key/i);
  });

  it('keeps samples, labels, batches and score failures away from app_user', async () => {
    const [s] = await sample();
    await dbs.service.insert(modelBatch).values({ task: 'theme_discovery_batch', provider: 'anthropic', providerBatchId: 'msgbatch_1', purpose: 'theme_discovery', items: {}, requestCount: 0 });
    for (const table of [decisionSample, decisionLabel, modelBatch, scoreFailure]) {
      const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(table));
      expect(rows).toEqual([]);
    }
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(decisionLabel).values({ sampleId: s!.id, questionKey: 'x', value: 'y', source: 'human', labeledBy: 'me' })))).toMatch(/permission denied/i);
  });

  it('theme proposals are invisible to tenant roles (platform data, approved through the service role)', async () => {
    await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'warranty', name: 'Warranty', description: 'd', status: 'proposed', otherCount: 20, sampleReviewIds: [] });
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(themeProposal));
    expect(rows).toEqual([]);
  });

  it('rejects malformed client score thresholds', async () => {
    for (const bad of [{ alert: 40, brief: 70 }, { alert: 120, brief: 40 }, { alert: '70', brief: 40 }, { alert: 70 }]) {
      const text = await errorText(dbs.owner.update(client).set({ scoreThresholds: bad as never }).where(sql`id = ${IDS.clientA1}`));
      expect(text, JSON.stringify(bad)).toMatch(/client_score_thresholds_check/);
    }
    await dbs.owner.update(client).set({ scoreThresholds: { alert: 80, brief: 50 } }).where(sql`id = ${IDS.clientA1}`);
  });

  it('app_user may update ordinary client columns but not self_competitor_id or agency_id', async () => {
    const ctx = { agencyId: IDS.agencyA, clientScope: 'all' as const };
    await withTenant(dbs.app, ctx, (tx) => tx.update(client).set({ name: 'A1 HVAC & Air' }).where(sql`id = ${IDS.clientA1}`));
    expect(await errorText(withTenant(dbs.app, ctx, (tx) => tx.update(client).set({ selfCompetitorId: IDS.competitorY }).where(sql`id = ${IDS.clientA1}`)))).toMatch(/permission denied/i);
    expect(await errorText(withTenant(dbs.app, ctx, (tx) => tx.update(client).set({ agencyId: IDS.agencyB }).where(sql`id = ${IDS.clientA1}`)))).toMatch(/permission denied/i);
  });

  it('events carry a retraction marker', async () => {
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date(), retractedAt: new Date(), retractionReason: 'superseded' })
      .returning({ r: changeEvent.retractionReason });
    expect(ev?.r).toBe('superseded');
  });
});
```

In `packages/db/src/evidence.test.ts`, add after `'app_user can UPDATE only the status column of competitor_suggestion'`:

```ts
  it('app_user can UPDATE only the editable columns of client (never self_competitor_id or agency_id)', async () => {
    const rows = (await dbs.owner.execute(sql`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'app_user' AND table_schema = 'public' AND table_name = 'client' AND privilege_type = 'UPDATE'
      ORDER BY column_name`)) as unknown as { column_name: string }[];
    expect(rows.map((r) => r.column_name)).toEqual(['features', 'keywords', 'name', 'place_id', 'score_thresholds', 'service_area', 'services', 'vertical_id']);
  });
```

Also update the allow-list comment above `allowList`: `client UPDATE` is now column-level (0026) — the `(client, UPDATE)` pair stays in the list because `has_any_column_privilege` reports it.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cs/db exec vitest run model-ops evidence`
Expected: FAIL — `decisionSample` is not exported.

- [ ] **Step 3: Add the schema**

Create `packages/db/src/schema/model-ops.ts`:

```ts
import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { changeEvent } from './engine';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type DecisionSampleReason = 'shadow' | 'review';
export type LabelSource = 'human' | 'review';
export type ModelBatchStatus = 'submitted' | 'ended' | 'failed';

/** One provider's answers inside a sample (answers keyed by question key, as returned by @cs/ai). */
export interface SampleAnswers {
  provider: string;
  answers: Record<string, unknown>;
}

/**
 * A decision kept for evaluation (spec §7.3 shadow evaluation): a sampled call answered by both providers,
 * or a call still below threshold after the cascade. The state was redacted at the call site. Service role only.
 */
export const decisionSample = pgTable(
  'decision_sample',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task: text('task').notNull(),
    reason: text('reason').$type<DecisionSampleReason>().notNull(),
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => client.id, { onDelete: 'cascade' }),
    state: jsonb('state').$type<unknown>().notNull(),
    questions: jsonb('questions').$type<Record<string, unknown>>().notNull(),
    primary: jsonb('primary_answers').$type<SampleAnswers | null>(),
    fallback: jsonb('fallback_answers').$type<SampleAnswers | null>(),
    final: jsonb('final_answers').$type<Record<string, unknown>>().notNull(),
    needsReview: jsonb('needs_review').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('decision_sample_task_idx').on(t.task, t.createdAt)],
);

/** A human gold label for one question of a sample (CSV import or a resolved decision_review). Service role only. */
export const decisionLabel = pgTable(
  'decision_label',
  {
    sampleId: uuid('sample_id').notNull().references(() => decisionSample.id, { onDelete: 'cascade' }),
    questionKey: text('question_key').notNull(),
    /** 'true'/'false' for a Noul, the option id for a Choice, the level index for a Score. */
    value: text('value').notNull(),
    source: text('source').$type<LabelSource>().notNull(),
    labeledBy: text('labeled_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sampleId, t.questionKey] })],
);

/** An asynchronous provider batch (Anthropic Message Batches) and what each custom_id stands for. Service role only. */
export const modelBatch = pgTable(
  'model_batch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task: text('task').notNull(),
    provider: text('provider').notNull(),
    providerBatchId: text('provider_batch_id').notNull().unique(),
    purpose: text('purpose').notNull(), // 'theme_discovery'
    status: text('status').$type<ModelBatchStatus>().notNull().default('submitted'),
    /** custom_id → the context needed to apply that request's result. */
    items: jsonb('items').$type<Record<string, unknown>>().notNull(),
    requestCount: integer('request_count').notNull(),
    error: text('error'),
    createdAt: ts('created_at').notNull().defaultNow(),
    endedAt: ts('ended_at'),
  },
  (t) => [index('model_batch_status_idx').on(t.status, t.createdAt)],
);

/** Backoff state of a failing (event, client) score (Phase 3d decision 11). Deleted on success. Service role only. */
export const scoreFailure = pgTable(
  'score_failure',
  {
    eventId: uuid('event_id').notNull().references(() => changeEvent.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(1),
    error: text('error'),
    failedAt: ts('failed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.clientId] }),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
  ],
);
```

Export it from `packages/db/src/schema/index.ts` (`export * from './model-ops';`).

In `packages/db/src/schema/engine.ts`:
- `changeEvent`: add after `needsReview`:
  ```ts
    /** Soft retraction (Phase 3d): superseded by a newer stage version, or rejected by an AM. Every reader excludes it. */
    retractedAt: ts('retracted_at'),
    retractionReason: text('retraction_reason'), // 'superseded' | 'review'
  ```
- `decisionReview`: add after `resolvedAt` (import `decisionSample` from `./model-ops`):
  ```ts
    sampleId: uuid('sample_id').references((): AnyPgColumn => decisionSample.id, { onDelete: 'set null' }),
    resolvedBy: text('resolved_by'),
    /** The AM's answers, keyed by question key. */
    resolution: jsonb('resolution').$type<Record<string, string | boolean>>(),
  ```
  (`AnyPgColumn` from `drizzle-orm/pg-core` avoids the engine.ts ↔ model-ops.ts import cycle at type level.)
- `volatileBlock`: add `unmaskedAt: ts('unmasked_at'), // set by an AM unmask: the block is never auto-masked again`.
- `detectedChange.status` comment: `// pending | event | cosmetic | superseded | suppressed`.

In `packages/db/src/schema/tenancy.ts`, add to the `client` table's constraint list (import `check`):

```ts
    // Phase 3d decision 13: numbers, 0 ≤ brief < alert ≤ 100.
    check(
      'client_score_thresholds_check',
      sql`score_thresholds IS NULL OR (
        jsonb_typeof(score_thresholds->'alert') = 'number' AND jsonb_typeof(score_thresholds->'brief') = 'number'
        AND (score_thresholds->>'brief')::numeric >= 0 AND (score_thresholds->>'alert')::numeric <= 100
        AND (score_thresholds->>'brief')::numeric < (score_thresholds->>'alert')::numeric)`,
    ),
```

- [ ] **Step 4: Generate the migrations**

Run: `pnpm --filter @cs/db generate --name=model_ops` → `0025_model_ops.sql`. Open it: it must create the four tables, add the five columns and the CHECK, and nothing else (if drizzle-kit orders a composite FK before the unique constraint it needs, reorder by hand — see HANDOVER §6).

Run: `pnpm --filter @cs/db generate --custom --name=model_ops_rls` and write `0026_model_ops_rls.sql`:

```sql
REVOKE INSERT, UPDATE, DELETE ON decision_sample, decision_label, model_batch, score_failure FROM app_user;
--> statement-breakpoint
ALTER TABLE decision_sample ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_sample FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_label ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_label FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE model_batch ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE model_batch FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE score_failure ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE score_failure FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Phase 3d decision 21: a table-wide UPDATE let app_user point client.self_competitor_id at any competitor and so
-- gain RLS visibility of it. Postgres has no column-level REVOKE finer than the table grant, so revoke the table
-- grant and re-grant the editable columns one by one.
REVOKE UPDATE ON client FROM app_user;
--> statement-breakpoint
GRANT UPDATE (name, vertical_id, features, services, keywords, service_area, place_id, score_thresholds) ON client TO app_user;
```

No policies are created for the four new tables: with forced RLS, tenant roles see no rows (app_service bypasses RLS).

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/db test`
Expected: PASS, including the RLS guard (`every table in the public schema enables and forces row-level security`) and the privilege guard.

- [ ] **Step 6: Migrate `cs_dev` and commit**

Run: `pnpm db:migrate` (applies `0025`–`0026` to `cs_dev`; the verification client's `score_thresholds` is NULL, so the CHECK passes).

```bash
git add packages/db
git commit -m "feat(db): decision samples/labels, model batches, score failures, event retraction, client column grants

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Shadow sampling in `decide()` and the sample sink

**Files:**
- Modify: `packages/core/src/ledger.ts`, `packages/ai/src/config.ts`, `packages/ai/src/decisions/cascade.ts`, `packages/ai/src/ai.ts`, `packages/ai/src/env.ts`, `packages/ai/config/ai.yaml`
- Modify: `packages/db/src/ledger.ts` (sink), `packages/engine/src/tag/tag-stage.ts`, `packages/engine/src/tag/structured.ts` (link `decision_review.sample_id`), `apps/worker/src/deps.ts`, `apps/worker/src/cli/engine-once.ts` (pass the sink)
- Test: `packages/ai/src/decisions/cascade.test.ts`, `packages/ai/src/shadow.test.ts` (new), `packages/db/src/model-ops.test.ts`, `packages/engine/src/tag/tag-stage.test.ts`

**Interfaces:**
- Consumes: `decisionSample` (Task 2), `decisionReview.sampleId` (Task 2).
- Produces:
  - `@cs/core`: `interface DecisionSampleRecord extends CallScope { task: string; reason: 'shadow' | 'review'; state: unknown; questions: Record<string, unknown>; primary: { provider: string; answers: Record<string, unknown> } | null; fallback: { provider: string; answers: Record<string, unknown> } | null; final: Record<string, unknown>; needsReview: string[] }`, `interface DecisionSampleSink { recordDecisionSample(record: DecisionSampleRecord): Promise<string> }`.
  - `@cs/ai`: `DecisionResult<K>` gains `trace?: DecisionTrace` and `sampleId?: string | null`; `interface DecisionTrace { primary: ProviderAnswers | null; fallback: ProviderAnswers | null }`, `interface ProviderAnswers { provider: string; answers: Record<string, DecisionAnswer> }`; `CascadingDecisionProvider.decide(state, questions, opts?: { shadow?: boolean })`; `AiDeps` gains `samples?: DecisionSampleSink`, `random?: () => number`, `shadowRateOverride?: number`; jev tasks gain `shadow_rate`; `createAiFromEnv(env, config, ledger, samples?)` (reads `AI_SHADOW_RATE`).
  - `@cs/db`: `createDecisionSampleSink(db: Db): DecisionSampleSink`.

- [ ] **Step 1: Write the failing cascade tests**

Add to `packages/ai/src/decisions/cascade.test.ts` (self-contained; merge the imports with the file's own):

```ts
import { describe, expect, it, vi } from 'vitest';
import { CascadingDecisionProvider } from './cascade';
import type { DecisionProvider, DecisionQuestion } from './types';

const qs = { a: { type: 'noul', instructions: 'A?' }, b: { type: 'noul', instructions: 'B?' } } satisfies Record<string, DecisionQuestion>;
const fixed = (id: string, conf: Record<string, number>, fail = false): DecisionProvider => ({
  id,
  decide: vi.fn(async (_s: unknown, q: Record<string, DecisionQuestion>) => {
    if (fail) throw new Error(`${id} down`);
    const answers = Object.fromEntries(Object.keys(q).map((k) => [k, { type: 'noul', value: true, probability: 0.5 + conf[k]! / 2, confidence: conf[k]! }]));
    return { answers, model: id, inputTokens: 1, outputTokens: 1, costUsd: 0 };
  }) as unknown as DecisionProvider['decide'],
});

describe('CascadingDecisionProvider trace and shadow mode', () => {
  it('traces the primary answers for every key and the fallback answers for escalated keys only', async () => {
    const r = await new CascadingDecisionProvider(fixed('jev', { a: 0.95, b: 0.2 }), fixed('llm', { a: 0.9, b: 0.9 }), { default: 0.85 }).decide('s', qs);
    expect(Object.keys(r.trace!.primary!.answers)).toEqual(['a', 'b']);
    expect(Object.keys(r.trace!.fallback!.answers)).toEqual(['b']);
    expect([r.answers.a.provider, r.answers.b.provider]).toEqual(['jev', 'llm']);
  });

  it('in shadow mode asks both providers every question and resolves exactly like the cascade', async () => {
    const llm = fixed('llm', { a: 0.9, b: 0.9 });
    const r = await new CascadingDecisionProvider(fixed('jev', { a: 0.95, b: 0.2 }), llm, { default: 0.85 }).decide('s', qs, { shadow: true });
    expect(Object.keys((llm.decide as ReturnType<typeof vi.fn>).mock.calls[0]![1])).toEqual(['a', 'b']);
    expect(Object.keys(r.trace!.fallback!.answers)).toEqual(['a', 'b']);
    expect([r.answers.a.provider, r.answers.b.provider]).toEqual(['jev', 'llm']);
    expect(r.needsReview).toEqual([]);
  });

  it('in shadow mode a failed LLM leaves the Jev decision untouched', async () => {
    const r = await new CascadingDecisionProvider(fixed('jev', { a: 0.95, b: 0.2 }), fixed('llm', {}, true), { default: 0.85 }).decide('s', qs, { shadow: true });
    expect([r.answers.a.provider, r.answers.b.provider]).toEqual(['jev', 'jev']);
    expect(r.needsReview).toEqual(['b']);
    expect(r.trace!.fallback).toBeNull();
  });

  it('in shadow mode a failed Jev falls back to the LLM, and both failing rethrows the Jev error', async () => {
    const r = await new CascadingDecisionProvider(fixed('jev', {}, true), fixed('llm', { a: 0.9, b: 0.9 }), { default: 0.85 }).decide('s', qs, { shadow: true });
    expect(r.answers.a.provider).toBe('llm');
    await expect(new CascadingDecisionProvider(fixed('jev', {}, true), fixed('llm', {}, true), { default: 0.85 }).decide('s', qs, { shadow: true })).rejects.toThrow('jev down');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/ai exec vitest run cascade`
Expected: FAIL — `trace` is undefined.

- [ ] **Step 3: Implement trace and shadow mode in `cascade.ts`**

Replace the body of `cascade.ts` below `thresholdFor`/`pick` with:

```ts
export interface ProviderAnswers {
  provider: string;
  answers: Record<string, DecisionAnswer>;
}

/** What each provider answered (spec §7.3 shadow evaluation). Fallback holds only the keys it was asked. */
export interface DecisionTrace {
  primary: ProviderAnswers | null;
  fallback: ProviderAnswers | null;
}

export interface DecisionResult<K extends string> {
  answers: Record<K, ResolvedAnswer>;
  /** Questions still below threshold after all providers: route to the AM review queue. */
  needsReview: K[];
  trace?: DecisionTrace;
  /** decision_sample row recorded for this call (shadow sample or still-needs-review), if any. */
  sampleId?: string | null;
}

/** Jev → (low confidence or failure) LLM → (still low) human review (spec §7.3). */
export class CascadingDecisionProvider {
  constructor(
    private readonly primary: DecisionProvider,
    private readonly fallback: DecisionProvider | null,
    private readonly thresholds: ConfidenceThresholds,
  ) {}

  async decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>, opts: { shadow?: boolean } = {}): Promise<DecisionResult<K>> {
    if (opts.shadow && this.fallback) return this.decideShadow(state, questions, this.fallback);
    const keys = Object.keys(questions) as K[];
    const answers = {} as Record<K, ResolvedAnswer>;
    const isLow = (k: K) => answers[k].confidence < thresholdFor(this.thresholds, questions[k].type);
    const trace: DecisionTrace = { primary: null, fallback: null };

    let escalate: K[];
    try {
      const first = await this.primary.decide(state, questions);
      trace.primary = { provider: this.primary.id, answers: first.answers };
      for (const k of keys) answers[k] = { ...first.answers[k], provider: this.primary.id } as ResolvedAnswer;
      escalate = keys.filter(isLow);
    } catch (err) {
      if (!this.fallback) throw err;
      escalate = keys;
    }

    if (escalate.length > 0 && this.fallback) {
      const second = await this.fallback.decide(state, pick(questions, escalate));
      trace.fallback = { provider: this.fallback.id, answers: second.answers };
      for (const k of escalate) answers[k] = { ...second.answers[k], provider: this.fallback.id } as ResolvedAnswer;
    }

    return { answers, needsReview: keys.filter(isLow), trace };
  }

  /**
   * Shadow mode: both providers answer every question (in parallel); the result is resolved with the same rule as
   * the cascade (primary unless below threshold, then fallback). A failing fallback never changes the outcome.
   */
  private async decideShadow<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>, fallback: DecisionProvider): Promise<DecisionResult<K>> {
    const keys = Object.keys(questions) as K[];
    const [p, f] = await Promise.allSettled([this.primary.decide(state, questions), fallback.decide(state, questions)]);
    if (p.status === 'rejected' && f.status === 'rejected') throw p.reason;
    const trace: DecisionTrace = {
      primary: p.status === 'fulfilled' ? { provider: this.primary.id, answers: p.value.answers } : null,
      fallback: f.status === 'fulfilled' ? { provider: fallback.id, answers: f.value.answers } : null,
    };
    const answers = {} as Record<K, ResolvedAnswer>;
    const low = (a: DecisionAnswer | undefined, k: K) => !a || a.confidence < thresholdFor(this.thresholds, questions[k].type);
    for (const k of keys) {
      const pa = trace.primary?.answers[k];
      const fa = trace.fallback?.answers[k];
      answers[k] = (!low(pa, k) || !fa ? { ...pa!, provider: this.primary.id } : { ...fa, provider: fallback.id }) as ResolvedAnswer;
    }
    return { answers, needsReview: keys.filter((k) => answers[k].confidence < thresholdFor(this.thresholds, questions[k].type)), trace };
  }
}
```

Note the `!low(pa) || !fa` guard: when Jev failed (`pa` undefined) `fa` exists (both cannot be missing), so `pa!` is only read when it exists.

- [ ] **Step 4: Run the cascade tests**

Run: `pnpm --filter @cs/ai exec vitest run cascade`
Expected: PASS.

- [ ] **Step 5: Write the failing `Ai` shadow tests**

Create `packages/ai/src/shadow.test.ts`:

```ts
import type { DecisionSampleRecord, LedgerSink, LlmCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createAi } from './ai';
import type { ChatProvider } from './chat';
import { parseAiConfig } from './config';
import type { DecisionProvider, DecisionQuestion } from './decisions/types';

const config = parseAiConfig(`
tasks:
  llm_decisions: { provider: openrouter, model: a/small, mode: decisions }
  tag_decisions: { provider: jev, model: jev-1, escalate_to: llm_decisions, shadow_rate: 0.5 }
`);
const scope = { agencyId: null, clientId: null };
const q = { m: { type: 'noul', instructions: 'Meaningful?' } } satisfies Record<string, DecisionQuestion>;

function harness(opts: { jevP?: number; llmFails?: boolean; sinkFails?: boolean; random?: number; override?: number } = {}) {
  const ledgerRows: LlmCallRecord[] = [];
  const ledger: LedgerSink = { recordLlmCall: async (r) => { ledgerRows.push(r); }, recordVendorCall: async () => {} };
  const samples: DecisionSampleRecord[] = [];
  const sink = {
    recordDecisionSample: vi.fn(async (r: DecisionSampleRecord) => {
      if (opts.sinkFails) throw new Error('db down');
      samples.push(r);
      return `sample-${samples.length}`;
    }),
  };
  const complete = vi.fn(async (req: { model: string }) => {
    if (opts.llmFails) throw new Error('llm down');
    return { text: JSON.stringify({ m: { probability: 0.99 } }), model: req.model, inputTokens: 1, outputTokens: 1, costUsd: 0.001 };
  });
  const p = opts.jevP ?? 0.99;
  const jev: DecisionProvider = {
    id: 'jev',
    decide: (async () => ({ answers: { m: { type: 'noul', value: p >= 0.5, probability: p, confidence: Math.abs(p - 0.5) * 2 } }, model: 'jev-1', inputTokens: 1, outputTokens: 1, costUsd: 0 })) as unknown as DecisionProvider['decide'],
  };
  const ai = createAi(config, {
    openrouter: { id: 'openrouter', complete } as unknown as ChatProvider, jev: () => jev, ledger, samples: sink,
    random: () => opts.random ?? 0.9, shadowRateOverride: opts.override,
  });
  return { ai, samples, ledgerRows, complete, sink };
}

describe('Ai.decide shadow sampling (spec §7.3)', () => {
  it('does not sample above the rate and records nothing for a confident call', async () => {
    const h = harness({ random: 0.9 });
    const r = await h.ai.decide('tag_decisions', { after: 'x' }, q, scope);
    expect(r.sampleId).toBeUndefined();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.samples).toEqual([]);
  });

  it('samples below the rate: asks the LLM too, records both answer sets, ledgers the extra call as :shadow', async () => {
    const h = harness({ random: 0.1 });
    const r = await h.ai.decide('tag_decisions', { after: 'x' }, q, scope);
    expect(r.answers.m.provider).toBe('jev');
    expect(r.sampleId).toBe('sample-1');
    expect(h.samples[0]).toMatchObject({ task: 'tag_decisions', reason: 'shadow', state: { after: 'x' }, primary: { provider: 'jev' }, fallback: { provider: 'llm' }, needsReview: [] });
    expect(h.ledgerRows.map((x) => x.task).sort()).toEqual(['llm_decisions:shadow', 'tag_decisions']);
  });

  it('records a review sample (no extra call) when the cascade still needs review', async () => {
    // Jev at p=0.55 (confidence 0.1) escalates; the LLM at p=0.6 (confidence 0.2) is still below τ = 0.85.
    const h = harness({ jevP: 0.55, random: 0.9 });
    h.complete.mockImplementation(async (req: { model: string }) => ({ text: JSON.stringify({ m: { probability: 0.6 } }), model: req.model, inputTokens: 1, outputTokens: 1, costUsd: 0 }));
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.needsReview).toEqual(['m']);
    expect(h.samples[0]).toMatchObject({ reason: 'review', needsReview: ['m'], fallback: { provider: 'llm' } });
    expect(h.complete).toHaveBeenCalledTimes(1);
  });

  it('returns the decision unchanged when the sample write fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness({ random: 0.1, sinkFails: true });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.answers.m).toMatchObject({ value: true, provider: 'jev' });
    expect(r.sampleId).toBeNull();
    expect(err).toHaveBeenCalledWith('[ai] decision sample write failed', expect.any(Error));
    err.mockRestore();
  });

  it('returns the Jev decision when the shadow LLM call fails', async () => {
    const h = harness({ random: 0.1, llmFails: true });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.answers.m.provider).toBe('jev');
    expect(h.samples[0]).toMatchObject({ reason: 'shadow', fallback: null });
  });

  it('AI_SHADOW_RATE-style override replaces the configured rate', async () => {
    const h = harness({ random: 0.7, override: 1 });
    expect((await h.ai.decide('tag_decisions', {}, q, scope)).sampleId).toBe('sample-1');
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm --filter @cs/ai exec vitest run shadow`
Expected: FAIL — `shadow_rate` is not a known key / `samples` is not used.

- [ ] **Step 7: Implement**

`packages/core/src/ledger.ts` — append:

```ts
/** A decision kept for evaluation (spec §7.3): a shadow-sampled call, or one still below threshold after the cascade. */
export interface DecisionSampleRecord extends CallScope {
  task: string;
  reason: 'shadow' | 'review';
  /** Already redacted at the call site. */
  state: unknown;
  questions: Record<string, unknown>;
  primary: { provider: string; answers: Record<string, unknown> } | null;
  fallback: { provider: string; answers: Record<string, unknown> } | null;
  final: Record<string, unknown>;
  needsReview: string[];
}

export interface DecisionSampleSink {
  /** Returns the new sample's id. */
  recordDecisionSample(record: DecisionSampleRecord): Promise<string>;
}
```

`packages/ai/src/config.ts` — in `jevTask` add `shadow_rate: z.number().min(0).max(1).default(0),`.

`packages/ai/src/ai.ts`:
- import `DecisionSampleSink` from `@cs/core`;
- `AiDeps` gains:
  ```ts
  /** Where shadow samples and still-needs-review decisions are kept (spec §7.3). Without it nothing is sampled. */
  samples?: DecisionSampleSink;
  /** Uniform [0, 1) source for shadow sampling (tests inject a fixed value). */
  random?: () => number;
  /** Replaces every task's shadow_rate (AI_SHADOW_RATE, for a measurement run). */
  shadowRateOverride?: number;
  ```
- `llmDecisions(name, scope, ledgerTask = name)` passes `ledgerTask` as the `recording(...)` task name;
- replace `decide` with:

```ts
    async decide(name, state, questions, scope) {
      const t = task(name);
      let primary: DecisionProvider;
      let fallback: DecisionProvider | null = null;
      let thresholds: ConfidenceThresholds = { default: 0 };
      let rate = 0;

      if (t.provider === 'jev') {
        thresholds = t.min_confidence;
        rate = deps.shadowRateOverride ?? t.shadow_rate;
        const sampled = deps.samples !== undefined && deps.jev !== null && t.escalate_to !== undefined && rate > 0 && random() < rate;
        const escalation = t.escalate_to ? llmDecisions(t.escalate_to, scope, sampled ? `${t.escalate_to}:shadow` : t.escalate_to) : null;
        if (deps.jev) {
          primary = recording(deps.jev(t.model), name, scope, t.model);
          fallback = escalation;
        } else if (escalation) {
          primary = escalation;
        } else {
          throw new Error(`Task ${name} needs Jev but TYPESAFE_API_KEY is not configured`);
        }
        const result = await new CascadingDecisionProvider(primary, fallback, thresholds).decide(state, questions, { shadow: sampled });
        return keepSample(name, scope, state, questions, result, sampled);
      }
      primary = llmDecisions(name, scope);
      const result = await new CascadingDecisionProvider(primary, null, thresholds).decide(state, questions);
      return keepSample(name, scope, state, questions, result, false);
    },
```

with, inside `createAi` (next to `recording`):

```ts
  const random = deps.random ?? Math.random;

  /** Best-effort: a failed sample write is logged and never changes the decision. */
  async function keepSample<K extends string>(
    name: string, scope: CallScope, state: unknown, questions: Record<K, DecisionQuestion>, result: DecisionResult<K>, sampled: boolean,
  ): Promise<DecisionResult<K>> {
    if (!deps.samples || (!sampled && result.needsReview.length === 0)) return result;
    try {
      const sampleId = await deps.samples.recordDecisionSample({
        ...scope, task: name, reason: sampled ? 'shadow' : 'review', state, questions,
        primary: result.trace?.primary ?? null, fallback: result.trace?.fallback ?? null, final: result.answers, needsReview: result.needsReview,
      });
      return { ...result, sampleId };
    } catch (err) {
      console.error('[ai] decision sample write failed', err);
      return { ...result, sampleId: null };
    }
  }
```

(import `DecisionResult` as a type from `./decisions/cascade`, `CallScope` from `@cs/core`).

`packages/ai/src/env.ts` — signature `createAiFromEnv(env, config, ledger, samples?: DecisionSampleSink)`; parse the override and pass both:

```ts
  const raw = env.AI_SHADOW_RATE;
  const override = raw === undefined || raw === '' ? undefined : Number(raw);
  if (override !== undefined && !(override >= 0 && override <= 1)) throw new Error(`AI_SHADOW_RATE must be a number from 0 to 1 (got "${raw}")`);
  return createAi(config, { openrouter: …, embeddings: …, jev, ledger, samples, shadowRateOverride: override });
```

Add to `packages/ai/src/env.test.ts`: `expect(() => createAiFromEnv({ OPENROUTER_API_KEY: 'k', AI_SHADOW_RATE: '2' }, config, ledger)).toThrow(/AI_SHADOW_RATE/);`.

`packages/ai/config/ai.yaml` — append `, shadow_rate: 0.05` to `tag_decisions`, `structured_decisions`, `merge_decisions`, `page_decisions`, `price_decisions`, and `, shadow_rate: 0.02` to `review_decisions` (review volume is the largest).

- [ ] **Step 8: Run the AI tests**

Run: `pnpm --filter @cs/ai test`
Expected: PASS (the review-sample test's mock replaces the LLM answer with a low one, so both providers stay below τ).

- [ ] **Step 9: Add the DB sink and link reviews to samples**

`packages/db/src/ledger.ts` — append:

```ts
/** Service-role Db: decision samples are platform data (states were redacted at the call site). */
export function createDecisionSampleSink(db: Db): DecisionSampleSink {
  return {
    async recordDecisionSample(r) {
      const [row] = await db
        .insert(decisionSample)
        .values({
          task: r.task, reason: r.reason, agencyId: r.agencyId, clientId: r.clientId, state: r.state, questions: r.questions,
          primary: r.primary, fallback: r.fallback, final: r.final, needsReview: r.needsReview,
        })
        .returning({ id: decisionSample.id });
      return row!.id;
    },
  };
}
```

Add to `packages/db/src/model-ops.test.ts`:

```ts
  it('createDecisionSampleSink writes a sample and returns its id', async () => {
    const id = await createDecisionSampleSink(dbs.service).recordDecisionSample({
      agencyId: null, clientId: null, task: 'tag_decisions', reason: 'review', state: { a: 1 }, questions: { m: {} }, primary: null, fallback: null, final: {}, needsReview: ['m'],
    });
    const [row] = await dbs.owner.select().from(decisionSample).where(sql`id = ${id}`);
    expect(row).toMatchObject({ task: 'tag_decisions', reason: 'review', needsReview: ['m'] });
  });
```

In `packages/engine/src/tag/tag-stage.ts`, carry the sample id from compute to commit: return `sampleId: result.sampleId ?? null` from compute (and `sampleId: null` on the early return), destructure it in commit and write it:

```ts
        await tx.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys: resolution.needsReview, answers: answers ?? {}, sampleId });
```

Do the same in `packages/engine/src/tag/structured.ts` (`sampleId` next to `needsReview`/`answers` in the computed object; `sampleId: computed.sampleId` in the insert).

Extend `packages/engine/test/fake-ai.ts`: `tagResult`/`structuredResult` inputs accept `sampleId?: string` and return it on the result. Add to `packages/engine/src/tag/tag-stage.test.ts` (next to the low-confidence test at line 89; the fake's sample id must be a real sample row because of the FK):

```ts
  it('links the decision_review row to the decision sample (Phase 3d)', async () => {
    const id = await change();
    const [s] = await dbs.service.insert(decisionSample).values({ task: 'tag_decisions', reason: 'review', state: {}, questions: {}, final: {} }).returning({ id: decisionSample.id });
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: tagResult({ meaningful: true, type: 'new_service', confidence: 0.6, needsReview: ['change_type'], sampleId: s!.id }) }), packs }, id);
    const [r] = await dbs.owner.select().from(decisionReview);
    expect(r?.sampleId).toBe(s!.id);
  });
```

(`change()` is the file's existing helper that seeds a pending web change; use the file's actual helper name.)

- [ ] **Step 10: Wire the sink into the worker and CLI**

`apps/worker/src/deps.ts` `getAi`: `createAiFromEnv(env, cfg, createLedgerSink(getDb()), createDecisionSampleSink(getDb()))`. Do the same wherever `apps/worker/src/cli/engine-once.ts` builds its `Ai` (grep `createAiFromEnv`).

- [ ] **Step 11: Run and commit**

Run: `pnpm --filter @cs/ai test && pnpm --filter @cs/db exec vitest run model-ops && pnpm --filter @cs/engine exec vitest run tag && pnpm typecheck`
Expected: PASS.

```bash
git add packages/core packages/ai packages/db/src packages/engine apps/worker/src
git commit -m "feat(ai): Jev/LLM shadow sampling with decision samples linked to the review queue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Gold labels (CSV round-trip) and the accuracy/calibration report

**Files:**
- Create: `packages/engine/src/model-ops/labels.ts`, `packages/engine/src/model-ops/report.ts`
- Modify: `packages/engine/src/index.ts` (exports)
- Test: `packages/engine/src/model-ops/labels.test.ts`, `packages/engine/src/model-ops/report.test.ts`

**Interfaces:**
- Consumes: `decisionSample`, `decisionLabel` (Task 2); sample shapes written by Task 3 (`primary`/`fallback` = `{ provider, answers }`, `final` = answers keyed by question key; each answer has `value`, `confidence`, and `probability` (Noul) or `probabilities` (Choice/Score)).
- Produces:
  - `labels.ts`: `LABEL_COLUMNS`, `interface LabelRow { sampleId; task; questionKey; questionType; allowed; state; primary; fallback; final; label }` (all strings), `exportUnlabeled(db: Db, opts: { task?: string; limit: number }): Promise<LabelRow[]>`, `toCsv(rows: LabelRow[]): string`, `parseCsv(text: string): string[][]`, `parseLabelCsv(text: string): { sampleId: string; questionKey: string; label: string }[]`, `allowedValues(q: unknown): string[]`, `normalizeLabel(q: unknown, raw: string): string | null`, `importLabels(db: Db, items: { sampleId: string; questionKey: string; label: string }[], opts: { labeledBy: string; source?: LabelSource }): Promise<{ imported: number; errors: string[] }>`.
  - `report.ts`: `type ReportRole = 'primary' | 'fallback' | 'final'`, `interface LabeledAnswer { task; family; role: ReportRole; provider; probability: number; correct: boolean }`, `interface ReportRow { task; family; role; provider; n; accuracy; meanProbability; ece; note: string | null }`, `questionFamily(key: string): string`, `answerProbability(answer: unknown): number`, `expectedCalibrationError(items: { probability: number; correct: boolean }[], bins?: number): number`, `computeDecisionReport(items: LabeledAnswer[]): ReportRow[]`, `loadLabeledAnswers(db: Db, opts?: { task?: string; since?: Date }): Promise<LabeledAnswer[]>`, `formatReport(rows: ReportRow[]): string`, constants `REPORT_MIN_LABELS = 30`, `REPORT_SWITCH_MARGIN = 0.05`.

- [ ] **Step 1: Write the failing report tests (pure)**

Create `packages/engine/src/model-ops/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { answerProbability, computeDecisionReport, expectedCalibrationError, type LabeledAnswer, questionFamily } from './report';

describe('decision report (spec §7.3 accuracy dashboard)', () => {
  it('groups per-vertical keys into families', () => {
    expect(['service_hvac_plumbing', 'theme_dental__pain', 'other_dental', 'same_2', 'meaningful', 'change_type'].map(questionFamily)).toEqual([
      'service', 'theme', 'other', 'same_offer', 'meaningful', 'change_type',
    ]);
  });

  it('uses the probability a provider gave its own answer, not the 0..1 confidence', () => {
    expect(answerProbability({ type: 'noul', value: false, probability: 0.1, confidence: 0.8 })).toBeCloseTo(0.9);
    expect(answerProbability({ type: 'choice', value: 'promo', probabilities: { promo: 0.7, content: 0.3 }, confidence: 0.4 })).toBeCloseTo(0.7);
    expect(answerProbability({ type: 'score', value: 3, probabilities: { '3': 0.6 }, confidence: 0.6 })).toBeCloseTo(0.6);
    expect(answerProbability({ type: 'choice', value: 'x', confidence: 0.5 })).toBeCloseTo(0.5);
  });

  it('computes ECE over 10 equal-width bins', () => {
    // 10 answers at p=0.95, 5 correct → |0.5 - 0.95| = 0.45
    const items = Array.from({ length: 10 }, (_, i) => ({ probability: 0.95, correct: i < 5 }));
    expect(expectedCalibrationError(items)).toBeCloseTo(0.45);
    expect(expectedCalibrationError([])).toBe(0);
    expect(expectedCalibrationError([{ probability: 1, correct: true }])).toBeCloseTo(0);
  });

  it('reports accuracy per task, family, role and provider and notes when the LLM is clearly better', () => {
    const mk = (role: LabeledAnswer['role'], provider: string, correct: boolean): LabeledAnswer => ({ task: 'tag_decisions', family: 'meaningful', role, provider, probability: 0.9, correct });
    const items = [
      ...Array.from({ length: 40 }, (_, i) => mk('primary', 'jev', i < 30)), // 75%
      ...Array.from({ length: 40 }, (_, i) => mk('fallback', 'llm', i < 36)), // 90%
      ...Array.from({ length: 40 }, (_, i) => mk('final', 'engine', i < 34)),
    ];
    const rows = computeDecisionReport(items);
    expect(rows.map((r) => [r.role, r.provider, r.n, r.accuracy])).toEqual([
      ['primary', 'jev', 40, 0.75], ['fallback', 'llm', 40, 0.9], ['final', 'engine', 40, 0.85],
    ]);
    expect(rows[0]!.note).toMatch(/LLM is 15 points more accurate on 40 labels/);
    expect(rows[1]!.note).toBeNull();
  });

  it('makes no recommendation below REPORT_MIN_LABELS', () => {
    const items: LabeledAnswer[] = [
      ...Array.from({ length: 10 }, () => ({ task: 't', family: 'f', role: 'primary' as const, provider: 'jev', probability: 0.9, correct: false })),
      ...Array.from({ length: 10 }, () => ({ task: 't', family: 'f', role: 'fallback' as const, provider: 'llm', probability: 0.9, correct: true })),
    ];
    expect(computeDecisionReport(items).every((r) => r.note === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cs/engine exec vitest run model-ops/report`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `report.ts`**

```ts
import { type Db, decisionLabel, decisionSample, type SampleAnswers } from '@cs/db';
import { and, eq, gte } from 'drizzle-orm';

export type ReportRole = 'primary' | 'fallback' | 'final';
export const REPORT_MIN_LABELS = 30;
export const REPORT_SWITCH_MARGIN = 0.05;
const ROLE_ORDER: ReportRole[] = ['primary', 'fallback', 'final'];

export interface LabeledAnswer {
  task: string;
  family: string;
  role: ReportRole;
  provider: string;
  /** Probability the provider gave its own answer (calibration input). */
  probability: number;
  correct: boolean;
}

export interface ReportRow {
  task: string;
  family: string;
  role: ReportRole;
  provider: string;
  n: number;
  accuracy: number;
  meanProbability: number;
  ece: number;
  note: string | null;
}

/** Per-vertical question keys share a family so verticals pool their labels. */
export function questionFamily(key: string): string {
  if (key.startsWith('service_')) return 'service';
  if (key.startsWith('theme_')) return 'theme';
  if (key.startsWith('other_')) return 'other';
  if (/^same_\d+$/.test(key)) return 'same_offer';
  return key;
}

type AnyAnswer = { type?: string; value?: unknown; probability?: number; probabilities?: Record<string, number>; confidence?: number };

/** The probability the provider put on the answer it gave (a Noul's `probability` is P(true)). */
export function answerProbability(answer: unknown): number {
  const a = answer as AnyAnswer;
  if (a.type === 'noul' && typeof a.probability === 'number') return a.value === true ? a.probability : 1 - a.probability;
  const p = a.probabilities?.[String(a.value)];
  return typeof p === 'number' ? p : (a.confidence ?? 0);
}

/** Expected calibration error with equal-width probability bins. */
export function expectedCalibrationError(items: { probability: number; correct: boolean }[], bins = 10): number {
  if (items.length === 0) return 0;
  const sum = Array.from({ length: bins }, () => ({ n: 0, p: 0, c: 0 }));
  for (const it of items) {
    const b = sum[Math.min(bins - 1, Math.max(0, Math.floor(it.probability * bins)))]!;
    b.n++;
    b.p += it.probability;
    b.c += it.correct ? 1 : 0;
  }
  return sum.reduce((acc, b) => (b.n === 0 ? acc : acc + (b.n / items.length) * Math.abs(b.c / b.n - b.p / b.n)), 0);
}

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export function computeDecisionReport(items: LabeledAnswer[]): ReportRow[] {
  const groups = new Map<string, LabeledAnswer[]>();
  for (const it of items) {
    const k = `${it.task}\u0000${it.family}\u0000${it.role}\u0000${it.provider}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const rows: ReportRow[] = [...groups.values()].map((g) => ({
    task: g[0]!.task, family: g[0]!.family, role: g[0]!.role, provider: g[0]!.provider, n: g.length,
    accuracy: round(g.filter((x) => x.correct).length / g.length),
    meanProbability: round(g.reduce((s, x) => s + x.probability, 0) / g.length),
    ece: round(expectedCalibrationError(g)),
    note: null,
  }));
  rows.sort((a, b) => a.task.localeCompare(b.task) || a.family.localeCompare(b.family) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.provider.localeCompare(b.provider));
  for (const p of rows.filter((r) => r.role === 'primary')) {
    const f = rows.find((r) => r.role === 'fallback' && r.task === p.task && r.family === p.family);
    if (f && p.n >= REPORT_MIN_LABELS && f.n >= REPORT_MIN_LABELS && f.accuracy - p.accuracy >= REPORT_SWITCH_MARGIN) {
      p.note = `LLM is ${Math.round((f.accuracy - p.accuracy) * 100)} points more accurate on ${Math.min(p.n, f.n)} labels — consider routing ${p.task} to llm_decisions in ai.yaml`;
    }
  }
  return rows;
}

/** Every labelled question of every sample, once per role that answered it. */
export async function loadLabeledAnswers(db: Db, opts: { task?: string; since?: Date } = {}): Promise<LabeledAnswer[]> {
  const rows = await db
    .select({ s: decisionSample, key: decisionLabel.questionKey, label: decisionLabel.value })
    .from(decisionLabel)
    .innerJoin(decisionSample, eq(decisionSample.id, decisionLabel.sampleId))
    .where(and(opts.task ? eq(decisionSample.task, opts.task) : undefined, opts.since ? gte(decisionSample.createdAt, opts.since) : undefined));
  const out: LabeledAnswer[] = [];
  for (const { s, key, label } of rows) {
    const push = (role: ReportRole, provider: string, answer: unknown) => {
      if (!answer) return;
      out.push({ task: s.task, family: questionFamily(key), role, provider, probability: answerProbability(answer), correct: String((answer as AnyAnswer).value) === label });
    };
    const side = (role: ReportRole, sa: SampleAnswers | null) => sa && push(role, sa.provider, sa.answers[key]);
    side('primary', s.primary);
    side('fallback', s.fallback);
    push('final', 'engine', s.final[key]);
  }
  return out;
}

export function formatReport(rows: ReportRow[]): string {
  if (rows.length === 0) return 'No labelled decisions yet. Export samples with `decisions export`, label them, then `decisions import`.';
  const head = 'task                  family          role      provider  n     acc    p̄      ECE';
  const lines = rows.map(
    (r) =>
      `${r.task.padEnd(21)} ${r.family.padEnd(15)} ${r.role.padEnd(9)} ${r.provider.padEnd(9)} ${String(r.n).padEnd(5)} ${r.accuracy.toFixed(3)}  ${r.meanProbability.toFixed(3)}  ${r.ece.toFixed(3)}${r.note ? `\n    → ${r.note}` : ''}`,
  );
  return [head, ...lines].join('\n');
}
```

- [ ] **Step 4: Run the report tests**

Run: `pnpm --filter @cs/engine exec vitest run model-ops/report`
Expected: PASS.

- [ ] **Step 5: Write the failing label tests (DB)**

Create `packages/engine/src/model-ops/labels.test.ts`:

```ts
import { decisionLabel, decisionSample } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { exportUnlabeled, importLabels, parseCsv, parseLabelCsv, toCsv } from './labels';
import { loadLabeledAnswers } from './report';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(() => truncateAll(dbs.owner));

const QUESTIONS = {
  meaningful: { type: 'noul', instructions: 'Matters?' },
  change_type: { type: 'choice', instructions: 'Kind?', options: { promo: 'p', content: 'c' } },
};
async function sample() {
  const [s] = await dbs.service
    .insert(decisionSample)
    .values({
      task: 'tag_decisions', reason: 'shadow', state: { after: 'Spring "special", $79' }, questions: QUESTIONS,
      primary: { provider: 'jev', answers: { meaningful: { type: 'noul', value: true, probability: 0.9, confidence: 0.8 }, change_type: { type: 'choice', value: 'content', probabilities: { content: 0.6 }, confidence: 0.6 } } },
      fallback: { provider: 'llm', answers: { meaningful: { type: 'noul', value: true, probability: 0.95, confidence: 0.9 }, change_type: { type: 'choice', value: 'promo', probabilities: { promo: 0.9 }, confidence: 0.9 } } },
      final: { meaningful: { type: 'noul', value: true, probability: 0.9, confidence: 0.8, provider: 'jev' }, change_type: { type: 'choice', value: 'promo', probabilities: { promo: 0.9 }, confidence: 0.9, provider: 'llm' } },
    })
    .returning({ id: decisionSample.id });
  return s!.id;
}

describe('gold labels', () => {
  it('round-trips through CSV with quotes, commas and newlines intact', () => {
    const csv = 'a,b\n"x, ""y""","line1\nline2"\n';
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']]);
  });

  it('exports one row per unlabelled question and imports the filled-in labels', async () => {
    const id = await sample();
    const rows = await exportUnlabeled(dbs.service, { limit: 10 });
    expect(rows.map((r) => [r.questionKey, r.allowed, r.primary, r.fallback])).toEqual([
      ['meaningful', 'true|false', 'true', 'true'], ['change_type', 'promo|content', 'content', 'promo'],
    ]);
    const filled = toCsv(rows.map((r) => ({ ...r, label: r.questionKey === 'meaningful' ? 'yes' : 'promo' })));
    const r = await importLabels(dbs.service, parseLabelCsv(filled), { labeledBy: 'owner' });
    expect(r).toEqual({ imported: 2, errors: [] });
    expect((await dbs.owner.select().from(decisionLabel)).map((l) => [l.questionKey, l.value, l.source]).sort()).toEqual([['change_type', 'promo', 'human'], ['meaningful', 'true', 'human']]);
    expect(await exportUnlabeled(dbs.service, { limit: 10 })).toEqual([]);
    expect(id).toBeTruthy();
  });

  it('rejects labels for unknown questions or values outside the question', async () => {
    const id = await sample();
    const r = await importLabels(dbs.service, [
      { sampleId: id, questionKey: 'change_type', label: 'banana' },
      { sampleId: id, questionKey: 'nope', label: 'true' },
      { sampleId: '00000000-0000-4000-8000-000000000999', questionKey: 'meaningful', label: 'true' },
    ], { labeledBy: 'owner' });
    expect(r.imported).toBe(0);
    expect(r.errors).toHaveLength(3);
  });

  it('feeds the report: Jev wrong, LLM and the engine right on change_type', async () => {
    const id = await sample();
    await importLabels(dbs.service, [{ sampleId: id, questionKey: 'change_type', label: 'promo' }], { labeledBy: 'owner' });
    const answers = await loadLabeledAnswers(dbs.service);
    expect(answers.map((a) => [a.role, a.provider, a.correct])).toEqual([['primary', 'jev', false], ['fallback', 'llm', true], ['final', 'engine', true]]);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @cs/engine exec vitest run model-ops/labels`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `labels.ts`**

```ts
import { type Db, decisionLabel, decisionSample, type LabelSource, type SampleAnswers } from '@cs/db';
import { desc, eq, inArray, sql } from 'drizzle-orm';

export const LABEL_COLUMNS = ['sample_id', 'task', 'question_key', 'question_type', 'allowed', 'state', 'primary', 'fallback', 'final', 'label'] as const;
const STATE_CHARS = 2000;

export interface LabelRow {
  sampleId: string;
  task: string;
  questionKey: string;
  questionType: string;
  allowed: string;
  state: string;
  primary: string;
  fallback: string;
  final: string;
  label: string;
}

type Q = { type?: string; options?: Record<string, string>; levels?: string[] };

export function allowedValues(q: unknown): string[] {
  const x = q as Q;
  if (x.type === 'noul') return ['true', 'false'];
  if (x.type === 'choice') return Object.keys(x.options ?? {});
  if (x.type === 'score') return (x.levels ?? []).map((_, i) => String(i));
  return [];
}

/** A label in the question's own vocabulary; Noul accepts yes/no/1/0 too. Null when not allowed. */
export function normalizeLabel(q: unknown, raw: string): string | null {
  let v = raw.trim();
  if ((q as Q).type === 'noul') v = ({ yes: 'true', y: 'true', '1': 'true', no: 'false', n: 'false', '0': 'false' } as Record<string, string>)[v.toLowerCase()] ?? v.toLowerCase();
  return allowedValues(q).includes(v) ? v : null;
}

const valueOf = (a: unknown) => {
  const v = (a as { value?: unknown } | undefined)?.value;
  return v === undefined || v === null ? '' : String(v);
};
const sideValue = (s: SampleAnswers | null, key: string) => valueOf(s?.answers[key]);

/** Newest samples first; one row per question that has no label yet. */
export async function exportUnlabeled(db: Db, opts: { task?: string; limit: number }): Promise<LabelRow[]> {
  const samples = await db
    .select()
    .from(decisionSample)
    .where(opts.task ? eq(decisionSample.task, opts.task) : undefined)
    .orderBy(desc(decisionSample.createdAt))
    .limit(opts.limit);
  if (samples.length === 0) return [];
  const done = new Set(
    (await db.select({ s: decisionLabel.sampleId, k: decisionLabel.questionKey }).from(decisionLabel).where(inArray(decisionLabel.sampleId, samples.map((s) => s.id)))).map(
      (r) => `${r.s}|${r.k}`,
    ),
  );
  const rows: LabelRow[] = [];
  for (const s of samples) {
    for (const [key, q] of Object.entries(s.questions)) {
      if (done.has(`${s.id}|${key}`)) continue;
      rows.push({
        sampleId: s.id, task: s.task, questionKey: key, questionType: String((q as Q).type ?? ''), allowed: allowedValues(q).join('|'),
        state: JSON.stringify(s.state).slice(0, STATE_CHARS), primary: sideValue(s.primary, key), fallback: sideValue(s.fallback, key), final: valueOf(s.final[key]), label: '',
      });
    }
  }
  return rows;
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: LabelRow[]): string {
  const lines = [LABEL_COLUMNS.join(',')];
  for (const r of rows) lines.push([r.sampleId, r.task, r.questionKey, r.questionType, r.allowed, r.state, r.primary, r.fallback, r.final, r.label].map(cell).join(','));
  return `${lines.join('\n')}\n`;
}

/** RFC 4180: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows with an empty label are skipped (not yet labelled). */
export function parseLabelCsv(text: string): { sampleId: string; questionKey: string; label: string }[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`label CSV has no "${name}" column`);
    return i;
  };
  const [s, k, l] = [col('sample_id'), col('question_key'), col('label')];
  return rows.filter((r) => (r[l] ?? '').trim() !== '').map((r) => ({ sampleId: r[s] ?? '', questionKey: r[k] ?? '', label: r[l] ?? '' }));
}

export async function importLabels(
  db: Db,
  items: { sampleId: string; questionKey: string; label: string }[],
  opts: { labeledBy: string; source?: LabelSource },
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  const ids = [...new Set(items.map((i) => i.sampleId))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const samples = new Map(
    ids.length === 0 ? [] : (await db.select({ id: decisionSample.id, questions: decisionSample.questions }).from(decisionSample).where(inArray(decisionSample.id, ids))).map((s) => [s.id, s.questions]),
  );
  for (const it of items) {
    const questions = samples.get(it.sampleId);
    if (!questions) {
      errors.push(`${it.sampleId}: no such sample`);
      continue;
    }
    const q = questions[it.questionKey];
    if (!q) {
      errors.push(`${it.sampleId}/${it.questionKey}: the sample has no such question`);
      continue;
    }
    const value = normalizeLabel(q, it.label);
    if (value === null) {
      errors.push(`${it.sampleId}/${it.questionKey}: "${it.label}" is not one of ${allowedValues(q).join('|')}`);
      continue;
    }
    await db
      .insert(decisionLabel)
      .values({ sampleId: it.sampleId, questionKey: it.questionKey, value, source: opts.source ?? 'human', labeledBy: opts.labeledBy })
      .onConflictDoUpdate({ target: [decisionLabel.sampleId, decisionLabel.questionKey], set: { value, source: opts.source ?? 'human', labeledBy: opts.labeledBy, createdAt: sql`now()` } });
    imported++;
  }
  return { imported, errors };
}
```

Export both modules from `packages/engine/src/index.ts` (`export * from './model-ops/labels'; export * from './model-ops/report';`).

- [ ] **Step 8: Run and commit**

Run: `pnpm --filter @cs/engine exec vitest run model-ops && pnpm typecheck`
Expected: PASS.

```bash
git add packages/engine/src/model-ops packages/engine/src/index.ts
git commit -m "feat(engine): gold-label CSV round-trip and decision accuracy/calibration report

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Event retraction and stage-version supersede

**Files:**
- Create: `packages/engine/src/events/retract.ts`
- Modify: `packages/engine/src/web/diff-stage.ts`, `packages/engine/src/structured/vendor-diff.ts`, `packages/engine/src/structured/rank.ts`, `packages/engine/src/merge/merge.ts`, `packages/engine/src/score/score-stage.ts`, `packages/engine/src/sweep.ts`, `packages/engine/src/moves/moves-stage.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/src/events/retract.test.ts`

**Interfaces:**
- Consumes: `changeEvent.retractedAt/retractionReason` (Task 2).
- Produces: `type RetractionReason = 'superseded' | 'review'`; `retractEvent(tx: Tx, eventId: string, reason: RetractionReason): Promise<void>`; `detachChange(tx: Tx, changeId: string, reason: RetractionReason): Promise<{ eventId: string; retracted: boolean } | null>`; `type SupersedeSubject = { afterCaptureId: string; source: string } | { rankScanId: string }`; `supersedePriorChanges(tx: Tx, subject: SupersedeSubject, version: number): Promise<{ superseded: number; retracted: number }>`. Every event reader skips `retracted_at IS NOT NULL`.

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/events/retract.test.ts`:

```ts
import { changeEvent, detectedChange, eventChange, eventScore } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { day, seedPage, seedVendorCapture, seedWebCapture } from '../../test/seed';
import { findMergeTarget } from '../merge/merge';
import { scoreEvent } from '../score/score-stage';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import { diffWebCapture, WEB_DIFF_VERSION } from '../web/diff-stage';
import { detachChange, retractEvent, supersedePriorChanges } from './retract';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const html = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

async function webCapture() {
  const store = createMemoryStore();
  const page = await seedPage(dbs.service, IDS.competitorX);
  const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: html('<p>AC tune-up only $79 this month</p>'), capturedAt: day(1) });
  return { store, page, cap };
}

async function change(captureId: string, over: Partial<typeof detectedChange.$inferInsert> = {}) {
  const [c] = await dbs.service
    .insert(detectedChange)
    .values({ competitorId: IDS.competitorX, source: 'web', kind: 'modified', afterCaptureId: captureId, blockKey: 'body>p#0', afterText: 'AC tune-up only $79', status: 'event', stageVersion: 0, ...over })
    .returning({ id: detectedChange.id });
  return c!.id;
}

async function eventFor(changeIds: string[], over: Partial<typeof changeEvent.$inferInsert> = {}) {
  const [ev] = await dbs.service
    .insert(changeEvent)
    .values({ competitorId: IDS.competitorX, changeType: 'price_change', channels: ['web'], services: { hvac_plumbing: 'ac_tune_up' }, summary: 'AC tune-up $79', confidence: 0.95, occurredAt: day(1), ...over })
    .returning({ id: changeEvent.id });
  for (const id of changeIds) await dbs.service.insert(eventChange).values({ eventId: ev!.id, changeId: id });
  return ev!.id;
}

describe('event retraction (Phase 3d decision 6)', () => {
  it('retractEvent keeps the event row but removes its scores', async () => {
    const { cap } = await webCapture();
    const ev = await eventFor([await change(cap)]);
    await scoreEvent({ db: dbs.service, packs }, ev);
    expect((await dbs.owner.select().from(eventScore)).length).toBeGreaterThan(0);
    await dbs.service.transaction((tx) => retractEvent(tx, ev, 'review'));
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ retractionReason: 'review' });
    expect(row!.retractedAt).not.toBeNull();
    expect(await dbs.owner.select().from(eventScore)).toEqual([]);
  });

  it('detachChange keeps a merged event alive on its other evidence and drops the detached channel', async () => {
    const { cap } = await webCapture();
    const ads = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_ads', capturedAt: day(1) });
    const web = await change(cap);
    const ad = await change(ads, { source: 'google_ads', blockKey: 'ads', stageVersion: 1 });
    const ev = await eventFor([web, ad], { channels: ['google_ads', 'web'] });
    const r = await dbs.service.transaction((tx) => detachChange(tx, web, 'review'));
    expect(r).toEqual({ eventId: ev, retracted: false });
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ retractedAt: null, channels: ['google_ads'] });
  });

  it('detachChange retracts the event when the change was its only evidence (and keeps that link for audit)', async () => {
    const { cap } = await webCapture();
    const web = await change(cap);
    const ev = await eventFor([web]);
    expect(await dbs.service.transaction((tx) => detachChange(tx, web, 'review'))).toEqual({ eventId: ev, retracted: true });
    expect(await dbs.owner.select().from(eventChange)).toHaveLength(1);
  });
});

describe('stage-version supersede (Phase 3d decision 7)', () => {
  it('a re-diff under a newer WEB_DIFF_VERSION supersedes the old changes and retracts web-only events', async () => {
    const { store, cap } = await webCapture();
    const old = await change(cap, { stageVersion: WEB_DIFF_VERSION - 1 });
    const ev = await eventFor([old]);
    await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, cap); // baseline capture: no new changes
    const [c] = await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, old));
    expect(c?.status).toBe('superseded');
    const [e] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(e?.retractionReason).toBe('superseded');
  });

  it('never supersedes another source, a complaint spike, or a change of the current version', async () => {
    const { cap } = await webCapture();
    const current = await change(cap, { stageVersion: WEB_DIFF_VERSION, blockKey: 'body>p#1' });
    const reviews = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(1) });
    const spike = await change(reviews, { source: 'google_reviews', blockKey: 'complaint:hvac_plumbing:response_time', stageVersion: 1, details: { changeType: 'review_spike', theme: 'response_time' } });
    const r = await dbs.service.transaction(async (tx) => ({
      web: await supersedePriorChanges(tx, { afterCaptureId: cap, source: 'web' }, WEB_DIFF_VERSION),
      vendor: await supersedePriorChanges(tx, { afterCaptureId: reviews, source: 'google_reviews' }, 99),
    }));
    expect(r).toEqual({ web: { superseded: 0, retracted: 0 }, vendor: { superseded: 0, retracted: 0 } });
    expect((await dbs.owner.select().from(detectedChange)).map((c) => c.status).sort()).toEqual(['event', 'event']);
    expect([current, spike]).toHaveLength(2);
  });

  it('retracted events are invisible to merge, scoring and the score sweep', async () => {
    const { cap } = await webCapture();
    const ev = await eventFor([await change(cap)], { retractedAt: day(2), retractionReason: 'superseded', facts: [] });
    expect(await scoreEvent({ db: dbs.service, packs }, ev)).toEqual({ scored: 0, failed: 0, routes: { alert: 0, brief: 0, archive: 0 } });
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(ev);
    const target = await findMergeTarget(
      { db: dbs.service, ai: createFakeAi() },
      { competitorId: IDS.competitorX, clientId: null, captureId: null, changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, facts: [], embedding: null, occurredAt: day(1), text: 'AC tune-up $79' },
    );
    expect(target).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cs/engine exec vitest run events/retract`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `retract.ts`**

```ts
import { changeEvent, detectedChange, eventChange, eventScore, moveEvent, type Tx } from '@cs/db';
import { and, eq, isNull, lt, ne, sql } from 'drizzle-orm';

export type RetractionReason = 'superseded' | 'review';

/**
 * Soft-retracts an event (Phase 3d decision 6): the row and its evidence chain stay for audit; its per-client
 * scores and move links go in the same transaction, so a retracted event can never reach a brief or a move.
 */
export async function retractEvent(tx: Tx, eventId: string, reason: RetractionReason): Promise<void> {
  await tx.update(changeEvent).set({ retractedAt: new Date(), retractionReason: reason }).where(and(eq(changeEvent.id, eventId), isNull(changeEvent.retractedAt)));
  await tx.delete(eventScore).where(eq(eventScore.eventId, eventId));
  await tx.delete(moveEvent).where(eq(moveEvent.eventId, eventId));
}

/**
 * Withdraws one change from its event. With other evidence left, the link is removed and the event's channels are
 * recomputed; when it was the only evidence, the link is kept (audit) and the event is retracted instead.
 */
export async function detachChange(tx: Tx, changeId: string, reason: RetractionReason): Promise<{ eventId: string; retracted: boolean } | null> {
  const [link] = await tx.select({ eventId: eventChange.eventId }).from(eventChange).where(eq(eventChange.changeId, changeId)).limit(1);
  if (!link) return null;
  const [others] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(eventChange)
    .where(and(eq(eventChange.eventId, link.eventId), ne(eventChange.changeId, changeId)));
  if ((others?.n ?? 0) === 0) {
    await retractEvent(tx, link.eventId, reason);
    return { eventId: link.eventId, retracted: true };
  }
  await tx.delete(eventChange).where(eq(eventChange.changeId, changeId));
  const channels = await tx
    .selectDistinct({ source: detectedChange.source })
    .from(eventChange)
    .innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
    .where(eq(eventChange.eventId, link.eventId));
  await tx.update(changeEvent).set({ channels: channels.map((c) => c.source).sort() }).where(eq(changeEvent.id, link.eventId));
  return { eventId: link.eventId, retracted: false };
}

export type SupersedeSubject = { afterCaptureId: string; source: string } | { rankScanId: string };

/**
 * Phase 3d decision 7: when a diff stage re-runs a subject under a newer stage version, that subject's changes from
 * older versions are superseded and withdrawn from their events. Complaint spikes (`details.theme`, written by the
 * nightly review-insights run against a reviews capture) are not diff output and are never touched.
 */
export async function supersedePriorChanges(tx: Tx, subject: SupersedeSubject, version: number): Promise<{ superseded: number; retracted: number }> {
  const scope =
    'rankScanId' in subject
      ? eq(detectedChange.rankScanId, subject.rankScanId)
      : and(eq(detectedChange.afterCaptureId, subject.afterCaptureId), eq(detectedChange.source, subject.source), sql`NOT (${detectedChange.details} ? 'theme')`);
  const old = await tx
    .update(detectedChange)
    .set({ status: 'superseded' })
    .where(and(scope, lt(detectedChange.stageVersion, version), ne(detectedChange.status, 'superseded')))
    .returning({ id: detectedChange.id });
  let retracted = 0;
  for (const { id } of old) if ((await detachChange(tx, id, 'superseded'))?.retracted) retracted++;
  return { superseded: old.length, retracted };
}
```

- [ ] **Step 4: Call supersede from the three diff stages**

`packages/engine/src/web/diff-stage.ts` — first line of the commit callback (before the embeddings update and before the `c.candidates.length === 0` early return):

```ts
      await supersedePriorChanges(tx, { afterCaptureId: captureId, source: 'web' }, WEB_DIFF_VERSION);
```

`packages/engine/src/structured/vendor-diff.ts` — first line of the commit callback (before `if (!prev || changes.length === 0)`):

```ts
      await supersedePriorChanges(tx, { afterCaptureId: cap.id, source: cap.source }, VENDOR_DIFF_VERSION);
```

`packages/engine/src/structured/rank.ts` — first line of the commit callback: `await supersedePriorChanges(tx, { rankScanId: scanId }, RANK_DIFF_VERSION);` (use the function's scan-id variable).

- [ ] **Step 5: Exclude retracted events everywhere they are read**

- `packages/engine/src/merge/merge.ts` `findMergeTarget`: add `isNull(changeEvent.retractedAt)` to the `and(...)` of the candidate query.
- `packages/engine/src/score/score-stage.ts`: in `noveltySimilarity`'s `where`, add `isNull(changeEvent.retractedAt)`; in `scoreEvent`, right after loading `ev`:
  ```ts
  const empty: ScoreRunResult = { scored: 0, failed: 0, routes: { alert: 0, brief: 0, archive: 0 } };
  if (ev.retractedAt) return empty; // Phase 3d: a retracted event is never (re)scored
  ```
- `packages/engine/src/sweep.ts` score query: `WHERE e.retracted_at IS NULL AND e.created_at >= …`.
- `packages/engine/src/moves/moves-stage.ts` event query: add `isNull(changeEvent.retractedAt)` to its `and(...)`.

Export `retract.ts` from `packages/engine/src/index.ts`.

- [ ] **Step 6: Run and commit**

Run: `pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS (the full engine suite, since every diff stage now supersedes).

```bash
git add packages/engine/src
git commit -m "feat(engine): soft event retraction and stage-version supersede for diff stages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Resolve a `decision_review`

**Files:**
- Create: `packages/engine/src/model-ops/resolve.ts`
- Modify: `packages/engine/src/tag/tag-stage.ts` (extract `loadWebChange`, `blockEmbedding`, `webEventValues`), `packages/engine/src/index.ts`
- Test: `packages/engine/src/model-ops/resolve.test.ts`

**Interfaces:**
- Consumes: `retractEvent`/`detachChange` (Task 5), `decisionReview.sampleId/resolvedBy/resolution`, `decisionLabel` (Task 2), `resolveTag`, `buildTagQuestions`, `serviceQuestionKey` (`tag/questions.ts`), `buildStructuredQuestions` (`tag/structured.ts`), `writeEvent` (`merge/merge.ts`), `scoreEvent`.
- Produces:
  - `tag-stage.ts`: `interface WebChangeRow { change: typeof detectedChange.$inferSelect; competitorName: string; pageUrl: string | null; pageType: string | null; capturedAt: Date }`, `loadWebChange(db: Db, changeId: string): Promise<WebChangeRow | undefined>`, `blockEmbedding(db: Db, change: typeof detectedChange.$inferSelect): Promise<number[] | null>`, `webEventValues(row: WebChangeRow, resolution: TagResolution, embedding: number[] | null): typeof changeEvent.$inferInsert`.
  - `resolve.ts`: `type ResolveAction = 'created' | 'updated' | 'detached' | 'retracted' | 'unchanged'`; `interface OpenReview { id: string; createdAt: Date; keys: string[]; answers: Record<string, unknown>; changeId: string; source: string; kind: string; beforeText: string | null; afterText: string | null; competitorName: string }`; `listOpenReviews(db: Db, limit?: number): Promise<OpenReview[]>`; `resolveDecisionReview(deps: { db: Db; packs: PackLoader }, reviewId: string, input: { answers: Record<string, string | boolean>; resolvedBy: string }): Promise<{ action: ResolveAction; eventId: string | null; labels: number }>`.

- [ ] **Step 1: Refactor tag-stage (no behaviour change)**

In `packages/engine/src/tag/tag-stage.ts`, move the compute's first select into `loadWebChange`, the embedding lookup into `blockEmbedding`, and the `writeEvent` values into `webEventValues`:

```ts
export interface WebChangeRow {
  change: typeof detectedChange.$inferSelect;
  competitorName: string;
  pageUrl: string | null;
  pageType: string | null;
  capturedAt: Date;
}

export async function loadWebChange(db: Db, changeId: string): Promise<WebChangeRow | undefined> {
  const [row] = await db
    .select({ change: detectedChange, competitorName: competitor.name, pageUrl: trackedPage.url, pageType: trackedPage.pageType, capturedAt: capture.capturedAt })
    .from(detectedChange)
    .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
    .innerJoin(capture, eq(capture.id, detectedChange.afterCaptureId))
    .leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
    .where(eq(detectedChange.id, changeId))
    .limit(1);
  return row;
}

/** The embedding of the change's block (the before block for a removal), stored by the diff stage. */
export async function blockEmbedding(db: Db, change: typeof detectedChange.$inferSelect): Promise<number[] | null> {
  const blockCapture = change.kind === 'removed' ? change.beforeCaptureId : change.afterCaptureId;
  if (!blockCapture || !change.blockKey) return null;
  const [blk] = await db
    .select({ embedding: captureBlock.embedding })
    .from(captureBlock)
    .where(and(eq(captureBlock.captureId, blockCapture), eq(captureBlock.blockKey, change.blockKey)))
    .limit(1);
  return blk?.embedding ?? null;
}

/** Event values of a meaningful web change (shared by the tag stage and decision-review resolution). */
export function webEventValues(row: WebChangeRow, resolution: TagResolution, embedding: number[] | null): typeof changeEvent.$inferInsert {
  const c = row.change;
  return {
    competitorId: c.competitorId, changeType: resolution.type, channels: ['web'], services: resolution.services,
    summary: buildSummary(c, row.pageUrl, [row.competitorName]), facts: redactFacts(c.numericChanges, [row.competitorName]),
    details: { offer: isWebOffer(resolution.type, c.numericChanges) }, zips: extractZips(c.afterText ?? c.beforeText ?? ''), embedding,
    confidence: resolution.confidence, needsReview: resolution.needsReview.length > 0, occurredAt: row.capturedAt,
  };
}
```

Use them in `tagChange`: `const row = await loadWebChange(deps.db, changeId)`, `const embedding = await blockEmbedding(deps.db, row.change)`, and in the commit `writeEvent(tx, changeId, webEventValues(row, resolution, embedding), target)`. (`summary` is still computed in compute for `findMergeTarget`; `webEventValues` recomputes it — identical.) Import `TagResolution` and `changeEvent`.

Run: `pnpm --filter @cs/engine exec vitest run tag` → PASS (pure refactor).

- [ ] **Step 2: Write the failing resolution tests**

Create `packages/engine/src/model-ops/resolve.test.ts`:

```ts
import { changeEvent, decisionLabel, decisionReview, decisionSample, detectedChange, eventChange, eventScore } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { choice, noul } from '../../test/fake-ai';
import { day, seedPage, seedVendorCapture, seedWebCapture } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader } from '../tag/tag-stage';
import { listOpenReviews, resolveDecisionReview } from './resolve';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const deps = { db: dbs.service, packs };
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner); // A1 and B1 (both hvac) track X
});

async function webChange(status: 'cosmetic' | 'event', text = 'We now offer duct cleaning in every county', money = false) {
  const store = createMemoryStore();
  const page = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/services', 'service');
  const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<p>${text}</p>`, capturedAt: day(1) });
  const [c] = await dbs.service
    .insert(detectedChange)
    .values({
      competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'added', afterCaptureId: cap, blockKey: 'body>p#0', afterText: text, status, stageVersion: 1,
      numericChanges: money ? diffFacts(extractNumericFacts('$99'), extractNumericFacts('$79')) : [],
    })
    .returning({ id: detectedChange.id });
  return c!.id;
}

async function review(changeId: string, keys: string[], answers: Record<string, unknown>, withSample = true) {
  const [s] = withSample
    ? await dbs.service
        .insert(decisionSample)
        .values({
          task: 'tag_decisions', reason: 'review', state: {}, final: answers, needsReview: keys,
          questions: { meaningful: { type: 'noul', instructions: 'm' }, change_type: { type: 'choice', instructions: 't', options: { new_service: 'n', promo: 'p', content: 'c', cosmetic: 'x', price_change: 'pc' } }, service_hvac_plumbing: { type: 'choice', instructions: 's', options: { none: 'none', duct_cleaning: 'd', ac_tune_up: 'a' } } },
        })
        .returning({ id: decisionSample.id })
    : [undefined];
  const [r] = await dbs.service.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys, answers, sampleId: s?.id ?? null }).returning({ id: decisionReview.id });
  return r!.id;
}

const modelSaid = (meaningful: boolean, type: string, service = 'none') => ({ meaningful: noul(meaningful, 0.4), change_type: choice(type, 0.4), service_hvac_plumbing: choice(service, 0.4) });

async function event(changeIds: string[], over: Partial<typeof changeEvent.$inferInsert> = {}) {
  const [ev] = await dbs.service
    .insert(changeEvent)
    .values({ competitorId: IDS.competitorX, changeType: 'new_service', channels: ['web'], summary: 's', confidence: 0.4, needsReview: true, occurredAt: day(1), ...over })
    .returning({ id: changeEvent.id });
  for (const id of changeIds) await dbs.service.insert(eventChange).values({ eventId: ev!.id, changeId: id });
  return ev!.id;
}

describe('resolveDecisionReview (Phase 3d decision 8)', () => {
  it('lists open reviews with their change', async () => {
    const ch = await webChange('cosmetic');
    await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'));
    const open = await listOpenReviews(dbs.service);
    expect(open.map((o) => [o.changeId, o.keys, o.competitorName])).toEqual([[ch, ['meaningful'], 'Smith HVAC']]);
  });

  it('turns a cosmetic change the AM calls meaningful into a scored event and labels the sample', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'));
    const r = await resolveDecisionReview(deps, id, { answers: { meaningful: true, change_type: 'new_service', service_hvac_plumbing: 'duct_cleaning' }, resolvedBy: 'am@agency' });
    expect(r).toMatchObject({ action: 'created', labels: 3 });
    const [ev] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, r.eventId!));
    expect(ev).toMatchObject({ changeType: 'new_service', services: { hvac_plumbing: 'duct_cleaning' }, needsReview: false });
    expect(await dbs.owner.select().from(eventScore).where(eq(eventScore.eventId, r.eventId!))).toHaveLength(2);
    expect((await dbs.owner.select().from(detectedChange))[0]?.status).toBe('event');
    const [rev] = await dbs.owner.select().from(decisionReview);
    expect(rev).toMatchObject({ resolvedBy: 'am@agency', resolution: { meaningful: true, change_type: 'new_service', service_hvac_plumbing: 'duct_cleaning' } });
    expect((await dbs.owner.select().from(decisionLabel)).map((l) => [l.questionKey, l.value, l.source]).sort()).toEqual([
      ['change_type', 'new_service', 'review'], ['meaningful', 'true', 'review'], ['service_hvac_plumbing', 'duct_cleaning', 'review'],
    ]);
  });

  it('detaches a rejected web change from a merged event, which stays live on the ad', async () => {
    const ch = await webChange('event');
    const ads = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_ads', capturedAt: day(1) });
    const [ad] = await dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, source: 'google_ads', kind: 'added', afterCaptureId: ads, blockKey: 'ads', status: 'event', stageVersion: 1 }).returning({ id: detectedChange.id });
    const ev = await event([ch, ad!.id], { channels: ['google_ads', 'web'] });
    const id = await review(ch, ['meaningful'], modelSaid(true, 'new_service'));
    const r = await resolveDecisionReview(deps, id, { answers: { meaningful: false }, resolvedBy: 'am' });
    expect(r).toMatchObject({ action: 'detached', eventId: ev });
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ retractedAt: null, channels: ['google_ads'] });
    expect((await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, ch)))[0]?.status).toBe('cosmetic');
  });

  it('retracts a web-only event the AM rejects, even when it carries a money change', async () => {
    const ch = await webChange('event', 'Tune-up $79 (was $99)', true);
    const ev = await event([ch], { changeType: 'price_change' });
    const id = await review(ch, ['change_type'], modelSaid(true, 'price_change'));
    expect(await resolveDecisionReview(deps, id, { answers: { meaningful: false }, resolvedBy: 'am' })).toMatchObject({ action: 'retracted', eventId: ev });
    expect((await dbs.owner.select().from(changeEvent))[0]?.retractionReason).toBe('review');
  });

  it('updates type and service, clears needs_review and re-scores', async () => {
    const ch = await webChange('event');
    const ev = await event([ch], { services: { hvac_plumbing: null } });
    const id = await review(ch, ['service_hvac_plumbing'], modelSaid(true, 'new_service'));
    expect(await resolveDecisionReview(deps, id, { answers: { service_hvac_plumbing: 'duct_cleaning' }, resolvedBy: 'am' })).toMatchObject({ action: 'updated', eventId: ev });
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ services: { hvac_plumbing: 'duct_cleaning' }, needsReview: false });
    expect(await dbs.owner.select().from(eventScore)).toHaveLength(2);
  });

  it('validates answers against the questions and never resolves twice', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'));
    await expect(resolveDecisionReview(deps, id, { answers: { change_type: 'banana' }, resolvedBy: 'am' })).rejects.toThrow(/change_type/);
    await expect(resolveDecisionReview(deps, id, { answers: { nope: true }, resolvedBy: 'am' })).rejects.toThrow(/unknown question "nope"/);
    expect((await dbs.owner.select().from(decisionReview))[0]?.resolvedAt).toBeNull();
    await resolveDecisionReview(deps, id, { answers: { meaningful: false }, resolvedBy: 'am' });
    await expect(resolveDecisionReview(deps, id, { answers: { meaningful: true }, resolvedBy: 'am' })).rejects.toThrow(/already resolved/);
  });

  it('works without a sample, using the tag questions', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'), false);
    expect(await resolveDecisionReview(deps, id, { answers: { meaningful: true }, resolvedBy: 'am' })).toMatchObject({ action: 'created', labels: 0 });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @cs/engine exec vitest run model-ops/resolve`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `resolve.ts`**

```ts
import type { DecisionQuestion, ResolvedAnswer } from '@cs/ai';
import type { ChangeType } from '@cs/core';
import { changeEvent, client, competitor, type Db, decisionLabel, decisionReview, decisionSample, detectedChange, eventChange, eventScore } from '@cs/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { detachChange } from '../events/retract';
import { writeEvent } from '../merge/merge';
import { scoreEvent } from '../score/score-stage';
import { buildTagQuestions, resolveTag, serviceQuestionKey } from '../tag/questions';
import { buildStructuredQuestions } from '../tag/structured';
import { blockEmbedding, competitorVerticals, loadWebChange, type PackLoader, webEventValues } from '../tag/tag-stage';

export type ResolveAction = 'created' | 'updated' | 'detached' | 'retracted' | 'unchanged';

export interface OpenReview {
  id: string;
  createdAt: Date;
  keys: string[];
  answers: Record<string, unknown>;
  changeId: string;
  source: string;
  kind: string;
  beforeText: string | null;
  afterText: string | null;
  competitorName: string;
}

/** The AM review queue (spec §7.3), oldest first. Phase 5 puts a screen on this. */
export async function listOpenReviews(db: Db, limit = 50): Promise<OpenReview[]> {
  return db
    .select({
      id: decisionReview.id, createdAt: decisionReview.createdAt, keys: decisionReview.keys, answers: decisionReview.answers, changeId: detectedChange.id,
      source: detectedChange.source, kind: detectedChange.kind, beforeText: detectedChange.beforeText, afterText: detectedChange.afterText, competitorName: competitor.name,
    })
    .from(decisionReview)
    .innerJoin(detectedChange, eq(detectedChange.id, decisionReview.subjectId))
    .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
    .where(and(isNull(decisionReview.resolvedAt), eq(decisionReview.subjectType, 'detected_change')))
    .orderBy(asc(decisionReview.createdAt))
    .limit(limit);
}

/** An AM's answer as a certain decision; throws when the value is not one the question allows. */
function humanAnswer(key: string, q: DecisionQuestion, raw: string | boolean): ResolvedAnswer {
  if (q.type === 'noul') {
    const v = typeof raw === 'boolean' ? raw : raw === 'true' ? true : raw === 'false' ? false : null;
    if (v === null) throw new Error(`answer for ${key} must be true or false (got "${raw}")`);
    return { type: 'noul', value: v, probability: v ? 1 : 0, confidence: 1, provider: 'human' };
  }
  if (q.type === 'choice') {
    const v = String(raw);
    if (!(v in q.options)) throw new Error(`answer for ${key} must be one of ${Object.keys(q.options).join('|')} (got "${v}")`);
    return { type: 'choice', value: v, probabilities: { [v]: 1 }, confidence: 1, provider: 'human' };
  }
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0 || v >= q.levels.length) throw new Error(`answer for ${key} must be a level from 0 to ${q.levels.length - 1} (got "${raw}")`);
  return { type: 'score', value: v, probabilities: { [String(v)]: 1 }, confidence: 1, provider: 'human' };
}

export async function resolveDecisionReview(
  deps: { db: Db; packs: PackLoader },
  reviewId: string,
  input: { answers: Record<string, string | boolean>; resolvedBy: string },
): Promise<{ action: ResolveAction; eventId: string | null; labels: number }> {
  const { db } = deps;
  const [rev] = await db.select().from(decisionReview).where(eq(decisionReview.id, reviewId)).limit(1);
  if (!rev) throw new Error(`decision_review ${reviewId} not found`);
  if (rev.resolvedAt) throw new Error(`decision_review ${reviewId} is already resolved`);
  if (rev.subjectType !== 'detected_change') throw new Error(`decision_review ${reviewId} has unsupported subject ${rev.subjectType}`);
  const [ch] = await db.select().from(detectedChange).where(eq(detectedChange.id, rev.subjectId)).limit(1);
  if (!ch) throw new Error(`detected_change ${rev.subjectId} not found`);
  const [sample] = rev.sampleId ? await db.select().from(decisionSample).where(eq(decisionSample.id, rev.sampleId)).limit(1) : [];

  const verticalIds = ch.clientId ? (await db.select({ v: client.verticalId }).from(client).where(eq(client.id, ch.clientId))).map((r) => r.v) : await competitorVerticals(db, ch.competitorId);
  const packs = await Promise.all(verticalIds.map(deps.packs));
  const questions = (sample?.questions as Record<string, DecisionQuestion> | undefined) ??
    (ch.source === 'web' ? buildTagQuestions(packs) : buildStructuredQuestions(ch.details.changeType as ChangeType, packs));

  const human: Record<string, ResolvedAnswer> = {};
  for (const [key, raw] of Object.entries(input.answers)) {
    const q = questions[key];
    if (!q) throw new Error(`unknown question "${key}" for decision_review ${reviewId}`);
    human[key] = humanAnswer(key, q, raw);
  }
  const merged = { ...(rev.answers as Record<string, ResolvedAnswer>), ...human };

  const [link] = await db
    .select({ eventId: eventChange.eventId })
    .from(eventChange)
    .innerJoin(changeEvent, eq(changeEvent.id, eventChange.eventId))
    .where(and(eq(eventChange.changeId, ch.id), isNull(changeEvent.retractedAt)))
    .limit(1);
  let eventId: string | null = link?.eventId ?? null;
  // Loaded before the transaction: loadWebChange/blockEmbedding take the pool Db.
  const webRow = ch.source === 'web' ? await loadWebChange(db, ch.id) : undefined;
  const embedding = webRow ? await blockEmbedding(db, webRow.change) : null;

  let action: ResolveAction = 'unchanged';
  let labels = 0;
  await db.transaction(async (tx) => {
    if (ch.source === 'web') {
      const res = resolveTag(ch.numericChanges, { answers: merged, needsReview: [] }, packs);
      // A human "not meaningful" wins even over the money rule (which binds models, decision 8).
      const meaningful = human.meaningful?.type === 'noul' ? human.meaningful.value : res.meaningful;
      const type = res.type === 'cosmetic' ? 'content' : res.type;
      if (!meaningful) {
        await tx.update(detectedChange).set({ status: 'cosmetic' }).where(eq(detectedChange.id, ch.id));
        if (eventId) {
          const d = await detachChange(tx, ch.id, 'review');
          action = d?.retracted ? 'retracted' : 'detached';
        }
      } else if (!eventId) {
        if (!webRow) throw new Error(`detected_change ${ch.id} has no capture`);
        eventId = await writeEvent(tx, ch.id, { ...webEventValues(webRow, { ...res, type, meaningful: true, needsReview: [], confidence: 1 }, embedding), needsReview: false }, null);
        await tx.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, ch.id));
        action = 'created';
      } else {
        await tx.update(changeEvent).set({ changeType: type, services: res.services, needsReview: false }).where(eq(changeEvent.id, eventId));
        await tx.delete(eventScore).where(eq(eventScore.eventId, eventId));
        action = 'updated';
      }
    } else if (eventId) {
      const services = Object.fromEntries(
        packs.map((p) => {
          const v = merged[serviceQuestionKey(p.id)]?.value;
          return [p.id, typeof v === 'string' && p.services.some((s) => s.id === v) ? v : null];
        }),
      );
      const offer = human.offer?.type === 'noul' ? human.offer.value : undefined;
      await tx
        .update(changeEvent)
        .set({ services, needsReview: false, ...(offer === undefined ? {} : { details: sql`jsonb_set(${changeEvent.details}, '{offer}', ${JSON.stringify(offer)}::jsonb)` }) })
        .where(eq(changeEvent.id, eventId));
      await tx.delete(eventScore).where(eq(eventScore.eventId, eventId));
      action = 'updated';
    }
    await tx.update(decisionReview).set({ resolvedAt: new Date(), resolvedBy: input.resolvedBy, resolution: input.answers }).where(eq(decisionReview.id, reviewId));
    if (sample) {
      for (const [key, a] of Object.entries(human)) {
        const value = String(a.value);
        await tx
          .insert(decisionLabel)
          .values({ sampleId: sample.id, questionKey: key, value, source: 'review', labeledBy: input.resolvedBy })
          .onConflictDoUpdate({ target: [decisionLabel.sampleId, decisionLabel.questionKey], set: { value, source: 'review', labeledBy: input.resolvedBy } });
        labels++;
      }
    }
  });
  if (eventId && (action === 'created' || action === 'updated')) await scoreEvent({ db, packs: deps.packs }, eventId);
  return { action, eventId: action === 'unchanged' ? null : eventId, labels };
}
```

Note: `loadWebChange` and `blockEmbedding` take `Db`; `Tx` is not passed to them. Export `resolve.ts` from `packages/engine/src/index.ts`.

- [ ] **Step 5: Run and commit**

Run: `pnpm --filter @cs/engine exec vitest run model-ops tag && pnpm typecheck`
Expected: PASS.

```bash
git add packages/engine/src
git commit -m "feat(engine): resolve decision_review rows into events, retractions and gold labels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The `decisions` CLI

**Files:**
- Create: `apps/worker/src/cli/decisions-args.ts`, `apps/worker/src/cli/decisions.ts`
- Modify: `apps/worker/package.json` (script)
- Test: `apps/worker/src/cli/decisions-args.test.ts`

**Interfaces:**
- Consumes: `exportUnlabeled`, `toCsv`, `parseLabelCsv`, `importLabels`, `loadLabeledAnswers`, `computeDecisionReport`, `formatReport` (Task 4); `listOpenReviews`, `resolveDecisionReview` (Task 6).
- Produces: `parseDecisionsArgs(argv: string[]): DecisionsCommand | { error: string }` with
  `type DecisionsCommand = { cmd: 'report'; task?: string; since?: Date } | { cmd: 'export'; out: string; task?: string; limit: number } | { cmd: 'import'; in: string; by: string } | { cmd: 'reviews'; limit: number } | { cmd: 'resolve'; reviewId: string; by: string; answers: Record<string, string | boolean> }`; `DECISIONS_USAGE`. Script `pnpm --filter @cs/worker decisions <cmd> …`.

- [ ] **Step 1: Write the failing parser tests**

Create `apps/worker/src/cli/decisions-args.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDecisionsArgs } from './decisions-args';

const ID = '00000000-0000-4000-8000-000000000001';

describe('parseDecisionsArgs', () => {
  it('parses each command', () => {
    expect(parseDecisionsArgs(['report', '--task', 'tag_decisions', '--since', '2026-10-01'])).toEqual({ cmd: 'report', task: 'tag_decisions', since: new Date('2026-10-01T00:00:00Z') });
    expect(parseDecisionsArgs(['export', '--out', 'labels.csv'])).toEqual({ cmd: 'export', out: 'labels.csv', limit: 200 });
    expect(parseDecisionsArgs(['import', '--in', 'labels.csv', '--by', 'owner'])).toEqual({ cmd: 'import', in: 'labels.csv', by: 'owner' });
    expect(parseDecisionsArgs(['reviews', '--limit', '5'])).toEqual({ cmd: 'reviews', limit: 5 });
    expect(parseDecisionsArgs(['resolve', ID, '--by', 'am', '--answer', 'meaningful=false', '--answer', 'service_hvac_plumbing=duct_cleaning'])).toEqual({
      cmd: 'resolve', reviewId: ID, by: 'am', answers: { meaningful: false, service_hvac_plumbing: 'duct_cleaning' },
    });
  });

  it('rejects bad input with the usage text', () => {
    for (const argv of [[], ['nope'], ['export'], ['import', '--in', 'x'], ['resolve', 'not-a-uuid', '--by', 'am', '--answer', 'm=true'], ['resolve', ID, '--by', 'am'], ['resolve', ID, '--by', 'am', '--answer', 'novalue'], ['report', '--since', 'yesterday'], ['reviews', '--limit', '0']]) {
      const r = parseDecisionsArgs(argv);
      expect('error' in r, argv.join(' ')).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/Usage:/);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cs/worker exec vitest run decisions-args`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

`apps/worker/src/cli/decisions-args.ts`:

```ts
import { parseArgs } from 'node:util';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DECISIONS_USAGE = [
  'Usage: pnpm --filter @cs/worker decisions <command>',
  '  report  [--task <ai task>] [--since <YYYY-MM-DD>]      accuracy and calibration per task/family/provider',
  '  export  --out <file.csv> [--task <ai task>] [--limit <n samples, default 200>]   unlabelled questions to label',
  '  import  --in <file.csv> --by <your name>               load the filled-in label column',
  '  reviews [--limit <n, default 20>]                       open decision_review queue',
  '  resolve <review uuid> --by <name> --answer key=value [--answer key=value …]',
].join('\n');

export type DecisionsCommand =
  | { cmd: 'report'; task?: string; since?: Date }
  | { cmd: 'export'; out: string; task?: string; limit: number }
  | { cmd: 'import'; in: string; by: string }
  | { cmd: 'reviews'; limit: number }
  | { cmd: 'resolve'; reviewId: string; by: string; answers: Record<string, string | boolean> };

const fail = (msg: string) => ({ error: `${msg}\n${DECISIONS_USAGE}` });
const positiveInt = (v: string | undefined, fallback: number) => (v === undefined ? fallback : Number(v));

export function parseDecisionsArgs(argv: string[]): DecisionsCommand | { error: string } {
  const [cmd, ...rest] = argv;
  let values: Record<string, string | string[] | boolean | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest, allowPositionals: true,
      options: {
        task: { type: 'string' }, since: { type: 'string' }, out: { type: 'string' }, in: { type: 'string' }, by: { type: 'string' },
        limit: { type: 'string' }, answer: { type: 'string', multiple: true },
      },
    }));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const str = (k: string) => values[k] as string | undefined;
  switch (cmd) {
    case 'report': {
      const since = str('since');
      if (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(since)) return fail(`--since must be YYYY-MM-DD (got "${since}")`);
      return { cmd, ...(str('task') ? { task: str('task') } : {}), ...(since ? { since: new Date(`${since}T00:00:00Z`) } : {}) };
    }
    case 'export': {
      const limit = positiveInt(str('limit'), 200);
      if (!str('out')) return fail('export needs --out <file.csv>');
      if (!Number.isInteger(limit) || limit < 1) return fail(`--limit must be a positive integer (got "${str('limit')}")`);
      return { cmd, out: str('out')!, ...(str('task') ? { task: str('task') } : {}), limit };
    }
    case 'import':
      if (!str('in') || !str('by')) return fail('import needs --in <file.csv> and --by <name>');
      return { cmd, in: str('in')!, by: str('by')! };
    case 'reviews': {
      const limit = positiveInt(str('limit'), 20);
      if (!Number.isInteger(limit) || limit < 1) return fail(`--limit must be a positive integer (got "${str('limit')}")`);
      return { cmd, limit };
    }
    case 'resolve': {
      const reviewId = positionals[0];
      if (!reviewId || !UUID.test(reviewId)) return fail(`resolve needs a review uuid (got "${reviewId ?? ''}")`);
      if (!str('by')) return fail('resolve needs --by <name>');
      const raw = (values.answer as string[] | undefined) ?? [];
      if (raw.length === 0) return fail('resolve needs at least one --answer key=value');
      const answers: Record<string, string | boolean> = {};
      for (const a of raw) {
        const i = a.indexOf('=');
        if (i <= 0 || i === a.length - 1) return fail(`--answer must be key=value (got "${a}")`);
        const v = a.slice(i + 1);
        answers[a.slice(0, i)] = v === 'true' ? true : v === 'false' ? false : v;
      }
      return { cmd, reviewId, by: str('by')!, answers };
    }
    default:
      return fail(cmd ? `unknown command "${cmd}"` : 'missing command');
  }
}
```

- [ ] **Step 4: Implement the CLI**

`apps/worker/src/cli/decisions.ts` (same bootstrap as `engine-once.ts`):

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { createDb } = await import('@cs/db');
const {
  computeDecisionReport, createPackLoader, exportUnlabeled, formatReport, importLabels, listOpenReviews, loadLabeledAnswers, parseLabelCsv, resolveDecisionReview, toCsv,
} = await import('@cs/engine');
const { parseDecisionsArgs } = await import('./decisions-args');

const args = parseDecisionsArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(url);
let code = 0;
try {
  switch (args.cmd) {
    case 'report':
      console.log(formatReport(computeDecisionReport(await loadLabeledAnswers(db, { task: args.task, since: args.since }))));
      break;
    case 'export': {
      const rows = await exportUnlabeled(db, { task: args.task, limit: args.limit });
      await writeFile(args.out, toCsv(rows), 'utf8');
      console.log(`wrote ${rows.length} unlabelled question(s) to ${args.out} — fill in the "label" column, then run: decisions import --in ${args.out} --by <name>`);
      break;
    }
    case 'import': {
      const r = await importLabels(db, parseLabelCsv(await readFile(args.in, 'utf8')), { labeledBy: args.by });
      console.log(`imported ${r.imported} label(s)`);
      for (const e of r.errors) console.error(`  skipped: ${e}`);
      if (r.errors.length > 0) code = 1;
      break;
    }
    case 'reviews': {
      const open = await listOpenReviews(db, args.limit);
      if (open.length === 0) console.log('no open reviews');
      for (const r of open) {
        const said = Object.entries(r.answers).map(([k, a]) => `${k}=${String((a as { value?: unknown }).value)}(${((a as { confidence?: number }).confidence ?? 0).toFixed(2)})`).join(' ');
        console.log(`${r.id} ${r.createdAt.toISOString().slice(0, 10)} ${r.competitorName} [${r.source} ${r.kind}] needs: ${r.keys.join(',')}\n    model: ${said}\n    before: ${(r.beforeText ?? '').slice(0, 160)}\n    after:  ${(r.afterText ?? '').slice(0, 160)}`);
      }
      break;
    }
    case 'resolve':
      console.log(JSON.stringify(await resolveDecisionReview({ db, packs: createPackLoader() }, args.reviewId, { answers: args.answers, resolvedBy: args.by })));
      break;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  code = 1;
} finally {
  await close();
}
process.exit(code);
```

`apps/worker/package.json` scripts: add `"decisions": "tsx src/cli/decisions.ts"`.

The CSV holds redacted decision states (decision 3) — tell the user to keep exported files out of the repo (`*.csv` at the repo root is not ignored; write them under the scratchpad or `%TEMP%`).

- [ ] **Step 5: Run and commit**

Run: `pnpm --filter @cs/worker exec vitest run decisions-args && pnpm typecheck && pnpm --filter @cs/worker decisions report`
Expected: tests PASS; the last command prints "No labelled decisions yet…" against `cs_dev`.

```bash
git add apps/worker
git commit -m "feat(worker): decisions CLI — report, label export/import, review queue and resolution

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Anthropic Message Batches provider (opt-in)

**Files:**
- Modify: `packages/ai/package.json` (+ `@anthropic-ai/sdk@^0.131.0`), `packages/ai/src/config.ts`, `packages/ai/src/ai.ts`, `packages/ai/src/env.ts`, `packages/ai/src/index.ts`, `packages/ai/config/ai.yaml`, `turbo.json`
- Create: `packages/ai/src/anthropic-batch.ts`, `packages/ai/src/anthropic-batch.live.test.ts`
- Modify (test doubles that implement `Ai`): `packages/engine/test/fake-ai.ts`, `packages/collectors/src/discovery/discover.test.ts` (`fakeAi()` at line 31 and the literal at line 142), `packages/engine/src/reviews/discovery.test.ts:95`
- Test: `packages/ai/src/anthropic-batch.test.ts`, `packages/ai/src/config.test.ts`

**Interfaces:**
- Produces:
  - `anthropic-batch.ts`: `interface BatchRequest { customId: string; messages: ChatMessage[]; jsonSchema?: JsonSchemaFormat }`; `type BatchItemResult = { customId: string; ok: true; text: string; model: string; inputTokens: number; outputTokens: number } | { customId: string; ok: false; error: string }`; `interface BatchProvider { readonly id: string; submit(input: { model: string; maxTokens: number; requests: BatchRequest[] }): Promise<string>; status(batchId: string): Promise<'in_progress' | 'ended'>; results(batchId: string): Promise<BatchItemResult[]> }`; `interface AnthropicBatchesApi` (SDK subset); `toBatchRequest(model, maxTokens, r: BatchRequest)`; `createAnthropicBatchProvider(opts: { apiKey?: string; api?: AnthropicBatchesApi }): BatchProvider`.
  - `Ai` gains `batchAvailable(task: string): boolean`, `submitBatch(task: string, requests: BatchRequest[], scope: CallScope): Promise<string>`, `collectBatch(task: string, batchId: string, scope: CallScope): Promise<{ status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] }>`; `AiDeps.batch?: BatchProvider | null`.
  - Config: provider `anthropic` (`mode: batch`, `model`, `max_tokens` default 8000, `input_usd_per_mtok`, `output_usd_per_mtok` — batch prices); task `theme_discovery_batch`.
  - `FakeAi` (engine tests) accepts `batch?: { submit?: (task: string, requests: BatchRequest[]) => string; collect?: (task: string, batchId: string) => { status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] } }` and records `calls.batches`.

- [ ] **Step 1: Install the SDK**

Run: `pnpm --filter @cs/ai add @anthropic-ai/sdk@^0.131.0`

- [ ] **Step 2: Write the failing provider tests**

Create `packages/ai/src/anthropic-batch.test.ts`:

```ts
import type { BatchCreateParams, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import { describe, expect, it, vi } from 'vitest';
import { type AnthropicBatchesApi, createAnthropicBatchProvider, toBatchRequest } from './anthropic-batch';

function fakeApi(results: MessageBatchIndividualResponse[], status: 'in_progress' | 'ended' = 'ended') {
  const created: BatchCreateParams[] = [];
  const api: AnthropicBatchesApi = {
    create: vi.fn(async (p: BatchCreateParams) => {
      created.push(p);
      return { id: 'msgbatch_01' };
    }),
    retrieve: vi.fn(async () => ({ processing_status: status })),
    results: vi.fn(async () => (async function* () {
      yield* results;
    })()),
  };
  return { api, created };
}

const message = (text: string, stop = 'end_turn') =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: stop, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text }], usage: { input_tokens: 1200, output_tokens: 80 } }) as never;

describe('Anthropic Message Batches provider', () => {
  it('maps system messages to the system field and JSON schemas to output_config.format', () => {
    const r = toBatchRequest('claude-sonnet-5', 8000, {
      customId: 'hvac_plumbing', jsonSchema: { name: 'theme_proposal', schema: { type: 'object' } },
      messages: [{ role: 'system', content: 'You read reviews.' }, { role: 'user', content: 'REVIEWS…' }],
    });
    expect(r).toEqual({
      custom_id: 'hvac_plumbing',
      params: { model: 'claude-sonnet-5', max_tokens: 8000, system: 'You read reviews.', messages: [{ role: 'user', content: 'REVIEWS…' }], output_config: { format: { type: 'json_schema', schema: { type: 'object' } } } },
    });
  });

  it('submits one request per custom_id and rejects ids the API would refuse', async () => {
    const { api, created } = fakeApi([]);
    const p = createAnthropicBatchProvider({ api });
    expect(await p.submit({ model: 'claude-sonnet-5', maxTokens: 100, requests: [{ customId: 'dental', messages: [{ role: 'user', content: 'x' }] }] })).toBe('msgbatch_01');
    expect(created[0]!.requests).toHaveLength(1);
    await expect(p.submit({ model: 'm', maxTokens: 1, requests: [{ customId: 'has space', messages: [] }] })).rejects.toThrow(/custom_id/);
    await expect(p.submit({ model: 'm', maxTokens: 1, requests: [] })).rejects.toThrow(/at least one/);
  });

  it('reads text blocks of succeeded results and turns refusals, errors and expiries into failed items', async () => {
    const { api } = fakeApi([
      { custom_id: 'a', result: { type: 'succeeded', message: message('{"found":false}') } },
      { custom_id: 'b', result: { type: 'succeeded', message: message('', 'refusal') } },
      { custom_id: 'c', result: { type: 'errored', error: { type: 'error', error: { type: 'overloaded_error', message: 'busy' } } } as never },
      { custom_id: 'd', result: { type: 'expired' } },
    ]);
    const r = await createAnthropicBatchProvider({ api }).results('msgbatch_01');
    expect(r).toEqual([
      { customId: 'a', ok: true, text: '{"found":false}', model: 'claude-sonnet-5', inputTokens: 1200, outputTokens: 80 },
      { customId: 'b', ok: false, error: 'refused (stop_reason refusal)' },
      { customId: 'c', ok: false, error: expect.stringContaining('overloaded_error') },
      { customId: 'd', ok: false, error: 'expired' },
    ]);
  });

  it('reports in_progress until the batch has ended', async () => {
    expect(await createAnthropicBatchProvider({ api: fakeApi([], 'in_progress').api }).status('x')).toBe('in_progress');
    expect(await createAnthropicBatchProvider({ api: fakeApi([], 'ended').api }).status('x')).toBe('ended');
  });
});
```

Add to `packages/ai/src/config.test.ts` (inside the existing describe):

```ts
  it('accepts an anthropic batch task and ships theme_discovery_batch (Phase 3d)', async () => {
    const t = parseAiConfig('tasks:\n  b: { provider: anthropic, model: claude-sonnet-5, mode: batch, input_usd_per_mtok: 1, output_usd_per_mtok: 5 }').tasks.b;
    expect(t).toMatchObject({ provider: 'anthropic', mode: 'batch', max_tokens: 8000 });
    expect(() => parseAiConfig('tasks:\n  b: { provider: anthropic, model: m, mode: batch }')).toThrow();
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    expect(cfg.tasks.theme_discovery_batch).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5', mode: 'batch' });
  });
```

And to `packages/ai/src/ai.test.ts`, a facade test (extend `harness` so `createAi` receives a `batch` provider when `opts.batch` is set and the inline config gains `theme_discovery_batch: { provider: anthropic, model: claude-sonnet-5, mode: batch, input_usd_per_mtok: 1, output_usd_per_mtok: 5 }`):

```ts
  it('batch tasks: available only with a provider; collect ledgers one row per result at batch prices', async () => {
    const provider = {
      id: 'anthropic',
      submit: vi.fn(async () => 'msgbatch_9'),
      status: vi.fn(async () => 'ended' as const),
      results: vi.fn(async () => [
        { customId: 'hvac_plumbing', ok: true as const, text: '{}', model: 'claude-sonnet-5', inputTokens: 1_000_000, outputTokens: 100_000 },
        { customId: 'dental', ok: false as const, error: 'expired' },
      ]),
    };
    const records: LlmCallRecord[] = [];
    const ledger: LedgerSink = { recordLlmCall: async (r) => { records.push(r); }, recordVendorCall: async () => {} };
    const noBatch = createAi(config, { openrouter: { id: 'openrouter', complete: vi.fn() } as unknown as ChatProvider, jev: null, ledger });
    expect(noBatch.batchAvailable('theme_discovery_batch')).toBe(false);
    const ai = createAi(config, { openrouter: { id: 'openrouter', complete: vi.fn() } as unknown as ChatProvider, jev: null, ledger, batch: provider });
    expect(ai.batchAvailable('theme_discovery_batch')).toBe(true);
    expect(ai.batchAvailable('brief_writer')).toBe(false);
    expect(await ai.submitBatch('theme_discovery_batch', [{ customId: 'hvac_plumbing', messages: [{ role: 'user', content: 'x' }] }], scope)).toBe('msgbatch_9');
    const r = await ai.collectBatch('theme_discovery_batch', 'msgbatch_9', scope);
    expect(r.status).toBe('ended');
    expect(records.map((x) => [x.task, x.provider, x.ok, x.costUsd])).toEqual([['theme_discovery_batch', 'anthropic', true, 1.5], ['theme_discovery_batch', 'anthropic', false, null]]);
    await expect(ai.chat('theme_discovery_batch', { messages: [] }, scope)).rejects.toThrow(/not a chat task/);
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @cs/ai exec vitest run anthropic-batch config ai.test`
Expected: FAIL — module not found / `provider: anthropic` rejected.

- [ ] **Step 4: Implement the provider**

Create `packages/ai/src/anthropic-batch.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { BatchCreateParams, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import type { ChatMessage, JsonSchemaFormat } from './chat';

export interface BatchRequest {
  /** Matches ^[a-zA-Z0-9_-]{1,64}$; results come back in any order and are keyed by it. */
  customId: string;
  messages: ChatMessage[];
  jsonSchema?: JsonSchemaFormat;
}

export type BatchItemResult =
  | { customId: string; ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { customId: string; ok: false; error: string };

export interface BatchProvider {
  readonly id: string;
  submit(input: { model: string; maxTokens: number; requests: BatchRequest[] }): Promise<string>;
  status(batchId: string): Promise<'in_progress' | 'ended'>;
  results(batchId: string): Promise<BatchItemResult[]>;
}

/** The part of the SDK's `client.messages.batches` this provider uses (tests inject a fake). */
export interface AnthropicBatchesApi {
  create(params: BatchCreateParams): Promise<{ id: string }>;
  retrieve(batchId: string): Promise<{ processing_status: 'in_progress' | 'canceling' | 'ended' }>;
  results(batchId: string): Promise<AsyncIterable<MessageBatchIndividualResponse>>;
}

const CUSTOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;

/** Our chat messages → one Messages API request: system messages go to `system`, a JSON schema to output_config.format. */
export function toBatchRequest(model: string, maxTokens: number, r: BatchRequest): BatchCreateParams.Request {
  const system = r.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const messages = r.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return {
    custom_id: r.customId,
    params: {
      model, max_tokens: maxTokens, ...(system ? { system } : {}), messages,
      ...(r.jsonSchema ? { output_config: { format: { type: 'json_schema' as const, schema: r.jsonSchema.schema } } } : {}),
    },
  };
}

/** Anthropic Message Batches through the official SDK (spec §7.1 "Anthropic direct … Batch API discounts"). */
export function createAnthropicBatchProvider(opts: { apiKey?: string; api?: AnthropicBatchesApi }): BatchProvider {
  const api: AnthropicBatchesApi = opts.api ?? (new Anthropic({ apiKey: opts.apiKey }).messages.batches as unknown as AnthropicBatchesApi);
  return {
    id: 'anthropic',
    async submit({ model, maxTokens, requests }) {
      if (requests.length === 0) throw new Error('a batch needs at least one request');
      for (const r of requests) if (!CUSTOM_ID.test(r.customId)) throw new Error(`invalid batch custom_id "${r.customId}"`);
      return (await api.create({ requests: requests.map((r) => toBatchRequest(model, maxTokens, r)) })).id;
    },
    async status(batchId) {
      return (await api.retrieve(batchId)).processing_status === 'ended' ? 'ended' : 'in_progress';
    },
    async results(batchId) {
      const out: BatchItemResult[] = [];
      for await (const item of await api.results(batchId)) {
        const r = item.result;
        if (r.type !== 'succeeded') {
          out.push({ customId: item.custom_id, ok: false, error: r.type === 'errored' ? `errored: ${JSON.stringify(r.error).slice(0, 300)}` : r.type });
          continue;
        }
        const m = r.message;
        // Sonnet 5 thinks adaptively: skip thinking blocks, keep the text.
        const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        if ((m.stop_reason as string) === 'refusal' || text === '') {
          out.push({ customId: item.custom_id, ok: false, error: `${(m.stop_reason as string) === 'refusal' ? 'refused' : 'no text'} (stop_reason ${m.stop_reason})` });
          continue;
        }
        out.push({ customId: item.custom_id, ok: true, text, model: m.model, inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens });
      }
      return out;
    },
  };
}
```

`packages/ai/src/config.ts` — add and include in the union:

```ts
/** Anthropic Message Batches (Phase 3d decision 9). Prices are batch prices (already 50% of list), for the ledger. */
const anthropicTask = z.object({
  provider: z.literal('anthropic'),
  model: z.string().min(1),
  mode: z.literal('batch'),
  max_tokens: z.number().int().positive().default(8000),
  input_usd_per_mtok: z.number().nonnegative(),
  output_usd_per_mtok: z.number().nonnegative(),
});

const taskSchema = z.discriminatedUnion('provider', [openRouterTask, jevTask, anthropicTask]);
```

`packages/ai/src/ai.ts` — add to `Ai`, `AiDeps` and the returned object:

```ts
  batchAvailable(task: string): boolean;
  submitBatch(task: string, requests: BatchRequest[], scope: CallScope): Promise<string>;
  collectBatch(task: string, batchId: string, scope: CallScope): Promise<{ status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] }>;
```
```ts
  /** Anthropic Message Batches; null/absent when ANTHROPIC_API_KEY is not set (batch tasks are then unavailable). */
  batch?: BatchProvider | null;
```
```ts
    batchAvailable(name) {
      const t = config.tasks[name];
      return t?.provider === 'anthropic' && Boolean(deps.batch);
    },

    async submitBatch(name, requests, _scope) {
      const t = task(name);
      if (t.provider !== 'anthropic') throw new Error(`Task ${name} is not a batch task`);
      if (!deps.batch) throw new Error(`Task ${name} needs ANTHROPIC_API_KEY`);
      return deps.batch.submit({ model: t.model, maxTokens: t.max_tokens, requests });
    },

    /** Usage is ledgered when results are collected (one row per request), at the task's batch prices. */
    async collectBatch(name, batchId, scope) {
      const t = task(name);
      if (t.provider !== 'anthropic') throw new Error(`Task ${name} is not a batch task`);
      if (!deps.batch) throw new Error(`Task ${name} needs ANTHROPIC_API_KEY`);
      if ((await deps.batch.status(batchId)) !== 'ended') return { status: 'in_progress' };
      const results = await deps.batch.results(batchId);
      for (const r of results) {
        await safeRecord(deps.ledger, r.ok
          ? { ...scope, task: name, provider: deps.batch.id, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
              costUsd: (r.inputTokens * t.input_usd_per_mtok + r.outputTokens * t.output_usd_per_mtok) / 1_000_000, latencyMs: 0, ok: true }
          : { ...scope, task: name, provider: deps.batch.id, model: t.model, inputTokens: 0, outputTokens: 0, costUsd: null, latencyMs: 0, ok: false });
      }
      return { status: 'ended', results };
    },
```

`packages/ai/src/env.ts` — `batch: env.ANTHROPIC_API_KEY ? createAnthropicBatchProvider({ apiKey: env.ANTHROPIC_API_KEY }) : null` in the `createAi` deps. Export `./anthropic-batch` from `index.ts`.

`packages/ai/config/ai.yaml` — append:

```yaml
  # Opt-in (Phase 3d decision 9): used only when ANTHROPIC_API_KEY is set; otherwise theme discovery stays on theme_discovery.
  # Anthropic Message Batches: claude-sonnet-5 at batch prices ($2/$10 list → $1/$5 per MTok). Not OpenRouter ZDR-routed.
  theme_discovery_batch: { provider: anthropic, model: claude-sonnet-5, mode: batch, max_tokens: 8000, input_usd_per_mtok: 1.0, output_usd_per_mtok: 5.0 }
```

`turbo.json` — add `"ANTHROPIC_API_KEY"` to `globalPassThroughEnv`.

- [ ] **Step 5: Update every `Ai` test double**

`packages/engine/test/fake-ai.ts` — `createFakeAi(opts)` gains `batch?: { submit?: (task: string, requests: BatchRequest[]) => string; collect?: (task: string, batchId: string) => { status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] } }`; `FakeAi['calls']` gains `batches: { task: string; requests: BatchRequest[] }[]`; and the returned object gains:

```ts
    batchAvailable: () => opts.batch !== undefined,
    async submitBatch(task, requests) {
      calls.batches.push({ task, requests });
      if (!opts.batch?.submit) throw new Error('fake ai: no batch submit handler');
      return opts.batch.submit(task, requests);
    },
    async collectBatch(task, batchId) {
      if (!opts.batch?.collect) throw new Error('fake ai: no batch collect handler');
      return opts.batch.collect(task, batchId);
    },
```

In the three literal `Ai` objects (`fakeAi()` and the object at line 142 in `packages/collectors/src/discovery/discover.test.ts`, and `raceAi` at `packages/engine/src/reviews/discovery.test.ts:95`) add (`pnpm typecheck` lists any other double that needs them):

```ts
      batchAvailable: () => false,
      async submitBatch() { throw new Error('not used by this test'); },
      async collectBatch() { throw new Error('not used by this test'); },
```

- [ ] **Step 6: Add the live smoke test**

Create `packages/ai/src/anthropic-batch.live.test.ts` (submits one tiny request — under $0.001 — and only checks the batch was accepted; results are not awaited, batches can take up to 24 h):

```ts
import { describe, expect, it } from 'vitest';
import { createAnthropicBatchProvider } from './anthropic-batch';

const key = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!key)('Anthropic Message Batches (live)', () => {
  it('accepts a one-request batch with a JSON schema and reports its status', async () => {
    const p = createAnthropicBatchProvider({ apiKey: key });
    const id = await p.submit({
      model: 'claude-sonnet-5', maxTokens: 1000,
      requests: [{ customId: 'live_smoke', jsonSchema: { name: 'ok', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } }, messages: [{ role: 'user', content: 'Answer ok=true.' }] }],
    });
    console.log(`[live] anthropic batch ${id}`);
    expect(id).toMatch(/^msgbatch_/);
    expect(['in_progress', 'ended']).toContain(await p.status(id));
  }, 60_000);
});
```

- [ ] **Step 7: Run and commit**

Run: `pnpm --filter @cs/ai test && pnpm typecheck`
Expected: PASS (the live test skips without `ANTHROPIC_API_KEY`).

```bash
git add packages/ai packages/engine/test/fake-ai.ts packages/collectors/src/discovery/discover.test.ts packages/engine/src/reviews/discovery.test.ts turbo.json pnpm-lock.yaml
git commit -m "feat(ai): opt-in Anthropic Message Batches provider via the official SDK

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Theme discovery through batches and the `model-batch-poll` job

**Files:**
- Modify: `packages/engine/src/reviews/discovery.ts`, `packages/engine/src/index.ts`
- Create: `packages/engine/src/model-ops/batches.ts`, `apps/worker/src/jobs/model-ops.ts`
- Modify: `apps/worker/src/deps.ts`, `apps/worker/src/main.ts`
- Test: `packages/engine/src/reviews/discovery.test.ts`, `packages/engine/src/model-ops/batches.test.ts`, `apps/worker/src/jobs/model-ops.test.ts`

**Interfaces:**
- Consumes: `Ai.batchAvailable/submitBatch/collectBatch` (Task 8), `modelBatch` (Task 2).
- Produces:
  - `discovery.ts`: `THEME_BATCH_TASK = 'theme_discovery_batch'`, `THEME_BATCH_PURPOSE = 'theme_discovery'`, `interface ThemeDiscoveryContext { verticalId: string; otherCount: number; sampleReviewIds: string[]; themeIds: string[]; rejectedIds: string[] }`, `prepareThemeDiscovery(deps, verticalId, opts?): Promise<{ context: ThemeDiscoveryContext; messages: ChatMessage[]; jsonSchema: JsonSchemaFormat } | { skipped: string }>`, `applyThemeProposal(db: Db, context: ThemeDiscoveryContext, text: string): Promise<{ status: 'proposed' | 'none'; proposalId: string } | { skipped: string }>`, `submitThemeDiscoveryBatch(deps, verticalIds: string[], opts?): Promise<{ batchId: string | null; submitted: string[]; skipped: Record<string, string> }>`; `discoverTheme` keeps its signature and behaviour; `ReviewInsightsResult` gains `batched: number`.
  - `batches.ts`: `BATCH_MAX_AGE_HOURS = 26`, `interface BatchCollectResult { checked: number; ended: number; applied: number; failed: number; expired: number }`, `collectModelBatches(deps: { db: Db; ai: Ai }, opts?: { now?: Date }): Promise<BatchCollectResult>`.
  - Worker: `WorkerDeps.collectModelBatches(): Promise<BatchCollectResult>`; job `model-batch-poll` (cron `*/15 * * * *`, `retryLimit: 0`).

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/src/reviews/discovery.test.ts` (it already has `unthemed(count)`, `WARRANTY`, `now`):

```ts
import type { BatchItemResult } from '@cs/ai';
import { modelBatch } from '@cs/db';
import { collectModelBatches } from '../model-ops/batches';
import { THEME_BATCH_TASK } from './discovery';

type Collect = (task: string, batchId: string) => { status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] };
const batching = (collect?: Collect) => createFakeAi({ batch: { submit: () => 'msgbatch_1', collect } });

describe('batched theme discovery (Phase 3d decision 10)', () => {
  it('submits one request per eligible vertical and records the batch instead of calling chat', async () => {
    await unthemed(20);
    const ai = batching();
    const r = await runReviewInsights({ db: dbs.service, ai, packs }, { now });
    expect(r).toMatchObject({ batched: 1, proposals: 0, errors: 0 });
    expect(ai.calls.chat).toEqual([]);
    expect(ai.calls.batches[0]!.task).toBe(THEME_BATCH_TASK);
    expect(ai.calls.batches[0]!.requests.map((q) => q.customId)).toEqual(['hvac_plumbing']);
    expect(JSON.stringify(ai.calls.batches[0]!.requests)).not.toContain('Mike');
    const [b] = await dbs.owner.select().from(modelBatch);
    expect(b).toMatchObject({ providerBatchId: 'msgbatch_1', purpose: 'theme_discovery', status: 'submitted', requestCount: 1 });
    expect(Object.keys(b!.items)).toEqual(['hvac_plumbing']);
    // A vertical with a batch in flight is not sent again.
    expect((await runReviewInsights({ db: dbs.service, ai, packs }, { now })).batched).toBe(0);
  });

  it('applies an ended batch: proposes the theme and closes the batch', async () => {
    await unthemed(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    const ai = batching(() => ({ status: 'ended', results: [{ customId: 'hvac_plumbing', ok: true, text: JSON.stringify(WARRANTY), model: 'claude-sonnet-5', inputTokens: 1, outputTokens: 1 }] }));
    expect(await collectModelBatches({ db: dbs.service, ai }, { now })).toEqual({ checked: 1, ended: 1, applied: 1, failed: 0, expired: 0 });
    expect((await dbs.owner.select().from(themeProposal))[0]).toMatchObject({ themeId: 'warranty_claims', status: 'proposed', otherCount: 20 });
    expect((await dbs.owner.select().from(modelBatch))[0]?.status).toBe('ended');
  });

  it('a failed request writes nothing, so the same reviews are offered again next night', async () => {
    await unthemed(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    await collectModelBatches({ db: dbs.service, ai: batching(() => ({ status: 'ended', results: [{ customId: 'hvac_plumbing', ok: false, error: 'expired' }] })) }, { now });
    expect(await dbs.owner.select().from(themeProposal)).toEqual([]);
    expect((await discoverTheme({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now }))).toMatchObject({ status: 'proposed' });
  });

  it('a result for a vertical that got a pending proposal meanwhile is skipped, never a second pending row', async () => {
    await unthemed(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'other_theme', name: 'Other', description: 'd', status: 'proposed', otherCount: 1 });
    const ai = batching(() => ({ status: 'ended', results: [{ customId: 'hvac_plumbing', ok: true, text: JSON.stringify(WARRANTY), model: 'm', inputTokens: 1, outputTokens: 1 }] }));
    expect(await collectModelBatches({ db: dbs.service, ai }, { now })).toMatchObject({ ended: 1, applied: 0 });
    expect((await dbs.owner.select().from(themeProposal)).filter((p) => p.status === 'proposed')).toHaveLength(1);
  });

  it('marks a batch still unfinished after 26 hours as failed', async () => {
    await unthemed(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    const later = new Date(Date.now() + 27 * 3_600_000);
    expect(await collectModelBatches({ db: dbs.service, ai: batching(() => ({ status: 'in_progress' })) }, { now: later })).toMatchObject({ expired: 1 });
    expect((await dbs.owner.select().from(modelBatch))[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/26 h/) });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/engine exec vitest run reviews/discovery`
Expected: FAIL — `collectModelBatches` not found / `batched` undefined.

- [ ] **Step 3: Split `discoverTheme` into prepare / apply**

In `packages/engine/src/reviews/discovery.ts`, keep `SYSTEM`, `proposalJson`, `proposalSchema`, `SLUG` and the constants, add the imports `type ChatMessage, type JsonSchemaFormat` (from `@cs/ai`) and `modelBatch` (from `@cs/db`), and restructure (the bodies below are the 3c code moved into prepare/apply):

```ts
export const THEME_BATCH_TASK = 'theme_discovery_batch';
export const THEME_BATCH_PURPOSE = 'theme_discovery';

/** Everything needed to apply a proposal later (batched) exactly as the synchronous path does. */
export interface ThemeDiscoveryContext {
  verticalId: string;
  otherCount: number;
  sampleReviewIds: string[];
  themeIds: string[];
  rejectedIds: string[];
}

export async function prepareThemeDiscovery(
  deps: { db: Db; packs: PackLoader },
  verticalId: string,
  opts: { now?: Date } = {},
): Promise<{ context: ThemeDiscoveryContext; messages: ChatMessage[]; jsonSchema: JsonSchemaFormat } | { skipped: string }> {
  const now = opts.now ?? new Date();
  const [pending] = await deps.db.select({ id: themeProposal.id }).from(themeProposal).where(and(eq(themeProposal.verticalId, verticalId), eq(themeProposal.status, 'proposed'))).limit(1);
  if (pending) return { skipped: 'a proposal is awaiting approval' };
  const [inFlight] = await deps.db
    .select({ id: modelBatch.id })
    .from(modelBatch)
    .where(and(eq(modelBatch.status, 'submitted'), eq(modelBatch.purpose, THEME_BATCH_PURPOSE), sql`${modelBatch.items} ? ${verticalId}`))
    .limit(1);
  if (inFlight) return { skipped: 'a theme-discovery batch is in flight' };
  const [last] = await deps.db.select({ at: themeProposal.createdAt }).from(themeProposal).where(eq(themeProposal.verticalId, verticalId)).orderBy(desc(themeProposal.createdAt)).limit(1);

  const rows = await deps.db
    .select({ id: review.id, text: review.text, competitorName: competitor.name })
    .from(reviewAnalysis)
    .innerJoin(review, eq(review.id, reviewAnalysis.reviewId))
    .innerJoin(competitor, eq(competitor.id, review.competitorId))
    .where(
      and(
        eq(reviewAnalysis.verticalId, verticalId), eq(reviewAnalysis.other, true), sql`jsonb_array_length(${reviewAnalysis.themes}) = 0`,
        last ? gt(reviewAnalysis.analyzedAt, last.at) : undefined,
        gt(review.postedAt, new Date(now.getTime() - THEME_DISCOVERY_DAYS * DAY_MS)), lte(review.postedAt, now),
      ),
    )
    .orderBy(desc(review.postedAt));
  if (rows.length < THEME_DISCOVERY_MIN_OTHER) return { skipped: `${rows.length} unthemed review(s) since the last proposal` };

  const pack = await deps.packs(verticalId);
  const themes = await themesForVertical(deps.db, pack);
  const rejectedIds = new Set(
    (await deps.db.selectDistinct({ id: themeProposal.themeId }).from(themeProposal).where(and(eq(themeProposal.verticalId, verticalId), eq(themeProposal.status, 'rejected')))).map((r) => r.id),
  );
  const sample = rows.slice(0, THEME_DISCOVERY_SAMPLE);
  const listed = sample
    .map((r, i) => `${i + 1}. ${redactForModel(r.text ?? '', { businessNames: [r.competitorName] }).slice(0, SAMPLE_CHARS).replace(/<(\/?)reviews/gi, '&lt;$1reviews')}`)
    .join('\n');
  return {
    context: { verticalId, otherCount: rows.length, sampleReviewIds: sample.slice(0, SAMPLE_IDS_KEPT).map((r) => r.id), themeIds: themes.map((t) => t.id), rejectedIds: [...rejectedIds] },
    jsonSchema: { name: 'theme_proposal', schema: proposalJson },
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Business type: ${pack.name}\nEXISTING topics: ${themes.map((t) => `${t.id} (${t.name})`).join(', ')}\nREJECTED topics (already proposed and turned down — never propose these ids again): ${[...rejectedIds].join(', ') || 'none'}\n<reviews>\n${listed}\n</reviews>`,
      },
    ],
  };
}

/** Validates a model's proposal text and records it (or a 'none'). Used by the sync path and by batch collection. */
export async function applyThemeProposal(db: Db, ctx: ThemeDiscoveryContext, text: string): Promise<{ status: 'proposed' | 'none'; proposalId: string } | { skipped: string }> {
  let parsed: z.infer<typeof proposalSchema> | null = null;
  try {
    const p = proposalSchema.safeParse(JSON.parse(text));
    parsed = p.success ? p.data : null;
  } catch {
    parsed = null;
  }
  // A batch result can arrive after an AM decision: re-read the vertical's live and rejected ids now.
  const decided = await db.select({ id: themeProposal.themeId, status: themeProposal.status }).from(themeProposal).where(eq(themeProposal.verticalId, ctx.verticalId));
  const taken = new Set([...ctx.themeIds, ...decided.filter((d) => d.status === 'approved').map((d) => d.id)]);
  const rejected = new Set([...ctx.rejectedIds, ...decided.filter((d) => d.status === 'rejected').map((d) => d.id)]);
  const name = parsed?.name.trim().slice(0, 60) ?? '';
  const description = parsed?.description.trim().slice(0, 200) ?? '';
  const valid = parsed !== null && parsed.found && SLUG.test(parsed.id) && !taken.has(parsed.id) && !rejected.has(parsed.id) && name.length > 0 && description.length > 0;
  if (valid && decided.some((d) => d.status === 'proposed')) return { skipped: 'a proposal is awaiting approval' };
  const status: ThemeProposalStatus = valid ? 'proposed' : 'none';
  try {
    const [row] = await db
      .insert(themeProposal)
      .values({
        verticalId: ctx.verticalId, themeId: valid ? parsed!.id : '', name: valid ? name : '', description: valid ? description : '', status,
        otherCount: ctx.otherCount, sampleReviewIds: ctx.sampleReviewIds,
      })
      .returning({ id: themeProposal.id });
    return { status, proposalId: row!.id };
  } catch (err) {
    if (valid && isUniqueViolation(err)) return { skipped: 'a proposal is awaiting approval' };
    throw err;
  }
}

/** Synchronous path (no ANTHROPIC_API_KEY): unchanged behaviour. */
export async function discoverTheme(deps: { db: Db; ai: Ai; packs: PackLoader }, verticalId: string, opts: { now?: Date } = {}) {
  const prep = await prepareThemeDiscovery(deps, verticalId, opts);
  if ('skipped' in prep) return prep;
  const res = await deps.ai.chat('theme_discovery', { jsonSchema: prep.jsonSchema, messages: prep.messages }, PLATFORM);
  return applyThemeProposal(deps.db, prep.context, res.text);
}

/** One batch for every vertical that has enough unthemed reviews and nothing in flight (custom_id = vertical id). */
export async function submitThemeDiscoveryBatch(
  deps: { db: Db; ai: Ai; packs: PackLoader },
  verticalIds: string[],
  opts: { now?: Date } = {},
): Promise<{ batchId: string | null; submitted: string[]; skipped: Record<string, string> }> {
  const skipped: Record<string, string> = {};
  const prepared: { context: ThemeDiscoveryContext; messages: ChatMessage[]; jsonSchema: JsonSchemaFormat }[] = [];
  for (const v of verticalIds) {
    const p = await prepareThemeDiscovery(deps, v, opts);
    if ('skipped' in p) skipped[v] = p.skipped;
    else prepared.push(p);
  }
  if (prepared.length === 0) return { batchId: null, submitted: [], skipped };
  const batchId = await deps.ai.submitBatch(THEME_BATCH_TASK, prepared.map((p) => ({ customId: p.context.verticalId, messages: p.messages, jsonSchema: p.jsonSchema })), PLATFORM);
  await deps.db.insert(modelBatch).values({
    task: THEME_BATCH_TASK, provider: 'anthropic', providerBatchId: batchId, purpose: THEME_BATCH_PURPOSE,
    items: Object.fromEntries(prepared.map((p) => [p.context.verticalId, p.context])), requestCount: prepared.length,
  });
  return { batchId, submitted: prepared.map((p) => p.context.verticalId), skipped };
}
```

The `'proposed' + pending exists` check in `applyThemeProposal` keeps the old sync behaviour too (the pending check in prepare still runs first; the DB index remains the final guard).

In `runReviewInsights`, replace the per-vertical theme-discovery loop with:

```ts
  const verticals = (await deps.db.selectDistinct({ id: reviewAnalysis.verticalId }).from(reviewAnalysis).where(scope)).map((v) => v.id);
  if (deps.ai.batchAvailable(THEME_BATCH_TASK)) {
    try {
      r.batched = (await submitThemeDiscoveryBatch(deps, verticals, { now: opts.now })).submitted.length;
    } catch (err) {
      r.errors++;
      console.error(`[review-insights] theme-discovery batch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    for (const id of verticals) {
      try {
        const d = await discoverTheme(deps, id, { now: opts.now });
        if ('status' in d && d.status === 'proposed') r.proposals++;
      } catch (err) {
        r.errors++;
        console.error(`[review-insights] theme discovery for ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
```

and add `batched: number` to `ReviewInsightsResult` (initialised to 0).

- [ ] **Step 4: Implement `collectModelBatches`**

Create `packages/engine/src/model-ops/batches.ts`:

```ts
import type { Ai } from '@cs/ai';
import { type Db, modelBatch } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import { applyThemeProposal, THEME_BATCH_PURPOSE, type ThemeDiscoveryContext } from '../reviews/discovery';

/** Anthropic's batch limit is 24 h; a batch still unfinished after this is given up (its reviews are offered again). */
export const BATCH_MAX_AGE_HOURS = 26;
const PLATFORM = { agencyId: null, clientId: null } as const;

export interface BatchCollectResult {
  checked: number;
  ended: number;
  applied: number;
  failed: number;
  expired: number;
}

/** Polls every submitted batch; applies ended ones. A poll error leaves the batch submitted for the next poll. */
export async function collectModelBatches(deps: { db: Db; ai: Ai }, opts: { now?: Date } = {}): Promise<BatchCollectResult> {
  const now = opts.now ?? new Date();
  const r: BatchCollectResult = { checked: 0, ended: 0, applied: 0, failed: 0, expired: 0 };
  const open = await deps.db.select().from(modelBatch).where(eq(modelBatch.status, 'submitted')).orderBy(asc(modelBatch.createdAt));
  for (const b of open) {
    r.checked++;
    try {
      const res = await deps.ai.collectBatch(b.task, b.providerBatchId, PLATFORM);
      if (res.status === 'in_progress') {
        if (now.getTime() - b.createdAt.getTime() > BATCH_MAX_AGE_HOURS * 3_600_000) {
          await deps.db.update(modelBatch).set({ status: 'failed', error: `expired: unfinished after ${BATCH_MAX_AGE_HOURS} h`, endedAt: now }).where(eq(modelBatch.id, b.id));
          r.expired++;
        }
        continue;
      }
      for (const item of res.results) {
        const ctx = b.items[item.customId] as ThemeDiscoveryContext | undefined;
        if (!item.ok || !ctx || b.purpose !== THEME_BATCH_PURPOSE) {
          r.failed++;
          console.warn(`[model-batch] ${b.providerBatchId}/${item.customId}: ${item.ok ? 'no context for this request' : item.error}`);
          continue;
        }
        if ('status' in (await applyThemeProposal(deps.db, ctx, item.text))) r.applied++;
      }
      await deps.db.update(modelBatch).set({ status: 'ended', endedAt: now }).where(eq(modelBatch.id, b.id));
      r.ended++;
    } catch (err) {
      r.failed++;
      console.error(`[model-batch] polling ${b.providerBatchId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return r;
}
```

Export from `packages/engine/src/index.ts`.

- [ ] **Step 5: Add the worker job**

`apps/worker/src/jobs/model-ops.ts`:

```ts
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

/** Phase 3d decision 10: applies finished Anthropic batches (theme discovery). Idempotent; never retried by pg-boss. */
export function createModelOpsJobs(deps: WorkerDeps) {
  const batchPoll = defineJob({
    name: 'model-batch-poll', schema: z.looseObject({}), cron: '*/15 * * * *', queue: { retryLimit: 0 },
    handler: async () => {
      if (!deps.engineConfigured()) return;
      const r = await deps.collectModelBatches();
      if (r.checked > 0) console.log(`[model-batch-poll] ${JSON.stringify(r)}`);
    },
  });
  return { batchPoll };
}
```

`apps/worker/src/deps.ts`: add `collectModelBatches(): Promise<BatchCollectResult>` to `WorkerDeps` and implement it as `async collectModelBatches() { return collectModelBatches({ db: getDb(), ai: await getAi() }); }` (import from `@cs/engine`). `apps/worker/src/main.ts`: `const modelOps = createModelOpsJobs(deps);` and add `modelOps.batchPoll` to `registerJobs`.

`apps/worker/src/jobs/model-ops.test.ts` (follow `jobs/reviews.test.ts`'s fake-deps pattern):

```ts
import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createModelOpsJobs } from './model-ops';

describe('model-batch-poll', () => {
  it('runs every 15 minutes without pg-boss retries, and does nothing until the engine is configured', async () => {
    const collect = vi.fn(async () => ({ checked: 1, ended: 1, applied: 1, failed: 0, expired: 0 }));
    let configured = false;
    const { batchPoll } = createModelOpsJobs({ engineConfigured: () => configured, collectModelBatches: collect } as unknown as WorkerDeps);
    expect(batchPoll).toMatchObject({ name: 'model-batch-poll', cron: '*/15 * * * *', queue: { retryLimit: 0 } });
    await batchPoll.handler({});
    expect(collect).not.toHaveBeenCalled();
    configured = true;
    await batchPoll.handler({});
    expect(collect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run and commit**

Run: `pnpm --filter @cs/engine exec vitest run reviews model-ops && pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS (existing discovery tests unchanged — the sync path keeps its behaviour).

```bash
git add packages/engine/src apps/worker/src
git commit -m "feat(engine): batched theme discovery via Anthropic Message Batches with a 15-minute poll job

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Score hardening — backoff, vertical filter, late-linked clients, threshold validation

**Files:**
- Modify: `packages/engine/src/stage.ts`, `packages/engine/src/sweep.ts`, `packages/engine/src/score/score-stage.ts`, `packages/engine/src/score/score.ts`
- Test: `packages/engine/src/score/score-stage.test.ts`, `packages/engine/src/sweep.test.ts`, `packages/engine/src/score/score.test.ts`

**Interfaces:**
- Consumes: `scoreFailure` (Task 2); retracted filter (Task 5).
- Produces: `RETRY_BACKOFF_MINUTES` now lives in `stage.ts` (re-exported by `sweep.ts`); `LATE_LINK_LOOKBACK_DAYS = 90` (`sweep.ts`); `validThresholds(t: ScoreThresholds | null | undefined): t is ScoreThresholds` (`score.ts`).

- [ ] **Step 1: Write the failing tests**

`packages/engine/src/score/score.test.ts` — add:

```ts
  it('falls back to the pack routing when a client threshold row is malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = scoreForClient(input(), { ...client, thresholds: { alert: 30, brief: 60 } }, pack);
    expect(r.factors.thresholds).toEqual({ alert: 70, brief: 40 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(scoreForClient(input(), { ...client, thresholds: { alert: 90, brief: 50 } }, pack).factors.thresholds).toEqual({ alert: 90, brief: 50 });
  });
```
(add `vi` to the vitest import).

`packages/engine/src/score/score-stage.test.ts` — add (the file's `event()` helper and `packs` exist):

```ts
  it('backs off a failing (event, client) pair and forgets the failure after a success', async () => {
    const id = await event();
    const broken = async (v: string) => {
      if (v === 'hvac_plumbing') throw new Error('pack unavailable');
      return loadVerticalPack(v);
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await scoreEvent({ db: dbs.service, packs: createPackLoader(broken) }, id)).toMatchObject({ scored: 0, failed: 2 });
    const failures = await dbs.owner.select().from(scoreFailure);
    expect(failures.map((f) => f.attempts)).toEqual([1, 1]);
    // Inside the backoff window neither the sweep nor scoreEvent retries the pair.
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(id);
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toMatchObject({ scored: 0, failed: 0 });
    // Once the window has passed it is retried, scored, and the failure row is gone.
    await dbs.owner.execute(sql`UPDATE score_failure SET failed_at = now() - interval '2 hours'`);
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).toContain(id);
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toMatchObject({ scored: 2, failed: 0 });
    expect(await dbs.owner.select().from(scoreFailure)).toEqual([]);
    err.mockRestore();
  });

  it('gives up on a pair after MAX_STAGE_ATTEMPTS failures', async () => {
    const id = await event();
    await dbs.service.insert(scoreFailure).values([
      { eventId: id, clientId: IDS.clientA1, agencyId: IDS.agencyA, attempts: MAX_STAGE_ATTEMPTS, failedAt: day(-30) },
      { eventId: id, clientId: IDS.clientB1, agencyId: IDS.agencyB, attempts: MAX_STAGE_ATTEMPTS, failedAt: day(-30) },
    ]);
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(id);
  });
```

`packages/engine/src/sweep.test.ts` — add:

```ts
  it('does not offer a complaint spike to clients of another vertical (3c carry-over)', async () => {
    // A2 is dental and tracks Y; a hvac complaint spike on Y has no hvac client to score it for.
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorY, changeType: 'review_spike', summary: 's', confidence: 1, occurredAt: new Date(), details: { verticalId: 'hvac_plumbing', theme: 'response_time' } })
      .returning({ id: changeEvent.id });
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(ev!.id);
  });

  it('offers recent history to a newly linked client, but not events older than the lookback', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const ancient = new Date(Date.now() - 120 * 86_400_000);
    const [recentish] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorY, changeType: 'promo', summary: 's', confidence: 1, occurredAt: old, createdAt: old }).returning({ id: changeEvent.id });
    const [tooOld] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorY, changeType: 'promo', summary: 's', confidence: 1, occurredAt: ancient, createdAt: ancient }).returning({ id: changeEvent.id });
    await dbs.owner.update(clientCompetitor).set({ createdAt: old }).where(eq(clientCompetitor.competitorId, IDS.competitorY));
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(recentish!.id); // link is old too
    await dbs.owner.update(clientCompetitor).set({ createdAt: new Date() }).where(eq(clientCompetitor.competitorId, IDS.competitorY));
    const work = (await findEngineWork(dbs.service, { limit: 10 })).score;
    expect(work).toContain(recentish!.id);
    expect(work).not.toContain(tooOld!.id);
  });
```

(Use the imports and seeding the file already has; add `changeEvent`, `clientCompetitor`, `eq` if missing.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/engine exec vitest run score sweep`
Expected: FAIL — no `score_failure` rows written; the dental-client spike and late-link cases are wrong.

- [ ] **Step 3: Implement**

`packages/engine/src/stage.ts` — move the `RETRY_BACKOFF_MINUTES` constant and its doc comment here from `sweep.ts`; in `sweep.ts` import it and re-export: `export { RETRY_BACKOFF_MINUTES } from './stage';`.

`packages/engine/src/score/score.ts`:

```ts
/** Phase 3d decision 13: numbers, 0 ≤ brief < alert ≤ 100 (the DB CHECK enforces the same on client rows). */
export function validThresholds(t: ScoreThresholds | null | undefined): t is ScoreThresholds {
  return !!t && Number.isFinite(t.alert) && Number.isFinite(t.brief) && t.brief >= 0 && t.alert <= 100 && t.brief < t.alert;
}
```
and in `scoreForClient`, replace `const thresholds = profile.thresholds ?? pack.scoring.routing;` with:

```ts
  if (profile.thresholds && !validThresholds(profile.thresholds)) console.warn('[engine] invalid client score thresholds; using the pack routing', profile.thresholds);
  const thresholds = validThresholds(profile.thresholds) ? profile.thresholds : pack.scoring.routing;
```

`packages/engine/src/score/score-stage.ts`:

```ts
/** A pair that failed recently (exponential backoff, like the stage sweep) or MAX_STAGE_ATTEMPTS times is skipped. */
export const scoreBackoff = (eventId: SQL | string, clientId: SQL | AnyColumn) => sql`EXISTS (
  SELECT 1 FROM score_failure f WHERE f.event_id = ${eventId}::uuid AND f.client_id = ${clientId}
    AND (f.attempts >= ${MAX_STAGE_ATTEMPTS}::int
         OR f.failed_at > now() - make_interval(mins => ${RETRY_BACKOFF_MINUTES}::int * power(2, f.attempts - 1)::int)))`;
```
- in `scoreEvent`'s client query add `sql\`NOT ${scoreBackoff(ev.id, client.id)}\`` to the `and(...)`;
- after a successful insert: `await deps.db.delete(scoreFailure).where(and(eq(scoreFailure.eventId, ev.id), eq(scoreFailure.clientId, c.id)));`
- in the `catch`:
  ```ts
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
      const [f] = await deps.db
        .insert(scoreFailure)
        .values({ eventId: ev.id, clientId: c.id, agencyId: c.agencyId, error: message })
        .onConflictDoUpdate({ target: [scoreFailure.eventId, scoreFailure.clientId], set: { attempts: sql`${scoreFailure.attempts} + 1`, error: message, failedAt: sql`now()` } })
        .returning({ attempts: scoreFailure.attempts });
      if (f && f.attempts >= MAX_STAGE_ATTEMPTS) console.warn(`[engine] scoring event ${ev.id} for client ${c.id} exhausted: ${message}`);
  ```
  (keep the existing `console.error` and `result.failed++`).

`packages/engine/src/sweep.ts` — add `export const LATE_LINK_LOOKBACK_DAYS = 90;` and replace the score query:

```ts
  const window = opts.scoreWindowDays ?? SCORE_WINDOW_DAYS;
  const score = await db.execute(sql`
    SELECT e.id FROM event e
    WHERE e.retracted_at IS NULL ${only('e.competitor_id')}
      AND EXISTS (
        SELECT 1 FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
        WHERE cc.competitor_id = e.competitor_id
          AND (e.client_id IS NULL OR cc.client_id = e.client_id)
          -- A complaint spike belongs to one vertical's theme list (3c): only that vertical's clients score it.
          AND (e.details->>'verticalId' IS NULL OR cl.vertical_id = e.details->>'verticalId')
          -- Recent events, or recent history for a client linked recently (decision 12).
          AND (e.created_at >= now() - make_interval(days => ${window}::int)
               OR (cc.created_at >= now() - make_interval(days => ${window}::int)
                   AND e.occurred_at >= now() - make_interval(days => ${LATE_LINK_LOOKBACK_DAYS}::int)))
          AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = e.id AND s.client_id = cc.client_id)
          AND NOT ${scoreBackoff(sql`e.id`, sql`cc.client_id`)})
    ORDER BY e.created_at ASC LIMIT ${opts.limit}`);
```

(`scoreBackoff`'s `::uuid` cast is harmless on a column. Import it from `./score/score-stage` — `score-stage.ts` imports only `stage.ts` from the engine core, so there is no cycle.)

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS.

```bash
git add packages/engine/src
git commit -m "fix(engine): score backoff, vertical-scoped complaint spikes, late-linked clients, threshold validation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Re-extract blocks on an extractor bump; camelCase consent tokens

**Files:**
- Modify: `packages/engine/src/web/blocks.ts`, `packages/engine/src/web/extract.ts`
- Test: `packages/engine/src/web/blocks.test.ts`, `packages/engine/src/web/extract.test.ts`

**Interfaces:**
- Produces: `EXTRACTOR_VERSION = 2`; `ensureBlocks` replaces a capture's blocks when it extracts under a new version; `consentTokens(token: string): string` (exported for tests) splits camelCase and lower-cases.

- [ ] **Step 1: Write the failing tests**

`packages/engine/src/web/extract.test.ts` — add:

```ts
  it('strips camelCase and compound consent banners but keeps look-alike content (3a carry-over)', () => {
    const blocks = extractBlocks(`<body>
      <main><h1>Smith HVAC</h1><p>AC tune-up $79 for new customers this spring only</p>
      <section class="trustedBy"><p>Trusted by 2,000 Plano homeowners since 1998</p></section></main>
      <div class="cookieConsent"><p>We use cookies to improve your experience</p></div>
      <div id="CookieLawInfo"><p>This website uses cookies</p></div>
      <div class="cmplz-cookiebanner"><p>Manage consent preferences</p></div>
      <div class="cookieBar"><p>Accept all cookies</p></div>
    </body>`).map((b) => b.text);
    expect(blocks.join(' ')).not.toMatch(/cookies|consent/i);
    expect(blocks).toContain('Trusted by 2,000 Plano homeowners since 1998');
    expect(consentTokens('CookieLawInfo')).toBe('cookie-law-info');
    expect(consentTokens('cmplz-cookiebanner')).toBe('cmplz-cookiebanner');
  });
```

`packages/engine/src/web/blocks.test.ts` — add (create the file if absent, with the usual `openTestDbs`/`truncateAll`/`seedTenancy` setup):

```ts
  it('replaces blocks extracted under an older EXTRACTOR_VERSION instead of keeping them', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: '<body><p>AC tune-up $79 this spring</p></body>', capturedAt: day(1) });
    await dbs.service.insert(captureBlock).values([
      { captureId: cap, competitorId: IDS.competitorX, trackedPageId: page, ord: 0, blockKey: 'old#0', path: 'old', text: 'stale v1 block', textSha: 'x' },
      { captureId: cap, competitorId: IDS.competitorX, trackedPageId: page, ord: 5, blockKey: 'old#5', path: 'old', text: 'another stale block', textSha: 'y' },
    ]);
    await dbs.service.insert(stageRun).values({ stage: EXTRACT_STAGE, stageVersion: EXTRACTOR_VERSION - 1, subjectId: cap, status: 'done' });
    expect(await ensureBlocks({ db: dbs.service, store }, cap)).toBe('extracted');
    expect((await loadBlocks(dbs.service, cap)).map((b) => b.text)).toEqual(['AC tune-up $79 this spring']);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/engine exec vitest run web/extract web/blocks`
Expected: FAIL — cookie text survives; stale blocks remain.

- [ ] **Step 3: Implement**

`packages/engine/src/web/blocks.ts` — first line of the commit callback:

```ts
      // A newer EXTRACTOR_VERSION re-extracts: drop the old version's blocks (their embeddings are recomputed on the next diff).
      await tx.delete(captureBlock).where(eq(captureBlock.captureId, captureId));
```
and change `.onConflictDoNothing()` on the insert to nothing (the delete makes conflicts impossible; a real conflict should now fail loudly).

`packages/engine/src/web/extract.ts`:

```ts
export const EXTRACTOR_VERSION = 2; // 2: camelCase/compound consent tokens (Phase 3d)

const CONSENT_SEGMENT =
  /(?:^|[-_])(?:cookies?|consent|gdpr|ccpa|onetrust|cookiebot|truste|cc-window|cookiebanner|cookiebar|cookienotice|cookieconsent|cmplz)(?:$|[-_])/i;

/** "CookieLawInfo" → "cookie-law-info", "cookieBar" → "cookie-bar": camelCase boundaries become segment breaks. */
export function consentTokens(token: string): string {
  return token.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
```
and in `removeConsentBanners` test `consentTokens(t)` instead of `t`: `if (!tokens.some((t) => CONSENT_SEGMENT.test(consentTokens(t)))) return;`.

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS. Existing diff tests re-extract under v2 transparently (both captures of a diff are extracted under the same version).

```bash
git add packages/engine/src/web
git commit -m "fix(engine): re-extract blocks on an extractor bump; strip camelCase consent banners

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Volatile learning on alignment chains; mask expiry and manual unmask

**Files:**
- Modify: `packages/engine/src/web/volatile.ts`, `packages/engine/src/web/diff-stage.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/src/web/volatile.test.ts`

**Interfaces:**
- Consumes: `alignBlocks` (`web/align.ts`), `loadBlocks`, `EXTRACT_STAGE` (`web/blocks.ts`), `EXTRACTOR_VERSION`, `volatileBlock.unmaskedAt` (Task 2).
- Produces: `interface BlockChain { history: (string | null)[]; keys: string[]; lastKey: string | null }`; `blockChains(captures: StoredBlock[][]): BlockChain[]` (pure); `learnVolatileBlocks(db, trackedPageId): Promise<{ masked: string[]; unmasked: string[] }>` (was `string[]`); `unmaskBlock(db: Db, trackedPageId: string, blockKey: string): Promise<void>`; `maskedBlockKeys` ignores manually unmasked rows. `DiffResult.newlyMasked` keeps its name (now `masked` from the learner).

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/src/web/volatile.test.ts`:

```ts
import { volatileBlock } from '@cs/db';
import { loadBlocks, type StoredBlock } from './blocks';
import { blockChains, unmaskBlock } from './volatile';

const blk = (ord: number, text: string): StoredBlock => ({ id: `${text}@${ord}`, ord, path: 'body>ul>li', blockKey: `body>ul>li#${ord}`, text, textSha: text, embedding: null });
const list = (...items: string[]) => items.map((t, i) => blk(i, t));

describe('blockChains', () => {
  it('follows a block through an insertion at the top instead of seeing every key change', () => {
    const chains = blockChains([list('a', 'b', 'c'), list('new', 'a', 'b', 'c')]);
    const a = chains.find((c) => c.history[0] === 'a')!;
    expect(a.history).toEqual(['a', 'a']);
    expect(a.lastKey).toBe('body>ul>li#1');
    expect(chains.find((c) => c.history[1] === 'new')!.history).toEqual([null, 'new']);
  });

  it('records modifications and removals on the same chain', () => {
    const chains = blockChains([list('Quote A'), list('Quote B'), []]);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ history: ['Quote A', 'Quote B', null], lastKey: null });
  });
});
```

and in the `learnVolatileBlocks` describe (it already has `html()`, `seedPage`, `seedWebCapture`, `ensureBlocks`):

```ts
  const seedSeries = async (bodies: string[]) => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    const caps: string[] = [];
    for (const [i, b] of bodies.entries()) {
      const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<body>${b}</body>`, capturedAt: day(i) });
      await ensureBlocks({ db: dbs.service, store }, cap);
      caps.push(cap);
    }
    return { page, caps };
  };
  const ul = (...items: string[]) => `<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;

  it('a list that grows at the top every day masks nothing (Review Focus 4)', async () => {
    const news = ['Mon news item here', 'Tue news item here', 'Wed news item here', 'Thu news item here', 'Fri news item here', 'Sat news item here'];
    const { page } = await seedSeries(news.map((_, i) => ul(...news.slice(0, i + 1).reverse(), 'Call us for AC repair today')));
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
  });

  // The quote's block key as the extractor writes it (read back, never hard-coded).
  const quoteKey = async (cap: string) => (await loadBlocks(dbs.service, cap))[0]!.blockKey;

  it('does not mask a block whose changes are still pending', async () => {
    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote four is here'];
    const { page, caps } = await seedSeries(quotes.map((q) => `<blockquote>${q}</blockquote>`));
    const key = await quoteKey(caps[0]!);
    for (const cap of caps.slice(1)) {
      await dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'modified', afterCaptureId: cap, blockKey: key, status: 'pending', stageVersion: 1 });
    }
    expect((await learnVolatileBlocks(dbs.service, page)).masked).toEqual([]);
  });

  it('expires a mask whose block has been stable for the whole window, and never re-masks a manual unmask', async () => {
    const stable = await seedSeries(Array.from({ length: 6 }, () => '<blockquote>Same quote every day</blockquote>'));
    const key = await quoteKey(stable.caps[0]!);
    await dbs.service.insert(volatileBlock).values({ trackedPageId: stable.page, blockKey: key });
    expect(await learnVolatileBlocks(dbs.service, stable.page)).toEqual({ masked: [], unmasked: [key] });

    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote four is here'];
    const rotating = await seedSeries(quotes.map((q) => `<blockquote>${q}</blockquote>`));
    await unmaskBlock(dbs.service, rotating.page, await quoteKey(rotating.caps[0]!));
    expect((await learnVolatileBlocks(dbs.service, rotating.page)).masked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, rotating.page)).toEqual(new Set());
  });

  it('keeps an existing mask when a list item is inserted above it (Review Focus 4)', async () => {
    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote four is here', 'Quote five is here', 'Quote six is here'];
    // A rotating testimonial in a list; from capture 3 on, a new item sits above it, shifting its positional key.
    const { page, caps } = await seedSeries(quotes.map((q, i) => (i < 3 ? ul(q, 'Call us for AC repair today') : ul('Now hiring technicians in Plano', q, 'Call us for AC repair today'))));
    const original = await quoteKey(caps[0]!);
    await dbs.service.insert(volatileBlock).values({ trackedPageId: page, blockKey: original });
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, page)).toContain(original);
  });
```

Update the two existing `learnVolatileBlocks` assertions in this file from `toEqual([...keys])` to `toEqual({ masked: [...keys], unmasked: [] })` (or `.masked`), and the `newlyMasked` assertions in `diff-stage.test.ts` stay as they are.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/engine exec vitest run web/volatile`
Expected: FAIL — `blockChains` not exported; the growing list masks its positional keys.

- [ ] **Step 3: Implement**

Replace `learnVolatileBlocks`/`maskedBlockKeys` in `packages/engine/src/web/volatile.ts` and add `blockChains`/`unmaskBlock` (keep `VOLATILE_*`, `countChanges`, `isVolatile`):

```ts
import { capture, type Db, detectedChange, volatileBlock } from '@cs/db';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alignBlocks } from './align';
import { EXTRACT_STAGE, loadBlocks, type StoredBlock } from './blocks';
import { EXTRACTOR_VERSION } from './extract';

/** One block followed through consecutive captures by alignment (Phase 3d decision 15). */
export interface BlockChain {
  /** textSha per capture, null where the block is absent. */
  history: (string | null)[];
  /** Every block key the chain had. */
  keys: string[];
  /** Its key in the newest capture, null when it no longer exists. */
  lastKey: string | null;
}

export function blockChains(captures: StoredBlock[][]): BlockChain[] {
  const chains: BlockChain[] = [];
  let current = new Map<string, number>();
  const start = (i: number, b: StoredBlock) => {
    chains.push({ history: [...Array<null>(i).fill(null), b.textSha], keys: [b.blockKey], lastKey: b.blockKey });
    return chains.length - 1;
  };
  captures[0]?.forEach((b) => current.set(b.id, start(0, b)));
  for (let i = 1; i < captures.length; i++) {
    const next = new Map<string, number>();
    for (const a of alignBlocks(captures[i - 1]!, captures[i]!)) {
      if (a.before && a.after) {
        const c = chains[current.get(a.before.id)!]!;
        c.history.push(a.after.textSha);
        if (!c.keys.includes(a.after.blockKey)) c.keys.push(a.after.blockKey);
        c.lastKey = a.after.blockKey;
        next.set(a.after.id, current.get(a.before.id)!);
      } else if (a.after) {
        next.set(a.after.id, start(i, a.after));
      }
    }
    for (const c of chains) {
      if (c.history.length < i + 1) {
        c.history.push(null);
        c.lastKey = null;
      }
    }
    current = next;
  }
  return chains;
}

/** Keys masked automatically (a manual unmask keeps its row with unmasked_at set, so it is never auto-masked again). */
export async function maskedBlockKeys(db: Db, trackedPageId: string): Promise<Set<string>> {
  const rows = await db.select({ blockKey: volatileBlock.blockKey }).from(volatileBlock).where(and(eq(volatileBlock.trackedPageId, trackedPageId), isNull(volatileBlock.unmaskedAt)));
  return new Set(rows.map((r) => r.blockKey));
}

/** An AM's unmask (UI in Phase 5): the block is diffed normally from now on and never auto-masked again. */
export async function unmaskBlock(db: Db, trackedPageId: string, blockKey: string): Promise<void> {
  await db
    .insert(volatileBlock)
    .values({ trackedPageId, blockKey, unmaskedAt: new Date() })
    .onConflictDoUpdate({ target: [volatileBlock.trackedPageId, volatileBlock.blockKey], set: { unmaskedAt: sql`now()` } });
}

export async function learnVolatileBlocks(db: Db, trackedPageId: string): Promise<{ masked: string[]; unmasked: string[] }> {
  const caps = await db
    .select({ id: capture.id })
    .from(capture)
    .where(
      and(
        eq(capture.trackedPageId, trackedPageId), eq(capture.source, 'web'), eq(capture.status, 'ok'),
        // Only captures extracted under the current extractor: mixing versions would look like churn (3a carry-over).
        sql`EXISTS (SELECT 1 FROM stage_run s WHERE s.stage = ${EXTRACT_STAGE} AND s.stage_version = ${EXTRACTOR_VERSION}::int AND s.subject_id = ${capture.id} AND s.status = 'done')`,
      ),
    )
    .orderBy(desc(capture.capturedAt))
    .limit(VOLATILE_TRANSITIONS + 1);
  if (caps.length < VOLATILE_MIN_CHANGES + 1) return { masked: [], unmasked: [] };
  const ids = caps.map((c) => c.id).reverse();
  const chains = blockChains(await Promise.all(ids.map((id) => loadBlocks(db, id))));

  // A block with an event — or a change not yet tagged — is never masked (a pending change may still matter).
  const protectedKeys = new Set(
    (
      await db
        .select({ blockKey: detectedChange.blockKey })
        .from(detectedChange)
        .where(and(eq(detectedChange.trackedPageId, trackedPageId), inArray(detectedChange.status, ['event', 'pending']), inArray(detectedChange.afterCaptureId, ids)))
    ).map((r) => r.blockKey),
  );
  const rows = await db.select().from(volatileBlock).where(eq(volatileBlock.trackedPageId, trackedPageId));
  const masked = new Set(rows.filter((r) => r.unmaskedAt === null).map((r) => r.blockKey));
  const manual = new Set(rows.filter((r) => r.unmaskedAt !== null).map((r) => r.blockKey));
  const live = chains.filter((c) => c.lastKey !== null);
  const liveKeys = new Set(live.map((c) => c.lastKey!));

  const newly = live
    .filter((c) => !masked.has(c.lastKey!) && !manual.has(c.lastKey!) && isVolatile(c.history, c.keys.some((k) => protectedKeys.has(k))))
    .map((c) => c.lastKey!);
  const fullWindow = ids.length === VOLATILE_TRANSITIONS + 1;
  const expired = [...masked].filter((k) => {
    if (!liveKeys.has(k)) return true; // no block carries this key any more
    const c = live.find((x) => x.lastKey === k)!;
    return fullWindow && countChanges(c.history) === 0;
  });

  if (newly.length > 0) await db.insert(volatileBlock).values(newly.map((blockKey) => ({ trackedPageId, blockKey }))).onConflictDoNothing();
  if (expired.length > 0) await db.delete(volatileBlock).where(and(eq(volatileBlock.trackedPageId, trackedPageId), inArray(volatileBlock.blockKey, expired), isNull(volatileBlock.unmaskedAt)));
  return { masked: newly, unmasked: expired };
}
```

In `packages/engine/src/web/diff-stage.ts`: `const learned = await learnVolatileBlocks(deps.db, pageId); return { ran: true, result: { ...outcome.result, newlyMasked: learned.masked } };`. Export `unmaskBlock` from `packages/engine/src/index.ts`.

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS (the existing "masks a rotating testimonial but not a price block whose changes were events" still masks the testimonial: its chain changes in every transition).

```bash
git add packages/engine/src
git commit -m "fix(engine): volatile learning on alignment chains, pending changes protected, mask expiry and manual unmask

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 13: Churn guard before paid work; suppressed changes are kept

**Files:**
- Modify: `packages/engine/src/web/diff-stage.ts`
- Test: `packages/engine/src/web/diff-stage.test.ts`

**Interfaces:**
- Consumes: `shapeSimilarity`, `MOVE_SIMILARITY` (`web/align.ts`); `extractFacts` (no fallback in churn mode).
- Produces: `CHURN_SUPPRESSED_MAX = 200`; `churnCount(alignments): number` (exported, pure); `DiffResult` gains `suppressed: number`; detected changes with `status: 'suppressed'`, `flags: ['churn']`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/src/web/diff-stage.test.ts` (it has `twoCaptures`, `htmlPage`, `changes`):

```ts
describe('churn guard (Phase 3d decision 16)', () => {
  const rows = (texts: string[]) => texts.map((t) => `<p>${t}</p>`).join('');
  const before = Array.from({ length: 24 }, (_, i) => `Our team has served Plano families for many years, paragraph number ${i} about comfort`);
  const after = Array.from({ length: 24 }, (_, i) => `Brand new marketing copy written by an agency for spring, section ${i} talks quality`);

  it('a full copy rewrite that keeps the DOM embeds and gates only the money change, and stores the rest as suppressed', async () => {
    const { store, after: cap } = await twoCaptures(
      htmlPage(rows([...before, 'AC tune-up only $89 per system'])),
      htmlPage(rows([...after, 'AC tune-up only $69 per system'])),
    );
    const ai = createFakeAi();
    const fallback = vi.fn(async () => []);
    const r = await diffWebCapture({ db: dbs.service, store, ai }, cap, { factFallback: fallback });
    expect(r.ran && r.result.suppressed).toBe(24);
    expect(fallback).not.toHaveBeenCalled();
    expect(ai.calls.embed.flat()).toEqual(['AC tune-up only $89 per system', 'AC tune-up only $69 per system']);
    const all = await changes();
    expect(all.filter((c) => c.status === 'pending').map((c) => c.afterText)).toEqual(['AC tune-up only $69 per system']);
    expect(all.filter((c) => c.status === 'suppressed')).toHaveLength(24);
    expect(all.find((c) => c.status === 'suppressed')?.flags).toEqual(['churn']);
  });

  it('counts same-key rewrites as churn but not small edits', () => {
    const b = (t: string, key: string) => ({ id: key, ord: 0, path: 'p', blockKey: key, text: t, textSha: t, embedding: null });
    expect(churnCount([
      { kind: 'modified', before: b('Fast friendly AC repair in Plano', 'p#0'), after: b('Fast friendly AC repair in Frisco', 'p#0') },
      { kind: 'modified', before: b('Fast friendly AC repair in Plano', 'p#1'), after: b('Totally different words appear now', 'p#1') },
      { kind: 'added', before: null, after: b('New block', 'p#2') },
    ])).toBe(2);
  });
});
```

(Import `churnCount` from `./diff-stage`. If an existing test in this file asserts the old guard's candidate-count semantics via `CHURN_MIN_CANDIDATES`, keep its inputs and update only its expectation of which changes are written: non-money candidates now appear as `suppressed` rows instead of disappearing.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/engine exec vitest run web/diff-stage`
Expected: FAIL — `churnCount` not exported; every rewritten block is embedded.

- [ ] **Step 3: Implement**

In `packages/engine/src/web/diff-stage.ts`:

```ts
export const CHURN_SUPPRESSED_MAX = 200;

/** Added + removed blocks + same-key rewrites (shape similarity below MOVE_SIMILARITY): a cheap, model-free churn measure. */
export function churnCount(alignments: Alignment<StoredBlock>[]): number {
  return alignments.filter(
    (a) => a.kind === 'added' || a.kind === 'removed' || (a.kind === 'modified' && shapeSimilarity(a.before!.text, a.after!.text) < MOVE_SIMILARITY),
  ).length;
}
```

Restructure the compute callback after `alignments` is built (replace from "Embed (redacted) every involved block…" down to the end of the old churn block):

```ts
      // Phase 3d decision 16: measure churn before any paid work. On a churned page numbers come from rules only
      // (no LLM fallback), only money changes are embedded and gated, and everything else is kept as 'suppressed'.
      const churned = churnCount(alignments);
      const churn = churned >= CHURN_RATIO * Math.max(before.length, after.length) && churned >= CHURN_MIN_CANDIDATES;
      const facts = (text: string) => extractFacts(text, churn ? undefined : fallback);
      const withNumbers: { alignment: Alignment<StoredBlock>; numeric: NumericChange[] }[] = [];
      for (const a of alignments) {
        withNumbers.push({ alignment: a, numeric: diffFacts(a.before ? await facts(a.before.text) : [], a.after ? await facts(a.after.text) : []) });
      }
      const money = (n: NumericChange[]) => n.some((x) => MONEY_KINDS.has(x.kind));
      const toGate = churn ? withNumbers.filter((w) => money(w.numeric)) : withNumbers;
      const suppressed = churn ? withNumbers.filter((w) => !money(w.numeric)).slice(0, CHURN_SUPPRESSED_MAX) : [];
      if (churn) {
        console.warn(
          `[engine] heavy churn on page ${pageId} (capture ${captureId} vs ${prev.id}): ${churned} churned of ${before.length}→${after.length} blocks; ` +
            `gating ${toGate.length} money change(s), suppressing ${withNumbers.length - toGate.length}`,
        );
      }

      // Embed (redacted) every block of the alignments we gate that has no stored embedding yet.
      const need = new Map<string, StoredBlock>();
      for (const { alignment: a } of toGate) for (const b of [a.before, a.after]) if (b && !b.embedding) need.set(b.id, b);
      const embedded = [...need.values()];
      const { vectors } = await deps.ai.embed('embeddings', embedded.map((b) => redactForModel(b.text, { businessNames: [comp?.name] })), PLATFORM);
      embedded.forEach((b, i) => {
        b.embedding = vectors[i]!;
      });

      const candidates: Candidate[] = [];
      let masked = 0;
      for (const { alignment: a, numeric } of toGate) {
        const similarity = a.kind === 'modified' ? cosine(a.before!.embedding!, a.after!.embedding!) : null;
        const flags = gateChange(a, numeric, similarity, maskedKeys);
        if (flags) candidates.push({ alignment: a, numeric, similarity, flags });
        else if (a.kind === 'modified' && maskedKeys.has(a.before!.blockKey)) masked++;
      }
      return { prevId: prev.id, candidates, masked, embedded, suppressed };
```

(the early baseline return gains `suppressed: []`). In the commit callback, after `supersedePriorChanges` and the embeddings update, insert suppressed rows before the candidates:

```ts
      if (c.suppressed.length > 0) {
        await tx
          .insert(detectedChange)
          .values(
            c.suppressed.map(({ alignment: a, numeric }) => ({
              competitorId: cap.competitorId, trackedPageId: pageId, source: 'web', kind: a.kind, beforeCaptureId: c.prevId, afterCaptureId: captureId,
              blockKey: (a.after ?? a.before)!.blockKey, beforeText: a.before?.text ?? null, afterText: a.after?.text ?? null,
              numericChanges: numeric, flags: ['churn'], status: 'suppressed', stageVersion: WEB_DIFF_VERSION,
            })),
          )
          .onConflictDoNothing();
      }
```

and return `suppressed: c.suppressed.length` in both result branches (add `suppressed: number` to `DiffResult`). Import `shapeSimilarity`, `MOVE_SIMILARITY` from `./align`.

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS.

```bash
git add packages/engine/src/web
git commit -m "fix(engine): churn guard runs before embeddings and LLM fallback; suppressed changes are stored

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: ZIP codes need context

**Files:**
- Create: `packages/engine/src/geo/zips.ts`, `packages/engine/src/geo/zips.test.ts`
- Modify: `packages/engine/src/tag/tag-stage.ts` (re-export), `packages/engine/src/tag/questions.test.ts` (move the existing case)

**Interfaces:**
- Produces: `extractZips(text: string): string[]` in `geo/zips.ts` (5-digit ZIPs, ZIP+4 reduced to 5 digits, order of first appearance, deduped); `tag-stage.ts` keeps `export { extractZips } from '../geo/zips'` so existing imports keep working.

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/geo/zips.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractZips } from './zips';

describe('extractZips (Phase 3d decision 17)', () => {
  it.each([
    ['Serving Dallas, TX 75201.', ['75201']],
    ['Plano, Texas 75024 and nearby', ['75024']],
    ['Our office: 1234 Elm St, Frisco TX 75034-1234', ['75034']],
    ['ZIP codes: 75001, 75002 and 75003', ['75001', '75002', '75003']],
    ['Now serving 75034 and 75035! Call 972-555-0100. Systems from $12000.', ['75034', '75035']],
    ['Areas we serve: 75201/75204', ['75201', '75204']],
    ['zip 75093', ['75093']],
  ])('reads %s', (text, zips) => {
    expect(extractZips(text)).toEqual(zips);
  });

  it.each([
    'Our 36000 BTU units cool any home',
    'Call 12345 today',
    'Systems from $12000 or $15000',
    'Over 10000 happy customers',
    '24000 and 36000 BTU models in stock',
    '12345 Main Street',
    'Rated 4.9 by 25000 reviews',
    'Coverage of 50000 sq ft',
    'call in 75001', // "in" is a word, not Indiana (abbreviations are upper case)
  ])('ignores %s', (text) => {
    expect(extractZips(text)).toEqual([]);
  });
});
```

In `packages/engine/src/tag/questions.test.ts`, the existing `extractZips` case (line 89) stays valid; leave it.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cs/engine exec vitest run geo/zips`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/engine/src/geo/zips.ts`:

```ts
const STATE_ABBR = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'district of columbia', 'florida', 'georgia', 'hawaii',
  'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma',
  'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming',
];
/** Upper-case state abbreviation right before the number ("TX 75201", "TX, 75201"). Case-sensitive on purpose. */
const ABBR_BEFORE = new RegExp(`(?:^|[^A-Za-z])(?:${STATE_ABBR})\\.?,?\\s*$`);
/** State name or "zip/postal code(s)" right before the number. */
const WORD_BEFORE = new RegExp(`\\b(?:${STATE_NAMES.join('|')}|zip(?:\\s*codes?)?|postal\\s*codes?)\\s*[:#,]?\\s*$`, 'i');
/** A unit or count noun after the number means it is a quantity, not a ZIP. */
const UNIT_AFTER = /^\s*(?:btus?\b|sq\.?\s*f(?:ee)?t\b|square\b|ft\b|feet\b|miles?\b|mi\b|lbs?\b|pounds?\b|gallons?\b|gal\b|seer2?\b|watts?\b|kwh?\b|hp\b|psi\b|cfm\b|tons?\b|%|hours?\b|hrs?\b|customers?\b|reviews?\b|homes?\b|happy\b)/i;
/** Five digits, optional +4; not part of a longer number, a price, a phone/date, or a decimal. */
const CANDIDATE = /(?<![\d$\-#])(?<!\d[.,])(\d{5})(?:-\d{4})?(?![\d]|[.,]\d|-\d)/g;
const LIST_SEP = /^\s*(?:[,;/&]|\band\b|\bor\b)\s*(?:\band\b|\bor\b)?\s*$/i;

/** US ZIP codes stated as such (Phase 3d decision 17): a state or "ZIP" before it, or a list of two or more. */
export function extractZips(text: string): string[] {
  const found: { zip: string; start: number; end: number; context: boolean }[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (UNIT_AFTER.test(text.slice(end, end + 20))) continue;
    const before = text.slice(Math.max(0, start - 40), start);
    found.push({ zip: m[1]!, start, end, context: ABBR_BEFORE.test(before) || WORD_BEFORE.test(before) });
  }
  const accepted = found.map((f, i) => {
    if (f.context) return true;
    const prev = found[i - 1];
    const next = found[i + 1];
    return (prev !== undefined && LIST_SEP.test(text.slice(prev.end, f.start))) || (next !== undefined && LIST_SEP.test(text.slice(f.end, next.start)));
  });
  return [...new Set(found.filter((_, i) => accepted[i]).map((f) => f.zip))];
}
```

In `packages/engine/src/tag/tag-stage.ts`, delete the old `extractZips` function and add `export { extractZips } from '../geo/zips';` (plus `import { extractZips } from '../geo/zips';` for its own use).

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS (`questions.test.ts:89` still reads `['75034', '75035']` — a two-item list).

```bash
git add packages/engine/src
git commit -m "fix(engine): ZIP codes need a state, ZIP label or list context; read ZIP+4 and sentence-final ZIPs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Crawler conduct after redirects; record a failed homepage; classify with the business name

**Files:**
- Modify: `packages/collectors/src/web/user-agent.ts`, `packages/collectors/src/web/polite.ts`, `packages/collectors/src/discovery/discover.ts`, `packages/collectors/src/discovery/classify.ts`, `apps/worker/src/deps.ts`
- Test: `packages/collectors/src/web/polite.test.ts`, `packages/collectors/src/discovery/discover.test.ts`

**Interfaces:**
- Produces: `FetchText` result gains optional `finalUrl?: string` (`defaultFetchText` sets it from `res.url`); the polite renderer returns `error` ("redirected off-site to <host>") or `robots_disallowed` after a bad redirect; `DiscoveryDeps` gains `store: ObjectStore`; `discoverPages(deps, competitor: { id: string; domain: string; name: string }, opts)`; `classifyPage(ai, { url, text?, businessNames? })` (replaces `businessName`).

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/web/polite.test.ts` — add (self-contained):

```ts
describe('redirect checks (Phase 3d decision 18)', () => {
  const page = (requestedUrl: string, finalUrl: string) => ({
    requestedUrl, finalUrl, httpStatus: 200, status: 'ok' as const, title: 't', html: '<p>x</p>', text: 'x', links: [], error: null,
    screenshot: async () => new Uint8Array(), close: vi.fn(async () => {}),
  });
  const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nDisallow: /private' }));
  const limiter = { wait: async () => {} } as unknown as HostRateLimiter;

  it('drops a page that redirected to another site', async () => {
    const p = page('https://smithhvac.example/', 'https://other.example/');
    const r = await createPoliteRenderer({ robots, limiter, renderer: { render: async () => p, close: async () => {} } }).render('https://smithhvac.example/');
    expect(r).toMatchObject({ status: 'error', error: 'redirected off-site to other.example' });
    expect(p.close).toHaveBeenCalled();
  });

  it('drops a page that redirected to a robots-disallowed path, and keeps same-site www/https redirects', async () => {
    const bad = page('https://smithhvac.example/a', 'https://smithhvac.example/private/a');
    expect((await createPoliteRenderer({ robots, limiter, renderer: { render: async () => bad, close: async () => {} } }).render('https://smithhvac.example/a')).status).toBe('robots_disallowed');
    const ok = page('http://smithhvac.example/', 'https://www.smithhvac.example/');
    expect((await createPoliteRenderer({ robots, limiter, renderer: { render: async () => ok, close: async () => {} } }).render('http://smithhvac.example/')).status).toBe('ok');
  });
});
```

`packages/collectors/src/discovery/discover.test.ts` — pass `store: createMemoryStore()` (from `@cs/storage`) in every existing `discoverPages` deps object and `name: 'Smith HVAC'` in every competitor argument. **Delete** the existing test `'records nothing when the homepage is blocked'` — it pins the exact 2a gap this task closes — and add:

```ts
  it('records a blocked homepage as a weekly home page with a blocked capture (2a carry-over)', async () => {
    const renderer: Renderer = { render: async () => ({ ...home, status: 'blocked', httpStatus: 403, links: [] }), close: async () => {} };
    const result = await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots: new RobotsPolicy(async () => ({ status: 404, body: '' })), fetchText: async () => ({ status: 404, body: '' }), limiter: noopLimiter(), ai: fakeAi({}) },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    expect(result).toEqual({ selected: 0, candidates: 0, homepageStatus: 'blocked' });
    const rows = await dbs.service.select().from(trackedPage);
    expect(rows.map((r) => [r.url, r.pageType, r.cadence])).toEqual([['https://smithhvac.example/', 'home', 'weekly']]);
    expect((await dbs.service.select().from(capture).where(eq(capture.trackedPageId, rows[0]!.id))).map((c) => c.status)).toEqual(['blocked']);
  });

  it('passes the competitor name and domain to the classifier as business names', async () => {
    const renderer: Renderer = { render: vi.fn(async () => ({ ...home, links: [{ href: 'https://smithhvac.example/specials', text: 'Smith HVAC Specials' }] })), close: async () => {} };
    const ai = fakeAi({ 'https://smithhvac.example/specials': 'promo' });
    await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots: new RobotsPolicy(async () => ({ status: 404, body: '' })), fetchText: async () => ({ status: 404, body: '' }), limiter: noopLimiter(), ai },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    const linkTexts = (ai.decide as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as { link_text: string | null }).link_text);
    expect(linkTexts).toContain('Smith HVAC Specials');
  });

  it('ignores a sitemap that redirected off-site', async () => {
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nSitemap: https://smithhvac.example/sitemap.xml' }));
    const fetchText = vi.fn(async () => ({ status: 200, body: '<urlset><url><loc>https://smithhvac.example/specials</loc></url></urlset>', finalUrl: 'https://evil.example/sitemap.xml' }));
    await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai: fakeAi({ 'https://smithhvac.example/specials': 'promo' }) },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    expect((await dbs.service.select().from(trackedPage)).map((r) => r.url)).not.toContain('https://smithhvac.example/specials');
  });
```

(Add `capture` to the `@cs/db` import.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run polite discover`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/collectors/src/web/user-agent.ts`:

```ts
export type FetchText = (url: string) => Promise<{ status: number; body: string; finalUrl?: string }>;
```
and `return { status: res.status, body: await readCapped(res.body), finalUrl: res.url || url };` in `defaultFetchText`.

`packages/collectors/src/web/polite.ts`:

```ts
import type { HostRateLimiter } from './rate-limit';
import { emptyPage, type Renderer } from './renderer';
import type { RobotsPolicy } from './robots';
import { siteHost } from './user-agent';

/**
 * robots.txt → rate limit → render → re-check where the site redirected us (Phase 3d decision 18): another site's
 * content or a robots-disallowed path is discarded. The redirect itself was the site's doing; we only refuse its content.
 */
export function createPoliteRenderer(deps: { robots: RobotsPolicy; limiter: HostRateLimiter; renderer: Renderer }): Renderer {
  return {
    async render(url) {
      const verdict = await deps.robots.check(url);
      if (!verdict.allowed) return emptyPage(url, 'robots_disallowed', verdict.reason);
      await deps.limiter.wait(url, verdict.crawlDelaySeconds);
      const page = await deps.renderer.render(url);
      if (page.status !== 'ok' || !page.finalUrl || page.finalUrl === url) return page;
      if (siteHost(page.finalUrl) !== siteHost(url)) {
        await page.close();
        return emptyPage(url, 'error', `redirected off-site to ${new URL(page.finalUrl).hostname}`, page.httpStatus);
      }
      const after = await deps.robots.check(page.finalUrl);
      if (!after.allowed) {
        await page.close();
        return emptyPage(url, 'robots_disallowed', `redirected to ${page.finalUrl}: ${after.reason ?? 'disallowed'}`, page.httpStatus);
      }
      return page;
    },
    close: () => deps.renderer.close(),
  };
}
```

`packages/collectors/src/discovery/discover.ts`:
- `DiscoveryDeps` gains `store: ObjectStore` (import from `@cs/storage`).
- `politeSitemapFetch` checks the final URL after fetching:
  ```ts
    const res = await deps.fetchText(url);
    if (res.finalUrl && res.finalUrl !== url) {
      if (siteHost(res.finalUrl) !== homeHost) throw new Error(`sitemap ${url} redirected off-site to ${res.finalUrl}`);
      if (!(await deps.robots.check(res.finalUrl)).allowed) throw new Error(`sitemap ${url} redirected to a robots-disallowed url: ${res.finalUrl}`);
    }
    return res;
  ```
- `discoverPages(deps, competitor: { id: string; domain: string; name: string }, opts)`; replace the non-ok early return with:
  ```ts
    if (home.status !== 'ok') {
      // 2a carry-over: make "site blocks monitoring" visible — a home tracked page (never touching an existing row)
      // with a capture of the failed status. Weekly, so a blocked site is not retried every day.
      await deps.db
        .insert(trackedPage)
        .values({ competitorId: competitor.id, url: homeUrl, pageType: 'home', source: 'nav', cadence: 'weekly' })
        .onConflictDoNothing();
      const [tp] = await deps.db
        .select({ id: trackedPage.id })
        .from(trackedPage)
        .where(and(eq(trackedPage.competitorId, competitor.id), eq(trackedPage.url, homeUrl)))
        .limit(1);
      if (tp) await recordWebCapture({ db: deps.db, store: deps.store }, { trackedPage: { id: tp.id, competitorId: competitor.id, url: homeUrl }, page: home });
      return { selected: 0, candidates: 0, homepageStatus: home.status };
    }
  ```
  (import `recordWebCapture` from `../evidence/recorder`, `and`/`eq` from `drizzle-orm`).
- the classifier call becomes `classifyPage(deps.ai, { ...c, businessNames: [competitor.name, competitor.domain] })`.

`packages/collectors/src/discovery/classify.ts`: `candidate: { url: string; text?: string; businessNames?: readonly (string | null | undefined)[] }` and `redactForModel(candidate.text, { businessNames: candidate.businessNames ?? [] })`.

`apps/worker/src/deps.ts` `discoverPages`: pass `store: getStore()` in the deps and `{ id: c.id, domain: c.domain, name: c.name }`.

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @cs/collectors test && pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS.

```bash
git add packages/collectors/src apps/worker/src/deps.ts
git commit -m "fix(collectors): re-check host and robots after redirects; record a failed homepage; classify with the business name

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Role checks on `acceptSuggestion`; price-rule and self-business fixes

**Files:**
- Modify: `packages/core/src/access.ts`, `packages/collectors/src/local/accept.ts`, `packages/collectors/src/gbp/collect-gbp.ts`, `packages/engine/src/prices/observe.ts`
- Test: `packages/core/src/access.test.ts`, `packages/collectors/src/local/accept.test.ts`, `packages/collectors/src/gbp/collect-gbp.test.ts`, `packages/engine/src/prices/observe.test.ts`

**Interfaces:**
- Produces: `canManageCompetitors(ctx: AccessContext): boolean` (`@cs/core`); `acceptSuggestion` throws `ToolError('permission_denied', …)` for roles that may not; `pricesInBlock` drops superseded "was/reg./originally" prices and keeps "off-season/off-peak/off-hours" prices; GBP collection renames a self-business competitor to its GBP title.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/access.test.ts`:

```ts
  it('canManageCompetitors: agency roles always; a client owner only with manage_competitors; a viewer never', () => {
    const ctx = (role: Role, features: Feature[] = []) =>
      createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role === 'agency_admin' || role === 'account_manager' ? 'all' : [C], features });
    expect(canManageCompetitors(ctx('agency_admin'))).toBe(true);
    expect(canManageCompetitors(ctx('account_manager'))).toBe(true);
    expect(canManageCompetitors(ctx('client_owner'))).toBe(false);
    expect(canManageCompetitors(ctx('client_owner', ['manage_competitors']))).toBe(true);
    expect(canManageCompetitors(ctx('client_viewer', ['manage_competitors']))).toBe(false);
  });
```
(`A`/`C` are uuid constants the file already uses or define them.)

`packages/collectors/src/local/accept.test.ts` (the file has `SUG` and an account-manager `ctx` example):

```ts
  it('refuses client viewers and client owners without manage_competitors (spec §3)', async () => {
    for (const [role, features] of [['client_viewer', ['manage_competitors']], ['client_owner', []]] as const) {
      const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'u', role, clientScope: [IDS.clientA1], features: [...features] });
      await expect(acceptSuggestion({ service: dbs.service, app: dbs.app }, ctx, SUG)).rejects.toMatchObject({ code: 'permission_denied' });
    }
    const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'u', role: 'client_owner', clientScope: [IDS.clientA1], features: ['manage_competitors'] });
    await expect(acceptSuggestion({ service: dbs.service, app: dbs.app }, owner, SUG)).resolves.toHaveProperty('competitorId');
  });
```

`packages/engine/src/prices/observe.test.ts`:

```ts
  it('keeps off-season / off peak / off-hours prices; still drops "$50 off" (3c carry-over)', () => {
    expect(pricesInBlock('AC tune-up $79 off-season special').map((p) => p.amount)).toEqual([79]);
    expect(pricesInBlock('Furnace check $99 off peak').map((p) => p.amount)).toEqual([99]);
    expect(pricesInBlock('Emergency visit $149 off-hours').map((p) => p.amount)).toEqual([149]);
    expect(pricesInBlock('$50 off any repair')).toEqual([]);
    expect(pricesInBlock('$50-off any repair')).toEqual([]);
  });

  it('drops the superseded half of "was $X now $Y" (3c carry-over)', () => {
    expect(pricesInBlock('AC tune-up: was $129, now $99').map((p) => p.amount)).toEqual([99]);
    expect(pricesInBlock('Reg. $150 — today only $120').map((p) => p.amount)).toEqual([120]);
    expect(pricesInBlock('Regularly $200, sale price $150').map((p) => p.amount)).toEqual([150]);
    expect(pricesInBlock('Originally $90')).toEqual([]);
  });
```

`packages/collectors/src/gbp/collect-gbp.test.ts` (it has `item`, `fakeDfs`, `dfsTask`; add `client` to the `@cs/db` import):

```ts
  it('names a self business from its public GBP title, never from a client name (3c carry-over)', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.update(competitor).set({ name: 'A2 private client name' }).where(eq(competitor.id, IDS.competitorX));
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ ...item, title: 'Smith Heating & Air' }] }])]);
    await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect((await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX)))[0]?.name).toBe('Smith Heating & Air');
  });

  it('leaves the name of an ordinary competitor alone', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ ...item, title: 'Smith Heating & Air' }] }])]);
    await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect((await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX)))[0]?.name).toBe('Smith HVAC');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cs/core exec vitest run access && pnpm --filter @cs/collectors exec vitest run accept collect-gbp && pnpm --filter @cs/engine exec vitest run prices/observe`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/access.ts`:

```ts
/** Spec §3: account managers and admins manage competitors; a client owner only with the manage_competitors feature. */
export function canManageCompetitors(ctx: AccessContext): boolean {
  if (isAgencyRole(ctx.role)) return true;
  return hasPermission(ctx, 'manage') && ctx.features.has('manage_competitors');
}
```

`packages/collectors/src/local/accept.ts` — first line of `acceptSuggestion`:

```ts
  if (!canManageCompetitors(ctx)) throw new ToolError('permission_denied', 'This role may not manage competitors');
```
(import `canManageCompetitors`, `ToolError` from `@cs/core`).

`packages/engine/src/prices/observe.ts`:

```ts
const DISCOUNT_AFTER =
  /^\s*(?:(?:instant|mail-in|trade-in|cash|utility|manufacturer'?s?|federal|tax|bonus)\s+)?(?:-?off\b(?![- ](?:peak|season|hours?)\b)|discount|rebate|credit|savings?\b|back\b|down\b|deposit|coupon\b|voucher\b|gift\s*card\b|instant\s+savings\b)/i;
/** A price named as the old one ("was $129", "reg. $150", "originally $90") is superseded, not observed. */
const SUPERSEDED_BEFORE = /\b(?:was|reg(?:ular(?:ly)?)?\.?|regular\s+price|originally|normally|retail(?:\s+price)?|list\s+price)\s*:?\s*$/i;
```
and in `pricesInBlock`, right after `const c = classifyPrice(before, after);`: `if (c.discount || SUPERSEDED_BEFORE.test(before)) continue;` (replacing the `if (c.discount) continue;`). Update the doc comment above `DISCOUNT_AFTER`: off-peak, off-season and off-hours (hyphen or space) are time qualifiers.

`packages/collectors/src/gbp/collect-gbp.ts` — after the observation insert (inside `if (profile)`):

```ts
    // Phase 3d decision 22: a self business is named from its public GBP title, never from a client's private name.
    const title = typeof profile.title === 'string' ? profile.title.trim() : '';
    if (title) {
      const [self] = await deps.db.select({ id: client.id }).from(client).where(eq(client.selfCompetitorId, c.id)).limit(1);
      if (self) await deps.db.update(competitor).set({ name: title }).where(and(eq(competitor.id, c.id), ne(competitor.name, title)));
    }
```
(import `client` from `@cs/db` and `ne` from `drizzle-orm`; the collector's competitor argument carries no name, so the comparison happens in SQL.)

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @cs/core test && pnpm --filter @cs/collectors test && pnpm --filter @cs/engine exec vitest run prices && pnpm typecheck`
Expected: PASS.

```bash
git add packages/core packages/collectors packages/engine/src/prices
git commit -m "fix: role checks on acceptSuggestion; off-season and was/now prices; self businesses named from GBP

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Live verification, full suite, docs

**Files:**
- Modify: `packages/engine/src/engine.live.test.ts`, `docs/HANDOVER.md`, `docs/superpowers/plans/2026-09-29-roadmap.md`, `docs/research/2026-09-30-phase-2-vendor-apis.md`

- [ ] **Step 1: Add the live shadow contract test**

In `packages/engine/src/engine.live.test.ts`, add inside the describe (skips without `TYPESAFE_API_KEY`, ≈ $0.0003):

```ts
  it.skipIf(!process.env.TYPESAFE_API_KEY)('shadow sampling: one tag decision answered by Jev and the LLM, recorded as a sample', async () => {
    const samples: DecisionSampleRecord[] = [];
    const sink = { recordDecisionSample: async (r: DecisionSampleRecord) => { samples.push(r); return 'live-sample'; } };
    const ai = createAiFromEnv({ ...process.env, AI_SHADOW_RATE: '1' }, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), ledger, sink);
    const packs = [await loadVerticalPack('hvac_plumbing')];
    const numeric = diffFacts(extractNumericFacts('AC Tune-Up Only $89 per system'), extractNumericFacts('AC Tune-Up Only $69 per system'));
    const state = buildTagState({ competitorName: 'Smith HVAC', pageUrl: 'https://smithhvac.example/', pageType: 'home', kind: 'modified', beforeText: 'AC Tune-Up Only $89 per system', afterText: 'AC Tune-Up Only $69 per system', numericChanges: numeric });
    const r = await ai.decide('tag_decisions', state, buildTagQuestions(packs), scope);
    console.log(`[live] shadow ${JSON.stringify({ primary: Object.keys(samples[0]?.primary?.answers ?? {}), fallback: Object.keys(samples[0]?.fallback?.answers ?? {}) })}`);
    expect(r.sampleId).toBe('live-sample');
    expect(samples[0]).toMatchObject({ reason: 'shadow', primary: { provider: 'jev' }, fallback: { provider: 'llm' } });
    expect(Object.keys(samples[0]!.fallback!.answers).sort()).toEqual(Object.keys(buildTagQuestions(packs)).sort());
    expect(records.some((x) => x.task === 'llm_decisions:shadow')).toBe(true);
  }, 90_000);
```
(import `DecisionSampleRecord` from `@cs/core`.)

Run: `pnpm --filter @cs/engine exec vitest run engine.live`
Expected: PASS; note the console line in the vendor-APIs doc.

- [ ] **Step 2: Live shadow run on `cs_dev`**

Re-run review analysis for ten Aire Serv reviews with every decision shadow-sampled (≈ $0.03):

```bash
# service role; ten most recent analysed reviews of aireserv.com
psql "$(grep '^SERVICE_DATABASE_URL=' .env | cut -d= -f2-)" -c "DELETE FROM stage_run WHERE stage = 'review_themes' AND subject_id IN (SELECT md5(r.id::text || '|' || r.text)::uuid FROM review r WHERE r.competitor_id = 'e9f9cbd3-8834-43a4-a1af-a31224ca43d3' AND r.text IS NOT NULL ORDER BY r.posted_at DESC LIMIT 10)"
AI_SHADOW_RATE=1 pnpm --filter @cs/worker engine-once --competitor e9f9cbd3-8834-43a4-a1af-a31224ca43d3 --rounds 1
pnpm --filter @cs/worker decisions export --out "$TEMP/rm-labels.csv" --task review_decisions --limit 10
pnpm --filter @cs/worker decisions report
pnpm --filter @cs/worker decisions reviews --limit 5
```

(If `psql` is not on PATH, run the same statement with a short `tsx -e` script using `createDb(SERVICE_DATABASE_URL)`; the stage name constant is `REVIEW_STAGE` in `packages/engine/src/reviews/themes.ts` — confirm its value before running.)

Expected: `decision_sample` holds 10 `review_decisions` shadow rows with both providers; the CSV exists outside the repo; `report` prints "No labelled decisions yet…" (labels are the owner's to add — never fill them in with a model, decision 4); `reviews` lists any open reviews (do not resolve them — that is an AM decision). Record the sample count, spend (`llm_call` rows since the run started) and the Jev-vs-LLM agreement rate on those 10 samples (computed from `primary`/`fallback` answers, no labels needed) in the vendor-APIs doc.

If `ANTHROPIC_API_KEY` is set, also run `pnpm --filter @cs/ai exec vitest run anthropic-batch.live` and record the batch id; otherwise record that the batch path is verified by its unit tests only.

- [ ] **Step 3: Full suite**

Run (with `run_in_background`, then wait for the completion notice): `pnpm typecheck && pnpm test`
Expected: all packages green. Record the counts.

- [ ] **Step 4: Docs**

- `docs/superpowers/plans/2026-09-29-roadmap.md`: mark 3d done with this plan's link; in the Phase 3 row list 3d (17 tasks, ✅ done <date>); tick every carry-over item this plan closed (✅ … — closed in Phase 3d), and add a "Phase 3d carry-over" section with this plan's "Not in 3d" list, the per-task minors deferred at review, and the live-verification notes (labels pending with the owner; batch path verified live or not).
- `docs/research/2026-09-30-phase-2-vendor-apis.md`: a "Verified <date> — Phase 3d" section (shadow contract test output, `cs_dev` shadow run numbers, Anthropic batch result or "not run: no key", SDK version).
- `docs/HANDOVER.md`: §3 Phase 3d paragraph (what shipped, migrations `0025`–`0026`, new jobs `model-batch-poll`, new CLI `decisions`, test counts); §4 env (`ANTHROPIC_API_KEY` optional, `AI_SHADOW_RATE`); §5 next steps (owner labels the exported CSV and runs `decisions import` + `decisions report`; write the Phase 4 plan); §6 gotchas: events are soft-retracted (filter `retracted_at IS NULL` in every new event reader), `detected_change.status` can be `superseded`/`suppressed`, `client` UPDATE is column-granted to `app_user`, `AI_SHADOW_RATE` costs an LLM call per decision.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/engine.live.test.ts docs
git commit -m "docs: Phase 3d live verification, roadmap and handover

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage:** §7.3 shadow evaluation (Tasks 3, 4, 7, 17), config switch per decision type (Task 1), AM review queue resolution (Tasks 6, 7); §7.1 Anthropic direct batch (Tasks 8, 9); §7.5 ledger rows for shadow and batch calls (Tasks 3, 8); §6.1 volatile learning, numeric rules, churn (Tasks 11–14); §6.3 scoring backoff/thresholds (Task 10); §6 idempotent versioned stages → supersede (Task 5); §4.2 crawler conduct (Task 15); §3 roles (Task 16); §11 engine retries isolated per client (Task 10); §12 eval data for the Phase 7 CI eval sets (Tasks 3–4).
- **Every roadmap carry-over named in the scope table has a task;** the rest is listed under "Not in 3d".
- **Type consistency:** `DecisionResult.sampleId`/`trace` (Task 3) are what Tasks 6 and 17 read; `SampleAnswers` (Task 2) is the shape Task 3 writes and Task 4 reads; `BatchRequest`/`BatchItemResult` (Task 8) are what Task 9 and `FakeAi` use; `retractEvent`/`detachChange` (Task 5) are what Task 6 calls; `learnVolatileBlocks` returns `{ masked, unmasked }` from Task 12 on and `diff-stage.ts` maps it to `newlyMasked`.
- **Review Focus → tests:** 1 → Task 3 Step 5 (sink failure, LLM failure); 2 → Task 6 ("detaches a rejected web change…"); 3 → Task 5 (supersede + merged event); 4 → Task 12 ("a list that grows at the top…"); 5 → Task 9 (pending-meanwhile, failed request, 26-hour expiry).
