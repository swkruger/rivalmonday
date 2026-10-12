import { alert, changeEvent } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx, dbs, registry, resetWorkspace } from './workspace-fixtures';

const admin = ctx('agency_admin', 'all');
const mcp = { channel: 'mcp' as const, tokenId: 'pat-1', tokenScope: 'read' as const };

beforeEach(resetWorkspace);

describe('list_alerts paging and detail', () => {
  it('list_alerts summary over mcp has url /go/alert/<id>, evidenceIds and delivered date', async () => {
    const [ev] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning();
    const [a] = await dbs.owner.insert(alert).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: ev!.id, score: 80, headline: 'Smith cut prices', body: 'B', mode: 'direct',
      status: 'delivered', deliveredAt: new Date('2026-10-04T10:00:00Z'), evidenceIds: ['ev-1'],
    }).returning();
    const out = (await registry.invoke(admin, 'list_alerts', { clientId: IDS.clientA1 }, mcp)) as { items: unknown[] };
    expect(out.items).toEqual([{ id: a!.id, title: 'Smith cut prices', date: '2026-10-04T10:00:00.000Z', evidenceIds: ['ev-1'], url: `/go/alert/${a!.id}` }]);
    const web = (await registry.invoke(admin, 'list_alerts', { clientId: IDS.clientA1 })) as { items: Record<string, unknown>[] };
    expect(web.items[0]).toMatchObject({ headline: 'Smith cut prices', score: 80, status: 'delivered' });
  });
});
