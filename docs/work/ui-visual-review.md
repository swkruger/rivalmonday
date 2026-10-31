# ui-visual-review - page-by-page visual review of apps/web: inputs, chart text, stat cards

**Kind:** polish   **Worktree:** ../CompetitorSpy-wt/ui-visual-review   **Base:** main @ c57c53b9
**Plan/spec:** none yet

## Status (overwrite)
Brief written, no code. Findings are from code, not screenshots.

## Next (overwrite)
Owner answers Brief 6, then `superpowers:brainstorming`.

## Interfaces this branch adds or changes
None yet. Next free migration: **0097**.

## Assumes from other branches
`site-polish` (no work file, migrations or tools) changes `components/shell/{sidebar,mobile-nav}`, `components/ask/{ask-card,ask-chat}`, `proxy.ts`, `@cs/ui` `index.ts`. `ask-chat`'s textarea is in scope: merge site-polish first.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

# Brief

## 1. Scope
Owner: inputs visible and uniform; fix graph text out of proportion or cut off; review page by page, section by section; maybe subtle colours on stat cards; ideally a background chart behind every stat. No roadmap or BACKLOG row.
93 pages: onboarding 5 (`/onboarding`, `/agency/*/new`, `/c/<id>/setup*`) · client 27 (`/c/<id>/*`) · agency 19 (`/agency/*`, 11 settings) · shared 5 (`/inbox`, `/paused`, `/kb`, `/settings/notifications`, `/e2e-throw`) · platform 18 (`/platform/*`) · auth/guest 19 (`/sign-*`, `/join`, `/oauth`, `/link-*`, `/start*`, `/sample`, `/u/*`, `/bot`, `/waitlist`).

## 2. Already built: reuse
**Inputs.** `@cs/ui` `Input` (h-9, ~82 uses, 39 files); `control-classes.ts` `nativeSelectClass`, `nativeInputClass`, `textareaClass`, `toolbarControlClass` (h-7). No `Textarea`/checkbox primitive; radix `Select` has 0 uses. Raw visible controls ~110 (59 select, 34 input, 18 textarea) + 26 checkboxes, 8 radios. All have a border recipe, so "invisible" must be judged on screenshots. Not uniform:
- Copied recipes: `platform/_components/mini-form.tsx:24` `fieldCls` (billing `codes`, `invite-links`, `plan-editor`; `client-limits`), `costs/_components/form-bits.tsx:7`, `competitors/[competitorId]/page-controls.tsx:10`, `save-recommendation-dialog.tsx`, `support-dialog`, `reset-ai-pause`.
- h-8: `waitlist-table.tsx:245`, `new-business-type.tsx:50`. No select chevron rule. Ad-hoc widths.
- Worst: `approvals/[briefId]/review-controls.tsx`, `recommendation-board.tsx`.

**Stats.** `Kpi`/`KpiStrip` via `components/stat-strip.tsx` on 10 surfaces; `Kpi` directly at `competitors/[competitorId]/page.tsx:143`. No ad-hoc tiles, no sparkline.

**Charts (predicted from geometry; confirm on shots).** Fixed viewBox + `w-full`: text scales with the container. `LineChart` 12 units = ~7 px at 390, ~23 px full width at 1440.
- `charts/line-chart.tsx` (W 600, L 32, R 12): `:141` last x label centred with 12 units' room clips; `:135` y ticks have 26 units, so `$1,250` (`pricing/history-card.tsx:41`), Spend (`overview-charts.tsx:46`), `100%` clip. Full width at `c/[id]/page.tsx:211`, `ads/page.tsx:65`. No direct end labels.
- `charts/rank-trend.tsx:74`: same x clip.
- `charts/topic-heatmap.tsx:54`: `minWidth: W` + `w-full`, so 1-3 businesses scale 2x+; `:36` cuts names at 16 chars.
- `costs/_components/monthly-chart.tsx:40`: ~1.8x. `onboarding/previews/timeline.tsx:4`: 12 -> ~8.6 px. Grids capped at 520 px: low suspicion.

**History behind stats.**
- Ready: platform overview + agency detail (`series`); costs spent/projected; Active ads (`get_ad_activity`, already on page); rating (`get_rating_trend`).
- New read tool needed: changes, price moves (dated events); billing/Connect MRR, seats, agency Clients (`agency_daily_stat`; tools return latest only).
- None: Alerts waiting, Briefs to approve, High pressure, Near/Reached/Paused, agencies by state, Warnings, fee. To check: other review stats; competitor detail.
- Brief `Scorecard`: frozen payload, baseline delta only.

