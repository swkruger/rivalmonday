import 'server-only';
import { createLedgerSink } from '@cs/db';
import { createEmailTransportFromEnv, renderEmail } from '@cs/email';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';
import { buildAuthOptions } from './auth-options';
import { defaultBranding } from './branding';
import { dbs } from './db';
import { webEnv } from './env';

function create() {
  const env = webEnv();
  const { service } = dbs();
  const transport = createEmailTransportFromEnv(process.env, createLedgerSink(service));
  const options = buildAuthOptions({
    env, service, pool: new Pool({ connectionString: env.serviceDatabaseUrl, max: 5 }),
    branding: () => defaultBranding(service, env),
    sendEmail: async (to, payload) => {
      const r = await renderEmail(payload);
      await transport.send({ from: env.emailFrom, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
    },
  });
  // nextCookies() must be the last plugin so cookies set by server actions reach the response.
  return betterAuth({ ...options, plugins: [...(options.plugins ?? []), nextCookies()] });
}

let instance: ReturnType<typeof create> | null = null;
export const auth = () => (instance ??= create());
