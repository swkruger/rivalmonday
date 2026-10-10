import { readdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { databaseExists, ensureDatabase, IDENT, resolveEnvironment, wipeDatabase, withDatabase } from '@cs/db';
import postgres from 'postgres';
import { roleOf } from '../reset';
import { compareCounts, parseManifest, stampOf, tableCounts } from './manifest';
import { clientMajor, pgEnv, pgToolPath, redactPgOutput, runPg, serverMajor, versionProblem } from './pg-tools';
import { takeSnapshot } from './snapshot';
import { unzipTo } from './zip';

const USAGE = 'Usage: pnpm db:restore <backup folder> [--into <database>]';

export function parseRestoreArgs(argv: string[]): { folder: string; into?: string } {
  const folder = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--into');
  const at = argv.indexOf('--into');
  const into = at >= 0 ? argv[at + 1] : undefined;
  if (!folder || (at >= 0 && !into)) throw new Error(USAGE);
  return into ? { folder, into } : { folder };
}

/** Spec 6.2: default target is a new `cs_dev_restore_<timestamp>`; a test database is never a target. */
export function restoreTargetName(into: string | undefined, now: Date): string {
  const target = into?.trim() || `cs_dev_restore_${stampOf(now).replace('-', '_')}`;
  if (target === 'cs_test' || target.endsWith('_test')) throw new Error(`Refusing to restore into ${target}: a test database is never a restore target`);
  if (!IDENT.test(target)) throw new Error(`Invalid database name "${target}"`);
  return target;
}

export function confirmOverwrite(target: string, typed: string): void {
  if (typed.trim() !== target) throw new Error(`The typed name does not match ${target}; nothing was changed.`);
}

export interface RestoreDeps {
  exists(maintenanceUrl: string, name: string): Promise<boolean>;
  /** Throws the version message when pg_restore (or pg_dump, when `needDump`) is older than the server. */
  versions(maintenanceUrl: string, env: NodeJS.ProcessEnv, needDump: boolean): Promise<void>;
  snapshot(o: Parameters<typeof takeSnapshot>[0]): Promise<{ folder: string }>;
  /** True when `dir` exists and holds at least one entry. */
  hasFiles(dir: string): Promise<boolean>;
  moveAside(dir: string, to: string): Promise<void>;
  wipe(targetUrl: string, target: string): Promise<void>;
  create(maintenanceUrl: string, target: string, roles: string[]): Promise<unknown>;
  pgRestore(targetUrl: string, dump: string, env: NodeJS.ProcessEnv): Promise<{ code: number; stderr: string }>;
  unzip(zipFile: string, dir: string): Promise<number>;
  counts(targetUrl: string): Promise<Record<string, number>>;
}

const exists = async (p: string) => stat(p).then(() => true, () => false);

export function realRestoreDeps(): RestoreDeps {
  return {
    exists: databaseExists,
    async versions(maintenanceUrl, env, needDump) {
      const sql = postgres(maintenanceUrl, { max: 1, onnotice: () => {} });
      try {
        const { major } = await serverMajor(sql);
        const problem = versionProblem('pg_restore', await clientMajor('pg_restore', env), major) ?? (needDump ? versionProblem('pg_dump', await clientMajor('pg_dump', env), major) : null);
        if (problem) throw new Error(problem);
      } finally {
        await sql.end();
      }
    },
    snapshot: takeSnapshot,
    hasFiles: async (dir) => (await readdir(dir).catch(() => [])).length > 0,
    async moveAside(dir, to) {
      if (await exists(dir)) await rename(dir, to);
    },
    wipe: wipeDatabase,
    create: ensureDatabase,
    async pgRestore(targetUrl, dump, env) {
      const r = await runPg(pgToolPath('pg_restore', env), ['--clean', '--if-exists', '--no-owner', '-d', pgEnv(targetUrl).PGDATABASE!, dump], pgEnv(targetUrl));
      return { code: r.code, stderr: r.stderr };
    },
    unzip: unzipTo,
    async counts(targetUrl) {
      const sql = postgres(targetUrl, { max: 1, onnotice: () => {} });
      try {
        return await tableCounts(sql);
      } finally {
        await sql.end();
      }
    },
  };
}

export interface RestoreOptions {
  folder: string;
  into?: string;
  /** Owner URL of any database on the server (cs_dev for the CLI, cs_test for the round-trip test). */
  maintenanceUrl: string;
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  prompt: (question: string) => Promise<string>;
  log?: (line: string) => void;
  deps?: Partial<RestoreDeps>;
}

/** Spec 6.2. Every check runs before anything destructive (Review Focus 5). */
export async function restoreSnapshot(o: RestoreOptions): Promise<{ target: string; differences: string[]; restoreErrors: boolean; previous?: { snapshot: string; evidenceAside: string } }> {
  const d = { ...realRestoreDeps(), ...o.deps };
  const env = o.env ?? process.env;
  const log = o.log ?? console.log;
  const now = o.now ?? new Date();
  const stamp = stampOf(now);
  // 1. the snapshot folder and its manifest.
  const manifest = parseManifest(JSON.parse(await readFile(join(o.folder, 'manifest.json'), 'utf8')));
  const dump = join(o.folder, 'db.dump');
  const evidenceZip = join(o.folder, 'evidence.zip');
  await stat(dump);
  await stat(evidenceZip);
  // 2. the target name.
  const target = restoreTargetName(o.into, now);
  const targetUrl = withDatabase(o.maintenanceUrl, target);
  // 3. client tool versions (pg_dump only matters when a pre-restore snapshot is needed).
  const overwrite = await d.exists(o.maintenanceUrl, target);
  await d.versions(o.maintenanceUrl, env, overwrite);

  const known: Record<string, 'dev' | 'demo'> = { cs_dev: 'dev', cs_demo: 'demo' };
  const envName = known[target];
  const evidenceDir = envName ? resolveEnvironment(envName, { repoRoot: o.repoRoot, env }).evidenceDir : join(o.repoRoot, 'apps', 'worker', `.evidence-restore-${stamp}`);

  let previous: { snapshot: string; evidenceAside: string } | undefined;
  // Final-review I2: what has happened so far, so a failure message tells the truth about the database and evidence.
  let snapshotFolder: string | undefined;
  let movedAside: string | undefined;
  let changed = false;
  const aside = `${evidenceDir}-aside-${stamp}`;
  const moveEvidenceAside = async () => {
    await d.moveAside(evidenceDir, aside);
    movedAside = aside;
    log(`[restore] existing evidence (if any) moved to ${aside}`);
  };
  const evidenceNote = () => (movedAside ? `The previous evidence is in ${movedAside}.` : `The existing evidence was not moved (still in ${evidenceDir}).`);
  const lost = () =>
    [
      snapshotFolder ? `Your previous data is in ${snapshotFolder}.` : '',
      movedAside ? `The previous evidence is in ${movedAside}.` : '',
      snapshotFolder ? `Restore it with: pnpm db:restore ${snapshotFolder} --into ${target}` : '',
    ].filter(Boolean).join(' ');
  let r: { code: number; stderr: string };
  let differences: string[];
  try {
    if (overwrite) {
      // 4. typed confirmation, still before anything changes.
      confirmOverwrite(target, await o.prompt(`${target} already exists and will be overwritten. Type its name to continue: `));
      // 5-7. snapshot, move evidence aside, wipe.
      log(`[restore] taking a fresh snapshot of ${target} first...`);
      const snap = await d.snapshot({ ownerUrl: targetUrl, expected: target, evidenceDir, backupsDir: join(o.repoRoot, 'backups'), now, env, label: 'pre-restore', log });
      snapshotFolder = snap.folder;
      previous = { snapshot: snap.folder, evidenceAside: aside };
      log(`[restore] previous data saved to ${snap.folder}`);
      await moveEvidenceAside();
      changed = true;
      await d.wipe(targetUrl, target);
    } else {
      // Final-review M3: never unzip over evidence that is already there (a dropped database's leftovers).
      if (await d.hasFiles(evidenceDir)) await moveEvidenceAside();
      const roles = [env.APP_DATABASE_URL, env.SERVICE_DATABASE_URL].filter((u): u is string => !!u).map(roleOf);
      log(`[restore] creating ${target}...`);
      changed = true;
      await d.create(o.maintenanceUrl, target, roles);
    }

    // 8. restore.
    log(`[restore] restoring ${manifest.sourceDatabase} (${manifest.createdAt}) into ${target}...`);
    r = await d.pgRestore(targetUrl, dump, env);
    if (r.code !== 0) log(`[restore] pg_restore reported problems:
${redactPgOutput(r.stderr.trim())}`);
    const files = await d.unzip(evidenceZip, evidenceDir);
    log(`[restore] ${files} evidence files written to ${evidenceDir}`);
    differences = compareCounts(manifest.tables, await d.counts(targetUrl));
  } catch (e) {
    const message = redactPgOutput(e instanceof Error ? e.message : String(e));
    // Nothing was done yet (a refused confirmation, a failed snapshot): the original error says it all.
    if (!snapshotFolder && !movedAside) throw e;
    if (!changed) {
      throw new Error(`Restore failed before ${target} was changed: ${message}. Nothing was changed in the database.${snapshotFolder ? ` A fresh snapshot of it is in ${snapshotFolder}.` : ''} ${evidenceNote()}`);
    }
    throw new Error(`Restore failed after the target was changed: ${message}. ${lost()}`);
  }
  log(differences.length ? `[restore] row counts differ:\n  ${differences.join('\n  ')}` : '[restore] row counts match the manifest');
  return { target, differences, restoreErrors: r.code !== 0, ...(previous ? { previous } : {}) };
}
