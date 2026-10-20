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
| Empty `noTrackedReadOnly` | agency | **No competitors tracked yet**: No competitors are tracked for {client} yet. This session is read-only, so none can be added. | wording only; shown to an agency viewer in a read-only support session |
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
| Tip `scanNow` | agency | **Manual scan limits**: The weekly scan runs on Sundays at 06:00 UTC. Scan now starts an extra one. A client can be scanned by hand once every 7 days, and your agency can start 10 manual scans a day (counted per UTC day). A scan that would push the client past its monthly cost cap is refused. Rank settings change the keywords (up to 5), grid size and radius for the next scan. | `packages/tools/src/limits.ts:RANK_MANUAL_PER_CLIENT_DAYS (7), RANK_MANUAL_PER_AGENCY_DAY (10); packages/tools/src/rank-scan.ts:rankScanAvailability (UTC day; monthly cost cap); apps/worker/src/jobs/vendor.ts:rankSchedule (Sunday 06:00 UTC); packages/collectors/src/rankings/settings.ts (RANK_MAX_KEYWORDS 5)` |
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



# Batch: client B (Recommendations, Ask, Ask thread, Briefs & reports, Brief, Alert, Report, Evidence, Pitch snapshot)

**Status: draft for owner sign-off (Task 5, 2026-10-20).** Same conventions as batch A. Pitch snapshot is agency-only (a client role gets a 404): agency guide and agency tips only, no client guide. Ask copy never mentions a quota or allowance (owner decision e4: nothing on Ask reads usage). Confidence copy never states the 0.85 line (agency-only). The guide wording for the Ask disclosure follows the 15a ruling ("... reviewed by our support team ..." when no display name); the structural visibility line is 15c.

## client.recommendations

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Next steps from your weekly briefs and detected competitor moves. | page header (`PageHeader.description`) |
| Tip `stages` | all | **Recommendation stages**: To do, In progress and Done are the stages. Use Start, Done or Back to to-do on a card to move it. A dismissed recommendation goes to the list at the bottom with the reason given, and can be reopened. People with view-only access can read the board but not change it. | `apps/web/src/components/recommendation-board.tsx:RecommendationBoard (columns, targetsFor, ReopenForm, DismissDialog); packages/core/src/access.ts:ROLE_PERMISSIONS (client_viewer has read only)` |
| Tip `effortImpact` | all | **Effort and impact**: Rough estimates, shown as L, M or H for low, medium or high: how much work the step is, and how much it could help. They help you pick where to start. They are estimates, not measurements. | `apps/web/src/components/recommendation-board.tsx:RecommendationCard (effort and impact shown as L, M or H); packages/engine/src/briefs/writer.ts (LEVELS L, M, H)` |
| Tip `owner` | all | **For you or Agency**: "For you" marks a step the business owner can take, such as asking customers for reviews. "Agency" marks a step {agency} can take. | `packages/engine/src/briefs/recommendations.ts (owner client \| agency); apps/web/src/components/recommendation-board.tsx:RecommendationCard ("For you" / "Agency")` |
| Tip `origin` | all | **Where a recommendation came from**: From weekly brief: the step is the recommended action of a brief item. From a detected move: it answers a pattern in a competitor's changes. From Ask: it was saved from an assistant answer. The evidence links on each card open the stored proof. | `apps/web/src/components/recommendation-board.tsx:SOURCE_LABEL; packages/engine/src/briefs/recommendations.ts:recommendationFromItem (source brief) and the move plays (source move)` |
| Empty `noRecs` | all | **No recommendations yet**: Recommendations arrive with each approved weekly brief, and when a competitor move calls for a response. | wording only; the condition is the page state it replaces (shown when the viewer cannot save from an assistant answer) |
| Empty `noRecsAsk` | all | **No recommendations yet**: Recommendations arrive with each approved weekly brief, and when a competitor move calls for a response. You can also save one from an {assistant} answer. | wording only; the condition is the page state it replaces (shown only when Ask is on for the viewer and they may give feedback) |

## client.ask

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Questions about your competitors and market, answered from the monitored evidence. | page header (`PageHeader.description`) |
| Tip `answers` | all | **How answers are checked**: {assistant} answers from what has been monitored for {client}, such as changes, prices, ads and reviews. Facts link to their evidence. A sentence that starts with "Possible reason:" is an interpretation, not a stated fact. Sentences the evidence does not support are removed before you see the answer, and if there is no evidence for something, the answer says so. | `packages/ask/src/prompt.ts:buildSystemPrompt (rules 1, 2, 6); packages/ask/src/grounding.ts:groundAnswer (unsupported sentences removed)` |
| Tip `starters` | all | **Starter questions**: Four suggested questions, written from what competitors did in the last 7 days. Until the first set exists you see general ones. Pick one to ask it, or type your own. | `packages/ask/src/starters.ts:generateStarters (four questions from the last 7 days of events); packages/tools/src/tools/ask-threads.ts:getAskStarters (general questions until a set exists)` |
| Tip `privacy` | all | **Who can see your questions**: Your questions and answers are private to you; other people at {client} or {agency} cannot open them. When a line under the box says conversations may be reviewed to improve answers, the people it names can read them. That line shows only while review is allowed for {client}. Delete a thread with the bin icon beside it. | `apps/web/src/components/ask/ask-chat.tsx:disclosureCopy; apps/web/src/components/ask/thread-list.tsx (delete, "Only you can see them"); apps/web/src/app/(app)/c/[clientId]/ask/ask-screen.tsx:ASK_PRIVATE_COPY; packages/tools/src/tools/ask-threads.ts:getAskStarters (reviewAllowed)` |
| Tip `changes` | all | **What {assistant} can change**: {assistant} can propose saving a recommendation, changing a recommendation's status or rating a change. It shows a card with what it would do, and nothing happens until you confirm. Under an answer that cites evidence, "Save as recommendation" adds it to the Recommendations page. | `packages/ask/src/actions.ts:actionSummary (add_recommendation, update_recommendation_status, submit_feedback); apps/web/src/components/ask/confirm-card.tsx; apps/web/src/components/ask/save-recommendation-dialog.tsx` |

## client.ask.thread

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | A saved conversation. It is private to you, and you can delete it from the list. | page header (`PageHeader.description`) |

