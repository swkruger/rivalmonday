# Phase 15c-1 — Shared UI pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`): interfaces and behaviour are binding; implementers write the code. Steps use `- [ ]`.

**Goal:** The shared pieces every later 15c page fix uses exist and are adopted where the spec says: Skeleton, StatusChip, ConfirmDialog, SaveBar, enum labels, date/money/distance formatters with the time-zone rule, miles in every distance users see or type, loading skeletons, neutral error/404 pages with a Sentry seam, and four cross-cutting sweeps.
**Architecture:** Primitives in `@cs/ui`; app-level labels and formatters in `apps/web/src/lib/`; the viewer's zone travels in a cookie written by a tiny client component and read server-side. No migration, no new tool.
**Tech stack:** Next.js App Router, Tailwind v4 tokens (`packages/ui/src/styles.css`), shadcn/Radix `Dialog`, `Intl.DateTimeFormat`/`NumberFormat`, Vitest + Testing Library, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md` §2 (C2, C3, C8, C10) and §3. Brief: `docs/work/phase-15c.md`.

## Global constraints
- Brand tokens only (CSS variables in `packages/ui/src/styles.css`); no new hex in components — new colours are added as tokens there.
- Nothing client-facing names Rival Monday; error/404 pages are neutral (no wordmark, no agency branding, no product suffix in `<title>`).
- Miles in every UI distance (display and input); storage, `radiusKm` fields and tool input schemas stay km; tool **descriptions** state the unit.
- Dates: "Oct 21" within the viewer's current year, "Oct 21, 2025" otherwise; no ISO dates or ISO weeks rendered in UI by code this plan touches. Client pages use `client.timezone`; agency/platform/account pages use `viewerTimeZone()`.
- Web reads via registered tools; writes via `runTool`; refusals → 404.
- Every new `PageHeader` page needs a help key + guide (none expected in 15c-1).
- Read `docs/gotchas-cross-cutting.md`, `apps/web/CLAUDE.md`, `packages/ui/CLAUDE.md` (if present) first. Focused tests: `pnpm --filter <pkg> exec vitest run <pattern>`; reviewers run `pnpm test:affected` and `pnpm --filter @cs/web e2e:affected`.
- LF only; commits end with the Co-Authored-By line from root `CLAUDE.md`.

## Decisions
Spec C1–C11 (15c-1 uses C2, C3, C8, C10). Plan-local:
- **P1 Line token.** `border-line`/`bg-line` draw nothing because `--line` has no `--color-line` mapping in `@theme inline`. Fix = add `--color-line: var(--line);` (one line) **and** review each of the ~29 files: uses meant as a visible rule keep `line`; uses where a grey panel was intended become `bg-muted-surface`. Supersedes spec §3.7's "→ grey-panel token" wording (same visual intent, smaller diff).
- **P2 Chip tones** (tokens added to `styles.css`, text on tint ≥ 4.5:1):
  | tone | bg token | text token | values |
  |---|---|---|---|
  | neutral | `--chip-neutral-bg` | `--chip-neutral-text` | #EEF2F6 / #334155 |
  | info | `--chip-info-bg` | `--chip-info-text` | #E3F2FC / #1F5F8F |
  | success | `--chip-success-bg` | `--chip-success-text` | #E7F6EC / #166534 |
  | warning | `--chip-warning-bg` | `--chip-warning-text` | #FEF3C7 / #92400E |
  | danger | `--chip-danger-bg` | `--chip-danger-text` | #FDECEC / #B91C1C |
  Final values may move after the Task 1 mockup review; the contrast test pins the rule, not the hex.
- **P3 Tone rule for labels:** success = healthy/finished-good (active, sent, ok, approved, paid); info = in progress or time-boxed (pilot, trialing, queued, running, pending send); warning = needs someone (past_due, pending review, needs attention, expiring); danger = blocked/failed (read_only, suspended, failed, bounced, cancelled, rejected); neutral = everything else (draft, paused, archived, superseded).
- **P4 "You" colour** = new token `--you: var(--secondary)` (`--color-you`), used by every chart/legend/table marker that means "your business".
- **P5** 15c-1 adopts the primitives only where the plan names a file (formatter call sites of deleted helpers, km sites, sweeps). Page-by-page adoption (chips, confirms, SaveBar, tz labels) is 15c-2.

## File structure
- `packages/ui/src/components/{skeleton,status-chip,confirm-dialog,save-bar}.tsx` (+ tests), `packages/ui/src/index.ts` exports, `packages/ui/src/styles.css` tokens.
- `apps/web/src/lib/labels.ts` (+ test); `apps/web/src/lib/format/{date,money,distance}.ts` (+ tests), `apps/web/src/lib/format/index.ts`.
- `apps/web/src/components/shell/tz-cookie.tsx`, `apps/web/src/server/viewer-tz.ts` (+ tests).
- `apps/web/src/lib/report-error.ts`; `apps/web/src/app/{not-found,error,global-error}.tsx`; `apps/web/src/app/(app)/error.tsx`; `apps/web/src/app/(platform)/platform/error.tsx`; `apps/web/src/components/error-panel.tsx` (shared body).
- `loading.tsx` in `app/(app)/c/[clientId]`, `app/(app)/agency`, `app/(platform)/platform`, `app/(app)/inbox`; `apps/web/src/components/page-skeleton.tsx`.
- km sites listed in Task 6. Sweep files found by the greps in Task 9.
- `apps/web/e2e/errors.spec.ts` (new) + `apps/web/scripts/e2e-affected-rules.ts`.
- `docs/archive/phase-15c1-copy-signoff.md` (created in Task 10, moved to archive at merge).

## Dependencies on in-flight work (re-check in Task 0)
- **phase-7** (7a1 built, 7a2 executing; migrations 0081–0082): adds Sentry — will replace the body of `lib/report-error.ts` (Task 8 creates it). Touches `nav-items.ts`, `server/nav.ts`, `next.config.ts`, `rankings/page.tsx`, several settings pages. Second to merge rebases.
- **phase-15b3** (planning; 3a = data/engine, 3b = surfaces): `components/charts/theme-heatmap.tsx` is touched by Task 9 ("You" colour) — keep that hunk to the colour line. No other overlap in 15c-1.
- **13a** (unbuilt): plans to create `app/{not-found,error,global-error}.tsx` — Task 8 creates them first with 13a's copy; record in `docs/work/phase-15c.md` "Interfaces" that 13a changes them to host-aware instead of creating. 13a also edits `components/client-profile-form.tsx` (Task 6 miles hunk) and `/start*`.

## Review focus
1. A user in a zone other than UTC (and a first visit with no `rm_tz` cookie) sees dates that are right for the rule — a client page at 11:30 PM Monday client-time must not say Tuesday; a first-visit agency page says "UTC" rather than silently using UTC.
2. Round-tripping distances never drifts: saving the rank settings sheet without touching the radius keeps the stored km exactly; a stored legacy value (e.g. 7 km) shows "≈ 4 mi (custom)" and survives a save of other fields.
3. Error pages never leak: a crash inside a client page on a white-label agency shows neither "Rival Monday" nor the stack/message, keeps the sidebar, and "Try again" recovers without a full reload.
4. Unknown enum values (a new DB state the label map doesn't know) render a sentence-cased label in a neutral chip — never blank, never a throw.
5. ConfirmDialog cannot be double-submitted or confirmed by Enter before `requireText` matches; Esc/Cancel leave the form untouched.
Tests pinning each are listed in Tasks 4, 5, 6, 8, 2 respectively.

---

### Task 0: Pre-flight
- [ ] `git rebase main` in the worktree; `pnpm install` (background); create test DB `cs_phase_15c_test` on the local cluster and point `.env` `TEST_*` URLs at it (per `/rm-kickoff` step 1); run `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once.
- [ ] Re-check: `git branch --no-merged main` and each in-flight work file's Interfaces; the km site list in Task 6 (`rg -n -i "\bkm\b|radiusKm|_KM\b" apps/web/src packages/tools/src --glob '!*.test.*'`); the old formatter call sites (`rg -n "formatUsd|formatMoney|formatDay|formatLongDate|formatShortDate" apps/web/src`); `rg -l "border-line|bg-line" apps/web/src packages/ui/src`; that no `loading/error/not-found/global-error.tsx` exists yet.
- [ ] Fix any drift in this plan; record findings under this task; commit `docs(phase-15c): 15c-1 pre-flight`.

