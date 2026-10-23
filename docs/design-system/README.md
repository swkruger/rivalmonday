# Rival Monday design system v1: research and specification

*UI and theme research from Mobbin (2026-10-23). **Status: adopted — the owner's mandate for all UI (2026-10-23); OD-1…OD-5 resolved as recommended. Application code has not been migrated yet: follow [09](09-ai-implementation-playbook.md).** Start with this page; the numbered documents hold the detail.*

## Deliverables

| | Document | What it holds |
|---|---|---|
| A | [01-screenshot-inventory.md](01-screenshot-inventory.md) | 136 screens / 74 apps, the owner's 4 collections first; categories; index with Mobbin links |
| B | [02-visual-pattern-analysis.md](02-visual-pattern-analysis.md) | What the screens do, topic by topic, with evidence counts |
| C | [03-cross-application-comparison.md](03-cross-application-comparison.md) | Patterns graded A (adopt), B (contextual), C (optional), D (avoid); conflicts |
| D | [04-design-decisions.md](04-design-decisions.md) | Decision log D-01…D-26, owner decisions OD-1…OD-5 (resolved), assumptions |
| E | [05-design-system-specification.md](05-design-system-specification.md) | Principles, colour/type/spacing/shape/elevation tokens, layout archetypes, interaction rules |
| F | [06-component-catalog.md](06-component-catalog.md) | Every component: variants, states, sizes, a11y, rules, anti-patterns |
| G | [07-visual-storyboard.md](07-visual-storyboard.md) | Index of the 12 annotated frames |
| H | [08-implementation-guide.md](08-implementation-guide.md) | Mapping to `packages/ui`, CSS variables, migration order, acceptance criteria |
| H2 | [09-ai-implementation-playbook.md](09-ai-implementation-playbook.md) | **For AI agents:** exact before/after classes, codemods, detection commands, per-file Card map, PR sequence |
| I | [design-tokens.json](design-tokens.json) | 167 tokens, W3C DTCG format, validated (no dangling references; CSS mirror matches) |
| J | [component-examples/](component-examples/) | `rm-tokens.css`, `rm-components.css`, `rm-icons.css` and a live gallery `index.html` |
| K | [storyboard/](storyboard/) | `frames/*.html` (sources) + `png/*.png` (renders) |
| — | [research/](research/) | Raw per-screen notes for batches O, P, A–F (traceability) |

**Method in brief:** the owner's 29 saved screens (14 from Plain) set the taste. Six parallel research batches used one template to examine 107 more screens from popular B2B products. Patterns were counted by independent app, scored on nine criteria and resolved in a decision log. Tokens were derived from the existing brand decisions, contrast was computed (not estimated), and the chart palette was validated with the dataviz skill. The storyboard is built from the same CSS the catalogue documents.

---

## Executive summary

