import { createAccessContext } from '@cs/core';
import { askMessage, askThread, auditLog, client, platformAdmin } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../test/fixtures';
import { getReviewableAskThread, isPlatformOperator, listReviewableAskThreads, normalizeAdminEmails, platformRole, requirePlatformOperator } from './platform';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'Op@Example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
});
const as = (userId: string, role: 'agency_admin' | 'client_viewer' = 'agency_admin') =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: role === 'agency_admin' ? 'all' : [IDS.clientA1], features: [] });

describe('platform operators (decision 2, Review Focus 2)', () => {
  it('re-exports the env list normaliser from @cs/core', () => {
    expect(normalizeAdminEmails(' Op@Example.com, ,bad, x@y.co ,op@example.com')).toEqual(['op@example.com', 'x@y.co']);
    expect(normalizeAdminEmails(undefined)).toEqual([]);
  });

  it('matches the signed-in user’s email case-insensitively; never guests or an empty list', async () => {
    const deps = { service: dbs.service, platformAdmins: ['op@example.com'] };
    expect(await isPlatformOperator(deps, as('op'))).toBe(true);
    expect(await isPlatformOperator(deps, as('admin'))).toBe(false);
    expect(await isPlatformOperator(deps, as('nobody'))).toBe(false);
    expect(await isPlatformOperator(deps, as('contact:00000000-0000-4000-8000-000000000001', 'client_viewer'))).toBe(false);
    expect(await isPlatformOperator({ ...deps, platformAdmins: [] }, as('op'))).toBe(false);
    expect(await isPlatformOperator({ service: dbs.service }, as('op'))).toBe(false);
  });

  it('requirePlatformOperator refuses non-operators with permission_denied', async () => {
    const deps = { service: dbs.service, platformAdmins: ['op@example.com'] };
    await expect(requirePlatformOperator(deps, as('op'))).resolves.toBe('owner');
    await expect(requirePlatformOperator(deps, as('admin'))).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('platformRole (8a d2: env bootstrap + platform_admin rows)', () => {
  const deps = { service: dbs.service, platformAdmins: ['op@example.com'] };
  const grant = (userId: string, role: 'owner' | 'staff' | 'viewer', revokedAt: Date | null = null) =>
    dbs.owner.insert(platformAdmin).values({ userId, role, createdBy: 'test', revokedAt });

  it('env-listed user is owner', async () => {
    expect(await platformRole(deps, as('op'))).toBe('owner');
  });

  it('an active table row gives its role', async () => {
    await grant('admin', 'staff');
    expect(await platformRole(deps, as('admin'))).toBe('staff');
    expect(await isPlatformOperator(deps, as('admin'))).toBe(true);
    expect(await isPlatformOperator({ service: dbs.service }, as('admin'))).toBe(true);
  });

  it('a revoked row resolves to null', async () => {
    await grant('admin', 'owner', new Date());
    expect(await platformRole(deps, as('admin'))).toBeNull();
    expect(await isPlatformOperator(deps, as('admin'))).toBe(false);
  });

  it('a guest (contact:…) never resolves', async () => {
    const guest = as('contact:00000000-0000-4000-8000-000000000001', 'client_viewer');
    expect(await platformRole(deps, guest)).toBeNull();
  });

  it('an unknown user resolves to null', async () => {
    expect(await platformRole(deps, as('nobody'))).toBeNull();
  });

  it('the env list wins over a viewer row (always owner)', async () => {
    await grant('op', 'viewer');
    expect(await platformRole(deps, as('op'))).toBe('owner');
  });

  it('requirePlatformOperator(min) ranks viewer < staff < owner', async () => {
    await grant('admin', 'staff');
    await expect(requirePlatformOperator(deps, as('admin'))).resolves.toBe('staff');
    await expect(requirePlatformOperator(deps, as('admin'), 'staff')).resolves.toBe('staff');
    await expect(requirePlatformOperator(deps, as('admin'), 'owner')).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(requirePlatformOperator(deps, as('op'), 'owner')).resolves.toBe('owner');
  });
});

describe('platform Ask review (6b e6)', () => {
  const deps = () => ({ service: dbs.service, platformAdmins: ['op@example.com'] });
  async function thread(clientId: string, title: string, msgs: { status?: 'ok' | 'quota' | 'refused' | 'error'; removed?: number }[] = []): Promise<string> {
    const [t] = await dbs.owner.insert(askThread).values({ agencyId: IDS.agencyA, clientId, userId: 'admin', title }).returning({ id: askThread.id });
    for (const m of msgs) {
      await dbs.owner.insert(askMessage).values({
        threadId: t!.id, agencyId: IDS.agencyA, clientId, userId: 'admin', role: 'assistant', content: 'answer', status: m.status ?? 'ok',
        trace: { model: 'm', steps: [], guard: 'ok', removedSentences: m.removed ?? 0, deadlineHit: false, costUsd: 0 },
      });
    }
    return t!.id;
  }

  it('non-operator rejected', async () => {
    const id = await thread(IDS.clientA1, 'T');
    await expect(listReviewableAskThreads(deps(), as('admin'), {})).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(getReviewableAskThread(deps(), as('admin'), id)).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it("disallowed client's threads absent from list and not_found by id", async () => {
    const ok = await thread(IDS.clientA1, 'Allowed');
    const hidden = await thread(IDS.clientA2, 'Hidden');
    await dbs.owner.update(client).set({ askReviewAllowed: false }).where(eq(client.id, IDS.clientA2));
    const list = await listReviewableAskThreads(deps(), as('op'), {});
    expect(list.items.map((i) => i.id)).toEqual([ok]);
    expect(list.items[0]).toMatchObject({ agencyName: 'Agency A', clientName: 'A1 HVAC' });
    await expect(getReviewableAskThread(deps(), as('op'), hidden)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getReviewableAskThread(deps(), as('op'), '00000000-0000-4000-8000-000000000999')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('view writes one audit row', async () => {
    const id = await thread(IDS.clientA1, 'T', [{}]);
    const t = await getReviewableAskThread(deps(), as('op'), id);
    expect(t.messages).toHaveLength(1);
    const rows = await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'platform_view_ask_thread'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: 'web', userId: 'op', outcome: 'ok' });
    await listReviewableAskThreads(deps(), as('op'), {});
    expect(await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'platform_view_ask_thread'))).toHaveLength(1);
  });

  it('flags computed from trace and status', async () => {
    await thread(IDS.clientA1, 'Flagged', [{ removed: 2 }, { removed: 1, status: 'error' }, { status: 'refused' }, { status: 'quota' }]);
    await thread(IDS.clientA1, 'Clean', [{}]);
    const list = await listReviewableAskThreads(deps(), as('op'), {});
    const by = Object.fromEntries(list.items.map((i) => [i.id, i.flags]));
    const flagged = list.items.find((i) => by[i.id]!.removed === 3)!;
    expect(flagged.flags).toEqual({ removed: 3, error: true, refused: true, quota: true });
    expect(list.items.find((i) => i.flags.removed === 0)!.flags).toEqual({ removed: 0, error: false, refused: false, quota: false });
    const paged = await listReviewableAskThreads(deps(), as('op'), { limit: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.nextCursor).toBeTruthy();
    const next = await listReviewableAskThreads(deps(), as('op'), { limit: 1, cursor: paged.nextCursor! });
    expect(next.items).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
  });
});
