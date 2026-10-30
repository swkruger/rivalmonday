@AGENTS.md

# @cs/site — working notes
The rivalmonday.com marketing site: a separate Next.js 16 deployable (port 3001 in dev). Static pages only; it talks to the app over public HTTP (`/api/waitlist`, `/api/site-status`).

## Boundary (gated)
- **Only `@cs/ui` (and `@cs/ui/styles.css`) may be imported from the workspace.** Never `@cs/db`, `@cs/tools`, `@cs/email` root or any server package; no `'server-only'`. `src/import-boundary.test.ts` (`pnpm --filter @cs/site lint`) checks `package.json` and every specifier; `pnpm --filter @cs/site check:bundle` checks `.next` output and traces after a build.
- **No secrets.** Read env only through `src/lib/env.ts` (`siteEnv`), with literal `process.env.NEXT_PUBLIC_*` reads (Next inlines only literals). Allowed: `NEXT_PUBLIC_*`, `VERCEL_ENV`, `NODE_ENV`; `SENTRY_AUTH_TOKEN|ORG|PROJECT` only in `next.config.ts`. No `.env` loading anywhere. A new `NEXT_PUBLIC_*` var is already hashed by turbo (`@cs/site#build` `env`).

## Cross-package test
- `packages/tools/src/waitlist/site-contract.test.ts` imports `apps/site/src/lib/waitlist-body.ts` to prove the form agrees with the server schema. After changing `waitlist-body.ts`, run `pnpm --filter @cs/tools exec vitest run site-contract`: turbo's affected filter won't pick `@cs/tools` up from a site change.

## Styling
- Design system v1 with marketing latitude (spec § 7.8): `@cs/ui` tokens and primitives, compose in `src/components/`; never edit `@cs/ui`.
- Site-local tokens live only in `src/app/site.css` (`text-display`, `text-display-sub`, `shadow-float`, `--ring-change`/`.ring-change`, `.bg-grid-lines`, `.hero-wash`, `.site-container`). No hex, `rounded-[…]`, `text-[…px]` or shadow literals in components; `bash scripts/design-lint.sh` covers `apps/site/src`.
- **`cn()` from `@cs/ui` doesn't know the site keys:** tailwind-merge reads `text-display`/`text-display-sub` as a text colour (dropped next to `text-ink`) and `shadow-float` as a shadow colour. Keep site-key classes out of `cn()` merges with a colour/shadow class (plain `className` strings), since `@cs/ui`'s `lib/cn.ts` can't change here.
- Orange (`amber`) only for Friday and the one Pilot pill (`ALLOW_AMBER` in `design-lint.sh`).

## Build
- Pages must prerender (no `cookies()`/`headers()`/dynamic APIs in pages); no `output: 'export'` because security headers need the Next runtime.
- `next build` and `next dev` share `.next`: don't build while dev runs.

## Pages and content (17c)
- **Client boundary:** no `'use client'` module may import (even transitively) `content/pages`, `content/compare`, `content/integrations` or `content/sources`: they hold every rival, on or off. The layout builds nav/footer links server-side (`components/shell/nav-items.ts`) and passes `{label, href}[]` props (import-boundary test; `check:bundle` fails on a disabled rival's name in `.next/static`).
- Website-monitoring copy follows one constant, `content/website-monitoring.ts` `WEBSITE_MONITORING_LIVE`; the owner flips it after `WEB_MONITORING_ENABLED=true`.
- `content/pages.ts` is the registry: nav, footer, sitemap and collection pages (`/integrations`, `/sources`, `/compare`) are derived from it; never hand-edit them elsewhere. Enabled rivals = the known-rival array filtered by `siteEnv.comparePages` (`NEXT_PUBLIC_COMPARE_PAGES`, read at build; unset = no named compare pages). Never index an object by an env slug.
- Switching compare pages: `docs/DEPLOY.md` § Compare pages on/off. `pnpm --filter @cs/site check:facts` fails when an enabled rival's facts are over 90 days old; `deploy-site` runs `check:facts --all` (all five, on or off). CI's `site` job sets the same `NEXT_PUBLIC_COMPARE_PAGES` as Playwright `SERVER_ENV` so `E2E_SKIP_BUILD=1` reuses the build; change both together.
- Every claim about Rival Monday carries `verifiedIn` paths to shipped code (tests check they exist and match the ledger `docs/research/2026-10-29-phase-17c-claim-check.md`).
- Never name data vendors (DataForSEO, Apify, ScrapeCreators, Stadia): three scans guard it (compare, integrations, sources tests).
- OG colour hex lives only in `src/lib/og-theme.ts`; each `pageMetadata` page needs its own `opengraph-image.tsx`.
- `verifiedIn` code paths live in `content/*-evidence.ts`, never in the content modules (keeps repo paths out of page bundles).
- The app's `/api/waitlist` fails closed (`400 check`) in env `dev` without a Turnstile secret — local end-to-end tries need Cloudflare's test keys in `.env`.
- Windows working copies can drift to CRLF while the index stays LF (`git ls-files --eol` shows `w/crlf`, status clean): `rm <file> && git checkout -- <file>`; a plain checkout doesn't rewrite.
- `/roadmap` (`content/roadmap.ts`) is **planned** work, never a claim: no `verifiedIn`, no ledger row; keep the "Planned · may change" status and notice (roadmap test). When a roadmap item ships, move its wording to claims-backed pages and drop it here.
- Dev from a worktree while the main checkout's site holds port 3001: `npx next dev -p 3011` in `apps/site` (stop it by killing the listener on 3011: TaskStop can leave the Next child running). `next dev` rewrites `next-env.d.ts`: never commit that change.
- The test-DB PreToolUse hook also counts other sessions' Playwright/headless Chrome processes and blocks site test runs (DB-free) while they live; the `RM_HOOK_OVERRIDE=1` escape is refused in auto mode, so wait for them or ask the owner. Your own `next dev`/`next start` in the same worktree trips it too (its Turbopack worker counts): stop the port listener before `vitest`/`e2e`.
- The sample's map rankings are hand-tuned (centre-out story): `export:sample-brief` overwrites them, then `rank-story.test.ts` fails. Re-run `node scripts/sample-rank-story.mjs content/sample-brief.json write`. Sample images (map, ad creatives) are generated once and committed in `public/sample/`; never generate at runtime.
- **SEO pages:** `/for/*` (`content/industries.ts`) and `/guides/*` (`content/guides.ts`) are registry collections (`group` `industries`/`guides`), linked from the footer, sitemap, `llms.txt` and in-text links only, never the top nav (`industries-guides.test.ts`). Their product statements use ledger wording only; website lines go through `websitesLine()` (`WEBSITE_MONITORING_LIVE`). Guides carry `published`/`updated` (Article JSON-LD): bump `updated` on a real edit. Keep links visible: CSS-hidden links are cloaking.
- `SitePage.noindex` serves a page with `noindex, follow` and drops it from the sitemap and `llms.txt` (integration detail pages use it). FAQs render through `components/seo/faq-block.tsx` (native `<details>` + `FAQPage` JSON-LD).
