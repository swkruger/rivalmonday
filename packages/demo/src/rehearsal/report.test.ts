import { brief, client, contact, llmCall, notification, opsAlert, spendGuardEvent } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDemoTables } from '../test-support';
import { seedFault } from './fault';
import { type RehearsalManifest, windowOpenFor, zonedTime } from './manifest';
import { analyseFixtureLog, type FixtureLogEntry, formatReport, type ReportLine, rehearsalReport } from './report';
import { seedRehearsal } from './seed';

const dbs = openTestDbs();
const Q = 'rehearsal_report_test_q';
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Seed Monday 2026-11-09 09:00 Chicago; rehearsal Monday 2026-11-16; report Monday 08:00 local. */
const SEED = new Date('2026-11-09T15:00:00Z');
const REPORT_AT = new Date('2026-11-16T14:00:00Z');
let m: RehearsalManifest;
let fault: { clientIds: string[] };
const weeklyBriefIds: string[] = [];

/** fx1–fx4: 40 daily pages each (half captured while fx5 is busy), 10 s apart per host; fx5 every 30 s for one hour a day. */
function cleanLog(): FixtureLogEntry[] {
  const out: FixtureLogEntry[] = [];
  const t0 = Date.parse('2026-11-10T12:00:00Z');
  for (let d = 0; d < 3; d++) {
    const base = t0 + d * DAY;
    for (let i = 0; i < 120; i++) out.push({ host: 'fx5.rehearsal.rivalmonday.app', path: `/g5/s${(i % 3) + 1}/`, at: new Date(base + i * 30_000).toISOString(), ua: 'RivalMondayBot' });
    for (let h = 1; h <= 4; h++) {
      for (let p = 0; p < 40; p++) {
        const at = base + (p < 20 ? 0 : 2 * HOUR) + p * 10_000 + h * 1_000;
        out.push({ host: `fx${h}.rehearsal.rivalmonday.app`, path: `/g${h}/s1/p${p}`, at: new Date(at).toISOString(), ua: 'RivalMondayBot' });
      }
    }
  }
  return out;
}

const statusOf = (lines: ReportLine[], prefix: string) => lines.find((l) => l.check.startsWith(prefix))?.status;

