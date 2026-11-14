import { agency } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, type EmailPayload } from '@cs/email';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthDeps } from './auth-options';
import type { WebEnv } from './env';
import type { RequestHost } from './request-host';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const APP = 'https://app.example'; // https: resolveBranding keeps only https logos, so the rehost is observable
const env: WebEnv = {
  appUrl: APP, hostEnv: { appUrl: APP, neutralDomain: 'neutral.example', extraPlatformHosts: [] }, appDatabaseUrl: testUrls.app, serviceDatabaseUrl: testUrls.service, queueDatabaseUrl: testUrls.owner,
  authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'from@example.com', google: null, defaultAgencyId: null, webMonitoring: false, kbImport: false, platformAdmins: [], askFakeAi: false, setupFakeLookup: false, webhookFakeSend: false, siteOrigins: [],
};
const m = vi.hoisted(() => ({ pools: [] as string[], deps: [] as unknown[], headers: new Headers(), mail: null as unknown }));
m.mail = createMemoryTransport();
vi.mock('pg', () => ({ Pool: class { constructor(o: { connectionString: string }) { m.pools.push(o.connectionString); } end() { return Promise.resolve(); } } }));
vi.mock('better-auth', () => ({ betterAuth: (options: { baseURL: string }) => ({ options }) }));
vi.mock('./auth-options', async (orig) => {
  const real = await orig<typeof import('./auth-options')>();
  return { ...real, buildAuthOptions: (d: AuthDeps) => { m.deps.push(d); return real.buildAuthOptions(d); } };
});
vi.mock('./env', () => ({ webEnv: () => env }));
vi.mock('./db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
vi.mock('./runtime-env', () => ({ envUrls: (name: string) => ({ queue: '', app: '', service: `svc-${name}` }) }));
vi.mock('./dev-guard', () => ({ activeEnvName: () => 'dev', processGuardOn: () => false }));
vi.mock('./email-transport', () => ({ webEmailTransport: () => m.mail }));
vi.mock('next/headers', () => ({ headers: async () => m.headers }));

const { authFor, mcpAuth, platformAuth, requestAuth } = await import('./auth');
const { clearEnvCaches } = await import('./env-cache');
const mail = m.mail as ReturnType<typeof createMemoryTransport>;

const ACME = 'https://acme.neutral.example';
const MCP_ORIGIN = 'https://mcp.neutral.example';
const agencyHost = (origin: string, agencyId: string = IDS.agencyA): RequestHost => ({ origin, info: { kind: 'agency', agencyId, canonical: true, canonicalOrigin: origin } });
const optionsOf = (a: unknown) => (a as { options: { baseURL: string } }).options;
const lastDeps = () => m.deps.at(-1) as AuthDeps;
const send = async (d: AuthDeps) => {
  const payload: EmailPayload = { template: 'sign_in', props: { branding: await d.branding(), url: `${d.host.origin}/api/auth/magic-link/verify?token=t`, expiresMinutes: 15 } };
  await d.sendEmail('owner@client.example', payload);
  return { msg: mail.sent.at(-1)!, branding: (payload.props as { branding: { displayName: string; logoUrl: string | null } }).branding };
};

beforeEach(async () => {
  await clearEnvCaches();
  m.pools.length = 0;
  m.deps.length = 0;
  m.headers = new Headers();
  mail.sent.length = 0;
});

describe('authFor (13a1 P6, Appendix D)', () => {
  it('authFor refuses a platform/mcp origin mismatch and a malformed agency origin (scheme/port differ from originOf)', () => {
    expect(() => authFor({ origin: ACME, info: { kind: 'platform' } })).toThrow('auth origin does not match its host kind');
    expect(() => authFor({ origin: 'http://app.example', info: { kind: 'platform' } })).toThrow('auth origin does not match its host kind');
    expect(() => authFor({ origin: APP, info: { kind: 'mcp' } })).toThrow('auth origin does not match its host kind');
    for (const bad of ['http://acme.neutral.example', 'https://acme.neutral.example:4000', 'https://acme.neutral.example/x', 'https://ACME.neutral.example', 'https://user@acme.neutral.example', 'https://acme.neutral.example/', 'not a url']) {
      expect(() => authFor(agencyHost(bad)), bad).toThrow();
    }
    expect(m.pools).toEqual([]);
  });

  it('one instance per origin, one pool per env', () => {
    const a = authFor(agencyHost(ACME));
    expect(authFor(agencyHost(ACME))).toBe(a);
    const b = authFor(agencyHost('https://bravo.neutral.example', IDS.agencyB));
    expect(b).not.toBe(a);
    const p = platformAuth();
    expect(platformAuth()).toBe(p);
    const mc = mcpAuth();
    expect(new Set([a, b, p, mc]).size).toBe(4);
    expect(optionsOf(a).baseURL).toBe(ACME);
    expect(optionsOf(p).baseURL).toBe(APP);
    expect(optionsOf(mc).baseURL).toBe(MCP_ORIGIN);
    expect(m.pools).toEqual(['svc-dev']);
    const demo = platformAuth('demo');
    expect(demo).not.toBe(p);
    expect(m.pools).toEqual(['svc-dev', 'svc-demo']);
  });

  it('same origin with a different host agency builds a new instance', () => {
    const a = authFor(agencyHost(ACME, IDS.agencyA));
    const b = authFor(agencyHost(ACME, IDS.agencyB)); // e.g. the custom domain moved, or a freed host_slug was reused
    expect(b).not.toBe(a);
    expect((lastDeps().host.info as { agencyId: string }).agencyId).toBe(IDS.agencyB);
    expect(authFor(agencyHost(ACME, IDS.agencyB))).toBe(b);
    expect(m.pools).toEqual(['svc-dev']);
  });

  it('requestAuth follows the proxy headers; none = platform', async () => {
    expect(await requestAuth()).toBe(platformAuth());
    m.headers = new Headers({ 'x-rm-host-kind': 'agency', 'x-rm-host-agency': IDS.agencyA, 'x-rm-origin': ACME });
    expect(optionsOf(await requestAuth()).baseURL).toBe(ACME);
    m.headers = new Headers({ 'x-rm-host-kind': 'mcp', 'x-rm-origin': MCP_ORIGIN });
    expect(await requestAuth()).toBe(mcpAuth());
  });
});

describe('sign-in email per host (13a1 Task 5)', () => {
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await dbs.owner.update(agency).set({ branding: { displayName: 'Cool Comfort', fromName: 'Cool Comfort Team', logoUrl: `${APP}/files/logo/${IDS.agencyA}/logo.png` } }).where(eq(agency.id, IDS.agencyA));
  });

  it('agency sign-in email is From the agency sender with its branding', async () => {
    const [{ slug }] = (await dbs.owner.execute(sql`select host_slug as slug from agency where id = ${IDS.agencyA}::uuid`)) as unknown as { slug: string }[];
    authFor(agencyHost(ACME));
    const { msg, branding } = await send(lastDeps());
    expect(msg.from).toBe(`"Cool Comfort Team" <${slug}@mail.neutral.example>`);
    expect(msg.from).not.toContain('from@example.com');
    expect(branding.displayName).toBe('Cool Comfort');
    expect(branding.logoUrl).toBe(`${ACME}/files/logo/${IDS.agencyA}/logo.png`); // P9: rehosted on the agency host
    expect(msg.html).toContain('Cool Comfort');
    expect(msg.html).not.toContain('Rival Monday');
  });

  it('mcp sign-in email From sign-in@mail.<neutral>, neutral branding', async () => {
    mcpAuth();
    const { msg, branding } = await send(lastDeps());
    expect(msg.from).toBe('"Sign in" <sign-in@mail.neutral.example>');
    expect(msg.replyTo).toBeNull();
    expect(branding.displayName).toBe('Connect');
    expect(branding.logoUrl).toBeNull();
    expect(msg.subject).not.toContain('Rival Monday');
    expect(msg.html).not.toContain('Rival Monday');
  });

  it('platform sign-in email keeps the platform sender and default branding', async () => {
    platformAuth();
    const { msg, branding } = await send(lastDeps());
    expect(msg.from).toBe('"Rival Monday" <from@example.com>');
    expect(branding.displayName).toBe('Rival Monday');
  });
});
