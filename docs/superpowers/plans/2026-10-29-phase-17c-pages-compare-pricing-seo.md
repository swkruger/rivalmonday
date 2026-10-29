# Phase 17c — integrations, sources, comparisons, pricing, partners and the full SEO pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/site` gains the remaining launch pages: an integrations strip on the home page, `/integrations` + `/integrations/<vendor>` (9 AI/platform services), `/sources` + `/sources/<source>` (what we collect, our own icons), `/compare` + `/compare/<rival>` (5 sourced, dated, individually switchable comparisons), `/pricing` and `/partners`. It also gets the full SEO pass: per-page metadata, static OG images, JSON-LD, `llms.txt` and a Core Web Vitals budget. Every product claim is checked against the code first, and data vendors are never named.

**Architecture:** same as 17b. Every page is prerendered from typed content modules in `apps/site/content/`. Collection pages are one dynamic segment each (`[vendor]`, `[source]`, `[rival]`) with `generateStaticParams` + `dynamicParams = false`, so an unknown or disabled slug is a static 404. The page registry `PAGES` (17b P1) becomes **derived**: it spreads one entry per integration, source and *enabled* rival, so nav, footer, sitemap, `llms.txt` and the compare hub all follow it. SEO helpers (`src/lib/json-ld.ts`, `src/lib/og.tsx`, breadcrumbs) are pure functions. Product claims carry `verifiedIn` repo paths, and a test checks that each path exists. The site still imports nothing from the workspace except `@cs/ui`.

**Tech Stack:** Next.js 16.3.8 (`next/og` `ImageResponse`, metadata file conventions), React 19.3, Tailwind 4, zod 4, `@fontsource/inter` 5.3.0 (woff for OG images only), lucide-react, Vitest + Testing Library, Playwright 1.63.0 (CDP throttling for the vitals check).

**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md`: § 2 row 17c, § 7.2 (`NEXT_PUBLIC_COMPARE_PAGES`), § 7.3–§ 7.8, § 9 owner to-dos. Rival facts come **only** from `docs/research/2026-10-28-phase-17-comparison-facts.md` (checked 2026-10-28). The 17b plan's Global Constraints and P1–P17 + amendments still hold except where P1/P13 below change them. Root `CLAUDE.md` § Decisions is binding.

## Global Constraints
- Before coding, read `docs/gotchas-cross-cutting.md`, `apps/site/CLAUDE.md` (boundary, env, the `cn()` site-class rule, prerender only), `docs/design-system/README.md` § checklist and `09-ai-implementation-playbook.md`, and `apps/site/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md` + `02-guides/json-ld.md` (Tasks 4–5).
- **The 17b boundary stands:** import only `@cs/ui` from the workspace. Read env only through `src/lib/env.ts`, using literal `NEXT_PUBLIC_*` reads. No secrets, no `'server-only'`. A content module may *name* a repo path as a string (`verifiedIn`) but never import it.
- **No invented facts.** Rival facts come from the research file, each with its source link. Rival Monday claims must be in the Task 1 ledger. Numbers come from `PRICING` or the ledger. Never use "only", "first", "nobody else", "#1", "best", "cheaper" or "doesn't have". A rival's `?` is shown as "Not stated publicly", never as ✗. No rival or vendor *logos* except the integration logos the owner has approved (P6). No Google/Meta logos. No partnership wording ("partner", "official", "certified", "endorsed") on integrations or sources pages.
- **Data vendors (DataForSEO, Apify, ScrapeCreators, Stadia) are never named** anywhere in site source, content, build output or rendered pages (P12).
- **Not client-facing, and no white-label overclaim:** claim only what has shipped (P15). 13a (custom domains, sending domains) is unbuilt: never claim it.
- DS v1 with marketing latitude (17b): tokens only, Inter, sections before cards, status = glyph + text, never colour alone. Orange only for Friday and the Pilot pill. Tables sit in a `Frame` with `overflow-x-auto` (the page itself never scrolls sideways at 390 px). `bash scripts/design-lint.sh` = 0. Hex colours only in `.ts` files (`og-theme.ts`).
- Copy marked **(owner signs)** is a draft used verbatim until signed; Task 16 collects it. Decided numbers come from `PRICING`.
- Tests: implementers run focused tests only (`pnpm --filter @cs/site exec vitest run <pattern>`). `pnpm test:affected`, `pnpm --filter @cs/site e2e` and `pnpm --filter @cs/web e2e:affected` run once, at the final review. Task 15 runs the site E2E because it writes it.
- Per task: write the tests first and watch them fail → implement → focused tests green → commit with explicit paths (`git commit -- <paths>`). Never amend. LF only; UTF-8 checked (`iconv -f utf-8 -t utf-8`). The message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents: own model). Never stage `.env`, `.claude/` or `.superpowers/`.

## Decisions
Spec (O)/(C) items stand. Plan-level calls for owner approval:
- **P1 Per-rival switch = `NEXT_PUBLIC_COMPARE_PAGES`, read at build.** This reinstates the spec § 7.2 variable that 17b amendment C12 dropped. `siteEnv.comparePages` = a comma list of slugs, lower-cased and trimmed, keeping only `[a-z0-9-]+`; unknown slugs are ignored. **Unset or empty = no named page (fail closed until counsel signs off).** A disabled slug is missing from `generateStaticParams` (so it 404s) and from `PAGES`, so it also drops out of nav, footer, sitemap, `llms.txt` and the hub. **The owner removes a page without a code change:** edit the variable in the Vercel project, then GitHub → Actions → latest `main` `ci` run → `deploy-site` → *Re-run this job*. The job pulls the new env, rebuilds and deploys. After 30 days a re-run isn't possible; then use the `vercel` CLI fallback in DEPLOY.md (Task 14). `/compare` (category table only) is always on.
- **P2 Derived registry.** `PAGES` = static entries + `collectionPage()` spreads over `listedIntegrations()`, `SOURCES` and `enabledRivals()` (each item supplies `slug/title/description/crumb` via its `seo` field or `comparePageEntry`). `pages.test` resolves `/x/<slug>` to `src/app/x/[param]/page.tsx`. Each page task registers its own routes **without `nav`**. Task 13 alone owns `nav` fields, `NAV_EXTRA` and footer columns (17b's shell test would break mid-plan otherwise).
- **P3 Claims ledger first.** Task 1 writes `docs/research/2026-10-29-phase-17c-claim-check.md`: each Rival Monday capability, integration use and source claim, with a code path, a status (shipped / gated / not built) and the wording allowed. Content modules carry `verifiedIn: string[]` repo-relative paths, and a test asserts each one exists.
- **P4 Sources follow the code** (spec § 7.4 contradicted, see Task 1): **social is dropped** (no social collector exists). **Job postings are added** (collected). One ads page covers the Meta Ad Library and the Google Ads Transparency Center (both collected). Slugs: `competitor-websites`, `google-reviews`, `google-business-profile`, `ads`, `local-map-rankings`, `job-postings`. The owner confirms in the sign-off.
- **P5 Comparison marks.** A rival cell is `yes | partial | text | unknown` and never `no`; `unknown` renders "Not stated publicly". A research ✗ that has a reason renders as text ("Monthly report", "Considering (roadmap)", "Quote only"). Rival Monday cells may say "No" (it's our own product: public API, social). Glyph + text, never colour alone.
- **P6 Logos.** Task 2 records each vendor's guideline URL, the permitted mark and a verdict (`logo-ok | text-only | drop | unchecked`) in `docs/research/2026-10-29-phase-17c-vendor-logos.md` and mirrors the verdict into `INTEGRATIONS[].brand`. A logo renders only when the verdict is `logo-ok` **and** `public/logos/<slug>.svg` exists (checked at build). The owner downloads the file from the vendor's press kit and approves it; implementers never fetch logo files. Otherwise the name shows as a plain Inter 600 text wordmark, with no lookalike styling. `drop` removes the vendor everywhere.
- **P7 JSON-LD:** `Organization` in the root layout (`sameAs` = the social links that are set); `SoftwareApplication` on `/` and `/pricing`, with list-price `offers` from `PRICING` and **no ratings or reviews**; `FAQPage` on `/pricing`; `BreadcrumbList` on every non-home page. One serializer escapes `< > & U+2028 U+2029`.
- **P8 OG images:** an `opengraph-image.tsx` per route segment, rendered statically at build by `renderOg()`. Text = eyebrow + registry title, in Inter 600 from `@fontsource/inter`'s woff, with brand colours from `og-theme.ts`. No rival or vendor marks. `/privacy` and `/terms` inherit the root image.
- **P9 Pricing FAQ is pilot-neutral**, so `FAQPage` matches the visible text in both pilot states. Only the plan cards switch copy (pattern: `PricingTeaser`).
- **P10 Partner example:** `PARTNER_EXAMPLE = { clients: 10, clientPriceUsd: 199 }` (owner signs the $199, labelled "example price — you set your own"). `partnerExample()` computes cost/revenue/margin from `PRICING`, "before Stripe processing fees and taxes".
- **P11 Freshness gate:** `check:facts` fails when an enabled rival's `factsCheckedOn` is more than 90 days old (the research note says re-check quarterly) or a fact has no source. It is wired into `deploy-site`. The 7-days-after-first-publish re-check is an owner step.
- **P12 Vendor-name scans (three layers):** a source/content vitest; `check:bundle` over the prerendered `.next/server/app/**/*.{html,rsc,body,meta}` (not JS chunks, which may carry unused library strings); E2E over every sitemap URL's rendered text.
- **P13 Nav** (spec § 7.3 order): How it works · Integrations · Compare · Pricing (`/pricing`, replacing `/#pricing`) · Partners, then Sign in and Join. Sample brief moves to the footer (the hero CTA stays). This changes 17b P1's nav list.
- **P14 Vitals budget in the site E2E** (phone project): Chromium CDP throttling (150 ms RTT, 1.6 Mbps down, 4× CPU) against `next start`. LCP ≤ 2.5 s and CLS ≤ 0.1 on `/`, `/pricing` and `/compare`. This is a lab approximation, not field data; Vercel Speed Insights stays off (no new script).
- **P15 White-label wording = shipped only:** agency name, logo, colours, email sender name and sign-off, a renamable assistant, and no Rival Monday name on client pages (the `white-label-leak` test). "Your own web address" is not claimed (13a).
- **P16 Trust lines:** compare pages say "Information as of {date}, from public vendor pages" and carry "{Rival} is a trademark of its owner; Rival Monday is not affiliated with {Rival}." plus a corrections contact (`support@rivalmonday.app`). Sources pages say "Google and Meta are trademarks of their owners. Rival Monday is not affiliated with or endorsed by them." **(owner signs)**

