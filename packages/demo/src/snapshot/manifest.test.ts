import { describe, expect, it } from 'vitest';
import { compareCounts, parseManifest, type SnapshotManifest, stampOf } from './manifest';

const good: SnapshotManifest = {
  version: 1, createdAt: '2026-10-09T14:03:22.000Z', sourceDatabase: 'cs_dev', serverVersion: '18.6', lastMigration: '0037_agency_ops_rls',
  tables: { 'public.agency': 1, 'auth.user': 3 }, evidence: { files: 33, bytes: 964_000 },
};

describe('manifest (spec §6.1 step 4)', () => {
  it('accepts the documented shape and nothing that carries a URL', () => {
    expect(parseManifest(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(() => parseManifest({ ...good, version: 2 })).toThrow();
    expect(() => parseManifest({ ...good, url: 'postgresql://x' })).toThrow();
  });

  it('stamps folders in UTC as YYYYMMDD-HHMMSS', () => {
    expect(stampOf(new Date('2026-10-09T14:03:22.123Z'))).toBe('20261009-140322');
  });

  it('lists every row-count difference', () => {
    expect(compareCounts({ 'public.a': 2, 'public.b': 1 }, { 'public.a': 2, 'public.b': 0, 'public.c': 5 })).toEqual([
      'public.b: expected 1, got 0',
      'public.c: not in the snapshot (5 rows)',
    ]);
    expect(compareCounts({ 'public.a': 1 }, {})).toEqual(['public.a: missing after restore (expected 1)']);
  });
});
