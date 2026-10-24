# phase-15c2b2 — client-page sweep (15c-2b part 2)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c2b2   **Base:** main @ 2fb4c106
**Plan/spec:** none yet. Inputs: [2b spec](../superpowers/specs/2026-10-23-phase-15c2b-client-pages-design.md) D9–D15 · [15c-2 spec](../superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md) §4–5, §8 · [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §2–3 · pattern [15c-2a plan](../superpowers/plans/2026-10-23-phase-15c2a-page-fixes.md).

## Status (overwrite)
Kickoff brief written; nothing designed or built.

## Next (overwrite)
Owner answers Brief §5 → brainstorming → lean plan (no new spec expected).

## Interfaces this branch adds or changes
Expected: new `lib/labels.ts` maps; `GATED_PATHS` = all `src`. No migration, no tool (re-check in plan).

## Assumes from other branches
- **phase-16** (docs only, ON HOLD until 7 + 15 merge): rebases onto us; its container sweep/client restyle wait for 2b-2 (D10). No migration; its Assumes are stale.
- **phase-7c1** (executing, base 37b028ba, no migration): edits tools `my-usage`, `recommendations`, `reports`, `alert-queue`, `settings`, `workspace/scope.ts` (`requireVisibleClient`). 2b-2 stays UI-only on those; a new/changed tool needs a 7c1 isolation fixture from whichever merges second.
- **Migrations:** main at 0092; next free **0093**; nobody claims one.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

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