## File structure
- **Content (new):** `apps/site/content/{integrations,sources,compare,pricing-page,partners}.ts` + tests beside them.
- **Routes (new):** `apps/site/src/app/{integrations,sources,compare}/{page.tsx,opengraph-image.tsx}`, `…/{[vendor],[source],[rival]}/{page.tsx,opengraph-image.tsx}`, `src/app/{pricing,partners}/{page.tsx,opengraph-image.tsx}`, `src/app/{opengraph-image.tsx,how-it-works/opengraph-image.tsx,sample-brief/opengraph-image.tsx}`, `src/app/llms.txt/route.ts`.
- **Lib/components (new):** `src/lib/{json-ld.ts,og.tsx,og-theme.ts,breadcrumbs.ts}` (+ tests), `src/components/seo/{json-ld.tsx,page-intro.tsx}`, `src/components/{integrations,sources,compare,pricing,partners}/*`, `src/lib/llms.ts`, `src/no-data-vendors.test.ts`, `scripts/check-compare-facts.ts` (+ test), `e2e/{pages.spec.ts,vitals.spec.ts,helpers.ts}`.
- **Modified:** `apps/site/{package.json,playwright.config.ts,CLAUDE.md}`, `content/{pages.ts,pages.test.ts,home.ts}`, `src/lib/{env.ts,env.test.ts,metadata.ts,metadata.test.ts}`, `src/app/{layout.tsx,page.tsx,sitemap.test.ts}`, `src/components/shell/{site-footer.tsx,shell.test.tsx}`, `scripts/check-bundle.ts`, `e2e/site.spec.ts`, `.github/workflows/ci.yml`, `docs/DEPLOY.md`, `pnpm-lock.yaml`.
- **Docs:** `docs/research/2026-10-29-phase-17c-{claim-check,vendor-logos}.md`, `docs/archive/phase-17c-copy-signoff.md`, `docs/work/phase-17.md`.

## Dependencies on in-flight work
None outside this branch: 17a and 17b are done on `phase-17` (17b final fix wave `5859cba8`). 13a (white-label, unbuilt) owns `packages/ui` theme/shell files and `auth-card`; this plan edits nothing in `packages/ui`, `apps/web` or `packages/*` (the claims ledger only reads them). Task 0 re-checks `git branch --no-merged main`.

## Review Focus
1. **No invented or unfair rival claims:** every fact has a research source id, there's no ✗ for rivals, dates are shown, no superlatives, and the hub only links enabled pages → T9 `compare facts…`, T10 `disabled slug 404s`, T15 `compare toggle`.
2. **Rival Monday claims match the code:** ledger rows exist for every capability cell, feature row, FAQ answer and source; every `verifiedIn` path exists; no social/13a claims → T1 ledger, T6/T8 `verifiedIn paths exist` + `ledger rows exist`, T9 `our cells point at a ledger row`, T11 `feature rows point at ledger rows`.
3. **Data vendors never named, no Google/Meta marks, no partnership wording** → T6 `no partnership wording`, T8 `no img elements on source pages`, T13 `no-data-vendors` + `check:bundle`, T15 `rendered pages never name a data vendor`.
4. **SEO correctness:** effective title ≤ 60, description ≤ 155, canonical for every registered page including all would-be rival pages; JSON-LD is valid and escaped; sitemap/llms list only enabled pages → T3 `dynamic paths resolve…`, T9 `would-be page titles ≤ 60…`, T4 `serializer escapes…`, T13 `llms…`, T15 `structured data`.
5. **Pricing honesty:** every figure comes from `PRICING`, the partner maths is labelled as an example, the FAQ is pilot-neutral, the pilot-off variants work, nothing overflows at 390 px → T11 `pricing…`, T12 `partnerExample…`, T15 overflow + pilot off.

---

### Task 0: Pre-flight
**Goal:** confirm the base and the assumptions.
- [ ] `git fetch`; rebase `phase-17` on `main` if `main` moved; `git branch --no-merged main` (expect `phase-17`). If another branch touches `apps/site`, `ci.yml`, `turbo.json` or `design-lint.sh`, conflict-scan it and note the result.
- [ ] Confirm the 17b final review is closed (work file Status) and `pnpm --filter @cs/site build` is green on the head.
- [ ] Pin `@fontsource/inter` (`npm view @fontsource/inter time`): 5.3.0 is ≥ 2 weeks old, and `files/inter-latin-600-normal.woff` exists in the tarball.
- **Done when:** notes appended to `docs/work/phase-17.md` § Status; nothing else committed.

