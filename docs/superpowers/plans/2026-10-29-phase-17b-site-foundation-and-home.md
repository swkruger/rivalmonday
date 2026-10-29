# Phase 17b — marketing site foundation, home page, sign-up popup and interactive sample brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a new statically generated `apps/site` (rivalmonday.com) ships the home page (hero, interactive sample brief, live counters, "How we check every claim", founder note slot, real-sample offer, how-it-works, Friday row, pricing teaser, footer CTA), the "Join the pilot" popup posting to 17a's `POST /api/waitlist`, `/sample-brief`, `/how-it-works`, `/privacy`, `/terms` and a 404, plus the metadata/sitemap/robots foundation, an import boundary, CSP, Vercel project and CI wiring. 17c pages (integrations, sources, compare, pricing, partners) and the full SEO pass are **not** in this plan.

**Architecture:** `apps/site` is a Next.js 16 App Router app with no server data: every page is prerendered, content lives in `apps/site/content/` (TS modules, committed JSON, Markdown for legal text), and the browser makes exactly two calls to rivalmonday.app (`GET /api/site-status`, `POST /api/waitlist`). It consumes `@cs/ui` (DS v1 tokens + primitives) through `transpilePackages` and nothing else from the workspace. The sample brief and the vertical list are **exported** from the database by CLIs in `@cs/demo` (renamed to fictional names, guard-checked) and committed as JSON, so the site build needs no credentials.

**Tech Stack:** Next.js 16.3.8, React 19.3, Tailwind 4 (`@cs/ui/styles.css`), zod 4, react-markdown 10.1.0, `@vercel/analytics`, `@sentry/nextjs` 11.4.0 (browser only), Vitest + Testing Library (jsdom), Playwright 1.63.0 (site-only config).

**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` § 2 (row 17b), § 3, § 4, § 5, § 7.1, § 7.2, § 7.3 (17b pages only), § 7.8; § 6.3 for the two routes. 17a contracts: `packages/tools/src/waitlist/public.ts` (`waitlistSubmitSchema`), `apps/web/src/app/api/waitlist/route.ts`, `packages/tools/src/waitlist/site-status.ts` (`SiteStatus`), `apps/web/src/server/site-origin.ts` (`siteJoinUrl` → `<site>/#join`). Root `CLAUDE.md` § Decisions binding.

## Global Constraints
- Read `docs/gotchas-cross-cutting.md`, `packages/ui/CLAUDE.md`, `apps/web/CLAUDE.md` (Next 16 gotchas apply to the site too), `packages/demo/CLAUDE.md` (Tasks 4–5) and `docs/design-system/README.md` § checklist before coding. Next 16 differs from training data: read `apps/web/node_modules/next/dist/docs/01-app/02-guides/{content-security-policy,static-exports,analytics}.md` before Tasks 1–2. Before changing `turbo.json`, read the installed turbo docs (`node -p "require.resolve('turbo/package.json')"` from the root, then its `docs/README.md` and the task/env pages) — `AGENTS.md`.
- **The site holds no secrets** and never imports `@cs/db`, `@cs/tools`, `@cs/worker`, `@cs/engine`, `@cs/ai`, `@cs/ask`, `@cs/billing`, `@cs/collectors`, `@cs/evals`, `@cs/mcp`, `@cs/storage`, `@cs/verticals`, `@cs/demo` or the `@cs/email` root (Task 1 gate). Only `NEXT_PUBLIC_*` env vars are read, plus `VERCEL_ENV`.
- **No invented facts:** every number, claim or name on the site comes from 17a's live counters, the exported sample JSON, `content/pricing.ts` (spec § 7.6 numbers) or owner-signed copy. No testimonials, customer logos, review stars, "nobody else" claims, Google/Meta logos or partnership wording. Data vendors (DataForSEO, Apify, ScrapeCreators, Stadia) are never named.
- **DS v1 with marketing latitude (spec § 7.8):** `@cs/ui` tokens and primitives; Inter only (400/500/600, 800 for the wordmark); faint grid lines and **one** soft blue wash per hero; floating product fragments may carry the site `shadow-float`; orange (`amber`) only for Friday and one highlight per screen; no hex/`rounded-[…]`/`text-[…px]`/shadow literals in components (site tokens in `apps/site/src/app/site.css`); `bash scripts/design-lint.sh` stays 0 (extended to `apps/site/src` in Task 1). 390 px wide with no horizontal overflow; `prefers-reduced-motion` disables every animation and the announcement-bar rotation.
- **Do not modify `@cs/ui`** (13a white-label, unbuilt, owns `theme.ts`, `app-shell`, `auth-card`); compose its primitives in `apps/site/src/components/`. Do not modify `apps/web` (17a is done); the site↔route contract test lives in `@cs/tools` (Task 7).
- Copy marked **(owner signs)** is decided or drafted copy: use it verbatim; Task 15 collects it. Placeholders the owner must replace carry the marker `OWNER-PLACEHOLDER` (Task 12 gate).
- Tests: implementers run focused tests only (`pnpm --filter @cs/site exec vitest run <pattern>`; demo/tools: `npx vitest run <pattern>` from the package dir if `exec` says not found). The site needs no database. `pnpm test:affected`, `pnpm --filter @cs/site e2e` run once at the final review; `@cs/web` E2E is not affected (no web file changes).
- Per task: `- [ ]` write the listed tests first and watch them fail → implement → focused tests green → commit. Commits: explicit paths (`git commit -- <paths>`), never amend, LF only, UTF-8 checked (`iconv -f utf-8 -t utf-8`); message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents: their own model). Never stage `.env`, `.claude/`, `.superpowers/`.

