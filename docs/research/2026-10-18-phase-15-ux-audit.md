# Phase 15 — UX audit (main @ e0f6f627)

Pilot → production designer review. Inputs: [inventory](2026-10-18-phase-15-page-inventory.md), `docs/brand/mockups/` (rendered at 1440px), the shell and every `page.tsx` + components. **Audited from code**; no app screenshots, because `cs_demo` lags the schema (`list_clients` fails) and a reset was out of bounds. Key: **H/M/L**; **15a** IA/nav/headers · **15b** help · **15c** page fixes. Paths are under `apps/web/src/`.

---

## 1. Mockups vs built

| Mockup | Kept | Lost | Build improved |
|---|---|---|---|
| **01 Client overview** | KPI cards with pills, brief as the main column, Ask panel, pressure bars, moves / ads / recommendations row | Greeting h1 (now `{profile.name}`); week picker; "Brief archive" / "Download PDF"; recommendations checklist with owner and due (now read-only); "Your account manager · Book a call" footer; "How to read this brief"; full-width ad chart (⅓ width → ~7px ticks). | Starting-point card, setup badge, alerts card, quarterly reports. `aria-label` on pressure bars. |
| **02 Changes** | Almost verbatim: subtitle, filters, grouped feed, evidence viewer, score breakdown | Search box; viewer reachable on narrow screens (the build stacks 50 rows above it) | Diff text, feedback, paging |
| **03 Reviews** | KPIs, theme heatmap, rating mix and trend, latest reviews | "Your edge / Their weak spot" insight cards; readable cell meaning | Self notice, review search |
| **04 Approval queue** | Subtitle copy | Three-pane workspace (now table + detail); "Approve all verified"; per-status chip colours; "Friday is unsure — your call"; sidebar **Settings** group; "Signed in as … · Account manager" footer; zone label **"Summit Digital · Agency workspace"**. | Edited / Auto-send / Quiet flags. Automation moved into client settings (right home). |
| **05 Branding & voice** | "Your clients never see our name" | Page tabs (White label · Domain & email · AI voice · Legal · Billing). Live Portal / Email preview. Contrast check. Discard / Save in the header. Title is now just "Branding". | Real logo upload; 13a adds Domains |

**Bring back:** zone label (switcher seed), Settings group, who-am-I footer, brief archive, teaching panel, tabbed settings (`@cs/ui` has no Tabs).

---

## 2. Per page

### 2.1 Platform (`(platform)/**`, operators)

**Shell (`shell/nav-items.ts` L97–107)**
- **H 15a.** The 10 console links are appended to the agency "Account" group: two "Billing" entries, a second "Overview", no heading.
- **H 15a.** The logo and footer show the operator's own agency.
- **M 15a.** No queue badges, and only `ask/[threadId]` has a back link.

**`/platform`** (overview charts + activity)
- **H 15b.** Every tile has `hint="Last 28 days"`, which contradicts "Spend this month".
- **M 15c.** `RangeToggle` sits by the h1 but drives only the charts.
- **M 15c.** Chart axes mix ISO weeks and "2026-10".
- *Help:* WAU, Seats, Active clients, Spend (a cost, not revenue), delta pill.

**`/platform/agencies`**
- **H 15c.** `limit: 100` drops `nextCursor`, so agency 101+ is unreachable. No search.
- **M 15c.** Sortable headers look static.
- *Help:* Health legend (At risk / Idle / Growing / Steady), WAU, Seats.

**`/platform/agencies/[id]`**
- **H 15a.** No back link.
- **H 15c.** Ships the "Agency management is coming soon." placeholder.
- **H 15c.** Pilot, cap and discount actions change Stripe state with no confirmation.
- **M 15c.** Raw enums (`trialing → past_due · stripe_webhook`) and 4 date formats on one page.
- **M 15b.** The support dialog never states 60 min / read-only / audited.

