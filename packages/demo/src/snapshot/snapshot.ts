import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertDatabase } from '@cs/db';
import postgres from 'postgres';
import { lastMigration, type SnapshotManifest, stampOf, tableCounts } from './manifest';
import { clientMajor, type PgRun, pgEnv, pgToolPath, redactPgOutput, runPg, serverMajor, versionProblem } from './pg-tools';
import { zipDirectory } from './zip';

/** Seams for tests; production uses the real implementations. */
export interface SnapshotDeps {
  connect(url: string): postgres.Sql;
  serverMajor(sql: postgres.Sql): Promise<{ major: number; version: string }>;
  clientMajor(env: NodeJS.ProcessEnv): Promise<number | null>;
  runPg(bin: string, args: string[], extraEnv: Record<string, string>): Promise<PgRun>;
  lastMigration(sql: postgres.Sql): Promise<string | null>;
  tableCounts(sql: postgres.Sql): Promise<Record<string, number>>;
}

const realDeps: SnapshotDeps = {
  connect: (url) => postgres(url, { max: 1, onnotice: () => {} }),
  serverMajor,
  clientMajor: (env) => clientMajor('pg_dump', env),
  runPg,
  lastMigration,
  tableCounts,
};

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
  deps?: SnapshotDeps;
}

/**
 * Final-review M2: printed, never fatal. A missing evidence directory zips to nothing, and with `R2_*` set DEV
 * evidence may live in R2, which a snapshot does not copy. Only variable names are printed, never their values.
 */
export async function evidenceWarnings(evidenceDir: string, env: NodeJS.ProcessEnv): Promise<string[]> {
  const out: string[] = [];
  const isDir = await stat(evidenceDir).then((s) => s.isDirectory(), () => false);
  if (!isDir) out.push(`[snapshot] warning: the evidence directory ${evidenceDir} does not exist; the snapshot will hold no evidence files.`);
  const r2 = Object.keys(env).filter((k) => k.startsWith('R2_') && env[k]?.trim()).sort();
  if (r2.length) out.push(`[snapshot] warning: ${r2.join(', ')} ${r2.length === 1 ? 'is' : 'are'} set, so DEV evidence may be stored in R2; only ${evidenceDir} is zipped, never R2.`);
  return out;
}

/** Spec §6.1. Never prints or stores the connection URL, password or host. */
export async function takeSnapshot(o: SnapshotOptions): Promise<{ folder: string; manifest: SnapshotManifest }> {
  assertDatabase(o.ownerUrl, o.expected);
  const env = o.env ?? process.env;
  const log = o.log ?? (() => {});
  const now = o.now ?? new Date();
  const d = o.deps ?? realDeps;
  const sql = d.connect(o.ownerUrl);
  let folder: string | null = null;
  try {
    const server = await d.serverMajor(sql);
    const problem = versionProblem('pg_dump', await d.clientMajor(env), server.major);
    if (problem) throw new Error(problem);
    const target = join(o.backupsDir, `${stampOf(now)}-${o.expected}${o.label ? `-${o.label}` : ''}`);
    await mkdir(o.backupsDir, { recursive: true });
    try {
      await mkdir(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Snapshot folder already exists; refusing to overwrite it. Wait a second and retry.');
      throw e;
    }
    // Only a folder this call created may be cleaned up.
    folder = target;
    log(`[snapshot] dumping ${o.expected}...`);
    const dump = await d.runPg(pgToolPath('pg_dump', env), ['-Fc', '-f', join(folder, 'db.dump')], pgEnv(o.ownerUrl));
    if (dump.code !== 0) throw new Error(`pg_dump failed: ${redactPgOutput(dump.stderr.trim())}`);
    for (const w of await evidenceWarnings(o.evidenceDir, env)) log(w);
    log('[snapshot] zipping evidence...');
    const evidence = await zipDirectory(o.evidenceDir, join(folder, 'evidence.zip'));
    const manifest: SnapshotManifest = {
      version: 1, createdAt: now.toISOString(), sourceDatabase: o.expected, serverVersion: server.version,
      lastMigration: await d.lastMigration(sql), tables: await d.tableCounts(sql), evidence,
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
