# phase-8c — Platform hosting costs

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8c   **Base:** phase-8b @ f666e79 (stacked on phase-8 → main)   **Test DB:** cs_phase_8c_test
**Spec:** `docs/superpowers/specs/2026-10-13-phase-8c-platform-costs-design.md` (c1–c12). Vendor contracts: `docs/research/2026-10-13-phase-8c-cost-apis.md`.
Plan: `docs/superpowers/plans/2026-10-13-phase-8c-platform-costs.md` (Tasks 0–8).

## Status (overwrite)
Tasks 0–8 implemented and committed (migration 0051, adapters, maths, daily job + low email, 5 tools, `/platform/costs` page with nav and warning strip, `@costs` E2E, demo seed). Final whole-branch review pending; then owner go-ahead for `/rm-merge`.

## Next (overwrite)
1. Final whole-branch review + fix wave -> owner verification -> /rm-merge after phase-8 and phase-8b.
2. Pre-merge owner step: set ANTHROPIC_ADMIN_KEY, NEON_API_KEY, NEON_ORG_ID before relying on live Anthropic/Neon readings (Neon field paths unverified).

## Interfaces this branch adds or changes
- Tables `platform_cost_service` (6 rows seeded by migration 0051), `platform_cost_snapshot`, `platform_cost_item` (service role only; numerics are strings).
- Worker job `platform-costs-snapshot` (daily 06:00 UTC; "Refresh now" enqueues it); email template `platform-cost-low`.
- Tools (owner only, `supportHidden`): `list_platform_costs`, `refresh_platform_costs`, `update_platform_cost_service`, `save_platform_cost_item`, `archive_platform_cost_item`.
- Route `/platform/costs` (404 for non-owners); owners also get the Costs nav item and a low-balance strip on every `/platform/**` page.
- Env vars `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID` (in `turbo.json` globalPassThroughEnv; not yet set in `.env`).
- Tests: `apps/web/e2e/platform-costs.spec.ts` (`@costs`); E2E server env gets dummy `DATAFORSEO_LOGIN/PASSWORD` (presence only) so the seeded service reads "configured". Demo seed `packages/demo/src/platform-costs.ts`.

## Decisions (owner, 2026-10-13 brainstorm)
1. Own sub-phase stacked on 8b; every service/cost shows its billing URL.
2. Daily worker snapshot + history + "Refresh now" (not live-on-load).
3. Warnings: console strip + email on newly-low; balance threshold or days-left (default 7).
4. Owners only (view + edit). No renewal reminders.
5. API reads: OpenRouter, DataForSEO, Apify, ScrapeCreators + Anthropic admin + Neon (new keys). Rest manual.
6. Manual entries: recurring (monthly/yearly) + one-off, USD only.

## New backlog (target → item)
- Unscheduled → Vercel / Cloudflare R2 cost APIs; Neon storage cost; CSV export; renewal reminders.
