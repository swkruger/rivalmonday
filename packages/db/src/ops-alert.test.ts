import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { client, opsAlert } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('ops_alert', () => {
  it('app_user sees 0 ops_alert rows and cannot insert', async () => {
    await dbs.service.insert(opsAlert).values({ kind: 'brief_readiness', dedupeKey: 'k1', severity: 'warning' });
    const read = await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(opsAlert)));
    expect(read).toMatch(/permission denied/i);
    const ins = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(opsAlert).values({ kind: 'brief_readiness', dedupeKey: 'k2', severity: 'warning' }),
      ),
    );
    expect(ins).toMatch(/permission denied/i);
  });

  it('app_service reads and writes ops_alert', async () => {
    await dbs.service.insert(opsAlert).values({ kind: 'brief_readiness', dedupeKey: 'k1', severity: 'critical', summary: { n: 2 } });
    const rows = await dbs.service.select().from(opsAlert);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toEqual({ n: 2 });
    expect(rows[0]!.resolvedAt).toBeNull();
  });

  it('dedupe_key is unique', async () => {
    await dbs.service.insert(opsAlert).values({ kind: 'brief_readiness', dedupeKey: 'dup', severity: 'warning' });
    const text = await errorText(dbs.service.insert(opsAlert).values({ kind: 'brief_readiness', dedupeKey: 'dup', severity: 'critical' }));
    expect(text).toMatch(/ops_alert_dedupe_key_unique|duplicate key/i);
  });

  it('severity check refuses "info"', async () => {
    const text = await errorText(dbs.service.insert(opsAlert).values({ kind: 'brief_readiness', dedupeKey: 'sev', severity: 'info' }));
    expect(text).toMatch(/ops_alert_severity_check/i);
  });
});

describe('client INSERT hardening', () => {
  it('app_user cannot INSERT a client', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(client).values({ agencyId: IDS.agencyA, name: 'Own agency client', verticalId: 'dental' }),
      ),
    );
    expect(text).toMatch(/permission denied/i);
  });

  it('app_service can insert a client', async () => {
    const [row] = await dbs.service.insert(client).values({ agencyId: IDS.agencyA, name: 'Service client', verticalId: 'dental' }).returning();
    expect(row!.name).toBe('Service client');
  });
});

describe('notification.provider_id index', () => {
  it('notification_provider_id_idx exists', async () => {
    const r = (await dbs.owner.execute(sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'notification_provider_id_idx'`)) as unknown as { indexdef: string }[];
    expect(r).toHaveLength(1);
    expect(r[0]!.indexdef).toMatch(/\(provider_id\)/);
  });
});