**`/platform/billing`**
- **H 15a.** Six sections on one long page, with Invite links (the most used) last. Split into tabs.
- **H 15c.** Revoke, Pause sign-ups and Publish plan have no confirmation.
- **M 15b.** Asks for agency UUIDs comma-separated.
- *Guide:* pilots, trials, codes, invite links.

**`/platform/leads`**
- **M 15c.** "Verified" silently falls back to the created date.
- **M 15c.** Raw vertical slugs in the assign select, and no success feedback.

**`/platform/reviews`**
- **H 15c.** Cards show raw `source · kind` and **no client or agency**.
- **M 15c.** No count, paging or diff.
- *Guide:* gold labels and τ 0.85.

**`/platform/themes`**
- **M 15b.** Calls the same thing "theme", "topic" and "unthemed".
- **M 15c.** Approve / Reject are irreversible with no confirmation.

**`/platform/ask/*`**
- **M 15a.** The label never names the assistant.
- **M 15c.** One grey chip for all flags. The thread shows raw `ROLE · STATUS`, no timestamps, raw JSON.

**`/platform/knowledge/*`**
- **H 15a.** New / Edit have no back link and no status or level in the header.
- **M 15c.** Import-from-URL is buried at the bottom.
- **M 15c.** Preview ignores the Kind.
- **M 15c.** Edit shows the raw `syncError`.
- *Guide:* authoring.

**`/platform/health`**
- **H 15a.** The nav item leads to a placeholder; hide it until Phase 7.

**`/platform/costs`**
- **M 15c.** Hand-rolled tiles.
- **M 15c.** "Warnings" vs "Low".
- **M 15c.** The chart's detail is reachable only via SVG `<title>`.
- **L 15c.** The warning strip sits outside the 1560px width.

### 2.2 Agency (`(app)/agency/**`)

**Portfolio**
- **H 15b.** The `PressureBadge` level exists only in an `aria-label` on a `<span>`, so it is colour-only for sighted users.
- **M 15c.** Hand-rolled KPI tiles (h1 → h3), and linked tiles look static.
- **M 15c.** "Approve week of 2026-10-12" (ISO).
- **M 15c.** Billing "Pause" has no confirmation.
- **M 15a.** The same metric is called "Budget" here and "Share" on Usage.
- **M 15b.** Thin empty state. The checklist has 5 steps but the wizard has 4.
- *Guide:* "Your Monday routine".

**`/agency/clients/new`**
- **M 15a.** No back link or step indicator.
- **M 15b.** "Vertical" here, "Service type" on Leads, "Industries you serve" in onboarding.

**Approvals**
- **M 15a.** Nav says "Approvals", h1 says "Approval queue". No badge.
- **M 15c.** Every status is a solid `Badge variant="secondary"`.
- **M 15c.** Empty copy is wrong when approved or sent rows exist.
- **L 15c.** Unlabelled last `<TableHead />`.
- **L 15b.** Hard-coded "Friday" instead of `assistantName` (Alerts too).

**`approvals/[briefId]`**
- **H 15a.** No back link.
- **H 15b.** The amber border means confidence ≥ 0.85, conveyed by colour only.
- **M 15c.** The AutoSend switch changes the client setting from inside one brief.
- **M 15c.** "send Mon 07:00": whose timezone?
- **M 15c.** Rating buttons don't show a pressed state.
- *Guide:* "Reviewing a brief — no evidence, no claim".

**Alert review**
- **H 15c.** Alerts expire after 7 days, but `createdAt` isn't shown.
- **M 15c.** `.limit(200)` truncates silently (`tools/alert-queue.ts:28`).
- **M 15c.** No client filter.
- **M 15b.** Score 70+ and the "17:00 digest" are unexplained.

**Prospects**
- **H flow.** "Edit profile" and "Find competitors" leave for `/c/<id>/…` with no return path.
- **M 15c.** Raw lowercase status.
- **M 15b.** "Convert" doesn't say it takes a seat and starts setup.

**Leads**
- Best-taught empty states in the app.
- **M 15a.** Bespoke tabs.
- **M 15b.** "Accept and invite" doesn't say what it does.

