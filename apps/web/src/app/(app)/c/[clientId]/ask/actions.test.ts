import { ASK_COPY, type AskAction } from '@cs/ask';
import { type AccessContext, createAccessContext } from '@cs/core';
import { askMessage, askThread } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const EV1 = '11111111-1111-4111-8111-111111111111';
const m = vi.hoisted(() => ({
  ctx: null as unknown,
  kind: 'user' as string,
  runTool: null as unknown as Mock,
  revalidated: [] as string[],
  redirected: null as string | null,
}));

vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: m.kind }, ctx: m.ctx }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => void m.revalidated.push(p) }));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    m.redirected = p;
    throw new Error('NEXT_REDIRECT');
  },
}));

const { confirmAskAction, deleteAskThreadAction, saveAskRecommendation } = await import('./actions');

const ctxFor = (userId: string): AccessContext =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role: 'client_owner', clientScope: [IDS.clientA1], features: ['ask', 'dashboard'] });
const INPUT = { clientId: IDS.clientA1, title: 'Match the $69 tune-up', rationale: 'Acme cut its price to $69.', evidenceIds: [EV1], effort: 'L', impact: 'M' };

async function seedAction(userId = 'u1'): Promise<{ threadId: string; messageId: string }> {
  const [t] = await dbs.owner.insert(askThread).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, userId, title: 'Prices' }).returning();
  const action: AskAction = { tool: 'add_recommendation', input: INPUT, summary: 'Save recommendation: "Match the $69 tune-up"', state: 'proposed' };
  const [msg] = await dbs.owner
    .insert(askMessage)
    .values({ threadId: t!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId, role: 'action', content: action.summary, action })
    .returning();
  return { threadId: t!.id, messageId: msg!.id };
}

