# Batch C — Tables, lists, data-heavy views, filtering, bulk actions, pagination, empty states, master-detail

Source: Mobbin web screens (deep search, 7 queries). 16 screens, 14 apps. All colours are estimates from low-res previews; px sizes estimated at ~1440px-wide source.

## Inventory

- **C01 — Stripe · Transactions list (default)** — [Mobbin](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258) — image_url: https://mobbin.com/api/mcp/short/pWTYvwOW
  - ~16:10, light; SaaS dashboard, data-heavy enterprise, analytics/reporting
  - Nav: top bar (search field left, icons right, no fill) + white left sidebar (no shading, grouped "Products" section, active item purple text); content on white.
  - Components: H1 "Transactions" + primary (purple) + secondary button top-right; dismissible recommendation strip (~#F5F6F8 est.); row of 6 status "count tabs" (outlined boxes, label + number, selected = purple 1px border); dashed-outline "+ Date and time / Amount / Currency / Status…" filter pills; Export / Edit columns secondary buttons right; table; "6 results" count below.
  - Visual: table **flush on the page** (no card); header row plain white, ~12px semibold dark grey; 1px hairline row dividers ~#EBEEF1 (est.); no zebra; row ~36px (dense); amount column bold, currency greyed; status badges = small rounded-rect (r~4), tinted fill + darker text + trailing icon (green "Succeeded ✓", red "Failed ✕", grey "Incomplete ⓘ"); empty values "—"; row overflow "…" at far right; no shadows; radii ~6px on buttons/tabs.
  - Distinctive: count-tabs double as quick filters + KPI summary. Limitation: count tabs are boxed "mini cards" — the one card-like element.

- **C02 — Stripe · Transactions with applied filters** — [Mobbin](https://mobbin.com/screens/373146e1-8686-43b0-8a10-5da707dc8873) — image_url: https://mobbin.com/api/mcp/short/pSQjK2j6
  - Same chrome as C01; categories: data-heavy enterprise, search/discovery.
  - Applied filter pill reads "⊗ Date and time | Last 3 days ▾" — label grey, value in accent purple; unapplied pills show "⊕". "Clear filters" text link in accent. Filter popover: white, 1px border + soft shadow (~0 4px 12px rgba(0,0,0,.1) est.), r~8, checkbox list + full-width primary "Apply". Count tab selection resets to none when filters applied; result count updates ("5 results").
  - Distinctive: filter-pill = both entry point and applied-state chip (one component, two states). Very compact (~24px tall pills, 12px text).

- **C03 — Attio · Companies table** — [Mobbin](https://mobbin.com/screens/4087fbe2-d9dc-4097-ad39-f8501c937e70) — image_url: https://mobbin.com/api/mcp/short/VNQgx42f
  - ~16:10, light; data-heavy enterprise, SaaS dashboard (CRM)
  - Nav: left sidebar ~#FAFAFA (est., barely shaded) with workspace switcher, Quick actions, sections (Favorites/Records/Lists); no global top bar — page top bar holds title "Companies", avatar.
  - Components: view selector "All Companies ▾", "View settings", "Import / Export"; sub-toolbar "Sorted by Record ID +1", "Filter", "Discard changes / Save" (unsaved view state); spreadsheet grid; footer row "13 count" + "+ Add calculation" per column.
  - Visual: **edge-to-edge grid flush** to the content area; vertical AND horizontal 1px gridlines ~#EEEEF0 (est.); header row white with type icons, ~12px medium grey; row ~36px; multi-select tags = small r~4 coloured pastel chips (yellow/green/purple tints) — quite colourful; relationship strength = coloured dot + text ("● Weak" orange, "● Very weak" red, "No communication" grey); numbers right-aligned; no shadow.
  - Distinctive: dot + label status (calm), aggregation footer row. Limitation: multi-colour tags get noisy.

- **C04 — Linear · Issues list grouped by status, bulk selection** — [Mobbin](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022) — image_url: https://mobbin.com/api/mcp/short/syZfzCZH
  - ~16:10, light; project mgmt, productivity
  - Nav: shaded left sidebar ~#F4F4F5 (est.); content sits on a white **inset panel** with r~8 and hairline border (the whole content area, not individual sections). No top bar.
  - Components: segmented view tabs "All issues / Active / Backlog" (pill, selected = light grey fill); right icon buttons (filter, display); group headers "In Progress 5", "Todo 5", "Backlog 21" as full-width bands ~#F7F7F8 (est.) ~32px with "+"; list rows (not a table): priority icon, ID (grey), status icon, title, right-aligned label chips (outlined pill w/ colour dot), project chip, avatar, date.
  - Visual: rows ~36px, **no row dividers** (whitespace only); hover = faint grey; floating bulk bar bottom-centre: dark-text white pill, 1px border + soft shadow, "6 selected · ✕ · ⌘ Actions". Text 13px; IDs/dates grey ~#8A8F98 (est.).
  - Distinctive: label chips = outlined pill + coloured dot (colour only in the dot). Grouping gives structure without cards.

- **C05 — Hotjar · Recordings table with row selection** — [Mobbin](https://mobbin.com/screens/ff3024b1-5264-483e-afa7-460a0224ff89) — image_url: https://mobbin.com/api/mcp/short/k63wiZ8C
  - ~16:10, light; analytics/reporting, data-heavy
  - Nav: top bar (site switcher, trial banner, icons) + narrow icon-only left rail.
  - Components: saved-segment tab row (All sessions selected = outlined blue), "Last 24 hours ▾", "+ Add filter" outlined; table in **white card with border r~8**; toolbar inside card (sort dropdown, scope dropdown, "14 recordings", icons right).
  - Visual: header row bg ~#F5F6F8 (est.) 12px semibold; 1px dividers; rows ~44px (looser); selected row tinted light blue ~#EEF2FF (est.) + 1px blue border lines; floating bulk bar bottom-centre with shadow: "1 recording selected | Select all 14 recordings | 🗑 Delete (red outline) | ✕". Mini "bar meter" glyphs for frustration/engagement (tiny 3-bar sparkline, red/blue).
  - Distinctive: "Select all N" escalation inside bulk bar. Limitation: per-row "Play" buttons add visual noise (outlined button on every row).

- **C06 — Navattic · Visitors table, filter chips + pagination** — [Mobbin](https://mobbin.com/screens/ec4931ac-c3ca-46cd-8d07-39ffd02e22a9) — image_url: https://mobbin.com/api/mcp/short/HbdKYliP
  - ~16:10, light; SaaS dashboard, analytics/reporting
  - Nav: very thin far-left app rail + slightly shaded sidebar ~#F8FAFB (est.) with section labels (Analyze/Leads/Manage), active item grey fill r~6; breadcrumb top bar "Visitors / All visitors ▾".
  - Components: H1 "Visitors" + icon buttons + "Export"; toolbar: search, "Filter 1" (count badge), right "Sort Name ▾", date range; **applied-filter bar** = full-width light grey strip ~#F3F5F7 (est.) r~6 containing "Events: Engaged ✕ ▾", "+ Add filter", "✕ Clear"; table in 1px border container r~8 (no shadow); footer "25 ▾ rows per page" left, "1-6 of 6  Previous  Next" right.
  - Visual: header bg ~#F7F9FA (est.), 12px grey; rows ~48px with avatar + 2-line name/email; dividers 1px; "Not identified" italic grey; tiny bar-icon before visit counts; skeleton bars for loading City.
  - Distinctive: closest to our hypothesis — calm, grey, one accent; applied filters in a distinct shaded strip. Limitation: bordered container = light "card".

- **C07 — Navattic · Forms empty state (inside table)** — [Mobbin](https://mobbin.com/screens/46005a99-2d4c-494e-a592-ecd0d6b6101a) — image_url: https://mobbin.com/api/mcp/short/9eDg8vCH
  - Light; SaaS dashboard
  - Empty state rendered **inside the table frame**: header row still visible (Name/Views/Submissions/…), then centred stacked-paper icon (~40px, outlined), "No forms found" 14px semibold, one-line grey helper, dark primary "+ Create form" (near-black ~#111827 est., r~6). Pagination footer still shown.
  - Distinctive: keeps column headers so user learns the shape of the data. Limitation: pagination "1-2 of 2" shown on empty set (bug-ish).

- **C08 — Plane · Work items spreadsheet view** — [Mobbin](https://mobbin.com/screens/f98823b4-aaef-453d-8b72-77425ba485d5) — image_url: https://mobbin.com/api/mcp/short/nAVfQGJv
  - Light; project mgmt, data-heavy
  - Nav: icon rail + shaded sidebar ~#F5F5F5 (est.) + compact top bar (search centred, "Get started"). Breadcrumb-ish toolbar "Views > All work items 21", layout-switch icon group, "Display", primary "Add view" (blue).
  - Visual: flush grid, full vertical + horizontal gridlines; header white with column icons + sort chevrons; rows ~32px (dense); state = coloured icon + text (no fill); priority = icon + text; labels = coloured dot + "3 Labels". No zebra, no shadow.
  - Distinctive: status expressed as **icon + plain text**, zero badge fill.

- **C09 — ClickUp · List with bulk-action bar + status picker** — [Mobbin](https://mobbin.com/screens/e9639493-e0a6-46c9-93d1-d3189cbdc3c7) — image_url: https://mobbin.com/api/mcp/short/lWxusN1E
  - Light; project mgmt
  - Nav: dark icon rail (#1E1E2A est.) + white sidebar + view-tab bar (List/Board/Team/Timeline…).
  - Visual: selected rows faint grey fill + checked purple checkboxes; floating **dark** bulk bar (~#2B2B33 est., white text, r~8) bottom-centre: "3 Tasks selected ✕ | Status | Assignees | Dates | Custom Fields | Tags | Move/Add | Copy | 🗑 | More"; status dropdown grouped (Not started / Active / Done) with coloured ring icons. Rows ~32px, no dividers in some regions; priority = flag icon colour.
  - Distinctive: richest bulk bar; dark bar is high-contrast. Limitation: many colours + toolbar density = busy.

- **C10 — Calendly · Contacts table with filter builder popover** — [Mobbin](https://mobbin.com/screens/a633760b-536f-4387-af06-8056089fa6cc) — image_url: https://mobbin.com/api/mcp/short/D3vrsR0o
  - Light; SaaS dashboard, forms/data entry
  - Nav: shaded sidebar ~#F4F5F7 (est.) with active item blue tint; content area = white panel inset r~10 against grey shell.
  - Components: H1 "Contacts", gear + dark primary "+ Add contact ▾"; search, "Show columns ▾", "Filter ▴"; segment pills (All contacts = dark filled, others outlined); "Where [field][op][value] 🗑 / + Add condition / Reset filters / Apply" builder popover (shadow, r~8); table with **full gridlines** and outer border, header bg ~#F7F8FA (est.); footer "Items per page 25 ▾ Showing 1 - 5 of 5".
  - Distinctive: query-builder filter for power users. Limitation: full gridlines look spreadsheet-y.

- **C11 — Xero · Invoices with sort + numbered pagination** — [Mobbin](https://mobbin.com/screens/1e0934f9-de0a-42c5-bb31-7f6d6b28fabd) — image_url: https://mobbin.com/api/mcp/short/aKOXDTzP
  - Light; data-heavy enterprise (accounting)
  - Nav: blue top bar (not visible in this crop); folder tabs "All / Draft (6) / Awaiting Approval (1)…" with counts; boxed search panel with date pickers + blue "Search".
  - Visual: table in bordered box; header blue link text ~12px with "▲" sort indicator; 1px dividers; rows ~30px (dense); **numbers right-aligned** (Paid, Due); status as plain text ("Draft", "Awaiting Payment"); "Sent" green text; footer "Page [1▾] of 1 (13 total items)  Showing [25▾] items per page".
  - Distinctive: plain-text status works fine for finance density. Limitation: dated look (blue links everywhere, boxed panels).

- **C12 — Twenty · Companies table with record side panel** — [Mobbin](https://mobbin.com/screens/045edb7a-6c61-48ba-82bc-acc794b801c1) — image_url: https://mobbin.com/api/mcp/short/HHwuyaQ6
  - Light; data-heavy enterprise (CRM), master-detail
  - Nav: shaded sidebar ~#F7F7F7 (est.); white content panel inset r~8 with hairline border; page top bar "Companies" + "+ New Company".
  - Components: view "All Companies · 6 ▾", text-only "Filter / Sort / Options" right; flush grid w/ vertical lines; domain shown as grey outlined pill; "Calculate / Count all 6" footer. **Right side panel** (~40% width) pushes/overlays: header "✕ [logo] Mobbin · Created 19 minutes ago", tabs Home/Timeline/Tasks/+4 More, collapsible field groups (General/Business/Contact/System) with icon + label (grey) + value rows ~28px; related lists (People, Opportunities) with ↗ +; footer "Options ⌘O" + primary "Open ⌘↵".
  - Visual: panel separated by 1px border only (no shadow visible), same white bg; section headings 12px semibold grey.
  - Distinctive: side panel = quick peek, "Open" escalates to full page. Strong pattern for our competitor detail.

- **C13 — Delphi · Filtered list, no-results empty state** — [Mobbin](https://mobbin.com/screens/14f1556c-eba4-427e-aa8d-8bb7c20008c8) — image_url: https://mobbin.com/api/mcp/short/zqNIeO0K
  - Light; search/discovery
  - Content in white panel r~12 with 1px border on ~#F7F7F7 shell; search field top; filter pills (Tags/Status/Messages/Last Interacted — outlined, fully rounded); table header; centred icon (people glyph, grey), "No matching contacts", "No contacts match these filters. Try adjusting or clearing them.", two buttons: "Clear Filters" (grey fill) + "Share" (black).
  - Distinctive: distinct copy for **filtered-empty** vs first-run empty; recovery action first.

- **C14 — Notion Mail · Inbox list + reading pane** — [Mobbin](https://mobbin.com/screens/5ba89c38-f816-455e-bfa0-ad98517c7d0d) — image_url: https://mobbin.com/api/mcp/short/pVKIveyJ
  - Light; productivity, master-detail
  - Nav: shaded sidebar ~#F7F7F5 (est.) with Views/Mail sections + counts right-aligned grey ("99+").
  - List: single-line rows ~28px — sender (bold if unread + blue dot), subject (bold) + preview (grey) truncated; **no dividers**; selected row light grey fill; date group header "Yesterday" 13px semibold. Filter chips at top: "Categories: Not Promotions, S… ▾" (blue tint = applied), "Labels", "Is unread", "Show archived" (plain). Reading pane right ~45% separated by 1px border, card-ish message block r~8 with border. Toast "Thread archived | Undo" dark, bottom-left.
  - Distinctive: unread = weight + dot, not colour fills. Extremely calm.

- **C15 — Intercom · Inbox three-pane + details sidebar** — [Mobbin](https://mobbin.com/screens/b1a806f1-b212-45a8-b525-fea3fa01b961) — image_url: https://mobbin.com/api/mcp/short/ihNXQFyE
  - Light; productivity, admin, master-detail
  - Nav: icon rail + inbox sidebar (counts right) ~#F5F5F3 (est.); list pane ~#FAFAF8 with "8 Offen · Letzte Aktivität ⇅"; selected conversation = white card with border r~8 (others flat); conversation pane; right details panel with collapsible sections (Links, Gesprächsattribute, Lead-Daten…) using bold headings + chevrons + 1px separators.
  - Distinctive: four columns still feel calm because each pane is a slightly different neutral. Limitation: heavy for non-power users.

- **C16 — Retool · Database table with sort popover** — [Mobbin](https://mobbin.com/screens/df6ae31b-a72b-465b-ab78-ac84b279c228) — image_url: https://mobbin.com/api/mcp/short/6mtOJpgS
  - Light; data-heavy enterprise, admin
  - Nav: breadcrumb top bar "Resources / Retool Database", file-like tabs (monospace names) under it; text toolbar "Add row | Import CSV ▾ | Fields | Filters | Sort | Quick find" + "Refresh · 1,779 records" right.
  - Visual: flush grid, vertical + horizontal lines ~#ECECEC (est.), header ~#FAFAFA with type glyphs, rows ~30px, row numbers grey, **numerics right-aligned**, monospace-ish header labels; sort popover (r~6, shadow) with multi-level "field / Ascending ✕" rows + "+ Add field" + blue "Apply".
  - Distinctive: record count in toolbar; multi-sort. Limitation: dev-tool aesthetic, not client-friendly.

## Pattern observations (this batch)

**Table container (flush vs card)**
- Flush on page background, no border: C01/C02 Stripe, C03 Attio, C08 Plane, C16 Retool, C04 Linear (list), C14 Notion Mail → 6 apps.
- Thin 1px bordered container r~8, no shadow: C06/C07 Navattic, C10 Calendly, C11 Xero, C13 Delphi → 4 apps.
- White card with border + toolbar inside: C05 Hotjar → 1 app.
- Whole content area as an inset white panel on grey shell (not per-section cards): C04 Linear, C10 Calendly, C12 Twenty, C13 Delphi → 4 apps.
- Rec: tables flush on the canvas with hairline row dividers; at most a 1px border when the table must be visually bounded on a page with other content. No shadows. Supports hypothesis. **High.**

**Header row**
- Plain (same as body bg), 12px medium/semibold grey: Stripe, Attio, Plane, Retool-ish → 4. Lightly tinted ~#F5–F8: Hotjar, Navattic, Calendly, Retool → 4.
- Rec: 12px semibold muted-ink header, either plain or very faint tint (#EEF2F6-family at reduced strength, e.g. ~#F3F6F9); sentence case, no uppercase. **Med** (split evidence; both are calm).

**Separators**
- Horizontal hairlines only: Stripe, Hotjar, Navattic, Xero → 4. Full grid (vertical + horizontal): Attio, Plane, Calendly, Retool, Twenty → 5 (all spreadsheet/CRM tools with editable cells). None (whitespace): Linear, Notion Mail, ClickUp (partly) → 3 (list views, not tables).
- **No zebra striping anywhere (0/14).**
- Rec: horizontal hairlines for read-only tables; whitespace-only for list items (feeds, briefs); avoid vertical gridlines (signal "editable spreadsheet" — we're not). **High.**

**Density**
- Dense 28–36px: Stripe, Attio, Linear, Plane, ClickUp, Xero, Retool, Notion Mail (8). Comfortable 44–48px (avatar/2-line cells): Hotjar, Navattic (2).
- Rec: 40px default row (our audience is less power-user than Linear), 36px "compact" option for big competitor tables; 2-line cells allowed for entity name + domain. **Med.**

**Hover / selected rows**
- Selected = faint tint (blue ~#EEF2FF Hotjar; grey ClickUp/Notion Mail; light teal Typeform-like); checkbox in accent. Hover = faint grey (Linear, Notion Mail).
- Rec: hover ~#F6F9FC (canvas) / selected ~primary at 8% tint; checkbox accent = secondary #2A6BAC. **High.**

**Status badges vs filter chips**
- Tinted rounded-rect badge with text (+icon): Stripe C01/C02 → 1 inventoried app (also seen in non-inventoried Asana, Airtable, Jira results).
- Dot + plain text: Attio ("● Weak"), Linear labels (dot in outline pill), Plane labels, Notion Mail unread dot → 4 apps.
- Icon + plain text (no fill): Plane state, Linear status icons, ClickUp → 3 apps.
- Plain text only: Xero → 1.
- Filter chips are visually distinct: outlined pill with ⊕/▾ (Stripe, Delphi, Navattic "+ Add filter"), applied = value in accent colour or tinted fill (Stripe, Notion Mail) with ✕.
- Rec: default status = **dot + text** (calm, colour-light, accessible with text); reserve tinted-fill badges for a few high-signal states (e.g. "New", "Failed", tier "Top rival"). Filter chips = outlined, rounded-full; applied = tinted primary bg + ✕. Keep badges r~4 rectangles and filter chips fully-rounded so the two never get confused. **High** for dot+text, **med** for shape split.

**Toolbars / filter bars / view switchers**
- Structure seen nearly everywhere: [view/segment selector] [search] [filter] … right: [sort][display/columns][export] (Stripe, Attio, Navattic, Calendly, Plane, Twenty, Hotjar → 7 apps).
- Quick-filter segments: count tabs (Stripe C01, Xero folder tabs C11), segmented pills (Linear, Calendly), saved views dropdown (Attio, Twenty, Plane).
- Applied filters shown: inline in the pill (Stripe), separate shaded strip (Navattic), chip row (Notion Mail).
- Rec: one-row toolbar, text/ghost buttons, single primary action in PageHeader not toolbar; segmented pill or underline tabs for 3–5 saved scopes with counts; applied filters inline as chips + "Clear" text link. **High.**

**Bulk selection**
- Floating bottom-centre bar: Linear (white, shadow), Hotjar (white, shadow), ClickUp (dark) → 3 apps. Bottom-left fixed footer: Typeform-style (seen, not in inventory). Toolbar swap at top: Xero (buttons above table) → 1.
- All include count + clear ✕; Hotjar adds "Select all N".
- Rec: floating bottom-centre bar, white with 1px border and the **only** shadow-ish elevation we allow (small); content "N selected · Select all N · actions · ✕". Destructive action red outline. **Med-high.**

**Pagination vs infinite**
- Numbered/prev-next footer: Navattic (rows-per-page + "1-6 of 6 Previous Next"), Calendly, Xero → 3 apps. Count only + infinite/virtual: Stripe ("6 results"), Attio ("13 count"), Retool ("1,779 records"), Linear, Plane → 5 apps.
- Rec: for our data sizes (tens–hundreds of rows): show total count; use simple "Previous / Next" + "1–25 of 132" footer, left-aligned rows-per-page optional. No numbered page buttons. **Med.**

**Empty states**
- In-frame (headers retained, centred icon + title + one line + 1 button): Navattic C07, Twenty, Rox, Salesforce → 4 apps. Whole-area centred no headers: Snowflake, Unify → 2.
- Filtered-empty with "Clear filters": Delphi C13 → 1 (clearly better).
- Illustration style: small monochrome outline icon (Navattic, Delphi, Snowflake, Unify) > coloured illustration (Twenty, Salesforce).
- Rec: keep headers, small grey line icon (24–32px), 14px semibold title, 13px muted one-liner, one button; separate copy for "no data yet" vs "no results for filters". **High.**

**Master-detail / side panels**
- Right drawer over/next to table: Twenty C12 (peek + "Open" to full page), Lightfield (persistent right details), Gumloop (overlay with dimmed list, prev/next "7/7"), Fresha → 4 apps.
- Inbox 2/3-pane: Notion Mail, Intercom, Front, Lemni → 4 apps.
- Panels separated by 1px border, rarely shadow (overlay ones use shadow + scrim). Detail panels use label/value rows (grey label left, value right, ~28px rows) grouped under small headings with chevrons.
- Rec: competitor/event tables open a right peek panel (~420–480px, 1px left border, no scrim when pushing content) with "Open full page" escalation and prev/next; property list as label/value rows. **High.**

**List items (non-table)**
- Linear, Notion Mail: single-line rows, no dividers, metadata right-aligned in muted grey, grouping headers as faint bands. Intercom/Front: two-line items (title + snippet), selected = white card in a tinted list pane.
- Rec: brief/alert feeds use two-line items without dividers or with hairlines, group by week via faint band headers ("Week of Oct 20 · 5"). **Med-high.**

## Surprises / counter-evidence
- Shadows are not zero: every popover/dropdown (Stripe, Calendly, Retool, Notion) and floating bulk bars use soft shadows; only static surfaces are shadow-free. Hypothesis should say "no shadow on static surfaces; small shadow for overlays".
- Several calm apps (Linear, Calendly, Twenty, Delphi) frame the whole content area as **one** white panel inset on a grey shell (r~8–12). That is a single "page card", not per-section cards — compatible with the hypothesis but a design choice we should make deliberately (shaded sidebar + white canvas vs grey shell + white panel).
- Stripe — the archetype of "understated" — still uses boxed count tabs (mini cards) and coloured filled badges; colour is concentrated in status, not chrome.
- Full gridlines are common (5 apps), but only in editable spreadsheet-like tools; read-only dashboards avoid them.
- Dark primary buttons (near-black) appear in Navattic, Calendly, Delphi — neutral alternative to a coloured primary; worth noting given our blue primary + orange accent risk.
- Pagination footers are less common than expected among modern tools; counts + infinite/virtual scroll dominate.

## ai_usage_notice
none
