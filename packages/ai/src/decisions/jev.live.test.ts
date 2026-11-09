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

  it('reads a synthetic JPEG passed as an image_url content part (state_content)', async () => {
    // Smallest valid 1x1 JPEG; Jev only has to accept the request shape and answer.
    const jpeg = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
    const jev = createJevProvider({ apiKey: key as string, fallbackUsdPerMtok: 0.042, appName: 'RivalMonday-live-test', appUrl: 'http://localhost:3000' });
    const r = await jev.decide(
      { note: 'An advertisement image is attached.' },
      { has_price: { type: 'noul', instructions: 'Does the attached image show a price?' } },
      { images: [{ mediaType: 'image/jpeg', data: jpeg, sha256: '0'.repeat(64) }] },
    );
    expect(r.answers.has_price.type).toBe('noul');
  }, 30_000);
});
