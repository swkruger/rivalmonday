# site-story — homepage as a story (design)

**Status:** owner-approved 2026-11-04 (strategy, order, copy, price). Extends `2026-10-28-phase-17-marketing-site-design.md` (§ 1, 3, 4, 7.2, 7.6, 7.8); only new decisions and interfaces here. Branch brief: `docs/work/site-story.md` (D1–D7).

## 1. Decisions (new)
- **D1–D7** as recorded in the brief (hero H1, 11-section order, removals, $249 direct price, website lines gated, founder note `null`, reuse demos).
- **D8** Founder note keeps its `OWNER-PLACEHOLDER` marker: the production site deploy waits for the note (as privacy/terms already do).
- **D9** $249 via `DEFAULT_CLIENT_PRICE_USD = 249` in `apps/site/src/lib/env.ts`; owner confirms Vercel `NEXT_PUBLIC_CLIENT_PRICE_USD` is unset or 249 (staging + prod).
- **D10** Copy is signed once, at the end: owner runs `pnpm copy:review` (site surface) then `copy:status --prune`, after main's uncommitted `docs/copy/signoff.json` lines are committed.
- **D11** Removed home-only code is deleted (`PricingTeaser`, home guide slugs); shared components used by `/how-it-works` stay and get opt-out props instead (that page is unchanged).
- **D12** Pre-existing ungated website wording outside the new copy (`SECTIONS.checks.body` "a page snapshot", `HOW_STEPS[2]` "Websites, …") is not touched here: backlog item, fixed when the owner flips `WEBSITE_MONITORING_LIVE`.

