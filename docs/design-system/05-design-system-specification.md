# 05 · Design system specification

*Rival Monday design system v1 — **adopted 2026-10-23 (owner mandate); binding for all UI**. The binding values live in [design-tokens.json](design-tokens.json); this document explains them. Component detail is in [06](06-component-catalog.md), build guidance in [08](08-implementation-guide.md) and the reasoning in [04](04-design-decisions.md).*

**The system in one sentence:** a calm, neutral frame with one white sheet, where content sits in sections rather than cards and colour appears only when it means something: action, selection, status, data, or Friday.

---

## 1. Design principles

| # | Principle | In practice |
|---|---|---|
| P1 | **Hierarchy comes from type and space first, colour and boxes last.** | Before adding a border, try a heading, a 40px gap or a rule. A page should read correctly in greyscale. |
| P2 | **One sheet, many sections.** | The shell draws one white sheet. Inside it, a section is the default container. Frames are functional; cards are for independent objects only (D-01). Never nest containers. |
| P3 | **Separate regions with surfaces, not lines.** | Frame #F6F9FC against the white sheet; a `surfaceSubtle` band inside the sheet. A 1px border only where an edge must be exact (sheet, frame, table header). |
| P4 | **Colour is a signal, never decoration.** | The primary colour = "do this". Primary-soft = "you are here". Four status tints = state. Chart tokens = entities. Orange = Friday. Anything else is ink or grey. |
| P5 | **No evidence, no claim, visibly.** | Every Friday or brief statement carries a citation pill with a source and date, and every pill opens the evidence. Freshness ("Updated 2 hours ago") appears on monitoring pages. |
| P6 | **Dense where people work, roomy where people read.** | Tables, lists and nav at 13px with 40px rows; briefs and Friday answers at 16px/26 in a 680px column. |
| P7 | **One obvious next step.** | At most one primary button per view. Secondary actions are outline or ghost. Destructive actions are red only at the moment of confirmation. |
| P8 | **The same thing looks the same everywhere.** | One button set, one badge grammar, one tab style, one radius scale (4 / 6 / 8 / 12 / full), two shadows. A new page reuses components; no page-specific styling. |
| P9 | **Navigation is predictable and shallow.** | Top bar = where am I (context). Sidebar = where can I go. Tabs = views of this thing. Never more than two visible nav levels; settings drill in. |
| P10 | **Feedback is immediate and quiet.** | Hover fills, a visible focus ring, inline validation, toasts for background saves, skeletons over spinners for content. Motion of 120–200ms, none for reduced motion. |
| P11 | **Accessible by default (WCAG 2.2 AA).** | Text ≥ 4.5:1 (≥ 3:1 for large text); control boundaries and focus ≥ 3:1; status never by colour alone (glyph + text); targets ≥ 24px (44px on touch); everything keyboard-reachable. |
| P12 | **White-label safe.** | Agency colours replace only `brand.primary` and `brand.secondary`. Every other token is fixed, so an agency brand cannot break the hierarchy. Text on the agency primary is computed for contrast. |

## 2. Colour tokens

Source key: **brand** = decided in brand.md / CLAUDE.md · **existing** = already in `packages/ui/src/styles.css` · **new** = proposed here · **reference** = dataviz skill palette. *No value comes from a screenshot sample* (screenshot colours are estimates, in [research/](research/)).

### Surfaces

| Token | Hex | Source | Use |
|---|---|---|---|
| `color.background.app` | #F6F9FC | brand (canvas) | App frame: top bar + sidebar |
| `color.background.sidebar` | #F6F9FC | brand | Same as app; the sidebar is part of the frame |
| `color.background.surface` | #FFFFFF | brand | Content sheet, overlays, frames, cards |
| `color.background.surfaceSubtle` | #F6F9FC | brand | Bands inside the sheet, framed table header, save bar, mobile bands |
| `color.background.muted` | #EEF2F6 | brand | Grey panels with dark text: "why it matters", user chat bubble, reply block, segmented track, neutral badge |
| `color.background.interactive` | #EEF2F6 | existing | Hover: rows, nav, menu items, ghost buttons |
| `color.background.selected` | #E3F2FC | brand (primary-soft) | Active nav, selected row, applied filter chip |
| `color.background.inverse` | #0B2540 | brand (ink) | Toast, bulk bar, tooltip |
| `color.background.scrim` | #0B2540 @ 32% | new | Dialog and sheet backdrop |

