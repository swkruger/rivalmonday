# 17c copy sign-off

Owner: mark each row OK or write the edit. Compare pages (section 5) also need **counsel** sign-off. Source = where the string lives (`apps/site/...`); the code is the source of truth. `{x}` = filled in at render time. **CHANGED** = differs from the plan or from 17b copy; **NEW** = not in the plan. Every claim is traced to code in `docs/research/2026-10-29-phase-17c-claim-check.md`; logos in `docs/research/2026-10-29-phase-17c-vendor-logos.md`; rival facts in `docs/research/2026-10-28-phase-17-comparison-facts.md`.

## 0. Owner checks before anything ships
| Check | Done |
|---|---|
| Stripe Connect fee is 0 at `/platform/billing` (global **and** every per-agency fee) before "We add no platform fee" ships (Stripe page, partners billing) | [ ] |
| Prod `standard` plan includes Ask and MCP (pricing rows "Friday", "MCP"; FAQ MCP) | [ ] |
| Stripe customer portal lets agencies cancel (FAQ "How do I cancel?") | [ ] |
| `ANTHROPIC_API_KEY` set in prod (Anthropic page "batch API" line) | [ ] |
| `WEB_MONITORING_ENABLED=true` on the app, after `https://rivalmonday.app/bot` loads, **before the site deploys** (website snapshot claims; `competitor-websites` source page). Then set `WEBSITE_MONITORING_LIVE = true` in `apps/site/content/website-monitoring.ts` (**CHANGED**: one constant drives the Rival Monday `websites` cell, the compare hub "What gets watched" row and the website `weDiffer` lines; decision 3) and redeploy the site | [ ] |
| Vendor logos: download from official press kits for OpenRouter and Neon (logo-ok), commit, set `approved=yes` in the logo ledger; check Railway, Postmark, Sentry guidelines (unchecked, shown as text until then) | [ ] |
| Counsel reviewed `/compare/*` with archived source PDFs; then set `NEXT_PUBLIC_COMPARE_PAGES` in Vercel and re-run `deploy-site` | [ ] |
| Rival facts re-checked within 7 days of first publish and kept under 90 days (`check:facts` refuses the deploy otherwise, for all five rivals) | [ ] |

## 1. Navigation, footer, titles (`content/pages.ts`; `src/components/shell/site-footer.tsx`)
| Copy | OK / edit |
|---|---|
| Nav (**CHANGED**: 3 items to 5, plus Sign in): How it works, Integrations, Compare, Pricing (**CHANGED**: now `/pricing`, was `/#pricing`), Partners | |
| Footer (**NEW**): Product (How it works, Sample brief, Pricing, Integrations, Sources); Compare ("Compare overview" + enabled rival names); Company (Partners); Legal (Privacy, Terms). A column with no registered page is hidden | |
| Page titles (suffix " · Rival Monday" added): How it works; Sample Monday brief; Pricing; Partners; Integrations; Sources; Compare; Privacy; Terms. Home is absolute: "Rival Monday — White-label competitor intelligence" | |
| Descriptions: `/pricing` "Agency and local-business plans for Rival Monday: what each includes, what it costs, and how to cancel." / `/partners` "Resell Rival Monday under your own brand: you set your client prices and bill through your own Stripe account." / `/integrations` "The services Rival Monday runs on, and what each one means for your agency." / `/sources` "What Rival Monday collects from public information, how often, and what it leaves alone." / `/compare` "How Rival Monday compares with other kinds of local-competitor tools, and named comparisons where we publish them." | |
| Vendor page `<title>` "{Vendor} integration · Rival Monday" with h1 "{Vendor} at Rival Monday" (**NEW**, decision 7) | |
| OG image eyebrows (**NEW**): home = `HERO.eyebrow` "White-label competitor intelligence for agencies"; others = How it works, Sample brief, Pricing, Partners, Integrations, Sources, Compare | |