**Usage**
- **H 15c.** Zero clients shows an empty table.
- **H 15c.** Inline 3-input forms sit in table cells; use a dialog.
- **M 15c.** Month shown as "2026-10".
- **M 15b.** The visible "Cap" / "Limit" labels don't match their `aria-label`s.
- **M 15a.** Belongs under Settings.

**Playbooks** (Runbook after 14b)
- **H 15c.** Raw trigger keys (`price_change`).
- **M 15b.** Every placeholder is listed for every trigger, with no preview.
- **M 15c.** Reset and Off have no confirmation. Very long page.

**Team**
- **H 15b.** "Seat" is never defined; people will think seats are users (a seat = an active client).
- **M 15c.** "Admin" here vs "Agency admin" elsewhere.
- **M 15c.** Remove buttons have no per-row `aria-label`.
- **M 15c.** No invite resend.

**AI connections**
- **H 15c — leak.** `components/ai-connections.tsx:98` hard-codes `claude mcp add … rival-monday`, and it is shared with the client page.
- **M 15b.** The access levels read / feedback / manage are unexplained. The descriptions in `oauth/consent/consent-form.tsx` could be reused.
- The BACKLOG "AI Badge" item is stale.

**Branding**
- **M 15c.** The hex `<Input>` in `branding-editor.tsx` has no label.
- **M 15c.** No contrast check.
- **M 15c.** URL and Upload sit side by side with no "or".

**Webhooks**
- **H 15c.** Raw `am_alert, brief_ready`, even though `AGENCY_KIND_OPTIONS` exists.
- **M 15c.** No delete and no test message.
- **M 15b.** No how-to for getting the webhook URL.

**Agency billing**
- **H 15b.** "includes 3 clients" sits next to "Seats: 2 of 3".
- **M 15c.** `read_only` is labelled "Paused", the same word as a client pause.
- **M 15c.** The blank-vs-0 setup-fee rule is buried in prose.
- **M 15a.** Client billing deserves its own tab.

**Intake**
- **H 15c — leak.** `buttonHtml()` hard-codes `#47A8E7`.
- **M 15b.** Renaming the slug silently breaks shared links.
- **M 15c.** No preview.

**`/onboarding`**
- **M 15a.** No "Step n of 4".
- **M 15c.** Required fields aren't marked.
- **M 15c.** The team role defaults to Agency admin.
- **M 15c.** Last button says "Done" while the rest say "Save and continue".
- **M 15b.** The Plan step has no price or seat explanation.

### 2.3 Client — intelligence (`/c/[clientId]/…`)

**Overview** (`overview-kpis.ts`, `views/brief-view.tsx`, `views/scorecard.tsx`)
- **H 15c.** `StartingPointCard` renders with no card around it, and its "Review it" goes to the generic queue.
- **H 15c.** Ad chart is unreadable at ⅓ width.
- **M 15b.** Pressure is shown by colour only.
- **M 15b.** The "N high" pill actually means alerts.
- **M 15b.** "Competitor price moves" collides with the Moves module.
- **M 15b.** "First moves still open" means *your* actions.
- **M 15c.** `BriefLinkList` shows clients "Week of 2026-10-20" plus a raw `sent`.
- **M 15c.** Nine cards and no primary action.

**Competitors**
- **M 15b.** Tiers are explained to the agency only.
- **M 15b.** "Rated Mon 13 Oct" reads like a star rating.
- **M mobile.** 6-column table. Signal tooltips don't open on tap.
- **L 15b.** Client empty state has no next step.

**Competitor profile**
- **H 15a.** Orphan page with no back link.
- **H 15b.** Bare pressure number in the header.
- **M 15c.** Raw `pageType` / `cadence` and vendor states ("Data provider error") shown to owners.
- **M 15c.** KPIs show `— ★` and an unfiltered moves link (BACKLOG).

