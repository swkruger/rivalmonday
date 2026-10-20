import { sql } from 'drizzle-orm';
import type { BusinessAreaRow, VerticalRow } from '@cs/verticals';
import type { Db } from './client';
import { VERTICAL_CATALOG_SEED } from './catalog-seed.sql';
import { businessArea, vertical } from './schema';

/** Every vertical and business area, for `createCatalog`. Service connection only: the catalogue tables are closed to app_user. */
export async function catalogRows(db: Db): Promise<{ verticals: VerticalRow[]; areas: BusinessAreaRow[] }> {
  const [vs, as] = await Promise.all([db.select().from(vertical), db.select().from(businessArea)]);
  return {
    verticals: vs.map((v) => ({
      id: v.id,
      name: v.name,
      status: v.status,
      mergedInto: v.mergedInto,
      version: v.version,
      gbpCategories: v.gbpCategories,
      gbpRelatedCategories: v.gbpRelatedCategories,
      config: v.config,
      draftEvidence: v.draftEvidence ?? null,
      createdByAgencyId: v.createdByAgencyId,
    })),
    areas: as.map((a) => ({
      verticalId: a.verticalId,
      id: a.id,
      name: a.name,
      aliases: a.aliases,
      status: a.status,
      mergedInto: a.mergedInto,
      evidence: a.evidence ?? null,
      createdByAgencyId: a.createdByAgencyId,
    })),
  };
}

/** Re-inserts the seeded catalogue (generic, hvac_plumbing, dental). Same statements as migration 0077; idempotent (ON CONFLICT DO NOTHING). Needs an owner connection. */
export async function seedVerticalCatalog(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const stmt of VERTICAL_CATALOG_SEED) await tx.execute(sql.raw(stmt));
  });
}
