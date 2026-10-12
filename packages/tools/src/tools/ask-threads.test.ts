import { createAccessContext, type Feature, ToolError } from '@cs/core';
import { askMessage, askStarter, askThread, client } from '@cs/db';
import { IDS, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { GENERIC_STARTERS } from '../ask-tools';
import { allTools } from './all';
import { dbs, registry } from './workspace-fixtures';

const ASK_THREAD_TOOLS = ['list_my_ask_threads', 'get_my_ask_thread', 'delete_my_ask_thread', 'get_ask_starters'];

const user = (userId: string, features: Feature[] = ['ask'], role: 'client_owner' | 'agency_admin' = 'client_owner') =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: role === 'agency_admin' ? 'all' : [IDS.clientA1], features });
const me = user('u-me');
const other = user('u-other');
const guest = createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:c1', role: 'client_owner', clientScope: [IDS.clientA1], features: ['ask'] });

async function seedThread(userId: string, title: string, o: { clientId?: string; updatedAt?: Date } = {}): Promise<string> {
  const [t] = await dbs.owner
    .insert(askThread)
    .values({ agencyId: IDS.agencyA, clientId: o.clientId ?? IDS.clientA1, userId, title, ...(o.updatedAt ? { updatedAt: o.updatedAt } : {}) })
    .returning({ id: askThread.id });
  return t!.id;
}

