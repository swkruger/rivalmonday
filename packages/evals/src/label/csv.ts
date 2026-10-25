import { allowedValues, type LabelRow, normalizeLabel, parseLabelCsv, toCsv } from '@cs/engine';
import type { EvalCase } from '../case';
import { isLabelSuite, labelInputOf, questionsFor, SUITE_TASK } from '../build/common';

const STATE_CHARS = 2000;

/**
 * Decision 10: the model-ops label CSV (`LABEL_COLUMNS`), one row per question of every unconfirmed changes/reviews case.
 * `primary`, `final` and `label` carry the pre-label, so the owner edits only wrong rows in tools/decision-labeler.html.
 */
export function exportCsv(cases: EvalCase[]): string {
  const rows: LabelRow[] = [];
  for (const c of cases) {
    if (c.confirmedAt !== null || !isLabelSuite(c.suite)) continue;
    const input = labelInputOf(c);
    const questions = questionsFor(input.suite, input.verticalIds);
    const label = (c.label ?? {}) as Record<string, string>;
    const state = JSON.stringify(input.state).slice(0, STATE_CHARS);
    for (const key of input.questionKeys) {
      const q = questions[key];
      if (!q) throw new Error(`case ${c.id}: question "${key}" is not in its verticals' questions (rebuild the suite)`);
      const v = label[key] ?? '';
      rows.push({
        sampleId: c.id, task: SUITE_TASK[input.suite], questionKey: key, questionType: q.type, allowed: allowedValues(q).join('|'), state,
        primary: v, fallback: '', final: v, label: v,
      });
    }
  }
  return toCsv(rows);
}

/**
 * Applies a labeler CSV: every case with a row is confirmed (`labelBy` = by, `confirmedAt` = now) and must end with a value
 * for each of its questions. An unknown sample id, an unknown question or a value outside the allowed set fails the import.
 */
export function importCsv(cases: EvalCase[], csv: string, by: string, now: Date): { cases: EvalCase[]; changed: number; confirmed: number } {
  if (!by.trim()) throw new Error('importCsv: --by <name> is required');
  const byId = new Map(cases.map((c) => [c.id, c]));
  const next = new Map<string, Record<string, string>>();
  for (const row of parseLabelCsv(csv)) {
    const c = byId.get(row.sampleId);
    if (!c) throw new Error(`label CSV: sample id "${row.sampleId}" is not a case of this suite`);
    const input = labelInputOf(c);
    if (!input.questionKeys.includes(row.questionKey)) throw new Error(`label CSV: case ${c.id} has no question "${row.questionKey}"`);
    const q = questionsFor(input.suite, input.verticalIds)[row.questionKey];
    const value = normalizeLabel(q, row.label);
    if (value === null) throw new Error(`label CSV: ${c.id}/${row.questionKey}: "${row.label}" is not one of ${allowedValues(q).join('|')}`);
    next.set(c.id, { ...((c.label ?? {}) as Record<string, string>), ...next.get(c.id), [row.questionKey]: value });
  }
  // Distinct (case, question) pairs whose final value differs: a duplicated CSV row counts once.
  let changed = 0;
  for (const [id, label] of next) {
    const before = (byId.get(id)!.label ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(label)) if (before[k] !== v) changed++;
    const missing = labelInputOf(byId.get(id)!).questionKeys.filter((k) => label[k] === undefined);
    if (missing.length > 0) throw new Error(`label CSV: case ${id} has no label for ${missing.join(', ')}`);
  }
  const confirmedAt = now.toISOString();
  return {
    cases: cases.map((c) => (next.has(c.id) ? { ...c, label: next.get(c.id)!, labelBy: by.trim(), confirmedAt } : c)),
    changed,
    confirmed: next.size,
  };
}