## client.briefs

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | {client}'s weekly briefs, alerts and quarterly reports, newest first. | page header (`PageHeader.description`) |
| Tip `kinds` | all | **Briefs, alerts and reports**: A weekly brief arrives on Monday morning: what changed, why it matters and what to do. An alert is a change important enough to send between briefs. A quarterly report gives the numbers for the quarter that just ended. A brief tagged Starting point is the first one, showing where {client} stands before weekly briefs begin. | `packages/engine/src/briefs/deliver.ts:DELIVERY_LOCAL_HOUR (Monday 07:00 client time); packages/engine/src/score/score.ts:scoreForClient (alert and brief routes); packages/engine/src/reports/quarterly.ts:runQuarterlyReports (first week of a quarter); packages/engine/src/briefs/starting-point.ts (starting_point kind)` |
| Tip `status` | agency | **Status chips**: The chip shows where each item stands in your review, such as Needs review, Approved or Sent. Items waiting for review are in Approvals. Client users only see items that were delivered, and no chips. | `apps/web/src/app/(app)/c/[clientId]/briefs/copy.ts:BRIEF_STATUS, ALERT_STATUS, REPORT_STATUS; apps/web/src/app/(app)/c/[clientId]/briefs/page.tsx (chips for agency roles only; client roles only get delivered items)` |
| Empty `noBriefs` | all | **No weekly briefs yet**: The first one arrives the Monday after setup is complete. | wording only; the condition is the page state it replaces |
| Empty `noAlerts` | all | **No alerts yet**: Alerts are sent when a competitor makes an urgent change. | wording only; the condition is the page state it replaces |
| Empty `noReports` | all | **No quarterly reports yet**: A report arrives in the first week after each quarter ends, and covers that quarter. | wording only; the condition is the page state it replaces |

## client.briefs.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | What {client}'s competitors did, why it matters and what to do about it. Every point links to its evidence. | page header (`PageHeader.description`) |
| Tip `confidence` | all | **Confidence**: The percentage on each point shows how well the evidence supports it. Higher is better supported. "High confidence" marks the points we are most sure of, which also have an amber edge. Every point links to its evidence either way. | `apps/web/src/components/confidence-label.ts:confidenceLabel ("High confidence NN%" / "Confidence NN%", amber edge on the high band; the threshold itself is agency-only); packages/db/src/schema/briefs.ts:briefItem.confidence` |
| Tip `evidence` | all | **Evidence links**: Each Evidence link opens the stored proof for the point above it: a snapshot, text or data captured from public information, with the date and a fingerprint that shows it has not been altered. | `apps/web/src/components/evidence-chips.tsx:EvidenceChips (Evidence N links open /c/<id>/evidence/<evidenceId>)` |
| Tip `quiet` | all | **Quiet weeks**: When no competitor made a significant move, the brief shows where {client} stands instead: rating, new reviews in the last 90 days, reply rate and share of top-3 map spots, each next to the median of the rivals we watch and the change since the starting point. The table lists every business. | `packages/engine/src/briefs/generate.ts:QUIET_SUMMARY (kind quiet stores the scorecard); packages/engine/src/briefs/scorecard-model.ts:scorecardModel (tiles Rating, New reviews 90 d, Reply rate, Top-3 in map pack; rivals median; since your starting point)` |
| Tip `startingPoint` | all | **About the starting point**: The first brief. It shows where {client} stands against the competitors we watch on day one, and the first moves to make. Weekly briefs after it show what has changed since. | `packages/engine/src/briefs/starting-point.ts; packages/engine/src/briefs/scorecard-model.ts:scorecardModel; apps/web/src/components/views/brief-view.tsx:BriefView (First moves still open)` |
| Tip `trend` | all | **The last-days table**: Numbers for {client} and each competitor over the period in the table caption: new reviews, average rating before and after, and ads running now. A dash in Active ads means not checked for that business. | `packages/engine/src/briefs/trend.ts:trendSnapshot (TREND_WINDOW_DAYS 30; reviews, rating before and after, active ads); apps/web/src/components/views/brief-view.tsx:TrendTable (caption "Last N days")` |

## client.alerts.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | A change important enough to send between weekly briefs, with the evidence behind it. | page header (`PageHeader.description`) |
| Tip `alertVsBrief` | all | **Alert or brief**: An alert is a change that was important enough to send straight away. Smaller changes wait for the weekly brief, and the smallest are only recorded. Every alert links to the evidence behind it. | `packages/engine/src/score/score.ts:scoreForClient (alert, brief and archived routes)` |
| Tip `score` | agency | **Score, status and template text**: The score is the change's score from 0 to 100; an alert is sent when it reaches the client's alert level (Settings › Alert rules). The status shows where the alert is in your review. "Template text" means the written text did not pass verification, so a fixed template was used instead. | `packages/engine/src/score/score.ts:scoreForClient (score 0-100, alert level); apps/web/src/app/(app)/c/[clientId]/briefs/copy.ts:ALERT_STATUS; apps/web/src/components/views/alert-view.tsx ("Template text")` |

## client.reports.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | The numbers for one quarter: how {client} and its competitors compared, what changed and what was done about it. | page header (`PageHeader.description`) |
| Tip `businesses` | all | **Reviews, rating and ads**: Reviews: new Google reviews in the last 90 days of the quarter. Average rating: the average stars over those 90 days; ▲ or ▼ shows it rose or fell compared with the 90 days before. Active ads: ads running when the report was made, shown only for competitors. | `packages/engine/src/reports/quarterly.ts:computeTrendReport (QUARTER_WINDOW_DAYS 90, trendSnapshot businesses); packages/engine/src/briefs/trend.ts:trendSnapshot (activeAds = adActivity.activeNow, null for the client itself); apps/web/src/components/views/report-view.tsx (▲ ▼)` |
| Tip `changes` | all | **Changes detected**: How many changes were scored for {client} during the quarter, grouped by type. Tiny cosmetic changes are left out. | `packages/engine/src/reports/quarterly.ts:computeTrendReport (byType: scored events in the period, cosmetic and retracted excluded)` |
| Tip `moves` | all | **Moves in the quarter**: Moves first detected during the quarter, with their status when the report was made. A move counts only while at least one change behind it is still valid. | `packages/engine/src/reports/quarterly.ts:computeTrendReport (moves first detected in the period with at least one live event; status closed when closedAt is set)` |
| Tip `activity` | all | **Briefs, alerts and recommendations**: Briefs sent and alerts delivered during the quarter, and the recommendations created in it, counted by where each one stood when the report was made: Done, In progress or Dismissed. | `packages/engine/src/reports/quarterly.ts:computeTrendReport (briefsSent, alertsDelivered, recommendations created, done, inProgress, dismissed by status at report time)` |

