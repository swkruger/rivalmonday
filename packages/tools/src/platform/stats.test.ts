import { agency, agencyDailyStat, alert, askMessage, askThread, auditLog, brief, changeEvent, client, llmCall, membership, prospectReport, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { computeAgencyDay, detectStatSources, runDailyStats, upsertDailyStats } from './stats';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-13T05:00:00Z');
const Y = '2026-10-12';
const A3 = '00000000-0000-4000-8000-0000000000a3';
const t = (iso: string) => new Date(iso);
const live = { reconstructOnly: false, hasAsk: true, hasMcp: true };

async function session(userId: string, at: string) {
  await dbs.owner.execute(sql`insert into auth.session (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
    values (${`s-${userId}-${at}`}, ${'2027-01-01T00:00:00Z'}::timestamptz, ${`tok-${userId}-${at}`}, ${at}::timestamptz, ${at}::timestamptz, ${userId})`);
}

async function rowsOf(agencyId: string) {
  return dbs.owner.select().from(agencyDailyStat).where(eq(agencyDailyStat.agencyId, agencyId)).orderBy(asc(agencyDailyStat.day));
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ createdAt: t('2026-09-01T00:00:00Z') }).where(eq(agency.id, IDS.agencyA));
  await dbs.owner.update(agency).set({ createdAt: t('2026-10-10T12:00:00Z') }).where(eq(agency.id, IDS.agencyB));
  await dbs.owner.update(client).set({ createdAt: t('2026-09-02T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.update(client).set({ createdAt: t('2026-09-03T00:00:00Z'), status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  await dbs.owner.update(client).set({ createdAt: t('2026-10-10T12:00:00Z') }).where(eq(client.id, IDS.clientB1));
  // Active, but created after Y ends: not counted for Y.
  await dbs.owner.insert(client).values({ id: A3, agencyId: IDS.agencyA, name: 'A3 Late', verticalId: 'dental', createdAt: t('2026-10-13T01:00:00Z') });
  for (const u of ['u1', 'u2', 'u3', 'u4', 'u5']) await seedUser(dbs.owner, u, `${u}@example.com`);
  const m = { createdBy: 'test', createdAt: t('2026-09-05T00:00:00Z') };
  await dbs.owner.insert(membership).values([
    { ...m, userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin' },
    { ...m, userId: 'u2', agencyId: IDS.agencyA, role: 'account_manager' },
    // One client user with two memberships counts once.
    { ...m, userId: 'u3', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1 },
    { ...m, userId: 'u3', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA2 },
    { ...m, userId: 'u4', agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA1 },
    { ...m, userId: 'u5', agencyId: IDS.agencyB, role: 'agency_admin', createdAt: t('2026-10-10T12:00:00Z') },
  ]);
});

async function seedActivity() {
  await session('u1', '2026-10-12T10:00:00Z'); // in window, latest before Y ends
  await session('u2', '2026-10-06T00:00:00Z'); // first instant of [Y-6, Y+1)
  await session('u3', '2026-10-05T23:59:00Z'); // before the window (still counts for last activity)
  await session('u4', '2026-10-13T01:00:00Z'); // after Y ends
  await session('u5', '2026-10-12T11:00:00Z'); // other agency

  const b = { agencyId: IDS.agencyA, periodStart: t('2026-10-05T00:00:00Z'), periodEnd: t('2026-10-12T00:00:00Z') };
  await dbs.owner.insert(brief).values([
    { ...b, clientId: IDS.clientA1, deliveryDate: '2026-10-12', status: 'sent', sentAt: t('2026-10-12T08:00:00Z') },
    { ...b, clientId: IDS.clientA2, deliveryDate: '2026-10-12', status: 'sent', sentAt: t('2026-10-11T08:00:00Z') },
    { ...b, clientId: IDS.clientA1, deliveryDate: '2026-10-19', status: 'approved' },
  ]);

  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: NOW }).returning();
  const a = { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e!.id, score: 80, headline: 'h', mode: 'direct' };
  await dbs.owner.insert(alert).values([
    { ...a, status: 'delivered', deliveredAt: t('2026-10-12T09:00:00Z') },
    { ...a, status: 'delivered', deliveredAt: t('2026-10-11T09:00:00Z') },
    { ...a, status: 'withdrawn' },
  ]);

  const p = { agencyId: IDS.agencyA, clientId: IDS.clientA2 };
  await dbs.owner.insert(prospectReport).values([
    { ...p, status: 'ready', createdAt: t('2026-10-12T07:00:00Z'), finishedAt: t('2026-10-12T07:05:00Z') },
    { ...p, status: 'failed', createdAt: t('2026-10-12T07:00:00Z'), finishedAt: t('2026-10-12T07:05:00Z') },
    { ...p, status: 'ready', createdAt: t('2026-10-11T07:00:00Z'), finishedAt: t('2026-10-11T07:05:00Z') },
  ]);

  const [th] = await dbs.owner.insert(askThread).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, userId: 'u3', title: 'q' }).returning();
  const q = { threadId: th!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId: 'u3', content: 'x' };
  await dbs.owner.insert(askMessage).values([
    { ...q, role: 'user', createdAt: t('2026-10-12T10:00:00Z') },
    { ...q, role: 'user', createdAt: t('2026-10-12T11:00:00Z') },
    { ...q, role: 'assistant', createdAt: t('2026-10-12T10:00:05Z') },
    { ...q, role: 'user', createdAt: t('2026-10-11T10:00:00Z') },
  ]);

  const l = { agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin', tool: 'list_alerts', inputHash: 'h', outcome: 'ok', durationMs: 1, createdAt: t('2026-10-12T10:00:00Z') };
  await dbs.owner.insert(auditLog).values([{ ...l, channel: 'mcp' }, { ...l, channel: 'ask' }, { ...l, channel: 'web' }, { ...l, channel: 'mcp', createdAt: t('2026-10-11T10:00:00Z') }]);

  const c = { provider: 'p', model: 'm', task: 't', inputTokens: 1, outputTokens: 1, latencyMs: 1, ok: true };
  await dbs.owner.insert(llmCall).values([
    { ...c, agencyId: IDS.agencyA, costUsd: 0.5, createdAt: t('2026-10-12T01:00:00Z') },
    { ...c, agencyId: IDS.agencyA, costUsd: null, createdAt: t('2026-10-12T02:00:00Z') },
    { ...c, agencyId: IDS.agencyA, costUsd: 9, createdAt: t('2026-10-11T23:59:59Z') },
    { ...c, agencyId: IDS.agencyB, costUsd: 3, createdAt: t('2026-10-12T01:00:00Z') },
    { ...c, agencyId: null, costUsd: 4, createdAt: t('2026-10-12T01:00:00Z') },
  ]);
  await dbs.owner.insert(vendorCall).values({ agencyId: IDS.agencyA, vendor: 'v', operation: 'o', units: 1, costUsd: 0.75, latencyMs: 1, ok: true, createdAt: t('2026-10-12T23:59:59Z') });
}

