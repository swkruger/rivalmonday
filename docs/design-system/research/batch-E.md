# Batch E — Component-level (buttons, chips/badges, tabs, menus, popovers, dialogs, toasts, alerts, avatars, search)

18 screens, 15 apps. Mobbin web previews are ~768 px wide (a ~1440–1560 px viewport scaled by ~0.5), so every px value is estimated at real size (preview px x ~1.9). All colours are estimates.

## Inventory

- **E01 — Stripe · Transactions list (status badges, filter chips, count tiles, column popover)** — [Mobbin](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13) — image_url: https://mobbin.com/api/mcp/short/9IEJAIiL
  - ~1440x900, light; SaaS dashboard, data-heavy enterprise, analytics/reporting
  - Page title + primary/secondary buttons top right, a row of 6 status "count tiles", a filter-chip row, Export / Edit columns buttons, a table, and the Edit columns popover with checkboxes and drag handles.
  - Buttons: primary is filled ~#635BFF (est.) with "+" icon, ~28 px high, ~6 px radius. Secondary "Analyse" is white with a 1 px ~#E3E8EE (est.) border, same height, with a leading icon. Filter chips (Date and time, Amount, Currency…) are **dashed-outline pills** (~24 px, fully rounded) with a leading "⊕" icon and small grey text. They become solid chips with a blue value once set (E02). Status badges are **small rects, ~4 px radius, ~18 px high**, with a tinted fill and a trailing glyph: Succeeded ~#D7F7C2 bg / ~#05690D text with ✓, Failed ~#FFE7F2 / ~#B3093C with ×, Incomplete ~#EBEEF1 / ~#545969 with a clock. Text is ~12 px medium. The count tiles act as segmented tabs: bordered ~8 px radius boxes, with the active one getting a 1.5 px accent border and accent text. The popover is ~8 px radius, has a soft but visible shadow and is ~240 px wide.
  - Distinctive: the status glyph means badges still read without colour. The table has no outer card; it sits on the canvas with hairline dividers.
  - Limitations: the count tiles are fairly heavy (6 bordered boxes).

