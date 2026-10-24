# phase-7b1 — cost guards: credits, platform-owned limits, spend pause, spike guard, housekeeping

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-7b1   **Base:** `8e89d375` (main; rebased 2026-10-23 onto 15b-3b + 15c-2a)
**Plan/spec:** [plan](../superpowers/plans/2026-10-23-phase-7b1-cost-guards.md) · [spec](../superpowers/specs/2026-10-22-phase-7b-money-design.md) — owner-approved 2026-10-23.

## Status (overwrite)
Implementation complete (tasks 0–16, ~33 commits), rebased on main `8e89d375` (migrations renumbered to 0089–0091; `engine-reask` marked `usesAi`; page-gate/viewer-tz fixes). Final whole-branch review pending (full unit + E2E `--base main`, run once).

## Next (overwrite)
Final review -> fix wave -> owner sign-off of the copy below -> `/rm-merge` (owner go-ahead).

## Interfaces this branch adds or changes
- **Migrations:** 0089 `ledger_cost_numeric` (`cost_usd numeric(14,6)`), 0090 `spend_guard` (`client.spend_limit_usd numeric(10,2)` [replaces `monthly_cap_usd`], `client.spend_paused_at`, `llm_call`/`vendor_call.competitor_id`, `spend_guard_event`, `platform_setting` keys `spend_guard_settings`, `ai_guard_state`), 0091 `retry_backoff` (`model_batch.provider_batch_id` nullable + status `pending`; `move.rec_attempts`/`rec_retry_after`).
- **Tools:** `get_my_usage`, `get_spend_status` (tenant, credits only), `get_client_limits`, `set_client_limits` (now platform owner/staff only; input `spendLimitUsd`), `get_spend_guard`, `get_ai_guard_state`, `update_spend_guard_settings` (owner), `reset_ai_pause` (staff). `get_usage`/`get_portfolio` return `credits` (`SpendCredits`), no USD.
- **Worker:** job `spend-guard` (`'7 * * * *'`, short, retryLimit 1); `usesAi` job flag (platform pause -> re-send `startAfter: 600`; cron jobs wait for the next tick); `createWorkerDeps(env, { aiGuard: false })` for `*-once`.
- **AI guard:** `AiGuard.assertAllowed(scope)` / `AiPausedError('platform'|'client')`; `createAiGuard` (`@cs/db`, 30 s cache); registry maps to `spend_paused` / `system_busy`. `ChatRequest.signal` (Ask abort).
- **Helpers:** `clientWorkAllowed`, `SPEND_GUARD_EXCLUDED_PROVIDERS`, `spendByClient` (O11 split), `splitByCompetitor`, `PROSPECT_SNAPSHOT_COOLDOWN_HOURS`, `PDF_RETRY_HOURS`, `MOVE_REC_MAX_ATTEMPTS`.
- **Email kinds:** `client_spend_paused` (agency billing notice), `platform_spend_alert` (staff). **Routes:** client `/c/<id>/settings/usage`; agency usage page now read-only.

