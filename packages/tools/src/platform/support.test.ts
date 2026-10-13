import { type Db, supportSession } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { endSession, resolveSession, startSession } from './support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-13T10:00:00Z');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const deps = (platformAdmins: string[] = []) => ({ service: dbs.service, platformAdmins });
const rowOf = async (id: string) => (await dbs.owner.select().from(supportSession).where(eq(supportSession.id, id)))[0]!;

async function grant(userId: string, role: string) {
  await dbs.owner.execute(sql`insert into platform_admin (user_id, role, created_by) values (${userId}, ${role}, 'test')`);
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedUser(dbs.owner, 'other', 'other@example.com');
  await grant('op', 'staff');
});

describe('startSession / endSession', () => {
  it('opens a row expiring in 60 minutes', async () => {
    const s = await startSession(dbs.service, { platformUserId: 'op', agencyId: IDS.agencyA, reason: '  Checking setup  ', now: NOW });
    expect(s.expiresAt).toEqual(min(60));
    expect(s.reason).toBe('Checking setup');
    expect(s.agencyName).toBeTruthy();
    const r = await rowOf(s.id);
    expect(r.endedAt).toBeNull();
    expect(r.expiresAt).toEqual(min(60));
  });

  it('ends the previous open session as replaced', async () => {
    const a = await startSession(dbs.service, { platformUserId: 'op', agencyId: IDS.agencyA, reason: 'first reason', now: NOW });
    const b = await startSession(dbs.service, { platformUserId: 'op', agencyId: IDS.agencyB, reason: 'second reason', now: min(5) });
    const ra = await rowOf(a.id);
    expect(ra.endReason).toBe('replaced');
    expect(ra.endedAt).toEqual(min(5));
    expect((await rowOf(b.id)).endedAt).toBeNull();
  });

  it('throws not_found for an unknown agency', async () => {
    await expect(
      startSession(dbs.service, { platformUserId: 'op', agencyId: '00000000-0000-4000-8000-00000000ffff', reason: 'some reason' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('concurrent starts for one user all succeed, leaving exactly one open row', async () => {
    const all = await Promise.all(
      Array.from({ length: 2 }, (_, i) => startSession(dbs.service, { platformUserId: 'op', agencyId: IDS.agencyA, reason: `race ${i}`, now: NOW })),
    );
    expect(all).toHaveLength(2);
    const open = await dbs.owner.select().from(supportSession).where(and(eq(supportSession.platformUserId, 'op'), isNull(supportSession.endedAt)));
    expect(open).toHaveLength(1);
  });

  it('retries once after a unique violation and succeeds', async () => {
    let calls = 0;
    const flaky = {
      transaction: (fn: never) => {
        calls += 1;
        if (calls === 1) return Promise.reject(Object.assign(new Error('dup'), { cause: { code: '23505' } }));
        return dbs.service.transaction(fn);
      },
    } as unknown as Db;
    const s = await startSession(flaky, { platformUserId: 'op', agencyId: IDS.agencyA, reason: 'some reason', now: NOW });
    expect(calls).toBe(2);
    expect((await rowOf(s.id)).endedAt).toBeNull();
  });

  it('throws conflict when the retry also hits a unique violation', async () => {
    let calls = 0;
    const always = {
      transaction: () => {
        calls += 1;
        return Promise.reject(Object.assign(new Error('dup'), { code: '23505' }));
      },
    } as unknown as Db;
    await expect(startSession(always, { platformUserId: 'op', agencyId: IDS.agencyA, reason: 'some reason' })).rejects.toMatchObject({ code: 'conflict' });
    expect(calls).toBe(2);
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    const broken = {
      transaction: () => {
        calls += 1;
        return Promise.reject(new Error('boom'));
      },
    } as unknown as Db;
    await expect(startSession(broken, { platformUserId: 'op', agencyId: IDS.agencyA, reason: 'some reason' })).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });

  it('end is idempotent and keeps the first end_reason', async () => {
    const s = await startSession(dbs.service, { platformUserId: 'op', agencyId: IDS.agencyA, reason: 'some reason', now: NOW });
    await endSession(dbs.service, s.id, 'exit', min(1));
    await endSession(dbs.service, s.id, 'revoked', min(2));
    const r = await rowOf(s.id);
    expect(r.endReason).toBe('exit');
    expect(r.endedAt).toEqual(min(1));
  });
});

describe('resolveSession', () => {
  const open = () => startSession(dbs.service, { platformUserId: 'op', agencyId: IDS.agencyA, reason: 'some reason', now: NOW });

  it('missing row is invalid', async () => {
    expect(await resolveSession(deps(), { sessionId: '00000000-0000-4000-8000-00000000ffff', userId: 'op', now: NOW })).toEqual({ kind: 'invalid' });
  });
  it('non-uuid id is invalid without touching the database', async () => {
    const noDb = {
      select: () => {
        throw new Error('should not query');
      },
    } as unknown as Db;
    expect(await resolveSession({ service: noDb, platformAdmins: [] }, { sessionId: 'not-a-uuid', userId: 'op', now: NOW })).toEqual({ kind: 'invalid' });
  });
  it('ended session is invalid', async () => {
    const s = await open();
    await endSession(dbs.service, s.id, 'exit', min(1));
    expect(await resolveSession(deps(), { sessionId: s.id, userId: 'op', now: min(2) })).toEqual({ kind: 'invalid' });
  });
  it('another user is invalid', async () => {
    const s = await open();
    expect(await resolveSession(deps(), { sessionId: s.id, userId: 'other', now: min(2) })).toEqual({ kind: 'invalid' });
  });
  it('expired ends the row as expired', async () => {
    const s = await open();
    expect(await resolveSession(deps(), { sessionId: s.id, userId: 'op', now: min(60) })).toEqual({ kind: 'expired', agencyId: IDS.agencyA });
    const r = await rowOf(s.id);
    expect(r.endReason).toBe('expired');
    expect(r.endedAt).not.toBeNull();
  });
  it('revoked role ends the row as revoked', async () => {
    const s = await open();
    await dbs.owner.execute(sql`update platform_admin set revoked_at = now() where user_id = 'op'`);
    expect(await resolveSession(deps(), { sessionId: s.id, userId: 'op', now: min(2) })).toEqual({ kind: 'revoked' });
    expect((await rowOf(s.id)).endReason).toBe('revoked');
  });
  it('viewer role is revoked', async () => {
    const s = await open();
    await dbs.owner.execute(sql`update platform_admin set role = 'viewer' where user_id = 'op'`);
    expect(await resolveSession(deps(), { sessionId: s.id, userId: 'op', now: min(2) })).toEqual({ kind: 'revoked' });
    expect((await rowOf(s.id)).endReason).toBe('revoked');
  });
  it('endStale: false reports expired/revoked without ending the row', async () => {
    const s = await open();
    expect(await resolveSession(deps(), { sessionId: s.id, userId: 'op', now: min(60), endStale: false })).toEqual({ kind: 'expired', agencyId: IDS.agencyA });
    expect((await rowOf(s.id)).endedAt).toBeNull();
    await dbs.owner.execute(sql`update platform_admin set revoked_at = now() where user_id = 'op'`);
    expect(await resolveSession(deps(), { sessionId: s.id, userId: 'op', now: min(2), endStale: false })).toEqual({ kind: 'revoked' });
    expect((await rowOf(s.id)).endedAt).toBeNull();
  });
  it('env-listed owner is ok', async () => {
    const s = await open();
    await dbs.owner.execute(sql`delete from platform_admin where user_id = 'op'`);
    const r = await resolveSession(deps(['op@example.com']), { sessionId: s.id, userId: 'op', now: min(2) });
    expect(r.kind).toBe('ok');
  });
  it('staff is ok and returns the session with agency name', async () => {
    const s = await open();
    const r = await resolveSession(deps(), { sessionId: s.id, userId: 'op', now: min(2) });
    expect(r).toEqual({ kind: 'ok', session: s });
  });
});