## client.evidence.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | The stored proof behind a point in a brief or alert: what was captured, when, and its fingerprint. | page header (`PageHeader.description`) |
| Tip `captured` | all | **Where this was captured**: Pages on a competitor's own website are captured automatically by our monitoring service. Other sources, such as Google profiles and ad libraries, are recorded when their data is collected. Once stored, evidence is never edited. | `apps/web/src/app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx (Source row: web evidence reads "captured by our monitoring service"); packages/db/src/schema/evidence.ts:capture, evidence (immutable)` |
| Tip `status` | all | **Capture status**: Whether the capture worked. "ok" means the page or data was read normally. | `packages/core/src/domain.ts:CAPTURE_STATUSES; packages/db/src/schema/evidence.ts:capture.status` |
| Tip `fingerprint` | all | **What the fingerprint is**: A long code (a SHA-256 hash) worked out from the captured content. The same content always gives the same code, and changing even one character gives a completely different one. Working the code out again from the stored file and getting the same result shows it has not been altered since it was captured. | `packages/collectors/src/evidence/recorder.ts:sha256Hex; packages/db/src/schema/evidence.ts:evidence.sha256` |
| Tip `kept` | all | **How long evidence is kept**: Evidence is kept under the retention policy, and for as long as a delivered brief cites it. Evidence on legal hold is never deleted. | `apps/web/src/app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx (Kept row: legalHold, retention policy, delivered brief)` |

## client.pitch-snapshot

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | The market picture shown to {client} before it became a client: its Google profile, ads and map visibility next to its competitors. | page header (`PageHeader.description`) |
| Tip `figures` | agency | **Where the figures come from**: Figures only, straight from stored data, with no AI-written text. Rating, reviews and category come from the Google Business Profile, and ads running from the Google and Meta ad libraries. "Not checked" means there was no website or Meta page to look up. | `apps/web/src/components/prospect-landscape.tsx:ProspectLandscape ("No AI-written text"); packages/db/src/schema/client-intel.ts:ProspectBusiness (ads null = not checked)` |
| Tip `mapVisibility` | agency | **Reading map visibility**: Each cell reads "found/points · top 3 · avg". For one search term, found is the number of grid points where the business appeared, top 3 is how many of those it was in the first three, and avg is its average position at the points where it appeared. Unlike Local rankings, points where it did not appear are not counted as 21. | `packages/collectors/src/prospect/report.ts:summarizeRanks (found, top3, averageRank over the points where the business appears); apps/web/src/components/prospect-landscape.tsx (3x3 grid, "not in the top 20")` |

## client.overview (corrections made in this task)

| Item | Audience | Text | Source |
|---|---|---|---|
| Empty `noRecommendations` | all | **Nothing open right now**: New recommendations come with each brief. | the Ask-mention is now shown only when the viewer can save from an assistant answer (Ask on, feedback permission) |
| Empty `noRecommendationsAsk` | all | **Nothing open right now**: New recommendations come with each brief. You can also save one from an {assistant} answer. | the Ask-mention is now shown only when the viewer can save from an assistant answer (Ask on, feedback permission) |
| Empty `noReports` | all | **No quarterly reports yet**: A report arrives in the first week after each quarter ends. | `packages/engine/src/reports/quarterly.ts:runQuarterlyReports` (the pilot said "after a full quarter of monitoring", which the code does not do) |

The Overview agency guide answer "When does the first quarterly report appear?" now reads "In the first week after a quarter ends, for the quarter that just ended." (same source).

## Guides (batch B)

| File | Audience | Title |
|---|---|---|
| `client.alerts.detail.agency.md` | agency | An alert |
| `client.alerts.detail.client.md` | client | An alert |
| `client.ask.agency.md` | agency | Ask {{assistant}} |
| `client.ask.client.md` | client | Ask {{assistant}} |
| `client.ask.thread.md` | all | A saved conversation |
| `client.briefs.agency.md` | agency | Briefs & reports |
| `client.briefs.client.md` | client | Briefs & reports |
| `client.briefs.detail.agency.md` | agency | A brief |
| `client.briefs.detail.client.md` | client | A brief |
| `client.evidence.detail.md` | all | Evidence |
| `client.pitch-snapshot.agency.md` | agency | Pitch snapshot |
| `client.recommendations.agency.md` | agency | Recommendations |
| `client.recommendations.client.md` | client | Recommendations |
| `client.reports.detail.md` | all | A quarterly report |

### Guide: agency (`docs/help/pages/client.alerts.detail.agency.md`)

#### What this page tells you

One alert for {{client}} as the client reads it, plus the details only you see.

- **The card** shows the competitor, the date, the text and the Evidence links.
- **Score** is the change's score from 0 to 100 (100 × type × size × relevance × novelty, each factor between 0 and 1). A change becomes an alert when its score reaches the client's alert level, set under Settings › Alert rules. A change that still needs a check, or is too old to be urgent, goes to the brief instead.
- **Status** shows where the alert is in your review, for example drafting, pending review, approved, delivered, dismissed, withdrawn or expired.
- **Template text** appears when the model text did not pass verification and a fixed template was sent instead. Clients never see this note.

#### How to use it

1. **Check the score against the evidence.** Open the Evidence links before you quote the alert to the client.
2. **Review alerts that are waiting.** The **Alert review** page in your agency area lists those that need a decision.
3. **Compare with the feed.** The Changes page shows everything scored, including what stayed below the alert level.
4. **Use Previous and Next** to step through the client's alerts.

#### Common questions

##### Why is there no score for the client?

Clients see the alert text and evidence only. The score and status are for you.

##### Why did a change not become an alert?

Its score was below the alert level, one of the caps applied (it needs a check, or it is too old), or the client already had 3 instant alerts that day and the extra ones went into the daily digest. Check the score on the Changes page.

##### Why does it say "Template text"?

The written alert could not be verified against its evidence, so a plain template was used. It is still based on the same evidence.

### Guide: client (`docs/help/pages/client.alerts.detail.client.md`)

#### What this page tells you

One alert for {{client}}: a competitor change that was important enough to send straight away instead of waiting for the weekly brief.

- **The competitor and date** are at the top of the card, and the headline is the page title.
- **The text** describes the change.
- **Evidence links** (when the alert has them) open the stored proof for the change.

#### How to use it

