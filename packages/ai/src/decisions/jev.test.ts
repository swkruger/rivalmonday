import { describe, expect, it, vi } from 'vitest';
import { JEV_DEFAULT_MODEL, JEV_OPENROUTER_URL, createJevProvider, mostLikelyLevel } from './jev';
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
    severity: { type: 'score', score: 1.4, legend: { '0': 'minor', '1': 'moderate', '2': 'major' }, probabilities: { '0': 0.1, '1': 0.4, '2': 0.5 }, confidence: 0.5 },
  },
  usage: { input_tokens: 1_000_000, output_tokens: 3, cost: 0.05 },
};

function setup(body: unknown = jevResponse) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  const provider = createJevProvider({ apiKey: 'k', fallbackUsdPerMtok: 0.042, appName: 'RM', appUrl: 'https://rm.test', http: { fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, maxRetries: 0 } });
  return { fetch, provider };
}

describe('Jev provider', () => {
  it('posts to OpenRouter with the pinned model and attribution headers', async () => {
    const { fetch, provider } = setup();
    await provider.decide('s', questions);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/systemone');
    expect(JEV_DEFAULT_MODEL).toBe('typesafe/jev-1.14');
    expect(JSON.parse(init.body as string).model).toBe('typesafe/jev-1.14');
    expect(init.headers).toMatchObject({ authorization: 'Bearer k', 'http-referer': 'https://rm.test', 'x-title': 'RM' });
  });

  it('records usage.cost as costUsd', async () => {
    const r = await setup({ ...jevResponse, usage: { input_tokens: 10, output_tokens: 2, cost: 0.000123 } }).provider.decide('s', questions);
    expect(r.costUsd).toBe(0.000123);
  });

  it('missing usage.cost falls back to the estimate and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { provider } = setup({ ...jevResponse, usage: { input_tokens: 1_000_000, output_tokens: 3 } });
    const a = await provider.decide('s', questions);
    const b = await provider.decide('s', questions);
    expect(a.costUsd).toBeCloseTo(0.042, 9);
    expect(b.costUsd).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe('[ai] jev response had no usage.cost; using the fallback estimate');
    warn.mockRestore();
  });

  it('null / negative usage.cost uses the fallback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const cost of [null, -1]) {
      const r = await setup({ ...jevResponse, usage: { input_tokens: 1_000_000, cost } }).provider.decide('s', questions);
      expect(r.costUsd).toBeCloseTo(0.042, 9);
      expect(r.outputTokens).toBe(0);
    }
    warn.mockRestore();
  });

  it('maps questions to the System One request format', async () => {
    const { fetch, provider } = setup();
    await provider.decide({ before: '$99', after: '$79' }, questions);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_OPENROUTER_URL);
    expect(JEV_OPENROUTER_URL).toBe('https://openrouter.ai/api/v1/systemone');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'typesafe/jev-1.14',
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
    expect(r.answers.severity).toMatchObject({ type: 'score', value: 2, expected: 1.4, confidence: 0.5 });
    expect(r).toMatchObject({ model: 'jev-2026-09', inputTokens: 1_000_000, outputTokens: 3, costUsd: 0.05 });
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

  it('throws when score probabilities name a level outside the question', async () => {
    const bad = { ...jevResponse, answers: { ...jevResponse.answers, severity: { ...jevResponse.answers.severity, probabilities: { '0': 0.2, '3': 0.8 } } } };
    await expect(setup(bad).provider.decide('s', questions)).rejects.toMatchObject({ provider: 'jev', retryable: false });
    await expect(setup(bad).provider.decide('s', questions)).rejects.toThrow(/severity/);
  });

  it('throws when score probabilities are empty', async () => {
    const bad = { ...jevResponse, answers: { ...jevResponse.answers, severity: { ...jevResponse.answers.severity, probabilities: {} } } };
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

describe('mostLikelyLevel', () => {
  it('picks the highest-probability level and breaks ties toward the lower level', () => {
    expect(mostLikelyLevel({ '0': 0, '1': 0.8, '2': 0.2 }, 3)).toBe(1);
    expect(mostLikelyLevel({ '0': 0.5, '1': 0.5 }, 2)).toBe(0);
  });
  it('rejects non-integer, negative or out-of-range keys', () => {
    expect(mostLikelyLevel({ a: 1 }, 3)).toBeNull();
    expect(mostLikelyLevel({ '-1': 1 }, 3)).toBeNull();
    expect(mostLikelyLevel({ '3': 1 }, 3)).toBeNull();
    expect(mostLikelyLevel({}, 3)).toBeNull();
  });
});
