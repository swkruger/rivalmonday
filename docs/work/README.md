# Work files — one per in-flight branch

Each active branch owns exactly one file here: `docs/work/<branch>.md` (slashes in the branch name become `-`).
**Only that branch edits its file**, so parallel workstreams never conflict on shared docs.
Other sessions read it without switching branches: `git show <branch>:docs/work/<branch>.md`.

`/rm-kickoff` creates it, `/rm-wrap-up` updates it, `/rm-merge` folds it into `STATE.md` / `BACKLOG.md` / `ARCHITECTURE.md` and deletes it.

Cap: **10 KB**. Overwrite the Status/Next sections; don't keep a diary.

## Template

```markdown
# <branch> — <one-line purpose>

**Kind:** planning | implementation | polish | fix   **Worktree:** ../CompetitorSpy-wt/<branch>   **Base:** main @ <sha>
**Plan/spec:** <links once they exist>

## Status (overwrite)
<2–5 lines: where it is right now — e.g. "plan approved; tasks 1–7 of 18 done; task 8 in review">

## Next (overwrite)
<the single next step, and who acts (owner/agent)>

## Interfaces this branch adds or changes
<what OTHER workstreams must know: new tables/migrations (number!), tool names, exported functions, routes, env vars, renamed files>

## Assumes from other branches
<for planning ahead: "assumes phase5-polish adds X in Y" — re-checked by /rm-merge and before execution>

## Decisions (owner-approved)
<numbered; binding ones get promoted to CLAUDE.md / the spec at merge>

## New backlog (target → item)
- Phase 7 → …
- Polish → …

## Owner verification steps
<steps the owner runs after merge, if any>
```
