# Phase 5c-1 — Client Workspace Core (Overview, Changes & Evidence Viewer, Moves, Competitor Profiles, Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the client workspace into the intelligence dashboard of spec §5.2 for the core modules: Overview (module 1), Competitor profile & timeline (2), Changes feed + evidence viewer with before/after screenshots, a highlighted text diff and the hash (3), Moves (8), and Settings (11) — alert rules (score thresholds), client-owner competitor management, a read-only services & area view and an AI-connections placeholder. Evidence chips in briefs, alerts and recommendations become links. Also build the §8.2 read tools these screens need.

**Architecture:** Same shape as 5b-1/5b-2. Every new read and write is a registered tool in `@cs/tools` (audit-logged, reused by Phase 6 MCP/Ask). A shared `workspace/` module in `@cs/tools` holds the one definition of "which events a client sees" (decision 3), the evidence-access rule (decision 7) and pure helpers (word diff, labels). New screens are server components under `apps/web/src/app/(app)/c/[clientId]/`, gated by the per-client `dashboard` flag for client users (decision 2). Screenshots stream from the existing `ObjectStore` through a new access-checked route `/files/evidence/<clientId>/<evidenceId>`. No migration: event feedback reuses the `feedback` table (`kind = 'rating'`), and thresholds use the existing `client.score_thresholds` column (already column-granted to `app_user`).

**Tech Stack:** Next.js 16.3 App Router (server components + server actions), React 19.3, Tailwind CSS 4 + shadcn/ui (`@cs/ui`), Drizzle 0.44 / postgres.js, Zod 4, Vitest 3 + Testing Library + jsdom, Playwright Test 1.63. **No new libraries** — the word diff and the line chart are written here.

**Spec:** [docs/superpowers/specs/2026-09-29-core-platform-design.md](../specs/2026-09-29-core-platform-design.md). Sections used:
- §3 roles and per-client flags (`dashboard`, `manage_competitors`, `alert_rules`, `mcp`)
- §4.3 global vs tenant data (clients reach global data only via `client_competitor`)
- §4.4 evidence vault (sha256, screenshots, `legal_hold`, capture statuses "site blocks monitoring")
- §5.2 modules 1, 2, 3, 8, 11
- §6.3 score factor breakdown ("every score stores its factor breakdown for explainability")
- §6.4 moves (status, confidence, evidence chain)
- §8.2 tools: `get_competitor_profile`, `get_competitor_timeline`, `search_events`, `get_event`, `get_evidence`, `compare_snapshots`, `submit_feedback`, `get_ad_activity`, `list_moves`, `get_move`, `set_alert_rules`
- §11 (no cross-tenant existence leaks)

Obligations and previous plans:
- Owner scope: the [5a plan](2026-10-04-phase-5a-app-foundation-and-auth.md)'s "Phase 5 overview" table (5c row), split by the owner on 2026-10-08 (table below).
- Carry-over: the [roadmap](2026-09-29-roadmap.md)'s "Phase 5a carry-over" (evidence chips become links), "Phase 5b-1 carry-over" (client-owner self-service competitor management; new client modules in the sidebar's `client` group) and "Phase 5b-2 carry-over" (Minor 2: the pitch snapshot can't be reached after conversion).
- Patterns: the [5b-2 plan](2026-10-07-phase-5b2-agency-operations.md), which this plan follows step for step.
- Design: [docs/brand/mockups/01-client-overview.html](../../brand/mockups/01-client-overview.html) and [02-changes-evidence.html](../../brand/mockups/02-changes-evidence.html).

---

## Phase 5 position

| Sub-phase | Delivers |
|---|---|
| 5a ✅ | App foundation, auth, delivery routes |
| 5b-1 ✅ | Agency workflow core |
| 5b-2 ✅ | Agency operations |
| **5c-1 (this plan)** | Workspace read tools; Overview; Changes feed + evidence viewer; Moves; Competitor profile & timeline; client-owner competitor management; alert rules; services & area (read-only for clients); AI-connections placeholder; evidence chips as links; pitch snapshot after conversion |
| 5c-2 (written after 5c-1 merges) | Pricing tracker charts (module 4: `get_price_matrix`, `get_price_history`), Ads archive (5: `list_ads`), Reviews & reputation heatmap/benchmark (6: `get_theme_benchmark`, `search_reviews`, `get_rating_trend`), Local rankings geo-grid + share of voice (7: `get_geogrid`, `get_share_of_voice`); their sections on the competitor profile; their nav items between Changes and Moves |

Owner decisions of 2026-10-08 (binding): split as above; client users see the new modules only with the `dashboard` flag; the evidence viewer shows full screenshots plus a highlighted text diff, with **no** boxes drawn on the screenshots; charts are hand-written inline SVG.

## Global Constraints

- Node 24 locally, pnpm 10, Turborepo 2.11.5. Before changing `turbo.json`, read `node_modules/turbo/docs/README.md` (repo `AGENTS.md` rule). This plan does not change `turbo.json`.
- Before writing Next.js code, read the bundled docs in `apps/web/node_modules/next/dist/docs/` for the API you touch (`apps/web/AGENTS.md`). Next 16: `proxy.ts`, not `middleware.ts`; `cookies()`, `headers()`, `params` and `searchParams` are **async**.
- Every new read or write the web app performs is a **registered tool** in `@cs/tools`: `defineTool`, with its array added to `src/tools/all.ts`. Server actions call tools with `runTool`; pages read with `callTool`. Never call an engine/service function directly from `apps/web`. The one exception is file streaming (`serveEvidence`), which checks access through the registry first, exactly like `servePdf`.
- Tool output dates are ISO strings. Tool names match `/^[a-z][a-z0-9_]{1,63}$/`. Id inputs are `z.string().uuid()`.
- Error codes:
  - a row that exists but is not the caller's → `ToolError('not_found')`;
  - the caller's own role or flag is wrong → `permission_denied` (the registry does this from `permission`/`feature`);
  - bad input the user can fix → `invalid_input` with a human sentence.
  - Pages turn all three into **404** (spec §11). Forms show the `invalid_input` message, and "Not found" for the other two.
- Tenant tables (`event_score`, `move`, `move_event`, `client`, `client_competitor`, `alert`, `brief`, `brief_item`, `prospect_report`) are read through `withTenant(deps.app, ctx, …)`. Global tables (`event`, `event_change`, `detected_change`, `capture`, `evidence`, `tracked_page`, `ad`, `observation`, `competitor`, `competitor_source`, `feedback`) may be read with the **service** Db, but **only after** an RLS-backed check proved the client may see that competitor or event (`workspaceClient` + `requireVisibleEvent` / `requireTracked` / `competitorLinked`).
- **Every event reader filters `event.retracted_at IS NULL`** and every change reader filters `detected_change.status = 'event'` (HANDOVER §6). Use the shared `clientEvents()` condition — never write a new event query without it.
- `upsell_tag` is never returned to client roles. This plan adds no new reader of `brief_item`/`recommendation` columns beyond the existing tools. The Overview reuses `get_brief`/`list_recommendations`, which already strip it.
- Client-facing status filters hold everywhere: client roles see only `approved`/`sent` briefs and `delivered` alerts (the 5a rule). `competitorLinked` (Task 4) applies the same filters.
- **No crawling of real competitors.** Nothing in this plan enqueues `discover-pages` or any paid job. Client owners can accept/add competitors (which starts vendor collection, as for agency users), but "Find competitors" (a paid search) stays agency-only.
- Brand: Inter; primary `#47A8E7`, secondary `#2A6BAC`, accent `#F5A524`, ink `#0B2540`, canvas `#F6F9FC`, muted surface `#EEF2F6`.
  - Cards: `rounded-[14px] bg-surface p-6 shadow-card`.
  - Page titles: `text-[26px] font-extrabold tracking-tight`.
  - Messages: `rounded-lg bg-muted-surface p-3 text-ink` (`role="alert"` for errors).
  - Links: `font-semibold text-primary-soft-text`.
  - KPI numbers: `text-[34px] font-extrabold text-secondary`.
  - Status pills: alert `bg-[#FEE2E2] text-[#B91C1C]`; brief `bg-[#FFF3DC] text-[#B45309]`; archive `bg-muted-surface-2 text-muted-foreground`; up `bg-[#DCFCE7] text-[#15803D]`; info `bg-primary-soft text-primary-soft-text`. Check `packages/ui/src/styles.css` first: if a token already exists for one of these colours, use the token.
- **Chart colours** (Task 16, validated with the dataviz skill's validator on 2026-10-08, adjacent pairs, light surface): series slots in fixed order `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4`; "Other" `#94a3b8`. Three slots are below 3:1 contrast, so every chart ships a legend **and** a table view. Text never takes a series colour.
- New nav items go in `apps/web/src/components/shell/nav-items.ts` **and** the `ICONS` map in `sidebar-nav.tsx` (`satisfies Record<NavItem['icon'], unknown>`), with a case in `sidebar-nav.test.tsx`. Client modules go in the `client` group, in mockup order: Overview, Competitors, Changes, *(5c-2: Pricing, Ads, Reviews, Local rankings)*, Moves, Recommendations, then the settings items (Profile / Services & area, Delivery, Alert rules, AI connections). Each page's task adds its own nav item, so no link points at a route that doesn't exist yet.
- Action-result messages live in a component that stays mounted across `revalidatePath` (HANDOVER §6; precedents `ReviewFooter`, `AlertList`, `TrackedCompetitorsTable`). A switch backed by a server action uses `useOptimistic` + `startTransition` (`AutoSendSwitch`).
- Forms: plain `FormData` + `useActionState(action, { ok: true } as FormResult)`; native `<select>`/`<textarea>`. Filters on read pages are plain `GET` forms and links (no client JS needed).
- Never import `@cs/email` (root) or `@cs/tools` from a `'use client'` file. Client components get labels and plain data from their server parent (HANDOVER §6, `@cs/email/branding` rule).
- LF line endings only. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- Test runs:
  - Focused: `pnpm --filter <pkg> exec vitest run <pattern>`, in the foreground with `timeout: 600000`.
  - Never start two test runs at once (they share `cs_test`).
  - Never hand back while a test run you started is still running.
  - Before E2E, check free commit memory (HANDOVER §6, `Get-CimInstance Win32_OperatingSystem` → `FreeVirtualMemory` ≥ ~8 GB).

## Review Focus

1. **Evidence or events of another tenant, another client, or a dropped competitor.** An `eventId`, `changeId`, `moveId`, `evidenceId` or `competitorId` from another agency, from another client of the same agency, or of a competitor this client no longer tracks must give `not_found` from every new tool. For evidence the rule is decision 7's rule instead (tracked now, or cited by this client's visible alert or brief item). `/files/evidence/…` must answer 404 with no bytes. Tests: Tasks 3, 4, 5, 10, 12.
2. **A client user without the right flag.** These must all get `permission_denied` (→ 404 page): a client owner or viewer without `dashboard` calling any workspace read tool; a viewer, or an owner without `alert_rules`, calling `set_alert_rules`; an owner without `manage_competitors` accepting, adding or removing a competitor; an email-link guest or viewer calling `submit_feedback`. Evidence (`get_evidence` and the file route) deliberately needs **no** `dashboard` flag, because briefs-only clients' brief chips must work. Tests: Tasks 3, 4, 7, 14, 18.
3. **Retracted events and superseded changes resurfacing.** A retracted event must never appear in the feed, a timeline, a move's evidence chain, a move's event count, the Overview counts or an evidence page's "part of these changes" list, and `get_event` on it is `not_found`. A `superseded`/`suppressed` change is never listed and `compare_snapshots` on it is `not_found`. A move whose events were all retracted is not listed. Tests: Tasks 3, 4, 10, 12, 15.
4. **Threshold input.** Each of these gets a clear `invalid_input` and changes nothing: `brief ≥ alert`, `alert` 0 or 101, `brief` 0, 70.5, `NaN`, a missing value. "Use the defaults" stores `NULL`, and reading it back returns the pack's 70/40. Saving never re-routes events already scored. Tests: Task 18.
5. **Evidence with missing pieces.** None of these may produce a 500: an `unchanged` capture (no screenshot of its own — falls back to the newest earlier screenshot of that page, labelled), a screenshot row whose object is missing from the store (route 404, viewer shows "not available"), a vendor-only change (ads/reviews/GBP: no screenshot, structured details instead), a page with no earlier screenshot at all, an `html`/`vendor_json` evidence id on the file route (404, never served raw), and before/after texts too large to diff word by word (falls back to whole-block delete + insert). Tests: Tasks 2, 4, 5, 9.

---

## Decisions

1. **Split and scope.** 5c-1 builds modules 1, 2, 3, 8 and 11. Pricing, Ads, Reviews and Local rankings (modules 4–7) are 5c-2 (owner, 2026-10-08). The Overview's "Ask Friday" panel is not built (Ask is Phase 6). The competitor profile gets its pricing/ads/reviews/rankings sections in 5c-2.
2. **The `dashboard` flag.** Workspace read tools are `permission: 'read', feature: 'dashboard'`: agency roles bypass the flag (registry rule), and client roles need it. Pages check `hasFeature(ctx, 'dashboard')` and 404 otherwise. Without the flag, a client user keeps today's 5a home (briefs, alerts, reports) plus Recommendations. Guests (email-link sessions) carry the client's flags, read-only. **Exception:** evidence (`get_evidence`, the evidence page and `/files/evidence`) needs only `read`, because brief/alert chips must work for briefs-only clients.
3. **What a client sees of the event stream.** These conditions together, defined once in `workspace/scope.ts`:
   - an `event_score` row exists for this client;
   - the event's competitor is **currently** tracked by this client (`client_competitor`);
   - `event.retracted_at IS NULL`.

   All routes are visible, including `archive` (spec §5.2 "all scored events"); the feed defaults to alert + brief. The self business never appears (it is never scored). Removing a competitor hides its history from the feed, timeline and moves; re-adding brings it back.
4. **Feed filters** (`search_events`): competitor, change type, service (the client's vertical service id, matched on `event.services ->> vertical`), route (`flagged` = alert + brief, default; `all`; `archive`), period (7/30/90/365 days on `occurred_at`, default 30), min score, and text (`ILIKE` on the summary, with `%`/`_`/`\` escaped). Ordered by `occurred_at DESC, id DESC`, page size 50 (max 100), `offset` paging with `hasMore`.
5. **Evidence viewer** (owner: no boxes). For a change, `compare_snapshots` returns a before side and an after side, each with:
   - the capture's own `screenshot` evidence; otherwise the newest earlier screenshot of the **same tracked page**, flagged `fallback: true` and labelled "as of <date>";
   - the text evidence id;
   - the hash: the `html` evidence's `sha256`, else the `text` one's.

   It also returns a word-level diff (`wordDiff`) of the change's stored `before_text`/`after_text`, and its numeric facts. Vendor-channel changes (ads, reviews, GBP, jobs, rank) have no screenshots; the viewer shows their structured details (`detailLines`) instead. Tabs are links: Side by side · Text changes · Capture details. "Why this scored" shows the stored `ScoreFactors` (type weight, size, relevance with service/territory overlap, novelty) and the thresholds in force at scoring.
6. **Evidence files.** `/files/evidence/<clientId>/<evidenceId>` serves only kinds `screenshot` (`image/webp`) and `text` (`text/plain; charset=utf-8`). It first calls `get_evidence` through the registry; then it reads `object_key` with the service Db, then `store.get`. Headers: `cache-control: private, no-store`, `x-content-type-options: nosniff`, `content-disposition: inline`. `html` and `vendor_json` are never served raw (404) — the HTML is untrusted competitor markup.
7. **Who may open a piece of evidence.** Evidence of competitor X is open to client C when either:
   - C tracks X now; or
   - C has an alert, or a brief item, about X (for client roles: only `delivered` alerts and items of `approved`/`sent` briefs).

   So a delivered brief's chips keep working after the competitor is removed (spec §4.4, evidence kept for the brief's lifetime). The evidence page lists "part of these changes" only through decision 3's rule, and shows those links only to users with `dashboard`.
8. **Evidence chips** become links. One `EvidenceChips` component renders "Evidence 1…n" (at most 6, then "+N more"), each linking to `/c/<clientId>/evidence/<id>`. It replaces the duplicated span in `BriefView`, `AlertView`, `RecommendationBoard` and the approval editor (closes the 5a T14 duplication minor). The ids stored on `brief_item`/`alert`/`recommendation` are `evidence.id` values (from `loadEventEvidence`, `packages/engine/src/briefs/evidence.ts:64`).
9. **Event feedback** (`submit_feedback`): `{ clientId, eventId, verdict: 'useful' | 'not_relevant' | 'wrong', reason? }`, `permission: 'feedback'`, `feature: 'dashboard'`. The row goes into `feedback` with `subject_type = 'event'`, `kind = 'rating'`, `after = { verdict }` and `actor = ctx.userId`, written with the service Db after `requireVisibleEvent`. No migration is needed: `kind` already allows `'rating'` and `subject_type` has no CHECK. The newest verdict per user is shown (`get_event.myFeedback`). Feedback does not change scoring now; it is input for later tuning. Guests and viewers lack `feedback` (registry refusal).
10. **Moves.** `list_moves` (`status`: `open` default = `closed_at IS NULL`, `closed`, `all`; optional competitor) and `get_move` show only moves of currently tracked competitors that keep **at least one live event** (the quarterly-report rule). The shown status is `closed` when `closed_at` is set, otherwise the row's `emerging | active | fading`. `eventCount` counts live events only. `get_move` returns the evidence chain as event rows (decision 3 rule, newest first) and `details.facts` as label/value lines.
11. **Competitor profile** (`get_competitor_profile`, tracked competitors only, via the existing `requireTracked`):
    - GBP rating/reviews/category from the newest `gbp_profile` observation (`gbpSummary`), with its date;
    - active ads per platform (`ad.is_active`);
    - pressure from `pressureByClient`, and open moves (decision 10 rule);
    - collection status: `competitor_source` rows (label, last run, last status), active pages, and pages whose **latest** capture is `blocked`/`robots_disallowed` → "site blocks monitoring".

    `get_competitor_timeline`: events (decision 3) and move starts in the last 30/90/365 days (default 90), newest first, at most 200 events.
12. **Overview** (`get_workspace_overview`), computed on read:
    - `changes7d` = events scored in the last 7 days routed alert/brief; `alerts7d` = routed alert;
    - `priceMoves7d` = `price_change` events scored in the last 7 days whose service (client vertical) is one of the client's services; `priceCuts7d` = those with a `price` fact whose `after < before`;
    - `activeAds` now and 7 days ago = the sum of decision 13's points at weeks 0 and 1 (`null` when every competitor's point is `null`);
    - `rating` = the self business's newest GBP rating vs the mean of tracked competitors' newest GBP ratings (each `null` when unknown);
    - per-competitor pressure (strongest first);
    - `trackedCompetitors`, `zips`;
    - `pitchSnapshot`: true for agency roles when a `ready` `prospect_report` exists (5b-2 Minor 2). It links to a new `/c/<id>/pitch-snapshot` page that reuses `ProspectLandscape`.
13. **Ad activity** (`get_ad_activity`): one point per week, for `weeks` (4–26, default 12) points ending now, per tracked competitor. A point counts an ad when `first_seen_at ≤ t` and (`is_active` or `coalesce(ended_at, last_seen_at) > t`) — the same rule as `adActivity` (moves). A point before the competitor's first `ok` ad capture is `null` ("not looking yet"), never 0.
14. **Alert rules** = the client's score thresholds only (`client.score_thresholds`). Alert *mode* and delivery stay on the agency Delivery page.
    - `get_alert_rules`: `read` + feature `alert_rules`. Returns the effective `{ alert, brief }`, `custom`, and the pack `defaults`.
    - `set_alert_rules`: `manage` + feature `alert_rules`, so client owners with the flag and agency roles.
    - Input: whole numbers, `1 ≤ brief < alert ≤ 100`, or `reset: true` → `NULL`. `validThresholds` (engine) is the final guard. The write goes through `withTenant(deps.app, …)`, since `app_user` already holds `UPDATE (score_thresholds)`.
    - Only changes scored after the save are affected — routes already stored stay (said on the page).
15. **Client-owner competitor management** (5b-1 decision 1 carry-over).
    - The Competitors list opens to client users with `dashboard`.
    - Owners with `manage_competitors` can accept/dismiss suggestions, add and remove — the registry already allows this (`manage` + feature).
    - "Find competitors" (paid search), page pin and manual page add stay agency-only.
    - The competitor limit applies the same way.
    - Server actions no longer pre-reject non-agency roles for the manage tools; the tools decide.
16. **Services & area** stay agency-edited (5b-1 decision 3). Client users with `dashboard` get a read-only "Services & area" view at `/c/<id>/settings/profile`.
17. **AI connections** placeholder at `/c/<id>/settings/ai`, shown to agency roles and to client users with `mcp`. It is static text only (no tokens, no tools) until Phase 6.
18. **Charts** are hand-written inline SVG (owner). One `LineChart` component (Task 16), reused by 5c-2. At most 5 series: with more, the 4 highest latest values stay and the rest fold into "Other". Colours follow each entity's position in the name-sorted kept set, so they are stable for a given set. Every chart has a legend for ≥ 2 series, per-point native tooltips (`<title>` on 8 px hit targets), a "Show as table" view, and an `aria-label` summary. The app has no dark theme yet; when it gets one, add the reference palette's dark steps.
19. **Not in 5c-1:**
    - modules 4–7 and their tools (5c-2);
    - Ask, `search`/`fetch` (Phase 6);
    - "Add recommendation"/"Ask Friday" buttons in the viewer (Phase 6);
    - the volatile-mask unmask UI (roadmap 3d carry-over — 5c-2 or later; it must pass the capture id explicitly);
    - acting on a removed competitor's pending alerts/brief items (5b-1 Minor 5);
    - the trend-table "— → —" wording (owner undecided);
    - change-region boxes on screenshots (owner);
    - a dark chart theme.

## File structure

```
packages/core/src/access.ts                       hasFeature                                                    (Task 1)

packages/tools/
  src/workspace/word-diff.ts                      wordDiff, DiffSegment, MAX_DIFF_CELLS                        (Task 2)
  src/workspace/labels.ts                         CHANNEL_LABELS, SOURCE_LABELS, channelLabel, detailLines, factView, changeTypeOptions (Task 3)
  src/workspace/scope.ts                          workspaceClient, clientEvents, eventJoin, requireVisibleEvent, escapeLike (Task 3)
  src/workspace/events-read.ts                    eventRowSelect, toEventRow                                   (Task 3)
  src/workspace/evidence-access.ts                competitorLinked, snapshotSide                               (Task 4)
  src/workspace/ads.ts                            adWeeklySeries                                               (Task 15)
  src/tools/events.ts                             search_events, get_event, submit_feedback                    (Tasks 3, 7)
  src/tools/evidence.ts                           get_evidence, compare_snapshots                              (Task 4)
  src/tools/moves.ts                              list_moves, get_move                                         (Task 10)
  src/tools/competitor-profile.ts                 get_competitor_profile, get_competitor_timeline              (Task 12)
  src/tools/overview.ts                           get_ad_activity, get_workspace_overview                      (Task 15)
  src/tools/alert-rules.ts                        get_alert_rules, set_alert_rules                             (Task 18)
  src/tools/pages.ts                              export requireTracked                                        (Task 12)
  src/tools/schemas.ts                            new views                                                    (Tasks 3, 4, 10, 12, 15, 18)
  src/tools/all.ts                                register new arrays                                          (Tasks 3, 4, 10, 12, 15, 18)

apps/web/src/
  components/shell/nav-items.ts, sidebar-nav.tsx  feature flags + new client items                             (Tasks 1, 8, 11, 13, 14, 19)
  server/nav.ts                                   navFlagsFor feature flags                                    (Task 1)
  server/files.ts                                 serveEvidence                                                (Task 5)
  app/files/evidence/[clientId]/[evidenceId]/route.ts                                                         (Task 5)
  components/evidence-chips.tsx                   EvidenceChips                                                (Task 6)
  app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx                                                       (Task 6)
  app/(app)/c/[clientId]/changes/                 params.ts, group.ts, page.tsx, feed.tsx, viewer.tsx, diff-text.tsx, feedback-buttons.tsx, actions.ts (Tasks 8, 9)
  app/(app)/c/[clientId]/moves/page.tsx                                                                       (Task 11)
  app/(app)/c/[clientId]/competitors/[competitorId]/page.tsx   competitor profile                             (Task 13)
  app/(app)/c/[clientId]/competitors/{page.tsx,actions.ts,competitor-controls.tsx}  client-owner access        (Task 14)
  components/charts/line-chart.tsx                LineChart, foldSeries, SERIES_COLORS                         (Task 16)
  components/stat-card.tsx                        StatCard                                                     (Task 17)
  components/client-home-basic.tsx                the 5a home, moved                                           (Task 17)
  app/(app)/c/[clientId]/page.tsx                 Overview                                                     (Task 17)
  app/(app)/c/[clientId]/pitch-snapshot/page.tsx                                                              (Task 17)
  app/(app)/c/[clientId]/settings/{alerts,ai}/    alert rules, AI connections                                  (Task 19)
  app/(app)/c/[clientId]/settings/profile/page.tsx  read-only view for client users                           (Task 19)
apps/web/e2e/{seed.ts,workspace.spec.ts}          5c-1 E2E                                                     (Task 20)
```