async function report(memoryMb = 2048, fixtureLog: FixtureLogEntry[] | null = cleanLog()) {
  return rehearsalReport(dbs.owner, { manifest: m, now: REPORT_AT, memoryMb, fixtureLog, queueSchema: Q });
}

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  m = await seedRehearsal(dbs.service, { agencies: 2, clients: 2, startingPoints: 1, liveClients: 1, now: SEED, database: 'test/test' });
  fault = await seedFault(dbs.service, { clients: 3, now: SEED });
  const open = windowOpenFor(m.deliveryDate, m.timezone);
  const clients = await dbs.owner.select({ id: client.id, agencyId: client.agencyId }).from(client).where(inArray(client.id, [...m.weeklyClientIds, ...m.startingPointClientIds]));
  for (const c of clients) {
    const [b] = await dbs.owner.insert(brief).values({
      agencyId: c.agencyId, clientId: c.id, deliveryDate: m.deliveryDate, periodStart: new Date(open.getTime() - 7 * DAY), periodEnd: open, kind: 'quiet', status: 'sent',
      generatedAt: new Date(open.getTime() + HOUR), sentAt: zonedTime(m.deliveryDate, 7, 5, m.timezone),
    }).returning({ id: brief.id });
    weeklyBriefIds.push(b!.id);
    const [owner] = await dbs.owner.select({ id: contact.id, email: contact.email }).from(contact).where(and(eq(contact.clientId, c.id), eq(contact.role, 'client_owner')));
    await dbs.owner.insert(notification).values({
      agencyId: c.agencyId, clientId: c.id, contactId: owner!.id, channel: 'email', kind: 'brief', subjectType: 'brief', subjectId: b!.id, dedupeKey: `brief:${b!.id}:${owner!.id}:email`,
      title: 'Weekly competitor brief', body: 'b', address: owner!.email, status: 'sent', sentAt: zonedTime(m.deliveryDate, 7, 30, m.timezone),
    });
  }
  const sp = clients.find((c) => m.startingPointClientIds.includes(c.id))!;
  await dbs.owner.insert(brief).values({
    agencyId: sp.agencyId, clientId: sp.id, deliveryDate: '2026-11-11', periodStart: SEED, periodEnd: new Date(SEED.getTime() + 50 * HOUR), kind: 'starting_point', status: 'ready',
    generatedAt: new Date(SEED.getTime() + 50 * HOUR),
  });
  await dbs.owner.insert(opsAlert).values({
    kind: 'brief_readiness', dedupeKey: `brief_readiness:generation_closed:${m.deliveryDate}:America/Chicago`, severity: 'critical', emailedAt: new Date('2026-11-13T18:30:00Z'),
    summary: { clients: fault.clientIds.map((clientId) => ({ clientId, clientName: 'x', agencyName: 'Rehearsal Agency Fault' })), deliveryDate: m.deliveryDate, checkpoint: 'generation_closed' },
  });
  await dbs.owner.insert(llmCall).values([
    { clientId: m.liveClientIds[0]!, task: 'brief_writer', provider: 'openrouter', model: 'x', inputTokens: 1, outputTokens: 1, costUsd: 0.7, latencyMs: 900, ok: true, createdAt: new Date(SEED.getTime() + DAY) },
    { clientId: m.weeklyClientIds[0]!, task: 'brief_writer', provider: 'rehearsal', model: 'x', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 900, ok: true, createdAt: new Date(SEED.getTime() + DAY) },
  ]);
  await dbs.owner.insert(spendGuardEvent).values({ kind: 'spike_warn', createdAt: new Date(SEED.getTime() + DAY) });

  await dbs.owner.execute(sql.raw(`DROP SCHEMA IF EXISTS ${Q} CASCADE; CREATE SCHEMA ${Q};
    CREATE TABLE ${Q}.job (name text NOT NULL, state text NOT NULL, output jsonb, created_on timestamptz NOT NULL DEFAULT now());
    CREATE TABLE ${Q}.archive (name text NOT NULL, state text NOT NULL, output jsonb, created_on timestamptz NOT NULL DEFAULT now());`));
  const hb = (rssMb: number, at: number) => sql`INSERT INTO ${sql.raw(Q)}.archive (name, state, output, created_on) VALUES ('system-heartbeat', 'completed', ${JSON.stringify({ queueGrants: 'ok', rssMb, dbConnections: 40, dbMaxConnections: 100 })}::jsonb, ${new Date(at).toISOString()}::timestamptz)`;
  await dbs.owner.execute(hb(700, SEED.getTime() + HOUR));
  await dbs.owner.execute(hb(1200, SEED.getTime() + 3 * DAY));
  await dbs.owner.execute(sql`INSERT INTO ${sql.raw(Q)}.job (name, state, output, created_on) VALUES ('brief-client', 'completed', '{"items":1}'::jsonb, ${new Date(SEED.getTime() + 4 * DAY).toISOString()}::timestamptz)`);
  // An expired job from before the seed does not count.
  await dbs.owner.execute(sql`INSERT INTO ${sql.raw(Q)}.archive (name, state, output, created_on) VALUES ('web-capture-page', 'failed', '{"value":{"message":"job failed by timeout in active state"}}'::jsonb, ${new Date(SEED.getTime() - DAY).toISOString()}::timestamptz)`);
});

afterAll(async () => {
  await dbs.owner.execute(sql.raw(`DROP SCHEMA IF EXISTS ${Q} CASCADE`));
  await dbs.closeAll();
});

