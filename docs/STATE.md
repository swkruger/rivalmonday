# State of `main`

> **Overwritten, never appended. Hard cap 5 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-12

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2 the demo data / dev panel / snapshots tool and the Phase 5 polish batch (`65e0683`) are merged and pushed. **Phase 5 is complete and owner-verified (2026-10-11).**
- `cs_dev` is at migration **`0037`** (latest). `cs_demo` is seeded by `pnpm demo:reset`.
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite (~12 min, 1,866 passed 2026-10-11) and full E2E at `/rm-merge` and in CI.
- **Planned, approved, not built (docs only on `main`):** Phase 8a/8b and 9a/9b specs + lean plans (roadmap rows 8–9). Their work files stay in `docs/work/phase-8.md`, `phase-8b.md`, `phase-9.md` (brief + decisions + Task 0 notes); reuse them when execution starts. Phase 7 deferred until after 8–11.
- What each phase built and where: [ARCHITECTURE.md](ARCHITECTURE.md). Live-data runbook: [OPS.md](OPS.md).

## Next up
1. **Phase 6 — MCP server & Ask** (branch `phase-6`, worktree `../CompetitorSpy-wt/phase-6`): 6a built; plan + build 6b (Ask / Friday), then one `/rm-merge phase-6`.
2. **Then, each in a fresh session + new worktree** (`/rm-kickoff <branch>` reuses the existing work file; start with the plan's Task 0 pre-flight): **8a** `phase-8` → **8b** `phase-8b` (owner: don't start until told) → **9a** `phase-9` (owner: Stripe test account + `STRIPE_*` keys first) → **9b** only after pilot-agency feedback (Connect enabled, `STRIPE_CONNECT_WEBHOOK_SECRET`). Order matters: 8a before 8b/9a.
3. **Still to plan:** Phase 10 (agency onboarding wizard; redeems 9a invite links, calls `startAgencyTrial`) and Phase 11 (client onboarding wizard).
4. **Owner checks (phase5-polish):** `/agency` at phone width — two KPI tiles per row, each client a block in the white Clients card; an old brief's "Download PDF" opens in a new tab and shows "Preparing your PDF…" once, then the re-rendered PDF.
5. **Waiting on real data:** the weekly pull from **2026-10-13** should produce the first real alerts → finish the waived checks. See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff <phase>` → brainstorm → spec (new decisions only) → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` each session → `/rm-merge` with the owner's go-ahead. Details in the root `CLAUDE.md`.
