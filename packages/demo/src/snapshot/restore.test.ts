import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotManifest } from './manifest';
import { confirmOverwrite, parseRestoreArgs, type RestoreDeps, restoreSnapshot, restoreTargetName } from './restore';

const NOW = new Date('2026-10-09T14:03:22Z');
const manifest: SnapshotManifest = { version: 1, createdAt: NOW.toISOString(), sourceDatabase: 'cs_dev', serverVersion: '18.6', lastMigration: null, tables: { 'public.agency': 1 }, evidence: { files: 0, bytes: 0 } };
const ENV = { DATABASE_URL: 'postgresql://o:p@h.example/cs_dev', APP_DATABASE_URL: 'postgresql://a:p@h.example/cs_dev', SERVICE_DATABASE_URL: 'postgresql://s:p@h.example/cs_dev' } as unknown as NodeJS.ProcessEnv;
let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'restore-'));
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(folder, 'db.dump'), 'x');
  writeFileSync(join(folder, 'evidence.zip'), 'x');
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

function fakeDeps(exists: boolean): { deps: RestoreDeps; calls: string[] } {
  const calls: string[] = [];
  const step = (name: string) => vi.fn(async () => { calls.push(name); });
  return {
    calls,
    deps: {
      exists: vi.fn(async () => exists),
      versions: step('versions'),
      snapshot: vi.fn(async () => { calls.push('snapshot'); return { folder: 'backups/20261009-140322-cs_dev-pre-restore' }; }),
      hasFiles: vi.fn(async () => false),
      moveAside: step('moveAside'),
      wipe: step('wipe'),
      create: step('create'),
      pgRestore: vi.fn(async () => { calls.push('pgRestore'); return { code: 0, stderr: '' }; }),
      unzip: vi.fn(async () => { calls.push('unzip'); return 0; }),
      counts: vi.fn(async () => ({ 'public.agency': 1 })),
    },
  };
}

const base = () => ({ folder, maintenanceUrl: ENV.DATABASE_URL!, repoRoot: folder, env: ENV, now: NOW, log: () => {} });

describe('restore target (spec 6.2)', () => {
  it('defaults to a new cs_dev_restore_<timestamp> database', () => {
    expect(restoreTargetName(undefined, NOW)).toBe('cs_dev_restore_20261009_140322');
  });

  it('never restores into cs_test or any *_test database', () => {
    expect(() => restoreTargetName('cs_test', NOW)).toThrow(/never a restore target/);
    expect(() => restoreTargetName('other_test', NOW)).toThrow(/never a restore target/);
  });

  it('parses the folder and --into', () => {
    expect(parseRestoreArgs(['backups/x', '--into', 'cs_dev'])).toEqual({ folder: 'backups/x', into: 'cs_dev' });
    expect(parseRestoreArgs(['backups/x'])).toEqual({ folder: 'backups/x' });
    expect(() => parseRestoreArgs([])).toThrow(/Usage/);
  });
});

