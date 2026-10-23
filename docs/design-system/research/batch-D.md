# Batch D — Settings, forms & data entry, detail pages, setup wizards

Source: Mobbin MCP `search_screens` (web, deep), 8 queries, ~52 screens reviewed, 16 inventoried from 15 apps. All colours are visual estimates from low-res previews (≈768 px wide), not sampled values. Sizes are estimated from the preview scaled to a ~1440 px viewport.

## Inventory

- **D01 — Devin · Personal preferences (settings)** — [Mobbin](https://mobbin.com/screens/06dcfefe-1911-46b0-b273-c01b478eac06) — image_url: https://mobbin.com/api/mcp/short/8PHwMx1d
  - ~16:11, light; admin/settings, forms/data entry
  - Nav: dedicated settings shell. Left settings sidebar (~300 px, very light grey ~#F9F9F9 (est.)) with "Back to app", search box, grouped items (Personal / Organization), active item = grey fill pill. Top strip: breadcrumb "Settings / Preferences".
  - Components: page title + subtitle; section headings (Profile, Display, Notifications) on the page bg; each section = **one bordered group of label/value rows** (Picture, Name, Email, User ID); right-aligned controls (avatar, inline edit button, select, toggle, "Enable" button); open dropdown menu.
  - Visuals: rows ~56 px, title 13–14 px semibold + description 12 px grey ~#6B7280 (est.); group border 1 px ~#E5E7EB (est.), radius ~8 px, **no shadow**; hairline dividers between rows. No save button: **every control auto-saves**. Content column ~700 px centred. Toggles blue ~#2F6FEB (est.).
  - Distinctive: the "grouped list" (iOS-settings-like) pattern — very scannable, dense, calm. Limitation: weak for long multi-field forms.

- **D02 — Gorgias · Your profile (settings)** — [Mobbin](https://mobbin.com/screens/1cd57ee0-4192-4afd-a7e5-012191a13d89) — image_url: https://mobbin.com/api/mcp/short/1J0x3eId
  - ~16:11, light; admin/settings, forms
  - Nav: narrow icon rail (~48 px) + settings sub-nav (~200 px, ~#F4F5F7 (est.)) with collapsible groups (Channels, Apps, Account, Advanced, Profile), small 13 px items, active = grey pill. Content sits on a white panel inset with a faint rounded top-left corner.
  - Components: H2 sections ("Personal information", "Date and time settings", "Account preferences") **directly on white, no cards**, separated by ~40 px space; fields stacked; radio pairs in two columns; theme picker = 4 bordered selectable tiles (selected = blue 1.5 px border); right column holds profile picture uploader.
  - Visuals: labels above, 13 px semibold with red asterisk; inputs ~32 px tall, 1 px ~#D0D5DD (est.) border, ~4 px radius; helper text 12 px grey with inline link. Section headings ~18 px semibold. Main column ~520 px fields + ~200 px aside.
  - Distinctive: dense, flat, enterprise-ish; best example of "sections on background". Limitation: no visible save button above the fold — save position ambiguous.

- **D03 — 7shifts · My account (tabs + card forms)** — [Mobbin](https://mobbin.com/screens/a4ee8811-ee9e-46a8-bbf7-f8172cac66a9) — image_url: https://mobbin.com/api/mcp/short/dGt9w0HX
  - ~16:11, light; admin/settings, forms
  - Nav: icon rail left; top bar with trial banner; in-page **tabs** (General / Documents / Notifications / Permissions) with active tab as grey filled segment.
  - Components: two-column form grid inside **bordered cards** (main column ~60%) plus side cards (Profile photo, Login & Security). Phone input with flag prefix, date picker, selects, disabled (grey-filled) field.
  - Visuals: cards radius ~12 px, 1 px ~#E4E4E7 (est.) border, no shadow; card padding ~16 px; labels above 12 px; inputs ~32 px, radius ~6 px; disabled input bg ~#F2F2F2 (est.).
  - Distinctive: counter-example — many small cards + side cards look busier; card-in-page title "Emergency Contact" duplicates hierarchy. Limitation: no visible save.

- **D04 — Rise (Stripe customer portal) · Billing / current plan** — [Mobbin](https://mobbin.com/screens/fb67c0c8-2064-4c33-a828-dd0bc4347e64) — image_url: https://mobbin.com/api/mcp/short/GKI3kyji
  - ~16:11, light; admin/settings (billing)
  - Nav: split layout — left 40% grey panel ~#F5F6F8 (est.) with merchant name and "Return to…"; right white content column ~380 px.
  - Components: small UPPERCASE section labels (CURRENT PLAN, PAYMENT METHOD, BILLING INFORMATION) with full-width **hairline divider under each**, status chip "Canceled" (grey), plan name + big price (~20 px bold), primary "Update plan" (solid blue ~#2F6FD6 (est.)) + secondary outlined "Renew plan" stacked right; card brand row with "…" menu; "+ Add payment method" text action; label/value rows (Name, Email, Billing address).
  - Visuals: **no cards, no shadows**; 11 px uppercase tracking labels ~#6B7280; buttons ~36 px, radius ~4 px.
  - Distinctive: Stripe's own billing vocabulary — directly relevant since our billing is Stripe. Proves billing reads fine without cards.

- **D05 — Mural · Billing (workspace)** — [Mobbin](https://mobbin.com/screens/01cb0390-d5d3-4cf3-86a6-03f91f2c51c3) — image_url: https://mobbin.com/api/mcp/short/t7q5lyQr
  - ~16:11, light; admin/settings (billing)
  - Nav: grey page bg ~#F0F0F0 (est.); left settings list on the grey (active = black filled pill, white text); content in one large white panel with top-left rounded corner.
  - Components: plan summary line with inline meta (members, murals, next invoice), "Edit plan" outline button; "ACCOUNT DETAILS" grey header band then **label | value | action rows** (USAGE, PRICE, BILLED TO, BILLING ADDRESS, STATUS) each with a right-aligned outline button (Manage members, Go annual, Edit payment method, Edit address, Cancel plan).
  - Visuals: rows ~56 px separated by 1 px dividers; uppercase 11 px row labels; outline buttons ~32 px, radius ~4 px, 1 px ~#BDBDBD border; serif page title (brand).
  - Distinctive: the **definition-row table** — each fact + its action on one line; ideal for billing/seats. Limitation: "Cancel plan" given same weight as other actions (no destructive styling).

- **D06 — Maze · Team settings (members + invite)** — [Mobbin](https://mobbin.com/screens/48a8e1d5-3fbe-43fa-a6f8-ff2367e41dec) — image_url: https://mobbin.com/api/mcp/short/jGq93Ahd
  - ~16:11, light; admin/settings, data-heavy
  - Nav: icon rail + settings sub-nav (~150 px, white, icons + labels, active = blue text with right-edge blue bar); page title "Team settings" in top bar.
  - Components: sections ("Pending requests & invitations (1)", "Members (2)") **on white separated by full-width hairline dividers**; invite = wide input + solid blue "Invite" button; helper "Free teams can add up to 5 members"; pending row with small bordered "× Remove" (red text) and "Resend invitation" (blue text) chips; members table in a 1 px bordered box with uppercase 10–11 px column headers on light grey ~#F8F9FA (est.), row delete = red trash icon button; toast top-right (blue left edge).
  - Visuals: inputs ~40 px, radius ~6 px; table row ~36 px; no shadows except toast; section headings 14 px semibold; content ~430 px wide.
  - Distinctive: cleanest team page; counts in headings; seat-limit helper text right under invite. Directly maps to our seats model.

- **D07 — Okta · Brand theme (white-label branding)** — [Mobbin](https://mobbin.com/screens/8737c147-e992-4323-9a11-bfd5cf02bd41) — image_url: https://mobbin.com/api/mcp/short/jR4eLYpM
  - ~16:11, light; admin/settings, data-heavy enterprise
  - Nav: top bar (search, help, apps, account) + left app sidebar (~220 px, white, expandable groups, active sub-item light-blue fill); breadcrumb "Brands /", H1 brand name + "+ Add domain"; underline tabs (Theme / Pages / Emails / Domains / Settings).
  - Components: two narrow columns of upload tiles (Logo, Background, Favicon; each with edit pencil) and colour fields (hex input + large swatch block: Primary #1662dd, Secondary #ebebeb as shown in the UI); helper text under each (file size/ratio, where colour applies); right ~50% = **live preview** of the sign-in page with a page-selector dropdown and "Customize"; footer Save (solid blue) + "Discard changes" text button at bottom-left.
  - Visuals: no cards; preview framed by 1 px border on light grey; inputs ~40 px, radius ~4 px; helper 11–12 px grey.
  - Distinctive: closest analogue to our agency white-label settings — controls left, live preview right, explicit Save/Discard.

- **D08 — Shopify admin · Brand (colours, cover, slogan)** — [Mobbin](https://mobbin.com/screens/679f840d-adfc-4996-bb96-1d4102d6acee) — image_url: https://mobbin.com/api/mcp/short/U1OP48we
  - ~16:11, light; admin/settings, forms
  - Nav: dark top bar ~#1A1A1A (est.) whose centre turns into a **contextual save bar** ("Unsaved changes" + Discard + Save); modal-like full page with × close; page bg ~#F1F1F1 (est.).
  - Components: stacked white cards (Colors, Cover image, Slogan, Short description), each with title + one-line description; colour rows = swatch (~32 px, rounded 6 px) + name + hex + red "Remove"; empty-state rows with dashed icon box and "+ circle" add action.
  - Visuals: cards radius ~12 px, very faint shadow/1 px border; card width ~480 px; title 13 px semibold, description 12 px grey.
  - Distinctive: the **global unsaved-changes bar in the top app bar** is the strongest save pattern seen. Cards are Polaris-standard; contradicts no-card hypothesis but they are flat and low-contrast.

- **D09 — Attio · Company record (activity + details sidebar)** — [Mobbin](https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f) — image_url: https://mobbin.com/api/mcp/short/BjnSs1VH
  - ~16:11, light; data-heavy, productivity (CRM record)
  - Nav: left app sidebar (~230 px, white, workspace switcher, Quick actions ⌘K, Favorites/Records/Lists groups); breadcrumb "Companies › SLMobbin" + star; header actions right (Add to List, Run workflow, Compose Email as small outline buttons).
  - Components: record header (logo, name), status chips row ("No Connection", "No Interaction"); underline tabs with counts (Activity, Emails, Team 1, Notes 0, Tasks 0, Files); activity timeline grouped by "This week"; **right properties panel (~40%)** with Details/Comments tabs: icon + label (grey, ~13 px) | value (or grey "Set …" placeholder), inline editing (focused select with blue ring), tag chips (Technology green-ish, Information Technology yellow).
  - Visuals: zero cards, zero shadow; separation by 1 px vertical divider and tab underline; property rows ~28 px; text 13 px; radius ~6 px on buttons.
  - Distinctive: the reference for a calm, dense competitor detail page. Placeholder "Set X…" doubles as empty state.

- **D10 — Lightfield · Account record with AI summary + Ask box** — [Mobbin](https://mobbin.com/screens/f1244a10-3103-4ca1-87d6-df5eeef71f46) — image_url: https://mobbin.com/api/mcp/short/jwna9YTC
  - ~16:11, light; data-heavy, AI chat
  - Nav: left sidebar (~200 px, light grey ~#F7F7F7 (est.)); top tab strip (Overview, Contacts, Meetings, Tasks, Notes) + "Create"; right "Account details" panel (~30%).
  - Components: H1 with logo; "Suggested tasks" in a light grey filled box; **AI-written "Account summary" and "About their business" as plain prose paragraphs** (no card); "Upcoming meetings / Open tasks" sections with "See all" right and grey empty text; activity list with icons + relative time; **bottom-docked "Ask Lightfield" composer** scoped to the record; properties panel with icon labels and value chips (Industry chip blue-tinted).
  - Visuals: section labels 12–13 px grey medium; body 14 px; only the suggested-tasks box and composer have borders/fill; no shadows except composer (faint).
  - Distinctive: closest to our "brief + Friday" combination — AI prose as first-class page content, ask box contextual to the record.

- **D11 — Arcade · Onboarding wizard step 1** — [Mobbin](https://mobbin.com/screens/a7045f94-a2a0-4186-82ca-4bef1bbd0d72) — image_url: https://mobbin.com/api/mcp/short/pZfHxmvv
  - ~16:11, light; forms/data entry (onboarding)
  - Nav: no app chrome; logo left, **horizontal stepper in the top bar** (4 steps, numbered/icon circles, dotted connectors, current = blue filled circle + bold label), "Need help? Get in touch" right. Content on a large white rounded panel (~12 px radius) over grey page.
  - Components: large H1 (~28 px bold) "Let's get to know each other."; chip-style single-select (role buttons, selected = blue 1.5 px border); dropdown open.
  - Visuals: chips ~36 px, radius ~6 px; select ~40 px; form column ~360 px left-aligned within centred area.
  - Distinctive: stepper stays in chrome so the body is uncluttered; step names are nouns ("Set up your brand").

- **D12 — Apollo · Form setup wizard (header stepper + Next)** — [Mobbin](https://mobbin.com/screens/8d90e05d-3532-4a04-b46d-562ff20b9338) — image_url: https://mobbin.com/api/mcp/short/ny9A1Ro3
  - ~16:11, light; SaaS dashboard, forms
  - Nav: app icon rail stays; sub-header with back arrow, object name + "Inactive" chip, **centred text stepper** ("1. Overview  2. Setup  3. Installation", current underlined/bold, future grey) and the **primary "Next: Setup" button top-right** (lime brand).
  - Components: centred H2; two small bordered section boxes (Form name; Domains with token chips input) joined by a thin vertical connector line; helper text below input.
  - Visuals: boxes radius ~8 px, 1 px ~#E5E7EB border, no shadow; inputs ~36 px; column ~310 px.
  - Distinctive: wizard inside the app shell (resumable, like our client setup wizard); "Next: <step name>" label tells the user what's next.

- **D13 — Mintlify · Authentication settings (two-column, inline error)** — [Mobbin](https://mobbin.com/screens/31a78b73-f62f-4129-8d80-df093e8b7021) — image_url: https://mobbin.com/api/mcp/short/41qFe2HY
  - ~16:11, light; admin/settings, forms
  - Nav: icon rail + settings sub-nav (~150 px, grouped: Site settings, Deployment, Security & access, Workspace, Advanced incl. **Danger zone** item) ; breadcrumb "Admin › Settings › Authentication"; top-right "Complete your setup" progress pill + search ⌘K.
  - Components: **two-column section: left = title + description + "Learn more" outline button; right = controls** (select-like method picker, segmented tabs Authenticated/Password/Custom, grey-filled sub-panel with password input). Error: input border red ~#DC2626 (est.), red icon + 12 px red message below; "+ Add another password" text action; disabled "Save changes" button inside the sub-panel.
  - Visuals: no card on the page; the only container is a subtle grey fill ~#F7F7F8 (est.) sub-panel, radius ~8 px; inputs ~36 px, radius ~8 px.
  - Distinctive: Vercel/Stripe-style label-left layout; save disabled until valid/dirty.

- **D14 — Magnific · Profile settings (inline field error)** — [Mobbin](https://mobbin.com/screens/d0085be4-600b-4deb-a641-03f01bed22bd) — image_url: https://mobbin.com/api/mcp/short/AQI8S40b
  - ~16:11, light; admin/settings, forms
  - Nav: app sidebar (~230 px) + settings sub-nav (~110 px, grouped Account / Organization, active grey pill); breadcrumb "Settings / Profile".
  - Components: sections Profile / System preferences / Security **on white separated by hairline dividers**; field-level **inline Cancel + Save** appear next to the edited field; error = red border + red warning triangle inside input + red 11 px "Username exists" below; 2FA row with description and toggle right; "Set new password" outline button.
  - Visuals: inputs ~36 px, radius ~6 px, grey border ~#D4D4D8; section heading ~16 px; field width ~300 px (fields not full-width — good).
  - Distinctive: per-field save is precise but adds noise; fields sized to content.

- **D15 — Vercel · Project settings: Delete Project (danger)** — [Mobbin](https://mobbin.com/screens/a5ac35a4-139a-4c45-a7fa-e2698143c045) — image_url: https://mobbin.com/api/mcp/short/QdPsfFXn
  - ~16:11, light (overlay dimmed); admin/settings
  - Nav: settings sub-nav left (General, Build and Deployment, Environments, …, Advanced) on light grey; project switcher breadcrumb on top.
  - Components (behind overlay): stacked **bordered section boxes** (Data Preferences, Transfer, Delete Project), each with title, description, and a **footer bar** (grey ~#FAFAFA (est.)) holding helper text left + button right ("Transfer", red "Delete Project"); the delete box has a red-tinted footer. Modal: title, explanation, **two type-to-confirm inputs** (project name, "delete my project"), red-tinted alert "cannot be undone", Cancel (outline) + Delete Project (solid red ~#E5484D (est.)).
  - Visuals: boxes radius ~8 px, 1 px border, no shadow; modal radius ~12 px with soft shadow; buttons ~32 px.
  - Distinctive: the canonical "section box with footer save bar" pattern; destructive confirmation by typing.

- **D16 — Mintlify · Danger zone page** — [Mobbin](https://mobbin.com/screens/705b6bdb-355d-4a90-bc1f-b9b9dac04708) — image_url: https://mobbin.com/api/mcp/short/95v1w9H8
  - ~16:11, light; admin/settings
  - Nav: same as D13, active "Danger zone" item shown in green (brand) with warning icon.
  - Components: two two-column sections (Delete my deployment / Delete my organization): left title + description "cannot be restored"; right: required "Reason for deletion" textarea + solid red button ("Delete asmob-…", "Delete ASMOB"); org deletion adds an amber-tinted warning callout ~#FFF4E5 (est.) with dark text.
  - Visuals: separation by a hairline divider only; no cards, no red borders; red button ~#DC2626 (est.), radius ~6 px, ~30 px tall.
  - Distinctive: danger zone as its own sub-nav page rather than tail of General; asks for a reason (feedback capture).

## Pattern observations (this batch)

### 1. Settings layout (sub-nav, width)
- **Variants:** (a) dedicated settings sidebar replacing/beside app nav, grouped with small caps group labels — D01, D02, D06, D13/D16, D14, D15 (6 apps); plus Mural D05 (7). (b) In-page tabs under page title — D03, D07 (Okta uses tabs within an object), also Patreon/Bonsai/Rows seen (not inventoried). (c) Split portal layout — D04.
- Group labels: tiny grey (11–12 px) labels "Personal / Organization / Workspace / Advanced" in 6/7 sub-nav apps. Active item = grey fill pill (4 apps) or brand-colour text/bar (2).
- **Content width:** form column 400–720 px in every app; nobody stretches forms across 1200+ px. Two-column label-left layouts (D13, D16) use ~900 px total.
- **Recommendation:** grouped left sub-nav (Agency: General, Branding, Team, Billing, Danger zone…) inside the existing left sidebar area or as a second column; content max-width ~720 px for forms, wider (~1100 px) only for tables/branding preview. Confidence **high**.

### 2. Form section patterns
- **Variants:** (a) plain sections on page bg with heading + hairline divider — D02, D04, D06, D14, D16 (5 apps); (b) two-column "title+description left / controls right" — D13, D16 (1 app, but the same pattern is the Vercel/Stripe/GitHub norm); (c) grouped-list rows in one bordered group — D01 (Devin), Linear onboarding seen; (d) bordered section box with footer bar — D15 (Vercel); (e) cards per section — D03, D08 (2 apps).
- Strengths: (a) lowest noise, best for long pages; (c) best for many toggles/one-value settings; (d) makes per-section save unambiguous. Weakness of (e): visual weight multiplies with section count.
- **Recommendation:** default = (a) sections on background with 15–16 px semibold heading, 13 px grey description, 32–40 px spacing, hairline divider between sections. Use (c) bordered row-group (1 px border, 8 px radius, no shadow) for toggles/preferences/notifications. Reserve (d) only where a section has its own save. Supports hypothesis — **high** for (a), **med** for when to use (c)/(d).

### 3. Field anatomy
- Label **above** input in 13/16 screens; label-left only in definition rows (D05, D09, D10) and two-column sections (D13). Labels 12–13 px semibold dark; required = red asterisk (D02) or "(required)" text (D03).
- Helper text: 11–12 px grey directly below (D02, D06, D07, D12). Errors: red 1 px border + 12 px red message with icon below (D13, D14; also Patreon, Base44, Salesforce seen) — 5 apps consistent. Page-level error banner (Patreon) only in addition, never alone.
- Input height: 32 px (dense: D02, D03), 36 px (D12–D14), 40 px (D06, D07, D11). Radius 4–8 px; border ~#D0D5DD–#E5E7EB (est.).
- **Recommendation:** label above, 13 px/500; input 36 px, 1 px border, 6 px radius, focus = 2 px brand ring; helper 12 px muted; error = red border + icon + message below, keep helper hidden while error shows. Size fields to expected content (D14) rather than full width. **High.**

### 4. Inputs, selects, choice controls
- Toggles for on/off preferences (D01, D14; also Linear, Dribbble seen); radios for 2–3 exclusive options (D02); **selectable tiles** for visual options like theme (D02) and chip buttons in onboarding (D11) — selected = brand 1.5–2 px border, not filled. Colour fields = hex input + swatch (D07, D08; PandaDoc, Wrangle, SavvyCal seen — 6 apps).
- **Recommendation:** switch for instant-apply booleans; radio tiles for 2–4 visual choices; colour input = swatch + hex text field + live preview. **High.**

### 5. Save patterns
- **Variants:** auto-save per control (D01, D09 inline edit) — 2; per-section button at section end (D02 implied, D15 footer, Workable/Contractbook seen) — 3+; per-field inline Save/Cancel (D14) — 1; page-level Save + Discard at the bottom (D07) — 1; **global "Unsaved changes" bar in app header** (D08 Shopify) — 1; save disabled until dirty/valid (D13, D14) — 2.
- **Recommendation:** two rules — toggles/selects that are low-risk auto-save with a toast; multi-field forms use a **sticky bottom (or top-bar) "Unsaved changes · Discard · Save" bar** that appears only when dirty (Shopify model) — avoids hunting for buttons on long pages and works for branding preview. Save disabled when pristine. Confidence **med** (Shopify bar is one strong app; per-section is commoner).

### 6. Destructive zones
- **Variants:** own "Danger zone" sub-nav page (D13/D16 Mintlify, Railway, Ferndesk seen — 3 apps); last section of General with red-tinted box/footer (D15 Vercel, Neon, Plane, n8n seen — 4 apps). Confirmation: type-to-confirm name (Vercel, Neon, Plane — 3), reason textarea (D16), choice of data handling (n8n).
- Visual: plain section + solid red button (D16, n8n) vs red-bordered box (Neon, Railway) vs red-tinted footer (D15).
- **Recommendation:** last section of the settings page titled "Danger zone", no card; each action = row (title, consequence text, red outline button → solid red in confirmation modal); type-to-confirm for client/agency deletion. Red only on the button and modal, not the whole section. **High.**

### 7. Detail / record pages
- **Variants:** main column (activity/tabs) + right properties panel — D09 Attio, D10 Lightfield (also HubSpot, Unify seen); left properties panel + right timeline — Twenty, Pipedrive (seen). 2-col with properties right in 4/6 CRM-like apps.
- Header: small breadcrumb, name + logo, status chips, 2–3 outline action buttons right; tabs with counts below. Properties: icon + grey label | value, ~28–32 px rows, inline edit, grey "Set …" placeholder for empty.
- Separation by 1 px vertical divider, not cards (D09, D10, Twenty); HubSpot/Pipedrive/Outseta use cards and look heavier.
- **Recommendation:** competitor detail = header (name, website, tier chip, actions) + underline tabs (Overview, Changes, Ads, Reviews, Rankings) + right ~320 px "Details" panel separated by a divider; AI "why it matters" as prose sections (D10 style). **High.**

### 8. Wizards
- **Variants:** stepper in top chrome, horizontal numbered (D11 Arcade; Xero, Etsy seen — 3 apps); centred text steps + "Next: <step>" button top-right inside app shell (D12 Apollo); checklist-style side drawer "1/4 tasks completed" (Navan seen); dot pager (Linear seen). Form column 310–400 px, centred, large H1.
- **Recommendation:** for client setup wizard (resumable, inside app shell): Apollo-style sub-header with back, client name + status chip, text stepper (Lookup · Profile · Competitors · Invite owner · Billing), primary "Next: <step>" right + persistent "Skip/Save & exit"; body = single centred column ~480 px, no card. Plus a "Complete your setup" progress pill in the top bar (D13) for agency onboarding. **Med-high.**

### 9. Card vs no-card
- No-card (sections on bg, dividers): D02, D04, D05, D06, D07, D09, D10, D13, D14, D16 — **10 screens / 9 apps**. Light border-only groups (no shadow): D01, D12, D15 — 3 apps. Cards: D03, D08 — 2 apps (both with near-zero shadow).
- Shadows: none on any settings page; only on modals, dropdowns, toasts.
- **Recommendation:** hypothesis confirmed for settings/detail pages. Allow 1 px bordered groups (8 px radius) only for grouped rows, tables and preview frames. **High.**

## Surprises / counter-evidence
- Shopify (D08) and 7shifts (D03) still use per-section cards; Shopify's work because the page bg is grey and cards are tiny-contrast — if we use grey canvas (#F6F9FC) with white content, a borderless white panel (Mural D05, Gorgias D02) is the alternative.
- Best-in-class team page (D06 Maze) puts the members table inside a bordered box — tables want a frame even when sections don't.
- Many apps use a **second white "content panel" inset from a grey shell with only the top-left corner rounded** (Gorgias, Mural, Ferndesk, Magnific, Lightfield) — a strong, calm alternative to cards that keeps the "slightly shaded sidebar" hypothesis.
- Destructive actions are often NOT styled red in billing (Mural "Cancel plan" outline neutral) — mixed practice; we should still use red-text for cancel/delete.
- Branding settings almost universally include a **live preview** (Okta, Bonsai, PandaDoc, Wrangle — 4 apps); a no-preview branding page would be the outlier.
- Auto-save (Devin, Attio) is more common than expected in modern tools; a single save model across the app is not the norm.
- Lightfield (D10) and HubSpot (seen) both put AI summaries on the record page itself — supports making the brief prose first-class on competitor/client detail pages; HubSpot boxes it in a pink bordered card, Lightfield leaves it as plain text (calmer).

## ai_usage_notice
none
