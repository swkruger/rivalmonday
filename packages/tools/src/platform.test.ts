import { createAccessContext } from '@cs/core';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../test/fixtures';
import { isPlatformOperator, normalizeAdminEmails, requirePlatformOperator } from './platform';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'Op@Example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
});
const as = (userId: string, role: 'agency_admin' | 'client_viewer' = 'agency_admin') =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: role === 'agency_admin' ? 'all' : [IDS.clientA1], features: [] });

describe('platform operators (decision 2, Review Focus 2)', () => {
  it('re-exports the env list normaliser from @cs/core', () => {
    expect(normalizeAdminEmails(' Op@Example.com, ,bad, x@y.co ,op@example.com')).toEqual(['op@example.com', 'x@y.co']);
    expect(normalizeAdminEmails(undefined)).toEqual([]);
  });

  it('matches the signed-in user’s email case-insensitively; never guests or an empty list', async () => {
    const deps = { service: dbs.service, platformAdmins: ['op@example.com'] };
    expect(await isPlatformOperator(deps, as('op'))).toBe(true);
    expect(await isPlatformOperator(deps, as('admin'))).toBe(false);
    expect(await isPlatformOperator(deps, as('nobody'))).toBe(false);
    expect(await isPlatformOperator(deps, as('contact:00000000-0000-4000-8000-000000000001', 'client_viewer'))).toBe(false);
    expect(await isPlatformOperator({ ...deps, platformAdmins: [] }, as('op'))).toBe(false);
    expect(await isPlatformOperator({ service: dbs.service }, as('op'))).toBe(false);
  });

  it('requirePlatformOperator refuses non-operators with permission_denied', async () => {
    const deps = { service: dbs.service, platformAdmins: ['op@example.com'] };
    await expect(requirePlatformOperator(deps, as('op'))).resolves.toBeUndefined();
    await expect(requirePlatformOperator(deps, as('admin'))).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
