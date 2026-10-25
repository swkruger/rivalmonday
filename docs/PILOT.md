# Pilot runbook (7c2)

Pilot = up to 20 agencies x up to 3 clients, slow invites (root `CLAUDE.md` § Pilot). Deploy: [DEPLOY.md](DEPLOY.md). Dev/ops commands: [OPS.md](OPS.md). Spec: `superpowers/specs/2026-10-22-phase-7c-quality-scale-pilot-design.md`.

## 1. Gate (all true before the first invite)
- [ ] 7c1 gates green on `main` (isolation suite, `eval:replay`, `evals-live` required check).
- [ ] Staging rehearsal passed (`pnpm --filter @cs/demo rehearsal report` ends `RESULT: PASS`; OPS § Rehearsal). Final concurrency/limit numbers are the code defaults.
- [ ] BACKLOG "Launch gate" closed and the live deploy done (DEPLOY § First-time setup and § Checklist; `/healthz` shows `queueGrants: ok`).
- [ ] Prod has no QA, CS Dev or rehearsal tenants (service role, must return 0 rows):
```sql
SELECT id, name FROM agency
 WHERE id = 'aaf5e009-974b-4ce8-b7ec-b722c5c66b1c' OR name ILIKE 'Internal QA%' OR name ILIKE 'CS Dev%' OR name ILIKE 'Rehearsal%';
```
- [ ] `WEB_MONITORING_ENABLED` is set only after `https://rivalmonday.app/bot` and `/robots.txt` load signed-out (DEPLOY § Env).
- [ ] Owner has signed off the pilot copy (feedback lines, ops alert email, readiness panel).

## 2. Invite batches
1. First batch: at most 3 agencies, by invite link (agency onboarding, Phase 10). Slow: no open sign-up promotion.
2. Next batch only after a **clean first weekly**: Friday readiness showed no open critical issue for the batch, Monday sends landed (all `sent_at` before 07:15 local), no leak or unsupported-claim report, `/platform/costs` inside the limits.
3. Each batch: confirm the agency's clients finish setup (wizard) and the starting point is sent within its 48 h + 6 h window.

## 3. Daily checks (5 minutes)
- `/platform/health`: all green; **Brief readiness** (only Thursday 22:00 local to Monday 07:00 shows counts) and **Spend guard** (state OK, no `spike_*`).
- Sentry (web + worker, `production`): new issues, missed `system-heartbeat` check-in.
- Postmark: bounces and spam complaints (the webhook marks contacts bounced; `contact_bounced` notices reach agencies).
- Railway worker memory and restarts (one replica); Neon connections.
- Expired `vendor-collect` jobs (paid calls retried after a long limiter wait; queue expiry is 1 h): `SELECT count(*) FROM (SELECT name, state, output, created_on FROM pgboss.job UNION ALL SELECT name, state, output, created_on FROM pgboss.archive) j WHERE name = 'vendor-collect' AND state = 'failed' AND output::text LIKE '%timeout in active state%' AND created_on > now() - interval '1 day'` should be 0; if not, lower `vendor-collect`/`rival-search` (OPS § Queue concurrency).

## 4. Weekly checks
- **Friday after 12:00 client-local time (readiness checkpoint; each time zone crosses it at its own hour):** panel "Briefs for Monday {date}": `Missing` and `Failed` should be 0. A critical issue also emails platform owners/staff once per time zone (OPS § `ops_alert`). Fix, then re-run generation (OPS) before Sunday 19:00.
- **Sunday 19:00 / Monday 07:00 local:** `Awaiting approval` should be 0 (auto-send off clients must be approved by their AM; nudge the agency).
- **Monday:** sends done by 07:15, notifications by 07:45 local; Postmark activity clean.
- **`/platform/costs`:** per-client month-to-date vs limit (default $15), top spenders, vendor spend; raise a limit only on purpose (OPS § Spend guard).
- **Feedback review (below).**

## 5. Feedback
- Clients write to their agency (mailto lines in brief/alert emails and on the brief page); agencies write to us (avatar menu "Send feedback", welcome email). Everything lands in the support inbox.
- Log each item as a GitHub issue with label `pilot-feedback` plus one row in the pilot sheet (date, agency, client, page or email, type: bug / wrong claim / copy / idea, link). **Reviewed Fridays** with the readiness check; a wrong or unsupported claim is investigated the same day (it blocks the next batch).

## 6. Kill switches (fastest first)
| Problem | Do |
|---|---|
| Crawler complaint or ban | Unset `WEB_MONITORING_ENABLED` on Railway and Vercel, then redeploy the worker (Railway) and the web app (Vercel: env changes apply only to a new deployment). Vendor collection continues. |
| Worker overload (memory, DB connections, vendor throttling) | Set `WORKER_QUEUE_CONCURRENCY` to `queue=1,...` for the busy queues (OPS § Queue concurrency) and redeploy. Unset = shipped defaults. |
| AI spend spike | Health -> Spend guard -> Reset (note required) only after checking `llm_call`/`vendor_call`; a +200 % pause stops all AI until reset (OPS § Spend guard). |
| One client misbehaving or unpaid | Pause the client (`client.paused_at`: no recurring work, no seat) from the agency page; spend-pause is separate. |
| One agency | Agency management hold (read-only + collection paused); archive only for offboarding (OPS § Archive and purge). |

