@AGENTS.md

# Rival Monday (repo codename CompetitorSpy)

Agency-owned, white-labelable SaaS that monitors the competitors of **local-service small businesses** (pilot verticals HVAC/plumbing and dental, US-first) from **public information only**. It delivers a dashboard (agency + client), a remote **MCP server**, an in-app **Ask assistant "Friday"**, weekly **evidence-backed briefs** (*no evidence, no claim*) and alerts. Sold to the owning agency's clients first, then wholesale white-label to other agencies.

**Start every session with `/rm-start`.** Keep the big docs out of context unless a step needs them.

## Where things are
| Need | Read |
|---|---|
| State of `main`, next up | `docs/STATE.md` (≤ 5 KB) |
| This branch's state | `docs/work/<branch>.md` (other branches: `git show <b>:docs/work/<b>.md`) |
| What's built, where | `docs/ARCHITECTURE.md` |
| Open work by target phase | `docs/BACKLOG.md` |
| Binding design spec | `docs/superpowers/specs/2026-09-29-core-platform-design.md` (read only the cited §) |
| Phase table | `docs/superpowers/plans/2026-09-29-roadmap.md` |
| Live-data runbook (`cs_dev`, re-pulls, labelling) | `docs/OPS.md` |
| Package-specific gotchas | `<package>/CLAUDE.md` (loaded automatically when you work there) |
| Cross-cutting gotchas, env & setup | `docs/gotchas-cross-cutting.md` |
| Vendor API contracts (live-verified) | `docs/research/2026-09-30-phase-2-vendor-apis.md` |
| Brand tokens, mockups | `docs/brand/` |
| Old handover / full roadmap (history only) | `docs/archive/` — don't read routinely |

