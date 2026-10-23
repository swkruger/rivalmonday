# 08 · Implementation guide

*How to turn this system into the Rival Monday app (`packages/ui`, `apps/web`). The system is **adopted (owner mandate, 2026-10-23)**; the app has not been migrated yet. Agents should work from the concrete [09 playbook](09-ai-implementation-playbook.md). It assumes the normal process (`/rm-kickoff` → spec → lean plan → owner approval → subagent-driven development). Tokens → [design-tokens.json](design-tokens.json); components → [06](06-component-catalog.md); visuals → [07](07-visual-storyboard.md).*

---

## 1. Where the system lands in the codebase

| Concern | File today | Change |
|---|---|---|
| Token variables | `packages/ui/src/styles.css` `:root` + `@theme inline` | Add or adjust the variables in § 2; keep existing names where they already match |
| Agency theming | `packages/ui/src/theme.ts` `themeVars()` | Add computed `--primary-foreground` and a contrast guard (§ 5) |
| Primitives | `packages/ui/src/components/*` (shadcn-based) | Restyle in place: `card`, `button`, `badge`/`status-chip`, `tabs`, `input`/`select`, `dialog`, `table`, `tooltip`, `save-bar` |
| Shell and PageHeader | `apps/web` layout + `PageHeader` | Frame + sheet, sidebar states, header variants |
| Charts | hand-written SVG in `apps/web` | Swap colours to the `chart.*` tokens; cap highlights at 2 |

**Observed today (2026-10-23):** `Card` uses `rounded-[14px] shadow-card` and is rendered 49 times in 29 files; `shadow-card` appears in 58 files; `--radius` is 12px; buttons focus with `ring-ring/50` (primary at 50% ≈ 1.6:1, which fails the focus-indicator rule); `--muted-ink` is #64748B. These are the main sources of drift from the system.

## 2. CSS variables (proposed values for `styles.css`)

Keep the shadcn semantic aliases; change the values underneath. The new variables are kebab-case versions of the token paths.

```css
:root {
  /* unchanged brand tokens */
  --primary: #47A8E7; --secondary: #2A6BAC; --amber: #F5A524; --amber-text: #3B2300;
  --accent-text: #B45309; --ink: #0B2540; --canvas: #F6F9FC; --surface: #FFFFFF;
  --muted-surface: #EEF2F6; --primary-soft: #E3F2FC; --primary-soft-text: #1F6FA8;
  --success: #16A34A; --danger: #DC2626;

  /* changed */
  --muted-ink: #5B6B80;            /* was #64748B (4.23:1 on #EEF2F6) */
  --radius: 0.5rem;                /* was 0.75rem: containers 8px; controls use radius-sm (6px) */

  /* new */
  --text-secondary: #334155;
  --line-subtle: #EDF1F5;          /* table row dividers, chart grid */
  --line-control: #CBD5E1;         /* outline buttons, chips, segmented */
  --line-strong: #8796AB;          /* inputs, checkbox, radio: 3.01:1 */
  --focus-ring: #2A6BAC;           /* was var(--primary): 2.62:1 */
  --primary-hover: #2F93D6; --primary-active: #2581C2;
  --warning: #D97706; --warning-surface: #FFF7E6; --warning-text: #92400E;
  --success-text: #166534; --danger-text: #B91C1C;
  --inverse: #0B2540;
  --chart-you: var(--secondary); --chart-rival-1: #E05A2B; --chart-rival-2: #14936A;
  --chart-context: #A3B1C2; --chart-peer-band: #EEF2F6; --chart-grid: #EDF1F5; --chart-axis: #5B6B80;
  --shadow-overlay: 0 1px 2px rgba(11,37,64,.06), 0 6px 20px rgba(11,37,64,.12);
  --shadow-dialog: 0 2px 6px rgba(11,37,64,.08), 0 16px 40px rgba(11,37,64,.18);
}
@theme inline {
  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;   /* replaces the calc() chain */
  --color-ring: var(--focus-ring);
  --color-input: var(--line-strong);
  --color-line-subtle: var(--line-subtle); --color-line-control: var(--line-control);
  --color-warning: var(--warning); --color-warning-surface: var(--warning-surface); --color-warning-text: var(--warning-text);
  --shadow-overlay: var(--shadow-overlay); --shadow-dialog: var(--shadow-dialog);
  /* --shadow-card: retire after migration (step 3) */
}
```

The `--chip-*` variables stay as they are: they already match the badge tints. Add `--chip-warning-bg: #FFF7E6` only if warning badges should match warning alerts; this guide recommends it.

## 3. Component conventions (what to change)

