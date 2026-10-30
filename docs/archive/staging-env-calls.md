# staging-env — agent calls for owner review (merged 2026-10-30)

The owner skipped brainstorming ("go ahead"); these defaults were the agent's calls. Overturn any by editing [STAGING.md](../STAGING.md) and the CI files.

1. DB = Neon branch `staging` in the dev project (child of the branch holding cs_dev), not a separate project: instant copy, refresh = reset from parent. Cost: us-east-2 vs Vercel iad1 latency.
2. Vercel **custom environments** (Pro) in the existing web/site projects; Railway **environment** `staging` on the same service.
3. Staging worker: `VENDOR_FAKE_MODE=fixtures` (no vendor spend, no duplicate pulls), AI live with its own capped OpenRouter key, `WEB_MONITORING_ENABLED` unset.
4. Email delivered via a separate Postmark server; refresh neutralises dev outbox/webhooks/jobs/sessions.
5. `REVIEWER_HASH_SALT` on staging = dev's (copied hashes).
6. SQL roles carry dev's passwords after a reset, so the refresh re-applies staging passwords from GitHub secrets (`STAGING_PW_*`).
7. Refresh is manual (data on staging is lost on refresh); deploys automatic on every main push.