### Task 1: Mockups (owner gate)
**Goal:** Owner approves the look before code (C10, owner preference "mockup first, calm chips").
**Files:** `.superpowers/` visual companion only (never staged).
- [ ] Mock in the visual companion, on the real brand tokens: StatusChip (5 tones, on white and on `canvas`, a table row with three chips); ConfirmDialog (default + danger + `requireText` variant); SaveBar (dirty, saving); PageSkeleton (client page); 404 and error page (in-shell and full-page); one km→mi input (rank radius select with a custom value).
- [ ] Owner picks/adjusts; write the outcome (final chip hex, any copy changes) into `docs/work/phase-15c.md` § Decisions and update P2 here. **Done when** the owner has approved in chat.

### Task 2: UI primitives
**Goal:** Skeleton, StatusChip, ConfirmDialog, SaveBar in `@cs/ui`.
**Files:** create `packages/ui/src/components/{skeleton,status-chip,confirm-dialog,save-bar}.tsx` + `*.test.tsx`; modify `packages/ui/src/index.ts`, `packages/ui/src/styles.css` (P2 tokens mapped as `--color-chip-*` in `@theme inline`).
**Interfaces:**
```ts
export function Skeleton(p: { className?: string }): JSX.Element;            // aria-hidden, motion-safe:animate-pulse, bg-muted-surface rounded
export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export function StatusChip(p: { tone: ChipTone; children: React.ReactNode; title?: string; className?: string }): JSX.Element; // <span>, rounded-full, text-xs font-semibold
export const CHIP_COLOURS: Record<ChipTone, { bg: string; text: string }>;   // the P2 hex values, single source for the test + styles
export interface ConfirmDialogProps {
  trigger: React.ReactNode; title: string; body: React.ReactNode;
  confirmLabel: string; tone?: 'default' | 'danger';
  requireText?: string;
  action: (fd: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
}
export function ConfirmDialog(p: ConfirmDialogProps): JSX.Element;
export function SaveBar(p: { dirty: boolean; pending: boolean; onReset?: () => void; saveLabel?: string }): JSX.Element | null; // renders a submit button inside the parent <form>
```
**Behaviour:**
- ConfirmDialog: `<form action>` inside `Dialog`; `fields` → hidden inputs; initial focus on Cancel; Esc/Cancel close without submitting; confirm disabled while `useFormStatus().pending` or while `requireText` is set and the typed value ≠ `requireText` (exact, case-sensitive, trimmed); Enter in the text box does not submit while it doesn't match; closes after the action resolves. Danger tone = `bg-danger text-white` confirm button. Label for the text box: `Type ${requireText} to confirm`.
- SaveBar: `null` unless `dirty || pending`; sticky bottom, `role="region"` `aria-label="Unsaved changes"`; buttons "Discard" (if `onReset`) and `saveLabel ?? 'Save changes'` (`type="submit"`, disabled + "Saving…" while pending).
- Follow pattern: `packages/ui/src/components/tabs-link.tsx` (+ its test) for file/test style; `dialog.tsx` for Radix wrapper usage.
**Tests (TDD):** `status chip tones meet 4.5:1 contrast` (compute WCAG ratio from `CHIP_COLOURS`); `status chip renders children and title`; `skeleton is aria-hidden`; `confirm dialog focuses Cancel on open`; `confirm dialog Esc closes without calling action`; `confirm stays disabled until requireText matches exactly`; `Enter in the confirm text box does not submit before a match`; `confirm submits fields as hidden inputs once`; `confirm button disabled while pending (no double submit)`; `save bar hidden when clean`; `save bar shows Saving… and disables while pending`.
**Done when:** `pnpm --filter @cs/ui test` and `pnpm typecheck` green.

