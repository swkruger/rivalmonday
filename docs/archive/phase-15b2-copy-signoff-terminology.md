# phase-15b2 - terminology changes for owner sign-off (Tasks 2, 7, 8 and 10)

**Status: ready for owner sign-off, 2026-10-21.** These are the words the wave changed or settled in the product itself, not new help copy (the batch sign-off docs cover that: `phase-15b2-copy-signoff-client.md`, `-agency.md`, `-platform-account.md`). Each row names the old wording, the new wording, who sees it and the file it lives in. Anything marked "owner may revert" was kept by controller ruling.

## Owner checklist (start here)

About 10 minutes, one agency admin sign-in plus one client sign-in.

1. **Topic, not theme.** Client **Reviews** page: the filter reads **Topic** with **All topics**, the heatmap column header is **Topic** and its aria-label says topics. Platform **Topic proposals** (menu and page title). Nothing user-facing says "theme" (the route `/platform/themes` and `?theme=` are unchanged until 15b-3).
2. **Assistant name.** Agency **Alert review** note and **Approvals** description use the agency's assistant name (Branding & voice), never a fixed "Friday". Rename the assistant and reload both pages.
3. **Delivery label.** Client **Delivery** (agency staff only): the first option reads **I review alerts first (default)**.
4. **Business type.** Add a client (lookup form), the client **Business profile** form and the lead accept form all say **Business type** where they said "Vertical" or "Service type".
5. **Platform support, neutral.** Agency **Platform access**: the switch reads "Email me when platform support opens a session"; a session with no operator name shows "Platform support".
6. **Glossary.** Help page Glossary: **Topic**, **First steps** (new) and **Competitive pressure** (High / Medium / Low pressure, Quiet). A client owner must still not see agency-only terms (Seat, Upsell tag, Routing, Paused).
7. **Open decisions** at the end: say if you want any "owner may revert" row reverted.

## Changes

| # | Area | Old | New | Seen by | Where | Note |
|---|---|---|---|---|---|---|
| T1 | Reviews filter and heatmap | "Theme", "All themes", "N themes ... the theme comes up", "a theme comes up" | "Topic", "All topics", "N topics ... the topic comes up", "a topic comes up" | client and agency | `app/(app)/c/[clientId]/reviews/page.tsx`; `components/charts/theme-heatmap.tsx` (component name unchanged until 15b-3) | `?theme=` and `name="theme"` kept |
| T2 | Topic proposals | "Theme proposals" (menu, tab title, page title, breadcrumb) | "Topic proposals" | operator | `components/shell/nav-items.ts`; `app/(platform)/platform/themes/page.tsx` | Route `/platform/themes` and help key `page:platform.themes` kept |
| T3 | Topic proposal queue and catalogue | "unthemed reviews"; "Review themes (comma separated)" | "reviews with no topic"; "Review topics (comma separated)" | operator | `platform/themes/theme-queue.tsx`; `platform/verticals/catalog-queue.tsx` | |
| T4 | Heatmap tip, no-match line, workspace label, starting-point evidence text | "review themes ... that theme"; "business, theme or star"; "Theme"; "Theme ..." | "review topics ... that topic"; "business, topic or star"; "Topic"; "Topic ..." | client and agency | `help/copy/client.ts`; `packages/tools/src/workspace/labels.ts`; `packages/engine/src/briefs/starting-point.ts` | The model prompt in `server/vertical-draft.ts` still says "themes" (model-facing, output field is `themes`) |
| T5 | Guides | "theme(s)" in the Reviews guides (5 lines each) | "topic(s)" | client and agency | `docs/help/pages/client.reviews.{agency,client}.md` | |
| T6 | Alert review note | "Friday ..." typed into the string | the agency's assistant name | agency | `app/(app)/agency/alerts/alert-controls.tsx` (new `assistantName` prop) | Guides use `{{assistant}}`, short copy `{assistant}` |
| T7 | Approvals description | "Friday ..." | the agency's assistant name | agency | `app/(app)/agency/approvals/page.tsx` | |
| T8 | Platform knowledge page | "Articles Friday can search" | "Articles the Ask assistant can search" | operator | `app/(platform)/platform/knowledge/page.tsx` | Platform zone is product level, so no agency name |
| T9 | Delivery option | "After AM check (default)" | "I review alerts first (default)" | agency (client Delivery is agency-only) | `app/(app)/c/[clientId]/settings/delivery/delivery-controls.tsx` | Audit §3 standard |
| T10 | Business type labels | "Vertical", "Choose a vertical", "Service type" | "Business type", "Choose a business type" | agency; the Business profile form is also client-visible in create mode | Add a client lookup form; `ClientProfileForm`; lead accept form | Same `verticalId` field. E2E `getByLabel` locators updated. Owner may revert |
| T11 | Platform access (neutral) | "Email me when Rival Monday support opens a session"; fallback support name "Rival Monday support" | "Email me when platform support opens a session"; "Platform support" | agency | `agency/settings/platform-access/notify-switch.tsx:NOTIFY_LABEL`; `packages/tools/src/tools/support.ts:SUPPORT_DISPLAY_NAME` | Kept neutral so agency-facing help never names the product. The support-session email template still names the platform. Owner may revert |
| T12 | Quiet hours hint (Notification settings) | "No notifications by email in this window (in-app still arrive)." | "Emails in this window are held and sent when it ends (in-app notices still arrive at once)." | agency and client | `app/(app)/settings/notifications/contact-form.tsx` | The old line said emails were dropped; the code holds them (`outbox.ts:notify`, `notBefore`). See row A1 in the platform-account sign-off |
| T13 | Visible labels beside colour | colour-only pressure and confidence | "High pressure", "Medium pressure", "Low pressure", "Quiet"; "High confidence NN%" (85% and over) else "Confidence NN%" | client and agency | `components/pressure-badge`; `components/confidence-label.ts` | There is one confidence band in code; help never mentions Medium or Low confidence |

