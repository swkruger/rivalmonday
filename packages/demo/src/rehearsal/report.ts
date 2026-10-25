import { FIXTURE_CRAWL_DELAY_HOST_INDEX } from '@cs/collectors';
import { agency, brief, client, clientSetup, type Db, notification, opsAlert, readSpendGuardSettings, SPEND_GUARD_EXCLUDED_PROVIDERS, spendGuardEvent } from '@cs/db';
import { DELIVERY_LOCAL_HOUR, REHEARSAL_PROVIDER, STARTING_POINT_WAIT_HOURS } from '@cs/engine';
import { and, eq, gte, inArray, isNull, like, ne, sql } from 'drizzle-orm';
import { FAULT_AGENCY_NAME, localDate, type RehearsalManifest, windowOpenFor, zonedTime } from './manifest';

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';
export interface ReportLine { status: CheckStatus; check: string; detail: string }
/** One request seen by the fixture hosts (`GET /__rehearsal/log`, oldest first). */
export interface FixtureLogEntry { host: string; path: string; at: string; ua?: string }

/** Pass bar (plan Global constraints "Rehearsal"). */
export const PASS_BAR = {
  weeklyReadyHours: 4,
  startingPointLateHours: 6,
  sentBy: { hour: DELIVERY_LOCAL_HOUR, minute: 15 },
  notifiedBy: { hour: DELIVERY_LOCAL_HOUR, minute: 45 },
  rssPercent: 75,
  dbConnectionsPercent: 80,
  hostGapMs: 3_000,
  crawlDelayGapMs: 30_000,
  /** Live slice (10 clients) x 6 = the 60-client pilot. */
  liveSliceMultiplier: 6,
  pilotClients: 60,
  aiBudgetUsd: 5,
} as const;
export const EXPIRED_JOB_MESSAGE = 'job failed by timeout in active state';
export const HEARTBEAT_QUEUE = 'system-heartbeat';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const line = (status: CheckStatus, check: string, detail: string): ReportLine => ({ status, check, detail });
const pass = (ok: boolean) => (ok ? 'PASS' : 'FAIL') as CheckStatus;
const hours = (ms: number) => `${ms >= 0 ? '+' : ''}${(ms / HOUR_MS).toFixed(1)} h`;
const usd = (n: number) => `$${n.toFixed(2)}`;

export interface ReportOptions {
  manifest: RehearsalManifest;
  now?: Date;
  /** The worker container's memory limit (Railway), for the RSS line. */
  memoryMb?: number;
  /** `null`/absent: the three host lines are SKIP. */
  fixtureLog?: FixtureLogEntry[] | null;
  /** pg-boss schema (tests use a scratch schema). */
  queueSchema?: string;
}

/**
 * The rehearsal pass bar as PASS/FAIL lines (SKIP when an input is missing). Fault clients (decision 12) are excluded from
 * every line except "fault alarm raised". `db` must read every table (staging owner URL), including pg-boss's.
 */
