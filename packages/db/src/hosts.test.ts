import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agencyByHostname, clientOriginFor, type HostEnv, originOf, parseHostEnv, rehostLogoUrl } from './hosts';
import { agency, agencyDomain } from './schema';
import { withTenant } from './tenant';

const env = (e: Record<string, string | undefined>) => e as unknown as NodeJS.ProcessEnv;

describe('parseHostEnv (P2 + R7)', () => {
  it('defaults neutral to localhost only for a localhost APP_URL', () => {
    expect(parseHostEnv(env({ APP_URL: 'http://localhost:3101/' }))).toEqual({
      hostEnv: { appUrl: 'http://localhost:3101', neutralDomain: 'localhost', extraPlatformHosts: ['127.0.0.1'] },
      problems: [],
    });
    expect(parseHostEnv(env({ APP_URL: 'https://app.example.com' })).hostEnv).toBeNull();
  });

  it('a localhost APP_URL makes 127.0.0.1 a platform host (next dev binds 127.0.0.1); no other APP_URL does', () => {
    expect(parseHostEnv(env({ APP_URL: 'http://localhost:3000', NEUTRAL_DOMAIN: 'lvh.me' })).hostEnv?.extraPlatformHosts).toEqual(['127.0.0.1']);
    expect(parseHostEnv(env({ APP_URL: 'http://localhost:3000', VERCEL_URL: 'x.vercel.app' })).hostEnv?.extraPlatformHosts).toEqual(['x.vercel.app', '127.0.0.1']);
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'briefs-hub.com' })).hostEnv?.extraPlatformHosts).toEqual([]);
  });

  it('null + problem for a production APP_URL without NEUTRAL_DOMAIN', () => {
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app' }))).toEqual({ hostEnv: null, problems: ['NEUTRAL_DOMAIN is required'] });
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: '  ' }))).toEqual({ hostEnv: null, problems: ['NEUTRAL_DOMAIN is required'] });
  });

  it('missing or invalid APP_URL → null with no problem (APP_URL reports itself)', () => {
    expect(parseHostEnv(env({}))).toEqual({ hostEnv: null, problems: [] });
    expect(parseHostEnv(env({ APP_URL: 'not a url' }))).toEqual({ hostEnv: null, problems: [] });
  });

  it('NEUTRAL_DOMAIN is lower-cased, trailing dot dropped, must be a domain', () => {
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'Briefs-Hub.COM.' })).hostEnv?.neutralDomain).toBe('briefs-hub.com');
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'https://x.com' }))).toEqual({
      hostEnv: null,
      problems: ['NEUTRAL_DOMAIN must be a domain name'],
    });
  });

  it('refuses NEUTRAL_DOMAIN x.rivalmonday.app with APP_URL rivalmonday.app', () => {
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'x.rivalmonday.app' }))).toEqual({
      hostEnv: null,
      problems: ['NEUTRAL_DOMAIN must not be a Rival Monday domain'],
    });
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'x.rivalmonday.com' })).hostEnv).toBeNull();
    // a Rival Monday sub-domain that is not APP_URL's own host is refused even on staging
    expect(parseHostEnv(env({ APP_URL: 'https://staging.rivalmonday.app', NEUTRAL_DOMAIN: 'other.rivalmonday.app' })).hostEnv).toBeNull();
  });

  it('refuses rivalmonday.app itself', () => {
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'rivalmonday.app' })).problems).toEqual(['NEUTRAL_DOMAIN must not be a Rival Monday domain']);
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.com', NEUTRAL_DOMAIN: 'rivalmonday.com' })).hostEnv).toBeNull();
  });

  it('allows staging.rivalmonday.app when APP_URL is https://staging.rivalmonday.app', () => {
    expect(parseHostEnv(env({ APP_URL: 'https://staging.rivalmonday.app', NEUTRAL_DOMAIN: 'staging.rivalmonday.app' }))).toEqual({
      hostEnv: { appUrl: 'https://staging.rivalmonday.app', neutralDomain: 'staging.rivalmonday.app', extraPlatformHosts: [] },
      problems: [],
    });
  });

  it('VERCEL_URL host joins extraPlatformHosts', () => {
    const r = parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'briefs-hub.com', VERCEL_URL: 'Web-abc123.vercel.app', VERCEL_BRANCH_URL: 'web-git-main.vercel.app' }));
    expect(r.hostEnv?.extraPlatformHosts).toEqual(['web-abc123.vercel.app', 'web-git-main.vercel.app']);
    expect(parseHostEnv(env({ APP_URL: 'https://rivalmonday.app', NEUTRAL_DOMAIN: 'briefs-hub.com', VERCEL_URL: ' ' })).hostEnv?.extraPlatformHosts).toEqual([]);
  });

  it('originOf keeps http + port in dev, https without port in prod', () => {
    const dev: HostEnv = { appUrl: 'http://localhost:3101', neutralDomain: 'localhost', extraPlatformHosts: [] };
    const prod: HostEnv = { appUrl: 'https://rivalmonday.app', neutralDomain: 'briefs-hub.com', extraPlatformHosts: [] };
    expect(originOf(dev, 'acme.localhost')).toBe('http://acme.localhost:3101');
    expect(originOf(prod, 'acme.briefs-hub.com')).toBe('https://acme.briefs-hub.com');
  });
});

