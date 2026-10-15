import { describe, expect, it } from 'vitest';
import { detectChains } from './chain';
import { candidates } from './test/helpers';

describe('detectChains', () => {
  it('Aspen Dental detected as chain', () => {
    const chains = detectChains(candidates());
    expect(chains.has('aspen dental')).toBe(true);
    expect(chains.has('granbury dental center')).toBe(false);
  });
  it('needs 3 distinct placeIds', () => {
    const raw = [{ name: 'X Dental', placeId: '1' }, { name: 'X Dental', placeId: '1' }, { name: 'X Dental', placeId: '2' }];
    expect(detectChains(raw).size).toBe(0);
  });
});
