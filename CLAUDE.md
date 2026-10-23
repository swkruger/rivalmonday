@AGENTS.md

# Rival Monday (repo codename CompetitorSpy)

Agency-owned, white-labelable SaaS that monitors competitors of **local-service small businesses** (pilots: HVAC/plumbing, dental; US-first) from **public information only**. Delivers a dashboard (agency + client), a remote **MCP server**, an in-app **Ask assistant "Friday"**, weekly **evidence-backed briefs** (*no evidence, no claim*) and alerts. Sold to the owning agency's clients first, then wholesale white-label.

**Start every session with `/rm-start`.**

## Where things are
| Need | Read |
|---|---|
| State of `main`, next up | `docs/STATE.md` (≤ 8 KB) |
| This branch's state | `docs/work/<branch>.md` (other branches: `git show <b>:docs/work/<b>.md`) |
| What's built, where | `docs/ARCHITECTURE.md` |
| Open work by target phase | `docs/BACKLOG.md` |
| Binding design spec | `docs/superpowers/specs/2026-09-29-core-platform-design.md` (cited § only) |
| Phase table | `docs/superpowers/plans/2026-09-29-roadmap.md` |
| Live-data runbook (`cs_dev`, re-pulls, labelling) | `docs/OPS.md` |
| Package-specific gotchas | `<package>/CLAUDE.md` (auto-loaded) |
| Cross-cutting gotchas, env, setup | `docs/gotchas-cross-cutting.md` |
| Vendor API contracts (live-verified) | `docs/research/2026-09-30-phase-2-vendor-apis.md` |
| Brand tokens, mockups | `docs/brand/` |
| Old handover / roadmap | `docs/archive/` (history; don't read) |

## Decisions (do not re-litigate)
- **Product:** full-stack MVP (dashboard + MCP + Ask + briefs), not email-only.
- **Brand:** Rival Monday, wordmark `rivalmonday` (`rival` #2A6BAC, `monday` #F5A524). Assistant **Friday** (renamable), orange pill (#F5A524 bg, #3B2300 text). Primary #47A8E7 (white text OK at 2.6:1), secondary #2A6BAC, accent #F5A524, ink #0B2540, canvas #F6F9FC, grey panels #EEF2F6 (dark text). Inter. Max 1560px.
- **Stack:** TypeScript monorepo, pnpm 10 + Turborepo, Node 24. Next.js App Router + Tailwind + shadcn/ui; per-agency CSS-variable brand tokens. Vercel (web/API/MCP/cron) + one worker container (pg-boss + Playwright). Neon Postgres, RLS tenancy. Evidence in R2 (filesystem locally). OpenRouter generation (`packages/ai/config/ai.yaml`); Jev (TypeSafe System One) decisions, cascade Jev → LLM → human.
- **Auth:** **self-hosted Better Auth** inside `apps/web` (schema `auth`), not Neon Auth (needs invitation-only hooks + the OAuth 2.1 MCP provider). Access lives in our own `membership` table, not Better Auth's `organization` plugin.
- **Charts:** hand-written inline SVG; validate colours with the dataviz skill.
- **Review decisions stay on Jev** until pilots supply gold labels at volume; don't change verifier τ (0.85) before labelling `verifier_decisions`.
- **Competitor discovery (Phase 12):** vendor-only two-stage search, $3/run cap; auto-run once when a profile completes, then 1 manual search/client/week + monthly refresh; tiers Top rival / Worth watching / Minor; shared ad-account removal only by the sole tracker.
- **Billing (Phase 9):** platform → agency via Stripe Billing (pilot / 30-day trial / $229 incl. 3 seats + $99/seat); agency → client via Stripe Connect Standard, direct charges, fee 0; nothing client-facing names Rival Monday. Paused clients (`client.paused_at`): no recurring work, no seat.
- **Agency onboarding (Phase 10):** agencies self-sign-up (open trial: 1 active client, weekly pages until a card is added) or join by invite link; verify-then-create; wizard skippable.
- **Client onboarding (Phase 11):** resumable setup wizard (lookup -> profile -> competitors -> invite owner -> billing); starting-point clock starts when competitors are done (14-day cap). Clients self-start only via an agency intake link or the platform pool; `/start` may show Rival Monday until assigned.
- **Local rankings (13b):** map backgrounds = Stadia static images cached in our evidence store (not MapTiler: no server caching); weekly scans Sunday 06:00 UTC count against the client cap; Scan now <= 1/client/7 d, <= 10/agency/day.
- **UX & IA (Phase 15):** HighLevel-style context switcher (Platform/Agency/Client; one at a time, URL-derived, navigation only, own memberships — other agencies via support session); Ask {assistant} first in the client view only; agency settings under `/agency/settings/*`, client settings under `/c/<id>/settings/*`; every page uses `PageHeader` (title = menu label, breadcrumb).
- **Verticals & runbooks (Phase 14):** verticals/business areas = global DB catalogue (anyone creates, operators review/merge); runbooks copy platform → agency → client, client plays AI-tailored; HVAC/dental keep legacy pack plays until they get a client runbook.
- **Help (Phase 15b):** guides = repo Markdown in `docs/help/pages/` seeded by `kb:seed` (`help_key` `page:<context>.<page>`, audience all/agency/client/operator; client roles never get agency/operator help); short copy = `server-only` TS in `apps/web/src/help/copy/`, sent filtered by audience (`HelpProvider`); glossary = one typed `@cs/core` list, no placeholders; owner signs off copy; every `PageHeader` page needs a help key + guides. Users see "topic"; the code/DB/tool rename is done in 15b-3a (data & engine, no aliases, one-time backfill); routes, page key and MCP tool names follow in 15b-3b. Model-ops keys (`theme_<v>__<id>`, `theme_discovery` tasks, `review_themes` stage) keep `theme`.
- **Hosting (7a):** Vercel iad1 + one Railway worker + separate Neon prod project; CI `deploy` job migrates, then deploys, only if repo variable `DEPLOY_ENABLED=true`. Runtime DB roles `cs_worker`/`cs_web`; no owner URL at runtime. Sentry + pino logs, all through `redactForLog`.
- **Safety (7a):** the SSRF guard (`@cs/collectors` `net/guard.ts`) is the only fetch path for user-supplied URLs. Plan features gate Ask/MCP (`hasChannel`). Archived = deleted for tenants (`archived_at`); purge CLI only after >= 30 d; evidence is never deleted.
- **Starting-point brief:** one per client, deterministic self-rules + verified why-it-matters only; quiet weeks carry a "Where you stand" scorecard.
- Phase-local decisions live in each plan's "Decisions"; never re-open those either.

## Process (owner preference)
1. `/rm-kickoff <phase>` → own **worktree + branch** + distilled brief (`docs/work/<branch>.md`).
2. `superpowers:brainstorming` from the brief's open questions. Large phases split into sub-phases.
3. **Spec = new decisions and interfaces only** (`docs/superpowers/specs/<date>-<topic>-design.md`, aim ≤ 15 KB). Reference the core spec by §; don't restate it.
4. `superpowers:writing-plans` in the **lean plan format** below. 
5. **Owner approval** of the plan.
6. `superpowers:subagent-driven-development`: pre-flight first (rebase on `main`, re-check "Dependencies on in-flight work", conflict-scan plan vs code), then a fresh implementer + reviewer per task, a final whole-branch review on the most capable model, one fix wave. **Test scope:** implementers run focused tests; task reviewers `pnpm test:affected` (+ `pnpm --filter @cs/web e2e:affected` for web code); the final review both with `--base main`. Full unit + E2E only in `/rm-merge`, after asking the owner (CI runs both on push).
7. `/rm-wrap-up` at the end of every session; `/rm-merge` only with the owner's go-ahead.

**Parallel workstreams:** one worktree per branch (`../CompetitorSpy-wt/<branch>`), one session per worktree. Planning ahead: `/rm-kickoff` § "Planning ahead". Shared docs (`STATE`, `BACKLOG`, `ARCHITECTURE`, roadmap) change only at merge; branches write their own work file.

### Lean plan format (overrides writing-plans' "complete code in every step")
Plan header: Goal, Global constraints, Decisions, File structure, **Dependencies on in-flight work** (re-check), Review focus. Tasks aim ≤ 4 KB, plan ≤ 80 KB:
- **Goal** (1–2 lines) and **Files** (create / modify, exact paths).
- **Interfaces** — exact signatures, types, zod schemas, table columns, tool names, routes. These are binding.
- **Behaviour** — rules/edge cases as bullets; **Follow pattern:** file to mirror.
- **Tests (TDD)** — test names + assertions; written first.
- **Done when** — commands that must pass.
- Write full code **only** for migrations/SQL and RLS policies, auth/security-sensitive logic, non-obvious algorithms, and decided user-facing copy. The rest is the implementer's job.

## Essentials (every session)
- Before writing code, read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of any package you touch.
- Never print, commit or stage the root `.env` (ask before adding vars). Never stage `.claude/` (except `.claude/skills/rm-*`), `App/` or `.superpowers/`. Never change `REVIEWER_HASH_SALT`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents: own model). Repo is LF-only: `git ls-files --eol | grep crlf` must print nothing.
- Git Bash: don't `source .env`; use `grep '^KEY=' .env | cut -d= -f2-`. Exit `0xC0000409` = out of commit memory, not a code bug.
- Turborepo strict env mode: a new env var reaches tasks only via `turbo.json` `globalPassThroughEnv`. Packages load `.env` via `process.loadEnvFile(<repo-root>/.env)`; wrong depth silently loads nothing.
- Never two test runs (E2E included) on one test DB; each worktree gets its own. Use the **local test cluster** (`bash scripts/local-test-db.sh setup|start|env`, port 5444). Affected only: `pnpm test:affected` / `pnpm --filter @cs/web e2e:affected`. Full suite: `npx turbo run test --concurrency=1 --continue` with `run_in_background`. Focused: `pnpm --filter <pkg> exec vitest run <pattern>`. Flakes: see `docs/gotchas-cross-cutting.md` § Testing.
- Subagents run focused tests in the foreground and never hand back mid-run.
- Never edit applied migrations; add new ones (`pnpm --filter @cs/db generate --custom --name=<x>`).
- Crawler: honest UA `RivalMondayBot`, RFC 9309 robots (5xx ⇒ disallow), ≥ 3 s per host, never evade. `WEB_MONITORING_ENABLED` stays unset until `https://rivalmonday.app/bot` exists. One worker replica only; no `collect-once --poll` while it runs.
- Model input goes through `redactForModel`, never bare `redactContactInfo`. `upsell_tag` never reaches client-facing payloads. Event readers filter `retracted_at IS NULL`; client schedulers/lists filter `client.status = 'active'`.
- Web reads are registered `@cs/tools` tools; web writes go through `runTool`, never a service function directly. Page refusals → 404, never 403.