### Task 3: Enum labels
**Goal:** Readable labels + tones for every enum the UI shows (spec §3.2).
**Files:** create `apps/web/src/lib/labels.ts` + `labels.test.ts`; modify `apps/web/src/app/terminology.test.ts` (or the existing terminology test path) to scan client-audience maps.
**Interfaces:**
```ts
import type { ChipTone } from '@cs/ui';
export interface LabelEntry { label: string; tone: ChipTone }
export type LabelMap<T extends string> = Record<T, LabelEntry>;
export function labelFor<T extends string>(map: LabelMap<T>, value: T | string | null | undefined): LabelEntry; // unknown → { label: sentenceCase(value), tone: 'neutral' }; null/'' → { label: '—', tone: 'neutral' }
export const BILLING_STATE: LabelMap<BillingState>;          // from @cs/db BILLING_STATES
export const CLIENT_STATUS: LabelMap<...>; export const LEAD_STATUS: LabelMap<...>;
export const ALERT_STATUS: LabelMap<...>; export const REVIEW_STATUS: LabelMap<...>;
export const REPORT_STATUS: LabelMap<...>; export const ASK_MESSAGE_STATUS: LabelMap<...>;
export const EVIDENCE_KIND: LabelMap<...>; export const WEBHOOK_KIND: LabelMap<...>;
export const MEMBERSHIP_ROLE: LabelMap<...>;
export const CLIENT_AUDIENCE_MAPS: readonly LabelMap<string>[];  // maps that may render to client roles
```
**Behaviour:** Key types come from the existing `@cs/db` const arrays / `@cs/core` unions (find with `rg "as const" packages/db/src/schema`), so a new DB value is a type error until labelled. Tones per P3. Labels sentence case, plain words (e.g. `past_due` → "Payment overdue", `read_only` → "Read-only", `pending_review` → "Waiting for review"); every label goes into the Task 10 sign-off doc. `MEMBERSHIP_ROLE` uses the 15b-2 glossary wording (`packages/core/src/help/glossary.ts`). `sentenceCase('past_due')` → "Past due".
**Tests (TDD):** `labelFor falls back to sentence case with neutral tone`; `labelFor of null is an em dash`; `every BILLING_STATES value has a label` (iterate the const array; repeat per map with a const source); `client-audience maps contain no agency-only terms` (reuse the terminology banned list).
**Done when:** `pnpm --filter @cs/web exec vitest run labels terminology` and `pnpm typecheck` green.