### Task 1: Claims ledger — Rival Monday column, integrations, sources (verification checklist)
**Goal:** one checked list of what Rival Monday may claim, so that the content tasks only transcribe it.
**Files:** create `docs/research/2026-10-29-phase-17c-claim-check.md` (≤ 10 KB).

**Behaviour** — one Markdown table row per claim: `id · claim · code path(s) · status (shipped | gated: <flag> | not built) · allowed wording`. The ids are binding (content tests grep for them): `cap-<CapabilityKey>` (the Task 9 keys), `int-<slug>`, `src-<slug>`, `feat-<slug>` (pricing feature rows), `faq-<topic>` (`white-label`, `data`, `mcp`, `cancel`). Read the code; don't run it:
- [ ] **Capabilities** (research § 2 rows): website changes (`packages/collectors/src/capture/`, `schedule/due-pages.ts`; gated by `WEB_MONITORING_ENABLED`, see `apps/worker/src/env.ts`); reviews (`reviews/`); ads, **Meta and Google** (`ads/meta.ts`, `ads/google.ts`, `sources/kinds.ts`); GBP changes (`gbp/`); rankings, weekly geo-grid (`rankings/scan.ts`, worker `rank-schedule` `0 6 * * 0`); **social: not built**; weekly brief (`packages/engine/src/briefs/`); claims → evidence (citation pills, `/files`); Friday (`packages/ask`, plan feature `ask`); MCP (`packages/mcp`, plan feature `mcp`); **public API: none**; white-label = `@cs/email` `resolveBranding` fields + `apps/web/src/app/white-label-leak.test.tsx` (custom domains: not built, 13a); reseller = Stripe Connect Standard (`packages/billing/src/connect-*.ts`); trial = 30 days with `TRIAL_ACTIVE_CLIENTS = 1` until a card is added (`packages/billing/src/access.ts`); public pricing.
- [ ] **Jobs** (`packages/collectors/src/jobs/`) as a source; the cadence of each source (`due.ts`, `due-pages.ts` daily/weekly).
- [ ] **Integrations:** OpenRouter (`packages/ai/config/ai.yaml`: briefs, Friday, embeddings, Jev decisions); Anthropic (Claude models through OpenRouter + the direct Message Batches API, `packages/ai/src/anthropic-batch.ts`; not "all AI is Claude"); Neon (Postgres + RLS, `packages/db`); Vercel (web/API/MCP/cron + this site); Railway (`apps/worker/railway.json`); Cloudflare R2 (`packages/storage/src/r2.ts`) + Turnstile (`apps/web/src/app/api/waitlist/route.ts`, `sign-up/actions.ts`, `start/actions.ts`); Postmark (`apps/web/src/server/email-transport.ts`, bounce webhook); Stripe (Billing + Connect, fee = `connect_application_fee_percent`, default 0 — **record the current pilot value as an owner check**); Sentry (web, worker, site; `redactForLog`).
- [ ] **Pricing/FAQ facts:** whether `standard` plan versions include `ask` + `mcp`; what a client-role user gets (Friday? MCP?); how cancelling works (`cancel_at_period_end`, billing portal); the client-facing surfaces still showing rivalmonday.app (URL host, email domain).
- [ ] Add a closing section, "Research § 2 RM column corrections": ads = Meta + Google; social = no; white-label = partial (no own domain); public API = no; trial = 30 d, 1 active client until a card is added; website changes = shipped but gated in prod.
- **Done when:** every row has a path that exists (`ls` each); commit (`git commit -- docs/research/2026-10-29-phase-17c-claim-check.md`).

### Task 2: Vendor brand-guideline ledger
**Goal:** a written record of what each integration vendor permits, before any logo appears.
**Files:** create `docs/research/2026-10-29-phase-17c-vendor-logos.md`.

**Behaviour:**
- [ ] One Markdown table with a first column `slug` (the Task 6 slugs), a `verdict` column and an `approved` column (`no` for now); Task 6 parses it. For OpenRouter, Anthropic, Neon, Vercel, Railway, Cloudflare, Postmark, Stripe and Sentry, record in one row each: brand/press page URL (WebFetch if available, else "owner to check"), date checked, permitted mark (wordmark / symbol / badge such as "Powered by Stripe"), conditions (unmodified, clear space, colour, no implied endorsement), the press-kit file to download, the target path `apps/site/public/logos/<slug>.svg`, and a verdict `logo-ok | text-only | drop | unchecked`. Use `drop` only if the guidelines forbid naming or showing the vendor for this purpose. Use `text-only` if logo use needs permission we don't have.
- [ ] **Do not download logo files.** Add an owner section: download each `logo-ok` file from the official kit, save it at the path, flip `approved` in the table, and commit.
- **Done when:** 9 rows filled; commit (`git commit -- docs/research/2026-10-29-phase-17c-vendor-logos.md`).

### Task 3: Compare switch env + derived registry + breadcrumbs
**Goal:** the plumbing every new page needs: the env switch, collection entries in `PAGES`, the dynamic-route test and the breadcrumb trail.
**Files:** modify `apps/site/src/lib/{env.ts,env.test.ts,metadata.ts,metadata.test.ts}`, `apps/site/content/{pages.ts,pages.test.ts}`; create `apps/site/src/lib/{breadcrumbs.ts,breadcrumbs.test.ts}`.

**Interfaces:**
```ts
// env.ts — RawSiteEnv gains comparePages?: string; SiteEnv gains:
comparePages: readonly string[]; // parseCompareList(process.env.NEXT_PUBLIC_COMPARE_PAGES) — literal read
export function parseCompareList(raw: string | undefined): string[]; // split ',', trim, lower, keep /^[a-z0-9-]+$/, dedupe
// pages.ts
export interface SitePage { …17b fields; crumb?: string; group?: 'integrations' | 'sources' | 'compare' }
export function collectionPage(base: '/integrations' | '/sources' | '/compare', item: { slug: string; title: string; description: string; crumb: string }): SitePage; // path base/slug, group = base without '/', sitemap true, monthly, 0.6
// breadcrumbs.ts
export interface Crumb { name: string; path: SitePage['path'] }
export function breadcrumbTrail(path: SitePage['path'], pages?: readonly SitePage[]): Crumb[]; // Home + each registered ancestor + self; name = crumb ?? nav?.label ?? title
// metadata.ts — pageMetadata adds twitter: { card: 'summary_large_image' }; signature unchanged
```
**Behaviour:** `pages.ts` keeps the 17b static entries. Tasks 7/8/10/11/12 append theirs, and the collection spreads come from their content modules. `pages.test` "every page path has a page.tsx": if `src/app/<path>/page.tsx` is missing, accept `src/app/<parent>/[<param>]/page.tsx`. The test also asserts that no `PAGES` entry has `nav` except the 17b ones (Task 13 relaxes this). `siteEnv` is evaluated at import time, so tests that switch rivals use `vi.stubEnv('NEXT_PUBLIC_COMPARE_PAGES', …)` + `vi.resetModules()` + a dynamic `import()`, and `vi.unstubAllEnvs()` afterwards (Tasks 9/10/13 use the same pattern). **Follow pattern:** `parseSiteEnv` helpers; `effectiveTitle`.

