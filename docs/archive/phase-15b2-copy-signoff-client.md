# phase-15b2 - client batch A help copy for owner sign-off

**Status: draft for owner sign-off (Task 4, 2026-10-20).** Batch: Competitors, Competitor profile, Pricing, Ads, Local rankings, Moves (client context). Tasks 5-6 append their batches below as new "Batch" sections.

- **Audience**: `all` = everyone; `agency` = agency staff only; `client` = client owners, viewers and guests only. Client roles never receive `agency` text.
- **Placeholders**: short copy uses `{client}`, `{agency}`, `{assistant}`; guides use `{{client}}`, `{{product}}`, `{{assistant}}`.
- **Sources**: short copy cites the code beside each string in `apps/web/src/help/copy/client.ts`; the "Source" column repeats it. Guide numbers are listed with their sources in "Numbers in the guides".
- **Wiring**: each page passes `helpKey` + `guide={guides.has(KEY)}` to `PageHeader`, and uses `PAGE_COPY['client.<page>'].description`.

# Batch: client A (Competitors, Competitor profile, Pricing, Ads, Local rankings, Moves)

## client.competitors

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | The competitors monitored for {client}. Each one is rated by how closely it competes with {client}. | page header (`PageHeader.description`) |
| Tip `tiers` | all | **Competitor tiers**: How closely a competitor competes with {client}. Top rival: it shows up in the same local searches and is active, with ads, new reviews or a claimed Google profile. Worth watching: strong on one of those. Minor: the rest. If a competitor's activity could not be checked, Worth watching is the highest tier it can get. The list starts with Top rivals. | `packages/collectors/src/rivals/score.ts:tierFor (overlap, activity; with activity unknown the best tier is Worth watching); labels: packages/core/src/domain.ts:TIER_LABELS; order: competitors/competitor-controls.tsx:TrackedCompetitorsTable (TIER_RANK)` |
| Tip `rated` | all | **The "Rated" date**: The day this competitor's tier and signals were last refreshed. It is a date, not a star rating: Google star ratings are on the Reviews page. "Not rated yet" means no tier has been worked out for it yet. | `packages/collectors/src/signals/tracked.ts:computeTrackedSignals (computedAt = when the tier and signals were last computed); apps/web/src/components/rival/rated-label.ts:ratedLabel` |
| Tip `suggestions` | agency | **Suggested competitors**: Businesses found by searching {client}'s service area, grouped by tier. Top rivals start ticked, up to the room left under the client's competitor limit. Dismiss hides one; "Show hidden" lists what the search left out and why. A search takes 20 to 40 minutes, and a client can have one manual search per week. | `apps/web/src/app/(app)/c/[clientId]/competitors/competitor-controls.tsx:initialSelection (preselected = Top rivals, up to the room left), useSearchProgress (20-40 minute search); packages/tools/src/rival-search.ts:weeklyLimitMessage (one manual search per client-local week)` |
| Empty `noTrackedAgency` | agency | **No competitors tracked yet**: Accept a suggestion below or add one by name. A name is required; a website is optional. | wording only; the condition is the page state it replaces |
| Empty `noTrackedManage` | client | **No competitors tracked yet**: Add one with the form below. A name is required; a website is optional. | wording only; the condition is the page state it replaces |
| Empty `noTrackedView` | client | **No competitors tracked yet**: Your competitors appear here once {agency} has set them up. | wording only; the condition is the page state it replaces |