describe('detectStatSources (P4)', () => {
  it('finds ask_message and audit_log.channel on a migrated DB', async () => {
    expect(await detectStatSources(dbs.service)).toEqual({ hasAsk: true, hasMcp: true });
  });

  it('brief and alert have no retracted_at (if one is added, the counts must filter it)', async () => {
    const cols = [...(await dbs.owner.execute<{ table_name: string }>(sql`
      select table_name from information_schema.columns
      where table_schema = 'public' and table_name in ('brief', 'alert', 'prospect_report') and column_name = 'retracted_at'`))];
    expect(cols).toEqual([]);
  });
});

describe('computeAgencyDay', () => {
  it('computes every measured figure for one UTC day', async () => {
    await seedActivity();
    const r = await computeAgencyDay(dbs.service, IDS.agencyA, Y, live);
    expect(r).toMatchObject({
      agencyId: IDS.agencyA, day: Y,
      clientsActive: 1, // A1; A2 is a prospect, A3 created after Y
      clientsProspect: 1,
      agencySeats: 2, clientSeats: 2,
      wau: 2, // u1, u2
      briefsSent: 1, alertsSent: 1, prospectReports: 1,
      askQuestions: 2, mcpCalls: 1,
      spendUsd: '1.2500',
    });
    expect(r.lastActivityAt).toEqual(t('2026-10-12T10:00:00Z'));
  });

  it('measured zero is 0, not NULL; spend with no ledger rows is 0', async () => {
    const r = await computeAgencyDay(dbs.service, IDS.agencyB, Y, live);
    expect(r).toMatchObject({ clientsActive: 1, clientsProspect: 0, agencySeats: 1, clientSeats: 0, wau: 0, briefsSent: 0, alertsSent: 0, prospectReports: 0, askQuestions: 0, mcpCalls: 0, spendUsd: '0.0000', lastActivityAt: null });
  });

  it('a prospect never counts as active', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    const r = await computeAgencyDay(dbs.service, IDS.agencyA, Y, live);
    expect(r).toMatchObject({ clientsActive: 0, clientsProspect: 2 });
  });

  it('reconstructOnly leaves wau, last_activity_at, ask_questions and mcp_calls NULL', async () => {
    await seedActivity();
    const r = await computeAgencyDay(dbs.service, IDS.agencyA, Y, { ...live, reconstructOnly: true });
    expect(r).toMatchObject({ wau: null, lastActivityAt: null, askQuestions: null, mcpCalls: null, clientsActive: 1, briefsSent: 1, alertsSent: 1, prospectReports: 1, spendUsd: '1.2500' });
  });

  it('Ask/MCP are NULL (not 0) when their sources are absent', async () => {
    await seedActivity();
    const r = await computeAgencyDay(dbs.service, IDS.agencyA, Y, { reconstructOnly: false, hasAsk: false, hasMcp: false });
    expect(r).toMatchObject({ askQuestions: null, mcpCalls: null, wau: 2 });
  });

  it('rejects a malformed day', async () => {
    await expect(computeAgencyDay(dbs.service, IDS.agencyA, '2026-1-2', live)).rejects.toThrow(/day/);
  });
});

