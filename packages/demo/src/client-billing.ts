import { agency, agencyConnect, client, clientBilling } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import { DEMO_BILLING_AGENCIES } from './billing';
import type { SeedContext } from './context';

/**
 * Phase 9b: Connect and per-client billing. The main demo agency (an exempt pilot, so eligible) is connected with a $199
 * default; Lone Star Cooling pays and Brazos Plumbing's last payment failed. It has only two active clients, so the
 * rest of the picture lives on the 9a "active" agency (also eligible), connected the same way: two paying clients, one
 * paused for non-payment and one with billing off. Totals: 3 paying, 1 payment needed, 1 paused. Account and
 * subscription ids are labelled fakes; the demo gateway is in-memory, so no Stripe call is ever made on them.
 */
export const DEMO_DEFAULT_PRICE_CENTS = 19_900;
export const DEMO_AUTO_PAUSE_DAYS = 14;

export async function seedClientBilling(ctx: SeedContext): Promise<void> {
  const { db, clock, ids } = ctx;
  const connect = (agencyId: string, key: string) =>
    db.insert(agencyConnect).values({
      agencyId, stripeAccountId: `acct_demo_${key}`, status: 'connected', chargesEnabled: true, detailsSubmitted: true,
      defaultPriceCents: DEMO_DEFAULT_PRICE_CENTS, defaultSetupFeeCents: 0, currency: 'usd', stripeProductId: `prod_demo_${key}`, stripeDefaultPriceId: `price_demo_${key}`,
      autoPauseAfterDays: DEMO_AUTO_PAUSE_DAYS, connectedAt: clock.daysAgo(40), updatedAt: clock.daysAgo(40),
    });
  const paying = (agencyId: string, clientId: string, key: string, cents: number, paidDaysAgo: number) =>
    db.insert(clientBilling).values({
      clientId, agencyId, enabled: true, state: 'active', priceCents: cents, stripePriceId: `price_demo_${key}`, billedPriceCents: cents,
      stripeCustomerId: `cus_demo_${key}`, stripeSubscriptionId: `sub_demo_${key}`, checkoutSentAt: clock.daysAgo(paidDaysAgo + 2), lastPaidAt: clock.daysAgo(paidDaysAgo),
      lastStripeEventAt: clock.daysAgo(paidDaysAgo), updatedAt: clock.daysAgo(paidDaysAgo),
    });
  const failing = (agencyId: string, clientId: string, key: string, failedDaysAgo: number) =>
    db.insert(clientBilling).values({
      clientId, agencyId, enabled: true, state: 'payment_needed', priceCents: DEMO_DEFAULT_PRICE_CENTS, stripePriceId: `price_demo_${key}`, billedPriceCents: DEMO_DEFAULT_PRICE_CENTS,
      stripeCustomerId: `cus_demo_${key}`, stripeSubscriptionId: `sub_demo_${key}`, checkoutSentAt: clock.daysAgo(80), lastPaidAt: clock.daysAgo(failedDaysAgo + 30),
      paymentFailedSince: clock.daysAgo(failedDaysAgo), lastStripeEventAt: clock.daysAgo(failedDaysAgo), updatedAt: clock.daysAgo(failedDaysAgo),
    });

  await connect(ids.agencyId, 'main');
  await paying(ids.agencyId, ids.clients.loneStar, 'lonestar', DEMO_DEFAULT_PRICE_CENTS, 9);
  await failing(ids.agencyId, ids.clients.brazos, 'brazos', 4);

  const [prairie] = await db.select({ id: agency.id }).from(agency).where(eq(agency.name, DEMO_BILLING_AGENCIES.active));
  if (!prairie) return;
  await connect(prairie.id, 'prairie');
  const [a, b, c] = await db.select({ id: client.id }).from(client).where(eq(client.agencyId, prairie.id)).orderBy(asc(client.createdAt));
  if (a) await paying(prairie.id, a.id, 'prairie_a', DEMO_DEFAULT_PRICE_CENTS, 12);
  if (b) await paying(prairie.id, b.id, 'prairie_b', 24_900, 20);
  if (c) {
    // Paused by the automatic non-payment rule: the failure is older than the 14-day window.
    await failing(prairie.id, c.id, 'prairie_c', 15);
    await db.update(client).set({ pausedAt: clock.daysAgo(1), pausedBy: 'auto' }).where(eq(client.id, c.id));
  }
}
