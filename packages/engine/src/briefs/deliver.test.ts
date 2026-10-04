import { createAccessContext } from '@cs/core';
import { brief, briefItem, changeEvent, client, feedback, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { addContact } from '../delivery/contacts';
import type { DeliveryConfig } from '../delivery/outbox';
import { deliverBrief, deliverDueBriefs, sendBriefNow } from './deliver';
import { QUIET_SUMMARY } from './generate';
import { approveBriefTx } from './review';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
const deps = () => ({ db: dbs.service, delivery });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am-1', role: 'account_manager', clientScope: 'all', features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'o-1', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
// Monday 2026-11-02 is the day after US DST ends: 07:00 CST = 13:00 UTC.
const MON_0630 = new Date('2026-11-02T12:30:00Z');
const MON_0705 = new Date('2026-11-02T13:05:00Z');

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example', name: 'Pat Lee' });
  await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
});

async function seedBrief(status: 'ready' | 'approved', items: { ord: number; status?: 'active' | 'dropped'; headline: string; upsell?: string }[], o: Partial<typeof brief.$inferInsert> = {}) {
  const ev = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(25) });
  const [b] = await dbs.service.insert(brief).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-11-02', periodStart: day(22), periodEnd: day(29), status, kind: items.length ? 'standard' : 'quiet',
    summary: items.length ? 'Smith HVAC cut a price.' : QUIET_SUMMARY, trend: { windowDays: 30, events: 1, businesses: [] }, ...o,
  }).returning();
  for (const it of items) {
    await dbs.service.insert(briefItem).values({
      briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: it.ord, competitorId: IDS.competitorX, headline: it.headline, whatChanged: 'w', whyItMatters: 'y',
      recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'M', eventIds: [ev.eventId], evidenceIds: [], upsellTag: it.upsell ?? 'ppc', status: it.status ?? 'active',
    });
  }
  return b!.id;
}
const sentRows = (kind = 'brief') => dbs.owner.select().from(notification).where(eq(notification.kind, kind));
const read = async (id: string) => (await dbs.owner.select().from(brief).where(eq(brief.id, id)))[0]!;

describe('deliverDueBriefs', () => {
  it('sends an approved brief from 07:00 client-local on its Monday, across the DST change, once', async () => {
    const id = await seedBrief('approved', [{ ord: 0, headline: 'H0' }]);
    expect((await deliverDueBriefs(deps(), MON_0630)).sent).toEqual([]);
    expect((await deliverDueBriefs(deps(), MON_0705)).sent).toEqual([id]);
    expect(await read(id)).toMatchObject({ status: 'sent' });
    expect((await read(id)).sentAt?.toISOString()).toBe(MON_0705.toISOString());
    expect((await deliverDueBriefs(deps(), new Date(MON_0705.getTime() + 3_600_000))).sent).toEqual([]);
    expect(await sentRows()).toHaveLength(2); // in_app + email for the one client contact
  });

  it('sends only active items, in ord order, with item links and no upsell tag anywhere', async () => {
    const id = await seedBrief('approved', [{ ord: 5, headline: 'Second' }, { ord: 2, headline: 'First', upsell: 'reputation' }, { ord: 3, headline: 'Dropped', status: 'dropped' }]);
    await deliverBrief(deps(), id, MON_0705);
    const email = (await sentRows()).find((r) => r.channel === 'email')!;
    const props = (email.payload as { props: { items: { headline: string; link: string }[]; summary: string } }).props;
    expect(props.items.map((i) => i.headline)).toEqual(['First', 'Second']);
    expect(props.items[0]!.link).toMatch(/^https:\/\/app\.example\/l\//);
    expect(JSON.stringify(email.payload)).not.toMatch(/upsell|reputation|"ppc"/);
    expect(props.summary).toBe('2 competitor updates this week.'); // recomputed: an item was dropped
    expect(email.payload).toMatchObject({ replyTo: 'am@a.example' });
    expect(await sentRows('am_alert')).toEqual([]);
  });

  it('delivers a quiet brief with its trend snapshot', async () => {
    const id = await seedBrief('approved', []);
    await deliverBrief(deps(), id, MON_0705);
    const email = (await sentRows()).find((r) => r.channel === 'email')!;
    expect((email.payload as { props: { kind: string; trend: unknown } }).props).toMatchObject({ kind: 'quiet', trend: { windowDays: 30 } });
  });

  it('auto-sends an untouched ready brief when auto-send is on (a rating does not count as touching it)', async () => {
    await dbs.owner.update(client).set({ briefAutoSend: true }).where(eq(client.id, IDS.clientA1));
    const id = await seedBrief('ready', [{ ord: 0, headline: 'H0' }]);
    const [item] = await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, id));
    await dbs.service.insert(feedback).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, subjectType: 'brief_item', subjectId: item!.id, kind: 'rating', actor: 'am-1', after: { useful: true } });
    expect(await deliverDueBriefs(deps(), MON_0705)).toEqual({ sent: [id], autoApproved: 1, overdue: 0 });
    expect(await read(id)).toMatchObject({ status: 'sent', approvedBy: 'system' });
  });

  it('does not auto-send a touched brief or one without auto-send; the AM gets one overdue notice', async () => {
    await dbs.owner.update(client).set({ briefAutoSend: true }).where(eq(client.id, IDS.clientA1));
    const id = await seedBrief('ready', [{ ord: 0, headline: 'H0' }]);
    const [item] = await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, id));
    await dbs.service.insert(feedback).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, subjectType: 'brief_item', subjectId: item!.id, kind: 'edit', actor: 'am-1', before: {}, after: {} });
    expect(await deliverDueBriefs(deps(), MON_0705)).toEqual({ sent: [], autoApproved: 0, overdue: 1 });
    expect(await deliverDueBriefs(deps(), new Date(MON_0705.getTime() + 3_600_000))).toEqual({ sent: [], autoApproved: 0, overdue: 0 });
    expect((await sentRows('brief_overdue')).map((r) => r.address).filter(Boolean)).toEqual(['am@a.example']);
    expect(await read(id)).toMatchObject({ status: 'ready' });
  });

  it('leaves a brief more than 6 days past its delivery date for "send now"', async () => {
    await seedBrief('approved', [{ ord: 0, headline: 'H0' }], { deliveryDate: '2026-10-26' });
    expect((await deliverDueBriefs(deps(), MON_0705)).sent).toEqual([]);
  });
});

