import { describe, expect, it } from 'vitest';
import { answerProbability, computeDecisionReport, expectedCalibrationError, type LabeledAnswer, questionFamily } from './report';

describe('decision report (spec §7.3 accuracy dashboard)', () => {
  it('groups per-vertical keys into families', () => {
    expect(['service_hvac_plumbing', 'theme_dental__pain', 'other_dental', 'same_2', 'meaningful', 'change_type'].map(questionFamily)).toEqual([
      'service', 'theme', 'other', 'same_offer', 'meaningful', 'change_type',
    ]);
  });

  it('uses the probability a provider gave its own answer, not the 0..1 confidence', () => {
    expect(answerProbability({ type: 'noul', value: false, probability: 0.1, confidence: 0.8 })).toBeCloseTo(0.9);
    expect(answerProbability({ type: 'choice', value: 'promo', probabilities: { promo: 0.7, content: 0.3 }, confidence: 0.4 })).toBeCloseTo(0.7);
    expect(answerProbability({ type: 'score', value: 3, probabilities: { '3': 0.6 }, confidence: 0.6 })).toBeCloseTo(0.6);
    expect(answerProbability({ type: 'choice', value: 'x', confidence: 0.5 })).toBeCloseTo(0.5);
  });

  it('computes ECE over 10 equal-width bins', () => {
    // 10 answers at p=0.95, 5 correct → |0.5 - 0.95| = 0.45
    const items = Array.from({ length: 10 }, (_, i) => ({ probability: 0.95, correct: i < 5 }));
    expect(expectedCalibrationError(items)).toBeCloseTo(0.45);
    expect(expectedCalibrationError([])).toBe(0);
    expect(expectedCalibrationError([{ probability: 1, correct: true }])).toBeCloseTo(0);
  });

  const mk = (sampleId: string, role: LabeledAnswer['role'], provider: string, correct: boolean, key = 'meaningful'): LabeledAnswer => ({
    sampleId, key, task: 'tag_decisions', family: questionFamily(key), role, provider, probability: 0.9, correct,
  });

  it('reports accuracy per task, family, role and provider and notes when the LLM is clearly better on paired answers', () => {
    const items = [
      ...Array.from({ length: 40 }, (_, i) => mk(`s${i}`, 'primary', 'jev', i < 30)), // 75%
      ...Array.from({ length: 40 }, (_, i) => mk(`s${i}`, 'fallback', 'llm', i < 36)), // 90%
      ...Array.from({ length: 40 }, (_, i) => mk(`s${i}`, 'final', 'engine', i < 34)),
    ];
    const rows = computeDecisionReport(items);
    expect(rows.map((r) => [r.role, r.provider, r.n, r.accuracy])).toEqual([
      ['primary', 'jev', 40, 0.75], ['fallback', 'llm', 40, 0.9], ['final', 'engine', 40, 0.85],
    ]);
    expect(rows[0]!.note).toMatch(/LLM is 15 points more accurate on 40 paired labels/);
    expect(rows[1]!.note).toBeNull();
  });

  it('compares only (sample, key) pairs both providers answered, not rows built from different question mixes', () => {
    const items = [
      // Shadow samples: both answer every question, equally well (24/30).
      ...Array.from({ length: 30 }, (_, i) => mk(`shadow${i}`, 'primary', 'jev', i < 24)),
      ...Array.from({ length: 30 }, (_, i) => mk(`shadow${i}`, 'fallback', 'llm', i < 24)),
      // Review samples where only the LLM answered (Jev failed): the fallback row looks far better.
      ...Array.from({ length: 30 }, (_, i) => mk(`review${i}`, 'fallback', 'llm', true)),
    ];
    const rows = computeDecisionReport(items);
    expect(rows.map((r) => [r.role, r.n, r.accuracy])).toEqual([['primary', 30, 0.8], ['fallback', 60, 0.9]]);
    expect(rows.every((r) => r.note === null)).toBe(true);
  });

  it('pairs by sample and question key, so per-vertical keys of one sample are separate pairs', () => {
    const keys = ['service_hvac_plumbing', 'service_dental'];
    const items = Array.from({ length: 15 }, (_, i) =>
      keys.flatMap((k) => [mk(`s${i}`, 'primary', 'jev', i < 12, k), mk(`s${i}`, 'fallback', 'llm', i < 13, k)]),
    ).flat(); // 30 pairs: 80% vs 86.7%
    const [primary] = computeDecisionReport(items);
    expect(primary!.note).toMatch(/LLM is 7 points more accurate on 30 paired labels/);
  });

  it('makes no recommendation below REPORT_MIN_LABELS pairs or REPORT_SWITCH_MARGIN', () => {
    const few = [
      ...Array.from({ length: 29 }, (_, i) => mk(`s${i}`, 'primary', 'jev', false)),
      ...Array.from({ length: 29 }, (_, i) => mk(`s${i}`, 'fallback', 'llm', true)),
    ];
    expect(computeDecisionReport(few).every((r) => r.note === null)).toBe(true);
    const close = [
      ...Array.from({ length: 100 }, (_, i) => mk(`s${i}`, 'primary', 'jev', i < 80)),
      ...Array.from({ length: 100 }, (_, i) => mk(`s${i}`, 'fallback', 'llm', i < 84)), // 4 points
    ];
    expect(computeDecisionReport(close).every((r) => r.note === null)).toBe(true);
    const exact = [
      ...Array.from({ length: 100 }, (_, i) => mk(`s${i}`, 'primary', 'jev', i < 80)),
      ...Array.from({ length: 100 }, (_, i) => mk(`s${i}`, 'fallback', 'llm', i < 85)), // exactly 5 points
    ];
    expect(computeDecisionReport(exact)[0]!.note).toMatch(/5 points more accurate on 100 paired labels/);
  });
});
