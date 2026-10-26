# jev-openrouter — route Jev (System One) through OpenRouter; Jev spend joins the spend guard

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/jev-openrouter   **Base:** main @ e80605e2
**Plan/spec:** [plan](../superpowers/plans/2026-10-25-jev-openrouter.md) · [spec](../superpowers/specs/2026-10-25-jev-openrouter-design.md) — spec owner-approved 2026-10-25; plan awaiting approval.

## Status (overwrite)
Tasks 0-5 + 4b done; ask cassette filled ($0.07); final fix wave done; test:affected green (worker env-count + spend-guard flake fixed, 72ce9ad3), e2e:affected 140/140. Built: Jev adapter on OpenRouter (`typesafe/jev-1.14`, `costUsd = usage.cost` when finite and >0, else fallback estimate 0.042 $/M with one warning per `createAiFromEnv`), echoed model id on samples (jsonb, no migration), `SPEND_GUARD_EXCLUDED_PROVIDERS = []` + `llmProviderCounted()`, spike scope `openrouter` = openrouter + llm + jev, `TYPESAFE_API_KEY` removed, docs updated. Cassettes re-recorded for changes, reviews, briefs; ask filled via `eval record --fill`; ask baseline refreshed in replay; `eval run --suite all --mode replay` green.

Detail: Task 0 live probe of `POST https://openrouter.ai/api/v1/systemone` (`typesafe/jev-1.14`): HTTP 200, shape matches `responseSchema`, `model` echoed dated (`typesafe/jev-1.14-20261014`), `usage.cost` present (derived 0.042 $/M input = old placeholder, kept as fallback), score probability keys 0-based.

Ask spend total: ~$16.8 failed takes + $0.07 fill. Other suites: briefs $0.55, changes $0.07, reviews $0.17.

## Next (overwrite)
Owner go-ahead -> `/rm-merge jev-openrouter`. The ask-inject-09 BACKLOG item (~L231) stays open: known flake, not a 1.14 regression (Jev guard answer identical to the old cassette, in_scope 0.98; B3 fails when the Ask model quotes "closing down for good" while refusing).

## Interfaces this branch adds or changes
Expected: Jev URL/key/model id in `packages/ai`; `ai.yaml jev.input_usd_per_mtok` removed; `SPEND_GUARD_EXCLUDED_PROVIDERS` emptied. No migration expected (next free **0095**; neither phase-15c3b nor phase-16 adds one).

## Assumes from other branches
- phase-15c3b: no migration; touches billing, email types, `packages/demo/src/coverage.ts` and README. No overlap with `packages/ai`, `@cs/db` spend, evals, `turbo.json`, env.
- phase-16: docs-only so far (onboarding spec/plan/mockups). No overlap.

## Decisions (owner-approved)
None yet.

## New backlog (target -> item) - for /rm-merge
- Close in BACKLOG: L71, L78, L217 (b), L232, L242. Keep open: ask-inject-09 (~L231) and L224.
- Phase 7c follow-up: `eval record` saves a take with blocking failures, so a flaky B3 case forced full paid retakes. `record --fill` (replay stored, live only on misses) closes this in practice (ask filled for $0.07); per-case record / `--keep-only-green` is now optional.
- Billed-but-unparseable 200 (Jev and LLM) is ledgered with costUsd null => counted as 0; carry the parsed `usage.cost`/estimate on the thrown AiProviderError and ledger it (`ai.ts` recording()).
- Ask evals: run cases with bounded concurrency (now ~1 h sequential) and use prompt caching for the system prompt + tool definitions (~12k prompt tokens per Sonnet 5 call).
- Root `CLAUDE.md` Decisions edits at merge: stack line "Jev decisions" -> "Jev decisions via OpenRouter (`typesafe/jev-1.14`)"; Cost guards "Jev excluded via `SPEND_GUARD_EXCLUDED_PROVIDERS`" -> "Jev counts like any provider (exclusion list empty)".
- Also at merge: STATE/ARCHITECTURE 7b1 line and 7b spec d10/d19 mention the Jev exclusion (historic; note lifted).

## Owner verification steps
1. Compare one day of OpenRouter activity for `typesafe/jev-1.14` with the `ai_usage` Jev rows.
2. Close the TypeSafe account.
3. Delete `TYPESAFE_API_KEY` from `.env`, Vercel, Railway and the GitHub secret.
4. Expect a spike warning/pause in the first week of real Jev cost (reset: Platform -> Health -> Reset).
(Live contract run: `pnpm --filter @cs/ai exec vitest run jev.live`, needs `OPENROUTER_API_KEY`.)

## Brief

