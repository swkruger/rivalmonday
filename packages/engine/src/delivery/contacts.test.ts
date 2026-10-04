import { client, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addContact, recipientsFor, replyToFor, setNotificationPref } from './contacts';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ timezone: 'America/Los_Angeles' }).where(eq(client.id, IDS.clientA1));
});
const add = (o: Partial<Parameters<typeof addContact>[1]> & { email: string }) =>
  addContact(dbs.service, { agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, ...o });
const forClient = (kind: 'alert' | 'brief' = 'alert') => recipientsFor(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, kind, audience: 'client' });
const forAgency = (kind: 'am_alert' | 'brief_ready' = 'am_alert', clientId: string = IDS.clientA1) => recipientsFor(dbs.service, { agencyId: IDS.agencyA, clientId, kind, audience: 'agency' });

describe('recipients', () => {
  it('lists a client\'s active contacts with default channels and the client\'s zone', async () => {
    const owner = await add({ email: 'owner@a1.example', name: 'Pat' });
    await add({ email: 'viewer@a1.example', role: 'client_viewer' });
    const gone = await add({ email: 'gone@a1.example' });
    await dbs.service.update(contact).set({ active: false }).where(eq(contact.id, gone));
    await add({ email: 'other@a2.example', clientId: IDS.clientA2 });
    const r = await forClient();
    expect(r.map((x) => x.email)).toEqual(['owner@a1.example', 'viewer@a1.example']);
    expect(r[0]).toMatchObject({ contactId: owner, name: 'Pat', role: 'client_owner', timezone: 'America/Los_Angeles', channels: ['in_app', 'email'] });
  });

  it('applies preference overrides per kind and drops a contact with no channel left', async () => {
    const owner = await add({ email: 'owner@a1.example' });
    await setNotificationPref(dbs.service, { contactId: owner, kind: 'alert', channel: 'email', enabled: false });
    expect((await forClient('alert'))[0]?.channels).toEqual(['in_app']);
    expect((await forClient('brief'))[0]?.channels).toEqual(['in_app', 'email']);
    await setNotificationPref(dbs.service, { contactId: owner, kind: 'alert', channel: 'in_app', enabled: false });
    expect(await forClient('alert')).toEqual([]);
    await setNotificationPref(dbs.service, { contactId: owner, kind: 'alert', channel: 'email', enabled: true }); // upsert
    expect((await forClient('alert'))[0]?.channels).toEqual(['email']);
  });

  it('lists agency staff covering the client: unscoped or scoped to it, never another agency', async () => {
    await add({ email: 'admin@a.example', role: 'agency_admin', clientId: null });
    await add({ email: 'am1@a.example', role: 'account_manager', clientId: null, clientScope: [IDS.clientA1] });
    await add({ email: 'am2@a.example', role: 'account_manager', clientId: null, clientScope: [IDS.clientA2] });
    await addContact(dbs.service, { agencyId: IDS.agencyB, role: 'agency_admin', email: 'admin@b.example' });
    const r = await forAgency();
    expect(r.map((x) => x.email).sort()).toEqual(['admin@a.example', 'am1@a.example']);
    expect(r[0]?.timezone).toBe('America/Chicago');
    expect((await forAgency('am_alert', IDS.clientA2)).map((x) => x.email).sort()).toEqual(['admin@a.example', 'am2@a.example']);
  });

  it('refuses a kind for the wrong audience', async () => {
    await expect(recipientsFor(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'am_alert', audience: 'client' })).rejects.toThrow(/not a client/);
    await expect(recipientsFor(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'brief', audience: 'agency' })).rejects.toThrow(/not an agency/);
  });

  it('picks the account manager covering the client as reply-to, else an admin', async () => {
    expect(await replyToFor(dbs.service, IDS.agencyA, IDS.clientA1)).toBeNull();
    await add({ email: 'admin@a.example', role: 'agency_admin', clientId: null });
    expect(await replyToFor(dbs.service, IDS.agencyA, IDS.clientA1)).toEqual({ email: 'admin@a.example', name: null });
    await add({ email: 'am1@a.example', role: 'account_manager', clientId: null, clientScope: [IDS.clientA1], name: 'Sam' });
    expect(await replyToFor(dbs.service, IDS.agencyA, IDS.clientA1)).toEqual({ email: 'am1@a.example', name: 'Sam' });
  });
});

describe('addContact validation', () => {
  it('rejects bad zones, quiet hours, scopes on client roles and bad addresses', async () => {
    await expect(add({ email: 'a@a1.example', timezone: 'Mars/Olympus' })).rejects.toThrow(/time zone/);
    await expect(add({ email: 'a@a1.example', quietHours: { start: '9pm', end: '07:00' } })).rejects.toThrow(/quiet hours/);
    await expect(add({ email: 'a@a1.example', clientScope: [IDS.clientA1] })).rejects.toThrow(/client scope/);
    await expect(add({ email: 'nope' })).rejects.toThrow(/email/);
    await expect(add({ email: 'x@a.example', role: 'account_manager', clientId: null, clientScope: ['not-a-uuid'] })).rejects.toThrow(/client scope/);
  });

  it('rejects an unknown role and a client role with no client id', async () => {
    await expect(addContact(dbs.service, { agencyId: IDS.agencyA, role: 'bogus' as never, email: 'a@a1.example' })).rejects.toThrow(/role/);
    await expect(addContact(dbs.service, { agencyId: IDS.agencyA, role: 'client_owner', clientId: null, email: 'a@a1.example' })).rejects.toThrow(/client id/);
  });
});
