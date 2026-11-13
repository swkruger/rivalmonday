import { client, listedEvent } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { localDate } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ListedEventsView } from './schemas';
import { ago, ctx, dbs, registry as reg, resetWorkspace, seedCapture, seedSelf } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const mcp = { channel: 'mcp', tokenId: 't', tokenScope: 'read' } as never;
const askMeta = { channel: 'ask', tokenId: 't', tokenScope: 'read' } as never;
const list = (c = am, input: Record<string, unknown> = {}, meta?: never) => reg.invoke(c, 'list_listed_events', { clientId: IDS.clientA1, ...input }, meta) as Promise<ListedEventsView>;
const menu = (c = am, input: Record<string, unknown> = {}) => reg.invoke(c, 'get_client_events_menu', input) as Promise<{ clientIds: string[] }>;

/** The calendar date `n` days from today in the default client time zone (America/Chicago). */
const inDays = (n: number): string => localDate(new Date(Date.now() + n * 86_400_000), 'America/Chicago');

type Row = { competitorId: string; name: string; startDate: string; captureId: string } & Partial<typeof listedEvent.$inferInsert>;
const event = (r: Row) => dbs.owner.insert(listedEvent).values({
  eventKey: `${r.name}|${r.startDate}`, nameNorm: r.name.toLowerCase(), sources: ['web'], firstCaptureId: r.captureId, lastCaptureId: r.captureId,
  firstSeenAt: ago(3), lastSeenAt: ago(1), ...r,
}).returning().then((x) => x[0]!);
const cap = (competitorId: string) => seedCapture({ competitorId, kinds: ['text', 'vendor_json'] });

beforeEach(resetWorkspace);

