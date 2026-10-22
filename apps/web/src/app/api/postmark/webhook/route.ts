import { createLogger } from '@cs/core/server';
import { deliveryConfigFromEnv, handlePostmarkEvent, postmarkAuthOk } from '@cs/engine';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = createLogger(process.env.VITEST ? { pretty: false } : {}).child({ role: 'web' });
const ok = () => Response.json({ received: true }, { status: 200 });

/** Ids only — never the address (spec D19); the logger masks any email that slips into a message too. */
function meta(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== 'object') return {};
  const e = event as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === 'string' ? v.slice(0, 100) : undefined);
  return { recordType: pick(e.RecordType), type: pick(e.Type), messageId: pick(e.MessageID) };
}

/**
 * `POST /api/postmark/webhook` (spec §4, D19): public in `proxy.ts`; Basic auth `postmark:POSTMARK_WEBHOOK_SECRET`.
 * Secret unset => 404; bad auth => 401; after auth always 200 (parse and processing errors are logged).
 */
export async function POST(req: Request) {
  const secret = webEnv().postmarkWebhookSecret;
  if (!secret) return new Response('Not found', { status: 404 });
  if (!postmarkAuthOk(req.headers.get('authorization'), secret)) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="postmark"' } });
  let event: unknown;
  try {
    event = JSON.parse(await req.text());
  } catch {
    log.warn('postmark webhook: body is not JSON');
    return ok();
  }
  try {
    const outcome = await handlePostmarkEvent({ db: dbs(activeEnvName()).service, delivery: deliveryConfigFromEnv(process.env) }, event);
    log.info({ ...meta(event), outcome }, 'postmark webhook handled');
  } catch (e) {
    log.error({ ...meta(event), err: e instanceof Error ? { name: e.name, message: e.message } : String(e) }, 'postmark webhook failed');
  }
  return ok();
}
