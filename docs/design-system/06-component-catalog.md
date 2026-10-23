# 06 · Component catalogue

*Every approved component with its variants, states, sizing, accessibility rules and anti-patterns. Token names → [design-tokens.json](design-tokens.json). Reference CSS → [component-examples/rm-components.css](component-examples/rm-components.css) (class shown as `.rm-*`). Rendered reference → [storyboard Frame 11](storyboard/png/frame-11-component-reference.png). Existing app components are listed so implementers extend rather than duplicate them (`packages/ui/src/components/*`).*

**State legend used in every table:** default · hover · focus (always the 2px `focus.ring` + 2px offset) · active/selected · disabled (45% opacity unless stated) · loading.

---

## Shell

### App shell `.rm-app` · existing: app layout in `apps/web`
- **Use:** every signed-in page. **Structure:** grid `[sidebar 240 | sheet]` under a 48px top bar; frame `background.app`; the sheet is white with a 1px `border.default`, `radius.md`, 8px gutter right and bottom.
- **Variants:** expanded · rail (56px, icons with tooltips) · with Friday panel (third column, 400px) · with peek panel (440px).
- **Responsive:** < 1024 the sidebar becomes a drawer and the sheet goes full-bleed with radius 0; < 768 a bottom tab bar appears (D-23).
- **A11y:** landmarks `header`, `nav[aria-label="Main"]`, `main`; "Skip to content" link first in tab order.
- **Don't:** add a second grey to the sheet; put cards directly on the frame.

### Top bar `.rm-topbar`
- **Contents (left → right):** agency mark + name (white-label; Rival Monday only on platform pages) · context switcher · search (Ctrl K hint) · **Friday pill** · help · notifications (red count bubble) · avatar menu.
- **Context switcher `.rm-ctx`:** slash-separated ghost buttons `Agency ⇕ / Client ⇕`, 28px, 13px/500, business avatar 20px. Opens a `.rm-menu` with search, the current item ✓, recent clients and "All clients". Navigation only.
- **Search:** 32px, white, `border.default`, muted placeholder; opens the command palette.
- **Don't:** add page actions to the top bar; show more than one orange element.

### Sidebar `.rm-sidebar` / nav item `.rm-nav-item`
- **Item:** 32px, `radius.sm`, 16px icon + 13px/500 label in `text.secondary`, optional right count (12px muted). **Hover** `background.interactive`. **Active** `background.selected` + `primarySoftText` + 600 + `aria-current="page"`. **Child** indented 34px, 400 weight.
- **Group label `.rm-nav-label`:** 12px/500 muted, sentence case, optional collapse chevron.
- **Settings drill-in:** "‹ Back to <context>" (`.rm-back`) replaces the main list; groups such as *Workspace: General, Brand, Team, Billing · Advanced: Danger zone*.
- **Don't:** use uppercase labels, coloured icons, left accent bars, or more than 2 nesting levels.

### Content sheet `.rm-sheet` + page `.rm-page`
- Page padding 24 top / 32 sides / 40 bottom; inner max-width 1560 (`.is-form` 640, `.is-reading` 680).

## Page structure

### PageHeader `.rm-pagehead` · existing: `PageHeader` (apps/web)
- **Structure:** `.rm-breadcrumb` (13px muted, `›` separators (core spec §2.7; the storyboard shows `/`, which is superseded); omit at context root) → `h1` 24/32 600 (= menu label) → `.desc` 14px muted, ≤ 70ch → `.rm-meta` (12px muted: live dot "Updated 2 hours ago", period) → actions right (gap 8, ≤ 1 primary, segmented range allowed).
- **Variants:** standard · **compact** (`.is-compact`: 18px title, used with tabs and toolbar on data pages; `.has-tabs` puts the tabs inline on the title row) · detail (40px business avatar + name + website + tier mark, `.rm-detail` main + aside layout, `.rm-props` aside rows).
- **Don't:** put two primaries; repeat the title in a card below; add a coloured header band.

