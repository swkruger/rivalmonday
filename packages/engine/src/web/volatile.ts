import { capture, captureBlock, type Db, detectedChange, volatileBlock } from '@cs/db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { EXTRACT_STAGE } from './blocks';

export const VOLATILE_TRANSITIONS = 5;
export const VOLATILE_MIN_CHANGES = 3;

/** Number of transitions in which a block's content (or presence) changed. */
export function countChanges(history: (string | null)[]): number {
  let n = 0;
  for (let i = 1; i < history.length; i++) if (history[i] !== history[i - 1]) n++;
  return n;
}

/** Spec §6.1: changed in ≥ 3 of the last 5 captures without semantic significance (no change became an event). */
export function isVolatile(history: (string | null)[], hadEvent: boolean): boolean {
  return !hadEvent && countChanges(history.slice(-(VOLATILE_TRANSITIONS + 1))) >= VOLATILE_MIN_CHANGES;
}

export async function maskedBlockKeys(db: Db, trackedPageId: string): Promise<Set<string>> {
  const rows = await db.select({ blockKey: volatileBlock.blockKey }).from(volatileBlock).where(eq(volatileBlock.trackedPageId, trackedPageId));
  return new Set(rows.map((r) => r.blockKey));
}

export async function learnVolatileBlocks(db: Db, trackedPageId: string): Promise<string[]> {
  const caps = await db
    .select({ id: capture.id })
    .from(capture)
    .where(
      and(
        eq(capture.trackedPageId, trackedPageId), eq(capture.source, 'web'), eq(capture.status, 'ok'),
        sql`EXISTS (SELECT 1 FROM stage_run s WHERE s.stage = ${EXTRACT_STAGE} AND s.subject_id = ${capture.id} AND s.status = 'done')`,
      ),
    )
    .orderBy(desc(capture.capturedAt))
    .limit(VOLATILE_TRANSITIONS + 1);
  if (caps.length < VOLATILE_MIN_CHANGES + 1) return [];
  const ids = caps.map((c) => c.id).reverse();

  const rows = await db
    .select({ captureId: captureBlock.captureId, blockKey: captureBlock.blockKey, textSha: captureBlock.textSha })
    .from(captureBlock)
    .where(inArray(captureBlock.captureId, ids));
  const byKey = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!byKey.has(r.blockKey)) byKey.set(r.blockKey, new Map());
    byKey.get(r.blockKey)!.set(r.captureId, r.textSha);
  }

  const evented = new Set(
    (
      await db
        .select({ blockKey: detectedChange.blockKey })
        .from(detectedChange)
        .where(and(eq(detectedChange.trackedPageId, trackedPageId), eq(detectedChange.status, 'event'), inArray(detectedChange.afterCaptureId, ids)))
    ).map((r) => r.blockKey),
  );
  const already = await maskedBlockKeys(db, trackedPageId);
  const newly = [...byKey.keys()].filter((k) => !already.has(k) && isVolatile(ids.map((id) => byKey.get(k)!.get(id) ?? null), evented.has(k)));
  if (newly.length > 0) await db.insert(volatileBlock).values(newly.map((blockKey) => ({ trackedPageId, blockKey }))).onConflictDoNothing();
  return newly;
}
