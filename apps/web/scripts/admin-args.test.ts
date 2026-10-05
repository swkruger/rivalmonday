import { describe, expect, it } from 'vitest';
import { parseAdminArgs } from './admin-args';

const A = '00000000-0000-4000-8000-00000000000a';

describe('parseAdminArgs', () => {
  it('parses each command', () => {
    expect(parseAdminArgs(['agencies'])).toEqual({ cmd: 'agencies' });
    expect(parseAdminArgs(['create-agency', '--name', 'Acme'])).toEqual({ cmd: 'create-agency', name: 'Acme' });
    expect(parseAdminArgs(['invite', '--agency', A, '--email', 'x@y.co', '--role', 'agency_admin'])).toEqual({ cmd: 'invite', agency: A, email: 'x@y.co', role: 'agency_admin' });
    expect(parseAdminArgs(['link', '--contact', A, '--target', 'brief', '--id', A])).toEqual({ cmd: 'link', contact: A, target: 'brief', id: A });
    expect(parseAdminArgs(['link', '--contact', A, '--target', 'brief', '--id', A, '--client', A])).toMatchObject({ client: A });
  });
  it('reports bad input', () => {
    expect(parseAdminArgs([])).toHaveProperty('error');
    expect(parseAdminArgs(['invite', '--agency', 'x', '--email', 'x@y.co', '--role', 'agency_admin'])).toHaveProperty('error');
    expect(parseAdminArgs(['link', '--contact', A, '--target', 'nope', '--id', A])).toHaveProperty('error');
    expect(parseAdminArgs(['agencies', '--bogus'])).toHaveProperty('error');
  });
});
