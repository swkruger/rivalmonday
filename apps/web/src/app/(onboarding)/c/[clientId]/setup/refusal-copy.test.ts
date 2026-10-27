import { describe, expect, it } from 'vitest';
import { GENERIC_REFUSAL, refusalCopy } from './refusal-copy';

describe('refusalCopy', () => {
  it('maps run error codes to plain words and never shows the code', () => {
    for (const code of ['internal_error', 'stale', 'cost_cap']) {
      const text = refusalCopy(code)!;
      expect(text).not.toContain(code);
      expect(text).not.toMatch(/_/);
    }
  });
  it('reads an unknown code generically and nothing for no code', () => {
    expect(refusalCopy('something_new')).toBe(GENERIC_REFUSAL);
    expect(refusalCopy(null)).toBeNull();
  });
});
