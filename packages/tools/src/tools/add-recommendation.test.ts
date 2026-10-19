import { client, feedback, recommendation } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx, dbs, registry, resetWorkspace, seedCapture, seedEvent, seedSelf } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const viewer = ctx('client_viewer', [IDS.clientA1], ['dashboard']);
const mcp = { channel: 'mcp' as const, tokenId: 'pat-1', tokenScope: 'feedback' as const };
const base = { clientId: IDS.clientA1, title: 'Match the tune-up price', rationale: 'Smith HVAC cut its AC tune-up to $79.', effort: 'L', impact: 'H' };
const add = (c: typeof am, input: Record<string, unknown>) => registry.invoke(c, 'add_recommendation', input, mcp) as Promise<{ id: string; url: string }>;

beforeEach(resetWorkspace);

describe('add_recommendation', () => {
  it('creates a todo recommendation with source mcp', async () => {
    const cap = await seedCapture();
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1 });
    const out = await add(am, { ...base, evidenceIds: [cap.ids.text], eventIds: [ev.eventId] });
    expect(out.url).toContain(IDS.clientA1);
    const [r] = await dbs.owner.select().from(recommendation).where(eq(recommendation.id, out.id));
    expect(r).toMatchObject({ status: 'todo', source: 'mcp', owner: 'client', upsellTag: null, evidenceIds: [cap.ids.text], eventIds: [ev.eventId], clientId: IDS.clientA1 });
    const fb = await dbs.owner.select().from(feedback).where(eq(feedback.subjectId, out.id));
    expect(fb).toMatchObject([{ subjectType: 'recommendation', kind: 'created', actor: am.userId }]);
  });

  it('rejects evidence of an untracked competitor', async () => {
    const cap = await seedCapture({ competitorId: IDS.competitorY });
    await expect(add(am, { ...base, evidenceIds: [cap.ids.text] })).rejects.toMatchObject({ code: 'invalid_input', message: 'Every evidence id must be one you can see' });
    await expect(add(am, { ...base, evidenceIds: ['00000000-0000-4000-8000-0000000000ee'] })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await dbs.owner.select().from(recommendation)).toHaveLength(0);
  });

  it("accepts evidence of the client's own business (rank snapshots, own profile)", async () => {
    // Live 2026-10-19: a rank-grid recommendation could not be saved; own-business captures failed the linked check.
    const self = await seedSelf();
    const cap = await seedCapture({ competitorId: self, source: 'google_maps_rank', kinds: ['vendor_json'] });
    const out = await add(am, { ...base, evidenceIds: [cap.ids.vendor_json!] });
    const [r] = await dbs.owner.select().from(recommendation).where(eq(recommendation.id, out.id));
    expect(r!.evidenceIds).toEqual([cap.ids.vendor_json]);
  });

  it('rejects the own-business evidence of another client', async () => {
    const otherSelf = await seedSelf({ clientId: IDS.clientA2, name: 'A2 Plumbing', placeId: 'a2-place' });
    const cap = await seedCapture({ competitorId: otherSelf, source: 'google_maps_rank', kinds: ['vendor_json'] });
    await expect(add(am, { ...base, evidenceIds: [cap.ids.vendor_json!] })).rejects.toMatchObject({ code: 'invalid_input', message: 'Every evidence id must be one you can see' });
  });

  it('rejects a retracted event', async () => {
    const cap = await seedCapture();
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, retracted: true });
    await expect(add(am, { ...base, evidenceIds: [cap.ids.text], eventIds: [ev.eventId] })).rejects.toMatchObject({ code: 'invalid_input', message: 'Every evidence id must be one you can see' });
  });

  it('client_viewer cannot (hidden)', async () => {
    const cap = await seedCapture();
    await expect(registry.invoke(viewer, 'add_recommendation', { ...base, evidenceIds: [cap.ids.text] }, mcp)).rejects.toThrow();
    expect(registry.list(viewer, { channel: 'mcp', tokenScope: 'feedback' }).map((t) => t.name)).not.toContain('add_recommendation');
  });

  it('prospect client not_found', async () => {
    const cap = await seedCapture();
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    await expect(add(am, { ...base, evidenceIds: [cap.ids.text] })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('appears in list_recommendations', async () => {
    const cap = await seedCapture();
    const out = await add(am, { ...base, evidenceIds: [cap.ids.text], owner: 'agency' });
    const list = (await registry.invoke(am, 'list_recommendations', { clientId: IDS.clientA1 })) as { items: { id: string; source: string; owner: string }[] };
    expect(list.items).toMatchObject([{ id: out.id, source: 'mcp', owner: 'agency' }]);
  });
});

describe('add_recommendation via ask', () => {
  it('add_recommendation via ask stores source ask', async () => {
    const cap = await seedCapture();
    const out = (await registry.invoke(am, 'add_recommendation', { ...base, evidenceIds: [cap.ids.text] }, { channel: 'ask' })) as { id: string };
    const [r] = await dbs.owner.select().from(recommendation).where(eq(recommendation.id, out.id));
    expect(r).toMatchObject({ source: 'ask', status: 'todo' });
  });
});
