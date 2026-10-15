import { brief, briefItem, client } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
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

describe('list_briefs starting point and generatedAt', () => {
  it('summary carries generatedAt (ISO or null) and the mcp title says Starting point', async () => {
    const [sp] = await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-05', status: 'sent', kind: 'starting_point', summary: 's', generatedAt: new Date('2026-10-05T08:00:00Z') }).returning();
    const [wk] = await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-12', status: 'sent', summary: 'w' }).returning();
    const full = (await registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1 })) as { items: { id: string; generatedAt: string | null }[] };
    expect(full.items.find((i) => i.id === sp!.id)!.generatedAt).toBe('2026-10-05T08:00:00.000Z');
    expect(full.items.find((i) => i.id === wk!.id)!.generatedAt).toBeNull();
    expect(full.items.map((i) => i.id)).toEqual([wk!.id, sp!.id]); // order unchanged: delivery date desc
    const slim = (await registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1 }, mcp)) as { items: { id: string; title: string }[] };
    expect(slim.items.map((i) => i.title)).toEqual(['Weekly brief 2026-10-12', 'Starting point 2026-10-05']);
  });
});

describe('get_starting_point_status', () => {
  const status = (c = admin, clientId: string = IDS.clientA1) => registry.invoke(c, 'get_starting_point_status', { clientId });
  const startingPoint = (st: string) => dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-05', status: st, kind: 'starting_point', summary: 's' }).returning();
  const owner = ctx('client_owner', [IDS.clientA1]);

  it('no starting point yet → preparing with the readiness checks', async () => {
    const out = (await status()) as { state: string; checks: Record<string, boolean | null> };
    expect(out.state).toBe('preparing');
    expect(out.checks).toMatchObject({ profile: false, reviews: false });
  });

  it('generating and failed starting points stay preparing', async () => {
    const [b] = await startingPoint('generating');
    expect(await status()).toMatchObject({ state: 'preparing' });
    await dbs.owner.update(brief).set({ status: 'failed' }).where(eq(brief.id, b!.id));
    expect(await status()).toMatchObject({ state: 'preparing' });
  });

  it('ready and approved map to ready_for_review, also for a client user who cannot read the brief', async () => {
    const [b] = await startingPoint('ready');
    expect(await status()).toEqual({ state: 'ready_for_review' });
    expect(await status(owner)).toEqual({ state: 'ready_for_review' });
    await dbs.owner.update(brief).set({ status: 'approved' }).where(eq(brief.id, b!.id));
    expect(await status(owner)).toEqual({ state: 'ready_for_review' });
  });

  it('sent → sent with the brief id', async () => {
    const [b] = await startingPoint('sent');
    expect(await status(owner)).toEqual({ state: 'sent', briefId: b!.id });
  });

  it('a prospect and an out-of-scope client are not found; the tool is web only', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    await expect(status()).rejects.toMatchObject({ code: 'not_found' });
    await expect(status(owner, IDS.clientA2)).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(admin, 'get_starting_point_status', { clientId: IDS.clientA1 }, mcp)).rejects.toThrow();
  });
});
