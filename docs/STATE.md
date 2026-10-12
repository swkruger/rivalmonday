# State of `main`

> **Overwritten, never appended. Hard cap 5 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-11

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2 the demo data / dev panel / snapshots tool and the Phase 5 polish batch (`65e0683`) are merged and pushed. **Phase 5 is complete and owner-verified (2026-10-11).**
- `cs_dev` is at migration **`0037`** (latest). `cs_demo` is seeded by `pnpm demo:reset`.
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite (~12 min, 1,866 passed 2026-10-11) and full E2E at `/rm-merge` and in CI.
- What each phase built and where: [ARCHITECTURE.md](ARCHITECTURE.md). Live-data runbook: [OPS.md](OPS.md).

## Next up
1. **Phase 6 — MCP server & Ask**: plan it with `/rm-kickoff phase-6` (its own worktree + branch). First brainstorm question: split it like Phase 5 (e.g. 6a tool catalogue + MCP, 6b Ask + UI)? Inputs: roadmap row 6, spec §8.2–8.4, [BACKLOG § Phase 6](BACKLOG.md).
2. **Owner checks (phase5-polish):** `/agency` at phone width — two KPI tiles per row, each client a block in the white Clients card; an old brief's "Download PDF" opens in a new tab and shows "Preparing your PDF…" once, then the re-rendered PDF.
3. **Waiting on real data:** the weekly pull from **2026-10-13** should produce the first real alerts → finish the waived checks (approve one alert per outcome; rate items on the Recommendations board). See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff <phase>` → brainstorm → spec (new decisions only) → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` each session → `/rm-merge` with the owner's go-ahead. Details in the root `CLAUDE.md`.
