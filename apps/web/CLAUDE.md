@AGENTS.md

# @cs/web — working notes
Next.js 16 App Router web app (agency/client UI, Better Auth sign-in, guest links, dev panel); all writes go through `@cs/tools`.

## Gotchas

### Next.js / build
- **Next.js 16 uses `proxy.ts`, not `middleware.ts`** (deprecated), and `params`/`cookies()`/`headers()` are async — always `await` them.
- **Turbopack can't resolve `new URL('<relative>', import.meta.url)` file lookups:** any package `apps/web` imports must use `path.join(dirname(fileURLToPath(import.meta.url)), …)` (`@cs/db` `migrate.ts`, `@cs/verticals` loader, `@cs/ai` config loader; else authed pages 500).
- **`next build` and `next dev` share `.next`:** never build while the dev server runs.
- **One `sharp` version repo-wide (0.34.5):** two versions loaded in one process fail `next build` on Windows with `ERR_DLOPEN_FAILED`.
- **`AGENTS.md` is Next.js-managed** (`next dev` upserts its block); keep `@AGENTS.md` as this file's first line.
- **Layouts don't re-render on client-side navigation:** the `x-rm-path` header is read once per full load. Path-dependent shell parts use `usePathname()` in a client component; anything whose *context* differs by area needs its own route group (`(app)` vs `(platform)`), never a header switch.
- **Never call `Intl.supportedValuesOf('timeZone')` in a `'use client'` component:** it lacks `'UTC'`, uses legacy names and differs Node vs browser — hydration mismatch and a stored `'UTC'` silently cleared on save. Build options server-side with `timezoneOptions(current)` (`@/server/timezones`) and pass as a prop.

### Tools, auth & access
- **Every web write is a registered tool via `runTool(ctx, name, input)`:** maps `invalid_input` to its message and `not_found`/`permission_denied` to "Not found". Never call an engine/service mutator directly from `apps/web`.
- **`callTool` turns every tool refusal into a 404**, never a 403 (spec §11). Exception: a stale `?event=`/`?move=` id renders "no longer available" via `tryCallTool`; page gates still 404.
- **Better Auth owns schema `auth` (camelCase columns), never auto-migrated** (migration `0035`; `auth-schema.test.ts` is the drift test — an upgrade that changes the schema needs a hand-written migration). Google keys optional; auth pages use `authBranding` (agency branding or neutral); emails keep `defaultBranding()`'s fallback (P4).
- **OAuth provider (migration `0041`):** the plugin seeds `auth."oauthResource"` once per instance — tests never truncate it (else `invalid_target`). Consent re-dispatches `/oauth2/authorize` *through hooks*, so an authorize before-hook must not undo it (`isConsentRequest`). Plugin endpoints aren't on `auth().api`'s type; call `auth().handler(new Request(...))`.
- **Magic-link sends run in Next's `after()`** (no account enumeration); `buildAuthOptions(..., { runInBackground })` needs the runner (the `admin` CLI passes `(p) => p`). In dev, links land in `apps/web/.outbox/*.html` while `POSTMARK_SERVER_TOKEN` is unset.
- **Self-serve sign-up (Phase 10) is a service fn, not a tool:** `/sign-up` calls `startAgencySignup` directly (no agency ctx); refused and accepted paths must stay identical (same redirect, 400 ms floor, `rm_signup` cookie always set). Magic-link/Google callback is `/onboarding/start`, which picks the new agency's membership.
- **`admin` CLI:** `pnpm --filter @cs/web admin invite --agency <id> --email <email> --role agency_admin` and `pnpm --filter @cs/web admin link --contact <id> --target brief --id <id>`.
- **Guest cookies (`rm_guest`, 24 h, client contacts via `/l/<token>`) are re-checked every request** (`active`, `links_revoked_before` vs `iat`), so deactivation ends them on the next request.
- **A relative `EVIDENCE_FS_DIR` resolves against `apps/worker/`** (shared by both processes in dev).
- **`/mcp` and `/.well-known/*` are public in `proxy.ts`** (Bearer token / public metadata; `/oauth/consent` stays behind the session). A new route under them needs its own auth; a new `/mcp`-adjacent path goes in the proxy `PUBLIC` list and the e2e rules.
- **`POST /api/ask/turn` (SSE) is public in `proxy.ts` and authenticates itself:** one `final` event per response, `emit` never throws, membership by the body's `clientId` (`getViewerForClient`), new thread id in `x-ask-thread-id`.
- **Consent order (`/oauth/consent`):** `pickConsent` → plugin accept → `bindConsent` → redirect; a failed bind keeps the code server-side; authorize drops a consent with no binding.