**Changes** (`feed.tsx`, `viewer.tsx`)
- **H mobile.** The viewer renders below 50 rows, with no anchor.
- **H 15b.** No score scale. Factor decimals and the `FactorBar` `aria-label` read just "0.40".
- **M 15b.** The "Brief" / "Archived" route pills are ambiguous.
- **M 15c.** Capture details (SHA-256, `toUTCString`) are shown to owners.
- **M 15c.** `ROUTE_TONE.brief` hard-codes `#B45309`.
- **M a11y.** Fake tabs; Rankings `tabs.tsx` is the correct pattern.
- *Guide:* scoring and routing.

**Pricing**
- **M 15c.** Rows don't look clickable.
- **M 15b.** The change pill is competitor-centric (red = cut), compares "vs 90 days" only in `title=`, and ignores the selected period.
- **M 15b.** "Your service" reads as "your price".

**Ads**
- **M 15b.** "Targeting not disclosed (US)" repeats on every card.
- **M 15c.** A third filter-bar variant.
- **M 15c.** The competitor filter misses rivals that have no ads.

**Reviews**
- **H 15b.** Heatmap share and colour are explained only in the subtitle and in non-focusable `<title>` elements. The table fallback is unstyled (`34% · +0.3`).
- **M 15b.** `SelfNotice` says "Profile page", but clients see the nav label "Services & area".
- **M 15c.** "Google reviewer · You" reads as authored by you.
- *Guide:* heatmap.

**Local rankings**
- **H 15c.** Radius is in **km** (US-first product; Competitors uses miles).
- **H 15b.** Jargon: local pack, share of voice, average map rank, points.
- **M a11y.** Cap notes aren't linked with `aria-describedby`.
- **M 15c.** The slider gives no loading feedback.
- **M 15c.** "You" changes colour between charts.
- *Guide:* "Local rankings explained".

**Moves**
- **M 15b.** "N signals" should be "N changes".
- **M 15b.** Statuses are unexplained.
- **M 15c.** Empty copy names a period control that doesn't exist.
- **M mobile.** Same stacking problem as Changes.

**Recommendations**
- **H 15c.** Cards read "Effort L · Impact H".
- **M 15c.** Agency staff also see "For you".
- **M 15c.** Empty columns are silent, and items have no date or source link.

Pitch snapshot's "← Overview" is the model back link.

### 2.4 Client — Ask, details, setup, settings

**Ask**
- **M 15b.** The visibility line "Only you can see them." disappears after the first thread, and the review disclosure's fallback name is "Rival Monday" (`packages/mcp/src/branding.ts`). Keep one permanent line under the composer.
- **M 15c.** Delete happens in one click, and its error appears only in `title=`.

**Brief / Alert / Report detail**
- **H 15a.** No `<h1>` (`CardTitle` is a div; the h2 sits under a muted title). No back link, no prev / next, no index. Overview lists only the last 10 (`limit: 10`), though the tools support `offset`.
- **H 15c.** The alert time is a raw ISO timestamp.
- **H 15c.** Report moves show raw `territory_expansion · open`.
- **M.** Agency users get no link from a brief back to its approval page.

**Evidence**
- **H 15c — leak.** "rendered by RivalMondayBot" (`evidence/[evidenceId]/page.tsx:112`).
- **H 15c.** Raw `robots_disallowed`.
- **M 15b.** SHA-256, fingerprint and legal hold are unexplained.
- **H 15a.** No back link.

**Setup wizard** (`setup/steps/*`)
- **H 15b.** Client owners see "Map centre (latitude, longitude)", "Radius (km)" and "Google place id". Show the address and miles, and put the rest behind "Advanced".
- **M 15a.** The stepper is display-only, with no Back.
- **M 15c.** Hints aren't linked with `aria-describedby`. Keyword limit is 5 in Settings and unstated here.
- **M 15c.** Pick step shows no "3 of 5 selected".
- **M 15c.** The Billing step's "Connect Stripe" is plain text, not a link.
- **M 15c.** `DuplicateHint` actually lives in `lookup-step.tsx:83` and `start/intake-form.tsx:70`. Tie it to the result buttons.

