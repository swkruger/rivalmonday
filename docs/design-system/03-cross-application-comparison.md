# 03 · Cross-application comparison

*Recurring patterns across the 74 apps, scored for Rival Monday. "n" counts independent apps. Confidence reflects evidence breadth **and** fit, not popularity alone: a frequent pattern can still be rejected (category D). IDs → [01](01-screenshot-inventory.md); decisions → [04](04-design-decisions.md).*

**Scoring lens** (from the brief, applied to every row): usability · visual clarity · fit with the understated direction · information density · accessibility · implementation cost · reusability · fit across page types · evidence.

---

## A. Strong recurring patterns (adopt system-wide)

| # | Pattern | Evidence (n) | Implementation observed | Why it works | Drawbacks | Verdict · confidence |
|---|---|---|---|---|---|---|
| A1 | **Shadows only on floating layers** | A16, C02, C10, C16, E02, E07, E09, E13, E14, F05 + every settings page in D (≥ 14) | 1px border + one soft shadow on menus, popovers, dialogs, toasts, bulk bars; static surfaces flat | Elevation then *means* "this floats above the page"; removes noise | None of note; a sheet without shadow needs a border | Adopt (D-06) · **High** |
| A2 | **Sections on the background, not in cards** | ~30 apps (02 § 1A), owner's Plain set | H2 16–18px + muted description; 32–48px gaps; hairline rules | Lowest noise, most content, scales to long pages | Can feel unstructured without strong headings | Adopt as default (D-01) · **High** |
| A3 | **Thin bordered frame for functional containers** | ~15 (02 § 1B): A05, A10, B04, B07, B08, C06, C10, D06, D15, O04, O11, O13 | 1px border, 6–8px radius, header/footer strips, no shadow | Gives tables, grouped settings, tabbed panels an edge without the weight of a card | Overuse turns into card soup | Adopt with rules (D-01) · **High** |
| A4 | **One primary action per view** | A05, A09, A11, A12, B02, C01, D06, O01, O04, O17 (≥ 10) | One filled button; the rest outline or ghost | Clear next step; calm header | Pages with two equal tasks need a decision | Adopt (D-09) · **High** |
| A5 | **Three button styles + destructive, ~6px radius, two densities** | E01, E04, E08, E09, E11, E13, O01 (≥ 7) | Filled / white outline / ghost; 28px dense, 32–36px default; leading icon | Small vocabulary, clear hierarchy | — | Adopt (D-09) · **High** |
| A6 | **Label above input; helper and error below** | 13/16 D screens, all onboarding (≥ 12) | Label 12–13px semibold, input 32–40px, helper 12px muted, error = red border + icon + message | Fast scanning, mobile-friendly, works at 640px | Two-column label-left saves height on wide screens | Adopt (D-15) · **High** |
| A7 | **Forms in a narrow column (400–720px)** | every app in D, O01, O05, O17, O27 | Left-aligned column inside a centred area | Readable line length; nothing stretched | Wide screens show empty space (acceptable) | Adopt 640px (D-05) · **High** |
| A8 | **Underline tabs for page sections** | A05, A12, A15, D09, E04, E08 + 3 (9) | 2px underline, active ink 600, counts inline | Universal; light | Overflows past ~7 tabs (A07) | Adopt (D-08) · **High** |
| A9 | **Menu anatomy** (icon · label · shortcut; dividers; destructive last in red) | E07, E13, E14, E16, E09, E04, A16 (7) | 8px radius, 28–32px rows | Predictable; keyboard-friendly | — | Adopt (D-24) · **High** |
| A10 | **Destructive confirmation: Cancel left, Delete right; name object + consequence** | E10, E11, E12, Luma, FLORA, 15Five (6/6) | 480–560px dialog; solid red in 4/6 | Familiar; safe | Solid red is loud (acceptable once per flow) | Adopt (D-24) · **High** |
| A11 | **Tables: hairline rows, no zebra, numbers right-aligned** | 14/14 table apps have no zebra; C01, C11, C16, P07 right-align | 12px muted header; 28–40px rows | Readable density with low ink | — | Adopt (D-11) · **High** |
| A12 | **Dot + text for lifecycle status** | C03, C04, C08, E03, E05, P02 (≥ 5) | 8px dot + 13px text | Calm in dense tables; text carries meaning, so it is colour-blind-safe | Too subtle for urgent states | Adopt as default (D-10) · **High** |
| A13 | **Toolbar grammar** (view · search · filter ‖ sort · columns · export) | C01, C03, C06, C08, C10, C12, C05 (7) | One row; ghost/outline 28px controls | Users know where things are | — | Adopt (D-11) · **High** |
| A14 | **Sidebar: grouped, small muted labels, 16px line icons, soft active fill** | A03, A04, A08, A10, A13, A16, O01 + B batch (≥ 10) | 11–12px labels; 28–32px items; 6px-radius fill | Calm, scannable | Many groups need collapsing | Adopt (D-04) · **High** |
| A15 | **Assistant answers as flat prose; user in a grey bubble** | F02–F07, F17, F18 (7/7 chat apps) | User bubble 14–18px radius; answer full width | Long answers stay readable; no "chat toy" look | — | Adopt (D-14) · **High** |
| A16 | **Empty state keeps context** (headers kept, small line icon, one line, one action) | C07, C13 + 3 | 32px grey icon, 14px title, 13px text, one button | Teaches the shape of the data | — | Adopt (D-11) · **High** |