**1. The most valuable recurring patterns.**
- Shadows only on floating layers; static surfaces stay flat (≥ 14 apps).
- Content in sections on the page rather than in cards (~30 apps), with a thin 1px frame only for functional containers such as tables, grouped settings and KPI strips (~15).
- The whole content area as one inset white sheet on a neutral frame (9 apps + the owner's Plain picks).
- Exactly one primary button per view.
- Dot + text for lifecycle status; a tinted rect with a glyph only for attention states.
- Underline tabs for views; segmented controls for ranges.
- Label-above forms in a ≤ 640px column.
- Hairline tables with no zebra striping and tabular numbers.
- Assistant answers as flat prose with inline evidence.

**2. The unified look and feel.** Calm, neutral and evidence-first, like Plain or Stripe on a quiet day. The #F6F9FC frame holds the top bar and sidebar, and one white sheet holds the work. Inter at 13–16px with semibold (not extra-bold) headings in ink. Colour appears only when it means something: the primary colour for the next action, primary-soft for "you are here", four muted status tints, the chart roles (you / two rivals / grey) and Friday's orange. The result reads as a professional tool an agency can put its own brand on.

**3. Cards: why sparingly, and when.** Cards multiply borders and shadows, make every block look equally important, and hide hierarchy (Klaviyo A07, Shopify B14). Stripe's own dashboard drops its cards except in edit mode (A01/A02). The owner's newer saves moved the same way. A card is justified only for an **independent object**: something selectable, removable or individually actionable, such as suggested competitors, an integration catalogue or editable records. Use a frame when a table, grouped rows or a preview needs an edge. Use a band for a summary. Use plain sections for everything else. Never nest them (D-01).

**4. Shell and page layout.** A 48px top bar carries context: the agency identity, `Agency ⇕ / Client ⇕` slash switchers, Ctrl K search, the Ask Friday pill, notifications and the account menu. The sidebar (240px, rail 56px) is part of the frame, grouped with soft active fills; settings drill in with "‹ Back". Inside the sheet every page uses `PageHeader` and one of seven layout archetypes: Workspace, Overview, Detail, Form, Reading, Conversation, Setup (D-02…D-07, 05 § 4).

**5. The defining values.**
- **Colour:** frame #F6F9FC, sheet #FFFFFF, ink #0B2540, muted text **#5B6B80**, borders #E2E8F0 / #EDF1F5 / #CBD5E1 / inputs **#8796AB**; primary #47A8E7, secondary #2A6BAC, Friday #F5A524; focus ring **#2A6BAC**; charts #2A6BAC / #E05A2B / #14936A / #A3B1C2.
- **Type:** Inter 12 / 13 / 14 / 16 / 18 / 24 / 30, weights 400 / 500 / 600.
- **Spacing:** a 4px grid, with 16px between fields, 40px between sections and 32px page padding.
- **Radii:** 4 / **6 (controls)** / **8 (containers and overlays)** / 12 / full.
- **Shadows:** two, overlay and dialog.

**6. Conventions to standardise.**
- Four button variants plus link, in three sizes.
- The status grammar: dot, badge with glyph, pill filter chip, neutral tag, tier mark.
- The PageHeader order: breadcrumb → title → description/meta → actions → tabs → toolbar.
- Toolbar grammar.
- Table rules: flush on data pages, framed in mixed pages.
- KPI strip with deltas.
- Feed row grammar with a citation pill and one action.
- Field anatomy with inline errors, and one save model per group (auto-save toggles, dirty-state save bar).
- Overlay anatomy: menu, dialog, toast and alert.
- Friday parts: flat answer, inline citation pills, dated sources, ↳ suggestions, scoped composer.

**7. Patterns to avoid.**
- A shadowed card per widget, or card soup.
- A colour for every status or tag (E15).
- Many similar competitor line colours (B07).
- Amber warning banners that impersonate Friday (E17).
- Purple ✦ AI styling.
- Floating assistant overlays that cover data.
- Citation pills under 12px.
- More than 7 tabs, or three nav levels.
- Uppercase labels.
- Input borders below 3:1, or borderless grey inputs.
- Full gridlines on read-only tables.
- Full-pill buttons everywhere (03 § D).

**8. The most important decisions and trade-offs.**
- **One sheet instead of cards (D-01/02):** calmer and denser, but it depends on strong section headings.
- **A top bar despite best-in-class apps often omitting it (D-03):** our three-level context and the permanent Friday entry need it.
- **Darker input borders and focus ring (D-15/17):** slightly heavier inputs, in exchange for meeting WCAG 1.4.11 and 2.4.13.
- **At most two highlighted rivals in charts (D-13):** a third hue failed CVD validation, so the rest stay grey with a table view.
- **Responsive rules are a proposal (D-23):** only 3 mobile references exist.
- **Five places conflicted with recorded brand choices (OD-1…OD-5); all were resolved as recommended when the owner adopted the design (2026-10-23).** The biggest: primary-button labels move from white (2.62:1) to ink #0B2540 (5.93:1).

**9. How the storyboard guides implementation.**
- Frame 2 is the shell every page inherits, and Frame 11 is the acceptance reference for primitives.
- Frames 8 and 12 (Overview + docked Friday) are the validation slice: they exercise nearly every component.
- Frames 5–7 and 9 are the patterns for the containers, forms, tables and detail pages.
- Frame 10 is a hypothesis to test on phones.
- All frames use the same fictional client and the same CSS, so anything that differs from them is drift ([07](07-visual-storyboard.md)).

**10. What to implement first to validate efficiently.**
1. A token-only PR: the new muted text, focus ring, input border, radius scale and shadow tokens. It fixes three WCAG failures and calms most pages with no markup change.
2. The shell (frame + sheet).
3. The **Overview page** rebuilt per Frame 8 (summary band, KPI strip, hairline chart grid with the validated chart palette).

Then review it with the owner at 100% zoom on a laptop and on one phone before the Card→Section sweep (29 files, 49 `Card` usages, `shadow-card` in 58 files) ([08 § 7](08-implementation-guide.md#7-implementation-priorities-do-in-this-order)).

## Implementation priorities

1. Tokens (one small PR) → 2. Shell → 3. Card→Section/Frame migration → 4. Status grammar → 5. Overview (validation slice) → 6. Competitors table → 7. Forms & settings → 8. Friday parts → 9. Brief reading view → 10. Responsive (after on-device validation).

## Page compliance checklist (for developers and AI coding agents)

```
[ ] One layout archetype (L1–L7) + PageHeader (title = menu label, ≤1 primary, help key)
[ ] Sections first; frame only for table / grouped rows / preview / KPI strip; card only for independent objects; nothing nested
[ ] No shadow on static surfaces (overlay/dialog shadows only)
[ ] Only token colours, radii (4/6/8/12/full), type sizes (12–30) — no new hex in the diff
[ ] Colour only for action, selection, status, data, Friday; orange only for Friday/priority/stars
[ ] Status = dot+text | badge+glyph | pill filter chip | neutral tag | tier mark — never colour alone
[ ] Tables: 40px rows, hairlines, no zebra, numbers right + tabular, empty + filtered-empty states
[ ] Forms: label above, 36px inputs with #8796AB border, inline errors, 640px column, one save model
[ ] Charts: chart.* tokens, ≤2 highlighted rivals, legend + direct labels + table view, no dual axis
[ ] Every Friday/brief claim has a citation pill that opens evidence
[ ] Visible 2px #2A6BAC focus ring; keyboard reachable; Esc closes; targets ≥24px (44 touch)
[ ] Checked at 1440 / 1024 / 768 / 390 with no horizontal page scroll
```

## Quality and consistency audit (done before handing over)

- Every screen in the owner's collections (29) and all 107 research screens are inventoried with IDs and canonical links. Important recommendations cite those IDs; frame notes cite research and decision IDs.
- `design-tokens.json` is valid DTCG: 167 leaves, every leaf typed, 0 unresolved references. The CSS mirror `rm-tokens.css` matches it value for value (0 mismatches).
- Every hex in docs 04–08 exists in the token file, except the rejected chart candidates and one documented fallback (#DCE3EB). The success text colour was unified to the existing #166534 during the audit.
- All decision references (D-01…D-26, OD-1…OD-5) resolve. The frames use only shared classes, plus token-based layout styles local to each frame. Gaps found while building them were added to `rm-components.css` (v1.1 block), and all frames were re-rendered against it.
- Contrast figures were computed (WCAG formula), not estimated. The chart palette passed `validate_palette.js --pairs all`.
- Fixed during the audit: the compact header now allows inline tabs (D-07), and the Friday pill rule now allows the top-bar pill plus one contextual pill.
- All files use LF line endings.
- **Open items:** Dark mode is out of scope. Responsive is a proposal. Mobbin image links expire around 2026-11-22 (screen links don't). The owner's three saved *apps* couldn't be read through the MCP server.
