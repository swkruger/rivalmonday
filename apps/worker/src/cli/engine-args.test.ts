import { describe, expect, it } from 'vitest';
import { parseEngineArgs } from './engine-args';

describe('parseEngineArgs', () => {
  it('accepts a competitor uuid, a round count and --moves', () => {
    expect(parseEngineArgs(['--competitor', '00000000-0000-4000-8000-0000000000f1', '--rounds', '3', '--moves'])).toEqual({ competitor: '00000000-0000-4000-8000-0000000000f1', rounds: 3, moves: true, insights: false });
    expect(parseEngineArgs([])).toEqual({ rounds: 10, moves: false, insights: false });
  });

  it('accepts --insights and a --client uuid', () => {
    expect(parseEngineArgs(['--insights', '--client', '00000000-0000-4000-8000-0000000000a1'])).toEqual({ client: '00000000-0000-4000-8000-0000000000a1', rounds: 10, moves: false, insights: true });
    expect(parseEngineArgs(['--client', 'nope'])).toMatchObject({ error: expect.stringMatching(/--client must be a uuid/) });
  });

  it('rejects a malformed competitor id or round count with a clear message', () => {
    expect(parseEngineArgs(['--competitor', 'aireserv.com'])).toEqual({ error: expect.stringContaining('--competitor must be a uuid') });
    expect(parseEngineArgs(['--rounds', 'ten'])).toEqual({ error: expect.stringContaining('--rounds must be an integer from 1 to 1000') });
    expect(parseEngineArgs(['--rounds', '0'])).toMatchObject({ error: expect.any(String) });
    expect(parseEngineArgs(['--bogus'])).toMatchObject({ error: expect.any(String) });
  });
});
