import { contact, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAuthUsers, truncateAuth } from '../../test/auth-fixtures';
import { signGuest } from './guest';
import { resolveViewer } from './viewer';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const S = ['k'.repeat(40)];
const NOW = new Date('2026-10-05T12:00:00Z');
const session = { userId: 'u1', email: 'p@e.co', name: 'Pat' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedAuthUsers(dbs.owner, { id: 'u1', email: 'p@e.co', name: 'Pat' });
});

describe('resolveViewer', () => {
  it('returns null with no session and no guest cookie', async () => {
    expect(await resolveViewer({ service: dbs.service, session: null, linkSecrets: S, now: NOW })).toBeNull();
  });

  it('returns member-less for a signed-in user with no memberships', async () => {
    expect(await resolveViewer({ service: dbs.service, session, linkSecrets: S, now: NOW })).toMatchObject({ kind: 'member-less' });
  });

  it('builds the context of the cookie membership, else the oldest', async () => {
    const [a] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't', createdAt: new Date('2026-10-01T00:00:00Z') }).returning();
    const [b] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyB, role: 'client_owner', clientId: IDS.clientB1, createdBy: 't' }).returning();
    const first = await resolveViewer({ service: dbs.service, session, linkSecrets: S, now: NOW });
    expect(first).toMatchObject({ kind: 'user', membership: { id: a!.id } });
    const second = await resolveViewer({ service: dbs.service, session, membershipCookie: b!.id, linkSecrets: S, now: NOW });
    expect(second?.kind === 'user' && second.ctx.clientScope).toEqual([IDS.clientB1]);
  });

  it('prefers a signed-in user over a guest cookie, and stops honouring a guest cookie once the contact is deactivated (Review Focus 3)', async () => {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'g@e.co' }).returning();
    const cookie = signGuest(S[0]!, { contactId: c!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1 }, NOW);
    expect(await resolveViewer({ service: dbs.service, session: null, guestCookie: cookie, linkSecrets: S, now: NOW })).toMatchObject({ kind: 'guest', contactId: c!.id });
    expect(await resolveViewer({ service: dbs.service, session, guestCookie: cookie, linkSecrets: S, now: NOW })).toMatchObject({ kind: 'member-less' });
    await dbs.service.update(contact).set({ active: false });
    expect(await resolveViewer({ service: dbs.service, session: null, guestCookie: cookie, linkSecrets: S, now: NOW })).toBeNull();
  });

  it('uses a membership that covers the client in the path when the cookie’s one does not (decision 16)', async () => {
    const [own] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, createdBy: 't', createdAt: new Date('2026-10-01T00:00:00Z') }).returning();
    const [adminB] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyB, role: 'agency_admin', createdBy: 't' }).returning();
    const forB1 = await resolveViewer({ service: dbs.service, session, membershipCookie: own!.id, clientHint: IDS.clientB1, linkSecrets: S, now: NOW });
    expect(forB1).toMatchObject({ kind: 'user', membership: { id: adminB!.id } });
    const forA1 = await resolveViewer({ service: dbs.service, session, membershipCookie: adminB!.id, clientHint: IDS.clientA1, linkSecrets: S, now: NOW });
    expect(forA1).toMatchObject({ kind: 'user', membership: { id: own!.id } });
    const uncovered = await resolveViewer({ service: dbs.service, session, membershipCookie: own!.id, clientHint: IDS.clientA2, linkSecrets: S, now: NOW });
    expect(uncovered).toMatchObject({ kind: 'user', membership: { id: own!.id } });
    const bogus = await resolveViewer({ service: dbs.service, session, membershipCookie: own!.id, clientHint: 'not-a-uuid', linkSecrets: S, now: NOW });
    expect(bogus).toMatchObject({ kind: 'user', membership: { id: own!.id } });
  });
});
