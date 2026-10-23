# Batch B — Dashboards, overview, analytics & reporting, charts, KPIs

Source: Mobbin (web), 6 deep searches. 16 screens, 15 apps (Stripe x3, Vercel x2, all others x1). All colours are estimates from low-res previews. Screens seen but not inventoried (used as secondary evidence only): Outseta home, Podia home (dark), TheyDo, SavvyCal analytics (dark), Steep, Wix reports, Hotjar trends, Vimeo, Amplitude, Dub, Adaline, Gumloop, Asana dashboard, Obvious usage, Fiverr keywords, Mintlify analytics.

## Inventory

- **B01 — Stripe · Home "Your overview"** — [Mobbin](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b) — image_url: https://mobbin.com/api/mcp/short/jUlx3M9I
  - ~1440 wide, 16:10-ish; light; SaaS dashboard, analytics/reporting.
  - Nav: slim top bar (search field left ~290px wide, icon buttons right) + left sidebar ~120px@768 (~220–240px real), white, same as canvas, separated by a 1px divider; active item = brand-purple text + icon, no fill.
  - Components: H1 "Your overview"; filter row (Last 7 days / compared to Previous period / Daily — small 1px-bordered buttons, ~4px radius); "+ Add" / "Edit" right; 3-column widget grid: Payments (stacked bar + legend list with amounts), Gross volume (line chart), Net volume, Failed payments list with red "Failed" pills, New customers, Top customers.
  - Visual: canvas #FFFFFF; NO cards — widgets sit directly on white, separated by gutters and a full-width 1px horizontal rule (~#EBEEF1 est.) between widget rows. Widget title ~14px semibold + (i) icon + tiny green delta pill; value ~16–18px regular with grey "previous period" comparison. Lines 1.5px purple ~#635BFF (est.), no gridlines except baseline + top value label, only first/last x-labels ("3 Dec", "Today"). Footer per widget: "View more" link (purple) left, "Updated 06:23" grey right. No shadows.
  - Distinctive: extremely low ink; comparison shown inline as text. Edit mode (seen in sibling screen) turns widgets into bordered white cards with shadow + close X — cards only appear when the layout is editable.
  - Limits: tiny sparse charts are hard to read; widgets lack hierarchy (everything same weight).

