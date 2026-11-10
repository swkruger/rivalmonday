@AGENTS.md

# Rival Monday (repo codename CompetitorSpy)

Agency-owned white-label SaaS monitoring competitors of **local-service small businesses** (pilots: HVAC/plumbing, dental; US) from **public information only**. Delivers dashboards, remote **MCP server**, in-app **Ask assistant "Friday"**, weekly **evidence-backed briefs** (*no evidence, no claim*) and alerts. Sold to agency clients first, then wholesale.

**Start with `/rm-start`.**

## Where things are
| Need | Read |
|---|---|
| State of `main`, next up | `docs/STATE.md` |
| Branch state | `docs/work/<branch>.md` (others: `git show <b>:docs/work/<b>.md`) |
| What's built, where | `docs/ARCHITECTURE.md` |
| Open work by target phase | `docs/BACKLOG.md` |
| Binding spec | `docs/superpowers/specs/2026-09-29-core-platform-design.md` (cite §) |
| Phases | `docs/superpowers/plans/2026-09-29-roadmap.md` |
| Live-data runbook | `docs/OPS.md` |
| Package gotchas | `<package>/CLAUDE.md` (auto-loaded) |
| Cross-cutting gotchas | `docs/gotchas-cross-cutting.md` |
| Vendor API contracts | `docs/research/2026-09-30-phase-2-vendor-apis.md` |
| **Design system (binding)** | `docs/design-system/README.md`; UI agents: `09-ai-implementation-playbook.md` |