- **E02 — Stripe · Filter popover + recommendation banner** — [Mobbin](https://mobbin.com/screens/5aba8f78-028a-4ad6-81f1-6ca698a41451) — image_url: https://mobbin.com/api/mcp/short/ZeEczxZh
  - ~1440x900, light; data-heavy enterprise, forms/data entry
  - Inline "Recommendation" banner, an applied filter chip ("Date and time | Last 3 days ▾" with the value in blue), "Clear filters" text link, and a filter popover (select, number input, radio group, full-width primary Apply).
  - The banner is one line, ~36 px, grey ~#F6F8FA (est.) fill, no border, ~6 px radius, a small icon + bold label + body text, a right-aligned text CTA "Install Xero" in accent, and a × close. The popover is ~260 px wide, ~8 px radius, with a medium shadow (~0 4px 16px rgba(0,0,0,.12) est.). Its Apply button is full-width filled accent, ~28 px.
  - Distinctive: the one-line, borderless grey banner is the quietest banner pattern seen. Filter chips double as value display.

- **E03 — Vercel · Deployments list with status multiselect popover** — [Mobbin](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7) — image_url: https://mobbin.com/api/mcp/short/8gm9FC5g
  - ~1440x900, light (a dark variant exists, e9576405); SaaS dashboard, data-heavy enterprise
  - A filter bar of 6 equal **rectangular select inputs** (~36 px, ~6 px radius, 1 px ~#EAEAEA border) with a date range + clear × and a "Status 5/6" select with a coloured dot strip. Then a list inside a 1 px bordered container and a status popover with checkboxes + coloured dots. The sidebar has a "Action Required" alert card with a red ▲ and a full-width secondary button.
  - Status is **not a badge**: an 8 px coloured dot (Ready ~#50E3C2, Error ~#EE0000, Building ~#F5A623 est.) followed by plain ~13 px text. Secondary tags ("Current" blue, "Rolled Back" red) are tiny pills (~18 px, full radius) with a tinted bg and an icon. Avatars are 20 px circles. The popover has an ~8 px radius and a light shadow + border.
  - Distinctive: dot + text keeps the dense list calm. Colour is used almost only for status. The monospaced branch/commit text adds to the technical feel.

- **E04 — Attio · Record page with tag picker popover** — [Mobbin](https://mobbin.com/screens/3f58982f-fb3f-46de-a123-70350ebfa604) — image_url: https://mobbin.com/api/mcp/short/dH7k906o
  - ~1440x900, light; data-heavy enterprise (CRM), admin/settings
  - Breadcrumb header, three secondary buttons with icons (Add to List, Run workflow, Compose Email), tiny meta chips ("No Connection", "No Interaction"), **underline tabs with count badges** (Activity, Emails, Team 1, Notes 0, Tasks 0, Files), a right panel with Details/Comments tabs, and a tag-select popover with search.
  - Buttons: ~28–30 px, white, 1 px ~#E6E6E9 (est.) border, ~6 px radius, leading icon, 13 px medium. Tabs: 13 px; the active one is dark text with a 2 px dark underline, inactive ones are grey. Counts are plain grey numerals or a tiny ~16 px grey rect. Tags are **compact rects, ~4 px radius, ~20 px high**, with pastel fills (Accounting ~#FDE7E7 / red text, Agriculture ~#FFF4CC / olive, Airlines ~#E8F7D9 / green est.). The popover is ~300 px wide, ~8 px radius, with a light shadow and 1 px border.
  - Distinctive: every row is a 32 px label/value pair with an icon. The meta chips are grey ghost rects with an icon.

- **E05 — Attio · Record activity + list entry (priority chip, stage dot, tag overflow)** — [Mobbin](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a) — image_url: https://mobbin.com/api/mcp/short/8eTVHUy8
  - ~1440x900, light; data-heavy enterprise, project mgmt
  - Activity timeline with attribute diffs (Stage → Meeting), a "Hide all changes" ghost pill button with a blue focus border, tag lists with a "+2" overflow, a Medium priority chip, avatars + names.
  - Stage is shown as **dot + text** (amber dot "Meeting", grey dot "Prospecting"), with no fill. The Priority "Medium" chip is a light green rect at ~4 px radius. Tags (Retail, Food, Restaurants, B2C) are tight rects, ~18 px, with pastel fills and +2 as a neutral rect. Person tokens are a 16 px avatar + name with no chip background. The inline card ("Sales" list) has a 1 px border, no shadow and ~8 px radius.
  - Distinctive: three different chip semantics coexist (dot-status, tinted category tag, people token) and stay legible because each is small.

- **E06 — Linear · Views list with segmented tab control** — [Mobbin](https://mobbin.com/screens/0eb0ef0f-7e0f-4507-a314-86e7924b2b21) — image_url: https://mobbin.com/api/mcp/short/FfN7T0DZ
  - ~1440x900, light; project mgmt, productivity
  - Content panel inset in the canvas (rounded ~8 px, 1 px border), a header with a ghost "+" icon button, a **segmented control "Issues / Projects"**, grouped rows with grey group headers, owner avatars, and a filter icon button.
  - Segmented: ~24 px high, pill-ish (~12 px radius), the active segment gets a ~#F0F0F2 (est.) fill + border, the inactive one is text only. The text is 12 px medium. Group header rows are a full-bleed ~#F4F4F5 band. Avatars are 16 px circles with initials on colour. Icon buttons are ~24 px ghost buttons.
  - Distinctive: extremely low chrome, no shadows. Colour appears only in avatars.
  - Limitations: the low contrast of inactive text can hurt legibility.

- **E07 — Notion · Database view tabs + "New view" menu** — [Mobbin](https://mobbin.com/screens/0b94c9f8-5d71-4d6b-9058-74bf3e9f0b18) — image_url: https://mobbin.com/api/mcp/short/YxsZuOek
  - ~1440x900, light; productivity, CMS
  - View tabs (Table / Dashboard + "+"), the active tab is a **filled grey pill** (~#EFEFEE est., ~6 px radius) with an icon. Icon buttons (filter, settings), a small filled blue "Done" button (~24 px, ~4 px radius, #2383E2 est.). A menu popover lists view types with icons, section labels and a selected-row grey highlight. The sidebar has small grey tag rects ("Meeting instructions").
  - The menu is ~290 px wide, ~8 px radius, with a soft multi-layer shadow and a 1 px subtle ring. Rows are ~28 px with 16 px icons and ~12 px section labels in grey.
  - Distinctive: filled-pill active tab instead of underline; sidebar chips are grey 4 px rects.

- **E08 — Canny · Ideas table with view tabs, filter buttons, field-toggle side panel** — [Mobbin](https://mobbin.com/screens/3557c802-40db-49d2-a908-2db56db7014f) — image_url: https://mobbin.com/api/mcp/short/IqlJTB11
  - ~1440x900, light; data-heavy enterprise, project mgmt
  - Underline view tabs with list icons (All Ideas active, Triage, Backlog, Roadmap, + View). Filter row: "Owner ×" token, "Filter" and "Fields" outline buttons (~28 px, ~6 px radius). Group rows with **count badges** (a tiny bordered square "2", "1"). Status "Open" is a **grey neutral rect** (~4 px radius, ~#F0F0F2 bg, grey text). A right side panel with search and toggle switches (accent ~#525DF4 est.).
  - Distinctive: status left neutral grey when there is no severity to convey. Count badges are bordered squares, not red bubbles.

- **E09 — Qatalog · Filter tokens + searchable multiselect popover** — [Mobbin](https://mobbin.com/screens/a260adc7-8b64-4500-ad1f-d3a2cc1ba673) — image_url: https://mobbin.com/api/mcp/short/ne8XU1QP
  - ~1440x900, light; search/discovery, CMS
  - "Unsaved view ▾" button, applied filter tokens ("Title: contains guide", "People: John D.", "Teams: 1 selected") each as a grey rect chip (~24 px, ~6 px radius, ~#F2F2F2 fill), with the value in blue and a separate × close outside the chip. "+ Filter", "Save" ghost buttons; "Manage ▾" grey button + "Invite" black primary (~28 px, ~6 px radius). The popover has a search input, a "1 selected · Clear" row, a group label, and a checkmark on the selected row (grey highlight).
  - The popover is ~210 px wide, ~10 px radius, with a medium shadow. A blue circular FAB sits bottom right (out of character).
  - Distinctive: a field:value token grammar that is very readable for saved views.

- **E10 — Qatalog · Delete confirmation with typed acknowledgement** — [Mobbin](https://mobbin.com/screens/87535ac9-5efd-4412-a6a3-262ba9009e9c) — image_url: https://mobbin.com/api/mcp/short/tslBMVjo
  - ~1440x900, light; admin/settings
  - Dialog ~520 px wide, ~10 px radius, white on a blurred dim backdrop. A red-outline ⚠ icon top left, a 18 px semibold title, grey "This action cannot be undone.", then a **checkbox "Yes, I want to delete this page"** that gates the action. Footer right-aligned: "Cancel" ghost text, then a **black (not red) "Delete" button with a trash icon** (~26 px, ~6 px radius).
  - Distinctive: severity comes from the icon + checkbox, not a red button, so the palette stays restrained.

- **E11 — Gumloop · Delete confirmation (classic)** — [Mobbin](https://mobbin.com/screens/a2a43ab6-f3b4-4d6c-bd45-28c707ec0e3f) — image_url: https://mobbin.com/api/mcp/short/tLh00iWK
  - ~1440x900, light; admin/settings, AI chat
  - Dialog ~500 px, ~8 px radius, light shadow. Title "Delete Trigger", body names the item in quotes + "This action cannot be undone." A × top right. A **footer separated by a 1 px divider** with Cancel (white outline) and a **solid red Delete** (~#E5102A est., ~28 px, ~6 px radius) on the right.
  - Distinctive: the most common pattern, with the object named in the body. The red is saturated and bright, the one loud element.

- **E12 — Grok · Delete project dialog (outline destructive)** — [Mobbin](https://mobbin.com/screens/c9dfb101-5ee4-47f5-bb8c-cdc282142b43) — image_url: https://mobbin.com/api/mcp/short/EowHjqNa
  - ~1440x900, light; AI chat
  - Dialog ~560 px, **~16 px radius**, almost no shadow over a heavy white-blur backdrop. Footer: Cancel (outline ~#E5E5E5 border) and a **destructive outline button with red text + trash icon** (white fill, red label, ~#F2D0D0 border est.), both ~32 px at ~8 px radius.
  - Distinctive: an outline-red destructive button, a good middle ground between E10 (no red) and E11 (solid red).
  - Limitations: the large radius is softer than our hypothesis.

- **E13 — Amie · Row context menu with shortcuts and danger item** — [Mobbin](https://mobbin.com/screens/a54a24d3-c92b-404b-8145-c2649ba0b79c) — image_url: https://mobbin.com/api/mcp/short/962uREL6
  - ~1440x900, light; productivity
  - Opens from a "…" icon button on the row. The menu is ~170 px wide, ~8 px radius, with a soft shadow + hairline border. Rows are ~28 px with 14 px grey icons and labels at 13 px, plus **right-aligned shortcut hints in grey (D, H, ⌘C, ⌘D)**, submenu chevrons, 1 px dividers between groups, and a last "Delete" item in red with a red icon (and a ⌫ hint).
  - Distinctive: the canonical menu anatomy of icon | label | shortcut/chevron, grouped by dividers, with destructive items last and red.

- **E14 — Todoist · Task context menu with icon-grid groups + cascading submenu** — [Mobbin](https://mobbin.com/screens/4c1351ef-54cc-47ff-aee1-e85019bdad39) — image_url: https://mobbin.com/api/mcp/short/qIVLbBl2
  - ~1440x900, light; productivity
  - The menu (~260 px) mixes normal items (Edit ⌘E, Go to project ⌥G), section labels with shortcut letters (Date T, Priority Y), rows of icon-only choices (date presets, priority flags), and a "Move to…" submenu with a search input and a selected ✓.
  - Radius ~8 px, medium shadow, 1 px border. Icon-only option buttons are ~28 px square with a ~4 px radius.
  - Distinctive: dense quick-set controls inside a menu. Useful for "set tier / mute / assign" style actions on competitor rows.

- **E15 — folk · CRM table with coloured status badges + tooltip** — [Mobbin](https://mobbin.com/screens/926b7a2c-bb35-4b5b-9613-52d580ccea48) — image_url: https://mobbin.com/api/mcp/short/NnVaBWyZ
  - ~1440x900, light; data-heavy enterprise
  - Ghost-outlined **pill buttons** (+ Add people, Email all, Enrich all; ~28 px, full radius, 1 px border) and round icon buttons at right (hide fields "12", filter, sort, search). The table has gridlines. The status column uses **rect badges at ~4 px radius, ~20 px**, in strong pastel fills: Negotiation green, Closed-Lost yellow ~#FDE68A, Closed-Won pink ~#FBCFE8, In Progress orange, New Lead lilac, Accepted blue (all est.). A dark tooltip "Enriched Nov 20, 2024" (~#1F1F1F bg, white 12 px text, ~4 px radius, no arrow).
  - Distinctive: shows what happens when every status gets a hue: a full column of colour pulls attention away from names. Avatar = 16 px circle initial.
  - Limitations: the colour-meaning mapping is arbitrary (Closed-Won pink).

- **E16 — ClickUp · List with tags, status picker and bulk-action bar** — [Mobbin](https://mobbin.com/screens/e9639493-e0a6-46c9-93d1-d3189cbdc3c7) — image_url: https://mobbin.com/api/mcp/short/xQQDjbuS
  - ~1440x900, light; project mgmt
  - Inline tags after titles (dashboard, ui design: ~16 px, ~3 px radius, pastel fills, 11 px text). Priority is flag icon + text, no chip. Avatars are 20 px circles, stacked. A status picker popover with search, info note, grouped sections (Not started / Active / Done) and coloured status circles. A **floating dark bulk-action bar** at the bottom centre ("3 Tasks selected ×" + ghost icon-text actions, a red delete icon), ~40 px high, ~8 px radius, ~#1F1F1F.
  - Distinctive: the dark floating bulk bar is a strong, reusable pattern for multi-select. Many accent colours in one view gets busy.

- **E17 — Square · Inline warning alert above a form** — [Mobbin](https://mobbin.com/screens/0c18f6a3-c97a-484f-b403-99fdfaf41676) — image_url: https://mobbin.com/api/mcp/short/HSoYfIiY
  - ~1440x900, light grey canvas ~#F0F0F0; forms/data entry, admin/settings
  - A full-width **warning alert**: ~48 px, ~#FFF3E6 (est.) pale-orange fill, no visible border, ~6 px radius, an outline ⚠ icon in orange, and one line of ~13 px body text in ink. A black pill CTA "Verify identity" (~36 px, full radius) sits bottom centre, with a "Close" text button at right.
  - Distinctive: an amber banner close to our #F5A524 accent, so a warning tint would collide with the brand accent unless we differentiate.
  - Limitations: the alert itself carries no action. The CTA is detached.

- **E18 — Air · Dark toast, bottom centre** — [Mobbin](https://mobbin.com/screens/079f6e54-e75b-4ec0-9a50-1631834ebf66) — image_url: https://mobbin.com/api/mcp/short/6iAOnk82
  - ~1440x900, light; admin/settings
  - The toast is ~#2B2B2B (est.), ~40 px high, ~6 px radius, with a white ⓘ/✓ outline icon and a one-line 12–13 px white message with no close; it sits ~16 px above the bottom edge, centred. The card behind it uses a ~10 px radius + soft shadow, and a saturated blue full-width button (~36 px).
  - Distinctive: an inverse (dark) neutral toast that works on any brand palette.

**Supplementary (glanced, not counted):** Klaviyo green filled toast, top centre, with × ([Mobbin](https://mobbin.com/screens/edd5d1e3-a036-4831-afd6-0f31beff2e9b)). Whop dark toast, bottom right, green ✓ ([Mobbin](https://mobbin.com/screens/bbd4e248-ff4f-489f-8a57-4e2b5716d737)). Emergent white bordered toasts, stacked bottom left ([Mobbin](https://mobbin.com/screens/c97d67c5-54a4-4c02-89fb-4c6aa0b2ecd9)). Quo full-width pale-blue info banner with a text link ([Mobbin](https://mobbin.com/screens/ea119095-9485-48c2-a7db-660663ccd72f)). Calendly underline tabs, blue 2 px ([Mobbin](https://mobbin.com/screens/2fd0e662-ca84-423a-8cf6-b1be6b68f527)). 15Five dialog with the header + footer in bands and a red-orange Delete ([Mobbin](https://mobbin.com/screens/2d3eb8ce-fb9c-4d3c-b4e8-37d60030118d)).

## Pattern observations (this batch)

### Buttons (hierarchy, styles, sizes)
- **Three styles dominate:** filled primary, white + 1 px border secondary, and ghost/text tertiary. Seen in E01, E02, E04, E08, E09, E11, E13 (7 apps). Black/ink primaries in E09, E10 and E17 (Qatalog, Square, plus HoneyBook/Writer in other results) are as common as brand-coloured ones (Stripe, Notion, Air, Vercel blue). Pills: E15 (folk), E17, Writer. Rectangles at 4–8 px radius: all the others (~11 of 14 apps with visible buttons).
- **Sizes:** the dense tier is ~28 px (toolbar, table header, popover footer) and the default ~32–36 px (forms, dialogs). Nobody uses 40 px+ inside dashboards.
- **Icon placement:** a leading icon on secondary buttons is very common (Stripe Export/Edit columns, Attio, Canny Filter/Fields, Qatalog Delete). The primary often carries "+" for create.
- **Recommendation:** 3 variants (primary filled #2A6BAC or ink, secondary outline, ghost) + destructive. Two sizes (28 / 34 px), 6 px radius, leading 16 px icon. **Confidence: high.** On colour, use secondary #2A6BAC for primary actions. #47A8E7 with white text is weak at 2.6:1, so reserve it for focus/selection. **Med.**

### Icon buttons
- Square ghost buttons at 24–28 px with a hover fill (E06, E07, E08, E13 trigger "…", E15 round). Round only in folk. **Rec:** 28 px square ghost, 6 px radius, tooltip on hover. **High.**

### Button groups / split buttons
- Few true groups. Attio and Stripe space separate outline buttons ~8 px apart (E01, E04). Vercel has a select-like "Status 5/6". Hex (search results, not inventoried) has a split "New project ▾". **Rec:** loose groups of outline buttons. A split button only for "Run now ▾". **Med.**

### Filter chips vs status badges vs tags vs count badges
- **Filter chips:** pill/rounded tokens with "field: value" + × (E01/E02 dashed-to-solid pills, E09 grey rect + ×, E08 "Owner ×"), or plain select inputs (E03). 4 apps use tokens, 1 uses selects. **Rec:** a ~26 px token at 6 px radius: dashed outline when empty, grey fill with the value in secondary blue when set. **High.**
- **Status badges:** three variants. (a) Tinted rect + text, radius ~4 px (Stripe E01, folk E15, Attio priority E05, Canny neutral E08): 4 apps. (b) Dot + plain text (Vercel E03, Attio stage E05, ClickUp status circles E16): 3 apps. (c) Pill with tint (Vercel "Current", Fresha/Vanta in search results). Rects outnumber pills about 2:1 among the B2B tools. Stripe adds a glyph per state for colour-blind safety. **Rec:** dot + text for lifecycle state in dense tables. A tinted rect (4 px radius, 20 px, 12 px medium) + glyph only for states that need attention (failed, needs review), with ≤ 4 semantic hues. **High.**
- **Tags/labels:** small pastel rects at 3–4 px radius (Attio E04/E05, ClickUp E16, Notion sidebar E07), with "+N" overflow (Attio). 4 apps; nobody in this batch uses big pills for tags. **Rec:** neutral grey rect tags by default. Colour only when the user chooses it (e.g. tier). **High.**
- **Count badges:** plain grey numerals beside tab labels (Attio, Vercel sidebar "1" in a tiny amber square) or a bordered square (Canny). Red notification bubbles appear only on bells. **Rec:** grey numeral in a ~16 px neutral rect. **High.**

### Tabs vs segmented controls
- **Underline tabs** for page/record sections: Attio E04, Canny E08, Calendly, ElevenLabs, HoneyBook, Writer, Langdock (7 apps). Active = ink text + 2 px underline (ink in 5, brand blue in 2). Counts sit inline.
- **Filled/segmented** for switching views of the same data: Linear E06 (pill segment), Notion E07 (filled grey tab), Langdock sub-tabs (filled grey rect), GitBook (light/dark icon segments). 4 apps.
- **Count tiles as tabs** (Stripe E01) work for status buckets but are heavy.
- **Rec:** underline tabs (2 px, ink or #2A6BAC) for page sections, and a compact segmented control (~28 px, 6 px outer / 4 px inner radius, grey track, white active segment, no shadow) for view toggles such as Table / Map or This week / 4 weeks. **High.**

### Menus / popovers / tooltips
- Universal anatomy (E07, E13, E14, E16, E09, E04): 8 px radius, 1 px border + soft shadow (the only place a shadow is consistently used), ~28 px rows, a 16 px leading icon, grey section labels, dividers, right-aligned grey shortcut hints, destructive item last in red. Searchable popovers add a top search input + "N selected · Clear". 7 apps.
- Filter popovers (E02, E03, E01) end with a full-width primary "Apply" or apply live (Vercel, Qatalog).
- Tooltips: dark (~#1F1F1F), 4 px radius, 12 px white, no arrow (folk E15). **Rec:** adopt this anatomy exactly. Elevation = border + one soft shadow token used only for floating layers. **High.**

### Dialogs (destructive confirmation, footer order)
- Footer order is **Cancel left, destructive right**, right-aligned, in all 6 dialogs seen (E10, E11, E12, Luma, FLORA, 15Five). The destructive style varies: solid red in 4 (Gumloop, Luma, 15Five red-orange, Cloudflare-like), outline red in 1 (Grok), red text link in 1 (FLORA), and black + checkbox in 1 (Qatalog). Radius 8–16 px. A footer divider is present in Gumloop and 15Five. Every one names the consequence ("cannot be undone"), and the best ones name the object.
- **Rec:** ~480 px wide, 8 px radius, a single soft shadow + dim backdrop (no blur). Title = "Delete <object>?", body names the object and the consequence. Footer: Cancel (secondary) then Delete (solid red ~#C62828 est.). For high-impact deletes (client, competitor with history), add a type-to-confirm or acknowledgement checkbox à la Qatalog. **High.**

### Toasts
- Positions: bottom centre (Air E18, ClickUp bulk bar E16, Aboard), bottom right (Whop, v0), top centre (Klaviyo), bottom left (Emergent). Style: dark inverse (Air, Whop, Aboard) beats coloured (Klaviyo green, v0 blue) and white bordered (Emergent). Heights are ~36–44 px, radius 6–8 px, one line, an optional icon, an × only when the toast persists.
- **Rec:** dark ink toast (#0B2540) at bottom right, 6 px radius, a green/red status icon only, auto-dismiss 4–6 s, with an optional "Undo" text action. **Med** (position is split).

### Alerts / banners
- Inline alert: a tinted fill, no border, 6 px radius, an icon + one line, an optional right text link + × (Stripe E02 grey, Square E17 amber, Quo blue, Basecamp pink). The page-level system banner is a full-width coloured strip (PayPal amber, Care.com green): louder, consumer-ish. Vercel uses a sidebar alert card for "Action required".
- **Rec:** one inline Alert component with neutral / info / warning / danger tints, borderless, 6 px radius, ≤ 2 lines, an optional action link on the right. Reserve full-width strips for billing/trial state. Warning amber must be distinguishable from the brand accent #F5A524: use a paler fill + darker ⚠ icon, or a left 3 px bar. **High.**

### Avatars
- 16–20 px circles in tables (initial on tint, or photo) in Vercel, Attio, Linear, ClickUp and folk (5 apps). People are shown as avatar + name, with no chip background. Stacked avatars overlap by ~4 px (ClickUp). **Rec:** circles for people, **rounded squares (4 px) for businesses/competitors** (Attio does this for companies: "sg" logo square), 20 px in tables / 28 px in headers. **High.**

### Search inputs
- Global search is a grey-filled ~32 px field with a ⌘K/"/" hint (Stripe, Vercel "Find… F", Attio "Quick actions ⌘K"). Local search is a white bordered input with a leading icon (Vanta, Writer, Slack). Popover search is borderless at the top of the menu. Command palettes (Juicebox, Mintlify, Vapi, Navattic) are ~560 px, 10–12 px radius, with grouped results and a keyboard-hint footer. **Rec:** two inputs (filled global with a shortcut chip, outlined local), 6 px radius, ~32 px. **High.**

## Surprises / counter-evidence
- **Shadows are not absent; they are concentrated.** Every popover, menu and dialog uses a soft shadow (E02, E07, E09, E13, E14). Pages and tables are flat. This supports "no shadow on surfaces" but not "no shadow anywhere".
- **Black/ink primary buttons are as common as brand-colour ones** (Qatalog, Square, Writer, HoneyBook, ClickUp "Create"). An ink primary (#0B2540) would make agency white-labelling easier, because the brand colour then only tints accents.
- **Solid red is still the majority destructive style**, but Qatalog (black + checkbox) and Grok (outline red) show restraint is viable.
- **Pills persist for some controls:** folk/Square/Writer use pill buttons, and Linear's segmented control is pill-shaped. Rect chips win for data (tags/status), while pill shapes appear on controls. Mixed radii (4 px chips, 6 px buttons, 8 px popovers, 12 px palettes) is the norm, not one radius.
- Coloured-status-everywhere (folk E15, ClickUp E16, Miro) is visibly noisier than Stripe's or Vercel's restraint, which is direct evidence for our "few accents" hypothesis.
- Amber warning banners (Square, PayPal) collide with our accent #F5A524. Plan a distinct warning token.

## ai_usage_notice
none
