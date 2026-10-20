# @cs/worker — working notes
The single background worker: pg-boss queues and jobs (collection, engine sweep, briefs, alerts, delivery), Playwright PDF rendering, and the `*-once` CLIs.

## Gotchas
- **Run exactly one replica** — see `docs/gotchas-cross-cutting.md` (per-host rate limiting is in-process).
- **pg-boss 10:** queue names use hyphens; `work()` handlers receive arrays; in production the worker's `DATABASE_URL` is the least-privilege `cs_worker` role (owns schema `pgboss`; migration `0080`) and data goes through `SERVICE_DATABASE_URL` — see `docs/DEPLOY.md` § Roles. Locally it is still the owner URL.
- **cwd-relative dirs:** when run via `pnpm --filter`, `EVIDENCE_FS_DIR=./.evidence` lands in `apps/worker/.evidence/` and `EMAIL_OUTBOX_DIR` (default `./.outbox`) in `apps/worker/.outbox/` (gitignored).
- **`.outbox/` is the dev mailbox:** whenever `POSTMARK_SERVER_TOKEN` is unset, every email is a `.json` + `.html` pair there — open the newest `.html` to see what a client would receive. With the Postmark test-server token set, the worker and `deliver-once dispatch` are safe to run against the `@example.com` `cs_dev` contacts (accepted, never delivered).
- **PDFs block every network request except the agency's own `https` logo URL:** the Playwright brief/report render disables JavaScript and blocks all other requests, so a second external asset in a template silently fails to render (no error).
- **Delivery jobs idle** until `APP_URL` and `LINK_SIGNING_SECRET` are both set (start-up warning names the missing ones) — details in `packages/engine/CLAUDE.md`.
- **`WEB_MONITORING_ENABLED`** must be exactly `'true'` to enqueue `discover-pages`/accept manual pages; unset = `false`. Keep it unset until `https://rivalmonday.app/bot` exists. Accepting/dismissing a suggestion still starts paid vendor collection (`gbp`/`reviews`/ads) either way — only web crawling is gated.
- **`KB_IMPORT_ENABLED`** must be exactly `'true'` for `kb-import` / `kb-sync` (off: import returns `{ error: 'disabled' }`, sync no-ops). Both fetch only through `deps.politeRenderer()` (robots, shared limiter). A job handler's returned object becomes the pg-boss `output` (single-job batches); the web reads it via `JobStatusLookup`.
- **pg-boss needs a queue to exist before `send`:** register every job (with its queue policy/retry options) in `registerJobs` at startup and enqueue through `enqueue(boss, job, …)`; an ad-hoc option-less `createQueue` makes the first creator's options win.
