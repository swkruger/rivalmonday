# 02 · Visual pattern analysis

*What the 136 screens actually do, topic by topic. IDs refer to [01-screenshot-inventory.md](01-screenshot-inventory.md); the detail is in [research/](research/). Counts are of **independent apps**, not screens. Every colour and size is an estimate from previews ("est.").*

How to read this document: each topic lists the **variants observed** with evidence, then **strengths and weaknesses**, then the **implication** carried into [03](03-cross-application-comparison.md) and [04](04-design-decisions.md).

---

## 1. Cards, panels and content sections

**Variants observed**

| Treatment | Where | Apps |
|---|---|---|
| A. Sections directly on the background, separated by spacing, headings and hairlines | A01, A03, A08, A09, A11, A12, B01–B03, B05, B10, B12, C01–C04, C08, C14, D02, D04–D07, D09, D10, D13, D14, D16, F08–F10, F13, F14, O05–O07, O10, O17, O27 | ~30 |
| B. Heading on the canvas + 1px bordered panel below, no shadow | A05, A10, A15, B04, B07, B08, B13, B15, C06, C10, C13, D01, D12, D15, O04, O11, O13 | ~15 |
| C. The whole content area as one inset white **sheet** on a grey frame | A04 Linear, A14 Fibery, C04, C10 Calendly, C12 Twenty, C13 Delphi, D02 Gorgias, D05 Mural, F10, **all Plain screens (O01–O11, P01)** | 9 + owner favourite |
| D. Bordered card grids, no or faint shadow | O03 (catalogue), O09 (editable records), A13 (object tiles), P06–P08 (Mercury widgets), D03 7shifts, F15 Klaviyo reviews | 6 |
| E. Shadowed cards on a grey canvas | A02 (Stripe *edit mode only*), A06/A07/B11 Klaviyo, B14/D08 Shopify, B16 Luma, O14–O16 Amplitude/Causal | 6 |

**Strengths and weaknesses**
- **A** gives the lowest visual noise and the most room for content. Its weakness: a long page can lose structure without strong headings, and dense tables can "float" with no edge.
- **B** gives tables, tabbed panels and grouped settings a clear edge without the weight of a card. It is the majority treatment for *data containers*.
- **C** does the region separation once, at shell level, so nothing inside needs a box. It is the most common treatment among the owner's saved apps.
- **D** is justified only when each box is an **independent object**: it has its own action (O03 "Set up"), it is editable or removable (O09), or the user arranges it (A02 edit mode). Klaviyo A07 shows misuse: five stacked shadowed cards that should be rows in one list.
- **E** reads as heavy and "template-like". The radius is often 10–12px and every widget looks equally important (B11, B14). Stripe A01/A02 is the telling case: **the same widgets drop their cards when the user is not editing the layout.**

**Implication:** default to A inside a C shell. Use B for functional containers and D only for independent objects. Never use E. → D-01, D-02.

## 2. Application shell and page layout

