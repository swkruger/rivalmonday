import {
  type AiGuardState, agency, billingNotice, client, type Db, effectiveLimitUsd, monthStart, pauseThresholdUsd, readAiGuardState,
  readSpendGuardSettings, spendByClient, spendGuardEvent,
} from '@cs/db';
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
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
/** "November 1" style, UTC: the first day of the month after `now`. */
const nextMonthLabel = (now: Date): string => `${MONTHS[(now.getUTCMonth() + 1) % 12]} 1`;
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
 * Step 3 (platform spike guard) is Task 10's: it slots in before the return.
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
      .where(and(lt(client.spendPausedAt, start), isNull(client.archivedAt)))
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

  // 3. (Task 10 inserts the platform spike guard here.)
  out.spike = (await readAiGuardState(db)).state;
  return out;
}
