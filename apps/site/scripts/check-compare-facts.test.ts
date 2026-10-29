import { describe, expect, it } from 'vitest';
import { RIVALS } from '../content/compare';
import { findStaleFacts, rivalsToCheck } from './check-compare-facts';

const rival = RIVALS[0]!;
const on = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('findStaleFacts', () => {
  it('fails an enabled rival older than 90 days', () => {
    const out = findStaleFacts([rival], on('2027-02-01'));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toContain(rival.slug);
  });
  it('ignores disabled rivals', () => {
    // Only the rivals passed in (the enabled ones) are judged: none enabled passes however old the facts are.
    expect(findStaleFacts([], on('2030-01-01'))).toEqual([]);
  });
  it('passes fresh facts', () => {
    expect(findStaleFacts(RIVALS, on('2026-10-29'))).toEqual([]);
    expect(findStaleFacts(RIVALS, on('2026-10-28'))).toEqual([]);
  });
});

describe('rivalsToCheck', () => {
  it('--all checks every known rival, whatever the env enables', () => {
    expect(rivalsToCheck(['--all']).map((r) => r.slug)).toEqual(RIVALS.map((r) => r.slug));
    expect(rivalsToCheck(['--all'])).toHaveLength(5);
  });
});
