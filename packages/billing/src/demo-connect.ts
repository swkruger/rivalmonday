import type { FakeGateway } from './fake-gateway';
import type { SubscriptionStatus } from './types';

/**
 * Phase 9b demo: the Stripe objects behind the demo's Connect rows. `@cs/demo` seeds `agency_connect`/`client_billing`
 * from these constants and `gatewayFor(…, 'demo')` registers the same ids in its in-memory fake, so demo actions
 * (turn billing on/off, change price, Manage payment) find the account, prices and subscriptions they act on. One source
 * of truth: the ids cannot drift between the DB rows and the fake.
 */
export const DEMO_CONNECT_DEFAULT_PRICE_CENTS = 19_900;

/** Connected accounts by key (`main` = the main demo agency, `prairie` = the 9a "active" agency). */
export const DEMO_CONNECT_ACCOUNTS = ['main', 'prairie'] as const;
export type DemoConnectAccount = (typeof DEMO_CONNECT_ACCOUNTS)[number];

export interface DemoConnectSubscription {
  key: string;
  account: DemoConnectAccount;
  cents: number;
  status: Extract<SubscriptionStatus, 'active' | 'past_due'>;
}

/** One subscription per billed demo client, keyed like the demo seed's clients. */
export const DEMO_CONNECT_SUBSCRIPTIONS: readonly DemoConnectSubscription[] = [
  { key: 'lonestar', account: 'main', cents: DEMO_CONNECT_DEFAULT_PRICE_CENTS, status: 'active' },
  { key: 'brazos', account: 'main', cents: DEMO_CONNECT_DEFAULT_PRICE_CENTS, status: 'past_due' },
  { key: 'prairie_a', account: 'prairie', cents: DEMO_CONNECT_DEFAULT_PRICE_CENTS, status: 'active' },
  { key: 'prairie_b', account: 'prairie', cents: 24_900, status: 'active' },
  { key: 'prairie_c', account: 'prairie', cents: DEMO_CONNECT_DEFAULT_PRICE_CENTS, status: 'past_due' },
];

/** Labelled fake ids (never real Stripe objects). Account-level ids take the account key, client-level ones the client key. */
export const demoConnectIds = {
  account: (k: DemoConnectAccount) => `acct_demo_${k}`,
  product: (k: DemoConnectAccount) => `prod_demo_${k}`,
  defaultPrice: (k: DemoConnectAccount) => `price_demo_${k}`,
  clientPrice: (clientKey: string) => `price_demo_${clientKey}`,
  subscription: (clientKey: string) => `sub_demo_${clientKey}`,
  customer: (clientKey: string) => `cus_demo_${clientKey}`,
};

/** Registers the demo's connected accounts (charges enabled), default and client prices, and subscriptions in `gw`. */
export function seedDemoConnect(gw: FakeGateway): void {
  for (const k of DEMO_CONNECT_ACCOUNTS) {
    const stripeAccount = demoConnectIds.account(k);
    gw.seedConnectedAccount({ id: stripeAccount, chargesEnabled: true, detailsSubmitted: true });
    gw.connectedProducts.set(demoConnectIds.product(k), { id: demoConnectIds.product(k), stripeAccount, name: 'Competitor monitoring' });
    gw.seedConnectedPrice({ id: demoConnectIds.defaultPrice(k), stripeAccount, productId: demoConnectIds.product(k), unitAmountCents: DEMO_CONNECT_DEFAULT_PRICE_CENTS });
  }
  for (const s of DEMO_CONNECT_SUBSCRIPTIONS) {
    const stripeAccount = demoConnectIds.account(s.account);
    const priceId = demoConnectIds.clientPrice(s.key);
    gw.seedConnectedPrice({ id: priceId, stripeAccount, productId: demoConnectIds.product(s.account), unitAmountCents: s.cents });
    gw.seedConnectedSubscription({ id: demoConnectIds.subscription(s.key), stripeAccount, customerId: demoConnectIds.customer(s.key), priceId, status: s.status });
  }
}