### Task 4: Formatters (date, money) + migrate the old helpers
**Goal:** One date and one money formatter; delete the duplicates (spec §3.3).
**Files:** create `apps/web/src/lib/format/{date,money,index}.ts` + `date.test.ts`, `money.test.ts`; delete `formatUsd`/`formatLongDate` from `apps/web/src/server/format.ts` and `apps/web/src/components/billing/format.ts` (keep `relativeTime` only if Task 4 doesn't replace it — replace it with `formatRelative` and delete), `apps/web/src/components/client-billing/money.ts`, `formatDay` in `app/(app)/c/[clientId]/briefs/format.ts`, the three local `formatShortDate`s (`changes/feed.tsx`, `changes/viewer.tsx`, `moves/page.tsx`); update every call site (≈ 37 files per Task 0 grep).
**Interfaces:** exactly spec §3.3 `date.ts` and `money.ts`:
```ts
export function formatDate(v: string | Date, o: { tz: string; withYear?: 'auto' | 'always'; now?: Date }): string;
export function formatDateTime(v: string | Date, o: { tz: string; zoneLabel?: boolean; now?: Date }): string;
export function formatRelative(v: string | Date, now?: Date): string;
export function formatWeekOf(v: string | Date, o: { tz: string }): string;
export function formatMoney(amount: number, o?: { unit?: 'usd' | 'cents'; cents?: boolean }): string;
```
**Behaviour:**
- `withYear: 'auto'` (default) omits the year when the date's year **in `tz`** equals `now`'s year in `tz`. `formatDateTime` → "Oct 21, 9:00 AM" (+ " CT"-style short zone via `timeZoneName: 'short'` when `zoneLabel`; UTC renders "UTC"). `formatWeekOf` → "Week of Oct 20" (Monday of that week in `tz`).
- `formatRelative`: "just now" (< 1 min), "5 min ago", "3 h ago", "yesterday", "4 days ago", then `formatDate` with `tz: 'UTC'`; future → "in 3 days".
- `formatMoney`: `unit` default `'usd'`; `cents` (show cents) default = true when the amount has a fractional part (or `< 1` USD), else "$229".
- Call-site migration keeps today's zone: client-page callers pass the client's `timezone` where already available (briefs), otherwise `'UTC'` for now — the zone rule rollout per page is 15c-2 (P5), except the three `formatShortDate` pages, which pass `client.timezone`.
- Follow pattern: `briefs/format.ts` (Intl usage).
**Tests (TDD):** `formatDate omits the current year in the given zone`; `formatDate shows the year for last year`; `formatDate uses the zone day: 2026-10-20T04:30Z in America/Chicago is Oct 19`; `formatDateTime labels CT and UTC`; `formatWeekOf returns the Monday in zone`; `formatRelative buckets`; `formatMoney usd vs cents units`; `formatMoney $229 without cents and $0.42 with`; `no file under apps/web/src defines formatUsd/formatShortDate any more` (fs scan test).
**Done when:** `pnpm --filter @cs/web exec vitest run format billing briefs changes moves` and `pnpm typecheck` green.

### Task 5: Viewer time zone
**Goal:** Server components know the viewer's zone (C8).
**Files:** create `apps/web/src/components/shell/tz-cookie.tsx` (+ test), `apps/web/src/server/viewer-tz.ts` (+ test); modify `apps/web/src/components/shell/app-shell.tsx` (render `<TzCookie />` once) and the platform layout (`app/(platform)/layout.tsx`) if it doesn't use `AppShell`.
**Interfaces:**
```ts
// tz-cookie.tsx ('use client')
export function TzCookie(): null; // on mount: zone = Intl.DateTimeFormat().resolvedOptions().timeZone; if cookie rm_tz !== zone → document.cookie = `rm_tz=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax` (+ '; Secure' on https) and router.refresh()
// viewer-tz.ts ('server-only')
export async function viewerTimeZone(): Promise<string>; // cookies().get('rm_tz') validated by validTimezone (@cs/tools) → else 'UTC'
```
**Behaviour:** refresh only when the cookie changed (no loop); invalid cookie values are ignored server-side. No PII; cookie not httpOnly (client-written).
**Tests (TDD):** `TzCookie writes the cookie and refreshes once when missing`; `TzCookie does nothing when the cookie already matches`; `viewerTimeZone returns UTC without a cookie`; `viewerTimeZone rejects an invalid zone`; `viewerTimeZone returns America/Chicago from the cookie`.
**Done when:** `pnpm --filter @cs/web exec vitest run tz-cookie viewer-tz app-shell` and `pnpm typecheck` green.

### Task 6: Miles
**Goal:** Every distance users see or type is in miles (C3, spec §3.3 "Miles"/"Rank radius").
**Files:** create `apps/web/src/lib/format/distance.ts` + `distance.test.ts`; modify `app/(app)/c/[clientId]/rankings/{rank-settings-sheet.tsx,actions.ts,page.tsx,scan-copy.ts}`, `app/(app)/c/[clientId]/setup/steps/{business-step,pick-step}.tsx`, `components/client-profile-form.tsx`, `components/services-area-summary.tsx`, `server/forms.ts`, `app/start/v/[leadId]/page.tsx`, `app/(app)/c/[clientId]/competitors/competitor-controls.tsx` (use shared converter), `packages/tools/src/intake/preview.ts` (lead summary fact in miles), tool descriptions in `packages/tools/src/tools/rankings.ts` and `schemas.ts` (state "kilometres"), plus their tests.
**Interfaces:** spec §3.3 `distance.ts`:
```ts
export const KM_PER_MILE = 1.609344;
export function kmToMiles(km: number): number;
export function milesToKm(mi: number): number;
export function formatMiles(km: number): string;          // "3 mi"; < 1 mi → one decimal "0.4 mi"; ≥ 1 → whole miles
export const RADIUS_MILES = [2, 3, 5, 10, 15, 20, 25] as const;
export function radiusKmFromMiles(mi: number): number;     // min(round(milesToKm(mi) * 10) / 10, 40)
export function radiusChoiceForKm(km: number): number | null; // the RADIUS_MILES entry whose radiusKmFromMiles === km, else null
export function serviceAreaKmFromMiles(mi: number): number; // min(round1(milesToKm(mi)), 80); input 1–50 mi, step 1
```
**Behaviour:**
- Rank settings: `<select>` of `RADIUS_MILES` ("5 mi"); stored km with no matching choice → an extra first option "≈ N mi (custom)" carrying the **original km** value, selected, so saving other fields keeps it exactly. Action parses miles (or the custom km passthrough) → km. Server bounds unchanged (2–40 km).
- Profile/setup service area: number input labelled "Service area (miles)", min 1, max 50, step 1, default 10 mi (replaces `DEFAULT_RADIUS_KM='15'`, ≈ 9.3 mi → use 10); prefill = `Math.round(kmToMiles(stored))`; **an untouched field re-submits the original km** (hidden `original_km` + `original_mi`; if the mile value is unchanged, keep km).
- Display: rankings line "· 5 mi radius", pick step "2.3 mi away" (one decimal under 10 mi), services summary "10 miles around the business", lead page column "Distance (mi)".
- Tool **input schemas stay km**; descriptions say "in kilometres".
**Tests (TDD):** `kmToMiles/milesToKm round trip`; `formatMiles under and over 1 mile`; `radiusKmFromMiles(25) is 40`; `radiusChoiceForKm(8) is 5`; `radiusChoiceForKm(7) is null`; rank settings `legacy 7 km shows ≈ 4 mi (custom) and saves 7 unchanged`; `choosing 10 mi saves 16.1`; profile form `unchanged miles keep the stored km`; `50 mi saves 80`; services summary `renders miles`; lead preview fact `uses miles`.
**Done when:** `pnpm --filter @cs/web exec vitest run distance rank-settings rankings setup client-profile services-area start competitor-controls forms` , `pnpm --filter @cs/tools exec vitest run preview rankings`, `pnpm typecheck` green; `rg -n -i "\bkm\b" apps/web/src --glob '!*.test.*'` shows only storage/variable names, no rendered text.

### Task 7: Loading skeletons
**Goal:** Every main area shows a skeleton while server components load (spec §3.4).
**Files:** create `apps/web/src/components/page-skeleton.tsx` (+ test); `loading.tsx` in `app/(app)/c/[clientId]/`, `app/(app)/agency/`, `app/(platform)/platform/`, `app/(app)/inbox/`.
**Interfaces:** `export function PageSkeleton(p: { cards?: number }): JSX.Element` — header block matching `PageHeader` height (title bar + description line), then `cards ?? 3` card-height `Skeleton`s; `role="status"` with visually hidden "Loading…".
**Behaviour:** max-width/padding identical to the page container so nothing shifts; no client JS.
**Tests (TDD):** `page skeleton announces Loading…`; `renders three cards by default`; `each loading.tsx renders PageSkeleton` (import + render).
**Done when:** `pnpm --filter @cs/web exec vitest run page-skeleton loading` and `pnpm typecheck` green.

### Task 8: Error and not-found pages + reporting seam
**Goal:** Neutral error/404 pages everywhere; sidebar survives page crashes (C2, spec §3.5–3.6).
**Files:** create `apps/web/src/lib/report-error.ts`, `apps/web/src/components/error-panel.tsx` (+ test), `apps/web/src/app/{not-found,error,global-error}.tsx`, `apps/web/src/app/(app)/error.tsx`, `apps/web/src/app/(platform)/platform/error.tsx` (+ tests); modify `apps/web/src/app/white-label-leak.test.tsx`, `apps/web/src/app/page-titles.test.ts` if it enumerates titles; create `apps/web/e2e/errors.spec.ts`; register it in `apps/web/scripts/e2e-affected-rules.ts`.
**Interfaces:**
```ts
// lib/report-error.ts — phase-7 replaces the body with Sentry; signature is frozen
export function reportError(error: Error & { digest?: string }, where: 'page' | 'global'): void; // console.error('[app-error]', where, error.digest ?? '', error)
// components/error-panel.tsx
export function ErrorPanel(p: { kind: 'not_found' | 'error'; digest?: string; onRetry?: () => void }): JSX.Element;
```
**Behaviour / copy (decided, 13a Task 20):**
- 404: h1 **"Page not found"**, body **"This page doesn't exist or you don't have access to it."**, link "Go to your home page" (`/`).
- Error: h1 **"Something went wrong"**, body **"Please try again in a moment."**, buttons "Try again" (`reset()`) and "Go to your home page"; small muted "Reference: {digest}" when a digest exists. Never render `error.message` or stack.
- `metadata.title` "Page not found" / document title "Something went wrong" — no product/agency suffix (root title template must not apply: set `title: { absolute: … }`).
- `global-error.tsx` renders its own `<html><body>` with `styles.css` tokens inlined via the root stylesheet import and calls `reportError(e, 'global')`; the others call `reportError(e, 'page')` in `useEffect`.
- In-shell boundaries (`(app)/error.tsx`, `(platform)/platform/error.tsx`) render `ErrorPanel` inside the existing layout (sidebar stays).
- No wordmark, no agency logo.
**Tests (TDD):** `ErrorPanel not_found copy`; `ErrorPanel error shows reference digest and never the message`; `error.tsx calls reportError once with page`; `Try again calls reset`; `global-error renders html and reports global`; leak test `not-found and error pages contain no Rival Monday` (render each); E2E `unknown URL shows Page not found with status 404`; E2E `a page that throws keeps the sidebar and shows Something went wrong` (dev-only route `app/dev-panel/throw` guarded like the existing dev panel, or an E2E-only flag — follow the existing dev-panel guard).
**Done when:** `pnpm --filter @cs/web exec vitest run error-panel not-found error global-error white-label-leak page-titles`, `pnpm --filter @cs/web e2e:affected`, `pnpm typecheck` green.

### Task 9: Cross-cutting sweeps
**Goal:** Line token works, one "You" colour, one owner-Billing rule, command input height (spec §3.7, P1, P4).
**Files:** `packages/ui/src/styles.css` (`--color-line`, `--you`/`--color-you`); every file from `rg -l "border-line|bg-line" apps/web/src packages/ui/src`; "You" sites: `app/(app)/c/[clientId]/rankings/page.tsx`, `app/(app)/c/[clientId]/reviews/{page,review-item}.tsx`, `components/charts/{line-chart,rank-trend,theme-heatmap}.tsx`; owner-Billing rule: `components/shell/app-shell.tsx:83` and the client-settings nav helper (`rg -n "client_owner" apps/web/src/components/shell apps/web/src/**/client-settings-nav*`); `packages/ui/src/components/command.tsx:37` (`h-10` → `h-9` to match the wrapper).
**Interfaces:** `export function showsClientBilling(role: Role, clientBilling: { enabled: boolean } | null | undefined): boolean` in the existing client-settings nav module; both callers use it.
**Behaviour:** P1 per-file review (visible rule → keep `line`; intended grey panel → `bg-muted-surface`). "You" markers use `text-you`/`fill-you`/`var(--you)`, never `primary` or hex; `theme-heatmap.tsx` hunk limited to the colour (15b-3 overlap). Dataviz check: run the dataviz skill's validator on the chart palettes that include `--you` (must stay distinguishable from competitor series).
**Tests (TDD):** `styles map --color-line`; `no component uses a hex for the You marker` (fs scan of the listed chart files for `#2A6BAC`/`#47A8E7`); `showsClientBilling true only for client_owner with billing enabled`; existing `command.test.tsx` updated for `h-9`.
**Done when:** `pnpm --filter @cs/ui test`, `pnpm --filter @cs/web exec vitest run app-shell settings-nav charts rankings reviews`, `pnpm typecheck` green; screenshots of Overview, Rankings, Reviews before/after attached to the task report.

### Task 10: Copy sign-off + wrap
**Goal:** Owner can sign off every new user-facing string; docs updated.
**Files:** create `docs/work/phase-15c1-copy-signoff.md` (moved to `docs/archive/` at merge); modify `docs/work/phase-15c.md` (Status, Interfaces: new `@cs/ui` exports, `lib/labels`, `lib/format/*`, `viewerTimeZone`, `reportError`, error pages, `--you`/`--color-line`/chip tokens; note for 13a and phase-7), `apps/web/CLAUDE.md` (≤ 3 lines: use `lib/format` + `lib/labels`, never local formatters; distances via `lib/format/distance`).
**Behaviour:** sign-off doc tables: every label in `lib/labels.ts` (value → label → tone), error/404 copy, ConfirmDialog/SaveBar default strings, miles strings ("≈ N mi (custom)", "Service area (miles)", "N miles around the business"), "Loading…". "Decisions for the owner" section lists any label you were unsure of.
**Done when:** `pnpm test:affected --base main`, `pnpm --filter @cs/web e2e:affected --base main`, `pnpm typecheck`, `pnpm lint` green; `git ls-files --eol | grep crlf` prints nothing.
