# Batch F — AI assistant, reading views, feeds/notifications, mobile

18 screens, 16 apps (max 2 per app). Colours are estimates from low-res previews. Viewports are Mobbin's: web ≈ 1440×900-ish (16:10), iOS ≈ 390×844.

## Inventory

- **F01 — Asana · AI assistant floating side panel (empty state)** — [Mobbin](https://mobbin.com/screens/f2b651ef-bce1-464c-9c47-52f2fb187238) — image_url: https://mobbin.com/api/mcp/short/RbHMHUmc
  - ~16:10, web, light content + dark sidebar; SaaS dashboard, project mgmt, AI chat
  - Nav: dark left sidebar (~#2E2E30 est.) with groups (Insights/Starred/Projects/Team), top bar with central search, "+ Create" pill.
  - Components: Home with greeting on a purple band, "My tasks" card, Learn cards; assistant panel floats over the right ~37% of the viewport.
  - Panel: inset with ~12px margins, radius ~12px, visible soft shadow, faint pink→white gradient header. Header "✦ Hi Alex, how can I help you?". Suggested prompts = **full-width outlined rows** (~36px tall, 1px ~#E3E3E6 border, radius ~6px, leading icon), grouped under small grey labels "For you / Insights / More". Composer pinned at bottom: one line, ~32px, radius ~8px, round blue send button (~#4573D2 est.). Icons for history/expand/close in the top right.
  - Distinctive: suggestions grouped by intent. Limitation: the floating overlay covers the dashboard, and the shadow plus gradient feel heavier than the rest of the app.

- **F02 — HoneyBook · AI assistant floating panel with an answer** — [Mobbin](https://mobbin.com/screens/fa243020-70b3-41a7-94c1-50e5d51c7355) — image_url: https://mobbin.com/api/mcp/short/Aec3v2c0
  - web, light; SaaS dashboard, AI chat
  - Nav: narrow dark icon rail (~#1B1B1F est.), top search, "+ New" in the top right, purple ✦ trigger button next to the bell.
  - Components: KPI strip (New leads 1 / Unread messages 0 / Tasks 1; big ~28px numerals, no chart), "Create new" list card, Automations card with tabs, Calendar and Activity cards.
  - Panel: ~32% width, radius ~12px, soft shadow, 1px lavender border. User message = **right-aligned bubble** (~#E8EAFB est. lavender, radius ~14px). Assistant reply = **flat text, no bubble**, ~13px with numbered/bulleted list, and an inline underlined blue link to the help article ("Draft emails with HoneyBook AI"). Below the answer: 16px ghost icons for 👍/👎/copy/regenerate. Composer: single-line field (radius ~6px) with disabled send button, disclaimer and "Beta v1.0" tag underneath.
  - Distinctive: the cards on the dashboard behind are white with 1px borders and no shadow; only the floating panel has a shadow. Limitation: the "citation" is just one inline link, with no provenance per claim.

- **F03 — Fireflies · AskFred docked right panel next to meeting** — [Mobbin](https://mobbin.com/screens/2047129f-d283-45ef-81bb-09aa79a32ffe) — image_url: https://mobbin.com/api/mcp/short/w0FIE16E
  - web, light; productivity, AI chat
  - Nav: minimal header (meeting title, REC badge), with a Notes/Transcript segmented toggle floating at the bottom centre.
  - Components: the left pane has 2×2 action tiles (Suggest Questions / Catch up / Summarize so far / Action items; grey ~#F5F6F8 fill, radius ~6px, small coloured icons). The right panel is **docked, not floating**: full height, ~34% width, divided by a 1px border with no shadow.
  - Message styling: user prompt = small grey pill right-aligned; answer = flat text with **bold quoted questions** in a numbered list, with copy/👍 below. Suggested follow-ups = stacked outlined rows (radius ~6px) with coloured ✦ sparkles. Quick-action chips (outlined, ~28px) sit above the composer. Composer: ~36px, grey fill, "Ask anything across your deal…", purple send button.
  - Distinctive: header shows "Consumes AI credits" in small grey text, which is honest about cost. Limitation: three kinds of suggestion (tiles, rows, chips) on one screen is redundant.

- **F04 — Customer.io · Agent as a full page with chat history column** — [Mobbin](https://mobbin.com/screens/42560374-3ad7-4a94-b68d-e332d59b4867) — image_url: https://mobbin.com/api/mcp/short/0fWLxBYv
  - web, light; SaaS dashboard, data-heavy enterprise, AI chat
  - Nav: left sidebar (~200px, ~#F7F7F7 est.) with sections (Review / Send messages / Manage audience / Create content / Configure data). A **second column** (~200px) holds "Recent chats" (Stored for 30 days), with Context/Routines/AI settings at its foot. A yellow-ish warning banner runs across the top.
  - Chat: centred column ~560px wide. User = grey rounded bubble right (~#EFEFEF, radius ~16px). Assistant = **flat prose ~13px/20px**. Above the answer are collapsible "Thought for 2 seconds ›" and "Searched docs ⌃" disclosures, with **source chips** (grey fill, radius ~4px, ~22px tall: "Campaign and Broadcast Metrics", "Metrics Overview", …) in a horizontal scroll row. Suggestions: "Hide suggestions" toggle plus outlined chips with ‹ › paging. Composer: ~64px tall, 1px border, radius ~8px, attach/settings icons bottom-left, round grey send bottom-right, disclaimer below. Primary button "+ New chat" is dark green (~#1F3B2E est.).
  - Distinctive: closest analogue to "Friday as a page" with evidence first. Limitation: three left columns eat ~400px.

- **F05 — Customer.io · Agent answer with "N references" popover** — [Mobbin](https://mobbin.com/screens/fafcbfb9-fa85-4b4d-b17f-54df962305b5) — image_url: https://mobbin.com/api/mcp/short/SFHNYjGf
  - web, light; AI chat
  - Same shell as F04. A popover (~140px wide, radius ~8px, light shadow) lists "5 references": each row has a title, a grey truncated URL and an external-link icon, separated by thin dividers. The answer below uses a 🔴 "Critical Issues" heading and a numbered bold sub-heading.
  - Distinctive: references are reachable on demand without cluttering the prose. Limitation: the popover is tiny and URLs truncate heavily; on touch it would need a bottom sheet (see F17).

- **F06 — ChatGPT · Deep-research report with Activity/Sources side panel** — [Mobbin](https://mobbin.com/screens/73833b79-1dd5-4354-8fc4-a2e99c33a75e) — image_url: https://mobbin.com/api/mcp/short/szRtHuLO
  - web, light; AI chat, analytics/reporting
  - Nav: left chat-history sidebar (~#F9F9F9), top model switcher, "Share" in the top right. A right panel (~27% width, divided by a border, **no shadow**) has a segmented "Activity | 23 Sources" toggle, then a log of steps ("Read irci.jp", "Searched for…"), each with a 16px favicon/icon.
  - Report: answer in a white **card with radius ~16px and a very light border**. Prose ~14px/22px with a bold "Sources:" lead-in, and **inline citation pills** (tiny grey fill ~#F0F0F0, ~9px text with the domain, e.g. "reuters.com") placed at the end of each sentence. A "Sources" chip under the report stacks overlapping favicons. Composer: ~72px, radius ~24px (pill-like), subtle shadow, "+ / Research" toggles.
  - Distinctive: the domain-labelled inline pill puts evidence right next to the claim, which is the strongest "no evidence, no claim" pattern seen. Limitation: the pills are tiny (~9px), poor for low vision and touch.

- **F07 — Dropbox Dash · Chat answer showing sources being analysed** — [Mobbin](https://mobbin.com/screens/f4ca9d48-c17a-40e5-98a2-f3a293483967) — image_url: https://mobbin.com/api/mcp/short/oFvdrEF1
  - web, warm light (~#FBFAF8 canvas est.); search/discovery, AI chat
  - Nav: left sidebar (Home / Search ⌘K / Chats / Stacks), page title "Q1 Overview Summary", "Share" button.
  - Chat: centred column ~400–480px. Attached-file chip (PDF, radius ~8px, light shadow). User bubble right, grey (~#EEEDEA), radius ~16px. "Thinking…" collapsible with a **vertical step rail** ("Searching for 'Q1 challenges'" → "Analyzing 20 sources from Gmail"). Sources = **bordered list box** (radius ~8px), rows with service icon + title + right-aligned "Updated Mar 20", "Show more". Composer: ~64px, radius ~16px, soft shadow, attach/settings/mic icons.
  - Distinctive: sources as a dated table-like list, which maps well onto our evidence items (dated captures). Limitation: little contrast between system steps and the answer.

- **F08 — Plane · AI page empty state with suggestions** — [Mobbin](https://mobbin.com/screens/8d800a40-7843-4810-95a1-9206c3289efc) — image_url: https://mobbin.com/api/mcp/short/uAA03hJS
  - web, light; project mgmt, AI chat
  - Nav: icon rail (~56px: Projects / Wiki / AI / Settings, labels under icons), an AI sub-sidebar (New chat, Skills, Recents "No threads available", "Try: Connect to GitHub/Slack").
  - Empty state: "What can I do for you?" (~18px semibold) centred. Composer card ~360px wide, 1px border, radius ~10px, **context chip** "AS Mobbin" at top-left, Build mode dropdown and model picker in the footer. "Suggestions" = **plain text list rows** with ↳ glyph and 1px dividers (no chips/cards). Disclaimer below.
  - Distinctive: the scope chip inside the composer shows which workspace the AI will look at; Friday could use it for the client scope. Very low ornament, no shadow.

- **F09 — Lightfield · CRM chat empty state ("Some ideas…")** — [Mobbin](https://mobbin.com/screens/a77b052b-5612-4588-895a-6cc553d5b18d) — image_url: https://mobbin.com/api/mcp/short/EbpxRS0S
  - web, light; data-heavy enterprise (CRM), AI chat
  - Nav: left sidebar (Notifications; Records: Accounts/Opportunities/Contacts; Resources; Chats).
  - Empty state: 9 suggestion prompts as a **plain divided list** (~13px grey text, ~22px rows, 1px ~#EEEEEE dividers), with a small "Some ideas…" label. No icons, no chips. Composer at the bottom: ~44px, radius ~8px, faint shadow, light-blue send button.
  - Distinctive: the most restrained variant, and the prompts are domain-specific ("Which of my opportunities need updating?"). Limitation: the list floats mid-page with no visual anchor and could read as unfinished.

- **F10 — Linear · Document reading view** — [Mobbin](https://mobbin.com/screens/8db6eca2-904a-4ad1-8621-8c055860dc9c) — image_url: https://mobbin.com/api/mcp/short/3J64seFw
  - web, light; productivity, project mgmt, reading view
  - Nav: left sidebar (~#F4F4F5, Inbox / My issues / Workspace / Favorites / Teams); breadcrumb bar at the top with star and "…"; "Edited Mar 31" top-right in grey. The content sits on an **inset white panel** (radius ~8px, 1px border, no shadow) over the grey app bg.
  - Reading: column ~410px of a ~640px panel (≈ 65–70 chars); title ~22px semibold; H2 "1. Overview" ~16px semibold; body ~13px/20px ~#3C3C43; **1px ~#E6E6E6 dividers between sections**; plain bullet lists. A mini-TOC as tick marks in the left gutter. "Ask Linear" floats bottom-right.
  - Distinctive: sections split by rules rather than cards, which fits the hypothesis exactly. Limitation: 13px body is small for long briefs read by owners.

- **F11 — Asana · Inbox (grouped notifications + AI summary)** — [Mobbin](https://mobbin.com/screens/8551be3e-e992-4933-bde7-64f6a2c6c3c8) — image_url: https://mobbin.com/api/mcp/short/ZJlj8xfK
  - web, light; project mgmt, notifications
  - Nav: same as F01; page header "Inbox" with tabs Activity / Bookmarks / Archive / +, Filter and Sort controls, "Manage notifications" button in the top right.
  - Feed: centred column ~410px. Top: "✦ Inbox Summary – Past week" card (radius ~6px, light shadow), "Drafting your summary…". Date group labels ("Today", "Yesterday", "Past 7 Days") ~12px semibold. Each item = icon + bold title ("Your overdue tasks from the past week") + **blue unread dot** at the right, with a bordered sub-list of task rows: check circle, title, red/green date at the right ("Dec 22" red, "Today" green). Full-width hairlines separate groups.
  - Distinctive: an AI digest at the top of the inbox, the same idea as a weekly brief in the alert feed. Limitation: the nested bordered boxes inside groups add weight.

- **F12 — Workable · Notifications inbox with inline actions** — [Mobbin](https://mobbin.com/screens/2146514d-1011-4f03-8b62-cef4040e0c42) — image_url: https://mobbin.com/api/mcp/short/JAIo3DwE
  - web, warm off-white (~#F7F6F2 est.); admin, notifications
  - Nav: top horizontal nav (Jobs / Candidates / Employees / Work calendar / Files / Reports), with icons on the right (mail with a badge count). Left local nav: Inbox (selected, grey fill) / Important / To-dos / Jobs.
  - Feed: each item is a **separate white row-card** (radius ~4px, faint border/shadow, ~8px gap): checkbox, type icon, avatar, **name (teal link) · event type · time** on one ~11px line, a description line below, then a **right-side action column** ("Sign document", "View profile") split off by a vertical rule, and a bookmark icon. Bulk bar: Archive / Mark as… / "7 items selected". A blue toast at the top centre reads "7 items have been marked as read".
  - Distinctive: the inline primary action per notification ("View profile") fits alerts like "Competitor X added a promo → View evidence". Limitation: the row-cards are busier than a hairline list.

- **F13 — Basecamp · Latest Activity timeline** — [Mobbin](https://mobbin.com/screens/3119c9f0-832e-448d-b750-03e5a806e9f6) — image_url: https://mobbin.com/api/mcp/short/Y4JFNThO
  - web, light (pale green canvas ~#EEF5F0 est. around a white sheet); productivity, activity feed
  - Nav: minimal "Home" link + product switcher; bottom bar (My Tasks / Events / Bookmarks / Notes; "Pings", "New for you").
  - Feed: white "sheet" (~550px, no radius, no shadow), title "Latest Activity" ~22px bold. A Timeline/Wrap-up toggle and **sentence-style filters** ("Showing All projects by Everyone"). **Date dividers as labels** (black filled pill for days with activity; outlined pill + "No activity" for empty days). Items: time on the left (~11px, coloured icon), avatar, then a **sentence** "Alex S. **commented on** [link] — Project", optional excerpt and thumbnails. A thin vertical rail connects the items.
  - Distinctive: shows empty days explicitly ("No activity"), which is the analogue of our quiet weeks. Sentence grammar is readable for non-experts. Limitation: the black date pills are heavy.

- **F14 — 7shifts · Audit/activity log with status chips** — [Mobbin](https://mobbin.com/screens/39d6a081-1cd1-474a-91bc-81e63426ace9) — image_url: https://mobbin.com/api/mcp/short/b3wm4Qmq
  - web, light (~#F7F7F7 canvas); SaaS for local-service SMB (restaurants), admin
  - Nav: icon-only left rail with orange badges; top bar with a trial banner (lavender), search, icons.
  - Feed: hairline-divided rows (~40px), with no cards. Avatar + "Sam Lee [**Deleted**] an Availability" where the verb is a **tinted status chip** (red ~#FBE3E3 / green ~#DDF3EA / teal "Published"; radius ~4px, ~11px text). Timestamp below ("Fri Apr 04, 2025 @ 9:32 AM"). "Show Details" is a small outlined button at the right. Prev/next pager.
  - Distinctive: a verb-as-chip gives at-a-glance change typing ("added / removed / changed price"). The audience matches ours: SMB owners. Limitation: the chips carry colour-only meaning (the label text helps).

- **F15 — Klaviyo · Reviews management (list + filters + reply)** — [Mobbin](https://mobbin.com/screens/e9b438b3-fed6-475f-ae19-19feac782405) — image_url: https://mobbin.com/api/mcp/short/yj9EI1IR
  - web, light; SaaS dashboard, reputation
  - Nav: left sidebar with expandable groups; page header "Reviews" + tabs (Overview / All reviews / Q&A / Products / Orders / Performance) + "Reviews settings" button.
  - Layout: left **filter rail** (~200px: search, Type multi-select tokens, Status radio list, Product/Ratings/Reply selects, "Time period" button, Media checkboxes), with no panel background. Main: "All reviews" + Options dropdown; **each review is a bordered card** (radius ~8px, 1px ~#DADADA, no shadow): 5-star row (black stars) + green "Published" badge, product name, date, bold title, body, verified author. The **merchant reply is nested in a grey box** (~#F3F3F3, radius ~4px) with date, Edit (blue), Delete (red). Icon actions at the top right (info / reply / bookmark / ⋮).
  - Distinctive: the nested grey reply block clearly separates "theirs vs ours", useful for review monitoring (competitor replies). Limitation: cards repeat with lots of whitespace, so it scans poorly at volume. A divided list would be denser.

- **F16 — Squarespace (iOS) · Analytics overview** — [Mobbin](https://mobbin.com/screens/c0a1c009-9db8-45ef-85ea-51c8ccdb5a4c) — image_url: https://mobbin.com/api/mcp/short/E5ZdWkMB — **mobile**
  - iOS 390×844, light; analytics, mobile/responsive
  - Nav: large title "Analytics" (~28px bold); **bottom tab bar** with 4 items (Home / Analytics / Commerce / ☰ More), active item labelled, the rest icon-only. A notification dot on Home.
  - Components: **full-bleed sections separated by ~8px grey (~#F2F2F2) bands, no cards/radius**. Uppercase ~11px section labels ("SALES OVERVIEW", "ACTIVITY LOG FOR 13 JAN" with an underlined date picker). KPI triplets (label 12px, value ~16px semibold, sparkline below each). The activity log is a 2-column time + detail list.
  - Distinctive: this is the cleanest no-card mobile pattern seen: sections are separated by bands, not cards. Touch targets: tab bar ~49pt tall.

- **F17 — ChatGPT (iOS) · Sources bottom sheet** — [Mobbin](https://mobbin.com/screens/3eaf4e44-fdce-48bc-965b-b194ed9c43ac) — image_url: https://mobbin.com/api/mcp/short/wFDn45vq — **mobile**
  - iOS, light; AI chat, mobile
  - Chat: user bubble right (grey ~#F0F0F0, radius ~18px), assistant flat ~17px prose, "Thought for a couple of seconds ›" in grey. **Sources open as a bottom sheet** (radius ~24px top corners, grabber, dimmed backdrop): "Sources" label, then rows with favicon + site name (~12px grey), bold title (~15px, 2 lines), and a grey snippet. Rows are ~80pt tall, so they are easy to tap.
  - Distinctive: the right mobile adaptation of F05's popover and F06's side panel. Header icons are circular ~44pt buttons.

- **F18 — Perplexity (iOS) · Answer with inline source pills and follow-ups** — [Mobbin](https://mobbin.com/screens/fe1aa2bb-e46b-45b2-ac6f-e2cb4916cbf1) — image_url: https://mobbin.com/api/mcp/short/hrjwMFdv — **mobile**
  - iOS, warm off-white (~#FAF8F4 est.); AI chat, mobile
  - Answer: H2 "Tips" ~20px semibold, bullet list ~16px/24px. **Inline monospace source pills** after each bullet ("loveandlemons +2", grey fill ~#ECECEC, radius ~4px, ~11px). An action row (share/download/rewrite/copy) and "10 sources" with stacked favicons. **Related follow-ups = divided list rows with ↳ glyph** (~16px semibold, ~56pt tall). Floating composer pill ("Ask a follow up…", radius ~24px, mic) plus a separate round compose button; toast "Privacy is set to private."
  - Distinctive: inline pills survive at mobile size and show source + count. Follow-ups use the same ↳ list as Plane (F08).

## Pattern observations (this batch)

**Assistant placement**
- Floating overlay panel, right, shadowed: F01 Asana, F02 HoneyBook (2 apps). Docked right panel with a border and no shadow: F03 Fireflies, F06 ChatGPT sources panel, plus Fibery and Fabric (seen, not inventoried) (≈3–4 apps). Full page with a history column: F04/F05 Customer.io, F07 Dash, F08 Plane, F09 Lightfield (4 apps).
- Strengths: a docked panel keeps the context visible (good for "ask about this competitor"), and a full page suits long research. Floating overlays hide the data and bring in the only heavy shadow in otherwise flat apps.
- **Recommendation:** Friday = full page in the client view (already decided: "Ask first") **plus** a docked, border-separated right panel (~380–420px) for contextual asks on other pages. No floating overlay, and no shadow on the docked panel. On mobile it becomes a full-screen route. Confidence **high**.

**Message styling**
- Every chat inventoried (F02, F03, F04, F06, F07, F17, F18 = 7 apps) uses the same scheme: **user = right-aligned grey/tinted bubble (radius 14–18px); assistant = flat, bubble-less prose** at full column width. None bubbles the assistant.
- **Recommendation:** user bubble `#EEF2F6` (our grey panel) with ink text and radius ~14px. Friday's answer is flat prose with markdown headings and lists. Show feedback/copy as 16px ghost icons beneath the answer. Identify Friday by a small orange "Friday" pill label above the answer, not a coloured bubble. Confidence **high**.

**Citations / evidence**
- Variants: (a) inline per-sentence pills with a domain label: F06 ChatGPT, F18 Perplexity (2 apps). (b) A source-chip row before the answer: F04 Customer.io, plus Cohere (seen). (c) A "N references" popover or "Sources" button with stacked favicons: F05, F06, F18, Sana/Meta (seen). (d) A dated bordered source list: F07 Dash. (e) A single inline link: F02 HoneyBook, which is the weakest. (f) On mobile, a bottom sheet: F17.
- **Recommendation:** for "no evidence, no claim", use (a) inline pills `[competitor · date]` at the end of each claim, ~12px (bigger than ChatGPT's ~9px), `#EEF2F6` fill, radius 4px, opening an evidence drawer. Add (d) a dated evidence list under each answer/brief item ("Captured Oct 19 · website"). On ≤640px, open the evidence as a bottom sheet. Confidence **high** for inline + list. **Med** for exact pill content.

**Composer**
- Bottom-pinned in all apps. Heights: ~32–44px single-line (F01, F02, F09) or ~64–72px multi-line with a footer toolbar (F04, F06, F07, F08). Radius 8–10px (F04, F08, F09) vs pill 16–24px (F06, F07, F18). Send button is a round icon in the bottom-right in all. Disclaimer line below in 6 of 8. Context/scope chip inside the composer: F08 Plane.
- **Recommendation:** a ~64px multi-line composer with a 1px border, radius 8px (matching our subtle radii, not a pill), the send button in primary #47A8E7, a scope chip ("Acme Plumbing · 6 rivals") and a one-line grey disclaimer. Confidence **med**.

**Suggested prompts**
- Outlined full-width rows with an icon, grouped (F01). Plain divided text list (F08, F09, and F18 follow-ups: 3 apps). Outlined chips above the composer (F03, F04: 2 apps). Tiles (F03, plus Copy.ai seen). Restrained B2B apps lean to **divided lists**.
- **Recommendation:** an empty state that lists 4–6 domain-specific prompts as divided rows with ↳, in the column under the composer. After an answer, show 2–3 follow-ups as the same rows. Use no tiles, and avoid chips except possibly in the mobile horizontal scroll. Confidence **high**.

**Reading / brief views**
- F10 Linear: an inset panel with ~65–70 character measure, sections divided by 1px rules, 13px body. F06 ChatGPT: the report sits in a light-bordered card, 14px/22px. Manus/Mistral/Fabric (seen): a modal or "paper" sheet, ~560–640px. F13 Basecamp: a white sheet on a tinted canvas.
- **Recommendation:** the weekly brief is a single white sheet on canvas #F6F9FC, max-width ~680px (≈70ch), body 15–16px/1.6 (bigger than Linear because owners read on phones), H2 ~18px semibold. Sections are divided by 1px #E3E8EE rules, not cards. Evidence pills go inline. Use a sticky mini-TOC only on ≥1280px. Confidence **high** (column/rules), **med** (type sizes).

**Feeds & notifications**
- Anatomy across F11–F14: date-group headers (F11, F13: 2 apps), a blue unread dot (F11, Quo seen), a sentence-grammar item "Actor **verb** object — context" (F13, F14), a verb chip (F14), an inline primary action at the right (F12, F14), bulk actions + toast (F12), and an AI summary pinned at the top (F11). Containers: hairline-divided list (F13, F14) vs separate row-cards (F12) vs grouped bordered boxes (F11).
- **Recommendation:** the alerts/activity feed is a hairline-divided list grouped by day ("Today / This week"). Each row: a type icon, the sentence "**Rival Co** changed prices on **Drain cleaning** — 3 pages", a tinted change-type chip (Added / Removed / Changed), a relative time, a blue unread dot, and one inline action ("View evidence"). Show "No changes" days/weeks explicitly, like Basecamp. Put the weekly brief summary as the top item. Confidence **high**.

**Reviews**
- F15 Klaviyo: a filter rail + bordered review cards + a nested grey reply block. Tripadvisor/Amazon (seen): AI summary above the reviews with "Generated from the text of customer reviews" plus topic chips.
- **Recommendation:** a divided list rather than cards (denser for scanning competitor reviews). Keep the **nested grey `#EEF2F6` reply block** to separate a business's reply. Put an AI theme summary at the top with a provenance line. Confidence **med**.

**Mobile / responsive shell**
- Bottom tab bar with 4–5 items (F16, YouTube Studio/TikTok/Spotify seen). Large page title ~28px. Sections separated by grey bands or full-bleed areas (F16) vs rounded cards (YouTube Studio, TikTok seen; more common in consumer apps). Popovers/side panels become **bottom sheets** (F17, Binance AI seen). Composer = a floating pill at the bottom (F18). Rows ≥ 56pt.
- **Recommendation:** under 768px, a bottom tab bar (Home / Alerts / Ask Friday / Briefs / More), the context switcher in the header, full-bleed sections divided by 8px canvas bands rather than cards, the evidence drawer as a bottom sheet, the Friday panel as a full screen, and 44px+ touch targets. Confidence **med-high**.

**Card vs no-card**
- No-card / hairline: F08, F09, F10, F13, F14, F16, chat answers everywhere (≈8 apps). Light 1px bordered cards, no shadow: F02 dashboard behind, F15, F06 report container, F10 inset panel (4). Shadowed: only floating overlays (F01, F02 panels), toasts, and popovers (F05).
- **Recommendation:** confirms the hypothesis. Use flat surfaces with 1px borders and dividers. Keep shadow only for things floating over content (popover, sheet, toast, dropdown). Radius 6–8px for controls/panels, ~14px for chat bubbles, ~16–24px only for the top of mobile sheets. Confidence **high**.

## Surprises / counter-evidence
- Composer pills (radius 16–24px, soft shadow) are the prevailing style in AI-native apps (F06, F07, F18), so a square-ish 8px composer will look less "AI". That is acceptable, but it is a deliberate departure.
- AI features almost always bring a **purple/gradient ✦ accent** (F01, F02, F03, Plane/Asana sparkles) that clashes with otherwise restrained palettes. Our orange Friday pill already fills that role, so we should avoid adding a second AI colour.
- Several restrained apps still use **warm off-white canvases** (Dash, Workable, Perplexity ~#FAF8F4) rather than cool grey. Our cool #F6F9FC is fine, but warmth is a common choice.
- Mobile dashboards in this sample (YouTube Studio, TikTok, Spotify) lean on **rounded cards** more than web apps do. Squarespace is the no-card counterexample. The evidence for "no cards on mobile" is thinner (1 strong example).
- Fireflies shows "Consumes AI credits" in the panel header. If Friday usage is capped, an honest, quiet usage hint has precedent.
- The citation pills in ChatGPT are very small (~9px). The best-known evidence pattern has poor accessibility, so we need to size up.

## ai_usage_notice
none
