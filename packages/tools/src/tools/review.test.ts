import { type AccessContext, createAccessContext } from '@cs/core';
import { brief, briefItem, client, contact, feedback, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { DeliveryConfig } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'http://localhost:3000', linkSecrets: ['k'.repeat(40)], fromAddress: 'briefs@example.com' };
const enqueue = vi.fn<EnqueueJob>(async () => {});
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, delivery, enqueue }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const am = ctx('account_manager', [IDS.clientA1]);
const amA2 = ctx('account_manager', [IDS.clientA2]);
const today = new Date().toISOString().slice(0, 10);
let briefId = '';
let items: string[] = [];

beforeEach(async () => {
  enqueue.mockClear();
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: today, periodStart: new Date(), periodEnd: new Date(), status: 'ready', summary: 'Two moves.', dropped: { items: 1, sentences: 2 } }).returning();
  briefId = b!.id;
  const rows = await dbs.owner.insert(briefItem).values([1, 2].map((ord) => ({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId, ord, competitorId: IDS.competitorX, headline: `Item ${ord}`, whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L' as const, impact: 'H' as const, upsellTag: 'ppc',
  }))).returning();
  items = rows.map((r) => r.id);
  await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
});

describe('brief queue', () => {
  it('lists this week’s briefs per client with counts and flags', async () => {
    const { items: rows } = (await registry.invoke(am, 'list_brief_queue', {})) as { items: Record<string, unknown>[] };
    expect(rows).toEqual([expect.objectContaining({ briefId, clientName: 'A1 HVAC', status: 'ready', activeItems: 2, droppedItems: 0, touched: false, autoSend: false })]);
    expect(((await registry.invoke(amA2, 'list_brief_queue', {})) as { items: unknown[] }).items).toEqual([]);
  });

  it('get_brief_review carries fact-check counts and the agency-only upsell tag', async () => {
    const r = (await registry.invoke(am, 'get_brief_review', { briefId })) as { factCheck: unknown; items: { upsellTag: string | null }[]; clientName: string };
    expect(r.factCheck).toEqual({ items: 1, sentences: 2 });
    expect(r.items[0]!.upsellTag).toBe('ppc');
    await expect(registry.invoke(amA2, 'get_brief_review', { briefId })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('review actions', () => {
  it('edits, reorders, rates and drops, marking the brief touched', async () => {
    const { warnings } = (await registry.invoke(am, 'edit_brief_item', { itemId: items[0], headline: 'Smith HVAC cut tune-ups' })) as { warnings: string[] };
    expect(Array.isArray(warnings)).toBe(true);
    await registry.invoke(am, 'reorder_brief_items', { briefId, itemIds: [items[1], items[0]] });
    await registry.invoke(am, 'rate_brief_item', { itemId: items[1], useful: true });
    await registry.invoke(am, 'drop_brief_item', { itemId: items[1], reason: 'Not relevant' });
    const r = (await registry.invoke(am, 'get_brief_review', { briefId })) as { touched: boolean; items: { id: string; status: string; ord: number }[] };
    expect(r.touched).toBe(true);
    expect(r.items.find((i) => i.id === items[1])!.status).toBe('dropped');
  });

  it('refuses another scope’s items (Review Focus 1)', async () => {
    await expect(registry.invoke(amA2, 'edit_brief_item', { itemId: items[0], headline: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA2, 'approve_brief', { briefId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA2, 'send_brief_now', { briefId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('approve wins once; a later edit is refused with a clear message (Review Focus 2)', async () => {
    const { recommendations } = (await registry.invoke(am, 'approve_brief', { briefId })) as { recommendations: number };
    expect(recommendations).toBe(2);
    await expect(registry.invoke(am, 'edit_brief_item', { itemId: items[0], headline: 'late' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(am, 'approve_brief', { briefId })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('send now approves, sends once, and enqueues the PDF (Review Focus 2)', async () => {
    const r = (await registry.invoke(am, 'send_brief_now', { briefId })) as { notifications: number; pdf: string };
    expect(r.pdf).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith('brief-pdf', { briefId }, briefId);
    expect((await dbs.owner.select().from(brief).where(eq(brief.id, briefId)))[0]!.status).toBe('sent');
    expect(await dbs.owner.select().from(recommendation)).toHaveLength(2);
    await expect(registry.invoke(am, 'send_brief_now', { briefId })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('send now explains missing delivery configuration', async () => {
    const bare = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    await expect(bare.invoke(am, 'send_brief_now', { briefId })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('APP_URL') });
  });

  it('toggles auto-send with feedback history', async () => {
    await registry.invoke(am, 'set_brief_auto_send', { clientId: IDS.clientA1, enabled: true });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.briefAutoSend).toBe(true);
    expect((await dbs.owner.select().from(feedback).where(eq(feedback.subjectType, 'client'))).length).toBe(1);
    await expect(registry.invoke(amA2, 'set_brief_auto_send', { clientId: IDS.clientA1, enabled: true })).rejects.toMatchObject({ code: 'not_found' });
  });
});
