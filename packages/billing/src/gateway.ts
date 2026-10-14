import { fakeGateway } from './fake-gateway';
import { stripeGateway } from './stripe-gateway';
import type { BillingGateway } from './types';

export type DbEnvName = 'dev' | 'demo' | 'test';

export interface GatewayEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_TAX_ENABLED?: string;
  NODE_ENV?: string;
  VITEST?: string;
}

/**
 * The repo's DEMO/TEST notion is the active database name (`activeEnvName()`: 'dev' | 'demo' | 'test'), not an env var;
 * callers must pass it as the required `envName` (never defaulted, so a forgotten DEMO/TEST fails to compile). Fake whenever there is no Stripe key, DEMO or TEST is live, or the process is a test run.
 */
export function usesFakeGateway(env: GatewayEnv, envName: DbEnvName): boolean {
  return !env.STRIPE_SECRET_KEY?.trim() || envName === 'demo' || envName === 'test' || env.NODE_ENV === 'test' || !!env.VITEST;
}

export function gatewayFor(env: GatewayEnv, envName: DbEnvName): BillingGateway {
  if (usesFakeGateway(env, envName)) return fakeGateway();
  return stripeGateway(env.STRIPE_SECRET_KEY!.trim(), {
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    taxEnabled: env.STRIPE_TAX_ENABLED === 'true',
  });
}