**Tests (TDD):** `env.test.ts`: `compare list unset is empty`, `compare list trims, lower-cases, drops junk and duplicates`; `pages.test.ts`: `dynamic paths resolve to a [param] page`; `breadcrumbs.test.ts`: `home has a single crumb`, `collection item trail is Home › Collection › Item`, `unregistered ancestor is skipped`; `metadata.test.ts`: `twitter card is summary_large_image`.
**Done when:** `pnpm --filter @cs/site exec vitest run env pages breadcrumbs metadata`; commit (`git commit -- <the task's Files>`).

### Task 4: SEO library — JSON-LD, page intro, Organization
**Goal:** the shared structured-data helpers, the page intro with breadcrumbs, and the site-wide `Organization`.
**Files:** create `apps/site/src/lib/{json-ld.ts,json-ld.test.ts}`, `apps/site/src/components/seo/{json-ld.tsx,page-intro.tsx,seo.test.tsx}`; modify `apps/site/src/app/layout.tsx`, `apps/site/src/app/page.tsx`.

**Full code — `src/lib/json-ld.ts`** (inline-script safety):
```ts
import { SITE_NAME, SITE_URL, TITLE_STEM } from '../../content/site';
import { PRICING } from '../../content/pricing';
import type { Crumb } from './breadcrumbs';

type Ld = Record<string, unknown>;
/** Safe inside <script type="application/ld+json">: no tag break-out, no JS line terminators. */
export function serializeJsonLd(data: Ld | Ld[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function organizationLd(sameAs: readonly string[]): Ld {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL, ...(sameAs.length ? { sameAs: [...sameAs] } : {}) };
}
const monthly = (name: string, usd: number, description: string): Ld => ({
  '@type': 'Offer', name, price: usd.toFixed(2), priceCurrency: 'USD', description,
  priceSpecification: { '@type': 'UnitPriceSpecification', price: usd, priceCurrency: 'USD', billingDuration: 'P1M', unitText: 'MONTH' },
});
export function softwareApplicationLd(): Ld {
  const a = PRICING.agency;
  return {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: SITE_NAME, url: SITE_URL,
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: TITLE_STEM,
    offers: [
      monthly('Agency', a.monthlyUsd, `Includes ${a.seatsIncluded} client seats; $${a.extraSeatUsd} per extra seat; ${a.trialDays}-day trial.`),
      monthly('Local business', PRICING.business.monthlyUsd, 'One business, served by our agency.'),
    ],
  }; // never aggregateRating/review: we have none (no invented facts)
}
export function faqPageLd(faqs: readonly { q: string; a: string }[]): Ld {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}
export function breadcrumbLd(trail: readonly Crumb[]): Ld {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE_URL + c.path })) };
}
```
**Behaviour:** `<JsonLd data>` renders `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />` (the only `dangerouslySetInnerHTML` in the site). `<PageIntro path eyebrow h1 lead?>` (server component) renders a visible breadcrumb from `breadcrumbTrail(path)` (`nav aria-label="Breadcrumb"`, plain anchors, `aria-current="page"` on the last), the `BreadcrumbList` JSON-LD, the eyebrow, the h1 and the lead. Every new page uses it (**Follow pattern:** the `/how-it-works` intro markup). The layout adds `<JsonLd data={organizationLd(Object.values(siteEnv.social).filter((v): v is string => !!v))} />`; the home page adds `<JsonLd data={softwareApplicationLd()} />`. The CSP needs no change (`script-src` already allows inline; JSON-LD isn't executed).

**Tests (TDD):** `json-ld.test.ts`: `serializer escapes script break-out and line separators` (input `'</script><b>&\u2028'`: the output has no raw `<`, `>`, `&` or U+2028, and `JSON.parse` returns the input), `organization sameAs only when links set`, `offers come from PRICING`, `no rating or review keys` (deep key walk), `breadcrumb items are absolute`; `seo.test.tsx`: `page intro renders one h1, breadcrumb and ld script`.
**Done when:** `pnpm --filter @cs/site exec vitest run json-ld seo`; `pnpm --filter @cs/site build`; commit (`git commit -- <the task's Files>`).

### Task 5: OG images — renderer and the 17b pages
**Goal:** static `next/og` images, with the shared renderer every page task reuses.
**Files:** create `apps/site/src/lib/{og.tsx,og-theme.ts,og.test.ts}`, `apps/site/src/app/{opengraph-image.tsx,how-it-works/opengraph-image.tsx,sample-brief/opengraph-image.tsx}`; modify `apps/site/package.json`, `pnpm-lock.yaml` (`pnpm --filter @cs/site add @fontsource/inter@5.3.0`).

**Full code — `src/lib/og.tsx`** (`og-theme.ts` exports `OG = { canvas: '#F6F9FC', ink: '#0B2540', rival: '#2A6BAC', monday: '#F5A524', primary: '#47A8E7' }` from root `CLAUDE.md` § Brand):
```tsx
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { OG } from './og-theme';
export const OG_SIZE = { width: 1200, height: 630 } as const;
const font = readFile(join(process.cwd(), 'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff')); // once per build
export async function renderOg({ eyebrow, title }: { eyebrow: string; title: string }): Promise<ImageResponse> {
  return new ImageResponse(
    (<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: OG.canvas, color: OG.ink, fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', fontSize: 40 }}><span style={{ color: OG.rival }}>rival</span><span style={{ color: OG.monday }}>monday</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 28, color: OG.rival }}>{eyebrow}</div>
        <div style={{ fontSize: title.length > 40 ? 60 : 72, lineHeight: 1.1, letterSpacing: -1.5 }}>{title}</div>
      </div>
      <div style={{ display: 'flex', height: 8, width: 160, background: OG.primary, borderRadius: 4 }} />
    </div>),
    { ...OG_SIZE, fonts: [{ name: 'Inter', data: await font, weight: 600, style: 'normal' }] },
  );
}
```
Each `opengraph-image.tsx` exports `alt`, `size = OG_SIZE` and `contentType = 'image/png'`, and its default export is `() => renderOg({ eyebrow, title: effectiveTitle(page) })`, with the page read from `PAGES`. **In a dynamic segment** (`[vendor]`, `[source]`, `[rival]`; Tasks 7/8/10), the image file also exports the page's `generateStaticParams` and `dynamicParams = false`, takes `{ params }`, and uses an `alt` of "Rival Monday" + the section name. The root image covers `/`, `/privacy` and `/terms`.

**Behaviour:** hex values live only in `og-theme.ts` (design-lint scans `.tsx` only). Read the font from `node_modules` relative to `process.cwd()` (= `apps/site` in `next build`; never `new URL(…, import.meta.url)`, because of Turbopack). The image stays well under the 500 KB `ImageResponse` limit.

**Tests (TDD):** `og.test.ts` (node): `renderOg returns an image/png response with a body`. If `next/og` won't load under Vitest, drop this test, rely on Task 15 `og images`, and say so in the commit.
**Done when:** `pnpm --filter @cs/site exec vitest run og`; `pnpm --filter @cs/site build` (`/opengraph-image` shows as prerendered in the build output); `bash scripts/design-lint.sh` = 0; commit (`git commit -- <the task's Files>`).

### Task 6: Integrations content
**Goal:** one typed, verified module for the 9 services.
**Files:** create `apps/site/content/{integrations.ts,integrations.test.ts}`.

**Interfaces:**
```ts
export type BrandVerdict = 'logo-ok' | 'text-only' | 'drop' | 'unchecked';
export interface Integration {
  slug: 'openrouter' | 'anthropic' | 'neon' | 'vercel' | 'railway' | 'cloudflare' | 'postmark' | 'stripe' | 'sentry';
  name: string; role: 'AI' | 'Database' | 'Hosting' | 'Storage & security' | 'Email' | 'Billing' | 'Monitoring';
  oneLine: string; whatItIs: string; howWeUseIt: string[]; forYourAgency: string[];
  vendorUrl: `https://${string}`; brand: { guidelineUrl: string | null; verdict: BrandVerdict };
  verifiedIn: string[]; // repo-relative paths from the Task 1 ledger (row int-<slug>)
  seo: { title: string; description: string; crumb: string }; // feeds collectionPage() (Task 7)
}
export const INTEGRATIONS: readonly Integration[];
export const listedIntegrations: () => Integration[]; // verdict !== 'drop'
export const INTEGRATIONS_PAGE: { eyebrow: string; h1: string; lead: string; disclaimer: string }; // strip copy lives in home.ts SECTIONS.integrations (Task 7)
```
**Behaviour:** the copy is drafted from the Task 1 ledger, ≤ 3 bullets per list **(owner signs)**. Examples: Stripe → "Your clients pay you directly through your own Stripe account (Stripe Connect). We add no platform fee." (only while Task 1 confirms fee 0); Cloudflare → "R2 stores every snapshot behind a claim; Turnstile keeps bots off public forms."; Anthropic → "Claude models write the briefs and answer Friday (through OpenRouter); background topic work uses Anthropic's batch API." `brand` mirrors Task 2. The lead says **(owner signs)**: "The services Rival Monday runs on, and what each one does for your agency." `disclaimer`: "Listing a service doesn't mean it endorses Rival Monday. Names are trademarks of their owners."

**Tests (TDD):** `verifiedIn paths exist` (resolve from the repo root `join(__dirname, '../..', '..')`, `existsSync`); `ledger rows exist` (each `int-<slug>` id appears in the Task 1 doc); `brand verdicts match the ledger doc` (parse the Task 2 table: `slug` column → `verdict` column); `no data vendor names`; `no partnership wording` (`/partner|official|certified|endorsed|approved by/i` across every string except `disclaimer`); `no digits outside an allowlist`; `nine slugs, unique`; `effective titles ≤ 60, descriptions ≤ 155`.
**Done when:** `pnpm --filter @cs/site exec vitest run integrations`; commit (`git commit -- <the task's Files>`).