### 1. Scope
Owner wants one AI provider/bill and Jev in the spend guard. Must change:
- **Adapter** `packages/ai/src/decisions/jev.ts`: `JEV_URL` (l.6, `https://api.typesafe.ai/v1/systemone`), Bearer key, default model `jev-latest` (jev.ts; `config.ts:42`; `ai.yaml` tasks). OpenRouter ids: `typesafe/jev-1.13`, `typesafe/jev-1.14`, `~typesafe/jev-latest`.
- **Cost:** now `input_tokens * rate / 1e6` (end of `decide`; rate = `ai.yaml jev.input_usd_per_mtok` 0.042 placeholder, `config.ts:71`). OpenRouter doc says response `usage` carries `cost` (USD): use it; zod `responseSchema` (l.25-29) must accept it.
- **Spend guard:** `SPEND_GUARD_EXCLUDED_PROVIDERS = ['jev']` (`packages/db/src/spend.ts:11`; also `packages/tools/src/usage.ts`, `spend-guard.ts`, `packages/demo/src/rehearsal/report.ts`; test `spend.test.ts:53-59`); decision d19 in `docs/superpowers/specs/2026-10-22-phase-7b-money-design.md` (d10: "total = all rows except Jev"); `docs/OPS.md`; 7b1 plan. Check whether the spike guard needs a Jev entry.
- **Evals:** cassettes `packages/evals/cassettes/{ask,briefs,changes,reviews}.json`, keyed by `cassetteKey(config, task, kind, canonical request)` (`packages/ai/src/cassette.ts:88`); verify whether the model id enters the key. Live tests: `packages/ai/src/decisions/jev.live.test.ts`, `packages/engine/src/engine.live.test.ts`; `.github/workflows/evals-live.yml` uses `TYPESAFE_API_KEY`.
- **Env/config/docs:** `packages/ai/src/env.ts:21-23` (key gate), `ai.ts:156-167` (error text names `TYPESAFE_API_KEY`), `apps/worker/src/env.ts`, `.env.example`, `docs/DEPLOY.md`, `docs/OPS.md`, `docs/gotchas-cross-cutting.md`, `packages/ai/CLAUDE.md:5`, `docs/research/2026-09-30-phase-2-vendor-apis.md`.
- Core spec refs (by section): 7.1-7.4 (providers, task config, DecisionProvider, uses), 7.5 (cost ledger), 6.2 (tagging), 11 (Jev outage -> LLM), 12 (evals), 14 (Jev early-access risk).
- OpenRouter doc (`/docs/guides/community/jev`): endpoints `POST /api/v1/systemone` (SDK path, undocumented on the page) and `POST /api/alpha/decisions` (documented, alpha); score answers 0-based; input-only pricing (output free); context 262,144 tokens; >~32 KB text or images use a slower long-context mode; no ZDR/data-collection statement, rate limits or error shapes.

### 2. Already built - reuse, don't rebuild
- Jev client: `packages/ai/src/decisions/jev.ts` (`createJevProvider`, `mostLikelyLevel`), `decisions/types.ts` (`noulConfidence`, `validateQuestions`), `decisions/cascade.ts` (Jev -> `llm_decisions` -> human; shadow samples `decision_sample`).
- Wiring: `ai.ts:82-167` (`recording()` writes the ledger with provider `jev`; AiGuard before call), `env.ts`, `http.ts` (`postJson`, limiter, `timeoutMs`).
- OpenRouter: `createOpenRouterProvider`; `ai.yaml openrouter: {data_collection: deny, zdr: true}` (LLMs only).
- Tasks on Jev (min_confidence 0.85): tag, structured, merge, page, review, price, `verifier_decisions` (request_path), `ask_guard_decisions`, `ask_interpretation_decisions`; request-path budget rule `config.ts:83-92`.
- Spend: `@cs/db` `spend.ts`, `createAiGuard`, `@cs/tools` `spend-guard.ts`/`usage.ts`; ledger `cost_usd numeric(14,6)` (0089).
- Redaction: `redactForModel` upstream of `decide`; unchanged.
- Evals: `createCassetteAi` (record/replay, `CassetteMissError`), `@cs/evals` (`eval record --suite`), CI `eval:replay`.
- Demo: `packages/demo/src/rehearsal/report.ts:265` (excludes Jev), `createRehearsalAi`.

### 3. Binding decisions (never re-open)
Root CLAUDE.md: "Review decisions stay on Jev until pilots supply gold labels at volume; don't change verifier tau (0.85) before labelling `verifier_decisions`"; "OpenRouter generation (`ai.yaml`); Jev decisions, cascade Jev -> LLM -> human"; Cost guards 7b "Jev excluded via `SPEND_GUARD_EXCLUDED_PROVIDERS`" (this work lifts it, as d19 anticipated once the price is confirmed); Quality gates 7c1 "CI `eval:replay` miss => re-record in the PR (<= $5/run)"; Pilot 7c "vendor calls via the limiter (`timeoutMs`)"; model input via `redactForModel`; ask before adding any `.env` var.

### 4. Backlog to fold in (verbatim, docs/BACKLOG.md)
- L71: Run `jev.live.test.ts` once with a real `TYPESAFE_API_KEY` (make `@cs/ai` tests load `.env`) to confirm 0- vs 1-based scores — *from Phase 1 review* (7c2 Task 13, owner)
- L78: 7b2/later: confirm the Jev price, then lift the d19 exclusion (`SPEND_GUARD_EXCLUDED_PROVIDERS`) — *phase-7b1*
- L217: 7c2 Task 13 (owner): ... (b) `pnpm --filter @cs/ai exec vitest run jev.live` with the real `TYPESAFE_API_KEY`, record 0- or 1-based ... — *phase-7c2*
- L224: Accuracy report "consider routing to the LLM" note: restrict pairing to `reason = 'shadow'` samples before acting; keep review decisions on Jev until ~200 pilot labels — *from 3d final review, owner 2026-10-03*
- L232: Confirm Jev's real price (`ai.yaml` placeholder); until then Jev is excluded from credit limits and the spike guard — *phase-7-planning*
- L242: Confirm Jev pricing (0.042 $/M input is a placeholder) before costs feed budget caps — *from Phase 1, HANDOVER §7*
- Related L162: ... a review whose decide keeps throwing (Jev and LLM down) is re-offered every 5 min with no backoff — *from 15b-3b*
- Related L322: 3d minors: ... `ai.ts` ~135 duplicate jev check ... — *from 3d Tasks 1–14*
(The OpenRouter doc says scores are 0-based; confirm with one live call.)

### 5. In-flight workstreams
phase-15c3b (code complete, awaiting sign-off/merge) and phase-16 (docs only): neither touches `packages/ai`, `@cs/db` spend, evals, `turbo.json` or env. Main at migration 0094; no in-flight migration; next free 0095.

### 6. Open questions
All resolved in the owner-approved spec (see spec); not repeated here.
