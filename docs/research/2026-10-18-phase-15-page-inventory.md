# Phase 15 — page inventory (main @ e0f6f627)

All 76 `page.tsx` routes under `apps/web/src/app`. Roles: **Op** platform operator (`PLATFORM_ADMIN_EMAILS` or `platform_admin` owner/staff/viewer), **Own** platform owner, **AA** agency admin, **AM** account manager, **CO/CV** client owner/viewer, **G** guest (magic-link contact), **Pub** signed out. Nav: **Sb-A** sidebar "Agency" section, **Sb-C** sidebar client panel (headed by the open client; agency roles only when a `/c/<id>` URL is open; client roles get it unlabelled), **Sb-Acc** sidebar "Account" section (bottom), **Top** top bar. Source of truth: `apps/web/src/components/shell/nav-items.ts`.

## Public / auth (no shell)
| Route | Who | What it does | Nav |
|---|---|---|---|
| `/` | signed in | Redirects to home (`/agency` or `/c/<id>`) | — |
| `/sign-in`, `/sign-in/check-email` | Pub | Magic link / Google sign-in, "check your email" | not in nav |
| `/sign-up`, `/sign-up/problem` | Pub | Agency self-sign-up (Turnstile); problem page | not in nav |
| `/join/[token]` | Pub | Agency invite link landing | not in nav |
| `/link-expired`, `/link-other-account`, `/no-access` | Pub/any | Signed-link and no-membership dead ends | not in nav |
| `/oauth/consent` | user | MCP OAuth 2.1 consent | not in nav |
| `/start`, `/start/[slug]`, `/start/verify`, `/start/v/[leadId]` | Pub | Client intake (platform pool / agency link), verify, preview snapshot | not in nav |
| `/u/[token]/confirm`, `/u/[token]/done` | Pub | Unsubscribe from setup tips | not in nav |

## Platform (`(platform)` layout, operator's own shell)
| Route | Who | What it does | Nav |
|---|---|---|---|
| `/platform` | Op | Console overview: growth, activity, funnel | Sb-Acc "Overview" |
| `/platform/agencies`, `/[id]` | Op | Agency list; detail, billing, "View as agency" | Sb-Acc "Agencies"; detail not in nav |
| `/platform/billing` | Op | Plans, codes, invite links, Connect fee | Sb-Acc "Billing" |
| `/platform/leads` | Op | Platform lead pool, assign to agency | Sb-Acc "Leads" |
| `/platform/reviews` | Op | Model decision-review queue | Sb-Acc "Model reviews" |
| `/platform/themes` | Op | Review-theme proposal queue | Sb-Acc "Theme proposals" |
| `/platform/ask`, `/[threadId]` | Op | Review Ask threads | Sb-Acc "Ask review"; thread not in nav |
| `/platform/knowledge`, `/new`, `/[id]` | Op | Knowledge base authoring/import | Sb-Acc "Knowledge"; children not in nav |
| `/platform/health` | Op | Health placeholder | Sb-Acc "Health" |
| `/platform/costs` | Own | Hosting/vendor costs, balances | Sb-Acc "Costs" (owner only) |

## Agency (`(app)` layout)
| Route | Who | What it does | Nav |
|---|---|---|---|
| `/agency` | AA, AM | Portfolio: clients, pressure, checklist | Sb-A "Portfolio" |
| `/agency/clients/new` | AA, AM | Add client (lookup → setup) | not in nav (Portfolio button) |
| `/agency/approvals`, `/[briefId]` | AA, AM | Brief approval queue; edit one brief | Sb-A "Approvals"; detail not in nav |
| `/agency/alerts` | AA, AM | Alert review queue | Sb-A "Alert review" |
| `/agency/prospects`, `/new`, `/[clientId]` | AA, AM | Prospect snapshots, create, view | Sb-A "Prospects"; children not in nav |
| `/agency/leads` | AA, AM(all clients) | Intake leads, accept/decline | Sb-A "Leads" (+count) |
| `/agency/usage` | AA, AM | Spend vs caps, quotas | Sb-A "Usage & limits" |
| `/agency/playbooks` | AA, AM | Edit vertical playbooks | Sb-A "Playbooks" |
| `/agency/team` | AA, AM | Members, invites, client contacts | Sb-Acc "Team" |
| `/agency/ai` | AA, AM | Agency MCP connections / PATs | Sb-Acc "AI connections" |
| `/agency/branding` | AA | Logo, colours, assistant name | Sb-Acc "Branding" |
| `/agency/webhooks` | AA | Slack & Teams webhooks | Sb-Acc "Slack & Teams" |
| `/agency/settings/billing` | AA (not support) | Platform subscription, seats | Sb-Acc "Billing" |
| `/agency/settings/intake` | AA (not support) | Intake link + embed snippet | Sb-Acc "Intake link" |
| `/agency/settings/platform-access` | AA (not support) | Support-session log, notify toggle | Sb-Acc "Platform access" |

