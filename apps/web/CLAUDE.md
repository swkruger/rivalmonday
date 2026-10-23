@AGENTS.md

# @cs/web — working notes
Next.js 16 App Router web app (agency/client UI, Better Auth sign-in, guest links, dev panel); all writes go through `@cs/tools`.

**UI:** design system v1 is binding (`docs/design-system/`); rules in `packages/ui/CLAUDE.md`, migration steps and per-file Card map in `docs/design-system/09-ai-implementation-playbook.md`.

## Gotchas

### Next.js / build
- **Next.js 16 uses `proxy.ts`, not `middleware.ts`**, and `params`/`cookies()`/`headers()` are async — `await` them.
- **Turbopack can't resolve `new URL('<relative>', import.meta.url)` file lookups:** any package `apps/web` imports must use `path.join(dirname(fileURLToPath(import.meta.url)), …)` (`@cs/db`, `@cs/verticals`, `@cs/ai` loaders; else authed pages 500).
- **`next build` and `next dev` share `.next`:** don't build while dev runs.
- **One `sharp` version repo-wide (0.34.5):** two versions in one process fail `next build` on Windows (`ERR_DLOPEN_FAILED`).
- **`AGENTS.md` is Next.js-managed** (`next dev` upserts its block); keep `@AGENTS.md` as line 1.
- **Layouts don't re-render on client-side navigation:** the `x-rm-path` header is read once per full load. Path-dependent shell parts use `usePathname()` in a client component; a different *context* per area needs a route group (`(app)` vs `(platform)`), never a header switch.
- **Never call `Intl.supportedValuesOf('timeZone')` in a `'use client'` component:** it lacks `'UTC'`, uses legacy names and differs Node vs browser — hydration mismatch and a stored `'UTC'` silently cleared on save. Build options server-side with `timezoneOptions(current)` (`@/server/timezones`) and pass as a prop.

### Tools, auth & access
- **Every web write is a registered tool via `runTool(ctx, name, input)`:** maps `invalid_input` to its message and `not_found`/`permission_denied` to "Not found". Never call a service mutator directly.
- **`callTool` turns every tool refusal into a 404**, never a 403 (spec §11). Exception: a stale `?event=`/`?move=` id renders "no longer available" via `tryCallTool`; page gates still 404.
- **Better Auth owns schema `auth` (camelCase columns), never auto-migrated** (migration `0035`; `auth-schema.test.ts` is the drift test — a schema-changing upgrade needs a hand-written migration). Google keys optional; auth pages use `authBranding` (agency or neutral); emails keep `defaultBranding()`'s fallback.
- **OAuth provider (migration `0041`):** the plugin seeds `auth."oauthResource"` once per instance — tests never truncate it (else `invalid_target`). Consent re-dispatches `/oauth2/authorize` *through hooks*, so an authorize before-hook must not undo it (`isConsentRequest`). Plugin endpoints aren't on `auth().api`'s type; call `auth().handler(new Request(...))`.
- **Magic-link sends run in Next's `after()`** (no account enumeration); `buildAuthOptions(..., { runInBackground })` needs the runner (`admin` CLI: `(p) => p`). In dev (no `POSTMARK_SERVER_TOKEN`) links land in `apps/web/.outbox/*.html`.
- **Self-serve sign-up (Phase 10) is a service fn, not a tool:** `/sign-up` calls `startAgencySignup` directly (no agency ctx); refused and accepted paths must stay identical (same redirect, 400 ms floor, `rm_signup` cookie always set). Magic-link/Google callback is `/onboarding/start`, which picks the new agency's membership.
- **`admin` CLI:** `pnpm --filter @cs/web admin invite --agency <id> --email <e> --role agency_admin` / `admin link --contact <id> --target brief --id <id>`.
- **A relative `EVIDENCE_FS_DIR` resolves against `apps/worker/`.**
- **Guest cookies (`rm_guest`, 24 h, client contacts via `/l/<token>`) are re-checked every request** (`active`, `links_revoked_before` vs `iat`), so deactivation ends them on the next request.
- **`/mcp` and `/.well-known/*` are public in `proxy.ts`** (Bearer token / public metadata; `/oauth/consent` stays behind the session). A new route under them needs its own auth; a new `/mcp`-adjacent path goes in the proxy `PUBLIC` list and the e2e rules.
- **`POST /api/ask/turn` (SSE) is public in `proxy.ts` and authenticates itself:** one `final` event per response, `emit` never throws, membership by the body's `clientId` (`getViewerForClient`), thread id in `x-ask-thread-id`.
- **Consent order (`/oauth/consent`):** `pickConsent` → plugin accept → `bindConsent` → redirect; a failed bind keeps the code server-side; authorize drops a consent with no binding.

- **`rm_pending_email`** is a signed cookie holding the address for the check-email resend; read it only server-side, never trust a query param.

