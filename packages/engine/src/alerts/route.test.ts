import { createAccessContext } from '@cs/core';
import { alert, changeEvent, client, feedback, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, noul } from '../../test/fake-ai';
import { day, seedScoredEvent } from '../../test/seed';
import { addContact } from '../delivery/contacts';
import type { DeliveryConfig } from '../delivery/outbox';
import { createPackLoader } from '../tag/tag-stage';
import { sweepAlerts } from './create';
import { approveAlert, dismissAlert, getAlert, processAlert } from './route';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'briefs@agency.example' };
const ai = createFakeAi({
  chat: () => JSON.stringify({ headline: 'Smith HVAC cut its AC tune-up price to $69.', body: 'The pricing page now shows $69, down from $89.' }),
  decide: (_s, qs) => ({ answers: Object.fromEntries(Object.keys(qs).map((k) => [k, noul(true)])), needsReview: [] }),
});
const deps = { db: dbs.service, ai, packs, delivery };
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am-1', role: 'account_manager', clientScope: 'all', features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'o-1', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
const amB = createAccessContext({ agencyId: IDS.agencyB, userId: 'am-b', role: 'account_manager', clientScope: 'all', features: [] });
// 2026-10-06 06:30 UTC = Mon 2026-10-05 23:30 PDT
const NOW = new Date('2026-10-06T06:30:00Z');

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ timezone: 'America/Los_Angeles' }).where(eq(client.id, IDS.clientA1));
  await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
  await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
});

async function newAlert(mode: 'direct' | 'after_am_check' | 'digest_only', o: Partial<Parameters<typeof seedScoredEvent>[1]> = {}) {
  await dbs.owner.update(client).set({ alertMode: mode }).where(eq(client.id, IDS.clientA1));
  const e = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, route: 'alert', score: 82, occurredAt: day(4), scoredAt: day(4), services: { hvac_plumbing: `svc_${Math.random()}` }, ...o });
  await sweepAlerts(dbs.service, NOW);
  // Look the alert up by its event: alerts created by one sweep share a created_at, so "the last drafting one" is ambiguous.
  const [a] = await dbs.owner.select({ id: alert.id }).from(alert).where(eq(alert.eventId, e.eventId));
  return { alertId: a!.id, eventId: e.eventId };
}
const kinds = async (kind: string) => dbs.owner.select().from(notification).where(eq(notification.kind, kind));
const status = async (id: string) => (await dbs.owner.select().from(alert).where(eq(alert.id, id)))[0]!;

