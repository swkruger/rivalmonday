---
help_key: page:platform.agencies
audience: operator
title: Agencies
---
## What this page tells you

Every agency on the platform, with live figures, a health flag and its billing state, one row each.

- **Active clients** are clients that are active and not paused. **Prospects** are clients that are not active yet.
- **Seats** are the people with an agency role plus the people with a client role.
- **WAU** is the number of people active in the last 7 days.
- **Last activity** is the latest activity by anyone in the agency, client users included. A dash means none yet.
- **Spend this month** is AI and data cost recorded against the agency since the 1st (UTC).
- **Billing** is the billing state: Pilot, Trial, Active, Past due, Paused, Suspended or Cancelled.

### The Health flag

The first rule that matches wins:

- **At risk**: the agency is at least 28 days old and nobody on its agency team has been active in the app for 14 days (or ever), or it has fewer active clients than 28 days ago.
- **Idle**: at least 14 days old, has an active client and has sent no brief in the last 14 days.
- **Growing**: at least 28 days old with more active clients than 28 days ago.
- **Steady**: anything else, including every agency under 14 days old.

The 28-day comparison is skipped when no figures were stored for that day. "Active in the app" for the At risk rule means the agency team (admins and account managers); Last activity counts everyone.

### Billing states

Past due means a payment failed, or a trial or subscription ended unpaid. An agency that stays 7 days past due becomes Paused (read-only); 30 days after that it becomes Suspended.

### Status filters

Above the table, **Active**, **On hold**, **Archived** and **All** filter the list; On hold and Archived show how many agencies each holds. Active includes agencies on hold, which show an On hold chip. The Archived view lists the date each agency was archived, marks it "purge possible" once it is 30 days old, and gives owners an Unarchive button. Search, sorting and paging keep the filter you picked.

## How to use it

1. **Sort** by clicking a heading. Agency and Health start A to Z (At risk first); the other columns start with the highest or newest.
2. **Open an agency** by clicking its name to see its detail, billing and support sessions.
3. **Look at At risk and Idle first.** Check the agency's detail for the dates behind the flag before reaching out.

## Common questions

### Why is a new agency Steady?

Health looks at agencies that are at least 14 days old. Younger ones are always Steady.

### Why do Seats not match the Billing page's paid seats?

Seats here are people with an agency or client role. Paid seats on Billing & plans is a separate figure, taken from the daily stats.

### Where do agencies come from?

They sign up through open sign-up or an invite link. Both are managed on Billing & plans.
