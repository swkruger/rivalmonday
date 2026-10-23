# 07 · Visual storyboard

*Twelve annotated frames that apply the system to one fictional, consistent product. They are rendered HTML mockups built only from [component-examples/rm-components.css](component-examples/rm-components.css) and [rm-tokens.css](component-examples/rm-tokens.css), so the storyboard and the specification cannot drift apart. Source HTML: [storyboard/frames/](storyboard/frames/). PNG renders: [storyboard/png/](storyboard/png/).*

**Fictional data used everywhere:** agency *Northpoint Digital* (user Jordan Reyes) → client *Summit Plumbing & Air* (HVAC + plumbing, Denver). Rivals: BlueRidge Heating & Cooling and Apex Comfort Pros (Top rivals), Valley Drain Masters and Rapid Rooter Co. (Worth watching), Cascade HVAC Services and Front Range Plumbing (Minor). Week of Oct 19–25, 2026. No logos, names or screens from the source apps are reproduced; compositions are original and draw only on the generalised patterns in [03](03-cross-application-comparison.md).

**Viewport:** desktop frames use a 1440px-wide canvas (900px tall, or taller where a full page is shown). Phones are 390 × 844. Each frame has numbered pins and notes that cite research IDs (A01…F18, O01…O29, P01…P08) and decision IDs (D-01…D-26).

**Re-render:** the PNGs are full-page Playwright screenshots (Chromium, 1880px-wide viewport, after `document.fonts.ready`; Inter loads from Google Fonts, otherwise system-ui is used). To regenerate one, open the HTML file in Chromium at that width and take a full-page screenshot.

| # | Frame | Design question it answers | Key decisions | Main evidence | Files |
|---|---|---|---|---|---|
| 1 | **Design direction & visual identity** | What does the product feel like, and which values carry that? | D-01, D-06, D-16, D-17, D-18 | Plain O01–O11, Stripe A01, E15/E17 anti-patterns | [html](storyboard/frames/frame-01-design-direction.html) · [png](storyboard/png/frame-01-design-direction.png) |
| 2 | **Application shell** | What does every page inherit? | D-02, D-03, D-04, D-05, D-07, D-12 | A04 Linear, A08/A10 switchers, O01 Plain, B04/B09 | [html](storyboard/frames/frame-02-app-shell.html) · [png](storyboard/png/frame-02-app-shell.png) |
| 3 | **Navigation & page headers** | Where am I, where can I go, what can I do here? | D-03, D-04, D-07, D-08, D-24 | A05, A09, A11, A16, E04, E13 | [html](storyboard/frames/frame-03-navigation-headers.html) · [png](storyboard/png/frame-03-navigation-headers.png) |
| 4 | **Buttons, chips, tabs** | How many control styles, and what states? | D-08, D-09, D-10 | E01, E03, E06, C02, D16; E15, E17 rejected | [html](storyboard/frames/frame-04-buttons-chips-tabs.html) · [png](storyboard/png/frame-04-buttons-chips-tabs.png) |
| 5 | **Content sections & cards** | When is a card justified, and what replaces it otherwise? | D-01, D-11, D-26 | O03, O10, O13, B01, B10, F10; A07 rejected | [html](storyboard/frames/frame-05-sections-cards.html) · [png](storyboard/png/frame-05-sections-cards.png) |
| 6 | **Forms & data entry** | How do fields, errors and saving work? | D-15, D-04 | O01, O05, O07, D01, D08, D13, O21 | [html](storyboard/frames/frame-06-forms.html) · [png](storyboard/png/frame-06-forms.png) |
| 7 | **Tables & dense views** | How dense can we go while staying readable? | D-11, D-10, D-24 | C01–C04, C06, C07, C13, O13, P01 | [html](storyboard/frames/frame-07-tables.html) · [png](storyboard/png/frame-07-tables.png) |
| 8 | **Dashboard / overview** | How does an overview avoid card soup? | D-26, D-12, D-13, D-20 | B01–B05, B09, B10, O10, O12, P06–P08 | [html](storyboard/frames/frame-08-dashboard.html) · [png](storyboard/png/frame-08-dashboard.png) |
| 9 | **Detail page + danger zone** | How does a record page read, and how do we destroy things safely? | D-21, D-14, D-15, D-24 | D09, D10, D15, D16, O04 | [html](storyboard/frames/frame-09-detail-settings.html) · [png](storyboard/png/frame-09-detail-settings.png) |
| 10 | **Responsive (PROPOSED)** | How does the shell adapt at 1024 and 768? | D-23 | F16, F17, F18 only: low evidence, flagged | [html](storyboard/frames/frame-10-responsive.html) · [png](storyboard/png/frame-10-responsive.png) |
| 11 | **Component reference sheet** | Every token and component at a glance | all | — | [html](storyboard/frames/frame-11-component-reference.html) · [png](storyboard/png/frame-11-component-reference.png) |
| 12 | **Final cohesive theme** | Does it all belong to one product? | D-14, D-02, D-12, D-13, D-24 | F03, F06, F08, B01–B03 | [html](storyboard/frames/frame-12-final-theme.html) · [png](storyboard/png/frame-12-final-theme.png) |

## Frame notes

**Frame 1 — Design direction.** A board, not a screen. It sets five principles and a "we avoid" list, then a colour story grouped by job (frame and text ≈ 90% of pixels; brand and action; status; charts). It also shows a type ramp written in product language, a radius ladder, the three elevation levels, and a cropped product vignette that uses only those values.

