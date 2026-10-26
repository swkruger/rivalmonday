# Jev via OpenRouter — design (new decisions and interfaces only)

**Date:** 2026-10-25 · **Branch:** `jev-openrouter` · **Brief:** `docs/work/jev-openrouter.md` (Brief §1–6 lists every touched file and the backlog lines).
**Core spec refs:** §7.1–7.5 (providers, task config, DecisionProvider, cost ledger), §11 (Jev outage → LLM), §12 (evals), §14 (Jev early-access risk). 7b money spec d10/d19 (Jev excluded from spend totals until its price is confirmed).

## 1. Intent

The owner wants **one AI bill**: every model cost, Jev included, paid through OpenRouter. The TypeSafe account will be **closed** once this ships. A side effect the owner wants too: Jev spend becomes real, measured cost, so it can join client credit limits and the platform spike guard (lifting the 7b d19 exclusion).

**Goals**
- Every Jev (System One) call goes through OpenRouter with the existing `OPENROUTER_API_KEY`.
- Jev's recorded cost is what OpenRouter charged (response `usage.cost`), not the `ai.yaml` placeholder rate.
- Jev spend counts in credit limits, the spike guard, the usage/costs pages and the rehearsal report like any other provider.
- The direct TypeSafe path and `TYPESAFE_API_KEY` are removed everywhere (code, CI, `.env.example`, docs).

**Non-goals**
- No change to the decision cascade (Jev → `llm_decisions` → human), to which tasks use Jev, to `min_confidence`/verifier τ 0.85, or to redaction (`redactForModel` stays upstream of `decide`).
- No second Jev route or automatic failover; an OpenRouter Jev outage is handled by the existing cascade (spec §11).
- No UI, no migration, no new env var.

**Anti-goals** (failure even if it "works")
- A Jev call whose cost is silently recorded as 0 or as the old placeholder while OpenRouter bills more.
- Any remaining code path or CI job that still needs `TYPESAFE_API_KEY` after the account is closed.
- Decision samples from 1.13 and 1.14 that can no longer be told apart.

## 2. Owner decisions (2026-10-25)
| # | Decision |
|---|---|
| O1 | Goal = a single OpenRouter bill. |
| O2 | Close the TypeSafe account; drop the direct path and `TYPESAFE_API_KEY` (no fallback route). |
| O3 | Pin **`typesafe/jev-1.14`** now (not 1.13, not `~typesafe/jev-latest`). τ 0.85 unchanged. |
| O4 | Privacy accepted as is: competitor/review text already goes to TypeSafe; OpenRouter now also sees it; ZDR/`data_collection` coverage for decisions is undocumented and accepted without further confirmation. |

## 3. Builder decisions (Claude's calls; owner may override)
| # | Decision | Why |
|---|---|---|
| B1 | **One branch, one phase** (no sub-phases). | Small, cohesive change; lifting the exclusion is only safe together with real cost. |
| B2 | **Endpoint:** OpenRouter's SDK-compatible System One path (`https://openrouter.ai/api/v1/systemone`), same request/response shape as today. Task 0 makes **one live call** to confirm the path, the shape, `usage.cost`, and 0- vs 1-based score indexing. If the SDK path fails, fall back to the documented `/api/alpha/decisions` and adapt the adapter; record which in the work file. | Least code change; the alpha endpoint can break without notice. |
| B3 | **Cost:** `cost_usd` = response `usage.cost` (USD). If a successful response lacks a numeric `usage.cost`, record cost from `input_tokens × jev.input_usd_per_mtok` (kept in `ai.yaml` as a **fallback estimate**, renamed comment, value updated to the page price if the owner supplies one) and log a warning with the task name only. Never record 0 for a billed call. | Truth from the biller; a missing field must not hide spend. |
| B4 | **Ledger provider name stays `jev`** (not `openrouter`). `SPEND_GUARD_EXCLUDED_PROVIDERS` becomes `[]` (constant kept, so the mechanism stays for future providers). The spike guard then counts Jev automatically; no Jev-specific threshold. | Continuity for accuracy reports, `decision_sample.provider`, Costs page; minimal surface. |
| B5 | **Version on samples:** the Jev adapter returns the response `model` (it already parses it); the cascade stores it as optional `model` on `SampleAnswers` (jsonb inside `decision_sample`, **no migration**). Rows without `model` are pre-switch (direct API, 1.13). | Keeps 1.13/1.14 distinguishable for future labelling (anti-goal 3). |
| B6 | **Model id config:** `ai.yaml` default Jev model = `typesafe/jev-1.14` (replaces `jev-latest` in `config.ts` default and every Jev task). | Pinned, reviewable in one file. |
| B7 | **Cassettes:** the model id is part of each task's signature (`taskSignature` → `cassetteKey`), so every Jev-task cassette entry misses. Re-record the affected suites once in this branch (`eval record --suite …`), within the 7c1 rule (≤ $5/run per suite); CI `eval:replay` must pass. LLM-only entries are untouched. | Binding 7c1 quality gate. |
| B8 | **Env gate:** `packages/ai/src/env.ts` Jev availability = `OPENROUTER_API_KEY` present (same key the LLM providers use); error/help text that names `TYPESAFE_API_KEY` is rewritten. `.github/workflows/evals-live.yml` and the live tests (`jev.live.test.ts`, `engine.live.test.ts`) switch to `OPENROUTER_API_KEY`. | O2; no new env var. |
| B9 | **Docs:** `packages/ai/CLAUDE.md`, `docs/DEPLOY.md`, `docs/OPS.md`, `docs/gotchas-cross-cutting.md`, `.env.example`, research doc note; root `CLAUDE.md` Decisions lines "Jev decisions" and "Cost guards (7b) … Jev excluded" updated at merge. BACKLOG closes L71/L217 (0/1-based, answered by the Task 0 live call), L78/L232/L242 (price → real cost). | Shared docs change only at merge. |

