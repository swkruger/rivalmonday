import { contact, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listInbox, markAllRead, markRead, unreadCount } from './inbox';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let mine = '';
let theirs = '';

async function note(contactId: string, n: number, channel = 'in_app') {
  await dbs.service.insert(notification).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, contactId, channel, kind: 'alert', subjectType: 'alert', subjectId: IDS.clientA1,
    dedupeKey: `k${n}:${contactId}:${channel}`, title: `T${n}`, body: 'b', status: 'sent', createdAt: new Date(Date.UTC(2026, 9, n)),
  });
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [a] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'me@e.co', userId: 'u1' }).returning();
  const [b] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'you@e.co', userId: 'u2' }).returning();
  mine = a!.id;
  theirs = b!.id;
  await note(mine, 1);
  await note(mine, 2);
  await note(mine, 3, 'email');
  await note(theirs, 4);
});

describe('inbox', () => {
  it('lists only the owner’s in-app notifications, newest first', async () => {
    expect((await listInbox(dbs.service, { userId: 'u1' })).map((i) => i.title)).toEqual(['T2', 'T1']);
    expect((await listInbox(dbs.service, { contactId: theirs })).map((i) => i.title)).toEqual(['T4']);
    expect(await unreadCount(dbs.service, { userId: 'u1' })).toBe(2);
  });

  it('marks one or all read, never another person’s', async () => {
    const [first] = await listInbox(dbs.service, { userId: 'u1' });
    const [other] = await listInbox(dbs.service, { userId: 'u2' });
    await markRead(dbs.service, { userId: 'u1' }, other!.id);
    expect(await unreadCount(dbs.service, { userId: 'u2' })).toBe(1);
    await markRead(dbs.service, { userId: 'u1' }, first!.id);
    expect(await unreadCount(dbs.service, { userId: 'u1' })).toBe(1);
    expect(await markAllRead(dbs.service, { userId: 'u1' })).toBe(1);
    expect(await listInbox(dbs.service, { userId: 'u1' }, { unreadOnly: true })).toEqual([]);
  });
});
