@AGENTS.md

# @cs/web — working notes
Next.js 16 App Router web app (agency/client UI, Better Auth sign-in, guest links, dev panel); all writes go through `@cs/tools`.

## Gotchas

### Next.js / build
- **Next.js 16 uses `proxy.ts`, not `middleware.ts`** (deprecated), and `params`/`cookies()`/`headers()` are async — always `await` them.
- **Turbopack can't resolve `new URL('<relative>', import.meta.url)` file lookups:** any package `apps/web` imports must use `path.join(dirname(fileURLToPath(import.meta.url)), …)` (`@cs/db` `migrate.ts`, `@cs/verticals` loader, `@cs/ai` config loader; else authed pages 500).
- **`next build` and `next dev` share `.next`:** never build while the dev server runs.
- **`AGENTS.md` and this `CLAUDE.md` are Next.js-managed:** `next dev` upserts its agent-rules block into `AGENTS.md` (and only creates `CLAUDE.md` = `@AGENTS.md` when neither exists). Both committed; keep `@AGENTS.md` as the first line here.
- **Layouts don't re-render on client-side navigation:** the `x-rm-path` header is read once per full load. Path-dependent shell parts use `usePathname()` in a client component; anything whose *context* differs by area needs its own route group (`(app)` vs `(platform)`), never a header switch.
- **Never call `Intl.supportedValuesOf('timeZone')` in a `'use client'` component:** it lacks `'UTC'`, uses legacy names and differs Node vs browser — hydration mismatch and a stored `'UTC'` silently cleared on save. Build options server-side with `timezoneOptions(current)` (`@/server/timezones`) and pass as a prop.

### Tools, auth & access
- **Every web write is a registered tool via `runTool(ctx, name, input)`:** maps `invalid_input` to its message and `not_found`/`permission_denied` to "Not found". Never call an engine/service mutator directly from `apps/web`.
- **`callTool` turns every tool refusal into a 404** (`not_found`, `permission_denied`, `invalid_input` → `notFound()`), never a 403 — spec §11, no cross-tenant existence leaks.
- **Exception: a stale `?event=`/`?move=` id renders "no longer available"** via `tryCallTool` (same text for foreign and retracted ids); page gates still 404.
- **Better Auth owns schema `auth` (camelCase columns), never auto-migrated:** created by migration `0035` from Better Auth 1.7.7's SQL; it never runs its own migrations. `auth-schema.test.ts` is a drift test — an upgrade that changes the schema needs a new hand-written migration. Needs `BETTER_AUTH_SECRET`; `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` optional (magic-link only without); `DEFAULT_AGENCY_ID` optional (pre-sign-in branding, spec §10.3; else Rival Monday defaults).
- **OAuth provider (migration `0041`):** the plugin seeds `auth."oauthResource"` once per instance — tests never truncate it (else `invalid_target`). Consent re-dispatches `/oauth2/authorize` *through hooks*, so an authorize before-hook must not undo it (`isConsentRequest`). Plugin endpoints aren't on `auth().api`'s type; call `auth().handler(new Request(...))`.
- **Magic-link sends run in the background:** the sign-in-right check and the send run inside Next's `after()` (Decision 2, no account enumeration). `buildAuthOptions(..., { runInBackground })` requires the runner; the `admin` CLI passes a synchronous one (`(p) => p`, awaited).
- **Magic links in dev:** in `apps/web/.outbox/*.html` only while `POSTMARK_SERVER_TOKEN` is unset.
- **`admin` CLI:** `pnpm --filter @cs/web admin invite --agency <id> --email <email> --role agency_admin` and `pnpm --filter @cs/web admin link --contact <id> --target brief --id <id>`.
- **Guest cookies (`rm_guest`): 24 hours, client contacts only, re-checked every request:** issued only for a client contact opening `/l/<token>` with no signed-in user; every request re-validates `active` and `links_revoked_before` against the cookie's `iat` (no cache beyond per-request React `cache()`), so deactivation ends the session on the next request.
- **A relative `EVIDENCE_FS_DIR` resolves against `apps/worker/`,** not `apps/web`, so both processes share the evidence directory in dev.
- **`/mcp` and `/.well-known/*` are public in `proxy.ts`** (Bearer token / public metadata; `/oauth/consent` stays behind the session). A new route under them needs its own auth; a new `/mcp`-adjacent path goes in the proxy `PUBLIC` list and the e2e rules.
- **`POST /api/ask/turn` (SSE) is public in `proxy.ts` and authenticates itself:** exactly one `final` event per response, `emit` never throws, membership chosen by the body's `clientId` among the user's own (`getViewerForClient`); new-thread id comes in the `x-ask-thread-id` header.
- **Consent binding order (`/oauth/consent`):** live memberships (`pickConsent`) → plugin accept → `bindConsent` → redirect; a failed bind keeps the code server-side. Authorize deletes a plugin consent with no active binding, so the page reappears.

