import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseNameOf, dropScratchDatabase } from '@cs/db';
import { openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { stampOf } from './manifest';
import { clientMajor, serverMajor, versionProblem } from './pg-tools';
import { restoreSnapshot } from './restore';
import { takeSnapshot } from './snapshot';

async function roundTripProblem(): Promise<string | null> {
  const sql = postgres(testUrls.owner, { max: 1, onnotice: () => {} });
  try {
    const { major } = await serverMajor(sql);
    return versionProblem('pg_dump', await clientMajor('pg_dump'), major) ?? versionProblem('pg_restore', await clientMajor('pg_restore'), major);
  } finally {
    await sql.end();
  }
}

const problem = await roundTripProblem();
if (problem) console.log(`[skip] snapshot round trip: ${problem}`);
const scratch = `cs_roundtrip_${stampOf(new Date()).replace('-', '_')}`;
const root = mkdtempSync(join(tmpdir(), 'roundtrip-'));
afterAll(async () => {
  if (!problem) await dropScratchDatabase(testUrls.owner, scratch).catch(() => {});
  rmSync(root, { recursive: true, force: true });
});

describe('snapshot round trip (spec 8)', () => {
  it.skipIf(problem !== null)('dumps cs_test, restores it into a scratch database and matches every row count', async () => {
    const dbs = openTestDbs();
    try {
      await truncateAll(dbs.owner);
      await seedTenancy(dbs.owner);
    } finally {
      await dbs.closeAll();
    }
    const snap = await takeSnapshot({ ownerUrl: testUrls.owner, expected: databaseNameOf(testUrls.owner), evidenceDir: join(root, 'no-evidence'), backupsDir: join(root, 'backups') });
    const r = await restoreSnapshot({ folder: snap.folder, into: scratch, maintenanceUrl: testUrls.owner, repoRoot: root, prompt: async () => '', log: () => {} });
    expect(r.target).toBe(scratch);
    expect(r.differences).toEqual([]);
  });
});
