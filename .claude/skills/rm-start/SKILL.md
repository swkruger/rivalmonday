---
name: rm-start
description: Use at the start of every Rival Monday session (or when asked "where are we?") — builds a short briefing from docs/STATE.md, this worktree's work file and the other in-flight branches, without reading the big docs.
---

# rm-start — session briefing

Goal: get oriented in **≤ ~6k tokens**. Do NOT read the spec, roadmap, plans, ARCHITECTURE.md, BACKLOG.md or `docs/archive/` here — later steps pull only what they need.

## Steps

1. Run in one shell call (Git Bash):
   ```bash
   git rev-parse --abbrev-ref HEAD; git status --short | head -20
   git log --oneline -5; git log --oneline -1 main
   git worktree list
   git branch --no-merged main --format='%(refname:short)'
   ```
2. Read `docs/STATE.md` (state of `main`).
3. Current branch ≠ `main` → read `docs/work/<branch>.md` in full (`/` in branch name → `-`). If it doesn't exist, say so and offer to create it from `docs/work/README.md`'s template.
4. For every **other** unmerged branch, read only its Status, Next and Interfaces sections:
   `git show <b>:docs/work/<b-with-dashes>.md 2>/dev/null | sed -n '1,40p'` (no file → list the branch as "no work file").
5. Uncommitted changes that don't belong to this branch's purpose, or this checkout being shared with another session's branch → warn loudly (two sessions must never share a working tree; suggest `/rm-kickoff` to create a worktree).

## Output (≤ 15 lines)

```
📍 <worktree path> on <branch> (<clean|N changed>) — main @ <sha>
Main: <1–2 lines from STATE>
This branch: <Status + Next from its work file, or "on main">
Other workstreams: <branch — one-line status — interfaces that may affect us>
Suggested next step: <one line>
```
Then ask what to do. Nothing else.
