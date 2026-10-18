# phase-15 — UI/UX review and information architecture (nav, view switcher, help)

**Kind:** implementation (15a)   **Worktree:** ../CompetitorSpy-wt/phase-15   **Base:** main @ e0f6f627
**Spec:** [2026-10-18-phase-15-ux-ia-design.md](../superpowers/specs/2026-10-18-phase-15-ux-ia-design.md) (15a design + 15b/15c decisions). Audit: [ux-audit](../research/2026-10-18-phase-15-ux-audit.md). Inventory: [research/2026-10-18-phase-15-page-inventory.md](../research/2026-10-18-phase-15-page-inventory.md). **Not in the roadmap** — proposed row: `| 15. UI/UX & information architecture | *to be written* (15a IA + nav shell · 15b help & guides · 15c page fixes) | Designer review of mockups + all pages; platform / agency / client / account nav separation; platform ↔ agency switcher; tooltips, page help, guides | §3, §5 | ~2–3 wks |`

## Status (overwrite)
2026-10-19: **15a built** (29 commits, subagent-driven, Opus high). Final whole-branch review + one fix wave clean. `pnpm test:affected --base main` exit 0 (16/16); full E2E 104/104. Not merged. Owner verification + `/rm-merge` go-ahead pending. 15b/15c not started. Sequencing D5 stands: 14a/14b and 13a rebase onto 15a.

## Next (overwrite)
Owner verifies 15a (steps below) → `/rm-merge phase-15` (merge folds: ARCHITECTURE old `/agency/*` paths → `/agency/settings/*`; 6b spec disclosure fallback note; roadmap row 15). Then tell phase-14b to rebase (place pages per spec §3). Then `/rm-kickoff` 15b (help) and 15c (page fixes).

## Interfaces this branch adds or changes
Built (15a): `@cs/ui` Popover, Command (cmdk 1.1.1), Tabs, TabsLinkList/TabsLink, Breadcrumb. Shell: `nav-context.ts` (`contextOf`, cookie `rm_nav_ctx`, `parseNavCookie`), `use-nav-context.ts`, `nav-items.ts` (`NavSection`, `navFor(context, flags, clientId, counts)`, `settingsNavFor`, `NavCounts`; `navItemsFor`/`NavGroup`/`manageCompetitors`/`newLeads` removed), `context-switcher.tsx` + `switcher-storage.ts` (localStorage `rm.switcher.recent|pins.<membershipId>`), `avatar-menu.tsx`; `client-switcher`/`membership-switcher` deleted. `server/nav.ts` `navForViewer`, `navCounts`. Tools `get_nav_counts`, `get_platform_nav_counts` (web-only, shared WHERE helpers with their lists). `PageHeader` (`components/page-header.tsx`), `SettingsNav`, `client-crumbs.ts`, `server/client-settings-nav.ts`. Routes: `/agency/{team,branding,webhooks→slack-teams,ai,usage,playbooks}` → `/agency/settings/*` (308); `/agency/settings` + `/c/<id>/settings` index redirects; `/c/<id>/briefs`. Titles `{page} · {displayName}` / `· Rival Monday` on platform; root neutral. `authBranding()` + neutral `AuthCard`; `mcpServerName()`; `displayNameFor()` (mcp). E2E `navigation.spec.ts` (@navigation). No migrations.

## Assumes from other branches
- **phase-14b** (executing 14a): adds `/platform/verticals` + "Business types" nav item with a count badge (14a T11); `/agency/playbooks` → redirect to `/agency/runbook` ("Playbooks" → "Runbook"), new `/platform/runbook`, client module "Runbook" at `/c/[id]/settings/runbook` (agency roles only) (14b T8). All edit `nav-items.ts` + `sidebar-nav.tsx` icon map — direct conflict with any nav rework.
- **13a (on main docs, not started):** `/agency/settings/domains` ("Domains", admins) and `/c/[id]/settings/customisation` ("Client customisation", agency roles); new `(app)/c/[clientId]/layout.tsx` title template (page titles = nav labels, so renames change titles); host scope — staff on the platform host, client roles on agency hosts, agency host redirects `/agency/*` to the platform; `app/not-found.tsx`/`error.tsx`.
- **phase-7-planning** (parked): health page refines `/platform/health` only.

