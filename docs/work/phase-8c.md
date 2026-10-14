# phase-8c — Platform hosting costs

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8c   **Base:** phase-8b @ f666e79 (stacked on phase-8 → main)   **Test DB:** cs_phase_8c_test
**Spec:** `docs/superpowers/specs/2026-10-13-phase-8c-platform-costs-design.md` (c1–c12). Vendor contracts: `docs/research/2026-10-13-phase-8c-cost-apis.md`. Plan: not written yet.

## Status (overwrite)
Brainstorm done, spec written 2026-10-13. Awaiting owner review of the spec, then writing-plans (lean format).

## Next (overwrite)
1. Owner reviews spec → `superpowers:writing-plans`.
2. Owner adds `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID` to `.env` (main + this worktree) before Task 0, so Neon fields can be live-verified.
3. Merge order: phase-8 → phase-8b → phase-8c (rebase each on main after the previous merges).

## Interfaces this branch adds or changes
- Planned (see spec): tables `platform_cost_service`, `platform_cost_snapshot`, `platform_cost_item` (migration next free, expect 0051); worker job `platform-costs-snapshot`; tools `list_platform_costs`, `refresh_platform_costs`, `update_platform_cost_service`, `save_platform_cost_item`, `archive_platform_cost_item`; route `/platform/costs`; email template `platform-cost-low`; env vars `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID`.

## Decisions (owner, 2026-10-13 brainstorm)
1. Own sub-phase stacked on 8b; every service/cost shows its billing URL.
2. Daily worker snapshot + history + "Refresh now" (not live-on-load).
3. Warnings: console strip + email on newly-low; balance threshold or days-left (default 7).
4. Owners only (view + edit). No renewal reminders.
5. API reads: OpenRouter, DataForSEO, Apify, ScrapeCreators + Anthropic admin + Neon (new keys). Rest manual.
6. Manual entries: recurring (monthly/yearly) + one-off, USD only.

## New backlog (target → item)
- Unscheduled → Vercel / Cloudflare R2 cost APIs; Neon storage cost; CSV export; renewal reminders.