export async function rehearsalReport(db: Db, o: ReportOptions): Promise<ReportLine[]> {
  const m = o.manifest;
  const now = o.now ?? new Date();
  const seededAt = new Date(m.seededAt);
  const D = m.deliveryDate;
  const tz = m.timezone;
  const faultIds = await faultClientIds(db, m);
  // Weekly lines cover the weekly clients only; starting-point clients are judged by the starting-point line.
  const weekly = m.weeklyClientIds.filter((id) => !faultIds.includes(id));
  const startingPoints = m.startingPointClientIds.filter((id) => !faultIds.includes(id));
  const out: ReportLine[] = [];

  // Weekly briefs for the rehearsal Monday.
  const open = windowOpenFor(D, tz);
  const rows = weekly.length === 0 ? [] : await db.select({ id: brief.id, clientId: brief.clientId, status: brief.status, generatedAt: brief.generatedAt, sentAt: brief.sentAt }).from(brief)
    .where(and(inArray(brief.clientId, weekly), eq(brief.deliveryDate, D), ne(brief.kind, 'starting_point')));
  const readyBy = open.getTime() + PASS_BAR.weeklyReadyHours * HOUR_MS;
  const generated = rows.filter((r) => r.generatedAt !== null && r.status !== 'failed' && r.status !== 'generating');
  const onTime = generated.filter((r) => r.generatedAt!.getTime() <= readyBy);
  const latest = generated.reduce((a, r) => Math.max(a, r.generatedAt!.getTime() - open.getTime()), Number.NEGATIVE_INFINITY);
  out.push(line(pass(weekly.length > 0 && onTime.length === weekly.length), 'weekly briefs ready <= 4 h after window open',
    `${onTime.length}/${weekly.length} on time (window opened ${open.toISOString()}${generated.length ? `, latest ${hours(latest)}` : ''}; ${weekly.length - generated.length} not generated)`));

  out.push(await startingPointLine(db, startingPoints));

  const tracked = [...weekly, ...startingPoints];
  const failed = tracked.length === 0 ? [] : await db.select({ id: brief.id, attempts: brief.attempts, status: brief.status }).from(brief)
    .where(and(inArray(brief.clientId, tracked), gte(brief.deliveryDate, localDate(seededAt, tz))));
  const failedNow = failed.filter((b) => b.status === 'failed').length;
  out.push(line(pass(failedNow === 0), 'no failed briefs', `${failedNow} failed; ${failed.filter((b) => b.attempts > 1 && b.status !== 'failed').length} recovered on a retry (fault clients excluded)`));

  const sentBy = zonedTime(D, PASS_BAR.sentBy.hour, PASS_BAR.sentBy.minute, tz);
  const sentOk = rows.filter((r) => r.status === 'sent' && r.sentAt !== null && r.sentAt.getTime() <= sentBy.getTime());
  out.push(line(pass(weekly.length > 0 && sentOk.length === weekly.length), 'briefs sent by 07:15 local', `${sentOk.length}/${weekly.length} sent by ${sentBy.toISOString()}`));

  const notifiedBy = zonedTime(D, PASS_BAR.notifiedBy.hour, PASS_BAR.notifiedBy.minute, tz);
  const emails = rows.length === 0 ? [] : await db.select({ status: notification.status, sentAt: notification.sentAt }).from(notification)
    .where(and(eq(notification.subjectType, 'brief'), eq(notification.channel, 'email'), inArray(notification.subjectId, rows.map((r) => r.id))));
  const emailsOk = emails.filter((e) => e.status === 'sent' && e.sentAt !== null && e.sentAt.getTime() <= notifiedBy.getTime());
  out.push(line(pass(emails.length > 0 && emailsOk.length === emails.length), 'brief emails sent by 07:45 local',
    emails.length === 0 ? 'no brief emails found' : `${emailsOk.length}/${emails.length} sent by ${notifiedBy.toISOString()}`));

  out.push(...(await queueLines(db, o.queueSchema ?? 'pgboss', seededAt, o.memoryMb)));
  out.push(...(o.fixtureLog ? analyseFixtureLog(o.fixtureLog) : FIXTURE_CHECKS.map((c) => line('SKIP', c, 'no fixture log (pass --fixture-log-url and --fixture-log-token-env)'))));
  out.push(...(await spendLines(db, m, seededAt, now)));
  out.push(await faultLine(db, faultIds, D));
  return out;
}

async function faultClientIds(db: Db, m: RehearsalManifest): Promise<string[]> {
  if (m.fault) return m.fault.clientIds;
  const rows = await db.select({ id: client.id }).from(client).innerJoin(agency, eq(agency.id, client.agencyId))
    .where(and(eq(agency.name, FAULT_AGENCY_NAME), isNull(agency.archivedAt)));
  return rows.map((r) => r.id);
}