describe('rehearsalReport', () => {
  it('a clean run prints PASS on every line of the pass bar', async () => {
    const lines = await report();
    expect(lines.filter((l) => l.status !== 'PASS')).toEqual([]);
    expect(lines.map((l) => l.check)).toEqual([
      'weekly briefs ready <= 4 h after window open', 'starting points ready <= 6 h after due', 'no failed briefs', 'briefs sent by 07:15 local',
      'brief emails sent by 07:45 local', 'no expired jobs', 'worker RSS < 75 % of memory', 'DB connections < 80 % of limit',
      'no two requests to one host < 3 s apart', 'Crawl-delay: 30 host honoured', 'Crawl-delay host does not slow the others',
      'spend guard never tripped', 'live-slice spend x 6 below spike threshold', 'total AI spend <= $5', 'fault alarm raised',
    ]);
    expect(formatReport(lines)).toMatch(/^RESULT: PASS/m);
  });

  it('a late brief, a failed brief, a late email, an expired job and high RSS each turn their line to FAIL; fault clients never count', async () => {
    const open = windowOpenFor(m.deliveryDate, m.timezone);
    await dbs.owner.update(brief).set({ generatedAt: new Date(open.getTime() + 5 * HOUR) }).where(eq(brief.id, weeklyBriefIds[0]!));
    await dbs.owner.update(brief).set({ status: 'failed', sentAt: null }).where(eq(brief.id, weeklyBriefIds[1]!));
    await dbs.owner.update(notification).set({ sentAt: zonedTime(m.deliveryDate, 8, 0, m.timezone) }).where(eq(notification.subjectId, weeklyBriefIds[2]!));
    await dbs.owner.execute(sql`INSERT INTO ${sql.raw(Q)}.job (name, state, output, created_on) VALUES ('brief-client', 'failed', '{"value":{"message":"job failed by timeout in active state"}}'::jsonb, ${new Date(SEED.getTime() + 4 * DAY).toISOString()}::timestamptz)`);
    await dbs.owner.insert(spendGuardEvent).values({ kind: 'spike_paused', createdAt: new Date(SEED.getTime() + 3 * DAY) });
    await dbs.owner.update(opsAlert).set({ emailedAt: null });

    const lines = await report(1500, null);
    expect(statusOf(lines, 'weekly briefs ready')).toBe('FAIL');
    expect(statusOf(lines, 'no failed briefs')).toBe('FAIL');
    expect(lines.find((l) => l.check === 'no failed briefs')!.detail).toMatch(/^1 failed/); // the 3 pre-failed fault briefs are excluded
    expect(statusOf(lines, 'briefs sent by')).toBe('FAIL');
    expect(statusOf(lines, 'brief emails sent')).toBe('FAIL');
    expect(statusOf(lines, 'no expired jobs')).toBe('FAIL');
    expect(statusOf(lines, 'worker RSS')).toBe('FAIL'); // 1200 MB of 1500 MB
    expect(statusOf(lines, 'DB connections')).toBe('PASS');
    expect(statusOf(lines, 'spend guard never tripped')).toBe('FAIL');
    expect(statusOf(lines, 'fault alarm raised')).toBe('FAIL'); // not emailed
    expect(statusOf(lines, 'no two requests')).toBe('SKIP'); // no fixture log given
    expect(statusOf(lines, 'starting points ready')).toBe('PASS');
    expect(formatReport(lines)).toMatch(/^RESULT: FAIL/m);
  });
});

describe('analyseFixtureLog', () => {
  it('passes a polite log and fails a 2 s gap, a fast Crawl-delay host and others slowed while it is busy', () => {
    expect(analyseFixtureLog(cleanLog()).map((l) => l.status)).toEqual(['PASS', 'PASS', 'PASS']);
    const log = cleanLog();
    const t = Date.parse(log.find((e) => e.host.startsWith('fx2.'))!.at);
    log.push({ host: 'fx2.rehearsal.rivalmonday.app', path: '/robots.txt', at: new Date(t + 2_000).toISOString() });
    log.push({ host: 'fx5.rehearsal.rivalmonday.app', path: '/g5/s1/', at: new Date(Date.parse('2026-11-10T12:00:10Z')).toISOString() });
    // Captures made while fx5 is busy come back 2 h late on day 3.
    for (const e of log) if (!e.host.startsWith('fx5.') && /p1?\d$/.test(e.path) && e.at >= '2026-11-12') e.at = new Date(Date.parse(e.at) + 2 * HOUR).toISOString();
    expect(analyseFixtureLog(log).map((l) => l.status)).toEqual(['FAIL', 'FAIL', 'FAIL']);
  });
});
