import { describe, expect, it } from 'vitest';
import { parseDevArgs } from './dev-args';

describe('parseDevArgs', () => {
  it('takes --env and passes everything else to next dev', () => {
    expect(parseDevArgs(['--env', 'demo', '--port', '3200'])).toEqual({ env: 'demo', rest: ['--port', '3200'] });
    expect(parseDevArgs([])).toEqual({ env: null, rest: [] });
    expect(() => parseDevArgs(['--env', 'prod'])).toThrow(/dev, demo or test/);
  });
});
