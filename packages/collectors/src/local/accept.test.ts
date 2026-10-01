import { createAccessContext } from '@cs/core';
import { clientCompetitor, competitor, competitorSource, competitorSuggestion } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSuggestion } from './accept';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const SUG = '00000000-0000-4000-8000-0000000000d1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(competitorSuggestion).values({ id: SUG, agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'Cool Air', domain: 'coolair.example', placeId: 'p9', cid: '999', appearances: 3, overlapScore: 0.6 });
});

describe('acceptSuggestion', () => {
  it('creates the global competitor, links it to the client, schedules sources and marks accepted', async () => {
    const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
    const { competitorId } = await acceptSuggestion({ service: dbs.service, app: dbs.app }, ctx, SUG);
    const [c] = await dbs.service.select().from(competitor).where(eq(competitor.id, competitorId));
    expect(c).toMatchObject({ name: 'Cool Air', domain: 'coolair.example', placeId: 'p9', cid: '999' });
    expect(await dbs.service.select().from(clientCompetitor).where(eq(clientCompetitor.competitorId, competitorId))).toHaveLength(1);
    expect((await dbs.service.select().from(competitorSource).where(eq(competitorSource.competitorId, competitorId))).map((s) => s.source).sort()).toEqual(['ads_google', 'ads_meta', 'gbp', 'jobs', 'reviews']);
    const [s] = await dbs.service.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, SUG));
    expect(s?.status).toBe('accepted');
  });

  it('reuses an existing competitor with the same place id', async () => {
    await dbs.service.insert(competitor).values({ name: 'Cool Air LLC', placeId: 'p9' });
    const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'agency_admin', clientScope: 'all', features: [] });
    const { competitorId } = await acceptSuggestion({ service: dbs.service, app: dbs.app }, ctx, SUG);
    expect(await dbs.service.select().from(competitor).where(eq(competitor.placeId, 'p9'))).toEqual([expect.objectContaining({ id: competitorId })]);
  });

  it('refuses suggestions outside the caller scope', async () => {
    const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA2], features: [] });
    await expect(acceptSuggestion({ service: dbs.service, app: dbs.app }, ctx, SUG)).rejects.toThrow(/not found/i);
    const ctxB = createAccessContext({ agencyId: IDS.agencyB, userId: 'x', role: 'agency_admin', clientScope: 'all', features: [] });
    await expect(acceptSuggestion({ service: dbs.service, app: dbs.app }, ctxB, SUG)).rejects.toThrow(/not found/i);
  });
});