describe('restoreSnapshot (Review Focus 5)', () => {
  it('refuses cs_test before touching anything', async () => {
    const { deps, calls } = fakeDeps(true);
    await expect(restoreSnapshot({ ...base(), into: 'cs_test', prompt: async () => 'cs_test', deps })).rejects.toThrow(/never a restore target/);
    expect(calls).toEqual([]);
  });

  it('refuses to overwrite without a matching typed name, and changes nothing', async () => {
    const { deps, calls } = fakeDeps(true);
    await expect(restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_de', deps })).rejects.toThrow(/does not match/);
    expect(calls).toEqual(['versions']);
    expect(() => confirmOverwrite('cs_dev', ' cs_dev ')).not.toThrow();
  });

  it('stops on old client tools before the prompt, snapshot, move-aside or wipe', async () => {
    const { deps, calls } = fakeDeps(true);
    deps.versions = vi.fn(async () => { calls.push('versions'); throw new Error('pg_dump 17 is older than the server (PostgreSQL 18).'); });
    const prompt = vi.fn(async () => 'cs_dev');
    await expect(restoreSnapshot({ ...base(), into: 'cs_dev', prompt, deps })).rejects.toThrow(/older than the server/);
    expect(calls).toEqual(['versions']);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('refuses a missing dump or an invalid manifest before any check or change', async () => {
    const { deps, calls } = fakeDeps(true);
    rmSync(join(folder, 'db.dump'));
    await expect(restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps })).rejects.toThrow();
    writeFileSync(join(folder, 'db.dump'), 'x');
    writeFileSync(join(folder, 'manifest.json'), '{"version":2}');
    await expect(restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('overwrites only after a fresh snapshot and moving evidence aside, in that order', async () => {
    const { deps, calls } = fakeDeps(true);
    const r = await restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps });
    expect(calls).toEqual(['versions', 'snapshot', 'moveAside', 'wipe', 'pgRestore', 'unzip']);
    expect(r).toEqual({ target: 'cs_dev', differences: [], restoreErrors: false, previous: { snapshot: 'backups/20261009-140322-cs_dev-pre-restore', evidenceAside: expect.stringContaining('-aside-20261009-140322') } });
  });

  it('labels the pre-restore snapshot so its folder never collides with another snapshot', async () => {
    const { deps } = fakeDeps(true);
    await restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps });
    expect(deps.snapshot).toHaveBeenCalledWith(expect.objectContaining({ label: 'pre-restore', expected: 'cs_dev' }));
  });

  it('creates a new database by default, with no prompt and no snapshot', async () => {
    const { deps, calls } = fakeDeps(false);
    const prompt = vi.fn(async () => '');
    const r = await restoreSnapshot({ ...base(), prompt, deps });
    expect(r.target).toBe('cs_dev_restore_20261009_140322');
    expect(calls).toEqual(['versions', 'create', 'pgRestore', 'unzip']);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('reports row-count differences', async () => {
    const { deps } = fakeDeps(false);
    deps.counts = vi.fn(async () => ({ 'public.agency': 0 }));
    expect((await restoreSnapshot({ ...base(), prompt: async () => '', deps })).differences).toEqual(['public.agency: expected 1, got 0']);
  });

  it('names the snapshot and the evidence aside when the wipe fails', async () => {
    const { deps } = fakeDeps(true);
    deps.wipe = vi.fn(async () => { throw new Error('boom'); });
    const err = await restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps }).catch((e: Error) => e.message);
    expect(err).toContain('Restore failed after the target was changed');
    expect(err).toContain('backups/20261009-140322-cs_dev-pre-restore');
    expect(err).toContain('-aside-20261009-140322');
  });

  it('says nothing was changed when moving the evidence aside fails (final-review I2)', async () => {
    const { deps, calls } = fakeDeps(true);
    deps.moveAside = vi.fn(async () => { throw new Error('EBUSY: resource busy'); });
    const err = await restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps }).catch((e: Error) => e.message);
    expect(err).not.toContain('after the target was changed');
    expect(err).toContain('Nothing was changed in the database');
    expect(err).toContain('EBUSY');
    expect(err).toContain('backups/20261009-140322-cs_dev-pre-restore');
    expect(err).toMatch(/evidence was not moved/);
    expect(calls).not.toContain('wipe');
  });

  it('moves a non-empty evidence directory aside before creating a new database (final-review M3)', async () => {
    const { deps, calls } = fakeDeps(false);
    deps.hasFiles = vi.fn(async () => true);
    const logs: string[] = [];
    await restoreSnapshot({ ...base(), log: (l) => logs.push(l), prompt: async () => '', deps });
    expect(calls).toEqual(['versions', 'moveAside', 'create', 'pgRestore', 'unzip']);
    const [dir, to] = vi.mocked(deps.moveAside).mock.calls[0]!;
    expect(to).toBe(`${dir}-aside-20261009-140322`);
    expect(logs.join('\n')).toContain(`existing evidence (if any) moved to ${to}`);
  });

  it('names the moved-aside evidence when a create-path restore fails afterwards (final-review M3)', async () => {
    const { deps } = fakeDeps(false);
    deps.hasFiles = vi.fn(async () => true);
    deps.pgRestore = vi.fn(async () => { throw new Error('boom'); });
    const err = await restoreSnapshot({ ...base(), prompt: async () => '', deps }).catch((e: Error) => e.message);
    expect(err).toContain('Restore failed after the target was changed');
    expect(err).toContain('-aside-20261009-140322');
  });

  it('names both locations when pg_restore throws', async () => {
    const { deps } = fakeDeps(true);
    deps.pgRestore = vi.fn(async () => { throw new Error('boom'); });
    const err = await restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps }).catch((e: Error) => e.message);
    expect(err).toContain('backups/20261009-140322-cs_dev-pre-restore');
    expect(err).toContain('-aside-20261009-140322');
  });

  it('returns both locations when pg_restore exits non-zero', async () => {
    const { deps } = fakeDeps(true);
    deps.pgRestore = vi.fn(async () => ({ code: 1, stderr: 'some error' }));
    const r = await restoreSnapshot({ ...base(), into: 'cs_dev', prompt: async () => 'cs_dev', deps });
    expect(r.restoreErrors).toBe(true);
    expect(r.previous?.snapshot).toContain('pre-restore');
    expect(r.previous?.evidenceAside).toContain('-aside-');
  });
});