/** Due = the starting-point clock (11a: competitors done / dismissed, else activation) + 48 h; late 6 h after that. */
async function startingPointLine(db: Db, ids: string[]): Promise<ReportLine> {
  const check = 'starting points ready <= 6 h after due';
  if (ids.length === 0) return line('SKIP', check, 'no starting-point clients in the manifest');
  const rows = await db.select({
    clientId: client.id, activatedAt: client.activatedAt, createdAt: client.createdAt, done: clientSetup.competitorsDoneAt, dismissed: clientSetup.dismissedAt,
    status: brief.status, generatedAt: brief.generatedAt,
  }).from(client)
    .leftJoin(clientSetup, eq(clientSetup.clientId, client.id))
    .leftJoin(brief, and(eq(brief.clientId, client.id), eq(brief.kind, 'starting_point')))
    .where(inArray(client.id, ids));
  const ok = new Set<string>();
  let worst = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const clock = (r.done ?? r.dismissed ?? r.activatedAt ?? r.createdAt).getTime();
    const due = clock + STARTING_POINT_WAIT_HOURS * HOUR_MS;
    if (!r.generatedAt || !r.status || !['ready', 'approved', 'sent'].includes(r.status)) continue;
    worst = Math.max(worst, r.generatedAt.getTime() - due);
    if (r.generatedAt.getTime() <= due + PASS_BAR.startingPointLateHours * HOUR_MS) ok.add(r.clientId);
  }
  const want = new Set(ids);
  return line(pass(ok.size === want.size), check, `${ok.size}/${want.size} on time${worst > Number.NEGATIVE_INFINITY ? ` (latest ${hours(worst)} vs due)` : ''}`);
}

async function queueLines(db: Db, schema: string, seededAt: Date, memoryMb: number | undefined): Promise<ReportLine[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`invalid queue schema ${schema}`);
  const jobs = sql.raw(`(SELECT name, state, output, created_on FROM ${schema}.job UNION ALL SELECT name, state, output, created_on FROM ${schema}.archive)`);
  const since = seededAt.toISOString();
  const [expired] = (await db.execute(sql`SELECT count(*)::int AS n FROM ${jobs} j
    WHERE j.output->'value'->>'message' = ${EXPIRED_JOB_MESSAGE} AND j.created_on >= ${since}::timestamptz`)) as unknown as { n: number }[];
  const beats = (await db.execute(sql`SELECT j.output FROM ${jobs} j
    WHERE j.name = ${HEARTBEAT_QUEUE} AND j.state = 'completed' AND j.created_on >= ${since}::timestamptz`)) as unknown as { output: unknown }[];
  const samples = beats.map((b) => heartbeatSample(b.output)).filter((s): s is NonNullable<typeof s> => s !== null);
  const out: ReportLine[] = [line(pass(Number(expired?.n ?? 0) === 0), 'no expired jobs', `${Number(expired?.n ?? 0)} jobs failed by timeout since the seed`)];

  const rss = samples.map((s) => s.rssMb).filter((n): n is number => n !== null);
  const maxRss = rss.length ? Math.max(...rss) : null;
  if (!memoryMb) out.push(line('SKIP', 'worker RSS < 75 % of memory', `max RSS ${maxRss ?? '?'} MB; pass --memory-mb <worker memory limit>`));
  else if (maxRss === null) out.push(line('FAIL', 'worker RSS < 75 % of memory', 'no heartbeat outputs since the seed'));
  else out.push(line(pass(maxRss < (memoryMb * PASS_BAR.rssPercent) / 100), 'worker RSS < 75 % of memory', `max ${maxRss} MB of ${memoryMb} MB (${Math.round((maxRss / memoryMb) * 100)} %, ${samples.length} heartbeats)`));

  const ratios = samples.filter((s) => s.dbConnections !== null && s.dbMaxConnections).map((s) => s.dbConnections! / s.dbMaxConnections!);
  if (ratios.length === 0) out.push(line('FAIL', 'DB connections < 80 % of limit', 'no connection samples in heartbeat outputs since the seed'));
  else {
    const max = Math.max(...ratios);
    out.push(line(pass(max < PASS_BAR.dbConnectionsPercent / 100), 'DB connections < 80 % of limit', `max ${Math.round(max * 100)} % (${ratios.length} samples)`));
  }
  return out;
}

