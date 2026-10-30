import { resolveEnvironment } from '@cs/db';
import { createR2Store } from '@cs/storage';
import { stagingR2Config, syncEvidence } from '../staging/evidence-sync';
import { loadRepoEnv, repoRoot } from './repo';

try {
  // The staging R2_* values come from the shell only: read them before `.env` (EVIDENCE_FS_DIR, the dev evidence) loads.
  const r2 = stagingR2Config(process.env);
  loadRepoEnv();
  const dir = resolveEnvironment('dev', { repoRoot: repoRoot() }).evidenceDir;
  console.log(`[staging-evidence] copying ${dir} into bucket ${r2.bucket}...`);
  const r = await syncEvidence({ dir, store: createR2Store(r2), log: console.log });
  console.log(`[staging-evidence] done: ${r.uploaded} uploaded, ${r.skipped} already there.`);
} catch (e) {
  console.error(`[staging-evidence] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
