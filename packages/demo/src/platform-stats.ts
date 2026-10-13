import { addDays, type AgencyDailyStatInsert, upsertDailyStats, utcDay } from '@cs/tools';
import type { SeedContext } from './context';
import type { Rng } from './random';

/** Phase 8a: how many days of platform history the demo shows (yesterday back). */
export const PLATFORM_STAT_DAYS = 90;

/** 0..1 progress through the window, so each figure trends upward with some noise. */
const grow = (from: number, to: number, t: number, rng: Rng, noise = 0): number => Math.max(0, Math.round(from + (to - from) * t + rng.between(-noise, noise)));

/**
 * Spec § Demo: PLATFORM_STAT_DAYS rows ending yesterday (UTC) for one agency, with a plausible upward trend.
 * Pure and deterministic for a given (rng stream, today): same inputs, same rows.
 */
export function buildPlatformStats(agencyId: string, today: string, rng: Rng): AgencyDailyStatInsert[] {
  const rows: AgencyDailyStatInsert[] = [];
  for (let i = 0; i < PLATFORM_STAT_DAYS; i++) {
    const day = addDays(today, i - PLATFORM_STAT_DAYS);
    const t = i / (PLATFORM_STAT_DAYS - 1);
    const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const monday = weekday === 1;
    rows.push({
      agencyId,
      day,
      clientsActive: t < 0.45 ? 1 : 2,
      clientsProspect: t < 0.7 ? 0 : 1,
      agencySeats: t < 0.3 ? 2 : 3,
      clientSeats: t < 0.45 ? 1 : 2,
      wau: weekend ? grow(1, 2, t, rng) : grow(2, 5, t, rng, 0.8),
      briefsSent: monday ? (t < 0.45 ? 1 : 2) : 0,
      alertsSent: weekend ? 0 : grow(0, 3, t, rng, 1.2),
      prospectReports: t >= 0.7 && rng.chance(0.04) ? 1 : 0,
      askQuestions: weekend ? 0 : grow(0, 9, t, rng, 2),
      mcpCalls: weekend ? 0 : grow(0, 14, t, rng, 3),
      spendUsd: (0.18 + 0.5 * t + rng.between(0, 0.12)).toFixed(4),
      lastActivityAt: new Date(`${day}T${String(rng.int(9, 17)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}:00.000Z`),
    });
  }
  return rows;
}

/**
 * Seeds `agency_daily_stat` for the demo agency. The demo has no second operator-suitable user (the one operator
 * signs in through DEMO_OPERATOR_EMAIL), so no `platform_admin` row is written.
 */
export async function seedPlatformStats(ctx: SeedContext): Promise<void> {
  const rows = buildPlatformStats(ctx.ids.agencyId, utcDay(ctx.clock.now), ctx.rng('platform-stats'));
  await upsertDailyStats(ctx.db, rows);
}
