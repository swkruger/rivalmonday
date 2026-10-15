import { InvalidSignature, gatewayFor, gatewayMode, handleStripeEvent } from '@cs/billing';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) => Response.json(body, { status });
const notFound = () => new Response('Not found', { status: 404 });

/** `POST /api/stripe/webhook`: public in `proxy.ts`; authenticates by Stripe signature only. Bodies/payloads are never logged. */
export async function POST(req: Request) {
  const env = activeEnvName();
  const stripeEnv = webEnv().stripe ?? {};
  const mode = gatewayMode(stripeEnv, env);
  // R27: billing not configured => no gateway, no webhook.
  if (mode === 'none') return notFound();
  // R13: the fake gateway accepts a constant signature, so a production server must not serve it (TEST db excepted).
  if (mode === 'fake' && process.env.NODE_ENV === 'production' && env !== 'test') return notFound();
  if (mode === 'real' && !stripeEnv.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe] webhook misconfigured: STRIPE_WEBHOOK_SECRET is not set');
    return json({ error: 'Webhook not configured' }, 500);
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);
  const rawBody = await req.text();
  const gw = gatewayFor(stripeEnv, env);
  if (!gw) return notFound();
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
    // Ids only: the error message can quote the payload, and the payload is never logged.
    console.error('[stripe] webhook failed', event.id, event.type);
    return json({ error: 'Webhook processing failed' }, 500);
  }
}
