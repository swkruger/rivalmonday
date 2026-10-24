# Phase 15c-2b-2 — Client-page sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`): interfaces and behaviour are binding; implementers write the code. Steps use `- [ ]`.

**Goal:** Every `(app)/c/[clientId]/**` route and the client components it renders meets the 15c-2 §4.1 "fixed" bar (chips + labels, `lib/format/*` in the client's zone, confirms, `SaveBar`, labelled controls, no tip in `CardTitle`, empty copy, help keys), the routed BACKLOG items land, grep gates 1–4 run over all of `apps/web/src`, and the heatmap "Show as table" is finished.
**Architecture:** UI-only. No migration, no new or changed `@cs/tools` tool. New label maps in `lib/labels.ts`, a few pure formatters in `lib/format/*`. Pages are swept by route group; each task appends its paths to `AREAS_2B` in `lib/page-gates.ts` (ratchet); T16 turns the gates on for the whole `src`.
**Spec:** no new spec (Q1). [2b spec](../specs/2026-10-23-phase-15c2b-client-pages-design.md) D9–D15 + §3; [15c-2 spec](../specs/2026-10-23-phase-15c2-page-fixes-design.md) §4.1–4.3, §5, §8; [15c spec](../specs/2026-10-21-phase-15c-page-fixes-design.md) §2 (C3, C8, C10). Brief + owner decisions: `docs/work/phase-15c2b2.md`. Findings: `docs/research/2026-10-18-phase-15-ux-audit.md` §2.3–2.4 (the "15c" items for client pages).

## Global constraints
- Brand tokens only (`packages/ui/src/styles.css`); **nothing changes in `packages/ui`** (Q2). Tailwind arbitrary hex in a swept file moves to an existing token when one fits (map in T1); hex that has no token stays and is listed in the T18 sign-off doc for phase-16. SVG chart palettes (validated with the dataviz skill) stay.
- **C8 zone rule:** client pages format with the client's `profile.timezone`; a time shows a zone label (`formatDateTime(…, { tz, zoneLabel: true })`); date-only values (`deliveryDate`, `periodStart/End`, `nextChargeDate`, `endsOn`) use `{ tz: 'UTC' }`. Components shared with agency pages take a `timezone` prop (agency pages pass `await viewerTimeZone()`). One date style: "Oct 21" / "Oct 21, 2025"; no ISO dates/weeks in UI.
- Status → `StatusChip` + `labelFor(<MAP>, v)` (`@/lib/labels`); no `<Badge` (gate 1), no local status maps. Miles in UI.
- Every irreversible action → `ConfirmDialog` with row-keyed result lines hoisted out of the dialog (pattern `agency/alerts/alert-controls.tsx` `AlertList`); multi-field settings forms → `SaveBar` (pattern `app/(app)/settings/notifications/contact-form.tsx`; React 19 resets forms — keep `onReset` / controlled fields per `apps/web/CLAUDE.md`).
- Every sweep task applies the §4.1 checklist to **every** file it owns (labels + `aria-describedby` on hints/errors, tips beside — not inside — `CardTitle`, empty copy), not only the bullets listed. Audit §2.3–2.4 "15c" items already fixed on `main` are noted "already fixed" in the task report, not re-done.
- **DS v1 rules apply only to new UI** (Q2/D10): the alert-rules band bar (T14) and the heatmap table (T17): sections, no new shadows, dot/badge/chip grammar, Inter 400/500/600, ink headings. Existing Cards stay (phase-16).
- Reads stay `callTool`/`tryCallTool` of existing tools; writes `runTool`; refusals 404. Client components never import runtime values from `@cs/tools` (pass them from the server page).
- No route `loading.tsx`. In-page `<Suspense fallback={<PageSkeleton/>}>` only where T5/T7 say (P3).
- Help: no new pages; every `PageHeader` page keeps a help key + guides; copy changes update `help/copy/client.ts` and `docs/help/pages/client.*.md` in the same task; client roles never get agency help.
- All new/changed user-facing strings → `docs/archive/phase-15c2-copy-signoff.md` § "15c-2b-2" (T18).
- Read `docs/gotchas-cross-cutting.md` and `apps/web/CLAUDE.md`, `packages/ui/CLAUDE.md` first. **Test scope:** implementers run focused tests (`pnpm --filter @cs/web exec vitest run <pattern>`) + `pnpm --filter @cs/web typecheck`; reviewers run none; `pnpm test:affected --base main` + `pnpm --filter @cs/web e2e:affected --base main` run **once**, at the final whole-branch review. E2E specs are edited only where a swept page's visible behaviour changes (listed per task).
- LF only; never stage `.env`, `.claude/`, `App/`, `.superpowers/`; commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents: their own model).

