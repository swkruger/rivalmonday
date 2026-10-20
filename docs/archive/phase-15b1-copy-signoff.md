# phase-15b-1 - help copy for owner sign-off

Draft copy for the 15b-1 help system (2026-10-19), quoted from the source. Approve or edit per section; edits go back into the named file.

- **Audience**: `all` = everyone; `agency` = agency staff only; `client` = client owners, viewers and guests only (B2). Client roles never receive `agency` text.
- **Placeholders**: short copy uses `{client}`, `{agency}`, `{assistant}`; guides use `{{client}}`, `{{product}}` (the agency's name; "your agency" when it has none), `{{assistant}}`. With no client name, `{client}`/`{{client}}` reads "your business" to client viewers and "the client" to agency staff and operators. The glossary uses none (it feeds both renderers). Nothing names the product or the default assistant.
- **Sources**: glossary in `packages/core/src/help/glossary.ts`; tips, descriptions and empty states in `apps/web/src/help/copy/client.ts`; guides in `docs/help/pages/`. Every metric definition cites the function that computes it in a code comment.

## Glossary

| Term | Audience | Short | Long |
|---|---|---|---|
| Alert | all | A change important enough not to wait for the weekly brief: its score reached the alert level. Alerts arrive between briefs. |  |
| Average map rank | all | For one search term, the average position a business holds in Google Maps results across all points of the rank grid. 1 is best. | A point where the business is not in the first 20 results counts as 21. |
| Brief | all | The weekly report on competitors, dated each Monday. Each item says what changed, why it matters and what to do, with its evidence. | A quiet week says so instead of padding the brief, and shows "Where you stand": how the business compares with its competitors on rating, new reviews, reply rate and map positions. |
| Business type | all | The kind of business, such as HVAC and plumbing or dental. It decides which services, review themes and scoring rules apply. | Business types come from a shared catalog. Older screens may still call this the vertical or industry. |
| Change | all | One difference found in a competitor's public information, such as a new price, a new offer or page, an ad that started or stopped, or a jump in reviews. | The same change seen in several places, say the website and an ad, is shown once. Every change links to its evidence and gets a score. |
| Competitive pressure | all | How much a competitor has been doing lately that could affect the business, from 0 to 100. | It combines the scores of its changes from the last 30 days that made the brief or an alert, plus its open moves (active, confident moves count for more). Each one adds to the total without it passing 100. 70 and above is high, 40 to 69 is elevated and below 40 is low. A competitor with nothing recent scores 0. |
| Competitor | all | A local business that competes for the same customers in the same area. Each one is monitored from public information only: its website, Google profile, reviews, ads and job posts. | Competitors are grouped into tiers. "Top rival" is a tier, not another word for competitor. |
| Confidence | all | How sure the system is about a change or a move, as a percentage. | For a change, it reflects how clearly the checks could read it. For a move, it grows with each extra supporting change and each extra channel. Brief items at 85% or more have an amber edge. |
| Evidence | all | The proof behind a claim: a screenshot or the captured text, with where and when it was captured. | No evidence, no claim: nothing goes into a brief or an alert without it. |
| Local pack | all | The few businesses Google shows with a map at the top of local search results. Here it means the top 3 map results. | Rank scans read the first 20 map results from each point of a grid spread across the service area. |
| Monitoring paused | client | Your agency has paused monitoring for your business. No new checks, briefs or alerts arrive until it is resumed. | Contact your agency to resume. |
| Move | all | A pattern in one competitor's changes over the last 90 days, such as a price war, a promo blitz, an ad surge, a new service line or a push into new areas. | A move starts as Emerging. It becomes Active once it has held for 7 days, or straight away when the evidence is strong. It is Fading when no new supporting change has appeared for 30 days, and it closes when the pattern has not held for 30 days. |
| Paused | agency | Means two different things. A paused client gets no scheduled checks, briefs or alerts and does not use a seat. A paused service is your agency subscription on hold for billing. | While the service is paused the workspace is read-only and all recurring work stops until billing is sorted out. A paused client's owner sees that monitoring is paused and is asked to contact you. |
| Quarterly report | all | A look at competitor trends over a whole quarter, as a page and a PDF. The first one arrives after a full quarter of monitoring. |  |
| Recommendation | all | A suggested next step, from a brief or saved from a chat answer, with an effort and impact rating. | Each one moves from To do to In progress to Done, or can be dismissed. |
| Reply rate | all | The share of a business's Google reviews from the last 90 days that have a reply from the owner. | It shows a dash when there were no reviews in that time. |
| Review velocity | all | How fast a business gets new Google reviews, shown as reviews per month: the reviews posted in the last 6 months, divided by 6. |  |
| Routing | agency | Where a scored change goes: Alert (at or above the alert level), Brief (at or above the brief level) or Archived (below both). | Two caps send a would-be alert to the brief instead: the change still needs a human check, or it is too old to be urgent. A competitor promoted to Top rival is routed as an alert, other promotions go to the brief, and demotions are archived. The levels default to 70 and 40 and can be changed per client under Settings › Alert rules. Instant alerts are limited to 3 a day; extra ones go into the daily digest. How an alert then reaches the client (direct, after your check, or digest only) is set under Settings › Delivery. |
| Score | all | How much a change matters to the business, from 0 to 100. It is 100 × type × size × relevance × novelty, each factor between 0 and 1. | Type: how much this kind of change usually matters. Size: how big it is, such as the size of a price cut. Relevance: whether it touches services the business offers and, for changes to a service area, the area it serves. Novelty: whether it is new rather than a repeat of something already seen. By default a score of 70 or more is an alert, 40 or more goes in the brief, and anything lower is archived. |
| Seat | agency | One active client on your agency's plan. Paused clients and prospects don't use a seat. | The plan includes a number of seats; each extra active client is billed as one more seat. |
| Share of voice | all | Of all the top-3 map spots in a weekly rank scan (every grid point and search term), the share each business holds. | For example, a business that holds 12 of 60 top-3 spots has a 20% share of voice. Businesses that are not tracked are grouped as "Other businesses". |
| Signal | all | A quick fact about a competitor, shown as a small pill: its Google rating, its new reviews in the last 30 days, its Google ads and its Meta ads. | A highlighted pill is worth a look, for example 5 or more new reviews in 30 days, or Google ads that started in the last 30 days. "Not checked" means the fact could not be read yet; it never means zero. |
| Starting point | all | The first brief for a new business: where it stands against its competitors before weekly briefs begin. | It is prepared once the competitor list is set, from the Google profile, reviews, map rankings and competitors, and suggests first steps. |
| Theme | all | A topic customers bring up in reviews, such as response time, price transparency or cleanliness. Each business type has its own list. | A theme's share is the percentage of the reviews checked for that theme in the last 90 days that mention it. Its sentiment runs from very negative to very positive. |
| Tier | all | How closely a competitor competes: Top rival, Worth watching or Minor. | Tiers come from two checks. Overlap: how often the business shows up in Google Maps searches for the same services nearby (a higher spot, a shorter distance and the same main category count for more). Activity: its Google and Meta ads, its new reviews in the last 30 days and whether it has claimed its Google profile. A Top rival is high on both, Worth watching is high on either, and the rest are Minor. When activity could not be checked, Worth watching is the highest tier possible. |
| Upsell tag | agency | A note on a brief item or recommendation naming a service your agency could offer in response, such as local SEO, PPC or reputation work. | Only agency staff see it. It is removed from everything the client sees. |

## client.overview

### Description, tips, empty states

| Where | Audience | Text |
|---|---|---|
| Description | all | How {client} compares with its competitors this week. |
| Tip `changesWeek` (guide link: common-questions) | all | **Changes this week**: Competitor changes from the last 7 days that made the brief or an alert. The "high" pill counts how many of them were alerts. |
| Tip `priceMoves` | all | **Competitor price moves**: Competitor price changes from the last 7 days on services {client} offers, including small ones that did not make the brief. The pill counts the price cuts. |
| Tip `activeAds` | all | **Active competitor ads**: Competitor ads running now on Google and Meta, where the ad libraries show them, compared with a week ago. |
| Tip `ratingVsArea` | all | **Your rating vs area**: {client}'s Google rating next to the average rating of the tracked competitors. |
| Tip `pressure` (guide link: common-questions) | all | **Competitive pressure**: How much each competitor has been doing lately, from 0 to 100: its changes from the last 30 days that made the brief or an alert, plus its open moves. 70 and above is high, 40 to 69 elevated, below 40 low. The line under each name is its main reason. |
| Empty `noBrief` | all | **No briefs yet**: The first brief arrives on a Monday morning. It covers what {client}'s competitors changed, why it matters and what to do. |
| Empty `noCompetitorsAgency` | agency | **No competitors tracked yet**: Add competitors on the Competitors page to see how much pressure each one puts on {client}. |
| Empty `noCompetitorsClient` | client | **No competitors tracked yet**: Your competitors appear here once {agency} has set them up. |
| Empty `noMoves` | all | **No moves right now**: A move is a pattern in a competitor's changes, such as a price war or an ad surge. Moves show here when one is spotted. |
| Empty `noRecommendations` | all | **Nothing open right now**: New recommendations come with each brief. You can also save one from an {assistant} answer. |
| Empty `noReports` | all | **No quarterly reports yet**: The first report arrives after a full quarter of monitoring. |

### Guide: client (`docs/help/pages/client.overview.client.md`)

#### What this page tells you

Your home page: how {{client}} stands against its competitors this week, at a glance.

- **The four numbers at the top.** Competitor changes this week that made your brief or an alert, competitor price changes on services you offer, competitor ads running now, and your Google rating next to your competitors' average.
- **Your latest brief.** The main card. Each item says what a competitor changed, why it matters and what to do, with a link to the evidence. Before your first weekly brief, this card shows your starting point being prepared.
- **Competitive pressure.** Your competitors ranked by how much they have been doing lately, from 0 to 100, with the main reason under each name.
- **Below that:** recent alerts, moves (patterns in a competitor's changes), competitor ad activity over 12 weeks, your open recommendations, past briefs and quarterly reports.

#### How to use it

1. **Start with the brief.** Read the items in order. Open the evidence on anything you want to check for yourself.
2. **Check who is pushing hardest.** In **Competitive pressure**, the competitor at the top has been the most active. Select a name to see everything about that competitor.
3. **Act on your recommendations.** Open **Recommendations** to see what to do next and mark items as you go.
4. **Ask a question.** If you see the **Ask {{assistant}}** box, type a question about your competitors. Answers come from the same evidence.

Select the **?** next to a heading for a short explanation.

#### Common questions

##### What does the "high" pill on "Changes this week" mean?

It counts the changes from the last 7 days that were important enough to be sent as alerts. The big number counts every change that made your brief or an alert.

##### How is competitive pressure worked out?

It adds up a competitor's changes from the last 30 days that made your brief or an alert, plus any moves it is making, such as a price war or an ad surge. Each one pushes the number up without it passing 100. 70 and above is high, 40 to 69 is elevated and below 40 is low. A competitor with nothing recent scores 0.

##### Why does my rating show a dash?

Your own Google profile has not been read yet. Contact {{product}} if it stays that way after your next brief.

##### When do briefs arrive?

Every week, dated Monday. A new business first gets a **starting point**: where you stand against your competitors on your Google profile, reviews, map rankings and competitors, with first steps to take.

##### What if nothing happened this week?

The brief says it was a quiet week instead of padding it out, and shows **Where you stand**: how you compare with your competitors on rating, new reviews, reply rate and map positions.

### Guide: agency (`docs/help/pages/client.overview.agency.md`)

#### What this page tells you

The client's home page: how {{client}} stands against its competitors this week. The client sees the same page, without the agency-only parts noted below.

- **The four numbers at the top.** Competitor changes in the last 7 days that made the brief or an alert (the "high" pill counts the alerts), competitor price changes on services {{client}} offers (every change, including archived ones), competitor ads running now on Google and Meta, and the client's Google rating next to the tracked competitors' average.
- **Latest brief.** The newest brief, as the client reads it, plus agency-only details: **Upsell** tags and the status of dropped or replaced items. Before the first weekly brief, this card shows the starting point being prepared.
- **Competitive pressure.** Tracked competitors ranked from 0 to 100, with the main reason under each name.
- **Below that:** recent alerts, moves, 12 weeks of competitor ad activity, open recommendations, past briefs and quarterly reports.
- **Agency only:** the setup badge while the client's setup has open steps, and **Pitch snapshot** when the prospect report made before the client signed up is ready.

#### How to use it

1. **Finish setup first.** If the setup badge shows, open it and complete the open steps. Monitoring is only as good as the competitor list and the client profile.
2. **Review the starting point.** When it is ready for review, **Review it** opens **Approvals**, where you check and send it.
3. **Read the brief before the client does.** Check each item's evidence and confidence; brief items at 85% confidence or more have an amber edge. Use the upsell tags to plan what to offer.
4. **Watch pressure.** A competitor at 70 or more is worth a call with the client. Select its name for the full competitor page.
5. **Adjust delivery when needed.** Score levels for alerts and the brief are under **Settings › Alert rules**; how alerts reach the client (direct, after your check, or digest only) and whether briefs send automatically are under **Settings › Delivery**.

#### Common questions

##### Why does the rating card show a dash?

The client's own Google business has not been read yet. Add its Google place id under **Settings › Business profile**; the rating appears after the next Google profile check.

##### How is competitive pressure worked out?

From the last 30 days: the scores of the competitor's changes routed to the brief or an alert, plus its open moves (active, confident moves weigh more). They are combined so that each adds to the total without it passing 100. 70 and above is high, 40 to 69 is elevated, below 40 is low. Archived changes don't count.

##### Does the client see upsell tags?

No. Upsell tags, item statuses and the pitch snapshot are agency-only; they are removed from everything the client sees.

##### Why do "Changes this week" and "Competitor price moves" disagree?

"Changes this week" counts only changes routed to the brief or an alert. "Competitor price moves" counts every price change on a service the client offers, including archived ones.

##### When does the first quarterly report appear?

After a full quarter of monitoring.

## client.changes

### Description, tips, empty states

| Where | Audience | Text |
|---|---|---|
| Description | all | Everything {client}'s competitors changed, scored for how much it matters. Every change links to its evidence. |
| Tip `score` (guide link: how-to-use-it) | all | **How the score works**: Each change scores 0 to 100: 100 × type × size × relevance × novelty, each factor between 0 and 1. The line under the bars shows where alerts and the brief start. |
| Tip `routes` (guide link: how-to-use-it) | client | **Alert, Brief and Archived**: Alert: important enough to send between briefs. Brief: goes in the weekly brief. Archived: recorded, but too small to report. Choose All or Archived to see everything that was found. |
| Tip `routing` (guide link: how-to-use-it) | agency | **Routing**: Alert at or above the alert level, Brief at or above the brief level, Archived below both. A change that still needs a check, or is too old to be urgent, goes to the brief instead of an alert. Change {client}'s levels under Settings › Alert rules. |
| Empty `noMatch` | all | **No changes match these filters**: Try a longer period, or All to include archived changes. A newly added competitor shows changes after its first checks. |
| Empty `noSelection` | all | **Pick a change**: Select a change on the left to see the evidence behind it and why it scored as it did. |

### Guide: client (`docs/help/pages/client.changes.client.md`)

#### What this page tells you

Every change found in your competitors' public information: prices, offers, pages, ads, reviews, Google profiles, map rankings and job posts. Each change has a score from 0 to 100 for how much it matters to {{client}}, and links to its evidence.

The list on the left is grouped by week. Select a change to see it on the right: what changed, before and after, and why it scored as it did.

#### How to use it

1. **Pick what to look at.** Search, or filter by competitor, change type, service or period (the last 7, 30 or 90 days, or a year), then select **Apply**.
2. **Choose which changes to show.** **Alerts + brief** (the default) shows the changes that were reported to you. **All** adds the archived ones; **Archived** shows only those.
   - **Alert**: important enough to send between briefs.
   - **Brief**: included in your weekly brief.
   - **Archived**: recorded, but too small to report.
3. **Check the evidence.** **Side by side** shows screenshots from before and after; **Text changes** shows the words that changed. When the same change was seen in several places, an **Evidence** button appears for each.
4. **Read the score.** "Why this scored" breaks the score into four parts, each from 0 to 1:
   - **Type**: how much this kind of change usually matters.
   - **Size**: how big it is, such as the size of a price cut.
   - **Relevance**: whether it touches services you offer and, for changes to a service area, the area you serve.
   - **Novelty**: whether it is new rather than a repeat.

   The score is 100 times the four multiplied together. The line under the bars shows where alerts and the brief start.
5. **Say whether it helped.** If you see **Useful**, **Not relevant** and **Wrong**, pick one. Your answer is saved with the change.

#### Common questions

##### Why can't I see a change I heard about?

Try **All** and a longer period. Changes that scored too low are archived, not deleted. A competitor that was added recently shows changes after its first checks.

##### What does "Part of moves" mean?

The change is one piece of a bigger pattern by that competitor, such as a price war or an ad surge. Select the move to see the whole pattern.

##### Can the levels for alerts and the brief change?

Yes. If you see **Alert rules** in your settings, you can change them there; otherwise ask {{product}}. New levels apply to changes found from then on.

##### Why does a high score sometimes go to the brief and not an alert?

A change found more than 7 days after it happened is no longer urgent, and a change that still needs a second look waits for the brief. Instant alerts are also limited to 3 a day; extra ones go into the daily digest.

### Guide: agency (`docs/help/pages/client.changes.agency.md`)

#### What this page tells you

Every change detected for {{client}}'s tracked competitors, with its score (0 to 100), its route (Alert, Brief or Archived) and its evidence. The list is grouped by week; the right panel shows the selected change. Client users see the same page.

#### How to use it

1. **Filter.** Search, or filter by competitor, change type, service or period (7, 30 or 90 days, or a year), then **Apply**.
2. **Choose a route.** **Alerts + brief** (the default) shows what reached the client. **All** adds archived changes; **Archived** shows only those. Check **Archived** when a client asks about something they did not hear about.
3. **Check the evidence.** **Side by side** shows the before and after screenshots, **Text changes** the changed words, and **Capture details** when each side was captured, its status and its file hash. When the same change was seen in several places, an **Evidence** button appears for each.
4. **Read the score.** Score = 100 × type × size × relevance × novelty, each from 0 to 1. Relevance is service overlap × area overlap; area only counts for service-area and new-location changes.
5. **Understand the routing.** Alert at or above the alert level, Brief at or above the brief level, Archived below both (defaults 70 and 40). A would-be alert goes to the brief when the change still needs a human check, or when it is older than the business type's alert age limit (7 days in every current business type). Tier changes are fixed: a promotion to Top rival is an alert, other promotions go to the brief, and demotions are archived.
6. **Give feedback.** **Useful**, **Not relevant** or **Wrong** is saved with the change.

#### Common questions

##### How do I change when something becomes an alert?

Under **Settings › Alert rules** for this client. New levels apply to changes detected from then on; changes already scored keep their route. How alerts reach the client (direct, after your check, or digest only) is under **Settings › Delivery**.

##### Why did a high-scoring change not become an alert?

One of the caps applied (it needs a check, or it is too old), or the client already had 3 instant alerts that day; extra ones go into the daily digest.

##### Do archived changes count anywhere?

They don't count toward competitive pressure or "Changes this week". They do count toward "Competitor price moves" on the Overview.

##### What does "Part of moves" mean?

The change supports one or more moves (patterns over the last 90 days). Select a move to open it on the Moves page.

## client.reviews

### Description, tips, empty states

| Where | Audience | Text |
|---|---|---|
| Description | all | What customers say about {client} and its competitors on Google. |
| Tip `newReviews` | all | **New reviews (90 days)**: Reviews posted on {client}'s Google profile in the last 90 days. |
| Tip `heatmap` (guide link: how-to-use-it) | all | **Reading the heatmap**: Rows are review themes; columns are businesses, {client} first. The number is the share of the reviews checked for that theme in the last 90 days that mention it. The color is how positive those mentions are: blue is positive, red is negative, gray is neutral. A dash means there are not enough reviews, and ▲▼ marks a change of 5 points or more since the previous 90 days. |
| Tip `ratingMix` | all | **Your rating mix**: How many of {client}'s collected Google reviews gave 1, 2, 3, 4 or 5 stars. |
| Tip `ratingTrend` | all | **Rating trend**: The average stars of the reviews posted in each month, for {client} and each competitor. A month without reviews has no point. With many competitors, some are combined into one "Other (average)" line. |
| Empty `noMatch` | all | **No reviews match**: Try another business, theme or star rating, or a longer period. |

### Guide: all (`docs/help/pages/client.reviews.md`)

#### What this page tells you

What customers say on Google about {{client}} and its competitors.

- **The four numbers at the top** are for {{client}}: its Google rating, new reviews in the last 90 days, reviews per month (the last 6 months, averaged) and its reply rate (the share of the last 90 days' reviews that got a reply from the owner).
- **What customers talk about** is a heatmap of review themes, topics such as response time or cleanliness, for each business, {{client}} first.
- **Your rating mix** shows how many reviews gave 1 to 5 stars; **Rating trend** shows the average stars per month over the last 12 months.
- **Reviews** lists the reviews themselves.

#### How to use it

1. **Read the heatmap row by row.** Each row is a theme and each column a business.
   - The **number** is the share of the reviews checked for that theme in the last 90 days that mention it.
   - The **color** is how positive those mentions are: blue is positive, red is negative and gray is neutral.
   - A **dash** means there are not enough reviews. **▲** or **▼** means the share moved by 5 points or more compared with the previous 90 days.
   - Prefer a table? Open **Show as table** under the heatmap. The second number there is the sentiment, from -1 (very negative) to +1 (very positive).
2. **Find what competitors are praised or criticized for.** A theme that is blue for a competitor and red for {{client}} is worth acting on.
3. **Read the reviews behind it.** Filter **Reviews** by business, theme, stars, period or words, then select **Search**.
4. **Keep an eye on replies.** A low reply rate next to competitors who reply often is an easy thing to fix.

#### Common questions

##### Why are my own numbers missing?

The page needs {{client}}'s own Google business on file. Until then it shows a note instead of the numbers; they appear after the next Google profile check.

##### Which reviews count?

The Google reviews collected for each business. The numbers at the top and the heatmap use the last 90 days, reviews per month uses the last 6 months, and the rating mix uses every review collected.

##### What is the difference between the rating and the rating trend?

The rating is the overall rating on the Google profile. The trend averages only the reviews posted in each month, so it shows recent changes sooner.

## Help pages

`/platform/help`, `/agency/help`, `/c/<id>/help` (Task 7, `components/help/help-index.tsx`, the three `help/page.tsx`).

| Where | Audience | Text |
|---|---|---|
| Page title (all three) | all | "Help" |
| Description, platform | operator | "Guides and search for the platform console." |
| Description, agency | agency | "Guides and search for your agency workspace." |
| Description, client | all | "Guides and search for this workspace." |
| Search box label and placeholder | all | "Search help" |
| Search button | all | "Search" |
| Results heading | all | "Search results" |
| No results | all | "No results for “{query}”." |
| Guides heading | all | "Guides" |
| No guides | all | "No guides are available here yet." |
| Guide group headings | all | the menu's section labels, plus "General" (unlabeled section), "Settings", "Other" |
| Glossary heading | all | "Glossary" |
| Ask link (client context, Ask on, not in a support session) | all | "Ask {assistant}" |
| Contact link (client roles, when the agency has a sender address) | client | "Contact your agency" |

## UI strings

| Where | Audience | Text |
|---|---|---|
| Avatar menu item (opens the current context's Help page) | all | "Help" |
| `PageHeader` guide button | all | "Guide" (with a "?" icon) |
| Guide sheet title while loading | all | "Page guide" |
| Guide sheet loading (screen readers) | all | "Loading the guide" |
| Guide sheet load error | all | "We could not load this guide. Close it and try again." |
| Guide sheet, no guide for this viewer | all | "This guide is not available." |
| Guide sheet footer (client pages, Ask on) | all | "Ask {assistant} about this page" (asks: "Explain the {page title} page") |
| Guide sheet footer (not on platform pages) | agency, client | "Open full article" |
| Term tip button label | all | "What is {term}?" (page tips use the tip title) |
| Tip and empty-state link (only when the page has a guide for this viewer) | all | "More in the guide →" |
| Overview description | all | "How {client} compares with its competitors this week." followed by the existing "Tracking N competitors across N ZIP codes · Brief for the week of …" (the client name prefix moved into the sentence) |

## Questions for the owner

1. **Confidence is `all`, not agency-only.** Clients already see "Confidence N%" on brief items and moves, so an agency-only definition would leave them with an unexplained number. Keep `all`, or hide the percentage from clients (15c)?
2. **Theme or topic?** The audit standard is "topic", but the Reviews page still says "Theme" (filter, heatmap). The glossary term is "Theme" ("a topic customers bring up"). Rename everywhere in 15b-2?
3. **"After AM check"** is still the Delivery label. The guides call it "after your check"; the audit's "I review alerts first" lands with 15b-2's terminology fixes. OK?
4. **Paused**: one agency term covering both meanings (paused client vs paused service) and a separate client term "Monitoring paused". OK, or two agency terms?
5. **Glossary without names**: no `{client}`/`{assistant}` in the glossary (the web and KB renderers use different placeholder syntax), so it says "the business" and "a chat answer". Acceptable?
6. **Seat** gives no prices (they live in billing). Add the plan numbers?
7. **Reviews** has one guide for everyone. The agency version could add "add the place id under Settings › Business profile" for the missing-numbers case. Worth a separate agency guide?
8. **Client Changes guide** tells clients about the 3-a-day instant alert cap and the 7-day age cap. Too much detail for owners?
9. **Empty states on the Overview** now use the dashed `EmptyState` box inside the small cards (pressure, moves, recommendations, reports). Visually heavier than the old one-line text; keep, or keep one-liners for in-card empties?
10. **Client guide wording "Contact {{product}}"**: renders the agency's name for clients (or "your agency"). OK as the contact route?