describe('upsertDailyStats', () => {
  it('a reconstructed row never overwrites measured values', async () => {
    const measured = await computeAgencyDay(dbs.service, IDS.agencyA, Y, live);
    await upsertDailyStats(dbs.service, [{ ...measured, wau: 3, lastActivityAt: t('2026-10-12T10:00:00Z'), askQuestions: 4, mcpCalls: 5, clientsActive: 7 }]);
    await upsertDailyStats(dbs.service, [{ ...measured, wau: null, lastActivityAt: null, askQuestions: null, mcpCalls: null, clientsActive: 1 }], { reconstructOnly: true });
    const [row] = await rowsOf(IDS.agencyA);
    expect(row).toMatchObject({ wau: 3, askQuestions: 4, mcpCalls: 5, clientsActive: 7 });
    expect(row!.lastActivityAt).toEqual(t('2026-10-12T10:00:00Z'));
  });

  it('a live row replaces the stored figures', async () => {
    const r = await computeAgencyDay(dbs.service, IDS.agencyA, Y, live);
    await upsertDailyStats(dbs.service, [{ ...r, wau: 3 }]);
    await upsertDailyStats(dbs.service, [{ ...r, wau: 1 }]);
    expect((await rowsOf(IDS.agencyA))[0]).toMatchObject({ wau: 1 });
  });
});

