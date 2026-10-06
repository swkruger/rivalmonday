import { changeEvent, clientCompetitor, competitor, eventScore, move, type Tx } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

export interface PressureSignal {
  weight: number;
  label: string;
}
export type PressureLevel = 'low' | 'elevated' | 'high';
export interface Pressure {
  score: number;
  level: PressureLevel;
  reasons: string[];
}
export interface CompetitorPressure {
  competitorId: string;
  name: string;
  pressure: Pressure;
}

export const PRESSURE_WINDOW_DAYS = 30;
export const MOVE_LABELS: Record<string, string> = {
  territory_expansion: 'Territory expansion', price_war: 'Price war', new_service_line: 'New service line', hiring_push: 'Hiring push',
  promo_blitz: 'Promo blitz', reputation_slump: 'Reputation slump', ad_surge: 'Ad surge',
};
const MOVE_STATUS_WEIGHT: Record<string, number> = { active: 0.8, emerging: 0.5, fading: 0.3 };

export const moveWeight = (status: string, confidence: number): number => (MOVE_STATUS_WEIGHT[status] ?? 0) * confidence;

/** Decision 10: noisy-OR of 0..1 signals → 0..100; never stored. */
export function combinePressure(signals: PressureSignal[]): Pressure {
  const live = signals.filter((s) => s.weight > 0).map((s) => ({ ...s, weight: Math.min(1, s.weight) }));
  const score = Math.round(100 * (1 - live.reduce((p, s) => p * (1 - s.weight), 1)));
  const reasons: string[] = [];
  for (const s of [...live].sort((a, b) => b.weight - a.weight)) {
    if (!reasons.includes(s.label)) reasons.push(s.label);
    if (reasons.length === 2) break;
  }
  return { score, level: score >= 70 ? 'high' : score >= 40 ? 'elevated' : 'low', reasons: reasons.length ? reasons : ['Quiet'] };
}

/** Pressure per tracked competitor of each client (decision 10), strongest first. Run inside `withTenant`. */
export async function pressureByClient(tx: Tx, clientIds: string[], now: Date): Promise<Map<string, CompetitorPressure[]>> {
  const out = new Map<string, CompetitorPressure[]>();
  if (clientIds.length === 0) return out;
  const since = new Date(now.getTime() - PRESSURE_WINDOW_DAYS * 86_400_000);
  const [links, events, moves] = await Promise.all([
    tx.select({ clientId: clientCompetitor.clientId, competitorId: competitor.id, name: competitor.name }).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId)).where(inArray(clientCompetitor.clientId, clientIds)),
    tx.select({ clientId: eventScore.clientId, competitorId: changeEvent.competitorId, changeType: changeEvent.changeType, score: eventScore.score })
      .from(eventScore).innerJoin(changeEvent, eq(changeEvent.id, eventScore.eventId))
      .where(and(inArray(eventScore.clientId, clientIds), inArray(eventScore.route, ['alert', 'brief']), gte(eventScore.scoredAt, since), isNull(changeEvent.retractedAt))),
    tx.select({ clientId: move.clientId, competitorId: move.competitorId, moveType: move.moveType, status: move.status, confidence: move.confidence })
      .from(move).where(and(inArray(move.clientId, clientIds), isNull(move.closedAt))),
  ]);
  const key = (c: string, k: string) => `${c}|${k}`;
  const signals = new Map<string, PressureSignal[]>();
  const push = (k: string, s: PressureSignal) => signals.set(k, [...(signals.get(k) ?? []), s]);
  for (const e of events) push(key(e.clientId, e.competitorId), { weight: e.score / 100, label: changeTypeLabel(e.changeType) });
  for (const m of moves) push(key(m.clientId, m.competitorId), { weight: moveWeight(m.status, m.confidence), label: MOVE_LABELS[m.moveType] ?? m.moveType });
  for (const l of links) {
    const list = out.get(l.clientId) ?? [];
    list.push({ competitorId: l.competitorId, name: l.name, pressure: combinePressure(signals.get(key(l.clientId, l.competitorId)) ?? []) });
    out.set(l.clientId, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.pressure.score - a.pressure.score);
  return out;
}