---

### Task 1: Feature checks and nav flags

**Files:**
- Modify: `packages/core/src/access.ts`, `packages/core/src/access.test.ts`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/server/nav.ts`, `apps/web/src/server/nav.test.ts`, `apps/web/src/components/shell/sidebar-nav.test.tsx`

**Interfaces:**
- Produces:
  - `hasFeature(ctx: AccessContext, feature: Feature): boolean` (`@cs/core`) — true for agency roles, else `ctx.features.has(feature)`.
  - `NavRoleFlags` gains `dashboard: boolean; manageCompetitors: boolean; alertRules: boolean; mcp: boolean`.
  - `navItemsFor`'s client-role branch is restructured so later tasks add items in mockup order. This task's visible behaviour is unchanged.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/access.test.ts` — add:

```ts
describe('hasFeature', () => {
  const make = (role: Role, features: Feature[]) => createAccessContext({ agencyId: 'a', userId: 'u', role, clientScope: role === 'agency_admin' || role === 'account_manager' ? 'all' : ['c'], features });
  it('is always true for agency roles', () => {
    expect(hasFeature(make('account_manager', []), 'dashboard')).toBe(true);
  });
  it('follows the client flags for client roles', () => {
    expect(hasFeature(make('client_owner', ['dashboard']), 'dashboard')).toBe(true);
    expect(hasFeature(make('client_owner', []), 'dashboard')).toBe(false);
    expect(hasFeature(make('client_viewer', ['alert_rules']), 'mcp')).toBe(false);
  });
});
```

`apps/web/src/server/nav.test.ts` — add:

```ts
it('passes the client feature flags to the nav (agency roles get every flag)', () => {
  const owner = createAccessContext({ agencyId: 'a', userId: 'u', role: 'client_owner', clientScope: [C], features: ['dashboard', 'alert_rules'] });
  expect(navFlagsFor({ kind: 'user', ctx: owner, email: 'o@x.test' })).toMatchObject({ dashboard: true, alertRules: true, manageCompetitors: false, mcp: false });
  const am = createAccessContext({ agencyId: 'a', userId: 'u', role: 'account_manager', clientScope: 'all', features: [] });
  expect(navFlagsFor({ kind: 'user', ctx: am, email: 'am@x.test' })).toMatchObject({ dashboard: true, alertRules: true, manageCompetitors: true, mcp: true });
});
```

(`C` is any uuid constant already used in that file. If none exists, declare `const C = '11111111-1111-4111-8111-111111111111';`.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/core exec vitest run src/access.test.ts` and `pnpm --filter @cs/web exec vitest run src/server/nav.test.ts` → FAIL (`hasFeature` not exported; flags missing).

- [ ] **Step 3: Implement**

`packages/core/src/access.ts` — after `canManageCompetitors`:

```ts
/** 5c-1 decision 2: agency roles bypass per-client flags (as the registry does); client roles need the flag. */
export function hasFeature(ctx: AccessContext, feature: Feature): boolean {
  return isAgencyRole(ctx.role) || ctx.features.has(feature);
}
```

Check that `packages/core/src/index.ts` re-exports everything from `access.ts` (`export *`). If it lists names, add `hasFeature`.

`nav-items.ts` — extend `NavRoleFlags`:

```ts
export interface NavRoleFlags {
  isAgency: boolean;
  isAgencyAdmin: boolean;
  isUser: boolean;
  homePath: string;
  isPlatformOperator?: boolean;
  /** 5c-1 decision 2 — always true for agency roles. */
  dashboard: boolean;
  manageCompetitors: boolean;
  alertRules: boolean;
  mcp: boolean;
}
```

Restructure `navItemsFor`'s client items into one helper that both branches call, keeping today's output:

```ts
/** Client modules in mockup order (5c-1 Global Constraints). Later tasks add their item at the marked spot. */
function clientModules(flags: NavRoleFlags, base: string, add: (href: string, label: string, icon: NavItem['icon']) => void): void {
  add(base, 'Overview', 'overview');
  if (flags.isAgency) add(`${base}/competitors`, 'Competitors', 'competitors'); // Task 14 widens this to `flags.dashboard`
  // Task 8: Changes · 5c-2: Pricing, Ads, Reviews, Local rankings · Task 11: Moves
  add(`${base}/recommendations`, 'Recommendations', 'recommendations');
  if (flags.isAgency) {
    add(`${base}/settings/profile`, 'Profile', 'profile');
    add(`${base}/settings/delivery`, 'Delivery', 'delivery');
  }
  // Task 19: Services & area (client users), Alert rules, AI connections
}
```

In `navItemsFor`: the agency branch calls `if (clientId) clientModules(flags, `/c/${clientId}`, forClient);` and the client branch calls `clientModules(flags, flags.homePath, forClient);`. This moves Competitors before Recommendations (mockup order; the owner-approved grouped-sidebar design is unchanged). Update the existing `sidebar-nav.test.tsx` expectations that assert the old order, and add `dashboard: true, manageCompetitors: true, alertRules: true, mcp: true` to its agency flag fixtures and `false` to its client fixtures.

`server/nav.ts` — `navFlagsFor` returns the four new fields:

```ts
dashboard: hasFeature(v.ctx, 'dashboard'),
manageCompetitors: canManageCompetitors(v.ctx),
alertRules: hasFeature(v.ctx, 'alert_rules'),
mcp: hasFeature(v.ctx, 'mcp'),
```

- [ ] **Step 4: Run tests** — the Step 2 commands plus `pnpm --filter @cs/web exec vitest run src/components/shell` → PASS. Then `pnpm --filter @cs/core typecheck` and `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core apps/web/src/components/shell apps/web/src/server/nav.ts apps/web/src/server/nav.test.ts
git commit -m "feat: hasFeature and per-client feature flags in the nav"
```

---

### Task 2: Word-level diff

**Files:**
- Create: `packages/tools/src/workspace/word-diff.ts`, `packages/tools/src/workspace/word-diff.test.ts`

**Interfaces:**
- Produces: `type DiffOp = 'equal' | 'insert' | 'delete'`; `interface DiffSegment { op: DiffOp; text: string }`; `MAX_DIFF_CELLS = 4_000_000`; `wordDiff(before: string, after: string): DiffSegment[]` — adjacent segments of the same op merged, no empty segments. Joining `equal`+`delete` texts gives `before`; joining `equal`+`insert` gives `after`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { type DiffSegment, MAX_DIFF_CELLS, wordDiff } from './word-diff';

const side = (segs: DiffSegment[], drop: 'insert' | 'delete') => segs.filter((s) => s.op !== drop).map((s) => s.text).join('');

describe('wordDiff', () => {
  it('marks a changed price and keeps the rest equal', () => {
    expect(wordDiff('AC tune-up $99 today', 'AC tune-up $79 today')).toEqual([
      { op: 'equal', text: 'AC tune-up ' },
      { op: 'delete', text: '$99' },
      { op: 'insert', text: '$79' },
      { op: 'equal', text: ' today' },
    ]);
  });
  it('handles an empty side', () => {
    expect(wordDiff('', 'New fall special')).toEqual([{ op: 'insert', text: 'New fall special' }]);
    expect(wordDiff('Old promo', '')).toEqual([{ op: 'delete', text: 'Old promo' }]);
    expect(wordDiff('', '')).toEqual([]);
  });
  it('always recomposes both sides exactly', () => {
    const pairs: [string, string][] = [
      ['Furnace check $89. Call now!', 'Furnace check from $69. Call  now! Fall special — limited time'],
      ['a b c d e', 'e d c b a'],
      ['  leading and trailing  ', 'leading and\ttrailing'],
    ];
    for (const [a, b] of pairs) {
      const d = wordDiff(a, b);
      expect(side(d, 'insert')).toBe(a);
      expect(side(d, 'delete')).toBe(b);
      expect(d.every((s) => s.text.length > 0)).toBe(true);
      for (let i = 1; i < d.length; i++) expect(d[i]!.op).not.toBe(d[i - 1]!.op);
    }
  });
  it('falls back to a whole delete + insert when the texts are too large to align', () => {
    const big = Array.from({ length: Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10 }, (_, i) => `w${i}`).join(' ');
    const d = wordDiff(big, `${big} x`);
    expect(d).toEqual([{ op: 'delete', text: big }, { op: 'insert', text: `${big} x` }]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/workspace/word-diff.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `packages/tools/src/workspace/word-diff.ts`:

```ts
export type DiffOp = 'equal' | 'insert' | 'delete';
export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/** Above this many LCS cells (≈ 16 MB of Uint32) the diff gives up aligning and shows whole-block delete + insert (Review Focus 5). */
export const MAX_DIFF_CELLS = 4_000_000;

const tokens = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? [];

function merge(segs: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const s of segs) {
    if (s.text === '') continue;
    const last = out[out.length - 1];
    if (last && last.op === s.op) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** Decision 5: word-level diff (whitespace kept as its own tokens) by longest common subsequence. Pure. */
export function wordDiff(before: string, after: string): DiffSegment[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_DIFF_CELLS) return merge([{ op: 'delete', text: before }, { op: 'insert', text: after }]);
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }
  const out: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) {
      out.push({ op: 'delete', text: a[i++]! });
    } else {
      out.push({ op: 'insert', text: b[j++]! });
    }
  }
  while (i < n) out.push({ op: 'delete', text: a[i++]! });
  while (j < m) out.push({ op: 'insert', text: b[j++]! });
  return merge(out);
}
```

Re-export from `packages/tools/src/index.ts`: `export * from './workspace/word-diff';`.

- [ ] **Step 4: Run test** — the Step 2 command → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/workspace packages/tools/src/index.ts
git commit -m "feat(tools): word-level diff for the evidence viewer"
```

---

### Task 3: Workspace scope, labels, `search_events` and `get_event`

**Files:**
- Create: `packages/tools/src/workspace/scope.ts`, `packages/tools/src/workspace/labels.ts`, `packages/tools/src/workspace/labels.test.ts`, `packages/tools/src/workspace/events-read.ts`, `packages/tools/src/tools/events.ts`, `packages/tools/src/tools/events.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/index.ts`

**Interfaces:**
- Consumes: `withTenant`, `changeEvent`, `eventScore`, `eventChange`, `detectedChange`, `trackedPage`, `clientCompetitor`, `competitor`, `client`, `move`, `moveEvent` (`@cs/db`); `changeTypeLabel` (`@cs/email`); `MOVE_LABELS` (`src/pressure.ts`); `packsOf` (`src/deps.ts`); `CHANGE_TYPES` (`@cs/core`).
- Produces:
  - `workspaceClient(deps, ctx, clientId): Promise<WorkspaceClient>` where `WorkspaceClient = { id: string; name: string; verticalId: string; services: string[]; zips: number; selfCompetitorId: string | null }` — throws `not_found` when the client is out of scope or invisible.
  - `clientEvents(clientId: string): SQL` and `eventJoin: { change: SQL; tracked: SQL }` — decision 3, used with `.from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)`.
  - `requireVisibleEvent(deps, ctx, clientId, eventId): Promise<void>` — `not_found` "Change not found".
  - `escapeLike(s: string): string`.
  - `eventRowSelect` (Drizzle select map) and `toEventRow(r, verticalId, serviceNames: Map<string, string>): EventRow`.
  - Labels: `CHANNEL_LABELS`, `channelLabel(c)`, `SOURCE_LABELS`, `sourceLabel(s)`, `detailLines(d: ChangeDetails | null): { label: string; value: string }[]`, `factView(c: NumericChange): FactView`, `changeTypeOptions(): { id: string; label: string }[]` (every `CHANGE_TYPES` entry except `cosmetic`).
  - Schemas `EventRow`, `FactView`, `ScoreFactorsView`, `ChangeView`, `EventDetail` (all exported with types).
  - Tools `search_events` → `{ items: EventRow[]; hasMore: boolean }` and `get_event` → `EventDetail`.

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/workspace/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { changeTypeOptions, channelLabel, detailLines, factView } from './labels';

describe('workspace labels', () => {
  it('labels channels and falls back to a humanised key', () => {
    expect(channelLabel('meta_ads')).toBe('Meta ads');
    expect(channelLabel('some_new_thing')).toBe('Some new thing');
  });
  it('turns structured details into readable lines', () => {
    expect(detailLines({ count: 6, items: [{ id: '1', label: '$79 Tune-Up' }], ratingBefore: 4.4, ratingAfter: 4.1, keyword: 'ac repair' })).toEqual([
      { label: 'Count', value: '6' },
      { label: 'Items', value: '$79 Tune-Up' },
      { label: 'Rating', value: '4.4 → 4.1' },
      { label: 'Keyword', value: 'ac repair' },
    ]);
    expect(detailLines(null)).toEqual([]);
  });
  it('shows facts by their raw text', () => {
    expect(factView({ kind: 'price', before: { kind: 'price', value: 99, unit: 'USD', raw: '$99', context: '' }, after: { kind: 'price', value: 79, unit: 'USD', raw: '$79', context: '' }, pct: -20.2 }))
      .toEqual({ kind: 'price', before: '$99', after: '$79', pct: -20.2 });
  });
  it('offers every change type but cosmetic as a filter', () => {
    const ids = changeTypeOptions().map((o) => o.id);
    expect(ids).toContain('price_change');
    expect(ids).not.toContain('cosmetic');
  });
});
```

`packages/tools/src/tools/events.test.ts` — the seeding below follows `portfolio.test.ts`/`read-tools.test.ts`; check `packages/db/src/schema/engine.ts` and `evidence.ts` for any required column it misses and add it:

```ts
import { type AccessContext, createAccessContext, type Feature } from '@cs/core';
import { capture, changeEvent, clientCompetitor, detectedChange, eventChange, eventScore, move, moveEvent, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createPackLoader } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';
import type { EventDetail, EventRow } from './schemas';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, packs: createPackLoader() }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], features: Feature[] = [], agencyId = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features });
const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);
const day = 86_400_000;
const FACTORS = { typeWeight: 1, size: 0.95, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9, maxSimilarity: 0.1, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 1 };

let pageId: string;
async function seedEvent(o: { score: number; route: string; ageDays: number; type?: string; summary?: string; retracted?: boolean; competitorId?: string; services?: Record<string, string | null> }) {
  const at = new Date(Date.now() - o.ageDays * day);
  const competitorId = o.competitorId ?? IDS.competitorX;
  const [before] = await dbs.owner.insert(capture).values({ competitorId, trackedPageId: pageId, source: 'web', url: 'https://smithhvac.example/pricing', status: 'ok', collectorVersion: 't', capturedAt: new Date(at.getTime() - day) }).returning();
  const [after] = await dbs.owner.insert(capture).values({ competitorId, trackedPageId: pageId, source: 'web', url: 'https://smithhvac.example/pricing', status: 'ok', collectorVersion: 't', capturedAt: at }).returning();
  const [ch] = await dbs.owner.insert(detectedChange).values({ competitorId, trackedPageId: pageId, source: 'web', kind: 'modified', beforeCaptureId: before!.id, afterCaptureId: after!.id, beforeText: 'AC tune-up $99', afterText: 'AC tune-up $79', numericChanges: [], status: 'event', stageVersion: 1, detectedAt: at }).returning();
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId, changeType: o.type ?? 'price_change', channels: ['web'], services: o.services ?? { hvac_plumbing: 'ac_tune_up' }, summary: o.summary ?? 'Smith HVAC cut its AC tune-up to $79', confidence: 0.9, occurredAt: at, retractedAt: o.retracted ? at : null }).returning();
  await dbs.owner.insert(eventChange).values({ eventId: e!.id, changeId: ch!.id });
  await dbs.owner.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score: o.score, route: o.route, factors: FACTORS as never, packVersion: 1, scoredAt: at });
  return { eventId: e!.id, changeId: ch!.id, afterCaptureId: after!.id };
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [p] = await dbs.owner.insert(trackedPage).values({ competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'nav' }).returning();
  pageId = p!.id;
});

const search = (c: AccessContext, input: Record<string, unknown> = {}) =>
  registry.invoke(c, 'search_events', { clientId: IDS.clientA1, ...input }) as Promise<{ items: EventRow[]; hasMore: boolean }>;

