import { describe, expect, it, vi } from 'vitest';
import { JEV_IMAGE_SHAPE, createJevProvider, jevBody } from './jev';
import type { DecisionImage, DecisionQuestion } from './types';

const questions = { meaningful: { type: 'noul', instructions: 'Is this meaningful?' } } satisfies Record<string, DecisionQuestion>;
const jevResponse = {
  model: 'jev-2026-09',
  answers: { meaningful: { type: 'noul', noul: 0.9 } },
  usage: { input_tokens: 10, output_tokens: 3, cost: 0.05 },
};

function setup() {
  const fetch = vi.fn(async () => new Response(JSON.stringify(jevResponse), { status: 200 }));
  const provider = createJevProvider({ apiKey: 'k', fallbackUsdPerMtok: 0.042, appName: 'RM', appUrl: 'https://rm.test', http: { fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, maxRetries: 0 } });
  return { fetch, provider };
}

const png: DecisionImage = { mediaType: 'image/png', data: new Uint8Array([1, 2, 3]), sha256: 'a'.repeat(64) };
const jpg: DecisionImage = { mediaType: 'image/jpeg', data: new Uint8Array([4, 5]), sha256: 'b'.repeat(64) };
const webp: DecisionImage = { mediaType: 'image/webp', data: new Uint8Array([6]), sha256: 'c'.repeat(64) };
const pngUrl = 'data:image/png;base64,AQID';
const qs = { q: { type: 'noul', instructions: 'x' } };
const state = { a: 1 };

describe('jevBody images', () => {
  it('ships state_content (Task 0b)', () => expect(JEV_IMAGE_SHAPE).toBe('state_content'));

  it("jevBody without images equals today's body", () => {
    expect(jevBody('m', state, qs, [])).toEqual({ model: 'm', state, questions: qs });
    expect(Object.keys(jevBody('m', state, qs, []))).toEqual(['model', 'state', 'questions']);
  });

  it('top_level shape', () => {
    expect(jevBody('m', state, qs, [png, jpg], 'top_level')).toEqual({ model: 'm', state, questions: qs, images: [pngUrl, 'data:image/jpeg;base64,BAU='] });
  });
  it('state_content shape', () => {
    expect(jevBody('m', state, qs, [png], 'state_content')).toEqual({
      model: 'm',
      questions: qs,
      state: [{ type: 'text', text: JSON.stringify(state) }, { type: 'image_url', image_url: { url: pngUrl } }],
    });
  });
  it('state_object shape', () => {
    expect(jevBody('m', state, qs, [png], 'state_object')).toEqual({ model: 'm', questions: qs, state: { text: JSON.stringify(state), image: pngUrl } });
  });
  it('null shape + images throws, no request', () => {
    expect(() => jevBody('m', state, qs, [png], null)).toThrow(/Jev does not take images/);
  });
  it('webp image to Jev throws, no request', async () => {
    const { fetch, provider } = setup();
    await expect(provider.decide('s', questions, { images: [webp] })).rejects.toThrow(/PNG or JPEG images only/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('provider sends the shipped shape when images are given', async () => {
    const { fetch, provider } = setup();
    await provider.decide({ a: 1 }, questions, { images: [png] });
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.state).toEqual([{ type: 'text', text: '{"a":1}' }, { type: 'image_url', image_url: { url: pngUrl } }]);
  });
});
