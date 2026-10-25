import type postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { createDb } from './client';

const URL = 'postgres://u:p@127.0.0.1:1/x';
/** `instrument` hands us the raw postgres client createDb built; nothing connects until a query runs. */
const optionsOf = (opts: Parameters<typeof createDb>[1] = {}) => {
  let client: postgres.Sql | undefined;
  createDb(URL, { ...opts, instrument: (c) => (client = c) });
  return client!.options;
};

describe('createDb', () => {
  it('defaults to max 5 with prepared statements', () => {
    expect(optionsOf()).toMatchObject({ max: 5, prepare: true });
  });

  it('createDb honours max and prepare', () => {
    expect(optionsOf({ max: 33, prepare: false })).toMatchObject({ max: 33, prepare: false });
  });
});
