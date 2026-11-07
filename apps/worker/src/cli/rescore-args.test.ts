import { describe, expect, it } from 'vitest';
import { parseRescoreArgs, RESCORE_USAGE } from './rescore-args';

const ID = '00000000-0000-4000-8000-0000000000a1';

describe('parseRescoreArgs', () => {
  it('defaults to 14 days, all clients, applied', () => {
    expect(parseRescoreArgs([])).toEqual({ sinceDays: 14, dryRun: false });
  });
  it('parses --dry-run, --since-days and a lower-cased --client', () => {
    expect(parseRescoreArgs(['--dry-run'])).toEqual({ sinceDays: 14, dryRun: true });
    expect(parseRescoreArgs(['--since-days', '30', '--client', ID.toUpperCase()])).toEqual({ sinceDays: 30, clientId: ID, dryRun: false });
  });
  it('refuses --since-days 0 / 31 / abc with the usage', () => {
    for (const v of ['0', '31', 'abc', '1.5']) {
      const r = parseRescoreArgs(['--since-days', v]);
      expect(r).toHaveProperty('error');
      expect((r as { error: string }).error.endsWith(RESCORE_USAGE)).toBe(true);
    }
  });
  it('refuses --client that is not a uuid', () => {
    expect(parseRescoreArgs(['--client', 'nope'])).toHaveProperty('error');
  });
  it('refuses unknown flags and positionals', () => {
    expect(parseRescoreArgs(['--bogus'])).toHaveProperty('error');
    expect(parseRescoreArgs(['extra'])).toHaveProperty('error');
  });
});
