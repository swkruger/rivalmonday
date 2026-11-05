import { GLOSSARY } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { describeTiers, STANDARD_V2 } from './pricing';

const usd = (cents: number) => `$${cents / 100}`;

describe('glossary seat text', () => {
  it('states the standard v2 plan figures', () => {
    const long = GLOSSARY.find((t) => t.id === 'seat')!.long;
    const [first, second] = describeTiers(STANDARD_V2.includedSeats, STANDARD_V2.seatTiers);
    expect(long).toContain(`includes ${STANDARD_V2.includedSeats} active clients`);
    expect(long).toContain(`Clients ${first!.fromClient}\u2013${first!.toClient} cost ${usd(first!.unitCents)}`);
    expect(long).toContain(`clients ${second!.fromClient} and up ${usd(second!.unitCents)}`);
    expect(long).not.toContain('$229');
  });
});
