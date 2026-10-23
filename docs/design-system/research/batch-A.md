# Batch A: application shell, navigation and page headers

Source: Mobbin web screens, viewed as ~768 px-wide low-res previews of desktop captures (~1440 px). All sizes are scaled estimates, and all colours are estimates (not sampled).

## Inventory

- **A01: Stripe · Home / "Today" + overview** [Mobbin](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3). image_url: https://mobbin.com/api/mcp/short/HhLqv2tk
  - Desktop 16:10, light. SaaS dashboard, analytics/reporting.
  - Nav: no full-width top bar. The sidebar (~225 px est.) starts at the top with the account name and logo, and the search field sits in a thin header strip over the content only. Sidebar groups: top-level (Home, Balances, Transactions, Customers, Product catalogue), then a "Products" section label with collapsible parents (Payments, Billing, Reporting, More). Developers is pinned at the bottom. Active item: brand-purple icon and label, no fill.
  - Components: H1 "Today" (~26 px semibold), a thin divider rule below it, a metric block with a line chart, a balance side column split by hairlines, a second H1-sized section header "Your overview" with a filter-chip row (Last 7 days / compared to / Daily) and right-aligned Add/Edit buttons, and a 3-column widget row.
  - Visuals: sidebar ~#FFFFFF with a very faint right border (~#EBEEF1, est.). Canvas ~#FFFFFF (est.). In this state the widgets have **no card chrome**: sections sit on the page, separated by spacing and 1 px rules. Radius 4–6 px on buttons. No shadows. Body 13–14 px, labels ~12 px grey ~#687385 (est.). Icons are 16 px line icons.
  - Distinctive: the section header repeats at H1 size, and charts sit directly on the canvas. Accent purple (~#635BFF, est.) appears only on links and the active nav item.
- **A02: Stripe · Overview in edit/customise mode** [Mobbin](https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888). image_url: https://mobbin.com/api/mcp/short/YnJz91x9
  - Same shell as A01, light.
  - In edit mode every widget becomes a **white card** (radius ~8 px, 1 px border plus a soft ~1–2 px shadow) on a faint grey canvas (~#F6F8FA, est.), each with a close X. Status pills ("Failed") are red-tinted (~#FDE7E9 bg, est.).
  - Takeaway: Stripe uses cards as an *editing affordance* and shows a flatter layout in normal view (compare A01). This is a strong precedent for "cards only when the block is a movable/independent object".
- **A03: Attio · Companies record list** [Mobbin](https://mobbin.com/screens/df2bcdc2-5f03-430f-ae92-013056040463). image_url: https://mobbin.com/api/mcp/short/7Ksd54aH
  - Desktop, light. Data-heavy enterprise, productivity.
  - Nav: no app top bar. Sidebar ~200 px with a workspace switcher (logo + "ASMobbin ▾") and a collapse icon at the top, then "Quick actions ⌘K" with a search icon, a flat list (Notifications, Tasks, Notes, Emails, Reports, Automations), and small grey section labels with chevrons (Favorites, Records, Lists). The bottom holds Invite / Help with a progress chip and a trial pill with an "Add billing" button. Active item: light grey fill ~#EEEFF1 (est.), radius ~6 px, label unchanged.
  - Components: a page title row of only ~14 px semibold ("Companies") with an info icon. The next row has a view selector dropdown on the left and "View settings" and "Import / Export" ghost buttons on the right. Below is a full-bleed table with hairline grid lines, colourful tag chips and a "count" footer.
  - Visuals: sidebar ~#FBFBFB (est.) vs content #FFFFFF, split by a 1 px border ~#E8E8EA (est.). No cards and no shadows except on the dropdown popover. Radius 4–6 px. Very dense: ~32 px rows, 12–13 px type.
  - Distinctive: the title is tiny and the table *is* the page. Colour comes only from data chips and favicons.
- **A04: Linear · Workspace home (Ask Linear)** [Mobbin](https://mobbin.com/screens/91bb1f70-f2a9-4c6b-b153-522c8b6a8d62). image_url: https://mobbin.com/api/mcp/short/H3QW1Xmp
  - Desktop, light. Productivity, project management, AI chat.
  - Nav: no top bar. The sidebar (~240 px) is the *shaded* region (~#F4F4F5, est.); the content is an **inset white panel** (~#FCFCFC, est.) with a ~1 px border and ~8 px radius, floating ~8 px from the window edges. The sidebar has the workspace switcher with search and compose icons at the top. Groups use 11 px grey labels with ▾ toggles ("Workspace", "Your teams", "Try"), and team items nest one level with indentation. A badge count shows on Inbox.
  - Components: an empty-state centred "Welcome to Linear" with an AI prompt box (white, border, ~8 px radius). A "What's new" toast card sits bottom-left, and "Ask Linear" is a bottom-right text link.
  - Visuals: almost monochrome, with icons at 14–16 px stroke. Type is 13 px nav, ~16 px headings. Shadow is only a hint on the inset panel.
  - Distinctive: an "inset canvas" shell (shaded frame, raised content sheet). It fits the "sidebar slightly shaded" hypothesis exactly.
- **A05: GitLab · Group overview** [Mobbin](https://mobbin.com/screens/1d6c395b-abf0-4559-9703-2fb4dda09fc7). image_url: https://mobbin.com/api/mcp/short/fLcMrf5q
  - Desktop, light. Admin, project management.
  - Nav: sidebar ~210 px, grey (~#F8F8FA, est.) with a right border. The top has logo, sidebar toggle, "+" and avatar, then 3 counter tabs (issues/MRs/todos) and a "Search or go to…" field. The context label "Group" is followed by the current group with a left blue bar marker (active = 3 px left accent + grey fill). Grouped collapsible items: Pinned, Manage, Plan, Code, Build, Deploy, Operate, Settings. The top breadcrumb strip ("ASMobbin2") spans the content only.
  - Components: an info alert banner (light blue, full width, dismiss X). The page header has an avatar tile, an H1 (~24 px bold), a "Free" pill, and right-side actions (bell dropdown, secondary "New subgroup", primary blue "New project", kebab). Underline tabs follow (Subgroups and projects / Shared projects / Inactive), then a search/filter toolbar and two empty-state cards with borders.
  - Visuals: radius ~4 px everywhere, 1 px borders ~#DCDCDE (est.), no shadows. The primary button is blue ~#1F75CB (est.).
  - Distinctive: the canonical header order is breadcrumb → title + actions → tabs → toolbar.
- **A06: Klaviyo · Service › Customer Hub overview** [Mobbin](https://mobbin.com/screens/991ede6b-2ade-4d51-ab4b-d3e22db908c9). image_url: https://mobbin.com/api/mcp/short/TjfhLCak
  - Desktop, light. SaaS dashboard, marketing admin.
  - Nav: a thin top bar (~40 px) with centred search ⌘K and right-side bell, "Account plan" and "Support" buttons and an AI sparkle. Primary sidebar ~170 px, grey ~#F5F5F5 (est.), with expandable groups (Website, Social, Service▾ with nested Overview/Customer Hub/Customer Agent/Helpdesk) and section labels ("Advanced", "Grow with Klaviyo"). It is followed by a **second-level sidebar** (~130 px, white) for Customer Hub (Overview/Design/Extensions/Settings) with active = bold blue text. Active primary item: grey fill.
  - Components: a promo card with illustration, a "Complete set up" checklist card (border, radius ~8 px, soft shadow), a time-period filter row, and an "Overview" card.
  - Visuals: canvas ~#F7F7F7 (est.) with white cards using radius ~8–10 px, a faint shadow and borders. More card-heavy than the others.
  - Limitations: an onboarding state with heavy promo content.
- **A07: Klaviyo · Settings › Other › Consent pages** [Mobbin](https://mobbin.com/screens/db86a7a2-52ce-49b0-9727-ed7c6cc6ee6a). image_url: https://mobbin.com/api/mcp/short/3C3oUnK3
  - Desktop, light. Admin/settings.
  - Nav: the same shell as A06. The page header is just "Settings" (~15 px semibold) followed by **a 15-item horizontal underline tab row** (General … Other; active = black underline). Below it, a third-level left sub-nav (Consent pages active with grey pill fill) sits beside the content.
  - Components: a list of 5 stacked cards (icon + title + description + "Edit Page" button + kebab). Each card has a ~10 px radius, border and soft shadow.
  - Visuals: these cards would work equally well as rows in a single bordered list. This is card overuse.
  - Distinctive: three levels of navigation (sidebar → tabs → sub-nav). The 15 tabs overflow conceptually, which is a weakness.
- **A08: Neon · Branch › Tables (data editor)** [Mobbin](https://mobbin.com/screens/0584d09c-5eea-4830-93e4-94958abc318d). image_url: https://mobbin.com/api/mcp/short/8V6EwGzO
  - Desktop, light. Data-heavy enterprise, admin.
  - Nav: a full-width top bar (~40 px) with a logo and **slash-separated context switchers** (account ▾ "Free" pill / project ▾), plus "All OK" status, help, an "Upgrade" dark button and an avatar. Sidebar ~170 px, white, with small uppercase section labels ("PROJECT", "BRANCH", "APP BACKEND"). The branch selector is a bordered dropdown inside the sidebar. Active item: grey fill ~#EFEFEF (est.), radius ~4 px. "Collapse menu" sits at the bottom. A secondary list column (~135 px, "Tables" H2 + database/schema selects + table list) follows.
  - Components: a dense toolbar (Filters / Columns / "+ Add record" dark button / pagination) and a monospace data grid.
  - Visuals: white everywhere, separated by 1 px borders ~#E5E5E5 (est.), radius 4 px, no shadow, no cards.
  - Distinctive: the top bar carries the context hierarchy (org/project/branch), which is relevant to our Platform/Agency/Client switcher.
- **A09: Vercel · Storage › Neon integration data editor** [Mobbin](https://mobbin.com/screens/e4808e29-6df0-41a1-ae5a-7ada58ffaab7). image_url: https://mobbin.com/api/mcp/short/NMDTjAty
  - Desktop, light. Admin, data-heavy.
  - Nav: the sidebar (~165 px, white) holds the team switcher ("samleemobbi… Pro Trial ⇕") and a "Find… F" search, then a "‹ Storage" back-link header (a drill-in sidebar that replaces the main nav), plain items, and uppercase grey section labels ("BROWSER", "RESOURCES"). Active = bold black text, no fill. A thin top strip over the content holds "All Projects ⇕" on the left, a centred breadcrumb "Integrations / Neon / neon-chestnut-notebook" and a kebab on the right.
  - Components: a query select, "Review changes (1)" dark button, "Insert Row", a grid with a changed row highlighted in green ~#EAF7EC (est.), and a footer with pagination. An "Action Required" warning card sits in the sidebar with a red icon.
  - Visuals: monochrome, 1 px borders ~#EAEAEA (est.), radius ~6 px, no shadows. Type 13 px.
  - Distinctive: the drill-in sidebar pattern; settings areas swap the nav instead of adding a second column.
- **A10: Supabase · Project home (collapsed icon rail)** [Mobbin](https://mobbin.com/screens/10cd243a-b924-48d5-b74b-dedf9c70c286). image_url: https://mobbin.com/api/mcp/short/u1m0dHRN
  - Desktop, light. SaaS dashboard, admin.
  - Nav: a **collapsed icon-only rail** (~44 px) with ~16 px icons grouped by small gaps/dividers. Active icon = grey square fill. Top bar ~40 px: logo, then breadcrumb-style switchers "ASMobbin FREE ⇕ / ASMobbin Project ⇕ / main PRODUCTION ⇕", a green "Connect" button, then Feedback, Search ⌘K and icon buttons with an avatar on the right.
  - Components: section headings (~16 px semibold, e.g. "Advisor found no issues", "Reports") with drag handles and right-aligned small buttons ("Ask Assistant", "+ Add block"). Bordered panels (radius ~6 px) sit under each heading, plus an empty state and a small SQL result table.
  - Visuals: canvas #FFFFFF (est.), panels bordered ~#E6E6E6 (est.) with no shadow. Headings sit *outside* the panel, on the canvas.
  - Distinctive: "heading on canvas + bordered panel below" is a calm alternative to titled cards. The environment pill ("PRODUCTION", amber outline) is a good model for status chips.
- **A11: LangSmith (LangChain) · Tracing project › Runs** [Mobbin](https://mobbin.com/screens/3fe9126c-5520-4950-a3f9-bbe5d35809e3). image_url: https://mobbin.com/api/mcp/short/aDsws07A
  - Desktop, light. Data-heavy, analytics.
  - Nav: sidebar ~120 px (scaled), white, with the org selector ("LangSmith ▾", "Application: My First App ▾"), Search ⌘K, and items grouped by spacing only (no labels). Active = light blue fill with blue text and a count badge. The content header has a breadcrumb row (icon "My First App / Tracing / ASMobbin", ~12 px grey) and then a **combined row**: project title (~16 px semibold) + ID chip + inline tabs (Runs [underlined], Threads, Evaluators, Automations, Insights) + right-aligned settings, "Retention 14d", Dashboard, bell and a blue "+ New".
  - Components: a filter toolbar (Default View ▾, "Last 30 days", Traces/Runs toggle, search), a column-picker popover with checkboxes, and a table with status icons and a red latency pill.
  - Visuals: white, hairlines, radius ~4–6 px, no cards. The popover has a shadow.
  - Distinctive: title and tabs on one line save ~48 px of vertical space. Good for dense pages.
- **A12: Jira · Space › List view** [Mobbin](https://mobbin.com/screens/8835a262-f48c-49cf-b664-ed5aaa0c6e15). image_url: https://mobbin.com/api/mcp/short/Z2GikNET
  - Desktop, light. Project management.
  - Nav: a full-width top bar (~32 px) with app switcher grid, logo, sidebar toggle, a wide search, a blue "+ Create", and right icons (bell 9+, help, settings, avatar). Sidebar ~120 px (scaled), white, with "Starred / Recent / Recommended" small grey labels. Active = blue-tinted fill + blue text with a left blue bar.
  - Page header: breadcrumb "Spaces" (~11 px), title row (space icon + H1 ~18 px bold + people icon + kebab) with right-side share/automation/fullscreen icon buttons, then **icon + label tabs** (Summary, List [blue underline], Board, Calendar, Timeline, Pages, Forms, "+"). A "Views" mega-menu popover is open.
  - Visuals: white, 1 px borders, radius ~3–4 px, coloured status lozenges (green "APPROVED", blue "IN DESIGN"). No cards.
  - Limitations: the menu is open and covers the table.
- **A13: Airtable · Home** [Mobbin](https://mobbin.com/screens/48f967f7-f759-4e7d-bf9c-48b55833263f). image_url: https://mobbin.com/api/mcp/short/0FccqyeF
  - Desktop, light. Productivity.
  - Nav: full-width top bar (~40 px, white, bottom border) with hamburger, logo, centred search ⌘K, and Help, bell and avatar on the right. Sidebar ~190 px, white with a right border. Items: Home (active = grey fill ~#EFEFEF, est.), Starred ▾ (nested base), Shared, Workspaces + ›. The bottom holds Templates, Marketplace, Import, then a full-width blue "+ Create" button.
  - Components: H1 "Home" (~22 px semibold). An upsell banner (light blue-grey bg ~#EEF3F9 (est.), no border, radius ~8 px, dark "Upgrade" button), a "Opened anytime ▾" filter with list/grid toggle, small date-group labels ("Today", "Past 7 days"), and tile cards (white, 1 px border, radius ~6 px, very faint shadow, coloured 32 px icon squares).
  - Visuals: canvas very light grey ~#F9FAFB (est.) vs white sidebar. Cards are justified here because they are clickable objects.
- **A14: Fibery · Workspace menu / switcher** [Mobbin](https://mobbin.com/screens/e470f040-82a2-44ec-8954-c70e56ce695b). image_url: https://mobbin.com/api/mcp/short/jX4RNfvq
  - Desktop, light. Productivity.
  - Nav: the sidebar (~145 px, scaled) is shaded ~#F3F3F2 (est.) and the content is an inset white panel (Linear-like). The workspace name button ("SLMobbin ▾") opens a **combined account + workspace menu**: user block (avatar, name, email), "Switch Workspace ›" submenu (current ✓, "Create Workspace"), Invite Users, Workspace Map, Templates, Activity Log, Trash, Appearance ›, Settings, Log out. The menu has dividers and 16 px icons, and the popover has a ~6 px radius and a soft shadow.
  - Components on the page: welcome header, "My Work" panel with tabs, a "Search or create" panel, and "Getting Started" and chart panels in bordered boxes. The sidebar bottom has "11 days left in trial · Add billing".
  - Distinctive: the workspace switcher and account menu are merged into one top-left control. That is a counterpoint to our separate avatar menu.
- **A15: Customer.io · Workspace settings › Subscription center** [Mobbin](https://mobbin.com/screens/c302f565-2254-4fca-828a-447bb035faad). image_url: https://mobbin.com/api/mcp/short/Cnbk5jc8
  - Desktop, light. Admin/settings.
  - Nav: a yellow account-warning bar at the very top, then a top bar with "‹ Exit Settings" and breadcrumb (Workspace settings / Subscription center), centred search ⌘K, and Need help?, bell and gear on the right. The settings-mode sidebar (~110 px, scaled) is minimal (Account Settings, Personal Settings, workspace chip). It shows a red-tinted "Upgrade" button at the bottom.
  - Page header: H1 (~16 px semibold) + one-line grey description, right-side "Preview ↗" secondary and disabled "Enable" primary buttons, then underline tabs (Subscriptions / Settings [active, dark underline]).
  - Components: an info callout (light blue bg ~#E6F4FA (est.) with left icon and "Review" link), stacked section panels with 1 px borders, ~4 px radius and no shadow (Global unsubscribe with green "Live" dot, Branding + Edit, Localization with a table inside), and a dark toast.
  - Distinctive: settings mode exits the main nav entirely ("Exit Settings"), which is a clear mental model.
- **A16: Mistral AI (La Plateforme) · Command palette** [Mobbin](https://mobbin.com/screens/8450c1c7-7c10-40a3-9af3-c9c234ac4b53). image_url: https://mobbin.com/api/mcp/short/QVOCBmQX
  - Desktop, light palette over a dimmed and blurred app.
  - Palette: centred, ~45% width, top-anchored about 15% down, white, radius ~8 px, soft shadow. The input ("Search for pages and actions…") has no icon. Groups use small grey labels (Agents, Batches, Settings, Navigation), and items are 16 px icon + label ("+ New Agent", "Go to Home", …). The highlighted row has a grey fill ~#F0F0F0 (est.).
  - Shell behind it: a grey sidebar with section labels and an "Upgrade" pill, and a dark top bar.
  - Compared: Juicebox / Vapi / Magnific palettes (not inventoried) add a footer key-hint bar ("↵ to select, ↑↓ to navigate, Tab to jump sections") and an "Ask AI" Tab handoff (Magnific). That is relevant for Friday.

## Pattern observations (this batch)

**Shell layout**
- Variant 1, *sidebar-first, no full-width top bar* (sidebar reaches the top, with workspace switcher at the top-left): A01/A02 Stripe, A03 Attio, A04 Linear, A11 LangSmith, A14 Fibery, A09 Vercel (thin content-only strip). **6 apps.**
- Variant 2, *full-width top bar + sidebar below*: A05 GitLab (partial), A06/A07 Klaviyo, A08 Neon, A10 Supabase, A12 Jira, A13 Airtable, A15 Customer.io. **7 apps.**
- Tools with multi-level context (org/project/branch: Neon, Supabase, Vercel's "All Projects") put context switchers in the top bar as slash breadcrumbs. Pure workspace apps put them top-left in the sidebar.
- **Rec:** keep the top bar + sidebar shell, because our Platform/Agency/Client context switcher maps best to Neon/Supabase-style slash-separated switchers in the top bar. Confidence **med-high**.

**Top bar**
- Height ~40–48 px (all), white with a 1 px bottom border (A08, A10, A13). Dark top bars appear only in Shopify and Mistral (not inventoried). Centred or left search with a ⌘K hint (A06, A10, A13, A15). On the right: help, bell, avatar, and occasionally an AI sparkle (A06) or "Ask Assistant" (A10).
- **Rec:** white top bar with 1 px border, ~48 px tall, search with ⌘K hint, and an orange Friday pill placed right-of-centre or in the content header. Confidence **high**.

**Sidebar**
- Background: shaded grey sidebar against white content in A04, A05, A06, A14 and Mistral (**5 apps**, est. #F3–#F8). White sidebar with a 1 px border in A01, A03 (near-white), A08, A09, A11, A12, A13 (**7 apps**). Both are calm. Shaded sidebar works best with an *inset content sheet* (A04, A14).
- Width ~200–240 px desktop (est. from scaled previews).
- Grouping: small grey section labels at ~11 px. Sentence case in A01, A03, A04, A12; UPPERCASE tracking in A08, A09, Mistral. Spacing-only grouping in A11. Collapsible parents with chevrons in A01, A05, A06.
- **Active item:**
  - Soft grey fill with an unchanged label: A03, A08, A10, A13, A06, Mistral (**6 apps**).
  - Tinted brand fill + brand text: A11, A12 (**2**).
  - Brand-coloured text/icon with no fill: A01 Stripe (**1**).
  - Bold text only: A09 Vercel.
  - Left accent bar: A05 GitLab, A12 Jira.
- Icons: 16 px outline/line icons at 1.5 px stroke in every screen. Badge counts are right-aligned grey (A04, A11).
- Bottom zone: trial/upgrade card, help, invite, settings, user (A03, A04, A09, A13, A14).
- **Rec:** sidebar slightly shaded (~#F6F9FC canvas or #EEF2F6 panels) is supported. Use active = grey (or very light primary tint) fill with a ~6 px radius, plus a darker/bold label. Use sentence-case 11–12 px section labels and 16 px line icons. Confidence **high**.

**Collapsed / icon-only rail**
- A10 Supabase (~44 px rail with a grey square active state), Snowflake, Midday and Quicken (not inventoried) all use a rail of ~48 px with tooltips. Most apps offer a collapse toggle (A03, A05, A08 "Collapse menu", A12).
- **Rec:** provide a collapse toggle to a ~56 px rail. Confidence **med**.

**Breadcrumbs**
- In the content top strip (A05, A09, A11, A15) at ~12 px grey with `/` separators (A09, A11, A15) or `›` (Adaline). Above the title in A12. Many apps have none and rely on the sidebar (A01, A03, A13).
- **Rec:** keep breadcrumbs at 12–13 px muted grey with `/` separators, above the title. Omit them on top-level pages. Confidence **med-high**.

**Page header**
- Title size splits into two camps:
  - *Large H1* (~22–28 px semibold) on overview/home pages: A01, A05, A13 (plus Coda and Hashnode).
  - *Small title* (14–16 px semibold) on work/data pages: A03, A07, A11, A15.
- One-line grey description under the title: A15 (plus Hashnode and Pitch). This is uncommon but tidy.
- Actions always sit right-aligned on the title row. There is one primary button (A05, A11, A12 blue; A09, Neon dark), and secondary actions are ghost/outline buttons.
- **Rec:** PageHeader = breadcrumb → title (20–24 px semibold) + optional one-line description → right-aligned actions (max 1 primary). On dense data pages, allow a compact variant with an 18 px title and inline tabs. Confidence **high**.

**Secondary nav / tabs**
- Underline tabs under the header with a dark or brand underline (2 px): A05, A07, A12, A15 (plus Reddit, Outseta). Tabs inline with the title in A11. Second sidebar column in A06, A08 (plus HubSpot, Zoho). Drill-in sidebar replacement in A09, A15.
- A07's 15 tabs show the failure mode.
- **Rec:** use underline tabs for 2–7 peer views. For settings with more sections, use a drill-in sidebar ("‹ Back" + list) as in A09/A15, rather than a 2nd column or long tab bars. This matches our `/agency/settings/*` routes. Confidence **med-high**.

**Command palette / search**
- Centred ~560–640 px modal, top-anchored, radius 8 px, soft shadow, backdrop dim/blur. Grouped results with small labels and a grey-fill highlight (A16, Base44, Juicebox, Vapi). There is often a footer key-hint bar. Magnific offers "Press Tab to Ask" as an AI handoff.
- **Rec:** ⌘K palette with groups (Clients, Competitors, Pages, Actions) plus "Ask Friday about '…'" as the last row or a Tab handoff. Confidence **med**.

**Account menu / workspace selector**
- Workspace switcher at the top of the sidebar (name + ▾ or ⇕): A03, A04, A09, A11, A14 (**5**). Top-bar slash switchers: A08, A10 (**2**). Merged account + workspace menu: A14 (and Snowflake). Separate avatar menu top-right: A12, A13, Midday.
- **Rec:** top-bar context switcher (Agency ⇕ / Client ⇕) plus a separate avatar menu top-right, since we have up to 3 levels. Confidence **med**.

**Card vs no-card**
- Normal working views with **no cards** (sections on the canvas, separated by spacing, headings and hairlines): A01, A03, A08, A09, A11, A12 (**6 apps**).
- Headings on the canvas with bordered panels and **no shadow**: A05, A10, A15 (**3 apps**).
- Card grids with borders + soft shadow: A02 (edit mode), A06, A07, A13, A14 (Klaviyo, Airtable and Fibery are onboarding- or object-tile-heavy).
- **Rec:** the hypothesis holds. Default to no-card sections. Use a 1 px bordered panel (no shadow) only for self-contained blocks such as tables, empty states and settings groups. Reserve hover-lift cards for clickable object tiles. Confidence **high**.

**Colour separation**
- Region separation uses a 1 px border ~#E5E7EB (est.) in nearly all apps, and/or one shaded region (sidebar *or* canvas, never both). Colour accents are limited to the primary button, active nav, links and status chips. Only Klaviyo (promo art) and Airtable (icon tiles) are colourful.
- **Rec:** palette of white content, a shaded sidebar or canvas, ink text, and primary #47A8E7/#2A6BAC only on primary actions, links and active state. Keep orange for Friday. Confidence **high**.

**Typography**
- Nav 13–14 px regular, section labels 11–12 px muted, table text 13 px, H1 20–28 px semibold. The visible fonts are Inter-like neo-grotesques throughout.
- **Rec:** Inter at 13/14 base in dense areas and 14/15 elsewhere, with weights 400/500/600. Confidence **high**.

**Radii / borders / shadows**
- Radii: buttons and inputs 4–6 px (all), panels 6–8 px. Popovers are the only consistent shadow users (all). GitLab and Neon are the squarest (~4 px).
- **Rec:** radius 6 px for controls and 8 px for panels and popovers. Use shadows only on overlays (menus, palette, dialogs, toasts). Confidence **high**.

## Surprises / counter-evidence
- Stripe (A02), Klaviyo (A06, A07) and Fibery (A14) do use bordered cards with a soft shadow on dashboards and settings, so cards are still mainstream for *widget dashboards*. Our weekly-brief "where you stand" scorecard may legitimately want a contained panel.
- Several best-in-class apps (Stripe, Attio, Linear, LangSmith) have **no full-width top bar**: the sidebar owns the top-left and context. A top bar is not obviously "better". We prefer it for multi-level context and the Friday entry point, not because it is the norm.
- About half the apps keep the sidebar **white** with a border rather than shaded. A shaded sidebar is fine, but then the content should be pure white (or an inset sheet), not also grey.
- Small page titles (14–16 px) are common on data-heavy pages (Attio, LangSmith, Klaviyo settings), which challenges a uniform large PageHeader.
- Linear and Fibery's "inset sheet" shell uses a radius and a faint shadow on the main content panel. That is a deliberate exception to the no-shadow rule, and it looks calm.

## ai_usage_notice
none
