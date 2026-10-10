import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type postgres from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SnapshotDeps, takeSnapshot } from './snapshot';

const URL_ = 'postgresql://owner:pw@ep-x.neon.tech/cs_dev';
const NOW = new Date('2026-10-09T14:03:22.000Z');
const FOLDER = '20261009-140322-cs_dev';

let root: string;
let backups: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'snap-'));
  backups = join(root, 'backups');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function fake(over: Partial<SnapshotDeps> = {}): SnapshotDeps & { calls: string[] } {
  const calls: string[] = [];
  const deps: SnapshotDeps = {
    connect: () => ({ end: async () => {} }) as unknown as postgres.Sql,
    serverMajor: async () => ({ major: 18, version: '18.1' }),
    clientMajor: async () => 18,
    runPg: async (_bin, args) => {
      calls.push('dump');
      writeFileSync(args[args.indexOf('-f') + 1]!, 'dump');
      return { code: 0, stdout: '', stderr: '' };
    },
    lastMigration: async () => '0001_x',
    tableCounts: async () => ({ 'public.a': 1 }),
    ...over,
  };
  return Object.assign(deps, { calls });
}

const opts = (deps: SnapshotDeps) => ({ ownerUrl: URL_, expected: 'cs_dev', evidenceDir: join(root, 'ev'), backupsDir: backups, now: NOW, deps });

describe('takeSnapshot (Review Focus 5)', () => {
  it('writes db.dump, evidence.zip and manifest.json on the happy path', async () => {
    const r = await takeSnapshot(opts(fake()));
    expect(readdirSync(r.folder).sort()).toEqual(['db.dump', 'evidence.zip', 'manifest.json']);
  });

  it('fails the version check before any folder is created', async () => {
    const deps = fake({ clientMajor: async () => 17 });
    await expect(takeSnapshot(opts(deps))).rejects.toThrow(/pg_dump 17 is older than the server \(PostgreSQL 18\)/);
    expect(existsSync(backups)).toBe(false);
    expect(deps.calls).toEqual([]);
  });

  it('removes only its own folder when a later step fails', async () => {
    mkdirSync(join(backups, 'earlier-good'), { recursive: true });
    writeFileSync(join(backups, 'earlier-good', 'manifest.json'), '{}');
    const deps = fake({ tableCounts: async () => { throw new Error('boom'); } });
    await expect(takeSnapshot(opts(deps))).rejects.toThrow('boom');
    expect(readdirSync(backups)).toEqual(['earlier-good']);
    expect(existsSync(join(backups, 'earlier-good', 'manifest.json'))).toBe(true);
  });

  it('refuses a colliding folder and leaves it intact', async () => {
    mkdirSync(join(backups, FOLDER), { recursive: true });
    writeFileSync(join(backups, FOLDER, 'db.dump'), 'good');
    const deps = fake({ lastMigration: async () => { throw new Error('should not get here'); } });
    await expect(takeSnapshot(opts(deps))).rejects.toThrow(/already exists/);
    expect(readdirSync(join(backups, FOLDER))).toEqual(['db.dump']);
    expect(deps.calls).toEqual([]);
  });
});

describe('takeSnapshot warnings (final-review M2)', () => {
  const run = async (env: NodeJS.ProcessEnv, makeDir: boolean) => {
    if (makeDir) mkdirSync(join(root, 'ev'), { recursive: true });
    const lines: string[] = [];
    await takeSnapshot({ ...opts(fake()), env, log: (l) => lines.push(l) });
    return lines.filter((l) => l.includes('warning'));
  };

  it('warns, without failing, when the evidence directory is missing', async () => {
    const warnings = await run({}, false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(join(root, 'ev'));
    expect(warnings[0]).toMatch(/does not exist/);
  });

  it('warns that evidence may be in R2 when R2_* is set, naming the variables but never their values', async () => {
    const warnings = await run({ R2_ACCOUNT_ID: 'acct-secret-value', R2_BUCKET: 'bucket-secret-value', R2_EMPTY: '' }, true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('R2_ACCOUNT_ID');
    expect(warnings[0]).toContain('R2_BUCKET');
    expect(warnings[0]).not.toContain('R2_EMPTY');
    expect(warnings[0]).not.toContain('secret-value');
  });

  it('prints no warning for an existing evidence directory and no R2 configuration', async () => {
    expect(await run({}, true)).toEqual([]);
  });
});
