import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agency, alert, alertEvent, changeEvent, client, contact, notification, trendReport } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const agencyA = { agencyId: IDS.agencyA, clientScope: 'all' as const };
const agencyB = { agencyId: IDS.agencyB, clientScope: 'all' as const };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function seedEvent() {
  const [e] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning({ id: changeEvent.id });
  return e!.id;
}
async function seedAlert(eventId: string) {
  const [a] = await dbs.service.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId, score: 80, status: 'drafting', mode: 'after_am_check' }).returning({ id: alert.id });
  await dbs.service.insert(alertEvent).values({ alertId: a!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId });
  return a!.id;
}

describe('delivery columns', () => {
  it('defaults client alert mode and auto-send, and rejects an unknown mode', async () => {
    const [c] = await dbs.owner.select({ mode: client.alertMode, auto: client.briefAutoSend }).from(client).where(sql`id = ${IDS.clientA1}`);
    expect(c).toEqual({ mode: 'after_am_check', auto: false });
    expect(await errorText(dbs.owner.update(client).set({ alertMode: 'loud' }).where(sql`id = ${IDS.clientA1}`))).toMatch(/client_alert_mode_check/);
  });

  it('stores agency branding as nullable jsonb', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Marketing', primary: '#112233' } }).where(sql`id = ${IDS.agencyA}`);
    const [a] = await dbs.owner.select({ b: agency.branding }).from(agency).where(sql`id = ${IDS.agencyA}`);
    expect(a?.b).toEqual({ displayName: 'Acme Marketing', primary: '#112233' });
  });
});

describe('contact', () => {
  it('ties client roles to a client and agency roles to none', async () => {
    await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
    expect(await errorText(dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: null, role: 'client_owner', email: 'x@a1.example' }))).toMatch(/contact_role_scope_check/);
    expect(await errorText(dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'account_manager', email: 'am@a.example' }))).toMatch(/contact_role_scope_check/);
  });

  it('keeps one contact per address per agency and client, case-insensitively', async () => {
    await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'AM@a.example' });
    expect(await errorText(dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'agency_admin', email: 'am@a.example' }))).toMatch(/contact_email_unique/);
    // Same address as a client contact: a different scope, allowed.
    await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'am@a.example' });
  });

  it('rejects a malformed address and a contact whose agency is not its client agency', async () => {
    expect(await errorText(dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'agency_admin', email: 'not-an-email' }))).toMatch(/contact_email_check/);
    expect(await errorText(dbs.service.insert(contact).values({ agencyId: IDS.agencyB, clientId: IDS.clientA1, role: 'client_owner', email: 'o@x.example' }))).toMatch(/foreign key/i);
  });
});

describe('notification', () => {
  it('needs exactly one of contact or webhook, a known channel and a unique dedupe key', async () => {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@a1.example' }).returning({ id: contact.id });
    const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, contactId: c!.id, kind: 'alert', subjectType: 'alert', subjectId: IDS.clientA1, title: 't', body: 'b', status: 'pending' } as const;
    await dbs.service.insert(notification).values({ ...base, channel: 'email', dedupeKey: 'k1' });
    expect(await errorText(dbs.service.insert(notification).values({ ...base, channel: 'email', dedupeKey: 'k1' }))).toMatch(/notification_dedupe_key_unique/);
    expect(await errorText(dbs.service.insert(notification).values({ ...base, channel: 'fax', dedupeKey: 'k2' }))).toMatch(/notification_channel_check/);
    expect(await errorText(dbs.service.insert(notification).values({ ...base, contactId: null, channel: 'email', dedupeKey: 'k3' }))).toMatch(/notification_recipient_check/);
    // The reserved SMS slot (Twilio, after 4b) needs no migration later.
    await dbs.service.insert(notification).values({ ...base, channel: 'sms', dedupeKey: 'k4' });
  });
});

describe('alert', () => {
  it('keeps an event in at most one alert per client', async () => {
    const e = await seedEvent();
    await seedAlert(e);
    const [a2] = await dbs.service.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e, score: 75, status: 'drafting', mode: 'direct' }).returning({ id: alert.id });
    expect(await errorText(dbs.service.insert(alertEvent).values({ alertId: a2!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e }))).toMatch(/alert_event_client_event_unique/);
  });

  it('rejects unknown statuses, deliveries and modes', async () => {
    const e = await seedEvent();
    const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e, score: 80 };
    expect(await errorText(dbs.service.insert(alert).values({ ...base, status: 'sent', mode: 'direct' }))).toMatch(/alert_status_check/);
    expect(await errorText(dbs.service.insert(alert).values({ ...base, status: 'approved', mode: 'loud' }))).toMatch(/alert_mode_check/);
    expect(await errorText(dbs.service.insert(alert).values({ ...base, status: 'approved', mode: 'direct', delivery: 'pigeon' }))).toMatch(/alert_delivery_check/);
  });

  it('keeps one trend report per client and quarter', async () => {
    const v = { agencyId: IDS.agencyA, clientId: IDS.clientA1, quarter: '2026-Q3', periodStart: new Date('2026-07-01T05:00:00Z'), periodEnd: new Date('2026-10-01T05:00:00Z'), status: 'ready', data: null };
    await dbs.service.insert(trendReport).values(v);
    expect(await errorText(dbs.service.insert(trendReport).values(v))).toMatch(/trend_report_client_quarter_unique/);
  });
});

describe('delivery RLS', () => {
  it('shows alerts, alert events and trend reports only to the owning tenant', async () => {
    const e = await seedEvent();
    await seedAlert(e);
    await dbs.service.insert(trendReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, quarter: '2026-Q3', periodStart: new Date(), periodEnd: new Date(), status: 'ready', data: null });
    for (const [scope, n] of [[agencyA, 1], [agencyB, 0]] as const) {
      const counts = await withTenant(dbs.app, scope, async (tx) => [(await tx.select().from(alert)).length, (await tx.select().from(alertEvent)).length, (await tx.select().from(trendReport)).length]);
      expect(counts).toEqual([n, n, n]);
    }
  });

  it('hides contacts from app_user entirely, even in its own agency, and refuses writes', async () => {
    await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
    expect(await errorText(withTenant(dbs.app, agencyA, (tx) => tx.select().from(contact)))).toMatch(/permission denied/i);
    expect(await errorText(withTenant(dbs.app, agencyA, (tx) => tx.insert(contact).values({ agencyId: IDS.agencyA, role: 'agency_admin', email: 'x@a.example' })))).toMatch(/permission denied/i);
  });

  it('app_user cannot write alerts', async () => {
    const e = await seedEvent();
    const ins = withTenant(dbs.app, agencyA, (tx) => tx.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e, score: 80, status: 'drafting', mode: 'direct' }));
    expect(await errorText(ins)).toMatch(/permission denied/i);
  });
});