## B. Strong contextual patterns (adopt for specific page types)

| # | Pattern | Context | Evidence (n) | Implementation | Verdict · confidence |
|---|---|---|---|---|---|
| B1 | **Frame + inset white sheet shell** | the whole app | A04, A14, C04, C10, C12, C13, D02, D05, F10 + Plain (owner's 14 screens) (10) | Grey frame, one white sheet (border, 8px radius) | Adopt (D-02) · **High** (owner taste + 9 apps) |
| B2 | **Slash context switchers in a top bar** | multi-level tenancy | A08, A10, A09 (3) | `Org ⇕ / Project ⇕` | Adopt for Agency / Client (D-03) · **Med-High** (few apps, strong fit with the decided switcher) |
| B3 | **Drill-in settings nav** ("‹ Back" replaces main nav) | settings areas | A09, A15, D01 (+ sub-nav in 7) | Same column, grouped list | Adopt (D-04) · **Med-High** |
| B4 | **KPI strip** (one frame, vertical dividers) | overview pages | B04, B09, B12, O13, Gorgias, Mintlify (6) | Label 12–13 muted, value 22–28px tabular, delta pill | Adopt (D-12) · **High** |
| B5 | **Hairline chart grid** | dashboards with several charts | B01, B02, B03 (Stripe) + O10 Plain (2) | Cells divided by 1px rules; "Updated …" footers | Adopt (D-26) · **Med** (2 apps, very strong fit) |
| B6 | **Peer band + coloured subject line** | "you vs market" charts | B03 (1), B07 counterexample | Neutral band, median line, subject line in colour | Adopt (D-13) · **Med** (1 app, ideal semantics) |
| B7 | **Ranked legend as leaderboard** | share of visibility / rankings | B05, B07 (2) | Rank · dot · name · tabular % | Adopt (D-13) · **Med** |
| B8 | **Right peek panel from a table** | competitor / event detail | C12, Gumloop, Lightfield, Fresha (4) | ~420–480px, border, "Open" escalation, prev/next | Adopt (D-21) · **High** |
| B9 | **Record page: main column + right properties aside** | competitor detail | D09, D10, Twenty, HubSpot (4) | Divider, label/value rows, inline edit | Adopt (D-21) · **High** |
| B10 | **AI prose as first-class page content** | briefs, "why it matters" | D10 Lightfield, F11 Asana, B06 Semrush (3) | Plain prose sections; HubSpot boxes it (heavier) | Adopt (D-19, D-26) · **Med-High** |
| B11 | **Docked assistant panel, border not shadow** | contextual Friday | F03, F06 + Fibery, Fabric (≈4) | Full height, 30–37% width | Adopt 400px (D-14) · **High** |
| B12 | **Inline citation pills + dated sources list** | Friday answers, briefs | F06, F18 (pills), F07 (dated list), F05 (popover) (4) | Grey pill `[source · date]`; list under the answer | Adopt, sized up to 12px (D-14) · **High** |
| B13 | **Grouped bordered rows** (title + description + control) | notification and preference settings | D01, O07, Linear onboarding (3) | One frame, hairline rows ≥ 56px | Adopt (D-15) · **Med-High** |
| B14 | **Definition rows with an action per row** | billing, plan, seats | D05 Mural, D04 Stripe portal, O04 Plain (3) | Label · value · action | Adopt (D-15) · **Med-High** |
| B15 | **Dirty-state save bar** | multi-field forms, branding | D08 Shopify (1) + save-disabled-until-dirty D13, D14 | Appears only when changed; Discard + Save | Adopt (we already have `save-bar.tsx`) (D-15) · **Med** |
| B16 | **Live preview for branding** | white-label settings | D07 Okta, Bonsai, PandaDoc, Wrangle (4) | Controls left, preview right in a frame | Adopt (D-15) · **High** |
| B17 | **Setup checklist with inline-expanding current step + side timeline** | agency / client onboarding | O24, O26 Mercury (owner saved) + Navan (2) | Hairline list, numbered → ✓, right rail | Adopt (D-22) · **Med-High** (owner pick) |
| B18 | **Floating bulk-action bar** | multi-select tables | C04, C05, C09/E16 (3) | Bottom centre; count · select all · actions · ✕ | Adopt, inverse style (D-11) · **Med-High** |
| B19 | **Feed grammar** (day groups, sentence, type chip, one action, quiet days) | alerts, changes | F11–F14, B09, B10 (6) | Hairline list | Adopt (D-20) · **High** |
| B20 | **Mobile: bottom tab bar, full-bleed bands, bottom sheets** | < 768px | F16, F17, F18 (3) | 8px bands; 44pt targets | Adopt as *proposal* (D-23) · **Low-Med** |

## C. Distinctive but optional patterns

| # | Pattern | Evidence | Use when | Confidence |
|---|---|---|---|---|
| C1 | KPI-as-tab driving the chart below (B04 Vercel) | 1 | A page with one dominant chart and 3–5 metrics (e.g. Local rankings) | Med |
| C2 | Count tiles as quick filters (C01 Stripe) | 1 | Status buckets with meaningful totals (alerts triage) | Low-Med; heavy |
| C3 | Label-left / data-right analytics sections (B15 Etsy) | 1 | Explanatory brief sections for owners | Med; wastes width at 1560 |
| C4 | Composer scope chip (F08 Plane) | 1 | Friday composer ("Summit · 6 rivals") | Med; adopted inside D-14 |
| C5 | "Tab to Ask AI" in the command palette (Magnific) | 1 | Ctrl K → Friday hand-off | Med; adopted in D-03 |
| C6 | Verb-as-chip in activity logs (F14 7shifts) | 1 | Change-type chips (Added / Removed / Changed) | Med; keep as rect badge, not pill |
| C7 | Nested grey reply block (F15 Klaviyo) | 1 | Competitor review + owner reply | Med |
| C8 | Thin top progress line in single-step flows (O27 Mercury) | 1 | Multi-page signup | Med |
| C9 | Acknowledgement checkbox instead of red (E10 Qatalog) | 1 | Medium-risk deletes where red would be noisy | Med |
| C10 | Typed confirmation (D15 Vercel, Neon, Plane) | 3 | Deleting a client or agency, stopping billing | High; adopted in D-24 |
| C11 | Monospace IDs and values (A08, C16, O12) | 3 | Evidence IDs, URLs only | Med |
| C12 | Dashed partial-period segment (B04, O16) | 2 | Current week in progress | Med; adopt in charts |

## D. Patterns to avoid

| # | Pattern | Where seen | Why we reject it |
|---|---|---|---|
| D1 | **Shadowed card per widget on a grey canvas** | B11 Klaviyo, B14 Shopify, O14–O16 Amplitude/Causal, A07 | Visual weight without information; everything looks equally important; the owner's newer picks moved away from it |
| D2 | **Card soup**: nested cards, cards for single rows | A07 (5 stacked cards that should be list rows), F11 nested boxes, D03 | Hierarchy duplicated by borders; noise multiplies with content |
| D3 | **A colour for every status / tag** | E15 folk, E16 ClickUp, C03 Attio tags, B07 Peec | Colour stops carrying meaning; pulls the eye off names; fails CVD |
| D4 | **Many similar line colours for competitors** | B07 Peec AI, B06 Semrush | Unreadable; violates the dataviz all-pairs check; replace with you + ≤ 2 highlighted + grey |
| D5 | **Amber warning banners** | E17 Square, PayPal | Collides with the Friday / priority accent #F5A524 |
| D6 | **Purple ✦ gradient AI styling** | F01 Asana, F02 HoneyBook, F03 | A second accent; Friday already has the orange pill |
| D7 | **Floating shadowed assistant overlay that covers data** | F01, F02 | Hides what the user is asking about |
| D8 | **Tiny citation pills (~9px)** | F06 ChatGPT | Below readable size; poor touch target |
| D9 | **Long tab bars (> 7) and three nav levels** | A07 Klaviyo (15 tabs), B06 Semrush (8 + double sidebar) | Overflow and lost orientation |
| D10 | **Uppercase tracked labels** | D04, D05, B12 | Dated; harder to read; inconsistent with sentence case |
| D11 | **Input boundaries below 3:1** | most apps (~#D0D5DD on white) | Fails WCAG 1.4.11 for the control boundary; we deliberately differ |
| D12 | **Borderless filled-grey inputs** | O25, O27, O28 Mercury | The field boundary disappears on grey surfaces |
| D13 | **Full gridlines on read-only tables** | C10 Calendly, C03 | Signals "editable spreadsheet"; noisy |
| D14 | **Per-row outlined action buttons on every row** | C05 Hotjar "Play" | Repetition noise; use row hover actions or "⋯" |
| D15 | **Decorative illustration and gradient hero cards in the working UI** | O15 Causal, O18 (sign-up only) | Fine for marketing; noise inside the product |
| D16 | **Full pill buttons everywhere** | Mercury O24–O29, folk, Square | Inconsistent with 6px controls; keep pills for chips and the Friday entry |
| D17 | **Three suggestion styles on one screen** | F03 (tiles + rows + chips) | Redundant; one pattern: ↳ rows |

## Conflicts that needed a rule (resolved in [04](04-design-decisions.md))

| Conflict | Sides (evidence) | Resolution |
|---|---|---|
| Top bar vs sidebar-first | 7 vs 6 apps | Top bar, because of three-level context and the Friday entry (D-03) |
| Shaded sidebar vs white sidebar | ~10 vs ~9 | Shaded *frame* (sidebar + top bar) + white sheet; never shade content too (D-02) |
| Flush tables vs framed tables | 6 vs 4 (+ B, D say frame) | Flush when the table *is* the page; frame when it sits among other sections (D-11) |
| Brand-colour vs ink primary button | ~equal | Brand primary (owner decision); ink kept as the recommended white-label fallback (OD-1) |
| Pill vs rect chips | rect 2:1 for data | Rect for badges and tags, pill for filter chips (D-10) |
| Solid red vs quiet destructive | 4 vs 2 | Solid red only inside the confirm dialog; red-outline triggers on the page (D-24) |
| Toast position | split | Bottom right, inverse (D-24) |
| Pagination vs infinite | 3 vs 5 | Count + Previous/Next (our lists are tens to hundreds of rows) (D-11) |
| Composer pill vs 8px | AI-native vs B2B | 8px: matches the system; the Friday pill provides the AI identity (D-14) |
| Auto-save vs explicit save | both common | Toggles and selects auto-save; multi-field forms use the dirty-state save bar (D-15) |
| Cards on mobile vs bands | consumer cards vs F16 | Bands (consistent with desktop), proposed (D-23) |