**Screenshots.** `pnpm --filter @cs/web shots`: 64 entries at 1440 + 390, axe + overflow gate, `.shots/<label>/index.html`. E2E server and seed on the local test DB (5444); never alongside `e2e`. `signIn(page,email)` = outbox magic link; `admin@e2e.test` = agency + platform; `owner` = guest link. Gaps: ~30-40 pages, signed-in client role, thin seed. `cs_demo`: `pnpm demo:reset`, `demo:dev`, dev-panel sign-in; has chart data. `cs_dev`: real data; no prices, alerts or live brief.

## 3. Binding decisions
- **D-12:** "one frame split by vertical dividers (or bare on a band); label 13px muted → value 24px/600 tabular → delta pill". Rejected: "KPI tiles (cards)". 06: "**Don't:** a tile per KPI; colour the value". Value = ink.
- **Colour:** P4 "Colour is a signal, never decoration."; README "Colour only for action, selection, status, data, Friday"; 06 bans "decorative illustrations in the working UI".
- **Containers:** README "Sections first; frame only for table / grouped rows / preview / KPI strip"; "No shadow on static surfaces".
- **D-13:** "max two highlighted rivals"; "legend for ≥ 2 series + direct end labels"; "table view available"; "colour follows the entity". Axis text 12 px (09 § 5.4).
- **Inputs (D-15, 06):** "inputs 36px, 6px radius, `border.strong` #8796AB (3.01:1)"; textarea min 88 px (`textareaClass` = 80); Select "opens a `.rm-menu` list" (native differs).
- **Also:** tokens + `design-lint`; reads = `@cs/tools` tools, new tool => `ISOLATION_FIXTURES`; owner signs copy.

**Conflicts needing an owner amendment**
1. **Background chart:** no such mark in 04-06, 09; outside D-12's anatomy; D-13's legend + table view don't fit a cell: needs its own rule. Text contrast must hold.
2. **Colours:** per-stat cards were rejected; per-metric or decorative tint conflicts with P4/colour roles. Allowed: strip on a muted Band, status tints on deltas. New tints must be tested tokens that survive white-label `--you`.
3. **No evidence, no claim:** nothing invented or interpolated; NULL stays a gap.

## 4. Backlog to fold in (quoted clauses; L = line in main BACKLOG)
- L157 "design-lint gaps: […] narrow `ALLOW_HEX`/`ALLOW_AMBER` (chart files incl. topic-heatmap fills → tokens)" *phase-16*
- L156 "Phones (16f P1 deferred): […] 44 px touch targets" *phase-16*
- L159 "Client pages: applied-filter chips with ✕" *16c*
- L161 "Card-in-card reduced to plain wrappers, not traced across component files" *phase-16*
- L165 "pages import constants from `'use client'` modules (`knowledge/page.tsx` `selectClass`)" *phase-16*
- L183 "Field `htmlFor` leaves help text without `aria-describedby`" *16f*
- L186 "`--color-secondary-foreground` is still a literal" *15c-2a*
- L187 "13a: brand-aware chart check (`--you` = agency secondary may clash with rival orange #E05A2B)" *phase-16*
- L83 "client-limits input width classes" *7b1*
- L144 "\"Other\" series #94a3b8 fails dataviz checks" *15c-1*
- L244 "run dataviz skill on chart colours" *8c*
- L217 "profile's \"Open moves\" KPI link is unfiltered" *5c-1*
- L374 "`LineChart` edge cases" *5c-1*
- L52 "platform overview sums keep archived agencies' daily-stat rows" *7a* (skews traces)

## 5. In-flight
Only `site-polish` (see Assumes).

## 6. Open questions for the owner
1. **Split?** (a) Findings, then foundations (inputs, KPI, chart text), then page sweeps. (b) One branch. **Rec (a).**
2. **Stats with no history?** (a) Trace only on real history; others plain. (b) (a) + new reads for derivable stats. (c) (b) + record queue counts. Never fake. **Rec (b).**
3. **Colour?** (a) Neutral strip; colour only in the trace, by entity, + status tints. (b) Per-metric tints (largest amendment). (c) Muted Band only. **Rec (a).**
4. **Trace form?** (a) Faint area along the cell's lower edge. (b) Sparkline beside the figure. **Rec (a), mockup first.**
5. **Where?** (a) Every `StatStrip` except briefs. (b) Client + agency only. **Rec (a).**
6. **Screen data?** (a) `cs_demo` + E2E seed for empty states (needs harness config). (b) E2E seed only. (c) `cs_dev`. **Rec (a).**
7. **Coverage?** (a) All 93 pages at 1440 + 390, 1920 for charts, + signed-in client role. (b) Current 64. **Rec (a).**
8. **Selects?** (a) Keep native (GET forms need no JS), with shared primitives and a lint; amend 06. (b) Migrate to radix. **Rec (a).**
9. **Chart text?** (a) Measure the container: 12 px at any width, edge-aware labels. (b) Cap widths, more padding. **Rec (a).**