### Platform & support sessions (8a/8b)
- **`/platform/**` lives in `app/(platform)/` and every page/action there uses `requireOperatorContext()`** (operator's own ctx, ignores `rm_support`); `/agency`, `/c` use `requireContext()`, which returns the synthetic support ctx during a session. Start/Exit/sign-out must use the operator ctx (a support ctx refuses every write).
- **Never set/clear cookies during render (Next 16):** support-cookie problems redirect to `GET /support/end?sid=…`; only that route (and `POST /support/exit`, sign-out) touches `rm_support`, and render passes `endStale: false`.
- **Every new write control needs `WriteGuard`/`useReadOnly()`** (`components/read-only.tsx`); `read-only-guard.test.ts` fails otherwise. Server refusal is the guarantee, hiding is UX.
- **Direct service reads that render emails must mask under `ctx.support`** (`server/support-mask.ts`); a page that calls a `supportHidden` tool (Ask tools) 404s in a session — branch on `ctx.support` first.

### UI patterns
- **Action-result state must survive `revalidatePath`:** a `useActionState` message rendered only inside the triggering button/dialog vanishes when revalidation unmounts it. Hoist it to an always-mounted component — copy `ReviewFooter`, `AlertList`, `SuggestionsPanel`, `TrackedCompetitorsTable`. A switch backed by a server action uses `useOptimistic` + `startTransition` as in `AutoSendSwitch`, not `PinPageSwitch`'s ref/RAF hack.
- **`LineChart` callers must pass series name-sorted:** colours follow position in the kept set.
- **No mobile layout:** fixed 232px sidebar; the 390px overview E2E is `test.fixme` until a responsive shell exists.

### Dev panel & environments
- **Run with `pnpm dev:web`.** `DEV_PANEL` is set only by `scripts/dev.ts`, never by hand or in production. `RM_DEV_ENV_FILE` overrides the location of `.dev-env.json` (git-ignored; the selected database; ignored unless the guard holds).
- **Dev panel code lives only in `src/dev-panel/`** (non-production dynamic imports); the markers `data-rm-dev-panel`/`x-rm-dev-panel` appear nowhere else — `scripts/check-no-dev-panel.ts` (in `pnpm e2e`) scans the build and fails if they leak or nothing was scanned.
- **Per-environment factories (`perEnv`, `env-cache.ts`):** a new cached client in `src/server/` must use `perEnv`, and builders resolve dependencies **by the name given** (`dbs(name)`, `enqueueFor(name)`, …), never by re-reading the live environment (else a DEMO request mid-switch reaches cs_dev's queue). Routes needing several call `activeEnvName()` once and pass it.
- **`webStore` lives in `src/server/store.ts`** (not `files.ts`) so the evidence store follows the selected environment.
- **Enqueue is refused in DEMO and TEST** (else `cs_demo` ids reach the real worker and paid vendors): throws "Background jobs are switched off while browsing DEMO or TEST data." and job status reads "no job". Approving a brief in DEMO commits then shows that refusal; an un-rendered PDF shows "PDF rendering is off while browsing DEMO or TEST data." (the seed pre-renders sent briefs, the ready brief and trend report).
- **Running the panel:** `next dev` binds `127.0.0.1` unless `-H`. Panel POSTs need `x-rm-dev-panel: 1` and a local `Origin` = `Host`. Demo sign-in goes via `/dev-panel/sign-in/<token>`, then redirects to `APP_URL`. Use `localhost`, not `127.0.0.1`, or the session cookie is lost.

### E2E
- **`pnpm --filter @cs/web e2e`** (Playwright smoke suite) is not part of `pnpm test`: it builds and starts a production server against `cs_test` (`playwright.config.ts` sets its own env), runs as its own CI job after `pnpm test`, and must never run concurrently with another `cs_test` run.
- **Reuse signed-in sessions; never add a magic-link sign-in:** Better Auth allows 5 magic-link requests/IP/60 s; full runs already hit it (`smoke.spec` :6/:41 fail in full suites, pass alone). Specs reuse storage states (`workflow.spec` `beforeAll`, shared admin/`asker-state.json`). `latestMagicLink()`/`newMagicLink()` filter by recipient after an outbox snapshot (Playwright restarts workers after a failure).
- **A one-off webServer "destination stream closed early" error is an infra flake** — re-run once.

### Affected-only E2E
- **During development run `pnpm --filter @cs/web e2e:affected`** (`--dry-run`, `--base <ref>`, `--full`): diffs against `merge-base HEAD main`, runs tests whose tags the changed files map to (plus `@smoke`), rebuilds only when needed. Full `pnpm --filter @cs/web e2e` only in `/rm-merge`.
- **Every spec test carries tags:** `test('…', { tag: ['@pricing', …] }, …)`, one per module its steps touch; vocabulary in `KNOWN_TAGS` (`scripts/e2e-affected-rules.ts`). `@smoke` only on the two always-run smoke tests.
- **A new route, component or module needs a rule** in `scripts/e2e-affected-rules.ts` (first match wins; `'all'` when unsure). `scripts/e2e-affected.test.ts` fails on untagged tests, unknown/dead tags and web files that only hit a catch-all; run it without the DB via `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`.
