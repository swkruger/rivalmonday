import { createAccessContext } from '@cs/core';
import { agencyDomain, type HostEnv } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ToolDeps } from './deps';
import { linkBase } from './link-base';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const APP = 'https://app.test';
const hostEnv: HostEnv = { appUrl: APP, neutralDomain: 'clients.test', extraPlatformHosts: [] };
const deps = (over: Partial<ToolDeps> = {}): ToolDeps => ({ app: dbs.app, service: dbs.service, appUrl: APP, hostEnv, ...over });
const ctx = (role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer') =>
  createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: role.startsWith('client') ? [IDS.clientA1] : 'all', features: [] });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('linkBase', () => {
  it('client roles get the client origin, agency roles APP_URL', async () => {
    expect(await linkBase(deps(), ctx('client_owner'))).toBe('https://agency-a.clients.test');
    expect(await linkBase(deps(), ctx('client_viewer'))).toBe('https://agency-a.clients.test');
    expect(await linkBase(deps(), ctx('agency_admin'))).toBe(APP);
    expect(await linkBase(deps(), ctx('account_manager'))).toBe(APP);
  });

  it('client-role ctx with a live domain still gets the custom origin (service db)', async () => {
    await dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'intel.agency-a.test', status: 'live' });
    expect(await linkBase(deps(), ctx('client_viewer'))).toBe('https://intel.agency-a.test');
  });

  it('no hostEnv → appUrl; no appUrl → undefined (relative)', async () => {
    expect(await linkBase(deps({ hostEnv: undefined }), ctx('client_owner'))).toBe(APP);
    expect(await linkBase(deps({ appUrl: undefined }), ctx('client_owner'))).toBeUndefined();
  });
});
