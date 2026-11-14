import 'server-only';
import { createLedgerSink, type Db, type EnvName, mcpOrigin, platformOrigin, rehostLogoUrl } from '@cs/db';
import { type Branding, renderEmail, resolveBranding } from '@cs/email';
import { mcpSignInSender, platformSender, senderFor } from '@cs/engine';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { after } from 'next/server';
import { Pool } from 'pg';
import { buildAuthOptions, NEUTRAL_APP_NAME } from './auth-options';
import { agencyBrandingById, defaultBranding } from './branding';
import { activeEnvName, processGuardOn } from './dev-guard';
import { devHooks } from './dev-hooks';
import { dbs } from './db';
import { instrumentPgPool } from './db-timing';
import { webEmailTransport } from './email-transport';
import { perEnv } from './env-cache';
import { type WebEnv, webEnv } from './env';
import { type RequestHost, requestHost } from './request-host';
import { envUrls } from './runtime-env';
import { profilingOn } from './tool-timing';

/** Branding of the sign-in email: platform = default; agency = its own (logo rehosted on its host, P9); MCP = neutral. */
async function signInBranding(service: Db, env: WebEnv, host: RequestHost): Promise<Branding> {
  if (host.info.kind === 'platform') return defaultBranding(service, env);
  if (host.info.kind === 'mcp') return resolveBranding(NEUTRAL_APP_NAME, null);
  const b = await agencyBrandingById(service, host.info.agencyId);
  if (!b) throw new Error('sign-in email: unknown host agency');
  return { ...b, logoUrl: rehostLogoUrl(b.logoUrl, env.hostEnv, host.origin) };
}

/** From of the sign-in email (P14/P15): platform sender; the agency's client sender (never Rival Monday); the MCP host's own. */
async function signInSender(service: Db, env: WebEnv, host: RequestHost): Promise<{ from: string; replyTo: string | null }> {
  if (host.info.kind === 'platform') return { from: platformSender({ platformFrom: env.emailFrom }), replyTo: null };
  if (host.info.kind === 'mcp') return { from: mcpSignInSender(env.hostEnv), replyTo: null };
  const s = await senderFor(service, host.info.agencyId, 'client', { hostEnv: env.hostEnv, platformFrom: env.emailFrom });
  return { from: s.from, replyTo: s.replyTo ?? null };
}

function create(name: EnvName, host: RequestHost, pool: Pool) {
  const env = webEnv();
  const { service } = dbs(name);
  const transport = webEmailTransport(processGuardOn(), process.env, createLedgerSink(service));
  const options = buildAuthOptions({
    env, host, service, pool,
    onMagicLink: (email, url) => devHooks.onMagicLink?.(email, url),
    branding: () => signInBranding(service, env, host),
    runInBackground: (task) => after(task),
    sendEmail: async (to, payload) => {
      const [r, s] = await Promise.all([renderEmail(payload), signInSender(service, env, host)]);
      await transport.send({ from: s.from, to, replyTo: s.replyTo, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: host.info.kind === 'agency' ? host.info.agencyId : null, clientId: null });
    },
  });
  // nextCookies() must be the last plugin so cookies set by server actions reach the response.
  return betterAuth({ ...options, plugins: [...(options.plugins ?? []), nextCookies()] });
}

type Auth = ReturnType<typeof create>;

/** One service pool per environment, shared by its origins' instances. Launch gate: `PROFILE_TOOLS=1` only — Better Auth's queries become `auth` db spans. */
const pools = perEnv((name) => {
  const raw = new Pool({ connectionString: envUrls(name).service, max: 5 });
  return profilingOn() ? instrumentPgPool(raw) : raw;
}, (p) => p.end());
/**
 * 13a1 (P6): one Better Auth instance per origin per environment (sessions live in each database's `auth` schema). The entry
 * remembers the host agency it closes over (sign-in sender and branding): when a hostname resolves to another agency (a
 * moved custom domain, a reused host_slug) the instance is rebuilt instead of mailing as the old agency.
 */
const instances = perEnv(() => new Map<string, { agencyId: string | null; auth: Auth }>(), (m) => m.clear());

/**
 * The instance for `host`. Platform and MCP origins must equal their known origin; an agency origin must be a plain
 * `scheme://hostname[:port]` with APP_URL's scheme and port (what `originOf` builds) — the memo never keys off a raw Host.
 */
export function authFor(host: RequestHost, name?: EnvName): Auth {
  const h = webEnv().hostEnv;
  const known = host.info.kind === 'platform' ? platformOrigin(h) : host.info.kind === 'mcp' ? mcpOrigin(h) : null;
  if (known !== null && host.origin !== known) throw new Error('auth origin does not match its host kind');
  if (host.info.kind === 'agency') {
    const u = new URL(host.origin), a = new URL(h.appUrl); // same scheme/port as originOf() builds
    if (!/^[a-z0-9.-]+$/.test(u.hostname) || u.protocol !== a.protocol || u.port !== a.port || u.origin !== host.origin) throw new Error('bad agency origin');
  }
  const map = instances(name);
  const agencyId = host.info.kind === 'agency' ? host.info.agencyId : null;
  const hit = map.get(host.origin);
  if (hit && hit.agencyId === agencyId) return hit.auth;
  const a = create(name ?? activeEnvName(), host, pools(name));
  map.set(host.origin, { agencyId, auth: a });
  return a;
}
/** The current request's instance (proxy headers; none = platform). */
export const requestAuth = async (name?: EnvName) => authFor(await requestHost(), name);
/** Platform-only callers (dev panel, sign-up, onboarding start). */
export const platformAuth = (name?: EnvName) => authFor({ origin: platformOrigin(webEnv().hostEnv), info: { kind: 'platform' } }, name);
/** The OAuth provider exists only here (MCP verifier, AS metadata, consent). */
export const mcpAuth = (name?: EnvName) => authFor({ origin: mcpOrigin(webEnv().hostEnv), info: { kind: 'mcp' } }, name);
