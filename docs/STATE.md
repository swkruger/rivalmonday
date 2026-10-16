# State of `main`

> **Overwritten, never appended. Hard cap 5 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-16

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (6a MCP, 6b Ask "Friday", 6c knowledge base) **Phase 8** (console, support sessions, costs; merged 2026-10-14, owner-verified 2026-10-15) and **Phase 12 (12a competitor discovery & rating, 12b starting-point brief; merged 2026-10-15, owner checks pending)** are on `main`, plus post-12 polish (2026-10-15/16): the client overview shows the most recently generated brief in full (starting point or weekly); calmer competitor chips + flat tracked list by tier; one manual "Find competitors" per client per client-local week + a monthly scheduled refresh (first Monday 10:00 UTC, per-client jobs 45 min apart).
- Migrations run through **`0056`** (next free `0057`; in-flight phase-9 uses 0052–0059 and must renumber from 0057). `cs_dev` is migrated to 0056 (snapshot `backups/20261016-014229-cs_dev`). `cs_demo` is seeded by `pnpm demo:reset`.
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite (~16 min) and full E2E at `/rm-merge` and in CI.
- Switches: `KB_IMPORT_ENABLED` (unset = off), `ASK_FAKE_AI` (E2E only). Worker env `NEON_API_KEY`, `NEON_ORG_ID` not set yet.
- **Planned, not built:** Phase 9a/9b (billing; `docs/work/phase-9.md`), Phase 10 (`docs/work/phase-10.md`), Phase 7 deferred (spec/plan parked on `phase-7-planning`) until after 8–11.
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbook: [OPS.md](OPS.md).

## Next up
**Owner housekeeping (Phase 8c):** on `/platform/costs` set the Neon $/CU-hour rate; set `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy. (`ANTHROPIC_ADMIN_KEY` removed 2026-10-15.)

**Owner verification, Phase 12** (`cs_dev`, worker running; both starting points exist, status ready, 2 findings each — regenerate with `--force` once self ads + rank captures land): **12a:** (1) "Find competitors" for both clients: no wrong-category or self suggestions. (2) Granbury Dental Center and Archstone rate Top rival or Worth watching. (3) Run cost <= $3 on `/platform/costs`. (4) Accept one suggestion: Meta/Google ad-account chips appear on its profile. (5) Next Monday `signals-weekly` fills tracked tiers. **12b:** (1) Each client needs a self Google ads check and a rank scan; else regenerate with `pnpm --filter @cs/worker brief-once --client <id> --starting-point --force` (the hourly schedule waits for >= 1 tracked rival). (2) `/agency/approvals`: each starting point is "Needs review" (3-5 findings, scorecard on top); approve one, it sends at once (Postmark test). (3) Email and client view show tiles, scorecard (client first, rivals with tier chip, "—" if unmeasured), finding cards, no upsell tag. (4) After the next quiet Monday: "Where you stand" and "First moves still open". (5) Overview shows the full latest brief; a second "Find competitors" in the same week shows "Next search available …". Copy list: BACKLOG § Owner.

**Then:**
1. Remaining order **9 → 10 → 11**. **9a** `phase-9` (worktree exists, executing) in its own session: rebase on main, renumber migrations from 0057; apply `agencyServiceable` to the Phase 12 jobs, BACKLOG § Phase 9; owner supplies Stripe test account + `STRIPE_*` keys first; 9a plan paths must use `app/(platform)/platform/**`) → **9b** after pilot-agency feedback.
2. **Phase 10** (agency self-serve sign-up + onboarding; planned, `docs/work/phase-10.md`) runs after 9a merges and edits `create_client`. **Still to plan:** Phase 11 (client onboarding wizard; reuses `startCompetitorSearch` and starting-point readiness).
3. **Waiting on real data:** the 2026-10-14 re-pull gave 0 alerts; first real alerts expected from the 2026-10-20 weekly pull. See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff` → brainstorm → spec → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` → `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