describe('processAlert', () => {
  it('direct: writes the text, delivers to the client at once and tells the AM', async () => {
    const { alertId } = await newAlert('direct');
    expect(await processAlert(deps, alertId, NOW)).toEqual({ status: 'delivered', release: 'immediate' });
    expect(await status(alertId)).toMatchObject({ status: 'delivered', delivery: 'immediate', written: 'model', deliveredLocalDate: '2026-10-05', headline: 'Smith HVAC cut its AC tune-up price to $69.' });
    expect((await kinds('alert')).map((n) => n.channel).sort()).toEqual(['email', 'in_app']);
    const amRows = await kinds('am_alert');
    expect(amRows.map((n) => n.title)).toEqual(expect.arrayContaining(['Alert: Smith HVAC cut its AC tune-up price to $69.']));
    expect(amRows.every((n) => n.address !== 'owner@a1.example')).toBe(true);
    expect(await processAlert(deps, alertId, NOW)).toEqual({ status: 'skipped' }); // already processed
  });

  it('after_am_check: waits for an AM; nothing reaches the client until approval', async () => {
    const { alertId } = await newAlert('after_am_check');
    expect((await processAlert(deps, alertId, NOW)).status).toBe('pending_review');
    expect(await kinds('alert')).toEqual([]);
    expect((await kinds('am_alert'))[0]!.title).toMatch(/^Review alert: /);
    await expect(approveAlert({ service: dbs.service, app: dbs.app, delivery }, owner, alertId, NOW)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(approveAlert({ service: dbs.service, app: dbs.app, delivery }, amB, alertId, NOW)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getAlert({ app: dbs.app }, owner, alertId)).rejects.toMatchObject({ code: 'not_found' }); // not delivered yet
    expect(await approveAlert({ service: dbs.service, app: dbs.app, delivery }, am, alertId, NOW)).toBe('immediate');
    expect(await kinds('alert')).toHaveLength(2);
    expect((await getAlert({ app: dbs.app }, owner, alertId)).status).toBe('delivered');
    const [f] = await dbs.owner.select().from(feedback).where(eq(feedback.subjectId, alertId));
    expect(f).toMatchObject({ subjectType: 'alert', kind: 'status', actor: 'am-1', after: { status: 'approved' } });
    await expect(approveAlert({ service: dbs.service, app: dbs.app, delivery }, am, alertId, NOW)).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('dismissal needs a reason and sends nothing to the client', async () => {
    const { alertId } = await newAlert('after_am_check');
    await processAlert(deps, alertId, NOW);
    await expect(dismissAlert({ service: dbs.service, app: dbs.app }, am, alertId, '  ')).rejects.toMatchObject({ code: 'invalid_input' });
    await dismissAlert({ service: dbs.service, app: dbs.app }, am, alertId, 'Old promo, client knows', NOW);
    expect(await status(alertId)).toMatchObject({ status: 'dismissed', dismissReason: 'Old promo, client knows' });
    expect(await kinds('alert')).toEqual([]);
  });

  it('digest_only: goes straight to the digest', async () => {
    const { alertId } = await newAlert('digest_only');
    expect(await processAlert(deps, alertId, NOW)).toEqual({ status: 'approved', release: 'digest' });
    expect(await kinds('alert')).toEqual([]);
  });

  it('withdraws an alert whose event was retracted before approval', async () => {
    const { alertId, eventId } = await newAlert('after_am_check');
    await processAlert(deps, alertId, NOW);
    await dbs.owner.update(changeEvent).set({ retractedAt: NOW }).where(eq(changeEvent.id, eventId));
    expect(await approveAlert({ service: dbs.service, app: dbs.app, delivery }, am, alertId, NOW)).toBe('withdrawn');
    expect(await kinds('alert')).toEqual([]);
  });
});

describe('throttle', () => {
  async function delivered(n: number, localDate: string) {
    for (let i = 0; i < n; i++) {
      const { alertId } = await newAlert('direct');
      await dbs.owner.update(alert).set({ status: 'delivered', delivery: 'immediate', deliveredLocalDate: localDate }).where(eq(alert.id, alertId));
    }
  }

  it('sends at most 3 immediately per client-local day; the 4th goes to the digest', async () => {
    await delivered(3, '2026-10-05');
    const { alertId } = await newAlert('direct');
    expect(await processAlert(deps, alertId, NOW)).toEqual({ status: 'approved', release: 'digest' });
    // The next local day (08:00 PDT Tuesday) has a fresh allowance.
    const next = await newAlert('direct');
    expect((await processAlert(deps, next.alertId, new Date('2026-10-06T15:00:00Z'))).release).toBe('immediate');
  });

  it('lets exactly one of two concurrent approvals take the last slot', async () => {
    await delivered(2, '2026-10-05');
    const a = await newAlert('after_am_check');
    const b = await newAlert('after_am_check');
    await processAlert(deps, a.alertId, NOW);
    await processAlert(deps, b.alertId, NOW);
    const d = { service: dbs.service, app: dbs.app, delivery };
    const outcomes = await Promise.all([approveAlert(d, am, a.alertId, NOW), approveAlert(d, am, b.alertId, NOW)]);
    expect(outcomes.sort()).toEqual(['digest', 'immediate']);
    expect(await dbs.owner.select().from(alert).where(and(eq(alert.delivery, 'immediate'), eq(alert.deliveredLocalDate, '2026-10-05')))).toHaveLength(3);
  });
});
