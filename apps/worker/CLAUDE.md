# @cs/worker — working notes
The single background worker: pg-boss queues and jobs (collection, engine sweep, briefs, alerts, delivery), Playwright PDF rendering, and the `*-once` CLIs.

## Gotchas
- **Run exactly one replica** — see `docs/gotchas-cross-cutting.md` (per-host rate limiting is in-process).
- **pg-boss 10:** queue names use hyphens; `work()` handlers receive arrays; the worker uses the owner `DATABASE_URL` for now (least-privilege role is a Phase 7 item).
- **cwd-relative dirs:** when run via `pnpm --filter`, `EVIDENCE_FS_DIR=./.evidence` lands in `apps/worker/.evidence/` and `EMAIL_OUTBOX_DIR` (default `./.outbox`) in `apps/worker/.outbox/` (gitignored).
- **`.outbox/` is the dev mailbox:** whenever `POSTMARK_SERVER_TOKEN` is unset, every email is a `.json` + `.html` pair there — open the newest `.html` to see what a client would receive. With the Postmark test-server token set, the worker and `deliver-once dispatch` are safe to run against the `@example.com` `cs_dev` contacts (accepted, never delivered).
- **PDFs block every network request except the agency's own `https` logo URL:** the Playwright brief/report render disables JavaScript and blocks all other requests, so a second external asset in a template silently fails to render (no error).
- **Delivery jobs idle** until `APP_URL` and `LINK_SIGNING_SECRET` are both set (start-up warning names the missing ones) — details in `packages/engine/CLAUDE.md`.
- **`WEB_MONITORING_ENABLED`** must be exactly `'true'` to enqueue `discover-pages`/accept manual pages; unset = `false`. Keep it unset until `https://rivalmonday.com/bot` exists. Accepting/dismissing a suggestion still starts paid vendor collection (`gbp`/`reviews`/ads) either way — only web crawling is gated.
