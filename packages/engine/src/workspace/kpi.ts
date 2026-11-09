import { gbpSummary } from '@cs/collectors';
import { changeEvent, clientCompetitor, type Db, eventScore, type NumericChange, observation, type Tx } from '@cs/db';
import { and, desc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm';
import { adWeeklySeries } from './ads';
import { clientEvents, eventJoin } from './scope';

const DAY = 86_400_000;
/** Weekly trend length of the overview KPIs (and the weekly report's KPI strip). */
export const TREND_WEEKS = 8;

/** A price fact that went down (numeric before and after). */
export const isPriceCut = (f: NumericChange): boolean =>
  f.kind === 'price' && typeof f.before?.value === 'number' && typeof f.after?.value === 'number' && f.after.value < f.before.value;

/** Sum of the given points, or null when every point is null (decision 12). */
export const sumPoints = (points: (number | null)[]): number | null =>
  points.every((p) => p === null) ? null : points.reduce<number>((s, p) => s + (p ?? 0), 0);

/** Week slot of `at` (0 = oldest, `weeks - 1` = the week ending at `now`). A row stamped after `now` (database clock, or
 * written mid-request) belongs in the latest window. */
export const weekIndex = (now: Date, at: Date, weeks: number): number =>
  Math.min(weeks - 1, weeks - 1 - Math.floor((now.getTime() - at.getTime()) / (7 * DAY)));

/** Rows per week slot, oldest → newest; rows older than the window are skipped. */
export function weeklyCounts(rows: { scoredAt: Date }[], now: Date, weeks: number): number[] {
  const out = Array<number>(weeks).fill(0);
  for (const r of rows) {
    const i = weekIndex(now, r.scoredAt, weeks);
    if (i >= 0) out[i]! += 1;
  }
  return out;
}

export interface KpiEventRows {
  counts: { changes: number; alerts: number } | undefined;
  priceRows: { scoredAt: Date; services: Record<string, string | null>; facts: NumericChange[] }[];
  routedRows: { scoredAt: Date }[];
}

/**
 * The event reads of the workspace KPIs (decisions 3 and 12) for one client: run inside `withTenant`, or on the service DB
 * (every read is filtered by `clientId`). `until`: also drop rows scored after it (the weekly report at `asOf`); the
 * overview leaves it unset so a row stamped after `now` lands in the latest window.
 */
export async function kpiEventReads(tx: Tx | Db, clientId: string, now: Date, until?: Date): Promise<KpiEventRows> {
  const since = new Date(now.getTime() - 7 * DAY);
  const trendSince = new Date(now.getTime() - TREND_WEEKS * 7 * DAY);
  const upTo: SQL[] = until ? [lte(eventScore.scoredAt, until)] : [];
  const [[counts], priceRows, routedRows] = await Promise.all([
    tx.select({
      changes: sql<number>`count(*) FILTER (WHERE ${eventScore.route} IN ('alert', 'brief'))::int`,
      alerts: sql<number>`count(*) FILTER (WHERE ${eventScore.route} = 'alert')::int`,
    }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
      .where(and(clientEvents(clientId), gte(eventScore.scoredAt, since), ...upTo)),
    // Decision 12: price moves count on every route.
    tx.select({ scoredAt: eventScore.scoredAt, services: changeEvent.services, facts: changeEvent.facts }).from(eventScore).innerJoin(changeEvent, eventJoin.change)
      .innerJoin(clientCompetitor, eventJoin.tracked)
      .where(and(clientEvents(clientId), gte(eventScore.scoredAt, trendSince), eq(changeEvent.changeType, 'price_change'), ...upTo)),
    tx.select({ scoredAt: eventScore.scoredAt }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
      .where(and(clientEvents(clientId), gte(eventScore.scoredAt, trendSince), inArray(eventScore.route, ['alert', 'brief']), ...upTo)),
  ]);
  return { counts, priceRows, routedRows };
}

export interface KpiGlobalRows {
  ads: Map<string, (number | null)[]>;
  gbp: { competitorId: string; data: Record<string, unknown> }[];
}

/**
 * The global reads of the workspace KPIs (`ad`, `capture`, `observation`): weekly ad counts of the tracked competitors and
 * the newest GBP profile of each business. Callers prove visibility of the ids (RLS reads, or the client's own links).
 * `until`: only profiles observed at or before it.
 */
export async function kpiGlobalReads(db: Db, trackedIds: string[], selfCompetitorId: string | null, now: Date, until?: Date): Promise<KpiGlobalRows> {
  const ratingIds = [...trackedIds, ...(selfCompetitorId ? [selfCompetitorId] : [])];
  // Launch-gate 6a: the two global reads are independent; one stage.
  const [ads, gbp] = await Promise.all([
    adWeeklySeries(db, trackedIds, now, TREND_WEEKS),
    ratingIds.length === 0 ? Promise.resolve([]) : db.selectDistinctOn([observation.competitorId], { competitorId: observation.competitorId, data: observation.data })
      .from(observation)
      .where(and(inArray(observation.competitorId, ratingIds), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile'), ...(until ? [lte(observation.observedAt, until)] : [])))
      .orderBy(observation.competitorId, desc(observation.observedAt)),
  ]);
  return { ads, gbp };
}

export interface WorkspaceKpis {
  changes7d: number;
  alerts7d: number;
  priceMoves7d: number;
  priceCuts7d: number;
  activeAds: number | null;
  activeAds7dAgo: number | null;
  ratingSelf: number | null;
  ratingAvg: number | null;
  weekly: { changes: number[]; priceMoves: number[]; activeAds: (number | null)[] };
}

/** The workspace KPI figures from the reads above (pure). One computation for `get_workspace_overview` and the weekly report. */
export function workspaceKpis(
  c: { verticalId: string; services: string[]; selfCompetitorId: string | null },
  trackedIds: string[],
  events: KpiEventRows,
  globals: KpiGlobalRows,
  now: Date,
): WorkspaceKpis {
  const since = new Date(now.getTime() - 7 * DAY);
  const allPriceMoves = events.priceRows.filter((r) => {
    const service = r.services?.[c.verticalId];
    return !!service && c.services.includes(service);
  });
  const priceMoves = allPriceMoves.filter((r) => r.scoredAt >= since);
  const adTotals = Array.from({ length: TREND_WEEKS }, (_, w) => sumPoints(trackedIds.map((id) => globals.ads.get(id)?.[w] ?? null)));
  const ratingOf = (id: string) => gbpSummary(globals.gbp.find((g) => g.competitorId === id)?.data ?? null)?.rating ?? null;
  const ratings = trackedIds.map(ratingOf).filter((r): r is number => r !== null);
  return {
    changes7d: Number(events.counts?.changes ?? 0),
    alerts7d: Number(events.counts?.alerts ?? 0),
    priceMoves7d: priceMoves.length,
    priceCuts7d: priceMoves.filter((r) => (r.facts ?? []).some(isPriceCut)).length,
    activeAds: adTotals[TREND_WEEKS - 1]!,
    activeAds7dAgo: adTotals[TREND_WEEKS - 2]!,
    ratingSelf: c.selfCompetitorId ? ratingOf(c.selfCompetitorId) : null,
    ratingAvg: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
    weekly: { changes: weeklyCounts(events.routedRows, now, TREND_WEEKS), priceMoves: weeklyCounts(allPriceMoves, now, TREND_WEEKS), activeAds: adTotals },
  };
}
