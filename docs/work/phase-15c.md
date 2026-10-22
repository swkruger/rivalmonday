# phase-15c — audit page fixes (UX/IA follow-up)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c   **Base:** main @ 10ce242d
**Plan/spec:** [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) (approved 2026-10-21); plan [15c-1](../superpowers/plans/2026-10-21-phase-15c1-shared-pieces.md); inputs [15 spec](../superpowers/specs/2026-10-18-phase-15-ux-ia-design.md) §4, [audit](../research/2026-10-18-phase-15-ux-audit.md)

## Status (overwrite)
Spec approved 2026-10-21. 15c-1 plan written, awaiting owner approval. 15c-2 and 15c-3 plans follow after 15c-1 merges.

## Next (overwrite)
Owner approves the 15c-1 plan → Task 0 pre-flight (install, `cs_phase_15c_test`) → Task 1 mockups (owner gate) → SDD.

## Interfaces this branch adds or changes
TBD. Likely no migration; next free **0084** (main 0080, phase-7 0081/0082, 15b-3 0083).

## Assumes from other branches
- **phase-7**: 7a2 must expose archive as a service function (not only CLI) for 15c-3's archive button; edits `nav-items.ts`, `server/nav.ts`, `/platform/health`, `agency/page.tsx`, agency settings `ai/billing/branding/slack-teams/team`, evidence, `rankings/page.tsx`, client `settings/{ai,delivery}`, `onboarding`, `ask/*`, `next.config.ts`; adds Sentry. Our `error.tsx` leaves it a capture seam.
- **phase-15b3** (docs only so far): 3b renames `/platform/themes`→`/platform/topics`, `?theme=`, `ThemeQueue`, `ThemeHeatmap`, `pendingThemes`.
- **13a** (planned, unbuilt): root `app/{not-found,error,global-error}.tsx`, host-aware titles, `client-profile-form.tsx`, `/start*`. Overlaps our error pages and miles work.
- **phase-7-planning**: parked, no overlap.

## Decisions (owner-approved)
C1–C11 in the 15c spec §2 (split; neutral error pages now; miles in UI; small features incl. intake preview + page diff; agency management incl. separate plans; hold = read-only + billing paused; start now, theme pages last; tz rule; mobile sheet; mockups + copy sign-off per sub-phase). 15c-1 mockups approved 2026-10-21 as planned (chip tints = plan P2, copy unchanged); service area radius = rank radius select (plan R1).

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope
Roadmap row 15 ("15c page fixes"), 15 spec D1 + §4, core §5.1–5.2. 15b-2 C2/C4 left formatters, miles, chips, error pages, layout and non-(H) structural items to 15c. 15a/15b already fixed the leaks, headers, terminology, pressure/confidence labels, heatmap legend and Setup "Advanced". **Still open (checked in code):**
- **Cross-cutting (§3):** no `loading`/`error`/`not-found`; solid `Badge`s + hex chips; 2× `formatUsd`, `formatMoney`, ~8 local `fmt`; km in 5 places; 42 `border-line`/`bg-line`; table standard; one "You" colour; `FilterBar`/"Apply".
- **Platform:** agencies `limit: 100`, no search; agency detail "coming soon", unconfirmed billing actions, raw enums; billing tabs + confirms; leads/reviews raw values, no paging; themes confirm; Ask chips/JSON/times; knowledge, costs tidy-ups.
- **Agency:** Portfolio tiles, ISO week, Pause confirm; Approvals chips/empty copy; detail tz + pressed state; Alert review age, 200 cap, client filter; Usage empty state + dialog; Runbook keys/confirms (re-check); Team labels/resend; Branding labels/contrast; Webhooks kinds/delete/test; Billing "Paused"; Intake preview, white-on-light; Onboarding form details.
- **Client:** StartingPointCard, ad chart width; profile raw enums; Changes capture details, fake tabs, mobile viewer; Pricing/Ads/Reviews small fixes; Rankings km + "You" colour; Moves mobile; Recommendations "Effort L", "For you"; Ask delete + visibility line; raw alert/report/evidence values; Setup/Profile/Delivery/Alert-rules form a11y; Billing contact link.
- **Account/public:** Inbox tz/unread/client name; Notifications duplicate ids + errors; sign-up links/resend; `/start` focus, privacy, CTA.