### Text

| Token | Hex | Source | Contrast |
|---|---|---|---|
| `color.text.primary` | #0B2540 | brand | 15.5 white · 14.7 canvas · 13.8 muted |
| `color.text.secondary` | #334155 | existing | 10.4 white · 9.2 muted |
| `color.text.muted` | **#5B6B80** | **new** (replaces #64748B) | 5.4 white · 5.2 canvas · 4.8 muted |
| `color.text.inverse` | #FFFFFF | brand | 15.5 on ink |
| `color.text.link` | #1F6FA8 | existing | 5.4 white · 4.7 primary-soft |
| `color.text.onPrimary` | **#0B2540** | new (OD-1) | 5.93 on #47A8E7 |
| `color.text.accent` | #B45309 | brand | 5.0 white |
| `color.text.success` | #166534 | existing | 7.1 white · 6.4 success surface |
| `color.text.danger` | #B91C1C | existing | 6.5 white · 5.7 danger surface |
| `color.text.warning` | #92400E | existing | 6.65 warning surface |
| `color.text.info` | #1F5F8F | existing | 5.9 info surface |

### Borders and focus

| Token | Hex | Source | Use · contrast vs white |
|---|---|---|---|
| `color.border.default` | #E2E8F0 | brand (line) | Sheet edge, frames, section rules, table header line · 1.23 (decorative) |
| `color.border.subtle` | #EDF1F5 | new | Table row dividers, chart grid |
| `color.border.control` | #CBD5E1 | new | Secondary buttons, segmented thumb, filter chips (their label identifies them) · 1.48 |
| `color.border.strong` | **#8796AB** | **new** | Inputs, selects, checkboxes, radios, composer · **3.01 (WCAG 1.4.11)** |
| `color.focus.ring` | **#2A6BAC** | **new** (was primary) | 2px ring + 2px offset · 5.5 white, 5.2 canvas |

### Actions

| Token | Hex | Source | Notes |
|---|---|---|---|
| `color.action.primary` | #47A8E7 | brand · agency-overridable | Primary button fill |
| `color.action.primaryHover` | #2F93D6 | new | |
| `color.action.primaryActive` | #2581C2 | new | |
| `color.action.secondary` | #FFFFFF | new | With `border.control` and `text.primary` |
| `color.action.secondaryHover` | #F6F9FC | new | |
| `color.action.ghostHover` | #EEF2F6 | new | |
| `color.action.danger` | #DC2626 | brand | White text 4.83 · only inside confirmation dialogs |
| `color.action.dangerHover` | #B91C1C | existing | White text 6.47 |

### Status (always with a glyph and text; never colour alone)

| State | Graphic (dot / icon) | Surface | Text on surface | Contrast |
|---|---|---|---|---|
| success | #16A34A (3.3, graphic OK) | #E7F6EC | #166534 | 6.4 |
| warning | **#D97706** + 3px left bar | **#FFF7E6** | #92400E | 6.65 |
| danger | #DC2626 | #FDECEC | #B91C1C | 5.7 |
| info | #2A6BAC | #E3F2FC | #1F5F8F | 5.9 |
| neutral | #5B6B80 | #EEF2F6 | #334155 | 9.2 |

*Warning is deliberately orange-brown and never solid, so it cannot be read as the Friday or priority amber #F5A524 (research E17 clash).*

### Brand (fixed)

`brand.primary` #47A8E7 · `brand.secondary` #2A6BAC · `brand.accent` #F5A524 (wordmark "monday", Friday, priority marker, stars; never a status or series colour) · `brand.fridayPillBg` #F5A524 + `brand.fridayPillText` #3B2300 (7.2) · `brand.primarySoft` #E3F2FC + `brand.primarySoftText` #1F6FA8 (4.7).

### Data visualisation

