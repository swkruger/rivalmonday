@AGENTS.md

# @cs/web — working notes
Next.js 16 App Router web app (agency/client UI, Better Auth sign-in, guest links, dev panel); all writes go through `@cs/tools`.

## Gotchas

### Next.js / build
- **Next.js 16 uses `proxy.ts`, not `middleware.ts`** (deprecated), and `params`/`cookies()`/`headers()` are async — always `await` them.
- **Turbopack can't resolve `new URL('<relative>', import.meta.url)` file lookups:** any package `apps/web` imports must use `path.join(dirname(fileURLToPath(import.meta.url)), …)` (`@cs/db` `migrate.ts`, `@cs/verticals` loader, `@cs/ai` config loader; else authed pages 500).
- **`next build` and `next dev` share `.next`:** never build while the dev server runs.
- **`AGENTS.md` and this `CLAUDE.md` are Next.js-managed:** `next dev` upserts its agent-rules block into `AGENTS.md` (and only creates `CLAUDE.md` = `@AGENTS.md` when neither exists). Both committed; keep `@AGENTS.md` as the first line here.
- **App Router layouts don't re-render on client-side navigation:** `(app)/layout.tsx` reads the path once per full load (`x-rm-path` header). Anything path-dependent in a layout (active sidebar item, client-scoped nav, top-bar client label) must use `usePathname()` in a client component.
- **Never call `Intl.supportedValuesOf('timeZone')` in a `'use client'` component:** it lacks `'UTC'`, uses legacy names and differs Node vs browser — hydration mismatch and a stored `'UTC'` silently cleared on save. Build options server-side with `timezoneOptions(current)` (`@/server/timezones`) and pass as a prop.

