---
help_key: page:platform.health
audience: operator
title: Health
---
## What this page tells you

Whether the platform is running: the background worker, its job queues, the data vendors and how fresh the collected data is. Each row has a status: **Working**, **Slow** or **Down**. Vendor balances and spend totals live on the Costs page; the **Spend guard** card below shows whether AI work is running normally.

- **Worker:** when the background worker last recorded a heartbeat. Slow after 11 minutes, Down after 30 minutes or with no heartbeat.
- **Queues:** jobs waiting, running and failed in the last 24 hours, per queue. Slow when the oldest waiting job is over 30 minutes old or a job failed; Down over 2 hours.
- **Vendors:** calls and errors in the last 24 hours for each vendor called in the last 48 hours. Slow at 20% errors; Down at 50%, or with no successful call in 48 hours.
- **Sources:** the newest successful vendor call and web capture. Slow after 26 hours; Down after 72 hours or never.
- **Spend guard:** compares the last 24 hours of AI spend with its normal level, for all providers together and for OpenRouter and Anthropic separately. **OK** is normal; **Warning** means spend is above normal by the warn percentage; **Paused** means it is above normal by the pause percentage, so every AI call is held and queued work waits. A scope marked *floor* is too small in dollars to trigger anything. The card also lists clients paused for reaching their own monthly limit, and the last 50 guard events. The guard checks hourly.

## How to use it

1. **Start with the worker.** If it is Down, nothing else moves: queues fill up and sources go stale.
2. **Then the queues.** A queue on Slow with failures points at one job type; the error tracker (Open Sentry, when configured) has the details.
3. **Then vendors and sources.** A vendor on Down usually means an outage or an expired key; check its balance on Costs.
4. **If the spend guard shows Paused,** find out why spend jumped (the vendor call counts on Costs and the error tracker help), then use **Reset** (owners and staff). Reset asks for a short note of up to 200 characters, resumes queued AI work, and keeps the guard quiet for the snooze period, so a reading at pause level only warns during that time. Reset is not offered when the guard is OK.

## Common questions

### Why does a queue show Slow when nothing is waiting?

A job in that queue failed in the last 24 hours. The status clears once a day passes without failures.

### Why is there no Open Sentry link?

The link appears only when error tracking is configured for this deployment.

### Why is a client paused when the platform guard is OK?

The client went well past its own monthly limit. That pause is separate from the platform guard: it lifts on the 1st of next month, or when you raise the client's limit on the agency page (Client limits).

### Who can open it?

Platform owners, staff and viewers. Only owners and staff can Reset.
