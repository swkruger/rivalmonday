# Phase 17b — marketing site foundation, home page, sign-up popup and interactive sample brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a new statically generated `apps/site` (rivalmonday.com) ships the home page (hero, interactive sample brief, live counters, "How we check every claim", founder note slot, real-sample offer, how-it-works, Friday row, pricing teaser, footer CTA), the "Join the pilot" popup posting to 17a's `POST /api/waitlist`, `/sample-brief`, `/how-it-works`, `/privacy`, `/terms` and a 404, plus the metadata/sitemap/robots foundation, an import boundary, CSP, Vercel project and CI wiring. 17c pages (integrations, sources, compare, pricing, partners) and the full SEO pass are **not** in this plan.

**Architecture:** `apps/site` is a Next.js 16 App Router app with no server data: every page is prerendered, content lives in `apps/site/content/` (TS modules, committed JSON, Markdown for legal text), and the browser makes exactly two calls to rivalmonday.app (`GET /api/site-status`, `POST /api/waitlist`). It consumes `@cs/ui` (DS v1 tokens + primitives) through `transpilePackages` and nothing else from the workspace. The sample brief and the vertical list are **exported** from the database by CLIs in `@cs/demo` (renamed to fictional names, guard-checked) and committed as JSON, so the site build needs no credentials.

**Tech Stack:** Next.js 16.3.8, React 19.3, Tailwind 4 (`@cs/ui/styles.css`), zod 4, react-markdown 10.1.0, `@vercel/analytics`, `@sentry/nextjs` 11.4.0 (browser only), Vitest + Testing Library (jsdom), Playwright 1.63.0 (site-only config).

**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` § 2 (row 17b), § 3, § 4, § 5, § 7.1, § 7.2, § 7.3 (17b pages only), § 7.8; § 6.3 for the two routes. 17a contracts: `packages/tools/src/waitlist/public.ts` (`waitlistSubmitSchema`), `apps/web/src/app/api/waitlist/route.ts`, `packages/tools/src/waitlist/site-status.ts` (`SiteStatus`), `apps/web/src/server/site-origin.ts` (`siteJoinUrl` → `<site>/#join`). Root `CLAUDE.md` § Decisions binding.

## Global Constraints
- Before coding read `docs/gotchas-cross-cutting.md`, `packages/ui/CLAUDE.md`, `apps/web/CLAUDE.md` (its Next 16 gotchas apply), `packages/demo/CLAUDE.md` (Tasks 4–5), `docs/design-system/README.md` § checklist; before Tasks 1–2 `apps/web/node_modules/next/dist/docs/01-app/02-guides/{content-security-policy,static-exports,analytics}.md`; before `turbo.json` the installed turbo 2.11.5 `docs/` (`AGENTS.md`).
- **The site holds no secrets** and never imports `@cs/db`, `@cs/tools`, `@cs/worker`, `@cs/engine`, `@cs/ai`, `@cs/ask`, `@cs/billing`, `@cs/collectors`, `@cs/evals`, `@cs/mcp`, `@cs/storage`, `@cs/verticals`, `@cs/demo` or the `@cs/email` root (Task 1 gate). It reads only `NEXT_PUBLIC_*` and `VERCEL_ENV` (plus `SENTRY_AUTH_TOKEN|ORG|PROJECT` in `next.config.ts` only, for source maps).
- **No invented facts:** every number, claim or name comes from 17a's live counters, the exported sample JSON, `content/pricing.ts` (spec § 7.6) or owner-signed copy. No testimonials, customer logos, review stars, "nobody else" claims, Google/Meta logos or partnership wording; data vendors (DataForSEO, Apify, ScrapeCreators, Stadia) are never named.
- **DS v1 with marketing latitude (spec § 7.8):** `@cs/ui` tokens and primitives; Inter only (400/500/600, 800 wordmark); faint grid lines and **one** soft blue wash per hero; floating fragments may carry `shadow-float`; orange (`amber`) only for Friday plus **one** highlight per screen (the Pilot pill); no hex/`rounded-[…]`/`text-[…px]`/shadow literals in components (site tokens in `apps/site/src/app/site.css`); `bash scripts/design-lint.sh` stays 0 (covers `apps/site/src` from Task 1). 390 px with no horizontal overflow; `prefers-reduced-motion` disables every animation and the bar rotation.
- **Do not modify `@cs/ui`** (13a owns `theme.ts`, `app-shell`, `auth-card`) or `apps/web` (17a is done); compose primitives in `apps/site/src/components/`. The site↔route contract test lives in `@cs/tools` (Task 7), whose only 17a source change is exporting `LINKISH`.
- Copy marked **(owner signs)** is used verbatim; Task 15 collects it. Owner placeholders carry `OWNER-PLACEHOLDER` (Task 12 gate).
- Tests: implementers run focused tests only (`pnpm --filter @cs/site exec vitest run <pattern>`; demo/tools: `npx vitest run <pattern>` from the package dir). The site needs no database. `pnpm test:affected` and `pnpm --filter @cs/site e2e` run once at the final review; `@cs/web` E2E is unaffected.
- Per task: `- [ ]` tests first and watch them fail → implement → focused tests green → commit with explicit paths (`git commit -- <paths>`), never amend, LF only, UTF-8 checked (`iconv -f utf-8 -t utf-8`), message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents: own model). Never stage `.env`, `.claude/`, `.superpowers/`.

## Decisions
Spec (O)/(C) items stand. Plan-level calls for the owner's approval:
- **P1 Page registry gates nav and sitemap.** `content/pages.ts` lists routes that exist (each registered by the task that creates its page); nav, footer and `sitemap.ts` render only registered entries. 17b nav: *How it works*, *Sample brief*, *Pricing* (`/#pricing`), *Sign in* (`<APP_URL>/sign-in`), *Join the pilot*. 17c registers Integrations, Compare, Pricing (`/pricing`), Partners (spec § 7.3 order). No env flag.
- **P2 Vertical list = committed `apps/site/content/verticals.json`** (`{ id, name }[]`, reviewed + unmerged, no `generic`, name-sorted) from `pnpm --filter @cs/demo export:site-verticals` against `SERVICE_DATABASE_URL` (prod-env shell for the live catalogue). "Other" sends `verticalOther`; a stale list is harmless (17a nulls unknown ids).
- **P3 Sample brief = `cs_demo` export, renamed.** Lone Star Cooling's latest approved brief, tracked rivals, cited evidence text, reviews/ads behind cited items, 12 weekly rank scans of keyword 0; explicit rename map **plus a deny-list guard that fails the export** on any surviving demo business, place, state word, ZIP, phone, street, email, uuid or `.example` domain. Evidence ships as structured text, never demo images (names in pixels); rank grid without a map background. `upsell_tag`, ids, place ids, reviewer hashes dropped; reviewers become initials.
- **P4 Friday canned answers** in `content/sample-friday.ts` (owner signs) cite sample evidence ids; a test fails on any number not in the cited evidence or item ("Ask drops uncited figures").
- **P5 Hero fragments come from the sample JSON** (first three items, one snapshot, Friday answer 1), never hand-typed facts.
- **P6 Pilot mode is read client-side.** Pages prerender the pilot state (popup CTAs, Pilot pill, bar). On `pilotMode: false` agency CTAs become "Start your free trial" → `<APP_URL>/sign-up`, pill and bar hide, the popup's agency choice becomes that link; the business path stays the waitlist. `pilotMode` is honoured **only when `counters !== null`** — 17a answers a degraded `200 {pilotMode:false, counters:null}` on a DB error, so that, a failed fetch or a bad body keep the pilot state. A flip shows after up to ~6 min (CDN `s-maxage=300` + swr 60 s + 60 s memo).
- **P7 CSP without nonces** (nonces force dynamic rendering; SRI is experimental): `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`, everything else strict (Task 2); SRI to the backlog.
- **P8 Turnstile = explicit rendering** in the dialog, same widget as the app (17a P5). Without `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no widget renders and the body carries `turnstileToken: 'no-widget'`, useful only against the mocked route (E2E): the app in env `dev` fails closed without `TURNSTILE_SECRET_KEY` and verifies for real with one. Local runs use Cloudflare's test keys (site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).
- **P9 Import boundary** = a Vitest gate on `package.json` and import specifiers plus a post-build `check:bundle` over `.next` output and traces. `@cs/ui` → `@cs/email/branding` → `import type … from '@cs/db'` is erased; of `@cs/core`/`@cs/email` only `@cs/email/src/branding.ts` may reach the bundle.
- **P10 Content:** TS modules + JSON; legal pages are Markdown rendered at build time with react-markdown. No MDX.
- **P11 Marketing tokens are site-local** (`site.css`: display sizes, `shadow-float`, `--ring-change`, rank buckets, grid lines, hero wash); `@cs/ui/styles.css` imported unchanged.
- **P12 Canonical origin** `https://rivalmonday.com`; `robots.ts` allows all only when `VERCEL_ENV === 'production'`, else disallows all.
- **P13 Placeholder gate:** founder note renders only when `content/founder.ts` is non-null; privacy/terms ship as `OWNER-PLACEHOLDER` drafts and `check:placeholders` (in `deploy-site`) fails while any remains.
- **P14 Site E2E:** own Playwright config (port 3200, `next build && next start`, no DB, app routes mocked with `page.route`), own CI job `site`, never `cs_test`.
- **P15 Deploy:** second Vercel project (root `apps/site`, iad1, auto-deploy off); CI `deploy-site` after `deploy` behind `DEPLOY_ENABLED`; secrets `VERCEL_SITE_PROJECT_ID`, `SENTRY_PROJECT_SITE`. Sentry browser-only (`sendDefaultPii: false`, no bodies).
- **P16 Business location** = optional "Website" and "City or ZIP", at least one (schema refine); same for the agency's sample request.
- **P17 `source`** = `utm_source`, else referrer host, else page path; ≤ 200 chars. `/#join` (17a `siteJoinUrl`) and `?join=business` open the popup on load and on `hashchange`.

