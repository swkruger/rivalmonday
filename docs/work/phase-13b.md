# phase-13b — Local rankings upgrade (weekly scans, map, Trend/Compare, Map climb, tier_change)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13b   **Base:** main @ (set at execution start)
**Plan/spec:** [spec](../superpowers/specs/2026-10-17-phase-13b-local-rankings-design.md) · [plan](../superpowers/plans/2026-10-17-phase-13b-local-rankings.md) · phase brief + 13a: [phase-13.md](phase-13.md)

## Status (overwrite)
2026-10-17: Task 0 pre-flight done on branch @ 98e4481 (= main; phase-11 unmerged). Migrations claimed 0067/0068 (renumber if phase-11 merges first). Test DB `cs_phase_13b_test` migrated. cs_dev: 1 done scan, 0 out-of-range radii. Conflict scan + rulings in the SDD ledger (`.superpowers/sdd/…`); executing Tasks 1–16.

## Next (overwrite)
Continue SDD from the first task without a `complete` line in the ledger. Owner: subscribe to Stadia Starter and add `STADIA_API_KEY` to `.env` (Task 7 probe needs it).

## Interfaces this branch adds or changes
See plan § File structure. Migrations: next free at execution time (main ends 0066; phase-11 holds 0067–0069 built, 11b/11c ≥ 0070). Env `STADIA_API_KEY` (owner adds; build against the fake until then).

## Assumes from other branches
- **phase-11 runs in parallel (owner 2026-10-17)** — whichever merges second rebases and renumbers migrations (`packages/db/CLAUDE.md`). Overlaps (all additive except one): `AGENCY_KINDS`, `NotifyInput.subjectType`, `QueueJob`, `tools/all.ts`/`schemas.ts`/access-marks/channels tests, worker `main.ts`/`deps.ts`, `turbo.json`, demo seed, `e2e-affected-rules.ts`, inbox labels. **Not additive:** `update_client_profile` body moved to `tools/src/setup/profile-change.ts` `applyClientProfileChange` (11a, built) — hook the `rank-map-refresh` enqueue where the service-area write lives at rebase time.

## Decisions (owner-approved)
1. Develop 13b in parallel with phase-11 in its own worktree (owner 2026-10-17); not on `main`.
2. Spec D1–D9 and plan P1–P15 as approved; proposed copy lines in the plan are approved with it.
3. **D7 amended (owner, Task 0):** map provider = **Stadia Maps cacheable static** (`alidade_smooth`, Starter $20/mo, ~$0.06/image), not MapTiler — MapTiler terms §7.2/§6.1 forbid server-side caching/proxy. Centre + integer zoom framing (`fitStaticMap`).

## New backlog (target → item)
None yet.

## Owner verification steps
TBD at wrap-up.
