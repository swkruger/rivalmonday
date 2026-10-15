import { type DbEnvName, type GatewayEnv, gatewayMode } from '@cs/billing';

/**
 * R27: `billing:sync-plan` writes Stripe ids onto `plan` rows, so it runs only with the real Stripe gateway. Returns the
 * refusal message, or null when it may run. Fake ids must never reach a real database.
 */
export function syncPlanRefusal(env: GatewayEnv, envName: DbEnvName): string | null {
  switch (gatewayMode(env, envName)) {
    case 'real':
      return null;
    case 'none':
      return 'STRIPE_SECRET_KEY is not set: billing:sync-plan needs a real Stripe key.';
    default:
      return `billing:sync-plan refuses to run with the fake gateway (env ${envName}, a test run, or BILLING_FAKE_GATEWAY): it would store fake Stripe ids.`;
  }
}
