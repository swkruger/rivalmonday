import { describe, expect, it } from 'vitest';
import type { Scorecard } from './scorecard';
import type { SelfFinding } from './self-rules';
import { scorecardEvidenceText } from './starting-point';

describe('scorecardEvidenceText', () => {
  it('words a review-topic finding as "Topic ...", never "Theme ..."', () => {
    const finding = { ruleId: 'x', strength: false, score: 1, fact: '', values: { topic: 'response_time', you: 0.1, median: 0.3 }, evidenceIds: [] } as unknown as SelfFinding;
    const text = scorecardEvidenceText({ asOf: '2026-10-15T00:00:00Z', rows: [] } as unknown as Scorecard, [finding]);
    expect(text).toContain('Topic response_time: your share 10%; rival median 30%.');
    expect(text).not.toMatch(/Theme/);
  });
});