| Token | Hex | Role |
|---|---|---|
| `color.chart.you` | #2A6BAC | The viewer's own business |
| `color.chart.rival1` | #E05A2B | First highlighted rival |
| `color.chart.rival2` | #14936A | Second highlighted rival |
| `color.chart.context` | #A3B1C2 | All other rivals and peers (2.18: legend + table view required) |
| `color.chart.peerBand` | #EEF2F6 | Market range band |
| `color.chart.grid` | #EDF1F5 | Gridlines |
| `color.chart.axis` | #5B6B80 | Axis labels |
| `color.chart.sequential.*` | #cde2fb → #0d366b | Heatmaps (local-rank grid), from the reference ramp; ordinal use starts at step 250 |

Validation (dataviz skill, `validate_palette.js --mode light --pairs all`): **you + rival1 + rival2 → ALL CHECKS PASS** (worst CVD ΔE 9.0 protan, normal-vision ΔE 18.1, all ≥ 3:1). Adding #6250D6 or #D55181 as a third highlight **FAILED** (normal-vision ΔE 11.4 / 12.7), so the system caps highlights at two.

### Approved foreground / background pairs

| Foreground | On | Ratio | Use |
|---|---|---|---|
| text.primary | surface / app / muted | 15.5 / 14.7 / 13.8 | All body text |
| text.muted | surface / app / muted | 5.4 / 5.2 / 4.8 | Secondary text anywhere |
| text.link / primarySoftText | surface / selected | 5.4 / 4.7 | Links, active nav |
| text.inverse | inverse | 15.5 | Toast, bulk bar, tooltip |
| fridayPillText | fridayPillBg | 7.2 | Friday pill |
| white | action.danger | 4.83 | Destructive button |
| white | brand.secondary | 5.53 | Checkbox, switch, OD-1 alternative |
| ink | action.primary | 5.93 | Primary button label (OD-1) |
| ~~white~~ | ~~action.primary~~ | ~~2.62~~ | Retired by OD-1 |
| ~~text #64748B~~ | ~~muted~~ | ~~4.23~~ | Retired (use text.muted) |

## 3. Typography

**Family:** Inter (brand), with fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Inter is a screen-first grotesque with clear numerals and tabular figures (`font-variant-numeric: tabular-nums`), and it is already loaded via `--font-inter`. Monospace (IDs, URLs) uses the system `ui-monospace` stack; no extra font to load.
**Weights:** 400 regular · 500 medium (labels, buttons, nav) · 600 semibold (headings, active states, KPI values) · 800 wordmark only.

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 30 / 36 | 600 | −0.02em | Brief title, welcome; at most one per page |
| `pageTitle` | 24 / 32 | 600 | −0.01em | PageHeader title |
| `pageTitleCompact` | 18 / 26 | 600 | −0.005em | Data-page title; brief H2 |
| `sectionHeading` | 16 / 24 | 600 | 0 | Section H2, dialog title |
| `subsectionHeading` | 14 / 20 | 600 | 0 | Frame and card titles, H3 |
| `bodyReading` | 16 / 26 | 400 | 0 | Briefs, Friday full page |
| `body` | 14 / 20 | 400 | 0 | Default text, inputs, Friday panel |
| `bodySmall` | 13 / 18 | 400 | 0 | Table cells, nav, menus, descriptions |
| `label` | 13 / 18 | 500 | 0 | Form labels, tabs, chips |
| `button` | 13 / 18 | 500 (primary 600) | 0 | All buttons (sm: 12/16) |
| `caption` | 12 / 16 | 400 | 0 | Helper text, meta, timestamps |
| `groupLabel` | 12 / 16 | 500 | 0 | Sidebar and menu group labels, table headers |
| `kpi` | 24 / 30 | 600 | −0.01em | KPI values (tabular) |
| `mono` | 12 / 16 | 400 | 0 | IDs, URLs |

Rules: sentence case everywhere (no uppercase labels); 12px is the minimum (11px only inside `kbd` hints and the Friday disclaimer); ≤ 70ch line length for prose; numbers right-aligned and tabular in tables.

## 4. Spacing and layout

**Scale (4px base):** 0 · 2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.

