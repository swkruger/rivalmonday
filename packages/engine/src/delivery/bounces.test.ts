import { contact, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { handlePostmarkEvent, postmarkAuthOk } from './bounces';
import { addContact } from './contacts';
import type { DeliveryConfig } from './outbox';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
const deps = (d: DeliveryConfig | null = delivery) => ({ db: dbs.service, delivery: d });
const NOW = new Date('2026-10-20T10:00:00Z');
const MSG = 'b7bc2f4a-e38e-4336-af7d-e6c392c2f817';

const notices = () => dbs.owner.select().from(notification).where(eq(notification.kind, 'contact_bounced'));
const activeOf = async (id: string) => (await dbs.owner.select({ active: contact.active }).from(contact).where(eq(contact.id, id)))[0]!.active;
const bounce = (over: Record<string, unknown> = {}) => ({ RecordType: 'Bounce', Type: 'HardBounce', TypeCode: 1, MessageID: MSG, Email: 'owner@a1.example', ...over });

let owner: string;
let staff: string;
let ownerA2: string;
let ownerB1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  staff = await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
  owner = await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'Owner@A1.example', name: 'Olive' });
  ownerA2 = await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA2, role: 'client_viewer', email: 'owner@a1.EXAMPLE' });
  ownerB1 = await addContact(dbs.service, { agencyId: IDS.agencyB, clientId: IDS.clientB1, role: 'client_owner', email: 'owner@a1.example' });
  await dbs.owner.insert(notification).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, contactId: owner, channel: 'email', kind: 'brief', subjectType: 'brief', subjectId: IDS.clientA1,
    dedupeKey: 'brief:x', title: 't', body: 'b', address: 'Owner@A1.example', status: 'sent', providerId: MSG,
  });
});

describe('postmarkAuthOk', () => {
  const secret = 'whsec-123';
  const good = `Basic ${Buffer.from(`postmark:${secret}`).toString('base64')}`;
  it('accepts exactly Basic postmark:<secret>', () => {
    expect(postmarkAuthOk(good, secret)).toBe(true);
    expect(postmarkAuthOk(null, secret)).toBe(false);
    expect(postmarkAuthOk('', secret)).toBe(false);
    expect(postmarkAuthOk(`Basic ${Buffer.from('postmark:nope').toString('base64')}`, secret)).toBe(false);
    expect(postmarkAuthOk(`Basic ${Buffer.from(`other:${secret}`).toString('base64')}`, secret)).toBe(false);
    expect(postmarkAuthOk(`${good}x`, secret)).toBe(false);
  });
});

describe('handlePostmarkEvent', () => {
  it('hard bounce deactivates every contact with that address in the agency (case-insensitive)', async () => {
    expect(await handlePostmarkEvent(deps(), bounce({ Email: 'OWNER@a1.example' }), NOW)).toBe('deactivated');
    expect(await activeOf(owner)).toBe(false);
    expect(await activeOf(ownerA2)).toBe(false);
    expect(await activeOf(staff)).toBe(true);
    const rows = await notices();
    const inApp = rows.filter((r) => r.channel === 'in_app');
    expect(inApp).toHaveLength(2); // one per bounced client contact, to the one agency staff contact
    expect(inApp.every((r) => r.contactId === staff)).toBe(true);
    const a1 = inApp.find((r) => r.clientId === IDS.clientA1)!;
    expect(a1).toMatchObject({ title: 'Emails to Owner@A1.example are bouncing', subjectType: 'contact', subjectId: owner });
    expect(a1.body).toBe("We stopped sending to Owner@A1.example (A1 HVAC) after a hard bounce.\nCheck the address in the client's delivery settings, then turn the contact back on.");
    expect(a1.dedupeKey).toContain(`contact_bounced:${owner}`);
    const email = rows.find((r) => r.channel === 'email' && r.clientId === IDS.clientA1)!;
    expect(email.payload).toMatchObject({ template: 'agency_notice', props: { notice: 'contact_bounced', actionLabel: 'Open inbox', clientName: 'A1 HVAC' } });
  });

  it('contact in another agency untouched', async () => {
    await handlePostmarkEvent(deps(), bounce(), NOW);
    expect(await activeOf(ownerB1)).toBe(true);
    expect((await notices()).some((r) => r.agencyId === IDS.agencyB)).toBe(false);
  });

  it('soft bounce ignored', async () => {
    expect(await handlePostmarkEvent(deps(), bounce({ Type: 'SoftBounce', TypeCode: 4096 }), NOW)).toBe('ignored');
    expect(await activeOf(owner)).toBe(true);
    expect(await notices()).toHaveLength(0);
  });

  it('unknown MessageID ignored', async () => {
    expect(await handlePostmarkEvent(deps(), bounce({ MessageID: 'not-ours' }), NOW)).toBe('ignored');
    expect(await activeOf(owner)).toBe(true);
    expect(await notices()).toHaveLength(0);
  });

  it('other record types and malformed events ignored', async () => {
    for (const e of [null, 'x', 42, {}, { RecordType: 'Delivery', MessageID: MSG, Recipient: 'owner@a1.example' }, bounce({ Email: 42 }), bounce({ MessageID: null })]) {
      expect(await handlePostmarkEvent(deps(), e, NOW)).toBe('ignored');
    }
    expect(await activeOf(owner)).toBe(true);
  });

  it('spam complaint deactivates', async () => {
    expect(await handlePostmarkEvent(deps(), { RecordType: 'SpamComplaint', Type: 'SpamComplaint', MessageID: MSG, Email: 'owner@a1.example' }, NOW)).toBe('deactivated');
    expect(await activeOf(owner)).toBe(false);
    const a1 = (await notices()).find((r) => r.channel === 'in_app' && r.clientId === IDS.clientA1)!;
    expect(a1.body.split('\n')[0]).toBe('We stopped sending to Owner@A1.example (A1 HVAC) after a spam complaint.');
  });

  it('retry creates one notice', async () => {
    await handlePostmarkEvent(deps(), bounce(), NOW);
    const first = await notices();
    expect(first.length).toBeGreaterThan(0);
    expect(await handlePostmarkEvent(deps(), bounce(), new Date(NOW.getTime() + 60_000))).toBe('deactivated');
    expect(await notices()).toHaveLength(first.length);
  });

  it('agency staff contact deactivated without a notice', async () => {
    expect(await handlePostmarkEvent(deps(), bounce({ Email: 'AM@a.example' }), NOW)).toBe('deactivated');
    expect(await activeOf(staff)).toBe(false);
    expect(await notices()).toHaveLength(0);
  });

  it('no delivery config deactivates only', async () => {
    expect(await handlePostmarkEvent(deps(null), bounce(), NOW)).toBe('deactivated');
    expect(await activeOf(owner)).toBe(false);
    expect(await notices()).toHaveLength(0);
  });
});
