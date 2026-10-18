# Phase 15 — UX & information architecture (15a design; 15b/15c decisions)

**Status:** owner-approved in brainstorming 2026-10-18 · **Branch:** `phase-15` · **Inputs:** [brief](../../work/phase-15.md), [page inventory](../../research/2026-10-18-phase-15-page-inventory.md), [UX audit](../../research/2026-10-18-phase-15-ux-audit.md) (finding IDs below cite audit §).
Core spec: §3 (Platform → Agency → Client, role table), §5.1–5.2 (agency + client modules), §8.4 (Ask disclosure). This doc adds only new decisions and interfaces.

## 1. Decisions (owner-approved)

| # | Decision |
|---|---|
| D1 | Split: **15a** IA + nav shell + context switcher + page header/breadcrumbs + Briefs & reports index + client-facing white-label leak fixes; **15b** help system + per-page help; **15c** page-level fixes (audit §2–§3 items tagged 15c). Each sub-phase gets its own plan; 15b/15c get a short spec addendum if they add interfaces. |
| D2 | Review output = design doc + HTML mockups (visual companion), owner approves before code. |
| D3 | Switcher is **navigation only**. It never grants access. Other agencies are reached only via Platform → Agencies → "View as agency" (8b support session, unchanged: reason, 60 min, read-only, banner). The switcher lists only the viewer's **own** memberships. |
| D4 | Menu pattern = **HighLevel-style context switcher** at the top of the sidebar: one context at a time (**Platform / Agency / Client**); the sidebar shows only that context's menu. No client panel inside the agency menu any more. |
| D5 | **Sequencing:** 15a is built **first**; `phase-14b` (14a/14b) and 13a rebase onto it and put their new pages into the new groups (§3). |
| D6 | Help = layers 1–4: page description, "?" tooltips on metrics/terms, teaching empty states, **"? Guide" drawer** fed by knowledge-base articles. **Product tour → backlog.** |
| D7 | Help content is platform-authored, white-label (`{agency}`, `{assistant}`, `{client}` placeholders, never "Rival Monday" client-facing), **keyed by page** (`page:<context>.<page>`, e.g. `page:client.reviews`) so a later agency override = same key at agency level. Agency override editor → backlog. |
| D8 | Mobile: keep the left drawer below `lg`; switcher first, then the same groups. No bottom tab bar. |
| D9 | Enterprise: not built. Leave room for custom roles, multi-agency switcher, audit-log page (Agency settings › Security). All three → backlog. |
| D10 | New client page **Briefs & reports** (in 15a). |
| D11 | Dark mode out of scope. |
| D12 | Client-facing "Rival Monday" leaks are fixed in **15a** (not 15c). |
| D13 | Context comes from the **URL**, not session state (§2.1). Recent + pinned clients live in **browser storage** per device; cross-device pins → backlog. |
| D14 | **Ask {assistant} is the first item of the Client view** (above Overview), client view only; no agency/platform Ask. |
| D15 | Agency pages outside `/agency/settings/` move under it with **permanent redirects** from the old paths. |

## 2. 15a — shell

### 2.1 Context resolution
```ts
// apps/web/src/components/shell/nav-context.ts (client-safe, pure)
export type NavContext = 'platform' | 'agency' | 'client';
export function contextOf(pathname: string, fallback: NavContext | null): NavContext | null;
```
- `/platform/**` → `platform`; `/agency/**` → `agency`; `/c/<uuid>/**` → `client`; anything else (`/inbox`, `/settings/notifications`, `/kb/*`) → `fallback` (the last context, from cookie `rm_nav_ctx` = `platform|agency|client:<uuid>`, set by the shell on every contextual page; `SameSite=Lax`, path `/`, 30 days; holds no secrets). No fallback → the viewer's home context.
- Client roles/guests are always `client` (their single client, or the membership in use).

### 2.2 Menu model (replaces the flat `NavItem[]`)
```ts
// apps/web/src/components/shell/nav-items.ts
export interface NavItem { href: string; label: string; icon: IconKey; pill?: string; count?: number }
export interface NavSection { id: string; label: string | null; items: NavItem[]; placement?: 'top' | 'foot' }
export function navFor(context: NavContext, flags: NavRoleFlags, clientId: string | null): NavSection[];
export function settingsNavFor(area: 'agency' | 'client', flags: NavRoleFlags, clientId?: string): NavSection[];
export function activeHref(sections: NavSection[], pathname: string): string | null; // longest match, as today
```
- `NavRoleFlags` keeps every existing flag (visibility rules unchanged) and adds `pendingApprovals?`, `pendingAlerts?`, `pendingModelReviews?`, `pendingThemes?`, `pendingAskReviews?` (counts; badge hidden at 0). Counts come from existing list tools' totals or a cheap count query in `server/nav.ts`; never block render on a failing count (omit the badge).
- `NavGroup`/`group` field and the "Account" group are removed. `manageCompetitors` (unused, BACKLOG 5c-1) is deleted.

