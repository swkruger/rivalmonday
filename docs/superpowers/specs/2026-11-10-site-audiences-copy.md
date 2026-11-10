# Site audiences: copy deck (17b)

Companion to `2026-11-10-site-audiences-design.md`. Every new or changed line on the site, with where it lives.

**Status column:** `A` = shown in the review or its mockups, approved by the owner 2026-11-10. `D` = draft written for this spec, not yet seen by the owner. Both are signed once at the end in `pnpm copy:review` (site-story D10). Lines not listed stay as they are.
**Rules:** US spelling. Prices are never typed: `{…}` marks a value computed from `PRICING`. Ledger ids are rows in `docs/research/2026-10-29-phase-17c-claim-check.md`. No vendor names. Website tracking is not mentioned in any new line (gated, `cap-websites`).

## 1. Shell

| Where | Line | St |
|---|---|---|
| Switch | For agencies · For local businesses | A |
| Announcement, home and both-reader pages | The free pilot is open. | A |
| Announcement, agency | The free pilot is open to agencies with local-business clients. · link: Join the free pilot → | A |
| Announcement, business | The free pilot is open. Local businesses can join the waitlist. · link: Join the waitlist | A |
| Agency menu | How it works · Sample brief · Pricing · Partners · Roadmap | A |
| Business menu | What you get · Sample brief · Pricing | D |
| Business join button (header, phone bar) | Join the waitlist | A |
| Footer pricing links on `/` and both-reader pages | Pricing for agencies · Pricing for local businesses | D |
| Footer tagline | that side's hero eyebrow (home eyebrow on both-reader pages) | A |

## 2. `/` (home)

| Key | Line | St |
|---|---|---|
| eyebrow | Competitor tracking for local businesses and the agencies that serve them | A |
| headline (`mark` in bold) | See what local rivals did **this week.** | A |
| sub | Rival Monday watches map rankings, reviews and ads around a local business and writes a Monday brief, with the evidence behind every claim. | A |
| question | Which one are you? | A |
| door 1 | I run an agency · Sell it to your clients under your own brand, at your own price. · For agencies → | A |
| door 2 | I own a local business · Get the Monday brief on your own competitors. · For local businesses → | A |
| under the doors | Not sure yet? See a sample brief | A |
| proof | Public information only · No claim without evidence | A |
| checks heading | No evidence, no claim. (existing `SECTIONS.checks.heading` and body) | A |
| doors band heading | Which one are you? (same two doors) | D |
| title | Rival Monday: see what local rivals did this week | D |
| description | Rival Monday watches map rankings, reviews and ads around a local business and writes a Monday brief with the evidence behind every claim. | D |

Ledger: `cap-rankings`, `cap-reviews`, `cap-ads`, `cap-weeklyBrief`, `cap-evidenceLinks`.

## 3. `/agencies`

