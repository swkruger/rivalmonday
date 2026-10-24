# phase-15c2b2 — client-page sweep (15c-2b part 2)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c2b2   **Base:** main @ 2fb4c106
**Plan/spec:** [lean plan](../superpowers/plans/2026-10-24-phase-15c2b2-client-page-sweep.md) (no new spec, Q1). Inputs: [2b spec](../superpowers/specs/2026-10-23-phase-15c2b-client-pages-design.md) D9–D15 · [15c-2 spec](../superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md) §4–5, §8 · [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §2–3 · pattern [15c-2a plan](../superpowers/plans/2026-10-23-phase-15c2a-page-fixes.md).

## Status (overwrite)
Plan owner-approved 2026-10-24 (incl. P1–P12); execution started.

## Next (overwrite)
Owner approves plan → Task 0 pre-flight → SDD.

## Interfaces this branch adds or changes
Planned: `lib/labels.ts` maps (MOVE_STATUS, EVENT_ROUTE, CAPTURE_STATUS, PAGE_TYPE, CADENCE, RECOMMENDATION_STATUS, LEVEL, SETUP_STEP_STATUS, CLIENT_PLAN_STATUS, AD_STATE, BRIEF_ITEM_STATUS); `lib/format` `formatMonth`, `localDay`, `formatCount`, `formatDate` `withYear: 'never'`; `lib/spend-copy.ts` `askQuotaText`; `@cs/engine` exports `ALERTS_PER_DAY`; `page-gates.ts` `GATE_EXEMPT`, `GATED_PATHS = ['.']`. No migration, no tool.

## Assumes from other branches
- **phase-16** (docs only, ON HOLD until 7 + 15 merge): rebases onto us; its container sweep/client restyle wait for 2b-2 (D10). No migration; its Assumes are stale.
- **phase-7c1** (executing, base 37b028ba, no migration): edits tools `my-usage`, `recommendations`, `reports`, `alert-queue`, `settings`, `workspace/scope.ts` (`requireVisibleClient`). 2b-2 stays UI-only on those; a new/changed tool needs a 7c1 isolation fixture from whichever merges second.
- **Migrations:** main at 0092; next free **0093**; nobody claims one.

## Decisions (owner-approved 2026-10-24)
- Q1 One branch, one lean plan (~16 tasks by route group; gates ratchet per task; full-`src` gate then heatmap last). No new spec (2b spec D9–D15 covers it).
- Q2 "Fixed" bar only; DS v1 rules for new UI only (D10); existing Cards stay for phase-16.
- Q3 No mockups (D11).
- Q4 Gates 1–4 over all of `src`, explicit escapes for non-UI code.
- Q5 P6 dedupe: keep as is (stays in BACKLOG).
- Q6 Guide P17 wording approved; `privacy` tip ends "Delete a conversation with the bin icon beside it and confirm. While conversations may be reviewed, the people named in that line can still read it."
- Q7 D12(d) quota copy on both client card and agency `questions-cell.tsx`.

## New backlog (target → item)
None yet.

## Owner verification steps
1. As a client owner of a client in another time zone than yours, open Changes, an alert and an evidence page: times carry the client's zone label ("CT"), and no date is in ISO form.
2. Changes at phone width (390 px): landing shows the list only, no row is announced as current; tapping a change opens the sheet.
3. Settings › Alert rules: type new thresholds and watch the band bar follow; Save appears only after a change; the page says "3 a day".
4. Settings › Delivery: change the alert mode, then Discard; deactivate a recipient and press Cancel — nothing happens; confirm — the row turns Inactive.
5. Competitors: "Stop tracking" asks first and Cancel keeps the competitor; the "Since" column reads "Oct 13".
6. Ask: with review off the composer says "Only you can see your conversations."; with review on it shows the review sentence; the Privacy tip ends with the new sentences.
7. Usage (client and agency): a client whose Ask limit is 0 reads "N used · Ask turned off by limit".
8. Reviews: open "Show as table" — cells show share, sentiment word and the ▲/▼ points; on a phone the chart scrolls sideways instead of shrinking.
9. Read the § 15c-2b-2 sign-off section and answer its owner decisions.

## Brief

### 1. Scope
Roadmap Phase 15 row: "15c-2b-2 (client-page sweep) … to be planned". **2b D9**: every `(app)/c/[clientId]/**` route + remaining client components to "fixed" (**15c-2 §4.1**: `StatusChip`+labels; `lib/format/*` in client zone (**C8**); `ConfirmDialog`; `SaveBar`; `Suspense`+`PageSkeleton`; labelled controls; no tip in `CardTitle`; empty copy; help key), routed items (§4.2), gates 1–4 over all `src` (**§5**), feed hex → token, **last** heatmap "Show as table" (§4.3). Plus D12(d), 7b1 files (D13). Tests per 2b §3: gate fixtures, help coverage, E2E only on behaviour change.
**2b-1 did** (0092): Ask soft delete + D12(a)(b)(c)(e); `compare_captures`, Changes `TabsLink` + `?tab=page`; evidence compare; `ListDetail` on Changes/Moves. Sweep items in those files were left (P15).
**2b-2 per route** (no client route uses `StatusChip`/`ConfirmDialog`/`SaveBar` yet; ~58 `.tsx`; 5 tips in `CardTitle`):
- Overview: `BAR` hex, place-id copy, `views/*` dates/status. Changes: `viewer.tsx` `formatFullUtc`, `feed.tsx`/`diff-text.tsx` hex, `aria-current` < `lg`. Moves: `move-card.tsx` "N signals", local `STATUS_LABEL`.
- Competitors + `[competitorId]` (`page.tsx:36,268`, `sections.tsx`, `timeline.tsx`, hex chip, `<Badge>`, `competitor-controls.tsx:498`, "Google place id"). Pricing `price-card.tsx` hex; Ads `ad-card.tsx`; Reviews `review-item.tsx`.
- Rankings (`page.tsx:35,226`, `scan-now-button`); Recommendations ("Effort L"); Briefs (`<Badge>`, tab overflow, BriefView/AlertView dates); Alerts/[id]; Reports/[id] (`report-view.tsx:6`, empty); Pitch snapshot `:40`; Evidence/[id] `:32,36`; Ask visibility line; Setup labels/a11y; Settings (alerts band bar, billing guide, delivery `<Badge>`, profile, `usage` quota).
- Outside gates: `components/{views,charts,rival,ask,help}`, `client-lists.tsx`, `prospect-landscape.tsx:48`, `charts/{line-chart,rank-trend}`, `formatWeekOf` callers (agency passes `tz:'UTC'`); full-`src` adds `app/api`, `lib`, `server`, top-level `app/*`.

### 2. Already built — reuse (`apps/web/src/` unless noted)
`@cs/ui`: `StatusChip`, `ConfirmDialog`, `SaveBar`, `Skeleton`, `Sheet`, `TabsLink(List)`, `theme.ts` `readableTextOn`. `lib/labels.ts` (`labelFor`, `REVIEW_/REPORT_/BRIEF_/ALERT_STATUS`, `EVIDENCE_KIND`, `CLIENT_AUDIENCE_MAPS`). `lib/format/*` (`formatDate`, `formatDateTime`, `formatRelative(…,{tz})`, `formatWeekOf`, `formatMoney`, `formatMiles`, `radiusOptions`). `server/viewer-tz.ts`. `lib/page-gates.ts` (`AREAS_2A/2B`, `GATED_PATHS`, `BADGE_ALLOW`, `ENUM_FIELDS`). `components/`: `page-header`, `page-skeleton`, `list-detail(-sheet)`, `whole-page-diff`, `prev-next`, `form-error`, `read-only` (`WriteGuard`), `radius-select`, `help/*`. Confirm pattern: `agency/settings/slack-teams/webhook-controls.tsx`. Tokens `--you`, `--chip-*`, `text-accent-text`.

### 3. Binding decisions
CLAUDE.md: miles UI/km stored; tz; no route `loading.tsx`; `PageHeader`+help key; reads = tools, writes = `runTool`; 404 refusals; no agency help to client roles. 15c C3, C8, C9, C10 (one copy sign-off). 15c-2 D4, D5, D8. 2b D9; **D10** today's tokens, DS v1 rules for *new* UI only, nothing in `packages/ui`; **D11** no mockups; D12(d) copy "{used} used · Ask turned off by limit"; D13; D15. 2b-1 P6, P15. Copy → `archive/phase-15c2-copy-signoff.md` § 15c-2b. Phase-16 owns the DS migration.

### 4. Backlog to fold in (verbatim)
- [ ] **15c-2b-2** client-page sweep (…): sweep `(app)/c/[clientId]/**` to "fixed" (chips, `lib/format/*` in the client's zone, confirms, `SaveBar`, `Suspense`+`PageSkeleton`, labelled controls, help keys; mobile mockups first), grep gates 1–4 over all `src` (extend `GATED_PATHS` beyond `AREAS_2B`). Routed items: changes viewer `formatFullUtc`, `competitors/[competitorId]/page.tsx:36`, `rankings/page.tsx:35,223`, `report-view.tsx:6`, `prospect-landscape.tsx:48`, `pitch-snapshot/page.tsx:40`, BriefView/AlertView mixed dates, briefs tab list overflow, Moves "N signals" → "N changes", Report empty state, "Google place id" label, Ask visibility line, alert-rules band bar, client billing guide "Not available", tips inside `CardTitle`, `formatWeekOf` caller, per-page REVIEW_STATUS maps; folded polish: feed hex → token, heatmap "Show as table" (`topic-heatmap.tsx`), `aria-current` on the auto-selected ListDetail row below `lg` with no sheet open, Ask quota 0 shows "N of 0" (6b (d), quota text D12(d)). After 7b1 (merged): sweeps `settings/usage` and rankings scan-now. Coordinate with **phase-16** (design system; same files) — *phase-15c2*
- [ ] Owner decision (P6, 15c-2b-1): message-keyed server dedupe for "save as recommendation" (changes `add_recommendation` input); today a reload shows the Save button again for an already-saved answer — *from 15c-2b-1*
- [ ] Owner question (15c-2b-1 sign-off Q2): client `privacy` tip (`help/copy/client.ts:325`) still ends "Delete a thread with the bin icon beside it."; add the P17 reviewer sentence and say "conversation"? — *from 15c-2b-1*
- D5 Polish on swept files: "Heatmap 'Show as table' cells unstyled and omit the delta; SVG text shrinks at phone width" — *5c-2*; "Feed brief pill hardcodes `text-[#B45309]` …; alert-rules '3 a day' text hard-coded" — *5c-1*; competitor-profile minors (dangling " · ", empty sources) — *5c-1/5c-2*.

### 5. Open questions for the owner
1. **Split?** a) one branch, one lean plan (~16 tasks by route group, gates ratchet per task, full-`src` gate then heatmap last), like 2a's 18 tasks (**rec.**); b) 2b-2a intelligence pages / 2b-2b details, Ask, setup, settings + full-`src` gate; c) separate gate-only sub-phase.
2. **DS v1 on swept pages?** a) "fixed" bar only; D10 rules for new UI; existing Cards stay for phase-16 (**rec.**); b) also Cards → sections on touched pages; c) none.
3. **Mockups** (backlog "mobile mockups first" vs D11)? a) none, D11 wins (**rec.**); b) only new pieces (alert-rules band bar, heatmap table); c) every phone page.
4. **Full-`src` gates beyond client pages** (`app/api`, `lib`, `server`, top-level `app/*`)? a) all of `src`, escapes for non-UI (**rec.**, §5); b) `.tsx` only; c) exclude `server`/`api`.
5. **P6 dedupe?** a) keep as is (**rec.**: tool/MCP change, outside a sweep); b) optional `sourceMessageId` on `add_recommendation` + unique index (0093); c) web-only check.
6. **Privacy tip (Q2) and P17 wording (Q1)?** a) "conversation" + P17 sentence (**rec.**); b) rename only; c) leave.
7. **D12(d) on the agency cell** (2a-area file `agency/settings/usage/questions-cell.tsx`)? a) both cells now (**rec.**, D12(d)); b) client card only.
