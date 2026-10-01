import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { capture, evidence, trackedPage } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const PAGE_X = '00000000-0000-4000-8000-0000000000e1';
const PAGE_Y = '00000000-0000-4000-8000-0000000000e2';
const CAP_X = '00000000-0000-4000-8000-0000000000c1';
const CAP_Y = '00000000-0000-4000-8000-0000000000c2';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values([
    { id: PAGE_X, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'sitemap', cadence: 'daily' },
    { id: PAGE_Y, competitorId: IDS.competitorY, url: 'https://brightsmiles.example/', pageType: 'home', source: 'nav', cadence: 'daily' },
  ]);
  await dbs.service.insert(capture).values([
    { id: CAP_X, competitorId: IDS.competitorX, trackedPageId: PAGE_X, source: 'web', url: 'https://smithhvac.example/pricing', status: 'ok', httpStatus: 200, collectorVersion: 'web/1' },
    { id: CAP_Y, competitorId: IDS.competitorY, trackedPageId: PAGE_Y, source: 'web', url: 'https://brightsmiles.example/', status: 'ok', httpStatus: 200, collectorVersion: 'web/1' },
  ]);
  await dbs.service.insert(evidence).values([
    { captureId: CAP_X, kind: 'text', objectKey: `evidence/${IDS.competitorX}/${CAP_X}/text.txt`, sha256: 'a'.repeat(64), bytes: 10, contentType: 'text/plain' },
    { captureId: CAP_Y, kind: 'text', objectKey: `evidence/${IDS.competitorY}/${CAP_Y}/text.txt`, sha256: 'b'.repeat(64), bytes: 10, contentType: 'text/plain' },
  ]);
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('evidence visibility', () => {
  it('shows nothing without tenant context', async () => {
    expect(await dbs.app.select().from(trackedPage)).toEqual([]);
    expect(await dbs.app.select().from(capture)).toEqual([]);
    expect(await dbs.app.select().from(evidence)).toEqual([]);
  });

  it('scopes pages, captures and evidence to competitors the client tracks', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect(ids(await tx.select().from(trackedPage))).toEqual([PAGE_X]);
      expect(ids(await tx.select().from(capture))).toEqual([CAP_X]);
      expect((await tx.select().from(evidence)).map((e) => e.captureId)).toEqual([CAP_X]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, async (tx) => {
      expect(ids(await tx.select().from(capture))).toEqual([CAP_X]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, async (tx) => {
      expect(ids(await tx.select().from(capture))).toEqual([CAP_X, CAP_Y].sort());
    });
  });

  it('never lets app_user write evidence tables or competitor', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(capture).values({ competitorId: IDS.competitorX, source: 'web', status: 'ok', collectorVersion: 'x' }),
      ),
    );
    expect(text).toMatch(/permission denied/i);
  });
});

describe('privilege guard', () => {
  it('app_user has no INSERT/UPDATE/DELETE on system and global tables', async () => {
    const tables = ['agency', 'competitor', 'audit_log', 'llm_call', 'vendor_call', 'tracked_page', 'capture', 'evidence'];
    // Build a SQL array literal: drizzle expands a bare JS array into a parameter *list*, not an array.
    const tableArray = sql`ARRAY[${sql.join(tables.map((t) => sql`${t}`), sql`, `)}]::text[]`;
    const rows = (await dbs.owner.execute(sql`
      SELECT t AS table, p AS priv
      FROM unnest(${tableArray}) AS t, unnest(ARRAY['INSERT','UPDATE','DELETE']) AS p
      WHERE has_table_privilege('app_user', 'public.' || t, p)`)) as unknown as { table: string; priv: string }[];
    expect(rows).toEqual([]);
  });
});