**Pre-flight amendments (2026-10-29)** (scan `.superpowers/sdd/…/preflight.md`):
- C1/C2: T2 registers only `/`; T12 adds its four `PAGES` entries; `HOME_ANCHORS` and the anchor test live in T3 only.
- C3: T6 creates `JoinProvider`/`useJoin`/`JoinButton` (sole owner of the pilot-off link) and wraps the layout; T7 mounts the dialog.
- C4: `JOIN_COPY` → T7 `components/join/copy.ts`. C5: scripts land with their files (`check:placeholders` T12, `e2e` T13).
- C6: renamer derives names (24 stems × 5 tails = 120 per kind); explicit `STATE_TERMS` rule for Texas/TX; `DEMO_PLACES` towns only (+ Lipan).
- C7/C8/C14: rank tokens in `site.css` (T9); orange = Pilot pill (`home/pilot-pill.tsx`) + Friday (`FridayBadge`, `friday-*.tsx`); snapshot change uses `--ring-change`; two reasoned design-lint allowlist entries.
- C9: rendered section ids = `HOME_ANCHORS` (minus `live` without counters); `CtaBand` has `id="join"`.
- C10: T1 lists `env.test.ts`; boundary scans `instrumentation-client.ts` once it exists. C11: `SENTRY_*` reads allowed in `next.config.ts` only.
- C12: `NEXT_PUBLIC_COMPARE_PAGES` dropped; site vars in turbo `@cs/site#build` `env` (hashed), not `globalPassThroughEnv`.
- C13: `pilotMode` honoured only when `counters !== null` (P6). C15: per-counter captions ("Right now" for rivals).
- C16: `<Analytics />` only when `VERCEL_ENV` is set. C17: E2E app origin `https://app.e2e.test`.
- C18/C19: `LINKISH` exported from `@cs/tools` `waitlist/public.ts` (T7), mirrored with max lengths + zod email; parity test.
- C20: owner steps add the app's `TURNSTILE_SECRET_KEY`, Cloudflare test keys locally (P8), ~6 min flag lag (P6).
- Tests: T3 founder/prices tests replaced; whole-number Friday-figure tokens; `finalize` field whitelist + deep-key test; guard phone check strips only the placeholder; two `loadTurnstile` tests.

## File structure
- **Site (new):** `apps/site/{package.json,next.config.ts,tsconfig.json,postcss.config.mjs,vitest.config.ts,vitest.setup.ts,playwright.config.ts,next-env.d.ts,instrumentation-client.ts,AGENTS.md,CLAUDE.md}`, `scripts/{check-bundle,check-placeholders}.ts`, `content/{site,pages,home,how-it-works,pricing,founder,sample-friday}.ts`, `content/{sample-brief,verticals}.json`, `content/legal/{privacy,terms}.md`, `src/app/{layout.tsx,site.css,page.tsx,not-found.tsx,robots.ts,sitemap.ts}` + `src/app/{sample-brief,how-it-works,privacy,terms}/page.tsx`, `src/components/{shell,join,sample,home,legal}/*`, `src/lib/{env,headers,site-status,waitlist-body,waitlist-submit,turnstile,metadata}.ts`, `src/sample/schema.ts`, `e2e/site.spec.ts`, `src/import-boundary.test.ts`; tests beside sources.
- **Demo exporters:** `packages/demo/src/site-export/{rename,types,sample-brief,verticals}.ts` (+ tests), `packages/demo/src/cli/{export-sample-brief,export-site-verticals}.ts`, `packages/demo/package.json`.
- **Contract:** `packages/tools/src/waitlist/{site-contract.test.ts,public.ts}` (`public.ts`: export `LINKISH` only).
- **Root/CI/docs:** `turbo.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `scripts/design-lint.sh`, `docs/DEPLOY.md`, `docs/archive/phase-17b-copy-signoff.md`, `docs/work/phase-17.md`.

## Dependencies on in-flight work
17a is implemented on this branch (final review pending): `POST /api/waitlist` (Origin allowlist `SITE_ORIGIN`/`SITE_ORIGIN_EXTRA`, `content-type` only, 8 KB cap, `200 {ok:true}` / `400 {ok:false,error:'invalid'|'check'}` / `403` bad origin) and `GET /api/site-status` (CORS `*`, `s-maxage=300`). If the 17a review changes either, Tasks 7/8 follow. 13a (unbuilt) owns `packages/ui` theme/shell files; this plan edits nothing in `packages/ui` or `apps/web`. `git branch --no-merged main` = `phase-17` only today; Task 0 re-checks.

## Review Focus
1. **Boundary + no secrets** — no forbidden package in site source, package.json or build output; only allowed env reads → T1 `import-boundary…`, `check:bundle`, T14 CI.
2. **Popup POST exact and safe** — body matches `waitlistSubmitSchema` on every path, client validation mirrors the server, `credentials: 'omit'`, uniform done state, token required with a key and reset per attempt, no PII to Sentry/console → T7 `site-contract…`, T8 `submit…`, `turnstile…`.
3. **Sample data fictional and honest** — single-pass case-preserving renamer, guard fails on any leak, field whitelist, Friday figures cited → T4 `guard…`, T5 `committed json passes the guard`, T9 `friday answers cite every figure`.
4. **Headers/CSP and indexing** — headers on every route, previews `Disallow: /`, sitemap = registered pages → T2 tests; T13 `no csp violations`.
5. **Pilot switch + counters** — pilot off swaps agency CTAs only, degraded status keeps pilot, counters hide nulls/the band, no overflow at 390 → T6, T11, T13.

---

### Task 0: Pre-flight
**Goal:** confirm base and assumptions.
- [ ] `git fetch`; rebase `phase-17` on `main` if it moved; `git branch --no-merged main` (expect `phase-17`). Another branch touching `packages/ui`, `packages/demo`, `turbo.json`, `ci.yml` or `design-lint.sh` → conflict-scan, note it.
- [ ] Re-read the 17a contracts listed under Dependencies against the code (`waitlistSubmitSchema`, route CORS headers, `SiteStatus`, `CLIENT_COUNT_BANDS = ['1-5','6-15','16-50','50+']`, `siteJoinUrl`). Note any drift in `docs/work/phase-17.md`.
- [ ] `cs_demo` seeded (`pnpm demo:links`; else `pnpm demo:reset`, no paid calls); `apps/worker/.evidence-demo/` holds `text.txt` evidence.
- [ ] Resolve versions to pin: `npm view @vercel/analytics version` (pin exact; must be ≥ 2 weeks old).
- **Done when:** notes appended to the work file; nothing else committed.

### Task 1: `apps/site` scaffold, import boundary, design-lint scope
**Goal:** an empty-but-building static site in the workspace with the boundary gates.
**Files:** create `apps/site/{package.json,next.config.ts,tsconfig.json,postcss.config.mjs,vitest.config.ts,vitest.setup.ts,next-env.d.ts,AGENTS.md,CLAUDE.md}`, `apps/site/src/app/{layout.tsx,site.css,page.tsx}`, `apps/site/src/lib/{env.ts,env.test.ts}`, `apps/site/src/import-boundary.test.ts`, `apps/site/scripts/check-bundle.ts`; modify `turbo.json`, `scripts/design-lint.sh`, `pnpm-lock.yaml`.

**Interfaces:**
- `package.json` name `@cs/site`, private, `type: module`; scripts `dev` (`next dev -p 3001`), `build`, `start`, `typecheck` (`tsc -p .`), `test` (`vitest run`), `lint` (`vitest run src/import-boundary.test.ts`), `check:bundle` (`tsx scripts/check-bundle.ts`); `check:placeholders` and `e2e` are added by Tasks 12/13 with their files. Deps: `@cs/ui` (workspace), `next` 16.3.8, `react`/`react-dom` ^19.3.0, `zod` ^4.1.5, `react-markdown` 10.1.0, `lucide-react` ^1.52.0, `@vercel/analytics` (Task 0 pin), `@sentry/nextjs` 11.4.0; dev `@tailwindcss/postcss`/`tailwindcss` ^4.3.3, `@testing-library/react` ^16.3.3, `jsdom` ^30.1.2, `vitest` ^3.2.4, `tsx`, `typescript`, `@types/*`, `@playwright/test` 1.63.0.
- `next.config.ts`: `transpilePackages: ['@cs/ui', '@cs/core', '@cs/email']`, `poweredByHeader: false`, `reactStrictMode: true`, `headers()` (Task 2). **No** `output: 'export'` (headers need the Next runtime; pages still prerender). No `.env` loading.
- `src/lib/env.ts`: `siteEnv = { appUrl, turnstileSiteKey, social: { linkedin, x, youtube, facebook, instagram }, clientPriceUsd, isProduction }` from literal `process.env.NEXT_PUBLIC_…` reads (Next inlines only literals); `appUrl` must parse as `https:` (or `http://localhost…`), else `https://rivalmonday.app`; `clientPriceUsd` = positive integer or 99; `isProduction` = `VERCEL_ENV === 'production'` (the one production helper; build/server only — not inlined client-side).
- `turbo.json` (2.11.5 `docs/reference/configuration.mdx` § `env`: `env` is hashed, passthrough is not): add `"@cs/site#build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**"], "env": ["NEXT_PUBLIC_*", "VERCEL_ENV"] }` so any changed site var (app URL, Turnstile key, socials, price, Sentry DSN, `VERCEL_ENV`) misses the cache (explicit, though Next.js framework inference adds `NEXT_PUBLIC_*`); nothing to `globalPassThroughEnv`. Add task `"lint": {}`.
- `layout.tsx`: `<html lang="en">`, `next/font/google` Inter (`400,500,600,800`, `swap`, `--font-inter`), imports `site.css`, which starts `@import "@cs/ui/styles.css"; @source "../../../../packages/ui/src";` then site tokens: `--text-display` (clamp 36→56 px), `--text-display-sub` (18–20 px), `--shadow-float` (one value), `--ring-change` (secondary-based outline for changed snapshot blocks), `.bg-grid-lines` (vertical 1px lines, 4 % ink, 120 px), `.hero-wash` (one radial primary/secondary gradient, `pointer-events:none`), a reduced-motion block (`animation`/`transition: none !important` on `*`). Body `bg-surface text-ink font-sans`; `.site-container` max 1560 px, 16 px phone gutter.

**Behaviour:**
- Boundary test (`import-boundary.test.ts`, node env): (1) `package.json` workspace deps (`workspace:*`) ⊆ `['@cs/ui']`; (2) every `.ts/.tsx/.mjs` under `apps/site/{src,content,scripts}` plus `next.config.ts` and `instrumentation-client.ts` (when it exists — Task 14 creates it): each import/require specifier starting `@cs/` is `@cs/ui` or `@cs/ui/styles.css`; (3) `process.env.X` only for `NEXT_PUBLIC_*`, `VERCEL_ENV`, `NODE_ENV`, plus `SENTRY_AUTH_TOKEN|SENTRY_ORG|SENTRY_PROJECT` in `next.config.ts` only (Task 14 source maps); (4) no `'server-only'` imports.
- `check-bundle.ts` (after `next build`): walk `.next` (`static/**`, `server/**/*.js`, `**/*.nft.json`); exit 1 listing offenders if any path or source text references `packages/(db|tools|worker|engine|ai|ask|billing|collectors|evals|mcp|storage|verticals|demo)/` or `packages/email/src/` other than `branding.ts`. From Task 2 on, also fail if `.next/prerender-manifest.json` lacks any route in `content/pages.ts` (static guarantee).
- `design-lint.sh`: add `SITE=apps/site/src` to `shadow-card`, `radius-14-2xl-xl`, `font-extrabold` (wordmark excluded), `hex-literals-tsx`, `bg-amber`, `shadow-sm-md-lg-xl`, `text-px-arbitrary`. `ALLOW_AMBER` gains two entries, each under a `# reason` line: `apps/site/src/components/**/friday-*.tsx` ("Friday identity is the orange pill (brand decision)") and `apps/site/src/components/home/pilot-pill.tsx` ("Pilot pill: the screen's one orange highlight, spec § 7.8"). No other site file uses `bg-amber`.
- `page.tsx` = placeholder heading until Task 10. `apps/site/CLAUDE.md` (boundary, no secrets, site-local tokens, prerender only; first line `@AGENTS.md`) + `AGENTS.md` (`apps/web/AGENTS.md`'s Next block).
- **Follow pattern:** `apps/web/next.config.ts`, `apps/web/vitest.config.ts` (no `globalSetup`; jsdom default, `// @vitest-environment node` for node tests), `packages/ui/vitest.setup.ts`.