**Frame 2 — Application shell.** The baseline: the #F6F9FC frame holds the top bar and sidebar, with one white sheet beside it. In the top bar, the agency identity and `/ Summit Plumbing & Air ⇕` provide the context, and the orange Ask Friday pill is the bar's only colour. The sidebar leads with Ask Friday (decided), then Overview, Weekly briefs and Alerts, a *Monitor* group and a *Client* group. The page shows the PageHeader with freshness meta, a segmented range, one secondary and one primary button, a KPI strip and the "What changed" feed.

**Frame 3 — Navigation & headers.** The context switcher is open (search, agency, clients, ✓ on the current one). It also shows sidebar states (active, hover, child items with counts) and the settings drill-in nav ending with *Danger zone*. Two header variants appear: standard (Local rankings: description, meta, tabs with counts, one primary "Scan now") and compact (Website changes: inline tabs, toolbar with an applied filter chip, segmented layout switch). The Ctrl K palette groups Competitors, Pages and Actions, and its last row hands off to Friday.

**Frame 4 — Controls.** A button matrix of 5 variants × default, hover, focus, disabled and loading, plus sizes 28/36/44, icon buttons with a tooltip, and a split button. It shows every chip, badge, dot, tag, tier mark, count and delta, and the Friday pill and label. Underline tabs and segmented controls sit side by side to show the "navigate vs switch" rule. A do/don't panel rejects rainbow pills (E15) and amber warnings that impersonate Friday (E17).

**Frame 5 — Sections & cards.** Six containers in order of preference: (1) section on white, (2) sections split by spacing, (3) ruled sections, (4) a subtle band for "Where you stand", (5) a justified card grid of *suggested competitors to pick*, with a selected state, (6) a functional frame holding a table with a toolbar. A crossed-out "card soup" example shows what this replaces.

**Frame 6 — Forms.** The client settings drill-in shows *Business profile* in a 640px column: labels above, a required marker and "Optional", a disabled field with an explanation, an `https://` prefix field with the focus ring, radio tiles, a checkbox grid, an email error with a fix-it message, a textarea with a counter, auto-saving switch rows ("Saved automatically") and the dirty-state save bar.

**Frame 7 — Tables.** The Competitors page uses the compact header with tier tabs. The toolbar has search, an applied filter chip, "+ field" chips, Clear, sort, columns and export. The flush table has business avatars with a domain sub-line, tier marks, tabular numbers, a magnitude bar, dot status and relative time. The frame shows two rows selected under the floating inverse bulk bar, plus a hovered row with its "⋯" menu open (shortcuts, destructive item last). Below are the filtered-empty state (headers kept) and a framed compact (32px) table inside a mixed page.

**Frame 8 — Dashboard.** The Overview leads with Friday's weekly summary band, every claim carrying a citation pill. Below it come the KPI strip (red delta on map rank because higher is worse), a "Trends" filter row (Compare: Top rivals chip + range), and a 2×2 hairline chart grid: map rank lines (you, BlueRidge, Apex, the rest grey, direct labels), review velocity against the market's middle-50% band, a share-of-visibility ranked legend, and rating vs market (band + median + you). The page ends with Recent activity beside a framed competitor scorecard.

**Frame 9 — Detail + danger zone.** The BlueRidge record has a 40px business avatar, a website link, a tier mark and a freshness line, and **no primary button** (Compare + contextual Friday pill + ⋯). Tabs with counts lead to a *Why it matters* grey panel (Friday label, cited prose), a day-grouped changes feed, and the ads framed list. The 320px aside separated by a divider holds property rows with Summit's figures as muted context, an inline tier select, *Tracked by* and dated *Sources*. Below: the client settings danger zone (Pause before Stop; only the trigger text is red) and the type-to-confirm dialog.

**Frame 10 — Responsive (proposed).** Breakpoint diagrams for ≥ 1024, 768–1023 and < 768, plus three phones: Overview (Friday summary, KPI 2×2, feed, bottom tab bar with orange Ask Friday), Competitors as 64px stacked rows with scrolling tier chips, and a Friday answer whose citation opens a sources bottom sheet. A warning alert states that the evidence is thin.

**Frame 11 — Reference sheet.** Colour tokens with names and hex, type scale, spacing bars, radius set, elevation set and every component, each labelled with its class and key tokens.

**Frame 12 — Final cohesive theme.** The Overview, in compact form, with the Friday panel docked (400px, border, no shadow): conversation title, the user's question in a muted bubble, a flat answer with citation pills, a dated sources list, feedback icons, ↳ follow-ups, and a composer with the "Summit · 6 rivals" scope chip and disclaimer. An inverse toast "Brief shared with Summit's owner · Undo" sits bottom-left. Nothing on this frame uses a style that isn't in Frames 1–11.

## How the storyboard should guide implementation

1. Build **Frame 2's shell** first. Every other frame assumes it.
2. Use **Frame 11** as the acceptance reference for primitives (pixel sizes, radii, states).
3. Build **Frame 8 → Frame 12** as the validation slice: Overview + Friday is the product's core loop and exercises nearly every component.
4. Treat **Frame 10** as a hypothesis: prototype it and test it on phones before committing.
5. When a new page doesn't match a frame, choose the closest layout archetype (L1–L7 in [05](05-design-system-specification.md) § 4) and reuse its frame's components. Don't design a new pattern.