function heartbeatSample(output: unknown): { rssMb: number | null; dbConnections: number | null; dbMaxConnections: number | null } | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  const v = ('rssMb' in o ? o : (o.value as Record<string, unknown> | undefined)) ?? null;
  if (!v || typeof v !== 'object') return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return { rssMb: num(v.rssMb), dbConnections: num(v.dbConnections), dbMaxConnections: num(v.dbMaxConnections) };
}

const FIXTURE_CHECKS = ['no two requests to one host < 3 s apart', 'Crawl-delay: 30 host honoured', 'Crawl-delay host does not slow the others'] as const;
/** A fixture page counts as due "while the Crawl-delay host is busy" when that host served a request within this window. */
const BUSY_WINDOW_MS = 45_000;
const LAG_MIN_SAMPLES = 20;
/** Busy-time p95 lag may exceed idle-time p95 by this much before it counts as "slowed". */
const LAG_TOLERANCE = { factor: 1.1, ms: 5 * 60_000 };

function p95(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] ?? 0;
}

/**
 * The three host lines from the fixture-host request log: every host's minimum gap between requests (robots.txt
 * included), the Crawl-delay host's (`fx5`), and whether the other hosts' pages are captured later when they come due while
 * fx5 is busy. Capture lag = time between a page's consecutive captures minus its 24 h cadence (pairs 20–48 h apart);
 * each sample is classed busy/idle by its due time (previous capture + 24 h). PASS when busy p95 <= idle p95 x 1.1 + 5 min.
 */
