---
help_key: page:agency.settings.billing
audience: agency
title: Billing
---
## What this page tells you

Your agency's plan, what it covers, what you will be invoiced next, and how your own clients pay you. Only agency admins can open it.

- **The plan card** names your plan and its state (Pilot, Free trial, Active, Payment overdue, Read-only, Suspended or Cancelled), with the key date for that state. Under it, one line spells out your price: the monthly price, how many clients the plan includes, and the price of each extra client. Plans can be priced differently, so read your figures from that line.
- **Clients** counts your active clients against the clients the plan includes. A client counts when it is active and not paused. Prospects do not count, and a paused client stops counting. *Download client report (CSV)* lists each active client and the date it was added.
- **Next invoice** shows the amount and date, less any discount. It is the plan price plus any extra clients.
- **Client billing** is separate from your plan: it is how your own clients pay you through your Stripe account.
- **Discount code** and **Recent invoices** are at the bottom.

## How to use it

1. **Check the plan line and the Clients count.** If Clients shows more clients than the plan includes, each extra client is billed at the extra-client price on the plan card. An increase is prorated at once; a decrease applies at the next renewal.
2. **Add a payment method** while you are on a pilot or trial. The button reads *Add payment method*; after that it reads *Manage billing* (or *Subscribe* if your subscription has ended). If you signed up yourself, your trial allows 1 active client until you add a payment method.
3. **Bill your own clients.** Under Client billing choose *Connect Stripe* and finish Stripe's setup. Then set the default monthly price, the setup fee and, if you want, how many days (1 to 90) before an unpaid client is paused. A new price applies to new sign-ups; existing subscriptions are unchanged. Payments go straight to you.
4. **Redeem a discount code** in the Discount code box. The discount then shows on the plan card and in the next invoice amount.

## Common questions

### What does "payment overdue" mean for me?

A payment failed, or the trial ended without a card. Everything still works, but you cannot add active clients, and service pauses 7 days after it went overdue. The plan card shows the date. Update your payment method with *Manage billing* and the account is Active again as soon as the payment goes through.

### What happens when the account is Read-only or Suspended?

Read-only: your history stays viewable, but monitoring, briefs, alerts and the assistant stop. Suspended follows 30 days later: only this page works, and your data is kept. Your clients' people see a notice that the workspace is temporarily unavailable.

### Why does the plan say "includes 3 clients" and the count say "Clients: 2 of 3"?

They are the same number. The included clients are the clients you can have active before extra clients are billed. The number on your plan card is the one that applies to you.

### Does pausing a client lower my bill?

A paused client is no longer monitored and stops counting toward your clients. The lower count reaches your invoice at the next renewal.

### Why can I not open this page?

Billing is for agency admins. Account managers and client roles get a "not found" page.
