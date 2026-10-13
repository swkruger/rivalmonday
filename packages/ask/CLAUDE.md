# @cs/ask — working notes
Ask assistant "Friday" (Phase 6b): quota, turn orchestration, grounding, starters, actions. Spec `docs/superpowers/specs/2026-10-12-phase-6b-ask-design.md` (e1-e11).

## Gotchas
- **Clients never learn counts or quotas.** `beginTurn` returns only `ok`/`quota`; never surface `client.ask_monthly_quota` or usage to a client role.
- **Quota is per client, across users.** `ask_message` RLS is author-only (no agency view), so usage is read through the `ask_quota_used()` SECURITY DEFINER count function (migration 0044) under a per-client advisory lock. It works only because the function owner has BYPASSRLS (`ask_message` is FORCE RLS); without that the count is silently 0 and quota fails open.
- **Verify-then-send (e1):** never stream tokens. The draft is grounded (`groundAnswer`) and only then emitted as one final; a `groundAnswer` throw becomes the error copy, never the draft.
- **Citations only from this turn's tool results.** Refs the model invents are dropped/downgraded. Evidence text comes from tool results; fallback reads via `toolDeps.evidenceStore` (needed, else uncited claims can't be supported), under `get_evidence` access checks, `redactForModel`, capped 4000.
- **The model never executes writes (e8).** It only proposes (`ASK_WRITE_TOOLS`); the user confirms and `confirmAskAction` runs it once via `runTool` through a guarded UPDATE of the action row. Save-as-recommendation goes through `add_recommendation` (source `ask`).
- **`ask_message` rows copy agency/client/user from the thread** (`beginTurn`), never from the request; the composite FK only covers `(thread_id, user_id)`.
- **History pairing:** a user message paired with a skipped (refused/quota/cancelled/error) assistant row is dropped from model history.
- **Fake AI for E2E:** `ASK_FAKE_AI` (parseWebEnv throws under `VERCEL_ENV=production`) swaps in `createScriptedAskAi` from `@cs/ask/testing`. Support-check steps need `repeat: true`; `E2E_SCRIPT` finds the clientId by regex on the prompt line, so don't reword that line.
- **Knowledge citations (6c):** `kb:` keys come from any tool node with `kbId` + `chunks` (only `search_knowledge` today) and are always "bodied" (never the evidence-access fallback). `search_knowledge.clientId` is overwritten with the thread's client before invoke. Uncited/interpretation sentences ground against `ev:` text only (`allText`), so knowledge never backs an uncited competitor claim (k9).