### Tools, auth & access
- **Every web write is a registered tool via `runTool(ctx, name, input)`:** it maps `invalid_input` to its message and `not_found`/`permission_denied` both to "Not found". Never call an engine/service mutator directly from `apps/web`.
- **`callTool` turns every tool refusal into a 404** (`not_found`, `permission_denied`, `invalid_input` → `notFound()`), never a 403 — spec §11, no cross-tenant existence leaks.
- **Exception: a stale `?event=`/`?move=` id renders "no longer available"** via `tryCallTool` (same text for foreign and retracted ids); page gates still 404.
- **Better Auth owns schema `auth` (camelCase columns), never auto-migrated:** tables were created by migration `0035` from Better Auth 1.7.7's generated SQL; Better Auth never runs its own migrations. `auth-schema.test.ts` is a drift test — an upgrade that changes the schema needs a new hand-written migration. Won't start without `BETTER_AUTH_SECRET`; `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are optional (magic-link only without them); `DEFAULT_AGENCY_ID` optional (pre-sign-in branding, spec §10.3; falls back to Rival Monday defaults).
- **OAuth provider (`@better-auth/oauth-provider`, migration `0041`):** the plugin seeds `auth."oauthResource"` from config once per instance at init — test helpers never truncate it (a truncated resource makes register/authorize fail with `invalid_target`). Its consent endpoint re-dispatches `/oauth2/authorize` *through hooks* (with the consent POST as `ctx.request`), so an authorize before-hook must not undo the consent being completed (see `isConsentRequest` in `auth-options.ts`). Plugin endpoints are missing from `auth().api`'s type (options are widened); call them via `auth().handler(new Request(...))`.
- **Magic-link sends run in the background:** the sign-in-right check and the send run inside Next's `after()` (Decision 2, no account enumeration). `buildAuthOptions(..., { runInBackground })` requires the runner; the `admin` CLI passes a synchronous one (`(p) => p`, awaited).
- **Magic links in dev:** in `apps/web/.outbox/*.html` **only while `POSTMARK_SERVER_TOKEN` is unset** (`next.config.ts` loads the root `.env`; with the test token, mail goes to Postmark's test server).
- **`admin` CLI:** `pnpm --filter @cs/web admin invite --agency <id> --email <email> --role agency_admin` and `pnpm --filter @cs/web admin link --contact <id> --target brief --id <id>`.
- **Guest cookies (`rm_guest`): 24 hours, client contacts only, re-checked every request:** issued only for a client contact opening `/l/<token>` with no signed-in user; every request re-validates `active` and `links_revoked_before` against the cookie's `iat` (no cache beyond per-request React `cache()`), so deactivation ends the session on the next request.
- **A relative `EVIDENCE_FS_DIR` resolves against `apps/worker/`,** not `apps/web`, so both processes share the evidence directory in dev.
- **`/mcp` and `/.well-known/*` are public in `proxy.ts`** (Bearer token / public metadata; `/oauth/consent` stays behind the session). A new route under them needs its own auth; a new `/mcp`-adjacent path goes in the proxy `PUBLIC` list and the e2e rules.
- **`POST /api/ask/turn` (SSE) is public in `proxy.ts` and authenticates itself:** exactly one `final` event per response, `emit` never throws, membership chosen by the body's `clientId` among the user's own (`getViewerForClient`); new-thread id comes in the `x-ask-thread-id` header.
- **Consent binding order (`/oauth/consent`):** live memberships (`pickConsent`) → plugin accept → `bindConsent` → redirect; a failed bind keeps the code server-side. Authorize deletes a plugin consent with no active binding, so the page reappears.

### UI patterns
- **Action-result state must survive `revalidatePath`:** a `useActionState` message rendered only inside the button/dialog that triggered it vanishes when the revalidated status unmounts that component. Hoist it to an always-mounted component — copy `ReviewFooter`, `AlertList`, `SuggestionsPanel`, `TrackedCompetitorsTable`. A switch backed by a server action uses `useOptimistic` + `startTransition` as in `AutoSendSwitch`, not `PinPageSwitch`'s hand-rolled ref/RAF approach.
- **`LineChart` callers must pass series name-sorted** (colours follow position).
- **No mobile layout:** fixed 232px sidebar; the 390px overview E2E is `test.fixme` until a responsive shell exists.

### Dev panel & environments
- **Run with `pnpm dev:web`.** `DEV_PANEL` is set only by `scripts/dev.ts`, never by hand or in production. `RM_DEV_ENV_FILE` overrides the location of `.dev-env.json` (git-ignored; the selected database; ignored unless the guard holds).
- **Dev panel code lives only in `src/dev-panel/`,** reached via `process.env.NODE_ENV !== 'production'` dynamic imports; the markers `data-rm-dev-panel` and `x-rm-dev-panel` must appear nowhere else. `scripts/check-no-dev-panel.ts` (part of `pnpm e2e`) scans the production build and fails (exit 1) if `.next/server` or `.next/static` is missing or nothing was scanned — build first. Keep `src/app/` to the thin `dev-panel/[...path]/route.ts` shell.
- **Per-environment factories (`perEnv`, `env-cache.ts`):** the database, storage, auth, tool-registry and queue factories in `src/server/` are cached per environment; a new cached client must use `perEnv`. A builder resolves dependencies **by the name it is given** (`dbs(name)`, `enqueueFor(name)`, `jobStatusFor(name)`, `platformAdmins(name)`), never by re-reading the live environment (else a DEMO request in flight during a switch reaches cs_dev's queue). Routes needing several (the `/files` routes) call `activeEnvName()` once and pass it. They switch on `NODE_ENV` and `DEV_PANEL` only (host is async in Next 16); the banner and panel routes also check the host.
- **`webStore` lives in `src/server/store.ts`** (not `files.ts`) so the evidence store follows the selected environment.
- **Enqueue is refused in DEMO and TEST** (else `cs_demo` ids reach the real worker and paid vendors): throws "Background jobs are switched off while browsing DEMO or TEST data." and job status reads "no job". So approving a brief in DEMO commits then shows that refusal; a non-pre-rendered PDF shows "PDF rendering is off while browsing DEMO or TEST data." (the seed pre-renders sent briefs, the ready brief and the trend report).
- **Running the panel:** the launcher binds `next dev` to `127.0.0.1` unless `-H` is passed. Panel POSTs need header `x-rm-dev-panel: 1` and a local `Origin` equal to `Host`. Demo sign-in links go through `/dev-panel/sign-in/<token>`; after sign-in the redirect goes to `APP_URL` (port 3000). Browse and set `APP_URL` with `localhost`, not `127.0.0.1`, or the session cookie is lost.

### E2E
- **`pnpm --filter @cs/web e2e`** (Playwright smoke suite) is not part of `pnpm test`: it builds and starts a production server against `cs_test` (`playwright.config.ts` sets its own env), runs as its own CI job after `pnpm test`, and must never run concurrently with another `cs_test` run.
- **Reuse one signed-in session per spec file:** Better Auth's magic-link plugin allows 5 requests per IP per rolling 60 s on `/sign-in/magic-link` and `/magic-link/verify`; `workflow.spec.ts` signs in once in `beforeAll` and uses `test.use({ storageState })`. `latestMagicLink()`/`newMagicLink()` snapshot the outbox before requesting and filter by recipient, because Playwright restarts the worker process after a failed test and "newest file" can return a consumed link.
- **A one-off webServer "destination stream closed early" error is a flake** — re-run once.

### Affected-only E2E
- **During development run `pnpm --filter @cs/web e2e:affected`** (`--dry-run` shows the decision; `--base <ref>`, `--full`): it diffs against `merge-base HEAD main` (+ uncommitted/untracked), runs only tests whose tags the changed files map to (plus `@smoke`), and rebuilds only when `apps/web`/`packages` changed since its last build (`.next/e2e-build-stamp`). **At phase end run the full `pnpm --filter @cs/web e2e`** (always builds).
- **Every spec test carries tags:** `test('…', { tag: ['@pricing', …] }, …)`, one per module its steps touch; vocabulary in `KNOWN_TAGS` (`scripts/e2e-affected-rules.ts`). `@smoke` only on the two always-run smoke tests.
- **A new route, component or module needs a rule** in `scripts/e2e-affected-rules.ts` (first match wins; `'all'` when unsure). `scripts/e2e-affected.test.ts` fails on untagged tests, unknown/dead tags and web files that only hit a catch-all; run it without the DB via `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`.
