# Demo Data, Dev Panel and Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command (or one button) fills a separate `cs_demo` database with a fictional HVAC/plumbing data set that populates every screen; a local-only dev panel shows and switches the live database (DEV / DEMO / TEST); and `cs_dev` plus its evidence files can be snapshotted and restored without ever overwriting anything unconfirmed.

**Architecture:**
- **Shared database plumbing in `@cs/db`:** `resolveEnvironment` / `assertDatabase` and a generalised `wipeDatabase` / `resetDatabase` / `ensureDatabase`, which the test global setup now also uses.
- **New workspace package `@cs/demo`:**
  - a deterministic seed, one file per area, written directly through the Drizzle schema with the owner connection;
  - `coverage.ts`, the list of screens, plus a coverage test that calls every listed tool against a seeded `cs_test`;
  - the `demo:reset`, `demo:links`, `db:snapshot` and `db:restore` CLIs.
- **In `apps/web`:**
  - a three-condition guard;
  - per-environment caches for the database, storage, auth, registry and queue factories;
  - a console email sender;
  - the panel itself, which lives only in `src/dev-panel/`. It is reached through `process.env.NODE_ENV !== 'production'` dynamic imports, so a production build contains none of it.

**Tech Stack:** pnpm 10 + Turborepo 2.11.5, Next.js 16.3 App Router, React 19.3, Tailwind CSS 4 + shadcn (`@cs/ui`), Drizzle 0.44 / postgres.js on Neon with RLS, Better Auth 1.7.7, Zod 4, Vitest 3 + Testing Library + jsdom, Playwright 1.63, `sharp` 0.34 (WebP), `fflate` (zip; new dependency).

**Spec:** [docs/superpowers/specs/2026-10-09-demo-data-and-snapshots-design.md](../specs/2026-10-09-demo-data-and-snapshots-design.md). It is the binding authority. Every deviation is listed under "Spec deviations" below; each one needs the owner's yes before execution starts.

Also read: [docs/HANDOVER.md](../../HANDOVER.md) §4 (environment), §6 (gotchas). House style follows the [5c-2 plan](2026-10-08-phase-5c2-data-views.md).

---

## Spec deviations (owner to confirm before execution)

Each item names the spec text, why it cannot be done as written, and what this plan does instead.

1. **§4.8 "3 pending `theme_proposal`s".** This is impossible. `theme_proposal_pending_unique` (migration `0024`) allows at most one `proposed` row per vertical, and there are two verticals.
   - **This plan:** 2 pending proposals (one `hvac_plumbing`, one `dental`), plus 1 approved and 1 rejected decided in the last 30 days. Those last two show in the screen's "Decided" list.
2. **§4.1 Brazos Plumbing Co must show both "add your place id" and "own reviews pending".** These two states exclude each other. `get_rating_trend` sets `selfPending = client.place_id IS NOT NULL AND self_competitor_id IS NULL`, and the "add your place id" notice shows only when `place_id` is null.
   - **This plan:** Brazos has **no place id**, so it shows "add your place id". The "own reviews pending" state is not seeded.
   - **Alternative, owner's choice:** give Brazos a place id and no self row. That shows "pending" instead.
3. **§1 "fully fictional, all in one vertical (HVAC/plumbing)" vs §4.1 "Lakeside Family Dental".** The name is a dental practice.
   - **This plan:** Lakeside is seeded with vertical `dental`. It is a prospect, so it gets no recurring work, and it is what makes the second pending theme proposal possible (item 1).
   - **Alternative:** rename the prospect to an HVAC business. Lakeside would then stay `hvac_plumbing` and only one theme proposal could be pending.
4. **§5.2 "one signed link per demo user, made with `signLink` and `LINK_SIGNING_SECRET`".** The existing `/l/<token>` route gives agency contacts no session (it sends them to `/sign-in`) and gives client contacts only a read-only guest session. So a `/l/` link cannot sign anyone in as the agency admin (§8 E2E).
   - **This plan:** the links are still `signLink` tokens, but they point at a guarded `/dev-panel/sign-in/<token>` route. That route:
     1. verifies the token;
     2. refuses anything but an active `@demo.rivalmonday.test` contact outside DEV;
     3. starts a real Better Auth session by calling the magic-link API server-side. The link is captured in-process through a new optional `onMagicLink` hook in `buildAuthOptions`, and nothing is emailed.
5. **§5.2 / §5.3 "server actions".** The panel's actions (switch, links, reset, snapshot, sign-in) are **route handlers** under one catch-all `/dev-panel/[...path]`, not server actions.
   - **Why:** reset streams its output, which needs a `Response` body. Also, a route shell whose only import is a dead-code dynamic import keeps the panel out of production builds. Server actions declared in app files would be compiled in.
   - Every handler re-checks all three conditions and also requires an `x-rm-dev-panel: 1` header on POST (Review Focus 2).
6. **§5.4 "Behind the guard, they read the current environment from `.dev-env.json`".** The database, storage and auth factories are synchronous and are called outside any request. They cannot see the request host (condition 3), because Next 16's `headers()` is async.
   - **This plan:** the factories switch on conditions 1 and 2 only. The banner and every panel route check all three.
   - **Consequence:** someone opening a `DEV_PANEL=1` dev server from another machine on the LAN sees the active environment's data, without a banner and without any panel action. `DEV_PANEL` is set only by the local `dev` scripts.
7. **§7 "`pnpm dev` unchanged, plus `DEV_PANEL=1`".** There is no root `pnpm dev` today, only `pnpm dev:web`. Also, pnpm scripts run under `cmd.exe` on Windows, where `DEV_PANEL=1 next dev` does not work.
   - **This plan:**
     - `apps/web`'s `dev` script runs a small Node launcher (`scripts/dev.ts`) that sets `DEV_PANEL=1` and starts `next dev`;
     - root `dev` and `demo:dev` scripts are added;
     - `dev:web` keeps working.
8. **§3 "TEST … the test store".** This is ambiguous. **This plan** uses `apps/web/test-results/evidence`, the store the E2E seed writes to `cs_test`.
9. **Not in the spec: background jobs while browsing DEMO or TEST.** The web app's pg-boss queue uses `cs_dev`'s owner URL. A DEMO action that enqueues a job (for example accepting a suggestion, or rendering a PDF) would hand `cs_demo` ids to the real worker, which calls paid vendors.
   - **This plan:** in DEMO and TEST, enqueueing refuses with "Background jobs are switched off while browsing DEMO or TEST data.", and job status reads as "no job".
   - **Side effect:** PDF links in DEMO show an error page.
10. **Not in the spec: the platform operator needs a membership.** `hasSignInRight` requires a membership or an invitation, so `operator@demo.rivalmonday.test` is seeded as an `account_manager` of Brazos Digital.
11. **§4.1 "6 competitors for Lone Star Cooling".** The default `competitor_limit` is 5 (CHECK 1–10), so Lone Star is seeded with `competitor_limit = 8`.
12. **§4.6 "8 weekly `rank_scan`s per active client with keywords".** Brazos also gets 3 keywords and 8 scans. With no own business, it then shows the "no own business" grid states.
13. **§6.1 "Zip `apps/worker/.evidence` into `evidence.zip`".** Node has no zip support, so this adds the `fflate` dependency (pure JS, no native code).
14. **§6.2 restore.** Restore runs `pg_restore --clean --if-exists --no-owner`. In a database whose `public` schema was recreated by our wipe, `pg_dump` emits `CREATE SCHEMA public`, which would otherwise error on a fresh target.
    - Restore also refuses any target ending in `_test`, not only `cs_test`.
    - `--into <name>` for a database that does not exist creates it (the default path).

## Global Constraints

- **Toolchain:** Node 24, pnpm 10, Turborepo 2.11.5.
  - Before changing `turbo.json`, read `node_modules/turbo/docs/README.md` and the relevant `docs/` pages (repo `AGENTS.md` rule). Task 16 adds `PG_BIN` to `globalPassThroughEnv`.
  - Before writing Next.js code, read the bundled docs in `apps/web/node_modules/next/dist/docs/` for the API you touch (`apps/web/AGENTS.md`). Next 16: `params`, `cookies()` and `headers()` are **async**; `proxy.ts`, not `middleware.ts`.
- **`.env`:**
  - Never print `.env`, never edit it, never commit it.
  - Never stage `.env`, `.claude/`, `App/` or `.superpowers/`.
  - Never print a database URL or password. Errors name databases only. Snapshot manifests never hold a URL.
- **No outside calls:** no paid vendor or AI calls, no crawling, no real email. Nothing here starts the worker.
  - Demo contacts use `@demo.rivalmonday.test`.
  - Demo domains use the reserved `.example` TLD.
  - Demo webhooks point at a Slack URL that the worker never runs against.
- **Database names:** every destructive demo step calls `assertDatabase(url, 'cs_demo')` with that exact name.
  - The seed takes its expected database name as a parameter: `demo:reset` passes `'cs_demo'`, and the coverage test passes the `cs_test` name.
  - The seed refuses a database that already has an agency row.
- **Dev panel guard**, three conditions:
  1. `process.env.NODE_ENV !== 'production'`;
  2. `process.env.DEV_PANEL === '1'`;
  3. the request host is `localhost` or `127.0.0.1`.

  Rules:
  - Every panel route re-checks all three.
  - When any check fails, there is no banner and every `/dev-panel/*` route returns 404.
  - `.dev-env.json` is ignored when condition 1 or 2 fails.
  - Panel code lives only in `apps/web/src/dev-panel/`. It is reached only through `process.env.NODE_ENV !== 'production'` dynamic imports.
  - The markers `data-rm-dev-panel` and `x-rm-dev-panel` must appear nowhere else, because the build check (Task 19) looks for them.
- **File writes:** UTF-8 and LF only, using the Write/Edit tools. Never use PowerShell `Set-Content`/`Out-File` for repo files. `git ls-files --eol | grep crlf` must print nothing.
- **Seed determinism:**
  - Every timestamp is relative to the seed's `now` (`ctx.clock`). There are no fixed calendar dates.
  - There is one fixed seed, `DEMO_SEED = 20261009`, with one sub-stream per area (`ctx.rng('<area>')`).
  - No `Math.random()` or `Date.now()` inside seed code.
- **Writes:** the seed writes only through the `@cs/db` Drizzle schema with the owner connection. The one exception is `auth."user"`, which is inserted with one parameterised `sql` statement, as `apps/web/test/auth-fixtures.ts` does.
- **Commit trailer**, on every commit:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011CdACnbSPcFGHa1BoXhxaW
  ```
  Subagent implementers may name their own model.
- **Test runs:**
  - Focused runs use `pnpm --filter <pkg> exec vitest run <pattern>`, in the foreground with `timeout: 600000`.
  - Never start two test runs at once: they share `cs_test`.
  - Never hand back while a test run you started is still running.
  - Before E2E, check free commit memory (HANDOVER §6, ≥ ~8 GB).
  - The demo coverage test seeds about 400 reviews and 2,000 rank snapshots on Neon and takes several minutes. Run it in the foreground with the full timeout.
- **Implementer hygiene:** keep file writes moderate and commit as soon as a task's tests pass. After an API timeout, check `git status` before redoing anything.

## Review Focus

1. **A demo command pointed at the wrong database.** For example, `DATABASE_URL` already names something other than `cs_dev`, a URL carries query parameters, or a wipe is aimed at a database whose real name differs. Expected: refuse, name the database (never the URL), and change nothing. Tests: Task 1 (derivation refuses a non-`cs_dev` source), Task 2 (wipe refuses a mismatched name and a sentinel row survives), Task 12 (`runDemoReset` refuses before connecting; the evidence wipe refuses a directory not named `.evidence-demo`).
2. **Another site or another machine reaching the panel while the dev server runs.** A cross-site `fetch`/form POST, or a LAN browser. Expected: 404 for a non-local host, for a POST without `x-rm-dev-panel: 1`, and for a POST whose `Origin` is not local. Tests: Task 18 (handler tests).
3. **Signing in to a real account through the panel.** A token used while DEV is live, a token for a non-demo contact, or a tampered or expired token. Expected: `/link-expired`, never a session. Tests: Task 18 (`devSignIn` tests).
4. **A job or an email set off while browsing DEMO or TEST.** Expected: enqueueing refuses with the "Background jobs are switched off…" message, and nothing reaches `cs_dev`'s queue. With the guard on, sign-in emails go to the console, never Postmark. Tests: Task 14 (queue refuses for demo/test), Task 15 (console transport chosen when the guard is on, file/Postmark otherwise).
5. **A restore that half-happens.** A mistyped name, `pg_restore`/`pg_dump` too old, or a `_test` target. Expected: every check runs before anything destructive. On a mismatch, no snapshot, wipe or move-aside happens. Tests: Task 17 (fake-deps ordering tests, refusal tests), Task 16 (version message; a `pg_dump` failure never echoes the password).

---

## File structure

**`packages/db/`**
- `src/environments.ts` + test — create: `EnvName`, `ENV_NAMES`, `isEnvName`, `databaseNameOf`, `assertDatabase`, `withDatabase`, `resolveEnvironment` (Task 1).
- `src/reset.ts` + test — create: `wipeDatabase`, `resetDatabase`, `databaseExists`, `ensureDatabase`, `dropScratchDatabase` (Task 2).
- `src/index.ts` — modify: export both (Tasks 1, 2).
- `test/global-setup.ts` — modify: use `resetDatabase` with the `_test` guard kept (Task 2).

**`packages/demo/`** (new package `@cs/demo`)
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md` (Tasks 3, 11).
- `src/random.ts`, `src/clock.ts`, `src/geo.ts`, `src/ids.ts`, `src/context.ts`, `src/users.ts`, `src/links.ts`, `src/test-support.ts`, `src/index.ts` (Task 3).
- `src/tenancy.ts` (Task 3), `src/evidence.ts` + `src/changes.ts` (Task 4), `src/pricing.ts` (Task 5), `src/ads.ts` (Task 6), `src/names.ts` + `src/reviews.ts` (Task 7), `src/rankings.ts` (Task 8), `src/briefs.ts` (Task 9), `src/agency.ts` + `src/platform.ts` (Task 10). Each has a `*.test.ts`.
- `src/seed.ts`, `src/coverage.ts`, `src/coverage.test.ts`, `src/cli/coverage-readme.ts` (Task 11).
- `src/reset.ts` + test, `src/cli/reset.ts`, `src/cli/links.ts` (Task 12).
- `src/snapshot/pg-tools.ts`, `src/snapshot/manifest.ts`, `src/snapshot/zip.ts`, `src/snapshot/snapshot.ts`, tests, and `src/cli/snapshot.ts` (Task 16).
- `src/snapshot/restore.ts` + tests, `src/cli/restore.ts` (Task 17).

**`packages/email/`**
- `src/transport.ts` + test — modify: `createConsoleTransport` (Task 15).

**`apps/web/`**
- `src/server/dev-guard.ts` + test (Task 13).
- `src/server/env-cache.ts` + test, `src/server/runtime-env.ts` + test, `src/server/store.ts` (Task 14).
- Modified in Task 14: `src/server/db.ts` + new test, `src/server/files.ts` (drop `webStore`), `src/server/auth.ts`, `src/server/tools.ts`, `src/server/queue.ts` + test, `src/app/(app)/layout.tsx`, the three `src/app/files/**/route.ts`.
- Task 15: `src/server/dev-hooks.ts` (create); `src/server/auth-options.ts` + test and `src/server/auth.ts` (modify).
- Task 18:
  - `src/dev-panel/handler.ts` + test, `src/dev-panel/sign-in.ts` + test, `src/dev-panel/spawn-lines.ts`, `src/dev-panel/handlers.ts`, `src/dev-panel/banner.tsx` + test, `src/dev-panel/mount.tsx`;
  - `src/app/dev-panel/[...path]/route.ts`;
  - `src/app/layout.tsx`, `src/proxy.ts` (modify);
  - `scripts/dev.ts`, `scripts/dev-args.ts` + test;
  - `package.json`.
- Task 19: `scripts/check-no-dev-panel.ts` + test, `playwright.panel.config.ts`, `e2e-panel/panel.spec.ts`, `e2e/smoke.spec.ts` + `playwright.config.ts` + `tsconfig.json` (modify).

**Root**
- `package.json` — scripts (Tasks 12, 16, 17, 18).
- `.gitignore` — additions (Task 12).
- `turbo.json` — `PG_BIN` (Task 16).
- `README.md`, `docs/HANDOVER.md` (Task 20).

**Task order and dependencies.**
- Tasks 1 → 2 → 3, then the seed areas 4–10 in order (each one reads ids that earlier areas wrote), then 11 → 12.
- Tasks 13 → 14 → 15 depend only on Tasks 1 and 3 (for `@cs/demo/users`).
- Tasks 16 and 17 depend on Tasks 1 and 2.
- Task 18 depends on Tasks 3 and 12–17.
- Task 19 depends on Task 18.
- Task 20 is last.

---

### Task 1: Environment resolution and `assertDatabase`

**Files:**
- Create: `packages/db/src/environments.ts`, `packages/db/src/environments.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (exported from `@cs/db`):
  - `ENV_NAMES = ['dev', 'demo', 'test'] as const`, `type EnvName`, `isEnvName(v: unknown): v is EnvName`;
  - `DEV_DATABASE = 'cs_dev'`, `DEMO_DATABASE = 'cs_demo'`;
  - `databaseNameOf(url: string): string` throws `'Malformed database URL…'` and never echoes the URL;
  - `assertDatabase(url: string, expected: string): void` throws `Refusing to touch database "<name>": expected exactly "<expected>"`;
  - `withDatabase(url: string, name: string): string` swaps only the path and keeps the query string;
  - `interface ResolvedEnvironment { name: EnvName; ownerUrl: string; appUrl: string; serviceUrl: string; evidenceDir: string }`;
  - `resolveEnvironment(name: EnvName, opts: { repoRoot: string; env?: NodeJS.ProcessEnv }): ResolvedEnvironment`.

- [ ] **Step 1: Write the failing test** — `packages/db/src/environments.test.ts`:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDatabase, databaseNameOf, isEnvName, resolveEnvironment, withDatabase } from './environments';

const ROOT = join('/', 'repo');
const ENV = {
  DATABASE_URL: 'postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_dev?sslmode=require&channel_binding=require',
  APP_DATABASE_URL: 'postgresql://app_user:pw1@ep-x.neon.tech/cs_dev?sslmode=require',
  SERVICE_DATABASE_URL: 'postgresql://app_service:pw2@ep-x.neon.tech/cs_dev?sslmode=require',
  TEST_DATABASE_URL: 'postgresql://owner:pw3@ep-x.neon.tech/cs_test?sslmode=require',
  TEST_APP_DATABASE_URL: 'postgresql://app_user:pw4@ep-x.neon.tech/cs_test?sslmode=require',
  TEST_SERVICE_DATABASE_URL: 'postgresql://app_service:pw5@ep-x.neon.tech/cs_test?sslmode=require',
} as unknown as NodeJS.ProcessEnv;

describe('assertDatabase', () => {
  it('passes on an exact match', () => {
    expect(() => assertDatabase('postgresql://o:p@h/cs_demo?sslmode=require', 'cs_demo')).not.toThrow();
  });

  it.each([
    ['cs_dev', 'postgresql://o:p@h/cs_dev'],
    ['cs_test', 'postgresql://o:p@h/cs_test'],
    ['a different name', 'postgresql://o:p@h/cs_demo2'],
  ])('throws for %s', (_label, url) => {
    expect(() => assertDatabase(url, 'cs_demo')).toThrow(/expected exactly "cs_demo"/);
  });

  it('throws for a malformed URL without echoing it', () => {
    for (const bad of ['not a url', 'https://h/cs_demo', 'postgresql://o:secret@h/', 'postgresql://o:secret@h/a/b']) {
      expect(() => assertDatabase(bad, 'cs_demo')).toThrow(/Malformed database URL/);
      try {
        assertDatabase(bad, 'cs_demo');
      } catch (e) {
        expect((e as Error).message).not.toContain('secret');
      }
    }
  });
});

describe('databaseNameOf / withDatabase', () => {
  it('reads and swaps the database name, keeping credentials and query parameters', () => {
    expect(databaseNameOf(ENV.DATABASE_URL!)).toBe('cs_dev');
    expect(withDatabase(ENV.DATABASE_URL!, 'cs_demo')).toBe('postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_demo?sslmode=require&channel_binding=require');
  });

  it('refuses a name that is not a plain identifier', () => {
    expect(() => withDatabase(ENV.DATABASE_URL!, 'cs_demo; drop')).toThrow(/Invalid database name/);
  });
});

describe('resolveEnvironment', () => {
  it('DEV uses the existing variables and the worker evidence directory', () => {
    const r = resolveEnvironment('dev', { repoRoot: ROOT, env: ENV });
    expect(r).toEqual({
      name: 'dev', ownerUrl: ENV.DATABASE_URL, appUrl: ENV.APP_DATABASE_URL, serviceUrl: ENV.SERVICE_DATABASE_URL,
      evidenceDir: join(ROOT, 'apps', 'worker', '.evidence'),
    });
  });

  it('DEV honours a relative EVIDENCE_FS_DIR against apps/worker (HANDOVER §6)', () => {
    expect(resolveEnvironment('dev', { repoRoot: ROOT, env: { ...ENV, EVIDENCE_FS_DIR: './.ev' } }).evidenceDir).toBe(join(ROOT, 'apps', 'worker', '.ev'));
  });

  it('DEMO swaps cs_dev for cs_demo in all three URLs, query parameters included', () => {
    const r = resolveEnvironment('demo', { repoRoot: ROOT, env: ENV });
    expect(r.ownerUrl).toBe('postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_demo?sslmode=require&channel_binding=require');
    expect(r.appUrl).toBe('postgresql://app_user:pw1@ep-x.neon.tech/cs_demo?sslmode=require');
    expect(r.serviceUrl).toBe('postgresql://app_service:pw2@ep-x.neon.tech/cs_demo?sslmode=require');
    expect(r.evidenceDir).toBe(join(ROOT, 'apps', 'worker', '.evidence-demo'));
  });

  it('DEMO refuses to derive from a URL that is not cs_dev (Review Focus 1)', () => {
    expect(() => resolveEnvironment('demo', { repoRoot: ROOT, env: { ...ENV, DATABASE_URL: 'postgresql://o:p@h/cs_prod' } })).toThrow(/DATABASE_URL must name cs_dev/);
  });

  it('TEST uses the TEST_* variables and the E2E evidence store', () => {
    const r = resolveEnvironment('test', { repoRoot: ROOT, env: ENV });
    expect([r.ownerUrl, r.appUrl, r.serviceUrl]).toEqual([ENV.TEST_DATABASE_URL, ENV.TEST_APP_DATABASE_URL, ENV.TEST_SERVICE_DATABASE_URL]);
    expect(r.evidenceDir).toBe(join(ROOT, 'apps', 'web', 'test-results', 'evidence'));
  });

  it('names a missing variable', () => {
    expect(() => resolveEnvironment('test', { repoRoot: ROOT, env: {} as NodeJS.ProcessEnv })).toThrow('TEST_DATABASE_URL is required');
  });

  it('isEnvName accepts only the three names', () => {
    expect(['dev', 'demo', 'test', 'prod', 1, null].map(isEnvName)).toEqual([true, true, true, false, false, false]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/db exec vitest run src/environments.test.ts` (timeout 600000)
Expected: FAIL — `./environments` does not exist.

- [ ] **Step 3: Create `packages/db/src/environments.ts`:**

```ts
import { isAbsolute, join, resolve } from 'node:path';

/** Demo/dev-panel spec §3: the three local databases. */
export const ENV_NAMES = ['dev', 'demo', 'test'] as const;
export type EnvName = (typeof ENV_NAMES)[number];
export const isEnvName = (v: unknown): v is EnvName => typeof v === 'string' && (ENV_NAMES as readonly string[]).includes(v);

export const DEV_DATABASE = 'cs_dev';
export const DEMO_DATABASE = 'cs_demo';

export interface ResolvedEnvironment {
  name: EnvName;
  ownerUrl: string;
  appUrl: string;
  serviceUrl: string;
  /** Absolute directory of the filesystem evidence store for this database. */
  evidenceDir: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** The database name in a postgres URL. Errors never include the URL: it carries a password. */
export function databaseNameOf(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Malformed database URL');
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('Malformed database URL: not a postgres URL');
  const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!NAME.test(name)) throw new Error('Malformed database URL: no plain database name in the path');
  return name;
}

/** Spec §3: every destructive step names the exact database it may touch. */
export function assertDatabase(url: string, expected: string): void {
  const name = databaseNameOf(url);
  if (name !== expected) throw new Error(`Refusing to touch database "${name}": expected exactly "${expected}"`);
}

/** The same server, roles and query parameters, a different database. */
export function withDatabase(url: string, name: string): string {
  databaseNameOf(url);
  if (!NAME.test(name)) throw new Error(`Invalid database name "${name}"`);
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function need(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`${key} is required`);
  return v;
}

function demoFrom(env: NodeJS.ProcessEnv, key: string): string {
  const url = need(env, key);
  if (databaseNameOf(url) !== DEV_DATABASE) throw new Error(`${key} must name ${DEV_DATABASE} to derive ${DEMO_DATABASE} (it names "${databaseNameOf(url)}")`);
  return withDatabase(url, DEMO_DATABASE);
}

/** Spec §3: the one function that knows where each environment's databases and evidence live. */
export function resolveEnvironment(name: EnvName, opts: { repoRoot: string; env?: NodeJS.ProcessEnv }): ResolvedEnvironment {
  const env = opts.env ?? process.env;
  const worker = join(opts.repoRoot, 'apps', 'worker');
  if (name === 'dev') {
    const dir = env.EVIDENCE_FS_DIR?.trim();
    return {
      name, ownerUrl: need(env, 'DATABASE_URL'), appUrl: need(env, 'APP_DATABASE_URL'), serviceUrl: need(env, 'SERVICE_DATABASE_URL'),
      evidenceDir: dir ? (isAbsolute(dir) ? resolve(dir) : resolve(worker, dir)) : join(worker, '.evidence'),
    };
  }
  if (name === 'demo') {
    return {
      name, ownerUrl: demoFrom(env, 'DATABASE_URL'), appUrl: demoFrom(env, 'APP_DATABASE_URL'), serviceUrl: demoFrom(env, 'SERVICE_DATABASE_URL'),
      evidenceDir: join(worker, '.evidence-demo'),
    };
  }
  return {
    name, ownerUrl: need(env, 'TEST_DATABASE_URL'), appUrl: need(env, 'TEST_APP_DATABASE_URL'), serviceUrl: need(env, 'TEST_SERVICE_DATABASE_URL'),
    evidenceDir: join(opts.repoRoot, 'apps', 'web', 'test-results', 'evidence'),
  };
}
```

  `demoFrom`'s error names the variable and the database, never the URL. The test regex `DATABASE_URL must name cs_dev` matches it.

- [ ] **Step 4: Export it** — add `export * from './environments';` to `packages/db/src/index.ts`, in alphabetical position after `./client`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cs/db exec vitest run src/environments.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/db typecheck`: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/environments.ts packages/db/src/environments.test.ts packages/db/src/index.ts
git commit -m "feat(db): environment resolution and assertDatabase"
```

---

### Task 2: Generalised wipe, migrate and create

**Files:**
- Create: `packages/db/src/reset.ts`, `packages/db/src/reset.test.ts`
- Modify: `packages/db/test/global-setup.ts`, `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `assertDatabase`, `databaseNameOf` (Task 1); `runMigrations`, `MIGRATIONS_FOLDER` (`src/migrate.ts`).
- Produces (exported from `@cs/db`):
  - `wipeDatabase(ownerUrl: string, expected: string): Promise<void>` drops schemas `drizzle`, `auth` and `public`, then recreates `public`. It refuses unless both the URL's name **and** `current_database()` equal `expected` exactly.
  - `resetDatabase(ownerUrl: string, expected: string): Promise<void>` wipes, then runs migrations.
  - `databaseExists(maintenanceUrl: string, name: string): Promise<boolean>`.
  - `ensureDatabase(maintenanceUrl: string, name: string, grantTo?: string[]): Promise<'exists' | 'created'>`. On a refused `CREATE DATABASE` it throws `Create database <name> in the Neon console, then re-run.`
  - `dropScratchDatabase(maintenanceUrl: string, name: string): Promise<void>` drops only names starting `cs_roundtrip_` (used by the Task 16 round-trip test).
  - `NEON_CREATE_HINT(name: string): string`.

- [ ] **Step 1: Write the failing test** — `packages/db/src/reset.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openTestDbs, seedTenancy, testUrls, truncateAll } from '../test/helpers';
import { databaseNameOf } from './environments';
import { MIGRATIONS_FOLDER } from './migrate';
import { databaseExists, dropScratchDatabase, ensureDatabase, resetDatabase, wipeDatabase } from './reset';
import { agency } from './schema';

const name = databaseNameOf(testUrls.owner);

describe('wipeDatabase / resetDatabase', () => {
  it('refuses any name but the exact expected one and touches nothing (Review Focus 1)', async () => {
    const dbs = openTestDbs();
    try {
      await truncateAll(dbs.owner);
      await seedTenancy(dbs.owner);
      await expect(wipeDatabase(testUrls.owner, 'cs_demo')).rejects.toThrow(/expected exactly "cs_demo"/);
      await expect(wipeDatabase(testUrls.owner, `${name}x`)).rejects.toThrow(/expected exactly/);
      await expect(resetDatabase(testUrls.owner, 'cs_dev')).rejects.toThrow(/expected exactly "cs_dev"/);
      expect(await dbs.owner.select().from(agency)).toHaveLength(2);
    } finally {
      await dbs.closeAll();
    }
  });

  it('wipes and re-migrates the expected database', async () => {
    await resetDatabase(testUrls.owner, name);
    const dbs = openTestDbs();
    try {
      expect(await dbs.owner.select().from(agency)).toHaveLength(0);
      const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
      const [row] = [...(await dbs.owner.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`))];
      expect(Number(row!.n)).toBe(journal.entries.length);
    } finally {
      await dbs.closeAll();
    }
  });
});

describe('ensureDatabase', () => {
  it('reports an existing database without creating anything', async () => {
    expect(await databaseExists(testUrls.owner, name)).toBe(true);
    expect(await databaseExists(testUrls.owner, 'cs_never_created_here')).toBe(false);
    expect(await ensureDatabase(testUrls.owner, name)).toBe('exists');
  });

  it('refuses names that are not plain lower-case identifiers', async () => {
    await expect(ensureDatabase(testUrls.owner, 'Bad-Name; drop')).rejects.toThrow(/Invalid database name/);
  });

  it('drops only cs_roundtrip_ scratch databases', async () => {
    await expect(dropScratchDatabase(testUrls.owner, name)).rejects.toThrow(/only cs_roundtrip_/);
    await expect(dropScratchDatabase(testUrls.owner, 'cs_dev')).rejects.toThrow(/only cs_roundtrip_/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/db exec vitest run src/reset.test.ts` (timeout 600000)
Expected: FAIL — `./reset` does not exist.

- [ ] **Step 3: Create `packages/db/src/reset.ts`:**

```ts
import postgres from 'postgres';
import { assertDatabase } from './environments';
import { runMigrations } from './migrate';

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const ROLE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export const NEON_CREATE_HINT = (name: string) => `Create database ${name} in the Neon console, then re-run.`;

const connect = (url: string) => postgres(url, { max: 1, onnotice: () => {} });

/**
 * Spec §7: the wipe that `packages/db/test/global-setup.ts` used to do inline, generalised to an exact expected name.
 * Both the URL's database name and the server's `current_database()` must equal `expected`.
 */
export async function wipeDatabase(ownerUrl: string, expected: string): Promise<void> {
  assertDatabase(ownerUrl, expected);
  const sql = connect(ownerUrl);
  try {
    const [row] = await sql<{ current_database: string }[]>`select current_database()`;
    if (row?.current_database !== expected) throw new Error(`Refusing to wipe database "${row?.current_database}": expected exactly "${expected}"`);
    await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await sql.end();
  }
}

export async function resetDatabase(ownerUrl: string, expected: string): Promise<void> {
  await wipeDatabase(ownerUrl, expected);
  await runMigrations(ownerUrl);
}

export async function databaseExists(maintenanceUrl: string, name: string): Promise<boolean> {
  const sql = connect(maintenanceUrl);
  try {
    return (await sql`select 1 from pg_database where datname = ${name}`).length > 0;
  } finally {
    await sql.end();
  }
}

/**
 * Spec §7: `CREATE DATABASE` through the owner role, then the CONNECT grant the migrations' role grants rely on.
 * `maintenanceUrl` is any database on the same server the owner may connect to (cs_dev). Neon may refuse.
 */
export async function ensureDatabase(maintenanceUrl: string, name: string, grantTo: string[] = []): Promise<'exists' | 'created'> {
  if (!IDENT.test(name)) throw new Error(`Invalid database name "${name}"`);
  for (const r of grantTo) if (!ROLE.test(r)) throw new Error('Invalid role name');
  if (await databaseExists(maintenanceUrl, name)) return 'exists';
  const sql = connect(maintenanceUrl);
  try {
    try {
      await sql.unsafe(`CREATE DATABASE "${name}"`);
    } catch (e) {
      throw new Error(`${NEON_CREATE_HINT(name)} (${(e as Error).message})`);
    }
    if (grantTo.length) await sql.unsafe(`GRANT CONNECT ON DATABASE "${name}" TO ${grantTo.map((r) => `"${r}"`).join(', ')}`);
    return 'created';
  } finally {
    await sql.end();
  }
}

/** Only the snapshot round-trip test's scratch databases may be dropped from code. */
export async function dropScratchDatabase(maintenanceUrl: string, name: string): Promise<void> {
  if (!IDENT.test(name) || !name.startsWith('cs_roundtrip_')) throw new Error(`Refusing to drop "${name}": only cs_roundtrip_ scratch databases`);
  const sql = connect(maintenanceUrl);
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await sql.end();
  }
}
```

- [ ] **Step 4: Export it and use it in the test global setup.**
  - Add `export * from './reset';` to `packages/db/src/index.ts`, after `./migrate`.
  - Replace the body of `packages/db/test/global-setup.ts`:

```ts
import { databaseNameOf } from '../src/environments';
import { resetDatabase } from '../src/reset';
import { testUrls } from './helpers';

/** Test databases must end with `_test`; the reset itself then demands that exact name (spec §7). */
export default async function setup(): Promise<void> {
  const name = databaseNameOf(testUrls.owner);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset database "${name}": test database names must end with _test`);
  }
  await resetDatabase(testUrls.owner, name);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @cs/db exec vitest run src/reset.test.ts src/schema.test.ts` (timeout 600000)
Expected: PASS. The global setup itself now runs through `resetDatabase`. Then `pnpm --filter @cs/db typecheck`: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/reset.ts packages/db/src/reset.test.ts packages/db/src/index.ts packages/db/test/global-setup.ts
git commit -m "feat(db): generalised wipe/reset/create with an exact expected name"
```

---

### Task 3: `@cs/demo` scaffold, tenancy, demo users and sign-in links

**Files:**
- Create:
  - `packages/demo/package.json`, `packages/demo/tsconfig.json`, `packages/demo/vitest.config.ts`;
  - `packages/demo/src/random.ts`, `src/clock.ts`, `src/geo.ts`, `src/ids.ts`, `src/context.ts`, `src/users.ts`, `src/links.ts`, `src/tenancy.ts`, `src/test-support.ts`, `src/index.ts`;
  - tests: `src/random.test.ts`, `src/tenancy.test.ts`.
- Modify: `pnpm-lock.yaml` (via `pnpm install`).

**Interfaces:**
- Consumes:
  - `createDb`, `type Db`, and the tables `agency`, `client`, `competitor`, `clientCompetitor`, `trackedPage`, `competitorSource`, `membership`, `contact` (`@cs/db`);
  - `createInvitation(service, NewInvitation, now)` and `acceptInvitations(service, { id, email, name }, now)` (`@cs/tools`);
  - `signLink` (`@cs/core`);
  - `type ObjectStore` (`@cs/storage`).
- Produces:
  - `class Rng { next(): number; int(min, max): number; between(min, max): number; pick<T>(xs: readonly T[]): T; chance(p): boolean }`, `DEMO_SEED = 20261009`, `hashString(s): number`.
  - `DAY`, `interface DemoClock { now; daysAgo(days): Date; nextMonday: string; pastMondays: string[]; monthStart: Date }`, `createClock(now)`, `atUtc(isoDate, hour?)`, `notAfter(d, limit)`.
  - `distanceKm(a: LatLng, b: LatLng): number`, `type LatLng = { lat: number; lng: number }`.
  - `DemoIds` and friends (`ids.ts`, below), `emptyIds()`.
  - `interface SeedContext { db; store; clock; salt; log; ids; rng(area: string): Rng }`, `createSeedContext({ db, store, now, salt, log? })`.
  - `DEMO_DOMAIN`, `DEMO_OPERATOR_EMAIL`, `type DemoUserKey`, `DEMO_USERS`, `isDemoEmail` (`users.ts`, also the `@cs/demo/users` subpath).
  - `DEMO_SIGN_IN_PATH = '/dev-panel/sign-in'`, `interface DemoLink { key; label; email; url }`, `demoSignInLinks(service: Db, { secret, baseUrl, now? }): Promise<DemoLink[]>` (`@cs/demo/links`).
  - `seedTenancy(ctx)`, `CLIENT_SPECS`, `CLIENT_THRESHOLDS`, `LONE_STAR_PLACE_ID`, `DEMO_COLLECTOR`.
  - Test helpers: `TEST_SALT`, `resetDemoTables(db)`, `countRows(db, query)`.

- [ ] **Step 1: Create the package files.**

`packages/demo/package.json`:

```json
{
  "name": "@cs/demo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./links": "./src/links.ts",
    "./users": "./src/users.ts"
  },
  "scripts": {
    "typecheck": "tsc -p .",
    "test": "vitest run"
  },
  "dependencies": {
    "@cs/collectors": "workspace:*",
    "@cs/core": "workspace:*",
    "@cs/db": "workspace:*",
    "@cs/storage": "workspace:*",
    "@cs/tools": "workspace:*",
    "drizzle-orm": "^0.44.5",
    "postgres": "^3.4.7"
  },
  "devDependencies": {
    "@cs/engine": "workspace:*",
    "@cs/verticals": "workspace:*",
    "@types/node": "^22.18.0",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

`packages/demo/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "vitest.config.ts"] }
```

`packages/demo/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI, where env vars are injected directly)
}

export default defineConfig({
  test: {
    globalSetup: ['../db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    // The coverage test seeds the whole data set on Neon in its beforeAll.
    hookTimeout: 900_000,
  },
});
```

Run: `pnpm install` (adds the workspace package to the lockfile).

- [ ] **Step 2: Write the failing tests.**

`packages/demo/src/random.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createClock, DAY } from './clock';
import { DEMO_SEED, hashString, Rng } from './random';

describe('Rng', () => {
  it('replays the same sequence for the same seed and differs per area', () => {
    const a = new Rng(DEMO_SEED ^ hashString('reviews'));
    const b = new Rng(DEMO_SEED ^ hashString('reviews'));
    const c = new Rng(DEMO_SEED ^ hashString('ads'));
    const seq = (r: Rng) => Array.from({ length: 5 }, () => r.next());
    const first = seq(a);
    expect(seq(b)).toEqual(first);
    expect(seq(c)).not.toEqual(first);
  });

  it('keeps int() inside its bounds', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('createClock', () => {
  it('puts the next delivery Monday after today and four past Mondays a week apart', () => {
    const c = createClock(new Date('2026-10-09T15:00:00Z')); // a Friday
    expect(c.nextMonday).toBe('2026-10-12');
    expect(c.pastMondays).toEqual(['2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14']);
    expect(c.daysAgo(2).getTime()).toBe(new Date('2026-10-09T15:00:00Z').getTime() - 2 * DAY);
    expect(c.monthStart.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('treats a Monday as a past delivery day, not the next one', () => {
    const c = createClock(new Date('2026-10-12T09:00:00Z'));
    expect(c.nextMonday).toBe('2026-10-19');
    expect(c.pastMondays[0]).toBe('2026-10-12');
  });
});
```

`packages/demo/src/tenancy.test.ts`:

```ts
import { verifyLink } from '@cs/core';
import { client, clientCompetitor, competitor, contact, membership } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { hasSignInRight } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { distanceKm } from './geo';
import { demoSignInLinks } from './links';
import { CLIENT_SPECS, seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';
import { DEMO_USERS } from './users';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
});

describe('seedTenancy', () => {
  it('creates Brazos Digital, three clients and their competitors, plus Lone Star’s own business', async () => {
    const clients = await dbs.owner.select().from(client);
    expect(clients.map((c) => [c.name, c.status, c.verticalId]).sort()).toEqual([
      ['Brazos Plumbing Co', 'active', 'hvac_plumbing'],
      ['Lakeside Family Dental', 'prospect', 'dental'],
      ['Lone Star Cooling', 'active', 'hvac_plumbing'],
    ]);
    const lone = clients.find((c) => c.name === 'Lone Star Cooling')!;
    expect(lone.selfCompetitorId).toBe(ctx.ids.selfLoneStar);
    expect(lone.keywords).toHaveLength(3);
    expect(lone.serviceArea?.radiusKm).toBe(25);
    expect(clients.find((c) => c.name === 'Brazos Plumbing Co')!.placeId).toBeNull();
    const links = await dbs.owner.select().from(clientCompetitor);
    expect(links.filter((l) => l.clientId === ctx.ids.clients.loneStar)).toHaveLength(6);
    expect(links.filter((l) => l.clientId === ctx.ids.clients.brazos)).toHaveLength(4);
    expect(links.filter((l) => l.clientId === ctx.ids.clients.lakeside)).toHaveLength(2);
    expect(links.some((l) => l.competitorId === ctx.ids.selfLoneStar)).toBe(false);
    expect(await dbs.owner.select().from(competitor)).toHaveLength(13);
  });

  it('places every competitor inside its client’s service area', () => {
    for (const key of ['loneStar', 'brazos', 'lakeside'] as const) {
      const area = CLIENT_SPECS[key].serviceArea;
      for (const c of ctx.ids.competitors[key]) expect(distanceKm(area.center, c)).toBeLessThan(area.radiusKm);
    }
  });

  it('marks one competitor per area as having no data on purpose', () => {
    const all = Object.values(ctx.ids.noData);
    expect(new Set(all).size).toBe(4);
    for (const id of all) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives every demo user a membership, a linked contact and a right to sign in', async () => {
    const rows = await dbs.owner.select({ role: membership.role, userId: membership.userId, contactId: membership.contactId }).from(membership);
    expect(rows).toHaveLength(DEMO_USERS.length);
    for (const u of DEMO_USERS) {
      const m = rows.find((r) => r.userId === ctx.ids.users[u.key].userId)!;
      expect(m.role).toBe(u.role);
      const [c] = await dbs.owner.select().from(contact).where(eq(contact.id, m.contactId!));
      expect(c!.email).toBe(u.email);
      expect(await hasSignInRight(dbs.owner, u.email)).toBe(true);
    }
  });

  it('signs one working sign-in link per demo user', async () => {
    const secret = 'k'.repeat(40);
    const links = await demoSignInLinks(dbs.owner, { secret, baseUrl: 'http://localhost:3000/' });
    expect(links.map((l) => l.key)).toEqual(DEMO_USERS.map((u) => u.key));
    for (const l of links) {
      expect(l.url.startsWith('http://localhost:3000/dev-panel/sign-in/')).toBe(true);
      const claims = verifyLink([secret], l.url.split('/dev-panel/sign-in/')[1]!);
      expect(claims?.sub).toBe(ctx.ids.users[l.key].contactId);
    }
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @cs/demo exec vitest run src/random.test.ts src/tenancy.test.ts` (timeout 600000)
Expected: FAIL — the modules don't exist.

- [ ] **Step 4: Create the small modules.**

`packages/demo/src/random.ts`:

```ts
/** Spec §4: one fixed seed; each area draws from its own sub-stream so adding data to one area never shifts another. */
export const DEMO_SEED = 20261009;

/** FNV-1a, 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. */
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  between(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
```

`packages/demo/src/clock.ts`:

```ts
export const DAY = 86_400_000;

/** Spec §4: every demo timestamp is relative to the moment of seeding. */
export interface DemoClock {
  now: Date;
  daysAgo(days: number): Date;
  /** The next delivery Monday strictly after today (UTC date), YYYY-MM-DD. */
  nextMonday: string;
  /** The four Mondays before `nextMonday`, newest first. */
  pastMondays: string[];
  monthStart: Date;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function createClock(now: Date): DemoClock {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const toNext = (8 - new Date(today).getUTCDay()) % 7 || 7;
  const next = today + toNext * DAY;
  return {
    now,
    daysAgo: (days) => new Date(now.getTime() - days * DAY),
    nextMonday: isoDate(next),
    pastMondays: [1, 2, 3, 4].map((w) => isoDate(next - 7 * w * DAY)),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

export const atUtc = (isoDay: string, hour = 0): Date => new Date(`${isoDay}T${String(hour).padStart(2, '0')}:00:00Z`);

/** `d`, or `limit` when `d` would be later. */
export const notAfter = (d: Date, limit: Date): Date => (d.getTime() > limit.getTime() ? limit : d);
```

`packages/demo/src/geo.ts`:

```ts
export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
```

`packages/demo/src/users.ts` (no DB imports — `apps/web` imports this subpath):

```ts
/** Spec §4.1 / §5.5: an undeliverable domain (RFC 2606 `.test`). */
export const DEMO_DOMAIN = 'demo.rivalmonday.test';
export const DEMO_OPERATOR_EMAIL = `operator@${DEMO_DOMAIN}`;

export type DemoUserKey = 'operator' | 'admin' | 'member' | 'ownerLoneStar' | 'ownerBrazos';

export interface DemoUserSpec {
  key: DemoUserKey;
  email: string;
  name: string;
  role: 'agency_admin' | 'account_manager' | 'client_owner';
  client?: 'loneStar' | 'brazos';
  label: string;
}

export const DEMO_USERS: readonly DemoUserSpec[] = [
  // Deviation 10: an operator still needs a membership to sign in.
  { key: 'operator', email: DEMO_OPERATOR_EMAIL, name: 'Olivia Operator', role: 'account_manager', label: 'Platform operator' },
  { key: 'admin', email: `admin@${DEMO_DOMAIN}`, name: 'Avery Admin', role: 'agency_admin', label: 'Agency admin' },
  { key: 'member', email: `member@${DEMO_DOMAIN}`, name: 'Morgan Member', role: 'account_manager', label: 'Agency member' },
  { key: 'ownerLoneStar', email: `owner.lonestar@${DEMO_DOMAIN}`, name: 'Luis Ortega', role: 'client_owner', client: 'loneStar', label: 'Client owner — Lone Star Cooling' },
  { key: 'ownerBrazos', email: `owner.brazos@${DEMO_DOMAIN}`, name: 'Bea Navarro', role: 'client_owner', client: 'brazos', label: 'Client owner — Brazos Plumbing Co' },
];

export const isDemoEmail = (email: string): boolean => email.trim().toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
```

`packages/demo/src/links.ts`:

```ts
import { signLink } from '@cs/core';
import { contact, type Db } from '@cs/db';
import { and, eq, isNotNull, like } from 'drizzle-orm';
import { DEMO_DOMAIN, DEMO_USERS, type DemoUserKey } from './users';

export * from './users';

/** Deviation 4: links open the guarded dev-panel sign-in route, never `/l/`. */
export const DEMO_SIGN_IN_PATH = '/dev-panel/sign-in';

export interface DemoLink {
  key: DemoUserKey;
  label: string;
  email: string;
  url: string;
}

/** Spec §5.2: one signed link per demo user that exists in `service`'s database, in DEMO_USERS order. */
export async function demoSignInLinks(service: Db, opts: { secret: string; baseUrl: string; now?: Date }): Promise<DemoLink[]> {
  const rows = await service
    .select({ id: contact.id, email: contact.email, agencyId: contact.agencyId, clientId: contact.clientId })
    .from(contact)
    .where(and(like(contact.email, `%@${DEMO_DOMAIN}`), isNotNull(contact.userId), eq(contact.active, true)));
  const base = opts.baseUrl.replace(/\/+$/, '');
  const out: DemoLink[] = [];
  for (const u of DEMO_USERS) {
    const c = rows.find((r) => r.email.toLowerCase() === u.email);
    if (!c) continue;
    const token = signLink(opts.secret, { sub: c.id, agency: c.agencyId, client: c.clientId ?? c.agencyId, t: 'notifications', id: c.id }, opts.now);
    out.push({ key: u.key, label: u.label, email: u.email, url: `${base}${DEMO_SIGN_IN_PATH}/${token}` });
  }
  return out;
}
```

`packages/demo/src/ids.ts`:

```ts
import type { DemoUserKey } from './users';

export type DemoClientKey = 'loneStar' | 'brazos' | 'lakeside';
export type ActiveClientKey = 'loneStar' | 'brazos';
export type Route = 'alert' | 'brief' | 'archive';

export interface DemoCompetitor {
  id: string;
  name: string;
  slug: string;
  domain: string;
  placeId: string;
  lat: number;
  lng: number;
}

export interface DemoEvent {
  id: string;
  client: ActiveClientKey;
  competitorId: string;
  changeId: string;
  changeType: string;
  source: string;
  route: Route;
  score: number;
  occurredAt: Date;
  summary: string;
  /** The after screenshot (web) or the vendor JSON (other sources). */
  evidenceIds: string[];
}

export interface DemoMove {
  id: string;
  client: ActiveClientKey;
  competitorId: string;
  moveType: string;
  open: boolean;
  summary: string;
}

/** Everything later seed areas, the coverage test and the CLIs need to find again. */
export interface DemoIds {
  agencyId: string;
  clients: Record<DemoClientKey, string>;
  selfLoneStar: string;
  competitors: Record<DemoClientKey, DemoCompetitor[]>;
  /** Spec §4.1: one competitor with no data in each area, on purpose. */
  noData: { pricing: string; ads: string; reviews: string; rankings: string };
  users: Record<DemoUserKey, { userId: string; contactId: string; email: string }>;
  /** competitor id → its tracked page ids. */
  pages: Record<string, { home: string; pricing: string }>;
  events: DemoEvent[];
  moves: DemoMove[];
  sampleReviewIds: string[];
  briefs: { sentLoneStar: string[]; sentBrazos: string[]; readyLoneStar: string; quietBrazos: string };
  alerts: { delivered: string; pending: string; dismissed: string };
  reportId: string;
}

export function emptyIds(): DemoIds {
  return {
    agencyId: '',
    clients: { loneStar: '', brazos: '', lakeside: '' },
    selfLoneStar: '',
    competitors: { loneStar: [], brazos: [], lakeside: [] },
    noData: { pricing: '', ads: '', reviews: '', rankings: '' },
    users: {} as DemoIds['users'],
    pages: {},
    events: [],
    moves: [],
    sampleReviewIds: [],
    briefs: { sentLoneStar: [], sentBrazos: [], readyLoneStar: '', quietBrazos: '' },
    alerts: { delivered: '', pending: '', dismissed: '' },
    reportId: '',
  };
}
```

`packages/demo/src/context.ts`:

```ts
import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { createClock, type DemoClock } from './clock';
import { type DemoIds, emptyIds } from './ids';
import { DEMO_SEED, hashString, Rng } from './random';

export interface SeedContext {
  /** Owner connection (BYPASSRLS) to the database being seeded. */
  db: Db;
  /** Evidence store of that database (the DEMO directory, or a memory/temp store in tests). */
  store: ObjectStore;
  clock: DemoClock;
  /** REVIEWER_HASH_SALT (spec §4.5: reviewer hashes use the normal salt function). */
  salt: string;
  log: (line: string) => void;
  ids: DemoIds;
  /** A fresh, deterministic stream for one area. */
  rng(area: string): Rng;
}

export function createSeedContext(o: { db: Db; store: ObjectStore; now: Date; salt: string; log?: (line: string) => void }): SeedContext {
  return {
    db: o.db, store: o.store, clock: createClock(o.now), salt: o.salt, log: o.log ?? (() => {}), ids: emptyIds(),
    rng: (area) => new Rng(DEMO_SEED ^ hashString(area)),
  };
}
```

`packages/demo/src/test-support.ts` (imported only by `*.test.ts`):

```ts
import type { Db } from '@cs/db';
import { truncateAll } from '@cs/db/test-helpers';
import { type SQL, sql } from 'drizzle-orm';

export const TEST_SALT = 'demo-test-salt-'.repeat(3);

/** Empty every public table and every Better Auth table (the demo seed refuses a non-empty database). */
export async function resetDemoTables(owner: Db): Promise<void> {
  await truncateAll(owner);
  await owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
}

export async function countRows(db: Db, query: SQL): Promise<number> {
  const [row] = [...(await db.execute<{ n: number }>(query))];
  return Number(row?.n ?? 0);
}
```

- [ ] **Step 5: Create `packages/demo/src/tenancy.ts`:**

```ts
import { agency, client, clientCompetitor, competitor, competitorSource, membership, type ServiceArea, trackedPage } from '@cs/db';
import { acceptInvitations, createInvitation } from '@cs/tools';
import { eq, sql } from 'drizzle-orm';
import type { SeedContext } from './context';
import type { ActiveClientKey, DemoClientKey, DemoCompetitor } from './ids';
import { DEMO_USERS } from './users';

export const DEMO_COLLECTOR = 'demo-seed';
export const LONE_STAR_PLACE_ID = 'demo-place-lone-star-cooling';
const GRANBURY = { lat: 32.4421, lng: -97.7942 };

/** Lone Star's custom alert rules (spec §4.7); Brazos keeps the pack defaults. */
export const CLIENT_THRESHOLDS: Record<ActiveClientKey, { alert: number; brief: number }> = { loneStar: { alert: 65, brief: 35 }, brazos: { alert: 70, brief: 40 } };

interface ClientSpec {
  name: string;
  verticalId: string;
  status: 'active' | 'prospect';
  features: string[];
  services: string[];
  keywords: string[];
  serviceArea: ServiceArea & { radiusKm: number };
  competitorLimit: number;
  competitors: { name: string; slug: string; lat: number; lng: number }[];
}

export const CLIENT_SPECS: Record<DemoClientKey, ClientSpec> = {
  loneStar: {
    name: 'Lone Star Cooling', verticalId: 'hvac_plumbing', status: 'active', features: ['dashboard', 'alert_rules', 'manage_competitors'],
    services: ['ac_tune_up', 'ac_repair', 'ac_install', 'furnace_tune_up', 'furnace_repair', 'duct_cleaning', 'maintenance_plan'],
    keywords: ['ac repair granbury', 'hvac contractor', 'furnace repair'],
    serviceArea: { center: GRANBURY, radiusKm: 25, zips: ['76048', '76049', '76050'], towns: ['Granbury', 'Acton', 'Tolar', 'Lipan'] },
    competitorLimit: 8, // deviation 11
    competitors: [
      { name: 'Hill Country Air & Heat', slug: 'hill-country-air', lat: 32.457, lng: -97.771 },
      { name: 'Granbury Comfort Pros', slug: 'granbury-comfort-pros', lat: 32.431, lng: -97.8105 },
      { name: 'Brazos Valley HVAC', slug: 'brazos-valley-hvac', lat: 32.3925, lng: -97.735 },
      { name: 'Lake Granbury Heating & Air', slug: 'lake-granbury-heating', lat: 32.4705, lng: -97.832 },
      { name: 'Pecan Plantation Mechanical', slug: 'pecan-plantation-mechanical', lat: 32.354, lng: -97.676 },
      { name: 'Acton Climate Control', slug: 'acton-climate-control', lat: 32.433, lng: -97.687 },
    ],
  },
  brazos: {
    name: 'Brazos Plumbing Co', verticalId: 'hvac_plumbing', status: 'active', features: ['dashboard'],
    services: ['drain_cleaning', 'water_heater', 'leak_repair', 'sewer_line', 'emergency_service'],
    keywords: ['plumber granbury', 'drain cleaning', 'water heater repair'], // deviation 12
    serviceArea: { center: { lat: 32.41, lng: -97.76 }, radiusKm: 20, zips: ['76048', '76049'], towns: ['Granbury'] },
    competitorLimit: 5,
    competitors: [
      { name: 'Cleburne Rooter & Drain', slug: 'cleburne-rooter', lat: 32.395, lng: -97.71 },
      { name: 'Twin Oaks Plumbing', slug: 'twin-oaks-plumbing', lat: 32.448, lng: -97.762 },
      { name: 'Comanche Peak Plumbing', slug: 'comanche-peak-plumbing', lat: 32.37, lng: -97.79 },
      { name: 'Stockton Bend Water Heaters', slug: 'stockton-bend-water-heaters', lat: 32.421, lng: -97.82 },
    ],
  },
  lakeside: {
    name: 'Lakeside Family Dental', verticalId: 'dental', status: 'prospect', features: [], services: [], // deviation 3
    keywords: ['dentist granbury', 'family dentist'],
    serviceArea: { center: GRANBURY, radiusKm: 15, zips: ['76048'] },
    competitorLimit: 5,
    competitors: [
      { name: 'Granbury Smiles Dental', slug: 'granbury-smiles', lat: 32.444, lng: -97.788 },
      { name: 'Harbor Lakes Family Dentistry', slug: 'harbor-lakes-dentistry', lat: 32.438, lng: -97.77 },
    ],
  },
};

const SOURCES = ['gbp', 'reviews', 'ads_google', 'ads_meta'] as const;

/** Spec §4.1. */
export async function seedTenancy(ctx: SeedContext): Promise<void> {
  const { db, clock, ids } = ctx;
  const [a] = await db.insert(agency).values({
    name: 'Brazos Digital',
    branding: { displayName: 'Brazos Digital', primary: '#1F7A8C', secondary: '#0F4C5C', fromName: 'Brazos Digital', signOff: 'The Brazos Digital team' },
    createdAt: clock.daysAgo(400),
  }).returning({ id: agency.id });
  ids.agencyId = a!.id;

  for (const key of ['loneStar', 'brazos', 'lakeside'] as const) {
    const s = CLIENT_SPECS[key];
    const [c] = await db.insert(client).values({
      agencyId: ids.agencyId, name: s.name, verticalId: s.verticalId, status: s.status, features: s.features, services: s.services, keywords: s.keywords,
      serviceArea: s.serviceArea, placeId: key === 'loneStar' ? LONE_STAR_PLACE_ID : null,
      scoreThresholds: key === 'loneStar' ? CLIENT_THRESHOLDS.loneStar : null, competitorLimit: s.competitorLimit,
      createdAt: clock.daysAgo(key === 'lakeside' ? 10 : 400),
    }).returning({ id: client.id });
    ids.clients[key] = c!.id;
    ids.competitors[key] = await seedCompetitors(ctx, key, s);
  }

  const [self] = await db.insert(competitor).values({ name: 'Lone Star Cooling', domain: 'lone-star-cooling.example', placeId: LONE_STAR_PLACE_ID, createdAt: clock.daysAgo(390) }).returning({ id: competitor.id });
  ids.selfLoneStar = self!.id;
  await db.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, ids.clients.loneStar));

  const ls = ids.competitors.loneStar;
  const bz = ids.competitors.brazos;
  ids.noData = { pricing: ls[5]!.id, ads: ls[4]!.id, reviews: bz[3]!.id, rankings: ls[3]!.id };

  await seedUsers(ctx);
}

async function seedCompetitors(ctx: SeedContext, key: DemoClientKey, s: ClientSpec): Promise<DemoCompetitor[]> {
  const { db, clock, ids } = ctx;
  const out: DemoCompetitor[] = [];
  for (const spec of s.competitors) {
    const domain = `${spec.slug}.example`;
    const placeId = `demo-place-${spec.slug}`;
    const [row] = await db.insert(competitor).values({ name: spec.name, domain, placeId, createdAt: clock.daysAgo(395) }).returning({ id: competitor.id });
    const id = row!.id;
    await db.insert(clientCompetitor).values({ agencyId: ids.agencyId, clientId: ids.clients[key], competitorId: id, createdAt: clock.daysAgo(key === 'lakeside' ? 9 : 380) });
    out.push({ id, name: spec.name, slug: spec.slug, domain, placeId, lat: spec.lat, lng: spec.lng });
    if (key === 'lakeside') continue; // prospects get no recurring work
    const page = (path: string, pageType: string) => ({
      competitorId: id, url: `https://${domain}${path}`, pageType, source: 'nav', cadence: 'daily', active: true,
      lastCapturedAt: clock.daysAgo(0.5), nextDueAt: clock.daysAgo(-30), createdAt: clock.daysAgo(380),
    });
    const pages = await db.insert(trackedPage).values([page('/', 'home'), page('/pricing', 'pricing')]).returning({ id: trackedPage.id, pageType: trackedPage.pageType });
    ids.pages[id] = { home: pages.find((p) => p.pageType === 'home')!.id, pricing: pages.find((p) => p.pageType === 'pricing')!.id };
    await db.insert(competitorSource).values(SOURCES.map((source) => ({ competitorId: id, source, active: true, nextDueAt: clock.daysAgo(-30), lastRunAt: clock.daysAgo(1), lastStatus: 'ok' })));
  }
  return out;
}

/** Better Auth users plus memberships, made the way the app makes them: an invitation, then its acceptance. */
async function seedUsers(ctx: SeedContext): Promise<void> {
  const { db, clock, ids } = ctx;
  for (const u of DEMO_USERS) {
    const userId = `demo-user-${u.key}`;
    await db.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${userId}, ${u.name}, ${u.email}, true)`);
    await createInvitation(db, { agencyId: ids.agencyId, email: u.email, role: u.role, clientId: u.client ? ids.clients[u.client] : null, invitedBy: 'demo-seed' }, clock.daysAgo(390));
    await acceptInvitations(db, { id: userId, email: u.email, name: u.name }, clock.daysAgo(389));
    const [m] = await db.select({ contactId: membership.contactId }).from(membership).where(eq(membership.userId, userId));
    if (!m?.contactId) throw new Error(`demo user ${u.key} has no contact after accepting its invitation`);
    ids.users[u.key] = { userId, contactId: m.contactId, email: u.email };
  }
}
```

  (`NewInvitation.clientId` is `string | null | undefined`. `invitationProblem` accepts `null` for agency roles and requires a uuid for client roles, which is what `DEMO_USERS` provides.)

`packages/demo/src/index.ts` (later tasks append exports):

```ts
export * from './clock';
export * from './context';
export * from './ids';
export * from './links';
export * from './random';
export * from './tenancy';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @cs/demo exec vitest run src/random.test.ts src/tenancy.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/demo pnpm-lock.yaml
git commit -m "feat(demo): package scaffold, tenancy seed, demo users and sign-in links"
```

---

### Task 4: Changes, evidence (generated WebP) and moves

**Files:**
- Create: `packages/demo/src/evidence.ts`, `packages/demo/src/changes.ts`, `packages/demo/src/changes.test.ts`
- Modify: `packages/demo/package.json` (add `sharp`), `packages/demo/src/index.ts`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes:
  - `SeedContext`, `DemoIds.competitors/pages`, `CLIENT_THRESHOLDS`, `DEMO_COLLECTOR` (Task 3);
  - the `@cs/db` tables `capture`, `evidence`, `detectedChange`, `changeEvent`, `eventChange`, `eventScore`, `move`, `moveEvent`.
- Produces:
  - `putEvidence(ctx, { captureId, competitorId, kind, body, contentType }): Promise<string>` (evidence id);
  - `interface PageMock { title; url; blocks: string[]; highlight: number | null }`, `pageMockSvg`, `pageMockWebp(m): Promise<Uint8Array>`, `pageHtml`, `pageText`;
  - `vendorCapture(ctx, competitorId, source, at, payload): Promise<{ captureId; evidenceId }>`;
  - `EVENT_SPECS: readonly EventSpec[]` (40 entries), `routeFor(client, score): Route`, `seedChanges(ctx)`. It fills `ctx.ids.events` (40) and `ctx.ids.moves` (6).

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @cs/demo add sharp@^0.34.3`. It is the version `@cs/collectors` uses, so no second native build.

- [ ] **Step 2: Write the failing test** — `packages/demo/src/changes.test.ts`:

```ts
import { capture, changeEvent, detectedChange, evidence, move, moveEvent } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedChanges } from './changes';
import { DAY } from './clock';
import { createSeedContext, type SeedContext } from './context';
import { seedTenancy } from './tenancy';
import { countRows, resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const store = createMemoryStore();
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store, now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedChanges(ctx);
});

describe('seedChanges', () => {
  it('writes about 40 events over 90 days, each with a detected change, an event_change and an event_score', async () => {
    expect(ctx.ids.events).toHaveLength(40);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from event`)).toBe(40);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from event e where exists (select 1 from event_change ec where ec.event_id = e.id) and exists (select 1 from event_score s where s.event_id = e.id)`)).toBe(40);
    const now = ctx.clock.now.getTime();
    for (const e of ctx.ids.events) {
      expect(e.occurredAt.getTime()).toBeLessThan(now);
      expect(now - e.occurredAt.getTime()).toBeLessThan(91 * DAY);
    }
  });

  it('covers every severity and the web, ad, review, profile and jobs sources', () => {
    expect(new Set(ctx.ids.events.map((e) => e.route))).toEqual(new Set(['alert', 'brief', 'archive']));
    expect(new Set(ctx.ids.events.map((e) => e.source))).toEqual(new Set(['web', 'google_ads', 'meta_ads', 'google_reviews', 'google_business_profile', 'google_jobs']));
  });

  it('gives each web change a before and an after capture with html, text and a real WebP screenshot', async () => {
    const web = ctx.ids.events.filter((e) => e.source === 'web');
    expect(web.length).toBeGreaterThanOrEqual(15);
    for (const e of web.slice(0, 3)) {
      const [ch] = await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, e.changeId));
      const ev = await dbs.owner.select().from(evidence).where(inArray(evidence.captureId, [ch!.beforeCaptureId!, ch!.afterCaptureId!]));
      expect(ev.map((x) => x.kind).sort()).toEqual(['html', 'html', 'screenshot', 'screenshot', 'text', 'text']);
      const shot = ev.find((x) => x.kind === 'screenshot' && x.captureId === ch!.afterCaptureId)!;
      const bytes = await store.get(shot.objectKey);
      expect(Buffer.from(bytes!.slice(0, 4)).toString('ascii')).toBe('RIFF');
      expect(Buffer.from(bytes!.slice(8, 12)).toString('ascii')).toBe('WEBP');
      expect(shot.bytes).toBe(bytes!.byteLength);
      expect(e.evidenceIds).toEqual([shot.id]);
    }
  });

  it('records vendor events against a vendor capture with a JSON evidence file', async () => {
    const ad = ctx.ids.events.find((e) => e.source === 'google_ads')!;
    const [ch] = await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, ad.changeId));
    const [cap] = await dbs.owner.select().from(capture).where(eq(capture.id, ch!.afterCaptureId!));
    expect(cap!.source).toBe('google_ads');
    const [ev] = await dbs.owner.select().from(evidence).where(eq(evidence.captureId, cap!.id));
    expect(ev!.kind).toBe('vendor_json');
  });

  it('adds six moves, open and resolved, each linked to its events', async () => {
    const moves = await dbs.owner.select().from(move);
    expect(moves).toHaveLength(6);
    expect(moves.filter((m) => m.closedAt === null)).toHaveLength(4);
    for (const m of moves) {
      const links = await dbs.owner.select().from(moveEvent).where(eq(moveEvent.moveId, m.id));
      expect(links.length).toBeGreaterThan(0);
      const evs = await dbs.owner.select({ competitorId: changeEvent.competitorId }).from(changeEvent).where(inArray(changeEvent.id, links.map((l) => l.eventId)));
      expect(evs.every((x) => x.competitorId === m.competitorId)).toBe(true);
    }
  });

  it('never gives the no-pricing or no-ads competitors a pricing or ad event', () => {
    expect(ctx.ids.events.some((e) => e.competitorId === ctx.ids.noData.pricing && ['price_change', 'promo'].includes(e.changeType))).toBe(false);
    expect(ctx.ids.events.some((e) => e.competitorId === ctx.ids.noData.ads && e.source.endsWith('_ads'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/changes.test.ts` (timeout 600000)
Expected: FAIL — `./changes` does not exist.

- [ ] **Step 4: Create `packages/demo/src/evidence.ts`:**

```ts
import { createHash } from 'node:crypto';
import { capture, evidence } from '@cs/db';
import sharp from 'sharp';
import type { SeedContext } from './context';
import { DEMO_COLLECTOR } from './tenancy';

export type EvidenceKind = 'html' | 'text' | 'screenshot' | 'vendor_json';
const FILE: Record<EvidenceKind, string> = { html: 'page.html', text: 'text.txt', screenshot: 'screenshot.webp', vendor_json: 'vendor.json' };

/** Writes the file to the environment's evidence store and its `evidence` row (real sha256 and size). */
export async function putEvidence(ctx: SeedContext, o: { captureId: string; competitorId: string; kind: EvidenceKind; body: Uint8Array; contentType: string }): Promise<string> {
  const objectKey = `evidence/${o.competitorId}/${o.captureId}/${FILE[o.kind]}`;
  await ctx.store.put(objectKey, o.body, o.contentType);
  const [row] = await ctx.db.insert(evidence).values({
    captureId: o.captureId, kind: o.kind, objectKey, sha256: createHash('sha256').update(o.body).digest('hex'), bytes: o.body.byteLength, contentType: o.contentType,
  }).returning({ id: evidence.id });
  return row!.id;
}

/** A simple page mock: a header bar and up to six content blocks; `highlight` outlines the changed block. */
export interface PageMock {
  title: string;
  url: string;
  blocks: string[];
  highlight: number | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function pageMockSvg(m: PageMock): string {
  const blocks = m.blocks.slice(0, 6).map((text, i) => {
    const y = 96 + i * 112;
    const hot = m.highlight === i;
    return `<rect x="48" y="${y}" width="1104" height="92" rx="10" fill="#FFFFFF" stroke="${hot ? '#F5A524' : '#DDE3EA'}" stroke-width="${hot ? 5 : 1}"/>`
      + `<text x="76" y="${y + 54}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#0B2540">${esc(clip(text, 80))}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">`
    + `<rect width="1200" height="800" fill="#F6F9FC"/><rect width="1200" height="64" fill="#0B2540"/>`
    + `<text x="32" y="42" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF">${esc(clip(m.title, 48))}</text>`
    + `<text x="1168" y="40" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#9FB3C8">${esc(clip(m.url, 60))}</text>`
    + blocks.join('') + '</svg>';
}

export async function pageMockWebp(m: PageMock): Promise<Uint8Array> {
  return new Uint8Array(await sharp(Buffer.from(pageMockSvg(m))).webp({ quality: 70 }).toBuffer());
}

export const pageHtml = (m: PageMock): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title></head><body><main>${m.blocks.map((b) => `<section><p>${esc(b)}</p></section>`).join('')}</main></body></html>`;

export const pageText = (m: PageMock): string => m.blocks.join('\n\n');

/** One ok vendor capture with its stored JSON (spec §4.2 evidence for non-web events). */
export async function vendorCapture(ctx: SeedContext, competitorId: string, source: string, at: Date, payload: Record<string, unknown>): Promise<{ captureId: string; evidenceId: string }> {
  const [c] = await ctx.db.insert(capture).values({ competitorId, source, status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
  const evidenceId = await putEvidence(ctx, {
    captureId: c!.id, competitorId, kind: 'vendor_json', body: new TextEncoder().encode(JSON.stringify(payload, null, 2)), contentType: 'application/json',
  });
  return { captureId: c!.id, evidenceId };
}
```

- [ ] **Step 5: Create `packages/demo/src/changes.ts`:**

```ts
import type { ChangeType } from '@cs/core';
import { capture, type ChangeDetails, changeEvent, detectedChange, eventChange, eventScore, move, moveEvent, type NumericChange, type ScoreFactors } from '@cs/db';
import { DAY } from './clock';
import type { SeedContext } from './context';
import { type PageMock, pageHtml, pageMockWebp, pageText, putEvidence, vendorCapture } from './evidence';
import type { ActiveClientKey, DemoCompetitor, Route } from './ids';
import { CLIENT_THRESHOLDS, DEMO_COLLECTOR } from './tenancy';

type Source = 'web' | 'google_ads' | 'meta_ads' | 'google_reviews' | 'google_business_profile' | 'google_jobs';

export interface EventSpec {
  client: ActiveClientKey;
  /** Index into `ids.competitors[client]`. */
  comp: number;
  /** Age in days (the event is placed at `days + 0.25` days ago). */
  days: number;
  source: Source;
  type: ChangeType;
  score: number;
  service: string | null;
  summary: (name: string) => string;
  page?: 'home' | 'pricing';
  before?: string;
  after?: string;
  facts?: NumericChange[];
  details?: ChangeDetails;
  zips?: string[];
}

export const routeFor = (client: ActiveClientKey, score: number): Route =>
  score >= CLIENT_THRESHOLDS[client].alert ? 'alert' : score >= CLIENT_THRESHOLDS[client].brief ? 'brief' : 'archive';

const usd = (value: number, context: string) => ({ kind: 'price' as const, value, unit: 'USD', raw: `$${value}`, context });

const price = (client: ActiveClientKey, comp: number, days: number, score: number, service: string, label: string, before: number, after: number): EventSpec => ({
  client, comp, days, score, service, source: 'web', type: 'price_change', page: 'pricing',
  summary: (n) => `${n} ${after < before ? 'cut' : 'raised'} its ${label} to $${after} (was $${before})`,
  before: `${label}: $${before}`, after: `${label}: $${after}`,
  facts: [{ kind: 'price', before: usd(before, label), after: usd(after, label), pct: Math.round(((after - before) / before) * 1000) / 10 }],
});

const promo = (client: ActiveClientKey, comp: number, days: number, score: number, service: string, offer: string): EventSpec => ({
  client, comp, days, score, service, source: 'web', type: 'promo', page: 'pricing',
  summary: (n) => `${n} launched a ${offer}`, before: 'Current specials: none listed', after: `Current special: ${offer}`, details: { offer: true },
});

const newService = (client: ActiveClientKey, comp: number, days: number, score: number, service: string, label: string): EventSpec => ({
  client, comp, days, score, service, source: 'web', type: 'new_service', page: 'home',
  summary: (n) => `${n} added ${label} to its services`, before: 'Our services: repair, maintenance, installation', after: `Our services: repair, maintenance, installation, ${label}`,
});

const content = (client: ActiveClientKey, comp: number, days: number, score: number, what: string): EventSpec => ({
  client, comp, days, score, service: null, source: 'web', type: 'content', page: 'home',
  summary: (n) => `${n} updated its ${what}`, before: `${what}: previous copy`, after: `${what}: refreshed copy`,
});

const ads = (kind: 'ad_started' | 'ad_stopped', client: ActiveClientKey, comp: number, days: number, score: number, source: 'google_ads' | 'meta_ads', count: number): EventSpec => ({
  client, comp, days, score, service: null, source, type: kind,
  summary: (n) => `${n} ${kind === 'ad_started' ? 'started' : 'stopped'} ${count} ${source === 'google_ads' ? 'Google' : 'Meta'} ad${count > 1 ? 's' : ''}`,
  details: { changeType: kind, count, items: Array.from({ length: count }, (_, i) => ({ id: `demo-ad-${comp}-${days}-${i}`, label: `Ad ${i + 1}` })) },
});

const spike = (client: ActiveClientKey, comp: number, days: number, score: number, theme: string, themeName: string): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_reviews', type: 'review_spike',
  summary: (n) => `${n}: complaints about ${themeName.toLowerCase()} spiked`,
  details: { changeType: 'review_spike', theme, themeName, verticalId: 'hvac_plumbing', windowDays: 14, count: 6 },
});

const rating = (client: ActiveClientKey, comp: number, days: number, score: number, before: number, after: number): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_business_profile', type: 'rating_change',
  summary: (n) => `${n}'s Google rating moved from ${before} to ${after}`,
  details: { changeType: 'rating_change', field: 'rating', ratingBefore: before, ratingAfter: after },
});

const gbp = (type: 'service_area_change' | 'new_location', client: ActiveClientKey, comp: number, days: number, score: number, text: string, zips: string[]): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_business_profile', type, summary: (n) => `${n} ${text}`,
  details: { changeType: type, field: type === 'new_location' ? 'address' : 'service' }, zips,
});

const hiring = (client: ActiveClientKey, comp: number, days: number, score: number, count: number): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_jobs', type: 'hiring', summary: (n) => `${n} posted ${count} new technician jobs`,
  details: { changeType: 'hiring', count },
});

/**
 * Spec §4.2: 40 events over 90 days. Lone Star competitors are indexes 0–5 (4 = no ads, 5 = no prices); Brazos 0–3.
 * The price events match the price series in pricing.ts (same client, competitor, service and day).
 */
export const EVENT_SPECS: readonly EventSpec[] = [
  price('loneStar', 0, 1, 82, 'ac_tune_up', 'AC tune-up', 99, 79),
  promo('loneStar', 1, 2, 74, 'ac_tune_up', '$59 AC tune-up special'),
  ads('ad_started', 'loneStar', 2, 3, 66, 'google_ads', 3),
  spike('loneStar', 3, 4, 58, 'scheduling', 'Scheduling & reliability'),
  price('loneStar', 0, 5, 61, 'furnace_tune_up', 'Furnace tune-up', 109, 89),
  hiring('loneStar', 1, 6, 44, 3),
  price('loneStar', 2, 12, 72, 'ac_repair', 'AC repair diagnostic', 89, 69),
  ads('ad_started', 'loneStar', 0, 14, 63, 'meta_ads', 2),
  newService('loneStar', 1, 18, 55, 'heat_pump', 'heat pump installation'),
  rating('loneStar', 3, 20, 48, 4.4, 4.1),
  content('loneStar', 5, 22, 18, 'About page'),
  promo('loneStar', 0, 25, 69, 'duct_cleaning', '$199 whole-home duct cleaning'),
  ads('ad_stopped', 'loneStar', 2, 28, 30, 'google_ads', 2),
  price('loneStar', 1, 31, 57, 'ac_tune_up', 'AC tune-up', 89, 99),
  gbp('service_area_change', 'loneStar', 2, 35, 62, 'now lists Tolar and Lipan in its service area', ['76476', '76462']),
  spike('loneStar', 3, 40, 52, 'response_time', 'Response time'),
  ads('ad_started', 'loneStar', 1, 44, 47, 'meta_ads', 4),
  content('loneStar', 3, 47, 12, 'blog'),
  price('loneStar', 3, 52, 66, 'ac_repair', 'AC repair visit', 129, 99),
  gbp('new_location', 'loneStar', 5, 58, 60, 'opened a second location in Granbury', ['76048']),
  ads('ad_stopped', 'loneStar', 0, 63, 25, 'meta_ads', 1),
  rating('loneStar', 0, 70, 33, 4.6, 4.7),
  content('loneStar', 2, 76, 9, 'team page'),
  price('loneStar', 0, 84, 49, 'ac_tune_up', 'AC tune-up', 109, 99),
  hiring('loneStar', 5, 88, 28, 2),
  price('brazos', 0, 2, 77, 'drain_cleaning', 'Drain cleaning', 149, 119),
  promo('brazos', 1, 4, 64, 'water_heater', '$100 off water heater installs'),
  ads('ad_started', 'brazos', 2, 9, 55, 'google_ads', 2),
  spike('brazos', 1, 15, 61, 'price_transparency', 'Price transparency'),
  price('brazos', 1, 21, 45, 'sewer_line', 'Sewer camera inspection', 199, 229),
  content('brazos', 3, 26, 14, 'FAQ page'),
  ads('ad_started', 'brazos', 0, 33, 42, 'meta_ads', 1),
  rating('brazos', 2, 41, 52, 4.3, 3.9),
  newService('brazos', 3, 49, 58, 'water_heater', 'tankless water heater installation'),
  ads('ad_stopped', 'brazos', 2, 57, 22, 'google_ads', 1),
  gbp('service_area_change', 'brazos', 3, 60, 50, 'added Cleburne to its service area', ['76031', '76033']),
  price('brazos', 0, 64, 72, 'emergency_service', '24/7 emergency call-out', 179, 149),
  hiring('brazos', 0, 71, 31, 2),
  content('brazos', 1, 79, 11, 'homepage hero'),
  promo('brazos', 2, 86, 38, 'drain_cleaning', 'free camera inspection with any drain cleaning'),
];

const factorsFor = (client: ActiveClientKey, score: number): ScoreFactors => ({
  typeWeight: 1, size: Math.min(1, Math.round((score / 90) * 100) / 100), serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9,
  maxSimilarity: 0.2, needsReviewCap: false, thresholds: CLIENT_THRESHOLDS[client], scoringVersion: 2,
});

function pageBlocks(comp: DemoCompetitor, spec: EventSpec): { before: string[]; after: string[]; changed: number } {
  const pricing = spec.page === 'pricing';
  const head = pricing ? `${comp.name} pricing` : `Welcome to ${comp.name}`;
  const filler = pricing ? ['Service call: $89 (waived with repair)', 'Financing available on approved credit'] : ['Family owned, serving Hood County since 2004', 'Call (817) 555-0142 for same-day service'];
  return { before: [head, filler[0]!, spec.before ?? '', filler[1]!], after: [head, filler[0]!, spec.after ?? '', filler[1]!], changed: 2 };
}

async function webCapture(ctx: SeedContext, comp: DemoCompetitor, pageId: string, url: string, at: Date, mock: PageMock): Promise<{ captureId: string; screenshotId: string }> {
  const [c] = await ctx.db.insert(capture).values({ competitorId: comp.id, trackedPageId: pageId, source: 'web', url, status: 'ok', httpStatus: 200, collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
  const enc = new TextEncoder();
  const base = { captureId: c!.id, competitorId: comp.id };
  await putEvidence(ctx, { ...base, kind: 'html', body: enc.encode(pageHtml(mock)), contentType: 'text/html' });
  await putEvidence(ctx, { ...base, kind: 'text', body: enc.encode(pageText(mock)), contentType: 'text/plain' });
  const screenshotId = await putEvidence(ctx, { ...base, kind: 'screenshot', body: await pageMockWebp(mock), contentType: 'image/webp' });
  return { captureId: c!.id, screenshotId };
}

async function seedEvent(ctx: SeedContext, spec: EventSpec, i: number): Promise<void> {
  const { db, ids } = ctx;
  const comp = ids.competitors[spec.client][spec.comp];
  if (!comp) throw new Error(`EVENT_SPECS[${i}]: no competitor ${spec.comp} for ${spec.client}`);
  const at = ctx.clock.daysAgo(spec.days + 0.25);
  const summary = spec.summary(comp.name);
  const route = routeFor(spec.client, spec.score);
  let beforeCaptureId: string | null = null;
  let afterCaptureId: string;
  let trackedPageId: string | null = null;
  let evidenceIds: string[];
  if (spec.source === 'web') {
    const page = spec.page ?? 'home';
    trackedPageId = ids.pages[comp.id]![page];
    const url = `https://${comp.domain}${page === 'pricing' ? '/pricing' : '/'}`;
    const blocks = pageBlocks(comp, spec);
    const before = await webCapture(ctx, comp, trackedPageId, url, new Date(at.getTime() - DAY), { title: comp.name, url, blocks: blocks.before, highlight: null });
    const after = await webCapture(ctx, comp, trackedPageId, url, at, { title: comp.name, url, blocks: blocks.after, highlight: blocks.changed });
    beforeCaptureId = before.captureId;
    afterCaptureId = after.captureId;
    evidenceIds = [after.screenshotId];
  } else {
    const v = await vendorCapture(ctx, comp.id, spec.source, at, { demo: true, source: spec.source, competitor: comp.name, summary, details: spec.details ?? {} });
    afterCaptureId = v.captureId;
    evidenceIds = [v.evidenceId];
  }
  const [ch] = await db.insert(detectedChange).values({
    competitorId: comp.id, trackedPageId, source: spec.source, kind: spec.source === 'web' ? 'modified' : 'added', beforeCaptureId, afterCaptureId,
    blockKey: `demo-${i}`, beforeText: spec.before ?? null, afterText: spec.after ?? null, similarity: spec.source === 'web' ? 0.64 : null,
    numericChanges: spec.facts ?? [], details: spec.details ?? {}, status: 'event', stageVersion: 1, detectedAt: at,
  }).returning({ id: detectedChange.id });
  const [ev] = await db.insert(changeEvent).values({
    competitorId: comp.id, changeType: spec.type, channels: [spec.source], services: { hvac_plumbing: spec.service }, summary,
    facts: spec.facts ?? [], details: spec.details ?? {}, zips: spec.zips ?? [], confidence: 0.86, occurredAt: at, createdAt: at,
  }).returning({ id: changeEvent.id });
  await db.insert(eventChange).values({ eventId: ev!.id, changeId: ch!.id });
  await db.insert(eventScore).values({
    agencyId: ids.agencyId, clientId: ids.clients[spec.client], eventId: ev!.id, score: spec.score, route, factors: factorsFor(spec.client, spec.score),
    packVersion: 1, scoredAt: new Date(at.getTime() + 3_600_000),
  });
  ids.events.push({ id: ev!.id, client: spec.client, competitorId: comp.id, changeId: ch!.id, changeType: spec.type, source: spec.source, route, score: spec.score, occurredAt: at, summary, evidenceIds });
}

interface MoveSpec {
  client: ActiveClientKey;
  comp: number;
  moveType: string;
  status: 'emerging' | 'active' | 'fading';
  closed: boolean;
  confidence: number;
  summary: (name: string) => string;
}

/** Spec §4.2: six moves, four open and two resolved. */
const MOVE_SPECS: readonly MoveSpec[] = [
  { client: 'loneStar', comp: 0, moveType: 'price_war', status: 'active', closed: false, confidence: 0.82, summary: (n) => `${n} cut prices on several tune-up services` },
  { client: 'loneStar', comp: 1, moveType: 'promo_blitz', status: 'emerging', closed: false, confidence: 0.64, summary: (n) => `${n} is stacking specials with new ads` },
  { client: 'loneStar', comp: 2, moveType: 'ad_surge', status: 'active', closed: false, confidence: 0.71, summary: (n) => `${n} doubled its active ads` },
  { client: 'loneStar', comp: 3, moveType: 'reputation_slump', status: 'fading', closed: true, confidence: 0.68, summary: (n) => `${n}'s rating slid on scheduling complaints` },
  { client: 'brazos', comp: 0, moveType: 'price_war', status: 'fading', closed: false, confidence: 0.74, summary: (n) => `${n} undercut drain and emergency call-out prices` },
  { client: 'brazos', comp: 3, moveType: 'territory_expansion', status: 'active', closed: true, confidence: 0.6, summary: (n) => `${n} expanded its service area toward Cleburne` },
];

async function seedMoves(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  for (const m of MOVE_SPECS) {
    const comp = ids.competitors[m.client][m.comp]!;
    const evs = ids.events.filter((e) => e.client === m.client && e.competitorId === comp.id);
    if (evs.length === 0) throw new Error(`move ${m.moveType} for ${comp.name} has no events`);
    const times = evs.map((e) => e.occurredAt.getTime());
    const summary = m.summary(comp.name);
    const [row] = await db.insert(move).values({
      agencyId: ids.agencyId, clientId: ids.clients[m.client], competitorId: comp.id, moveType: m.moveType, status: m.status, confidence: m.confidence, summary,
      details: { eventCount: evs.length, channels: [...new Set(evs.map((e) => e.source))], facts: { events: evs.length } }, ruleVersion: 2,
      firstDetectedAt: new Date(Math.min(...times)), lastHeldAt: m.closed ? clock.daysAgo(12) : clock.daysAgo(0.5), lastEvidenceAt: new Date(Math.max(...times)),
      closedAt: m.closed ? clock.daysAgo(10) : null, updatedAt: clock.daysAgo(m.closed ? 10 : 0.5),
    }).returning({ id: move.id });
    await db.insert(moveEvent).values(evs.map((e) => ({ moveId: row!.id, eventId: e.id })));
    ids.moves.push({ id: row!.id, client: m.client, competitorId: comp.id, moveType: m.moveType, open: !m.closed, summary });
  }
}

/** Spec §4.2. */
export async function seedChanges(ctx: SeedContext): Promise<void> {
  for (const [i, spec] of EVENT_SPECS.entries()) await seedEvent(ctx, spec, i);
  await seedMoves(ctx);
}
```

  Append `export * from './changes';` and `export * from './evidence';` to `src/index.ts`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @cs/demo exec vitest run src/changes.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS. If `sharp` cannot render the SVG text because no font is found, that is still not a failure: the WebP renders the rectangles, and the test checks only the WebP header.

- [ ] **Step 7: Commit**

```bash
git add packages/demo/package.json packages/demo/src/evidence.ts packages/demo/src/changes.ts packages/demo/src/changes.test.ts packages/demo/src/index.ts pnpm-lock.yaml
git commit -m "feat(demo): changes with generated WebP evidence, and moves"
```

---

### Task 5: Pricing

**Files:**
- Create: `packages/demo/src/pricing.ts`, `packages/demo/src/pricing.test.ts`
- Modify: `packages/demo/src/index.ts`

**Interfaces:**
- Consumes: `SeedContext`, `ids.competitors`, `ids.pages`, `ids.noData.pricing`, `DEMO_COLLECTOR` (Task 3); `Rng`; the `@cs/db` tables `capture` and `pricePoint`.
- Produces:
  - `PRICED_SERVICES: { hvac: PricedService[]; plumbing: PricedService[] }` (8 services);
  - `round9(n): number`;
  - `seedPricing(ctx)`.

- [ ] **Step 1: Write the failing test** — `packages/demo/src/pricing.test.ts`:

```ts
import { pricePoint } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { PRICED_SERVICES, round9, seedPricing } from './pricing';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;
let rows: (typeof pricePoint.$inferSelect)[];

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedPricing(ctx);
  rows = await dbs.owner.select().from(pricePoint);
});

const series = () => {
  const m = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) m.set(`${r.competitorId}:${r.serviceId}`, [...(m.get(`${r.competitorId}:${r.serviceId}`) ?? []), r]);
  return m;
};

describe('seedPricing', () => {
  it('prices 8 services over 12 months for every competitor except the one left empty on purpose', () => {
    const s = series();
    expect(new Set(rows.map((r) => r.serviceId))).toEqual(new Set([...PRICED_SERVICES.hvac, ...PRICED_SERVICES.plumbing].map((x) => x.id)));
    expect(s.size).toBe(9 * 4);
    expect(rows.some((r) => r.competitorId === ctx.ids.noData.pricing)).toBe(false);
    const oldest = Math.min(...rows.map((r) => r.firstSeenAt.getTime()));
    expect(ctx.clock.now.getTime() - oldest).toBeGreaterThan(355 * 86_400_000);
  });

  it('has rises and cuts, and one price that is no longer seen', () => {
    let rises = 0;
    let cuts = 0;
    let gone = 0;
    for (const spans of series().values()) {
      const sorted = [...spans].sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime());
      for (let i = 1; i < sorted.length; i++) (sorted[i]!.amount > sorted[i - 1]!.amount ? rises++ : sorted[i]!.amount < sorted[i - 1]!.amount && cuts++);
      if (sorted.every((x) => x.endedAt !== null)) gone++;
      expect(sorted.filter((x) => x.endedAt === null).length).toBeLessThanOrEqual(1);
      for (const x of sorted) expect(x.lastSeenAt.getTime()).toBeGreaterThanOrEqual(x.firstSeenAt.getTime());
    }
    expect(rises).toBeGreaterThan(0);
    expect(cuts).toBeGreaterThan(0);
    expect(gone).toBe(1);
  });

  it('matches the AC tune-up cut in the changes feed: Hill Country Air & Heat now shows a $79 promo', () => {
    const hill = ctx.ids.competitors.loneStar[0]!.id;
    const open = rows.find((r) => r.competitorId === hill && r.serviceId === 'ac_tune_up' && r.endedAt === null)!;
    expect([open.amount, open.promo]).toEqual([79, true]);
  });

  it('rounds prices to end in 9', () => {
    expect([round9(89), round9(101), round9(1320)]).toEqual([89, 99, 1319]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/pricing.test.ts` (timeout 600000)
Expected: FAIL — `./pricing` does not exist.

- [ ] **Step 3: Create `packages/demo/src/pricing.ts`:**

```ts
import { capture, pricePoint, type PriceQualifier } from '@cs/db';
import { DAY } from './clock';
import type { SeedContext } from './context';
import type { ActiveClientKey, DemoCompetitor } from './ids';
import type { Rng } from './random';
import { DEMO_COLLECTOR } from './tenancy';

export interface PricedService {
  id: string;
  label: string;
  base: number;
  qualifier: PriceQualifier;
}

/** Spec §4.3: 8 services, HVAC for Lone Star's competitors and plumbing for Brazos's. */
export const PRICED_SERVICES: { hvac: PricedService[]; plumbing: PricedService[] } = {
  hvac: [
    { id: 'ac_tune_up', label: 'AC tune-up', base: 89, qualifier: 'exact' },
    { id: 'furnace_tune_up', label: 'Furnace tune-up', base: 99, qualifier: 'exact' },
    { id: 'ac_repair', label: 'AC repair diagnostic', base: 89, qualifier: 'from' },
    { id: 'duct_cleaning', label: 'Duct cleaning', base: 299, qualifier: 'exact' },
  ],
  plumbing: [
    { id: 'drain_cleaning', label: 'Drain cleaning', base: 149, qualifier: 'exact' },
    { id: 'water_heater', label: 'Water heater install', base: 1200, qualifier: 'from' },
    { id: 'sewer_line', label: 'Sewer camera inspection', base: 229, qualifier: 'exact' },
    { id: 'emergency_service', label: '24/7 emergency call-out', base: 179, qualifier: 'exact' },
  ],
};

interface Span {
  amount: number;
  fromDays: number;
  /** null = still shown. */
  toDays: number | null;
  promo?: boolean;
}

/** Prices end in 9 ($89, $1,319). */
export const round9 = (n: number): number => Math.max(9, Math.round((n + 1) / 10) * 10 - 1);

/** `client:competitorIndex:service` → spans matching the price events in changes.ts (days + 0.25), plus the gap on purpose. */
const FIXED: Record<string, Span[]> = {
  'loneStar:0:ac_tune_up': [{ amount: 109, fromDays: 360, toDays: 84.25 }, { amount: 99, fromDays: 84.25, toDays: 1.25 }, { amount: 79, fromDays: 1.25, toDays: null, promo: true }],
  'loneStar:0:furnace_tune_up': [{ amount: 109, fromDays: 360, toDays: 5.25 }, { amount: 89, fromDays: 5.25, toDays: null }],
  'loneStar:1:ac_tune_up': [{ amount: 89, fromDays: 360, toDays: 31.25 }, { amount: 99, fromDays: 31.25, toDays: null }],
  'loneStar:2:ac_repair': [{ amount: 89, fromDays: 360, toDays: 12.25 }, { amount: 69, fromDays: 12.25, toDays: null }],
  'loneStar:3:ac_repair': [{ amount: 129, fromDays: 360, toDays: 52.25 }, { amount: 99, fromDays: 52.25, toDays: null }],
  'brazos:0:drain_cleaning': [{ amount: 149, fromDays: 360, toDays: 2.25 }, { amount: 119, fromDays: 2.25, toDays: null }],
  'brazos:0:emergency_service': [{ amount: 179, fromDays: 360, toDays: 64.25 }, { amount: 149, fromDays: 64.25, toDays: null }],
  'brazos:1:sewer_line': [{ amount: 199, fromDays: 360, toDays: 21.25 }, { amount: 229, fromDays: 21.25, toDays: null }],
  // Spec §4.3 gap on purpose: last seen two months ago, nothing since.
  'brazos:2:sewer_line': [{ amount: 239, fromDays: 360, toDays: 180 }, { amount: 219, fromDays: 180, toDays: 60 }],
};

function randomSeries(rng: Rng, base: number): Span[] {
  let amount = round9(base * rng.between(0.85, 1.15));
  const changes = [300, 240, 180, 120, 60].filter(() => rng.chance(0.3)).slice(0, 2);
  const spans: Span[] = [];
  let from = 360;
  for (const d of changes) {
    spans.push({ amount, fromDays: from, toDays: d });
    amount = round9(amount * rng.pick([0.85, 0.9, 1.1, 1.15]));
    from = d;
  }
  spans.push({ amount, fromDays: from, toDays: null, promo: rng.chance(0.15) });
  return spans;
}

async function seedCompetitorPrices(ctx: SeedContext, client: ActiveClientKey, index: number, comp: DemoCompetitor, services: PricedService[], rng: Rng): Promise<void> {
  const pageId = ctx.ids.pages[comp.id]!.pricing;
  const url = `https://${comp.domain}/pricing`;
  const made = new Map<number, string>();
  const captureAt = async (at: Date): Promise<string> => {
    const hit = made.get(at.getTime());
    if (hit) return hit;
    const [c] = await ctx.db.insert(capture).values({ competitorId: comp.id, trackedPageId: pageId, source: 'web', url, status: 'ok', httpStatus: 200, collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
    made.set(at.getTime(), c!.id);
    return c!.id;
  };
  const latestAt = ctx.clock.daysAgo(0.5);
  const rows: (typeof pricePoint.$inferInsert)[] = [];
  for (const s of services) {
    const spans = FIXED[`${client}:${index}:${s.id}`] ?? randomSeries(rng, s.base);
    for (const span of spans) {
      const from = ctx.clock.daysAgo(span.fromDays);
      const to = span.toDays === null ? null : ctx.clock.daysAgo(span.toDays);
      const firstCaptureId = await captureAt(from);
      const text = `${s.label} ${s.qualifier === 'from' ? 'from ' : ''}$${span.amount.toLocaleString('en-US')}`;
      rows.push({
        competitorId: comp.id, trackedPageId: pageId, verticalId: 'hvac_plumbing', serviceId: s.id, amount: span.amount, unit: 'USD', qualifier: s.qualifier,
        promo: span.promo ?? false, raw: `$${span.amount.toLocaleString('en-US')}`, context: text,
        firstSeenAt: from, lastSeenAt: to ? new Date(Math.max(from.getTime(), to.getTime() - DAY)) : latestAt,
        firstCaptureId, lastCaptureId: to ? firstCaptureId : await captureAt(latestAt),
        endedAt: to, endedCaptureId: to ? await captureAt(to) : null,
      });
    }
  }
  if (rows.length) await ctx.db.insert(pricePoint).values(rows);
}

/** Spec §4.3. */
export async function seedPricing(ctx: SeedContext): Promise<void> {
  const rng = ctx.rng('pricing');
  for (const [i, comp] of ctx.ids.competitors.loneStar.entries()) {
    if (comp.id === ctx.ids.noData.pricing) continue;
    await seedCompetitorPrices(ctx, 'loneStar', i, comp, PRICED_SERVICES.hvac, rng);
  }
  for (const [i, comp] of ctx.ids.competitors.brazos.entries()) await seedCompetitorPrices(ctx, 'brazos', i, comp, PRICED_SERVICES.plumbing, rng);
}
```

  Append `export * from './pricing';` to `src/index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cs/demo exec vitest run src/pricing.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/demo/src/pricing.ts packages/demo/src/pricing.test.ts packages/demo/src/index.ts
git commit -m "feat(demo): 12 months of competitor prices with rises, cuts and a gap"
```

---

### Task 6: Ads

**Files:**
- Create: `packages/demo/src/ads.ts`, `packages/demo/src/ads.test.ts`
- Modify: `packages/demo/src/index.ts`

**Interfaces:**
- Consumes: `SeedContext`, `ids.competitors`, `ids.noData.ads`, `DEMO_COLLECTOR`; the `@cs/db` tables `ad` and `capture`.
- Produces: `AD_COPY`, `seedAds(ctx)`. It writes 30 ads, one of them untitled, plus the "first ad check" captures (`google_ads` / `meta_ads`) that start each competitor's weekly series (5c-1 decision 13).

- [ ] **Step 1: Write the failing test** — `packages/demo/src/ads.test.ts`:

```ts
import { ad, capture } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAds } from './ads';
import { createSeedContext, type SeedContext } from './context';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedAds(ctx);
});

describe('seedAds', () => {
  it('writes about 30 Google and Meta ads, active and ended, exactly one without a title', async () => {
    const rows = await dbs.owner.select().from(ad);
    expect(rows).toHaveLength(30);
    expect(new Set(rows.map((r) => r.platform))).toEqual(new Set(['google', 'meta']));
    expect(rows.some((r) => r.isActive && r.endedAt === null)).toBe(true);
    expect(rows.some((r) => !r.isActive && r.endedAt !== null)).toBe(true);
    expect(rows.filter((r) => r.title === null)).toHaveLength(1);
    for (const r of rows) {
      expect(r.lastSeenAt.getTime()).toBeGreaterThanOrEqual(r.firstSeenAt.getTime());
      if (r.endedAt) expect(r.endedAt.getTime()).toBeGreaterThan(r.firstSeenAt.getTime());
    }
  });

  it('leaves one competitor with no ads and no ad checks on purpose', async () => {
    expect(await dbs.owner.select().from(ad).where(eq(ad.competitorId, ctx.ids.noData.ads))).toHaveLength(0);
    expect(await dbs.owner.select().from(capture).where(and(eq(capture.competitorId, ctx.ids.noData.ads), inArray(capture.source, ['google_ads', 'meta_ads'])))).toHaveLength(0);
  });

  it('starts each other competitor’s ad history with an ok ad capture before its first ad', async () => {
    const rows = await dbs.owner.select().from(ad);
    for (const competitorId of new Set(rows.map((r) => r.competitorId))) {
      const caps = await dbs.owner.select().from(capture).where(and(eq(capture.competitorId, competitorId), inArray(capture.source, ['google_ads', 'meta_ads']), eq(capture.status, 'ok')));
      const firstCheck = Math.min(...caps.map((c) => c.capturedAt.getTime()));
      const firstAd = Math.min(...rows.filter((r) => r.competitorId === competitorId).map((r) => r.firstSeenAt.getTime()));
      expect(firstCheck).toBeLessThan(firstAd);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/ads.test.ts` (timeout 600000)
Expected: FAIL — `./ads` does not exist.

- [ ] **Step 3: Create `packages/demo/src/ads.ts`:**

```ts
import { ad, capture } from '@cs/db';
import type { SeedContext } from './context';
import type { DemoCompetitor } from './ids';
import { DEMO_COLLECTOR } from './tenancy';

export const AD_COPY: readonly { title: string; text: string }[] = [
  { title: 'Same-day AC repair in Granbury', text: 'Techs on the road now. Book online and save $25 on any repair.' },
  { title: '$79 AC tune-up', text: 'Beat the heat with a 21-point tune-up, this month only.' },
  { title: 'Furnace check before the first freeze', text: 'Schedule a furnace safety check for $89.' },
  { title: '0% financing on new systems', text: 'Replace your old unit with 0% APR for 60 months on approved credit.' },
  { title: 'Join our Comfort Club', text: 'Two tune-ups a year, priority service and 15% off repairs.' },
  { title: 'Emergency service 24/7', text: 'No overtime charges on nights and weekends.' },
  { title: 'Clogged drain? We are 30 minutes away', text: 'Upfront drain cleaning prices, no surprises.' },
  { title: 'Water heater out? Same-day install', text: 'Tank and tankless installs with a 6-year warranty.' },
  { title: 'Free camera inspection', text: 'With any sewer line service booked this week.' },
  { title: 'Duct cleaning special $199', text: 'Breathe easier this spring with whole-home duct cleaning.' },
  { title: 'Rated 4.8 stars by your neighbors', text: 'See why Hood County families call us first.' },
  { title: 'Leak detection without the mess', text: 'Non-invasive leak detection and repair.' },
];

/** Spec §4.4: ~30 ads; Lone Star competitors 4 each (minus the no-ads one), Brazos competitors 3/2/3/2. */
export async function seedAds(ctx: SeedContext): Promise<void> {
  const rng = ctx.rng('ads');
  const plan: [DemoCompetitor, number][] = [
    ...ctx.ids.competitors.loneStar.filter((c) => c.id !== ctx.ids.noData.ads).map((c): [DemoCompetitor, number] => [c, 4]),
    ...ctx.ids.competitors.brazos.map((c, i): [DemoCompetitor, number] => [c, i % 2 === 0 ? 3 : 2]),
  ];
  let serial = 0;
  for (const [comp, n] of plan) {
    const checks: Record<'google' | 'meta', { first: string; latest: string }> = {
      google: await adChecks(ctx, comp.id, 'google_ads'),
      meta: await adChecks(ctx, comp.id, 'meta_ads'),
    };
    const rows: (typeof ad.$inferInsert)[] = [];
    for (let k = 0; k < n; k++) {
      serial++;
      const platform = k % 2 === 0 ? 'google' : 'meta';
      const copy = AD_COPY[(serial * 5) % AD_COPY.length]!;
      const firstDays = rng.int(5, 170);
      const active = k === 0 || rng.chance(0.6);
      const endDays = active ? null : Math.max(2, firstDays - rng.int(10, 60));
      rows.push({
        competitorId: comp.id, platform, externalId: `demo-${platform}-${serial}`,
        advertiserId: platform === 'google' ? `AR0${1_000_000 + serial}` : null,
        format: platform === 'google' ? 'text' : rng.pick(['image', 'video']),
        // Spec §4.4: exactly one ad without a title shows as "Untitled".
        title: serial === 2 ? null : copy.title,
        text: copy.text, landingUrl: `https://${comp.domain}/offers`,
        publisherPlatforms: platform === 'google' ? ['google_search'] : ['facebook', 'instagram'],
        startedAt: ctx.clock.daysAgo(firstDays), endedAt: endDays === null ? null : ctx.clock.daysAgo(endDays), isActive: active,
        firstSeenAt: ctx.clock.daysAgo(firstDays), lastSeenAt: ctx.clock.daysAgo(endDays === null ? 1 : endDays + 1),
        firstCaptureId: checks[platform].first, lastCaptureId: checks[platform].latest, endedCaptureId: endDays === null ? null : checks[platform].latest,
      });
    }
    await ctx.db.insert(ad).values(rows);
  }
}

/** The first ok ad check (200 days ago) and the latest one (yesterday) for one platform. */
async function adChecks(ctx: SeedContext, competitorId: string, source: 'google_ads' | 'meta_ads'): Promise<{ first: string; latest: string }> {
  const rows = await ctx.db.insert(capture).values([
    { competitorId, source, status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: ctx.clock.daysAgo(200) },
    { competitorId, source, status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: ctx.clock.daysAgo(1) },
  ]).returning({ id: capture.id, capturedAt: capture.capturedAt });
  const sorted = [...rows].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  return { first: sorted[0]!.id, latest: sorted[1]!.id };
}
```

  Append `export * from './ads';` to `src/index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cs/demo exec vitest run src/ads.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/demo/src/ads.ts packages/demo/src/ads.test.ts packages/demo/src/index.ts
git commit -m "feat(demo): Google and Meta ad history"
```

---

### Task 7: Reviews, review analysis and Google Business Profiles

**Files:**
- Create: `packages/demo/src/names.ts`, `packages/demo/src/reviews.ts`, `packages/demo/src/reviews.test.ts`
- Modify: `packages/demo/src/index.ts`

**Interfaces:**
- Consumes:
  - `SeedContext`, `ids.competitors`, `ids.selfLoneStar`, `ids.noData.reviews`, `LONE_STAR_PLACE_ID`, `DEMO_COLLECTOR` (Task 3);
  - `pseudonymizeReviewer(name, salt)` (`@cs/collectors`);
  - the `@cs/db` tables `review`, `reviewAnalysis`, `capture` and `observation`.
- Produces:
  - `HVAC_THEMES` (the 8 theme ids of the `hvac_plumbing` pack), `REVIEW_PHRASES`, `FIRST_NAMES`, `LATE_PHRASE = 'showed up two hours late'`, `reviewText(rng, rating, themes)`;
  - `seedReviews(ctx)`. It fills `ctx.ids.sampleReviewIds` (3 ids) and writes one `gbp_profile` observation per business.

- [ ] **Step 1: Write the failing test** — `packages/demo/src/reviews.test.ts`:

```ts
import { pseudonymizeReviewer } from '@cs/collectors';
import { observation, review, reviewAnalysis } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { loadVerticalPack } from '@cs/verticals';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { HVAC_THEMES, LATE_PHRASE } from './names';
import { seedReviews } from './reviews';
import { seedTenancy } from './tenancy';
import { countRows, resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedReviews(ctx);
});

describe('seedReviews', () => {
  it('writes about 400 reviews over 12 months, each with one analysis', async () => {
    const n = await countRows(dbs.owner, sql`select count(*)::int as n from review`);
    expect(n).toBeGreaterThanOrEqual(380);
    expect(n).toBeLessThanOrEqual(420);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from review_analysis`)).toBe(n);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from review where posted_at < now() - interval '366 days' or posted_at > now()`)).toBe(0);
  });

  it('uses the pack’s theme ids, covers every theme, and leaves one business/theme cell empty on purpose', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    expect([...HVAC_THEMES].sort()).toEqual(pack.themes.map((t) => t.id).sort());
    const rows = await dbs.owner.select({ competitorId: reviewAnalysis.competitorId, asked: reviewAnalysis.asked, themes: reviewAnalysis.themes }).from(reviewAnalysis);
    for (const t of HVAC_THEMES) expect(rows.some((r) => r.themes.includes(t))).toBe(true);
    const hill = ctx.ids.competitors.loneStar[0]!.id;
    expect(rows.filter((r) => r.competitorId === hill).some((r) => r.asked.includes('cleanliness'))).toBe(false);
  });

  it('contains the searchable phrase once, leaves one competitor without reviews, and hashes reviewers with the salt', async () => {
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from review where text ilike ${`%${LATE_PHRASE}%`}`)).toBe(1);
    expect(await dbs.owner.select().from(review).where(eq(review.competitorId, ctx.ids.noData.reviews))).toHaveLength(0);
    const [r] = await dbs.owner.select({ hash: review.reviewerHash }).from(review).limit(1);
    expect(r!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r!.hash).not.toBe(pseudonymizeReviewer('James A.', 'another-salt-'.repeat(3)));
  });

  it('gives every business a GBP profile with a rating, except the no-reviews competitor (no rating)', async () => {
    const obs = await dbs.owner.select().from(observation).where(eq(observation.kind, 'gbp_profile'));
    expect(obs).toHaveLength(13);
    const empty = obs.find((o) => o.competitorId === ctx.ids.noData.reviews)!;
    expect(empty.data.rating).toBeNull();
    expect(obs.find((o) => o.competitorId === ctx.ids.selfLoneStar)!.data.rating).toEqual(expect.any(Number));
    expect(ctx.ids.sampleReviewIds).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/reviews.test.ts` (timeout 600000)
Expected: FAIL — `./names` and `./reviews` do not exist.

- [ ] **Step 3: Create `packages/demo/src/names.ts`:**

```ts
import type { Rng } from './random';

/** The 8 `hvac_plumbing` pack themes (reviews.test.ts checks them against the pack). */
export const HVAC_THEMES = ['response_time', 'price_transparency', 'technician_professionalism', 'upsell_pressure', 'scheduling', 'fix_quality', 'communication', 'cleanliness'] as const;
export type HvacTheme = (typeof HVAC_THEMES)[number];

/** Spec §4.5: searchable in at least one review. */
export const LATE_PHRASE = 'showed up two hours late';

export const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'Michael', 'Patricia', 'David', 'Jennifer', 'Carlos', 'Elizabeth', 'Daniel', 'Susan', 'Jose', 'Karen', 'Thomas', 'Nancy', 'Kevin', 'Lisa', 'Brian', 'Sandra', 'Luis', 'Ashley', 'Tyler', 'Megan', 'Ryan', 'Brenda', 'Jason', 'Amber', 'Eric', 'Rachel'] as const;
export const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTW'.split('');

export const REVIEW_PHRASES: Record<HvacTheme, { pos: readonly string[]; neg: readonly string[] }> = {
  response_time: { pos: ['They answered right away and had someone out the same afternoon.', 'Called at 8am and the tech was here by 10.'], neg: ['Took three days just to get a call back.', 'Waited all day for someone to show.'] },
  price_transparency: { pos: ['Gave us the price upfront, no surprises on the bill.', 'The quote matched the final invoice exactly.'], neg: ['The final bill had fees nobody mentioned.', 'The price doubled once the work started.'] },
  technician_professionalism: { pos: ['The technician was polite and clearly knew his stuff.', 'Very professional crew, explained everything.'], neg: ['The tech was rude and in a hurry.', 'Did not seem to know what he was doing.'] },
  upsell_pressure: { pos: ['No pressure to buy anything we did not need.', 'He fixed the part instead of pushing a new unit.'], neg: ['Kept pushing a whole new system on us.', 'Felt like a sales pitch for their membership.'] },
  scheduling: { pos: ['Arrived right at the start of the window.', 'Easy to book online and they kept the appointment.'], neg: ['Rescheduled on us twice.', 'Nobody came during the window they gave us.'] },
  fix_quality: { pos: ['Fixed it the first time and it has run great since.', 'Problem solved, the house is cool again.'], neg: ['The same problem came back a week later.', 'Had to call them out again for the same leak.'] },
  communication: { pos: ['Texted updates the whole way.', 'Explained the options clearly before starting.'], neg: ['Never told us what was going on.', 'No follow-up after the visit.'] },
  cleanliness: { pos: ['Wore shoe covers and cleaned up after.', 'Left the attic cleaner than they found it.'], neg: ['Left a mess in the garage.', 'Tracked mud through the house.'] },
};

const OPEN_POS = ['Great experience.', 'Highly recommend.', 'Will use them again.', 'Five stars from us.'];
const OPEN_NEG = ['Disappointed.', 'Not happy.', 'Would not recommend.', 'Frustrating visit.'];
const OPEN_MID = ['It was fine overall.', 'Okay service.', 'Mixed experience.'];

/** 4–5 stars: positive phrases; 1–2: negative; 3: one of each. */
export function reviewText(rng: Rng, rating: number, themes: readonly HvacTheme[]): string {
  const parts = [rating >= 4 ? rng.pick(OPEN_POS) : rating <= 2 ? rng.pick(OPEN_NEG) : rng.pick(OPEN_MID)];
  themes.forEach((t, i) => {
    const tone = rating >= 4 ? 'pos' : rating <= 2 ? 'neg' : i === 0 ? 'neg' : 'pos';
    parts.push(rng.pick(REVIEW_PHRASES[t][tone]));
  });
  return parts.join(' ');
}

export const OWNER_ANSWERS = [
  'Thank you for choosing us! We appreciate the kind words.',
  'Thanks for the feedback. We are glad we could help.',
  'We are sorry about this. Please call our office so we can make it right.',
] as const;
```

- [ ] **Step 4: Create `packages/demo/src/reviews.ts`:**

```ts
import { createHash } from 'node:crypto';
import { pseudonymizeReviewer } from '@cs/collectors';
import { capture, observation, review, reviewAnalysis } from '@cs/db';
import { DAY, notAfter } from './clock';
import type { SeedContext } from './context';
import { FIRST_NAMES, HVAC_THEMES, type HvacTheme, LAST_INITIALS, LATE_PHRASE, OWNER_ANSWERS, reviewText } from './names';
import { DEMO_COLLECTOR, LONE_STAR_PLACE_ID } from './tenancy';

interface Target {
  competitorId: string;
  slug: string;
  name: string;
  domain: string;
  placeId: string;
  lat: number;
  lng: number;
  category: string;
  count: number;
  mean: number;
  self: boolean;
  /** Ratings drop by 1.3 stars over the last 60 days (the reputation-slump move). */
  slump?: boolean;
  /** Spec §4.5 heatmap gap: this theme is never asked for this business. */
  skipTheme?: HvacTheme;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const clamp = (n: number) => Math.min(5, Math.max(1, n));

function targets(ctx: SeedContext): Target[] {
  const { ids } = ctx;
  const ls = ids.competitors.loneStar;
  const bz = ids.competitors.brazos;
  const comp = (c: (typeof ls)[number], category: string, count: number, mean: number, extra: Partial<Target> = {}): Target =>
    ({ competitorId: c.id, slug: c.slug, name: c.name, domain: c.domain, placeId: c.placeId, lat: c.lat, lng: c.lng, category, count, mean, self: false, ...extra });
  return [
    { competitorId: ids.selfLoneStar, slug: 'lone-star-cooling', name: 'Lone Star Cooling', domain: 'lone-star-cooling.example', placeId: LONE_STAR_PLACE_ID, lat: 32.447, lng: -97.798, category: 'HVAC contractor', count: 60, mean: 4.7, self: true },
    comp(ls[0]!, 'HVAC contractor', 36, 4.4, { skipTheme: 'cleanliness' }),
    comp(ls[1]!, 'HVAC contractor', 36, 3.9),
    comp(ls[2]!, 'HVAC contractor', 36, 4.5),
    comp(ls[3]!, 'HVAC contractor', 36, 4.2, { slump: true }),
    comp(ls[4]!, 'HVAC contractor', 36, 4.0),
    comp(ls[5]!, 'HVAC contractor', 36, 4.6),
    comp(bz[0]!, 'Plumber', 40, 4.1),
    comp(bz[1]!, 'Plumber', 40, 3.7),
    comp(bz[2]!, 'Plumber', 40, 4.3),
    comp(bz[3]!, 'Plumber', 0, 0), // ids.noData.reviews: a profile, no reviews
  ];
}

/** Spec §4.5. */
export async function seedReviews(ctx: SeedContext): Promise<void> {
  const rng = ctx.rng('reviews');
  const now = ctx.clock.now;
  const ratingsByBusiness = new Map<string, number[]>();
  for (const t of targets(ctx)) {
    const pool = HVAC_THEMES.filter((x) => x !== t.skipTheme);
    const rows: (typeof review.$inferInsert)[] = [];
    const analyses: { themes: HvacTheme[]; rating: number }[] = [];
    const add = (rating: number, days: number, text: string, themes: HvacTheme[]) => {
      const postedAt = ctx.clock.daysAgo(days);
      const answered = rng.chance(t.self ? 0.7 : 0.3);
      rows.push({
        competitorId: t.competitorId, source: 'google', dedupeKey: `demo-${t.slug}-${rows.length}`, externalId: `demo-${t.slug}-${rows.length}`, rating, text,
        reviewerHash: pseudonymizeReviewer(`${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_INITIALS)}.`, ctx.salt), postedAt,
        ownerAnswer: answered ? OWNER_ANSWERS[rating >= 4 ? rng.int(0, 1) : 2] : null,
        ownerAnsweredAt: answered ? notAfter(new Date(postedAt.getTime() + rng.int(1, 3) * DAY), now) : null,
        firstSeenAt: notAfter(new Date(postedAt.getTime() + DAY), new Date(now.getTime() - 3_600_000)), lastSeenAt: ctx.clock.daysAgo(0.5),
      });
      analyses.push({ themes, rating });
    };
    for (let n = 0; n < t.count; n++) {
      const days = 0.5 + rng.next() * 364;
      const mean = t.mean - (t.slump && days < 60 ? 1.3 : 0);
      const rating = clamp(Math.round(mean + (rng.next() + rng.next() - 1) * 1.6));
      // Cycle the first theme so every theme the business is asked about appears at least once.
      const first = pool[n % pool.length]!;
      const second = rng.chance(0.4) ? rng.pick(pool.filter((x) => x !== first)) : null;
      const themes = second ? [first, second] : [first];
      add(rating, days, reviewText(rng, rating, themes), themes);
    }
    if (t.competitorId === ctx.ids.competitors.loneStar[1]!.id) {
      add(2, 9, `The tech ${LATE_PHRASE} and never called ahead. Fixed the AC in the end.`, ['scheduling', 'communication']);
    }
    const reviewIds: string[] = [];
    for (let i = 0; i < rows.length; i += 100) {
      const inserted = await ctx.db.insert(review).values(rows.slice(i, i + 100)).returning({ id: review.id });
      reviewIds.push(...inserted.map((r) => r.id));
    }
    if (reviewIds.length) {
      await ctx.db.insert(reviewAnalysis).values(reviewIds.map((reviewId, i) => ({
        reviewId, verticalId: 'hvac_plumbing', competitorId: t.competitorId, textSha: sha(String(rows[i]!.text)), asked: [...pool], themes: analyses[i]!.themes,
        other: false, sentiment: analyses[i]!.rating - 1, confidence: 0.9, needsReview: false, analysisVersion: 1, analyzedAt: rows[i]!.firstSeenAt as Date,
      })));
    }
    if (!t.self && ctx.ids.sampleReviewIds.length < 3) ctx.ids.sampleReviewIds.push(...reviewIds.slice(0, 3 - ctx.ids.sampleReviewIds.length));
    ratingsByBusiness.set(t.competitorId, analyses.map((a) => a.rating));
    await gbpProfile(ctx, t, ratingsByBusiness.get(t.competitorId)!);
  }
  // The prospect's competitors (dental) get a profile too; the pitch snapshot shows their ratings.
  for (const [i, c] of ctx.ids.competitors.lakeside.entries()) {
    await gbpProfile(ctx, { competitorId: c.id, slug: c.slug, name: c.name, domain: c.domain, placeId: c.placeId, lat: c.lat, lng: c.lng, category: 'Dentist', count: 0, mean: 0, self: false }, [], [4.6, 4.3][i] ?? 4.5, [210, 95][i] ?? 50);
  }
}

async function gbpProfile(ctx: SeedContext, t: Target, ratings: number[], fixedRating?: number, fixedVotes?: number): Promise<void> {
  const at = ctx.clock.daysAgo(1.5);
  const rating = fixedRating ?? (ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null);
  const votes = fixedVotes ?? (ratings.length ? ratings.length + 40 : 0);
  const [c] = await ctx.db.insert(capture).values({ competitorId: t.competitorId, source: 'google_business_profile', status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
  await ctx.db.insert(observation).values({
    competitorId: t.competitorId, captureId: c!.id, kind: 'gbp_profile', key: 'profile', observedAt: at,
    data: {
      title: t.name, category: t.category, additionalCategories: [], rating, votes, phone: null, url: `https://${t.domain}/`, domain: t.domain,
      address: 'Granbury, TX', isClaimed: true, currentStatus: 'open', cid: null, placeId: t.placeId, latitude: t.lat, longitude: t.lng,
    },
  });
}
```

  Append `export * from './names';` and `export * from './reviews';` to `src/index.ts`.

  The GBP count is 13: self, 6 Lone Star competitors, 4 Brazos and 2 Lakeside, which matches the test.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cs/demo exec vitest run src/reviews.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/demo/src/names.ts packages/demo/src/reviews.ts packages/demo/src/reviews.test.ts packages/demo/src/index.ts
git commit -m "feat(demo): ~400 analysed reviews and Google Business Profiles"
```

---

### Task 8: Rankings

**Files:**
- Create: `packages/demo/src/rankings.ts`, `packages/demo/src/rankings.test.ts`
- Modify: `packages/demo/src/index.ts`

**Interfaces:**
- Consumes: `SeedContext`, `CLIENT_SPECS` (keywords, service areas), `ids.competitors`, `ids.noData.rankings`, `LONE_STAR_PLACE_ID`, `distanceKm`; the `@cs/db` tables `rankScan` and `rankSnapshot`, and `type RankResult`.
- Produces:
  - `GRID_SIZE = 7`, `FILLER_BUSINESSES` (14 names), `gridPoints(center, radiusKm): GridPoint[]` (row 0 = north, col 0 = west, 6-decimal coordinates);
  - `seedRankings(ctx)`: 8 weekly scans per active client. Lone Star has one failed scan, one failed grid point and one keyword where its own business falls outside the top 20 at the edge of the area.

- [ ] **Step 1: Write the failing test** — `packages/demo/src/rankings.test.ts`:

```ts
import { rankScan, rankSnapshot } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { GRID_SIZE, gridPoints, seedRankings } from './rankings';
import { CLIENT_SPECS, LONE_STAR_PLACE_ID, seedTenancy } from './tenancy';
import { countRows, resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedRankings(ctx);
});

describe('gridPoints', () => {
  it('lays a 7×7 grid across the service area, north to south and west to east', () => {
    const pts = gridPoints({ lat: 32.44, lng: -97.79 }, 25);
    expect(pts).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(pts[0]!.lat).toBeGreaterThan(pts[GRID_SIZE * (GRID_SIZE - 1)]!.lat);
    expect(pts[0]!.lng).toBeLessThan(pts[GRID_SIZE - 1]!.lng);
  });
});

describe('seedRankings', () => {
  it('writes 8 weekly scans per active client; Lone Star has one failed scan', async () => {
    const ls = await dbs.owner.select().from(rankScan).where(eq(rankScan.clientId, ctx.ids.clients.loneStar));
    const bz = await dbs.owner.select().from(rankScan).where(eq(rankScan.clientId, ctx.ids.clients.brazos));
    expect([ls.length, bz.length]).toEqual([8, 8]);
    expect(ls.filter((s) => s.status === 'failed')).toHaveLength(1);
    expect(bz.every((s) => s.status === 'done')).toBe(true);
  });

  it('covers 3 keywords on a 7×7 grid, with one failed point in one Lone Star scan', async () => {
    const counts = [...(await dbs.owner.execute<{ scan_id: string; n: number }>(sql`select scan_id, count(*)::int as n from rank_snapshot where client_id = ${ctx.ids.clients.loneStar} group by scan_id`))].map((r) => Number(r.n)).sort();
    expect(counts).toEqual([146, 147, 147, 147, 147, 147, 147]);
    const kws = await dbs.owner.selectDistinct({ k: rankSnapshot.keyword }).from(rankSnapshot).where(eq(rankSnapshot.clientId, ctx.ids.clients.loneStar));
    expect(kws.map((k) => k.k).sort()).toEqual([...CLIENT_SPECS.loneStar.keywords].sort());
  });

  it('puts Lone Star outside the top 20 at the edge for one keyword, and never ranks the no-rankings competitor', async () => {
    const edge = await dbs.owner.select({ results: rankSnapshot.results }).from(rankSnapshot)
      .where(and(eq(rankSnapshot.clientId, ctx.ids.clients.loneStar), eq(rankSnapshot.keyword, CLIENT_SPECS.loneStar.keywords[2]!)));
    expect(edge.some((s) => !s.results.some((r) => r.placeId === LONE_STAR_PLACE_ID))).toBe(true);
    const never = ctx.ids.competitors.loneStar.find((c) => c.id === ctx.ids.noData.rankings)!.placeId;
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from rank_snapshot where results::text like ${`%${never}%`}`)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/rankings.test.ts` (timeout 600000)
Expected: FAIL — `./rankings` does not exist.

- [ ] **Step 3: Create `packages/demo/src/rankings.ts`:**

```ts
import { rankScan, rankSnapshot, type RankResult } from '@cs/db';
import type { SeedContext } from './context';
import { distanceKm, type LatLng } from './geo';
import type { ActiveClientKey } from './ids';
import { CLIENT_SPECS, LONE_STAR_PLACE_ID } from './tenancy';

export const GRID_SIZE = 7;
export const FILLER_BUSINESSES = [
  'Rapid Air Solutions', 'Cowboy Comfort Systems', 'Texan Temp Control', 'Bluebonnet Heating & Air', 'North Texas Air Pros', 'Weatherford Air Experts',
  'Stephenville Service Co', 'Glen Rose Mechanical', 'Lake Country Plumbing', 'Pinnacle Plumbing & Air', 'Frontier Home Services', 'Cedar Creek Comfort',
  'Hood County Heating', 'Prairie Wind HVAC',
] as const;

export interface GridPoint extends LatLng {
  row: number;
  col: number;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Row 0 is the north edge, column 0 the west edge, spanning the service-area diameter. */
export function gridPoints(center: LatLng, radiusKm: number): GridPoint[] {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const out: GridPoint[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      out.push({ row, col, lat: r6(center.lat + dLat - (2 * dLat * row) / (GRID_SIZE - 1)), lng: r6(center.lng - dLng + (2 * dLng * col) / (GRID_SIZE - 1)) });
    }
  }
  return out;
}

interface Ranked extends LatLng {
  key: string;
  title: string;
  placeId: string;
  domain: string | null;
  /** One base strength per keyword. */
  strength: number[];
}

const edge = (p: GridPoint) => p.row === 0 || p.col === 0 || p.row === GRID_SIZE - 1 || p.col === GRID_SIZE - 1;

/** Spec §4.6. */
export async function seedRankings(ctx: SeedContext): Promise<void> {
  for (const key of ['loneStar', 'brazos'] as const) await seedClientScans(ctx, key);
}

async function seedClientScans(ctx: SeedContext, key: ActiveClientKey): Promise<void> {
  const rng = ctx.rng(`rankings:${key}`);
  const spec = CLIENT_SPECS[key];
  const { center, radiusKm } = spec.serviceArea;
  const keywords = spec.keywords;
  const three = () => [rng.between(0.5, 2.5), rng.between(0.5, 2.5), rng.between(0.5, 2.5)];
  const businesses: Ranked[] = [
    ...(key === 'loneStar' ? [{ key: 'self', title: 'Lone Star Cooling', placeId: LONE_STAR_PLACE_ID, domain: 'lone-star-cooling.example', lat: 32.447, lng: -97.798, strength: [3.2, 2.8, 1.0] }] : []),
    ...ctx.ids.competitors[key].filter((c) => c.id !== ctx.ids.noData.rankings)
      .map((c, i) => ({ key: c.id, title: c.name, placeId: c.placeId, domain: c.domain, lat: c.lat, lng: c.lng, strength: [2.6 - i * 0.2, 2.4 - i * 0.15, 2.2 - i * 0.1].map((s) => s + rng.between(-0.3, 0.3)) })),
    ...FILLER_BUSINESSES.map((title, i) => ({
      key: `filler-${i}`, title, placeId: `demo-filler-${i}`, domain: null, lat: center.lat + rng.between(-0.15, 0.15), lng: center.lng + rng.between(-0.15, 0.15), strength: three(),
    })),
  ];
  const points = gridPoints(center, radiusKm);
  for (let w = 7; w >= 0; w--) {
    const finishedAt = ctx.clock.daysAgo(w * 7 + 1);
    const startedAt = new Date(finishedAt.getTime() - 20 * 60_000);
    const base = { agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients[key] };
    if (key === 'loneStar' && w === 5) {
      // Spec §4.6: one failed scan.
      await ctx.db.insert(rankScan).values({ ...base, status: 'failed', snapshots: 0, failed: points.length * keywords.length, startedAt, finishedAt });
      continue;
    }
    const growth = (7 - w) * 0.12; // Lone Star slowly gains share of voice
    const snaps: Omit<typeof rankSnapshot.$inferInsert, 'scanId'>[] = [];
    for (const [k, keyword] of keywords.entries()) {
      for (const p of points) {
        if (key === 'loneStar' && w === 3 && p.row === GRID_SIZE - 1 && p.col === GRID_SIZE - 1) continue; // one failed grid point → "no data"
        let ranked = businesses
          .map((b) => ({ b, s: b.strength[k]! + (b.key === 'self' ? growth : 0) - distanceKm(p, b) / 6 + rng.between(-0.6, 0.6) }))
          .sort((x, y) => y.s - x.s)
          .map((x) => x.b);
        // Spec §4.6: one keyword where the client's own business is outside the top 20 at the edge of the area.
        if (key === 'loneStar' && k === 2 && edge(p)) ranked = ranked.filter((b) => b.key !== 'self');
        const results: RankResult[] = ranked.slice(0, 20).map((b, i) => ({ rank: i + 1, placeId: b.placeId, cid: null, domain: b.domain, title: b.title }));
        snaps.push({ ...base, keyword, lat: p.lat, lng: p.lng, results, capturedAt: finishedAt });
      }
    }
    const [scan] = await ctx.db.insert(rankScan).values({ ...base, status: 'done', snapshots: snaps.length, failed: points.length * keywords.length - snaps.length, startedAt, finishedAt }).returning({ id: rankScan.id });
    for (let i = 0; i < snaps.length; i += 200) await ctx.db.insert(rankSnapshot).values(snaps.slice(i, i + 200).map((s) => ({ ...s, scanId: scan!.id })));
  }
}
```

  Append `export * from './rankings';` to `src/index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cs/demo exec vitest run src/rankings.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/demo/src/rankings.ts packages/demo/src/rankings.test.ts packages/demo/src/index.ts
git commit -m "feat(demo): weekly geo-grid rank scans with a failed scan and gaps"
```

---

### Task 9: Briefs, recommendations, alerts and the trend report

**Files:**
- Create: `packages/demo/src/briefs.ts`, `packages/demo/src/briefs.test.ts`
- Modify: `packages/demo/src/index.ts`

**Interfaces:**
- Consumes:
  - `ids.events`, `ids.moves`, `ids.users`, `ids.competitors`, `ids.selfLoneStar` (Tasks 3–4);
  - `atUtc`, `notAfter`, `DAY`;
  - the `@cs/db` tables `brief`, `briefItem`, `recommendation`, `feedback`, `alert`, `alertEvent`, `trendReport`, `review` and `ad`, plus the types `TrendBusiness`, `TrendSnapshot` and `TrendReportData`.
- Produces:
  - `seedBriefs(ctx)`;
  - fills `ids.briefs.{sentLoneStar[4], sentBrazos[2], readyLoneStar, quietBrazos}`, `ids.alerts.{delivered, pending, dismissed}` and `ids.reportId`;
  - `trendBusinesses(ctx, client): Promise<TrendBusiness[]>`.
- Needs from earlier areas:
  - **Task 4:** at least 8 Lone Star and 4 Brazos non-archive events older than 7 days, Lone Star non-archive events in the last 7 days, 2 Lone Star alert-route events and 1 Brazos alert-route event. The `EVENT_SPECS` table guarantees all of these. `seedBriefs` throws with a clear message if they are missing.
  - **Tasks 6 and 7** must run first, because `trendBusinesses` counts their reviews and ads. Briefs written before them would show zeros. The `seedDemo` order guarantees this (Task 11).

- [ ] **Step 1: Write the failing test** — `packages/demo/src/briefs.test.ts`:

```ts
import { alert, alertEvent, brief, briefItem, feedback, recommendation, trendReport } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAds } from './ads';
import { seedBriefs } from './briefs';
import { seedChanges } from './changes';
import { createSeedContext, type SeedContext } from './context';
import { seedReviews } from './reviews';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedChanges(ctx);
  await seedAds(ctx);
  await seedReviews(ctx);
  await seedBriefs(ctx);
});

describe('seedBriefs', () => {
  it('sends Lone Star’s briefs for the past 4 Mondays and holds one ready for approval', async () => {
    const rows = await dbs.owner.select().from(brief).where(eq(brief.clientId, ctx.ids.clients.loneStar));
    expect(rows.filter((b) => b.status === 'sent').map((b) => b.deliveryDate).sort().reverse()).toEqual(ctx.clock.pastMondays);
    const ready = rows.find((b) => b.status === 'ready')!;
    expect([ready.deliveryDate, ready.kind]).toEqual([ctx.clock.nextMonday, 'standard']);
    const items = await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, ready.id));
    expect(items.filter((i) => i.status === 'active')).toHaveLength(3);
    expect(items.filter((i) => i.status === 'dropped')).toHaveLength(1);
    for (const i of items) expect(i.evidenceIds.length).toBeGreaterThan(0);
  });

  it('holds a quiet brief for Brazos and sends two earlier ones', async () => {
    const rows = await dbs.owner.select().from(brief).where(eq(brief.clientId, ctx.ids.clients.brazos));
    expect(rows.filter((b) => b.status === 'sent')).toHaveLength(2);
    const quiet = rows.find((b) => b.id === ctx.ids.briefs.quietBrazos)!;
    expect([quiet.kind, quiet.status]).toEqual(['quiet', 'ready']);
    expect(await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, quiet.id))).toHaveLength(0);
  });

  it('puts recommendations on the board with every status, a dismissal reason and feedback', async () => {
    const recs = await dbs.owner.select().from(recommendation);
    expect(new Set(recs.map((r) => r.status))).toEqual(new Set(['todo', 'in_progress', 'done', 'dismissed']));
    expect(recs.filter((r) => r.status === 'dismissed').every((r) => r.dismissReason)).toBe(true);
    expect(recs.filter((r) => r.source === 'move').length).toBe(ctx.ids.moves.filter((m) => m.open).length);
    const kinds = new Set((await dbs.owner.select().from(feedback)).map((f) => f.kind));
    expect(kinds).toEqual(new Set(['rating', 'status', 'edit', 'drop']));
  });

  it('has a delivered, a pending and a dismissed alert, each with its primary alert_event', async () => {
    const rows = await dbs.owner.select().from(alert);
    expect(rows.map((a) => a.status).sort()).toEqual(['delivered', 'dismissed', 'pending_review']);
    expect(rows.find((a) => a.status === 'dismissed')!.dismissReason).toBeTruthy();
    for (const a of rows) expect(await dbs.owner.select().from(alertEvent).where(eq(alertEvent.alertId, a.id))).toEqual([expect.objectContaining({ eventId: a.eventId })]);
  });

  it('sends a trend report for last quarter with counts from the seeded data', async () => {
    const [r] = await dbs.owner.select().from(trendReport);
    expect(r!.status).toBe('sent');
    expect(r!.quarter).toMatch(/^\d{4}-Q[1-4]$/);
    expect(r!.data!.businesses.length).toBeGreaterThan(1);
    expect(Object.values(r!.data!.eventsByType).reduce((a, b) => a + b, 0)).toBe(ctx.ids.events.filter((e) => e.client === 'loneStar').length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/briefs.test.ts` (timeout 600000)
Expected: FAIL — `./briefs` does not exist.

- [ ] **Step 3: Create `packages/demo/src/briefs.ts`:**

```ts
import { ad, alert, alertEvent, brief, briefItem, feedback, recommendation, review, trendReport, type TrendBusiness, type TrendReportData, type TrendSnapshot } from '@cs/db';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { atUtc, DAY, notAfter } from './clock';
import type { SeedContext } from './context';
import type { ActiveClientKey, DemoEvent } from './ids';

const WHY: Record<string, string> = {
  price_change: 'Price-sensitive customers in your area compare these prices before they book.',
  promo: 'A visible special can pull this week’s bookings away from you.',
  ad_started: 'More paid ads usually mean more calls going to them for the same searches.',
  ad_stopped: 'Fewer competing ads make this a cheap window for your own campaigns.',
  review_spike: 'Complaints in their reviews are an opening to highlight your own reliability.',
  rating_change: 'Ratings are the first thing searchers compare in the map pack.',
  new_service: 'They now compete for a service you offer.',
  hiring: 'Hiring signals they expect more demand and faster response times.',
  service_area_change: 'They now market to ZIP codes you serve.',
  new_location: 'A closer location shortens their response time in your area.',
  content: 'A minor site change, worth a glance.',
};
const ACTION: Record<string, string> = {
  price_change: 'Promote a value bundle instead of matching the price.',
  promo: 'Answer with a time-limited offer of your own on your Google profile.',
  ad_started: 'Check your ad coverage on the same keywords.',
  ad_stopped: 'Raise bids on the keywords they just left.',
  review_spike: 'Ask happy customers about punctuality in your review requests.',
  rating_change: 'Reply to your newest reviews and ask recent customers for one.',
  new_service: 'Highlight your experience with this service on your site.',
  hiring: 'Promote your same-day availability while they are short-staffed.',
  service_area_change: 'Run local ads in the ZIP codes they just added.',
  new_location: 'Tell nearby customers about your response times.',
  content: 'No action needed.',
};
const PLAYBOOK: Record<string, string> = { price_change: 'price_cut_bundle', promo: 'promo_blitz_counter', ad_started: 'ad_surge_watch', review_spike: 'reputation_slump_capture', service_area_change: 'territory_defend', new_service: 'new_service_response', hiring: 'hiring_push_capacity' };
const MOVE_ACTION: Record<string, { title: string; playbookId: string }> = {
  price_war: { title: 'Hold price and sell certainty: lead with guarantees', playbookId: 'price_war_hold_position' },
  promo_blitz: { title: 'Counter with one strong offer instead of many small ones', playbookId: 'promo_blitz_counter' },
  ad_surge: { title: 'Watch cost per lead and protect your brand keywords', playbookId: 'ad_surge_watch' },
};
const STATUS_CYCLE = ['done', 'in_progress', 'todo', 'dismissed'] as const;

const ageDays = (ctx: SeedContext, e: DemoEvent) => (ctx.clock.now.getTime() - e.occurredAt.getTime()) / DAY;

/** Spec §9.1.5 trend numbers for one client's businesses, computed from the seeded rows. */
export async function trendBusinesses(ctx: SeedContext, client: ActiveClientKey): Promise<TrendBusiness[]> {
  const list = [
    ...(client === 'loneStar' ? [{ id: ctx.ids.selfLoneStar, name: 'Lone Star Cooling', self: true }] : []),
    ...ctx.ids.competitors[client].map((c) => ({ id: c.id, name: c.name, self: false })),
  ];
  const ids = list.map((b) => b.id);
  const since = ctx.clock.daysAgo(90);
  const prev = ctx.clock.daysAgo(180);
  const stats = await ctx.db
    .select({ id: review.competitorId, n: sql<number>`count(*) filter (where ${review.postedAt} >= ${since})::int`, avg: sql<number | null>`avg(${review.rating}) filter (where ${review.postedAt} >= ${since})`, prevAvg: sql<number | null>`avg(${review.rating}) filter (where ${review.postedAt} < ${since})` })
    .from(review).where(and(inArray(review.competitorId, ids), gte(review.postedAt, prev))).groupBy(review.competitorId);
  const ads = await ctx.db.select({ id: ad.competitorId, n: sql<number>`count(*)::int` }).from(ad).where(and(inArray(ad.competitorId, ids), eq(ad.isActive, true))).groupBy(ad.competitorId);
  const r1 = (x: number | null) => (x === null ? null : Math.round(Number(x) * 10) / 10);
  return list.map((b) => {
    const s = stats.find((x) => x.id === b.id);
    return { competitorId: b.id, name: b.name, self: b.self, reviews: Number(s?.n ?? 0), avgRating: r1(s?.avg ?? null), prevAvgRating: r1(s?.prevAvg ?? null), activeAds: b.self ? null : Number(ads.find((x) => x.id === b.id)?.n ?? 0) };
  });
}

function itemValues(ctx: SeedContext, client: ActiveClientKey, briefId: string, e: DemoEvent, ord: number, status: 'active' | 'dropped') {
  const m = ctx.ids.moves.find((x) => x.competitorId === e.competitorId && x.client === client);
  return {
    briefId, agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients[client], ord, competitorId: e.competitorId, headline: e.summary, whatChanged: `${e.summary}.`,
    whyItMatters: WHY[e.changeType] ?? WHY.content!, recommendedAction: ACTION[e.changeType] ?? ACTION.content!, confidence: 0.88,
    effort: e.changeType === 'price_change' ? 'L' : 'M', impact: e.route === 'alert' ? 'H' : 'M', eventIds: [e.id], moveId: m?.id ?? null, evidenceIds: e.evidenceIds,
    upsellTag: e.changeType.startsWith('ad_') ? 'ppc_audit' : null, playbookId: PLAYBOOK[e.changeType] ?? null, status,
    editedBy: status === 'dropped' ? ctx.ids.users.admin.userId : null,
  };
}

async function seedSentBriefs(ctx: SeedContext, client: ActiveClientKey, count: number): Promise<string[]> {
  const { db, ids, clock } = ctx;
  const pool = ids.events.filter((e) => e.client === client && e.route !== 'archive' && ageDays(ctx, e) > 7).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  if (pool.length < count * 2) throw new Error(`seedBriefs: ${client} needs ${count * 2} older brief/alert events, has ${pool.length}`);
  const admin = ids.users.admin.userId;
  const owner = ids.users[client === 'loneStar' ? 'ownerLoneStar' : 'ownerBrazos'].userId;
  const trend: TrendSnapshot = { windowDays: 7, events: 0, businesses: await trendBusinesses(ctx, client) };
  const out: string[] = [];
  let n = 0;
  for (let i = 0; i < count; i++) {
    const deliveryDate = clock.pastMondays[i]!;
    const end = atUtc(deliveryDate);
    const start = new Date(end.getTime() - 7 * DAY);
    const events = pool.slice(2 * i, 2 * i + 2);
    const approvedAt = notAfter(new Date(end.getTime() - 14 * 3_600_000), clock.now);
    const sentAt = notAfter(new Date(end.getTime() + 12 * 3_600_000), clock.now);
    const [b] = await db.insert(brief).values({
      agencyId: ids.agencyId, clientId: ids.clients[client], deliveryDate, periodStart: start, periodEnd: end, kind: 'standard', status: 'sent',
      summary: `${events.length} notable competitor moves this week.`, trend: { ...trend, events: events.length }, dropped: { items: 1, sentences: 2 },
      generatedAt: new Date(start.getTime() + 4 * DAY), approvedAt, approvedBy: admin, sentAt, createdAt: new Date(start.getTime() + 4 * DAY), updatedAt: sentAt,
    }).returning({ id: brief.id });
    out.push(b!.id);
    const items = await db.insert(briefItem).values(events.map((e, k) => itemValues(ctx, client, b!.id, e, k + 1, 'active'))).returning({ id: briefItem.id, headline: briefItem.headline });
    for (const [k, item] of items.entries()) {
      const e = events[k]!;
      const status = STATUS_CYCLE[n++ % STATUS_CYCLE.length]!;
      const v = itemValues(ctx, client, b!.id, e, k + 1, 'active');
      const [rec] = await db.insert(recommendation).values({
        agencyId: ids.agencyId, clientId: ids.clients[client], title: v.recommendedAction, rationale: v.whyItMatters, evidenceIds: e.evidenceIds, eventIds: [e.id],
        moveId: v.moveId, briefItemId: item.id, playbookId: v.playbookId, effort: v.effort, impact: v.impact, owner: k % 2 === 0 ? 'client' : 'agency', status,
        dismissReason: status === 'dismissed' ? 'We already run a similar offer' : null, dueAt: status === 'todo' ? new Date(end.getTime() + 14 * DAY) : null,
        source: 'brief', createdAt: approvedAt, updatedAt: sentAt,
      }).returning({ id: recommendation.id });
      await db.insert(feedback).values({ agencyId: ids.agencyId, clientId: ids.clients[client], subjectType: 'brief_item', subjectId: item.id, kind: 'rating', after: { useful: true }, actor: admin, createdAt: approvedAt });
      if (status !== 'todo') {
        await db.insert(feedback).values({
          agencyId: ids.agencyId, clientId: ids.clients[client], subjectType: 'recommendation', subjectId: rec!.id, kind: 'status', before: { status: 'todo' }, after: { status },
          reason: status === 'dismissed' ? 'We already run a similar offer' : null, actor: k % 2 === 0 ? owner : admin, createdAt: sentAt,
        });
      }
    }
  }
  return out;
}

async function seedReadyBriefs(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const end = atUtc(clock.nextMonday);
  const start = new Date(end.getTime() - 7 * DAY);
  const recent = ids.events.filter((e) => e.client === 'loneStar' && e.route !== 'archive' && ageDays(ctx, e) <= 7).sort((a, b) => b.score - a.score);
  if (recent.length < 4) throw new Error(`seedBriefs: Lone Star needs 4 brief/alert events in the last 7 days, has ${recent.length}`);
  const [ready] = await db.insert(brief).values({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, deliveryDate: clock.nextMonday, periodStart: start, periodEnd: end, kind: 'standard', status: 'ready',
    summary: 'Three competitors moved on price and ads this week.', trend: { windowDays: 7, events: recent.length, businesses: await trendBusinesses(ctx, 'loneStar') },
    dropped: { items: 0, sentences: 1 }, generatedAt: clock.daysAgo(0.25), createdAt: clock.daysAgo(0.25), updatedAt: clock.daysAgo(0.1),
  }).returning({ id: brief.id });
  ids.briefs.readyLoneStar = ready!.id;
  const values = recent.slice(0, 4).map((e, k) => itemValues(ctx, 'loneStar', ready!.id, e, k + 1, k === 3 ? 'dropped' : 'active'));
  const items = await db.insert(briefItem).values(values).returning({ id: briefItem.id, headline: briefItem.headline, status: briefItem.status });
  const admin = ids.users.admin.userId;
  const base = { agencyId: ids.agencyId, clientId: ids.clients.loneStar, subjectType: 'brief_item', actor: admin, createdAt: clock.daysAgo(0.1) };
  await db.insert(feedback).values([
    { ...base, subjectId: items[0]!.id, kind: 'edit', before: { headline: `${items[0]!.headline} this week` }, after: { headline: items[0]!.headline } },
    { ...base, subjectId: items.find((i) => i.status === 'dropped')!.id, kind: 'drop', reason: 'Too minor for this week' },
  ]);

  const [quiet] = await db.insert(brief).values({
    agencyId: ids.agencyId, clientId: ids.clients.brazos, deliveryDate: clock.nextMonday, periodStart: start, periodEnd: end, kind: 'quiet', status: 'ready',
    summary: 'No significant competitor changes this week.', trend: { windowDays: 7, events: 0, businesses: await trendBusinesses(ctx, 'brazos') },
    dropped: { items: 2, sentences: 3 }, generatedAt: clock.daysAgo(0.25), createdAt: clock.daysAgo(0.25), updatedAt: clock.daysAgo(0.25),
  }).returning({ id: brief.id });
  ids.briefs.quietBrazos = quiet!.id;
}

async function seedMoveRecommendations(ctx: SeedContext): Promise<void> {
  for (const m of ctx.ids.moves.filter((x) => x.open)) {
    const a = MOVE_ACTION[m.moveType] ?? { title: 'Review this competitor move with the client', playbookId: null };
    await ctx.db.insert(recommendation).values({
      agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients[m.client], title: a.title, rationale: m.summary, moveId: m.id, playbookId: a.playbookId,
      effort: 'M', impact: 'H', owner: 'agency', status: 'todo', source: 'move', createdAt: ctx.clock.daysAgo(3), updatedAt: ctx.clock.daysAgo(3),
    });
  }
}

async function seedAlerts(ctx: SeedContext): Promise<void> {
  const { db, ids } = ctx;
  const byNewest = (client: ActiveClientKey) => ids.events.filter((e) => e.client === client && e.route === 'alert').sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const [pending, delivered] = byNewest('loneStar');
  const [dismissed] = byNewest('brazos');
  if (!pending || !delivered || !dismissed) throw new Error('seedBriefs: needs 2 Lone Star and 1 Brazos alert-route events');
  const admin = ids.users.admin.userId;
  const insert = async (client: ActiveClientKey, e: DemoEvent, extra: Partial<typeof alert.$inferInsert>): Promise<string> => {
    const reviewedAt = new Date(e.occurredAt.getTime() + 2 * 3_600_000);
    const [row] = await db.insert(alert).values({
      agencyId: ids.agencyId, clientId: ids.clients[client], competitorId: e.competitorId, eventId: e.id, score: e.score, headline: e.summary,
      body: `${e.summary}. ${WHY[e.changeType] ?? ''}`.trim(), written: 'model', evidenceIds: e.evidenceIds, status: 'pending_review', mode: 'after_am_check',
      createdAt: new Date(e.occurredAt.getTime() + 3_600_000), updatedAt: reviewedAt, ...extra,
    }).returning({ id: alert.id });
    await db.insert(alertEvent).values({ alertId: row!.id, agencyId: ids.agencyId, clientId: ids.clients[client], eventId: e.id });
    return row!.id;
  };
  const deliveredAt = new Date(delivered.occurredAt.getTime() + 2.5 * 3_600_000);
  ids.alerts.pending = await insert('loneStar', pending, {});
  ids.alerts.delivered = await insert('loneStar', delivered, {
    status: 'delivered', delivery: 'immediate', reviewedBy: admin, reviewedAt: new Date(delivered.occurredAt.getTime() + 2 * 3_600_000), deliveredAt,
    deliveredLocalDate: deliveredAt.toISOString().slice(0, 10),
  });
  ids.alerts.dismissed = await insert('brazos', dismissed, {
    status: 'dismissed', reviewedBy: admin, reviewedAt: new Date(dismissed.occurredAt.getTime() + 2 * 3_600_000), dismissReason: 'Already covered in this week’s brief',
  });
}

async function seedTrendReport(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const q = Math.floor(clock.now.getUTCMonth() / 3);
  const year = q === 0 ? clock.now.getUTCFullYear() - 1 : clock.now.getUTCFullYear();
  const pq = q === 0 ? 3 : q - 1;
  const periodStart = new Date(Date.UTC(year, pq * 3, 1));
  const periodEnd = new Date(Date.UTC(year, pq * 3 + 3, 1));
  const events = ids.events.filter((e) => e.client === 'loneStar');
  const eventsByType: Record<string, number> = {};
  for (const e of events) eventsByType[e.changeType] = (eventsByType[e.changeType] ?? 0) + 1;
  const recs = await db.select({ status: recommendation.status }).from(recommendation).where(eq(recommendation.clientId, ids.clients.loneStar));
  const data: TrendReportData = {
    quarter: `${year}-Q${pq + 1}`, windowDays: Math.round((periodEnd.getTime() - periodStart.getTime()) / DAY), businesses: await trendBusinesses(ctx, 'loneStar'), eventsByType,
    moves: ids.moves.filter((m) => m.client === 'loneStar').map((m) => ({
      moveType: m.moveType, competitorName: ids.competitors.loneStar.find((c) => c.id === m.competitorId)!.name, status: m.open ? 'active' : 'closed', firstDetectedAt: clock.daysAgo(60).toISOString(),
    })),
    briefsSent: ids.briefs.sentLoneStar.length, alertsDelivered: 1,
    recommendations: { created: recs.length, done: recs.filter((r) => r.status === 'done').length, inProgress: recs.filter((r) => r.status === 'in_progress').length, dismissed: recs.filter((r) => r.status === 'dismissed').length },
  };
  const [r] = await db.insert(trendReport).values({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, quarter: data.quarter, periodStart, periodEnd, data, status: 'sent',
    createdAt: notAfter(new Date(periodEnd.getTime() + DAY), clock.now), sentAt: notAfter(new Date(periodEnd.getTime() + 2 * DAY), clock.now),
  }).returning({ id: trendReport.id });
  ids.reportId = r!.id;
}

/** Spec §4.7. */
export async function seedBriefs(ctx: SeedContext): Promise<void> {
  ctx.ids.briefs.sentLoneStar = await seedSentBriefs(ctx, 'loneStar', 4);
  ctx.ids.briefs.sentBrazos = await seedSentBriefs(ctx, 'brazos', 2);
  await seedReadyBriefs(ctx);
  await seedMoveRecommendations(ctx);
  await seedAlerts(ctx);
  await seedTrendReport(ctx);
}
```

  Append `export * from './briefs';` to `src/index.ts`.

  **Check before running.** The dismissed status needs a 4th recommendation in the cycle. Lone Star's 4 sent briefs give 8 items, so `STATUS_CYCLE` reaches every status twice. Brazos continues its own count from 0, which is fine.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cs/demo exec vitest run src/briefs.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/demo/src/briefs.ts packages/demo/src/briefs.test.ts packages/demo/src/index.ts
git commit -m "feat(demo): briefs, recommendations, alerts and a trend report"
```

---

### Task 10: Agency and platform data

**Files:**
- Create: `packages/demo/src/agency.ts`, `packages/demo/src/platform.ts`, `packages/demo/src/agency.test.ts`
- Modify: `packages/demo/src/index.ts`

**Interfaces:**
- Consumes:
  - `ids.users`, `ids.clients`, `ids.competitors`, `ids.alerts`, `ids.briefs`, `ids.reportId`, `ids.sampleReviewIds`, `ids.pages`, `DEMO_COLLECTOR`, `DEMO_DOMAIN`, `FILLER_BUSINESSES`;
  - `createInvitation` (`@cs/tools`);
  - the `@cs/db` tables `llmCall`, `vendorCall`, `playbookOverride`, `notification`, `notificationPref`, `contact`, `agencyWebhook`, `competitorSuggestion`, `prospectReport`, `themeProposal`, `decisionReview`, `detectedChange` and `capture`.
- Produces:
  - `seedAgency(ctx)`: usage near the cap, a playbook override, in-app notifications (read and unread), notification preferences, quiet hours, one webhook, one pending invitation, competitor suggestions, and the Lone Star pitch snapshot plus the Lakeside prospect report;
  - `seedPlatform(ctx)`: 2 pending and 2 decided theme proposals (deviation 1), and 4 open `decision_review` items on pending web changes;
  - `USAGE_TARGET_USD = { loneStar: 13.1, brazos: 3.25, agency: 1.8 }`.

- [ ] **Step 1: Write the failing test** — `packages/demo/src/agency.test.ts`:

```ts
import { agencyWebhook, invitation, notification, notificationPref, prospectReport, themeProposal } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createPackLoader, listOpenReviews, reviewQuestions } from '@cs/engine';
import { createMemoryStore } from '@cs/storage';
import { listInbox, monthStart, spendByClient } from '@cs/tools';
import { isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAds } from './ads';
import { seedAgency } from './agency';
import { seedBriefs } from './briefs';
import { seedChanges } from './changes';
import { createSeedContext, type SeedContext } from './context';
import { seedPlatform } from './platform';
import { seedReviews } from './reviews';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedChanges(ctx);
  await seedAds(ctx);
  await seedReviews(ctx);
  await seedBriefs(ctx);
  await seedAgency(ctx);
  await seedPlatform(ctx);
});

describe('seedAgency', () => {
  it('puts Lone Star near its monthly cap this month', async () => {
    const spend = await spendByClient(dbs.owner, [ctx.ids.clients.loneStar, ctx.ids.clients.brazos], monthStart(new Date()));
    const ls = spend.get(ctx.ids.clients.loneStar)!;
    expect(ls / 15).toBeGreaterThanOrEqual(0.8);
    expect(ls / 15).toBeLessThan(1);
    expect(spend.get(ctx.ids.clients.brazos)!).toBeGreaterThan(0);
  });

  it('gives the admin read and unread inbox items, and stores preferences', async () => {
    const items = await listInbox(dbs.owner, { userId: ctx.ids.users.admin.userId });
    expect(items.some((i) => i.readAt === null)).toBe(true);
    expect(items.some((i) => i.readAt !== null)).toBe(true);
    expect((await listInbox(dbs.owner, { userId: ctx.ids.users.ownerLoneStar.userId })).length).toBeGreaterThan(0);
    expect((await dbs.owner.select().from(notificationPref)).length).toBeGreaterThanOrEqual(2);
    expect((await dbs.owner.select().from(notification)).every((n) => n.channel === 'in_app' && n.status === 'sent')).toBe(true);
  });

  it('has one pending invitation, one webhook and both prospect reports', async () => {
    expect(await dbs.owner.select().from(invitation).where(isNull(invitation.acceptedAt))).toHaveLength(1);
    expect(await dbs.owner.select().from(agencyWebhook)).toHaveLength(1);
    const reports = await dbs.owner.select().from(prospectReport);
    expect(reports.map((r) => r.status)).toEqual(['ready', 'ready']);
    expect(reports.every((r) => (r.data?.businesses.length ?? 0) > 0)).toBe(true);
  });
});

describe('seedPlatform', () => {
  it('queues one pending theme proposal per vertical and keeps two recent decisions (deviation 1)', async () => {
    const rows = await dbs.owner.select().from(themeProposal);
    expect(rows.filter((r) => r.status === 'proposed').map((r) => r.verticalId).sort()).toEqual(['dental', 'hvac_plumbing']);
    expect(rows.filter((r) => r.status === 'approved' || r.status === 'rejected')).toHaveLength(2);
  });

  it('opens four decision reviews whose questions resolve against the packs', async () => {
    const open = await listOpenReviews(dbs.owner, 50);
    expect(open).toHaveLength(4);
    const packs = createPackLoader();
    for (const r of open) expect((await reviewQuestions({ db: dbs.owner, packs }, r.id)).map((q) => q.key)).toEqual(['meaningful', 'change_type']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/agency.test.ts` (timeout 600000)
Expected: FAIL — `./agency` and `./platform` do not exist.

- [ ] **Step 3: Create `packages/demo/src/agency.ts`:**

```ts
import { agencyWebhook, competitorSuggestion, contact, llmCall, notification, notificationPref, playbookOverride, prospectReport, type ProspectReportData, vendorCall } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { eq } from 'drizzle-orm';
import type { SeedContext } from './context';
import { FILLER_BUSINESSES } from './rankings';
import { CLIENT_SPECS } from './tenancy';
import { DEMO_DOMAIN } from './users';

/** Spec §4.8: Lone Star sits near its $15 cap (warning at 80 %). */
export const USAGE_TARGET_USD = { loneStar: 13.1, brazos: 3.25, agency: 1.8 } as const;

/** A time this month: `hours` before now, but never before the 1st (UTC) — usage is per calendar month. */
const inMonth = (ctx: SeedContext, hours: number) => new Date(Math.max(ctx.clock.monthStart.getTime() + 60_000, ctx.clock.now.getTime() - hours * 3_600_000));

async function seedUsage(ctx: SeedContext): Promise<void> {
  const { db, ids } = ctx;
  const llm = (clientId: string | null, task: string, cost: number, h: number) => ({ agencyId: ids.agencyId, clientId, task, provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6', inputTokens: 4000, outputTokens: 900, costUsd: cost, latencyMs: 2100, ok: true, createdAt: inMonth(ctx, h) });
  const vendor = (clientId: string | null, operation: string, cost: number, h: number) => ({ agencyId: ids.agencyId, clientId, vendor: 'dataforseo', operation, units: 1, costUsd: cost, latencyMs: 900, ok: true, createdAt: inMonth(ctx, h) });
  const ls = ids.clients.loneStar;
  const bz = ids.clients.brazos;
  // Lone Star: 9.40 + 3.70 = 13.10. Brazos: 2.00 + 1.25 = 3.25. Agency-level: 1.80.
  await db.insert(llmCall).values([llm(ls, 'brief_writer', 4.2, 30), llm(ls, 'review_decisions', 2.7, 20), llm(ls, 'tag_decisions', 2.5, 10), llm(bz, 'brief_writer', 2.0, 12), llm(null, 'theme_discovery', 1.8, 5)]);
  await db.insert(vendorCall).values([vendor(ls, 'local_finder', 2.2, 26), vendor(ls, 'reviews', 1.5, 16), vendor(bz, 'local_finder', 1.25, 8)]);
}

async function seedNotifications(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const ls = ids.clients.loneStar;
  const bz = ids.clients.brazos;
  const row = (contactId: string, clientId: string, kind: string, subjectType: string, subjectId: string, title: string, body: string, link: string, hours: number, read: boolean) => {
    const at = clock.daysAgo(hours / 24);
    return {
      agencyId: ids.agencyId, clientId, contactId, channel: 'in_app', kind, subjectType, subjectId, dedupeKey: `demo:${kind}:${subjectId}:${contactId}`, title, body, link,
      status: 'sent', notBefore: at, sentAt: at, readAt: read ? new Date(at.getTime() + 3_600_000) : null, createdAt: at,
    };
  };
  const admin = ids.users.admin.contactId;
  await db.insert(notification).values([
    row(admin, ls, 'am_alert', 'alert', ids.alerts.pending, 'Alert waiting for review', 'An alert for Lone Star Cooling needs your check.', '/agency/alerts', 20, false),
    row(admin, ls, 'brief_ready', 'brief', ids.briefs.readyLoneStar, 'Brief ready for approval', 'Lone Star Cooling’s brief for next Monday is ready.', `/agency/approvals/${ids.briefs.readyLoneStar}`, 6, false),
    row(admin, ls, 'trend_report', 'trend_report', ids.reportId, 'Quarterly trend report sent', 'Lone Star Cooling’s quarterly report went out.', `/c/${ls}/reports/${ids.reportId}`, 24 * 9, true),
    row(ids.users.ownerLoneStar.contactId, ls, 'alert', 'alert', ids.alerts.delivered, 'New competitor alert', 'A competitor changed its prices.', `/c/${ls}/alerts/${ids.alerts.delivered}`, 40, true),
    row(ids.users.ownerLoneStar.contactId, ls, 'brief', 'brief', ids.briefs.sentLoneStar[0]!, 'Your Monday brief', 'This week’s competitor brief is ready.', `/c/${ls}/briefs/${ids.briefs.sentLoneStar[0]!}`, 30, false),
    row(ids.users.ownerBrazos.contactId, bz, 'brief', 'brief', ids.briefs.sentBrazos[0]!, 'Your Monday brief', 'This week’s competitor brief is ready.', `/c/${bz}/briefs/${ids.briefs.sentBrazos[0]!}`, 30, false),
  ]);
  await db.insert(notificationPref).values([
    { contactId: admin, agencyId: ids.agencyId, kind: 'brief_ready', channel: 'email', enabled: false },
    { contactId: ids.users.ownerLoneStar.contactId, agencyId: ids.agencyId, kind: 'alert_digest', channel: 'in_app', enabled: false },
  ]);
  await db.update(contact).set({ quietHours: { start: '21:00', end: '07:00' }, timezone: 'America/Chicago' }).where(eq(contact.id, ids.users.ownerLoneStar.contactId));
}

function prospectData(ctx: SeedContext, keywords: string[], businesses: ProspectReportData['businesses']): ProspectReportData {
  return { generatedAt: ctx.clock.now.toISOString(), keywords, points: 9, scanId: null, businesses, notes: ['Demo data: no vendor calls were made for this snapshot.'] };
}

async function seedProspects(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const rng = ctx.rng('prospects');
  const ranks = (keywords: string[]) => keywords.map((keyword) => ({ keyword, found: rng.int(4, 9), top3: rng.int(0, 5), averageRank: Math.round(rng.between(2, 9) * 10) / 10 }));
  const lakeKw = CLIENT_SPECS.lakeside.keywords;
  await db.insert(prospectReport).values({
    agencyId: ids.agencyId, clientId: ids.clients.lakeside, status: 'ready', createdAt: clock.daysAgo(2), finishedAt: clock.daysAgo(2),
    data: prospectData(ctx, lakeKw, ids.competitors.lakeside.map((c, i) => ({
      competitorId: c.id, name: c.name, self: false, gbp: { rating: [4.6, 4.3][i] ?? 4.5, reviews: [210, 95][i] ?? 50, category: 'Dentist', extraCategories: 1 }, ads: { google: i, meta: null }, ranks: ranks(lakeKw),
    }))),
  });
  // The pitch snapshot Lone Star was converted from (5c-1 "pitch snapshot after conversion").
  const lsKw = CLIENT_SPECS.loneStar.keywords;
  await db.insert(prospectReport).values({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, status: 'ready', createdAt: clock.daysAgo(395), finishedAt: clock.daysAgo(395),
    data: prospectData(ctx, lsKw, [
      { competitorId: ids.selfLoneStar, name: 'Lone Star Cooling', self: true, gbp: { rating: 4.6, reviews: 88, category: 'HVAC contractor', extraCategories: 2 }, ads: { google: null, meta: null }, ranks: ranks(lsKw) },
      ...ids.competitors.loneStar.slice(0, 3).map((c) => ({ competitorId: c.id, name: c.name, self: false, gbp: { rating: 4.3, reviews: 120, category: 'HVAC contractor', extraCategories: 1 }, ads: { google: 2, meta: 1 }, ranks: ranks(lsKw) })),
    ]),
  });
}

/** Spec §4.1 team extras, §4.8 usage and playbooks, and the inbox and preferences. */
export async function seedAgency(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  await seedUsage(ctx);
  await db.insert(playbookOverride).values({
    agencyId: ids.agencyId, verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: 'Answer a price cut with a comfort bundle',
    template: '{{competitor}} cut {{service}} to {{new_price}}. Keep your price and bundle {{service}} with a free filter and priority scheduling for Hood County members.',
    updatedBy: ids.users.admin.userId, updatedAt: clock.daysAgo(14),
  });
  await seedNotifications(ctx);
  await db.insert(agencyWebhook).values({
    agencyId: ids.agencyId, kind: 'slack', url: 'https://hooks.slack.com/services/TDEMO0000/BDEMO0000/demo-not-a-real-hook', kinds: ['am_alert', 'brief_ready'],
    active: true, createdBy: ids.users.admin.userId, createdAt: clock.daysAgo(200),
  });
  await createInvitation(db, { agencyId: ids.agencyId, email: `newhire@${DEMO_DOMAIN}`, role: 'account_manager', invitedBy: ids.users.admin.userId }, clock.daysAgo(2));
  await db.insert(competitorSuggestion).values(FILLER_BUSINESSES.slice(0, 2).map((name, i) => ({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, name, domain: null, placeId: `demo-filler-${i}`, cid: null, rating: [4.5, 4.1][i]!, votes: [88, 41][i]!,
    appearances: [5, 3][i]!, bestRank: [4, 7][i]!, overlapScore: [0.62, 0.41][i]!, status: 'suggested', createdAt: clock.daysAgo(6),
  })));
  await seedProspects(ctx);
}
```

- [ ] **Step 4: Create `packages/demo/src/platform.ts`:**

```ts
import { capture, decisionReview, detectedChange, themeProposal } from '@cs/db';
import { DAY } from './clock';
import type { SeedContext } from './context';
import { DEMO_COLLECTOR } from './tenancy';

/** Deviation 1: one pending proposal per vertical (theme_proposal_pending_unique), plus two recent decisions. */
async function seedThemeProposals(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const samples = ids.sampleReviewIds;
  await db.insert(themeProposal).values([
    { verticalId: 'hvac_plumbing', themeId: 'warranty_handling', name: 'Warranty handling', description: 'How the company honours parts and labour warranties', status: 'proposed', otherCount: 14, sampleReviewIds: samples, createdAt: clock.daysAgo(3) },
    { verticalId: 'dental', themeId: 'parking_access', name: 'Parking & access', description: 'Parking, step-free access and finding the office', status: 'proposed', otherCount: 9, sampleReviewIds: [], createdAt: clock.daysAgo(4) },
    { verticalId: 'hvac_plumbing', themeId: 'financing_clarity', name: 'Financing clarity', description: 'Clear terms on financing offers', status: 'approved', otherCount: 11, sampleReviewIds: [], createdAt: clock.daysAgo(9), decidedAt: clock.daysAgo(5), decidedBy: ids.users.operator.userId },
    { verticalId: 'hvac_plumbing', themeId: 'noise_level', name: 'Noise level', description: 'Noise of new equipment after install', status: 'rejected', otherCount: 6, sampleReviewIds: [], createdAt: clock.daysAgo(15), decidedAt: clock.daysAgo(12), decidedBy: ids.users.operator.userId },
  ]);
}

const PENDING_CHANGES = [
  { before: 'Now hiring: none', after: 'Now hiring HVAC technicians, $2,000 sign-on bonus', type: 'hiring' },
  { before: 'Spring maintenance from $99', after: 'Spring maintenance from $99. Members save 15%.', type: 'promo' },
  { before: 'Serving Granbury and Acton', after: 'Serving Granbury, Acton and Stephenville', type: 'service_area_change' },
  { before: 'Our team', after: 'Meet our new service manager', type: 'content' },
] as const;

/** Spec §4.8: 4 low-confidence web changes waiting for an operator (5b-2 platform queue). */
async function seedDecisionReviews(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  for (const [i, p] of PENDING_CHANGES.entries()) {
    const comp = ids.competitors.loneStar[i]!;
    const pageId = ids.pages[comp.id]!.home;
    const at = clock.daysAgo(i + 1.5);
    const base = { competitorId: comp.id, trackedPageId: pageId, source: 'web', url: `https://${comp.domain}/`, status: 'ok', httpStatus: 200, collectorVersion: DEMO_COLLECTOR };
    const [before, after] = await db.insert(capture).values([{ ...base, capturedAt: new Date(at.getTime() - DAY) }, { ...base, capturedAt: at }]).returning({ id: capture.id });
    const [ch] = await db.insert(detectedChange).values({
      competitorId: comp.id, trackedPageId: pageId, source: 'web', kind: 'modified', beforeCaptureId: before!.id, afterCaptureId: after!.id, blockKey: `demo-review-${i}`,
      beforeText: p.before, afterText: p.after, similarity: 0.71, status: 'pending', stageVersion: 1, detectedAt: at,
    }).returning({ id: detectedChange.id });
    await db.insert(decisionReview).values({
      subjectType: 'detected_change', subjectId: ch!.id, keys: ['meaningful', 'change_type'],
      answers: { meaningful: { value: true, confidence: 0.58 }, change_type: { value: p.type, confidence: 0.51 } }, createdAt: at,
    });
  }
}

/** Spec §4.8 platform queues. */
export async function seedPlatform(ctx: SeedContext): Promise<void> {
  await seedThemeProposals(ctx);
  await seedDecisionReviews(ctx);
}
```

  Append `export * from './agency';` and `export * from './platform';` to `src/index.ts`.

  The `createPackLoader` and `listOpenReviews` in the test come from `@cs/engine` (a devDependency since Task 3).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cs/demo exec vitest run src/agency.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/demo/src/agency.ts packages/demo/src/platform.ts packages/demo/src/agency.test.ts packages/demo/src/index.ts
git commit -m "feat(demo): usage, inbox, team extras, prospects and platform queues"
```

---

### Task 11: `seedDemo`, the screen-coverage list and the coverage test

**Files:**
- Create: `packages/demo/src/seed.ts`, `packages/demo/src/coverage.ts`, `packages/demo/src/coverage.test.ts`, `packages/demo/src/cli/coverage-readme.ts`, `packages/demo/README.md`
- Modify: `packages/demo/src/index.ts`, `packages/demo/package.json` (script `coverage:readme`)

**Interfaces:**
- Consumes:
  - every `seed*` function from Tasks 3–10;
  - `assertDatabase`, `createDb` (`@cs/db`);
  - for the test: `createToolRegistry`, `listMemberships`, `accessContextFor`, `getAgencyBranding`, `listTeam`, `listWebhooks`, `listInbox`, `myNotificationSettings` (`@cs/tools`), and `ToolError` (`@cs/core`).
- Produces:
  - `interface SeedDemoOptions { ownerUrl: string; expected: string; store: ObjectStore; salt: string; now?: Date; log?: (line: string) => void }`;
  - `seedDemo(o): Promise<DemoIds>`. It refuses a URL or `current_database()` that is not exactly `expected`, and a database that already has an agency;
  - `type CoverageExpect = 'data' | 'empty' | 'not_found'`, `interface CoverageCall { tool; input(ids); path?; expect?; why? }`, `interface ScreenCoverage { route; as: DemoUserKey; calls }`;
  - `SCREENS`, `NO_DATA_ROUTES`, `valueAt(out, path?)`, `isNonEmpty(v)`, `renderCoverageTable()`, `README_MARKERS`.

- [ ] **Step 1: Create `packages/demo/src/seed.ts`:**

```ts
import { assertDatabase, createDb } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { sql } from 'drizzle-orm';
import { seedAds } from './ads';
import { seedAgency } from './agency';
import { seedBriefs } from './briefs';
import { seedChanges } from './changes';
import { createSeedContext, type SeedContext } from './context';
import type { DemoIds } from './ids';
import { seedPlatform } from './platform';
import { seedPricing } from './pricing';
import { seedRankings } from './rankings';
import { seedReviews } from './reviews';
import { seedTenancy } from './tenancy';

export interface SeedDemoOptions {
  /** Owner URL of the database to seed. */
  ownerUrl: string;
  /** Spec §8: `demo:reset` passes 'cs_demo'; the coverage test passes the cs_test name. */
  expected: string;
  store: ObjectStore;
  salt: string;
  now?: Date;
  log?: (line: string) => void;
}

/** In dependency order: later areas read ids the earlier ones wrote (briefs read events, moves, reviews and ads). */
const STEPS: readonly [string, (ctx: SeedContext) => Promise<void>][] = [
  ['tenancy and people', seedTenancy],
  ['changes, evidence and moves', seedChanges],
  ['pricing', seedPricing],
  ['ads', seedAds],
  ['reviews', seedReviews],
  ['rankings', seedRankings],
  ['briefs, alerts and reports', seedBriefs],
  ['agency', seedAgency],
  ['platform queues', seedPlatform],
];

/** Spec §4: fills an empty, migrated database with the fictional demo set. */
export async function seedDemo(o: SeedDemoOptions): Promise<DemoIds> {
  assertDatabase(o.ownerUrl, o.expected);
  const log = o.log ?? (() => {});
  const { db, close } = createDb(o.ownerUrl);
  try {
    const [row] = [...(await db.execute<{ name: string; agencies: number }>(sql`select current_database() as name, (select count(*)::int from agency) as agencies`))];
    if (row?.name !== o.expected) throw new Error(`Refusing to seed database "${row?.name}": expected exactly "${o.expected}"`);
    if (Number(row.agencies) > 0) throw new Error(`Refusing to seed ${o.expected}: it already has data (wipe it first)`);
    const ctx = createSeedContext({ db, store: o.store, now: o.now ?? new Date(), salt: o.salt, log });
    for (const [label, step] of STEPS) {
      log(`[seed] ${label}…`);
      await step(ctx);
    }
    log(`[seed] done: ${ctx.ids.events.length} events, ${ctx.ids.moves.length} moves`);
    return ctx.ids;
  } finally {
    await close();
  }
}
```

- [ ] **Step 2: Create `packages/demo/src/coverage.ts`:**

```ts
import type { DemoIds } from './ids';
import type { DemoUserKey } from './users';

export type CoverageExpect = 'data' | 'empty' | 'not_found';

export interface CoverageCall {
  /** A registered tool name, or `fn:<name>` for a page that reads through a direct @cs/tools function. */
  tool: string;
  input: (ids: DemoIds) => Record<string, unknown>;
  /** Dot path to the part of the output that must be non-empty. Default: the whole output. */
  path?: string;
  /** Default 'data'. 'empty' and 'not_found' are empty states left on purpose. */
  expect?: CoverageExpect;
  /** Why an empty state is expected (shown in the README table). */
  why?: string;
}

export interface ScreenCoverage {
  /** The app route, as its folder path under `apps/web/src/app/(app)`. A suffix in parentheses marks a second entry for the same route. */
  route: string;
  as: DemoUserKey;
  calls: CoverageCall[];
}

const ls = (ids: DemoIds) => ids.clients.loneStar;
const bz = (ids: DemoIds) => ids.clients.brazos;
const none = () => ({});

/** Pages that show forms only (no seeded data to check). */
export const NO_DATA_ROUTES = ['/agency/clients/new', '/agency/prospects/new'] as const;

/** Spec §4.9: every screen route, the tool calls it makes, and the empty states left on purpose. */
export const SCREENS: readonly ScreenCoverage[] = [
  { route: '/agency', as: 'admin', calls: [{ tool: 'get_portfolio', input: none, path: 'items' }] },
  { route: '/agency/alerts', as: 'admin', calls: [{ tool: 'list_alert_queue', input: none, path: 'items' }] },
  { route: '/agency/approvals', as: 'admin', calls: [{ tool: 'list_brief_queue', input: none, path: 'items' }] },
  { route: '/agency/approvals/[briefId]', as: 'admin', calls: [{ tool: 'get_brief_review', input: (ids) => ({ briefId: ids.briefs.readyLoneStar }), path: 'items' }] },
  { route: '/agency/approvals/[briefId] (quiet)', as: 'admin', calls: [{ tool: 'get_brief_review', input: (ids) => ({ briefId: ids.briefs.quietBrazos }), path: 'items', expect: 'empty', why: 'Brazos’s brief is held as quiet' }] },
  { route: '/agency/branding', as: 'admin', calls: [{ tool: 'fn:getAgencyBranding', input: none, path: 'stored' }] },
  { route: '/agency/playbooks', as: 'admin', calls: [{ tool: 'list_playbooks', input: none, path: 'verticals' }] },
  { route: '/agency/prospects', as: 'admin', calls: [{ tool: 'list_prospects', input: none, path: 'items' }] },
  {
    route: '/agency/prospects/[clientId]', as: 'admin', calls: [
      { tool: 'get_client_profile', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'keywords' },
      { tool: 'get_prospect_report', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'report.data.businesses' },
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'items' },
    ],
  },
  { route: '/agency/team', as: 'admin', calls: [{ tool: 'fn:listTeam', input: none, path: 'members' }, { tool: 'fn:listTeam', input: none, path: 'invitations' }, { tool: 'list_clients', input: none, path: 'items' }] },
  { route: '/agency/usage', as: 'admin', calls: [{ tool: 'get_usage', input: none, path: 'items' }] },
  { route: '/agency/webhooks', as: 'admin', calls: [{ tool: 'fn:listWebhooks', input: none }] },
  {
    route: '/c/[clientId]', as: 'admin', calls: [
      { tool: 'get_workspace_overview', input: (ids) => ({ clientId: ls(ids) }), path: 'pressure' },
      { tool: 'get_ad_activity', input: (ids) => ({ clientId: ls(ids) }), path: 'series' },
      { tool: 'list_alerts', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_briefs', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_moves', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_recommendations', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_trend_reports', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
    ],
  },
  { route: '/c/[clientId] (client owner)', as: 'ownerLoneStar', calls: [{ tool: 'get_workspace_overview', input: (ids) => ({ clientId: ls(ids) }), path: 'pressure' }, { tool: 'list_briefs', input: (ids) => ({ clientId: ls(ids) }), path: 'items' }] },
  {
    route: '/c/[clientId]/ads', as: 'admin', calls: [
      { tool: 'list_ads', input: (ids) => ({ clientId: ls(ids), status: 'all' }), path: 'items' },
      { tool: 'list_ads', input: (ids) => ({ clientId: ls(ids), competitorId: ids.noData.ads, status: 'all' }), path: 'items', expect: 'empty', why: 'one competitor runs no ads' },
    ],
  },
  { route: '/c/[clientId]/alerts/[alertId]', as: 'admin', calls: [{ tool: 'get_alert', input: (ids) => ({ alertId: ids.alerts.delivered }), path: 'body' }] },
  { route: '/c/[clientId]/briefs/[briefId]', as: 'ownerLoneStar', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.sentLoneStar[0] }), path: 'items' }] },
  {
    route: '/c/[clientId]/changes', as: 'admin', calls: [
      { tool: 'search_events', input: (ids) => ({ clientId: ls(ids), route: 'all', days: 90 }), path: 'items' },
      { tool: 'get_event', input: (ids) => ({ clientId: ls(ids), eventId: ids.events[0]!.id }), path: 'changes' },
      { tool: 'compare_snapshots', input: (ids) => ({ clientId: ls(ids), changeId: ids.events[0]!.changeId }), path: 'after' },
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
    ],
  },
  {
    route: '/c/[clientId]/competitors', as: 'admin', calls: [
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_competitor_suggestions', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
    ],
  },
  {
    route: '/c/[clientId]/competitors/[competitorId]', as: 'admin', calls: [
      { tool: 'get_competitor_profile', input: (ids) => ({ clientId: ls(ids), competitorId: ids.competitors.loneStar[0]!.id }), path: 'gbp' },
      { tool: 'get_competitor_timeline', input: (ids) => ({ clientId: ls(ids), competitorId: ids.competitors.loneStar[0]!.id }), path: 'items' },
      { tool: 'list_tracked_pages', input: (ids) => ({ clientId: ls(ids), competitorId: ids.competitors.loneStar[0]!.id }), path: 'items' },
    ],
  },
  { route: '/c/[clientId]/evidence/[evidenceId]', as: 'admin', calls: [{ tool: 'get_evidence', input: (ids) => ({ clientId: ls(ids), evidenceId: ids.events[0]!.evidenceIds[0] }), path: 'citedBy' }] },
  {
    route: '/c/[clientId]/moves', as: 'admin', calls: [
      { tool: 'list_moves', input: (ids) => ({ clientId: ls(ids), status: 'all' }), path: 'items' },
      { tool: 'get_move', input: (ids) => ({ clientId: ls(ids), moveId: ids.moves[0]!.id }), path: 'events' },
    ],
  },
  { route: '/c/[clientId]/pitch-snapshot', as: 'admin', calls: [{ tool: 'get_prospect_report', input: (ids) => ({ clientId: ls(ids) }), path: 'report.data.businesses' }] },
  {
    route: '/c/[clientId]/pricing', as: 'admin', calls: [
      { tool: 'get_price_matrix', input: (ids) => ({ clientId: ls(ids) }), path: 'rows' },
      { tool: 'get_price_history', input: (ids) => ({ clientId: ls(ids), serviceId: 'ac_tune_up', days: 365 }), path: 'series' },
      { tool: 'get_price_history', input: (ids) => ({ clientId: ls(ids), serviceId: 'ac_tune_up', competitorId: ids.noData.pricing, days: 365 }), path: 'series', expect: 'empty', why: 'one competitor shows no prices' },
    ],
  },
  {
    route: '/c/[clientId]/rankings', as: 'admin', calls: [
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids) }), path: 'cells' },
      { tool: 'get_share_of_voice', input: (ids) => ({ clientId: ls(ids) }), path: 'series' },
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids), business: ids.noData.rankings }), path: 'top3', expect: 'empty', why: 'one competitor never ranks' },
    ],
  },
  { route: '/c/[clientId]/rankings (Brazos)', as: 'admin', calls: [{ tool: 'get_geogrid', input: (ids) => ({ clientId: bz(ids) }), path: 'cells' }] },
  { route: '/c/[clientId]/recommendations', as: 'admin', calls: [{ tool: 'list_recommendations', input: (ids) => ({ clientId: ls(ids) }), path: 'items' }] },
  { route: '/c/[clientId]/reports/[reportId]', as: 'admin', calls: [{ tool: 'get_trend_report', input: (ids) => ({ reportId: ids.reportId }), path: 'data' }] },
  {
    route: '/c/[clientId]/reviews', as: 'admin', calls: [
      { tool: 'get_theme_benchmark', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses' },
      { tool: 'get_rating_trend', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses' },
      { tool: 'search_reviews', input: (ids) => ({ clientId: ls(ids), text: 'showed up two hours late', days: 365 }), path: 'items' },
    ],
  },
  {
    route: '/c/[clientId]/reviews (Brazos)', as: 'admin', calls: [
      { tool: 'get_rating_trend', input: (ids) => ({ clientId: bz(ids) }), path: 'businesses' },
      { tool: 'search_reviews', input: (ids) => ({ clientId: bz(ids), business: 'self' }), expect: 'not_found', why: 'Brazos has no own business ("add your place id")' },
      { tool: 'search_reviews', input: (ids) => ({ clientId: bz(ids), business: ids.noData.reviews, days: 365 }), path: 'items', expect: 'empty', why: 'one competitor has no reviews' },
    ],
  },
  { route: '/c/[clientId]/settings/ai', as: 'admin', calls: [{ tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'name' }] },
  { route: '/c/[clientId]/settings/alerts', as: 'admin', calls: [{ tool: 'get_alert_rules', input: (ids) => ({ clientId: ls(ids) }), path: 'custom' }] },
  { route: '/c/[clientId]/settings/delivery', as: 'admin', calls: [{ tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'serviceArea' }] },
  { route: '/c/[clientId]/settings/profile', as: 'admin', calls: [{ tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'keywords' }] },
  { route: '/inbox', as: 'admin', calls: [{ tool: 'fn:listInbox', input: none }] },
  { route: '/inbox (client owner)', as: 'ownerLoneStar', calls: [{ tool: 'fn:listInbox', input: none }] },
  { route: '/platform/reviews', as: 'operator', calls: [{ tool: 'list_decision_reviews', input: none, path: 'items' }] },
  { route: '/platform/themes', as: 'operator', calls: [{ tool: 'list_theme_proposals', input: none, path: 'pending' }, { tool: 'list_theme_proposals', input: none, path: 'decided' }] },
  { route: '/settings/notifications', as: 'admin', calls: [{ tool: 'fn:myNotificationSettings', input: none }] },
];

export function valueAt(out: unknown, path?: string): unknown {
  if (!path) return out;
  return path.split('.').reduce<unknown>((v, k) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), out);
}

/** "Has data": not null/undefined/false/0/'' and, for arrays and objects, at least one value that has data. */
export function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.some(isNonEmpty);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(isNonEmpty);
  return true;
}

/** The route of a coverage entry without its "(…)" suffix. */
export const baseRoute = (route: string): string => route.replace(/\s*\(.*\)$/, '');

export const README_MARKERS = { start: '<!-- coverage:start -->', end: '<!-- coverage:end -->' } as const;

/** Spec §4.9: the coverage table in the package README. */
export function renderCoverageTable(): string {
  const rows = SCREENS.map((s) => {
    const tools = [...new Set(s.calls.filter((c) => (c.expect ?? 'data') === 'data').map((c) => `\`${c.tool}\``))].join(', ');
    const empty = s.calls.filter((c) => c.expect && c.expect !== 'data').map((c) => `\`${c.tool}\`: ${c.why ?? c.expect}`).join('; ') || '—';
    return `| \`${s.route}\` | ${s.as} | ${tools || '—'} | ${empty} |`;
  });
  return ['| Screen | Signed in as | Tools that must return data | Empty on purpose |', '|---|---|---|---|', ...rows].join('\n');
}
```

- [ ] **Step 3: Write the failing coverage test** — `packages/demo/src/coverage.test.ts`:

```ts
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AccessContext, ToolError } from '@cs/core';
import { databaseNameOf } from '@cs/db';
import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { createFsStore } from '@cs/storage';
import { accessContextFor, createToolRegistry, getAgencyBranding, listInbox, listMemberships, listTeam, listWebhooks, myNotificationSettings } from '@cs/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseRoute, isNonEmpty, NO_DATA_ROUTES, README_MARKERS, renderCoverageTable, SCREENS, valueAt } from './coverage';
import type { DemoIds } from './ids';
import { seedDemo } from './seed';
import { resetDemoTables, TEST_SALT } from './test-support';
import { DEMO_OPERATOR_EMAIL, type DemoUserKey } from './users';

const dbs = openTestDbs();
const evidenceDir = mkdtempSync(join(tmpdir(), 'demo-evidence-'));
afterAll(async () => {
  await dbs.closeAll();
  rmSync(evidenceDir, { recursive: true, force: true });
});

const registry = createToolRegistry(
  { app: dbs.app, service: dbs.service, platformAdmins: [DEMO_OPERATOR_EMAIL], jobStatus: async () => null },
  { audit: { record: async () => {} } },
);
let ids: DemoIds;
const contexts = new Map<DemoUserKey, AccessContext>();

type Fn = (ctx: AccessContext, userId: string) => Promise<unknown>;
const FUNCTIONS: Record<string, Fn> = {
  'fn:getAgencyBranding': (ctx) => getAgencyBranding(dbs.service, ctx),
  'fn:listTeam': (ctx) => listTeam(dbs.service, ctx),
  'fn:listWebhooks': (ctx) => listWebhooks(dbs.service, ctx),
  'fn:listInbox': (_ctx, userId) => listInbox(dbs.service, { userId }),
  'fn:myNotificationSettings': (_ctx, userId) => myNotificationSettings(dbs.service, userId),
};

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  // Spec §8: the seed takes its expected database name; here it is the cs_test name.
  ids = await seedDemo({ ownerUrl: testUrls.owner, expected: databaseNameOf(testUrls.owner), store: createFsStore(evidenceDir), salt: process.env.REVIEWER_HASH_SALT ?? TEST_SALT });
  for (const [key, u] of Object.entries(ids.users) as [DemoUserKey, DemoIds['users'][DemoUserKey]][]) {
    const [m] = await listMemberships(dbs.service, u.userId);
    contexts.set(key, await accessContextFor(dbs.service, u.userId, m!));
  }
});

describe('demo seed coverage (spec §4.9, §8)', () => {
  for (const screen of SCREENS) {
    it(`${screen.route} as ${screen.as}`, async () => {
      const ctx = contexts.get(screen.as)!;
      const userId = ids.users[screen.as].userId;
      for (const call of screen.calls) {
        const run = () => (call.tool.startsWith('fn:') ? FUNCTIONS[call.tool]!(ctx, userId) : registry.invoke(ctx, call.tool, call.input(ids)));
        const expectWhat = call.expect ?? 'data';
        const label = `${call.tool} ${call.path ?? ''}`.trim();
        if (expectWhat === 'not_found') {
          await expect(run(), label).rejects.toSatisfy((e: unknown) => e instanceof ToolError && e.code === 'not_found');
          continue;
        }
        const value = valueAt(await run(), call.path);
        expect(isNonEmpty(value), `${label} should ${expectWhat === 'data' ? 'return data' : 'be empty'}`).toBe(expectWhat === 'data');
      }
    });
  }

  it('lists every app screen (a new screen needs a coverage entry and seed data)', () => {
    const appDir = fileURLToPath(new URL('../../../apps/web/src/app/(app)', import.meta.url));
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === 'page.tsx') routes.push(`/${relative(appDir, dir).split(sep).join('/')}`.replace(/\/$/, '') || '/');
      }
    };
    walk(appDir);
    const covered = new Set([...SCREENS.map((s) => baseRoute(s.route)), ...NO_DATA_ROUTES]);
    expect(routes.filter((r) => !covered.has(r)).sort()).toEqual([]);
  });

  it('keeps the README coverage table in sync with coverage.ts', () => {
    const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
    const between = readme.slice(readme.indexOf(README_MARKERS.start) + README_MARKERS.start.length, readme.indexOf(README_MARKERS.end)).trim();
    expect(between).toBe(renderCoverageTable());
  });
});

describe('isNonEmpty', () => {
  it('treats nulls, zeros and all-null grids as empty', () => {
    expect([null, 0, '', [], [[null, null]], { a: null }, false].map(isNonEmpty)).toEqual([false, false, false, false, false, false, false]);
    expect([[[null, 21]], { a: [1] }, 'x', true, 3].map(isNonEmpty)).toEqual([true, true, true, true, true]);
  });
});
```

  The route walker turns `apps/web/src/app/(app)/agency/page.tsx` into `/agency`, and `(app)/c/[clientId]/page.tsx` into `/c/[clientId]`. `(app)/page.tsx` does not exist; the root `app/page.tsx` lives outside `(app)` and is not walked.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/coverage.test.ts` (timeout 600000)
Expected: FAIL. The README does not exist yet. Any screen whose tool returns no data also fails, and its message names the tool and path. Seeding takes several minutes on Neon.

- [ ] **Step 5: Create the README and the table generator.**

`packages/demo/src/cli/coverage-readme.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { README_MARKERS, renderCoverageTable } from '../coverage';

const file = fileURLToPath(new URL('../../README.md', import.meta.url));
const text = await readFile(file, 'utf8');
const start = text.indexOf(README_MARKERS.start);
const end = text.indexOf(README_MARKERS.end);
if (start < 0 || end < start) throw new Error('README coverage markers not found');
await writeFile(file, `${text.slice(0, start + README_MARKERS.start.length)}\n${renderCoverageTable()}\n${text.slice(end)}`, 'utf8');
console.log('README coverage table updated');
```

Add to `packages/demo/package.json` `scripts`: `"coverage:readme": "tsx src/cli/coverage-readme.ts"`.

`packages/demo/README.md` (the table is filled by the script in Step 6):

```markdown
# @cs/demo

Fictional demo data for Rival Monday (spec: `docs/superpowers/specs/2026-10-09-demo-data-and-snapshots-design.md`).

- `pnpm demo:reset` creates `cs_demo` if it is missing, then wipes, migrates and seeds it, writes the evidence files to `apps/worker/.evidence-demo` and prints sign-in links.
- `pnpm demo:links` prints fresh sign-in links. They open `/dev-panel/sign-in/<token>` and work only while the app runs with the dev panel on (`pnpm dev` or `pnpm demo:dev`).
- `pnpm db:snapshot` and `pnpm db:restore <folder> [--into <db>]` back up and restore `cs_dev` and its evidence (see the root README).

Everything is fictional: businesses use `.example` domains, people use `@demo.rivalmonday.test`, and no vendor, AI model or email service is ever called. Timestamps are relative to the moment of seeding, and one fixed random seed makes every reset produce the same data.

## Adding a screen

A later phase that adds a screen adds its seed data (a new `src/<area>.ts`, called from `src/seed.ts`) and an entry in `src/coverage.ts`. `src/coverage.test.ts` fails when an app screen has no entry, or when a listed tool returns nothing. Then run `pnpm --filter @cs/demo coverage:readme` to refresh the table below.

## Screen coverage

<!-- coverage:start -->
<!-- coverage:end -->
```

- [ ] **Step 6: Fill the table, export, and re-run**

Run: `pnpm --filter @cs/demo coverage:readme`
Then append `export * from './coverage';` and `export * from './seed';` to `src/index.ts`.
Run: `pnpm --filter @cs/demo exec vitest run src/coverage.test.ts` (timeout 600000)
Expected: PASS.

If a screen fails, the message names the tool and path. Fix the **seed area** that owns that data (Tasks 4–10), not the coverage entry, unless the entry's input is wrong for the tool's schema (`packages/tools/src/tools/<file>.ts`). Re-run the area's own test, then this one.

Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/demo/src/seed.ts packages/demo/src/coverage.ts packages/demo/src/coverage.test.ts packages/demo/src/cli/coverage-readme.ts packages/demo/README.md packages/demo/src/index.ts packages/demo/package.json
git commit -m "feat(demo): seedDemo, screen coverage list and the coverage test"
```

---

### Task 12: `demo:reset`, `demo:links` and the scripts

**Files:**
- Create: `packages/demo/src/reset.ts`, `packages/demo/src/reset.test.ts`, `packages/demo/src/cli/reset.ts`, `packages/demo/src/cli/links.ts`, `packages/demo/src/cli/repo.ts`
- Modify: `packages/demo/package.json` (scripts), root `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: `resolveEnvironment`, `assertDatabase`, `DEMO_DATABASE`, `databaseNameOf`, `ensureDatabase`, `resetDatabase`, `createDb` (`@cs/db`); `seedDemo` (Task 11); `demoSignInLinks` (Task 3); `requireSalt` (`@cs/collectors`); `createFsStore` (`@cs/storage`).
- Produces:
  - `clearDemoEvidence(dir: string): Promise<void>` refuses unless the basename is exactly `.evidence-demo`;
  - `runDemoReset(o: { repoRoot: string; env?: NodeJS.ProcessEnv; now?: Date; log?: (l: string) => void }): Promise<DemoLink[]>`;
  - `printDemoLinks(links: DemoLink[], log)`;
  - `repoRoot()` and `loadRepoEnv()` (`cli/repo.ts`);
  - root scripts `demo:reset` and `demo:links`.

- [ ] **Step 1: Write the failing test** — `packages/demo/src/reset.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDemoEvidence, runDemoReset } from './reset';

const ENV = {
  DATABASE_URL: 'postgresql://owner:pw@h.example/cs_dev',
  APP_DATABASE_URL: 'postgresql://app_user:pw@h.example/cs_dev',
  SERVICE_DATABASE_URL: 'postgresql://app_service:pw@h.example/cs_dev',
  REVIEWER_HASH_SALT: 's'.repeat(40),
  LINK_SIGNING_SECRET: 'l'.repeat(40),
} as unknown as NodeJS.ProcessEnv;

describe('runDemoReset (Review Focus 1)', () => {
  it('refuses before connecting when DATABASE_URL does not name cs_dev', async () => {
    await expect(runDemoReset({ repoRoot: '/repo', env: { ...ENV, DATABASE_URL: 'postgresql://owner:pw@h.example/cs_live' } })).rejects.toThrow(/DATABASE_URL must name cs_dev/);
  });

  it('refuses without a reviewer salt or a link secret', async () => {
    await expect(runDemoReset({ repoRoot: '/repo', env: { ...ENV, REVIEWER_HASH_SALT: '' } })).rejects.toThrow(/REVIEWER_HASH_SALT/);
    await expect(runDemoReset({ repoRoot: '/repo', env: { ...ENV, LINK_SIGNING_SECRET: 'short' } })).rejects.toThrow(/LINK_SIGNING_SECRET/);
  });
});

describe('clearDemoEvidence', () => {
  it('only ever empties a directory named .evidence-demo', async () => {
    const root = mkdtempSync(join(tmpdir(), 'demo-ev-'));
    try {
      await expect(clearDemoEvidence(join(root, '.evidence'))).rejects.toThrow(/\.evidence-demo/);
      await expect(clearDemoEvidence(join(root, '.evidence-demo'))).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/demo exec vitest run src/reset.test.ts` (timeout 600000)
Expected: FAIL — `./reset` does not exist.

- [ ] **Step 3: Create `packages/demo/src/reset.ts`:**

```ts
import { mkdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { requireSalt } from '@cs/collectors';
import { assertDatabase, createDb, DEMO_DATABASE, ensureDatabase, resetDatabase, resolveEnvironment } from '@cs/db';
import { createFsStore } from '@cs/storage';
import { type DemoLink, demoSignInLinks } from './links';
import { seedDemo } from './seed';

/** The DEMO evidence directory is the only one a reset may empty. */
export async function clearDemoEvidence(dir: string): Promise<void> {
  if (basename(dir) !== '.evidence-demo') throw new Error(`Refusing to clear "${dir}": only a directory named .evidence-demo`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

const roleOf = (url: string) => decodeURIComponent(new URL(url).username);

/** Spec §7 `demo:reset`: create cs_demo if missing, wipe, migrate, seed, write evidence, return sign-in links. */
export async function runDemoReset(o: { repoRoot: string; env?: NodeJS.ProcessEnv; now?: Date; log?: (line: string) => void }): Promise<DemoLink[]> {
  const env = o.env ?? process.env;
  const log = o.log ?? console.log;
  const demo = resolveEnvironment('demo', { repoRoot: o.repoRoot, env });
  const dev = resolveEnvironment('dev', { repoRoot: o.repoRoot, env });
  for (const url of [demo.ownerUrl, demo.appUrl, demo.serviceUrl]) assertDatabase(url, DEMO_DATABASE);
  const salt = requireSalt(env);
  const secret = env.LINK_SIGNING_SECRET ?? '';
  if (secret.length < 32) throw new Error('LINK_SIGNING_SECRET must be set (at least 32 characters) to sign demo links');

  log(`[reset] checking that ${DEMO_DATABASE} exists…`);
  const made = await ensureDatabase(dev.ownerUrl, DEMO_DATABASE, [roleOf(demo.appUrl), roleOf(demo.serviceUrl)]);
  log(made === 'created' ? `[reset] created ${DEMO_DATABASE}` : `[reset] ${DEMO_DATABASE} exists`);
  log(`[reset] wiping and migrating ${DEMO_DATABASE}…`);
  await resetDatabase(demo.ownerUrl, DEMO_DATABASE);
  log('[reset] clearing the DEMO evidence directory…');
  await clearDemoEvidence(demo.evidenceDir);
  await seedDemo({ ownerUrl: demo.ownerUrl, expected: DEMO_DATABASE, store: createFsStore(demo.evidenceDir), salt, now: o.now, log });

  const { db, close } = createDb(demo.serviceUrl);
  try {
    return await demoSignInLinks(db, { secret, baseUrl: env.APP_URL?.trim() || 'http://localhost:3000' });
  } finally {
    await close();
  }
}

export function printDemoLinks(links: DemoLink[], log: (line: string) => void = console.log): void {
  log('Sign-in links (they work while the app runs with the dev panel on, DEMO selected):');
  for (const l of links) log(`  ${l.label} <${l.email}>\n    ${l.url}`);
}
```

  `runDemoReset` derives the DEMO URLs first. That throws `DATABASE_URL must name cs_dev…` before any connection is opened. `requireSalt` throws a message that names `REVIEWER_HASH_SALT`.

`packages/demo/src/cli/repo.ts`:

```ts
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** packages/demo/src/cli → repo root. */
export const repoRoot = (): string => fileURLToPath(new URL('../../../../', import.meta.url));

export function loadRepoEnv(): void {
  try {
    process.loadEnvFile(join(repoRoot(), '.env'));
  } catch {
    // .env is optional (variables may come from the shell); never print it.
  }
}
```

`packages/demo/src/cli/reset.ts`:

```ts
import { printDemoLinks, runDemoReset } from '../reset';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
try {
  printDemoLinks(await runDemoReset({ repoRoot: repoRoot() }));
} catch (e) {
  console.error(`[reset] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
```

`packages/demo/src/cli/links.ts`:

```ts
import { createDb, resolveEnvironment } from '@cs/db';
import { demoSignInLinks } from '../links';
import { printDemoLinks } from '../reset';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
const name = process.argv.includes('--test') ? 'test' : 'demo';
try {
  const env = resolveEnvironment(name, { repoRoot: repoRoot() });
  const { db, close } = createDb(env.serviceUrl);
  try {
    const links = await demoSignInLinks(db, { secret: process.env.LINK_SIGNING_SECRET ?? '', baseUrl: process.env.APP_URL?.trim() || 'http://localhost:3000' });
    if (links.length === 0) console.log(`No demo users in ${name.toUpperCase()}. Run pnpm demo:reset first.`);
    else printDemoLinks(links);
  } finally {
    await close();
  }
} catch (e) {
  console.error(`[links] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
```

- [ ] **Step 4: Wire the scripts and ignore the new local files.**
  - In `packages/demo/package.json` `scripts`, add: `"reset": "tsx src/cli/reset.ts", "links": "tsx src/cli/links.ts"`.
  - In the root `package.json` `scripts`, add: `"demo:reset": "pnpm --filter @cs/demo reset", "demo:links": "pnpm --filter @cs/demo links"`.
  - Append to `.gitignore`:

```
.evidence-demo/
.evidence-restore-*/
.evidence-*-aside-*/
/backups/
/.dev-env.json
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @cs/demo exec vitest run src/reset.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 6: Run a real reset once**

This is the spec's success criterion 1. It touches only `cs_demo` and makes no vendor or AI calls.

Run: `pnpm demo:reset` (timeout 600000)
Expected: `[reset] created cs_demo` (or `exists`), the seed progress lines, then five sign-in links.
- If it stops with `Create database cs_demo in the Neon console, then re-run.`, tell the owner. Do not try another way to create it. Continue with the next tasks; Task 19's panel E2E needs `cs_demo`.
- Run: `pnpm demo:links`. Expected: the same five labels with fresh tokens.

- [ ] **Step 7: Commit**

```bash
git add packages/demo/src/reset.ts packages/demo/src/reset.test.ts packages/demo/src/cli/reset.ts packages/demo/src/cli/links.ts packages/demo/src/cli/repo.ts packages/demo/package.json package.json .gitignore
git commit -m "feat(demo): demo:reset and demo:links"
```

---

### Task 13: The dev-panel guard

**Files:**
- Create: `apps/web/src/server/dev-guard.ts`, `apps/web/src/server/dev-guard.test.ts`

**Interfaces:**
- Consumes: `type EnvName`, `isEnvName` (`@cs/db`, Task 1).
- Produces. This module holds no panel code and no markers, so it is safe in production bundles:
  - `processGuardOn(env?): boolean`: conditions 1 and 2;
  - `isLocalHost(host: string | null | undefined): boolean`: `localhost` or `127.0.0.1`, any port;
  - `requestGuardOn(host, env?): boolean`: all three conditions;
  - `webRepoRoot(cwd?): string`: `apps/web/../..`;
  - `devEnvFile(env?, repoRoot?): string`: `RM_DEV_ENV_FILE` or `<repo>/.dev-env.json`;
  - `readDevEnv(file): EnvName | null`, `writeDevEnv(file, name): Promise<void>`;
  - `activeEnvName(env?): EnvName`: `'dev'` unless the process guard is on and the file names another environment.

- [ ] **Step 1: Write the failing test** — `apps/web/src/server/dev-guard.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeEnvName, isLocalHost, processGuardOn, requestGuardOn, writeDevEnv } from './dev-guard';

const ON = { NODE_ENV: 'development', DEV_PANEL: '1' } as unknown as NodeJS.ProcessEnv;

describe('the three guard conditions (spec §5.3)', () => {
  it('is on only when all three hold', () => {
    expect(requestGuardOn('localhost:3000', ON)).toBe(true);
    expect(requestGuardOn('127.0.0.1:3100', ON)).toBe(true);
    expect(requestGuardOn('LOCALHOST', ON)).toBe(true);
  });

  it('is off when NODE_ENV is production', () => {
    expect(processGuardOn({ ...ON, NODE_ENV: 'production' })).toBe(false);
    expect(requestGuardOn('localhost:3000', { ...ON, NODE_ENV: 'production' })).toBe(false);
  });

  it('is off unless DEV_PANEL is exactly "1"', () => {
    for (const v of [undefined, '', '0', 'true', ' 1']) expect(requestGuardOn('localhost:3000', { ...ON, DEV_PANEL: v })).toBe(false);
  });

  it('is off for any host but localhost or 127.0.0.1 (Review Focus 2)', () => {
    for (const h of ['192.168.1.20:3000', 'localhost.evil.example', 'evil.example', '[::1]:3000', '0.0.0.0:3000', '', null, undefined]) {
      expect(isLocalHost(h)).toBe(false);
      expect(requestGuardOn(h ?? null, ON)).toBe(false);
    }
  });
});

describe('activeEnvName', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dev-env-'));
    file = join(dir, 'dev-env.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaults to DEV and follows the file while the guard is on', async () => {
    const env = { ...ON, RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv;
    expect(activeEnvName(env)).toBe('dev');
    await writeDevEnv(file, 'demo');
    expect(activeEnvName(env)).toBe('demo');
    await writeDevEnv(file, 'test');
    expect(activeEnvName(env)).toBe('test');
  });

  it('ignores the file when the guard is off', async () => {
    await writeDevEnv(file, 'demo');
    expect(activeEnvName({ ...ON, DEV_PANEL: undefined, RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv)).toBe('dev');
    expect(activeEnvName({ ...ON, NODE_ENV: 'production', RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv)).toBe('dev');
  });

  it('falls back to DEV for an unknown or broken file', () => {
    const env = { ...ON, RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv;
    writeFileSync(file, '{"env":"prod"}', 'utf8');
    expect(activeEnvName(env)).toBe('dev');
    writeFileSync(file, 'not json', 'utf8');
    expect(activeEnvName(env)).toBe('dev');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/web exec vitest run src/server/dev-guard.test.ts` (timeout 600000)
Expected: FAIL — `./dev-guard` does not exist.

- [ ] **Step 3: Create `apps/web/src/server/dev-guard.ts`:**

```ts
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { type EnvName, isEnvName } from '@cs/db';

/**
 * Spec §5.3 conditions 1 and 2 — process-level. The database/storage/auth factories switch on these alone
 * (deviation 6: they run outside any request). The banner and every panel route also need `requestGuardOn`.
 */
export function processGuardOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.DEV_PANEL === '1';
}

/** Spec §5.3 condition 3: `localhost` or `127.0.0.1`, any port. Nothing else, not even `[::1]`. */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.trim().toLowerCase().replace(/:\d+$/, '');
  return name === 'localhost' || name === '127.0.0.1';
}

export function requestGuardOn(host: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return processGuardOn(env) && isLocalHost(host);
}

/** `next dev` runs with `apps/web` as its working directory. */
export const webRepoRoot = (cwd: string = process.cwd()): string => resolve(cwd, '..', '..');

/** `.dev-env.json` at the repo root (git-ignored); `RM_DEV_ENV_FILE` overrides it (the panel E2E uses its own file). */
export function devEnvFile(env: NodeJS.ProcessEnv = process.env, repoRoot: string = webRepoRoot()): string {
  const override = env.RM_DEV_ENV_FILE?.trim();
  return override ? resolve(override) : resolve(repoRoot, '.dev-env.json');
}

export function readDevEnv(file: string): EnvName | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { env?: unknown };
    return isEnvName(parsed.env) ? parsed.env : null;
  } catch {
    return null;
  }
}

export async function writeDevEnv(file: string, name: EnvName): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ env: name })}\n`, 'utf8');
}

/** The live database: DEV unless the process guard is on and `.dev-env.json` names another. */
export function activeEnvName(env: NodeJS.ProcessEnv = process.env): EnvName {
  if (!processGuardOn(env)) return 'dev';
  return readDevEnv(devEnvFile(env)) ?? 'dev';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cs/web exec vitest run src/server/dev-guard.test.ts` (timeout 600000)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/dev-guard.ts apps/web/src/server/dev-guard.test.ts
git commit -m "feat(web): dev-panel guard and active environment"
```

---

### Task 14: Runtime environment switching in the web app's factories

**Files:**
- Create:
  - `apps/web/src/server/env-cache.ts` + `env-cache.test.ts`;
  - `apps/web/src/server/runtime-env.ts` + `runtime-env.test.ts`;
  - `apps/web/src/server/store.ts`;
  - `apps/web/src/server/db.test.ts`.
- Modify:
  - `apps/web/src/server/db.ts`, `apps/web/src/server/files.ts`, `apps/web/src/server/auth.ts`, `apps/web/src/server/tools.ts`;
  - `apps/web/src/server/queue.ts` + `queue.test.ts`;
  - `apps/web/src/app/(app)/layout.tsx`;
  - `apps/web/src/app/files/brief/[id]/route.ts`, `apps/web/src/app/files/report/[id]/route.ts`, `apps/web/src/app/files/evidence/[clientId]/[evidenceId]/route.ts`;
  - `apps/web/package.json` (add `@cs/demo`), `apps/web/next.config.ts` (`transpilePackages`), `pnpm-lock.yaml`.

**Interfaces:**
- Consumes: `activeEnvName`, `processGuardOn`, `webRepoRoot` (Task 13); `resolveEnvironment` (Task 1); `DEMO_OPERATOR_EMAIL` (`@cs/demo/users`, Task 3).
- Produces:
  - `perEnv<T>(build: (name: EnvName) => T, dispose?: (v: T) => unknown, active?: () => EnvName): () => T` and `clearEnvCaches(): Promise<void>` (`env-cache.ts`);
  - `envUrls(name): { owner; app; service }`, `envEvidenceDir(name: 'demo' | 'test')`, `platformAdminsFor(base, name, guardOn)`, `platformAdmins()` (`runtime-env.ts`);
  - `webStore()`, moved to `store.ts`;
  - `BACKGROUND_OFF`, `refuseJobs: EnqueueJob` (`queue.ts`).
- Behaviour:
  - with the guard off, every factory builds exactly what it built before, from env;
  - `dbs()`, `auth()`, `registry()`, `webStore()` and `enqueueJob` now keep one instance per environment;
  - in DEMO and TEST, enqueueing refuses and job status reads as "no job" (deviation 9).

- [ ] **Step 1: Add the dependency**

In `apps/web/package.json` `dependencies`, add `"@cs/demo": "workspace:*"`. In `apps/web/next.config.ts` `transpilePackages`, add `'@cs/demo'`. Run `pnpm install`.

- [ ] **Step 2: Write the failing tests.**

`apps/web/src/server/env-cache.test.ts`:

```ts
import type { EnvName } from '@cs/db';
import { describe, expect, it, vi } from 'vitest';
import { clearEnvCaches, perEnv } from './env-cache';

describe('perEnv', () => {
  it('builds one value per environment and reuses it after switching back', () => {
    let current: EnvName = 'dev';
    const build = vi.fn((name: EnvName) => ({ name }));
    const get = perEnv(build, undefined, () => current);
    const dev = get();
    expect(get()).toBe(dev);
    current = 'demo';
    const demo = get();
    expect(demo).not.toBe(dev);
    expect(demo.name).toBe('demo');
    current = 'dev';
    expect(get()).toBe(dev);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('clearEnvCaches disposes every cached value and rebuilds on next use', async () => {
    const dispose = vi.fn();
    const get = perEnv((name: EnvName) => ({ name }), dispose, () => 'demo');
    const first = get();
    await clearEnvCaches();
    expect(dispose).toHaveBeenCalledWith(first);
    expect(get()).not.toBe(first);
  });
});
```

`apps/web/src/server/runtime-env.test.ts`:

```ts
import { DEMO_OPERATOR_EMAIL } from '@cs/demo/users';
import { describe, expect, it } from 'vitest';
import { platformAdminsFor } from './runtime-env';

describe('platformAdminsFor (spec §5.4)', () => {
  it('adds the demo operator in memory only for DEMO and TEST with the guard on', () => {
    expect(platformAdminsFor(['owner@x.co'], 'demo', true)).toEqual(['owner@x.co', DEMO_OPERATOR_EMAIL]);
    expect(platformAdminsFor(['owner@x.co'], 'test', true)).toEqual(['owner@x.co', DEMO_OPERATOR_EMAIL]);
    expect(platformAdminsFor(['owner@x.co'], 'dev', true)).toEqual(['owner@x.co']);
    expect(platformAdminsFor(['owner@x.co'], 'demo', false)).toEqual(['owner@x.co']);
  });
});
```

`apps/web/src/server/db.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cs/db', async (orig) => ({
  ...(await orig<typeof import('@cs/db')>()),
  createDb: vi.fn((url: string) => ({ db: { url }, close: vi.fn(async () => {}) })),
}));

const BASE: Record<string, string> = {
  APP_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: 'b'.repeat(32), LINK_SIGNING_SECRET: 'l'.repeat(32), EMAIL_FROM: 'from@example.com',
  DATABASE_URL: 'postgresql://o:p@h.example/cs_dev', APP_DATABASE_URL: 'postgresql://a:p@h.example/cs_dev', SERVICE_DATABASE_URL: 'postgresql://s:p@h.example/cs_dev',
  TEST_DATABASE_URL: 'postgresql://o:p@h.example/cs_test', TEST_APP_DATABASE_URL: 'postgresql://a:p@h.example/cs_test', TEST_SERVICE_DATABASE_URL: 'postgresql://s:p@h.example/cs_test',
};
const url = (db: unknown) => (db as { url: string }).url;
let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'web-db-'));
  file = join(dir, 'dev-env.json');
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('RM_DEV_ENV_FILE', file);
});
afterEach(async () => {
  const { clearEnvCaches } = await import('./env-cache');
  await clearEnvCaches();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('dbs() per environment (spec §8 client cache)', () => {
  it('returns a different client set after a switch and the same one when switching back', async () => {
    vi.stubEnv('DEV_PANEL', '1');
    const { dbs } = await import('./db');
    const { writeDevEnv } = await import('./dev-guard');
    expect(url(dbs().app)).toBe(BASE.APP_DATABASE_URL);
    await writeDevEnv(file, 'demo');
    const demo = dbs();
    expect([url(demo.app), url(demo.service)]).toEqual(['postgresql://a:p@h.example/cs_demo', 'postgresql://s:p@h.example/cs_demo']);
    await writeDevEnv(file, 'test');
    expect(url(dbs().app)).toBe(BASE.TEST_APP_DATABASE_URL);
    await writeDevEnv(file, 'demo');
    expect(dbs().app).toBe(demo.app);
  });

  it('ignores .dev-env.json while the guard is off', async () => {
    vi.stubEnv('DEV_PANEL', '');
    const { dbs } = await import('./db');
    const { writeDevEnv } = await import('./dev-guard');
    await writeDevEnv(file, 'demo');
    expect(url(dbs().app)).toBe(BASE.APP_DATABASE_URL);
  });
});
```

  Add to `apps/web/src/server/queue.test.ts`. Extend the import from `./queue` with `BACKGROUND_OFF` and `refuseJobs`, and add `import { ToolError } from '@cs/core';` if it is not imported yet. Then:

```ts
describe('refuseJobs (deviation 9, Review Focus 4)', () => {
  it('refuses every job with a message the user can read', async () => {
    await expect(refuseJobs('suggest-competitors', { clientId: 'x' }, 'x')).rejects.toSatisfy((e: unknown) => e instanceof ToolError && e.code === 'invalid_input' && e.message === BACKGROUND_OFF);
  });
});
```

  (`'suggest-competitors'` is a member of `QueueJob` in `packages/tools/src/deps.ts`, whose payload is `Record<string, string>`.)

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @cs/web exec vitest run src/server/env-cache.test.ts src/server/runtime-env.test.ts src/server/db.test.ts src/server/queue.test.ts` (timeout 600000)
Expected: FAIL — the new modules and exports do not exist.

- [ ] **Step 4: Create the cache and runtime modules.**

`apps/web/src/server/env-cache.ts`:

```ts
import type { EnvName } from '@cs/db';
import { activeEnvName } from './dev-guard';

const caches: { clear(): Promise<void> }[] = [];

/**
 * Spec §5.4: one cached value per environment. With the guard off `activeEnvName()` is always 'dev', so there is
 * exactly one value, built from env as before.
 */
export function perEnv<T>(build: (name: EnvName) => T, dispose?: (value: T) => unknown, active: () => EnvName = activeEnvName): () => T {
  const values = new Map<EnvName, T>();
  caches.push({
    async clear() {
      const old = [...values.values()];
      values.clear();
      if (dispose) await Promise.allSettled(old.map(async (v) => dispose(v)));
    },
  });
  return () => {
    const name = active();
    if (!values.has(name)) values.set(name, build(name));
    return values.get(name)!;
  };
}

/** Spec §5.2 switch step 2: drop every cached client set and store (pools are closed). */
export async function clearEnvCaches(): Promise<void> {
  await Promise.all(caches.map((c) => c.clear()));
}
```

`apps/web/src/server/runtime-env.ts`:

```ts
import 'server-only';
import { type EnvName, resolveEnvironment } from '@cs/db';
import { DEMO_OPERATOR_EMAIL } from '@cs/demo/users';
import { activeEnvName, processGuardOn, webRepoRoot } from './dev-guard';
import { webEnv } from './env';

export interface EnvUrls {
  owner: string;
  app: string;
  service: string;
}

/** DEV is exactly what the app used before (webEnv); DEMO and TEST come from `resolveEnvironment`. */
export function envUrls(name: EnvName): EnvUrls {
  if (name === 'dev') {
    const w = webEnv();
    return { owner: w.queueDatabaseUrl, app: w.appDatabaseUrl, service: w.serviceDatabaseUrl };
  }
  const r = resolveEnvironment(name, { repoRoot: webRepoRoot(), env: process.env });
  return { owner: r.ownerUrl, app: r.appUrl, service: r.serviceUrl };
}

export const envEvidenceDir = (name: 'demo' | 'test'): string => resolveEnvironment(name, { repoRoot: webRepoRoot(), env: process.env }).evidenceDir;

/** Spec §5.4: the demo operator joins PLATFORM_ADMIN_EMAILS in memory while the guard is on and DEMO or TEST is live. */
export function platformAdminsFor(base: readonly string[], name: EnvName, guardOn: boolean): string[] {
  return guardOn && name !== 'dev' && !base.includes(DEMO_OPERATOR_EMAIL) ? [...base, DEMO_OPERATOR_EMAIL] : [...base];
}

export const platformAdmins = (): string[] => platformAdminsFor(webEnv().platformAdmins, activeEnvName(), processGuardOn());
```

`apps/web/src/server/store.ts`:

```ts
import 'server-only';
import { createFsStore, createStoreFromEnv, type ObjectStore } from '@cs/storage';
import { perEnv } from './env-cache';
import { resolveEvidenceDir } from './files';
import { envEvidenceDir } from './runtime-env';

/** Moved from files.ts (which the E2E seed imports outside Next) so it can depend on server-only modules. */
const stores = perEnv<ObjectStore>((name) =>
  name === 'dev'
    ? createStoreFromEnv({ ...process.env, EVIDENCE_FS_DIR: resolveEvidenceDir(process.env.EVIDENCE_FS_DIR, process.cwd()) })
    : createFsStore(envEvidenceDir(name)));

export const webStore = (): ObjectStore => stores();
```

- [ ] **Step 5: Switch the factories.**

`apps/web/src/server/db.ts` (whole file):

```ts
import 'server-only';
import { createDb, type Db } from '@cs/db';
import { perEnv } from './env-cache';
import { envUrls } from './runtime-env';

interface DbSet {
  app: Db;
  service: Db;
  close(): Promise<void>;
}

/** One pool per role per environment per server process (Fluid compute reuses it across requests). */
const sets = perEnv<DbSet>(
  (name) => {
    const u = envUrls(name);
    const app = createDb(u.app);
    const service = createDb(u.service);
    return { app: app.db, service: service.db, close: async () => { await Promise.all([app.close(), service.close()]); } };
  },
  (s) => s.close(),
);

export function dbs(): { app: Db; service: Db } {
  const { app, service } = sets();
  return { app, service };
}
```

`apps/web/src/server/files.ts`:
- delete the `let store` line and the `webStore` export (lines 16–18);
- change the storage import to `import type { ObjectStore } from '@cs/storage';` (`createStoreFromEnv` is no longer used here).

The three file routes change one import each. For example, in `apps/web/src/app/files/brief/[id]/route.ts`:

```ts
import { servePdf } from '@/server/files';
import { webStore } from '@/server/store';
```

Do the same in `files/report/[id]/route.ts`. In `files/evidence/[clientId]/[evidenceId]/route.ts` use `import { serveEvidence } from '@/server/files';` plus the `webStore` import.

`apps/web/src/server/auth.ts` (whole file):

```ts
import 'server-only';
import { createLedgerSink, type EnvName } from '@cs/db';
import { createEmailTransportFromEnv, renderEmail } from '@cs/email';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { after } from 'next/server';
import { Pool } from 'pg';
import { buildAuthOptions } from './auth-options';
import { defaultBranding } from './branding';
import { dbs } from './db';
import { perEnv } from './env-cache';
import { webEnv } from './env';
import { envUrls } from './runtime-env';

function create(name: EnvName) {
  const env = webEnv();
  const { service } = dbs();
  const transport = createEmailTransportFromEnv(process.env, createLedgerSink(service));
  const pool = new Pool({ connectionString: envUrls(name).service, max: 5 });
  const options = buildAuthOptions({
    env, service, pool,
    branding: () => defaultBranding(service, env),
    runInBackground: (task) => after(task),
    sendEmail: async (to, payload) => {
      const r = await renderEmail(payload);
      await transport.send({ from: env.emailFrom, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
    },
  });
  // nextCookies() must be the last plugin so cookies set by server actions reach the response.
  return { auth: betterAuth({ ...options, plugins: [...(options.plugins ?? []), nextCookies()] }), pool };
}

/** One Better Auth instance (and its pool) per environment: sessions live in each database's `auth` schema. */
const instances = perEnv(create, (v) => v.pool.end());
export const auth = () => instances().auth;
```

`apps/web/src/server/tools.ts`:
- replace the `let cached` / `registry` lines with the following;
- change `import { webEnv } from './env';` to keep `webEnv`;
- add `import { perEnv } from './env-cache';` and `import { platformAdmins } from './runtime-env';`.

```ts
const registries = perEnv(() =>
  createToolRegistry({ ...dbs(), delivery: deliveryConfigFromEnv(process.env), enqueue: enqueueJob, jobStatus, webMonitoring: webEnv().webMonitoring, platformAdmins: platformAdmins() }));
export const registry = () => registries();
```

`apps/web/src/server/queue.ts`:
- add `import { ToolError } from '@cs/core';`, `import { activeEnvName } from './dev-guard';`, `import { perEnv } from './env-cache';` and `import { envUrls } from './runtime-env';`;
- drop the `webEnv` import;
- replace the `const queue = …` / `enqueueJob` / `enqueue` lines and the `jobStatus` body with:

```ts
/** Deviation 9: the queue belongs to cs_dev's worker; DEMO and TEST ids must never reach it (it calls paid vendors). */
export const BACKGROUND_OFF = 'Background jobs are switched off while browsing DEMO or TEST data.';
export const refuseJobs: EnqueueJob = async () => {
  throw new ToolError('invalid_input', BACKGROUND_OFF);
};

const queues = perEnv<{ enqueue: EnqueueJob }>((name) =>
  name === 'dev'
    ? createBossQueue(() => new PgBoss({ connectionString: envUrls('dev').owner, supervise: false, schedule: false, migrate: false, max: 2 }))
    : { enqueue: refuseJobs });

/** Every job the web app starts (PDF renders, competitor suggestions, page discovery). */
export const enqueueJob: EnqueueJob = (job, payload, singletonKey) => queues().enqueue(job, payload, singletonKey);
/** The worker's `short` policy on `brief-pdf`/`report-pdf` dedupes by `singletonKey`, so repeated page refreshes don't pile up renders. */
export const enqueue: Enqueue = (job, payload, singletonKey) => queues().enqueue(job, payload, singletonKey);
```

  and inside the `jobStatus` lookup, before the query:

```ts
  if (activeEnvName() !== 'dev') return [];
  queueDb ??= createDb(envUrls('dev').owner).db;
```

`apps/web/src/app/(app)/layout.tsx`: replace `import { webEnv } from '@/server/env';` with `import { platformAdmins } from '@/server/runtime-env';`, and `navFlagsFor(viewer, webEnv().platformAdmins)` with `navFlagsFor(viewer, platformAdmins())`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @cs/web exec vitest run src/server/env-cache.test.ts src/server/runtime-env.test.ts src/server/db.test.ts src/server/queue.test.ts src/server/files.test.ts src/server/tools.test.ts` (timeout 600000)
Expected: PASS.
Then check free commit memory (HANDOVER §6) and run `pnpm --filter @cs/web typecheck`: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/env-cache.ts apps/web/src/server/env-cache.test.ts apps/web/src/server/runtime-env.ts apps/web/src/server/runtime-env.test.ts apps/web/src/server/store.ts apps/web/src/server/db.ts apps/web/src/server/db.test.ts apps/web/src/server/files.ts apps/web/src/server/auth.ts apps/web/src/server/tools.ts apps/web/src/server/queue.ts apps/web/src/server/queue.test.ts "apps/web/src/app/(app)/layout.tsx" apps/web/src/app/files apps/web/package.json apps/web/next.config.ts pnpm-lock.yaml
git commit -m "feat(web): per-environment database, storage, auth, registry and queue behind the guard"
```

---

### Task 15: Console email sender and the magic-link hook

**Files:**
- Create: `apps/web/src/server/dev-hooks.ts`, `apps/web/src/server/email-transport.ts`, `apps/web/src/server/email-transport.test.ts`
- Modify: `packages/email/src/transport.ts`, `packages/email/src/transport.test.ts`, `apps/web/src/server/auth-options.ts`, `apps/web/src/server/auth-options.test.ts`, `apps/web/src/server/auth.ts`

**Interfaces:**
- Consumes: `processGuardOn` (Task 13); `createEmailTransportFromEnv` (`@cs/email`).
- Produces:
  - `createConsoleTransport(log?: (line: string) => void): EmailTransport`, with `kind: 'console'` (`@cs/email`);
  - `webEmailTransport(guardOn: boolean, env: NodeJS.ProcessEnv, ledger: LedgerSink): EmailTransport`;
  - `AuthDeps.onMagicLink?: (email: string, url: string) => void`, called synchronously before the background send;
  - `devHooks: { onMagicLink?: (email, url) => void }`, a plain object that only the dev panel fills (Task 18).
- Spec §5.5 implementation check: `@cs/email` picks Postmark when `POSTMARK_SERVER_TOKEN` is set, otherwise the file outbox. It had no console switch; this task adds one, and only the web app's guard turns it on.

- [ ] **Step 1: Write the failing tests.**

  Append to `packages/email/src/transport.test.ts`, and add `createConsoleTransport` to its import from `./transport`:

```ts
describe('createConsoleTransport (demo spec §5.5)', () => {
  it('logs the message and sends nothing anywhere', async () => {
    const lines: string[] = [];
    const t = createConsoleTransport((l) => lines.push(l));
    const r = await t.send({ from: 'a@x.co', to: 'admin@demo.rivalmonday.test', replyTo: null, subject: 'Sign in', html: '<p>hi</p>', text: 'Open https://x/verify', tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
    expect(t.kind).toBe('console');
    expect(r.providerId).toMatch(/^console:/);
    expect(lines.join('\n')).toContain('admin@demo.rivalmonday.test');
    expect(lines.join('\n')).toContain('https://x/verify');
  });
});
```

`apps/web/src/server/email-transport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { webEmailTransport } from './email-transport';

const ledger = { recordLlmCall: async () => {}, recordVendorCall: async () => {} } as never;

describe('webEmailTransport (Review Focus 4)', () => {
  it('logs to the console while the guard is on, even with a Postmark token', () => {
    expect(webEmailTransport(true, { POSTMARK_SERVER_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv, ledger).kind).toBe('console');
  });

  it('keeps the normal choice with the guard off', () => {
    expect(webEmailTransport(false, { POSTMARK_SERVER_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv, ledger).kind).toBe('postmark');
    expect(webEmailTransport(false, {} as NodeJS.ProcessEnv, ledger).kind).toBe('file');
  });
});
```

  Append to `apps/web/src/server/auth-options.test.ts` (it reuses that file's `env`, `dbs`, `pool` and `background`):

```ts
describe('onMagicLink (dev panel sign-in, deviation 4)', () => {
  it('hands the verify URL to the hook synchronously, before the background send', async () => {
    const seen: [string, string][] = [];
    const devAuth = betterAuth(buildAuthOptions({
      env, service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null),
      runInBackground: (task) => void background.push(task), sendEmail: async () => {},
      onMagicLink: (email, url) => seen.push([email, url]),
    }));
    await devAuth.api.signInMagicLink({ body: { email: 'someone@example.com', callbackURL: '/agency' }, headers: new Headers() });
    expect(seen).toHaveLength(1);
    expect(seen[0]![0]).toBe('someone@example.com');
    expect(seen[0]![1]).toMatch(/\/api\/auth\/magic-link\/verify\?token=[^&]+&callbackURL=%2Fagency/);
    await flush();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/email exec vitest run src/transport.test.ts` and `pnpm --filter @cs/web exec vitest run src/server/email-transport.test.ts src/server/auth-options.test.ts` (timeout 600000 each, one after the other)
Expected: FAIL — `createConsoleTransport`, `webEmailTransport` and `onMagicLink` do not exist.

- [ ] **Step 3: Implement.**

In `packages/email/src/transport.ts`:
- widen `EmailTransport.kind` to `'postmark' | 'file' | 'memory' | 'console'`;
- add the following after `createMemoryTransport`:

```ts
/** Demo spec §5.5: the dev panel's sender — prints the message, sends nothing. Only the web app's guard selects it. */
export function createConsoleTransport(log: (line: string) => void = console.log): EmailTransport {
  let n = 0;
  return {
    kind: 'console',
    async send(msg) {
      n++;
      log(`[email:console] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
      return { providerId: `console:${n}` };
    },
  };
}
```

  No code switches over `EmailTransport.kind` (checked 2026-10-09), so widening the union is enough. `pnpm typecheck` in Step 4 would catch a new exhaustive switch.

`apps/web/src/server/email-transport.ts`:

```ts
import type { LedgerSink } from '@cs/core';
import { createConsoleTransport, createEmailTransportFromEnv, type EmailTransport } from '@cs/email';

/** Spec §5.5: while the dev-panel guard is on, sign-in emails go to the console — never Postmark, never a file. */
export function webEmailTransport(guardOn: boolean, env: NodeJS.ProcessEnv, ledger: LedgerSink): EmailTransport {
  return guardOn ? createConsoleTransport() : createEmailTransportFromEnv(env, ledger);
}
```

`apps/web/src/server/dev-hooks.ts`:

```ts
/**
 * Hooks the dev panel installs when it loads (Task 18). Empty in every other process, including production,
 * where the panel module is never imported.
 */
export const devHooks: { onMagicLink?: (email: string, url: string) => void } = {};
```

`apps/web/src/server/auth-options.ts`:
- add to `AuthDeps`:

```ts
  /** Dev panel only (deviation 4): receives each sign-in URL synchronously, before the background send. */
  onMagicLink?: (email: string, url: string) => void;
```

- make the first statement of `sendMagicLink` `deps.onMagicLink?.(email, url);`.

`apps/web/src/server/auth.ts`:
- replace the `createEmailTransportFromEnv` import with `import { renderEmail } from '@cs/email';`;
- add `import { processGuardOn } from './dev-guard';`, `import { devHooks } from './dev-hooks';` and `import { webEmailTransport } from './email-transport';`;
- in `create`, use:

```ts
  const transport = webEmailTransport(processGuardOn(), process.env, createLedgerSink(service));
```

  and pass `onMagicLink: (email, url) => devHooks.onMagicLink?.(email, url),` to `buildAuthOptions`.

- [ ] **Step 4: Run the tests to verify they pass**

Run, one after the other:
- `pnpm --filter @cs/email exec vitest run src/transport.test.ts`
- `pnpm --filter @cs/web exec vitest run src/server/email-transport.test.ts src/server/auth-options.test.ts`

(timeout 600000 each). Expected: PASS. Then `pnpm --filter @cs/email typecheck` and `pnpm --filter @cs/web typecheck`: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/email/src/transport.ts packages/email/src/transport.test.ts apps/web/src/server/dev-hooks.ts apps/web/src/server/email-transport.ts apps/web/src/server/email-transport.test.ts apps/web/src/server/auth-options.ts apps/web/src/server/auth-options.test.ts apps/web/src/server/auth.ts
git commit -m "feat(web): console email sender behind the guard and a magic-link hook"
```

---

### Task 16: `db:snapshot`

**Files:**
- Create:
  - `packages/demo/src/snapshot/pg-tools.ts`, `snapshot/manifest.ts`, `snapshot/zip.ts`, `snapshot/snapshot.ts`;
  - tests: `snapshot/pg-tools.test.ts`, `snapshot/manifest.test.ts`, `snapshot/zip.test.ts`;
  - `packages/demo/src/cli/snapshot.ts`.
- Modify: `packages/demo/package.json` (add `fflate`, `zod`, script `snapshot`), root `package.json` (`db:snapshot`), `turbo.json` (`PG_BIN`), `pnpm-lock.yaml`.

**Interfaces:**
- Consumes: `assertDatabase`, `databaseNameOf`, `resolveEnvironment`, `DEV_DATABASE`, `MIGRATIONS_FOLDER` (`@cs/db`); `postgres`; `fflate`; `repoRoot`, `loadRepoEnv` (Task 12).
- Produces:
  - `pg-tools.ts`:
    - `type PgTool = 'pg_dump' | 'pg_restore'`, `PORTABLE_BINARIES_URL`;
    - `pgToolPath(tool, env?)`, `parseMajor(text): number | null`, `versionProblem(tool, client: number | null, server: number): string | null`;
    - `pgEnv(url): Record<string, string>`, `runPg(bin, args, extraEnv?): Promise<{ code; stdout; stderr }>`;
    - `clientMajor(tool, env?): Promise<number | null>`, `serverMajor(sql): Promise<{ major: number; version: string }>`.
  - `manifest.ts`:
    - `interface SnapshotManifest { version: 1; createdAt; sourceDatabase; serverVersion; lastMigration: string | null; tables: Record<string, number>; evidence: { files; bytes } }`;
    - `parseManifest(json): SnapshotManifest`, `tableCounts(sql)`, `lastMigration(sql)`, `compareCounts(expected, actual): string[]`, `stampOf(d): string` (`YYYYMMDD-HHMMSS`, UTC).
  - `zip.ts`: `listFiles(dir)`, `zipDirectory(dir, outFile): Promise<{ files; bytes }>`, `unzipTo(zipFile, dir): Promise<number>`.
  - `snapshot.ts`: `takeSnapshot(o: { ownerUrl; expected; evidenceDir; backupsDir; now?; env?; label?; log? }): Promise<{ folder; manifest }>`.

- [ ] **Step 1: Add the dependencies and read the Turborepo docs**

Run: `pnpm --filter @cs/demo add fflate@^0.8.2 zod@^4.1.5`.
Then read `node_modules/turbo/docs/README.md` and its page on environment variables (strict env mode / `globalPassThroughEnv`) before editing `turbo.json` (repo `AGENTS.md`).

- [ ] **Step 2: Write the failing unit tests.**

`packages/demo/src/snapshot/pg-tools.test.ts`:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMajor, pgEnv, pgToolPath, runPg, versionProblem } from './pg-tools';

describe('version check (spec §6.1 step 1, §8)', () => {
  it('reads majors from client and server version strings', () => {
    expect(parseMajor('pg_dump (PostgreSQL) 17.5')).toBe(17);
    expect(parseMajor('pg_restore (PostgreSQL) 18.1 (Ubuntu 18.1-1)')).toBe(18);
    expect(parseMajor('18.6')).toBe(18);
    expect(parseMajor('nonsense')).toBeNull();
  });

  it('names the version needed and how to get it when the client is older', () => {
    const m = versionProblem('pg_dump', 17, 18)!;
    expect(m).toContain('pg_dump 17 is older than the server (PostgreSQL 18)');
    expect(m).toContain('PostgreSQL 18 client tools');
    expect(m).toContain('PG_BIN');
    expect(versionProblem('pg_dump', null, 18)).toContain('pg_dump was not found');
    expect(versionProblem('pg_dump', 18, 18)).toBeNull();
    expect(versionProblem('pg_restore', 19, 18)).toBeNull();
  });

  it('uses PG_BIN when set', () => {
    const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
    expect(pgToolPath('pg_dump', { PG_BIN: join('C:', 'pg18', 'bin') } as unknown as NodeJS.ProcessEnv)).toBe(join('C:', 'pg18', 'bin', exe));
    expect(pgToolPath('pg_dump', {} as NodeJS.ProcessEnv)).toBe(exe);
  });
});

describe('pgEnv (Review Focus 5: secrets)', () => {
  it('passes the connection through PG* variables, never on the command line', () => {
    expect(pgEnv('postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_dev?sslmode=require&channel_binding=require')).toEqual({
      PGHOST: 'ep-x.neon.tech', PGPORT: '5432', PGUSER: 'owner', PGPASSWORD: 's3cr@t', PGDATABASE: 'cs_dev', PGSSLMODE: 'require', PGCHANNELBINDING: 'require',
    });
  });

  it('reports a missing binary without throwing', async () => {
    const r = await runPg(join('no', 'such', 'pg_dump'), ['--version']);
    expect(r.code).not.toBe(0);
  });
});
```

`packages/demo/src/snapshot/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareCounts, parseManifest, type SnapshotManifest, stampOf } from './manifest';

const good: SnapshotManifest = {
  version: 1, createdAt: '2026-10-09T14:03:22.000Z', sourceDatabase: 'cs_dev', serverVersion: '18.6', lastMigration: '0037_agency_ops_rls',
  tables: { 'public.agency': 1, 'auth.user': 3 }, evidence: { files: 33, bytes: 964_000 },
};

describe('manifest (spec §6.1 step 4)', () => {
  it('accepts the documented shape and nothing that carries a URL', () => {
    expect(parseManifest(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(() => parseManifest({ ...good, version: 2 })).toThrow();
    expect(() => parseManifest({ ...good, url: 'postgresql://x' })).toThrow();
  });

  it('stamps folders in UTC as YYYYMMDD-HHMMSS', () => {
    expect(stampOf(new Date('2026-10-09T14:03:22.123Z'))).toBe('20261009-140322');
  });

  it('lists every row-count difference', () => {
    expect(compareCounts({ 'public.a': 2, 'public.b': 1 }, { 'public.a': 2, 'public.b': 0, 'public.c': 5 })).toEqual([
      'public.b: expected 1, got 0',
      'public.c: not in the snapshot (5 rows)',
    ]);
    expect(compareCounts({ 'public.a': 1 }, {})).toEqual(['public.a: missing after restore (expected 1)']);
  });
});
```

`packages/demo/src/snapshot/zip.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listFiles, unzipTo, zipDirectory } from './zip';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'zip-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('evidence zip', () => {
  it('round-trips a nested directory and counts files and bytes', async () => {
    const src = join(root, 'src');
    mkdirSync(join(src, 'evidence', 'c1'), { recursive: true });
    writeFileSync(join(src, 'evidence', 'c1', 'page.html'), '<p>x</p>');
    writeFileSync(join(src, 'a.txt'), 'hello');
    const stats = await zipDirectory(src, join(root, 'e.zip'));
    expect(stats).toEqual({ files: 2, bytes: 13 });
    expect(await unzipTo(join(root, 'e.zip'), join(root, 'out'))).toBe(2);
    expect(readFileSync(join(root, 'out', 'evidence', 'c1', 'page.html'), 'utf8')).toBe('<p>x</p>');
    expect((await listFiles(join(root, 'out'))).sort()).toEqual(['a.txt', 'evidence/c1/page.html']);
  });

  it('treats a missing directory as empty', async () => {
    expect(await zipDirectory(join(root, 'nope'), join(root, 'e.zip'))).toEqual({ files: 0, bytes: 0 });
  });

  it('refuses entries that would escape the target directory', async () => {
    writeFileSync(join(root, 'bad.zip'), zipSync({ '../evil.txt': strToU8('x') }));
    await expect(unzipTo(join(root, 'bad.zip'), join(root, 'out'))).rejects.toThrow(/Unsafe path/);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @cs/demo exec vitest run src/snapshot` (timeout 600000)
Expected: FAIL — the modules do not exist.

- [ ] **Step 4: Implement the snapshot modules.**

`packages/demo/src/snapshot/pg-tools.ts`:

```ts
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { databaseNameOf } from '@cs/db';
import type postgres from 'postgres';

export type PgTool = 'pg_dump' | 'pg_restore';
export const PORTABLE_BINARIES_URL = 'https://www.enterprisedb.com/download-postgresql-binaries';

/** `PG_BIN` points at a folder of (portable) client binaries; otherwise PATH. */
export function pgToolPath(tool: PgTool, env: NodeJS.ProcessEnv = process.env): string {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
  const bin = env.PG_BIN?.trim();
  return bin ? join(bin, exe) : exe;
}

export function parseMajor(text: string): number | null {
  const m = /PostgreSQL\)\s*(\d+)/i.exec(text) ?? /^\s*(\d+)(?:\.\d+)?/.exec(text);
  return m ? Number(m[1]) : null;
}

/** Spec §6.1 step 1: a client older than the server stops the snapshot with the version needed and where to get it. */
export function versionProblem(tool: PgTool, client: number | null, server: number): string | null {
  const how = `Install the PostgreSQL ${server} client tools (portable binaries: ${PORTABLE_BINARIES_URL}) and set PG_BIN to their bin folder.`;
  if (client === null) return `${tool} was not found. ${how}`;
  if (client < server) return `${tool} ${client} is older than the server (PostgreSQL ${server}). ${how}`;
  return null;
}

/** Connection details for libpq tools through the environment, so no password ever appears on a command line or in output. */
export function pgEnv(url: string): Record<string, string> {
  const u = new URL(url);
  const out: Record<string, string> = {
    PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: databaseNameOf(url),
  };
  const ssl = u.searchParams.get('sslmode');
  if (ssl) out.PGSSLMODE = ssl;
  const cb = u.searchParams.get('channel_binding');
  if (cb) out.PGCHANNELBINDING = cb;
  return out;
}

export interface PgRun {
  code: number;
  stdout: string;
  stderr: string;
}

export function runPg(bin: string, args: string[], extraEnv: Record<string, string> = {}): Promise<PgRun> {
  return new Promise((done) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(bin, args, { env: { ...process.env, ...extraEnv }, windowsHide: true });
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('error', (e) => done({ code: -1, stdout, stderr: e.message }));
    child.on('close', (code) => done({ code: code ?? -1, stdout, stderr }));
  });
}

export async function clientMajor(tool: PgTool, env: NodeJS.ProcessEnv = process.env): Promise<number | null> {
  const r = await runPg(pgToolPath(tool, env), ['--version']);
  return r.code === 0 ? parseMajor(r.stdout) : null;
}

export async function serverMajor(sql: postgres.Sql): Promise<{ major: number; version: string }> {
  const [row] = await sql<{ server_version: string }[]>`show server_version`;
  const version = row!.server_version;
  const major = parseMajor(version);
  if (major === null) throw new Error(`Unrecognised server version "${version}"`);
  return { major, version };
}
```

`packages/demo/src/snapshot/manifest.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS_FOLDER } from '@cs/db';
import type postgres from 'postgres';
import { z } from 'zod';

/** Spec §6.1 step 4. No URL, password or host is ever stored. */
const Manifest = z.strictObject({
  version: z.literal(1),
  createdAt: z.string(),
  sourceDatabase: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  serverVersion: z.string(),
  lastMigration: z.string().nullable(),
  tables: z.record(z.string(), z.number().int().nonnegative()),
  evidence: z.strictObject({ files: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() }),
});
export type SnapshotManifest = z.infer<typeof Manifest>;

export const parseManifest = (json: unknown): SnapshotManifest => Manifest.parse(json);

/** `YYYYMMDD-HHMMSS`, UTC. */
export const stampOf = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Exact row counts of every table in the schemas the app owns. */
export async function tableCounts(sql: postgres.Sql): Promise<Record<string, number>> {
  const tables = await sql<{ schema: string; name: string }[]>`
    select table_schema as schema, table_name as name from information_schema.tables
    where table_type = 'BASE TABLE' and table_schema in ('public', 'auth', 'drizzle') order by 1, 2`;
  const out: Record<string, number> = {};
  for (const t of tables) {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const [row] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from ${q(t.schema)}.${q(t.name)}`);
    out[`${t.schema}.${t.name}`] = Number(row?.n ?? 0);
  }
  return out;
}

/** The tag of the newest applied migration (drizzle's `created_at` is the journal's `when`). */
export async function lastMigration(sql: postgres.Sql): Promise<string | null> {
  const rows = await sql<{ created_at: string }[]>`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`.catch(() => []);
  if (rows.length === 0) return null;
  const when = Number(rows[0]!.created_at);
  const journal = JSON.parse(await readFile(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number; tag: string }[] };
  return journal.entries.find((e) => e.when === when)?.tag ?? String(when);
}

/** Spec §6.2 "check afterwards": one line per difference. */
export function compareCounts(expected: Record<string, number>, actual: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [t, n] of Object.entries(expected)) {
    if (!(t in actual)) out.push(`${t}: missing after restore (expected ${n})`);
    else if (actual[t] !== n) out.push(`${t}: expected ${n}, got ${actual[t]}`);
  }
  for (const [t, n] of Object.entries(actual)) if (!(t in expected)) out.push(`${t}: not in the snapshot (${n} rows)`);
  return out;
}
```

`packages/demo/src/snapshot/zip.ts`:

```ts
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { unzipSync, zipSync } from 'fflate';

/** Relative POSIX paths of every file under `dir` (empty for a missing directory). */
export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string, prefix: string) => {
    let names: string[];
    try {
      names = await readdir(d);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(d, name);
      if ((await stat(p)).isDirectory()) await walk(p, `${prefix}${name}/`);
      else out.push(`${prefix}${name}`);
    }
  };
  await walk(dir, '');
  return out;
}

/** Spec §6.1 step 3. Evidence directories are small (≈1 MB today), so an in-memory zip is fine. */
export async function zipDirectory(dir: string, outFile: string): Promise<{ files: number; bytes: number }> {
  const files = await listFiles(dir);
  const entries: Record<string, Uint8Array> = {};
  let bytes = 0;
  for (const f of files) {
    const body = new Uint8Array(await readFile(join(dir, ...f.split('/'))));
    entries[f] = body;
    bytes += body.byteLength;
  }
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, zipSync(entries, { level: 6 }));
  return { files: files.length, bytes };
}

export async function unzipTo(zipFile: string, dir: string): Promise<number> {
  const entries = unzipSync(new Uint8Array(await readFile(zipFile)));
  const root = resolve(dir);
  let n = 0;
  for (const [name, body] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const target = resolve(root, ...name.split('/'));
    if (!target.startsWith(root + sep)) throw new Error(`Unsafe path in evidence zip: ${name}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    n++;
  }
  return n;
}
```

`packages/demo/src/snapshot/snapshot.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertDatabase } from '@cs/db';
import postgres from 'postgres';
import { lastMigration, type SnapshotManifest, stampOf, tableCounts } from './manifest';
import { clientMajor, pgEnv, pgToolPath, runPg, serverMajor, versionProblem } from './pg-tools';
import { zipDirectory } from './zip';

export interface SnapshotOptions {
  ownerUrl: string;
  /** The exact database name being dumped (cs_dev for `db:snapshot`). */
  expected: string;
  evidenceDir: string;
  backupsDir: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  /** Folder suffix, e.g. 'pre-restore'. */
  label?: string;
  log?: (line: string) => void;
}

/** Spec §6.1. Never prints or stores the connection URL or password. */
export async function takeSnapshot(o: SnapshotOptions): Promise<{ folder: string; manifest: SnapshotManifest }> {
  assertDatabase(o.ownerUrl, o.expected);
  const env = o.env ?? process.env;
  const log = o.log ?? (() => {});
  const now = o.now ?? new Date();
  const sql = postgres(o.ownerUrl, { max: 1, onnotice: () => {} });
  try {
    const server = await serverMajor(sql);
    const problem = versionProblem('pg_dump', await clientMajor('pg_dump', env), server.major);
    if (problem) throw new Error(problem);
    const folder = join(o.backupsDir, `${stampOf(now)}-${o.expected}${o.label ? `-${o.label}` : ''}`);
    await mkdir(folder, { recursive: true });
    log(`[snapshot] dumping ${o.expected}…`);
    const dump = await runPg(pgToolPath('pg_dump', env), ['-Fc', '-f', join(folder, 'db.dump')], pgEnv(o.ownerUrl));
    if (dump.code !== 0) throw new Error(`pg_dump failed: ${dump.stderr.trim()}`);
    log('[snapshot] zipping evidence…');
    const evidence = await zipDirectory(o.evidenceDir, join(folder, 'evidence.zip'));
    const manifest: SnapshotManifest = {
      version: 1, createdAt: now.toISOString(), sourceDatabase: o.expected, serverVersion: server.version,
      lastMigration: await lastMigration(sql), tables: await tableCounts(sql), evidence,
    };
    await writeFile(join(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { folder, manifest };
  } finally {
    await sql.end();
  }
}
```

  `pg_dump`'s stderr comes from libpq. It names the host and user but never the password, because the password travels only in `PGPASSWORD`.

`packages/demo/src/cli/snapshot.ts`:

```ts
import { join } from 'node:path';
import { DEV_DATABASE, resolveEnvironment } from '@cs/db';
import { takeSnapshot } from '../snapshot/snapshot';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
try {
  const dev = resolveEnvironment('dev', { repoRoot: repoRoot() });
  const { folder, manifest } = await takeSnapshot({ ownerUrl: dev.ownerUrl, expected: DEV_DATABASE, evidenceDir: dev.evidenceDir, backupsDir: join(repoRoot(), 'backups'), log: console.log });
  const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  console.log(`${rows} rows in ${Object.keys(manifest.tables).length} tables, ${manifest.evidence.files} evidence files.`);
  console.log(`Snapshot written to ${folder}`);
} catch (e) {
  console.error(`[snapshot] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
```

- [ ] **Step 5: Wire the scripts and the env pass-through.**
  - `packages/demo/package.json` `scripts`: `"snapshot": "tsx src/cli/snapshot.ts"`.
  - Root `package.json` `scripts`: `"db:snapshot": "pnpm --filter @cs/demo snapshot"`.
  - `turbo.json` `globalPassThroughEnv`: append `"PG_BIN"`, so the Task 17 round-trip test can see portable binaries under `turbo run test`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @cs/demo exec vitest run src/snapshot` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 7: Try a real snapshot**

Run: `pnpm db:snapshot` (timeout 600000).
- With the machine's PostgreSQL 17 client against Neon 18, the expected result is the clear version message (`pg_dump 17 is older than the server (PostgreSQL 18)…`) and exit code 1. That is a pass for this step.
- If the owner has set `PG_BIN` to PostgreSQL 18 binaries: a folder `backups/<stamp>-cs_dev/` with `db.dump`, `evidence.zip` and `manifest.json`. Open `manifest.json` and confirm it holds no URL, host or password.

- [ ] **Step 8: Commit**

```bash
git add packages/demo/src/snapshot packages/demo/src/cli/snapshot.ts packages/demo/package.json package.json turbo.json pnpm-lock.yaml
git commit -m "feat(demo): db:snapshot with a client version check, zip and manifest"
```

---

### Task 17: `db:restore`

**Files:**
- Create: `packages/demo/src/snapshot/restore.ts`, `packages/demo/src/snapshot/restore.test.ts`, `packages/demo/src/snapshot/roundtrip.test.ts`, `packages/demo/src/cli/restore.ts`
- Modify: `packages/demo/package.json` (script `restore`), root `package.json` (`db:restore`)

**Interfaces:**
- Consumes:
  - Task 16's modules;
  - `wipeDatabase`, `ensureDatabase`, `databaseExists`, `dropScratchDatabase`, `withDatabase`, `resolveEnvironment`, `databaseNameOf` (`@cs/db`).
- Produces:
  - `parseRestoreArgs(argv): { folder: string; into?: string }`;
  - `restoreTargetName(into, now): string` refuses `cs_test` and any `*_test`;
  - `confirmOverwrite(target, typed): void`;
  - `interface RestoreDeps { exists; versions; snapshot; moveAside; wipe; create; pgRestore; unzip; counts }`, `realRestoreDeps()`;
  - `restoreSnapshot(o: { folder; into?; maintenanceUrl; repoRoot; env?; now?; prompt: (q: string) => Promise<string>; log?; deps?: Partial<RestoreDeps> }): Promise<{ target: string; differences: string[]; restoreErrors: boolean }>`.
- Safety order, all before anything destructive:
  1. read the manifest;
  2. check the target name;
  3. check the versions;
  4. if the target exists, prompt for its name;
  5. snapshot the target;
  6. move its evidence aside;
  7. wipe;
  8. restore.

- [ ] **Step 1: Write the failing tests.**

`packages/demo/src/snapshot/restore.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotManifest } from './manifest';
import { confirmOverwrite, parseRestoreArgs, type RestoreDeps, restoreSnapshot, restoreTargetName } from './restore';

const NOW = new Date('2026-10-09T14:03:22Z');
const manifest: SnapshotManifest = { version: 1, createdAt: NOW.toISOString(), sourceDatabase: 'cs_dev', serverVersion: '18.6', lastMigration: null, tables: { 'public.agency': 1 }, evidence: { files: 0, bytes: 0 } };
const ENV = { DATABASE_URL: 'postgresql://o:p@h.example/cs_dev', APP_DATABASE_URL: 'postgresql://a:p@h.example/cs_dev', SERVICE_DATABASE_URL: 'postgresql://s:p@h.example/cs_dev' } as unknown as NodeJS.ProcessEnv;
let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'restore-'));
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(folder, 'db.dump'), 'x');
  writeFileSync(join(folder, 'evidence.zip'), 'x');
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

function fakeDeps(exists: boolean): { deps: RestoreDeps; calls: string[] } {
  const calls: string[] = [];
  const step = (name: string) => vi.fn(async () => { calls.push(name); });
  return {
    calls,
    deps: {
      exists: vi.fn(async () => exists),
      versions: step('versions'),
      snapshot: step('snapshot'),
      moveAside: step('moveAside'),
      wipe: step('wipe'),
      create: step('create'),
      pgRestore: vi.fn(async () => { calls.push('pgRestore'); return { code: 0, stderr: '' }; }),
      unzip: vi.fn(async () => { calls.push('unzip'); return 0; }),
      counts: vi.fn(async () => ({ 'public.agency': 1 })),
    },
  };
}

const base = () => ({ folder, maintenanceUrl: ENV.DATABASE_URL!, repoRoot: folder, env: ENV, now: NOW, log: () => {} });

describe('restore target (spec §6.2)', () => {
  it('defaults to a new cs_dev_restore_<timestamp> database', () => {
    expect(restoreTargetName(undefined, NOW)).toBe('cs_dev_restore_20261009_140322');
  });

  it('never restores into cs_test or any *_test database', () => {
    expect(() => restoreTargetName('cs_test', NOW)).toThrow(/never a restore target/);
    expect(() => restoreTargetName('other_test', NOW)).toThrow(/never a restore target/);
  });

  it('parses the folder and --into', () => {
    expect(parseRestoreArgs(['backups/x', '--into', 'cs_dev'])).toEqual({ folder: 'backups/x', into: 'cs_dev' });
    expect(parseRestoreArgs(['backups/x'])).toEqual({ folder: 'backups/x' });
    expect(() => parseRestoreArgs([])).toThrow(/Usage/);
  });
});

describe('restoreSnapshot (Review Focus 5)', () => {
  it('refuses cs_test before touching anything', async () => {
    const { deps, calls } = fakeDeps(true);
    await expect(restoreSnapshot({ ...base(), into: 'cs_test', prompt: async () => 'cs_test', deps })).rejects.toThrow(/never a restore target/);
    expect(calls).toEqual([]);
  });

  it('refuses to overwrite without a matching typed name, and changes nothing', async () => {
    const { deps, calls } = fakeDeps(true);
    await expect(restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_de', deps })).rejects.toThrow(/does not match/);
    expect(calls).toEqual(['versions']);
    expect(() => confirmOverwrite('cs_dev', ' cs_dev ')).not.toThrow();
  });

  it('overwrites only after a fresh snapshot and moving evidence aside, in that order', async () => {
    const { deps, calls } = fakeDeps(true);
    const r = await restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps });
    expect(calls).toEqual(['versions', 'snapshot', 'moveAside', 'wipe', 'pgRestore', 'unzip']);
    expect(r).toEqual({ target: 'cs_dev', differences: [], restoreErrors: false });
  });

  it('creates a new database by default, with no prompt and no snapshot', async () => {
    const { deps, calls } = fakeDeps(false);
    const prompt = vi.fn(async () => '');
    const r = await restoreSnapshot({ ...base(), prompt, deps });
    expect(r.target).toBe('cs_dev_restore_20261009_140322');
    expect(calls).toEqual(['versions', 'create', 'pgRestore', 'unzip']);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('reports row-count differences', async () => {
    const { deps } = fakeDeps(false);
    deps.counts = vi.fn(async () => ({ 'public.agency': 0 }));
    expect((await restoreSnapshot({ ...base(), prompt: async () => '', deps })).differences).toEqual(['public.agency: expected 1, got 0']);
  });
});
```

`packages/demo/src/snapshot/roundtrip.test.ts` (the spec §8 round trip, skipped with a printed reason when no matching `pg_dump` is available):

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseNameOf, dropScratchDatabase } from '@cs/db';
import { openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { stampOf } from './manifest';
import { clientMajor, serverMajor, versionProblem } from './pg-tools';
import { restoreSnapshot } from './restore';
import { takeSnapshot } from './snapshot';

async function roundTripProblem(): Promise<string | null> {
  const sql = postgres(testUrls.owner, { max: 1, onnotice: () => {} });
  try {
    const { major } = await serverMajor(sql);
    return versionProblem('pg_dump', await clientMajor('pg_dump'), major) ?? versionProblem('pg_restore', await clientMajor('pg_restore'), major);
  } finally {
    await sql.end();
  }
}

const problem = await roundTripProblem();
if (problem) console.log(`[skip] snapshot round trip: ${problem}`);
const scratch = `cs_roundtrip_${stampOf(new Date()).replace('-', '_')}`;
const root = mkdtempSync(join(tmpdir(), 'roundtrip-'));
afterAll(async () => {
  if (!problem) await dropScratchDatabase(testUrls.owner, scratch).catch(() => {});
  rmSync(root, { recursive: true, force: true });
});

describe('snapshot round trip (spec §8)', () => {
  it.skipIf(problem !== null)('dumps cs_test, restores it into a scratch database and matches every row count', async () => {
    const dbs = openTestDbs();
    try {
      await truncateAll(dbs.owner);
      await seedTenancy(dbs.owner);
    } finally {
      await dbs.closeAll();
    }
    const snap = await takeSnapshot({ ownerUrl: testUrls.owner, expected: databaseNameOf(testUrls.owner), evidenceDir: join(root, 'no-evidence'), backupsDir: join(root, 'backups') });
    const r = await restoreSnapshot({ folder: snap.folder, into: scratch, maintenanceUrl: testUrls.owner, repoRoot: root, prompt: async () => '', log: () => {} });
    expect(r.target).toBe(scratch);
    expect(r.differences).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/demo exec vitest run src/snapshot/restore.test.ts src/snapshot/roundtrip.test.ts` (timeout 600000)
Expected: FAIL — `./restore` does not exist.

- [ ] **Step 3: Create `packages/demo/src/snapshot/restore.ts`:**

```ts
import { readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { databaseExists, ensureDatabase, resolveEnvironment, wipeDatabase, withDatabase } from '@cs/db';
import postgres from 'postgres';
import { compareCounts, parseManifest, stampOf, tableCounts } from './manifest';
import { clientMajor, pgEnv, pgToolPath, runPg, serverMajor, versionProblem } from './pg-tools';
import { takeSnapshot } from './snapshot';
import { unzipTo } from './zip';

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const USAGE = 'Usage: pnpm db:restore <backup folder> [--into <database>]';

export function parseRestoreArgs(argv: string[]): { folder: string; into?: string } {
  const folder = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--into');
  const at = argv.indexOf('--into');
  const into = at >= 0 ? argv[at + 1] : undefined;
  if (!folder || (at >= 0 && !into)) throw new Error(USAGE);
  return into ? { folder, into } : { folder };
}

/** Spec §6.2: default target is a new `cs_dev_restore_<timestamp>`; a test database is never a target. */
export function restoreTargetName(into: string | undefined, now: Date): string {
  const target = into?.trim() || `cs_dev_restore_${stampOf(now).replace('-', '_')}`;
  if (target === 'cs_test' || target.endsWith('_test')) throw new Error(`Refusing to restore into ${target}: a test database is never a restore target`);
  if (!IDENT.test(target)) throw new Error(`Invalid database name "${target}"`);
  return target;
}

export function confirmOverwrite(target: string, typed: string): void {
  if (typed.trim() !== target) throw new Error(`The typed name does not match ${target}; nothing was changed.`);
}

export interface RestoreDeps {
  exists(maintenanceUrl: string, name: string): Promise<boolean>;
  /** Throws the version message when pg_dump or pg_restore is older than the server. */
  versions(maintenanceUrl: string, env: NodeJS.ProcessEnv, needDump: boolean): Promise<void>;
  snapshot(o: Parameters<typeof takeSnapshot>[0]): Promise<unknown>;
  moveAside(dir: string, to: string): Promise<void>;
  wipe(targetUrl: string, target: string): Promise<void>;
  create(maintenanceUrl: string, target: string, roles: string[]): Promise<unknown>;
  pgRestore(targetUrl: string, dump: string, env: NodeJS.ProcessEnv): Promise<{ code: number; stderr: string }>;
  unzip(zipFile: string, dir: string): Promise<number>;
  counts(targetUrl: string): Promise<Record<string, number>>;
}

const exists = async (p: string) => stat(p).then(() => true, () => false);

export function realRestoreDeps(): RestoreDeps {
  return {
    exists: databaseExists,
    async versions(maintenanceUrl, env, needDump) {
      const sql = postgres(maintenanceUrl, { max: 1, onnotice: () => {} });
      try {
        const { major } = await serverMajor(sql);
        const problem = versionProblem('pg_restore', await clientMajor('pg_restore', env), major) ?? (needDump ? versionProblem('pg_dump', await clientMajor('pg_dump', env), major) : null);
        if (problem) throw new Error(problem);
      } finally {
        await sql.end();
      }
    },
    snapshot: takeSnapshot,
    async moveAside(dir, to) {
      if (await exists(dir)) await rename(dir, to);
    },
    wipe: wipeDatabase,
    create: ensureDatabase,
    async pgRestore(targetUrl, dump, env) {
      const r = await runPg(pgToolPath('pg_restore', env), ['--clean', '--if-exists', '--no-owner', '-d', pgEnv(targetUrl).PGDATABASE!, dump], pgEnv(targetUrl));
      return { code: r.code, stderr: r.stderr };
    },
    unzip: unzipTo,
    async counts(targetUrl) {
      const sql = postgres(targetUrl, { max: 1, onnotice: () => {} });
      try {
        return await tableCounts(sql);
      } finally {
        await sql.end();
      }
    },
  };
}

export interface RestoreOptions {
  folder: string;
  into?: string;
  /** Owner URL of any database on the server (cs_dev for the CLI, cs_test for the round-trip test). */
  maintenanceUrl: string;
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  prompt: (question: string) => Promise<string>;
  log?: (line: string) => void;
  deps?: Partial<RestoreDeps>;
}

/** Spec §6.2. Every check runs before anything destructive (Review Focus 5). */
export async function restoreSnapshot(o: RestoreOptions): Promise<{ target: string; differences: string[]; restoreErrors: boolean }> {
  const d = { ...realRestoreDeps(), ...o.deps };
  const env = o.env ?? process.env;
  const log = o.log ?? console.log;
  const now = o.now ?? new Date();
  const stamp = stampOf(now);
  const manifest = parseManifest(JSON.parse(await readFile(join(o.folder, 'manifest.json'), 'utf8')));
  const dump = join(o.folder, 'db.dump');
  await stat(dump);
  const target = restoreTargetName(o.into, now);
  const targetUrl = withDatabase(o.maintenanceUrl, target);
  const overwrite = await d.exists(o.maintenanceUrl, target);
  await d.versions(o.maintenanceUrl, env, overwrite);

  const known: Record<string, 'dev' | 'demo'> = { cs_dev: 'dev', cs_demo: 'demo' };
  const evidenceDir = overwrite && known[target]
    ? resolveEnvironment(known[target]!, { repoRoot: o.repoRoot, env }).evidenceDir
    : join(o.repoRoot, 'apps', 'worker', `.evidence-restore-${stamp}`);

  if (overwrite) {
    confirmOverwrite(target, await o.prompt(`${target} already exists and will be overwritten. Type its name to continue: `));
    log(`[restore] taking a fresh snapshot of ${target} first…`);
    await d.snapshot({ ownerUrl: targetUrl, expected: target, evidenceDir, backupsDir: join(o.repoRoot, 'backups'), now, env, label: 'pre-restore', log });
    const aside = `${evidenceDir}-aside-${stamp}`;
    await d.moveAside(evidenceDir, aside);
    log(`[restore] existing evidence (if any) moved to ${aside}`);
    await d.wipe(targetUrl, target);
  } else {
    const roles = [env.APP_DATABASE_URL, env.SERVICE_DATABASE_URL].filter((u): u is string => !!u).map((u) => decodeURIComponent(new URL(u).username));
    log(`[restore] creating ${target}…`);
    await d.create(o.maintenanceUrl, target, roles);
  }

  log(`[restore] restoring ${manifest.sourceDatabase} (${manifest.createdAt}) into ${target}…`);
  const r = await d.pgRestore(targetUrl, dump, env);
  if (r.code !== 0) log(`[restore] pg_restore reported problems:\n${r.stderr.trim()}`);
  const files = await d.unzip(join(o.folder, 'evidence.zip'), evidenceDir);
  log(`[restore] ${files} evidence files written to ${evidenceDir}`);
  const differences = compareCounts(manifest.tables, await d.counts(targetUrl));
  log(differences.length ? `[restore] row counts differ:\n  ${differences.join('\n  ')}` : '[restore] row counts match the manifest');
  return { target, differences, restoreErrors: r.code !== 0 };
}
```

  The version check runs after the existence check, because only an overwrite needs `pg_dump`. It still comes before the prompt and before every destructive step, which is the order the test pins.

`packages/demo/src/cli/restore.ts`:

```ts
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { resolveEnvironment } from '@cs/db';
import { parseRestoreArgs, restoreSnapshot } from '../snapshot/restore';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const args = parseRestoreArgs(process.argv.slice(2));
  // pnpm runs this from packages/demo; INIT_CWD is where the owner typed the command.
  const folder = resolve(process.env.INIT_CWD ?? process.cwd(), args.folder);
  const dev = resolveEnvironment('dev', { repoRoot: repoRoot() });
  const r = await restoreSnapshot({ folder, into: args.into, maintenanceUrl: dev.ownerUrl, repoRoot: repoRoot(), prompt: (q) => rl.question(q) });
  console.log(`Restored into ${r.target}.`);
  if (r.differences.length || r.restoreErrors) process.exitCode = 1;
} catch (e) {
  console.error(`[restore] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
```

- [ ] **Step 4: Wire the scripts.**
  - `packages/demo/package.json` `scripts`: `"restore": "tsx src/cli/restore.ts"`.
  - Root `package.json` `scripts`: `"db:restore": "pnpm --filter @cs/demo restore"`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @cs/demo exec vitest run src/snapshot` (timeout 600000)
Expected: PASS.
- On this machine (PostgreSQL 17 client, Neon 18), `roundtrip.test.ts` prints `[skip] snapshot round trip: pg_dump 17 is older…` and is skipped.
- With `PG_BIN` set to 18+ binaries, it runs. It needs Neon to accept `CREATE DATABASE`.

Then `pnpm --filter @cs/demo typecheck`: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/demo/src/snapshot/restore.ts packages/demo/src/snapshot/restore.test.ts packages/demo/src/snapshot/roundtrip.test.ts packages/demo/src/cli/restore.ts packages/demo/package.json package.json
git commit -m "feat(demo): db:restore into a new database, or over one only after a typed confirmation"
```

---

### Task 18: The banner, the panel and its routes

**Files:**
- Create:
  - `apps/web/src/dev-panel/handler.ts` + `handler.test.ts`;
  - `apps/web/src/dev-panel/sign-in.ts` + `sign-in.test.ts`;
  - `apps/web/src/dev-panel/spawn-lines.ts` + `spawn-lines.test.ts`;
  - `apps/web/src/dev-panel/handlers.ts`, `apps/web/src/dev-panel/banner.tsx` + `banner.test.tsx`, `apps/web/src/dev-panel/mount.tsx`;
  - `apps/web/src/app/dev-panel/[...path]/route.ts`;
  - `apps/web/scripts/dev.ts`, `apps/web/scripts/dev-args.ts` + `dev-args.test.ts`.
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/src/proxy.ts`, `apps/web/package.json` (scripts), root `package.json` (`dev`, `demo:dev`).

**Interfaces:**
- Consumes:
  - `requestGuardOn`, `isLocalHost`, `activeEnvName`, `devEnvFile`, `writeDevEnv`, `webRepoRoot` (Task 13);
  - `clearEnvCaches`, `dbs`, `auth` (Task 14); `devHooks` (Task 15); `demoSignInLinks`, `isDemoEmail` (Task 3);
  - `verifyLink`, `isUuid` (`@cs/core`); `GUEST_COOKIE` (`@/server/guest`); `MEMBERSHIP_COOKIE` (`@/server/viewer`);
  - the `pnpm demo:reset` and `db:snapshot` commands (Tasks 12, 16).
- Produces:
  - `PANEL_HEADER = 'x-rm-dev-panel'`, `interface PanelLink`, `interface PanelDeps`, `createPanelHandler(deps): (method, req, path) => Promise<Response>`;
  - `devSignIn(deps: SignInDeps, req, token): Promise<Response>`;
  - `spawnLines(cmd, args, cwd): AsyncGenerator<string>`, whose last line is `exit <code>`;
  - `handleDevPanel`, the wired handler;
  - `DevBanner({ env })`, `devBanner(): Promise<React.ReactNode>`;
  - `parseDevArgs(argv): { env: EnvName | null; rest: string[] }`.
- Routes, all under the guard (404 otherwise):

  | Route | What it does |
  |---|---|
  | `GET /dev-panel/sign-in/<token>` | Signs in a demo user |
  | `GET /dev-panel/api/state` | `{ env, resetting }` |
  | `GET /dev-panel/api/links` | `{ env, links }` |
  | `POST /dev-panel/api/switch` | Body `{ env }`; returns `{ env, links }` and clears session cookies |
  | `POST /dev-panel/api/reset` | DEMO only; a `text/plain` stream of progress lines |
  | `POST /dev-panel/api/snapshot` | DEV only; `{ ok, folder, output }` |

  Every POST needs `x-rm-dev-panel: 1`, and its `Origin`, if present, must be local.

- [ ] **Step 1: Write the failing tests.**

`apps/web/src/dev-panel/handler.test.ts`:

```ts
import type { EnvName } from '@cs/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPanelHandler, type PanelDeps } from './handler';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEV_PANEL', '1');
});
afterEach(() => vi.unstubAllEnvs());

function setup(env: EnvName = 'dev') {
  let current = env;
  // Resets wait at this gate until the test opens it; once open it stays open, so later resets finish at once.
  let open!: () => void;
  const gate = new Promise<void>((r) => {
    open = r;
  });
  const deps: PanelDeps = {
    env: () => current,
    setEnv: vi.fn(async (n: EnvName) => { current = n; }),
    clearCaches: vi.fn(async () => {}),
    links: vi.fn(async (n: EnvName, origin: string) => [{ label: `${n} link`, url: `${origin}/x` }]),
    run: vi.fn(async function* (cmd: 'reset' | 'snapshot') {
      yield `${cmd} started`;
      if (cmd === 'reset') await gate;
      if (cmd === 'snapshot') yield 'Snapshot written to C:\\repo\\backups\\20261009-140322-cs_dev';
      yield 'exit 0';
    }),
    signIn: vi.fn(async () => new Response(null, { status: 303, headers: { location: '/' } })),
  };
  return { deps, handle: createPanelHandler(deps), release: () => open() };
}

const req = (method: 'GET' | 'POST', path: string, o: { host?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  new Request(`http://${o.host ?? 'localhost:3000'}${path}`, {
    method, headers: { host: o.host ?? 'localhost:3000', ...(method === 'POST' ? { 'x-rm-dev-panel': '1', 'content-type': 'application/json' } : {}), ...o.headers },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });

describe('guard (spec §5.3, Review Focus 2)', () => {
  it('404s every route when any condition fails', async () => {
    const { handle } = setup();
    for (const [k, v] of [['NODE_ENV', 'production'], ['DEV_PANEL', '0']] as const) {
      vi.stubEnv(k, v);
      expect((await handle('GET', req('GET', '/dev-panel/api/state'), ['api', 'state'])).status).toBe(404);
      expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'demo' } }), ['api', 'switch'])).status).toBe(404);
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DEV_PANEL', '1');
    }
    expect((await handle('GET', req('GET', '/dev-panel/api/state', { host: '192.168.1.5:3000' }), ['api', 'state'])).status).toBe(404);
    expect((await handle('GET', req('GET', '/dev-panel/sign-in/t', { host: 'evil.example' }), ['sign-in', 't'])).status).toBe(404);
  });

  it('404s a POST without the panel header or from a foreign origin', async () => {
    const { handle, deps } = setup();
    const noHeader = new Request('http://localhost:3000/dev-panel/api/switch', { method: 'POST', headers: { host: 'localhost:3000' }, body: '{"env":"demo"}' });
    expect((await handle('POST', noHeader, ['api', 'switch'])).status).toBe(404);
    expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'demo' }, headers: { origin: 'https://evil.example' } }), ['api', 'switch'])).status).toBe(404);
    expect(deps.setEnv).not.toHaveBeenCalled();
  });
});

describe('actions (spec §5.2)', () => {
  it('switch writes the environment, clears caches, signs out and returns the new links', async () => {
    const { handle, deps } = setup();
    const r = req('POST', '/dev-panel/api/switch', { body: { env: 'demo' }, headers: { cookie: 'better-auth.session_token=abc; rm_guest=g; theme=x' } });
    const res = await handle('POST', r, ['api', 'switch']);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ env: 'demo', links: [{ label: 'demo link', url: 'http://localhost:3000/x' }] });
    expect(deps.setEnv).toHaveBeenCalledWith('demo');
    expect(deps.clearCaches).toHaveBeenCalled();
    const cleared = res.headers.getSetCookie().map((c) => c.split('=')[0]);
    expect(cleared.sort()).toEqual(['better-auth.session_token', 'rm_guest']);
  });

  it('refuses an unknown environment', async () => {
    const { handle } = setup();
    expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'prod' } }), ['api', 'switch'])).status).toBe(400);
  });

  it('resets only in DEMO, streams the lines, and refuses a second reset while one runs', async () => {
    const dev = setup('dev');
    expect((await dev.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset'])).status).toBe(409);
    const demo = setup('demo');
    const first = await demo.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    expect(first.status).toBe(200);
    const second = await demo.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'A reset is already running' });
    demo.release();
    expect(await first.text()).toBe('reset started\nexit 0\n');
    expect(demo.deps.clearCaches).toHaveBeenCalled();
    const again = await demo.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    expect(again.status).toBe(200);
    expect(await again.text()).toBe('reset started\nexit 0\n');
  });

  it('takes a snapshot only in DEV and reports the folder', async () => {
    expect((await setup('demo').handle('POST', req('POST', '/dev-panel/api/snapshot'), ['api', 'snapshot'])).status).toBe(409);
    const res = await setup('dev').handle('POST', req('POST', '/dev-panel/api/snapshot'), ['api', 'snapshot']);
    expect(await res.json()).toMatchObject({ ok: true, folder: 'C:\\repo\\backups\\20261009-140322-cs_dev' });
  });

  it('hands sign-in links to the sign-in flow and 404s unknown paths', async () => {
    const { handle, deps } = setup('demo');
    expect((await handle('GET', req('GET', '/dev-panel/sign-in/tok'), ['sign-in', 'tok'])).status).toBe(303);
    expect(deps.signIn).toHaveBeenCalledWith(expect.any(Request), 'tok');
    expect((await handle('GET', req('GET', '/dev-panel/api/nope'), ['api', 'nope'])).status).toBe(404);
    expect((await handle('GET', req('GET', '/dev-panel/x/y/z'), ['x', 'y', 'z'])).status).toBe(404);
  });
});
```

`apps/web/src/dev-panel/sign-in.test.ts`:

```ts
import { signLink } from '@cs/core';
import type { EnvName } from '@cs/db';
import { describe, expect, it, vi } from 'vitest';
import { devSignIn, type SignInDeps } from './sign-in';

const SECRET = 's'.repeat(40);
const CONTACT = '11111111-1111-4111-8111-111111111111';
const token = signLink(SECRET, { sub: CONTACT, agency: CONTACT, client: CONTACT, t: 'notifications', id: CONTACT });

function deps(o: { env?: EnvName; contact?: { email: string; userId: string | null; active: boolean } | null; url?: string | null } = {}): SignInDeps {
  return {
    env: () => o.env ?? 'demo',
    secrets: () => [SECRET],
    findContact: vi.fn(async () => (o.contact === undefined ? { email: 'admin@demo.rivalmonday.test', userId: 'u1', active: true } : o.contact)),
    startMagicLink: vi.fn(async () => (o.url === undefined ? 'http://localhost:3000/api/auth/magic-link/verify?token=t&callbackURL=%2F' : o.url)),
  };
}
const get = () => new Request('http://localhost:3000/dev-panel/sign-in/x', { headers: { host: 'localhost:3000' } });
const where = (r: Response) => [r.status, r.headers.get('location')];

describe('devSignIn (Review Focus 3)', () => {
  it('starts a session for an active demo user through the magic-link API', async () => {
    const d = deps();
    expect(where(await devSignIn(d, get(), token))).toEqual([303, 'http://localhost:3000/api/auth/magic-link/verify?token=t&callbackURL=%2F']);
    expect(d.startMagicLink).toHaveBeenCalledWith('admin@demo.rivalmonday.test', expect.any(Request));
  });

  it.each([
    ['DEV is live', deps({ env: 'dev' }), token],
    ['a tampered token', deps(), `${token}x`],
    ['a non-demo contact', deps({ contact: { email: 'owner@nofingers.ai', userId: 'u', active: true } }), token],
    ['an inactive contact', deps({ contact: { email: 'admin@demo.rivalmonday.test', userId: 'u', active: false } }), token],
    ['a contact without a user', deps({ contact: { email: 'admin@demo.rivalmonday.test', userId: null, active: true } }), token],
    ['an unknown contact', deps({ contact: null }), token],
    ['no link captured', deps({ url: null }), token],
  ])('sends %s to /link-expired', async (_label, d, t) => {
    expect(where(await devSignIn(d, get(), t))).toEqual([303, 'http://localhost:3000/link-expired']);
  });
});
```

`apps/web/src/dev-panel/spawn-lines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnLines } from './spawn-lines';

describe('spawnLines', () => {
  it('yields stdout and stderr lines, then the exit code', async () => {
    const lines: string[] = [];
    for await (const l of spawnLines('node', ['-e', '"console.log(1);console.error(2);process.exit(3)"'], process.cwd())) lines.push(l);
    expect(lines.slice(0, -1).sort()).toEqual(['1', '2']);
    expect(lines.at(-1)).toBe('exit 3');
  });
});
```

`apps/web/src/dev-panel/banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { DevBanner } = await import('./banner');

afterEach(() => vi.unstubAllGlobals());
const okJson = (body: unknown) => Promise.resolve({ ok: true, json: async () => body });

describe('DevBanner (spec §5.1)', () => {
  it.each([
    ['dev', 'DEV · real data'],
    ['demo', 'DEMO'],
    ['test', 'TEST · wiped by test runs'],
  ] as const)('labels %s', (env, label) => {
    render(<DevBanner env={env} />);
    const strip = screen.getByRole('button', { name: /open the dev panel/i });
    expect(strip.textContent).toBe(label);
    expect(strip.getAttribute('data-rm-dev-panel')).toBe(env);
  });

  it('offers reset only in DEMO and disables it while a reset is running', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url === '/dev-panel/api/links' ? okJson({ links: [] }) : new Promise(() => {}))));
    render(<DevBanner env="demo" />);
    fireEvent.click(screen.getByRole('button', { name: /open the dev panel/i }));
    const reset = (await screen.findByRole('button', { name: 'Reset demo data' })) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    await waitFor(() => expect(reset.disabled).toBe(true));
    expect(screen.queryByRole('button', { name: 'Take snapshot' })).toBeNull();
  });

  it('offers a snapshot in DEV and no reset', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okJson({ links: [{ label: 'Sign-in page', url: '/sign-in' }] })));
    render(<DevBanner env="dev" />);
    fireEvent.click(screen.getByRole('button', { name: /open the dev panel/i }));
    expect(await screen.findByRole('button', { name: 'Take snapshot' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset demo data' })).toBeNull();
    expect(await screen.findByRole('link', { name: 'Sign-in page' })).toBeTruthy();
  });
});
```

`apps/web/scripts/dev-args.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDevArgs } from './dev-args';

describe('parseDevArgs', () => {
  it('takes --env and passes everything else to next dev', () => {
    expect(parseDevArgs(['--env', 'demo', '--port', '3200'])).toEqual({ env: 'demo', rest: ['--port', '3200'] });
    expect(parseDevArgs([])).toEqual({ env: null, rest: [] });
    expect(() => parseDevArgs(['--env', 'prod'])).toThrow(/dev, demo or test/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/web exec vitest run src/dev-panel scripts/dev-args.test.ts` (timeout 600000)
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Implement the server side of the panel.**

`apps/web/src/dev-panel/handler.ts`:

```ts
import { type EnvName, isEnvName } from '@cs/db';
import { isLocalHost, requestGuardOn } from '@/server/dev-guard';
import { GUEST_COOKIE } from '@/server/guest';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

/** Required on every panel POST (forces a CORS preflight a foreign page cannot pass) and set on every panel response. */
export const PANEL_HEADER = 'x-rm-dev-panel';

export interface PanelLink {
  label: string;
  email?: string;
  url: string;
}

export interface PanelDeps {
  env(): EnvName;
  setEnv(name: EnvName): Promise<void>;
  clearCaches(): Promise<void>;
  links(name: EnvName, origin: string): Promise<PanelLink[]>;
  /** Progress lines of a child process; the last line is `exit <code>`. */
  run(command: 'reset' | 'snapshot'): AsyncIterable<string>;
  signIn(req: Request, token: string): Promise<Response>;
}

const notFound = () => new Response('Not found', { status: 404 });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', [PANEL_HEADER]: 'handler' } });
const AUTH_COOKIE = /^(__Secure-)?better-auth\./;

function localPost(req: Request): boolean {
  if (req.headers.get(PANEL_HEADER) !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return isLocalHost(new URL(origin).host);
  } catch {
    return false;
  }
}

/** Spec §5.2 switch step 3: end every session (Better Auth, email-link guest, membership pick). */
function clearSessionCookies(req: Request, res: Response): void {
  const names = (req.headers.get('cookie') ?? '').split(';').map((c) => c.split('=')[0]!.trim()).filter(Boolean);
  for (const n of names) {
    if (AUTH_COOKIE.test(n) || n === GUEST_COOKIE || n === MEMBERSHIP_COOKIE) res.headers.append('set-cookie', `${n}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }
}

/** Spec §5.2/§5.3: every route re-checks all three guard conditions and answers 404 when any fails. */
export function createPanelHandler(deps: PanelDeps) {
  let resetting = false;
  return async function handle(method: 'GET' | 'POST', req: Request, path: string[]): Promise<Response> {
    if (!requestGuardOn(req.headers.get('host'))) return notFound();
    const [head, ...rest] = path;
    if (method === 'GET' && head === 'sign-in' && rest.length === 1) return deps.signIn(req, rest[0]!);
    if (head !== 'api' || rest.length !== 1) return notFound();
    if (method === 'POST' && !localPost(req)) return notFound();
    const origin = new URL(req.url).origin;
    switch (`${method} ${rest[0]}`) {
      case 'GET state':
        return json({ env: deps.env(), resetting });
      case 'GET links': {
        const env = deps.env();
        return json({ env, links: await deps.links(env, origin) });
      }
      case 'POST switch': {
        const body = (await req.json().catch(() => null)) as { env?: unknown } | null;
        if (!isEnvName(body?.env)) return json({ error: 'Unknown environment' }, 400);
        if (resetting) return json({ error: 'A reset is running; switch when it finishes' }, 409);
        await deps.setEnv(body.env);
        await deps.clearCaches();
        const res = json({ env: body.env, links: await deps.links(body.env, origin) });
        clearSessionCookies(req, res);
        return res;
      }
      case 'POST reset': {
        if (deps.env() !== 'demo') return json({ error: 'Reset is only available while DEMO is live' }, 409);
        if (resetting) return json({ error: 'A reset is already running' }, 409);
        resetting = true;
        const lines = deps.run('reset');
        const enc = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const line of lines) controller.enqueue(enc.encode(`${line}\n`));
            } catch (e) {
              controller.enqueue(enc.encode(`error ${e instanceof Error ? e.message : String(e)}\n`));
            } finally {
              resetting = false;
              await deps.clearCaches(); // the seed replaced every table: drop pooled connections and prepared statements
              controller.close();
            }
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', [PANEL_HEADER]: 'handler' } });
      }
      case 'POST snapshot': {
        if (deps.env() !== 'dev') return json({ error: 'Snapshots are taken of DEV only' }, 409);
        const output: string[] = [];
        for await (const line of deps.run('snapshot')) output.push(line);
        const folder = output.map((l) => /^Snapshot written to (.+)$/.exec(l)?.[1]).find((f): f is string => !!f) ?? null;
        return json({ ok: output.at(-1) === 'exit 0', folder, output });
      }
      default:
        return notFound();
    }
  };
}
```

`apps/web/src/dev-panel/sign-in.ts`:

```ts
import { isUuid, verifyLink } from '@cs/core';
import type { EnvName } from '@cs/db';
import { isDemoEmail } from '@cs/demo/users';

export interface SignInDeps {
  env(): EnvName;
  secrets(): readonly string[];
  findContact(contactId: string): Promise<{ email: string; userId: string | null; active: boolean } | null>;
  /** Asks Better Auth for a sign-in link and returns its verify URL (captured in-process; nothing is emailed). */
  startMagicLink(email: string, req: Request): Promise<string | null>;
}

const redirect = (to: string) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

/** Deviation 4: a demo user's signed link starts a real session — never in DEV, never for anyone outside the demo domain. */
export async function devSignIn(deps: SignInDeps, req: Request, token: string): Promise<Response> {
  const origin = new URL(req.url).origin;
  const expired = () => redirect(`${origin}/link-expired`);
  if (deps.env() === 'dev') return expired();
  const claims = verifyLink(deps.secrets(), token);
  if (!claims || !isUuid(claims.sub)) return expired();
  const c = await deps.findContact(claims.sub);
  if (!c || !c.active || !c.userId || !isDemoEmail(c.email)) return expired();
  const url = await deps.startMagicLink(c.email.toLowerCase(), req);
  return url ? redirect(url) : expired();
}
```

`apps/web/src/dev-panel/spawn-lines.ts`:

```ts
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';

/**
 * Runs a fixed command line (never user input) through the shell (pnpm is a .cmd shim on Windows) and yields its
 * stdout and stderr lines, then `exit <code>`.
 */
export async function* spawnLines(cmd: string, args: string[], cwd: string): AsyncGenerator<string> {
  const child = spawn([cmd, ...args].join(' '), { cwd, env: process.env, shell: true, windowsHide: true });
  const merged = new PassThrough();
  let open = 2;
  const end = () => {
    if (--open === 0) merged.end();
  };
  child.stdout.on('end', end);
  child.stderr.on('end', end);
  child.stdout.pipe(merged, { end: false });
  child.stderr.pipe(merged, { end: false });
  const exit = new Promise<number>((done) => {
    child.on('error', (e) => {
      if (!merged.writableEnded) merged.end(`error ${e.message}\n`);
      done(1);
    });
    child.on('close', (code) => done(code ?? 1));
  });
  for await (const line of createInterface({ input: merged, crlfDelay: Infinity })) yield line;
  yield `exit ${await exit}`;
}
```

`apps/web/src/dev-panel/handlers.ts`:

```ts
import 'server-only';
import { contact } from '@cs/db';
import { demoSignInLinks } from '@cs/demo/links';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { activeEnvName, devEnvFile, webRepoRoot, writeDevEnv } from '@/server/dev-guard';
import { devHooks } from '@/server/dev-hooks';
import { webEnv } from '@/server/env';
import { clearEnvCaches } from '@/server/env-cache';
import { createPanelHandler } from './handler';
import { devSignIn } from './sign-in';
import { spawnLines } from './spawn-lines';

/** Sign-in URLs Better Auth builds for the dev sign-in route, keyed by email (deviation 4). */
const captured = new Map<string, string>();
devHooks.onMagicLink = (email, url) => {
  captured.set(email.toLowerCase(), url);
};

const COMMANDS = { reset: ['--filter', '@cs/demo', 'reset'], snapshot: ['--filter', '@cs/demo', 'snapshot'] } as const;

export const handleDevPanel = createPanelHandler({
  env: () => activeEnvName(),
  setEnv: (name) => writeDevEnv(devEnvFile(), name),
  clearCaches: clearEnvCaches,
  async links(name, origin) {
    if (name === 'dev') return [{ label: 'Sign-in page', url: `${origin}/sign-in` }];
    const links = await demoSignInLinks(dbs().service, { secret: webEnv().linkSecrets[0]!, baseUrl: origin });
    return links.map((l) => ({ label: l.label, email: l.email, url: l.url }));
  },
  run: (command) => spawnLines('pnpm', [...COMMANDS[command]], webRepoRoot()),
  signIn: (req, token) =>
    devSignIn({
      env: () => activeEnvName(),
      secrets: () => webEnv().linkSecrets,
      async findContact(id) {
        const [c] = await dbs().service.select({ email: contact.email, userId: contact.userId, active: contact.active }).from(contact).where(eq(contact.id, id));
        return c ?? null;
      },
      async startMagicLink(email, request) {
        captured.delete(email);
        await auth().api.signInMagicLink({ body: { email, callbackURL: '/' }, headers: request.headers });
        const url = captured.get(email) ?? null;
        captured.delete(email);
        return url;
      },
    }, req, token),
});
```

`apps/web/src/app/dev-panel/[...path]/route.ts`. It is a shell with no panel code; production builds keep only the 404:

```ts
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

async function dispatch(method: 'GET' | 'POST', req: Request, ctx: Ctx): Promise<Response> {
  // Spec §5.3: constant-folded to `false` in production builds, so the panel module is never bundled there.
  if (process.env.NODE_ENV !== 'production') {
    const { handleDevPanel } = await import('@/dev-panel/handlers');
    return handleDevPanel(method, req, (await ctx.params).path);
  }
  return new Response('Not found', { status: 404 });
}

export async function GET(req: Request, ctx: Ctx) {
  return dispatch('GET', req, ctx);
}

export async function POST(req: Request, ctx: Ctx) {
  return dispatch('POST', req, ctx);
}
```

`apps/web/src/proxy.ts`: add `/^\/dev-panel\//` to `PUBLIC`. The sign-in route must work without a session; every panel route enforces the guard itself.

- [ ] **Step 4: Implement the banner and mount it.**

`apps/web/src/dev-panel/banner.tsx`:

```tsx
'use client';

import { Button, cn, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type PanelEnv = 'dev' | 'demo' | 'test';
interface Link {
  label: string;
  email?: string;
  url: string;
}

/** Spec §5.1: fixed label and colour per database. */
const LOOK: Record<PanelEnv, { label: string; className: string }> = {
  dev: { label: 'DEV · real data', className: 'bg-[#F5A524] text-[#3B2300]' },
  demo: { label: 'DEMO', className: 'bg-[#2A6BAC] text-white' },
  test: { label: 'TEST · wiped by test runs', className: 'bg-[#6B7280] text-white' },
};
const POST = { method: 'POST', headers: { 'content-type': 'application/json', 'x-rm-dev-panel': '1' } } as const;

export function DevBanner({ env: initial }: { env: PanelEnv }) {
  const router = useRouter();
  const [env, setEnv] = useState<PanelEnv>(initial);
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'switch' | 'reset' | 'snapshot'>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadLinks = async () => {
    try {
      const r = await fetch('/dev-panel/api/links');
      setLinks(((await r.json()) as { links: Link[] }).links);
    } catch {
      setLinks([]);
    }
  };
  useEffect(() => {
    if (open) void loadLinks();
  }, [open, env]);

  async function switchTo(next: PanelEnv) {
    setBusy('switch');
    setMessage(null);
    try {
      const r = await fetch('/dev-panel/api/switch', { ...POST, body: JSON.stringify({ env: next }) });
      const body = (await r.json()) as { env?: PanelEnv; links?: Link[]; error?: string };
      if (!r.ok || !body.env) {
        setMessage(body.error ?? 'Switch failed');
        return;
      }
      setEnv(body.env);
      setLinks(body.links ?? []);
      setMessage(`Switched to ${body.env.toUpperCase()}. You are signed out; use a link below.`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy('reset');
    setLog([]);
    try {
      const r = await fetch('/dev-panel/api/reset', POST);
      if (!r.ok || !r.body) {
        setLog([((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Reset failed']);
        return;
      }
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        setLog((l) => [...l, ...parts]);
      }
      if (buffer) setLog((l) => [...l, buffer]);
      await loadLinks();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function snapshot() {
    setBusy('snapshot');
    setMessage(null);
    try {
      const r = await fetch('/dev-panel/api/snapshot', POST);
      const body = (await r.json()) as { ok?: boolean; folder?: string | null; output?: string[]; error?: string };
      setMessage(body.ok && body.folder ? `Snapshot written to ${body.folder}` : (body.error ?? body.output?.slice(-4).join('\n') ?? 'Snapshot failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        data-rm-dev-panel={env}
        aria-label={`Database: ${LOOK[env].label}. Open the dev panel`}
        className={cn('block w-full px-4 py-1 text-center text-xs font-bold tracking-wide', LOOK[env].className)}
      >
        {LOOK[env].label}
      </SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined} className="w-[380px] gap-5">
        <SheetTitle>Dev panel</SheetTitle>
        <section aria-label="Database" className="flex flex-col gap-2">
          <p className="text-sm">Live database: <strong>{env.toUpperCase()}</strong></p>
          <div className="flex flex-wrap gap-2">
            {(['dev', 'demo', 'test'] as const).map((n) => (
              <Button key={n} size="sm" variant={n === env ? 'default' : 'outline'} disabled={busy !== null || n === env} onClick={() => void switchTo(n)}>
                Switch to {n.toUpperCase()}
              </Button>
            ))}
          </div>
        </section>
        <section aria-label="Sign in" className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Sign in</h3>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-in links for this database{env === 'demo' ? ' yet. Reset the demo data first.' : '.'}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} className="font-semibold text-primary-soft-text">{l.label}</a>
                  {l.email && <span className="block text-xs text-muted-foreground">{l.email}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        {env === 'demo' && (
          <section aria-label="Demo data" className="flex flex-col gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => void reset()}>Reset demo data</Button>
            <pre data-testid="reset-log" className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted-surface p-2 text-xs">{log.join('\n')}</pre>
          </section>
        )}
        {env === 'dev' && (
          <section aria-label="Snapshot" className="flex flex-col gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void snapshot()}>Take snapshot</Button>
          </section>
        )}
        {message && <p role="status" className="whitespace-pre-wrap text-sm">{message}</p>}
      </SheetContent>
    </Sheet>
  );
}
```

  The panel shows its sign-in links as plain `<a>` elements. Each one opens `/dev-panel/sign-in/<token>`, which redirects through Better Auth's verify URL to `/`.

`apps/web/src/dev-panel/mount.tsx`:

```tsx
import 'server-only';
import { headers } from 'next/headers';
import { activeEnvName, requestGuardOn } from '@/server/dev-guard';
import { DevBanner } from './banner';

/** Spec §5.1/§5.3: the strip on every page, or nothing when any guard condition fails. */
export async function devBanner(): Promise<React.ReactNode> {
  if (!requestGuardOn((await headers()).get('host'))) return null;
  return <DevBanner env={activeEnvName()} />;
}
```

`apps/web/src/app/layout.tsx`: inside `RootLayout`, after the theme line:

```tsx
  // Spec §5.3: constant-folded away in production builds, so no panel code is bundled there.
  const banner = process.env.NODE_ENV !== 'production' ? await (await import('@/dev-panel/mount')).devBanner() : null;
```

  and render `<body>{banner}{children}</body>`.

- [ ] **Step 5: Add the dev launcher and scripts.**

`apps/web/scripts/dev-args.ts`:

```ts
import { type EnvName, isEnvName } from '@cs/db';

/** `--env <dev|demo|test>` is ours; everything else goes to `next dev`. */
export function parseDevArgs(argv: string[]): { env: EnvName | null; rest: string[] } {
  const rest: string[] = [];
  let env: EnvName | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--env') {
      const v = argv[++i];
      if (!isEnvName(v)) throw new Error('--env must be dev, demo or test');
      env = v;
    } else {
      rest.push(argv[i]!);
    }
  }
  return { env, rest };
}
```

`apps/web/scripts/dev.ts`:

```ts
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { devEnvFile, webRepoRoot, writeDevEnv } from '../src/server/dev-guard';
import { parseDevArgs } from './dev-args';

/** Deviation 7: npm scripts run under cmd.exe on Windows, so `DEV_PANEL=1 next dev` can't be written inline. */
const webDir = fileURLToPath(new URL('..', import.meta.url));
const { env: target, rest } = parseDevArgs(process.argv.slice(2));
const environment: NodeJS.ProcessEnv = { ...process.env, DEV_PANEL: '1' };
if (target) await writeDevEnv(devEnvFile(environment, webRepoRoot(webDir)), target);
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'dev', ...rest], { cwd: webDir, env: environment, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
```

  Scripts:
  - In `apps/web/package.json`: change `"dev"` to `"tsx scripts/dev.ts"` and add `"dev:demo": "tsx scripts/dev.ts --env demo"`.
  - In the root `package.json`: add `"dev": "pnpm --filter @cs/web dev"` and `"demo:dev": "pnpm --filter @cs/web dev:demo"`. The existing `dev:web` stays.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @cs/web exec vitest run src/dev-panel scripts/dev-args.test.ts` (timeout 600000)
Expected: PASS.
Then check free commit memory and run `pnpm --filter @cs/web typecheck`: PASS.

- [ ] **Step 7: Try it by hand**

Run `pnpm dev` (background), then open `http://localhost:3000/sign-in`.
- Expected: an amber "DEV · real data" strip.
- Click it, then "Switch to DEMO": the strip turns blue and the five links appear (once `pnpm demo:reset` has run).
- Open `http://127.0.0.1:3000/sign-in`: the banner still shows.
- Open the app by the machine's LAN IP: no banner, and `/dev-panel/api/state` is 404.
- Switch back to DEV, stop the server, and delete `.dev-env.json` if you created one.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/dev-panel apps/web/src/app/dev-panel apps/web/src/app/layout.tsx apps/web/src/proxy.ts apps/web/scripts/dev.ts apps/web/scripts/dev-args.ts apps/web/scripts/dev-args.test.ts apps/web/package.json package.json
git commit -m "feat(web): dev panel banner, switch, demo sign-in, reset stream and snapshot"
```

---

### Task 19: E2E, the production-build check and the full suite

**Files:**
- Create: `apps/web/scripts/no-dev-panel.ts` + `no-dev-panel.test.ts`, `apps/web/scripts/check-no-dev-panel.ts`, `apps/web/playwright.panel.config.ts`, `apps/web/e2e-panel/panel.spec.ts`
- Modify: `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`, `apps/web/package.json` (scripts), `apps/web/tsconfig.json` (`include`)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `PANEL_MARKERS`, `findPanelCode(nextDir): Promise<string[]>`;
  - scripts `check:no-dev-panel` and `e2e:panel`.

- [ ] **Step 1: Write the failing scanner test** — `apps/web/scripts/no-dev-panel.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPanelCode } from './no-dev-panel';

let next: string;
beforeEach(() => {
  next = mkdtempSync(join(tmpdir(), 'next-'));
  mkdirSync(join(next, 'server', 'app'), { recursive: true });
  mkdirSync(join(next, 'static', 'chunks'), { recursive: true });
  writeFileSync(join(next, 'server', 'app', 'page.js'), 'export default 1');
});
afterEach(() => rmSync(next, { recursive: true, force: true }));

describe('findPanelCode (spec §5.3 build check)', () => {
  it('finds nothing in a clean build', async () => {
    expect(await findPanelCode(next)).toEqual([]);
  });

  it('flags server or client chunks that carry a panel marker, ignoring source maps', async () => {
    writeFileSync(join(next, 'static', 'chunks', 'a.js'), 'x("data-rm-dev-panel")');
    writeFileSync(join(next, 'server', 'app', 'b.js'), 'h["x-rm-dev-panel"]');
    writeFileSync(join(next, 'static', 'chunks', 'a.js.map'), 'data-rm-dev-panel');
    expect((await findPanelCode(next)).sort()).toEqual([join('server', 'app', 'b.js'), join('static', 'chunks', 'a.js')]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/web exec vitest run scripts/no-dev-panel.test.ts` (timeout 600000)
Expected: FAIL — `./no-dev-panel` does not exist.

- [ ] **Step 3: Implement the scanner and its CLI.**

`apps/web/scripts/no-dev-panel.ts`:

```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** Strings that exist only in `src/dev-panel/` (banner attribute and request/response header). */
export const PANEL_MARKERS = ['data-rm-dev-panel', 'x-rm-dev-panel'] as const;
const SCANNED = /\.(js|mjs|cjs|html|rsc|body|json)$/;

/** Files under `.next/server` and `.next/static` that contain a panel marker (paths relative to `nextDir`). */
export async function findPanelCode(nextDir: string): Promise<string[]> {
  const hits: string[] = [];
  const walk = async (dir: string) => {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(dir, name);
      if ((await stat(p)).isDirectory()) await walk(p);
      else if (SCANNED.test(name) && !name.endsWith('.map')) {
        const text = await readFile(p, 'utf8');
        if (PANEL_MARKERS.some((m) => text.includes(m))) hits.push(relative(nextDir, p));
      }
    }
  };
  await walk(join(nextDir, 'server'));
  await walk(join(nextDir, 'static'));
  return hits;
}
```

`apps/web/scripts/check-no-dev-panel.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { findPanelCode } from './no-dev-panel';

const hits = await findPanelCode(fileURLToPath(new URL('../.next', import.meta.url)));
if (hits.length) {
  console.error(`Dev-panel code found in the production build (spec §5.3):\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('No dev-panel code in the production build.');
```

  Add to `apps/web/package.json` `scripts`: `"check:no-dev-panel": "tsx scripts/check-no-dev-panel.ts"` and `"e2e:panel": "playwright test -c playwright.panel.config.ts"`.

- [ ] **Step 4: Make every production E2E run prove the build check and the guard.**

  In `apps/web/playwright.config.ts`:
  - set `webServer.command` to `` `pnpm build && pnpm check:no-dev-panel && pnpm start --port ${PORT}` ``;
  - add `DEV_PANEL: '1'` to `webServer.env`. A production server must ignore it.

  Append to `apps/web/e2e/smoke.spec.ts`:

```ts
test('a production build has no dev panel, even with DEV_PANEL=1 (spec §5.3, §8)', async ({ page, request }) => {
  await page.goto('/sign-in');
  await expect(page.locator('[data-rm-dev-panel]')).toHaveCount(0);
  for (const path of ['/dev-panel/api/state', '/dev-panel/api/links', '/dev-panel/sign-in/anything']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  const post = await request.post('/dev-panel/api/switch', { headers: { 'x-rm-dev-panel': '1', origin: 'http://localhost:3100' }, data: { env: 'demo' } });
  expect(post.status()).toBe(404);
});
```

- [ ] **Step 5: Write the panel E2E.**

`apps/web/playwright.panel.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}
const PORT = 3200;

/**
 * Spec §8 panel E2E: a `next dev` server with the panel on. It runs against the real cs_demo (it resets it) and
 * keeps its live-environment choice in its own file, so the owner's `.dev-env.json` is never touched.
 * Never run it at the same time as `pnpm --filter @cs/web e2e` (both use `.next`).
 */
export default defineConfig({
  testDir: './e2e-panel',
  fullyParallel: false,
  workers: 1,
  timeout: 900_000,
  expect: { timeout: 30_000 },
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm exec tsx scripts/dev.ts --env dev --port ${PORT}`,
    url: `http://localhost:${PORT}/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { APP_URL: `http://localhost:${PORT}`, RM_DEV_ENV_FILE: fileURLToPath(new URL('./test-results/panel/dev-env.json', import.meta.url)) },
  },
});
```

`apps/web/e2e-panel/panel.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('switch to DEMO, reset it, sign in as the agency admin and open Lone Star Cooling’s data pages (spec §8)', async ({ page }) => {
  await page.goto('/sign-in');
  const strip = page.locator('[data-rm-dev-panel]');
  await expect(strip).toHaveText('DEV · real data');
  await strip.click();
  await page.getByRole('button', { name: 'Switch to DEMO' }).click();
  await expect(page.locator('[data-rm-dev-panel]')).toHaveText('DEMO');

  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.getByTestId('reset-log')).toContainText('exit 0', { timeout: 600_000 });

  await page.getByRole('link', { name: 'Agency admin' }).click();
  await page.waitForURL(/\/agency$/);
  await page.getByRole('link', { name: 'Lone Star Cooling' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const clientId = /\/c\/([0-9a-f-]{36})/.exec(page.url())![1]!;

  await page.goto(`/c/${clientId}/pricing`);
  await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible();
  await expect(page.getByText('Hill Country Air & Heat').first()).toBeVisible();
  await expect(page.getByText(/Prices come from competitor websites/)).toHaveCount(0);

  await page.goto(`/c/${clientId}/reviews`);
  await expect(page.getByRole('heading', { level: 1, name: 'Reviews & reputation' })).toBeVisible();
  await expect(page.getByText('Granbury Comfort Pros').first()).toBeVisible();

  await page.goto(`/c/${clientId}/rankings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Local rankings' })).toBeVisible();
  await expect(page.getByText(/first monthly rank scan hasn’t run yet|Rank tracking starts once keywords/)).toHaveCount(0);

  // Leave the dev server's environment file on DEV for the next run.
  await page.locator('[data-rm-dev-panel]').click();
  await page.getByRole('button', { name: 'Switch to DEV' }).click();
  await expect(page.locator('[data-rm-dev-panel]')).toHaveText('DEV · real data');
});
```

  Add `"e2e-panel"` and `"playwright.panel.config.ts"` to the `include` array in `apps/web/tsconfig.json`.

- [ ] **Step 6: Run the unit test, typecheck and the full suite**

1. `pnpm --filter @cs/web exec vitest run scripts/no-dev-panel.test.ts` (timeout 600000): PASS.
2. `pnpm typecheck`: PASS (check free commit memory first).
3. Full suite: `npx turbo run test --concurrency=1 --continue` with `run_in_background`, then wait for the completion notice (~20+ minutes; the new `@cs/demo` coverage test adds a few). Expected: every package green.
   - The round-trip test skips with its printed reason unless `PG_BIN` points at PostgreSQL 18+ tools.
   - A package failing only with `connect ETIMEDOUT` is a Neon flake: re-run that package once.

- [ ] **Step 7: Run both E2E suites, one after the other**

1. Check free commit memory.
2. `pnpm --filter @cs/web e2e` (timeout 600000). Expected:
   - the build passes `check:no-dev-panel`, which prints `No dev-panel code in the production build.`;
   - every existing test passes, plus the new production check.
3. **If `check:no-dev-panel` reports files**, the bundler did not drop the dead branch. Fix it like this, then repeat item 2:
   - create `apps/web/src/dev-panel/stub.ts`:

```ts
// Production stand-in for the dev panel (spec §5.3): never contains panel code or markers.
export async function devBanner(): Promise<null> {
  return null;
}
export async function handleDevPanel(): Promise<Response> {
  return new Response('Not found', { status: 404 });
}
```

   - in `apps/web/next.config.ts`, add to `config` an alias that applies only to production builds:

```ts
  turbopack: process.env.NODE_ENV === 'production'
    ? { resolveAlias: { '@/dev-panel/mount': './src/dev-panel/stub.ts', '@/dev-panel/handlers': './src/dev-panel/stub.ts' } }
    : undefined,
```

   - Read `apps/web/node_modules/next/dist/docs/` on `turbopack.resolveAlias` first. If aliases there do not match `@/` specifiers, use relative specifiers (`../dev-panel/mount`) in `layout.tsx` and the route shell, and alias those instead.
4. `pnpm --filter @cs/web e2e:panel` (timeout 900000). Expected: PASS. It resets the real `cs_demo`, which is the intended use.
   - If Neon refused `CREATE DATABASE` in Task 12, this needs the owner to create `cs_demo` first. Report it rather than skipping the test.

- [ ] **Step 8: Commit**

```bash
git add apps/web/scripts/no-dev-panel.ts apps/web/scripts/no-dev-panel.test.ts apps/web/scripts/check-no-dev-panel.ts apps/web/playwright.config.ts apps/web/playwright.panel.config.ts apps/web/e2e-panel apps/web/e2e/smoke.spec.ts apps/web/package.json apps/web/tsconfig.json
git commit -m "test(web): panel E2E and a production-build check for panel code"
```

  (Add `apps/web/src/dev-panel/stub.ts` and `apps/web/next.config.ts` if Step 7 needed them.)

---

### Task 20: Documentation and final review

**Files:**
- Modify: `docs/HANDOVER.md`, `README.md`
- Regenerate if needed: `packages/demo/README.md`

**Interfaces:**
- Consumes: the finished branch.
- Produces: the docs a new session needs; a clean whole-branch review.

- [ ] **Step 1: Root README.** Add a "Demo data, dev panel and snapshots" section after "Setup":

```markdown
## Demo data, dev panel and snapshots

Local only (spec: `docs/superpowers/specs/2026-10-09-demo-data-and-snapshots-design.md`).

| Command | What it does |
|---|---|
| `pnpm demo:reset` | Creates `cs_demo` if it is missing (same Neon server and roles as `cs_dev`), then wipes, migrates and seeds it with fictional HVAC/plumbing data, writes evidence to `apps/worker/.evidence-demo`, and prints sign-in links |
| `pnpm demo:dev` | Runs the web app with the dev panel on and DEMO selected |
| `pnpm dev` (or `pnpm dev:web`) | Runs the web app with the dev panel on; the database comes from `.dev-env.json` (DEV by default) |
| `pnpm demo:links` | Prints fresh sign-in links for the demo users |
| `pnpm db:snapshot` | Dumps `cs_dev` and zips its evidence into `backups/<timestamp>-cs_dev/` with a manifest |
| `pnpm db:restore <folder> [--into <db>]` | Restores into a new `cs_dev_restore_<timestamp>` database (default), or over an existing one only after you type its name and a fresh snapshot is taken; never into a test database |

- **The banner:** a coloured strip shows the live database — DEV (amber, real data), DEMO (blue) or TEST (grey, wiped by test runs). Click it to switch database, reset the demo data, or take a snapshot.
- **The guard:** the panel exists only when `NODE_ENV` is not `production`, `DEV_PANEL=1` (set by the dev scripts) and the host is `localhost` or `127.0.0.1`.
- **No outside calls:** nothing here calls a vendor or an AI model, crawls a site or sends email. Sign-in emails go to the console while the panel is on, and background jobs are switched off while DEMO or TEST is live.
- **Snapshots need `pg_dump` and `pg_restore` at least as new as the server** (Neon runs PostgreSQL 18). Set `PG_BIN` to a folder of portable PostgreSQL 18 client binaries if your PATH has an older version.
- **If Neon refuses `CREATE DATABASE`:** create `cs_demo` in the Neon console, then re-run `pnpm demo:reset`.
```

- [ ] **Step 2: HANDOVER.**
  - Update the top status paragraph and §3 "Current state" with this branch (`demo-data-and-snapshots`), its plan, the task count and the test totals.
  - Add a row for this plan to §1's key-documents table.
  - In §4, add `DEV_PANEL` (set by the dev scripts only), `RM_DEV_ENV_FILE` (panel E2E), `PG_BIN` (optional), the git-ignored `.dev-env.json` and `backups/`, and the new `cs_demo` database (created by `demo:reset`). Do not add anything to `.env`.
  - Add these §6 gotchas:
    - panel code only under `src/dev-panel/`, reached by `NODE_ENV` dynamic imports, with the build check;
    - per-environment factories (`perEnv`) — a new cached client must use it;
    - `webStore` moved to `server/store.ts`;
    - enqueue refused in DEMO/TEST;
    - the demo seed's coverage test as the place a new screen registers;
    - restore order;
    - the theme-proposal limit (deviation 1).
  - Record the owner's answers to the "Spec deviations" in §2 once given.

- [ ] **Step 3: Check for stray CRLF and files that must not be staged**

Run: `git ls-files --eol | grep crlf` (expect nothing) and `git status --short` (expect no `.env`, `.dev-env.json`, `backups/`, `.evidence-demo/`, `.claude/`, `App/` or `.superpowers/`).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/HANDOVER.md packages/demo/README.md
git commit -m "docs: demo data, dev panel and snapshots — README and handover"
```

- [ ] **Step 5: Final whole-branch review**

Ask for a whole-branch review on the most capable model (superpowers:requesting-code-review), against the spec, this plan's Global Constraints and its Review Focus. Fix every Critical and Important finding in one fix wave, re-run the affected tests, and record minors in the roadmap's carry-over. Do not merge or push without the owner's go-ahead.

---

## Self-review notes (writing-plans checklist, done 2026-10-09)

**1. Spec coverage.** Each spec section and the task that implements it:

| Spec | Task |
|---|---|
| §3 environments | Task 1 |
| §4.1 tenancy, people, invitation, webhook, notifications | Tasks 3, 10 |
| §4.2 events, evidence (WebP), moves | Task 4 |
| §4.3 pricing | Task 5 |
| §4.4 ads | Task 6 |
| §4.5 reviews and the salt | Task 7 |
| §4.6 rankings | Task 8 |
| §4.7 briefs, recommendations, alerts, custom alert rules, trend report, pitch data | Tasks 3, 9, 10 |
| §4.8 usage, playbook, platform queues | Task 10 (with deviation 1) |
| §4.9 coverage list, test, README table | Task 11 |
| §5.1 banner | Task 18 |
| §5.2 switch, links, reset stream, snapshot | Task 18 (links: Task 3) |
| §5.3 guard and build check | Tasks 13, 18, 19 |
| §5.4 per-environment factories and the operator | Task 14 |
| §5.5 console email | Task 15 |
| §6.1 snapshot | Task 16 |
| §6.2 restore | Task 17 |
| §7 commands, create database, Neon message, generalised wipe | Tasks 2, 12, 16, 17, 18 |
| §8 tests | Unit tests in Tasks 1, 2, 13, 14, 16, 17, 18; coverage in Task 11; round trip in Task 17; E2E and production check in Task 19 |

No requirement is left without a task. The spec conflicts are listed under "Spec deviations" (items 1–3 and 10–12 change seeded data; items 4–9 and 13–14 change mechanism).

**2. Placeholder scan.**
- No TBD/TODO, and no "similar to Task N".
- Every code step carries the code.
- Task 19 Step 7 has one conditional fallback (the Turbopack alias). It is used only if the build check fails, and its code is given in full.

**3. Type consistency.** These are the names other tasks rely on, checked across tasks:
- `DemoIds` fields: `events[].evidenceIds/changeId`, `moves[].open/summary`, `briefs.*`, `alerts.*`, `reportId`, `noData.*`, `pages[id].home/pricing`, `users[key].userId/contactId`;
- `CLIENT_SPECS`, `CLIENT_THRESHOLDS`, `DEMO_COLLECTOR`, `LONE_STAR_PLACE_ID`;
- `perEnv` / `clearEnvCaches`, `envUrls`, `platformAdmins`;
- `PANEL_HEADER`, `createPanelHandler`, `devSignIn`, `spawnLines`;
- `takeSnapshot`, `restoreSnapshot`, `RestoreDeps`.

`FILLER_BUSINESSES` comes from `rankings.ts` (Task 8) and is imported by `agency.ts` (Task 10), which runs later.

**4. Review Focus.** The five lines above each have tests in their owning task:
1. Tasks 1, 2, 12;
2. Task 18 handler tests;
3. Task 18 `devSignIn` tests;
4. Tasks 14 (`refuseJobs`) and 15 (`webEmailTransport`);
5. Task 17 ordering and refusal tests, and Task 16 `pgEnv` / version messages.

**Known uncertainties for the implementer:**
- **The build check:** whether the bundler drops the dead `NODE_ENV` branch around the dynamic imports. Task 19's check detects it either way, and its fallback is given.
- **Neon and `CREATE DATABASE`:** whether Neon lets the owner role run it. The spec's console instruction covers a refusal.
- **Fonts in the screenshots:** whether `sharp`'s SVG renderer finds a font for the page-mock text on this machine. Rectangles always render, and the test checks only the WebP header.