### Task 7: Integrations pages + home strip
**Goal:** `/integrations`, `/integrations/<vendor>` and a strip on the home page.
**Files:** create `apps/site/src/app/integrations/{page.tsx,opengraph-image.tsx}`, `apps/site/src/app/integrations/[vendor]/{page.tsx,opengraph-image.tsx}`, `apps/site/src/components/integrations/{vendor-mark.tsx,integrations-strip.tsx,integrations.test.tsx}`; modify `apps/site/content/pages.ts` (`/integrations` + `...listedIntegrations().map((i) => collectionPage('/integrations', { slug: i.slug, ...i.seo }))`), `apps/site/content/home.ts` (`HOME_ANCHORS` gains `'integrations'` after `'friday'`; `SECTIONS.integrations` = eyebrow "Integrations", heading "The services Rival Monday runs on", body "Hosting, AI, email and billing from established providers. Your clients' data stays in our database and evidence store." **(owner signs)**; no digits), `apps/site/src/app/page.tsx` (strip after `FridayRow`).

**Interfaces:** `VendorMark({ integration, size: 'strip' | 'page' })` is a server component. It shows `<img src="/logos/<slug>.svg" alt="<name>">` only when `brand.verdict === 'logo-ok'` and `existsSync(join(process.cwd(), 'public/logos', slug + '.svg'))`; otherwise the name in a plain `font-semibold text-ink` span. `[vendor]/page.tsx`: `generateStaticParams = () => listedIntegrations().map(i => ({ vendor: i.slug }))`, `dynamicParams = false`, `generateMetadata` → `pageMetadata('/integrations/' + slug)`. Titles look like "Stripe at Rival Monday" (effective title ≤ 60).

