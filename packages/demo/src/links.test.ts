import { agencyDomain, contact, type HostEnv } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_DOMAIN, demoSignInLinks } from './links';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const APP = 'http://localhost:3000';
const hostEnv: HostEnv = { appUrl: APP, neutralDomain: 'localhost', extraPlatformHosts: [] };
const secret = 'l'.repeat(40);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner); // host slug agency-a
  await dbs.owner.insert(contact).values([
    { agencyId: IDS.agencyA, role: 'agency_admin', email: `admin@${DEMO_DOMAIN}`, userId: 'u-admin' },
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: `owner.lonestar@${DEMO_DOMAIN}`, userId: 'u-owner' },
  ]);
});

describe('demoSignInLinks (13a1 P8)', () => {
  it('client links use the slug host; staff links stay on APP_URL', async () => {
    const links = await demoSignInLinks(dbs.service, { secret, baseUrl: `${APP}/`, hostEnv });
    const byKey = Object.fromEntries(links.map((l) => [l.key, l.url]));
    expect(byKey.admin).toMatch(/^http:\/\/localhost:3000\/dev-panel\/sign-in\//);
    expect(byKey.ownerLoneStar).toMatch(/^http:\/\/agency-a\.localhost:3000\/dev-panel\/sign-in\//);
  });

  it('a live custom domain wins; without a host env every link stays on APP_URL', async () => {
    await dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'intel.agency-a.test', status: 'live' });
    const hosted = await demoSignInLinks(dbs.service, { secret, baseUrl: APP, hostEnv });
    expect(hosted.find((l) => l.key === 'ownerLoneStar')!.url).toMatch(/^http:\/\/intel\.agency-a\.test:3000\//);
    const plain = await demoSignInLinks(dbs.service, { secret, baseUrl: APP, hostEnv: null });
    expect(plain.every((l) => l.url.startsWith(`${APP}/dev-panel/sign-in/`))).toBe(true);
  });
});
