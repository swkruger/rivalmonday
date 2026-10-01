import type { CaptureStatus } from '@cs/core';
import { capture, type Db, evidence, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { RenderedPage } from '../web/renderer';

export const WEB_COLLECTOR_VERSION = 'web/1';

export function normalizeText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface RecorderDeps {
  db: Db;
  store: ObjectStore;
  now?: () => Date;
}

export interface WebCaptureInput {
  trackedPage: { id: string; competitorId: string; url: string };
  page: RenderedPage;
}

/** Hash-first, immutable capture: unchanged text → no objects and no screenshot (spec §4.2, §4.4). */
export async function recordWebCapture(deps: RecorderDeps, input: WebCaptureInput): Promise<{ captureId: string; status: CaptureStatus; evidenceKeys: string[] }> {
  const now = deps.now ?? (() => new Date());
  const { trackedPage: tp, page } = input;
  const captureId = randomUUID();
  const base = { id: captureId, competitorId: tp.competitorId, trackedPageId: tp.id, source: 'web', url: page.finalUrl, httpStatus: page.httpStatus, collectorVersion: WEB_COLLECTOR_VERSION };

  if (page.status !== 'ok') {
    await deps.db.insert(capture).values({ ...base, status: page.status, error: page.error, capturedAt: now() });
    return { captureId, status: page.status, evidenceKeys: [] };
  }

  const text = normalizeText(page.text);
  const textSha = sha256Hex(text);
  const [last] = await deps.db
    .select({ sha: evidence.sha256 })
    .from(capture)
    .innerJoin(evidence, and(eq(evidence.captureId, capture.id), eq(evidence.kind, 'text')))
    .where(and(eq(capture.trackedPageId, tp.id), eq(capture.status, 'ok')))
    .orderBy(desc(capture.capturedAt))
    .limit(1);

  const capturedAt = now();
  if (last?.sha === textSha) {
    await deps.db.transaction(async (tx) => {
      await tx.insert(capture).values({ ...base, status: 'unchanged', capturedAt });
      await tx.update(trackedPage).set({ lastCapturedAt: capturedAt }).where(eq(trackedPage.id, tp.id));
    });
    return { captureId, status: 'unchanged', evidenceKeys: [] };
  }

  const prefix = `evidence/${tp.competitorId}/${captureId}`;
  const htmlGz = new Uint8Array(gzipSync(page.html));
  const textBytes = new TextEncoder().encode(text);

  // Take the screenshot before any upload: if it throws, record the failure as its own
  // immutable capture (status 'error') rather than losing the attempt or writing partial evidence.
  let shot: Uint8Array;
  try {
    shot = await page.screenshot();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.db.insert(capture).values({ ...base, status: 'error', error: `screenshot failed: ${message}`, capturedAt });
    return { captureId, status: 'error', evidenceKeys: [] };
  }

  const objects = [
    { kind: 'html', key: `${prefix}/page.html.gz`, body: htmlGz, contentType: 'application/gzip', sha: sha256Hex(page.html) },
    { kind: 'text', key: `${prefix}/text.txt`, body: textBytes, contentType: 'text/plain; charset=utf-8', sha: textSha },
    { kind: 'screenshot', key: `${prefix}/screenshot.webp`, body: shot, contentType: 'image/webp', sha: sha256Hex(shot) },
  ];
  // Upload first; a failed DB write can leave orphan objects, which is safe (never referenced) and cheap.
  for (const o of objects) await deps.store.put(o.key, o.body, o.contentType);

  await deps.db.transaction(async (tx) => {
    await tx.insert(capture).values({ ...base, status: 'ok', capturedAt });
    await tx.insert(evidence).values(
      objects.map((o) => ({ captureId, kind: o.kind, objectKey: o.key, sha256: o.sha, bytes: o.body.byteLength, contentType: o.contentType })),
    );
    await tx.update(trackedPage).set({ lastCapturedAt: capturedAt }).where(eq(trackedPage.id, tp.id));
  });
  return { captureId, status: 'ok', evidenceKeys: objects.map((o) => o.key) };
}
