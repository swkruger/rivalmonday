# phase-15 — UI/UX review and information architecture (nav, view switcher, help)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15   **Base:** main @ e0f6f627
**Plan/spec:** none yet. Inventory: [research/2026-10-18-phase-15-page-inventory.md](../research/2026-10-18-phase-15-page-inventory.md). **Not in the roadmap** — proposed row: `| 15. UI/UX & information architecture | *to be written* (15a IA + nav shell · 15b help & guides · 15c page fixes) | Designer review of mockups + all pages; platform / agency / client / account nav separation; platform ↔ agency switcher; tooltips, page help, guides | §3, §5 | ~2–3 wks |`

## Status (overwrite)
Brief written; no spec or code.

## Next (overwrite)
Owner answers the open questions; then `superpowers:brainstorming` (mockups first, visual companion).

## Interfaces this branch adds or changes
None yet. Migrations probably none; main at 0076, 14a plans 0077–0078, 14b/13a claim more — take next free at execution.

## Assumes from other branches
- **phase-14b** (executing 14a): adds `/platform/verticals` + "Business types" nav item with a count badge (14a T11); `/agency/playbooks` → redirect to `/agency/runbook` ("Playbooks" → "Runbook"), new `/platform/runbook`, client module "Runbook" at `/c/[id]/settings/runbook` (agency roles only) (14b T8). All edit `nav-items.ts` + `sidebar-nav.tsx` icon map — direct conflict with any nav rework.
- **13a (on main docs, not started):** `/agency/settings/domains` ("Domains", admins) and `/c/[id]/settings/customisation` ("Client customisation", agency roles); new `(app)/c/[clientId]/layout.tsx` title template (page titles = nav labels, so renames change titles); host scope — staff on the platform host, client roles on agency hosts, agency host redirects `/agency/*` to the platform; `app/not-found.tsx`/`error.tsx`.
- **phase-7-planning** (parked): health page refines `/platform/health` only.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope
Owner: act as a professional UI/UX designer — review `docs/brand/` mockups, then every page on `main` (76 routes, see inventory); propose usability improvements for production/enterprise; every page gets help (hints, tooltips, guides); orderly grouping; menu with clear **platform / agency / client / account-settings** separation; a **high-level platform ↔ agency view switcher** (owner's favourite). Also BACKLOG "UI/UX review against Mobbin".
Core spec: §3 (Platform → Agency → Client; role table = who sees which menu), §5.1 (agency modules), §5.2 (11 client modules in order; Settings group), §8.4 (Ask visibility disclosure), §2.2 (renameable modules later).

### 2. Already built — reuse, don't rebuild
- Shell `apps/web/src/components/shell/` (app-shell, sidebar, sidebar-nav, nav-items, top-bar, mobile-nav, client-/membership-switcher, banners); `(app)` vs `(platform)` layouts (8b M5); `server/nav.ts`.
- Roles: `@cs/core` `isAgencyRole`, `hasFeature`, `AccessContext.clientScope`; `@cs/tools` `platformRole` (env `PLATFORM_ADMIN_EMAILS` or `platform_admin` owner/staff/viewer), `requirePlatformOperator`; `server/current-viewer.ts`; viewer kinds user/guest/support (`ReadOnlyProvider`).
- Help-ish: `@cs/ui` `Tooltip` (used once, `rival/signal-pills.tsx`); `StatCard` hint; `ErrorNote`; `OnboardingChecklist`; `SetupBadge`; KB `ArticleSheet`, `/kb/[id]`, `search_knowledge`, `docs/help/*.md` seed (3 articles), `/platform/knowledge` authoring.
- `@cs/ui` (15 shadcn parts incl. tooltip, sheet, dialog, dropdown; no tabs/popover/breadcrumb); tokens `packages/ui/src/{theme.ts,styles.css}`; `docs/brand/brand.md`.

### 3. Binding decisions (never re-open)
- Brand (root CLAUDE.md): Rival Monday wordmark colours; Friday orange pill (#F5A524/#3B2300, renamable); primary #47A8E7 with white text; Inter; dark text on grey panels; content max-width 1560px; light layout (brand.md).
- White-label: nothing client-facing names Rival Monday (help content and tooltips included); `/start` exception until a lead is assigned; 13a D1–D7 (host scope, Client customisation page, title `{page} · {displayName}`).
- Page refusals → 404; web reads are `@cs/tools` tools, writes via `runTool`; sidebar visibility is cosmetic, tools decide (ARCHITECTURE).
- 8b g1–g11: "view as agency" = reasoned, 60-min, read-only, audited support session with banner; no "as the client sees it" preview (g8); owner/staff only. 8a d2 operator definition.
- Inline-SVG charts; Phase 10/11 wizard rules; drawer below `lg` (5c-2 d14).

### 4. Backlog to fold in (verbatim)
- [ ] **UI/UX review against Mobbin** (Mobbin MCP): compare the agency, client-workspace, onboarding and console screens with real-world app patterns and file concrete fixes; scope and details to be provided by the owner at planning — *owner, 2026-10-17*
- [ ] Knowledge base: … browsable Help page (`/agency/help`, `/c/<id>/help`) … — *from 6c "Not in 6c"* (that part)
- [ ] Console UI: name sort `<` vs `localeCompare`; spend delta "up" tone; duplicate "Overview" nav labels; … — *from 8a*
- [ ] Mobile drawer stays open across a resize to `lg` — *from 5c-2 Task 18*
- [ ] Usage page has no empty state for a zero-client agency; `list_alert_queue`'s `.limit(200)` gives no UI hint — *from 5b-2 Task 4, 5b-1 Task 12*
- [ ] Feed brief pill hardcodes `text-[#B45309]` (use `text-accent-text`); AI page `Badge` secondary variant isn't the brand info pill; alert-rules "3 a day" text hard-coded; `NavRoleFlags.manageCompetitors` unused — *from 5c-1*
- [ ] Rankings UI: … cap/daily notes not `aria-describedby`; … — *phase-13b*; `DuplicateHint` not tied to the list via `aria-describedby` — *phase-11-fixes*
- Also BACKLOG § Polish (Competitor profile KPI/empty text, Heatmap table, Costs strip outside 1560px, dark chart theme, Phase 6 UI, Settings screens) = 15c candidates; triage at brainstorming.

### 5. In-flight workstreams
See **Assumes**. `phase-14b`: 9 commits ahead (docs + `packages/verticals` catalogue code), no web changes yet. `phase-7-planning`: docs only (3 files). Overlap is all in `nav-items.ts`/`sidebar-nav.tsx` and page titles.

### 6. Open questions for the owner (by design impact)
1. **Split?** (a) one phase; (b) **15a audit + IA/nav shell + switcher, 15b help system + per-page help, 15c page-level UX fixes**; (c) 15a design doc only, then decide. **Rec: (b)** (15a reframes every page).
2. **Review output?** (a) design doc + HTML mockups in the visual companion, owner approves, then code; (b) straight to code with screenshots; (c) doc only. **Rec: (a)** (mockup-first preference).
3. **Switcher semantics?** (a) navigation only: "Platform | Agency" switch for operators (own agency), other agencies via support session; (b) + "view as client" preview (overrides 8b g8); (c) workspace list of every agency, pick = support session. **Rec: (a)**, (c) later.
4. **Menu structure?** (a) switcher → section nav → client panel; personal items in the avatar menu; agency settings in a "Settings" area; (b) one sidebar + group labels; (c) top tabs per zone. **Rec: (a)**.
5. **Sequencing vs 14a/14b/13a?** (a) 15a after 14b + 13a2 merge, absorbing their nav items; (b) 15a first, they rebase; (c) parallel design, code after them. **Rec: (c)**.
6. **Help system form?** (a) inline hints + "?" tooltips; (b) (a) + per-page guide drawer from KB articles; (c) (b) + product tour; (d) external help centre. **Rec: (b)**.
7. **Help content white-label + editable?** (a) static brand-neutral copy; (b) KB-backed, platform-authored, `{displayName}`/assistant placeholders; (c) (b) + agency overrides. **Rec: (b)**.
8. **Mobile nav?** (a) keep drawer, add switcher + sections inside it; (b) bottom tab bar for client roles; (c) defer. **Rec: (a)**.
9. **Enterprise scope now?** (a) none; (b) multi-agency switcher, custom roles, audit page; (c) design hooks only, (b) to backlog. **Rec: (c)**.
10. **Index pages for briefs/alerts/reports?** (a) a "Briefs & reports" client page; (b) Overview/Inbox only. **Rec: (a)**.
11. **Dark mode?** (a) out of scope; (b) tokens only. **Rec: (a)**.
