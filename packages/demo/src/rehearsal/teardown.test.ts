import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agency } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDemoTables } from '../test-support';
import { seedFault } from './fault';
import { seedRehearsal } from './seed';
import { teardownRehearsal } from './teardown';

const dbs = openTestDbs();
const dir = mkdtempSync(join(tmpdir(), 'rehearsal-teardown-'));
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await dbs.closeAll();
});
const NOW = new Date('2026-11-09T15:00:00Z');

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  await seedRehearsal(dbs.service, { agencies: 2, clients: 1, startingPoints: 0, liveClients: 0, now: NOW, database: 'test/test' });
  await seedFault(dbs.service, { clients: 1, now: NOW });
});

describe('teardownRehearsal', () => {
  it('writes one archive command per live rehearsal agency, archives nothing itself and lists the owner steps', async () => {
    const file = join(dir, 'rehearsal-archive.sh');
    const out = await teardownRehearsal(dbs.service, { outFile: file });
    const agencies = await dbs.owner.select({ id: agency.id, archivedAt: agency.archivedAt }).from(agency);
    expect(out.agencies.map((a) => a.id).sort()).toEqual(agencies.map((a) => a.id).sort());
    expect(agencies.every((a) => a.archivedAt === null)).toBe(true);

    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('pnpm '));
    expect(lines).toHaveLength(3);
    expect(lines.sort()).toEqual(agencies.map((a) => `pnpm --filter @cs/worker archive agency ${a.id}`).sort());
    expect(out.manualSteps.join('\n')).toMatch(/staging branch/);
    expect(out.manualSteps.join('\n')).toMatch(/bucket/);
    expect(out.manualSteps.join('\n')).toMatch(/Railway/);
    expect(out.manualSteps.join('\n')).toMatch(/[Ee]vidence is never deleted/);

    // Already-archived agencies are not listed again.
    await dbs.owner.update(agency).set({ archivedAt: NOW }).where(isNull(agency.archivedAt));
    expect((await teardownRehearsal(dbs.service, { outFile: file })).agencies).toEqual([]);
  });
});
