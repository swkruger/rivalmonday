import { verifyLink } from '@cs/core';
import { client, clientCompetitor, competitor, contact, membership } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { hasSignInRight } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { distanceKm } from './geo';
import { demoSignInLinks } from './links';
import { CLIENT_SPECS, seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';
import { DEMO_USERS } from './users';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
});

describe('seedTenancy', () => {
  it('creates Brazos Digital, three clients and their competitors, plus Lone Star’s own business', async () => {
    const clients = await dbs.owner.select().from(client);
    expect(clients.map((c) => [c.name, c.status, c.verticalId]).sort()).toEqual([
      ['Brazos Plumbing Co', 'active', 'hvac_plumbing'],
      ['Lakeside Family Dental', 'prospect', 'dental'],
      ['Lone Star Cooling', 'active', 'hvac_plumbing'],
    ]);
    const lone = clients.find((c) => c.name === 'Lone Star Cooling')!;
    expect(lone.selfCompetitorId).toBe(ctx.ids.selfLoneStar);
    expect(lone.keywords).toHaveLength(3);
    expect(lone.serviceArea?.radiusKm).toBe(25);
    expect(clients.find((c) => c.name === 'Brazos Plumbing Co')!.placeId).toBeNull();
    const links = await dbs.owner.select().from(clientCompetitor);
    expect(links.filter((l) => l.clientId === ctx.ids.clients.loneStar)).toHaveLength(6);
    expect(links.filter((l) => l.clientId === ctx.ids.clients.brazos)).toHaveLength(4);
    expect(links.filter((l) => l.clientId === ctx.ids.clients.lakeside)).toHaveLength(2);
    expect(links.some((l) => l.competitorId === ctx.ids.selfLoneStar)).toBe(false);
    expect(await dbs.owner.select().from(competitor)).toHaveLength(13);
  });

  it('places every competitor inside its client’s service area', () => {
    for (const key of ['loneStar', 'brazos', 'lakeside'] as const) {
      const area = CLIENT_SPECS[key].serviceArea;
      for (const c of ctx.ids.competitors[key]) expect(distanceKm(area.center, c)).toBeLessThan(area.radiusKm);
    }
  });

  it('marks one competitor per area as having no data on purpose', () => {
    const all = Object.values(ctx.ids.noData);
    expect(new Set(all).size).toBe(4);
    for (const id of all) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives every demo user a membership, a linked contact and a right to sign in', async () => {
    const rows = await dbs.owner.select({ role: membership.role, userId: membership.userId, contactId: membership.contactId }).from(membership);
    expect(rows).toHaveLength(DEMO_USERS.length);
    for (const u of DEMO_USERS) {
      const m = rows.find((r) => r.userId === ctx.ids.users[u.key].userId)!;
      expect(m.role).toBe(u.role);
      const [c] = await dbs.owner.select().from(contact).where(eq(contact.id, m.contactId!));
      expect(c!.email).toBe(u.email);
      expect(await hasSignInRight(dbs.owner, u.email)).toBe(true);
    }
  });

  it('signs one working sign-in link per demo user', async () => {
    const secret = 'k'.repeat(40);
    const links = await demoSignInLinks(dbs.owner, { secret, baseUrl: 'http://localhost:3000/' });
    expect(links.map((l) => l.key)).toEqual(DEMO_USERS.map((u) => u.key));
    for (const l of links) {
      expect(l.url.startsWith('http://localhost:3000/dev-panel/sign-in/')).toBe(true);
      const claims = verifyLink([secret], l.url.split('/dev-panel/sign-in/')[1]!);
      expect(claims?.sub).toBe(ctx.ids.users[l.key].contactId);
    }
  });
});
