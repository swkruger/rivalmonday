# Demo data, dev panel and snapshots — design

**Date:** 2026-10-09
**Status:** draft for the owner's review
**Builds on:** Phases 1–5 (everything merged to `main` at `cac524e`)

## 1. Goal

The owner wants to open every screen built so far and see it populated with believable data, without risking the real data in `cs_dev`. The real data includes paid vendor collections for the Granbury HVAC competitors, so it cannot simply be collected again.

Success means:

1. **Demo data:** one command, or one button, fills a separate `cs_demo` database with a fictional data set. Every screen then shows real-looking content, apart from the empty states that are left on purpose.
2. **Dev panel:** while running locally, a coloured banner always shows which database is live (DEV, DEMO or TEST). A panel lets the owner switch database, reset the demo data and take a snapshot.
3. **Snapshots:** `cs_dev` and its evidence files can be snapshotted to local files and restored. A restore never overwrites anything unless the owner explicitly confirms it.
4. **No new outside calls:** nothing here sends email, calls a paid vendor or an AI model, or crawls a website.

**Owner decisions** (2026-10-09):
- The demo uses a separate `cs_demo` database.
- The businesses are fully fictional, all in one vertical (HVAC/plumbing).
- It is browsed locally.
- The data is written directly to the database (approach A), not produced by running the real pipeline.
- Switching and reset happen in an in-app dev panel.

## 2. Non-goals

- **Hosted demo:** running the demo on rm.nofingers.ai, or any other host. The panel cannot exist there (§5.3).
- **Real pipeline:** running the real engine or brief pipeline over the demo data. Derived rows are written directly.
- **More verticals:** demo clients in a second vertical.
- **Panel restore:** restoring from the panel. Restore is a terminal command only.
- **Real data in the demo:** copying any real `cs_dev` data into `cs_demo`.

## 3. Environments

| Name | Database | Evidence directory | Purpose |
|---|---|---|---|
| DEV | `cs_dev` | `apps/worker/.evidence` | real data, owner verification |
| DEMO | `cs_demo` (new) | `apps/worker/.evidence-demo` | fictional demo data |
| TEST | `cs_test` | the test store | automated tests; wiped by test runs |

- **Connection strings:** the demo URLs are derived from the existing ones (`DATABASE_URL`, `APP_DATABASE_URL`, `SERVICE_DATABASE_URL`) by swapping the database name `cs_dev` for `cs_demo`. That means the same Neon host, the same roles and no new secrets.
  - The TEST URLs are the existing `TEST_*` variables.
  - `.env` is never edited.
- **One function owns this:** `resolveEnvironment(name)` in a new module returns `{ name, ownerUrl, appUrl, serviceUrl, evidenceDir }`.
- **Database name check:** `assertDatabase(url, expected)` parses the database name out of a URL and throws unless it matches exactly. Every destructive demo step calls it with `'cs_demo'`.

## 4. Demo data set

The data is fictional and set in the Granbury, TX area. Every timestamp is relative to the moment of seeding, so the demo always looks current. A fixed random seed means every reset produces the same data.

The seed lives in `packages/demo/`, a new workspace package with one file per area. It writes through the same Drizzle schema the app uses, so a schema change that breaks it fails typecheck. It reuses the existing helpers where they fit: `createInvitation`, `signLink` and the storage `createStore`.

### 4.1 Tenancy and people (`tenancy.ts`)

- **Agency:** "Brazos Digital", with branding (name and primary colour).
- **Users** (Better Auth `auth.user` rows plus memberships):
  - `operator@demo.rivalmonday.test`: platform operator, via `PLATFORM_ADMIN_EMAILS` (§5.4);
  - `admin@demo.rivalmonday.test`: agency admin;
  - `member@demo.rivalmonday.test`: agency member;
  - one client-owner contact and sign-in per active client.
- **Team extras:** one pending invitation and one agency webhook.
- **Clients:**
  - "Lone Star Cooling": active, with its own business (`self_competitor_id`), place id, 3 keywords and a 25 km service area.
  - "Brazos Plumbing Co": active, with no own business. This exercises the "add your place id" and "own reviews pending" states.
  - "Lakeside Family Dental": a prospect, with a completed `prospect_report`.
- **Competitors:**
  - 6 for Lone Star Cooling and 4 for Brazos Plumbing, with sites, place ids, GBP profile data and coordinates inside the service area.
  - At least one competitor has no data in each of the pricing, ads, reviews and rankings areas.
- **Notifications:** preferences set, and inbox notifications both read and unread.

### 4.2 Changes and moves (`changes.ts`)

- **Events:** about 40 over 90 days across the web, price, ad and review sources and all severity levels. Each has a `detected_change`, `event_change` and `event_score`.
- **Evidence:** web events get before and after captures. Each capture has:
  - an evidence screenshot: a generated WebP of a simple page mock with the changed block highlighted;
  - the page text and HTML;
  - the files written to the DEMO evidence directory.
