import { describe, expect, it } from 'vitest';
import { canAccessClient, canManageCompetitors, createAccessContext, hasFeature, hasPermission, isAgencyRole, type Feature, type Role } from './access';

const A = '00000000-0000-4000-8000-00000000000a';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const C2 = '00000000-0000-4000-8000-0000000000c2';

describe('createAccessContext', () => {
  it('builds an agency context with scope all', () => {
    const ctx = createAccessContext({ agencyId: A, userId: 'u1', role: 'agency_admin', clientScope: 'all', features: [] });
    expect(ctx.clientScope).toBe('all');
    expect(isAgencyRole(ctx.role)).toBe(true);
  });

  it('rejects a client role with scope all', () => {
    expect(() =>
      createAccessContext({ agencyId: A, userId: 'u1', role: 'client_owner', clientScope: 'all', features: [] }),
    ).toThrow(/client roles must be scoped/i);
  });

  it('rejects a client role with more than one client', () => {
    expect(() =>
      createAccessContext({ agencyId: A, userId: 'u1', role: 'client_viewer', clientScope: [C1, C2], features: [] }),
    ).toThrow(/exactly one client/i);
  });

  it('rejects malformed ids', () => {
    expect(() =>
      createAccessContext({ agencyId: 'nope', userId: 'u1', role: 'agency_admin', clientScope: 'all', features: [] }),
    ).toThrow(/agencyId/);
    expect(() =>
      createAccessContext({ agencyId: A, userId: 'u1', role: 'account_manager', clientScope: ["x';--"], features: [] }),
    ).toThrow(/clientScope/);
  });

  it('rejects an empty explicit scope', () => {
    expect(() =>
      createAccessContext({ agencyId: A, userId: 'u1', role: 'account_manager', clientScope: [], features: [] }),
    ).toThrow(/clientScope/);
  });
});

describe('permissions', () => {
  it('maps roles to permissions', () => {
    const viewer = createAccessContext({ agencyId: A, userId: 'u', role: 'client_viewer', clientScope: [C1], features: [] });
    const owner = createAccessContext({ agencyId: A, userId: 'u', role: 'client_owner', clientScope: [C1], features: [] });
    const am = createAccessContext({ agencyId: A, userId: 'u', role: 'account_manager', clientScope: [C1, C2], features: [] });
    expect(hasPermission(viewer, 'read')).toBe(true);
    expect(hasPermission(viewer, 'feedback')).toBe(false);
    expect(hasPermission(owner, 'manage')).toBe(true);
    expect(hasPermission(owner, 'agency')).toBe(false);
    expect(hasPermission(am, 'agency')).toBe(true);
  });

  it('checks client access', () => {
    const am = createAccessContext({ agencyId: A, userId: 'u', role: 'account_manager', clientScope: [C1], features: [] });
    const admin = createAccessContext({ agencyId: A, userId: 'u', role: 'agency_admin', clientScope: 'all', features: [] });
    expect(canAccessClient(am, C1)).toBe(true);
    expect(canAccessClient(am, C2)).toBe(false);
    expect(canAccessClient(admin, C2)).toBe(true);
  });

  it('canManageCompetitors: agency roles always; a client owner only with manage_competitors; a viewer never', () => {
    const ctx = (role: Role, features: Feature[] = []) =>
      createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role === 'agency_admin' || role === 'account_manager' ? 'all' : [C1], features });
    expect(canManageCompetitors(ctx('agency_admin'))).toBe(true);
    expect(canManageCompetitors(ctx('account_manager'))).toBe(true);
    expect(canManageCompetitors(ctx('client_owner'))).toBe(false);
    expect(canManageCompetitors(ctx('client_owner', ['manage_competitors']))).toBe(true);
    expect(canManageCompetitors(ctx('client_viewer', ['manage_competitors']))).toBe(false);
  });
});

describe('hasFeature', () => {
  const make = (role: Role, features: Feature[]) =>
    createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role === 'agency_admin' || role === 'account_manager' ? 'all' : [C1], features });
  it('is always true for agency roles', () => {
    expect(hasFeature(make('account_manager', []), 'dashboard')).toBe(true);
  });
  it('follows the client flags for client roles', () => {
    expect(hasFeature(make('client_owner', ['dashboard']), 'dashboard')).toBe(true);
    expect(hasFeature(make('client_owner', []), 'dashboard')).toBe(false);
    expect(hasFeature(make('client_viewer', ['alert_rules']), 'mcp')).toBe(false);
  });
});
