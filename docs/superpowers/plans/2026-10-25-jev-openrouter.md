# Jev via OpenRouter — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; implementers write code + tests from Behaviour + Tests.

**Goal:** Every Jev (System One) call goes through OpenRouter on `OPENROUTER_API_KEY`, pinned to `typesafe/jev-1.14`, its cost taken from OpenRouter's `usage.cost`; Jev spend joins the spend guard; the direct TypeSafe path and `TYPESAFE_API_KEY` are gone.

**Architecture:** Change the one Jev adapter (`packages/ai/src/decisions/jev.ts`) and its wiring (`env.ts`, `ai.ts`, `ai.yaml`, `config.ts`); empty `SPEND_GUARD_EXCLUDED_PROVIDERS`; add the model id to decision samples (jsonb, no migration); re-record Jev cassettes. Cascade, redaction, task routing and τ unchanged.

**Spec:** `docs/superpowers/specs/2026-10-25-jev-openrouter-design.md` (O1–O4 owner, B1–B10 builder; §4 Interfaces binding). Brief: `docs/work/jev-openrouter.md`.

## Global constraints
- Root `CLAUDE.md` Essentials; read `docs/gotchas-cross-cutting.md`, `packages/ai/CLAUDE.md`, `packages/db/CLAUDE.md`, `packages/tools/CLAUDE.md`, `packages/evals/CLAUDE.md` (if present) before coding.
- **No new env var.** Remove `TYPESAFE_API_KEY` everywhere it is read or listed (code, `turbo.json`, `.env.example`, CI, docs); never edit the real `.env` (owner deletes the key after merge).
- Model input stays behind `redactForModel` (unchanged call sites). Vendor calls stay on `postJson` with the limiter and `timeoutMs`.
- Logs: status codes, task names, ids only; never request bodies, state text or keys.
- Jev cost is never recorded as 0 for a billed call (spec anti-goal 1).
- Cassette re-record budget ≤ $5 per suite per run (7c1). Task 0's live probe: ≤ 3 calls.
- Commits end with the root `CLAUDE.md` trailer (subagents: own model); LF only. Test scope: root `CLAUDE.md` § Process 6.

## Decisions (plan-local; spec binds)
1. One adapter, no transport switch (O2): `JEV_OPENROUTER_URL` replaces `JEV_URL`; no `direct` code path survives.
2. `costUsd = usage.cost` when it is a finite number ≥ 0; else `input_tokens × fallbackUsdPerMtok / 1e6` and one `console.warn('[ai] jev response had no usage.cost; using the fallback estimate', { model })` per provider instance (B3).
3. `ai.yaml` `jev.input_usd_per_mtok` stays as the **fallback estimate** (comment says so); Task 0 updates its value to `usage.cost / input_tokens × 1e6` observed in the probe, rounded to 4 decimals.
4. Model id comes from each task's `model` in `ai.yaml` (all → `typesafe/jev-1.14`); `config.ts` default too. The adapter default matches.
5. `SampleAnswers.model` is filled from the provider's returned `model` for the Jev side (and the LLM side if the trace already has it); absent on old rows.
6. Provider id / ledger provider stays `'jev'`; limiter key stays `'jev'`.

## File structure
- `packages/ai/src/decisions/jev.ts` (+ `jev.test.ts`, `jev.live.test.ts`), `packages/ai/src/env.ts` (+ `env.test.ts`), `packages/ai/src/ai.ts` (error text), `packages/ai/src/config.ts`, `packages/ai/config/ai.yaml`, `packages/ai/vitest.config.ts` (comment)
- `packages/ai/src/decisions/cascade.ts` and/or `ai.ts` `keepSample` (+ tests), `packages/db/src/schema/model-ops.ts` (`SampleAnswers`)
- `packages/db/src/spend.ts` (+ `spend.test.ts`), `packages/tools/src/spend-guard.test.ts`, `packages/tools/src/tools/usage.test.ts`, `packages/demo/src/rehearsal/report.ts` (+ test)
- `apps/worker/src/env.ts`, `turbo.json`, `.env.example`, `.github/workflows/evals-live.yml`, `packages/engine/src/engine.live.test.ts`
- `packages/evals/cassettes/*.json` (re-recorded)
- Docs: `packages/ai/CLAUDE.md`, `packages/engine/CLAUDE.md`, `README.md`, `docs/DEPLOY.md`, `docs/OPS.md`, `docs/gotchas-cross-cutting.md`, `docs/research/2026-09-30-phase-2-vendor-apis.md` (note), `docs/work/jev-openrouter.md`

