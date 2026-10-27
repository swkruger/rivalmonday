@AGENTS.md

# Rival Monday (repo codename CompetitorSpy)

Agency-owned white-label SaaS that monitors competitors of **local-service small businesses** (pilots: HVAC/plumbing, dental; US) from **public information only**. Delivers dashboards, a remote **MCP server**, an in-app **Ask assistant "Friday"**, weekly **evidence-backed briefs** (*no evidence, no claim*) and alerts. Sold to the agency's clients first, then wholesale.

**Start each session with `/rm-start`.**

## Where things are
| Need | Read |
|---|---|
| State of `main`, next up | `docs/STATE.md` (≤ 12 KB) |
| This branch's state | `docs/work/<branch>.md` (other branches: `git show <b>:docs/work/<b>.md`) |
| What's built, where | `docs/ARCHITECTURE.md` |
| Open work by target phase | `docs/BACKLOG.md` |
| Binding spec | `docs/superpowers/specs/2026-09-29-core-platform-design.md` (cited § only) |
| Phase table | `docs/superpowers/plans/2026-09-29-roadmap.md` |
| Live-data runbook (`cs_dev`) | `docs/OPS.md` |
| Package gotchas | `<package>/CLAUDE.md` (auto-loaded) |
| Cross-cutting gotchas, env | `docs/gotchas-cross-cutting.md` |
| Vendor API contracts | `docs/research/2026-09-30-phase-2-vendor-apis.md` |
| Brand, mockups | `docs/brand/` |
| **Design system (binding UI rules, tokens, storyboard)** | `docs/design-system/README.md`; agents implementing UI: `09-ai-implementation-playbook.md` |
| Old handover | `docs/archive/` (don't read) |

## Decisions (do not re-litigate)
- **Product:** full-stack MVP (dashboard + MCP + Ask + briefs), not email-only.
- **Brand:** Rival Monday, wordmark `rivalmonday` (`rival` #2A6BAC, `monday` #F5A524). Assistant **Friday** (renamable), orange pill (#F5A524 bg, #3B2300 text). Primary #47A8E7 (ink #0B2540 label on primary buttons — design system v1, replaces the 2.6:1 white-text exception), secondary #2A6BAC, accent #F5A524, ink #0B2540, canvas #F6F9FC, grey panels #EEF2F6 (dark text). Inter. Max 1560px.
- **Stack:** TypeScript monorepo, pnpm 10 + Turborepo, Node 24. Next.js App Router + Tailwind + shadcn/ui; per-agency CSS-variable brand tokens. Vercel (web/API/MCP/cron) + one worker container (pg-boss + Playwright). Neon Postgres, RLS tenancy. Evidence in R2 (filesystem locally). OpenRouter generation (`packages/ai/config/ai.yaml`); Jev decisions via OpenRouter (`typesafe/jev-1.14`), cascade Jev → LLM → human.
- **Auth:** **self-hosted Better Auth** inside `apps/web` (schema `auth`), not Neon Auth (needs invitation-only hooks + the OAuth 2.1 MCP provider). Access lives in our own `membership` table, not Better Auth's `organization` plugin.
- **Design system v1 (2026-10-23):** `docs/design-system/` is binding for all UI — one white sheet in a #F6F9FC frame, sections before cards (cards = independent objects), shadows only on floating layers, radii 4/6/8/12/full, Inter 400/500/600, ink headings, dot/badge/chip status grammar, chart roles you #2A6BAC + ≤2 rivals + grey. Existing UI migrates per its playbook.
- **Charts:** hand-written inline SVG; validate colours with the dataviz skill.
- **Review decisions stay on Jev** until pilots supply gold labels at volume; don't change verifier τ (0.85) before labelling `verifier_decisions`.
- **Competitor discovery (Phase 12):** vendor-only two-stage search, $3/run cap; auto-run once when a profile completes, then 1 manual search/client/week + monthly refresh; tiers Top rival / Worth watching / Minor; shared ad-account removal only by the sole tracker.
- **Billing (Phase 9):** platform → agency via Stripe Billing (pilot / 30-day trial / $229 incl. 3 seats, $99/seat); agency → client via Stripe Connect Standard, direct charges, fee 0; nothing client-facing names Rival Monday. Paused client (`paused_at`): no work, no seat.
- **Agency onboarding (Phase 10):** agencies self-sign-up (open trial: 1 active client, weekly pages until a card is added) or join by invite link; verify-then-create; wizard skippable.
- **Client onboarding (Phase 11):** resumable setup wizard (lookup -> profile -> competitors -> invite owner -> billing); starting-point clock starts when competitors are done (14-day cap). Clients self-start only via an agency intake link or the platform pool; `/start` may show Rival Monday until assigned.
- **Local rankings (13b):** map backgrounds = Stadia static images cached in our evidence store (not MapTiler: no server caching); weekly scans Sunday 06:00 UTC count against the client cap; Scan now <= 1/client/7 d, <= 10/agency/day.
- **UX & IA (Phase 15):** HighLevel-style context switcher (Platform/Agency/Client; one at a time, URL-derived, navigation only, own memberships — other agencies via support session); Ask {assistant} first in the client view only; agency settings under `/agency/settings/*`, client settings under `/c/<id>/settings/*`; every page uses `PageHeader` (title = menu label, breadcrumb).
- **Verticals & runbooks (Phase 14):** verticals/business areas = global DB catalogue (anyone creates, operators review/merge); runbooks copy platform → agency → client, client plays AI-tailored; HVAC/dental keep legacy pack plays until they get a client runbook.
- **Page fixes (Phase 15c):** one `standard` plan (no private plans); versions carry Ask/MCP; agencies move to the current version at their next billing date; miles in UI, km stored; dates in the viewer's tz (`viewerTimeZone`/`rm_tz`); no route `loading.tsx` (breaks 404s; use `Suspense`). C1-C11: 15c spec §2. 15c-2a: `postWebhook` is the only webhook POST; brand-colour button text via `readableTextOn`; trial/pilot ends date-only UTC. 15c-2b-2: grep gates cover all `apps/web/src` (exempt: `GATE_EXEMPT`); status text via `lib/labels.ts` maps. 15c-3a: hold = `agency.suspended_*` (read-only, billing frozen, collection paused after commit); archive refuses live billing; operator invites never name the operator.
- **Help (Phase 15b):** guides = repo Markdown in `docs/help/pages/` seeded by `kb:seed` (`help_key` `page:<context>.<page>`, audience all/agency/client/operator; client roles never get agency/operator help); short copy = `server-only` TS in `help/copy/`; glossary = one typed `@cs/core` list; owner signs copy; every `PageHeader` page needs a help key + guides. Users see "topic"; model-ops keys keep `theme`.
- **Onboarding (16-onboarding):** agency 4-step + client 7-step + intake = L7 split flows in `(onboarding)` (OnboardingShell); owners never enter `/setup` (pick page only while `waiting_owner`); competitor search needs keywords + a centre (no place id; no-listing clients geocoded via Stadia); generated images only on the four O14 screens.
- **Hosting (7a):** Vercel iad1 + one Railway worker + separate Neon prod project; CI `deploy` job migrates, then deploys, only if repo variable `DEPLOY_ENABLED=true`. Runtime DB roles `cs_worker`/`cs_web`; no owner URL at runtime. Sentry + pino logs, all through `redactForLog`.
- **Safety (7a):** the SSRF guard (`@cs/collectors` `net/guard.ts`) is the only fetch path for user-supplied URLs. Plan features gate Ask/MCP (`hasChannel`). Archived = deleted for tenants (`archived_at`); purge CLI only after >= 30 d; evidence is never deleted.
- **Cost guards (7b):** nothing usage-billed; credits for tenants (1 USD = 100); only staff set limits; 100 % = calm notice, 130 % = auto-pause the client's AI/paid work; spike guard +100 % alert / +200 % pause all AI until staff reset; Jev counts like any provider (exclusion list empty); paid-work schedulers use `clientWorkAllowed`. 7b2: fake gateway refused on Vercel, ignored by the worker; `max_redemptions` = local holder count; a second live client subscription is ignored, agency told.
- **Quality gates (7c1):** new tool => `ISOLATION_FIXTURES` entry; new table => `TABLE_CLASS` + world rows; out-of-scope client => `not_found`, never an empty list; CI `eval:replay` miss => re-record in the PR (<= $5/run); Ask drops uncited figures.
- **Pilot & scale (7c):** <= 20 agencies x <= 3 clients, slow invites, rehearse 120 clients on staging; gates block leaks/unsupported claims/injection; feedback by email. One worker, N pollers/queue (`QUEUE_CONCURRENCY`); `SERVICE_DATABASE_POOLED_URL` required in prod; vendor calls via the limiter (`timeoutMs`); captures defer; rehearsal vars staging-only; runbook `docs/PILOT.md`.
- **Starting-point brief:** one per client, deterministic self-rules + verified why-it-matters only; quiet weeks carry a "Where you stand" scorecard.
- Phase-local decisions live in each plan's "Decisions"; don't re-open.

## Process (owner preference)
1. `/rm-kickoff <phase>` → own **worktree + branch** + distilled brief (`docs/work/<branch>.md`).
2. `superpowers:brainstorming` from the brief's open questions. Split large phases.
3. **Spec = new decisions and interfaces only** (`docs/superpowers/specs/<date>-<topic>-design.md`, aim ≤ 15 KB). Reference the core spec by §; don't restate it.
4. `superpowers:writing-plans` in the **lean plan format** below. 
5. **Owner approval** of the plan.
6. `superpowers:subagent-driven-development`: pre-flight (rebase, re-check in-flight dependencies, conflict-scan), then a fresh implementer + reviewer per task, a final whole-branch review on the most capable model, one fix wave. **Test scope:** implementers run focused tests; task reviewers run none; `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` run once, at the final review (`--base main`). Full unit + E2E only in `/rm-merge`, after asking the owner (CI runs both on push).
7. `/rm-wrap-up` at the end of every session; `/rm-merge` only with the owner's go-ahead.

**Parallel workstreams:** one worktree per branch (`../CompetitorSpy-wt/<branch>`), one session each. Planning ahead: `/rm-kickoff`. Shared docs (`STATE`, `BACKLOG`, `ARCHITECTURE`, roadmap) change only at merge; branches write their own work file.

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
- Git Bash: don't `source .env`; use `grep '^KEY=' .env | cut -d= -f2-`. `0xC0000409` = out of memory.
- Turborepo strict env mode: a new env var reaches tasks only via `turbo.json` `globalPassThroughEnv`. Packages load `.env` via `process.loadEnvFile(<repo-root>/.env)`; wrong depth silently loads nothing.
- Never two test runs (incl. E2E) on one test DB; one per worktree. **Local test cluster:** `bash scripts/local-test-db.sh setup|start|env` (port 5444). Affected: `pnpm test:affected` / `pnpm --filter @cs/web e2e:affected`. Full suite: `npx turbo run test --concurrency=1 --continue` with `run_in_background`. Focused: `pnpm --filter <pkg> exec vitest run <pattern>`. Flakes: gotchas § Testing.
- Subagents run focused tests in the foreground, never hand back mid-run.
- Never edit applied migrations; add new ones (`pnpm --filter @cs/db generate --custom --name=<x>`).
- Crawler: honest UA `RivalMondayBot`, RFC 9309 robots (5xx ⇒ disallow), ≥ 3 s per host, never evade. `WEB_MONITORING_ENABLED` stays unset until `https://rivalmonday.app/bot` exists. One worker replica only; no `collect-once --poll` while it runs.
- Model input goes through `redactForModel`, never bare `redactContactInfo`. `upsell_tag` never reaches client-facing payloads. Event readers filter `retracted_at IS NULL`; client schedulers/lists filter `client.status = 'active'`.
- Web reads are registered `@cs/tools` tools; web writes go through `runTool`, never a service function directly. Page refusals → 404, never 403.