async function seedMessage(threadId: string, userId: string, m: Partial<typeof askMessage.$inferInsert> & { role: 'user' | 'assistant' | 'action'; content: string }): Promise<string> {
  const [row] = await dbs.owner
    .insert(askMessage)
    .values({ threadId, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId, ...m })
    .returning({ id: askMessage.id });
  return row!.id;
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ToolError ? e.code : 'other';
  }
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  for (const u of ['u-me', 'u-other']) {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${u}, ${u}, ${u + '@example.com'}, true)`);
  }
});

describe('ask thread tools: channels', () => {
  it('are web-only (explicit literal) with the ask feature', () => {
    for (const name of ASK_THREAD_TOOLS) {
      const t = allTools.find((x) => x.name === name);
      expect(t, name).toBeTruthy();
      expect(t!.channels, name).toEqual(['web']);
      expect(t!.feature, name).toBe('ask');
    }
  });

  it('client role without the ask feature cannot see them', async () => {
    expect(await code(registry.invoke(user('u-me', ['dashboard']), 'list_my_ask_threads', { clientId: IDS.clientA1 }))).toBe('not_found');
  });

  it('guests are refused', async () => {
    const id = await seedThread('u-me', 'Mine');
    expect(await code(registry.invoke(guest, 'list_my_ask_threads', { clientId: IDS.clientA1 }))).toBe('not_found');
    expect(await code(registry.invoke(guest, 'get_my_ask_thread', { threadId: id }))).toBe('not_found');
    expect(await code(registry.invoke(guest, 'delete_my_ask_thread', { threadId: id }))).toBe('not_found');
    expect(await code(registry.invoke(guest, 'get_ask_starters', { clientId: IDS.clientA1 }))).toBe('not_found');
  });
});

describe('list_my_ask_threads', () => {
  it('list only own threads, newest first', async () => {
    const old = await seedThread('u-me', 'Older', { updatedAt: new Date('2026-10-01T00:00:00Z') });
    const recent = await seedThread('u-me', 'Recent', { updatedAt: new Date('2026-10-10T00:00:00Z') });
    await seedThread('u-other', 'Not mine');
    const out = (await registry.invoke(me, 'list_my_ask_threads', { clientId: IDS.clientA1 })) as { items: { id: string; title: string; updatedAt: string }[] };
    expect(out.items.map((i) => i.id)).toEqual([recent, old]);
    expect(out.items[0]).toEqual({ id: recent, title: 'Recent', updatedAt: '2026-10-10T00:00:00.000Z' });
  });

  it('an agency admin does not see a client user’s threads (e5)', async () => {
    await seedThread('u-me', 'Mine');
    const out = (await registry.invoke(user('u-other', [], 'agency_admin'), 'list_my_ask_threads', { clientId: IDS.clientA1 })) as { items: unknown[] };
    expect(out.items).toEqual([]);
  });

  it('out-of-scope client → not_found', async () => {
    expect(await code(registry.invoke(me, 'list_my_ask_threads', { clientId: IDS.clientA2 }))).toBe('not_found');
  });
});

describe('get_my_ask_thread', () => {
  it('returns the thread with its messages in order and no trace', async () => {
    const id = await seedThread('u-me', 'Prices');
    const action = { tool: 'add_recommendation', input: { title: 'x' }, summary: 'Save recommendation: "x"', state: 'proposed' };
    await seedMessage(id, 'u-me', { role: 'user', content: 'What changed?', createdAt: new Date('2026-10-10T10:00:00Z') });
    await seedMessage(id, 'u-me', {
      role: 'assistant', content: 'Acme cut prices [ev:00000000-0000-4000-8000-0000000000e1].', citations: ['ev:00000000-0000-4000-8000-0000000000e1'],
      action, trace: { model: 'm', steps: [] }, createdAt: new Date('2026-10-10T10:00:05Z'),
    });
    const out = (await registry.invoke(me, 'get_my_ask_thread', { threadId: id })) as {
      id: string; clientId: string; title: string; messages: Record<string, unknown>[];
    };
    expect(out.id).toBe(id);
    expect(out.clientId).toBe(IDS.clientA1);
    expect(out.title).toBe('Prices');
    expect(out.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(out.messages[1]).toMatchObject({ status: 'ok', citations: ['ev:00000000-0000-4000-8000-0000000000e1'], action: { tool: 'add_recommendation', summary: 'Save recommendation: "x"', state: 'proposed' } });
    expect(out.messages[0]!.action).toBeNull();
    for (const m of out.messages) expect(m).not.toHaveProperty('trace');
    expect(out.messages[1]!.createdAt).toBe('2026-10-10T10:00:05.000Z');
  });

  it('get_my_ask_thread foreign → not_found', async () => {
    const theirs = await seedThread('u-other', 'Theirs');
    expect(await code(registry.invoke(me, 'get_my_ask_thread', { threadId: theirs }))).toBe('not_found');
    expect(await code(registry.invoke(me, 'get_my_ask_thread', { threadId: '00000000-0000-4000-8000-0000000000ff' }))).toBe('not_found');
  });
});

describe('delete_my_ask_thread', () => {
  it('delete own only', async () => {
    const mine = await seedThread('u-me', 'Mine');
    await seedMessage(mine, 'u-me', { role: 'user', content: 'q' });
    const theirs = await seedThread('u-other', 'Theirs');
    expect(await code(registry.invoke(me, 'delete_my_ask_thread', { threadId: theirs }))).toBe('not_found');
    expect(await dbs.owner.select().from(askThread).where(eq(askThread.id, theirs))).toHaveLength(1);
    expect(await registry.invoke(me, 'delete_my_ask_thread', { threadId: mine })).toEqual({ id: mine });
    expect(await dbs.owner.select().from(askThread).where(eq(askThread.id, mine))).toHaveLength(0);
    expect(await dbs.owner.select().from(askMessage).where(eq(askMessage.threadId, mine))).toHaveLength(0);
    expect(await code(registry.invoke(me, 'delete_my_ask_thread', { threadId: mine }))).toBe('not_found');
  });
});

describe('get_ask_starters', () => {
  it('starters fallback: generic questions when the client has no row', async () => {
    const out = (await registry.invoke(me, 'get_ask_starters', { clientId: IDS.clientA1 })) as { questions: string[] };
    expect(out.questions).toEqual([...GENERIC_STARTERS]);
  });

  it('returns the stored questions and the review flag', async () => {
    const qs = ['Why did Acme cut its tune-up price?', 'Who is advertising most this week?', 'Did any rival add a new service?', 'How are our reviews trending?'];
    await dbs.owner.insert(askStarter).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, questions: qs });
    expect(await registry.invoke(me, 'get_ask_starters', { clientId: IDS.clientA1 })).toEqual({ questions: qs, reviewAllowed: true });
    await dbs.owner.update(client).set({ askReviewAllowed: false }).where(eq(client.id, IDS.clientA1));
    expect(await registry.invoke(me, 'get_ask_starters', { clientId: IDS.clientA1 })).toMatchObject({ reviewAllowed: false });
  });

  it('never exposes usage or quota numbers (e4)', async () => {
    const out = (await registry.invoke(me, 'get_ask_starters', { clientId: IDS.clientA1 })) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(['questions', 'reviewAllowed']);
  });

  it('out-of-scope client → not_found', async () => {
    expect(await code(registry.invoke(other, 'get_ask_starters', { clientId: IDS.clientA2 }))).toBe('not_found');
  });
});