describe('deliverBrief — evidence retracted after approval', () => {
  const emailProps = async () => ((await sentRows()).find((r) => r.channel === 'email')!.payload as { props: { items: { headline: string }[]; summary: string; kind: string } }).props;

  it('drops the item whose event was retracted and recomputes the summary as the count line', async () => {
    const id = await seedBrief('ready', [{ ord: 0, headline: 'Kept' }, { ord: 1, headline: 'Retracted' }]);
    const other = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(26) });
    const [, gone] = await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, id)).orderBy(briefItem.ord);
    await dbs.owner.update(briefItem).set({ eventIds: [other.eventId] }).where(eq(briefItem.id, gone!.id));
    await dbs.service.transaction((tx) => approveBriefTx(tx, id, 'am-1', day(30)));
    await dbs.owner.update(changeEvent).set({ retractedAt: day(31) }).where(eq(changeEvent.id, other.eventId));
    await deliverBrief(deps(), id, MON_0705);
    const props = await emailProps();
    expect(props.items.map((i) => i.headline)).toEqual(['Kept']);
    expect(props.summary).toBe('1 competitor update this week.');
    expect(await read(id)).toMatchObject({ status: 'sent', summary: '1 competitor update this week.' });
    expect(await dbs.owner.select().from(feedback).where(eq(feedback.subjectId, gone!.id))).toMatchObject([{ kind: 'drop', actor: 'system', reason: 'evidence retracted' }]);
  });

  it('turns the brief quiet when every item lost its evidence', async () => {
    const id = await seedBrief('ready', [{ ord: 0, headline: 'Only' }]);
    await dbs.service.transaction((tx) => approveBriefTx(tx, id, 'am-1', day(30)));
    const [item] = await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, id));
    await dbs.owner.update(changeEvent).set({ retractedAt: day(31) }).where(eq(changeEvent.id, item!.eventIds[0]!));
    await deliverBrief(deps(), id, MON_0705);
    expect(await emailProps()).toMatchObject({ items: [], kind: 'quiet', summary: QUIET_SUMMARY });
    expect(await read(id)).toMatchObject({ status: 'sent', kind: 'quiet', summary: QUIET_SUMMARY });
  });
});

describe('sendBriefNow', () => {
  it('approves a ready brief and sends it at once, any day; refuses client roles and a sent brief', async () => {
    const id = await seedBrief('ready', [{ ord: 0, headline: 'H0' }]);
    const d = { service: dbs.service, app: dbs.app, delivery };
    await expect(sendBriefNow(d, owner, id, day(30))).rejects.toMatchObject({ code: 'permission_denied' });
    expect((await sendBriefNow(d, am, id, day(30))).notifications).toBe(2);
    expect(await read(id)).toMatchObject({ status: 'sent', approvedBy: 'am-1' });
    await expect(sendBriefNow(d, am, id, day(30))).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await dbs.owner.select().from(notification).where(and(eq(notification.kind, 'brief'), eq(notification.channel, 'email')))).toHaveLength(1);
  });
});
