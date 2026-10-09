import { describe, expect, it } from 'vitest';
import { parseDevArgs, withLocalHostname } from './dev-args';

describe('parseDevArgs', () => {
  it('takes --env and passes everything else to next dev', () => {
    expect(parseDevArgs(['--env', 'demo', '--port', '3200'])).toEqual({ env: 'demo', rest: ['--port', '3200'] });
    expect(parseDevArgs([])).toEqual({ env: null, rest: [] });
    expect(() => parseDevArgs(['--env', 'prod'])).toThrow(/dev, demo or test/);
  });
});

describe('withLocalHostname (Review Focus 2: never listen on the LAN)', () => {
  it('binds next dev to 127.0.0.1 by default', () => {
    expect(withLocalHostname([])).toEqual(['-H', '127.0.0.1']);
    expect(withLocalHostname(['--port', '3200'])).toEqual(['--port', '3200', '-H', '127.0.0.1']);
  });

  it('respects -H and does not add a second one', () => {
    expect(withLocalHostname(['-H', 'x'])).toEqual(['-H', 'x']);
    expect(withLocalHostname(['-H=x', '--port', '3200'])).toEqual(['-H=x', '--port', '3200']);
  });

  it('respects --hostname and does not add a second one', () => {
    expect(withLocalHostname(['--hostname', 'x'])).toEqual(['--hostname', 'x']);
    expect(withLocalHostname(['--hostname=x'])).toEqual(['--hostname=x']);
  });
});
