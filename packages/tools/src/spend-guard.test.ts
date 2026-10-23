import { billingNotice, client, llmCall, platformAdmin, spendGuardEvent } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type PlatformSpendAlertPayload, runSpendGuard, type SpendGuardDeps } from './spend-guard';


const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-14T12:00:00Z');
let staff: { to: string; p: PlatformSpendAlertPayload }[] = [];
const deps = (over: Partial<SpendGuardDeps> = {}): SpendGuardDeps => ({
  service: dbs.service,
  appUrl: 'https://app.rm.test/',
  platformAdmins: ['env-owner@rm.test'],
  sendStaffEmail: async (to, p) => void staff.push({ to, p }),
  ...over,
});
const spend = (clientId: string, costUsd: number, createdAt = NOW) =>
  dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId, task: 't', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true, createdAt });
const events = (kind?: string) => dbs.owner.select().from(spendGuardEvent).then((r) => (kind ? r.filter((e) => e.kind === kind) : r));
const notices = () => dbs.owner.select().from(billingNotice);
const clientRow = async (id: string) => (await dbs.owner.select().from(client).where(eq(client.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  staff = [];
});

describe('runSpendGuard: client part', () => {
  it('reached once per month', async () => {
    await spend(IDS.clientA1, 16); // limit 15, threshold 19.5
    const a = await runSpendGuard(deps(), NOW);
    const b = await runSpendGuard(deps(), NOW);
    expect(a).toMatchObject({ reached: 1, paused: 0 });
    expect(b).toMatchObject({ reached: 0, paused: 0 });
    expect(await events('client_reached')).toHaveLength(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
    expect(await notices()).toHaveLength(0);
  });

  it('paused at 130 %: event, notice, staff email, spend_paused_at', async () => {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('po', 'po', 'Owner@rm.test', true)`);
    await dbs.owner.insert(platformAdmin).values({ userId: 'po', role: 'owner' });
    await spend(IDS.clientA1, 20);
    const out = await runSpendGuard(deps(), NOW);
    expect(out).toMatchObject({ reached: 1, paused: 1, lifted: 0, rolledOver: 0, spike: 'ok' });
    const [ev] = await events('client_paused');
    expect(ev).toMatchObject({ clientId: IDS.clientA1, agencyId: IDS.agencyA, month: '2026-10-01', actor: 'system' });
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toEqual(NOW);
    const [n] = await notices();
    expect(n).toMatchObject({ audience: 'agency', kind: 'client_spend_paused', clientId: IDS.clientA1, agencyId: IDS.agencyA, dedupeKey: `spend_paused:${IDS.clientA1}:2026-10` });
    expect(n!.params).toEqual({ clientName: 'A1 HVAC', until: 'November 1' });
    expect(staff.map((s) => s.to).sort()).toEqual(['env-owner@rm.test', 'owner@rm.test']);
    expect(staff[0]!.p).toMatchObject({
      kind: 'client_paused',
      title: 'A1 HVAC (Agency A) paused for spend',
      url: `https://app.rm.test/platform/agencies/${IDS.agencyA}`,
    });
    expect(staff[0]!.p.lines[0]).toBe('A1 HVAC used $20.00 of its $15.00 limit this month (pause at 130 %). Raise the limit on the agency page or it lifts on November 1.');
  });

  it('second run: no new event/notice/email', async () => {
    await spend(IDS.clientA1, 20);
    await runSpendGuard(deps(), NOW);
    staff = [];
    const out = await runSpendGuard(deps(), NOW);
    expect(out).toMatchObject({ reached: 0, paused: 0, lifted: 0 });
    expect(await events()).toHaveLength(2);
    expect(await notices()).toHaveLength(1);
    expect(staff).toHaveLength(0);
  });

  it('two concurrent runs: one event, one notice', async () => {
    await spend(IDS.clientA1, 20);
    const outs = await Promise.all([runSpendGuard(deps(), NOW), runSpendGuard(deps(), NOW)]);
    expect(await events('client_paused')).toHaveLength(1);
    expect(await events('client_reached')).toHaveLength(1);
    expect(await notices()).toHaveLength(1);
    expect(staff.length).toBe(1); // only the env owner
    expect(outs.reduce((a, o) => a + o.paused, 0)).toBe(1);
  });

  it('a failing staff email never fails the run or loses the pause', async () => {
    await spend(IDS.clientA1, 20);
    const out = await runSpendGuard(deps({ sendStaffEmail: async () => { throw new Error('smtp down'); } }), NOW);
    expect(out.paused).toBe(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).not.toBeNull();
  });

  it('rollover clears last month’s pause', async () => {
    await dbs.owner.update(client).set({ spendPausedAt: new Date('2026-09-20T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
    const out = await runSpendGuard(deps(), NOW);
    expect(out.rolledOver).toBe(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
    const [ev] = await events('client_unpaused');
    expect(ev).toMatchObject({ clientId: IDS.clientA1, agencyId: IDS.agencyA, note: 'month rollover', month: '2026-10-01' });
  });

  it('limit raised outside the tool → lifted next run', async () => {
    await spend(IDS.clientA1, 20);
    await runSpendGuard(deps(), NOW);
    await dbs.owner.update(client).set({ spendLimitUsd: 30 }).where(eq(client.id, IDS.clientA1));
    const out = await runSpendGuard(deps(), NOW);
    expect(out.lifted).toBe(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
    expect(await events('client_unpaused')).toMatchObject([{ note: 'under threshold', actor: 'system', limitUsd: 30 }]);
  });

  it('archived clients ignored, prospect guarded', async () => {
    await spend(IDS.clientA1, 20);
    await spend(IDS.clientA2, 20);
    await dbs.owner.update(client).set({ archivedAt: new Date('2026-10-01T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    const out = await runSpendGuard(deps(), NOW);
    expect(out.paused).toBe(1);
    expect((await events('client_paused')).map((e) => e.clientId)).toEqual([IDS.clientA2]);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
  });

  it('paused_at/paused_by unchanged', async () => {
    await spend(IDS.clientA1, 20);
    const before = await clientRow(IDS.clientA1);
    await runSpendGuard(deps(), NOW);
    const after = await clientRow(IDS.clientA1);
    expect([after.pausedAt, after.pausedBy, after.status]).toEqual([before.pausedAt, before.pausedBy, before.status]);
  });

  it('reports the current platform guard state as spike (Task 10 adds the step)', async () => {
    expect((await runSpendGuard(deps(), NOW)).spike).toBe('ok');
  });
});
