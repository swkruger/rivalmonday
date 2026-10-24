import { describe, expect, it } from 'vitest';
import { hasFigure } from './figures';

describe('hasFigure', () => {
  it('finds numbers, prices, percentages and dates', () => {
    for (const s of ['They charge $89 now.', 'A 15% hike.', 'On 2026-10-22 the page changed.', 'Since Oct 22.', 'Two reviews in 90 days.', '24/7 service.']) expect(hasFigure(s), s).toBe(true);
  });
  it('ignores citation ids, uuids, names like A1, canary tags and leading list markers', () => {
    for (const s of [
      'They added a careers page [ev:11111111-1111-4111-8111-111111111111].', 'Client 00000000-0000-4000-8000-0000000000a1 only.', 'I only see A1 Client CANARY-A1-1.',
      '1. **Smith HVAC** added a careers page', '**2.** Map pack movement', 'Smith HVAC is gaining ground.',
    ]) expect(hasFigure(s), s).toBe(false);
  });
});
