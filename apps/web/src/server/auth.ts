import 'server-only';
import { createLedgerSink, type EnvName } from '@cs/db';
import { renderEmail } from '@cs/email';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { after } from 'next/server';
import { Pool } from 'pg';
import { buildAuthOptions } from './auth-options';
import { defaultBranding } from './branding';
import { processGuardOn } from './dev-guard';
import { devHooks } from './dev-hooks';
import { dbs } from './db';
import { webEmailTransport } from './email-transport';
import { perEnv } from './env-cache';
import { webEnv } from './env';
import { envUrls } from './runtime-env';

function create(name: EnvName) {
  const env = webEnv();
  const { service } = dbs();
  const transport = webEmailTransport(processGuardOn(), process.env, createLedgerSink(service));
  const pool = new Pool({ connectionString: envUrls(name).service, max: 5 });
  const options = buildAuthOptions({
    env, service, pool,
    onMagicLink: (email, url) => devHooks.onMagicLink?.(email, url),
    branding: () => defaultBranding(service, env),
    runInBackground: (task) => after(task),
    sendEmail: async (to, payload) => {
      const r = await renderEmail(payload);
      await transport.send({ from: env.emailFrom, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
    },
  });
  // nextCookies() must be the last plugin so cookies set by server actions reach the response.
  return { auth: betterAuth({ ...options, plugins: [...(options.plugins ?? []), nextCookies()] }), pool };
}

/** One Better Auth instance (and its pool) per environment: sessions live in each database's `auth` schema. */
const instances = perEnv(create, (v) => v.pool.end());
export const auth = () => instances().auth;
