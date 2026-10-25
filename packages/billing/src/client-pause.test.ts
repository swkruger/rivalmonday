import { ToolError } from '@cs/core';
import { agency, agencyWebhook, client, notification } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WITHDRAWN_NOTIFICATION_ERROR, liftAutoPause, pauseClient, resumeClient } from './client-pause';
import { assertCanActivateClient } from './access';
import { AGENCY, addClients, resetBilling, setBilling } from './test-util';

vi.mock('./access', async (o) => {
  const m = await o<typeof import('./access')>();
  return { ...m, assertCanActivateClient: vi.fn(m.assertCanActivateClient) };
});

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner); // agency A: 2 active clients, 3 included seats
});

const row = async (id: string = IDS.clientA1) => (await dbs.owner.select().from(client).where(eq(client.id, id)))[0]!;
const pause = (id: string = IDS.clientA1, by: 'agency' | 'auto' = 'agency') => dbs.service.transaction((tx) => pauseClient(tx, id, 'user-1', by));
const resume = (id: string = IDS.clientA1, role?: string) => dbs.service.transaction((tx) => resumeClient(tx, id, 'user-1', { role }));

describe('pauseClient', () => {
  it('sets paused_at/paused_by (user id for agency, "auto" for auto)', async () => {
    expect(await pause()).toBe(true);
    const c = await row();
    expect(c.pausedAt).toBeInstanceOf(Date);
    expect(c.pausedBy).toBe('user-1');
    expect(await pause(IDS.clientA2, 'auto')).toBe(true);
    expect((await row(IDS.clientA2)).pausedBy).toBe('auto');
  });

  it('is an idempotent no-op on an already paused client (keeps the original pause)', async () => {
    await pause();
    const first = (await row()).pausedAt;
    expect(await pause(IDS.clientA1, 'auto')).toBe(false);
    const c = await row();
    expect(c.pausedAt).toEqual(first);
    expect(c.pausedBy).toBe('user-1');
  });

  it('does not pause a non-active client', async () => {
    const [p] = await addClients(dbs.owner, 1, 'prospect');
    expect(await pause(p)).toBe(false);
    expect((await row(p)).pausedAt).toBeNull();
  });
});

describe('resumeClient', () => {
  it('resumeClient refuses on hold', async () => {
    await pause();
    await dbs.owner.update(agency).set({ suspendedAt: new Date(), suspendedReason: 'unpaid invoice', suspendedBy: 'staff-1' }).where(eq(agency.id, AGENCY));
    await expect(resume()).rejects.toMatchObject({ code: 'service_paused' });
    expect((await row()).pausedAt).not.toBeNull();
  });

  it('clears paused_at/paused_by', async () => {
    await pause();
    expect(await resume()).toBe(true);
    const c = await row();
    expect(c.pausedAt).toBeNull();
    expect(c.pausedBy).toBeNull();
  });

  it('is a no-op on a client that is not paused', async () => {
    expect(await resume()).toBe(false);
  });

  it('A3: refuses with billing_seat_limit when resuming would exceed the seat cap (pause -> add -> resume)', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await pause();
    await addClients(dbs.owner, 2); // active: A2 + 2 = 3 = cap
    const e = await resume().then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(ToolError);
    expect((e as ToolError).code).toBe('billing_seat_limit');
    expect((await row()).pausedAt).not.toBeNull();
  });

  it('A3: allows resume while under the cap', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await pause();
    expect(await resume()).toBe(true);
  });

  it('R5: withdraws pending notifications, leaves sending/sent alone and other clients untouched', async () => {
    const [w] = await dbs.owner.insert(agencyWebhook).values({ agencyId: AGENCY, kind: 'slack', url: 'https://hooks.example/x', createdBy: 'test' }).returning({ id: agencyWebhook.id });
    const mk = (clientId: string, status: string, key: string) =>
      dbs.owner.insert(notification).values({
        agencyId: AGENCY, clientId, webhookId: w!.id, channel: 'slack', kind: 'alert', subjectType: 'alert', subjectId: clientId, dedupeKey: key, title: 't', body: 'b', status,
      });
    await pause();
    await mk(IDS.clientA1, 'pending', 'p1');
    await mk(IDS.clientA1, 'sending', 's1');
    await mk(IDS.clientA1, 'sent', 's2');
    await mk(IDS.clientA2, 'pending', 'other');
    await resume();
    const all = await dbs.owner.select().from(notification);
    const by = (k: string) => all.find((n) => n.dedupeKey === k)!;
    expect(by('p1').status).toBe('failed');
    expect(by('p1').error).toBe(WITHDRAWN_NOTIFICATION_ERROR);
    expect(by('s1').status).toBe('sending');
    expect(by('s2').status).toBe('sent');
    expect(by('other').status).toBe('pending');
  });
});

describe('liftAutoPause (7b2 M3)', () => {
  const lift = (id: string = IDS.clientA1) => dbs.service.transaction((tx) => liftAutoPause(tx, id, 'job'));

  it('liftAutoPause lifts only paused_by auto', async () => {
    expect(await lift()).toBe('not_paused'); // not paused at all
    await pause(IDS.clientA1, 'agency');
    expect(await lift()).toBe('not_paused');
    expect((await row()).pausedAt).not.toBeNull();
    await pause(IDS.clientA2, 'auto');
    expect(await lift(IDS.clientA2)).toBe('lifted');
    expect(await row(IDS.clientA2)).toMatchObject({ pausedAt: null, pausedBy: null });
  });

  it("seat-cap refusal returns 'refused' and keeps the outer transaction usable", async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await pause(IDS.clientA1, 'auto');
    await addClients(dbs.owner, 2); // A2 + 2 = cap
    const out = await dbs.service.transaction(async (tx) => {
      const r = await liftAutoPause(tx, IDS.clientA1, 'job');
      const [c] = await tx.select({ id: client.id }).from(client).where(eq(client.id, IDS.clientA1)); // would throw "transaction aborted" without the savepoint
      return { r, c };
    });
    expect(out.r).toBe('refused');
    expect(out.c?.id).toBe(IDS.clientA1);
    expect((await row()).pausedAt).not.toBeNull();
  });

  it("liftAutoPause on a held agency returns 'refused'", async () => {
    await pause(IDS.clientA1, 'auto');
    await dbs.owner.update(agency).set({ suspendedAt: new Date(), suspendedReason: 'unpaid invoice', suspendedBy: 'staff-1' }).where(eq(agency.id, AGENCY));
    expect(await lift()).toBe('refused');
    expect((await row()).pausedAt).not.toBeNull();
  });

  it('rethrows unexpected errors instead of reporting refused, and the client stays paused', async () => {
    await pause(IDS.clientA1, 'auto');
    vi.mocked(assertCanActivateClient).mockRejectedValueOnce(new Error('db exploded'));
    await expect(lift()).rejects.toThrow('db exploded');
    expect((await row()).pausedAt).not.toBeNull();
  });
});