## 2. Integrations: strip, hub, 9 vendor pages (`content/integrations.ts`, `content/home.ts` 64-69; `src/components/integrations/`, `src/app/integrations/`)
| Where | Copy | OK / edit |
|---|---|---|
| Home strip (**NEW**) | Eyebrow "Integrations" / "The services Rival Monday runs on" / "Hosting, AI, email and billing from established providers. Your clients' data is stored in our database and evidence store." (**CHANGED** final review: was "stays in"; model input reaches the AI providers; ledger `int-data-stored`) / link "See all integrations →". Logos only when approved, else text names | |
| Hub | Eyebrow "Integrations" / h1 "What Rival Monday runs on" / lead "The services Rival Monday runs on, and what each one does for your agency." / note "Listing a service doesn't mean it endorses Rival Monday. Names are trademarks of their owners." | |
| Vendor page frame | h2s "What it is", "How Rival Monday uses it", "What it means for your agency", "Other integrations"; link "All integrations" | |
| OpenRouter: "Routes our AI calls." | Is: A gateway that gives one connection to many AI models, so we can pick the right model for each job. Use: Writing the weekly briefs and answering questions in Friday. / Turning text into searchable form, and running the checks that decide whether a claim is kept. / Zero data retention is requested for our calls. Agency: The models can change over time without changing how you use Rival Monday. / Every claim a brief makes still links back to its evidence. | |
| Anthropic: "Claude models for writing and topic work." | Is: The company behind the Claude family of AI models. Use: Claude models write the briefs and answer Friday (through OpenRouter). / Background topic work can use Anthropic's batch API. Agency: Claude is one of the model families behind your briefs. Other services in this list handle other AI jobs. | |
| Neon: "Our Postgres database." | Is: A hosted Postgres database service. Use: Holds every agency, client, brief and alert. / Row-level security walls off each agency. Agency: Your agency sees only its own clients and data. | |
| Vercel: "Hosts the app and this site." | Is: A hosting platform for web applications. Use: Hosts the app, its API, the MCP endpoint and this website. Agency: The dashboard, Friday and the MCP connection are served from the same place. | |
| Railway: "Runs the background worker." | Is: A platform for running always-on services. Use: Runs the worker that collects public information and runs the weekly schedules. Agency: Collection and briefs run in the background, so your team does not have to start them. | |
| Cloudflare: "Evidence storage and bot protection." | Is: A network and security company. We use two of its services: R2 storage and Turnstile. Use: R2 stores every snapshot behind a claim. / Turnstile keeps bots off public forms. Agency: Evidence stays available, so you can open the source behind any claim. | |
| Postmark: "Sends briefs, alerts and invites." | Is: A service for sending transactional email. Use: Delivers briefs, alerts, invitations and sign-in emails. / Reports bounces back to us so a bad address is noticed. Agency: Briefs and alerts reach your clients by email, and a hard bounce is flagged to your agency. | |
| Stripe: "Billing for agencies and their clients." | Is: A payments and billing service. Use: Bills agencies for Rival Monday through Stripe Billing. / Lets agencies bill their own clients through Stripe Connect. Agency: Your clients pay you directly through your own Stripe account (Stripe Connect). **We add no platform fee.** (owner check: fee 0) | |
| Sentry: "Error monitoring." | Is: An error-tracking service. Use: Tells us when the app, the worker or this site hits an error. / Email addresses are masked, and cookies, IP addresses and request bodies are dropped before a report is sent. Agency: We hear about problems early, before anyone writes in. (the "before" timing is a soft claim; soften?) | |
| Page descriptions | "How Rival Monday uses {Vendor} to ..." one per vendor (`seo.description` in `integrations.ts`) | |