| Key (`content/home.ts`) | Now | New | St |
|---|---|---|---|
| `HERO.headline` | Your competitors are making moves. Are you watching? | Tell every client what their rivals did **this week.** | A |
| `HERO.sub` (`subNoWeb` removed) | 49 words | Rival Monday tracks their map rankings, reviews and ads, then writes a Monday brief with the evidence attached. You sell it under your brand, at your price. | A |
| `HERO.heroCta` | Get a free brief for one of your clients | Get a free brief for one client | A |
| `SECTIONS.ceiling.heading` | Your clients trust you. So why do you sell them only one thing? | Your clients trust you. Give them one more reason to stay. | A |
| Margin example | one sentence | label "For example" + four cells: `{20} clients` / `at {$199}/mo each` · `{$3,980}` / `revenue a month` · `{$1,372}` / `platform cost` · `{$2,608}` / `margin a month` | A |
| `SECTIONS.recommendations.heading` | Every move becomes something to do about it. | Every rival move comes with a next step. | A |
| `SECTIONS.recommendations.body` | …This is the board your clients get, and it works: start one, finish one or dismiss one. | Each recommendation comes from the brief, with its evidence attached and who it is for. This is the board your clients get. Try it: start, finish or dismiss a recommendation. | A |
| Button under the client tour | — | Get a free brief for one client (quiet style; pilot off: the join button's own label) | A |
| Link under the claim checks | — | Open the sample brief → | A |
| `HOW_STEPS[3].title` | Monday brief + alerts | The brief lands on Monday | A |
| `COMMERCIAL.points[0].body` | …logo and colours on… | …logo and colors on… | A |
| Plan line, pilot | Then $229/mo or … with a 30-day trial. | **Free during the pilot.** Then one plan, with a `{30}`-day trial: + three cells: `{$229}/mo` / `or {$2,290}/yr · {3} client seats included` · `{$79}` / `each for clients {4–10}` · `{$59}` / `each from client {11}` | A |
| Plan line, pilot off | sentence | One plan, with a `{30}`-day free trial: + the same three cells | D |
| `CTA_BAND.heading` / `.body` | Join the pilot / Places are limited while we work closely with each agency. | Try it on one client, free. / Pilot places are limited because we work closely with each agency. | A |
| title, description | (today's home) | unchanged, moved to `/agencies` | A |

Gone: `SECTIONS.cast`, `SECTIONS['before-after']`, `CAST`, `BEFORE_AFTER`, `ANNOUNCEMENT.lead/examples`. Kept word for word: rival story heading and text, "What your client opens on Monday morning.", "Ask about any rival. Every answer shows its sources.", "Your name is on every brief, so we check every sentence.", "Your brand. Your price. Your billing.", "Pick one client. We'll show you what their rivals are doing."

## 4. `/business`

| Key | Line | St |
|---|---|---|
| hero eyebrow | Competitor tracking for local businesses | A |
| hero headline | Your competitors are making moves. Are you **watching?** | A |
| hero sub | Every Monday you get a short brief on what the businesses near you changed: map rankings, reviews and ads, with the evidence one click away. | A |
| hero buttons | Join the waitlist · See a sample brief | A |
| hero fine print, pilot | Free during the pilot · Then `{$249}`/mo · Set up for you by a local agency | A |
| hero fine print, pilot off | `{$249}`/mo is a typical price · Set up for you by a local agency | D |
| hero proof | Public information only · No claim without evidence · Run for you by an agency | A |
| rival story heading | While you were busy running the business, a rival took the map. | D |
| rival story intro (above the existing body) | Northwind Heating & Air is a made-up business. What happened to it is the kind of thing we see every week. | D |
| rival story body | existing `SECTIONS['rival-story'].body` / `RIVAL_STORY.bodyNoWeb`, unchanged | A |
| rival story closing | You won't catch this between jobs. A monthly rankings report won't either. | D |
| what-you-get eyebrow | What you get | D |
| what-you-get heading | What you open on Monday morning. | D |
| what-you-get body | Your competitors on one page, a short brief in your inbox every Monday, and an assistant to answer your questions. Every number links back to the evidence it came from. | D |
| what-you-get note (replaces the numbered notes) | The Monday brief and alerts are always included. Your agency decides whether you also get the dashboard and the assistant. | D |
| sample heading, body | existing `SECTIONS.sample` ("Click any claim to see the evidence behind it."), unchanged | A |
| close heading | Want this for your business? | D |
| close body, pilot | Join the waitlist and we'll email you when we can start watching your competitors. A local agency sets it up and runs it for you. Free during the pilot. | D |
| close body, pilot off | Join the waitlist and we'll email you when we can start watching your competitors. A local agency sets it up and runs it for you. | D |
| close button | Join the waitlist | A |
| title | Competitor tracking for your local business | D |
| description | A short brief every Monday on what the businesses near you changed: map rankings, reviews and ads, with the evidence one click away. | D |

Ledger: `feat-weekly-brief`, `feat-alerts`, `feat-evidence-links`, `feat-map-rankings` (business: yes); `feat-dashboard`, `feat-friday` (business: set by agency); `cap-reviews`, `cap-ads`; waitlist wording follows `JOIN_COPY.business.sub`. "Every week" in the intro restates `src-*` weekly cadence, not a customer count.

## 5. Pricing

**`/agencies/pricing`**

| Key | Line | St |
|---|---|---|
| h1 | One plan. Three clients included. | A |
| lead, pilot | Agencies buy the plan and add clients as they grow. | A |
| lead, pilot off | same | A |
| card, pilot off | existing `PLAN_CARDS.trial.agency` wording, unchanged (keeps "one active client until you add a card") | A |
| card chip, pilot | Free during the pilot | A |
| card price / note, pilot | `{$229}`/mo · or `{$2,290}`/yr · `{3}` client seats included · `{30}`-day trial | A |
| card rows | Clients `{4–10}` — `{$79}` each/mo · Clients `{11}` and up — `{$59}` each/mo | A |
| `AGENCY_POINTS` | "Friday and MCP, switched on per client" → Friday, plus a connection for your clients' own AI tools, switched on per client | A |
| features heading | What the plan includes | A |
| FAQ | the four existing entries, unchanged | A |
| title | Pricing for agencies: one plan, three clients included | D |
| description | The Rival Monday plan for agencies: what it includes, what it costs as you add clients, and how to cancel. | D |

**`/business/pricing`**

| Key | Line | St |
|---|---|---|
| h1 | One price. Your agency does the rest. | A |
| lead, pilot | Free during the pilot. After that you pay the agency that runs it for you. | A |
| lead, pilot off | You pay the agency that runs it for you. | D |
| card chip | Free during the pilot (pilot off: none; existing `PLAN_CARDS.trial.business` note stays) | A |
| card price / note | `{$249}`/mo · A typical price. Your agency sets it and sends the bill. | A |
| card points | existing `BUSINESS_POINTS`, unchanged | A |
| features heading | What you get | A |
| FAQ 1 | **Do I need an agency?** Yes. A local agency sets Rival Monday up for you and sends the brief under its own name. If you don't have one, join the waitlist and we'll match you with an agency where we can. | D |
| FAQ 2 | **Who sends the bill?** Your agency. It sets the price and bills you itself. `{$249}` a month is a typical price, not a fixed one. | D |
| FAQ 3 | **Where does the information come from?** existing `faq-data` answer, unchanged | A |
| FAQ 4 | **How do I cancel?** Ask your agency. It runs your subscription and can stop it for you. | D |
| title | Pricing for local businesses | D |
| description | What Rival Monday costs a local business: a typical monthly price, set and billed by the agency that runs it for you, and what you get for it. | D |

Ledger: `cap-publicPricing`, `cap-trial`, `cap-reseller`, `feat-client-billing`, `cap-mcp`, `faq-data`, `faq-cancel` (client part: the agency ends the subscription). "Match you with an agency where we can" is the existing `PLAN_CARDS.trial.business.note` wording.

## 6. Gallery

| Key | Line | St |
|---|---|---|
| tabs | Dashboard · Monday brief · Map rankings · Ads · Friday | A |
| buttons | Pause · Play | A / D |
| tab list name | Product screenshots | D |
| caption | Sample data from a fictional business. | A |
| alt, Dashboard | existing `HOME_IMAGES.hero.alt` | A |
| alt, Monday brief | The Monday brief email for a sample heating and air business: what each rival did this week, with a numbered source on every claim | D |
| alt, Map rankings | existing `HOME_IMAGES.heroMap.alt` | A |
| alt, Ads | The ads page for a sample heating and air business: which rivals are advertising, and the ads they are running | D |
| alt, Friday | existing `HOME_IMAGES.heroFriday.alt` | A |

Each alt is checked against the captured picture and corrected if the picture shows something else.

## 7. `/how-it-works` and `llms.txt`

| Key | Line | St |
|---|---|---|
| links back (after the steps) | See what your clients get → (`/agencies#client-view`) · Open the sample brief → (`/sample-brief`) · See the recommendations board → (`/agencies#recommendations`) | D |
| `JUMP_LINKS` | only the anchors that remain | — |
| `llms.txt` intro | Rival Monday watches the competitors of local businesses using public information only and writes a weekly brief where every claim links to the evidence behind it. Agencies sell it under their own brand; local businesses get it through an agency. | D |
