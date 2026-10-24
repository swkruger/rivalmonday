---
help_key: page:platform.costs
audience: operator
title: Costs
---
## What this page tells you

What it costs to run {{product}}: vendor balances, monthly spend and manual costs. Only platform owners can open it. Vendor balances refresh daily at 06:00 UTC; **Refresh now** queues a refresh, and the button shows Refreshing while one is queued.

- **Spent this month** is API spend so far plus manual costs for the month. **Projected this month** is API spend so far divided by the days elapsed, times the days in the month, plus manual costs; it moves a lot early in the month. **Warnings** counts the services that are Low.
- **Services** lists each vendor with a status: **OK**; **Low** (the balance is under its low-balance threshold, or the days left are at or under the warning window, 7 days unless changed); **Error** (the last reading failed); **Unavailable on this plan** (the vendor does not report this figure); **Not configured** (no reading yet); **Off** (tracking is switched off). Days left comes from how fast the balance fell over the last 14 days, and is blank with fewer than two readings.
- **Monthly spend** shows the last six months, API usage and manual costs stacked. It is approximate: for balance services the spend is the sum of drops between daily readings (top-ups are ignored), and a month with fewer than two readings counts as zero. Usage services use their last reading of the month.
- **AI by business type (last 30 days)** shows AI calls and cost per business type. A merged business type is counted under the one it was merged into.
- **Limits & spike guard** (owners only) holds the settings that decide when AI work is limited: how many credits equal $1 (tenants see credits, you see dollars), the default monthly limit per client, the percentage of a client's limit at which its AI and monitoring work pauses, the warn and pause percentages for an AI spend spike, the two daily spend floors that stop tiny numbers from triggering the guard, and how long the guard stays quiet after a reset. Only the fields you change are saved.
- **Manual costs** are costs the vendors cannot report. A monthly item counts every month, a yearly item one twelfth a month, a one-off item in the month it starts. Archiving keeps past months' totals.

## How to use it

1. **Check Warnings.** When a service turns Low, owners are emailed once (again only after it recovers and turns Low again), and a strip shows at the top of every platform page.
2. **Edit a service** to set its billing link, low-balance threshold and warning window. Some services need a dollars-per-unit rate before they can warn. Usage services without a plan cap never warn.
3. **Add manual costs** with the dialog under Manual costs; Archive ends a recurring cost.
4. **Watch Projected this month** against what you expect to pay.
5. **Change a guard setting** in Limits & spike guard and save. A client's own limit is set on its agency page under Client limits, not here.

## Common questions

### Why does a service say Not configured?

The worker has not written a reading yet. Only the worker holds the vendor credentials.

### Why is days left blank?

There are fewer than two balance readings in the last 14 days, or the balance did not fall.

### Why does saving a guard setting say Nothing to change?

No field differs from what is stored. A field left with text that is not a number is refused with Enter numbers only.

### Why don't these numbers match the Overview page?

Overview's spend is only cost recorded against an agency. This page is what the vendors charge the platform.
