import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ago, ctx, dbs, registry, resetWorkspace, seedAds, seedCapture, seedEvent, seedMove, seedReview } from './workspace-fixtures';

const admin = ctx('agency_admin', 'all');
const mcp = { channel: 'mcp' as const, tokenId: 'pat-1', tokenScope: 'read' as const };
type Page = { items: Record<string, unknown>[]; nextCursor?: string | null; hasMore?: boolean };
const call = (name: string, input: Record<string, unknown>, opts?: typeof mcp) => registry.invoke(admin, name, input, opts) as Promise<Page>;

beforeEach(resetWorkspace);

describe('list_clients / list_client_competitors', () => {
  it('list_clients summary has name, null date, no evidence and the client link; web stays full', async () => {
    const out = await call('list_clients', {}, mcp);
    expect(out.items.length).toBeGreaterThan(0);
    for (const r of out.items) expect(r).toEqual({ id: r.id, title: expect.any(String), date: null, evidenceIds: [], url: `/c/${r.id}` });
    const web = await call('list_clients', {});
    expect(web.items[0]).toHaveProperty('verticalId');
  });

  it('list_clients paginates with a cursor', async () => {
    const all = await call('list_clients', {}, mcp);
    if (all.items.length < 2) return;
    const p1 = await call('list_clients', { limit: 1 }, mcp);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await call('list_clients', { limit: 1, cursor: p1.nextCursor! }, mcp);
    expect(p2.items[0]!.id).not.toBe(p1.items[0]!.id);
  });

  it('list_client_competitors summary links to the competitor page; web stays full', async () => {
    const out = await call('list_client_competitors', { clientId: IDS.clientA1 }, mcp);
    expect(out.items.length).toBeGreaterThan(0);
    const r = out.items[0]!;
    expect(r).toMatchObject({ evidenceIds: [], url: `/c/${IDS.clientA1}/competitors/${r.id}` });
    expect(typeof r.date).toBe('string');
    const web = await call('list_client_competitors', { clientId: IDS.clientA1 });
    expect(web.items[0]).toHaveProperty('activePages');
  });
});

describe('list_moves', () => {
  it('summary has label, last evidence date, live-event evidence and a move link; web stays full', async () => {
    const cap = await seedCapture({ kinds: ['text'] });
    const { eventId } = await seedEvent({ score: 80, route: 'alert', ageDays: 1, captures: { before: cap.captureId, after: cap.captureId } });
    const moveId = await seedMove([eventId]);
    const out = await call('list_moves', { clientId: IDS.clientA1 }, mcp);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ id: moveId, evidenceIds: [cap.ids.text!], url: `/c/${IDS.clientA1}/moves?move=${moveId}` });
    expect(out.items[0]!.title).toEqual(expect.any(String));
    const web = await call('list_moves', { clientId: IDS.clientA1 });
    expect(web.items[0]).toHaveProperty('eventCount');
  });
});

describe('list_ads', () => {
  const ads = [1, 2, 3].map((n) => ({ platform: 'meta', externalId: `a${n}`, title: `Ad ${n}`, text: 'Call (512) 555-0147', isActive: true, firstSeenAt: ago(10 - n), lastSeenAt: ago(n) }));

  it('summary has headline, first seen date, redaction and a competitor link', async () => {
    await seedAds({ ads });
    const out = await call('list_ads', { clientId: IDS.clientA1 }, mcp);
    expect(out.items).toHaveLength(3);
    const r = out.items[0]!;
    expect(r).toMatchObject({ evidenceIds: [], url: `/c/${IDS.clientA1}/competitors/${IDS.competitorX}` });
    expect(String(r.title)).toMatch(/^Ad \d$/);
    expect(JSON.stringify(out)).not.toContain('555-0147');
  });

  it('paginates by cursor without overlap and keeps web offset/hasMore', async () => {
    await seedAds({ ads });
    const p1 = await call('list_ads', { clientId: IDS.clientA1, limit: 2 }, mcp);
    const p2 = await call('list_ads', { clientId: IDS.clientA1, limit: 2, cursor: p1.nextCursor! }, mcp);
    expect([p1.items.length, p2.items.length, p2.nextCursor]).toEqual([2, 1, null]);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(3);
    const web = await call('list_ads', { clientId: IDS.clientA1, limit: 2, offset: 1 });
    expect(web.items).toHaveLength(2);
    expect(web.hasMore).toBe(false);
    expect(web.items[0]).toHaveProperty('libraryUrl');
  });
});

describe('search_reviews', () => {
  it('summary has business and stars, postedAt, no evidence, keeps name redaction; web stays full', async () => {
    await seedReview({ rating: 4, text: 'Dave Thompson showed up late', postedAt: ago(2) });
    const out = await call('search_reviews', { clientId: IDS.clientA1 }, mcp);
    expect(out.items).toHaveLength(1);
    const r = out.items[0]!;
    expect(r).toMatchObject({ title: 'Smith HVAC review, 4★', evidenceIds: [], url: `/c/${IDS.clientA1}/reviews` });
    expect(JSON.stringify(out)).not.toContain('Thompson');
    const web = await call('search_reviews', { clientId: IDS.clientA1 });
    expect(web.items[0]).toHaveProperty('ownerAnswer');
  });

  it('paginates by cursor with 20-row web default intact', async () => {
    for (let i = 0; i < 3; i++) await seedReview({ postedAt: ago(i + 1) });
    const p1 = await call('search_reviews', { clientId: IDS.clientA1, limit: 2 }, mcp);
    const p2 = await call('search_reviews', { clientId: IDS.clientA1, limit: 2, cursor: p1.nextCursor! }, mcp);
    expect([p1.items.length, p2.items.length, p2.nextCursor]).toEqual([2, 1, null]);
    expect((await call('search_reviews', { clientId: IDS.clientA1 })).items).toHaveLength(3);
    void dbs;
  });
});