### 2. Already built — reuse, don't rebuild (`apps/web/src/`)
- `components/page-header.tsx`, `client-crumbs.ts`, `prev-next.tsx`, `settings-nav.tsx`, `shell/nav-items.ts`.
- `components/help/*` (`HelpTip`, `FieldHint`, `EmptyState`, `PageGuide`), `help/copy/*`. Gates: `help/coverage.test.ts`, `terminology.test.ts`, `app/white-label-leak.test.tsx`.
- `@cs/ui`: Dialog, Sheet, Table, Tabs, `TabsLink`, Tooltip, Badge. Missing: Skeleton, StatusChip, ConfirmDialog, SaveBar.
- `form-error.tsx`, `stat-card.tsx`, `pressure-badge.tsx`, `platform/_components/health-pill.tsx`, `rankings/tabs.tsx` (correct tabs).
- Formatters: `components/billing/format.ts`, `server/format.ts`, `client-billing/money.ts`, `briefs/format.ts` (`formatDay(v, tz)`). Data: `client.timezone`, core geo 2–40 km.
- Tools: `list_platform_agencies` (cursor), `list_alert_queue` (200 cap), list tools with offset.

### 3. Binding decisions
- CLAUDE.md: brand tokens, 1560px, SVG charts + dataviz, reads via tools / writes via `runTool`, 404 refusals.
- 15b: every `PageHeader` page needs a help key + guides; client roles never get agency text; copy signed off per batch.
- 15 spec D1, D8, D11, D12, §2.7, §4; 15b-2 C2–C4; 15b-3 D3 (no theme redirects); 13a's proposed 404/error copy.
- Owner: mockup first; calm chips.

### 4. Backlog to fold in
- [ ] **15c** page fixes from the audit (§2–§3 tagged 15c: `loading.tsx`/`error.tsx`/404 + Skeleton, StatusChip + enum labels, date/money/unit formatters (miles), ConfirmDialog, SaveBar, mobile list/detail for Changes/Moves, `/platform/billing` tabs, a11y sweep). Also: ~50 `border-line`/`bg-line` uses (`bg-line` draws nothing); mixed date formats in BriefView/AlertView; intake button white text on light agency colours; owner-Billing rule duplicated (`client-settings-nav.ts` + `app-shell.tsx`); command input h-10 in h-9 wrapper; briefs tab list clips if it overflows — *phase-15a*. From 15b-2: non-(H) audit items (Ask visibility line, alert-rules band bar), Moves "N signals" → "N changes", km → miles (rankings radius, profile Area), Report page empty state when no data, billing guide's "Not available" status, "Google place id" label for clients, tips inside `CardTitle` lengthen heading accessible names — *phase-15b2*
- [ ] **UI/UX review against Mobbin** (optional cross-check of 15b/15c) — *owner*
- Related Polish: Ask delete (6b), knowledge preview (6c), webhooks/`PrefSwitch` (5a), Usage/alert cap (5b), feed hex (5c-1), heatmap table (5c-2), costs strip (8c).

### 5. In-flight workstreams
See **Assumes**. No table or tool conflicts.

### 6. Open questions for the owner
1. **Split?** (a) 15c-1 foundations (primitives, formatters, miles, chips, confirms, error/loading) then 15c-2 page fixes; (b) by zone; (c) one branch. **Rec: (a).**
2. **Error/404 vs 13a/phase-7:** (a) 15c builds neutral pages with 13a's copy + Sentry seam; 13a makes them host-aware; (b) in-shell only, root pages stay 13a; (c) all to 13a. **Rec: (a).**
3. **Miles:** (a) UI miles in and out, km stored; (b) migrate storage; (c) display only. **Rec: (a).**
4. **Feature-like items:** (a) all; (b) cheap ones (delete, resend, search, paging, filter), previews/diff to backlog; (c) fixes only. **Rec: (b).**
5. **Agency "coming soon":** (a) remove + link existing actions; (b) build management (overlaps 7a2); (c) leave. **Rec: (a).**
6. **Order vs 15b-3:** (a) start now, theme files last; (b) wait; (c) rebase later. **Rec: (a).**
7. **Time zones:** (a) client tz on client pages, viewer tz elsewhere (labelled); (b) viewer tz; (c) UTC. **Rec: (a).**
8. **Mobile list/detail:** (a) Sheet below `lg`; (b) route; (c) anchor. **Rec: (a).**
9. **Mockups/sign-off:** (a) mockups for chips, sheet, error, tabs + one copy doc per sub-phase; (b) mockups for all; (c) copy only. **Rec: (a).**