## Client workspace `/c/[clientId]` (`(app)` layout)
| Route | Who | What it does | Nav |
|---|---|---|---|
| `/c/[id]` | all client-scoped | Overview: brief, KPIs, moves, starting point | Sb-C "Overview" |
| `/competitors`, `/[competitorId]` | `dashboard` | Rival list/tiers; competitor profile | Sb-C "Competitors"; profile not in nav |
| `/changes` | `dashboard` | Scored events feed + evidence viewer | Sb-C "Changes" |
| `/pricing` · `/ads` · `/reviews` · `/rankings` · `/moves` | `dashboard` | Price matrix · ad archive · reputation · geo-grid · moves | Sb-C each |
| `/recommendations` | all | Recommendation board | Sb-C "Recommendations" |
| `/ask`, `/[threadId]` | users with `ask` | Ask Friday chat; thread | Sb-C "Ask Friday" pill; thread not in nav |
| `/briefs/[briefId]` · `/alerts/[alertId]` · `/reports/[reportId]` · `/evidence/[evidenceId]` | client-scoped | Single brief / alert / quarterly report / evidence | not in nav (no list pages) |
| `/pitch-snapshot` | AA, AM | Pre-client landscape | not in nav (Overview link) |
| `/setup` | AA, AM, CO | Resumable setup wizard | not in nav (setup badge/Portfolio) |
| `/settings/profile` | agency; CO/CV with `dashboard` | Services, area, keywords | Sb-C "Profile" (agency) / "Services & area" (client) |
| `/settings/delivery` | AA, AM | Brief recipients, auto-send | Sb-C "Delivery" |
| `/settings/alerts` | `alert_rules` | Alert thresholds | Sb-C "Alert rules" |
| `/settings/ai` | users with `mcp` | Client MCP connection | Sb-C "AI connections" |
| `/settings/billing` | CO (billing on) | Client subscription via Connect | Sb-C "Billing" (client roles only) |

## Account / other (`(app)` layout)
| Route | Who | What it does | Nav |
|---|---|---|---|
| `/inbox` | users (not support) | Notifications list | Sb-Acc "Inbox" + Top bell |
| `/settings/notifications` | users | Email/alert preferences | Sb-Acc "Notifications" |
| `/kb/[id]` | signed in | Knowledge article page | not in nav (citation chips) |
| `/onboarding` | AA | Agency setup wizard (4 steps) | not in nav (first-session redirect, checklist) |
| `/paused` | suspended agency non-admins | Service paused notice | not in nav, renders without shell |

Route handlers (not pages): `/l/<token>` guest links, `/go/<target>/<id>`, `/files/*`, `/support/end|exit`, `/onboarding/start`, `/mcp`, `/api/*`.

