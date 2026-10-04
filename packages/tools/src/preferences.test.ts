import { contact, notificationPref } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { myNotificationSettings, setMyNotificationPref, updateMyContact } from './preferences';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let clientContact = '';
let agencyContact = '';
let someoneElse = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const rows = await dbs.service.insert(contact).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'me@e.co', userId: 'u1' },
    { agencyId: IDS.agencyA, role: 'account_manager', email: 'me@e.co', userId: 'u1' },
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'x@e.co', userId: 'u2' },
  ]).returning();
  [clientContact, agencyContact, someoneElse] = rows.map((r) => r.id) as [string, string, string];
});

describe('myNotificationSettings', () => {
  it('lists each of my contacts with the kinds of its audience, defaulting to on', async () => {
    await setMyNotificationPref(dbs.service, 'u1', { contactId: clientContact, kind: 'alert', channel: 'email', enabled: false });
    const s = await myNotificationSettings(dbs.service, 'u1');
    const c = s.find((x) => x.contactId === clientContact)!;
    expect(c.clientName).toBe('A1 HVAC');
    expect(c.kinds.map((k) => k.kind)).toEqual(['alert', 'alert_digest', 'brief', 'trend_report']);
    expect(c.kinds[0]!.channels).toEqual({ in_app: true, email: false });
    const a = s.find((x) => x.contactId === agencyContact)!;
    expect(a.kinds.map((k) => k.kind)).toEqual(['am_alert', 'brief_ready', 'brief_failed', 'brief_overdue', 'trend_report']);
  });
});

describe('setMyNotificationPref / updateMyContact', () => {
  it('refuses another person’s contact and kinds outside the contact’s audience', async () => {
    await expect(setMyNotificationPref(dbs.service, 'u1', { contactId: someoneElse, kind: 'alert', channel: 'email', enabled: false })).rejects.toMatchObject({ code: 'not_found' });
    await expect(setMyNotificationPref(dbs.service, 'u1', { contactId: clientContact, kind: 'am_alert', channel: 'email', enabled: false })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await dbs.service.select().from(notificationPref)).toEqual([]);
  });

  it('validates timezone and quiet hours', async () => {
    await updateMyContact(dbs.service, 'u1', { contactId: clientContact, timezone: 'America/Denver', quietHours: { start: '21:00', end: '07:00' } });
    const [row] = await dbs.service.select().from(contact).where(eq(contact.id, clientContact));
    expect(row).toMatchObject({ timezone: 'America/Denver', quietHours: { start: '21:00', end: '07:00' } });
    await expect(updateMyContact(dbs.service, 'u1', { contactId: clientContact, timezone: 'Mars/Base' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(updateMyContact(dbs.service, 'u1', { contactId: clientContact, quietHours: { start: '25:00', end: '07:00' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await updateMyContact(dbs.service, 'u1', { contactId: clientContact, timezone: '', quietHours: null });
    const [cleared] = await dbs.service.select().from(contact).where(eq(contact.id, clientContact));
    expect(cleared).toMatchObject({ timezone: null, quietHours: null });
  });
});
