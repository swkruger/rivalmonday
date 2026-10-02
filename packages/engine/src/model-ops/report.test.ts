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

  it('reports accuracy per task, family, role and provider and notes when the LLM is clearly better', () => {
    const mk = (role: LabeledAnswer['role'], provider: string, correct: boolean): LabeledAnswer => ({ task: 'tag_decisions', family: 'meaningful', role, provider, probability: 0.9, correct });
    const items = [
      ...Array.from({ length: 40 }, (_, i) => mk('primary', 'jev', i < 30)), // 75%
      ...Array.from({ length: 40 }, (_, i) => mk('fallback', 'llm', i < 36)), // 90%
      ...Array.from({ length: 40 }, (_, i) => mk('final', 'engine', i < 34)),
    ];
    const rows = computeDecisionReport(items);
    expect(rows.map((r) => [r.role, r.provider, r.n, r.accuracy])).toEqual([
      ['primary', 'jev', 40, 0.75], ['fallback', 'llm', 40, 0.9], ['final', 'engine', 40, 0.85],
    ]);
    expect(rows[0]!.note).toMatch(/LLM is 15 points more accurate on 40 labels/);
    expect(rows[1]!.note).toBeNull();
  });

  it('makes no recommendation below REPORT_MIN_LABELS', () => {
    const items: LabeledAnswer[] = [
      ...Array.from({ length: 10 }, () => ({ task: 't', family: 'f', role: 'primary' as const, provider: 'jev', probability: 0.9, correct: false })),
      ...Array.from({ length: 10 }, () => ({ task: 't', family: 'f', role: 'fallback' as const, provider: 'llm', probability: 0.9, correct: true })),
    ];
    expect(computeDecisionReport(items).every((r) => r.note === null)).toBe(true);
  });
});