describe('list_listed_events (18d)', () => {
  it('exact shape: self first on a shared date, ordered by date; past and 61-day rows are excluded', async () => {
    const self = await seedSelf();
    const x = await cap(IDS.competitorX);
    const s = await cap(self);
    const d = inDays(10);
    const rival = await event({ competitorId: IDS.competitorX, name: 'Rival Fest', startDate: d, captureId: x.captureId, ticketed: true, url: 'https://smithhvac.example/e', sources: ['web', 'google_panel'] });
    const mine = await event({ competitorId: self, name: 'Open House', startDate: d, captureId: s.captureId, startsAt: ago(-10) });
    const earlier = await event({ competitorId: IDS.competitorX, name: 'Early Bird', startDate: inDays(2), captureId: x.captureId, status: 'sold_out' });
    await event({ competitorId: IDS.competitorX, name: 'Yesterday', startDate: inDays(-1), captureId: x.captureId });
    await event({ competitorId: self, name: 'Far Away', startDate: inDays(61), captureId: s.captureId });

    const r = await list();
    expect(r.windowStart).toBe(inDays(0));
    expect(r.windowEnd).toBe(inDays(60));
    expect(r.events.map((e) => e.name)).toEqual(['Early Bird', 'Open House', 'Rival Fest']);
    expect(r.events[1]).toEqual({
      id: mine.id, competitorId: self, businessName: 'A1 HVAC', self: true, name: 'Open House', startDate: d, startsAt: expect.any(String), status: 'scheduled',
      sources: ['web'], url: null, ticketed: false, firstSeenAt: expect.any(String), evidenceId: s.ids.text,
    });
    expect(r.events[2]).toMatchObject({ id: rival.id, businessName: 'Smith HVAC', self: false, ticketed: true, url: 'https://smithhvac.example/e', sources: ['web', 'google_panel'], startsAt: null, evidenceId: x.ids.text });
    expect(r.events[0]).toMatchObject({ id: earlier.id, status: 'sold_out' });

    const wide = await list(am, { days: 90 });
    expect(wide.events.map((e) => e.name)).toContain('Far Away');
    expect(wide.windowEnd).toBe(inDays(90));
  });

  it('an invalid-but-shaped client time zone falls back to Chicago', async () => {
    await dbs.owner.update(client).set({ timezone: 'Mars/Olympus_Mons' }).where(eq(client.id, IDS.clientA1));
    const r = await list();
    expect(r.windowStart).toBe(inDays(0));
    expect(r.windowEnd).toBe(inDays(60));
  });

  it('a rival tracked only by a sibling client never appears', async () => {
    await seedSelf();
    const c = await cap(IDS.competitorY);
    await event({ competitorId: IDS.competitorY, name: 'Elsewhere', startDate: inDays(5), captureId: c.captureId });
    expect((await list()).events).toEqual([]);
  });

  it('evidence ids by channel: mcp text only, ask also vendor_json', async () => {
    const x = await seedCapture({ competitorId: IDS.competitorX, kinds: ['vendor_json'] });
    await event({ competitorId: IDS.competitorX, name: 'Panel Event', startDate: inDays(5), captureId: x.captureId });
    expect((await list(am, {}, mcp)).events[0]!.evidenceId).toBeNull();
    expect((await list(am, {}, askMeta)).events[0]!.evidenceId).toBe(x.ids.vendor_json);
  });

  it('RF5: an out-of-scope client, or one without the dashboard feature, is not_found', async () => {
    await expect(list(ctx('account_manager', [IDS.clientA2]))).rejects.toMatchObject({ code: 'not_found' });
    await expect(list(ownerNoDash)).rejects.toMatchObject({ code: 'not_found' });
    await expect(reg.invoke(am, 'list_listed_events', { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    expect((await list(owner)).events).toEqual([]);
  });

  it('no usd keys or dollar text', async () => {
    const self = await seedSelf();
    const s = await cap(self);
    await event({ competitorId: self, name: 'Gala', startDate: inDays(4), captureId: s.captureId });
    expect(JSON.stringify(await list())).not.toMatch(/usd|\$|rival monday|dataforseo/i);
  });
});

describe('get_client_events_menu (18d)', () => {
  it('RF5: menu off for hvac without events', async () => {
    expect(await menu(am, { clientId: IDS.clientA1 })).toEqual({ clientIds: [] });
    expect(await menu()).toEqual({ clientIds: [] });
  });

  it('on with a rival row 20 days old; off with one 40 days old', async () => {
    const x = await cap(IDS.competitorX);
    await event({ competitorId: IDS.competitorX, name: 'Old News', startDate: inDays(-40), captureId: x.captureId });
    expect(await menu(am, { clientId: IDS.clientA1 })).toEqual({ clientIds: [] });
    await event({ competitorId: IDS.competitorX, name: 'Recent', startDate: inDays(-20), captureId: x.captureId });
    expect(await menu(am, { clientId: IDS.clientA1 })).toEqual({ clientIds: [IDS.clientA1] });
  });

  it('on for a tracked rival event (A2) and for the own business (A1), not for other clients', async () => {
    const y = await cap(IDS.competitorY);
    await event({ competitorId: IDS.competitorY, name: 'Not Mine', startDate: inDays(3), captureId: y.captureId });
    expect((await menu()).clientIds).toEqual([IDS.clientA2]);
    const self = await seedSelf();
    const s = await cap(self);
    await event({ competitorId: self, name: 'Mine', startDate: inDays(3), captureId: s.captureId });
    expect((await menu()).clientIds.sort()).toEqual([IDS.clientA1, IDS.clientA2].sort());
  });

  it('on for a venues client with no rows', async () => {
    await dbs.owner.update(client).set({ verticalId: 'venues_attractions' }).where(eq(client.id, IDS.clientA1));
    expect(await menu(am, { clientId: IDS.clientA1 })).toEqual({ clientIds: [IDS.clientA1] });
    expect(await menu()).toEqual({ clientIds: [IDS.clientA1] });
  });

  it('an agency call without an id returns only its own clients', async () => {
    await dbs.owner.update(client).set({ verticalId: 'venues_attractions' }).where(eq(client.id, IDS.clientB1));
    await dbs.owner.update(client).set({ verticalId: 'venues_attractions' }).where(eq(client.id, IDS.clientA2));
    expect(await menu()).toEqual({ clientIds: [IDS.clientA2] });
    expect(await menu(ctx('account_manager', [IDS.clientA1]))).toEqual({ clientIds: [] });
  });

  it('RF5: an out-of-scope client is not_found', async () => {
    await expect(menu(ctx('account_manager', [IDS.clientA2]), { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(menu(am, { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(menu(ownerNoDash, { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});
