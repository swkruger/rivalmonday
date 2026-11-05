// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { agencyTiersLine, PRICING } from './pricing';

describe('PRICING.agency', () => {
  it('equals STANDARD_V2 (hard-coded: the site cannot import @cs/billing)', () => {
    // Pin against packages/billing/src/pricing.ts STANDARD_V2 and the seed plan. Change both together.
    expect(PRICING.agency).toEqual({
      pilot: 'free',
      monthlyUsd: 229,
      yearlyUsd: 2290,
      seatsIncluded: 3,
      extraClientTiers: [{ toClient: 10, usd: 79 }, { toClient: null, usd: 59 }],
      trialDays: 30,
    });
  });
  it('tier line and no $2,490/yr anywhere on the site price data', () => {
    expect(agencyTiersLine()).toBe('clients 4–10 $79 each, 11+ $59');
    expect(JSON.stringify(PRICING)).not.toContain('2490');
  });
});

describe('terms', () => {
  it('carry the agency-plan fence clause (spec § Copy)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const terms = readFileSync(join(__dirname, 'legal', 'terms.md'), 'utf8');
    expect(terms).toContain(
      'The agency plan is for businesses that provide marketing or related services to other businesses. A business that wants Rival Monday for itself should use a client plan through an agency or our own sign-up.',
    );
  });
});
