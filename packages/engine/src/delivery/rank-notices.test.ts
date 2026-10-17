import { notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addContact } from './contacts';
import type { DeliveryConfig } from './outbox';
import { formatCap, notifyRankScanSkipped } from './rank-notices';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
const deps = () => ({ db: dbs.service, delivery });
const skipped = { scanId: IDS.clientA1, agencyId: IDS.agencyA, clientId: IDS.clientA1, clientName: 'A1 HVAC', spentUsd: 14.9, capUsd: 15, estimatedUsd: 0.5 };
const rows = () => dbs.owner.select().from(notification).where(eq(notification.kind, 'rank_scan_skipped'));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
  await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am2@a.example', name: 'Kim' });
});

describe('notifyRankScanSkipped', () => {
  it('writes one in-app row per agency contact and dedupes within the week, again next week', async () => {
    const wed = new Date('2026-10-14T10:00:00Z');
    expect(await notifyRankScanSkipped(deps(), skipped, wed)).toBe(1);
    const first = await rows();
    const inApp = first.filter((r) => r.channel === 'in_app');
    expect(inApp).toHaveLength(2);
    expect(inApp[0]).toMatchObject({ subjectType: 'rank_scan', title: 'Rank scan skipped: A1 HVAC' });
    expect(inApp[0]!.body).toBe("This scan would exceed A1 HVAC's monthly cost cap ($15). Raise the cap in Usage or wait until next month.");
    expect(inApp[0]!.dedupeKey).toContain('rank_scan_skipped:' + IDS.clientA1 + ':2026-10-12');
    expect(await notifyRankScanSkipped(deps(), skipped, new Date('2026-10-18T23:00:00Z'))).toBe(0); // Sunday, same UTC week
    expect(await rows()).toHaveLength(first.length);
    expect(await notifyRankScanSkipped(deps(), skipped, new Date('2026-10-19T00:30:00Z'))).toBe(1); // next Monday
    expect(await rows()).toHaveLength(first.length * 2);
  });

  it('formats the cap', () => {
    expect(formatCap(15)).toBe('$15');
    expect(formatCap(12.5)).toBe('$12.50');
  });
});