### Platform & support sessions (8a/8b)
- **`/platform/**` lives in `app/(platform)/` and every page/action there uses `requireOperatorContext()`** (operator's own ctx, ignores `rm_support`); `/agency`, `/c` use `requireContext()`, which returns the synthetic support ctx during a session. Start/Exit/sign-out must use the operator ctx (a support ctx refuses every write).
- **Never set/clear cookies during render (Next 16):** support-cookie problems redirect to `GET /support/end?sid=…`; only that route (and `POST /support/exit`, sign-out) touches `rm_support`, and render passes `endStale: false`.
- **Every new write control needs `WriteGuard`/`useReadOnly()`** (`components/read-only.tsx`); `read-only-guard.test.ts` fails otherwise. Server refusal is the guarantee, hiding is UX.
- **Pages read via tools only** (direct reads skip support audit and masking; `server/theme.ts` aside); `/go`, `/files/*` call `recordSupportAccess`. `supportHidden` tools 404 in support: branch on `ctx.support`.

### UI patterns
- **Action-result state must survive `revalidatePath`:** a `useActionState` message inside the triggering button/dialog vanishes when revalidation unmounts it. Hoist it to an always-mounted component (`ReviewFooter`, `AlertList`). Server-action switches use `useOptimistic` + `startTransition` (`AutoSendSwitch`), not `PinPageSwitch`'s ref/RAF hack.
- **React 19 resets a `<form action>` after every action, error results included** — even controlled selects. Wizard forms control every field, add `onReset={e => e.preventDefault()}` (`(app)/onboarding/steps/*`), else a failed submit silently reverts choices.
- **`LineChart` callers must pass series name-sorted:** colours follow position in the kept set.
- **Formatting:** use `@/lib/format` (dates, money, distance) and `@/lib/labels` (enum labels, chip tones), never local formatters or raw enums. Distances: km stored, miles shown/typed via `lib/format/distance`.
- **Confirms with a result line:** `ConfirmForm` (`components/confirm-form.tsx`) for forms with visible fields; `ConfirmDialog` + `fields` + row-keyed result lines for row actions (`AlertList`, `TopicQueue`). Never a bare `ConfirmDialog` plus state inside the row.
- **Gates ratchet:** `lib/page-gates.ts` `GATED_PATHS = [...AREAS_2A]`; new pages in those areas are gated automatically. Escape a hit with `// format-gate: <reason>` (a reason is required).
- **No `loading.tsx` under `app/(app)` or `app/(platform)`** — it turns `notFound()` into HTTP 200; use `<Suspense fallback={<PageSkeleton/>}>` inside pages after access checks.
- **No mobile layout** (232px sidebar; 390px overview E2E is `fixme`).

### Help (15b)
- **Help copy (`@/help/copy`) is `server-only`:** client components get it from `HelpProvider` context (shell), never by importing copy values (`help/copy-bundle.test.ts` fails). A `<PageHeader` outside `page.tsx` goes in `DELEGATED_HEADERS` (`help/coverage.test.ts`); reach lists: `help/reach.ts`.
- **A `HelpTip`'s title is its accessible name:** Playwright `name:` matches substrings, so grep e2e locators for new tip titles; inside a heading, wrap the heading text in a `<span>`.

### Dev panel & environments
- **Run with `pnpm dev:web`.** `DEV_PANEL` is set only by `scripts/dev.ts`, never by hand or in prod. `RM_DEV_ENV_FILE` overrides the location of `.dev-env.json` (git-ignored; the selected database; ignored unless the guard holds).
- **Dev panel code lives only in `src/dev-panel/`**; markers `data-rm-dev-panel`/`x-rm-dev-panel` appear nowhere else — `scripts/check-no-dev-panel.ts` (in `pnpm e2e`) fails the build scan if they leak.
- **Per-environment factories (`perEnv`, `env-cache.ts`):** a new cached client in `src/server/` must use `perEnv`, and builders resolve dependencies **by the name given** (`dbs(name)`, `enqueueFor(name)`, …), never by re-reading the live environment (else a DEMO request mid-switch reaches cs_dev's queue). Routes needing several call `activeEnvName()` once and pass it.
- **Enqueue is refused in DEMO and TEST** (else `cs_demo` ids reach the real worker and paid vendors): throws "Background jobs are switched off while browsing DEMO or TEST data."; job status reads "no job"; un-rendered PDFs show "PDF rendering is off…".
- **Running the panel:** `next dev` binds `127.0.0.1` unless `-H`; panel POSTs need `x-rm-dev-panel: 1` and `Origin` = `Host`; demo sign-in via `/dev-panel/sign-in/<token>`. Use `localhost` (session cookie lost on `127.0.0.1`).

### E2E
- **`pnpm --filter @cs/web e2e`** (Playwright) is not part of `pnpm test`: it builds and starts a production server against `cs_test` (env from `playwright.config.ts`), runs as its own CI job, and never concurrently with another `cs_test` run.
- **Reuse signed-in sessions; never add a magic-link sign-in:** Better Auth allows 5 magic-link requests/IP/60 s; full runs already hit it (`smoke.spec` :6/:41 fail in full suites only). Specs reuse storage states. `latestMagicLink()`/`newMagicLink()` filter by recipient after an outbox snapshot.
- **"destination stream closed early" in the E2E server log is noise** (digest `3686933289`, no app frame): the browser closes the page mid-RSC/prefetch stream between tests; tests still pass (reproduced 3/3 runs of `workspace.spec`, 15c-2 T15). Ignore it unless an assertion fails.
- **`WEBHOOK_FAKE_SEND` is E2E-only;** never set it outside Playwright's web server.

### Affected-only E2E
- **During development run `pnpm --filter @cs/web e2e:affected`** (`--dry-run`, `--base <ref>`, `--full`): tests whose tags the changed files map to (plus `@smoke`), rebuilds only when needed. It can pull one test out of a `describe.serial` file (false failure) — re-run the whole file. Full `e2e` only in `/rm-merge`.
- **Every spec test carries tags:** `test('…', { tag: ['@pricing', …] }, …)`, one per module its steps touch; vocabulary in `KNOWN_TAGS` (`scripts/e2e-affected-rules.ts`). `@smoke` only on the two always-run smoke tests.
- **A new route, component or module needs a rule** in `scripts/e2e-affected-rules.ts` (first match wins; `'all'` when unsure). `scripts/e2e-affected.test.ts` fails on untagged tests, unknown/dead tags and web files that only hit a catch-all; run it without the DB via `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`.
- **`findBy*`'s 1 s default is too short for `next/dynamic` chunks under load:** pass `{ timeout: 15_000 }` (e.g. `PageGuide`).
