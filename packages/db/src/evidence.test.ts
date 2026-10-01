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
  it('app_user has exactly the INSERT/UPDATE/DELETE/TRUNCATE grants on the allow-list, on every public table', async () => {
    // Inverted guard: instead of checking a hard-coded table list (which silently stops covering a table
    // that forgets its REVOKE), enumerate every table that actually exists in the public schema — drizzle's
    // own migration bookkeeping lives in a separate "drizzle" schema, so there's nothing of ours to exclude
    // here — and assert the full set of (table, privilege) pairs app_user can write with. Any future table
    // that ships without its REVOKE shows up as an unexpected extra pair and fails this test.
    //
    // Column-aware: INSERT/UPDATE are checked with has_any_column_privilege (0011 grants app_user UPDATE on
    // only the `status` column of competitor_suggestion, not the whole row, so a table-level
    // has_table_privilege check would wrongly report that pair as absent). DELETE/TRUNCATE have no
    // column-grant concept in Postgres, so they stay on has_table_privilege. TRUNCATE is included even
    // though 0001 never grants it (GRANT list is SELECT/INSERT/UPDATE/DELETE only) — it's a belt-and-braces
    // check that nothing ever hands app_user that privilege.
    //
    // Allow-list, derived from the migrations:
    //   client             INSERT/UPDATE/DELETE — FOR ALL tenant-isolation policy (0001); never revoked.
    //   client_competitor  INSERT/UPDATE/DELETE — FOR ALL tenant-isolation policy (0001); never revoked.
    //   competitor_suggestion UPDATE only        — 0010 revokes INSERT/DELETE; 0011 revokes the table-wide
    //                                              UPDATE and re-grants UPDATE on just the `status` column,
    //                                              so a client-scoped user can dismiss/accept a suggestion
    //                                              but cannot rewrite place_id/cid/domain/name/appearances/
    //                                              overlap_score/best_rank/client_id (which acceptSuggestion,
    //                                              Task 4, later trusts to create/link a GLOBAL competitor via
    //                                              the service role). The competitor_suggestion_update RLS
    //                                              policy further confines which rows that UPDATE can touch.
    // Every other public table (agency, competitor, tracked_page, capture, evidence, audit_log, llm_call,
    // vendor_call, competitor_source, vendor_task, observation, review, ad, rank_snapshot) has had all
    // write privileges revoked from app_user and is writable only by app_service.
    const allowList = [
      { table: 'client', priv: 'DELETE' },
      { table: 'client', priv: 'INSERT' },
      { table: 'client', priv: 'UPDATE' },
      { table: 'client_competitor', priv: 'DELETE' },
      { table: 'client_competitor', priv: 'INSERT' },
      { table: 'client_competitor', priv: 'UPDATE' },
      { table: 'competitor_suggestion', priv: 'UPDATE' },
    ];
    const rows = (await dbs.owner.execute(sql`
      SELECT t.tablename AS table, p.priv AS priv
      FROM pg_tables t, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
      WHERE t.schemaname = 'public'
        AND (
          (p.priv IN ('INSERT', 'UPDATE') AND has_any_column_privilege('app_user', 'public.' || t.tablename, p.priv))
          OR (p.priv IN ('DELETE', 'TRUNCATE') AND has_table_privilege('app_user', 'public.' || t.tablename, p.priv))
        )
      ORDER BY t.tablename, p.priv`)) as unknown as { table: string; priv: string }[];
    expect(rows).toEqual(allowList);
  });

  it('app_user can UPDATE only the status column of competitor_suggestion', async () => {
    const rows = (await dbs.owner.execute(sql`
      SELECT column_name
      FROM information_schema.column_privileges
      WHERE grantee = 'app_user' AND table_schema = 'public' AND table_name = 'competitor_suggestion' AND privilege_type = 'UPDATE'
      ORDER BY column_name`)) as unknown as { column_name: string }[];
    expect(rows.map((r) => r.column_name)).toEqual(['status']);
  });
});