## Decisions
Spec d1–d19 bind. Plan-local 1–13: numeric ledger; migration 0091 (was 0087); guard also stops Jev calls; `*-once` CLIs unguarded; per-move rec backoff; stateless PDF backoff; `pending` batch row; `get_my_usage.questions` null for client roles; three extra read tools; C1 inline note; C6 on the 9b sender; one `client_paused` event/month; rank budget 130 %. Owner 2026-10-23: **test suites run once at the final review**, not per task. Controller rulings (cost if wrong):
1. Every task keeps `pnpm typecheck` green; web consumers get minimal compile fixes; T5 deletes the agency limits form. (small duplicate edit)
2. T9 `summary.spike` = unchanged guard state; T10 inserts the spike step. (trivial)
3. workflow.spec usage rewrite moved T11 -> T5. (T11 re-touches the spec)
4. `*-once` CLIs unguarded via `{ aiGuard: false }`. (trivial)
5. Mid-turn `AiPausedError` copy stays as Ask fallback; runbook-tailor rethrows `AiPausedError`. (small)
6. Cron jobs not re-sent on platform pause (standard queues don't dedupe `singletonKey`); resend passed for all jobs. (small)
7. One-time auto competitor search refused as `spend_paused` is not retried after the pause lifts. (agency runs a manual search)
8. Spike `baselineUsd <= 0` -> ratio 0 (no warn/pause); spec floors keep `min(0)`. (a zero-floor config never spike-pauses until history exists)
9. History lookback 8 days (finds the same-weekday midpoint before 12:00 UTC) vs the brief's 7. (none)
10. Null-scope ledger paths (engine vertical stages, discovery/classify, leads, embeddings, own Playwright crawl) stay unattributed (spec d8 platform overhead). (some shared spend never reaches a client limit; spike guard still sees it)

## Owner verification (copy is used verbatim; edit at the code paths named)
**Tenant copy.** R1 rank-scan refusal and agency notice: "{Client} is close to this month's credit limit, so this scan can't run until next month." S1: "AI work for this client is paused for the rest of this month — it went well past this month's credits." C1: "{Client} has used this month's credits. Nothing changes — monitoring, briefs and Ask carry on as normal." C2 (banner and C6 email body): "AI work for {Client} is paused until {November 1} — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit." C3: "Monitoring and new briefs are paused for the rest of this month. Your past briefs and evidence are still here, and your {agency} team has been told." (unbranded: "your team has been told"). C4: "Ask is paused for the rest of this month. Your past answers are still here." C5: "The system is currently experiencing heavy load — please try again later." C6 email: subject "{Client}: AI work paused until {date}", button "Open usage"; header is **platform-branded** (9b agency sender, Decision 11; owner may switch to agency branding). P1: "This business had a snapshot in the last 24 hours — try again tomorrow." Badges: "{pct}%", Near limit, Limit reached, Paused (calm grey).
**Staff copy.** C7 "AI spend is {n}% above normal ({scope})." C8 "All AI calls are paused after a spend spike ({scope}). Queued work is waiting — reset on Health." Scopes: all providers / OpenRouter / Anthropic. C9 staff email: subject "{Client} ({Agency}) paused for spend", line "{Client} used {$} of its {$} limit this month (pause at {n} %). Raise the limit on the agency page or it lifts on {date}." Implementer-drafted: spike email titles "AI spend spike" / "All AI calls are paused after a spend spike", line "Observed $x in the last 24 hours against a baseline of $y.", button "Open Health" (also the banner link) and "Open usage" for client pauses. Health: card "Spend guard", states OK/Warning/Paused, "Paused clients", "Recent events", "No client is paused for spend.", "No guard events yet.", floor tooltip; Reset dialog "Reset the AI guard?", body, note label, "Confirm reset", "Guard reset. Queued AI work resumes.", errors "Add a short note about why you are resetting." / "Keep the note to 200 characters or fewer."; tool error "Nothing to reset". Costs: "Limits & spike guard", eight field labels, errors "Enter numbers only" / "Nothing to change". Agency detail: "Client limits", column names, "Default ($N)", "Pause lifted." / "Saved.", errors in `agencies/[id]/client-limits.tsx`.
**Help (all drafts).** Guides: `agency.settings.usage.agency`, `client.settings.usage.{agency,client}`, `platform.{health,costs,agencies.detail}.operator`, `agency.prospects(.detail).agency` (24 h cooldown; "cost" removed); "cap" -> "credit limit" in `agency.portfolio`, `account.inbox`, `client.rankings` guides and in `help/copy/{agency,client,account,platform}.ts` tips. Glossary "Credits" (`packages/core/src/help/glossary.ts`). Shared-cost wording corrected to O11 (split between tracking clients).
**Manual checks.** (1) Agency usage page: credits only, read-only; client owner sees their own page. (2) Platform -> Agency -> Client limits: set a low override; reached shows C1; 130 % pauses once with banner (C2/C3), agency email (C6), staff email (C9); raise the limit -> "Pause lifted.". (3) Ask on a paused client shows C4; rank scan shows R1. (4) Lower the spike floors to force a spike: Health Warning/Paused, banner C7/C8, Reset needs a note. (5) Migrations apply on a fresh DB; `git ls-files --eol | grep crlf` clean.

## Backlog to close at merge (BACKLOG.md text)
- l.18: "Enforce caps (pause Ask/jobs at 100 %) and allocate shared collection cost to clients — *from 5b-2 (decision 18)*"
- l.19: "Prospect snapshots: add a cooldown (≈ $0.10–0.15 per re-run) and attribute GBP/ads pulls to the prospect (usage page under-reports) — *from 5b-2 final review Minor 3*"
- l.20: "Switch `cost_usd` (`packages/db/src/schema/ledger.ts`, `doublePrecision`) to `numeric` before real spend data — *from Phase 1 review*"
- l.47: "7b: Ask turn deadline: a true AbortSignal through `chatWithTools` (today 90 s soft deadline, 45 s final-call reserve, route `maxDuration` 300) — *from 7a*"
- l.270 (reword, not close): "Anthropic batch: submit precedes `model_batch` insert (orphans not auto-reconciled); apply not idempotent; `collectModelBatches` no per-item try/catch; no `ok:false` ledger row on submit/status/results throw — *from 3d Tasks 8–9, 4a*" (pending row, sweep and idempotent apply done; per-item try/catch and `ok:false` row remain)
- l.278: "Failing move recommendations retry nightly with no backoff — *from 4a*"
- l.282: "Failing PDF render re-enqueued hourly for 7 days (≤ ~500 attempts) — add a failure counter/backoff if noisy — *from 4b final review*"

## New backlog (target → item)
- Phase 7b2/later: confirm the Jev price, then lift the d19 exclusion (`SPEND_GUARD_EXCLUDED_PROVIDERS`).
- Future: buying extra credits (self-serve top-up).
- Polish (db/tools): `spend-guard.ts` bare `console.warn`; extra `platform_setting` read per budget/usage/portfolio call; no negative cache on guard read failure; missing `ai_guard_state` row could double-insert an event (theoretical); `sendStaffEmail` ~ `sendLowEmail`; `rowsOf` duplicated; `spendByClient` CTE scans all competitors; no tests for jobs/post batch ids, ads/google scope, mid-embed refusal, web guard wiring.
- Polish (web): events table shows raw kind enum and actor UUID; costs action error punctuation; client-limits input width classes; blank competitor/Ask field -> raw zod message; layout guard read runs after the costs read; prospect detail guide "Run snapshot again" lacks a 24 h pointer; no exact-24 h edge test.
- Polish (worker/engine): swept orphan batches counted as `expired`; PDF tick jitter; dead `if (!providerId)` branch; non-limit `set_client_limits` edits can lift a pause when under threshold; a failed pending-row update can duplicate a provider batch after the 1 h sweep (cost only); `timeoutSpy.mockRestore` not in `finally`; no body-read-abort test; E2E "destination stream closed early" noise.

## Final-review checks
Prospect AI calls carry `clientId`; handlers that catch model errors internally (generateBrief, moves recs, alert template fallback) must not record `AiPausedError` as an ordinary failure; C6 email date equals banner date; tenant payloads carry no `$`, cost or product name.

## Shared docs to fold in at merge
STATE (7b1 done), ARCHITECTURE (spend guard, credits, O11 attribution, `usesAi`), BACKLOG (the lines above), roadmap row. `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md` is already updated on this branch.