1. **Read the headline and text**, then open the Evidence link to see exactly what the competitor changed.
2. **Decide whether to respond.** Your Recommendations page tracks the next steps from your weekly briefs.
3. **Use Previous and Next** at the bottom to move between alerts.

#### Common questions

##### What is the difference between an alert and the weekly brief?

An alert covers a single change that was important enough to send straight away. Smaller changes wait for the weekly brief, and the smallest are only recorded.

##### Why is a change on the Changes page not an alert?

The Changes page lists everything that was found, including small changes. Only the most important ones become alerts.

##### How do I check an alert?

Open its Evidence links and look at what was captured, and when, before you act on it.

### Guide: agency (`docs/help/pages/client.ask.agency.md`)

#### What this page tells you

{{assistant}} answers questions about {{client}}'s competitors and market, using only what has been monitored for the client: changes, prices, ads, reviews and local rankings. You can use it yourself, and {{client}}'s users see the same page when Ask is switched on for them.

- **Answers cite evidence.** Each fact links to its stored proof. A sentence that starts with "Possible reason:" is an interpretation.
- **Answers are checked.** Each sentence is checked against the evidence it cites, and sentences that are not supported are removed. If nothing is left, the answer says there is no evidence.
- **Starter questions** are four suggestions written from the client's last 7 days of changes. Until the first set exists, general questions show.
- **The conversation list** shows your own conversations only. Other people's, including the client's, are private to their authors.

#### How to use it

1. **Try it before the client does.** Ask the starters and open the Evidence links to see what the client will see.
2. **Turn Ask on or off per client** with the **Ask assistant** switch under **Client features** on Settings › Business profile.
3. **Decide on review.** Agency admins can switch **Allow review to improve answers** on or off in the same place. While it is on, the platform team may read the client's conversations to improve answer quality, and a line under the question box tells users so. With no white-label name set, that line says "our support team".
4. **Use the confirm cards.** {{assistant}} can propose saving a recommendation, changing a recommendation's status or rating a change. Nothing is saved until the user selects **Confirm**.
5. **Follow up from the evidence page.** **Ask {{assistant}} about this** opens a question grounded on that evidence.

#### Common questions

##### Why can I not see a client's conversations?

Ask conversations are private to their authors. In a read-only support session the page says so and lists no conversations.

##### Why does the client not see Ask?

The **Ask assistant** switch is off for that client, or the viewer is a guest opened from an email link. Guests never get Ask.

##### Where do saved answers go?

Onto the client's Recommendations page as **From Ask**, with the evidence attached.

##### Can I rename the assistant?

Yes. Set **Assistant name** on Settings › Branding & voice. The menu, the page title and the answers use it.

### Guide: client (`docs/help/pages/client.ask.client.md`)

#### What this page tells you

{{assistant}} answers questions about {{client}}'s competitors and market, using only what has been monitored: changes, prices, ads, reviews and local rankings.

- **Answers link to evidence.** The **Evidence** links under an answer open the stored proof for what it says.
- **"Possible reason:"** at the start of a sentence marks an interpretation, not a stated fact.
- **Anything the evidence does not support is removed** before you see the answer. If there is no evidence for something, the answer says so instead of guessing.
- **Starter questions** are four suggestions written from what competitors did in the last 7 days. Until the first set exists you see general ones.
- **Your questions** (on the left, or in the drawer on a small screen) lists your earlier conversations. **New question** starts a fresh one.

#### How to use it

1. **Pick a starter or type your own question**, up to 2,000 characters. Enter sends it; Shift and Enter start a new line.
2. **Read the answer and open its Evidence links** to check the source.
3. **Save what is useful.** Under an answer that cites evidence, **Save as recommendation** adds it to your Recommendations page with the evidence attached.
4. **Confirm before anything changes.** {{assistant}} can propose saving a recommendation, changing a recommendation's status or rating a change. It shows a card describing the change, and nothing happens until you select **Confirm**.
5. **Ask about one piece of evidence.** On an evidence page, **Ask {{assistant}} about this** opens a question grounded on it.
6. **Delete a conversation** with the bin icon beside it in the list.

#### Common questions

##### Who can read my conversations?

Only you. Other people at {{client}} and at your agency cannot open them. When a line under the question box says conversations may be reviewed to improve answers, the people it names can read them. The line shows only while review is allowed for {{client}}.

##### Why does an answer say there is no evidence?

{{assistant}} answers from public information that has been monitored for {{client}}. If nothing in it covers the question, it says so. Try asking about a specific competitor, price, ad or review.

##### Why was part of an answer missing?

Each sentence is checked against the evidence it cites. A sentence the evidence does not support is removed.

##### Why will it not answer an unrelated question?

{{assistant}} only helps with {{client}}, its competitors and its market, and with how to use this product.

##### Can {{assistant}} answer questions about how to use this product?

Yes. Questions about using the product are answered from the help articles.

##### Why do I not see Ask {{assistant}} in the menu?

It is switched on for each business separately. If it is not there, it has not been switched on for {{client}}.

### Guide: all (`docs/help/pages/client.ask.thread.md`)

#### What this page tells you

One of your conversations with {{assistant}}, with every question and answer in order. Conversations are private to the person who asked: other people at {{client}} and at the agency cannot open yours.

- **Answers link to evidence.** The **Evidence** links under an answer open the stored proof.
- **Proposed changes** appear as a card with **Confirm** and **Cancel**. Once you decide, the conversation keeps a short line such as "Saved." or "Cancelled."
- **The list on the left** (a drawer on a small screen) shows your other conversations. The open one is highlighted.

#### How to use it

1. **Keep asking in the same conversation** to build on an earlier answer. {{assistant}} reads the most recent earlier messages of the conversation.
2. **Save useful answers.** Under an answer that cites evidence, **Save as recommendation** adds it to the Recommendations page.
3. **Start a new topic** with **New question** in the list.
4. **Delete a conversation** with the bin icon beside it in the list. Its messages are deleted with it.

#### Common questions

##### Can I add to an old conversation?

Yes. Type below the last answer and the new question joins the same conversation.

##### Why does an answer say it could not answer?

Something went wrong while answering. Ask the question again.

### Guide: agency (`docs/help/pages/client.briefs.agency.md`)

#### What this page tells you

Every brief, alert and quarterly report for {{client}}, newest first, in three tabs. Unlike the client's view, yours includes items that are still in review, with a status chip on each row.