## Dependencies on in-flight work (re-check in Task 0)
- `phase-15c3b` (billing/email, no migration) and `phase-16` (docs): no overlap with the files above (brief §5). Re-check with `git diff main...<b> --stat` for `packages/ai`, `packages/db/src/spend.ts`, `turbo.json`, `.env.example`.
- No migration (next free 0095 untouched).

## Review focus
1. **Missing `usage.cost`** (or `null`/negative/NaN) on a successful response → fallback estimate recorded, warning logged once, never 0 (Task 1 test).
2. **No `OPENROUTER_API_KEY`** → Jev is unavailable exactly as before when `TYPESAFE_API_KEY` was unset: decisions go to the LLM if it can run, else the existing "not configured" error names `OPENROUTER_API_KEY` (Task 1 test).
3. **Leftover `TYPESAFE_API_KEY` reference** anywhere outside `docs/archive/` and dated plans/specs → grep gate in Task 1 Done-when.
4. **Paused client / spike pause** → Jev decisions are now blocked by the AiGuard like LLM calls (Task 3 test).
5. **Score indexing** → the probe's 0- vs 1-based finding is reflected in `mostLikelyLevel` (unchanged if 0-based; Task 0 records, Task 1 adjusts + tests if 1-based).

---

### Task 0: Pre-flight + live probe
**Goal:** Confirm the endpoint, response shape, `usage.cost` and score indexing before coding; record findings.
**Steps:**
- `git fetch && git rebase main`; re-check Dependencies; `pnpm install` done; own test DB `cs_jev_openrouter_test` exists.
- Live probe with `OPENROUTER_API_KEY` from `.env` (read via `grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-`, never echo it): a throwaway script in the scratchpad (not committed) POSTs to `https://openrouter.ai/api/v1/systemone` with `model: 'typesafe/jev-1.14'`, a tiny state, one `noul`, one `choice` and one `score` question (3 levels) — the body `createJevProvider` builds today. Record: HTTP status; top-level keys; `usage` keys and values; `model` echoed; score `probabilities` keys (0- or 1-based). If not 2xx or the shape differs, retry once against `/api/alpha/decisions` and record that shape instead (≤ 3 calls total). Print no key, no full headers.
- Write findings to the work file (Status) and set Decision 3's fallback rate. If the alpha path was needed or the shape differs, edit Task 1's Interfaces inline before dispatching it.
**Done when:** findings in `docs/work/jev-openrouter.md`, committed `docs(jev-openrouter): pre-flight probe findings`.