## Decisions (owner-approved)
D1–D15 in the spec §1 (split 15a/b/c; HighLevel context switcher; 15a first; help layers 1–4 via KB, tour → backlog; Ask first in client view only; agency pages under `/agency/settings/*`; etc.).
Controller rulings during 15a (owner may overturn): Ask reviews badge dropped (no reviewed state); badge counts uncapped; settings layouts carry no h1; `/agency/clients/new` no step count, setup uses wizard "Step n of 5"; client Overview h1 = "Overview" (client name in description); Ask h1 plain text (pill in sidebar only); Previous = older, Next = newer; Briefs & reports tabs are links with Tabs visuals; one extra audited `get_client_profile` read per client page (breadcrumb); Ask disclosure without displayName → "reviewed by our support team"; guests have no Client settings sidebar path (pages keep guards); auth-branding reveals public branding for a known client id.

## New backlog (target → item)
Unscheduled → product tour (Overview, Portfolio); agency help override editor; cross-device pins/recents; enterprise custom roles, multi-agency switcher, audit-log page; switcher "jump to any agency" via support session; Ask review to-do state + badge.
13a → client-visible "Rival Monday" fallbacks in MCP `serverInfo`/tool descriptions, `.well-known/oauth-protected-resource` `resource_name`, Ask system prompt + KB `{{product}}`.
15c → ~50 `border-line`/`bg-line` uses (`bg-line` draws nothing); mixed date formats in BriefView/AlertView; intake button white text on light agency colours; owner-Billing rule duplicated (client-settings-nav + app-shell); command input h-10 in h-9 wrapper; briefs tab list clip if overflowing.
15b → pin button nested in `role=option` (a11y); support viewers have no AI connection tab (no active tab on direct visit).
Soon → nav-count tools audited every render (consider `skip-web`); switcher lists prospect clients (`list_clients` no status filter); make `apps/web` page changes trigger `@cs/demo#test`; hydration-path test for sidebar cookie.

## Owner verification steps
On `cs_dev` (no migrations):
1. Operator: sidebar switcher Platform ↔ Agency ↔ client (search, pin, Recent, Ctrl/Cmd+K); Platform view shows Rival Monday branding and only your agencies; Health hidden.
2. Agency admin / account manager (scoped): menus Portfolio · Work · Growth · Agency settings; badges on Approvals/Alert review/Leads; AM sees only their clients.
3. Client view: Ask Friday first, Insights / Act groups, Briefs & reports (tabs, Older/Newer, Previous/Next on details, "Brief archive →" on Overview), Client settings tabs ("Business profile").
4. Client owner: no switcher, no Platform; avatar menu (name, role, Notification settings, Switch account, Sign out); bell shows a count.
5. Old bookmarks `/agency/team`, `/agency/branding/logo`, `/agency/webhooks` land on `/agency/settings/*`.
6. White-label: client of a white-label agency signs in via a client link → agency branding, tab titles without "Rival Monday"; evidence page says "captured by our monitoring service".
7. Phone (390px): drawer shows switcher; long client list scrolls; drawer closes after navigation.
8. Copy sign-off: group labels (Customers, Revenue, Quality, Content, System, Work, Growth, Insights, Act), "Lead pool", "Billing & plans", "Ask reviews", "Business profile", Briefs & reports empty states, Ask disclosure "…reviewed by our support team…", and the controller rulings listed under Decisions.

## Brief
Kickoff brief (scope, reuse list, binding decisions, backlog folded in, in-flight overlaps) is superseded by the spec + plan; full text in git history (`e53ec597`). Inventory: [page inventory](../research/2026-10-18-phase-15-page-inventory.md); audit: [ux-audit](../research/2026-10-18-phase-15-ux-audit.md) — 15b/15c take their items from audit §2–§3.