export function analyseFixtureLog(entries: FixtureLogEntry[]): ReportLine[] {
  const slowPrefix = `fx${FIXTURE_CRAWL_DELAY_HOST_INDEX + 1}.`;
  const byHost = new Map<string, { path: string; at: number }[]>();
  for (const e of entries) {
    // Only our crawler's requests count (an entry without a UA is kept).
    if (typeof e.ua === 'string' && !e.ua.includes('RivalMondayBot')) continue;
    const at = Date.parse(e.at);
    if (!Number.isFinite(at)) continue;
    const host = e.host.toLowerCase();
    let list = byHost.get(host);
    if (!list) byHost.set(host, (list = []));
    list.push({ path: e.path, at });
  }
  for (const list of byHost.values()) list.sort((a, b) => a.at - b.at);
  const minGap = (list: { at: number }[]) => list.slice(1).reduce((a, r, i) => Math.min(a, r.at - list[i]!.at), Number.POSITIVE_INFINITY);

  const out: ReportLine[] = [];
  const gaps = [...byHost].filter(([, l]) => l.length > 1).map(([host, l]) => ({ host, gap: minGap(l) }));
  if (gaps.length === 0) out.push(line('SKIP', FIXTURE_CHECKS[0], 'fewer than two requests per host in the log'));
  else {
    const worst = gaps.reduce((a, g) => (g.gap < a.gap ? g : a));
    out.push(line(pass(worst.gap >= PASS_BAR.hostGapMs), FIXTURE_CHECKS[0], `smallest gap ${(worst.gap / 1000).toFixed(1)} s on ${worst.host} (${entries.length} requests, ${byHost.size} hosts)`));
  }

  const slow = [...byHost].find(([h]) => h.startsWith(slowPrefix));
  if (!slow || slow[1].length < 2) out.push(line('SKIP', FIXTURE_CHECKS[1], `fewer than two requests to ${slowPrefix}*`));
  else {
    const g = minGap(slow[1]);
    out.push(line(pass(g >= PASS_BAR.crawlDelayGapMs), FIXTURE_CHECKS[1], `smallest gap on ${slow[0]} ${(g / 1000).toFixed(1)} s (needs >= 30 s)`));
  }

  const slowTimes = slow ? slow[1].map((r) => r.at) : [];
  const busyAt = (t: number) => {
    let lo = 0;
    let hi = slowTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (slowTimes[mid]! < t - BUSY_WINDOW_MS) lo = mid + 1;
      else hi = mid;
    }
    return lo < slowTimes.length && slowTimes[lo]! <= t + BUSY_WINDOW_MS;
  };
  const busy: number[] = [];
  const idle: number[] = [];
  for (const [host, list] of byHost) {
    if (host.startsWith(slowPrefix)) continue;
    const perPath = new Map<string, number[]>();
    for (const r of list) {
      if (r.path === '/robots.txt') continue;
      let times = perPath.get(r.path);
      if (!times) perPath.set(r.path, (times = []));
      times.push(r.at);
    }
    for (const times of perPath.values()) {
      for (let i = 1; i < times.length; i++) {
        const interval = times[i]! - times[i - 1]!;
        if (interval < 20 * HOUR_MS || interval > 48 * HOUR_MS) continue;
        const due = times[i - 1]! + DAY_MS;
        (busyAt(due) ? busy : idle).push(Math.max(0, interval - DAY_MS));
      }
    }
  }
  if (busy.length < LAG_MIN_SAMPLES || idle.length < LAG_MIN_SAMPLES) {
    out.push(line('SKIP', FIXTURE_CHECKS[2], `too few daily re-captures to compare (${busy.length} while ${slowPrefix}* busy, ${idle.length} idle; need ${LAG_MIN_SAMPLES} each)`));
  } else {
    const b = p95(busy);
    const i = p95(idle);
    out.push(line(pass(b <= i * LAG_TOLERANCE.factor + LAG_TOLERANCE.ms), FIXTURE_CHECKS[2],
      `p95 capture lag ${(b / 60_000).toFixed(1)} min when due while ${slowPrefix}* busy vs ${(i / 60_000).toFixed(1)} min otherwise (${busy.length}/${idle.length} samples)`));
  }
  return out;
}

async function spendLines(db: Db, m: RehearsalManifest, seededAt: Date, now: Date): Promise<ReportLine[]> {
  const out: ReportLine[] = [];
  const spikes = await db.select({ at: spendGuardEvent.createdAt }).from(spendGuardEvent)
    .where(and(eq(spendGuardEvent.kind, 'spike_paused'), gte(spendGuardEvent.createdAt, seededAt)));
  out.push(line(pass(spikes.length === 0), 'spend guard never tripped', spikes.length === 0 ? 'no spike_paused event since the seed' : `spike_paused at ${spikes.map((s) => s.at.toISOString()).join(', ')}`));

  const window = sql`created_at >= ${seededAt.toISOString()}::timestamptz AND created_at < ${now.toISOString()}::timestamptz`;
  const notCounted = sql`ARRAY[${sql.join([REHEARSAL_PROVIDER, ...SPEND_GUARD_EXCLUDED_PROVIDERS].map((p) => sql`${p}`), sql`, `)}]::text[]`;
  if (m.liveClientIds.length === 0) out.push(line('SKIP', 'live-slice spend x 6 below spike threshold', 'no live slice in the manifest'));
  else {
    const [live] = (await db.execute(sql`SELECT coalesce(sum(cost_usd), 0)::float8 AS usd FROM llm_call
      WHERE ${window} AND provider <> ALL(${notCounted})
        AND client_id = ANY(ARRAY[${sql.join(m.liveClientIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])`)) as unknown as { usd: number }[];
    const days = Math.max((now.getTime() - seededAt.getTime()) / DAY_MS, 1);
    const projected = (Number(live?.usd ?? 0) / days) * PASS_BAR.liveSliceMultiplier;
    // 7b spike guard at pilot size with no history: the floor baseline, warned at +spikeWarnPercent.
    const s = await readSpendGuardSettings(db);
    const baseline = Math.max(s.spikeFloorUsdPerClientDay * PASS_BAR.pilotClients, s.spikeFloorUsdPerDay);
    const threshold = baseline * (1 + s.spikeWarnPercent / 100);
    out.push(line(pass(projected < threshold), 'live-slice spend x 6 below spike threshold',
      `${usd(Number(live?.usd ?? 0))} over ${days.toFixed(1)} days -> ${usd(projected)}/day projected for ${PASS_BAR.pilotClients} clients vs spike warning at ${usd(threshold)}/day`));
  }

  const [total] = (await db.execute(sql`SELECT coalesce(sum(cost_usd), 0)::float8 AS usd FROM llm_call WHERE ${window}`)) as unknown as { usd: number }[];
  const t = Number(total?.usd ?? 0);
  out.push(line(pass(t <= PASS_BAR.aiBudgetUsd), 'total AI spend <= $5', `${usd(t)} of llm_call cost since the seed`));
  return out;
}

