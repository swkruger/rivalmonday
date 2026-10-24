import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { askMessage, askStarter, askThread, client } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

type Role = 'agency_admin' | 'account_manager' | 'client_owner';
const scopeFor = (agencyId: string, userId: string, role: Role, clientScope: 'all' | string[] = 'all') => ({
  agencyId,
  clientScope,
  userId,
  role,
});

async function seedUser(id: string) {
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${id}, ${id + '@example.com'}, true)`);
}

const T1 = '00000000-0000-4000-8000-0000000000c1';
const T2 = '00000000-0000-4000-8000-0000000000c2';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  for (const u of ['u1', 'u2', 'admin', 'admin-b']) await seedUser(u);
  await dbs.service.insert(askThread).values([
    { id: T1, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId: 'u1', title: 'First' },
    { id: T2, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId: 'u2', title: 'Second' },
  ]);
  await dbs.service.insert(askMessage).values([
    { threadId: T1, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId: 'u1', role: 'user', content: 'hi' },
    { threadId: T2, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId: 'u2', role: 'user', content: 'yo' },
  ]);
  await dbs.service.insert(askStarter).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, questions: ['q1'] });
});

const read = (scope: ReturnType<typeof scopeFor>) =>
  withTenant(dbs.app, scope, async (tx) => ({
    threads: (await tx.select({ id: askThread.id }).from(askThread)).map((r) => r.id).sort(),
    messages: (await tx.select({ id: askMessage.id }).from(askMessage)).length,
  }));

describe('ask RLS', () => {
  it('author reads own thread and messages', async () => {
    const r = await read(scopeFor(IDS.agencyA, 'u1', 'client_owner'));
    expect(r.threads).toEqual([T1]);
    expect(r.messages).toBe(1);
  });

  it('another user in the same agency sees 0 rows', async () => {
    const r = await read(scopeFor(IDS.agencyA, 'other', 'client_owner'));
    expect(r).toEqual({ threads: [], messages: 0 });
  });

  it("agency_admin sees 0 rows of a client user's thread", async () => {
    const r = await read(scopeFor(IDS.agencyA, 'admin', 'agency_admin'));
    expect(r).toEqual({ threads: [], messages: 0 });
  });

  it('other agency sees 0 rows', async () => {
    const r = await read(scopeFor(IDS.agencyB, 'u1', 'client_owner'));
    expect(r).toEqual({ threads: [], messages: 0 });
  });

  it('user who lost client visibility sees 0 rows', async () => {
    const r = await read(scopeFor(IDS.agencyA, 'u1', 'client_owner', [IDS.clientA2]));
    expect(r).toEqual({ threads: [], messages: 0 });
  });

  it('app_user cannot UPDATE ask_message.content', async () => {
    const scope = scopeFor(IDS.agencyA, 'u1', 'client_owner');
    const msg = await withTenant(dbs.app, scope, (tx) => tx.select({ id: askMessage.id }).from(askMessage));
    const err = await errorText(
      withTenant(dbs.app, scope, (tx) => tx.update(askMessage).set({ content: 'x' }).where(eq(askMessage.id, msg[0]!.id))),
    );
    expect(err).toMatch(/permission denied/);
  });

  it("message with another user's thread_id is rejected", async () => {
    const err = await errorText(
      dbs.service.insert(askMessage).values({ threadId: T1, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId: 'u2', role: 'user', content: 'x' }),
    );
    expect(err).toMatch(/foreign key/);
  });

  it('ask_starter readable in scope, not writable by app_user', async () => {
    const scope = scopeFor(IDS.agencyA, 'u1', 'client_owner');
    expect(await withTenant(dbs.app, scope, (tx) => tx.select().from(askStarter))).toHaveLength(1);
    const out = await withTenant(dbs.app, scopeFor(IDS.agencyA, 'u1', 'client_owner', [IDS.clientA2]), (tx) => tx.select().from(askStarter));
    expect(out).toHaveLength(0);
    const err = await errorText(
      withTenant(dbs.app, scope, (tx) => tx.insert(askStarter).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, questions: ['x'] })),
    );
    expect(err).toMatch(/permission denied/);
  });

  it('client defaults: quota 100, review allowed', async () => {
    const [c] = await dbs.owner.select({ q: client.askMonthlyQuota, r: client.askReviewAllowed }).from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toEqual({ q: 100, r: true });
  });

  describe('soft delete (deleted_at)', () => {
    const own = scopeFor(IDS.agencyA, 'u1', 'client_owner');

    it('owner can set deleted_at on own thread', async () => {
      const rows = await withTenant(dbs.app, own, (tx) =>
        tx.execute(sql`update ask_thread set deleted_at = now() where id = ${T1} returning id`),
      );
      expect(rows.length).toBe(1);
      const [r] = await dbs.owner.execute(sql`select deleted_at from ask_thread where id = ${T1}`);
      expect(r!.deleted_at).not.toBeNull();
    });

    it("app_user cannot update another user's deleted_at", async () => {
      const rows = await withTenant(dbs.app, own, (tx) =>
        tx.execute(sql`update ask_thread set deleted_at = now() where id = ${T2} returning id`),
      );
      expect(rows.length).toBe(0);
    });

    it('app_user cannot update client_id', async () => {
      const err = await errorText(
        withTenant(dbs.app, own, (tx) => tx.execute(sql`update ask_thread set client_id = client_id where id = ${T1}`)),
      );
      expect(err).toMatch(/permission denied/);
    });

    it('ask_thread_user_live_idx exists and is partial', async () => {
      const rows = await dbs.owner.execute(sql`select indexdef from pg_indexes where indexname = 'ask_thread_user_live_idx'`);
      expect(rows.length).toBe(1);
      expect(String(rows[0]!.indexdef)).toContain('WHERE (deleted_at IS NULL)');
    });
  });
});
