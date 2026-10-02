import { capture, type Db, evidence, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export async function seedPage(db: Db, competitorId: string, url = 'https://smithhvac.example/', pageType = 'home'): Promise<string> {
  const [row] = await db.insert(trackedPage).values({ competitorId, url, pageType, source: 'manual', cadence: 'daily' }).returning({ id: trackedPage.id });
  return row!.id;
}

/** Inserts an ok web capture whose html evidence lives in `store`, exactly as recordWebCapture stores it. */
export async function seedWebCapture(
  db: Db,
  store: ObjectStore,
  input: { competitorId: string; trackedPageId: string; html: string; capturedAt: Date; url?: string },
): Promise<string> {
  const id = randomUUID();
  const key = `evidence/${input.competitorId}/${id}/page.html.gz`;
  const body = new Uint8Array(gzipSync(input.html));
  await store.put(key, body, 'application/gzip');
  await db.insert(capture).values({
    id, competitorId: input.competitorId, trackedPageId: input.trackedPageId, source: 'web', url: input.url ?? 'https://smithhvac.example/',
    status: 'ok', httpStatus: 200, collectorVersion: 'web/1', capturedAt: input.capturedAt,
  });
  await db.insert(evidence).values({
    captureId: id, kind: 'html', objectKey: key, sha256: createHash('sha256').update(input.html).digest('hex'), bytes: body.byteLength, contentType: 'application/gzip',
  });
  return id;
}

/** Inserts an ok vendor capture row (no evidence object — structured differs read the rows collectors wrote). */
export async function seedVendorCapture(db: Db, input: { competitorId: string; source: string; capturedAt: Date; url?: string | null }): Promise<string> {
  const id = randomUUID();
  await db.insert(capture).values({ id, competitorId: input.competitorId, source: input.source, url: input.url ?? null, status: 'ok', collectorVersion: 'test/1', capturedAt: input.capturedAt });
  return id;
}

/** 06:00 UTC on 2026-10-01 plus n days. */
export const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 6));

export const fixture = (name: string) => readFile(fileURLToPath(new URL(`./fixtures/web/${name}`, import.meta.url)), 'utf8');