### Tabs `.rm-tabs` / `.rm-tab`
- 40px tall, 13px/500 muted; gap 24; bottom rule `border.default`. **Hover** ink. **Active** ink 600 + 2px ink underline, `role=tab aria-selected`. Count `.count` = neutral 18px rect.
- **Use:** 2–7 sibling views or sub-pages (Overview / Changes / Ads / Reviews / Rankings). Arrow-key roving focus; tabs that change the URL are links.
- **Don't:** use more than 7 tabs, brand-blue underlines, filled tab pills, or tabs to switch a date range (use segmented).

### Segmented control `.rm-seg`
- Track `background.muted`, 2px padding, `radius.sm`; options 24px, 12px/500, `radius.xs`; **active** = white + `border.default` + 600. 2–4 options. `role=radiogroup` (or tablist when it swaps panels).
- **Use:** range (This week / 4 weeks / 12 weeks), view (Table / Map), metric toggles on a chart.

### Toolbar `.rm-toolbar`
- One row, gap 8, margin-bottom 12. Left: view or segment, search (28px, `border.strong`), filter chips, "Clear". Right: sort, columns, export (ghost or secondary sm). Wraps on narrow widths; the primary page action lives in the PageHeader, not here.

## Containers (D-01)

| Container | Class | Look | Use | Never |
|---|---|---|---|---|
| **Section** | `.rm-section` + `.rm-section-head` | No box. H2 16/24 600 + desc 13px muted + right actions (ghost link "See all →"). 40px between sections; `.ruled` adds a 1px rule + 32px | Default for every group of content | Wrapping it in a border "for tidiness" |
| **Band** | `.rm-band` / `.rm-panel-muted` | `surfaceSubtle` or `muted` fill, `radius.md`, padding 16 × 20, no border | Summary (Friday weekly summary), "Where you stand", "Why it matters", tips, nested reply | Holding tables or forms |
| **Frame** | `.rm-frame` (`-head`, `-body`, `-foot`) | 1px `border.default`, `radius.md`, white, no shadow; head and foot divided by rules; foot on `surfaceSubtle` | Tables inside mixed pages, grouped settings rows, KPI strip, live preview, tabbed panel, danger zone row group | Nesting a frame in a frame; framing a single paragraph |
| **Card** | `.rm-card` (`.is-link`) | Frame + padding 16 + hover (`border.control`, `surfaceSubtle`) | Independent objects: suggested competitors to pick, integration catalogue, saved views, selectable plan options | Single rows of a list; KPI tiles; chart wrappers; nested cards |

## Actions

### Button `.rm-btn`
| Variant | Fill / text / border | Hover | Use |
|---|---|---|---|
| `primary` | `action.primary` / `text.onPrimary` 600 / none | `primaryHover`; active `primaryActive` | The one main action of a view |
| `secondary` | white / ink / `border.control` | `secondaryHover` | Everything else that deserves a button |
| `ghost` | transparent / `text.secondary` | `ghostHover` + ink | Toolbars, "See all", icon buttons, low emphasis |
| `danger` | `action.danger` / white 600 | `dangerHover` | Only the confirm button inside a destructive dialog |
| `danger-outline` | white / `text.danger` / `border.control` | `secondaryHover` | Page-level trigger for destructive flows (danger zone) |
| `link` | none / `text.link` | underline | Inline actions in text and alerts |
- **Sizes:** sm 28 (12px, padding 10) · md 36 (13px, padding 12) · lg 44 (14px, padding 16; touch, onboarding CTAs). **Radius** 6. Icon 16px leading, gap 6; icon-only = square (`.icon`) with `aria-label` + tooltip.
- **Loading:** spinner replaces the icon, label stays, width locked, `aria-busy="true"`, click ignored. **Disabled:** 45% opacity; prefer an explanation over disabling.
- **Split button `.rm-btngroup`:** primary + chevron segment (1px divider). Rare; for "Run now ▾" style actions only.
- **Order:** in dialogs and forms, secondary before primary (Cancel, Save) aligned right. In page headers, secondary before primary.
- **Don't:** use more than one primary per view; full-pill buttons; coloured secondary buttons; red buttons outside the confirm step.

