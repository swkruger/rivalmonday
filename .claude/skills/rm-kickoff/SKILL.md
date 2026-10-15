---
name: rm-kickoff
description: Use when starting a new Rival Monday phase, sub-phase or workstream (e.g. "/rm-kickoff phase-6", "plan the next phase", "start the polish batch") — creates an isolated worktree + branch + work file and a distilled phase brief, then hands over to brainstorming. Safe to run while another phase is still being coded.
argument-hint: <phase-or-topic> [branch-name]
---

# rm-kickoff — new workstream + phase brief

## 1. Worktree (never share a working tree with another session)

Branch name: second argument, else `<topic>` (e.g. `phase-6-planning`, `phase5-polish`). Then:

```bash
MAIN_WT=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
WT="$MAIN_WT/../CompetitorSpy-wt/<branch>"
git -C "$MAIN_WT" fetch -q origin 2>/dev/null; git -C "$MAIN_WT" worktree add -b <branch> "$WT" main
cp "$MAIN_WT/.env" "$WT/.env"            # gitignored; never print or commit it
cp "$MAIN_WT/.claude/settings.json" "$MAIN_WT/.claude/settings.local.json" "$WT/.claude/" 2>/dev/null  # gitignored: plugins + MCP servers
```
- Planning-only branch: skip `pnpm install`. Implementation branch: run `pnpm install` in `$WT` (background), and give it **its own test database** on the local test cluster so parallel worktrees never collide on `cs_test`:
  ```bash
  bash "$MAIN_WT/scripts/local-test-db.sh" status || bash "$MAIN_WT/scripts/local-test-db.sh" start
  DB="cs_$(echo <branch> | tr -c 'a-z0-9
' '_' | cut -c1-40)_test"
  PGPASSWORD=postgres /d/rm-pg/pg18/bin/psql.exe -h 127.0.0.1 -p 5444 -U postgres -qc "CREATE DATABASE $DB"
  # replace the three TEST_* URLs (main's may point at Neon) with the local cluster's, renamed to $DB
  sed -i '/^TEST_[A-Z_]*DATABASE_URL=/d' "$WT/.env"
  echo >> "$WT/.env"   # main .env has no trailing newline — without this the first var glues onto the last line
  bash "$MAIN_WT/scripts/local-test-db.sh" env | sed "s#/cs_test\$#/$DB#" >> "$WT/.env"
  ```
  (The roles are cluster-wide; the first test run migrates the new database. After `pnpm install` finishes, run `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once in `$WT` to create the `pgboss` schema — E2E fails without it. E2E still uses port 3100 — don't run two E2E suites at once.)
- Tell the user: **open a new Claude Code session in `$WT`** for this workstream (or continue here if this session has no other branch work). All file edits for this workstream happen under `$WT`.

## 2. Phase brief (delegate — keep the main context lean)

**Already planned? Skip the brief.** If `docs/work/<branch>.md` already exists on `main` (phases planned ahead and merged as docs, e.g. `phase-8`, `phase-8b`, `phase-9`), do **not** dispatch a brief subagent or brainstorm again — its spec + plan are owner-approved. Instead: read only its Status / Next / Decisions / Assumes sections, update **Base** to the current `main` sha and Status to "execution started <date>", commit `docs(<branch>): start execution`, then go straight to the plan's **Task 0 (pre-flight)** and `superpowers:subagent-driven-development` — only if the work file doesn't say the owner put dev on hold (ask first if it does). Steps 2–3 below apply only when there is no work file yet.

Dispatch ONE `general-purpose` subagent (it reads the big docs; you only get the brief). Prompt it with the topic, `$WT`, and:

> Write `docs/work/<branch>.md` in `$WT` using the template in `docs/work/README.md`, plus a **Brief** section (≤ 8 KB total) containing:
> 1. **Scope** — the roadmap row for this phase (`docs/superpowers/plans/2026-09-29-roadmap.md`) and the spec sections it cites (`docs/superpowers/specs/2026-09-29-core-platform-design.md`) — summarised to what must be built, with § references, not copied.
> 2. **Already built — reuse, don't rebuild** — from `docs/ARCHITECTURE.md` and a quick Grep/Glob of the code: modules, tools, tables, components this phase will build on, with paths.
> 3. **Binding decisions** — from root `CLAUDE.md` § Decisions and earlier specs/plans that constrain this phase. Never re-open them.
> 4. **Backlog to fold in** — every item under this phase's heading in `docs/BACKLOG.md` (copy the items verbatim with their source tag).
> 5. **In-flight workstreams** — for each branch from `git branch --no-merged main` (except this one): read `git show <b>:docs/work/<b>.md` and `git diff main...<b> --stat`; list what they change that overlaps this phase (files, tables, migrations numbers, tools, routes). Put concrete overlaps in **Assumes from other branches**. Note the next free migration number given in-flight branches.
> 6. **Open questions for the owner** — numbered, each with 2–3 options and a recommendation, ordered by how much they change the design (first: should this phase be split into sub-phases?).
> Don't write code. Report back only: file path, size, and the open-questions list.

## 3. Hand over

1. Read the brief (only the brief).
2. Commit it on `<branch>`: `docs(<branch>): kickoff brief`.
3. Invoke `superpowers:brainstorming`, starting from the brief's open questions (one at a time). The brief replaces the old "read handover + roadmap + spec" step and the separate "Plan" step.
4. Then follow root `CLAUDE.md` § Process: spec with **new decisions and interfaces only** → `superpowers:writing-plans` in the **lean plan format** → owner approval → execution.

## Planning ahead while another phase is still coding

Allowed and expected. Rules:
- Plan against `main` + the in-flight branches' **declared interfaces** (their work files). Don't read their uncommitted code; don't edit their files.
- Everything you depend on from an unmerged branch goes in **Assumes from other branches** and in the plan's "Dependencies on in-flight work" section.
- Don't claim a migration number another branch may take — write the plan's migrations as "next free number at execution time".
- Execution starts only after those branches are merged (or the owner accepts stacking), with a **pre-flight step**: `git rebase main`, re-check every assumption against the real code, fix the plan, then dispatch implementers.