## 3. Sources: hub + 6 pages (`content/sources.ts`; `src/app/sources/`)
| Where | Copy | OK / edit |
|---|---|---|
| Hub | Eyebrow "Sources" / h1 "What Rival Monday collects" / lead "Everything comes from public information. Here is what we collect, how often, and what we leave alone." / note "Meta, Google and other names on this page are trademarks of their owners. We name them only to say where public information comes from. Listing a source does not mean its owner endorses Rival Monday." | |
| Page frame | h2s "What we collect", "How often", "What we don't do", "In your brief, for example" (examples are illustrations, not claims), "Other sources" | |
| Shared "don't" line | We never log in to any site to collect, and we never use private data. | |
| Competitor websites (**gated by `WEB_MONITORING_ENABLED`**) | A snapshot of each rival page we watch, such as services, pricing and offers, so a change can be shown against the earlier version. / Only public pages. Our crawler identifies itself as RivalMondayBot, respects robots.txt, and waits at least 3 seconds between requests to the same site. Often: Daily or weekly for each page. Weekly during an open free trial. Don't: We do not read pages a site has asked crawlers to stay out of, and we do not try to get around a block. Example: A rival changes its offer or adds a service page, and the brief shows the page before and after. | |
| Google reviews | New public Google reviews on your rivals' listings: the rating, the text and the date. / Reviewer names are pseudonymised and contact details are removed before a review is stored. Weekly. Don't: We show reviewer names only in pseudonymised form, and we never keep contact details. Example: A burst of complaints about a rival, or a theme in what its customers praise, with the reviews linked as evidence. | |
| Google Business Profile | The public listing fields of each rival: its categories, opening hours and rating. Weekly. Don't: We read the public listing only, never the owner's dashboard. Example: A rival extends its opening hours or adds a category, shown against the previous week's listing. | |
| Ads on Meta and Google | Ads your rivals are running, as listed in the Meta Ad Library. / Ads your rivals are running, as listed in the Google Ads Transparency Center. Weekly. Don't: We see only what the public ad libraries list. Example: A rival starts a new seasonal campaign, with the text of the ad where the library shows it. | |
| Local map rankings | A grid of points across your service area. At each point we record who ranks in the local map results. / Up to five keywords per client. Weekly, every Sunday. You can run one extra scan a week with "Scan now". Don't: We do not track individual searchers. A ranking is what a public map search shows at that point. Example: A rival moves ahead of you in one part of your service area. | |
| Job postings (**NEW**; replaces the planned social page, decision 2) | Job listings on Google that match a rival, so you can see which roles it is hiring for. Weekly. Don't: We do not contact applicants or employers. Example: A rival hires a second crew lead or a new office role, a hint about where it is growing. | |
| Descriptions | one per source (`seo.description`) | |

## 4. 17b copy corrected in 17c (**CHANGED**; compare with `docs/archive/phase-17b-copy-signoff.md`)
| Copy | OK / edit |
|---|---|
| How it works step 3: "A claim that falls below the bar is dropped, not softened. Your team can edit or approve each brief before it is sent." (was "a person decides"; **CHANGED** final review: redundant second "dropped" sentence removed) | |
| Home Friday section: "It's the in-app assistant, under the name you choose, and your agency switches it on for each client. MCP is separate: it lets a client's own AI tools read the evidence, also switched on per client." | |
| Live counters: "rivals watched", "evidence captured" (were "rival sites watched" and a ~0 count) | |
| Checks hub: ads read "Meta Ad Library and Google Ads Transparency Center" (was Meta only) | |

