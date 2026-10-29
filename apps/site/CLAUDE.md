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
- `content/pages.ts` is the registry: nav, footer, sitemap and collection pages (`/integrations`, `/sources`, `/compare`) are derived from it; never hand-edit them elsewhere. Enabled rivals = the known-rival array filtered by `siteEnv.comparePages` (`NEXT_PUBLIC_COMPARE_PAGES`, read at build; unset = no named compare pages). Never index an object by an env slug.
- Switching compare pages: `docs/DEPLOY.md` § Compare pages on/off. `pnpm --filter @cs/site check:facts` (also in `deploy-site`) fails when any rival's facts (all five in `deploy-site`, on or off) are over 90 days old. CI's `site` job sets the same `NEXT_PUBLIC_COMPARE_PAGES` as Playwright `SERVER_ENV` so `E2E_SKIP_BUILD=1` reuses the build; change both together.
- Every claim about Rival Monday carries `verifiedIn` paths to shipped code (tests check they exist and match the ledger `docs/research/2026-10-29-phase-17c-claim-check.md`).
- Never name data vendors (DataForSEO, Apify, ScrapeCreators, Stadia): three scans guard it (compare, integrations, sources tests).
- OG colour hex lives only in `src/lib/og-theme.ts`; each `pageMetadata` page needs its own `opengraph-image.tsx`.
