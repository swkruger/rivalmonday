# 17b copy sign-off

Owner: mark each row OK or write the edit, then answer "Decisions to confirm" at the end. Source = where the string lives (`apps/site/...`); the code is the source of truth and the strings below were copied from it. `{x}` = a value filled in at render time. **CHANGED** = differs from the plan's decided copy; **NEW** = not in the plan. Line numbers are as of the 17b branch head and may drift.

## 1. Announcement bar (`content/home.ts` 15-20; `src/components/shell/announcement-bar.tsx`)
| Copy | OK / edit |
|---|---|
| Lead: "Pilot now open for agencies serving local businesses" then " — like {example}" | |
| Examples (rotate every 3 s; kinds of business, not customers): HVAC, plumbing, dental, roofing, med spas, law firms, landscaping, auto repair | |
| Link: "Join the pilot →" | |
| Shown only while Pilot mode is on | |

## 2. Navigation, menu, header (`content/pages.ts` 26, 35, 59; `src/components/shell/`)
| Copy | OK / edit |
|---|---|
| Nav: How it works, Sample brief, Pricing (`/#pricing`); "Sign in" (links to the app) | |
| Mobile menu: button aria "Menu", sheet title "Menu", nav aria "Mobile"; header nav aria "Main"; logo aria "Rival Monday home" (**NEW**) | |
| Social links: generic glyphs, aria "Rival Monday on {network}"; only networks with a `NEXT_PUBLIC_SOCIAL_*` URL show (**NEW**, see decision 4) | |

## 3. Hero (`content/home.ts` 3-13; `src/components/home/hero.tsx`)
| Where | Copy | OK / edit |
|---|---|---|
| Pill | Pilot | |
| Eyebrow | White-label competitor intelligence for agencies | |
| H1 | Every Monday, your clients learn what their competitors did last week, under your brand. ("under your brand." in the secondary colour) | |
| Sub | Rival Monday watches your clients' local rivals — websites, Google reviews, ads and map rankings — and turns it into an evidence-backed weekly brief, a dashboard and an AI assistant you sell as your own. | |
| CTAs | Join the pilot · See a sample brief | |
| Fine print | Free during the pilot · No card needed · Limited places | |
| Fragments (`hero-fragments.tsx` 46-80) | "Monday brief · {business}", "Week of {date}", "Evidence {n}", "{n} sources" (**CHANGED**: Task 13 made the fragments less layered to stop overlap; see decision 2) | |
| Screen-reader line (`hero.tsx` 33-34) | Preview of a sample Monday brief. Jump to the full sample (**NEW**) | |

## 4. Home sections (`content/home.ts` 35-78, 80-107)
| Section | Eyebrow / heading / body | OK / edit |
|---|---|---|
| sample | Sample brief / Click any claim to see the evidence behind it. / This is a full Monday brief for a fictional heating and air business. Every line links to the snapshot, reviews or ads it came from. Move the slider to see how the map rankings changed week by week, or ask Friday. | |
| live | This week on Rival Monday / Real numbers from the platform, updated every few minutes. / Rounded down. | |
| how-it-works | How it works / From client to Monday brief in four steps. | |
| checks | How we check every claim / No evidence, no claim. / Every sentence in a brief starts from something we captured: a page snapshot, a review, an ad, a ranking. Before a brief goes out, a separate check compares each claim with its evidence. Anything it can't back up is dropped, not softened. Link: "Read how we check claims →" | |
| friday | Friday, your clients' assistant / Ask about any rival. Every answer shows its sources. / Friday answers from the same evidence as the brief, with the sources inline. It's included under your brand, in the dashboard and for AI tools that support MCP. (**NEW** wording) | |
| real-sample | A real sample for your client / See one of your own clients before you commit. / Tick "Send me a real sample brief" when you join. We build a starting-point brief for one of your clients from public information and email you a private link. Free during the pilot, a limited number each month. Button: "Request a real sample" | |
| pricing | Pricing / Free during the pilot. / You set your own prices for your clients and bill them in your name. | |
| Steps | 1 Add a client: Enter the business and its service area. We find its Google listing. 2 We find the rivals: We search the area and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick. 3 We watch every week: Websites, Google reviews, ads and map rankings, checked on a schedule and saved as evidence. 4 Monday brief + alerts: Your client gets a short brief under your brand, with the evidence one click away. Big moves send an alert. | |
| Pricing lines (numbers from `content/pricing.ts`) | "Agencies: then $229/mo including 3 client seats, $99 per extra seat, with a 30-day trial." "Local businesses: then ${NEXT_PUBLIC_CLIENT_PRICE_USD}/mo." Button "Join the pilot". The client price comes from an env var; set it before launch. | |
| CTA band (also footer) | Join the pilot / Places are limited while we work closely with each agency. / Join the pilot | |
| Founder note | Hidden until supplied (`content/founder.ts`, `FOUNDER_NOTE = null`); see decision 5 | |