- **B02 — Stripe · Billing overview (Revenue tab)** — [Mobbin](https://mobbin.com/screens/a45686d8-0bea-4626-b70b-d432517dce71) — image_url: https://mobbin.com/api/mcp/short/lbR8MUOe
  - Light; analytics/reporting.
  - Nav as B01; page has H1 + tab row (underline active, brand purple) + primary "Create" button + secondary outlined button.
  - Components: dismissible recommendation banner (grey ~#F5F6F8 est. strip, 4–6px radius, no border); filter chips row; 2x2 chart grid of MRR, MRR growth, Net volume, MRR growth rate; "Report downloads" section as a divided list with Download buttons.
  - Visual: 2x2 grid divided by hairlines (1px ~#E6E8EB est.) — a "table of charts", no cards, no shadows. Metric label 12–13px grey-ink, value 18px, delta in a tiny grey pill "+0.0%". Charts: dual series (current solid slate ~#8792A2, previous lighter); stacked bars in muted grey-blue. "Updated 10 Dec, 00:00" bottom right per cell.
  - Distinctive: hairline grid is the cleanest "no-card" chart composition seen. Section heading "Report downloads" 16px semibold followed directly by rows.

- **B03 — Stripe · Billing overview (Benchmarking)** — [Mobbin](https://mobbin.com/screens/21e1c3f3-1b45-4140-a208-4fd250a52533) — image_url: https://mobbin.com/api/mcp/short/KZhnKg5O
  - Light; analytics/reporting; **closest analogue to "you vs peers"**.
  - Components: explainer line; 3 select filters (ARR, ARPU, Business model) with "You: US$0" hints; 2x2 hairline grid. Each cell: metric name + (i) + percentile badge (amber "48th percentile", green "92nd percentile", orange "1st percentile"); "0% · 0% median"; chart = grey peer band (area ~#EEF0F3) + median line slate + "you" line coloured (green/orange).
  - Visual: peer range as a neutral filled band, only the subject coloured — strong pattern for competitor context. Badges are pale-tinted fills with darker text, ~4px radius, ~11px font.
  - Limits: badge colour semantics (orange for 1st percentile) need a legend.

- **B04 — Vercel · Project Web Analytics** — [Mobbin](https://mobbin.com/screens/172f9834-0e6a-4fa8-abd4-6e91b02b5ef4) — image_url: https://mobbin.com/api/mcp/short/923ROjBY
  - Light (dark twin exists); analytics/reporting, data-heavy.
  - Nav: sidebar ~240px, background ~#FAFAFA (est., slightly shaded vs white content), active item = grey fill ~#EDEDED, ~6px radius; top bar with project switcher + centred page title "Analytics"; content canvas ~#FAFAFA too, panels white.
  - Components: env select + date range select (right aligned); one big panel: KPI tabs row (Visitors 13 / Page Views 24 / Bounce Rate 69% + red delta pill) acting as chart selector — active tab white with 2px dark underline, inactive tabs on light grey; area chart beneath; then 2-up panels with inner tabs (Pages/Routes/Hostnames | Referrers/UTM) and bar-in-row lists (light grey horizontal bars behind labels, value right).
  - Visual: panels are bordered (1px ~#EAEAEA), ~8–12px radius, no shadow. Chart: blue ~#0070F3 line, light blue fill, dashed segment for incomplete period, crosshair line + floating tooltip, 3 horizontal gridlines faint. KPI value ~22px semibold, label 12px grey.
  - Distinctive: KPI = tab (metric switcher) — merges KPI row and chart into one unit. Dashed "partial period" segment is honest.

- **B05 — Vercel · AI Gateway Leaderboards** — [Mobbin](https://mobbin.com/screens/684fc9a5-8990-4f93-8fc3-28e1e0750078) — image_url: https://mobbin.com/api/mcp/short/4V3uJYfW
  - Light; analytics/reporting, ranking.
  - Components: H1 + subtitle; section "Top Models" (H2 18px + grey description) with period stepper (‹ 2M ›) and chart-type toggle; full-bleed stacked bar chart (100% share over time, ~10 categorical colours) with ranked legend list on right (rank #, colour dot, name, mono %); section "Top Apps" ranked 2-column list.
  - Visual: no card around the chart — sits directly on white; sections separated only by spacing + H2. Numbers in monospace. Faint grey column backdrop behind bars.
  - Distinctive: "ranked legend" doubles as a leaderboard — directly applicable to competitor share-of-visibility. Limit: 10 saturated hues = noisy; fine for share-of-voice only with muted palette.

- **B06 — Semrush · Position Tracking (AI Visibility landscape)** — [Mobbin](https://mobbin.com/screens/14c7aae9-9529-43c1-805c-f0098bfdb244) — image_url: https://mobbin.com/api/mcp/short/lnKLjACb
  - Light; data-heavy enterprise, analytics/reporting; competitor-monitoring domain.
  - Nav: icon rail (~60px, labelled icons, white) + secondary sidebar (~150px, grey ~#F4F5F7 est., active item grey fill) + breadcrumb row + H1 "Position Tracking: <project>" with dropdown; meta row (engine/location, "Updated: 9 hours ago", Competitors: Add); tab row (8 tabs, underline).
  - Components: domain filter chip, date chip right; cards: left KPI stack (AI Visibility 0%, Mentions 0, Average Position 20.00 — blue value ~20px + sparkline), "Summary" card with generated prose + "Copy all", "Rankings Distribution" with checkbox legend (#1-3, #4-10, #11-20), "Prompts" Top 3/10/20 with New/Lost counts.
  - Visual: canvas grey ~#F0F2F5 (est.), white cards 1px border, ~6–8px radius, no/very faint shadow. Dense; many small (i) icons. Brand blue values.
  - Distinctive: text "Summary" panel next to KPIs = equivalent of our weekly brief; "Updated X hours ago" freshness. Limits: card-on-grey everywhere, visually busy, double sidebar heavy.

- **B07 — Peec AI · Overview (brand visibility vs competitors)** — [Mobbin](https://mobbin.com/screens/ea726eca-9ea2-423c-be52-181b642a04f1) — image_url: https://mobbin.com/api/mcp/short/AM36BLdp
  - Light; analytics/reporting; competitor ranking — **very close to Rival Monday's domain**.
  - Nav: sidebar ~180px grey ~#F7F7F7 (est.), grouped (General/Actions/Project/Company) with 11px grey group labels; active item white fill w/ subtle border. Top: breadcrumb "Overview"; filter bar of small outlined dropdown chips (brand, Last 7 days, All Tags, All Models, All Countries, All Topics).
  - Components: Visibility line chart (multi-line, one per brand, % axis, D/W/M toggle); "Rankings" table (# / Brand w/ favicon / Visibility / Sentiment w/ coloured dot / Position "#1.0"), own brand bold; "Top Domains" table with type pills (UGC, Reference, Competitor); "Domain types" bar-in-row list with % right.
  - Visual: panels white, 1px border ~#E8E8E8, ~8px radius, no shadow; panel header = icon + title 13px semibold + grey subtitle + "Show All ↗" right. Rows ~28px, dense. Pills pastel fills (cyan/purple/red) ~4px radius.
  - Distinctive: section header pattern "Title · description ... Show All" is crisp. Limits: line colours (several greens) collide; too many pastel pill colours.

- **B08 — Profound · Keyword detail / similar keywords** — [Mobbin](https://mobbin.com/screens/e3b23214-75c6-4803-b235-062f3e397e15) — image_url: https://mobbin.com/api/mcp/short/v8EjP1Hl
  - Light; search/discovery, analytics/reporting.
  - Nav: sidebar ~200px light grey ~#F8F8F8 (est.), active item white chip; top bar with back + breadcrumb + centred search + Exact/Phrase toggle; second bar: date range "vs. Previous Period" + segment dropdown chips.
  - Components: section "Similar Keywords" (H2 18px semibold + grey description, no card) then a bordered table: Keyword, Prompt Volume (mono-ish numbers), green delta "+6.3M", inline black bar proportional to volume.
  - Visual: table container 1px border ~#E5E5E5, ~8px radius; row dividers hairline; deltas green text, no arrows/pills. Black inline bars = monochrome magnitude.
  - Distinctive: section heading outside container, data inside — "heading on canvas, table in thin frame". Inline magnitude bars replace a chart.

- **B09 — Jobber · Home (field-service SMB)** — [Mobbin](https://mobbin.com/screens/56a6ce1c-8d71-4c1a-89cb-1d07f075424a) — image_url: https://mobbin.com/api/mcp/short/n0FOi5Kl
  - Light; SaaS dashboard; **target audience match (local service businesses)**.
  - Nav: sidebar ~190px, warm off-white ~#F5F4EF (est.), active item white fill ~6px radius; trial banner strip top (pale blue); right Activity Feed drawer (~210px) overlaying.
  - Components: date + greeting "Good evening, Sam" (~28px bold, dark navy ~#032B3A est.); "Workflow" section: 3 joined segments (Requests/Quotes/Jobs) each with a 3px coloured top border (orange/red/green), big number + status + sub-counts; "To do" list rows (bordered, icon tile, duration pill); "Today's appointments" stat row (Total $200 big, then Active/Completed/Overdue/Remaining inline values) + "View Schedule" button.
  - Activity feed: check/icon glyph, bold actor+verb, italic object, pale yellow status pill, "about 15 hours ago" grey.
  - Visual: content white; groups are bordered (1px ~#E1E1E1) with ~8px radius, no shadow; H2 section titles ~20px bold outside the boxes. Colour used semantically per pipeline stage only.
  - Distinctive: one joined bordered strip for KPIs (dividers between) rather than separate tiles; plain-English labels for SMB owners.

- **B10 — Bonsai · Dashboard** — [Mobbin](https://mobbin.com/screens/34d0f00d-1ca1-4c73-b388-14b96f0b88a9) — image_url: https://mobbin.com/api/mcp/short/3bhTE5dl
  - Light; SaaS dashboard, productivity.
  - Nav: sidebar ~105px@768 (~210 real) white with hairline right border, group labels grey, active = green text + icon.
  - Components: inline stat row (Outstanding / Overdue / Paid & Pending / Other Income — label 11px grey, value ~16px; green for the positive one) with NO boxes; "Upcoming & Overdue Tasks" section (H2 ~16px semibold + (i) + round green "+" action) with divided rows; "Time Tracked" bar chart (grey bars, latest green; dotted baseline; tiny date labels); second inline stat row under chart; right column "Activity" timeline (dot + thin vertical line, bold entity names, grey timestamp, inline "View Email" link).
  - Visual: all white, zero cards, zero shadows; separation by whitespace and hairline row dividers only. Chart has no y-axis.
  - Distinctive: best example of the hypothesis (sections on background). Limit: low density of hierarchy — stat rows can look like disabled text when values are 0 (grey).

- **B11 — Klaviyo · Overview dashboard (Analytics)** — [Mobbin](https://mobbin.com/screens/bdf31fa5-988c-4693-b04e-be5c412d0efd) — image_url: https://mobbin.com/api/mcp/short/TBksxWyN
  - Light; analytics/reporting, marketing.
  - Nav: sidebar ~210px, grey ~#F5F5F5 (est.) shaded vs white content, active item darker grey fill; top bar with centred search ⌘K, notifications, "Account plan".
  - Components: breadcrumb "Dashboards / Overview dashboard" ; filter row (metric select, "Time period" button, comparison text "compared to previous period", "Last updated now", "Add card"); stacked full-width cards with drag handle (⋮⋮), kebab menu: "Conversion Summary" ($0.00 big, "— 0.00% vs. previous period" grey pill delta, legend list Campaigns/Flows, line chart right), "Campaign message performance" (13 recipients, green ">999%" delta pill with arrow, rating chips "Poor").
  - Visual: cards white on very light grey ~#F7F7F7, ~4px radius, **visible drop shadow** (0 1px 3px) — cards justified as draggable widgets. Card title ~18px semibold.
  - Distinctive: delta as pill with arrow + "vs. previous period" text. Limit: large boxes with little data; shadow makes it feel heavier than Stripe.

- **B12 — Gorgias · Statistics / Live overview** — [Mobbin](https://mobbin.com/screens/e4248d94-917f-44e4-a0c3-4f76eea2e385) — image_url: https://mobbin.com/api/mcp/short/Z5SJkNUn
  - Light; analytics/reporting.
  - Nav: icon rail ~35px (grey) + secondary sidebar ~110px@768 (light grey ~#F6F6F6) with collapsible groups (Live, Dashboards, Support Performance...). Page header bar with title + "Learn" button + filter dropdowns right.
  - Components: full-bleed KPI strip — 4 equal cells separated by vertical dividers on grey background ~#EDEDED (est.), uppercase 10px letter-spaced labels + (i), value ~16px centred; date heading "Today, October 24th" (22px light) + grey context text; "Support Volume" line chart with dot legend.
  - Visual: no cards; KPI strip is a tinted band. Chart has dense vertical+horizontal gridlines (~#EEF) and spline lines in pastel purple/orange/green with dots, tooltip w/ shadow.
  - Distinctive: tinted full-bleed KPI band (subtle background separation, no borders). Limit: chart gridlines too dense; spline curves misrepresent discrete data.

- **B13 — Cloudflare · Workers metrics** — [Mobbin](https://mobbin.com/screens/4806b442-2102-4174-9cbd-44939fb9434c) — image_url: https://mobbin.com/api/mcp/short/g19q05TV
  - Light; data-heavy enterprise, analytics/reporting.
  - Nav: sidebar ~240px light grey ~#F7F7F8, grouped (Build/Protect), active = grey fill; top breadcrumb bar; segmented tab group (Overview/Metrics/... boxed active).
  - Components: version select + refresh + time range picker (popover: absolute from/to + quick list "Last 5 minutes...", timezone); KPI tiles row (Requests 76 w/ green "↗7600.00%" + mini sparkline in corner; Subrequests; Errors w/ red underline sparkline; CPU Time); "Active deployment" table; chart panels with chart-type toggle + expand icon.
  - Visual: canvas light grey ~#F5F5F5, white panels 1px border, ~6px radius, no shadow. Dense 12–13px. Stacked bars in multi-hue.
  - Distinctive: KPI tile with embedded spark/underline. Limits: every element boxed → visual noise; typical ops-console density.

- **B14 — Shopify admin · Attribution report** — [Mobbin](https://mobbin.com/screens/4a11d92c-0225-4b80-a80d-4ce328e030f2) — image_url: https://mobbin.com/api/mcp/short/euZattJL
  - Light (dark top bar); analytics/reporting.
  - Nav: dark near-black top bar ~#1A1A1A with centred search; sidebar ~120@768 on grey ~#EBEBEB (est.), active item white fill ~8px radius; content on same grey; white cards.
  - Components: page title with icon + "Channels" dropdown; date preset button "Last 30 days" + granularity "Daily"; date picker popover (preset list left, dual month calendar, Cancel/Apply); line chart card; info banner; table card (Channel, Type, Sessions↓, Sales, Orders, Conversion rate...).
  - Visual: Polaris style — cards ~12px radius, faint shadow + 1px border, generous rounding. Chart lines teal/purple 2px smooth.
  - Distinctive: preset list + dual calendar date picker is the standard. Limit: grey canvas + rounded cards = heavier than hypothesis.

- **B15 — Etsy · Shop Manager Stats** — [Mobbin](https://mobbin.com/screens/4dd27d13-28fd-41e9-aa68-2031480d97c2) — image_url: https://mobbin.com/api/mcp/short/GCJIVj3l
  - Light; analytics/reporting; SMB-owner audience.
  - Nav: sidebar ~130@768 white, bold black icons, active item grey fill; no top bar visible.
  - Components: **two-column section layout** — left column (~150px@768) holds section title (H3 ~14px semibold), "Updated 4 hours ago", and explanatory copy; right column holds the bordered data box (search-terms table with orange inline magnitude bars under each row; pagination; donut "Total visits 21" with legend list + % and counts).
  - Visual: white canvas; data boxes 1px border ~#E0E0E0, ~4px radius, no shadow. Brand orange only for bars; donut colours per social network.
  - Distinctive: "label-left, data-right" settings-style rhythm used for analytics — strong for explaining metrics to non-experts (why it matters). Limit: wastes width on wide screens.

- **B16 — Luma · Event Insights** — [Mobbin](https://mobbin.com/screens/4ea48e2c-8764-41ff-a5d9-2c16d057ba44) — image_url: https://mobbin.com/api/mcp/short/0hUbQy0Z
  - Light; analytics/reporting.
  - Nav: top bar only (no sidebar), page-level tab row; content max-width ~800px centred on very light grey ~#F4F5F6 with faint gradient header.
  - Components: section H2 "Page Views" + subtitle + "Past 7 Days" pill; card with line chart (pink ~#E5307A line, gradient fill) and bottom grey sub-panels: stat triplet (24 hours / 7 days / 30 days values ~20px) and Sources/Cities lists with % right; next section "Registration Referrals".
  - Visual: card white, ~10–12px radius, very soft shadow; lower half tinted grey ~#F5F5F5 to separate summary from chart (subtle background separation inside a card).
  - Distinctive: multi-window stat triplet (24h/7d/30d) instead of delta. Limit: consumer-ish softness.

## Pattern observations (this batch)

**1. Dashboard composition**
- Stacked full-width sections with H2 headings on the canvas: B05, B08, B09, B10, B15, B16, B02 (lower part) — 7 apps.
- Widget grid of equal cells: B01, B02, B03 (hairline-divided, no cards — Stripe), B04, B07, B13 (bordered panels), B11 (stacked draggable cards) — 5 apps.
- Strengths: stacked sections read like a report (good for weekly briefs); grids suit at-a-glance overviews. Recommendation: **overview = 2–3 column grid divided by hairlines (Stripe model); brief/report pages = stacked sections with H2 on canvas.** Confidence high.

**2. KPI / metric presentation**
- Inline stat row, no boxes: B01, B10, B16 (inside card), B09 (appointments) — 4 apps.
- Joined strip with vertical dividers (one container): B04, B09 (workflow), B12 (tinted band), Mintlify/Gorgias — 3–4 apps.
- Separate bordered tiles: B13, B06, (Obvious, Gumloop, Asana, Outseta secondary) — 2 inventoried + 4 secondary.
- Strengths: joined strip = compact, one border, no "card soup"; tile-per-KPI only earns its keep when each has a sparkline (B13). Recommendation: **joined strip with 1px vertical dividers, label 12–13px muted above value 22–28px tabular; optional KPI-as-tab to drive the chart (B04).** High.

**3. Delta / change indicators**
- Tiny tinted pill (green/red/grey, ~4px radius): B01, B02, B04, B11, Mintlify — 5 apps.
- Coloured text only ("+6.3M"): B08, B13 — 2 apps.
- Comparison as grey text "MYR 0.00 previous period" / "vs previous period": B01, B11.
- Percentile/rank badge vs peers: B03. Absolute windows (24h/7d/30d): B16.
- Recommendation: **small tinted pill with arrow + sign, always with a muted "vs last week" caption; neutral grey for 0/no-change.** For competitor context use rank/percentile badges (B03) rather than raw %. High.

**4. Chart containers and styling**
- No container, chart on canvas: B01, B02, B03, B05, B10 (Stripe, Vercel leaderboard, Bonsai) — 3 apps.
- Thin-bordered panel, no shadow: B04, B07, B13, Dub, Hotjar — 4+ apps.
- Shadowed card: B11, B14, B16 — 3 apps.
- Styling consensus: 1.5–2px single-hue line, light area fill optional, 2–4 faint horizontal gridlines or none, first/last x labels only (B01/B02), dot legends above chart (B12, B13, SavvyCal), crosshair tooltip (B04). Previous period as a lighter/dashed series (B02, B04). Peer band in neutral grey, subject in colour (B03) — directly applicable.
- Recommendation: **no box; or 1px border only when a chart has its own toolbar/tabs. Gridlines ≤3 faint, primary #47A8E7/#2A6BAC for "you", greys for competitors/peers, accent only for highlights.** High.

**5. Date-range / filter bars**
- Row of small outlined dropdown buttons directly under H1: B01, B02, B07, B08, B11, B14, B13 — 7 apps. Preset list + dual-month calendar popover: B13, B14, Vimeo, Amplitude, Dub — 5 apps. Comparison control ("compared to Previous period") B01, B08, B11.
- Recommendation: **left-aligned filter row of 32px outlined buttons; presets (This week, Last 4 weeks, 12 weeks) first, calendar second.** Weekly cadence means presets matter more than a calendar. High.

**6. Section headings with actions**
- H2 + grey description + right-aligned link/action ("Show All ↗", "See all", "View more", "+"): B05, B06, B07, B08, B10, B16 — 6 apps; per-widget footer "View more" + "Updated …": B01, B02 (Stripe).
- Recommendation: **H2 16–18px semibold, optional 13px muted description, right slot for one text link or ghost button; freshness "Updated 4h ago" in muted text (B01, B06, B15).** Freshness is important for monitoring data. High.

**7. Activity feeds**
- Right column timeline with dot + vertical rule: B10. Drawer/panel overlay: B09, TheyDo. In-page section: Outseta, Podia.
- Item anatomy consensus: actor bold + verb + object bold, muted relative timestamp on its own line, optional status pill/link. Recommendation: **right-rail or full-width section, no card, hairline-separated rows; entity names bold; relative time muted.** Med.

**8. Card vs no-card**
- No-card / hairline: Stripe (B01–B03), Bonsai (B10), Vercel leaderboard (B05), Gorgias (B12) — 4 apps.
- Thin border, no shadow: Vercel analytics, Peec, Profound, Jobber, Cloudflare, Etsy, Semrush — 7 apps.
- Shadowed cards: Klaviyo, Shopify, Luma — 3 apps.
- Hypothesis largely supported: shadows are minority; but **the majority still uses a 1px-bordered container for tables and tabbed panels.** Recommendation: no cards for KPI rows, charts, sections; 1px-bordered frame (no shadow) for tables and tabbed list panels; shadows only for popovers/menus/drawers. High.

**9. Colour separation**
- Shaded sidebar vs white content: B04, B06, B07, B08, B09, B11, B13 — 7 apps (sidebar ~#F5–#FA, active item = white chip or slightly darker grey). White sidebar + divider: Stripe, Bonsai, Etsy. Grey canvas + white cards: Shopify, Semrush, Cloudflare, Klaviyo.
- Tinted bands inside content (B12 KPI band, B16 lower summary, B02 banner) separate without borders.
- Recommendation: **white content canvas (or #F6F9FC canvas with white only for framed tables—pick one), sidebar slightly shaded (#EEF2F6-ish), active nav item white chip or primary-tinted text.** Med-high.

**10. Typography for numbers**
- KPI values 18–28px, semibold or regular (Stripe uses regular 18px; Vercel semibold 22px; Jobber bold 28px). Labels 11–13px muted; uppercase-tracked labels only in Gorgias. Monospace/tabular for ranked lists (B05, B07, B08).
- Recommendation: **Inter with `font-variant-numeric: tabular-nums`; KPI 24px semibold, chart headline value 18px, table numbers right-aligned tabular.** High.

**11. Radii / borders / shadows**
- Radii: buttons/chips 4–6px (nearly universal); panels 6–8px (Vercel, Peec, Cloudflare, Jobber); 10–12px only in Shopify/Luma. Borders 1px light grey ~#E5E7EB. Shadow only on overlays in 12/16.
- Recommendation: **4px controls, 6–8px frames, 1px #E3E8EE-ish borders, shadow reserved for popovers.** High.

## Surprises / counter-evidence
- Stripe — the cleanest example — **does use bordered, shadowed cards in Edit mode** (customisable dashboard), i.e. cards signal "movable widget". If we ever add customisable overviews, cards become justified there.
- Most competitor/SEO tools (Semrush, Peec, Cloudflare) are boxed-panel heavy; the "no-card" pattern is mainly Stripe/Bonsai/Vercel-leaderboard. A strict zero-container rule may make dense tables float; thin frames for tables are the consensus.
- KPI-as-tab (Vercel) beats a separate KPI row + chart when there's one chart per page — fewer components.
- Etsy's label-left / data-right section layout is a strong fit for SMB owners ("what this means" next to the data) but wastes width at 1560px; could be used for brief sections only.
- Many dashboards show an AI/generated text "Summary" block beside KPIs (Semrush B06) — supports placing a Friday summary at the top of the overview.
- Peer comparison done best by neutral band + coloured subject line (Stripe B03); multi-line per-competitor charts (Peec B07) become unreadable with similar hues → cap highlighted lines to "you + 1 selected rival", rest grey.
- Jobber (target-audience SaaS) uses warm off-white sidebar and bold dark-navy greeting — friendly tone is acceptable to SMB owners; colour coding only for workflow stages.

## ai_usage_notice
none
