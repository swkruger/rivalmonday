import { brief, briefItem } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx, dbs, registry, resetWorkspace } from './workspace-fixtures';

const admin = ctx('agency_admin', 'all');
const mcp = { channel: 'mcp' as const, tokenId: 'pat-1', tokenScope: 'read' as const };
const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1 };
const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z') };
const item = (briefId: string, ord: number, evidenceIds: string[], status = 'active') => ({
  ...base, briefId, ord, competitorId: IDS.competitorX, headline: `h${ord}`, whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds, status,
});

beforeEach(resetWorkspace);

describe('list_briefs paging and detail', () => {
  it('list_briefs summary over mcp has url /go/brief/<id> and evidenceIds', async () => {
    const [b] = await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-05', status: 'sent', summary: 'Sent' }).returning();
    await dbs.owner.insert(briefItem).values([item(b!.id, 1, ['e1', 'e2']), item(b!.id, 2, ['e2', 'e3']), item(b!.id, 3, ['dropped'], 'dropped')]);
    const out = (await registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1 }, mcp)) as { items: Record<string, unknown>[]; nextCursor?: string | null };
    expect(out.items).toEqual([{ id: b!.id, title: 'Weekly brief 2026-10-05', date: '2026-10-05', evidenceIds: ['e1', 'e2', 'e3'], url: `/go/brief/${b!.id}` }]);
    expect(out.nextCursor).toBeNull();
  });

  it('list_briefs paginates over mcp with nextCursor and no overlap', async () => {
    for (let d = 1; d <= 5; d++) await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: `2026-10-0${d}`, status: 'sent', summary: 's' });
    const call = (input: Record<string, unknown>) => registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1, ...input }, mcp) as Promise<{ items: { id: string }[]; nextCursor: string | null }>;
    const p1 = await call({ limit: 2 });
    const p2 = await call({ limit: 2, cursor: p1.nextCursor! });
    const p3 = await call({ limit: 2, cursor: p2.nextCursor! });
    expect([p1.items.length, p2.items.length, p3.items.length, p3.nextCursor]).toEqual([2, 2, 1, null]);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((i) => i.id)).size).toBe(5);
    await expect(call({ cursor: '%%%' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('web call without detail returns full rows unchanged', async () => {
    await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-05', status: 'sent', summary: 'Sent' });
    const out = (await registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1 })) as { items: Record<string, unknown>[] };
    expect(out.items[0]).toMatchObject({ deliveryDate: '2026-10-05', status: 'sent', summary: 'Sent', hasPdf: false });
    const asFull = (await registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1, detail: 'full' }, mcp)) as { items: Record<string, unknown>[] };
    expect(asFull.items[0]).toHaveProperty('hasPdf');
  });
});