## 5. Live counters (`content/home.ts` 109-114; `src/components/home/live-counters.tsx`)
| Label | Caption | OK / edit |
|---|---|---|
| rival sites watched | Right now | |
| snapshots taken | Last 7 days | |
| claims checked against evidence | Last 7 days | |
| claims dropped for lack of evidence | Last 7 days | |

Strip aria "Live platform numbers" (**NEW**). Numbers are fetched once per page view, so "updated every few minutes" is true across visits, not on an open page.

## 6. Sample brief page and the data in it (`src/app/sample-brief/page.tsx` 12-14; `content/sample-brief.json`)
| Where | Copy | OK / edit |
|---|---|---|
| Eyebrow / H1 / sub | Sample brief / A Monday brief, start to finish / Fictional business, real product. Click any claim to see its evidence. | |
| Captions | "All businesses, people and places are fictional." (`sample-brief.tsx` 34); "Sample data · All businesses, people and places are fictional." (`evidence-panel.tsx` 84); label "Sample data" | |
| Panel labels | "Map rankings", "Ask Friday", "Canned answers from the sample data", "Recommended:", "Show as table", "Not found", "No data", "Nothing here in this version.", kind labels Website / Reviews / Ads / Map rankings / Listing (**NEW**) | |
| Fictional client | **Northwind Heating & Air**, "Heating & air", area "Marlowemere" (see decision 1) | |
| Rivals | Quillstone Climate Pros (top), Juniperwell Air Works (top), Tidewell Mechanical (watch), Saffronfield Climate Pros (watch), Copperleaf Comfort Co (minor), Kestrel Mechanical (minor) | |
| Item i1 (rank) | "ac repair marlowemere": average map position 5.5 → 3.1, top-3 share 16% → 63%. Why: Quillstone Climate Pros now shows in the map top 3 across 63% of your service area, up from 16%. Action: Check your Google Business Profile categories and recent reviews for the areas they took. (See "Open copy issues".) | |
| Item i2 (website) | Kestrel Mechanical cut its AC repair diagnostic to $69 (was $89). Why: Price-sensitive customers in your area compare these prices before they book. Action: Promote a value bundle instead of matching the price. | |
| Item i3 (ads) | Quillstone Climate Pros started 2 Meta ads. Why: More paid ads usually mean more calls going to them for the same searches. Action: Check your ad coverage on the same keywords. | |
| Item i4 (website) | Tidewell Mechanical added heat pump installation to its services. Why: They now compete for a service you offer. Action: Highlight your experience with this service on your site. | |
| Evidence summaries (**NEW**, generated by the exporter) | "{Rival}: top 3 in {n} of {p} points" (e1) and "You: top 3 in {n} of {p} points" (e6-e17); e2-e5 are snapshot and ad views from the seed | |

Names are produced by `packages/demo/src/site-export/rename.ts` (`FICTIONAL`). Business stems: Copperleaf, Bluejay, Kestrel, Summitpine, Owlbrook, Fernhollow, Larkspur, Tidewell, Quillstone, Marigold, Brightkettle, Juniperwell, Hollowbrook, Saffronfield, Cobaltcreek, Wrenhaven, Amberglen, Ploverline, Mossgate, Thistledown, Heronmoor, Lindenvale, Sorrelby, Teaselwick. Tails: Comfort Co, Air Works, Mechanical, Climate Pros, Home Services. Place stems: Lark, Quill, Briar, Wren, Amber, Tide, Fenn, Owls, Marlowe, Cobble, Juniper, Saffron, Plover, Moss, Kettle, Thistle, Harrow, Fallow, Brindle, Gorse, Heron, Linden, Sorrel, Teasel; place tails: haven, more, field, mere, bury. State "Westmarch" / "WM" (`STATE_TERMS`: Texas, TX and North Texas map to these). Check that none reads as a real firm.

## 7. Friday's canned answers (`content/sample-friday.ts` 13-48; each figure cites its evidence)
| Question | Answer | OK / edit |
|---|---|---|
| What changed with Quillstone Climate Pros? | In last week's map scan for "ac repair marlowemere", Quillstone Climate Pros ranked in the top 3 at 31 of 49 points. It also started Meta ads. One offers 0% financing for 60 months on new systems, another a Comfort Club with two tune-ups a year and 15% off repairs. (**typo**: the code reads "another a Comfort Club") | |
| Should we match Kestrel Mechanical's price? | Kestrel Mechanical cut its AC repair diagnostic from $89 to $69. Rather than match it, promote a value bundle: price-sensitive customers in your area compare these prices before they book. | |
| Who is winning the map for "ac repair marlowemere"? | In the latest scan you are in the map top 3 at 42 of 49 points. The rival to watch is Quillstone Climate Pros: in the scan a week earlier it ranked in the top 3 at 31 of 49 points. Check your Google Business Profile categories and recent reviews for the areas it took. (implies a gain e1 does not show; suggested "the areas it covers") | |
| What did Tidewell Mechanical change on its website? | Tidewell Mechanical added heat pump installation to its list of services. They now compete for a service you offer, so highlight your heat pump experience on your site. | |