### Friday pill `.rm-friday` · existing: `friday-badge.tsx`
- 28px pill, `fridayPillBg` / `fridayPillText`, 12px/700, optional 12px chat icon. **Variants:** `ask` (top bar "Ask Friday", detail "Ask about BlueRidge") · `label` (20px, 11px, marks Friday's messages and summaries).
- **Rule:** the only orange UI element. Per view: the top-bar "Ask Friday" pill, **at most one** contextual ask pill (e.g. "Ask about BlueRidge" in a detail header), and any number of 20px labels. Assistant name comes from agency settings (renamable).

## Status and labels (D-10)

| Component | Class | Spec | Use | States / a11y | Don't |
|---|---|---|---|---|---|
| **Dot status** | `.rm-dot.{success,warning,danger,info,off}` | 8px dot + 13px text (`text.secondary`) | Lifecycle in tables and lists: Active, Paused, Scanning, Error | Text is the meaning; the dot is redundant colour | A dot without text |
| **Badge** | `.rm-badge.{success,warning,danger,info}` | 20px, `radius.xs`, 12px/500, tinted surface + text token, **12px glyph** (✓ ⚠ ✕ ⓘ ⏱) | Attention states: Needs attention, Failed, New, Verified | Non-interactive (`span`); glyph `aria-hidden`, text carries meaning | Pill shape; more than one badge per row; badge as a button |
| **Filter chip** | `.rm-chip` (`.is-add`, `.is-applied`, `.is-selected`) | 28px **pill**, 1px `border.control`, 12px/500; add = dashed + ⊕; applied = `background.selected` + `primarySoftText`, "Field: **value** ▾" + ✕ | Filters in toolbars; quick choices in onboarding | `button` with `aria-pressed` or a menu trigger; ✕ has `aria-label="Remove filter Tier"` | Rect chips (they would look like badges) |
| **Tag** | `.rm-tag` | 20px, `radius.xs`, `muted` fill, `text.secondary` 12px | Categories: Website, Ads, Reviews, service names | Static | Custom colours per tag (v1) |
| **Tier mark** | `.rm-tier.{top,watch,minor}` | 10px square (filled secondary / half / outline) + 12px/600 label | Competitor tier: Top rival / Worth watching / Minor | Shape differs, not only colour | Red or amber for "Top rival" (it's not an error) |
| **Count** | `.rm-count` / `.rm-tab .count` | 18px neutral rect, 11px/600 tabular | Tab and nav counts | `aria-label="3 unread"` where needed | Red count outside the bell |
| **Notification bubble** | `.rm-badge-count` | 16px red full pill, 10px/700 | Bell only | Mirrored in the bell's `aria-label` | Anywhere else |
| **Delta** | `.rm-delta.{up,down}` | 20px, `radius.xs`, arrow + signed value, tinted | KPI change | "Up 0.1 from last week" in `aria-label`; direction is good/bad per metric (a lower map rank is good) | Colour without arrow or sign |
| **Unread dot** | `.rm-unread` | 8px secondary dot | Feed and alerts | Visually hidden "Unread" text | Using red |
| **Citation pill** | `.rm-cite` | 20px, `radius.xs`, `muted`, 12px/500, 11px source icon, "Ads · Oct 22" | Every evidence-backed claim (Friday, briefs, feeds) | `a`/`button` → evidence drawer; `aria-label="Evidence: Google Ads capture, 22 October"` | Shrinking below 12px (F06 anti-pattern); hiding sources behind hover only |

## Data display

### Table `.rm-table` · existing: `table.tsx`
- **Header:** 36px, 12px/500 muted, sentence case, bottom `border.default`; sortable headers show ↕ or ↑/↓ and `aria-sort`; the sorted column turns ink. In a frame the header sits on `surfaceSubtle`.
- **Rows:** 40px (`.is-compact` 32), 13px `text.secondary`, the primary cell in ink 500 with an optional 12px muted sub-line; `border.subtle` dividers; **hover** `surfaceSubtle`; **selected** `background.selected` + checked box; whole-row click opens the peek panel (row is focusable; Enter opens).
- **Cells:** numbers `.num` right-aligned and tabular; magnitude bars `.rm-bar` (6px, `chart.context`, `chart.you` for the client); empty value "—"; row actions in a trailing "⋯" ghost icon (menu).
- **Placement:** flush (L1 workspace pages) or in a frame (inside mixed pages). Horizontal scroll inside its own container on narrow screens, with the first column sticky.
- **Footer `.rm-pager`:** "6 competitors" (or "1–25 of 132") left; Previous / Next secondary sm right.
- **Empty `.rm-empty`:** headers kept; 32px muted line icon; 14px/600 title; 13px muted one-liner; one button. Variants: *nothing yet* ("Add your first competitor") vs *filtered* ("No competitors match these filters" + Clear filters).
- **Bulk bar `.rm-bulkbar`:** floating, bottom centre, 44px, `background.inverse`, `radius.md`, `shadow.overlay`; "2 selected · Select all 6 | actions… | ✕"; `role=toolbar`, announced via a live region.
- **Don't:** zebra stripes, vertical gridlines, per-row outline buttons, a card per row, wrapping a page-level table in a frame.

### KPI strip `.rm-kpis` / `.rm-kpi`
- Frame with equal cells divided by 1px rules (`.is-bare` for no frame on a band). Cell: label 13px muted (+ ⓘ tooltip for definitions) → value 24/30 600 tabular + optional unit (13px muted) + delta → caption 12px muted (comparison or median). 3–5 cells; 2×2 below 768.
- **Don't:** a tile per KPI; colour the value; show a delta without its comparison.

### Chart (SVG) · see D-13 and the dataviz skill
- Sits in a section or hairline grid cell (`.rm-hairgrid`), never in a card. Head: 14px/600 title + 12px muted subtitle; right: segmented toggle or "View table". Footer (optional): "Updated 2 hours ago" + "View more →".
- Marks: 2px lines, 4px-rounded bar ends, ≥ 8px markers; ≤ 3 gridlines `chart.grid`; axis 12px `chart.axis`; legend when ≥ 2 series + direct end labels; partial week dashed; hover crosshair + tooltip (`.rm-tooltip` style, but white surface allowed for rich content); a table view toggle always available.
- **Don't:** dual axes, more than 2 highlighted rivals, rank-based colours, gradients, 3D, legends with only colour.

### Feed row `.rm-feed-item`
- 28px icon tile (`muted`, `radius.sm`) · body 14/20 (entity **bold** + verb + object + citation pill) · meta 12px muted (badge if attention, else tag; relative time) · unread dot · one secondary sm action. Day labels `.rm-feed-day`. Hairline dividers. Explicit quiet state: "No changes from your competitors this week" with a short reason.

### Definition rows `.rm-defrows` and grouped rows `.rm-rows`
- **Definition rows:** label (180px, 13px muted) · value · action (secondary sm); hairlines. Billing, plan, seats.
- **Grouped rows:** one frame, rows ≥ 56px with title 14/500 + description 12px muted + trailing control (switch, select, button). Notifications and preferences.

### Avatar `.rm-avatar`
- People: circle 20 / 28 / 40, initials on `muted` or photo. **Businesses: rounded square** (`.biz`, `radius.xs`) with favicon or initials and a 1px border. Stacks overlap 4px with a 2px white ring. Always paired with a name or `alt`.

## Inputs (D-15)

### Field `.rm-field`
- Label 13/18 500 ink (`.req` red asterisk + "(required)" in the accessible name; `.opt` muted "(optional)") → control → helper 12px muted **or** error 12px `text.danger` with a 14px alert icon (replaces the helper; `aria-describedby` points to whichever is shown; `aria-invalid="true"`).
- Gaps: label → control 6; control → helper 6; field → field 16. Two-up `.rm-fieldrow` only for natural pairs.

| Control | Spec | States |
|---|---|---|
| **Input** `.rm-input` | 36px, 12px padding, `border.strong`, `radius.sm`, 14px; width to content (`.w-sm` 240, `.w-md` 360) or the full 640 column | hover border ink-ish (`text.muted`); focus ring; **error** danger border 2px visual; disabled `surfaceSubtle` + `border.control` + muted text; read-only = plain text, not a disabled input |
| **Affix** `.rm-affix` | prefix/suffix segment on `surfaceSubtle` (https://, $, .com) | — |
| **Select** `.rm-select` | as input + chevron; opens a `.rm-menu` list (searchable when > 8 options) | as input |
| **Textarea** `.rm-textarea` | min 88px, resizable vertically; counter in the helper when limited | as input |
| **Checkbox** `.rm-check` | 16px, `radius.xs`, `border.strong`; checked/mixed = secondary fill + white mark; 24px hit area via the label | focus ring on the box |
| **Radio** `.rm-radio` | 16px circle; on = 5px secondary border | grouped in `fieldset` + `legend` |
| **Radio group in frame** | O07 pattern: one frame, hairline rows, title + description per option | — |
| **Selectable tile** `.rm-tile` | `border.control` 1px; on = 2px `brand.secondary`; icon + title + description | `role=radio` |
| **Switch** `.rm-switch` | 32 × 18, track `border.strong` → secondary when on, 14px thumb | `role=switch aria-checked`; label on the left in grouped rows; auto-saves + toast |
| **Search** `.rm-input-search` | 28px (toolbar) or 32px (top bar); leading icon; "/" shortcut hint | Esc clears |
| **Colour field** | 36px swatch (`radius.sm`) + hex input + contrast hint "Text on this colour: 4.8:1 ✓" | warns below 4.5 |

### Save bar `.rm-savebar` · existing: `save-bar.tsx`
- Appears only when the form is dirty; floats bottom centre of the form column (sticky); "Unsaved changes" + Discard (ghost) + Save changes (primary). `shadow.overlay`. Leaving with unsaved changes → confirm dialog.

## Overlays (D-24)

| Component | Spec | Behaviour | Don't |
|---|---|---|---|
| **Menu** `.rm-menu` · existing `dropdown-menu.tsx` | min 220px, padding 4, `radius.md`, border + `shadow.overlay`; items 32px, 13px, 16px muted icon, right `kbd` shortcut or chevron; labels 12px/500 muted; separators; destructive last in `text.danger` | Arrow keys, typeahead, Esc returns focus | Icons in colour; more than ~10 items without groups |
| **Popover** `.rm-popover` · existing `popover.tsx` | same surface; padding 12–16; filter popovers end with Apply (primary sm, full width) or apply live | Focus moves in; Esc closes | Forms longer than ~5 fields (use a dialog or page) |
| **Tooltip** `.rm-tooltip` · existing `tooltip.tsx` | inverse, `radius.xs`, 12/16, padding 4 × 8, max 240px, no arrow | 400ms delay; on hover and focus; `aria-describedby` | Essential info, interactive content |
| **Dialog** `.rm-dialog` · existing `dialog.tsx`, `confirm-dialog.tsx` | 400 / 480 / 640 wide, `radius.md`, `shadow.dialog`, scrim; body padding 24; title 16/600; text 14 `text.secondary`; footer right: Cancel (secondary) then primary or danger | Focus trap; Esc and scrim close (scrim not for destructive); initial focus on the least destructive action | Stacked dialogs; long forms (use a page) |
| **Type-to-confirm** | dialog + input "Type **Summit Plumbing & Air** to confirm"; the Delete button stays disabled until it matches | For client, agency, competitor-with-history, billing cancel | Using it for reversible actions |
| **Toast** `.rm-toast` | inverse, `radius.md`, `shadow.overlay`, min 44px, 13px, optional status icon + Undo (ghost, white) + ✕ | Bottom right (bottom centre on mobile, above the tab bar); 4s (6s with Undo); `role=status`; pauses on hover or focus | Errors that need action; more than 3 stacked |
| **Alert** `.rm-alert.{info,warning,danger,success}` | `radius.sm`, padding 12 × 16, 13/18, 16px icon; warning has a 3px left bar; optional end link + ✕ | `role=alert` only for errors that appear dynamically | Solid amber; stacking more than 2 |
| **Command palette** · existing `command.tsx` | 600px, top-anchored 15vh, `radius.md`, `shadow.overlay` + scrim; search 44px; groups (Competitors, Clients, Pages, Actions); last row "Ask Friday about '…'" (Tab hand-off); footer key hints | Ctrl/⌘ K; arrows; Enter; Esc | Mixing settings toggles into results |
| **Peek panel** | 440px right, border-left, header (name, prev/next, Open full page ↗, ✕), body = detail content | Push ≥ 1280, overlay + scrim below; Esc closes | Opening on hover |
| **Bottom sheet (mobile)** `.rm-sheet-m` | `radius.lg` top, grab handle, `shadow.dialog` + scrim; max 85vh | Swipe or Esc to close; focus trap | Nested sheets |

## Friday (D-14)

| Part | Class | Spec |
|---|---|---|
| Docked panel | `.rm-friday-panel` | 400px, border-left, white; header 52px: Friday label, scope chip, history, expand-to-page, close |
| User message | `.rm-msg-user` | Right-aligned, max 85%, `muted` fill, `radius.lg`, 14/20 |
| Friday message | `.rm-msg-friday` | Flat; `.who` row = Friday label + "Answered from 6 sources · just now"; 14/22 (16/26 on the full page); lists, bold entity names; citation pills after each claim; tools row (copy, 👍, 👎) ghost icons |
| Sources | `.rm-sources` | Rule above; rows: source icon · title · date right; "Show all 6 sources" |
| Suggestions | `.rm-suggest` | ↳ rows with hairlines, 13px `text.secondary`; 4–6 on empty state, 2–3 after an answer |
| Composer | `.rm-composer` | `border.strong`, `radius.md`; placeholder "Ask about your competitors…"; bar: scope chip (`muted` rect) · attach (later) · send (28px primary square, `radius.sm`, `aria-label="Send"`) |
| Disclaimer | `.rm-disclaimer` | 11px muted centred: "Friday answers only from captured evidence. Check sources before acting." |
| States | — | Thinking: "Reading 12 captures…" with a muted step list (collapsible); refusal/no evidence: "I couldn't find evidence for that" + suggested searches; error: inline danger alert + Retry |

## Reading view (briefs) `.rm-reading`
- 680px column; display title 30/36 + meta (period, "Prepared by Friday", share); sections ruled with 24px padding; H2 18/26; body 16/26; citation pills inline; **Why it matters** = `.rm-why` (`muted` panel, 14/22, bold lead-in); "Where you stand" = band with a bare KPI strip; quiet week = a section saying so plainly.

## Mobile-specific (proposed, D-23)
- `.rm-tabbar`: 64px (incl. 8px safe-area), 5 items, 11px labels, active `primarySoftText` 600, Ask Friday centred.
- `.rm-m-band`: 8px `background.app` separator between full-bleed sections.
- List rows replace tables: 56px+ rows, name + key metric + chevron; filter chips scroll horizontally.

## Global anti-patterns (reject in review)
1. A card around something that is not an independent object.
2. A shadow on anything that does not float.
3. More than one primary button in a view, or a red button outside confirmation.
4. Colour as the only carrier of meaning (status, deltas, chart series).
5. A new radius, shadow, font size or hex value not in the tokens.
6. Uppercase labels, coloured icons, or decorative illustrations in the working UI.
7. Orange anywhere except Friday, priority markers and star ratings.
8. More than two highlighted rivals in a chart.