## Decisions (do not re-litigate)
- **Product:** full-stack MVP (dashboard + MCP + Ask + briefs), not email-only. Own clients first, then white-label.
- **Brand:** Rival Monday, wordmark `rivalmonday` (`rival` #2A6BAC, `monday` #F5A524). Assistant **Friday** (renamable), orange pill (#F5A524 bg, #3B2300 text). Primary #47A8E7 (white text on it accepted despite 2.6:1), secondary #2A6BAC, accent #F5A524, ink #0B2540, canvas #F6F9FC, dark text on grey panels (#EEF2F6). Inter. Content max-width 1560px.
- **Stack:** TypeScript monorepo, pnpm 10 + Turborepo, Node 24. Next.js App Router + Tailwind + shadcn/ui; brand tokens as CSS variables per agency. Vercel (web/API/MCP/cron) + one always-on worker container (pg-boss + Playwright). Neon Postgres with RLS tenancy. Evidence in R2 (filesystem locally). OpenRouter for generation (`packages/ai/config/ai.yaml`); Jev (TypeSafe System One) for typed decisions with cascade Jev → LLM → human review.
- **Auth:** **self-hosted Better Auth** inside `apps/web` (schema `auth`), not Neon Auth — needed for invitation-only hooks and the OAuth 2.1 provider for MCP (Phase 6). Access lives in our own `membership` table, not Better Auth's `organization` plugin.
- **Charts:** hand-written inline SVG (no chart library); validate colour scales with the dataviz skill.
- **Review decisions stay on Jev** until pilot agencies supply gold labels at volume. Don't change verifier τ (0.85) before labelling `verifier_decisions` samples.
- Phase-local decisions live in each plan's "Decisions" section — never re-open those either.

## Process (owner preference)
1. `/rm-kickoff <phase>` → own **worktree + branch** + distilled brief (`docs/work/<branch>.md`).
2. `superpowers:brainstorming` from the brief's open questions. Large phases are split into sub-phases (like 5a/5b/5c).
3. **Spec = new decisions and interfaces only** (`docs/superpowers/specs/<date>-<topic>-design.md`, aim ≤ 15 KB). Reference the core spec by §; don't restate it.
4. `superpowers:writing-plans` in the **lean plan format** below. Phases of small tasks.
5. **Owner approval** of the plan.
6. `superpowers:subagent-driven-development`: pre-flight step first (rebase on `main`, re-check "Dependencies on in-flight work", conflict-scan the plan against the code), then a fresh implementer + reviewer per task, a final whole-branch review on the most capable model, one fix wave. **Test scope:** implementers run focused tests; task reviewers run `pnpm test:affected` and, if web-facing code changed, `pnpm --filter @cs/web e2e:affected`; the final review runs both with `--base main`. The **full** unit suite and full E2E run only in `/rm-merge`, after asking the owner (CI also runs both on push).
7. `/rm-wrap-up` at the end of every session; `/rm-merge` only with the owner's go-ahead.

**Parallel workstreams:** one worktree per branch under `../CompetitorSpy-wt/<branch>`, one session per worktree; never two sessions in one working tree. Planning the next phase while the current one is coding is fine — see `/rm-kickoff` § "Planning ahead". Shared docs (`STATE`, `BACKLOG`, `ARCHITECTURE`, roadmap) change only at merge; branches write to their own work file.

### Lean plan format (overrides writing-plans' "complete code in every step")
Plan header: Goal, Global constraints, Decisions, File structure, **Dependencies on in-flight work** (assumptions to re-check), Review focus. Each task (aim ≤ 4 KB, plan ≤ 80 KB):
- **Goal** (1–2 lines) and **Files** (create / modify, exact paths).
- **Interfaces** — exact signatures, types, zod schemas, table columns, tool names, routes. These are binding.
- **Behaviour** — rules and edge cases as bullets; **Follow pattern:** the existing file to mirror.
- **Tests (TDD)** — test names + what each asserts; the implementer writes them first.
- **Done when** — commands that must pass.
- Write full code **only** for migrations/SQL and RLS policies, auth/security-sensitive logic, non-obvious algorithms, and decided user-facing copy. Everything else is the implementer's job.

## Essentials (every session)
- Before writing code, read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of any package you touch.
- Never print, commit or stage the repo-root `.env` (ask the owner before adding vars). Never stage `.claude/` (except `.claude/skills/rm-*`), `App/` or `.superpowers/`. Never change `REVIEWER_HASH_SALT`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents may name their own model). Repo is LF-only: `git ls-files --eol | grep crlf` must print nothing.
- Windows + Git Bash: don't `source .env`; use `grep '^KEY=' .env | cut -d= -f2-`. Exit `0xC0000409`/`3221226505` = machine short of commit memory, not a code bug.
- Turborepo strict env mode: a new env var reaches tasks only via `turbo.json` `globalPassThroughEnv`. Packages load `.env` with `process.loadEnvFile(<repo-root>/.env)` — count directory levels (wrong depth silently loads nothing).
- Tests share `cs_test`: never two test runs at once (E2E included) — unless each worktree points `TEST_*` at its own database. Prefer the **local test cluster** (`bash scripts/local-test-db.sh setup|start|env`, PG18 + pgvector on 127.0.0.1:5444) over Neon for `cs_test`. Affected only: `pnpm test:affected` / `pnpm --filter @cs/web e2e:affected`. Full suite: `npx turbo run test --concurrency=1 --continue` with `run_in_background`. Focused: `pnpm --filter <pkg> exec vitest run <pattern>` (`test -- <pattern>` does not narrow). Only `ETIMEDOUT`/timeouts → Neon flake, re-run once.
- Subagents run focused tests in the foreground and never hand back while a test run they started is still going.
- Never edit applied migrations; add new ones (`pnpm --filter @cs/db generate --custom --name=<x>`).
- Crawler conduct: honest UA `RivalMondayBot`, RFC 9309 robots (5xx ⇒ disallow), ≥ 3 s per host, never evade. `WEB_MONITORING_ENABLED` stays unset until `https://rivalmonday.com/bot` exists. Exactly one worker replica; no `collect-once --poll` while the worker runs.
- Model input goes through `redactForModel`, never bare `redactContactInfo`. `upsell_tag` never reaches client-facing reads/payloads. Event readers filter `retracted_at IS NULL`; client schedulers/lists filter `client.status = 'active'`.
- Web reads are registered `@cs/tools` tools; web writes go through `runTool`, never a service function directly. Page refusals → 404, never 403.
