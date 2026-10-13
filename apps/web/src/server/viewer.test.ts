import { FEATURES } from '@cs/core';
import { contact, membership, supportSession } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { startSession } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAuthUsers, truncateAuth } from '../../test/auth-fixtures';
import { signGuest } from './guest';
import { signSupportCookie } from './support-cookie';
import { resolveSupportViewer, resolveViewer } from './viewer';

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

describe('resolveSupportViewer', () => {
  const SECRET = 's'.repeat(40);
  const OPS = ['p@e.co'];
  const MIN = (n: number) => new Date(NOW.getTime() + n * 60_000);
  const open = () => startSession(dbs.service, { platformUserId: 'u1', agencyId: IDS.agencyB, reason: 'Checking setup', now: NOW });
  const resolve = (o: { cookie?: string; admins?: string[]; now?: Date; who?: typeof session } = {}) =>
    resolveSupportViewer({ service: dbs.service, platformAdmins: o.admins ?? OPS, session: o.who ?? session, supportCookie: o.cookie, secret: SECRET, now: o.now ?? MIN(5) });

  it('returns null without a cookie', async () => {
    expect(await resolve()).toBeNull();
  });

  it('builds a support viewer with a synthetic agency_admin context, even for a member-less operator', async () => {
    const s = await open();
    const v = await resolve({ cookie: signSupportCookie(s.id, SECRET) });
    expect(v).toMatchObject({ kind: 'support', userId: 'u1', email: 'p@e.co', name: 'Pat', session: { id: s.id, agencyId: IDS.agencyB, reason: 'Checking setup' } });
    if (!v || v.kind !== 'support') throw new Error('expected a viewer');
    expect(v.ctx).toMatchObject({ agencyId: IDS.agencyB, userId: 'u1', role: 'agency_admin', clientScope: 'all', support: { sessionId: s.id, platformUserId: 'u1' } });
    expect([...v.ctx.features].sort()).toEqual([...FEATURES].sort());
    expect(await dbs.service.select().from(membership)).toHaveLength(0);
  });

  it('does not leak the operator’s own membership into the support context', async () => {
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA1, createdBy: 't' });
    const s = await open();
    const v = await resolve({ cookie: signSupportCookie(s.id, SECRET) });
    expect(v?.kind === 'support' && v.ctx).toMatchObject({ agencyId: IDS.agencyB, role: 'agency_admin', clientScope: 'all' });
    expect(v).not.toHaveProperty('membership');
  });

  it('a tampered cookie ends', async () => {
    const s = await open();
    expect(await resolve({ cookie: signSupportCookie(s.id, 'x'.repeat(40)) })).toEqual({ kind: 'end', sessionId: null });
  });

  it('an expired session ends, leaving the row open for /support/end to end (render never writes)', async () => {
    const s = await open();
    expect(await resolve({ cookie: signSupportCookie(s.id, SECRET), now: MIN(61) })).toEqual({ kind: 'end', sessionId: s.id });
    const [row] = await dbs.service.select().from(supportSession).where(eq(supportSession.id, s.id));
    expect(row?.endedAt).toBeNull();
  });

  it('a revoked operator ends, leaving the row open for /support/end to end', async () => {
    const s = await open();
    expect(await resolve({ cookie: signSupportCookie(s.id, SECRET), admins: [] })).toEqual({ kind: 'end', sessionId: s.id });
    const [row] = await dbs.service.select().from(supportSession).where(eq(supportSession.id, s.id));
    expect(row?.endedAt).toBeNull();
  });

  it('a valid cookie for another user’s session ends without touching the row', async () => {
    await seedAuthUsers(dbs.owner, { id: 'u2', email: 'q@e.co', name: 'Quinn' });
    const s = await open();
    expect(await resolve({ cookie: signSupportCookie(s.id, SECRET), who: { userId: 'u2', email: 'q@e.co', name: 'Quinn' }, admins: ['p@e.co', 'q@e.co'] })).toEqual({ kind: 'end', sessionId: s.id });
    const [row] = await dbs.service.select().from(supportSession).where(eq(supportSession.id, s.id));
    expect(row?.endedAt).toBeNull();
  });
});
