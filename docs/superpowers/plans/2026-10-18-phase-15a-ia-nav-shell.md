# Phase 15a — IA, nav shell & context switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`): interfaces and behaviour are binding; implementers write the code. Steps use `- [ ]`.

**Goal:** Replace the mixed sidebar with a HighLevel-style Platform / Agency / Client context switcher and grouped menus, move settings into their own areas, add a shared page header with breadcrumbs, a Briefs & reports page, and fix client-facing "Rival Monday" leaks.
**Architecture:** Context is derived from the URL (`contextOf`); `navFor(context, flags, clientId)` returns labelled sections rendered by `SidebarNav`; one `ContextSwitcher` (Popover + Command) replaces the client and membership switchers. Settings are nested layouts with sub-navs. No migrations.
**Tech stack:** Next.js App Router, React 19, Tailwind, shadcn/ui on `radix-ui`, `cmdk`, Vitest + Testing Library, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-18-phase-15-ux-ia-design.md` (read §1–§3 before any task). Audit: `docs/research/2026-10-18-phase-15-ux-audit.md`.

## Global constraints
- Labels, order and groups exactly as spec §2.3 / §2.5. Ask {assistant} is the first Client item, client view only (D14).
- Visibility rules unchanged: every existing `NavRoleFlags` flag keeps its meaning; sidebar visibility is cosmetic, tools decide (page refusals stay 404).
- Switcher is navigation only and lists only the viewer's own memberships/clients (D3). Support-session rules (8b g1–g11) unchanged.
- No "Rival Monday" in agency- or client-facing output (D12), incl. `<title>`; platform pages may say Rival Monday.
- Web reads via registered `@cs/tools` tools (`callTool`), writes via `runTool`; client components never import `@cs/core`/`@cs/email` (client-safe props only).
- `localStorage` access always in try/catch; render correctly without it.
- Brand tokens only (no new hex), Inter, content max-width 1560px, drawer below `lg`.
- Copy is US English, sentence case; breadcrumb separator `›`.
- Read `docs/gotchas-cross-cutting.md` and `apps/web/CLAUDE.md` / `packages/ui/CLAUDE.md` (if present) before coding. Focused tests: `pnpm --filter <pkg> exec vitest run <pattern>`.

## Decisions
Spec §1 D1–D15. Plan-local: **P1** In the `(app)` route group the fallback context is never `platform` (a stored `platform` value reads as `agency`); `(platform)` pages are always `platform` (the layout passes `zone="platform"`). **P2** Badge counts come from two new web-only read tools (`get_nav_counts`, `get_platform_nav_counts`) — one audited call per shell render each, never `list_*` per queue. **P3** The server wrapper `navFor` in `server/nav.ts` is renamed `navForViewer` to free the name for `nav-items.ts`. **P4** `defaultBranding()` keeps its Rival Monday fallback for emails (13a owns host-scoped email branding); auth pages use a new neutral fallback (Task 10). **P5** `cmdk` is added to `@cs/ui` (shadcn Command).

## File structure
- `packages/ui/src/components/{popover,command,tabs,breadcrumb}.tsx` (+ exports in `index.ts`).
- `apps/web/src/components/shell/`: `nav-context.ts` (new), `nav-items.ts` (rewrite), `context-switcher.tsx` + `switcher-storage.ts` (new), `sidebar-nav.tsx`, `sidebar.tsx`, `top-bar.tsx`, `mobile-nav.tsx`, `app-shell.tsx`, `inbox-bell.tsx`, `avatar-menu.tsx` (new); delete `client-switcher.tsx`, `membership-switcher.tsx`.
- `apps/web/src/components/page-header.tsx` (new), `apps/web/src/components/settings-nav.tsx` (new).
- `apps/web/src/app/(app)/agency/settings/{layout,page}.tsx`, moved folders `team, branding, slack-teams (was webhooks), ai, usage, playbooks`.
- `apps/web/src/app/(app)/c/[clientId]/settings/{layout,page}.tsx`, `apps/web/src/app/(app)/c/[clientId]/briefs/page.tsx`.
- `apps/web/next.config.ts` (redirects), `apps/web/src/server/nav.ts`, `packages/tools/src/tools/nav-counts.ts` (new).

## Dependencies on in-flight work (re-check in Task 0)
- `phase-14b` must **not** have merged nav changes (D5: 15a goes first). If it merged, place its items per spec §3 in Task 2 and keep its redirects.
- 13a not started: `(app)/c/[clientId]/layout.tsx` title template is created here (Task 8); 13a rebases.
- Migrations: none. Main at 0076.

## Review focus
1. Multi-membership user (operator who is also a client owner): avatar "Switch account" works; switcher shows the right context after switching.
2. Account manager scoped to some clients: switcher lists only their clients; badges count only their clients; hidden settings tabs stay hidden.
3. Support session: Agency view of the supported agency, "Back to platform", no Inbox, admin-only settings tabs that 404 in a session are not listed.
4. `localStorage` throwing or holding ids of deleted/out-of-scope clients: no crash, stale ids dropped.
5. Old bookmarks with sub-paths and query strings (`/agency/branding/logo`, `/agency/team?tab=x`) redirect with path + query preserved.

---

### Task 0: Pre-flight
- [ ] `git rebase main`; `git log main --oneline -15`; confirm `phase-14b` nav changes are not on main (else adapt Task 2 per spec §3).
- [ ] Re-check every path in this plan exists (`ls`), grep for new nav/settings routes added since 2026-10-18; fix the plan inline.
- [ ] `pnpm --filter @cs/web exec vitest run shell` green on the rebased base. Commit plan fixes `docs(phase-15a): pre-flight`.

### Task 1: `@cs/ui` primitives — Popover, Command, Tabs, Breadcrumb
**Files:** create `packages/ui/src/components/{popover,command,tabs,breadcrumb}.tsx`; modify `packages/ui/src/index.ts`, `packages/ui/package.json` (`cmdk` ^1).
**Interfaces:** shadcn (new-york) APIs: `Popover, PopoverTrigger, PopoverContent`; `Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator`; `Tabs, TabsList, TabsTrigger, TabsContent`; `Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator`.
**Behaviour:** built on `radix-ui` like `dropdown-menu.tsx` (follow pattern), brand tokens (`bg-surface`, `border-line`, `text-ink`, `bg-primary-soft`). `BreadcrumbSeparator` renders `›` with `aria-hidden`; `BreadcrumbPage` has `aria-current="page"`.
**Tests:** `breadcrumb.test.tsx` — nav has `aria-label="Breadcrumb"`, last item `aria-current`. `tabs.test.tsx` — arrow keys move between triggers, `role="tab"` / `tabpanel`.
**Done when:** `pnpm --filter @cs/ui exec vitest run`, `pnpm --filter @cs/ui exec tsc --noEmit`.

### Task 2: Nav model — `contextOf`, `navFor`, `settingsNavFor`
**Files:** create `apps/web/src/components/shell/nav-context.ts` (+test); rewrite `nav-items.ts` (+`nav-items.test.ts`); modify `apps/web/src/server/nav.ts` (+test), `sidebar-nav.tsx` only to compile (rendering is Task 4).
**Interfaces:**
```ts
export type NavContext = 'platform' | 'agency' | 'client';
export function contextOf(pathname: string, fallback: NavContext | null): NavContext | null;
export const NAV_CTX_COOKIE = 'rm_nav_ctx'; // value: 'platform' | 'agency' | `client:${uuid}`
export function parseNavCookie(v: string | undefined): { context: NavContext; clientId: string | null } | null;
export type IconKey = /* existing icon union + 'briefs' | 'settings' */;
export interface NavItem { href: string; label: string; icon: IconKey; pill?: string; count?: number }
export interface NavSection { id: string; label: string | null; items: NavItem[]; placement?: 'top' | 'foot' }
export interface NavCounts { approvals?: number; alerts?: number; leads?: number; modelReviews?: number; themes?: number; askReviews?: number }
export function navFor(context: NavContext, flags: NavRoleFlags, clientId: string | null, counts?: NavCounts): NavSection[];
export function settingsNavFor(area: 'agency' | 'client', flags: NavRoleFlags, clientId?: string): NavSection[];
export function activeHref(sections: NavSection[], pathname: string): string | null;
```
Section ids: platform `top, customers, revenue, quality, content, system`; agency `top, work, growth, foot`; client `top, insights, act, foot`; agency settings `agency, plan, growth, integrations, security`; client settings `main` (label null).
**Behaviour:**
- Exact labels/order/hrefs per spec §2.3/§2.5 with new routes (`/agency/settings/team` etc., `/c/<id>/briefs`, `/c/<id>/settings`). Ask item `Ask {assistantName||'Friday'}` with `pill` = name, first in client `top`, only when `flags.ask`.
- Client `foot` "Client settings" (`/c/<id>/settings`) only when `settingsNavFor('client', …)` is non-empty and `flags.isUser || flags.isAgency` (never guests). Agency `foot` "Agency settings" (`/agency/settings`) for agency roles. Support session: `settingsNavFor('agency')` omits Billing, Intake link, Platform access (today's `isUser` gates); `backToPlatform` is NOT a nav item any more (switcher owns it, Task 5).
- Health is not listed. Costs only `isPlatformOwner`. `count` omitted when 0/undefined.
- Delete `NavGroup`, `navItemsFor`, `manageCompetitors` (flag + `navFlagsFor` line). `server/nav.ts`: rename `navFor` → `navForViewer(v, context, clientId, …)`; drop `newLeadsCount` only after Task 3 lands (keep it compiling here).
**Tests (TDD):** `contextOf` for `/platform/x`, `/agency`, `/c/<uuid>/reviews`, `/inbox` with each fallback, malformed uuid. `parseNavCookie` garbage → null. `navFor` matrix snapshot-free asserts (section ids, labels in order) for: operator platform; owner vs staff (Costs); agency admin agency; AM scope `all` vs scoped (Leads); client view for agency admin, client owner (billing on/off), client viewer (no `dashboard`), guest (no Ask, no settings), support (no Billing/Intake/Platform access in settings). Badges hidden at 0. `activeHref` longest match (`/c/<id>` vs `/c/<id>/briefs/<x>`).
**Done when:** `pnpm --filter @cs/web exec vitest run nav` and `tsc --noEmit` pass.

### Task 3: Badge counts — `get_nav_counts`, `get_platform_nav_counts`
**Files:** create `packages/tools/src/tools/nav-counts.ts` (+test); register in the tools registry (follow `alert-queue.ts` registration); modify `apps/web/src/server/nav.ts` (`navCounts(ctx, operator)` replaces `newLeadsCount`) and `app-shell.tsx` call site.
**Interfaces:**
```ts
get_nav_counts: input {} → { approvals: number; alerts: number; leads: number } // channels ['web'], permission 'read', agency roles only (else not_found)
get_platform_nav_counts: input {} → { modelReviews: number; themes: number; askReviews: number } // channels ['web'], requirePlatformOperator
export async function navCounts(ctx: AccessContext, opts: { agency: boolean; operator: boolean; leads: boolean }): Promise<NavCounts>; // never throws: a failed read omits that badge
```
**Behaviour:** each count is `count(*)` with **exactly** the WHERE of the list the page shows: approvals = `list_brief_queue` pending rows; alerts = `list_alert_queue` pending rows; leads = `list_leads({status:'verified'})` (only when `opts.leads`); modelReviews = `list_decision_reviews` open; themes = `list_theme_proposals` pending; askReviews = `listReviewableAskThreads` unreviewed. Extract each WHERE into a shared helper in its tool file so list and count can't drift. Respect `clientScope` (AM scoped). Inside a support session agency counts are for the supported agency.
**Tests:** per count — seeded rows in/out of the filter give the same number as the list tool's length; AM scoped to client A doesn't count B; non-operator calling platform counts → `not_found`; `navCounts` returns `{}` when the tool throws.
**Done when:** `pnpm --filter @cs/tools exec vitest run nav-counts`, `pnpm --filter @cs/web exec vitest run server/nav`.

### Task 4: Sidebar renders sections; platform zone branding; context cookie
**Files:** modify `sidebar-nav.tsx` (+test), `sidebar.tsx`, `app-shell.tsx` (+test), `apps/web/src/app/(platform)/layout.tsx`, `(app)/layout.tsx`.
**Interfaces:** `AppShell({ …, zone?: 'platform' })`; `SidebarNav({ flags, counts, zone, fallback }: { flags: NavRoleFlags; counts: NavCounts; zone?: 'platform'; fallback: { context: NavContext; clientId: string | null } | null })`.
**Behaviour:**
- `SidebarNav` (client) computes `context = zone ?? contextOf(pathname, fallback?.context ?? null) ?? (flags.isAgency ? 'agency' : 'client')`; `clientId` from path, else from fallback when context is `client`. Renders sections: label as `SectionLabel`, `role="group"` + `aria-label`, `foot` pinned with `mt-auto border-t`. Removes the client panel and the "Select a client from Portfolio" box.
- On every render with a contextual path, writes cookie `rm_nav_ctx` (`document.cookie`, `path=/; max-age=2592000; samesite=lax`); in `(app)` a stored `platform` is read as `agency` (P1). `(app)/layout.tsx` reads the cookie server-side and passes `fallback`.
- `zone="platform"`: sidebar + mobile drawer use `resolveBranding('Rival Monday', null)` and the default theme (no agency logo/colours/footer name); footer shows "Platform".
**Tests:** sidebar-nav: renders platform sections on `/platform/agencies`; client sections on `/c/<id>/changes`; `/inbox` with client cookie shows that client's sections; Ask item first; foot item last. app-shell: platform zone renders Rival Monday wordmark even for a white-label operator agency.
**Done when:** `pnpm --filter @cs/web exec vitest run shell`.

### Task 5: Context switcher, top bar, avatar menu, inbox count, mobile
**Files:** create `context-switcher.tsx` (+test), `switcher-storage.ts` (+test), `avatar-menu.tsx`; modify `sidebar.tsx`, `top-bar.tsx`, `mobile-nav.tsx` (+test), `inbox-bell.tsx`, `app-shell.tsx`; delete `client-switcher.tsx`, `membership-switcher.tsx` (move `switchMembership` use into avatar menu).
**Interfaces:**
```ts
export interface SwitcherClient { id: string; name: string; sub: string | null; setup: boolean }
export interface SwitcherProps { zone?: 'platform'; flags: NavRoleFlags; agencyName: string; clients: SwitcherClient[]; ownAgencies: { membershipId: string; name: string }[]; currentMembershipId: string | null; supportAgency: { name: string; backHref: string } | null }
export function readIds(key: string): string[]; export function writeIds(key: string, ids: string[], max?: number): void; // try/catch, JSON array of strings only
export function pushRecent(membershipId: string, clientId: string): void; export function togglePin(membershipId: string, clientId: string): string[];
```
**Behaviour:**
- Trigger card at sidebar top (and drawer top): Platform → "Platform" / "Operator console"; Agency → agency name / "Agency view"; Client → client name / `sub`. `aria-haspopup="dialog"`, `Ctrl/Cmd+K` opens it.
- Popover: `CommandInput` "Search clients" (Platform: "Search agencies"); links "Switch to Platform view" (operators, not in Platform), "Switch to Agency view" (agency roles in Client or Platform view); **Recent** (≤5, from storage, filtered to `clients`); **All clients** pinned first then name, pin button `aria-pressed` + `aria-label="Pin {name}"`; "+ Add client" → `/agency/clients/new` (agency roles). Platform view lists **Your agencies** (`ownAgencies`; picking one submits `switchMembership` then `/agency`). Support session: shows the supported agency and "Back to platform" (`backHref`), no client pinning writes.
- Selecting a client → `router.push('/c/<id>')` + `pushRecent`. Keys `rm.switcher.recent.<membershipId>`, `rm.switcher.pins.<membershipId>`.
- Hidden when the viewer is not an operator, not an agency role, and has one membership (client owner/viewer of one client, guest) — sidebar then shows the client name as static text.
- `SwitcherClient.sub` = vertical name (from the client-safe vertical list already used by the shell, else null); `setup` = setup incomplete (existing setup badge source; omit if not cheaply available → false).
- Top bar: drop `ClientSwitcher`/`MembershipSwitcher`; below `lg` show current context name. `InboxBell` shows count badge (`9+` cap, `aria-label="Inbox, N unread"`). `AvatarMenu`: name, `{role label} · {agency or client name}`, Notification settings (`/settings/notifications`), Switch account (one item per other membership, `switchMembership` form), Sign out; Help omitted until 15b; guests keep `GuestSignOutButton`.
- Mobile: drawer renders switcher + sections; closes on link tap (existing) and when `matchMedia('(min-width: 1024px)')` turns true (BACKLOG 5c-2 T18).
**Tests:** storage helpers with throwing `localStorage` and with non-array JSON; switcher filters by search, recent order, pins first, stale ids dropped, keyboard shortcut opens, platform list shows only own agencies; mobile-nav closes on media change; avatar menu lists other memberships only.
**Done when:** `pnpm --filter @cs/web exec vitest run shell`.

### Task 6: Agency settings area + route moves + redirects
**Files:** move `apps/web/src/app/(app)/agency/{team,branding,ai,usage,playbooks}` → `(app)/agency/settings/<same>`, `webhooks` → `settings/slack-teams`; create `(app)/agency/settings/{layout,page}.tsx`, `apps/web/src/components/settings-nav.tsx`; modify `next.config.ts`, every reference found by `grep -rn "/agency/\(team\|branding\|webhooks\|ai\|usage\|playbooks\)" apps packages` (actions' `revalidatePath`, `branding-editor.tsx`, `ai-connections.tsx`, `server/ai-connections.ts`, `packages/demo/src/coverage.ts`, emails, E2E specs).
**Interfaces:** `SettingsNav({ sections }: { sections: NavSection[] })` — left column ≥`md` (`<nav aria-label="Settings">`), horizontal scrollable tabs below `md`, active by `activeHref`.
```ts
// next.config.ts
async redirects() { return [
  { source: '/agency/team/:path*', destination: '/agency/settings/team/:path*', permanent: true },
  { source: '/agency/branding/:path*', destination: '/agency/settings/branding/:path*', permanent: true },
  { source: '/agency/webhooks/:path*', destination: '/agency/settings/slack-teams/:path*', permanent: true },
  { source: '/agency/ai/:path*', destination: '/agency/settings/ai/:path*', permanent: true },
  { source: '/agency/usage/:path*', destination: '/agency/settings/usage/:path*', permanent: true },
  { source: '/agency/playbooks/:path*', destination: '/agency/settings/playbooks/:path*', permanent: true },
]; }
```
**Behaviour:** layout = `PageHeader` "Agency settings" (Task 8 component; if Task 8 not merged yet, a plain h1 and swap in Task 8) + `SettingsNav` + children. `/agency/settings` page redirects to the first visible tab's href. Existing `billing`, `intake`, `platform-access` stay where they are. Pages keep their own guards (404s unchanged). Page h1s become the tab labels ("Branding & voice", "Slack & Teams").
**Tests:** redirects unit test reads `next.config` `redirects()` and asserts each mapping incl. `:path*` (Review focus 5: query preserved is Next default — assert via E2E in Task 11). `settings-nav` renders groups, marks active. Existing page tests updated for new paths.
**Done when:** `pnpm --filter @cs/web exec vitest run settings agency`, `pnpm --filter @cs/demo exec vitest run coverage`, `tsc --noEmit`.

### Task 7: Client settings area
**Files:** create `(app)/c/[clientId]/settings/{layout,page}.tsx`; modify `settings/profile/page.tsx` (title "Business profile"), other settings pages' headers.
**Behaviour:** layout = header "Client settings" + `SettingsNav` from `settingsNavFor('client', flags, clientId)` (flags from the shell's server helper; same guards). `/c/<id>/settings` redirects to the first visible tab, 404 when none (guests). "Business profile" replaces "Profile"/"Services & area" everywhere (nav, page title, `SelfNotice` copy in Reviews that says "Profile page").
**Tests:** layout lists tabs per role (agency admin: Business profile, Delivery, Alert rules, AI connection; client owner with billing: + Billing, no Delivery); index redirect; guest 404.
**Done when:** `pnpm --filter @cs/web exec vitest run settings`.

### Task 8: `PageHeader`, breadcrumbs, titles — agency, platform, settings, account pages
**Files:** create `apps/web/src/components/page-header.tsx` (+test); create `(app)/c/[clientId]/layout.tsx` `generateMetadata`; modify `apps/web/src/app/layout.tsx`, `(app)/layout.tsx`, `(platform)/layout.tsx` metadata; apply to every page under `(app)/agency/**`, `(platform)/platform/**`, `(app)/inbox`, `(app)/settings/notifications`, `(app)/kb/[id]`, `(app)/onboarding`.
**Interfaces:**
```ts
export interface Crumb { label: string; href?: string }
export function PageHeader(props: { title: string; description?: string; breadcrumb?: Crumb[]; actions?: React.ReactNode; helpKey?: string; step?: { n: number; of: number } }): JSX.Element;
```
**Behaviour:** one `<h1>` (`text-[26px] font-extrabold`, the existing style, replaced in every page), description `text-muted-ink`, actions right (stack below `sm`), breadcrumb via `@cs/ui` Breadcrumb, `step` renders "Step n of N" above the title; `helpKey` renders nothing in 15a. Metadata: root `title: { default: 'Dashboard', template: '%s' }` (no product name); `(app)/layout.tsx` and `(app)/c/[clientId]/layout.tsx` `generateMetadata` → template `%s · {displayName}`; `(platform)` → `%s · Rival Monday`; each page `export const metadata = { title: '<menu label>' }` (dynamic detail pages use `generateMetadata`). Titles equal menu labels ("Approvals" not "Approval queue"). Breadcrumbs: Agency pages root `Agency`; platform root `Platform`; settings root `Agency settings`; orphans per spec §2.7 (agency detail, KB new/edit, approval detail, prospect pages, `/kb/[id]`, `/inbox`); wizards `/agency/clients/new` and `/onboarding` get `step`.
**Tests:** page-header (single h1, breadcrumb a11y, step text); a test that renders each touched page module's `metadata.title` equals its nav label (table-driven from `navFor`).
**Done when:** `pnpm --filter @cs/web exec vitest run page-header agency platform`, `tsc --noEmit`.

### Task 9: `PageHeader` on client pages + Briefs & reports
**Files:** apply `PageHeader` to every page under `(app)/c/[clientId]/**`; create `(app)/c/[clientId]/briefs/page.tsx` (+test); modify brief/alert/report/evidence detail pages, competitor profile, `setup` (step), Overview brief card (`views/brief-view.tsx` or the Overview card that lists briefs).
**Behaviour:**
- Client breadcrumb root = client name (`/c/<id>`), then group ("Insights"/"Act") as plain text, then page. Titles drop the `— {client}` suffix.
- `/c/<id>/briefs?tab=briefs|alerts|reports&page=n`: `Tabs` (URL-driven links, not client state), `list_briefs` / `list_alerts` / `list_trend_reports` with offset paging 20/page ("Newer" / "Older" links). Row: date (`Oct 13, 2026` format, local helper until 15c), status chip (agency roles only; client roles only ever see sent/approved), summary (1 line, truncate), link to detail. Empty state per tab: "No weekly briefs yet. The first one arrives the Monday after setup is complete." / "No alerts yet. Alerts are sent when a competitor makes an urgent change." / "No quarterly reports yet."
- Detail pages: `PageHeader` breadcrumb `Client › Briefs & reports › {date}`, real h1, "‹ Previous" / "Next ›" (neighbour by the same list order; fetch with `limit` around the current item), agency roles see "Open in approvals" on briefs (`/agency/approvals/<briefId>`). Evidence and competitor profile get breadcrumbs back to Changes / Competitors.
- Overview brief card: "Brief archive →" link to `/c/<id>/briefs`.
**Tests:** briefs page — tab switch by URL, paging links, client owner never sees draft status chip, empty states; prev/next at first/last item hide the missing link.
**Done when:** `pnpm --filter @cs/web exec vitest run "c/\[clientId\]"`, `tsc --noEmit`.

### Task 10: Client-facing white-label leaks
**Files:** `apps/web/src/components/auth-card.tsx`, auth pages (`sign-in`, `sign-in/check-email`, `link-expired`, `link-other-account`, `no-access`, `oauth/consent`), `apps/web/src/server/branding.ts`, `(app)/c/[clientId]/evidence/[evidenceId]/page.tsx`, `apps/web/src/components/ai-connections.tsx`, `packages/mcp/src/branding.ts`, intake `buttonHtml()` (grep), + tests.
**Interfaces:** `export async function authBranding(service: Db, env: WebEnv, hint: { clientId?: string; agencyId?: string } | null): Promise<Branding | null>` — agency branding when the hint resolves (or `env.defaultAgencyId`), else `null`; `AuthCard` with `branding: null` renders no wordmark/logo (neutral card). `mcpServerName(displayName: string | null): string` → kebab slug of `displayName`, fallback `competitor-intel`.
**Behaviour:** hints: invite/accept token → agency; `next=/c/<id>/…` → that client's agency (service read, branding only); consent → the OAuth client's agency. `/sign-up` and `/start` unchanged (agency-facing / white-label exception). Evidence copy "captured by our monitoring service". MCP fallback product name in client-facing disclosure → "your agency's assistant" when no agency name. Intake button colour = agency primary (`branding.primary`), fallback to the token default only when unset.
**Tests:** a white-label leak test: render the client shell (`AppShell` client owner of a white-label agency), sign-in with a client `next`, check-email, link-expired, evidence page, AI connections block → output contains no "Rival Monday"/"RivalMonday"/"rival-monday", and `<title>` metadata has none. `mcpServerName` cases. Intake snippet uses agency colour.
**Done when:** `pnpm --filter @cs/web exec vitest run leak auth evidence ai-connections`, `pnpm --filter @cs/mcp exec vitest run branding`.

### Task 11: E2E + affected rules
**Files:** create `apps/web/e2e/navigation.spec.ts` (tag `@navigation`); modify `apps/web/scripts/e2e-affected-rules.ts` (shell/nav/page-header/settings → `@navigation` + existing tags that cover moved pages), existing specs that use moved paths or old nav labels (`signup`, `support`, `workflow`, others found by running them).
**Behaviour (scenarios):** operator: Platform → switcher → "Switch to Agency view" → pick client from search → client sidebar shows Ask first and "Client settings" foot → back to Agency; old `/agency/branding` and `/agency/team?x=1` land on new paths with query; Briefs & reports tabs + Next page + detail prev/next; client owner sees no switcher and no Platform; mobile viewport (390px) drawer shows switcher and closes after navigation; support session shows "Back to platform".
**Done when:** `pnpm --filter @cs/web e2e:affected` green (owner-approved full E2E only at `/rm-merge`).

### Task 12: Final review + docs
- [ ] Whole-branch review on the most capable model (`pnpm test:affected --base main`, `pnpm --filter @cs/web e2e:affected --base main`), one fix wave.
- [ ] Update `docs/work/phase-15.md` (Status, Interfaces, owner verification steps: switch contexts as operator/AA/AM/CO; bookmarks redirect; Briefs & reports; white-label sign-in for a client of a white-label agency; copy sign-off of new labels/empty states). Commit.
