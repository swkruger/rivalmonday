# ui-visual-review - page-by-page visual review of apps/web: inputs, chart text, stat cards

**Kind:** polish   **Worktree:** ../CompetitorSpy-wt/ui-visual-review   **Base:** main @ c57c53b9 (main has 4 newer commits)
**Plan/spec:** none (owner: "Just go"). Harness: `pnpm --filter @cs/web shots:crawl`; baseline and result in `apps/web/.shots/{before,after}-crawl/` (not committed).

## Status (overwrite)
All fixes committed. Final review done and its Important findings fixed. Nothing merged or pushed; no background jobs.
Tests: `test:affected` passed except one demo coverage gap (since fixed, coverage suite 97/97); `e2e:affected` 150/150 at 7048d3a6. The two commits after that (demo coverage, review fixes) had focused tests only: tools 20, ui 9, web 215. tsc and design lint clean. Full suites have not run since those commits; `/rm-merge` or CI covers them.
Crawl: 210 screens. Clipped chart labels 56 -> 0; chart text 6.2-29.9 px -> 12-14.3 px; page overflow 1 -> 0; 28/32/40 px controls -> 36 px.

## Next (overwrite)
Owner looks at the demo and decides on merge. Then `/rm-merge`: rebase first. `components/ask/ask-chat.tsx` changed on both sides (site-polish) and is the only overlap.

## Interfaces this branch adds or changes
No migrations (next free: **0097**), no env vars, no new tools or routes.
- Tool output: `get_workspace_overview.weekly {changes, priceMoves, activeAds}`; `get_portfolio.trends {clients, alerts, briefs}`; `get_billing_overview.history`.
- `@cs/ui`: `Kpi` props `trace`, `traceLabel`, `tone` (`KpiTone`, `data-kpi-tone`), `kpiTraceRuns`; `toolbarControlClass` is now h-9. `styles.css`: global select chevron, checkbox/radio size and accent, `.rm-kpi*`, `.rm-scroll-x`.
- Web: `components/charts/plot.tsx` (`ChartPlot`, `PlotLine`, `PlotDot`); `platform/knowledge/options.ts`; `moveFactLabel` in `lib/labels.ts`.

## Assumes from other branches
None. site-polish is already on main.

## Decisions
1. Owner: traces only from real history. A stat without history stays plain, and all-zero or lone-point history draws nothing. (Owner asked for a chart behind every stat; "no evidence, no claim" wins.)
2. Owner request, my design: KPI wash and trace amend the design system (`06-component-catalog.md`, playbook). **For owner to confirm:** D-15, one 36 px control height, was my call under "Just go".
3. My call: competitor bulk bar is in flow, not sticky, because it covered the search button. It no longer stays on screen while scrolling.
4. My call: brief scorecards get no traces (frozen payload).

## New backlog (target → item)
- Owner → copy sign-off for new wording: `traceLabel` hover strings, `moveFactLabel` output, chart and toolbar labels.
- Polish → phones: table-to-card for leads, waitlist, agencies, team, usage (scroll cue added meanwhile).
- Polish → several stacked "?" tips per heading; sign-in layout; long help and runbook pages; activity feed timezone; duplicated title/body sentences ("Hill Country Air & Heat — Hill Country Air & Heat cut…"); raw `{{tokens}}` in runbook text.
- Polish → trace maths: flow traces end in a partial period, so they dip early in each period; y scale is min-max, so tiny moves fill the band (acceptable as decoration).
- Polish → decorative reads via `tryCallTool` still fail the page on an `internal` error (only refusals degrade).
- Polish → `MonthlyChart` has no table fallback (gap against D-13, older than this branch).
- Polish → alert-threshold form shows no Save until a field changes; review row spacing (`py-4`) was a guess; `/platform/health` readiness counts stay a plain list (reported as converted to `StatStrip`, but never applied).
- Polish → `rm-scroll-x` white edge covers would show on a tinted container; none traced.
- Unscheduled → check charts in Safari and Firefox; check `apps/site` selects after the global chevron rule.
- Earlier brief → L157 design-lint `ALLOW_HEX`/`ALLOW_AMBER` narrowing and L156 44 px touch targets not done.

## Owner verification steps
Demo: `pnpm --filter @cs/web dev:demo`. Client Overview and Local rankings (charts), Changes (toolbar), a competitor page (traces), Business profile (form), Agency Portfolio (toned stat cards), Platform Costs (bars). Repeat one at phone width.
Reviewed by eye after the fixes: about a dozen screens. The others rely on the audit numbers and E2E.
Stats with no history stay plain: High pressure, Near/Reached/Paused, agencies by state, Warnings, Projected, Connect panel figures, reply rate, Pages monitored, Open moves.