## 8. Join popup (`src/components/join/copy.ts`)
| Step | Copy | OK / edit |
|---|---|---|
| 1 | Step 1 of 2 · Join the Rival Monday pilot · Tell us who you are — we'll send you an invite as places open. · "I run an agency": Resell Rival Monday to your clients under your own brand. Free during the pilot, then $229/mo incl. 3 client seats. · "I own a local business": Get a weekly brief on what your competitors are doing. Free during the pilot, then ${client price}/mo. · Takes 30 seconds · Continue · Back | |
| 2 Agency | Step 2 of 2 · Agency · About your agency · We'll email you when your pilot place is ready. Fields: Your name, Work email, Agency name, Website, Local-business clients (band, "Select…"). Sample: "Send me a real sample brief for one of my clients", Client business name, Client website, "or city / ZIP", hint "One of the two is enough." Submit "Join the waitlist". Fine: Protected by Cloudflare Turnstile. We only use this to contact you about the pilot. | |
| 2 Business | Step 2 of 2 · Local business · About your business · We'll email you when we can start watching your competitors. Fields: Your name, Email, Business name, Website, "or city / ZIP", hint "One of the two is enough.", Type of business ("Select…", "Other…", "Describe your business"). Submit and fine print as above. | |
| Validation and submit messages (**NEW**, plan gave none) | "Please leave web addresses out of this field." · "Please check the details above." · "Still checking, try again in a moment." · "The check didn't go through. Please try it again." · "We couldn't send this just now. Please try again in a minute, or email support@rivalmonday.app." · "Something went wrong. Please try again." | |
| Done | You're on the list. We've emailed you a confirmation. · Click the link in that email to confirm your address. (second line **NEW**) · Close | |
| Pilot-off CTAs | Footer: "Own a local business? Join the waitlist" appears only while Pilot mode is off; the bar and the Pilot pill disappear then; the popup copy is unchanged | |

## 9. How it works page (`content/how-it-works.ts`; eyebrow in `src/app/how-it-works/page.tsx`)
Title "How we check every claim". Sections: 1 We capture the evidence · 2 We write only from the evidence · 3 A second check reads every claim · 4 You can always click through · What we don't do. All of it is **NEW**; read the file in full (1.4 KB), especially "When the verifier is unsure, a person decides." and "we identify our crawler and respect each site's robots.txt".

| OK / edit | |
|---|---|

## 10. 404 (`src/app/not-found.tsx` 6-10)
"Page not found" · "That page doesn't exist or has moved." · links Home, Sample brief.

## 11. Page titles and descriptions (`content/pages.ts`)
| Page | Title / description | OK / edit |
|---|---|---|
| / | Rival Monday — White-label competitor intelligence / Give your local-service clients a weekly, evidence-backed competitor brief under your own brand. Public information only, no claim without evidence. | |
| /how-it-works | How it works / How every claim in a brief is captured, written from evidence, verified and linked back to its source. | |
| /sample-brief | Sample Monday brief / See a full Monday brief for a fictional local business, with every claim linked to the evidence behind it. | |
| /privacy | Privacy / What the waitlist form collects, why, and who helps us run the site. | |
| /terms | Terms / Terms for the Rival Monday pilot and this website. | |

SEO stem (`content/site.ts`): "White-label competitor intelligence for agencies".

## 12. Footer (`src/components/shell/site-footer.tsx`)
Columns "Product" (How it works, Sample brief) and "Legal" (Privacy, Terms); nav aria "Footer"; "© {year} Rival Monday"; CTA band as in section 4.

## 13. Legal drafts (placeholders; counsel replaces them)
`apps/site/content/legal/privacy.md` and `terms.md` are drafts marked `OWNER-PLACEHOLDER`; `check:placeholders` flags them. The privacy draft also describes the source/referrer, the hashed IP, the confirmation email, Turnstile, Vercel Web Analytics and browser Sentry. Confirm those claims with counsel and against what ships.

## Open copy issues (found while collecting; docs-only task, not fixed here)
1. Friday Q1 "another a Comfort Club" is a typo (`sample-friday.ts` 26). Suggested: "another offers a Comfort Club".
2. "the areas they took" (item i1 action) and Q3 "the areas it took" imply a gain the cited evidence does not show.
3. Item i1's headline "5.5 → 3.1, 16% → 63%" cites e1, which evidences only 31 of 49 points; the prior-week figures have no evidence of their own. Add evidence for the earlier scan or drop the before-figures.

## Decisions to confirm
1. **Fictional client "Northwind Heating & Air"**: a Microsoft sample-company name and possibly a real US firm. Keep, or choose another (`rename.ts` `FICTIONAL.client`; re-export the sample after changing it).
2. **Hero layout**: after the Task 13 overlap fix the fragments are less layered than the mockup. Keep, or ask for a different arrangement.
3. **H1 tracking**: -0.02em on the site vs -0.035em in the mockup (a site token). Keep or tighten.
4. **Social glyphs**: generic icons (no brand logos, per the no-Meta-logos rule). Keep, or supply brand icons.
5. **Still to write**: the founder note and photo (section hidden until supplied), the privacy text and the terms text.
6. Plan decisions P1, P3, P6 and P13 are unchanged in the code; no action unless you object.
