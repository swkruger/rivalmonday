import { client } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolDeps } from '../deps';
import { ctx, dbs, resetWorkspace, seedSelf, setPlace } from '../tools/workspace-fixtures';
import { pickBusiness, workspaceBusinesses } from './business';
import { workspaceClient } from './scope';

const deps: ToolDeps = { app: dbs.app, service: dbs.service };
const am = ctx('account_manager', 'all');

beforeEach(resetWorkspace);

describe('workspaceBusinesses', () => {
  it('puts the self business first, then tracked competitors, with their match keys', async () => {
    const selfId = await seedSelf({ placeId: 'self-place' });
    await setPlace(IDS.competitorX, 'px');
    const c = await workspaceClient(deps, am, IDS.clientA1);
    const list = await workspaceBusinesses(deps, am, c);
    expect(list.map((b) => [b.key, b.competitorId, b.name, b.self, b.placeId])).toEqual([
      ['self', selfId, 'A1 HVAC', true, 'self-place'],
      [IDS.competitorX, IDS.competitorX, 'Smith HVAC', false, 'px'],
    ]);
  });

  it('builds a self entry from client.place_id when there is no self row, and none without either', async () => {
    await dbs.owner.update(client).set({ placeId: 'client-place' }).where(eq(client.id, IDS.clientA1));
    let c = await workspaceClient(deps, am, IDS.clientA1);
    expect((await workspaceBusinesses(deps, am, c))[0]).toMatchObject({ key: 'self', competitorId: null, placeId: 'client-place', self: true });
    await dbs.owner.update(client).set({ placeId: null }).where(eq(client.id, IDS.clientA1));
    c = await workspaceClient(deps, am, IDS.clientA1);
    expect((await workspaceBusinesses(deps, am, c)).map((b) => b.key)).toEqual([IDS.competitorX]);
  });

  it('exposes keywords and the service-area radius on the workspace client', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 32, lng: -97 }, radiusKm: 25, zips: ['76048'] } }).where(eq(client.id, IDS.clientA1));
    const c = await workspaceClient(deps, am, IDS.clientA1);
    expect([c.keywords, c.radiusKm, c.zips]).toEqual([['ac repair'], 25, 1]);
  });
});

describe('pickBusiness', () => {
  it('refuses an untracked competitor and a missing self business with not_found', async () => {
    const c = await workspaceClient(deps, am, IDS.clientA1);
    const list = await workspaceBusinesses(deps, am, c);
    expect(pickBusiness(list, IDS.competitorX).name).toBe('Smith HVAC');
    expect(() => pickBusiness(list, IDS.competitorY)).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(() => pickBusiness(list, 'self')).toThrow(expect.objectContaining({ code: 'not_found', message: 'Your business is not set up yet' }));
  });
});
