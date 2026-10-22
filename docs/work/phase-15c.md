# phase-15c — audit page fixes (UX/IA follow-up)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c   **Base:** main @ 10ce242d
**Plan/spec:** [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) (approved 2026-10-21); plan [15c-1](../superpowers/plans/2026-10-21-phase-15c1-shared-pieces.md); inputs [15 spec](../superpowers/specs/2026-10-18-phase-15-ux-ia-design.md) §4, [audit](../research/2026-10-18-phase-15-ux-audit.md)

## Status (overwrite)
15c-1 built and reviewed on 2026-10-22; final whole-branch review next. 15c-2 and 15c-3 plans follow after 15c-1 merges.


## Next (overwrite)
Final whole-branch review → owner verification → /rm-merge.


## Interfaces this branch adds or changes
No migration (next free **0084**).
- `@cs/ui`: `Skeleton`, `StatusChip`, `CHIP_COLOURS`, `ConfirmDialog`, `SaveBar`, type `ChipTone`.
- `@cs/db`: `ALERT_STATUSES`, `WEBHOOK_KINDS`, `TREND_REPORT_STATUSES`, `EVIDENCE_KINDS`; re-exports `CATALOG_STATUSES` (lives in `@cs/verticals`).
- `apps/web`: `lib/labels.ts` (`labelFor`, value maps, `CLIENT_AUDIENCE_MAPS`), `lib/agency-only-terms.ts`, `lib/format/{date,money,distance}` (old per-folder formatters removed), `components/radius-select.tsx`, `components/page-skeleton.tsx`.
- Time zone: `viewerTimeZone()` + `rm_tz` cookie (set by the shell).
- `reportError(error, where)` in `lib/report-error` (frozen signature; **phase-7 swaps in Sentry** inside it).
- Error pages: `app/{not-found,error,global-error}.tsx`, `(app)/error.tsx`, `(platform)/platform/error.tsx`. **13a makes them host-aware instead of creating them.**
- Tokens: `--color-line`, `--you`/`--color-you` (one "You" colour), `--chip-*`.
- Env flag `E2E_THROW_PAGE` (E2E only, refused in production) and E2E-only route `/e2e-throw`.
- No route `loading.tsx` under `(app)`/`(platform)`: it makes `notFound()` return HTTP 200. Use `<Suspense fallback={<PageSkeleton/>}>` in pages after access checks.

### Rulings during 15c-1
- R1: service area radius uses the rank-radius miles select; the spec's 1–50 mi rule is dropped (server bound stays 2–40 km).
- REVIEW_STATUS = vertical/business-area catalogue status; 15c-2 adds a map per page as it meets other statuses.
- CLIENT_AUDIENCE_MAPS as implemented (MEMBERSHIP_ROLE stays); owner confirms at sign-off.
- `CATALOG_STATUSES` lives in `@cs/verticals`, re-exported by `@cs/db` (the reverse would cycle).
- Zone labels use `shortGeneric` (CT/ET), not CDT.
- Route-level `loading.tsx` files dropped (404 regression); `PageSkeleton` stays for in-page Suspense in 15c-2.
- Task 9 before/after screenshots waived; visual checks moved to owner verification.


## Assumes from other branches
- **phase-7**: 7a2 must expose archive as a service function (not only CLI) for 15c-3's archive button; edits `nav-items.ts`, `server/nav.ts`, `/platform/health`, `agency/page.tsx`, agency settings `ai/billing/branding/slack-teams/team`, evidence, `rankings/page.tsx`, client `settings/{ai,delivery}`, `onboarding`, `ask/*`, `next.config.ts`; adds Sentry. Our `error.tsx` leaves it a capture seam.
- **phase-15b3** (docs only so far): 3b renames `/platform/themes`→`/platform/topics`, `?theme=`, `ThemeQueue`, `ThemeHeatmap`, `pendingThemes`.
- **13a** (planned, unbuilt): root `app/{not-found,error,global-error}.tsx`, host-aware titles, `client-profile-form.tsx`, `/start*`. Overlaps our error pages and miles work.
- **phase-7-planning**: parked, no overlap.

## Decisions (owner-approved)
C1–C11 in the 15c spec §2 (split; neutral error pages now; miles in UI; small features incl. intake preview + page diff; agency management incl. separate plans; hold = read-only + billing paused; start now, theme pages last; tz rule; mobile sheet; mockups + copy sign-off per sub-phase). 15c-1 mockups approved 2026-10-21 as planned (chip tints = plan P2, copy unchanged); service area radius = rank radius select (plan R1).

## New backlog (target → item)
- 15c-2: `onboarding/steps/plan.tsx` calls `formatDate` without `now`.
- 15c-2: ISO dates remain in `billing-panel.tsx`, `plan-editor.tsx`, `cost-items-table.tsx`, changes viewer `formatFullUtc`.
- 15c-2: `formatWeekOf` has no caller yet; cents-unit billing keeps `$299.00` vs revenue card `$598`.
- 15c-2 / investigate: E2E web server logs "destination stream closed early" around `workspace.spec.ts`; compare with a main run.
- Deferred minors (no target): one shared `ui-primitives.test.tsx`; ConfirmDialog input id should use `useId`; chip hex duplicated in `status-chip.tsx` and `styles.css`; `labelFor` value type collapses to string; `EVIDENCE_KINDS`/`ALERT_STATUSES` SQL parity not enforced; `global-error` lacks Inter; PageSkeleton title height; dead `showsClientBilling` re-export; "Other" series #94a3b8 fails dataviz checks (pre-existing); legacy stored radius >40 km shows custom and is rejected.


## Owner verification steps
Chips and labels appear on pages in 15c-2; for now:
1. Open an unknown URL and a client you can't access: "Page not found", HTTP 404.
2. Rank settings, profile and setup show radius in miles, including a legacy custom value ("≈ N mi (custom)").
3. Dates read "Oct 21"-style on billing, briefs and changes.
4. Newly visible 1px borders on dense lists look right.
5. On a rankings chart, "You" (#2A6BAC) is distinguishable from the first competitor's blue.
6. Sign off `docs/work/phase-15c1-copy-signoff.md` (move to `docs/archive/` at merge).


## Brief
Scope, audit items and the owner's answered questions live in the [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) (§2 decisions C1-C11, §3 shared pieces) and the [audit](../research/2026-10-18-phase-15-ux-audit.md); the pre-split brief is in git history (`git show 9ddfae3c:docs/work/phase-15c.md`). Binding: CLAUDE.md (tokens, 1560px, SVG charts, reads via tools / writes via `runTool`, 404 refusals), 15b help-key and sign-off rules, 15b-3 D3 (no theme redirects). Related polish: Ask delete (6b), knowledge preview (6c), webhooks/`PrefSwitch` (5a), Usage/alert cap (5b), feed hex (5c-1), heatmap table (5c-2), costs strip (8c).