**Profile** (`settings/profile`)
- **M 15c.** Two stacked forms with separate saves.
- **M 15c.** The success message appears at the top while Save is at the bottom.
- **M 15c.** Stale "(coming soon)" on AI connections.
- **M 15b.** The client summary reads "15 km · 0 ZIP codes".
- **M 15b.** "Contact your account manager" has no link.

**Delivery**
- **H 15b.** "After AM check" is jargon; Alert rules calls the same mode "after review".
- **M 15c.** The auto-send `<Label>` has no `htmlFor`.
- **M 15c.** Recipient deactivation is irreversible, with no Cancel.
- **M 15b.** The 17:00 digest time zone is unstated.

**Alert rules**
- **M 15b.** Thresholds need a band bar (archive | brief | alert) with examples.
- **M 15c.** "3 a day" is hard-coded at `settings/alerts/page.tsx:31`.

**AI connection**
- Same leak and jargon as the agency page.
- *Guide:* "Connect Claude/ChatGPT".

**Client billing**
- The best-formed settings page: brand-leak test and `role="status"`.
- **M 15c.** No link to contact the agency.

### 2.5 Account and public

**Avatar menu** (`top-bar.tsx`)
- **H 15a.** Only email + Sign out: no name, role, agency, settings, help or switch.

**`/inbox`**
- **H 15a.** No `<h1>`.
- **M 15c.** Times use the server zone, unlabelled.
- **M 15c.** Unread is shown by bold only.
- **M 15c.** No client name per row for agency users.
- **L 15c.** The bell shows a dot, no count.

**`/settings/notifications`**
- **M 15c.** Duplicate `id="timezone"` / `quietStart` / `quietEnd` across cards.
- **M 15c.** Switches autosave and swallow errors; quiet-hours Save gives no feedback.
- **M 15b.** "Client alerts (agency)" and "Rank scan skipped" are unexplained.

**`/kb/[id]`**
- **M 15a.** No back link, and no Help index. It becomes the article view of `/agency/help` and `/c/<id>/help`.

**Auth dead ends** (sign-in, check-email, link-*, oauth/consent; also `/paused` and `/u/*` lack contact / cancel)
- **H 15c — leak.** `AuthCard` uses `defaultBranding()`, which shows the Rival Monday wordmark to clients of white-label agencies. The root `app/layout.tsx` `title: 'Rival Monday'` is the tab title on every workspace page.

**Sign-up / check-email**
- **M 15c.** No "Already have an account?" link, no terms / privacy, no resend, and the email address isn't echoed back.

**`/start`**
- **M 15c.** Stage 2 appears below the results with no focus move.
- **M 15c.** Consent has no privacy link.
- **M 15c.** `/start/v/[leadId]` dead-ends with no CTA and shows km.
- **M copy.** It promises a reply "within one business day" on the agency's behalf.

---

## 3. Cross-cutting patterns → standard

