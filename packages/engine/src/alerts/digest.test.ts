import { alert, changeEvent, client, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { addContact } from '../delivery/contacts';
import type { DeliveryConfig } from '../delivery/outbox';
import { runAlertDigests } from './digest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
const run = (now: Date) => runAlertDigests({ db: dbs.service, delivery }, now);
const BEFORE = new Date('2026-10-05T23:00:00Z'); // 16:00 PDT Monday
const EVENING = new Date('2026-10-06T00:30:00Z'); // 17:30 PDT Monday
const NEXT_EVENING = new Date('2026-10-07T00:30:00Z'); // 17:30 PDT Tuesday

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ timezone: 'America/Los_Angeles' }).where(eq(client.id, IDS.clientA1));
  await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
});
async function digestAlert(headline: string) {
  const e = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, route: 'alert', occurredAt: day(3) });
  const [a] = await dbs.service.insert(alert).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e.eventId, score: 80, status: 'approved', delivery: 'digest', mode: 'digest_only', headline, body: `${headline} body`, written: 'model',
  }).returning({ id: alert.id });
  return { alertId: a!.id, eventId: e.eventId };
}
const digests = () => dbs.owner.select().from(notification).where(eq(notification.kind, 'alert_digest'));

describe('runAlertDigests', () => {
  it('waits until 17:00 client-local, then sends one digest per recipient channel listing every waiting alert', async () => {
    await digestAlert('First');
    await digestAlert('Second');
    expect(await run(BEFORE)).toEqual({ clients: 0, alerts: 0, withdrawn: 0 });
    expect(await run(EVENING)).toEqual({ clients: 1, alerts: 2, withdrawn: 0 });
    const rows = await digests();
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'in_app']);
    const email = rows.find((r) => r.channel === 'email')!;
    const props = (email.payload as { props: { alerts: { headline: string; link: string }[] } }).props;
    expect(props.alerts.map((a) => a.headline)).toEqual(['First', 'Second']);
    expect(props.alerts[0]!.link).toMatch(/^https:\/\/app\.example\/l\//);
    expect((await dbs.owner.select().from(alert)).every((a) => a.status === 'delivered' && a.deliveredLocalDate === '2026-10-05')).toBe(true);
  });

  it('sends at most one digest per client-local day; later alerts wait for tomorrow', async () => {
    await digestAlert('First');
    await run(EVENING);
    await digestAlert('Late');
    expect((await run(new Date(EVENING.getTime() + 3_600_000))).clients).toBe(0);
    expect(await run(NEXT_EVENING)).toMatchObject({ clients: 1, alerts: 1 });
    expect(await digests()).toHaveLength(4);
  });

  it('withdraws alerts whose event was retracted and skips a digest with nothing left', async () => {
    const { eventId } = await digestAlert('Gone');
    await dbs.owner.update(changeEvent).set({ retractedAt: day(3) }).where(eq(changeEvent.id, eventId));
    expect(await run(EVENING)).toEqual({ clients: 0, alerts: 0, withdrawn: 1 });
    expect(await digests()).toEqual([]);
    expect((await dbs.owner.select().from(alert))[0]!.status).toBe('withdrawn');
  });
});