## 5. Compare (owner **and counsel**; `content/compare.ts`; `src/app/compare/`)
Pages ship **off** (`NEXT_PUBLIC_COMPARE_PAGES` unset). Rival facts, prices and source URLs were verified line by line against the research file (checked 2026-10-28). A rival cell is only yes / partly / text / "Not stated publicly", never "no"; absences read "As of {date}, X's public pages don't list ...".
| Where | Copy | OK / edit |
|---|---|---|
| Hub | Eyebrow "Compare" / h1 "How Rival Monday compares" / lead "Tools for watching local competitors fall into a few groups. Here is how each group typically works, next to Rival Monday." / note "The other columns describe what such tools typically do, not any one product." / h2 "Named comparisons" (only when pages are enabled) | |
| Hub table | Columns: Rival Monday, DIY spreadsheets, Local-SEO toolkits, Reputation suites. Rows: What gets watched, How often, Evidence, Under your brand, Pricing (20 cells in `CATEGORY_TABLE`; the two toolkit/suite columns all say "Typically ...") | |
| Rival page frame | h1 "Rival Monday vs {Rival}" / "Facts checked {date}" / summary / h2s "Where {Rival} is better", "Where Rival Monday is different", "Pricing", "{Rival}, from public pages" (**CHANGED** final review: was "What {Rival} says about itself"; the list holds our dated absence lines and Capterra data) / source links add a screen-reader-only "(opens in a new tab)" (**NEW**) | |
| Trust lines | "Information as of {date}, from public vendor pages." / "{Rival} is a trademark of its owner; Rival Monday is not affiliated with {Rival}." / "Spotted something out of date or wrong? Email support@rivalmonday.app and we will correct it." | |
| Cell wording | Rival Monday: "Yes" / "Partly: {label}" / "Not offered". Rival: "Yes" / "Partly: {label}" / text / "Not stated publicly" | |
| Rival Monday column (15 rows; ledger `cap-*`) | websites **Partly "Switching on soon"** (flip when monitoring is on) / reviews "Rivals' new Google reviews, weekly" / ads "Rivals' ads on Meta and Google" / gbp "Changes to rivals' Google Business Profiles" / rankings "Weekly map rankings across the service area" / social **Not offered** / brief "A brief every Monday; your team can edit or approve it before it goes out" / evidence "Every claim links to its evidence" / assistant "Friday answers with its sources, under the name you choose" / MCP "AI tools that support MCP can read your clients' data" / API **Not offered** / white-label **Partly** "Your name, logo, colors, email sender name and sign-off, and assistant name" (**CHANGED** final review: roadmap clause dropped here and in the hub "Under your brand" row; kept in the FAQ and partners copy) / reseller "Bill clients through your own Stripe account" / pricing "$229/mo for the agency, 3 client seats included, $99 per extra seat" / trial "30-day free trial; one active client until you add a card" | |
| RivalMappd | summary, 10 facts, 4 prices incl. "No setup fees. No contracts.", better-at (done-for-you work), 4 differences, 15 cells | |
| BrightLocal | summary, 7 facts, 4 prices (from $31/mo billed annually; 14-day trial), 3 better-at, 3 differences, 15 cells | |
| Local Falcon | summary, 8 facts, 3 prices, 5 better-at (incl. Falcon Agent, API/MCP), 3 differences, 15 cells | |
| Birdeye | summary, 6 facts, pricing by quote, 3 better-at, 4 differences, 15 cells ("By quote"; reseller yes) | |
| Visualping | summary, 7 facts, 5 prices, 4 better-at (any web page, screenshots, API and MCP on every plan, free tier), 4 differences, 15 cells | |
| Accepted omissions | Dropped RivalMappd "Google Ads coverage" and BrightLocal "mature"; RivalMappd trial shown "Not stated publicly"; website-monitoring `weDiffer` lines left out until monitoring is on | |
| Website copy once `WEBSITE_MONITORING_LIVE = true` (**NEW**) | Rival Monday `websites` cell **Yes** "Snapshots of rivals' key pages, changes flagged" / RivalMappd and Birdeye difference "Snapshots rivals' key pages and flags changes." / hub "What gets watched": "Rivals' websites, Google reviews, Google Business Profiles, Meta and Google ads, and map rankings" (while off: same without "websites, ") | |

## 6. Pricing (`content/pricing-page.ts`, `content/pricing.ts`; `src/app/pricing/`, `src/lib/json-ld.ts`)
| Where | Copy | OK / edit |
|---|---|---|
| Header | Eyebrow "Pricing" / h1 "Simple pricing for agencies and their clients" / lead "One plan for agencies, with client seats included. Local businesses are served by an agency." / h2s "What each plan includes", "Questions" | |
| Agency card, pilot | "For agencies" / "Free during the pilot" / "Then $229/mo including 3 client seats · $99 per extra seat · 30-day trial" | |
| Agency card, trial | "$229/mo" / "30-day free trial (one active client until you add a card), then $229/mo including 3 client seats · $99 per extra seat" | |
| Agency points | Your name, logo and colors on client pages and emails / A Monday brief for every client, with evidence one click away / Friday and MCP, switched on per client / Bill clients through your own Stripe account | |
| Business card, pilot | "For local businesses" / "Free during the pilot" / "Then ${client price}/mo" | |
| Business card, trial | "${client price}/mo" / "Join the waitlist and we'll match you with an agency where we can" | |
| Business points | A Monday brief about your local rivals, with the evidence behind each claim / Alerts when a rival makes a big move / Run through your agency, who sets up the rest | |
| Feature table (agency / business) | Monday brief: yes / yes. Alerts on big moves: yes / yes. Client dashboard: yes / "Set by your agency". Evidence links: yes / yes. Friday, the assistant: yes / "Set by your agency". MCP: yes / "Set by your agency". Your branding: yes / no. Competitor discovery: yes / "Automatic once, then on request through your agency". Weekly map rankings: yes / yes. Client billing in your name: yes / no | |
| FAQ: white-label | "Mostly. You set your name, logo, colors, email sender name and sign-off, and your assistant's name, and client pages do not show Rival Monday's name. Your own web address for client logins is on the roadmap. For now, logins and links use our address. Emails are sent from our address under your sender name." (decision 5) | |
| FAQ: data | "Public information only. We never log in to anything, and reviewers are pseudonymized." + link "See what we collect" | |
| FAQ: MCP | "It lets AI tools that support MCP, such as Claude, read your clients' competitor data with your permission. It is included in the plan, and you switch it on per client." | |
| FAQ: cancel | "Agencies cancel from Billing, and access lasts to the end of the paid period. A client's billing runs through their agency, so clients ask their agency to cancel." | |
| JSON-LD offers (crawlable, **NEW**) | Agency: "Includes 3 client seats; $99 per extra seat; 30-day trial." Local business: "One business, served by our agency." Offer names "Agency", "Local business"; FAQPage reuses the four answers above | |

