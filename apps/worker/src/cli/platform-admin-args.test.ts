import { describe, expect, it } from 'vitest';
import { parsePlatformAdminArgs } from './platform-admin-args';

describe('parsePlatformAdminArgs', () => {
  it('parses add (default role viewer, explicit role, email lower-cased), revoke and list', () => {
    expect(parsePlatformAdminArgs(['add', 'Ops@Example.com'])).toEqual({ cmd: 'add', email: 'ops@example.com', role: 'viewer' });
    expect(parsePlatformAdminArgs(['add', 'ops@example.com', '--role', 'staff'])).toEqual({ cmd: 'add', email: 'ops@example.com', role: 'staff' });
    expect(parsePlatformAdminArgs(['add', '--role', 'owner', 'ops@example.com'])).toEqual({ cmd: 'add', email: 'ops@example.com', role: 'owner' });
    expect(parsePlatformAdminArgs(['revoke', 'ops@example.com'])).toEqual({ cmd: 'revoke', email: 'ops@example.com' });
    expect(parsePlatformAdminArgs(['list'])).toEqual({ cmd: 'list' });
  });

  it('rejects bad input with the usage text', () => {
    for (const argv of [[], ['nope'], ['add'], ['add', 'not-an-email'], ['add', 'a@b.co', '--role', 'admin'], ['add', 'a@b.co', 'c@d.co'], ['revoke'], ['revoke', 'a@b.co', '--role', 'staff'], ['list', 'extra'], ['add', 'a@b.co', '--bogus']]) {
      const r = parsePlatformAdminArgs(argv);
      expect('error' in r, argv.join(' ')).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/Usage:/);
    }
  });
});