describe('rehostLogoUrl', () => {
  const h: HostEnv = { appUrl: 'https://rivalmonday.app', neutralDomain: 'briefs-hub.com', extraPlatformHosts: [] };
  it('rehostLogoUrl rewrites only own-logo URLs (agency and clients/)', () => {
    const o = 'https://intel.acme.com';
    expect(rehostLogoUrl(`https://rivalmonday.app/files/logo/${IDS.agencyA}/v1.png`, h, o)).toBe(`${o}/files/logo/${IDS.agencyA}/v1.png`);
    expect(rehostLogoUrl(`https://rivalmonday.app/files/logo/clients/${IDS.clientA1}/v2.webp`, h, o)).toBe(`${o}/files/logo/clients/${IDS.clientA1}/v2.webp`);
    expect(rehostLogoUrl('https://cdn.acme.com/logo.png', h, o)).toBe('https://cdn.acme.com/logo.png');
    expect(rehostLogoUrl('https://rivalmonday.app/files/other/x.png', h, o)).toBe('https://rivalmonday.app/files/other/x.png');
    expect(rehostLogoUrl('https://rivalmonday.app.evil.com/files/logo/x/y.png', h, o)).toBe('https://rivalmonday.app.evil.com/files/logo/x/y.png');
    expect(rehostLogoUrl(null, h, o)).toBeNull();
  });
});

describe('host lookups (db)', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  const h: HostEnv = { appUrl: 'http://localhost:3101', neutralDomain: 'localhost', extraPlatformHosts: [] };

  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner); // host slugs agency-a, agency-b
  });

  const domain = (agencyId: string, hostname: string, status: 'pending' | 'verifying' | 'live' | 'failed' | 'removed') =>
    dbs.service.insert(agencyDomain).values({ agencyId, hostname, status });

  it('clientOriginFor → fallback, custom when live, fallback after removed/failed', async () => {
    expect(await clientOriginFor(dbs.service, IDS.agencyA, h)).toBe('http://agency-a.localhost:3101');
    await domain(IDS.agencyA, 'intel.a.test', 'pending');
    expect(await clientOriginFor(dbs.service, IDS.agencyA, h)).toBe('http://agency-a.localhost:3101');
    await dbs.service.update(agencyDomain).set({ status: 'live' }).where(eq(agencyDomain.agencyId, IDS.agencyA));
    expect(await clientOriginFor(dbs.service, IDS.agencyA, h)).toBe('http://intel.a.test:3101');
    expect(await clientOriginFor(dbs.service, IDS.agencyB, h)).toBe('http://agency-b.localhost:3101');
    await dbs.service.update(agencyDomain).set({ status: 'removed' }).where(eq(agencyDomain.agencyId, IDS.agencyA));
    expect(await clientOriginFor(dbs.service, IDS.agencyA, h)).toBe('http://agency-a.localhost:3101');
    await domain(IDS.agencyA, 'intel2.a.test', 'failed');
    expect(await clientOriginFor(dbs.service, IDS.agencyA, h)).toBe('http://agency-a.localhost:3101');
  });

  it('clientOriginFor throws for an unknown agency', async () => {
    await expect(clientOriginFor(dbs.service, '00000000-0000-4000-8000-0000000000ee', h)).rejects.toThrow(/unknown agency/);
  });

  it('clientOriginFor on a client-role tenant connection cannot see a live domain (F9: pass the service db)', async () => {
    await domain(IDS.agencyA, 'intel.a.test', 'live');
    const scope = { agencyId: IDS.agencyA, clientScope: 'all' as const, userId: 'u1', role: 'client_owner' as const };
    expect(await withTenant(dbs.app, scope, (tx) => clientOriginFor(tx, IDS.agencyA, h))).toBe('http://agency-a.localhost:3101');
    expect(await clientOriginFor(dbs.service, IDS.agencyA, h)).toBe('http://intel.a.test:3101');
  });

  it('agencyByHostname: fallback (canonical true); fallback with live custom (canonical false, canonicalOrigin custom); live custom; pending custom → null; two-label sub (a.b.<neutral>) → null; archived agency → null', async () => {
    expect(await agencyByHostname(dbs.service, 'agency-a.localhost', h)).toEqual({ agencyId: IDS.agencyA, canonical: true, canonicalOrigin: 'http://agency-a.localhost:3101' });
    await domain(IDS.agencyA, 'intel.a.test', 'live');
    expect(await agencyByHostname(dbs.service, 'agency-a.localhost', h)).toEqual({ agencyId: IDS.agencyA, canonical: false, canonicalOrigin: 'http://intel.a.test:3101' });
    expect(await agencyByHostname(dbs.service, 'intel.a.test', h)).toEqual({ agencyId: IDS.agencyA, canonical: true, canonicalOrigin: 'http://intel.a.test:3101' });
    await domain(IDS.agencyB, 'intel.b.test', 'pending');
    expect(await agencyByHostname(dbs.service, 'intel.b.test', h)).toBeNull();
    expect(await agencyByHostname(dbs.service, 'x.agency-b.localhost', h)).toBeNull();
    expect(await agencyByHostname(dbs.service, 'nobody.localhost', h)).toBeNull();
    expect(await agencyByHostname(dbs.service, 'localhost', h)).toBeNull();
    await dbs.service.update(agency).set({ archivedAt: new Date() }).where(eq(agency.id, IDS.agencyA));
    expect(await agencyByHostname(dbs.service, 'agency-a.localhost', h)).toBeNull();
    expect(await agencyByHostname(dbs.service, 'intel.a.test', h)).toBeNull();
  });
});
