# Task 3 report: healthFlag
Built packages/tools/src/platform/health.ts (healthFlag, AgencyHealth, HealthInput) + health.test.ts (14 tests).
RED: `pnpm --filter @cs/tools exec vitest run health` -> 1 file failed, no tests (module missing).
GREEN: same command -> 14 passed.
Rules: at_risk/growing only when age >= 28d (and 28d-ago not null for comparisons); idle needs age >= 14d, >=1 active client, no brief in >= 14d (null counts); sign-in quiet = null or >= 14d.
Concerns: (1) brief says "null sign-in on agency >= 14d -> at_risk" but also "< 28d skips the sign-in rule"; I followed the skip (at_risk only from 28d). (2) "14 days" boundary treated inclusive (exactly 14d = flagged). Not run: tsc/lint.
