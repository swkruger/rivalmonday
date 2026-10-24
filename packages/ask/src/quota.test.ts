import { type AccessContext, createAccessContext } from '@cs/core';
import { askMessage, askThread } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { client } from '@cs/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SYSTEM_BUSY_COPY } from '@cs/core';
import { ASK_COPY, beginTurn } from './quota';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const ctx = (role: AccessContext['role'], userId: string, scope: AccessContext['clientScope'] = [IDS.clientA1]) =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: scope, features: ['ask'] });
const owner = ctx('client_owner', 'u-owner');
const viewer = ctx('client_viewer', 'u-viewer');
const admin = ctx('agency_admin', 'u-admin', 'all');

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  for (const u of ['u-owner', 'u-viewer', 'u-admin', 'u-other']) {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${u}, ${u}, ${u + '@example.com'}, true)`);
  }
});

const setQuota = (n: number) => dbs.owner.update(client).set({ askMonthlyQuota: n }).where(eq(client.id, IDS.clientA1));
const counted = async () => (await dbs.owner.select().from(askMessage).where(and(eq(askMessage.clientId, IDS.clientA1), eq(askMessage.countsTowardQuota, true)))).length;
const q = (question = 'How is Acme doing?', extra: object = {}) => ({ clientId: IDS.clientA1, question, ...extra });

describe('beginTurn', () => {
  it('client role under quota inserts a counting user message', async () => {
    const r = await beginTurn(dbs.app, owner, q());
    expect(r.kind).toBe('ok');
    const [m] = await dbs.owner.select().from(askMessage);
    expect(m).toMatchObject({ role: 'user', content: 'How is Acme doing?', countsTowardQuota: true, userId: 'u-owner', agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'ok' });
    if (r.kind === 'ok') expect(m!.id).toBe(r.userMessageId);
    const [t] = await dbs.owner.select().from(askThread);
    expect(t).toMatchObject({ userId: 'u-owner', title: 'How is Acme doing?', clientId: IDS.clientA1 });
  });

  it('client role at quota returns quota with exact copy and no count', async () => {
    await setQuota(2);
    const first = await beginTurn(dbs.app, owner, q('one'));
    await beginTurn(dbs.app, viewer, q('two')); // quota is per client, across users
    expect(await counted()).toBe(2);
    const r = await beginTurn(dbs.app, owner, q('three', first.kind === 'ok' ? { threadId: first.threadId } : {}));
    expect(r.kind).toBe('quota');
    expect(await counted()).toBe(2);
    const rows = await dbs.owner.select().from(askMessage).where(eq(askMessage.threadId, r.threadId));
    const a = rows.find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({ content: ASK_COPY.quota, status: 'quota', countsTowardQuota: false });
    expect(a.content).toBe("You have reached this month's quota.");
    if (r.kind === 'quota') expect(a.id).toBe(r.messageId);
    expect(rows.find((m) => m.content === 'three')).toMatchObject({ role: 'user', countsTowardQuota: false });
  });

  it('agency user never counted nor stopped', async () => {
    await setQuota(0);
    for (let i = 0; i < 3; i++) expect((await beginTurn(dbs.app, admin, q(`q${i}`))).kind).toBe('ok');
    expect(await counted()).toBe(0);
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(3);
  });

  it('beginTurn race: two concurrent calls at quota-1 → one ok, one quota', async () => {
    await setQuota(2);
    await beginTurn(dbs.app, owner, q('seed'));
    const results = await Promise.all([beginTurn(dbs.app, owner, q('a')), beginTurn(dbs.app, viewer, q('b'))]);
    expect(results.map((r) => r.kind).sort()).toEqual(['ok', 'quota']);
    expect(await counted()).toBe(2);
  });

  it("previous month's questions not counted", async () => {
    await setQuota(1);
    await beginTurn(dbs.app, owner, q('old'));
    await dbs.owner.execute(sql`update ask_message set created_at = now() - interval '45 days'`);
    expect((await beginTurn(dbs.app, owner, q('new'))).kind).toBe('ok');
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15));
    // a clock in the next month sees this month's question as last month's
    expect((await beginTurn(dbs.app, owner, q('later'), prev)).kind).toBe('ok');
  });

  it('quota 0 stops immediately', async () => {
    await setQuota(0);
    const r = await beginTurn(dbs.app, owner, q());
    expect(r.kind).toBe('quota');
    expect(await counted()).toBe(0);
  });

  it('foreign threadId → not_found', async () => {
    const mine = await beginTurn(dbs.app, owner, q());
    await expect(beginTurn(dbs.app, viewer, q('x', { threadId: mine.threadId }))).rejects.toMatchObject({ code: 'not_found' });
    await expect(beginTurn(dbs.app, owner, q('x', { threadId: '00000000-0000-4000-8000-0000000000ff' }))).rejects.toMatchObject({ code: 'not_found' });
    expect(await dbs.owner.select().from(askThread)).toHaveLength(1);
  });

  it('beginTurn into a deleted thread is not_found and inserts nothing', async () => {
    const mine = await beginTurn(dbs.app, owner, q());
    await dbs.owner.update(askThread).set({ deletedAt: new Date() }).where(eq(askThread.id, mine.threadId));
    const before = await dbs.owner.select().from(askMessage);
    await expect(beginTurn(dbs.app, owner, q('again', { threadId: mine.threadId }))).rejects.toMatchObject({ code: 'not_found' });
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(before.length);
    const fresh = await beginTurn(dbs.app, owner, q('new question'));
    expect(fresh.kind).toBe('ok');
    expect(fresh.threadId).not.toBe(mine.threadId);
  });

  it('quota used is unchanged after a delete', async () => {
    await setQuota(2);
    const first = await beginTurn(dbs.app, owner, q('one'));
    await beginTurn(dbs.app, viewer, q('two'));
    expect(await counted()).toBe(2);
    await dbs.owner.update(askThread).set({ deletedAt: new Date() }).where(eq(askThread.id, first.threadId));
    expect(await counted()).toBe(2);
    expect((await beginTurn(dbs.app, owner, q('three'))).kind).toBe('quota');
    expect(await counted()).toBe(2);
  });

  it('guest → not_found', async () => {
    const guest = createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:abc', role: 'client_viewer', clientScope: [IDS.clientA1], features: ['ask'] });
    await expect(beginTurn(dbs.app, guest, q())).rejects.toMatchObject({ code: 'not_found' });
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });

  it('a plan without ask → not_found, for agency and client roles (7a2 defence in depth)', async () => {
    const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin', clientScope: 'all', features: [], planFeatures: ['mcp'] });
    const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'client_owner', clientScope: [IDS.clientA1], features: ['ask'], planFeatures: [] });
    for (const ctx of [admin, owner]) await expect(beginTurn(dbs.app, ctx, q())).rejects.toMatchObject({ code: 'not_found' });
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });

  it('client role without the ask feature → not_found; out-of-scope client → not_found', async () => {
    const noAsk = createAccessContext({ agencyId: IDS.agencyA, userId: 'u-owner', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
    await expect(beginTurn(dbs.app, noAsk, q())).rejects.toMatchObject({ code: 'not_found' });
    await expect(beginTurn(dbs.app, owner, { clientId: IDS.clientA2, question: 'x' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects empty and over-long questions', async () => {
    await expect(beginTurn(dbs.app, owner, q('   '))).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(beginTurn(dbs.app, owner, q('x'.repeat(2001)))).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('paused client: beginTurn stores refused C4, no quota count', async () => {
    const r = await beginTurn(dbs.app, owner, q('paused q'), new Date(), { pause: 'client' });
    expect(r.kind).toBe('paused');
    expect(await counted()).toBe(0);
    const rows = await dbs.owner.select().from(askMessage).where(eq(askMessage.threadId, r.threadId));
    expect(rows.find((m) => m.role === 'user')).toMatchObject({ content: 'paused q', countsTowardQuota: false });
    const a = rows.find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({ content: 'Ask is paused for the rest of this month. Your past answers are still here.', status: 'refused', countsTowardQuota: false });
    if (r.kind === 'paused') expect(a.id).toBe(r.messageId);
    expect(ASK_COPY.paused).toBe(a.content);
  });

  it('busy: C5 for a platform pause', async () => {
    const r = await beginTurn(dbs.app, owner, q('busy q'), new Date(), { pause: 'platform' });
    expect(r.kind).toBe('busy');
    const a = (await dbs.owner.select().from(askMessage).where(eq(askMessage.threadId, r.threadId))).find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({ content: SYSTEM_BUSY_COPY, status: 'refused' });
    expect(ASK_COPY.busy).toBe(SYSTEM_BUSY_COPY);
  });

  it('agency roles are refused too, and a pause beats the quota check', async () => {
    await setQuota(0);
    expect((await beginTurn(dbs.app, admin, q('a'), new Date(), { pause: 'client' })).kind).toBe('paused');
    expect((await beginTurn(dbs.app, owner, q('b'), new Date(), { pause: 'client' })).kind).toBe('paused');
    expect((await beginTurn(dbs.app, owner, q('c'), new Date(), { pause: null })).kind).toBe('quota');
  });
});