### Task 1: Jev adapter on OpenRouter; `TYPESAFE_API_KEY` removed
**Goal:** The only Jev path is OpenRouter with the shared key and real cost.
**Files:** modify `packages/ai/src/decisions/jev.ts` (+ `jev.test.ts`, `jev.live.test.ts`), `packages/ai/src/env.ts` (+ `env.test.ts`), `packages/ai/src/ai.ts`, `packages/ai/src/config.ts`, `packages/ai/config/ai.yaml`, `packages/ai/vitest.config.ts`, `apps/worker/src/env.ts`, `turbo.json`, `.env.example`, `.github/workflows/evals-live.yml`, `packages/engine/src/engine.live.test.ts`.
**Interfaces (binding):**
```ts
export const JEV_OPENROUTER_URL = 'https://openrouter.ai/api/v1/systemone'; // or Task 0's path
export const JEV_DEFAULT_MODEL = 'typesafe/jev-1.14';
export interface JevOptions {
  apiKey: string;              // OPENROUTER_API_KEY
  model?: string;              // default JEV_DEFAULT_MODEL
  fallbackUsdPerMtok: number;  // ai.yaml jev.input_usd_per_mtok (fallback estimate only)
  appName: string; appUrl: string; // OpenRouter attribution headers, same as openrouter.ts
  http?: Partial<HttpDeps>;
  timing?: CallTiming;
}
// responseSchema.usage: z.object({ input_tokens: z.number(), output_tokens: z.number().optional(), cost: z.number().nullish() }).passthrough()
```
**Behaviour:**
- Headers: `authorization: Bearer <apiKey>`, `http-referer: appUrl`, `x-title: appName` (mirror `openrouter.ts:60-70`). `postJson('jev', JEV_OPENROUTER_URL, …)` unchanged otherwise.
- Cost per Decision 2. `outputTokens` = `output_tokens ?? 0`.
- `env.ts`: `jev` factory exists iff `OPENROUTER_API_KEY` is set (reuse the `router` key/app fields). `http.jev` test seam stays.
- `ai.ts` "needs Jev but … is not configured" names `OPENROUTER_API_KEY`; fold the duplicate jev check noted in BACKLOG L322 if it is the same line (no behaviour change).
- `config.ts` default model and every Jev task in `ai.yaml` → `typesafe/jev-1.14`; `jev.input_usd_per_mtok` comment = "fallback estimate when OpenRouter omits usage.cost".
- Remove `TYPESAFE_API_KEY` from `apps/worker/src/env.ts` list, `turbo.json` `globalPassThroughEnv`, `.env.example`, `evals-live.yml` (use `OPENROUTER_API_KEY` secret already present there; add it to that step's env if missing), live tests' skip conditions and the vitest config comment.
- If Task 0 found 1-based score keys: adjust `mostLikelyLevel` (subtract 1) and its doc comment; else leave it.
- **Follow pattern:** `openrouter.ts` (headers, attribution), existing `jev.test.ts` fake-fetch style.
**Tests (TDD):** `jev.test.ts`: `posts to OpenRouter with the pinned model and attribution headers` (URL, `model: 'typesafe/jev-1.14'`, three headers); `records usage.cost as costUsd`; `missing usage.cost falls back to the estimate and warns once` (two calls ⇒ one warn; cost = tokens × rate / 1e6 > 0); `null / negative usage.cost uses the fallback`; existing answer-mapping tests green. `env.test.ts`: `Jev is available iff OPENROUTER_API_KEY is set`; `TYPESAFE_API_KEY alone no longer enables Jev`. `ai.test.ts` (or existing): the not-configured error names `OPENROUTER_API_KEY`.
**Done when:** `pnpm --filter @cs/ai exec vitest run jev env ai`; `pnpm --filter @cs/ai exec tsc --noEmit`; `rg -n TYPESAFE_API_KEY --hidden -g '!node_modules' -g '!.env' -g '!docs/archive/**' -g '!docs/superpowers/**' -g '!docs/work/**' -g '!docs/BACKLOG.md' -g '!docs/STATE.md'` prints only doc lines Task 5 rewrites (README, OPS, DEPLOY, gotchas, research, engine CLAUDE.md).

### Task 2: Jev model id on decision samples
**Goal:** 1.13 vs 1.14 samples stay distinguishable (spec B5).
**Files:** modify `packages/db/src/schema/model-ops.ts` (`SampleAnswers`), `packages/ai/src/decisions/cascade.ts` and/or `packages/ai/src/ai.ts` (where `trace.primary`/`fallback` are built) + their tests.
**Interfaces:** `export interface SampleAnswers { provider: string; model?: string; answers: Record<string, unknown> }` — jsonb only, **no migration**.
**Behaviour:** when the cascade builds the primary/fallback trace from a `DecisionProvider` result, copy the result's `model` into the trace entry; `recordDecisionSample` stores it unchanged. Readers (accuracy report, labelling queue) ignore the new field; type-check them.
**Tests (TDD):** `a shadow sample records the Jev model id on the primary answers` (fake Jev returns `model: 'typesafe/jev-1.14'` ⇒ stored `primary.model` equals it); `an older sample without model still parses in the accuracy report` (if a reader test exists, add one row without `model`).
**Done when:** focused vitest in `@cs/ai` (cascade/ai) and any `@cs/db`/`@cs/engine` reader test touched; `tsc --noEmit` for touched packages.

### Task 3: Jev joins the spend guard
**Goal:** Jev spend counts in credit limits, the spike guard, usage/costs and the rehearsal report (spec B4, §5).
**Files:** modify `packages/db/src/spend.ts` (+ `spend.test.ts`), `packages/tools/src/spend-guard.test.ts`, `packages/tools/src/tools/usage.test.ts`, `packages/demo/src/rehearsal/report.ts` (+ its test), `packages/db/src/generic-topic-id.test.ts` only if it asserts the exclusion.
**Interfaces:** `export const SPEND_GUARD_EXCLUDED_PROVIDERS: readonly string[] = [];` (constant and its consumers kept; doc comment: "empty since jev-openrouter: Jev cost is real OpenRouter cost").
**Behaviour:** no logic change beyond the constant; consumers already filter by it. Update the doc comments that say "Jev excluded" (spend.ts, usage.ts, spend-guard.ts, report.ts).
**Tests (TDD):** replace `spend.test.ts:53-59`'s exclusion assertion with `Jev rows count toward client spend`; `spend-guard.test.ts`: `a client over its limit through Jev spend alone is paused`, and the spike guard counts a Jev-only jump; `usage.test.ts`: Jev cost appears in the client's credits; rehearsal report total includes Jev. AiGuard blocks a Jev decision for a paused client (Review focus 4; add in `@cs/ai` guard test if the guard test lives there).
**Done when:** focused vitest in `@cs/db` (spend), `@cs/tools` (spend-guard, usage), `@cs/demo` (report); `tsc --noEmit` for those.

### Task 4: Re-record Jev cassettes
**Goal:** CI `eval:replay` passes with the new model id (spec B7).
**Files:** `packages/evals/cassettes/{ask,briefs,changes,reviews}.json` (only suites with Jev-task entries change), cost assertions in eval tests if any shift.
**Steps:** run `pnpm --filter @cs/evals eval:replay` first and list which suites miss; for each missing suite run `eval record --suite <name>` (see `packages/evals` README/CLAUDE.md for the exact command and env) with `OPENROUTER_API_KEY`; note each run's recorded spend (≤ $5/suite; stop and report if a suite would exceed it); re-run `eval:replay` until zero misses. Check the diff: only Jev-task entries and their dependent outputs changed; no secrets or raw keys in cassettes (they are redacted/normalized — confirm).
**Done when:** `pnpm --filter @cs/evals eval:replay` green; spend per suite recorded in the work file.

### Task 5: Docs
**Goal:** Docs say Jev runs through OpenRouter; queue merge-time shared-doc edits.
**Files:** `packages/ai/CLAUDE.md`, `packages/engine/CLAUDE.md`, `README.md`, `docs/DEPLOY.md`, `docs/OPS.md`, `docs/gotchas-cross-cutting.md`, `docs/research/2026-09-30-phase-2-vendor-apis.md` (one dated note at the Jev section), `docs/work/jev-openrouter.md`.
**Behaviour:** overwrite stale clauses (don't append): Jev = OpenRouter `typesafe/jev-1.14` on `OPENROUTER_API_KEY`, cost from `usage.cost` (fallback estimate in `ai.yaml`), counts in the spend guard; live test needs `OPENROUTER_API_KEY`; `docs/OPS.md` one line: "after the Jev switch deploy, a spike warning/pause from the first week of real Jev cost is expected — reset it from `/platform/costs`" (B10; use the real reset location). Work file: Status/Next, "New backlog / closes" for `/rm-merge` — close BACKLOG L71, L78, L217 (b), L232, L242; root `CLAUDE.md` Decisions edits for merge (stack line "Jev decisions" → "Jev decisions via OpenRouter (`typesafe/jev-1.14`)"; Cost guards "Jev excluded via …" → "Jev counts like any provider (exclusion list empty)"). Owner verification steps: (1) compare one day of OpenRouter activity for `typesafe/jev-1.14` with `ai_usage` Jev rows; (2) close the TypeSafe account; (3) delete `TYPESAFE_API_KEY` from `.env`, Vercel, Railway and the GitHub secret.
**Done when:** Task 1's grep gate prints nothing outside `docs/archive/`, dated plans/specs, `docs/work/`, BACKLOG and STATE; `git ls-files --eol | grep crlf` empty; `packages/ai/CLAUDE.md` within its cap.
