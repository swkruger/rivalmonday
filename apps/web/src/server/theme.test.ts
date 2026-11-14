import { agency } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHost } from './request-host';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const m = vi.hoisted(() => ({ host: null as unknown }));
vi.mock('./db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
vi.mock('./env', () => ({ webEnv: () => ({ defaultAgencyId: null, hostEnv: { appUrl: 'https://app.example', neutralDomain: 'neutral.example', extraPlatformHosts: [] } }) }));
vi.mock('./request-host', () => ({ requestHost: async () => m.host }));

const { themeForViewer } = await import('./theme');
const ACME = 'https://acme.neutral.example';
const onAgency = (agencyId: string): RequestHost => ({ origin: ACME, info: { kind: 'agency', agencyId, canonical: true, canonicalOrigin: ACME } });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ branding: { displayName: 'Cool Comfort', assistantName: 'Sunny' } }).where(eq(agency.id, IDS.agencyA));
});

describe('themeForViewer without a viewer agency (13a1)', () => {
  it('themeForViewer(null) on an agency host uses that agency', async () => {
    m.host = onAgency(IDS.agencyA);
    const t = await themeForViewer(null);
    expect(t.branding.displayName).toBe('Cool Comfort');
    expect(t.assistantName).toBe('Sunny');
    const memberLess = await themeForViewer({ kind: 'member-less' } as never);
    expect(memberLess.branding.displayName).toBe('Cool Comfort');
  });

  it('the agency logo is rehosted to the request origin on an agency host, kept on APP_URL on the platform', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Cool Comfort', logoUrl: 'https://app.example/files/logo/a/l.png' } }).where(eq(agency.id, IDS.agencyA));
    const viewer = { kind: 'user', ctx: { agencyId: IDS.agencyA } } as never;
    m.host = onAgency(IDS.agencyA);
    expect((await themeForViewer(viewer)).branding.logoUrl).toBe(`${ACME}/files/logo/a/l.png`);
    m.host = { origin: 'https://app.example', info: { kind: 'platform' } };
    expect((await themeForViewer({ kind: 'user', ctx: { agencyId: IDS.agencyA } } as never)).branding.logoUrl).toBe('https://app.example/files/logo/a/l.png');
  });

  it('platform and mcp hosts keep the default branding', async () => {
    for (const host of [{ origin: 'https://app.example', info: { kind: 'platform' } }, { origin: 'https://mcp.neutral.example', info: { kind: 'mcp' } }]) {
      m.host = host;
      const t = await themeForViewer(null);
      expect(t.branding.displayName).toBe('Rival Monday');
      expect(t.assistantName).toBe('Friday');
    }
  });
});
