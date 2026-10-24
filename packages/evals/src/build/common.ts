import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DecisionQuestion } from '@cs/ai';
import { redactContactInfo, redactForModel } from '@cs/collectors';
import { buildReviewQuestions, buildTagQuestions } from '@cs/engine';
import { PACKS_DIR, parseVerticalPack, type VerticalPack } from '@cs/verticals';
import { z } from 'zod';
import type { EvalCase } from '../case';

/** Change-suite case input; the label is `Record<questionKey, string>`. */
export interface ChangeInput { state: Record<string, unknown>; verticalIds: string[]; questionKeys: string[] }
/** Review-suite case input; the label is `Record<questionKey, string>`. */
export interface ReviewInput { state: Record<string, unknown>; verticalIds: string[]; questionKeys: string[] }

export const labelInputSchema = z.object({ state: z.record(z.string(), z.unknown()), verticalIds: z.array(z.string()), questionKeys: z.array(z.string()) });

export type LabelSuite = 'changes' | 'reviews';
export const LABEL_SUITES: readonly LabelSuite[] = ['changes', 'reviews'];
/** The production decision task each suite's questions belong to (CSV `task` column). */
export const SUITE_TASK: Record<LabelSuite, string> = { changes: 'tag_decisions', reviews: 'review_decisions' };

/**
 * Eval questions come from the repo's vertical packs (seed topics only), so a case's questions can always be rebuilt
 * from its `verticalIds`. Production reads the DB catalogue (same ids) and adds AM-approved discovered topics.
 */
export const EVAL_VERTICALS = ['dental', 'hvac_plumbing'] as const;
const packCache = new Map<string, VerticalPack>();
export function evalPack(id: string): VerticalPack {
  let p = packCache.get(id);
  if (!p) {
    if (!(EVAL_VERTICALS as readonly string[]).includes(id)) throw new Error(`vertical "${id}" has no eval pack`);
    const file = join(PACKS_DIR, `${id}.yaml`);
    p = parseVerticalPack(readFileSync(file, 'utf8'), file);
    packCache.set(id, p);
  }
  return p;
}
export const isEvalVertical = (id: string) => (EVAL_VERTICALS as readonly string[]).includes(id);

export function questionsFor(suite: LabelSuite, verticalIds: string[]): Record<string, DecisionQuestion> {
  const packs = verticalIds.map(evalPack);
  return suite === 'changes' ? buildTagQuestions(packs) : buildReviewQuestions(packs.map((pack) => ({ pack, topics: pack.topics })));
}

/** Every string leaf through `redactForModel` with the business names (eval data is committed to the repo). */
export function redactDeep<T>(value: T, businessNames: readonly string[]): T {
  if (typeof value === 'string') return redactForModel(value, { businessNames }) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, businessNames)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, businessNames)])) as T;
  return value;
}

/** Every string leaf of a JSON value, with its path. */
export function stringLeaves(value: unknown, path = '$'): { path: string; value: string }[] {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => stringLeaves(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => stringLeaves(v, `${path}.${k}`));
  return [];
}

/**
 * Paths of string leaves that still hold an email address or phone number (detector only: data must already be redacted).
 * The case's own `id` is skipped: it is a builder-made identifier (slug + hex hash), never copied text, and a hex hash
 * can hold a 10-digit run the phone pattern matches (`reviews-csdev-0f78ba5785855770`).
 */
export function contactLeaks(cases: EvalCase[]): string[] {
  return cases.flatMap((c) => {
    const { id: _id, ...rest } = c;
    return stringLeaves(rest, c.id).filter((l) => redactContactInfo(l.value) !== l.value).map((l) => l.path);
  });
}

/** Case id slug: lowercase [a-z0-9-]. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function labelCase(
  suite: LabelSuite,
  id: string,
  source: EvalCase['source'],
  input: ChangeInput | ReviewInput,
  label: Record<string, string> | null = null,
  labelBy: string | null = null,
): EvalCase {
  return { id, suite, source, vertical: input.verticalIds.join('+') || 'none', blocking: false, input, label, labelBy, confirmedAt: null };
}

/** Carry labels from a previous build onto rebuilt cases with the same id and identical input. */
export function carryLabels(previous: EvalCase[], built: EvalCase[]): EvalCase[] {
  const old = new Map(previous.map((c) => [c.id, c]));
  return built.map((c) => {
    const p = old.get(c.id);
    if (!p || p.label === null || JSON.stringify(p.input) !== JSON.stringify(c.input)) return c;
    return { ...c, label: p.label, labelBy: p.labelBy, confirmedAt: p.confirmedAt };
  });
}

export const isLabelSuite = (s: string): s is LabelSuite => (LABEL_SUITES as readonly string[]).includes(s);

/** A changes/reviews case's input, validated; throws naming the case. */
export function labelInputOf(c: EvalCase): ChangeInput & { suite: LabelSuite } {
  if (!isLabelSuite(c.suite)) throw new Error(`case ${c.id}: suite "${c.suite}" has no labels`);
  const parsed = labelInputSchema.safeParse(c.input);
  if (!parsed.success) throw new Error(`case ${c.id}: input is not { state, verticalIds, questionKeys }`);
  return { ...parsed.data, suite: c.suite };
}