- **Top bar:** full-width in 7 apps (A05–A08, A10, A12, A13, A15 and others). Absent in 6 strong apps (Stripe, Attio, Linear, LangSmith, Fibery, Vercel), where the sidebar owns the top-left context. Products with **multi-level context** (org / project / branch) put slash-separated switchers in a top bar (A08 Neon, A10 Supabase, A09 Vercel strip). Rival Monday has Platform / Agency / Client, so it falls in that group.
- **Sidebar background:** shaded (~#F3–#F8 est.) in A04, A05, A06, A14, B04, B06–B09, B11, B13, C03, C06, C10, C14, C15, D01, D02 and Plain. White with a border in A01, A03, A08, A09, A11–A13, B10, B15 and Mercury P05. **Both are calm. The failure is shading the sidebar *and* the canvas *and* boxing the content** (B06 Semrush, B13 Cloudflare).
- **Widths:** sidebar ~200–240px. Icon rail ~44–56px (A10, B06, B12, C08). A second sub-nav column of ~150–200px appears for settings (D02, D13, D14, O01–O09) or for sub-products (A06, B06).
- **Content width:** dashboards and tables run full width. Forms are 400–720px in every app (D). Reading views are ~560–680px (F06, F10, F13). Onboarding columns are 360–560px (O17, O21, O27, D11, D12).
- **Layout archetypes seen:** full-width data workspace (A03, C01), centred form column (O01, O05, D06), dashboard grid (B01, B04), hairline-ruled stacked report (B02, B05, F10), master–detail with peek panel (C12, C14, C15), record page with right aside (D09, D10), split checkout or sign-up (O18–O20, D04), checklist onboarding (O24, O26), full-page chat (F04, F08), docked assistant panel (F03, F06).

## 3. Navigation

- **Active item:** a soft grey fill with an unchanged label in 6 apps (A03, A08, A10, A13, A06, A16), and in Plain (O01, as a soft blue-grey). A tinted brand fill with brand text in 2 (A11, A12). Brand-coloured text only (A01 Stripe), bold only (A09 Vercel), or a left accent bar (A05, A12). The white-chip-on-grey variant appears in B07, B08, B09 and B14.
- **Group labels:** 11–12px muted. Sentence case in A01, A03, A04, A12 and Plain. UPPERCASE in A08, A09, D04 and Mistral. Spacing only in A11. Collapsible group headers with chevrons in A01, A05, A06 and O01.
- **Icons:** 16px outline icons at ~1.5px stroke, in every app. Counts sit right-aligned in muted text (A04, A11, P01, P02).
- **Settings navigation:** a dedicated grouped sub-nav in 7 apps (D01, D02, D06, D13, D14, D15, O01). Drill-in that *replaces* the main nav ("‹ Back") in A09, A15 and D01. In-page tabs in D03 and D07. A07 Klaviyo's 15-tab bar is the failure mode.
- **Breadcrumbs:** 12–13px muted with `/` separators (A09, A11, A15, D13). Often absent on top-level pages.
- **Workspace / account:** a switcher at the sidebar top (5 apps), slash switchers in the top bar (2), a merged account + workspace menu (A14), or a separate avatar menu at top right (A12, A13, P05).
- **Command palette:** ~560–640px, top-anchored, 8px radius, soft shadow, grouped results with a grey highlight and a key-hint footer (A16 plus 4 noted). Magnific adds "Tab to Ask AI", a hand-off to the assistant.

## 4. Page headers

- **Canonical order** (A05 GitLab, A12, A15, D09): breadcrumb → title with actions on the right → underline tabs → toolbar.
- **Title size splits by page type.** Overview, settings and home pages use 20–28px semibold (A01, A05, A13, O01–O11). Data pages use 14–18px (A03, A07, A11, C03), sometimes with the tabs inline on the title row (A11 LangSmith).
- **Description:** a one-line muted description under the title (A15, O01–O11, D01) is tidy, and Plain uses it on every page.
- **Freshness / meta:** "Updated 4 hours ago" (B01, B06, B15), "Last updated now" (B11), live dot (O13). This matters for monitoring data.
- **Actions:** right-aligned, with **one primary** and the rest outline or ghost (A05, A09, A11, A12, B02).

## 5. Colour

- **Region colours:** frame or sidebar at ~#F3–#F8 (est.) against white content. Warm off-whites appear in Jobber B09, Dash F07, Workable F12 and Perplexity F18. Our brand canvas #F6F9FC is cool, which is equally common.
- **Accent usage:** in calm apps the brand colour appears only on the primary button, links, the active nav item and focus. Stripe's purple appears on links and active nav and nowhere else (A01, B01). Ink or black primary buttons are as common as brand-coloured ones (Plain, Navattic, Calendly, Delphi, Qatalog, Square, Braintrust, Browserbase).
- **Status colour:** concentrated in small badges and dots. Where every status gets its own hue the table turns noisy (E15 folk, E16 ClickUp, C03 Attio tags).
- **Amber collision:** standard warning banners are pale amber (E17 Square, PayPal), close to our accent #F5A524, which is reserved for Friday.
- **AI accent:** purple gradients and ✦ sparkles in F01–F03 and Asana/Plane. Our orange Friday pill already plays that role.
- **Charts:** a single-hue line for "you" plus a grey peer band (B03 Stripe Benchmarking) is the clearest; many similar greens make competitor lines illegible (B07 Peec).

## 6. Typography

- **Family:** neutral neo-grotesque (Inter-like) in every app except brand flourishes (Jasper and Mural serif titles).
- **Sizes seen:** nav 13–14px. Table cells 12–13px. Labels 12–13px semibold or medium. Helper text 11–12px. Page titles 20–28px *semibold* (not extra-bold). Section headings 14–18px semibold. KPI values 18–28px (Stripe regular 18, Vercel semibold 22, Jobber bold 28). Reading views 13–16px body (Linear 13 is small, ChatGPT 14/22, Perplexity mobile 16/24).
- **Numbers:** tabular or monospace in ranked lists and tables (B05, B07, B08, C16).
- **Case:** sentence case wins. Uppercase tracked labels survive only in a few apps (D04, D05, B12) and read as dated.

## 7. Shape, borders, shadows

- **Radii:** buttons and inputs 4–8px (≈ universal, mostly 6). Panels and frames 6–8px. Popovers and menus 8px. Dialogs 8–16px (mostly 8–10). Command palettes 8–12px. Chat bubbles 14–18px. Mobile sheets 16–24px top. Pills (full radius) appear on filter chips (C02, C13), Mercury buttons (O24–O29, P06), segmented tracks (E06) and AI composers (F06, F07, F18).
- **Borders:** 1px ~#E2E8F0–#EAEAEA (est.) for frames and dividers. Inputs are often lighter, ~#D0D5DD (est., about 1.4:1), which **fails WCAG 1.4.11** for the input boundary.
- **Shadows:** on static surfaces, essentially none (A, C, D, F). On floating layers, always: one soft shadow plus a 1px border (A16, C02, C10, C16, E02, E07, E13, E14). Linear's inset sheet carries a hint of shadow (A04), the one exception.
- **Focus:** a 2px coloured ring (O21 Jasper purple, D09 Attio blue).

## 8. Spacing and density

- Rows: tables 28–36px in power tools (8 apps), 44–48px with avatars (C05, C06). Nav items ~28–32px. Menu items ~28px.
- Section gaps ~32–48px. Field gaps ~16px. Label-to-input ~6px.
- The owner's picks (Plain, Mercury) sit at a *medium* density: 13–14px text, ~32–36px controls, generous section spacing, dense lists. Rival Monday's audience (agency staff plus SMB owners) is less power-user than Linear's, so medium density fits.

## 9. Buttons

- **Three styles plus destructive** in 7+ apps: filled primary, white with a 1px outline as secondary, ghost/text as tertiary, and red for destructive (E01, E04, E08, E09, E11, E13, O01, O04).
- **Sizes:** ~28px dense (toolbars, tables, popovers) and ~32–36px default (forms, dialogs). Nobody uses 40px or more inside dashboards.
- **Icons:** a leading 16px icon on secondary actions is common (Export, Filter, Edit columns). "+" on create.
- **Shape:** 6px rectangles in ~11 of 14 apps. Pills in folk, Square and Mercury.
- **Destructive:** solid red in 4 of 6 dialogs. Outline red in Grok (E12). Black plus an acknowledgement checkbox in Qatalog (E10). In billing pages "Cancel plan" is often neutral (D05), but Plain uses one red filled button (O04).
- **Split buttons:** rare (Hex). Button groups are mostly loose outline buttons spaced 8px apart.

## 10. Chips, tags, badges, pills

| Type | Dominant pattern | Evidence |
|---|---|---|
| Lifecycle status in tables | **dot + plain text** | C03, C04, C08, E03, E05, P02 (≥ 5 apps) |
| Attention status | tinted rect, 4px radius, ~20px, **plus a glyph** | E01/C01 Stripe (✓ ✕ clock), C05, B07 |
| Filter chip | outlined pill with ⊕ that becomes an applied chip with a value and ✕ | C02, E02, C13, E09, P02 |
| Category tag | small rect, 3–4px radius, pastel or grey | E04, E05, E07, E16 |
| Count | grey numeral or a small neutral rect | E04, E08, A04 |
| Notification | red bubble only on the bell | A12, A13 |
| Delta / change | tiny tinted pill with arrow and sign, plus "vs previous period" text | B01, B02, B04, B11 |
| Environment / plan | outlined small pill ("PRODUCTION", "Free") | A10, A08, O13 |

Rect badges outnumber pill badges about 2:1 in B2B tools. **Using one shape for filter chips (pill) and another for status (rect) prevents confusing an interactive chip with a passive label.** That confusion is visible in F14, where verb chips look clickable.

## 11. Tabs and segmented controls

- **Underline tabs** for page and record sections: 2px underline, active text in ink, counts inline (A05, A12, A15, D09, E04, E08 + 3). Ink underline in 5 apps, brand blue in 2.
- **Segmented control or filled tab** for switching *views of the same data*: E06 Linear, E07 Notion, O13 Browserbase ("Browser time | Proxy data"), O20 Jasper (billing period), B04 Vercel KPI-tabs.
- **Count tiles as tabs** (Stripe C01) give status buckets and totals at once, but they are heavy.
- **Too many tabs:** A07 (15), B06 Semrush (8). Use sub-navigation instead.

## 12. Forms and inputs

- **Label above** in 13 of 16 D screens and all onboarding screens. Label-left appears only in definition rows (D05, D09) and two-column sections (D13, B15).
- **Inputs** 32–40px, radius 4–8px. Either white with a border (Plain, Gorgias) or filled grey with no border (Mercury O25, O27, O28). The filled style hides the boundary.
- **Help text** 11–12px muted under the field. **Errors**: red border, icon and message below the field (D13, D14, O21 + 3). A page banner is only ever *in addition*.
- **Field width** sized to the content (D14) or the full column (Plain). Two-up rows for name pairs (O22, O25).
- **Choice controls:** switches for instant booleans (D01, O07). Radios inside one bordered group with hairline rows (O07). Selectable tiles with a 1.5–2px brand border when selected (D02, D11).
- **Save models:** auto-save (D01, D09, O05). Per-section footer (D15). Per-field (D14). Dirty-state "Unsaved changes" bar (D08 Shopify). Page Save / Discard (D07). No single model dominates.
- **Danger zones:** a last section or a dedicated page. Red only on the button and in the dialog (D16). Type-to-confirm in D15, Neon and Plane.

## 13. Tables, lists, data-heavy regions

- **Container:** flush on the page in 6 apps (C01, C03, C04, C08, C14, C16, plus O13 and P07). A 1px frame with no shadow in 4 (C06, C10, C11, C13, plus D06). A card in 1 (C05).
- **Header:** 12px medium muted, either plain or a faint tint (split 4–4). Sentence case.
- **Separators:** horizontal hairlines for read-only tables. Full gridlines only in editable spreadsheets (C03, C08, C10, C16). **No zebra striping in any of the 14 apps.**
- **Rows:** hover is a faint grey. Selected is a faint brand tint plus a checked box (C05, C09).
- **Numbers:** right-aligned and tabular (C11, C16, P07).
- **Toolbar (7 apps):** left has view/segment, search and filter. Right has sort, columns and export. Applied filters show inline as chips with "Clear" (C02, P02) or in a shaded strip (C06).
- **Bulk actions:** a floating bar at bottom centre in 3 apps. Dark in ClickUp (C09), white with a shadow in Linear (C04) and Hotjar (C05). Contents: count, "Select all N", actions, ✕.
- **Pagination:** count plus infinite scroll in 5 apps. Prev/next or numbered in 3. Rows-per-page in 3.
- **Empty states:** in-frame with the headers kept, a small grey line icon, title, one line and one button (C07 + 3). Filtered-empty needs its own copy and a "Clear filters" action (C13).
- **Master–detail:** a right peek panel with "Open" escalation and prev/next (C12 Twenty), or inbox panes (C14, C15).

## 14. Dashboards, KPIs and charts

- **Composition:** stacked sections with H2 on the canvas (7 apps) versus a widget grid (5). Stripe's **hairline-divided chart grid** (B01–B03) is the cleanest no-card grid. Plain O10 puts charts straight on the sheet.
- **KPIs:** inline with no boxes (B01, B10, O12), one joined strip with vertical dividers (B04, B09, B12, O13), or separate tiles (B13, B06, O16). Tiles earn their place only with sparklines.
- **Deltas:** a tinted pill with arrow (5 apps) plus a muted comparison caption. Percentile or rank badges for peer comparison (B03).
- **Chart styling:** 1.5–2px lines, ≤3 faint gridlines or none, first and last x labels, legend above, crosshair tooltip (B04). A dashed line for partial periods (B04, O16). Previous period lighter (B02).
- **Domain fit:** B03's neutral peer band with the subject's line in colour, and B05's ranked legend acting as a leaderboard, map directly onto "you vs rivals". B06 Semrush's generated **Summary** next to the KPIs supports leading the overview with Friday's summary.

## 15. Overlays: menus, popovers, tooltips, dialogs, toasts, alerts

- **Menus and popovers:** 8px radius, 1px border plus a soft shadow, ~28px rows, 16px leading icon, grey section labels, dividers, right-aligned shortcut hints, destructive item last in red (E07, E13, E14 + 4). Searchable variants add a search input and "N selected · Clear".
- **Tooltips:** dark, 4px radius, 12px white text, no arrow (E15).
- **Dialogs:** ~480–560px, 8–12px radius, dim backdrop. The footer is **Cancel left, destructive right** in 6 of 6. The body names the object and the consequence.
- **Toasts:** dark inverse in 3 apps, coloured in 2, white in 1. Position varies (bottom centre, bottom right, top centre).
- **Alerts:** a tinted fill, no border, 6px radius, icon plus one line, optional action and ✕ (E02, E17, A15). Full-width system strips only for billing or trial state.

## 16. Friday-relevant: assistant, citations, briefs, feeds

- **Placement:** full page with history (F04, F07, F08, F09). Docked right panel with a border and no shadow (F03, F06). A floating shadowed overlay (F01, F02) covers the data.
- **Messages:** in all 7 chat apps the user's message is a right-aligned grey bubble (14–18px radius) and **the assistant's answer is flat prose with no bubble**.
- **Evidence:** inline per-claim pills (F06, F18; tiny at ~9px), a source-chip row (F04), an "N references" popover (F05), a dated source list (F07), a mobile bottom sheet (F17). A single inline link (F02) is too weak for "no evidence, no claim".
- **Suggestions:** plain divided rows with ↳ (F08, F09, F18) in restrained apps. Tiles and chips in AI-native apps.
- **Composer:** pinned at the bottom. 8–10px radius in B2B apps, pill-shaped in AI-native apps. A scope chip inside the composer (F08) and a disclaimer line (6 of 8 apps).
- **Reading:** one sheet of ~65–70 characters, sections divided by rules (F10), body 13–16px.
- **Feeds:** day groups, sentence grammar ("Actor **verb** object"), a verb or type chip (F14), unread dot, one inline action (F12), quiet days shown explicitly (F13), AI digest pinned on top (F11).

## 17. Onboarding and auth (owner's *Agency and Client Onboarding* collection)

- **Single centred column, no card, no stepper:** O17 Plain, O21–O22 Jasper, O27 Mercury (with a thin progress line).
- **Checklist with the current step expanded inline, plus a side timeline:** O24 and O26 Mercury. Resumable, calm, no boxes.
- **Split screen:** sign-up value panel (O18, O19) and checkout summary panel (O20). Marketing tone is acceptable at the very first step.
- **Card on a grey canvas:** only for logged-out auth (O28, O29 Mercury). Plain and Jasper use no card.
- **In-shell wizard:** Apollo (D12) uses a text stepper and "Next: <step>". Arcade (D11) puts the stepper in the top chrome.

## 18. Mobile and responsive (thin evidence)

- A bottom tab bar with 4–5 items (F16) and a large title. **Full-bleed sections separated by 8px grey bands, no cards** (F16 Squarespace). Most consumer mobile dashboards use rounded cards instead (noted in F, not inventoried).
- Popovers and panels become **bottom sheets** (F17). Rows are ≥ 56pt and header buttons ~44pt.
- Desktop screenshots carry no responsive evidence, so every responsive rule in this system is a *proposal* (D-23).

## 19. Icons and avatars

- 16px line icons at ~1.5px stroke everywhere. 20px in top bars. A 24–40px outline glyph in empty states.
- People are circles (16–28px). Companies are rounded squares (Attio E04, Twenty C12). For a competitor product that sorts businesses from people at a glance.