## Decisions
Spec (O)/(C) items stand. Plan-level calls for the owner's approval:
- **P1 Page registry gates nav and sitemap.** `content/pages.ts` lists the routes that exist; nav, footer and `sitemap.ts` render only registered entries. 17b nav: *How it works* (`/how-it-works`), *Sample brief* (`/sample-brief`), *Pricing* (`/#pricing`, the home teaser), *Sign in* (`<APP_URL>/sign-in`), *Join the pilot*. 17c registers Integrations, Compare, Pricing (`/pricing`) and Partners, which then appear in the spec § 7.3 order. No env flag.
- **P2 Vertical list = committed `apps/site/content/verticals.json`** (`{ id, name }[]`, reviewed + unmerged, `generic` excluded, name-sorted), exported by `pnpm --filter @cs/demo export:site-verticals` from whatever `SERVICE_DATABASE_URL` points at (run it from a prod-env shell for the live catalogue). "Other" sends `verticalOther`. No new public route; a stale list is harmless (17a's submit nulls unknown ids).
- **P3 Sample brief source and renaming.** The exporter reads `cs_demo` (Lone Star Cooling's latest approved brief, its tracked rivals, cited evidence text, reviews/ads behind cited items, 12 weekly rank scans of keyword 0) and renames with an explicit map **plus a deny-list guard that fails the export** if any demo business, place, ZIP, phone, street address, email, uuid or `.example` domain survives. Evidence ships as structured text (snapshot before/after blocks, review list, ad copy), never the demo images (names are baked into pixels). The rank grid ships without a map background (no real geography). `upsell_tag`, ids, place ids and reviewer hashes are dropped; reviewers become fictional initials.
- **P4 Friday canned answers** live in `content/sample-friday.ts` (owner signs), each citing sample evidence ids; a test fails if an answer contains a number that is not in its cited evidence or brief item ("Ask drops uncited figures").
- **P5 Hero fragments come from the sample JSON** (first three items, one snapshot, Friday answer 1) — never hand-typed facts; the mockup's "Polar Air" text was placeholder.
- **P6 Pilot mode is read client-side.** Pages prerender the pilot state (popup CTAs, Pilot pill, announcement bar). When `site-status` says `pilotMode: false`, agency CTAs become "Start your free trial" → `<APP_URL>/sign-up`, the pill and bar hide, and the popup's agency choice becomes that link; the business path stays the waitlist. A failed fetch keeps the pilot state (the waitlist accepts agencies either way).
- **P7 CSP without nonces.** Nonces force dynamic rendering and SRI is experimental, so static pages use `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`; everything else is strict (Task 2). Revisit SRI in the backlog.
- **P8 Turnstile = explicit rendering** inside the dialog (implicit rendering misses a widget mounted after the script loads), same widget as the app (17a P5). Without `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no widget renders and the body carries `turnstileToken: 'no-widget'` (accepted only by the app's fake verifier in DEV/TEST; production refuses → the "check" message).
- **P9 Import boundary** = a Vitest gate on the site's `package.json` and import specifiers, plus a post-build `check:bundle` that scans the `.next` output and traces for any file from a forbidden package. `@cs/ui` → `@cs/email/branding` → `import type … from '@cs/db'` is type-only (erased); `@cs/core` and `@cs/email` are transpiled but only `@cs/email/src/branding.ts` may appear in the bundle.
- **P10 Content formats:** TS modules + JSON; legal pages are Markdown (`content/legal/*.md`) rendered at build time with react-markdown. No MDX in 17b.
- **P11 Marketing tokens are site-local** (`apps/site/src/app/site.css`: display sizes, `shadow-float`, grid lines, hero wash); `@cs/ui/styles.css` is imported unchanged.
- **P12 Canonical origin** is the constant `https://rivalmonday.com`; `robots.ts` allows all only when `VERCEL_ENV === 'production'`, otherwise disallows all (previews never indexed).
- **P13 Placeholder gate:** the founder note renders only when `content/founder.ts` is non-null; privacy/terms ship with `OWNER-PLACEHOLDER` drafts, and `pnpm --filter @cs/site check:placeholders` (in the `deploy-site` job) fails while any remains, so production cannot go live with them.
- **P14 Site E2E** has its own Playwright config (port 3200, `next build && next start`, no DB; both app routes mocked with `page.route`), its own CI job `site`, and never touches `cs_test`.
- **P15 Deploy:** second Vercel project (root `apps/site`, iad1, auto-deploy off), CI job `deploy-site` after `deploy` behind the same `DEPLOY_ENABLED` gate; new secrets `VERCEL_SITE_PROJECT_ID`, `SENTRY_PROJECT_SITE`. Sentry is browser-only (`sendDefaultPii: false`, no request bodies).
- **P16 Business location** = two optional fields "Website" and "City or ZIP", at least one required (mirrors the schema refine); same for the agency's sample request.
- **P17 `source`** = `utm_source` if present, else the referrer's host, else the page path; trimmed to 200 chars. `/#join` (17a's `siteJoinUrl`) and `?join=business` open the popup on load.

## File structure
- **Site (new):** `apps/site/{package.json,next.config.ts,tsconfig.json,postcss.config.mjs,vitest.config.ts,vitest.setup.ts,playwright.config.ts,next-env.d.ts,instrumentation-client.ts,AGENTS.md,CLAUDE.md}`, `apps/site/scripts/{check-bundle.ts,check-placeholders.ts}`, `apps/site/content/{site.ts,pages.ts,home.ts,how-it-works.ts,pricing.ts,founder.ts,sample-friday.ts,sample-brief.json,verticals.json,legal/privacy.md,legal/terms.md}`, `apps/site/src/app/{layout.tsx,site.css,page.tsx,not-found.tsx,robots.ts,sitemap.ts,sample-brief/page.tsx,how-it-works/page.tsx,privacy/page.tsx,terms/page.tsx}`, `apps/site/src/components/{shell/*,join/*,sample/*,home/*,legal/*}`, `apps/site/src/lib/{env.ts,headers.ts,site-status.ts,waitlist-body.ts,waitlist-submit.ts,turnstile.ts,metadata.ts}`, `apps/site/src/sample/schema.ts`, `apps/site/e2e/site.spec.ts`, tests beside sources, `apps/site/src/import-boundary.test.ts`.
- **Demo exporters:** `packages/demo/src/site-export/{rename.ts,rename.test.ts,types.ts,sample-brief.ts,sample-brief.test.ts,verticals.ts}`, `packages/demo/src/cli/{export-sample-brief.ts,export-site-verticals.ts}`, `packages/demo/package.json` (scripts).
- **Contract:** `packages/tools/src/waitlist/site-contract.test.ts`.
- **Root/CI/docs:** `turbo.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `scripts/design-lint.sh`, `docs/DEPLOY.md` (§ Marketing site), `docs/archive/phase-17b-copy-signoff.md`, `docs/work/phase-17.md`.

## Dependencies on in-flight work
17a is implemented on this branch (final review pending): the site consumes `POST /api/waitlist` (Origin allowlist `SITE_ORIGIN`/`SITE_ORIGIN_EXTRA`, headers allowed: `content-type` only, 8 KB body cap, `200 {ok:true}` / `400 {ok:false,error:'invalid'|'check'}` / `403` for a bad origin) and `GET /api/site-status` (CORS `*`, `s-maxage=300`). If the 17a final review changes either contract, Task 7/8 follow it. 13a (white-label, unbuilt) owns `packages/ui/src/theme.ts`, `app-shell`, `auth-card`: this plan edits nothing in `packages/ui` or `apps/web`. `git branch --no-merged main` = `phase-17` only today; Task 0 re-checks.

## Review Focus
1. **Boundary + no secrets** — no forbidden workspace package reaches the site's source, package.json or build output; only `NEXT_PUBLIC_*`/`VERCEL_ENV` read → Task 1 `import-boundary…`, `check:bundle` in Task 1 Done-when, Task 14 CI step.
2. **Popup POST is exact and safe** — body matches `waitlistSubmitSchema` for every path (agency, agency + sample, business vertical/other), `credentials: 'omit'`, uniform done state, Turnstile token required when a key is set and reset after every attempt, no PII to Sentry/console → Task 7 `site-contract…`, Task 8 `submit…`, `turnstile…`.
3. **Sample data is fictional and honest** — renamer is single-pass and case-preserving, the guard fails on any surviving demo term/ZIP/phone/uuid/email, `upsell_tag` never exported, Friday figures all cited → Task 4 `guard…`, Task 5 `committed json passes the guard`, Task 9 `friday answers cite every figure`.
4. **Headers/CSP and indexing** — CSP + security headers on every route, previews `Disallow: /`, sitemap = registered pages only → Task 2 `headers…`, `robots…`, `sitemap…`; Task 13 `no csp violations`.
5. **Pilot switch + counters** — pilot off swaps agency CTAs to `/sign-up` but keeps the business waitlist; counters hide nulls and the whole band when nothing is shown; no layout overflow at 390 → Task 6 `pilot off…`, Task 11 `counters…`, Task 13 `no horizontal overflow`.

---

### Task 0: Pre-flight
**Goal:** confirm base and assumptions.
- [ ] `git fetch && git log --oneline -1 main`; rebase `phase-17` on `main` if it moved; `git branch --no-merged main` (expect `phase-17` only). If another branch touches `packages/ui`, `packages/demo`, `turbo.json`, `ci.yml` or `scripts/design-lint.sh`: conflict-scan, note it in the work file.
- [ ] Re-read the 17a contracts listed under Dependencies against the code (`waitlistSubmitSchema`, route CORS headers, `SiteStatus`, `CLIENT_COUNT_BANDS = ['1-5','6-15','16-50','50+']`, `siteJoinUrl`). Note any drift in `docs/work/phase-17.md`.
- [ ] `cs_demo` exists and is seeded (`pnpm demo:links` prints links; else `pnpm demo:reset`, which needs no paid calls). Check `apps/worker/.evidence-demo/` holds `text.txt` evidence.
- [ ] Resolve versions to pin: `npm view @vercel/analytics version` (pin exact; must be ≥ 2 weeks old).
- **Done when:** notes appended to the work file; nothing else committed.

### Task 1: `apps/site` scaffold, import boundary, design-lint scope
**Goal:** an empty-but-building static site in the workspace with the boundary gates.
**Files:** create `apps/site/{package.json,next.config.ts,tsconfig.json,postcss.config.mjs,vitest.config.ts,vitest.setup.ts,next-env.d.ts,AGENTS.md,CLAUDE.md}`, `apps/site/src/app/{layout.tsx,site.css,page.tsx}`, `apps/site/src/lib/env.ts`, `apps/site/src/import-boundary.test.ts`, `apps/site/scripts/check-bundle.ts`; modify `turbo.json`, `scripts/design-lint.sh`, `pnpm-lock.yaml`.

**Interfaces:**
- `package.json` name `@cs/site`, private, `type: module`; scripts `dev` (`next dev -p 3001`), `build`, `start`, `typecheck` (`tsc -p .`), `test` (`vitest run`), `lint` (`vitest run src/import-boundary.test.ts`), `check:bundle` (`tsx scripts/check-bundle.ts`), `check:placeholders` (Task 12), `e2e` (Task 13). Dependencies: `@cs/ui` (workspace), `next` 16.3.8, `react`/`react-dom` ^19.3.0, `zod` ^4.1.5, `react-markdown` 10.1.0, `lucide-react` ^1.52.0, `@vercel/analytics` (Task 0 pin), `@sentry/nextjs` 11.4.0. Dev: `@tailwindcss/postcss`/`tailwindcss` ^4.3.3, `@testing-library/react` ^16.3.3, `jsdom` ^30.1.2, `vitest` ^3.2.4, `tsx`, `typescript`, `@types/*`, `@playwright/test` 1.63.0.
- `next.config.ts`: `transpilePackages: ['@cs/ui', '@cs/core', '@cs/email']`, `poweredByHeader: false`, `reactStrictMode: true`, `headers()` from Task 2, `redirects()` empty. **No** `output: 'export'` (Vercel headers need the Next runtime; pages are still prerendered). No `.env` loading (the site reads only `NEXT_PUBLIC_*` set by Vercel/the shell).
- `src/lib/env.ts`: `export const siteEnv = { appUrl, turnstileSiteKey, social: { linkedin, x, youtube, facebook, instagram }, clientPriceUsd, isProduction }` built from literal `process.env.NEXT_PUBLIC_…` reads (Next inlines only literal access); `appUrl` defaults to `https://rivalmonday.app`, must parse as an `https:` URL (or `http://localhost…`) else the default; `clientPriceUsd` = positive integer or 99.
- `turbo.json`: add `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SOCIAL_LINKEDIN`, `…_X`, `…_YOUTUBE`, `…_FACEBOOK`, `…_INSTAGRAM`, `NEXT_PUBLIC_COMPARE_PAGES`, `NEXT_PUBLIC_CLIENT_PRICE_USD`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_ENV` to `globalPassThroughEnv` (`NEXT_PUBLIC_SENTRY_DSN` is already there); add task `"lint": {}` (read the turbo docs first).
- `layout.tsx`: `<html lang="en">` with `next/font/google` Inter (`400,500,600,800`, `display: 'swap'`, variable `--font-inter`), `globals` = `site.css`, which starts `@import "@cs/ui/styles.css"; @source "../../../../packages/ui/src";` then site tokens: `--text-display` (clamp 36→56 px), `--text-display-sub` (18–20 px), `--shadow-float` (one value), `.bg-grid-lines` (vertical 1px lines at 4 % ink, 120 px), `.hero-wash` (one radial primary/secondary gradient, `pointer-events:none`), `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation: none !important; transition: none !important; } }`. Body `bg-surface text-ink font-sans`; max width 1560 px container helper `.site-container` (16 px gutter on phones).

**Behaviour:**
- Boundary test (`import-boundary.test.ts`, node env): (1) `package.json` workspace deps (`workspace:*`) ⊆ `['@cs/ui']`; (2) every `.ts/.tsx/.mjs` under `apps/site/{src,content,scripts}` plus `next.config.ts`, `instrumentation-client.ts`: each import/require specifier starting `@cs/` is `@cs/ui` or `@cs/ui/styles.css`; (3) no source file reads `process.env.X` where `X` is not `NEXT_PUBLIC_*`, `VERCEL_ENV` or `NODE_ENV`; (4) no `'server-only'` imports (there is no server code).
- `check-bundle.ts` (run after `next build`): walk `apps/site/.next` (`static/**`, `server/**/*.js`, `**/*.nft.json`); fail (exit 1, list offenders) if any path or `//# sourceMappingURL`-free source text references `packages/(db|tools|worker|engine|ai|ask|billing|collectors|evals|mcp|storage|verticals|demo)/` or `packages/email/src/` other than `branding.ts`. From Task 2 on, also fail if `.next/prerender-manifest.json` lacks any route in `content/pages.ts` (static guarantee).
- `design-lint.sh`: add `SITE=apps/site/src` to the `shadow-card`, `radius-14-2xl-xl`, `font-extrabold` (wordmark excluded), `hex-literals-tsx`, `bg-amber` (allowlist only `apps/site/src/components/**/friday-*.tsx`, with a reason line), `shadow-sm-md-lg-xl`, `text-px-arbitrary` checks.
- `src/app/page.tsx` is a placeholder heading until Task 10. Add `apps/site/CLAUDE.md` (gotchas: boundary, no secrets, tokens site-local, prerender only) and `AGENTS.md` (copy `apps/web/AGENTS.md`'s Next block; `@AGENTS.md` first line of `CLAUDE.md`).
- **Follow pattern:** `apps/web/next.config.ts`, `apps/web/vitest.config.ts` (no `globalSetup`, `environment: 'jsdom'` default with `// @vitest-environment node` for node tests), `packages/ui/vitest.setup.ts` (RTL cleanup).

**Tests (TDD):** `import-boundary.test.ts`: `only @cs/ui as a workspace dependency`; `no forbidden @cs import in any site source` (plant-a-bad-import sanity: the matcher flags `import x from '@cs/db'` in a string fixture); `reads only public env`; `env.test.ts`: `appUrl falls back on a non-https value`, `clientPriceUsd defaults to 99`.
**Done when:** `pnpm install`; `pnpm --filter @cs/site exec vitest run`; `pnpm --filter @cs/site typecheck`; `pnpm --filter @cs/site build && pnpm --filter @cs/site check:bundle`; `bash scripts/design-lint.sh` = 0. Commit.

### Task 2: Security headers, metadata, robots, sitemap, page registry, 404
**Goal:** every response carries CSP + security headers; indexing foundation 17c extends.
**Files:** create `apps/site/src/lib/{headers.ts,headers.test.ts,metadata.ts,metadata.test.ts}`, `apps/site/content/{site.ts,pages.ts}`, `apps/site/src/app/{robots.ts,sitemap.ts,not-found.tsx}`, `apps/site/src/app/{robots,sitemap}.test.ts`; modify `apps/site/next.config.ts`, `apps/site/src/app/layout.tsx`.

**Interfaces:**
```ts
// content/site.ts
export const SITE_URL = 'https://rivalmonday.com';
export const SITE_NAME = 'Rival Monday';
export const TITLE_STEM = 'White-label competitor intelligence for agencies'; // spec § 3 eyebrow = SEO stem
// content/pages.ts
export interface SitePage { path: `/${string}`; title: string; description: string; nav?: { label: string; order: number }; sitemap: boolean; changeFrequency?: 'weekly' | 'monthly' | 'yearly'; priority?: number }
export const PAGES: readonly SitePage[]; // 17b: '/', '/sample-brief', '/how-it-works', '/privacy', '/terms'
export const NAV_EXTRA: readonly { label: string; href: string; order: number }[]; // 17b: { 'Pricing', '/#pricing' }
// lib/metadata.ts
export function pageMetadata(path: SitePage['path']): Metadata; // title (≤ 60 chars), description (≤ 155), alternates.canonical = SITE_URL + path, openGraph { url, siteName, type:'website' }
```
**Full code — `src/lib/headers.ts`** (security-sensitive):
```ts
/** Spec § 7.1 / P7. Static pages cannot carry nonces, so inline scripts are allowed; everything else is pinned. */
export function contentSecurityPolicy(appUrl: string, isDev: boolean): string {
  const app = new URL(appUrl).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${app} https://*.ingest.sentry.io https://*.ingest.us.sentry.io`,
    'frame-src https://challenges.cloudflare.com',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function securityHeaders(appUrl: string, isDev: boolean): { key: string; value: string }[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(appUrl, isDev) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
}
```
`next.config.ts`: `async headers() { return [{ source: '/:path*', headers: securityHeaders(siteEnv.appUrl, process.env.NODE_ENV === 'development') }]; }` (Vercel Analytics is same-origin `/_vercel/insights/*`, covered by `'self'`).

**Behaviour:**
- `robots.ts`: `VERCEL_ENV === 'production'` → `{ rules: [{ userAgent: '*', allow: '/' }], sitemap: SITE_URL + '/sitemap.xml', host: SITE_URL }`; otherwise `{ rules: [{ userAgent: '*', disallow: '/' }] }`. Both `export const dynamic = 'force-static'`.
- `sitemap.ts`: `PAGES.filter(p => p.sitemap)` → absolute URLs, `lastModified` = build time; `/privacy` and `/terms` included with priority 0.3.
- `layout.tsx` root `metadata`: `metadataBase: new URL(SITE_URL)`, `title: { default: 'Rival Monday — ' + TITLE_STEM, template: '%s · Rival Monday' }`, `robots` index only in production (same rule), `icons` from `docs/brand` favicon if present (copy into `apps/site/src/app/icon.svg`; else skip).
- `not-found.tsx`: site shell (after Task 6) with "Page not found" (owner signs), links Home + Sample brief; HTTP 404 (no `loading.tsx` anywhere — apps/web gotcha).
- A `pages.test.ts`: every `PAGES` path has a `src/app/**/page.tsx`; titles ≤ 60, descriptions ≤ 155; every `NAV_EXTRA` href is a registered path or `/#<id>` where `<id>` is in `HOME_ANCHORS` (exported by `content/home.ts`, Task 10 — until then `['pricing','join']`).
- **Follow pattern:** `apps/web/src/app/robots.ts`.

**Tests (TDD):** `headers.test.ts`: `csp allows only the app origin for connect`, `csp has frame-ancestors none and object-src none`, `no unsafe-eval in production`, `hsts and nosniff present`; `robots.test.ts`: `preview disallows all`, `production allows and points at the sitemap`; `sitemap.test.ts`: `lists only registered sitemap pages as absolute rivalmonday.com urls`; `metadata.test.ts`: `canonical is SITE_URL + path`, `title within 60`; `pages.test.ts` as above.
**Done when:** focused vitest green; `pnpm --filter @cs/site build` shows every route as prerendered (○); commit (`git commit -- <the task's Files>`).

### Task 3: Content modules and pricing numbers
**Goal:** one place for copy and numbers the pages read.
**Files:** create `apps/site/content/{home.ts,how-it-works.ts,pricing.ts,founder.ts}`, `apps/site/content/content.test.ts`.

**Interfaces:**
```ts
// content/pricing.ts — spec § 7.6; 17c's /pricing reuses it
export const PRICING = { agency: { pilot: 'free', monthlyUsd: 229, seatsIncluded: 3, extraSeatUsd: 99, trialDays: 30 }, business: { pilot: 'free', monthlyUsd: siteEnv.clientPriceUsd } } as const;
// content/founder.ts
export interface FounderNote { paragraph: string; name: string; role: string; photo: string | null /* /founder.jpg in public/ */; initials: string }
export const FOUNDER_NOTE: FounderNote | null = null; // OWNER-PLACEHOLDER: owner supplies (spec § 9); section hidden while null
```
`content/home.ts` exports `HERO`, `ANNOUNCEMENT`, `SECTIONS` (ids + eyebrow + heading + body per section), `HOME_ANCHORS = ['sample','live','how-it-works','checks','friday','real-sample','pricing','join'] as const`, `JOIN_COPY` (Task 7 strings), `COUNTER_LABELS`. Copy below; **hero is decided (spec § 3, verbatim)**, the rest is drafted — **owner signs**:

- `HERO.eyebrowPill` "Pilot" · `HERO.eyebrow` "White-label competitor intelligence for agencies" · `HERO.headline` "Every Monday, your clients learn what their competitors did last week, under your brand." (the phrase "under your brand." gets the secondary colour, as the mockup) · `HERO.sub` "Rival Monday watches your clients' local rivals — websites, Google reviews, ads and map rankings — and turns it into an evidence-backed weekly brief, a dashboard and an AI assistant you sell as your own." · CTAs "Join the pilot" / "See a sample brief" · fine print "Free during the pilot · No card needed · Limited places".
- `ANNOUNCEMENT.lead` "Pilot now open for agencies serving local businesses" · rotating examples `['HVAC', 'plumbing', 'dental', 'roofing', 'med spas', 'law firms', 'landscaping', 'auto repair']` rendered "— like {x}" · link "Join the pilot →". (Examples are kinds of business, not claims of customers.)
- Sections (eyebrow · heading · body):
  - `sample` · "Sample brief" · "Click any claim to see the evidence behind it." · "This is a full Monday brief for a fictional heating and air business. Every line links to the snapshot, reviews or ads it came from. Move the slider to see how the map rankings changed week by week, or ask Friday."
  - `live` · "This week on Rival Monday" · "Real numbers from the platform, updated every few minutes." · (counter labels) "rival sites watched" · "snapshots taken in the last 7 days" · "claims checked against evidence" · "claims dropped for lack of evidence".
  - `how-it-works` · "How it works" · "From client to Monday brief in four steps." · steps: 1 "Add a client" — "Enter the business and its service area. We find its Google listing." · 2 "We find the rivals" — "We search the area and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick." · 3 "We watch every week" — "Websites, Google reviews, ads and map rankings, checked on a schedule and saved as evidence." · 4 "Monday brief + alerts" — "Your client gets a short brief under your brand, with the evidence one click away. Big moves send an alert."
  - `checks` · "How we check every claim" · "No evidence, no claim." · "Every sentence in a brief starts from something we captured: a page snapshot, a review, an ad, a ranking. Before a brief goes out, a separate check compares each claim with its evidence. Anything it can't back up is dropped, not softened." · link "Read how we check claims →" (`/how-it-works`).
  - `friday` · "Friday, your clients' assistant" · "Ask about any rival. Every answer shows its sources." · "Friday answers from the same evidence as the brief, with the sources inline. It's included under your brand, in the dashboard and for AI tools that support MCP."
  - `real-sample` · "A real sample for your client" · "See one of your own clients before you commit." · "Tick "Send me a real sample brief" when you join. We build a starting-point brief for one of your clients from public information and email you a private link. Free during the pilot, a limited number each month."
  - `pricing` · "Pricing" · "Free during the pilot." · agency line "Agencies: then $229/mo including 3 client seats, $99 per extra seat, with a 30-day trial." · business line "Local businesses: then ${PRICING.business.monthlyUsd}/mo." · note "You set your own prices for your clients and bill them in your name."
  - footer CTA card: "Join the pilot" heading · "Places are limited while we work closely with each agency." · button "Join the pilot".
- `content/how-it-works.ts` (`/how-it-works`, owner signs): title "How we check every claim"; sections "1. We capture the evidence" (page snapshots stored with the date and URL; reviews and ads as they appeared; map rankings from a grid of points across the service area), "2. We write only from the evidence" (the model sees the captured changes, never the open web; each sentence names its source), "3. A second check reads every claim" (a separate verifier compares each sentence with its evidence; below the confidence bar it is dropped; uncertain cases go to a person), "4. You can always click through" (every claim in the brief, the dashboard and Friday links to its evidence), "What we don't do" (no guesses about private data, no claims without a source, no evading website rules: we identify our crawler and respect robots.txt). Each with one paragraph you draft from these bullets, ≤ 80 words, plain English.

**Behaviour:** no numbers in copy except those from `PRICING` (interpolated) and the decided pilot fine print; `content.test.ts` asserts `HERO` strings equal the spec § 3 text exactly, headlines ≤ 90 chars, and no banned words (`/nobody else|only platform|#1|best-in-class|guarantee/i`, `/DataForSEO|Apify|ScrapeCreators|Stadia/`).
**Tests (TDD):** `content.test.ts`: `hero matches the decided copy`, `prices come from PRICING`, `no banned claims or vendor names`, `founder note hidden while null` (export check).
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 4: Fictional renamer + guard (`@cs/demo`)
**Goal:** a pure, tested renamer that makes the demo world fictional and a guard that refuses leaks.
**Files:** create `packages/demo/src/site-export/{rename.ts,rename.test.ts,types.ts}`.

**Interfaces + full code (non-obvious algorithm):**
```ts
// rename.ts
export interface RenameSources { client: string; businesses: string[]; places: string[]; domains: string[] }
export interface Renamer { apply(text: string): string; terms: ReadonlyMap<string, string> }

/** Owner signs. Deliberately odd compounds so no reader mistakes them for a real business or town. */
export const FICTIONAL = {
  client: 'Northwind Heating & Air',
  businesses: ['Copperleaf Comfort Co', 'Bluejay Air Works', 'Kestrel Climate Pros', 'Summitpine Heating', 'Owlbrook Mechanical', 'Fernhollow HVAC',
    'Larkspur Air & Heat', 'Tidewell Comfort', 'Quillstone Heating', 'Marigold Air Co', 'Brightkettle Plumbing & Air', 'Juniperwell Services',
    'Hollowbrook Air', 'Saffronfield Heating', 'Cobaltcreek Comfort', 'Wrenhaven Mechanical', 'Amberglen Air', 'Ploverline HVAC', 'Mossgate Heating', 'Thistledown Air'],
  places: ['Larkhaven', 'Quillmore', 'Briarmoor', 'Wrenfield', 'Ambermere', 'Tidecrest', 'Fennwick', 'Owlsbury', 'Marlowe Bend', 'Cobble Ridge',
    'Juniper Flats', 'Saffron Hill', 'Ploverton', 'Mossdale', 'Kettle Lake', 'Thistle County', 'Harrowgate Springs', 'Fallowmere', 'Brindle Creek', 'Gorsefield'],
} as const;

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchCase = (found: string, repl: string) => (found === found.toLowerCase() ? repl.toLowerCase() : repl);

export function buildRenamer(src: RenameSources): Renamer {
  const terms = new Map<string, string>();
  const assign = (from: readonly string[], pool: readonly string[], kind: string) => {
    const uniq = [...new Set(from.map((s) => s.trim()).filter(Boolean))].sort();
    if (uniq.length > pool.length) throw new Error(`rename: ${uniq.length} ${kind} but only ${pool.length} fictional names`);
    uniq.forEach((s, i) => { if (!terms.has(s)) terms.set(s, pool[i]!); });
  };
  terms.set(src.client, FICTIONAL.client);
  assign(src.businesses.filter((b) => b !== src.client), FICTIONAL.businesses, 'businesses');
  assign(src.places, FICTIONAL.places, 'places');
  // Domains follow their business: "<slug(name)>.example" -> "<slug(fictional)>.example"; unknown domains get a numbered one.
  for (const d of new Set(src.domains)) {
    const owner = [...terms.keys()].find((k) => `${slug(k)}.example` === d || d.startsWith(`${slug(k)}.`));
    terms.set(d, owner ? `${slug(terms.get(owner)!)}.example` : `rival-${terms.size}.example`);
  }
  const fictional = new Set([...terms.values()].map((v) => v.toLowerCase()));
  for (const k of terms.keys()) if (fictional.has(k.toLowerCase())) throw new Error('rename: a fictional name collides with a source term');
  // ONE alternation, longest first, so "Lake Granbury Heating & Air" wins over "Granbury" and replacements are never re-scanned.
  const keys = [...terms.keys()].sort((a, b) => b.length - a.length);
  const lower = new Map(keys.map((k) => [k.toLowerCase(), terms.get(k)!]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return {
    terms,
    apply: (text) => text.replace(re, (m) => matchCase(m, lower.get(m.toLowerCase())!))
      .replace(/\(?\b\d{3}\)?[ .-]\d{3}-\d{4}\b/g, '(555) 010-0100')
      .replace(/(?<![$\d,.])\b\d{5}(?:-\d{4})?\b/g, '00000'), // ZIPs, not prices
  };
}

export interface GuardHit { path: string; reason: string }
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /\(?\b\d{3}\)?[ .-]\d{3}-\d{4}\b/;
const STREET = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:St|Rd|Ave|Hwy|Blvd|Dr|Ln|Way)\b/;
const STATE = /,\s?(?:TX|Texas)\b|\bTexas\b/;

/** Walks every string value; any hit fails the export. `deny` = every source term plus extra known-real words. */
export function guard(value: unknown, deny: readonly string[], allowDomains: ReadonlySet<string>, path = '$'): GuardHit[] {
  if (typeof value === 'string') {
    const hits: GuardHit[] = [];
    for (const d of deny) if (new RegExp(`(?<![\\p{L}\\p{N}])${esc(d)}(?![\\p{L}\\p{N}])`, 'iu').test(value)) hits.push({ path, reason: `term:${d}` });
    if (UUID.test(value)) hits.push({ path, reason: 'uuid' });
    if (EMAIL.test(value)) hits.push({ path, reason: 'email' });
    if (PHONE.test(value) && !value.includes('(555) 010-0100')) hits.push({ path, reason: 'phone' });
    if (STREET.test(value)) hits.push({ path, reason: 'street' });
    if (STATE.test(value)) hits.push({ path, reason: 'state' });
    for (const m of value.matchAll(/\b([a-z0-9-]+\.(?:example|com|net|org))\b/gi)) if (!allowDomains.has(m[1]!.toLowerCase())) hits.push({ path, reason: `domain:${m[1]}` });
    return hits;
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => guard(v, deny, allowDomains, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => guard(v, deny, allowDomains, `${path}.${k}`));
  return [];
}
```
`types.ts`: the `SampleBriefData` shape (binding; Task 9 mirrors it as zod):
```ts
export type RivalTier = 'top' | 'watch' | 'minor';
export interface SampleBriefData {
  version: 1; label: 'Sample data';
  business: { name: string; vertical: string; area: string };
  weekOf: string; // YYYY-MM-DD
  rivals: { id: string; name: string; tier: RivalTier }[];
  items: { id: string; rivalId: string | null; kind: 'website' | 'reviews' | 'ads' | 'rank' | 'listing'; headline: string; whatChanged: string; whyItMatters: string; recommendedAction: string; evidenceIds: string[] }[];
  evidence: Record<string, SampleEvidence>;
  rankGrid: { keyword: string; size: number; weeks: { weekOf: string; you: (number | null)[]; leaderRivalId: string | null }[] };
}
export type SampleEvidence =
  | { id: string; kind: 'snapshot'; rivalId: string; url: string; capturedAt: string; title: string; before: string[]; after: string[]; changed: number }
  | { id: string; kind: 'reviews'; rivalId: string; from: string; to: string; count: number; reviews: { author: string; rating: number; date: string; text: string }[] }
  | { id: string; kind: 'ad'; rivalId: string; platform: 'google' | 'meta'; firstSeen: string; headline: string; body: string }
  | { id: string; kind: 'rank'; keyword: string; weekOf: string; summary: string };
```
**Tests (TDD)** (`rename.test.ts`, no DB): `longest term wins` ("Lake Granbury Heating & Air" → one business name, not "<place> Heating & Air"); `lowercase keyword keeps lowercase` ("ac repair granbury" → "ac repair larkhaven"-style); `replacements are not re-scanned` (a fictional name containing no source term stays intact); `domain follows its business`; `phones and ZIPs replaced`; `throws when the pool is too small`; `throws on a collision`; `guard flags a surviving term, uuid, email, phone, street, state and unknown domain` (one fixture each, path reported); `guard passes clean fictional output`.
**Done when:** `cd packages/demo && npx vitest run src/site-export/rename.test.ts`; `pnpm --filter @cs/demo typecheck`; commit (`git commit -- <the task's Files>`).

### Task 5: Exporters — sample brief and verticals (committed JSON)
**Goal:** `pnpm --filter @cs/demo export:sample-brief` and `export:site-verticals` write the site's JSON; both files committed.
**Files:** create `packages/demo/src/site-export/{sample-brief.ts,sample-brief.test.ts,verticals.ts}`, `packages/demo/src/cli/{export-sample-brief.ts,export-site-verticals.ts}`, `apps/site/content/{sample-brief.json,verticals.json}`; modify `packages/demo/package.json`.

**Interfaces:**
```ts
export async function collectSampleBrief(db: Db, store: ObjectStore, clientName = 'Lone Star Cooling'): Promise<{ raw: SampleBriefData; sources: RenameSources }>;
export function finalizeSampleBrief(raw: SampleBriefData, sources: RenameSources): SampleBriefData; // rename every string, re-key ids, then guard; throws listing GuardHit[]
export async function exportSiteVerticals(db: Db): Promise<{ id: string; name: string }[]>; // status 'reviewed', merged_into IS NULL, id <> 'generic', name-sorted
```
**Behaviour:**
- CLI `export-sample-brief`: `loadRepoEnv()`, `resolveEnvironment('demo', …)` (service URL + `evidenceDir` → fs `ObjectStore` as `reset.ts` builds it), collect → finalize → write `apps/site/content/sample-brief.json` (2-space JSON, LF, trailing newline). On guard hits: print `path reason` lines (never the text), exit 1, write nothing. CLI `export-site-verticals`: `resolveEnvironment('dev')`, write `apps/site/content/verticals.json`. Both print only counts.
- Collect (read-only SQL on the service role; mirror table names in `packages/demo/src/{briefs,changes,reviews,ads,rankings}.ts`): the client's latest `approved|sent` brief; its `active` items in `ord` (max 6) **without `upsell_tag`**; rivals = the client's tracked competitors with their tier; for each item's `evidence_ids`, read `text` evidence objects (before/after captures → `before[]`/`after[]` lines, `changed` = first differing index) — skip `screenshot`/`html`; reviews items → up to 5 `review` rows of that competitor in the event window (`rating`, `published_at` date, `text`; author = "Reviewer " + letter A–E); ad items → the `ad` row (`title`, `text`, `platform`, `started_at`); rank grid = the 12 latest `done` scans, keyword 0 (`client.keywords[0]`), per cell the self rank (`results` position whose title matches the client, else null) and the top result's rival id; `rank` evidence = one per week with a summary string built from counts ("top 3 in N of 49 points").
- Ids re-keyed in order: rivals `r1…`, items `i1…`, evidence `e1…`; every reference rewritten. `business.area` = the client's city renamed; `vertical` = "Heating & air"; `weekOf` = the brief's `period_end` date.
- `sources`: client + every competitor name (`competitor` rows the client tracks **and** every distinct rank-result title), place list = city/region words from the demo (`DEMO_PLACES` constant: Granbury, Lake Granbury, Acton, Stephenville, Tolar, Cleburne, Glen Rose, Weatherford, Hood County, Brazos, Brazos Valley, Pecan Plantation, Comanche Peak, Stockton Bend, Paluxy, Hill Country, Lone Star, Twin Oaks, Cedar Creek, Lake Country, North Texas, Texas, TX), domains = every `competitor.domain`. Guard deny list = all sources + `['Brazos Digital', 'cs_demo']`; allowed domains = renamed ones.
- **Follow pattern:** `packages/demo/src/cli/links.ts` (env, redaction of errors), `packages/demo/src/reset.ts` (store construction).

**Tests (TDD)** (`sample-brief.test.ts`, no DB — fixture `raw` + `sources` objects): `finalize renames every string and re-keys ids consistently`; `finalize never outputs upsell_tag` (fixture carries one); `finalize throws with hit paths when a term survives` (a source term planted in a field the renamer can't see, e.g. inside a word-joined token); `committed json passes the guard` (load `apps/site/content/sample-brief.json`, run `guard` with the static `DEMO_PLACES` + `FILLER_BUSINESSES` (`rankings.ts`) + `CLIENT_SPECS` names (`tenancy.ts`) → `[]`); `committed verticals are id/name pairs, sorted, no generic`.
**Done when:** `pnpm demo:links` works (demo seeded) → `pnpm --filter @cs/demo export:sample-brief` and `export:site-verticals` succeed; focused vitest green; eyeball the JSON (every name fictional, ≥ 4 items with evidence, 12 weeks); commit both JSON files with the code.

### Task 6: Site shell — announcement bar, nav, footer, site-status, pilot context
**Goal:** the frame every page shares, and the one client-side status read.
**Files:** create `apps/site/src/components/shell/{site-header.tsx,announcement-bar.tsx,mobile-menu.tsx,site-footer.tsx,social-links.tsx,shell.test.tsx}`, `apps/site/src/lib/{site-status.ts,site-status.test.ts}`, `apps/site/src/components/shell/pilot-context.tsx`; modify `apps/site/src/app/layout.tsx`.

**Interfaces:**
```ts
// lib/site-status.ts — mirrors @cs/tools SiteStatus (17a); never imported from there (boundary)
export const siteStatusSchema = z.object({ pilotMode: z.boolean(), counters: z.object({ rivalSitesWatched: z.number().int().nonnegative().nullable(), snapshotsThisWeek: …, claimsChecked: …, claimsDropped: … }).nullable() });
export type SiteStatus = z.infer<typeof siteStatusSchema>;
export async function fetchSiteStatus(appUrl: string, signal?: AbortSignal): Promise<SiteStatus | null>; // GET `${appUrl}/api/site-status`, credentials 'omit', 5 s timeout; parse failure/network → null
// components/shell/pilot-context.tsx ('use client')
export function PilotProvider({ children }: { children: React.ReactNode }): JSX.Element; // fetches once on mount
export function usePilot(): { pilotMode: boolean; status: SiteStatus | null; loaded: boolean }; // pilotMode defaults true until a status says false (P6)
```
**Behaviour:**
- Header: `Wordmark` (from `@cs/ui`, links `/`), nav from `PAGES` (`nav`) + `NAV_EXTRA` sorted by order, "Sign in" (ghost, `<APP_URL>/sign-in`), primary CTA (`JoinButton`, Task 7). ≤ 1023 px: nav collapses to a `Sheet` menu button (`aria-expanded`, focus-trapped, Esc closes). Sticky header uses `shadow-overlay` only once scrolled (floating layer).
- Announcement bar (pilot only): lead text + a rotating example every 3 s (pause on hover/focus; **static first example under `prefers-reduced-motion`**; `aria-live="off"` so screen readers aren't spammed) + "Join the pilot →".
- Footer: column links from `PAGES` (Product: How it works, Sample brief; Legal: Privacy, Terms), social links only for set `NEXT_PUBLIC_SOCIAL_*` (`rel="me noopener"`, `target="_blank"`, `aria-label` "Rival Monday on LinkedIn" etc., lucide icons — no platform logos beyond lucide's generic glyphs), CTA card (footer CTA copy, Task 3), "© {year} Rival Monday".
- Pilot off: bar hidden, header CTA "Start your free trial" → `<APP_URL>/sign-up` (owner signs), plus footer link "Own a local business? Join the waitlist" (opens popup at business step).
- **Follow pattern:** DS L-shell rules (README checklist); `@cs/ui` `Sheet`, `Button`, `Wordmark`.

**Tests (TDD):** `site-status.test.ts`: `parses the 17a shape`, `returns null on a bad body, non-2xx or network error`, `sends no credentials`; `shell.test.tsx`: `nav shows only registered pages` (no Integrations/Compare/Partners in 17b), `social link renders only when its env is set`, `pilot off swaps the CTA to sign-up and hides the bar`, `rotation is static under reduced motion` (mock `matchMedia`).
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 7: Join popup — steps, fields, body builder, contract test
**Goal:** the two-step popup collecting exactly the spec § 5 fields and building a schema-valid body.
**Files:** create `apps/site/src/components/join/{join-provider.tsx,join-button.tsx,join-dialog.tsx,step-choose.tsx,step-agency.tsx,step-business.tsx,join-dialog.test.tsx}`, `apps/site/src/lib/{waitlist-body.ts,waitlist-body.test.ts}`, `packages/tools/src/waitlist/site-contract.test.ts`.

**Interfaces:**
```ts
// lib/waitlist-body.ts — only zod imported (the tools contract test imports this file by relative path)
export const CLIENT_BANDS = [{ value: '1-5', label: '1–5' }, { value: '6-15', label: '6–15' }, { value: '16-50', label: '16–50' }, { value: '50+', label: '50+' }] as const;
export type AgencyForm = { contactName: string; email: string; orgName: string; website: string; clientCountBand: '' | (typeof CLIENT_BANDS)[number]['value']; wantsSample: boolean; sampleBusinessName: string; sampleWebsite: string; sampleLocation: string };
export type BusinessForm = { contactName: string; email: string; orgName: string; website: string; location: string; vertical: string /* id | 'other' | '' */; verticalOther: string };
export type FieldErrors = Partial<Record<string, string>>;
export function validateAgency(f: AgencyForm): FieldErrors;  // required: contactName, email (shape), orgName, clientCountBand; sample: businessName + (website | location)
export function validateBusiness(f: BusinessForm): FieldErrors; // required: contactName, email, orgName, website|location, vertical (+ verticalOther when 'other')
export function buildWaitlistBody(f: { kind: 'agency'; form: AgencyForm } | { kind: 'business'; form: BusinessForm }, turnstileToken: string, source: string | null): Record<string, unknown>;
export function sourceFrom(loc: { search: string; pathname: string }, referrer: string): string | null; // P17
// join-provider.tsx ('use client')
export function JoinProvider({ children }): JSX.Element; export function useJoin(): { open(start?: 'choose' | 'agency' | 'agency-sample' | 'business'): void };
```
`buildWaitlistBody` trims every string, omits empty optionals (never sends `""` — the schema's `opt` turns empty into null but `req` fields must be non-empty), lower-cases nothing (server does), agency sample only when `wantsSample`, business sends `verticalId` for a catalogue id or `verticalOther` for "other".

**Copy (owner signs; spec § 5 lines verbatim where given):**
- Step 1: "Step 1 of 2" · title "Join the Rival Monday pilot" · sub "Tell us who you are — we'll send you an invite as places open." · options **"I run an agency"** — "Resell Rival Monday to your clients under your own brand. Free during the pilot, then $229/mo incl. 3 client seats." · **"I own a local business"** — "Get a weekly brief on what your competitors are doing. Free during the pilot, then ${PRICING.business.monthlyUsd}/mo." · foot "Takes 30 seconds" · "Continue".
- Step 2 agency: "Step 2 of 2 · Agency" · "About your agency" · "We'll email you when your pilot place is ready." · labels "Your name", "Work email", "Agency name", "Website (optional)", "Local-business clients" (band select) · checkbox "Send me a real sample brief for one of my clients" → "Client business name", "Client website", "or city / ZIP", hint "One of the two is enough." · submit "Join the waitlist" · fine "Protected by Cloudflare Turnstile. We only use this to contact you about the pilot."
- Step 2 business: "Step 2 of 2 · Local business" · "About your business" · "We'll email you when we can start watching your competitors." · "Your name", "Email", "Business name", "Website", "or city / ZIP", "Type of business" (select from `verticals.json` + "Other…" → "Describe your business") · submit "Join the waitlist".
- Errors: "Enter your name." · "Enter a valid email address." · "Enter the {agency|business} name." · "Pick how many local-business clients you have." · "Add a website or a city / ZIP." · "Pick a type of business, or choose Other."
- Done (spec § 5): "You're on the list. We've emailed you a confirmation." + draft second line "Click the link in that email to confirm your address." · button "Close".

**Behaviour:** `@cs/ui` `Dialog` (phone: full-height `Sheet`-like via `ResponsivePopover` pattern if it fits, else Dialog with `max-h-dvh overflow-y-auto`); "Back" returns to step 1 keeping values; controlled fields with `onReset={e => e.preventDefault()}` (React 19 form reset gotcha); inline errors under fields (`Field` from `@cs/ui`), focus moves to the first invalid field; `JoinButton` opens the dialog in pilot mode and is a link to `<APP_URL>/sign-up` when pilot is off (P6); with pilot off step 1's agency option is that link. `location.hash === '#join'` or `?join=business` opens on mount (P17).
**Tests (TDD):** `waitlist-body.test.ts`: `agency body has kind, band and no sample when unticked`, `sample needs website or location`, `business sends verticalId or verticalOther, never both`, `empty optionals are omitted`, `sourceFrom prefers utm_source, then referrer host, then path, ≤ 200`; `join-dialog.test.tsx`: `step 1 → agency shows the agency fields`, `back keeps typed values`, `errors appear inline and focus the first`, `#join opens the dialog`, `pilot off makes the agency choice a sign-up link`; `site-contract.test.ts` (tools, no DB): for 5 fixture forms, `waitlistSubmitSchema.safeParse(buildWaitlistBody(...)).success === true`, and `CLIENT_BANDS` values equal `@cs/db` `CLIENT_COUNT_BANDS`.
**Follow pattern:** `apps/web/src/app/sign-up/sign-up-form.tsx` and `apps/web/src/app/start/intake-form.tsx` (field anatomy, controlled forms, uniform outcome).
**Done when:** `pnpm --filter @cs/site exec vitest run src/lib/waitlist-body src/components/join`; `cd packages/tools && npx vitest run src/waitlist/site-contract.test.ts` (uses no DB, but the package's global setup touches the test DB — run it only when no other run uses that DB); commit (`git commit -- <the task's Files>`).

### Task 8: Turnstile + submit (security-sensitive)
**Goal:** the widget and the POST, with the uniform done state and safe error handling.
**Files:** create `apps/site/src/lib/{turnstile.ts,waitlist-submit.ts,waitlist-submit.test.ts}`, `apps/site/src/components/join/{turnstile-widget.tsx,turnstile-widget.test.tsx}`; modify `apps/site/src/components/join/{step-agency,step-business,join-dialog}.tsx`.

**Full code — `src/lib/waitlist-submit.ts`:**
```ts
export type SubmitResult = { ok: true } | { ok: false; reason: 'check' | 'invalid' | 'unavailable' };

/** POSTs to 17a's route. No cookies, no credentials, JSON only (the route allows only `content-type`). Never logs the body. */
export async function submitWaitlist(appUrl: string, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<SubmitResult> {
  const json = JSON.stringify(body);
  if (json.length > 8_000) return { ok: false, reason: 'invalid' }; // route caps at 8 KB
  let res: Response;
  try {
    res = await fetchImpl(new URL('/api/waitlist', appUrl).toString(), {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'strict-origin',
      headers: { 'content-type': 'application/json' }, body: json, signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (res.status === 200) {
    const data = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    return data?.ok === true ? { ok: true } : { ok: false, reason: 'unavailable' };
  }
  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, reason: data?.error === 'check' ? 'check' : 'invalid' };
  }
  return { ok: false, reason: 'unavailable' }; // 403 (origin), 5xx, anything else
}
```
**Full code — `src/lib/turnstile.ts` + widget contract:**
```ts
declare global { interface Window { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id: string): void; remove(id: string): void } } }
export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
/** Loads the script once (explicit rendering, P8). Rejects after 10 s so the form can say "unavailable". */
export function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'));
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC; s.async = true; s.defer = true;
    const t = setTimeout(() => { loading = null; reject(new Error('timeout')); }, 10_000);
    s.onload = () => { clearTimeout(t); resolve(); };
    s.onerror = () => { clearTimeout(t); loading = null; s.remove(); reject(new Error('load')); };
    document.head.appendChild(s);
  });
  return loading;
}
```
`TurnstileWidget({ siteKey, onToken, resetKey })` (`'use client'`): renders `<div ref>`; on mount `loadTurnstile()` then `window.turnstile.render(el, { sitekey: siteKey, action: 'waitlist', appearance: 'interaction-only', callback: onToken, 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null) })`; `remove(id)` on unmount; `reset(id)` + `onToken(null)` whenever `resetKey` changes. Without a `siteKey` it renders nothing and the form uses `'no-widget'` (P8).

**Behaviour:**
- Submit flow in each step-2 form: validate → if a site key is set and no token yet, show "Please complete the check below." and stop → disable the button (`aria-busy`) → `buildWaitlistBody` → `submitWaitlist` → **always** bump `resetKey` afterwards (a token is single-use) → `ok` → done state (same for new, duplicate or rate-limited — the server is uniform); `check` → "The check didn't go through. Please try it again."; `invalid` → "Please check the details above." (re-run validation); `unavailable` → "We couldn't send this just now. Please try again in a minute, or email support@rivalmonday.app." (owner signs all four).
- Never `console.*` the body or field values; Sentry (Task 14) gets no form data. Double-submit guarded (in-flight ref).
**Tests (TDD):** `waitlist-submit.test.ts` (fake `fetch`): `posts json to <app>/api/waitlist with credentials omit and only content-type`, `200 ok → ok`, `200 without ok:true → unavailable`, `400 check → check`, `400 invalid → invalid`, `403 → unavailable`, `network error → unavailable`, `oversize body refused before fetch`; `turnstile-widget.test.tsx` (stub `window.turnstile`): `renders explicitly with the site key and action`, `token null on expiry`, `reset on resetKey change`, `removes on unmount`, `no key → renders nothing`; `join-dialog.test.tsx` additions: `submit blocked until a token when a key is set`, `token reset after every attempt`, `duplicate and new both show the done state`, `nothing logged` (spy on console).
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 9: Interactive sample brief component
**Goal:** the clickable brief that runs entirely in the browser.
**Files:** create `apps/site/src/sample/{schema.ts,schema.test.ts}`, `apps/site/src/components/sample/{sample-brief.tsx,brief-items.tsx,evidence-panel.tsx,snapshot-view.tsx,reviews-view.tsx,ad-view.tsx,rank-grid.tsx,friday-panel.tsx,sample-brief.test.tsx}`, `apps/site/content/{sample-friday.ts,sample-friday.test.ts}`.

**Interfaces:**
```ts
// sample/schema.ts — zod mirror of packages/demo/src/site-export/types.ts (SampleBriefData)
export const sampleBriefSchema; export type SampleBriefData = z.infer<typeof sampleBriefSchema>; // same shape as demo types.ts, never imported from it (boundary)
export const SAMPLE: SampleBriefData; // = sampleBriefSchema.parse(json) at module load
// content/sample-friday.ts (owner signs)
export interface CannedAnswer { id: string; question: string; answer: { text: string; cite?: string /* evidence id */ }[] }
export const FRIDAY_ANSWERS: readonly CannedAnswer[]; // 3–4, written after Task 5 from SAMPLE: e.g. "What changed with {top rival} this week?", "Should we match {rival}'s price?", "Who is winning the map for '{keyword}'?", "What are customers praising {rival} for?"
export function SampleBrief({ compact }: { compact?: boolean }): JSX.Element; // 'use client'
```
**Behaviour:**
- Layout: a `Frame` with a header row ("Monday brief · {business.name}", `Tag` "Week of {weekOf}", **visible "Sample data" chip** + "All businesses, people and places are fictional." caption, owner signs); items list (DS feed-row grammar: rival name, headline, what changed, why it matters, recommended action, `CitationPill`s); clicking a claim or pill opens `EvidencePanel` (`@cs/ui` `Sheet`, right side on desktop, bottom on phone; slide-in transition off under reduced motion; title = source label "Website snapshot · {url}", "Google reviews · {count} new", "Ad · Google|Meta Ad Library", "Map rankings · week of …"; Esc + close button; focus returns to the trigger).
- `SnapshotView`: HTML page mock — title bar, `before`/`after` toggle (Segmented), changed block outlined in `amber` (the one highlight), "captured {date}". `ReviewsView`: list with star glyphs (`aria-label` "{n} out of 5"), author initials, date. `AdView`: ad card copy + first seen.
- `RankGrid`: 7×7 cells (`size`) coloured by rank bucket (1–3 / 4–10 / 11–20 / not found) using the palette copied from `apps/web/src/components/charts/geo-grid.tsx` as site tokens (validate with the dataviz skill: no colour-only meaning — each cell shows its number; legend), a `<input type="range">` week slider (labelled "Week", `aria-valuetext` "Week of …"), caption "Top 3 in N of 49 points" computed from data, and the week's leader. No map tiles (P3).
- `FridayPanel`: `FridayBadge` + 3–4 question buttons; choosing one types the answer in (instant under reduced motion) with inline `CitationPill`s opening the same `EvidencePanel`; label "Canned answers from the sample data". No input box, no network.
- `compact` (hero/home): first 3 items, no rank grid; full on `/sample-brief` and the home `sample` section.
- **Follow pattern:** `apps/web/src/components/views/brief-view.tsx` + `evidence-chips.tsx` (feed rows, pills), `apps/web/src/components/charts/geo-grid.tsx` (grid + legend), `packages/ui` `Sheet`/`CitationPill`/`FridayBadge`/`Segmented`.
**Tests (TDD):** `schema.test.ts`: `committed sample-brief.json parses`, `every evidenceId referenced exists`, `≥ 4 items, 12 weeks, size² cells per week`, `label is Sample data`, `no deny-listed real place` (site-local list: Granbury, Texas, TX, Acton, Cleburne, Stephenville, Weatherford, Brazos, Lone Star, Hood County — second line of defence); `sample-friday.test.ts`: `every cite exists in SAMPLE.evidence`, **`friday answers cite every figure`** (every `\d` token in an answer part appears in its cited evidence or in the item that cites it; parts with numbers must have a `cite`); `sample-brief.test.tsx`: `clicking a claim opens its evidence`, `Esc closes and returns focus`, `slider changes the grid and caption`, `friday question reveals a cited answer`, `Sample data label is visible`, `reduced motion shows the answer at once`.
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 10: Home page — hero and product fragments
**Goal:** the first screen: bar, nav, hero copy, CTAs, floating fragments.
**Files:** create `apps/site/src/components/home/{hero.tsx,hero-fragments.tsx,hero.test.tsx}`; modify `apps/site/src/app/page.tsx`, `apps/site/content/home.ts` (anchors).

**Behaviour:**
- Layout per the approved mockup (`.superpowers/brainstorm/27796-1793230191/content/hero-and-signup.html`): left column eyebrow (`amber` "Pilot" pill — the screen's one orange highlight besides Friday — + eyebrow text), `h1` at `--text-display` Inter 600 with tight tracking (−0.035em), "under your brand." in `text-secondary`, sub, CTAs (`JoinButton` primary, "See a sample brief" ghost → `#sample`), fine print. Right: `HeroFragments` — three floating fragments with `shadow-float`, slightly offset: (1) brief card = `SAMPLE.items[0..2]` headlines + citation pills (dot colours: you/rival chart roles, not orange), (2) the first `snapshot` evidence's changed block with its URL + date, (3) Friday card = `FRIDAY_ANSWERS[0]` question + first answer part + "{n} sources" pill (P5). Fragments are `aria-hidden` decoration with one visually hidden summary ("Preview of a sample Monday brief") and link to `#sample`.
- Background: `.bg-grid-lines` + one `.hero-wash`. ≤ 1023 px: single column, fragments stack below the copy at reduced size, never wider than the viewport. Optional float-in animation (≤ 400 ms) only without reduced motion.
- `page.tsx` metadata via `pageMetadata('/')`; sections render in order `hero → sample → live → how-it-works → checks → friday → real-sample → founder → pricing → footer CTA` (Task 11 fills them).
**Tests (TDD):** `hero.test.tsx`: `renders the decided headline, eyebrow and sub exactly`, `fragments show data from SAMPLE and FRIDAY_ANSWERS` (headline text present), `secondary CTA targets #sample`, `exactly one h1`.
**Done when:** focused vitest green; `pnpm --filter @cs/site build`; commit (`git commit -- <the task's Files>`).

### Task 11: Home sections — sample, counters, how it works, checks hub, Friday row, real sample, founder, pricing teaser, footer CTA
**Goal:** the rest of the home page.
**Files:** create `apps/site/src/components/home/{section-heading.tsx,live-counters.tsx,steps.tsx,checks-hub.tsx,friday-row.tsx,real-sample.tsx,founder-note.tsx,pricing-teaser.tsx,cta-band.tsx,sections.test.tsx}`; modify `apps/site/src/app/page.tsx`.

**Behaviour:**
- `SectionHeading`: eyebrow (small, `text-secondary`, sentence case — no uppercase tracking) + `h2` + body; each section `id` from `HOME_ANCHORS`, `scroll-margin-top` for the sticky header.
- `sample`: `<SampleBrief />` (full).
- `LiveCounters` (`'use client'`, `usePilot().status`): one `KpiStrip`-style band with the four `COUNTER_LABELS`; a `null` counter is omitted; the whole section (heading included) renders nothing while loading, on `counters: null`, or when all four are null — no skeleton that later disappears (layout shift: reserve nothing; the section sits below the fold). Numbers via `Intl.NumberFormat('en-US')` with a "+" suffix ("1,200+") because 17a rounds down; caption "Last 7 days · rounded down".
- `Steps`: 4-step numbered stepper (horizontal ≥ 1024, vertical below) from `how-it-works` copy.
- `ChecksHub`: inline SVG hub — centre card "Monday brief" with a "Verifying…" chip (pulse off under reduced motion), five source tiles wired to it: Competitor websites, Google reviews, Google Business Profile, Meta Ad Library, Local map rankings (own lucide icons, no logos); a final arrow to "No evidence, no claim". Accessible: `role="img"` + `aria-label` describing the flow, plus the text in the section body. Lines use `--chart-grid`/`--line` tokens; mobile = vertical list version (no tiny SVG).
- `FridayRow`: split row — copy left; right a small rivals table (`SAMPLE.rivals` + `TierMark` from `@cs/ui`) with a docked, **non-interactive** Ask box showing `FRIDAY_ANSWERS[1]` and citation pills opening `EvidencePanel`.
- `RealSample`: copy + "Request a real sample" button → opens the popup at the agency step with the sample box ticked (extend `useJoin().open('agency-sample')`).
- `FounderNote`: renders only when `FOUNDER_NOTE` is non-null (photo via `next/image` from `public/`, or initials avatar).
- `PricingTeaser` (`id="pricing"`): two plain columns (Agency / Local business) from `PRICING` + note; no cards (DS: not independent objects); "Join the pilot" CTA.
- `CtaBand`: centred line over faint fragment echoes (decorative, `aria-hidden`), one primary button.
- The integrations strip (spec § 4 extra) is 17c (§ 7.4 vendor/logo rules); leave no empty slot.
- **Follow pattern:** `packages/ui` `KpiStrip`, `TierMark`, `HairlineGrid`; DS sections-before-cards.
**Tests (TDD):** `sections.test.tsx`: `counters hide a null value`, `counters render nothing when counters is null or all null`, `counters format 1200 as 1,200+`, `founder note hidden while null`, `pricing teaser shows 229, 3 seats, 99 from PRICING`, `real sample button opens the popup with the sample ticked`, `checks hub has an accessible name`, `section ids match HOME_ANCHORS`.
**Done when:** focused vitest green; `pnpm --filter @cs/site build`; `bash scripts/design-lint.sh` = 0; commit (`git commit -- <the task's Files>`).

### Task 12: `/sample-brief`, `/how-it-works`, `/privacy`, `/terms`, placeholder gate
**Goal:** the remaining 17b pages.
**Files:** create `apps/site/src/app/{sample-brief,how-it-works,privacy,terms}/page.tsx`, `apps/site/src/components/legal/{legal-page.tsx,legal-page.test.tsx}`, `apps/site/content/legal/{privacy.md,terms.md}`, `apps/site/scripts/check-placeholders.ts`, `apps/site/scripts/check-placeholders.test.ts`.

**Behaviour:**
- `/sample-brief`: sub-page hero (eyebrow "Sample brief", h1 "A Monday brief, start to finish" (owner signs), one line "Fictional business, real product. Click any claim to see its evidence."), full `<SampleBrief />`, CTA band. Metadata title "Sample Monday brief" (shareable from cold emails: OG title/description set).
- `/how-it-works`: L5-style reading column (≤ 720 px) from `content/how-it-works.ts`, the `ChecksHub` once, CTA band.
- `/privacy`, `/terms`: `LegalPage` reads `content/legal/<name>.md` at build time (`fs.readFile` in the server component, `path.join(process.cwd(), 'content/legal', …)` — no `new URL(…, import.meta.url)`, Turbopack gotcha) and renders with react-markdown (no raw HTML: `skipHtml`), headings re-levelled under the page `h1`, "Last updated {date}" from front line. **Follow pattern:** `apps/web` help guide rendering (react-markdown 10.1.0 usage). Draft content: a top line `<!-- OWNER-PLACEHOLDER: replace with counsel-reviewed text -->` + a short honest outline (privacy: what the waitlist form collects — name, email, organisation, website or city/ZIP, business type, client band; why — to contact you about the pilot; processors by role, not data vendors — hosting, email delivery, bot check, error monitoring, cookieless analytics; no cookies set by the site; contact support@rivalmonday.app; terms: pilot is free and may change, no warranty during the pilot, acceptable use). Both marked draft in the copy sign-off.
- `check-placeholders.ts`: scans `apps/site/content/**` and `apps/site/src/**` (excluding tests and this script) for `OWNER-PLACEHOLDER`; prints file:line, exits 1 if any. Wired into `deploy-site` (Task 14), not `build` (previews must still build).
**Tests (TDD):** `legal-page.test.tsx`: `renders the markdown with one h1`, `raw html is not rendered`; `check-placeholders.test.ts`: `finds a marker and fails`, `passes a clean tree` (temp dir fixtures); `pages.test.ts` (Task 2) now passes for all five routes.
**Done when:** focused vitest green; `pnpm --filter @cs/site build && pnpm --filter @cs/site check:bundle`; commit (`git commit -- <the task's Files>`).

### Task 13: Site E2E smoke (Playwright, no DB)
**Goal:** prove the built site works in a browser: popup, sample brief, headers, phone width.
**Files:** create `apps/site/playwright.config.ts`, `apps/site/e2e/site.spec.ts`; modify `apps/site/package.json` (`e2e`: `playwright test`).

**Interfaces:** config: `testDir ./e2e`, `workers: 1`, `webServer.command` = `pnpm build && pnpm start --port 3200` (skip build with `E2E_SKIP_BUILD=1`), env `NEXT_PUBLIC_APP_URL=http://app.e2e.test`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY=''`, `VERCEL_ENV=''`; projects `desktop` (1440×900) and `phone` (390×844, `isMobile`). Every test routes `http://app.e2e.test/api/site-status` and `/api/waitlist` with `page.route` (no real network; assert the waitlist request body).
**Follow pattern:** `apps/web/playwright.config.ts` (webServer, `E2E_SKIP_BUILD`), minus the DB and env file.
**Tests:** `home renders the decided headline` · `no horizontal overflow` (both projects, `/`, `/sample-brief`, `/how-it-works`: `scrollWidth <= clientWidth`) · `no csp violations or console errors` (listen for `console` errors and `securitypolicyviolation`) · `security headers present` (`response.headers()` on `/`) · `agency join flow posts a valid body and shows the done state` (assert JSON keys, `turnstileToken: 'no-widget'`, then the done copy) · `business join flow with Other` · `400 check shows the check message` · `pilot off swaps the CTA to sign-up` (status mock `pilotMode:false`) · `counters hidden when null` · `sample claim opens evidence; slider changes week; friday answer cites` · `unknown path is 404 with the site shell` · `robots disallows on a non-production build`.
**Done when:** `pnpm --filter @cs/site exec playwright install chromium` (once) then `pnpm --filter @cs/site e2e` green; commit (`git commit -- <the task's Files>`).

### Task 14: Analytics, Sentry, Vercel project and CI wiring
**Goal:** observability and the gated deploy path; owner steps written down.
**Files:** create `apps/site/instrumentation-client.ts`, `apps/site/vercel.json` (only if a setting can't live in the dashboard — prefer none); modify `apps/site/src/app/layout.tsx`, `apps/site/next.config.ts`, `.github/workflows/ci.yml`, `docs/DEPLOY.md`, `turbo.json` (if Sentry build vars are new — `SENTRY_*` already pass through).

**Behaviour:**
- `layout.tsx`: `<Analytics />` from `@vercel/analytics/next` (cookieless; no banner). `instrumentation-client.ts`: `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development', sendDefaultPii: false, tracesSampleRate: 0, beforeSend(e) { delete e.request?.data; delete e.request?.cookies; return e; }, beforeBreadcrumb(b) { return b.category === 'ui.input' ? null : b; } })` — inert without a DSN. `next.config.ts` wrapped in `withSentryConfig` exactly as `apps/web` (source maps only with `SENTRY_AUTH_TOKEN`). Boundary test allows `NEXT_PUBLIC_SENTRY_DSN`/`NEXT_PUBLIC_VERCEL_ENV` (both public).
- `ci.yml`: new job **`site`** (no services): checkout, pnpm, node 24, `pnpm install --frozen-lockfile`, `pnpm --filter @cs/site lint`, `pnpm --filter @cs/site build`, `pnpm --filter @cs/site check:bundle`, `pnpm --filter @cs/site exec playwright install --with-deps chromium`, `E2E_SKIP_BUILD=1 pnpm --filter @cs/site e2e`. (Unit tests and typecheck already run in `test` via turbo.) New job **`deploy-site`**: `needs: [site, deploy]`, same `if:` as `deploy`, `environment: production`, `concurrency: production-site`; steps: install, `pnpm --filter @cs/site check:placeholders`, `vercel pull/build/deploy --prebuilt --prod` (pinned `vercel@62.4.0`) with `VERCEL_PROJECT_ID: ${{ secrets.VERCEL_SITE_PROJECT_ID }}`, `SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT_SITE }}`. `deploy` needs no change (site deploys after the app so `/api/waitlist` + `SITE_ORIGIN` are live first).
- `docs/DEPLOY.md` new § "Marketing site (rivalmonday.com)", ≤ 1.5 KB: owner steps below + secrets list + "site holds no secrets; `NEXT_PUBLIC_*` only".
**Owner steps (into DEPLOY.md and the work file):** (1) register `rivalmonday.com` (+ trademark knockout); (2) Vercel: new project, root `apps/site`, framework Next.js, region iad1, Git auto-deploy off, domains `rivalmonday.com` + `www.rivalmonday.com` → redirect to apex; Web Analytics on; (3) Vercel env (Production + Preview): `NEXT_PUBLIC_APP_URL=https://rivalmonday.app`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (the app's widget key), `NEXT_PUBLIC_SENTRY_DSN` (new Sentry project "site"), optional `NEXT_PUBLIC_SOCIAL_*`, `NEXT_PUBLIC_CLIENT_PRICE_USD`; (4) Turnstile widget hostnames: add `rivalmonday.com`, `www.rivalmonday.com` and the preview host; (5) app env: `SITE_ORIGIN=https://rivalmonday.com`, `SITE_ORIGIN_EXTRA` = preview origin(s); (6) Namecheap DNS: Vercel A/CNAME for apex + www; (7) GitHub `production` secrets `VERCEL_SITE_PROJECT_ID`, `SENTRY_PROJECT_SITE`; (8) replace the placeholders (privacy, terms, founder note) — `deploy-site` refuses until then.
**Tests:** `instrumentation-client` is config — no unit test; the boundary test covers env reads; CI YAML validated by `npx --yes @action-validator/cli@0.6.0 .github/workflows/ci.yml` if available, else careful review.
**Done when:** `pnpm --filter @cs/site exec vitest run`; `pnpm --filter @cs/site build && pnpm --filter @cs/site check:bundle`; commit (`git commit -- <the task's Files>`).

### Task 15: Copy sign-off, work file, final checks
**Goal:** owner-ready hand-over.
**Files:** create `docs/archive/phase-17b-copy-signoff.md`; modify `docs/work/phase-17.md`.

**Behaviour:**
- Sign-off file (mirror `docs/archive/phase-17a-copy-signoff.md`): every string marked owner signs, grouped by surface (hero — decided, announcement, sections, how-it-works page, popup steps/errors/done, Turnstile line, pilot-off CTAs, 404, sample-brief page + "fictional" caption, fictional names list from `FICTIONAL`, Friday canned answers, counters labels, footer CTA, legal drafts), each with file:line and a `[ ]` box; a "Decisions to confirm" list (P1 nav without 17c items, P3 no map background, P6 pilot-off wording, P13 placeholder gate).
- Work file: Status/Next overwritten (17b implemented; final review commands: `pnpm test:affected`, `pnpm --filter @cs/site e2e`, `bash scripts/design-lint.sh`, `git ls-files --eol | grep crlf` empty, `iconv` over the diff); Interfaces section adds `apps/site`, the two `@cs/demo` exporters, env list, CI jobs; owner verification steps: (1) `pnpm --filter @cs/site dev` → open `http://localhost:3001` at 1440 and 390 wide; (2) with the app running locally (`pnpm dev:web`, `SITE_ORIGIN_EXTRA=http://localhost:3001` in your `.env`, `NEXT_PUBLIC_APP_URL=http://localhost:3000` in the shell) submit the agency form → confirmation email in `apps/web/.outbox/`; (3) Pilot mode off at `/platform/billing` → reload the site: CTA reads "Start your free trial"; (4) click through the sample brief (claim → evidence, slider, Friday); check every name looks fictional; (5) read and sign the copy file; supply founder note + photo, privacy and terms text; (6) the Task 14 Vercel/DNS/Turnstile steps; (7) social URLs if any. New backlog lines: SRI-based CSP (P7); vertical list refresh is manual (P2); 17c to register its pages in `content/pages.ts`.
**Done when:** `git ls-files --eol | grep crlf` prints nothing; `iconv -f utf-8 -t utf-8` over `git diff --name-only main...HEAD` clean; commit both docs.