**Tests (TDD):** `import-boundary.test.ts`: `only @cs/ui as a workspace dependency`; `no forbidden @cs import in any site source` (plant-a-bad-import sanity: the matcher flags `import x from '@cs/db'` in a string fixture); `reads only public env` (fixture: `SENTRY_AUTH_TOKEN` passes in `next.config.ts`, fails in any other file); `env.test.ts`: `appUrl falls back on a non-https value`, `clientPriceUsd defaults to 99`.
**Done when:** `pnpm install`; `pnpm --filter @cs/site exec vitest run`; `pnpm --filter @cs/site typecheck`; `pnpm --filter @cs/site build && pnpm --filter @cs/site check:bundle`; `bash scripts/design-lint.sh` = 0. Commit.

### Task 2: Security headers, metadata, robots, sitemap, page registry, 404
**Goal:** every response carries CSP + security headers; indexing foundation 17c extends.
**Files:** create `apps/site/src/lib/{headers.ts,headers.test.ts,metadata.ts,metadata.test.ts}`, `apps/site/content/{site.ts,pages.ts,pages.test.ts}`, `apps/site/src/app/{robots.ts,sitemap.ts,not-found.tsx}`, `apps/site/src/app/{robots,sitemap}.test.ts`; modify `apps/site/next.config.ts`, `apps/site/src/app/layout.tsx`.

**Interfaces:**
```ts
// content/site.ts
export const SITE_URL = 'https://rivalmonday.com';
export const SITE_NAME = 'Rival Monday';
export const TITLE_STEM = 'White-label competitor intelligence for agencies'; // spec § 3 eyebrow = SEO stem
// content/pages.ts
export interface SitePage { path: `/${string}`; title: string; description: string; nav?: { label: string; order: number }; sitemap: boolean; changeFrequency?: 'weekly' | 'monthly' | 'yearly'; priority?: number }
export const PAGES: readonly SitePage[]; // Task 2 registers only '/'; Task 12 adds '/sample-brief', '/how-it-works', '/privacy', '/terms' (a route is registered by the task that creates its page)
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
- `robots.ts`: production → `{ rules: [{ userAgent: '*', allow: '/' }], sitemap: SITE_URL + '/sitemap.xml', host: SITE_URL }`, else `disallow: '/'`; `robots`/`sitemap` both `dynamic = 'force-static'`.
- `sitemap.ts`: `PAGES.filter(p => p.sitemap)` → absolute URLs, `lastModified` = build time (Task 12's `/privacy`/`/terms` entries carry priority 0.3).
- `layout.tsx` `metadata`: `metadataBase: new URL(SITE_URL)`, `title: { default: 'Rival Monday — ' + TITLE_STEM, template: '%s · Rival Monday' }`, `robots` index only in production, `icon.svg` from `docs/brand` if present.
- `not-found.tsx`: "Page not found" (owner signs), links Home + Sample brief (`/sample-brief` exists from Task 12); it gets the site shell through `layout.tsx` once Task 6 adds it — no later task edits this file. HTTP 404 (no `loading.tsx` anywhere — apps/web gotcha).
- A `content/pages.test.ts`: every `PAGES` path has a `src/app/**/page.tsx`; titles ≤ 60, descriptions ≤ 155; every `NAV_EXTRA` href is a registered path or matches `/#[a-z-]+` (anchor existence is Task 3's test). Imports nothing from Task 3/12 files.
- **Follow pattern:** `apps/web/src/app/robots.ts`.

**Tests (TDD):** `headers.test.ts`: `csp allows only the app origin for connect`, `csp has frame-ancestors none and object-src none`, `no unsafe-eval in production`, `hsts and nosniff present`; `robots.test.ts`: `preview disallows all`, `production allows and points at the sitemap`; `sitemap.test.ts`: `lists only registered sitemap pages as absolute urls`; `metadata.test.ts`: `canonical is SITE_URL + path`, `title within 60`; `pages.test.ts`.
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
`content/home.ts` exports `HERO`, `ANNOUNCEMENT`, `SECTIONS` (id, eyebrow, heading, body), `HOME_ANCHORS = ['sample','live','how-it-works','checks','friday','real-sample','pricing','join'] as const` (final; owned here only — `join` = `CtaBand`), `COUNTER_LABELS` (`{ key, label, caption }` per counter). Popup strings are Task 7's `JOIN_COPY`. Copy below; **hero is decided (spec § 3, verbatim)**, the rest is drafted — **owner signs**:

- `HERO.eyebrowPill` "Pilot" · `HERO.eyebrow` "White-label competitor intelligence for agencies" · `HERO.headline` "Every Monday, your clients learn what their competitors did last week, under your brand." (the phrase "under your brand." gets the secondary colour, as the mockup) · `HERO.sub` "Rival Monday watches your clients' local rivals — websites, Google reviews, ads and map rankings — and turns it into an evidence-backed weekly brief, a dashboard and an AI assistant you sell as your own." · CTAs "Join the pilot" / "See a sample brief" · fine print "Free during the pilot · No card needed · Limited places".
- `ANNOUNCEMENT.lead` "Pilot now open for agencies serving local businesses" · rotating examples `['HVAC', 'plumbing', 'dental', 'roofing', 'med spas', 'law firms', 'landscaping', 'auto repair']` rendered "— like {x}" · link "Join the pilot →". (Examples are kinds of business, not claims of customers.)
- Sections (eyebrow · heading · body):
  - `sample` · "Sample brief" · "Click any claim to see the evidence behind it." · "This is a full Monday brief for a fictional heating and air business. Every line links to the snapshot, reviews or ads it came from. Move the slider to see how the map rankings changed week by week, or ask Friday."
  - `live` · "This week on Rival Monday" · "Real numbers from the platform, updated every few minutes." · (label · caption) "rival sites watched" · "Right now" (17a counts rivals currently watched, not a 7-day figure); "snapshots taken" · "Last 7 days"; "claims checked against evidence" · "Last 7 days"; "claims dropped for lack of evidence" · "Last 7 days". Band footnote "Rounded down."
  - `how-it-works` · "How it works" · "From client to Monday brief in four steps." · steps: 1 "Add a client" — "Enter the business and its service area. We find its Google listing." · 2 "We find the rivals" — "We search the area and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick." · 3 "We watch every week" — "Websites, Google reviews, ads and map rankings, checked on a schedule and saved as evidence." · 4 "Monday brief + alerts" — "Your client gets a short brief under your brand, with the evidence one click away. Big moves send an alert."
  - `checks` · "How we check every claim" · "No evidence, no claim." · "Every sentence in a brief starts from something we captured: a page snapshot, a review, an ad, a ranking. Before a brief goes out, a separate check compares each claim with its evidence. Anything it can't back up is dropped, not softened." · link "Read how we check claims →" (`/how-it-works`).
  - `friday` · "Friday, your clients' assistant" · "Ask about any rival. Every answer shows its sources." · "Friday answers from the same evidence as the brief, with the sources inline. It's included under your brand, in the dashboard and for AI tools that support MCP."
  - `real-sample` · "A real sample for your client" · "See one of your own clients before you commit." · "Tick "Send me a real sample brief" when you join. We build a starting-point brief for one of your clients from public information and email you a private link. Free during the pilot, a limited number each month."
  - `pricing` · "Pricing" · "Free during the pilot." · agency line "Agencies: then $229/mo including 3 client seats, $99 per extra seat, with a 30-day trial." · business line "Local businesses: then ${PRICING.business.monthlyUsd}/mo." · note "You set your own prices for your clients and bill them in your name."
  - footer CTA card: "Join the pilot" heading · "Places are limited while we work closely with each agency." · button "Join the pilot".
- `content/how-it-works.ts` (owner signs): title "How we check every claim"; one plain-English paragraph (≤ 80 words) per section, drafted from: "1. We capture the evidence" (snapshots with date + URL; reviews and ads as they appeared; rankings from a grid across the service area), "2. We write only from the evidence" (model sees captured changes, never the open web; each sentence names its source), "3. A second check reads every claim" (separate verifier; below the bar dropped; uncertain → a person), "4. You can always click through" (brief, dashboard and Friday link to evidence), "What we don't do" (no guesses about private data, no unsourced claims, no evading website rules: we identify our crawler, respect robots.txt).