/** Decision 12: a critical, emailed `generation_closed` alert for the rehearsal Monday whose clients cover every fault client. */
async function faultLine(db: Db, faultIds: string[], deliveryDate: string): Promise<ReportLine> {
  const check = 'fault alarm raised';
  if (faultIds.length === 0) return line('SKIP', check, `no "${FAULT_AGENCY_NAME}" (run \`rehearsal fault\` before Thursday)`);
  const alerts = await db.select({ summary: opsAlert.summary, emailedAt: opsAlert.emailedAt }).from(opsAlert)
    .where(and(like(opsAlert.dedupeKey, 'brief_readiness:generation_closed:%'), eq(opsAlert.severity, 'critical'), sql`${opsAlert.summary}->>'deliveryDate' = ${deliveryDate}`));
  const emailed = alerts.filter((a) => a.emailedAt !== null);
  const covered = new Set(emailed.flatMap((a) => {
    const clients = (a.summary as { clients?: unknown }).clients;
    return Array.isArray(clients) ? clients.map((c) => String((c as { clientId?: unknown }).clientId)) : [];
  }));
  const missing = faultIds.filter((id) => !covered.has(id));
  return line(pass(missing.length === 0), check,
    missing.length === 0 ? `critical generation_closed alert for ${deliveryDate} emailed, covering all ${faultIds.length} fault clients`
      : `${missing.length}/${faultIds.length} fault clients not in an emailed critical generation_closed alert for ${deliveryDate} (${alerts.length} alerts, ${emailed.length} emailed)`);
}

/** Lines plus an overall verdict: PASS only when every line passed. */
export function formatReport(lines: ReportLine[]): string {
  const failed = lines.filter((l) => l.status === 'FAIL').length;
  const skipped = lines.filter((l) => l.status === 'SKIP').length;
  const verdict = failed > 0 ? `RESULT: FAIL (${failed} failed, ${skipped} skipped)` : skipped > 0 ? `RESULT: INCOMPLETE (${skipped} skipped)` : `RESULT: PASS (${lines.length}/${lines.length})`;
  return [...lines.map((l) => `${l.status.padEnd(4)}  ${l.check} — ${l.detail}`), verdict].join('\n');
}

/** `GET <url>` with the fixture hosts' bearer token. */
export async function fetchFixtureLog(url: string, token: string, fetchImpl: typeof fetch = fetch): Promise<FixtureLogEntry[]> {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`fixture log ${url} answered ${res.status}`);
  const body = (await res.json()) as { entries?: unknown };
  if (!Array.isArray(body.entries)) throw new Error('fixture log: no entries array');
  return body.entries as FixtureLogEntry[];
}
