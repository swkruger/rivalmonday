import { platformAdmin } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../../test/fixtures';
import { platformOperatorEmails, platformOwnerEmails } from './alerts';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedUser(dbs.owner, 'o1', 'Own@Example.com');
  await seedUser(dbs.owner, 's1', 'Staff@example.com');
  await seedUser(dbs.owner, 'v1', 'viewer@example.com');
  await seedUser(dbs.owner, 'r1', 'revoked@example.com');
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'o1', role: 'owner' },
    { userId: 's1', role: 'staff' },
    { userId: 'v1', role: 'viewer' },
    { userId: 'r1', role: 'staff', revokedAt: new Date() },
  ]);
});

describe('platformOperatorEmails (Phase 10 R13)', () => {
  it('owner|staff = env list ∪ active owner and staff rows; excludes viewers and revoked; lower-cased and deduped', async () => {
    const got = await platformOperatorEmails({ service: dbs.service, platformAdmins: ['env@example.com', 'staff@example.com'] }, ['owner', 'staff']);
    expect([...got].sort()).toEqual(['env@example.com', 'own@example.com', 'staff@example.com']);
  });

  it('owner only matches platformOwnerEmails', async () => {
    const deps = { service: dbs.service, platformAdmins: ['env@example.com'] };
    expect([...(await platformOperatorEmails(deps, ['owner']))].sort()).toEqual(['env@example.com', 'own@example.com']);
    expect([...(await platformOwnerEmails(deps))].sort()).toEqual(['env@example.com', 'own@example.com']);
  });

  it('no roles = the env list only', async () => {
    expect(await platformOperatorEmails({ service: dbs.service, platformAdmins: ['Env@Example.com'] }, [])).toEqual(['env@example.com']);
  });
});