describe('search_events', () => {
  it('lists flagged events by default, newest first, with labels and evidence counts', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await seedEvent({ score: 50, route: 'brief', ageDays: 2, type: 'promo', summary: 'Fall special' });
    await seedEvent({ score: 12, route: 'archive', ageDays: 3, summary: 'Footer tweak' });
    const r = await search(am);
    expect(r.items.map((i) => i.route)).toEqual(['alert', 'brief']);
    expect(r.items[0]).toMatchObject({ competitorName: 'Smith HVAC', typeLabel: 'Price change', score: 86, evidenceCount: 1, serviceId: 'ac_tune_up' });
    expect((await search(am, { route: 'archive' })).items.map((i) => i.summary)).toEqual(['Footer tweak']);
    expect((await search(am, { route: 'all' })).items).toHaveLength(3);
  });

  it('never shows retracted events or competitors the client no longer tracks (decision 3)', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1, retracted: true });
    const live = await seedEvent({ score: 60, route: 'brief', ageDays: 1 });
    expect((await search(am)).items.map((i) => i.eventId)).toEqual([live.eventId]);
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    expect((await search(am)).items).toEqual([]);
  });

  it('filters by type, service, period, score and text (with LIKE wildcards escaped)', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1, summary: '100% off first visit' });
    await seedEvent({ score: 45, route: 'brief', ageDays: 40, type: 'promo', services: { hvac_plumbing: null } });
    expect((await search(am, { changeType: 'promo', days: 90 })).items).toHaveLength(1);
    expect((await search(am, { serviceId: 'ac_tune_up' })).items).toHaveLength(1);
    expect((await search(am, { days: 7 })).items).toHaveLength(1);
    expect((await search(am, { minScore: 80, days: 90 })).items).toHaveLength(1);
    expect((await search(am, { query: '100%' })).items).toHaveLength(1);
    expect((await search(am, { query: '_%' })).items).toHaveLength(0);
  });

  it('pages with hasMore', async () => {
    for (let i = 0; i < 3; i++) await seedEvent({ score: 60, route: 'brief', ageDays: i + 1 });
    const first = await search(am, { limit: 2 });
    expect([first.items.length, first.hasMore]).toEqual([2, true]);
    const second = await search(am, { limit: 2, offset: 2 });
    expect([second.items.length, second.hasMore]).toEqual([1, false]);
  });

  it('needs the dashboard flag for client users and hides other tenants (Review Focus 1, 2)', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    expect((await search(owner)).items).toHaveLength(1);
    await expect(search(ownerNoDash)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(search(otherAgency)).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'search_events', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_event', () => {
  it('returns the score breakdown, live changes and moves', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const [m] = await dbs.owner.insert(move).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.7, summary: 'Price war', details: { eventCount: 1, channels: ['web'], facts: {} }, ruleVersion: 2, firstDetectedAt: new Date(), lastHeldAt: new Date(), lastEvidenceAt: new Date() }).returning();
    await dbs.owner.insert(moveEvent).values({ moveId: m!.id, eventId: e.eventId });
    const d = (await registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })) as EventDetail;
    expect(d.factors).toMatchObject({ typeWeight: 1, size: 0.95, relevance: 1, novelty: 0.9, thresholds: { alert: 70, brief: 40 } });
    expect(d.changes).toEqual([expect.objectContaining({ changeId: e.changeId, channel: 'web', channelLabel: 'Website', pageUrl: 'https://smithhvac.example/pricing', hasTextDiff: true })]);
    expect(d.moves).toEqual([{ id: m!.id, label: 'Price war', status: 'active' }]);
  });

  it('hides superseded changes, and a retracted or foreign event is not found (Review Focus 3)', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await dbs.owner.update(detectedChange).set({ status: 'superseded' }).where(eq(detectedChange.id, e.changeId));
    expect(((await registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })) as EventDetail).changes).toEqual([]);
    const r = await seedEvent({ score: 86, route: 'alert', ageDays: 1, retracted: true });
    await expect(registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: r.eventId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

If `createPackLoader` is not exported from `@cs/engine`'s root, import it from where `apps/web/src/server/tools.ts` gets the `packs` dependency, and mirror that.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/workspace/labels.test.ts src/tools/events.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`packages/tools/src/workspace/labels.ts`:

```ts
import { CHANGE_TYPES } from '@cs/core';
import type { ChangeDetails, NumericChange } from '@cs/db';
import { changeTypeLabel } from '@cs/email';

const humanise = (k: string): string => {
  const s = k.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const CHANNEL_LABELS: Record<string, string> = {
  web: 'Website', google_ads: 'Google ads', meta_ads: 'Meta ads', google_business_profile: 'Google Business Profile',
  google_reviews: 'Google reviews', google_jobs: 'Google Jobs', rank: 'Local rankings',
};
export const channelLabel = (c: string): string => CHANNEL_LABELS[c] ?? humanise(c);

/** `competitor_source.source` values (`SOURCE_KINDS`, `@cs/collectors`). */
export const SOURCE_LABELS: Record<string, string> = { gbp: 'Google Business Profile', reviews: 'Google reviews', ads_google: 'Google ads', ads_meta: 'Meta ads', jobs: 'Google Jobs' };
export const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? humanise(s);

export interface DetailLine { label: string; value: string }

/** Decision 5: structured facts of a vendor-channel change, as readable lines (no raw JSON on screen). */
export function detailLines(d: ChangeDetails | null | undefined): DetailLine[] {
  if (!d) return [];
  const out: DetailLine[] = [];
  const pair = (a: unknown, b: unknown) => `${a ?? '—'} → ${b ?? '—'}`;
  if (d.count !== undefined) out.push({ label: 'Count', value: String(d.count) });
  if (d.items?.length) out.push({ label: 'Items', value: d.items.slice(0, 5).map((i) => i.label).join(', ') });
  if (d.field) out.push({ label: 'Field', value: humanise(d.field) });
  if (d.ratingBefore !== undefined || d.ratingAfter !== undefined) out.push({ label: 'Rating', value: pair(d.ratingBefore, d.ratingAfter) });
  if (d.votesBefore !== undefined || d.votesAfter !== undefined) out.push({ label: 'Reviews', value: pair(d.votesBefore, d.votesAfter) });
  if (d.themeName) out.push({ label: 'Theme', value: d.themeName });
  if (d.keyword) out.push({ label: 'Keyword', value: d.keyword });
  if (d.avgRankBefore !== undefined || d.avgRankAfter !== undefined) out.push({ label: 'Average rank', value: pair(d.avgRankBefore, d.avgRankAfter) });
  if (d.top3Before !== undefined || d.top3After !== undefined) out.push({ label: 'Top-3 points', value: pair(d.top3Before, d.top3After) });
  if (d.offer) out.push({ label: 'Offer', value: String(d.offer) });
  return out;
}

export interface FactLine { kind: string; before: string | null; after: string | null; pct: number | null }
export const factView = (c: NumericChange): FactLine => ({ kind: c.kind, before: c.before?.raw ?? null, after: c.after?.raw ?? null, pct: c.pct });

export const changeTypeOptions = (): { id: string; label: string }[] =>
  CHANGE_TYPES.filter((t) => t !== 'cosmetic').map((t) => ({ id: t, label: changeTypeLabel(t) }));
```

Check the exact optional field names on `ChangeDetails` (`packages/db/src/schema/engine.ts:46`) — the HANDOVER lists `ratingBefore/After`, `votesBefore/After`, `keyword`, `avgRankBefore/After`, `top3Before/After`, `offer`, `themeName`. Drop any line whose field doesn't exist rather than casting. If `NumericChange`/`ChangeDetails` aren't exported from `@cs/db`'s root, import them from the schema path the engine uses.

`packages/tools/src/workspace/scope.ts`:

```ts
import { type AccessContext, canAccessClient, ToolError } from '@cs/core';
import { changeEvent, client, clientCompetitor, eventScore, withTenant } from '@cs/db';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { ToolDeps } from '../deps';

export interface WorkspaceClient {
  id: string;
  name: string;
  verticalId: string;
  services: string[];
  zips: number;
  selfCompetitorId: string | null;
}

/** The client row through RLS — `not_found` for anything out of scope (spec §11). */
export async function workspaceClient(deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<WorkspaceClient> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: client.id, name: client.name, verticalId: client.verticalId, services: client.services, serviceArea: client.serviceArea, selfCompetitorId: client.selfCompetitorId })
      .from(client).where(eq(client.id, clientId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
  return { id: c.id, name: c.name, verticalId: c.verticalId, services: c.services ?? [], zips: c.serviceArea?.zips.length ?? 0, selfCompetitorId: c.selfCompetitorId };
}

/** Decision 3 joins: event_score → event, and the event's competitor still tracked by this client. */
export const eventJoin = {
  change: eq(changeEvent.id, eventScore.eventId),
  tracked: and(eq(clientCompetitor.clientId, eventScore.clientId), eq(clientCompetitor.competitorId, changeEvent.competitorId))!,
};

/** Decision 3 condition — scored for this client and not retracted. Every workspace event reader uses it. */
export const clientEvents = (clientId: string): SQL => and(eq(eventScore.clientId, clientId), isNull(changeEvent.retractedAt))!;

export async function requireVisibleEvent(deps: ToolDeps, ctx: AccessContext, clientId: string, eventId: string): Promise<void> {
  const [e] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: changeEvent.id }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
      .where(and(clientEvents(clientId), eq(changeEvent.id, eventId))));
  if (!e) throw new ToolError('not_found', 'Change not found');
}

export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);
```

`packages/tools/src/workspace/events-read.ts`:

```ts
import { changeEvent, competitor, eventScore } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { sql } from 'drizzle-orm';
import type { EventRow } from '../tools/schemas';

export const eventRowSelect = {
  eventId: changeEvent.id, competitorId: changeEvent.competitorId, competitorName: competitor.name, changeType: changeEvent.changeType,
  channels: changeEvent.channels, services: changeEvent.services, summary: changeEvent.summary, score: eventScore.score, route: eventScore.route,
  occurredAt: changeEvent.occurredAt, scoredAt: eventScore.scoredAt,
  evidenceCount: sql<number>`(SELECT count(*)::int FROM event_change ec WHERE ec.event_id = ${changeEvent.id})`,
};

type Row = {
  eventId: string; competitorId: string; competitorName: string; changeType: string; channels: string[] | null; services: Record<string, string | null> | null;
  summary: string; score: number; route: string; occurredAt: Date; scoredAt: Date; evidenceCount: number;
};

export function toEventRow(r: Row, verticalId: string, serviceNames: Map<string, string>): EventRow {
  const serviceId = r.services?.[verticalId] ?? null;
  return {
    eventId: r.eventId, competitorId: r.competitorId, competitorName: r.competitorName, changeType: r.changeType, typeLabel: changeTypeLabel(r.changeType),
    channels: r.channels ?? [], summary: r.summary, score: Math.round(r.score), route: r.route as EventRow['route'],
    serviceId, serviceName: serviceId ? (serviceNames.get(serviceId) ?? null) : null,
    occurredAt: r.occurredAt.toISOString(), scoredAt: r.scoredAt.toISOString(), evidenceCount: Number(r.evidenceCount),
  };
}
```

`schemas.ts` — add:

```ts
export const EventRow = z.object({
  eventId: uuid, competitorId: uuid, competitorName: z.string(), changeType: z.string(), typeLabel: z.string(), channels: z.array(z.string()), summary: z.string(),
  score: z.number().int(), route: z.enum(['alert', 'brief', 'archive']), serviceId: z.string().nullable(), serviceName: z.string().nullable(),
  occurredAt: iso, scoredAt: iso, evidenceCount: z.number().int(),
});
export type EventRow = z.infer<typeof EventRow>;
export const FactView = z.object({ kind: z.string(), before: z.string().nullable(), after: z.string().nullable(), pct: z.number().nullable() });
export type FactView = z.infer<typeof FactView>;
export const DetailLineView = z.object({ label: z.string(), value: z.string() });
export const ScoreFactorsView = z.object({
  typeWeight: z.number(), size: z.number(), relevance: z.number(), serviceOverlap: z.number(), territoryOverlap: z.number(), novelty: z.number(),
  thresholds: z.object({ alert: z.number(), brief: z.number() }),
});
export const ChangeView = z.object({
  changeId: uuid, channel: z.string(), channelLabel: z.string(), kind: z.string(), pageUrl: z.string().nullable(),
  beforeCaptureId: uuid.nullable(), afterCaptureId: uuid.nullable(), detectedAt: iso, hasTextDiff: z.boolean(),
});
export type ChangeView = z.infer<typeof ChangeView>;
export const EventDetail = EventRow.extend({
  facts: z.array(FactView), details: z.array(DetailLineView), factors: ScoreFactorsView, changes: z.array(ChangeView),
  moves: z.array(z.object({ id: uuid, label: z.string(), status: z.string() })),
});
export type EventDetail = z.infer<typeof EventDetail>;
```

`packages/tools/src/tools/events.ts`:

```ts
import { CHANGE_TYPES, toolkit, ToolError } from '@cs/core';
import { changeEvent, clientCompetitor, competitor, detectedChange, eventChange, eventScore, move, moveEvent, trackedPage, withTenant } from '@cs/db';
import { and, asc, desc, eq, gte, ilike, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { MOVE_LABELS } from '../pressure';
import { channelLabel, detailLines, factView } from '../workspace/labels';
import { eventRowSelect, toEventRow } from '../workspace/events-read';
import { clientEvents, escapeLike, eventJoin, workspaceClient } from '../workspace/scope';
import { EventDetail, EventRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

export const searchEvents = defineTool({
  name: 'search_events',
  description: 'Competitor changes scored for a client, newest first, filterable by competitor, type, service, route, period, score and text.',
  input: z.object({
    clientId: uuid,
    competitorId: uuid.optional(),
    changeType: z.enum(CHANGE_TYPES).optional(),
    serviceId: z.string().min(1).max(80).optional(),
    route: z.enum(['flagged', 'all', 'archive']).default('flagged'),
    days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).default(30),
    minScore: z.number().int().min(0).max(100).optional(),
    query: z.string().trim().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).max(5000).default(0),
  }),
  output: z.object({ items: z.array(EventRow), hasMore: z.boolean() }),
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    const conds = [clientEvents(c.id), gte(changeEvent.occurredAt, new Date(Date.now() - input.days * DAY))];
    if (input.competitorId) conds.push(eq(changeEvent.competitorId, input.competitorId));
    if (input.changeType) conds.push(eq(changeEvent.changeType, input.changeType));
    if (input.serviceId) conds.push(sql`${changeEvent.services} ->> ${c.verticalId} = ${input.serviceId}`);
    if (input.route === 'flagged') conds.push(inArray(eventScore.route, ['alert', 'brief']));
    if (input.route === 'archive') conds.push(eq(eventScore.route, 'archive'));
    if (input.minScore !== undefined) conds.push(gte(eventScore.score, input.minScore));
    if (input.query) conds.push(ilike(changeEvent.summary, `%${escapeLike(input.query)}%`));
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select(eventRowSelect).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(...conds)).orderBy(desc(changeEvent.occurredAt), desc(changeEvent.id)).limit(input.limit + 1).offset(input.offset));
    return { items: rows.slice(0, input.limit).map((r) => toEventRow(r, c.verticalId, names)), hasMore: rows.length > input.limit };
  },
});

export const getEvent = defineTool({
  name: 'get_event',
  description: 'One scored competitor change: why it scored as it did, the evidence behind it and the moves it belongs to.',
  input: z.object({ clientId: uuid, eventId: uuid }),
  output: EventDetail,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId, eventId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    const [r] = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ ...eventRowSelect, facts: changeEvent.facts, details: changeEvent.details, factors: eventScore.factors })
        .from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(clientEvents(c.id), eq(changeEvent.id, eventId))));
    if (!r) throw new ToolError('not_found', 'Change not found');
    // Visibility proved above — global change rows are read with the service Db (Global Constraints).
    const changes = await deps.service
      .select({ changeId: detectedChange.id, channel: detectedChange.source, kind: detectedChange.kind, pageUrl: trackedPage.url, beforeCaptureId: detectedChange.beforeCaptureId,
        afterCaptureId: detectedChange.afterCaptureId, detectedAt: detectedChange.detectedAt, beforeText: detectedChange.beforeText, afterText: detectedChange.afterText })
      .from(eventChange).innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId)).leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
      .where(and(eq(eventChange.eventId, eventId), eq(detectedChange.status, 'event'))).orderBy(asc(detectedChange.detectedAt));
    const moves = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: move.id, moveType: move.moveType, status: move.status, closedAt: move.closedAt }).from(moveEvent).innerJoin(move, eq(move.id, moveEvent.moveId))
        .where(and(eq(moveEvent.eventId, eventId), eq(move.clientId, c.id))));
    const f = r.factors;
    return {
      ...toEventRow(r, c.verticalId, names),
      facts: (r.facts ?? []).map(factView),
      details: detailLines(r.details),
      factors: { typeWeight: f.typeWeight, size: f.size, relevance: f.relevance, serviceOverlap: f.serviceOverlap, territoryOverlap: f.territoryOverlap, novelty: f.novelty, thresholds: f.thresholds },
      changes: changes.map((ch) => ({
        changeId: ch.changeId, channel: ch.channel, channelLabel: channelLabel(ch.channel), kind: ch.kind, pageUrl: ch.pageUrl ?? null,
        beforeCaptureId: ch.beforeCaptureId, afterCaptureId: ch.afterCaptureId, detectedAt: ch.detectedAt.toISOString(), hasTextDiff: ch.beforeText !== null || ch.afterText !== null,
      })),
      moves: moves.map((m) => ({ id: m.id, label: MOVE_LABELS[m.moveType] ?? m.moveType, status: m.closedAt ? 'closed' : m.status })),
    };
  },
});

export const eventTools = [searchEvents, getEvent];
```

Add `...eventTools` to `allTools` in `all.ts`. Re-export `./workspace/scope`, `./workspace/labels` and `./workspace/events-read` from `src/index.ts`. If Drizzle's `select` typing rejects `r.factors` as possibly `null`, guard with `if (!r.factors) throw new ToolError('internal', 'Score has no factors')` (every `event_score` row is written with factors, so this never fires).

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): search_events and get_event over the client's live scored events"
```

---

### Task 4: `get_evidence` and `compare_snapshots`

**Files:**
- Create: `packages/tools/src/workspace/evidence-access.ts`, `packages/tools/src/tools/evidence.ts`, `packages/tools/src/tools/evidence.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`, `packages/tools/src/index.ts`

**Interfaces:**
- Consumes: Task 2 `wordDiff`; Task 3 `workspaceClient`, `clientEvents`, `eventJoin`, `channelLabel`, `factView`, `detailLines`.
- Produces:
  - `competitorLinked(deps, ctx, clientId, competitorId): Promise<boolean>` — decision 7.
  - `snapshotSide(db: Db, captureId: string | null): Promise<SnapshotSide | null>` — decision 5.
  - `SERVABLE_EVIDENCE = new Set(['screenshot', 'text'])`.
  - Schemas `SnapshotSide`, `CompareView`, `EvidenceView`.
  - Tools `get_evidence` (`read`, **no feature**) → `EvidenceView`, and `compare_snapshots` (`read` + `dashboard`) → `CompareView`.

- [ ] **Step 1: Write the failing test** `packages/tools/src/tools/evidence.test.ts`

Copy the setup block (`dbs`, `registry`, `ctx`, `FACTORS`, `day`, `pageId`, `beforeEach`) from `events.test.ts`. Then add:

```ts
import { alert, brief, briefItem, capture, changeEvent, clientCompetitor, detectedChange, evidence, eventChange, eventScore, trackedPage } from '@cs/db';
import type { CompareView, EvidenceView } from './schemas';

const am = ctx('account_manager', 'all');
const viewerBriefsOnly = ctx('client_viewer', [IDS.clientA1]);
const ownerA2 = ctx('client_owner', [IDS.clientA2], ['dashboard']);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

async function cap(at: Date, status = 'ok', kinds: string[] = ['html', 'text', 'screenshot']) {
  const [c] = await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, trackedPageId: pageId, source: 'web', url: 'https://smithhvac.example/pricing', status, collectorVersion: 't', capturedAt: at }).returning();
  const ids: Record<string, string> = {};
  for (const kind of kinds) {
    const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind, objectKey: `evidence/${IDS.competitorX}/${c!.id}/${kind}`, sha256: `${kind}-sha-${c!.id.slice(0, 4)}`, bytes: 10, contentType: kind === 'screenshot' ? 'image/webp' : 'text/plain' }).returning();
    ids[kind] = e!.id;
  }
  return { captureId: c!.id, ids };
}

async function changeBetween(beforeId: string, afterId: string, o: { status?: string; retracted?: boolean; source?: string } = {}) {
  const [ch] = await dbs.owner.insert(detectedChange).values({ competitorId: IDS.competitorX, trackedPageId: pageId, source: o.source ?? 'web', kind: 'modified', beforeCaptureId: beforeId, afterCaptureId: afterId, beforeText: 'AC tune-up $99', afterText: 'AC tune-up $79', numericChanges: [], status: o.status ?? 'event', stageVersion: 1, detectedAt: new Date() }).returning();
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', channels: ['web'], services: {}, summary: 'Smith HVAC cut its AC tune-up to $79', confidence: 0.9, occurredAt: new Date(), retractedAt: o.retracted ? new Date() : null }).returning();
  await dbs.owner.insert(eventChange).values({ eventId: e!.id, changeId: ch!.id });
  await dbs.owner.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score: 86, route: 'alert', factors: FACTORS as never, packVersion: 1, scoredAt: new Date() });
  return { changeId: ch!.id, eventId: e!.id };
}