- **Weekly briefs.** A brief is written on Thursday night (10 p.m. client time) for Monday delivery, so you can review and approve it the next day. A missed Thursday run can still generate until noon the next day. Approved briefs go out from 7 a.m. Monday client time. The first brief, tagged **Starting point**, is sent when you approve it.
- **Alerts.** Changes that scored high enough to send between briefs.
- **Quarterly reports.** Written automatically in the first week after a quarter ends, from 8 a.m. client time, for every active client.
- **Status chips** (agency only): **Drafting**, **Failed — retrying**, **Needs review**, **Approved**, **Sent** for briefs; alerts add **Dismissed**, **Withdrawn** and **Expired**; reports are **Ready** or **Sent**. A client user only ever sees items that were delivered, and no chips.

#### How to use it

1. **Review anything marked Needs review.** Open the row, then **Open in approvals** to edit, drop or reorder items and approve. A brief you do not approve is not sent on Monday and you get an overdue reminder; an approved brief still goes out up to 6 days after its delivery date.
2. **Use Auto-send** on the approval page for clients you trust. With it on, a brief nobody edited, dropped or reordered is approved and sent automatically on Monday.
3. **Read what the client reads.** Rows open the same pages the client sees, with your extra details (scores, upsell tags, statuses).
4. **Page through history** with **Older** and **Newer**, 20 items a page.

#### Common questions

##### Why is a brief marked Failed — retrying?

Writing the brief failed. It is tried again for a limited number of attempts; nothing is sent until a ready brief is approved.

##### Why is there no quarterly report for a new client?

A client created after a quarter ended gets no report for that quarter. The first report comes at the next quarter boundary.

##### Why do I see items the client does not?

Clients only get items that were delivered. Drafts, items waiting for review and withdrawn or expired alerts are for you.

##### When does the client see an alert?

When it is approved and delivered. Until then it shows **Needs review** here.

### Guide: client (`docs/help/pages/client.briefs.client.md`)

#### What this page tells you

Everything that has been sent to you about {{client}}'s competitors, newest first, in three tabs.

- **Weekly briefs** arrive on Monday morning, from 7 a.m. in {{client}}'s time zone. A brief says what changed, why it matters and what to do about it. The first one, tagged **Starting point**, shows where {{client}} stands against its competitors before weekly briefs begin.
- **Alerts** are changes that were important enough to send between briefs.
- **Quarterly reports** give the numbers for a quarter that has just ended. One arrives in the first week of January, April, July and October.

Each row shows the date and a one-line summary. Only items that have been sent to you appear.

#### How to use it

1. **Open the latest brief** to see what to do this week. Every point links to its evidence.
2. **Check Alerts** for urgent changes between briefs.
3. **Open a quarterly report** to see the trend: ratings, reviews, ads and what was done.
4. **Go back in time** with **Older**; **Newer** returns. Each page shows 20 items.

#### Common questions

##### Why is there no weekly brief yet?

The first one arrives the Monday after setup is complete.

##### Why is there no alert?

Alerts are sent only when a competitor makes an urgent change, so a quiet stretch has none. Smaller changes wait for the weekly brief.

##### What is the difference between a brief and an alert?

A brief covers the week. An alert covers a single change that could not wait for Monday.

##### What does a brief look like in a quiet week?

When no competitor made a significant move, the brief shows where {{client}} stands instead: rating, new reviews, reply rate and map visibility next to the competitors.

##### When does the quarterly report arrive?

In the first week after each quarter ends, and it covers that quarter.

### Guide: agency (`docs/help/pages/client.briefs.detail.agency.md`)

#### What this page tells you

One brief for {{client}} as the client reads it, plus the details only you see. Every point links to its evidence.

- **The status badge** next to the date shows where the brief stands (for example ready, approved or sent). **Open in approvals** takes you to the review page to edit, drop, reorder or approve.
- **Each point** has a headline, what changed, why it matters and a **Recommended** action. At the bottom are its **Evidence** links, its confidence and, for you only, an **Upsell** tag that names the kind of service the point relates to, and a badge for any item that was dropped or replaced (shown faded).
- **Confidence** shows as "High confidence NN%" at 85% or above, otherwise "Confidence NN%". The same line gives high-confidence points their amber edge, and the approval review page uses it too. Clients see the percentage and the label, never the 85%.
- **Quiet week:** with no items, the brief carries a **Where you stand** scorecard (rating, new reviews in 90 days, reply rate, top-3 map share against the rival median, and the change since the starting point) and the last 30 days' trend table.
- **Starting point:** the first brief. It carries the scorecard, the first moves still open and the baseline the quiet-week scorecards compare with.

#### How to use it

1. **Check the evidence before you quote a point to the client.** Open the Evidence links.
2. **Spot upsell cues.** The Upsell tag tells you which of your services fits. The tool removes it for client roles, so clients never see it on this page.
3. **Use Previous and Next** to compare weeks, and **Open in approvals** to change a brief that has not been sent.
4. **Download PDF** is available once a brief is approved or sent.

#### Common questions

##### Why are some items faded with a badge?

They were dropped by you or replaced. Clients never see them.

##### What is the High confidence line?

Points at or above 85% confidence get the High label and the amber edge. There is no medium or low band. This number is for you; do not quote it to clients.

##### Why does a brief show no items?

It was a quiet week. The scorecard stands in for the findings.

##### Why is a recommendation missing for a point?

A point whose move already has an open recommendation does not create a second one when the brief is approved.

### Guide: client (`docs/help/pages/client.briefs.detail.client.md`)

#### What this page tells you

One brief for {{client}}: what competitors did, why it matters and what to do about it. Every point links to its evidence.

- **The summary** at the top is the week in a sentence or two.
- **Each point** has a headline, what changed, why it matters and a **Recommended** action. The tags at the bottom are its **Evidence** links and its **confidence**.
- **Confidence** is a percentage that shows how well the evidence supports the point; higher is better supported. **High confidence** marks the points we are most sure of, which also have an amber edge on the left. Every point is backed by its evidence either way.
- **In a quiet week** with no significant competitor moves, a **Where you stand** section shows rating, new reviews in the last 90 days, reply rate and share of top-3 map spots, each next to the median of the rivals we watch and the change since your starting point. A table lists every business.
- **Last days** table: new reviews, average rating before and after, and ads running now, for {{client}} and each competitor.
- **The starting point** (the first brief) shows where {{client}} stands on day one, and **First moves still open** lists the first steps from it that are still to do.

#### How to use it