## Decisions
Owner decisions Q1–Q7 (2026-10-24, `docs/work/phase-15c2b2.md`) bind: **Q1** one branch/plan by route group, gates ratchet per task, full-`src` gate second-to-last, heatmap last, no new spec; **Q2** "fixed" bar only, DS v1 for new UI only, nothing in `packages/ui`; **Q3** no mockups; **Q4** gates 1–4 over all `src` with named escapes for non-UI code; **Q5** no P6 dedupe (stays in BACKLOG); **Q6** privacy tip wording (verbatim in T12), P17 guide wording approved; **Q7** D12(d) copy on both usage cells (T15). Plus 2b D10–D15, 15c C3/C8/C10, 15c-2 D4/D5/D8.
Planner calls (marked **[P]**; owner may overrule at approval):
- **P1 Hex → token map** (T1 test): `bg-[#FEE2E2] text-[#B91C1C]` → `bg-chip-danger-bg text-chip-danger-text`; `bg-[#DCFCE7] text-[#15803D]` → `bg-chip-success-bg text-chip-success-text`; `bg-[#FFF3DC]` (+ `text-[#B45309]`/`text-accent-text`) → `bg-chip-warning-bg text-accent-text`; `bg-[#DC2626]` → `bg-danger`; `text-[#3B2300]` → `text-amber-text`; `text-[#E2E8F0]` → `text-muted-surface-2`; `bg-[#FDE8E8] text-[#B42318]` → chip danger. Where a value is a status, `StatusChip` replaces the span instead.
- **P2 `aria-current` below `lg`** (backlog): list rows (Changes `FeedList`, `MoveCard`) set `aria-current="true"` only when the URL names the item (`?event=`/`?move=`); the auto-selected first row keeps its highlight via `lg:` classes only. Desktop screen readers lose the "current" mark on the auto-selected row (accepted: nothing was chosen).
- **P3 Suspense scope:** only two sections stream — the Pricing price-history chart (its own `get_price_history` read) and the competitor profile Timeline card (`get_competitor_timeline`). Other pages keep one `Promise.all` (their header needs the data).
- **P4 "Google Place ID"** replaces "Google place id" in UI copy, help copy and guides (Google's term). Tool refusal strings (`packages/tools/src/client-input.ts:52` "Google place id looks wrong") stay (no tool change) → BACKLOG item.
- **P5 Ask visibility line** (audit M 15b): one permanent line under the composer: review allowed → the existing `disclosureCopy` sentence (unchanged); not allowed → "Only you can see your conversations." The thread list's empty line drops "Only you can see them.".
- **P6 "Week of" = `formatWeekOf(deliveryDate, { tz: 'UTC' })` everywhere** (BriefView, BriefLinkList, brief page title), as the agency pages do.
- **P7 `ALERTS_PER_DAY`** is exported from `@cs/engine`'s index (one line in `packages/engine/src/index.ts`); the alert-rules page renders it instead of "3" (backlog 5c-1). Not a tool change.
- **P8 Owner label on recommendations:** client roles see "For you" / "Agency"; agency roles see "Client" / "Agency" (audit M 15c).
- **P9 Ads competitor filter** lists every tracked competitor (`list_tracked_competitors`, existing tool), not only those with ads (audit M 15c).
- **P10 Band bar** (T14) has labels and ranges, no example changes (no evidence-backed examples exist to quote); it follows the typed values live.
- **P11 Moves tip key stays `client.moves.signals`** (title/body reworded); renaming the key would ripple the help tests for no user gain.
- **P12 Gate exemptions** (Q4) are whole-file entries `GATE_EXEMPT: Record<path, reason>`; the per-line `format-gate:` escape stays for lines in UI files.

## File structure
- **web lib:** `apps/web/src/lib/{labels.ts,labels.test.ts,page-gates.ts,page-gates.test.ts,spend-copy.ts,spend-copy.test.ts}`, `lib/format/{date.ts,date.test.ts,index.ts}`, create `lib/format/number.ts` (+ `number.test.ts`).
- **engine:** `packages/engine/src/index.ts` (export only).
- **client pages:** every file under `apps/web/src/app/(app)/c/[clientId]/**` (+ their `*.test.tsx`).
- **components:** `components/{client-lists,starting-point-card,stat-card,pressure-badge,client-home-basic,prospect-landscape,place-summary,services-area-summary,client-profile-form,recommendation-board}.tsx`, `components/views/{brief-view,alert-view,report-view}.tsx` (+ `views.test.tsx`), `components/charts/{line-chart,rank-trend,topic-heatmap}.tsx`, `components/rival/{signal-pills,tier-chip,rated-label}.ts(x)`, `components/ask/{ask-chat,thread-list}.tsx`, `components/runbook/item-card.tsx` (LEVEL map only), `app/(app)/agency/settings/usage/questions-cell.tsx`, `app/(app)/agency/prospects/[clientId]/page.tsx` (passes `timezone`).
- **help:** `apps/web/src/help/copy/client.ts`, `docs/help/pages/client.*.md` (named per task); help tests `app/(app)/c/[clientId]/help-client-{a,b,c}.test.tsx`, `help/copy/copy.test.ts`, `packages/tools/src/kb/help-content.test.ts` (string expectations only).
- **e2e (edit only):** `apps/web/e2e/{starting-point,client-setup,workflow}.spec.ts`, others only if a locator breaks.
- **docs:** `docs/archive/phase-15c2-copy-signoff.md` (§ 15c-2b-2), `docs/work/phase-15c2b2.md`, `apps/web/CLAUDE.md` (gates line).

## Dependencies on in-flight work (re-check in T0)
- **phase-7c1** (executing; no migration): edits tools `my-usage`, `recommendations`, `reports`, `alert-queue`, `settings`, `api-tokens`, `workspace/scope.ts`, plus `apps/web/e2e/{ai-connections.spec,seed}.ts`. We change **no tool**; we read `get_my_usage`, `list_recommendations`, `get_trend_report`, `list_tracked_competitors` unchanged. If 7c1 merges first, rebase before T15 (usage) and re-run T0's conflict scan on `e2e/seed.ts`. **Discovered tool needs:** none. Two would-be tool changes are deferred to BACKLOG instead: the "Google place id" refusal string (P4) and a contact link on client billing (`get_my_billing` has no agency contact; audit M 15c). A future tool change there needs a 7c1 isolation fixture from whichever merges second.
- **phase-16** (on hold, docs only): rebases onto us (D10); touches no code today.
- **phase-7b1** (merged 37b028ba): `settings/usage/page.tsx`, rankings `scan-now-button.tsx` / `spend_paused` are on `main` and swept here (D13).
- **Migrations:** none (main at 0092; nobody claims 0093).

## Review focus
1. **Wrong day on client pages.** A client in America/Los_Angeles with an event at `2026-10-19T03:00Z` must read "Oct 18"; date-only values must never shift a day in any zone; chart labels and timeline month groups use the same zone. Tests: T1 `localDay in America/Los_Angeles is the previous day`, T3 `feed row date uses the client zone`, T10 `BriefView week of a date-only deliveryDate is the same in Pacific/Kiritimati`.
2. **Agency-only data reaching client roles through new chips/labels** (score, brief status, dropped items, "Client" owner label, upsell). Tests: T10 `client role sees no status chip, score or dropped item`, T9 `client role sees "For you", agency sees "Client"`, T1 `new client-facing maps are in CLIENT_AUDIENCE_MAPS` (terminology scan).
3. **SaveBar forms losing work or messages.** After a refused save the typed values stay; after a success the bar hides and the result line survives `revalidatePath`. Tests: T14 `delivery: refused save keeps the chosen mode; success hides the bar and keeps "Saved"`, T15 `profile form keeps typed keywords after a refused save`.
4. **ConfirmDialog conversions** (stop tracking, deactivate recipient): Cancel never calls the action; a refusal shows under the right row only and clears on the next attempt. Tests: T4 `stop tracking: cancel does nothing; a refusal shows on that row only`, T14 `deactivate: cancel does nothing`.
5. **Full-`src` gate blind spots.** An exemption must not hide UI, and non-page folders (`app/api`, `server`, `lib`) must really be scanned. Tests: T16 `GATE_EXEMPT entries are existing non-.tsx files with a reason`, `a planted <Badge in a components/ fixture path is flagged`, `scanPaths(GATED_PATHS) covers app/api and server files`.

---

### Task 0: Pre-flight
- [ ] `git fetch`; `git rebase main` in the worktree; `pnpm install` (background). Test DB `cs_phase_15c2b2_test` is already in the worktree `.env` and its `pgboss` schema exists: run `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once to confirm.
- [ ] Re-check Dependencies: `git branch --no-merged main`; `git diff --stat main...phase-7c1` and `main...phase-16`; did either merge? Any web file overlap with this plan's File structure → note it here.
- [ ] Conflict scan: every path in this plan exists (`git ls-files` per Files line; `number.ts` is a create); re-run the gate scan over all of `src` (a scratch script importing `scanPaths(['.'])`) and record the hit count per file (expected on 1ca79f1d: 42 hits in 26 files, all under the client area or `components/{views,charts,rival}`, `client-lists`, `place-summary`, `prospect-landscape`, plus `lib/page-gates.ts:76`). Re-verify the cited lines below still say what the plan claims (`rg -n "formatFullUtc|STATUS_LABEL|bg-\[#" apps/web/src/app/(app)/c`). Tips inside `CardTitle` (multi-line scan): 4 at planning (`competitors/page.tsx:69`, `competitor-controls.tsx:277`, `[competitorId]/page.tsx:206`, `settings/delivery/page.tsx:58`); the brief said 5 — record any fifth found.
- [ ] Confirm type exports used by T1 (`MoveStatus`, `RecommendationStatus` from `@cs/db`; `CaptureStatus`, `PageType`, `Cadence` from `@cs/core`; `StepStatus` from `@cs/tools`) and that `ALERTS_PER_DAY` is not yet exported from `@cs/engine`.
- [ ] Record findings under this task; commit `docs(phase-15c2b2): pre-flight`.

### Task 1: Shared labels, formatters and token map
**Goal:** Every map and helper later tasks need, so route tasks only consume them.
**Files:** modify `apps/web/src/lib/labels.ts` (+ `labels.test.ts`), `lib/format/date.ts` (+ `date.test.ts`), `lib/format/index.ts`, create `lib/format/number.ts` (+ `number.test.ts`), `lib/spend-copy.ts` (+ `spend-copy.test.ts`), `packages/engine/src/index.ts`, `components/charts/{line-chart,rank-trend}.tsx` (+ tests), `components/runbook/item-card.tsx`, `lib/page-gates.ts`.
**Interfaces:**
```ts
// lib/labels.ts (labels are decided copy for sign-off)
export const MOVE_STATUS: LabelMap<MoveStatus | 'closed'> = { emerging: e('Emerging', 'info'), active: e('Active', 'warning'), fading: e('Fading'), closed: e('Closed') };
export const EVENT_ROUTE: LabelMap<'alert' | 'brief' | 'archive'> = { alert: e('Alert', 'danger'), brief: e('Brief', 'warning'), archive: e('Archived') };
export const CAPTURE_STATUS: LabelMap<CaptureStatus> = { ok: e('Captured', 'success'), unchanged: e('No change since last capture'), blocked: e('Blocked by the site', 'danger'), robots_disallowed: e('Site asks not to be monitored', 'warning'), vendor_error: e('Data provider error', 'danger'), timeout: e('Timed out', 'warning'), error: e('Failed', 'danger') };
export const PAGE_TYPE: LabelMap<PageType> = { home: e('Home page'), pricing: e('Pricing'), service: e('Service'), service_area: e('Service area'), promo: e('Promotion'), careers: e('Careers'), team: e('Team'), about: e('About'), contact: e('Contact'), blog: e('Blog'), other: e('Other') };
export const CADENCE: LabelMap<Cadence> = { daily: e('Daily'), weekly: e('Weekly') };
export const RECOMMENDATION_STATUS: LabelMap<RecommendationStatus> = { todo: e('To do'), in_progress: e('In progress', 'info'), done: e('Done', 'success'), dismissed: e('Dismissed') };
export const LEVEL: LabelMap<'L' | 'M' | 'H'> = { L: e('Low'), M: e('Medium'), H: e('High') };   // replaces runbook item-card LEVEL_WORD
export const SETUP_STEP_STATUS: LabelMap<StepStatus> = { todo: e('Not started'), running: e('Running', 'info'), done: e('Done', 'success'), skipped: e('Skipped'), blocked: e('Needs attention', 'warning') };
export const CLIENT_PLAN_STATUS: LabelMap<'paused' | 'not_set_up' | 'active' | 'payment_needed' | 'invited' | 'cancelled' | 'unavailable'> = { paused: e('Paused', 'warning'), not_set_up: e('Not set up'), active: e('Active', 'success'), payment_needed: e('Payment needed', 'danger'), invited: e('Awaiting payment setup', 'info'), cancelled: e('Cancelled'), unavailable: e('Not available') };
export const AD_STATE: LabelMap<'active' | 'ended'> = { active: e('Active', 'success'), ended: e('Ended') };
export const BRIEF_ITEM_STATUS: LabelMap<'active' | 'dropped'> = { active: e('Included'), dropped: e('Dropped') };   // agency-only
// CLIENT_AUDIENCE_MAPS += MOVE_STATUS, EVENT_ROUTE, CAPTURE_STATUS, PAGE_TYPE, CADENCE, RECOMMENDATION_STATUS, LEVEL, SETUP_STEP_STATUS, CLIENT_PLAN_STATUS, AD_STATE
// lib/format/date.ts
export function formatDate(v, o: { tz: string; withYear?: 'auto' | 'always' | 'never'; now?: Date }): string;   // + 'never' for chart ticks
export function formatMonth(v: string | Date, o: { tz: string; style?: 'short' | 'long'; now?: Date }): string; // "Oct 2026" / "October 2026"; 'YYYY-MM' input = that month (no shift)
export function localDay(v: string | Date, tz: string): string;   // "2026-10-18": the calendar day in tz (keys, chart labels); date-only input unchanged
// lib/format/number.ts
export function formatCount(n: number): string;   // "1,234" (en-US grouping, max 0 decimals unless n is fractional: up to 2)
// lib/spend-copy.ts (D12(d), decided copy)
export function askQuotaText(q: { used: number; quota: number }): string;   // quota 0 → `${used} used · Ask turned off by limit`; else `${used} of ${quota}`
// packages/engine/src/index.ts
export { ALERTS_PER_DAY } from './alerts/route';
```
**Behaviour:**
- `LineChart` axis/tooltip labels: week ISO day → `formatDate(iso, { tz: 'UTC', withYear: 'never' })`; month `'YYYY-MM'` → `formatMonth(ym, { tz: 'UTC' })`; delete the local `shortDate`/`monthLabel` (`line-chart.tsx:70-72`). `rank-trend.tsx:9` the same. Labels arrive as calendar days, so `UTC` is the no-shift zone, not a viewer zone.
- `item-card.tsx` imports `LEVEL` (delete `LEVEL_WORD`); output unchanged ("Effort: Low").
- Append `components/charts/line-chart.tsx`, `components/charts/rank-trend.tsx` to `AREAS_2B`.
- Follow pattern: existing maps in `labels.ts` (typed keys from DB/core unions).
**Tests (TDD):** `every new map value is labelled and sentence case` (extend the existing loop); `new client-facing maps are in CLIENT_AUDIENCE_MAPS` (identity check per map); `formatMonth('2026-10', { tz: 'UTC' }) is "Oct 2026"`, `long style "October 2026"`, `year shown for another year`; `localDay('2026-10-19T03:00:00Z', 'America/Los_Angeles') is 2026-10-18`; `localDay of a date-only value is unchanged`; `withYear never drops the year`; `formatCount(1234) is "1,234"`; `askQuotaText({used: 4, quota: 0}) is "4 used · Ask turned off by limit"`, `({used: 4, quota: 50}) is "4 of 50"`; `line-chart ticks read "Oct 12" not ISO` (existing test file); `ALERTS_PER_DAY is exported from @cs/engine and equals 3`.
**Done when:** `pnpm --filter @cs/web exec vitest run labels format spend-copy line-chart rank-trend item-card page-gates`, `pnpm --filter @cs/engine exec vitest run index` (or a one-line import test in web), `pnpm --filter @cs/web typecheck`.

### Task 2: Overview
**Goal:** §4.1 on the Overview and its pieces; audit H/M 15c items.
**Files:** `app/(app)/c/[clientId]/{page.tsx,overview-kpis.ts}` (+ tests), `components/{client-lists,starting-point-card,stat-card,pressure-badge,client-home-basic}.tsx` (+ tests).
**Behaviour:**
- `BAR.high` `bg-[#DC2626]` → `bg-danger` (`page.tsx:39`); `stat-card.tsx:12-14`, `pressure-badge.tsx:2` per P1.
- Open recommendations' status line (`page.tsx:208`) → `StatusChip` + `RECOMMENDATION_STATUS`.
- `StartingPointCard` renders inside the Overview's card section (`cardCls`, as its siblings); its "Review it" link goes to `/agency/approvals/<id>` of the `starting_point` brief from `briefs.items` (pass `reviewHref`), falling back to `/agency/approvals` if none is listed.
- Ad activity chart gets a full-width row (audit H "unreadable at ⅓ width"); Moves + Recommendations share a 2-column row (`lg:grid-cols-2`).
- `BriefLinkList` (`client-lists.tsx:15-20`): "Week of {formatWeekOf}" / "Starting point" (P6), status → `StatusChip` + `BRIEF_STATUS` (agency only, as today); `AlertLinkList` empty "No alerts." stays.
- Append `app/(app)/c/[clientId]/page.tsx`, `app/(app)/c/[clientId]/overview-kpis.ts`, `app/(app)/c/[clientId]/layout.tsx`, `app/(app)/c/[clientId]/help`, `components/client-lists.tsx`, `components/starting-point-card.tsx`, `components/stat-card.tsx`, `components/pressure-badge.tsx`, `components/client-home-basic.tsx` to `AREAS_2B`.
**Tests (TDD):** `pressure bar uses bg-danger for high` ; `open recommendation shows an "In progress" chip`; `starting point review link names the brief`; `BriefLinkList reads "Week of Oct 12" and a "Sent" chip for agency, no chip for client`; `stat card pills use chip tokens (no bg-[#)`.
**Done when:** `pnpm --filter @cs/web exec vitest run "c/\[clientId\]/(page|overview)" client-lists starting-point stat-card pressure-badge page-gates`, typecheck.

### Task 3: Changes and Moves
**Goal:** Viewer, feed, diff text and Moves "fixed"; backlog `formatFullUtc`, feed hex, `aria-current` < `lg`, Moves "N signals" → "N changes".
**Files:** `app/(app)/c/[clientId]/changes/{viewer,feed,diff-text,page,feedback-buttons}.tsx`, `moves/{page,move-card}.tsx` (+ tests), `help/copy/client.ts` (`client.moves.signals` tip), guide `docs/help/pages/client.moves.md:10,12`, `help-client-*.test.tsx` (tip title expectations).
**Behaviour:**
- `viewer.tsx:20-22` `formatFullUtc` deleted; "Captured" → `formatDateTime(capturedAt, { tz: profile.timezone, zoneLabel: true })` (pass `timezone` into the viewer); "Status" (`:86`) → `StatusChip` + `CAPTURE_STATUS`; "Part of moves" links (`:281`) read `{label} · {MOVE_STATUS label}`.
- `RoutePill` (`feed.tsx:14-31`) → `StatusChip` + `EVENT_ROUTE` (keeps its `aria-label` "Score {n}, routed to {label lowercased}" via `title`/`sr-only`); deletes `ROUTE_LABEL`/`ROUTE_TONE` (backlog `text-[#B45309]`). `timeline.tsx` (T5) keeps importing `RoutePill`.
- Feed row channels (`feed.tsx` row meta) → `channelLabel(c)` (`@cs/tools` server import; feed is a server module).
- `diff-text.tsx:13,17` hex → chip danger/success tokens (P1).
- P2: `FeedList` takes `currentId` (= `p.event ?? null`) for `aria-current`, `selectedId` for the `lg:` highlight.
- `FactorBar` `aria-label` reads "{label} {value}" (audit H 15b leftover only if still bare "0.40").
- Moves: `move-card.tsx:12` `STATUS_LABEL` deleted → `MOVE_STATUS` label (text stays in the meta line; the tile colour is unchanged); `:44` → `` `${n} change${n === 1 ? '' : 's'}` `` ("Emerging · 3 changes over 21 days · confidence 55%"). `MoveCard` takes `current` (P2) besides `selected`; Overview passes `current={false}`.
- Tip `client.moves.signals` (P11): title "Changes behind a move", body "A move is backed by changes: “3 changes” means three changes by this competitor fit the pattern. The list shows each one with its evidence. They are not the signal pills on the Competitors page." Guide lines 10/12 say "3 changes" / "**Changes** on a move are the ones that support it."
- Append `app/(app)/c/[clientId]/changes`, `app/(app)/c/[clientId]/moves` to `AREAS_2B`.
**Tests (TDD):** `move card reads "Emerging · 3 changes over 21 days · confidence 55%"` (update `move-card.test.tsx:26`); `moves: auto-selected card has no aria-current, ?move card has it`; `captured time shows the client zone label, not toUTCString`; `capture status "robots_disallowed" reads "Site asks not to be monitored"`; `route pill is a status chip with the score aria-label`; `channels render as labels (Website, Google ads)`; `auto-selected row has no aria-current; ?event row has aria-current="true"`; `feed row date uses the client zone` (Review focus 1).
**Done when:** `pnpm --filter @cs/web exec vitest run changes moves help-client page-gates`, typecheck.

### Task 4: Competitors list and controls
**Goal:** §4.1 on `/competitors`; confirms; tips out of `CardTitle`.
**Files:** `app/(app)/c/[clientId]/competitors/{page,competitor-controls,actions,search-state}.ts(x)` (+ tests), `components/rival/{signal-pills,tier-chip,rated-label}.ts(x)` (+ tests).
**Behaviour:**
- Tips leave `CardTitle` (`page.tsx:69` "Tracked competitors", `competitor-controls.tsx:277` "Suggested competitors"): `CardHeader` holds `<CardTitle>` + the `HelpTip` side by side.
- `TrackedCompetitorsTable` takes `timezone`; "Since" (`:498`) → `formatDate(addedAt, { tz })`.
- `RemoveCompetitorButton` (`:405`) → `ConfirmDialog` (title "Stop tracking {name}?", body unchanged, confirm "Stop tracking", tone danger, `fields` clientId/competitorId); the row-keyed refusal line renders under the row, outside the dialog (pattern `AlertList`).
- `:311` "Your account manager can look for more competitors for you." → `<HelpText text="{agency} can look for more competitors for you." />`.
- Bulk bar (`:344-356`) `text-[#E2E8F0]` → `text-muted-surface-2`; `disabled:bg-[#CBD5E1]` stays (no token; listed for phase-16).
- `signal-pills.tsx:13` `text-[#B45309]` → `text-accent-text` with `bg-chip-warning-bg`; `:21` `toLocaleString` → `formatCount`. `ratedLabel(iso, tz)` → "Rated {formatDate(iso, { tz })}" ("Rated Oct 13", client zone); callers pass `profile.timezone`.
- Append `app/(app)/c/[clientId]/competitors/page.tsx`, `competitors/competitor-controls.tsx`, `competitors/actions.ts`, `competitors/search-state.ts`, `components/rival` to `AREAS_2B`.
**Tests (TDD):** `tracked table "Since" reads "Oct 13" in the client zone`; `stop tracking: cancel does nothing; a refusal shows on that row only` (Review focus 4); `tracked competitors title has no tip inside CardTitle` (`querySelector('[data-slot=card-title] button')` is null); `empty-room line names the agency, never "account manager"`; `ratedLabel("2026-10-13T02:00Z", "America/Chicago") is "Rated Oct 12"`.
**E2E:** none (no flow clicks Remove).
**Done when:** `pnpm --filter @cs/web exec vitest run "competitors/(page|competitor-controls)" rival page-gates`, typecheck.

### Task 5: Competitor profile
**Goal:** `/competitors/[competitorId]` "fixed"; backlog `page.tsx:36,268`; 5c minors.
**Files:** `app/(app)/c/[clientId]/competitors/[competitorId]/{page,sections,timeline,page-controls,source-status}.ts(x)` (+ tests).
**Behaviour:**
- Delete local `fmtDate` (`page.tsx:36-37`), `fmt` (`sections.tsx:5`), `monthLabel`/`shortDate` (`timeline.tsx:12-13`): `formatDate(…, { tz })`, `formatMonth(…, { tz, style: 'long' })`; timeline month groups key on `localDay(at, tz).slice(0, 7)`.
- Pages table (`:265-270`): `pageType` → `PAGE_TYPE`, `cadence` → `CADENCE`, last captured → `formatDate`, "Inactive" `<Badge>` → `StatusChip` neutral. `AddPageForm` options show `PAGE_TYPE` labels (values unchanged; labels passed from the page).
- "Collection status" tip out of `CardTitle` (`:206`); source line `formatRelative(lastRunAt, now, { tz })`; "· paused" → "· Paused" chip-free text kept.
- "Site blocks monitoring" (`:169`) → `StatusChip` danger. Timeline move status (`timeline.tsx:39`) → `StatusChip` + `MOVE_STATUS`.
- KPI rating: no "— ★" — show "No rating yet" when `rating` is null (audit M 15c).
- `PricesSection`: drop cells with no prices; hide "See pricing" when there are none (BACKLOG 5c minors).
- P3: the Timeline card is an async `TimelineCard` (own `get_competitor_timeline` read) inside `<Suspense fallback={<PageSkeleton cards={1} />}>`, after the access-checking reads.
- Append `app/(app)/c/[clientId]/competitors/[competitorId]` to `AREAS_2B`.
**Tests (TDD):** `pages table shows "Home page" and "Weekly", no raw enums`; `inactive page is a status chip`; `timeline groups by the client's month (a 2026-11-01T03:00Z item is October in Chicago)`; `no "— ★" when the rating is missing`; `prices section hides See pricing with no prices`; `collection status tip sits beside the title`.
**Done when:** `pnpm --filter @cs/web exec vitest run "competitors/\[competitorId\]" page-gates`, typecheck.

### Task 6: "Google Place ID" (P4)
**Goal:** One plain label for the place id across UI, help and guides.
**Files:** `competitors/competitor-controls.tsx:285,394`, `components/client-profile-form.tsx:97`, `setup/steps/business-step.tsx:180-182`, `reviews/self-notice.tsx:8`, `overview-kpis.ts:61` (+ their tests), `help/copy/client.ts:249`, guides `client.{competitors,overview,rankings,reviews,settings.profile,setup}.agency.md`; tests `help/copy/copy.test.ts`, `packages/tools/src/kb/help-content.test.ts:239,473`; e2e `client-setup.spec.ts:131`, `workflow.spec.ts:28-42`.
**Behaviour:**
- Visible text "Google place id" → "Google Place ID" (labels keep "(optional)" where they have it); sentence forms "a Google place id" → "a Google Place ID". Field ids/names (`placeId`) unchanged. `business-step.tsx:55` `ADVANCED_ERROR` regex stays case-insensitive (matches the unchanged tool refusal).
- Agency-only term gates (`/place id/i`) keep matching (case-insensitive) — no change to those regexes.
**Tests (TDD):** update expectations to "Google Place ID" (`business-step.test`, `competitor-controls.test`, `self-notice.test`, `overview-kpis.test`, `help-content.test` toContain); `no "place id" in lower case in client UI copy` (grep test over the files above).
**E2E:** `client-setup.spec.ts` `getByLabel('Google Place ID')`; `workflow.spec.ts` text.
**Done when:** `pnpm --filter @cs/web exec vitest run competitor-controls business-step self-notice overview-kpis copy help-client`, `pnpm --filter @cs/tools exec vitest run kb/help-content`, typecheck.

### Task 7: Pricing, Ads, Reviews
**Goal:** §4.1 on the three insight pages.
**Files:** `app/(app)/c/[clientId]/pricing/{page,price-card,format,history-series}.ts(x)`, `ads/{page,ad-card}.tsx`, `reviews/{page,review-item,rating-mix,self-notice,trend-series}.ts(x)` (+ tests); `components/place-summary.tsx`; guides `client.reviews.{agency,client}.md` only if wording changes.
**Behaviour:**
- Pricing: `CHANGE_TONE` (`price-card.tsx:8`) and the PROMO span (`:43`) per P1; "PROMO" → "Promo"; rows get a trailing `ChevronRight` (`aria-hidden`) so they read as links (audit M 15c). `format.ts` `money` → `formatMoney` (so "$89.50", not "$89.5"). Chart `formatValue` (`page.tsx:124`) → `formatMoney(Math.round(v))`. P3: the history chart block is an async component with its own `get_price_history` read in `<Suspense fallback={<PageSkeleton cards={1} />}>`.
- Ads: `ad-card.tsx:3` `fmt` → `formatDate(…, { tz })` (prop `timezone`); active/ended span (`:18`) → `StatusChip` + `AD_STATE`. P9: the competitor filter options come from `list_tracked_competitors`. The three filter `<select>`s keep their wrapping `<label>`s.
- Reviews: `review-item.tsx:3` `fmt` → `formatDate(…, { tz })`; meta for your own reviews reads "Google reviewer · on your profile" instead of "· You" (audit M 15c); `place-summary.tsx:18` `toLocaleString` → `formatCount`.
- Append `app/(app)/c/[clientId]/{pricing,ads,reviews}`, `components/place-summary.tsx` to `AREAS_2B`.
**Tests (TDD):** `price change chip uses chip tokens`; `formatPrice(89.5) is "$89.50"`; `ad card dates in the client zone, "Active" chip`; `ads competitor filter lists a tracked rival with no ads`; `own review meta says "on your profile"`; `pricing history renders inside Suspense` (fallback shown when the read is pending).
**Done when:** `pnpm --filter @cs/web exec vitest run pricing ads reviews place-summary page-gates`, typecheck.

### Task 8: Rankings
**Goal:** Rankings "fixed"; backlog `rankings/page.tsx:35,226`; 7b1 scan-now sweep (D13).
**Files:** `app/(app)/c/[clientId]/rankings/{page,scan-now-button,rank-settings-sheet,scan-slider,tabs,actions,sov,scan-copy}.ts(x)` (+ tests).
**Behaviour:**
- `fmtDate` (`:35`) deleted → `formatDate(finishedAt, { tz: profile.timezone })` for scan options, slider labels, "Scan of …", compare line.
- SoV labels (`:226`) → `sov.scans.map((s) => localDay(s.finishedAt, profile.timezone))` (LineChart formats them).
- Cap/limit notes beside "Scan now" and in the settings sheet are tied to their control with `aria-describedby` (audit M a11y); the `role="status"` result stays in the always-mounted button component.
- Every `<select>` keeps its `<label>`; check `rank-settings-sheet` radius select uses `radiusOptions` (miles).
- Append `app/(app)/c/[clientId]/rankings` to `AREAS_2B`.
**Tests (TDD):** `scan options read "Oct 18" in the client zone`; `share-of-voice labels are client-zone days`; `scan-now note is aria-describedby of the button` (cap and spend_paused states); `weekly_limit label stays on the disabled button`.
**Done when:** `pnpm --filter @cs/web exec vitest run rankings page-gates`, typecheck.

### Task 9: Recommendations
**Goal:** "Effort L" → words; owner label per role (P8); empty columns say so.
**Files:** `app/(app)/c/[clientId]/recommendations/{page,actions}.ts(x)`, `components/recommendation-board.tsx` (+ tests).
**Behaviour:**
- `:122-123` → `StatusChip` neutral "Effort: {LEVEL}" / "Impact: {LEVEL}" (same as the runbook card). `:124` owner tag: P8 copy. Upsell tag (`:126`) per P1, agency only (unchanged rule).
- An empty column shows "Nothing here yet." (decided copy, sign-off).
- Dismiss keeps its reason dialog (reversible via Reopen; not a ConfirmDialog case).
- Append `app/(app)/c/[clientId]/recommendations`, `components/recommendation-board.tsx` to `AREAS_2B`.
**Tests (TDD):** `effort and impact read "Effort: Low" / "Impact: High"`; `client role sees "For you", agency sees "Client"` (Review focus 2); `an empty column says "Nothing here yet."`.
**Done when:** `pnpm --filter @cs/web exec vitest run recommendation page-gates`, typecheck.

### Task 10: Briefs, alerts and their views
**Goal:** Briefs list, brief/alert detail and `BriefView`/`AlertView` "fixed"; backlog BriefView/AlertView mixed dates, briefs tab overflow, per-page status maps.
**Files:** `app/(app)/c/[clientId]/briefs/{page,copy,neighbours}.ts(x)`, `briefs/[briefId]/page.tsx`, `alerts/[alertId]/page.tsx` (+ tests), `components/views/{brief-view,alert-view,scorecard}.tsx` (+ `views.test.tsx`); e2e `starting-point.spec.ts:109`.
**Behaviour:**
- `briefs/copy.ts` local `BRIEF_STATUS`/`ALERT_STATUS`/`REPORT_STATUS` deleted; rows carry a `LabelEntry` from `@/lib/labels`; list `<Badge>`s (`page.tsx:133,135`) → `StatusChip` (status agency only, as today; "Starting point" kind → `StatusChip` info for everyone).
- Tab overflow (`page.tsx:110`): the wrapper gets `min-w-0 flex-wrap`, so the `TabsLinkList` scrolls inside the page at 390 px instead of widening it.
- `BriefView`/`AlertView` take `timezone`. BriefView: title "Week of" per P6; "Starting point · {date}" chip with `formatDate(deliveryDate, { tz: 'UTC' })`; agency status `<Badge>` (`:56`) → `StatusChip` + `BRIEF_STATUS`; dropped item `<Badge>` (`:102`) → `StatusChip` + `BRIEF_ITEM_STATUS`; upsell span per P1. AlertView: `when` (`:19`) → `formatDateTime(when, { tz, zoneLabel: true })`; score/status `<Badge>`s → `StatusChip` neutral "Score {n}" + `ALERT_STATUS`.
- Brief page title uses P6; its test fixture date moves to a Monday if needed.
- Append `app/(app)/c/[clientId]/{briefs,alerts}`, `components/views/brief-view.tsx`, `components/views/alert-view.tsx`, `components/views/scorecard.tsx` to `AREAS_2B`.
**Tests (TDD):** `briefs list: agency sees a "Ready for review" chip, client none`; `alert view time is "Oct 12, 9:00 AM CT" for a Chicago client`; `BriefView week of a date-only deliveryDate is the same in Pacific/Kiritimati` (Review focus 1); `client role sees no status chip, score or dropped item` (Review focus 2); `starting point chip reads "Starting point · Oct 12"`; `tab list wrapper is min-w-0`.
**E2E:** `starting-point.spec.ts:109` regex → `/^Starting point · [A-Z][a-z]{2} \d{1,2}(, \d{4})?$/`.
**Done when:** `pnpm --filter @cs/web exec vitest run briefs alerts views page-gates`, typecheck.

### Task 11: Reports and Pitch snapshot
**Goal:** Backlog `report-view.tsx:6`, Report empty state, `pitch-snapshot/page.tsx:40`, `prospect-landscape.tsx:48`.
**Files:** `app/(app)/c/[clientId]/reports/[reportId]/page.tsx`, `pitch-snapshot/page.tsx` (+ tests), `components/views/report-view.tsx`, `components/prospect-landscape.tsx` (+ tests), `app/(app)/agency/prospects/[clientId]/page.tsx` (passes `timezone`), `help/copy/client.ts` (`client.reports.detail.empty.noData`).
**Behaviour:**
- `report-view.tsx:6` `dateOnly` deleted: period → `formatDate(periodStart|periodEnd, { tz: 'UTC' })` ("Jul 1 to Sep 30"); moves line (`:79`) → `{MOVE_LABELS[moveType] ?? humanise} · {competitor} · {MOVE_STATUS label} · first detected {formatDate(…, { tz: 'UTC' })}`.
- Empty report (`:33` "This report has no data.") → `EmptyState` with `PAGE_COPY['client.reports.detail'].empty.noData` = `{ title: 'No figures in this report', body: 'This quarter had no data to report for {client}. The next report comes after the quarter ends.' }` (sign-off).
- Pitch snapshot "Generated …" (`:40`) → `formatDate(finishedAt ?? createdAt, { tz: profile.timezone })`. `ProspectLandscape` takes `timezone`; "Generated …" (`:48`) uses it; agency prospects page passes `await viewerTimeZone()`.
- Append `app/(app)/c/[clientId]/{reports,pitch-snapshot}`, `components/views/report-view.tsx`, `components/prospect-landscape.tsx` to `AREAS_2B`.
**Tests (TDD):** `report period reads "Jul 1 to Sep 30"`; `report moves read "Price war · … · Active"`, never `price_war`; `empty report shows the empty state`; `pitch snapshot generated date in the client zone`; `prospect landscape on the agency page uses the viewer zone`.
**Done when:** `pnpm --filter @cs/web exec vitest run reports pitch-snapshot views prospect-landscape help-client page-gates`, typecheck.

### Task 12: Evidence and Ask
**Goal:** Evidence page "fixed" (backlog `:32,36`); Ask visibility line (P5); privacy tip (Q6).
**Files:** `app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx`, `ask/{page,ask-screen,actions}.ts(x)`, `ask/[threadId]/page.tsx` (+ tests), `components/ask/{ask-chat,thread-list}.tsx` (+ tests), `help/copy/client.ts:325`, guides `client.ask.client.md`, `client.ask.thread.md` (only if they quote the thread-list line).
**Behaviour:**
- Evidence: `formatUtc`/`formatUtcDate` (`:31-37`) → `formatDateTime(…, { tz: profile.timezone, zoneLabel: true })` / `formatDate`; "Status" (`:156`) → `StatusChip` + `CAPTURE_STATUS`; `RAW_KIND_LABEL` → `EVIDENCE_KIND` lower-cased in the sentence; Ask link `text-[#3B2300]` → `text-amber-text` (P1).
- Ask: `AskChat` always renders the line under the composer: `reviewAllowed ? disclosureCopy(productName) : 'Only you can see your conversations.'` (`ask-chat.tsx:253`). `thread-list.tsx:69` → "Your questions appear here.".
- Privacy tip body (Q6, verbatim): replace the final sentence "Delete a thread with the bin icon beside it." with **"Delete a conversation with the bin icon beside it and confirm. While conversations may be reviewed, the people named in that line can still read it."**
- Append `app/(app)/c/[clientId]/{evidence,ask}`, `components/ask` to `AREAS_2B`.
**Tests (TDD):** `evidence captured time has the client zone label`; `robots_disallowed status reads "Site asks not to be monitored"`; `composer line without review reads "Only you can see your conversations."`; `composer line with review keeps the disclosure` (e2e `ask.spec.ts:19` string unchanged); `privacy tip ends with the Q6 sentences` (exact `endsWith`).
**Done when:** `pnpm --filter @cs/web exec vitest run evidence ask help-client page-gates`, typecheck.

### Task 13: Setup wizard
**Goal:** Setup "fixed" (audit §2.4 15c items).
**Files:** `app/(app)/c/[clientId]/setup/{page,setup-wizard,actions,refusal-copy,types,wizard-steps}.ts(x)`, `setup/steps/*.tsx` (+ tests).
**Behaviour:**
- `page.tsx:25` `STATUS_LABEL` deleted → `StatusChip` + `SETUP_STEP_STATUS` (`:87`).
- Billing step (`billing-step.tsx:24`): "Connect Stripe in Settings → Billing" becomes a link to `/agency/settings/billing` (text unchanged).
- Pick step: a live `role="status"` line "{n} selected" under the list (decided copy; no limit shown — the wizard has none client-side).
- Business step: keyword label states the limit, "Add your own (one per line, up to {maxKeywords} in total)"; `maxKeywords` = `MAX_KEYWORDS` passed from the server page. Every hint is `aria-describedby` of its control (`FieldHint`/`useFieldHint`).
- Append `app/(app)/c/[clientId]/setup` to `AREAS_2B`.
**Tests (TDD):** `finished setup shows a "Needs attention" chip for a blocked step`; `billing step links to agency billing`; `pick step counts "2 selected" as boxes are ticked`; `keyword label names the limit`; `every setup hint is aria-describedby`.
**Done when:** `pnpm --filter @cs/web exec vitest run setup page-gates`, typecheck.

### Task 14: Settings — Alert rules and Delivery
**Goal:** Band bar (new UI, D10), `ALERTS_PER_DAY`, delivery confirms/labels/`SaveBar`.
**Files:** `app/(app)/c/[clientId]/settings/alerts/{page,alert-rules-form,actions}.ts(x)`, `settings/delivery/{page,delivery-controls,actions}.ts(x)` (+ tests), guides `client.settings.alerts.{agency,client}.md`, `client.settings.delivery.agency.md`.
**Interfaces:**
```ts
// settings/alerts/band-bar.tsx (new, client component; rendered inside AlertRulesForm and in read-only mode)
export function BandBar({ brief, alert }: { brief: number; alert: number }): JSX.Element;
// three segments on a 0–100 scale: [0, brief) "Archived" · [brief, alert) "Weekly brief" · [alert, 100] "Instant alert"
```
**Behaviour:**
- `BandBar`: a `role="img"` bar with `aria-label` "Scores 0 to {brief−1}: archived. {brief} to {alert−1}: weekly brief. {alert} to 100: instant alert." plus a visible legend (label + range under each segment; no colour-only meaning). Tokens: archived `bg-muted-surface-2`, brief `bg-chip-info-bg`, alert `bg-chip-warning-bg`; `rounded-xs`, no shadow. Follows typed values live (form fields controlled); invalid combos (brief ≥ alert) show the bar unchanged from the last valid pair. Replaces the three explanatory `<p>`s' range sentence (`page.tsx:53-55`; keep the "apply from now on" line).
- `page.tsx:57` "3 a day" → `` `${ALERTS_PER_DAY} a day` `` (P7).
- `AlertRulesForm` → `SaveBar` (saveLabel "Save"); "Use the defaults (…)" stays a separate button; result line hoisted beside the form, not inside the bar.
- Delivery: `DeliveryForm` → `SaveBar` ("Save"); auto-send `<Label htmlFor>` + `Switch id` (`delivery-controls.tsx:65-67`); digest copy "Alerts wait for the 17:00 digest (business time zone)."; `ROLE_LABEL` (`page.tsx:26`) → `MEMBERSHIP_ROLE`; "Has account" `<Badge>` (`:86`) → `StatusChip` neutral; Active/Inactive → `StatusChip` success/neutral; Recipients tip out of `CardTitle` (`:58`); `DeactivateRecipientButton` → `ConfirmDialog` (title "Deactivate {email}?", body unchanged, confirm "Deactivate", tone danger) with the refusal line under its row.
- Append `app/(app)/c/[clientId]/settings/{alerts,delivery}` to `AREAS_2B`.
**Tests (TDD):** `band bar ranges for brief 40 / alert 70: 0–39, 40–69, 70–100`; `band bar follows typed values`; `aria-label states all three ranges`; `alert rules page says "3 a day" from ALERTS_PER_DAY`; `delivery: refused save keeps the chosen mode; success hides the bar and keeps "Saved"` (Review focus 3); `deactivate: cancel does nothing` (Review focus 4); `auto-send switch has a label`; `recipient role reads "Client owner"`.
**E2E:** `workspace.spec.ts` alert-rules test must still pass (Save appears once dirty) — run it at the final review via `e2e:affected`.
**Done when:** `pnpm --filter @cs/web exec vitest run "settings/(alerts|delivery)" page-gates`, typecheck.

### Task 15: Settings — Profile, Billing, Usage, AI, Runbook, layout
**Goal:** Remaining settings pages "fixed"; D12(d) on both usage cells (Q7); client billing guide.
**Files:** `app/(app)/c/[clientId]/settings/{layout,page}.tsx`, `settings/profile/{page,client-features-form,actions}.ts(x)`, `settings/billing/{page,actions}.ts(x)`, `settings/usage/page.tsx`, `settings/ai/{page,actions}.ts(x)`, `settings/runbook/{page,actions}.ts(x)` (+ tests), `components/{client-profile-form,services-area-summary}.tsx` (+ tests), `app/(app)/agency/settings/usage/questions-cell.tsx` (+ `page.test.tsx`), guide `docs/help/pages/client.settings.billing.client.md`, `help/copy/client.ts` (billing `status` tip).
**Behaviour:**
- Profile: `ClientProfileForm` in `mode: 'edit'` uses `SaveBar` (saveLabel "Save profile"; create mode keeps its button); the result line sits at the form's end, outside the bar (audit "message at the top while Save is at the bottom"). `ClientFeaturesForm` → `SaveBar` ("Save features"). Both bars only show while their form is dirty.
- `services-area-summary.tsx`: omit "0 ZIP codes" (audit "15 km · 0 ZIP codes").
- Billing: `statusOf` returns a `CLIENT_PLAN_STATUS` key; `<Badge>` (`:97`) → `StatusChip` + `labelFor`. Guide status list adds *Not available*: "*Not available* means your agency has not shared the billing details here; contact them." Billing `status` tip adds the same sentence.
- Usage: client "Ask questions this month" → `askQuotaText(questions)`; agency `QuestionsCell` → `askQuotaText(questions)`, "At quota" unchanged for `quota > 0`.
- AI, runbook, layout: gate fixes and §4.1 only.
- Append `app/(app)/c/[clientId]/settings` (whole folder; replaces the T14 entries) to `AREAS_2B`.
**Tests (TDD):** `profile form keeps typed keywords after a refused save` (Review focus 3); `profile success line shows after save and the bar hides`; `area summary omits 0 ZIP codes`; `billing status is a chip; unknown state reads "Not available"`; `client usage quota 0 reads "4 used · Ask turned off by limit"`; `agency questions cell quota 0 reads the same, no "At quota"`.
**E2E:** `workflow.spec.ts` "Save profile"/"Save features" clicks follow a field change, so the bars are visible — no edit expected; confirm at the final review.
**Done when:** `pnpm --filter @cs/web exec vitest run settings client-profile-form services-area-summary questions-cell agency/settings/usage page-gates`, typecheck.

### Task 16: Gates over all of `src` (Q4)
**Goal:** Gates 1–4 enforced over the whole `apps/web/src`; remaining components clean.
**Files:** `apps/web/src/lib/page-gates.ts`, `page-gates.test.ts`, any file still hit (expected after T1–T15: `components/{views/scorecard,charts/*,help/*,…}` only if new hits appeared), `apps/web/CLAUDE.md` (UI patterns "Gates ratchet" line).
**Interfaces:**
```ts
/** Whole files the gates skip: non-UI code whose source contains the patterns on purpose. Path relative to apps/web/src → reason. */
export const GATE_EXEMPT: Record<string, string> = {
  'lib/page-gates.ts': "the gates' own patterns (e.g. /<Badge\\b/) are string literals",
};
export const GATED_PATHS: string[] = ['.'];   // all of apps/web/src (tests and lib/format/** still skipped)
```
**Behaviour:**
- `sourceFilesUnder` skips `GATE_EXEMPT` keys. Add an entry only for a non-`.tsx` file with a stated reason (server log text, email builder, dev panel); every UI hit is fixed or gets a per-line `format-gate:` escape with a reason.
- Tests: drop `GATED_PATHS ⊆ AREAS_2A ∪ AREAS_2B` and `gated paths cover AREAS_2A`; keep `AREAS_2A/2B ⊆ existing paths` (history of the ratchet).
- `apps/web/CLAUDE.md`: "Gates: `lib/page-gates.ts` gates all of `src`; whole-file exemptions only in `GATE_EXEMPT` (non-UI, with a reason)."
**Tests (TDD):** `gated paths are clean` (now all of src); `GATE_EXEMPT entries are existing non-.tsx files with a reason`; `a planted <Badge in a components/ fixture path is flagged` (in-memory `scanSource('components/x.tsx', …)`); `scanPaths(GATED_PATHS) covers app/api and server files` (`sourceFilesUnder(['.'])` includes a known `app/api/**/route.ts` and `server/*.ts`); `help km gate still scans copy and guides`.
**Done when:** `pnpm --filter @cs/web exec vitest run page-gates no-old-helpers terminology help/coverage`, typecheck.

### Task 17: Topic heatmap "Show as table" (last)
**Goal:** Backlog 5c-2: the table view is styled, carries the same data as the chart (incl. the delta), and the SVG stays readable on a phone.
**Files:** `apps/web/src/components/charts/topic-heatmap.tsx` (+ `topic-heatmap.test.tsx`), `app/(app)/c/[clientId]/reviews/page.tsx` (only if props change), guides `client.reviews.{agency,client}.md` (one line on the table).
**Behaviour:**
- Keep the native `<details>`/`<summary>Show as table</summary>` toggle (keyboard and screen-reader friendly).
- Table (new UI, D10): a section-style table (no card, no shadow): `text-sm`, header row `font-semibold text-ink` with a bottom border `border-muted-surface-2`, cells `px-3 py-2`, numbers right-aligned `tabular-nums`, "You" column header `text-you`. Each cell: `{share}% · {sentiment word}{delta}` where sentiment word = the legend label of `sentimentFill`'s step (Very negative … Very positive, "No sentiment" when null) and delta = ` · ▲ {n} pts` / ` · ▼ {n} pts` when |shareDelta| ≥ 0.05 (the chart's arrow rule), "—" when share is null. Same values as the SVG cells (one shared `cellText(c)` helper feeds both `title` and the table).
- Phone width: the SVG gets `style={{ minWidth: W }}` inside its `overflow-x-auto` wrapper so text stays 12 px and the chart scrolls instead of shrinking.
**Tests (TDD):** `table cell reads "34% · Positive · ▲ 8 pts"`; `table cell with no data reads "—"`; `table and chart agree for every cell` (iterate topics × businesses); `svg keeps its natural width (minWidth)`; existing heatmap tests stay green.
**Done when:** `pnpm --filter @cs/web exec vitest run topic-heatmap reviews page-gates`, typecheck.

### Task 18: Copy sign-off, help coverage, work file
**Goal:** One sign-off section for the owner; docs current.
**Files:** `docs/archive/phase-15c2-copy-signoff.md` (append `### 2b-2` under `## 15c-2b`), `docs/work/phase-15c2b2.md`, `docs/BACKLOG.md` is **not** edited (items go in the work file's "New backlog").
- [ ] Sign-off section: every new/changed string from T1–T17 grouped by page with file:line — the T1 label maps (tables), Ask composer line, privacy tip (Q6, for the record), quota text (Q7), moves "{n} changes" + tip, "Google Place ID", "{agency} can look for more competitors", owner labels (P8), "Nothing here yet.", "Promo", "on your profile", "Rated Oct 13", report empty state, setup "{n} selected" + keyword label, band bar labels/aria, "3 a day" source, digest "(business time zone)", recipient role labels, billing "Not available" guide line, heatmap table cell format; plus **Owner decisions**: (1) P2 desktop `aria-current`, (2) P4 tool refusal still says "place id", (3) P10 no examples on the band bar, (4) hex left without tokens (list) for phase-16, (5) `CAPTURE_STATUS` wording for owners.
- [ ] `pnpm --filter @cs/web exec vitest run help/coverage terminology white-label-leak copy page-gates labels` green.
- [ ] Work file: Status/Next, Interfaces added (`lib/labels` maps, `formatMonth`/`localDay`/`formatCount`, `askQuotaText`, `GATE_EXEMPT`, `ALERTS_PER_DAY` export), New backlog (P4 tool string; client billing agency contact link; hex without tokens; audit items found but out of scope), Owner verification steps (below).
**Done when:** docs committed; final whole-branch review (most capable model) with `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`, then one fix wave.

## Owner verification steps (copy into the work file)
1. As a client owner of a client in another time zone than yours, open Changes, an alert and an evidence page: times carry the client's zone label ("CT"), and no date is in ISO form.
2. Changes at phone width (390 px): landing shows the list only, no row is announced as current; tapping a change opens the sheet.
3. Settings › Alert rules: type new thresholds and watch the band bar follow; Save appears only after a change; the page says "3 a day".
4. Settings › Delivery: change the alert mode, then Discard; deactivate a recipient and press Cancel — nothing happens; confirm — the row turns Inactive.
5. Competitors: "Stop tracking" asks first and Cancel keeps the competitor; the "Since" column reads "Oct 13".
6. Ask: with review off the composer says "Only you can see your conversations."; with review on it shows the review sentence; the Privacy tip ends with the new sentences.
7. Usage (client and agency): a client whose Ask limit is 0 reads "N used · Ask turned off by limit".
8. Reviews: open "Show as table" — cells show share, sentiment word and the ▲/▼ points; on a phone the chart scrolls sideways instead of shrinking.
9. Read the § 15c-2b-2 sign-off section and answer its owner decisions.
