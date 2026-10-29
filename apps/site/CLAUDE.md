@AGENTS.md

# @cs/site — working notes
The rivalmonday.com marketing site: a separate Next.js 16 deployable (port 3001 in dev). Static pages only; it talks to the app over public HTTP (`/api/waitlist`, `/api/site-status`).

## Boundary (gated)
- **Only `@cs/ui` (and `@cs/ui/styles.css`) may be imported from the workspace.** Never `@cs/db`, `@cs/tools`, `@cs/email` root or any server package; no `'server-only'`. `src/import-boundary.test.ts` (`pnpm --filter @cs/site lint`) checks `package.json` and every specifier; `pnpm --filter @cs/site check:bundle` checks `.next` output and traces after a build.
- **No secrets.** Read env only through `src/lib/env.ts` (`siteEnv`), with literal `process.env.NEXT_PUBLIC_*` reads (Next inlines only literals). Allowed: `NEXT_PUBLIC_*`, `VERCEL_ENV`, `NODE_ENV`; `SENTRY_AUTH_TOKEN|ORG|PROJECT` only in `next.config.ts`. No `.env` loading anywhere. A new `NEXT_PUBLIC_*` var is already hashed by turbo (`@cs/site#build` `env`).

## Styling
- Design system v1 with marketing latitude (spec § 7.8): `@cs/ui` tokens and primitives, compose in `src/components/`; never edit `@cs/ui`.
- Site-local tokens live only in `src/app/site.css` (`text-display`, `text-display-sub`, `shadow-float`, `--ring-change`/`.ring-change`, `.bg-grid-lines`, `.hero-wash`, `.site-container`). No hex, `rounded-[…]`, `text-[…px]` or shadow literals in components; `bash scripts/design-lint.sh` covers `apps/site/src`.
- **`cn()` from `@cs/ui` doesn't know the site keys:** tailwind-merge reads `text-display`/`text-display-sub` as a text colour (dropped next to `text-ink`) and `shadow-float` as a shadow colour. Keep site-key classes out of `cn()` merges with a colour/shadow class (plain `className` strings), since `@cs/ui`'s `lib/cn.ts` can't change here.
- Orange (`amber`) only for Friday and the one Pilot pill (`ALLOW_AMBER` in `design-lint.sh`).

## Build
- Pages must prerender (no `cookies()`/`headers()`/dynamic APIs in pages); no `output: 'export'` because security headers need the Next runtime.
- `next build` and `next dev` share `.next`: don't build while dev runs.
