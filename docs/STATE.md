# State of `main`

> **Overwritten, never appended. Hard cap 5 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-13

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2, demo data / dev panel / snapshots, Phase 5 polish and **Phase 6 (6a MCP server, 6b Ask "Friday", 6c knowledge base; merged 2026-10-13)** are on `main` and pushed.
- `cs_dev` is at migration **`0046`** (next free `0047`); platform help articles seeded from `docs/help` (`pnpm kb:seed`). `cs_demo` is seeded by `pnpm demo:reset`.
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite (~16 min, 2,477 passed 2026-10-13) and full E2E at `/rm-merge` and in CI.
- New switches: `KB_IMPORT_ENABLED` (knowledge-base URL import/sync; unset = off), `ASK_FAKE_AI` (E2E only).
- **Planned, approved, not built (docs only on `main`):** Phase 8a/8b and 9a/9b specs + lean plans (roadmap rows 8–9); work files `docs/work/phase-8.md`, `phase-8b.md`, `phase-9.md`. Phase 7 deferred until after 8–11.
- What each phase built and where: [ARCHITECTURE.md](ARCHITECTURE.md). Live-data runbook: [OPS.md](OPS.md).

## Next up
1. **Owner checks (Phase 6):** (a) MCP: token at `/agency/ai` → `claude mcp add --transport http rival-monday http://localhost:3000/mcp --header "Authorization: Bearer rm_pat_..."` → ask about a competitor (evidence ids) and "How do I connect an AI app?" (agency product name) → revoke, next call fails; (b) Ask on a client: cited answer + evidence chip, save as recommendation, confirm a proposed write, client user at quota sees "You have reached this month's quota.", `/platform/ask`; (c) `/platform/knowledge`: agency playbook with "Visible to client users" off + a client fact → agency user sees both cited, client user only the fact, `kb` chip opens the sheet; (d) optional `KB_IMPORT_ENABLED=true`: import a public Q&A page, publish, enable auto-sync; (e) review `docs/help/*.md` copy and decide the MCP revoke copy (BACKLOG § Owner).
2. **Then, each in a fresh session + new worktree** (`/rm-kickoff <branch>` reuses the existing work file; start with the plan's Task 0 pre-flight — next free migration is `0047`): **8a** `phase-8` (was blocked on Phase 6, now unblocked) → **8b** `phase-8b` (owner: don't start until told) → **9a** `phase-9` (owner: Stripe test account + `STRIPE_*` keys first) → **9b** after pilot-agency feedback.
3. **Still to plan:** Phase 10 (agency onboarding wizard) and Phase 11 (client onboarding wizard).
4. **Owner checks (phase5-polish):** `/agency` at phone width — two KPI tiles per row; an old brief's "Download PDF" shows "Preparing your PDF…" once, then the re-rendered PDF.
5. **Waiting on real data:** the weekly pull from **2026-10-13** should produce the first real alerts → finish the waived checks. See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff <phase>` → brainstorm → spec (new decisions only) → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` each session → `/rm-merge` with the owner's go-ahead. Details in the root `CLAUDE.md`.