| Pattern | Today | Standard |
|---|---|---|
| **Header** | h1 `text-[26px] font-extrabold` copy-pasted in 55 files. Detail views and Inbox have no h1. The `— {client}` suffix appears on some pages only. Subtitle, actions and back links vary. Every tab title is "Rival Monday". | `PageHeader {breadcrumb, title, description, actions, help}`. Title = nav label, with no client suffix. Metadata `{page} · {displayName}` (13a). **15a** |
| **Back links** | Pitch snapshot, Ask thread, prospect only | Breadcrumb on every child, new and wizard page. **15a** |
| **Loading / error** | **No `loading.tsx`, `error.tsx` or `not-found.tsx`.** Pages make up to 11 tool calls. | Skeleton per route group, `error.tsx` with retry, branded 404. Add `Skeleton` to `@cs/ui`. **15c** |
| **Tables** | shadcn, raw `<table>` with and without `scope`, unstyled chart tables, blank action headers | shadcn `Table`, `scope="col"`, sr-only action header, empty row inside the table, cards below `md`. **15c** |
| **Filters / tabs** | 3 filter bars; Apply / Search / Show; 3 period pickers. Tabs exist 3 ways (Rankings is correct, Changes is fake, Leads is bespoke). | `FilterBar`, `Segmented`, `Tabs` in `@cs/ui`; one verb, "Apply". **15a / 15c** |
| **Forms** | Success message at top, at bottom, missing or autosaved; never `role="status"`. Some dialogs have no Cancel. Hints aren't linked with `aria-describedby`. | `SaveBar` (button + live status). `ConfirmDialog` with Cancel for irreversible or billing actions. `FieldHint` with an id. **15c** |
| **Dates** | 8+ formats and 12+ local `fmt` helpers. Inbox and Team use the server time zone. | `formatDate(short\|long\|month)`, `formatDateTime(tz)`, `formatRelative`. US "Oct 3, 2026"; omit the year in the current year; business time zone on client pages. **15c** |
| **Money / units** | Two `formatUsd` (dollars vs cents) plus `formatMoney`. km in setup, rankings, the profile summary and snapshot; miles on Competitors. | Rename to `formatCents`. Display miles everywhere. **15c** |
| **Chips** | Solid `Badge` variants, hard-coded hex pairs (`#B45309`, `#FEE2E2`, `#FDE8E8`, `#DCFCE7`), raw lowercase enums, `rounded-full` vs `rounded-md` | `StatusChip {tone}` with soft tints from tokens ("calm chips"), and label maps for every enum. **15c** |
| **Colour meaning** | Up/down green/red (Pricing, competitor-centric) vs blue/orange (change grid); "You" colour floats; pressure and confidence are colour-only | Fixed "You" series, one better/worse palette, a visible word beside every colour signal. **15c** |
| **Hover help** | `Tooltip` used once; otherwise `title=` / SVG `<title>` (mouse only) | `HelpTip` popover (tap + keyboard), `PageGuide` (KB article), teaching empty states; KB copy with `{displayName}` / `{assistant}`. **15b** |
| **Terminology** | change / event / signal / move; "First moves" = client actions; Vertical / Service type / Industries; Admin / Agency admin; seat / client; "Paused" twice; After AM check / after review; theme / topic; Profile / Services & area; hard-coded "Friday" | Glossary: **competitor** (Top rival = tier only); **change** one difference, **move** pattern, **signal** pill, **first steps** yours; **brief** weekly, **report** quarterly, **alert** urgent; **business type**; **seat = active client**; **service** vs **client paused**; "I review alerts first"; **topic**; always `assistantName`. **15b** |
| **White-label** | Leaks (§2.2–2.5): root title, `AuthCard`, `RivalMondayBot`, MCP CLI and fallback names, intake colour, profile hint | Fix client-facing leaks first; brand public pages by context; one agency-facing policy. **15c** |

---

## 4. Information architecture