## Decisions (do not re-litigate)
- **Product:** full-stack MVP (dashboard + MCP + Ask + briefs), not email-only.
- **Brand:** Rival Monday, wordmark `rivalmonday` (`rival` secondary, `monday` accent). Radar mark before it (favicon = mark on ink tile; never white-label). Assistant **Friday** (renamable; `docs/brand/`): orange pill (accent bg, #3B2300 text), radar-robot mascot. Primary #47A8E7 (ink label), secondary #2A6BAC, accent #F5A524, ink #0B2540, canvas #F6F9FC, grey panels #EEF2F6 (dark text); Inter; max 1560px.
- **Stack:** TypeScript monorepo, pnpm 10 + Turborepo, Node 24. Next.js App Router + Tailwind + shadcn/ui; per-agency CSS-variable brand tokens. Vercel (web/API/MCP/cron) + one worker container (pg-boss + Playwright). Neon Postgres, RLS tenancy; evidence in R2. OpenRouter for generation (`ai.yaml`) and Jev; cascade Jev → LLM → human.
- **Auth:** **self-hosted Better Auth** in `apps/web` (schema `auth`), not Neon Auth (invitation-only hooks, OAuth 2.1 MCP). Access = our `membership` table, not Better Auth's `organization` plugin.
- **Design system v1 (2026-10-23):** `docs/design-system/` binds all UI: one white sheet in a canvas frame, sections before cards, shadows only on floating layers, chart roles you #2A6BAC + ≤2 rivals + grey.
- **App style (2026-11-04):** opt-in `@cs/ui` variants; primary `ink` on agency pages, agency primary on client pages; orange only Friday/priority bar/`NumberMarker`; fixed chip tints; ink title band on client pages; raised cards only on recommendations board. `--brand-ink` (band, ink buttons, Friday bubble) = agency colour darkened to white 7:1, else ink; header override at 13a.
- **Charts:** inline SVG; colours checked with the dataviz skill.
- **Review decisions stay on Jev** until pilots give gold labels; verifier τ 0.85 until `verifier_decisions` are labelled.
- **Wider sources (18):** 18a no new paid vendors; 18b more Google (DataForSEO), 18c citations, 18d events vertical, 18e social (ScrapeCreators); out: public records, newsletters, FB Events/Nextdoor, video, bought citations, Yelp. Website tools: client text names the category, never the vendor. Ad images (18a-3): Google only (Meta's CDN disallows bots); Jev triage, person images never stored, vision LLM reads price images (≤ 20/client/week).
- **Discovery (12):** vendor-only two-stage search, $3/run cap; auto-run once at profile completion, then 1 manual search/client/week + monthly refresh; tiers Top rival / Worth watching / Minor.
- **Billing (9):** platform → agency (Stripe Billing): pilot / 30-day trial / $229/mo or $2,290/yr incl. 3 clients, 4–10 $79, 11+ $59, graduated (`@cs/billing` `pricing.ts`); yearly seat cuts at renewal; soft sign-up fence. Agency → client: Connect Standard, direct, fee 0; client-facing never names Rival Monday. Paused client: no work, no seat.
- **Agency onboarding (10):** self-sign-up (open trial: 1 active client, weekly pages until a card) or invite link; verify-then-create; wizard skippable.
- **Client onboarding (11):** resumable wizard (lookup → profile → competitors → invite owner → billing); starting-point clock starts when competitors are done (14-day cap). Clients self-start only via agency intake link or platform pool; `/start` may show Rival Monday until assigned.
- **Local rankings (13b):** map backgrounds = Stadia static images cached in evidence store; weekly scans Sun 06:00 UTC count against client cap; Scan now <= 1/client/7 d, <= 10/agency/day.
- **UX & IA (15):** context switcher Platform/Agency/Client (one at a time, URL-derived, navigation only, own memberships; others via support session); Ask {assistant} first in client view only; settings under `/agency/settings/*`, `/c/<id>/settings/*`; every page uses `PageHeader` (title = menu label, breadcrumb).
- **Verticals & runbooks (14):** verticals/areas = global DB catalogue (anyone creates, operators review/merge); runbooks copy platform → agency → client, client plays AI-tailored; HVAC/dental keep legacy pack plays until a client runbook.
- **Page fixes (15c):** one `standard` plan, versions carry Ask/MCP, agencies move at next billing; miles in UI, km stored; dates in viewer tz (`viewerTimeZone`/`rm_tz`); no route `loading.tsx`; `postWebhook` = only webhook POST; brand button text via `readableTextOn`; trial end = UTC date; status text via `lib/labels.ts`; hold = `agency.suspended_*` (read-only, billing frozen); archive refuses live billing; operator invites never name the operator.
- **Help (15b):** guides = `docs/help/pages/` Markdown via `kb:seed` (`help_key` `page:<context>.<page>`; client roles never get agency/operator help); short copy = `server-only` TS `help/copy/`; one `@cs/core` glossary; every `PageHeader` page needs help key + guides.
- **Copy sign-off:** owner signs in `pnpm copy:review`; ledger `docs/copy/signoff.json`; new email template/variant ⇒ preview in `@cs/email` `previews.ts`.
- **Onboarding (16):** L7 split flows (`OnboardingShell`, `(onboarding)`); owners never enter `/setup` (pick page only while `waiting_owner`); search = keywords + centre (Stadia geocode, no place id); images only on the 4 O14 screens.
- **Hosting (7a):** Vercel iad1 + one worker + own Neon prod; CI migrate → deploy (`DEPLOY_ENABLED`); staging `docs/STAGING.md` (live vendors). Roles `cs_worker`/`cs_web` (no owner URL). Sentry + pino (`redactForLog`).
- **Safety (7a):** SSRF guard (`@cs/collectors` `net/guard.ts`) = only fetch path for user-supplied URLs. Plan features gate Ask/MCP (`hasChannel`). Archived = deleted for tenants (`archived_at`); purge CLI >= 30 d; evidence never deleted.
- **Cost guards (7b):** nothing usage-billed; credits (1 USD = 100); only staff set limits; 100 % notice, 130 % auto-pause client AI/paid work; spike +100 % alert / +200 % pause all AI until staff reset; Jev is a provider; paid-work schedulers use `clientWorkAllowed`; fake gateway refused on Vercel; `max_redemptions` = local holders; a second live client subscription ignored.
- **Launch gate:** every page ≤ 8 app DB stages (`bash apps/web/scripts/profile-gate.sh --seed`) before a live deploy; web read audits use `after()`; writes/failures/support/non-web stay awaited; no cross-request cache or `cookieCache`.
- **Quality gates (7c1):** new tool => `ISOLATION_FIXTURES` entry; new table => `TABLE_CLASS` + world rows; out-of-scope client => `not_found`, never an empty list; `eval:replay` miss => re-record in the PR (<= $5/run); Ask drops uncited figures.
- **Pilot & scale (7c):** <= 20 agencies x <= 3 clients, slow invites, gates block leaks/claims/injection; feedback by email. One worker, N pollers/queue; prod needs `SERVICE_DATABASE_POOLED_URL`; vendor calls via limiter; `docs/PILOT.md`.
- **Site (17):** `apps/site` = rivalmonday.com, own Vercel project, no app imports; claims only from the claims ledger/code; rival facts sourced, ≤ 90 d (`check:facts`); vendors never named; compare pages off until counsel; pilot = waitlist; client price default $249 (`DEFAULT_CLIENT_PRICE_USD`).
- **Stats & controls:** stat-card traces from real history only; 36 px controls.
- **Briefs:** starting point = one per client, deterministic self-rules + verified why-it-matters. Weekly changes graded Major >= T / Notable >= T/2 / Minor (T = threshold, default 40) in email, app, PDF; quiet = no written item, no live Major; PDF = agency report attached (link fallback), never Ask; lines read-only; `get_brief` `changes` web-only.
- Phase-local decisions: each plan's "Decisions".

## Process 
1. `/rm-kickoff <phase>` → own **worktree + branch** + brief (`docs/work/<branch>.md`).
2. `superpowers:brainstorming` from the brief's open questions.
3. **Spec = new decisions and interfaces only** (`docs/superpowers/specs/<date>-<topic>-design.md`, ≤ 15 KB). Cite the core spec by §.
4. `superpowers:writing-plans` in the **lean plan format** below.
5. **Owner approval** of the plan.
6. `superpowers:subagent-driven-development`: pre-flight, implementer + reviewer per task, final review (top model), one fix wave. **Tests:** implementers focused only, reviewers none; `test:affected` + `e2e:affected` once at the final review; full unit + E2E only in `/rm-merge` after asking (CI runs both).
7. `/rm-wrap-up` every session end; `/rm-merge` only on the owner's go-ahead.

**Parallel workstreams:** one worktree + session per branch (`../CompetitorSpy-wt/<branch>`). Shared docs (`STATE`, `BACKLOG`, `ARCHITECTURE`, roadmap) change only at merge; branches write their work file.

### Lean plan format (overrides writing-plans' "complete code in every step")
Plan header: Goal, Global constraints, Decisions, File structure, **Dependencies on in-flight work** (re-check), Review focus. Tasks ≤ 4 KB, plan ≤ 80 KB:
- **Goal** (1–2 lines) and **Files** (create / modify, exact paths).
- **Interfaces** — exact signatures, types, zod schemas, table columns, tool names, routes. These are binding.
- **Behaviour** — rules/edge cases as bullets; **Follow pattern:** file to mirror.
- **Tests (TDD)** — test names + assertions; written first.
- **Done when** — commands that must pass.
- Full code **only** for migrations/SQL, RLS, auth/security logic, non-obvious algorithms, decided user-facing copy; the rest is the implementer's job.

## Essentials (every session)
- Before coding, read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of each package you touch.
- Never print, commit or stage root `.env` (ask before adding vars), `.claude/` (except `.claude/skills/rm-*`), `App/` or `.superpowers/`. Never change `REVIEWER_HASH_SALT`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents: own model). LF-only repo: `git ls-files --eol | grep crlf` must print nothing.
- Git Bash: don't `source .env`; use `grep '^KEY=' .env | cut -d= -f2-`.
- Turborepo strict env: a new env vars reach tasks only via `turbo.json` `globalPassThroughEnv`. Packages load `.env` via `process.loadEnvFile(<repo-root>/.env)`; wrong depth silently loads nothing.
- One test run (incl. E2E) per test DB; one DB per worktree. **Local cluster:** `bash scripts/local-test-db.sh setup|start|env`. Full suite: `npx turbo run test --concurrency=1 --continue` (background). Focused runs/flakes: gotchas § Testing.
- Subagents run focused tests in the foreground, never handing back mid-run.
- Never edit applied migrations; add new ones (`pnpm --filter @cs/db generate --custom --name=<x>`).
- Crawler: UA `RivalMondayBot`, RFC 9309 robots (5xx ⇒ disallow), ≥ 3 s per host, never evade. `WEB_MONITORING_ENABLED` stays unset until `https://rivalmonday.app/bot` exists. One worker replica; no `collect-once --poll` while it runs.
- Model input goes through `redactForModel`, never bare `redactContactInfo`. `upsell_tag` never reaches client-facing payloads. Event readers filter `retracted_at IS NULL`; client schedulers/lists `client.status = 'active'`.
- Web reads are registered `@cs/tools` tools; web writes go through `runTool`, never a service function. Page refusals → 404, never 403.
