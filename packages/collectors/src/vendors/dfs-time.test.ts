import { describe, expect, it } from 'vitest';
import { parseDfsTimestamp } from './dfs-time';

describe('parseDfsTimestamp', () => {
  it.each([
    ['2026-09-22 14:05:00 +00:00', '2026-09-22T14:05:00.000Z'],
    ['2026-09-22T14:05:00Z', '2026-09-22T14:05:00.000Z'],
    [1790000000, new Date(1790000000 * 1000).toISOString()],
  ])('%s', (input, iso) => expect(parseDfsTimestamp(input)?.toISOString()).toBe(iso));
  it.each([null, undefined, '', 'yesterday', {}])('returns null for %j', (v) => expect(parseDfsTimestamp(v)).toBeNull());
});