Four zones. A **zone switcher** sits at the top of the sidebar and the mobile drawer for users with more than one zone (it replaces mockup 04's zone label). Platform ↔ Agency is navigation only (Q3a). Other agencies are reached via support sessions.

1. **Platform**, with its own branding:
   - Overview.
   - Customers: Agencies, Leads.
   - Billing.
   - Quality, with badges: Decision review, Topic proposals, {Assistant} conversations.
   - Content: Knowledge.
   - Ops: Costs (owner); Health stays hidden until built.
2. **Agency**:
   - Work, with badges: Portfolio, Approvals, Alert review, Leads, Prospects.
   - Runbook (14b).
   - **Agency settings** as one tabbed area: Branding & voice, Team, Plan & billing, Client billing, Usage & limits, Intake link, Integrations (Slack & Teams, AI), Domains (13a), Platform access, re-open setup.
3. **Client**, in the client-headed panel:
   - Overview, Competitors, Changes, Pricing, Ads, Reviews, Local rankings, Moves, Recommendations, Ask.
   - New **Briefs & reports** index with an alerts filter (Q10a).
   - **Client settings** as one tabbed entry: Services & area, Delivery, Alert rules, AI connection, Billing, Customisation (13a), Runbook (14b).
4. **Account**, in the avatar menu:
   - Name, role and agency.
   - Notification settings.
   - Help.
   - Switch membership.
   - Sign out.
   - The Inbox bell stays in the top bar.

**Wrong zone today:**
- Platform pages and agency settings under "Account".
- Usage among the queues.
- Notifications beside agency settings.
- Client settings inside the module list.
- Recipients on Delivery duplicate the client contacts on Team.

**Duplicate labels:** Billing ×3, AI connections ×2, Overview ×2, Leads ×2. Zone headers disambiguate them.

**Orphans** (need breadcrumbs and exits):
- Brief, alert, report, evidence, competitor profile.
- Agency detail, KB new / edit, prospect hub, approval detail, `/kb/[id]`.
- The wizards: `/agency/clients/new`, `/c/[id]/setup`, `/onboarding`.

**Missing index pages:** Briefs & reports, Help (agency and client), Agency settings, Client settings.

**Mobile:**
- Keep the structure inside the drawer.
- Fix the drawer staying open across a resize (BACKLOG).
- Show Changes / Moves detail as a sheet below `lg`.

---

## 5. Top 15 recommendations (by end-user impact)

1. **Zone the navigation.** Give the platform console its own section and branding, move agency settings, client settings and personal items into their own homes, and add queue badges. (15a, H)
2. **Platform ↔ Agency switcher plus a zone label** (restores mockup 04's "Agency workspace"). (15a, H)
3. **Fix the client-facing white-label leaks:**
   - root `<title>`;
   - `AuthCard` default branding;
   - "RivalMondayBot" on evidence;
   - the `rival-monday` MCP CLI name;
   - the MCP fallback product name;
   - the intake button colour.

   (15c, H)
4. **"Briefs & reports" index per client**, plus archive links on the brief card and real `<h1>`s on the detail pages. (15a, H)
5. **Shared `PageHeader` with breadcrumbs and back links** on every detail, new and wizard page; the title matches the nav label. (15a, H)
6. **Help primitives** (`HelpTip`, `FieldHint`, `PageGuide`), KB-backed and white-label safe. Apply first to pressure, score and routing, tiers, confidence, seats and caps, the geo-grid and alert modes. (15b, H)
7. **`loading.tsx` / `error.tsx` / branded 404** per route group, plus a `Skeleton`. (15c, H)
8. **Plain-language setup and settings for business owners.** Show the address and a radius in miles; put lat/lng and place id behind "Advanced". Rename "After AM check". Use miles everywhere. (15b/15c, H)
9. **Confirmation dialogs for billing-affecting and irreversible actions**, and remove the "coming soon" placeholders. (15c, H)
10. **Mobile list/detail on Changes and Moves**: open detail as a sheet or route, with card fallbacks for wide tables. (15c, H)
11. **Glossary and terminology pass**: seat, change / move / signal, brief / report / alert, business type, the two meanings of "paused", `assistantName` everywhere. (15b, M)
12. **One `StatusChip` plus enum label maps.** No raw `price_change`, `am_alert`, `robots_disallowed`, "Effort L", or lowercase statuses. (15c, M)
13. **One date, money and unit formatter set**, using the business time zone on client pages. Fixes the raw ISO dates on alerts, briefs and Inbox. (15c, M)
14. **Agency settings as one tabbed area** (mockup 05). Branding gets a live preview and contrast check; Usage gets an edit dialog; Client billing gets its own tab. (15a/15c, M)
15. **Accessibility and forms sweep:**
    - visible words for colour-only signals;
    - keyboard and touch access to chart detail and tooltips;
    - real tabs;
    - `aria-describedby` hints;
    - per-row button labels;
    - fix duplicate ids on Notifications;
    - `role="status"` save feedback.

    (15c, M)
