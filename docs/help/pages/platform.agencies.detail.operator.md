---
help_key: page:platform.agencies.detail
audience: operator
title: Agency
---
## What this page tells you

One agency in full: its health flag, four live figures, charts, team, clients, billing and recent support sessions. The subtitle shows when it was created.

- **Health** (next to the title) uses the same rules as the Agencies list.
- **The four figures** (active clients, seats, weekly active users, spend this month) are today's live values with a change since 28 days ago. The range toggle switches the charts between 12 weeks and 12 months.
- **Team** counts the different people in each role: agency admins, account managers, client owners and client viewers.
- **Clients** lists every client with its status and the date it was created.
- **Billing** shows the state, plan and version, trial and pilot end dates, how many seats Stripe has been told about ("sync pending" means an update is queued), the pilot client limit, the attached coupon id, recent invoices and the last five billing events.
- **Client limits** lists each client's spend this month in dollars, its effective monthly limit, its level (OK, Near limit, Reached or Paused), an optional limit override, its competitor limit and its Ask questions per month.
- **Support sessions** lists the agency's recent sessions.

## How to use it

1. **Open a support session** with **View as agency** (platform owners and staff only). Enter a reason of 5 to 300 characters; the agency can read it. The session lasts 60 minutes and is read-only: every write is refused. It is recorded in the agency's audit log, and the agency can ask to be emailed when one opens.
2. **Adjust billing** if you are an owner or staff: grant a pilot (with an optional end date) or end one, extend a trial, attach a discount code. Only owners can lift or restore the pilot client limit. Viewers read only.
3. **Set client limits** if you are an owner or staff: type a dollar amount in Limit override to replace the platform default, or leave it blank to use the default; change the competitor limit or Ask quota; then Save the row. Saving a higher limit lifts a spend pause when the client is back under the pause level, and the tenant sees "Pause lifted." Viewers read only. Never change a client's paused state in SQL: a spend pause is separate from the agency's own pause.
4. **Check the audit trail.** Opening this page is itself recorded in the agency's audit log under your platform role.

## Common questions

### What can I see in a support session?

The agency's pages as its admin would, read-only. Email addresses on the agency's Team page are partly hidden from support. Nothing can be changed.

### What is the pilot client limit?

Pilot agencies can only add clients up to a limit unless they are exempt. The billing panel shows whether this agency is exempt; owners can lift or restore the limit.

### Why is a client Paused here?

It used well past its monthly limit (130% of it by default). AI and monitoring work for that client stops until the 1st of next month, or until you raise its limit. The agency's admins were emailed and see a banner; the client's people are told their team has been informed.

### Why can't I see View as agency?

Only platform owners and staff can start a support session.

