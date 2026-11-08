import { describe, expect, it } from 'vitest';
import { META_PAGE_BACKFILL_USAGE, parseMetaPageBackfillArgs } from './meta-page-backfill-args';

const ID = '00000000-0000-4000-8000-0000000000a1';

describe('parseMetaPageBackfillArgs', () => {
  it('defaults to all competitors, applied', () => {
    expect(parseMetaPageBackfillArgs([])).toEqual({ dryRun: false });
  });
  it('parses --dry-run and a lower-cased --competitor', () => {
    expect(parseMetaPageBackfillArgs(['--dry-run'])).toEqual({ dryRun: true });
    expect(parseMetaPageBackfillArgs(['--competitor', ID.toUpperCase()])).toEqual({ competitorId: ID, dryRun: false });
  });
  it('refuses a bad uuid and unknown flags with the usage', () => {
    for (const a of [['--competitor', 'nope'], ['--bogus']]) {
      const r = parseMetaPageBackfillArgs(a);
      expect((r as { error: string }).error.endsWith(META_PAGE_BACKFILL_USAGE)).toBe(true);
    }
  });
});
