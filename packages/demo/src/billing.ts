import { currentStandardPlan } from '@cs/billing';
import { agency, agencyBilling, agencyBillingEvent, client, discountCode } from '@cs/db';
import type { SeedContext } from './context';
import { DAY } from './clock';

/** Phase 9a: three extra demo agencies, one per billing state; the main demo agency stays an exempt pilot. */
export const DEMO_BILLING_AGENCIES = {
  active: 'Prairie Growth Partners',
  trialing: 'Cedar Street Digital',
  pastDue: 'Mesquite Marketing Co',
} as const;
export const DEMO_DISCOUNT_CODE = 'DEMO-WELCOME20';

const CLIENT_NAMES = ['Comfort Pros HVAC', 'Redbud Plumbing', 'Bluebonnet Dental', 'Summit Air & Heat'];

/** Deterministic: every timestamp is relative to the seed clock (R25: the demo gateway is in-memory, so no invoices are seeded). */
export async function seedBilling(ctx: SeedContext): Promise<void> {
  const { db, clock } = ctx;
  const plan = (await currentStandardPlan(db))!;

  await db.insert(discountCode).values({
    code: DEMO_DISCOUNT_CODE, stripeCouponId: 'demo_coupon_welcome20', stripePromotionCodeId: 'demo_promo_welcome20', percentOff: '20.00', appliesTo: 'both',
    duration: 'repeating', durationMonths: 3, createdBy: 'demo-seed', createdAt: clock.daysAgo(60),
  });

  const make = async (name: string, clients: number) => {
    const [a] = await db.insert(agency).values({
      name, branding: { displayName: name, primary: '#1F7A8C', secondary: '#0F4C5C', fromName: name, signOff: `The ${name} team` }, createdAt: clock.daysAgo(120),
    }).returning({ id: agency.id });
    for (let i = 0; i < clients; i++) {
      await db.insert(client).values({ agencyId: a!.id, name: CLIENT_NAMES[i % CLIENT_NAMES.length]!, verticalId: i % 3 === 2 ? 'dental' : 'hvac_plumbing', status: 'active', createdAt: clock.daysAgo(100 - i) });
    }
    return a!.id;
  };
  const event = (agencyId: string, fromState: string | null, toState: string, reason: string, actor: string, daysAgo: number) =>
    db.insert(agencyBillingEvent).values({ agencyId, fromState, toState, reason, actor, createdAt: clock.daysAgo(daysAgo) });

  const activeId = await make(DEMO_BILLING_AGENCIES.active, 4);
  await db.insert(agencyBilling).values({
    agencyId: activeId, state: 'active', planId: plan.id, stripeCustomerId: 'cus_demo_active', stripeSubscriptionId: 'sub_demo_active', billableSeatsSynced: 1,
    attachedCouponId: 'demo_coupon_welcome20', stateChangedAt: clock.daysAgo(45), updatedAt: clock.daysAgo(1),
  });
  await event(activeId, null, 'trialing', 'signup', 'system', 75);
  await event(activeId, 'trialing', 'active', 'checkout completed', 'stripe', 45);

  const trialId = await make(DEMO_BILLING_AGENCIES.trialing, 2);
  await db.insert(agencyBilling).values({
    agencyId: trialId, state: 'trialing', planId: plan.id, trialEndsAt: new Date(clock.now.getTime() + 9 * DAY), stateChangedAt: clock.daysAgo(21), updatedAt: clock.daysAgo(21),
  });
  await event(trialId, null, 'trialing', 'signup', 'system', 21);

  const pastDueId = await make(DEMO_BILLING_AGENCIES.pastDue, 3);
  await db.insert(agencyBilling).values({
    agencyId: pastDueId, state: 'past_due', planId: plan.id, stripeCustomerId: 'cus_demo_past_due', stripeSubscriptionId: 'sub_demo_past_due', billableSeatsSynced: 0,
    pastDueSince: clock.daysAgo(2), stateChangedAt: clock.daysAgo(2), updatedAt: clock.daysAgo(2),
  });
  await event(pastDueId, null, 'trialing', 'signup', 'system', 50);
  await event(pastDueId, 'trialing', 'active', 'checkout completed', 'stripe', 20);
  await event(pastDueId, 'active', 'past_due', 'payment failed', 'stripe', 2);
}
