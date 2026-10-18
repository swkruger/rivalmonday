import { ToolError } from '@cs/core';
import { businessArea, type Tx, vertical } from '@cs/db';
import { GENERIC_VERTICAL_ID } from '@cs/verticals';
import { and, eq, inArray, sql } from 'drizzle-orm';

/** Rows touched by an UPDATE issued through `tx.execute` (postgres-js reports it as `count`). */
const touched = (r: unknown): number => (r as { count?: number }).count ?? (r as unknown[]).length;

const refuse = (msg: string): never => {
  throw new ToolError('invalid_input', msg, { userFacing: true });
};

/** Locks the given vertical rows in id order (deadlock-free) and returns them keyed by id. Caller already holds the catalogue lock. */
async function lockVerticals(tx: Tx, ids: string[]): Promise<Map<string, typeof vertical.$inferSelect>> {
  const rows = await tx.select().from(vertical).where(inArray(vertical.id, ids)).orderBy(vertical.id).for('update');
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Merges vertical `sourceId` into `targetId` (binding algorithm, Phase 14a Task 10). Runs inside the caller's transaction,
 * after `lockCatalogue(tx)`. `areaMap`: source area id -> target area id, or null = move the area to the target.
 */
export async function mergeVerticalTx(tx: Tx, sourceId: string, targetId: string, areaMap: Record<string, string | null>): Promise<{ clientsMoved: number }> {
  if (sourceId === targetId) refuse('A business type cannot be merged into itself.');
  if (sourceId === GENERIC_VERTICAL_ID || targetId === GENERIC_VERTICAL_ID) refuse('The generic business type cannot be merged.');
  const locked = await lockVerticals(tx, [sourceId, targetId]);
  const src = locked.get(sourceId);
  const tgt = locked.get(targetId);
  if (!src || !tgt) throw new ToolError('not_found', 'Business type not found');
  if (src.status === 'merged' || tgt.status === 'merged') refuse('Both business types must be live (not already merged).');

  const srcAreas = (await tx.select().from(businessArea).where(eq(businessArea.verticalId, sourceId))).filter((a) => a.status !== 'merged');
  const tgtAreas = await tx.select().from(businessArea).where(eq(businessArea.verticalId, targetId));
  const srcIds = new Set(srcAreas.map((a) => a.id));
  for (const a of srcAreas) if (!(a.id in areaMap)) refuse(`Say where the area "${a.name}" goes.`);
  for (const k of Object.keys(areaMap)) if (!srcIds.has(k)) refuse(`Unknown source area: ${k}`);
  const live = new Set(tgtAreas.filter((a) => a.status !== 'merged').map((a) => a.id));
  const taken = new Set(tgtAreas.map((a) => a.id));
  const moveIds: string[] = [];
  const mapped: Record<string, string> = {};
  for (const [from, to] of Object.entries(areaMap)) {
    if (to === null) {
      if (taken.has(from)) refuse(`The target already has an area "${from}". Map it instead of moving it.`);
      moveIds.push(from);
    } else {
      if (!live.has(to)) refuse(`Unknown target area: ${to}`);
      mapped[from] = to;
    }
  }
  const mapSql = sql`${JSON.stringify(mapped)}::jsonb`;
  const moveJson = JSON.stringify(moveIds);
  const mapSrc = JSON.stringify(Object.keys(mapped));
  const mapTgt = JSON.stringify(Object.values(mapped));

  // 1. areas
  await tx.execute(sql`UPDATE business_area SET vertical_id = ${targetId} WHERE vertical_id = ${sourceId} AND id IN (SELECT jsonb_array_elements_text(${moveJson}::jsonb))`);
  await tx.execute(sql`UPDATE business_area SET status = 'merged', merged_into = m.tgt_area
    FROM (SELECT a.v AS src_area, b.v AS tgt_area FROM jsonb_array_elements_text(${mapSrc}::jsonb) WITH ORDINALITY AS a(v, o)
          JOIN jsonb_array_elements_text(${mapTgt}::jsonb) WITH ORDINALITY AS b(v, o) USING (o)) AS m
    WHERE vertical_id = ${sourceId} AND id = m.src_area`);
  // 2. clients
  const clients = await tx.execute(sql`UPDATE client c SET vertical_id = ${targetId}, services = (
    SELECT coalesce(jsonb_agg(s ORDER BY ord), '[]'::jsonb) FROM (
      SELECT DISTINCT ON (s) s, ord FROM (
        SELECT coalesce(${mapSql} ->> e, e) AS s, ord
        FROM jsonb_array_elements_text(c.services) WITH ORDINALITY AS t(e, ord)) x
      ORDER BY s, ord) y)
    WHERE c.vertical_id = ${sourceId}`);
  // 3. event.services
  await tx.execute(sql`UPDATE event SET services = (services - ${sourceId}::text) || jsonb_build_object(${targetId}::text,
      CASE WHEN services->>${sourceId}::text IS NULL THEN 'null'::jsonb
           ELSE to_jsonb(coalesce(${mapSql} ->> (services->>${sourceId}::text), services->>${sourceId}::text)) END)
    WHERE jsonb_exists(services, ${sourceId}::text) AND NOT jsonb_exists(services, ${targetId}::text)`);
  await tx.execute(sql`UPDATE event SET services = services - ${sourceId}::text WHERE jsonb_exists(services, ${sourceId}::text)`);
  // 4. price_point
  await tx.execute(sql`DELETE FROM price_point p WHERE p.vertical_id = ${sourceId} AND p.ended_at IS NULL AND EXISTS (
    SELECT 1 FROM price_point q WHERE q.vertical_id = ${targetId} AND q.ended_at IS NULL AND q.tracked_page_id = p.tracked_page_id
      AND q.service_id IS NOT DISTINCT FROM coalesce(${mapSql} ->> p.service_id, p.service_id)
      AND q.unit IS NOT DISTINCT FROM p.unit AND q.qualifier IS NOT DISTINCT FROM p.qualifier AND q.amount = p.amount)`);
  await tx.execute(sql`UPDATE price_point SET vertical_id = ${targetId}, service_id = coalesce(${mapSql} ->> service_id, service_id) WHERE vertical_id = ${sourceId}`);
  // 5. derived analyses are dropped, the next run re-derives them under the target (P8)
  await tx.execute(sql`DELETE FROM review_analysis WHERE vertical_id = ${sourceId}`);
  await tx.execute(sql`DELETE FROM price_block_map WHERE vertical_id = ${sourceId}`);
  await tx.execute(sql`DELETE FROM theme_proposal WHERE vertical_id = ${sourceId} AND status = 'proposed'`);
  // 6. agency settings
  await tx.execute(sql`DELETE FROM playbook_override o WHERE o.vertical_id = ${sourceId} AND EXISTS (
    SELECT 1 FROM playbook_override t WHERE t.agency_id = o.agency_id AND t.vertical_id = ${targetId} AND t.playbook_id = o.playbook_id)`);
  await tx.execute(sql`UPDATE playbook_override SET vertical_id = ${targetId} WHERE vertical_id = ${sourceId}`);
  await tx.execute(sql`UPDATE agency_profile SET verticals = ARRAY(SELECT DISTINCT unnest(array_replace(verticals, ${sourceId}::text, ${targetId}::text))) WHERE ${sourceId}::text = ANY(verticals)`);
  // 7. categories and rows. The source's Google categories become the target's related categories (its primary ones stay primary).
  await tx.execute(sql`UPDATE vertical_category SET vertical_id = ${targetId}, kind = 'related' WHERE vertical_id = ${sourceId}`);
  await tx.execute(sql`UPDATE vertical SET status = 'merged', merged_into = ${targetId}, updated_at = now() WHERE id = ${sourceId}`);
  await tx.execute(sql`UPDATE vertical t SET version = t.version + 1, updated_at = now(),
      gbp_related_categories = ARRAY(SELECT DISTINCT c FROM unnest(t.gbp_related_categories || s.gbp_categories || s.gbp_related_categories) AS c WHERE c <> ALL(t.gbp_categories))
    FROM vertical s WHERE t.id = ${targetId} AND s.id = ${sourceId}`);
  return { clientsMoved: touched(clients) };
}

/** Merges area `sourceAreaId` into `targetAreaId` inside one vertical. Same preconditions as `mergeVerticalTx`. */
export async function mergeAreaTx(tx: Tx, verticalId: string, sourceAreaId: string, targetAreaId: string): Promise<{ clientsMoved: number }> {
  if (verticalId === GENERIC_VERTICAL_ID) refuse('The generic business type has no areas to merge.');
  if (sourceAreaId === targetAreaId) refuse('An area cannot be merged into itself.');
  const v = (await lockVerticals(tx, [verticalId])).get(verticalId);
  if (!v || v.status === 'merged') throw new ToolError('not_found', 'Business type not found');
  const areas = await tx.select().from(businessArea).where(eq(businessArea.verticalId, verticalId));
  const src = areas.find((a) => a.id === sourceAreaId);
  const tgt = areas.find((a) => a.id === targetAreaId);
  if (!src || !tgt) throw new ToolError('not_found', 'Area not found');
  if (src.status === 'merged' || tgt.status === 'merged') refuse('Both areas must be live (not already merged).');

  await tx.update(businessArea).set({ status: 'merged', mergedInto: targetAreaId }).where(and(eq(businessArea.verticalId, verticalId), eq(businessArea.id, sourceAreaId)));
  const clients = await tx.execute(sql`UPDATE client c SET services = (
    SELECT coalesce(jsonb_agg(s ORDER BY ord), '[]'::jsonb) FROM (
      SELECT DISTINCT ON (s) s, ord FROM (
        SELECT CASE WHEN e = ${sourceAreaId}::text THEN ${targetAreaId}::text ELSE e END AS s, ord
        FROM jsonb_array_elements_text(c.services) WITH ORDINALITY AS t(e, ord)) x
      ORDER BY s, ord) y)
    WHERE c.vertical_id = ${verticalId} AND jsonb_exists(c.services, ${sourceAreaId}::text)`);
  await tx.execute(sql`UPDATE event SET services = jsonb_set(services, ARRAY[${verticalId}::text], to_jsonb(${targetAreaId}::text)) WHERE services->>${verticalId}::text = ${sourceAreaId}::text`);
  await tx.execute(sql`DELETE FROM price_point p WHERE p.vertical_id = ${verticalId} AND p.service_id = ${sourceAreaId} AND p.ended_at IS NULL AND EXISTS (
    SELECT 1 FROM price_point q WHERE q.vertical_id = ${verticalId} AND q.service_id = ${targetAreaId} AND q.ended_at IS NULL AND q.tracked_page_id = p.tracked_page_id
      AND q.unit IS NOT DISTINCT FROM p.unit AND q.qualifier IS NOT DISTINCT FROM p.qualifier AND q.amount = p.amount)`);
  await tx.execute(sql`UPDATE price_point SET service_id = ${targetAreaId} WHERE vertical_id = ${verticalId} AND service_id = ${sourceAreaId}`);
  await tx.execute(sql`UPDATE price_block_map SET service_id = ${targetAreaId} WHERE vertical_id = ${verticalId} AND service_id = ${sourceAreaId}`);
  await tx.execute(sql`UPDATE vertical SET version = version + 1, updated_at = now() WHERE id = ${verticalId}`);
  return { clientsMoved: touched(clients) };
}