## 7. Success metrics (core spec §1.4) as SQL
Service role, read-only, over the pilot weeks (`:from` = pilot start). Targets in brackets.

**Items rated useful by AMs [>= 60 %]** (latest rating per item; any rater, in practice the agency's AMs):
```sql
SELECT round(100.0 * count(*) FILTER (WHERE (after->>'useful')::boolean) / nullif(count(*), 0), 1) AS pct_useful, count(*) AS rated
  FROM (SELECT DISTINCT ON (subject_id) subject_id, after FROM feedback
         WHERE kind = 'rating' AND subject_type = 'brief_item' AND created_at >= :from
         ORDER BY subject_id, created_at DESC) r;
```
**AM review time per brief [<= 5 min]**: first `feedback` row on the brief's items made before `brief.approved_at`, to `approved_at`; 0 when the brief was approved untouched (auto-sent briefs without `approved_at` are excluded).
```sql
SELECT round(avg(extract(epoch FROM (b.approved_at - coalesce(f.first_touch, b.approved_at))) / 60)::numeric, 1) AS avg_minutes
  FROM brief b
  LEFT JOIN LATERAL (SELECT min(fb.created_at) AS first_touch
                       FROM feedback fb JOIN brief_item bi ON bi.id = fb.subject_id AND fb.subject_type = 'brief_item'
                      WHERE bi.brief_id = b.id AND fb.created_at <= b.approved_at) f ON true
 WHERE b.approved_at IS NOT NULL AND b.kind = 'standard' AND b.created_at >= :from;
```
Ratings made after approval are late ratings, not review time: the `created_at <= approved_at` filter leaves them out (never negative).

**Unsupported claims reaching clients [0]**: eval B2 (`evals-live` nightly + `pnpm eval:replay`, OPS § Evals) must stay clean; plus every `pilot-feedback` item typed "wrong claim" (Friday review). Any confirmed case is a blocker.

**Recommendations done or in progress [>= 25 %]:**
```sql
SELECT round(100.0 * count(*) FILTER (WHERE status IN ('done','in_progress')) / nullif(count(*), 0), 1) AS pct_acted, count(*) AS total
  FROM recommendation WHERE created_at >= :from AND status <> 'dismissed';
```
**Client attach [>= 25 %]** (clients with agency-to-client billing active, of active clients):
```sql
SELECT round(100.0 * count(*) FILTER (WHERE cb.state = 'active') / nullif(count(*), 0), 1) AS pct_attached, count(*) AS active_clients
  FROM client c LEFT JOIN client_billing cb ON cb.client_id = c.id
 WHERE c.status = 'active' AND c.archived_at IS NULL;
```
**Weekly active use [>= 40 %]** (client-role users of enabled clients with a web/Ask tool call in the last 7 days):
```sql
SELECT count(DISTINCT m.user_id) FILTER (WHERE a.user_id IS NOT NULL) AS active_users, count(DISTINCT m.user_id) AS client_users
  FROM membership m
  LEFT JOIN audit_log a ON a.user_id = m.user_id AND a.agency_id = m.agency_id AND a.channel IN ('web','ask') AND a.created_at >= now() - interval '7 days'
 WHERE m.role IN ('client_owner','client_viewer');
```

**Technical cost per client per month [<= $15]:** read `/platform/costs` (month-to-date per client, shared competitor cost split across trackers: `spendByClient` in `@cs/db` `spend.ts`). Raw check without the split: `SELECT client_id, sum(cost_usd) FROM (SELECT client_id, cost_usd, created_at FROM llm_call UNION ALL SELECT client_id, cost_usd, created_at FROM vendor_call) x WHERE created_at >= date_trunc('month', now()) GROUP BY 1 ORDER BY 2 DESC;`.

## 8. `/link-other-account` (never run live; do once, owner)
Behaviour: a link `/l/<token>` opened while a **different** user is signed in lands on `/link-other-account` instead of switching identity.
1. Pick two real mailboxes: A (a client contact, e.g. owner's second address) and B (any invited agency user).
2. Sign in as B in browser profile 1; send a brief (or alert) email to A's contact (`deliver-once` or a test agency).
3. In the same profile (still signed in as B) open A's email link.
4. Expect the page "This link was sent to someone else" (not the brief, no session change) with a Sign out button. After signing out, opening the same link again shows A's brief as a guest session.
5. Record the result in the work file; failures go to BACKLOG.

## 9. Pilot end
8 weeks. Run section 7, record numbers in `docs/STATE.md`, decide wholesale white-label go/no-go.