1. **Read the summary, then each point.** Start with the ones marked High confidence.
2. **Open the Evidence links** to see exactly what was captured, and when.
3. **Act on the Recommended line.** Recommended actions are also tracked on your Recommendations page.
4. **Use Previous and Next** at the bottom to move between briefs. **Download PDF** saves a copy of a delivered brief.

#### Common questions

##### What does the confidence percentage mean?

It shows how well the evidence supports the point. A lower percentage means the evidence supports it less strongly, so read the linked evidence before you act.

##### Why does a quiet-week brief look different?

When no competitor made a significant move there is nothing to report, so the brief shows where you stand against them instead.

##### What does "since your starting point" mean?

The change compared with your first brief, the starting point.

##### What does a dash mean in the tables?

There is no number to show for that business, so it is left blank rather than shown as zero.

##### Why does a point name a competitor?

Points about {{client}} itself carry no name. Points about a competitor start with that competitor's name.

### Guide: all (`docs/help/pages/client.evidence.detail.md`)

#### What this page tells you

The stored proof behind a point in a brief, an alert or an answer: what was captured, from where, when, and a fingerprint that shows it has not been changed since.

- **The preview** shows a snapshot of the page when the evidence is a screenshot, or a link to the captured text. Raw page code and provider data are kept unchanged and are not displayed, but their fingerprint is shown.
- **Source** says where it came from. A competitor's own website is captured automatically by our monitoring service; other sources, such as Google profiles and ad libraries, are recorded when their data is collected.
- **Captured and Status** give the date and time in UTC and whether the capture worked. "ok" means the page or data was read normally.
- **The fingerprint (SHA-256)** is a long code worked out from the captured content. The same content always gives the same code, and changing even one character gives a completely different one. Working the code out again from the stored file and getting the same result shows it has not been altered since it was captured.
- **Kept** says how long the evidence is stored.
- **Part of these changes** lists the changes that cite this evidence, when you have access to the Changes page.

#### How to use it

1. **Look at the preview and the date.** Make sure it shows what the brief or alert says it does.
2. **Open the URL** shown under Capture details to compare with the live page. It may have changed since.
3. **Follow Part of these changes** to see how this evidence was scored.
4. **Ask a question about it.** If you see an **Ask {{assistant}} about this** button, it opens a question grounded on this evidence, and **Add recommendation** saves a next step with it attached.

#### Common questions

##### What is a SHA-256 hash?

It is the fingerprint described above, a 64-character code. It identifies the content without revealing it.

##### Why can I not see the page itself?

Raw page code and provider data are never displayed. A screenshot or captured text is shown when there is one.

##### How long is evidence kept?

Under the retention policy, and for as long as a delivered brief cites it. Evidence on legal hold is never deleted.

##### Why does the date look different from my time zone?

Capture times are shown in UTC.

### Guide: agency (`docs/help/pages/client.pitch-snapshot.agency.md`)

#### What this page tells you

The market picture that was shown to {{client}} before it became a client, kept for your reference. It is for agency staff only: client users cannot open it, and the page does not appear unless a snapshot was saved.

- **Google profile and ads** shows, for the prospect and each competitor, the Google rating, number of reviews, main category (with "+N" for extra categories) and how many Google and Meta ads were running. "Not checked" means there was no website or Meta page to look up.
- **Map visibility** shows how each business ranks in Google Maps for each search term, across a 3×3 grid of the service area. A cell reads "found/points · top 3 · avg": the grid points where the business appeared (out of 9), how many of those it was in the first three, and its average position at the points where it appeared.
- **Notes** below the tables list anything that failed while the report was collected, such as a data source that was unavailable or map searches that failed.
- **The footer** gives the date it was generated and the data sources. There is no AI-written text on this page; every figure comes straight from stored data.

#### How to use it

1. **Reopen the pitch.** Use it to remind yourself what you showed the business and what it looked like then.
2. **Compare with now.** Open Local rankings and Reviews to see how the picture has moved since.
3. **Read the map cells carefully.** A business that shows "not in the top 20 at any of 9 points" did not appear in the first 20 results anywhere on the grid.

#### Common questions

##### Why is a business missing from the map table?

Only the prospect and the competitors tracked when the snapshot was made are included.

##### How is the average position different from the Local rankings page?

Here the average counts only the points where the business appeared. Local rankings counts a point where it is not in the first 20 as position 21, so the two numbers differ.

##### Why can I not open this page?

The client has no saved snapshot, or you are signed in as a client user. Client users always get "page not found".

##### Can the client see it?

No. It is agency-only.

### Guide: agency (`docs/help/pages/client.recommendations.agency.md`)

#### What this page tells you

The next steps for {{client}}, each tied to evidence. The client owner works from this board, and you can move cards for them.

- **Where they come from.** Approving a weekly brief turns the recommended action of each active item into a recommendation (owner: client, source **From weekly brief**). Separately, an active move that has no recommendation yet gets a suggested response written from the client's runbook plays (source **From a detected move**; one per move, and it does not come back once written). Answers saved from Ask arrive as **From Ask**.
- **The three columns** are **To do**, **In progress** and **Done**. Dismissed ones are in the list at the bottom with the reason given.
- **Each card** shows Effort and Impact (L, M or H), **For you** or **Agency**, its source, its evidence links and, for you only, the **Upsell** tag.
- **The Upsell tag** names the kind of service the recommendation points to (for example local SEO, paid ads, reputation, content, social or website). Clients never see it.

#### How to use it

1. **Use the board in client conversations.** Sort by low effort and high impact, and check the evidence link before you quote a card.
2. **Move cards on the client's behalf** with **Start**, **Done** and **Back to to-do**, or **Dismiss** with a reason (the reason is required and helps tune future recommendations). **Reopen** brings back a done or dismissed card.
3. **Look for upsell cues.** The tag tells you which of your services fits. Do not forward it to the client.
4. **Keep an eye on stale cards.** A card that sits in To do for weeks is a prompt to follow up.

Cards cannot be changed in a read-only support session.

#### Common questions

##### Why did a brief approval say "1 recommendation(s) created"?

Each active item becomes one card when the brief is approved. Dropped items, items whose evidence was retracted and items for a move that already has an open recommendation do not.

##### Why is there no recommendation for a move?

A suggestion is written only for an active move, once per move, and only if the written text passes verification. Emerging, fading and closed moves get none.

##### Who can change a card?

People with the manage permission: agency staff and client owners. Client viewers can read only.

##### Can I add one by hand?

