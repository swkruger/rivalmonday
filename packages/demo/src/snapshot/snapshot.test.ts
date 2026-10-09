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
