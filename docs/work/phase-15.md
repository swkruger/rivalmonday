# phase-15 — UI/UX review and information architecture (nav, view switcher, help)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15   **Base:** main @ e0f6f627
**Spec:** [2026-10-18-phase-15-ux-ia-design.md](../superpowers/specs/2026-10-18-phase-15-ux-ia-design.md) (15a design + 15b/15c decisions). Audit: [ux-audit](../research/2026-10-18-phase-15-ux-audit.md). Inventory: [research/2026-10-18-phase-15-page-inventory.md](../research/2026-10-18-phase-15-page-inventory.md). **Not in the roadmap** — proposed row: `| 15. UI/UX & information architecture | *to be written* (15a IA + nav shell · 15b help & guides · 15c page fixes) | Designer review of mockups + all pages; platform / agency / client / account nav separation; platform ↔ agency switcher; tooltips, page help, guides | §3, §5 | ~2–3 wks |`

## Status (overwrite)
2026-10-18: brainstorm done (visual companion; mockups in `.superpowers/brainstorm/`, not committed). 15a spec owner-approved; 15a plan written (13 tasks, T0–T12), awaiting owner approval. No code.

## Next (overwrite)
Owner approves the 15a plan ([plan](../superpowers/plans/2026-10-18-phase-15a-ia-nav-shell.md)) → `superpowers:subagent-driven-development` from Task 0 (Opus, high effort). 15b/15c kickoff after 15a.

## Interfaces this branch adds or changes
Planned (15a, spec §2): `NavContext`/`contextOf`, `NavSection`/`navFor`/`settingsNavFor` (flat `NavItem.group` removed), `ContextSwitcher` (replaces client + membership switchers), `PageHeader`, `/c/[id]/briefs`, settings layouts, agency pages moved under `/agency/settings/*` with 308 redirects, `@cs/ui` Popover/Command/Tabs. No migrations; main at 0076, 14a plans 0077–0078, 14b/13a claim more — take next free at execution.

## Assumes from other branches
- **phase-14b** (executing 14a): adds `/platform/verticals` + "Business types" nav item with a count badge (14a T11); `/agency/playbooks` → redirect to `/agency/runbook` ("Playbooks" → "Runbook"), new `/platform/runbook`, client module "Runbook" at `/c/[id]/settings/runbook` (agency roles only) (14b T8). All edit `nav-items.ts` + `sidebar-nav.tsx` icon map — direct conflict with any nav rework.
- **13a (on main docs, not started):** `/agency/settings/domains` ("Domains", admins) and `/c/[id]/settings/customisation` ("Client customisation", agency roles); new `(app)/c/[clientId]/layout.tsx` title template (page titles = nav labels, so renames change titles); host scope — staff on the platform host, client roles on agency hosts, agency host redirects `/agency/*` to the platform; `app/not-found.tsx`/`error.tsx`.
- **phase-7-planning** (parked): health page refines `/platform/health` only.

## Decisions (owner-approved)
D1–D15 in the spec §1: split 15a/15b/15c; mockups first; switcher = navigation only, own memberships; HighLevel-style context switcher (Platform/Agency/Client); **15a built first, 14a/14b and 13a rebase onto it**; help layers 1–4 (KB guide drawer), tour → backlog; help keyed by page, agency overrides later; mobile drawer; enterprise → backlog; Briefs & reports page; no dark mode; white-label leaks in 15a; URL-derived context + browser-stored recents/pins; Ask {assistant} first in Client view only; agency pages under `/agency/settings/*`.

## New backlog (target → item)
Unscheduled → product tour (Overview, Portfolio); agency help override editor; cross-device pins/recents; enterprise custom roles, multi-agency switcher, audit-log page; switcher "jump to any agency" via support session.

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

### 6. Open questions
All answered 2026-10-18 — see Decisions / spec §1.
