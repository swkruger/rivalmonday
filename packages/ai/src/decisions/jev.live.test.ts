import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createJevProvider } from './jev';

const key = process.env.OPENROUTER_API_KEY;

// Contract test against the real API. Runs only when OPENROUTER_API_KEY is set.
describe.skipIf(!key)('Jev live contract', () => {
  it('answers all three primitives; score maps to an integer 0-based level', async () => {
    const jev = createJevProvider({ apiKey: key as string, fallbackUsdPerMtok: 0.042, appName: 'RivalMonday-live-test', appUrl: 'http://localhost:3000' });
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
    expect(Number.isInteger(r.answers.size.value)).toBe(true);
    expect(r.answers.size.value).toBeGreaterThanOrEqual(0);
    expect(r.answers.size.value).toBeLessThanOrEqual(2);
    expect(r.answers.size.type === 'score' && typeof r.answers.size.expected).toBe('number');
  }, 30_000);
});

// Opt-in on top of the key: sends a real image (about $0.0001). JEV_LIVE_IMAGES=1 vitest run src/decisions/jev.live -t "price image"
describe.skipIf(!key || process.env.JEV_LIVE_IMAGES !== '1')('Jev live contract (images)', () => {
  it('reads a price image passed as an image_url content part (state_content)', async () => {
    const data = new Uint8Array(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'price-89.jpg')));
    const jev = createJevProvider({ apiKey: key as string, fallbackUsdPerMtok: 0.042, appName: 'RivalMonday-live-test', appUrl: 'http://localhost:3000' });
    const r = await jev.decide(
      { competitor: 'Example HVAC', ad_title: '' },
      {
        shows_price: {
          type: 'noul',
          instructions: 'The image shows a money amount as the price of a service, such as "$89" or "from $49". A percentage, the word "free", or a discount amount alone (such as "$50 off") is not a price.',
        },
      },
      { images: [{ mediaType: 'image/jpeg', data, sha256: '0'.repeat(64) }] },
    );
    const a = r.answers.shows_price;
    console.log('[jev-live-image]', JSON.stringify({ answer: a, model: r.model, inputTokens: r.inputTokens, costUsd: r.costUsd }));
    expect(a.type === 'noul' && a.probability).toBeGreaterThanOrEqual(0.85);
  }, 30_000);
});