describe('compare_snapshots', () => {
  it('returns both screenshots, the hash and a word diff', async () => {
    const b = await cap(new Date(Date.now() - 2 * day));
    const a = await cap(new Date(Date.now() - day));
    const { changeId } = await changeBetween(b.captureId, a.captureId);
    const v = (await registry.invoke(am, 'compare_snapshots', { clientId: IDS.clientA1, changeId })) as CompareView;
    expect(v.before?.screenshot).toEqual({ evidenceId: b.ids.screenshot, capturedAt: expect.any(String), fallback: false });
    expect(v.after?.hash).toBe(`html-sha-${a.captureId.slice(0, 4)}`);
    expect(v.diff).toEqual([{ op: 'equal', text: 'AC tune-up ' }, { op: 'delete', text: '$99' }, { op: 'insert', text: '$79' }]);
  });

  it('falls back to the newest earlier screenshot of the page for an unchanged capture (Review Focus 5)', async () => {
    const old = await cap(new Date(Date.now() - 5 * day));
    const unchanged = await cap(new Date(Date.now() - 2 * day), 'unchanged', []);
    const a = await cap(new Date(Date.now() - day));
    const { changeId } = await changeBetween(unchanged.captureId, a.captureId);
    const v = (await registry.invoke(am, 'compare_snapshots', { clientId: IDS.clientA1, changeId })) as CompareView;
    expect(v.before).toMatchObject({ status: 'unchanged', screenshot: { evidenceId: old.ids.screenshot, fallback: true }, hash: null });
  });

  it('has no screenshot and no earlier fallback for a first capture without one', async () => {
    const b = await cap(new Date(Date.now() - 2 * day), 'ok', ['text']);
    const a = await cap(new Date(Date.now() - day), 'ok', ['text']);
    const { changeId } = await changeBetween(b.captureId, a.captureId);
    const v = (await registry.invoke(am, 'compare_snapshots', { clientId: IDS.clientA1, changeId })) as CompareView;
    expect([v.before?.screenshot, v.after?.screenshot]).toEqual([null, null]);
    expect(v.before?.hash).toBe(`text-sha-${b.captureId.slice(0, 4)}`);
  });

  it('refuses superseded changes, retracted events, other clients and tenants (Review Focus 1, 3)', async () => {
    const b = await cap(new Date(Date.now() - 2 * day));
    const a = await cap(new Date(Date.now() - day));
    const superseded = await changeBetween(b.captureId, a.captureId, { status: 'superseded' });
    const retracted = await changeBetween(b.captureId, a.captureId, { retracted: true });
    const live = await changeBetween(b.captureId, a.captureId);
    for (const changeId of [superseded.changeId, retracted.changeId]) {
      await expect(registry.invoke(am, 'compare_snapshots', { clientId: IDS.clientA1, changeId })).rejects.toMatchObject({ code: 'not_found' });
    }
    await expect(registry.invoke(ownerA2, 'compare_snapshots', { clientId: IDS.clientA2, changeId: live.changeId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'compare_snapshots', { clientId: IDS.clientA1, changeId: live.changeId })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_evidence', () => {
  it('opens evidence for any client role (no dashboard flag) and lists the live changes that cite it', async () => {
    const b = await cap(new Date(Date.now() - 2 * day));
    const a = await cap(new Date(Date.now() - day));
    const { eventId } = await changeBetween(b.captureId, a.captureId);
    await changeBetween(b.captureId, a.captureId, { retracted: true });
    const v = (await registry.invoke(viewerBriefsOnly, 'get_evidence', { clientId: IDS.clientA1, evidenceId: a.ids.screenshot })) as EvidenceView;
    expect(v).toMatchObject({ kind: 'screenshot', servable: true, competitorName: 'Smith HVAC', channelLabel: 'Website', captureStatus: 'ok' });
    expect(v.citedBy.map((c) => c.eventId)).toEqual([eventId]);
    expect(((await registry.invoke(am, 'get_evidence', { clientId: IDS.clientA1, evidenceId: a.ids.html })) as EvidenceView).servable).toBe(false);
  });

  it('keeps evidence open after the competitor is removed only while a visible alert or brief item cites that competitor (decision 7)', async () => {
    const a = await cap(new Date(Date.now() - day));
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    await expect(registry.invoke(viewerBriefsOnly, 'get_evidence', { clientId: IDS.clientA1, evidenceId: a.ids.screenshot })).rejects.toMatchObject({ code: 'not_found' });
    const [br] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-12', periodStart: new Date(), periodEnd: new Date(), status: 'ready', kind: 'standard', summary: 's' }).returning();
    await dbs.owner.insert(briefItem).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: br!.id, ord: 0, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [a.ids.screenshot] });
    // A draft brief does not count for a client role …
    await expect(registry.invoke(viewerBriefsOnly, 'get_evidence', { clientId: IDS.clientA1, evidenceId: a.ids.screenshot })).rejects.toMatchObject({ code: 'not_found' });
    // … but an approved one does.
    await dbs.owner.update(brief).set({ status: 'approved' }).where(eq(brief.id, br!.id));
    expect(((await registry.invoke(viewerBriefsOnly, 'get_evidence', { clientId: IDS.clientA1, evidenceId: a.ids.screenshot })) as EvidenceView).citedBy).toEqual([]);
  });

  it('is not found for another client or tenant', async () => {
    const a = await cap(new Date(Date.now() - day));
    await expect(registry.invoke(ownerA2, 'get_evidence', { clientId: IDS.clientA2, evidenceId: a.ids.screenshot })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_evidence', { clientId: IDS.clientA1, evidenceId: a.ids.screenshot })).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

Adjust the `brief`/`briefItem` literals to their required columns (`packages/db/src/schema/briefs.ts`; `apps/web/e2e/seed.ts` inserts both and is a working example). The `alert` import is used if you add the matching alert case: a `delivered` alert about competitor X keeps evidence open after removal, and a `pending_review` one does not for a client role. Add it.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/evidence.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`schemas.ts`:

```ts
export const SnapshotSide = z.object({
  captureId: uuid, capturedAt: iso, status: z.string(),
  screenshot: z.object({ evidenceId: uuid, capturedAt: iso, fallback: z.boolean() }).nullable(),
  textEvidenceId: uuid.nullable(), hash: z.string().nullable(),
});
export type SnapshotSide = z.infer<typeof SnapshotSide>;
export const CompareView = z.object({
  changeId: uuid, eventId: uuid, channel: z.string(), channelLabel: z.string(), kind: z.string(), pageUrl: z.string().nullable(),
  before: SnapshotSide.nullable(), after: SnapshotSide.nullable(),
  diff: z.array(z.object({ op: z.enum(['equal', 'insert', 'delete']), text: z.string() })), facts: z.array(FactView), details: z.array(DetailLineView),
});
export type CompareView = z.infer<typeof CompareView>;
export const EvidenceView = z.object({
  evidenceId: uuid, kind: z.string(), sha256: z.string(), bytes: z.number().int(), contentType: z.string(), captureId: uuid, capturedAt: iso, captureStatus: z.string(),
  channel: z.string(), channelLabel: z.string(), url: z.string().nullable(), collectorVersion: z.string(), legalHold: z.boolean(),
  competitorId: uuid, competitorName: z.string(), servable: z.boolean(),
  citedBy: z.array(z.object({ eventId: uuid, summary: z.string(), typeLabel: z.string(), occurredAt: iso })),
});
export type EvidenceView = z.infer<typeof EvidenceView>;
```

`packages/tools/src/workspace/evidence-access.ts`:

```ts
import { type AccessContext, isAgencyRole } from '@cs/core';
import { alert, brief, briefItem, capture, clientCompetitor, type Db, evidence, withTenant } from '@cs/db';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import type { SnapshotSide } from '../tools/schemas';

export const SERVABLE_EVIDENCE = new Set(['screenshot', 'text']);

/**
 * Decision 7: tracked now, or cited by this client's alert / brief item — for client roles only a delivered alert or
 * an approved/sent brief counts (the 5a client-facing status rule). Tenant tables, so it runs through RLS.
 */
export async function competitorLinked(deps: ToolDeps, ctx: AccessContext, clientId: string, competitorId: string): Promise<boolean> {
  const agency = isAgencyRole(ctx.role);
  return withTenant(deps.app, ctx, async (tx) => {
    const [t] = await tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor)
      .where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))).limit(1);
    if (t) return true;
    const [a] = await tx.select({ id: alert.id }).from(alert)
      .where(and(eq(alert.clientId, clientId), eq(alert.competitorId, competitorId), ...(agency ? [] : [eq(alert.status, 'delivered')]))).limit(1);
    if (a) return true;
    const [b] = await tx.select({ id: briefItem.id }).from(briefItem).innerJoin(brief, eq(brief.id, briefItem.briefId))
      .where(and(eq(brief.clientId, clientId), eq(briefItem.competitorId, competitorId), ...(agency ? [] : [inArray(brief.status, ['approved', 'sent'])]))).limit(1);
    return !!b;
  });
}

/** Decision 5: the capture's own screenshot, else the newest earlier screenshot of the same tracked page (`fallback`). Call only after access is proved. */
export async function snapshotSide(db: Db, captureId: string | null): Promise<SnapshotSide | null> {
  if (!captureId) return null;
  const [cap] = await db.select().from(capture).where(eq(capture.id, captureId));
  if (!cap) return null;
  const ev = await db.select({ id: evidence.id, kind: evidence.kind, sha256: evidence.sha256 }).from(evidence).where(eq(evidence.captureId, cap.id));
  const own = ev.find((e) => e.kind === 'screenshot');
  let screenshot: SnapshotSide['screenshot'] = own ? { evidenceId: own.id, capturedAt: cap.capturedAt.toISOString(), fallback: false } : null;
  if (!screenshot && cap.trackedPageId) {
    const [prev] = await db.select({ id: evidence.id, capturedAt: capture.capturedAt }).from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId))
      .where(and(eq(capture.trackedPageId, cap.trackedPageId), eq(evidence.kind, 'screenshot'), lt(capture.capturedAt, cap.capturedAt)))
      .orderBy(desc(capture.capturedAt)).limit(1);
    if (prev) screenshot = { evidenceId: prev.id, capturedAt: prev.capturedAt.toISOString(), fallback: true };
  }
  return {
    captureId: cap.id, capturedAt: cap.capturedAt.toISOString(), status: cap.status, screenshot,
    textEvidenceId: ev.find((e) => e.kind === 'text')?.id ?? null,
    hash: ev.find((e) => e.kind === 'html')?.sha256 ?? ev.find((e) => e.kind === 'text')?.sha256 ?? null,
  };
}
```

`packages/tools/src/tools/evidence.ts`:

```ts
import { toolkit, ToolError } from '@cs/core';
import { capture, changeEvent, clientCompetitor, competitor, detectedChange, eventChange, eventScore, evidence, trackedPage, withTenant } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { competitorLinked, SERVABLE_EVIDENCE, snapshotSide } from '../workspace/evidence-access';
import { channelLabel, detailLines, factView } from '../workspace/labels';
import { clientEvents, eventJoin, workspaceClient } from '../workspace/scope';
import { wordDiff } from '../workspace/word-diff';
import { CompareView, EvidenceView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export const getEvidence = defineTool({
  name: 'get_evidence',
  description: 'One stored piece of evidence (snapshot, text, page HTML or vendor data): when and how it was captured, its SHA-256 hash, and the changes that cite it.',
  input: z.object({ clientId: uuid, evidenceId: uuid }),
  output: EvidenceView,
  permission: 'read', // decision 2: no dashboard flag — brief/alert chips must work for briefs-only clients
  async handler(ctx, { clientId, evidenceId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const [row] = await deps.service
      .select({ id: evidence.id, kind: evidence.kind, sha256: evidence.sha256, bytes: evidence.bytes, contentType: evidence.contentType, captureId: capture.id,
        capturedAt: capture.capturedAt, status: capture.status, source: capture.source, url: capture.url, collectorVersion: capture.collectorVersion, legalHold: capture.legalHold,
        competitorId: capture.competitorId, competitorName: competitor.name })
      .from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId)).innerJoin(competitor, eq(competitor.id, capture.competitorId))
      .where(eq(evidence.id, evidenceId));
    if (!row || !(await competitorLinked(deps, ctx, c.id, row.competitorId))) throw new ToolError('not_found', 'Evidence not found');
    const cited = await withTenant(deps.app, ctx, (tx) =>
      tx.selectDistinct({ eventId: changeEvent.id, summary: changeEvent.summary, changeType: changeEvent.changeType, occurredAt: changeEvent.occurredAt })
        .from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(eventChange, eq(eventChange.eventId, changeEvent.id)).innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
        .where(and(clientEvents(c.id), eq(detectedChange.status, 'event'), or(eq(detectedChange.afterCaptureId, row.captureId), eq(detectedChange.beforeCaptureId, row.captureId))))
        .limit(20));
    return {
      evidenceId: row.id, kind: row.kind, sha256: row.sha256, bytes: Number(row.bytes), contentType: row.contentType, captureId: row.captureId,
      capturedAt: row.capturedAt.toISOString(), captureStatus: row.status, channel: row.source, channelLabel: channelLabel(row.source), url: row.url ?? null,
      collectorVersion: row.collectorVersion, legalHold: row.legalHold, competitorId: row.competitorId, competitorName: row.competitorName,
      servable: SERVABLE_EVIDENCE.has(row.kind),
      citedBy: cited.map((e) => ({ eventId: e.eventId, summary: e.summary, typeLabel: changeTypeLabel(e.changeType), occurredAt: e.occurredAt.toISOString() })),
    };
  },
});

export const compareSnapshots = defineTool({
  name: 'compare_snapshots',
  description: 'Before/after of one detected change: both page snapshots (or the latest earlier one), their hashes, and a word-level text diff.',
  input: z.object({ clientId: uuid, changeId: uuid }),
  output: CompareView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId, changeId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const [ch] = await deps.service
      .select({ id: detectedChange.id, eventId: eventChange.eventId, source: detectedChange.source, kind: detectedChange.kind, pageUrl: trackedPage.url,
        beforeCaptureId: detectedChange.beforeCaptureId, afterCaptureId: detectedChange.afterCaptureId, beforeText: detectedChange.beforeText, afterText: detectedChange.afterText,
        numericChanges: detectedChange.numericChanges, details: detectedChange.details })
      .from(detectedChange).innerJoin(eventChange, eq(eventChange.changeId, detectedChange.id)).leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
      .where(and(eq(detectedChange.id, changeId), eq(detectedChange.status, 'event')));
    if (!ch) throw new ToolError('not_found', 'Change not found');
    const [visible] = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: changeEvent.id }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .where(and(clientEvents(c.id), eq(changeEvent.id, ch.eventId))));
    if (!visible) throw new ToolError('not_found', 'Change not found');
    const [before, after] = await Promise.all([snapshotSide(deps.service, ch.beforeCaptureId), snapshotSide(deps.service, ch.afterCaptureId)]);
    const hasText = ch.beforeText !== null || ch.afterText !== null;
    return {
      changeId: ch.id, eventId: ch.eventId, channel: ch.source, channelLabel: channelLabel(ch.source), kind: ch.kind, pageUrl: ch.pageUrl ?? null, before, after,
      diff: hasText ? wordDiff(ch.beforeText ?? '', ch.afterText ?? '') : [],
      facts: (ch.numericChanges ?? []).map(factView), details: detailLines(ch.details),
    };
  },
});

export const evidenceTools = [getEvidence, compareSnapshots];
```

Register `...evidenceTools` in `all.ts`, and re-export `./workspace/evidence-access` from `src/index.ts` (Task 5 imports `SERVABLE_EVIDENCE`). For a rank change (`rank_scan_id` set, no captures), `before`/`after` are `null` and the diff is empty — that's correct.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): get_evidence and compare_snapshots with screenshot fallback and word diff"
```

---

### Task 5: Evidence file route

**Files:**
- Modify: `apps/web/src/server/files.ts`, `apps/web/src/server/files.test.ts`
- Create: `apps/web/src/app/files/evidence/[clientId]/[evidenceId]/route.ts`

**Interfaces:**
- Consumes: Task 4 `get_evidence`; `ObjectStore` (`@cs/storage`).
- Produces: `serveEvidence(input: { clientId: string; evidenceId: string; ctx: AccessContext; registry: ToolRegistry<ToolDeps>; service: Db; store: ObjectStore }): Promise<Response>`.

- [ ] **Step 1: Write the failing test** — add to `apps/web/src/server/files.test.ts`. Reuse that file's existing DB/registry/memory-store setup (the `servePdf` tests) and seed one capture with `screenshot`, `text` and `html` evidence the way Task 4's test does, putting bytes for the first two into the memory store under their `objectKey`:

```ts
describe('serveEvidence', () => {
  it('streams a screenshot and a text file with safe headers', async () => {
    const r = await serveEvidence({ clientId: IDS.clientA1, evidenceId: ids.screenshot, ctx: am, registry: reg, service: dbs.service, store });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    const t = await serveEvidence({ clientId: IDS.clientA1, evidenceId: ids.text, ctx: am, registry: reg, service: dbs.service, store });
    expect(t.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('never serves html or vendor json, other tenants, bad ids or missing objects (Review Focus 1, 5)', async () => {
    const cases = [
      { clientId: IDS.clientA1, evidenceId: ids.html, ctx: am },
      { clientId: IDS.clientA1, evidenceId: ids.screenshot, ctx: otherAgency },
      { clientId: IDS.clientA2, evidenceId: ids.screenshot, ctx: ownerA2 },
      { clientId: 'nope', evidenceId: ids.screenshot, ctx: am },
      { clientId: IDS.clientA1, evidenceId: missingObjectScreenshotId, ctx: am },
    ];
    for (const c of cases) {
      const r = await serveEvidence({ ...c, registry: reg, service: dbs.service, store });
      expect(r.status).toBe(404);
      expect(await r.text()).toBe('Not found');
    }
  });
});
```

(`missingObjectScreenshotId` is a second screenshot evidence row whose `objectKey` was never put into the store.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/server/files.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `files.ts`:

```ts
const EVIDENCE_TYPES: Record<string, string> = { screenshot: 'image/webp', text: 'text/plain; charset=utf-8' };

/**
 * Decision 6: access through `get_evidence` first (same 404 for unknown, foreign and unservable ids), then the
 * object store. `html`/`vendor_json` are never served raw — page HTML is untrusted competitor markup.
 */
export async function serveEvidence(input: { clientId: string; evidenceId: string; ctx: AccessContext; registry: ToolRegistry<ToolDeps>; service: Db; store: ObjectStore }): Promise<Response> {
  if (!isUuid(input.clientId) || !isUuid(input.evidenceId)) return notFound();
  let view: EvidenceView;
  try {
    view = (await input.registry.invoke(input.ctx, 'get_evidence', { clientId: input.clientId, evidenceId: input.evidenceId })) as EvidenceView;
  } catch (e) {
    if (e instanceof ToolError && (e.code === 'not_found' || e.code === 'permission_denied' || e.code === 'invalid_input')) return notFound();
    throw e;
  }
  const type = EVIDENCE_TYPES[view.kind];
  if (!type) return notFound();
  const [row] = await input.service.select({ key: evidence.objectKey }).from(evidence).where(eq(evidence.id, input.evidenceId));
  const bytes = row ? await input.store.get(row.key) : null;
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store', 'content-disposition': 'inline' },
  });
}
```

Import `evidence` from `@cs/db` and `EvidenceView` from `@cs/tools`.

`app/files/evidence/[clientId]/[evidenceId]/route.ts` — copy `files/brief/[id]/route.ts`:

```ts
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string; evidenceId: string }> }) {
  const { clientId, evidenceId } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less') return new Response('Not found', { status: 404 });
  return serveEvidence({ clientId, evidenceId, ctx: viewer.ctx, registry: registry(), service: dbs().service, store: webStore() });
}
```

Use the same imports as the brief route. Check `proxy.ts` treats `/files/` paths as needing a session or guest cookie, the way it treats `/files/brief` — no change should be needed.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/files.ts apps/web/src/server/files.test.ts apps/web/src/app/files/evidence
git commit -m "feat(web): access-checked evidence file route (screenshots and text only)"
```

---

### Task 6: Evidence chips become links; the evidence page

**Files:**
- Create: `apps/web/src/components/evidence-chips.tsx`, `apps/web/src/components/evidence-chips.test.tsx`, `apps/web/src/app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx`
- Modify: `apps/web/src/components/views/brief-view.tsx`, `apps/web/src/components/views/alert-view.tsx`, `apps/web/src/components/recommendation-board.tsx`, `apps/web/src/app/(app)/agency/approvals/[briefId]/review-controls.tsx`, and their tests if they assert the old "N evidence items" text

**Interfaces:**
- Consumes: Task 4 `EvidenceView`; Task 5's route URL.
- Produces: `<EvidenceChips clientId={string} ids={string[]} max={6} />` (renders nothing for no ids) and `evidenceHref(clientId, id)`. Page `/c/<clientId>/evidence/<evidenceId>`.

- [ ] **Step 1: Write the failing test** `components/evidence-chips.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceChips } from './evidence-chips';

const C = '11111111-1111-4111-8111-111111111111';
const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);

describe('EvidenceChips', () => {
  it('links each chip to the evidence page and caps the list', () => {
    render(<EvidenceChips clientId={C} ids={ids} />);
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe(`/c/${C}/evidence/${ids[0]}`);
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.getByText('+2 more')).toBeTruthy();
  });
  it('renders nothing without evidence', () => {
    const { container } = render(<EvidenceChips clientId={C} ids={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/components/evidence-chips.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`components/evidence-chips.tsx` (no `'use client'` — it works in both):

```tsx
import Link from 'next/link';

export const evidenceHref = (clientId: string, id: string) => `/c/${clientId}/evidence/${id}`;

/** Decision 8: every chip opens the stored proof. Replaces the old "N evidence items" spans. */
export function EvidenceChips({ clientId, ids, max = 6 }: { clientId: string; ids: string[]; max?: number }) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((id, i) => (
        <Link key={id} href={evidenceHref(clientId, id)} className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text hover:underline">
          Evidence {i + 1}
        </Link>
      ))}
      {ids.length > max && <span className="text-xs text-muted-foreground">+{ids.length - max} more</span>}
    </span>
  );
}
```

Replace the inlined span in `brief-view.tsx:39`, `alert-view.tsx:23`, `recommendation-board.tsx:123` and `review-controls.tsx:174` with `<EvidenceChips clientId={…} ids={x.evidenceIds} />`. Each view already has its brief's/alert's `clientId`, or receives it as a prop. Add the prop where it's missing and pass it from the page. `alert-controls.tsx` (the agency queue, count only) stays as is. Update view tests that asserted "N evidence items".

`app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx` (server component, `force-dynamic`):
- `requireContext()`, then `callTool<EvidenceView>(ctx, 'get_evidence', { clientId, evidenceId })` (refusals → 404).
- Title: `Evidence — {competitorName}`. Subtitle: `{channelLabel} · captured {formatted capturedAt, UTC} · status {captureStatus}`.
- Preview card:
  - `kind === 'screenshot'` → `<img src={`/files/evidence/${clientId}/${evidenceId}`} alt={`Snapshot of ${url ?? competitorName} captured ${date}`} className="w-full rounded-lg border border-line" />` inside a `max-h-[720px] overflow-auto` box.
  - `kind === 'text'` → a link "Open the captured text" to the same route.
  - otherwise → muted text "This evidence is stored as raw {html: 'page HTML' | vendor_json: 'vendor data'} and kept unchanged; it isn't displayed here. Its fingerprint is below."
- "Capture details" card, a `<dl>` grid:
  - Source → `{channelLabel}` (+ `· rendered by RivalMondayBot` when `channel === 'web'`);
  - URL;
  - Captured → full UTC timestamp;
  - Status;
  - SHA-256 → `font-mono break-all`;
  - Kept → `legalHold ? 'On legal hold — never deleted' : 'Kept under the retention policy, and for as long as a delivered brief cites it'`.
- "Part of these changes" card, only when `hasFeature(ctx, 'dashboard')` and `citedBy.length > 0`: each row links to `/c/${clientId}/changes?event=${eventId}`, showing `typeLabel · summary · date`. (The Changes page lands in Task 8, so this link 404s for two tasks mid-branch — accepted, as in 5b-1 Task 9.)

- [ ] **Step 4: Run tests** — the Step 2 command plus `pnpm --filter @cs/web exec vitest run src/components` → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): evidence chips link to a new evidence page"
```

---

### Task 7: `submit_feedback` and the viewer's own verdict

**Files:**
- Modify: `packages/tools/src/tools/events.ts`, `packages/tools/src/tools/events.test.ts`, `packages/tools/src/tools/schemas.ts`

**Interfaces:**
- Consumes: Task 3 `requireVisibleEvent`, `workspaceClient`, `getEvent`.
- Produces: tool `submit_feedback` → `{ ok: true }`; `EventDetail` gains `myFeedback: 'useful' | 'not_relevant' | 'wrong' | null`; `FEEDBACK_VERDICTS = ['useful', 'not_relevant', 'wrong'] as const` (exported from `schemas.ts`).

- [ ] **Step 1: Write the failing test** — add to `events.test.ts`:

```ts
describe('submit_feedback', () => {
  const viewer = ctx('client_viewer', [IDS.clientA1], ['dashboard']);
  it('records a verdict that get_event shows back to the same user only', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await registry.invoke(owner, 'submit_feedback', { clientId: IDS.clientA1, eventId: e.eventId, verdict: 'not_relevant', reason: 'We stopped offering tune-ups' });
    await registry.invoke(owner, 'submit_feedback', { clientId: IDS.clientA1, eventId: e.eventId, verdict: 'useful' });
    const mine = (await registry.invoke(owner, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })) as EventDetail;
    expect(mine.myFeedback).toBe('useful');
    expect(((await registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })) as EventDetail).myFeedback).toBeNull();
    const rows = await dbs.owner.select().from(feedback).where(eq(feedback.subjectId, e.eventId));
    expect(rows.map((r) => [r.subjectType, r.kind, r.actor])).toEqual([['event', 'rating', 'u-client_owner'], ['event', 'rating', 'u-client_owner']]);
  });

  it('refuses viewers, guests, flagless owners, retracted events and bad verdicts (Review Focus 2, 3)', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const r = await seedEvent({ score: 86, route: 'alert', ageDays: 1, retracted: true });
    const guest = createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:x', role: 'client_viewer', clientScope: [IDS.clientA1], features: ['dashboard'] });
    await expect(registry.invoke(viewer, 'submit_feedback', { clientId: IDS.clientA1, eventId: e.eventId, verdict: 'useful' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(guest, 'submit_feedback', { clientId: IDS.clientA1, eventId: e.eventId, verdict: 'useful' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(ownerNoDash, 'submit_feedback', { clientId: IDS.clientA1, eventId: e.eventId, verdict: 'useful' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'submit_feedback', { clientId: IDS.clientA1, eventId: r.eventId, verdict: 'useful' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'submit_feedback', { clientId: IDS.clientA1, eventId: e.eventId, verdict: 'meh' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
```

Add `feedback` to the `@cs/db` import.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/events.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`schemas.ts`: `export const FEEDBACK_VERDICTS = ['useful', 'not_relevant', 'wrong'] as const;` and extend `EventDetail` with `myFeedback: z.enum(FEEDBACK_VERDICTS).nullable()`.

`events.ts`:

```ts
export const submitFeedback = defineTool({
  name: 'submit_feedback',
  description: 'Rate a detected competitor change as useful, not relevant or wrong (optionally with a reason).',
  input: z.object({ clientId: uuid, eventId: uuid, verdict: z.enum(FEEDBACK_VERDICTS), reason: z.string().trim().max(500).optional() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'feedback',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    // Guests are client_viewers (no `feedback` permission) — this is a second barrier for any future guest role.
    if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to give feedback');
    const c = await workspaceClient(deps, ctx, input.clientId);
    await requireVisibleEvent(deps, ctx, c.id, input.eventId);
    await deps.service.insert(feedback).values({
      agencyId: ctx.agencyId, clientId: c.id, subjectType: 'event', subjectId: input.eventId, kind: 'rating',
      after: { verdict: input.verdict }, reason: input.reason || null, actor: ctx.userId,
    });
    return { ok: true as const };
  },
});
```

In `getEvent`, after the moves query:

```ts
const [fb] = await deps.service.select({ after: feedback.after }).from(feedback)
  .where(and(eq(feedback.clientId, c.id), eq(feedback.subjectType, 'event'), eq(feedback.subjectId, eventId), eq(feedback.actor, ctx.userId)))
  .orderBy(desc(feedback.createdAt)).limit(1);
const verdict = fb?.after?.verdict;
// …and in the return: myFeedback: FEEDBACK_VERDICTS.includes(verdict as never) ? (verdict as (typeof FEEDBACK_VERDICTS)[number]) : null,
```

Add `submitFeedback` to `eventTools`. Two `submit_feedback` calls in the same millisecond would tie on `created_at`, so in the test put `await new Promise((r) => setTimeout(r, 5))` between the two calls.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): submit_feedback on events, shown back as myFeedback"
```

---

### Task 8: Changes feed screen

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/changes/params.ts`, `params.test.ts`, `group.ts`, `group.test.ts`, `feed.tsx`, `page.tsx`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `search_events`, `get_event` (Task 3); `list_client_competitors` (5b-1); `changeTypeOptions` (`@cs/tools`, server only); `verticalOptions()` (`@/server/verticals`).
- Produces:
  - `parseChangesParams(sp: Record<string, string | string[] | undefined>): ChangesParams` with `ChangesParams = { competitor?: string; type?: string; service?: string; route: 'flagged' | 'all' | 'archive'; days: 7 | 30 | 90 | 365; q?: string; offset: number; event?: string; change?: string; tab: 'side' | 'text' | 'details' }`.
  - `changesHref(clientId: string, p: Partial<ChangesParams>): string` — omits defaults, stable key order.
  - `groupByWeek<T extends { occurredAt: string }>(items: T[], now: Date): { label: 'This week' | 'Last week' | 'Earlier'; items: T[] }[]` (empty groups dropped).
  - The page renders a viewer slot that Task 9 fills.

- [ ] **Step 1: Write the failing tests**

`params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { changesHref, parseChangesParams } from './params';

const C = '11111111-1111-4111-8111-111111111111';
const E = '22222222-2222-4222-8222-222222222222';

describe('changes params', () => {
  it('applies defaults and drops invalid values', () => {
    expect(parseChangesParams({})).toEqual({ route: 'flagged', days: 30, offset: 0, tab: 'side' });
    expect(parseChangesParams({ days: '45', route: 'weird', offset: '-3', competitor: 'not-a-uuid', tab: 'x', q: '  ' })).toEqual({ route: 'flagged', days: 30, offset: 0, tab: 'side' });
    expect(parseChangesParams({ days: '90', route: 'archive', event: E, q: ' $79 ', offset: '50' })).toEqual({ route: 'archive', days: 90, offset: 50, event: E, q: '$79', tab: 'side' });
  });
  it('builds hrefs without defaults', () => {
    expect(changesHref(C, {})).toBe(`/c/${C}/changes`);
    expect(changesHref(C, { route: 'all', days: 30, event: E, tab: 'text' })).toBe(`/c/${C}/changes?route=all&event=${E}&tab=text`);
  });
});
```

`group.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupByWeek } from './group';

describe('groupByWeek', () => {
  it('splits into this week, last week and earlier, dropping empty groups', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    const at = (d: number) => ({ occurredAt: new Date(now.getTime() - d * 86_400_000).toISOString() });
    expect(groupByWeek([at(1), at(6), at(8), at(30)], now).map((g) => [g.label, g.items.length])).toEqual([['This week', 2], ['Last week', 1], ['Earlier', 1]]);
    expect(groupByWeek([at(20)], now).map((g) => g.label)).toEqual(['Earlier']);
  });
});
```

Add a `sidebar-nav.test.tsx` case: a client owner with `dashboard: true` sees "Changes" (`/c/<id>/changes`) right after "Competitors" if present, otherwise after "Overview". A client owner with `dashboard: false` does not see it.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/changes" src/components/shell` → FAIL.

- [ ] **Step 3: Implement**

`params.ts`:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTES = ['flagged', 'all', 'archive'] as const;
const DAYS = [7, 30, 90, 365] as const;
const TABS = ['side', 'text', 'details'] as const;

export interface ChangesParams {
  competitor?: string; type?: string; service?: string; route: (typeof ROUTES)[number]; days: (typeof DAYS)[number]; q?: string;
  offset: number; event?: string; change?: string; tab: (typeof TABS)[number];
}
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const pick = <T extends string | number>(list: readonly T[], v: T | undefined, d: T): T => (v !== undefined && list.includes(v) ? v : d);

export function parseChangesParams(sp: Record<string, string | string[] | undefined>): ChangesParams {
  const id = (k: string) => { const v = one(sp[k]); return v && UUID.test(v) ? v : undefined; };
  const slug = (k: string) => { const v = one(sp[k]); return v && /^[a-z0-9_]{1,80}$/.test(v) ? v : undefined; };
  const offset = Number(one(sp.offset));
  const p: ChangesParams = {
    route: pick(ROUTES, one(sp.route) as never, 'flagged'),
    days: pick(DAYS, Number(one(sp.days)) as never, 30),
    offset: Number.isInteger(offset) && offset >= 0 && offset <= 5000 ? offset : 0,
    tab: pick(TABS, one(sp.tab) as never, 'side'),
  };
  const extra = { competitor: id('competitor'), type: slug('type'), service: slug('service'), q: one(sp.q)?.slice(0, 100), event: id('event'), change: id('change') };
  for (const [k, v] of Object.entries(extra)) if (v) (p as unknown as Record<string, unknown>)[k] = v;
  return p;
}

const ORDER: (keyof ChangesParams)[] = ['competitor', 'type', 'service', 'route', 'days', 'q', 'offset', 'event', 'change', 'tab'];
const DEFAULTS: Partial<ChangesParams> = { route: 'flagged', days: 30, offset: 0, tab: 'side' };

export function changesHref(clientId: string, p: Partial<ChangesParams>): string {
  const qs = new URLSearchParams();
  for (const k of ORDER) {
    const v = p[k];
    if (v === undefined || v === '' || DEFAULTS[k] === v) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return `/c/${clientId}/changes${s ? `?${s}` : ''}`;
}
```

`group.ts`:

```ts
const WEEK = 7 * 86_400_000;
export function groupByWeek<T extends { occurredAt: string }>(items: T[], now: Date): { label: 'This week' | 'Last week' | 'Earlier'; items: T[] }[] {
  const groups = { 'This week': [] as T[], 'Last week': [] as T[], Earlier: [] as T[] };
  for (const i of items) {
    const age = now.getTime() - Date.parse(i.occurredAt);
    groups[age < WEEK ? 'This week' : age < 2 * WEEK ? 'Last week' : 'Earlier'].push(i);
  }
  return (Object.keys(groups) as (keyof typeof groups)[]).filter((k) => groups[k].length > 0).map((label) => ({ label, items: groups[label] }));
}
```

`feed.tsx` (server-only presentational components, no hooks):
- `RoutePill({ route, score })`: Alert (alert pill), Brief (brief pill), Archived (archive pill, score muted).
- `FeedList({ clientId, params, groups, selectedId })`: per group, an uppercase muted header; each row is a `Link` to `changesHref(clientId, { ...params, event: row.eventId, change: undefined, tab: 'side' })`, laid out as a grid (`1fr auto`):
  - `h4` `{competitorName} · {summary}`;
  - meta `{typeLabel} · {channels mapped to labels by the page and passed in} · {D Mon}`;
  - right side: the score (`font-extrabold text-secondary`) + `RoutePill`.
  - The selected row: `bg-primary-soft` + `shadow-[inset_3px_0_0_var(--color-primary)]` (check the CSS variable name in `styles.css`), with `aria-current="true"`.
- `FilterBar({ clientId, params, competitors, types, services })`: a `GET` `<form action={`/c/${clientId}/changes`}>` with:
  - a search `Input name="q"`;
  - native selects `competitor` ("All competitors"), `type` ("All types"), `service` ("All services"), `days` (7/30/90/365 "Last N days");
  - a hidden `route`;
  - an "Apply" button.

  Next to it, a segmented control of three `Link`s ("Alerts + brief", "All", "Archived") built with `changesHref`.

`page.tsx` (`force-dynamic`):

```tsx
export default async function ChangesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { clientId } = await params;
  const p = parseChangesParams(await searchParams);
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const [profile, feed, tracked] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: EventRow[]; hasMore: boolean }>(ctx, 'search_events', {
      clientId, competitorId: p.competitor, changeType: p.type, serviceId: p.service, route: p.route, days: p.days, query: p.q, offset: p.offset, limit: 50,
    }),
    callTool<{ items: TrackedCompetitor[] }>(ctx, 'list_client_competitors', { clientId }),
  ]);
  const services = (await verticalOptions()).find((v) => v.id === profile.verticalId)?.services.filter((s) => profile.services.includes(s.id)) ?? [];
  const selectedId = p.event ?? feed.items[0]?.eventId;
  // …render: title "Changes", subtitle, <FilterBar>, then a two-column grid lg:grid-cols-[420px_1fr]:
  //   left: <Card><FeedList …/>{feed.hasMore && <Link href={changesHref(clientId, { ...p, offset: p.offset + 50, event: undefined })}>Show older changes</Link>}</Card>
  //   right: <ViewerSlot> — Task 9 renders <EventViewer>; in this task render
  //          selectedId ? <Card><p>Loading the evidence viewer arrives in the next task.</p></Card> : <EmptyViewer/>
}
```

- Title "Changes". Subtitle: "Everything your competitors changed, scored for how much it matters to you. Every item links to proof."
- When `search_events` returns nothing: "No changes match these filters." — plus, when `p.route === 'flagged'`, a link "Show all changes, including archived" (`route: 'all'`).
- An invalid `type` query value (an unknown change type) would make the tool return `invalid_input` and the page 404. Avoid that by passing `changeType` only when `changeTypeOptions()` contains it.
- `TrackedCompetitor` and `EventRow` are type imports from `@cs/tools`. `changeTypeOptions` is a server-side value import — fine in a server component.

Nav: in `clientModules`, after the Competitors line, add `if (flags.dashboard) add(`${base}/changes`, 'Changes', 'changes');`, and add `'changes'` to the icon union and `ICONS.changes = Activity` (`lucide-react`).

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): changes feed with filters, week groups and paging"
```