const messages = (threadId: string) => dbs.owner.select().from(askMessage).where(eq(askMessage.threadId, threadId)).orderBy(asc(askMessage.createdAt));
const actionOf = async (id: string) => (await dbs.owner.select().from(askMessage).where(eq(askMessage.id, id)))[0]!.action as AskAction;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'U1', 'u1@e.co', true), ('u2', 'U2', 'u2@e.co', true)`);
  m.ctx = ctxFor('u1');
  m.kind = 'user';
  m.revalidated = [];
  m.redirected = null;
  m.runTool = vi.fn(async () => ({ ok: true, data: { id: 'r1', url: '/x' } }));
});

describe('confirmAskAction', () => {
  it('confirm runs tool once', async () => {
    const { threadId, messageId } = await seedAction();
    await expect(confirmAskAction(messageId, 'confirm')).resolves.toEqual({ ok: true, data: { state: 'confirmed' } });
    expect(m.runTool).toHaveBeenCalledTimes(1);
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'add_recommendation', INPUT, { channel: 'ask' });
    expect((await actionOf(messageId)).state).toBe('confirmed');
    const rows = await messages(threadId);
    expect(rows.at(-1)).toMatchObject({ role: 'action', content: 'Saved.', userId: 'u1', agencyId: IDS.agencyA, clientId: IDS.clientA1, action: null });
    expect(m.revalidated).toContain(`/c/${IDS.clientA1}/ask/${threadId}`);
  });

  it('double confirm is a no-op', async () => {
    const { threadId, messageId } = await seedAction();
    await confirmAskAction(messageId, 'confirm');
    await expect(confirmAskAction(messageId, 'confirm')).resolves.toEqual({ ok: false, error: 'Not found' });
    await expect(confirmAskAction(messageId, 'cancel')).resolves.toEqual({ ok: false, error: 'Not found' });
    expect(m.runTool).toHaveBeenCalledTimes(1);
    expect((await messages(threadId)).filter((r) => r.content === 'Saved.')).toHaveLength(1);
    expect((await actionOf(messageId)).state).toBe('confirmed');
  });

  it('foreign message not_found', async () => {
    const { threadId, messageId } = await seedAction('u2');
    await expect(confirmAskAction(messageId, 'confirm')).resolves.toEqual({ ok: false, error: 'Not found' });
    await expect(confirmAskAction('not-a-uuid', 'confirm')).resolves.toEqual({ ok: false, error: 'Not found' });
    m.kind = 'guest';
    m.ctx = ctxFor('u2');
    await expect(confirmAskAction(messageId, 'confirm')).resolves.toEqual({ ok: false, error: 'Not found' });
    expect(m.runTool).not.toHaveBeenCalled();
    expect((await actionOf(messageId)).state).toBe('proposed');
    expect(await messages(threadId)).toHaveLength(1);
  });

  it('cancel writes Cancelled.', async () => {
    const { threadId, messageId } = await seedAction();
    await expect(confirmAskAction(messageId, 'cancel')).resolves.toEqual({ ok: true, data: { state: 'cancelled' } });
    expect(m.runTool).not.toHaveBeenCalled();
    expect((await actionOf(messageId)).state).toBe('cancelled');
    expect((await messages(threadId)).at(-1)).toMatchObject({ role: 'action', content: ASK_COPY.cancelled });
    expect(ASK_COPY.cancelled).toBe('Cancelled.');
  });

  it('failed tool sets failed', async () => {
    const { threadId, messageId } = await seedAction();
    m.runTool = vi.fn(async () => ({ ok: false, error: 'Not found' }));
    await expect(confirmAskAction(messageId, 'confirm')).resolves.toEqual({ ok: false, error: 'Not found' });
    expect(await actionOf(messageId)).toMatchObject({ state: 'failed', error: 'Not found' });
    expect((await messages(threadId)).map((r) => r.content)).not.toContain('Saved.');

    const second = await seedAction();
    m.runTool = vi.fn(async () => { throw new Error('db down'); });
    await expect(confirmAskAction(second.messageId, 'confirm')).resolves.toMatchObject({ ok: false });
    expect((await actionOf(second.messageId)).state).toBe('failed');
  });
});

describe('saveAskRecommendation', () => {
  it('runs add_recommendation on the ask channel', async () => {
    const input = { clientId: IDS.clientA1, title: 'Match the $69 tune-up', rationale: 'Acme cut its price to $69.', effort: 'L' as const, evidenceIds: [EV1] };
    await expect(saveAskRecommendation(input)).resolves.toEqual({ ok: true, data: { id: 'r1' } });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'add_recommendation', expect.objectContaining({ ...input, impact: 'M' }), { channel: 'ask' });
    expect(m.revalidated).toContain(`/c/${IDS.clientA1}/recommendations`);
  });

  it('rejects malformed input without calling the tool', async () => {
    const good = { clientId: IDS.clientA1, title: 'Match it', rationale: 'Acme cut its price.', effort: 'L' as const, evidenceIds: [EV1] };
    // add_recommendation's limits: title 3–120, rationale 10–1000, 1–10 evidence ids.
    for (const bad of [
      { ...good, title: 'ab' },
      { ...good, title: 'x'.repeat(121) },
      { ...good, rationale: 'too short' },
      { ...good, rationale: 'x'.repeat(1001) },
      { ...good, evidenceIds: [] },
      { ...good, evidenceIds: Array.from({ length: 11 }, () => EV1) },
    ]) await expect(saveAskRecommendation(bad)).resolves.toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
    await expect(saveAskRecommendation({ ...good, title: 'abc', rationale: 'x'.repeat(10), evidenceIds: Array.from({ length: 10 }, () => EV1) })).resolves.toMatchObject({ ok: true });
  });
});

describe('deleteAskThreadAction', () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const T = '22222222-2222-4222-8222-222222222222';

  it('runs delete_my_ask_thread and revalidates the Ask pages', async () => {
    await expect(deleteAskThreadAction({ ok: true }, fd({ clientId: IDS.clientA1, threadId: T }))).resolves.toEqual({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'delete_my_ask_thread', { threadId: T });
    expect(m.revalidated).toContain(`/c/${IDS.clientA1}/ask`);
    expect(m.redirected).toBeNull();
  });

  it('deleting the open thread goes back to a new question', async () => {
    await expect(deleteAskThreadAction({ ok: true }, fd({ clientId: IDS.clientA1, threadId: T, active: '1' }))).rejects.toThrow('NEXT_REDIRECT');
    expect(m.redirected).toBe(`/c/${IDS.clientA1}/ask`);
  });

  it('a refusal is "Not found"; guests never reach the tool', async () => {
    m.runTool = vi.fn(async () => ({ ok: false, error: 'Not found' }));
    await expect(deleteAskThreadAction({ ok: true }, fd({ clientId: IDS.clientA1, threadId: T, active: '1' }))).resolves.toEqual({ ok: false, error: 'Not found' });
    expect(m.redirected).toBeNull();
    m.kind = 'guest';
    m.runTool.mockClear();
    await expect(deleteAskThreadAction({ ok: true }, fd({ clientId: IDS.clientA1, threadId: T }))).resolves.toEqual({ ok: false, error: 'Not found' });
    expect(m.runTool).not.toHaveBeenCalled();
  });
});