## 7. Partners (`content/partners.ts`; `src/app/partners/`)
| Where | Copy | OK / edit |
|---|---|---|
| Header | Eyebrow "Partners" / h1 "Resell Rival Monday as your own" / lead "Offer your local-service clients a weekly, evidence-backed competitor brief. Your name on it, your prices, your billing." / CTA "Join the pilot" (top and bottom) | |
| Your brand | "Your agency name, logo and colors appear on client pages and emails. Emails go out under your sender name and sign-off, and you can rename the assistant. Your own web address for client logins is on the roadmap." | |
| Your prices | "You set what your clients pay." | |
| Your billing | "Clients pay you through your own Stripe account, using Stripe Connect. We add no platform fee on what your clients pay you." (owner check: fee 0) | |
| Worked example | h2 "A worked example" / "Your plan is $229/mo including 3 seats, then $99 per extra seat." / "Free during the pilot" (pilot only) / rows: Clients 10; example client price **$199/mo**; cost $229 + 7 × $99 = $922; revenue $1,990; margin $1,068 / caption "Example: 10 clients at an example price of $199/mo. You set your own prices. Before Stripe processing fees and taxes." **The $199 is an example only; the owner signs the number.** | |

## 8. llms.txt (`src/lib/llms.ts`)
| Copy | OK / edit |
|---|---|
| Intro (**NEW**): "Rival Monday gives agencies a white-label service for their local-service clients: a weekly brief on competitors, built only from public information, where every claim links to the evidence behind it." Headings "# Rival Monday", "## Pages", "## Integrations", "## Sources", "## Compare"; each line = page title + description | |

## Decisions to confirm
1. **P1 compare pages default off.** The hub is always on; named pages exist only for slugs in `NEXT_PUBLIC_COMPARE_PAGES` (fail closed) after counsel. Agree?
2. **P4 social dropped, job postings added** (and Google ads added to the ads source), because we do not collect social. The compare row "Competitor social media" reads Not offered for us. Agree?
3. **Rival Monday website cells.** "Switching on soon" until `WEB_MONITORING_ENABLED` is on; then flip to yes and restore the website `weDiffer` lines once. OK?
4. **P6 verdicts** per vendor (logos: OpenRouter, Neon; text only: Anthropic, Cloudflare, Stripe, Vercel; Railway, Postmark, Sentry unchecked). No Google or Meta logos anywhere. OK?
5. **P15 white-label wording** says "Mostly" / "partly" and names the roadmap (own domain). `HERO.eyebrow` and the headline "under your brand" are 17b copy and stay; keep them given the partial white-label, or soften?
6. **P10 price.** $229 / 3 seats / $99 extra / 30-day trial shown; business price from `NEXT_PUBLIC_CLIENT_PRICE_USD`. Confirm the business price and the $199 partner example.
7. **Vendor page `<title>`** "Stripe integration · Rival Monday" with h1 "Stripe at Rival Monday". Rename?
8. **P13 nav** order: How it works, Integrations, Compare, Pricing, Partners. OK?
9. **Affiliate program** is not offered; the partner page only offers reselling. OK?
