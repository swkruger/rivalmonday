import { describe, expect, it, vi } from 'vitest';
import { createJevProvider } from './jev';
import type { DecisionQuestion } from './types';

const questions = {
  meaningful: { type: 'noul', instructions: 'Is this a meaningful business change?' },
  change_type: { type: 'choice', instructions: 'Classify the change', options: { price_change: 'A price changed', cosmetic: 'Layout only' } },
  severity: { type: 'score', instructions: 'How significant?', levels: ['minor', 'moderate', 'major'] },
} satisfies Record<string, DecisionQuestion>;

const jevResponse = {
  model: 'jev-2026-09',
  answers: {
    meaningful: { type: 'noul', noul: 0.9 },
    change_type: { type: 'choice', choice: 'price_change', probabilities: { price_change: 0.93, cosmetic: 0.07 }, confidence: 0.93 },
    severity: { type: 'score', score: 2, legend: {}, probabilities: { '0': 0.1, '1': 0.2, '2': 0.7 }, confidence: 0.7 },
  },
  usage: { input_tokens: 1_000_000, output_tokens: 3 },
};

function setup(body: unknown = jevResponse) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  const provider = createJevProvider({ apiKey: 'k', http: { fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, maxRetries: 0 } });
  return { fetch, provider };
}

describe('Jev provider', () => {
  it('maps questions to the System One request format', async () => {
    const { fetch, provider } = setup();
    await provider.decide({ before: '$99', after: '$79' }, questions);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'jev-latest',
      state: { before: '$99', after: '$79' },
      questions: {
        meaningful: { type: 'noul', instructions: 'Is this a meaningful business change?' },
        change_type: { type: 'choice', instructions: 'Classify the change', criteria: { price_change: 'A price changed', cosmetic: 'Layout only' } },
        severity: { type: 'score', instructions: 'How significant?', criteria: ['minor', 'moderate', 'major'] },
      },
    });
  });

  it('normalises answers, confidence and cost', async () => {
    const { provider } = setup();
    const r = await provider.decide('state', questions);
    expect(r.answers.meaningful).toEqual({ type: 'noul', value: true, probability: 0.9, confidence: expect.closeTo(0.8, 5) });
    expect(r.answers.change_type).toMatchObject({ type: 'choice', value: 'price_change', confidence: 0.93 });
    expect(r.answers.severity).toMatchObject({ type: 'score', value: 2, confidence: 0.7 });
    expect(r).toMatchObject({ model: 'jev-2026-09', inputTokens: 1_000_000, outputTokens: 3, costUsd: 0.042 });
  });

  it('throws when an answer is missing or has the wrong type', async () => {
    const missing = { ...jevResponse, answers: { meaningful: jevResponse.answers.meaningful } };
    await expect(setup(missing).provider.decide('s', questions)).rejects.toMatchObject({ provider: 'jev', retryable: false });
    const wrong = { ...jevResponse, answers: { ...jevResponse.answers, meaningful: jevResponse.answers.change_type } };
    await expect(setup(wrong).provider.decide('s', questions)).rejects.toThrow(/meaningful/);
  });

  it('throws when a choice is not one of the options', async () => {
    const bad = { ...jevResponse, answers: { ...jevResponse.answers, change_type: { ...jevResponse.answers.change_type, choice: 'other' } } };
    await expect(setup(bad).provider.decide('s', questions)).rejects.toThrow(/change_type/);
  });

  it('throws when a score is out of range for the number of levels', async () => {
    const bad = { ...jevResponse, answers: { ...jevResponse.answers, severity: { ...jevResponse.answers.severity, score: 3 } } };
    await expect(setup(bad).provider.decide('s', questions)).rejects.toMatchObject({ provider: 'jev', retryable: false });
    await expect(setup(bad).provider.decide('s', questions)).rejects.toThrow(/severity/);
  });

  it('validates questions before calling the API', async () => {
    const { fetch, provider } = setup();
    await expect(provider.decide('s', { q: { type: 'score', instructions: 'x', levels: ['only one'] } })).rejects.toThrow(/2-10 levels/);
    const tooMany = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`o${i}`, 'd']));
    await expect(provider.decide('s', { q: { type: 'choice', instructions: 'x', options: tooMany } })).rejects.toThrow(/255/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
