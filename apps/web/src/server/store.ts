import 'server-only';
import { createFsStore, createStoreFromEnv, type ObjectStore } from '@cs/storage';
import { perEnv } from './env-cache';
import { resolveEvidenceDir } from './files';
import { envEvidenceDir } from './runtime-env';

/** Moved from files.ts (which the E2E seed imports outside Next) so it can depend on server-only modules. */
const stores = perEnv<ObjectStore>((name) =>
  name === 'dev'
    ? createStoreFromEnv({ ...process.env, EVIDENCE_FS_DIR: resolveEvidenceDir(process.env.EVIDENCE_FS_DIR, process.cwd()) })
    : createFsStore(envEvidenceDir(name)));

export const webStore = (): ObjectStore => stores();