## 2. Design plan (binding for this branch; `docs/design-system/` still wins)
Palette and type are fixed by the brand (Inter; ink #0B2540, primary #47A8E7, secondary #2A6BAC, canvas #F6F9FC, grey panel #EEF2F6, amber only for Friday + Pilot pill). Freedom used only in layout, rhythm and restraint:
- **One memorable moment: §2.** Large `RankGrid` replay (sample, 12 weeks) on the white sheet, with a dated move log beside it. Nothing else on the page gets a showpiece.
- **Quiet everywhere else.** No new cards-in-a-row kits: §3, §4 and §5 are plain columns divided by hairlines (`border-line`); §7 is a two-row contrast grid. Grey panel (`bg-muted-surface`) only for the §4 example-economics strip.
- **Labels carry information or go.** New sections have no eyebrow (`SectionHeading` renders none anyway). Numbers only where the content is a sequence (How it works; dates in the §2 log).
- **No new motion.** New sections don't use `Reveal`; the only motion stays user-triggered (replay, tabs, Friday).
- **Two ink bands only:** hero (top) and close (§11). Background rhythm: hero ink → §2 surface → §3 canvas → §4 surface → §5 canvas → §6 tour (existing) → §7 surface → §8 existing → §9 canvas → §10 surface → §11 ink.
- Line length ≤ 75ch for body copy (`max-w-2xl`); everything left-aligned except the close band (centred, as today).

```
§2  ┌──────────────── RankGrid (week slider, play) ───────────┐ ┌ H2 ─────────────┐
    │                                                          │ │ body            │
    │                                                          │ │ Oct 7  Meta ads │
    └──────────────────────────────────────────────────────────┘ │ Oct 9  $69 [web]│
                                                                 │ Oct 13 top 3    │
§7          Before                          After               └─────────────────┘
    Client  "I think Quillstone's…"         "Quillstone moved into…"
    Agency  A monthly report about…         A weekly brief about…
```

## 3. Interfaces
All copy lives in `apps/site/content/home.ts` (copy-review module mode). `live` = `WEBSITE_MONITORING_LIVE`.
- `HERO`: `headline`, `sub` / `subNoWeb`, `primaryCta`, `secondaryCta`, `primaryStart: 'agency-sample'` (other keys unchanged).
- `HOME_ANCHORS = ['rival-story', 'ceiling', 'opportunity', 'cast', 'client-view', 'recommendations', 'friday', 'before-after', 'checks', 'sample', 'live', 'how-it-works', 'commercial', 'join'] as const`.
- `SECTIONS` gains `rival-story`, `ceiling`, `opportunity`, `cast`, `before-after`, `commercial`, `close` (`HomeSection`); `SectionId` updated. `checks` gains `homeHeading` (the diagram's "No evidence, no claim" title stays on `heading`).
- `RIVAL_STORY: { bodyNoWeb: string; logHeading: string }` + `rivalStoryMoves(live: boolean)` → `CLIENT_VIEW.alerts` sorted by date ascending, dropping alerts whose evidence is a website capture when `!live`.
- `CEILING_LINES: { lead: string; body: string }[]` (3), `OPPORTUNITY: { outcomes: { lead: string; body: string }[]; example: { clients: 20; clientPriceUsd: 199 }; exampleNote: string; link: { label; href: '/partners' } }`, `opportunityExample()` = `partnerExample(20, 199)` (from `content/partners.ts`).
- `CAST: { name: 'Monday' | 'Friday' | 'Rival Monday'; body: string }[]` (3).
- `BEFORE_AFTER: { columns: ['Before', 'After']; rows: { who: string; before: string; after: string }[] }` (2).
- `COMMERCIAL: { points: { heading: string; body: string }[]; roadmapLine: { text: string; link: { label; href: '/roadmap' } } }`; the plan line reuses `PRICING_LINES` / `PRICING_LINES_TRIAL` `.agency`.
- `CLOSE: { heading; body; button }` + `CLOSE_TRIAL` (pilot off).
- Components (new, `src/components/home/`): `rival-story.tsx` (`'use client'`, `RankGrid` + `EvidencePanel` over `SAMPLE`), `agency-ceiling.tsx`, `opportunity.tsx`, `cast.tsx` (`FridayAvatar` for Friday only), `before-after.tsx`, `commercial.tsx` (`MarginExample` reused), `close-band.tsx` (`InkBand id="join"`, `REAL_SAMPLE_PREVIEW` card, `FounderNote` after the band).
- Opt-out props (default = today's behaviour): `Steps({ industries = true })`, `RecommendationsSection({ roadmap = true })`, `ChecksHub({ heading })`.
- `JoinButton start="agency-sample"` for the hero, mobile bar and close.
- Deleted: `pricing-teaser.tsx` (+ its tests), `real-sample.tsx` (folded into `close-band.tsx`), home `GuideArticles` use.

## 4. Decided copy (owner-approved; verbatim)
**Hero.** H1: Your competitors are making moves. Are you watching? · sub (live): Your clients' rivals are climbing the map, collecting reviews, launching ads and changing prices. Rival Monday watches every move and turns it into a weekly brief, dashboard and AI assistant, with evidence behind every claim. You sell it under your own brand, at your own price. · subNoWeb: same without "and changing prices" ("…collecting reviews and launching ads."). · primary: Get a free brief for one of your clients · secondary: See what your clients get

**§2 rival-story.** H2: While your client was busy running the business, a rival took the map. · body (live): Twelve weeks ago, Quillstone Climate Pros was in the top three at 8 of 49 points across Northwind's service area. Now it's 31. In the same weeks it started two Meta ads, and Kestrel Mechanical cut its AC repair diagnostic to $69. Every move was public. Nobody told Northwind. · bodyNoWeb: same without ", and Kestrel Mechanical cut its AC repair diagnostic to $69". · logHeading: What happened, week by week · caption: Sample data from a fictional business. · closing line: Your client won't catch this on their own. A monthly rankings report won't either.

**§3 ceiling.** H2: You've already won the client. Why is the retainer the only thing you sell them? · lines: (1) Your report looks like everyone else's. — Rankings, traffic, a few charts. Your clients' other agencies send the same thing. (2) The retainer gets questioned every month. — "What did we get for it?" is a hard question when the work is invisible. (3) The research clients value most doesn't pay for itself. — Watching every rival by hand takes hours you can't bill, and another analyst means another salary. · closing line: You've done the hard part: you've won the clients and earned their trust. Here's what to build on it.

**§4 opportunity.** H2: Your clients have competitors. You have a new service to sell. · body: Offer a weekly competitor intelligence service under your agency's name. Rival Monday does the watching, the research and the first draft. Your team can edit or approve each brief before it goes out, and your agency gets the credit. · outcomes: A new recurring line item. — Your price, on your invoice, billed through your own Stripe account. / A reason to talk to every client, every week. — News about their market, not just another report on their own numbers. / Upsell conversations with evidence attached. — "Your top rival just started running Meta ads" opens a conversation about your Meta ads service. · example (figures computed): For example: {clients} clients at ${price}/mo is ${revenue} revenue against ${cost} in platform cost, a margin of ${margin} a month. · exampleNote: An example, not a forecast. Before your team's time; your prices are up to you. · link: Work out your numbers

**§5 cast.** H2: Two colleagues your clients will look forward to. · Monday: The brief that lands every Monday morning: what each rival did, why it matters and what to do about it. · Friday: The colleague who has done the reading. Ask about any rival and get an answer with the sources attached. If the evidence isn't there, Friday says so. You can rename Friday. · Rival Monday: The engine behind both. Your clients see your name, not ours.

**§6** `SECTIONS['client-view']` heading → What your client opens on Monday morning. (body unchanged).

**§7 before-after.** H2: What changes when Monday arrives. · Your client — before: "I think Quillstone's been busier lately." · after: "Quillstone moved into the top three at 31 of 49 map points, started two Meta ads on October 7, and we have two moves open to answer it." · Your agency — before: A monthly report about your client's own numbers. · after: A weekly brief about their whole market, under your name, with next steps your team can sell.

**§8** `checks.homeHeading`: Your name is on every brief, so we check every sentence.

**§9** extra line under the steps: The first brief shows where your client stands today against every rival. From then on, every brief shows how far they've come.

**§10 commercial.** H2: Your brand. Your price. Your billing. · points: Your brand — Your name, logo and colours on every client page and email, plus your own sender name and assistant name. Logins on your own web address are on the roadmap. / Your price — You set what your clients pay. / Your billing — Clients pay you directly through your own Stripe account. We add no platform fee on what your clients pay you. · plan line: `PRICING_LINES.agency` (pilot) / `PRICING_LINES_TRIAL.agency` · roadmapLine: Coming next: act on a recommendation without leaving Rival Monday. · link: See the roadmap

**§11 close.** heading: Pick one client. We'll show you what their rivals are doing. · body: Tell us about one client. We'll build a starting-point brief from public information and email you a private link. Free during the pilot, a limited number each month. · button: Get a free brief for one of your clients · trial variant body: Tell us about one client and we'll build a starting-point brief from public information, then email you a private link.

Claims: every product statement above maps to ledger rows already used by the site (`cap-*`, `feat-*`, `int-stripe` with the Connect-fee-0 owner check). Example economics are labelled as an example and computed from `PRICING`.
