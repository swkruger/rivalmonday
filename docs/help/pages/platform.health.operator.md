---
help_key: page:platform.health
audience: operator
title: Health
---
## What this page tells you

Whether the platform is running: the background worker, its job queues, the data vendors and how fresh the collected data is. Each row has a status: **Working**, **Slow** or **Down**. Spend and vendor balances live on the Costs page.

- **Worker:** when the background worker last recorded a heartbeat. Slow after 11 minutes, Down after 30 minutes or with no heartbeat.
- **Queues:** jobs waiting, running and failed in the last 24 hours, per queue. Slow when the oldest waiting job is over 30 minutes old or a job failed; Down over 2 hours.
- **Vendors:** calls and errors in the last 24 hours for each vendor called in the last 48 hours. Slow at 20% errors; Down at 50%, or with no successful call in 48 hours.
- **Sources:** the newest successful vendor call and web capture. Slow after 26 hours; Down after 72 hours or never.

## How to use it

1. **Start with the worker.** If it is Down, nothing else moves: queues fill up and sources go stale.
2. **Then the queues.** A queue on Slow with failures points at one job type; the error tracker (Open Sentry, when configured) has the details.
3. **Then vendors and sources.** A vendor on Down usually means an outage or an expired key; check its balance on Costs.

## Common questions

### Why does a queue show Slow when nothing is waiting?

A job in that queue failed in the last 24 hours. The status clears once a day passes without failures.

### Why is there no Open Sentry link?

The link appears only when error tracking is configured for this deployment.

### Who can open it?

Platform owners, staff and viewers.
