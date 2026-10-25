---
help_key: page:platform.billing
audience: operator
title: Billing & plans
---
## What this page tells you

Revenue, plans and sign-up controls for the whole platform. Everyone with platform access can read it; owners change things, staff can create invite links, viewers read only.

The page has five tabs: **Overview**, **Plans**, **Discount codes**, **Sign-up & invites** and **Stripe Connect**. Pausing sign-ups, publishing a plan version, revoking a code or link and changing a Connect fee each ask you to confirm first.

- **MRR** and **Paid seats** are summed over all agencies from the latest daily stats, so they can be up to a day behind.
- **Agencies by state** counts agencies in each billing state: Pilot, Trial, Active, Past due, Paused, Suspended and Cancelled. Past due becomes Paused after 7 days, and Paused becomes Suspended 30 days later.
- **Sign-up & invites** has the **Agency sign-up** panel, which shows whether open sign-up is open or paused (invite links work either way) and a funnel for the last 30 or 90 days: sign-ups, profiles completed, first clients added and cards added, split by open sign-up and invite link.
- **Plans** lists every plan version. A new version becomes current for new subscriptions; existing subscriptions keep their prices. Trial days is the length of a new trial. Each version also shows what it includes (Ask, MCP access), set with checkboxes when you publish; the form starts from the current version's choices.
- **Agencies not on the current version** sits under the plans table. It lists each agency still on an older version (or with none set), its state and its monthly price now and after a move. Owners tick agencies and choose **Move selected to v<N>**; agencies on hold cannot be ticked.
- **Discount codes** take a percentage or a dollar amount off the base price, the seats or both, for the first invoice, for 1 to 36 months, or forever, with an optional expiry date and maximum number of uses.
- **Stripe Connect** shows how many agencies have connected Stripe, their paying clients and client MRR, and the platform fee. An agency can have its own fee; leave it blank to use the default; 0 sends no fee. A change applies to Checkout links created afterwards.
- **Agency invite links**, below it on the same tab (owners and staff), lists links by their first characters only.

## How to use it

1. **Pause or resume open sign-up** (owners) when you need to stop new agencies signing up themselves.
2. **Publish a plan version** (owners) with a name, base price, included seats, extra seat price and trial days.
2a. **Move agencies to the current version** (owners): tick the agencies, then Move selected. The dialog shows each agency's price now and after, and warns when the new version includes fewer seats than the agency has active clients (a paid agency pays for the extra seats; a pilot or trial agency can't activate new clients until it is under the limit). Feature changes apply at once. A live subscription gets the new prices from its next billing date, with no proration. Agency admins are emailed when their price or features change. The result says how many moved and names any that did not, with the reason.
3. **Create a discount code** (owners). To limit it to certain agencies, paste their **agency ids** in the box, separated by commas or spaces, up to 100. An agency's id is the long code at the end of its page address, `/platform/agencies/<id>`. Every id must belong to an existing agency or the code is refused.
4. **Create an invite link** (owners and staff): choose Pilot or Trial, a pilot end date for pilots, an optional discount code, an optional email to lock it to (you can email it from here), max uses (1 to 1,000), expiry (1 to 90 days, 14 if blank) and a note. Copy the link straight away: it is shown once and cannot be retrieved later.
5. **Set Connect fees** (owners) for everyone or for one agency.

## Common questions

### Why can't a restricted code go on an invite link?

The agency created from a link does not exist yet, so a code limited to named agencies could never apply. A restricted code also has no promotion code, so agencies cannot type it at checkout; attach it from the agency's page (or the agency's Redeem form).

### Why must a pilot end after the link expires?

The pilot has to outlast the link. The form warns you before you submit: it asks for a later pilot end date or a shorter expiry.

### What does revoking do?

A revoked link or code can no longer be used.

### Why is MRR zero?

MRR comes from the newest daily stats row. On a fresh environment it stays zero until the nightly job has run.