## client.competitors.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Everything monitored for this competitor: its prices, ads, reviews, local rankings and a timeline of changes. | page header (`PageHeader.description`) |
| Tip `collection` | all | **Collection status**: Each source monitored for this competitor, such as its Google profile or ads, and when it last ran. A note after the time, like "Not found" or "Retrying", describes that last run. "Paused" means the source is switched off. | `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/source-status.ts:sourceStatusLabel; packages/tools/src/tools/competitor-profile.ts:getCompetitorProfile (sources: lastRunAt, lastStatus, active)` |
| Tip `pagesMonitored` | all | **Pages monitored**: Pages on the competitor's own website that are checked for changes, such as prices, offers and service pages. "Site blocks monitoring" appears when the latest check of a page was refused by the site, so changes on it cannot be seen. | `packages/tools/src/tools/competitor-profile.ts:getCompetitorProfile (pages.active = active tracked pages; pages.blocked = latest capture blocked or robots_disallowed)` |
| Tip `openMoves` | all | **Open moves**: How many of this competitor's moves are still open. A move is a pattern across several of its changes, such as a price war. Select the number to open the Moves page. | `packages/tools/src/tools/competitor-profile.ts:getCompetitorProfile (openMoves = this client's moves for the competitor with closedAt null and live events)` |
| Tip `pinned` | agency | **Pinned pages**: A pinned page is checked daily; other pages follow the default schedule for their type. Pages belong to the competitor, so pinning applies to every client that tracks it. | `packages/tools/src/tools/pages.ts:setPagePin (pinned = daily cadence, otherwise the default cadence for the page type); packages/db/src/schema/evidence.ts:trackedPage (shared by every client tracking the competitor)` |
| Empty `noPages` | all | **No pages tracked yet**: Pages on the competitor's own website are found automatically and listed here once they are. | wording only; the condition is the page state it replaces |

## client.pricing

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | What each competitor charges on its website now, and how that changed. Pick a service to see its price history. | page header (`PageHeader.description`) |
| Tip `priceChange` | all | **Price change tag**: Compares the competitor's lowest price for a service now with its lowest price 90 days ago. A red ▼ means the price fell and a green ▲ means it rose. The tag shows only when both prices are known and they differ, and it always looks back 90 days, whatever period you pick for the history. PROMO marks a price listed as a promotion. | `packages/tools/src/tools/pricing.ts:getPriceMatrix (change = lowest price now vs 90 days ago, only when both known and different; promo flag); apps/web/src/app/(app)/c/[clientId]/pricing/price-card.tsx (CHANGE_TONE)` |
| Tip `yourService` | all | **"Your service" tag**: Marks a service {client} offers too, so you can compare like with like. It tags the service, not the price: every price on a card is the competitor's. | `packages/tools/src/tools/pricing.ts:getPriceMatrix (services[].offered = the client's own services)` |
| Empty `noCompetitorsAgency` | agency | **No competitors tracked yet**: Add competitors on the Competitors page. Prices come from each competitor's own website. | wording only; the condition is the page state it replaces |
| Empty `noCompetitorsClient` | client | **No competitors tracked yet**: Your competitors appear here once {agency} has set them up. | wording only; the condition is the page state it replaces |
| Empty `noPrices` | all | **No prices found yet**: Prices come from the competitors' own websites. A card fills in once a page that lists prices has been read; a competitor that does not publish prices stays empty. | wording only; the condition is the page state it replaces |

## client.ads

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Ads your competitors run on Google and Meta, with when each one was first and last seen. | page header (`PageHeader.description`) |
| Tip `adsPerWeek` | all | **Active ads per week**: How many ads each competitor had running on each weekly date, for the last 12 weeks. A week before a competitor's ads were first checked is left blank, not shown as zero. | `packages/tools/src/workspace/ads.ts:adWeeklySeries (weekly dates, null before the first ad check); ads/page.tsx (weeks: 12)` |
| Tip `status` | all | **Active and ended ads**: An ad is active while the ad library still shows it (for Google ads, if it was shown in the last 14 days). Ended ads have stopped; each card shows when it was first and last seen. | `packages/collectors/src/ads/google.ts:ACTIVE_WINDOW_MS (14 days); packages/collectors/src/ads/meta.ts (is_active flag); packages/tools/src/tools/ads.ts:listAds (status filter)` |
| Tip `targeting` | all | **Targeting**: The public ad libraries do not say who a US ad was aimed at, so each card reads "Targeting not disclosed (US)". Nothing on this page, and no brief, guesses at it. | `apps/web/src/app/(app)/c/[clientId]/ads/ad-card.tsx ("Targeting not disclosed (US)"); packages/engine/src/briefs/rules.ts (a targeting claim without targeting evidence is dropped)` |
| Empty `noMatch` | all | **No ads match these filters**: Try All platforms and All statuses, or another competitor. A competitor with no ads in the Google or Meta libraries has nothing to show. | wording only; the condition is the page state it replaces |

## client.rankings

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Where each business shows up in Google’s local results across {client}’s service area, from the weekly rank scan. | page header (`PageHeader.description`) |
| Tip `grid` | all | **The rank grid**: A square of search points spread across the service area; the page shows its size, such as 7×7. Each point is a Google Maps search made as if from that spot, and its cell shows where the business appeared in the first 20 results. Darker is better, 20+ means not in the first 20, and a hatched cell means no data for that point. | `packages/collectors/src/rankings/scan.ts:scanRankings (gridSize 5 or 7, depth 20); apps/web/src/components/charts/geo-grid.tsx:rankFill (colour steps, "20+", no-data hatch)` |
| Tip `avgRank` | all | **Average map rank**: For one search term, the average position the business holds across all points of the grid; 1 is best. A point where the business is not in the first 20 results counts as 21. The line chart shows the average scan by scan. | `packages/engine/src/structured/rank.ts:rankMetrics (NOT_FOUND_RANK = 21)` |
| Tip `sov` | all | **Share of voice**: Of all the top-3 spots in a scan (the local pack, the map results Google shows first), across every grid point, the share each business holds. A business holding 12 of 60 spots has 20%. Businesses that are not tracked are grouped as "Other businesses". | `packages/tools/src/tools/rankings.ts:getShareOfVoice (top-3 slots per grid point; OTHER_BUSINESSES = "Other businesses")` |
| Tip `schedule` | all | **When scans run**: A rank scan runs once a week. Every scan is kept, so you can follow the trend with the slider or compare two scans. | `apps/worker/src/jobs/vendor.ts:rankSchedule (cron "0 6 * * 0": weekly)` |
| Tip `compare` | all | **Compare two scans**: Pick two scans to see the change at each point: blue means the business moved up, orange means it moved down, "=" means no change, and the number is how many places. Only scans with the same settings can be compared. | `apps/web/src/components/charts/change-grid.tsx:changeFill (blue = moved up, orange = moved down, "=" = same; step per 1-2, 3-5, 6+ places); rankings/page.tsx (settingsKey must match)` |
| Tip `scanNow` | agency | **Scan now limits**: The weekly scan runs on Sundays at 06:00 UTC. Scan now starts an extra one. A client can be scanned by hand once every 7 days, and your agency can start 10 manual scans a day (counted per UTC day). A scan that would push the client past its monthly cost cap is refused. Rank settings change the keywords (up to 5), grid size and radius for the next scan. | `packages/tools/src/limits.ts:RANK_MANUAL_PER_CLIENT_DAYS (7), RANK_MANUAL_PER_AGENCY_DAY (10); packages/tools/src/rank-scan.ts:rankScanAvailability (UTC day; monthly cost cap); apps/worker/src/jobs/vendor.ts:rankSchedule (Sunday 06:00 UTC); packages/collectors/src/rankings/settings.ts (RANK_MAX_KEYWORDS 5)` |
| Empty `noKeywordsAgency` | agency | **Rank tracking has not started**: Add keywords and a service area on the Business profile page. The weekly scan then picks the client up, or you can start one with Scan now. | wording only; the condition is the page state it replaces |
| Empty `noKeywordsClient` | client | **Rank tracking has not started**: Rank tracking starts once {agency} has set up {client}'s keywords and service area. | wording only; the condition is the page state it replaces |
| Empty `noScan` | all | **No scan yet**: Scans run once a week. The first one fills this page with a map of where {client} shows up in local results. | wording only; the condition is the page state it replaces |
| Empty `noBusinessAgency` | agency | **No business to show yet**: Add {client}'s Google place id on the Business profile page, or track a competitor, to see a grid. | wording only; the condition is the page state it replaces |
| Empty `noBusinessClient` | client | **No business to show yet**: The grid appears once {agency} has added {client}'s Google business or a competitor. | wording only; the condition is the page state it replaces |
| Empty `compareNeedsTwo` | all | **Compare needs two scans**: Scans run once a week, so Compare is available after the second one. | wording only; the condition is the page state it replaces |

## client.moves

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Patterns across several changes, such as a competitor expanding, cutting prices or pushing ads. Each one is backed by the changes listed. | page header (`PageHeader.description`) |
| Tip `statuses` | all | **Move statuses**: Emerging: just spotted. Active: it has held for 7 days, or the evidence is strong. Fading: no new supporting change for 30 days. Closed: the pattern has not held for 30 days. Open covers every move that is not closed. | `packages/engine/src/moves/moves-stage.ts:nextStatus (ACTIVE_AFTER_DAYS 7, FADING_AFTER_DAYS 30, CLOSE_AFTER_DAYS 30); packages/tools/src/tools/moves.ts:listMoves (open = not closed)` |
| Tip `signals` | all | **Signals on a move**: The signals on a move are the changes that support it: "3 signals" means three changes by this competitor fit the pattern. The list shows each one with its evidence. They are not the signal pills on the Competitors page. | `apps/web/src/app/(app)/c/[clientId]/moves/move-card.tsx (eventCount shown as "N signals"); packages/tools/src/tools/moves.ts (eventCount = live supporting events)` |
| Empty `noOpen` | all | **No open moves**: A move is a pattern in one competitor's changes, such as a price war or an ad surge. It appears here when one is spotted. Choose Closed or All to see earlier ones. | wording only; the condition is the page state it replaces |
| Empty `noMatch` | all | **No moves here**: Moves are spotted from patterns in a competitor's changes, so a quiet stretch can have none. | wording only; the condition is the page state it replaces |
| Empty `noSelection` | all | **Pick a move**: Select a move on the left to see the changes behind it and their evidence. | wording only; the condition is the page state it replaces |

Glossary terms used as tips on these pages (already signed off in 15b-1, unchanged): Signal (Competitors), Competitive pressure (Competitor profile).

## Guides

Files in `docs/help/pages/`. A split guide has an agency and a client version; the page cannot be reached by a role without its version.

| File | Audience | Title |
|---|---|---|
| `client.ads.md` | all | Ads |
| `client.competitors.agency.md` | agency | Competitors |
| `client.competitors.client.md` | client | Competitors |
| `client.competitors.detail.agency.md` | agency | Competitor |
| `client.competitors.detail.client.md` | client | Competitor |
| `client.moves.md` | all | Moves |
| `client.pricing.md` | all | Pricing |
| `client.rankings.agency.md` | agency | Local rankings |
| `client.rankings.client.md` | client | Local rankings |

### Guide: all (`docs/help/pages/client.ads.md`)

#### What this page tells you

The ads {{client}}'s competitors run on Google and Meta, taken from the public ad libraries.

- **Active ads per week** is a line chart of how many ads each competitor had running on each weekly date over the last 12 weeks. A week before a competitor's ads were first checked is left blank, not shown as zero.
- **Each card** is one ad: its platform, format, competitor, headline and text, where it points, and when it was first and last seen. A green **Active** tag means it is still running; **Ended** means it has stopped.
- **Targeting not disclosed (US)** appears on every card. The public ad libraries do not say who a US ad was aimed at, so nothing here, and no brief, guesses at it.
- **View in Meta Ad Library** or **View in Google Ads Transparency** opens the library's own page for the ad, when one is available.

#### How to use it

1. **Filter the list.** Choose a competitor, a platform (Meta or Google) and a status (Active, Ended or All), then select **Apply**.
2. **Start with Active.** An ad is active while the ad library still shows it; for Google ads, that means it was shown in the last 14 days.
3. **Watch the chart for surges.** A competitor whose line climbs is putting more ads out. The same pattern can appear as an ad surge on the Moves page.
4. **Read the creative.** The headline, text and landing page show the offer and the service being pushed, such as a tune-up special.

#### Common questions

### Why is a competitor's line blank at the start of the chart?

Its ads had not been checked yet in those weeks. A blank means "not looking yet", never zero. A competitor with no ads in the Google or Meta libraries has no cards to show.

### Why does a card show no picture?

Ads are shown as text. The library link opens the full ad.

### Why does "first seen" differ from when the ad started?

It is when the ad was first found by the checks, not necessarily when it began running.

### Guide: agency (`docs/help/pages/client.competitors.agency.md`)

#### What this page tells you

The businesses monitored for {{client}}. Client users see the same list, without the suggestions.

- **Tracked competitors** lists each competitor with its tier, its signal pills and its website. The count in the page header (for example 3 of 5) is {{client}}'s competitor limit.
- **Tier** says how closely a competitor competes. **Top rival**: it shows up in the same local searches and is active, with ads, new reviews or a claimed Google profile. **Worth watching**: strong on one of those. **Minor**: the rest. If a competitor's activity could not be checked, Worth watching is the highest tier it can get. The list starts with Top rivals, then Worth watching, Minor and competitors not rated yet.
- **Rated Mon 13 Oct** is the day the tier and signals were last refreshed. It is a date, not a star rating.
- **Signals** are the small pills: Google rating, new reviews in the last 30 days, Google ads and Meta ads. A highlighted pill is worth a look. "Not checked" means the fact could not be read yet; it never means zero.
- **Suggested competitors** (agency staff only) are businesses found by searching {{client}}'s service area, grouped by tier.

#### How to use it

1. **Open a competitor** to see its prices, ads, reviews, rankings and timeline.
2. **Track suggestions.** Top rivals start ticked, up to the room left under the limit. Tick or untick, then select **Track selected**. **Dismiss** removes a suggestion; **Show hidden** lists what the search left out and why, such as a different kind of business or one outside the service area.
3. **Find competitors.** The button needs keywords, a service area and a Google place id on the Business profile page (the page links to it when one is missing). A full search takes 20 to 40 minutes and you can leave the page. A client can have one manual search per week; until then the button names the next day it is available.
4. **Add one by hand.** Enter a name (required), and a website or Google place id if you have them, then **Add competitor**. The button is off when the client is at its limit.
5. **Stop tracking.** **Remove** keeps the competitor's history. Collection stops if no other client tracks it.

#### Common questions

### Why does a competitor say "Not rated yet" with no tier?

No tier has been worked out for it yet, so it sits at the bottom of the list. It gets a tier and a Rated date once its signals have been computed.

### Why can't I track more suggestions?

The client is at its competitor limit, shown in the page header. Remove a competitor first to make room.

### Why is Find competitors greyed out?

Either something is missing (keywords, a service area or a Google place id), a search is already running, or the client already had its manual search this week. The button says which.

### Can the client add competitors themselves?

Only a client owner whose features include managing competitors sees **Add competitor** and **Remove**. Suggestions and searches stay with agency staff.

### Guide: client (`docs/help/pages/client.competitors.client.md`)

#### What this page tells you

The competitors monitored for {{client}}, with how closely each one competes.

- **Tier** says how closely a competitor competes. **Top rival**: it shows up in the same local searches and is active, with ads, new reviews or a claimed Google profile. **Worth watching**: strong on one of those. **Minor**: the rest. If a competitor's activity could not be checked, Worth watching is the highest tier it can get. The list starts with Top rivals.
- **Rated Mon 13 Oct** is the day the tier and signals were last refreshed. It is a date, not a star rating; Google star ratings are on the Reviews page.
- **Signals** are the small pills: Google rating, new reviews in the last 30 days, Google ads and Meta ads. A highlighted pill is worth a look. "Not checked" means the fact could not be read yet; it never means zero.
- **Website** and **Pages monitored** show the competitor's site and how many of its pages are checked for changes.

#### How to use it

1. **Open a competitor** to see its prices, ads, reviews, local rankings and a timeline of its changes.
2. **Start with the Top rivals.** They are the ones most likely to compete for the same customers right now.
3. **Hover or select a signal pill** to see the detail behind it, such as how many reviews it has gained in 30 days.
4. **If you see an Add competitor form,** enter the competitor's name (required) and its website (optional). Remove stops tracking a competitor but keeps its history.

#### Common questions

### Why does a competitor say "Not rated yet"?

No tier has been worked out for it yet, so it sits at the bottom of the list. It gets a tier and a Rated date once its signals have been computed.

### Why is a business I compete with missing?

Only the competitors that {{product}} tracks for {{client}} appear here. Ask {{product}} to add one.

### Is a Top rival the same as a competitor?

No. Every business here is a competitor; Top rival is the tier for the ones that compete most closely and are most active.

### Guide: agency (`docs/help/pages/client.competitors.detail.agency.md`)

#### What this page tells you

Everything monitored for one competitor of {{client}}. Client users see the same page, without the ad-account chips and the page controls.

- **The header** shows when {{client}} started tracking it, its website and a competitive pressure badge: how much it has been doing lately that could affect {{client}}, from 0 to 100.
- **Tier, signals and Rated date** sit under the header. The tier says how closely it competes; the Rated date is when the tier and signals were last refreshed.
- **Ad accounts** (agency staff only) show the Google and Meta ad accounts matched to the competitor. "Matched automatically" accounts were linked by the system; "Possible" ones wait for you to confirm or remove them.
- **The four numbers** are its Google rating and review count, active ads (Google and Meta), open moves and pages monitored. "Site blocks monitoring" means the latest check of a page was refused by the site.
- **Prices, Ads, Reviews and Local rankings** are short summaries with a link to the full page, filtered to this competitor.
- **Timeline** lists its changes and moves for the last 30, 90 or 365 days.
- **Collection status** lists each source and when it last ran. **Pages** lists the website pages that are checked.

#### How to use it

1. **Check pressure first.** A high number means recent changes and open moves worth reading; the Timeline shows which.
2. **Confirm ad accounts.** If a possible Google or Meta account is listed, confirm it when it is the competitor's, or remove it when it is not. Confirmed Google accounts are used to find its ads.
3. **Pin the pages that matter.** A pinned page is checked daily; the others follow the default schedule for their type. Pages belong to the competitor, so pinning applies to every client that tracks it.
4. **Add a page.** Enter its URL and a type, then **Add page**. Added pages are pinned. The form is replaced by a note when website monitoring is switched off.
5. **Read collection status when data looks stale.** A note such as "Not found" or "Retrying" describes the source's last run; "paused" means the source is switched off.

#### Common questions

### Why does a number say "No Google profile yet"?

No Google profile has been read for this competitor yet.

### What does "Data provider error" in collection status mean?

The last attempt to read that source failed on the data provider's side.

### Why are there no prices?

Prices come from the competitor's own website. A competitor that does not publish prices shows none.

### Guide: client (`docs/help/pages/client.competitors.detail.client.md`)

#### What this page tells you

Everything monitored for one of {{client}}'s competitors, from public information only.

- **The header** shows when this competitor was added, its website and a competitive pressure badge: how much it has been doing lately that could affect {{client}}, from 0 to 100.
- **Tier, signals and Rated date** sit under the header. The tier says how closely it competes with {{client}}; the Rated date is when the tier and signals were last refreshed. It is a date, not a star rating.
- **The four numbers** are its Google rating and review count, active ads (Google and Meta), open moves and pages monitored. "Site blocks monitoring" means the latest check of a page was refused by the site, so changes on it cannot be seen.
- **Prices, Ads, Reviews and Local rankings** are short summaries with a link to the full page, filtered to this competitor.
- **Timeline** lists its changes and moves for the last 30, 90 or 365 days.
- **Collection status** lists each source monitored and when it last ran. **Pages** lists the website pages that are checked.

#### How to use it

1. **Check the pressure badge first.** A high number means recent changes and open moves worth reading; the Timeline shows which.
2. **Open the summaries** you care about. Each has a link, such as See pricing or See ads, that opens the full page for this competitor.
3. **Read the Timeline.** Each item links to the change or move with its evidence. Switch between 30, 90 and 365 days to see a longer pattern.
4. **Check Collection status if something looks out of date.** A note such as "Not found" or "Retrying" describes the last run of that source; "paused" means the source is switched off.

#### Common questions

### Why does it say "No Google profile yet"?

No Google profile has been read for this competitor yet.

### Why are there no prices?

Prices come from the competitor's own website. A competitor that does not publish prices shows none.

### What is an open move?

A pattern across several of this competitor's changes, such as a price war or an ad surge, that has not closed yet. The number links to the Moves page.

### Guide: all (`docs/help/pages/client.moves.md`)

#### What this page tells you

Patterns across several of a competitor's changes, such as a price war, a promo blitz or an ad surge. A single change is just a change; a move is what several of them add up to, and each move lists the changes behind it.

- **The list on the left** shows each move with its competitor, its status, how many changes support it (for example "3 signals" over 21 days) and its confidence.
- **Status** tells you where a move stands. **Emerging**: just spotted. **Active**: it has held for 7 days, or the evidence is strong. **Fading**: no new supporting change for 30 days. **Closed**: the pattern has not held for 30 days.
- **Signals** on a move are the changes that support it. They are not the signal pills on the Competitors page.
- **Confidence** grows with each extra supporting change and each extra channel, such as the website and ads.
- **The panel on the right** shows when the move was first detected, its latest evidence, key facts, and the **Evidence chain**: every supporting change with its score.

#### How to use it

1. **Start with Active moves.** They are the patterns that are holding. **Open** shows every move that is not closed, **Closed** shows earlier ones and **All** shows both.
2. **Select a move** to read its facts and its evidence chain.
3. **Open a change in the chain** to see the evidence behind it, such as before and after screenshots.
4. **Use the pattern, not one change.** A price war is a reason to review your own prices; an ad surge is a reason to check where that competitor is advertising.

#### Common questions

### How is a move different from a change?

A change is one difference found in a competitor's public information. A move is a pattern in a competitor's changes over the last 90 days. The same change can support a move and still appear on the Changes page.

### What kinds of move are there?

Territory expansion, price war, new service line, hiring push, promo blitz, reputation slump, ad surge and map climb.

### Why did a move close?

The pattern behind it has not held for 30 days. Its history stays under **Closed**.

### Why are there no moves?

Moves are spotted from patterns, so a quiet stretch can have none. They appear when one is found.

### Guide: all (`docs/help/pages/client.pricing.md`)

#### What this page tells you

What each of {{client}}'s competitors charges, read from its own website, and how those prices have moved.

- **One card per competitor**, listing each service it publishes a price for. Prices read like **$89**, **from $79**, **up to $1,200** or **$95/hour**.
- **Your service** marks a service {{client}} offers too, so you can compare like with like. It tags the service, not the price: every price on a card is the competitor's.
- **The ▼ or ▲ tag** compares the competitor's lowest price for that service now with its lowest price 90 days ago. A red ▼ means the price fell and a green ▲ means it rose. The tag shows only when both prices are known and they differ.
- **PROMO** marks a price listed as a promotion.

#### How to use it

1. **Look for price cuts.** A red ▼ on a service {{client}} offers is the first thing to check.
2. **Select a service** on a card to open its price history under the card. Choose 90 days, 180 days or 365 days. The ▼ and ▲ tags always look back 90 days, whatever period you choose.
3. **Compare with your own price** before reacting. The page shows competitors' prices only.
4. **Open the competitor** from the Competitors page to see where its prices were found and what else it changed.

#### Common questions

### Why does a competitor show no prices?

Prices come from the competitor's own website. A card fills in once a page that lists prices has been read; a competitor that does not publish prices stays empty.

### Why is there no tag on a price?

Either the price has not changed in 90 days, or there was no earlier price to compare with.

### Which price does the history chart show?

The lowest price found for that service on each date, per competitor.

### Guide: agency (`docs/help/pages/client.rankings.agency.md`)

#### What this page tells you

Where {{client}} and its competitors show up in Google Maps results across the service area, from a weekly scan. Client users see the same page without Rank settings and Scan now.

- **The grid** is a square of search points spread across the service area; the page shows its size, such as 7×7. Each point is a Google Maps search made as if from that spot, and its cell shows where the business appeared in the first 20 results. Darker blue is better: 1 to 3, 4 to 10, 11 to 20. **20+** means not in the first 20, and a hatched cell means there is no data for that point.
- **Average map rank** is the average position across all points of the grid for one search term. 1 is best. A point where the business is not in the first 20 results counts as 21.
- **Top 3** is how many points the business holds one of the first three spots, the local pack that Google shows first.
- **Share of voice** is the share of all the top-3 spots in a scan, across every grid point, that each business holds. A business holding 12 of 60 spots has 20%. Businesses that are not tracked are grouped as "Other businesses".

#### How to use it

1. **Choose a keyword and a business.** The keyword is the search term; the business is You or one of the competitors. Select **Show**.
2. **Read the grid** for pale areas: parts of the service area where {{client}} is hard to find, especially where a competitor is dark. These make good talking points.
3. **Follow the trend.** The line chart shows the average rank scan by scan, and the slider moves the grid through past scans.
4. **Compare two scans** on the **Compare** tab. Blue means the business moved up, orange means it moved down, "=" means no change, and the number is how many places. Only scans with the same settings can be compared.
5. **Change what is scanned** with **Rank settings**: the keywords (up to 5 of the client's keywords), the grid size and the radius. The next scan uses them. A scan with different settings starts a new series, so it cannot be compared with older ones.
6. **Start a scan now** with **Scan now** when you need fresh results, for example after changing the settings.

#### Common questions

### When do scans run?

The weekly scan starts every Sunday at 06:00 UTC for each client that has keywords and a service area and is active. Scan now adds an extra scan on top.

### What limits Scan now?

A client can be scanned by hand once every 7 days (the button then reads "Next scan available" with the day). Your agency can start 10 manual scans a day, counted per UTC day; after that the button is off and says so. A scan that would push the client past its monthly cost cap is refused, with the cap in the message. Only one scan can run for a client at a time.

### Why are Rank settings and Scan now missing?

They show for agency staff only, and not when the client is paused or inactive or has no keywords or service area yet.

### Why is there no grid?

The page says what is missing: keywords and a service area on the Business profile page, a first scan, or a Google place id for the business (or a tracked competitor) to show.

### Why can't I compare two scans?

Compare needs at least two scans with the same settings (keywords, grid size and radius). Changing the settings between two scans stops them being compared.

### Guide: client (`docs/help/pages/client.rankings.client.md`)

#### What this page tells you

Where {{client}} and its competitors show up in Google Maps results across the service area, from a weekly scan.

- **The grid** is a square of search points spread across the service area; the page shows its size, such as 7×7. Each point is a Google Maps search made as if from that spot, and its cell shows where the business appeared in the first 20 results. Darker blue is better: 1 to 3, 4 to 10, 11 to 20. **20+** means not in the first 20, and a hatched cell means there is no data for that point.
- **Average map rank** is the average position across all points of the grid for one search term. 1 is best. A point where the business is not in the first 20 results counts as 21.
- **Top 3** is how many points the business holds one of the first three spots, the local pack that Google shows first.
- **Share of voice** is the share of all the top-3 spots in a scan, across every grid point, that each business holds. A business holding 12 of 60 spots has 20%. Businesses that are not tracked are grouped as "Other businesses".

#### How to use it

1. **Choose a keyword and a business.** The keyword is the search term; the business is You or one of the competitors. Select **Show**.
2. **Read the grid.** Dark cells are where the business is strong; pale and hatched cells are where it is hard to find. Look for a part of the service area that is pale for {{client}} and dark for a competitor.
3. **Follow the trend.** The line chart shows the average rank scan by scan, and the slider under it moves the grid through past scans.
4. **Compare two scans.** Open the **Compare** tab and pick a From scan and a To scan. Blue means the business moved up, orange means it moved down, "=" means no change, and the number is how many places. Only scans with the same settings can be compared.
5. **Check share of voice** to see who holds the top 3 spots overall, and use the "Share of voice for" list to look at one keyword.

#### Common questions

### How often does it update?

A rank scan runs once a week. Every scan is kept.

### Why does a cell say 20+?

The business was not in the first 20 Maps results from that point. In the average it counts as 21.

### Why is a cell hatched?

There is no data for that point in that scan.

### Why can't I compare two scans?

Compare needs at least two scans, and they must have the same settings (keywords, grid size and radius). {{product}} can tell you if the settings were changed.

### Why is there no grid yet?

Rank tracking needs keywords and a service area, and the first scan has to have run. Until then the page says what is missing.

## Numbers in the guides and tips

Every number or limit stated in the copy, with the code it comes from.

| Number / fact | Where stated | Source |
|---|---|---|
| Not found = 21 (a point outside the first 20 counts as 21) | rankings tip `avgRank`, both rankings guides | `packages/engine/src/structured/rank.ts` `NOT_FOUND_RANK = 21`, `rankMetrics` |
| First 20 results per point (depth 20); grid 7x7 default, 5x5 option | rankings tip `grid`, both rankings guides | `packages/collectors/src/rankings/scan.ts` `scanRankings` (`depth = Math.min(prospect?.depth ?? 20, 20)`); `packages/db/src/schema/tenancy.ts` `rankGridSize` default 7; `packages/tools/src/tools/rankings.ts` `GridSize` 5 or 7 |
| Rank colour steps 1-3, 4-10, 11-20, 20+, hatched = no data | rankings tip `grid`, both guides | `apps/web/src/components/charts/geo-grid.tsx` `rankFill`, `LEGEND` |
| Weekly scan, Sunday 06:00 UTC | agency tip `scanNow`, agency guide (clients only see "once a week") | `apps/worker/src/jobs/vendor.ts` `rankSchedule` cron `0 6 * * 0` |
| Scan now: 1 per client per 7 days | agency tip `scanNow`, agency guide | `packages/tools/src/limits.ts` `RANK_MANUAL_PER_CLIENT_DAYS = 7`; `packages/tools/src/rank-scan.ts` `rankScanAvailability` |
| Scan now: 10 per agency per UTC day | agency tip `scanNow`, agency guide | `packages/tools/src/limits.ts` `RANK_MANUAL_PER_AGENCY_DAY = 10`; `rankScanAvailability` (`utcMidnight`) |
| Scan refused past the client's monthly cost cap; one scan at a time | agency tip `scanNow`, agency guide | `rankScanAvailability` (`cap`, `running`); `rankScanRefusalMessage` |
| Rank settings: up to 5 keywords | agency tip `scanNow`, agency guide | `packages/collectors/src/rankings/settings.ts` `RANK_MAX_KEYWORDS = 5`; `rank-settings-sheet.tsx` |
| Scan settings that must match to Compare: keywords, grid size, radius | rankings tip `compare`, both guides | `packages/engine/src/structured/rank.ts` `rankSettingsKey`; `rankings/page.tsx` |
| Compare colours: blue up, orange down, "=" same; steps 1-2, 3-5, 6+ | rankings tip `compare`, both guides | `apps/web/src/components/charts/change-grid.tsx` `changeFill` |
| Share of voice: top-3 spots, "Other businesses"; 12 of 60 = 20% (worked example) | rankings tip `sov`, both guides | `packages/tools/src/tools/rankings.ts` `getShareOfVoice`, `OTHER_BUSINESSES`; glossary `share-of-voice` |
| Search takes 20 to 40 minutes; one manual search per client per week | competitors tip `suggestions`, agency guide | `competitors/competitor-controls.tsx` (page text); `packages/tools/src/rival-search.ts` `weeklyLimitMessage`, `weekly_limit` |
| Top rivals start ticked, up to the room left | competitors tip `suggestions`, agency guide | `competitor-controls.tsx` `initialSelection`, `room` |
| Competitor limit (3 of 5 style count) | competitors description, agency guide | `packages/db/src/schema/tenancy.ts` `competitorLimit` default 5; `list_client_competitors` `limit` |
| Tier rules (Top rival high on both overlap and activity; Worth watching high on either; no activity data caps at Worth watching) | competitors tips/guides | `packages/collectors/src/rivals/score.ts` `tierFor`; glossary `tier` (no thresholds stated, they are per business type) |
| Signals: new reviews in 30 days, Google ads, Meta ads | competitors guides | `apps/web/src/components/rival/signal-pills.tsx` `buildPills`; glossary `signal` |
| Price change tag: lowest price now vs 90 days ago; only when both known and different | pricing tip `priceChange`, pricing guide | `packages/tools/src/tools/pricing.ts` `getPriceMatrix` (`lowestUsdAt` 90 days); `pricing/format.ts` `formatChange` |
| History periods 90 / 180 / 365 days | pricing guide | `pricing/page.tsx` `PERIODS` |
| Active ads per week: 12 weeks, blank before first check | ads tip `adsPerWeek`, ads guide | `ads/page.tsx` (`weeks: 12`); `packages/tools/src/workspace/ads.ts` `adWeeklySeries` |
| Google ad active = shown in the last 14 days | ads tip `status`, ads guide | `packages/collectors/src/ads/google.ts` `ACTIVE_WINDOW_MS` |
| "First seen" = when the checks first found the ad | ads guide | `packages/collectors/src/ads/upsert.ts` (`firstSeenAt: now`) |
| Targeting not disclosed (US); no brief claims targeting | ads tip `targeting`, ads guide | `ads/ad-card.tsx`; `packages/engine/src/briefs/rules.ts` (targeting claim without evidence dropped) |
| Move statuses: Active after 7 days or strong evidence; Fading after 30 days without new evidence; Closed after the pattern fails to hold 30 days | moves tip `statuses`, moves guide | `packages/engine/src/moves/moves-stage.ts` `ACTIVE_AFTER_DAYS = 7`, `FADING_AFTER_DAYS = 30`, `CLOSE_AFTER_DAYS = 30`, `nextStatus`. The confidence value that makes evidence "strong" (`ACTIVE_CONFIDENCE`) is deliberately not stated |
| Move window 90 days; move kinds (8) | moves guide | `packages/engine/src/moves/rules.ts` `MOVE_WINDOW_DAYS`; `packages/tools/src/pressure.ts` `MOVE_LABELS` |
| Pinned page = daily; pages shared across clients | competitor profile tip `pinned`, agency guide | `packages/tools/src/tools/pages.ts` `setPagePin`; `packages/db/src/schema/evidence.ts` `trackedPage` |
| Site blocks monitoring = latest capture blocked or robots_disallowed | competitor profile tip `pagesMonitored`, guides | `packages/tools/src/tools/competitor-profile.ts` `getCompetitorProfile` (`pages.blocked`) |
| Timeline periods 30 / 90 / 365 days | competitor profile guides | `competitors/[competitorId]/page.tsx` `PERIODS` |

## UI strings added outside `PAGE_COPY`

Short labels that sit beside a tip (the tip text above is the copy to sign off).

| String | Page | Audience |
|---|---|---|
| "{n} of {limit} tracked." after the description | Competitors | all |
| "Price change", "Your service" (labels beside the two tips) | Pricing | all |
| "Active and ended", "Targeting" (labels beside the two tips) | Ads | all |
| "Open Business profile" (link in the no-keywords and no-business empty states) | Local rankings | agency |
| "Website monitoring isn't switched on yet, so there's nothing to show." (existing text, now the action of the no-prices empty state) | Pricing | all |
| "Name" and "Signals" table headings carry a tip (`rated`, Signal glossary term); "Pinned" carries `pinned`; "Evidence chain" carries `signals` | Competitors, Competitor profile, Moves | all (`pinned`: agency) |

## Notes for the owner

- Moves cards still read "3 signals" (the audit asks for "3 changes"). The `signals` tip explains the term and says it is not the signal pill. Renaming the card text is a UI change (15c), not done here.
- Rank radius is still shown in km on the page and in Rank settings; the copy states no radius value (miles conversion is 15c).
- Competitors description drops the old agency-only "Track 3-5 direct competitors": the code states no 3-5 rule (the per-client limit is shown as "n of limit").

