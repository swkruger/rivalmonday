import { seedDemoConnect } from './demo-connect';
import { fakeGateway } from './fake-gateway';
import { stripeGateway } from './stripe-gateway';
import type { BillingGateway } from './types';

export type DbEnvName = 'dev' | 'demo' | 'test';

export interface GatewayEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
  STRIPE_TAX_ENABLED?: string;
  NODE_ENV?: string;
  VITEST?: string;
  /** `'1'` = the fake gateway. E2E only (the Playwright server runs `next start`, so NODE_ENV is production); refused on Vercel production by `parseWebEnv`. */
  BILLING_FAKE_GATEWAY?: string;
}

/** `fake` = in-memory gateway; `real` = Stripe; `none` = billing is not configured (no gateway at all). */
export type GatewayMode = 'fake' | 'real' | 'none';

/**
 * R27: the repo's DEMO/TEST notion is the active database name (`activeEnvName()`: 'dev' | 'demo' | 'test'), not an env
 * var; callers must pass it as the required `envName`. Fake for DEMO/TEST databases, test runs and the explicit E2E flag;
 * otherwise Stripe when a key is set, else `none`. A keyless DEV/production process never gets the fake, so fake ids
 * cannot reach a real database.
 */
export function gatewayMode(env: GatewayEnv, envName: DbEnvName): GatewayMode {
  if (envName === 'demo' || envName === 'test' || env.NODE_ENV === 'test' || !!env.VITEST || env.BILLING_FAKE_GATEWAY === '1') return 'fake';
  return env.STRIPE_SECRET_KEY?.trim() ? 'real' : 'none';
}

export const usesFakeGateway = (env: GatewayEnv, envName: DbEnvName): boolean => gatewayMode(env, envName) === 'fake';

/** The gateway for this process, or `null` when billing is not configured (callers degrade or refuse). */
export function gatewayFor(env: GatewayEnv, envName: DbEnvName): BillingGateway | null {
  switch (gatewayMode(env, envName)) {
    case 'fake': {
      // The E2E flag opts into finishing onboarding on a re-link (the browser flow cannot visit Stripe). DEMO pre-registers
      // the Stripe objects behind the demo seed's Connect rows (per process, in memory; see `@cs/demo` CLAUDE.md).
      const gw = fakeGateway({ completeOnboardingOnRelink: env.BILLING_FAKE_GATEWAY === '1' });
      if (envName === 'demo') seedDemoConnect(gw);
      return gw;
    }
    case 'real':
      return stripeGateway(env.STRIPE_SECRET_KEY!.trim(), {
        webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
        connectWebhookSecret: env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || undefined,
        taxEnabled: env.STRIPE_TAX_ENABLED === 'true',
      });
    default:
      return null;
  }
}
