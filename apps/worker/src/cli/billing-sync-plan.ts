import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { gatewayFor, syncPlanToStripe } = await import('@cs/billing');
const { createDb, plan, resolveActiveEnvName } = await import('@cs/db');
const { and, eq, isNull, or } = await import('drizzle-orm');

const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const envName = resolveActiveEnvName(process.env, repoRoot);
if (!process.env.STRIPE_SECRET_KEY?.trim()) console.warn('STRIPE_SECRET_KEY is not set: using the fake gateway (ids below are not real Stripe ids).');

const gw = gatewayFor(process.env, envName);
const { db, close } = createDb(url);
let code = 0;
try {
  const pending = await db
    .select({ id: plan.id })
    .from(plan)
    .where(and(eq(plan.isCurrent, true), or(isNull(plan.stripeBasePriceId), isNull(plan.stripeSeatPriceId))));
  if (!pending.length) console.log('Every current plan already has Stripe prices.');
  for (const { id } of pending) {
    const p = await syncPlanToStripe(db, gw, id);
    console.log(`${p.code} v${p.version}: base ${p.stripeBasePriceId} (product ${p.stripeProductId}), seat ${p.stripeSeatPriceId} (product ${p.stripeSeatProductId})`);
  }
} catch (e) {
  console.error('billing:sync-plan failed:', e instanceof Error ? e.name : 'Error');
  code = 1;
} finally {
  await close();
}
process.exit(code);
