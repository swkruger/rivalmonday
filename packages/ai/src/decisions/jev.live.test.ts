import { describe, expect, it } from 'vitest';
import { createJevProvider } from './jev';

const key = process.env.TYPESAFE_API_KEY;

// Contract test against the real API. Runs only when TYPESAFE_API_KEY is set.
describe.skipIf(!key)('Jev live contract', () => {
  it('answers all three primitives and uses 0-based score levels', async () => {
    const jev = createJevProvider({ apiKey: key as string });
    const r = await jev.decide(
      { before: 'AC tune-up $99', after: 'AC tune-up $79 — this month only' },
      {
        meaningful: { type: 'noul', instructions: 'Is this a meaningful price or offer change?' },
        kind: { type: 'choice', instructions: 'What changed?', options: { price_change: 'Price changed', cosmetic: 'Only wording/layout' } },
        size: { type: 'score', instructions: 'How large is the change for a customer?', levels: ['negligible', 'small', 'large'] },
      },
    );
    expect(r.answers.meaningful.type).toBe('noul');
    expect(r.answers.kind.value).toBe('price_change');
    expect(r.answers.size.value).toBeGreaterThanOrEqual(0);
    expect(r.answers.size.value).toBeLessThanOrEqual(2);
  }, 30_000);
});
