import { hashIp, sendWaitlistEmail, submitWaitlistEntry, waitlistSubmitSchema } from '@cs/tools';
import { after } from 'next/server';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import { allowedOrigin } from '@/server/site-origin';
import { toolDeps } from '@/server/tools';
import { verifyTurnstile } from '@/server/turnstile';

export const dynamic = 'force-dynamic';

/** Phase 17a §5: the public waitlist endpoint the marketing site posts to. Uniform reply, 400 ms floor, no pii in logs. */
const MIN_MS = 400;
const MAX_BODY = 8_192;
const cors = (origin: string) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
const forbidden = () => new Response(null, { status: 403, headers: { Vary: 'Origin' } });

export async function OPTIONS(req: Request) {
  const origin = allowedOrigin(req.headers.get('origin'), webEnv().siteOrigins);
  return origin ? new Response(null, { status: 204, headers: cors(origin) }) : forbidden();
}

export async function POST(req: Request) {
  const started = Date.now();
  const env = webEnv();
  const origin = allowedOrigin(req.headers.get('origin'), env.siteOrigins);
  if (!origin) return forbidden();
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { ...cors(origin), 'Cache-Control': 'no-store' } });
  const floor = async () => { const wait = MIN_MS - (Date.now() - started); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); };
  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY) return reply(400, { ok: false, error: 'invalid' });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return reply(400, { ok: false, error: 'invalid' }); }
  const parsed = waitlistSubmitSchema.safeParse(body);
  if (!parsed.success) return reply(400, { ok: false, error: 'invalid' });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  // No site-key gate here (unlike sign-up): the marketing site holds the widget key, this endpoint only needs the secret.
  // 'dev' is the live environment (production included); the shared verifier passes everything when its secret is missing, so a live
  // deploy without the secret would be an open endpoint that sends mail. Fail closed there. demo/test keep the fake verifier.
  const envName = activeEnvName();
  const ok = !(envName === 'dev' && !env.turnstile?.secretKey)
    && (await verifyTurnstile(parsed.data.turnstileToken, ip, { envName, turnstileSecretKey: env.turnstile?.secretKey }));
  if (!ok) { await floor(); return reply(400, { ok: false, error: 'check' }); }
  const deps = toolDeps();
  try {
    const r = await submitWaitlistEntry(deps, { ...parsed.data, ipHash: hashIp(ip ?? 'unknown', env.authSecret) }, new Date());
    const send = r.send;
    if (send && deps.leadEmail) {
      const mail = { service: deps.service, ...deps.leadEmail };
      // After the response: send latency must not tell an accepted request from a refused one.
      after(async () => {
        try { await sendWaitlistEmail(mail, send.entryId, 'confirmation', { confirmRaw: send.confirmRaw }); }
        catch (e) { console.error(`[waitlist] confirmation email failed: ${e instanceof Error ? e.name : typeof e}`); }
      });
    }
  } catch (e) {
    console.error(`[waitlist] submit failed: ${e instanceof Error ? e.name : typeof e}`);
  }
  await floor();
  return reply(200, { ok: true });
}