## Glossary changes (`packages/core/src/help/glossary.ts`; no placeholders)

| Term id | Change | Audience | Source |
|---|---|---|---|
| `topic` (was `theme`) | Term "Topic"; text says topics; source comment notes the packs still call them themes. `seeAlso` and the Business type entry follow. | all | `packages/engine/src/reviews/benchmark.ts:summarizeWindow` |
| `business-type` | "review themes" -> "review topics". Long text still says older screens may call it the vertical or industry. | all | `packs/*.yaml` |
| `pressure` | Level words match the badge: "70 and above is High pressure, 40 to 69 is Medium pressure, 1 to 39 is Low pressure, and a competitor with nothing recent scores 0 and shows as Quiet" (was "high / elevated / low"). | all | `packages/tools/src/pressure.ts` bands match `PressureBadge` |
| `first-steps` (new) | "The first actions suggested for your business in the starting point. They are your own to-dos, not something a competitor did." Long text: not a move; the starting point lists the first steps still open. See also starting point, move, recommendation. | all | `packages/engine/src/briefs/scorecard-model.ts:scorecardModel` (`openFirstMoves`); `components/views/scorecard.tsx` |
| Already present, unchanged | competitor (Top rival is a tier), tier, change, move, signal, brief, report, alert, business type, seat (= an active client; agency only), paused (client paused vs service paused; agency only), starting point | | |

Audit §3 terms and where each lives: competitor / Top rival (`competitor`, `tier`), change / move / signal (own terms), first steps (new), brief / report / alert (own terms), business type, seat, paused, topic, starting point.

## Open decisions

1. **"First moves still open"** is still the heading in the starting-point scorecard (`components/views/scorecard.tsx`) and in the client Briefs guide, while the glossary term is "First steps" and "move" means a competitor pattern. Rename the heading to "First steps still open", or keep the code label and have the glossary say "shown as First moves"? Not changed here (a visible UI label; needs your call).
2. T10 (Business type) and T11 (neutral Platform access label) were kept by controller ruling; revert if you prefer the old words.
3. Model-facing text (tool descriptions, the vertical-draft prompt) still says "theme"/"Friday" where the model's field names require it; not user-facing, left for 15b-3.
