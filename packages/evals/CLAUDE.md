# @cs/evals — working notes
Record/replay eval harness (phase 7c1): labelled case sets in `data/<suite>.jsonl`, recorded model replies in `cassettes/<suite>.json`, accuracy baselines in `baselines/<suite>.json`. CI runs `pnpm eval:replay` (offline); `eval record` and `evals-live` spend real money under a cap.

(Task 14 fills in the gotchas.)