| Component | Convention |
|---|---|
| `Card` | Becomes the **frame**: `rounded-md border border-line bg-card` with no shadow; padding comes from `CardHeader`/`CardContent` (16px). Add a `variant="interactive"` (hover border-control and surface-subtle) for real cards. Do not add a third style. |
| `Section` (new, tiny) | `section` + `SectionHead` (h2 16/600, desc 13 muted, actions slot); spacing 40px. Most current `Card` usages become `Section`. |
| `Band` (new, tiny) | `rounded-md bg-muted-surface p-4` (or `bg-canvas`). For the Friday summary, "Where you stand" and "Why it matters". |
| `Button` | Variants `default→primary`, `outline→secondary`, `ghost`, `destructive` (dialog only), `destructive-outline`, `link`; sizes `sm` 28, `default` 36, `lg` 44; radius `sm`; focus: `focus-visible:outline-2 outline-offset-2 outline-[--focus-ring]` (no translucent ring). |
| `Badge` / `status-chip` | Rect `rounded-xs h-5 px-1.5 text-xs font-medium` + required `icon` prop; add `DotStatus` for lifecycle. Filter chips are a separate `FilterChip` (pill) so the two can't be confused. |
| `Tabs` / `tabs-link` | Underline variant (2px ink) as the default; add `Segmented` (`role=radiogroup`) for ranges and views. |
| `Input`, `Select`, `Textarea` | `h-9 rounded-sm border-input` (= `--line-strong`); error: `aria-invalid` → `border-danger ring-1 ring-inset ring-danger`; helper and error in `Field`. |
| `Table` | Header 12/500 muted, rows 40px, `border-line-subtle` dividers, no zebra; `numeric` cell prop (right, tabular); `TableFrame` wrapper only for mixed pages. |
| `Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, `Command` | `rounded-md border shadow-overlay` (`shadow-dialog` for dialogs); menu items 32px; tooltip inverse 12px. |
| `SaveBar` | Already the dirty-state bar; restyle to `shadow-overlay`, Discard (ghost) + Save (primary). |
| `FridayBadge` | Keep. Add a `CitationPill` (12px, muted, `rounded-xs`) and `SourcesList`. |
| `PageHeader` | Props: `title`, `description`, `meta`, `actions`, `tabs`, `variant: 'standard' | 'compact' | 'detail'`. One-primary rule enforced in review. |

**Composition rules (enforce in review):** a page = PageHeader + Sections. A Section may contain one Frame (table, rows, preview) or a hairline grid, never a Card holding Cards. Shadows only through `shadow-overlay` or `shadow-dialog`.

## 4. Responsive rules

| Width | Shell | Content |
|---|---|---|
| ≥ 1280 | Sidebar 240 (collapsible to 56); Friday and peek panels push content | Dashboard 2-column chart grid; KPI strip 4–5 |
| 1024–1279 | Same; panels overlay with scrim | Chart grid 2-column → 1 if < 1100 |
| 768–1023 | Sidebar becomes a drawer (hamburger in the top bar); sheet full-bleed, radius 0, no gutter; page padding 24 | Tables scroll horizontally in their own container with the first column sticky |
| < 768 | Bottom tab bar (Home, Alerts, Ask Friday, Briefs, More); top bar = menu, context switcher, avatar; page padding 16 | Sections full-bleed separated by 8px canvas bands; KPI 2×2; tables become list rows; filter chips scroll; popovers become bottom sheets; controls `lg` (44px) |

These are **proposals** (evidence F16–F18 only). Validate on real phones before building them all; the first slice should be the Overview + brief + Friday on a phone.

## 5. White-label safety

- Agencies override only `--primary` and `--secondary` (`themeVars()`), and everything else stays fixed. That keeps hierarchy intact.
- **Add** `--primary-foreground` computed in `themeVars()`: white if contrast(white, primary) ≥ 4.5, else ink #0B2540. For the default #47A8E7 this yields ink (OD-1, resolved).
- **Guard** in branding settings: show the live contrast ("Text on this colour 4.8:1 ✓"). Warn when the secondary colour drops below 3:1 on white, because it drives the focus ring, checkboxes and the "you" series. In that case fall back to ink for the focus ring.
- `chart.you` follows `--secondary`. If an agency's secondary collides with `rival1` or `rival2` (ΔE < 15), switch the rivals to the reference palette's next passing pair, and re-run `validate_palette.js` in a unit test over sample agency colours.

## 6. Accessibility requirements (WCAG 2.2 AA)

| Check | Requirement in this system | Status |
|---|---|---|
| 1.4.3 Text contrast | All text tokens ≥ 4.5:1 on their surfaces (see [05](05-design-system-specification.md) § 2) | ✓ (primary labels ink, OD-1) |
| 1.4.11 Non-text contrast | Input, checkbox and radio boundaries `border.strong` 3.01:1; focus ring 5.5:1; chart series ≥ 3:1 except `context` (legend + table view) | ✓ |
| 2.4.7 / 2.4.13 Focus visible and appearance | 2px solid ring + 2px offset in #2A6BAC on every focusable element; white inside inverse surfaces | ✓ (fixes today's `ring/50`) |
| 1.4.1 Use of colour | Badges carry glyph + text; deltas carry arrow + sign; tier marks differ by shape; chart series by legend + direct labels | ✓ |
| 2.5.8 Target size | Minimum 24px (sm controls are 28px); 44px on touch layouts | ✓ |
| 1.4.4 / 1.4.10 Resize and reflow | Layout works at 320px width and 200% zoom; tables scroll inside their own container | Verify in E2E |
| 3.3.1 / 3.3.3 Errors | Message under the field + `aria-invalid` + `aria-describedby`; summary for ≥ 3 errors; focus to the first error | ✓ |
| 4.1.3 Status messages | Toasts `role=status`; bulk-selection count in a polite live region | ✓ |
| 2.3.3 Motion | `prefers-reduced-motion` disables slides | ✓ |
| Keyboard | All overlays: focus trap or return; roving tabindex in tabs, menus and segmented controls; Esc closes | ✓ |

## 7. Implementation priorities (do in this order)

1. **Tokens only** (one small PR): the § 2 variables, the focus ring, `--muted-ink`, input border, radius scale, shadow tokens. *Biggest effect for the least work; most pages improve with no markup change.*
2. **Shell**: frame + white sheet, sidebar active state, top bar layout (context switcher, Friday pill). One layout file.
3. **Card → Section/Frame migration**: add `Section` and `Band`, restyle `Card` as a frame, then sweep the 29 files and ask "independent object?" for each of the 49 usages. Retire `shadow-card`.
4. **Status grammar**: `DotStatus`, glyph-required `Badge`, `FilterChip`, tier marks.
5. **Overview page** as the validation slice (L2): Friday summary band, KPI strip, hairline chart grid with new chart tokens, feed, framed scorecard.
6. **Tables** (L1 Competitors): toolbar grammar, flush table, bulk bar, peek panel, empty states.
7. **Forms and settings** (L4): field anatomy, save model, danger zone, branding preview + contrast guard.
8. **Friday** (L6): citation pill, sources list, docked panel, composer.
9. **Brief reading view** (L5).
10. **Responsive** (proposed): drawer < 1024, bottom tab bar < 768, after validating on devices.

**Validate early:** after steps 1–2 plus 5, review the Overview with the owner at 100% zoom (light, laptop) and on one phone. If the sheet or frame separation is too faint on the owner's display, raise `border.default` one step (#DCE3EB) rather than adding shadows.

## 8. Acceptance criteria (per page, before merge)

- [ ] Page uses one archetype (L1–L7) and a `PageHeader` with title = menu label; it has a help key (existing rule).
- [ ] No `Card` unless the content is an independent object (selectable, removable or individually actionable); no nested containers.
- [ ] No shadow except on menus, popovers, tooltips, toasts, bulk or save bars, dialogs and sheets.
- [ ] At most one primary button visible; destructive red only inside a confirmation dialog.
- [ ] Only token colours, radii (4/6/8/12/full), shadows (2) and type sizes (12–30 scale); `grep` for raw hex in the diff returns nothing outside `styles.css`.
- [ ] Status uses dot + text or a badge with a glyph; filter chips are pills; no colour-only meaning.
- [ ] Tables: 40px rows, hairlines, no zebra, numbers right-aligned and tabular, empty and filtered-empty states, count + Previous/Next.
- [ ] Forms: labels above, helper or error under the field, 640px column, save model chosen (auto-save or save bar), errors announced.
- [ ] Charts: `chart.*` tokens only, ≤ 2 highlighted rivals, legend + direct labels, table view, no dual axis; palette validated if changed.
- [ ] Friday or brief claims carry citation pills that open evidence; orange appears only for Friday, priority and stars.
- [ ] Keyboard: every action reachable, visible focus ring, Esc closes overlays, focus returns to the trigger.
- [ ] Works at 1440, 1024, 768 and 390 widths (drawer and bottom tab bar where implemented); no horizontal page scroll.
- [ ] E2E affected tests pass; axe has no serious or critical violations on the page.

## 9. Page compliance checklist (quick review card)

```
[ ] Archetype: L1 workspace / L2 overview / L3 detail / L4 form / L5 reading / L6 conversation / L7 setup
[ ] Header: breadcrumb? title = menu label · description · meta · ≤1 primary · tabs ≤7
[ ] Containers: sections first · frame only for table/rows/preview/KPI · card only for independent objects · no nesting
[ ] Elevation: zero static shadows
[ ] Colour: action / selection / status / data / Friday only · no new hex
[ ] Status: dot+text | badge+glyph | pill filter chip | neutral tag | tier mark
[ ] Type: 12–30 scale · sentence case · tabular numbers
[ ] Shape: radius 4/6/8/12/full only
[ ] Data: tables flush or framed per rule · charts ≤2 highlighted rivals + legend + table view
[ ] Evidence: every claim has a citation pill
[ ] A11y: focus ring · labels · errors · targets ≥24px (44 touch) · no colour-only meaning
[ ] Responsive: 1024 drawer · 768 tab bar · 390 no overflow
```

## 10. Validation steps still open

See [04 § Unresolved](04-design-decisions.md#unresolved-assumptions-and-recommended-validation). The most important: an on-device check of the responsive proposal; a real-display check of the sheet and frame contrast; and a contrast guard for white-label colours.
