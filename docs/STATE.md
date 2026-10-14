# State of `main`

> **Overwritten, never appended. Hard cap 5 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-14

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (6a MCP, 6b Ask "Friday", 6c knowledge base) and **Phase 8 (8a platform console, 8b read-only support sessions, 8c platform costs; merged 2026-10-14, owner checks pending)** are on `main`.
- Migrations run through **`0051`** (next free `0052`). `cs_dev` was at `0046` before this merge: `pnpm db:migrate` then `pnpm kb:seed` when the owner agrees. `cs_demo` is seeded by `pnpm demo:reset`.
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite (~16 min) and full E2E at `/rm-merge` and in CI.
- Switches: `KB_IMPORT_ENABLED` (unset = off), `ASK_FAKE_AI` (E2E only). New worker env `NEON_API_KEY`, `NEON_ORG_ID` (not set yet).
- **Planned, not built:** Phase 9a/9b (billing; specs + lean plans, `docs/work/phase-9.md`), Phase 7 deferred (spec/plan parked on `phase-7-planning`) until after 8–11.
- What each phase built: [ARCHITECTURE.md](ARCHITECTURE.md). Live-data runbook: [OPS.md](OPS.md).

## Next up
**Owner housekeeping (Phase 8c):** remove `ANTHROPIC_ADMIN_KEY` from the main `.env` (individual account, no Admin API; Anthropic is a manual monthly cost); on `/platform/costs` set the Neon $/CU-hour rate; set `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy.

**Owner verification** (after `pnpm demo:reset`, as the demo operator):
- **8a console:** (1) `/platform`: tiles, three 90-day charts, activity feed, `12w/12m` toggle. (2) `/platform/agencies`: sort, health pill contrast, agency detail shows "Agency management is coming soon.". (3) Plain agency admin: `/platform*` 404, no Platform nav. (4) `pnpm --filter @cs/worker platform-admin add <email> --role staff` shows the console; `revoke` → 404. (5) Optional on `cs_dev`: worker run backfills `agency_daily_stat`, re-run no duplicates.
- **8b support sessions:** (1) Agency detail → "View as agency" → reason → banner on `/agency` and `/c/<id>`; no write buttons; team emails masked (`j•••@…`). (2) Exit → console with "Support session ended.". (3) As the demo agency admin: `/agency/settings/platform-access` lists sessions; toggle email opt-in, start a session, email arrives (Postmark test). (4) Viewer-role platform admin sees no "View as agency".
- **8c costs:** (1) `/platform/costs`: summary cards, 6 services (DataForSEO Low at $8.20), 3 manual costs, 6-month chart; Low strip on every `/platform` page. (2) Add a monthly cost, then archive it. (3) Edit a service, "Refresh now" + worker run updates status. (4) Staff operator: `/platform/costs` 404, no Costs nav/strip. (5) With worker + keys: a newly Low service emails each owner once.

**Then:**
1. **9a** `phase-9` in a fresh session + worktree (`/rm-kickoff phase-9`; Task 0 pre-flight; owner supplies Stripe test account + `STRIPE_*` keys first; 9a plan paths must use `app/(platform)/platform/**`) → **9b** after pilot-agency feedback.
2. **Still to plan:** Phase 10 (agency onboarding wizard), Phase 11 (client onboarding wizard).
3. **Waiting on real data:** the weekly pull from 2026-10-13 should produce the first real alerts. See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff <phase>` → brainstorm → spec (new decisions only) → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` each session → `/rm-merge` with the owner's go-ahead. Details in the root `CLAUDE.md`.