---

### Task 9: Evidence viewer panel and feedback buttons

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/changes/viewer.tsx`, `diff-text.tsx`, `diff-text.test.tsx`, `feedback-buttons.tsx`, `feedback-buttons.test.tsx`, `actions.ts`
- Modify: `apps/web/src/app/(app)/c/[clientId]/changes/page.tsx`

**Interfaces:**
- Consumes: `get_event` (`EventDetail` with `myFeedback`), `compare_snapshots` (`CompareView`), `submit_feedback`; Task 8's `changesHref`/`ChangesParams`; `hasPermission` (`@cs/core`).
- Produces: `<DiffText segments={…} />`; `<FeedbackButtons clientId eventId current action />`; `submitFeedbackAction(_p: FormResult, fd: FormData): Promise<FormResult>`.

- [ ] **Step 1: Write the failing tests**

`diff-text.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiffText } from './diff-text';

describe('DiffText', () => {
  it('renders deletions and insertions as del/ins with accessible labels', () => {
    const { container } = render(<DiffText segments={[{ op: 'equal', text: 'AC tune-up ' }, { op: 'delete', text: '$99' }, { op: 'insert', text: '$79' }]} />);
    expect(container.querySelector('del')?.textContent).toBe('$99');
    expect(container.querySelector('ins')?.textContent).toBe('$79');
    expect(container.querySelector('del')?.getAttribute('aria-label')).toBe('removed: $99');
  });
  it('says so when there is no text diff', () => {
    const { getByText } = render(<DiffText segments={[]} />);
    expect(getByText('No text changes stored for this evidence.')).toBeTruthy();
  });
});
```

`feedback-buttons.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackButtons } from './feedback-buttons';