Not on this page. Recommendations are created from briefs and moves, or saved from an Ask answer or an evidence page (**Add recommendation**) when the Ask module is on for the client.

##### What does "For you" mean on a card for an agency user?

The same as for the client: a step the business owner can take. **Agency** marks a step your agency can take.

### Guide: client (`docs/help/pages/client.recommendations.client.md`)

#### What this page tells you

Next steps for {{client}}, each one tied to evidence. A recommendation comes from the recommended action in a weekly brief, or from a pattern in a competitor's changes (a move) that calls for a response.

- **The three columns** are the stages: **To do**, **In progress** and **Done**. Recommendations you set aside are in the **dismissed** list at the bottom.
- **Each card** has a title, the reason behind it and a few small tags: **Effort** and **Impact** (L, M or H for low, medium or high), **For you** or **Agency** (who can take the step), and where it came from (**From weekly brief**, **From a detected move** or **From Ask**).
- **The Evidence links** on a card open the stored proof behind it.

#### How to use it

1. **Pick where to start.** Cards with low effort and high impact are usually the best first steps.
2. **Move a card along.** **Start** marks it in progress, **Done** finishes it and **Back to to-do** undoes a start.
3. **Dismiss what does not fit.** You are asked for a short reason. Open the **dismissed** list at the bottom to read it, or to **Reopen** a recommendation.
4. **Check the evidence first.** Select an Evidence link to see exactly what was captured, and when.

If you have view-only access you can read the board but not change it.

#### Common questions

##### Where do new recommendations come from?

Each approved weekly brief adds the recommended action of its items. When a competitor move is detected, a suggested response can be added too. If you see the **Ask {{assistant}}** box, you can also save an answer as a recommendation, or use **Add recommendation** on an evidence page.

##### What do "For you" and "Agency" mean?

**For you** is a step the business owner can take, such as asking customers for reviews. **Agency** is a step your agency can take.

##### What are Effort and Impact?

Rough estimates, not measurements. They are shown as L, M or H for low, medium or high.

##### Why is the board empty?

Recommendations arrive with each approved weekly brief, so a new account has none until the first brief is sent.

##### What happens when I mark one Done?

It moves to the Done column and is counted in the totals of the next quarterly report.

### Guide: all (`docs/help/pages/client.reports.detail.md`)

#### What this page tells you

The numbers for one quarter: how {{client}} and its competitors compared, what changed and what was done about it. Every number is calculated from stored data, with no written commentary.

- **The date range** under the title is the quarter.
- **The business table** has one row per business: **Reviews** (new Google reviews in the last 90 days of the quarter), **Average rating** (the average stars over those 90 days, with ▲ or ▼ when it rose or fell compared with the 90 days before) and **Active ads** (ads running when the report was made; blank for {{client}} itself).
- **Changes detected** counts the changes scored for {{client}} during the quarter, by type. Tiny cosmetic changes are left out.
- **Moves** lists the patterns first detected during the quarter, with their status when the report was made.
- **The totals at the bottom** show briefs sent, alerts delivered, and the recommendations created in the quarter counted by status: done, in progress and dismissed.

#### How to use it

1. **Start with the table.** A rating arrow pointing down next to rising review counts is worth a look.
2. **Read Changes detected** to see which kinds of competitor change were most common.
3. **Read Moves** for the bigger patterns, and open the Moves page for their evidence.
4. **Check the totals** to see how much of the advice was acted on.
5. **Use Previous and Next** to compare quarters. **Download PDF** saves a copy of a sent report.

#### Common questions

##### When does a report arrive?

In the first week after each quarter ends, from 8 a.m. in {{client}}'s time zone, for the quarter that just ended.

##### Why is there no report for the quarter before we started?

An account created after a quarter ended gets no report for that quarter.

##### Why does the total of done, in progress and dismissed not match the created count?

Recommendations still waiting in To do are counted in the created total but not in the other three.

## Numbers in the batch B guides and tips

Every number or schedule stated, with where the code says it. Client-facing text states no threshold, cap or limit; agency-only numbers are marked.

