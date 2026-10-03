import { type Db, decisionLabel, decisionSample, type SampleAnswers } from '@cs/db';
import { and, eq, gte } from 'drizzle-orm';

export type ReportRole = 'primary' | 'fallback' | 'final';
export const REPORT_MIN_LABELS = 30;
export const REPORT_SWITCH_MARGIN = 0.05;
const ROLE_ORDER: ReportRole[] = ['primary', 'fallback', 'final'];

export interface LabeledAnswer {
  /** The decision_sample and question key the answer belongs to: primary and fallback answers pair on these. */
  sampleId: string;
  key: string;
  task: string;
  family: string;
  role: ReportRole;
  provider: string;
  /** Probability the provider gave its own answer (calibration input). */
  probability: number;
  correct: boolean;
}

export interface ReportRow {
  task: string;
  family: string;
  role: ReportRole;
  provider: string;
  n: number;
  accuracy: number;
  meanProbability: number;
  ece: number;
  note: string | null;
}

/** Per-vertical question keys share a family so verticals pool their labels. */
export function questionFamily(key: string): string {
  if (key.startsWith('service_')) return 'service';
  if (key.startsWith('theme_')) return 'theme';
  if (key.startsWith('other_')) return 'other';
  if (/^same_\d+$/.test(key)) return 'same_offer';
  return key;
}

type AnyAnswer = { type?: string; value?: unknown; probability?: number; probabilities?: Record<string, number>; confidence?: number };

/** The probability the provider put on the answer it gave (a Noul's `probability` is P(true)). */
export function answerProbability(answer: unknown): number {
  const a = answer as AnyAnswer;
  if (a.type === 'noul' && typeof a.probability === 'number') return a.value === true ? a.probability : 1 - a.probability;
  const p = a.probabilities?.[String(a.value)];
  return typeof p === 'number' ? p : (a.confidence ?? 0);
}

/** Expected calibration error with equal-width probability bins. */
export function expectedCalibrationError(items: { probability: number; correct: boolean }[], bins = 10): number {
  if (items.length === 0) return 0;
  const sum = Array.from({ length: bins }, () => ({ n: 0, p: 0, c: 0 }));
  for (const it of items) {
    const b = sum[Math.min(bins - 1, Math.max(0, Math.floor(it.probability * bins)))]!;
    b.n++;
    b.p += it.probability;
    b.c += it.correct ? 1 : 0;
  }
  return sum.reduce((acc, b) => (b.n === 0 ? acc : acc + (b.n / items.length) * Math.abs(b.c / b.n - b.p / b.n)), 0);
}

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export function computeDecisionReport(items: LabeledAnswer[]): ReportRow[] {
  const groups = new Map<string, LabeledAnswer[]>();
  for (const it of items) {
    const k = `${it.task}\u0000${it.family}\u0000${it.role}\u0000${it.provider}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const rows: ReportRow[] = [...groups.values()].map((g) => ({
    task: g[0]!.task, family: g[0]!.family, role: g[0]!.role, provider: g[0]!.provider, n: g.length,
    accuracy: round(g.filter((x) => x.correct).length / g.length),
    meanProbability: round(g.reduce((s, x) => s + x.probability, 0) / g.length),
    ece: round(expectedCalibrationError(g)),
    note: null,
  }));
  rows.sort((a, b) => a.task.localeCompare(b.task) || a.family.localeCompare(b.family) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.provider.localeCompare(b.provider));
  for (const p of rows.filter((r) => r.role === 'primary')) {
    const pairs = pairedAnswers(items, p);
    const gain = pairs.length === 0 ? 0 : (pairs.filter((x) => x.fallback).length - pairs.filter((x) => x.primary).length) / pairs.length;
    // The epsilon keeps an exact 5-point gap (e.g. 85/100 vs 80/100) from losing to float rounding.
    if (pairs.length >= REPORT_MIN_LABELS && gain >= REPORT_SWITCH_MARGIN - 1e-9) {
      p.note = `LLM is ${Math.round(gain * 100)} points more accurate on ${pairs.length} paired labels — consider routing ${p.task} to llm_decisions in ai.yaml`;
    }
  }
  return rows;
}

/**
 * The (sample, key) questions both this primary provider and a fallback answered, as correctness pairs. The routing
 * note compares only these: the per-role rows are built from different question mixes (a cascade's fallback only
 * answers the keys it was escalated, or everything when the primary failed), so their accuracies are not comparable.
 */
function pairedAnswers(items: LabeledAnswer[], primary: ReportRow): { primary: boolean; fallback: boolean }[] {
  const id = (x: LabeledAnswer) => `${x.sampleId}\u0000${x.key}`;
  const inGroup = (x: LabeledAnswer) => x.task === primary.task && x.family === primary.family;
  const fallback = new Map(items.filter((x) => inGroup(x) && x.role === 'fallback').map((x) => [id(x), x.correct]));
  return items
    .filter((x) => inGroup(x) && x.role === 'primary' && x.provider === primary.provider && fallback.has(id(x)))
    .map((x) => ({ primary: x.correct, fallback: fallback.get(id(x))! }));
}

/** Every labelled question of every sample, once per role that answered it. */
export async function loadLabeledAnswers(db: Db, opts: { task?: string; since?: Date } = {}): Promise<LabeledAnswer[]> {
  const rows = await db
    .select({ s: decisionSample, key: decisionLabel.questionKey, label: decisionLabel.value })
    .from(decisionLabel)
    .innerJoin(decisionSample, eq(decisionSample.id, decisionLabel.sampleId))
    .where(and(opts.task ? eq(decisionSample.task, opts.task) : undefined, opts.since ? gte(decisionSample.createdAt, opts.since) : undefined));
  const out: LabeledAnswer[] = [];
  for (const { s, key, label } of rows) {
    const push = (role: ReportRole, provider: string, answer: unknown) => {
      if (!answer) return;
      out.push({ sampleId: s.id, key, task: s.task, family: questionFamily(key), role, provider, probability: answerProbability(answer), correct: String((answer as AnyAnswer).value) === label });
    };
    const side = (role: ReportRole, sa: SampleAnswers | null) => sa && push(role, sa.provider, sa.answers[key]);
    side('primary', s.primary);
    side('fallback', s.fallback);
    push('final', 'engine', s.final[key]);
  }
  return out;
}

export function formatReport(rows: ReportRow[]): string {
  if (rows.length === 0) return 'No labelled decisions yet. Export samples with `decisions export`, label them, then `decisions import`.';
  const head = 'task                  family          role      provider  n     acc    p̄      ECE';
  const lines = rows.map(
    (r) =>
      `${r.task.padEnd(21)} ${r.family.padEnd(15)} ${r.role.padEnd(9)} ${r.provider.padEnd(9)} ${String(r.n).padEnd(5)} ${r.accuracy.toFixed(3)}  ${r.meanProbability.toFixed(3)}  ${r.ece.toFixed(3)}${r.note ? `\n    → ${r.note}` : ''}`,
  );
  return [head, ...lines].join('\n');
}
