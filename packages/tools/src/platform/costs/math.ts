/** Pure cost maths (all month logic is UTC). No DB, no clock: callers pass `now`. */

export interface SnapPoint {
  takenAt: Date;
  status: 'ok' | 'error' | 'unavailable';
  amountUsd: number | null;
  capUsd: number | null;
}

export interface ManualItem {
  kind: 'recurring' | 'one_off';
  amountUsd: number;
  period: 'monthly' | 'yearly' | null;
  startsOn: string;
  endsOn: string | null;
  archivedAt: Date | null;
}

export type ServiceStatus = 'ok' | 'low' | 'error' | 'unavailable' | 'not_configured' | 'disabled';

const DAY_MS = 86_400_000;

type OkPoint = SnapPoint & { amountUsd: number };

function okPoints(points: SnapPoint[]): OkPoint[] {
  return points
    .filter((p): p is OkPoint => p.status === 'ok' && p.amountUsd != null)
    .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
}

function sumDrops(sorted: OkPoint[]): number {
  let drops = 0;
  for (let i = 1; i < sorted.length; i++) {
    drops += Math.max(0, sorted[i - 1]!.amountUsd - sorted[i]!.amountUsd);
  }
  return drops;
}

/** USD/day from balance drops over the last 14 days; top-ups (rises) are ignored. */
export function burnRate(points: SnapPoint[], now: Date): number | null {
  const from = now.getTime() - 14 * DAY_MS;
  const pts = okPoints(points).filter((p) => p.takenAt.getTime() > from && p.takenAt.getTime() <= now.getTime());
  if (pts.length < 2) return null;
  const span = (pts[pts.length - 1]!.takenAt.getTime() - pts[0]!.takenAt.getTime()) / DAY_MS;
  if (span < 0.5) return null;
  const drops = sumDrops(pts);
  if (drops === 0) return null;
  return drops / span;
}

export function daysLeft(balanceUsd: number, rate: number | null): number | null {
  if (rate == null || rate <= 0) return null;
  return Math.floor(balanceUsd / rate);
}

export function serviceStatus(args: {
  enabled: boolean;
  configured: boolean;
  kind: 'balance' | 'usage';
  latest: SnapPoint | null;
  lowThresholdUsd: number | null;
  warnDays: number;
  rate: number | null;
}): ServiceStatus {
  const { enabled, configured, kind, latest, lowThresholdUsd, warnDays, rate } = args;
  if (!enabled) return 'disabled';
  if (!configured) return 'not_configured';
  if (!latest) return 'not_configured';
  if (latest.status === 'error') return 'error';
  if (latest.status === 'unavailable') return 'unavailable';
  const amount = latest.amountUsd;
  let remaining: number | null;
  if (kind === 'balance') remaining = amount;
  else remaining = latest.capUsd != null && amount != null ? latest.capUsd - amount : null;
  if (remaining == null) return 'ok';
  const dl = kind === 'balance' ? daysLeft(remaining, rate) : null;
  if ((lowThresholdUsd != null && remaining < lowThresholdUsd) || (dl != null && dl <= warnDays)) return 'low';
  return 'ok';
}

function monthBounds(month: string): { start: number; end: number } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1) };
}

export function monthlySpend(kind: 'balance' | 'usage', points: SnapPoint[], month: string): number {
  const { start, end } = monthBounds(month);
  const pts = okPoints(points).filter((p) => p.takenAt.getTime() >= start && p.takenAt.getTime() < end);
  if (pts.length === 0) return 0;
  if (kind === 'usage') return pts[pts.length - 1]!.amountUsd;
  return pts.length < 2 ? 0 : sumDrops(pts);
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Archiving hides an item and, for recurring items, ends it: the effective end is min(endsOn, UTC date of archivedAt),
 * so the archive month still counts but later months do not. An effective end before startsOn counts nowhere.
 * One-off items always count in their own month.
 */
export function manualMonthly(items: ManualItem[], month: string): number {
  const { start, end } = monthBounds(month);
  const monthStart = ymd(start);
  const monthEnd = ymd(end - DAY_MS);
  let total = 0;
  for (const it of items) {
    if (it.kind === 'recurring') {
      const archivedOn = it.archivedAt ? it.archivedAt.toISOString().slice(0, 10) : null;
      const effEnd = it.endsOn != null && archivedOn != null ? (it.endsOn < archivedOn ? it.endsOn : archivedOn) : (it.endsOn ?? archivedOn);
      if (effEnd != null && effEnd < it.startsOn) continue;
      if (it.startsOn <= monthEnd && (effEnd == null || effEnd >= monthStart)) {
        total += it.period === 'yearly' ? it.amountUsd / 12 : it.amountUsd;
      }
    } else if (it.startsOn >= monthStart && it.startsOn <= monthEnd) {
      total += it.amountUsd;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Oldest → newest, UTC, includes the current month. */
export function monthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }
  return keys;
}