- **Moves:** 6, active and resolved, each linked to its events.

### 4.3 Pricing (`pricing.ts`)

- **Price points:** 12 months for 8 services across the competitors, with rises and cuts.
- **Gaps on purpose:** one competitor has no prices, and one price is no longer seen.

### 4.4 Ads (`ads.ts`)

- About 30 Google and Meta ads, with first-seen and last-seen dates, both active and ended.
- One ad has no title, so it shows as "Untitled".

### 4.5 Reviews (`reviews.ts`)

- **Reviews:** about 400 over 12 months across the businesses, each with a `review_analysis` (sentiment and themes).
- **Heatmap:** every theme is covered, with one gap left on purpose so the "no data" cell shows.
- **Searchable phrase:** "showed up two hours late" appears in at least one review.
- **Reviewer hashes** are made with the normal salt function.

### 4.6 Rankings (`rankings.ts`)

- 8 weekly `rank_scan`s per active client with keywords, for 3 keywords on a 7×7 grid.
- One scan has failed, and one keyword has points outside the top 20.

### 4.7 Briefs, alerts and reports (`briefs.ts`)

- **Briefs:**
  - sent briefs for the past 4 Mondays;
  - 1 brief `ready` for approval;
  - 1 brief held as quiet.
- **Recommendations and feedback:** recommendations are on the board, including dismissed ones and feedback.
- **Alerts:**
  - delivered, pending in the agency queue, and dismissed with a reason;
  - custom alert rules on Lone Star Cooling.
- **Reports:** one `trend_report`, plus the data the pitch snapshot needs.

### 4.8 Agency and platform (`agency.ts`, `platform.ts`)

- **Usage:** `llm_call` and `vendor_call` rows that put the agency near its cap.
- **Playbooks:** one playbook override.
- **Platform queues:**
  - 3 pending `theme_proposal`s;
  - 4 `decision_review` items.

### 4.9 Screen coverage (`coverage.ts`)

- **The list:** a single exported list of every screen route, with the tool calls it makes and the empty states expected on purpose.
- **What uses it:**
  - the coverage test (§8);
  - a coverage table in the package README.

  A later phase that adds a screen adds its seed file and a coverage entry.

## 5. Dev panel

### 5.1 Banner

- **What it shows:** a thin full-width strip above the app shell on every page, including the sign-in and error pages. The label and colour are fixed per database:
  - **DEV** (amber): "real data";
  - **DEMO** (blue);
  - **TEST** (grey): "wiped by test runs".
- **Clicking it** opens the panel, a `@cs/ui` Sheet.

### 5.2 Panel actions

- **Switch to DEV / DEMO / TEST:**
  1. writes `{ "env": "<name>" }` to `.dev-env.json` at the repo root (git-ignored);
  2. clears the cached database clients and storage;
  3. signs the current session out;
  4. shows sign-in links for the new database (below).
- **Sign-in links:**
  - DEMO and TEST: one signed link per demo user, made with the existing `signLink` and `LINK_SIGNING_SECRET`.
  - DEV: links to the normal sign-in page.
- **Reset demo data (DEMO only):**
  - runs the seed (§4) in a child process and streams progress lines;
  - is disabled while a reset is already running.
- **Take snapshot (DEV only):** runs the snapshot (§6) and shows the folder it wrote.

### 5.3 Guard

The panel UI, its route handlers and its server actions all exist at runtime only when:
1. `process.env.NODE_ENV !== 'production'`; and
2. `process.env.DEV_PANEL === '1'`, which only the `dev` and `demo:dev` scripts set; and
3. the request's host is `localhost` or `127.0.0.1`.

Rules:
- Every server action and route re-checks all three.
- When any check fails, the guard behaves as if the panel does not exist: the banner is not rendered and the routes return 404.
- The panel module is imported dynamically behind condition 1. A build check confirms that a production build contains no panel code. `.dev-env.json` is ignored when the guard is off.

### 5.4 Runtime switching

- **Today:** the web app's database and storage factories build their clients from env once.
- **The change:**
  - Behind the guard, they read the current environment from `.dev-env.json` and keep one cached client set per environment.
  - With the guard off, which includes production, behaviour is unchanged: env only.
- **Platform operator:** while the guard is on and the environment is DEMO or TEST, `PLATFORM_ADMIN_EMAILS` gets `operator@demo.rivalmonday.test` added in memory. `.env` is not changed.

### 5.5 No outgoing email

- While the guard is on, the web app's email sender is replaced with one that logs to the console.
- The demo contacts use `@demo.rivalmonday.test`, which cannot be delivered.
- The worker is never started by any of this.

**Implementation check:** confirm how `@cs/email` picks its transport. If it has no switch for this, add one that only the guard can turn on.

