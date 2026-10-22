import { describe, expect, it } from 'vitest';
import { parseArchiveArgs } from './archive-args';

const ID = '00000000-0000-4000-8000-0000000000a1';

describe('parseArchiveArgs', () => {
  it('parses agency/client with and without --undo (id lower-cased)', () => {
    expect(parseArchiveArgs(['agency', ID])).toEqual({ kind: 'agency', id: ID, undo: false });
    expect(parseArchiveArgs(['client', ID.toUpperCase(), '--undo'])).toEqual({ kind: 'client', id: ID, undo: true });
    expect(parseArchiveArgs(['--undo', 'client', ID])).toEqual({ kind: 'client', id: ID, undo: true });
  });

  it('rejects bad input with the usage text', () => {
    for (const argv of [[], ['agency'], ['nope', ID], ['agency', 'not-a-uuid'], ['agency', ID, ID], ['agency', ID, '--force'], [ID]]) {
      const r = parseArchiveArgs(argv);
      expect('error' in r, argv.join(' ')).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/Usage:/);
    }
  });
});