### 2.3 Menus (binding labels and order)
**Platform** (operators; Rival Monday branding regardless of the operator's agency): top: Overview · **Customers**: Agencies, Lead pool · **Revenue**: Billing & plans · **Quality**: Model reviews⁽ⁿ⁾, Theme proposals⁽ⁿ⁾, Ask reviews⁽ⁿ⁾ · **Content**: Knowledge · **System**: Costs (owner only). Health hidden until Phase 7.
**Agency**: top: Portfolio · **Work**: Approvals⁽ⁿ⁾, Alert review⁽ⁿ⁾ · **Growth**: Prospects, Leads⁽ⁿ⁾ (same flag as today) · foot: Agency settings.
**Client**: top: **Ask {assistant}** (pill; `ask` flag), Overview · **Insights**: Competitors, Changes, Pricing, Ads, Reviews, Local rankings, Moves (`dashboard`) · **Act**: Recommendations, Briefs & reports · foot: Client settings (agency roles; client roles when any settings tab is visible to them; never guests).
**Support session:** Agency view of the supported agency; switcher shows that agency and "Back to platform" (→ `backToPlatform`, session continues — 8b behaviour); Inbox hidden as today.

### 2.4 Context switcher
`apps/web/src/components/shell/context-switcher.tsx` (client component) at the top of the sidebar and the mobile drawer; replaces `client-switcher.tsx` and `membership-switcher.tsx` (top bar loses both).
- Trigger: icon + current name + sub-line (Platform: "Operator console"; Agency: agency name / "Agency view"; Client: client name / "{city, ST}" or vertical name).
- Popover (shadcn `Popover` + `Command`, added to `@cs/ui`): search box; context links ("Switch to Platform view" for operators; "Switch to Agency view" in Client view for agency roles); **Recent** (last 5 clients opened); **All clients** (pin toggle; pinned first, then name order) with "+ Add client" (→ `/agency/clients/new`) for agency roles. Client roles with >1 membership: the list shows their memberships (existing switch server action, then that membership's home).
- In Platform view the list section is **Your agencies** (own memberships only, D3).
- Storage: `localStorage` keys `rm.switcher.recent.<membershipId>` (string[] max 5) and `rm.switcher.pins.<membershipId>` (string[]); every access in try/catch; stale ids filtered against the server list.
- Data: the shell already loads `list_clients` for agency roles; pass `{id, name, city?, region?, verticalName?, setupStatus?}` (extend `ClientSummary` only with fields `list_clients` already selects or can select cheaply).
- Hidden when the viewer has exactly one context and one client (client owner of one client, guest).
- Keyboard: trigger is a button with `aria-haspopup="dialog"`; `Cmd/Ctrl+K` opens it.

### 2.5 Settings areas
- `apps/web/src/app/(app)/agency/settings/layout.tsx`: `PageHeader` "Agency settings" + left sub-nav from `settingsNavFor('agency')` (top tabs below `md`). Groups/labels: **Agency**: Branding & voice, Team, Playbooks · **Plan**: Billing, Usage & limits · **Growth**: Intake link · **Integrations**: Slack & Teams, AI connections · **Security**: Platform access. Visibility = today's flags per page. `/agency/settings` redirects to the first visible tab.
- `apps/web/src/app/(app)/c/[clientId]/settings/layout.tsx`: "Client settings" + sub-nav: Business profile, Delivery, Alert rules, AI connection, Billing (flags as today). "Business profile" replaces both "Profile" and "Services & area". `/c/<id>/settings` redirects to the first visible tab.

### 2.6 Route moves (D15) — `next.config` `redirects()` with `permanent: true`
| Old | New |
|---|---|
| `/agency/team` | `/agency/settings/team` |
| `/agency/branding` (+ `/logo`) | `/agency/settings/branding` (+ `/logo`) |
| `/agency/webhooks` | `/agency/settings/slack-teams` |
| `/agency/ai` | `/agency/settings/ai` |
| `/agency/usage` | `/agency/settings/usage` |
| `/agency/playbooks` | `/agency/settings/playbooks` |
Move the page folders (actions' `revalidatePath`, `branding-editor.tsx`, `ai-connections.tsx`, `server/ai-connections.ts`, `packages/demo/src/coverage.ts`, E2E specs). Grep for every old path in `apps/`, `packages/` and email templates; emails must emit the new path.

### 2.7 Page header + breadcrumbs
`packages/ui/src/page-header.tsx` (or `apps/web/src/components/page-header.tsx` if it needs app types):
```ts
interface Crumb { label: string; href?: string }
interface PageHeaderProps { title: string; description?: string; breadcrumb?: Crumb[]; actions?: React.ReactNode; helpKey?: string /* 15b; renders nothing in 15a */ }
```
- Renders `<nav aria-label="Breadcrumb">` (last crumb `aria-current="page"`), one `<h1>` (replaces the copy-pasted `text-[26px] font-extrabold` h1 in every page), description, actions right-aligned (stack below `sm`).
- Breadcrumb roots: Client → client name; Agency → "Agency"; Platform → "Platform"; settings → "Agency settings"/"Client settings". Every orphan in audit §4 gets a breadcrumb (brief, alert, report, evidence, competitor profile, agency detail, KB new/edit, approval detail, prospect pages, `/kb/[id]`, `/inbox`); wizards (`/agency/clients/new`, `/c/[id]/setup`, `/onboarding`) also show "Step n of N".
- Title = menu label (Approvals page title "Approvals", not "Approval queue"). Browser tab title `{title} · {displayName}`; platform pages `{title} · Rival Monday`. Root `app/layout.tsx` gets a neutral `title.template`/default (no product name).

### 2.8 Briefs & reports
Route `apps/web/src/app/(app)/c/[clientId]/briefs/page.tsx`, tabs via `?tab=briefs|alerts|reports` (default `briefs`): `list_briefs`, `list_alerts`, `list_trend_reports` (existing tools, existing role filtering; offset paging, 20/page). Row: date (business-friendly format), status chip (agency roles only see drafts), one-line summary, link to the detail. Empty states per tab. Overview brief card gains "Brief archive →". Brief/alert/report detail pages: `PageHeader` with breadcrumb `Client › Briefs & reports › {date}`, "‹ Previous · Next ›" (adjacent by delivery date / created date via the same list tool), and for agency roles a "Open in approvals" link on briefs. Uses `Tabs` added to `@cs/ui` (shadcn), reused by 15c.

### 2.9 Top bar & avatar menu
Top bar: mobile menu button + current context name (below `lg` only), Inbox bell **with count** (unread, "9+"), avatar menu. Avatar menu: name, role · agency name (or client name); Notification settings; Help (hidden until 15b); Switch account (users with >1 membership; existing server action); Sign out (guest: existing guest sign-out).

### 2.10 White-label leak fixes (client-facing)
1. Root `<title>` (2.7). 2. `AuthCard`/`defaultBranding()` on sign-in, check-email, link-expired, link-other-account, no-access, oauth consent: use the agency's branding when the page knows the agency (invite token, `next` path client, consent client), else a **neutral** wordmark-free card (no "Rival Monday"); `/start` exception unchanged. 3. Evidence page "rendered by RivalMondayBot" → "captured by our monitoring service". 4. `components/ai-connections.tsx` MCP CLI server name → slug of the agency `displayName` (fallback `competitor-intel`). 5. `packages/mcp/src/branding.ts` `DEFAULT_PRODUCT_NAME` fallback → a neutral "your agency's assistant" phrasing where client-facing. 6. Intake `buttonHtml()` uses the agency primary colour. Agency-facing and platform pages may still say Rival Monday.

### 2.11 Mobile
`mobile-nav.tsx` renders `ContextSwitcher` + `navFor` sections; closes on route change and on `matchMedia('(min-width: 1024px)')` change (BACKLOG 5c-2 Task 18).

## 3. In-flight placement (for 14a/14b/13a rebases)
14a `/platform/verticals` "Business types"⁽ⁿ⁾ → Platform › Content. 14b `/platform/runbook` → Platform › Content; agency Runbook replaces **Playbooks** at `/agency/settings/runbook` (redirect `/agency/settings/playbooks` and `/agency/playbooks` → it); client Runbook → Client settings tab `/c/<id>/settings/runbook`. 13a Domains → Agency settings › Security (`/agency/settings/domains`, already under settings); Client customisation → Client settings tab. 13a's title template follows 2.7.

## 4. 15b / 15c (scope only; detailed at their kickoff)
- **15b:** `HelpTip` (popover, tap + keyboard), `FieldHint` (`aria-describedby`), `PageGuide` drawer reading KB articles by `helpKey`, teaching empty states, glossary/terminology pass (audit §3 Terminology), seed one guide article per page key. Help index pages `/agency/help`, `/c/<id>/help`.
- **15c:** audit §2/§3 items tagged 15c, incl. `loading.tsx`/`error.tsx`/branded 404 + `Skeleton`, `StatusChip` + enum label maps, date/money/unit formatters (miles), `ConfirmDialog` for billing/irreversible actions, `SaveBar`, mobile list/detail for Changes/Moves, `/platform/billing` tabs, a11y sweep, stale BACKLOG items (AI Badge, Rankings Latest tab) closed.

## 5. Testing (15a)
- Unit: `contextOf` (all prefixes, fallback cookie, client roles); `navFor` per context × role matrix (operator, AA, AM scoped/all, CO, CV, guest, support) — exact section ids, labels, order, badges hidden at 0; `settingsNavFor` per role; switcher storage helpers tolerate throwing `localStorage`.
- Redirects: each old path → new path (308) incl. sub-paths.
- White-label: a test rendering agency/client shell + auth pages for a white-label agency asserts no "Rival Monday" in output (title included).
- Component: `PageHeader` (one h1, breadcrumb a11y), `ContextSwitcher` (search filter, recent/pins order, keyboard open).
- E2E (affected): operator switches Platform → Agency → Client and back; Briefs & reports tabs + paging + prev/next; old URL redirects; mobile drawer shows switcher.

## 6. New backlog (filed at merge)
Product tour for Overview + Portfolio (D6) · Agency help override editor (D7) · Cross-device pinned/recent clients (D13) · Enterprise: custom roles, multi-agency switcher, audit-log page (D9) · Switcher "jump to any agency" via support session (D3).