## Current nav components
- **Shell:** `components/shell/app-shell.tsx` (server) used by both `(app)/layout.tsx` and `(platform)/layout.tsx`; route groups, not path checks (stale-layout reason, 8b M5). Banners above content: `SupportBanner` (fixed, 8b), `GuestBanner`, `ClientBillingBanner`, `BillingBanner`; `CostWarningStrip` on platform pages (outside the 1560px wrapper).
- **Sidebar:** `sidebar.tsx` (232px, logo/wordmark, displayName footer) → `sidebar-nav.tsx` (client, `usePathname`). Agency roles: "Agency" section → bordered client panel (initials + name; "Select a client from Portfolio" when none) → "Account" at the bottom. Client roles/guests: client items + account items, no labels. Items come from `navItemsFor` (`nav-items.ts`), flags from `server/nav.ts` `navFlagsFor`.
- **Top bar:** `top-bar.tsx` (68px): mobile menu button, `ClientSwitcher` (agency roles; select → `/c/<id>`) or client name, `InboxBell`, `MembershipSwitcher` (users with >1 membership: "Agency · Client" labels, server action), avatar menu (email + sign out) / guest sign-out.
- **Mobile:** `mobile-nav.tsx` — same `SidebarNav` in a left `Sheet` below `lg`.
- **View switching today:** no platform ↔ agency switcher. Operators see platform items appended to the "Account" section of their own agency's sidebar. "View as agency" = 8b support session from `/platform/agencies/[id]` (reason, 60 min, read-only, banner + "Back to platform" nav item). Membership switcher covers multi-membership users only. No breadcrumbs, no in-page tabs component shared across pages (Rankings has its own Latest/Trend/Compare tabs).
- **Help today:** `@cs/ui` `Tooltip` used only in `rival/signal-pills.tsx`; `StatCard` `hint` line; `ErrorNote` (`form-error.tsx`); `OnboardingChecklist` (`components/agency/onboarding-checklist.tsx`); `SetupBadge`; KB `ArticleSheet` + `/kb/[id]` (Ask citations only); repo help seed `docs/help/*.md` (3 articles). No help page, guide drawer or tour.
- **@cs/ui components:** badge, button, card, dialog, dropdown-menu, friday-badge, input, label, select, separator, sheet, switch, table, tooltip, wordmark. No tabs, popover, breadcrumb, command, accordion, alert, skeleton.

## Mockups (`docs/brand/mockups/`, Phase 5 reference)
- `01-client-overview.html` — client Overview: greeting + Monday brief, KPI cards, moves, Ask Friday panel; client sidebar (Overview…Moves, Ask Friday, Settings); top bar "overview for: {client} ▾" + week picker.
- `02-changes-evidence.html` — Changes feed with filters (Alerts + brief / All / Archived) and evidence side panel.
- `03-reviews-reputation.html` — Reviews & reputation: rating/velocity KPIs, theme heatmap, sample reviews.
- `04-approval-queue.html` — Agency approval queue; agency sidebar: Agency (Portfolio, Approval queue 7, Clients, Prospecting, Playbooks) / Settings (Branding & voice, Automation, Users, Usage & limits) + "Signed in as … · Account manager".
- `05-white-label-settings.html` — Branding & voice with live client preview ("Ask Scout"), "Your clients never see our name".

## IA problems spotted (facts)
- Platform console items (10) sit inside the agency "Account" section, below agency settings; "Overview" appears twice (platform + client) — BACKLOG 8a.
- "Account" mixes personal (Inbox, Notifications), agency settings (Team, Branding, Billing, Intake, Slack & Teams, Platform access, AI connections) and platform pages; mockup 04 split these into "Settings" and had no platform section.
- Agency operational work (Usage & limits, Playbooks) sits with daily queues in "Agency"; mockup put Usage under Settings.
- Two "AI connections" (agency `/agency/ai`, client `/settings/ai`) and two "Billing" (agency, client; plus platform) labels.
- Client settings (Profile, Delivery, Alert rules, AI connections) are mixed into the client module list, no "Settings" sub-group; mockup had one "Settings" entry.
- Brief, alert, report and evidence pages have no list/index page; reached only from Overview, Inbox, email links.
- Orphans by design (detail/new pages) have no breadcrumb or consistent back link.
- `/agency/clients/new`, `/c/[id]/setup` and `/onboarding` are wizards reachable only from buttons/redirects.
- Wordmark/displayName footer shows the operator's own agency branding on `/platform/**`.
