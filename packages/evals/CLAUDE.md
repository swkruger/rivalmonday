# @cs/evals — working notes
Record/replay eval harness (phase 7c1): labelled case sets in `data/<suite>.jsonl` (changes, reviews, briefs, ask), recorded model replies in `cassettes/<suite>.json`, accuracy baselines in `baselines/<suite>.json`. CI runs `pnpm eval:replay` (offline, $0); `eval record` and the `evals-live` workflow spend real money under a cap. Commands, labelling and spend: `docs/OPS.md` § Evals.

## Gotchas
- **The cassette signature includes the task config:** any `ai.yaml` change for a task, or a prompt change, misses on replay. Re-record that suite in the same PR (a miss exits 1 and names the suite).
- **Ask cassette is not clock-pinned (R14):** the world is seeded from the wall clock and the cassette normalises dates relative to now; a day-boundary miss is fixed by re-record. Briefs are pinned via `SuiteRunner.today` (fixed-date cases replay on any day).
- **Ids are builder-generated:** `contactLeaks` exempts a case's own top-level `id`; the build refuses to write a file where contact details survive `redactForModel`.
- **Foreign-id cross-tenant Ask path is covered only by the scripted unit test:** ids written into questions are redacted as phone-like, so a live case cannot carry one.
- **`src/cli/load-env.ts` must stay the CLI's first import** (it loads the root `.env` before any module reads env).
- **The Ask suite truncates the test DB:** never run it alongside another test run on the same DB (`prepareTestDb` refuses any non-`_test` URL).
- **Budget stop in record mode loses the recording:** the cassette flushes only when the suite completes. Raise `--max-usd` and re-run.
- **Single-case re-record is ad hoc today** (no `record --case`); re-record the whole suite.
- **Pre-labels are LLM/template guesses:** headline decision metrics count only owner-confirmed labels; unconfirmed ones report as `prelabel_agreement.*`. Changes/reviews cases are report-only (`blocking: false`); B1-B3 (briefs, ask) block.
- **Eval topics are the repo YAML seed topics**, not production's AM-approved discovered ones.
