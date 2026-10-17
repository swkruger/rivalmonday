import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { clientSetup } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(clientSetup).values([
    { clientId: IDS.clientA1, agencyId: IDS.agencyA },
    { clientId: IDS.clientA2, agencyId: IDS.agencyA },
    { clientId: IDS.clientB1, agencyId: IDS.agencyB },
  ]);
});

describe('client_setup RLS', () => {
  it('client_setup rows are invisible across agencies', async () => {
    const a = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(clientSetup));
    expect(a.map((r) => r.clientId).sort()).toEqual([IDS.clientA1, IDS.clientA2].sort());
    const b = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(clientSetup));
    expect(b.map((r) => r.clientId)).toEqual([IDS.clientB1]);
  });

  it('client-scoped session sees only its client\'s row', async () => {
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(clientSetup));
    expect(rows.map((r) => r.clientId)).toEqual([IDS.clientA1]);
  });

  it('app_user cannot insert/update/delete', async () => {
    const scope = { agencyId: IDS.agencyA, clientScope: 'all' as const };
    await dbs.service.delete(clientSetup).where(sql`client_id = ${IDS.clientA2}`);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(clientSetup).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA })))).toMatch(
      /permission denied/,
    );
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.update(clientSetup).set({ dismissedAt: new Date() })))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.delete(clientSetup)))).toMatch(/permission denied/);
  });

  it('defaults and CHECKs: source, skipped subset', async () => {
    const [r] = await dbs.service.select().from(clientSetup).where(sql`client_id = ${IDS.clientA1}`);
    expect([r!.source, r!.suggestions, r!.skipped, r!.completedAt]).toEqual(['staff', { status: 'none' }, [], null]);
    await dbs.service.delete(clientSetup).where(sql`client_id = ${IDS.clientA2}`);
    expect(
      await errorText(dbs.service.insert(clientSetup).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, source: 'x' as never })),
    ).toMatch(/client_setup_source_check/);
    expect(
      await errorText(dbs.service.insert(clientSetup).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, skipped: ['profile' as never] })),
    ).toMatch(/client_setup_skipped_check/);
    await dbs.service.insert(clientSetup).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, skipped: ['search', 'competitors'] });
  });
});

describe('backfill', () => {
  it('backfill marks every pre-existing client complete', async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    const dir = join(__dirname, '..', 'migrations');
    const file = readdirSync(dir).find((f) => /^0067_.*\.sql$/.test(f))!;
    const stmts = readFileSync(join(dir, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => /^INSERT INTO client_setup/.test(s));
    expect(stmts).toHaveLength(1);
    for (let i = 0; i < 2; i++) await dbs.owner.execute(sql.raw(stmts[0]!));
    const rows = await dbs.service.select().from(clientSetup);
    expect(rows.map((r) => r.clientId).sort()).toEqual([IDS.clientA1, IDS.clientA2, IDS.clientB1].sort());
    for (const r of rows) expect(r.completedAt).not.toBeNull();
  });
});