describe('FeedbackButtons', () => {
  it('posts the verdict and keeps the result message visible', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Thanks — saved.' }));
    render(<FeedbackButtons clientId="c1" eventId="e1" current={null} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Useful' }));
    await waitFor(() => expect(screen.getByText('Thanks — saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('clientId'), fd.get('eventId'), fd.get('verdict')]).toEqual(['c1', 'e1', 'useful']);
  });
  it('marks the current verdict as pressed', () => {
    render(<FeedbackButtons clientId="c1" eventId="e1" current="wrong" action={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Wrong' }).getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/changes"` → FAIL.

- [ ] **Step 3: Implement**

`diff-text.tsx` (no hooks):

```tsx
import type { CompareView } from '@cs/tools';

export function DiffText({ segments }: { segments: CompareView['diff'] }) {
  if (segments.length === 0) return <p className="text-muted-foreground">No text changes stored for this evidence.</p>;
  return (
    <p className="whitespace-pre-wrap rounded-lg bg-muted-surface p-4 font-mono text-sm leading-relaxed">
      {segments.map((s, i) =>
        s.op === 'delete' ? <del key={i} aria-label={`removed: ${s.text}`} className="bg-[#FEE2E2] text-[#B91C1C]">{s.text}</del>
        : s.op === 'insert' ? <ins key={i} aria-label={`added: ${s.text}`} className="bg-[#DCFCE7] text-[#15803D] no-underline">{s.text}</ins>
        : <span key={i}>{s.text}</span>,
      )}
    </p>
  );
}
```

`actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function submitFeedbackAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const clientId = String(fd.get('clientId') ?? '');
  const r = await runTool(ctx, 'submit_feedback', { clientId, eventId: String(fd.get('eventId') ?? ''), verdict: String(fd.get('verdict') ?? '') });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/changes`);
  return { ok: true, message: 'Thanks — saved.' };
}
```

`feedback-buttons.tsx` (`'use client'`): one `useActionState(action, { ok: true } as FormResult)` in this component, which stays mounted. It is one `<form action={formAction}>` with hidden `clientId`/`eventId` and three submit buttons, each `name="verdict"` with `value` `useful` / `not_relevant` / `wrong`, labelled "Useful", "Not relevant", "Wrong", `aria-pressed={current === value}`, disabled while pending. The message `<p>` sits below (`role="alert"` on error). Label before the buttons: "Was this useful?".

`viewer.tsx` (server component): `EventViewer({ clientId, params, detail, compare, canGiveFeedback })`:
- **Header:**
  - `h2` = `detail.summary`;
  - meta = `{pageUrl or channelLabel} · changed between {before.capturedAt} and {after.capturedAt}` (or `· detected {detectedAt}` when there are no captures), `· also seen in {n − 1} other places` when `detail.changes.length > 1`;
  - right: `RoutePill` + score.
- **Change selector** when `detail.changes.length > 1`: links "Evidence {i+1} · {channelLabel}" built with `changesHref(clientId, { ...params, change: c.changeId })`; the selected one carries `aria-current`.
- **Tabs** (links, `role="tablist"`/`role="tab"`/`aria-selected`): "Side by side" (`tab: 'side'`), "Text changes" (`text`), "Capture details" (`details`).
- **Side by side:** two columns "Before"/"After", each with the date. Inside a `max-h-[560px] overflow-auto rounded-lg border border-line` frame:
  - `<img src={`/files/evidence/${clientId}/${side.screenshot.evidenceId}`} alt={`${label} snapshot of ${pageUrl}`} loading="lazy" />`;
  - when `fallback`, a muted note "Page unchanged at this capture — showing the snapshot from {date}";
  - `screenshot === null` → muted box "No snapshot was stored for this capture.";
  - `compare.before === null && compare.after === null` (vendor/rank change) → the panel instead reads "This change comes from {channelLabel}; there is no page snapshot." and lists `compare.details` as a `<dl>`.
  - The `<img>` gets `onError`-free handling: the route returns 404 for a missing object, and the browser shows its broken-image alt text. That is acceptable, since the alt text says what's missing.
- **Text changes:** a header pill `{facts.length} number change(s)` when there are facts, then `<DiffText segments={compare.diff} />`, then a facts list `{before} → {after} ({pct}%)`.
- **Capture details:** for each side, a `<dl>`: Captured (full UTC), Status, SHA-256 (`font-mono break-all`, or "—"), and "Open evidence" links to `/c/${clientId}/evidence/${screenshot?.evidenceId ?? textEvidenceId}` when present.
- **"Why this scored {score}"** panel (always visible under the tabs): four rows — Type `typeWeight`, Size `size`, Relevance `relevance` (sub-line "service {serviceOverlap} × area {territoryOverlap}"), Novelty `novelty`. Each row is a label, a 6 px bar (`width: value*100%`, primary colour, `role="img"` with an `aria-label` of the value), and the value to 2 decimals. Then "Alerts from {thresholds.alert}, weekly brief from {thresholds.brief}."
- **"Part of moves"**: when `detail.moves` is non-empty, plain-text chips "{label} · {status}" (Task 11 turns them into links).
- **Footer:** `canGiveFeedback` → `<FeedbackButtons … current={detail.myFeedback} action={submitFeedbackAction} />`.

`page.tsx` — replace the Task 8 placeholder. When `selectedId` is set:

```tsx
const detail = await callTool<EventDetail>(ctx, 'get_event', { clientId, eventId: selectedId });
const changeId = (p.change && detail.changes.some((c) => c.changeId === p.change) ? p.change : detail.changes[0]?.changeId);
const compare = changeId ? await callTool<CompareView>(ctx, 'compare_snapshots', { clientId, changeId }) : null;
```

Render `<EventViewer … canGiveFeedback={hasPermission(ctx, 'feedback') && !ctx.userId.startsWith('contact:')} />`. With no change left (all superseded), render the header and the score panel, plus "The evidence for this change was withdrawn."

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): evidence viewer — snapshots side by side, text diff, capture details, score breakdown, feedback"
```

---

### Task 10: `list_moves` and `get_move`

**Files:**
- Create: `packages/tools/src/tools/moves.ts`, `packages/tools/src/tools/moves.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: Task 3 `workspaceClient`, `eventRowSelect`, `toEventRow`, `clientEvents`, `eventJoin`; `MOVE_LABELS`.
- Produces:
  - `MoveRow = { id, competitorId, competitorName, moveType, label, status: 'emerging' | 'active' | 'fading' | 'closed', confidence: number, summary, eventCount: int, channels: string[], firstDetectedAt, lastEvidenceAt: iso | null, closedAt: iso | null }`;
  - `MoveDetail = MoveRow & { facts: { label: string; value: string }[]; events: EventRow[] }`;
  - tools `list_moves` → `{ items: MoveRow[] }` and `get_move` → `MoveDetail`;
  - `liveEventCount` SQL helper (exported from `moves.ts` for Task 12/15).

- [ ] **Step 1: Write the failing test** `moves.test.ts` — reuse the `events.test.ts` setup and its `seedEvent` (copy it). Add a `seedMove(eventIds: string[], o: { closed?: boolean; status?: string; competitorId?: string } = {})` helper that inserts `move` + `move_event` rows like Task 3's test.

```ts
describe('list_moves', () => {
  it('lists open moves with live event counts and the shown status', async () => {
    const a = await seedEvent({ score: 86, route: 'alert', ageDays: 3 });
    const b = await seedEvent({ score: 60, route: 'brief', ageDays: 2, retracted: true });
    const m = await seedMove([a.eventId, b.eventId], { status: 'active' });
    await seedMove([a.eventId], { closed: true });
    const r = (await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1 })) as { items: MoveRow[] };
    expect(r.items).toEqual([expect.objectContaining({ id: m, label: 'Price war', status: 'active', eventCount: 1, competitorName: 'Smith HVAC' })]);
    const closed = (await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1, status: 'closed' })) as { items: MoveRow[] };
    expect(closed.items.map((x) => x.status)).toEqual(['closed']);
  });

  it('drops moves whose events were all retracted, and moves of untracked competitors (Review Focus 3)', async () => {
    const r1 = await seedEvent({ score: 86, route: 'alert', ageDays: 3, retracted: true });
    await seedMove([r1.eventId]);
    expect(((await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1 })) as { items: MoveRow[] }).items).toEqual([]);
    const live = await seedEvent({ score: 86, route: 'alert', ageDays: 3 });
    await seedMove([live.eventId]);
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    expect(((await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1 })) as { items: MoveRow[] }).items).toEqual([]);
  });

  it('needs dashboard for client users; other tenants see nothing', async () => {
    await expect(registry.invoke(ownerNoDash, 'list_moves', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(otherAgency, 'list_moves', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_move', () => {
  it('returns facts and the live evidence chain, newest first', async () => {
    const older = await seedEvent({ score: 60, route: 'brief', ageDays: 5 });
    const newer = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const gone = await seedEvent({ score: 70, route: 'alert', ageDays: 2, retracted: true });
    const m = await seedMove([older.eventId, newer.eventId, gone.eventId]);
    await dbs.owner.update(move).set({ details: { eventCount: 3, channels: ['web'], facts: { price_cuts: 2, max_cut_pct: 20 } } }).where(eq(move.id, m));
    const d = (await registry.invoke(owner, 'get_move', { clientId: IDS.clientA1, moveId: m })) as MoveDetail;
    expect(d.events.map((e) => e.eventId)).toEqual([newer.eventId, older.eventId]);
    expect(d.facts).toEqual([{ label: 'Price cuts', value: '2' }, { label: 'Max cut pct', value: '20' }]);
  });

  it('is not found for another client’s move', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const m = await seedMove([e.eventId]);
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA2], ['dashboard']), 'get_move', { clientId: IDS.clientA2, moveId: m })).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/moves.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`schemas.ts`:

```ts
export const MoveRow = z.object({
  id: uuid, competitorId: uuid, competitorName: z.string(), moveType: z.string(), label: z.string(),
  status: z.enum(['emerging', 'active', 'fading', 'closed']), confidence: z.number(), summary: z.string(), eventCount: z.number().int(),
  channels: z.array(z.string()), firstDetectedAt: iso, lastEvidenceAt: iso.nullable(), closedAt: iso.nullable(),
});
export type MoveRow = z.infer<typeof MoveRow>;
export const MoveDetail = MoveRow.extend({ facts: z.array(DetailLineView), events: z.array(EventRow) });
export type MoveDetail = z.infer<typeof MoveDetail>;
```

`moves.ts`:

```ts
const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

/** Decision 10: live supporting events only (the quarterly-report rule). */
export const liveEventCount = sql<number>`(SELECT count(*)::int FROM move_event me JOIN event e ON e.id = me.event_id WHERE me.move_id = ${move.id} AND e.retracted_at IS NULL)`;

const moveSelect = {
  id: move.id, competitorId: move.competitorId, competitorName: competitor.name, moveType: move.moveType, status: move.status, confidence: move.confidence,
  summary: move.summary, details: move.details, firstDetectedAt: move.firstDetectedAt, lastEvidenceAt: move.lastEvidenceAt, closedAt: move.closedAt, eventCount: liveEventCount,
};
type MoveSel = { id: string; competitorId: string; competitorName: string; moveType: string; status: string; confidence: number; summary: string; details: MoveDetails | null;
  firstDetectedAt: Date; lastEvidenceAt: Date | null; closedAt: Date | null; eventCount: number };

const humanise = (k: string) => { const s = k.replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
const toMoveRow = (m: MoveSel): MoveRow => ({
  id: m.id, competitorId: m.competitorId, competitorName: m.competitorName, moveType: m.moveType, label: MOVE_LABELS[m.moveType] ?? humanise(m.moveType),
  status: (m.closedAt ? 'closed' : m.status) as MoveRow['status'], confidence: m.confidence, summary: m.summary, eventCount: Number(m.eventCount),
  channels: m.details?.channels ?? [], firstDetectedAt: m.firstDetectedAt.toISOString(), lastEvidenceAt: toIso(m.lastEvidenceAt), closedAt: toIso(m.closedAt),
});

const trackedMove = and(eq(clientCompetitor.clientId, move.clientId), eq(clientCompetitor.competitorId, move.competitorId))!;

export const listMoves = defineTool({
  name: 'list_moves',
  description: 'Competitor moves detected for a client (territory expansion, price war, …) with status, confidence and how many live changes support each.',
  input: z.object({ clientId: uuid, status: z.enum(['open', 'closed', 'all']).default('open'), competitorId: uuid.optional() }),
  output: z.object({ items: z.array(MoveRow) }),
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const conds = [eq(move.clientId, c.id), sql`${liveEventCount} > 0`];
    if (input.status === 'open') conds.push(isNull(move.closedAt));
    if (input.status === 'closed') conds.push(isNotNull(move.closedAt));
    if (input.competitorId) conds.push(eq(move.competitorId, input.competitorId));
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select(moveSelect).from(move).innerJoin(clientCompetitor, trackedMove).innerJoin(competitor, eq(competitor.id, move.competitorId))
        .where(and(...conds)).orderBy(desc(sql`coalesce(${move.lastEvidenceAt}, ${move.firstDetectedAt})`)).limit(200));
    return { items: rows.map(toMoveRow) };
  },
});

export const getMove = defineTool({
  name: 'get_move',
  description: 'One competitor move with its detected facts and the chain of live changes that support it.',
  input: z.object({ clientId: uuid, moveId: uuid }),
  output: MoveDetail,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId, moveId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    return withTenant(deps.app, ctx, async (tx) => {
      const [m] = await tx.select(moveSelect).from(move).innerJoin(clientCompetitor, trackedMove).innerJoin(competitor, eq(competitor.id, move.competitorId))
        .where(and(eq(move.clientId, c.id), eq(move.id, moveId)));
      if (!m || Number(m.eventCount) === 0) throw new ToolError('not_found', 'Move not found');
      const events = await tx.select(eventRowSelect).from(moveEvent).innerJoin(eventScore, and(eq(eventScore.eventId, moveEvent.eventId), eq(eventScore.clientId, c.id)))
        .innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked).innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(eq(moveEvent.moveId, moveId), clientEvents(c.id))).orderBy(desc(changeEvent.occurredAt));
      const facts = Object.entries(m.details?.facts ?? {}).map(([k, v]) => ({ label: humanise(k), value: String(v) }));
      return { ...toMoveRow(m), facts, events: events.map((e) => toEventRow(e, c.verticalId, names)) };
    });
  },
});

export const moveTools = [listMoves, getMove];
```

Imports: `toolkit`, `ToolError` (`@cs/core`); `changeEvent`, `clientCompetitor`, `competitor`, `eventScore`, `move`, `moveEvent`, `withTenant`, `type MoveDetails` (`@cs/db`); `and`, `desc`, `eq`, `isNotNull`, `isNull`, `sql` (`drizzle-orm`); `packsOf`; `MOVE_LABELS`; the Task 3 helpers; `MoveDetail`, `MoveRow`, `toIso` from `./schemas`. Register `...moveTools` in `all.ts`.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): list_moves and get_move with live evidence chains"
```

---

### Task 11: Moves screen

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/moves/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/moves/move-card.tsx`, `move-card.test.tsx`
- Modify: `apps/web/src/app/(app)/c/[clientId]/changes/viewer.tsx` (move chips become links), `nav-items.ts`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `list_moves`, `get_move` (Task 10); `changesHref` (Task 8).
- Produces: `/c/<id>/moves?status=open|closed|all&move=<id>`; `<MoveCard move selected href />`; `movesHref(clientId, { status?, move? })`.

- [ ] **Step 1: Write the failing test** `move-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoveCard } from './move-card';

const move = {
  id: 'm1', competitorId: 'c', competitorName: 'Peachtree Air Pros', moveType: 'territory_expansion', label: 'Territory expansion', status: 'emerging' as const,
  confidence: 0.55, summary: '', eventCount: 3, channels: ['web', 'google_ads'], firstDetectedAt: '2026-09-17T00:00:00Z', lastEvidenceAt: '2026-10-08T00:00:00Z', closedAt: null,
};

describe('MoveCard', () => {
  it('names the move, its status, signal count and span', () => {
    render(<MoveCard move={move} selected={false} href="/x" />);
    expect(screen.getByRole('link', { name: /Territory expansion · Peachtree Air Pros/ })).toBeTruthy();
    expect(screen.getByText('Emerging · 3 signals over 21 days · confidence 55%')).toBeTruthy();
  });
});
```

Add a `sidebar-nav.test.tsx` case for "Moves" (dashboard only; after Changes).

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/moves" src/components/shell` → FAIL.

- [ ] **Step 3: Implement**

`move-card.tsx` (no hooks): a `Link` card with a 36 px tile (colour by status: active → accent, emerging → primary, fading/closed → muted). The `h4` reads `{label} · {competitorName}`. The subline: `{Status} · {eventCount} signal(s) over {days} days · confidence {round(confidence*100)}%`, where days = `max(1, round((lastEvidenceAt ?? now) − firstDetectedAt) / day)`. Use `firstDetectedAt` → `lastEvidenceAt`; when that's null, use `firstDetectedAt` → `closedAt ?? firstDetectedAt` (pure — never `Date.now()`, so it renders deterministically). Selected → `bg-primary-soft`, `aria-current="true"`.

`moves/page.tsx` (`force-dynamic`, `hasFeature(ctx,'dashboard')` or 404):
- Title "Moves". Subtitle: "Patterns across several changes — a competitor expanding, cutting prices or pushing ads. Each one is backed by the changes listed."
- Status links: Open | Closed | All.
- Two columns `lg:grid-cols-[420px_1fr]`: left, the list of `MoveCard`s (empty: "No moves detected in this period."); right, the selected move (`move` param, else the first) from `get_move`:
  - `h2` `{label} · {competitorName}`;
  - a status row: "First detected {date}", "Latest evidence {date}", "Closed {date}" when closed; "Confidence {pct}%" with a one-line explanation "Confidence grows with each extra supporting change and each extra channel."
  - facts `<dl>`;
  - "Evidence chain": one row per event, linking to `changesHref(clientId, { event: e.eventId, route: 'all', days: 365 })`, showing `{typeLabel} · {summary}`, the date, the score and the route pill.

`viewer.tsx`: move chips become `Link`s to `/c/${clientId}/moves?status=all&move=${m.id}`.

Nav: `if (flags.dashboard) add(`${base}/moves`, 'Moves', 'moves');` after the Changes line (5c-2 inserts its four modules between them); `ICONS.moves = TrendingUp`.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): moves screen with evidence chain"
```

---

### Task 12: `get_competitor_profile` and `get_competitor_timeline`

**Files:**
- Create: `packages/tools/src/tools/competitor-profile.ts`, `packages/tools/src/tools/competitor-profile.test.ts`
- Modify: `packages/tools/src/tools/pages.ts` (export `requireTracked`), `schemas.ts`, `all.ts`

**Interfaces:**
- Consumes: `requireTracked` (`pages.ts`); `pressureByClient` (`src/pressure.ts`); `gbpSummary` (`@cs/collectors`); `liveEventCount` (Task 10); Task 3 helpers; `sourceLabel` (Task 3).
- Produces:
  - `CompetitorProfile = { competitorId, name, domain, placeId, addedAt, gbp: { rating, reviews, category } | null, gbpAsOf: iso | null, activeAds: { google: int, meta: int }, pressure: PressureView, openMoves: int, sources: { source, label, active, lastRunAt, lastStatus }[], pages: { active: int, blocked: int } }`;
  - `TimelineItem = { kind: 'event' | 'move', id, at: iso, title, label, score: int | null, route: 'alert' | 'brief' | 'archive' | null, status: string | null }`;
  - tools `get_competitor_profile` → `CompetitorProfile` and `get_competitor_timeline` → `{ items: TimelineItem[] }`.

- [ ] **Step 1: Write the failing test** `competitor-profile.test.ts` — reuse the `events.test.ts` setup (`seedEvent`) and Task 10's `seedMove`.

```ts
describe('get_competitor_profile', () => {
  it('summarises GBP, ads, pressure, moves and collection status', async () => {
    const [gc] = await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_business_profile', status: 'ok', collectorVersion: 't', capturedAt: new Date() }).returning();
    await dbs.owner.insert(observation).values({ competitorId: IDS.competitorX, captureId: gc!.id, kind: 'gbp_profile', key: 'profile', data: { rating: 4.6, votes: 212, category: 'HVAC contractor' }, observedAt: new Date() });
    await dbs.owner.insert(ad).values([
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'g1', isActive: true, firstSeenAt: new Date(), lastSeenAt: new Date() },
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', isActive: true, firstSeenAt: new Date(), lastSeenAt: new Date() },
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm2', isActive: false, firstSeenAt: new Date(), lastSeenAt: new Date() },
    ]);
    await dbs.owner.insert(competitorSource).values({ competitorId: IDS.competitorX, source: 'gbp', active: true, nextDueAt: new Date(), lastRunAt: new Date(), lastStatus: 'ok' });
    await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, trackedPageId: pageId, source: 'web', status: 'blocked', collectorVersion: 't', capturedAt: new Date() });
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await seedMove([e.eventId], { status: 'active' });
    const p = (await registry.invoke(owner, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as CompetitorProfile;
    expect(p).toMatchObject({
      name: 'Smith HVAC', gbp: { rating: 4.6, reviews: 212, category: 'HVAC contractor' }, activeAds: { google: 1, meta: 1 }, openMoves: 1,
      sources: [{ source: 'gbp', label: 'Google Business Profile', active: true, lastStatus: 'ok' }], pages: { active: 1, blocked: 1 },
    });
    expect(p.pressure.level).toBe('high');
  });

  it('is not found for an untracked or foreign competitor (Review Focus 1)', async () => {
    await expect(registry.invoke(owner, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('get_competitor_timeline', () => {
  it('merges live events and move starts newest first, within the period', async () => {
    const old = await seedEvent({ score: 60, route: 'brief', ageDays: 120 });
    const recent = await seedEvent({ score: 86, route: 'alert', ageDays: 2 });
    await seedEvent({ score: 70, route: 'alert', ageDays: 1, retracted: true });
    const m = await seedMove([recent.eventId]);
    const t = (await registry.invoke(am, 'get_competitor_timeline', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as { items: TimelineItem[] };
    expect(t.items.map((i) => [i.kind, i.id])).toEqual([['move', m], ['event', recent.eventId]]);
    const year = (await registry.invoke(am, 'get_competitor_timeline', { clientId: IDS.clientA1, competitorId: IDS.competitorX, days: 365 })) as { items: TimelineItem[] };
    expect(year.items.map((i) => i.id)).toContain(old.eventId);
  });
});
```

Adapt the `ad`/`observation`/`competitorSource`/`capture` literals to their required columns (`packages/db/src/schema/sources.ts`, `evidence.ts`). `seedMove` must set `firstDetectedAt` to now, so the move sorts first.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/competitor-profile.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`pages.ts`: `export async function requireTracked(…)` (just add `export`).

`schemas.ts`:

```ts
export const CompetitorProfile = z.object({
  competitorId: uuid, name: z.string(), domain: z.string().nullable(), placeId: z.string().nullable(), addedAt: iso,
  gbp: z.object({ rating: z.number().nullable(), reviews: z.number().nullable(), category: z.string().nullable() }).nullable(), gbpAsOf: iso.nullable(),
  activeAds: z.object({ google: z.number().int(), meta: z.number().int() }), pressure: PressureView, openMoves: z.number().int(),
  sources: z.array(z.object({ source: z.string(), label: z.string(), active: z.boolean(), lastRunAt: iso.nullable(), lastStatus: z.string().nullable() })),
  pages: z.object({ active: z.number().int(), blocked: z.number().int() }),
});
export type CompetitorProfile = z.infer<typeof CompetitorProfile>;
export const TimelineItem = z.object({
  kind: z.enum(['event', 'move']), id: uuid, at: iso, title: z.string(), label: z.string(), score: z.number().int().nullable(),
  route: z.enum(['alert', 'brief', 'archive']).nullable(), status: z.string().nullable(),
});
export type TimelineItem = z.infer<typeof TimelineItem>;
```

`competitor-profile.ts` handler outline for `get_competitor_profile` (`read` + `dashboard`):

```ts
const c = await workspaceClient(deps, ctx, clientId);
await requireTracked(deps.app, ctx, c.id, competitorId);
const now = new Date();
const [link, pressure, openMoves] = await withTenant(deps.app, ctx, async (tx) => [
  (await tx.select({ addedAt: clientCompetitor.createdAt }).from(clientCompetitor).where(and(eq(clientCompetitor.clientId, c.id), eq(clientCompetitor.competitorId, competitorId))))[0],
  (await pressureByClient(tx, [c.id], now)).get(c.id)?.find((p) => p.competitorId === competitorId)?.pressure ?? { score: 0, level: 'low' as const, reasons: ['Quiet'] },
  Number((await tx.select({ n: sql<number>`count(*)::int` }).from(move).where(and(eq(move.clientId, c.id), eq(move.competitorId, competitorId), isNull(move.closedAt), sql`${liveEventCount} > 0`)))[0]?.n ?? 0),
] as const);
// Global rows — visibility proved by requireTracked.
const [comp] = await deps.service.select().from(competitor).where(eq(competitor.id, competitorId));
const [gbp] = await deps.service.select({ data: observation.data, at: observation.observedAt }).from(observation)
  .where(and(eq(observation.competitorId, competitorId), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile'))).orderBy(desc(observation.observedAt)).limit(1);
const ads = await deps.service.select({ platform: ad.platform, n: sql<number>`count(*)::int` }).from(ad).where(and(eq(ad.competitorId, competitorId), eq(ad.isActive, true))).groupBy(ad.platform);
const sources = await deps.service.select().from(competitorSource).where(eq(competitorSource.competitorId, competitorId)).orderBy(asc(competitorSource.source));
const [pages] = (await deps.service.execute(sql`
  SELECT count(*)::int AS active,
         count(*) FILTER (WHERE l.status IN ('blocked', 'robots_disallowed'))::int AS blocked
  FROM tracked_page p
  LEFT JOIN LATERAL (SELECT status FROM capture c WHERE c.tracked_page_id = p.id ORDER BY captured_at DESC LIMIT 1) l ON true
  WHERE p.competitor_id = ${competitorId}::uuid AND p.active`)) as unknown as { active: number; blocked: number }[];
const g = gbpSummary(gbp?.data ?? null);
return {
  competitorId, name: comp!.name, domain: comp!.domain, placeId: comp!.placeId, addedAt: link!.addedAt.toISOString(),
  gbp: g ? { rating: g.rating, reviews: g.reviews, category: g.category } : null, gbpAsOf: gbp ? gbp.at.toISOString() : null,
  activeAds: { google: Number(ads.find((a) => a.platform === 'google')?.n ?? 0), meta: Number(ads.find((a) => a.platform === 'meta')?.n ?? 0) },
  pressure, openMoves,
  sources: sources.map((s) => ({ source: s.source, label: sourceLabel(s.source), active: s.active, lastRunAt: toIso(s.lastRunAt), lastStatus: s.lastStatus ?? null })),
  pages: { active: Number(pages?.active ?? 0), blocked: Number(pages?.blocked ?? 0) },
};
```

Check whether `observation` has an `observedAt` column — if it only has `createdAt`/the capture's time, order by that column instead, and say so in the commit message.

`get_competitor_timeline` (`read` + `dashboard`), input `{ clientId, competitorId, days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90) }`:

```ts
const c = await workspaceClient(deps, ctx, input.clientId);
await requireTracked(deps.app, ctx, c.id, input.competitorId);
const since = new Date(Date.now() - input.days * DAY);
const pack = await packsOf(deps)(c.verticalId);
const names = new Map(pack.services.map((s) => [s.id, s.name]));
const [events, moves] = await withTenant(deps.app, ctx, async (tx) => [
  await tx.select(eventRowSelect).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked).innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
    .where(and(clientEvents(c.id), eq(changeEvent.competitorId, input.competitorId), gte(changeEvent.occurredAt, since))).orderBy(desc(changeEvent.occurredAt)).limit(200),
  await tx.select({ id: move.id, moveType: move.moveType, status: move.status, summary: move.summary, at: move.firstDetectedAt, closedAt: move.closedAt }).from(move)
    .where(and(eq(move.clientId, c.id), eq(move.competitorId, input.competitorId), or(gte(move.firstDetectedAt, since), isNull(move.closedAt)), sql`${liveEventCount} > 0`)),
] as const);
const items: TimelineItem[] = [
  ...events.map((e) => { const r = toEventRow(e, c.verticalId, names); return { kind: 'event' as const, id: r.eventId, at: r.occurredAt, title: r.summary, label: r.typeLabel, score: r.score, route: r.route, status: null }; }),
  ...moves.map((m) => ({ kind: 'move' as const, id: m.id, at: m.at.toISOString(), title: m.summary, label: MOVE_LABELS[m.moveType] ?? m.moveType, score: null, route: null, status: m.closedAt ? 'closed' : m.status })),
].sort((a, b) => b.at.localeCompare(a.at));
return { items };
```

Export `competitorProfileTools = [getCompetitorProfile, getCompetitorTimeline]` and register it. If `gbpSummary` isn't reachable as `import { gbpSummary } from '@cs/collectors'` (it is re-exported via `./prospect/report`), stop and report rather than duplicating it.

- [ ] **Step 4: Run tests** — the Step 2 command, plus `pnpm --filter @cs/tools exec vitest run src/tools/pages.test.ts` (unchanged behaviour) → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): competitor profile and timeline"
```

---

### Task 13: Competitor profile screen

**Files:**
- Modify: `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page.tsx` (rewrite), `page-controls.tsx` (unchanged API)
- Create: `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/timeline.tsx`, `timeline.test.tsx`

**Interfaces:**
- Consumes: `get_competitor_profile`, `get_competitor_timeline` (Task 12); `list_tracked_pages`; `PressureBadge`; `relativeTime` (`@/server/format`); `changesHref` (Task 8).
- Produces: `<Timeline clientId items now />` grouped by month (`"October 2026"`), with event rows linking to the changes viewer and move rows linking to the moves page.

- [ ] **Step 1: Write the failing test** `timeline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Timeline } from './timeline';

const C = '11111111-1111-4111-8111-111111111111';
const items = [
  { kind: 'move' as const, id: 'm1', at: '2026-10-06T00:00:00Z', title: 'Two price cuts in 30 days', label: 'Price war', score: null, route: null, status: 'active' },
  { kind: 'event' as const, id: 'e1', at: '2026-10-05T00:00:00Z', title: 'AC tune-up $99 → $79', label: 'Price change', score: 86, route: 'alert' as const, status: null },
  { kind: 'event' as const, id: 'e2', at: '2026-09-20T00:00:00Z', title: 'Hiring a technician', label: 'Hiring', score: 41, route: 'brief' as const, status: null },
];

describe('Timeline', () => {
  it('groups by month and links events and moves', () => {
    render(<Timeline clientId={C} items={items} />);
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /AC tune-up/ }).getAttribute('href')).toBe(`/c/${C}/changes?route=all&days=365&event=e1`);
    expect(screen.getByRole('link', { name: /Two price cuts/ }).getAttribute('href')).toBe(`/c/${C}/moves?status=all&move=m1`);
  });
  it('has an empty state', () => {
    render(<Timeline clientId={C} items={[]} />);
    expect(screen.getByText('No changes from this competitor in this period.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/competitors/[competitorId]"` → FAIL.

- [ ] **Step 3: Implement**

`timeline.tsx` (no hooks): group by `at.slice(0, 7)` and format the month with `new Date(at).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })` as an `h3`. Rows:
- Events: `Link` to `changesHref(clientId, { route: 'all', days: 365, event: id })` showing `{label} · {title}`, `D Mon`, score + route pill.
- Moves: an accent tile, `Link` to `/c/${clientId}/moves?status=all&move=${id}`, showing `{label} · {title}` and the status.

`page.tsx` (`force-dynamic`), replacing the agency-only "Tracked pages" page:
- `requireContext()`; `if (!hasFeature(ctx, 'dashboard')) notFound()`; `days` from `searchParams` (30/90/365, default 90).
- `Promise.all`: `get_competitor_profile`, `get_competitor_timeline` (days), `list_tracked_pages`.
- Header: `h1` `{name}`, the domain as an external link (`rel="noopener noreferrer"`, `target="_blank"`), `<PressureBadge score level />`, "Tracked since {D Mon YYYY}".
- KPI row (4 small cards):
  - Google rating `{rating ★}` / `{reviews} reviews` / "as of {date}" (or "No Google profile yet");
  - Active ads `Google {n} · Meta {n}`;
  - Open moves `{n}` (link to `/c/<id>/moves`);
  - Pages monitored `{active}`, plus a danger pill "Site blocks monitoring" when `pages.blocked > 0`.
- Two columns (`lg:grid-cols-[2fr_1fr]`):
  - Left: card "Timeline" with period links (30/90/365 days) and `<Timeline>`.
  - Right: card "Collection status" — rows `{label}`, `relativeTime(lastRunAt)`, `lastStatus` (or "Not run yet"), `active ? '' : 'paused'`. Then card "Pages", the existing table: `PinPageSwitch` and `AddPageForm` render only for `isAgencyRole(ctx.role)`, and client users get the plain read-only table with a "Pinned" text column.
- A comment: `{/* 5c-2 adds Pricing, Ads, Reviews and Rankings sections here. */}`

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): competitor profile with timeline, collection status and pages"
```

---

### Task 14: Competitors list for client users (client-owner self-service)

**Files:**
- Modify: `apps/web/src/app/(app)/c/[clientId]/competitors/page.tsx`, `actions.ts`, `competitor-controls.tsx`, `competitor-controls.test.tsx`, `nav-items.ts`, `sidebar-nav.test.tsx`
- Modify: `packages/tools/src/tools/competitors.test.ts` (one added case)

**Interfaces:**
- Consumes: existing tools; `canManageCompetitors`, `hasFeature`, `isAgencyRole` (`@cs/core`).
- Produces:
  - `SuggestionsPanel` gains `canSearch: boolean` (no "Find competitors" button and no polling when false).
  - `TrackedCompetitorsTable` gains `canRemove: boolean`.
  - `AddCompetitorForm` is rendered only when `canManage`.

- [ ] **Step 1: Write the failing tests**

`competitor-controls.test.tsx` — add:

```tsx
it('hides the paid search for client owners and shows a hint instead', () => {
  render(<SuggestionsPanel clientId="c1" ready suggestions={[]} initialSearch="idle" atLimit={false} limit={5} canSearch={false} />);
  expect(screen.queryByRole('button', { name: /Find competitors/ })).toBeNull();
  expect(screen.getByText('Your account manager can look for more competitors for you.')).toBeTruthy();
});

it('shows no remove button when the user may not manage competitors', () => {
  render(<TrackedCompetitorsTable clientId="c1" items={[{ id: 'x', name: 'Smith HVAC', domain: null, placeId: null, addedAt: '2026-10-01T00:00:00Z', activePages: 0 }]} canRemove={false} />);
  expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
});
```

`packages/tools/src/tools/competitors.test.ts` — add one case, if no existing case already covers it (search for `manage_competitors` first): a `client_owner` with `['dashboard', 'manage_competitors']` can `add_competitor`, and a `client_owner` with `['dashboard']` gets `permission_denied`, and so does `request_competitor_suggestions` for the flagged owner.

`sidebar-nav.test.tsx`: a client owner with `dashboard` sees "Competitors" between Overview and Changes.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/competitors/competitor-controls.test.tsx" src/components/shell` → FAIL (the props don't exist yet). The tools case may already pass — that's fine; it pins behaviour.

- [ ] **Step 3: Implement**

`competitors/page.tsx`:

```tsx
const { ctx } = await requireContext();
if (!hasFeature(ctx, 'dashboard')) notFound();
const agency = isAgencyRole(ctx.role);
const canManage = canManageCompetitors(ctx);
const [profile, tracked, suggestions, search] = await Promise.all([
  callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
  callTool<{ items: TrackedCompetitor[]; limit: number }>(ctx, 'list_client_competitors', { clientId }),
  canManage ? callTool<{ items: SuggestionView[] }>(ctx, 'list_competitor_suggestions', { clientId }) : Promise.resolve({ items: [] as SuggestionView[] }),
  agency ? callTool<{ state: SearchState }>(ctx, 'get_competitor_search_status', { clientId }) : Promise.resolve({ state: 'idle' as SearchState }),
]);
```

- Render the add form only when `canManage`, and `SuggestionsPanel` only when `canManage`, with `canSearch={agency}`.
- Pass `canRemove={canManage}`.
- Copy for client users: "The businesses we monitor for you ({n} of {limit})."
- The table's competitor-name links already go to `/c/<id>/competitors/<cid>`, now the profile.

`actions.ts`:
- Rename `agencyCtx()` to `memberCtx()`: `requireContext()` only (the tools gate roles and flags).
- `requestSuggestionsAction`, `setPinAction` and `addPageAction` keep an explicit `if (!isAgencyRole(ctx.role)) notFound();`.
- Accept/dismiss/add/remove use `memberCtx()`.
- `searchStatusAction` keeps the agency check.

`competitor-controls.tsx`:
- `SuggestionsPanel({ …, canSearch })`: when `!canSearch`, skip `useSearchProgress` polling (pass `initialSearch` as `'idle'`, and don't render the button or progress). Under the list, show "Your account manager can look for more competitors for you." The hook must still be called unconditionally (rules of hooks): give `useSearchProgress` an `enabled` argument and return early inside its effect when it's false.
- `TrackedCompetitorsTable({ …, canRemove })`: the Remove column only when `canRemove`.

`nav-items.ts`: change the Competitors line in `clientModules` from `flags.isAgency` to `flags.dashboard`.

- [ ] **Step 4: Run tests** — the Step 2 commands plus `pnpm --filter @cs/tools exec vitest run src/tools/competitors.test.ts` → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src packages/tools/src/tools/competitors.test.ts
git commit -m "feat(web): client owners manage their competitors (5b-1 carry-over)"
```

---

### Task 15: `get_ad_activity` and `get_workspace_overview`

**Files:**
- Create: `packages/tools/src/workspace/ads.ts`, `packages/tools/src/tools/overview.ts`, `packages/tools/src/tools/overview.test.ts`
- Modify: `schemas.ts`, `all.ts`, `src/index.ts`

**Interfaces:**
- Consumes: Task 3 helpers; `pressureByClient`; `gbpSummary`; `observation`, `ad`, `capture`, `prospectReport` (`@cs/db`).
- Produces:
  - `adWeeklySeries(db: Db, competitorIds: string[], now: Date, weeks: number): Promise<Map<string, (number | null)[]>>` — points oldest → newest, the last point at `now`.
  - `AdActivityView = { weeks: string[]; series: { competitorId: string; name: string; points: (number | null)[] }[] }` (weeks are ISO `YYYY-MM-DD` of each point; series sorted by name).
  - `WorkspaceOverview = { clientId, trackedCompetitors, zips, changes7d, alerts7d, priceMoves7d, priceCuts7d, activeAds: int | null, activeAds7dAgo: int | null, rating: { self: number | null; competitorAverage: number | null }, pressure: { competitorId, name, pressure: PressureView }[], pitchSnapshot: boolean }`.
  - Tools `get_ad_activity` (`read` + `dashboard`) and `get_workspace_overview` (`read` + `dashboard`).

- [ ] **Step 1: Write the failing test** `overview.test.ts` (reuse the `events.test.ts` setup and `seedEvent`):

```ts
describe('get_ad_activity', () => {
  it('counts active ads per week and leaves points before the first ad check empty (decision 13)', async () => {
    const now = Date.now();
    await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 't', capturedAt: new Date(now - 15 * day) });
    await dbs.owner.insert(ad).values([
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'a', isActive: true, firstSeenAt: new Date(now - 15 * day), lastSeenAt: new Date(now) },
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'b', isActive: false, firstSeenAt: new Date(now - 15 * day), lastSeenAt: new Date(now - 10 * day), endedAt: new Date(now - 10 * day) },
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'c', isActive: true, firstSeenAt: new Date(now - 3 * day), lastSeenAt: new Date(now) },
    ]);
    const r = (await registry.invoke(am, 'get_ad_activity', { clientId: IDS.clientA1, weeks: 4 })) as AdActivityView;
    expect(r.weeks).toHaveLength(4);
    expect(r.series).toEqual([{ competitorId: IDS.competitorX, name: 'Smith HVAC', points: [null, null, 1, 2] }]);
  });
});

describe('get_workspace_overview', () => {
  it('computes the KPIs from live events only (Review Focus 3)', async () => {
    const priceFacts = [{ kind: 'price', before: { kind: 'price', value: 99, unit: 'USD', raw: '$99', context: '' }, after: { kind: 'price', value: 79, unit: 'USD', raw: '$79', context: '' }, pct: -20.2 }];
    const cut = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await dbs.owner.update(changeEvent).set({ facts: priceFacts as never }).where(eq(changeEvent.id, cut.eventId));
    await seedEvent({ score: 50, route: 'brief', ageDays: 2, type: 'promo' });
    await seedEvent({ score: 90, route: 'alert', ageDays: 1, retracted: true });
    await seedEvent({ score: 20, route: 'archive', ageDays: 1 });
    await seedEvent({ score: 60, route: 'brief', ageDays: 9 });
    await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
    const o = (await registry.invoke(owner, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview;
    expect(o).toMatchObject({ trackedCompetitors: 1, changes7d: 2, alerts7d: 1, priceMoves7d: 1, priceCuts7d: 1, activeAds: null, pitchSnapshot: false });
    expect(o.pressure[0]).toMatchObject({ name: 'Smith HVAC' });
  });

  it('compares the self business rating with the competitor average', async () => {
    const [self] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC (self)', placeId: 'ChIJselfA1xxxxx' }).returning();
    await dbs.owner.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, IDS.clientA1));
    const gbpObs = async (competitorId: string, rating: number) => {
      const [c] = await dbs.owner.insert(capture).values({ competitorId, source: 'google_business_profile', status: 'ok', collectorVersion: 't', capturedAt: new Date() }).returning();
      await dbs.owner.insert(observation).values({ competitorId, captureId: c!.id, kind: 'gbp_profile', key: 'profile', data: { rating, votes: 10 }, observedAt: new Date() });
    };
    await gbpObs(self!.id, 4.8);
    await gbpObs(IDS.competitorX, 4.5);
    const o = (await registry.invoke(am, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview;
    expect(o.rating).toEqual({ self: 4.8, competitorAverage: 4.5 });
  });

  it('flags the pitch snapshot for agency roles only, and needs dashboard for clients', async () => {
    await dbs.owner.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'ready', finishedAt: new Date(), data: { generatedAt: new Date().toISOString(), keywords: [], points: 9, scanId: null, businesses: [], notes: [] } });
    expect(((await registry.invoke(am, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview).pitchSnapshot).toBe(true);
    expect(((await registry.invoke(owner, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview).pitchSnapshot).toBe(false);
    await expect(registry.invoke(ownerNoDash, 'get_workspace_overview', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

Self competitors are visible to the client through `client.self_competitor_id` (`app_competitor_visible`), so the service-Db reads here are allowed after `workspaceClient`.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/overview.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`workspace/ads.ts`:

```ts
import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/** Decision 13: weekly active-ad counts (oldest → newest, last point = now); null before the competitor's first ok ad capture. */
export async function adWeeklySeries(db: Db, competitorIds: string[], now: Date, weeks: number): Promise<Map<string, (number | null)[]>> {
  const out = new Map<string, (number | null)[]>(competitorIds.map((id) => [id, Array<number | null>(weeks).fill(null)]));
  if (competitorIds.length === 0) return out;
  const ids = sql`ARRAY[${sql.join(competitorIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;
  const at = now.toISOString();
  const rows = (await db.execute(sql`
    WITH weeks AS (SELECT w.i, ${at}::timestamptz - make_interval(days => 7 * w.i) AS at FROM generate_series(0, ${weeks - 1}::int) AS w(i)),
    firsts AS (SELECT competitor_id, min(captured_at) AS t FROM capture
               WHERE competitor_id = ANY(${ids}) AND source IN ('google_ads', 'meta_ads') AND status = 'ok' GROUP BY competitor_id)
    SELECT c.id::text AS competitor_id, w.i,
      CASE WHEN f.t IS NULL OR w.at < f.t THEN NULL ELSE (
        SELECT count(*)::int FROM ad a WHERE a.competitor_id = c.id AND a.first_seen_at <= w.at AND (a.is_active OR coalesce(a.ended_at, a.last_seen_at) > w.at)
      ) END AS n
    FROM unnest(${ids}) AS c(id) CROSS JOIN weeks w LEFT JOIN firsts f ON f.competitor_id = c.id`)) as unknown as { competitor_id: string; i: number; n: number | null }[];
  for (const r of rows) out.get(r.competitor_id)![weeks - 1 - Number(r.i)] = r.n === null ? null : Number(r.n);
  return out;
}
```

(`a.is_active` counts an ad at a past point if it was first seen by then — the same convention as `adActivity`, which the moves engine already relies on.)

`schemas.ts` — add `AdActivityView` and `WorkspaceOverview` matching the Interfaces block (zod objects with `.int()` counts and nullable numbers).

`overview.ts`:
- `get_ad_activity`, input `{ clientId, weeks: z.number().int().min(4).max(26).default(12), competitorId: uuid.optional() }`:
  1. `workspaceClient`.
  2. Read tracked competitors through RLS: `withTenant` select `competitor.id, name` joined on `client_competitor` for the client, ordered by name, filtered by `competitorId` when given. An unknown or untracked `competitorId` returns an empty series list, not an error.
  3. `adWeeklySeries(deps.service, ids, now, weeks)`.
  4. `weeks` labels = `Array.from({ length: weeks }, (_, k) => new Date(now - (weeks - 1 - k) * 7 * DAY).toISOString().slice(0, 10))`.
- `get_workspace_overview`, input `{ clientId }`:
  1. `workspaceClient`.
  2. Inside one `withTenant`:
     - tracked competitors (id, name);
     - `pressureByClient(tx, [c.id], now)`;
     - counts over `eventScore ⋈ event ⋈ client_competitor` with `clientEvents(c.id)` and `gte(eventScore.scoredAt, now − 7d)`: `changes7d` (route alert/brief), `alerts7d` (route alert), and the `price_change` rows' `services`/`facts`;
     - `pitchSnapshot = isAgencyRole(ctx.role) && exists prospect_report(clientId, status 'ready')`.
  3. Price moves in JS: `priceMoves7d` = rows whose `services?.[c.verticalId]` is in `c.services`; `priceCuts7d` = those with `facts.some(f => f.kind === 'price' && typeof f.before?.value === 'number' && typeof f.after?.value === 'number' && f.after.value < f.before.value)`.
  4. Ads: `adWeeklySeries(deps.service, trackedIds, now, 2)`. `activeAds` = the sum of the last points, `null` if all are null; `activeAds7dAgo` the same for the first points.
  5. Rating:
     - the newest `gbp_profile` observation per competitor for `[...trackedIds, c.selfCompetitorId].filter(Boolean)` — `selectDistinctOn([observation.competitorId], …).orderBy(observation.competitorId, desc(observation.observedAt))`;
     - `self` = `gbpSummary(selfData)?.rating ?? null`;
     - `competitorAverage` = the mean of the non-null tracked ratings, rounded to 1 decimal, or `null`.
  6. Return the `WorkspaceOverview` (pressure mapped to `{ competitorId, name, pressure }`).

Export `overviewTools = [getAdActivity, getWorkspaceOverview]`, register it, and re-export `./workspace/ads`.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): get_ad_activity and get_workspace_overview"
```

---

### Task 16: Inline-SVG line chart

**Files:**
- Create: `apps/web/src/components/charts/line-chart.tsx`, `apps/web/src/components/charts/line-chart.test.tsx`

**Interfaces:**
- Produces:
  - `SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const`; `OTHER_COLOR = '#94a3b8'`.
  - `interface ChartSeries { key: string; name: string; points: (number | null)[] }`.
  - `foldSeries(series: ChartSeries[], max = 5): ChartSeries[]` — with ≤ `max` series, unchanged. Otherwise it keeps the `max − 1` with the highest last non-null value (ties by name), in name order, plus `{ key: 'other', name: 'Other', points }` summing the rest (a point is null only if every folded point is null).
  - `<LineChart title={string} labels={string[]} series={ChartSeries[]} valueLabel={string} height?={number} />` — a server component (no hooks), reused by 5c-2.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { foldSeries, LineChart, OTHER_COLOR, SERIES_COLORS } from './line-chart';

const labels = ['2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];

describe('foldSeries', () => {
  it('keeps the strongest series and folds the rest into Other', () => {
    const s = Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, name: `C${i}`, points: [null, i, i, i] }));
    const f = foldSeries(s, 5);
    expect(f.map((x) => x.name)).toEqual(['C3', 'C4', 'C5', 'C6', 'Other']);
    expect(f[4]!.points).toEqual([null, 3, 3, 3]);
  });
});

describe('LineChart', () => {
  it('draws one path segment per run of known points, with a legend and a table', () => {
    render(<LineChart title="Active competitor ads" valueLabel="active ads" labels={labels} series={[
      { key: 'a', name: 'Smith HVAC', points: [7, null, 9, 13] },
      { key: 'b', name: 'Peachtree', points: [2, 3, 3, 4] },
    ]} />);
    const svg = screen.getByRole('img', { name: /Active competitor ads/ });
    expect(svg.querySelectorAll('polyline[data-series="a"]')).toHaveLength(2);
    expect(svg.querySelector('polyline[data-series="a"]')?.getAttribute('stroke')).toBe(SERIES_COLORS[0]);
    expect(screen.getByText('Smith HVAC', { selector: 'li *' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(5); // header + 4 weeks
    expect(svg.querySelector('title')?.textContent).toMatch(/Smith HVAC: 7 active ads/);
  });

  it('has no legend for a single series and an empty state with no data', () => {
    const { rerender } = render(<LineChart title="T" valueLabel="ads" labels={labels} series={[{ key: 'a', name: 'Solo', points: [1, 2, 3, 4] }]} />);
    expect(screen.queryByRole('list')).toBeNull();
    rerender(<LineChart title="T" valueLabel="ads" labels={labels} series={[{ key: 'a', name: 'Solo', points: [null, null, null, null] }]} />);
    expect(screen.getByText('No data yet.')).toBeTruthy();
  });

  it('paints Other grey', () => {
    render(<LineChart title="T" valueLabel="ads" labels={labels} series={[{ key: 'other', name: 'Other', points: [1, 1, 1, 1] }, { key: 'a', name: 'A', points: [1, 1, 1, 1] }]} />);
    expect(document.querySelector('polyline[data-series="other"]')?.getAttribute('stroke')).toBe(OTHER_COLOR);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/components/charts` → FAIL.

- [ ] **Step 3: Implement** `line-chart.tsx`:

```tsx
/** Decision 18 + the dataviz method: fixed-order categorical slots (validated 2026-10-08), legend for ≥ 2 series, table view, native tooltips. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const;
export const OTHER_COLOR = '#94a3b8';

export interface ChartSeries { key: string; name: string; points: (number | null)[] }

const last = (p: (number | null)[]) => { for (let i = p.length - 1; i >= 0; i--) if (p[i] !== null) return p[i]!; return -Infinity; };

export function foldSeries(series: ChartSeries[], max = 5): ChartSeries[] {
  if (series.length <= max) return series;
  const ranked = [...series].sort((a, b) => last(b.points) - last(a.points) || a.name.localeCompare(b.name));
  const kept = ranked.slice(0, max - 1).sort((a, b) => a.name.localeCompare(b.name));
  const rest = ranked.slice(max - 1);
  const len = Math.max(...series.map((s) => s.points.length));
  const points = Array.from({ length: len }, (_, i) => {
    const vals = rest.map((s) => s.points[i]).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  });
  return [...kept, { key: 'other', name: 'Other', points }];
}

const niceMax = (v: number) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function LineChart({ title, labels, series, valueLabel, height = 180 }: { title: string; labels: string[]; series: ChartSeries[]; valueLabel: string; height?: number }) {
  const all = series.flatMap((s) => s.points.filter((v): v is number => v !== null));
  if (all.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const W = 600, H = height, L = 32, R = 12, T = 10, B = 22;
  const yMax = niceMax(Math.max(...all));
  const x = (i: number) => L + (labels.length === 1 ? 0 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const colorOf = (s: ChartSeries, i: number) => (s.key === 'other' ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]!);
  const named = series.filter((s) => s.key !== 'other');
  const summary = series.map((s) => `${s.name} ${last(s.points) === -Infinity ? 'no data' : last(s.points)}`).join(', ');
  const runs = (p: (number | null)[]) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    p.forEach((v, i) => { if (v === null) { if (cur.length) out.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
    if (cur.length) out.push(cur);
    return out;
  };
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Latest: ${summary}.`} className="w-full">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(yMax * f)} y2={y(yMax * f)} stroke="#E2E8F0" strokeWidth={1} />
            <text x={L - 6} y={y(yMax * f) + 4} textAnchor="end" fontSize={11} fill="#64748B">{Math.round(yMax * f)}</text>
          </g>
        ))}
        {[0, Math.floor((labels.length - 1) / 2), labels.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#64748B">{shortDate(labels[i]!)}</text>
        ))}
        {series.map((s, si) => {
          const color = colorOf(s, named.indexOf(s) === -1 ? si : named.indexOf(s));
          const lastIdx = s.points.findLastIndex((v) => v !== null);
          return (
            <g key={s.key}>
              {runs(s.points).map((r, k) => (
                <polyline key={k} data-series={s.key} points={r.map(([a, b]) => `${a},${b}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {lastIdx >= 0 && <circle cx={x(lastIdx)} cy={y(s.points[lastIdx]!)} r={4} fill={color} stroke="#FFFFFF" strokeWidth={2} />}
              {s.points.map((v, i) => v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={8} fill="transparent">
                  <title>{`${s.name}: ${v} ${valueLabel} (week of ${shortDate(labels[i]!)})`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length >= 2 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
          {series.map((s, si) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: colorOf(s, named.indexOf(s) === -1 ? si : named.indexOf(s)) }} />
              <span>{s.name}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th>Week of</th>{series.map((s) => <th key={s.key}>{s.name}</th>)}</tr></thead>
          <tbody>{labels.map((l, i) => <tr key={l}><td>{shortDate(l)}</td>{series.map((s) => <td key={s.key}>{s.points[i] ?? '—'}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
```

`Array.prototype.findLastIndex` needs `lib: ES2023` — check `apps/web/tsconfig.json`. If it's not available, write a small loop instead. The test's `'li *'` selector expects the name inside an element within `<li>` (the `<span>` above).

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/web typecheck` → clean. Render the chart once in the browser (Task 17's page) and look at it for label collisions before calling Task 17 done (dataviz step 7).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts
git commit -m "feat(web): inline-SVG line chart with legend, table view and tooltips"
```

---

### Task 17: Overview screen and pitch snapshot

**Files:**
- Create: `apps/web/src/components/stat-card.tsx`, `stat-card.test.tsx`, `apps/web/src/components/client-home-basic.tsx`, `apps/web/src/app/(app)/c/[clientId]/overview-kpis.ts`, `overview-kpis.test.ts`, `apps/web/src/app/(app)/c/[clientId]/pitch-snapshot/page.tsx`
- Modify: `apps/web/src/app/(app)/c/[clientId]/page.tsx`

**Interfaces:**
- Consumes: `get_workspace_overview`, `get_ad_activity` (Task 15); `list_moves` (Task 10); `list_briefs`, `get_brief`, `list_alerts`, `list_trend_reports`, `list_recommendations`, `get_prospect_report`, `get_client_profile`; `LineChart`, `foldSeries` (Task 16); `EvidenceChips` (Task 6); `MoveCard` (Task 11); `PressureBadge`; `ProspectLandscape` (`@/components/prospect-landscape`).
- Produces:
  - `<StatCard title value pill? hint />`, with `pill = { text: string; tone: 'up' | 'down' | 'warn' | 'info' }`;
  - `kpiCards(o: WorkspaceOverview): { title: string; value: string; pill: Pill | null; hint: string }[]` (pure, tested);
  - `ClientHomeBasic` (the old 5a page body, unchanged).

- [ ] **Step 1: Write the failing tests**

`overview-kpis.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kpiCards } from './overview-kpis';

const base = { clientId: 'c', trackedCompetitors: 5, zips: 12, changes7d: 14, alerts7d: 3, priceMoves7d: 2, priceCuts7d: 1, activeAds: 23, activeAds7dAgo: 14, rating: { self: 4.8, competitorAverage: 4.5 }, pressure: [], pitchSnapshot: false };

describe('kpiCards', () => {
  it('builds the four mockup cards', () => {
    expect(kpiCards(base)).toEqual([
      { title: 'Changes this week', value: '14', pill: { text: '3 high', tone: 'warn' }, hint: 'Across websites, ads, reviews and profiles' },
      { title: 'Competitor price moves', value: '2', pill: { text: '↓ 1 cut', tone: 'down' }, hint: 'On services you also offer' },
      { title: 'Active competitor ads', value: '23', pill: { text: '+9 vs last week', tone: 'info' }, hint: 'Meta and Google, where visible' },
      { title: 'Your rating vs area', value: '4.8 ★', pill: { text: '+0.3 above avg', tone: 'up' }, hint: 'Competitor average 4.5' },
    ]);
  });
  it('degrades honestly when data is missing', () => {
    const c = kpiCards({ ...base, alerts7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, rating: { self: null, competitorAverage: 4.5 } });
    expect(c[0]!.pill).toBeNull();
    expect(c[1]!.pill).toBeNull();
    expect(c[2]).toMatchObject({ value: '—', pill: null, hint: 'The first weekly ad check fills this in' });
    expect(c[3]).toMatchObject({ value: '—', pill: null, hint: 'Add your Google place id to compare' });
    expect(kpiCards({ ...base, rating: { self: 4.2, competitorAverage: 4.5 } })[3]!.pill).toEqual({ text: '−0.3 below avg', tone: 'down' });
  });
});
```

`stat-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('shows the title, value, pill and hint', () => {
    render(<StatCard title="Changes this week" value="14" pill={{ text: '3 high', tone: 'warn' }} hint="Across websites" />);
    expect(screen.getByText('Changes this week')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('3 high')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/components/stat-card.test.tsx "src/app/(app)/c/[clientId]/overview-kpis.test.ts"` → FAIL.

- [ ] **Step 3: Implement**

`overview-kpis.ts` — pure. Use the exact strings from the test. Rating delta = `round((self − avg) × 10) / 10`: `+x above avg` (up) when > 0, `−x below avg` (down, with a real minus sign `−`) when < 0, and `On par with the area` (info) when 0. `cut`/`cuts` pluralised. Ads delta: `+n vs last week` / `−n vs last week` / `Same as last week` (info); `null` when either value is null.

`stat-card.tsx` — the mockup KPI card: title `text-sm font-semibold text-muted-foreground`, value in the KPI style, a pill with the Global-Constraints tone classes (`warn` = the brief pill colours, `down` = the alert pill colours), and the hint `text-xs text-muted-foreground`.

`client-home-basic.tsx` — move the current `ClientHome` body here as `export async function ClientHomeBasic({ clientId, ctx })` (same calls, same markup).

`page.tsx`:

```tsx
export default async function ClientHome({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) return <ClientHomeBasic clientId={clientId} ctx={ctx} />;
  const [profile, overview, ads, moves, briefs, alerts, recs, reports] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<WorkspaceOverview>(ctx, 'get_workspace_overview', { clientId }),
    callTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, weeks: 12 }),
    callTool<{ items: MoveRow[] }>(ctx, 'list_moves', { clientId }),
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 1 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 5 }),
    callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
  ]);
  const latest = briefs.items[0] ? await callTool<BriefDetail>(ctx, 'get_brief', { briefId: briefs.items[0].id }) : null;
  // …render (below)
}
```

Layout (mockup 01, without the Ask panel):
- **Heading:** `h1` `{profile.name}`. Sub: `Tracking {trackedCompetitors} competitor(s)` + (`zips > 0` ? ` across {zips} ZIP codes` : '') + (latest approved/sent ? ` · Brief for the week of {deliveryDate}` : '').
- **Agency roles with `overview.pitchSnapshot`:** an info link "Pitch snapshot →" to `/c/${clientId}/pitch-snapshot`.
- **Row 1:** `grid gap-5 sm:grid-cols-2 xl:grid-cols-4` of `StatCard`s from `kpiCards(overview)`.
- **Row 2** (`lg:grid-cols-[2fr_1fr]`):
  - Left, card "This week's brief": `latest` items sorted by `ord`. Each item is a block with a 3 px left border (accent when `confidence ≥ 0.85` and it's the first item, else primary) on `bg-muted-surface`, holding the `h4` headline, `whatChanged`, "**Suggested:** {recommendedAction}" and `<EvidenceChips clientId ids={item.evidenceIds} />`.
    - A quiet brief shows its `summary`; no brief shows "No briefs yet. The first one arrives on a Monday morning."
    - Links: "Open brief" → `/c/<id>/briefs/<id>`; "Download PDF" → `/files/brief/<id>` when `hasPdf`.
  - Right column: card "Competitive pressure" — one row per `overview.pressure` entry: name (link to the competitor profile), the first reason as a subline, an 8 px bar (colour by level: high `#DC2626`, elevated accent, low primary) with the width at the score %, the score number, and `aria-label` "Competitive pressure {score} of 100, {level}". Below it, card "Recent alerts" (the current markup).
- **Row 3** (`lg:grid-cols-3`):
  - "Moves detected" — top 3 `MoveCard`s from `moves.items`, plus "All →" to `/moves`; empty: "No moves detected right now."
  - "Competitor ad activity" — hint "12 weeks", then `<LineChart title="Active competitor ads per week" valueLabel="active ads" labels={ads.weeks} series={foldSeries(ads.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })))} />`.
  - "Recommendations" — open ones (`todo`/`in_progress`), top 4: title + status line, plus "All →" to the board, and a pill "{n} open".
- **Below:** the quarterly-reports card (the current markup).

`pitch-snapshot/page.tsx`: agency roles only (`notFound()` otherwise). `get_prospect_report`, then if the report is `ready`, render `<ProspectLandscape data={report.data} />` (check its prop name in `components/prospect-landscape.tsx`) under the title "Pitch snapshot — {profile.name}" and the sub "The landscape we showed before {name} became a client ({date})." Otherwise `notFound()`.

- [ ] **Step 4: Run tests** — the Step 2 command plus `pnpm --filter @cs/web exec vitest run src/components` → PASS. `pnpm --filter @cs/web typecheck` → clean. Then start `pnpm dev:web` against `cs_test` data or a seeded local run, if available, and look at the Overview at 1440 px and 390 px wide: no horizontal scroll, the chart's labels don't collide, and the KPI grid wraps. If running the app isn't possible in this environment, say so in the task report — Task 20's E2E opens the page.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): client overview (module 1) and the pitch snapshot after conversion"
```

---

### Task 18: `get_alert_rules` and `set_alert_rules`

**Files:**
- Create: `packages/tools/src/tools/alert-rules.ts`, `packages/tools/src/tools/alert-rules.test.ts`
- Modify: `schemas.ts`, `all.ts`

**Interfaces:**
- Consumes: `workspaceClient`; `packsOf`; `validThresholds` (`@cs/engine`).
- Produces:
  - `AlertRulesView = { alert: int; brief: int; custom: boolean; defaults: { alert: int; brief: int } }`;
  - tools `get_alert_rules` (`read` + `alert_rules`) → `AlertRulesView`, and `set_alert_rules` (`manage` + `alert_rules`) → `AlertRulesView`.

- [ ] **Step 1: Write the failing test** `alert-rules.test.ts` (registry with `packs`, contexts as in Task 3):

```ts
const ownerRules = ctx('client_owner', [IDS.clientA1], ['dashboard', 'alert_rules']);
const ownerNoRules = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const viewerRules = ctx('client_viewer', [IDS.clientA1], ['dashboard', 'alert_rules']);
const set = (c: AccessContext, input: Record<string, unknown>) => registry.invoke(c, 'set_alert_rules', { clientId: IDS.clientA1, ...input });
const stored = async () => (await dbs.owner.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.t;

describe('alert rules', () => {
  it('reads the pack defaults, saves custom thresholds and resets them', async () => {
    expect(await registry.invoke(ownerRules, 'get_alert_rules', { clientId: IDS.clientA1 })).toEqual({ alert: 70, brief: 40, custom: false, defaults: { alert: 70, brief: 40 } });
    expect(await set(ownerRules, { alert: 60, brief: 30 })).toEqual({ alert: 60, brief: 30, custom: true, defaults: { alert: 70, brief: 40 } });
    expect(await stored()).toEqual({ alert: 60, brief: 30 });
    expect(await set(am, { reset: true })).toMatchObject({ alert: 70, brief: 40, custom: false });
    expect(await stored()).toBeNull();
  });

  it('refuses bad thresholds with a message and changes nothing (Review Focus 4)', async () => {
    await set(ownerRules, { alert: 60, brief: 30 });
    for (const bad of [{ alert: 50, brief: 50 }, { alert: 40, brief: 60 }, { alert: 0, brief: 0 }, { alert: 101, brief: 40 }, { alert: 70, brief: 0 }, { alert: 70.5, brief: 40 }, { alert: Number.NaN, brief: 40 }, { alert: 70 }, {}]) {
      await expect(set(ownerRules, bad)).rejects.toMatchObject({ code: 'invalid_input' });
    }
    expect(await stored()).toEqual({ alert: 60, brief: 30 });
  });

  it('needs the alert_rules flag, and manage to change (Review Focus 2)', async () => {
    await expect(registry.invoke(ownerNoRules, 'get_alert_rules', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(set(ownerNoRules, { alert: 60, brief: 30 })).rejects.toMatchObject({ code: 'permission_denied' });
    expect(await registry.invoke(viewerRules, 'get_alert_rules', { clientId: IDS.clientA1 })).toMatchObject({ alert: 70 });
    await expect(set(viewerRules, { alert: 60, brief: 30 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(ctx('agency_admin', 'all', [], IDS.agencyB), 'set_alert_rules', { clientId: IDS.clientA1, alert: 60, brief: 30 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not re-route events already scored', async () => {
    const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning();
    await dbs.owner.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score: 65, route: 'brief', factors: {} as never, packVersion: 1, scoredAt: new Date() });
    await set(ownerRules, { alert: 60, brief: 30 });
    expect((await dbs.owner.select({ r: eventScore.route }).from(eventScore))[0]!.r).toBe('brief');
  });
});
```

`NaN` passed through the registry: `z.number()` rejects `NaN` by default in Zod 4 — still `invalid_input`, which is what the test asserts.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/tools/alert-rules.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`schemas.ts`: `export const AlertRulesView = z.object({ alert: z.number().int(), brief: z.number().int(), custom: z.boolean(), defaults: z.object({ alert: z.number().int(), brief: z.number().int() }) }); export type AlertRulesView = z.infer<typeof AlertRulesView>;`

`alert-rules.ts`:

```ts
const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

async function view(deps: ToolDeps, verticalId: string, t: ScoreThresholds | null): Promise<AlertRulesView> {
  const d = (await packsOf(deps)(verticalId)).scoring.routing;
  const defaults = { alert: d.alert, brief: d.brief };
  return validThresholds(t) ? { alert: t.alert, brief: t.brief, custom: true, defaults } : { ...defaults, custom: false, defaults };
}

async function thresholdsOf(deps: ToolDeps, ctx: AccessContext, clientId: string) {
  const c = await workspaceClient(deps, ctx, clientId);
  const [row] = await withTenant(deps.app, ctx, (tx) => tx.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, c.id)));
  return { c, t: row?.t ?? null };
}

export const getAlertRules = defineTool({
  name: 'get_alert_rules',
  description: 'The score from which a competitor change becomes an instant alert, and from which it goes into the weekly brief.',
  input: z.object({ clientId: uuid }),
  output: AlertRulesView,
  permission: 'read',
  feature: 'alert_rules',
  async handler(ctx, { clientId }, deps) {
    const { c, t } = await thresholdsOf(deps, ctx, clientId);
    return view(deps, c.verticalId, t);
  },
});

const whole = (v: number | undefined, min: number, max: number) => v !== undefined && Number.isInteger(v) && v >= min && v <= max;

export const setAlertRules = defineTool({
  name: 'set_alert_rules',
  description: 'Change the alert and weekly-brief score thresholds for a client, or go back to the defaults. Applies to changes detected from now on.',
  input: z.object({ clientId: uuid, alert: z.number().optional(), brief: z.number().optional(), reset: z.boolean().default(false) }),
  output: AlertRulesView,
  permission: 'manage',
  feature: 'alert_rules',
  async handler(ctx, input, deps) {
    const { c } = await thresholdsOf(deps, ctx, input.clientId);
    let next: ScoreThresholds | null = null;
    if (!input.reset) {
      if (!whole(input.alert, 2, 100)) throw new ToolError('invalid_input', 'The alert threshold must be a whole number from 2 to 100.');
      if (!whole(input.brief, 1, 99)) throw new ToolError('invalid_input', 'The brief threshold must be a whole number from 1 to 99.');
      if (input.brief! >= input.alert!) throw new ToolError('invalid_input', 'The brief threshold must be lower than the alert threshold.');
      next = { alert: input.alert!, brief: input.brief! };
      if (!validThresholds(next)) throw new ToolError('invalid_input', 'Those thresholds are not valid.');
    }
    // `app_user` holds UPDATE (score_thresholds) — RLS scopes the row (decision 14).
    const updated = await withTenant(deps.app, ctx, (tx) => tx.update(client).set({ scoreThresholds: next }).where(eq(client.id, c.id)).returning({ id: client.id }));
    if (updated.length === 0) throw new ToolError('not_found', 'Client not found');
    return view(deps, c.verticalId, next);
  },
});

export const alertRuleTools = [getAlertRules, setAlertRules];
```

Imports: `type AccessContext`, `toolkit`, `ToolError` (`@cs/core`); `client`, `type ScoreThresholds`, `withTenant` (`@cs/db`); `validThresholds` (`@cs/engine`); `eq`. If `ScoreThresholds` isn't exported from `@cs/db`, use `NonNullable<typeof client.$inferSelect['scoreThresholds']>`. If the pack's routing values are typed as `number`, round-trip them as-is (they are 70/40 integers in both packs). Register in `all.ts`.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/tools typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): get_alert_rules and set_alert_rules (score thresholds)"
```

---

### Task 19: Settings screens — alert rules, AI connections, read-only services & area

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/settings/alerts/{page.tsx,actions.ts,alert-rules-form.tsx,alert-rules-form.test.tsx}`, `apps/web/src/app/(app)/c/[clientId]/settings/ai/page.tsx`, `apps/web/src/components/services-area-summary.tsx`, `services-area-summary.test.tsx`
- Modify: `apps/web/src/app/(app)/c/[clientId]/settings/profile/page.tsx`, `nav-items.ts`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `get_alert_rules`, `set_alert_rules` (Task 18); `get_client_profile`; `verticalOptions()`.
- Produces: `saveAlertRulesAction(_p, fd)` (intents `save` / `reset`); `<AlertRulesForm action rules canEdit />`; `<ServicesAreaSummary profile serviceNames />`; nav items "Services & area" (client users with dashboard), "Alert rules" (`alertRules`), "AI connections" (`mcp`).

- [ ] **Step 1: Write the failing tests**

`alert-rules-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlertRulesForm } from './alert-rules-form';

const rules = { alert: 70, brief: 40, custom: false, defaults: { alert: 70, brief: 40 } };

describe('AlertRulesForm', () => {
  it('posts both thresholds and keeps the message visible', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Alert rules saved.' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    fireEvent.change(screen.getByLabelText('Instant alert from score'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Alert rules saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('intent'), fd.get('alert'), fd.get('brief')]).toEqual(['save', '60', '30']);
  });
  it('shows an error from the server', async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: 'The brief threshold must be lower than the alert threshold.' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('lower than the alert'));
  });
  it('is read-only without edit rights', () => {
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit={false} action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(/Instant alert from score 70/)).toBeTruthy();
  });
});
```

`services-area-summary.test.tsx`: render with `services: ['ac_repair']`, `serviceNames: { ac_repair: 'AC repair' }`, keywords `['ac repair']`, and a service area of 25 km with 3 ZIPs and towns `['Granbury']`. Expect the texts "AC repair", "ac repair", "25 km around the business", "3 ZIP codes" and "Granbury". With `serviceArea: null`, expect "No service area set yet."

Add `sidebar-nav.test.tsx` cases:
- an agency user sees, after Delivery, "Alert rules" and "AI connections";
- a client owner with `dashboard`, `alertRules` and `mcp` sees "Services & area", "Alert rules" and "AI connections";
- a client owner without these flags sees none of them.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/settings" src/components/services-area-summary.test.tsx src/components/shell` → FAIL.

- [ ] **Step 3: Implement**

`settings/alerts/actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const num = (fd: FormData, k: string) => { const raw = String(fd.get(k) ?? '').trim(); return raw === '' ? undefined : Number(raw); };

export async function saveAlertRulesAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const clientId = String(fd.get('clientId') ?? '');
  const reset = fd.get('intent') === 'reset';
  const r = await runTool(ctx, 'set_alert_rules', reset ? { clientId, reset: true } : { clientId, alert: num(fd, 'alert'), brief: num(fd, 'brief') });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/settings/alerts`);
  return { ok: true, message: reset ? 'Back to the default thresholds.' : 'Alert rules saved.' };
}
```

`alert-rules-form.tsx` (`'use client'`): one `useActionState`, which stays mounted.
- With `canEdit`: two number inputs (`min` 1/2, `max` 99/100, `step` 1) labelled "Weekly brief from score" (`name="brief"`) and "Instant alert from score" (`name="alert"`), `defaultValue` from `rules`; the inputs are keyed on `${rules.alert}-${rules.brief}` so a reset remounts them with the new values (the 5b-2 Task 6 lesson). Hidden `clientId`, and two submit buttons with `name="intent"`: "Save" (`value="save"`) and "Use the defaults ({defaults.alert}/{defaults.brief})" (`value="reset"`, shown only when `rules.custom`).
- Without `canEdit`: a sentence "Instant alert from score {alert}; weekly brief from score {brief}." plus "Ask your account manager to change these."
- Message `<p>` below (`role="alert"` on error).

`settings/alerts/page.tsx` (`force-dynamic`):
- `requireContext()`; `if (!hasFeature(ctx, 'alert_rules')) notFound()`.
- `get_alert_rules`.
- Title "Alert rules — {profile.name}". The explanation card:
  - "Every competitor change gets a score from 0 to 100 for how much it matters to {name}."
  - "From {alert}: an instant alert. From {brief} to {alert − 1}: the weekly brief. Below {brief}: archived — still visible under Changes."
  - "New thresholds apply to changes detected from now on; changes already scored keep their place."
  - "Instant alerts are still limited to 3 a day; extra ones go into the daily digest."

  Then `<AlertRulesForm canEdit={hasPermission(ctx, 'manage') && !ctx.userId.startsWith('contact:')} …/>`.
- For agency users, add a link "Alert delivery (direct / after review / digest only) is under Delivery." to `/settings/delivery`.

`settings/ai/page.tsx`: `if (!hasFeature(ctx, 'mcp')) notFound();`. Title "AI connections". A card: "Soon you'll be able to connect Claude or ChatGPT to {name}'s competitor data — ask about any change and get answers with the same evidence links. Personal access tokens and connector instructions will appear here." with an info pill "Coming in the next release". No form.

`settings/profile/page.tsx`: replace `if (!isAgencyRole(ctx.role)) notFound();` with this branch. Agency roles keep the form exactly as today. Otherwise `if (!hasFeature(ctx, 'dashboard')) notFound();` and render the title "Services & area — {name}" with `<ServicesAreaSummary profile={p} serviceNames={…from verticalOptions()} />` and "To change these, contact your account manager."

`services-area-summary.tsx`: a `<dl>` with:
- Services → names joined by ", ", or "None yet";
- Keywords;
- Area → "{radiusKm} km around the business · {zips.length} ZIP codes · {towns joined}", or "No service area set yet.";
- Google Business Profile → "Linked" / "Not linked".

Nav (`clientModules`, after Recommendations):

```ts
if (flags.isAgency) {
  add(`${base}/settings/profile`, 'Profile', 'profile');
  add(`${base}/settings/delivery`, 'Delivery', 'delivery');
} else if (flags.dashboard) {
  add(`${base}/settings/profile`, 'Services & area', 'profile');
}
if (flags.alertRules) add(`${base}/settings/alerts`, 'Alert rules', 'alertRules');
if (flags.mcp) add(`${base}/settings/ai`, 'AI connections', 'ai');
```

Icons: `alertRules` = `SlidersHorizontal`, `ai` = `Plug`.

- [ ] **Step 4: Run tests** — the Step 2 command → PASS. `pnpm --filter @cs/web typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): alert rules, AI connections placeholder, read-only services & area"
```

---

### Task 20: E2E, full suite, final review and documentation

**Files:**
- Modify: `apps/web/e2e/seed.ts`, `docs/HANDOVER.md`, `docs/superpowers/plans/2026-09-29-roadmap.md`
- Create: `apps/web/e2e/workspace.spec.ts`
- Possibly: any file the final review asks to fix

- [ ] **Step 1: Seed the 5c-1 E2E data** (`apps/web/e2e/seed.ts`; reuse its `db`, `agencyId`, `clientId` and the Smith HVAC competitor id; read the file first)

Seed it like this:
1. Set `features: ['dashboard', 'alert_rules', 'manage_competitors']` on the `E2E HVAC` client — at insert, or with an update right after.
2. Insert a `tracked_page` (`https://smithhvac.example/pricing`, `pricing`).
3. Insert two `web` captures (`ok`, 2 days and 1 day ago), each with `screenshot`, `text` and `html` evidence rows (`sha256` any 64-hex string, `objectKey` `evidence/<competitorId>/<captureId>/screenshot.webp` etc.).
4. Write the screenshot bytes into the store the web server reads.
   - `playwright.config.ts` sets `EVIDENCE_FS_DIR=test-results/evidence`, which the web app resolves against `apps/worker` (`resolveEvidenceDir`).
   - In the seed: `const store = createStoreFromEnv({ EVIDENCE_FS_DIR: resolveEvidenceDir('test-results/evidence', resolve(import.meta.dirname, '..'))! })`. Import `resolveEvidenceDir` from `../src/server/files` (if that import pulls in `server-only`, copy the 3-line function instead), and `createStoreFromEnv` from `@cs/storage`.
   - Bytes: a 1×1 WebP, `Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')`.
5. Insert a `detected_change` (`web`, `modified`, before/after capture ids, `beforeText: 'AC tune-up $99'`, `afterText: 'AC tune-up $79'`, `status: 'event'`).
6. Insert an event (`price_change`, `channels: ['web']`, `services: { hvac_plumbing: <a real hvac service id from the pack> }`, summary `Smith HVAC cut its AC tune-up to $79 (was $99)`, `facts` with the $99→$79 price change), plus an `event_change` link and an `event_score` (score 86, route `alert`, full factors object as in Task 3's test, `scoredAt` now).
7. Insert a `move` (`price_war`, `active`, confidence 0.7) with a `move_event` link to that event.
8. Insert an ok `google_ads` capture from 20 days ago and one active `ad` first seen then.
9. Set the **sent** brief's existing item `evidenceIds` to `[<after screenshot evidence id>]`.

Add the new table names to the `@cs/db` import.

- [ ] **Step 2: Add the E2E tests** — new file `workspace.spec.ts`, using the same `ADMIN_STATE` storage-state pattern as `workflow.spec.ts` (sign in once in `beforeAll`, or reuse the saved `test-results/admin-state.json` if `workflow.spec.ts` already created it; the 5-links/60 s rate limit applies — HANDOVER §6):

```ts
test('the changes feed opens the evidence viewer with both snapshots and the text diff', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Changes' }).click();
  await page.getByRole('link', { name: /Smith HVAC cut its AC tune-up to \$79/ }).click();
  const shots = page.getByRole('img', { name: /snapshot of https:\/\/smithhvac\.example\/pricing/ });
  await expect(shots).toHaveCount(2);
  await expect.poll(() => shots.first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Text changes' }).click();
  await expect(page.locator('ins', { hasText: '$79' })).toBeVisible();
  await page.getByRole('tab', { name: 'Capture details' }).click();
  await expect(page.getByText(/SHA-256/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Useful' }).click();
  await expect(page.getByText('Thanks — saved.')).toBeVisible();
});

test('a move shows its evidence chain and the competitor profile its timeline', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Moves' }).click();
  await expect(page.getByRole('link', { name: /Price war · Smith HVAC/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Smith HVAC cut its AC tune-up/ })).toBeVisible();
  await page.getByRole('link', { name: 'Competitors' }).click();
  await page.getByRole('link', { name: 'Smith HVAC' }).click();
  await expect(page.getByRole('link', { name: /AC tune-up to \$79/ })).toBeVisible();
});

test('the overview shows the KPIs, pressure and ad chart', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Competitor price moves')).toBeVisible();
  await expect(page.getByLabel(/Competitive pressure \d+ of 100/).first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Active competitor ads per week/ })).toBeVisible();
});

test('alert rules refuse a brief above the alert and reset to the defaults', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Alert rules' }).click();
  await page.getByLabel('Instant alert from score').fill('50');
  await page.getByLabel('Weekly brief from score').fill('60');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('lower than the alert');
  await page.getByLabel('Weekly brief from score').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Alert rules saved.')).toBeVisible();
  await page.getByRole('button', { name: /Use the defaults/ }).click();
  await expect(page.getByText('Back to the default thresholds.')).toBeVisible();
});
```

Then add to `smoke.spec.ts`'s guest test, or a new guest test that opens `OWNER_LINK_FILE`'s link: on the brief page, click "Evidence 1" and expect the evidence page's snapshot `img` and the text "SHA-256". The guest is a `client_viewer` with the client's flags, so "Part of these changes" links are visible (dashboard) but there are no feedback buttons. If the existing guest test asserts the absence of things the new flags now show (e.g. sidebar items), update its expectations to the new, correct state rather than removing the flags.

- [ ] **Step 3: Run E2E** — check free commit memory first (`Get-CimInstance Win32_OperatingSystem | Select-Object FreeVirtualMemory` ≥ ~8 GB; HANDOVER §6). Then run `pnpm --filter @cs/web e2e` (foreground, `timeout: 600000`). Expected: 15/15 (10 existing + 4 new + 1 guest evidence; adjust the count if the guest check was folded into the existing smoke test). Fix any real bug with a regression test first. A one-off webServer "destination stream closed early" is an infra flake: re-run once.

- [ ] **Step 4: Full suite** — `pnpm typecheck` (12/12), then `npx turbo run test --concurrency=1 --continue` with `run_in_background` (~50 min). Wait for the completion notice and start nothing else meanwhile. A package failing with only `connect ETIMEDOUT` is a Neon flake: re-run that package once (HANDOVER §6). Record the per-package counts.

- [ ] **Step 5: Final whole-branch review** — dispatch the final review (most capable model) over `git diff main...phase-5c1-workspace`, with this plan's Review Focus as the checklist and decisions 2, 3, 5–7 and 14 as the rules to verify. Fix every Critical/Important finding with a test first, re-review, and park minors in the roadmap carry-over.

- [ ] **Step 6: Documentation**

`docs/HANDOVER.md`:
- State line: 5c-1 complete on branch `phase-5c1-workspace`; next is merge, then write 5c-2.
- A **Phase 5c-1** paragraph in §3: the tools added; decisions 1–19, one line each; no migration; test counts.
- §1 key-documents table: a 5c-1 row; the 5c-2 row "not written yet" with its scope (this plan's Phase 5 position table).
- §5 item 2 — append the 5c-1 owner-verification steps, deferred to the end of Phase 5:
  - turn on `dashboard`, `alert_rules` and `manage_competitors` for the `CS Dev Verification Client` (Profile → features);
  - open Overview, Changes, Moves and a competitor profile with the vendor data on `cs_dev`. There are no web captures until the bot page exists, so the evidence viewer shows vendor details, not snapshots — the snapshot path is covered by E2E;
  - open an evidence chip from a brief;
  - set and reset alert rules;
  - sign in as a client owner (invite one) and check the client sidebar, the competitor self-service and that "Find competitors" is absent.
- §6 gotchas:
  - decision 3's event visibility rule lives in `workspace/scope.ts` — every new event reader uses `clientEvents()` + `eventJoin`;
  - evidence access is decision 7's rule, and evidence needs no `dashboard` flag;
  - the evidence route never serves `html`/`vendor_json`;
  - `hasFeature` vs the registry's feature check (agency bypass in both);
  - nav items are flag-driven (`NavRoleFlags.dashboard/alertRules/mcp/manageCompetitors`).

`docs/superpowers/plans/2026-09-29-roadmap.md`:
- Phase 5 row: 5c-1 ✅ with the plan link; 5c-2 to be written.
- A "Phase 5c-1 carry-over" section: decision 19's "Not in 5c-1" list, parked review minors and per-task deferred minors.
- Tick ✅: "Evidence chips become links in 5c" (5a carry-over); the client-owner self-service competitor management item (5b-1 carry-over); 5b-2 Minor 2 (pitch snapshot).

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e docs
git commit -m "test(e2e),docs: 5c-1 workspace E2E, handover and roadmap"
```

---

## Self-review notes (writing-plans checklist, done 2026-10-08)

**1. Spec / owner-scope coverage**

| Requirement | Task |
|---|---|
| §5.2 module 1 Overview (brief, alerts, threat per competitor, top moves; suggested Ask questions → Phase 6) | 15, 16, 17 |
| §5.2 module 2 Competitors profile: timeline of changes and moves, tracked pages, collection status (prices/ads/reviews/rankings sections → 5c-2) | 12, 13 |
| §5.2 module 3 Changes feed, filterable (competitor, type, service, score, date); evidence viewer (before/after screenshot, highlighted text diff, metadata, hash) | 3, 4, 5, 8, 9 |
| §5.2 module 8 Moves (status, confidence, evidence chain) | 10, 11 |
| §5.2 module 11 Settings: services & area, competitors & pages, alert rules, AI connections (notification preferences already exist, 5a) | 14, 18, 19 |
| §8.2 `get_competitor_profile`, `get_competitor_timeline` | 12 |
| §8.2 `search_events`, `get_event`, `get_evidence`, `compare_snapshots`, `submit_feedback` | 3, 4, 7 |
| §8.2 `get_ad_activity` (needed by the Overview) | 15 |
| §8.2 `list_moves`, `get_move` | 10 |
| §8.2 `set_alert_rules` (+ `get_alert_rules` to show them) | 18 |
| §8.2 `list_competitors` | already `list_client_competitors` (5b-1) — not duplicated |
| §8.2 "all results include evidence_ids and dashboard deep links" | evidence ids in `EvidenceView`, `CompareView`; URL fields deferred to Phase 6 (MCP builds links from ids and the `/go` map) |
| §3 per-client flags `dashboard`, `manage_competitors`, `alert_rules`, `mcp` | 1, 3–19 (feature on each tool), 14, 18, 19 |
| §4.4 capture status "site blocks monitoring" | 12, 13 |
| §6.3 score factor breakdown visible | 3, 9 |
| 5a carry-over: evidence chips become links | 6 |
| 5b-1 carry-over: client-owner competitor management; modules in the `client` nav group | 14; 1, 8, 11, 19 |
| 5b-2 Minor 2: pitch snapshot after conversion | 15, 17 |
| Owner 2026-10-08: dashboard flag, no screenshot boxes, SVG charts, split | 1/2, 4/9, 16, Phase 5 position |

**2. Placeholder scan.** Every code step has its code. UI page steps list exact copy, layout and the calls they make, in the 5b-2 style. Where a column name needs checking against the schema (`observation.observedAt`, `ChangeDetails` fields, `brief`/`briefItem` literals, `ad` columns), the step names the file to check and what to do on a mismatch.

**3. Type consistency.**
- `EventRow` (Task 3) is reused by `MoveDetail.events` (10) and the timeline mapping (12).
- `DetailLineView` (3) is reused by `CompareView` (4) and `MoveDetail.facts` (10).
- `FEEDBACK_VERDICTS` (7) is used by `EventDetail.myFeedback` and `FeedbackButtons` (9).
- `changesHref`/`ChangesParams` (8) are used by 9, 11 and 13.
- `liveEventCount` (10) is used by 12.
- `adWeeklySeries` (15) is used by both overview tools.
- `foldSeries`/`LineChart` (16) are used by 17.
- `requireTracked` is exported in 12 and used by 12.
- `hasFeature` (1) is used by every page task.
- `NavRoleFlags` fields (1) are used by 8, 11, 14 and 19.

**4. Review Focus → tests.**
1. Cross-tenant / other client / dropped competitor → `events.test.ts` (search, get), `evidence.test.ts` (compare, get_evidence incl. decision 7), `files.test.ts`, `moves.test.ts`, `competitor-profile.test.ts`.
2. Flags → `events.test.ts` (no dashboard), `submit_feedback` (viewer, guest, flagless), `alert-rules.test.ts`, `competitors.test.ts` (Task 14), `evidence.test.ts` (briefs-only viewer *can* open evidence).
3. Retracted / superseded → `events.test.ts`, `evidence.test.ts`, `moves.test.ts`, `competitor-profile.test.ts` (timeline), `overview.test.ts`.
4. Thresholds → `alert-rules.test.ts` (each bad input, reset, no re-route).
5. Missing evidence pieces → `word-diff.test.ts` (too large), `evidence.test.ts` (unchanged fallback, no screenshot at all), `files.test.ts` (html refused, object missing), the viewer's vendor/withdrawn branches (Task 9).
