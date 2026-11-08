import { capture, type Db, evidence, observation } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';

export interface MetaPageReading { pageId: string; pageName: string | null; likes: number }

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' ? (v as Obj) : null);
const idOf = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null);
const itemPageId = (o: Obj, snap: Obj | null) => idOf(o.page_id ?? o.pageID ?? o.pageId) ?? idOf(snap?.page_id ?? snap?.pageID ?? snap?.pageId);

/** First item whose page id matches (or any item when none carries an id) with a numeric `snapshot.page_like_count`. */
export function pageReadingFrom(items: unknown[], pageId: string): MetaPageReading | null {
  const objs = items.map(obj).filter((o): o is Obj => o !== null);
  const anyId = objs.some((o) => itemPageId(o, obj(o.snapshot)) !== null);
  for (const o of objs) {
    const snap = obj(o.snapshot);
    if (anyId && itemPageId(o, snap) !== pageId) continue;
    const likes = snap?.page_like_count;
    if (typeof likes !== 'number' || !Number.isFinite(likes)) continue;
    const name = o.page_name ?? snap?.page_name;
    return { pageId, pageName: typeof name === 'string' && name.length > 0 ? name : null, likes };
  }
  return null;
}

export async function writeMetaPageObservation(
  db: Db,
  c: { competitorId: string; captureId: string; capturedAt: Date },
  r: MetaPageReading,
): Promise<void> {
  await db
    .insert(observation)
    .values({ competitorId: c.competitorId, captureId: c.captureId, kind: 'meta_page', key: r.pageId, data: { ...r }, observedAt: c.capturedAt })
    .onConflictDoNothing({ target: [observation.captureId, observation.kind, observation.key] });
}

const pageIdFromUrl = (url: string | null) => url?.match(/view_all_page_id=([^&]+)/)?.[1] ?? null;

/** Writes a `meta_page` observation for every ok `meta_ads` capture with a readable like count. Idempotent. */
export async function backfillMetaPageObservations(
  deps: { db: Db; store: ObjectStore },
  opts: { competitorId?: string; dryRun?: boolean } = {},
): Promise<{ captures: number; written: number; skipped: number }> {
  const rows = await deps.db
    .select({ id: capture.id, competitorId: capture.competitorId, url: capture.url, capturedAt: capture.capturedAt, objectKey: evidence.objectKey })
    .from(capture)
    .innerJoin(evidence, and(eq(evidence.captureId, capture.id), eq(evidence.kind, 'vendor_json')))
    .where(and(eq(capture.source, 'meta_ads'), eq(capture.status, 'ok'), ...(opts.competitorId ? [eq(capture.competitorId, opts.competitorId)] : [])));
  let written = 0;
  let skipped = 0;
  for (const row of rows) {
    const pageId = pageIdFromUrl(row.url);
    const body = pageId ? await deps.store.get(row.objectKey) : null;
    let reading: MetaPageReading | null = null;
    if (pageId && body) {
      try {
        const payload = JSON.parse(gunzipSync(body).toString('utf8')) as { items?: unknown };
        reading = Array.isArray(payload.items) ? pageReadingFrom(payload.items, pageId) : null;
      } catch {
        reading = null;
      }
    }
    if (!reading) {
      skipped++;
      continue;
    }
    if (!opts.dryRun) await writeMetaPageObservation(deps.db, { competitorId: row.competitorId, captureId: row.id, capturedAt: row.capturedAt }, reading);
    written++;
  }
  return { captures: rows.length, written, skipped };
}
