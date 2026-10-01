import { createFsStore } from './fs';
import { createR2Store } from './r2';
import type { ObjectStore } from './store';

export function createStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, EVIDENCE_FS_DIR } = env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    return createR2Store({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
  }
  if (EVIDENCE_FS_DIR) return createFsStore(EVIDENCE_FS_DIR);
  throw new Error('No evidence store configured: set R2_* variables or EVIDENCE_FS_DIR');
}
