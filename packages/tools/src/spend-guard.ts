import {
  type AiGuardState, agency, agencyDailyStat, billingNotice, client, clientServiceable, type Db, effectiveLimitUsd, llmCall, monthStart, pauseThresholdUsd, lockAiGuardState, readAiGuardState,
  readSpendGuardSettings, SPEND_GUARD_EXCLUDED_PROVIDERS, type SpendGuardSettings, spendByClient, spendGuardEvent, writeAiGuardState,
} from '@cs/db';
import { and, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { platformOperatorEmails } from './platform/costs/alerts';

/** 7b1 (C9): what platform staff are emailed about a pause (USD allowed: staff only). */
export type PlatformSpendAlertPayload = { kind: 'client_paused' | 'spike_warn' | 'spike_paused'; title: string; lines: string[]; url: string };

export interface SpendGuardDeps {
  service: Db;
  now?: () => Date;
  appUrl: string;
  platformAdmins: string[];
  sendStaffEmail(to: string, p: PlatformSpendAlertPayload): Promise<void>;
}

export interface SpendGuardSummary {
  reached: number;
  paused: number;
  lifted: number;
  rolledOver: number;
  spike: AiGuardState['state'];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "November 1" style, UTC: the first day of the month after `now`; the year is added when it is not the current one ("January 1, 2027"), as in the web banner. */
export const nextMonthLabel = (now: Date): string => {
  const m = now.getUTCMonth() + 1;
  return `${MONTHS[m % 12]} 1${m > 11 ? `, ${now.getUTCFullYear() + 1}` : ''}`;
};
const usd = (n: number) => `$${n.toFixed(2)}`;
/** Both once-per-month kinds share this race guard (`spend_guard_event_client_once`). */
const ONCE_PER_MONTH = {
  target: [spendGuardEvent.clientId, spendGuardEvent.kind, spendGuardEvent.month],
  where: sql`kind IN ('client_reached','client_paused')`,
};

/**
 * Hourly (7b1, spec d5/d6/d14/§5). Step 1: month rollover clears last month's pauses. Step 2: per guarded client (active or
 * prospect, not archived) record `client_reached` at the limit and pause at the threshold, with one agency notice and one staff
 * email per pause; lift when spend is back under the threshold (limit raised outside the tool). Never touches `paused_at`,
 * `paused_by`, seats or billing. The unique index is the only race guard: a run that loses the insert sends nothing.
 * Step 3: the platform spike guard (readSpikes + the ok/warn/paused state machine, spec d9-d12).
 */
export async function runSpendGuard(deps: SpendGuardDeps, now: Date): Promise<SpendGuardSummary> {
  const db = deps.service;
  const start = monthStart(now);
  const month = start.toISOString().slice(0, 10);
  const settings = await readSpendGuardSettings(db);
  const out: SpendGuardSummary = { reached: 0, paused: 0, lifted: 0, rolledOver: 0, spike: 'ok' };

  // 1. Rollover.
  await db.transaction(async (tx) => {
    const rolled = await tx
      .update(client)
      .set({ spendPausedAt: null })
      .where(lt(client.spendPausedAt, start))
      .returning({ id: client.id, agencyId: client.agencyId, limit: client.spendLimitUsd });
    if (rolled.length === 0) return;
    await tx.insert(spendGuardEvent).values(
      rolled.map((r) => ({ kind: 'client_unpaused', agencyId: r.agencyId, clientId: r.id, month, limitUsd: effectiveLimitUsd(r.limit, settings), note: 'month rollover' })),
    );
    out.rolledOver = rolled.length;
  });

  // 2. Per client.
  const clients = await db
    .select({ id: client.id, agencyId: client.agencyId, name: client.name, agencyName: agency.name, limit: client.spendLimitUsd, pausedAt: client.spendPausedAt })
    .from(client)
    .innerJoin(agency, eq(agency.id, client.agencyId))
    .where(and(isNull(client.archivedAt), inArray(client.status, ['active', 'prospect'])));
  const spent = await spendByClient(db, clients.map((c) => c.id), start);
  const staffAlerts: PlatformSpendAlertPayload[] = [];
  const until = nextMonthLabel(now);
  const micro = (n: number) => Math.round(n * 1e6);

  for (const c of clients) {
    const used = spent.get(c.id) ?? 0;
    const limit = effectiveLimitUsd(c.limit, settings);
    const threshold = pauseThresholdUsd(limit, settings);
    // Micro-dollars, like `set_client_limits`: at or above the line counts.
    if (micro(used) >= micro(limit)) {
      const ins = await db
        .insert(spendGuardEvent)
        .values({ kind: 'client_reached', agencyId: c.agencyId, clientId: c.id, month, limitUsd: limit, observedUsd: used })
        .onConflictDoNothing(ONCE_PER_MONTH)
        .returning({ id: spendGuardEvent.id });
      if (ins.length > 0) out.reached++;
    }

    if (micro(used) >= micro(threshold)) {
      const inserted = await db.transaction(async (tx) => {
        const ev = await tx
          .insert(spendGuardEvent)
          .values({ kind: 'client_paused', agencyId: c.agencyId, clientId: c.id, month, limitUsd: limit, observedUsd: used })
          .onConflictDoNothing(ONCE_PER_MONTH)
          .returning({ id: spendGuardEvent.id });
        await tx.update(client).set({ spendPausedAt: now }).where(and(eq(client.id, c.id), isNull(client.spendPausedAt)));
        if (ev.length === 0) return false; // a concurrent run (or an earlier pause this month) owns the notice and the emails
        await tx
          .insert(billingNotice)
          .values({
            agencyId: c.agencyId, clientId: c.id, audience: 'agency', kind: 'client_spend_paused',
            params: { clientName: c.name, until }, dedupeKey: `spend_paused:${c.id}:${month.slice(0, 7)}`,
          })
          .onConflictDoNothing();
        return true;
      });
      if (inserted) {
        out.paused++;
        staffAlerts.push({
          kind: 'client_paused',
          title: `${c.name} (${c.agencyName}) paused for spend`,
          lines: [`${c.name} used ${usd(used)} of its ${usd(limit)} limit this month (pause at ${settings.clientPausePercent} %). Raise the limit on the agency page or it lifts on ${until}.`],
          url: `${deps.appUrl.replace(/\/+$/, '')}/platform/agencies/${c.agencyId}`,
        });
      }
    } else if (c.pausedAt) {
      const lifted = await db.transaction(async (tx) => {
        const rows = await tx.update(client).set({ spendPausedAt: null }).where(and(eq(client.id, c.id), isNotNull(client.spendPausedAt))).returning({ id: client.id });
        if (rows.length === 0) return false;
        await tx.insert(spendGuardEvent).values({ kind: 'client_unpaused', agencyId: c.agencyId, clientId: c.id, month, limitUsd: limit, note: 'under threshold' });
        return true;
      });
      if (lifted) out.lifted++;
    }
  }

  // Staff emails after commit, best-effort: log the failure only, never the address or amounts.
  if (staffAlerts.length > 0) {
    const to = await platformOperatorEmails({ service: db, platformAdmins: deps.platformAdmins }, ['owner', 'staff']);
    for (const alert of staffAlerts) {
      for (const addr of to) {
        try {
          await deps.sendStaffEmail(addr, alert);
        } catch {
          // eslint-disable-next-line no-console -- best-effort
          console.error('[spend-guard] staff email failed');
        }
      }
    }
  }

  // 3. Platform spike guard.
  out.spike = await runSpikeGuard(deps, now, settings);
  return out;
}

// ---- Platform spike guard (7b1 d9-d12) ----

export type SpikeScope = 'total' | 'openrouter' | 'anthropic';
export const SPIKE_PROVIDERS: Record<Exclude<SpikeScope, 'total'>, readonly string[]> = { openrouter: ['openrouter', 'llm'], anthropic: ['anthropic'] };
export interface SpikeReading { scope: SpikeScope; observedUsd: number; baselineUsd: number; ratioPercent: number; floorOnly: boolean }

const SCOPES: readonly SpikeScope[] = ['total', 'openrouter', 'anthropic'];
const SCOPE_LABEL: Record<SpikeScope, string> = { total: 'all providers', openrouter: 'OpenRouter', anthropic: 'Anthropic' };
const H = 3_600_000;
const D = 24 * H;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** llm_call cost in [from, to): `total` = every provider except the excluded ones; vendor scopes = their providers. `vendor_call` never. */
async function sumLlm(db: Db, scope: SpikeScope, from: number, to: number): Promise<number> {
  const providers = scope === 'total' ? notInArray(llmCall.provider, [...SPEND_GUARD_EXCLUDED_PROVIDERS]) : inArray(llmCall.provider, [...SPIKE_PROVIDERS[scope]]);
  const [row] = await db
    .select({ usd: sql<number>`coalesce(sum(${llmCall.costUsd}), 0)::float8` })
    .from(llmCall)
    .where(and(providers, gte(llmCall.createdAt, new Date(from)), lt(llmCall.createdAt, new Date(to))));
  return Number(row?.usd ?? 0);
}

/**
 * Rolling-24 h spend against a baseline (spec d9): the higher of the 7-day and same-weekday per-client-day rates times today's
 * serviceable client count, floored by `spikeFloorUsdPerClientDay x N` and `spikeFloorUsdPerDay`. With under 7 days of
 * `agency_daily_stat` history only the floors apply.
 */
export async function readSpikes(db: Db, now: Date, s: SpendGuardSettings): Promise<SpikeReading[]> {
  const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [nRow] = await db.select({ n: sql<number>`count(*)::int` }).from(client).where(clientServiceable(client));
  const n = Number(nRow?.n ?? 0);
  // Deliberate deviation from the 7-day brief: 8 days back, so before 12:00 UTC the same-weekday window's midpoint day is still found.
  const rows = await db
    .select({ day: agencyDailyStat.day, clients: sql<number>`coalesce(sum(${agencyDailyStat.clientsActive}), 0)::int` })
    .from(agencyDailyStat)
    .where(and(gte(agencyDailyStat.day, isoDay(day0 - 8 * D)), lt(agencyDailyStat.day, isoDay(day0))))
    .groupBy(agencyDailyStat.day);
  const days = new Map(rows.map((r) => [r.day, Number(r.clients)]));
  const weekStart = isoDay(day0 - 7 * D);
  const week = rows.filter((r) => r.day >= weekStart);
  const clientDays7 = week.reduce((a, r) => a + Number(r.clients), 0);
  const historyOk = week.length >= 7 && clientDays7 > 0;
  const floor = Math.max(s.spikeFloorUsdPerClientDay * n, s.spikeFloorUsdPerDay);
  const out: SpikeReading[] = [];
  for (const scope of SCOPES) {
    const observedUsd = await sumLlm(db, scope, now.getTime() - D, now.getTime());
    let rate = 0;
    if (historyOk) {
      const rate7 = (await sumLlm(db, scope, day0 - 7 * D, day0)) / clientDays7;
      const wEnd = now.getTime() - 7 * D;
      const wClients = days.get(isoDay(wEnd - 12 * H)) ?? 0;
      const rateW = wClients > 0 ? (await sumLlm(db, scope, wEnd - D, wEnd)) / wClients : 0;
      rate = Math.max(rate7, rateW);
    }
    const baselineUsd = Math.max(rate * n, floor);
    // No baseline (both floors 0 and no history, or N = 0) means no spike signal: never Infinity/NaN.
    const ratioPercent = baselineUsd > 0 ? Math.round((observedUsd / baselineUsd - 1) * 100) : 0;
    out.push({ scope, observedUsd, baselineUsd, ratioPercent, floorOnly: rate * n <= floor });
  }
  return out;
}

/** One run of the state machine; returns the resulting state. `paused` only ever clears via `reset_ai_pause`. */
async function runSpikeGuard(deps: SpendGuardDeps, now: Date, s: SpendGuardSettings): Promise<AiGuardState['state']> {
  const db = deps.service;
  const cur = await readAiGuardState(db);
  if (cur.state === 'paused') return 'paused';
  const readings = await readSpikes(db, now, s);
  const top = readings.reduce((a, r) => (r.ratioPercent > a.ratioPercent ? r : a));
  const snoozed = cur.snoozeUntil !== undefined && new Date(cur.snoozeUntil).getTime() > now.getTime();
  const snap = { scope: top.scope, observedUsd: top.observedUsd, baselineUsd: top.baselineUsd };
  const url = `${deps.appUrl.replace(/\/+$/, '')}/platform/health`;
  const numbers = `Observed ${usd(top.observedUsd)} in the last 24 hours against a baseline of ${usd(top.baselineUsd)}.`;
  const keep = cur.snoozeUntil ? { snoozeUntil: cur.snoozeUntil } : {};
  let alert: PlatformSpendAlertPayload | null = null;
  let event: 'spike_paused' | 'spike_warn' | null = null;
  let next: AiGuardState;

  if (top.ratioPercent >= s.spikePausePercent && !snoozed) {
    next = { state: 'paused', since: now.toISOString(), ...snap, ...keep };
    event = 'spike_paused';
    alert = {
      kind: 'spike_paused',
      title: 'All AI calls are paused after a spend spike',
      lines: [`All AI calls are paused after a spend spike (${SCOPE_LABEL[top.scope]}). Queued work is waiting — reset on Health.`, numbers],
      url,
    };
  } else if (top.ratioPercent >= s.spikeWarnPercent) {
    const entering = cur.state === 'ok';
    next = { state: 'warn', since: cur.state === 'warn' && cur.since ? cur.since : now.toISOString(), ...snap, ...keep };
    if (entering) {
      event = 'spike_warn';
      alert = { kind: 'spike_warn', title: 'AI spend spike', lines: [`AI spend is ${top.ratioPercent}% above normal (${SCOPE_LABEL[top.scope]}).`, numbers], url };
    }
  } else {
    next = { state: 'ok', ...keep };
  }
  const applied = await db.transaction(async (tx) => {
    // A staff reset (or another run) that landed while we were reading must not be overwritten: bail, the next run recomputes.
    const latest = await lockAiGuardState(tx);
    if (JSON.stringify(latest) !== JSON.stringify(cur)) return latest;
    if (event) await tx.insert(spendGuardEvent).values({ kind: event, ...snap });
    await writeAiGuardState(tx, next, 'system');
    return null;
  });
  if (applied) return applied.state;

  if (alert) {
    // Best-effort after the state is written, like the client part.
    const to = await platformOperatorEmails({ service: db, platformAdmins: deps.platformAdmins }, ['owner', 'staff']);
    for (const addr of to) {
      try {
        await deps.sendStaffEmail(addr, alert);
      } catch {
        // eslint-disable-next-line no-console -- best-effort
        console.error('[spend-guard] staff email failed');
      }
    }
  }
  return next.state;
}
