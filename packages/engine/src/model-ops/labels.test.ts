import { decisionLabel, decisionSample } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { exportUnlabeled, importLabels, parseCsv, parseLabelCsv, toCsv } from './labels';
import { loadLabeledAnswers } from './report';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(() => truncateAll(dbs.owner));

const QUESTIONS = {
  meaningful: { type: 'noul', instructions: 'Matters?' },
  change_type: { type: 'choice', instructions: 'Kind?', options: { promo: 'p', content: 'c' } },
};
async function sample() {
  const [s] = await dbs.service
    .insert(decisionSample)
    .values({
      task: 'tag_decisions', reason: 'shadow', state: { after: 'Spring "special", $79' }, questions: QUESTIONS,
      primary: { provider: 'jev', answers: { meaningful: { type: 'noul', value: true, probability: 0.9, confidence: 0.8 }, change_type: { type: 'choice', value: 'content', probabilities: { content: 0.6 }, confidence: 0.6 } } },
      fallback: { provider: 'llm', answers: { meaningful: { type: 'noul', value: true, probability: 0.95, confidence: 0.9 }, change_type: { type: 'choice', value: 'promo', probabilities: { promo: 0.9 }, confidence: 0.9 } } },
      final: { meaningful: { type: 'noul', value: true, probability: 0.9, confidence: 0.8, provider: 'jev' }, change_type: { type: 'choice', value: 'promo', probabilities: { promo: 0.9 }, confidence: 0.9, provider: 'llm' } },
    })
    .returning({ id: decisionSample.id });
  return s!.id;
}

describe('gold labels', () => {
  it('round-trips through CSV with quotes, commas and newlines intact', () => {
    const csv = 'a,b\n"x, ""y""","line1\nline2"\n';
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']]);
  });

  it('exports one row per unlabelled question and imports the filled-in labels', async () => {
    const id = await sample();
    const rows = await exportUnlabeled(dbs.service, { limit: 10 });
    expect(rows.map((r) => [r.questionKey, r.allowed, r.primary, r.fallback])).toEqual([
      ['meaningful', 'true|false', 'true', 'true'], ['change_type', 'promo|content', 'content', 'promo'],
    ]);
    const filled = toCsv(rows.map((r) => ({ ...r, label: r.questionKey === 'meaningful' ? 'yes' : 'promo' })));
    const r = await importLabels(dbs.service, parseLabelCsv(filled), { labeledBy: 'owner' });
    expect(r).toEqual({ imported: 2, errors: [] });
    expect((await dbs.owner.select().from(decisionLabel)).map((l) => [l.questionKey, l.value, l.source]).sort()).toEqual([['change_type', 'promo', 'human'], ['meaningful', 'true', 'human']]);
    expect(await exportUnlabeled(dbs.service, { limit: 10 })).toEqual([]);
    expect(id).toBeTruthy();
  });

  it('rejects labels for unknown questions or values outside the question', async () => {
    const id = await sample();
    const r = await importLabels(dbs.service, [
      { sampleId: id, questionKey: 'change_type', label: 'banana' },
      { sampleId: id, questionKey: 'nope', label: 'true' },
      { sampleId: '00000000-0000-4000-8000-000000000999', questionKey: 'meaningful', label: 'true' },
    ], { labeledBy: 'owner' });
    expect(r.imported).toBe(0);
    expect(r.errors).toHaveLength(3);
  });

  it('feeds the report: Jev wrong, LLM and the engine right on change_type', async () => {
    const id = await sample();
    await importLabels(dbs.service, [{ sampleId: id, questionKey: 'change_type', label: 'promo' }], { labeledBy: 'owner' });
    const answers = await loadLabeledAnswers(dbs.service);
    expect(answers.map((a) => [a.role, a.provider, a.correct])).toEqual([['primary', 'jev', false], ['fallback', 'llm', true], ['final', 'engine', true]]);
  });

  it('rejects mis-dashed 36-char UUID and reports error per-item, not as DB error', async () => {
    const id = await sample();
    const r = await importLabels(dbs.service, [
      { sampleId: '0000000000-00-4000-8000-000000000999', questionKey: 'meaningful', label: 'true' },
      { sampleId: id, questionKey: 'meaningful', label: 'yes' },
    ], { labeledBy: 'owner' });
    expect(r.imported).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/no such sample/);
    expect((await dbs.owner.select().from(decisionLabel)).length).toBe(1);
  });
});