describe('runDailyStats', () => {
  it('a re-run on the same day is idempotent', async () => {
    await seedActivity();
    await upsertDailyStats(dbs.service, [await computeAgencyDay(dbs.service, IDS.agencyA, '2026-10-01', live)]); // table not empty: no auto backfill
    const r1 = await runDailyStats(dbs.service, { now: NOW });
    const first = (await rowsOf(IDS.agencyA)).map(({ computedAt, ...x }) => x);
    const r2 = await runDailyStats(dbs.service, { now: NOW });
    const second = (await rowsOf(IDS.agencyA)).map(({ computedAt, ...x }) => x);
    expect(r1).toEqual({ agencies: 2, days: 1 });
    expect(r2).toEqual(r1);
    expect(second).toEqual(first);
    expect(first.map((x) => x.day)).toEqual(['2026-10-01', Y]);
    expect(first[1]).toMatchObject({ wau: 2, briefsSent: 1, spendUsd: '1.2500' });
  });

  it('{ day } recomputes one day and skips agencies created after it', async () => {
    await upsertDailyStats(dbs.service, [await computeAgencyDay(dbs.service, IDS.agencyA, '2026-10-01', live)]);
    expect(await runDailyStats(dbs.service, { day: '2026-10-05', now: NOW })).toEqual({ agencies: 1, days: 1 });
    expect((await rowsOf(IDS.agencyA)).map((x) => x.day)).toEqual(['2026-10-01', '2026-10-05']);
    expect(await rowsOf(IDS.agencyB)).toEqual([]);
  });

  it('backfills automatically when the table is empty: history from created_at, measured-only columns NULL', async () => {
    await seedActivity();
    const r = await runDailyStats(dbs.service, { now: NOW });
    const a = await rowsOf(IDS.agencyA);
    expect(a.map((x) => x.day)[0]).toBe('2026-09-01');
    expect(a.at(-1)!.day).toBe(Y);
    expect(a).toHaveLength(42); // 2026-09-01 .. 2026-10-12
    expect(r).toEqual({ agencies: 2, days: 42 });
    for (const row of a.slice(0, -1)) expect(row).toMatchObject({ wau: null, lastActivityAt: null, askQuestions: null, mcpCalls: null });
    expect(a.find((x) => x.day === '2026-10-11')).toMatchObject({ briefsSent: 1, alertsSent: 1, prospectReports: 1, spendUsd: '9.0000', clientsActive: 1 });
    expect(a.find((x) => x.day === '2026-09-01')).toMatchObject({ clientsActive: 0, clientsProspect: 0, agencySeats: 0 });
    // Yesterday is the nightly (measured) row.
    expect(a.at(-1)).toMatchObject({ wau: 2, askQuestions: 2, mcpCalls: 1 });
    expect((await rowsOf(IDS.agencyB)).map((x) => x.day)).toEqual(['2026-10-10', '2026-10-11', Y]);
  });

  it('a backfill after a measured run keeps the measured wau / activity / Ask / MCP', async () => {
    await seedActivity();
    await runDailyStats(dbs.service, { now: NOW });
    const before = (await rowsOf(IDS.agencyA)).find((x) => x.day === Y)!;
    await runDailyStats(dbs.service, { backfill: true, now: t('2026-10-16T05:00:00Z') });
    const after = await rowsOf(IDS.agencyA);
    const y = after.find((x) => x.day === Y)!;
    expect(y).toMatchObject({ wau: 2, askQuestions: 2, mcpCalls: 1, briefsSent: 1 });
    expect(y.lastActivityAt).toEqual(before.lastActivityAt);
    expect(after.at(-1)!.day).toBe('2026-10-15');
    expect(after).toHaveLength(45);
  });

  it('caps the backfill at 400 days', async () => {
    await dbs.owner.update(agency).set({ createdAt: t('2023-01-01T00:00:00Z') }).where(eq(agency.id, IDS.agencyA));
    await runDailyStats(dbs.service, { backfill: true, now: NOW });
    const a = await rowsOf(IDS.agencyA);
    expect(a).toHaveLength(400);
    expect(a[0]!.day).toBe('2025-09-08'); // 2026-10-13 − 400 days
    expect(a.at(-1)!.day).toBe(Y);
  });

  it('writes one row per agency per day (no duplicates across runs)', async () => {
    await runDailyStats(dbs.service, { now: NOW });
    await runDailyStats(dbs.service, { backfill: true, now: NOW });
    const [{ n }] = [...(await dbs.owner.execute<{ n: number }>(sql`select count(*)::int as n from agency_daily_stat where agency_id = ${IDS.agencyA} and day = ${Y}`))];
    expect(n).toBe(1);
    expect((await dbs.owner.select().from(agencyDailyStat).where(and(eq(agencyDailyStat.agencyId, IDS.agencyB)))).length).toBe(3);
  });
});