| Statement | Where used | Source |
|---|---|---|
| A weekly brief arrives Monday, from 7 a.m. in the client's time zone | briefs tip `kinds`, briefs guides (client, agency) | `packages/engine/src/briefs/deliver.ts` `DELIVERY_LOCAL_HOUR = 7`, `deliverDueBriefs` |
| Written Thursday night (10 p.m. client time); a missed run can still generate until noon the next day | briefs agency guide only | `packages/engine/src/briefs/schedule.ts` `BRIEF_LOCAL_WEEKDAY = 4`, `BRIEF_LOCAL_HOUR = 22`, `BRIEF_CATCHUP_UNTIL_HOUR = 12` |
| An approved brief still goes out up to 6 days after its delivery date; an unapproved one gets an overdue reminder; auto-send approves an untouched brief on Monday | briefs agency guide only | `deliver.ts` `DELIVERY_GRACE_DAYS = 6`, `notifyOverdue`, `isUntouched` |
| The starting point is sent when approved | briefs agency guide, brief tip `startingPoint` | `deliverDueBriefs` (excludes `starting_point`); e2e `starting-point.spec.ts` ("Approved — sent to the client.") |
| A quarterly report is made in the first 7 days of January, April, July and October, from 8 a.m. client time, for the quarter that just ended; an account created after the quarter ended gets none for it | briefs empty state `noReports`, report guide, briefs agency guide, overview `noReports` | `packages/engine/src/reports/quarterly.ts` `REPORT_FIRST_DAYS = 7`, `QUARTER_START_MONTHS`, `REPORT_LOCAL_HOUR = 8`, `previousQuarter`, `runQuarterlyReports` (`c.createdAt >= period.end`) |
| Report windows: new reviews and average rating over the last 90 days of the quarter, arrow vs the 90 days before; active ads as of when the report was made (blank for the client) | report tip `businesses`, report guide | `quarterly.ts` `QUARTER_WINDOW_DAYS = 90`; `packages/engine/src/briefs/trend.ts` `trendSnapshot`; `packages/engine/src/reviews/benchmark.ts` (`prevAvgRating`); `adActivity` (`activeNow`) |
| Report change counts exclude cosmetic and retracted changes; moves must have a live event | report tips `changes`, `moves` | `quarterly.ts` `computeTrendReport` |
| Last-days table in a brief covers 30 days | brief tip `trend`, agency guide | `packages/engine/src/briefs/trend.ts` `TREND_WINDOW_DAYS = 30` |
| Where you stand tiles: rating, new reviews in 90 days, reply rate, top-3 map share; rival median; change since the starting point | brief tip `quiet`, brief guides | `packages/engine/src/briefs/scorecard-model.ts` `TILE_LABEL`, `scorecardModel`; quiet week = no items, `generate.ts` `QUIET_SUMMARY` |
| High confidence at 85% or above, no other band (agency guide only; the client text says only "High confidence" and the percentage) | brief agency guide | `apps/web/src/components/confidence-label.ts` `HIGH_CONFIDENCE = 0.85` |
| Briefs list: 20 a page, newest first | briefs guides | `briefs/page.tsx` `PER_PAGE = 20` |
| An alert needs a score at or above the client's alert level; 3 instant alerts per client per day, extras go to the digest (agency guide only) | alerts agency guide, alerts tip `score` | `packages/engine/src/score/score.ts` `scoreForClient`; `packages/engine/src/alerts/route.ts` `ALERTS_PER_DAY = 3` |
| Ask: starter questions are four, from the last 7 days of changes | Ask tip `starters`, Ask guides | `packages/ask/src/starters.ts` `generateStarters` (`7 * DAY_MS`, four questions); `packages/tools/src/tools/ask-threads.ts` `getAskStarters` (general questions until a set exists) |
| Ask: a question is up to 2,000 characters | Ask client guide | `apps/web/src/components/ask/ask-chat.tsx` `QUESTION_MAX = 2000` |
| Ask: sentences the evidence does not support are removed; "Possible reason:" marks an interpretation | Ask tip `answers`, Ask guides | `packages/ask/src/grounding.ts` `groundAnswer`; `packages/ask/src/prompt.ts` `buildSystemPrompt` rules 1, 2, 6 |
| Ask: private to its author; the review line shows only while review is allowed; with no white-label name it says "our support team" | Ask tip `privacy`, Ask guides | `ask-chat.tsx` `disclosureCopy`; `ask-screen.tsx` `ASK_PRIVATE_COPY`; `packages/tools/src/tools/ask-threads.ts` `getAskStarters` (`reviewAllowed`); `client-features-form.tsx` (agency admins only) |
| Ask can propose three changes (save a recommendation, change a recommendation's status, rate a change); nothing happens until confirmed | Ask tip `changes`, Ask guides | `packages/ask/src/actions.ts` `actionSummary`; `packages/tools/src/ask-tools.ts` `ASK_WRITE_TOOLS`; `confirm-card.tsx` |
| Recommendations: brief items become cards when a brief is approved (not dropped, retracted or move-covered items); an active move gets one suggested response | recommendations guides | `packages/engine/src/briefs/review.ts` `approveBriefTx`; `packages/engine/src/briefs/recommendations.ts` |
| Effort and impact are L, M or H | recommendations tip `effortImpact`, guides | `recommendation-board.tsx`; `packages/engine/src/briefs/writer.ts` `LEVELS` |
| Only roles with the manage permission can change a card; client viewers read only | recommendations tip `stages`, agency guide | `packages/core/src/access.ts` `ROLE_PERMISSIONS` |
| Evidence: fingerprint is a SHA-256 (64 hex characters) of the captured content; times in UTC; raw page code and provider data are never displayed; kept under the retention policy and while a delivered brief cites it; legal hold never deleted | evidence tips and guide | `packages/collectors/src/evidence/recorder.ts` `sha256Hex`; `evidence/[evidenceId]/page.tsx` (`formatUtc`, Kept row); `packages/tools/src/workspace/evidence-access.ts` |
| Pitch snapshot: 3×3 grid (9 points); found/points · top 3 · avg over the points where the business appeared (not counted as 21) | pitch tips and guide | `packages/collectors/src/prospect/report.ts` `summarizeRanks`; `packages/db/src/schema/client-intel.ts` `ProspectReportData.points`; `prospect-landscape.tsx` |
| Pitch snapshot is agency-only; a client role gets a 404 | pitch guide | `pitch-snapshot/page.tsx` (`isAgencyRole` then `notFound`); e2e `smoke.spec.ts` |

## UI strings added outside `PAGE_COPY` (batch B)

Short labels that sit beside a tip (the tip text above is the copy to sign off).

| String | Page | Audience |
|---|---|---|
| "Stages", "Effort and impact", "Who it is for", "Source" (labels beside the four tips) | Recommendations | all (only when there are recommendations) |
| "Answers", "Suggestions", "Privacy", "Making changes" (labels beside the tips; "Suggestions" only on a new question) | Ask, Ask thread | all |
| A tip beside the tab strip; a "Status chips" tip beside it | Briefs & reports | all (`status`: agency) |
| "Confidence", "Evidence", "The starting point", "Quiet weeks", "Last days" (labels beside the tips; each only when the brief has that part) | Brief | all |
| "Alert or brief", "Evidence" (when the alert has evidence), "Score and status" | Alert | all (score: agency) |
| "Business table", "Changes by type", "Quarter moves", "Totals" (only when the report has data) | Report | all |
| Tips beside the Source, Status, SHA-256 and Kept rows | Evidence | all |
| "Figures", "Map visibility" (labels beside the two tips) | Pitch snapshot | agency |
| Pitch snapshot description now ends "Generated {date}." (was "(date)") | Pitch snapshot | agency |

## Notes for the owner (batch B)

- **Ask is off for a client:** Recommendations shows the empty state without the assistant, and the Overview empty state now does the same (the pilot text always mentioned saving from an assistant answer). The Recommendations "From Ask" source label can still appear on a card saved while Ask was on; the origin tip describes it as "saved from an assistant answer" and does not name the assistant.
- **No quota or allowance wording anywhere on Ask** (owner decision e4: nothing on Ask reads usage; an e2e check scans the page for "quota").
- **Confidence:** client copy says what the percentage means in plain words and that "High confidence" marks the points we are most sure of; the 85% line is only in the agency Brief guide.
- **Pitch snapshot** has an agency guide only (list it in `AGENCY_ONLY_CLIENT_PAGES` in Task 10).
- **Not changed (15c):** the structural visibility line on Ask, "N signals" wording, km vs miles. The agency Ask guide says the review line reads "our support team" when no display name is set (15a ruling), copy only.
- **Overview pilot copy corrected:** "after a full quarter of monitoring" is not what the code does; it now says a report arrives in the first week after each quarter ends.
- **The agency Briefs guide avoids the weekday name "Friday"** (the terminology lint rejects it in help text); it says "the next day".