**Behaviour:** numbers in copy only via `PRICING`; headlines ≤ 90 chars; banned: `/nobody else|only platform|#1|best-in-class|guarantee/i`, `/DataForSEO|Apify|ScrapeCreators|Stadia/`.
**Tests (TDD):** `content.test.ts`: `hero matches the decided copy`, `no digits in copy outside PRICING and an explicit allowlist` (walk every exported string; strip the rendered `PRICING` values, leading `N. ` numbering and the allowlisted literals — "Last 7 days" (17a's window) — then `/\d/` must not match), `no banned claims or vendor names`, `every NAV_EXTRA /#id is in HOME_ANCHORS`. (Founder visibility: Task 11.)
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 4: Fictional renamer + guard (`@cs/demo`)
**Goal:** a pure, tested renamer that makes the demo world fictional and a guard that refuses leaks.
**Files:** create `packages/demo/src/site-export/{rename.ts,rename.test.ts,types.ts}`.

**Interfaces + full code (non-obvious algorithm):**
```ts
// rename.ts
export interface RenameSources { client: string; businesses: string[]; places: string[]; domains: string[] }
export interface Renamer { apply(text: string): string; terms: ReadonlyMap<string, string> }

/** Owner signs. Odd compounds so no reader mistakes them for a real business or town. Names are DERIVED
 *  (stem × tail, 24 × 5 = 120 per kind), so the pool cannot run out on a bigger demo world. */
export const FICTIONAL = {
  client: 'Northwind Heating & Air',
  state: 'Westmarch', stateCode: 'WM',
  stems: ['Copperleaf', 'Bluejay', 'Kestrel', 'Summitpine', 'Owlbrook', 'Fernhollow', 'Larkspur', 'Tidewell', 'Quillstone', 'Marigold', 'Brightkettle', 'Juniperwell',
    'Hollowbrook', 'Saffronfield', 'Cobaltcreek', 'Wrenhaven', 'Amberglen', 'Ploverline', 'Mossgate', 'Thistledown', 'Heronmoor', 'Lindenvale', 'Sorrelby', 'Teaselwick'],
  businessTails: ['Comfort Co', 'Air Works', 'Mechanical', 'Climate Pros', 'Home Services'],
  placeStems: ['Lark', 'Quill', 'Briar', 'Wren', 'Amber', 'Tide', 'Fenn', 'Owls', 'Marlowe', 'Cobble', 'Juniper', 'Saffron',
    'Plover', 'Moss', 'Kettle', 'Thistle', 'Harrow', 'Fallow', 'Brindle', 'Gorse', 'Heron', 'Linden', 'Sorrel', 'Teasel'],
  placeTails: ['haven', 'more', 'field', 'mere', 'bury'],
} as const;
/** Explicit state rule: Texas words are never pool places. ", TX"/", Texas" after a place is dropped in `apply`; bare words map here. */
export const STATE_TERMS: Readonly<Record<string, string>> = { 'North Texas': `North ${FICTIONAL.state}`, Texas: FICTIONAL.state, TX: FICTIONAL.stateCode };

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchCase = (found: string, repl: string) => (found === found.toLowerCase() ? repl.toLowerCase() : repl);
const derive = (stems: readonly string[], tails: readonly string[], sep: string, i: number, kind: string) => {
  if (i >= stems.length * tails.length) throw new Error(`rename: more than ${stems.length * tails.length} ${kind}`);
  return `${stems[i % stems.length]}${sep}${tails[Math.floor(i / stems.length)]}`;
};

export function buildRenamer(src: RenameSources): Renamer {
  const terms = new Map<string, string>();
  const assign = (from: readonly string[], name: (i: number) => string) => {
    const uniq = [...new Set(from.map((s) => s.trim()).filter(Boolean))].filter((s) => !terms.has(s)).sort();
    uniq.forEach((s, i) => terms.set(s, name(i)));
  };
  terms.set(src.client, FICTIONAL.client);
  for (const [k, v] of Object.entries(STATE_TERMS)) terms.set(k, v);
  assign(src.businesses, (i) => derive(FICTIONAL.stems, FICTIONAL.businessTails, ' ', i, 'businesses'));
  assign(src.places, (i) => derive(FICTIONAL.placeStems, FICTIONAL.placeTails, '', i, 'places'));
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
    apply: (text) => text.replace(/,\s?(?:TX|Texas)\b/g, '') // "Granbury, TX 76048" -> "Granbury 76048" before renaming
      .replace(re, (m) => matchCase(m, lower.get(m.toLowerCase())!))
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
    if (PHONE.test(value.replaceAll('(555) 010-0100', ''))) hits.push({ path, reason: 'phone' }); // a real phone beside the placeholder still fails
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
**Tests (TDD)** (`rename.test.ts`, no DB): `longest term wins` ("Lake Granbury Heating & Air" → one business name); `lowercase keyword keeps lowercase` ("ac repair granbury" → "ac repair larkhaven"); `replacements are not re-scanned`; `domain follows its business`; `phones and ZIPs replaced`; `30 businesses and 30 places get unique stable names` (same input → same output; 120 per kind, the 121st throws); `state rule` ("Granbury, TX 76048" → "<place> 00000", "Texas"/"North Texas"/"tx" → Westmarch forms; guard on the result `[]`); `throws on a collision`; `guard flags a surviving term, uuid, email, phone (also beside the placeholder), street, state and unknown domain` (one fixture each, path reported); `guard passes clean fictional output`.
**Done when:** `cd packages/demo && npx vitest run src/site-export/rename.test.ts`; `pnpm --filter @cs/demo typecheck`; commit (`git commit -- <the task's Files>`).

### Task 5: Exporters — sample brief and verticals (committed JSON)
**Goal:** two `@cs/demo` exporters write the site's committed JSON.
**Files:** create `packages/demo/src/site-export/{sample-brief.ts,sample-brief.test.ts,verticals.ts}`, `packages/demo/src/cli/{export-sample-brief.ts,export-site-verticals.ts}`, `apps/site/content/{sample-brief.json,verticals.json}`; modify `packages/demo/package.json`.

**Interfaces:**
```ts
export async function collectSampleBrief(db: Db, store: ObjectStore, clientName = 'Lone Star Cooling'): Promise<{ raw: SampleBriefData; sources: RenameSources }>;
export function finalizeSampleBrief(raw: SampleBriefData, sources: RenameSources): SampleBriefData; // rebuild every object field by field from the SampleBriefData keys (unknown keys such as upsell_tag drop by construction), rename every string, re-key ids, then guard; throws listing GuardHit[]
export async function exportSiteVerticals(db: Db): Promise<{ id: string; name: string }[]>; // status 'reviewed', merged_into IS NULL, id <> 'generic', name-sorted
```
**Behaviour:**
- CLI `export-sample-brief`: `loadRepoEnv()`, `resolveEnvironment('demo', …)` (fs `ObjectStore` as `reset.ts` builds it), collect → finalize → write `apps/site/content/sample-brief.json` (2-space, LF, trailing newline); on guard hits print `path reason` lines (never the text), exit 1, write nothing. CLI `export-site-verticals`: `resolveEnvironment('dev')` → `verticals.json`. Both print only counts.
- Collect (read-only service-role SQL; table names as in `packages/demo/src/{briefs,changes,reviews,ads,rankings}.ts`): latest `approved|sent` brief; its `active` items in `ord` (max 6) **without `upsell_tag`**; rivals = tracked competitors + tier; per item `evidence_ids` → `text` evidence (before/after → `before[]`/`after[]`, `changed` = first differing index; skip `screenshot`/`html`); reviews items → ≤ 5 `review` rows of that competitor in the window (`rating`, date, `text`, author "Reviewer A–E"); ad items → the `ad` row (`title`, `text`, `platform`, `started_at`); rank grid = 12 latest `done` scans of `client.keywords[0]`, per cell the self rank (result title matches the client, else null) and the top result's rival id; one `rank` evidence per week ("top 3 in N of 49 points").
- Ids re-keyed `r1…`/`i1…`/`e1…`, every reference rewritten; `business.area` = renamed city; `vertical` "Heating & air"; `weekOf` = `period_end`.
- `sources`: client + every competitor name (tracked rows **and** every distinct rank-result title); places = `DEMO_PLACES` (towns only: Granbury, Lake Granbury, Acton, Tolar, Lipan, Stephenville, Cleburne, Glen Rose, Weatherford, Hood County, Brazos, Brazos Valley, Pecan Plantation, Comanche Peak, Stockton Bend, Paluxy, Hill Country, Lone Star, Twin Oaks, Cedar Creek, Lake Country; Texas/TX/North Texas are `STATE_TERMS`, Task 4), domains = every `competitor.domain`. Guard deny list = all sources + `Object.keys(STATE_TERMS)` + `['Brazos Digital', 'cs_demo']`; `allowDomains` = the renamer's `.example` values (fictional slugs + `rival-N.example`).
- **Follow pattern:** `packages/demo/src/cli/links.ts`, `packages/demo/src/reset.ts`.

**Tests (TDD)** (`sample-brief.test.ts`, no DB — fixture `raw` + `sources` objects): `finalize renames every string and re-keys ids consistently`; `finalize outputs only SampleBriefData keys` (fixture items/evidence/rivals carry `upsell_tag`, `place_id`, `reviewer_hash`, an extra nested key; deep-walk the output: every object's key set equals the schema's key list for that level); `finalize throws with hit paths when a term survives` (fixture text holds `Brazos Digital`, which is deny-listed but not a rename source); `committed json passes the guard` (`guard(json, DEMO_PLACES + STATE_TERMS keys + FILLER_BUSINESSES + CLIENT_SPECS names, the JSON's own fictional-slug/`rival-N` `.example` domains)` → `[]`); `committed verticals are id/name pairs, sorted, no generic`.
**Done when:** demo seeded → `pnpm --filter @cs/demo export:sample-brief` and `export:site-verticals` succeed; focused vitest green; eyeball the JSON (names fictional, ≥ 4 items with evidence, 12 weeks); commit both JSON files with the code.

### Task 6: Site shell — announcement bar, nav, footer, site-status, pilot context
**Goal:** the frame every page shares, and the one client-side status read.
**Files:** create `apps/site/src/components/shell/{site-header.tsx,announcement-bar.tsx,mobile-menu.tsx,site-footer.tsx,social-links.tsx,shell.test.tsx}`, `apps/site/src/lib/{site-status.ts,site-status.test.ts}`, `apps/site/src/components/shell/pilot-context.tsx`, `apps/site/src/components/join/{join-provider.tsx,join-button.tsx}` (skeleton; Task 7 mounts the dialog); modify `apps/site/src/app/layout.tsx` (`PilotProvider` > `JoinProvider` > shell).

**Interfaces:**
```ts
// lib/site-status.ts — mirrors @cs/tools SiteStatus (17a); never imported from there (boundary)
export const siteStatusSchema = z.object({ pilotMode: z.boolean(), counters: z.object({ rivalSitesWatched: z.number().int().nonnegative().nullable(), snapshotsThisWeek: …, claimsChecked: …, claimsDropped: … }).nullable() });
export type SiteStatus = z.infer<typeof siteStatusSchema>;
export async function fetchSiteStatus(appUrl: string, signal?: AbortSignal): Promise<SiteStatus | null>; // GET `${appUrl}/api/site-status`, credentials 'omit', 5 s timeout; parse failure/network → null
// components/shell/pilot-context.tsx ('use client')
export function PilotProvider({ children }: { children: React.ReactNode }): JSX.Element; // fetches once on mount
export function usePilot(): { pilotMode: boolean; status: SiteStatus | null; loaded: boolean }; // pilotMode = status && status.counters !== null ? status.pilotMode : true (P6: degraded 17a answer keeps pilot)
// components/join/join-provider.tsx ('use client') — Task 6 skeleton: holds { open, start } state, renders children only
export type JoinStart = 'choose' | 'agency' | 'agency-sample' | 'business';
export function JoinProvider({ children }: { children: React.ReactNode }): JSX.Element; export function useJoin(): { open(start?: JoinStart): void; isOpen: boolean; start: JoinStart; close(): void };
// components/join/join-button.tsx ('use client') — final in Task 6
export function JoinButton({ start, children, variant }: { start?: JoinStart; children?: React.ReactNode; variant?: 'primary' | 'ghost' }): JSX.Element; // pilot: button → open(start); pilot off and start ≠ 'business': link <APP_URL>/sign-up "Start your free trial"
```
**Behaviour:**
- Header: `Wordmark` (→ `/`), nav = `PAGES` with `nav` + `NAV_EXTRA` by order, "Sign in" (ghost, `<APP_URL>/sign-in`), `JoinButton`. ≤ 1023 px: `Sheet` menu (`aria-expanded`, focus trap, Esc). Sticky header gets `shadow-overlay` only once scrolled.
- Announcement bar (pilot only): lead + example rotating every 3 s (pause on hover/focus; **static first example under reduced motion**; `aria-live="off"`) + "Join the pilot →".
- Footer: columns from registered `PAGES` only (Product: How it works, Sample brief; Legal: Privacy, Terms — from Task 12), social links only for set `NEXT_PUBLIC_SOCIAL_*` (`rel="me noopener"`, `_blank`, `aria-label` "Rival Monday on LinkedIn" etc., generic lucide glyphs), footer CTA card (Task 3), "© {year} Rival Monday".
- Pilot off: bar hidden, header CTA "Start your free trial" → `<APP_URL>/sign-up` (owner signs; via `JoinButton`, the only place this switch lives), plus footer link "Own a local business? Join the waitlist" (`JoinButton start="business"`).
- **Follow pattern:** DS L-shell rules; `@cs/ui` `Sheet`, `Button`, `Wordmark`.

**Tests (TDD):** `site-status.test.ts`: `parses the 17a shape`, `returns null on a bad body, non-2xx or network error`, `sends no credentials`; `shell.test.tsx`: `nav shows only registered pages` (no Integrations/Compare/Partners in 17b), `social link renders only when its env is set`, `pilot off swaps the CTA to sign-up and hides the bar`, `degraded answer keeps pilot state` (`{pilotMode:false, counters:null}` → Join CTA + bar stay), `business waitlist link calls open('business') with pilot off` (spy on `useJoin`), `rotation is static under reduced motion` (mock `matchMedia`).
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 7: Join popup — steps, fields, body builder, contract test
**Goal:** the two-step popup collecting exactly the spec § 5 fields and building a schema-valid body.
**Files:** create `apps/site/src/components/join/{copy.ts,join-dialog.tsx,step-choose.tsx,step-agency.tsx,step-business.tsx,join-dialog.test.tsx}`, `apps/site/src/lib/{waitlist-body.ts,waitlist-body.test.ts}`, `packages/tools/src/waitlist/site-contract.test.ts`; modify `apps/site/src/components/join/join-provider.tsx` (mount `JoinDialog`; `#join`/`?join=business` on mount and `hashchange`), `packages/tools/src/waitlist/public.ts` (17a file: `const LINKISH` → `export const LINKISH`, nothing else).

**Interfaces:**
```ts
// lib/waitlist-body.ts — only zod imported (the tools contract test imports this file by relative path)
export const CLIENT_BANDS = [{ value: '1-5', label: '1–5' }, { value: '6-15', label: '6–15' }, { value: '16-50', label: '16–50' }, { value: '50+', label: '50+' }] as const;
export type AgencyForm = { contactName: string; email: string; orgName: string; website: string; clientCountBand: '' | (typeof CLIENT_BANDS)[number]['value']; wantsSample: boolean; sampleBusinessName: string; sampleWebsite: string; sampleLocation: string };
export type BusinessForm = { contactName: string; email: string; orgName: string; website: string; location: string; vertical: string /* id | 'other' | '' */; verticalOther: string };
export type FieldErrors = Partial<Record<string, string>>;
/** Hand mirror of @cs/tools waitlist/public.ts (boundary); site-contract.test.ts asserts identical source/flags + parity fixtures. */
export const LINKISH = /:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}(\/|\b)/i;
export const FIELD_MAX = { contactName: 120, orgName: 120, location: 120, sampleBusinessName: 120, website: 253, email: 254, verticalOther: 80 } as const; // = server .max()
export function validateAgency(f: AgencyForm): FieldErrors;  // required: contactName, email, orgName, clientCountBand; sample: businessName + (website | location)
export function validateBusiness(f: BusinessForm): FieldErrors; // required: contactName, email, orgName, website|location, vertical (+ verticalOther when 'other')
export function buildWaitlistBody(f: { kind: 'agency'; form: AgencyForm } | { kind: 'business'; form: BusinessForm }, turnstileToken: string, source: string | null): Record<string, unknown>;
export function sourceFrom(loc: { search: string; pathname: string }, referrer: string): string | null; // P17
```
Validators mirror the server exactly: trimmed lengths ≤ `FIELD_MAX` (inputs also carry `maxLength`); email via zod 4 `z.string().trim().max(254).email()` (same primitive as the server); `LINKISH` checked on `contactName` and `sampleBusinessName` only (the server's `plainName` fields).
`buildWaitlistBody` trims every string, omits empty optionals (never `""`), lower-cases nothing (server does), sends the agency sample only when `wantsSample`, and `verticalId` (catalogue id) or `verticalOther` ("other").

**Copy (owner signs; spec § 5 lines verbatim where given) — all in `components/join/copy.ts` as `JOIN_COPY`:**
- Step 1: "Step 1 of 2" · title "Join the Rival Monday pilot" · sub "Tell us who you are — we'll send you an invite as places open." · options **"I run an agency"** — "Resell Rival Monday to your clients under your own brand. Free during the pilot, then $229/mo incl. 3 client seats." · **"I own a local business"** — "Get a weekly brief on what your competitors are doing. Free during the pilot, then ${PRICING.business.monthlyUsd}/mo." · foot "Takes 30 seconds" · "Continue".
- Step 2 agency: "Step 2 of 2 · Agency" · "About your agency" · "We'll email you when your pilot place is ready." · labels "Your name", "Work email", "Agency name", "Website (optional)", "Local-business clients" (band select) · checkbox "Send me a real sample brief for one of my clients" → "Client business name", "Client website", "or city / ZIP", hint "One of the two is enough." · submit "Join the waitlist" · fine "Protected by Cloudflare Turnstile. We only use this to contact you about the pilot."
- Step 2 business: "Step 2 of 2 · Local business" · "About your business" · "We'll email you when we can start watching your competitors." · "Your name", "Email", "Business name", "Website", "or city / ZIP", "Type of business" (select from `verticals.json` + "Other…" → "Describe your business") · submit "Join the waitlist".
- Errors: "Enter your name." · "Enter a valid email address." · "Enter the {agency|business} name." · "Pick how many local-business clients you have." · "Add a website or a city / ZIP." · "Pick a type of business, or choose Other." · "Please leave web addresses out of this field." (link-ish name) · "Keep this under {n} characters."
- Done (spec § 5): "You're on the list. We've emailed you a confirmation." + draft second line "Click the link in that email to confirm your address." · button "Close".

**Behaviour:** `@cs/ui` `Dialog` (phone: `ResponsivePopover` pattern if it fits, else `max-h-dvh overflow-y-auto`); "Back" keeps values; controlled fields with `onReset={e => e.preventDefault()}` (React 19 gotcha); inline `Field` errors, focus to the first invalid field; with pilot off step 1's agency option is the `<APP_URL>/sign-up` link (P6; `JoinButton` itself is Task 6's). `location.hash === '#join'` or `?join=business` opens on mount and on `hashchange` (P17).
**Tests (TDD):** `waitlist-body.test.ts`: `agency body has kind, band and no sample when unticked`, `sample needs website or location`, `business sends verticalId or verticalOther, never both`, `empty optionals are omitted`, `sourceFrom prefers utm_source, then referrer host, then path, ≤ 200`, `link-ish contact or sample name gets the web-address message`, `over-long field gets the length message`, `email the server refuses is refused here`; `join-dialog.test.tsx`: `step 1 → agency shows the agency fields`, `back keeps typed values`, `errors appear inline and focus the first`, `#join opens the dialog`, `pilot off makes the agency choice a sign-up link`; `site-contract.test.ts` (tools, no DB): for 5 fixture forms, `waitlistSubmitSchema.safeParse(buildWaitlistBody(...)).success === true`; `CLIENT_BANDS` values equal `@cs/db` `CLIENT_COUNT_BANDS`; `LINKISH mirror matches` (site `LINKISH.source`/`.flags` === tools `LINKISH`, and for fixtures `https://x.co`, `www.acme`, `acme.com`, `J.Smith`, `St. Louis Heating`, `A.C. Heating`, `Jane Doe` both regexes agree); `validators agree with the schema` (for each fixture form + boundary lengths 120/121, 253/254: `validate*` has no errors ⇔ `safeParse` succeeds).
**Follow pattern:** `apps/web/src/app/sign-up/sign-up-form.tsx`, `apps/web/src/app/start/intake-form.tsx`.
**Done when:** `pnpm --filter @cs/site exec vitest run src/lib/waitlist-body src/components/join`; `cd packages/tools && npx vitest run src/waitlist/site-contract.test.ts` (no DB use, but global setup touches the test DB — only when no other run uses it); commit (`git commit -- <the task's Files>`).

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
`TurnstileWidget({ siteKey, onToken, resetKey })` (`'use client'`): `<div ref>`; on mount `loadTurnstile()` then `window.turnstile.render(el, { sitekey: siteKey, action: 'waitlist', appearance: 'interaction-only', callback: onToken, 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null) })`; `remove(id)` on unmount; `reset(id)` + `onToken(null)` on `resetKey` change; no `siteKey` → nothing rendered, token `'no-widget'` (P8).

**Behaviour:**
- Submit: validate → key set but no token yet → "Still checking, try again in a moment." (widget is `interaction-only`) and stop → button `aria-busy` → `buildWaitlistBody` → `submitWaitlist` → **always** bump `resetKey` (single-use token) → `ok` → done state (uniform for new/duplicate/rate-limited); `check` → "The check didn't go through. Please try it again."; `invalid` → "Please check the details above." (re-run validation); `unavailable` → "We couldn't send this just now. Please try again in a minute, or email support@rivalmonday.app." (owner signs all four).
- Never `console.*` body or fields; Sentry gets no form data; in-flight ref blocks double submit.
**Tests (TDD):** `waitlist-submit.test.ts` (fake `fetch`): `posts json to <app>/api/waitlist with credentials omit and only content-type`, `200 ok → ok`, `200 without ok:true → unavailable`, `400 check → check`, `400 invalid → invalid`, `403 → unavailable`, `network error → unavailable`, `oversize body refused before fetch`; `turnstile-widget.test.tsx` (stub `window.turnstile`): `renders explicitly with the site key and action`, `token null on expiry`, `reset on resetKey change`, `removes on unmount`, `no key → renders nothing`, `loadTurnstile appends the script once for concurrent calls`, `loadTurnstile retries after a load error or timeout` (fake timers); `join-dialog.test.tsx` additions: `submit blocked until a token when a key is set`, `token reset after every attempt`, `duplicate and new both show the done state`, `nothing logged` (spy on console).
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 9: Interactive sample brief component
**Goal:** the clickable brief that runs entirely in the browser.
**Files:** create `apps/site/src/sample/{schema.ts,schema.test.ts}`, `apps/site/src/components/sample/{sample-brief.tsx,brief-items.tsx,evidence-panel.tsx,snapshot-view.tsx,reviews-view.tsx,ad-view.tsx,rank-grid.tsx,friday-panel.tsx,sample-brief.test.tsx}`, `apps/site/content/{sample-friday.ts,sample-friday.test.ts}`; modify `apps/site/src/app/site.css` (rank tokens).

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
- Layout: `Frame`, header "Monday brief · {business.name}", `Tag` "Week of {weekOf}", **visible "Sample data" chip** + caption "All businesses, people and places are fictional." (owner signs); DS feed rows (rival, headline, what changed, why it matters, action, `CitationPill`s); a claim or pill opens `EvidencePanel` (`@cs/ui` `Sheet`, right on desktop, bottom on phone, no slide under reduced motion; title "Website snapshot · {url}" / "Google reviews · {count} new" / "Ad · Google|Meta Ad Library" / "Map rankings · week of …"; Esc + close; focus returns to the trigger).
- `SnapshotView`: page mock, `before`/`after` `Segmented`, changed block outlined with `--ring-change` (not orange), "captured {date}". `ReviewsView`: stars (`aria-label` "{n} out of 5"), initials, date. `AdView`: copy + first seen.
- `RankGrid`: 7×7 cells (`size`) coloured by rank bucket (1–3 / 4–10 / 11–20 / not found) using the palette copied from `apps/web/src/components/charts/geo-grid.tsx` into `site.css` `@theme` as `--color-rank-top3|top10|top20|none` (+ `…-ink` text colours) so components use `bg-rank-top3`/`text-rank-top3-ink`; hex lives only in `site.css` (dataviz skill; each cell shows its number + legend), a range slider ("Week", `aria-valuetext` "Week of …"), caption "Top 3 in N of 49 points" from data, the week's leader. No map tiles (P3).
- `FridayPanel`: `FridayBadge` (the site's only Friday orange) + 3–4 question buttons; an answer types in (instant under reduced motion) with `CitationPill`s opening `EvidencePanel`; label "Canned answers from the sample data". No input, no network.
- `compact`: first 3 items, no rank grid; full on `/sample-brief` and the home `sample` section.
- **Follow pattern:** `apps/web/src/components/views/brief-view.tsx`, `evidence-chips.tsx`, `charts/geo-grid.tsx`.
**Tests (TDD):** `schema.test.ts`: `committed sample-brief.json parses`, `every evidenceId referenced exists`, `≥ 4 items, 12 weeks, size² cells per week`, `label is Sample data`, `no deny-listed real place` (site-local list: Granbury, Texas, TX, Acton, Cleburne, Stephenville, Weatherford, Brazos, Lone Star, Hood County — second line of defence); `sample-friday.test.ts`: `every cite exists in SAMPLE.evidence`, **`friday answers cite every figure`** (tokenise whole numbers with `/\d+(?:[.,]\d+)*/g` on both sides; every number token in an answer part must equal a number token of its cited evidence or of the item that cites it — token equality, never substring; parts with numbers must have a `cite`; sanity fixture: "3 new reviews" against evidence holding only "13" fails); `sample-brief.test.tsx`: `clicking a claim opens its evidence`, `Esc closes and returns focus`, `slider changes the grid and caption`, `friday question reveals a cited answer`, `Sample data label is visible`, `reduced motion shows the answer at once`.
**Done when:** focused vitest green; commit (`git commit -- <the task's Files>`).

### Task 10: Home page — hero and product fragments
**Goal:** the first screen: bar, nav, hero copy, CTAs, floating fragments.
**Files:** create `apps/site/src/components/home/{hero.tsx,pilot-pill.tsx,hero-fragments.tsx,hero.test.tsx}`; modify `apps/site/src/app/page.tsx`.

**Behaviour:**
- Per the approved mockup (`.superpowers/brainstorm/27796-1793230191/content/hero-and-signup.html`): left = eyebrow (`PilotPill`: `bg-amber` "Pilot", the screen's one orange highlight besides Friday, hidden with pilot off) + eyebrow text, `h1` at `--text-display` Inter 600 (−0.035em), "under your brand." in `text-secondary`, sub, CTAs (`JoinButton`; ghost "See a sample brief" → `#sample`), fine print. Right = `HeroFragments`, three offset `shadow-float` fragments: (1) `SAMPLE.items[0..2]` headlines + pills (you/rival chart-role dots), (2) the first `snapshot`'s changed block (`--ring-change`) + URL + date, (3) `FridayBadge` + `FRIDAY_ANSWERS[0]` question + first part + "{n} sources" (P5). No other orange in hero or bar. Fragments `aria-hidden`, one visually hidden summary ("Preview of a sample Monday brief"), link to `#sample`.
- `.bg-grid-lines` + one `.hero-wash`. ≤ 1023 px: one column, fragments below, never wider than the viewport. Optional ≤ 400 ms float-in, never under reduced motion.
- `page.tsx` metadata via `pageMetadata('/')`; sections render in order `hero → sample → live → how-it-works → checks → friday → real-sample → founder → pricing → footer CTA` (Task 11 fills them).
**Tests (TDD):** `hero.test.tsx`: `renders the decided headline, eyebrow and sub exactly`, `fragments show data from SAMPLE and FRIDAY_ANSWERS` (headline text present), `secondary CTA targets #sample`, `exactly one h1`, `pilot pill hides when pilot is off`.
**Done when:** focused vitest green; `pnpm --filter @cs/site build`; `bash scripts/design-lint.sh` = 0; commit (`git commit -- <the task's Files>`).

### Task 11: Home sections — sample, counters, how it works, checks hub, Friday row, real sample, founder, pricing teaser, footer CTA
**Goal:** the rest of the home page.
**Files:** create `apps/site/src/components/home/{section-heading.tsx,live-counters.tsx,steps.tsx,checks-hub.tsx,friday-row.tsx,real-sample.tsx,founder-note.tsx,pricing-teaser.tsx,cta-band.tsx,sections.test.tsx}`; modify `apps/site/src/app/page.tsx`.

**Behaviour:**
- `SectionHeading`: eyebrow (small, `text-secondary`, sentence case) + `h2` + body; section `id` from `HOME_ANCHORS`, `scroll-margin-top`.
- `sample`: `<SampleBrief />` (full).
- `LiveCounters` (`'use client'`, `usePilot().status`): one `KpiStrip`-style band with the four `COUNTER_LABELS`; a `null` counter is omitted; the whole section renders nothing while loading, on `counters: null` or when all are null (no skeleton; below the fold). Numbers via `Intl.NumberFormat('en-US')` with a "+" suffix ("1,200+") because 17a rounds down; each figure shows its own `COUNTER_LABELS` caption ("Right now" for rival sites watched, "Last 7 days" for the other three) and the band ends "Rounded down." (Task 3).
- `Steps`: 4-step numbered stepper (horizontal ≥ 1024, vertical below) from `how-it-works` copy.
- `ChecksHub`: inline SVG — centre "Monday brief" + "Verifying…" chip (no pulse under reduced motion), five source tiles (Competitor websites, Google reviews, Google Business Profile, Meta Ad Library, Local map rankings; lucide icons, no logos), arrow to "No evidence, no claim"; `role="img"` + `aria-label`; `--chart-grid`/`--line` strokes; phones get a vertical list.
- `FridayRow`: copy left; right a rivals table (`SAMPLE.rivals` + `TierMark`) with a docked **non-interactive** Ask box showing `FRIDAY_ANSWERS[1]`, pills open `EvidencePanel`.
- `RealSample`: copy + "Request a real sample" button → `JoinButton start="agency-sample"` (agency step, sample box ticked; already supported by Tasks 6/7).
- `FounderNote`: renders only when `FOUNDER_NOTE` is non-null (photo via `next/image` from `public/`, or initials avatar).
- `PricingTeaser` (`id="pricing"`): two plain columns from `PRICING` + note, no cards; "Join the pilot" CTA.
- `CtaBand` (`id="join"` on the home page; `id` prop so sub-pages omit it): centred line over faint fragment echoes (decorative, `aria-hidden`), one primary button.
- Integrations strip is 17c; leave no slot. **Follow pattern:** `@cs/ui` `KpiStrip`, `TierMark`, `HairlineGrid`.
**Tests (TDD):** `sections.test.tsx`: `counters hide a null value`, `counters render nothing when counters is null or all null`, `counters format 1200 as 1,200+`, `each counter shows its own caption` (rivals "Right now", never "Last 7 days"), `founder note renders nothing for null and the note for a fixture` (prop-injected), `pricing teaser shows 229, 3 seats, 99 from PRICING`, `real sample button opens the popup with the sample ticked`, `checks hub has an accessible name`, `section ids match HOME_ANCHORS` (render the home page with counters present: the set of rendered section ids equals `HOME_ANCHORS`; with `counters: null` it equals `HOME_ANCHORS` minus `live`).
**Done when:** focused vitest green; `pnpm --filter @cs/site build`; `bash scripts/design-lint.sh` = 0; commit (`git commit -- <the task's Files>`).

### Task 12: `/sample-brief`, `/how-it-works`, `/privacy`, `/terms`, placeholder gate
**Goal:** the remaining 17b pages.
**Files:** create `apps/site/src/app/{sample-brief,how-it-works,privacy,terms}/page.tsx`, `apps/site/src/components/legal/{legal-page.tsx,legal-page.test.tsx}`, `apps/site/content/legal/{privacy.md,terms.md}`, `apps/site/scripts/check-placeholders.ts`, `apps/site/scripts/check-placeholders.test.ts`; modify `apps/site/content/pages.ts` (register the four routes: titles/descriptions, `nav` for How it works + Sample brief, `/privacy`+`/terms` `priority: 0.3`), `apps/site/package.json` (`check:placeholders`: `tsx scripts/check-placeholders.ts`).

**Behaviour:**
- `/sample-brief`: eyebrow "Sample brief", h1 "A Monday brief, start to finish", line "Fictional business, real product. Click any claim to see its evidence." (owner signs), full `<SampleBrief />`, CTA band; `PAGES` title "Sample Monday brief" (OG via `pageMetadata`).
- `/how-it-works`: reading column (≤ 720 px) from `content/how-it-works.ts`, `ChecksHub` once, CTA band.
- `/privacy`, `/terms`: `LegalPage` reads `content/legal/<name>.md` at build time (`fs.readFile` + `path.join(process.cwd(), 'content/legal', …)`, never `new URL(…, import.meta.url)` — Turbopack) and renders with react-markdown `skipHtml`, headings re-levelled under the page `h1`, "Last updated {date}" from the first line matching `^Last updated: (\d{4}-\d{2}-\d{2})$` (the line after the placeholder comment; removed from the body). **Follow pattern:** `apps/web` help guide rendering. Drafts: top line `<!-- OWNER-PLACEHOLDER: replace with counsel-reviewed text -->` + short honest outline (privacy: what the form collects — name, email, organisation, website or city/ZIP, business type, client band; why — pilot contact; processors by role, not vendors — hosting, email, bot check, error monitoring, cookieless analytics; no site cookies; support@rivalmonday.app. Terms: free pilot that may change, no warranty, acceptable use).
- `check-placeholders.ts`: scans `apps/site/content/**` and `apps/site/src/**` (excluding tests and this script) for `OWNER-PLACEHOLDER`; prints file:line, exits 1 if any. Wired into `deploy-site` (Task 14), not `build` (previews must still build).
**Tests (TDD):** `legal-page.test.tsx`: `renders the markdown with one h1`, `raw html is not rendered`; `check-placeholders.test.ts`: `finds a marker and fails`, `passes a clean tree` (temp dir fixtures); `pages.test.ts` (Task 2) covers all five routes; `sitemap.test.ts` still green.
**Done when:** focused vitest green; `pnpm --filter @cs/site build && pnpm --filter @cs/site check:bundle`; commit (`git commit -- <the task's Files>`).

### Task 13: Site E2E smoke (Playwright, no DB)
**Goal:** prove the built site works in a browser: popup, sample brief, headers, phone width.
**Files:** create `apps/site/playwright.config.ts`, `apps/site/e2e/site.spec.ts`; modify `apps/site/package.json` (`e2e`: `playwright test`).

**Interfaces:** `testDir ./e2e`, `workers: 1`, `webServer.command` = `pnpm build && pnpm start --port 3200` (`E2E_SKIP_BUILD=1` skips build), env `NEXT_PUBLIC_APP_URL=https://app.e2e.test` (https: the CSP's `upgrade-insecure-requests` would upgrade an http fetch past the mock), `NEXT_PUBLIC_TURNSTILE_SITE_KEY=''`, `VERCEL_ENV=''` (so `<Analytics />` is not rendered); projects `desktop` (1440×900) and `phone` (390×844, `isMobile`). Every test routes `https://app.e2e.test/api/site-status` and `/api/waitlist` with `page.route` (no real network; assert the waitlist request body).
**Follow pattern:** `apps/web/playwright.config.ts` (webServer, `E2E_SKIP_BUILD`), minus the DB and env file.
**Tests:** `home renders the decided headline` · `no horizontal overflow` (both projects; `/`, `/sample-brief`, `/how-it-works`: `scrollWidth <= clientWidth`) · `no csp violations or console errors` (`console` errors + `securitypolicyviolation`) · `security headers present` · `agency join flow posts a valid body and shows the done state` (JSON keys, `turnstileToken: 'no-widget'`, done copy) · `business join flow with Other` · `400 check shows the check message` · `pilot off swaps the CTA to sign-up` (status mock `pilotMode:false`) · `counters hidden when null` · `sample claim opens evidence; slider changes week; friday answer cites` · `unknown path is 404 with the site shell` · `robots disallows on a non-production build`.
**Done when:** `pnpm --filter @cs/site exec playwright install chromium` (once) then `pnpm --filter @cs/site e2e` green; commit (`git commit -- <the task's Files>`).

### Task 14: Analytics, Sentry, Vercel project and CI wiring
**Goal:** observability and the gated deploy path; owner steps written down.
**Files:** create `apps/site/instrumentation-client.ts` (`vercel.json` only if a setting can't live in the dashboard); modify `apps/site/src/app/layout.tsx`, `apps/site/next.config.ts`, `apps/site/src/import-boundary.test.ts` (if needed), `.github/workflows/ci.yml`, `docs/DEPLOY.md`.

**Behaviour:**
- `layout.tsx`: `<Analytics />` from `@vercel/analytics/next` (cookieless; no banner), rendered only when `process.env.VERCEL_ENV` is set (build-time; local/E2E `next start` would 404 `/_vercel/insights/script.js`). `instrumentation-client.ts`: `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development', sendDefaultPii: false, tracesSampleRate: 0, beforeSend(e) { delete e.request?.data; delete e.request?.cookies; return e; }, beforeBreadcrumb(b) { return b.category === 'ui.input' ? null : b; } })` — inert without a DSN. `next.config.ts` wrapped in `withSentryConfig` as `apps/web` (source maps only with `SENTRY_AUTH_TOKEN`; the Task 1 `next.config.ts`-only exception). The boundary test now scans `instrumentation-client.ts`.
- `ci.yml`: job **`site`** (no services): checkout, pnpm, node 24, `pnpm install --frozen-lockfile`, then `pnpm --filter @cs/site` `lint`, `build`, `check:bundle`, `exec playwright install --with-deps chromium`, `E2E_SKIP_BUILD=1 … e2e` (unit tests + typecheck already run in `test`). Job **`deploy-site`**: `needs: [site, deploy]`, same `if:` as `deploy`, `environment: production`, `concurrency: production-site`; install, `check:placeholders`, `vercel pull/build/deploy --prebuilt --prod` (`vercel@62.4.0`) with `VERCEL_PROJECT_ID: ${{ secrets.VERCEL_SITE_PROJECT_ID }}`, `SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT_SITE }}`. `deploy` unchanged (app first, so `/api/waitlist` + `SITE_ORIGIN` are live).
- `docs/DEPLOY.md` § "Marketing site (rivalmonday.com)", ≤ 1.5 KB: owner steps, secrets, "site holds no secrets".
**Owner steps (DEPLOY.md + work file):** (1) register `rivalmonday.com` (+ trademark knockout); (2) Vercel project: root `apps/site`, Next.js, iad1, auto-deploy off, `rivalmonday.com` + `www` → apex, Web Analytics on; (3) Vercel env (Production + Preview): `NEXT_PUBLIC_APP_URL=https://rivalmonday.app`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (the app's widget key), `NEXT_PUBLIC_SENTRY_DSN` (new Sentry project "site"), optional `NEXT_PUBLIC_SOCIAL_*`, `NEXT_PUBLIC_CLIENT_PRICE_USD`; (4) Turnstile widget hostnames: add `rivalmonday.com`, `www.rivalmonday.com` and the preview host; (5) app env: `SITE_ORIGIN=https://rivalmonday.com`, `SITE_ORIGIN_EXTRA` = preview origin(s), and **`TURNSTILE_SECRET_KEY`** set (without it every submission fails as "The check didn't go through"); a pilot-mode flip shows on the site after up to ~6 min (P6); (6) Namecheap DNS: Vercel A/CNAME for apex + www; (7) GitHub `production` secrets `VERCEL_SITE_PROJECT_ID`, `SENTRY_PROJECT_SITE`; (8) replace the placeholders (privacy, terms, founder note) — `deploy-site` refuses until then.
**Tests:** config only; the boundary test covers env reads; validate YAML with `npx --yes @action-validator/cli@0.6.0 .github/workflows/ci.yml` if available.
**Done when:** `pnpm --filter @cs/site exec vitest run`; `pnpm --filter @cs/site build && pnpm --filter @cs/site check:bundle`; commit (`git commit -- <the task's Files>`).

### Task 15: Copy sign-off, work file, final checks
**Goal:** owner-ready hand-over.
**Files:** create `docs/archive/phase-17b-copy-signoff.md`; modify `docs/work/phase-17.md`.

**Behaviour:**
- Sign-off file (mirror `docs/archive/phase-17a-copy-signoff.md`): every owner-signs string by surface (hero, bar, sections, how-it-works, popup steps/errors/done, Turnstile line, pilot-off CTAs, 404, sample-brief page + caption, `FICTIONAL` stems/tails + `STATE_TERMS`, Friday answers, counter labels/captions, footer CTA, legal drafts), each with file:line and `[ ]`; "Decisions to confirm" (P1, P3, P6, P13).
- Work file: Status/Next overwritten (17b implemented; final review: `pnpm test:affected`, `pnpm --filter @cs/site e2e`, `bash scripts/design-lint.sh`, no CRLF, `iconv` over the diff); Interfaces adds `apps/site`, the `@cs/demo` exporters, env list, CI jobs; owner verification: (1) `pnpm --filter @cs/site dev` → open `http://localhost:3001` at 1440 and 390 wide; (2) with the app running locally (`pnpm dev:web`, `SITE_ORIGIN_EXTRA=http://localhost:3001` and Cloudflare's test secret `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` in your `.env` — ask before adding; in the shell `NEXT_PUBLIC_APP_URL=http://localhost:3000` and test site key `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`; env `dev` without a secret refuses every submit, P8) submit the agency form → confirmation email in `apps/web/.outbox/`; (3) Pilot mode off at `/platform/billing` → wait up to ~6 min (CDN 300 s + swr 60 s + 60 s memo; locally the memo only) and reload: CTA reads "Start your free trial"; (4) click through the sample brief (claim → evidence, slider, Friday), every name fictional; (5) sign the copy file; supply founder note + photo, privacy and terms; (6) Task 14 owner steps; (7) social URLs. Backlog: SRI CSP (P7); manual vertical refresh (P2); 17c registers its pages.
**Done when:** `git ls-files --eol | grep crlf` prints nothing; `iconv -f utf-8 -t utf-8` over `git diff --name-only main...HEAD` clean; commit both docs.
