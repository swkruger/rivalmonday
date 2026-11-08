import { capture, observation } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { isoWeekMonday } from './audience';
import type { AudienceTrend } from './schemas';
import { ctx, dbs, registry, resetWorkspace } from './workspace-fixtures';

const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);
const invoke = (c = owner, competitorId: string = IDS.competitorX) => registry.invoke(c, 'get_audience_trend', { clientId: IDS.clientA1, competitorId }) as Promise<AudienceTrend>;

async function seedLikes(pageId: string, likes: number, at: Date, pageName: string | null = 'Smith HVAC'): Promise<void> {
  const [c] = await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, source: 'meta_ads', status: 'ok', collectorVersion: 't', capturedAt: at }).returning();
  await dbs.owner.insert(observation).values({ competitorId: IDS.competitorX, captureId: c!.id, kind: 'meta_page', key: pageId, data: { pageId, pageName, likes }, observedAt: at });
}

beforeEach(resetWorkspace);

describe('isoWeekMonday', () => {
  it('maps any day of the week (UTC) to its Monday', () => {
    expect(isoWeekMonday(new Date('2026-11-08T23:59:00Z'))).toBe('2026-11-02'); // Sunday
    expect(isoWeekMonday(new Date('2026-11-09T00:00:00Z'))).toBe('2026-11-09'); // Monday
  });
});

describe('get_audience_trend', () => {
  it('keeps the newest reading per ISO week', async () => {
    await seedLikes('99', 100, new Date('2026-10-26T08:00:00Z'));
    await seedLikes('99', 120, new Date('2026-10-29T08:00:00Z'));
    await seedLikes('99', 90, new Date('2026-10-27T08:00:00Z'));
    await seedLikes('99', 130, new Date('2026-11-04T08:00:00Z'));
    const t = await invoke();
    expect(t.pages).toEqual([{ pageId: '99', pageName: 'Smith HVAC', points: [{ week: '2026-10-26', likes: 120 }, { week: '2026-11-02', likes: 130 }] }]);
  });

  it('two pages sorted by latest likes, never summed', async () => {
    const now = new Date();
    await seedLikes('1', 50, now, 'Small Page');
    await seedLikes('2', 900, now, 'Big Page');
    const t = await invoke();
    expect(t.pages.map((p) => [p.pageId, p.points.at(-1)?.likes])).toEqual([['2', 900], ['1', 50]]);
  });

  it('drops readings older than 52 weeks', async () => {
    await seedLikes('99', 10, new Date(Date.now() - 60 * 7 * 86_400_000));
    await seedLikes('99', 20, new Date());
    expect((await invoke()).pages[0]!.points.map((p) => p.likes)).toEqual([20]);
  });

  it('no readings is an empty list', async () => {
    expect(await invoke()).toEqual({ pages: [] });
  });

  it('other client\'s competitor or agency → not_found', async () => {
    await expect(invoke(owner, IDS.competitorY)).rejects.toMatchObject({ code: 'not_found' });
    await expect(invoke(otherAgency)).rejects.toMatchObject({ code: 'not_found' });
  });
});
