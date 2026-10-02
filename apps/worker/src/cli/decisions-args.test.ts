import { describe, expect, it } from 'vitest';
import { parseDecisionsArgs } from './decisions-args';

const ID = '00000000-0000-4000-8000-000000000001';

describe('parseDecisionsArgs', () => {
  it('parses each command', () => {
    expect(parseDecisionsArgs(['report', '--task', 'tag_decisions', '--since', '2026-10-01'])).toEqual({ cmd: 'report', task: 'tag_decisions', since: new Date('2026-10-01T00:00:00Z') });
    expect(parseDecisionsArgs(['export', '--out', 'labels.csv'])).toEqual({ cmd: 'export', out: 'labels.csv', limit: 200 });
    expect(parseDecisionsArgs(['import', '--in', 'labels.csv', '--by', 'owner'])).toEqual({ cmd: 'import', in: 'labels.csv', by: 'owner' });
    expect(parseDecisionsArgs(['reviews', '--limit', '5'])).toEqual({ cmd: 'reviews', limit: 5 });
    expect(parseDecisionsArgs(['resolve', ID, '--by', 'am', '--answer', 'meaningful=false', '--answer', 'service_hvac_plumbing=duct_cleaning'])).toEqual({
      cmd: 'resolve', reviewId: ID, by: 'am', answers: { meaningful: false, service_hvac_plumbing: 'duct_cleaning' },
    });
  });

  it('rejects bad input with the usage text', () => {
    for (const argv of [[], ['nope'], ['export'], ['import', '--in', 'x'], ['resolve', 'not-a-uuid', '--by', 'am', '--answer', 'm=true'], ['resolve', ID, '--by', 'am'], ['resolve', ID, '--by', 'am', '--answer', 'novalue'], ['report', '--since', 'yesterday'], ['reviews', '--limit', '0']]) {
      const r = parseDecisionsArgs(argv);
      expect('error' in r, argv.join(' ')).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/Usage:/);
    }
  });
});
