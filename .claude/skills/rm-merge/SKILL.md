---
name: rm-merge
description: Use when a Rival Monday branch is finished and the owner has given the go-ahead to merge (e.g. "/rm-merge phase-6a", "merge it") — verifies, folds the branch's work file into STATE/BACKLOG/ARCHITECTURE, merges into main, pushes, and removes the worktree.
argument-hint: <branch>
---

# rm-merge — finish a workstream

**Gate:** merge only with the owner's explicit go-ahead in this conversation. Push only after the merge succeeds and tests are green.

## 1. Verify on the branch (in its worktree)
1. `git status` clean (commit or ask about leftovers). `git fetch -q origin; git rebase main` (or merge `main` in if the branch was shared/pushed — ask).
2. Run `pnpm typecheck` and the full suite in the background: `npx turbo run test --concurrency=1 --continue` (~20–50 min); E2E (`pnpm --filter @cs/web e2e`) if `apps/web` changed. Report real numbers; failures stop the merge (use superpowers:systematic-debugging).
3. If the branch added a screen: `pnpm --filter @cs/demo test` (demo coverage list).

## 2. Fold the work file into the shared docs (on the branch, one docs commit)
From `docs/work/<branch>.md`:
- **New backlog** → `docs/BACKLOG.md` under each target heading; also delete BACKLOG items this branch closed.
- **Interfaces / what was built** → 2–4 lines in `docs/ARCHITECTURE.md` (package map + the phase's capability entry).
- **Decisions** → binding product/stack/process decisions into root `CLAUDE.md` § Decisions (one line each); phase-local ones stay in the plan/spec.
- **Owner verification steps** → `docs/STATE.md` "Next up" (or BACKLOG § Waiting if they need real data).
- `docs/STATE.md` → rewrite: where `main` is (incl. migration level), next up. ≤ 5 KB.
- Roadmap row → mark the phase/sub-phase ✅ with date and plan link (one line).
- `git rm docs/work/<branch>.md`. Commit: `docs(<branch>): fold work file into shared docs`.

## 3. Merge
From the main checkout (`git worktree list` first line), which must be on `main` and clean — if it isn't, stop and ask:
```bash
git -C "$MAIN_WT" merge --ff-only <branch> || git -C "$MAIN_WT" merge --no-ff <branch> -m "Merge branch '<branch>': <summary>"
```
Conflicts in `docs/STATE.md` / `BACKLOG.md` / `ARCHITECTURE.md`: keep both sides' content, then re-apply the caps. Then `pnpm db:migrate` on `cs_dev` **only if the owner agrees** and the branch added migrations.

## 4. Publish and clean up
1. `git push origin main` (after confirming with the owner if not already said).
2. `git worktree remove ../CompetitorSpy-wt/<branch>` (ask first if it has untracked files besides `.env`/`node_modules`), `git branch -d <branch>`.
3. **Impact on other workstreams:** for each remaining unmerged branch, read its work file's "Assumes from other branches"; list any assumption this merge broke or changed, and tell the user which session must re-check (they rebase in their own worktree — don't touch it from here).
4. Summarise in ≤ 6 lines: merged sha, test numbers, migrations, owner steps, affected workstreams.
