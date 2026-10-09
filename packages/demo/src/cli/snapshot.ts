import { join } from 'node:path';
import { DEV_DATABASE, resolveEnvironment } from '@cs/db';
import { redactPgOutput } from '../snapshot/pg-tools';
import { takeSnapshot } from '../snapshot/snapshot';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
try {
  const dev = resolveEnvironment('dev', { repoRoot: repoRoot() });
  const { folder, manifest } = await takeSnapshot({ ownerUrl: dev.ownerUrl, expected: DEV_DATABASE, evidenceDir: dev.evidenceDir, backupsDir: join(repoRoot(), 'backups'), log: console.log });
  const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  console.log(`${rows} rows in ${Object.keys(manifest.tables).length} tables, ${manifest.evidence.files} evidence files.`);
  console.log(`Snapshot written to ${folder}`);
} catch (e) {
  console.error(`[snapshot] failed: ${redactPgOutput(e instanceof Error ? e.message : String(e))}`);
  process.exitCode = 1;
}