| Context | Value |
|---|---|
| Icon ↔ label, button ↔ button | 8 (`space.2`); 6 inside badges and chips |
| Label → input → helper | 6 |
| Field ↔ field | 16 |
| Group ↔ group inside a section | 24 |
| Section ↔ section | 40 (32 + rule for ruled sections) |
| PageHeader → content | 24 |
| Page padding | 32 desktop · 24 tablet · 16 phone |
| Sheet gutter (right, bottom) | 8 |
| Frame / card padding | 16 (frame head 12 × 16) |
| Button padding | 12 (md) · 10 (sm) · 16 (lg) |
| Input padding | 12 horizontal |
| Table cell padding | 12 horizontal; first and last cell 0 when flush, 16 in a frame |
| Sidebar | items 32px tall, 1px apart; groups 16 apart; padding 8 / 12 |

| Layout token | Value |
|---|---|
| Top bar height | 48 |
| Sidebar | 240 expanded · 56 rail |
| Content max-width | 1560 (decided) |
| Form column | 640 |
| Reading column | 680 |
| Friday panel | 400 · peek panel 440 · detail aside 320 |
| Dialog | 400 / 480 / 640 · command palette 600 |
| Breakpoints | sm 640 · md 768 (bottom tab bar below) · lg 1024 (drawer sidebar below) · xl 1280 (panels push above) · 2xl 1536 |

**Grid:** content uses CSS grid with 16px (dense) or 24px (default) gaps; dashboards use 2 columns ≥ 1280, 1 column below; KPI strips use equal columns (3–5) and wrap to 2×2 below 768.

### Page layout archetypes (choose one; don't invent new ones)

| Archetype | Structure | Pages |
|---|---|---|
| **L1 Workspace** | PageHeader (compact) + tabs + toolbar + flush table; optional peek panel | Competitors, Changes, Ads, Reviews, Clients (agency), Alerts |
| **L2 Overview** | PageHeader + Friday summary band + KPI strip + hairline chart grid + feed / framed scorecard | Client Overview, Agency home, Local rankings |
| **L3 Detail** | Header with avatar + tabs + main column ⟂ 320px aside | Competitor detail, client record (agency) |
| **L4 Form** | Drill-in settings nav + 640px column of ruled sections + save bar | All settings, profile, billing |
| **L5 Reading** | 680px column, display title, ruled sections | Weekly brief, starting-point brief, help guides |
| **L6 Conversation** | Friday full page (680px thread + composer) or docked 400px panel | Ask Friday |
| **L7 Setup** | Checklist page (560px list + 240px rail) or centred single-step column | Agency onboarding, client setup wizard, logged-out auth |

## 5. Shape, border and elevation

| Radius | px | Components |
|---|---|---|
| `radius.none` | 0 | Table cells, mobile full-bleed sections |
| `radius.xs` | 4 | Badges, tags, citation pills, count, checkbox, tooltip, business avatar, segmented inner thumb |
| `radius.sm` | 6 | **All controls:** buttons, inputs, selects, nav items, menu items, alerts |
| `radius.md` | 8 | **All containers and overlays:** sheet, frame, card, menu, popover, dialog, toast, composer, bulk bar |
| `radius.lg` | 12 | User chat bubble, mobile bottom-sheet top corners |
| `radius.full` | 9999 | Filter chips, Friday pill, switch, person avatar, status dots, notification bubble |

**Default container radius: 8. Default control radius: 6.** Square: table cells and full-bleed mobile sections. Fully round: only the listed pill-shaped items.

| Border | Width | Colour |
|---|---|---|
| Frame, sheet, divider, section rule | 1 | `border.default` |
| Table row divider | 1 | `border.subtle` |
| Secondary control outline | 1 | `border.control` |
| Input / checkbox / radio | 1 (error: 1 + 1 inset = 2 visual) | `border.strong` / `state.danger` |
| Active tab indicator, selected tile | 2 | ink / `brand.secondary` |
| Alert accent bar (warning) | 3 | `state.warning` |
| Focus ring | 2 + 2 offset | `focus.ring` |