## 4. Interfaces (binding)
```ts
// packages/ai/src/decisions/jev.ts
export const JEV_OPENROUTER_URL = 'https://openrouter.ai/api/v1/systemone'; // B2; Task 0 may switch to the alpha path
export interface JevProviderOptions { apiKey: string /* OPENROUTER_API_KEY */; model?: string /* default 'typesafe/jev-1.14' */; fallbackUsdPerMtok: number; timeoutMs?: number }
// responseSchema gains: usage: { input_tokens: number; cost?: number }  (extra fields allowed)
// DecisionResult gains: model: string   (the response's model id)

// packages/db/src/schema/model-ops.ts
export interface SampleAnswers { provider: string; model?: string; answers: Record<string, unknown> }

// packages/db/src/spend.ts
export const SPEND_GUARD_EXCLUDED_PROVIDERS: readonly string[] = [];
```
Request headers: `Authorization: Bearer <OPENROUTER_API_KEY>`, plus the same `HTTP-Referer`/`X-Title` attribution headers the OpenRouter LLM provider sends (reuse its constants). Calls stay on `postJson` through the vendor limiter with `timeoutMs` (7c binding).

## 5. Behaviour and edge cases
- **Outage / 5xx / timeout / 429:** unchanged cascade behaviour (Jev error → `llm_decisions`); no retry loop added here.
- **401/403 from OpenRouter:** treated like today's auth failure (provider unavailable → cascade), logged with status only.
- **AiGuard:** checks run before the call as today; with the exclusion lifted, a paused client or platform spike pause now also blocks Jev decisions → cascade falls to the LLM, which the same guard also blocks → human. This is intended (Jev is now billed spend).
- **Rehearsal report** (`packages/demo/src/rehearsal/report.ts:265`) and `@cs/tools` usage/spend-guard simply see an empty exclusion list; their tests assert Jev rows now count.
- **Existing ledger rows** recorded under `jev` before the switch keep their placeholder cost; no back-fill.
- **Spike guard right after the switch (B10, Claude's call):** lifting the exclusion adds Jev to both the baseline and the current window. If OpenRouter's real Jev price is well above the placeholder, the first week can show a jump (+100 % warn, +200 % pause-all-AI). No grace window in code: prod has no pilot traffic yet, and staff can reset the guard. `docs/OPS.md` gets a one-line note to expect and reset a post-switch spike; Task 0's live `usage.cost` also lets the fallback estimate in `ai.yaml` be set close to the real rate.
- **Re-recorded cassettes** carry the real `usage.cost`; eval assertions on cost totals are updated with the re-record.

## 6. Verification
- Task 0 live call (owner key, a few cents): path, shape, `usage.cost`, score indexing → written to the work file.
- `pnpm --filter @cs/ai exec vitest run jev.live` green via OpenRouter; cassettes re-recorded; `eval:replay`, `test:affected`, `e2e:affected` green.
- Owner, after merge: confirm the OpenRouter activity page shows `typesafe/jev-1.14` charges matching `ai_usage` Jev rows for a day; then close the TypeSafe account and delete `TYPESAFE_API_KEY` from `.env`, Vercel and Railway (the code no longer reads it).

## 7. Left to the builder
Exact zod shape of `usage` beyond `input_tokens`/`cost`; test names; how the fallback-estimate warning is deduplicated; wording of the rewritten env error text.
