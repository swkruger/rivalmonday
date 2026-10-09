import { databaseNameOf } from '@cs/db';
import { openTestDbs, seedTenancy, testUrls } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo } from './seed';
import { countRows, resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const tally = async () => ({
  agencies: await countRows(dbs.owner, sql`select count(*)::int as n from agency`),
  clients: await countRows(dbs.owner, sql`select count(*)::int as n from client`),
  competitors: await countRows(dbs.owner, sql`select count(*)::int as n from competitor`),
  users: await countRows(dbs.owner, sql`select count(*)::int as n from auth."user"`),
});

describe('seedDemo guards (spec §8)', () => {
  beforeAll(async () => {
    await resetDemoTables(dbs.owner);
    await seedTenancy(dbs.owner); // two agencies, three clients, two competitors
  });

  it('refuses a URL that does not name the expected database, before connecting', async () => {
    const before = await tally();
    await expect(seedDemo({ ownerUrl: testUrls.owner, expected: 'cs_demo', store: createMemoryStore(), salt: TEST_SALT })).rejects.toThrow(/expected exactly "cs_demo"/);
    await expect(seedDemo({ ownerUrl: 'not a url', expected: 'cs_demo', store: createMemoryStore(), salt: TEST_SALT })).rejects.toThrow(/Malformed database URL/);
    expect(await tally()).toEqual(before);
  });

  it('refuses a database that already has an agency, and writes nothing', async () => {
    const before = await tally();
    expect(before.agencies).toBe(2);
    const err = await seedDemo({ ownerUrl: testUrls.owner, expected: databaseNameOf(testUrls.owner), store: createMemoryStore(), salt: TEST_SALT }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/already has data/);
    expect((err as Error).message).not.toMatch(/postgres(ql)?:\/\//);
    expect(await tally()).toEqual(before);
  });
});
