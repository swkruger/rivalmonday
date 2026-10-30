import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ObjectStore } from '@cs/storage';
import { listFiles } from '../snapshot/zip';

const TYPES: Record<string, string> = {
  gz: 'application/gzip', pdf: 'application/pdf', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  txt: 'text/plain', json: 'application/json', html: 'text/html',
};

export function contentTypeFor(key: string): string {
  const ext = /\.([A-Za-z0-9]+)$/.exec(key)?.[1]?.toLowerCase();
  return (ext && TYPES[ext]) || 'application/octet-stream';
}

const R2_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;

/** docs/STAGING.md § Evidence: the staging bucket's credentials come from the shell (never `.env`); only a `*-staging` bucket is accepted. */
export function stagingR2Config(env: NodeJS.ProcessEnv): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string } {
  const missing = R2_VARS.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Set ${missing.join(', ')} in the shell (staging bucket values; never in .env)`);
  const bucket = env.R2_BUCKET!.trim();
  if (!bucket.endsWith('-staging')) throw new Error(`Refusing bucket "${bucket}": only a bucket whose name ends in -staging is a target`);
  return { accountId: env.R2_ACCOUNT_ID!.trim(), accessKeyId: env.R2_ACCESS_KEY_ID!.trim(), secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(), bucket };
}

/**
 * Copies the dev evidence directory (fs store: key = relative path) into the staging bucket, so a cs_dev copy's
 * evidence keys resolve on staging. Existing keys are skipped, never overwritten (evidence is immutable).
 */
export async function syncEvidence(o: { dir: string; store: ObjectStore; log?: (line: string) => void }): Promise<{ uploaded: number; skipped: number }> {
  const keys = await listFiles(o.dir);
  if (keys.length === 0) throw new Error(`${o.dir} holds no evidence files; nothing to sync`);
  let uploaded = 0;
  let skipped = 0;
  for (const key of keys) {
    if (await o.store.exists(key)) {
      skipped++;
      continue;
    }
    await o.store.put(key, new Uint8Array(await readFile(join(o.dir, ...key.split('/')))), contentTypeFor(key));
    uploaded++;
    if (uploaded % 200 === 0) o.log?.(`[staging-evidence] ${uploaded} uploaded...`);
  }
  return { uploaded, skipped };
}
