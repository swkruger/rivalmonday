import { describe, expect, it } from 'vitest';
import { prf, reviewMetrics } from '../decisions';

describe('reviews suite', () => {
  it('topic F1 on a known pair', () => {
    // predicted {a, c}, actual {a, b}: tp 1, fp 1, fn 1 -> P = R = F1 = 0.5
    const t = prf([
      { predicted: true, actual: true },
      { predicted: false, actual: true },
      { predicted: true, actual: false },
      { predicted: false, actual: false },
    ]);
    expect(t).toMatchObject({ precision: 0.5, recall: 0.5, f1: 0.5, tp: 1, fp: 1, fn: 1 });
  });

  it('scores topics on theme_* keys and sentiment MAE on the final answers', () => {
    const ans = (value: unknown) => ({ type: 'x', value, confidence: 1, provider: 'x' });
    const m = reviewMetrics('', [
      {
        id: 'r1',
        label: { sentiment: '4', theme_dental__a: 'true', theme_dental__b: 'false', other_dental: 'true' },
        result: { answers: { sentiment: ans(2), theme_dental__a: ans(true), theme_dental__b: ans(true), other_dental: ans(false) }, needsReview: [] } as never,
      },
    ]);
    expect(m['sentiment.mae']).toBe(2);
    expect(m['topic.precision']).toBe(0.5);
    expect(m['topic.recall']).toBe(1);
    expect(m['topic.n']).toBe(2);
  });
});
