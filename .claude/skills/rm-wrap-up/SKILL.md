---
name: rm-wrap-up
description: Use at the end of a Rival Monday session, before a context reset, or when the user says "wrap up", "update the handover" or "save state" — updates this branch's work file (or STATE.md on main), files backlog items and gotchas in the right place, enforces size caps, and commits the docs.
---

# rm-wrap-up — save state for the next session

Principle: **overwrite current-state sections; never append a diary.** Git keeps history.

## Steps

1. `git rev-parse --abbrev-ref HEAD; git status --short; git log --oneline main..HEAD | head -20`
2. **On a feature branch** → edit only `docs/work/<branch>.md` (create from `docs/work/README.md` template if missing):
   - **Status** and **Next**: rewrite (2–5 lines each). Include task progress (e.g. "tasks 1–9/18 done, task 10 review fix pending"), any running background job, and anything uncommitted.
   - **Interfaces**: add any new table / migration number / tool / exported function / route / env var other workstreams must know about.
   - **Decisions**: add owner decisions made this session (numbered, one line each + why if non-obvious).
   - **New backlog**: add `target → item` lines (targets: Phase 6, Phase 7, Polish, Waiting, Owner, Unscheduled). Don't edit `docs/BACKLOG.md` on a branch — `/rm-merge` folds these in.
   - **Owner verification steps** if the branch needs the owner to check something after merge.
   **On `main`** (coordination checkout, docs-only session) → update `docs/STATE.md` / `docs/BACKLOG.md` directly instead.
3. **Gotchas learned this session** → add them, one bullet each, to the nearest package `CLAUDE.md` (`packages/<x>/CLAUDE.md`, `apps/<x>/CLAUDE.md`) on this branch — they merge with the code. Cross-cutting ones → `docs/gotchas-cross-cutting.md`; only a rule every session must know goes in root `CLAUDE.md` § Essentials.
4. **Memory**: only for durable user preferences/feedback (how the owner wants to work). Never project state — that's what the docs are for.
5. **Size caps** (check with `wc -c`): `STATE.md` ≤ 5 KB, work file ≤ 10 KB, root `CLAUDE.md` ≤ 10 KB, each package `CLAUDE.md` ≤ 10 KB, `gotchas-cross-cutting.md` ≤ 10 KB. Over the cap → condense (merge duplicates, drop superseded/obvious-from-code items) before committing.
6. Commit the docs only: `git add docs <changed CLAUDE.md files> && git commit -m "docs(<branch>): wrap-up — <one line>"` (commit trailer per root CLAUDE.md). Never stage `.env`.
7. Tell the user in ≤ 5 lines: what was saved, and the exact first step for the next session (`/rm-start` in `<worktree path>`).
