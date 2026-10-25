# phase-7c1 — quality gates: isolation suite, RLS sweep, MCP contract, evals + cassettes + CI

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-7c1   **Base:** main @ 37b028ba
**Plan/spec:** [plan](../superpowers/plans/2026-10-23-phase-7c1-quality-gates.md) · [spec](../superpowers/specs/2026-10-22-phase-7c-quality-scale-pilot-design.md) — owner-approved 2026-10-23.

## Status (overwrite)
Tasks 0-14 done and reviewed (per-task reviews clean). Remaining: whole-branch final review + one fix wave (`pnpm test:affected`, `e2e:affected --base main`), then owner verification and merge. Two owner steps are open by ruling R3: confirm the changes/reviews labels (Task 9 steps 4-5) and refresh baselines; until then those suites' headline accuracy is empty (`prelabel_agreement.*` only).

## Next (overwrite)
Agent: final review on the most capable model. Owner: the verification steps below, then `/rm-merge phase-7c1` on go-ahead.

## Interfaces this branch adds or changes
No migrations, no env vars in `.env` (`EVAL_MAX_USD` only in turbo `globalPassThroughEnv`). Run commands: `docs/OPS.md` § Evals.
- **`@cs/evals`** (new): CLI `eval build|label|run|record`; `SuiteRunner` (`today` pins the briefs clock), `RUNNERS`, `budgetedAi`/`createSpendMeter`, `prepareTestDb`; data/cassettes/baselines per suite (changes 172 cases, reviews 200, briefs, ask); root script `pnpm eval:replay` (ci.yml, after tests).
- **`@cs/ai`:** `createCassetteAi` (record/replay), `CassetteMissError`; task `eval_prelabel` in `ai.yaml`.
- **`@cs/db`:** exports `./test-global-setup`; `test/table-classes.ts` (`TABLE_CLASS`, 96 tables), `test/isolation-world.ts` (`seedIsolationWorld`), `rls-sweep.test.ts`.
- **`@cs/tools`:** `src/isolation/{fixtures,harness}.ts` (`ISOLATION_FIXTURES` for 223 tools, `VIEWER_WRITES`, 117 write fixtures, 462 tests ~68 s); `requireVisibleClient`, `requireOwnClient` (`settings.ts`).
- **`@cs/ask`:** prompt rules 1 and 13 reworded; `hasFigure` guard in `groundAnswer` (shared with the eval's B2).
- **`@cs/engine`:** `buildReviewState` extracted (used by the reviews builder). MCP: contract integration tests; `ai-connections.spec.ts` E2E extended (R1).
- **CI:** `.github/workflows/evals-live.yml` (PR when ai/engine-briefs/ask/evals paths change, nightly 07:00 UTC, dispatch; environment `evals`).
- **Merge-time (7b1/15c2b second merger):** new tools need `ISOLATION_FIXTURES`, new tables `TABLE_CLASS` + world rows. 15c2b declares `delete_ask_thread` (replaces `delete_my_ask_thread` in `VIEWER_WRITES`), `compare_captures`, `ask_thread.deleted_at`; re-record the `ask` cassette if `runTurn` changes.

## Isolation leaks fixed (tool, fix)
- Task 3: `list_alert_queue`, `list_trend_reports`, `list_recommendations`, `list_client_recipients`, `list_api_tokens`, `list_oauth_grants`, `get_spend_status` answered an empty/own list for a named out-of-scope client; now `not_found` via `requireVisibleClient`. **Visible change: agency alerts `?client=<foreign id>` now 404.**
- Task 4: `add_client_recipient` (adminB to A1; only the composite FK stopped it) and `update_client_delivery` (silent no-op success) now `not_found` via `requireOwnClient`.
- Nothing needed SQL, so no 7c2 hardening items. Production leak guard false positive (contactLeaks vs top-level id) was in the eval builder only (c3a863eb).

## Evals: counts and spend
Changes 172 cases (golden 52, synthetic 120, cs_dev 0, R15); reviews 200 (cs_dev 120, synthetic 80); 11 template/LLM pre-label disagreements (4 + 7). Cassettes recorded for all four suites; `eval:replay` green. Spend $5.51 of $30: briefs $0.55, ask $3.55 (incl. one re-record after R13), prelabel $1.17, changes $0.07, reviews $0.17. Findings to know: briefs verifier keep-rate 0.51 (44/90 drafted items dropped by τ 0.85, report-only; τ unchanged per decision); OpenRouter invalid JSON ~2 % of live Ask turns.

## Rulings (full text in the SDD ledger)
R1 extend `ai-connections.spec.ts`, no new OAuth spec. R2 `IsolationWorld.evidenceText` added. R3 order: owner labelling (T9 steps 4-5) and baseline refresh stay open. R4 `E2E_PORT` inline, not in `.env`. R5 world seeds/fingerprint include tenant-bearing `service_only` tables. R6 client roles' `forbidden()` excludes agency tenant A. R7 `add_business_area` by agency B on A's unreviewed type is by design (global catalogue). R8 MCP E2E asserts the 12-name workspace list. R9 OAuth cross-client case uses A1 owner's bound grant (admin client-bound grant rejected at connect). R10 B2 accepts round or trunc of an evidence percent. R11 `SuiteRunner.today` + `Competitor:` evidence line. R12 Ask B2 triggers on number/price/%/date only. R13 Ask uncited figures fixed in product (prompt + `hasFigure`), then re-recorded. R14 ask cassette not clock-pinned. R15 changes ship with 0 cs_dev cases.

## Decisions (owner-approved)
Spec decisions + plan "Decisions"; owner decisions 2026-10-22/23 in `git show phase-7-planning:docs/work/phase-7-planning.md` (folded at merge).

## New backlog (target → item)
- Evals → `record --case <id>` single-case merge; flush cassette on budget stop; omit `topic.*`/`sentiment.mae` when n=0; validate baseline JSON; cassette `version` guard.
- Evals → rebuild `changes` once real web changes exist (R15); re-baseline after the owner confirms labels.
- Evals → `evals-live` fails open if the `changes` job fails (skipped = success for a required check).
- Ask → citation-repair follow-up for the thinner answers (guard runs after `supportCheck`; misses spelled-out numbers/relative dates); eval B2 splitter vs guard `splitUnits` divergence; invalid-JSON ~2 %.
- Isolation suite → gaps: shared `global_public` rows and `auth` schema outside the write fingerprint; viewer "other user's row" cases; `reinsertAs` accepts "permission denied" without an INSERT-privilege check; dedupe `requireOwnClient`/`requireVisibleClient`.
- Briefs → bare-year and bare-number bait B2 edge cases; injection H1/H3 target-phrase canaries.
- Backlog at merge: close "MCP tests: cross-agency, P18 scoped member, review cross-client leak, page-level `/sign-in` OAuth, exact client-role `tools/list`".

## Owner verification steps
1. GitHub: create environment `evals` with secrets `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `POSTMARK_SERVER_TOKEN` (live server, not the test token), `EVALS_ALERT_TO`, `EVALS_ALERT_FROM` (verified sender). Add `evals-live` as a required status check on `main`. Trigger `workflow_dispatch` once and read the report artifact.
2. Labels (Task 9 steps 4-5): open `packages/evals/label-work/{changes,reviews}-labels.csv` in `tools/decision-labeler.html`, fix wrong rows (the "other" topic family agreed only 0.60 with the pre-label), save; then for each suite `pnpm --filter @cs/evals eval label --suite <s> --import label-work/<s>-labels.csv --by <name>` and `pnpm --filter @cs/evals eval run --suite <s> --mode replay --update-baseline`; commit data and baselines.
3. Ask behaviour change: answers now drop sentences with a figure/date and no citation (grounding removal 0.30 to 0.48, thinner answers). Spot-check a few real Ask answers.
4. Visible change: agency alerts `?client=<foreign id>` now 404.
5. Confirm R7 (agency B may add a business area to A's unreviewed type) is the intended design.
6. Note eval questions use the repo YAML seed topics, not production's discovered ones; briefs verifier keep-rate 0.51 is report-only.
