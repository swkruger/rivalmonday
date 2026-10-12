# @cs/ask — working notes
Ask assistant "Friday" (Phase 6b): quota transaction, turn orchestration, guard, SSE events. Task 13 fills this in.

## Gotchas
- **Clients never learn counts or quotas.** `beginTurn` returns only `ok`/`quota`; never surface `client.ask_monthly_quota` or usage to a client role.
- **Quota is per client, across users.** `ask_message` RLS is author-only, so usage is read through the `ask_quota_used()` SECURITY DEFINER count function (migration 0044), under a per-client advisory lock.
