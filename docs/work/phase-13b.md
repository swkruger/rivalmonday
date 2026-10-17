# phase-13b — Local rankings upgrade (weekly scans, map, Trend/Compare, Map climb, tier_change)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13b   **Base:** main @ (set at execution start)
**Plan/spec:** [spec](../superpowers/specs/2026-10-17-phase-13b-local-rankings-design.md) · [plan](../superpowers/plans/2026-10-17-phase-13b-local-rankings.md) · phase brief + 13a: [phase-13.md](phase-13.md)

## Status (overwrite)
2026-10-17: spec + plan owner-approved (spec D1–D9, plan P1–P15, proposed copy approved with the plan). Not started.

## Next (overwrite)
Fresh session in the worktree: `/rm-start` → `/rm-kickoff phase-13b` (work file exists → start execution) → plan Task 0 pre-flight → `superpowers:subagent-driven-development`.

## Interfaces this branch adds or changes
See plan § File structure. Migrations: next free at execution time (main ends 0066; phase-11 holds 0067–0069 built, 11b/11c ≥ 0070). Env `MAPTILER_API_KEY` (owner adds; build against the fake until then).

## Assumes from other branches
- **phase-11 runs in parallel (owner 2026-10-17)** — whichever merges second rebases and renumbers migrations (`packages/db/CLAUDE.md`). Overlaps (all additive except one): `AGENCY_KINDS`, `NotifyInput.subjectType`, `QueueJob`, `tools/all.ts`/`schemas.ts`/access-marks/channels tests, worker `main.ts`/`deps.ts`, `turbo.json`, demo seed, `e2e-affected-rules.ts`, inbox labels. **Not additive:** `update_client_profile` body moved to `tools/src/setup/profile-change.ts` `applyClientProfileChange` (11a, built) — hook the `rank-map-refresh` enqueue where the service-area write lives at rebase time.

## Decisions (owner-approved)
1. Develop 13b in parallel with phase-11 in its own worktree (owner 2026-10-17); not on `main`.
2. Spec D1–D9 and plan P1–P15 as approved; proposed copy lines in the plan are approved with it.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD at wrap-up.
