import { describe, expect, it } from 'vitest';
import { parsePurgeArgs } from './purge-args';

describe('parsePurgeArgs', () => {
  it('parses --older-than <n>d and --dry-run', () => {
    expect(parsePurgeArgs(['--older-than', '90d'])).toEqual({ olderThanDays: 90, dryRun: false });
    expect(parsePurgeArgs(['--older-than=30d', '--dry-run'])).toEqual({ olderThanDays: 30, dryRun: true });
  });

  it('refuses --older-than 29d', () => {
    const r = parsePurgeArgs(['--older-than', '29d']);
    expect('error' in r && r.error).toMatch(/at least 30 days/);
  });

  it('rejects bad input with the usage text', () => {
    for (const argv of [[], ['--dry-run'], ['--older-than', '90'], ['--older-than', 'd'], ['--older-than', '-90d'], ['--older-than', '9.5d'], ['--older-than', '90d', 'extra'], ['--older-than', '90d', '--force']]) {
      const r = parsePurgeArgs(argv);
      expect('error' in r, argv.join(' ')).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/Usage:/);
    }
  });
});
