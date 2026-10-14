import { InvalidSignature, gatewayFor, handleStripeEvent, usesFakeGateway } from '@cs/billing';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) => Response.json(body, { status });

/** `POST /api/stripe/webhook`: public in `proxy.ts`; authenticates by Stripe signature only. Bodies/payloads are never logged. */
export async function POST(req: Request) {
  const env = activeEnvName();
  const stripeEnv = webEnv().stripe ?? {};
  // R13: the fake gateway accepts a constant signature, so a keyless production deployment must not serve this route.
  if (usesFakeGateway(stripeEnv, env) && process.env.NODE_ENV === 'production' && env !== 'test') return new Response('Not found', { status: 404 });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);
  const rawBody = await req.text();
  const gw = gatewayFor(stripeEnv, env);
  let event;
  try {
    event = gw.verifyWebhook(rawBody, signature);
  } catch (e) {
    if (e instanceof InvalidSignature) return json({ error: 'Invalid signature' }, 400);
    throw e;
  }
  try {
    const result = await handleStripeEvent(dbs(env).service, gw, event);
    return json({ received: true, result }, 200);
  } catch {
    return json({ error: 'Webhook processing failed' }, 500);
  }
}
