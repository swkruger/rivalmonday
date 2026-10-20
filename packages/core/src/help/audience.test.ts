import { describe, expect, it } from 'vitest';
import { ROLES } from '../access';
import { viewerAudience, visibleAudiences } from './audience';

describe('visibleAudiences', () => {
  it.each([
    ['client', ['all', 'client']],
    ['agency', ['all', 'agency']],
    ['operator', ['all', 'agency', 'operator']],
  ] as const)('%s', (v, expected) => {
    expect(visibleAudiences(v)).toEqual(expected);
  });
  it('client never sees agency or operator help', () => {
    expect(visibleAudiences('client')).not.toContain('agency');
    expect(visibleAudiences('client')).not.toContain('operator');
  });
});

describe('viewerAudience', () => {
  it.each([
    ['agency_admin', 'agency', 'agency'],
    ['account_manager', 'agency', 'agency'],
    ['agency_admin', 'client', 'agency'],
    ['account_manager', 'client', 'agency'],
    ['client_owner', 'client', 'client'],
    ['client_viewer', 'client', 'client'],
    ['guest', 'client', 'client'],
    ['guest', 'agency', 'client'],
    ['agency_admin', 'platform', 'operator'],
    ['client_owner', 'platform', 'operator'],
    ['guest', 'platform', 'operator'],
  ] as const)('%s in %s context -> %s', (role, ctx, expected) => {
    expect(viewerAudience(role, ctx)).toBe(expected);
  });
  it('maps every role to agency or client outside the platform context', () => {
    for (const r of ROLES) expect(['agency', 'client']).toContain(viewerAudience(r, 'agency'));
  });
});
