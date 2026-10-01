import { capture, type Db, evidence } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { sha256Hex } from './recorder';

export interface VendorCaptureInput {
  competitorId: string;
  source: string;
  collectorVersion: string;
  url?: string | null;
  status: 'ok' | 'vendor_error';
  error?: string | null;
  payload?: unknown;
}

/** Records one vendor collection attempt; on success, stores the raw payload as gzipped `vendor_json` evidence. */
export async function recordVendorCapture(
  deps: { db: Db; store: ObjectStore; now?: () => Date },
  input: VendorCaptureInput,
): Promise<{ captureId: string; objectKey: string | null }> {
  const captureId = randomUUID();
  const capturedAt = (deps.now ?? (() => new Date()))();
  const row = {
    id: captureId,
    competitorId: input.competitorId,
    source: input.source,
    url: input.url ?? null,
    status: input.status,
    error: input.error ?? null,
    collectorVersion: input.collectorVersion,
    capturedAt,
  };
  if (input.status !== 'ok' || input.payload === undefined) {
    await deps.db.insert(capture).values(row);
    return { captureId, objectKey: null };
  }
  const json = JSON.stringify(input.payload);
  const body = new Uint8Array(gzipSync(json));
  const objectKey = `evidence/${input.competitorId}/${captureId}/vendor.json.gz`;
  await deps.store.put(objectKey, body, 'application/gzip');
  await deps.db.transaction(async (tx) => {
    await tx.insert(capture).values(row);
    await tx.insert(evidence).values({
      captureId,
      kind: 'vendor_json',
      objectKey,
      sha256: sha256Hex(json),
      bytes: body.byteLength,
      contentType: 'application/gzip',
    });
  });
  return { captureId, objectKey };
}
