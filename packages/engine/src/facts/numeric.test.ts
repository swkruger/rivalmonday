import type { Ai } from '@cs/ai';
import { describe, expect, it, vi } from 'vitest';
import { diffFacts, extractFacts, extractNumericFacts, llmFactExtractor, needsLlmFallback } from './numeric';

const pick = (text: string) => extractNumericFacts(text).map((f) => [f.kind, f.value, f.unit]);

describe('extractNumericFacts', () => {
  it.each([
    ['AC Tune-Up only $89', [['price', 89, 'USD']]],
    ['New systems from $1,299.00', [['price', 1299, 'USD']]],
    ['$89 per system, $35/visit', [['price', 89, 'USD/system'], ['price', 35, 'USD/visit']]],
    ['Save 15% on repairs', [['percent', 15, '%']]],
    ['30-day guarantee and 12 months 0% financing', [['duration', 30, 'day'], ['duration', 12, 'month'], ['percent', 0, '%']]],
    ['Offer ends October 31, 2026', [['date', '2026-10-31', 'date']]],
    ['Book by Oct. 5', [['date', '10-05', 'date']]],
    ['Valid through 11/30/26', [['date', '2026-11-30', 'date']]],
    ['Call (972) 555-0100, open 24/7 since 1998', []],
    ['See our market 5 times a year', []],
  ])('%s', (text, expected) => {
    expect(pick(text)).toEqual(expected);
  });

  it('keeps raw text and surrounding context', () => {
    const [f] = extractNumericFacts('Spring special: AC tune-up only $89 this month');
    expect(f).toMatchObject({ raw: '$89', context: expect.stringContaining('AC tune-up only $89') });
  });
});

describe('diffFacts', () => {
  it('pairs a changed price with its percent change', () => {
    const [c] = diffFacts(extractNumericFacts('AC Tune-Up $89'), extractNumericFacts('AC Tune-Up $69'));
    expect(c).toMatchObject({ kind: 'price', before: { value: 89 }, after: { value: 69 }, pct: -22.5 });
  });

  it('reports added and removed facts', () => {
    expect(diffFacts([], extractNumericFacts('Now 20% off')).map((c) => [c.kind, c.before, c.after?.value])).toEqual([['percent', null, 20]]);
    expect(diffFacts(extractNumericFacts('Was $49'), []).map((c) => [c.kind, c.before?.value, c.after])).toEqual([['price', 49, null]]);
  });

  it('ignores reordering of the same values', () => {
    expect(diffFacts(extractNumericFacts('$89 tune-up, $129 repair'), extractNumericFacts('$129 repair, $89 tune-up'))).toEqual([]);
  });

  it('does not pair across units', () => {
    expect(diffFacts(extractNumericFacts('$89'), extractNumericFacts('$89/visit')).map((c) => [c.before?.unit ?? null, c.after?.unit ?? null]).sort())
      .toEqual([['USD', null], [null, 'USD/visit']].sort());
  });
});

describe('LLM fallback', () => {
  it('is needed only for money cues the rules could not parse', () => {
    expect(needsLlmFallback('Tune-ups starting at eighty-nine dollars', [])).toBe(true);
    expect(needsLlmFallback('Call us today', [])).toBe(false);
    expect(needsLlmFallback('Only $89', extractNumericFacts('Only $89'))).toBe(false);
  });

  it('extracts facts through value_extract with redacted input and tolerates bad output', async () => {
    const chat = vi.fn(async () => ({ text: JSON.stringify({ facts: [{ kind: 'price', value: '89', unit: 'USD', raw: 'eighty-nine dollars' }, { kind: 'price', value: 'n/a', unit: 'USD', raw: 'x' }] }), model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0 }));
    const ai = { chat } as unknown as Ai;
    const facts = await extractFacts('Tune-ups starting at eighty-nine dollars, call 972-555-0100', llmFactExtractor(ai, { agencyId: null, clientId: null }));
    expect(facts.map((f) => [f.kind, f.value, f.unit])).toEqual([['price', 89, 'USD']]);
    const call = chat.mock.calls[0] as unknown as [string, { messages: { content: string }[] }];
    expect(call[0]).toBe('value_extract');
    expect(call[1].messages.at(-1)?.content).toContain('[phone]');
    expect(call[1].messages.at(-1)?.content).not.toContain('555-0100');

    const broken = { chat: async () => ({ text: 'not json', model: 'm', inputTokens: 0, outputTokens: 0, costUsd: 0 }) } as unknown as Ai;
    expect(await extractFacts('Tune-ups starting at eighty-nine dollars', llmFactExtractor(broken, { agencyId: null, clientId: null }))).toEqual([]);
  });

  it('propagates a failed model call, so the diff stage fails and is retried instead of inventing "price -> none"', async () => {
    const down = { chat: async () => { throw new Error('down'); } } as unknown as Ai;
    await expect(extractFacts('Prices from seventy dollars', llmFactExtractor(down, { agencyId: null, clientId: null }))).rejects.toThrow('down');
  });
});