## 6. Snapshots

### 6.1 `pnpm db:snapshot`

1. **Check the client version.** Find `pg_dump`, then compare its major version with the server's (`SHOW server_version`). If the client is older, stop with a message that names the version needed and how to get the portable PostgreSQL client binaries. A `PG_BIN` env var can point at them.
2. **Database dump.** Run `pg_dump -Fc` of `cs_dev` (owner URL) into `backups/<timestamp>-cs_dev/db.dump`.
3. **Evidence files.** Zip `apps/worker/.evidence` into `evidence.zip` in the same folder.
4. **Manifest.** Write `manifest.json` with the timestamp, the source database name, the server version, the last applied migration, the row count of every table, and the evidence file count and bytes.

- **Location:** `backups/` is git-ignored.
- **Secrets:** the connection URL and password are never printed, and never written to the manifest.

### 6.2 `pnpm db:restore <folder> [--into <db>]`

- **Default target:** a new database, `cs_dev_restore_<timestamp>`, which is created. The evidence is extracted to `apps/worker/.evidence-restore-<timestamp>`.
- **Restoring over an existing database** (for example `--into cs_dev`) requires all of the following:
  - the owner types the target database name at a prompt;
  - a fresh snapshot of the target is taken first;
  - the existing evidence directory is moved aside, not deleted.
- **Check afterwards:** compare row counts with the manifest and print any differences.
- **Never `cs_test`:** `cs_test` is refused as a target.

## 7. Commands

| Command | What it does |
|---|---|
| `pnpm demo:reset` | Creates `cs_demo` if it is missing, then wipes, migrates and seeds it, writes the evidence files and prints sign-in links |
| `pnpm demo:dev` | Runs the web app with `DEV_PANEL=1` and the environment set to DEMO |
| `pnpm dev` | Unchanged, plus `DEV_PANEL=1`. The environment comes from `.dev-env.json`, and DEV is the default |
| `pnpm demo:links` | Prints fresh sign-in links for the demo users |
| `pnpm db:snapshot` | §6.1 |
| `pnpm db:restore` | §6.2 |

- **Creating `cs_demo`:** `demo:reset` uses `CREATE DATABASE` through the owner URL, then applies the same role grants the migrations expect.
- **If Neon refuses:** the script stops and says: "Create database cs_demo in the Neon console, then re-run."
- **Wiping:** wipe and migrate reuse the logic in `packages/db/test/global-setup.ts`. That logic is generalised to accept an expected database name, instead of only accepting names ending in `_test`.

## 8. Testing

**Unit tests:**
- `assertDatabase`: exact match passes; `cs_dev`, `cs_test`, a different name and a malformed URL each throw.
- `resolveEnvironment`: URL derivation for each environment, including a URL with query parameters.
- Panel guard:
  - each of the three conditions false gives "off";
  - all three true gives "on";
  - server actions refuse when the guard is off.
- Client cache: switching returns a different client set, and the guard being off ignores `.dev-env.json`.
- Snapshot:
  - version check: an older client gives a clear error;
  - the manifest shape;
  - restore refuses `cs_test`, and refuses to overwrite without a matching typed name.

**Seed coverage test:**
- Runs the demo seed against `cs_test`, The seed takes its expected database name as a parameter: `demo:reset` passes `cs_demo`, and this test passes `cs_test`.
- For every entry in `coverage.ts`, it calls the listed tools as the right user and asserts they return non-empty data, except for the empty states left on purpose.

**Snapshot round trip:**
- Dump `cs_test`, restore it into a scratch database, compare row counts, then drop the scratch database.
- This test is skipped, with a printed reason, when no matching `pg_dump` is available.

**E2E:**
- With the panel on: switch to DEMO, reset, sign in as the agency admin through the panel link, and see that Lone Star Cooling's pricing, reviews and rankings pages render.
- Production check: a production build has no banner, and the panel route returns 404.

## 9. Risks

1. **pg_dump version:** the local client tools are PostgreSQL 17 and Neon runs 18. Mitigation: the snapshot checks the version and points at the portable client binaries, or the `PG_BIN` override. The seed and the panel's switch and reset do not need `pg_dump`.
2. **`CREATE DATABASE` on Neon:** Neon may refuse it for the owner role. Mitigation: a one-line instruction to create the database in the console.
3. **Session cookies across databases:** a session from one database is unknown in the others. Mitigation: switching signs you out and shows that database's sign-in links.
4. **TEST being wiped mid-view:** the banner says "wiped by test runs". Switching while tests run shows partial data, and that is accepted.
5. **Seed drift as phases add screens:** the seed is typed against the schema, and the coverage test fails when a screen's tools return nothing.
6. **Panel reaching production:** three runtime conditions, server-side re-checks and a build check (§5.3).
