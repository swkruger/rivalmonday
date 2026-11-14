import { describe, expect, it } from 'vitest';
import { namesEqual } from './search';

describe('namesEqual (auto-confirm name rule)', () => {
  it('equal names match', () => {
    expect(namesEqual('Glow Dental Co', 'Glow Dental Co.')).toBe(true);
  });
  it('"of <city>" tail on one side only does not match', () => {
    expect(namesEqual('Aire Serv', 'Aire Serv of Granbury')).toBe(false);
  });
  it('"Brand - City" vs the national brand page does not match', () => {
    expect(namesEqual('Aspen Dental - Granbury', 'Aspen Dental')).toBe(false);
    expect(namesEqual('Aspen Dental', 'Aspen Dental – Granbury')).toBe(false);
  });
  it('same dash tail on both sides matches', () => {
    expect(namesEqual('Aspen Dental - Granbury', 'Aspen Dental - Granbury')).toBe(true);
  });
});