| Elevation | Shadow | z | Used by |
|---|---|---|---|
| base | none | 0 | Sheet, sections, frames, cards, tables |
| sticky | none (border) | 10 | Sticky table header, sticky save bar on mobile |
| panel | none (border) | 20 | Friday and peek panels when overlaying (< 1280: plus scrim) |
| popover | `shadow.overlay` | 30 | Menu, popover, select list, tooltip, command palette, save bar, bulk bar |
| dialog | `shadow.dialog` + scrim | 40 | Dialog, mobile bottom sheet |
| toast | `shadow.overlay` | 50 | Toast |

## 6. Component specifications

Summarised here; the full catalogue with every variant, state and anti-pattern is [06-component-catalog.md](06-component-catalog.md). Priority = how often the component appears across the screenshots and Rival Monday's pages.

| Priority | Components |
|---|---|
| 1 | App shell (top bar, sidebar, sheet) · PageHeader · Button · Tabs · Table · Badge / Dot / Chip / Tag · Section / Band / Frame |
| 2 | Input, Select, Checkbox, Radio, Switch, Field · KPI strip · Feed row · Menu / Popover · Dialog · Toast · Alert · Empty state |
| 3 | Friday panel (message, citation pill, sources, composer, suggestions) · Brief reading view · Segmented control · Bulk bar · Save bar · Peek panel · Command palette · Tooltip · Avatar · Tier mark · Chart frame |

## 7. Interaction conventions

| Interaction | Rule |
|---|---|
| **Hover** | Fill `background.interactive` (#EEF2F6) for nav, menu items, ghost buttons and rows on white (rows use `surfaceSubtle`); primary darkens one step; links underline. 120ms. Never the only signal of interactivity. |
| **Focus** | `:focus-visible` → 2px `focus.ring` #2A6BAC + 2px offset on every interactive element, including table rows that open panels. Never removed. Inside the inverse bulk bar and toasts the ring is white. |
| **Active / pressed** | Primary `primaryActive`; others keep the hover fill. No scale or translate effects. |
| **Selected** | `background.selected` + `primarySoftText` + 600 (nav, chips); checked checkbox (rows); 2px ink underline (tabs); white thumb (segmented); 2px secondary border (tiles). |
| **Disabled** | 45% opacity, `cursor: not-allowed`, no hover; keep it in the tab order only if a tooltip explains why. Disabled inputs use `surfaceSubtle` and muted text. Prefer explaining over disabling. |
| **Loading** | Content: skeleton bars (`muted`) in place of rows and KPIs, without layout shift. Buttons: inline 14px spinner replaces the icon, label stays, width fixed, `aria-busy`. Long jobs (discovery, scans): inline progress row + toast when done. |
| **Success** | Background saves → toast "Saved" (4s). Inline success only when it changes what the user sees. |
| **Errors** | Field: border + icon + message under the field, focus moves to the first invalid field on submit, summary alert at the top for ≥ 3 errors. System: inline `danger` alert with retry. Never only a toast for errors that need action. |
| **Confirmation** | Destructive or irreversible → dialog naming the object and consequence; footer Cancel then Delete (red). High impact (client, agency, billing) → type-to-confirm. Reversible → no dialog; toast with **Undo** (6s). |
| **Tooltips** | Only for icon-only buttons, truncated text and term definitions (glossary). 400ms delay, also on focus; dismiss with Esc; never hold essential information. |
| **Keyboard** | Tab order follows reading order; Ctrl/⌘ K opens the command palette; `/` focuses table search; Esc closes the top-most overlay and returns focus to its trigger; arrow keys inside menus, tabs (roving tabindex), segmented controls and table rows; Enter opens the peek panel; Shift+Click range-selects rows. |
| **Overlays** | One dialog at a time; focus trapped in dialogs and sheets; panels (Friday, peek) don't trap focus at ≥ 1280. Clicking the scrim closes non-destructive dialogs only. |
| **Responsive navigation** | < 1024: hamburger opens the sidebar as a drawer (scrim, focus trap). < 768: bottom tab bar; "More" opens a sheet with the remaining nav. The context switcher stays in the top bar at every size. |
| **Motion** | 120ms for hover and press, 200ms for panels and popovers (`cubic-bezier(.2,0,0,1)`); fades and 4–8px slides only; `prefers-reduced-motion` → no movement, instant fades. |
