import { auditLog, brief, client, withDatabase } from '@cs/db';
import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDemoTables } from '../test-support';
import { approveRehearsalBriefs } from './approve';
import { dbIdentity, guardManifestRun } from './guards';
import { type RehearsalManifest, windowOpenFor } from './manifest';
import { seedRehearsal } from './seed';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-11-09T15:00:00Z');
let m: RehearsalManifest;
const readyIds: { id: string; auto: boolean }[] = [];

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  m = await seedRehearsal(dbs.service, { agencies: 2, clients: 2, startingPoints: 0, liveClients: 0, now: NOW, database: dbIdentity(testUrls.service) });
  // As if the worker generated this Monday's briefs on Thursday night.
  const open = windowOpenFor(m.deliveryDate, m.timezone);
  const clients = await dbs.owner.select({ id: client.id, agencyId: client.agencyId, auto: client.briefAutoSend }).from(client).where(inArray(client.id, m.weeklyClientIds));
  for (const c of clients) {
    const [b] = await dbs.owner.insert(brief).values({ agencyId: c.agencyId, clientId: c.id, deliveryDate: m.deliveryDate, periodStart: new Date(open.getTime() - 7 * 86_400_000), periodEnd: open, kind: 'quiet', status: 'ready', generatedAt: open }).returning({ id: brief.id });
    readyIds.push({ id: b!.id, auto: c.auto });
  }
});

describe('approveRehearsalBriefs', () => {
  it('approves every ready brief of an auto-send-off client through the registry (audited), leaving auto-send briefs alone', async () => {
    const out = await approveRehearsalBriefs({ app: dbs.app, service: dbs.service }, m);
    const manual = readyIds.filter((r) => !r.auto).map((r) => r.id);
    const auto = readyIds.filter((r) => r.auto).map((r) => r.id);
    expect(manual).toHaveLength(2);
    expect(out).toEqual({ approved: 2, failed: [] });

    const rows = await dbs.owner.select().from(brief).where(inArray(brief.id, [...manual, ...auto]));
    for (const r of rows) {
      if (manual.includes(r.id)) {
        expect(r.status).toBe('approved');
        expect(m.agencies.find((a) => a.id === r.agencyId)!.adminUserId).toBe(r.approvedBy);
      } else expect(r.status).toBe('ready');
    }
    const audits = await dbs.owner.select().from(auditLog).where(and(eq(auditLog.tool, 'approve_brief'), eq(auditLog.outcome, 'ok')));
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.role === 'agency_admin' && m.agencies.some((x) => x.adminUserId === a.userId))).toBe(true);

    // A second run finds nothing left to approve.
    expect(await approveRehearsalBriefs({ app: dbs.app, service: dbs.service }, m)).toEqual({ approved: 0, failed: [] });
  });

  it('approve refuses a mismatched APP_DATABASE_URL', async () => {
    const run = (appUrl: string) => guardManifestRun(dbs.service, { serviceUrl: testUrls.service, appUrl, manifest: m, allowTestDatabase: true });
    await expect(run(testUrls.app)).resolves.toBeUndefined();
    await expect(run(withDatabase(testUrls.app, 'cs_dev'))).rejects.toThrow(/APP_DATABASE_URL/);
  });
});
