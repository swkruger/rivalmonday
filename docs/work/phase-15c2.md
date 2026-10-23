# phase-15c2 — page fixes + small features (15c spec §4)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c2   **Base:** main @ bf4ce990
**Plan/spec:** [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §2 (C1-C11), §4; plan *to be written*. Inputs: [UX audit](../research/2026-10-18-phase-15-ux-audit.md), pre-split brief `git show 9ddfae3c:docs/work/phase-15c.md` §1 (per-area list).

## Status (overwrite)
Kicked off 2026-10-23; brief below. No code.

## Next (overwrite)
Owner answers Brief §6 → brainstorming → mockups (C10: sheet, tabs, intake preview, page diff) → lean plan(s).

## Interfaces this branch adds or changes
TBD. Spec §4 tools: `delete_ask_thread`, `delete_webhook`, `test_webhook`, `resend_invitation`, `compare_captures`; `list_platform_agencies.query`, `list_alert_queue.clientId`; `components/list-detail.tsx`; route `/agency/settings/intake/preview` (help key `page:agency.settings.intake.preview`). Migration only if Q3 picks soft delete (next free **0085**).

## Assumes from other branches
- **phase-15b3b** (unstarted): renames `/platform/themes`→`/platform/topics`, `theme-queue.tsx`, `components/charts/theme-heatmap.tsx`, `?theme=` on `c/[clientId]/reviews/page.tsx`, help key `page:platform.themes`, `get_theme_benchmark`, `search_reviews.themeId`. Our tasks on these files go last (C7); second to merge rebases.
- **phase-15c3** (unstarted): reuses our `resendInvitation` service fn in `packages/tools/src/access/team.ts` (spec §5.2) and our ConfirmDialog adoption on `/platform/agencies/<id>`; the agency "coming soon" line is 15c-3's. We don't touch `billingAccess`/`agencyServiceable`.
- **13a** (unbuilt): `client-profile-form.tsx`, `/start*` (focus/privacy/CTA fixes), `start/landing.tsx` `IntakeLanding` (intake preview), error pages. Second to merge rebases.
- **phase-7-planning** (docs only, 1 file): no code overlap. Its 7b UI (cap notices, usage page) builds on our chips/labels; 7b2 touches billing pages after 15c-3.

## Decisions (owner-approved)
None new yet; C1-C11 + 15c-1 rulings R1 etc. bind (Brief §3).

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope
Roadmap row 15 (15c-2 *to be planned*); 15c spec §4, binding C3/C4/C7/C8/C9/C10; core §5.1-5.2 (dashboard pages). Build:
- **Page adoption** (§4, brief §1 by area): apply 15c-1 pieces (`StatusChip` + `lib/labels`, `lib/format/*`, `ConfirmDialog`, `SaveBar`, `PageSkeleton` in in-page `Suspense`) page by page, per the pre-split brief §1 list (platform, agency, client, account/public) — e.g. `/platform/billing` + Changes real tabs, agency detail billing confirms, Portfolio ISO week, Inbox tz, `/start` focus.
- **a11y:** labels, `aria-describedby`, `/start` focus, no tips in `CardTitle`.
- **Mobile list/detail (C9):** `ListDetail({ list, detail, selectedId, closeHref })`, `Sheet` below `lg`, URL keeps id (Changes, Moves).
- **Small features (C4, §4):** Ask delete; webhook delete + test (5 s, signed `test` payload); invite resend (≤ 3/24 h); sign-up email resend (60 s cooldown, ≤ 5/h); agencies search (ILIKE ≥ 2 chars, cursor); leads/reviews cursor paging (25, `prev-next.tsx`); alert queue `clientId` + cap notice; intake preview; `compare_captures` (whole-page diff tab + evidence section, masked blocks counted, no writes on read, `get_evidence` access).
- **Order:** theme-file pages last (C7). Agency "coming soon" → 15c-3.

### 2. Already built — reuse, don't rebuild
- `@cs/ui` (`packages/ui/src/components/`): `skeleton`, `status-chip` (`CHIP_COLOURS`, `ChipTone`), `confirm-dialog`, `save-bar`, `sheet`, `tabs-link`, `dialog`, `table`, `tooltip`.
- `apps/web/src/`: `lib/labels.ts` (`labelFor`, `CLIENT_AUDIENCE_MAPS`), `lib/agency-only-terms.ts`, `lib/format/{date,money,distance}.ts` + `no-old-helpers.test.ts`, `server/viewer-tz.ts` `viewerTimeZone()` + `components/shell/tz-cookie.tsx` (`rm_tz`), `components/{page-header,page-skeleton,radius-select,prev-next,settings-nav,form-error,stat-card,error-panel}.tsx`, `lib/report-error.ts`.
- Help: `components/help/*`, `help/copy/*.ts`, gates `help/coverage.test.ts`, `terminology.test.ts`, `white-label-leak.test.tsx`; guides `docs/help/pages/`.
- Tools (`packages/tools/src/tools/`): **`delete_my_ask_thread` already exists** (`ask-threads.ts`, hard delete, own threads; web `c/[clientId]/ask/actions.ts` `deleteAskThreadAction`); `settings.ts` `invite_member`/`revoke_invitation`/`add_webhook`/`set_webhook_active`; `agency-settings-reads.ts` `list_webhooks` (page `agency/settings/slack-teams`); `access/team.ts`, `access/invitations.ts`; `platform-console.ts` `list_platform_agencies` (cursor via `pageOf`/`pageResult`); `alert-queue.ts` `list_alert_queue` (200 cap); `leads.ts` `list_pool_leads`; `list_decision_reviews`; `evidence.ts` `compare_snapshots`.
- Diff: `engine/src/web/{blocks,align,volatile,diff-stage}.ts`, `tools/src/workspace/word-diff.ts`; viewer `c/[clientId]/changes/viewer.tsx`.
- `app/sign-up/*`, `app/sign-in/check-email/page.tsx`; `app/start/landing.tsx` `IntakeLanding`, `loadBranding` (`engine/src/delivery/outbox.ts`); SSRF guard `net/guard.ts` (for `test_webhook`).

### 3. Binding decisions
- Root CLAUDE.md: brand tokens, 1560px; SVG charts + dataviz; reads = tools, writes via `runTool`; refusals → 404; miles/km; tz rule; **no route `loading.tsx`**; every `PageHeader` page needs help key + guides, no agency/operator help to client roles; owner signs off copy; SSRF guard for user URLs.
- 15c spec C1-C11 (esp. C4 feature list, C7 theme pages last, C8 date/zone style, C9 sheet, C10 mockups + one copy sign-off doc `docs/archive/phase-15c2-copy-signoff.md`). 15c-1 rulings: service area uses rank-radius select (R1); zone labels `shortGeneric`; REVIEW_STATUS = catalogue only, add maps per page.
- 15a `PageHeader` rules; 15b-3 D3 no theme redirects; owner: calm chips, mockup first.

### 4. Backlog to fold in (verbatim)
- [ ] **15c-2** page adoption of the 15c audit fixes (15c-1 built the shared pieces; spec §4): adopt `StatusChip`/`lib/labels`/`lib/format/*`/`ConfirmDialog`/`SaveBar`/`PageSkeleton` page by page, mobile list/detail for Changes/Moves, `/platform/billing` tabs, a11y sweep; mixed date formats in BriefView/AlertView; intake button white text on light agency colours; briefs tab list clips if it overflows — *phase-15a*. From 15b-2: non-(H) audit items (Ask visibility line, alert-rules band bar), Moves "N signals" → "N changes", Report page empty state when no data, billing guide's "Not available" status, "Google place id" label for clients, tips inside `CardTitle` lengthen heading accessible names — *phase-15b2*
- [ ] **15c-2** from 15c-1: `onboarding/steps/plan.tsx` calls `formatDate` without `now`; ISO dates remain in `billing-panel.tsx`, `plan-editor.tsx`, `cost-items-table.tsx`, changes viewer `formatFullUtc`; `formatWeekOf` has no caller yet; cents-unit billing keeps `$299.00` vs revenue card `$598`; `formatRelative` falls back to UTC beyond 30 days on client pages; leftover local date formatters / `.slice(0,10)` ISO dates: `agency/settings/team/page.tsx:29` (server zone, no `timeZone`), `competitors/[competitorId]/page.tsx:36`, `rankings/page.tsx:35,223`, `agency-table.tsx:44`, `ai-connections.tsx:28`, `report-view.tsx:6`, `prospect-landscape.tsx:48`, `pitch-snapshot/page.tsx:40`; `/platform/health` (7a) keeps a local hex `StatusChip` and status labels (move to `@cs/ui` `StatusChip` + `lib/labels`); `KM_PER_MILE` duplicated in `packages/tools/src/intake/preview.ts:10` (move to `@cs/core`); `TzCookie` first-visit refresh can wipe an in-progress form until pages read the zone; sync test chip CSS ↔ `CHIP_COLOURS`; cwd-relative guard/hex-scan tests → `__dirname`; REVIEW_STATUS is the catalogue status only, add a map per page as other statuses appear — *phase-15c1*
- [ ] **15c-2** investigate: E2E web server logs "destination stream closed early" around `workspace.spec.ts`; compare with a main run — *phase-15c1*
- Related Polish (cited, see Q5): Ask UI (6b), knowledge (6c), webhooks kinds (5a T18), `PrefSwitch` (5a T17), toggles ignore `runTool` (5b-2), dismiss dialog (5b-1), Usage + alert cap (5b), feed hex (5c-1), heatmap table (5c-2), costs (8c).

### 5. In-flight workstreams
`phase-7-planning`: docs only (+99 lines, its work file), no overlap. Future branches: see **Assumes**. Next free migration 0085.

### 6. Open questions for the owner
1. **Split?** ~70 pages + 9 features won't fit one ≤ 80 KB plan. (a) one branch, two plans by area: **2a** platform + agency + account/public (agencies search, leads/reviews paging, billing tabs, alert filter, webhooks, invite + sign-up resend, intake preview), **2b** client pages (ListDetail, `compare_captures`, Ask delete); (b) **2a** features/tools only, **2b** page adoption sweep; (c) one plan, trimmed. **Rec: (a)** — features land with their pages; each part gets its own review + copy sign-off section.
2. **vs 15b-3b** (C7 stands: theme files last). (a) parallel; theme tasks (`/platform/themes`, heatmap, Reviews `?theme=`) are the last tasks of 2a/2b, second merger rebases; (b) run 15b-3b first (small, mechanical), then 15c-2 builds on renamed files; (c) hand theme-page polish to 15b-3b. **Rec: (a)**, switching to (b) if 15b-3b merges before our theme tasks start.
3. **Ask delete:** `delete_my_ask_thread` (hard delete, own threads) already exists. (a) keep it; add `ConfirmDialog` + inline error (6b polish), no migration, no new tool; (b) spec's `delete_ask_thread` soft delete + `ask_thread.deleted_at` (0085), retire old; (c) soft delete under the existing name. **Rec: (a).**
4. **Sweep depth:** (a) audit/backlog lists only; (b) every page, plus grep gates (no solid `Badge` status, no `.slice(0,10)`/`toLocale*` outside `lib/format`, no raw enum renders); (c) (a) now, gates later. **Rec: (b)** — gates keep it fixed.
5. **Related Polish (§4):** (a) fold items on pages we touch (Ask 6b, webhooks/`PrefSwitch`/toggle errors 5a/5b, Usage + alert cap, feed hex, heatmap table, dismiss dialog); (b) spec list only; (c) also knowledge 6c + costs 8c. **Rec: (a)**; 6c/8c stay Polish.
6. **`TzCookie` refresh:** (a) no refresh; first render uses UTC (labelled), cookie applies next navigation; (b) refresh only when no form is dirty; (c) client-side date formatting. **Rec: (a).**
