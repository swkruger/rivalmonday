import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertDatabase } from '@cs/db';
import postgres from 'postgres';
import { lastMigration, type SnapshotManifest, stampOf, tableCounts } from './manifest';
import { clientMajor, pgEnv, pgToolPath, redactPgOutput, runPg, serverMajor, versionProblem } from './pg-tools';
import { zipDirectory } from './zip';

export interface SnapshotOptions {
  ownerUrl: string;
  /** The exact database name being dumped (cs_dev for `db:snapshot`). */
  expected: string;
  evidenceDir: string;
  backupsDir: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  /** Folder suffix, e.g. 'pre-restore'. */
  label?: string;
  log?: (line: string) => void;
}

/** Spec §6.1. Never prints or stores the connection URL, password or host. */
export async function takeSnapshot(o: SnapshotOptions): Promise<{ folder: string; manifest: SnapshotManifest }> {
  assertDatabase(o.ownerUrl, o.expected);
  const env = o.env ?? process.env;
  const log = o.log ?? (() => {});
  const now = o.now ?? new Date();
  const sql = postgres(o.ownerUrl, { max: 1, onnotice: () => {} });
  let folder: string | null = null;
  try {
    const server = await serverMajor(sql);
    const problem = versionProblem('pg_dump', await clientMajor('pg_dump', env), server.major);
    if (problem) throw new Error(problem);
    folder = join(o.backupsDir, `${stampOf(now)}-${o.expected}${o.label ? `-${o.label}` : ''}`);
    await mkdir(folder, { recursive: true });
    log(`[snapshot] dumping ${o.expected}...`);
    const dump = await runPg(pgToolPath('pg_dump', env), ['-Fc', '-f', join(folder, 'db.dump')], pgEnv(o.ownerUrl));
    if (dump.code !== 0) throw new Error(`pg_dump failed: ${redactPgOutput(dump.stderr.trim())}`);
    log('[snapshot] zipping evidence...');
    const evidence = await zipDirectory(o.evidenceDir, join(folder, 'evidence.zip'));
    const manifest: SnapshotManifest = {
      version: 1, createdAt: now.toISOString(), sourceDatabase: o.expected, serverVersion: server.version,
      lastMigration: await lastMigration(sql), tables: await tableCounts(sql), evidence,
    };
    await writeFile(join(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { folder, manifest };
  } catch (e) {
    // A half-written snapshot folder is worse than none: remove what this call created.
    if (folder) await rm(folder, { recursive: true, force: true }).catch(() => {});
    throw e;
  } finally {
    await sql.end();
  }
}