### Platform & support sessions (8a/8b)
- **`/platform/**` lives in `app/(platform)/` and every page/action there uses `requireOperatorContext()`** (operator's own ctx, ignores `rm_support`); `/agency`, `/c` use `requireContext()`, which returns the synthetic support ctx during a session. Start/Exit/sign-out must use the operator ctx (a support ctx refuses every write).
- **Never set/clear cookies during render (Next 16):** support-cookie problems redirect to `GET /support/end?sid=…`; only that route (and `POST /support/exit`, sign-out) touches `rm_support`, and render passes `endStale: false`.
- **Every new write control needs `WriteGuard`/`useReadOnly()`** (`components/read-only.tsx`); `read-only-guard.test.ts` fails otherwise. Server refusal is the guarantee, hiding is UX.
- **Direct service reads that render emails must mask under `ctx.support`** (`server/support-mask.ts`); a page that calls a `supportHidden` tool (Ask tools) 404s in a session — branch on `ctx.support` first.

### UI patterns
- **Action-result state must survive `revalidatePath`:** a `useActionState` message rendered only inside the triggering button/dialog vanishes when revalidation unmounts it. Hoist it to an always-mounted component (`ReviewFooter`, `AlertList`). Server-action switches use `useOptimistic` + `startTransition` (`AutoSendSwitch`), not `PinPageSwitch`'s ref/RAF hack.
- **React 19 resets a `<form action>` after every action, error results included** — even controlled selects. Wizard-style forms control every field and add `onReset={e => e.preventDefault()}` (`(app)/onboarding/steps/*`), else a failed submit silently reverts choices (e.g. invite role → admin).
- **`LineChart` callers must pass series name-sorted:** colours follow position in the kept set.
- **No mobile layout** (fixed 232px sidebar; 390px overview E2E is `test.fixme`).

### Help (15b)
- **Help copy (`@/help/copy`) is `server-only`:** client components get it from `HelpProvider` context (shell), never by importing copy values (`help/copy-bundle.test.ts` fails). A `<PageHeader` outside `page.tsx` goes in `DELEGATED_HEADERS` (`help/coverage.test.ts`); reach lists: `help/reach.ts`.
- **A `HelpTip`'s title is its accessible name:** Playwright `name:` matches substrings ("Scan now limits" broke `{ name: 'Scan now' }`) — grep e2e locators for new tip titles; a tip inside a heading needs the heading text in its own `<span>`.

### Dev panel & environments
- **Run with `pnpm dev:web`.** `DEV_PANEL` is set only by `scripts/dev.ts`, never by hand or in production. `RM_DEV_ENV_FILE` overrides the location of `.dev-env.json` (git-ignored; the selected database; ignored unless the guard holds).
- **Dev panel code lives only in `src/dev-panel/`** (non-production dynamic imports); the markers `data-rm-dev-panel`/`x-rm-dev-panel` appear nowhere else — `scripts/check-no-dev-panel.ts` (in `pnpm e2e`) scans the build and fails if they leak or nothing was scanned.
- **Per-environment factories (`perEnv`, `env-cache.ts`):** a new cached client in `src/server/` must use `perEnv`, and builders resolve dependencies **by the name given** (`dbs(name)`, `enqueueFor(name)`, …), never by re-reading the live environment (else a DEMO request mid-switch reaches cs_dev's queue). Routes needing several call `activeEnvName()` once and pass it.
- **Enqueue is refused in DEMO and TEST** (else `cs_demo` ids reach the real worker and paid vendors): throws "Background jobs are switched off while browsing DEMO or TEST data." and job status reads "no job". Un-rendered PDFs show "PDF rendering is off…" (the seed pre-renders the briefs/report it needs).
- **Running the panel:** `next dev` binds `127.0.0.1` unless `-H`; panel POSTs need `x-rm-dev-panel: 1` and `Origin` = `Host`; demo sign-in via `/dev-panel/sign-in/<token>`. Use `localhost`, not `127.0.0.1` (session cookie lost).

### E2E
- **`pnpm --filter @cs/web e2e`** (Playwright smoke suite) is not part of `pnpm test`: it builds and starts a production server against `cs_test` (`playwright.config.ts` sets its own env), runs as its own CI job after `pnpm test`, and must never run concurrently with another `cs_test` run.
- **Reuse signed-in sessions; never add a magic-link sign-in:** Better Auth allows 5 magic-link requests/IP/60 s; full runs already hit it (`smoke.spec` :6/:41 fail in full suites, pass alone). Specs reuse storage states (`workflow.spec` `beforeAll`, shared admin/`asker-state.json`). `latestMagicLink()`/`newMagicLink()` filter by recipient after an outbox snapshot (Playwright restarts workers after a failure).
- **A one-off "destination stream closed early" is an infra flake** — re-run once.

### Affected-only E2E
- **During development run `pnpm --filter @cs/web e2e:affected`** (`--dry-run`, `--base <ref>`, `--full`): tests whose tags the changed files map to (plus `@smoke`), rebuilds only when needed. It can pull one test out of a `describe.serial` file (false failure) — re-run the whole file. Full `e2e` only in `/rm-merge`.
- **Every spec test carries tags:** `test('…', { tag: ['@pricing', …] }, …)`, one per module its steps touch; vocabulary in `KNOWN_TAGS` (`scripts/e2e-affected-rules.ts`). `@smoke` only on the two always-run smoke tests.
- **A new route, component or module needs a rule** in `scripts/e2e-affected-rules.ts` (first match wins; `'all'` when unsure). `scripts/e2e-affected.test.ts` fails on untagged tests, unknown/dead tags and web files that only hit a catch-all; run it without the DB via `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`.
- **`findBy*` (1 s default) is too short for `next/dynamic` chunks under full-suite load:** pass `{ timeout: 15_000 }` (e.g. `PageGuide` via `PageHeader`).
