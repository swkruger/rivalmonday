import { agency } from '@cs/db';
import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDemoTables } from '../test-support';
import { assertConfirmDb, assertNotTestDatabase, assertOnlyRehearsalAgencies, dbIdentity, guardRehearsalWrite } from './guards';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(() => resetDemoTables(dbs.owner));

const STAGING = 'postgresql://app_service:pw@ep-staging-123.us-east-2.aws.neon.tech/neondb?sslmode=require';

describe('rehearsal guards', () => {
  it('wrong --confirm-db refuses', () => {
    expect(dbIdentity(STAGING)).toBe('ep-staging-123.us-east-2.aws.neon.tech/neondb');
    expect(() => assertConfirmDb(STAGING, 'ep-staging-123.us-east-2.aws.neon.tech/neondb')).not.toThrow();
    expect(() => assertConfirmDb(STAGING, 'ep-prod-999.us-east-2.aws.neon.tech/neondb')).toThrow(/--confirm-db/);
    expect(() => assertConfirmDb(STAGING, 'ep-staging-123.us-east-2.aws.neon.tech/cs_dev')).toThrow(/--confirm-db/);
    expect(() => assertConfirmDb(STAGING, undefined)).toThrow(/--confirm-db/);
  });

  it('a non-rehearsal agency refuses', async () => {
    await dbs.service.insert(agency).values([{ name: 'Rehearsal Agency 01' }, { name: 'Rehearsal Agency Fault' }]);
    await expect(assertOnlyRehearsalAgencies(dbs.service)).resolves.toBeUndefined();
    await dbs.service.insert(agency).values({ name: 'Brazos Digital' });
    await expect(assertOnlyRehearsalAgencies(dbs.service)).rejects.toThrow(/Brazos Digital/);
    // The whole guard refuses too (tests may opt into a _test database; the CLI never does).
    await expect(guardRehearsalWrite(dbs.service, testUrls.service, { confirmDb: dbIdentity(testUrls.service), allowTestDatabase: true })).rejects.toThrow(/not a rehearsal agency/);
  });

  it('_test database refuses', async () => {
    expect(() => assertNotTestDatabase('postgresql://u:p@localhost:5444/cs_phase_7c2_test')).toThrow(/_test/);
    expect(() => assertNotTestDatabase(STAGING)).not.toThrow();
    // The CLI path (no override) refuses the test database before looking at any row.
    await expect(guardRehearsalWrite(dbs.service, testUrls.service, { confirmDb: dbIdentity(testUrls.service) })).rejects.toThrow(/_test/);
    await expect(guardRehearsalWrite(dbs.service, testUrls.service, { confirmDb: dbIdentity(testUrls.service), allowTestDatabase: true })).resolves.toBeUndefined();
  });
});