**Behaviour:** the hub is a `HairlineGrid` of linked marks with the one-line text; no cards (these aren't independent objects). Each vendor page has `PageIntro`, sections "What it is", "How Rival Monday uses it" and "What it means for your agency", a plain-text link to `vendorUrl` (`rel="noopener"`), and links to the other integrations. The strip is a `HomeSectionShell id="integrations"` with the marks and "See all integrations →". No orange, no shadows. **Follow pattern:** `home/steps.tsx`, `how-it-works/page.tsx`.

**Tests (TDD):** `integrations.test.tsx`: `text wordmark when no approved logo`, `logo only when verdict logo-ok and file exists` (mock `existsSync`), `dropped vendor has no page params and no strip entry`; `sections.test.tsx` "section ids match HOME_ANCHORS" stays green (re-run it).
**Done when:** `pnpm --filter @cs/site exec vitest run integrations sections pages`; `pnpm --filter @cs/site build && pnpm --filter @cs/site check:bundle`; design-lint 0; commit (`git commit -- <the task's Files>`).

### Task 8: Sources content + pages
**Goal:** `/sources` and `/sources/<source>`: what we collect from public information, with our own icons.
**Files:** create `apps/site/content/{sources.ts,sources.test.ts}`, `apps/site/src/app/sources/{page.tsx,opengraph-image.tsx}`, `apps/site/src/app/sources/[source]/{page.tsx,opengraph-image.tsx}`, `apps/site/src/components/sources/{source-icon.tsx,sources.test.tsx}`; modify `apps/site/content/pages.ts`.

**Interfaces:**
```ts
export interface Source { slug: 'competitor-websites' | 'google-reviews' | 'google-business-profile' | 'ads' | 'local-map-rankings' | 'job-postings';
  name: string; icon: 'globe' | 'star' | 'map-pin' | 'megaphone' | 'grid' | 'briefcase'; oneLine: string;
  whatWeCollect: string[]; howOften: string; whatWeDont: string[]; inTheBrief: string; verifiedIn: string[];
  seo: { title: string; description: string; crumb: string } } // pages.ts: `/sources` + SOURCES.map((s) => collectionPage('/sources', { slug: s.slug, ...s.seo }))
export const SOURCES: readonly Source[];
export const SOURCES_PAGE: { eyebrow: string; h1: string; lead: string; trademarkNote: string };
```
**Behaviour:** the copy comes from the Task 1 ledger **(owner signs)**; `howOften` uses the code's cadences. `competitor-websites` states the crawler rules: identifies itself, respects robots.txt, at least 3 s between requests to a site. `ads` names "Meta Ad Library" and "Google Ads Transparency Center" as text only. `whatWeDont`: no logins, no private data, no personal reviewer details (pseudonymised). `SourceIcon` maps to lucide `Globe`, `Star`, `MapPin`, `Megaphone`, `Grid3x3` and `Briefcase` with `aria-hidden`. Every page shows `trademarkNote` (P16). The hub is a sectioned list. **Follow pattern:** Task 7 pages.

**Tests (TDD):** `sources.test.ts`: `verifiedIn paths exist`, `ledger rows exist` (`src-<slug>`), `six slugs and no social`, `effective titles ≤ 60, descriptions ≤ 155`, `no partnership wording outside trademarkNote`, `no data vendor names`; `sources.test.tsx`: `no img elements on source pages` (icons are inline SVG only, so no Google/Meta logos), `trademark note on hub and item pages`.
**Done when:** `pnpm --filter @cs/site exec vitest run sources pages`; build + `check:bundle`; design-lint 0; commit (`git commit -- <the task's Files>`).

### Task 9: Compare facts module
**Goal:** every comparison fact in one typed module, transcribed from the research file and gated by tests.
**Files:** create `apps/site/content/{compare.ts,compare.test.ts}`.

**Interfaces:**
```ts
export type CapabilityKey = 'websites' | 'reviews' | 'ads' | 'gbp' | 'rankings' | 'social' | 'weeklyBrief' | 'evidenceLinks' | 'assistant' | 'mcp' | 'api' | 'whiteLabel' | 'reseller' | 'publicPricing' | 'trial';
export type RivalCell = { mark: 'yes' | 'partial' | 'text' | 'unknown'; label?: string; source?: string };
export type OurCell = { mark: 'yes' | 'partial' | 'no'; label?: string; ledger: string }; // ledger = Task 1 row id
export interface FactSource { id: string; url: `https://${string}`; checkedOn: '2026-10-28' }
export interface Rival { slug: 'rivalmappd' | 'brightlocal' | 'local-falcon' | 'birdeye' | 'visualping'; name: string;
  kind: string; factsCheckedOn: string; summary: string; facts: { text: string; source: string }[];
  pricing: { text: string; source: string }[]; betterAt: string[]; weDiffer: { text: string; key: CapabilityKey }[]; cells: Record<CapabilityKey, RivalCell> }
export const CAPABILITIES: readonly { key: CapabilityKey; label: string }[];
export const FACT_SOURCES: readonly FactSource[]; // the research "Sources" list, ids as there (rmp, bl-price, …)
export const RIVAL_MONDAY: Record<CapabilityKey, OurCell>; // from the Task 1 ledger (ads: Meta + Google; social: no; api: no; whiteLabel: partial)
export const RIVALS: readonly Rival[];
export const CATEGORY_TABLE: { columns: string[]; rows: { label: string; cells: string[] }[] }; // RM | DIY spreadsheets | Local-SEO toolkits | Reputation suites — descriptive text, "typically …" (owner signs)
export function enabledRivals(list?: readonly string[]): Rival[]; // default siteEnv.comparePages; order of RIVALS
export const comparePageEntry: (r: Rival) => { slug: string; title: string; description: string; crumb: string }; // title `Rival Monday vs ${name}`
export const COMPARE_COPY: { asOf: (date: string) => string; trademark: (name: string) => string; corrections: string };
```
**Behaviour:** `facts` = that rival's research § 1 bullets (paraphrase as little as possible). `pricing` gives the exact amount and its basis (monthly/annual, per location). `betterAt` and `weDiffer` = research § 3. `cells` = research § 2 column, mapped by P5 (`✗ (monthly)` → text "Monthly report"; `✗ (considering)` → text "Considering (roadmap)"; `✗` for pricing → text "Quote only"). Use the "As of 28 Oct 2026, X's public pages don't list Y" form wherever absence matters. `weDiffer` may cite only `RIVAL_MONDAY` rows that are `yes`. Dates render `en-US`, UTC ("Oct 28, 2026").

**Tests (TDD):** `compare facts cite a known source` (every fact/pricing/cell `source` ∈ `FACT_SOURCES`); `no rival cell is no`; `unknown cells carry no source and no label`; `every rival has betterAt`; `our cells point at a ledger row` (each `cap-<key>` id appears in the Task 1 doc); `weDiffer uses only yes capabilities` (`RIVAL_MONDAY[item.key].mark === 'yes'`); `no superlatives or absence claims` (`/\b(only|first|nobody else|#1|best|cheaper|doesn't have|does not have|lacks)\b/i`); `would-be page titles ≤ 60 and descriptions ≤ 155` (all five, through `effectiveTitle`); `enabledRivals filters and keeps order`; `no data vendor names`.
**Done when:** `pnpm --filter @cs/site exec vitest run compare`; commit (`git commit -- <the task's Files>`).

### Task 10: Compare pages, switch and freshness gate
**Goal:** `/compare` plus switchable `/compare/<rival>` pages and `check:facts`.
**Files:** create `apps/site/src/app/compare/{page.tsx,opengraph-image.tsx}`, `apps/site/src/app/compare/[rival]/{page.tsx,opengraph-image.tsx}`, `apps/site/src/components/compare/{capability-table.tsx,fact-list.tsx,compare.test.tsx}`, `apps/site/scripts/{check-compare-facts.ts,check-compare-facts.test.ts}`; modify `apps/site/content/pages.ts` (`/compare` + `...enabledRivals().map((r) => collectionPage('/compare', comparePageEntry(r)))`), `apps/site/package.json` (`check:facts`: `tsx scripts/check-compare-facts.ts`).

**Interfaces:** `[rival]/page.tsx` and its `opengraph-image.tsx` both export `generateStaticParams = () => enabledRivals().map(r => ({ rival: r.slug }))` and `dynamicParams = false`. `findStaleFacts(rivals: readonly Rival[], today: Date, maxAgeDays = 90): string[]`; the script runs it on `enabledRivals()` and exits 1 on any hit.

**Behaviour:**
- Hub: `PageIntro`; `CATEGORY_TABLE` in a `Frame` (`<table>`, 40 px rows, hairlines, `<th scope>`); "Named comparisons" lists only enabled rivals (the section is hidden when none are on); `COMPARE_COPY.corrections`.
- Rival page: `PageIntro` (h1 "Rival Monday vs {name}"); "Facts checked {date}" right under it; summary; `CapabilityTable` with two columns (Rival Monday | {name}), glyph + text per cell (`Check`/"Yes", `CircleDot`/"Partly", label text, "Not stated publicly" muted), and each rival cell's source as a superscript link; "Where {name} is better"; "Where Rival Monday is different"; pricing with sources; the fact list with source links (`rel="noopener nofollow"`); then `COMPARE_COPY.asOf`, `trademark(name)` and corrections. The rival name is plain text only.
- **Follow pattern:** `@cs/ui` `Table`/`Frame`; Task 7 page shells.

**Tests (TDD):** `compare.test.tsx`: `disabled slug is absent from params and PAGES` (env stub pattern from Task 3), `hub lists only enabled rivals and hides the list when none`, `rival page shows facts checked date and trademark line`, `unknown renders Not stated publicly, never a cross`; `check-compare-facts.test.ts`: `fails an enabled rival older than 90 days`, `ignores disabled rivals`, `passes fresh facts`.
**Done when:** `pnpm --filter @cs/site exec vitest run compare check-compare-facts pages`; `NEXT_PUBLIC_COMPARE_PAGES=brightlocal pnpm --filter @cs/site build` (only `/compare/brightlocal` prerendered); `check:bundle`; `NEXT_PUBLIC_COMPARE_PAGES=rivalmappd,brightlocal,local-falcon,birdeye,visualping pnpm --filter @cs/site check:facts` (all five, so the gate really runs); design-lint 0; commit (`git commit -- <the task's Files>`).

### Task 11: Pricing page
**Goal:** `/pricing` with plan cards, a feature table and a FAQ; numbers come from `PRICING`.
**Files:** create `apps/site/content/{pricing-page.ts,pricing-page.test.ts}`, `apps/site/src/app/pricing/{page.tsx,opengraph-image.tsx}`, `apps/site/src/components/pricing/{plan-cards.tsx,feature-table.tsx,faq.tsx,pricing.test.tsx}`; modify `apps/site/content/pages.ts` (register `/pricing`, no `nav`).

**Interfaces:**
```ts
export const PLAN_CARDS: { pilot: { agency: PlanCopy; business: PlanCopy }; trial: { agency: PlanCopy; business: PlanCopy } };
type PlanCopy = { name: string; price: string; note: string; points: string[]; cta: 'join' | 'trial' | 'business' };
export const FEATURE_ROWS: readonly { label: string; agency: boolean | string; business: boolean | string; ledger: string }[];
export const PRICING_FAQ: readonly { q: string; a: string }[]; // pilot-neutral (P9)
```
**Behaviour:**
- The cards are independent objects, so `Card` is allowed. Agency pilot card **(owner signs)**: "Free during the pilot", then "${monthlyUsd}/mo including {seatsIncluded} client seats · ${extraSeatUsd} per extra seat · {trialDays}-day trial". Business: "Free during the pilot", then "${business.monthlyUsd}/mo". The pilot-off agency card says "{trialDays}-day free trial (one active client until you add a card), then …". Every figure is interpolated from `PRICING`. The CTA is a `JoinButton` (agency → default start, business → `start="business"`). Client component with `usePilot()` (**Follow pattern:** `home/pricing-teaser.tsx`).
- `FEATURE_ROWS` contains only `yes` rows from the Task 1 ledger (weekly brief, alerts, dashboard, evidence links, Friday, MCP, your branding, competitor discovery, weekly map rankings, client billing in your name; business column per the ledger).
- FAQ (owner signs; answers ≤ 70 words): "Is it really white-label?" (P15 wording; "your own web address for client logins is on the roadmap"), "Where does the data come from?" (public information only; link `/sources`), "What is MCP?" (it lets AI tools that support MCP, such as Claude, read your clients' competitor data with your permission; included per ledger), "How do I cancel?" (per ledger). It renders as `<details>` and emits `faqPageLd(PRICING_FAQ)` + `softwareApplicationLd()`.

**Tests (TDD):** `pricing-page.test.ts`: `every figure comes from PRICING` (walk every string, strip the rendered `PRICING` values as 17b's `content.test.ts` does, then `/\d/` must not match), `faq has the four topics and is pilot-neutral` (no "pilot" in answers), `feature rows point at ledger rows` (`feat-<slug>` ids in the Task 1 doc), `faq rows point at ledger rows` (`faq-<topic>`); `pricing.test.tsx`: `pilot cards say free during the pilot`, `pilot off shows trial cards and the business waitlist`, `faq ld matches visible questions`.
**Done when:** `pnpm --filter @cs/site exec vitest run pricing pages`; build + `check:bundle`; design-lint 0; commit (`git commit -- <the task's Files>`).

### Task 12: Partners page
**Goal:** `/partners`: the standard reseller offer and a worked example.
**Files:** create `apps/site/content/{partners.ts,partners.test.ts}`, `apps/site/src/app/partners/{page.tsx,opengraph-image.tsx}`, `apps/site/src/components/partners/{margin-example.tsx,partners.test.tsx}`; modify `apps/site/content/pages.ts`.

**Full code — the example maths** (`content/partners.ts`):
```ts
import { PRICING } from './pricing';
export const PARTNER_EXAMPLE = { clients: 10, clientPriceUsd: 199 } as const; // OWNER SIGNS: example price only
export interface PartnerExample { clients: number; clientPriceUsd: number; extraSeats: number; costUsd: number; revenueUsd: number; marginUsd: number }
export function partnerExample(clients: number, clientPriceUsd: number, a = PRICING.agency): PartnerExample {
  if (!Number.isInteger(clients) || clients < 1) throw new Error('clients must be a positive integer');
  const extraSeats = Math.max(0, clients - a.seatsIncluded);
  const costUsd = a.monthlyUsd + extraSeats * a.extraSeatUsd;
  const revenueUsd = clients * clientPriceUsd;
  return { clients, clientPriceUsd, extraSeats, costUsd, revenueUsd, marginUsd: revenueUsd - costUsd };
}
```
**Behaviour:** `PageIntro` (eyebrow "Partners", h1 **(owner signs)** "Resell Rival Monday as your own"). Three sections: "Your brand" (P15 wording), "Your prices" (you set and change your client prices), "Your billing" (clients pay you through your own Stripe account via Stripe Connect; we add no platform fee — per the Task 1 ledger). The worked example is a small table: clients, your example price, your monthly cost "${monthlyUsd} + {extraSeats} × ${extraSeatUsd}", revenue, margin. It is captioned "Example: {clients} clients at an example price of ${clientPriceUsd}/mo. You set your own prices. Before Stripe processing fees and taxes." Pilot note: "Free during the pilot" when `usePilot().pilotMode`. CTA: `JoinButton`. **No affiliate or commission terms.**

**Tests (TDD):** `partners.test.ts`: `partnerExample 10 × 199 = cost 922, revenue 1990, margin 1068`, `no extra seats at or below the included seats`, `rejects zero clients`, `no affiliate or commission wording` (`/affiliate|commission|referral fee/i`); `partners.test.tsx`: `caption labels the price as an example and names fees`, `figures render from partnerExample`.
**Done when:** `pnpm --filter @cs/site exec vitest run partners pages`; build; design-lint 0; commit (`git commit -- <the task's Files>`).

### Task 13: Nav, footer, llms.txt and vendor-name scans
**Goal:** the shell picks up the new pages; `llms.txt`; the source and build scans of P12.
**Files:** modify `apps/site/content/pages.ts` (`nav` per P13; `NAV_EXTRA` → `[]`), `apps/site/content/pages.test.ts` (drop the Task 3 nav assertion), `apps/site/src/components/shell/{site-footer.tsx,shell.test.tsx}`, `apps/site/src/app/sitemap.test.ts`, `apps/site/scripts/check-bundle.ts`; create `apps/site/src/app/llms.txt/{route.ts,llms.test.ts}`, `apps/site/src/lib/llms.ts`, `apps/site/src/no-data-vendors.test.ts`.

**Interfaces:** `buildLlmsTxt(pages: readonly SitePage[]): string`. `route.ts`: `dynamic = 'force-static'`, `GET` → `new Response(buildLlmsTxt(PAGES), { headers: { 'content-type': 'text/plain; charset=utf-8' } })`.

**Behaviour:**
- Nav orders: How it works 10, Integrations 20, Compare 30, Pricing 40, Partners 50. `/sample-brief` loses `nav`.
- Footer columns: Product (How it works, Sample brief, Pricing, Integrations, Sources), Compare (Compare overview + one link per enabled rival), Company (Partners), Legal (Privacy, Terms), each filtered by the registry (keep 17b's filter).
- `llms.txt`: `# Rival Monday`, `> {TITLE_STEM}. {home description}`, a short paragraph **(owner signs)**, then `## Pages` with `- [{title}]({SITE_URL}{path}): {description}` for every `sitemap` page: first the pages without a `group`, then `## Integrations`, `## Sources` and `## Compare`, using the `group` field from Task 3.
- `no-data-vendors.test.ts`: walks the text files (`.ts`, `.tsx`, `.json`, `.md`, `.css`, `.svg`, `.txt`; binaries skipped) under `apps/site/{content,src,public,scripts}`, skipping `*.test.*` and `scripts/check-bundle.ts`, for `/dataforseo|apify|scrapecreators|stadia/i`. 17b's `content.test.ts` anchor test already passes with an empty `NAV_EXTRA` (no change).
- `check-bundle.ts` also scans `.next/server/app/**/*.{html,rsc,body,meta}` for the same pattern and fails on a hit (P12; JS chunks are not scanned for names).

**Tests (TDD):** `shell.test.tsx` "nav shows only registered pages" becomes `nav follows the spec order` (How it works, Integrations, Compare, Pricing, Partners) and `footer compare column lists only enabled rivals`; `llms.test.ts`: `lists every sitemap page once`, `omits disabled rivals`, `no data vendor names`; `sitemap.test.ts`: `includes collection pages and only enabled rivals`; `no-data-vendors.test.ts`.
**Done when:** `pnpm --filter @cs/site exec vitest run shell llms sitemap pages content no-data-vendors`; build + `check:bundle`; commit (`git commit -- <the task's Files>`).

### Task 14: CI gate, DEPLOY.md, package notes
**Goal:** facts are re-checked before every deploy; the owner knows how to switch pages.
**Files:** modify `.github/workflows/ci.yml` (`deploy-site`: `pnpm --filter @cs/site check:facts` after `check:placeholders`; job `site` `env` gains `NEXT_PUBLIC_COMPARE_PAGES: rivalmappd,brightlocal,local-falcon,birdeye`, because CI builds before E2E with `E2E_SKIP_BUILD=1` and this value must equal Task 15's `SERVER_ENV`), `docs/DEPLOY.md` § Marketing site, `apps/site/CLAUDE.md`.

**Behaviour:**
- DEPLOY.md (≤ +1 KB): step 3 env gains `NEXT_PUBLIC_COMPARE_PAGES` (unset = no named compare pages). New "Compare pages on/off": (1) change the variable in Vercel (Production); (2) GitHub → Actions → latest `main` `ci` run → `deploy-site` → *Re-run this job*; (3) fallback after 30 days: `vercel pull --environment=production && vercel build --prod && vercel deploy --prebuilt --prod` in `apps/site` with the site project linked. `deploy-site` refuses while an enabled page's facts are more than 90 days old.
- `apps/site/CLAUDE.md`: a registry note (collections are derived; nav/footer are owned by the registry), the compare switch, `verifiedIn` paths, no data vendor names (three scans), OG hex only in `og-theme.ts`.
- **Follow pattern:** the existing `check:placeholders` step.

**Tests:** config only; `npx --yes @action-validator/cli@0.6.0 .github/workflows/ci.yml` if available.
**Done when:** `NEXT_PUBLIC_COMPARE_PAGES=rivalmappd,brightlocal,local-falcon,birdeye,visualping pnpm --filter @cs/site check:facts` passes; commit (`git commit -- <the task's Files>`).

### Task 15: Site E2E — new pages, toggle, structured data, vitals
**Goal:** prove the new pages in a real browser.
**Files:** create `apps/site/e2e/{pages.spec.ts,vitals.spec.ts,helpers.ts}`; modify `apps/site/playwright.config.ts` (`SERVER_ENV.NEXT_PUBLIC_COMPARE_PAGES = 'rivalmappd,brightlocal,local-falcon,birdeye'`, the same value as ci.yml `site` env from Task 14; Visualping off on purpose), `apps/site/e2e/site.spec.ts` (move `mockApp` + `overflow` into `helpers.ts`, import them; no test changes).

**Tests (Playwright; app routes mocked as in 17b):**
- `no horizontal overflow on new pages` (both projects): `/integrations`, `/integrations/stripe`, `/sources`, `/sources/ads`, `/compare`, `/compare/brightlocal`, `/pricing`, `/partners`; plus `header fits at 1024` (`setViewportSize` 1024×768 on `/`).
- `no csp violations or console errors on new pages` (17b listener pattern).
- `compare toggle`: `/compare/visualping` is 404 with the site shell; `/compare/brightlocal` is 200 with "Facts checked"; the sitemap and `/llms.txt` lack `visualping`; neither the hub nor the footer links it.
- `structured data`: every `application/ld+json` parses; `/` has `Organization` + `SoftwareApplication`; `/pricing` has `FAQPage` whose questions equal the visible `<summary>` texts; `/compare/brightlocal` has `BreadcrumbList`.
- `og images`: each page has `meta[property="og:image"]` (absolute on `https://rivalmonday.com` via `metadataBase`); request its **pathname** on the local server → 200 `image/png`; canonical = `https://rivalmonday.com` + path.
- `rendered pages never name a data vendor`: fetch `/sitemap.xml`, visit each `<loc>`'s **pathname** on the local server (never the real domain), `/dataforseo|apify|scrapecreators|stadia/i` must not match `document.documentElement.outerHTML`.
- `pricing pilot off shows trial cards` (status mock `pilotMode:false` with counters).
- `vitals.spec.ts` (phone project only, `test.skip` otherwise): CDP `Network.emulateNetworkConditions` (latency 150, down 200000 B/s, up 93750 B/s) + `Emulation.setCPUThrottlingRate { rate: 4 }`; for `/`, `/pricing`, `/compare`: `goto` with `waitUntil:'load'`, then read buffered `largest-contentful-paint` (last entry) and the `layout-shift` sum (excluding `hadRecentInput`) after `document.fonts.ready` + 1 s; assert LCP ≤ 2500 and CLS ≤ 0.1, and print both values to the report.
**Done when:** `pnpm --filter @cs/site e2e` green (both projects); commit (`git commit -- <the task's Files>`).

### Task 16: Copy sign-off, work file, merge note
**Goal:** an owner-ready hand-over.
**Files:** create `docs/archive/phase-17c-copy-signoff.md`; modify `docs/work/phase-17.md`.

**Behaviour:**
- Sign-off file (mirror `docs/archive/phase-17b-copy-signoff.md`): every owner-signs string by surface (strip, integrations hub + 9 pages, sources hub + 6, compare hub table + 5 rival pages incl. trust lines, pricing cards (pilot/trial), feature rows, FAQ, partners incl. the $199 example, llms.txt paragraph, nav labels), with `[ ]` per row. "Decisions to confirm": P1 (default off), P4 (social dropped, jobs added), P6 verdicts, P10 price, P13 nav, P15 wording.
- Work file (**≤ 12 KB**, overwrite Status/Next; condense the 17a/17b owner steps to pointers if needed): Status "17c implemented"; Interfaces add the routes, `NEXT_PUBLIC_COMPARE_PAGES`, `check:facts` and the content modules. **17c owner verification:** (1) `pnpm --filter @cs/site dev`, then visit every new page at 1440/1024/390; (2) download the approved logos per the vendor-logo ledger and commit them; (3) confirm the Connect fee is 0 at `/platform/billing` (Stripe copy depends on it); (4) set `WEB_MONITORING_ENABLED=true` before claiming website monitoring publicly (DEPLOY step 4 of 7a); (5) **counsel review** of `/compare/*` with archived PDFs of every source URL (save outside the site, e.g. `docs/research/compare-sources-2026-10-28/`); then set `NEXT_PUBLIC_COMPARE_PAGES` and redeploy per DEPLOY.md; (6) **re-check every rival fact within 7 days of first publish**: update the research file + `compare.ts` `factsCheckedOn`, then quarterly (`check:facts` enforces 90 days); (7) sign `phase-17c-copy-signoff.md`; (8) run Google's Rich Results Test on `/pricing` after deploy.
- **Note for `/rm-merge`:** fold into ARCHITECTURE (site pages, derived registry, SEO helpers), STATE, DEPLOY (done), BACKLOG (favicon/apple-touch + `Organization.logo`; SRI CSP; affiliate program; update the white-label FAQ and RM compare cells when 13a ships; social collection if ever built; quarterly fact re-check). Compare pages ship **off**.
- **Done when:** `git ls-files --eol | grep crlf` prints nothing; `iconv -f utf-8 -t utf-8` is clean over `git diff --name-only main...HEAD`; `wc -c docs/work/phase-17.md` ≤ 12288; commit both docs.
